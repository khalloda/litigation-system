-- ===========================================================================
--  STAGE D — TRANSFORM MATTERS (task 2.6)
--
--  Reads staging."الدعاوى" and writes public.matters or, when a reviewed
--  decision is still required, quarantine.matter_transform. One source row
--  must land in exactly one of those places. Nothing in staging is changed.
--
--  psql variable force_failure is 0 normally and 1 only in the isolated
--  fixture suite. The deliberate late failure proves transaction rollback.
-- ===========================================================================

BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT public.audit_set_migration_context();
SELECT public.audit_set_event_context(
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  NULL,
  'controlled-maintenance:task-2-6-matters',
  'system'
);
SELECT pg_advisory_xact_lock(hashtext('litigation-system/task-2.6/matters'));

CREATE TEMP TABLE matter_preservation_guard ON COMMIT DROP AS
SELECT jsonb_build_object(
    'value_answers', (SELECT count(*) FROM quarantine.review_value WHERE answered_at IS NOT NULL),
    'finding_answers', (SELECT count(*) FROM quarantine.finding WHERE answered_at IS NOT NULL),
    'answer_digest',
      (SELECT encode(sha256(convert_to(coalesce(string_agg(payload, E'\n' ORDER BY kind, id), ''), 'UTF8')), 'hex')
         FROM (
           SELECT 'V' AS kind, id,
                  jsonb_build_array(id, topic, value, firm_answer, firm_person, firm_note,
                                    answered_at, answered_by)::text payload
             FROM quarantine.review_value WHERE answered_at IS NOT NULL
           UNION ALL
           SELECT 'F', id,
                  jsonb_build_array(id, topic, src_table, src_file, src_row_num,
                                    column_name, original_value, firm_answer, firm_note,
                                    answered_at, answered_by)::text
             FROM quarantine.finding WHERE answered_at IS NOT NULL
         ) answered),
    'clients', (SELECT count(*) FROM clients),
    'clients_digest',
      (SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(c)::text, E'\n' ORDER BY c.id), ''), 'UTF8')), 'hex')
         FROM clients c),
    'contacts', (SELECT count(*) FROM contacts),
    'contacts_digest',
      (SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(c)::text, E'\n' ORDER BY c.id), ''), 'UTF8')), 'hex')
         FROM contacts c)
) AS snapshot;

-- One row per resolved destination. Repeated identical answers are harmless;
-- different answers for one target field are a quarantine conflict below.
CREATE TEMP TABLE matter_rule_output (
    src_record_key text NOT NULL,
    target_field   text NOT NULL,
    target_value   text NOT NULL,
    source_rule    text NOT NULL
) ON COMMIT DROP;

-- The two overloaded Access classification columns. The reviewed text key
-- reconciles CRLF/literal-\n representation and edge spaces only; it does not
-- fold Arabic characters or internal wording.
INSERT INTO matter_rule_output
SELECT s.src_record_key, cw.target_field, cw.target_value,
       'classification:' || source.source_field
  FROM staging."الدعاوى" s
 CROSS JOIN LATERAL (
       VALUES ('matterCategory'::text, s."matterCategory"),
              ('matterDegree', s."matterDegree")
 ) source(source_field, raw_value)
  JOIN migration_crosswalk cw
    ON cw.source_field = source.source_field
   AND _migration.reviewed_text_key(cw.source_value)
       = _migration.reviewed_text_key(source.raw_value)
 WHERE source.raw_value IS NOT NULL
   AND cw.target_field IN ('matter_type', 'matter_category', 'degree', 'venue', 'importance');

-- One reviewed matterCategory value contains three facts. Its structured
-- target points to another reviewed category rule and one reviewed
-- destination; the transform derives all three from those records.
CREATE TEMP TABLE matter_classification_split ON COMMIT DROP AS
SELECT s.src_record_key,
       btrim(substring(cw.target_value FROM 'category=([^+]+)')) AS category_part,
       btrim(substring(cw.target_value FROM 'distination=(.*)$')) AS destination_part
  FROM staging."الدعاوى" s
  JOIN migration_crosswalk cw
    ON cw.source_field = 'matterCategory'
   AND cw.target_field = 'SPLIT'
   AND _migration.reviewed_text_key(cw.source_value)
       = _migration.reviewed_text_key(s."matterCategory");

INSERT INTO matter_rule_output
SELECT split.src_record_key, nested.target_field, nested.target_value,
       'classification:SPLIT/category'
  FROM matter_classification_split split
  JOIN migration_crosswalk nested
    ON nested.source_field = 'matterCategory'
   AND _migration.reviewed_text_key(nested.source_value)
       = _migration.reviewed_text_key(split.category_part)
 WHERE nested.target_field IN ('matter_type', 'matter_category', 'degree', 'venue', 'importance');

INSERT INTO matter_rule_output
SELECT split.src_record_key, 'venue',
       substring(nested.reviewer_note FROM 'Venue=([^ ]+)'),
       'classification:SPLIT/venue'
  FROM matter_classification_split split
  JOIN migration_crosswalk nested
    ON nested.source_field = 'matterCategory'
   AND _migration.reviewed_text_key(nested.source_value)
       = _migration.reviewed_text_key(split.category_part)
 WHERE nested.reviewer_note LIKE '%Venue=%';

INSERT INTO matter_rule_output
SELECT src_record_key, 'matter_destination', destination_part,
       'classification:SPLIT/destination'
  FROM matter_classification_split;

-- The dedicated importance and destination columns are already lists.
INSERT INTO matter_rule_output
SELECT s.src_record_key, 'importance', l.label_ar, 'matterImportance'
  FROM staging."الدعاوى" s
  JOIN lookup_importance l ON l.label_ar = s."matterImportance";

INSERT INTO matter_rule_output
SELECT s.src_record_key, 'matter_destination', l.label_ar, 'matterDistination'
  FROM staging."الدعاوى" s
  JOIN lookup_matter_destination l ON l.label_ar = s."matterDistination";

-- D19. A genuine branch remains a branch on the matter. A reviewed non-branch
-- contributes its reviewed type/category/degree, is discarded, or quarantines.
INSERT INTO matter_rule_output
SELECT s.src_record_key, 'branch', l.label_ar, 'clientBranch:direct'
  FROM staging."الدعاوى" s
  JOIN lookup_client_branch l
    ON _migration.reviewed_text_key(l.label_ar)
       = _migration.reviewed_text_key(s."clientBranch");

INSERT INTO matter_rule_output
SELECT s.src_record_key, cw.target_field, cw.target_value, 'clientBranch:crosswalk'
  FROM staging."الدعاوى" s
  JOIN migration_crosswalk cw
    ON cw.source_field = 'client_branch'
   AND _migration.reviewed_text_key(cw.source_value)
       = _migration.reviewed_text_key(s."clientBranch")
 WHERE cw.target_field IN ('matter_type', 'matter_category', 'degree');

-- D20/D22. Court SPLIT remainders that are circuits land in circuit. A
-- hearing_note remainder on a matter cannot be attached to a hearing without
-- guessing and therefore becomes a quarantine reason below.
CREATE TEMP TABLE matter_court_rule ON COMMIT DROP AS
SELECT s.src_record_key, cw.target_field, cw.target_value, cw.reviewer_note
  FROM staging."الدعاوى" s
  JOIN migration_crosswalk cw
    ON cw.source_field = 'court'
   AND _migration.reviewed_text_key(cw.source_value)
       = _migration.reviewed_text_key(s."matterCourt");

INSERT INTO matter_rule_output
SELECT s.src_record_key, 'court', l.label_ar, 'matterCourt:direct'
  FROM staging."الدعاوى" s
  JOIN lookup_court l
    ON _migration.reviewed_text_key(l.label_ar)
       = _migration.reviewed_text_key(s."matterCourt")
 WHERE NOT EXISTS (SELECT 1 FROM matter_court_rule r WHERE r.src_record_key = s.src_record_key);

INSERT INTO matter_rule_output
SELECT src_record_key, 'court', target_value,
       CASE WHEN target_field = 'SPLIT' THEN 'matterCourt:SPLIT' ELSE 'matterCourt:crosswalk' END
  FROM matter_court_rule
 WHERE target_field IN ('court', 'SPLIT');

INSERT INTO matter_rule_output
SELECT src_record_key, 'matter_destination', target_value, 'matterCourt:destination'
  FROM matter_court_rule
 WHERE target_field = 'matter_destination';

INSERT INTO matter_rule_output
SELECT src_record_key, 'circuit',
       substring(reviewer_note FROM $REGEX$circuit='([^']+)'$REGEX$),
       'matterCourt:SPLIT/circuit'
  FROM matter_court_rule
 WHERE target_field = 'SPLIT' AND reviewer_note LIKE '%circuit=%';

INSERT INTO matter_rule_output
SELECT src_record_key, 'circuit', "matterCircut", 'matterCircut'
  FROM staging."الدعاوى"
 WHERE "matterCircut" IS NOT NULL;

CREATE TEMP TABLE matter_rule_conflict ON COMMIT DROP AS
SELECT src_record_key, target_field,
       array_agg(DISTINCT target_value ORDER BY target_value) AS target_values
  FROM matter_rule_output
 GROUP BY src_record_key, target_field
HAVING count(DISTINCT target_value) > 1;

CREATE TEMP TABLE matter_quarantine_reason (
    src_record_key text NOT NULL,
    reason_code    text NOT NULL,
    detail         jsonb NOT NULL,
    PRIMARY KEY (src_record_key, reason_code)
) ON COMMIT DROP;

INSERT INTO matter_quarantine_reason
SELECT src_record_key, 'matter_no_client',
       jsonb_build_object('clientID', "clientID")
  FROM staging."الدعاوى"
 WHERE "clientID" IS NULL OR "clientID" = '';

INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'invalid_client_link',
       jsonb_build_object('clientID', s."clientID")
  FROM staging."الدعاوى" s
 WHERE s."clientID" IS NOT NULL AND s."clientID" <> ''
   AND (s."clientID" !~ '^\d{1,9}$'
        OR NOT EXISTS (
            SELECT 1 FROM clients c
             WHERE c.legacy_id = CASE WHEN s."clientID" ~ '^\d{1,9}$'
                                      THEN s."clientID"::integer END));

INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'separate_client',
       jsonb_build_object('clientID', s."clientID", 'clientBranch', s."clientBranch",
                          'reviewer_note', cw.reviewer_note)
  FROM staging."الدعاوى" s
  JOIN migration_crosswalk cw
    ON cw.source_field = 'client_branch' AND cw.target_field = 'separate_client'
   AND _migration.reviewed_text_key(cw.source_value)
       = _migration.reviewed_text_key(s."clientBranch");

INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'branch_requires_review',
       jsonb_build_object('clientBranch', s."clientBranch", 'reviewer_note', cw.reviewer_note)
  FROM staging."الدعاوى" s
  JOIN migration_crosswalk cw
    ON cw.source_field = 'client_branch' AND cw.target_field = 'quarantine'
   AND _migration.reviewed_text_key(cw.source_value)
       = _migration.reviewed_text_key(s."clientBranch");

INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'unmapped_importance',
       jsonb_build_object('matterImportance', s."matterImportance")
  FROM staging."الدعاوى" s
 WHERE s."matterImportance" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM lookup_importance l WHERE l.label_ar = s."matterImportance");

INSERT INTO matter_quarantine_reason
SELECT conflict.src_record_key, 'classification_conflict:' || conflict.target_field,
       jsonb_build_object(
           'target_field', conflict.target_field,
           'target_values', conflict.target_values,
           'matterCategory', s."matterCategory",
           'matterDegree', s."matterDegree",
           'clientBranch', s."clientBranch"
       )
  FROM matter_rule_conflict conflict
  JOIN staging."الدعاوى" s USING (src_record_key)
 WHERE conflict.target_field IN ('matter_type', 'matter_category', 'degree', 'venue',
                                 'importance', 'matter_destination', 'branch', 'court', 'circuit');

INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'court_remainder_is_hearing_note',
       jsonb_build_object('matterCourt', s."matterCourt", 'reviewer_note', r.reviewer_note)
  FROM staging."الدعاوى" s
  JOIN matter_court_rule r USING (src_record_key)
 WHERE r.target_field = 'SPLIT' AND r.reviewer_note LIKE '%hearing_note=%';

INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'court_split_remainder_unhandled',
       jsonb_build_object('matterCourt', s."matterCourt", 'reviewer_note', r.reviewer_note)
  FROM staging."الدعاوى" s
  JOIN matter_court_rule r USING (src_record_key)
 WHERE r.target_field = 'SPLIT'
   AND r.reviewer_note NOT LIKE '%circuit=%'
   AND r.reviewer_note NOT LIKE '%hearing_note=%';

-- `26` is the reviewed admin-task correction for task 2.9, not a matter rule.
INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'court_rule_reserved_for_task_2_9',
       jsonb_build_object('matterCourt', s."matterCourt", 'target_value', r.target_value)
  FROM staging."الدعاوى" s JOIN matter_court_rule r USING (src_record_key)
 WHERE r.target_field = 'circuit';

-- Missing reviewed mapping coverage is visible quarantine, never a guessed
-- direct match. Each source field is checked against the appropriate list and
-- crosswalk using the one reviewed-text key.
INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'unmapped_matter_category',
       jsonb_build_object('matterCategory', s."matterCategory")
  FROM staging."الدعاوى" s
 WHERE s."matterCategory" IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM migration_crosswalk cw
        WHERE cw.source_field = 'matterCategory'
          AND _migration.reviewed_text_key(cw.source_value)
              = _migration.reviewed_text_key(s."matterCategory"));

INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'unmapped_matter_degree',
       jsonb_build_object('matterDegree', s."matterDegree")
  FROM staging."الدعاوى" s
 WHERE s."matterDegree" IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM migration_crosswalk cw
        WHERE cw.source_field = 'matterDegree'
          AND _migration.reviewed_text_key(cw.source_value)
              = _migration.reviewed_text_key(s."matterDegree"));

INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'unmapped_branch',
       jsonb_build_object('clientBranch', s."clientBranch")
  FROM staging."الدعاوى" s
 WHERE s."clientBranch" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM lookup_client_branch l
                    WHERE _migration.reviewed_text_key(l.label_ar)
                          = _migration.reviewed_text_key(s."clientBranch"))
   AND NOT EXISTS (SELECT 1 FROM migration_crosswalk cw
                    WHERE cw.source_field = 'client_branch'
                      AND _migration.reviewed_text_key(cw.source_value)
                          = _migration.reviewed_text_key(s."clientBranch"));

INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'unmapped_court',
       jsonb_build_object('matterCourt', s."matterCourt")
  FROM staging."الدعاوى" s
 WHERE s."matterCourt" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM lookup_court l
                    WHERE _migration.reviewed_text_key(l.label_ar)
                          = _migration.reviewed_text_key(s."matterCourt"))
   AND NOT EXISTS (SELECT 1 FROM matter_court_rule r WHERE r.src_record_key = s.src_record_key);

INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'unmapped_destination',
       jsonb_build_object('matterDistination', s."matterDistination")
  FROM staging."الدعاوى" s
 WHERE s."matterDistination" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM lookup_matter_destination l
                    WHERE l.label_ar = s."matterDistination");

INSERT INTO matter_quarantine_reason
SELECT s.src_record_key, 'invalid_scalar_value',
       jsonb_build_object(
           'matterID', s."matterID", 'matterStartDate', s."matterStartDate",
           'matterEndDate', s."matterEndDate", 'matterAskedAmount', s."matterAskedAmount",
           'matterJudgedAmount', s."matterJudgedAmount", 'matterSelect', s."matterSelect"
       )
 FROM staging."الدعاوى" s
 WHERE s."matterID" IS NULL OR s."matterID" !~ '^\d{1,9}$'
    OR (s."matterStartDate" IS NOT NULL
        AND (s."matterStartDate" !~ '^\d{4}-\d{2}-\d{2} 00:00:00$'
             OR NOT pg_input_is_valid(left(s."matterStartDate", 10), 'date')))
    OR (s."matterEndDate" IS NOT NULL
        AND (s."matterEndDate" !~ '^\d{4}-\d{2}-\d{2} 00:00:00$'
             OR NOT pg_input_is_valid(left(s."matterEndDate", 10), 'date')))
    OR (s."matterAskedAmount" IS NOT NULL AND s."matterAskedAmount" !~ '^\d{1,16}(\.\d{1,2})?$')
    OR (s."matterJudgedAmount" IS NOT NULL AND s."matterJudgedAmount" !~ '^\d{1,16}(\.\d{1,2})?$')
    OR s."matterSelect" NOT IN ('true', 'false');

CREATE TEMP TABLE matter_resolved_value ON COMMIT DROP AS
SELECT src_record_key,
       max(target_value) FILTER (WHERE target_field = 'matter_type') AS matter_type,
       max(target_value) FILTER (WHERE target_field = 'matter_category') AS matter_category,
       max(target_value) FILTER (WHERE target_field = 'degree') AS degree,
       max(target_value) FILTER (WHERE target_field = 'venue') AS venue,
       max(target_value) FILTER (WHERE target_field = 'importance') AS importance,
       max(target_value) FILTER (WHERE target_field = 'matter_destination') AS destination,
       max(target_value) FILTER (WHERE target_field = 'branch') AS branch,
       max(target_value) FILTER (WHERE target_field = 'court') AS court,
       max(target_value) FILTER (WHERE target_field = 'circuit') AS circuit
  FROM matter_rule_output
 GROUP BY src_record_key;

CREATE TEMP TABLE matter_quarantine_plan ON COMMIT DROP AS
SELECT s.src_record_key, s.src_extraction_sha256 AS extraction_sha256,
       s.src_file, s.src_row_num, s."matterID" AS legacy_matter_id,
       array_agg(reason.reason_code ORDER BY reason.reason_code) AS reason_codes,
       jsonb_agg(reason.detail ORDER BY reason.reason_code) AS reason_details,
       to_jsonb(s) - ARRAY['src_file', 'src_row_num', 'src_record_key', 'src_extraction_sha256'] AS source_payload
  FROM staging."الدعاوى" s
  JOIN matter_quarantine_reason reason USING (src_record_key)
 GROUP BY s.src_record_key, s.src_extraction_sha256, s.src_file, s.src_row_num, s."matterID", s;

CREATE TEMP TABLE matter_target_plan ON COMMIT DROP AS
SELECT s.src_record_key AS legacy_source_record_key,
       s.src_extraction_sha256 AS legacy_source_extraction_sha256,
       to_jsonb(s) - ARRAY['src_file', 'src_row_num', 'src_record_key', 'src_extraction_sha256'] AS legacy_source_payload,
       CASE WHEN s."matterID" ~ '^\d{1,9}$' THEN s."matterID"::integer END AS legacy_id,
       s."matterAR" AS case_number_ar,
       s."matterEN" AS case_number_en,
       s."matterSubject" AS subject,
       client.id AS client_id,
       branch.id AS branch_id,
       matter_type.id AS matter_type_id,
       category.id AS matter_category_id,
       degree.id AS degree_id,
       venue.id AS venue_id,
       importance.id AS importance_id,
       destination.id AS destination_id,
       s."matterCategory" AS legacy_category_raw,
       s."matterDegree" AS legacy_degree_raw,
       s."clientBranch" AS legacy_branch_raw,
       s."matterStatus" AS status,
       s."matterNotes1" AS notes_1,
       s."matterNotes2" AS notes_2,
       CASE WHEN s."matterStartDate" ~ '^\d{4}-\d{2}-\d{2} 00:00:00$'
                  AND pg_input_is_valid(left(s."matterStartDate", 10), 'date')
            THEN left(s."matterStartDate", 10)::date END AS start_date,
       CASE WHEN s."matterEndDate" ~ '^\d{4}-\d{2}-\d{2} 00:00:00$'
                  AND pg_input_is_valid(left(s."matterEndDate", 10), 'date')
            THEN left(s."matterEndDate", 10)::date END AS end_date,
       CASE WHEN s."matterAskedAmount" ~ '^\d{1,16}(\.\d{1,2})?$'
            THEN s."matterAskedAmount"::numeric(18,2) END AS asked_amount,
       CASE WHEN s."matterJudgedAmount" ~ '^\d{1,16}(\.\d{1,2})?$'
            THEN s."matterJudgedAmount"::numeric(18,2) END AS judged_amount,
       CASE WHEN s."matterSelect" IN ('true', 'false') THEN s."matterSelect"::boolean END AS legacy_selected,
       s."matteEvaluation" AS evaluation,
       s."الموقف الحالي" AS current_status,
       s."نوع العميل" AS legacy_client_type_raw,
       s."المخصص المالي" AS legacy_financial_allocation_raw,
       s."الرأي القانوني" AS legal_opinion,
       s."contractID" AS legacy_contract_id_raw,
       s."matterPartner" AS legacy_partner_raw,
       court.id AS court_id,
       s."matterCourt" AS legacy_court_raw,
       resolved.circuit,
       s."circutSecretary" AS circuit_secretary,
       s."courtFloor" AS court_floor,
       s."courtHall" AS court_hall,
       s."matterShelf" AS court_shelf,
       s."secretaryRoom" AS court_secretary_room,
       s."خطاب الأتعاب" AS fee_letter_ref
  FROM staging."الدعاوى" s
  LEFT JOIN matter_resolved_value resolved USING (src_record_key)
  JOIN clients client
    ON client.legacy_id = CASE WHEN s."clientID" ~ '^\d{1,9}$' THEN s."clientID"::integer END
  LEFT JOIN lookup_client_branch branch ON branch.label_ar = resolved.branch
  JOIN lookup_matter_type matter_type
    ON matter_type.label_ar = coalesce(resolved.matter_type,
        (SELECT label_ar FROM lookup_matter_type WHERE is_default))
  LEFT JOIN lookup_matter_category category ON category.label_ar = resolved.matter_category
  LEFT JOIN lookup_degree degree ON degree.label_ar = resolved.degree
  LEFT JOIN lookup_venue venue ON venue.label_ar = resolved.venue
  LEFT JOIN lookup_importance importance ON importance.label_ar = resolved.importance
  LEFT JOIN lookup_matter_destination destination ON destination.label_ar = resolved.destination
  LEFT JOIN lookup_court court ON court.label_ar = resolved.court
 WHERE NOT EXISTS (SELECT 1 FROM matter_quarantine_reason q WHERE q.src_record_key = s.src_record_key);

INSERT INTO quarantine.matter_transform (
    src_record_key, extraction_sha256, src_file, src_row_num, legacy_matter_id,
    reason_codes, reason_details, source_payload
)
SELECT src_record_key, extraction_sha256, src_file, src_row_num, legacy_matter_id,
       reason_codes, reason_details, source_payload
  FROM matter_quarantine_plan
 ORDER BY src_row_num, src_record_key
ON CONFLICT (src_record_key) DO NOTHING;

INSERT INTO matters (
    legacy_id, legacy_source_record_key, legacy_source_extraction_sha256,
    legacy_source_payload, case_number_ar, case_number_en, subject, client_id,
    branch_id, matter_type_id, matter_category_id, degree_id, venue_id,
    importance_id, destination_id, legacy_category_raw, legacy_degree_raw,
    legacy_branch_raw, status, notes_1, notes_2, start_date, end_date,
    asked_amount, judged_amount, legacy_selected, evaluation, current_status,
    legacy_client_type_raw, legacy_financial_allocation_raw, legal_opinion,
    legacy_contract_id_raw, legacy_partner_raw, court_id, legacy_court_raw,
    circuit, circuit_secretary, court_floor, court_hall, court_shelf,
    court_secretary_room, fee_letter_ref, created_at, updated_at
)
SELECT legacy_id, legacy_source_record_key, legacy_source_extraction_sha256,
       legacy_source_payload, case_number_ar, case_number_en, subject, client_id,
       branch_id, matter_type_id, matter_category_id, degree_id, venue_id,
       importance_id, destination_id, legacy_category_raw, legacy_degree_raw,
       legacy_branch_raw, status, notes_1, notes_2, start_date, end_date,
       asked_amount, judged_amount, legacy_selected, evaluation, current_status,
       legacy_client_type_raw, legacy_financial_allocation_raw, legal_opinion,
       legacy_contract_id_raw, legacy_partner_raw, court_id, legacy_court_raw,
       circuit, circuit_secretary, court_floor, court_hall, court_shelf,
       court_secretary_room, fee_letter_ref, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM matter_target_plan
 ORDER BY legacy_id
ON CONFLICT (legacy_source_record_key) DO NOTHING;

DO $ASSERTIONS$
DECLARE
    source_rows       bigint;
    target_plan_rows  bigint;
    quarantine_rows   bigint;
    n                 bigint;
    before_snapshot   jsonb;
    after_snapshot    jsonb;
BEGIN
    SELECT count(*) INTO source_rows FROM staging."الدعاوى";
    SELECT count(*) INTO target_plan_rows FROM matter_target_plan;
    SELECT count(*) INTO quarantine_rows FROM matter_quarantine_plan;

    -- 1. The reviewed mapping set covers each non-null overloaded value once.
    SELECT count(*) INTO n
      FROM staging."الدعاوى" s
     CROSS JOIN LATERAL (VALUES ('matterCategory'::text, s."matterCategory"),
                                ('matterDegree', s."matterDegree")) source(source_field, raw_value)
     WHERE source.raw_value IS NOT NULL
       AND (SELECT count(*) FROM migration_crosswalk cw
             WHERE cw.source_field = source.source_field
               AND _migration.reviewed_text_key(cw.source_value)
                   = _migration.reviewed_text_key(source.raw_value)) <> 1;
    IF n <> 0 THEN RAISE EXCEPTION '% source classification values do not have exactly one reviewed rule', n; END IF;
    RAISE NOTICE 'PROVED: every matterCategory and matterDegree value reaches exactly one reviewed mapping';

    -- 2. Scalar values either parse safely or the complete row quarantines.
    SELECT count(*) INTO n
      FROM matter_target_plan p JOIN matter_quarantine_reason q
        ON q.src_record_key = p.legacy_source_record_key
     WHERE q.reason_code = 'invalid_scalar_value';
    IF n <> 0 THEN RAISE EXCEPTION '% invalid scalar rows reached the matter target', n; END IF;
    RAISE NOTICE 'PROVED: invalid ids, dates, amounts or booleans can only reach quarantine';

    -- 3. The plan itself is a partition before a row is trusted.
    IF target_plan_rows + quarantine_rows <> source_rows THEN
        RAISE EXCEPTION 'matter plan: % transformed + % quarantined <> % source', target_plan_rows, quarantine_rows, source_rows;
    END IF;
    SELECT count(*) INTO n FROM matter_target_plan t JOIN matter_quarantine_plan q
      ON q.src_record_key = t.legacy_source_record_key;
    IF n <> 0 THEN RAISE EXCEPTION '% matter source identities are both target and quarantine', n; END IF;
    RAISE NOTICE 'PROVED: plan partitions % source matters into % target and % quarantine rows', source_rows, target_plan_rows, quarantine_rows;

    -- 4. Idempotent inserts must reproduce the plan exactly, never overwrite.
    SELECT count(*) INTO n
      FROM matter_target_plan p
      LEFT JOIN matters m ON m.legacy_source_record_key = p.legacy_source_record_key
     WHERE m.id IS NULL OR jsonb_build_array(
               m.legacy_id, m.legacy_source_extraction_sha256, m.legacy_source_payload,
               m.case_number_ar, m.case_number_en, m.subject, m.client_id, m.branch_id,
               m.matter_type_id, m.matter_category_id, m.degree_id, m.venue_id,
               m.importance_id, m.destination_id, m.legacy_category_raw,
               m.legacy_degree_raw, m.legacy_branch_raw, m.status, m.notes_1, m.notes_2,
               m.start_date, m.end_date, m.asked_amount, m.judged_amount,
               m.legacy_selected, m.evaluation, m.current_status,
               m.legacy_client_type_raw, m.legacy_financial_allocation_raw,
               m.legal_opinion, m.legacy_contract_id_raw, m.legacy_partner_raw,
               m.court_id, m.legacy_court_raw, m.circuit, m.circuit_secretary,
               m.court_floor, m.court_hall, m.court_shelf, m.court_secretary_room,
               m.fee_letter_ref
           ) IS DISTINCT FROM jsonb_build_array(
               p.legacy_id, p.legacy_source_extraction_sha256, p.legacy_source_payload,
               p.case_number_ar, p.case_number_en, p.subject, p.client_id, p.branch_id,
               p.matter_type_id, p.matter_category_id, p.degree_id, p.venue_id,
               p.importance_id, p.destination_id, p.legacy_category_raw,
               p.legacy_degree_raw, p.legacy_branch_raw, p.status, p.notes_1, p.notes_2,
               p.start_date, p.end_date, p.asked_amount, p.judged_amount,
               p.legacy_selected, p.evaluation, p.current_status,
               p.legacy_client_type_raw, p.legacy_financial_allocation_raw,
               p.legal_opinion, p.legacy_contract_id_raw, p.legacy_partner_raw,
               p.court_id, p.legacy_court_raw, p.circuit, p.circuit_secretary,
               p.court_floor, p.court_hall, p.court_shelf, p.court_secretary_room,
               p.fee_letter_ref
           );
    IF n <> 0 THEN RAISE EXCEPTION '% target matters are missing or differ from the deterministic plan', n; END IF;

    SELECT count(*) INTO n
      FROM matter_quarantine_plan p
      LEFT JOIN quarantine.matter_transform q USING (src_record_key)
     WHERE q.id IS NULL
        OR jsonb_build_array(q.extraction_sha256, q.src_file, q.src_row_num,
                             q.legacy_matter_id, q.reason_codes, q.reason_details,
                             q.source_payload)
           IS DISTINCT FROM
           jsonb_build_array(p.extraction_sha256, p.src_file, p.src_row_num,
                             p.legacy_matter_id, p.reason_codes, p.reason_details,
                             p.source_payload);
    IF n <> 0 THEN RAISE EXCEPTION '% quarantined matters are missing or differ from the deterministic plan', n; END IF;
    RAISE NOTICE 'PROVED: target and quarantine rows equal the deterministic plan byte for byte';

    -- 5. Every transformed client link comes from the staged Access id.
    SELECT count(*) INTO n
      FROM matters m
      JOIN staging."الدعاوى" s ON s.src_record_key = m.legacy_source_record_key
      JOIN clients c ON c.id = m.client_id
     WHERE c.legacy_id::text IS DISTINCT FROM s."clientID";
    IF n <> 0 THEN RAISE EXCEPTION '% transformed matters are attached to an unsupported client', n; END IF;
    RAISE NOTICE 'PROVED: all % transformed matters link to the client named by staged clientID', target_plan_rows;

    -- 6. Every foreign-key destination also agrees with its reviewed label.
    SELECT count(*) INTO n FROM matter_target_plan p
     WHERE (p.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lookup_client_branch l WHERE l.id = p.branch_id))
        OR (p.matter_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lookup_matter_type l WHERE l.id = p.matter_type_id))
        OR (p.matter_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lookup_matter_category l WHERE l.id = p.matter_category_id))
        OR (p.degree_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lookup_degree l WHERE l.id = p.degree_id))
        OR (p.venue_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lookup_venue l WHERE l.id = p.venue_id))
        OR (p.importance_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lookup_importance l WHERE l.id = p.importance_id))
        OR (p.destination_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lookup_matter_destination l WHERE l.id = p.destination_id))
        OR (p.court_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lookup_court l WHERE l.id = p.court_id));
    IF n <> 0 THEN RAISE EXCEPTION '% matter plans name a lookup destination that does not exist', n; END IF;
    RAISE NOTICE 'PROVED: every lookup, branch, court and destination id resolves to reviewed data';

    -- 7. The four raw mapping partners are byte-exact, including NULL.
    SELECT count(*) INTO n
      FROM matters m JOIN staging."الدعاوى" s ON s.src_record_key = m.legacy_source_record_key
     WHERE m.legacy_category_raw IS DISTINCT FROM s."matterCategory"
        OR m.legacy_degree_raw IS DISTINCT FROM s."matterDegree"
        OR m.legacy_branch_raw IS DISTINCT FROM s."clientBranch"
        OR m.legacy_court_raw IS DISTINCT FROM s."matterCourt";
    IF n <> 0 THEN RAISE EXCEPTION '% matters changed a required legacy_*_raw value', n; END IF;
    RAISE NOTICE 'PROVED: category, degree, branch and court raw text is byte-exact';

    -- 8. The complete payload proves no source column vanished, and preserves
    -- NULL separately from the empty string.
    SELECT count(*) INTO n
      FROM matters m JOIN staging."الدعاوى" s ON s.src_record_key = m.legacy_source_record_key
     WHERE m.legacy_source_payload IS DISTINCT FROM
           to_jsonb(s) - ARRAY['src_file', 'src_row_num', 'src_record_key', 'src_extraction_sha256'];
    IF n <> 0 THEN RAISE EXCEPTION '% transformed matters do not reconstruct their complete source row', n; END IF;
    RAISE NOTICE 'PROVED: every transformed matter retains all 38 source columns with NULL distinct from empty text';

    -- 9. Rule (b): all three wrong-client branch values stay out of matters.
    SELECT count(*) INTO n
      FROM matters m JOIN staging."الدعاوى" s ON s.src_record_key = m.legacy_source_record_key
      JOIN migration_crosswalk cw ON cw.source_field = 'client_branch'
       AND cw.target_field = 'separate_client'
       AND _migration.reviewed_text_key(cw.source_value)
           = _migration.reviewed_text_key(s."clientBranch");
    IF n <> 0 THEN RAISE EXCEPTION '% separate-client matters were silently attached to a client', n; END IF;
    RAISE NOTICE 'PROVED: every separate_client matter is quarantined, none attached to the wrong client';

    -- 10. No conflicting category/type was selected. Both source values remain
    -- in the quarantine payload and detail for the firm.
    SELECT count(*) INTO n FROM matter_rule_conflict c
      JOIN matters m ON m.legacy_source_record_key = c.src_record_key;
    IF n <> 0 THEN RAISE EXCEPTION '% classification conflicts reached matters', n; END IF;
    RAISE NOTICE 'PROVED: no existing classification was overwritten by a conflicting branch rule';

    -- 11. This transform did not touch the 744 answers, clients or contacts.
    SELECT snapshot INTO before_snapshot FROM matter_preservation_guard;
    SELECT jsonb_build_object(
      'value_answers', (SELECT count(*) FROM quarantine.review_value WHERE answered_at IS NOT NULL),
      'finding_answers', (SELECT count(*) FROM quarantine.finding WHERE answered_at IS NOT NULL),
      'answer_digest',
        (SELECT encode(sha256(convert_to(coalesce(string_agg(payload, E'\n' ORDER BY kind, id), ''), 'UTF8')), 'hex')
           FROM (
             SELECT 'V' kind, id,
                    jsonb_build_array(id, topic, value, firm_answer, firm_person, firm_note,
                                      answered_at, answered_by)::text payload
               FROM quarantine.review_value WHERE answered_at IS NOT NULL
             UNION ALL
             SELECT 'F', id, jsonb_build_array(id, topic, src_table, src_file, src_row_num,
                                               column_name, original_value, firm_answer, firm_note,
                                               answered_at, answered_by)::text
               FROM quarantine.finding WHERE answered_at IS NOT NULL
           ) answered),
      'clients', (SELECT count(*) FROM clients),
      'clients_digest',
        (SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(c)::text, E'\n' ORDER BY c.id), ''), 'UTF8')), 'hex') FROM clients c),
      'contacts', (SELECT count(*) FROM contacts),
      'contacts_digest',
        (SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(c)::text, E'\n' ORDER BY c.id), ''), 'UTF8')), 'hex') FROM contacts c)
    ) INTO after_snapshot;
    IF before_snapshot IS DISTINCT FROM after_snapshot THEN
        RAISE EXCEPTION 'review answers, clients or contacts changed during the matter transform';
    END IF;
    RAISE NOTICE 'PROVED: % + % review answers, % clients and % contacts are unchanged',
                 before_snapshot->>'value_answers', before_snapshot->>'finding_answers',
                 before_snapshot->>'clients', before_snapshot->>'contacts';

    -- 12. Final source identity reconciliation, including no stale rows.
    SELECT count(*) INTO n
      FROM staging."الدعاوى" s
     WHERE (SELECT count(*) FROM matters m WHERE m.legacy_source_record_key = s.src_record_key)
         + (SELECT count(*) FROM quarantine.matter_transform q WHERE q.src_record_key = s.src_record_key) <> 1;
    IF n <> 0 THEN RAISE EXCEPTION '% source matters are missing or duplicated after transform', n; END IF;
    SELECT count(*) INTO n FROM matters m
     WHERE m.legacy_source_record_key IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM staging."الدعاوى" s WHERE s.src_record_key = m.legacy_source_record_key);
    IF n <> 0 THEN RAISE EXCEPTION '% transformed matters name no staged source row', n; END IF;
    SELECT count(*) INTO n FROM quarantine.matter_transform q
     WHERE NOT EXISTS (SELECT 1 FROM staging."الدعاوى" s WHERE s.src_record_key = q.src_record_key);
    IF n <> 0 THEN RAISE EXCEPTION '% quarantined matters name no staged source row', n; END IF;
    RAISE NOTICE 'PROVED: % source matters = % transformed + % quarantined, exactly once',
                 source_rows, target_plan_rows, quarantine_rows;
END
$ASSERTIONS$;

\if :force_failure
DO $FORCED_FAILURE$
BEGIN
    RAISE EXCEPTION 'fixture forced late matter-transform failure';
END
$FORCED_FAILURE$;
\endif

COMMIT;
