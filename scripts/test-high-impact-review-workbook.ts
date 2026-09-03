/*
 * Focused Task 3.5A workbook contract fixtures. These tests read the current
 * project database through the same repeatable-read/read-only snapshot as the
 * generator. They mutate only in-memory workbook copies and never write a
 * database row or a review artifact.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  answerColumnIndexes,
  assertArtifactGitSafety,
  assertReadOnlyQuery,
  assertReadOnlyTransactionSql,
  assertWorkbookArtifactSafety,
  buildHighImpactWorkbook,
  DECISION_STATUSES,
  HIGH_IMPACT_SHA256_PATH,
  HIGH_IMPACT_WORKBOOK_PATH,
  HighImpactWorkbookError,
  IDENTITY_SHEET,
  LOOKUP_SHEET,
  PARENT_DECISION_STATUSES,
  readHighImpactReviewSnapshot,
  validateHighImpactWorkbook,
  VISIBLE_SHEETS,
  type TargetKind,
} from './lib/high-impact-review-workbook';

async function workbookBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function cloneWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  return workbook;
}

function expectContractFailure(run: () => unknown, includes: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof HighImpactWorkbookError);
    assert.match(error.message, new RegExp(includes, 'u'));
    return true;
  });
}

function identityTargetKinds(workbook: ExcelJS.Workbook): Map<string, TargetKind> {
  const identity = workbook.getWorksheet(IDENTITY_SHEET)!;
  const result = new Map<string, TargetKind>();
  for (let rowNumber = 8; rowNumber <= identity.rowCount; rowNumber += 1) {
    result.set(
      identity.getCell(rowNumber, 2).text,
      identity.getCell(rowNumber, 14).text as TargetKind,
    );
  }
  return result;
}

function firstLookupChoices(workbook: ExcelJS.Workbook): Map<string, string> {
  const lookups = workbook.getWorksheet(LOOKUP_SHEET)!;
  const result = new Map<string, string>();
  for (let rowNumber = 2; rowNumber <= lookups.rowCount; rowNumber += 1) {
    const kind = lookups.getCell(rowNumber, 1).text;
    if (lookups.getCell(rowNumber, 5).text === 'true' && !result.has(kind)) {
      result.set(kind, lookups.getCell(rowNumber, 4).text);
    }
  }
  return result;
}

function fillAllDecisions(workbook: ExcelJS.Workbook): void {
  const kinds = identityTargetKinds(workbook);
  const choices = firstLookupChoices(workbook);
  for (const sheetName of VISIBLE_SHEETS.slice(1)) {
    const sheet = workbook.getWorksheet(sheetName)!;
    const kind =
      sheetName === VISIBLE_SHEETS[1] || sheetName === VISIBLE_SHEETS[2] ? 'matter' : 'hearing';
    const columns = answerColumnIndexes(kind);
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const reviewId = row.getCell(1).text;
      const targetKind = kinds.get(reviewId)!;
      row.getCell(columns.reviewer).value = 'مراجع اختبار';
      row.getCell(columns.date).value = new Date('2026-09-03T00:00:00.000Z');
      if (targetKind === 'parent') {
        row.getCell(columns.decision).value = PARENT_DECISION_STATUSES[0];
      } else {
        row.getCell(columns.decision).value = DECISION_STATUSES[0];
        row.getCell(columns.target).value =
          choices.get(targetKind) ??
          (targetKind === 'circuit' ? 'دائرة معتمدة للاختبار' : 'نص معتمد للاختبار');
      }
    }
  }
}

async function main(): Promise<void> {
  await withApprovedMigrationClient(async (database) => {
    const snapshot = await readHighImpactReviewSnapshot(database);
    const first = await buildHighImpactWorkbook(snapshot);
    const firstBuffer = await workbookBuffer(first.workbook);
    const second = await buildHighImpactWorkbook(snapshot);
    const secondBuffer = await workbookBuffer(second.workbook);
    assert.deepEqual(first.reviewRows, second.reviewRows);
    assert.equal(first.identityManifestSha256, second.identityManifestSha256);
    assert.equal(first.lookupManifestSha256, second.lookupManifestSha256);
    assert.equal(
      validateHighImpactWorkbook(await cloneWorkbook(secondBuffer), snapshot).invalid,
      0,
    );
    console.log('  ok    stable snapshot reproduces identical review rows and semantic manifests');

    const blank = await cloneWorkbook(firstBuffer);
    const blankResult = validateHighImpactWorkbook(blank, snapshot);
    assert.deepEqual(
      {
        total: blankResult.total,
        answered: blankResult.answered,
        completed: blankResult.completed,
        incomplete: blankResult.incomplete,
        invalid: blankResult.invalid,
        complete: blankResult.complete,
      },
      { total: 382, answered: 0, completed: 0, incomplete: 382, invalid: 0, complete: false },
    );
    console.log(
      '  ok    correct unanswered workbook passes structurally but cannot be called complete',
    );

    const reordered = await cloneWorkbook(firstBuffer);
    const wrongClient = reordered.getWorksheet(VISIBLE_SHEETS[1])!;
    for (let column = 1; column <= wrongClient.columnCount; column += 1) {
      const left = wrongClient.getCell(2, column).value;
      wrongClient.getCell(2, column).value = wrongClient.getCell(3, column).value;
      wrongClient.getCell(3, column).value = left;
    }
    assert.equal(validateHighImpactWorkbook(reordered, snapshot).invalid, 0);
    console.log(
      '  ok    whole visible rows may be reordered because their durable identity moves with them',
    );

    const missingMatter = await cloneWorkbook(firstBuffer);
    missingMatter.getWorksheet(VISIBLE_SHEETS[1])!.spliceRows(2, 1);
    expectContractFailure(
      () => validateHighImpactWorkbook(missingMatter, snapshot),
      'visible workbook has|visible review row is missing',
    );
    console.log('  ok    omitted matter is rejected');

    const duplicateHearing = await cloneWorkbook(firstBuffer);
    const hearingSheet = duplicateHearing.getWorksheet(VISIBLE_SHEETS[3])!;
    hearingSheet.getCell(3, 1).value = hearingSheet.getCell(2, 1).value;
    expectContractFailure(
      () => validateHighImpactWorkbook(duplicateHearing, snapshot),
      'duplicate visible review id|visible evidence moved',
    );
    console.log('  ok    duplicated hearing is rejected');

    const movedWithoutIdentity = await cloneWorkbook(firstBuffer);
    const movedSheet = movedWithoutIdentity.getWorksheet(VISIBLE_SHEETS[1])!;
    const matterAnswerStart = answerColumnIndexes('matter').decision;
    for (let column = 2; column < matterAnswerStart; column += 1) {
      const left = movedSheet.getCell(2, column).value;
      movedSheet.getCell(2, column).value = movedSheet.getCell(3, column).value;
      movedSheet.getCell(3, column).value = left;
    }
    expectContractFailure(
      () => validateHighImpactWorkbook(movedWithoutIdentity, snapshot),
      'visible evidence moved or changed without its identity',
    );
    console.log('  ok    evidence moved without its review identity is rejected');

    const alteredSource = await cloneWorkbook(firstBuffer);
    alteredSource.getWorksheet(IDENTITY_SHEET)!.getCell(8, 6).value = 'changed-source-key';
    expectContractFailure(
      () => validateHighImpactWorkbook(alteredSource, snapshot),
      'identity manifest digest mismatch',
    );
    console.log('  ok    altered source identity is rejected');

    const alteredReason = await cloneWorkbook(firstBuffer);
    alteredReason.getWorksheet(IDENTITY_SHEET)!.getCell(8, 11).value = '["changed-reason"]';
    expectContractFailure(
      () => validateHighImpactWorkbook(alteredReason, snapshot),
      'identity manifest digest mismatch',
    );
    console.log('  ok    altered reason identity is rejected');

    const alteredLookup = await cloneWorkbook(firstBuffer);
    const lookupSheet = alteredLookup.getWorksheet(LOOKUP_SHEET)!;
    const firstDatabaseLookupRow = Array.from(
      { length: lookupSheet.rowCount - 1 },
      (_, index) => index + 2,
    ).find((rowNumber) => lookupSheet.getCell(rowNumber, 5).text === 'true')!;
    lookupSheet.getCell(firstDatabaseLookupRow, 3).value = 'اسم متغير';
    lookupSheet.getCell(firstDatabaseLookupRow, 4).value =
      `${lookupSheet.getCell(firstDatabaseLookupRow, 2).text} — اسم متغير`;
    expectContractFailure(
      () => validateHighImpactWorkbook(alteredLookup, snapshot),
      'lookup manifest digest mismatch',
    );
    console.log('  ok    altered lookup ID/label association is rejected');

    const missingTarget = await cloneWorkbook(firstBuffer);
    const targetSheet = missingTarget.getWorksheet(VISIBLE_SHEETS[1])!;
    const matterColumns = answerColumnIndexes('matter');
    targetSheet.getCell(2, matterColumns.decision).value = DECISION_STATUSES[0];
    targetSheet.getCell(2, matterColumns.target).value = '999999 — عميل لم يعد موجودًا';
    targetSheet.getCell(2, matterColumns.reviewer).value = 'مراجع اختبار';
    targetSheet.getCell(2, matterColumns.date).value = new Date('2026-09-03T00:00:00.000Z');
    const missingTargetResult = validateHighImpactWorkbook(missingTarget, snapshot);
    assert.equal(missingTargetResult.invalid, 1);
    assert.equal(missingTargetResult.complete, false);
    assert.ok(missingTargetResult.issues.some((issue) => issue.includes('لم يعد موجودًا')));
    console.log('  ok    selected target that no longer exists is invalid');

    const incompleteFinal = await cloneWorkbook(firstBuffer);
    const incompleteSheet = incompleteFinal.getWorksheet(VISIBLE_SHEETS[1])!;
    incompleteSheet.getCell(2, matterColumns.decision).value = DECISION_STATUSES[0];
    incompleteSheet.getCell(2, matterColumns.reviewer).value = 'مراجع اختبار';
    incompleteSheet.getCell(2, matterColumns.date).value = new Date('2026-09-03T00:00:00.000Z');
    const incompleteFinalResult = validateHighImpactWorkbook(incompleteFinal, snapshot);
    assert.equal(incompleteFinalResult.completed, 0);
    assert.equal(incompleteFinalResult.incomplete, 382);
    assert.equal(incompleteFinalResult.complete, false);
    console.log('  ok    correction without its target is incomplete, never final');

    const prematureParentFollow = await cloneWorkbook(firstBuffer);
    const parentSheet = prematureParentFollow.getWorksheet(VISIBLE_SHEETS[3])!;
    const hearingColumns = answerColumnIndexes('hearing');
    parentSheet.getCell(2, hearingColumns.decision).value = PARENT_DECISION_STATUSES[0];
    parentSheet.getCell(2, hearingColumns.reviewer).value = 'مراجع اختبار';
    parentSheet.getCell(2, hearingColumns.date).value = new Date('2026-09-03T00:00:00.000Z');
    const prematureResult = validateHighImpactWorkbook(prematureParentFollow, snapshot);
    assert.equal(prematureResult.invalid, 1);
    assert.ok(prematureResult.issues.some((issue) => issue.includes('دعوى أصلية غير مكتمل')));
    console.log('  ok    follow-parent is invalid while the parent matter decision is incomplete');

    const complete = await cloneWorkbook(firstBuffer);
    fillAllDecisions(complete);
    const completeResult = validateHighImpactWorkbook(complete, snapshot);
    assert.deepEqual(
      {
        completed: completeResult.completed,
        incomplete: completeResult.incomplete,
        invalid: completeResult.invalid,
        complete: completeResult.complete,
      },
      { completed: 382, incomplete: 0, invalid: 0, complete: true },
    );
    console.log('  ok    382 internally consistent explicit decisions are the only complete state');
  });

  expectContractFailure(
    () => assertReadOnlyQuery('UPDATE quarantine.matter_transform SET resolved_at=now()'),
    'only SELECT|database-writing',
  );
  expectContractFailure(
    () =>
      assertReadOnlyQuery(
        'WITH changed AS (DELETE FROM quarantine.hearing_transform RETURNING *) SELECT * FROM changed',
      ),
    'database-writing',
  );
  expectContractFailure(
    () => assertReadOnlyTransactionSql('BEGIN'),
    'not repeatable-read and read-only',
  );
  assertReadOnlyTransactionSql('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  console.log('  ok    writing SQL and a non-read-only transaction are rejected');

  assertArtifactGitSafety(HIGH_IMPACT_WORKBOOK_PATH, { ignored: true, tracked: false });
  expectContractFailure(
    () => assertArtifactGitSafety(HIGH_IMPACT_WORKBOOK_PATH, { ignored: false, tracked: true }),
    'must stay ignored and untracked',
  );
  assertWorkbookArtifactSafety(HIGH_IMPACT_WORKBOOK_PATH);
  assertWorkbookArtifactSafety(HIGH_IMPACT_SHA256_PATH);
  console.log(
    '  ok    workbook and manifest are ignored/untracked; a tracked artifact is rejected',
  );

  console.log('\nTask 3.5A focused workbook fixtures passed; database access was read-only.\n');
}

main().catch((error: unknown) => {
  console.error('\nTask 3.5A focused workbook fixtures failed. No database row was changed.\n');
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
