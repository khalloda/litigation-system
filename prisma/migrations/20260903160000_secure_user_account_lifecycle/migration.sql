BEGIN;

-- Task 3.4: secure Administrator-owned account lifecycle work without
-- changing any existing account, actor, audit event or protected business
-- row. The four original passwordless accounts remain valid on a canonical
-- clean replay; Administrator availability is enforced only when a mutation
-- could reduce it.

DO $PRECONDITION$
BEGIN
    IF session_user IS DISTINCT FROM current_user
       OR NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=session_user),false) THEN
        RAISE EXCEPTION 'Task 3.4 requires D35 direct-superuser migration identity';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public._prisma_migrations
         WHERE migration_name='20260903100000_close_task33b_review_gaps'
           AND checksum='e6aefa8ef378434062ef18c82f84d218a1f0531c74f10c3845713cce7226579b'
           AND finished_at IS NOT NULL AND rolled_back_at IS NULL
           AND applied_steps_count=1
    ) THEN
        RAISE EXCEPTION 'Task 3.4 requires the accepted migration-58 checkpoint';
    END IF;
    IF (SELECT count(*) FROM public.user_accounts)<>4
       OR (SELECT count(*) FROM public.audit_actors)<>7
       OR (SELECT count(*) FROM public.audit_actors WHERE actor_kind='system')<>3
       OR (SELECT count(*) FROM public.audit_actors WHERE actor_kind='human')<>4
       OR EXISTS (
           SELECT 1 FROM public.user_accounts u
           LEFT JOIN public.audit_actors a
             ON a.user_account_id=u.id AND a.actor_kind='human'
           GROUP BY u.id HAVING count(a.id)<>1
       ) THEN
        RAISE EXCEPTION 'Task 3.4 requires the exact accepted four-account/seven-actor baseline';
    END IF;
    IF to_regprocedure(
        'public.create_user_account_with_actor(integer,text,text,text)'
       ) IS NOT NULL
       OR to_regprocedure('public.user_account_is_usable_administrator(integer)') IS NOT NULL
       OR to_regprocedure('public.guard_usable_administrator()') IS NOT NULL THEN
        RAISE EXCEPTION 'Task 3.4 lifecycle objects already exist';
    END IF;
END
$PRECONDITION$;

CREATE TEMP TABLE task34_prestate ON COMMIT DROP AS
SELECT
    encode(sha256(convert_to((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id)::text
                                FROM public.user_accounts u),'UTF8')),'hex') account_digest,
    encode(sha256(convert_to((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)::text
                                FROM public.audit_actors a),'UTF8')),'hex') actor_digest,
    encode(sha256(convert_to((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)::text
                                FROM public.audit_events e),'UTF8')),'hex') event_digest;

-- Deliberately separate future human actor identities from account identities.
-- Existing actor ids 1-3 and 1001-1004 remain untouched; the next actor is
-- allocated by the audit_actors identity sequence and will be at least 2000.
SELECT setval(pg_get_serial_sequence('public.audit_actors','id'),1999,true);

ALTER TABLE public.audit_events
    DROP CONSTRAINT audit_events_action_shape,
    ADD CONSTRAINT audit_events_action_shape CHECK (action IN (
        'record_created','record_updated',
        'relationship_added','relationship_updated','relationship_removed',
        'login_succeeded','login_failed','account_locked',
        'password_changed','password_initialized','password_reset',
        'archive','restore','account_created','account_enabled','account_disabled',
        'username_changed','role_changed','report_executed','export_completed',
        'download_completed','audit_baseline_established'
    ));

CREATE FUNCTION public.user_account_is_usable_administrator(p_user_account_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $USABLE_ADMINISTRATOR$
    SELECT EXISTS (
        SELECT 1
          FROM public.user_accounts u
          JOIN public.people p ON p.id=u.person_id
         WHERE u.id=p_user_account_id
           AND u.role_code='Administrator'
           AND u.is_enabled
           AND u.password_hash IS NOT NULL
           AND p.is_active
           AND p.can_login
    );
$USABLE_ADMINISTRATOR$;

CREATE OR REPLACE FUNCTION public.guard_user_account_security()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $USER_ACCOUNT_SECURITY$
DECLARE
    lifecycle_changed boolean :=
        NEW.username IS DISTINCT FROM OLD.username
        OR NEW.username_normalized IS DISTINCT FROM OLD.username_normalized
        OR NEW.password_hash IS DISTINCT FROM OLD.password_hash
        OR NEW.role_code IS DISTINCT FROM OLD.role_code
        OR NEW.is_enabled IS DISTINCT FROM OLD.is_enabled;
BEGIN
    IF NEW.person_id <> OLD.person_id THEN
        RAISE EXCEPTION 'A user account cannot be moved to another person';
    END IF;
    IF NEW.session_version < OLD.session_version THEN
        RAISE EXCEPTION 'A user account session version cannot decrease';
    END IF;
    IF OLD.password_hash IS NOT NULL AND NEW.password_hash IS NULL THEN
        RAISE EXCEPTION 'An initialized user password cannot be cleared';
    END IF;
    IF lifecycle_changed AND NEW.session_version <> OLD.session_version+1 THEN
        RAISE EXCEPTION 'Account lifecycle changes must increment the session version exactly once';
    END IF;
    IF NEW.password_hash IS DISTINCT FROM OLD.password_hash
       OR NEW.is_enabled IS DISTINCT FROM OLD.is_enabled THEN
        IF NEW.failed_login_attempts <> 0 OR NEW.locked_until IS NOT NULL THEN
            RAISE EXCEPTION 'Password and enablement changes must clear lockout state';
        END IF;
    END IF;
    IF NOT OLD.is_enabled AND NEW.is_enabled THEN
        IF NEW.password_hash IS NOT DISTINCT FROM OLD.password_hash
           OR NEW.password_hash IS NULL
           OR NOT NEW.must_change_password
           OR NEW.password_changed_at IS NOT DISTINCT FROM OLD.password_changed_at THEN
            RAISE EXCEPTION 'Reactivation requires a new temporary password and forced change';
        END IF;
    END IF;
    RETURN NEW;
END;
$USER_ACCOUNT_SECURITY$;

DROP TRIGGER user_accounts_security_guard ON public.user_accounts;
CREATE TRIGGER user_accounts_security_guard
BEFORE UPDATE OF person_id,username,username_normalized,password_hash,role_code,
    is_enabled,must_change_password,failed_login_attempts,locked_until,
    session_version,password_changed_at ON public.user_accounts
FOR EACH ROW EXECUTE FUNCTION public.guard_user_account_security();

CREATE FUNCTION public.guard_usable_administrator()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $ADMINISTRATOR_AVAILABILITY$
DECLARE
    old_usable boolean := false;
    new_usable boolean := false;
    target_account_id integer;
    current_account_id integer;
    person_active boolean;
    person_can_login boolean;
BEGIN
    IF TG_TABLE_NAME='user_accounts' THEN
        SELECT p.is_active,p.can_login
          INTO STRICT person_active,person_can_login
          FROM public.people p WHERE p.id=OLD.person_id;
        old_usable := OLD.role_code='Administrator' AND OLD.is_enabled
            AND OLD.password_hash IS NOT NULL AND person_active AND person_can_login;
        new_usable := NEW.role_code='Administrator' AND NEW.is_enabled
            AND NEW.password_hash IS NOT NULL AND person_active;
        target_account_id := OLD.id;

        IF OLD.role_code='Administrator'
           AND ((OLD.is_enabled AND NOT NEW.is_enabled)
                OR NEW.role_code<>'Administrator') THEN
            SELECT a.user_account_id INTO current_account_id
              FROM public.audit_actors a
             WHERE a.id=public.audit_current_actor_id() AND a.actor_kind='human';
            IF current_account_id IS NOT NULL AND current_account_id=OLD.id THEN
                RAISE EXCEPTION USING ERRCODE='42501',
                    MESSAGE='An Administrator cannot disable or demote their own account';
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME='people' THEN
        SELECT u.id,
               u.role_code='Administrator' AND u.is_enabled AND u.password_hash IS NOT NULL
                   AND OLD.is_active AND OLD.can_login,
               u.role_code='Administrator' AND u.is_enabled AND u.password_hash IS NOT NULL
                   AND NEW.is_active AND NEW.can_login
          INTO target_account_id,old_usable,new_usable
          FROM public.user_accounts u WHERE u.person_id=OLD.id;
        IF target_account_id IS NULL THEN RETURN NEW; END IF;
    ELSE
        RAISE EXCEPTION 'Administrator availability guard is installed on an unexpected table';
    END IF;

    IF old_usable AND NOT new_usable THEN
        PERFORM pg_advisory_xact_lock(340059);
        IF NOT EXISTS (
            SELECT 1
              FROM public.user_accounts u
              JOIN public.people p ON p.id=u.person_id
             WHERE u.id<>target_account_id
               AND u.role_code='Administrator'
               AND u.is_enabled
               AND u.password_hash IS NOT NULL
               AND p.is_active
               AND p.can_login
        ) THEN
            RAISE EXCEPTION USING ERRCODE='23514',
                MESSAGE='The system must retain at least one usable Administrator';
        END IF;
    END IF;
    RETURN NEW;
END;
$ADMINISTRATOR_AVAILABILITY$;

CREATE TRIGGER user_accounts_administrator_availability_guard
BEFORE UPDATE OF role_code,is_enabled,password_hash ON public.user_accounts
FOR EACH ROW EXECUTE FUNCTION public.guard_usable_administrator();

CREATE TRIGGER people_administrator_availability_guard
BEFORE UPDATE OF is_active,can_login ON public.people
FOR EACH ROW EXECUTE FUNCTION public.guard_usable_administrator();

CREATE FUNCTION public.create_user_account_with_actor(
    p_person_id integer,
    p_username text,
    p_password_hash text,
    p_role_code text
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $CREATE_ACCOUNT$
DECLARE
    current_actor_id integer := public.audit_current_actor_id();
    acting_account_id integer;
    target_person public.people%ROWTYPE;
    primary_alias_count integer;
    new_account_id integer;
BEGIN
    PERFORM public.audit_ensure_event_context();
    SELECT a.user_account_id INTO acting_account_id
      FROM public.audit_actors a
     WHERE a.id=current_actor_id AND a.actor_kind='human';
    IF acting_account_id IS NULL
       OR NOT public.user_account_is_usable_administrator(acting_account_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501',
            MESSAGE='A current usable human Administrator is required to create an account';
    END IF;

    SELECT * INTO target_person
      FROM public.people p WHERE p.id=p_person_id FOR UPDATE;
    IF NOT FOUND OR NOT target_person.is_staff OR NOT target_person.is_active THEN
        RAISE EXCEPTION USING ERRCODE='22023',
            MESSAGE='The target must be an existing active staff person';
    END IF;
    SELECT count(*)::integer INTO primary_alias_count
      FROM public.person_name_alias a
     WHERE a.person_id=p_person_id AND a.is_primary AND a.alias_ar=target_person.name_ar;
    IF primary_alias_count<>1 THEN
        RAISE EXCEPTION USING ERRCODE='22023',
            MESSAGE='The target staff identity is not unambiguous';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_accounts u WHERE u.person_id=p_person_id) THEN
        RAISE EXCEPTION USING ERRCODE='23505',
            MESSAGE='The target staff person already has an account';
    END IF;

    INSERT INTO public.user_accounts(
        person_id,username,username_normalized,password_hash,role_code,
        is_enabled,must_change_password,failed_login_attempts,locked_until,
        session_version,password_changed_at,updated_at
    ) VALUES (
        p_person_id,p_username,lower(p_username),p_password_hash,p_role_code,
        true,true,0,NULL,0,statement_timestamp(),statement_timestamp()
    ) RETURNING id INTO new_account_id;

    INSERT INTO public.audit_actors(
        actor_key,actor_kind,user_account_id,identity_label,purpose
    ) VALUES (
        'user_account:'||new_account_id::text,'human',new_account_id,
        p_username||' (account '||new_account_id::text||')',
        'Authenticated application account'
    );

    RETURN new_account_id;
END;
$CREATE_ACCOUNT$;

CREATE OR REPLACE FUNCTION public.audit_append_semantic_event(
    p_action text,
    p_outcome text,
    p_entity_schema text,
    p_entity_table text,
    p_entity_key jsonb,
    p_target_actor_id integer,
    p_attempted_username text,
    p_resource_identifier text,
    p_parameters jsonb,
    p_reason_code text,
    p_event_metadata jsonb
)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $SEMANTIC_EVENT$
DECLARE
    current_actor_id integer := public.audit_current_actor_id();
    current_kind text;
    current_key text;
    current_user_account_id integer;
    target_kind text;
    target_user_account_id integer;
    current_is_usable_administrator boolean := false;
BEGIN
    SELECT actor_kind,actor_key,user_account_id
      INTO STRICT current_kind,current_key,current_user_account_id
      FROM public.audit_actors WHERE id=current_actor_id;
    IF current_kind='human' THEN
        current_is_usable_administrator :=
            public.user_account_is_usable_administrator(current_user_account_id);
    END IF;
    IF p_target_actor_id IS NOT NULL THEN
        SELECT actor_kind,user_account_id INTO STRICT target_kind,target_user_account_id
          FROM public.audit_actors WHERE id=p_target_actor_id;
        IF target_kind<>'human' OR target_user_account_id IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Semantic target must be a human account actor';
        END IF;
    END IF;
    IF p_action NOT IN (
        'login_succeeded','login_failed','account_locked',
        'password_changed','password_initialized','password_reset',
        'archive','restore','account_created','account_enabled','account_disabled',
        'username_changed','role_changed','report_executed','export_completed','download_completed'
    ) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsupported semantic audit action';
    END IF;
    IF p_outcome NOT IN ('succeeded','failed','blocked')
       OR NOT public.audit_safe_flat_object(coalesce(p_parameters,'{}'::jsonb))
       OR NOT public.audit_safe_flat_object(coalesce(p_event_metadata,'{}'::jsonb))
       OR (p_reason_code IS NOT NULL AND p_reason_code !~ '^[a-z][a-z0-9_]{0,63}$') THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsafe semantic audit payload';
    END IF;
    IF p_resource_identifier IS NOT NULL AND (
        p_resource_identifier='' OR char_length(p_resource_identifier)>256
        OR public.audit_contains_secret_pattern(p_resource_identifier)
    ) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsafe semantic resource identifier';
    END IF;
    IF (p_entity_schema IS NULL) IS DISTINCT FROM (p_entity_table IS NULL)
       OR (p_entity_schema IS NULL) IS DISTINCT FROM (p_entity_key IS NULL)
       OR (p_entity_key IS NOT NULL AND
           (p_entity_schema<>'public'
            OR NOT EXISTS (
                SELECT 1 FROM public.audit_event_table_rules r
                 WHERE r.entity_schema=p_entity_schema AND r.entity_table=p_entity_table
            )
            OR NOT public.audit_safe_flat_object(p_entity_key)
            OR octet_length(p_entity_key::text)>2048)) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid semantic audit entity';
    END IF;
    IF p_action='login_succeeded' THEN
        IF current_kind<>'human' OR p_outcome<>'succeeded'
           OR p_target_actor_id IS NOT NULL OR p_attempted_username IS NOT NULL
           OR p_entity_table<>'user_accounts'
           OR p_entity_key IS DISTINCT FROM jsonb_build_object('id',current_user_account_id) THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Login-success actor or shape is invalid';
        END IF;
    ELSIF p_action='login_failed' THEN
        IF current_key<>'system_authentication' OR p_outcome NOT IN ('failed','blocked')
           OR coalesce(p_attempted_username,'')=''
           OR (p_target_actor_id IS NULL AND p_entity_key IS NOT NULL)
           OR (p_target_actor_id IS NOT NULL AND (
               p_entity_table<>'user_accounts'
               OR p_entity_key IS DISTINCT FROM jsonb_build_object('id',target_user_account_id)
           )) THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Login-failure actor or shape is invalid';
        END IF;
    ELSIF p_action='account_locked' THEN
        IF current_key<>'system_authentication' OR p_outcome<>'succeeded'
           OR p_target_actor_id IS NULL OR p_entity_table<>'user_accounts'
           OR p_entity_key IS DISTINCT FROM jsonb_build_object('id',target_user_account_id) THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Lockout actor or shape is invalid';
        END IF;
    ELSIF p_action='password_changed' THEN
        IF current_kind<>'human' OR p_outcome<>'succeeded'
           OR p_target_actor_id IS DISTINCT FROM current_actor_id
           OR p_entity_table<>'user_accounts'
           OR p_entity_key IS DISTINCT FROM jsonb_build_object('id',current_user_account_id) THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Self-password actor or shape is invalid';
        END IF;
    ELSIF p_action IN ('password_initialized','password_reset') THEN
        IF p_outcome<>'succeeded' OR p_target_actor_id IS NULL
           OR p_entity_schema<>'public' OR p_entity_table<>'user_accounts'
           OR p_entity_key IS DISTINCT FROM jsonb_build_object('id',target_user_account_id)
           OR p_attempted_username IS NOT NULL OR p_resource_identifier IS NOT NULL
           OR p_reason_code IS NOT NULL OR coalesce(p_parameters,'{}'::jsonb)<>'{}'::jsonb
           OR coalesce(p_event_metadata,'{}'::jsonb)<>'{}'::jsonb
           OR NOT (
               (current_key='system_administration'
                AND target_user_account_id=ANY(ARRAY[1,2,3,4]))
               OR
               (current_kind='human' AND current_is_usable_administrator
                AND current_user_account_id<>target_user_account_id)
           ) THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrative password actor or shape is invalid';
        END IF;
    ELSIF p_action IN (
        'account_created','account_enabled','account_disabled','username_changed','role_changed'
    ) THEN
        IF current_kind<>'human' OR NOT current_is_usable_administrator
           OR p_outcome<>'succeeded' OR p_target_actor_id IS NULL
           OR p_entity_schema<>'public' OR p_entity_table<>'user_accounts'
           OR p_entity_key IS DISTINCT FROM jsonb_build_object('id',target_user_account_id)
           OR p_attempted_username IS NOT NULL OR p_resource_identifier IS NOT NULL
           OR p_reason_code IS NOT NULL OR coalesce(p_parameters,'{}'::jsonb)<>'{}'::jsonb
           OR coalesce(p_event_metadata,'{}'::jsonb)<>'{}'::jsonb THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Account lifecycle actor or shape is invalid';
        END IF;
    ELSIF p_action IN ('archive','restore') THEN
        IF current_kind<>'human' OR p_outcome<>'succeeded'
           OR p_target_actor_id IS NOT NULL OR p_entity_key IS NULL
           OR p_entity_table='user_accounts' OR p_attempted_username IS NOT NULL
           OR p_resource_identifier IS NOT NULL OR p_reason_code IS NOT NULL
           OR coalesce(p_parameters,'{}'::jsonb)<>'{}'::jsonb
           OR coalesce(p_event_metadata,'{}'::jsonb)<>'{}'::jsonb THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record lifecycle actor or shape is invalid';
        END IF;
    ELSIF p_action IN ('report_executed','export_completed','download_completed') THEN
        IF current_kind<>'human' OR coalesce(p_resource_identifier,'')='' THEN
            RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Report/export/download actor or shape is invalid';
        END IF;
    END IF;
    RETURN public.audit_write_event(
        p_action,p_outcome,p_entity_schema,p_entity_table,p_entity_key,
        ARRAY[]::text[],'{}'::jsonb,'{}'::jsonb,p_target_actor_id,
        p_attempted_username,p_resource_identifier,p_parameters,p_reason_code,p_event_metadata
    );
END;
$SEMANTIC_EVENT$;

REVOKE ALL ON FUNCTION public.user_account_is_usable_administrator(integer)
    FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION public.guard_usable_administrator()
    FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION public.create_user_account_with_actor(integer,text,text,text)
    FROM PUBLIC,litigation_runtime;
GRANT EXECUTE ON FUNCTION public.create_user_account_with_actor(integer,text,text,text)
    TO litigation_runtime;

REVOKE INSERT,DELETE,TRUNCATE ON TABLE public.user_accounts FROM litigation_runtime;
REVOKE ALL ON SEQUENCE public.user_accounts_id_seq FROM litigation_runtime;

DO $POSTCONDITION$
DECLARE
    snapshot task34_prestate%ROWTYPE;
    account_digest_after text;
    actor_digest_after text;
    event_digest_after text;
BEGIN
    SELECT * INTO STRICT snapshot FROM task34_prestate;
    SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(u) ORDER BY u.id)::text,'UTF8')),'hex')
      INTO account_digest_after FROM public.user_accounts u;
    SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(a) ORDER BY a.id)::text,'UTF8')),'hex')
      INTO actor_digest_after FROM public.audit_actors a;
    SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(e) ORDER BY e.id)::text,'UTF8')),'hex')
      INTO event_digest_after FROM public.audit_events e;

    IF snapshot.account_digest IS DISTINCT FROM account_digest_after
       OR snapshot.actor_digest IS DISTINCT FROM actor_digest_after
       OR snapshot.event_digest IS DISTINCT FROM event_digest_after THEN
        RAISE EXCEPTION 'Task 3.4 migration altered protected account, actor or event state';
    END IF;
    IF (SELECT last_value FROM public.audit_actors_id_seq)<>1999
       OR has_table_privilege('litigation_runtime','public.user_accounts','INSERT')
       OR has_table_privilege('litigation_runtime','public.user_accounts','DELETE')
       OR has_table_privilege('litigation_runtime','public.user_accounts','TRUNCATE')
       OR NOT has_table_privilege('litigation_runtime','public.user_accounts','SELECT')
       OR NOT has_table_privilege('litigation_runtime','public.user_accounts','UPDATE')
       OR has_sequence_privilege('litigation_runtime','public.user_accounts_id_seq','USAGE')
       OR has_sequence_privilege('litigation_runtime','public.user_accounts_id_seq','SELECT')
       OR NOT has_function_privilege(
           'litigation_runtime','public.create_user_account_with_actor(integer,text,text,text)','EXECUTE'
       )
       OR has_table_privilege('litigation_runtime','public.audit_actors','SELECT') THEN
        RAISE EXCEPTION 'Task 3.4 runtime account-creation boundary differs';
    END IF;
    IF (SELECT count(*) FROM public.user_accounts)<>4
       OR (SELECT count(*) FROM public.audit_actors)<>7 THEN
        RAISE EXCEPTION 'Task 3.4 protected baseline counts differ';
    END IF;
END
$POSTCONDITION$;

COMMIT;
