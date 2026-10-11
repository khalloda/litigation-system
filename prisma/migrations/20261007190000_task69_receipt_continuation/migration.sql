-- Task69 exact same-operation continuation and committed parent receipt gate.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_user<>session_user OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>85
 OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name<>'20261007190000_task69_receipt_continuation') THEN RAISE EXCEPTION 'Exact migration85 direct prestate required'; END IF;
END $$;
CREATE FUNCTION _migration.task69_receipt_postimages_valid(p_receipt uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
DECLARE r _migration.task69_receipt%ROWTYPE; d _migration.task69_delta%ROWTYPE; following record; expected jsonb; current_row jsonb;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE receipt_id=p_receipt;
 IF NOT FOUND OR r.phase<>'apply' OR _migration.task69_receipt_valid(p_receipt) IS NOT TRUE
 OR EXISTS(SELECT 1 FROM _migration.task69_receipt WHERE operation_id=r.operation_id AND issue_id=r.issue_id AND phase='compensate') THEN RETURN false; END IF;
 FOR d IN SELECT * FROM _migration.task69_delta WHERE receipt_id=p_receipt ORDER BY ordinal LOOP
  expected:=d.after_values;
  -- Audit sequence gives actual write order, independent of timestamp ties.
  -- Every link must be a complete receipt in this exact operation and start at
  -- the previous complete postimage. An ordinary native edit breaks the chain.
  FOR following IN SELECT n.*,next_receipt.phase FROM _migration.task69_delta n JOIN _migration.task69_receipt next_receipt USING(receipt_id)
   WHERE next_receipt.operation_id=r.operation_id AND n.entity_schema=d.entity_schema AND n.entity_table=d.entity_table AND n.entity_key=d.entity_key
    AND n.audit_event_id>d.audit_event_id ORDER BY n.audit_event_id LOOP
   IF following.phase<>'apply' OR following.before_values IS DISTINCT FROM expected OR _migration.task69_receipt_valid(following.receipt_id) IS NOT TRUE THEN RETURN false; END IF;
   expected:=following.after_values;
  END LOOP;
  EXECUTE format('SELECT to_jsonb(x) FROM %I.%I x WHERE id=$1 FOR SHARE',d.entity_schema,d.entity_table) INTO current_row USING (d.entity_key->>'id')::integer;
  IF current_row IS DISTINCT FROM expected THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION _migration.task69_committed_parent(p_operation uuid,p_issue text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r _migration.task69_receipt%ROWTYPE; origin_xid xid; identity integer; stage text;
BEGIN
 SELECT * INTO r FROM _migration.task69_receipt WHERE operation_id=p_operation AND issue_id=p_issue AND phase='apply';
 SELECT xmin INTO origin_xid FROM _migration.task69_receipt WHERE receipt_id=r.receipt_id;
 IF NOT FOUND OR origin_xid=pg_current_xact_id()::text::xid THEN RAISE EXCEPTION 'Committed exact parent receipt required before step restoration'; END IF;
 SELECT a.stage INTO stage FROM _migration.task69_allowlist a WHERE a.operation_id=p_operation AND a.issue_id=p_issue;
 IF stage<>'S3-admin-parents' AND NOT(stage='shared-dependency' AND p_issue LIKE 'GENERATED-PARENT/%') THEN RAISE EXCEPTION 'Unapproved administrative parent namespace'; END IF;
 identity:=(r.returned_ids->>'taskId')::integer;
 IF identity IS NULL OR _migration.task69_receipt_postimages_valid(r.receipt_id) IS NOT TRUE
 OR NOT EXISTS(SELECT 1 FROM _migration.task69_admin_origin o WHERE o.task_id=identity AND o.receipt_id=r.receipt_id) THEN RAISE EXCEPTION 'Parent receipt/postimages differ'; END IF;
 PERFORM 1 FROM public.admin_tasks WHERE id=identity AND NOT is_archived FOR SHARE;
 IF NOT FOUND OR _migration.admin_edit_current_valid(identity) IS NOT TRUE THEN RAISE EXCEPTION 'Parent missing, archived or lacks complete history'; END IF;
 RETURN identity;
END $$;
CREATE OR REPLACE FUNCTION _migration.task69_authorize_issue(p_operation uuid,p_issue text,p_payload_hash text,p_account integer,p_version integer,p_role text,p_expires timestamptz,p_session uuid) RETURNS jsonb
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
 IF _migration.task69_receipt_postimages_valid(receipt.receipt_id) IS NOT TRUE THEN RAISE EXCEPTION 'Task69 receipt postimage was edited or its continuation differs'; END IF;
 RETURN jsonb_build_object('actorId',actor,'receipt',to_jsonb(receipt));
END $$;
REVOKE ALL ON FUNCTION _migration.task69_receipt_postimages_valid(uuid),_migration.task69_committed_parent(uuid,text) FROM PUBLIC,litigation_runtime;
COMMIT;
