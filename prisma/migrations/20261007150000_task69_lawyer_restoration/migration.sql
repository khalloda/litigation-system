-- Task69 S2 historical lawyer membership. No business restoration in this migration.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $precondition$
BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>81
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20261007150000_task69_lawyer_restoration') THEN
 RAISE EXCEPTION 'Exact migration81 direct administration prestate required'; END IF;
END $precondition$;
ALTER TABLE public.matter_lawyers ADD COLUMN task69_receipt_id uuid REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.matter_lawyers ADD CONSTRAINT matter_lawyers_task69_source_shape CHECK(task69_receipt_id IS NULL OR (legacy_source_record_key IS NOT NULL AND legacy_source IS NOT NULL AND reviewed_rule_id IS NULL AND source_field='lawyerA') IS TRUE);
ALTER TABLE public.matter_lawyers DROP CONSTRAINT matter_lawyers_rule_shape;
ALTER TABLE public.matter_lawyers ADD CONSTRAINT matter_lawyers_rule_shape CHECK(legacy_source_record_key IS NULL AND reviewed_rule_id IS NULL OR legacy_source_record_key IS NOT NULL AND (reviewed_rule_id IS NULL AND source_member_ordinal=1 OR reviewed_rule_id IS NOT NULL OR task69_receipt_id IS NOT NULL));
CREATE INDEX matter_lawyers_task69_receipt_idx ON public.matter_lawyers(task69_receipt_id) WHERE task69_receipt_id IS NOT NULL;
INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,capture_mode,max_text_characters,classification_reason) VALUES('public','matter_lawyers','task69_receipt_id','value',64,'task69_historical_restoration');
CREATE FUNCTION _migration.task69_lawyer_history(v jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN v IS NULL THEN NULL ELSE jsonb_set(_migration.task69_party_history(v),'{lawyers}',coalesce((SELECT jsonb_agg(jsonb_build_object('task69_receipt_id',NULL)||r ORDER BY (r->>'id')::integer) FROM jsonb_array_elements(v->'lawyers') r),'[]')) END
$$;
CREATE OR REPLACE FUNCTION _migration.matter_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb; c record; expected_version bigint;
BEGIN
  expected:=_migration.task69_lawyer_history(_migration.matter_lifecycle_normalize(_migration.matter_edit_initial_aggregate(p_id)));
  expected_version:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
  FOR c IN SELECT * FROM _migration.matter_edit_change WHERE matter_id=p_id ORDER BY version LOOP
    IF c.version<>expected_version OR _migration.task69_lawyer_history(_migration.matter_lifecycle_normalize(c.before_values)) IS DISTINCT FROM expected
      OR (c.after_values->'matter'->>'row_version')::bigint<>c.version
      OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='matters' AND e.entity_schema='public'
        AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id
        AND e.after_values->>'row_version'=c.version::text AND e.action IN ('record_created','record_updated')) THEN RETURN false; END IF;
    IF coalesce((expected->'matter'->>'is_archived')::boolean,false) IS DISTINCT FROM coalesce((c.after_values->'matter'->>'is_archived')::boolean,false) THEN
      IF NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='matters' AND e.entity_schema='public' AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.action=CASE WHEN (c.after_values->'matter'->>'is_archived')::boolean THEN 'archive' ELSE 'restore' END AND e.outcome='succeeded') THEN RETURN false; END IF;
    END IF;
    expected:=_migration.task69_lawyer_history(_migration.matter_lifecycle_normalize(c.after_values)); expected_version:=expected_version+1;
  END LOOP;
  RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.matter_edit_aggregate(p_id);
END;
$$;

CREATE FUNCTION _migration.task69_lawyer_expected(p_operation uuid,p_issue text,p_receipt uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a _migration.task69_allowlist%ROWTYPE; p jsonb; src jsonb; assignment jsonb; role_code text; result jsonb:='[]';
BEGIN
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=p_operation AND issue_id=p_issue AND stage='S2-lawyer-membership';
 IF NOT FOUND OR p_receipt IS NULL THEN RAISE EXCEPTION 'Exact S2 issue and future receipt required'; END IF;
 p:=a.payload_text::jsonb;src:=a.entry_text::jsonb->'source';
 IF src->>'source_field' IS DISTINCT FROM 'lawyerA' OR jsonb_array_length(p->'assignments')<1 THEN RAISE EXCEPTION 'Unsupported S2 source'; END IF;
 FOR assignment IN SELECT value FROM jsonb_array_elements(p->'assignments') LOOP
  role_code:=CASE assignment->>'role' WHEN 'المحامي الرئيسي (lead)' THEN 'lead' ELSE assignment->>'role' END;
  IF role_code IS NULL OR role_code NOT IN('lead','co_lead','support') THEN RAISE EXCEPTION 'Unapproved lawyer responsibility'; END IF;
  result:=result||jsonb_build_array(jsonb_build_object('matter_id',(p->>'matterId')::integer,'person_id',(assignment->>'personId')::integer,'role',role_code,'position',(assignment->>'ordinal')::integer,
   'legacy_source',src->>'raw_value','legacy_source_record_key',src->>'src_record_key','legacy_source_extraction_sha256',src->>'extraction_sha256','source_field',src->>'source_field','source_member_ordinal',(assignment->>'ordinal')::integer,'reviewed_rule_id',NULL,'is_retired',false,'task69_receipt_id',p_receipt));
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION _migration.task69_matter_insert_allowed(p_table text,p_row jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op uuid; issue text; expected jsonb;
BEGIN
 IF p_table<>'matter_lawyers' THEN RETURN _migration.task69_party_insert_allowed(p_table,p_row); END IF;
 IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RETURN false; END IF;
 op:=nullif(current_setting('litigation.task69_operation',true),'')::uuid;issue:=nullif(current_setting('litigation.task69_issue',true),'');
 IF op IS NULL OR issue IS NULL OR p_row->>'task69_receipt_id' IS NULL THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM _migration.task69_receipt WHERE operation_id=op AND issue_id=issue) THEN RETURN false; END IF;
 expected:=_migration.task69_lawyer_expected(op,issue,(p_row->>'task69_receipt_id')::uuid);
 RETURN EXISTS(SELECT 1 FROM jsonb_array_elements(expected) x WHERE x=p_row-ARRAY['id','created_at','created_by','updated_at','updated_by']);
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
    IF EXISTS(SELECT 1 FROM jsonb_each(incoming) e WHERE (e.key LIKE 'legacy_%' OR e.key='task69_receipt_id' OR e.key IN ('source_field','source_member_ordinal','source_fragment_ordinal','reviewed_rule_id','fee_letter_ref','case_number_en')) AND e.value<>'null'::jsonb)
     AND NOT _migration.task69_matter_insert_allowed(TG_TABLE_NAME,incoming) THEN RAISE EXCEPTION 'Native matter records cannot invent source evidence'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION _migration.task69_lawyer_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE receipt _migration.task69_receipt%ROWTYPE; a _migration.task69_allowlist%ROWTYPE; p jsonb; expected jsonb; item jsonb; old_rows jsonb; old_row jsonb; projected jsonb; d _migration.task69_delta%ROWTYPE; md _migration.task69_delta%ROWTYPE; ids jsonb:='[]'; retained jsonb:='[]'; n integer:=1;
BEGIN
 SELECT * INTO receipt FROM _migration.task69_receipt WHERE receipt_id=p_receipt;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=receipt.operation_id AND issue_id=receipt.issue_id;
 IF a.stage<>'S2-lawyer-membership' OR receipt.phase='compensate' THEN RETURN true; END IF;
 p:=a.payload_text::jsonb;old_rows:=a.entry_text::jsonb->'guards'->'membershipPreconditions'->'public.matter_lawyers';expected:=_migration.task69_lawyer_expected(receipt.operation_id,receipt.issue_id,p_receipt);
 SELECT * INTO md FROM _migration.task69_delta WHERE receipt_id=p_receipt AND entity_table='matters' AND entity_key=jsonb_build_object('id',(p->>'matterId')::integer);
 IF NOT FOUND OR md.before_values IS NULL OR md.after_values-ARRAY['row_version','updated_at','updated_by'] IS DISTINCT FROM md.before_values-ARRAY['row_version','updated_at','updated_by']
 OR (md.after_values->>'row_version')::bigint IS DISTINCT FROM (md.before_values->>'row_version')::bigint+1 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(expected) LOOP
  SELECT * INTO d FROM _migration.task69_delta x WHERE receipt_id=p_receipt AND entity_table='matter_lawyers' AND x.after_values->'person_id'=item->'person_id';
  IF NOT FOUND THEN RETURN false; END IF;
  IF d.before_values IS NULL THEN
   IF d.after_values-ARRAY['id','created_at','created_by','updated_at','updated_by'] IS DISTINCT FROM item THEN RETURN false; END IF;
  ELSE
   IF a.issue_id<>'quarantine.matter_relationship_transform:431' OR p->>'reuseExistingPerson2Relation' IS DISTINCT FROM 'true' OR item->>'person_id'<>'2' THEN RETURN false; END IF;
   SELECT value INTO old_row FROM jsonb_array_elements(old_rows) WHERE value->'person_id'=item->'person_id';
   IF old_row IS NULL OR d.before_values IS DISTINCT FROM jsonb_build_object('task69_receipt_id',NULL)||old_row THEN RETURN false; END IF;
   projected:=d.before_values||jsonb_build_object('role',item->'role','position',item->'position');
   IF d.after_values-ARRAY['updated_at','updated_by'] IS DISTINCT FROM projected-ARRAY['updated_at','updated_by'] THEN RETURN false; END IF;
   retained:=retained||jsonb_build_array(old_row);
  END IF;
  n:=n+1;ids:=ids||jsonb_build_array(d.entity_key->'id');
 END LOOP;
 RETURN receipt.effect='business-change' AND receipt.expected_delta_count=n
 AND receipt.returned_ids=jsonb_build_object('matterId',p->'matterId','assignments',ids)
 AND receipt.source_occurrences=jsonb_build_array(jsonb_build_object('source',a.entry_text::jsonb->'source','mappings',receipt.returned_ids,'retainedExisting',retained));
END $$;
CREATE FUNCTION _migration.task69_lawyer_receipt_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF _migration.task69_lawyer_receipt_valid(NEW.receipt_id) IS NOT TRUE THEN RAISE EXCEPTION 'Task69 lawyer receipt differs from exact approved assignment'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER task69_lawyer_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_lawyer_receipt_complete();
CREATE FUNCTION _migration.task69_lawyer_source_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.task69_receipt_id IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM _migration.task69_delta d JOIN _migration.task69_receipt r USING(receipt_id) JOIN _migration.task69_allowlist a USING(operation_id,issue_id)
  WHERE r.receipt_id=NEW.task69_receipt_id AND r.phase='apply' AND a.stage='S2-lawyer-membership' AND d.entity_table='matter_lawyers' AND d.entity_key=jsonb_build_object('id',NEW.id) AND d.before_values IS NULL AND d.after_values=to_jsonb(NEW)) THEN
 RAISE EXCEPTION 'Historical assignment lacks exact source-to-receipt binding'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER task69_lawyer_source_complete AFTER INSERT ON public.matter_lawyers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_lawyer_source_complete();
REVOKE ALL ON FUNCTION _migration.task69_lawyer_history(jsonb),_migration.task69_lawyer_expected(uuid,text,uuid),_migration.task69_matter_insert_allowed(text,jsonb),_migration.task69_lawyer_receipt_valid(uuid),_migration.task69_lawyer_receipt_complete(),_migration.task69_lawyer_source_complete() FROM PUBLIC,litigation_runtime;
COMMIT;
