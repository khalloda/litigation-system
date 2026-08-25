import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Client } from 'pg';
import {
  decomposeAttendeeCell,
  decomposeReviewedAttendeeCell,
  type AttendeeCellDecomposition,
  type AttendeeDecompositionRules,
  type ExactPersonMatch,
  type ReviewedAttendeeAnswer,
} from './attendee-decomposition';
import {
  ATTENDEE_SOURCE_BASELINE,
  REVIEW_ANSWER_BASELINE,
  type AttendeeSourceBaseline,
  type ReviewAnswerBaseline,
} from './migration-baselines';

export const ATTENDEE_SOURCE_TABLE = 'الجلسات';

type SourceCellRow = {
  src_record_key: string;
  extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  source_column: string;
  source_column_ordinal: number;
  original_cell: string;
  review_id: string | null;
  firm_answer: ReviewedAttendeeAnswer['answer'] | null;
  firm_person: string | null;
};

type AliasRow = {
  alias_ar: string;
  person_id: number;
  name_ar: string;
};

type ReviewRow = {
  id: string;
  value: string;
  occurrences: number;
  firm_answer: ReviewedAttendeeAnswer['answer'];
  firm_person: string | null;
};

export type ReviewSnapshot = Readonly<{
  valueAnswers: number;
  findingAnswers: number;
  mappingDigest: string;
  answerDigest: string;
}>;

export type AttendeeSourceSnapshot = Readonly<{
  cells: number;
  digest: string;
}>;

export type PlannedAttendeeCell = Readonly<{
  decomposition: AttendeeCellDecomposition;
  sourceColumnOrdinal: number;
  reviewId: string | null;
}>;

export type AttendeeAuditPlan = Readonly<{
  cells: readonly PlannedAttendeeCell[];
  sourceCellCount: number;
  spanCount: number;
  personSpanCount: number;
  ambiguousSpanCount: number;
  reviewedCellCount: number;
  unreviewedExactAliasCellCount: number;
  distinctPeople: number;
  attendeeReviewValues: number;
  reviewSnapshot: ReviewSnapshot;
  sourceSnapshot: AttendeeSourceSnapshot;
}>;

export type AttendeeAuditPlanExpectations = Readonly<{
  attendeeAnswers: number;
  review: ReviewAnswerBaseline;
  source: AttendeeSourceBaseline;
}>;

export const APPROVED_ATTENDEE_AUDIT_PLAN_EXPECTATIONS: AttendeeAuditPlanExpectations =
  Object.freeze({
    attendeeAnswers: 663,
    review: REVIEW_ANSWER_BASELINE,
    source: ATTENDEE_SOURCE_BASELINE,
  });

export function attendeeSourceDigest(
  rows: readonly Pick<
    SourceCellRow,
    'src_row_num' | 'source_column' | 'source_column_ordinal' | 'original_cell'
  >[],
): string {
  const hash = createHash('sha256');
  const ordered = [...rows].sort(
    (left, right) =>
      left.src_row_num - right.src_row_num ||
      left.source_column_ordinal - right.source_column_ordinal,
  );
  for (const row of ordered) {
    hash.update(
      `${String(row.src_row_num)}:${String(row.source_column_ordinal)}:` +
        `${String(Buffer.byteLength(row.original_cell, 'utf8'))}:${row.original_cell};`,
      'utf8',
    );
  }
  return hash.digest('hex');
}

export function attendeeSourceSnapshot(rows: readonly SourceCellRow[]): AttendeeSourceSnapshot {
  return Object.freeze({ cells: rows.length, digest: attendeeSourceDigest(rows) });
}

export async function readAttendeeSourceSnapshot(db: Client): Promise<AttendeeSourceSnapshot> {
  const result = await db.query<SourceCellRow>(`
    SELECT h.src_row_num, v.source_column, v.source_column_ordinal, v.original_cell
      FROM staging."الجلسات" h
      CROSS JOIN LATERAL (VALUES
        ('الحاضر', 1, h."الحاضر"), ('حاضر 1', 2, h."حاضر 1"),
        ('حاضر 2', 3, h."حاضر 2"), ('حاضر 3', 4, h."حاضر 3"),
        ('حاضر 4', 5, h."حاضر 4")
      ) v(source_column, source_column_ordinal, original_cell)
     WHERE v.original_cell IS NOT NULL AND v.original_cell <> ''
     ORDER BY h.src_row_num, v.source_column_ordinal`);
  return attendeeSourceSnapshot(result.rows);
}

export function assertReviewSnapshot(actual: ReviewSnapshot, expected: ReviewAnswerBaseline): void {
  assert.equal(actual.valueAnswers, expected.valueAnswers, 'Reviewed value-answer count drifted.');
  assert.equal(
    actual.findingAnswers,
    expected.findingAnswers,
    'Reviewed finding-answer count drifted.',
  );
  assert.equal(
    actual.valueAnswers + actual.findingAnswers,
    expected.totalAnswers,
    'The complete review-answer count drifted.',
  );
  assert.equal(actual.mappingDigest, expected.mappingDigest, 'Review mapping digest drifted.');
  assert.equal(actual.answerDigest, expected.answerDigest, 'Review answer digest drifted.');
}

export function assertAttendeeSourceSnapshot(
  actual: AttendeeSourceSnapshot,
  expected: AttendeeSourceBaseline,
): void {
  assert.equal(actual.cells, expected.cells, 'Attendee source-cell count drifted.');
  assert.equal(actual.digest, expected.digest, 'Attendee source-cell digest drifted.');
}

function exactPeople(aliases: readonly AliasRow[]) {
  const byAlias = new Map<string, ExactPersonMatch>();
  const byPerson = new Map<string, ExactPersonMatch>();
  for (const row of aliases) {
    const person: ExactPersonMatch = Object.freeze({
      personKey: String(row.person_id),
      canonicalName: row.name_ar,
    });
    const prior = byAlias.get(row.alias_ar);
    assert.ok(
      prior === undefined || prior.personKey === person.personKey,
      `Exact alias ${JSON.stringify(row.alias_ar)} resolves to more than one person.`,
    );
    byAlias.set(row.alias_ar, person);
    byPerson.set(person.personKey, person);
  }
  return { byAlias, byPerson };
}

function reviewedPeople(
  answer: SourceCellRow,
  knownPeople: ReadonlyMap<string, ExactPersonMatch>,
): readonly ExactPersonMatch[] {
  if (answer.firm_answer === 'not a name') {
    assert.equal(answer.firm_person, null, 'A not-a-name answer unexpectedly names a person.');
    return [];
  }
  assert.ok(answer.firm_answer === 'person' || answer.firm_answer === 'split');
  assert.ok(answer.firm_person, 'A person/split answer is missing its reviewed people.');
  return answer.firm_person.split(' + ').map((name) => {
    const person = knownPeople.get(name);
    assert.ok(person, `Reviewed person ${JSON.stringify(name)} is not one exact alias.`);
    return person;
  });
}

export async function readReviewSnapshot(db: Client): Promise<ReviewSnapshot> {
  const result = await db.query<{
    value_answers: string;
    finding_answers: string;
    mapping_digest: string;
    answer_digest: string;
  }>(`
    SELECT
      (SELECT count(*)::text FROM quarantine.review_value
        WHERE answered_at IS NOT NULL) value_answers,
      (SELECT count(*)::text FROM quarantine.finding
        WHERE answered_at IS NOT NULL) finding_answers,
      (SELECT encode(sha256(convert_to(
         string_agg(payload, E'\\n' ORDER BY kind, target_id), 'UTF8'
       )), 'hex')
         FROM (
           SELECT 'V' kind, id target_id,
                  jsonb_build_array(id, legacy_workbook_id)::text payload
             FROM quarantine.review_value WHERE legacy_workbook_id IS NOT NULL
           UNION ALL
           SELECT 'F', id, jsonb_build_array(id, legacy_workbook_id)::text
             FROM quarantine.finding WHERE legacy_workbook_id IS NOT NULL
         ) mapped) mapping_digest,
      (SELECT encode(sha256(convert_to(
         coalesce(string_agg(payload, E'\\n' ORDER BY kind, id), ''), 'UTF8'
       )), 'hex')
         FROM (
           SELECT 'V' kind, id,
                  jsonb_build_array(
                    id, topic, value, firm_answer, firm_person, firm_note
                  )::text payload
             FROM quarantine.review_value WHERE answered_at IS NOT NULL
           UNION ALL
           SELECT 'F', id,
                  jsonb_build_array(
                    id, topic, src_table, src_file, src_row_num, column_name,
                    original_value, firm_answer, firm_note
                  )::text payload
             FROM quarantine.finding WHERE answered_at IS NOT NULL
         ) answered) answer_digest`);
  const row = result.rows[0];
  assert.ok(row, 'The review-answer snapshot query returned no row.');
  return Object.freeze({
    valueAnswers: Number(row.value_answers),
    findingAnswers: Number(row.finding_answers),
    mappingDigest: row.mapping_digest,
    answerDigest: row.answer_digest,
  });
}

export async function buildAttendeeAuditPlan(
  db: Client,
  expected: AttendeeAuditPlanExpectations = APPROVED_ATTENDEE_AUDIT_PLAN_EXPECTATIONS,
): Promise<AttendeeAuditPlan> {
  const sourceResult = await db.query<SourceCellRow>(`
      SELECT h.src_record_key,
             h.src_extraction_sha256 extraction_sha256,
             h.src_file,
             h.src_row_num,
             v.source_column,
             v.source_column_ordinal,
             v.original_cell,
             r.id::text review_id,
             r.firm_answer,
             r.firm_person
        FROM staging."الجلسات" h
        CROSS JOIN LATERAL (VALUES
          ('الحاضر', 1, h."الحاضر"),
          ('حاضر 1', 2, h."حاضر 1"),
          ('حاضر 2', 3, h."حاضر 2"),
          ('حاضر 3', 4, h."حاضر 3"),
          ('حاضر 4', 5, h."حاضر 4")
        ) v(source_column, source_column_ordinal, original_cell)
        LEFT JOIN quarantine.review_value r
          ON r.topic = 'attendee_name' AND r.value = btrim(v.original_cell)
       WHERE v.original_cell IS NOT NULL AND v.original_cell <> ''
       ORDER BY h.src_record_key, v.source_column_ordinal`);
  const aliasResult = await db.query<AliasRow>(`
      SELECT a.alias_ar, a.person_id, p.name_ar
        FROM person_name_alias a
        JOIN people p ON p.id = a.person_id
       ORDER BY a.alias_ar, a.person_id`);
  const reviewResult = await db.query<ReviewRow>(`
      SELECT id::text, value, occurrences, firm_answer, firm_person
        FROM quarantine.review_value
       WHERE topic = 'attendee_name'
       ORDER BY id`);
  const reviewSnapshot = await readReviewSnapshot(db);
  const sourceSnapshot = attendeeSourceSnapshot(sourceResult.rows);

  assert.equal(
    reviewResult.rows.length,
    expected.attendeeAnswers,
    'Attendee review-answer count drifted.',
  );
  assertReviewSnapshot(reviewSnapshot, expected.review);
  assertAttendeeSourceSnapshot(sourceSnapshot, expected.source);
  for (const row of reviewResult.rows) {
    assert.ok(row.firm_answer, `Attendee review value #${row.id} is unanswered.`);
  }

  const { byAlias: knownPeople } = exactPeople(aliasResult.rows);
  const reviewedNoteLines = new Set<string>();
  for (const review of reviewResult.rows) {
    if (review.firm_answer !== 'not a name') continue;
    for (const line of review.value.split(/\r\n|\r|\n/gu)) {
      const core = line.replace(/^[ \t\f\v\u00a0]+|[ \t\f\v\u00a0]+$/gu, '');
      if (core !== '' && !/[0-9٠-٩]/u.test(core) && !core.includes('**')) {
        reviewedNoteLines.add(core);
      }
    }
  }
  const rules: AttendeeDecompositionRules = Object.freeze({
    knownPeople,
    knownPlaceholders: new Set(['**']),
    knownNotes: reviewedNoteLines,
    knownRoles: new Set<string>(),
    // These exact title tokens are the fixture-proven prefixes from
    // Correction B. No surrounding word is inferred to be a title.
    knownTitles: ['د.', 'أ.', 'أ.د.', 'المستشار', 'الأستاذ'],
  });
  const reviewOccurrences = new Map<string, number>();
  let reviewedCellCount = 0;
  let unreviewedExactAliasCellCount = 0;

  const cells = sourceResult.rows.map((row): PlannedAttendeeCell => {
    const source = Object.freeze({
      sourceTable: ATTENDEE_SOURCE_TABLE,
      sourceRecordKey: row.src_record_key,
      sourceExtractionSha256: row.extraction_sha256,
      sourceColumn: row.source_column,
      originalCell: row.original_cell,
      sourceFile: row.src_file,
      sourceRowNumber: row.src_row_num,
    });
    let decomposition: AttendeeCellDecomposition;
    if (row.review_id === null) {
      const exact = knownPeople.get(row.original_cell);
      assert.ok(
        exact,
        `Unreviewed attendee value ${JSON.stringify(row.original_cell)} is not one exact alias.`,
      );
      decomposition = decomposeAttendeeCell(source, rules);
      const people = decomposition.fragments.filter((fragment) => fragment.kind === 'person');
      assert.equal(people.length, 1, 'An unreviewed exact alias did not produce one person span.');
      unreviewedExactAliasCellCount += 1;
    } else {
      assert.ok(row.firm_answer, `Attendee review #${row.review_id} is blank.`);
      const people = reviewedPeople(row, knownPeople);
      decomposition = decomposeReviewedAttendeeCell(source, rules, {
        answer: row.firm_answer,
        people,
      });
      reviewOccurrences.set(row.review_id, (reviewOccurrences.get(row.review_id) ?? 0) + 1);
      reviewedCellCount += 1;
    }
    return Object.freeze({
      decomposition,
      sourceColumnOrdinal: row.source_column_ordinal,
      reviewId: row.review_id,
    });
  });

  for (const review of reviewResult.rows) {
    assert.equal(
      reviewOccurrences.get(review.id) ?? 0,
      review.occurrences,
      `Attendee review #${review.id} no longer covers the same source cells.`,
    );
  }
  assert.equal(reviewOccurrences.size, reviewResult.rows.length, 'An attendee answer is unused.');

  const fragments = cells.flatMap((cell) => cell.decomposition.fragments);
  const people = fragments.filter((fragment) => fragment.kind === 'person');
  return Object.freeze({
    cells: Object.freeze(cells),
    sourceCellCount: cells.length,
    spanCount: fragments.length,
    personSpanCount: people.length,
    ambiguousSpanCount: fragments.filter((fragment) => fragment.kind === 'ambiguous').length,
    reviewedCellCount,
    unreviewedExactAliasCellCount,
    distinctPeople: new Set(people.map((fragment) => fragment.personKey)).size,
    attendeeReviewValues: reviewResult.rows.length,
    reviewSnapshot,
    sourceSnapshot,
  });
}
