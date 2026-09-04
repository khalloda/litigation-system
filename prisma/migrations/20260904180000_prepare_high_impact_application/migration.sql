-- Task 3.5B: schema preparation only. No quarantined business record is released here.
-- Private migration evidence is intentionally outside Prisma's public application schema.
BEGIN;
SELECT public.audit_set_migration_context();
SELECT public.audit_set_event_context(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
  NULL,'controlled-maintenance:task-3-5b-schema','system');

CREATE TABLE _migration.client_branch_compatibility (
  client_id integer NOT NULL REFERENCES public.clients(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  branch_id smallint NOT NULL REFERENCES public.lookup_client_branch(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  authority text NOT NULL CHECK (authority IN ('D19-existing-association','D39')),
  registered_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  registered_by integer NOT NULL DEFAULT public.audit_current_actor_id()
    REFERENCES public.audit_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  registration_event_id bigint NOT NULL UNIQUE REFERENCES public.audit_events(id),
  registration_event_sha256 text NOT NULL CHECK (registration_event_sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (client_id,branch_id),
  CHECK (registered_by=1)
);

CREATE TABLE _migration.high_impact_application (
  application_key text PRIMARY KEY CHECK (application_key='task-3-5b-d39-d40-d41'),
  workbook_sha256 text NOT NULL CHECK (workbook_sha256=
    '0dc23134639e0bc6477fe1f39613bd7575b56cdcd0085d2f2831a96693f2376b'),
  workbook_bytes integer NOT NULL CHECK (workbook_bytes=172273),
  plan_sha256 text NOT NULL CHECK (plan_sha256=
    '4a1fee01d011b960f48204102e28ed71731a5f1d682006141749460828e33da3'),
  created_rows jsonb NOT NULL CHECK (jsonb_typeof(created_rows)='array' AND jsonb_array_length(created_rows)=841),
  before_inventory jsonb NOT NULL CHECK (jsonb_typeof(before_inventory)='array'),
  audit_event_ids bigint[] NOT NULL CHECK (cardinality(audit_event_ids)=808),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object'),
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_by integer NOT NULL DEFAULT public.audit_current_actor_id()
    REFERENCES public.audit_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (applied_by=1)
);

-- Only full-value continuity proofs for the exact released rows, linked to the
-- existing audit trail. No second business-event taxonomy or runtime gateway.
CREATE TABLE _migration.high_impact_row_proof (
  event_id bigint PRIMARY KEY REFERENCES public.audit_events(id),
  entity_table text NOT NULL,
  entity_id integer NOT NULL,
  before_sha256 text NOT NULL CHECK (before_sha256 ~ '^[0-9a-f]{64}$'),
  after_sha256 text NOT NULL CHECK (after_sha256 ~ '^[0-9a-f]{64}$'),
  event_sha256 text NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE _migration.high_impact_resolution (
  review_id text PRIMARY KEY CHECK (review_id ~ '^[MH]-[0-9]{6}$'),
  application_key text NOT NULL REFERENCES _migration.high_impact_application(application_key)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_record_key text NOT NULL UNIQUE CHECK (source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'),
  extraction_sha256 text NOT NULL CHECK (extraction_sha256=
    '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979'),
  matter_quarantine_id bigint REFERENCES quarantine.matter_transform(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  hearing_quarantine_id bigint REFERENCES quarantine.hearing_transform(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  matter_id integer REFERENCES public.matters(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  hearing_id integer REFERENCES public.hearings(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  d41_note boolean NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_by integer NOT NULL DEFAULT public.audit_current_actor_id()
    REFERENCES public.audit_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (resolved_by=1),
  CHECK ((review_id LIKE 'M-%' AND matter_quarantine_id IS NOT NULL AND matter_id IS NOT NULL
    AND hearing_quarantine_id IS NULL AND hearing_id IS NULL AND NOT d41_note)
    OR (review_id LIKE 'H-%' AND hearing_quarantine_id IS NOT NULL AND hearing_id IS NOT NULL
    AND matter_quarantine_id IS NULL AND matter_id IS NULL))
);

CREATE FUNCTION _migration.refuse_high_impact_evidence_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Task 3.5B application, resolution and compatibility evidence is append-only';
END $$;

CREATE FUNCTION _migration.enforce_client_branch_compatibility() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL AND (NEW.client_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM _migration.client_branch_compatibility p
    WHERE p.client_id=NEW.client_id AND p.branch_id=NEW.branch_id
  )) THEN
    RAISE EXCEPTION 'client/branch pair has no approved compatibility evidence';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER matters_client_branch_compatibility
  BEFORE INSERT OR UPDATE OF client_id,branch_id ON public.matters
  FOR EACH ROW EXECUTE FUNCTION _migration.enforce_client_branch_compatibility();

CREATE FUNCTION _migration.audit_branch_compatibility() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE event_id bigint;
BEGIN
  IF public.audit_current_actor_id()<>1 THEN RAISE EXCEPTION 'migration actor required'; END IF;
  event_id := public.audit_write_event('relationship_added','succeeded','public','lookup_client_branch',
    jsonb_build_object('id',NEW.branch_id),ARRAY['client_id','branch_id'],'{}',
    jsonb_build_object('client_id',NEW.client_id,'branch_id',NEW.branch_id),
    NULL,NULL,'task-3-5b:client-branch-compatibility','{}','owner_reviewed_compatibility',
    jsonb_build_object('authority',NEW.authority));
  NEW.registration_event_id := event_id;
  SELECT encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') INTO NEW.registration_event_sha256
    FROM public.audit_events e WHERE e.id=event_id;
  RETURN NEW;
END $$;
CREATE TRIGGER client_branch_compatibility_audit BEFORE INSERT ON _migration.client_branch_compatibility
  FOR EACH ROW EXECUTE FUNCTION _migration.audit_branch_compatibility();

CREATE FUNCTION _migration.check_high_impact_completeness() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM _migration.high_impact_resolution;
  IF n<>382 OR (SELECT count(*) FROM _migration.high_impact_resolution WHERE matter_id IS NOT NULL)<>55
    OR (SELECT count(*) FROM _migration.high_impact_resolution WHERE hearing_id IS NOT NULL)<>327
    OR (SELECT count(*) FROM _migration.high_impact_resolution WHERE d41_note)<>12
    OR (SELECT count(*) FROM _migration.high_impact_application)<>1 THEN
    RAISE EXCEPTION 'Task 3.5B application must resolve exactly 55 matters and 327 hearings, including 12 D41 notes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _migration.high_impact_resolution r
    LEFT JOIN quarantine.matter_transform mq ON mq.id=r.matter_quarantine_id
    LEFT JOIN quarantine.hearing_transform hq ON hq.id=r.hearing_quarantine_id
    LEFT JOIN public.matters m ON m.id=r.matter_id
    LEFT JOIN public.hearings h ON h.id=r.hearing_id
    WHERE r.source_record_key IS DISTINCT FROM coalesce(mq.src_record_key,hq.src_record_key)
      OR r.source_record_key IS DISTINCT FROM coalesce(m.legacy_source_record_key,h.legacy_source_record_key)
      OR r.extraction_sha256 IS DISTINCT FROM coalesce(mq.extraction_sha256,hq.extraction_sha256)
      OR r.review_id IS DISTINCT FROM CASE WHEN r.matter_id IS NOT NULL
         THEN 'M-'||lpad(mq.id::text,6,'0') ELSE 'H-'||lpad(hq.id::text,6,'0') END
  ) THEN RAISE EXCEPTION 'Task 3.5B durable source/resolution identity mismatch'; END IF;
  IF EXISTS (
    WITH expected(hearing_id,matter_id) AS (VALUES
      (7072,467),(7071,467),(7237,467),(7383,467),(7451,467),
      (7073,468),(7070,468),(7219,468),(7351,468),(7129,515),(7159,515),(7382,515))
    SELECT 1 FROM expected e FULL JOIN (
      SELECT h.legacy_id hearing_id,m.legacy_id matter_id,h.notes,c.label_ar court
      FROM _migration.high_impact_resolution r JOIN public.hearings h ON h.id=r.hearing_id
      JOIN public.matters m ON m.id=h.matter_id LEFT JOIN public.lookup_court c ON c.id=h.court_id
      WHERE r.d41_note OR h.notes='وكيل نيابة/ أسامة الطنطاوي'
    ) a USING(hearing_id,matter_id)
    WHERE e.hearing_id IS NULL OR a.hearing_id IS NULL
      OR a.notes IS DISTINCT FROM 'وكيل نيابة/ أسامة الطنطاوي'
      OR a.court IS DISTINCT FROM 'نيابة الشئون المالية والتجارية'
  ) THEN RAISE EXCEPTION 'D41 exact twelve-hearing note/court contract failed'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER high_impact_application_complete AFTER INSERT ON _migration.high_impact_application
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.check_high_impact_completeness();
CREATE CONSTRAINT TRIGGER high_impact_resolution_complete AFTER INSERT ON _migration.high_impact_resolution
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.check_high_impact_completeness();

CREATE FUNCTION _migration.capture_high_impact_row_proof() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE initial jsonb; old_row jsonb; new_row jsonb; event public.audit_events%ROWTYPE;
BEGIN
  SELECT r->'initial' INTO initial FROM _migration.high_impact_application a,
    LATERAL jsonb_array_elements(a.created_rows) r
    WHERE r->>'table'=TG_TABLE_NAME AND (r->>'id')::integer=OLD.id;
  IF initial IS NULL THEN RETURN NEW; END IF;
  -- Future columns have their own classification/migration contract. This
  -- proof covers every original column, including text beyond audit bounds.
  SELECT jsonb_object_agg(k,to_jsonb(OLD)->k),jsonb_object_agg(k,to_jsonb(NEW)->k)
    INTO old_row,new_row FROM jsonb_object_keys(initial) k;
  IF old_row=new_row THEN RETURN NEW; END IF;
  SELECT e.* INTO event FROM public.audit_events e
    WHERE e.entity_schema='public' AND e.entity_table=TG_TABLE_NAME
      AND e.entity_key=jsonb_build_object('id',OLD.id)
      AND e.action IN ('record_updated','relationship_updated')
      AND e.actor_id=public.audit_current_actor_id() AND e.outcome='succeeded'
      AND e.request_id=current_setting('litigation.audit_request_id')::uuid
      AND e.correlation_id=current_setting('litigation.audit_correlation_id')::uuid
      AND e.audit_session_id=current_setting('litigation.audit_session_id')::uuid
      AND e.occurred_at=statement_timestamp()
    ORDER BY e.id DESC LIMIT 1;
  IF event.id IS NULL THEN RAISE EXCEPTION 'released row change lacks its audit event'; END IF;
  INSERT INTO _migration.high_impact_row_proof VALUES(event.id,TG_TABLE_NAME,OLD.id,
    encode(sha256(convert_to(old_row::text,'UTF8')),'hex'),
    encode(sha256(convert_to(new_row::text,'UTF8')),'hex'),
    encode(sha256(convert_to(to_jsonb(event)::text,'UTF8')),'hex'));
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client_branch_compatibility','high_impact_application','high_impact_resolution','high_impact_row_proof'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON _migration.%I FOR EACH STATEMENT EXECUTE FUNCTION _migration.refuse_high_impact_evidence_change()',t||'_append_only',t);
    EXECUTE format('REVOKE ALL ON _migration.%I FROM PUBLIC,litigation_runtime',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['lookup_client_branch','lookup_court','matters','hearings','matter_lawyers','matter_parties','matter_party_roles','hearing_attendees'] LOOP
    -- PostgreSQL runs same-kind triggers by name: after audit_event_capture.
    EXECUTE format('CREATE TRIGGER zz_task35b_row_proof AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION _migration.capture_high_impact_row_proof()',t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION _migration.refuse_high_impact_evidence_change(),
  _migration.enforce_client_branch_compatibility(),_migration.audit_branch_compatibility(),
  _migration.check_high_impact_completeness(),_migration.capture_high_impact_row_proof() FROM PUBLIC,litigation_runtime;

-- Register only associations already evidenced by current matters. This is a
-- new configuration fact, not an invented historical business event. A clean
-- schema replay has no business rows and therefore no pairs to register.
-- Derive original D19 pairs independently of the mutable current matter
-- links. Quarantined sources remain excluded even after a later release.
CREATE TEMP TABLE task35b_d19 ON COMMIT DROP AS
SELECT DISTINCT c.id client_id,b.id branch_id
FROM public.matters m JOIN staging."الدعاوى" s ON s.src_record_key=m.legacy_source_record_key
JOIN public.clients c ON c.legacy_id=CASE WHEN s."clientID" ~ '^[0-9]+$' THEN s."clientID"::integer END
JOIN public.lookup_client_branch b ON _migration.reviewed_text_key(b.label_ar)=_migration.reviewed_text_key(s."clientBranch")
WHERE NOT EXISTS(SELECT 1 FROM quarantine.matter_transform q WHERE q.src_record_key=s.src_record_key);
DO $$
BEGIN
  IF (SELECT count(*) FROM task35b_d19)<>(CASE WHEN EXISTS(SELECT 1 FROM public.matters WHERE legacy_source_record_key IS NOT NULL) THEN 15 ELSE 0 END)
    OR EXISTS(SELECT client_id,branch_id FROM public.matters WHERE branch_id IS NOT NULL EXCEPT SELECT * FROM task35b_d19)
    OR EXISTS(SELECT * FROM task35b_d19 EXCEPT SELECT client_id,branch_id FROM public.matters WHERE branch_id IS NOT NULL)
  THEN RAISE EXCEPTION 'D19 historical compatibility inventory mismatch'; END IF;
END $$;
INSERT INTO _migration.client_branch_compatibility(client_id,branch_id,authority)
SELECT client_id,branch_id,'D19-existing-association' FROM task35b_d19 ORDER BY client_id,branch_id;
COMMIT;
