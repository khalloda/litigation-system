BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>93
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20261008030000_task69_compensation') THEN RAISE EXCEPTION 'Exact migration93 direct compensation prestate required';END IF;
END $$;
-- Exact inverse journals preserve restored source rows and every prior audit.
ALTER TABLE _migration.task69_receipt DROP CONSTRAINT task69_receipt_check1;
ALTER TABLE _migration.task69_receipt ADD CONSTRAINT task69_receipt_check1 CHECK(phase='compensate' OR (effect='no-business-write')=(expected_delta_count=0));
CREATE TABLE _migration.task69_compensation_row (
 receipt_id uuid NOT NULL REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED,
 apply_ordinal integer NOT NULL CHECK(apply_ordinal>0),
 entity_table text NOT NULL,
 entity_id integer NOT NULL CHECK(entity_id>0),
 before_values jsonb NOT NULL CHECK(jsonb_typeof(before_values)='object'),
 after_values jsonb NOT NULL CHECK(jsonb_typeof(after_values)='object'),
 PRIMARY KEY(receipt_id,apply_ordinal),UNIQUE(receipt_id,entity_table,entity_id),
 CHECK(before_values->>'id'=entity_id::text AND after_values->>'id'=entity_id::text)
);
CREATE TABLE _migration.task69_compensation_change (
 entity_table text NOT NULL CHECK(entity_table IN('matters','admin_tasks','powers_of_attorney','documents','fee_letters','matter_fee_letter_references')),
 entity_id integer NOT NULL CHECK(entity_id>0),version bigint NOT NULL CHECK(version>1),
 receipt_id uuid NOT NULL REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED,
 PRIMARY KEY(entity_table,entity_id,version),UNIQUE(receipt_id,entity_table,entity_id)
);
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.task69_compensation_row FOR EACH STATEMENT EXECUTE FUNCTION _migration.task69_immutable();
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.task69_compensation_change FOR EACH STATEMENT EXECUTE FUNCTION _migration.task69_immutable();
REVOKE ALL ON _migration.task69_compensation_row,_migration.task69_compensation_change FROM PUBLIC,litigation_runtime;

CREATE FUNCTION _migration.task69_compensation_expected(p_table text,p_original_before jsonb,p_original_after jsonb,p_current jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb:=p_current;k text;
BEGIN
 IF p_current IS NULL OR p_current->'id' IS DISTINCT FROM p_original_after->'id' THEN RAISE EXCEPTION 'Compensation target identity differs';END IF;
 IF p_original_before IS NULL THEN
  CASE
   WHEN p_table IN('matter_parties','matter_party_roles','matter_lawyers','power_of_attorney_lawyers','document_matters','document_responsible_people','fee_letter_matters','matter_fee_letter_references') THEN
    result:=result||'{"is_retired":true}'::jsonb;
    IF p_table IN('document_matters','document_responsible_people') THEN result:=result||'{"position":null}'::jsonb;END IF;
   WHEN p_table IN('admin_tasks','task_actions') THEN result:=result||'{"is_archived":true}'::jsonb;
   WHEN p_table IN('lookup_party_role','lookup_court','lookup_matter_destination') THEN result:=result||'{"is_active":false}'::jsonb;
   WHEN p_table IN('admin_task_assignees','fee_letter_matter_scopes') THEN RETURN result;
   ELSE RAISE EXCEPTION 'Unreviewed compensation insert namespace';
  END CASE;
 ELSE
  IF p_table NOT IN('matters','matter_lawyers','admin_tasks','powers_of_attorney','documents','fee_letters','lookup_matter_destination') THEN RAISE EXCEPTION 'Unreviewed compensation update namespace';END IF;
  FOR k IN SELECT key FROM jsonb_each(p_original_after) WHERE key<>ALL(ARRAY['row_version','created_at','updated_at','created_by','updated_by']) LOOP
   IF p_original_before->k IS DISTINCT FROM p_original_after->k THEN
    IF p_current->k IS DISTINCT FROM p_original_after->k THEN RAISE EXCEPTION 'Compensation field changed after approved write';END IF;
    result:=jsonb_set(result,ARRAY[k],p_original_before->k);
   END IF;
  END LOOP;
 END IF;
 IF result ? 'row_version' THEN result:=result||jsonb_build_object('row_version',(p_current->>'row_version')::bigint+1);END IF;
 RETURN result;
END $$;

CREATE FUNCTION _migration.task69_compensation_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r _migration.task69_receipt%ROWTYPE;prior _migration.task69_receipt%ROWTYPE;d record;x record;next_delta record;actual record;expected jsonb;inverse jsonb;n integer:=0;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE receipt_id=p_receipt;
 IF NOT FOUND THEN RETURN false;END IF;
 IF r.phase<>'compensate' THEN RETURN true;END IF;
 SELECT * INTO prior FROM _migration.task69_receipt WHERE receipt_id=r.prior_receipt_id;
 IF NOT FOUND OR prior.phase<>'apply' OR prior.operation_id<>r.operation_id OR prior.issue_id<>r.issue_id OR prior.payload_sha256<>r.payload_sha256
 OR r.returned_ids IS DISTINCT FROM prior.returned_ids OR r.source_occurrences IS DISTINCT FROM prior.source_occurrences
 OR _migration.task69_receipt_valid(prior.receipt_id) IS NOT TRUE OR _migration.task69_receipt_valid(p_receipt) IS NOT TRUE
 OR (SELECT count(*) FROM _migration.task69_compensation_row WHERE receipt_id=p_receipt)<>prior.expected_delta_count
 OR (SELECT count(*) FROM _migration.task69_compensation_change WHERE receipt_id=p_receipt)<>(SELECT count(DISTINCT (delta_source.entity_table,CASE WHEN delta_source.entity_table='matter_fee_letter_references' THEN delta_source.after_values->>'matter_id' ELSE delta_source.entity_key->>'id' END)) FROM _migration.task69_delta delta_source WHERE delta_source.receipt_id=prior.receipt_id AND delta_source.entity_table IN('matters','admin_tasks','powers_of_attorney','documents','fee_letters','matter_fee_letter_references')) THEN RETURN false;END IF;
 FOR d IN SELECT * FROM _migration.task69_delta WHERE receipt_id=prior.receipt_id ORDER BY ordinal LOOP
  SELECT * INTO x FROM _migration.task69_compensation_row WHERE receipt_id=p_receipt AND apply_ordinal=d.ordinal;
  IF NOT FOUND OR x.entity_table<>d.entity_table OR x.entity_id::text<>d.entity_key->>'id' THEN RETURN false;END IF;
  SELECT * INTO actual FROM _migration.task69_delta WHERE receipt_id=p_receipt AND entity_table=x.entity_table AND entity_key=jsonb_build_object('id',x.entity_id);
  IF x.before_values IS DISTINCT FROM x.after_values THEN
   IF NOT FOUND OR actual.before_values IS DISTINCT FROM x.before_values OR actual.after_values IS DISTINCT FROM x.after_values THEN RETURN false;END IF;
   n:=n+1;
  ELSIF FOUND THEN RETURN false;END IF;
  expected:=d.after_values;
  FOR next_delta IN SELECT nd.* FROM _migration.task69_delta nd JOIN _migration.task69_receipt nr USING(receipt_id)
   WHERE nr.operation_id=r.operation_id AND nd.entity_table=d.entity_table AND nd.entity_key=d.entity_key
    AND nd.audit_event_id>d.audit_event_id AND nd.audit_event_id<coalesce(actual.audit_event_id,9223372036854775807)
    AND nd.receipt_id<>p_receipt ORDER BY nd.audit_event_id LOOP
   IF next_delta.before_values IS DISTINCT FROM expected OR _migration.task69_receipt_valid(next_delta.receipt_id) IS NOT TRUE THEN RETURN false;END IF;
   expected:=next_delta.after_values;
  END LOOP;
  IF expected IS DISTINCT FROM x.before_values THEN RETURN false;END IF;
  inverse:=_migration.task69_compensation_expected(d.entity_table,d.before_values,d.after_values,x.before_values);
  IF inverse-ARRAY['updated_at','updated_by'] IS DISTINCT FROM x.after_values-ARRAY['updated_at','updated_by']
   OR (x.before_values IS DISTINCT FROM x.after_values AND x.after_values ? 'updated_by' AND (x.after_values->>'updated_by')::integer IS DISTINCT FROM r.actor_id) THEN RETURN false;END IF;
 END LOOP;
 RETURN n=r.expected_delta_count;
END $$;

-- Flatten only known current aggregate shapes. No generic arbitrary table writes.
CREATE FUNCTION _migration.task69_compensation_aggregate_rows(p_table text,p_value jsonb) RETURNS TABLE(entity_table text,entity_id integer,value jsonb)
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pair record;item jsonb;mapping jsonb;
BEGIN
 IF p_table='documents' THEN entity_table:='documents';value:=p_value-ARRAY['matters','people'];entity_id:=(value->>'id')::integer;RETURN NEXT;
  mapping:='{"matters":"document_matters","people":"document_responsible_people"}';
 ELSIF p_table='matters' THEN mapping:='{"matter":"matters","parties":"matter_parties","capacities":"matter_party_roles","lawyers":"matter_lawyers"}';
 ELSIF p_table='admin_tasks' THEN mapping:='{"task":"admin_tasks","steps":"task_actions","assignees":"admin_task_assignees"}';
 ELSIF p_table='powers_of_attorney' THEN mapping:='{"poa":"powers_of_attorney","lawyers":"power_of_attorney_lawyers"}';
 ELSIF p_table='fee_letters' THEN mapping:='{"feeLetter":"fee_letters","covered":"fee_letter_matters"}';
 ELSIF p_table='matter_fee_letter_references' THEN mapping:='{"references":"matter_fee_letter_references"}';
 ELSE RAISE EXCEPTION 'Unknown compensation aggregate';END IF;
 FOR pair IN SELECT * FROM jsonb_each_text(mapping) LOOP
  FOR item IN SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_value->pair.key)='array' THEN p_value->pair.key ELSE jsonb_build_array(p_value->pair.key) END) e LOOP
   IF jsonb_typeof(item)<>'object' OR item->>'id' IS NULL THEN RAISE EXCEPTION 'Invalid compensation aggregate row';END IF;
   entity_table:=pair.value;value:=item;entity_id:=(item->>'id')::integer;RETURN NEXT;
  END LOOP;
 END LOOP;
END $$;

CREATE FUNCTION _migration.task69_compensation_change_valid(p_table text,p_id integer,p_version bigint,p_before jsonb,p_after jsonb,p_actor integer,p_request uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r _migration.task69_receipt%ROWTYPE;
BEGIN
 SELECT r0.* INTO r FROM _migration.task69_compensation_change b JOIN _migration.task69_receipt r0 USING(receipt_id) WHERE b.entity_table=p_table AND b.entity_id=p_id AND b.version=p_version;
 IF NOT FOUND OR r.actor_id<>p_actor OR r.request_id<>p_request OR r.phase<>'compensate' OR _migration.task69_compensation_receipt_valid(r.receipt_id) IS NOT TRUE THEN RETURN false;END IF;
 IF p_table='matter_fee_letter_references' AND (p_before->>'matterId'<>p_id::text OR p_after->>'matterId'<>p_id::text OR (p_after->>'version')::bigint<>p_version OR (p_before->>'version')::bigint<>p_version-1) THEN RETURN false;END IF;
 RETURN NOT EXISTS(
  SELECT 1 FROM _migration.task69_compensation_aggregate_rows(p_table,p_before) b FULL JOIN _migration.task69_compensation_aggregate_rows(p_table,p_after) a USING(entity_table,entity_id)
  WHERE b.value IS NULL OR a.value IS NULL OR (b.value IS DISTINCT FROM a.value AND NOT EXISTS(SELECT 1 FROM _migration.task69_compensation_row x WHERE x.receipt_id=r.receipt_id AND x.entity_table=b.entity_table AND x.entity_id=b.entity_id AND x.before_values=b.value AND x.after_values=a.value))
 );
END $$;


CREATE FUNCTION _migration.task69_compensation_binding_valid(p_table text,p_id integer,p_version bigint) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tbl text;col text;c record;
BEGIN
 SELECT x.tbl,x.col INTO tbl,col FROM (VALUES ('matters','matter_edit_change','matter_id'),('admin_tasks','admin_edit_change','task_id'),('powers_of_attorney','poa_edit_change','poa_id'),('documents','document_edit_change','document_id'),('fee_letters','fee_letter_edit_change','fee_letter_id'),('matter_fee_letter_references','matter_fee_reference_change','matter_id')) x(kind,tbl,col) WHERE x.kind=p_table;
 IF tbl IS NULL THEN RETURN false;END IF;
 EXECUTE format('SELECT * FROM _migration.%I WHERE %I=$1 AND version=$2',tbl,col) INTO c USING p_id,p_version;
 IF c.version IS NULL THEN RETURN false;END IF;
 RETURN _migration.task69_compensation_change_valid(p_table,p_id,p_version,c.before_values,c.after_values,c.actor_id,c.request_id);
END $$;

CREATE FUNCTION _migration.task69_compensation_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM _migration.task69_compensation_change b WHERE b.receipt_id=NEW.receipt_id AND _migration.task69_compensation_binding_valid(b.entity_table,b.entity_id,b.version) IS NOT TRUE) OR _migration.task69_compensation_receipt_valid(NEW.receipt_id) IS NOT TRUE THEN RAISE EXCEPTION 'Task69 compensation differs from exact original inverse and audit';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER task69_compensation_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_compensation_complete();
CREATE CONSTRAINT TRIGGER task69_compensation_complete AFTER INSERT ON _migration.task69_compensation_row DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_compensation_complete();
CREATE CONSTRAINT TRIGGER task69_compensation_complete AFTER INSERT ON _migration.task69_compensation_change DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_compensation_complete();

CREATE OR REPLACE FUNCTION _migration.admin_edit_current_valid(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public
 SET "TimeZone" TO 'UTC'
AS $$
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
  IF EXISTS(SELECT 1 FROM _migration.task69_compensation_change WHERE entity_table='admin_tasks' AND entity_id=p_id AND version=c.version) THEN
   IF c.version<>expected_version OR prior_state IS DISTINCT FROM expected OR _migration.task69_compensation_change_valid('admin_tasks',p_id,c.version,prior_state,next_state,c.actor_id,c.request_id) IS NOT TRUE THEN RETURN false;END IF;
   expected:=next_state;expected_version:=expected_version+1;CONTINUE;
  END IF;
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
$$
;

CREATE OR REPLACE FUNCTION _migration.document_edit_current_valid(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public
AS $$
DECLARE expected jsonb:=_migration.document_edit_initial_aggregate(p_id); c record; s record; v bigint; op text; patch jsonb; prior_state jsonb; next_state jsonb; boundary_version bigint;restoration uuid;
BEGIN
 expected:=_migration.task69_document_at_relationship_boundary(expected);
 SELECT version INTO boundary_version FROM _migration.task69_document_relationship_boundary WHERE document_id=p_id;
 v:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.document_edit_change WHERE document_id=p_id ORDER BY version LOOP
  prior_state:=_migration.task69_document_at_relationship_boundary(c.before_values);
  next_state:=_migration.task69_document_at_relationship_boundary(c.after_values);
  IF EXISTS(SELECT 1 FROM _migration.task69_compensation_change WHERE entity_table='documents' AND entity_id=p_id AND version=c.version) THEN
   IF c.version<>v OR prior_state IS DISTINCT FROM expected OR _migration.task69_compensation_change_valid('documents',p_id,c.version,prior_state,next_state,c.actor_id,c.request_id) IS NOT TRUE THEN RETURN false;END IF;
   expected:=next_state;v:=v+1;CONTINUE;
  END IF;
  SELECT receipt_id INTO restoration FROM _migration.task69_document_change WHERE document_id=p_id AND version=c.version;
  IF restoration IS NOT NULL THEN
   IF c.version<>v OR prior_state IS DISTINCT FROM expected OR _migration.task69_document_receipt_valid(restoration) IS NOT TRUE THEN RETURN false;END IF;
   expected:=next_state;v:=v+1;CONTINUE;
  END IF;
  SELECT * INTO s FROM _migration.document_edit_submission WHERE document_id=p_id AND result_version=c.version;
	  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR prior_state IS DISTINCT FROM expected
	   OR NOT _migration.tasks46_47_receipt_valid('documents',s.actor_id,s.request_payload,p_id,c.version)
	   OR s.submission_id::text<>s.request_payload->>'submission'
	   OR (next_state->>'id')::integer<>p_id OR (next_state->>'row_version')::bigint<>v
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public'
    AND e.entity_table='documents' AND e.entity_key=jsonb_build_object('id',p_id)
    AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.outcome='succeeded'
	    AND e.after_values->>'row_version'=v::text) THEN RETURN false; END IF;
	  op:=s.request_payload->>'operation';
	  IF op IN('create','update') THEN
	   BEGIN patch:=_migration.document_edit_values(s.request_payload->'values',prior_state,op='create');
	   EXCEPTION WHEN OTHERS THEN RETURN false; END;
     IF c.version>coalesce(boundary_version,0) THEN
      patch:=patch||jsonb_build_object('matter_id',CASE WHEN jsonb_array_length(_migration.task69_document_desired(prior_state,'matters',s.request_payload->'values',s.request_payload->'related'))=1 THEN _migration.task69_document_desired(prior_state,'matters',s.request_payload->'values',s.request_payload->'related')->0 ELSE 'null'::jsonb END,
       'responsible_person_id',CASE WHEN jsonb_array_length(_migration.task69_document_desired(prior_state,'people',s.request_payload->'values',s.request_payload->'related'))=1 THEN _migration.task69_document_desired(prior_state,'people',s.request_payload->'values',s.request_payload->'related')->0 ELSE 'null'::jsonb END);
     END IF;
	   IF op='create' THEN
	    IF prior_state IS NOT NULL OR NOT next_state @> patch THEN RETURN false; END IF;
	   ELSIF next_state-ARRAY['row_version','updated_at','updated_by','matters','people']
	    IS DISTINCT FROM (prior_state||patch)-ARRAY['row_version','updated_at','updated_by','matters','people'] THEN RETURN false; END IF;
	  ELSIF prior_state IS NULL OR next_state-ARRAY['row_version','updated_at','updated_by','is_archived','matters','people']
	   IS DISTINCT FROM prior_state-ARRAY['row_version','updated_at','updated_by','is_archived','matters','people']
	   OR (next_state->>'is_archived')::boolean IS DISTINCT FROM (op='archive') THEN RETURN false;
	  END IF;
  IF c.version>coalesce(boundary_version,0) AND _migration.task69_document_membership_history(prior_state,next_state,s.request_payload,c.actor_id,c.request_id) IS NOT TRUE THEN RETURN false;END IF;
  expected:=next_state; v:=v+1;
 END LOOP;
	 IF EXISTS(SELECT 1 FROM _migration.document_edit_submission sr WHERE sr.document_id=p_id
	  AND NOT EXISTS(SELECT 1 FROM _migration.document_edit_change ch WHERE ch.document_id=sr.document_id AND ch.version=sr.result_version AND ch.actor_id=sr.actor_id)) THEN RETURN false; END IF;
	 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.document_edit_aggregate(p_id) AND _migration.task69_document_compatibility(p_id);
END;
$$
;

CREATE OR REPLACE FUNCTION _migration.fee_letter_edit_current_valid(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public
AS $$
DECLARE expected jsonb:=_migration.fee_letter_edit_initial_aggregate(p_id); c record; s record; restoration uuid; v bigint;
 op text; patch jsonb; member integer; matter integer; before_member jsonb; after_member jsonb;
BEGIN
 v:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.fee_letter_edit_change WHERE fee_letter_id=p_id ORDER BY version LOOP
  IF EXISTS(SELECT 1 FROM _migration.task69_compensation_change WHERE entity_table='fee_letters' AND entity_id=p_id AND version=c.version) THEN
   IF c.version<>v OR c.before_values IS DISTINCT FROM expected OR _migration.task69_compensation_change_valid('fee_letters',p_id,c.version,c.before_values,c.after_values,c.actor_id,c.request_id) IS NOT TRUE THEN RETURN false;END IF;
   expected:=c.after_values;v:=v+1;CONTINUE;
  END IF;
  SELECT receipt_id INTO restoration FROM _migration.task69_fee_change WHERE entity_table='fee_letters' AND entity_id=p_id AND version=c.version;
  IF restoration IS NOT NULL THEN
   IF c.version<>v OR c.before_values IS DISTINCT FROM expected OR _migration.task69_fee_receipt_valid(restoration) IS NOT TRUE THEN RETURN false;END IF;
   expected:=c.after_values;v:=v+1;CONTINUE;
  END IF;
  SELECT * INTO s FROM _migration.fee_letter_edit_submission WHERE fee_letter_id=p_id AND result_version=c.version;
	  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR c.before_values IS DISTINCT FROM expected
	   OR NOT _migration.tasks46_47_receipt_valid('fee_letters',s.actor_id,s.request_payload,p_id,c.version)
	   OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR (c.after_values->'feeLetter'->>'id')::integer<>p_id
   OR (c.after_values->'feeLetter'->>'row_version')::bigint<>v
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public'
    AND e.entity_table='fee_letters' AND e.entity_key=jsonb_build_object('id',p_id)
    AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.outcome='succeeded'
	    AND e.after_values->>'row_version'=v::text) THEN RETURN false; END IF;
	  op:=s.request_payload->>'operation';
	  IF op IN('create','update') THEN
	   BEGIN patch:=_migration.fee_letter_edit_values(s.request_payload->'values',c.before_values->'feeLetter',op='create');
	   EXCEPTION WHEN OTHERS THEN RETURN false; END;
	   IF op='create' THEN
	    IF c.before_values IS NOT NULL OR NOT c.after_values->'feeLetter' @> patch OR c.after_values->'covered'<>'[]' THEN RETURN false; END IF;
	   ELSIF c.after_values->'covered' IS DISTINCT FROM c.before_values->'covered'
	    OR (c.after_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by']
	    IS DISTINCT FROM ((c.before_values->'feeLetter')||patch)-ARRAY['row_version','updated_at','updated_by'] THEN RETURN false; END IF;
	  ELSIF op IN('archive','restore') THEN
	   IF c.after_values->'covered' IS DISTINCT FROM c.before_values->'covered'
	    OR (c.after_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by','is_archived']
	    IS DISTINCT FROM (c.before_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by','is_archived']
	    OR (c.after_values->'feeLetter'->>'is_archived')::boolean IS DISTINCT FROM (op='archive') THEN RETURN false; END IF;
	  ELSE
	   member:=(s.request_payload->'related'->>'membershipId')::integer;
	   matter:=(s.request_payload->'related'->>'matterId')::integer;
	   IF (c.after_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by']
	    IS DISTINCT FROM (c.before_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by'] THEN RETURN false; END IF;
	   IF op='covered-add' THEN
	    IF member IS NOT NULL OR matter IS NULL
	     OR jsonb_array_length(c.after_values->'covered')<>coalesce(jsonb_array_length(c.before_values->'covered'),0)+1
	     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'covered') e
	      WHERE (e->>'matter_id')::integer=matter AND NOT (e->>'is_retired')::boolean AND e->>'legacy_source_record_key' IS NULL)
	     OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'covered') b
	      WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'covered') a WHERE a IS NOT DISTINCT FROM b)) THEN RETURN false; END IF;
	   ELSE
	    SELECT e INTO before_member FROM jsonb_array_elements(c.before_values->'covered') e WHERE (e->>'id')::integer=member;
	    SELECT e INTO after_member FROM jsonb_array_elements(c.after_values->'covered') e WHERE (e->>'id')::integer=member;
	    IF member IS NULL OR before_member IS NULL OR after_member IS NULL
	     OR jsonb_array_length(c.after_values->'covered')<>jsonb_array_length(c.before_values->'covered')
	     OR before_member-ARRAY['is_retired','updated_at','updated_by']
	      IS DISTINCT FROM after_member-ARRAY['is_retired','updated_at','updated_by']
	     OR (before_member->>'is_retired')::boolean IS DISTINCT FROM (op='covered-restore')
	     OR (after_member->>'is_retired')::boolean IS DISTINCT FROM (op='covered-retire')
	     OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'covered') b
	      WHERE (b->>'id')::integer<>member AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'covered') a WHERE a IS NOT DISTINCT FROM b)) THEN RETURN false; END IF;
	   END IF;
	  END IF;
  expected:=c.after_values; v:=v+1;
 END LOOP;
	 IF EXISTS(SELECT 1 FROM _migration.fee_letter_edit_submission sr WHERE sr.fee_letter_id=p_id
	  AND NOT EXISTS(SELECT 1 FROM _migration.fee_letter_edit_change ch WHERE ch.fee_letter_id=sr.fee_letter_id AND ch.version=sr.result_version AND ch.actor_id=sr.actor_id)) THEN RETURN false; END IF;
	 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.fee_letter_edit_aggregate(p_id);
END;
$$
;

CREATE OR REPLACE FUNCTION _migration.matter_fee_reference_current_valid(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public
AS $$
DECLARE expected jsonb:=_migration.matter_fee_reference_initial_aggregate(p_id); c record; s record; restoration uuid; v bigint:=2;
 op text; old_fee integer; new_fee integer; before_current integer; after_current integer;
 before_active integer; after_active integer; before_count integer; after_count integer;
 before_old jsonb; after_old jsonb; before_new jsonb; after_new jsonb;
BEGIN
 FOR c IN SELECT * FROM _migration.matter_fee_reference_change WHERE matter_id=p_id ORDER BY version LOOP
  IF EXISTS(SELECT 1 FROM _migration.task69_compensation_change WHERE entity_table='matter_fee_letter_references' AND entity_id=p_id AND version=c.version) THEN
   IF c.version<>v OR c.before_values IS DISTINCT FROM expected OR _migration.task69_compensation_change_valid('matter_fee_letter_references',p_id,c.version,c.before_values,c.after_values,c.actor_id,c.request_id) IS NOT TRUE THEN RETURN false;END IF;
   expected:=c.after_values;v:=v+1;CONTINUE;
  END IF;
  SELECT receipt_id INTO restoration FROM _migration.task69_fee_change WHERE entity_table='matter_fee_letter_references' AND entity_id=p_id AND version=c.version;
  IF restoration IS NOT NULL THEN
   IF c.version<>v OR c.before_values IS DISTINCT FROM expected OR _migration.task69_fee_receipt_valid(restoration) IS NOT TRUE THEN RETURN false;END IF;
   expected:=c.after_values;v:=v+1;CONTINUE;
  END IF;
  SELECT * INTO s FROM _migration.matter_fee_reference_submission WHERE matter_id=p_id AND result_version=c.version;
	  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR c.before_values IS DISTINCT FROM expected
	   OR NOT _migration.tasks46_47_receipt_valid('matter_fee_references',s.actor_id,s.request_payload,p_id,c.version)
	   OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR c.after_values->>'matterId'<>p_id::text OR c.after_values->>'version'<>v::text
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public'
    AND e.entity_table='matter_fee_letter_references' AND e.actor_id=c.actor_id
	    AND e.request_id=c.request_id AND e.outcome='succeeded') THEN RETURN false; END IF;
	  op:=s.request_payload->>'operation'; old_fee:=(s.request_payload->'related'->>'oldFeeLetterId')::integer;
	  new_fee:=(s.request_payload->'related'->>'newFeeLetterId')::integer;
	  IF jsonb_typeof(c.before_values->'references')<>'array'
	   OR jsonb_typeof(c.after_values->'references')<>'array'
	   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'references') e
	    WHERE jsonb_typeof(e)<>'object' OR (e->>'matter_id')::integer IS DISTINCT FROM p_id)
	   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'references') e
	    WHERE jsonb_typeof(e)<>'object' OR (e->>'matter_id')::integer IS DISTINCT FROM p_id)
	   OR (SELECT count(*) FROM jsonb_array_elements(c.before_values->'references'))
	      IS DISTINCT FROM (SELECT count(DISTINCT (e->>'id')::integer) FROM jsonb_array_elements(c.before_values->'references') e)
	   OR (SELECT count(*) FROM jsonb_array_elements(c.after_values->'references'))
	      IS DISTINCT FROM (SELECT count(DISTINCT (e->>'id')::integer) FROM jsonb_array_elements(c.after_values->'references') e)
	   OR (SELECT count(*) FROM jsonb_array_elements(c.before_values->'references'))
	      IS DISTINCT FROM (SELECT count(DISTINCT (e->>'fee_letter_id')::integer) FROM jsonb_array_elements(c.before_values->'references') e)
	   OR (SELECT count(*) FROM jsonb_array_elements(c.after_values->'references'))
	      IS DISTINCT FROM (SELECT count(DISTINCT (e->>'fee_letter_id')::integer) FROM jsonb_array_elements(c.after_values->'references') e)
	  THEN RETURN false; END IF;
	  SELECT count(*)::integer,min((e->>'fee_letter_id')::integer)
	   INTO before_active,before_current FROM jsonb_array_elements(c.before_values->'references') e
	   WHERE NOT (e->>'is_retired')::boolean;
	  SELECT count(*)::integer,min((e->>'fee_letter_id')::integer)
	   INTO after_active,after_current FROM jsonb_array_elements(c.after_values->'references') e
	   WHERE NOT (e->>'is_retired')::boolean;
	  SELECT count(*)::integer INTO before_count FROM jsonb_array_elements(c.before_values->'references');
	  SELECT count(*)::integer INTO after_count FROM jsonb_array_elements(c.after_values->'references');
	  SELECT e INTO before_old FROM jsonb_array_elements(c.before_values->'references') e
	   WHERE (e->>'fee_letter_id')::integer=old_fee;
	  SELECT e INTO after_old FROM jsonb_array_elements(c.after_values->'references') e
	   WHERE (e->>'fee_letter_id')::integer=old_fee;
	  SELECT e INTO before_new FROM jsonb_array_elements(c.before_values->'references') e
	   WHERE (e->>'fee_letter_id')::integer=new_fee;
	  SELECT e INTO after_new FROM jsonb_array_elements(c.after_values->'references') e
	   WHERE (e->>'fee_letter_id')::integer=new_fee;
	  IF (op='set' AND (old_fee IS NOT NULL OR new_fee IS NULL OR before_active<>0
	      OR after_active<>1 OR after_current IS DISTINCT FROM new_fee))
	   OR (op='clear' AND (old_fee IS NULL OR new_fee IS NOT NULL OR before_active<>1
	      OR before_current IS DISTINCT FROM old_fee OR after_active<>0))
	   OR (op='replace' AND (old_fee IS NULL OR new_fee IS NULL OR old_fee=new_fee
	      OR before_active<>1 OR before_current IS DISTINCT FROM old_fee
	      OR after_active<>1 OR after_current IS DISTINCT FROM new_fee))
	   OR (old_fee IS NOT NULL AND (before_old IS NULL OR after_old IS NULL
	      OR (before_old->>'is_retired')::boolean
	      OR NOT (after_old->>'is_retired')::boolean
	      OR after_old-ARRAY['is_retired','updated_at','updated_by']
	         IS DISTINCT FROM before_old-ARRAY['is_retired','updated_at','updated_by']
	      OR (after_old->>'updated_by')::integer IS DISTINCT FROM c.actor_id))
	   OR (new_fee IS NOT NULL AND (after_new IS NULL OR (after_new->>'is_retired')::boolean))
	   OR (new_fee IS NOT NULL AND before_new IS NOT NULL AND (
	      NOT (before_new->>'is_retired')::boolean
	      OR after_new-ARRAY['is_retired','updated_at','updated_by']
	         IS DISTINCT FROM before_new-ARRAY['is_retired','updated_at','updated_by']
	      OR (after_new->>'updated_by')::integer IS DISTINCT FROM c.actor_id))
	   OR (new_fee IS NOT NULL AND before_new IS NULL AND (
	      after_count<>before_count+1
	      OR (after_new->>'matter_id')::integer IS DISTINCT FROM p_id
	      OR (after_new->>'fee_letter_id')::integer IS DISTINCT FROM new_fee
	      OR after_new->'identifier_space'<>'null' OR after_new->'legacy_reference_raw'<>'null'
	      OR after_new->'legacy_source_record_key'<>'null'
	      OR after_new->'legacy_source_extraction_sha256'<>'null'
	      OR after_new->'legacy_source_payload'<>'null'
	      OR (after_new->>'created_by')::integer IS DISTINCT FROM c.actor_id
	      OR (after_new->>'updated_by')::integer IS DISTINCT FROM c.actor_id))
	   OR (new_fee IS NOT NULL AND before_new IS NOT NULL AND after_count<>before_count)
	   OR (new_fee IS NULL AND after_count<>before_count)
	   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'references') b
	      WHERE (b->>'fee_letter_id')::integer IS DISTINCT FROM old_fee
	        AND (b->>'fee_letter_id')::integer IS DISTINCT FROM new_fee
	        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'references') a
	         WHERE a IS NOT DISTINCT FROM b))
	   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'references') a
	      WHERE (a->>'fee_letter_id')::integer IS DISTINCT FROM old_fee
	        AND (a->>'fee_letter_id')::integer IS DISTINCT FROM new_fee
	        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'references') b
	         WHERE b IS NOT DISTINCT FROM a))
	  THEN RETURN false; END IF;
  expected:=c.after_values; v:=v+1;
 END LOOP;
	 IF EXISTS(SELECT 1 FROM _migration.matter_fee_reference_submission sr WHERE sr.matter_id=p_id
	  AND NOT EXISTS(SELECT 1 FROM _migration.matter_fee_reference_change ch WHERE ch.matter_id=sr.matter_id AND ch.version=sr.result_version AND ch.actor_id=sr.actor_id)) THEN RETURN false; END IF;
	 RETURN expected IS NOT DISTINCT FROM _migration.matter_fee_reference_aggregate(p_id);
END;
$$
;

CREATE OR REPLACE FUNCTION _migration.poa_edit_current_valid(p_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public
 SET "TimeZone" TO 'UTC'
AS $$
DECLARE expected jsonb:=_migration.poa_edit_initial_aggregate(p_id); c record; s record; v bigint; op text; prior jsonb; next_row jsonb; member jsonb; old_member jsonb; selected jsonb; k text; restoration uuid;
BEGIN
 v:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.poa_edit_change WHERE poa_id=p_id ORDER BY version LOOP
  IF EXISTS(SELECT 1 FROM _migration.task69_compensation_change WHERE entity_table='powers_of_attorney' AND entity_id=p_id AND version=c.version) THEN
   IF c.version<>v OR c.before_values IS DISTINCT FROM expected OR _migration.task69_compensation_change_valid('powers_of_attorney',p_id,c.version,c.before_values,c.after_values,c.actor_id,c.request_id) IS NOT TRUE THEN RETURN false;END IF;
   expected:=c.after_values;v:=v+1;CONTINUE;
  END IF;
  SELECT receipt_id INTO restoration FROM _migration.task69_poa_change WHERE poa_id=p_id AND version=c.version;
  IF restoration IS NOT NULL THEN
   IF c.version<>v OR c.before_values IS DISTINCT FROM expected OR _migration.task69_poa_receipt_valid(restoration) IS NOT TRUE THEN RETURN false;END IF;
   expected:=c.after_values;v:=v+1;CONTINUE;
  END IF;
  SELECT * INTO s FROM _migration.poa_edit_submission WHERE poa_id=p_id AND result_version=c.version;
  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR c.before_values IS DISTINCT FROM expected
   OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR (c.after_values->'poa'->>'id')::integer IS DISTINCT FROM p_id
   OR (c.after_values->'poa'->>'row_version')::bigint IS DISTINCT FROM v
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='powers_of_attorney' AND e.entity_schema='public' AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.after_values->>'row_version'=v::text AND e.action IN('record_created','record_updated') AND e.outcome='succeeded') THEN RETURN false; END IF;
  op:=s.request_payload->>'operation'; prior:=expected->'poa'; next_row:=c.after_values->'poa';
  IF op NOT IN('create','update','archive','restore') OR (op='create')<>(expected IS NULL)
   OR (op<>'create' AND (s.request_payload->>'id' IS DISTINCT FROM p_id::text OR s.request_payload->>'version' IS DISTINCT FROM (v-1)::text)) THEN RETURN false; END IF;
  IF NOT _migration.poa_edit_audit_matches('powers_of_attorney',prior,next_row,c.actor_id,c.request_id) THEN RETURN false; END IF;
  IF op IN('archive','restore') THEN
   IF next_row-ARRAY['is_archived','row_version','updated_at','updated_by'] IS DISTINCT FROM prior-ARRAY['is_archived','row_version','updated_at','updated_by']
    OR next_row->'is_archived' IS DISTINCT FROM to_jsonb(op='archive') OR next_row->'is_archived' IS NOT DISTINCT FROM prior->'is_archived'
    OR c.after_values->'lawyers' IS DISTINCT FROM expected->'lawyers'
    OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='powers_of_attorney' AND e.entity_key=jsonb_build_object('id',p_id) AND e.request_id=c.request_id AND e.actor_id=c.actor_id AND e.action=op AND e.outcome='succeeded' AND e.actor_role_snapshot='Administrator')
    OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='powers_of_attorney' AND e.entity_key=jsonb_build_object('id',p_id) AND e.request_id=c.request_id AND e.actor_id=c.actor_id AND e.action='record_updated' AND e.after_values->>'row_version'=v::text AND e.actor_role_snapshot='Administrator') THEN RETURN false; END IF;
  ELSE
   IF next_row->'is_archived' IS DISTINCT FROM 'false'::jsonb OR (prior IS NOT NULL AND prior->'is_archived'<>'false'::jsonb) THEN RETURN false; END IF;
   IF prior IS NOT NULL AND next_row-ARRAY['client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report','row_version','updated_at','updated_by'] IS DISTINCT FROM prior-ARRAY['client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report','row_version','updated_at','updated_by'] THEN RETURN false; END IF;
   FOREACH k IN ARRAY ARRAY['client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report'] LOOP
    IF next_row->k IS DISTINCT FROM (CASE WHEN s.request_payload->'values' ? k THEN s.request_payload->'values'->k ELSE coalesce(prior->k,'null'::jsonb) END) THEN RETURN false; END IF;
   END LOOP;
   selected:=s.request_payload->'lawyers';
   IF selected<>'null'::jsonb THEN
    IF (SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') FROM jsonb_array_elements(selected) x) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(l->'person_id' ORDER BY l->'person_id'),'[]') FROM jsonb_array_elements(c.after_values->'lawyers') l WHERE l->'is_retired'='false'::jsonb) THEN RETURN false; END IF;
   ELSIF c.after_values->'lawyers' IS DISTINCT FROM coalesce(expected->'lawyers','[]') THEN RETURN false; END IF;
   FOR member IN SELECT * FROM jsonb_array_elements(c.after_values->'lawyers') LOOP
    SELECT l INTO old_member FROM jsonb_array_elements(coalesce(expected->'lawyers','[]')) l WHERE l->'id'=member->'id';
    IF (member->>'power_of_attorney_id')::integer IS DISTINCT FROM p_id THEN RETURN false; END IF;
    IF member IS DISTINCT FROM old_member AND NOT _migration.poa_edit_audit_matches('power_of_attorney_lawyers',old_member,member,c.actor_id,c.request_id) THEN RETURN false; END IF;
    IF old_member IS NOT NULL THEN
     IF member-ARRAY['is_retired','updated_at','updated_by'] IS DISTINCT FROM old_member-ARRAY['is_retired','updated_at','updated_by'] THEN RETURN false; END IF;
    ELSE
     IF member->'is_retired'<>'false'::jsonb OR member->>'current_order' IS NULL OR (member->>'current_order')::integer <= (SELECT coalesce(max(coalesce((l->>'current_order')::integer,(l->>'source_member_ordinal')::integer)),0) FROM jsonb_array_elements(coalesce(expected->'lawyers','[]')) l) THEN RETURN false; END IF;
     FOR k IN SELECT key FROM jsonb_each(member) WHERE key LIKE 'legacy_%' OR key IN('reviewed_rule_id','source_member_ordinal') LOOP IF member->k<>'null'::jsonb THEN RETURN false; END IF; END LOOP;
    END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(expected->'lawyers','[]')) l WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'lawyers') n WHERE n->'id'=l->'id')) THEN RETURN false; END IF;
  END IF;
  IF op='create' THEN
   FOR k IN SELECT key FROM jsonb_each(next_row) WHERE key LIKE 'legacy_%' OR key IN('client_name','poa_capacity_duplicate') LOOP IF next_row->k<>'null'::jsonb THEN RETURN false; END IF; END LOOP;
  END IF;
  expected:=c.after_values; v:=v+1;
 END LOOP;
 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.poa_edit_aggregate(p_id);
END;
$$
;

CREATE OR REPLACE FUNCTION _migration.tasks46_47_submission_correspondence_valid() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH local_receipts AS (
  SELECT 'documents'::text gateway,s.submission_id,s.actor_id,s.request_payload,
   s.document_id entity_id,s.result_version
  FROM _migration.document_edit_submission s
  UNION ALL
  SELECT 'fee_letters',s.submission_id,s.actor_id,s.request_payload,
   s.fee_letter_id,s.result_version
  FROM _migration.fee_letter_edit_submission s
  UNION ALL
  SELECT 'matter_fee_references',s.submission_id,s.actor_id,s.request_payload,
   s.matter_id,s.result_version
  FROM _migration.matter_fee_reference_submission s
 ), changes AS (
  SELECT 'documents'::text gateway,c.document_id entity_id,c.version result_version,c.actor_id
  FROM _migration.document_edit_change c WHERE NOT EXISTS(SELECT 1 FROM _migration.task69_compensation_change b WHERE b.entity_table='documents' AND b.entity_id=c.document_id AND b.version=c.version) AND NOT EXISTS(SELECT 1 FROM _migration.task69_document_change b WHERE b.document_id=c.document_id AND b.version=c.version)
  UNION ALL
  SELECT 'fee_letters',c.fee_letter_id,c.version,c.actor_id
  FROM _migration.fee_letter_edit_change c WHERE NOT EXISTS(SELECT 1 FROM _migration.task69_compensation_change b WHERE b.entity_table='fee_letters' AND b.entity_id=c.fee_letter_id AND b.version=c.version) AND NOT EXISTS(SELECT 1 FROM _migration.task69_fee_change b WHERE b.entity_table='fee_letters' AND b.entity_id=c.fee_letter_id AND b.version=c.version)
  UNION ALL
  SELECT 'matter_fee_references',c.matter_id,c.version,c.actor_id
  FROM _migration.matter_fee_reference_change c WHERE NOT EXISTS(SELECT 1 FROM _migration.task69_compensation_change b WHERE b.entity_table='matter_fee_letter_references' AND b.entity_id=c.matter_id AND b.version=c.version) AND NOT EXISTS(SELECT 1 FROM _migration.task69_fee_change b WHERE b.entity_table='matter_fee_letter_references' AND b.entity_id=c.matter_id AND b.version=c.version)
 )
 SELECT NOT EXISTS(
  SELECT 1 FROM local_receipts l
  WHERE NOT _migration.tasks46_47_receipt_valid(
    l.gateway,l.actor_id,l.request_payload,l.entity_id,l.result_version)
   OR NOT EXISTS(SELECT 1 FROM changes c WHERE c.gateway=l.gateway
    AND c.entity_id=l.entity_id AND c.result_version=l.result_version AND c.actor_id=l.actor_id)
  UNION ALL
  SELECT 1 FROM _migration.tasks46_47_submission_owner o
  WHERE NOT EXISTS(SELECT 1 FROM local_receipts l WHERE l.gateway=o.gateway
   AND l.submission_id=o.submission_id AND l.actor_id=o.actor_id
   AND l.entity_id=o.entity_id AND l.result_version=o.result_version
   AND l.request_payload IS NOT DISTINCT FROM o.request_payload)
  UNION ALL
  SELECT 1 FROM changes c
  WHERE NOT EXISTS(SELECT 1 FROM local_receipts l WHERE l.gateway=c.gateway
   AND l.entity_id=c.entity_id AND l.result_version=c.result_version AND l.actor_id=c.actor_id)
 ) AND NOT EXISTS(SELECT 1 FROM _migration.task69_document_change b WHERE _migration.task69_document_receipt_valid(b.receipt_id) IS NOT TRUE) AND NOT EXISTS(SELECT 1 FROM _migration.task69_fee_change b WHERE _migration.task69_fee_receipt_valid(b.receipt_id) IS NOT TRUE) AND NOT EXISTS(SELECT 1 FROM _migration.task69_compensation_change b WHERE _migration.task69_compensation_receipt_valid(b.receipt_id) IS NOT TRUE)
$$;

CREATE FUNCTION _migration.task69_compensation_unassigned_valid(p_id integer,p_current jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM _migration.task69_step_origin o JOIN _migration.task69_receipt a USING(receipt_id)
  JOIN _migration.task69_receipt c ON c.prior_receipt_id=a.receipt_id AND c.phase='compensate'
  JOIN _migration.task69_compensation_row x ON x.receipt_id=c.receipt_id AND x.entity_table='task_actions' AND x.entity_id=o.step_id
  WHERE o.step_id=p_id AND x.after_values=p_current AND _migration.task69_compensation_receipt_valid(c.receipt_id) IS TRUE)
$$;

CREATE OR REPLACE FUNCTION _migration.admin_edit_complete() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity integer; receipt uuid;
BEGIN
 identity:=CASE WHEN TG_TABLE_NAME='admin_tasks' THEN (to_jsonb(NEW)->>'id')::integer ELSE (to_jsonb(NEW)->>'task_id')::integer END;
 IF identity IS NULL THEN
  SELECT receipt_id INTO receipt FROM _migration.task69_step_origin WHERE step_id=NEW.id;
  IF receipt IS NULL OR _migration.task69_step_receipt_valid(receipt) IS NOT TRUE
   OR (NOT EXISTS(SELECT 1 FROM _migration.task69_delta WHERE receipt_id=receipt AND entity_table='task_actions' AND after_values=to_jsonb(NEW)) AND _migration.task69_compensation_unassigned_valid(NEW.id,to_jsonb(NEW)) IS NOT TRUE) THEN RAISE EXCEPTION 'Unassigned historical step lacks exact immutable source receipt';END IF;
 ELSE
  IF _migration.admin_edit_current_valid(identity) IS NOT TRUE THEN RAISE EXCEPTION 'Administrative work aggregate lacks continuous audited change evidence'; END IF;
 END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE r record;BEGIN
 FOR r IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='_migration' AND p.proname LIKE 'task69_compensation_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',r.signature);END LOOP;
END $$;
COMMIT;
