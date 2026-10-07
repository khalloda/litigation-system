-- Task 6.9 foundation. Candidate only: immutable reviewed contract and receipts.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $precondition$
BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>78
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL
  AND migration_name<>'20261007120000_task69_operation_contract') THEN
  RAISE EXCEPTION 'Exact complete migration78 direct administration prestate required';
 END IF;
END $precondition$;
CREATE TABLE _migration.task69_operation (
 operation_id uuid PRIMARY KEY,
 target_cluster text NOT NULL CHECK(target_cluster ~ '^[0-9]+$'),
 target_database text NOT NULL CHECK(length(target_database)>0),
 register_sha256 text NOT NULL CHECK(register_sha256='23e9aaecc39c5dbed4025495ac328e36e6b635285371524c9b72e7fb1a09d512'),
 plan_sha256 text NOT NULL CHECK(plan_sha256='2984c0910801835cc95a2358bb08e94c8ffb37def51d847355720cff0e565ded'),
 runner_sha256 text NOT NULL CHECK(runner_sha256 ~ '^[a-f0-9]{64}$'),
 schema_sha256 text NOT NULL CHECK(schema_sha256 ~ '^[a-f0-9]{64}$'),
 contract_text text NOT NULL CHECK(jsonb_typeof(contract_text::jsonb)='object'),
 contract_sha256 text NOT NULL CHECK(contract_sha256=encode(sha256(convert_to(contract_text,'UTF8')),'hex')),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 CHECK(((contract_text::jsonb)->>'operationId'=operation_id::text) IS TRUE),
 CHECK(((contract_text::jsonb)->>'registerSha256'=register_sha256) IS TRUE),
 CHECK(((contract_text::jsonb)->>'planSha256'=plan_sha256) IS TRUE),
 CHECK(((contract_text::jsonb)->>'runnerSha256'=runner_sha256) IS TRUE),
 CHECK(((contract_text::jsonb)->>'schemaSha256'=schema_sha256) IS TRUE),
 CHECK((jsonb_typeof((contract_text::jsonb)->'entries')='object') IS TRUE)
);
CREATE TABLE _migration.task69_allowlist (
 operation_id uuid NOT NULL REFERENCES _migration.task69_operation(operation_id),
 issue_id text NOT NULL CHECK(length(issue_id)>0),
 stage text NOT NULL CHECK(stage IN('S1-party-display','S2-lawyer-membership','S3-admin-parents','S4-step-restoration','S5-poa-membership','S6-documents','S7-fee-provenance','S8-history-dispositions','shared-dependency')),
 unit_kind text NOT NULL CHECK(unit_kind IN('issue','dependency')),
 entry_text text NOT NULL CHECK(jsonb_typeof(entry_text::jsonb)='object'),
 entry_sha256 text NOT NULL CHECK(entry_sha256=encode(sha256(convert_to(entry_text,'UTF8')),'hex')),
 payload_text text NOT NULL CHECK(jsonb_typeof(payload_text::jsonb)='object'),
 payload_sha256 text NOT NULL CHECK(payload_sha256=encode(sha256(convert_to(payload_text,'UTF8')),'hex')),
 PRIMARY KEY(operation_id,issue_id),
 UNIQUE(operation_id,issue_id,payload_sha256),
 CHECK((unit_kind='dependency')=(stage='shared-dependency')),
 CHECK(((entry_text::jsonb)->>'issueId'=issue_id) IS TRUE),
 CHECK(((entry_text::jsonb)->>'stage'=stage) IS TRUE),
 CHECK(((entry_text::jsonb)->>'unitKind'=unit_kind) IS TRUE),
 CHECK(((entry_text::jsonb)->'approvedOutcome'=payload_text::jsonb) IS TRUE)
);
CREATE TABLE _migration.task69_receipt (
 receipt_id uuid PRIMARY KEY,
 operation_id uuid NOT NULL,
 issue_id text NOT NULL,
 payload_sha256 text NOT NULL,
 phase text NOT NULL CHECK(phase IN('apply','compensate')),
 actor_id integer NOT NULL REFERENCES public.audit_actors(id),
 audit_session_id uuid NOT NULL,
 request_id uuid NOT NULL UNIQUE,
 returned_ids jsonb NOT NULL CHECK(jsonb_typeof(returned_ids)='object'),
 source_occurrences jsonb NOT NULL CHECK(jsonb_typeof(source_occurrences)='array'),
 effect text NOT NULL CHECK(effect IN('business-change','no-business-write','compensated')),
 expected_delta_count integer NOT NULL CHECK(expected_delta_count>=0),
 prior_receipt_id uuid REFERENCES _migration.task69_receipt(receipt_id),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 UNIQUE(operation_id,issue_id,phase),
 FOREIGN KEY(operation_id,issue_id,payload_sha256) REFERENCES _migration.task69_allowlist(operation_id,issue_id,payload_sha256),
 CHECK((phase='compensate')=(prior_receipt_id IS NOT NULL)),
 CHECK((effect='no-business-write')=(expected_delta_count=0)),
 CHECK((phase='compensate')=(effect='compensated'))
);
CREATE TABLE _migration.task69_delta (
 receipt_id uuid NOT NULL REFERENCES _migration.task69_receipt(receipt_id),
 ordinal integer NOT NULL CHECK(ordinal>0),
 entity_schema text NOT NULL CHECK(entity_schema='public'),
 entity_table text NOT NULL CHECK(entity_table IN('matters','matter_parties','matter_party_roles','matter_lawyers','admin_tasks','task_actions','powers_of_attorney','power_of_attorney_lawyers','documents','fee_letters','fee_letter_matters','matter_fee_letter_references','lookup_party_role','lookup_court','lookup_matter_destination','admin_task_assignees','document_matters','document_responsible_people')),
 entity_key jsonb NOT NULL CHECK(jsonb_typeof(entity_key)='object' AND entity_key<>'{}'),
 before_values jsonb CHECK(before_values IS NULL OR jsonb_typeof(before_values)='object'),
 after_values jsonb NOT NULL CHECK(jsonb_typeof(after_values)='object'),
 audit_event_id bigint NOT NULL UNIQUE REFERENCES public.audit_events(id),
 PRIMARY KEY(receipt_id,ordinal),
 UNIQUE(receipt_id,entity_schema,entity_table,entity_key),
 CHECK(before_values IS DISTINCT FROM after_values),
 CHECK(entity_key=jsonb_build_object('id',after_values->'id')),
 CHECK(after_values->>'id' ~ '^[1-9][0-9]*$'),
 CHECK(before_values IS NULL OR before_values->'id'=after_values->'id')
);
CREATE INDEX task69_delta_entity_idx ON _migration.task69_delta(entity_schema,entity_table);
CREATE INDEX task69_receipt_operation_idx ON _migration.task69_receipt(operation_id,created_at,receipt_id);

CREATE FUNCTION _migration.task69_require_actor(p_account integer,p_version integer,p_role text,p_expires timestamptz,p_session uuid) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE actor integer;
BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task69 requires direct administration principal';
 END IF;
 IF p_session IS NULL OR p_expires IS NULL OR p_expires>clock_timestamp()+interval '31 days' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current genuine Task69 session required';
 END IF;
 actor:=_migration.matter_edit_require_account(p_account,p_version,p_role,p_expires,true);
 IF (SELECT count(*) FROM public.audit_events WHERE actor_id=actor AND audit_session_id=p_session
  AND action='login_succeeded' AND outcome='succeeded')<>1
 OR EXISTS(SELECT 1 FROM public.audit_events WHERE actor_id=actor AND audit_session_id=p_session
  AND action='logout' AND outcome='succeeded') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task69 session lacks one genuine current sign-in';
 END IF;
 RETURN actor;
END $$;

CREATE FUNCTION _migration.task69_contract_valid(p_operation uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE operation _migration.task69_operation%ROWTYPE; item record; expected jsonb; observed jsonb;
BEGIN
 SELECT * INTO operation FROM _migration.task69_operation WHERE operation_id=p_operation;
 IF NOT FOUND THEN RETURN false; END IF;
 expected:=(operation.contract_text::jsonb)->'entries';
 SELECT coalesce(jsonb_object_agg(issue_id,entry_sha256),'{}') INTO observed FROM _migration.task69_allowlist WHERE operation_id=p_operation;
 IF observed IS DISTINCT FROM expected THEN RETURN false; END IF;
 IF (SELECT count(*) FROM _migration.task69_allowlist WHERE operation_id=p_operation AND unit_kind='issue')<>3465 THEN RETURN false; END IF;
 FOR item IN SELECT * FROM (VALUES ('S1-party-display',743),('S2-lawyer-membership',191),('S3-admin-parents',544),('S4-step-restoration',769),('S5-poa-membership',714),('S6-documents',291),('S7-fee-provenance',76),('S8-history-dispositions',137)) x(stage,expected_count) LOOP
  IF (SELECT count(*) FROM _migration.task69_allowlist WHERE operation_id=p_operation AND stage=item.stage)<>item.expected_count THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;

CREATE FUNCTION _migration.task69_allowlist_bound() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE expected text;
BEGIN
 SELECT contract_text::jsonb->'entries'->>NEW.issue_id INTO expected FROM _migration.task69_operation WHERE operation_id=NEW.operation_id;
 IF expected IS DISTINCT FROM NEW.entry_sha256 THEN RAISE EXCEPTION 'Task69 issue differs from sealed operation allowlist'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION _migration.task69_require_contract() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.target_cluster IS DISTINCT FROM (pg_control_system()).system_identifier::text
 OR NEW.target_database IS DISTINCT FROM current_database()
 OR NOT _migration.task69_contract_valid(NEW.operation_id) THEN
  RAISE EXCEPTION 'Task69 contract is incomplete or belongs to another database';
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION _migration.task69_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE receipt _migration.task69_receipt%ROWTYPE; delta _migration.task69_delta%ROWTYPE; event public.audit_events%ROWTYPE; expected_before jsonb; expected_after jsonb; expected_fields text[]; prior _migration.task69_receipt%ROWTYPE;
BEGIN
 SELECT * INTO receipt FROM _migration.task69_receipt WHERE receipt_id=p_receipt;
 IF NOT FOUND OR (SELECT count(*) FROM _migration.task69_delta WHERE receipt_id=p_receipt)<>receipt.expected_delta_count
 OR (SELECT count(*) FROM public.audit_events WHERE request_id=receipt.request_id)<>receipt.expected_delta_count THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_events WHERE actor_id=receipt.actor_id AND audit_session_id=receipt.audit_session_id AND action='login_succeeded' AND outcome='succeeded') THEN RETURN false; END IF;
 IF receipt.phase='compensate' THEN
  SELECT * INTO prior FROM _migration.task69_receipt WHERE receipt_id=receipt.prior_receipt_id;
  IF NOT FOUND OR prior.phase<>'apply' OR prior.operation_id<>receipt.operation_id OR prior.issue_id<>receipt.issue_id OR prior.payload_sha256<>receipt.payload_sha256 THEN RETURN false; END IF;
 END IF;
 FOR delta IN SELECT * FROM _migration.task69_delta WHERE receipt_id=p_receipt LOOP
  SELECT * INTO event FROM public.audit_events WHERE id=delta.audit_event_id;
  IF NOT FOUND OR event.actor_id<>receipt.actor_id OR event.audit_session_id IS DISTINCT FROM receipt.audit_session_id
  OR event.request_id IS DISTINCT FROM receipt.request_id OR event.correlation_id IS DISTINCT FROM receipt.operation_id
  OR event.entity_schema<>delta.entity_schema OR event.entity_table<>delta.entity_table OR event.entity_key<>delta.entity_key
  OR event.outcome IS DISTINCT FROM 'succeeded' OR (event.actor_role_snapshot IN('Administrator','Litigation Assistant')) IS NOT TRUE
 OR event.action IS DISTINCT FROM (SELECT CASE WHEN entity_kind='record' THEN CASE WHEN delta.before_values IS NULL THEN 'record_created' ELSE 'record_updated' END ELSE CASE WHEN delta.before_values IS NULL THEN 'relationship_added' ELSE 'relationship_updated' END END FROM public.audit_event_table_rules WHERE entity_schema=delta.entity_schema AND entity_table=delta.entity_table) THEN RETURN false; END IF;
  SELECT array_agg(f.field_name ORDER BY f.field_name),
   CASE WHEN delta.before_values IS NULL THEN '{}'::jsonb ELSE coalesce(jsonb_object_agg(f.field_name,public.audit_bound_json_value(delta.before_values->f.field_name,f.max_text_characters,f.capture_mode)),'{}') END,
   coalesce(jsonb_object_agg(f.field_name,public.audit_bound_json_value(delta.after_values->f.field_name,f.max_text_characters,f.capture_mode)),'{}')
   INTO expected_fields,expected_before,expected_after
  FROM public.audit_event_fields f WHERE f.entity_schema=delta.entity_schema AND f.entity_table=delta.entity_table
   AND f.capture_mode IN('value','redacted') AND (delta.before_values IS NULL OR delta.before_values->f.field_name IS DISTINCT FROM delta.after_values->f.field_name);
  IF event.changed_fields IS DISTINCT FROM expected_fields OR event.before_values IS DISTINCT FROM expected_before OR event.after_values IS DISTINCT FROM expected_after THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;

CREATE FUNCTION _migration.task69_authorize_issue(p_operation uuid,p_issue text,p_payload_hash text,p_account integer,p_version integer,p_role text,p_expires timestamptz,p_session uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE actor integer; operation _migration.task69_operation%ROWTYPE; receipt _migration.task69_receipt%ROWTYPE; delta _migration.task69_delta%ROWTYPE; current_row jsonb;
BEGIN
 -- Always before receipt reuse: a formerly authorized person is not enough.
 actor:=_migration.task69_require_actor(p_account,p_version,p_role,p_expires,p_session);
 SELECT * INTO operation FROM _migration.task69_operation WHERE operation_id=p_operation FOR SHARE;
 IF NOT FOUND OR operation.target_cluster IS DISTINCT FROM (pg_control_system()).system_identifier::text
 OR operation.target_database IS DISTINCT FROM current_database() THEN RAISE EXCEPTION 'Task69 operation target differs'; END IF;
 PERFORM 1 FROM _migration.task69_allowlist WHERE operation_id=p_operation AND issue_id=p_issue AND payload_sha256=p_payload_hash FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task69 issue or approved payload differs'; END IF;
 IF EXISTS(SELECT 1 FROM _migration.task69_receipt WHERE operation_id=p_operation AND issue_id=p_issue AND phase='compensate') THEN RAISE EXCEPTION 'Task69 compensated issue requires a separately reviewed operation'; END IF;
 SELECT * INTO receipt FROM _migration.task69_receipt WHERE operation_id=p_operation AND issue_id=p_issue AND phase='apply';
 IF NOT FOUND THEN RETURN jsonb_build_object('actorId',actor,'receipt',NULL); END IF;
 IF NOT _migration.task69_receipt_valid(receipt.receipt_id) THEN RAISE EXCEPTION 'Task69 prior receipt is incomplete'; END IF;
 FOR delta IN SELECT * FROM _migration.task69_delta WHERE receipt_id=receipt.receipt_id ORDER BY ordinal LOOP
  EXECUTE format('SELECT to_jsonb(r) FROM %I.%I r WHERE id=$1 FOR SHARE',delta.entity_schema,delta.entity_table) INTO current_row USING (delta.entity_key->>'id')::integer;
  IF current_row IS DISTINCT FROM delta.after_values THEN RAISE EXCEPTION 'Task69 receipt postimage was edited: %.% %',delta.entity_schema,delta.entity_table,delta.entity_key; END IF;
 END LOOP;
 RETURN jsonb_build_object('actorId',actor,'receipt',to_jsonb(receipt));
END $$;

CREATE FUNCTION _migration.task69_require_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity uuid;
BEGIN
 identity:=NEW.receipt_id;
 IF NOT _migration.task69_receipt_valid(identity) THEN RAISE EXCEPTION 'Task69 receipt lacks exact atomic audit and delta correspondence'; END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION _migration.task69_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Task69 contract, source occurrences, deltas and receipts are immutable'; END $$;

DO $protection$
DECLARE item text;
BEGIN
 FOREACH item IN ARRAY ARRAY['task69_operation','task69_allowlist','task69_receipt','task69_delta'] LOOP
  EXECUTE format('REVOKE ALL ON _migration.%I FROM PUBLIC,litigation_runtime',item);
  EXECUTE format('CREATE TRIGGER task69_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.task69_immutable()',item);
 END LOOP;
END $protection$;
CREATE TRIGGER task69_allowlist_bound BEFORE INSERT ON _migration.task69_allowlist FOR EACH ROW EXECUTE FUNCTION _migration.task69_allowlist_bound();
CREATE CONSTRAINT TRIGGER task69_contract_complete AFTER INSERT ON _migration.task69_operation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_require_contract();
CREATE CONSTRAINT TRIGGER task69_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_require_receipt();
CREATE CONSTRAINT TRIGGER task69_delta_complete AFTER INSERT ON _migration.task69_delta DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_require_receipt();
REVOKE ALL ON FUNCTION _migration.task69_require_actor(integer,integer,text,timestamptz,uuid),_migration.task69_contract_valid(uuid),_migration.task69_require_contract(),_migration.task69_allowlist_bound(),_migration.task69_receipt_valid(uuid),_migration.task69_require_receipt(),_migration.task69_authorize_issue(uuid,text,text,integer,integer,text,timestamptz,uuid),_migration.task69_immutable() FROM PUBLIC,litigation_runtime;
COMMIT;
