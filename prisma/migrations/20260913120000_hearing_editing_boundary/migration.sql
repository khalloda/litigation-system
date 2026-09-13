-- Task 4.3 Phase 2 / D60. Pending on real development; disposable proof only.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.hearings,public.hearing_attendees IN ACCESS EXCLUSIVE MODE;
CREATE TABLE _migration.hearing_edit_import (
  entity_table text NOT NULL CHECK(entity_table IN ('hearings','hearing_attendees')),
  id integer NOT NULL,
  initial_values jsonb NOT NULL CHECK(jsonb_typeof(initial_values)='object' AND (initial_values->>'id')::integer=id),
  PRIMARY KEY(entity_table,id)
);
DO $precondition$
DECLARE t text; expected jsonb; actual jsonb; profile text; projection text;
BEGIN
  IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
    OR (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>65
    OR EXISTS(SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20260913120000_hearing_editing_boundary') THEN
    RAISE EXCEPTION 'Exact complete migration-65 direct owner prestate required';
  END IF;
  SELECT b.profile INTO STRICT profile FROM _migration.staff_roster_boundary b;
  FOREACH t IN ARRAY ARRAY['hearings','hearing_attendees'] LOOP
    IF profile='historical-full-state-upgrade' THEN
      SELECT i-ARRAY['schema','table'] INTO STRICT expected FROM _migration.high_impact_application a,
        LATERAL jsonb_array_elements(a.before_inventory) i WHERE i->>'schema'='public' AND i->>'table'=t;
      EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''digest'',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''UTF8'')),''hex'')) FROM public.%I r WHERE NOT EXISTS(SELECT 1 FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.created_rows) c WHERE c->>''table''=$1 AND (c->>''id'')::integer=r.id)',t) INTO actual USING t;
      IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Original pre-release matter evidence differs: %',t; END IF;
      EXECUTE format('SELECT count(*) FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.created_rows) c LEFT JOIN public.%I r ON r.id=(c->>''id'')::integer WHERE c->>''table''=$1 AND (r.id IS NULL OR to_jsonb(r) IS DISTINCT FROM c->''initial'')',t) INTO actual USING t;
      IF actual<>'0'::jsonb THEN RAISE EXCEPTION 'Original released matter evidence differs: %',t; END IF;
    ELSIF profile='canonical-clean-replay' THEN
      EXECUTE format('SELECT count(*) FROM public.%I',t) INTO actual;
      IF actual<>'0'::jsonb THEN RAISE EXCEPTION 'Nonempty canonical matter profile'; END IF;
    ELSE RAISE EXCEPTION 'Unrecognized matter profile'; END IF;
    EXECUTE format('INSERT INTO _migration.hearing_edit_import SELECT $1,id,to_jsonb(r) FROM public.%I r',t) USING t;
    -- Expand the old row shape before adding operational columns.
    SELECT string_agg(CASE WHEN a.attname='id' THEN 'id' WHEN a.atttypid='jsonb'::regtype THEN format('initial_values->%L AS %I',a.attname,a.attname) ELSE format('(initial_values->>%L)::%s AS %I',a.attname,format_type(a.atttypid,a.atttypmod),a.attname) END,',' ORDER BY a.attnum) INTO projection FROM pg_attribute a WHERE a.attrelid=format('public.%I',t)::regclass AND a.attnum>0 AND NOT a.attisdropped;
    EXECUTE format('CREATE VIEW _migration.hearing_edit_initial_%I AS SELECT %s FROM _migration.hearing_edit_import WHERE entity_table=%L',t,projection,t);
  END LOOP;
END
$precondition$;
CREATE INDEX hearing_edit_import_attendee_parent_idx ON _migration.hearing_edit_import(((initial_values->>'hearing_id')::integer),id) WHERE entity_table='hearing_attendees';
CREATE INDEX hearing_edit_import_source_idx ON _migration.hearing_edit_import(entity_table,(initial_values->>'legacy_source_record_key'));
CREATE TABLE _migration.hearing_edit_boundary (
  singleton boolean PRIMARY KEY CHECK(singleton), profile text NOT NULL,
  inventory jsonb NOT NULL, established_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO _migration.hearing_edit_boundary SELECT true,profile,
  (SELECT coalesce(jsonb_agg(x ORDER BY x->>'table'),'[]') FROM (
    SELECT jsonb_build_object('table',entity_table,'count',count(*),'digest',encode(sha256(convert_to(string_agg(initial_values::text,chr(10) ORDER BY initial_values::text COLLATE "C"),'UTF8')),'hex')) x
    FROM _migration.hearing_edit_import GROUP BY entity_table) r)
  FROM _migration.staff_roster_boundary;
ALTER TABLE public.hearings ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0);
ALTER TABLE public.hearing_attendees ADD COLUMN is_retired boolean NOT NULL DEFAULT false;
ALTER TABLE public.hearing_attendees ADD COLUMN current_order integer CHECK(current_order>0);
-- Imported ordinal is never rewritten; initial current order follows the historical display.
CREATE INDEX hearing_attendees_current_order_idx ON public.hearing_attendees(hearing_id,current_order,id) WHERE NOT is_retired;
CREATE TABLE _migration.hearing_edit_submission (
  actor_id integer NOT NULL REFERENCES public.audit_actors(id), submission_id uuid NOT NULL,
  request_payload jsonb NOT NULL, hearing_id integer NOT NULL REFERENCES public.hearings(id),
  result_version bigint NOT NULL, changed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(), PRIMARY KEY(submission_id)
);
CREATE TABLE _migration.hearing_edit_change (
  hearing_id integer NOT NULL REFERENCES public.hearings(id), version bigint NOT NULL,
  actor_id integer NOT NULL REFERENCES public.audit_actors(id),
  before_values jsonb, after_values jsonb NOT NULL,
  request_id uuid NOT NULL, PRIMARY KEY(hearing_id,version)
);
CREATE FUNCTION _migration.hearing_edit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Matter import, submission and change evidence is immutable'; END;
$$;
DO $guards$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hearing_edit_import','hearing_edit_boundary','hearing_edit_submission','hearing_edit_change'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.hearing_edit_immutable()',t);
    IF t IN ('hearing_edit_import','hearing_edit_boundary') THEN
      EXECUTE format('CREATE TRIGGER immutable_insert BEFORE INSERT ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.hearing_edit_immutable()',t);
    END IF;
  END LOOP;
END
$guards$;
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason)
VALUES ('public','hearings','row_version',64,'value','hearing_edit_aggregate_version'),
 ('public','hearing_attendees','is_retired',64,'value','hearing_edit_retained_membership'),
 ('public','hearing_attendees','current_order',64,'value','hearing_edit_current_order');
CREATE FUNCTION _migration.hearing_edit_require_account(p_account integer,p_version integer,p_role text,p_expires timestamptz,p_lock boolean) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor integer;
BEGIN
  IF p_expires IS NULL OR p_expires<=clock_timestamp() OR p_role NOT IN ('Administrator','Litigation Assistant') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized hearing session required';
  END IF;
  IF p_lock THEN
    PERFORM 1 FROM public.people p JOIN public.user_accounts u ON u.person_id=p.id WHERE u.id=p_account FOR SHARE OF p,u;
  END IF;
  SELECT a.id INTO actor FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id JOIN public.audit_actors a ON a.user_account_id=u.id AND a.actor_kind='human'
    WHERE u.id=p_account AND u.session_version=p_version AND u.role_code=p_role AND u.is_enabled AND u.password_hash IS NOT NULL
      AND NOT u.must_change_password AND p.is_staff AND p.is_active AND p.can_login;
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized hearing session required'; END IF;
  RETURN actor;
END;
$$;
CREATE FUNCTION _migration.hearing_edit_positive(v jsonb,nullable boolean) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT coalesce((nullable AND v='null'::jsonb) OR (jsonb_typeof(v)='number' AND v::text ~ '^[1-9][0-9]{0,9}$' AND v::text::numeric<=2147483647),false)
$$;
CREATE FUNCTION _migration.hearing_edit_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
 SELECT jsonb_build_object('hearing',to_jsonb(h),'attendees',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.hearing_attendees a WHERE a.hearing_id=h.id),'[]')) FROM public.hearings h WHERE h.id=p_id
$$;
CREATE FUNCTION _migration.hearing_edit_initial_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('hearing',h.initial_values||jsonb_build_object('row_version',1),'attendees',coalesce((SELECT jsonb_agg(i.initial_values||jsonb_build_object('is_retired',false,'current_order',NULL) ORDER BY i.id) FROM _migration.hearing_edit_import i WHERE entity_table='hearing_attendees' AND (initial_values->>'hearing_id')::integer=p_id),'[]')) FROM _migration.hearing_edit_import h WHERE entity_table='hearings' AND h.id=p_id
$$;
CREATE FUNCTION _migration.hearing_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; expected_version bigint;
BEGIN
  expected:=_migration.hearing_edit_initial_aggregate(p_id);
  expected_version:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
  FOR c IN SELECT * FROM _migration.hearing_edit_change WHERE hearing_id=p_id ORDER BY version LOOP
    IF c.version<>expected_version OR c.before_values IS DISTINCT FROM expected
      OR (c.after_values->'hearing'->>'row_version')::bigint<>c.version
      OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='hearings' AND e.entity_schema='public'
        AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id
        AND e.after_values->>'row_version'=c.version::text AND e.action IN ('record_created','record_updated')) THEN RETURN false; END IF;
    expected:=c.after_values; expected_version:=expected_version+1;
  END LOOP;
  RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.hearing_edit_aggregate(p_id);
END;
$$;
CREATE FUNCTION _migration.hearing_edit_complete() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity integer;
BEGIN
 identity:=CASE WHEN TG_TABLE_NAME='hearings' THEN (to_jsonb(NEW)->>'id')::integer ELSE (to_jsonb(NEW)->>'hearing_id')::integer END;
 IF NOT _migration.hearing_edit_current_valid(identity) THEN RAISE EXCEPTION 'Hearing aggregate lacks continuous audited change evidence'; END IF;
 RETURN NULL;
END;
$$;
CREATE FUNCTION _migration.hearing_edit_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous jsonb; incoming jsonb; allowed text[]; k text;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Hearing and attendee history cannot be physically deleted'; END IF;
 incoming:=to_jsonb(NEW);
 allowed:=CASE WHEN TG_TABLE_NAME='hearings' THEN ARRAY['hearing_date','next_hearing_date','action_id','decision','outcome','court_id','circuit','notes','row_version'] ELSE ARRAY['is_retired','current_order'] END;
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
DO $row_guards$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['hearings','hearing_attendees'] LOOP
  EXECUTE format('CREATE TRIGGER zz_hearing_edit_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION _migration.hearing_edit_guard()',t);
  EXECUTE format('CREATE TRIGGER hearing_edit_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.hearing_edit_guard()',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER hearing_edit_complete AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.hearing_edit_complete()',t);
 END LOOP;
END
$row_guards$;
CREATE FUNCTION _migration.hearing_edit_validate_values(p_values jsonb,p_original jsonb,p_create boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item record; result jsonb:=p_values; lookup_name text; eligible boolean;
BEGIN
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid hearing fields'; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_values) LOOP
  IF item.key NOT IN('hearing_date','next_hearing_date','action_id','decision','outcome','court_id','circuit','notes','matter_id') OR (item.key='matter_id' AND NOT p_create) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsupported hearing field'; END IF;
  IF item.key LIKE '%_id' THEN
   IF NOT _migration.hearing_edit_positive(item.value,true) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid selection identity'; END IF;
  ELSE
   IF jsonb_typeof(item.value) NOT IN('string','null') OR length(item.value#>>'{}')>10000 OR (item.value#>>'{}') ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid hearing text'; END IF;
  END IF;
  IF item.key IN('hearing_date','next_hearing_date') AND item.value<>'null'::jsonb THEN
   IF (item.value#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (item.value#>>'{}') LIKE '0000-%' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Date-only value required'; END IF;
   PERFORM (item.value#>>'{}')::date;
  END IF;
  IF NOT p_create AND item.value IS NOT DISTINCT FROM p_original->item.key THEN result:=result-item.key; CONTINUE; END IF;
  IF item.key IN('court_id','circuit','notes') AND NOT p_create AND (p_original->>'legacy_id')::integer IN(7072,7071,7237,7383,7451,7073,7070,7219,7351,7129,7159,7382) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='D41 hearing fields are protected'; END IF;
  lookup_name:=CASE item.key WHEN 'action_id' THEN 'lookup_hearing_action' WHEN 'court_id' THEN 'lookup_court' END;
  IF lookup_name IS NOT NULL AND item.value<>'null'::jsonb THEN
   EXECUTE format('SELECT is_active FROM public.%I WHERE id=$1 FOR SHARE',lookup_name) INTO eligible USING (item.value#>>'{}')::integer;
   IF eligible IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Active classification required'; END IF;
  END IF;
 END LOOP;
 RETURN result;
END;
$$;
CREATE FUNCTION public.hearing_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_id integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE record jsonb; result jsonb;
BEGIN
 PERFORM _migration.hearing_edit_require_account(p_account,p_session,p_role,p_expires,false);
 IF p_id IS NOT NULL THEN
  SELECT jsonb_build_object('id',h.id,'version',h.row_version::text,'protected',coalesce(h.legacy_id IN(7072,7071,7237,7383,7451,7073,7070,7219,7351,7129,7159,7382),false),'archived',coalesce(m.is_archived,false),'values',jsonb_build_object('matter_id',h.matter_id,'hearing_date',h.hearing_date::text,'next_hearing_date',h.next_hearing_date::text,'action_id',h.action_id,'decision',h.decision,'outcome',h.outcome,'court_id',h.court_id,'circuit',h.circuit,'notes',h.notes)) INTO record FROM public.hearings h LEFT JOIN public.matters m ON m.id=h.matter_id WHERE h.id=p_id;
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
CREATE FUNCTION public.hearing_edit_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
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
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.hearings,public.hearing_attendees FROM litigation_runtime;
REVOKE ALL ON SEQUENCE public.hearings_id_seq,public.hearing_attendees_id_seq FROM litigation_runtime;
REVOKE ALL ON _migration.hearing_edit_import,_migration.hearing_edit_boundary,_migration.hearing_edit_submission,_migration.hearing_edit_change,_migration.hearing_edit_initial_hearings,_migration.hearing_edit_initial_hearing_attendees FROM PUBLIC,litigation_runtime;
DO $permissions$
DECLARE routine regprocedure;
BEGIN
 FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND p.proname LIKE 'hearing_edit_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',routine); END LOOP;
END
$permissions$;
GRANT EXECUTE ON FUNCTION public.hearing_edit_state(integer,integer,text,timestamptz,integer),public.hearing_edit_save(integer,integer,text,timestamptz,jsonb) TO litigation_runtime;
DO $postcondition$
BEGIN
 IF EXISTS(SELECT 1 FROM public.hearings h WHERE NOT _migration.hearing_edit_current_valid(h.id)) THEN RAISE EXCEPTION 'Hearing migration changed original values'; END IF;
END
$postcondition$;
COMMIT;
