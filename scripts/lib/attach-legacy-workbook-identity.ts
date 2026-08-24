import {
  LEGACY_EXTRACTION_SHA256,
  NULL_DISPLAY,
  type ParsedReviewWorkbook,
  WorkbookContractError,
} from './review-workbook-contract';

export type LegacyReviewValueRow = {
  id: bigint;
  topic: string;
  value: string;
  extraction_sha256: string;
  legacy_workbook_id: bigint | null;
  firm_answer: string | null;
  firm_person: string | null;
  firm_note: string | null;
};

export type LegacyFindingRow = {
  id: bigint;
  topic: string;
  src_table: string;
  src_file: string;
  src_row_num: number;
  src_record_key: string;
  column_name: string | null;
  original_value: string | null;
  extraction_sha256: string;
  legacy_workbook_id: bigint | null;
  firm_answer: string | null;
  firm_note: string | null;
};

export type LegacyIdentityAttachment = {
  kind: 'review_value' | 'finding';
  targetId: bigint;
  workbookId: bigint;
};

function fail(message: string): never {
  throw new WorkbookContractError(message);
}

function storedAnswer(value: string): string | null {
  return value === '' ? null : value;
}

function findingTrace(row: {
  src_table: string;
  src_row_num: number;
  column_name: string | null;
}): string {
  return `${row.src_table}\u0000${row.src_row_num}\u0000${row.column_name ?? '<NULL>'}`;
}

function normalizedWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Capture the bridge used by the historic importer only after proving that
 * the answer already stored on that database id is byte-for-byte the answer
 * in the exact authoritative workbook. This is deliberately separate from
 * normal import matching: it is a one-time conversion of an old identity.
 */
export function buildLegacyIdentityAttachmentPlan(
  workbook: ParsedReviewWorkbook,
  reviewValues: readonly LegacyReviewValueRow[],
  findings: readonly LegacyFindingRow[],
): LegacyIdentityAttachment[] {
  if (workbook.format !== 'legacy-authoritative') {
    fail('legacy identity can only be attached from the exact authoritative workbook');
  }
  if (workbook.extractionSha256 !== LEGACY_EXTRACTION_SHA256) {
    fail('legacy workbook extraction fingerprint is not authoritative');
  }

  const valuesById = new Map(reviewValues.map((row) => [row.id.toString(), row]));
  const valuesByLegacyId = new Map(
    reviewValues
      .filter((row) => row.legacy_workbook_id !== null)
      .map((row) => [row.legacy_workbook_id!.toString(), row]),
  );
  const findingIds = new Set(findings.map((row) => row.id.toString()));
  const findingsByTrace = new Map(findings.map((row) => [findingTrace(row), row]));
  const findingsByLegacyId = new Map(
    findings
      .filter((row) => row.legacy_workbook_id !== null)
      .map((row) => [row.legacy_workbook_id!.toString(), row]),
  );
  const mappedValues = reviewValues.filter((row) => row.legacy_workbook_id !== null).length;
  const mappedFindings = findings.filter((row) => row.legacy_workbook_id !== null).length;
  if (
    valuesById.size !== reviewValues.length ||
    findingIds.size !== findings.length ||
    findingsByTrace.size !== findings.length ||
    valuesByLegacyId.size !== mappedValues ||
    findingsByLegacyId.size !== mappedFindings
  ) {
    fail('database answer or legacy identities are not unique');
  }

  const valueAnswers = workbook.rows.filter((row) => row.kind === 'review_value');
  const findingAnswers = workbook.rows.filter((row) => row.kind === 'finding');
  if (
    valueAnswers.length !== 668 ||
    reviewValues.length !== 668 ||
    findingAnswers.length !== 76 ||
    findings.length !== 76
  ) {
    fail(
      `legacy identity requires exactly 668 review values and 76 findings; ` +
        `workbook/database contain ${valueAnswers.length}/${reviewValues.length} and ` +
        `${findingAnswers.length}/${findings.length}`,
    );
  }

  const attachments: LegacyIdentityAttachment[] = [];
  const valueWorkbookIds = new Set<number>();
  const findingWorkbookIds = new Set<number>();

  for (const row of valueAnswers) {
    if (valueWorkbookIds.has(row.workbookId)) {
      fail(`legacy review workbook id ${row.workbookId} appears more than once`);
    }
    valueWorkbookIds.add(row.workbookId);
    const found =
      valuesByLegacyId.get(String(row.workbookId)) ?? valuesById.get(String(row.workbookId));
    if (found === undefined)
      fail(`${row.sheet} #${row.workbookId}: original database row is missing`);
    if (!row.topics.includes(found.topic)) fail(`${row.sheet} #${row.workbookId}: topic mismatch`);
    if (found.extraction_sha256 !== workbook.extractionSha256) {
      fail(`${row.sheet} #${row.workbookId}: extraction fingerprint mismatch`);
    }
    if (
      found.firm_answer !== storedAnswer(row.answer) ||
      found.firm_person !== storedAnswer(row.person) ||
      found.firm_note !== storedAnswer(row.note)
    ) {
      fail(`${row.sheet} #${row.workbookId}: stored answer does not match the workbook`);
    }
    if (found.legacy_workbook_id !== null && found.legacy_workbook_id !== BigInt(row.workbookId)) {
      fail(`${row.sheet} #${row.workbookId}: a different legacy identity is already recorded`);
    }
    attachments.push({
      kind: 'review_value',
      targetId: found.id,
      workbookId: BigInt(row.workbookId),
    });
  }

  for (const row of findingAnswers) {
    if (findingWorkbookIds.has(row.workbookId)) {
      fail(`legacy finding workbook id ${row.workbookId} appears more than once`);
    }
    findingWorkbookIds.add(row.workbookId);
    const shownTable = row.visible[2] ?? '';
    const shownRow = Number(row.visible[3] ?? '');
    const shownColumn = (row.visible[4] ?? '') || null;
    const shownValue = row.visible[5] ?? '';
    const found =
      findingsByLegacyId.get(String(row.workbookId)) ??
      findingsByTrace.get(
        findingTrace({
          src_table: shownTable,
          src_row_num: shownRow,
          column_name: shownColumn,
        }),
      );
    if (found === undefined)
      fail(`${row.sheet} #${row.workbookId}: original database row is missing`);
    if (!row.topics.includes(found.topic)) fail(`${row.sheet} #${row.workbookId}: topic mismatch`);
    if (found.extraction_sha256 !== workbook.extractionSha256) {
      fail(`${row.sheet} #${row.workbookId}: extraction fingerprint mismatch`);
    }
    const expectedValue = found.original_value === null ? NULL_DISPLAY : found.original_value;
    if (
      (found.legacy_workbook_id === null &&
        (shownTable !== found.src_table ||
          shownRow !== found.src_row_num ||
          shownColumn !== found.column_name)) ||
      normalizedWhitespace(shownValue) !== normalizedWhitespace(expectedValue)
    ) {
      fail(
        `${row.sheet} #${row.workbookId}: stored source description does not match the workbook`,
      );
    }
    if (
      found.firm_answer !== storedAnswer(row.answer) ||
      found.firm_note !== storedAnswer(row.note)
    ) {
      fail(`${row.sheet} #${row.workbookId}: stored answer does not match the workbook`);
    }
    if (found.legacy_workbook_id !== null && found.legacy_workbook_id !== BigInt(row.workbookId)) {
      fail(`${row.sheet} #${row.workbookId}: a different legacy identity is already recorded`);
    }
    attachments.push({
      kind: 'finding',
      targetId: found.id,
      workbookId: BigInt(row.workbookId),
    });
  }

  if (attachments.length !== 744)
    fail(`legacy identity plan has ${attachments.length} of 744 rows`);
  return attachments;
}
