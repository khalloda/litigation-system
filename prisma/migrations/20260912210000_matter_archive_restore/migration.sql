-- Task 4.2 Phase 3 / D58. Forward-only; real deployment requires separate approval.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.matters,public.matter_parties,public.matter_party_roles,public.matter_lawyers IN ACCESS EXCLUSIVE MODE;
DO $precondition$
BEGIN
  IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
    OR (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>64
    OR NOT EXISTS(SELECT 1 FROM _prisma_migrations WHERE migration_name='20260912120000_matter_editing_boundary' AND checksum='afd0ebc8c9c98e4de2eaa594668eb8dd7e7c216d8b1fdb093a44ebb50ff99034' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR EXISTS(SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20260912210000_matter_archive_restore') THEN
    RAISE EXCEPTION 'Exact complete migration-64 direct owner prestate required';
  END IF;
  IF EXISTS(SELECT 1 FROM public.matters WHERE NOT _migration.matter_edit_current_valid(id)) THEN RAISE EXCEPTION 'Invalid pre-existing matter history'; END IF;
END
$precondition$;
ALTER TABLE public.matters ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
CREATE INDEX matters_archive_case_id_idx ON public.matters(is_archived,case_number_ar COLLATE "arabic",id);
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason)
VALUES ('public','matters','is_archived',64,'value','matter_archive_lifecycle');

-- PostgreSQL nextval is not transactional. A private row allocator keeps refused
-- lifecycle writes (including later audit failures) from consuming audit IDs.
-- All audited writers share this allocator, so committed IDs remain unique and
-- increasing. The old sequence and every existing event remain untouched.
LOCK TABLE public.audit_events IN ACCESS EXCLUSIVE MODE;
CREATE TABLE _migration.matter_lifecycle_audit_counter (
  singleton boolean NOT NULL DEFAULT true,
  initial_value bigint NOT NULL,
  last_value bigint NOT NULL,
  CONSTRAINT matter_lifecycle_audit_counter_pkey PRIMARY KEY(singleton),
  CONSTRAINT matter_lifecycle_audit_counter_singleton CHECK(singleton),
  CONSTRAINT matter_lifecycle_audit_counter_range CHECK(initial_value>=0 AND last_value>=initial_value)
);
DO $audit_precondition$
BEGIN
 IF (SELECT last_value FROM public.audit_events_id_seq)<coalesce((SELECT max(id) FROM public.audit_events),0)
 THEN RAISE EXCEPTION 'Audit sequence must cover existing IDs before lifecycle allocator'; END IF;
END
$audit_precondition$;
INSERT INTO _migration.matter_lifecycle_audit_counter(singleton,initial_value,last_value)
SELECT true,last_value,last_value FROM public.audit_events_id_seq;
CREATE FUNCTION _migration.matter_lifecycle_audit_id() RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity bigint;
BEGIN
 UPDATE _migration.matter_lifecycle_audit_counter SET last_value=last_value+1 WHERE singleton RETURNING last_value INTO identity;
 IF identity IS NULL THEN RAISE EXCEPTION 'Audit identifier allocator is missing'; END IF;
 RETURN identity;
END;
$$;
REVOKE ALL ON TABLE _migration.matter_lifecycle_audit_counter FROM PUBLIC,litigation_runtime;
REVOKE ALL ON FUNCTION _migration.matter_lifecycle_audit_id() FROM PUBLIC,litigation_runtime;
CREATE OR REPLACE FUNCTION public.audit_write_event(
    p_action text,
    p_outcome text,
    p_entity_schema text,
    p_entity_table text,
    p_entity_key jsonb,
    p_changed_fields text[],
    p_before_values jsonb,
    p_after_values jsonb,
    p_target_actor_id integer,
    p_attempted_username text,
    p_resource_identifier text,
    p_parameters jsonb,
    p_reason_code text,
    p_event_metadata jsonb
)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $WRITE_EVENT$
DECLARE
    current_actor_id integer := public.audit_current_actor_id();
    context_value jsonb := public.audit_ensure_event_context();
    actor_row record;
    target_actor_key text;
    target_username text;
    target_display_name text;
    target_role text;
    safe_attempt text;
    safe_attempt_truncated boolean := false;
    new_event_id bigint;
BEGIN
    SELECT a.actor_key,a.actor_kind,u.username,p.name_ar,u.role_code,a.identity_label
      INTO STRICT actor_row
      FROM public.audit_actors a
      LEFT JOIN public.user_accounts u ON u.id=a.user_account_id
      LEFT JOIN public.people p ON p.id=u.person_id
     WHERE a.id=current_actor_id;
    IF p_target_actor_id IS NOT NULL THEN
        SELECT a.actor_key,u.username,coalesce(p.name_ar,a.identity_label),u.role_code
          INTO STRICT target_actor_key,target_username,target_display_name,target_role
          FROM public.audit_actors a
          LEFT JOIN public.user_accounts u ON u.id=a.user_account_id
          LEFT JOIN public.people p ON p.id=u.person_id
         WHERE a.id=p_target_actor_id;
    END IF;
    IF p_attempted_username IS NOT NULL AND p_attempted_username<>'' THEN
        safe_attempt_truncated := char_length(p_attempted_username)>64;
        safe_attempt := CASE
            WHEN public.audit_contains_secret_pattern(p_attempted_username) THEN '[redacted]'
            ELSE left(p_attempted_username,64)
        END;
        IF safe_attempt='[redacted]' THEN safe_attempt_truncated := true; END IF;
    END IF;
    INSERT INTO public.audit_events(
        id,actor_id,actor_key_snapshot,actor_username_snapshot,
        actor_display_name_snapshot,actor_role_snapshot,
        target_actor_id,target_actor_key_snapshot,target_username_snapshot,
        target_display_name_snapshot,target_role_snapshot,
        action,outcome,entity_schema,entity_table,entity_key,changed_fields,
        before_values,after_values,request_id,correlation_id,audit_session_id,
        ip_address,user_agent,user_agent_truncated,device_class,
        attempted_username,attempted_username_truncated,resource_identifier,
        reason_code,parameters,event_metadata
    ) OVERRIDING SYSTEM VALUE VALUES (
        _migration.matter_lifecycle_audit_id(),current_actor_id,actor_row.actor_key,actor_row.username,
        coalesce(actor_row.name_ar,actor_row.identity_label),actor_row.role_code,
        p_target_actor_id,target_actor_key,target_username,target_display_name,target_role,
        p_action,p_outcome,p_entity_schema,p_entity_table,p_entity_key,
        coalesce(p_changed_fields,ARRAY[]::text[]),
        coalesce(p_before_values,'{}'::jsonb),coalesce(p_after_values,'{}'::jsonb),
        (context_value->>'request_id')::uuid,
        (context_value->>'correlation_id')::uuid,
        (context_value->>'audit_session_id')::uuid,
        nullif(context_value->>'ip_address','')::inet,
        nullif(context_value->>'user_agent',''),
        (context_value->>'user_agent_truncated')::boolean,
        context_value->>'device_class',safe_attempt,safe_attempt_truncated,
        nullif(left(coalesce(p_resource_identifier,''),256),''),
        p_reason_code,coalesce(p_parameters,'{}'::jsonb),coalesce(p_event_metadata,'{}'::jsonb)
    ) RETURNING id INTO new_event_id;
    RETURN new_event_id;
END;
$WRITE_EVENT$;

-- Read adaptation only: accepted import and change evidence is never rewritten.
CREATE FUNCTION _migration.matter_lifecycle_normalize(v jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT CASE WHEN v IS NULL OR v->'matter' ? 'is_archived' THEN v ELSE jsonb_set(v,'{matter,is_archived}','false') END
$$;
CREATE OR REPLACE FUNCTION _migration.matter_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; expected_version bigint;
BEGIN
  expected:=_migration.matter_lifecycle_normalize(_migration.matter_edit_initial_aggregate(p_id));
  expected_version:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
  FOR c IN SELECT * FROM _migration.matter_edit_change WHERE matter_id=p_id ORDER BY version LOOP
    IF c.version<>expected_version OR _migration.matter_lifecycle_normalize(c.before_values) IS DISTINCT FROM expected
      OR (c.after_values->'matter'->>'row_version')::bigint<>c.version
      OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='matters' AND e.entity_schema='public'
        AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id
        AND e.after_values->>'row_version'=c.version::text AND e.action IN ('record_created','record_updated')) THEN RETURN false; END IF;
    IF coalesce((expected->'matter'->>'is_archived')::boolean,false) IS DISTINCT FROM coalesce((c.after_values->'matter'->>'is_archived')::boolean,false) THEN
      IF NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='matters' AND e.entity_schema='public' AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.action=CASE WHEN (c.after_values->'matter'->>'is_archived')::boolean THEN 'archive' ELSE 'restore' END AND e.outcome='succeeded') THEN RETURN false; END IF;
    END IF;
    expected:=_migration.matter_lifecycle_normalize(c.after_values); expected_version:=expected_version+1;
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
    WHEN 'matter_parties' THEN ARRAY['side','party_name','gender','ordinal','is_retired']
    WHEN 'matter_party_roles' THEN ARRAY['ordinal','is_retired']
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
    'parties',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'side',p.side,'party_name',p.party_name,'gender',p.gender,'ordinal',p.ordinal,'roles',
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'role_id',r.role_id,'ordinal',r.ordinal) ORDER BY r.ordinal NULLS LAST,r.id),'[]') FROM matter_party_roles r WHERE r.party_id=p.id AND NOT r.is_retired)) ORDER BY p.side,p.ordinal NULLS LAST,p.id),'[]') FROM matter_parties p WHERE p.matter_id=p_id AND NOT p.is_retired),
    'lawyers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'person_id',person_id,'role',role,'position',position) ORDER BY position NULLS LAST,id),'[]') FROM matter_lawyers WHERE matter_id=p_id AND NOT is_retired));
  IF length(result::text)>1000000 THEN RAISE EXCEPTION 'Matter form exceeds supported bounded size'; END IF;
  RETURN result;
END;
$$;
CREATE FUNCTION _migration.matter_lifecycle_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE parent_id integer; archived boolean; before_row jsonb; after_row jsonb;
BEGIN
  IF TG_TABLE_NAME='matters' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.is_archived THEN RAISE EXCEPTION 'New matters must begin unarchived'; END IF;
      RETURN NEW;
    END IF;
    IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
      PERFORM _migration.client_contact_require_actor(true);
      before_row:=to_jsonb(OLD)-ARRAY['is_archived','row_version','updated_at','updated_by'];
      after_row:=to_jsonb(NEW)-ARRAY['is_archived','row_version','updated_at','updated_by'];
      IF before_row IS DISTINCT FROM after_row THEN RAISE EXCEPTION 'Matter lifecycle cannot change business fields'; END IF;
    ELSIF OLD.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before editing'; END IF;
  ELSE
    parent_id:=CASE WHEN TG_TABLE_NAME='matter_party_roles' THEN (SELECT matter_id FROM public.matter_parties WHERE id=(to_jsonb(NEW)->>'party_id')::integer) ELSE (to_jsonb(NEW)->>'matter_id')::integer END;
    SELECT is_archived INTO archived FROM public.matters WHERE id=parent_id FOR UPDATE;
    IF archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived matter before editing'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zy_matter_lifecycle_guard BEFORE INSERT OR UPDATE ON public.matters FOR EACH ROW EXECUTE FUNCTION _migration.matter_lifecycle_guard();
CREATE TRIGGER zy_matter_lifecycle_guard BEFORE INSERT OR UPDATE ON public.matter_parties FOR EACH ROW EXECUTE FUNCTION _migration.matter_lifecycle_guard();
CREATE TRIGGER zy_matter_lifecycle_guard BEFORE INSERT OR UPDATE ON public.matter_party_roles FOR EACH ROW EXECUTE FUNCTION _migration.matter_lifecycle_guard();
CREATE TRIGGER zy_matter_lifecycle_guard BEFORE INSERT OR UPDATE ON public.matter_lawyers FOR EACH ROW EXECUTE FUNCTION _migration.matter_lifecycle_guard();

CREATE FUNCTION _migration.matter_lifecycle_counts(p_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object(
 'hearings',(SELECT count(*) FROM public.hearings WHERE matter_id=p_id),
 'tasks',(SELECT count(*) FROM public.admin_tasks WHERE matter_id=p_id),
 'steps',(SELECT count(*) FROM public.task_actions a JOIN public.admin_tasks t ON t.id=a.task_id WHERE t.matter_id=p_id),
 'documents',(SELECT count(*) FROM public.documents WHERE matter_id=p_id),
 'feeLetters',(SELECT count(DISTINCT fee_letter_id) FROM (SELECT fee_letter_id FROM public.fee_letter_matters WHERE matter_id=p_id UNION SELECT fee_letter_id FROM public.matter_fee_letter_references WHERE matter_id=p_id) f),
 'parties',(SELECT count(*) FROM public.matter_parties WHERE matter_id=p_id AND NOT is_retired),
 'capacities',(SELECT count(*) FROM public.matter_party_roles r JOIN public.matter_parties p ON p.id=r.party_id WHERE p.matter_id=p_id AND NOT p.is_retired AND NOT r.is_retired),
 'lawyers',(SELECT count(*) FROM public.matter_lawyers WHERE matter_id=p_id AND NOT is_retired))
$$;
CREATE FUNCTION public.matter_lifecycle_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_id integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
  IF p_role IS DISTINCT FROM 'Administrator' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrator matter lifecycle required'; END IF;
  PERFORM _migration.matter_edit_require_account(p_account,p_session,p_role,p_expires,false);
  SELECT jsonb_build_object('id',id,'version',row_version::text,'archived',is_archived,'caseNumber',case_number_ar,'subject',subject,'counts',_migration.matter_lifecycle_counts(id)) INTO result FROM public.matters WHERE id=p_id;
  IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Matter not found'; END IF;
  RETURN result;
END;
$$;
CREATE FUNCTION public.matter_lifecycle_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; identity integer; expected bigint; submission uuid; action text; original public.matters%ROWTYPE;
 receipt _migration.matter_edit_submission%ROWTYPE; before_state jsonb; after_state jsonb; version bigint;
BEGIN
  IF p_role IS DISTINCT FROM 'Administrator' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrator matter lifecycle required'; END IF;
  actor:=_migration.matter_edit_require_account(p_account,p_session,p_role,p_expires,true);
  IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Matter actor does not match trusted audit context'; END IF;
  PERFORM public.audit_ensure_event_context();
  IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR length(p_request::text)>10000
    OR NOT p_request ?& ARRAY['id','version','submission','action','counts','confirmation']
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN ('id','version','submission','action','counts','confirmation'))
    OR NOT _migration.matter_edit_positive(p_request->'id',false)
    OR jsonb_typeof(p_request->'version')<>'string' OR (p_request->>'version') !~ '^[1-9][0-9]{0,18}$'
    OR jsonb_typeof(p_request->'submission')<>'string' OR (p_request->>'submission') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    OR p_request->'confirmation' IS DISTINCT FROM p_request->'id'
    OR jsonb_typeof(p_request->'action')<>'string' OR p_request->>'action' NOT IN ('archive','restore')
    OR jsonb_typeof(p_request->'counts')<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid matter lifecycle request'; END IF;
  identity:=(p_request->>'id')::integer; expected:=(p_request->>'version')::bigint; submission:=(p_request->>'submission')::uuid; action:=p_request->>'action';
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||submission::text,42));
  SELECT * INTO receipt FROM _migration.matter_edit_submission WHERE actor_id=actor AND submission_id=submission;
  IF FOUND THEN
    IF receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Matter submission payload differs'; END IF;
    RETURN jsonb_build_object('id',receipt.matter_id,'version',receipt.result_version::text,'changed',receipt.changed);
  END IF;
  SELECT * INTO original FROM public.matters WHERE id=identity FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Matter not found'; END IF;
  IF original.row_version<>expected OR p_request->'counts' IS DISTINCT FROM _migration.matter_lifecycle_counts(identity) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Matter version is stale'; END IF;
  -- Recheck expiry after any wait on the aggregate lock, before writing.
  PERFORM _migration.matter_edit_require_account(p_account,p_session,p_role,p_expires,true);
  IF original.is_archived=(action='archive') THEN RETURN jsonb_build_object('id',identity,'version',expected::text,'changed',false); END IF;
  before_state:=_migration.matter_edit_aggregate(identity);
  UPDATE public.matters SET is_archived=(action='archive'),row_version=row_version+1 WHERE id=identity RETURNING row_version INTO version;
  PERFORM public.audit_append_semantic_event(action,'succeeded','public','matters',jsonb_build_object('id',identity),NULL,NULL,NULL,'{}',NULL,'{}');
  after_state:=_migration.matter_edit_aggregate(identity);
  INSERT INTO _migration.matter_edit_change VALUES(identity,version,actor,before_state,after_state,current_setting('litigation.audit_request_id')::uuid);
  INSERT INTO _migration.matter_edit_submission(actor_id,submission_id,request_payload,matter_id,result_version,changed) VALUES(actor,submission,p_request,identity,version,true);
  RETURN jsonb_build_object('id',identity,'version',version::text,'changed',true);
END;
$$;
REVOKE ALL ON FUNCTION _migration.matter_lifecycle_normalize(jsonb),_migration.matter_lifecycle_guard(),_migration.matter_lifecycle_counts(integer),public.matter_lifecycle_state(integer,integer,text,timestamptz,integer),public.matter_lifecycle_save(integer,integer,text,timestamptz,jsonb) FROM PUBLIC,litigation_runtime;
GRANT EXECUTE ON FUNCTION public.matter_lifecycle_state(integer,integer,text,timestamptz,integer),public.matter_lifecycle_save(integer,integer,text,timestamptz,jsonb) TO litigation_runtime;
DO $postcondition$
BEGIN
  IF EXISTS(SELECT 1 FROM public.matters WHERE is_archived OR NOT _migration.matter_edit_current_valid(id)) THEN RAISE EXCEPTION 'Matter lifecycle initialization differs'; END IF;
END
$postcondition$;
COMMIT;
