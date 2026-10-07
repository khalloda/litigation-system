-- Task69 guarded party restoration; candidate only, no source decisions embedded.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $precondition$
BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>80
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20261007140000_task69_matter_restoration') THEN
 RAISE EXCEPTION 'Exact migration80 direct administration prestate required'; END IF;
END $precondition$;

CREATE FUNCTION _migration.task69_party_expected(p_operation uuid,p_issue text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a _migration.task69_allowlist%ROWTYPE; e jsonb; src jsonb; p jsonb; r jsonb; pi integer:=0; ri integer; rid integer; roles jsonb; result jsonb:='[]'; found_ids integer[]; dependency_receipts uuid[];
BEGIN
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=p_operation AND issue_id=p_issue AND stage='S1-party-display';
 IF NOT FOUND THEN RAISE EXCEPTION 'Exact S1 issue required'; END IF;
 e:=a.payload_text::jsonb; src:=a.entry_text::jsonb->'source';
 IF jsonb_array_length(e->'matterIds')<>1 OR jsonb_array_length(e->'parties')<1 THEN RAISE EXCEPTION 'Exact S1 shape required'; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(e->'parties') LOOP
  pi:=pi+1;ri:=0;roles:='[]';
  FOR r IN SELECT value FROM jsonb_array_elements(p->'roles') LOOP
   ri:=ri+1;rid:=(r->>'lookupId')::integer;
   IF rid IS NULL THEN
    SELECT array_agg((receipt.returned_ids->>'id')::integer),array_agg(receipt.receipt_id) INTO found_ids,dependency_receipts
    FROM _migration.task69_allowlist allowed JOIN _migration.task69_receipt receipt USING(operation_id,issue_id)
    WHERE allowed.operation_id=p_operation AND allowed.stage='shared-dependency' AND receipt.phase='apply'
    AND allowed.payload_text::jsonb->>'namespace'='public.lookup_party_role' AND allowed.payload_text::jsonb->>'exactLabel'=r->>'role';
    IF cardinality(found_ids) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Approved party lookup dependency missing'; END IF;
    IF _migration.task69_receipt_valid(dependency_receipts[1]) IS NOT TRUE THEN RAISE EXCEPTION 'Approved party lookup receipt invalid'; END IF;
    rid:=found_ids[1];
   END IF;
   roles:=roles||jsonb_build_array(jsonb_build_object('role_id',rid,'ordinal',ri,'display_label',r->>'role','qualifier',r->>'qualifier','legacy_role_raw',r->>'source_role','is_retired',false));
  END LOOP;
  result:=result||jsonb_build_array(jsonb_build_object('matter_id',(e->'matterIds'->>0)::integer,'side',e->>'side','party_name',p->>'name','gender',p->>'gender','ordinal',pi,
   'semantic_party_name',p->>'semantic_party_name','representative_name',p->>'representative_name','contextual_text',p->>'contextual_text','explanatory_text',p->>'explanatoryText',
   'legacy_raw',src->>'raw_value','legacy_source_record_key',src->>'src_record_key','legacy_source_extraction_sha256',src->>'extraction_sha256','source_field',src->>'source_field','source_fragment_ordinal',pi,'is_retired',false,'roles',roles));
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION _migration.task69_party_insert_allowed(p_table text,p_row jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op uuid; issue text; expected jsonb; parent public.matter_parties%ROWTYPE; row_projection jsonb;
BEGIN
 IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RETURN false; END IF;
 op:=nullif(current_setting('litigation.task69_operation',true),'')::uuid;issue:=nullif(current_setting('litigation.task69_issue',true),'');
 IF op IS NULL OR issue IS NULL THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM _migration.task69_receipt WHERE operation_id=op AND issue_id=issue) THEN RETURN false; END IF;
 expected:=_migration.task69_party_expected(op,issue);
 row_projection:=p_row-ARRAY['id','created_at','created_by','updated_at','updated_by'];
 IF p_table='matter_parties' THEN
  RETURN EXISTS(SELECT 1 FROM jsonb_array_elements(expected) p WHERE p-'roles'=row_projection);
 ELSIF p_table='matter_party_roles' THEN
  SELECT * INTO parent FROM public.matter_parties WHERE id=(p_row->>'party_id')::integer;
  RETURN EXISTS(SELECT 1 FROM jsonb_array_elements(expected) p,LATERAL jsonb_array_elements(p->'roles') r
   WHERE p-'roles'=to_jsonb(parent)-ARRAY['id','created_at','created_by','updated_at','updated_by'] AND r=row_projection-'party_id');
 END IF;
 RETURN false;
END $$;

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
    IF EXISTS(SELECT 1 FROM jsonb_each(incoming) e WHERE (e.key LIKE 'legacy_%' OR e.key IN ('source_field','source_member_ordinal','source_fragment_ordinal','reviewed_rule_id','fee_letter_ref','case_number_en')) AND e.value<>'null'::jsonb)
     AND NOT _migration.task69_party_insert_allowed(TG_TABLE_NAME,incoming) THEN RAISE EXCEPTION 'Native matter records cannot invent source evidence'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION _migration.task69_party_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE receipt _migration.task69_receipt%ROWTYPE; stage text; e jsonb; expected jsonb; p jsonb; r jsonb; pd _migration.task69_delta%ROWTYPE; rd _migration.task69_delta%ROWTYPE; md _migration.task69_delta%ROWTYPE; ids jsonb:='[]'; role_ids jsonb; actual_count integer:=1;
BEGIN
 SELECT * INTO receipt FROM _migration.task69_receipt WHERE receipt_id=p_receipt;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT a.stage,a.payload_text::jsonb INTO stage,e FROM _migration.task69_allowlist a WHERE a.operation_id=receipt.operation_id AND a.issue_id=receipt.issue_id;
 IF stage<>'S1-party-display' OR receipt.phase='compensate' THEN RETURN true; END IF;
 expected:=_migration.task69_party_expected(receipt.operation_id,receipt.issue_id);
 SELECT * INTO md FROM _migration.task69_delta WHERE receipt_id=p_receipt AND entity_table='matters' AND entity_key=jsonb_build_object('id',(e->'matterIds'->>0)::integer);
 IF NOT FOUND OR md.before_values IS NULL OR md.after_values-ARRAY['row_version','updated_at','updated_by'] IS DISTINCT FROM md.before_values-ARRAY['row_version','updated_at','updated_by']
 OR (md.after_values->>'row_version')::bigint IS DISTINCT FROM (md.before_values->>'row_version')::bigint+1 THEN RETURN false; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(expected) LOOP
  SELECT * INTO pd FROM _migration.task69_delta d WHERE receipt_id=p_receipt AND entity_table='matter_parties'
   AND d.after_values-ARRAY['id','created_at','created_by','updated_at','updated_by']=p-'roles';
  IF NOT FOUND OR pd.before_values IS NOT NULL THEN RETURN false; END IF;
  actual_count:=actual_count+1;role_ids:='[]';
  FOR r IN SELECT value FROM jsonb_array_elements(p->'roles') LOOP
   SELECT * INTO rd FROM _migration.task69_delta d WHERE receipt_id=p_receipt AND entity_table='matter_party_roles'
    AND d.after_values-ARRAY['id','created_at','created_by','updated_at','updated_by']=r||jsonb_build_object('party_id',pd.entity_key->'id');
   IF NOT FOUND OR rd.before_values IS NOT NULL THEN RETURN false; END IF;
   actual_count:=actual_count+1;role_ids:=role_ids||jsonb_build_array(rd.entity_key->'id');
  END LOOP;
  ids:=ids||jsonb_build_array(jsonb_build_object('id',pd.entity_key->'id','roleIds',role_ids));
 END LOOP;
 RETURN receipt.effect='business-change' AND receipt.expected_delta_count=actual_count
 AND receipt.returned_ids=jsonb_build_object('matterId',e->'matterIds'->0,'parties',ids)
 AND receipt.source_occurrences=jsonb_build_array(jsonb_build_object('source',(SELECT entry_text::jsonb->'source' FROM _migration.task69_allowlist WHERE operation_id=receipt.operation_id AND issue_id=receipt.issue_id),'mappings',receipt.returned_ids));
END $$;

CREATE FUNCTION _migration.task69_lookup_receipt_valid(p_receipt uuid) RETURNS boolean
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
 OR d.after_values->>'code' IS DISTINCT FROM 't69_'||substring(r.issue_id from 8 for 20)
 OR d.after_values->>'is_active' IS DISTINCT FROM 'true' THEN RETURN false; END IF;
 RETURN CASE d.entity_table WHEN 'lookup_party_role' THEN d.after_values->>'label_ar_m'=p->>'exactLabel' AND d.after_values->>'label_ar_f'=p->>'exactLabel'
 WHEN 'lookup_court' THEN d.after_values->>'label_ar'=p->>'exactLabel'
 WHEN 'lookup_matter_destination' THEN d.after_values->>'label_ar'=p->>'exactLabel' ELSE false END;
END $$;
REVOKE ALL ON FUNCTION _migration.task69_lookup_receipt_valid(uuid) FROM PUBLIC,litigation_runtime;

CREATE FUNCTION _migration.task69_party_receipt_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF _migration.task69_party_receipt_valid(NEW.receipt_id) IS NOT TRUE OR _migration.task69_lookup_receipt_valid(NEW.receipt_id) IS NOT TRUE THEN RAISE EXCEPTION 'Task69 party receipt differs from exact approved semantics'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER task69_party_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_party_receipt_complete();

CREATE FUNCTION _migration.task69_party_source_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE historical boolean;
BEGIN
 IF TG_TABLE_NAME='matter_parties' THEN historical:=to_jsonb(NEW)->>'legacy_source_record_key' IS NOT NULL;
 ELSE historical:=to_jsonb(NEW)->>'legacy_role_raw' IS NOT NULL; END IF;
 IF NOT coalesce(historical,false) THEN RETURN NULL; END IF;
 -- The separate deferred receipt and semantic constraints validate each receipt.
 -- This constraint binds the exact inserted source row to that required receipt.
 IF NOT EXISTS(SELECT 1 FROM _migration.task69_delta d JOIN _migration.task69_receipt r USING(receipt_id)
  JOIN _migration.task69_allowlist a USING(operation_id,issue_id)
  WHERE a.stage='S1-party-display' AND r.phase='apply' AND r.effect='business-change'
  AND d.entity_table=TG_TABLE_NAME AND d.entity_key=jsonb_build_object('id',NEW.id)
  AND d.before_values IS NULL AND d.after_values=to_jsonb(NEW)) THEN
 RAISE EXCEPTION 'Task69 inserted party source lacks complete approved receipt'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER task69_party_source_complete AFTER INSERT ON public.matter_parties DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_party_source_complete();
CREATE CONSTRAINT TRIGGER task69_party_source_complete AFTER INSERT ON public.matter_party_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_party_source_complete();
REVOKE ALL ON FUNCTION _migration.task69_party_expected(uuid,text),_migration.task69_party_insert_allowed(text,jsonb),_migration.task69_party_receipt_valid(uuid),_migration.task69_party_receipt_complete(),_migration.task69_party_source_complete() FROM PUBLIC,litigation_runtime;
COMMIT;
