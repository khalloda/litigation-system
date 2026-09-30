-- Task 6.4 candidate77: dedicated lawyer-report choices and narrow historical reviewer.
-- Approved design: docs/testing/task-6-4-selection-design.md. No selection seeding.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>76 THEN
  RAISE EXCEPTION 'Exact completed migration76 direct migration principal required';
 END IF;
END $$;

CREATE TABLE public.lawyer_report_selections (
 id integer PRIMARY KEY REFERENCES public.matters(id) ON DELETE RESTRICT,
 hearing_id integer REFERENCES public.hearings(id) ON DELETE RESTRICT,
 is_selected boolean NOT NULL,
 row_version bigint NOT NULL CHECK(row_version>0)
);
CREATE TABLE _migration.lawyer_report_selection_submission (
 submission_id uuid PRIMARY KEY,
 actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
 matter_id integer NOT NULL REFERENCES public.matters(id),
 result_version bigint NOT NULL CHECK(result_version>=0),
 changed boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX lawyer_report_selection_changed_version ON _migration.lawyer_report_selection_submission(matter_id,result_version) WHERE changed;
CREATE TABLE _migration.lawyer_report_selection_change (
 matter_id integer NOT NULL REFERENCES public.matters(id),
 version bigint NOT NULL CHECK(version>0),
 actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 submission_id uuid NOT NULL UNIQUE REFERENCES _migration.lawyer_report_selection_submission(submission_id) DEFERRABLE INITIALLY DEFERRED,
 request_id uuid NOT NULL,
 before_values jsonb,
 after_values jsonb NOT NULL,
 PRIMARY KEY(matter_id,version)
);
CREATE INDEX lawyer_report_selections_hearing ON public.lawyer_report_selections(hearing_id) WHERE hearing_id IS NOT NULL;

CREATE FUNCTION _migration.lawyer_report_selection_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Report selection history and receipts are immutable'; END $$;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.lawyer_report_selection_submission FOR EACH STATEMENT EXECUTE FUNCTION _migration.lawyer_report_selection_immutable();
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.lawyer_report_selection_change FOR EACH STATEMENT EXECUTE FUNCTION _migration.lawyer_report_selection_immutable();
CREATE TRIGGER selection_no_delete BEFORE DELETE OR TRUNCATE ON public.lawyer_report_selections FOR EACH STATEMENT EXECUTE FUNCTION _migration.lawyer_report_selection_immutable();

CREATE FUNCTION _migration.lawyer_report_selection_account(p_account integer,p_person integer,p_session integer,p_role text,p_expires timestamptz,p_write boolean,p_lock boolean) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor integer;
BEGIN
 IF p_expires IS NULL OR p_expires<=clock_timestamp() OR p_role IS NULL
 OR p_role NOT IN('Administrator','Litigation Assistant','Lawyer','Paralegal')
 OR (p_write AND p_role NOT IN('Administrator','Litigation Assistant')) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized report selection session required';
 END IF;
 IF p_lock THEN PERFORM 1 FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id WHERE u.id=p_account FOR SHARE OF u,p; END IF;
 SELECT a.id INTO actor FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
 JOIN public.audit_actors a ON a.user_account_id=u.id AND a.actor_kind='human'
 WHERE u.id=p_account AND u.person_id=p_person AND u.session_version=p_session AND u.role_code=p_role
 AND u.is_enabled AND NOT u.must_change_password AND u.password_hash IS NOT NULL AND p.is_staff AND p.is_active AND p.can_login;
 IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized report selection session required'; END IF;
 RETURN actor;
END $$;

INSERT INTO public.audit_event_table_rules VALUES('public','lawyer_report_selections','record',ARRAY['id']);
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason) VALUES
 ('public','lawyer_report_selections','id',0,'entity_key','lawyer_report_selection_identity'),
 ('public','lawyer_report_selections','hearing_id',64,'value','lawyer_report_selection_current'),
 ('public','lawyer_report_selections','is_selected',64,'value','lawyer_report_selection_current'),
 ('public','lawyer_report_selections','row_version',64,'value','lawyer_report_selection_current');
CREATE TRIGGER audit_event_capture AFTER INSERT OR UPDATE ON public.lawyer_report_selections FOR EACH ROW EXECUTE FUNCTION public.audit_capture_row_event();

CREATE FUNCTION _migration.lawyer_report_selection_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; s record; v bigint:=0; current_row jsonb; at_version jsonb;
BEGIN
 SELECT to_jsonb(r) INTO current_row FROM public.lawyer_report_selections r WHERE id=p_id;
 FOR c IN SELECT * FROM _migration.lawyer_report_selection_change WHERE matter_id=p_id ORDER BY version LOOP
  v:=v+1;
  SELECT * INTO s FROM _migration.lawyer_report_selection_submission WHERE submission_id=c.submission_id;
  IF NOT FOUND OR NOT s.changed OR s.actor_id<>c.actor_id OR s.matter_id<>p_id OR s.result_version<>v
   OR c.version<>v OR c.before_values IS DISTINCT FROM expected
   OR s.request_payload->>'submission' IS DISTINCT FROM c.submission_id::text
   OR s.request_payload->>'id' IS DISTINCT FROM p_id::text
   OR s.request_payload->>'version' IS DISTINCT FROM (v-1)::text
   OR c.after_values IS DISTINCT FROM jsonb_build_object('id',p_id,'hearing_id',s.request_payload->'hearingId','is_selected',s.request_payload->'selected','row_version',v)
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='lawyer_report_selections' AND e.entity_key=jsonb_build_object('id',p_id)
      AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.outcome='succeeded'
      AND e.actor_role_snapshot IN('Administrator','Litigation Assistant')
      AND e.action=CASE WHEN v=1 THEN 'record_created' ELSE 'record_updated' END
      AND e.after_values->>'row_version'=v::text
      AND e.changed_fields=(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(c.after_values-'id') k WHERE c.before_values IS NULL OR c.before_values->k IS DISTINCT FROM c.after_values->k)
      AND e.before_values=CASE WHEN c.before_values IS NULL THEN '{}'::jsonb ELSE (SELECT jsonb_object_agg(k,c.before_values->k) FROM jsonb_object_keys(c.after_values-'id') k WHERE c.before_values->k IS DISTINCT FROM c.after_values->k) END
      AND e.after_values=(SELECT jsonb_object_agg(k,c.after_values->k) FROM jsonb_object_keys(c.after_values-'id') k WHERE c.before_values IS NULL OR c.before_values->k IS DISTINCT FROM c.after_values->k))
   THEN RETURN false; END IF;
  expected:=c.after_values;
 END LOOP;
 FOR s IN SELECT * FROM _migration.lawyer_report_selection_submission WHERE matter_id=p_id LOOP
  IF s.request_payload->>'id' IS DISTINCT FROM p_id::text OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR ((s.request_payload->>'version')::bigint + (CASE WHEN s.changed THEN 1 ELSE 0 END)) IS DISTINCT FROM s.result_version
   OR s.result_version>v OR (SELECT count(*) FROM jsonb_object_keys(s.request_payload))<>9
   OR s.request_payload->>'scope' IS DISTINCT FROM 'lawyer'
   OR NOT EXISTS(SELECT 1 FROM public.audit_actors WHERE id=s.actor_id AND actor_kind='human') THEN RETURN false; END IF;
  SELECT after_values INTO at_version FROM _migration.lawyer_report_selection_change WHERE matter_id=p_id AND version=s.result_version;
  IF s.changed THEN
   IF NOT EXISTS(SELECT 1 FROM _migration.lawyer_report_selection_change WHERE submission_id=s.submission_id AND actor_id=s.actor_id AND matter_id=p_id AND version=s.result_version) THEN RETURN false; END IF;
  ELSE
   IF coalesce(at_version->'is_selected','false'::jsonb) IS DISTINCT FROM s.request_payload->'selected'
    OR coalesce(at_version->'hearing_id','null'::jsonb) IS DISTINCT FROM s.request_payload->'hearingId' THEN RETURN false; END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='lawyer_report_selections' AND e.entity_key=jsonb_build_object('id',p_id)
  AND NOT EXISTS(SELECT 1 FROM _migration.lawyer_report_selection_change history_row WHERE history_row.matter_id=p_id AND history_row.request_id=e.request_id AND history_row.actor_id=e.actor_id AND history_row.version::text=e.after_values->>'row_version')) THEN RETURN false; END IF;
 IF expected IS DISTINCT FROM current_row THEN RETURN false; END IF;
 IF current_row->>'hearing_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hearings WHERE id=(current_row->>'hearing_id')::integer AND matter_id=p_id) THEN RETURN false; END IF;
 RETURN true;
END $$;
CREATE FUNCTION _migration.lawyer_report_selection_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity integer;
BEGIN
 identity:=(to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='lawyer_report_selections' THEN 'id' ELSE 'matter_id' END)::integer;
 IF NOT _migration.lawyer_report_selection_valid(identity) THEN RAISE EXCEPTION 'Incomplete report selection history or hearing membership'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER selection_complete AFTER INSERT OR UPDATE ON public.lawyer_report_selections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.lawyer_report_selection_complete();
CREATE CONSTRAINT TRIGGER selection_history_complete AFTER INSERT ON _migration.lawyer_report_selection_change DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.lawyer_report_selection_complete();
CREATE CONSTRAINT TRIGGER selection_receipt_complete AFTER INSERT ON _migration.lawyer_report_selection_submission DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.lawyer_report_selection_complete();
CREATE FUNCTION _migration.lawyer_report_hearing_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.lawyer_report_selections s WHERE s.hearing_id=NEW.id AND s.id IS DISTINCT FROM NEW.matter_id) THEN RAISE EXCEPTION 'Chosen report hearing belongs to another matter'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER lawyer_selection_hearing_parent AFTER UPDATE OF matter_id ON public.hearings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.lawyer_report_hearing_parent();

CREATE FUNCTION public.lawyer_report_selection_save(p_account integer,p_person integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; identity integer; client integer; hearing integer; expected bigint; token uuid; original jsonb; next_row jsonb;
 m public.matters%ROWTYPE; h public.hearings%ROWTYPE; receipt _migration.lawyer_report_selection_submission%ROWTYPE; changed boolean; version bigint;
BEGIN
 actor:=_migration.lawyer_report_selection_account(p_account,p_person,p_session,p_role,p_expires,true,true);
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Report selection actor differs from trusted context'; END IF;
 PERFORM public.audit_ensure_event_context();
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR length(p_request::text)>4096
 OR NOT p_request ?& ARRAY['scope','id','client','version','matterVersion','hearingId','hearingVersion','selected','submission']
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN('scope','id','client','version','matterVersion','hearingId','hearingVersion','selected','submission'))
 OR p_request->>'scope' IS DISTINCT FROM 'lawyer'
 OR NOT _migration.matter_edit_positive(p_request->'id',false) OR NOT _migration.matter_edit_positive(p_request->'client',false)
 OR NOT _migration.matter_edit_positive(p_request->'hearingId',true)
 OR jsonb_typeof(p_request->'selected')<>'boolean'
 OR jsonb_typeof(p_request->'version')<>'string' OR (p_request->>'version') !~ '^(0|[1-9][0-9]{0,17})$'
 OR jsonb_typeof(p_request->'matterVersion')<>'string' OR (p_request->>'matterVersion') !~ '^[1-9][0-9]{0,17}$'
 OR jsonb_typeof(p_request->'submission')<>'string' OR (p_request->>'submission') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 OR (p_request->'hearingId'='null'::jsonb)<>(p_request->'hearingVersion'='null'::jsonb)
 OR (p_request->'hearingVersion'<>'null'::jsonb AND (jsonb_typeof(p_request->'hearingVersion')<>'string' OR (p_request->>'hearingVersion') !~ '^[1-9][0-9]{0,17}$'))
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid report selection request'; END IF;
 identity:=(p_request->>'id')::integer; client:=(p_request->>'client')::integer; hearing:=(p_request->>'hearingId')::integer; expected:=(p_request->>'version')::bigint; token:=(p_request->>'submission')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(token::text,74));
 SELECT * INTO receipt FROM _migration.lawyer_report_selection_submission WHERE submission_id=token;
 IF FOUND THEN
  IF receipt.actor_id<>actor OR receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Report selection submission differs'; END IF;
  RETURN jsonb_build_object('id',identity,'version',receipt.result_version::text,'changed',receipt.changed);
 END IF;
 SELECT * INTO m FROM public.matters WHERE id=identity AND client_id=client FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Report selection matter not found for client'; END IF;
 IF m.row_version<>(p_request->>'matterVersion')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Report selection is stale'; END IF;
 IF m.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before editing selection'; END IF;
 SELECT to_jsonb(s) INTO original FROM public.lawyer_report_selections s WHERE id=identity FOR UPDATE;
 IF coalesce((original->>'row_version')::bigint,0)<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Report selection is stale'; END IF;
 IF hearing IS NOT NULL THEN
  SELECT * INTO h FROM public.hearings WHERE id=hearing AND matter_id=identity FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Report hearing belongs to another matter'; END IF;
  IF h.row_version<>(p_request->>'hearingVersion')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Report hearing is stale'; END IF;
  IF h.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived hearing before editing selection'; END IF;
 END IF;
 changed:=coalesce((original->>'is_selected')::boolean,false) IS DISTINCT FROM (p_request->>'selected')::boolean OR original->>'hearing_id' IS DISTINCT FROM p_request->>'hearingId';
 version:=expected+CASE WHEN changed THEN 1 ELSE 0 END;
 IF changed THEN
  INSERT INTO public.lawyer_report_selections(id,hearing_id,is_selected,row_version) VALUES(identity,hearing,(p_request->>'selected')::boolean,version)
  ON CONFLICT(id) DO UPDATE SET hearing_id=EXCLUDED.hearing_id,is_selected=EXCLUDED.is_selected,row_version=EXCLUDED.row_version RETURNING to_jsonb(lawyer_report_selections) INTO next_row;
  INSERT INTO _migration.lawyer_report_selection_change VALUES(identity,version,actor,token,current_setting('litigation.audit_request_id')::uuid,original,next_row);
 END IF;
 INSERT INTO _migration.lawyer_report_selection_submission(submission_id,actor_id,request_payload,matter_id,result_version,changed) VALUES(token,actor,p_request,identity,version,changed);
 RETURN jsonb_build_object('id',identity,'version',version::text,'changed',changed);
END $$;

-- A unique registry makes token identity safe across all purposes, even with
-- concurrent SERIALIZABLE snapshots. Old receipts are registered, never edited.
CREATE TABLE _migration.lawyer_report_submission_scope (
 submission_id uuid PRIMARY KEY,
 purpose text NOT NULL CHECK(purpose IN('client','closed','lawyer'))
);
INSERT INTO _migration.lawyer_report_submission_scope
 SELECT submission_id,'client' FROM _migration.client_report_selection_submission
 UNION ALL SELECT submission_id,'closed' FROM _migration.closed_report_selection_submission;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.lawyer_report_submission_scope FOR EACH STATEMENT EXECUTE FUNCTION _migration.lawyer_report_selection_immutable();
CREATE FUNCTION _migration.lawyer_report_register_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE purpose text;
BEGIN
 purpose:=CASE TG_TABLE_NAME WHEN 'client_report_selection_submission' THEN 'client' WHEN 'closed_report_selection_submission' THEN 'closed' WHEN 'lawyer_report_selection_submission' THEN 'lawyer' END;
 IF purpose IS NULL THEN RAISE EXCEPTION 'Unknown report selection purpose'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.submission_id::text,74));
 BEGIN
  INSERT INTO _migration.lawyer_report_submission_scope VALUES(NEW.submission_id,purpose);
 EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Report selection submission differs across scopes';
 END;
 RETURN NEW;
END $$;
CREATE TRIGGER lawyer_selection_scope BEFORE INSERT ON _migration.client_report_selection_submission FOR EACH ROW EXECUTE FUNCTION _migration.lawyer_report_register_scope();
CREATE TRIGGER lawyer_selection_scope BEFORE INSERT ON _migration.closed_report_selection_submission FOR EACH ROW EXECUTE FUNCTION _migration.lawyer_report_register_scope();
CREATE TRIGGER lawyer_selection_scope BEFORE INSERT ON _migration.lawyer_report_selection_submission FOR EACH ROW EXECUTE FUNCTION _migration.lawyer_report_register_scope();
CREATE FUNCTION _migration.lawyer_report_scope_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (SELECT count(*) FROM (
  SELECT submission_id,'client'::text purpose FROM _migration.client_report_selection_submission
  UNION ALL SELECT submission_id,'closed' FROM _migration.closed_report_selection_submission
  UNION ALL SELECT submission_id,'lawyer' FROM _migration.lawyer_report_selection_submission
 ) s WHERE s.submission_id=NEW.submission_id AND s.purpose=NEW.purpose)<>1 THEN
  RAISE EXCEPTION 'Report selection purpose registry lacks exact receipt';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER selection_scope_complete AFTER INSERT ON _migration.lawyer_report_submission_scope DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.lawyer_report_scope_complete();

-- No broad raw-payload or staging privilege; preserve absent/empty/unknown states.
CREATE FUNCTION public.lawyer_report_historical_reviewer(p_ids integer[]) RETURNS TABLE(id integer,team_key text,source_state text,reviewer text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_ids IS NULL OR cardinality(p_ids)>100000 OR EXISTS(SELECT 1 FROM unnest(p_ids) x WHERE x IS NULL OR x<=0) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid historical reviewer identities';
 END IF;
 IF EXISTS(SELECT 1 FROM public.matters m JOIN staging."فريق العمل" t ON t."ID"::text=m.legacy_source_payload->>'فريق العمل' WHERE m.id=ANY(p_ids) GROUP BY m.id HAVING count(*)<>1) THEN
  RAISE EXCEPTION 'Historical reviewer source key is not unique';
 END IF;
 RETURN QUERY SELECT m.id,m.legacy_source_payload->>'فريق العمل',
 CASE WHEN m.legacy_source_payload IS NULL THEN 'no_source'
 WHEN m.legacy_source_payload->>'فريق العمل' IS NULL THEN 'no_team'
 WHEN m.legacy_source_payload->>'فريق العمل'='' THEN 'empty_team'
 WHEN t."ID" IS NULL THEN 'unknown_team'
 WHEN t."المراجع" IS NULL THEN 'reviewer_null'
 WHEN t."المراجع"='' THEN 'reviewer_empty' ELSE 'recorded' END,
 t."المراجع"::text
 FROM public.matters m LEFT JOIN staging."فريق العمل" t ON t."ID"::text=m.legacy_source_payload->>'فريق العمل'
 WHERE m.id=ANY(p_ids) ORDER BY m.id;
END $$;
REVOKE ALL ON _migration.lawyer_report_submission_scope FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION public.lawyer_report_historical_reviewer(integer[]) FROM PUBLIC,litigation_runtime;
GRANT EXECUTE ON FUNCTION public.lawyer_report_historical_reviewer(integer[]) TO litigation_runtime;

REVOKE ALL ON public.lawyer_report_selections,_migration.lawyer_report_selection_change,_migration.lawyer_report_selection_submission FROM PUBLIC,litigation_runtime;
GRANT SELECT ON public.lawyer_report_selections TO litigation_runtime;
DO $$ DECLARE r regprocedure; BEGIN
 FOR r IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='_migration' AND p.proname LIKE 'lawyer_report_%') OR (n.nspname='public' AND p.proname='lawyer_report_selection_save') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',r);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.lawyer_report_selection_save(integer,integer,integer,text,timestamptz,jsonb) TO litigation_runtime;
COMMIT;
