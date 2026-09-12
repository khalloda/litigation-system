-- Task 4.2 Phase 2. Pending on real development; disposable proof only.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.matters,public.matter_parties,public.matter_party_roles,public.matter_lawyers IN ACCESS EXCLUSIVE MODE;
CREATE TABLE _migration.matter_edit_import (
  entity_table text NOT NULL CHECK(entity_table IN ('matters','matter_parties','matter_party_roles','matter_lawyers')),
  id integer NOT NULL,
  initial_values jsonb NOT NULL CHECK(jsonb_typeof(initial_values)='object' AND (initial_values->>'id')::integer=id),
  PRIMARY KEY(entity_table,id)
);
DO $precondition$
DECLARE t text; expected jsonb; actual jsonb; profile text;
BEGIN
  IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
    OR (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>63
    OR EXISTS(SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20260912120000_matter_editing_boundary') THEN
    RAISE EXCEPTION 'Exact complete migration-63 direct owner prestate required';
  END IF;
  SELECT b.profile INTO STRICT profile FROM _migration.staff_roster_boundary b;
  FOREACH t IN ARRAY ARRAY['matters','matter_parties','matter_party_roles','matter_lawyers'] LOOP
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
    EXECUTE format('INSERT INTO _migration.matter_edit_import SELECT $1,id,to_jsonb(r) FROM public.%I r',t) USING t;
    -- Expand the old row shape before adding operational columns.
    EXECUTE format('CREATE VIEW _migration.matter_edit_initial_%I AS SELECT (jsonb_populate_record(NULL::public.%I,initial_values)).* FROM _migration.matter_edit_import WHERE entity_table=%L',t,t,t);
  END LOOP;
END
$precondition$;
CREATE TABLE _migration.matter_edit_boundary (
  singleton boolean PRIMARY KEY CHECK(singleton), profile text NOT NULL,
  inventory jsonb NOT NULL, established_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO _migration.matter_edit_boundary SELECT true,profile,
  (SELECT coalesce(jsonb_agg(x ORDER BY x->>'table'),'[]') FROM (
    SELECT jsonb_build_object('table',entity_table,'count',count(*),'digest',encode(sha256(convert_to(string_agg(initial_values::text,chr(10) ORDER BY initial_values::text COLLATE "C"),'UTF8')),'hex')) x
    FROM _migration.matter_edit_import GROUP BY entity_table) r)
  FROM _migration.staff_roster_boundary;
ALTER TABLE public.matters ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0);
ALTER TABLE public.matter_parties ADD COLUMN is_retired boolean NOT NULL DEFAULT false;
ALTER TABLE public.matter_party_roles ADD COLUMN is_retired boolean NOT NULL DEFAULT false;
ALTER TABLE public.matter_lawyers ADD COLUMN is_retired boolean NOT NULL DEFAULT false;
-- Identity uniqueness continues to include retained rows: restoration reuses ID.
DROP INDEX public.matter_lawyers_one_lead_per_matter;
CREATE UNIQUE INDEX matter_lawyers_one_lead_per_matter ON public.matter_lawyers(matter_id) WHERE role='lead' AND NOT is_retired;
DROP INDEX public.matter_party_roles_party_ordinal_key;
ALTER TABLE public.matter_party_roles ADD CONSTRAINT matter_party_roles_party_ordinal_key UNIQUE(party_id,ordinal) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE _migration.matter_edit_submission (
  actor_id integer NOT NULL REFERENCES public.audit_actors(id), submission_id uuid NOT NULL,
  request_payload jsonb NOT NULL, matter_id integer NOT NULL REFERENCES public.matters(id),
  result_version bigint NOT NULL, changed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(), PRIMARY KEY(actor_id,submission_id)
);
CREATE TABLE _migration.matter_edit_change (
  matter_id integer NOT NULL REFERENCES public.matters(id), version bigint NOT NULL,
  actor_id integer NOT NULL REFERENCES public.audit_actors(id),
  before_values jsonb, after_values jsonb NOT NULL,
  request_id uuid NOT NULL, PRIMARY KEY(matter_id,version)
);
CREATE FUNCTION _migration.matter_edit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Matter import, submission and change evidence is immutable'; END;
$$;
DO $guards$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['matter_edit_import','matter_edit_boundary','matter_edit_submission','matter_edit_change'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.matter_edit_immutable()',t);
    IF t IN ('matter_edit_import','matter_edit_boundary') THEN
      EXECUTE format('CREATE TRIGGER immutable_insert BEFORE INSERT ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.matter_edit_immutable()',t);
    END IF;
  END LOOP;
END
$guards$;
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason)
VALUES ('public','matters','row_version',64,'value','matter_edit_aggregate_version'),
 ('public','matter_parties','is_retired',64,'value','matter_edit_retained_relationship'),
 ('public','matter_party_roles','is_retired',64,'value','matter_edit_retained_relationship'),
 ('public','matter_lawyers','is_retired',64,'value','matter_edit_retained_relationship');

CREATE FUNCTION _migration.matter_edit_require_account(p_account integer,p_version integer,p_role text,p_expires timestamptz,p_lock boolean) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor integer;
BEGIN
  IF p_expires IS NULL OR p_expires<=clock_timestamp() OR p_role NOT IN ('Administrator','Litigation Assistant') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized matter session required';
  END IF;
  IF p_lock THEN
    PERFORM 1 FROM public.people p JOIN public.user_accounts u ON u.person_id=p.id WHERE u.id=p_account FOR SHARE OF p,u;
  END IF;
  SELECT a.id INTO actor FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id JOIN public.audit_actors a ON a.user_account_id=u.id AND a.actor_kind='human'
    WHERE u.id=p_account AND u.session_version=p_version AND u.role_code=p_role AND u.is_enabled AND u.password_hash IS NOT NULL
      AND NOT u.must_change_password AND p.is_staff AND p.is_active AND p.can_login;
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current authorized matter session required'; END IF;
  RETURN actor;
END;
$$;
CREATE FUNCTION _migration.matter_edit_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
 SELECT jsonb_build_object('matter',to_jsonb(m),
   'parties',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.matter_parties p WHERE p.matter_id=m.id),'[]'),
   'capacities',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.matter_party_roles r JOIN public.matter_parties p ON p.id=r.party_id WHERE p.matter_id=m.id),'[]'),
   'lawyers',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.matter_lawyers l WHERE l.matter_id=m.id),'[]'))
 FROM public.matters m WHERE m.id=p_id
$$;
CREATE FUNCTION _migration.matter_edit_initial_aggregate(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('matter',m.initial_values||jsonb_build_object('row_version',1),
  'parties',coalesce((SELECT jsonb_agg(i.initial_values||jsonb_build_object('is_retired',false) ORDER BY i.id) FROM _migration.matter_edit_import i WHERE entity_table='matter_parties' AND (initial_values->>'matter_id')::integer=p_id),'[]'),
  'capacities',coalesce((SELECT jsonb_agg(i.initial_values||jsonb_build_object('is_retired',false) ORDER BY i.id) FROM _migration.matter_edit_import i JOIN _migration.matter_edit_import p ON p.entity_table='matter_parties' AND p.id=(i.initial_values->>'party_id')::integer WHERE i.entity_table='matter_party_roles' AND (p.initial_values->>'matter_id')::integer=p_id),'[]'),
  'lawyers',coalesce((SELECT jsonb_agg(i.initial_values||jsonb_build_object('is_retired',false) ORDER BY i.id) FROM _migration.matter_edit_import i WHERE entity_table='matter_lawyers' AND (initial_values->>'matter_id')::integer=p_id),'[]'))
 FROM _migration.matter_edit_import m WHERE m.entity_table='matters' AND m.id=p_id
$$;
CREATE FUNCTION _migration.matter_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; expected_version bigint;
BEGIN
  expected:=_migration.matter_edit_initial_aggregate(p_id);
  expected_version:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
  FOR c IN SELECT * FROM _migration.matter_edit_change WHERE matter_id=p_id ORDER BY version LOOP
    IF c.version<>expected_version OR c.before_values IS DISTINCT FROM expected
      OR (c.after_values->'matter'->>'row_version')::bigint<>c.version
      OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='matters' AND e.entity_schema='public'
        AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id
        AND e.after_values->>'row_version'=c.version::text AND e.action IN ('record_created','record_updated')) THEN RETURN false; END IF;
    expected:=c.after_values; expected_version:=expected_version+1;
  END LOOP;
  RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.matter_edit_aggregate(p_id);
END;
$$;
CREATE FUNCTION _migration.matter_edit_complete() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity integer;
BEGIN
  identity:=CASE WHEN TG_TABLE_NAME='matters' THEN (to_jsonb(NEW)->>'id')::integer WHEN TG_TABLE_NAME='matter_party_roles' THEN (SELECT matter_id FROM public.matter_parties WHERE id=(to_jsonb(NEW)->>'party_id')::integer) ELSE (to_jsonb(NEW)->>'matter_id')::integer END;
  IF NOT _migration.matter_edit_current_valid(identity) THEN RAISE EXCEPTION 'Matter aggregate lacks complete continuous audited change evidence'; END IF;
  RETURN NULL;
END;
$$;
CREATE FUNCTION _migration.matter_edit_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE allowed text[]; previous jsonb; incoming jsonb; k text;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Matter records and relationship history cannot be physically deleted'; END IF;
  incoming:=to_jsonb(NEW);
  allowed:=CASE TG_TABLE_NAME
    WHEN 'matters' THEN ARRAY['case_number_ar','subject','status','current_status','circuit','circuit_secretary','court_floor','court_hall','court_shelf','court_secretary_room','notes_1','notes_2','evaluation','legal_opinion','matter_type_id','matter_category_id','degree_id','venue_id','importance_id','destination_id','court_id','branch_id','start_date','end_date','asked_amount','judged_amount','row_version','case_number_ar_normalised','subject_normalised']
    WHEN 'matter_parties' THEN ARRAY['side','party_name','gender','ordinal','is_retired']
    WHEN 'matter_party_roles' THEN ARRAY['ordinal','is_retired']
    WHEN 'matter_lawyers' THEN ARRAY['role','position','is_retired'] END;
  IF TG_OP='UPDATE' THEN
    previous:=to_jsonb(OLD);
    IF incoming-allowed-ARRAY['updated_at','updated_by'] IS DISTINCT FROM previous-allowed-ARRAY['updated_at','updated_by'] THEN RAISE EXCEPTION 'Matter identity, ownership and source evidence are immutable'; END IF;
    IF TG_TABLE_NAME='matters' AND (incoming->>'row_version')::bigint<>(previous->>'row_version')::bigint+1 THEN RAISE EXCEPTION 'Matter aggregate version must advance once'; END IF;
  ELSE
    FOR k IN SELECT key FROM jsonb_each(incoming) WHERE key LIKE 'legacy_%' OR key IN ('source_field','source_member_ordinal','source_fragment_ordinal','reviewed_rule_id','fee_letter_ref','case_number_en') LOOP
      IF incoming->k<>'null'::jsonb THEN RAISE EXCEPTION 'Native matter records cannot invent source evidence'; END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
DO $row_guards$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['matters','matter_parties','matter_party_roles','matter_lawyers'] LOOP
    EXECUTE format('CREATE TRIGGER zz_matter_edit_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION _migration.matter_edit_guard()',t);
    EXECUTE format('CREATE TRIGGER matter_edit_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.matter_edit_guard()',t);
    EXECUTE format('CREATE CONSTRAINT TRIGGER matter_edit_complete AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.matter_edit_complete()',t);
  END LOOP;
END
$row_guards$;

CREATE FUNCTION _migration.matter_edit_validate_values(p_values jsonb,p_original jsonb,p_create boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item record; lookup_name text; target integer; eligible boolean; result jsonb:=p_values; default_id integer;
BEGIN
  IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid matter fields'; END IF;
  FOR item IN SELECT key,value FROM jsonb_each(p_values) LOOP
    IF item.key NOT IN ('case_number_ar','subject','status','current_status','circuit','circuit_secretary','court_floor','court_hall','court_shelf','court_secretary_room','notes_1','notes_2','evaluation','legal_opinion','matter_type_id','matter_category_id','degree_id','venue_id','importance_id','destination_id','court_id','branch_id','start_date','end_date','asked_amount','judged_amount','client_id')
      OR (item.key='client_id' AND NOT p_create) OR length(item.value#>>'{}')>100000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsupported matter field'; END IF;
    IF item.key LIKE '%_id' THEN
      IF jsonb_typeof(item.value) NOT IN ('number','null') OR (item.value<>'null'::jsonb AND (item.value#>>'{}') !~ '^[1-9][0-9]*$') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid selection identity'; END IF;
    ELSIF jsonb_typeof(item.value) NOT IN ('string','null') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Matter text required';
    END IF;
    IF item.key IN ('asked_amount','judged_amount') AND item.value<>'null'::jsonb AND (item.value#>>'{}') !~ '^-?[0-9]{1,16}(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Exact decimal required'; END IF;
    IF item.key IN ('start_date','end_date') AND item.value<>'null'::jsonb THEN
      IF (item.value#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (item.value#>>'{}') LIKE '0000-%' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Date-only value required'; END IF;
      PERFORM (item.value#>>'{}')::date;
    END IF;
    IF NOT p_create AND (item.value IS NOT DISTINCT FROM p_original->item.key OR
      (item.key IN ('asked_amount','judged_amount') AND item.value<>'null'::jsonb AND (item.value#>>'{}')::numeric IS NOT DISTINCT FROM (p_original->>item.key)::numeric)) THEN result:=result-item.key; CONTINUE; END IF;
    IF item.key='client_id' AND item.value<>'null'::jsonb THEN
      PERFORM 1 FROM public.clients WHERE id=(item.value#>>'{}')::integer AND NOT is_archived FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Eligible client required'; END IF;
    END IF;
    lookup_name:=CASE item.key WHEN 'matter_type_id' THEN 'lookup_matter_type' WHEN 'matter_category_id' THEN 'lookup_matter_category'
      WHEN 'degree_id' THEN 'lookup_degree' WHEN 'venue_id' THEN 'lookup_venue' WHEN 'importance_id' THEN 'lookup_importance'
      WHEN 'destination_id' THEN 'lookup_matter_destination' WHEN 'court_id' THEN 'lookup_court' WHEN 'branch_id' THEN 'lookup_client_branch' END;
    IF lookup_name IS NOT NULL AND item.value<>'null'::jsonb THEN
      target:=(item.value#>>'{}')::integer;
      EXECUTE format('SELECT is_active FROM public.%I WHERE id=$1 FOR SHARE',lookup_name) INTO eligible USING target;
      IF eligible IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Active classification required'; END IF;
    END IF;
  END LOOP;
  IF p_create AND NOT p_values ? 'matter_type_id' THEN
    SELECT id INTO STRICT default_id FROM public.lookup_matter_type WHERE is_default AND is_active FOR SHARE;
    result:=result||jsonb_build_object('matter_type_id',default_id);
  END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION public.matter_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_id integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE result jsonb; choices jsonb:='{}'; item record; rows jsonb; record jsonb;
BEGIN
  PERFORM _migration.matter_edit_require_account(p_account,p_session,p_role,p_expires,false);
  IF p_id IS NOT NULL THEN
    SELECT jsonb_build_object('id',id,'version',row_version::text,'values',jsonb_build_object(
      'case_number_ar',case_number_ar,'subject',subject,'status',status,'current_status',current_status,
      'circuit',circuit,'circuit_secretary',circuit_secretary,'court_floor',court_floor,'court_hall',court_hall,'court_shelf',court_shelf,'court_secretary_room',court_secretary_room,
      'notes_1',notes_1,'notes_2',notes_2,'evaluation',evaluation,'legal_opinion',legal_opinion,
      'client_id',client_id,'branch_id',branch_id,'matter_type_id',matter_type_id,'matter_category_id',matter_category_id,'degree_id',degree_id,'venue_id',venue_id,
      'importance_id',importance_id,'destination_id',destination_id,'court_id',court_id,'start_date',start_date::text,'end_date',end_date::text,'asked_amount',asked_amount::text,'judged_amount',judged_amount::text))
      INTO record FROM public.matters WHERE id=p_id;
    IF record IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Matter not found'; END IF;
  END IF;
  FOR item IN SELECT * FROM (VALUES ('matter_type_id','lookup_matter_type'),('matter_category_id','lookup_matter_category'),('degree_id','lookup_degree'),('venue_id','lookup_venue'),('importance_id','lookup_importance'),('destination_id','lookup_matter_destination'),('court_id','lookup_court'),('branch_id','lookup_client_branch')) v(field,table_name) LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''id'',id,''name'',label_ar,''active'',is_active) ORDER BY sort_order,id),''[]'') FROM public.%I WHERE is_active OR id=$1',item.table_name) INTO rows USING (record->'values'->>item.field)::integer;
    choices:=choices||jsonb_build_object(item.field,rows);
  END LOOP;
  result:=jsonb_build_object('record',record,'choices',choices,
    'defaultType',(SELECT id FROM lookup_matter_type WHERE is_default AND is_active),
    'clients',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name_ar,'context',coalesce(full_name,name_en),'active',NOT is_archived) ORDER BY name_ar COLLATE "arabic",id),'[]') FROM clients WHERE NOT is_archived OR id=(record->'values'->>'client_id')::integer),
    'branches',(SELECT coalesce(jsonb_agg(jsonb_build_object('client_id',client_id,'branch_id',branch_id) ORDER BY client_id,branch_id),'[]') FROM _migration.client_branch_compatibility),
    'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name_ar,'active',p.is_active AND p.is_staff) ORDER BY p.name_ar COLLATE "arabic",p.id),'[]') FROM people p WHERE (p.is_staff AND p.is_active) OR EXISTS(SELECT 1 FROM matter_lawyers l WHERE l.matter_id=p_id AND l.person_id=p.id AND NOT l.is_retired)),
    'roles',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'male',label_ar_m,'female',label_ar_f,'active',is_active) ORDER BY sort_order,id),'[]') FROM lookup_party_role),
    'parties',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'side',p.side,'party_name',p.party_name,'gender',p.gender,'ordinal',p.ordinal,'roles',
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'role_id',r.role_id,'ordinal',r.ordinal) ORDER BY r.ordinal NULLS LAST,r.id),'[]') FROM matter_party_roles r WHERE r.party_id=p.id AND NOT r.is_retired)) ORDER BY p.side,p.ordinal NULLS LAST,p.id),'[]') FROM matter_parties p WHERE p.matter_id=p_id AND NOT p.is_retired),
    'lawyers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'person_id',person_id,'role',role,'position',position) ORDER BY position NULLS LAST,id),'[]') FROM matter_lawyers WHERE matter_id=p_id AND NOT is_retired));
  IF length(result::text)>1000000 THEN RAISE EXCEPTION 'Matter form exceeds supported bounded size'; END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION _migration.matter_edit_positive(v jsonb,nullable boolean) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT coalesce((nullable AND v='null'::jsonb) OR (jsonb_typeof(v)='number' AND v::text ~ '^[1-9][0-9]{0,9}$' AND v::text::numeric<=2147483647),false)
$$;
CREATE FUNCTION public.matter_edit_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; identity integer; expected bigint; submission uuid; original jsonb; before_state jsonb; after_state jsonb; patch jsonb;
 receipt _migration.matter_edit_submission%ROWTYPE; snapshot jsonb; parties jsonb; lawyers jsonb; p jsonb; r jsonb; l jsonb;
 target_party integer; child_id integer; old_child jsonb; assignments text; columns text; selections text; changed boolean; version bigint;
BEGIN
  actor:=_migration.matter_edit_require_account(p_account,p_session,p_role,p_expires,true);
  IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Matter actor does not match trusted audit context'; END IF;
  PERFORM public.audit_ensure_event_context();
  IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR length(p_request::text)>500000
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN ('id','version','submission','values','parties','lawyers'))
    OR NOT p_request ?& ARRAY['id','version','submission','values'] THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid matter request'; END IF;
  IF NOT _migration.matter_edit_positive(p_request->'id',true) OR jsonb_typeof(p_request->'version') NOT IN ('string','null') OR jsonb_typeof(p_request->'submission')<>'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid request identity types'; END IF;
  IF (p_request->'version'<>'null'::jsonb AND (p_request->>'version') !~ '^[1-9][0-9]{0,18}$') OR (p_request->>'submission') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid request identity format'; END IF;
  identity:=(p_request->>'id')::integer; expected:=(p_request->>'version')::bigint; submission:=(p_request->>'submission')::uuid;
  IF submission IS NULL OR (identity IS NULL)<>(expected IS NULL) OR identity<1 OR expected<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid matter version or submission'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||submission::text,42));
  SELECT * INTO receipt FROM _migration.matter_edit_submission WHERE actor_id=actor AND submission_id=submission;
  IF FOUND THEN
    IF receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Matter submission payload differs'; END IF;
    RETURN jsonb_build_object('id',receipt.matter_id,'version',receipt.result_version::text,'changed',receipt.changed);
  END IF;
  IF identity IS NOT NULL THEN
    SELECT to_jsonb(m) INTO original FROM matters m WHERE id=identity FOR UPDATE;
    IF original IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Matter not found'; END IF;
    IF (original->>'row_version')::bigint<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Matter version is stale'; END IF;
    before_state:=_migration.matter_edit_aggregate(identity);
  END IF;
  patch:=_migration.matter_edit_validate_values(p_request->'values',original,identity IS NULL);
  snapshot:=CASE WHEN identity IS NULL THEN NULL ELSE public.matter_edit_state(p_account,p_session,p_role,p_expires,identity) END;
  parties:=coalesce(p_request->'parties',snapshot->'parties','[]');
  lawyers:=coalesce(p_request->'lawyers',snapshot->'lawyers','[]');
  IF jsonb_typeof(parties)<>'array' OR jsonb_typeof(lawyers)<>'array' OR jsonb_array_length(parties)>500 OR jsonb_array_length(lawyers)>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid matter relationships'; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(parties) LOOP
    IF jsonb_typeof(p)<>'object' OR NOT _migration.matter_edit_positive(p->'id',true) OR NOT _migration.matter_edit_positive(p->'ordinal',true) OR jsonb_typeof(p->'party_name') NOT IN ('string','null') OR length(p->>'party_name')>100000 OR jsonb_typeof(p->'side')<>'string' OR jsonb_typeof(p->'gender') NOT IN ('string','null') OR jsonb_typeof(p->'roles')<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid party value types'; END IF;
    FOR r IN SELECT value FROM jsonb_array_elements(p->'roles') LOOP
      IF jsonb_typeof(r)<>'object' OR NOT _migration.matter_edit_positive(r->'id',true) OR NOT _migration.matter_edit_positive(r->'ordinal',true) OR NOT _migration.matter_edit_positive(r->'role_id',false) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid capacity value types'; END IF;
    END LOOP;
  END LOOP;
  FOR l IN SELECT value FROM jsonb_array_elements(lawyers) LOOP
    IF jsonb_typeof(l)<>'object' OR NOT _migration.matter_edit_positive(l->'id',true) OR NOT _migration.matter_edit_positive(l->'position',true) OR NOT _migration.matter_edit_positive(l->'person_id',false) OR jsonb_typeof(l->'role')<>'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lawyer value types'; END IF;
  END LOOP;
  IF identity IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_each(p_request->'values') v WHERE v.key<>'matter_type_id' AND coalesce(btrim(v.value#>>'{}'),'')<>'') AND parties='[]' AND lawyers='[]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Blank matter creation refused'; END IF;
  changed:=identity IS NULL OR patch<>'{}' OR parties IS DISTINCT FROM snapshot->'parties' OR lawyers IS DISTINCT FROM snapshot->'lawyers';
  IF NOT changed THEN RETURN jsonb_build_object('id',identity,'version',expected::text,'changed',false); END IF;
  -- Lock selected staff by numeric ID in deterministic order before child writes.
  PERFORM 1 FROM people WHERE id IN (SELECT (v->>'person_id')::integer FROM jsonb_array_elements(lawyers) v) ORDER BY id FOR SHARE;
  IF identity IS NULL THEN
    SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('v.%I',key),',' ORDER BY key) INTO columns,selections FROM jsonb_object_keys(patch) key;
    EXECUTE format('INSERT INTO public.matters(%s,updated_at) SELECT %s,statement_timestamp() FROM jsonb_populate_record(NULL::public.matters,$1) v RETURNING id',columns,selections) INTO identity USING patch;
    version:=1;
  ELSE
    SELECT string_agg(format('%I=v.%I',key,key),',' ORDER BY key) INTO assignments FROM jsonb_object_keys(patch) key;
    EXECUTE format('UPDATE public.matters m SET row_version=m.row_version+1%s FROM jsonb_populate_record(NULL::public.matters,$1) v WHERE m.id=$2 RETURNING m.row_version',CASE WHEN assignments IS NULL THEN '' ELSE ','||assignments END) INTO version USING original||patch,identity;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(lawyers) v GROUP BY v->>'person_id' HAVING count(*)>1)
    OR (SELECT count(*) FROM jsonb_array_elements(lawyers) v WHERE v->>'role'='lead')>1
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(parties) v WHERE v->>'id' IS NOT NULL GROUP BY v->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate matter relationship'; END IF;
  UPDATE matter_lawyers SET is_retired=true WHERE matter_id=identity AND NOT is_retired AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lawyers) v WHERE (v->>'person_id')::integer=person_id);
  -- Release lead designation before assigning another lead in the same save.
  UPDATE matter_lawyers SET role=v->>'role' FROM jsonb_array_elements(lawyers) v WHERE matter_id=identity AND person_id=(v->>'person_id')::integer AND role='lead' AND v->>'role'<>'lead';
  FOR l IN SELECT value FROM jsonb_array_elements(lawyers) LOOP
    IF jsonb_typeof(l)<>'object' OR NOT l ?& ARRAY['id','person_id','role','position'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(l) k WHERE k NOT IN ('id','person_id','role','position')) OR l->>'role' NOT IN ('lead','co_lead','support') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lawyer fields'; END IF;
    SELECT to_jsonb(x) INTO old_child FROM matter_lawyers x WHERE matter_id=identity AND person_id=(l->>'person_id')::integer;
    IF l->>'id' IS NOT NULL AND (old_child IS NULL OR (old_child->>'id')::integer<>(l->>'id')::integer) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Foreign lawyer identity'; END IF;
    IF old_child IS NULL OR (old_child->>'is_retired')::boolean THEN
      PERFORM 1 FROM people WHERE id=(l->>'person_id')::integer AND is_staff AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Active internal lawyer required'; END IF;
    END IF;
    IF old_child IS NULL THEN INSERT INTO matter_lawyers(matter_id,person_id,role,position,updated_at) VALUES(identity,(l->>'person_id')::integer,l->>'role',(l->>'position')::integer,statement_timestamp());
    ELSE UPDATE matter_lawyers SET role=l->>'role',position=(l->>'position')::integer,is_retired=false WHERE id=(old_child->>'id')::integer AND ROW(role,position,is_retired) IS DISTINCT FROM ROW(l->>'role',(l->>'position')::integer,false); END IF;
  END LOOP;
  UPDATE matter_party_roles r SET is_retired=true,ordinal=NULL FROM matter_parties p WHERE p.id=r.party_id AND p.matter_id=identity AND NOT r.is_retired AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parties) v WHERE (v->>'id')::integer=p.id);
  UPDATE matter_parties SET is_retired=true WHERE matter_id=identity AND NOT is_retired AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parties) v WHERE (v->>'id')::integer=id);
  FOR p IN SELECT value FROM jsonb_array_elements(parties) LOOP
    IF jsonb_typeof(p)<>'object' OR NOT p ?& ARRAY['id','side','party_name','gender','ordinal','roles'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('id','side','party_name','gender','ordinal','roles')) OR p->>'side' NOT IN ('client','opponent') OR (p->>'gender' IS NOT NULL AND p->>'gender' NOT IN ('m','f')) OR jsonb_typeof(p->'roles')<>'array' OR jsonb_array_length(p->'roles')>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid party fields'; END IF;
    target_party:=(p->>'id')::integer;
    old_child:=NULL;
    IF target_party IS NOT NULL THEN SELECT to_jsonb(x) INTO old_child FROM matter_parties x WHERE id=target_party AND matter_id=identity;
      IF old_child IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Foreign party identity'; END IF;
    END IF;
    IF (old_child IS NULL OR p->'party_name' IS DISTINCT FROM old_child->'party_name') AND coalesce(btrim(p->>'party_name'),'')='' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Party name required'; END IF;
    IF old_child IS NULL THEN INSERT INTO matter_parties(matter_id,side,party_name,gender,ordinal,updated_at) VALUES(identity,p->>'side',p->>'party_name',p->>'gender',(p->>'ordinal')::integer,statement_timestamp()) RETURNING id INTO target_party;
    ELSE UPDATE matter_parties SET side=p->>'side',party_name=p->>'party_name',gender=p->>'gender',ordinal=(p->>'ordinal')::integer,is_retired=false WHERE id=target_party AND ROW(side,party_name,gender,ordinal,is_retired) IS DISTINCT FROM ROW(p->>'side',p->>'party_name',p->>'gender',(p->>'ordinal')::integer,false); END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'roles') v GROUP BY v->>'role_id' HAVING count(*)>1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate capacity'; END IF;
    UPDATE matter_party_roles SET is_retired=true,ordinal=NULL WHERE matter_party_roles.party_id=target_party AND NOT is_retired AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'roles') v WHERE (v->>'role_id')::integer=role_id);
    FOR r IN SELECT value FROM jsonb_array_elements(p->'roles') LOOP
      IF jsonb_typeof(r)<>'object' OR NOT r ?& ARRAY['id','role_id','ordinal'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN ('id','role_id','ordinal')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid capacity fields'; END IF;
      SELECT to_jsonb(x) INTO old_child FROM matter_party_roles x WHERE x.party_id=target_party AND x.role_id=(r->>'role_id')::integer;
      IF r->>'id' IS NOT NULL AND (old_child IS NULL OR (r->>'id')::integer<>(old_child->>'id')::integer) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Foreign capacity identity'; END IF;
      IF old_child IS NULL OR (old_child->>'is_retired')::boolean THEN
        PERFORM 1 FROM lookup_party_role WHERE id=(r->>'role_id')::integer AND is_active FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Active capacity required'; END IF;
      END IF;
      IF old_child IS NULL THEN INSERT INTO matter_party_roles(party_id,role_id,ordinal,updated_at) VALUES(target_party,(r->>'role_id')::integer,(r->>'ordinal')::integer,statement_timestamp());
      ELSE UPDATE matter_party_roles SET ordinal=(r->>'ordinal')::integer,is_retired=false WHERE id=(old_child->>'id')::integer AND ROW(ordinal,is_retired) IS DISTINCT FROM ROW((r->>'ordinal')::integer,false); END IF;
    END LOOP;
  END LOOP;
  after_state:=_migration.matter_edit_aggregate(identity);
  INSERT INTO _migration.matter_edit_change VALUES(identity,version,actor,before_state,after_state,current_setting('litigation.audit_request_id')::uuid);
  INSERT INTO _migration.matter_edit_submission(actor_id,submission_id,request_payload,matter_id,result_version,changed) VALUES(actor,submission,p_request,identity,version,true);
  RETURN jsonb_build_object('id',identity,'version',version::text,'changed',true);
END;
$$;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.matters,public.matter_parties,public.matter_party_roles,public.matter_lawyers FROM litigation_runtime;
REVOKE ALL ON SEQUENCE public.matters_id_seq,public.matter_parties_id_seq,public.matter_party_roles_id_seq,public.matter_lawyers_id_seq FROM litigation_runtime;
REVOKE ALL ON _migration.matter_edit_import,_migration.matter_edit_boundary,_migration.matter_edit_submission,_migration.matter_edit_change,_migration.matter_edit_initial_matters,_migration.matter_edit_initial_matter_parties,_migration.matter_edit_initial_matter_party_roles,_migration.matter_edit_initial_matter_lawyers FROM PUBLIC,litigation_runtime;
DO $permissions$
DECLARE routine regprocedure;
BEGIN
  FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','_migration') AND p.proname LIKE 'matter_edit_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',routine);
  END LOOP;
END
$permissions$;
GRANT EXECUTE ON FUNCTION public.matter_edit_state(integer,integer,text,timestamptz,integer),public.matter_edit_save(integer,integer,text,timestamptz,jsonb) TO litigation_runtime;
DO $postcondition$
DECLARE t text; mismatch boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['matters','matter_parties','matter_party_roles','matter_lawyers'] LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM _migration.matter_edit_import i FULL JOIN public.%I r ON r.id=i.id AND i.entity_table=$1 WHERE (i.entity_table=$1 OR i.entity_table IS NULL) AND (i.initial_values IS DISTINCT FROM to_jsonb(r)-$2))',t) INTO mismatch USING t,CASE WHEN t='matters' THEN 'row_version' ELSE 'is_retired' END;
    IF mismatch THEN RAISE EXCEPTION 'Matter migration changed original values: %',t; END IF;
  END LOOP;
END
$postcondition$;
COMMIT;
