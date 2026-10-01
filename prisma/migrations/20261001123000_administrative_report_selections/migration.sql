-- Tasks6.5-6.7 candidate78: owner-approved separate administrative choices.
-- docs/testing/tasks-6-5-6-7-selection-design.md. No choice seeding or owner use.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>77 THEN
  RAISE EXCEPTION 'Exact completed migration77 direct migration principal required';
 END IF;
END $$;
CREATE FUNCTION _migration.administrative_report_selection_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Report selection history and receipts are immutable'; END $$;
CREATE FUNCTION _migration.administrative_report_selection_account(p_account integer,p_person integer,p_session integer,p_role text,p_expires timestamptz,p_kind text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor integer;
BEGIN
 IF p_expires IS NULL OR p_expires<=clock_timestamp() OR p_role IS NULL
 OR p_role NOT IN('Administrator','Litigation Assistant','Lawyer','Paralegal')
 OR p_kind IS NULL OR p_kind NOT IN('hearing','step')
 OR (p_kind='hearing' AND p_role NOT IN('Administrator','Litigation Assistant'))
 OR (p_kind='step' AND p_role NOT IN('Administrator','Litigation Assistant','Paralegal')) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized report selection session required';
 END IF;
 PERFORM 1 FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id WHERE u.id=p_account FOR SHARE OF u,p;
 SELECT a.id INTO actor FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
 JOIN public.audit_actors a ON a.user_account_id=u.id AND a.actor_kind='human'
 WHERE u.id=p_account AND u.person_id=p_person AND u.session_version=p_session AND u.role_code=p_role
 AND u.is_enabled AND NOT u.must_change_password AND u.password_hash IS NOT NULL AND p.is_staff AND p.is_active AND p.can_login;
 IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized report selection session required'; END IF;
 RETURN actor;
END $$;

CREATE TABLE public.administrative_hearing_report_selections (
 id integer PRIMARY KEY REFERENCES public.hearings(id) ON DELETE RESTRICT,
 is_selected boolean NOT NULL,
 row_version bigint NOT NULL CHECK(row_version>0)
);
CREATE TABLE _migration.administrative_hearing_report_selection_submission (
 submission_id uuid PRIMARY KEY,
 actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
 record_id integer NOT NULL REFERENCES public.hearings(id),
 result_version bigint NOT NULL CHECK(result_version>=0),
 changed boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX administrative_hearing_report_selection_changed_version ON _migration.administrative_hearing_report_selection_submission(record_id,result_version) WHERE changed;
CREATE TABLE _migration.administrative_hearing_report_selection_change (
 record_id integer NOT NULL REFERENCES public.hearings(id),
 version bigint NOT NULL CHECK(version>0),
 actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 submission_id uuid NOT NULL UNIQUE REFERENCES _migration.administrative_hearing_report_selection_submission(submission_id) DEFERRABLE INITIALLY DEFERRED,
 request_id uuid NOT NULL,
 before_values jsonb,
 after_values jsonb NOT NULL,
 PRIMARY KEY(record_id,version)
);
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.administrative_hearing_report_selection_submission FOR EACH STATEMENT EXECUTE FUNCTION _migration.administrative_report_selection_immutable();
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.administrative_hearing_report_selection_change FOR EACH STATEMENT EXECUTE FUNCTION _migration.administrative_report_selection_immutable();
CREATE TRIGGER selection_no_delete BEFORE DELETE OR TRUNCATE ON public.administrative_hearing_report_selections FOR EACH STATEMENT EXECUTE FUNCTION _migration.administrative_report_selection_immutable();
INSERT INTO public.audit_event_table_rules VALUES('public','administrative_hearing_report_selections','record',ARRAY['id']);
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason) VALUES
 ('public','administrative_hearing_report_selections','id',0,'entity_key','administrative_hearing_report_selection_identity'),
 ('public','administrative_hearing_report_selections','is_selected',64,'value','administrative_hearing_report_selection_current'),
 ('public','administrative_hearing_report_selections','row_version',64,'value','administrative_hearing_report_selection_current');
CREATE TRIGGER audit_event_capture AFTER INSERT OR UPDATE ON public.administrative_hearing_report_selections FOR EACH ROW EXECUTE FUNCTION public.audit_capture_row_event();

CREATE FUNCTION _migration.administrative_hearing_report_selection_request_valid(p_request jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce(p_request IS NOT NULL AND jsonb_typeof(p_request)='object' AND length(p_request::text)<=4096
 AND p_request ?& ARRAY['scope','id','parent','client','version','parentVersion','recordVersion','selected','submission']
 AND (SELECT count(*) FROM jsonb_object_keys(p_request))=9
 AND p_request->>'scope'='administrative-hearing'
 AND _migration.matter_edit_positive(p_request->'id',false)
 AND _migration.matter_edit_positive(p_request->'parent',false)
 AND _migration.matter_edit_positive(p_request->'client',false)
 AND jsonb_typeof(p_request->'selected')='boolean'
 AND jsonb_typeof(p_request->'version')='string' AND p_request->>'version' ~ '^(0|[1-9][0-9]{0,17})$'
 AND jsonb_typeof(p_request->'parentVersion')='string' AND p_request->>'parentVersion' ~ '^[1-9][0-9]{0,17}$'
 AND (jsonb_typeof(p_request->'recordVersion')='string' AND p_request->>'recordVersion' ~ '^[1-9][0-9]{0,17}$')
 AND jsonb_typeof(p_request->'submission')='string' AND p_request->>'submission' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',false)
$$;
CREATE FUNCTION _migration.administrative_hearing_report_selection_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; s record; v bigint:=0; current_row jsonb; at_version jsonb;
BEGIN
 SELECT to_jsonb(r) INTO current_row FROM public.administrative_hearing_report_selections r WHERE id=p_id;
 FOR c IN SELECT * FROM _migration.administrative_hearing_report_selection_change WHERE record_id=p_id ORDER BY version LOOP
  v:=v+1;
  SELECT * INTO s FROM _migration.administrative_hearing_report_selection_submission WHERE submission_id=c.submission_id;
  IF NOT FOUND OR NOT s.changed OR s.actor_id<>c.actor_id OR s.record_id<>p_id OR s.result_version<>v
   OR c.version<>v OR c.before_values IS DISTINCT FROM expected
   OR s.request_payload->>'submission' IS DISTINCT FROM c.submission_id::text
   OR s.request_payload->>'id' IS DISTINCT FROM p_id::text
   OR s.request_payload->>'version' IS DISTINCT FROM (v-1)::text
   OR c.after_values IS DISTINCT FROM jsonb_build_object('id',p_id,'is_selected',s.request_payload->'selected','row_version',v)
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='administrative_hearing_report_selections' AND e.entity_key=jsonb_build_object('id',p_id)
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
 FOR s IN SELECT * FROM _migration.administrative_hearing_report_selection_submission WHERE record_id=p_id LOOP
  IF s.request_payload->>'id' IS DISTINCT FROM p_id::text OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR ((s.request_payload->>'version')::bigint + (CASE WHEN s.changed THEN 1 ELSE 0 END)) IS DISTINCT FROM s.result_version
   OR s.result_version>v OR NOT _migration.administrative_hearing_report_selection_request_valid(s.request_payload)
   OR s.request_payload->>'scope' IS DISTINCT FROM 'administrative-hearing'
   OR NOT EXISTS(SELECT 1 FROM public.audit_actors WHERE id=s.actor_id AND actor_kind='human') THEN RETURN false; END IF;
  SELECT after_values INTO at_version FROM _migration.administrative_hearing_report_selection_change WHERE record_id=p_id AND version=s.result_version;
  IF s.changed THEN
   IF NOT EXISTS(SELECT 1 FROM _migration.administrative_hearing_report_selection_change WHERE submission_id=s.submission_id AND actor_id=s.actor_id AND record_id=p_id AND version=s.result_version) THEN RETURN false; END IF;
  ELSE
   IF coalesce(at_version->'is_selected','false'::jsonb) IS DISTINCT FROM s.request_payload->'selected' THEN RETURN false; END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='administrative_hearing_report_selections' AND e.entity_key=jsonb_build_object('id',p_id)
  AND NOT EXISTS(SELECT 1 FROM _migration.administrative_hearing_report_selection_change history_row WHERE history_row.record_id=p_id AND history_row.request_id=e.request_id AND history_row.actor_id=e.actor_id AND history_row.version::text=e.after_values->>'row_version')) THEN RETURN false; END IF;
 IF expected IS DISTINCT FROM current_row THEN RETURN false; END IF;
 RETURN true;
END $$;
CREATE FUNCTION _migration.administrative_hearing_report_selection_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity integer;
BEGIN
 identity:=(to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='administrative_hearing_report_selections' THEN 'id' ELSE 'record_id' END)::integer;
 IF NOT _migration.administrative_hearing_report_selection_valid(identity) THEN RAISE EXCEPTION 'Incomplete report selection history or hearing membership'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER selection_complete AFTER INSERT OR UPDATE ON public.administrative_hearing_report_selections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.administrative_hearing_report_selection_complete();
CREATE CONSTRAINT TRIGGER selection_history_complete AFTER INSERT ON _migration.administrative_hearing_report_selection_change DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.administrative_hearing_report_selection_complete();
CREATE CONSTRAINT TRIGGER selection_receipt_complete AFTER INSERT ON _migration.administrative_hearing_report_selection_submission DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.administrative_hearing_report_selection_complete();

CREATE FUNCTION public.administrative_hearing_report_selection_save(p_account integer,p_person integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; identity integer; parent integer; client integer; expected bigint; token uuid; original jsonb; next_row jsonb;
 m public.matters%ROWTYPE; h public.hearings%ROWTYPE; w public.admin_tasks%ROWTYPE;
 receipt _migration.administrative_hearing_report_selection_submission%ROWTYPE; changed boolean; version bigint;
BEGIN
 actor:=_migration.administrative_report_selection_account(p_account,p_person,p_session,p_role,p_expires,'hearing');
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Report selection actor differs from trusted context'; END IF;
 PERFORM public.audit_ensure_event_context();
 IF NOT _migration.administrative_hearing_report_selection_request_valid(p_request) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid report selection request'; END IF;
 identity:=(p_request->>'id')::integer; parent:=(p_request->>'parent')::integer; client:=(p_request->>'client')::integer; expected:=(p_request->>'version')::bigint; token:=(p_request->>'submission')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(token::text,74));
 SELECT * INTO receipt FROM _migration.administrative_hearing_report_selection_submission WHERE submission_id=token;
 IF FOUND THEN
  IF receipt.actor_id<>actor OR receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Report selection submission differs'; END IF;
  RETURN jsonb_build_object('id',identity,'version',receipt.result_version::text,'changed',receipt.changed);
 END IF;
 SELECT * INTO m FROM public.matters WHERE id=parent AND client_id=client FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Report selection matter not found for client'; END IF;
 IF m.row_version<>(p_request->>'parentVersion')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Report selection parent is stale'; END IF;
 IF m.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before editing selection'; END IF;
 SELECT * INTO h FROM public.hearings WHERE id=identity AND matter_id=parent FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Report hearing belongs to another matter'; END IF;
 IF h.row_version<>(p_request->>'recordVersion')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Report hearing is stale'; END IF;
 IF h.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived record before editing selection'; END IF;
 SELECT to_jsonb(s) INTO original FROM public.administrative_hearing_report_selections s WHERE id=identity FOR UPDATE;
 IF coalesce((original->>'row_version')::bigint,0)<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Report selection is stale'; END IF;
 changed:=coalesce((original->>'is_selected')::boolean,false) IS DISTINCT FROM (p_request->>'selected')::boolean;
 version:=expected+CASE WHEN changed THEN 1 ELSE 0 END;
 IF changed THEN
  INSERT INTO public.administrative_hearing_report_selections(id,is_selected,row_version) VALUES(identity,(p_request->>'selected')::boolean,version)
  ON CONFLICT(id) DO UPDATE SET is_selected=EXCLUDED.is_selected,row_version=EXCLUDED.row_version RETURNING to_jsonb(administrative_hearing_report_selections) INTO next_row;
  INSERT INTO _migration.administrative_hearing_report_selection_change VALUES(identity,version,actor,token,current_setting('litigation.audit_request_id')::uuid,original,next_row);
 END IF;
 INSERT INTO _migration.administrative_hearing_report_selection_submission(submission_id,actor_id,request_payload,record_id,result_version,changed) VALUES(token,actor,p_request,identity,version,changed);
 RETURN jsonb_build_object('id',identity,'version',version::text,'changed',changed);
END $$;
REVOKE ALL ON public.administrative_hearing_report_selections,_migration.administrative_hearing_report_selection_change,_migration.administrative_hearing_report_selection_submission FROM PUBLIC,litigation_runtime;
GRANT SELECT ON public.administrative_hearing_report_selections TO litigation_runtime;

CREATE TABLE public.administrative_step_report_selections (
 id integer PRIMARY KEY REFERENCES public.task_actions(id) ON DELETE RESTRICT,
 is_selected boolean NOT NULL,
 row_version bigint NOT NULL CHECK(row_version>0)
);
CREATE TABLE _migration.administrative_step_report_selection_submission (
 submission_id uuid PRIMARY KEY,
 actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
 record_id integer NOT NULL REFERENCES public.task_actions(id),
 result_version bigint NOT NULL CHECK(result_version>=0),
 changed boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX administrative_step_report_selection_changed_version ON _migration.administrative_step_report_selection_submission(record_id,result_version) WHERE changed;
CREATE TABLE _migration.administrative_step_report_selection_change (
 record_id integer NOT NULL REFERENCES public.task_actions(id),
 version bigint NOT NULL CHECK(version>0),
 actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 submission_id uuid NOT NULL UNIQUE REFERENCES _migration.administrative_step_report_selection_submission(submission_id) DEFERRABLE INITIALLY DEFERRED,
 request_id uuid NOT NULL,
 before_values jsonb,
 after_values jsonb NOT NULL,
 PRIMARY KEY(record_id,version)
);
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.administrative_step_report_selection_submission FOR EACH STATEMENT EXECUTE FUNCTION _migration.administrative_report_selection_immutable();
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.administrative_step_report_selection_change FOR EACH STATEMENT EXECUTE FUNCTION _migration.administrative_report_selection_immutable();
CREATE TRIGGER selection_no_delete BEFORE DELETE OR TRUNCATE ON public.administrative_step_report_selections FOR EACH STATEMENT EXECUTE FUNCTION _migration.administrative_report_selection_immutable();
INSERT INTO public.audit_event_table_rules VALUES('public','administrative_step_report_selections','record',ARRAY['id']);
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason) VALUES
 ('public','administrative_step_report_selections','id',0,'entity_key','administrative_step_report_selection_identity'),
 ('public','administrative_step_report_selections','is_selected',64,'value','administrative_step_report_selection_current'),
 ('public','administrative_step_report_selections','row_version',64,'value','administrative_step_report_selection_current');
CREATE TRIGGER audit_event_capture AFTER INSERT OR UPDATE ON public.administrative_step_report_selections FOR EACH ROW EXECUTE FUNCTION public.audit_capture_row_event();

CREATE FUNCTION _migration.administrative_step_report_selection_request_valid(p_request jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce(p_request IS NOT NULL AND jsonb_typeof(p_request)='object' AND length(p_request::text)<=4096
 AND p_request ?& ARRAY['scope','id','parent','client','version','parentVersion','recordVersion','selected','submission']
 AND (SELECT count(*) FROM jsonb_object_keys(p_request))=9
 AND p_request->>'scope'='administrative-step'
 AND _migration.matter_edit_positive(p_request->'id',false)
 AND _migration.matter_edit_positive(p_request->'parent',false)
 AND _migration.matter_edit_positive(p_request->'client',false)
 AND jsonb_typeof(p_request->'selected')='boolean'
 AND jsonb_typeof(p_request->'version')='string' AND p_request->>'version' ~ '^(0|[1-9][0-9]{0,17})$'
 AND jsonb_typeof(p_request->'parentVersion')='string' AND p_request->>'parentVersion' ~ '^[1-9][0-9]{0,17}$'
 AND p_request->'recordVersion'='null'::jsonb
 AND jsonb_typeof(p_request->'submission')='string' AND p_request->>'submission' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',false)
$$;
CREATE FUNCTION _migration.administrative_step_report_selection_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; s record; v bigint:=0; current_row jsonb; at_version jsonb;
BEGIN
 SELECT to_jsonb(r) INTO current_row FROM public.administrative_step_report_selections r WHERE id=p_id;
 FOR c IN SELECT * FROM _migration.administrative_step_report_selection_change WHERE record_id=p_id ORDER BY version LOOP
  v:=v+1;
  SELECT * INTO s FROM _migration.administrative_step_report_selection_submission WHERE submission_id=c.submission_id;
  IF NOT FOUND OR NOT s.changed OR s.actor_id<>c.actor_id OR s.record_id<>p_id OR s.result_version<>v
   OR c.version<>v OR c.before_values IS DISTINCT FROM expected
   OR s.request_payload->>'submission' IS DISTINCT FROM c.submission_id::text
   OR s.request_payload->>'id' IS DISTINCT FROM p_id::text
   OR s.request_payload->>'version' IS DISTINCT FROM (v-1)::text
   OR c.after_values IS DISTINCT FROM jsonb_build_object('id',p_id,'is_selected',s.request_payload->'selected','row_version',v)
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='administrative_step_report_selections' AND e.entity_key=jsonb_build_object('id',p_id)
      AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.outcome='succeeded'
      AND e.actor_role_snapshot IN('Administrator','Litigation Assistant','Paralegal')
      AND e.action=CASE WHEN v=1 THEN 'record_created' ELSE 'record_updated' END
      AND e.after_values->>'row_version'=v::text
      AND e.changed_fields=(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(c.after_values-'id') k WHERE c.before_values IS NULL OR c.before_values->k IS DISTINCT FROM c.after_values->k)
      AND e.before_values=CASE WHEN c.before_values IS NULL THEN '{}'::jsonb ELSE (SELECT jsonb_object_agg(k,c.before_values->k) FROM jsonb_object_keys(c.after_values-'id') k WHERE c.before_values->k IS DISTINCT FROM c.after_values->k) END
      AND e.after_values=(SELECT jsonb_object_agg(k,c.after_values->k) FROM jsonb_object_keys(c.after_values-'id') k WHERE c.before_values IS NULL OR c.before_values->k IS DISTINCT FROM c.after_values->k))
   THEN RETURN false; END IF;
  expected:=c.after_values;
 END LOOP;
 FOR s IN SELECT * FROM _migration.administrative_step_report_selection_submission WHERE record_id=p_id LOOP
  IF s.request_payload->>'id' IS DISTINCT FROM p_id::text OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR ((s.request_payload->>'version')::bigint + (CASE WHEN s.changed THEN 1 ELSE 0 END)) IS DISTINCT FROM s.result_version
   OR s.result_version>v OR NOT _migration.administrative_step_report_selection_request_valid(s.request_payload)
   OR s.request_payload->>'scope' IS DISTINCT FROM 'administrative-step'
   OR NOT EXISTS(SELECT 1 FROM public.audit_actors WHERE id=s.actor_id AND actor_kind='human') THEN RETURN false; END IF;
  SELECT after_values INTO at_version FROM _migration.administrative_step_report_selection_change WHERE record_id=p_id AND version=s.result_version;
  IF s.changed THEN
   IF NOT EXISTS(SELECT 1 FROM _migration.administrative_step_report_selection_change WHERE submission_id=s.submission_id AND actor_id=s.actor_id AND record_id=p_id AND version=s.result_version) THEN RETURN false; END IF;
  ELSE
   IF coalesce(at_version->'is_selected','false'::jsonb) IS DISTINCT FROM s.request_payload->'selected' THEN RETURN false; END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='administrative_step_report_selections' AND e.entity_key=jsonb_build_object('id',p_id)
  AND NOT EXISTS(SELECT 1 FROM _migration.administrative_step_report_selection_change history_row WHERE history_row.record_id=p_id AND history_row.request_id=e.request_id AND history_row.actor_id=e.actor_id AND history_row.version::text=e.after_values->>'row_version')) THEN RETURN false; END IF;
 IF expected IS DISTINCT FROM current_row THEN RETURN false; END IF;
 RETURN true;
END $$;
CREATE FUNCTION _migration.administrative_step_report_selection_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity integer;
BEGIN
 identity:=(to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='administrative_step_report_selections' THEN 'id' ELSE 'record_id' END)::integer;
 IF NOT _migration.administrative_step_report_selection_valid(identity) THEN RAISE EXCEPTION 'Incomplete report selection history or hearing membership'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER selection_complete AFTER INSERT OR UPDATE ON public.administrative_step_report_selections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.administrative_step_report_selection_complete();
CREATE CONSTRAINT TRIGGER selection_history_complete AFTER INSERT ON _migration.administrative_step_report_selection_change DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.administrative_step_report_selection_complete();
CREATE CONSTRAINT TRIGGER selection_receipt_complete AFTER INSERT ON _migration.administrative_step_report_selection_submission DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.administrative_step_report_selection_complete();

CREATE FUNCTION public.administrative_step_report_selection_save(p_account integer,p_person integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; identity integer; parent integer; client integer; expected bigint; token uuid; original jsonb; next_row jsonb;
 m public.matters%ROWTYPE; h public.task_actions%ROWTYPE; w public.admin_tasks%ROWTYPE;
 receipt _migration.administrative_step_report_selection_submission%ROWTYPE; changed boolean; version bigint;
BEGIN
 actor:=_migration.administrative_report_selection_account(p_account,p_person,p_session,p_role,p_expires,'step');
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Report selection actor differs from trusted context'; END IF;
 PERFORM public.audit_ensure_event_context();
 IF NOT _migration.administrative_step_report_selection_request_valid(p_request) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid report selection request'; END IF;
 identity:=(p_request->>'id')::integer; parent:=(p_request->>'parent')::integer; client:=(p_request->>'client')::integer; expected:=(p_request->>'version')::bigint; token:=(p_request->>'submission')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(token::text,74));
 SELECT * INTO receipt FROM _migration.administrative_step_report_selection_submission WHERE submission_id=token;
 IF FOUND THEN
  IF receipt.actor_id<>actor OR receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Report selection submission differs'; END IF;
  RETURN jsonb_build_object('id',identity,'version',receipt.result_version::text,'changed',receipt.changed);
 END IF;
 SELECT * INTO w FROM public.admin_tasks WHERE id=parent FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Report selection work not found'; END IF;
 SELECT * INTO m FROM public.matters WHERE id=w.matter_id AND client_id=client FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Report selection work not found for client'; END IF;
 IF w.row_version<>(p_request->>'parentVersion')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Report selection parent is stale'; END IF;
 IF m.is_archived OR w.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived parent before editing selection'; END IF;
 SELECT * INTO h FROM public.task_actions WHERE id=identity AND task_id=parent FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Report step belongs to another work'; END IF;
 IF h.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived record before editing selection'; END IF;
 SELECT to_jsonb(s) INTO original FROM public.administrative_step_report_selections s WHERE id=identity FOR UPDATE;
 IF coalesce((original->>'row_version')::bigint,0)<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Report selection is stale'; END IF;
 changed:=coalesce((original->>'is_selected')::boolean,false) IS DISTINCT FROM (p_request->>'selected')::boolean;
 version:=expected+CASE WHEN changed THEN 1 ELSE 0 END;
 IF changed THEN
  INSERT INTO public.administrative_step_report_selections(id,is_selected,row_version) VALUES(identity,(p_request->>'selected')::boolean,version)
  ON CONFLICT(id) DO UPDATE SET is_selected=EXCLUDED.is_selected,row_version=EXCLUDED.row_version RETURNING to_jsonb(administrative_step_report_selections) INTO next_row;
  INSERT INTO _migration.administrative_step_report_selection_change VALUES(identity,version,actor,token,current_setting('litigation.audit_request_id')::uuid,original,next_row);
 END IF;
 INSERT INTO _migration.administrative_step_report_selection_submission(submission_id,actor_id,request_payload,record_id,result_version,changed) VALUES(token,actor,p_request,identity,version,changed);
 RETURN jsonb_build_object('id',identity,'version',version::text,'changed',changed);
END $$;
REVOKE ALL ON public.administrative_step_report_selections,_migration.administrative_step_report_selection_change,_migration.administrative_step_report_selection_submission FROM PUBLIC,litigation_runtime;
GRANT SELECT ON public.administrative_step_report_selections TO litigation_runtime;

-- Supplement the prior exact registries; old bodies, records and scopes stay intact.
CREATE TABLE _migration.administrative_report_submission_scope (
 submission_id uuid PRIMARY KEY,
 purpose text NOT NULL CHECK(purpose IN('client','closed','lawyer','administrative-hearing','administrative-step'))
);
INSERT INTO _migration.administrative_report_submission_scope
 SELECT submission_id,'client' FROM _migration.client_report_selection_submission
 UNION ALL SELECT submission_id,'closed' FROM _migration.closed_report_selection_submission
 UNION ALL SELECT submission_id,'lawyer' FROM _migration.lawyer_report_selection_submission;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.administrative_report_submission_scope FOR EACH STATEMENT EXECUTE FUNCTION _migration.administrative_report_selection_immutable();
CREATE FUNCTION _migration.administrative_report_register_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE purpose text;
BEGIN
 purpose:=CASE TG_TABLE_NAME WHEN 'client_report_selection_submission' THEN 'client' WHEN 'closed_report_selection_submission' THEN 'closed' WHEN 'lawyer_report_selection_submission' THEN 'lawyer' WHEN 'administrative_hearing_report_selection_submission' THEN 'administrative-hearing' WHEN 'administrative_step_report_selection_submission' THEN 'administrative-step' END;
 IF purpose IS NULL THEN RAISE EXCEPTION 'Unknown report selection purpose'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.submission_id::text,74));
 BEGIN
  INSERT INTO _migration.administrative_report_submission_scope VALUES(NEW.submission_id,purpose);
 EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Report selection submission differs across scopes';
 END;
 RETURN NEW;
END $$;
CREATE TRIGGER administrative_selection_scope BEFORE INSERT ON _migration.client_report_selection_submission FOR EACH ROW EXECUTE FUNCTION _migration.administrative_report_register_scope();
CREATE TRIGGER administrative_selection_scope BEFORE INSERT ON _migration.closed_report_selection_submission FOR EACH ROW EXECUTE FUNCTION _migration.administrative_report_register_scope();
CREATE TRIGGER administrative_selection_scope BEFORE INSERT ON _migration.lawyer_report_selection_submission FOR EACH ROW EXECUTE FUNCTION _migration.administrative_report_register_scope();
CREATE TRIGGER administrative_selection_scope BEFORE INSERT ON _migration.administrative_hearing_report_selection_submission FOR EACH ROW EXECUTE FUNCTION _migration.administrative_report_register_scope();
CREATE TRIGGER administrative_selection_scope BEFORE INSERT ON _migration.administrative_step_report_selection_submission FOR EACH ROW EXECUTE FUNCTION _migration.administrative_report_register_scope();
CREATE FUNCTION _migration.administrative_report_scope_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (SELECT count(*) FROM (
  SELECT submission_id,'client'::text purpose FROM _migration.client_report_selection_submission
  UNION ALL SELECT submission_id,'closed' FROM _migration.closed_report_selection_submission
  UNION ALL SELECT submission_id,'lawyer' FROM _migration.lawyer_report_selection_submission
  UNION ALL SELECT submission_id,'administrative-hearing' FROM _migration.administrative_hearing_report_selection_submission
  UNION ALL SELECT submission_id,'administrative-step' FROM _migration.administrative_step_report_selection_submission
 ) s WHERE s.submission_id=NEW.submission_id AND s.purpose=NEW.purpose)<>1 THEN
  RAISE EXCEPTION 'Report selection purpose registry lacks exact receipt';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER selection_scope_complete AFTER INSERT ON _migration.administrative_report_submission_scope DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.administrative_report_scope_complete();
REVOKE ALL ON _migration.administrative_report_submission_scope FROM PUBLIC,litigation_runtime;
DO $$ DECLARE r regprocedure; BEGIN
 FOR r IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('_migration','public') AND p.proname LIKE 'administrative_%report_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',r);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.administrative_hearing_report_selection_save(integer,integer,integer,text,timestamptz,jsonb) TO litigation_runtime;
GRANT EXECUTE ON FUNCTION public.administrative_step_report_selection_save(integer,integer,integer,text,timestamptz,jsonb) TO litigation_runtime;
COMMIT;
