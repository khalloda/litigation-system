-- Task69 S4 exact steps and generated missing-parent provenance; isolated candidate.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>86
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20261007200000_task69_step_restoration') THEN RAISE EXCEPTION 'Exact migration86 direct prestate required'; END IF;
END $$;
CREATE OR REPLACE FUNCTION _migration.task69_committed_parent(p_operation uuid,p_issue text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r _migration.task69_receipt%ROWTYPE; origin_xid xid; identity integer; stage text; current_xid numeric; origin_full numeric;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE operation_id=p_operation AND issue_id=p_issue AND phase='apply';
 SELECT xmin INTO origin_xid FROM _migration.task69_receipt WHERE receipt_id=r.receipt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Committed exact parent receipt required before step restoration'; END IF;
 -- xmin can be a subtransaction ID, so comparison to the top-level current ID
 -- alone is insufficient. Require an actually committed transaction status.
 current_xid:=pg_current_xact_id()::text::numeric;
 origin_full:=current_xid-mod(current_xid,4294967296)+origin_xid::text::numeric;
 IF origin_full-current_xid>2147483648 THEN origin_full:=origin_full-4294967296;END IF;
 IF pg_xact_status(origin_full::text::xid8) IS DISTINCT FROM 'committed' THEN RAISE EXCEPTION 'Committed exact parent receipt required before step restoration';END IF;
 SELECT a.stage INTO stage FROM _migration.task69_allowlist a WHERE a.operation_id=p_operation AND a.issue_id=p_issue;
 IF stage<>'S3-admin-parents' AND NOT(stage='shared-dependency' AND p_issue LIKE 'GENERATED-PARENT/%') THEN RAISE EXCEPTION 'Unapproved administrative parent namespace'; END IF;
 identity:=(r.returned_ids->>'taskId')::integer;
 IF identity IS NULL OR _migration.task69_receipt_postimages_valid(r.receipt_id) IS NOT TRUE
 OR NOT EXISTS(SELECT 1 FROM _migration.task69_admin_origin o WHERE o.task_id=identity AND o.receipt_id=r.receipt_id) THEN RAISE EXCEPTION 'Parent receipt/postimages differ'; END IF;
 PERFORM 1 FROM public.admin_tasks WHERE id=identity AND NOT is_archived FOR SHARE;
 IF NOT FOUND OR _migration.admin_edit_current_valid(identity) IS NOT TRUE THEN RAISE EXCEPTION 'Parent missing, archived or lacks complete history'; END IF;
 RETURN identity;
END $$;
CREATE TABLE _migration.task69_step_origin(
 step_id integer PRIMARY KEY REFERENCES public.task_actions(id) ON DELETE RESTRICT,
 receipt_id uuid NOT NULL UNIQUE REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE _migration.task69_step_change(
 task_id integer NOT NULL,version bigint NOT NULL,
 receipt_id uuid NOT NULL UNIQUE REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED,
 PRIMARY KEY(task_id,version),
 FOREIGN KEY(task_id,version) REFERENCES _migration.admin_edit_change(task_id,version) DEFERRABLE INITIALLY DEFERRED
);
REVOKE ALL ON _migration.task69_step_origin,_migration.task69_step_change FROM PUBLIC,litigation_runtime;
CREATE TRIGGER task69_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.task69_step_origin FOR EACH STATEMENT EXECUTE FUNCTION _migration.task69_immutable();
CREATE TRIGGER task69_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.task69_step_change FOR EACH STATEMENT EXECUTE FUNCTION _migration.task69_immutable();
CREATE FUNCTION _migration.task69_generated_expected(p_operation uuid,p_issue text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a _migration.task69_allowlist%ROWTYPE; v jsonb;
BEGIN
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=p_operation AND issue_id=p_issue AND stage='shared-dependency' AND unit_kind='dependency';
 IF NOT FOUND OR p_issue NOT LIKE 'GENERATED-PARENT/%' OR a.payload_text::jsonb->>'id' IS DISTINCT FROM p_issue
 OR a.payload_text::jsonb->>'namespace' IS DISTINCT FROM 'public.admin_tasks'
 OR a.payload_text::jsonb->'contract'->'inventedSourceParent' IS DISTINCT FROM 'false'::jsonb
 OR a.payload_text::jsonb->'contract'->'matter_id' IS DISTINCT FROM 'null'::jsonb
 OR a.payload_text::jsonb->>'sourceTaskId' IS DISTINCT FROM a.payload_text::jsonb->'contract'->>'generatedParentGroup'
 OR nullif(a.payload_text::jsonb->'contract'->>'displayLabel','') IS NULL THEN RAISE EXCEPTION 'Exact generated-parent contract required'; END IF;
 v:=to_jsonb(jsonb_populate_record(NULL::public.admin_tasks,jsonb_build_object('row_version',1,'is_archived',false)))-ARRAY['id','created_at','created_by','updated_at','updated_by'];
 RETURN v;
END $$;
CREATE FUNCTION _migration.task69_generated_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r _migration.task69_receipt%ROWTYPE; a _migration.task69_allowlist%ROWTYPE; d _migration.task69_delta%ROWTYPE;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE receipt_id=p_receipt;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=r.operation_id AND issue_id=r.issue_id;
 IF a.stage<>'shared-dependency' OR r.issue_id NOT LIKE 'GENERATED-PARENT/%' OR r.phase='compensate' THEN RETURN true;END IF;
 SELECT * INTO d FROM _migration.task69_delta WHERE receipt_id=p_receipt AND ordinal=1 AND entity_schema='public' AND entity_table='admin_tasks';
 RETURN FOUND AND d.before_values IS NULL AND d.after_values-ARRAY['id','created_at','created_by','updated_at','updated_by']=_migration.task69_generated_expected(r.operation_id,r.issue_id)
 AND r.expected_delta_count=1 AND r.effect='business-change' AND r.returned_ids=jsonb_build_object('taskId',d.entity_key->'id','assigneeIds','[]'::jsonb)
 AND r.source_occurrences=jsonb_build_array(jsonb_build_object('dependency',a.payload_text::jsonb,'mappings',r.returned_ids))
 AND EXISTS(SELECT 1 FROM _migration.task69_admin_origin WHERE receipt_id=p_receipt AND task_id=(d.entity_key->>'id')::integer);
END $$;
-- This read surface exposes only the approved display context, never a made-up
-- task payload or a current assignment. The source number is not a legacy task.
CREATE FUNCTION public.admin_source_parent_context(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('label',a.payload_text::jsonb->'contract'->>'displayLabel','sourceTaskId',a.payload_text::jsonb->'sourceTaskId')
 FROM _migration.task69_admin_origin o JOIN _migration.task69_receipt r USING(receipt_id)
 JOIN _migration.task69_allowlist a USING(operation_id,issue_id)
 WHERE o.task_id=p_id AND a.stage='shared-dependency' AND r.issue_id LIKE 'GENERATED-PARENT/%' AND r.phase='apply'
$$;
REVOKE ALL ON FUNCTION public.admin_source_parent_context(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_source_parent_context(integer) TO litigation_runtime;
CREATE FUNCTION _migration.task69_step_expected(p_operation uuid,p_issue text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a _migration.task69_allowlist%ROWTYPE; s jsonb; parent jsonb; parent_issue text; identity integer; parent_receipt uuid;
BEGIN
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=p_operation AND issue_id=p_issue AND stage='S4-step-restoration' AND unit_kind='issue';
 IF NOT FOUND THEN RAISE EXCEPTION 'Exact approved S4 issue required'; END IF;
 s:=a.payload_text::jsonb->'step';parent:=s->'parentTask';
 IF s->>'id' IS DISTINCT FROM 'RETURNED_ID:'||p_issue OR jsonb_typeof(s->'report') NOT IN('boolean','null') THEN RAISE EXCEPTION 'Exact historical step shape required'; END IF;
 CASE jsonb_typeof(parent)
 WHEN 'null' THEN IF s->'unassignedSeparateRecord' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'True NULL-parent individual record required'; END IF;
 WHEN 'number' THEN identity:=(parent::text)::integer;
 WHEN 'string' THEN parent_issue:=parent#>>'{}';
 WHEN 'object' THEN parent_issue:='GENERATED-PARENT/'||(parent->>'generatedParentGroup');
 ELSE RAISE EXCEPTION 'Unapproved parent identity shape';END CASE;
 IF parent_issue IS NOT NULL THEN
 SELECT (r.returned_ids->>'taskId')::integer,r.receipt_id INTO identity,parent_receipt FROM _migration.task69_receipt r JOIN _migration.task69_admin_origin o USING(receipt_id)
 WHERE r.operation_id=p_operation AND r.issue_id=parent_issue AND r.phase='apply';
 IF NOT FOUND OR _migration.task69_receipt_valid(parent_receipt) IS NOT TRUE THEN RAISE EXCEPTION 'Exact historical parent receipt required'; END IF;
 END IF;
 RETURN to_jsonb(jsonb_populate_record(NULL::public.task_actions,(s-ARRAY['id','parentTask','unassignedSeparateRecord'])||jsonb_build_object('task_id',identity,'current_order',NULL,'report',s->>'report')))-ARRAY['id','created_at','created_by','updated_at','updated_by'];
END $$;
CREATE FUNCTION _migration.task69_step_insert_allowed(p_row jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op uuid; issue text; parent jsonb; parent_issue text;
BEGIN
 IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RETURN false; END IF;
 op:=nullif(current_setting('litigation.task69_operation',true),'')::uuid;issue:=nullif(current_setting('litigation.task69_issue',true),'');
 IF op IS NULL OR issue IS NULL OR EXISTS(SELECT 1 FROM _migration.task69_receipt WHERE operation_id=op AND issue_id=issue) THEN RETURN false; END IF;
 SELECT payload_text::jsonb->'step'->'parentTask' INTO parent FROM _migration.task69_allowlist WHERE operation_id=op AND issue_id=issue AND stage='S4-step-restoration';IF NOT FOUND THEN RETURN false; END IF;
 IF jsonb_typeof(parent)='string' THEN parent_issue:=parent#>>'{}';ELSIF jsonb_typeof(parent)='object' THEN parent_issue:='GENERATED-PARENT/'||(parent->>'generatedParentGroup');END IF;
 IF parent_issue IS NOT NULL AND _migration.task69_committed_parent(op,parent_issue) IS DISTINCT FROM (p_row->>'task_id')::integer THEN RETURN false; END IF;
 RETURN p_row-ARRAY['id','created_at','created_by','updated_at','updated_by']=_migration.task69_step_expected(op,issue);
END $$;
CREATE FUNCTION _migration.task69_step_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r _migration.task69_receipt%ROWTYPE; a _migration.task69_allowlist%ROWTYPE; d _migration.task69_delta%ROWTYPE; t _migration.task69_delta%ROWTYPE; c _migration.admin_edit_change%ROWTYPE; identity integer; next_steps jsonb;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE receipt_id=p_receipt;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=r.operation_id AND issue_id=r.issue_id;
 IF a.stage<>'S4-step-restoration' OR r.phase='compensate' THEN RETURN true;END IF;
 SELECT * INTO d FROM _migration.task69_delta WHERE receipt_id=p_receipt AND ordinal=1 AND entity_schema='public' AND entity_table='task_actions';
 IF NOT FOUND OR d.before_values IS NOT NULL OR d.after_values-ARRAY['id','created_at','created_by','updated_at','updated_by'] IS DISTINCT FROM _migration.task69_step_expected(r.operation_id,r.issue_id)
 OR NOT EXISTS(SELECT 1 FROM _migration.task69_step_origin WHERE receipt_id=p_receipt AND step_id=(d.entity_key->>'id')::integer) THEN RETURN false;END IF;
 identity:=(d.after_values->>'task_id')::integer;
 IF identity IS NULL THEN
  IF r.expected_delta_count<>1 OR EXISTS(SELECT 1 FROM _migration.task69_step_change WHERE receipt_id=p_receipt) THEN RETURN false;END IF;
 ELSE
  SELECT * INTO t FROM _migration.task69_delta WHERE receipt_id=p_receipt AND ordinal=2 AND entity_schema='public' AND entity_table='admin_tasks' AND entity_key=jsonb_build_object('id',identity);
  IF NOT FOUND OR t.before_values IS NULL OR (t.after_values->>'row_version')::bigint IS DISTINCT FROM (t.before_values->>'row_version')::bigint+1
  OR t.after_values-ARRAY['row_version','updated_at','updated_by'] IS DISTINCT FROM t.before_values-ARRAY['row_version','updated_at','updated_by']
  OR r.expected_delta_count<>2 THEN RETURN false;END IF;
  SELECT h.* INTO c FROM _migration.task69_step_change m JOIN _migration.admin_edit_change h USING(task_id,version) WHERE m.receipt_id=p_receipt;
  IF NOT FOUND OR c.task_id<>identity OR c.version<>(t.after_values->>'row_version')::bigint OR c.actor_id<>r.actor_id OR c.request_id<>r.request_id
   OR c.before_values->'task' IS DISTINCT FROM t.before_values OR c.after_values->'task' IS DISTINCT FROM t.after_values
   OR c.before_values->'assignees' IS DISTINCT FROM c.after_values->'assignees'
   OR EXISTS(SELECT 1 FROM _migration.admin_edit_submission WHERE task_id=c.task_id AND result_version=c.version) THEN RETURN false;END IF;
  SELECT jsonb_agg(x ORDER BY (x->>'id')::integer) INTO next_steps FROM jsonb_array_elements((c.before_values->'steps')||jsonb_build_array(d.after_values)) x;
  IF c.after_values IS DISTINCT FROM jsonb_set(jsonb_set(c.before_values,'{task}',t.after_values),'{steps}',next_steps) THEN RETURN false;END IF;
 END IF;
 RETURN r.effect='business-change' AND r.returned_ids=jsonb_build_object('stepId',d.entity_key->'id','taskId',identity)
 AND r.source_occurrences=jsonb_build_array(jsonb_build_object('source',a.entry_text::jsonb->'source','mappings',r.returned_ids));
END $$;
CREATE FUNCTION _migration.task69_step_receipt_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF _migration.task69_step_receipt_valid(NEW.receipt_id) IS NOT TRUE OR _migration.task69_generated_receipt_valid(NEW.receipt_id) IS NOT TRUE THEN RAISE EXCEPTION 'Task69 step or generated-parent receipt differs from exact approved source';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER task69_step_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_step_receipt_complete();
CREATE CONSTRAINT TRIGGER task69_step_origin_complete AFTER INSERT ON _migration.task69_step_origin DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_step_receipt_complete();
CREATE CONSTRAINT TRIGGER task69_step_change_complete AFTER INSERT ON _migration.task69_step_change DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_step_receipt_complete();

CREATE OR REPLACE FUNCTION _migration.task69_admin_insert_allowed(p_row jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op uuid; issue text; expected jsonb;
BEGIN
 IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RETURN false; END IF;
 op:=nullif(current_setting('litigation.task69_operation',true),'')::uuid;issue:=nullif(current_setting('litigation.task69_issue',true),'');
 IF op IS NULL OR issue IS NULL OR EXISTS(SELECT 1 FROM _migration.task69_receipt WHERE operation_id=op AND issue_id=issue) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM _migration.task69_allowlist WHERE operation_id=op AND issue_id=issue AND stage='shared-dependency' AND issue_id LIKE 'GENERATED-PARENT/%') THEN RETURN p_row-ARRAY['id','created_at','created_by','updated_at','updated_by']=_migration.task69_generated_expected(op,issue); END IF;
 IF NOT EXISTS(SELECT 1 FROM _migration.task69_allowlist WHERE operation_id=op AND issue_id=issue AND stage='S3-admin-parents') THEN RETURN false; END IF;
 expected:=_migration.task69_admin_expected(op,issue);
 RETURN p_row-ARRAY['id','created_at','created_by','updated_at','updated_by']=expected->'task';
END $$;
CREATE OR REPLACE FUNCTION _migration.task69_admin_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r _migration.task69_receipt%ROWTYPE; a _migration.task69_allowlist%ROWTYPE; e jsonb; t _migration.task69_delta%ROWTYPE; m _migration.task69_delta%ROWTYPE; person jsonb; i integer:=0; ids jsonb:='[]';
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE receipt_id=p_receipt; IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=r.operation_id AND issue_id=r.issue_id;
 IF a.stage<>'S3-admin-parents' OR r.phase='compensate' THEN RETURN _migration.task69_generated_receipt_valid(p_receipt); END IF;
 e:=_migration.task69_admin_expected(r.operation_id,r.issue_id);
 SELECT * INTO t FROM _migration.task69_delta WHERE receipt_id=p_receipt AND ordinal=1 AND entity_schema='public' AND entity_table='admin_tasks';
 IF NOT FOUND OR t.before_values IS NOT NULL OR t.after_values-ARRAY['id','created_at','created_by','updated_at','updated_by'] IS DISTINCT FROM e->'task'
 OR NOT EXISTS(SELECT 1 FROM _migration.task69_admin_origin WHERE receipt_id=p_receipt AND task_id=(t.entity_key->>'id')::integer) THEN RETURN false; END IF;
 FOR person IN SELECT value FROM jsonb_array_elements(e->'assignees') LOOP
  i:=i+1;
  SELECT * INTO m FROM _migration.task69_delta WHERE receipt_id=p_receipt AND ordinal=i+1 AND entity_schema='public' AND entity_table='admin_task_assignees';
  IF NOT FOUND OR m.before_values IS NOT NULL OR m.after_values-'id' IS DISTINCT FROM jsonb_build_object('task_id',t.entity_key->'id','person_id',person,'position',i,'is_retired',false) THEN RETURN false; END IF;
  ids:=ids||jsonb_build_array(m.entity_key->'id');
 END LOOP;
 RETURN r.expected_delta_count=i+1 AND r.effect='business-change'
 AND r.returned_ids=jsonb_build_object('taskId',t.entity_key->'id','assigneeIds',ids)
 AND r.source_occurrences=jsonb_build_array(jsonb_build_object('source',a.entry_text::jsonb->'source','mappings',r.returned_ids));
END $$;
CREATE OR REPLACE FUNCTION _migration.admin_edit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE incoming jsonb; previous jsonb; allowed text[]; k text; parent integer; restored boolean:=false;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Administrative work history cannot be deleted'; END IF;
 incoming:=to_jsonb(NEW);
 allowed:=CASE WHEN TG_TABLE_NAME='admin_tasks' THEN ARRAY['required_work','assigned_to_person_id','task_created_date','execution_date','result','previous_decision','last_followup','deadline','court_id','circuit','destination_id','status','alert','row_version','is_archived'] ELSE ARRAY['action_date','performed_by_person_id','result','report','is_archived'] END;
 IF TG_OP='UPDATE' THEN
  previous:=to_jsonb(OLD);
  IF incoming-allowed-ARRAY['updated_at','updated_by'] IS DISTINCT FROM previous-allowed-ARRAY['updated_at','updated_by'] THEN RAISE EXCEPTION 'Administrative work identity, parent, source and order are immutable'; END IF;
  IF TG_TABLE_NAME='admin_tasks' AND (incoming->>'row_version')::bigint<>(previous->>'row_version')::bigint+1 THEN RAISE EXCEPTION 'Administrative work version must advance once'; END IF;
 ELSE
  restored:=CASE WHEN TG_TABLE_NAME='admin_tasks' THEN _migration.task69_admin_insert_allowed(incoming) ELSE _migration.task69_step_insert_allowed(incoming) END;
  FOR k IN SELECT key FROM jsonb_each(incoming) WHERE key LIKE 'legacy_%' OR key LIKE 'source_%' OR key='next_appointment' LOOP
   IF incoming->k<>'null'::jsonb AND NOT restored THEN RAISE EXCEPTION 'Native administrative records cannot invent source or hidden fields'; END IF;
  END LOOP;
  IF TG_TABLE_NAME='task_actions' AND NOT restored AND (incoming->>'task_id' IS NULL OR incoming->>'current_order' IS NULL) THEN RAISE EXCEPTION 'New steps require a task and current order'; END IF;
 END IF;
 parent:=CASE WHEN TG_TABLE_NAME='admin_tasks' THEN (incoming->>'matter_id')::integer ELSE (SELECT matter_id FROM public.admin_tasks WHERE id=(incoming->>'task_id')::integer) END;
 IF parent IS NOT NULL THEN
  PERFORM 1 FROM public.matters WHERE id=parent AND NOT is_archived FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before editing administrative work'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION _migration.admin_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; s record; expected_version bigint; old_version bigint; next_state jsonb; prior_state jsonb;
 task_change boolean; step_changes integer; subject jsonb; previous_subject jsonb; subject_table text; subject_id integer; target_action text; op text; origin_receipt uuid;
BEGIN
 SELECT (prior_versions->>p_id::text)::bigint INTO old_version FROM _migration.admin_lifecycle_boundary WHERE singleton;
 expected:=_migration.admin_lifecycle_normalize(_migration.admin_edit_initial_aggregate(p_id));
  expected:=_migration.task69_admin_at_assignment_boundary(expected);
  expected_version:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.admin_edit_change WHERE task_id=p_id ORDER BY version LOOP
  prior_state:=CASE WHEN c.version<=coalesce(old_version,0) THEN _migration.admin_lifecycle_normalize(c.before_values) ELSE c.before_values END;
  next_state:=CASE WHEN c.version<=coalesce(old_version,0) THEN _migration.admin_lifecycle_normalize(c.after_values) ELSE c.after_values END;
  next_state:=_migration.task69_admin_at_assignment_boundary(next_state);
  SELECT receipt_id INTO origin_receipt FROM _migration.task69_admin_origin WHERE task_id=p_id;
  IF c.version=1 AND origin_receipt IS NOT NULL THEN
   IF expected IS NOT NULL OR c.before_values IS NOT NULL OR next_state IS DISTINCT FROM _migration.task69_admin_initial(p_id)
    OR _migration.task69_admin_receipt_valid(origin_receipt) IS NOT TRUE
    OR NOT EXISTS(SELECT 1 FROM _migration.task69_receipt r WHERE r.receipt_id=origin_receipt AND r.actor_id=c.actor_id AND r.request_id=c.request_id)
    OR EXISTS(SELECT 1 FROM _migration.admin_edit_submission WHERE task_id=p_id AND result_version=c.version) THEN RETURN false; END IF;
  ELSIF EXISTS(SELECT 1 FROM _migration.task69_step_change WHERE task_id=p_id AND version=c.version) THEN
   SELECT receipt_id INTO origin_receipt FROM _migration.task69_step_change WHERE task_id=p_id AND version=c.version;
   IF c.version<>expected_version OR prior_state IS DISTINCT FROM expected
    OR _migration.task69_step_receipt_valid(origin_receipt) IS NOT TRUE THEN RETURN false; END IF;
  ELSE
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
    IF expected ? 'assignees' AND expected->'assignees' IS DISTINCT FROM next_state->'assignees' THEN RETURN false; END IF;
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
    IF op LIKE 'step-%' AND expected ? 'assignees' AND expected->'assignees' IS DISTINCT FROM next_state->'assignees' THEN RETURN false; END IF;
    IF task_change OR step_changes<>0 OR coalesce((expected->'task'->>'is_archived')::boolean,false)
     OR (expected IS NULL AND (next_state->'task'->>'is_archived')::boolean)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(next_state->'steps') n LEFT JOIN jsonb_array_elements(coalesce(expected->'steps','[]')) o ON n->'id'=o->'id' WHERE (o IS NULL AND (n->>'is_archived')::boolean) OR ((o->>'is_archived')::boolean AND n IS DISTINCT FROM o)) THEN RETURN false; END IF;
   ELSE RETURN false;
   END IF;
  END IF;
  END IF;
  expected:=next_state;expected_version:=expected_version+1;
 END LOOP;
 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.admin_edit_aggregate(p_id) AND _migration.task69_admin_assignee_compatibility(p_id) IS TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION _migration.admin_edit_complete() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity integer; receipt uuid;
BEGIN
 identity:=CASE WHEN TG_TABLE_NAME='admin_tasks' THEN (to_jsonb(NEW)->>'id')::integer ELSE (to_jsonb(NEW)->>'task_id')::integer END;
 IF identity IS NULL THEN
  SELECT receipt_id INTO receipt FROM _migration.task69_step_origin WHERE step_id=NEW.id;
  IF receipt IS NULL OR _migration.task69_step_receipt_valid(receipt) IS NOT TRUE
   OR NOT EXISTS(SELECT 1 FROM _migration.task69_delta WHERE receipt_id=receipt AND entity_table='task_actions' AND after_values=to_jsonb(NEW)) THEN RAISE EXCEPTION 'Unassigned historical step lacks exact immutable source receipt';END IF;
 ELSE
  IF _migration.admin_edit_current_valid(identity) IS NOT TRUE THEN RAISE EXCEPTION 'Administrative work aggregate lacks continuous audited change evidence'; END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION _migration.task69_generated_expected(uuid,text) FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION _migration.task69_generated_receipt_valid(uuid) FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION _migration.task69_step_expected(uuid,text) FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION _migration.task69_step_insert_allowed(jsonb) FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION _migration.task69_step_receipt_valid(uuid) FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION _migration.task69_step_receipt_complete() FROM PUBLIC,litigation_runtime;
COMMIT;
