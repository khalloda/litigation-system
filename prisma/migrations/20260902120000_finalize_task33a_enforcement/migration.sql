-- Forward-only final correction of the Task 3.3A enforcement inventory.
--
-- D35 requires the real migration connection principal to be a superuser.
-- This is checked before the web runtime is made unavailable or any other
-- deployment state is changed.
--
-- NOLOGIN and removal of the direct CONNECT grant are committed before
-- validation. Every catalog condition is then asserted without revoking or
-- repairing an unexpected ACL,
-- membership or parameter grant. A failed assertion therefore leaves the web
-- principal safely unavailable for owner review.

DO $MIGRATION_PRINCIPAL$
DECLARE
    session_superuser boolean;
    effective_superuser boolean;
BEGIN
    SELECT rolsuper INTO session_superuser
      FROM pg_roles
     WHERE rolname=session_user;
    SELECT rolsuper INTO effective_superuser
      FROM pg_roles
     WHERE rolname=current_user;
    IF session_user IS DISTINCT FROM current_user
       OR session_superuser IS DISTINCT FROM true
       OR effective_superuser IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'migration 56 requires a direct superuser migration session';
    END IF;
END
$MIGRATION_PRINCIPAL$;

BEGIN;

DO $FAIL_CLOSED$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='litigation_runtime') THEN
        RAISE EXCEPTION 'litigation_runtime is absent';
    END IF;
    ALTER ROLE litigation_runtime NOLOGIN;
    EXECUTE format(
        'REVOKE CONNECT ON DATABASE %I FROM litigation_runtime',
        current_database()
    );
END
$FAIL_CLOSED$;

COMMIT;

DO $TERMINATE_RUNTIME$
BEGIN
    PERFORM pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE usename='litigation_runtime'
       AND datname=current_database()
       AND pid<>pg_backend_pid();
END
$TERMINATE_RUNTIME$;

BEGIN;

DO $RUNTIME_BOUNDARY$
DECLARE
    project_schemas constant text[] := ARRAY['_migration','public','quarantine','staging'];
    approved_tables constant text[] := ARRAY[
        'admin_tasks','attendance','client_logos','clients','contacts','documents',
        'fee_letter_matters','fee_letters','hearing_attendees','hearings',
        'invoice_allocations','invoices','lookup_client_branch','lookup_court',
        'lookup_degree','lookup_hearing_action','lookup_importance',
        'lookup_invoice_status','lookup_invoice_type','lookup_lawyer_share_role',
        'lookup_matter_category','lookup_matter_destination','lookup_matter_type',
        'lookup_party_role','lookup_team','lookup_venue',
        'matter_fee_letter_references','matter_lawyers','matter_parties',
        'matter_party_roles','matters','payments','people','person_name_alias',
        'power_of_attorney_lawyers','powers_of_attorney','task_actions','user_accounts'
    ];
    approved_definers constant regprocedure[] := ARRAY[
        'public.audit_current_actor_id()'::regprocedure,
        'public.audit_set_authentication_context()'::regprocedure,
        'public.audit_set_human_context(integer)'::regprocedure
    ];
    runtime_oid oid;
    project_owner_oid oid;
    expected_sequences oid[] := ARRAY[]::oid[];
    audited_table text;
    sequence_name text;
    relation_row record;
    sequence_row record;
    function_row record;
    approved boolean;
    direct_privileges text[];
    expected_privileges text[];
BEGIN
    SELECT oid INTO runtime_oid
      FROM pg_roles
     WHERE rolname='litigation_runtime'
       AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
       AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls
       AND NOT rolcanlogin;
    IF runtime_oid IS NULL THEN
        RAISE EXCEPTION 'litigation_runtime attributes are unsafe during preflight';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member=runtime_oid) THEN
        RAISE EXCEPTION 'litigation_runtime has an outbound membership';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid=runtime_oid) THEN
        RAISE EXCEPTION 'litigation_runtime has an explicit inbound membership';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_roles
         WHERE oid<>runtime_oid AND pg_has_role(runtime_oid,oid,'SET')
    ) THEN
        RAISE EXCEPTION 'litigation_runtime can SET ROLE to another role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_roles
         WHERE oid<>runtime_oid AND NOT rolsuper
           AND (pg_has_role(oid,runtime_oid,'USAGE') OR pg_has_role(oid,runtime_oid,'SET'))
    ) THEN
        RAISE EXCEPTION 'a non-superuser role can inherit or assume litigation_runtime';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_roles
         WHERE oid=runtime_oid AND coalesce(cardinality(rolconfig),0)<>0
    ) OR EXISTS (
        SELECT 1 FROM pg_db_role_setting WHERE setrole=runtime_oid
    ) THEN
        RAISE EXCEPTION 'litigation_runtime has unsafe stored role/database settings';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_database WHERE datdba=runtime_oid)
       OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner=runtime_oid)
       OR EXISTS (SELECT 1 FROM pg_class WHERE relowner=runtime_oid)
       OR EXISTS (SELECT 1 FROM pg_proc WHERE proowner=runtime_oid) THEN
        RAISE EXCEPTION 'litigation_runtime owns a database, schema, relation or function';
    END IF;

    IF has_database_privilege(runtime_oid,current_database(),'CREATE')
       OR has_database_privilege(runtime_oid,current_database(),'TEMPORARY') THEN
        RAISE EXCEPTION 'litigation_runtime has CREATE or TEMPORARY database access';
    END IF;
    IF (
        SELECT array_agg(nspname::text ORDER BY nspname::text)
          FROM pg_namespace
         WHERE left(nspname,3)<>'pg_' AND nspname<>'information_schema'
    ) IS DISTINCT FROM project_schemas THEN
        RAISE EXCEPTION 'project schema inventory differs';
    END IF;
    FOR relation_row IN
        SELECT nspname schema_name,oid
          FROM pg_namespace
         WHERE nspname=ANY(project_schemas)
         ORDER BY nspname
    LOOP
        approved := relation_row.schema_name='public';
        IF has_schema_privilege(runtime_oid,relation_row.oid,'USAGE') IS DISTINCT FROM approved
           OR has_schema_privilege(runtime_oid,relation_row.oid,'CREATE') THEN
            RAISE EXCEPTION 'litigation_runtime schema boundary differs on %',
                relation_row.schema_name;
        END IF;
    END LOOP;

    IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind IN ('r','p')
           AND c.relname=ANY(approved_tables))<>cardinality(approved_tables) THEN
        RAISE EXCEPTION 'approved runtime relation inventory differs';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
               LATERAL aclexplode(c.relacl) acl
         WHERE n.nspname=ANY(project_schemas) AND c.relkind IN ('r','p','v','m','f')
           AND acl.grantee<>c.relowner AND acl.grantee<>runtime_oid
    ) THEN
        RAISE EXCEPTION 'a project relation has a PUBLIC or unapproved-grantee ACL';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
               LATERAL aclexplode(c.relacl) acl
         WHERE n.nspname=ANY(project_schemas) AND c.relkind IN ('r','p','v','m','f')
           AND acl.grantee=runtime_oid
           AND (acl.grantor<>c.relowner OR acl.is_grantable
             OR n.nspname<>'public' OR NOT c.relname=ANY(approved_tables)
             OR acl.privilege_type NOT IN ('SELECT','INSERT','UPDATE'))
    ) THEN
        RAISE EXCEPTION 'direct litigation_runtime relation ACL provenance differs';
    END IF;
    FOR relation_row IN
        SELECT n.nspname schema_name,c.relname relation_name,c.oid
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname=ANY(project_schemas) AND c.relkind IN ('r','p','v','m','f')
         ORDER BY n.nspname,c.relname
    LOOP
        approved := relation_row.schema_name='public'
                    AND relation_row.relation_name=ANY(approved_tables);
        IF has_table_privilege(runtime_oid,relation_row.oid,'SELECT') IS DISTINCT FROM approved
           OR has_table_privilege(runtime_oid,relation_row.oid,'INSERT') IS DISTINCT FROM approved
           OR has_table_privilege(runtime_oid,relation_row.oid,'UPDATE') IS DISTINCT FROM approved
           OR has_table_privilege(runtime_oid,relation_row.oid,'DELETE')
           OR has_table_privilege(runtime_oid,relation_row.oid,'TRUNCATE')
           OR has_table_privilege(runtime_oid,relation_row.oid,'REFERENCES')
           OR has_table_privilege(runtime_oid,relation_row.oid,'TRIGGER')
           OR has_table_privilege(runtime_oid,relation_row.oid,'MAINTAIN') THEN
            RAISE EXCEPTION 'litigation_runtime effective relation access differs on %.%',
                relation_row.schema_name,relation_row.relation_name;
        END IF;
        SELECT array_agg(acl.privilege_type ORDER BY acl.privilege_type)
          INTO direct_privileges
          FROM pg_class c, LATERAL aclexplode(c.relacl) acl
         WHERE c.oid=relation_row.oid AND acl.grantee=runtime_oid;
        expected_privileges := CASE WHEN approved
            THEN ARRAY['INSERT','SELECT','UPDATE']::text[] ELSE NULL::text[] END;
        IF direct_privileges IS DISTINCT FROM expected_privileges THEN
            RAISE EXCEPTION 'direct litigation_runtime relation ACL differs on %.%',
                relation_row.schema_name,relation_row.relation_name;
        END IF;
        IF has_any_column_privilege(runtime_oid,relation_row.oid,'SELECT')
              IS DISTINCT FROM approved
           OR has_any_column_privilege(runtime_oid,relation_row.oid,'INSERT')
              IS DISTINCT FROM approved
           OR has_any_column_privilege(runtime_oid,relation_row.oid,'UPDATE')
              IS DISTINCT FROM approved
           OR has_any_column_privilege(runtime_oid,relation_row.oid,'REFERENCES') THEN
            RAISE EXCEPTION 'litigation_runtime effective column access differs on %.%',
                relation_row.schema_name,relation_row.relation_name;
        END IF;
    END LOOP;
    IF EXISTS (
        SELECT 1
          FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace,
          LATERAL aclexplode(a.attacl) acl
         WHERE n.nspname=ANY(project_schemas) AND a.attnum>0 AND NOT a.attisdropped
           AND acl.grantee<>c.relowner
    ) THEN
        RAISE EXCEPTION 'a project column has a PUBLIC, runtime or unapproved-grantee ACL';
    END IF;

    FOREACH audited_table IN ARRAY approved_tables LOOP
        sequence_name := pg_get_serial_sequence(format('public.%I',audited_table),'id');
        IF sequence_name IS NOT NULL THEN
            expected_sequences := array_append(expected_sequences,sequence_name::regclass::oid);
        END IF;
    END LOOP;
    IF EXISTS (
        SELECT 1
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
               LATERAL aclexplode(c.relacl) acl
         WHERE n.nspname=ANY(project_schemas) AND c.relkind='S'
           AND acl.grantee<>c.relowner AND acl.grantee<>runtime_oid
    ) THEN
        RAISE EXCEPTION 'a project sequence has a PUBLIC or unapproved-grantee ACL';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
               LATERAL aclexplode(c.relacl) acl
         WHERE n.nspname=ANY(project_schemas) AND c.relkind='S'
           AND acl.grantee=runtime_oid
           AND (acl.grantor<>c.relowner OR acl.is_grantable
             OR NOT c.oid=ANY(expected_sequences)
             OR acl.privilege_type NOT IN ('USAGE','SELECT'))
    ) THEN
        RAISE EXCEPTION 'direct litigation_runtime sequence ACL provenance differs';
    END IF;
    FOR sequence_row IN
        SELECT n.nspname schema_name,c.relname sequence_name,c.oid
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname=ANY(project_schemas) AND c.relkind='S'
         ORDER BY n.nspname,c.relname
    LOOP
        approved := sequence_row.oid=ANY(expected_sequences);
        IF has_sequence_privilege(runtime_oid,sequence_row.oid,'USAGE')
              IS DISTINCT FROM approved
           OR has_sequence_privilege(runtime_oid,sequence_row.oid,'SELECT')
              IS DISTINCT FROM approved
           OR has_sequence_privilege(runtime_oid,sequence_row.oid,'UPDATE') THEN
            RAISE EXCEPTION 'litigation_runtime effective sequence access differs on %.%',
                sequence_row.schema_name,sequence_row.sequence_name;
        END IF;
        SELECT array_agg(acl.privilege_type ORDER BY acl.privilege_type)
          INTO direct_privileges
          FROM pg_class c, LATERAL aclexplode(c.relacl) acl
         WHERE c.oid=sequence_row.oid AND acl.grantee=runtime_oid;
        expected_privileges := CASE WHEN approved
            THEN ARRAY['SELECT','USAGE']::text[] ELSE NULL::text[] END;
        IF direct_privileges IS DISTINCT FROM expected_privileges THEN
            RAISE EXCEPTION 'direct litigation_runtime sequence ACL differs on %.%',
                sequence_row.schema_name,sequence_row.sequence_name;
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname=ANY(project_schemas) AND c.relkind='S'
           AND c.oid=ANY(expected_sequences))<>cardinality(expected_sequences) THEN
        RAISE EXCEPTION 'approved runtime sequence inventory differs';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
               LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
         WHERE n.nspname=ANY(project_schemas) AND p.prosecdef
           AND acl.grantee<>p.proowner AND acl.grantee<>runtime_oid
    ) THEN
        RAISE EXCEPTION 'a SECURITY DEFINER has a PUBLIC or unapproved-grantee ACL';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
               LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
         WHERE n.nspname=ANY(project_schemas) AND p.prosecdef
           AND acl.grantee=runtime_oid
           AND (NOT p.oid=ANY(approved_definers) OR acl.privilege_type<>'EXECUTE'
             OR acl.grantor<>p.proowner OR acl.is_grantable)
    ) THEN
        RAISE EXCEPTION 'direct litigation_runtime SECURITY DEFINER ACL provenance differs';
    END IF;
    FOR function_row IN
        SELECT p.oid,n.nspname||'.'||p.proname||'('||
               pg_get_function_identity_arguments(p.oid)||')' signature
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname=ANY(project_schemas) AND p.prosecdef
         ORDER BY signature
    LOOP
        approved := function_row.oid=ANY(approved_definers);
        IF has_function_privilege(runtime_oid,function_row.oid,'EXECUTE')
              IS DISTINCT FROM approved THEN
            RAISE EXCEPTION 'litigation_runtime SECURITY DEFINER access differs on %',
                function_row.signature;
        END IF;
        SELECT array_agg(acl.privilege_type ORDER BY acl.privilege_type)
          INTO direct_privileges
          FROM pg_proc p,
               LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
         WHERE p.oid=function_row.oid AND acl.grantee=runtime_oid;
        expected_privileges := CASE WHEN approved
            THEN ARRAY['EXECUTE']::text[] ELSE NULL::text[] END;
        IF direct_privileges IS DISTINCT FROM expected_privileges THEN
            RAISE EXCEPTION 'direct litigation_runtime SECURITY DEFINER ACL differs on %',
                function_row.signature;
        END IF;
    END LOOP;

    SELECT relowner INTO project_owner_oid FROM pg_class WHERE oid='public.people'::regclass;
    IF (SELECT count(*) FROM pg_default_acl d
         WHERE d.defaclrole=project_owner_oid AND d.defaclobjtype='f'
           AND d.defaclnamespace=0)<>1
       OR (SELECT count(*) FROM pg_default_acl d,
                  LATERAL aclexplode(d.defaclacl) acl
            WHERE d.defaclrole=project_owner_oid AND d.defaclobjtype='f'
              AND d.defaclnamespace=0 AND acl.grantee=project_owner_oid
              AND acl.privilege_type='EXECUTE')<>1
       OR (SELECT count(*) FROM pg_default_acl d,
                  LATERAL aclexplode(d.defaclacl) acl
            WHERE d.defaclrole=project_owner_oid AND d.defaclobjtype='f'
              AND d.defaclnamespace=0)<>1
       OR EXISTS (
           SELECT 1 FROM pg_default_acl d
            WHERE d.defaclrole=project_owner_oid AND d.defaclobjtype='f'
              AND d.defaclnamespace=ANY(ARRAY[
                  '_migration'::regnamespace,'public'::regnamespace,
                  'quarantine'::regnamespace,'staging'::regnamespace
              ])
       ) THEN
        RAISE EXCEPTION 'project-owner default function privileges are unsafe';
    END IF;

    IF has_parameter_privilege(runtime_oid,'session_replication_role','SET')
       OR has_parameter_privilege(runtime_oid,'session_replication_role','ALTER SYSTEM') THEN
        RAISE EXCEPTION 'litigation_runtime can change session_replication_role';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_parameter_acl p,
               LATERAL aclexplode(p.paracl) acl
          LEFT JOIN pg_roles grantee ON grantee.oid=acl.grantee
         WHERE p.parname='session_replication_role'
           AND (acl.grantee=0 OR NOT coalesce(grantee.rolsuper,false))
    ) THEN
        RAISE EXCEPTION 'session_replication_role has a PUBLIC or non-superuser ACL';
    END IF;
END
$RUNTIME_BOUNDARY$;

-- Capability probe: catalog checks are permanent, but this proves PostgreSQL
-- itself refuses the trigger-disabling setting under the runtime identity.
DO $PARAMETER_REFUSAL$
BEGIN
    EXECUTE 'SET LOCAL ROLE litigation_runtime';
    BEGIN
        PERFORM set_config('session_replication_role','replica',true);
        RAISE EXCEPTION 'litigation_runtime unexpectedly changed session_replication_role';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    EXECUTE 'RESET ROLE';
    IF current_setting('session_replication_role')<>'origin' THEN
        RAISE EXCEPTION 'session_replication_role did not remain origin';
    END IF;
END
$PARAMETER_REFUSAL$;

ALTER ROLE litigation_runtime LOGIN;
DO $RESTORE_CONNECT$
BEGIN
    EXECUTE format(
        'GRANT CONNECT ON DATABASE %I TO litigation_runtime',
        current_database()
    );
END
$RESTORE_CONNECT$;

DO $POSTCONDITION$
DECLARE
    runtime_oid oid;
BEGIN
    SELECT oid INTO runtime_oid FROM pg_roles
     WHERE rolname='litigation_runtime' AND rolcanlogin
       AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
       AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls
       AND coalesce(cardinality(rolconfig),0)=0;
    IF runtime_oid IS NULL
       OR NOT has_database_privilege(runtime_oid,current_database(),'CONNECT')
       OR EXISTS (SELECT 1 FROM pg_db_role_setting WHERE setrole=runtime_oid)
       OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member=runtime_oid)
       OR EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid=runtime_oid)
       OR EXISTS (
           SELECT 1 FROM pg_roles WHERE oid<>runtime_oid AND NOT rolsuper
             AND (pg_has_role(oid,runtime_oid,'USAGE') OR pg_has_role(oid,runtime_oid,'SET'))
       )
       OR has_parameter_privilege(runtime_oid,'session_replication_role','SET')
       OR has_parameter_privilege(runtime_oid,'session_replication_role','ALTER SYSTEM') THEN
        RAISE EXCEPTION 'litigation_runtime final boundary differs';
    END IF;
END
$POSTCONDITION$;

COMMIT;

