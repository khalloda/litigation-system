-- Task69 S5 exact POA membership and separate full-cell display order.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>87
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20261007210000_task69_poa_restoration') THEN RAISE EXCEPTION 'Exact migration87 direct prestate required'; END IF;
END $$;
ALTER TABLE public.power_of_attorney_lawyers ADD CONSTRAINT task69_poa_source_complete CHECK(coalesce(
 (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_lawyers_raw IS NULL AND reviewed_rule_id IS NULL AND source_member_ordinal IS NULL)
 OR (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$' AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$' AND legacy_lawyers_raw IS NOT NULL
 AND (source_member_ordinal>0 OR (source_member_ordinal IS NULL AND reviewed_rule_id IS NULL AND current_order>0))),false));
CREATE TABLE _migration.task69_poa_order(
 member_id integer PRIMARY KEY REFERENCES public.power_of_attorney_lawyers(id) ON DELETE RESTRICT,
 poa_id integer NOT NULL REFERENCES public.powers_of_attorney(id) ON DELETE RESTRICT,
 position integer NOT NULL CHECK(position>0),
 receipt_id uuid NOT NULL REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED,
 UNIQUE(poa_id,position)
);
CREATE TABLE _migration.task69_poa_change(
 poa_id integer NOT NULL,version bigint NOT NULL,
 receipt_id uuid NOT NULL UNIQUE REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED,
 PRIMARY KEY(poa_id,version),FOREIGN KEY(poa_id,version) REFERENCES _migration.poa_edit_change(poa_id,version) DEFERRABLE INITIALLY DEFERRED
);
REVOKE ALL ON _migration.task69_poa_order,_migration.task69_poa_change FROM PUBLIC,litigation_runtime;
CREATE TRIGGER task69_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.task69_poa_order FOR EACH STATEMENT EXECUTE FUNCTION _migration.task69_immutable();
CREATE TRIGGER task69_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.task69_poa_change FOR EACH STATEMENT EXECUTE FUNCTION _migration.task69_immutable();
CREATE FUNCTION public.poa_member_display_order(p_member integer) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(o.position,l.current_order,l.source_member_ordinal) FROM public.power_of_attorney_lawyers l LEFT JOIN _migration.task69_poa_order o ON o.member_id=l.id AND o.poa_id=l.power_of_attorney_id WHERE l.id=p_member
$$;
REVOKE ALL ON FUNCTION public.poa_member_display_order(integer) FROM PUBLIC,litigation_runtime;
GRANT EXECUTE ON FUNCTION public.poa_member_display_order(integer) TO litigation_runtime;
CREATE FUNCTION _migration.task69_poa_insert_allowed(p_row jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op uuid; issue text; a _migration.task69_allowlist%ROWTYPE; expected jsonb; ordinal integer;
BEGIN
 IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RETURN false; END IF;
 op:=nullif(current_setting('litigation.task69_operation',true),'')::uuid;issue:=nullif(current_setting('litigation.task69_issue',true),'');
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=op AND issue_id=issue AND stage='S5-poa-membership' AND unit_kind='issue';
 IF NOT FOUND OR EXISTS(SELECT 1 FROM _migration.task69_receipt WHERE operation_id=op AND issue_id=issue) THEN RETURN false; END IF;
 SELECT n::integer INTO ordinal FROM jsonb_array_elements(a.payload_text::jsonb->'newMembers') WITH ORDINALITY x(v,n) WHERE v->'personId'=p_row->'person_id';
 IF ordinal IS NULL THEN RETURN false; END IF;
 ordinal:=ordinal+(SELECT coalesce(max(coalesce((l->>'current_order')::integer,(l->>'source_member_ordinal')::integer)),0) FROM jsonb_array_elements(a.payload_text::jsonb->'preservedExistingLinks') l);
 expected:=jsonb_build_object('power_of_attorney_id',a.payload_text::jsonb->'poaId','person_id',p_row->'person_id',
 'legacy_source_record_key',a.entry_text::jsonb->'source'->'src_record_key','legacy_source_extraction_sha256',a.entry_text::jsonb->'source'->'extraction_sha256',
 'legacy_lawyers_raw',a.entry_text::jsonb->'source'->'raw_value','reviewed_rule_id',NULL,'source_member_ordinal',NULL,'current_order',ordinal,'is_retired',false);
 RETURN p_row-ARRAY['id','created_at','created_by','updated_at','updated_by']=expected;
END $$;
CREATE FUNCTION _migration.task69_poa_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE r _migration.task69_receipt%ROWTYPE;a _migration.task69_allowlist%ROWTYPE;c _migration.poa_edit_change%ROWTYPE;
 parent _migration.task69_delta%ROWTYPE;d _migration.task69_delta%ROWTYPE;o jsonb;prior jsonb;member jsonb;intended jsonb;m record;
 before_members jsonb;after_members jsonb;expected_row jsonb;new_ids jsonb:='[]';mapped jsonb:='[]';n integer:=0;base_order integer;existing jsonb;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE receipt_id=p_receipt;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=r.operation_id AND issue_id=r.issue_id;
 IF a.stage<>'S5-poa-membership' OR r.phase='compensate' THEN RETURN true;END IF;
 o:=a.payload_text::jsonb;
 IF o->'newMembers'='[]'::jsonb THEN
  RETURN o->'members'='[]'::jsonb AND o->'preservedExistingLinks'='[]'::jsonb AND o->'sourceOccurrences'='[]'::jsonb AND o->'personStateChanges'='[]'::jsonb
  AND a.entry_text::jsonb->'source'->>'relationship_kind'='client' AND a.entry_text::jsonb->'source'->'raw_value'='null'::jsonb
  AND r.effect='no-business-write' AND r.expected_delta_count=0
  AND NOT EXISTS(SELECT 1 FROM _migration.task69_poa_change WHERE receipt_id=p_receipt)
  AND NOT EXISTS(SELECT 1 FROM _migration.task69_poa_order WHERE receipt_id=p_receipt)
  AND r.returned_ids=jsonb_build_object('poaId',o->'poaId','newMemberIds','[]'::jsonb,'members','[]'::jsonb)
  AND r.source_occurrences=jsonb_build_array(jsonb_build_object('source',a.entry_text::jsonb->'source','occurrences','[]'::jsonb,'preservedExistingLinks','[]'::jsonb,'mappings','[]'::jsonb));
 END IF;
 SELECT x.* INTO c FROM _migration.poa_edit_change x JOIN _migration.task69_poa_change b USING(poa_id,version) WHERE b.receipt_id=p_receipt;
 IF NOT FOUND OR c.poa_id<>(o->>'poaId')::integer OR c.actor_id<>r.actor_id OR c.request_id<>r.request_id OR c.before_values IS NULL
 OR EXISTS(SELECT 1 FROM _migration.poa_edit_submission WHERE poa_id=c.poa_id AND result_version=c.version) THEN RETURN false;END IF;
 SELECT * INTO parent FROM _migration.task69_delta WHERE receipt_id=p_receipt AND ordinal=1 AND entity_schema='public' AND entity_table='powers_of_attorney';
 IF NOT FOUND OR parent.entity_key<>jsonb_build_object('id',c.poa_id) OR parent.before_values IS DISTINCT FROM c.before_values->'poa' OR parent.after_values IS DISTINCT FROM c.after_values->'poa'
 OR parent.after_values-ARRAY['row_version','updated_at','updated_by'] IS DISTINCT FROM parent.before_values-ARRAY['row_version','updated_at','updated_by']
 OR (parent.after_values->>'row_version')::bigint<>c.version OR c.version<>(parent.before_values->>'row_version')::bigint+1
 OR parent.before_values->'is_archived'<>'false'::jsonb THEN RETURN false;END IF;
 before_members:=c.before_values->'lawyers';after_members:=c.after_values->'lawyers';
 SELECT coalesce(jsonb_agg(to_jsonb(jsonb_populate_record(NULL::public.power_of_attorney_lawyers,l)) ORDER BY (l->>'id')::integer),'[]') INTO existing FROM jsonb_array_elements(o->'preservedExistingLinks') l;
 IF before_members IS DISTINCT FROM existing OR EXISTS(SELECT 1 FROM jsonb_array_elements(before_members) old WHERE NOT after_members @> jsonb_build_array(old)) THEN RETURN false;END IF;
 SELECT coalesce(max(coalesce((l->>'current_order')::integer,(l->>'source_member_ordinal')::integer)),0) INTO base_order FROM jsonb_array_elements(before_members) l;
 FOR intended IN SELECT value FROM jsonb_array_elements(o->'newMembers') LOOP
  n:=n+1;
  SELECT * INTO d FROM _migration.task69_delta WHERE receipt_id=p_receipt AND ordinal=n+1 AND entity_schema='public' AND entity_table='power_of_attorney_lawyers';
  expected_row:=jsonb_build_object('power_of_attorney_id',o->'poaId','person_id',intended->'personId',
   'legacy_source_record_key',a.entry_text::jsonb->'source'->'src_record_key','legacy_source_extraction_sha256',a.entry_text::jsonb->'source'->'extraction_sha256',
   'legacy_lawyers_raw',a.entry_text::jsonb->'source'->'raw_value','reviewed_rule_id',NULL,'source_member_ordinal',NULL,'current_order',base_order+n,'is_retired',false);
  IF NOT FOUND OR d.before_values IS NOT NULL OR d.after_values-ARRAY['id','created_at','created_by','updated_at','updated_by'] IS DISTINCT FROM expected_row
   OR NOT after_members @> jsonb_build_array(d.after_values) THEN RETURN false;END IF;
  new_ids:=new_ids||jsonb_build_array(d.entity_key->'id');
 END LOOP;
 IF jsonb_array_length(after_members)<>jsonb_array_length(before_members)+n OR r.expected_delta_count<>n+1 OR n=0 OR r.effect<>'business-change' THEN RETURN false;END IF;
 FOR m IN SELECT v,ord FROM jsonb_array_elements(o->'members') WITH ORDINALITY x(v,ord) LOOP
  IF (m.v->>'displayOrder')::integer<>m.ord THEN RETURN false;END IF;
  SELECT l INTO member FROM jsonb_array_elements(after_members) l WHERE l->'person_id'=m.v->'personId';
  IF NOT FOUND OR member->'is_retired'<>'false'::jsonb OR NOT EXISTS(SELECT 1 FROM _migration.task69_poa_order x WHERE x.receipt_id=p_receipt AND x.member_id=(member->>'id')::integer AND x.poa_id=c.poa_id AND x.position=m.ord) THEN RETURN false;END IF;
  mapped:=mapped||jsonb_build_array(jsonb_build_object('memberId',member->'id','personId',m.v->'personId','displayOrder',m.ord));
 END LOOP;
 RETURN (SELECT count(*) FROM _migration.task69_poa_order WHERE receipt_id=p_receipt)=jsonb_array_length(o->'members')
 AND jsonb_array_length(after_members)=jsonb_array_length(o->'members')
 AND r.returned_ids=jsonb_build_object('poaId',c.poa_id,'newMemberIds',new_ids,'members',mapped)
 AND r.source_occurrences=jsonb_build_array(jsonb_build_object('source',a.entry_text::jsonb->'source','occurrences',o->'sourceOccurrences','preservedExistingLinks',o->'preservedExistingLinks','mappings',mapped));
END $$;
CREATE FUNCTION _migration.task69_poa_receipt_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF _migration.task69_poa_receipt_valid(NEW.receipt_id) IS NOT TRUE THEN RAISE EXCEPTION 'Task69 POA receipt differs from exact source approval';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER task69_poa_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_poa_receipt_complete();
CREATE CONSTRAINT TRIGGER task69_poa_order_complete AFTER INSERT ON _migration.task69_poa_order DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_poa_receipt_complete();
CREATE CONSTRAINT TRIGGER task69_poa_change_complete AFTER INSERT ON _migration.task69_poa_change DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_poa_receipt_complete();
CREATE OR REPLACE FUNCTION public.enforce_poa_lawyer_provenance()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $POA_MEMBER$
DECLARE
    parent_source record;
BEGIN
    IF NEW.legacy_source_record_key IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT legacy_source_record_key, legacy_source_extraction_sha256, legacy_lawyers_raw
      INTO parent_source
      FROM public.powers_of_attorney
     WHERE id = NEW.power_of_attorney_id;
    IF parent_source.legacy_source_record_key IS DISTINCT FROM NEW.legacy_source_record_key
       OR parent_source.legacy_source_extraction_sha256 IS DISTINCT FROM NEW.legacy_source_extraction_sha256
       OR parent_source.legacy_lawyers_raw IS DISTINCT FROM NEW.legacy_lawyers_raw THEN
        RAISE EXCEPTION 'POA lawyer provenance does not match its source POA';
    END IF;

    IF NEW.reviewed_rule_id IS NULL AND NEW.source_member_ordinal IS NULL THEN
        IF (TG_OP='INSERT' AND _migration.task69_poa_insert_allowed(to_jsonb(NEW)))
        OR (TG_OP='UPDATE' AND EXISTS(
          SELECT 1 FROM _migration.task69_poa_order o JOIN _migration.task69_delta d ON d.receipt_id=o.receipt_id AND d.entity_table='power_of_attorney_lawyers' AND d.entity_key=jsonb_build_object('id',NEW.id)
          WHERE o.member_id=NEW.id AND d.before_values IS NULL AND d.after_values-ARRAY['is_retired','updated_at','updated_by']=to_jsonb(NEW)-ARRAY['is_retired','updated_at','updated_by']
          AND _migration.task69_poa_receipt_valid(o.receipt_id))) THEN RETURN NEW; END IF;
        RAISE EXCEPTION 'Exact Task69 POA source membership proof required';
    END IF;

    IF NEW.reviewed_rule_id IS NULL THEN
        IF NEW.source_member_ordinal <> 1 OR NOT EXISTS (
            SELECT 1 FROM public.person_name_alias a
             WHERE a.alias_ar = NEW.legacy_lawyers_raw AND a.person_id = NEW.person_id
        ) THEN
            RAISE EXCEPTION 'Direct POA lawyer must resolve through one exact alias';
        END IF;
    ELSIF NOT EXISTS (
        SELECT 1
          FROM public.migration_multi_person_rule r
          JOIN public.migration_multi_person_rule_member m ON m.rule_id = r.id
         WHERE r.id = NEW.reviewed_rule_id
           AND (
               (r.poa_match_mode IS NULL AND r.raw_value = NEW.legacy_lawyers_raw)
               OR
               (r.poa_match_mode = 'substring'
                AND position(r.raw_value in NEW.legacy_lawyers_raw) > 0)
           )
           AND m.ordinal = NEW.source_member_ordinal
           AND m.person_id = NEW.person_id
    ) THEN
        RAISE EXCEPTION 'POA lawyer does not match the reviewed rule member';
    END IF;
    RETURN NEW;
END;
$POA_MEMBER$;
CREATE OR REPLACE FUNCTION _migration.poa_edit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE incoming jsonb; previous jsonb; allowed text[]; k text; parent integer;
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'POA history cannot be deleted'; END IF;
 incoming:=to_jsonb(NEW);
 allowed:=CASE WHEN TG_TABLE_NAME='powers_of_attorney' THEN ARRAY['client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report','row_version','is_archived'] ELSE ARRAY['is_retired'] END;
 IF TG_OP='UPDATE' THEN
  previous:=to_jsonb(OLD);
  IF incoming-allowed-ARRAY['updated_at','updated_by'] IS DISTINCT FROM previous-allowed-ARRAY['updated_at','updated_by'] THEN RAISE EXCEPTION 'POA source, identity and member order are immutable'; END IF;
  IF TG_TABLE_NAME='powers_of_attorney' THEN
   IF (incoming->>'row_version')::bigint<>(previous->>'row_version')::bigint+1 THEN RAISE EXCEPTION 'POA version must advance exactly once'; END IF;
   IF incoming->'is_archived' IS DISTINCT FROM previous->'is_archived' THEN
    PERFORM _migration.client_contact_require_actor(true);
    IF incoming-ARRAY['is_archived','row_version','updated_at','updated_by'] IS DISTINCT FROM previous-ARRAY['is_archived','row_version','updated_at','updated_by'] THEN RAISE EXCEPTION 'POA lifecycle cannot change business values'; END IF;
   ELSIF OLD.is_archived THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived POA before editing'; END IF;
  END IF;
 ELSE
  FOR k IN SELECT key FROM jsonb_each(incoming) WHERE key LIKE 'legacy_%' OR key IN('client_name','poa_capacity_duplicate','reviewed_rule_id','source_member_ordinal') LOOP
   IF incoming->k<>'null'::jsonb AND NOT (TG_TABLE_NAME='power_of_attorney_lawyers' AND _migration.task69_poa_insert_allowed(incoming)) THEN RAISE EXCEPTION 'Native POA cannot invent source evidence'; END IF;
  END LOOP;
  IF TG_TABLE_NAME='powers_of_attorney' AND ((incoming->>'is_archived')::boolean OR (incoming->>'row_version')::bigint<>1) THEN RAISE EXCEPTION 'Native POA starts current at version one'; END IF;
  IF TG_TABLE_NAME='power_of_attorney_lawyers' AND ((incoming->>'is_retired')::boolean OR incoming->>'current_order' IS NULL) THEN RAISE EXCEPTION 'Native POA member requires current order'; END IF;
 END IF;
 IF TG_TABLE_NAME='powers_of_attorney' THEN parent:=(incoming->>'client_id')::integer;
 ELSE
  SELECT client_id INTO parent FROM public.powers_of_attorney WHERE id=NEW.power_of_attorney_id AND NOT is_archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived POA before changing lawyers'; END IF;
 END IF;
 IF parent IS NOT NULL THEN
  PERFORM 1 FROM public.clients WHERE id=parent AND NOT is_archived FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Restore archived client before changing POA'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION _migration.poa_edit_current_valid(p_id integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE expected jsonb:=_migration.poa_edit_initial_aggregate(p_id); c record; s record; v bigint; op text; prior jsonb; next_row jsonb; member jsonb; old_member jsonb; selected jsonb; k text; restoration uuid;
BEGIN
 v:=CASE WHEN expected IS NULL THEN 1 ELSE 2 END;
 FOR c IN SELECT * FROM _migration.poa_edit_change WHERE poa_id=p_id ORDER BY version LOOP
  SELECT receipt_id INTO restoration FROM _migration.task69_poa_change WHERE poa_id=p_id AND version=c.version;
  IF restoration IS NOT NULL THEN
   IF c.version<>v OR c.before_values IS DISTINCT FROM expected OR _migration.task69_poa_receipt_valid(restoration) IS NOT TRUE THEN RETURN false;END IF;
   expected:=c.after_values;v:=v+1;CONTINUE;
  END IF;
  SELECT * INTO s FROM _migration.poa_edit_submission WHERE poa_id=p_id AND result_version=c.version;
  IF NOT FOUND OR s.actor_id<>c.actor_id OR c.version<>v OR c.before_values IS DISTINCT FROM expected
   OR s.request_payload->>'submission' IS DISTINCT FROM s.submission_id::text
   OR (c.after_values->'poa'->>'id')::integer IS DISTINCT FROM p_id
   OR (c.after_values->'poa'->>'row_version')::bigint IS DISTINCT FROM v
   OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_table='powers_of_attorney' AND e.entity_schema='public' AND e.entity_key=jsonb_build_object('id',p_id) AND e.actor_id=c.actor_id AND e.request_id=c.request_id AND e.after_values->>'row_version'=v::text AND e.action IN('record_created','record_updated') AND e.outcome='succeeded') THEN RETURN false; END IF;
  op:=s.request_payload->>'operation'; prior:=expected->'poa'; next_row:=c.after_values->'poa';
  IF op NOT IN('create','update','archive','restore') OR (op='create')<>(expected IS NULL)
   OR (op<>'create' AND (s.request_payload->>'id' IS DISTINCT FROM p_id::text OR s.request_payload->>'version' IS DISTINCT FROM (v-1)::text)) THEN RETURN false; END IF;
  IF NOT _migration.poa_edit_audit_matches('powers_of_attorney',prior,next_row,c.actor_id,c.request_id) THEN RETURN false; END IF;
  IF op IN('archive','restore') THEN
   IF next_row-ARRAY['is_archived','row_version','updated_at','updated_by'] IS DISTINCT FROM prior-ARRAY['is_archived','row_version','updated_at','updated_by']
    OR next_row->'is_archived' IS DISTINCT FROM to_jsonb(op='archive') OR next_row->'is_archived' IS NOT DISTINCT FROM prior->'is_archived'
    OR c.after_values->'lawyers' IS DISTINCT FROM expected->'lawyers'
    OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='powers_of_attorney' AND e.entity_key=jsonb_build_object('id',p_id) AND e.request_id=c.request_id AND e.actor_id=c.actor_id AND e.action=op AND e.outcome='succeeded' AND e.actor_role_snapshot='Administrator')
    OR NOT EXISTS(SELECT 1 FROM public.audit_events e WHERE e.entity_schema='public' AND e.entity_table='powers_of_attorney' AND e.entity_key=jsonb_build_object('id',p_id) AND e.request_id=c.request_id AND e.actor_id=c.actor_id AND e.action='record_updated' AND e.after_values->>'row_version'=v::text AND e.actor_role_snapshot='Administrator') THEN RETURN false; END IF;
  ELSE
   IF next_row->'is_archived' IS DISTINCT FROM 'false'::jsonb OR (prior IS NOT NULL AND prior->'is_archived'<>'false'::jsonb) THEN RETURN false; END IF;
   IF prior IS NOT NULL AND next_row-ARRAY['client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report','row_version','updated_at','updated_by'] IS DISTINCT FROM prior-ARRAY['client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report','row_version','updated_at','updated_by'] THEN RETURN false; END IF;
   FOREACH k IN ARRAY ARRAY['client_id','serial_no','principal_name','poa_capacity','poa_number','poa_letter','poa_year','issuing_authority','issue_date','copies_count','notes','show_on_poa_report'] LOOP
    IF next_row->k IS DISTINCT FROM (CASE WHEN s.request_payload->'values' ? k THEN s.request_payload->'values'->k ELSE coalesce(prior->k,'null'::jsonb) END) THEN RETURN false; END IF;
   END LOOP;
   selected:=s.request_payload->'lawyers';
   IF selected<>'null'::jsonb THEN
    IF (SELECT coalesce(jsonb_agg(x ORDER BY x),'[]') FROM jsonb_array_elements(selected) x) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(l->'person_id' ORDER BY l->'person_id'),'[]') FROM jsonb_array_elements(c.after_values->'lawyers') l WHERE l->'is_retired'='false'::jsonb) THEN RETURN false; END IF;
   ELSIF c.after_values->'lawyers' IS DISTINCT FROM coalesce(expected->'lawyers','[]') THEN RETURN false; END IF;
   FOR member IN SELECT * FROM jsonb_array_elements(c.after_values->'lawyers') LOOP
    SELECT l INTO old_member FROM jsonb_array_elements(coalesce(expected->'lawyers','[]')) l WHERE l->'id'=member->'id';
    IF (member->>'power_of_attorney_id')::integer IS DISTINCT FROM p_id THEN RETURN false; END IF;
    IF member IS DISTINCT FROM old_member AND NOT _migration.poa_edit_audit_matches('power_of_attorney_lawyers',old_member,member,c.actor_id,c.request_id) THEN RETURN false; END IF;
    IF old_member IS NOT NULL THEN
     IF member-ARRAY['is_retired','updated_at','updated_by'] IS DISTINCT FROM old_member-ARRAY['is_retired','updated_at','updated_by'] THEN RETURN false; END IF;
    ELSE
     IF member->'is_retired'<>'false'::jsonb OR member->>'current_order' IS NULL OR (member->>'current_order')::integer <= (SELECT coalesce(max(coalesce((l->>'current_order')::integer,(l->>'source_member_ordinal')::integer)),0) FROM jsonb_array_elements(coalesce(expected->'lawyers','[]')) l) THEN RETURN false; END IF;
     FOR k IN SELECT key FROM jsonb_each(member) WHERE key LIKE 'legacy_%' OR key IN('reviewed_rule_id','source_member_ordinal') LOOP IF member->k<>'null'::jsonb THEN RETURN false; END IF; END LOOP;
    END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(expected->'lawyers','[]')) l WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_values->'lawyers') n WHERE n->'id'=l->'id')) THEN RETURN false; END IF;
  END IF;
  IF op='create' THEN
   FOR k IN SELECT key FROM jsonb_each(next_row) WHERE key LIKE 'legacy_%' OR key IN('client_name','poa_capacity_duplicate') LOOP IF next_row->k<>'null'::jsonb THEN RETURN false; END IF; END LOOP;
  END IF;
  expected:=c.after_values; v:=v+1;
 END LOOP;
 RETURN expected IS NOT NULL AND expected IS NOT DISTINCT FROM _migration.poa_edit_aggregate(p_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.poa_edit_state(p_account integer,p_session integer,p_role text,p_expires timestamptz,p_id integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE record jsonb;
BEGIN
 PERFORM _migration.poa_edit_require_account(p_account,p_session,p_role,p_expires,false);
 IF p_id IS NOT NULL THEN
  SELECT jsonb_build_object('id',p.id,'version',p.row_version::text,'archived',p.is_archived,'parentArchived',coalesce(c.is_archived,false),'values',to_jsonb(p),'sourceClient',p.client_name,'sourceLawyers',p.legacy_lawyers_raw) INTO record FROM public.powers_of_attorney p LEFT JOIN public.clients c ON c.id=p.client_id WHERE p.id=p_id;
  IF record IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='POA not found'; END IF;
 END IF;
 RETURN jsonb_build_object('record',record,'facts',_migration.poa_edit_facts(p_id),
 'clients',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name_ar,'active',NOT c.is_archived) ORDER BY c.name_ar COLLATE "arabic",c.id),'[]') FROM public.clients c WHERE NOT c.is_archived OR c.id=(record->'values'->>'client_id')::integer),
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name_ar,'active',p.is_active,'staff',p.is_staff) ORDER BY p.name_ar COLLATE "arabic",p.id),'[]') FROM public.people p WHERE p.is_active OR EXISTS(SELECT 1 FROM public.power_of_attorney_lawyers l WHERE l.power_of_attorney_id=p_id AND l.person_id=p.id)),
 'lawyers',(SELECT coalesce(jsonb_agg(jsonb_build_object('personId',l.person_id,'retired',l.is_retired,'original',l.legacy_source_record_key IS NOT NULL,'order',public.poa_member_display_order(l.id)) ORDER BY public.poa_member_display_order(l.id),l.id),'[]') FROM public.power_of_attorney_lawyers l WHERE l.power_of_attorney_id=p_id));
END;
$$;
DO $$ DECLARE routine regprocedure;BEGIN
 FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='_migration' AND p.proname LIKE 'task69_poa_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,litigation_runtime',routine);END LOOP;
END $$;
COMMIT;
