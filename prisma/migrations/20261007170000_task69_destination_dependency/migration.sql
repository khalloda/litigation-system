-- Task69 shared destination dependency; accepted payloads remain outside Git.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>83
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20261007170000_task69_destination_dependency') THEN RAISE EXCEPTION 'Exact migration83 direct prestate required'; END IF;
END $$;
CREATE OR REPLACE FUNCTION _migration.task69_lookup_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r _migration.task69_receipt%ROWTYPE; a _migration.task69_allowlist%ROWTYPE; d _migration.task69_delta%ROWTYPE; p jsonb;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE receipt_id=p_receipt;
 IF NOT FOUND THEN RETURN false; END IF;
 IF r.issue_id NOT LIKE 'LOOKUP/%' OR r.phase='compensate' THEN RETURN true; END IF;
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=r.operation_id AND issue_id=r.issue_id;p:=a.payload_text::jsonb;
 SELECT * INTO d FROM _migration.task69_delta WHERE receipt_id=p_receipt AND ordinal=1;
 IF NOT FOUND OR r.expected_delta_count<>1 OR d.before_values IS NOT NULL OR d.entity_schema||'.'||d.entity_table IS DISTINCT FROM p->>'namespace'
 OR a.stage<>'shared-dependency' OR p->'expectedIds'<>'[]' OR p->>'expectedCardinality'<>'0'
 OR r.effect<>'business-change' OR r.returned_ids<>d.entity_key OR r.source_occurrences<>'[]'
 OR (d.entity_table='lookup_party_role' AND d.after_values->>'code' IS DISTINCT FROM 't69_'||substring(r.issue_id from 8 for 20))
 OR (d.entity_table IN('lookup_court','lookup_matter_destination') AND d.after_values ? 'code')
 OR d.after_values->>'is_active' IS DISTINCT FROM 'true' THEN RETURN false; END IF;
 RETURN CASE d.entity_table WHEN 'lookup_party_role' THEN d.after_values->>'label_ar_m'=p->>'exactLabel' AND d.after_values->>'label_ar_f'=p->>'exactLabel'
 WHEN 'lookup_court' THEN d.after_values->>'label_ar'=p->>'exactLabel'
 WHEN 'lookup_matter_destination' THEN d.after_values->>'label_ar'=p->>'exactLabel' ELSE false END;
END $$;
CREATE FUNCTION _migration.task69_destination_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r _migration.task69_receipt%ROWTYPE; a _migration.task69_allowlist%ROWTYPE; p jsonb; item jsonb; d _migration.task69_delta%ROWTYPE; allowed text[]; expected jsonb; changed_refs integer:=0;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE receipt_id=p_receipt;
 IF NOT FOUND THEN RETURN false; END IF;
 IF r.issue_id<>'DEST-INVESTMENT-26-32' OR r.phase='compensate' THEN RETURN true; END IF;
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=r.operation_id AND issue_id=r.issue_id;p:=a.payload_text::jsonb;
 IF a.stage<>'shared-dependency' OR a.unit_kind<>'dependency' OR p->>'namespace'<>'public.lookup_matter_destination'
 OR r.effect<>'business-change' OR r.expected_delta_count<>3 OR jsonb_array_length(p->'lookupDeltas')<>2
 OR r.returned_ids<>jsonb_build_object('id',p->'survivorId','retiredId',p->'retiredId','redirectedMatterId',3048)
 OR r.source_occurrences IS DISTINCT FROM p->'preservedAliasProvenance' THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'lookupDeltas') LOOP
  SELECT * INTO d FROM _migration.task69_delta WHERE receipt_id=p_receipt AND entity_table='lookup_matter_destination' AND entity_key=jsonb_build_object('id',item->'id');
  IF NOT FOUND OR d.before_values IS DISTINCT FROM item->'beforeRow' THEN RETURN false; END IF;
  allowed:=ARRAY(SELECT key FROM jsonb_each(item->'columns'));
  IF cardinality(allowed)<>1 OR NOT(allowed<@ARRAY['label_ar','is_active']) THEN RETURN false; END IF;
  expected:=d.before_values||jsonb_build_object(allowed[1],item->'columns'->allowed[1]->'after');
  IF d.after_values-ARRAY['updated_at','updated_by'] IS DISTINCT FROM expected-ARRAY['updated_at','updated_by'] THEN RETURN false; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'existingReferenceEffects') LOOP
  IF item->>'action'='PRESERVE_ID_AND_ROW' THEN
   IF EXISTS(SELECT 1 FROM _migration.task69_delta WHERE receipt_id=p_receipt AND entity_schema||'.'||entity_table=item->>'table' AND entity_key=jsonb_build_object('id',item->'id')) THEN RETURN false; END IF;
  ELSE
   changed_refs:=changed_refs+1;
   SELECT * INTO d FROM _migration.task69_delta WHERE receipt_id=p_receipt AND entity_schema||'.'||entity_table=item->>'table' AND entity_key=jsonb_build_object('id',item->'id');
   IF NOT FOUND OR item->>'table'<>'public.matters' OR item->>'id'<>'3048'
    OR d.before_values-ARRAY['updated_at','updated_by','row_version'] IS DISTINCT FROM (item->'beforeRow')-ARRAY['updated_at','updated_by','row_version']
    OR d.before_values->'destination_id' IS DISTINCT FROM item->'beforeDestinationId'
    OR d.after_values->'destination_id' IS DISTINCT FROM item->'afterDestinationId'
    OR d.before_values-ARRAY['updated_at','updated_by','row_version','destination_id'] IS DISTINCT FROM d.after_values-ARRAY['updated_at','updated_by','row_version','destination_id']
    OR (d.after_values->>'row_version')::bigint IS DISTINCT FROM (d.before_values->>'row_version')::bigint+1 THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN changed_refs=1 AND jsonb_array_length(p->'existingReferenceEffects')=15;
END $$;
CREATE FUNCTION _migration.task69_destination_receipt_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF _migration.task69_destination_receipt_valid(NEW.receipt_id) IS NOT TRUE THEN RAISE EXCEPTION 'Task69 destination receipt differs from exact approved normalization'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER task69_destination_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_destination_receipt_complete();
REVOKE ALL ON FUNCTION _migration.task69_destination_receipt_valid(uuid),_migration.task69_destination_receipt_complete() FROM PUBLIC,litigation_runtime;
COMMIT;
