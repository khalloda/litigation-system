-- Forward-only Task 3.3A acceptance correction.
--
-- The first transaction deliberately persists NOLOGIN before the complete
-- role graph and effective-access inventory is checked. If any later
-- assertion fails, the runtime role stays unusable; no unexpected membership,
-- ownership or grant is silently removed.

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

-- NOLOGIN is now committed. Terminate existing runtime sessions only after
-- that point so they cannot reconnect during the validation window.
DO $TERMINATE_RUNTIME$
BEGIN
    PERFORM pg_terminate_backend(pid)
      FROM pg_stat_activity
     WHERE usename='litigation_runtime'
       AND pid<>pg_backend_pid();
END
$TERMINATE_RUNTIME$;

BEGIN;

-- New project-owner routines must never inherit PostgreSQL's default PUBLIC
-- EXECUTE. A future SECURITY DEFINER gateway therefore needs an explicit,
-- reviewed grant.
ALTER DEFAULT PRIVILEGES
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $RUNTIME_BOUNDARY$
DECLARE
    approved_tables constant text[] := ARRAY[
        'admin_tasks','attendance','client_logos','clients','contacts','documents',
        'fee_letter_matters','fee_letters','hearing_attendees','hearings',
        'invoice_allocations','invoices','lookup_client_branch','lookup_court',
        'lookup_degree','lookup_hearing_action','lookup_importance',
        'lookup_invoice_status','lookup_invoice_type','lookup_lawyer_share_role',
        'lookup_matter_category','lookup_matter_destination','lookup_matter_type',
        'lookup_party_role','lookup_team','lookup_venue',
        'matter_fee_letter_references','matter_lawyers','matter_parties',
        'matter_party_roles','matters','payments','people',
        'person_name_alias','power_of_attorney_lawyers','powers_of_attorney',
        'task_actions','user_accounts'
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
    approved boolean;
BEGIN
    SELECT oid INTO runtime_oid
      FROM pg_roles
     WHERE rolname='litigation_runtime'
       AND NOT rolsuper
       AND NOT rolcreatedb
       AND NOT rolcreaterole
       AND NOT rolinherit
       AND NOT rolreplication
       AND NOT rolbypassrls
       AND NOT rolcanlogin;
    IF runtime_oid IS NULL THEN
        RAISE EXCEPTION 'litigation_runtime attributes are unsafe during preflight';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member=runtime_oid) THEN
        RAISE EXCEPTION 'litigation_runtime has a direct role membership';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_roles
         WHERE oid<>runtime_oid
           AND pg_has_role('litigation_runtime',oid,'SET')
    ) THEN
        RAISE EXCEPTION 'litigation_runtime can SET ROLE to another role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_roles
         WHERE oid=runtime_oid
           AND coalesce(cardinality(rolconfig),0)<>0
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

    IF has_database_privilege('litigation_runtime',current_database(),'CREATE')
       OR has_database_privilege('litigation_runtime',current_database(),'TEMPORARY') THEN
        RAISE EXCEPTION 'litigation_runtime has CREATE or TEMPORARY database access';
    END IF;
    IF NOT has_schema_privilege('litigation_runtime','public','USAGE')
       OR has_schema_privilege('litigation_runtime','public','CREATE')
       OR has_schema_privilege('litigation_runtime','staging','USAGE')
       OR has_schema_privilege('litigation_runtime','staging','CREATE')
       OR has_schema_privilege('litigation_runtime','quarantine','USAGE')
       OR has_schema_privilege('litigation_runtime','quarantine','CREATE') THEN
        RAISE EXCEPTION 'litigation_runtime schema boundary differs';
    END IF;

    FOR relation_row IN
        SELECT n.nspname schema_name,c.relname relation_name,c.oid
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN ('public','staging','quarantine')
           AND c.relkind IN ('r','p','v','m','f')
         ORDER BY n.nspname,c.relname
    LOOP
        approved := relation_row.schema_name='public'
                    AND relation_row.relation_name=ANY(approved_tables);
        IF has_table_privilege('litigation_runtime',relation_row.oid,'SELECT')
              IS DISTINCT FROM approved
           OR has_table_privilege('litigation_runtime',relation_row.oid,'INSERT')
              IS DISTINCT FROM approved
           OR has_table_privilege('litigation_runtime',relation_row.oid,'UPDATE')
              IS DISTINCT FROM approved
           OR has_table_privilege('litigation_runtime',relation_row.oid,'DELETE')
           OR has_table_privilege('litigation_runtime',relation_row.oid,'TRUNCATE')
           OR has_table_privilege('litigation_runtime',relation_row.oid,'REFERENCES')
           OR has_table_privilege('litigation_runtime',relation_row.oid,'TRIGGER') THEN
            RAISE EXCEPTION 'litigation_runtime effective relation access differs on %.%',
                relation_row.schema_name,relation_row.relation_name;
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind IN ('r','p')
           AND c.relname=ANY(approved_tables))<>cardinality(approved_tables) THEN
        RAISE EXCEPTION 'approved runtime relation inventory differs';
    END IF;

    FOREACH audited_table IN ARRAY approved_tables LOOP
        sequence_name := pg_get_serial_sequence(format('public.%I',audited_table),'id');
        IF sequence_name IS NOT NULL THEN
            expected_sequences := array_append(expected_sequences,sequence_name::regclass::oid);
        END IF;
    END LOOP;
    FOR sequence_row IN
        SELECT n.nspname schema_name,c.relname sequence_name,c.oid
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN ('public','staging','quarantine') AND c.relkind='S'
         ORDER BY n.nspname,c.relname
    LOOP
        approved := sequence_row.oid=ANY(expected_sequences);
        IF has_sequence_privilege('litigation_runtime',sequence_row.oid,'USAGE')
              IS DISTINCT FROM approved
           OR has_sequence_privilege('litigation_runtime',sequence_row.oid,'SELECT')
              IS DISTINCT FROM approved
           OR has_sequence_privilege('litigation_runtime',sequence_row.oid,'UPDATE') THEN
            RAISE EXCEPTION 'litigation_runtime effective sequence access differs on %.%',
                sequence_row.schema_name,sequence_row.sequence_name;
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN ('public','staging','quarantine') AND c.relkind='S'
           AND c.oid=ANY(expected_sequences))<>cardinality(expected_sequences) THEN
        RAISE EXCEPTION 'approved runtime sequence inventory differs';
    END IF;

    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname IN ('public','staging','quarantine') AND p.prosecdef
           AND has_function_privilege('litigation_runtime',p.oid,'EXECUTE'))
         <>cardinality(approved_definers)
       OR EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname IN ('public','staging','quarantine') AND p.prosecdef
              AND has_function_privilege('litigation_runtime',p.oid,'EXECUTE')
              AND NOT p.oid=ANY(approved_definers)
       ) THEN
        RAISE EXCEPTION 'litigation_runtime SECURITY DEFINER inventory differs';
    END IF;

    SELECT relowner INTO project_owner_oid FROM pg_class WHERE oid='public.people'::regclass;
    IF (SELECT count(*) FROM pg_default_acl d
         WHERE d.defaclrole=project_owner_oid AND d.defaclobjtype='f'
           AND d.defaclnamespace=0)<>1
       OR (SELECT count(*) FROM pg_default_acl d,
                  LATERAL aclexplode(d.defaclacl) a
            WHERE d.defaclrole=project_owner_oid AND d.defaclobjtype='f'
              AND d.defaclnamespace=0
              AND a.grantee=project_owner_oid
              AND a.privilege_type='EXECUTE')<>1
       OR (SELECT count(*) FROM pg_default_acl d,
                  LATERAL aclexplode(d.defaclacl) a
            WHERE d.defaclrole=project_owner_oid AND d.defaclobjtype='f'
              AND d.defaclnamespace=0)<>1
       OR EXISTS (
           SELECT 1 FROM pg_default_acl d
            WHERE d.defaclrole=project_owner_oid AND d.defaclobjtype='f'
              AND d.defaclnamespace IN (
                  'public'::regnamespace,'staging'::regnamespace,'quarantine'::regnamespace
              )
       ) THEN
        RAISE EXCEPTION 'project-owner default function privileges are unsafe';
    END IF;
END
$RUNTIME_BOUNDARY$;

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
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles
         WHERE rolname='litigation_runtime' AND rolcanlogin
           AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
           AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls
           AND coalesce(cardinality(rolconfig),0)=0
    ) OR EXISTS (
        SELECT 1 FROM pg_db_role_setting
         WHERE setrole=(SELECT oid FROM pg_roles WHERE rolname='litigation_runtime')
    ) OR EXISTS (
        SELECT 1 FROM pg_auth_members
         WHERE member=(SELECT oid FROM pg_roles WHERE rolname='litigation_runtime')
    ) THEN
        RAISE EXCEPTION 'litigation_runtime final role boundary differs';
    END IF;
END
$POSTCONDITION$;

COMMIT;
