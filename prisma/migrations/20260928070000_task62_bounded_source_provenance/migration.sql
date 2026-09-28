-- Candidate75: private bounded provenance only; approved business data is external.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $precondition$
BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>74
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20260928070000_task62_bounded_source_provenance') THEN
  RAISE EXCEPTION 'Exact complete74 direct administration prestate required';
 END IF;
END $precondition$;
CREATE TABLE _migration.task62_source_receipt (
 kind text NOT NULL CHECK(kind IN('party_release','hearing_source')),
 source_identity text NOT NULL,
 source_lineage text NOT NULL CHECK(source_lineage='litigation-department-access'),
 source_sha256 text NOT NULL CHECK(source_sha256='5b0ee4419e81b8f8f1c66834d0a24e2c023912acb1efd2617b58a435332b7dfd'),
 approved_plan_text text NOT NULL CHECK(encode(sha256(convert_to(approved_plan_text,'UTF8')),'hex')='c0b0590c693b139b57bb78a4a8d24640af2ee6ab73e4e0ee1f9aa89d12b1be6e'),
 operation_id uuid NOT NULL CHECK(operation_id::text ~ '^62620075-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 audit_session_id uuid NOT NULL,
 matter_id integer NOT NULL REFERENCES public.matters(id),
 target_id integer NOT NULL CHECK(target_id>0),
 audit_event_id bigint NOT NULL UNIQUE REFERENCES public.audit_events(id),
 role_audit_event_id bigint UNIQUE REFERENCES public.audit_events(id),
 source_values jsonb NOT NULL CHECK(jsonb_typeof(source_values)='object'),
 before_values jsonb NOT NULL CHECK(before_values='{}'::jsonb),
 after_values jsonb NOT NULL CHECK(jsonb_typeof(after_values)='object'),
 operation_manifest jsonb NOT NULL CHECK(jsonb_typeof(operation_manifest)='object'),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 PRIMARY KEY(kind,source_identity),
 UNIQUE(kind,target_id),
 CHECK((kind='party_release' AND role_audit_event_id IS NOT NULL AND source_identity ~ '^quarantine:[1-9][0-9]*$') OR
       (kind='hearing_source' AND role_audit_event_id IS NULL AND source_identity ~ '^hearing:[1-9][0-9]*$'))
);
REVOKE ALL ON _migration.task62_source_receipt FROM PUBLIC,litigation_runtime;
CREATE FUNCTION _migration.task62_source_operation_valid(p_operation uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE first_row _migration.task62_source_receipt%ROWTYPE; r _migration.task62_source_receipt%ROWTYPE;
 plan jsonb; manifest jsonb; item jsonb; chosen jsonb; mapping jsonb; event public.audit_events%ROWTYPE;
 role_event public.audit_events%ROWTYPE; expected jsonb; request jsonb; state jsonb; entry jsonb;
 identity integer; role_identity integer; observed integer; change_row record; baseline bigint;
BEGIN
 SELECT * INTO first_row FROM _migration.task62_source_receipt WHERE operation_id=p_operation ORDER BY kind,source_identity LIMIT 1;
 IF (NOT FOUND OR (SELECT count(*) FROM _migration.task62_source_receipt WHERE operation_id=p_operation)<>31) IS DISTINCT FROM false THEN RETURN false; END IF;
 plan:=first_row.approved_plan_text::jsonb;manifest:=first_row.operation_manifest;
 IF ((SELECT count(*) FROM _migration.task62_source_receipt WHERE operation_id=p_operation AND kind='party_release')<>29
 OR manifest->>'operationId' IS DISTINCT FROM p_operation::text
 OR manifest->>'planSha256' IS DISTINCT FROM encode(sha256(convert_to(first_row.approved_plan_text,'UTF8')),'hex')
 OR coalesce(jsonb_array_length(manifest->'capacities'),0)<>8 OR coalesce(jsonb_array_length(manifest->'matters'),0)<>24
 OR coalesce(jsonb_array_length(manifest->'hearings'),0)<>2 OR coalesce(jsonb_array_length(manifest->'selections'),0)<>13
 OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.audit_session_id=first_row.audit_session_id
  AND e.actor_id=first_row.actor_id AND e.action='login_succeeded' AND e.outcome='succeeded')) IS DISTINCT FROM false THEN RETURN false; END IF;
 FOR r IN SELECT * FROM _migration.task62_source_receipt WHERE operation_id=p_operation LOOP
  IF (r.actor_id<>first_row.actor_id OR r.audit_session_id<>first_row.audit_session_id
   OR r.approved_plan_text<>first_row.approved_plan_text OR r.operation_manifest<>manifest) IS DISTINCT FROM false THEN RETURN false; END IF;
  SELECT * INTO event FROM public.audit_events WHERE id=r.audit_event_id;
  IF (event.entity_schema<>'public' OR event.entity_key<>jsonb_build_object('id',r.target_id)
   OR event.request_id IS DISTINCT FROM p_operation OR event.correlation_id IS DISTINCT FROM p_operation
   OR event.audit_session_id IS DISTINCT FROM r.audit_session_id OR event.actor_id IS DISTINCT FROM r.actor_id
   OR event.actor_role_snapshot NOT IN('Administrator','Litigation Assistant') OR event.outcome<>'succeeded'
   OR event.before_values IS DISTINCT FROM r.before_values OR event.after_values IS DISTINCT FROM r.after_values) IS DISTINCT FROM false THEN RETURN false; END IF;
  IF r.kind='party_release' THEN
   SELECT x INTO item FROM jsonb_array_elements(plan->'payloads'->'partyReleases') x WHERE 'quarantine:'||(x->'sourceRow'->>'quarantineId')=r.source_identity;
   IF (item IS NULL OR item->'sourceRow' IS DISTINCT FROM r.source_values OR r.matter_id<>(item->'sourceRow'->>'matterId')::integer
    OR event.entity_table<>'matter_parties' OR event.action<>'relationship_added') IS DISTINCT FROM false THEN RETURN false; END IF;
   expected:=jsonb_build_object('matter_id',r.matter_id,'party_name',item->'approvedParty'->'party_name',
    'gender',NULL,'side',item->'approvedParty'->'side','ordinal',item->'approvedParty'->'ordinal','is_retired',false);
   IF (event.after_values IS DISTINCT FROM expected) IS DISTINCT FROM false THEN RETURN false; END IF;
   SELECT x INTO mapping FROM jsonb_array_elements(plan->'payloads'->'capacityMappings') x
    WHERE x->>'sourceSpelling'=item->'approvedParty'->'roles'->0->>'proposedCapacitySpelling';
   role_identity:=(mapping->>'existingRoleId')::integer;
   IF role_identity IS NULL THEN
    SELECT (x->>'id')::integer INTO role_identity FROM jsonb_array_elements(manifest->'capacities') x WHERE x->>'sourceSpelling'=mapping->>'sourceSpelling';
   END IF;
   SELECT * INTO role_event FROM public.audit_events WHERE id=r.role_audit_event_id;
   IF (role_identity IS NULL OR role_event.entity_schema<>'public' OR role_event.entity_table<>'matter_party_roles'
    OR role_event.action<>'relationship_added' OR role_event.outcome<>'succeeded' OR role_event.actor_id<>r.actor_id
    OR role_event.request_id<>p_operation OR role_event.audit_session_id<>r.audit_session_id
    OR role_event.correlation_id IS DISTINCT FROM p_operation OR role_event.actor_role_snapshot IS DISTINCT FROM event.actor_role_snapshot
    OR role_event.before_values<>'{}' OR role_event.after_values IS DISTINCT FROM
      jsonb_build_object('party_id',r.target_id,'role_id',role_identity,'ordinal',1,'is_retired',false)) IS DISTINCT FROM false THEN RETURN false; END IF;
   SELECT x INTO entry FROM jsonb_array_elements(manifest->'matters') x WHERE (x->'request'->>'id')::integer=r.matter_id;
   IF (entry IS NULL OR NOT EXISTS(SELECT 1 FROM _migration.matter_edit_change c,
      LATERAL jsonb_array_elements(c.after_values->'parties') p
      WHERE c.matter_id=r.matter_id AND c.actor_id=r.actor_id AND c.request_id=p_operation
       AND c.version=(entry->'result'->>'version')::bigint AND (p->>'id')::integer=r.target_id
       AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'parties') old WHERE old->>'side'=item->'approvedParty'->>'side'))) IS DISTINCT FROM false THEN RETURN false; END IF;
  ELSE
   SELECT x INTO item FROM jsonb_array_elements(plan->'payloads'->'hearingAdditions') x WHERE 'hearing:'||(x->'sourceRow'->>'sourceHearingId')=r.source_identity;
   IF (item IS NULL OR item->'sourceRow' IS DISTINCT FROM r.source_values OR r.matter_id<>(item->'sourceRow'->>'currentMatterId')::integer
    OR event.entity_table<>'hearings' OR event.action<>'record_created') IS DISTINCT FROM false THEN RETURN false; END IF;
   SELECT x INTO entry FROM jsonb_array_elements(manifest->'hearings') x WHERE (x->>'sourceHearingId')::integer=(item->'sourceRow'->>'sourceHearingId')::integer;
   IF (entry IS NULL OR (entry->'result'->>'id')::integer<>r.target_id OR entry->'request'->'values' IS DISTINCT FROM
    (item->'sourceRow'->'currentFields')||jsonb_build_object('court_id',entry->'courtId','action_id',entry->'actionId')
    OR NOT (event.after_values @> (entry->'request'->'values')) OR entry->'request'->'attendees'<>'[]'
    OR NOT EXISTS(SELECT 1 FROM _migration.hearing_edit_change c WHERE c.hearing_id=r.target_id AND c.version=1
      AND c.request_id=p_operation AND c.actor_id=r.actor_id AND c.before_values IS NULL
      AND c.after_values->'hearing'->'legacy_id'='null'::jsonb
      AND c.after_values->'hearing'->'legacy_source_record_key'='null'::jsonb)) IS DISTINCT FROM false THEN RETURN false; END IF;
  END IF;
 END LOOP;
 -- The approved row cardinalities plus unique source identities prohibit omissions/substitutions.
 FOR item IN SELECT x FROM jsonb_array_elements(manifest->'capacities') x LOOP
  SELECT x INTO mapping FROM jsonb_array_elements(plan->'payloads'->'capacityMappings') x WHERE x->>'sourceSpelling'=item->>'sourceSpelling' AND x->'existingRoleId'='null'::jsonb;
  SELECT * INTO event FROM public.audit_events WHERE id=(item->>'auditEventId')::bigint;
  IF (mapping IS NULL OR event.entity_schema<>'public' OR event.entity_table<>'lookup_party_role' OR event.action<>'record_created'
   OR event.entity_key<>jsonb_build_object('id',(item->>'id')::integer) OR event.request_id<>p_operation OR event.actor_id<>first_row.actor_id
   OR event.correlation_id IS DISTINCT FROM p_operation OR event.audit_session_id IS DISTINCT FROM first_row.audit_session_id
   OR event.outcome IS DISTINCT FROM 'succeeded' OR event.actor_role_snapshot NOT IN('Administrator','Litigation Assistant')
   OR event.before_values<>'{}' OR event.after_values IS DISTINCT FROM item->'afterValues'
   OR event.after_values IS DISTINCT FROM jsonb_build_object('code','task62_'||encode(convert_to(mapping->>'sourceSpelling','UTF8'),'hex'),
     'label_ar_m',mapping->'displayM','label_ar_f',mapping->'displayF','label_en',NULL,'is_active',true,'sort_order',100)
   OR event.after_values->>'label_ar_m' IS DISTINCT FROM mapping->>'displayM'
   OR event.after_values->>'label_ar_f' IS DISTINCT FROM mapping->>'displayF') IS DISTINCT FROM false THEN RETURN false; END IF;
 END LOOP;
 FOR item IN SELECT x FROM jsonb_array_elements(manifest->'matters') x LOOP
  request:=item->'request';
  IF (NOT EXISTS(SELECT 1 FROM _migration.matter_edit_submission s WHERE s.actor_id=first_row.actor_id
    AND s.submission_id=(request->>'submission')::uuid AND s.request_payload=request AND s.changed
    AND s.matter_id=(request->>'id')::integer AND s.result_version=(item->'result'->>'version')::bigint)
   OR (item->'result'->>'version')::bigint<>(request->>'version')::bigint+1) IS DISTINCT FROM false THEN RETURN false; END IF;
 END LOOP;
 -- Validate the immutable aggregate transition, including every preserved old relationship.
 FOR item IN SELECT x FROM jsonb_array_elements(manifest->'matters') x LOOP
  request:=item->'request';
  SELECT c.* INTO change_row FROM _migration.matter_edit_change c WHERE c.matter_id=(request->>'id')::integer
    AND c.version=(item->'result'->>'version')::bigint AND c.request_id=p_operation AND c.actor_id=first_row.actor_id;
  SELECT (x->'sourceRow'->>'currentMatterVersion')::bigint INTO baseline FROM jsonb_array_elements(plan->'payloads'->'partyReleases') x
    WHERE x->'sourceRow'->>'matterId'=request->>'id' LIMIT 1;
  IF (baseline IS NULL OR change_row IS NULL OR (request->>'version')::bigint IS DISTINCT FROM baseline
   OR request->'values' IS DISTINCT FROM '{}'::jsonb
   OR change_row.before_values->'lawyers' IS DISTINCT FROM change_row.after_values->'lawyers'
   OR (change_row.before_values->'matter')-ARRAY['row_version','updated_at','updated_by'] IS DISTINCT FROM
      (change_row.after_values->'matter')-ARRAY['row_version','updated_at','updated_by']
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(change_row.before_values->'parties') old
      WHERE NOT change_row.after_values->'parties' @> jsonb_build_array(old))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(change_row.before_values->'capacities') old
      WHERE NOT change_row.after_values->'capacities' @> jsonb_build_array(old))
   OR jsonb_array_length(change_row.after_values->'parties')-jsonb_array_length(change_row.before_values->'parties') <>
      (SELECT count(*) FROM _migration.task62_source_receipt receipt_row WHERE receipt_row.operation_id=p_operation AND receipt_row.kind='party_release' AND receipt_row.matter_id=(request->>'id')::integer)
   OR jsonb_array_length(change_row.after_values->'capacities')-jsonb_array_length(change_row.before_values->'capacities') <>
      (SELECT count(*) FROM _migration.task62_source_receipt receipt_row WHERE receipt_row.operation_id=p_operation AND receipt_row.kind='party_release' AND receipt_row.matter_id=(request->>'id')::integer)
  ) IS DISTINCT FROM false THEN RETURN false; END IF;
 END LOOP;
 FOR item IN SELECT x FROM jsonb_array_elements(manifest->'hearings') x LOOP
  request:=item->'request';
  IF (NOT EXISTS(SELECT 1 FROM _migration.hearing_edit_submission s WHERE s.actor_id=first_row.actor_id
    AND s.submission_id=(request->>'submission')::uuid AND s.request_payload=request AND s.changed
    AND s.hearing_id=(item->'result'->>'id')::integer AND s.result_version=1)) IS DISTINCT FROM false THEN RETURN false; END IF;
 END LOOP;
 FOR item IN SELECT x FROM jsonb_array_elements(manifest->'selections') x LOOP
  request:=item->'request';
  SELECT x->'approvedSelection' INTO chosen FROM jsonb_array_elements(plan->'payloads'->'selectionInitialization') x WHERE x->'approvedSelection'->>'matterId'=request->>'id';
  IF (chosen IS NULL OR request->'selected' IS DISTINCT FROM chosen->'selected' OR request->>'client'<>'245' OR request->>'version'<>'0') IS DISTINCT FROM false THEN RETURN false; END IF;
  identity:=(chosen->>'existingHearingId')::integer;
  IF chosen->'selected'='true'::jsonb AND identity IS NULL THEN
   SELECT target_id INTO identity FROM _migration.task62_source_receipt WHERE operation_id=p_operation AND kind='hearing_source' AND source_identity='hearing:'||(chosen->>'newHearingSourceId');
  END IF;
  SELECT (x->'approvedSelection'->>'baselineMatterVersion')::bigint INTO baseline FROM jsonb_array_elements(plan->'payloads'->'selectionInitialization') x
    WHERE x->'approvedSelection'->>'matterId'=request->>'id';
  IF (request->>'matterVersion' IS DISTINCT FROM (baseline+CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(manifest->'matters') m WHERE m->'request'->>'id'=request->>'id') THEN 1 ELSE 0 END)::text
   OR request->>'hearingVersion' IS DISTINCT FROM CASE WHEN identity IS NULL THEN NULL ELSE '1' END
   OR ((chosen->>'selected')::boolean AND NOT EXISTS(SELECT 1 FROM _migration.client_report_selection_change c
    WHERE c.matter_id=(request->>'id')::integer AND c.version=1 AND c.request_id=p_operation
    AND c.actor_id=first_row.actor_id AND c.submission_id=(request->>'submission')::uuid AND c.before_values IS NULL))) IS DISTINCT FROM false THEN RETURN false; END IF;
  IF (request->>'hearingId' IS DISTINCT FROM identity::text OR NOT EXISTS(SELECT 1 FROM _migration.client_report_selection_submission s
   WHERE s.submission_id=(request->>'submission')::uuid AND s.actor_id=first_row.actor_id AND s.request_payload=request
    AND s.changed=(chosen->>'selected')::boolean AND s.result_version=CASE WHEN (chosen->>'selected')::boolean THEN 1 ELSE 0 END)) IS DISTINCT FROM false THEN RETURN false; END IF;
 END LOOP;
 IF ((SELECT count(DISTINCT x->>'sourceSpelling') FROM jsonb_array_elements(manifest->'capacities') x)<>8
 OR (SELECT count(DISTINCT x->'request'->>'id') FROM jsonb_array_elements(manifest->'matters') x)<>24
 OR (SELECT count(DISTINCT x->>'sourceHearingId') FROM jsonb_array_elements(manifest->'hearings') x)<>2
 OR (SELECT count(DISTINCT x->'request'->>'id') FROM jsonb_array_elements(manifest->'selections') x)<>13) IS DISTINCT FROM false THEN RETURN false; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION _migration.task62_source_operation_valid(uuid) FROM PUBLIC,litigation_runtime;
CREATE FUNCTION _migration.task62_source_require_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE operation uuid; payload jsonb; mapping jsonb;
BEGIN
 payload:=to_jsonb(NEW);
 -- Check mutable lookup labels at receipt creation, then retain their immutable
 -- plan/ID mapping. Legitimate later label maintenance does not invalidate history.
 IF TG_TABLE_NAME='task62_source_receipt' THEN
  IF payload->>'kind'='hearing_source' THEN
   SELECT x INTO mapping FROM jsonb_array_elements(payload->'operation_manifest'->'hearings') x
     WHERE x->>'sourceHearingId'=payload->'source_values'->>'sourceHearingId';
   IF NOT EXISTS(SELECT 1 FROM public.lookup_court WHERE id=(mapping->>'courtId')::integer AND is_active
       AND label_ar=payload->'source_values'->'lookupRaw'->>'court_id')
    OR NOT EXISTS(SELECT 1 FROM public.lookup_hearing_action WHERE id=(mapping->>'actionId')::integer AND is_active
       AND label_ar=payload->'source_values'->'lookupRaw'->>'action_id') THEN
    RAISE EXCEPTION 'Bounded hearing lookup mapping differs from approved source';
   END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.lookup_party_role r,
      LATERAL jsonb_array_elements((payload->>'approved_plan_text')::jsonb->'payloads'->'capacityMappings') p
      WHERE p->>'existingRoleId'='2' AND r.id=2 AND r.is_active
       AND r.label_ar_m=p->>'displayM' AND r.label_ar_f=p->>'displayF') THEN
    RAISE EXCEPTION 'Bounded existing capacity mapping differs';
   END IF;
  END IF;
 END IF;
 operation:=CASE WHEN TG_TABLE_NAME='audit_events' THEN (to_jsonb(NEW)->>'request_id')::uuid ELSE (to_jsonb(NEW)->>'operation_id')::uuid END;
 IF NOT _migration.task62_source_operation_valid(operation) THEN RAISE EXCEPTION 'Bounded source operation lacks complete approved immutable provenance'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION _migration.task62_source_require_complete() FROM PUBLIC,litigation_runtime;
CREATE TRIGGER task62_source_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.task62_source_receipt FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_audit_event_change();
CREATE CONSTRAINT TRIGGER task62_source_complete AFTER INSERT ON _migration.task62_source_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task62_source_require_complete();
CREATE CONSTRAINT TRIGGER task62_source_atomic_audit AFTER INSERT ON public.audit_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.request_id::text ~ '^62620075-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') EXECUTE FUNCTION _migration.task62_source_require_complete();
COMMIT;
