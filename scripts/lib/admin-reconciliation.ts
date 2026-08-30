import type { ClientBase } from 'pg';

type ReconciliationRow = Record<string, string | number | bigint>;

export type AdminTaskCreationDateBaseline = {
  transformedTasks: number;
  populatedDates: number;
  nullDates: number;
  minimumDate: string;
  maximumDate: string;
};

export const ADMIN_TASK_CREATION_DATE_BASELINE: AdminTaskCreationDateBaseline = {
  transformedTasks: 3_694,
  populatedDates: 1_906,
  nullDates: 1_788,
  minimumDate: '2018-02-22',
  maximumDate: '2026-08-18',
};

/**
 * Independent SQL oracle for Task 2.9A. It does not import or call the
 * TypeScript writer/planner. Typed values, reviewed mappings, the exact
 * source-to-outcome partition, and ordered quarantine evidence are rebuilt
 * directly from staging on every db:check run.
 */
export const ADMIN_RECONCILIATION_SQL = `
WITH
task_source AS (
  SELECT s.*,
         to_jsonb(s)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] payload,
         CASE WHEN s."ID_Task" ~ '^[0-9]+$' AND s."ID_Task"::numeric BETWEEN 1 AND 2147483647
              THEN s."ID_Task"::integer END legacy_id_int,
         CASE WHEN s."matterID" ~ '^[0-9]+$' AND s."matterID"::numeric BETWEEN 1 AND 2147483647
              THEN s."matterID"::integer END matter_id_int,
         CASE WHEN s."تاريخ الإنشاء" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$'
                   AND pg_input_is_valid(left(s."تاريخ الإنشاء",10),'date')
              THEN left(s."تاريخ الإنشاء",10)::date END task_created_date_value,
         CASE WHEN s."تاريخ التنفيذ" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$'
                   AND pg_input_is_valid(left(s."تاريخ التنفيذ",10),'date')
              THEN left(s."تاريخ التنفيذ",10)::date END execution_date_value,
         CASE WHEN s."آخر موعد" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$'
                   AND pg_input_is_valid(left(s."آخر موعد",10),'date')
              THEN left(s."آخر موعد",10)::date END deadline_value,
         _migration.reviewed_text_key(s."المحكمة") court_key,
         _migration.reviewed_text_key(s."الجهة") destination_key
    FROM staging."admin work table" s
),
task_analysis AS (
  SELECT s.*,
         m.id resolved_matter_id,
         mq.reason_codes parent_matter_reason_codes,
         pa.person_id direct_person_id,
         rv.id review_value_id,rv.firm_answer,rv.firm_person,
         reviewed_pa.person_id reviewed_person_id,
         lc.id direct_court_id,cw.id court_rule_id,cw.target_field court_rule_field,
         cw.target_value court_rule_value,cw.reviewer_note court_rule_note,
         target_court.id rule_court_id,
         CASE WHEN cw.target_field='circuit' THEN cw.target_value
              WHEN cw.target_field='SPLIT'
              THEN substring(cw.reviewer_note from 'circuit=''([^'']+)''') END reviewed_circuit,
         CASE WHEN cw.target_field='matter_destination' THEN court_destination.id END court_destination_id,
         source_destination.id source_destination_id
    FROM task_source s
    LEFT JOIN matters m ON m.legacy_id=s.matter_id_int AND m.legacy_source_record_key IS NOT NULL
    LEFT JOIN quarantine.matter_transform mq ON mq.legacy_matter_id=s."matterID"
    LEFT JOIN person_name_alias pa ON pa.alias_ar=btrim(s."القائم بالعمل")
    LEFT JOIN quarantine.review_value rv
      ON rv.topic='admin_assignee' AND rv.value=btrim(s."القائم بالعمل") AND rv.answered_at IS NOT NULL
    LEFT JOIN person_name_alias reviewed_pa ON reviewed_pa.alias_ar=btrim(rv.firm_person)
    LEFT JOIN migration_crosswalk cw
      ON cw.source_field='court' AND _migration.reviewed_text_key(cw.source_value)=s.court_key
    LEFT JOIN lookup_court lc ON _migration.reviewed_text_key(lc.label_ar)=s.court_key
    LEFT JOIN lookup_court target_court ON target_court.label_ar=cw.target_value
    LEFT JOIN lookup_matter_destination court_destination
      ON court_destination.label_ar=cw.target_value
    LEFT JOIN lookup_matter_destination source_destination
      ON _migration.reviewed_text_key(source_destination.label_ar)=s.destination_key
),
task_reason_rows AS (
  SELECT src_record_key,'invalid_task_id' code,jsonb_build_object('value',"ID_Task") detail
    FROM task_analysis WHERE legacy_id_int IS NULL
  UNION ALL SELECT src_record_key,'missing_matter_link',jsonb_build_object('matterID',NULL)
    FROM task_analysis WHERE "matterID" IS NULL
  UNION ALL SELECT src_record_key,'parent_matter_quarantined',
         jsonb_build_object('matterID',"matterID",'matter_reason_codes',parent_matter_reason_codes)
    FROM task_analysis WHERE "matterID" IS NOT NULL AND parent_matter_reason_codes IS NOT NULL
  UNION ALL SELECT src_record_key,'invalid_matter_link',jsonb_build_object('matterID',"matterID")
    FROM task_analysis WHERE "matterID" IS NOT NULL AND parent_matter_reason_codes IS NULL
      AND (matter_id_int IS NULL OR resolved_matter_id IS NULL)
  UNION ALL SELECT src_record_key,'invalid_task_created_date',jsonb_build_object('value',"تاريخ الإنشاء")
    FROM task_analysis WHERE "تاريخ الإنشاء" IS NOT NULL AND task_created_date_value IS NULL
  UNION ALL SELECT src_record_key,'invalid_execution_date',jsonb_build_object('value',"تاريخ التنفيذ")
    FROM task_analysis WHERE "تاريخ التنفيذ" IS NOT NULL AND execution_date_value IS NULL
  UNION ALL SELECT src_record_key,'invalid_deadline',jsonb_build_object('value',"آخر موعد")
    FROM task_analysis WHERE "آخر موعد" IS NOT NULL AND deadline_value IS NULL
  UNION ALL SELECT src_record_key,'assigned_to_multiple_reviewed_people',
         jsonb_build_object('value',"القائم بالعمل",'review_value_id',review_value_id::text,'firm_answer',firm_answer)
    FROM task_analysis WHERE "القائم بالعمل" IS NOT NULL AND btrim("القائم بالعمل")<>''
      AND direct_person_id IS NULL AND firm_answer='split'
  UNION ALL SELECT src_record_key,'assigned_to_review_missing_person_identity',
         jsonb_build_object('value',"القائم بالعمل",'review_value_id',review_value_id::text,
                            'firm_answer',firm_answer,'firm_person',firm_person)
    FROM task_analysis WHERE "القائم بالعمل" IS NOT NULL AND btrim("القائم بالعمل")<>''
      AND direct_person_id IS NULL AND firm_answer='person' AND reviewed_person_id IS NULL
  UNION ALL SELECT src_record_key,'assigned_to_unresolved',jsonb_build_object('value',"القائم بالعمل")
    FROM task_analysis WHERE "القائم بالعمل" IS NOT NULL AND btrim("القائم بالعمل")<>''
      AND direct_person_id IS NULL AND coalesce(firm_answer,'') NOT IN ('not a name','split','person')
  UNION ALL SELECT src_record_key,'unmapped_court',jsonb_build_object('value',"المحكمة")
    FROM task_analysis WHERE "المحكمة" IS NOT NULL AND direct_court_id IS NULL AND court_rule_id IS NULL
  UNION ALL SELECT src_record_key,'invalid_court_rule',
         jsonb_build_object('value',"المحكمة",'target_field',court_rule_field,'target_value',court_rule_value)
    FROM task_analysis WHERE court_rule_field IN ('court','SPLIT') AND rule_court_id IS NULL
  UNION ALL SELECT src_record_key,'invalid_court_destination_rule',
         jsonb_build_object('value',"المحكمة",'target_value',court_rule_value)
    FROM task_analysis WHERE court_rule_field='matter_destination' AND court_destination_id IS NULL
  UNION ALL SELECT src_record_key,'invalid_court_circuit_rule',jsonb_build_object('value',"المحكمة")
    FROM task_analysis WHERE court_rule_field='circuit' AND court_rule_value IS NULL
  UNION ALL SELECT src_record_key,'unsupported_court_rule',
         jsonb_build_object('value',"المحكمة",'target_field',court_rule_field,'target_value',court_rule_value)
    FROM task_analysis WHERE court_rule_field IS NOT NULL
      AND court_rule_field NOT IN ('court','SPLIT','matter_destination','circuit')
  UNION ALL SELECT src_record_key,'court_circuit_conflict',
         jsonb_build_object('legacy_court_raw',"المحكمة",'legacy_circuit_raw',"الدائرة",'reviewed_circuit',reviewed_circuit)
    FROM task_analysis WHERE reviewed_circuit IS NOT NULL AND "الدائرة" IS NOT NULL
      AND "الدائرة" IS DISTINCT FROM reviewed_circuit
  UNION ALL SELECT src_record_key,'unmapped_destination',jsonb_build_object('value',"الجهة")
    FROM task_analysis WHERE "الجهة" IS NOT NULL AND source_destination_id IS NULL
  UNION ALL SELECT src_record_key,'court_destination_conflict',
         jsonb_build_object('legacy_court_raw',"المحكمة",'legacy_destination_raw',"الجهة",
                            'court_destination_id',court_destination_id,'source_destination_id',source_destination_id)
    FROM task_analysis WHERE court_destination_id IS NOT NULL AND source_destination_id IS NOT NULL
      AND court_destination_id<>source_destination_id
),
expected_task_q AS (
  SELECT src_record_key,array_agg(code ORDER BY code) reason_codes,
         jsonb_agg(detail ORDER BY code) reason_details
    FROM task_reason_rows GROUP BY src_record_key
),
safe_tasks AS (
  SELECT a.*,
         coalesce(direct_person_id,reviewed_person_id) expected_person_id,
         CASE WHEN court_rule_field IN ('court','SPLIT') THEN rule_court_id
              WHEN court_rule_id IS NULL THEN direct_court_id END expected_court_id,
         coalesce(source_destination_id,court_destination_id) expected_destination_id,
         coalesce("الدائرة",reviewed_circuit) expected_circuit
    FROM task_analysis a LEFT JOIN expected_task_q q USING(src_record_key)
   WHERE q.src_record_key IS NULL
),
action_source AS (
  SELECT s.*,
         to_jsonb(s)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] payload,
         CASE WHEN s."ID_process" ~ '^[0-9]+$' AND s."ID_process"::numeric BETWEEN 1 AND 2147483647
              THEN s."ID_process"::integer END legacy_id_int,
         CASE WHEN s."تاريخ الإجراء" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$'
                   AND pg_input_is_valid(left(s."تاريخ الإجراء",10),'date')
              THEN left(s."تاريخ الإجراء",10)::date END action_date_value,
         CASE WHEN s."الموعد القادم" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$'
                   AND pg_input_is_valid(left(s."الموعد القادم",10),'date')
              THEN left(s."الموعد القادم",10)::date END next_appointment_value,
         row_number() OVER (
           PARTITION BY s."ID_Task"
           ORDER BY CASE WHEN s."ID_process" ~ '^[0-9]+$' THEN s."ID_process"::numeric END,s.src_record_key
         )::integer expected_ordinal
    FROM staging."إجراءات المهام" s
),
action_analysis AS (
  SELECT s.*,st.src_record_key parent_source_key,tq.reason_codes parent_reason_codes,
         pa.person_id direct_person_id,rv.id review_value_id,rv.firm_answer,rv.firm_person,
         reviewed_pa.person_id reviewed_person_id
    FROM action_source s
    LEFT JOIN safe_tasks st ON st."ID_Task"=s."ID_Task"
    LEFT JOIN expected_task_q tq ON EXISTS (
      SELECT 1 FROM task_source ts WHERE ts.src_record_key=tq.src_record_key AND ts."ID_Task"=s."ID_Task")
    LEFT JOIN person_name_alias pa ON pa.alias_ar=btrim(s."القائم بالعمل")
    LEFT JOIN quarantine.review_value rv
      ON rv.topic='admin_assignee' AND rv.value=btrim(s."القائم بالعمل") AND rv.answered_at IS NOT NULL
    LEFT JOIN person_name_alias reviewed_pa ON reviewed_pa.alias_ar=btrim(rv.firm_person)
),
action_reason_rows AS (
  SELECT src_record_key,'invalid_action_id' code,jsonb_build_object('value',"ID_process") detail
    FROM action_analysis WHERE legacy_id_int IS NULL
  UNION ALL SELECT src_record_key,'missing_task_link',jsonb_build_object('ID_Task',NULL)
    FROM action_analysis WHERE "ID_Task" IS NULL
  UNION ALL SELECT src_record_key,'parent_task_quarantined',
         jsonb_build_object('ID_Task',"ID_Task",'task_reason_codes',parent_reason_codes)
    FROM action_analysis WHERE "ID_Task" IS NOT NULL AND parent_reason_codes IS NOT NULL
  UNION ALL SELECT src_record_key,'invalid_task_link',jsonb_build_object('ID_Task',"ID_Task")
    FROM action_analysis WHERE "ID_Task" IS NOT NULL AND parent_reason_codes IS NULL AND parent_source_key IS NULL
  UNION ALL SELECT src_record_key,'invalid_action_date',jsonb_build_object('value',"تاريخ الإجراء")
    FROM action_analysis WHERE "تاريخ الإجراء" IS NOT NULL AND action_date_value IS NULL
  UNION ALL SELECT src_record_key,'invalid_next_appointment',jsonb_build_object('value',"الموعد القادم")
    FROM action_analysis WHERE "الموعد القادم" IS NOT NULL AND next_appointment_value IS NULL
  UNION ALL SELECT src_record_key,'performed_by_multiple_reviewed_people',
         jsonb_build_object('value',"القائم بالعمل",'review_value_id',review_value_id::text,'firm_answer',firm_answer)
    FROM action_analysis WHERE "القائم بالعمل" IS NOT NULL AND btrim("القائم بالعمل")<>''
      AND direct_person_id IS NULL AND firm_answer='split'
  UNION ALL SELECT src_record_key,'performed_by_review_missing_person_identity',
         jsonb_build_object('value',"القائم بالعمل",'review_value_id',review_value_id::text,
                            'firm_answer',firm_answer,'firm_person',firm_person)
    FROM action_analysis WHERE "القائم بالعمل" IS NOT NULL AND btrim("القائم بالعمل")<>''
      AND direct_person_id IS NULL AND firm_answer='person' AND reviewed_person_id IS NULL
  UNION ALL SELECT src_record_key,'performed_by_unresolved',jsonb_build_object('value',"القائم بالعمل")
    FROM action_analysis WHERE "القائم بالعمل" IS NOT NULL AND btrim("القائم بالعمل")<>''
      AND direct_person_id IS NULL AND coalesce(firm_answer,'') NOT IN ('not a name','split','person')
),
expected_action_q AS (
  SELECT src_record_key,array_agg(code ORDER BY code) reason_codes,
         jsonb_agg(detail ORDER BY code) reason_details
    FROM action_reason_rows GROUP BY src_record_key
),
safe_actions AS (
  SELECT a.*,coalesce(direct_person_id,reviewed_person_id) expected_person_id
    FROM action_analysis a LEFT JOIN expected_action_q q USING(src_record_key)
   WHERE q.src_record_key IS NULL
)
SELECT
  (SELECT count(*) FROM task_source) task_source,
  (SELECT count(*) FROM safe_tasks) expected_tasks,
  (SELECT count(*) FROM admin_tasks WHERE legacy_source_record_key IS NOT NULL) actual_tasks,
  (SELECT count(*) FROM expected_task_q) expected_task_q,
  (SELECT count(*) FROM quarantine.admin_task_transform) actual_task_q,
  (SELECT count(*) FROM action_source) action_source,
  (SELECT count(*) FROM safe_actions) expected_actions,
  (SELECT count(*) FROM task_actions WHERE legacy_source_record_key IS NOT NULL) actual_actions,
  (SELECT count(*) FROM expected_action_q) expected_action_q,
  (SELECT count(*) FROM quarantine.task_action_transform) actual_action_q,
  (SELECT count(*) FROM safe_tasks s LEFT JOIN admin_tasks t ON t.legacy_source_record_key=s.src_record_key
    WHERE t.id IS NULL OR t.legacy_id IS DISTINCT FROM s.legacy_id_int
       OR t.matter_id IS DISTINCT FROM s.resolved_matter_id
       OR t.required_work IS DISTINCT FROM s."العمل المطلوب"
       OR t.assigned_to_person_id IS DISTINCT FROM s.expected_person_id
       OR t.legacy_assignee_raw IS DISTINCT FROM s."القائم بالعمل"
       OR t.task_created_date IS DISTINCT FROM s.task_created_date_value
       OR t.execution_date IS DISTINCT FROM s.execution_date_value
       OR t.result IS DISTINCT FROM s."النتيجة"
       OR t.previous_decision IS DISTINCT FROM s."القرار السابق"
       OR t.last_followup IS DISTINCT FROM s."آخر متابعة"
       OR t.deadline IS DISTINCT FROM s.deadline_value
       OR t.court_id IS DISTINCT FROM s.expected_court_id
       OR t.legacy_court_raw IS DISTINCT FROM s."المحكمة"
       OR t.circuit IS DISTINCT FROM s.expected_circuit
       OR t.legacy_circuit_raw IS DISTINCT FROM s."الدائرة"
       OR t.destination_id IS DISTINCT FROM s.expected_destination_id
       OR t.legacy_destination_raw IS DISTINCT FROM s."الجهة"
       OR t.status IS DISTINCT FROM s."الحالة" OR t.alert IS DISTINCT FROM s."تنبيه"
       OR t.legacy_source_extraction_sha256 IS DISTINCT FROM s.src_extraction_sha256
       OR t.legacy_source_payload IS DISTINCT FROM s.payload) task_target_mismatch,
  (SELECT count(*) FROM admin_tasks t WHERE t.legacy_source_record_key IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM safe_tasks s WHERE s.src_record_key=t.legacy_source_record_key)) stale_tasks,
  (SELECT count(*) FROM expected_task_q e
    FULL JOIN quarantine.admin_task_transform q USING(src_record_key)
    LEFT JOIN task_source s USING(src_record_key)
   WHERE e.src_record_key IS NULL OR q.src_record_key IS NULL
      OR q.extraction_sha256 IS DISTINCT FROM s.src_extraction_sha256
      OR q.src_file IS DISTINCT FROM s.src_file OR q.src_row_num IS DISTINCT FROM s.src_row_num
      OR q.legacy_task_id IS DISTINCT FROM s."ID_Task" OR q.source_payload IS DISTINCT FROM s.payload
      OR q.reason_codes IS DISTINCT FROM e.reason_codes OR q.reason_details IS DISTINCT FROM e.reason_details) task_q_mismatch,
  (SELECT count(*) FROM safe_actions s
    LEFT JOIN task_actions a ON a.legacy_source_record_key=s.src_record_key
    LEFT JOIN admin_tasks t ON t.legacy_source_record_key=s.parent_source_key
   WHERE a.id IS NULL OR a.legacy_id IS DISTINCT FROM s.legacy_id_int
      OR a.task_id IS DISTINCT FROM t.id OR a.legacy_task_id_raw IS DISTINCT FROM s."ID_Task"
      OR a.action_date IS DISTINCT FROM s.action_date_value
      OR a.performed_by_person_id IS DISTINCT FROM s.expected_person_id
      OR a.legacy_performed_by_raw IS DISTINCT FROM s."القائم بالعمل"
      OR a.result IS DISTINCT FROM s."النتيجة" OR a.report IS DISTINCT FROM s."تقرير"
      OR a.next_appointment IS DISTINCT FROM s.next_appointment_value
      OR a.source_ordinal IS DISTINCT FROM s.expected_ordinal
      OR a.legacy_source_extraction_sha256 IS DISTINCT FROM s.src_extraction_sha256
      OR a.legacy_source_payload IS DISTINCT FROM s.payload) action_target_mismatch,
  (SELECT count(*) FROM task_actions a WHERE a.legacy_source_record_key IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM safe_actions s WHERE s.src_record_key=a.legacy_source_record_key)) stale_actions,
  (SELECT count(*) FROM expected_action_q e
    FULL JOIN quarantine.task_action_transform q USING(src_record_key)
    LEFT JOIN action_source s USING(src_record_key)
   WHERE e.src_record_key IS NULL OR q.src_record_key IS NULL
      OR q.extraction_sha256 IS DISTINCT FROM s.src_extraction_sha256
      OR q.src_file IS DISTINCT FROM s.src_file OR q.src_row_num IS DISTINCT FROM s.src_row_num
      OR q.legacy_action_id IS DISTINCT FROM s."ID_process"
      OR q.legacy_task_id_raw IS DISTINCT FROM s."ID_Task"
      OR q.source_payload IS DISTINCT FROM s.payload
      OR q.reason_codes IS DISTINCT FROM e.reason_codes OR q.reason_details IS DISTINCT FROM e.reason_details) action_q_mismatch,
  (SELECT count(*) FROM admin_tasks t
    WHERE t.legacy_source_record_key IS NULL AND (
      t.legacy_source_extraction_sha256 IS NOT NULL OR t.legacy_source_payload IS NOT NULL)) bad_native_tasks,
  (SELECT count(*) FROM task_actions a
    WHERE a.legacy_source_record_key IS NULL AND (
      a.legacy_source_extraction_sha256 IS NOT NULL OR a.legacy_source_payload IS NOT NULL OR a.source_ordinal IS NOT NULL)) bad_native_actions,
  (SELECT count(*) FROM safe_tasks) creation_date_legacy_tasks,
  (SELECT count(*) FROM admin_tasks t
    JOIN safe_tasks s ON s.src_record_key=t.legacy_source_record_key
   WHERE t.task_created_date IS NOT NULL) creation_date_populated,
  (SELECT count(*) FROM admin_tasks t
    JOIN safe_tasks s ON s.src_record_key=t.legacy_source_record_key
   WHERE t.task_created_date IS NULL) creation_date_null,
  (SELECT min(t.task_created_date)::text FROM admin_tasks t
    JOIN safe_tasks s ON s.src_record_key=t.legacy_source_record_key) creation_date_minimum,
  (SELECT max(t.task_created_date)::text FROM admin_tasks t
    JOIN safe_tasks s ON s.src_record_key=t.legacy_source_record_key) creation_date_maximum,
  (SELECT count(*) FROM admin_tasks t
    JOIN safe_tasks s ON s.src_record_key=t.legacy_source_record_key
   WHERE t.task_created_date IS NOT NULL
     AND t.task_created_date=t.created_at::date
     AND t.task_created_date IS DISTINCT FROM s.task_created_date_value) creation_date_created_at_substitution,
  (SELECT count(*) FROM admin_tasks t
   WHERE t.legacy_source_record_key IS NULL AND t.task_created_date IS NOT NULL) native_tasks_with_creation_date
`;

export async function reconcileAdminWorks(
  db: ClientBase,
  options: { creationDateBaseline?: AdminTaskCreationDateBaseline } = {},
): Promise<{
  row: ReconciliationRow;
  defects: string[];
}> {
  const result = await db.query<ReconciliationRow>(ADMIN_RECONCILIATION_SQL);
  const row = result.rows[0] ?? {};
  const defects: string[] = [];
  const equalityGroups = [
    ['task_source', 'expected_tasks', 'expected_task_q'],
    ['action_source', 'expected_actions', 'expected_action_q'],
  ] as const;
  for (const [source, target, quarantine] of equalityGroups) {
    if (BigInt(row[source] ?? 0) !== BigInt(row[target] ?? 0) + BigInt(row[quarantine] ?? 0))
      defects.push(`${source} does not partition into ${target} + ${quarantine}`);
  }
  for (const [expected, actual] of [
    ['expected_tasks', 'actual_tasks'],
    ['expected_task_q', 'actual_task_q'],
    ['expected_actions', 'actual_actions'],
    ['expected_action_q', 'actual_action_q'],
  ] as const) {
    if (BigInt(row[expected] ?? 0) !== BigInt(row[actual] ?? 0))
      defects.push(`${actual} is ${String(row[actual])}; expected ${String(row[expected])}`);
  }
  for (const key of [
    'task_target_mismatch',
    'stale_tasks',
    'task_q_mismatch',
    'action_target_mismatch',
    'stale_actions',
    'action_q_mismatch',
    'bad_native_tasks',
    'bad_native_actions',
    'creation_date_created_at_substitution',
  ]) {
    if (BigInt(row[key] ?? 0) !== 0n) defects.push(`${key}: ${String(row[key])}`);
  }
  const baseline = options.creationDateBaseline;
  if (baseline !== undefined) {
    for (const [key, expected] of [
      ['creation_date_legacy_tasks', baseline.transformedTasks],
      ['creation_date_populated', baseline.populatedDates],
      ['creation_date_null', baseline.nullDates],
    ] as const) {
      if (BigInt(row[key] ?? 0) !== BigInt(expected))
        defects.push(`${key} is ${String(row[key])}; expected ${expected}`);
    }
    for (const [key, expected] of [
      ['creation_date_minimum', baseline.minimumDate],
      ['creation_date_maximum', baseline.maximumDate],
    ] as const) {
      if (String(row[key] ?? '') !== expected)
        defects.push(`${key} is ${String(row[key])}; expected ${expected}`);
    }
  }
  return { row, defects };
}
