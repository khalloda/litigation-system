-- Task 4.4 Phase 3 / owner-adopted D63. Candidate69, disposable copies only.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.admin_tasks,public.task_actions IN ACCESS EXCLUSIVE MODE;
DO $precondition$
BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>68
 OR NOT EXISTS(SELECT 1 FROM _prisma_migrations WHERE migration_name='20260914160000_admin_work_editing_boundary' AND checksum='0928904bd97e7976f2d37114bc3aa3e83d66b6b3c861942c3fee5e4abe2d7d18' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20260915120000_admin_work_archive_restore') THEN
 RAISE EXCEPTION 'Exact complete migration-68 direct owner prestate required'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_tasks WHERE NOT _migration.admin_edit_current_valid(id)) THEN RAISE EXCEPTION 'Invalid pre-existing administrative history'; END IF;
END
$precondition$;
CREATE TABLE _migration.admin_lifecycle_boundary (
 singleton boolean PRIMARY KEY CHECK(singleton),
 prior_versions jsonb NOT NULL CHECK(jsonb_typeof(prior_versions)='object'),
 prior_history_count integer NOT NULL CHECK(prior_history_count>=0),
 prior_history_digest text NOT NULL CHECK(prior_history_digest ~ '^[a-f0-9]{64}$'),
 prior_receipt_count integer NOT NULL CHECK(prior_receipt_count>=0),
 prior_receipt_digest text NOT NULL CHECK(prior_receipt_digest ~ '^[a-f0-9]{64}$'),
 established_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO _migration.admin_lifecycle_boundary
SELECT true,(SELECT coalesce(jsonb_object_agg(id,row_version),'{}') FROM public.admin_tasks),
 (SELECT count(*) FROM _migration.admin_edit_change),
 (SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(c)::text,chr(10) ORDER BY task_id,version),''),'UTF8')),'hex') FROM _migration.admin_edit_change c),
 (SELECT count(*) FROM _migration.admin_edit_submission),
 (SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(s)::text,chr(10) ORDER BY task_id,result_version),''),'UTF8')),'hex') FROM _migration.admin_edit_submission s),statement_timestamp();
CREATE TRIGGER immutable_rows BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON _migration.admin_lifecycle_boundary FOR EACH STATEMENT EXECUTE FUNCTION _migration.admin_edit_immutable();
REVOKE ALL ON _migration.admin_lifecycle_boundary FROM PUBLIC,litigation_runtime;
ALTER TABLE public.admin_tasks ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.task_actions ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
CREATE INDEX admin_tasks_archive_date_id_idx ON public.admin_tasks(is_archived,task_created_date DESC NULLS LAST,id DESC);
CREATE INDEX task_actions_archive_order_idx ON public.task_actions(task_id,is_archived,(current_order IS NOT NULL),source_ordinal ASC NULLS LAST,current_order,id);
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason)
VALUES ('public','admin_tasks','is_archived',64,'value','admin_archive_lifecycle'),('public','task_actions','is_archived',64,'value','admin_step_archive_lifecycle');
CREATE FUNCTION public.admin_lifecycle_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_task integer,p_step integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF p_role IS DISTINCT FROM 'Administrator' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrator administrative lifecycle required'; END IF;
 PERFORM _migration.admin_edit_require_account(p_account,p_session,p_role,p_expires,false);
 SELECT jsonb_build_object('id',a.id,'stepId',p_step,'version',a.row_version::text,'archived',CASE WHEN p_step IS NULL THEN a.is_archived ELSE s.is_archived END,'facts',_migration.admin_lifecycle_facts(a.id,p_step)) INTO result
 FROM public.admin_tasks a LEFT JOIN public.task_actions s ON s.id=p_step AND s.task_id=a.id WHERE a.id=p_task AND (p_step IS NULL OR s.id IS NOT NULL);
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Administrative work or owned step not found'; END IF;
 RETURN result;
END;
$$;
CREATE FUNCTION public.admin_lifecycle_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; identity integer; step_id integer; expected bigint; submission uuid; operation text; target_action text; parent integer; parent_archived boolean;
 original public.admin_tasks%ROWTYPE; child public.task_actions%ROWTYPE; receipt _migration.admin_edit_submission%ROWTYPE; before_state jsonb; after_state jsonb; version bigint; archived boolean;
BEGIN
 PERFORM 1 FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE;
 IF p_role IS DISTINCT FROM 'Administrator' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrator administrative lifecycle required'; END IF;
 actor:=_migration.admin_edit_require_account(p_account,p_session,p_role,p_expires,true);
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrative actor does not match trusted audit context'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>200000
 OR NOT p_request ?& ARRAY['task_id','step_id','version','submission','operation','facts','confirmation']
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN('task_id','step_id','version','submission','operation','facts','confirmation'))
 OR NOT _migration.admin_edit_positive(p_request->'task_id',false) OR NOT _migration.admin_edit_positive(p_request->'step_id',true)
 OR jsonb_typeof(p_request->'version')<>'string' OR (p_request->>'version') !~ '^[1-9][0-9]{0,18}$'
 OR jsonb_typeof(p_request->'submission')<>'string' OR (p_request->>'submission') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 OR jsonb_typeof(p_request->'operation')<>'string' OR p_request->>'operation' NOT IN('task-archive','task-restore','step-archive','step-restore')
 OR jsonb_typeof(p_request->'facts')<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid administrative lifecycle request'; END IF;
 identity:=(p_request->>'task_id')::integer;step_id:=(p_request->>'step_id')::integer;expected:=(p_request->>'version')::bigint;submission:=(p_request->>'submission')::uuid;operation:=p_request->>'operation';target_action:=split_part(operation,'-',2);
 IF (operation LIKE 'step-%')<>(step_id IS NOT NULL) OR p_request->'confirmation' IS DISTINCT FROM to_jsonb(coalesce(step_id,identity)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lifecycle subject confirmation'; END IF;
 -- Same lock namespace and receipt table as ordinary editing. Tokens cannot cross operations.
 PERFORM pg_advisory_xact_lock(hashtextextended(submission::text,44));
 SELECT * INTO receipt FROM _migration.admin_edit_submission WHERE submission_id=submission;
 IF FOUND THEN
  IF receipt.actor_id<>actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrative submission belongs to another actor'; END IF;
  IF receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Administrative submission payload differs'; END IF;
  PERFORM _migration.admin_edit_require_account(p_account,p_session,p_role,p_expires,false);
  RETURN jsonb_build_object('id',receipt.task_id,'stepId',receipt.step_id,'version',receipt.result_version::text,'changed',receipt.changed);
 END IF;
 SELECT matter_id INTO parent FROM public.admin_tasks WHERE id=identity;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Administrative work not found'; END IF;
 IF parent IS NOT NULL THEN
  SELECT is_archived INTO parent_archived FROM public.matters WHERE id=parent FOR SHARE;
  IF parent_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before administrative lifecycle'; END IF;
 END IF;
 SELECT * INTO STRICT original FROM public.admin_tasks WHERE id=identity FOR UPDATE;
 IF step_id IS NOT NULL THEN
  IF original.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived administrative work before changing steps'; END IF;
  SELECT * INTO child FROM public.task_actions WHERE id=step_id AND task_id=identity FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Step not found for administrative work'; END IF;
 END IF;
 IF original.row_version<>expected OR p_request->'facts' IS DISTINCT FROM _migration.admin_lifecycle_facts(identity,step_id) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Administrative version or confirmation is stale'; END IF;
 PERFORM _migration.admin_edit_require_account(p_account,p_session,p_role,p_expires,false);
 archived:=CASE WHEN step_id IS NULL THEN original.is_archived ELSE child.is_archived END;
 IF archived=(target_action='archive') THEN RETURN jsonb_build_object('id',identity,'stepId',step_id,'version',expected::text,'changed',false); END IF;
 PERFORM public.audit_ensure_event_context();
 before_state:=_migration.admin_edit_aggregate(identity);
 IF step_id IS NULL THEN
  UPDATE public.admin_tasks SET is_archived=(target_action='archive'),row_version=row_version+1 WHERE id=identity RETURNING row_version INTO version;
 ELSE
  UPDATE public.task_actions SET is_archived=(target_action='archive') WHERE id=step_id;
  UPDATE public.admin_tasks SET row_version=row_version+1 WHERE id=identity RETURNING row_version INTO version;
 END IF;
 PERFORM public.audit_append_semantic_event(target_action,'succeeded','public',CASE WHEN step_id IS NULL THEN 'admin_tasks' ELSE 'task_actions' END,jsonb_build_object('id',coalesce(step_id,identity)),NULL,NULL,NULL,'{}',NULL,'{}');
 after_state:=_migration.admin_edit_aggregate(identity);
 INSERT INTO _migration.admin_edit_change VALUES(identity,version,actor,before_state,after_state,current_setting('litigation.audit_request_id')::uuid);
 INSERT INTO _migration.admin_edit_submission(actor_id,submission_id,request_payload,task_id,result_version,step_id,changed) VALUES(actor,submission,p_request,identity,version,step_id,true);
 RETURN jsonb_build_object('id',identity,'stepId',step_id,'version',version::text,'changed',true);
END;
$$;
CREATE FUNCTION _migration.admin_lifecycle_normalize(v jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN v IS NULL THEN NULL ELSE jsonb_build_object('task',jsonb_build_object('is_archived',false)||(v->'task'),'steps',(SELECT coalesce(jsonb_agg(jsonb_build_object('is_archived',false)||s ORDER BY ord),'[]') FROM jsonb_array_elements(v->'steps') WITH ORDINALITY a(s,ord))) END
$$;
CREATE FUNCTION _migration.admin_lifecycle_facts(p_task integer,p_step integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
 SELECT jsonb_build_object('taskId',a.id,'stepId',p_step,'requiredWork',a.required_work,'taskCreatedDate',a.task_created_date::text,
 'matterId',a.matter_id,'caseNumber',m.case_number_ar,'matterArchived',coalesce(m.is_archived,false),'taskArchived',a.is_archived,
 'stepArchived',s.is_archived,'actionDate',s.action_date::text,'result',s.result,'report',s.report,
 'currentSteps',(SELECT count(*) FROM public.task_actions WHERE task_id=a.id AND NOT is_archived),
 'archivedSteps',(SELECT count(*) FROM public.task_actions WHERE task_id=a.id AND is_archived))
 FROM public.admin_tasks a LEFT JOIN public.matters m ON m.id=a.matter_id LEFT JOIN public.task_actions s ON s.id=p_step AND s.task_id=a.id
 WHERE a.id=p_task AND (p_step IS NULL OR s.id IS NOT NULL)
$$;
CREATE FUNCTION _migration.admin_lifecycle_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE incoming jsonb:=to_jsonb(NEW); previous jsonb; archived boolean;
BEGIN
 IF TG_TABLE_NAME='task_actions' THEN
  SELECT is_archived INTO archived FROM public.admin_tasks WHERE id=NEW.task_id FOR UPDATE;
  IF archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived administrative work before changing steps'; END IF;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.is_archived THEN RAISE EXCEPTION 'New administrative records must begin unarchived'; END IF;
 ELSE
  previous:=to_jsonb(OLD);
  IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
   PERFORM _migration.client_contact_require_actor(true);
   IF incoming-ARRAY['is_archived','row_version','updated_at','updated_by'] IS DISTINCT FROM previous-ARRAY['is_archived','row_version','updated_at','updated_by'] THEN RAISE EXCEPTION 'Administrative lifecycle cannot change business fields'; END IF;
  ELSIF OLD.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived administrative record before editing'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER zy_admin_lifecycle_guard BEFORE INSERT OR UPDATE ON public.admin_tasks FOR EACH ROW EXECUTE FUNCTION _migration.admin_lifecycle_guard();
CREATE TRIGGER zy_admin_lifecycle_guard BEFORE INSERT OR UPDATE ON public.task_actions FOR EACH ROW EXECUTE FUNCTION _migration.admin_lifecycle_guard();
CREATE OR REPLACE FUNCTION _migration.admin_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; s record; expected_version bigint; old_version bigint; next_state jsonb; prior_state jsonb;
 task_change boolean; step_changes integer; subject jsonb; previous_subject jsonb; subject_table text; subject_id integer; target_action text; op text;
BEGIN
 SELECT (prior_versions->>p_id::text)::bigint INTO old_version FROM _migration.admin_lifecycle_boundary WHERE singleton;
 expected:=_migration.admin_lifecycle_normalize(_migration.admin_edit_initial_aggregate(p_id));
 expected_version:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.admin_edit_change WHERE task_id=p_id ORDER BY version LOOP
  prior_state:=CASE WHEN c.version<=coalesce(old_version,0) THEN _migration.admin_lifecycle_normalize(c.before_values) ELSE c.before_values END;
  next_state:=CASE WHEN c.version<=coalesce(old_version,0) THEN _migration.admin_lifecycle_normalize(c.after_values) ELSE c.after_values END;
  SELECT * INTO s FROM _migration.admin_edit_submission WHERE task_id=p_id AND result_version=c.version;
  IF NOT FOUND OR s.actor_id<>c.actor_id OR NOT s.changed OR c.version<>expected_version OR prior_state IS DISTINCT FROM expected
   OR jsonb_typeof(next_state->'task'->'is_archived') IS DISTINCT FROM 'boolean'
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(next_state->'steps') x WHERE jsonb_typeof(x->'is_archived') IS DISTINCT FROM 'boolean' OR (x->>'task_id')::integer IS DISTINCT FROM p_id)
   OR (next_state->'task'->>'id')::integer IS DISTINCT FROM p_id
   OR (next_state->'task'->>'row_version')::bigint IS DISTINCT FROM c.version
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='admin_tasks' AND e.entity_schema='public' AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.after_values->>'row_version'=c.version::text AND e.action IN ('record_created','record_updated') AND e.outcome='succeeded') THEN RETURN false; END IF;
  IF c.version>coalesce(old_version,0) THEN
   op:=s.request_payload->>'operation';
   task_change:=expected IS NOT NULL AND (expected->'task'->'is_archived') IS DISTINCT FROM (next_state->'task'->'is_archived');
   SELECT count(*) INTO step_changes FROM jsonb_array_elements(next_state->'steps') n JOIN jsonb_array_elements(coalesce(expected->'steps','[]')) o ON n->'id'=o->'id' WHERE n->'is_archived' IS DISTINCT FROM o->'is_archived';
   IF op IN('task-archive','task-restore','step-archive','step-restore') THEN
    target_action:=split_part(op,'-',2); subject_table:=CASE WHEN op LIKE 'task-%' THEN 'admin_tasks' ELSE 'task_actions' END;
    subject_id:=CASE WHEN op LIKE 'task-%' THEN p_id ELSE s.step_id END;
    IF expected IS NULL OR s.request_payload->'task_id' IS DISTINCT FROM to_jsonb(p_id) OR s.request_payload->'step_id' IS DISTINCT FROM coalesce(to_jsonb(s.step_id),'null'::jsonb)
     OR s.request_payload->>'version' IS DISTINCT FROM (c.version-1)::text
     OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
     OR s.request_payload->'confirmation' IS DISTINCT FROM to_jsonb(subject_id)
     OR (s.request_payload->'facts')-ARRAY['caseNumber','actionDate','result','report','stepArchived'] IS DISTINCT FROM
        jsonb_build_object('taskId',p_id,'stepId',s.step_id,'requiredWork',expected->'task'->'required_work','taskCreatedDate',expected->'task'->'task_created_date',
          'matterId',expected->'task'->'matter_id','matterArchived',false,'taskArchived',expected->'task'->'is_archived',
          'currentSteps',(SELECT count(*) FROM jsonb_array_elements(expected->'steps') n WHERE NOT (n->>'is_archived')::boolean),
          'archivedSteps',(SELECT count(*) FROM jsonb_array_elements(expected->'steps') n WHERE (n->>'is_archived')::boolean)) THEN RETURN false; END IF;
    IF subject_table='admin_tasks' THEN
     subject:=next_state->'task';previous_subject:=expected->'task';
     IF NOT task_change OR step_changes<>0 OR expected->'steps' IS DISTINCT FROM next_state->'steps' OR s.step_id IS NOT NULL THEN RETURN false; END IF;
    ELSE
     SELECT n INTO subject FROM jsonb_array_elements(next_state->'steps') n WHERE (n->>'id')::integer=subject_id;
     SELECT n INTO previous_subject FROM jsonb_array_elements(expected->'steps') n WHERE (n->>'id')::integer=subject_id;
     IF task_change OR step_changes<>1 OR previous_subject IS NULL OR subject IS NULL OR (expected->'task'->>'is_archived')::boolean
      OR (expected->'task')-ARRAY['row_version','updated_at','updated_by'] IS DISTINCT FROM (next_state->'task')-ARRAY['row_version','updated_at','updated_by']
      OR (SELECT coalesce(jsonb_agg(n ORDER BY n->>'id'),'[]') FROM jsonb_array_elements(expected->'steps') n WHERE (n->>'id')::integer<>subject_id) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(n ORDER BY n->>'id'),'[]') FROM jsonb_array_elements(next_state->'steps') n WHERE (n->>'id')::integer<>subject_id) THEN RETURN false; END IF;
    END IF;
    IF (s.request_payload->'facts')-ARRAY['taskId','stepId','requiredWork','taskCreatedDate','matterId','matterArchived','taskArchived','currentSteps','archivedSteps','caseNumber'] IS DISTINCT FROM
       (CASE WHEN s.step_id IS NULL THEN jsonb_build_object('stepArchived',NULL,'actionDate',NULL,'result',NULL,'report',NULL)
       ELSE jsonb_build_object('stepArchived',previous_subject->'is_archived','actionDate',previous_subject->'action_date','result',previous_subject->'result','report',previous_subject->'report') END)
     OR subject->'is_archived' IS DISTINCT FROM to_jsonb(target_action='archive') OR previous_subject->'is_archived'=subject->'is_archived'
     OR subject-ARRAY['is_archived','row_version','updated_at','updated_by'] IS DISTINCT FROM previous_subject-ARRAY['is_archived','row_version','updated_at','updated_by']
     OR (SELECT count(*) FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table=subject_table AND e.entity_key=jsonb_build_object('id',subject_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.action=target_action AND e.outcome='succeeded' AND e.actor_role_snapshot='Administrator')<>1
     OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table=subject_table AND e.entity_key=jsonb_build_object('id',subject_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.action='record_updated' AND e.after_values->'is_archived'=subject->'is_archived' AND e.before_values->'is_archived'=previous_subject->'is_archived' AND e.actor_role_snapshot='Administrator') THEN RETURN false; END IF;
   ELSIF op IN('task-create','task-update','step-create','step-update') THEN
    IF task_change OR step_changes<>0 OR coalesce((expected->'task'->>'is_archived')::boolean,false)
     OR (expected IS NULL AND (next_state->'task'->>'is_archived')::boolean)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(next_state->'steps') n LEFT JOIN jsonb_array_elements(coalesce(expected->'steps','[]')) o ON n->'id'=o->'id' WHERE (o IS NULL AND (n->>'is_archived')::boolean) OR ((o->>'is_archived')::boolean AND n IS DISTINCT FROM o)) THEN RETURN false; END IF;
   ELSE RETURN false;
   END IF;
  END IF;
  expected:=next_state;expected_version:=expected_version+1;
 END LOOP;
 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.admin_edit_aggregate(p_id);
END;
$$;

CREATE OR REPLACE FUNCTION _migration.admin_edit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE incoming jsonb; previous jsonb; allowed text[]; k text; parent integer;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Administrative work history cannot be deleted'; END IF;
 incoming:=to_jsonb(NEW);
 allowed:=CASE WHEN TG_TABLE_NAME='admin_tasks' THEN ARRAY['required_work','assigned_to_person_id','task_created_date','execution_date','result','previous_decision','last_followup','deadline','court_id','circuit','destination_id','status','alert','row_version','is_archived'] ELSE ARRAY['action_date','performed_by_person_id','result','report','is_archived'] END;
 IF TG_OP='UPDATE' THEN
  previous:=to_jsonb(OLD);
  IF incoming-allowed-ARRAY['updated_at','updated_by'] IS DISTINCT FROM previous-allowed-ARRAY['updated_at','updated_by'] THEN RAISE EXCEPTION 'Administrative work identity, parent, source and order are immutable'; END IF;
  IF TG_TABLE_NAME='admin_tasks' AND (incoming->>'row_version')::bigint<>(previous->>'row_version')::bigint+1 THEN RAISE EXCEPTION 'Administrative work version must advance once'; END IF;
 ELSE
  FOR k IN SELECT key FROM jsonb_each(incoming) WHERE key LIKE 'legacy_%' OR key LIKE 'source_%' OR key='next_appointment' LOOP
   IF incoming->k<>'null'::jsonb THEN RAISE EXCEPTION 'Native administrative records cannot invent source or hidden fields'; END IF;
  END LOOP;
  IF TG_TABLE_NAME='task_actions' AND (incoming->>'task_id' IS NULL OR incoming->>'current_order' IS NULL) THEN RAISE EXCEPTION 'New steps require a task and current order'; END IF;
 END IF;
 parent:=CASE WHEN TG_TABLE_NAME='admin_tasks' THEN (incoming->>'matter_id')::integer ELSE (SELECT matter_id FROM public.admin_tasks WHERE id=(incoming->>'task_id')::integer) END;
 IF parent IS NOT NULL THEN
  PERFORM 1 FROM public.matters WHERE id=parent AND NOT is_archived FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before editing administrative work'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_task integer,p_step integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE task jsonb; step jsonb;
BEGIN
 PERFORM _migration.admin_edit_require_account(p_account,p_session,p_role,p_expires,false);
 IF p_task IS NOT NULL THEN
  SELECT jsonb_build_object('id',a.id,'version',a.row_version::text,'matterArchived',coalesce(m.is_archived,false),'archived',a.is_archived,'values',to_jsonb(a)) INTO task FROM public.admin_tasks a LEFT JOIN public.matters m ON m.id=a.matter_id WHERE a.id=p_task;
  IF task IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Administrative work not found'; END IF;
 END IF;
 IF p_step IS NOT NULL THEN
  SELECT jsonb_build_object('id',a.id,'archived',a.is_archived,'values',to_jsonb(a)) INTO step FROM public.task_actions a WHERE a.id=p_step AND a.task_id=p_task;
  IF step IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Step not found for administrative work'; END IF;
 END IF;
 RETURN jsonb_build_object('task',task,'step',step,
  'matters',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.case_number_ar,'context',m.subject,'active',NOT m.is_archived) ORDER BY m.case_number_ar COLLATE "arabic",m.id),'[]') FROM public.matters m WHERE NOT m.is_archived OR m.id=(task->'values'->>'matter_id')::integer),
  'courts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',label_ar,'active',is_active) ORDER BY sort_order,id),'[]') FROM public.lookup_court WHERE is_active OR id=(task->'values'->>'court_id')::integer),
  'destinations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',label_ar,'active',is_active) ORDER BY sort_order,id),'[]') FROM public.lookup_matter_destination WHERE is_active OR id=(task->'values'->>'destination_id')::integer),
  'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name_ar,'active',p.is_active AND p.is_staff) ORDER BY p.name_ar COLLATE "arabic",p.id),'[]') FROM public.people p WHERE (p.is_staff AND p.is_active) OR p.id=(task->'values'->>'assigned_to_person_id')::integer OR p.id=(step->'values'->>'performed_by_person_id')::integer));
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_edit_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; identity integer; step_id integer; expected bigint; submission uuid; receipt _migration.admin_edit_submission%ROWTYPE;
 original jsonb; before_state jsonb; patch jsonb; after_state jsonb; parent integer; parent_archived boolean; version bigint;
 columns text; selections text; assignments text; operation text; is_step boolean; creating boolean; target_table text; next_order integer;
BEGIN
 PERFORM 1 FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE;
 actor:=_migration.admin_edit_require_account(p_account,p_session,p_role,p_expires,true);
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrative actor does not match trusted audit context'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>200000 OR NOT p_request ?& ARRAY['operation','task_id','step_id','version','submission','values'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN('operation','task_id','step_id','version','submission','values')) OR NOT _migration.admin_edit_positive(p_request->'task_id',true) OR NOT _migration.admin_edit_positive(p_request->'step_id',true) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid administrative request'; END IF;
 operation:=p_request->>'operation'; is_step:=operation IN('step-create','step-update'); creating:=operation IN('task-create','step-create');
 IF operation IS NULL OR operation NOT IN('task-create','task-update','step-create','step-update') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid administrative operation'; END IF;
 identity:=(p_request->>'task_id')::integer; step_id:=(p_request->>'step_id')::integer;
 IF (operation='task-create')<>(identity IS NULL) OR (operation='step-update')<>(step_id IS NOT NULL) OR
  (identity IS NULL AND p_request->'version'<>'null'::jsonb) OR (identity IS NOT NULL AND (jsonb_typeof(p_request->'version')<>'string' OR (p_request->>'version') !~ '^[1-9][0-9]{0,18}$')) OR jsonb_typeof(p_request->'submission')<>'string' OR (p_request->>'submission') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid administrative identity or version'; END IF;
 expected:=(p_request->>'version')::bigint; submission:=(p_request->>'submission')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(submission::text,44));
 SELECT * INTO receipt FROM _migration.admin_edit_submission WHERE submission_id=submission;
 IF FOUND THEN
  IF receipt.actor_id<>actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrative submission belongs to another actor'; END IF;
  IF receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Administrative submission payload differs'; END IF;
  RETURN jsonb_build_object('id',receipt.task_id,'stepId',receipt.step_id,'version',receipt.result_version::text,'changed',receipt.changed);
 END IF;
 IF identity IS NULL THEN
  IF NOT (p_request->'values') ?& ARRAY['matter_id','task_created_date'] OR NOT _migration.admin_edit_positive(p_request->'values'->'matter_id',true) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Explicit matter and business date choices required'; END IF;
  parent:=(p_request->'values'->>'matter_id')::integer;
 ELSE
  SELECT matter_id INTO parent FROM public.admin_tasks WHERE id=identity;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Administrative work not found'; END IF;
 END IF;
 IF parent IS NOT NULL THEN
  SELECT is_archived INTO parent_archived FROM public.matters WHERE id=parent FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Existing matter required'; END IF;
  IF parent_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before editing administrative work'; END IF;
 END IF;
 IF identity IS NOT NULL THEN
  SELECT to_jsonb(a) INTO original FROM public.admin_tasks a WHERE id=identity FOR UPDATE;
  IF (original->>'row_version')::bigint<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Administrative version is stale'; END IF;
  IF (original->>'is_archived')::boolean THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived administrative work before editing'; END IF;
  before_state:=_migration.admin_edit_aggregate(identity);
 END IF;
 IF is_step THEN
  original:=NULL;
  IF step_id IS NOT NULL THEN
   SELECT to_jsonb(a) INTO original FROM public.task_actions a WHERE id=step_id AND task_id=identity FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Step does not belong to this administrative work'; END IF;
   IF (original->>'is_archived')::boolean THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived administrative step before editing'; END IF;
  END IF;
 END IF;
 patch:=_migration.admin_edit_validate_values(p_request->'values',original,creating,is_step);
 PERFORM _migration.admin_edit_require_account(p_account,p_session,p_role,p_expires,false);
 IF NOT creating AND patch='{}' THEN RETURN jsonb_build_object('id',identity,'stepId',step_id,'version',expected::text,'changed',false); END IF;
 PERFORM public.audit_ensure_event_context();
 target_table:=CASE WHEN is_step THEN 'task_actions' ELSE 'admin_tasks' END;
 IF creating THEN
  IF is_step THEN
   SELECT greatest(coalesce(max(current_order),0),count(*)::integer) + 1 INTO next_order FROM public.task_actions WHERE task_id=identity;
   patch:=patch||jsonb_build_object('task_id',identity,'current_order',next_order);
  END IF;
  SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('v.%I',key),',' ORDER BY key) INTO columns,selections FROM jsonb_object_keys(patch) key;
  IF is_step THEN
   EXECUTE format('INSERT INTO public.%I(%s,updated_at) SELECT %s,statement_timestamp() FROM jsonb_populate_record(NULL::public.%I,$1) v RETURNING id',target_table,columns,selections,target_table) INTO step_id USING patch;
  ELSE
   EXECUTE format('INSERT INTO public.%I(%s,updated_at) SELECT %s,statement_timestamp() FROM jsonb_populate_record(NULL::public.%I,$1) v RETURNING id',target_table,columns,selections,target_table) INTO identity USING patch;
  END IF;
 ELSE
  SELECT string_agg(format('%I=v.%I',key,key),',' ORDER BY key) INTO assignments FROM jsonb_object_keys(patch) key;
  EXECUTE format('UPDATE public.%I a SET %s%s FROM jsonb_populate_record(NULL::public.%I,$1) v WHERE a.id=$2',target_table,assignments,CASE WHEN is_step THEN '' ELSE ',row_version=a.row_version+1' END,target_table) USING original||patch,CASE WHEN is_step THEN step_id ELSE identity END;
 END IF;
 IF is_step THEN UPDATE public.admin_tasks SET row_version=row_version+1 WHERE id=identity RETURNING row_version INTO version;
 ELSE SELECT row_version INTO version FROM public.admin_tasks WHERE id=identity; END IF;
 after_state:=_migration.admin_edit_aggregate(identity);
 INSERT INTO _migration.admin_edit_change VALUES(identity,version,actor,before_state,after_state,current_setting('litigation.audit_request_id')::uuid);
 INSERT INTO _migration.admin_edit_submission(actor_id,submission_id,request_payload,task_id,result_version,step_id,changed) VALUES(actor,submission,p_request,identity,version,step_id,true);
 RETURN jsonb_build_object('id',identity,'stepId',step_id,'version',version::text,'changed',true);
END;
$$;
DO $permissions$
DECLARE routine regprocedure;
BEGIN
 FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND p.proname LIKE 'admin_lifecycle_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',routine); END LOOP;
END
$permissions$;
GRANT EXECUTE ON FUNCTION public.admin_lifecycle_state(integer,integer,text,timestamptz,integer,integer),public.admin_lifecycle_save(integer,integer,text,timestamptz,jsonb) TO litigation_runtime;
DO $postcondition$
BEGIN
 IF EXISTS(SELECT 1 FROM public.admin_tasks WHERE is_archived OR NOT _migration.admin_edit_current_valid(id)) OR EXISTS(SELECT 1 FROM public.task_actions WHERE is_archived) THEN RAISE EXCEPTION 'Administrative lifecycle initialization differs'; END IF;
END
$postcondition$;
COMMIT;
