-- Task69 S6 exact document-field restoration. Candidate only.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>89
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20261007230000_task69_document_restoration') THEN RAISE EXCEPTION 'Exact migration89 direct prestate required'; END IF;
END $$;
CREATE TABLE _migration.task69_document_change(
 document_id integer NOT NULL,version bigint NOT NULL,
 receipt_id uuid NOT NULL UNIQUE REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED,
 PRIMARY KEY(document_id,version),FOREIGN KEY(document_id,version) REFERENCES _migration.document_edit_change(document_id,version) DEFERRABLE INITIALLY DEFERRED
);
REVOKE ALL ON _migration.task69_document_change FROM PUBLIC,litigation_runtime;
CREATE TRIGGER task69_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.task69_document_change FOR EACH STATEMENT EXECUTE FUNCTION _migration.task69_immutable();
CREATE FUNCTION _migration.task69_document_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE r _migration.task69_receipt%ROWTYPE;a _migration.task69_allowlist%ROWTYPE;c _migration.document_edit_change%ROWTYPE;
 parent _migration.task69_delta%ROWTYPE;d _migration.task69_delta%ROWTYPE;o jsonb;kind text;other_kind text;tbl text;col text;scalar text;expected jsonb;selected jsonb;mapped jsonb:='[]';ids jsonb:='[]';target jsonb;member jsonb;n integer:=0;expected_parent jsonb;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE receipt_id=p_receipt;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=r.operation_id AND issue_id=r.issue_id;
 IF a.stage<>'S6-documents' OR r.phase='compensate' THEN RETURN true;END IF;
 o:=a.payload_text::jsonb;
 IF a.entry_text::jsonb->'source'->>'field_kind'='responsible_person' AND o ? 'responsiblePeople' THEN
  kind:='people';other_kind:='matters';tbl:='document_responsible_people';col:='person_id';scalar:='responsible_person_id';
  SELECT coalesce(jsonb_agg(x->'personId' ORDER BY ord),'[]') INTO selected FROM jsonb_array_elements(o->'responsiblePeople') WITH ORDINALITY v(x,ord);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(o->'responsiblePeople') WITH ORDINALITY v(x,ord) WHERE x->'sourceOrder' IS DISTINCT FROM to_jsonb(ord)) THEN RETURN false;END IF;
 ELSIF a.entry_text::jsonb->'source'->>'field_kind'='matter' AND o ? 'matterIds' THEN
  kind:='matters';other_kind:='people';tbl:='document_matters';col:='matter_id';scalar:='matter_id';selected:=o->'matterIds';
 ELSE RETURN false;END IF;
 IF jsonb_typeof(selected)<>'array' OR jsonb_array_length(selected)<>(SELECT count(DISTINCT x) FROM jsonb_array_elements(selected) x) THEN RETURN false;END IF;
 IF selected='[]'::jsonb THEN
  RETURN a.entry_text::jsonb->>'disposition'='APPROVED_HISTORICAL_ONLY' AND r.effect='no-business-write' AND r.expected_delta_count=0
  AND NOT EXISTS(SELECT 1 FROM _migration.task69_document_change WHERE receipt_id=p_receipt)
  AND r.returned_ids=jsonb_build_object('documentId',o->'documentId','kind',kind,'newMemberIds','[]'::jsonb,'mappings','[]'::jsonb)
  AND r.source_occurrences=jsonb_build_array(jsonb_build_object('source',a.entry_text::jsonb->'source','field',kind,'mappings','[]'::jsonb));
 END IF;
 SELECT x.* INTO c FROM _migration.document_edit_change x JOIN _migration.task69_document_change b USING(document_id,version) WHERE b.receipt_id=p_receipt;
 IF NOT FOUND OR c.document_id<>(o->>'documentId')::integer OR c.actor_id<>r.actor_id OR c.request_id<>r.request_id OR c.before_values IS NULL
 OR EXISTS(SELECT 1 FROM _migration.document_edit_submission WHERE document_id=c.document_id AND result_version=c.version) THEN RETURN false;END IF;
 SELECT * INTO parent FROM _migration.task69_delta WHERE receipt_id=p_receipt AND ordinal=1 AND entity_schema='public' AND entity_table='documents';
 expected_parent:=(c.before_values-ARRAY['matters','people'])||jsonb_build_object(scalar,CASE WHEN jsonb_array_length(selected)=1 THEN selected->0 ELSE 'null'::jsonb END);
 IF NOT FOUND OR parent.entity_key<>jsonb_build_object('id',c.document_id) OR parent.before_values IS DISTINCT FROM c.before_values-ARRAY['matters','people'] OR parent.after_values IS DISTINCT FROM c.after_values-ARRAY['matters','people']
 OR parent.after_values-ARRAY['row_version','updated_at','updated_by'] IS DISTINCT FROM expected_parent-ARRAY['row_version','updated_at','updated_by']
 OR (parent.after_values->>'row_version')::bigint<>c.version OR c.version<>(parent.before_values->>'row_version')::bigint+1 OR parent.before_values->'is_archived'<>'false'::jsonb
 OR c.before_values->kind IS DISTINCT FROM '[]'::jsonb OR c.before_values->other_kind IS DISTINCT FROM c.after_values->other_kind THEN RETURN false;END IF;
 FOR target IN SELECT value FROM jsonb_array_elements(selected) LOOP
  n:=n+1;SELECT * INTO d FROM _migration.task69_delta WHERE receipt_id=p_receipt AND ordinal=n+1 AND entity_schema='public' AND entity_table=tbl;
  expected:=jsonb_build_object('document_id',o->'documentId',col,target,'position',n,'is_retired',false);
  IF NOT FOUND OR d.before_values IS NOT NULL OR d.after_values-'id' IS DISTINCT FROM expected OR NOT c.after_values->kind @> jsonb_build_array(d.after_values) THEN RETURN false;END IF;
  ids:=ids||jsonb_build_array(d.entity_key->'id');mapped:=mapped||jsonb_build_array(jsonb_build_object('memberId',d.entity_key->'id','targetId',target,'sourceOrder',n));
 END LOOP;
 RETURN jsonb_array_length(c.after_values->kind)=n AND r.expected_delta_count=n+1 AND r.effect='business-change'
 AND _migration.task69_document_ids(c.after_values,kind)=selected
 AND r.returned_ids=jsonb_build_object('documentId',c.document_id,'kind',kind,'newMemberIds',ids,'mappings',mapped)
 AND r.source_occurrences=jsonb_build_array(jsonb_build_object('source',a.entry_text::jsonb->'source','field',kind,'mappings',mapped));
END $$;
CREATE FUNCTION _migration.task69_document_receipt_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF _migration.task69_document_receipt_valid(NEW.receipt_id) IS NOT TRUE THEN RAISE EXCEPTION 'Task69 document receipt differs from exact field approval';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER task69_document_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_document_receipt_complete();
CREATE CONSTRAINT TRIGGER task69_document_change_complete AFTER INSERT ON _migration.task69_document_change DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_document_receipt_complete();
CREATE OR REPLACE FUNCTION _migration.document_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE expected jsonb:=_migration.document_edit_initial_aggregate(p_id); c record; s record; v bigint; op text; patch jsonb; prior_state jsonb; next_state jsonb; boundary_version bigint;restoration uuid;
BEGIN
 expected:=_migration.task69_document_at_relationship_boundary(expected);
 SELECT version INTO boundary_version FROM _migration.task69_document_relationship_boundary WHERE document_id=p_id;
 v:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.document_edit_change WHERE document_id=p_id ORDER BY version LOOP
  prior_state:=_migration.task69_document_at_relationship_boundary(c.before_values);
  next_state:=_migration.task69_document_at_relationship_boundary(c.after_values);
  SELECT receipt_id INTO restoration FROM _migration.task69_document_change WHERE document_id=p_id AND version=c.version;
  IF restoration IS NOT NULL THEN
   IF c.version<>v OR prior_state IS DISTINCT FROM expected OR _migration.task69_document_receipt_valid(restoration) IS NOT TRUE THEN RETURN false;END IF;
   expected:=next_state;v:=v+1;CONTINUE;
  END IF;
  SELECT * INTO s FROM _migration.document_edit_submission WHERE document_id=p_id AND result_version=c.version;
	  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR prior_state IS DISTINCT FROM expected
	   OR NOT _migration.tasks46_47_receipt_valid('documents',s.actor_id,s.request_payload,p_id,c.version)
	   OR s.submission_id::text<>s.request_payload->>'submission'
	   OR (next_state->>'id')::integer<>p_id OR (next_state->>'row_version')::bigint<>v
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public'
    AND e.entity_table='documents' AND e.entity_key=jsonb_build_object('id',p_id)
    AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.outcome='succeeded'
	    AND e.after_values->>'row_version'=v::text) THEN RETURN false; END IF;
	  op:=s.request_payload->>'operation';
	  IF op IN('create','update') THEN
	   BEGIN patch:=_migration.document_edit_values(s.request_payload->'values',prior_state,op='create');
	   EXCEPTION WHEN OTHERS THEN RETURN false; END;
     IF c.version>coalesce(boundary_version,0) THEN
      patch:=patch||jsonb_build_object('matter_id',CASE WHEN jsonb_array_length(_migration.task69_document_desired(prior_state,'matters',s.request_payload->'values',s.request_payload->'related'))=1 THEN _migration.task69_document_desired(prior_state,'matters',s.request_payload->'values',s.request_payload->'related')->0 ELSE 'null'::jsonb END,
       'responsible_person_id',CASE WHEN jsonb_array_length(_migration.task69_document_desired(prior_state,'people',s.request_payload->'values',s.request_payload->'related'))=1 THEN _migration.task69_document_desired(prior_state,'people',s.request_payload->'values',s.request_payload->'related')->0 ELSE 'null'::jsonb END);
     END IF;
	   IF op='create' THEN
	    IF prior_state IS NOT NULL OR NOT next_state @> patch THEN RETURN false; END IF;
	   ELSIF next_state-ARRAY['row_version','updated_at','updated_by','matters','people']
	    IS DISTINCT FROM (prior_state||patch)-ARRAY['row_version','updated_at','updated_by','matters','people'] THEN RETURN false; END IF;
	  ELSIF prior_state IS NULL OR next_state-ARRAY['row_version','updated_at','updated_by','is_archived','matters','people']
	   IS DISTINCT FROM prior_state-ARRAY['row_version','updated_at','updated_by','is_archived','matters','people']
	   OR (next_state->>'is_archived')::boolean IS DISTINCT FROM (op='archive') THEN RETURN false;
	  END IF;
  IF c.version>coalesce(boundary_version,0) AND _migration.task69_document_membership_history(prior_state,next_state,s.request_payload,c.actor_id,c.request_id) IS NOT TRUE THEN RETURN false;END IF;
  expected:=next_state; v:=v+1;
 END LOOP;
	 IF EXISTS(SELECT 1 FROM _migration.document_edit_submission sr WHERE sr.document_id=p_id
	  AND NOT EXISTS(SELECT 1 FROM _migration.document_edit_change ch WHERE ch.document_id=sr.document_id AND ch.version=sr.result_version AND ch.actor_id=sr.actor_id)) THEN RETURN false; END IF;
	 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.document_edit_aggregate(p_id) AND _migration.task69_document_compatibility(p_id);
END;
$$;
CREATE OR REPLACE FUNCTION _migration.tasks46_47_submission_correspondence_valid() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH local_receipts AS (
  SELECT 'documents'::text gateway,s.submission_id,s.actor_id,s.request_payload,
   s.document_id entity_id,s.result_version
  FROM _migration.document_edit_submission s
  UNION ALL
  SELECT 'fee_letters',s.submission_id,s.actor_id,s.request_payload,
   s.fee_letter_id,s.result_version
  FROM _migration.fee_letter_edit_submission s
  UNION ALL
  SELECT 'matter_fee_references',s.submission_id,s.actor_id,s.request_payload,
   s.matter_id,s.result_version
  FROM _migration.matter_fee_reference_submission s
 ), changes AS (
  SELECT 'documents'::text gateway,c.document_id entity_id,c.version result_version,c.actor_id
  FROM _migration.document_edit_change c WHERE NOT EXISTS(SELECT 1 FROM _migration.task69_document_change b WHERE b.document_id=c.document_id AND b.version=c.version)
  UNION ALL
  SELECT 'fee_letters',c.fee_letter_id,c.version,c.actor_id
  FROM _migration.fee_letter_edit_change c
  UNION ALL
  SELECT 'matter_fee_references',c.matter_id,c.version,c.actor_id
  FROM _migration.matter_fee_reference_change c
 )
 SELECT NOT EXISTS(
  SELECT 1 FROM local_receipts l
  WHERE NOT _migration.tasks46_47_receipt_valid(
    l.gateway,l.actor_id,l.request_payload,l.entity_id,l.result_version)
   OR NOT EXISTS(SELECT 1 FROM changes c WHERE c.gateway=l.gateway
    AND c.entity_id=l.entity_id AND c.result_version=l.result_version AND c.actor_id=l.actor_id)
  UNION ALL
  SELECT 1 FROM _migration.tasks46_47_submission_owner o
  WHERE NOT EXISTS(SELECT 1 FROM local_receipts l WHERE l.gateway=o.gateway
   AND l.submission_id=o.submission_id AND l.actor_id=o.actor_id
   AND l.entity_id=o.entity_id AND l.result_version=o.result_version
   AND l.request_payload IS NOT DISTINCT FROM o.request_payload)
  UNION ALL
  SELECT 1 FROM changes c
  WHERE NOT EXISTS(SELECT 1 FROM local_receipts l WHERE l.gateway=c.gateway
   AND l.entity_id=c.entity_id AND l.result_version=c.result_version AND l.actor_id=c.actor_id)
 ) AND NOT EXISTS(SELECT 1 FROM _migration.task69_document_change b WHERE _migration.task69_document_receipt_valid(b.receipt_id) IS NOT TRUE)
$$;
REVOKE ALL ON FUNCTION _migration.task69_document_receipt_valid(uuid),_migration.task69_document_receipt_complete() FROM PUBLIC,litigation_runtime;
COMMIT;
