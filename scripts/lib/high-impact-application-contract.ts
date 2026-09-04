import assert from 'node:assert/strict';
import { basename } from 'node:path';
import ExcelJS from 'exceljs';
import {
  fileSha256,
  prepareReviewRows,
  validateHighImpactWorkbook,
  type HighImpactReviewSnapshot,
  type PreparedReviewRow,
} from './high-impact-review-workbook';

export const APPROVED_APPLICATION_FILE =
  'task-3-5-high-impact-quarantine-review-2026-09-04-d40.xlsx';
export const APPROVED_APPLICATION_BYTES = 172_273;
export const APPROVED_APPLICATION_SHA256 =
  '0dc23134639e0bc6477fe1f39613bd7575b56cdcd0085d2f2831a96693f2376b';
export const D41_NOTE = 'وكيل نيابة/ أسامة الطنطاوي';
export const D41_COURT = 'نيابة الشئون المالية والتجارية';
export const D41_DESTINATIONS = [
  [7072, 467],
  [7071, 467],
  [7237, 467],
  [7383, 467],
  [7451, 467],
  [7073, 468],
  [7070, 468],
  [7219, 468],
  [7351, 468],
  [7129, 515],
  [7159, 515],
  [7382, 515],
] as const;
export const D39_BRANCHES = [
  { label: 'سيجما للصناعات الدوائية', clientId: 197, legacyClientId: 188 },
  { label: 'سيجما للإعلام (تليفزيون الحياة)', clientId: 197, legacyClientId: 188 },
  { label: 'ألفا مصر للتجارة', clientId: 11, legacyClientId: 2 },
] as const;

export type ApprovedDisposition = PreparedReviewRow & { status: string; target: string };

export function assertApprovedApplicationBytes(path: string, bytes: Buffer): void {
  assert.equal(basename(path), APPROVED_APPLICATION_FILE, 'unapproved workbook filename');
  assert.equal(bytes.length, APPROVED_APPLICATION_BYTES, 'unapproved workbook size');
  assert.equal(fileSha256(bytes), APPROVED_APPLICATION_SHA256, 'unapproved workbook SHA-256');
}

/** Read the immutable artifact; never serialize or save either owner workbook. */
export async function readApprovedDispositions(
  path: string,
  bytes: Buffer,
  snapshot: HighImpactReviewSnapshot,
): Promise<ApprovedDisposition[]> {
  assertApprovedApplicationBytes(path, bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const validation = validateHighImpactWorkbook(workbook, snapshot);
  assert.equal(validation.completed, 382, 'all 382 approved decisions are required');
  assert.equal(validation.incomplete, 0, 'partial decision set');
  assert.equal(validation.invalid, 0, validation.issues.join('; '));
  return prepareReviewRows(snapshot).map((identity) => {
    const sheet = workbook.getWorksheet(identity.sheet)!;
    const matches: ExcelJS.Row[] = [];
    sheet.eachRow((row, index) => {
      if (index > 1 && row.getCell(1).text === identity.reviewId) matches.push(row);
    });
    assert.equal(matches.length, 1, 'missing or duplicate durable review identity');
    const column = identity.kind === 'matter' ? 24 : 23;
    return {
      ...identity,
      status: matches[0]!.getCell(column).text,
      target: matches[0]!.getCell(column + 1).text,
    };
  });
}

export type D41Hearing = {
  legacyId: number;
  legacyMatterId: number;
  court: string | null;
  note: string | null;
};

/** Check the complete proposed note destination population, not one match per matter. */
export function assertD41Destinations(rows: readonly D41Hearing[]): void {
  const expected = new Map<number, number>(D41_DESTINATIONS);
  const seen = new Set<number>();
  for (const row of rows) {
    if (!expected.has(row.legacyId)) {
      assert.notEqual(row.note, D41_NOTE, 'additional hearing would receive D41 note');
      continue;
    }
    assert.ok(!seen.has(row.legacyId), 'duplicate D41 hearing');
    seen.add(row.legacyId);
    assert.equal(
      row.legacyMatterId,
      expected.get(row.legacyId),
      'D41 hearing belongs to wrong matter',
    );
    assert.equal(row.note, D41_NOTE, 'D41 note text changed');
    assert.equal(row.court, D41_COURT, 'D41 court changed');
  }
  assert.equal(seen.size, 12, 'missing D41 hearing');
}

export function parseHighImpactApplicationArgs(args: readonly string[]): {
  apply: boolean;
  real?: { expectedRevision: string; confirmation: string };
} {
  if (args.includes('--apply-real')) {
    assert.equal(args.length, 3, 'real application requires exactly three explicit arguments');
    const revision = args.filter((a) => a.startsWith('--expected-revision='));
    const confirmation = args.filter((a) => a.startsWith('--confirm='));
    assert.equal(revision.length, 1, 'one explicit reviewed revision required');
    assert.equal(confirmation.length, 1, 'one exact real confirmation required');
    return {
      apply: false,
      real: {
        expectedRevision: revision[0]!.slice('--expected-revision='.length),
        confirmation: confirmation[0]!.slice('--confirm='.length),
      },
    };
  }
  assert.ok(args.length <= 1, 'conflicting or duplicate application arguments');
  assert.ok(
    args.every((arg) => arg === '--dry-run' || arg === '--apply'),
    'unknown application argument',
  );
  return { apply: args[0] === '--apply' };
}
