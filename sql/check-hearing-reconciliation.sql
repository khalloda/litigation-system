-- Task 2.8 permanent oracle.
--
-- Deliberately independent from scripts/lib/hearing-transform-plan.ts. It
-- rebuilds every expected hearing, quarantine outcome and attendee directly
-- from staging, reviewed database rules and the immutable Correction B audit.

WITH
source AS (
  SELECT s.*,
         to_jsonb(s) - ARRAY[
           'src_file','src_row_num','src_record_key','src_extraction_sha256'
         ] source_payload,
         CASE WHEN s."ID_hearings" ~ '^[0-9]*[1-9][0-9]*$'
                   AND pg_input_is_valid(s."ID_hearings", 'integer')
              THEN s."ID_hearings"::integer END parsed_hearing_id,
         CASE WHEN s."matterID" ~ '^[0-9]*[1-9][0-9]*$'
                   AND pg_input_is_valid(s."matterID", 'integer')
              THEN s."matterID"::integer END parsed_matter_id,
         CASE WHEN s."التاريخ" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$'
                   AND pg_input_is_valid(s."التاريخ", 'timestamp')
              THEN left(s."التاريخ", 10)::date END parsed_hearing_date,
         CASE WHEN s."nextHearing" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$'
                   AND pg_input_is_valid(s."nextHearing", 'timestamp')
              THEN left(s."nextHearing", 10)::date END parsed_next_hearing_date,
         CASE s."تقرير" WHEN 'true' THEN true WHEN 'false' THEN false END parsed_report,
         CASE s."إخطار العميل بالقرار"
           WHEN 'true' THEN true WHEN 'false' THEN false
         END parsed_client_notified
    FROM staging."الجلسات" s
),
resolved AS (
  SELECT s.*,
         matter.id target_matter_id,
         parent_q.id parent_quarantine_id,
         parent_q.reason_codes parent_reason_codes,
         action_rule.id action_rule_id,
         action_rule.target_field action_target_field,
         action_rule.target_value action_target_value,
         coalesce(action_target.id, action_direct.id) expected_action_id,
         court_rule.id court_rule_id,
         court_rule.target_field court_target_field,
         court_rule.target_value court_target_value,
         court_rule.reviewer_note court_reviewer_note,
         CASE
           WHEN court_rule.id IS NULL THEN court_direct.id
           WHEN court_rule.target_field IN ('court','SPLIT') THEN court_target.id
         END expected_court_id,
         CASE WHEN court_rule.target_field='matter_destination'
              THEN destination_target.id END expected_destination_id,
         CASE WHEN court_rule.target_field='SPLIT'
              THEN substring(court_rule.reviewer_note
                     FROM $REGEX$circuit='([^']+)'$REGEX$) END reviewed_circuit,
         CASE WHEN court_rule.target_field='SPLIT'
              THEN substring(court_rule.reviewer_note
                     FROM $REGEX$hearing_note='([^']+)'$REGEX$) END reviewed_note
    FROM source s
    LEFT JOIN matters matter
      ON matter.legacy_source_record_key IS NOT NULL
     AND matter.legacy_id=s.parsed_matter_id
    LEFT JOIN quarantine.matter_transform parent_q
      ON parent_q.legacy_matter_id=s."matterID"
    LEFT JOIN migration_crosswalk action_rule
      ON action_rule.source_field='hearing_action'
     AND _migration.reviewed_text_key(action_rule.source_value)
         = _migration.reviewed_text_key(s."الإجراء")
    LEFT JOIN lookup_hearing_action action_target
      ON action_target.label_ar=action_rule.target_value
     AND action_rule.target_field='hearing_action'
    LEFT JOIN lookup_hearing_action action_direct
      ON action_rule.id IS NULL
     AND _migration.reviewed_text_key(action_direct.label_ar)
         = _migration.reviewed_text_key(s."الإجراء")
    LEFT JOIN migration_crosswalk court_rule
      ON court_rule.source_field='court'
     AND _migration.reviewed_text_key(court_rule.source_value)
         = _migration.reviewed_text_key(s."المحكمة")
    LEFT JOIN lookup_court court_target
      ON court_target.label_ar=court_rule.target_value
     AND court_rule.target_field IN ('court','SPLIT')
    LEFT JOIN lookup_court court_direct
      ON court_rule.id IS NULL
     AND _migration.reviewed_text_key(court_direct.label_ar)
         = _migration.reviewed_text_key(s."المحكمة")
    LEFT JOIN lookup_matter_destination destination_target
      ON destination_target.label_ar=court_rule.target_value
     AND court_rule.target_field='matter_destination'
),
reason_rows AS (
  SELECT src_record_key, 'invalid_hearing_id' reason_code,
         jsonb_build_object('ID_hearings', "ID_hearings") detail
    FROM resolved WHERE parsed_hearing_id IS NULL
  UNION ALL
  SELECT src_record_key, 'parent_matter_quarantined',
         jsonb_build_object('matterID', "matterID",
                            'matter_reason_codes', parent_reason_codes)
    FROM resolved WHERE parent_quarantine_id IS NOT NULL
  UNION ALL
  SELECT src_record_key, 'invalid_matter_link',
         jsonb_build_object('matterID', "matterID")
    FROM resolved
   WHERE "matterID" IS NOT NULL AND parent_quarantine_id IS NULL
     AND (parsed_matter_id IS NULL OR target_matter_id IS NULL)
  UNION ALL
  SELECT src_record_key, 'invalid_hearing_date', jsonb_build_object('value', "التاريخ")
    FROM resolved WHERE "التاريخ" IS NOT NULL AND parsed_hearing_date IS NULL
  UNION ALL
  SELECT src_record_key, 'invalid_next_hearing_date', jsonb_build_object('value', "nextHearing")
    FROM resolved WHERE "nextHearing" IS NOT NULL AND parsed_next_hearing_date IS NULL
  UNION ALL
  SELECT src_record_key, 'invalid_report_flag', jsonb_build_object('value', "تقرير")
    FROM resolved WHERE "تقرير" IS NOT NULL AND parsed_report IS NULL
  UNION ALL
  SELECT src_record_key, 'invalid_client_notified_flag',
         jsonb_build_object('value', "إخطار العميل بالقرار")
    FROM resolved
   WHERE "إخطار العميل بالقرار" IS NOT NULL AND parsed_client_notified IS NULL
  UNION ALL
  SELECT src_record_key,
         CASE WHEN action_rule_id IS NULL THEN 'unmapped_hearing_action'
              ELSE 'invalid_hearing_action_rule' END,
         CASE WHEN action_rule_id IS NULL
              THEN jsonb_build_object('value', "الإجراء")
              ELSE jsonb_build_object('value', "الإجراء",
                     'target_field', action_target_field,
                     'target_value', action_target_value) END
    FROM resolved
   WHERE "الإجراء" IS NOT NULL AND expected_action_id IS NULL
  UNION ALL
  SELECT src_record_key, 'unmapped_court', jsonb_build_object('value', "المحكمة")
    FROM resolved
   WHERE "المحكمة" IS NOT NULL AND court_rule_id IS NULL AND expected_court_id IS NULL
  UNION ALL
  SELECT src_record_key, 'invalid_court_rule',
         jsonb_build_object('value', "المحكمة", 'target_field', court_target_field,
                            'target_value', court_target_value)
    FROM resolved
   WHERE court_rule_id IS NOT NULL AND court_target_field IN ('court','SPLIT')
     AND expected_court_id IS NULL
  UNION ALL
  SELECT src_record_key, 'invalid_court_destination_rule',
         jsonb_build_object('value', "المحكمة", 'target_value', court_target_value)
    FROM resolved
   WHERE court_rule_id IS NOT NULL AND court_target_field='matter_destination'
     AND expected_destination_id IS NULL
  UNION ALL
  SELECT src_record_key, 'invalid_court_split_rule',
         jsonb_build_object('value', "المحكمة", 'reviewer_note', court_reviewer_note)
    FROM resolved
   WHERE court_target_field='SPLIT'
     AND ((reviewed_circuit IS NULL) = (reviewed_note IS NULL))
  UNION ALL
  SELECT src_record_key, 'unsupported_court_rule',
         jsonb_build_object('value', "المحكمة", 'target_field', court_target_field,
                            'target_value', court_target_value)
    FROM resolved
   WHERE court_rule_id IS NOT NULL
     AND court_target_field IS NOT NULL
     AND court_target_field NOT IN ('court','SPLIT','matter_destination')
  UNION ALL
  SELECT src_record_key, 'court_circuit_conflict',
         jsonb_build_object('legacy_court_raw', "المحكمة",
                            'legacy_circuit_raw', "الدائرة",
                            'reviewed_circuit', reviewed_circuit)
    FROM resolved
   WHERE reviewed_circuit IS NOT NULL AND "الدائرة" IS NOT NULL
     AND "الدائرة" IS DISTINCT FROM reviewed_circuit
  UNION ALL
  SELECT src_record_key, 'court_note_conflict',
         jsonb_build_object('legacy_court_raw', "المحكمة",
                            'legacy_notes_raw', "ملاحظات",
                            'reviewed_note', reviewed_note)
    FROM resolved
   WHERE reviewed_note IS NOT NULL AND "ملاحظات" IS NOT NULL
     AND "ملاحظات" IS DISTINCT FROM reviewed_note
),
reason_groups AS (
  SELECT src_record_key,
         array_agg(reason_code ORDER BY reason_code COLLATE "C") reason_codes,
         jsonb_agg(detail ORDER BY reason_code COLLATE "C") reason_details
    FROM reason_rows GROUP BY src_record_key
),
expected_target AS (
  SELECT r.src_record_key,
         r.src_extraction_sha256 extraction_sha256,
         r.parsed_hearing_id legacy_id,
         r.target_matter_id matter_id,
         r.parsed_hearing_date hearing_date,
         r.parsed_next_hearing_date next_hearing_date,
         r.expected_action_id action_id,
         r."الإجراء" legacy_action_raw,
         r."القرار" decision,
         r.parsed_report report,
         r."lastDecision" previous_decision,
         r."صالح/ضد" outcome,
         r.expected_court_id court_id,
         r."المحكمة" legacy_court_raw,
         r.expected_destination_id destination_id,
         r."الجهة" legacy_destination_raw,
         r."حضور الجلسة القادمة" next_attendance_raw,
         coalesce(r."الدائرة", r.reviewed_circuit) circuit,
         r."الدائرة" legacy_circuit_raw,
         coalesce(r."ملاحظات", r.reviewed_note) notes,
         r."ملاحظات" legacy_notes_raw,
         r.parsed_client_notified client_notified,
         r."shortDecision" short_decision,
         r.source_payload
    FROM resolved r
    LEFT JOIN reason_groups reasons USING (src_record_key)
   WHERE reasons.src_record_key IS NULL
),
expected_quarantine AS (
  SELECT r.src_record_key, r.src_extraction_sha256 extraction_sha256,
         r.src_file, r.src_row_num, r."ID_hearings" legacy_hearing_id,
         reasons.reason_codes, reasons.reason_details, r.source_payload
    FROM resolved r JOIN reason_groups reasons USING (src_record_key)
),
expected_attendee_base AS (
  SELECT h.id hearing_id, target.src_record_key hearing_source_record_key,
         span.person_id, cell.original_cell legacy_name_raw,
         target.src_record_key legacy_source_record_key,
         cell.extraction_sha256 legacy_source_extraction_sha256,
         cell.source_column, cell.source_column_ordinal,
         cell.cell_id source_cell_id, span.fragment_id source_span_id,
         span.sequence source_span_sequence
    FROM expected_target target
    LEFT JOIN hearings h ON h.legacy_source_record_key=target.src_record_key
    JOIN _migration.attendee_source_cell cell
      ON cell.src_record_key=target.src_record_key
    JOIN _migration.attendee_source_span span
      ON span.cell_id=cell.cell_id AND span.kind='person'
),
expected_attendee AS (
  SELECT base.*,
         row_number() OVER (
           PARTITION BY hearing_source_record_key
           ORDER BY source_column_ordinal, source_span_sequence
         )::integer ordinal
    FROM expected_attendee_base base
),
target_comparison AS (
  SELECT count(*) defects
    FROM expected_target expected
    FULL JOIN (
      SELECT * FROM hearings WHERE legacy_source_record_key IS NOT NULL
    ) actual ON actual.legacy_source_record_key=expected.src_record_key
   WHERE expected.src_record_key IS NULL OR actual.id IS NULL
      OR (actual.legacy_id, actual.legacy_source_extraction_sha256,
          actual.matter_id, actual.hearing_date, actual.next_hearing_date,
          actual.action_id, actual.legacy_action_raw, actual.decision,
          actual.report, actual.previous_decision, actual.outcome,
          actual.court_id, actual.legacy_court_raw, actual.destination_id,
          actual.legacy_destination_raw, actual.next_attendance_raw,
          actual.circuit, actual.legacy_circuit_raw, actual.notes,
          actual.legacy_notes_raw, actual.client_notified,
          actual.short_decision, actual.legacy_source_payload)
         IS DISTINCT FROM
         (expected.legacy_id, expected.extraction_sha256,
          expected.matter_id, expected.hearing_date, expected.next_hearing_date,
          expected.action_id, expected.legacy_action_raw, expected.decision,
          expected.report, expected.previous_decision, expected.outcome,
          expected.court_id, expected.legacy_court_raw, expected.destination_id,
          expected.legacy_destination_raw, expected.next_attendance_raw,
          expected.circuit, expected.legacy_circuit_raw, expected.notes,
          expected.legacy_notes_raw, expected.client_notified,
          expected.short_decision, expected.source_payload)
),
quarantine_comparison AS (
  SELECT count(*) defects
    FROM expected_quarantine expected
    FULL JOIN quarantine.hearing_transform actual USING (src_record_key)
   WHERE expected.src_record_key IS NULL OR actual.src_record_key IS NULL
      OR (actual.extraction_sha256, actual.src_file, actual.src_row_num,
          actual.legacy_hearing_id, actual.reason_codes,
          actual.reason_details, actual.source_payload)
         IS DISTINCT FROM
         (expected.extraction_sha256, expected.src_file, expected.src_row_num,
          expected.legacy_hearing_id, expected.reason_codes,
          expected.reason_details, expected.source_payload)
),
attendee_comparison AS (
  SELECT count(*) defects
    FROM expected_attendee expected
    FULL JOIN (
      SELECT * FROM hearing_attendees WHERE legacy_source_record_key IS NOT NULL
    ) actual ON actual.source_span_id=expected.source_span_id
   WHERE expected.source_span_id IS NULL OR actual.id IS NULL
      OR (actual.hearing_id, actual.person_id, actual.legacy_name_raw,
          actual.ordinal, actual.legacy_source_record_key,
          actual.legacy_source_extraction_sha256, actual.source_column,
          actual.source_column_ordinal, actual.source_cell_id,
          actual.source_span_sequence)
         IS DISTINCT FROM
         (expected.hearing_id, expected.person_id, expected.legacy_name_raw,
          expected.ordinal, expected.legacy_source_record_key,
          expected.legacy_source_extraction_sha256, expected.source_column,
          expected.source_column_ordinal, expected.source_cell_id,
          expected.source_span_sequence)
)
SELECT
  (SELECT count(*) FROM source) source_hearings,
  (SELECT count(*) FROM expected_target) expected_hearings,
  (SELECT count(*) FROM expected_quarantine) expected_quarantine,
  (SELECT count(*) FROM hearings WHERE legacy_source_record_key IS NOT NULL) actual_hearings,
  (SELECT count(*) FROM quarantine.hearing_transform) actual_quarantine,
  (SELECT defects FROM target_comparison) target_defects,
  (SELECT defects FROM quarantine_comparison) quarantine_defects,
  (SELECT count(*) FROM source s
    WHERE (SELECT count(*) FROM hearings h
            WHERE h.legacy_source_record_key=s.src_record_key)
        + (SELECT count(*) FROM quarantine.hearing_transform q
            WHERE q.src_record_key=s.src_record_key) <> 1) source_partition_defects,
  (SELECT count(*) FROM _migration.attendee_source_cell cell
    WHERE (SELECT count(*) FROM hearings h
            WHERE h.legacy_source_record_key=cell.src_record_key)
        + (SELECT count(*) FROM quarantine.hearing_transform q
            WHERE q.src_record_key=cell.src_record_key) <> 1) audit_cell_partition_defects,
  (SELECT count(*) FROM _migration.attendee_source_cell) audit_cells,
  (SELECT count(*) FROM _migration.attendee_source_cell cell
    JOIN expected_target target ON target.src_record_key=cell.src_record_key) target_audit_cells,
  (SELECT count(*) FROM _migration.attendee_source_cell cell
    JOIN expected_quarantine q ON q.src_record_key=cell.src_record_key) quarantined_audit_cells,
  (SELECT count(*) FROM expected_attendee) expected_attendees,
  (SELECT count(*) FROM hearing_attendees
    WHERE legacy_source_record_key IS NOT NULL) actual_attendees,
  (SELECT defects FROM attendee_comparison) attendee_defects,
  (SELECT count(*) FROM _migration.attendee_source_span span
    JOIN expected_quarantine q ON q.src_record_key=span.src_record_key
   WHERE span.kind='person') quarantined_person_spans,
  (SELECT count(DISTINCT person_id) FROM expected_attendee) distinct_attendee_people,
  (SELECT count(*) FROM _migration.attendee_source_span span
   WHERE span.kind='person'
     AND 1 <> (SELECT count(*) FROM person_name_alias alias
               WHERE alias.alias_ar=span.raw AND alias.person_id=span.person_id))
    attendee_alias_defects,
  (SELECT count(*) FROM hearing_attendees attendee
   WHERE attendee.legacy_source_record_key IS NOT NULL
     AND EXISTS (SELECT 1 FROM _migration.attendee_source_span span
                  WHERE span.fragment_id=attendee.source_span_id
                    AND span.kind <> 'person')) nonperson_attendee_defects,
  (SELECT count(*) FROM (
     SELECT source_field, _migration.reviewed_text_key(source_value)
       FROM migration_crosswalk
      WHERE source_field IN ('hearing_action','court')
      GROUP BY 1,2 HAVING count(*) > 1
   ) collisions) reviewed_key_collisions;
