import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';

type SourceTask = {
  src_record_key: string;
  src_extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  legacy_task_id: string | null;
  task_created_date_raw: string | null;
  execution_date_raw: string | null;
  result: string | null;
  assignee_raw: string | null;
  previous_decision: string | null;
  last_followup_raw: string | null;
  court_raw: string | null;
  court_key: string | null;
  circuit_raw: string | null;
  destination_raw: string | null;
  destination_key: string | null;
  required_work: string | null;
  status: string | null;
  alert: string | null;
  deadline_raw: string | null;
  legacy_matter_id: string | null;
  source_payload: Record<string, unknown>;
};

type SourceAction = {
  src_record_key: string;
  src_extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  legacy_action_id: string | null;
  legacy_task_id_raw: string | null;
  action_date_raw: string | null;
  performed_by_raw: string | null;
  result: string | null;
  report: string | null;
  next_appointment_raw: string | null;
  source_ordinal: number;
  source_payload: Record<string, unknown>;
};

type LookupRow = { id: number; label_ar: string; reviewed_key: string };
type CrosswalkRow = {
  source_value: string;
  source_key: string;
  target_field: string | null;
  target_value: string | null;
  reviewer_note: string | null;
};
type MatterRow = { id: number; legacy_id: number };
type ParentQuarantine = { legacy_matter_id: string | null; reason_codes: string[] };
type AliasRow = { alias_ar: string; person_id: number };
type ReviewRow = {
  id: string;
  value: string;
  firm_answer: string | null;
  firm_person: string | null;
};

type ReasonDetail = Record<string, unknown>;

export type AdminTaskTargetPlan = {
  srcRecordKey: string;
  extractionSha256: string;
  legacyId: number;
  matterId: number | null;
  requiredWork: string | null;
  assignedToPersonId: number | null;
  legacyAssigneeRaw: string | null;
  taskCreatedDate: string | null;
  executionDate: string | null;
  result: string | null;
  previousDecision: string | null;
  lastFollowup: string | null;
  deadline: string | null;
  courtId: number | null;
  legacyCourtRaw: string | null;
  circuit: string | null;
  legacyCircuitRaw: string | null;
  destinationId: number | null;
  legacyDestinationRaw: string | null;
  status: string | null;
  alert: string | null;
  sourcePayload: Record<string, unknown>;
};

export type TaskActionTargetPlan = {
  srcRecordKey: string;
  extractionSha256: string;
  legacyId: number;
  parentTaskSourceKey: string;
  legacyTaskIdRaw: string;
  actionDate: string | null;
  performedByPersonId: number | null;
  legacyPerformedByRaw: string | null;
  result: string | null;
  report: string | null;
  nextAppointment: string | null;
  sourceOrdinal: number;
  sourcePayload: Record<string, unknown>;
};

export type AdminQuarantinePlan = {
  srcRecordKey: string;
  extractionSha256: string;
  srcFile: string;
  srcRowNum: number;
  legacyId: string | null;
  legacyTaskIdRaw?: string | null;
  reasonCodes: string[];
  reasonDetails: ReasonDetail[];
  sourcePayload: Record<string, unknown>;
};

export type AdminTransformPlan = {
  taskSourceCount: number;
  actionSourceCount: number;
  tasks: AdminTaskTargetPlan[];
  actions: TaskActionTargetPlan[];
  taskQuarantine: AdminQuarantinePlan[];
  actionQuarantine: AdminQuarantinePlan[];
};

function strictPositiveInteger(value: string | null): number | null {
  if (value === null || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function strictDate(value: string | null): string | null {
  if (value === null) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) 00:00:00$/);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function uniqueMap<T>(rows: readonly T[], key: (row: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const value = key(row);
    assert.ok(!result.has(value), `${label} is not unique: ${value}`);
    result.set(value, row);
  }
  return result;
}

function addReason(reasons: Map<string, ReasonDetail>, code: string, detail: ReasonDetail): void {
  assert.ok(!reasons.has(code), `duplicate administrative quarantine reason: ${code}`);
  reasons.set(code, detail);
}

function orderedReasons(reasons: Map<string, ReasonDetail>): {
  reasonCodes: string[];
  reasonDetails: ReasonDetail[];
} {
  const ordered = [...reasons.entries()].sort(([left], [right]) => left.localeCompare(right, 'en'));
  return {
    reasonCodes: ordered.map(([code]) => code),
    reasonDetails: ordered.map(([, detail]) => detail),
  };
}

function reviewedPart(note: string | null, field: 'circuit'): string | null {
  if (note === null) return null;
  return note.match(new RegExp(`${field}='([^']+)'`))?.[1] ?? null;
}

function resolveReviewedPerson(
  raw: string | null,
  aliases: Map<string, AliasRow>,
  reviews: Map<string, ReviewRow>,
  reasons: Map<string, ReasonDetail>,
  field: 'assigned_to' | 'performed_by',
): number | null {
  if (raw === null || raw.trim() === '') return null;
  const trimmed = raw.trim();
  const alias = aliases.get(trimmed);
  if (alias !== undefined) return alias.person_id;

  const review = reviews.get(trimmed);
  if (review?.firm_answer === 'not a name') return null;
  if (review?.firm_answer === 'person' && review.firm_person !== null) {
    const reviewedAlias = aliases.get(review.firm_person.trim());
    if (reviewedAlias !== undefined) return reviewedAlias.person_id;
  }
  if (review?.firm_answer === 'split') {
    addReason(reasons, `${field}_multiple_reviewed_people`, {
      value: raw,
      review_value_id: review.id,
      firm_answer: review.firm_answer,
    });
  } else if (review?.firm_answer === 'person') {
    addReason(reasons, `${field}_review_missing_person_identity`, {
      value: raw,
      review_value_id: review.id,
      firm_answer: review.firm_answer,
      firm_person: review.firm_person,
    });
  } else {
    addReason(reasons, `${field}_unresolved`, { value: raw });
  }
  return null;
}

export async function buildAdminTransformPlan(db: ClientBase): Promise<AdminTransformPlan> {
  // One pg Client serialises work internally. Explicit awaits avoid issuing
  // misleading concurrent queries against a single connection.
  const taskSource = await db.query<SourceTask>(`
      SELECT t.src_record_key,t.src_extraction_sha256,t.src_file,t.src_row_num,
             t."ID_Task" legacy_task_id,t."تاريخ الإنشاء" task_created_date_raw,
             t."تاريخ التنفيذ" execution_date_raw,
             t."النتيجة" result,t."القائم بالعمل" assignee_raw,
             t."القرار السابق" previous_decision,t."آخر متابعة" last_followup_raw,
             t."المحكمة" court_raw,_migration.reviewed_text_key(t."المحكمة") court_key,
             t."الدائرة" circuit_raw,t."الجهة" destination_raw,
             _migration.reviewed_text_key(t."الجهة") destination_key,
             t."العمل المطلوب" required_work,t."الحالة" status,t."تنبيه" alert,
             t."آخر موعد" deadline_raw,t."matterID" legacy_matter_id,
             to_jsonb(t)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] source_payload
        FROM staging."admin work table" t ORDER BY t.src_record_key`);
  const actionSource = await db.query<SourceAction>(`
      SELECT a.src_record_key,a.src_extraction_sha256,a.src_file,a.src_row_num,
             a."ID_process" legacy_action_id,a."ID_Task" legacy_task_id_raw,
             a."تاريخ الإجراء" action_date_raw,a."القائم بالعمل" performed_by_raw,
             a."النتيجة" result,a."تقرير" report,a."الموعد القادم" next_appointment_raw,
             row_number() OVER (
               PARTITION BY a."ID_Task"
               ORDER BY CASE WHEN a."ID_process" ~ '^[0-9]+$' THEN a."ID_process"::numeric END,
                        a.src_record_key
             )::integer source_ordinal,
             to_jsonb(a)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] source_payload
        FROM staging."إجراءات المهام" a ORDER BY a.src_record_key`);
  const matterRows = await db.query<MatterRow>(
    'SELECT id,legacy_id FROM matters WHERE legacy_source_record_key IS NOT NULL',
  );
  const parentQuarantineRows = await db.query<ParentQuarantine>(
    'SELECT legacy_matter_id,reason_codes FROM quarantine.matter_transform',
  );
  const courtRows = await db.query<LookupRow>(
    `SELECT id,label_ar,_migration.reviewed_text_key(label_ar) reviewed_key FROM lookup_court`,
  );
  const destinationRows = await db.query<LookupRow>(
    `SELECT id,label_ar,_migration.reviewed_text_key(label_ar) reviewed_key FROM lookup_matter_destination`,
  );
  const crosswalkRows = await db.query<CrosswalkRow>(`
      SELECT source_value,_migration.reviewed_text_key(source_value) source_key,
             target_field,target_value,reviewer_note
        FROM migration_crosswalk WHERE source_field='court'`);
  const aliasRows = await db.query<AliasRow>('SELECT alias_ar,person_id FROM person_name_alias');
  const reviewRows = await db.query<ReviewRow>(`
      SELECT id::text,value,firm_answer,firm_person
        FROM quarantine.review_value WHERE topic='admin_assignee' AND answered_at IS NOT NULL`);

  const matters = uniqueMap(matterRows.rows, (row) => String(row.legacy_id), 'matter legacy id');
  const parentQuarantine = uniqueMap(
    parentQuarantineRows.rows.filter(
      (row): row is ParentQuarantine & { legacy_matter_id: string } =>
        row.legacy_matter_id !== null,
    ),
    (row) => row.legacy_matter_id,
    'matter quarantine legacy id',
  );
  const courtsByKey = uniqueMap(courtRows.rows, (row) => row.reviewed_key, 'court reviewed key');
  const courtsByLabel = uniqueMap(courtRows.rows, (row) => row.label_ar, 'court label');
  const destinationsByKey = uniqueMap(
    destinationRows.rows,
    (row) => row.reviewed_key,
    'destination reviewed key',
  );
  const destinationsByLabel = uniqueMap(
    destinationRows.rows,
    (row) => row.label_ar,
    'destination label',
  );
  const courtRules = uniqueMap(crosswalkRows.rows, (row) => row.source_key, 'court rule');
  const aliases = uniqueMap(aliasRows.rows, (row) => row.alias_ar, 'person alias');
  const reviews = uniqueMap(reviewRows.rows, (row) => row.value, 'admin assignee review');

  const tasks: AdminTaskTargetPlan[] = [];
  const taskQuarantine: AdminQuarantinePlan[] = [];
  const targetTaskByLegacyId = new Map<string, string>();
  const quarantinedTaskByLegacyId = new Map<string, string[]>();

  for (const row of taskSource.rows) {
    const reasons = new Map<string, ReasonDetail>();
    const legacyId = strictPositiveInteger(row.legacy_task_id);
    if (legacyId === null) addReason(reasons, 'invalid_task_id', { value: row.legacy_task_id });

    let matterId: number | null = null;
    if (row.legacy_matter_id === null) {
      addReason(reasons, 'missing_matter_link', { matterID: null });
    } else if (parentQuarantine.has(row.legacy_matter_id)) {
      addReason(reasons, 'parent_matter_quarantined', {
        matterID: row.legacy_matter_id,
        matter_reason_codes: parentQuarantine.get(row.legacy_matter_id)!.reason_codes,
      });
    } else {
      const matter = matters.get(row.legacy_matter_id);
      if (strictPositiveInteger(row.legacy_matter_id) === null || matter === undefined) {
        addReason(reasons, 'invalid_matter_link', { matterID: row.legacy_matter_id });
      } else {
        matterId = matter.id;
      }
    }

    const taskCreatedDate = strictDate(row.task_created_date_raw);
    if (row.task_created_date_raw !== null && taskCreatedDate === null)
      addReason(reasons, 'invalid_task_created_date', { value: row.task_created_date_raw });
    const executionDate = strictDate(row.execution_date_raw);
    if (row.execution_date_raw !== null && executionDate === null)
      addReason(reasons, 'invalid_execution_date', { value: row.execution_date_raw });
    const deadline = strictDate(row.deadline_raw);
    if (row.deadline_raw !== null && deadline === null)
      addReason(reasons, 'invalid_deadline', { value: row.deadline_raw });

    const assignedToPersonId = resolveReviewedPerson(
      row.assignee_raw,
      aliases,
      reviews,
      reasons,
      'assigned_to',
    );

    let courtId: number | null = null;
    let reviewedCircuit: string | null = null;
    let courtDestinationId: number | null = null;
    if (row.court_raw !== null) {
      const rule = row.court_key === null ? undefined : courtRules.get(row.court_key);
      const direct = row.court_key === null ? undefined : courtsByKey.get(row.court_key);
      if (rule === undefined) {
        if (direct === undefined) addReason(reasons, 'unmapped_court', { value: row.court_raw });
        else courtId = direct.id;
      } else if (rule.target_field === null) {
        assert.equal(rule.target_value, null, 'discarded court rule has a destination');
      } else if (rule.target_field === 'court' || rule.target_field === 'SPLIT') {
        const court = rule.target_value === null ? undefined : courtsByLabel.get(rule.target_value);
        if (court === undefined) {
          addReason(reasons, 'invalid_court_rule', {
            value: row.court_raw,
            target_field: rule.target_field,
            target_value: rule.target_value,
          });
        } else courtId = court.id;
        if (rule.target_field === 'SPLIT') {
          reviewedCircuit = reviewedPart(rule.reviewer_note, 'circuit');
        }
      } else if (rule.target_field === 'matter_destination') {
        const destination =
          rule.target_value === null ? undefined : destinationsByLabel.get(rule.target_value);
        if (destination === undefined)
          addReason(reasons, 'invalid_court_destination_rule', {
            value: row.court_raw,
            target_value: rule.target_value,
          });
        else courtDestinationId = destination.id;
      } else if (rule.target_field === 'circuit') {
        reviewedCircuit = rule.target_value;
        if (reviewedCircuit === null)
          addReason(reasons, 'invalid_court_circuit_rule', { value: row.court_raw });
      } else {
        addReason(reasons, 'unsupported_court_rule', {
          value: row.court_raw,
          target_field: rule.target_field,
          target_value: rule.target_value,
        });
      }
    }

    if (
      reviewedCircuit !== null &&
      row.circuit_raw !== null &&
      row.circuit_raw !== reviewedCircuit
    ) {
      addReason(reasons, 'court_circuit_conflict', {
        legacy_court_raw: row.court_raw,
        legacy_circuit_raw: row.circuit_raw,
        reviewed_circuit: reviewedCircuit,
      });
    }

    let destinationId: number | null = courtDestinationId;
    if (row.destination_raw !== null) {
      const direct =
        row.destination_key === null ? undefined : destinationsByKey.get(row.destination_key);
      if (direct === undefined) {
        addReason(reasons, 'unmapped_destination', { value: row.destination_raw });
      } else if (courtDestinationId !== null && courtDestinationId !== direct.id) {
        addReason(reasons, 'court_destination_conflict', {
          legacy_court_raw: row.court_raw,
          legacy_destination_raw: row.destination_raw,
          court_destination_id: courtDestinationId,
          source_destination_id: direct.id,
        });
      } else destinationId = direct.id;
    }

    if (reasons.size > 0 || legacyId === null) {
      const ordered = orderedReasons(reasons);
      taskQuarantine.push({
        srcRecordKey: row.src_record_key,
        extractionSha256: row.src_extraction_sha256,
        srcFile: row.src_file,
        srcRowNum: row.src_row_num,
        legacyId: row.legacy_task_id,
        ...ordered,
        sourcePayload: row.source_payload,
      });
      if (row.legacy_task_id !== null) {
        assert.ok(
          !targetTaskByLegacyId.has(row.legacy_task_id) &&
            !quarantinedTaskByLegacyId.has(row.legacy_task_id),
          `duplicate administrative task ID: ${row.legacy_task_id}`,
        );
        quarantinedTaskByLegacyId.set(row.legacy_task_id, ordered.reasonCodes);
      }
      continue;
    }

    tasks.push({
      srcRecordKey: row.src_record_key,
      extractionSha256: row.src_extraction_sha256,
      legacyId,
      matterId,
      requiredWork: row.required_work,
      assignedToPersonId,
      legacyAssigneeRaw: row.assignee_raw,
      taskCreatedDate,
      executionDate,
      result: row.result,
      previousDecision: row.previous_decision,
      lastFollowup: row.last_followup_raw,
      deadline,
      courtId,
      legacyCourtRaw: row.court_raw,
      circuit: row.circuit_raw ?? reviewedCircuit,
      legacyCircuitRaw: row.circuit_raw,
      destinationId,
      legacyDestinationRaw: row.destination_raw,
      status: row.status,
      alert: row.alert,
      sourcePayload: row.source_payload,
    });
    assert.ok(row.legacy_task_id !== null);
    assert.ok(
      !targetTaskByLegacyId.has(row.legacy_task_id) &&
        !quarantinedTaskByLegacyId.has(row.legacy_task_id),
      `duplicate administrative task ID: ${row.legacy_task_id}`,
    );
    targetTaskByLegacyId.set(row.legacy_task_id, row.src_record_key);
  }

  const actions: TaskActionTargetPlan[] = [];
  const actionQuarantine: AdminQuarantinePlan[] = [];
  for (const row of actionSource.rows) {
    const reasons = new Map<string, ReasonDetail>();
    const legacyId = strictPositiveInteger(row.legacy_action_id);
    if (legacyId === null) addReason(reasons, 'invalid_action_id', { value: row.legacy_action_id });

    let parentTaskSourceKey: string | null = null;
    if (row.legacy_task_id_raw === null) {
      addReason(reasons, 'missing_task_link', { ID_Task: null });
    } else if (quarantinedTaskByLegacyId.has(row.legacy_task_id_raw)) {
      addReason(reasons, 'parent_task_quarantined', {
        ID_Task: row.legacy_task_id_raw,
        task_reason_codes: quarantinedTaskByLegacyId.get(row.legacy_task_id_raw),
      });
    } else {
      parentTaskSourceKey = targetTaskByLegacyId.get(row.legacy_task_id_raw) ?? null;
      if (parentTaskSourceKey === null)
        addReason(reasons, 'invalid_task_link', { ID_Task: row.legacy_task_id_raw });
    }

    const actionDate = strictDate(row.action_date_raw);
    if (row.action_date_raw !== null && actionDate === null)
      addReason(reasons, 'invalid_action_date', { value: row.action_date_raw });
    const nextAppointment = strictDate(row.next_appointment_raw);
    if (row.next_appointment_raw !== null && nextAppointment === null)
      addReason(reasons, 'invalid_next_appointment', { value: row.next_appointment_raw });

    const performedByPersonId = resolveReviewedPerson(
      row.performed_by_raw,
      aliases,
      reviews,
      reasons,
      'performed_by',
    );

    if (reasons.size > 0 || legacyId === null || parentTaskSourceKey === null) {
      actionQuarantine.push({
        srcRecordKey: row.src_record_key,
        extractionSha256: row.src_extraction_sha256,
        srcFile: row.src_file,
        srcRowNum: row.src_row_num,
        legacyId: row.legacy_action_id,
        legacyTaskIdRaw: row.legacy_task_id_raw,
        ...orderedReasons(reasons),
        sourcePayload: row.source_payload,
      });
      continue;
    }

    assert.ok(row.legacy_task_id_raw !== null);
    actions.push({
      srcRecordKey: row.src_record_key,
      extractionSha256: row.src_extraction_sha256,
      legacyId,
      parentTaskSourceKey,
      legacyTaskIdRaw: row.legacy_task_id_raw,
      actionDate,
      performedByPersonId,
      legacyPerformedByRaw: row.performed_by_raw,
      result: row.result,
      report: row.report,
      nextAppointment,
      sourceOrdinal: row.source_ordinal,
      sourcePayload: row.source_payload,
    });
  }

  assert.equal(tasks.length + taskQuarantine.length, taskSource.rows.length);
  assert.equal(actions.length + actionQuarantine.length, actionSource.rows.length);
  assert.equal(new Set(tasks.map((row) => row.srcRecordKey)).size, tasks.length);
  assert.equal(new Set(actions.map((row) => row.srcRecordKey)).size, actions.length);
  return {
    taskSourceCount: taskSource.rows.length,
    actionSourceCount: actionSource.rows.length,
    tasks,
    actions,
    taskQuarantine,
    actionQuarantine,
  };
}
