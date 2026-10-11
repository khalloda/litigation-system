-- Task69 expiry is wall-clock based even inside a long restoration transaction.
BEGIN;
CREATE OR REPLACE FUNCTION _migration.task69_require_actor(p_account integer,p_version integer,p_role text,p_expires timestamptz,p_session uuid) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE actor integer;
BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task69 requires direct administration principal';
 END IF;
 IF p_session IS NULL OR p_expires IS NULL OR p_expires>clock_timestamp()+interval '31 days' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current genuine Task69 session required';
 END IF;
 IF p_expires<=clock_timestamp() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized matter session required';
 END IF;
 actor:=_migration.matter_edit_require_account(p_account,p_version,p_role,p_expires,true);
 IF (SELECT count(*) FROM public.audit_events WHERE actor_id=actor AND audit_session_id=p_session
  AND action='login_succeeded' AND outcome='succeeded')<>1
 OR EXISTS(SELECT 1 FROM public.audit_events WHERE actor_id=actor AND audit_session_id=p_session
  AND action='logout' AND outcome='succeeded') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task69 session lacks one genuine current sign-in';
 END IF;
 RETURN actor;
END $$;
COMMIT;
