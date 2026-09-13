-- Task 4.3 Phase 3 / D61. Candidate67; isolated proof only, actual66 unchanged.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.hearings,public.hearing_attendees IN ACCESS EXCLUSIVE MODE;
DO $precondition$
BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>66
 OR NOT EXISTS(SELECT 1 FROM _prisma_migrations WHERE migration_name='20260913120000_hearing_editing_boundary' AND checksum='c8c161b78855d95338ede877fb7521721b1a5d4f65872e0e206cc017036a1db8' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 OR EXISTS(SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20260913160000_hearing_archive_restore') THEN
  RAISE EXCEPTION 'Exact complete migration-66 direct owner prestate required';
 END IF;
 IF EXISTS(SELECT 1 FROM public.hearings WHERE NOT _migration.hearing_edit_current_valid(id)) THEN RAISE EXCEPTION 'Invalid pre-existing hearing history'; END IF;
END
$precondition$;
-- Freeze only the boundary needed to distinguish old snapshot shapes from new ones.
-- Existing import/change/receipt rows and versions are never rewritten.
CREATE TABLE _migration.hearing_lifecycle_boundary (
 singleton boolean PRIMARY KEY CHECK(singleton),
 prior_versions jsonb NOT NULL CHECK(jsonb_typeof(prior_versions)='object'),
 prior_history_count integer NOT NULL CHECK(prior_history_count>=0),
 prior_history_digest text NOT NULL CHECK(prior_history_digest ~ '^[a-f0-9]{64}$'),
 established_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO _migration.hearing_lifecycle_boundary
SELECT true,(SELECT coalesce(jsonb_object_agg(id,row_version),'{}') FROM public.hearings),
 count(*)::integer,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(c)::text,chr(10) ORDER BY hearing_id,version),''),'UTF8')),'hex'),statement_timestamp()
FROM _migration.hearing_edit_change c;
CREATE TRIGGER immutable_rows BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON _migration.hearing_lifecycle_boundary FOR EACH STATEMENT EXECUTE FUNCTION _migration.hearing_edit_immutable();
REVOKE ALL ON _migration.hearing_lifecycle_boundary FROM PUBLIC,litigation_runtime;
ALTER TABLE public.hearings ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
CREATE INDEX hearings_archive_date_id_idx ON public.hearings(is_archived,hearing_date DESC NULLS LAST,id DESC);
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason)
VALUES('public','hearings','is_archived',64,'value','hearing_archive_lifecycle');
CREATE FUNCTION _migration.hearing_lifecycle_normalize(v jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN v IS NULL OR v->'hearing' ? 'is_archived' THEN v ELSE jsonb_set(v,'{hearing,is_archived}','false') END
$$;
CREATE OR REPLACE FUNCTION _migration.hearing_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; expected_version bigint; old_version bigint; next_state jsonb; prior_state jsonb; lifecycle boolean;
BEGIN
 SELECT (prior_versions->>p_id::text)::bigint INTO old_version FROM _migration.hearing_lifecycle_boundary WHERE singleton;
 expected:=_migration.hearing_lifecycle_normalize(_migration.hearing_edit_initial_aggregate(p_id));
 expected_version:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.hearing_edit_change WHERE hearing_id=p_id ORDER BY version LOOP
  prior_state:=CASE WHEN c.version<=coalesce(old_version,0) THEN _migration.hearing_lifecycle_normalize(c.before_values) ELSE c.before_values END;
  next_state:=CASE WHEN c.version<=coalesce(old_version,0) THEN _migration.hearing_lifecycle_normalize(c.after_values) ELSE c.after_values END;
  IF c.version<>expected_version OR prior_state IS DISTINCT FROM expected
   OR jsonb_typeof(next_state->'hearing'->'is_archived') IS DISTINCT FROM 'boolean'
   OR (next_state->'hearing'->>'row_version')::bigint<>c.version
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='hearings' AND e.entity_schema='public'
     AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id
     AND e.after_values->>'row_version'=c.version::text AND e.action IN ('record_created','record_updated') AND e.outcome='succeeded') THEN RETURN false; END IF;
  lifecycle:=expected IS NOT NULL AND (expected->'hearing'->'is_archived') IS DISTINCT FROM (next_state->'hearing'->'is_archived');
  IF lifecycle THEN
   IF expected->'attendees' IS DISTINCT FROM next_state->'attendees'
    OR (expected->'hearing')-ARRAY['is_archived','row_version','updated_at','updated_by'] IS DISTINCT FROM (next_state->'hearing')-ARRAY['is_archived','row_version','updated_at','updated_by']
    OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='hearings' AND e.entity_schema='public' AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.action=CASE WHEN (next_state->'hearing'->>'is_archived')::boolean THEN 'archive' ELSE 'restore' END AND e.outcome='succeeded' AND e.actor_role_snapshot='Administrator')
    OR NOT EXISTS(SELECT 1 FROM _migration.hearing_edit_submission s WHERE s.hearing_id=p_id AND s.result_version=c.version AND s.actor_id=c.actor_id AND s.changed AND s.request_payload->>'action'=CASE WHEN (next_state->'hearing'->>'is_archived')::boolean THEN 'archive' ELSE 'restore' END) THEN RETURN false; END IF;
  ELSIF coalesce((expected->'hearing'->>'is_archived')::boolean,false) OR (expected IS NULL AND (next_state->'hearing'->>'is_archived')::boolean) THEN RETURN false;
  END IF;
  expected:=next_state;expected_version:=expected_version+1;
 END LOOP;
 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.hearing_edit_aggregate(p_id);
END;
$$;

CREATE OR REPLACE FUNCTION _migration.hearing_edit_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous jsonb; incoming jsonb; allowed text[]; k text;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Hearing and attendee history cannot be physically deleted'; END IF;
 incoming:=to_jsonb(NEW);
 allowed:=CASE WHEN TG_TABLE_NAME='hearings' THEN ARRAY['hearing_date','next_hearing_date','action_id','decision','outcome','court_id','circuit','notes','row_version','is_archived'] ELSE ARRAY['is_retired','current_order'] END;
 IF TG_OP='UPDATE' THEN
  previous:=to_jsonb(OLD);
  IF incoming-allowed-ARRAY['updated_at','updated_by'] IS DISTINCT FROM previous-allowed-ARRAY['updated_at','updated_by'] THEN RAISE EXCEPTION 'Hearing identity, parent and source evidence are immutable'; END IF;
  IF TG_TABLE_NAME='hearings' THEN
   IF (incoming->>'row_version')::bigint<>(previous->>'row_version')::bigint+1 THEN RAISE EXCEPTION 'Hearing aggregate version must advance once'; END IF;
   IF (previous->>'legacy_id')::integer IN(7072,7071,7237,7383,7451,7073,7070,7219,7351,7129,7159,7382)
    AND ROW(incoming->'court_id',incoming->'circuit',incoming->'notes') IS DISTINCT FROM ROW(previous->'court_id',previous->'circuit',previous->'notes') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='D41 hearing fields are protected'; END IF;
  END IF;
 ELSE
  FOR k IN SELECT key FROM jsonb_each(incoming) WHERE key LIKE 'legacy_%' OR key LIKE 'source_%' OR key IN('ordinal','report','previous_decision','next_attendance_raw','destination_id','short_decision','client_notified') LOOP
   IF incoming->k<>'null'::jsonb THEN RAISE EXCEPTION 'Native hearing records cannot invent source or deferred workflow values'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.hearing_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_id integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE record jsonb; result jsonb;
BEGIN
 PERFORM _migration.hearing_edit_require_account(p_account,p_session,p_role,p_expires,false);
 IF p_id IS NOT NULL THEN
  SELECT jsonb_build_object('id',h.id,'version',h.row_version::text,'protected',coalesce(h.legacy_id IN(7072,7071,7237,7383,7451,7073,7070,7219,7351,7129,7159,7382),false),'hearingArchived',h.is_archived,'matterArchived',coalesce(m.is_archived,false),'values',jsonb_build_object('matter_id',h.matter_id,'hearing_date',h.hearing_date::text,'next_hearing_date',h.next_hearing_date::text,'action_id',h.action_id,'decision',h.decision,'outcome',h.outcome,'court_id',h.court_id,'circuit',h.circuit,'notes',h.notes)) INTO record FROM public.hearings h LEFT JOIN public.matters m ON m.id=h.matter_id WHERE h.id=p_id;
  IF record IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Hearing not found'; END IF;
 END IF;
 result:=jsonb_build_object('record',record,
  'matters',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.case_number_ar,'context',m.subject,'active',NOT m.is_archived,'clientArchived',coalesce(c.is_archived,false)) ORDER BY m.case_number_ar COLLATE "arabic",m.id),'[]') FROM public.matters m LEFT JOIN public.clients c ON c.id=m.client_id WHERE NOT m.is_archived OR m.id=(record->'values'->>'matter_id')::integer),
  'actions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',label_ar,'active',is_active) ORDER BY sort_order,id),'[]') FROM public.lookup_hearing_action WHERE is_active OR id=(record->'values'->>'action_id')::integer),
  'courts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',label_ar,'active',is_active) ORDER BY sort_order,id),'[]') FROM public.lookup_court WHERE is_active OR id=(record->'values'->>'court_id')::integer),
  'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name_ar,'active',p.is_active AND p.is_staff) ORDER BY p.name_ar COLLATE "arabic",p.id),'[]') FROM public.people p WHERE (p.is_staff AND p.is_active) OR EXISTS(SELECT 1 FROM public.hearing_attendees a WHERE a.hearing_id=p_id AND a.person_id=p.id AND NOT a.is_retired)),
  'attendees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'person_id',person_id) ORDER BY coalesce(current_order,ordinal) NULLS LAST,id),'[]') FROM public.hearing_attendees WHERE hearing_id=p_id AND NOT is_retired));
 IF length(result::text)>1000000 THEN RAISE EXCEPTION 'Hearing form exceeds supported bounded size'; END IF;
 RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.hearing_edit_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; identity integer; expected bigint; submission uuid; receipt _migration.hearing_edit_submission%ROWTYPE;
 original jsonb; before_state jsonb; patch jsonb; after_state jsonb; snapshot jsonb; attendees jsonb; resolved jsonb:='[]'; member jsonb; old_child jsonb;
 parent integer; parent_archived boolean; changed boolean; version bigint; columns text; selections text; assignments text; child_id integer; next_order integer;
BEGIN
 -- Same staff mutex precedes person/account locks throughout roster/account management.
 PERFORM 1 FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE;
 actor:=_migration.hearing_edit_require_account(p_account,p_session,p_role,p_expires,true);
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Hearing actor does not match trusted audit context'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR length(p_request::text)>200000 OR NOT p_request ?& ARRAY['id','version','submission','values'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN('id','version','submission','values','attendees')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid hearing request'; END IF;
 IF NOT _migration.hearing_edit_positive(p_request->'id',true) OR jsonb_typeof(p_request->'version') NOT IN('string','null') OR jsonb_typeof(p_request->'submission')<>'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid hearing identity types'; END IF;
 IF (p_request->'version'<>'null'::jsonb AND (p_request->>'version') !~ '^[1-9][0-9]{0,18}$') OR (p_request->>'submission') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid hearing identity format'; END IF;
 identity:=(p_request->>'id')::integer; expected:=(p_request->>'version')::bigint; submission:=(p_request->>'submission')::uuid;
 IF submission IS NULL OR (identity IS NULL)<>(expected IS NULL) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid hearing version'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(submission::text,43));
 SELECT * INTO receipt FROM _migration.hearing_edit_submission WHERE submission_id=submission;
 IF FOUND THEN
  IF receipt.actor_id<>actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Hearing submission belongs to another actor'; END IF;
  IF receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Hearing submission payload differs'; END IF;
  PERFORM _migration.hearing_edit_require_account(p_account,p_session,p_role,p_expires,false);
  RETURN jsonb_build_object('id',receipt.hearing_id,'version',receipt.result_version::text,'changed',receipt.changed);
 END IF;
 -- Parent first, then hearing: matter archive and hearing editing cannot pass each other.
 IF identity IS NULL THEN
  IF NOT (p_request->'values') ? 'matter_id' OR NOT _migration.hearing_edit_positive(p_request->'values'->'matter_id',true) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Explicit matter or unassigned selection required'; END IF;
  parent:=(p_request->'values'->>'matter_id')::integer;
 ELSE
  SELECT matter_id INTO parent FROM public.hearings WHERE id=identity;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Hearing not found'; END IF;
 END IF;
 IF parent IS NOT NULL THEN
  SELECT is_archived INTO parent_archived FROM public.matters WHERE id=parent FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Existing matter required'; END IF;
  IF parent_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before editing hearing'; END IF;
 END IF;
 IF identity IS NOT NULL THEN
  SELECT to_jsonb(h) INTO original FROM public.hearings h WHERE id=identity FOR UPDATE;
  IF (original->>'row_version')::bigint<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Hearing version is stale'; END IF;
  IF (original->>'is_archived')::boolean THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived hearing before editing'; END IF;
  before_state:=_migration.hearing_edit_aggregate(identity);
 END IF;
 patch:=_migration.hearing_edit_validate_values(p_request->'values',original,identity IS NULL);
 snapshot:=CASE WHEN identity IS NULL THEN NULL ELSE public.hearing_edit_state(p_account,p_session,p_role,p_expires,identity) END;
 attendees:=coalesce(p_request->'attendees',snapshot->'attendees','[]');
 IF jsonb_typeof(attendees)<>'array' OR jsonb_array_length(attendees)>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid hearing attendees'; END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(attendees) LOOP
  IF jsonb_typeof(member)<>'object' OR NOT member ?& ARRAY['id','person_id'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(member) k WHERE k NOT IN('id','person_id')) OR NOT _migration.hearing_edit_positive(member->'id',true) OR NOT _migration.hearing_edit_positive(member->'person_id',true) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid attendee identity'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(attendees) a WHERE a->>'id' IS NOT NULL GROUP BY a->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate membership identity'; END IF;
 PERFORM 1 FROM public.people WHERE id IN(SELECT (a->>'person_id')::integer FROM jsonb_array_elements(attendees) a) ORDER BY id FOR SHARE;
 FOR member IN SELECT value FROM jsonb_array_elements(attendees) LOOP
  old_child:=NULL;
  IF member->>'id' IS NOT NULL THEN
   SELECT to_jsonb(a) INTO old_child FROM public.hearing_attendees a WHERE a.id=(member->>'id')::integer AND a.hearing_id=identity AND a.person_id IS NOT DISTINCT FROM (member->>'person_id')::integer;
   IF old_child IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Foreign attendee identity'; END IF;
  ELSE
   IF member->>'person_id' IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(attendees) a WHERE a->>'person_id'=member->>'person_id' AND a IS DISTINCT FROM member) OR (SELECT count(*) FROM jsonb_array_elements(attendees) a WHERE a->>'person_id'=member->>'person_id')>1 OR EXISTS(SELECT 1 FROM public.hearing_attendees a WHERE a.hearing_id=identity AND a.person_id=(member->>'person_id')::integer AND NOT a.is_retired) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate new attendee'; END IF;
   SELECT to_jsonb(a) INTO old_child FROM public.hearing_attendees a WHERE a.hearing_id=identity AND a.person_id=(member->>'person_id')::integer AND a.is_retired ORDER BY a.id LIMIT 1;
  END IF;
  IF old_child IS NULL OR (old_child->>'is_retired')::boolean THEN
   PERFORM 1 FROM public.people WHERE id=(member->>'person_id')::integer AND is_staff AND is_active;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Active internal attendee required'; END IF;
  END IF;
  resolved:=resolved||jsonb_build_array(CASE WHEN old_child IS NULL THEN member ELSE member||jsonb_build_object('id',old_child->'id') END);
 END LOOP;
 -- Membership selection is a set of stable IDs. Preserve retained order; additions append.
 IF identity IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(resolved) a WHERE a->>'id' IS NOT NULL GROUP BY a->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate restored membership'; END IF;
 changed:=identity IS NULL OR patch<>'{}' OR EXISTS(SELECT 1 FROM jsonb_array_elements(resolved) a WHERE a->>'id' IS NULL) OR (SELECT coalesce(jsonb_agg(a ORDER BY a->>'id'),'[]') FROM jsonb_array_elements(resolved) a) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(a ORDER BY a->>'id'),'[]') FROM jsonb_array_elements(coalesce(snapshot->'attendees','[]')) a);
 PERFORM _migration.hearing_edit_require_account(p_account,p_session,p_role,p_expires,false);
 IF NOT changed THEN RETURN jsonb_build_object('id',identity,'version',expected::text,'changed',false); END IF;
 PERFORM public.audit_ensure_event_context();
 IF identity IS NULL THEN
  SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('v.%I',key),',' ORDER BY key) INTO columns,selections FROM jsonb_object_keys(patch) key;
  EXECUTE format('INSERT INTO public.hearings(%s,updated_at) SELECT %s,statement_timestamp() FROM jsonb_populate_record(NULL::public.hearings,$1) v RETURNING id',columns,selections) INTO identity USING patch;
  version:=1;
 ELSE
  SELECT string_agg(format('%I=v.%I',key,key),',' ORDER BY key) INTO assignments FROM jsonb_object_keys(patch) key;
  EXECUTE format('UPDATE public.hearings h SET row_version=h.row_version+1%s FROM jsonb_populate_record(NULL::public.hearings,$1) v WHERE h.id=$2 RETURNING h.row_version',CASE WHEN assignments IS NULL THEN '' ELSE ','||assignments END) INTO version USING original||patch,identity;
 END IF;
 UPDATE public.hearing_attendees SET is_retired=true WHERE hearing_id=identity AND NOT is_retired AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(resolved) a WHERE (a->>'id')::integer=id);
 SELECT coalesce(max(coalesce(current_order,ordinal)),0) INTO next_order FROM public.hearing_attendees WHERE hearing_id=identity;
 FOR member IN SELECT value FROM jsonb_array_elements(resolved) LOOP
  child_id:=(member->>'id')::integer;
  IF child_id IS NULL THEN
   next_order:=next_order+1;
   INSERT INTO public.hearing_attendees(hearing_id,person_id,current_order,updated_at) VALUES(identity,(member->>'person_id')::integer,next_order,statement_timestamp());
  ELSIF EXISTS(SELECT 1 FROM public.hearing_attendees WHERE id=child_id AND is_retired) THEN
   next_order:=next_order+1;
   UPDATE public.hearing_attendees SET is_retired=false,current_order=next_order WHERE id=child_id;
  END IF;
 END LOOP;
 after_state:=_migration.hearing_edit_aggregate(identity);
 INSERT INTO _migration.hearing_edit_change VALUES(identity,version,actor,before_state,after_state,current_setting('litigation.audit_request_id')::uuid);
 INSERT INTO _migration.hearing_edit_submission(actor_id,submission_id,request_payload,hearing_id,result_version,changed) VALUES(actor,submission,p_request,identity,version,true);
 RETURN jsonb_build_object('id',identity,'version',version::text,'changed',true);
END;
$$;
CREATE FUNCTION _migration.hearing_lifecycle_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE hearing_id integer; parent_id integer; archived boolean; parent_archived boolean;
BEGIN
 IF TG_TABLE_NAME='hearings' THEN
  parent_id:=NEW.matter_id;
 ELSE
  hearing_id:=(to_jsonb(NEW)->>'hearing_id')::integer;
  SELECT matter_id INTO parent_id FROM public.hearings WHERE id=hearing_id;
 END IF;
 -- Match gateway lock order: staff mutex/account, matter, hearing, attendance.
 IF parent_id IS NOT NULL THEN
  SELECT is_archived INTO parent_archived FROM public.matters WHERE id=parent_id FOR SHARE;
  IF parent_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before editing hearing'; END IF;
 END IF;
 IF TG_TABLE_NAME='hearings' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.is_archived THEN RAISE EXCEPTION 'New hearings must begin unarchived'; END IF;
  ELSIF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
   PERFORM _migration.client_contact_require_actor(true);
   IF to_jsonb(NEW)-ARRAY['is_archived','row_version','updated_at','updated_by'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['is_archived','row_version','updated_at','updated_by'] THEN RAISE EXCEPTION 'Hearing lifecycle cannot change business fields'; END IF;
  ELSIF OLD.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived hearing before editing'; END IF;
 ELSE
  SELECT is_archived INTO archived FROM public.hearings WHERE id=hearing_id FOR UPDATE;
  IF archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived hearing before editing'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER zy_hearing_lifecycle_guard BEFORE INSERT OR UPDATE ON public.hearings FOR EACH ROW EXECUTE FUNCTION _migration.hearing_lifecycle_guard();
CREATE TRIGGER zy_hearing_lifecycle_guard BEFORE INSERT OR UPDATE ON public.hearing_attendees FOR EACH ROW EXECUTE FUNCTION _migration.hearing_lifecycle_guard();
CREATE FUNCTION _migration.hearing_lifecycle_facts(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
 SELECT jsonb_build_object('hearingDate',h.hearing_date::text,'matterId',h.matter_id,'caseNumber',m.case_number_ar,'matterArchived',coalesce(m.is_archived,false),
  'currentAttendees',(SELECT count(*) FROM public.hearing_attendees WHERE hearing_id=h.id AND NOT is_retired),
  'retiredAttendees',(SELECT count(*) FROM public.hearing_attendees WHERE hearing_id=h.id AND is_retired))
 FROM public.hearings h LEFT JOIN public.matters m ON m.id=h.matter_id WHERE h.id=p_id
$$;
CREATE FUNCTION public.hearing_lifecycle_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_id integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF p_role IS DISTINCT FROM 'Administrator' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrator hearing lifecycle required'; END IF;
 PERFORM _migration.hearing_edit_require_account(p_account,p_session,p_role,p_expires,false);
 SELECT jsonb_build_object('id',id,'version',row_version::text,'archived',is_archived,'facts',_migration.hearing_lifecycle_facts(id)) INTO result FROM public.hearings WHERE id=p_id;
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Hearing not found'; END IF;
 RETURN result;
END;
$$;
CREATE FUNCTION public.hearing_lifecycle_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; identity integer; expected bigint; submission uuid; action text; parent_id integer; parent_archived boolean;
 original public.hearings%ROWTYPE; receipt _migration.hearing_edit_submission%ROWTYPE; before_state jsonb; after_state jsonb; version bigint;
BEGIN
 PERFORM 1 FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE;
 IF p_role IS DISTINCT FROM 'Administrator' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrator hearing lifecycle required'; END IF;
 actor:=_migration.hearing_edit_require_account(p_account,p_session,p_role,p_expires,true);
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Hearing actor does not match trusted audit context'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR length(p_request::text)>200000
  OR NOT p_request ?& ARRAY['id','version','submission','action','facts','confirmation']
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN('id','version','submission','action','facts','confirmation'))
  OR NOT _migration.hearing_edit_positive(p_request->'id',false)
  OR jsonb_typeof(p_request->'version')<>'string' OR (p_request->>'version') !~ '^[1-9][0-9]{0,18}$'
  OR jsonb_typeof(p_request->'submission')<>'string' OR (p_request->>'submission') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR p_request->'confirmation' IS DISTINCT FROM p_request->'id'
  OR jsonb_typeof(p_request->'action')<>'string' OR p_request->>'action' NOT IN('archive','restore')
  OR jsonb_typeof(p_request->'facts')<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid hearing lifecycle request'; END IF;
 identity:=(p_request->>'id')::integer;expected:=(p_request->>'version')::bigint;submission:=(p_request->>'submission')::uuid;action:=p_request->>'action';
 PERFORM pg_advisory_xact_lock(hashtextextended(submission::text,43));
 SELECT * INTO receipt FROM _migration.hearing_edit_submission WHERE submission_id=submission;
 IF FOUND THEN
  IF receipt.actor_id<>actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Hearing submission belongs to another actor'; END IF;
  IF receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Hearing submission payload differs'; END IF;
  PERFORM _migration.hearing_edit_require_account(p_account,p_session,p_role,p_expires,false);
  RETURN jsonb_build_object('id',receipt.hearing_id,'version',receipt.result_version::text,'changed',receipt.changed);
 END IF;
 SELECT matter_id INTO parent_id FROM public.hearings WHERE id=identity;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Hearing not found'; END IF;
 IF parent_id IS NOT NULL THEN
  SELECT is_archived INTO parent_archived FROM public.matters WHERE id=parent_id FOR SHARE;
  IF parent_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before editing hearing'; END IF;
 END IF;
 SELECT * INTO STRICT original FROM public.hearings WHERE id=identity FOR UPDATE;
 IF original.row_version<>expected OR p_request->'facts' IS DISTINCT FROM _migration.hearing_lifecycle_facts(identity) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Hearing version or confirmation is stale'; END IF;
 PERFORM _migration.hearing_edit_require_account(p_account,p_session,p_role,p_expires,false);
 IF original.is_archived=(action='archive') THEN RETURN jsonb_build_object('id',identity,'version',expected::text,'changed',false); END IF;
 PERFORM public.audit_ensure_event_context();
 before_state:=_migration.hearing_edit_aggregate(identity);
 UPDATE public.hearings SET is_archived=(action='archive'),row_version=row_version+1 WHERE id=identity RETURNING row_version INTO version;
 PERFORM public.audit_append_semantic_event(action,'succeeded','public','hearings',jsonb_build_object('id',identity),NULL,NULL,NULL,'{}',NULL,'{}');
 after_state:=_migration.hearing_edit_aggregate(identity);
 INSERT INTO _migration.hearing_edit_change VALUES(identity,version,actor,before_state,after_state,current_setting('litigation.audit_request_id')::uuid);
 INSERT INTO _migration.hearing_edit_submission(actor_id,submission_id,request_payload,hearing_id,result_version,changed) VALUES(actor,submission,p_request,identity,version,true);
 RETURN jsonb_build_object('id',identity,'version',version::text,'changed',true);
END;
$$;
DO $permissions$
DECLARE routine regprocedure;
BEGIN
 FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND p.proname LIKE 'hearing_lifecycle_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',routine); END LOOP;
END
$permissions$;
GRANT EXECUTE ON FUNCTION public.hearing_lifecycle_state(integer,integer,text,timestamptz,integer),public.hearing_lifecycle_save(integer,integer,text,timestamptz,jsonb) TO litigation_runtime;
DO $postcondition$
BEGIN
 IF EXISTS(SELECT 1 FROM public.hearings WHERE is_archived OR NOT _migration.hearing_edit_current_valid(id)) THEN RAISE EXCEPTION 'Hearing lifecycle initialization differs'; END IF;
END
$postcondition$;
COMMIT;
