BEGIN;

-- Task 3.3A: stable actor identities, database-maintained attribution and a
-- restricted web-runtime principal. Task 3.3B events are deliberately absent.

DO $PRECONDITION$
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
        'power_of_attorney_lawyers','powers_of_attorney','task_actions','user_accounts'
    ];
    actual_tables text[];
    audited_table text;
    row_count bigint;
    total_rows bigint := 0;
    null_actors bigint;
BEGIN
    IF to_regclass('public.audit_actors') IS NOT NULL THEN
        RAISE EXCEPTION 'Task 3.3A requires no pre-existing audit actor registry';
    END IF;

    SELECT array_agg(c.table_name::text ORDER BY c.table_name::text)
      INTO actual_tables
      FROM (
        SELECT ic.table_name
          FROM information_schema.columns ic
         WHERE ic.table_schema='public'
         GROUP BY ic.table_name
        HAVING bool_or(column_name='created_at')
           AND bool_or(column_name='created_by')
           AND bool_or(column_name='updated_at')
           AND bool_or(column_name='updated_by')
      ) c;
    IF actual_tables IS DISTINCT FROM approved_tables THEN
        RAISE EXCEPTION 'Task 3.3A 37-table boundary differs: %', actual_tables;
    END IF;

    IF (SELECT array_agg(column_name::text ORDER BY ordinal_position)
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='person_name_alias')
       IS DISTINCT FROM ARRAY[
           'id','person_id','alias_ar','is_primary','created_at','alias_ar_normalised'
       ]::text[] THEN
        RAISE EXCEPTION 'Task 3.3A person_name_alias starting shape differs';
    END IF;

    FOREACH audited_table IN ARRAY approved_tables LOOP
        EXECUTE format(
            'SELECT count(*), count(*) FILTER (WHERE created_by IS NULL) + '
            'count(*) FILTER (WHERE updated_by IS NULL) FROM public.%I', audited_table
        ) INTO row_count, null_actors;
        total_rows := total_rows + row_count;
        IF null_actors <> row_count * 2 THEN
            RAISE EXCEPTION 'Task 3.3A %.actor baseline is not wholly NULL', audited_table;
        END IF;
        IF (SELECT pg_get_userbyid(c.relowner)
              FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname=audited_table)
           IS DISTINCT FROM current_user THEN
            RAISE EXCEPTION 'Task 3.3A migration principal does not own public.%', audited_table;
        END IF;
    END LOOP;
    IF total_rows NOT IN (45113,597) THEN
        RAISE EXCEPTION 'Task 3.3A expected the historical-live or clean-replay row profile, found %', total_rows;
    END IF;
    IF (SELECT count(*) FROM public.person_name_alias) <> 350
       OR (SELECT count(*) FROM public.person_name_alias a
             JOIN public.people p ON p.id=a.person_id
            WHERE NOT p.is_application_native) <> 348
       OR (SELECT count(*) FROM public.person_name_alias a
             JOIN public.people p ON p.id=a.person_id
            WHERE p.is_application_native) <> 2 THEN
        RAISE EXCEPTION 'Task 3.3A 348/350 alias proof differs';
    END IF;
    IF (SELECT count(*) FROM public.user_accounts) <> 4 THEN
        RAISE EXCEPTION 'Task 3.3A expected four current user accounts';
    END IF;
    IF NOT (
        ((SELECT count(*) FROM public.invoices)=543
         AND (SELECT count(*) FROM public.payments)=597
         AND (SELECT count(*) FROM public.invoice_allocations)=47
         AND (SELECT count(*) FROM public.attendance)=4022)
        OR
        ((SELECT count(*) FROM public.invoices)=0
         AND (SELECT count(*) FROM public.payments)=0
         AND (SELECT count(*) FROM public.invoice_allocations)=0
         AND (SELECT count(*) FROM public.attendance)=0)
    ) THEN
        RAISE EXCEPTION 'Task 3.3A protected historical-live/clean-replay profile differs';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class r ON r.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=r.relnamespace
        WHERE n.nspname='public' AND c.contype='f'
          AND EXISTS (
              SELECT 1 FROM unnest(c.conkey) k(attnum)
              JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
              WHERE a.attname IN ('created_by','updated_by')
          )
    ) THEN
        RAISE EXCEPTION 'Task 3.3A requires no pre-existing actor foreign keys';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreaterole)
    ) THEN
        RAISE EXCEPTION 'Task 3.3A migration principal must be able to create the restricted runtime role';
    END IF;
END
$PRECONDITION$;

CREATE TABLE public.audit_actors (
    id integer GENERATED BY DEFAULT AS IDENTITY,
    actor_key text NOT NULL,
    actor_kind text NOT NULL,
    user_account_id integer,
    identity_label text NOT NULL,
    purpose text NOT NULL,
    registered_at timestamptz(6) NOT NULL DEFAULT current_timestamp,
    CONSTRAINT audit_actors_pkey PRIMARY KEY (id),
    CONSTRAINT audit_actors_actor_key_key UNIQUE (actor_key),
    CONSTRAINT audit_actors_user_account_id_key UNIQUE (user_account_id),
    CONSTRAINT audit_actors_user_account_id_fkey
        FOREIGN KEY (user_account_id) REFERENCES public.user_accounts(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT audit_actors_kind_shape CHECK (actor_kind IN ('human','system')),
    CONSTRAINT audit_actors_identity_shape CHECK ((
        actor_kind='human'
        AND user_account_id IS NOT NULL
        AND actor_key='user_account:' || user_account_id::text
        AND purpose='Authenticated application account'
    ) OR (
        actor_kind='system'
        AND user_account_id IS NULL
        AND actor_key ~ '^system_[a-z]+(?:_[a-z]+)*$'
    )),
    CONSTRAINT audit_actors_text_shape CHECK (
        identity_label=btrim(identity_label) AND identity_label<>''
        AND purpose=btrim(purpose) AND purpose<>'')
);

INSERT INTO public.audit_actors
    (id,actor_key,actor_kind,user_account_id,identity_label,purpose)
VALUES
    (1,'system_migration','system',NULL,'Migration system',
     'Migration, import, seed and evidenced backfill activity'),
    (2,'system_authentication','system',NULL,'Authentication system',
     'Login, lockout and authentication-state activity'),
    (3,'system_administration','system',NULL,'Controlled administration',
     'Local controlled administration where no human operator identity is proved');

INSERT INTO public.audit_actors
    (id,actor_key,actor_kind,user_account_id,identity_label,purpose)
SELECT 1000+u.id,
       'user_account:' || u.id::text,
       'human',u.id,
       u.username || ' (account ' || u.id::text || ')',
       'Authenticated application account'
  FROM public.user_accounts u
 ORDER BY u.id;

SELECT setval(
    pg_get_serial_sequence('public.audit_actors','id'),
    (SELECT max(id) FROM public.audit_actors),
    true
);

CREATE FUNCTION public.refuse_audit_actor_identity_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $AUDIT_ACTOR_IMMUTABLE$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE='55000',
        MESSAGE='Audit actor identities are immutable and cannot be updated, deleted or truncated';
END;
$AUDIT_ACTOR_IMMUTABLE$;

CREATE TRIGGER audit_actors_no_change
BEFORE UPDATE OR DELETE ON public.audit_actors
FOR EACH ROW EXECUTE FUNCTION public.refuse_audit_actor_identity_change();
CREATE TRIGGER audit_actors_no_truncate
BEFORE TRUNCATE ON public.audit_actors
FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_audit_actor_identity_change();

ALTER TABLE public.person_name_alias
    ADD COLUMN created_by integer,
    ADD COLUMN updated_at timestamptz(6),
    ADD COLUMN updated_by integer;

-- Existing Task 2.10A/2.10B guards reject every update to migrated rows. For
-- this transaction only, retain those guards but permit an update whose JSON
-- projection differs solely in the two actor columns. The final definitions
-- are restored byte-for-behaviour before any audit trigger is installed.
CREATE OR REPLACE FUNCTION public.refuse_legacy_billing_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $LEGACY_BILLING$
BEGIN
    IF TG_OP='UPDATE'
       AND current_setting('litigation.task33a_actor_backfill',true)='approved'
       AND to_jsonb(NEW)-ARRAY['created_by','updated_by']
           = to_jsonb(OLD)-ARRAY['created_by','updated_by'] THEN
        RETURN NEW;
    END IF;
    IF TG_OP='TRUNCATE' THEN
        RAISE EXCEPTION 'Task 2.10A billing history TRUNCATE is refused';
    END IF;
    IF OLD.legacy_source_record_key IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10A migrated billing history cannot be updated or deleted';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF TG_TABLE_NAME='invoices'
           AND jsonb_strip_nulls(to_jsonb(NEW)) ?| ARRAY[
               'legacy_id','legacy_contract_id','legacy_currency_raw',
               'legacy_status_raw','legacy_type_raw','legacy_receipt_currency_raw',
               'legacy_source_record_key','legacy_source_extraction_sha256',
               'legacy_source_payload'
           ] THEN
            RAISE EXCEPTION 'Task 2.10A migration provenance cannot be attached by ordinary update';
        ELSIF TG_TABLE_NAME='payments'
           AND jsonb_strip_nulls(to_jsonb(NEW)) ?| ARRAY[
               'legacy_id','legacy_invoice_no','legacy_currency_raw',
               'legacy_source_record_key','legacy_source_extraction_sha256',
               'legacy_source_payload'
           ] THEN
            RAISE EXCEPTION 'Task 2.10A migration provenance cannot be attached by ordinary update';
        ELSIF TG_TABLE_NAME='invoice_allocations'
           AND jsonb_strip_nulls(to_jsonb(NEW)) ?| ARRAY[
               'legacy_id','legacy_invoice_no','legacy_lawyer_raw',
               'legacy_percent_raw','legacy_lawyer_as_raw',
               'legacy_source_record_key','legacy_source_extraction_sha256',
               'legacy_source_payload'
           ] THEN
            RAISE EXCEPTION 'Task 2.10A migration provenance cannot be attached by ordinary update';
        END IF;
    END IF;
    IF TG_OP='DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$LEGACY_BILLING$;

CREATE OR REPLACE FUNCTION public.refuse_legacy_attendance_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $ATTENDANCE_HISTORY$
BEGIN
    IF TG_OP='UPDATE'
       AND current_setting('litigation.task33a_actor_backfill',true)='approved'
       AND to_jsonb(NEW)-ARRAY['created_by','updated_by']
           = to_jsonb(OLD)-ARRAY['created_by','updated_by'] THEN
        RETURN NEW;
    END IF;
    IF TG_OP='TRUNCATE' THEN
        RAISE EXCEPTION 'Task 2.10B attendance TRUNCATE is refused';
    END IF;
    IF TG_OP='DELETE' THEN
        IF OLD.legacy_source_record_key IS NOT NULL THEN
            RAISE EXCEPTION 'Task 2.10B migrated attendance history cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.legacy_source_record_key IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10B migrated attendance history cannot be updated';
    END IF;
    IF NEW.legacy_id IS NOT NULL
       OR NEW.legacy_person_raw IS NOT NULL
       OR NEW.legacy_situation_raw IS NOT NULL
       OR NEW.legacy_source_record_key IS NOT NULL
       OR NEW.legacy_source_extraction_sha256 IS NOT NULL
       OR NEW.legacy_source_payload IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10B migration provenance cannot be attached by ordinary update';
    END IF;
    RETURN NEW;
END;
$ATTENDANCE_HISTORY$;

SELECT set_config('litigation.task33a_actor_backfill','approved',true);

DO $BACKFILL$
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
        'power_of_attorney_lawyers','powers_of_attorney','task_actions','user_accounts'
    ];
    audited_table text;
BEGIN
    FOREACH audited_table IN ARRAY approved_tables LOOP
        IF audited_table='user_accounts' THEN
            EXECUTE 'UPDATE public.user_accounts SET created_by=1';
        ELSE
            EXECUTE format('UPDATE public.%I SET created_by=1,updated_by=1',audited_table);
        END IF;
    END LOOP;
    UPDATE public.person_name_alias
       SET created_by=1,updated_at=created_at,updated_by=1;
END
$BACKFILL$;

SELECT set_config('litigation.task33a_actor_backfill','',true);

-- Restore the exact final Task 2.10A guard behaviour.
CREATE OR REPLACE FUNCTION public.refuse_legacy_billing_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $LEGACY_BILLING$
BEGIN
    IF TG_OP='TRUNCATE' THEN
        RAISE EXCEPTION 'Task 2.10A billing history TRUNCATE is refused';
    END IF;
    IF OLD.legacy_source_record_key IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10A migrated billing history cannot be updated or deleted';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF TG_TABLE_NAME='invoices'
           AND jsonb_strip_nulls(to_jsonb(NEW)) ?| ARRAY[
               'legacy_id','legacy_contract_id','legacy_currency_raw',
               'legacy_status_raw','legacy_type_raw','legacy_receipt_currency_raw',
               'legacy_source_record_key','legacy_source_extraction_sha256',
               'legacy_source_payload'
           ] THEN
            RAISE EXCEPTION 'Task 2.10A migration provenance cannot be attached by ordinary update';
        ELSIF TG_TABLE_NAME='payments'
           AND jsonb_strip_nulls(to_jsonb(NEW)) ?| ARRAY[
               'legacy_id','legacy_invoice_no','legacy_currency_raw',
               'legacy_source_record_key','legacy_source_extraction_sha256',
               'legacy_source_payload'
           ] THEN
            RAISE EXCEPTION 'Task 2.10A migration provenance cannot be attached by ordinary update';
        ELSIF TG_TABLE_NAME='invoice_allocations'
           AND jsonb_strip_nulls(to_jsonb(NEW)) ?| ARRAY[
               'legacy_id','legacy_invoice_no','legacy_lawyer_raw',
               'legacy_percent_raw','legacy_lawyer_as_raw',
               'legacy_source_record_key','legacy_source_extraction_sha256',
               'legacy_source_payload'
           ] THEN
            RAISE EXCEPTION 'Task 2.10A migration provenance cannot be attached by ordinary update';
        END IF;
    END IF;
    IF TG_OP='DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$LEGACY_BILLING$;

-- Restore the exact final Task 2.10B guard behaviour.
CREATE OR REPLACE FUNCTION public.refuse_legacy_attendance_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $ATTENDANCE_HISTORY$
BEGIN
    IF TG_OP='TRUNCATE' THEN
        RAISE EXCEPTION 'Task 2.10B attendance TRUNCATE is refused';
    END IF;
    IF TG_OP='DELETE' THEN
        IF OLD.legacy_source_record_key IS NOT NULL THEN
            RAISE EXCEPTION 'Task 2.10B migrated attendance history cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.legacy_source_record_key IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10B migrated attendance history cannot be updated';
    END IF;
    IF NEW.legacy_id IS NOT NULL
       OR NEW.legacy_person_raw IS NOT NULL
       OR NEW.legacy_situation_raw IS NOT NULL
       OR NEW.legacy_source_record_key IS NOT NULL
       OR NEW.legacy_source_extraction_sha256 IS NOT NULL
       OR NEW.legacy_source_payload IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10B migration provenance cannot be attached by ordinary update';
    END IF;
    RETURN NEW;
END;
$ATTENDANCE_HISTORY$;

CREATE FUNCTION public.audit_current_actor_id()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $AUDIT_CURRENT$
DECLARE
    raw_actor text;
    actor_id integer;
    owner_name text;
BEGIN
    raw_actor := current_setting('litigation.audit_actor_id',true);
    IF raw_actor IS NULL OR raw_actor='' THEN
        SELECT pg_get_userbyid(c.relowner) INTO owner_name
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='audit_actors';
        IF session_user IS DISTINCT FROM owner_name THEN
            RAISE EXCEPTION USING ERRCODE='42501',
                MESSAGE='An approved transaction-local audit actor context is required';
        END IF;
        SELECT id INTO actor_id FROM public.audit_actors
         WHERE actor_key='system_migration';
    ELSE
        BEGIN
            actor_id := raw_actor::integer;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            RAISE EXCEPTION USING ERRCODE='42501',
                MESSAGE='The transaction-local audit actor context is invalid';
        END;
        IF NOT EXISTS (SELECT 1 FROM public.audit_actors WHERE id=actor_id) THEN
            RAISE EXCEPTION USING ERRCODE='42501',
                MESSAGE='The transaction-local audit actor does not exist';
        END IF;
    END IF;
    RETURN actor_id;
END;
$AUDIT_CURRENT$;

CREATE FUNCTION public.audit_set_human_context(p_user_account_id integer)
RETURNS void
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $AUDIT_HUMAN$
DECLARE actor_id integer;
BEGIN
    SELECT id INTO actor_id FROM public.audit_actors
     WHERE actor_kind='human' AND user_account_id=p_user_account_id;
    IF actor_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='42501',
            MESSAGE='No immutable audit actor exists for the validated account';
    END IF;
    PERFORM set_config('litigation.audit_actor_id',actor_id::text,true);
END;
$AUDIT_HUMAN$;

CREATE FUNCTION public.audit_set_authentication_context()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $AUDIT_AUTHENTICATION$
DECLARE actor_id integer;
BEGIN
    SELECT id INTO STRICT actor_id FROM public.audit_actors
     WHERE actor_key='system_authentication';
    PERFORM set_config('litigation.audit_actor_id',actor_id::text,true);
END;
$AUDIT_AUTHENTICATION$;

CREATE FUNCTION public.audit_set_administration_context()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $AUDIT_ADMINISTRATION$
DECLARE actor_id integer;
BEGIN
    SELECT id INTO STRICT actor_id FROM public.audit_actors
     WHERE actor_key='system_administration';
    PERFORM set_config('litigation.audit_actor_id',actor_id::text,true);
END;
$AUDIT_ADMINISTRATION$;

CREATE FUNCTION public.audit_set_migration_context()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $AUDIT_MIGRATION$
DECLARE actor_id integer;
DECLARE owner_name text;
BEGIN
    SELECT pg_get_userbyid(c.relowner) INTO owner_name
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='audit_actors';
    IF session_user IS DISTINCT FROM owner_name THEN
        RAISE EXCEPTION USING ERRCODE='42501',
            MESSAGE='Only the migration owner may select system_migration';
    END IF;
    SELECT id INTO STRICT actor_id FROM public.audit_actors
     WHERE actor_key='system_migration';
    PERFORM set_config('litigation.audit_actor_id',actor_id::text,true);
END;
$AUDIT_MIGRATION$;

CREATE FUNCTION public.enforce_audit_actor_columns()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $AUDIT_COLUMNS$
DECLARE
    actor_id integer;
    audit_time timestamptz(6);
BEGIN
    actor_id := public.audit_current_actor_id();
    audit_time := statement_timestamp();
    IF TG_OP='INSERT' THEN
        NEW.created_by := actor_id;
        NEW.updated_by := actor_id;
        NEW.created_at := audit_time;
        NEW.updated_at := audit_time;
    ELSE
        NEW.created_by := OLD.created_by;
        NEW.created_at := OLD.created_at;
        NEW.updated_by := actor_id;
        NEW.updated_at := audit_time;
    END IF;
    RETURN NEW;
END;
$AUDIT_COLUMNS$;

DO $INSTALL_AUDIT_COLUMNS$
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
        'power_of_attorney_lawyers','powers_of_attorney','task_actions','user_accounts',
        'person_name_alias'
    ];
    audited_table text;
BEGIN
    FOREACH audited_table IN ARRAY approved_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_by SET NOT NULL',audited_table);
        IF audited_table<>'user_accounts' THEN
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_by SET NOT NULL',audited_table);
        END IF;
        EXECUTE format(
            'ALTER TABLE public.%1$I '
            'ALTER COLUMN created_by SET DEFAULT public.audit_current_actor_id(), '
            'ALTER COLUMN updated_by SET DEFAULT public.audit_current_actor_id(), '
            'ADD CONSTRAINT %2$I FOREIGN KEY(created_by) REFERENCES public.audit_actors(id) '
            'ON UPDATE RESTRICT ON DELETE RESTRICT, '
            'ADD CONSTRAINT %3$I FOREIGN KEY(updated_by) REFERENCES public.audit_actors(id) '
            'ON UPDATE RESTRICT ON DELETE RESTRICT',
            audited_table,audited_table||'_created_by_fkey',audited_table||'_updated_by_fkey'
        );
        EXECUTE format('CREATE INDEX %I ON public.%I(created_by)',
                       audited_table||'_created_by_idx',audited_table);
        EXECUTE format('CREATE INDEX %I ON public.%I(updated_by)',
                       audited_table||'_updated_by_idx',audited_table);
        EXECUTE format(
            'CREATE TRIGGER audit_actor_columns_guard BEFORE INSERT OR UPDATE ON public.%I '
            'FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_actor_columns()',audited_table
        );
    END LOOP;
    ALTER TABLE public.person_name_alias
        ALTER COLUMN updated_at SET NOT NULL,
        ALTER COLUMN updated_at SET DEFAULT current_timestamp;
END
$INSTALL_AUDIT_COLUMNS$;

-- The web principal is cluster-global but its grants are database-local. It
-- deliberately has no ownership, role-management, schema-creation, trigger,
-- function-definition, actor-registry or physical-delete authority.
DO $RUNTIME_ROLE$
DECLARE role_row pg_roles%ROWTYPE;
BEGIN
    SELECT * INTO role_row FROM pg_roles WHERE rolname='litigation_runtime';
    IF NOT FOUND THEN
        CREATE ROLE litigation_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOINHERIT NOREPLICATION NOBYPASSRLS;
    ELSIF role_row.rolsuper OR role_row.rolcreatedb OR role_row.rolcreaterole
       OR role_row.rolinherit OR role_row.rolreplication OR role_row.rolbypassrls
       OR NOT role_row.rolcanlogin THEN
        RAISE EXCEPTION 'Existing litigation_runtime role has unsafe attributes';
    END IF;
    EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM litigation_runtime',current_database());
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO litigation_runtime',current_database());
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC',current_database());
END
$RUNTIME_ROLE$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA public,staging,quarantine FROM litigation_runtime;
GRANT USAGE ON SCHEMA public TO litigation_runtime;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public,staging,quarantine FROM litigation_runtime;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public,staging,quarantine FROM litigation_runtime;

DO $RUNTIME_TABLE_GRANTS$
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
        'power_of_attorney_lawyers','powers_of_attorney','task_actions','user_accounts',
        'person_name_alias'
    ];
    audited_table text;
    sequence_name text;
BEGIN
    FOREACH audited_table IN ARRAY approved_tables LOOP
        EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.%I TO litigation_runtime',audited_table);
        sequence_name := pg_get_serial_sequence(format('public.%I',audited_table),'id');
        IF sequence_name IS NOT NULL THEN
            EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE %s TO litigation_runtime',sequence_name);
        END IF;
    END LOOP;
END
$RUNTIME_TABLE_GRANTS$;

REVOKE ALL ON FUNCTION public.refuse_audit_actor_identity_change() FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION public.audit_current_actor_id() FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION public.audit_set_human_context(integer) FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION public.audit_set_authentication_context() FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION public.audit_set_administration_context() FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION public.audit_set_migration_context() FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION public.enforce_audit_actor_columns() FROM PUBLIC,litigation_runtime;
GRANT EXECUTE ON FUNCTION public.audit_current_actor_id() TO litigation_runtime;
GRANT EXECUTE ON FUNCTION public.audit_set_human_context(integer) TO litigation_runtime;
GRANT EXECUTE ON FUNCTION public.audit_set_authentication_context() TO litigation_runtime;

DO $POSTCONDITION$
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
        'power_of_attorney_lawyers','powers_of_attorney','task_actions','user_accounts',
        'person_name_alias'
    ];
    audited_table text;
    created_nulls bigint;
    updated_nulls bigint;
BEGIN
    IF (SELECT count(*) FROM public.audit_actors)<>7
       OR (SELECT count(*) FROM public.audit_actors WHERE actor_kind='human')<>4
       OR (SELECT count(*) FROM public.audit_actors WHERE actor_kind='system')<>3
       OR (SELECT count(*) FROM public.audit_actors WHERE actor_key='system_migration')<>1
       OR EXISTS (
           SELECT 1 FROM public.user_accounts u
           LEFT JOIN public.audit_actors a ON a.user_account_id=u.id AND a.actor_kind='human'
           GROUP BY u.id HAVING count(a.id)<>1
       ) THEN
        RAISE EXCEPTION 'Task 3.3A actor registry postcondition failed';
    END IF;
    FOREACH audited_table IN ARRAY approved_tables LOOP
        EXECUTE format(
            'SELECT count(*) FILTER(WHERE created_by IS NULL),'
            'count(*) FILTER(WHERE updated_by IS NULL) FROM public.%I',audited_table
        ) INTO created_nulls,updated_nulls;
        IF created_nulls<>0 OR (audited_table='user_accounts' AND updated_nulls<>4)
           OR (audited_table<>'user_accounts' AND updated_nulls<>0) THEN
            RAISE EXCEPTION 'Task 3.3A attribution population differs on %: %/%',
                audited_table,created_nulls,updated_nulls;
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM pg_constraint c
        JOIN pg_class r ON r.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=r.relnamespace
        WHERE n.nspname='public' AND r.relname=ANY(approved_tables) AND c.contype='f'
          AND EXISTS (
              SELECT 1 FROM unnest(c.conkey) k(attnum)
              JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
              WHERE a.attname IN ('created_by','updated_by')
          ))<>76 THEN
        RAISE EXCEPTION 'Task 3.3A expected 76 actor foreign keys';
    END IF;
    IF (SELECT count(*) FROM pg_trigger t
        JOIN pg_class r ON r.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=r.relnamespace
        WHERE n.nspname='public' AND r.relname=ANY(approved_tables)
          AND t.tgname='audit_actor_columns_guard' AND NOT t.tgisinternal
          AND t.tgenabled='O')<>38 THEN
        RAISE EXCEPTION 'Task 3.3A expected 38 enabled audit triggers';
    END IF;
END
$POSTCONDITION$;

COMMIT;
