-- Permanent task 2.6 reconciliation.
--
-- This query deliberately rebuilds the expected target and quarantine state
-- from staging and the reviewed database rules. It does not read the temporary
-- transform plan and it does not call any transform helper.

WITH classification_split AS MATERIALIZED (
    SELECT s.src_record_key,
           btrim(substring(cw.target_value FROM 'category=([^+]+)')) AS category_part,
           btrim(substring(cw.target_value FROM 'distination=(.*)$')) AS destination_part
      FROM staging."الدعاوى" s
      JOIN migration_crosswalk cw
        ON cw.source_field = 'matterCategory'
       AND cw.target_field = 'SPLIT'
       AND _migration.reviewed_text_key(cw.source_value)
           = _migration.reviewed_text_key(s."matterCategory")
), court_rule AS MATERIALIZED (
    SELECT s.src_record_key, cw.target_field, cw.target_value, cw.reviewer_note
      FROM staging."الدعاوى" s
      JOIN migration_crosswalk cw
        ON cw.source_field = 'court'
       AND _migration.reviewed_text_key(cw.source_value)
           = _migration.reviewed_text_key(s."matterCourt")
), rule_output AS MATERIALIZED (
    SELECT s.src_record_key, cw.target_field, cw.target_value
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
       AND cw.target_field IN ('matter_type', 'matter_category', 'degree', 'venue', 'importance')

    UNION ALL
    SELECT split.src_record_key, nested.target_field, nested.target_value
      FROM classification_split split
      JOIN migration_crosswalk nested
        ON nested.source_field = 'matterCategory'
       AND _migration.reviewed_text_key(nested.source_value)
           = _migration.reviewed_text_key(split.category_part)
     WHERE nested.target_field IN ('matter_type', 'matter_category', 'degree', 'venue', 'importance')

    UNION ALL
    SELECT split.src_record_key, 'venue',
           substring(nested.reviewer_note FROM 'Venue=([^ ]+)')
      FROM classification_split split
      JOIN migration_crosswalk nested
        ON nested.source_field = 'matterCategory'
       AND _migration.reviewed_text_key(nested.source_value)
           = _migration.reviewed_text_key(split.category_part)
     WHERE nested.reviewer_note LIKE '%Venue=%'

    UNION ALL
    SELECT src_record_key, 'matter_destination', destination_part
      FROM classification_split

    UNION ALL
    SELECT s.src_record_key, 'importance', l.label_ar
      FROM staging."الدعاوى" s
      JOIN lookup_importance l ON l.label_ar = s."matterImportance"

    UNION ALL
    SELECT s.src_record_key, 'matter_destination', l.label_ar
      FROM staging."الدعاوى" s
      JOIN lookup_matter_destination l ON l.label_ar = s."matterDistination"

    UNION ALL
    SELECT s.src_record_key, 'branch', l.label_ar
      FROM staging."الدعاوى" s
      JOIN lookup_client_branch l
        ON _migration.reviewed_text_key(l.label_ar)
           = _migration.reviewed_text_key(s."clientBranch")

    UNION ALL
    SELECT s.src_record_key, cw.target_field, cw.target_value
      FROM staging."الدعاوى" s
      JOIN migration_crosswalk cw
        ON cw.source_field = 'client_branch'
       AND _migration.reviewed_text_key(cw.source_value)
           = _migration.reviewed_text_key(s."clientBranch")
     WHERE cw.target_field IN ('matter_type', 'matter_category', 'degree')

    UNION ALL
    SELECT s.src_record_key, 'court', l.label_ar
      FROM staging."الدعاوى" s
      JOIN lookup_court l
        ON _migration.reviewed_text_key(l.label_ar)
           = _migration.reviewed_text_key(s."matterCourt")
     WHERE NOT EXISTS (
           SELECT 1 FROM court_rule r WHERE r.src_record_key = s.src_record_key
     )

    UNION ALL
    SELECT src_record_key, 'court', target_value
      FROM court_rule
     WHERE target_field IN ('court', 'SPLIT')

    UNION ALL
    SELECT src_record_key, 'matter_destination', target_value
      FROM court_rule
     WHERE target_field = 'matter_destination'

    UNION ALL
    SELECT src_record_key, 'circuit',
           substring(reviewer_note FROM $REGEX$circuit='([^']+)'$REGEX$)
      FROM court_rule
     WHERE target_field = 'SPLIT'
       AND reviewer_note LIKE '%circuit=%'

    UNION ALL
    SELECT src_record_key, 'circuit', "matterCircut"
      FROM staging."الدعاوى"
     WHERE "matterCircut" IS NOT NULL
), expected_mapping AS MATERIALIZED (
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
      FROM rule_output
     GROUP BY src_record_key
), conflicts AS MATERIALIZED (
    SELECT src_record_key, target_field,
           array_agg(DISTINCT target_value ORDER BY target_value) AS target_values
      FROM rule_output
     GROUP BY src_record_key, target_field
    HAVING count(DISTINCT target_value) > 1
), expected_reason AS MATERIALIZED (
    SELECT src_record_key, 'matter_no_client'::text AS reason_code,
           jsonb_build_object('clientID', "clientID") AS detail
      FROM staging."الدعاوى"
     WHERE "clientID" IS NULL OR "clientID" = ''

    UNION ALL
    SELECT s.src_record_key, 'invalid_client_link',
           jsonb_build_object('clientID', s."clientID")
      FROM staging."الدعاوى" s
     WHERE s."clientID" IS NOT NULL
       AND s."clientID" <> ''
       AND (s."clientID" !~ '^\d{1,9}$'
            OR NOT EXISTS (
                SELECT 1 FROM clients c
                 WHERE c.legacy_id = CASE WHEN s."clientID" ~ '^\d{1,9}$'
                                          THEN s."clientID"::integer END
            ))

    UNION ALL
    SELECT s.src_record_key, 'separate_client',
           jsonb_build_object('clientID', s."clientID", 'clientBranch', s."clientBranch",
                              'reviewer_note', cw.reviewer_note)
      FROM staging."الدعاوى" s
      JOIN migration_crosswalk cw
        ON cw.source_field = 'client_branch'
       AND cw.target_field = 'separate_client'
       AND _migration.reviewed_text_key(cw.source_value)
           = _migration.reviewed_text_key(s."clientBranch")

    UNION ALL
    SELECT s.src_record_key, 'branch_requires_review',
           jsonb_build_object('clientBranch', s."clientBranch", 'reviewer_note', cw.reviewer_note)
      FROM staging."الدعاوى" s
      JOIN migration_crosswalk cw
        ON cw.source_field = 'client_branch'
       AND cw.target_field = 'quarantine'
       AND _migration.reviewed_text_key(cw.source_value)
           = _migration.reviewed_text_key(s."clientBranch")

    UNION ALL
    SELECT s.src_record_key, 'unmapped_importance',
           jsonb_build_object('matterImportance', s."matterImportance")
      FROM staging."الدعاوى" s
     WHERE s."matterImportance" IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM lookup_importance l WHERE l.label_ar = s."matterImportance"
       )

    UNION ALL
    SELECT conflict.src_record_key, 'classification_conflict:' || conflict.target_field,
           jsonb_build_object(
               'target_field', conflict.target_field,
               'target_values', conflict.target_values,
               'matterCategory', s."matterCategory",
               'matterDegree', s."matterDegree",
               'clientBranch', s."clientBranch"
           )
      FROM conflicts conflict
      JOIN staging."الدعاوى" s USING (src_record_key)
     WHERE conflict.target_field IN (
           'matter_type', 'matter_category', 'degree', 'venue', 'importance',
           'matter_destination', 'branch', 'court', 'circuit'
     )

    UNION ALL
    SELECT s.src_record_key, 'court_remainder_is_hearing_note',
           jsonb_build_object('matterCourt', s."matterCourt", 'reviewer_note', r.reviewer_note)
      FROM staging."الدعاوى" s
      JOIN court_rule r USING (src_record_key)
     WHERE r.target_field = 'SPLIT'
       AND r.reviewer_note LIKE '%hearing_note=%'

    UNION ALL
    SELECT s.src_record_key, 'court_split_remainder_unhandled',
           jsonb_build_object('matterCourt', s."matterCourt", 'reviewer_note', r.reviewer_note)
      FROM staging."الدعاوى" s
      JOIN court_rule r USING (src_record_key)
     WHERE r.target_field = 'SPLIT'
       AND r.reviewer_note NOT LIKE '%circuit=%'
       AND r.reviewer_note NOT LIKE '%hearing_note=%'

    UNION ALL
    SELECT s.src_record_key, 'court_rule_reserved_for_task_2_9',
           jsonb_build_object('matterCourt', s."matterCourt", 'target_value', r.target_value)
      FROM staging."الدعاوى" s
      JOIN court_rule r USING (src_record_key)
     WHERE r.target_field = 'circuit'

    UNION ALL
    SELECT s.src_record_key, 'unmapped_matter_category',
           jsonb_build_object('matterCategory', s."matterCategory")
      FROM staging."الدعاوى" s
     WHERE s."matterCategory" IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM migration_crosswalk cw
            WHERE cw.source_field = 'matterCategory'
              AND _migration.reviewed_text_key(cw.source_value)
                  = _migration.reviewed_text_key(s."matterCategory")
       )

    UNION ALL
    SELECT s.src_record_key, 'unmapped_matter_degree',
           jsonb_build_object('matterDegree', s."matterDegree")
      FROM staging."الدعاوى" s
     WHERE s."matterDegree" IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM migration_crosswalk cw
            WHERE cw.source_field = 'matterDegree'
              AND _migration.reviewed_text_key(cw.source_value)
                  = _migration.reviewed_text_key(s."matterDegree")
       )

    UNION ALL
    SELECT s.src_record_key, 'unmapped_branch',
           jsonb_build_object('clientBranch', s."clientBranch")
      FROM staging."الدعاوى" s
     WHERE s."clientBranch" IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM lookup_client_branch l
            WHERE _migration.reviewed_text_key(l.label_ar)
                  = _migration.reviewed_text_key(s."clientBranch")
       )
       AND NOT EXISTS (
           SELECT 1 FROM migration_crosswalk cw
            WHERE cw.source_field = 'client_branch'
              AND _migration.reviewed_text_key(cw.source_value)
                  = _migration.reviewed_text_key(s."clientBranch")
       )

    UNION ALL
    SELECT s.src_record_key, 'unmapped_court',
           jsonb_build_object('matterCourt', s."matterCourt")
      FROM staging."الدعاوى" s
     WHERE s."matterCourt" IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM lookup_court l
            WHERE _migration.reviewed_text_key(l.label_ar)
                  = _migration.reviewed_text_key(s."matterCourt")
       )
       AND NOT EXISTS (
           SELECT 1 FROM court_rule r WHERE r.src_record_key = s.src_record_key
       )

    UNION ALL
    SELECT s.src_record_key, 'unmapped_destination',
           jsonb_build_object('matterDistination', s."matterDistination")
      FROM staging."الدعاوى" s
     WHERE s."matterDistination" IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM lookup_matter_destination l
            WHERE l.label_ar = s."matterDistination"
       )

    UNION ALL
    SELECT s.src_record_key, 'invalid_scalar_value',
           jsonb_build_object(
               'matterID', s."matterID",
               'matterStartDate', s."matterStartDate",
               'matterEndDate', s."matterEndDate",
               'matterAskedAmount', s."matterAskedAmount",
               'matterJudgedAmount', s."matterJudgedAmount",
               'matterSelect', s."matterSelect"
           )
      FROM staging."الدعاوى" s
     WHERE s."matterID" IS NULL
        OR s."matterID" !~ '^\d{1,9}$'
        OR (s."matterStartDate" IS NOT NULL
            AND (s."matterStartDate" !~ '^\d{4}-\d{2}-\d{2} 00:00:00$'
                 OR NOT pg_input_is_valid(left(s."matterStartDate", 10), 'date')))
        OR (s."matterEndDate" IS NOT NULL
            AND (s."matterEndDate" !~ '^\d{4}-\d{2}-\d{2} 00:00:00$'
                 OR NOT pg_input_is_valid(left(s."matterEndDate", 10), 'date')))
        OR (s."matterAskedAmount" IS NOT NULL
            AND s."matterAskedAmount" !~ '^\d{1,16}(\.\d{1,2})?$')
        OR (s."matterJudgedAmount" IS NOT NULL
            AND s."matterJudgedAmount" !~ '^\d{1,16}(\.\d{1,2})?$')
        OR s."matterSelect" NOT IN ('true', 'false')
), expected_quarantine AS MATERIALIZED (
    SELECT s.src_record_key,
           s.src_extraction_sha256 AS extraction_sha256,
           s.src_file,
           s.src_row_num,
           s."matterID" AS legacy_matter_id,
           reasons.reason_codes,
           reasons.reason_details,
           to_jsonb(s) - ARRAY[
               'src_file', 'src_row_num', 'src_record_key', 'src_extraction_sha256'
           ] AS source_payload
      FROM staging."الدعاوى" s
      JOIN (
          SELECT src_record_key,
                 array_agg(reason_code ORDER BY reason_code) AS reason_codes,
                 jsonb_agg(detail ORDER BY reason_code) AS reason_details
            FROM expected_reason
           GROUP BY src_record_key
      ) reasons USING (src_record_key)
), typed_source AS MATERIALIZED (
    -- These casts are independent PostgreSQL input interpretations. They do
    -- not reuse the transform's regular-expression plan.
    SELECT s.src_record_key,
           CASE WHEN pg_input_is_valid(s."matterID", 'integer')
                THEN s."matterID"::integer END AS legacy_id,
           CASE WHEN pg_input_is_valid(s."matterStartDate", 'timestamp without time zone')
                THEN s."matterStartDate"::timestamp without time zone::date END AS start_date,
           CASE WHEN pg_input_is_valid(s."matterEndDate", 'timestamp without time zone')
                THEN s."matterEndDate"::timestamp without time zone::date END AS end_date,
           CASE WHEN pg_input_is_valid(s."matterAskedAmount", 'numeric')
                THEN s."matterAskedAmount"::numeric END AS asked_amount,
           CASE WHEN pg_input_is_valid(s."matterJudgedAmount", 'numeric')
                THEN s."matterJudgedAmount"::numeric END AS judged_amount,
           CASE WHEN s."matterSelect" = 'true' THEN true
                WHEN s."matterSelect" = 'false' THEN false END AS legacy_selected
      FROM staging."الدعاوى" s
), direct_mismatches AS MATERIALIZED (
    SELECT
        count(*) FILTER (WHERE m.legacy_id IS DISTINCT FROM typed.legacy_id)
            AS legacy_id_mismatch,
        count(*) FILTER (
            WHERE to_jsonb(m.legacy_source_extraction_sha256)
                  IS DISTINCT FROM to_jsonb(s.src_extraction_sha256)
        )
            AS legacy_source_extraction_sha256_mismatch,
        count(*) FILTER (WHERE to_jsonb(m.case_number_ar) IS DISTINCT FROM to_jsonb(s."matterAR"))
            AS case_number_ar_mismatch,
        count(*) FILTER (WHERE to_jsonb(m.case_number_en) IS DISTINCT FROM to_jsonb(s."matterEN"))
            AS case_number_en_mismatch,
        count(*) FILTER (WHERE to_jsonb(m.subject) IS DISTINCT FROM to_jsonb(s."matterSubject"))
            AS subject_mismatch,
        count(*) FILTER (WHERE to_jsonb(m.status) IS DISTINCT FROM to_jsonb(s."matterStatus"))
            AS status_mismatch,
        count(*) FILTER (WHERE to_jsonb(m.notes_1) IS DISTINCT FROM to_jsonb(s."matterNotes1"))
            AS notes_1_mismatch,
        count(*) FILTER (WHERE to_jsonb(m.notes_2) IS DISTINCT FROM to_jsonb(s."matterNotes2"))
            AS notes_2_mismatch,
        count(*) FILTER (WHERE m.start_date IS DISTINCT FROM typed.start_date)
            AS start_date_mismatch,
        count(*) FILTER (WHERE m.end_date IS DISTINCT FROM typed.end_date)
            AS end_date_mismatch,
        count(*) FILTER (WHERE m.asked_amount IS DISTINCT FROM typed.asked_amount)
            AS asked_amount_mismatch,
        count(*) FILTER (WHERE m.judged_amount IS DISTINCT FROM typed.judged_amount)
            AS judged_amount_mismatch,
        count(*) FILTER (WHERE m.legacy_selected IS DISTINCT FROM typed.legacy_selected)
            AS legacy_selected_mismatch,
        count(*) FILTER (
            WHERE to_jsonb(m.evaluation) IS DISTINCT FROM to_jsonb(s."matteEvaluation")
        )
            AS evaluation_mismatch,
        count(*) FILTER (
            WHERE to_jsonb(m.current_status) IS DISTINCT FROM to_jsonb(s."الموقف الحالي")
        )
            AS current_status_mismatch,
        count(*) FILTER (
            WHERE to_jsonb(m.legacy_client_type_raw) IS DISTINCT FROM to_jsonb(s."نوع العميل")
        )
            AS legacy_client_type_raw_mismatch,
        count(*) FILTER (
            WHERE to_jsonb(m.legacy_financial_allocation_raw)
                  IS DISTINCT FROM to_jsonb(s."المخصص المالي")
        ) AS legacy_financial_allocation_raw_mismatch,
        count(*) FILTER (
            WHERE to_jsonb(m.legal_opinion) IS DISTINCT FROM to_jsonb(s."الرأي القانوني")
        )
            AS legal_opinion_mismatch,
        count(*) FILTER (
            WHERE to_jsonb(m.legacy_contract_id_raw) IS DISTINCT FROM to_jsonb(s."contractID")
        )
            AS legacy_contract_id_raw_mismatch,
        count(*) FILTER (
            WHERE to_jsonb(m.legacy_partner_raw) IS DISTINCT FROM to_jsonb(s."matterPartner")
        )
            AS legacy_partner_raw_mismatch,
        count(*) FILTER (
            WHERE to_jsonb(m.circuit_secretary) IS DISTINCT FROM to_jsonb(s."circutSecretary")
        )
            AS circuit_secretary_mismatch,
        count(*) FILTER (WHERE to_jsonb(m.court_floor) IS DISTINCT FROM to_jsonb(s."courtFloor"))
            AS court_floor_mismatch,
        count(*) FILTER (WHERE to_jsonb(m.court_hall) IS DISTINCT FROM to_jsonb(s."courtHall"))
            AS court_hall_mismatch,
        count(*) FILTER (WHERE to_jsonb(m.court_shelf) IS DISTINCT FROM to_jsonb(s."matterShelf"))
            AS court_shelf_mismatch,
        count(*) FILTER (
            WHERE to_jsonb(m.court_secretary_room) IS DISTINCT FROM to_jsonb(s."secretaryRoom")
        )
            AS court_secretary_room_mismatch,
        count(*) FILTER (
            WHERE to_jsonb(m.fee_letter_ref) IS DISTINCT FROM to_jsonb(s."خطاب الأتعاب")
        )
            AS fee_letter_ref_mismatch
      FROM matters m
      JOIN staging."الدعاوى" s
        ON s.src_record_key = m.legacy_source_record_key
      JOIN typed_source typed USING (src_record_key)
     WHERE m.legacy_source_record_key IS NOT NULL
), quarantine_comparison AS MATERIALIZED (
    SELECT
        count(*) FILTER (WHERE q.id IS NULL) AS unsafe_row_missing_quarantine,
        count(*) FILTER (
            WHERE q.id IS NOT NULL
              AND to_jsonb(q.extraction_sha256)
                  IS DISTINCT FROM to_jsonb(expected.extraction_sha256)
        ) AS quarantine_extraction_mismatch,
        count(*) FILTER (
            WHERE q.id IS NOT NULL
              AND to_jsonb(q.src_file) IS DISTINCT FROM to_jsonb(expected.src_file)
        ) AS quarantine_src_file_mismatch,
        count(*) FILTER (
            WHERE q.id IS NOT NULL AND q.src_row_num IS DISTINCT FROM expected.src_row_num
        ) AS quarantine_src_row_mismatch,
        count(*) FILTER (
            WHERE q.id IS NOT NULL
              AND to_jsonb(q.legacy_matter_id)
                  IS DISTINCT FROM to_jsonb(expected.legacy_matter_id)
        ) AS quarantine_legacy_id_mismatch,
        count(*) FILTER (
            WHERE q.id IS NOT NULL AND q.source_payload IS DISTINCT FROM expected.source_payload
        ) AS quarantine_payload_mismatch,
        count(*) FILTER (
            WHERE q.id IS NOT NULL
              AND to_jsonb(q.reason_codes) IS DISTINCT FROM to_jsonb(expected.reason_codes)
        ) AS quarantine_reason_codes_mismatch,
        count(*) FILTER (
            WHERE q.id IS NOT NULL AND q.reason_details IS DISTINCT FROM expected.reason_details
        ) AS quarantine_reason_details_mismatch
      FROM expected_quarantine expected
      LEFT JOIN quarantine.matter_transform q USING (src_record_key)
)
SELECT
    (SELECT count(*) FROM staging."الدعاوى") AS source_rows,
    (SELECT count(*) FROM matters WHERE legacy_source_record_key IS NOT NULL) AS target_rows,
    (SELECT count(*) FROM quarantine.matter_transform) AS quarantine_rows,
    (SELECT count(*)
       FROM staging."الدعاوى" s
      WHERE (SELECT count(*) FROM matters m WHERE m.legacy_source_record_key = s.src_record_key)
          + (SELECT count(*) FROM quarantine.matter_transform q WHERE q.src_record_key = s.src_record_key)
          <> 1) AS missing_or_duplicate,
    (SELECT count(*)
       FROM matters m
      WHERE m.legacy_source_record_key IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM staging."الدعاوى" s
             WHERE s.src_record_key = m.legacy_source_record_key
        )) AS stale_target,
    (SELECT count(*)
       FROM quarantine.matter_transform q
      WHERE NOT EXISTS (
            SELECT 1 FROM staging."الدعاوى" s
             WHERE s.src_record_key = q.src_record_key
      )) AS stale_quarantine,
    (SELECT count(*)
       FROM matters m
       JOIN staging."الدعاوى" s
         ON s.src_record_key = m.legacy_source_record_key
      WHERE m.legacy_source_payload IS DISTINCT FROM
            to_jsonb(s) - ARRAY[
                'src_file', 'src_row_num', 'src_record_key', 'src_extraction_sha256'
            ]) AS target_payload_mismatch,
    (SELECT count(*)
       FROM matters m
       JOIN staging."الدعاوى" s
         ON s.src_record_key = m.legacy_source_record_key
      WHERE to_jsonb(m.legacy_category_raw) IS DISTINCT FROM to_jsonb(s."matterCategory")
         OR to_jsonb(m.legacy_degree_raw) IS DISTINCT FROM to_jsonb(s."matterDegree")
         OR to_jsonb(m.legacy_branch_raw) IS DISTINCT FROM to_jsonb(s."clientBranch")
         OR to_jsonb(m.legacy_court_raw) IS DISTINCT FROM to_jsonb(s."matterCourt"))
        AS raw_mismatch,
    (SELECT count(*)
       FROM matters m
       JOIN staging."الدعاوى" s
         ON s.src_record_key = m.legacy_source_record_key
       LEFT JOIN clients c ON c.id = m.client_id
      WHERE c.legacy_id::text IS DISTINCT FROM s."clientID") AS client_mismatch,
    (SELECT count(*)
       FROM matters m
       LEFT JOIN expected_mapping expected
         ON expected.src_record_key = m.legacy_source_record_key
       LEFT JOIN lookup_matter_type mt ON mt.id = m.matter_type_id
       LEFT JOIN lookup_matter_category mc ON mc.id = m.matter_category_id
       LEFT JOIN lookup_degree d ON d.id = m.degree_id
       LEFT JOIN lookup_venue v ON v.id = m.venue_id
       LEFT JOIN lookup_importance i ON i.id = m.importance_id
       LEFT JOIN lookup_matter_destination md ON md.id = m.destination_id
       LEFT JOIN lookup_client_branch b ON b.id = m.branch_id
       LEFT JOIN lookup_court c ON c.id = m.court_id
      WHERE m.legacy_source_record_key IS NOT NULL
        AND (mt.label_ar IS DISTINCT FROM coalesce(
                 expected.matter_type,
                 (SELECT label_ar FROM lookup_matter_type WHERE is_default)
             )
         OR mc.label_ar IS DISTINCT FROM expected.matter_category
         OR d.label_ar IS DISTINCT FROM expected.degree
         OR v.label_ar IS DISTINCT FROM expected.venue
         OR i.label_ar IS DISTINCT FROM expected.importance
         OR md.label_ar IS DISTINCT FROM expected.destination
         OR b.label_ar IS DISTINCT FROM expected.branch
         OR c.label_ar IS DISTINCT FROM expected.court
         OR m.circuit IS DISTINCT FROM expected.circuit)) AS mapping_mismatch,
    (SELECT count(*)
       FROM staging."الدعاوى" s
      CROSS JOIN LATERAL (
            VALUES ('matterCategory'::text, s."matterCategory"),
                   ('matterDegree', s."matterDegree")
      ) source(source_field, raw_value)
      WHERE source.raw_value IS NOT NULL
        AND (SELECT count(*) FROM migration_crosswalk cw
              WHERE cw.source_field = source.source_field
                AND _migration.reviewed_text_key(cw.source_value)
                    = _migration.reviewed_text_key(source.raw_value)) <> 1)
        AS mapping_coverage,
    (SELECT count(*)
       FROM (
           SELECT source_field, _migration.reviewed_text_key(source_value)
             FROM migration_crosswalk
            GROUP BY 1, 2
           HAVING count(*) > 1
       ) collision) AS mapping_key_collisions,
    (SELECT count(*)
       FROM matters m
       JOIN staging."الدعاوى" s
         ON s.src_record_key = m.legacy_source_record_key
       JOIN migration_crosswalk cw
         ON cw.source_field = 'client_branch'
        AND cw.target_field = 'separate_client'
        AND _migration.reviewed_text_key(cw.source_value)
            = _migration.reviewed_text_key(s."clientBranch"))
        AS separate_client_in_target,
    (SELECT count(*)
       FROM matters m
       JOIN conflicts conflict ON conflict.src_record_key = m.legacy_source_record_key)
        AS conflicts_in_target,
    (SELECT count(*)
       FROM matters m
       JOIN staging."الدعاوى" s
         ON s.src_record_key = m.legacy_source_record_key
       JOIN court_rule r ON r.src_record_key = s.src_record_key
      WHERE (r.target_field = 'SPLIT' AND r.reviewer_note LIKE '%hearing_note=%')
         OR r.target_field = 'circuit') AS unsafe_court_in_target,
    (SELECT count(*)
       FROM expected_quarantine expected
       FULL JOIN quarantine.matter_transform q USING (src_record_key)
      WHERE expected.src_record_key IS NULL OR q.src_record_key IS NULL)
        AS quarantine_source_key_mismatch,
    (SELECT count(*)
       FROM quarantine.matter_transform q
       JOIN staging."الدعاوى" s USING (src_record_key)
       LEFT JOIN expected_quarantine expected USING (src_record_key)
      WHERE expected.src_record_key IS NULL) AS safe_row_in_quarantine,
    direct.*,
    quarantine.*
  FROM direct_mismatches direct
 CROSS JOIN quarantine_comparison quarantine;
