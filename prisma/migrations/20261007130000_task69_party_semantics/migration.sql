-- Task69 party semantics and qualified ordered capacities. No business restoration.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $precondition$
BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>79
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20261007130000_task69_party_semantics') THEN
 RAISE EXCEPTION 'Exact migration79 direct administration prestate required'; END IF;
END $precondition$;
ALTER TABLE _migration.task69_delta ADD CONSTRAINT task69_delta_exact_identity CHECK (
 (jsonb_typeof(after_values->'id')='number' AND after_values->>'id' ~ '^[1-9][0-9]*$'
 AND (before_values IS NULL OR before_values->'id'=after_values->'id')) IS TRUE);

ALTER TABLE public.matter_parties ADD COLUMN semantic_party_name text CHECK(semantic_party_name IS NULL OR length(semantic_party_name)<=100000);
ALTER TABLE public.matter_parties ADD COLUMN representative_name text CHECK(representative_name IS NULL OR length(representative_name)<=100000);
ALTER TABLE public.matter_parties ADD COLUMN contextual_text text CHECK(contextual_text IS NULL OR length(contextual_text)<=100000);
ALTER TABLE public.matter_parties ADD COLUMN explanatory_text text CHECK(explanatory_text IS NULL OR length(explanatory_text)<=100000);
ALTER TABLE public.matter_party_roles ADD COLUMN display_label text CHECK(display_label IS NULL OR length(display_label)<=100000);
ALTER TABLE public.matter_party_roles ADD COLUMN qualifier text CHECK(qualifier IS NULL OR length(qualifier)<=100000);
DROP INDEX public.matter_party_roles_party_role_key;
ALTER TABLE public.matter_party_roles ADD CONSTRAINT matter_party_roles_party_role_key UNIQUE NULLS NOT DISTINCT (party_id,role_id,display_label,qualifier);
CREATE FUNCTION _migration.task69_party_history(v jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN v IS NULL THEN NULL ELSE jsonb_set(jsonb_set(v,'{parties}',
 coalesce((SELECT jsonb_agg(jsonb_build_object('semantic_party_name',NULL,'representative_name',NULL,'contextual_text',NULL,'explanatory_text',NULL)||r ORDER BY (r->>'id')::int) FROM jsonb_array_elements(v->'parties') r),'[]')),'{capacities}',
 coalesce((SELECT jsonb_agg(jsonb_build_object('display_label',NULL,'qualifier',NULL)||r ORDER BY (r->>'id')::int) FROM jsonb_array_elements(v->'capacities') r),'[]')) END
$$;
REVOKE ALL ON FUNCTION _migration.task69_party_history(jsonb) FROM PUBLIC,litigation_runtime;

CREATE OR REPLACE FUNCTION _migration.matter_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; expected_version bigint;
BEGIN
  expected:=_migration.task69_party_history(_migration.matter_lifecycle_normalize(_migration.matter_edit_initial_aggregate(p_id)));
  expected_version:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
  FOR c IN SELECT * FROM _migration.matter_edit_change WHERE matter_id=p_id ORDER BY version LOOP
    IF c.version<>expected_version OR _migration.task69_party_history(_migration.matter_lifecycle_normalize(c.before_values)) IS DISTINCT FROM expected
      OR (c.after_values->'matter'->>'row_version')::bigint<>c.version
      OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='matters' AND e.entity_schema='public'
        AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id
        AND e.after_values->>'row_version'=c.version::text AND e.action IN ('record_created','record_updated')) THEN RETURN false; END IF;
    IF coalesce((expected->'matter'->>'is_archived')::boolean,false) IS DISTINCT FROM coalesce((c.after_values->'matter'->>'is_archived')::boolean,false) THEN
      IF NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='matters' AND e.entity_schema='public' AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.action=CASE WHEN (c.after_values->'matter'->>'is_archived')::boolean THEN 'archive' ELSE 'restore' END AND e.outcome='succeeded') THEN RETURN false; END IF;
    END IF;
    expected:=_migration.task69_party_history(_migration.matter_lifecycle_normalize(c.after_values)); expected_version:=expected_version+1;
  END LOOP;
  RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.matter_edit_aggregate(p_id);
END;
$$;
CREATE OR REPLACE FUNCTION _migration.matter_edit_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE allowed text[]; previous jsonb; incoming jsonb; k text;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Matter records and relationship history cannot be physically deleted'; END IF;
  incoming:=to_jsonb(NEW);
  allowed:=CASE TG_TABLE_NAME
    WHEN 'matters' THEN ARRAY['case_number_ar','subject','status','current_status','circuit','circuit_secretary','court_floor','court_hall','court_shelf','court_secretary_room','notes_1','notes_2','evaluation','legal_opinion','matter_type_id','matter_category_id','degree_id','venue_id','importance_id','destination_id','court_id','branch_id','start_date','end_date','asked_amount','judged_amount','row_version','is_archived','case_number_ar_normalised','subject_normalised']
    WHEN 'matter_parties' THEN ARRAY['side','party_name','gender','ordinal','is_retired','semantic_party_name','representative_name','contextual_text','explanatory_text']
    WHEN 'matter_party_roles' THEN ARRAY['ordinal','is_retired','display_label','qualifier']
    WHEN 'matter_lawyers' THEN ARRAY['role','position','is_retired'] END;
  IF TG_OP='UPDATE' THEN
    previous:=to_jsonb(OLD);
    -- D41 binds these immutable Access identities; PostgreSQL IDs are unrelated.
    IF TG_TABLE_NAME='matters' AND (previous->>'legacy_id')::integer IN (467,468,515)
      AND incoming->'court_id' IS DISTINCT FROM previous->'court_id' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='D41 court is protected';
    END IF;
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
CREATE OR REPLACE FUNCTION public.matter_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_id integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE result jsonb; choices jsonb:='{}'; item record; rows jsonb; record jsonb;
BEGIN
  PERFORM _migration.matter_edit_require_account(p_account,p_session,p_role,p_expires,false);
  IF EXISTS(SELECT 1 FROM public.matters WHERE id=p_id AND is_archived) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before editing'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT jsonb_build_object('id',id,'version',row_version::text,'courtProtected',coalesce(legacy_id IN (467,468,515),false),'values',jsonb_build_object(
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
    'parties',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'side',p.side,'party_name',p.party_name,'semantic_party_name',p.semantic_party_name,'representative_name',p.representative_name,'contextual_text',p.contextual_text,'explanatory_text',p.explanatory_text,'gender',p.gender,'ordinal',p.ordinal,'roles',
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'role_id',r.role_id,'display_label',r.display_label,'qualifier',r.qualifier,'ordinal',r.ordinal) ORDER BY r.ordinal NULLS LAST,r.id),'[]') FROM matter_party_roles r WHERE r.party_id=p.id AND NOT r.is_retired)) ORDER BY p.side,p.ordinal NULLS LAST,p.id),'[]') FROM matter_parties p WHERE p.matter_id=p_id AND NOT p.is_retired),
    'lawyers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'person_id',person_id,'role',role,'position',position) ORDER BY position NULLS LAST,id),'[]') FROM matter_lawyers WHERE matter_id=p_id AND NOT is_retired));
  IF length(result::text)>1000000 THEN RAISE EXCEPTION 'Matter form exceeds supported bounded size'; END IF;
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.matter_edit_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; identity integer; expected bigint; submission uuid; original jsonb; before_state jsonb; after_state jsonb; patch jsonb;
 receipt _migration.matter_edit_submission%ROWTYPE; snapshot jsonb; parties jsonb; lawyers jsonb; p jsonb; r jsonb; l jsonb;
 target_party integer; child_id integer; old_child jsonb; assignments text; columns text; selections text; changed boolean; version bigint; resolved_parties jsonb:='[]'; resolved_roles jsonb; resolved_lawyers jsonb:='[]';
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
  parties:=coalesce((SELECT jsonb_agg(
    jsonb_build_object('semantic_party_name',old.semantic_party_name,'representative_name',old.representative_name,'contextual_text',old.contextual_text,'explanatory_text',old.explanatory_text)||party_input||
    jsonb_build_object('roles',coalesce((SELECT jsonb_agg(jsonb_build_object('display_label',capacity.display_label,'qualifier',capacity.qualifier)||role_input ORDER BY r_ord)
      FROM jsonb_array_elements(party_input->'roles') WITH ORDINALITY roles(role_input,r_ord)
      LEFT JOIN public.matter_party_roles capacity ON capacity.party_id=old.id AND capacity.id=(role_input->>'id')::integer),'[]')) ORDER BY p_ord)
    FROM jsonb_array_elements(parties) WITH ORDINALITY items(party_input,p_ord)
    LEFT JOIN public.matter_parties old ON old.matter_id=identity AND old.id=(party_input->>'id')::integer),'[]');
  FOR p IN SELECT value FROM jsonb_array_elements(parties) LOOP
    IF jsonb_typeof(p)<>'object' OR NOT _migration.matter_edit_positive(p->'id',true) OR NOT _migration.matter_edit_positive(p->'ordinal',true) OR jsonb_typeof(p->'party_name') NOT IN ('string','null') OR length(p->>'party_name')>100000 OR jsonb_typeof(p->'side')<>'string' OR jsonb_typeof(p->'gender') NOT IN ('string','null') OR jsonb_typeof(p->'roles')<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid party value types'; END IF;
    IF jsonb_typeof(p->'semantic_party_name') NOT IN('string','null') OR length(p->>'semantic_party_name')>100000 OR jsonb_typeof(p->'representative_name') NOT IN('string','null') OR length(p->>'representative_name')>100000 OR jsonb_typeof(p->'contextual_text') NOT IN('string','null') OR length(p->>'contextual_text')>100000 OR jsonb_typeof(p->'explanatory_text') NOT IN('string','null') OR length(p->>'explanatory_text')>100000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid party context'; END IF;
    FOR r IN SELECT value FROM jsonb_array_elements(p->'roles') LOOP
      IF jsonb_typeof(r->'display_label') NOT IN('string','null') OR length(r->>'display_label')>100000 OR jsonb_typeof(r->'qualifier') NOT IN('string','null') OR length(r->>'qualifier')>100000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid capacity display'; END IF;
      IF jsonb_typeof(r)<>'object' OR NOT _migration.matter_edit_positive(r->'id',true) OR NOT _migration.matter_edit_positive(r->'ordinal',true) OR NOT _migration.matter_edit_positive(r->'role_id',false) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid capacity value types'; END IF;
    END LOOP;
  END LOOP;
  FOR l IN SELECT value FROM jsonb_array_elements(lawyers) LOOP
    IF jsonb_typeof(l)<>'object' OR NOT _migration.matter_edit_positive(l->'id',true) OR NOT _migration.matter_edit_positive(l->'position',true) OR NOT _migration.matter_edit_positive(l->'person_id',false) OR jsonb_typeof(l->'role')<>'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lawyer value types'; END IF;
  END LOOP;
  IF identity IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_each(p_request->'values') v WHERE v.key<>'matter_type_id' AND coalesce(btrim(v.value#>>'{}'),'')<>'') AND parties='[]' AND lawyers='[]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Blank matter creation refused'; END IF;
  -- Resolve effective identities only after validating every supplied identity.
  -- The original p_request is untouched: committed retries still require exact payload equality.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(lawyers) v GROUP BY v->>'person_id' HAVING count(*)>1)
    OR (SELECT count(*) FROM jsonb_array_elements(lawyers) v WHERE v->>'role'='lead')>1
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(parties) v WHERE v->>'id' IS NOT NULL GROUP BY v->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate matter relationship'; END IF;
  PERFORM 1 FROM people WHERE id IN (SELECT (v->>'person_id')::integer FROM jsonb_array_elements(lawyers) v) ORDER BY id FOR SHARE;
  FOR l IN SELECT value FROM jsonb_array_elements(lawyers) LOOP
    IF jsonb_typeof(l)<>'object' OR NOT l ?& ARRAY['id','person_id','role','position'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(l) k WHERE k NOT IN ('id','person_id','role','position')) OR l->>'role' NOT IN ('lead','co_lead','support') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lawyer fields'; END IF;
    SELECT to_jsonb(x) INTO old_child FROM matter_lawyers x WHERE matter_id=identity AND person_id=(l->>'person_id')::integer;
    IF l->>'id' IS NOT NULL AND (old_child IS NULL OR (old_child->>'id')::integer<>(l->>'id')::integer) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Foreign lawyer identity'; END IF;
    IF old_child IS NULL OR (old_child->>'is_retired')::boolean THEN
      PERFORM 1 FROM people WHERE id=(l->>'person_id')::integer AND is_staff AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Active internal lawyer required'; END IF;
    END IF;
    resolved_lawyers:=resolved_lawyers||jsonb_build_array(CASE WHEN old_child IS NULL THEN l ELSE l||jsonb_build_object('id',old_child->'id') END);
  END LOOP;
  FOR p IN SELECT value FROM jsonb_array_elements(parties) LOOP
    IF jsonb_typeof(p)<>'object' OR NOT p ?& ARRAY['id','side','party_name','gender','ordinal','roles'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('id','side','party_name','gender','ordinal','roles','semantic_party_name','representative_name','contextual_text','explanatory_text')) OR p->>'side' NOT IN ('client','opponent') OR (p->>'gender' IS NOT NULL AND p->>'gender' NOT IN ('m','f')) OR jsonb_typeof(p->'roles')<>'array' OR jsonb_array_length(p->'roles')>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid party fields'; END IF;
    target_party:=(p->>'id')::integer;
    old_child:=NULL;
    IF target_party IS NOT NULL THEN SELECT to_jsonb(x) INTO old_child FROM matter_parties x WHERE id=target_party AND matter_id=identity;
      IF old_child IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Foreign party identity'; END IF;
    END IF;
    IF (old_child IS NULL OR p->'party_name' IS DISTINCT FROM old_child->'party_name') AND coalesce(btrim(p->>'party_name'),'')='' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Party name required'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'roles') v GROUP BY v->>'role_id',v->>'display_label',v->>'qualifier' HAVING count(*)>1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate capacity'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'roles') item WHERE item->>'id' IS NOT NULL GROUP BY item->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate capacity identity'; END IF;
    resolved_roles:='[]';
    FOR r IN SELECT value FROM jsonb_array_elements(p->'roles') LOOP
      IF jsonb_typeof(r)<>'object' OR NOT r ?& ARRAY['id','role_id','ordinal'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN ('id','role_id','ordinal','display_label','qualifier')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid capacity fields'; END IF;
      SELECT to_jsonb(x) INTO old_child FROM matter_party_roles x WHERE x.party_id=target_party AND x.role_id=(r->>'role_id')::integer AND CASE WHEN r->>'id' IS NOT NULL THEN x.id=(r->>'id')::integer ELSE x.display_label IS NOT DISTINCT FROM r->>'display_label' AND x.qualifier IS NOT DISTINCT FROM r->>'qualifier' END;
      IF r->>'id' IS NOT NULL AND (old_child IS NULL OR (r->>'id')::integer<>(old_child->>'id')::integer) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Foreign capacity identity'; END IF;
      IF old_child IS NULL OR (old_child->>'is_retired')::boolean THEN
        PERFORM 1 FROM lookup_party_role WHERE id=(r->>'role_id')::integer AND is_active FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Active capacity required'; END IF;
      END IF;
      resolved_roles:=resolved_roles||jsonb_build_array(CASE WHEN old_child IS NULL THEN r ELSE r||jsonb_build_object('id',old_child->'id') END);
    END LOOP;
    SELECT coalesce(jsonb_agg(v ORDER BY (v->>'ordinal')::integer NULLS LAST,(v->>'id')::integer),'[]') INTO resolved_roles FROM jsonb_array_elements(resolved_roles) v;
    resolved_parties:=resolved_parties||jsonb_build_array(p||jsonb_build_object('roles',resolved_roles));
  END LOOP;
  SELECT coalesce(jsonb_agg(v ORDER BY v->>'side',(v->>'ordinal')::integer NULLS LAST,(v->>'id')::integer),'[]') INTO parties FROM jsonb_array_elements(resolved_parties) v;
  SELECT coalesce(jsonb_agg(v ORDER BY (v->>'position')::integer NULLS LAST,(v->>'id')::integer),'[]') INTO lawyers FROM jsonb_array_elements(resolved_lawyers) v;
  changed:=identity IS NULL OR patch<>'{}' OR parties IS DISTINCT FROM snapshot->'parties' OR lawyers IS DISTINCT FROM snapshot->'lawyers';
  IF NOT changed THEN RETURN jsonb_build_object('id',identity,'version',expected::text,'changed',false); END IF;
  IF identity IS NULL THEN
    SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('v.%I',key),',' ORDER BY key) INTO columns,selections FROM jsonb_object_keys(patch) key;
    EXECUTE format('INSERT INTO public.matters(%s,updated_at) SELECT %s,statement_timestamp() FROM jsonb_populate_record(NULL::public.matters,$1) v RETURNING id',columns,selections) INTO identity USING patch;
    version:=1;
  ELSE
    SELECT string_agg(format('%I=v.%I',key,key),',' ORDER BY key) INTO assignments FROM jsonb_object_keys(patch) key;
    EXECUTE format('UPDATE public.matters m SET row_version=m.row_version+1%s FROM jsonb_populate_record(NULL::public.matters,$1) v WHERE m.id=$2 RETURNING m.row_version',CASE WHEN assignments IS NULL THEN '' ELSE ','||assignments END) INTO version USING original||patch,identity;
  END IF;
  UPDATE matter_lawyers SET is_retired=true WHERE matter_id=identity AND NOT is_retired AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lawyers) v WHERE (v->>'person_id')::integer=person_id);
  -- Release lead designation before assigning another lead in the same save.
  UPDATE matter_lawyers SET role=v->>'role' FROM jsonb_array_elements(lawyers) v WHERE matter_id=identity AND person_id=(v->>'person_id')::integer AND role='lead' AND v->>'role'<>'lead';
  FOR l IN SELECT value FROM jsonb_array_elements(lawyers) LOOP
    SELECT to_jsonb(x) INTO old_child FROM matter_lawyers x WHERE matter_id=identity AND person_id=(l->>'person_id')::integer;
    IF old_child IS NULL THEN INSERT INTO matter_lawyers(matter_id,person_id,role,position,updated_at) VALUES(identity,(l->>'person_id')::integer,l->>'role',(l->>'position')::integer,statement_timestamp());
    ELSE UPDATE matter_lawyers SET role=l->>'role',position=(l->>'position')::integer,is_retired=false WHERE id=(old_child->>'id')::integer AND ROW(role,position,is_retired) IS DISTINCT FROM ROW(l->>'role',(l->>'position')::integer,false); END IF;
  END LOOP;
  UPDATE matter_party_roles r SET is_retired=true,ordinal=NULL FROM matter_parties p WHERE p.id=r.party_id AND p.matter_id=identity AND NOT r.is_retired AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parties) v WHERE (v->>'id')::integer=p.id);
  UPDATE matter_parties SET is_retired=true WHERE matter_id=identity AND NOT is_retired AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parties) v WHERE (v->>'id')::integer=id);
  FOR p IN SELECT value FROM jsonb_array_elements(parties) LOOP
    target_party:=(p->>'id')::integer;
    old_child:=NULL;
    IF target_party IS NOT NULL THEN SELECT to_jsonb(x) INTO old_child FROM matter_parties x WHERE id=target_party AND matter_id=identity;
      IF old_child IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Foreign party identity'; END IF;
    END IF;
    IF old_child IS NULL THEN INSERT INTO matter_parties(matter_id,side,party_name,gender,ordinal,semantic_party_name,representative_name,contextual_text,explanatory_text,updated_at) VALUES(identity,p->>'side',p->>'party_name',p->>'gender',(p->>'ordinal')::integer,p->>'semantic_party_name',p->>'representative_name',p->>'contextual_text',p->>'explanatory_text',statement_timestamp()) RETURNING id INTO target_party;
    ELSE UPDATE matter_parties SET side=p->>'side',party_name=p->>'party_name',gender=p->>'gender',ordinal=(p->>'ordinal')::integer,semantic_party_name=p->>'semantic_party_name',representative_name=p->>'representative_name',contextual_text=p->>'contextual_text',explanatory_text=p->>'explanatory_text',is_retired=false WHERE id=target_party AND ROW(side,party_name,gender,ordinal,semantic_party_name,representative_name,contextual_text,explanatory_text,is_retired) IS DISTINCT FROM ROW(p->>'side',p->>'party_name',p->>'gender',(p->>'ordinal')::integer,p->>'semantic_party_name',p->>'representative_name',p->>'contextual_text',p->>'explanatory_text',false); END IF;
    UPDATE matter_party_roles SET is_retired=true,ordinal=NULL WHERE matter_party_roles.party_id=target_party AND NOT is_retired AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'roles') v WHERE (v->>'id')::integer=matter_party_roles.id OR (v->>'id' IS NULL AND (v->>'role_id')::integer=role_id AND display_label IS NOT DISTINCT FROM v->>'display_label' AND qualifier IS NOT DISTINCT FROM v->>'qualifier'));
    FOR r IN SELECT value FROM jsonb_array_elements(p->'roles') LOOP
      SELECT to_jsonb(x) INTO old_child FROM matter_party_roles x WHERE x.party_id=target_party AND x.role_id=(r->>'role_id')::integer AND CASE WHEN r->>'id' IS NOT NULL THEN x.id=(r->>'id')::integer ELSE x.display_label IS NOT DISTINCT FROM r->>'display_label' AND x.qualifier IS NOT DISTINCT FROM r->>'qualifier' END;
      IF old_child IS NULL THEN INSERT INTO matter_party_roles(party_id,role_id,ordinal,display_label,qualifier,updated_at) VALUES(target_party,(r->>'role_id')::integer,(r->>'ordinal')::integer,r->>'display_label',r->>'qualifier',statement_timestamp());
      ELSE UPDATE matter_party_roles SET ordinal=(r->>'ordinal')::integer,display_label=r->>'display_label',qualifier=r->>'qualifier',is_retired=false WHERE id=(old_child->>'id')::integer AND ROW(ordinal,display_label,qualifier,is_retired) IS DISTINCT FROM ROW((r->>'ordinal')::integer,r->>'display_label',r->>'qualifier',false); END IF;
    END LOOP;
  END LOOP;
  after_state:=_migration.matter_edit_aggregate(identity);
  INSERT INTO _migration.matter_edit_change VALUES(identity,version,actor,before_state,after_state,current_setting('litigation.audit_request_id')::uuid);
  INSERT INTO _migration.matter_edit_submission(actor_id,submission_id,request_payload,matter_id,result_version,changed) VALUES(actor,submission,p_request,identity,version,true);
  RETURN jsonb_build_object('id',identity,'version',version::text,'changed',true);
END;
$$;
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,capture_mode,max_text_characters,classification_reason) VALUES('public','matter_parties','semantic_party_name','value',2048,'task69_party_semantics');
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,capture_mode,max_text_characters,classification_reason) VALUES('public','matter_parties','representative_name','value',2048,'task69_party_semantics');
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,capture_mode,max_text_characters,classification_reason) VALUES('public','matter_parties','contextual_text','value',2048,'task69_party_semantics');
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,capture_mode,max_text_characters,classification_reason) VALUES('public','matter_parties','explanatory_text','value',2048,'task69_party_semantics');
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,capture_mode,max_text_characters,classification_reason) VALUES('public','matter_party_roles','display_label','value',2048,'task69_party_semantics');
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,capture_mode,max_text_characters,classification_reason) VALUES('public','matter_party_roles','qualifier','value',2048,'task69_party_semantics');
COMMIT;
