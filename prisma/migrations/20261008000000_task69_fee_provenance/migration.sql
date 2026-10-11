-- Task69 S7 independent fee provenance and bounded original-work scope.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_user<>session_user OR NOT(SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>90
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20261008000000_task69_fee_provenance') THEN RAISE EXCEPTION 'Exact migration90 direct prestate required';END IF;
 IF EXISTS(SELECT 1 FROM public.fee_letters WHERE _migration.fee_letter_edit_current_valid(id) IS NOT TRUE)
 OR EXISTS(SELECT 1 FROM public.matters WHERE _migration.matter_fee_reference_current_valid(id) IS NOT TRUE) THEN RAISE EXCEPTION 'Existing independent fee history invalid';END IF;
END $$;
-- Existing relation objects are not altered. A side table records the two
-- bounded associations without rewriting any of the 231 original links.
CREATE TABLE public.fee_letter_matter_scopes(
 id integer PRIMARY KEY REFERENCES public.fee_letter_matters(id) ON DELETE RESTRICT,
 scope_kind text NOT NULL CHECK(scope_kind='BOUNDED_ORIGINAL_WORK'),
 covered_proceeding text NOT NULL CHECK(length(covered_proceeding) BETWEEN 1 AND 10000),
 original_work text NOT NULL CHECK(length(original_work) BETWEEN 1 AND 10000),
 scope_statement text NOT NULL CHECK(length(scope_statement) BETWEEN 1 AND 10000),
 excluded_stages text NOT NULL CHECK(length(excluded_stages) BETWEEN 1 AND 10000)
);
CREATE TABLE _migration.task69_fee_occurrence(
 receipt_id uuid PRIMARY KEY REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED,
 direction text NOT NULL CHECK(direction IN('FORWARD','REVERSE')),
 fee_id integer NOT NULL REFERENCES public.fee_letters(id),fee_version bigint NOT NULL CHECK(fee_version>0),
 source_contract_id integer,source_ordinal text,identifier_space text,
 source_values jsonb NOT NULL CHECK(jsonb_typeof(source_values)='object'),original_work text
);
CREATE TABLE _migration.task69_fee_association(
 receipt_id uuid NOT NULL REFERENCES _migration.task69_fee_occurrence(receipt_id) DEFERRABLE INITIALLY DEFERRED,
 position integer NOT NULL CHECK(position>0),
 forward_id integer REFERENCES public.fee_letter_matters(id),reverse_id integer REFERENCES public.matter_fee_letter_references(id),
 was_created boolean NOT NULL,
 PRIMARY KEY(receipt_id,position),UNIQUE(receipt_id,forward_id),UNIQUE(receipt_id,reverse_id),
 CHECK((forward_id IS NULL)<>(reverse_id IS NULL))
);
CREATE INDEX task69_fee_association_forward_idx ON _migration.task69_fee_association(forward_id);
CREATE INDEX task69_fee_association_reverse_idx ON _migration.task69_fee_association(reverse_id);
CREATE TABLE _migration.task69_fee_change(
 entity_table text NOT NULL CHECK(entity_table IN('fee_letters','matter_fee_letter_references')),
 entity_id integer NOT NULL,version bigint NOT NULL CHECK(version>1),
 receipt_id uuid NOT NULL UNIQUE REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED,
 PRIMARY KEY(entity_table,entity_id,version)
);
CREATE TABLE _migration.task69_fee_scope_binding(
 scope_id integer PRIMARY KEY REFERENCES public.fee_letter_matter_scopes(id) DEFERRABLE INITIALLY DEFERRED,
 receipt_id uuid NOT NULL UNIQUE REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED
);
DO $$ DECLARE tbl text;field text;BEGIN
 FOREACH tbl IN ARRAY ARRAY['task69_fee_occurrence','task69_fee_association','task69_fee_change','task69_fee_scope_binding'] LOOP
  EXECUTE format('REVOKE ALL ON _migration.%I FROM PUBLIC,litigation_runtime',tbl);
  EXECUTE format('CREATE TRIGGER task69_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.task69_immutable()',tbl);
 END LOOP;
 INSERT INTO public.audit_event_table_rules VALUES('public','fee_letter_matter_scopes','record',ARRAY['id']);
 FOREACH field IN ARRAY ARRAY['id','scope_kind','covered_proceeding','original_work','scope_statement','excluded_stages'] LOOP
  INSERT INTO public.audit_event_fields(entity_schema,entity_table,field_name,max_text_characters,capture_mode,classification_reason) VALUES('public','fee_letter_matter_scopes',field,CASE WHEN field='id' THEN 0 ELSE 2048 END,CASE WHEN field='id' THEN 'entity_key' ELSE 'value' END,'task69_fee_bounded_scope');
 END LOOP;
END $$;
REVOKE ALL ON public.fee_letter_matter_scopes FROM PUBLIC,litigation_runtime;
GRANT SELECT ON public.fee_letter_matter_scopes TO litigation_runtime;
CREATE TRIGGER scope_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.fee_letter_matter_scopes FOR EACH STATEMENT EXECUTE FUNCTION _migration.task69_immutable();
CREATE TRIGGER audit_event_capture AFTER INSERT ON public.fee_letter_matter_scopes FOR EACH ROW EXECUTE FUNCTION public.audit_capture_row_event();
ALTER TABLE _migration.task69_delta DROP CONSTRAINT task69_delta_entity_table_check;
ALTER TABLE _migration.task69_delta ADD CONSTRAINT task69_delta_entity_table_check CHECK(entity_table IN('matters','matter_parties','matter_party_roles','matter_lawyers','admin_tasks','task_actions','powers_of_attorney','power_of_attorney_lawyers','documents','fee_letters','fee_letter_matters','matter_fee_letter_references','lookup_party_role','lookup_court','lookup_matter_destination','admin_task_assignees','document_matters','document_responsible_people','fee_letter_matter_scopes'));
CREATE FUNCTION _migration.task69_fee_at_version(p_id integer,p_version bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN p_version=1 THEN _migration.fee_letter_edit_initial_aggregate(p_id) ELSE (SELECT after_values FROM _migration.fee_letter_edit_change WHERE fee_letter_id=p_id AND version=p_version) END
$$;
CREATE FUNCTION public.fee_letter_link_provenance(p_table text,p_id integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_table NOT IN('fee_letter_matters','matter_fee_letter_references') THEN RAISE EXCEPTION 'Exact fee relationship direction required';END IF;
 RETURN jsonb_build_object('occurrences',coalesce((SELECT jsonb_agg(jsonb_build_object('sourceKey',o.source_values->'src_record_key','reference',CASE WHEN o.direction='FORWARD' THEN o.source_values->'matter_ref_raw' ELSE o.source_values->'reference_raw' END,'sourceOrdinal',o.source_ordinal,'memberPosition',a.position,'identifierSpace',o.identifier_space,'sourceContractId',o.source_contract_id,'originalWork',o.original_work) ORDER BY o.source_ordinal::integer NULLS LAST,a.position,o.receipt_id) FROM _migration.task69_fee_association a JOIN _migration.task69_fee_occurrence o USING(receipt_id) WHERE CASE WHEN p_table='fee_letter_matters' THEN a.forward_id ELSE a.reverse_id END=p_id),'[]'),
 'scope',CASE WHEN p_table='fee_letter_matters' THEN (SELECT to_jsonb(s)-'id' FROM public.fee_letter_matter_scopes s WHERE s.id=p_id) END);
END $$;
REVOKE ALL ON FUNCTION public.fee_letter_link_provenance(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fee_letter_link_provenance(text,integer) TO litigation_runtime;
CREATE FUNCTION _migration.task69_fee_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE r _migration.task69_receipt%ROWTYPE;a _migration.task69_allowlist%ROWTYPE;o _migration.task69_fee_occurrence%ROWTYPE;
 c record;binding _migration.task69_fee_change%ROWTYPE;delta _migration.task69_delta%ROWTYPE;assoc _migration.task69_fee_association%ROWTYPE;
 payload jsonb;src jsonb;selected jsonb;expected_new jsonb;fee integer;direction text;baseline jsonb;parent jsonb;expected jsonb;members jsonb;member jsonb;target jsonb;ids jsonb:='[]';maps jsonb:='[]';scope jsonb;scope_delta _migration.task69_delta%ROWTYPE;idx integer:=0;new_count integer:=0;delta_count integer:=0;next_order integer;link integer;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE receipt_id=p_receipt;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=r.operation_id AND issue_id=r.issue_id;
 IF a.stage<>'S7-fee-provenance' OR r.phase='compensate' THEN RETURN true;END IF;
 payload:=a.payload_text::jsonb;src:=a.entry_text::jsonb->'source';direction:=payload->>'direction';
 IF direction NOT IN('FORWARD','REVERSE') OR payload->'synchronizeOtherDirection'<>'false'::jsonb THEN RETURN false;END IF;
 fee:=coalesce((payload->>'feeId')::integer,(payload->'mapping'->>'fee_letter_id')::integer);
 selected:=CASE WHEN direction='FORWARD' THEN coalesce(payload->'matterIds',payload->'mapping'->'matter_ids') ELSE jsonb_build_array(payload->'mapping'->'matter_id') END;
 expected_new:=coalesce(payload->'newMatterIds',selected);
 IF jsonb_typeof(selected)<>'array' OR jsonb_array_length(selected)<>(SELECT count(DISTINCT x) FROM jsonb_array_elements(selected) x) THEN RETURN false;END IF;
 SELECT * INTO o FROM _migration.task69_fee_occurrence WHERE receipt_id=p_receipt;
 IF NOT FOUND OR o.direction<>direction OR o.fee_id<>fee OR o.source_values IS DISTINCT FROM src THEN RETURN false;END IF;
 baseline:=_migration.task69_fee_at_version(fee,o.fee_version);parent:=baseline->'feeLetter';
 IF baseline IS NULL OR o.original_work IS DISTINCT FROM parent->>'contract_details' OR o.source_contract_id IS DISTINCT FROM (parent->>'contract_id')::integer
 OR (payload ? 'originalWork' AND payload->'originalWork' IS DISTINCT FROM parent->'contract_details') THEN RETURN false;END IF;
 IF direction='FORWARD' THEN
  IF o.identifier_space IS DISTINCT FROM 'contract_id' OR o.source_ordinal IS DISTINCT FROM src->>'ordinal_raw'
   OR o.source_contract_id IS DISTINCT FROM (src->>'parent_contract_id_raw')::integer THEN RETURN false;END IF;
  members:=baseline->'covered';SELECT coalesce(max(coalesce((x->>'current_order')::integer,(x->>'ordinal')::integer+1)),0) INTO next_order FROM jsonb_array_elements(members) x;
 ELSE
  IF o.identifier_space IS DISTINCT FROM src->>'identifier_space' OR o.source_ordinal IS NOT NULL THEN RETURN false;END IF;
 END IF;
 SELECT * INTO binding FROM _migration.task69_fee_change WHERE receipt_id=p_receipt;
 IF FOUND THEN
  IF direction='FORWARD' THEN
   SELECT * INTO c FROM _migration.fee_letter_edit_change WHERE fee_letter_id=binding.entity_id AND version=binding.version;
   IF NOT FOUND OR binding.entity_table<>'fee_letters' OR binding.entity_id<>fee OR c.before_values IS DISTINCT FROM baseline OR c.version<>o.fee_version+1 THEN RETURN false;END IF;
  ELSE
   SELECT * INTO c FROM _migration.matter_fee_reference_change WHERE matter_id=binding.entity_id AND version=binding.version;
   IF NOT FOUND OR binding.entity_table<>'matter_fee_letter_references' OR binding.entity_id<>(selected->>0)::integer OR c.version<>(c.before_values->>'version')::bigint+1 THEN RETURN false;END IF;
   members:=c.before_values->'references';
  END IF;
  IF c.actor_id<>r.actor_id OR c.request_id<>r.request_id THEN RETURN false;END IF;
 END IF;
 FOR target IN SELECT value FROM jsonb_array_elements(selected) LOOP
  idx:=idx+1;SELECT * INTO assoc FROM _migration.task69_fee_association WHERE receipt_id=p_receipt AND position=idx;
  IF NOT FOUND OR assoc.was_created IS DISTINCT FROM (expected_new @> jsonb_build_array(target)) THEN RETURN false;END IF;
  link:=CASE WHEN direction='FORWARD' THEN assoc.forward_id ELSE assoc.reverse_id END;
  IF link IS NULL THEN RETURN false;END IF;
  IF assoc.was_created THEN
   new_count:=new_count+1;SELECT * INTO delta FROM _migration.task69_delta WHERE receipt_id=p_receipt AND entity_table=CASE WHEN direction='FORWARD' THEN 'fee_letter_matters' ELSE 'matter_fee_letter_references' END AND entity_key=jsonb_build_object('id',link);
   IF NOT FOUND OR delta.before_values IS NOT NULL OR delta.after_values->'matter_id' IS DISTINCT FROM target OR delta.after_values->'fee_letter_id' IS DISTINCT FROM to_jsonb(fee) OR delta.after_values->'is_retired'<>'false'::jsonb THEN RETURN false;END IF;
   member:=delta.after_values;
   IF direction='FORWARD' THEN
    next_order:=next_order+1;
    expected:=jsonb_build_object('fee_letter_id',fee,'matter_id',target,'is_retired',false,'current_order',next_order,'ordinal',NULL,'legacy_matter_ref',NULL,'legacy_parent_contract_id_raw',NULL,'legacy_source_record_key',NULL,'legacy_source_extraction_sha256',NULL,'legacy_source_payload',NULL);
   ELSE
    expected:=jsonb_build_object('fee_letter_id',fee,'matter_id',target,'is_retired',false,'identifier_space',src->'identifier_space','legacy_reference_raw',src->'reference_raw','legacy_source_record_key',src->'src_record_key','legacy_source_extraction_sha256',src->'extraction_sha256','legacy_source_payload',src->'source_payload');
   END IF;
   IF member-ARRAY['id','created_at','created_by','updated_at','updated_by'] IS DISTINCT FROM expected THEN RETURN false;END IF;
   members:=members||jsonb_build_array(member);ids:=ids||jsonb_build_array(link);delta_count:=delta_count+1;
  ELSE
   SELECT x INTO member FROM jsonb_array_elements(members) x WHERE x->'id'=to_jsonb(link);
   IF member IS NULL OR member->'matter_id' IS DISTINCT FROM target OR member->'fee_letter_id' IS DISTINCT FROM to_jsonb(fee) OR member->'is_retired'<>'false'::jsonb THEN RETURN false;END IF;
  END IF;
  maps:=maps||jsonb_build_array(jsonb_build_object('memberId',link,'matterId',target,'sourcePosition',idx,'created',assoc.was_created));
  IF payload->>'scope'='BOUNDED_ORIGINAL_WORK' THEN
   IF NOT assoc.was_created OR direction<>'FORWARD' THEN RETURN false;END IF;
   SELECT to_jsonb(s) INTO scope FROM public.fee_letter_matter_scopes s JOIN _migration.task69_fee_scope_binding b ON b.scope_id=s.id WHERE s.id=link AND b.receipt_id=p_receipt;
   expected:=jsonb_build_object('id',link,'scope_kind','BOUNDED_ORIGINAL_WORK','covered_proceeding',payload->'coveredProceeding','original_work',payload->'originalWork','scope_statement',payload->'approvedAction','excluded_stages',payload->'excludedStages');
   IF scope IS DISTINCT FROM expected THEN RETURN false;END IF;
   SELECT * INTO scope_delta FROM _migration.task69_delta WHERE receipt_id=p_receipt AND entity_table='fee_letter_matter_scopes' AND entity_key=jsonb_build_object('id',link);
   IF NOT FOUND OR scope_delta.before_values IS NOT NULL OR scope_delta.after_values IS DISTINCT FROM scope THEN RETURN false;END IF;
   delta_count:=delta_count+1;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM _migration.task69_fee_association WHERE receipt_id=p_receipt)<>idx OR (SELECT count(*) FROM _migration.task69_fee_scope_binding WHERE receipt_id=p_receipt)<>(CASE WHEN payload->>'scope'='BOUNDED_ORIGINAL_WORK' THEN 1 ELSE 0 END) THEN RETURN false;END IF;
 IF new_count>0 THEN
  IF binding.receipt_id IS NULL THEN RETURN false;END IF;
  SELECT jsonb_agg(x ORDER BY (x->>'id')::integer) INTO members FROM jsonb_array_elements(members) x;
  IF direction='FORWARD' THEN
   SELECT * INTO delta FROM _migration.task69_delta WHERE receipt_id=p_receipt AND entity_table='fee_letters' AND entity_key=jsonb_build_object('id',fee);
   IF NOT FOUND OR delta.before_values IS DISTINCT FROM parent OR delta.after_values IS DISTINCT FROM c.after_values->'feeLetter'
    OR delta.after_values-ARRAY['row_version','updated_at','updated_by'] IS DISTINCT FROM parent-ARRAY['row_version','updated_at','updated_by']
    OR (delta.after_values->>'row_version')::bigint<>c.version OR c.after_values->'covered' IS DISTINCT FROM members THEN RETURN false;END IF;
   delta_count:=delta_count+1;
  ELSE
   IF c.after_values IS DISTINCT FROM jsonb_build_object('matterId',binding.entity_id,'version',binding.version::text,'references',members) THEN RETURN false;END IF;
  END IF;
 ELSIF binding.receipt_id IS NOT NULL THEN RETURN false;END IF;
 RETURN r.expected_delta_count=delta_count AND r.effect=CASE WHEN delta_count=0 THEN 'no-business-write' ELSE 'business-change' END
 AND r.returned_ids=jsonb_build_object('feeId',fee,'direction',direction,'newMemberIds',ids,'mappings',maps)
 AND r.source_occurrences=jsonb_build_array(jsonb_build_object('source',src,'direction',direction,'mappings',maps));
END $$;
CREATE FUNCTION _migration.task69_fee_receipt_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF _migration.task69_fee_receipt_valid(NEW.receipt_id) IS NOT TRUE THEN RAISE EXCEPTION 'Task69 independent fee receipt differs from approved source and scope';END IF;RETURN NULL;
END $$;
CREATE FUNCTION _migration.task69_fee_scope_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE receipt uuid;
BEGIN
 SELECT receipt_id INTO receipt FROM _migration.task69_fee_scope_binding WHERE scope_id=NEW.id;
 IF receipt IS NULL OR _migration.task69_fee_receipt_valid(receipt) IS NOT TRUE THEN RAISE EXCEPTION 'Bounded fee scope lacks exact approved receipt';END IF;RETURN NULL;
END $$;
DO $$ DECLARE tbl text;BEGIN
 FOREACH tbl IN ARRAY ARRAY['task69_receipt','task69_fee_occurrence','task69_fee_association','task69_fee_change','task69_fee_scope_binding'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER task69_fee_receipt_complete AFTER INSERT ON _migration.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_fee_receipt_complete()',tbl);
 END LOOP;
END $$;
CREATE CONSTRAINT TRIGGER task69_fee_scope_complete AFTER INSERT ON public.fee_letter_matter_scopes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_fee_scope_complete();
-- Exact existing gateway/history function replacements appended by builder.

CREATE OR REPLACE FUNCTION _migration.fee_letter_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE expected jsonb:=_migration.fee_letter_edit_initial_aggregate(p_id); c record; s record; restoration uuid; v bigint;
 op text; patch jsonb; member integer; matter integer; before_member jsonb; after_member jsonb;
BEGIN
 v:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.fee_letter_edit_change WHERE fee_letter_id=p_id ORDER BY version LOOP
  SELECT receipt_id INTO restoration FROM _migration.task69_fee_change WHERE entity_table='fee_letters' AND entity_id=p_id AND version=c.version;
  IF restoration IS NOT NULL THEN
   IF c.version<>v OR c.before_values IS DISTINCT FROM expected OR _migration.task69_fee_receipt_valid(restoration) IS NOT TRUE THEN RETURN false;END IF;
   expected:=c.after_values;v:=v+1;CONTINUE;
  END IF;
  SELECT * INTO s FROM _migration.fee_letter_edit_submission WHERE fee_letter_id=p_id AND result_version=c.version;
	  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR c.before_values IS DISTINCT FROM expected
	   OR NOT _migration.tasks46_47_receipt_valid('fee_letters',s.actor_id,s.request_payload,p_id,c.version)
	   OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR (c.after_values->'feeLetter'->>'id')::integer<>p_id
   OR (c.after_values->'feeLetter'->>'row_version')::bigint<>v
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public'
    AND e.entity_table='fee_letters' AND e.entity_key=jsonb_build_object('id',p_id)
    AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.outcome='succeeded'
	    AND e.after_values->>'row_version'=v::text) THEN RETURN false; END IF;
	  op:=s.request_payload->>'operation';
	  IF op IN('create','update') THEN
	   BEGIN patch:=_migration.fee_letter_edit_values(s.request_payload->'values',c.before_values->'feeLetter',op='create');
	   EXCEPTION WHEN OTHERS THEN RETURN false; END;
	   IF op='create' THEN
	    IF c.before_values IS NOT NULL OR NOT c.after_values->'feeLetter' @> patch OR c.after_values->'covered'<>'[]' THEN RETURN false; END IF;
	   ELSIF c.after_values->'covered' IS DISTINCT FROM c.before_values->'covered'
	    OR (c.after_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by']
	    IS DISTINCT FROM ((c.before_values->'feeLetter')||patch)-ARRAY['row_version','updated_at','updated_by'] THEN RETURN false; END IF;
	  ELSIF op IN('archive','restore') THEN
	   IF c.after_values->'covered' IS DISTINCT FROM c.before_values->'covered'
	    OR (c.after_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by','is_archived']
	    IS DISTINCT FROM (c.before_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by','is_archived']
	    OR (c.after_values->'feeLetter'->>'is_archived')::boolean IS DISTINCT FROM (op='archive') THEN RETURN false; END IF;
	  ELSE
	   member:=(s.request_payload->'related'->>'membershipId')::integer;
	   matter:=(s.request_payload->'related'->>'matterId')::integer;
	   IF (c.after_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by']
	    IS DISTINCT FROM (c.before_values->'feeLetter')-ARRAY['row_version','updated_at','updated_by'] THEN RETURN false; END IF;
	   IF op='covered-add' THEN
	    IF member IS NOT NULL OR matter IS NULL
	     OR jsonb_array_length(c.after_values->'covered')<>coalesce(jsonb_array_length(c.before_values->'covered'),0)+1
	     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'covered') e
	      WHERE (e->>'matter_id')::integer=matter AND NOT (e->>'is_retired')::boolean AND e->>'legacy_source_record_key' IS NULL)
	     OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'covered') b
	      WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'covered') a WHERE a IS NOT DISTINCT FROM b)) THEN RETURN false; END IF;
	   ELSE
	    SELECT e INTO before_member FROM jsonb_array_elements(c.before_values->'covered') e WHERE (e->>'id')::integer=member;
	    SELECT e INTO after_member FROM jsonb_array_elements(c.after_values->'covered') e WHERE (e->>'id')::integer=member;
	    IF member IS NULL OR before_member IS NULL OR after_member IS NULL
	     OR jsonb_array_length(c.after_values->'covered')<>jsonb_array_length(c.before_values->'covered')
	     OR before_member-ARRAY['is_retired','updated_at','updated_by']
	      IS DISTINCT FROM after_member-ARRAY['is_retired','updated_at','updated_by']
	     OR (before_member->>'is_retired')::boolean IS DISTINCT FROM (op='covered-restore')
	     OR (after_member->>'is_retired')::boolean IS DISTINCT FROM (op='covered-retire')
	     OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'covered') b
	      WHERE (b->>'id')::integer<>member AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'covered') a WHERE a IS NOT DISTINCT FROM b)) THEN RETURN false; END IF;
	   END IF;
	  END IF;
  expected:=c.after_values; v:=v+1;
 END LOOP;
	 IF EXISTS(SELECT 1 FROM _migration.fee_letter_edit_submission sr WHERE sr.fee_letter_id=p_id
	  AND NOT EXISTS(SELECT 1 FROM _migration.fee_letter_edit_change ch WHERE ch.fee_letter_id=sr.fee_letter_id AND ch.version=sr.result_version AND ch.actor_id=sr.actor_id)) THEN RETURN false; END IF;
	 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.fee_letter_edit_aggregate(p_id);
END;
$$;

CREATE OR REPLACE FUNCTION _migration.matter_fee_reference_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE expected jsonb:=_migration.matter_fee_reference_initial_aggregate(p_id); c record; s record; restoration uuid; v bigint:=2;
 op text; old_fee integer; new_fee integer; before_current integer; after_current integer;
 before_active integer; after_active integer; before_count integer; after_count integer;
 before_old jsonb; after_old jsonb; before_new jsonb; after_new jsonb;
BEGIN
 FOR c IN SELECT * FROM _migration.matter_fee_reference_change WHERE matter_id=p_id ORDER BY version LOOP
  SELECT receipt_id INTO restoration FROM _migration.task69_fee_change WHERE entity_table='matter_fee_letter_references' AND entity_id=p_id AND version=c.version;
  IF restoration IS NOT NULL THEN
   IF c.version<>v OR c.before_values IS DISTINCT FROM expected OR _migration.task69_fee_receipt_valid(restoration) IS NOT TRUE THEN RETURN false;END IF;
   expected:=c.after_values;v:=v+1;CONTINUE;
  END IF;
  SELECT * INTO s FROM _migration.matter_fee_reference_submission WHERE matter_id=p_id AND result_version=c.version;
	  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR c.before_values IS DISTINCT FROM expected
	   OR NOT _migration.tasks46_47_receipt_valid('matter_fee_references',s.actor_id,s.request_payload,p_id,c.version)
	   OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR c.after_values->>'matterId'<>p_id::text OR c.after_values->>'version'<>v::text
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public'
    AND e.entity_table='matter_fee_letter_references' AND e.actor_id=c.actor_id
	    AND e.request_id=c.request_id AND e.outcome='succeeded') THEN RETURN false; END IF;
	  op:=s.request_payload->>'operation'; old_fee:=(s.request_payload->'related'->>'oldFeeLetterId')::integer;
	  new_fee:=(s.request_payload->'related'->>'newFeeLetterId')::integer;
	  IF jsonb_typeof(c.before_values->'references')<>'array'
	   OR jsonb_typeof(c.after_values->'references')<>'array'
	   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'references') e
	    WHERE jsonb_typeof(e)<>'object' OR (e->>'matter_id')::integer IS DISTINCT FROM p_id)
	   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'references') e
	    WHERE jsonb_typeof(e)<>'object' OR (e->>'matter_id')::integer IS DISTINCT FROM p_id)
	   OR (SELECT count(*) FROM jsonb_array_elements(c.before_values->'references'))
	      IS DISTINCT FROM (SELECT count(DISTINCT (e->>'id')::integer) FROM jsonb_array_elements(c.before_values->'references') e)
	   OR (SELECT count(*) FROM jsonb_array_elements(c.after_values->'references'))
	      IS DISTINCT FROM (SELECT count(DISTINCT (e->>'id')::integer) FROM jsonb_array_elements(c.after_values->'references') e)
	   OR (SELECT count(*) FROM jsonb_array_elements(c.before_values->'references'))
	      IS DISTINCT FROM (SELECT count(DISTINCT (e->>'fee_letter_id')::integer) FROM jsonb_array_elements(c.before_values->'references') e)
	   OR (SELECT count(*) FROM jsonb_array_elements(c.after_values->'references'))
	      IS DISTINCT FROM (SELECT count(DISTINCT (e->>'fee_letter_id')::integer) FROM jsonb_array_elements(c.after_values->'references') e)
	  THEN RETURN false; END IF;
	  SELECT count(*)::integer,min((e->>'fee_letter_id')::integer)
	   INTO before_active,before_current FROM jsonb_array_elements(c.before_values->'references') e
	   WHERE NOT (e->>'is_retired')::boolean;
	  SELECT count(*)::integer,min((e->>'fee_letter_id')::integer)
	   INTO after_active,after_current FROM jsonb_array_elements(c.after_values->'references') e
	   WHERE NOT (e->>'is_retired')::boolean;
	  SELECT count(*)::integer INTO before_count FROM jsonb_array_elements(c.before_values->'references');
	  SELECT count(*)::integer INTO after_count FROM jsonb_array_elements(c.after_values->'references');
	  SELECT e INTO before_old FROM jsonb_array_elements(c.before_values->'references') e
	   WHERE (e->>'fee_letter_id')::integer=old_fee;
	  SELECT e INTO after_old FROM jsonb_array_elements(c.after_values->'references') e
	   WHERE (e->>'fee_letter_id')::integer=old_fee;
	  SELECT e INTO before_new FROM jsonb_array_elements(c.before_values->'references') e
	   WHERE (e->>'fee_letter_id')::integer=new_fee;
	  SELECT e INTO after_new FROM jsonb_array_elements(c.after_values->'references') e
	   WHERE (e->>'fee_letter_id')::integer=new_fee;
	  IF (op='set' AND (old_fee IS NOT NULL OR new_fee IS NULL OR before_active<>0
	      OR after_active<>1 OR after_current IS DISTINCT FROM new_fee))
	   OR (op='clear' AND (old_fee IS NULL OR new_fee IS NOT NULL OR before_active<>1
	      OR before_current IS DISTINCT FROM old_fee OR after_active<>0))
	   OR (op='replace' AND (old_fee IS NULL OR new_fee IS NULL OR old_fee=new_fee
	      OR before_active<>1 OR before_current IS DISTINCT FROM old_fee
	      OR after_active<>1 OR after_current IS DISTINCT FROM new_fee))
	   OR (old_fee IS NOT NULL AND (before_old IS NULL OR after_old IS NULL
	      OR (before_old->>'is_retired')::boolean
	      OR NOT (after_old->>'is_retired')::boolean
	      OR after_old-ARRAY['is_retired','updated_at','updated_by']
	         IS DISTINCT FROM before_old-ARRAY['is_retired','updated_at','updated_by']
	      OR (after_old->>'updated_by')::integer IS DISTINCT FROM c.actor_id))
	   OR (new_fee IS NOT NULL AND (after_new IS NULL OR (after_new->>'is_retired')::boolean))
	   OR (new_fee IS NOT NULL AND before_new IS NOT NULL AND (
	      NOT (before_new->>'is_retired')::boolean
	      OR after_new-ARRAY['is_retired','updated_at','updated_by']
	         IS DISTINCT FROM before_new-ARRAY['is_retired','updated_at','updated_by']
	      OR (after_new->>'updated_by')::integer IS DISTINCT FROM c.actor_id))
	   OR (new_fee IS NOT NULL AND before_new IS NULL AND (
	      after_count<>before_count+1
	      OR (after_new->>'matter_id')::integer IS DISTINCT FROM p_id
	      OR (after_new->>'fee_letter_id')::integer IS DISTINCT FROM new_fee
	      OR after_new->'identifier_space'<>'null' OR after_new->'legacy_reference_raw'<>'null'
	      OR after_new->'legacy_source_record_key'<>'null'
	      OR after_new->'legacy_source_extraction_sha256'<>'null'
	      OR after_new->'legacy_source_payload'<>'null'
	      OR (after_new->>'created_by')::integer IS DISTINCT FROM c.actor_id
	      OR (after_new->>'updated_by')::integer IS DISTINCT FROM c.actor_id))
	   OR (new_fee IS NOT NULL AND before_new IS NOT NULL AND after_count<>before_count)
	   OR (new_fee IS NULL AND after_count<>before_count)
	   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'references') b
	      WHERE (b->>'fee_letter_id')::integer IS DISTINCT FROM old_fee
	        AND (b->>'fee_letter_id')::integer IS DISTINCT FROM new_fee
	        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'references') a
	         WHERE a IS NOT DISTINCT FROM b))
	   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'references') a
	      WHERE (a->>'fee_letter_id')::integer IS DISTINCT FROM old_fee
	        AND (a->>'fee_letter_id')::integer IS DISTINCT FROM new_fee
	        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.before_values->'references') b
	         WHERE b IS NOT DISTINCT FROM a))
	  THEN RETURN false; END IF;
  expected:=c.after_values; v:=v+1;
 END LOOP;
	 IF EXISTS(SELECT 1 FROM _migration.matter_fee_reference_submission sr WHERE sr.matter_id=p_id
	  AND NOT EXISTS(SELECT 1 FROM _migration.matter_fee_reference_change ch WHERE ch.matter_id=sr.matter_id AND ch.version=sr.result_version AND ch.actor_id=sr.actor_id)) THEN RETURN false; END IF;
	 RETURN expected IS NOT DISTINCT FROM _migration.matter_fee_reference_aggregate(p_id);
END;
$$;

CREATE OR REPLACE FUNCTION _migration.tasks46_47_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE incoming jsonb; previous jsonb; allowed text[]; k text;
BEGIN
 IF current_setting('litigation.tasks46_47_gateway',true) IS DISTINCT FROM 'on'
  OR TG_OP IN('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Task 4.6/4.7 direct write or deletion refused'; END IF;
 incoming:=to_jsonb(NEW);
 allowed:=CASE TG_TABLE_NAME
  WHEN 'documents' THEN ARRAY['matter_id','client_id','description','document_date','page_count','deposit_date','responsible_person_id','movement_card','storage_location','notes','mfiles_id','row_version','is_archived']
  WHEN 'fee_letters' THEN ARRAY['client_id','mfiles_id','contract_type','contract_date','contract_details','contract_structure','row_version','is_archived']
  WHEN 'fee_letter_matters' THEN ARRAY['is_retired'] ELSE ARRAY['is_retired'] END;
 IF TG_OP='UPDATE' THEN
  previous:=to_jsonb(OLD);
  IF incoming-allowed-ARRAY['updated_at','updated_by'] IS DISTINCT FROM previous-allowed-ARRAY['updated_at','updated_by'] THEN
   RAISE EXCEPTION 'Task 4.6/4.7 identity and source evidence are immutable'; END IF;
  IF TG_TABLE_NAME IN('documents','fee_letters')
   AND (incoming->>'row_version')::bigint<>(previous->>'row_version')::bigint+1 THEN
   RAISE EXCEPTION 'Aggregate version must advance exactly once'; END IF;
 ELSE
  IF TG_TABLE_NAME='matter_fee_letter_references' AND EXISTS(
   SELECT 1 FROM _migration.task69_allowlist a WHERE a.operation_id=nullif(current_setting('litigation.task69_operation',true),'')::uuid
   AND a.issue_id=current_setting('litigation.task69_issue',true) AND a.stage='S7-fee-provenance' AND a.payload_text::jsonb->>'direction'='REVERSE'
   AND incoming->'matter_id'=a.payload_text::jsonb->'mapping'->'matter_id'
   AND incoming->'fee_letter_id'=a.payload_text::jsonb->'mapping'->'fee_letter_id'
   AND incoming->'is_retired'='false'::jsonb
   AND incoming->'identifier_space'=a.entry_text::jsonb->'source'->'identifier_space'
   AND incoming->'legacy_reference_raw'=a.entry_text::jsonb->'source'->'reference_raw'
   AND incoming->'legacy_source_record_key'=a.entry_text::jsonb->'source'->'src_record_key'
   AND incoming->'legacy_source_extraction_sha256'=a.entry_text::jsonb->'source'->'extraction_sha256'
   AND incoming->'legacy_source_payload'=a.entry_text::jsonb->'source'->'source_payload') THEN RETURN NEW;END IF;
  FOR k IN SELECT key FROM jsonb_each(incoming) WHERE key LIKE 'legacy_%'
    OR key IN('contract_id','client_name','status','ordinal','legacy_parent_contract_id_raw','identifier_space') LOOP
   IF incoming->k<>'null'::jsonb THEN RAISE EXCEPTION 'Native record cannot invent source evidence'; END IF;
  END LOOP;
  IF TG_TABLE_NAME IN('documents','fee_letters')
   AND ((incoming->>'is_archived')::boolean OR (incoming->>'row_version')::bigint<>1) THEN
   RAISE EXCEPTION 'Native aggregate starts current at version one'; END IF;
  IF TG_TABLE_NAME='fee_letter_matters' AND ((incoming->>'is_retired')::boolean
   OR (incoming->>'current_order' IS NULL AND incoming->>'legacy_source_record_key' IS NULL)) THEN
   RAISE EXCEPTION 'Native covered matter requires current order'; END IF;
  IF TG_TABLE_NAME='matter_fee_letter_references' AND (incoming->>'is_retired')::boolean THEN
   RAISE EXCEPTION 'Native matter reference starts current'; END IF;
 END IF;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fee_letter_edit_save(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; r record; receipt _migration.fee_letter_edit_submission%ROWTYPE; owner _migration.tasks46_47_submission_owner%ROWTYPE; original jsonb;
 before_state jsonb; after_state jsonb; patch jsonb; columns text; selections text; assignments text;
 op text; creating boolean; lifecycle boolean; relation boolean; old_client integer; new_client integer;
 member_id integer; target_matter integer; next_order integer; v bigint; request_id uuid;
BEGIN
 PERFORM 1 FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE;
 actor:=_migration.tasks46_47_require_account(p_account,p_session,p_role,p_expires,false);
 IF actor IS DISTINCT FROM public.audit_current_actor_id() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Fee-letter actor differs from trusted context'; END IF;
 SELECT * INTO r FROM _migration.tasks46_47_request_identity(p_request);
 op:=r.operation; creating:=op='create'; lifecycle:=op IN('archive','restore'); relation:=op IN('covered-add','covered-retire','covered-restore');
 IF op NOT IN('create','update','archive','restore','covered-add','covered-retire','covered-restore')
  OR creating<>(r.identity IS NULL) OR (lifecycle AND p_role<>'Administrator') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid fee-letter operation'; END IF;
	 PERFORM pg_advisory_xact_lock(hashtextextended(r.submission::text,4647));
	 SELECT * INTO owner FROM _migration.tasks46_47_submission_owner WHERE submission_id=r.submission;
	 IF FOUND AND (owner.actor_id<>actor OR owner.gateway<>'fee_letters' OR owner.operation<>op OR owner.request_payload IS DISTINCT FROM p_request) THEN
	  RAISE EXCEPTION USING ERRCODE=CASE WHEN owner.actor_id<>actor THEN '42501' ELSE '22023' END,MESSAGE='submission payload differs across gateway, actor, or payload';
	 END IF;
	 SELECT * INTO receipt FROM _migration.fee_letter_edit_submission WHERE submission_id=r.submission;
	 IF FOUND THEN
	  IF owner.submission_id IS NULL THEN RAISE EXCEPTION 'Fee-letter receipt has no global submission owner'; END IF;
  IF receipt.actor_id<>actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Fee-letter submission belongs to another actor'; END IF;
  IF receipt.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Fee-letter submission payload differs'; END IF;
  RETURN jsonb_build_object('id',receipt.fee_letter_id,'version',receipt.result_version::text,'changed',true);
 END IF;
 IF NOT creating THEN
  SELECT to_jsonb(f) INTO original FROM public.fee_letters f WHERE id=r.identity;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Fee letter not found'; END IF;
 END IF;
 IF lifecycle THEN
  IF p_request->'values'<>'{}' OR p_request->'related'<>'null' OR p_request->'facts' IS DISTINCT FROM _migration.fee_letter_edit_facts(r.identity) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Fee-letter version or confirmation is stale'; END IF;
  patch:=jsonb_build_object('is_archived',op='archive');
 ELSIF relation THEN
  IF p_request->'values'<>'{}' OR jsonb_typeof(p_request->'related')<>'object' OR p_request->'facts'<>'null' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid covered-matter request'; END IF;
  patch:='{}'; member_id:=(p_request->'related'->>'membershipId')::integer; target_matter:=(p_request->'related'->>'matterId')::integer;
  IF op='covered-add' AND (member_id IS NOT NULL OR NOT _migration.tasks46_47_positive(to_jsonb(target_matter),false)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid covered matter'; END IF;
  IF op<>'covered-add' AND NOT _migration.tasks46_47_positive(to_jsonb(member_id),false) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid covered membership'; END IF;
 ELSE
  IF p_request->'facts'<>'null' OR p_request->'related'<>'null' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid fee-letter edit request'; END IF;
  patch:=_migration.fee_letter_edit_values(p_request->'values',original,creating);
 END IF;
 old_client:=(original->>'client_id')::integer; new_client:=CASE WHEN patch ? 'client_id' THEN (patch->>'client_id')::integer ELSE old_client END;
 PERFORM 1 FROM public.clients WHERE id IN(SELECT DISTINCT x FROM unnest(ARRAY[old_client,new_client]) x WHERE x IS NOT NULL) ORDER BY id FOR UPDATE;
 IF old_client IS NOT NULL AND EXISTS(SELECT 1 FROM public.clients WHERE id=old_client AND is_archived) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived fee-letter client'; END IF;
 IF new_client IS NOT NULL AND EXISTS(SELECT 1 FROM public.clients WHERE id=new_client AND is_archived) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived fee-letter client'; END IF;
 IF creating AND new_client IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='New fee letter requires client'; END IF;
 IF NOT creating THEN
  SELECT to_jsonb(f) INTO original FROM public.fee_letters f WHERE id=r.identity FOR UPDATE;
  IF (original->>'row_version')::bigint<>r.expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Fee-letter version or confirmation is stale'; END IF;
  IF NOT lifecycle AND (original->>'is_archived')::boolean THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived fee letter before editing'; END IF;
  before_state:=_migration.fee_letter_edit_aggregate(r.identity);
 END IF;
 IF relation THEN
  IF op='covered-add' THEN
   PERFORM 1 FROM public.matters WHERE id=target_matter AND NOT is_archived FOR UPDATE;
   IF NOT FOUND OR EXISTS(SELECT 1 FROM public.fee_letter_matters l JOIN public.fee_letter_matter_scopes s ON s.id=l.id WHERE l.fee_letter_id=r.identity AND l.matter_id=target_matter) OR EXISTS(SELECT 1 FROM public.fee_letter_matters l WHERE l.fee_letter_id=r.identity AND l.matter_id=target_matter AND NOT l.is_retired) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid or duplicate covered matter'; END IF;
  ELSE
   SELECT l.matter_id INTO target_matter FROM public.fee_letter_matters l WHERE l.id=member_id AND l.fee_letter_id=r.identity FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Covered membership not found'; END IF;
   PERFORM 1 FROM public.matters WHERE id=target_matter AND NOT is_archived FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived covered matter'; END IF;
   IF op='covered-retire' AND (SELECT is_retired FROM public.fee_letter_matters WHERE id=member_id) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Covered membership already retired'; END IF;
   IF op='covered-restore' AND (NOT (SELECT is_retired FROM public.fee_letter_matters WHERE id=member_id)
    OR EXISTS(SELECT 1 FROM public.fee_letter_matters l WHERE l.fee_letter_id=r.identity AND l.matter_id=target_matter AND NOT l.is_retired)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Covered membership cannot be restored'; END IF;
  END IF;
 END IF;
 PERFORM _migration.tasks46_47_require_account(p_account,p_session,p_role,p_expires,lifecycle);
 IF NOT creating AND ((lifecycle AND (original->>'is_archived')::boolean=(op='archive')) OR (op='update' AND patch='{}')) THEN RETURN jsonb_build_object('id',r.identity,'version',r.expected::text,'changed',false); END IF;
 PERFORM public.audit_ensure_event_context(); PERFORM set_config('litigation.tasks46_47_gateway','on',true);
 IF creating THEN
  SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('v.%I',key),',' ORDER BY key) INTO columns,selections FROM jsonb_object_keys(patch) key;
  EXECUTE format('INSERT INTO public.fee_letters(%s,updated_at) SELECT %s,statement_timestamp() FROM jsonb_populate_record(NULL::public.fee_letters,$1) v RETURNING id',columns,selections) INTO r.identity USING patch;
 ELSIF relation THEN
  IF op='covered-add' THEN
   SELECT coalesce(max(coalesce(current_order,ordinal+1)),0)+1 INTO next_order FROM public.fee_letter_matters WHERE fee_letter_id=r.identity;
   INSERT INTO public.fee_letter_matters(fee_letter_id,matter_id,current_order) VALUES(r.identity,target_matter,next_order);
  ELSIF op='covered-retire' THEN UPDATE public.fee_letter_matters SET is_retired=true WHERE id=member_id;
  ELSE UPDATE public.fee_letter_matters SET is_retired=false WHERE id=member_id; END IF;
  UPDATE public.fee_letters SET row_version=row_version+1 WHERE id=r.identity;
 ELSE
  SELECT string_agg(format('%I=v.%I',key,key),',' ORDER BY key) INTO assignments FROM jsonb_object_keys(patch) key;
  EXECUTE format('UPDATE public.fee_letters f SET %srow_version=f.row_version+1 FROM jsonb_populate_record(NULL::public.fee_letters,$1) v WHERE f.id=$2',CASE WHEN assignments IS NULL THEN '' ELSE assignments||',' END) USING original||patch,r.identity;
 END IF;
 IF lifecycle THEN PERFORM public.audit_append_semantic_event(op,'succeeded','public','fee_letters',jsonb_build_object('id',r.identity),NULL,NULL,NULL,'{}',NULL,'{}'); END IF;
 SELECT row_version INTO v FROM public.fee_letters WHERE id=r.identity; after_state:=_migration.fee_letter_edit_aggregate(r.identity);
 request_id:=current_setting('litigation.audit_request_id')::uuid;
 INSERT INTO _migration.fee_letter_edit_change VALUES(r.identity,v,actor,before_state,after_state,request_id);
	 INSERT INTO _migration.tasks46_47_submission_owner(submission_id,actor_id,gateway,operation,entity_id,request_payload,result_version) VALUES(r.submission,actor,'fee_letters',op,r.identity,p_request,v);
	 INSERT INTO _migration.fee_letter_edit_submission(submission_id,actor_id,request_payload,fee_letter_id,result_version) VALUES(r.submission,actor,p_request,r.identity,v);
 RETURN jsonb_build_object('id',r.identity,'version',v::text,'changed',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.fee_letter_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_id integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE record jsonb;
BEGIN
 PERFORM _migration.tasks46_47_read_account(p_account,p_session,p_role,p_expires,false);
 IF p_id IS NOT NULL THEN
  SELECT jsonb_build_object('id',f.id,'version',f.row_version::text,'archived',f.is_archived,
   'values',to_jsonb(f),'facts',_migration.fee_letter_edit_facts(f.id),
   'covered',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'matterId',l.matter_id,
    'retired',l.is_retired,'order',coalesce(l.current_order,l.ordinal+1),'scope',public.fee_letter_link_provenance('fee_letter_matters',l.id)->'scope','original',l.legacy_source_record_key IS NOT NULL OR jsonb_array_length(public.fee_letter_link_provenance('fee_letter_matters',l.id)->'occurrences')>0)
    ORDER BY coalesce(l.current_order,l.ordinal+1),l.id),'[]') FROM public.fee_letter_matters l WHERE l.fee_letter_id=f.id)) INTO record
  FROM public.fee_letters f WHERE f.id=p_id;
  IF record IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Fee letter not found'; END IF;
 END IF;
 RETURN jsonb_build_object('record',record,
  'clients',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name_ar,'active',NOT is_archived) ORDER BY name_ar COLLATE "arabic",id),'[]') FROM public.clients),
  'matters',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',case_number_ar,'active',NOT is_archived) ORDER BY case_number_ar COLLATE "arabic",id),'[]') FROM public.matters));
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
  FROM _migration.fee_letter_edit_change c WHERE NOT EXISTS(SELECT 1 FROM _migration.task69_fee_change b WHERE b.entity_table='fee_letters' AND b.entity_id=c.fee_letter_id AND b.version=c.version)
  UNION ALL
  SELECT 'matter_fee_references',c.matter_id,c.version,c.actor_id
  FROM _migration.matter_fee_reference_change c WHERE NOT EXISTS(SELECT 1 FROM _migration.task69_fee_change b WHERE b.entity_table='matter_fee_letter_references' AND b.entity_id=c.matter_id AND b.version=c.version)
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
 ) AND NOT EXISTS(SELECT 1 FROM _migration.task69_document_change b WHERE _migration.task69_document_receipt_valid(b.receipt_id) IS NOT TRUE) AND NOT EXISTS(SELECT 1 FROM _migration.task69_fee_change b WHERE _migration.task69_fee_receipt_valid(b.receipt_id) IS NOT TRUE)
$$;

CREATE OR REPLACE FUNCTION _migration.audit_history_in_scope(e public.audit_events,p_table text,p_id text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE field text; party text;
BEGIN
 IF p_table IS NULL THEN RETURN true; END IF;
 IF e.entity_table='fee_letter_matter_scopes' AND e.entity_schema='public' THEN
  IF p_table='fee_letter_matters' THEN RETURN e.entity_key->>'id'=p_id;END IF;
  IF p_table IN('fee_letters','matters') THEN RETURN _migration.audit_history_parent('fee_letter_matters',e.entity_key->>'id',CASE WHEN p_table='fee_letters' THEN 'fee_letter_id' ELSE 'matter_id' END)=p_id;END IF;
 END IF;
 IF e.entity_schema='public' AND e.entity_table=p_table AND e.entity_key->>'id'=p_id THEN RETURN true; END IF;
 field:=CASE
  WHEN p_table='documents' AND e.entity_table IN('document_matters','document_responsible_people') THEN 'document_id'
  WHEN p_table='clients' AND e.entity_table IN('contacts','client_logos') THEN 'client_id'
  WHEN p_table='matters' AND e.entity_table IN('document_matters','matter_lawyers','matter_parties','matter_fee_letter_references','fee_letter_matters') THEN 'matter_id'
  WHEN p_table='hearings' AND e.entity_table='hearing_attendees' THEN 'hearing_id'
  WHEN p_table='admin_tasks' AND e.entity_table IN('task_actions','admin_task_assignees') THEN 'task_id'
  WHEN p_table='powers_of_attorney' AND e.entity_table='power_of_attorney_lawyers' THEN 'power_of_attorney_id'
  WHEN p_table='fee_letters' AND e.entity_table IN('fee_letter_matters','matter_fee_letter_references') THEN 'fee_letter_id'
  WHEN p_table='invoices' AND e.entity_table IN('invoice_allocations','payments') THEN 'invoice_id'
  WHEN p_table='people' AND e.entity_table IN('document_responsible_people','person_name_alias','user_accounts','admin_task_assignees') THEN 'person_id'
  WHEN p_table='matter_parties' AND e.entity_table='matter_party_roles' THEN 'party_id' END;
 IF field IS NOT NULL THEN RETURN p_id=ANY(_migration.audit_history_association(e,field)); END IF;
 IF p_table='matters' AND e.entity_table='matter_party_roles' THEN
  FOREACH party IN ARRAY _migration.audit_history_association(e,'party_id') LOOP
   IF _migration.audit_history_parent('matter_parties',party,'matter_id')=p_id
    OR EXISTS(SELECT 1 FROM public.audit_events h WHERE h.entity_table='matter_parties' AND h.entity_key->>'id'=party
      AND (h.before_values->>'matter_id'=p_id OR h.after_values->>'matter_id'=p_id)) THEN RETURN true; END IF;
  END LOOP;
 END IF;
 RETURN false;
END;
$$;

DO $$ DECLARE routine record;BEGIN
 FOR routine IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='_migration' AND p.proname LIKE 'task69_fee_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',routine.signature);END LOOP;
END $$;
COMMIT;
