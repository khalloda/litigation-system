-- Task 4.4 Phase 2 / D62. Pending on real development; disposable proof only.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.admin_tasks,public.task_actions IN ACCESS EXCLUSIVE MODE;
CREATE TABLE _migration.admin_edit_import (
  entity_table text NOT NULL CHECK(entity_table IN ('admin_tasks','task_actions')),
  id integer NOT NULL,
  initial_values jsonb NOT NULL CHECK(jsonb_typeof(initial_values)='object' AND (initial_values->>'id')::integer=id),
  PRIMARY KEY(entity_table,id)
);
DO $precondition$
DECLARE t text; expected jsonb; actual jsonb; profile text; projection text;
BEGIN
  IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
    OR (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>67
    OR EXISTS(SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20260914160000_admin_work_editing_boundary') THEN
    RAISE EXCEPTION 'Exact complete migration-67 direct owner prestate required';
  END IF;
  SELECT b.profile INTO STRICT profile FROM _migration.staff_roster_boundary b;
  FOREACH t IN ARRAY ARRAY['admin_tasks','task_actions'] LOOP
    IF profile='historical-full-state-upgrade' THEN
      SELECT i-ARRAY['schema','table'] INTO STRICT expected FROM _migration.high_impact_application a,
        LATERAL jsonb_array_elements(a.before_inventory) i WHERE i->>'schema'='public' AND i->>'table'=t;
      EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''digest'',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''UTF8'')),''hex'')) FROM public.%I r WHERE NOT EXISTS(SELECT 1 FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.created_rows) c WHERE c->>''table''=$1 AND (c->>''id'')::integer=r.id)',t) INTO actual USING t;
      IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Original pre-release administrative work evidence differs: %',t; END IF;
      EXECUTE format('SELECT count(*) FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.created_rows) c LEFT JOIN public.%I r ON r.id=(c->>''id'')::integer WHERE c->>''table''=$1 AND (r.id IS NULL OR to_jsonb(r) IS DISTINCT FROM c->''initial'')',t) INTO actual USING t;
      IF actual<>'0'::jsonb THEN RAISE EXCEPTION 'Original released administrative work evidence differs: %',t; END IF;
    ELSIF profile='canonical-clean-replay' THEN
      EXECUTE format('SELECT count(*) FROM public.%I',t) INTO actual;
      IF actual<>'0'::jsonb THEN RAISE EXCEPTION 'Nonempty canonical administrative work profile'; END IF;
    ELSE RAISE EXCEPTION 'Unrecognized administrative work profile'; END IF;
    EXECUTE format('INSERT INTO _migration.admin_edit_import SELECT $1,id,to_jsonb(r) FROM public.%I r',t) USING t;
    -- Expand the old row shape before adding operational columns.
    SELECT string_agg(CASE WHEN a.attname='id' THEN 'id' WHEN a.atttypid='jsonb'::regtype THEN format('initial_values->%L AS %I',a.attname,a.attname) ELSE format('(initial_values->>%L)::%s AS %I',a.attname,format_type(a.atttypid,a.atttypmod),a.attname) END,',' ORDER BY a.attnum) INTO projection FROM pg_attribute a WHERE a.attrelid=format('public.%I',t)::regclass AND a.attnum>0 AND NOT a.attisdropped;
    EXECUTE format('CREATE VIEW _migration.admin_edit_initial_%I AS SELECT %s FROM _migration.admin_edit_import WHERE entity_table=%L',t,projection,t);
  END LOOP;
END
$precondition$;
CREATE INDEX admin_edit_import_attendee_parent_idx ON _migration.admin_edit_import(((initial_values->>'task_id')::integer),id) WHERE entity_table='task_actions';
CREATE INDEX admin_edit_import_source_idx ON _migration.admin_edit_import(entity_table,(initial_values->>'legacy_source_record_key'));
CREATE TABLE _migration.admin_edit_boundary (
  singleton boolean PRIMARY KEY CHECK(singleton), profile text NOT NULL,
  inventory jsonb NOT NULL, established_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO _migration.admin_edit_boundary SELECT true,profile,
  (SELECT coalesce(jsonb_agg(x ORDER BY x->>'table'),'[]') FROM (
    SELECT jsonb_build_object('table',entity_table,'count',count(*),'digest',encode(sha256(convert_to(string_agg(initial_values::text,chr(10) ORDER BY initial_values::text COLLATE "C"),'UTF8')),'hex')) x
    FROM _migration.admin_edit_import GROUP BY entity_table) r)
  FROM _migration.staff_roster_boundary;
ALTER TABLE public.admin_tasks ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0);
ALTER TABLE public.task_actions ADD COLUMN current_order integer CHECK(current_order>0);
-- Imported ordinal is never rewritten; initial current order follows the historical display.
CREATE UNIQUE INDEX task_actions_current_order_idx ON public.task_actions(task_id,current_order);
CREATE TABLE _migration.admin_edit_submission (
  actor_id integer NOT NULL REFERENCES public.audit_actors(id), submission_id uuid NOT NULL,
  request_payload jsonb NOT NULL, task_id integer NOT NULL REFERENCES public.admin_tasks(id),
  result_version bigint NOT NULL, step_id integer REFERENCES public.task_actions(id), changed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(), PRIMARY KEY(submission_id)
  ,UNIQUE(task_id,result_version)
);
CREATE TABLE _migration.admin_edit_change (
  task_id integer NOT NULL REFERENCES public.admin_tasks(id), version bigint NOT NULL,
  actor_id integer NOT NULL REFERENCES public.audit_actors(id),
  before_values jsonb, after_values jsonb NOT NULL,
  request_id uuid NOT NULL, PRIMARY KEY(task_id,version)
);
CREATE FUNCTION _migration.admin_edit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Administrative work import, submission and change evidence is immutable'; END;
$$;
DO $guards$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_edit_import','admin_edit_boundary','admin_edit_submission','admin_edit_change'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.admin_edit_immutable()',t);
    IF t IN ('admin_edit_import','admin_edit_boundary') THEN
      EXECUTE format('CREATE TRIGGER immutable_insert BEFORE INSERT ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.admin_edit_immutable()',t);
    END IF;
  END LOOP;
END
$guards$;
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason)
VALUES ('public','admin_tasks','row_version',64,'value','admin_edit_aggregate_version'),
 ('public','task_actions','current_order',64,'value','admin_edit_current_order');
CREATE FUNCTION _migration.admin_edit_require_account(p_account integer,p_version integer,p_role text,p_expires timestamptz,p_lock boolean) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor integer;
BEGIN
  IF p_expires IS NULL OR p_expires<=clock_timestamp() OR p_role NOT IN ('Administrator','Litigation Assistant','Paralegal') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized administrative work session required';
  END IF;
  IF p_lock THEN
    PERFORM 1 FROM public.people p JOIN public.user_accounts u ON u.person_id=p.id WHERE u.id=p_account FOR SHARE OF p,u;
  END IF;
  SELECT a.id INTO actor FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id JOIN public.audit_actors a ON a.user_account_id=u.id AND a.actor_kind='human'
    WHERE u.id=p_account AND u.session_version=p_version AND u.role_code=p_role AND u.is_enabled AND u.password_hash IS NOT NULL
      AND NOT u.must_change_password AND p.is_staff AND p.is_active AND p.can_login;
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized administrative work session required'; END IF;
  RETURN actor;
END;
$$;
CREATE FUNCTION _migration.admin_edit_positive(v jsonb,nullable boolean) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT coalesce((nullable AND v='null'::jsonb) OR (jsonb_typeof(v)='number' AND v::text ~ '^[1-9][0-9]{0,9}$' AND v::text::numeric<=2147483647),false)
$$;
CREATE FUNCTION _migration.admin_edit_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
 SELECT jsonb_build_object('task',to_jsonb(h),'steps',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.task_actions a WHERE a.task_id=h.id),'[]')) FROM public.admin_tasks h WHERE h.id=p_id
$$;
CREATE FUNCTION _migration.admin_edit_initial_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('task',h.initial_values||jsonb_build_object('row_version',1),'steps',coalesce((SELECT jsonb_agg(i.initial_values||jsonb_build_object('current_order',NULL) ORDER BY i.id) FROM _migration.admin_edit_import i WHERE entity_table='task_actions' AND (initial_values->>'task_id')::integer=p_id),'[]')) FROM _migration.admin_edit_import h WHERE entity_table='admin_tasks' AND h.id=p_id
$$;
CREATE FUNCTION _migration.admin_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; expected_version bigint;
BEGIN
  expected:=_migration.admin_edit_initial_aggregate(p_id);
  expected_version:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
  FOR c IN SELECT * FROM _migration.admin_edit_change WHERE task_id=p_id ORDER BY version LOOP
    IF c.version<>expected_version OR c.before_values IS DISTINCT FROM expected
      OR (c.after_values->'task'->>'row_version')::bigint<>c.version
      OR (SELECT count(*) FROM _migration.admin_edit_submission s WHERE s.task_id=p_id AND s.result_version=c.version AND s.actor_id=c.actor_id AND s.changed)<>1
      OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='admin_tasks' AND e.entity_schema='public'
        AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id
        AND e.after_values->>'row_version'=c.version::text AND e.action IN ('record_created','record_updated')) THEN RETURN false; END IF;
    expected:=c.after_values; expected_version:=expected_version+1;
  END LOOP;
  RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.admin_edit_aggregate(p_id);
END;
$$;
CREATE FUNCTION _migration.admin_edit_complete() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity integer;
BEGIN
 identity:=CASE WHEN TG_TABLE_NAME='admin_tasks' THEN (to_jsonb(NEW)->>'id')::integer ELSE (to_jsonb(NEW)->>'task_id')::integer END;
 IF NOT _migration.admin_edit_current_valid(identity) THEN RAISE EXCEPTION 'Administrative work aggregate lacks continuous audited change evidence'; END IF;
 RETURN NULL;
END;
$$;
CREATE FUNCTION _migration.admin_edit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE incoming jsonb; previous jsonb; allowed text[]; k text; parent integer;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Administrative work history cannot be deleted'; END IF;
 incoming:=to_jsonb(NEW);
 allowed:=CASE WHEN TG_TABLE_NAME='admin_tasks' THEN ARRAY['required_work','assigned_to_person_id','task_created_date','execution_date','result','previous_decision','last_followup','deadline','court_id','circuit','destination_id','status','alert','row_version'] ELSE ARRAY['action_date','performed_by_person_id','result','report'] END;
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
DO $row_guards$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['admin_tasks','task_actions'] LOOP
  EXECUTE format('CREATE TRIGGER zz_admin_edit_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION _migration.admin_edit_guard()',t);
  EXECUTE format('CREATE TRIGGER admin_edit_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.admin_edit_guard()',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER admin_edit_complete AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.admin_edit_complete()',t);
 END LOOP;
END
$row_guards$;
CREATE FUNCTION _migration.admin_edit_validate_values(p_values jsonb,p_original jsonb,p_create boolean,p_step boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item record; result jsonb:=p_values; lookup_name text; eligible boolean; merged jsonb;
 whitespace text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid administrative fields'; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_values) LOOP
  IF (p_step AND item.key NOT IN('action_date','performed_by_person_id','result','report')) OR
   (NOT p_step AND item.key NOT IN('required_work','assigned_to_person_id','task_created_date','execution_date','result','previous_decision','last_followup','deadline','court_id','circuit','destination_id','status','alert','matter_id')) OR (item.key='matter_id' AND NOT p_create) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsupported administrative field'; END IF;
  IF item.key LIKE '%_id' THEN
   IF NOT _migration.admin_edit_positive(item.value,true) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid selection identity'; END IF;
  ELSE
   -- Match the accepted filter's JavaScript UTF-16 length, including supplementary Unicode.
   IF item.key='status' AND length(item.value#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(item.value#>>'{}','') ch WHERE ascii(ch)>65535)>160 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Status exceeds the existing filter limit'; END IF;
   IF jsonb_typeof(item.value) NOT IN('string','null') OR length(item.value#>>'{}')>10000 OR (item.value#>>'{}') ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid administrative text'; END IF;
  END IF;
  IF item.key IN('task_created_date','execution_date','deadline','action_date') AND item.value<>'null'::jsonb THEN
   IF (item.value#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (item.value#>>'{}') LIKE '0000-%' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Date-only value required'; END IF;
   PERFORM (item.value#>>'{}')::date;
  END IF;
  IF NOT p_create AND item.value IS NOT DISTINCT FROM p_original->item.key THEN result:=result-item.key; CONTINUE; END IF;
  lookup_name:=CASE item.key WHEN 'court_id' THEN 'lookup_court' WHEN 'destination_id' THEN 'lookup_matter_destination' END;
  IF lookup_name IS NOT NULL AND item.value<>'null'::jsonb THEN
   EXECUTE format('SELECT is_active FROM public.%I WHERE id=$1 FOR SHARE',lookup_name) INTO eligible USING (item.value#>>'{}')::integer;
   IF eligible IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Active classification required'; END IF;
  END IF;
  IF item.key IN('assigned_to_person_id','performed_by_person_id') AND item.value<>'null'::jsonb THEN
   PERFORM 1 FROM public.people WHERE id=(item.value#>>'{}')::integer AND is_staff AND is_active FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Active internal staff required'; END IF;
  END IF;
 END LOOP;
 merged:=coalesce(p_original,'{}')||result;
 IF NOT p_step AND (p_create OR result ? 'required_work') AND btrim(coalesce(merged->>'required_work',''),whitespace)='' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Meaningful required work is required'; END IF;
 IF p_step AND (p_create OR result ?| ARRAY['result','report']) AND btrim(coalesce(merged->>'result',''),whitespace)='' AND btrim(coalesce(merged->>'report',''),whitespace)='' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Meaningful step result or report is required'; END IF;
 RETURN result;
END;
$$;
CREATE FUNCTION public.admin_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_task integer,p_step integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE task jsonb; step jsonb;
BEGIN
 PERFORM _migration.admin_edit_require_account(p_account,p_session,p_role,p_expires,false);
 IF p_task IS NOT NULL THEN
  SELECT jsonb_build_object('id',a.id,'version',a.row_version::text,'matterArchived',coalesce(m.is_archived,false),'values',to_jsonb(a)) INTO task FROM public.admin_tasks a LEFT JOIN public.matters m ON m.id=a.matter_id WHERE a.id=p_task;
  IF task IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Administrative work not found'; END IF;
 END IF;
 IF p_step IS NOT NULL THEN
  SELECT jsonb_build_object('id',a.id,'values',to_jsonb(a)) INTO step FROM public.task_actions a WHERE a.id=p_step AND a.task_id=p_task;
  IF step IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Step not found for administrative work'; END IF;
 END IF;
 RETURN jsonb_build_object('task',task,'step',step,
  'matters',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.case_number_ar,'context',m.subject,'active',NOT m.is_archived) ORDER BY m.case_number_ar COLLATE "arabic",m.id),'[]') FROM public.matters m WHERE NOT m.is_archived OR m.id=(task->'values'->>'matter_id')::integer),
  'courts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',label_ar,'active',is_active) ORDER BY sort_order,id),'[]') FROM public.lookup_court WHERE is_active OR id=(task->'values'->>'court_id')::integer),
  'destinations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',label_ar,'active',is_active) ORDER BY sort_order,id),'[]') FROM public.lookup_matter_destination WHERE is_active OR id=(task->'values'->>'destination_id')::integer),
  'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name_ar,'active',p.is_active AND p.is_staff) ORDER BY p.name_ar COLLATE "arabic",p.id),'[]') FROM public.people p WHERE (p.is_staff AND p.is_active) OR p.id=(task->'values'->>'assigned_to_person_id')::integer OR p.id=(step->'values'->>'performed_by_person_id')::integer));
END;
$$;
CREATE FUNCTION public.admin_edit_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
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
  before_state:=_migration.admin_edit_aggregate(identity);
 END IF;
 IF is_step THEN
  original:=NULL;
  IF step_id IS NOT NULL THEN
   SELECT to_jsonb(a) INTO original FROM public.task_actions a WHERE id=step_id AND task_id=identity FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Step does not belong to this administrative work'; END IF;
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
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.admin_tasks,public.task_actions FROM litigation_runtime;
REVOKE ALL ON SEQUENCE public.admin_tasks_id_seq,public.task_actions_id_seq FROM litigation_runtime;
REVOKE ALL ON _migration.admin_edit_import,_migration.admin_edit_boundary,_migration.admin_edit_submission,_migration.admin_edit_change,_migration.admin_edit_initial_admin_tasks,_migration.admin_edit_initial_task_actions FROM PUBLIC,litigation_runtime;
DO $permissions$
DECLARE routine regprocedure;
BEGIN
 FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND p.proname LIKE 'admin_edit_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',routine); END LOOP;
END
$permissions$;
GRANT EXECUTE ON FUNCTION public.admin_edit_state(integer,integer,text,timestamptz,integer,integer),public.admin_edit_save(integer,integer,text,timestamptz,jsonb) TO litigation_runtime;
DO $postcondition$
BEGIN
 IF EXISTS(SELECT 1 FROM public.admin_tasks a WHERE NOT _migration.admin_edit_current_valid(a.id)) THEN RAISE EXCEPTION 'Administrative migration changed original values'; END IF;
END
$postcondition$;
COMMIT;
