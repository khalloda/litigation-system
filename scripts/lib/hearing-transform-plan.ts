import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';

type SourceRow = {
  src_record_key: string;
  src_extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  legacy_hearing_id: string | null;
  hearing_date_raw: string | null;
  decision: string | null;
  report_raw: string | null;
  previous_decision: string | null;
  outcome: string | null;
  action_raw: string | null;
  action_key: string | null;
  court_raw: string | null;
  court_key: string | null;
  next_attendance_raw: string | null;
  circuit_raw: string | null;
  destination_raw: string | null;
  notes_raw: string | null;
  client_notified_raw: string | null;
  next_hearing_date_raw: string | null;
  legacy_matter_id: string | null;
  short_decision: string | null;
  source_payload: Record<string, unknown>;
};

type ParentMatter = { id: number; legacy_id: number };
type ParentQuarantine = { legacy_matter_id: string | null; reason_codes: string[] };
type LookupRow = { id: number; label_ar: string; reviewed_key: string };
type CrosswalkRow = {
  source_field: string;
  source_value: string;
  source_key: string;
  target_field: string | null;
  target_value: string | null;
  reviewer_note: string | null;
};
type AuditCell = {
  cell_id: string;
  src_record_key: string;
  extraction_sha256: string;
  source_column: string;
  source_column_ordinal: number;
  original_cell: string;
};
type PersonSpan = AuditCell & {
  fragment_id: string;
  sequence: number;
  person_id: number;
};

export type HearingTargetPlan = {
  srcRecordKey: string;
  extractionSha256: string;
  legacyId: number;
  matterId: number | null;
  hearingDate: string | null;
  nextHearingDate: string | null;
  actionId: number | null;
  legacyActionRaw: string | null;
  decision: string | null;
  report: boolean | null;
  previousDecision: string | null;
  outcome: string | null;
  courtId: number | null;
  legacyCourtRaw: string | null;
  destinationId: number | null;
  legacyDestinationRaw: string | null;
  nextAttendanceRaw: string | null;
  circuit: string | null;
  legacyCircuitRaw: string | null;
  notes: string | null;
  legacyNotesRaw: string | null;
  clientNotified: boolean | null;
  shortDecision: string | null;
  sourcePayload: Record<string, unknown>;
};

export type HearingQuarantinePlan = {
  srcRecordKey: string;
  extractionSha256: string;
  srcFile: string;
  srcRowNum: number;
  legacyHearingId: string | null;
  reasonCodes: string[];
  reasonDetails: Array<Record<string, unknown>>;
  sourcePayload: Record<string, unknown>;
};

export type HearingAttendeePlan = {
  hearingSourceRecordKey: string;
  personId: number;
  legacyNameRaw: string;
  ordinal: number;
  legacySourceRecordKey: string;
  legacySourceExtractionSha256: string;
  sourceColumn: string;
  sourceColumnOrdinal: number;
  sourceCellId: string;
  sourceSpanId: string;
  sourceSpanSequence: number;
};

export type HearingTransformPlan = {
  sourceCount: number;
  targets: HearingTargetPlan[];
  quarantine: HearingQuarantinePlan[];
  attendees: HearingAttendeePlan[];
  auditCellCount: number;
  targetAuditCells: number;
  quarantinedAuditCells: number;
  targetPersonSpans: number;
  quarantinedPersonSpans: number;
  distinctAttendeePeople: number;
};

function strictInteger(value: string | null): number | null {
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

function strictBoolean(value: string | null): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function uniqueMap<T>(rows: readonly T[], key: (row: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const itemKey = key(row);
    assert.ok(!result.has(itemKey), `${label} has a duplicate reviewed key: ${itemKey}`);
    result.set(itemKey, row);
  }
  return result;
}

function reviewedPart(note: string | null, field: 'circuit' | 'hearing_note'): string | null {
  if (note === null) return null;
  const match = note.match(new RegExp(`${field}='([^']+)'`));
  return match?.[1] ?? null;
}

function addReason(
  reasons: Map<string, Record<string, unknown>>,
  code: string,
  detail: Record<string, unknown>,
): void {
  assert.ok(!reasons.has(code), `duplicate hearing quarantine reason: ${code}`);
  reasons.set(code, detail);
}

export async function buildHearingTransformPlan(db: ClientBase): Promise<HearingTransformPlan> {
  const source = await db.query<SourceRow>(`
    SELECT h.src_record_key, h.src_extraction_sha256, h.src_file, h.src_row_num,
           h."ID_hearings" legacy_hearing_id,
           h."التاريخ" hearing_date_raw, h."القرار" decision,
           h."تقرير" report_raw, h."lastDecision" previous_decision,
           h."صالح/ضد" outcome, h."الإجراء" action_raw,
           _migration.reviewed_text_key(h."الإجراء") action_key,
           h."المحكمة" court_raw,
           _migration.reviewed_text_key(h."المحكمة") court_key,
           h."حضور الجلسة القادمة" next_attendance_raw,
           h."الدائرة" circuit_raw, h."الجهة" destination_raw,
           h."ملاحظات" notes_raw,
           h."إخطار العميل بالقرار" client_notified_raw,
           h."nextHearing" next_hearing_date_raw,
           h."matterID" legacy_matter_id, h."shortDecision" short_decision,
           to_jsonb(h) - ARRAY[
             'src_file','src_row_num','src_record_key','src_extraction_sha256'
           ] source_payload
      FROM staging."الجلسات" h
     ORDER BY h.src_record_key`);
  const matterRows = await db.query<ParentMatter>(
    'SELECT id, legacy_id FROM matters WHERE legacy_source_record_key IS NOT NULL',
  );
  const parentQuarantineRows = await db.query<ParentQuarantine>(
    'SELECT legacy_matter_id, reason_codes FROM quarantine.matter_transform',
  );
  const actionRows = await db.query<LookupRow>(
    `SELECT id, label_ar, _migration.reviewed_text_key(label_ar) reviewed_key
       FROM lookup_hearing_action`,
  );
  const courtRows = await db.query<LookupRow>(
    `SELECT id, label_ar, _migration.reviewed_text_key(label_ar) reviewed_key
       FROM lookup_court`,
  );
  const destinationRows = await db.query<LookupRow>(
    `SELECT id, label_ar, _migration.reviewed_text_key(label_ar) reviewed_key
       FROM lookup_matter_destination`,
  );
  const crosswalkRows = await db.query<CrosswalkRow>(`
    SELECT source_field, source_value,
           _migration.reviewed_text_key(source_value) source_key,
           target_field, target_value, reviewer_note
      FROM migration_crosswalk
     WHERE source_field IN ('hearing_action','court')`);

  const matters = uniqueMap(matterRows.rows, (row) => String(row.legacy_id), 'matter target');
  const parentQuarantine = uniqueMap(
    parentQuarantineRows.rows.filter(
      (row): row is ParentQuarantine & { legacy_matter_id: string } =>
        row.legacy_matter_id !== null,
    ),
    (row) => row.legacy_matter_id,
    'matter quarantine',
  );
  const actionsByKey = uniqueMap(actionRows.rows, (row) => row.reviewed_key, 'hearing action');
  const actionsByLabel = uniqueMap(actionRows.rows, (row) => row.label_ar, 'hearing action label');
  const courtsByKey = uniqueMap(courtRows.rows, (row) => row.reviewed_key, 'court');
  const courtsByLabel = uniqueMap(courtRows.rows, (row) => row.label_ar, 'court label');
  const destinationsByLabel = uniqueMap(
    destinationRows.rows,
    (row) => row.label_ar,
    'matter destination label',
  );
  const actionRules = uniqueMap(
    crosswalkRows.rows.filter((row) => row.source_field === 'hearing_action'),
    (row) => row.source_key,
    'hearing action crosswalk',
  );
  const courtRules = uniqueMap(
    crosswalkRows.rows.filter((row) => row.source_field === 'court'),
    (row) => row.source_key,
    'court crosswalk',
  );

  const targets: HearingTargetPlan[] = [];
  const quarantine: HearingQuarantinePlan[] = [];
  const targetKeys = new Set<string>();
  const quarantineKeys = new Set<string>();

  for (const row of source.rows) {
    const reasons = new Map<string, Record<string, unknown>>();
    const legacyId = strictInteger(row.legacy_hearing_id);
    if (legacyId === null) {
      addReason(reasons, 'invalid_hearing_id', { ID_hearings: row.legacy_hearing_id });
    }

    let matterId: number | null = null;
    if (row.legacy_matter_id !== null) {
      const parsedMatterId = strictInteger(row.legacy_matter_id);
      const matter = matters.get(row.legacy_matter_id);
      const parentQ = parentQuarantine.get(row.legacy_matter_id);
      if (parentQ !== undefined) {
        addReason(reasons, 'parent_matter_quarantined', {
          matterID: row.legacy_matter_id,
          matter_reason_codes: parentQ.reason_codes,
        });
      } else if (parsedMatterId === null || matter === undefined) {
        addReason(reasons, 'invalid_matter_link', { matterID: row.legacy_matter_id });
      } else {
        matterId = matter.id;
      }
    }

    const hearingDate = strictDate(row.hearing_date_raw);
    if (row.hearing_date_raw !== null && hearingDate === null) {
      addReason(reasons, 'invalid_hearing_date', { value: row.hearing_date_raw });
    }
    const nextHearingDate = strictDate(row.next_hearing_date_raw);
    if (row.next_hearing_date_raw !== null && nextHearingDate === null) {
      addReason(reasons, 'invalid_next_hearing_date', { value: row.next_hearing_date_raw });
    }
    const report = strictBoolean(row.report_raw);
    if (row.report_raw !== null && report === null) {
      addReason(reasons, 'invalid_report_flag', { value: row.report_raw });
    }
    const clientNotified = strictBoolean(row.client_notified_raw);
    if (row.client_notified_raw !== null && clientNotified === null) {
      addReason(reasons, 'invalid_client_notified_flag', { value: row.client_notified_raw });
    }

    let actionId: number | null = null;
    if (row.action_raw !== null) {
      const rule = row.action_key === null ? undefined : actionRules.get(row.action_key);
      const direct = row.action_key === null ? undefined : actionsByKey.get(row.action_key);
      if (rule !== undefined) {
        const target =
          rule.target_value === null ? undefined : actionsByLabel.get(rule.target_value);
        if (rule.target_field !== 'hearing_action' || target === undefined) {
          addReason(reasons, 'invalid_hearing_action_rule', {
            value: row.action_raw,
            target_field: rule.target_field,
            target_value: rule.target_value,
          });
        } else {
          actionId = target.id;
        }
      } else if (direct !== undefined) {
        actionId = direct.id;
      } else {
        addReason(reasons, 'unmapped_hearing_action', { value: row.action_raw });
      }
    }

    let courtId: number | null = null;
    let destinationId: number | null = null;
    let reviewedCircuit: string | null = null;
    let reviewedNote: string | null = null;
    if (row.court_raw !== null) {
      const rule = row.court_key === null ? undefined : courtRules.get(row.court_key);
      const direct = row.court_key === null ? undefined : courtsByKey.get(row.court_key);
      if (rule === undefined) {
        if (direct === undefined) {
          addReason(reasons, 'unmapped_court', { value: row.court_raw });
        } else {
          courtId = direct.id;
        }
      } else if (rule.target_field === null) {
        assert.equal(rule.target_value, null, 'discarded court rule unexpectedly has a target');
      } else if (rule.target_field === 'court' || rule.target_field === 'SPLIT') {
        const court = rule.target_value === null ? undefined : courtsByLabel.get(rule.target_value);
        if (court === undefined) {
          addReason(reasons, 'invalid_court_rule', {
            value: row.court_raw,
            target_field: rule.target_field,
            target_value: rule.target_value,
          });
        } else {
          courtId = court.id;
        }
        if (rule.target_field === 'SPLIT') {
          reviewedCircuit = reviewedPart(rule.reviewer_note, 'circuit');
          reviewedNote = reviewedPart(rule.reviewer_note, 'hearing_note');
          if ((reviewedCircuit === null) === (reviewedNote === null)) {
            addReason(reasons, 'invalid_court_split_rule', {
              value: row.court_raw,
              reviewer_note: rule.reviewer_note,
            });
          }
        }
      } else if (rule.target_field === 'matter_destination') {
        const destination =
          rule.target_value === null ? undefined : destinationsByLabel.get(rule.target_value);
        if (destination === undefined) {
          addReason(reasons, 'invalid_court_destination_rule', {
            value: row.court_raw,
            target_value: rule.target_value,
          });
        } else {
          destinationId = destination.id;
        }
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
    if (reviewedNote !== null && row.notes_raw !== null && row.notes_raw !== reviewedNote) {
      addReason(reasons, 'court_note_conflict', {
        legacy_court_raw: row.court_raw,
        legacy_notes_raw: row.notes_raw,
        reviewed_note: reviewedNote,
      });
    }

    if (reasons.size > 0 || legacyId === null) {
      const ordered = [...reasons.entries()].sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      );
      quarantine.push({
        srcRecordKey: row.src_record_key,
        extractionSha256: row.src_extraction_sha256,
        srcFile: row.src_file,
        srcRowNum: row.src_row_num,
        legacyHearingId: row.legacy_hearing_id,
        reasonCodes: ordered.map(([code]) => code),
        reasonDetails: ordered.map(([, detail]) => detail),
        sourcePayload: row.source_payload,
      });
      quarantineKeys.add(row.src_record_key);
      continue;
    }

    targets.push({
      srcRecordKey: row.src_record_key,
      extractionSha256: row.src_extraction_sha256,
      legacyId,
      matterId,
      hearingDate,
      nextHearingDate,
      actionId,
      legacyActionRaw: row.action_raw,
      decision: row.decision,
      report,
      previousDecision: row.previous_decision,
      outcome: row.outcome,
      courtId,
      legacyCourtRaw: row.court_raw,
      destinationId,
      legacyDestinationRaw: row.destination_raw,
      nextAttendanceRaw: row.next_attendance_raw,
      circuit: row.circuit_raw ?? reviewedCircuit,
      legacyCircuitRaw: row.circuit_raw,
      notes: row.notes_raw ?? reviewedNote,
      legacyNotesRaw: row.notes_raw,
      clientNotified,
      shortDecision: row.short_decision,
      sourcePayload: row.source_payload,
    });
    targetKeys.add(row.src_record_key);
  }

  assert.equal(targets.length + quarantine.length, source.rows.length);
  assert.equal(targetKeys.size, targets.length);
  assert.equal(quarantineKeys.size, quarantine.length);
  assert.ok([...targetKeys].every((key) => !quarantineKeys.has(key)));

  const cellRows = await db.query<AuditCell>(`
    SELECT cell_id, src_record_key, extraction_sha256, source_column,
           source_column_ordinal, original_cell
      FROM _migration.attendee_source_cell ORDER BY cell_id`);
  const spanRows = await db.query<PersonSpan>(`
    SELECT c.cell_id, c.src_record_key, c.extraction_sha256,
           c.source_column, c.source_column_ordinal, c.original_cell,
           s.fragment_id, s.sequence, s.person_id
      FROM _migration.attendee_source_cell c
      JOIN _migration.attendee_source_span s ON s.cell_id=c.cell_id
     WHERE s.kind='person'
     ORDER BY c.src_record_key, c.source_column_ordinal, s.sequence`);
  const sourceByKey = new Map(source.rows.map((row) => [row.src_record_key, row]));
  let targetAuditCells = 0;
  let quarantinedAuditCells = 0;
  for (const cell of cellRows.rows) {
    const sourceRow = sourceByKey.get(cell.src_record_key);
    assert.ok(sourceRow, `attendee audit cell has no source hearing: ${cell.cell_id}`);
    assert.equal(cell.extraction_sha256, sourceRow.src_extraction_sha256);
    if (targetKeys.has(cell.src_record_key)) targetAuditCells += 1;
    else if (quarantineKeys.has(cell.src_record_key)) quarantinedAuditCells += 1;
    else assert.fail(`attendee cell parent has no hearing outcome: ${cell.cell_id}`);
  }

  const attendeeGroups = new Map<string, PersonSpan[]>();
  let quarantinedPersonSpans = 0;
  for (const span of spanRows.rows) {
    if (quarantineKeys.has(span.src_record_key)) {
      quarantinedPersonSpans += 1;
      continue;
    }
    assert.ok(targetKeys.has(span.src_record_key));
    const group = attendeeGroups.get(span.src_record_key) ?? [];
    group.push(span);
    attendeeGroups.set(span.src_record_key, group);
  }
  const attendees: HearingAttendeePlan[] = [];
  for (const [hearingSourceRecordKey, spans] of attendeeGroups) {
    spans.sort(
      (left, right) =>
        left.source_column_ordinal - right.source_column_ordinal || left.sequence - right.sequence,
    );
    spans.forEach((span, index) => {
      attendees.push({
        hearingSourceRecordKey,
        personId: span.person_id,
        legacyNameRaw: span.original_cell,
        ordinal: index + 1,
        legacySourceRecordKey: span.src_record_key,
        legacySourceExtractionSha256: span.extraction_sha256,
        sourceColumn: span.source_column,
        sourceColumnOrdinal: span.source_column_ordinal,
        sourceCellId: span.cell_id,
        sourceSpanId: span.fragment_id,
        sourceSpanSequence: span.sequence,
      });
    });
  }

  return {
    sourceCount: source.rows.length,
    targets,
    quarantine,
    attendees,
    auditCellCount: cellRows.rows.length,
    targetAuditCells,
    quarantinedAuditCells,
    targetPersonSpans: attendees.length,
    quarantinedPersonSpans,
    distinctAttendeePeople: new Set(attendees.map((row) => row.personId)).size,
  };
}
