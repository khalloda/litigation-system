-- Task69 S8 factual history. No business row, attendance, assignment or audit is changed.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>92
 THEN RAISE EXCEPTION 'Exact migration92 direct prestate required';END IF;
END $$;
CREATE TABLE _migration.task69_history_disposition(
 receipt_id uuid PRIMARY KEY REFERENCES _migration.task69_receipt(receipt_id) DEFERRABLE INITIALLY DEFERRED,
 kind text NOT NULL CHECK(kind IN('attendee-fragment','historical-staff','unassigned-hearing')),
 source_values jsonb NOT NULL CHECK(jsonb_typeof(source_values)='object'),
 approved_outcome jsonb NOT NULL CHECK(jsonb_typeof(approved_outcome)='object'),
 witness jsonb NOT NULL CHECK(jsonb_typeof(witness)='object')
);
REVOKE ALL ON _migration.task69_history_disposition FROM PUBLIC,litigation_runtime;
CREATE TRIGGER task69_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.task69_history_disposition FOR EACH STATEMENT EXECUTE FUNCTION _migration.task69_immutable();
CREATE FUNCTION _migration.task69_history_context(p_issue text,p_outcome jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE result jsonb;hid integer;
BEGIN
 IF p_issue LIKE 'deferred.D54:%' THEN
  SELECT jsonb_build_object('client',to_jsonb(c)) INTO result FROM public.clients c WHERE id=(p_outcome->>'clientId')::int;
 ELSIF p_issue LIKE 'deferred.hearing-parent:%' OR p_issue LIKE 'quarantine.attendee_span:%' THEN
  hid:=(p_outcome->>'hearingId')::int;
  SELECT jsonb_build_object('hearing',to_jsonb(h),'attendees',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.hearing_attendees a WHERE hearing_id=hid),'[]')) INTO result FROM public.hearings h WHERE id=hid;
  IF p_issue LIKE 'quarantine.attendee_span:%' THEN
   SELECT result||jsonb_build_object('cell',to_jsonb(c),'spans',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence) FROM _migration.attendee_source_span s WHERE s.cell_id=c.cell_id),'[]')) INTO result FROM _migration.attendee_source_cell c WHERE c.cell_id=p_outcome->>'cellId';
  END IF;
 ELSE RAISE EXCEPTION 'Unsupported factual history namespace';END IF;
 IF result IS NULL THEN RAISE EXCEPTION 'Missing exact historical subject';END IF;
 RETURN result;
END $$;
CREATE FUNCTION _migration.task69_history_insert_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE a _migration.task69_allowlist%ROWTYPE;
BEGIN
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=nullif(current_setting('litigation.task69_operation',true),'')::uuid AND issue_id=current_setting('litigation.task69_issue',true);
 IF NOT FOUND OR a.stage<>'S8-history-dispositions' OR a.entry_text::jsonb->>'disposition'<>'APPROVED_HISTORICAL_ONLY'
 OR NEW.source_values IS DISTINCT FROM a.entry_text::jsonb->'source' OR NEW.approved_outcome IS DISTINCT FROM a.payload_text::jsonb
 OR NEW.witness IS DISTINCT FROM _migration.task69_history_context(a.issue_id,a.payload_text::jsonb)
 THEN RAISE EXCEPTION 'Exact current approved factual history required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task69_history_insert_guard BEFORE INSERT ON _migration.task69_history_disposition FOR EACH ROW EXECUTE FUNCTION _migration.task69_history_insert_guard();
CREATE FUNCTION _migration.task69_history_receipt_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE r _migration.task69_receipt%ROWTYPE;a _migration.task69_allowlist%ROWTYPE;d _migration.task69_history_disposition%ROWTYPE;o jsonb;s jsonb;span jsonb;target jsonb;reconstructed text:='';pos integer:=0;seq integer:=0;units integer;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE receipt_id=p_receipt;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO a FROM _migration.task69_allowlist WHERE operation_id=r.operation_id AND issue_id=r.issue_id;
 IF a.stage<>'S8-history-dispositions' OR r.phase='compensate' THEN RETURN true;END IF;
 SELECT * INTO d FROM _migration.task69_history_disposition WHERE receipt_id=p_receipt;
 o:=a.payload_text::jsonb;s:=a.entry_text::jsonb->'source';
 IF NOT FOUND OR a.entry_text::jsonb->>'disposition'<>'APPROVED_HISTORICAL_ONLY' OR r.effect<>'no-business-write' OR r.expected_delta_count<>0
 OR d.source_values IS DISTINCT FROM s OR d.approved_outcome IS DISTINCT FROM o
 OR r.returned_ids IS DISTINCT FROM jsonb_build_object('kind',d.kind,'subjectId',CASE WHEN d.kind='historical-staff' THEN o->'clientId' ELSE o->'hearingId' END,'businessChanged',false)
 OR r.source_occurrences IS DISTINCT FROM jsonb_build_array(jsonb_build_object('source',s,'approvedOutcome',o,'witness',d.witness))
 OR EXISTS(SELECT 1 FROM public.audit_events WHERE request_id=r.request_id)
 OR EXISTS(SELECT 1 FROM _migration.task69_delta WHERE receipt_id=p_receipt) THEN RETURN false;END IF;
 IF d.kind='historical-staff' THEN
  RETURN a.issue_id='deferred.D54:'||(o->>'clientId') AND o->'createOwnership'='false'::jsonb AND o->'createAccount'='false'::jsonb AND o->'createNotifications'='false'::jsonb
  AND d.witness->'client'->'id'=o->'clientId' AND d.witness->'client'->'contact_person_id' IS NOT DISTINCT FROM o->'contact_person_id'
  AND d.witness->'client'->'legacy_contact_lawyer_raw'=o->'rawHistoricalStaff' AND s->'raw_value'=o->'rawHistoricalStaff';
 ELSIF d.kind='unassigned-hearing' THEN
  RETURN a.issue_id='deferred.hearing-parent:'||(o->>'hearingId') AND o->'preserveAllValues'='true'::jsonb AND o->'matter_id'='null'::jsonb
  AND d.witness->'hearing'->'id'=o->'hearingId' AND d.witness->'hearing'->'matter_id'='null'::jsonb AND jsonb_typeof(d.witness->'attendees')='array';
 ELSIF d.kind<>'attendee-fragment' THEN RETURN false;END IF;
 IF a.issue_id<>'quarantine.attendee_span:'||(o->>'fragmentId') OR o->'createPhysicalAttendance'<>'false'::jsonb
 OR d.witness->'hearing'->'id' IS DISTINCT FROM o->'hearingId' OR d.witness->'cell'->'cell_id' IS DISTINCT FROM o->'cellId'
 OR s->'fragment_id' IS DISTINCT FROM o->'fragmentId' OR s->'cell_id' IS DISTINCT FROM o->'cellId'
 OR s->'raw' IS DISTINCT FROM o->'raw' OR s->'start_offset' IS DISTINCT FROM o->'startUTF16' OR s->'end_offset' IS DISTINCT FROM o->'endUTF16' OR s->'sequence' IS DISTINCT FROM o->'sequence'
 OR jsonb_typeof(d.witness->'spans') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 FOR span IN SELECT value FROM jsonb_array_elements(d.witness->'spans') LOOP
  seq:=seq+1;
  SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::int INTO units FROM regexp_split_to_table(span->>'raw','') c;
  IF span->'sequence' IS DISTINCT FROM to_jsonb(seq) OR span->'start_offset' IS DISTINCT FROM to_jsonb(pos)
  OR span->'end_offset' IS DISTINCT FROM to_jsonb(pos+units) OR span->'cell_id' IS DISTINCT FROM o->'cellId' THEN RETURN false;END IF;
  pos:=pos+units;reconstructed:=reconstructed||(span->>'raw');
  IF span->'fragment_id'=o->'fragmentId' THEN target:=span;END IF;
 END LOOP;
 RETURN seq>0 AND reconstructed=d.witness->'cell'->>'original_cell'
 AND _migration.attendee_cell_content_sha256(reconstructed)=d.witness->'cell'->>'original_cell_sha256'
 AND target->'raw'=o->'raw' AND target->'start_offset'=o->'startUTF16' AND target->'end_offset'=o->'endUTF16';
END $$;
CREATE FUNCTION _migration.task69_history_receipt_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF _migration.task69_history_receipt_valid(NEW.receipt_id) IS NOT TRUE THEN RAISE EXCEPTION 'Task69 history receipt must preserve exact factual context without business effects';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER task69_history_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_history_receipt_complete();
CREATE CONSTRAINT TRIGGER task69_history_disposition_complete AFTER INSERT ON _migration.task69_history_disposition DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_history_receipt_complete();
REVOKE ALL ON FUNCTION _migration.task69_history_context(text,jsonb),_migration.task69_history_insert_guard(),_migration.task69_history_receipt_valid(uuid),_migration.task69_history_receipt_complete() FROM PUBLIC,litigation_runtime;
COMMIT;
