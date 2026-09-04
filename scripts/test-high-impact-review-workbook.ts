/*
 * Focused Task 3.5A workbook contract fixtures. These tests read the current
 * project database through the same repeatable-read/read-only snapshot as the
 * generator. They mutate only in-memory workbook copies and never write a
 * database row or a review artifact.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  answerColumnIndexes,
  assertArtifactGitSafety,
  assertReadOnlyQuery,
  assertReadOnlyTransactionSql,
  assertWorkbookArtifactSafety,
  buildHighImpactWorkbook,
  clientChoice,
  CURRENT_CLIENT_CONFIRMED,
  DECISION_STATUSES,
  APPROVED_NEW_COURT,
  D40_EXACT_TARGETS,
  D40_NEW_COURT,
  D40_NO_BRANCH,
  FILLED_OWNER_WORKBOOK_SHA256,
  fileSha256,
  integrateD40OwnerAnswers,
  NEW_COURT_APPROVED,
  NO_BRANCH_APPROVED,
  HIGH_IMPACT_SHA256_PATH,
  HIGH_IMPACT_WORKBOOK_PATH,
  HISTORICAL_WORKBOOK_PATH,
  HighImpactWorkbookError,
  IDENTITY_SHEET,
  LOOKUP_SHEET,
  PARENT_DECISION_STATUSES,
  readHighImpactReviewSnapshot,
  readHistoricalClientSelection,
  populateD39WorkbookAnswers,
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

function reviewLocationForTargetKind(workbook: ExcelJS.Workbook, targetKind: TargetKind) {
  const identity = workbook.getWorksheet(IDENTITY_SHEET)!;
  for (let identityRow = 8; identityRow <= identity.rowCount; identityRow += 1) {
    if (identity.getCell(identityRow, 14).text !== targetKind) continue;
    const sheet = workbook.getWorksheet(identity.getCell(identityRow, 1).text)!;
    const reviewId = identity.getCell(identityRow, 2).text;
    for (let row = 2; row <= sheet.rowCount; row += 1) {
      if (sheet.getCell(row, 1).text === reviewId) {
        return {
          sheet,
          row,
          columns: answerColumnIndexes(reviewId.startsWith('M-') ? 'matter' : 'hearing'),
        };
      }
    }
  }
  throw new Error(`No review row uses target kind ${targetKind}`);
}

function setDefinedNameRanges(
  workbook: ExcelJS.Workbook,
  name: string,
  ranges: readonly string[],
): void {
  workbook.definedNames.model = workbook.definedNames.model.map((entry) =>
    entry.name === name ? { ...entry, ranges: [...ranges] } : entry,
  );
}

function changeRangeEnd(range: string, delta: number): string {
  return range.replace(
    /(\$D\$)(\d+)$/u,
    (_match, prefix: string, row: string) => `${prefix}${Number(row) + delta}`,
  );
}

function completeCorrection(workbook: ExcelJS.Workbook, targetKind: TargetKind) {
  const location = reviewLocationForTargetKind(workbook, targetKind);
  const choices = firstLookupChoices(workbook);
  location.sheet.getCell(location.row, location.columns.decision).value = DECISION_STATUSES[0];
  location.sheet.getCell(location.row, location.columns.target).value =
    choices.get(targetKind) ?? 'دائرة معتمدة للاختبار';
  location.sheet.getCell(location.row, location.columns.reviewer).value = 'مراجع اختبار';
  location.sheet.getCell(location.row, location.columns.date).value = new Date(
    '2026-09-03T00:00:00.000Z',
  );
  return location;
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

    const excelNamedReferences = await cloneWorkbook(firstBuffer);
    const referencedNames = new Set<string>();
    excelNamedReferences.eachSheet((sheet) =>
      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          if (cell.dataValidation?.type !== 'list') return;
          const formula = cell.dataValidation.formulae[0] as string;
          assert.ok(/^=[A-Za-z]+$/u.test(formula));
          referencedNames.add(formula.slice(1));
          cell.dataValidation = { ...cell.dataValidation, formulae: [formula.slice(1)] };
        }),
      ),
    );
    assert.equal(referencedNames.size, 9);
    assert.equal(validateHighImpactWorkbook(excelNamedReferences, snapshot).invalid, 0);
    console.log(
      '  ok    all nine exact named validation references pass with or without one leading equals',
    );
    for (const formula of [
      'CourtChoices',
      '=CourtChoices',
      '__lookups!$D$2:$D$319',
      '=INDIRECT("ClientChoices")',
      ' ClientChoices',
      'ClientChoices ',
      '= ClientChoices',
      '==ClientChoices',
      '"ClientChoices"',
      '="ClientChoices"',
      '=ClientChoices&""',
      'clientchoices',
    ]) {
      const workbook = await cloneWorkbook(firstBuffer);
      const location = reviewLocationForTargetKind(workbook, 'client');
      const cell = location.sheet.getCell(location.row, location.columns.target);
      cell.dataValidation = { ...cell.dataValidation, formulae: [formula] };
      expectContractFailure(
        () => validateHighImpactWorkbook(workbook, snapshot),
        'target: data-validation contract changed',
      );
      console.log(`  ok    unsafe validation reference ${JSON.stringify(formula)} rejected`);
    }
    const missingList = await cloneWorkbook(firstBuffer);
    const missingListLocation = reviewLocationForTargetKind(missingList, 'client');
    missingListLocation.sheet.getCell(
      missingListLocation.row,
      missingListLocation.columns.target,
    ).dataValidation = {} as ExcelJS.DataValidation;
    expectContractFailure(
      () => validateHighImpactWorkbook(missingList, snapshot),
      'target: data-validation contract changed',
    );
    console.log('  ok    absent ClientChoices validation is rejected');

    const currentClient = snapshot.lookups.find(
      (lookup) => lookup.kind === 'client' && lookup.id === '197',
    )!;
    assert.equal(currentClient.legacyId, '188');
    assert.equal(
      clientChoice(currentClient),
      'Access 188 | النظام الجديد 197 | شركة سيجما للصناعات الدوائية',
    );
    const confirmCurrent = (workbook: ExcelJS.Workbook) => {
      const location = completeCorrection(workbook, 'client');
      location.sheet.getCell(location.row, location.columns.decision).value =
        CURRENT_CLIENT_CONFIRMED;
      location.sheet.getCell(location.row, location.columns.target).value =
        clientChoice(currentClient);
      return location;
    };
    const confirmed = await cloneWorkbook(firstBuffer);
    confirmCurrent(confirmed);
    assert.equal(validateHighImpactWorkbook(confirmed, snapshot).completed, 1);
    console.log(
      '  ok    current-client confirmation with exact protected ID, reviewer and date completes',
    );
    for (const [label, column, value, issue] of [
      ['missing current target', 'target', '', 'هدف تأكيد العميل الحالي مطلوب'],
      [
        'different client',
        'target',
        clientChoice(snapshot.lookups.find((row) => row.kind === 'client' && row.id !== '197')!),
        'المعرّف المحمي',
      ],
      ['label without protected ID', 'target', currentClient.label, 'المعرّف المحمي'],
      ['missing reviewer', 'reviewer', '', 'اسم المراجع وتاريخ المراجعة مطلوبان'],
      ['missing date', 'date', '', 'اسم المراجع وتاريخ المراجعة مطلوبان'],
    ] as const) {
      const workbook = await cloneWorkbook(firstBuffer);
      const location = confirmCurrent(workbook);
      location.sheet.getCell(location.row, location.columns[column]).value = value;
      const result = validateHighImpactWorkbook(workbook, snapshot);
      assert.equal(result.completed, 0);
      assert.ok(result.issues.some((item) => item.includes(issue)));
      console.log(`  ok    current-client confirmation rejects ${label} as a completed decision`);
    }
    for (const kind of [
      'court',
      'category',
      'type',
      'importance',
      'branch',
      'circuit',
      'text',
      'parent',
    ] as const) {
      const workbook = await cloneWorkbook(firstBuffer);
      const location = reviewLocationForTargetKind(workbook, kind);
      location.sheet.getCell(location.row, location.columns.decision).value =
        CURRENT_CLIENT_CONFIRMED;
      const result = validateHighImpactWorkbook(workbook, snapshot);
      assert.equal(result.invalid, 1);
      assert.ok(
        result.issues.some((issue) => issue.includes('حالة القرار ليست من القائمة المعتمدة')),
      );
      console.log(`  ok    current-client status prohibited for ${kind}`);
    }
    const changedIdSnapshot = structuredClone(snapshot);
    changedIdSnapshot.lookups.find((row) => row.kind === 'client' && row.id === '197')!.id =
      '98765';
    const independentIds = await buildHighImpactWorkbook(changedIdSnapshot);
    const independentRow = independentIds.reviewRows.find((row) => row.reviewId === 'M-000063')!;
    assert.equal(independentRow.currentClientId, '98765');
    assert.ok(independentRow.evidence[6]!.includes('Access 188 | النظام الجديد 98765'));
    const independentLocation = completeCorrection(independentIds.workbook, 'client');
    independentLocation.sheet.getCell(
      independentLocation.row,
      independentLocation.columns.decision,
    ).value = CURRENT_CLIENT_CONFIRMED;
    independentLocation.sheet.getCell(
      independentLocation.row,
      independentLocation.columns.target,
    ).value = clientChoice(changedIdSnapshot.lookups.find((row) => row.id === '98765')!);
    assert.equal(
      validateHighImpactWorkbook(independentIds.workbook, changedIdSnapshot).completed,
      1,
    );
    console.log('  ok    deliberately non-arithmetic stored IDs resolve without an offset rule');
    for (const sourceIds of [
      ['206', '298'],
      ['289', '292'],
    ]) {
      const clients = snapshot.lookups.filter(
        (row) => row.kind === 'client' && sourceIds.includes(row.legacyId ?? ''),
      );
      assert.equal(clients.length, 2);
      assert.equal(clients[0]!.label, clients[1]!.label);
      assert.notEqual(clientChoice(clients[0]!), clientChoice(clients[1]!));
    }
    console.log(
      '  ok    both duplicate-name client pairs remain distinct by actual source/system IDs',
    );
    const alteredCurrentIdentity = await cloneWorkbook(firstBuffer);
    alteredCurrentIdentity.getWorksheet(IDENTITY_SHEET)!.getCell(8, 16).value = '"11"';
    expectContractFailure(
      () => validateHighImpactWorkbook(alteredCurrentIdentity, snapshot),
      'identity manifest digest mismatch',
    );
    const alteredLegacyId = await cloneWorkbook(firstBuffer);
    const alteredLegacySheet = alteredLegacyId.getWorksheet(LOOKUP_SHEET)!;
    const clientLookupRow = alteredLegacySheet
      .getRows(2, alteredLegacySheet.rowCount - 1)!
      .find((row) => row.getCell(1).text === 'client')!;
    clientLookupRow.getCell(6).value = '"999999"';
    expectContractFailure(
      () => validateHighImpactWorkbook(alteredLegacyId, snapshot),
      'lookup manifest digest mismatch',
    );
    console.log('  ok    protected current-client and legacy-ID association tampering rejected');

    const historicalBytes = readFileSync(HISTORICAL_WORKBOOK_PATH);
    const transferred = await readHistoricalClientSelection(historicalBytes, snapshot);
    assert.equal(transferred.reviewId, 'M-000063');
    assert.equal(transferred.clientId, '197');
    await assert.rejects(
      () =>
        readHistoricalClientSelection(
          Buffer.concat([historicalBytes, Buffer.from('changed')]),
          snapshot,
        ),
      /historical workbook changed/u,
    );
    const successor = await cloneWorkbook(firstBuffer);
    const successorSheet = successor.getWorksheet(VISIBLE_SHEETS[1])!;
    for (let column = 1; column <= successorSheet.columnCount; column += 1) {
      const value = successorSheet.getCell(2, column).value;
      successorSheet.getCell(2, column).value = successorSheet.getCell(3, column).value;
      successorSheet.getCell(3, column).value = value;
    }
    expectContractFailure(
      () => populateD39WorkbookAnswers(successor, snapshot, { ...transferred, clientId: '11' }),
      'transferred selection',
    );
    const populated = populateD39WorkbookAnswers(successor, snapshot, transferred);
    assert.equal(populated.matters.length, 14);
    assert.equal(populated.hearings, 161);
    const approvedIds = new Set(populated.matters.map((row) => row.reviewId));
    const assertOnlyD39Answers = (workbook: ExcelJS.Workbook) => {
      const result = validateHighImpactWorkbook(workbook, snapshot);
      assert.deepEqual(
        [result.completed, result.incomplete, result.invalid, result.answered],
        [175, 207, 0, 175],
      );
      for (const review of first.reviewRows) {
        const sheet = workbook.getWorksheet(review.sheet)!;
        const matches = sheet
          .getRows(2, sheet.rowCount - 1)!
          .filter((row) => row.getCell(1).text === review.reviewId);
        assert.equal(matches.length, 1);
        const row = matches[0]!;
        const columns = answerColumnIndexes(review.kind);
        const approved =
          approvedIds.has(review.reviewId) || approvedIds.has(review.parentMatterReviewId ?? '');
        if (approved) {
          assert.equal(
            row.getCell(columns.decision).text,
            review.kind === 'matter' ? CURRENT_CLIENT_CONFIRMED : PARENT_DECISION_STATUSES[0],
          );
          assert.equal(row.getCell(columns.reviewer).text, 'خالد حلمي');
          assert.equal(
            (row.getCell(columns.date).value as Date).toISOString(),
            '2026-09-04T00:00:00.000Z',
          );
          assert.ok(row.getCell(columns.note).text.includes('D39'));
          if (review.kind === 'hearing')
            assert.ok(row.getCell(columns.note).text.includes(review.parentMatterReviewId!));
        } else {
          for (const key of ['decision', 'reviewer', 'date', 'note'] as const)
            assert.equal(row.getCell(columns[key]).text, '');
          if (review.targetKind !== 'parent') assert.equal(row.getCell(columns.target).text, '');
        }
      }
    };
    assertOnlyD39Answers(successor);
    assertOnlyD39Answers(await cloneWorkbook(await workbookBuffer(successor)));
    if (process.argv[2]) {
      const excelSaved = new ExcelJS.Workbook();
      await excelSaved.xlsx.readFile(process.argv[2]);
      const savedResult = validateHighImpactWorkbook(excelSaved, snapshot);
      assert.equal(savedResult.completed, 382);
      assert.equal(savedResult.invalid, 0);
      assert.equal(savedResult.pendingLookupCreation.length, 2);
      console.log('  ok    supplied Excel-saved D40 successor retains all 382 owner decisions');
    }
    assert.ok(readFileSync(HISTORICAL_WORKBOOK_PATH).equals(historicalBytes));
    console.log(
      '  ok    only D39 14/161 answers populated, transfer follows durable identity after reordering, historical bytes preserved',
    );

    const ownerBytes = readFileSync(HIGH_IMPACT_WORKBOOK_PATH);
    assert.equal(fileSha256(ownerBytes), FILLED_OWNER_WORKBOOK_SHA256);
    const owner = await cloneWorkbook(ownerBytes);
    const d40 = await integrateD40OwnerAnswers(ownerBytes, snapshot, successor);
    const d40Bytes = await workbookBuffer(d40);
    const d40Result = validateHighImpactWorkbook(await cloneWorkbook(d40Bytes), snapshot);
    assert.deepEqual(
      [d40Result.completed, d40Result.incomplete, d40Result.invalid, d40Result.answered],
      [382, 0, 0, 382],
    );
    assert.deepEqual(
      d40Result.pendingLookupCreation.map((row) => [
        row.reviewId,
        row.legacyId,
        row.label,
        row.databaseId,
      ]),
      [...D40_NEW_COURT].map(([id, legacyId]) => [id, legacyId, APPROVED_NEW_COURT, null]),
    );
    const byId = (book: ExcelJS.Workbook, id: string) => {
      const review = first.reviewRows.find((row) => row.reviewId === id)!;
      const sheet = book.getWorksheet(review.sheet)!;
      const matches = sheet
        .getRows(2, sheet.rowCount - 1)!
        .filter((row) => row.getCell(1).text === id);
      assert.equal(matches.length, 1);
      return { row: matches[0]!, columns: answerColumnIndexes(review.kind) };
    };
    for (const [id] of D40_NO_BRANCH) {
      const { row, columns } = byId(d40, id);
      assert.equal(row.getCell(columns.decision).text, NO_BRANCH_APPROVED);
      assert.equal(row.getCell(columns.target).text, '');
      assert.equal(row.getCell(columns.note).text, 'لا يوجد فرع');
      assert.equal(row.getCell(10).text, 'دعاوى قضائية');
    }
    for (const [id, correction] of D40_EXACT_TARGETS) {
      const { row, columns } = byId(d40, id);
      assert.equal(row.getCell(columns.target).text, correction.target);
    }
    let baselinePreserved = 0,
      inherited = 0;
    const baselineStates = validateHighImpactWorkbook(successor, snapshot).rowStates;
    for (const review of first.reviewRows) {
      const previous = byId(owner, review.reviewId),
        current = byId(d40, review.reviewId);
      const baselineState = baselineStates[review.reviewId];
      if (baselineState === 'completed') {
        baselinePreserved++;
        for (const column of Object.values(previous.columns))
          assert.deepEqual(current.row.getCell(column).value, previous.row.getCell(column).value);
      }
      if (review.targetKind === 'parent') {
        inherited++;
        assert.equal(
          current.row.getCell(current.columns.decision).text,
          PARENT_DECISION_STATUSES[0],
        );
        assert.ok(
          current.row.getCell(current.columns.note).text.includes(review.parentMatterReviewId!),
        );
      }
      if (
        !D40_NO_BRANCH.has(review.reviewId) &&
        !D40_NEW_COURT.has(review.reviewId) &&
        !D40_EXACT_TARGETS.has(review.reviewId) &&
        review.targetKind !== 'parent'
      ) {
        for (const column of Object.values(previous.columns))
          assert.deepEqual(current.row.getCell(column).value, previous.row.getCell(column).value);
      }
    }
    assert.equal(baselinePreserved, 175);
    assert.equal(inherited, 313);
    console.log(
      '  ok    D40: 382 owner-complete, 313 explicit dependents, 175 baseline decisions preserved; two court approvals have no database ID',
    );
    const negatives: Array<
      [string, string, 'decision' | 'target' | 'reviewer' | 'date' | 'note', ExcelJS.CellValue]
    > = [
      ['no-branch wrong kind', 'M-000061', 'decision', NO_BRANCH_APPROVED],
      ['no-branch target', 'M-000057', 'target', '1 — فرع'],
      ['no-branch whitespace target', 'M-000057', 'target', ' '],
      ['no-branch status variation', 'M-000057', 'decision', `${NO_BRANCH_APPROVED} `],
      ['no-branch missing reviewer', 'M-000057', 'reviewer', ''],
      ['no-branch missing date', 'M-000057', 'date', ''],
      ['no-branch changed approval', 'M-000057', 'note', 'بدون فرع'],
      ['new-court wrong kind', 'M-000061', 'decision', NEW_COURT_APPROVED],
      ['new-court unapproved row', 'H-000278', 'decision', NEW_COURT_APPROVED],
      ['new-court missing label', 'H-000080', 'target', ''],
      ['new-court generic label', 'H-000080', 'target', 'مصر الجديدة'],
      ['new-court reused ID', 'H-000080', 'target', '123 — مصر الجديدة'],
      ['new-court fake ID', 'H-000080', 'target', '999999 — أسرة مصر الجديدة'],
      ['new-court changed label', 'H-000080', 'target', 'اسرة مصر الجديدة'],
      ['new-court missing reviewer', 'H-000080', 'reviewer', ''],
      ['new-court missing date', 'H-000080', 'date', ''],
      ['new-court missing approval note', 'H-000080', 'note', ''],
      ['new-court ordinary correction bypass', 'H-000080', 'decision', DECISION_STATUSES[0]],
      ['independent hearing cannot inherit', 'H-000123', 'decision', PARENT_DECISION_STATUSES[0]],
      ...[...D40_EXACT_TARGETS].map(
        ([id]) =>
          [
            'exact approved target changed',
            id,
            'target',
            id.startsWith('H-') ? 'جنح العجوزة' : 'نيابة الشئون المالية والتجارية',
          ] as [string, string, 'target', string],
      ),
    ];
    for (const [label, id, field, value] of negatives) {
      const changed = await cloneWorkbook(d40Bytes),
        location = byId(changed, id);
      location.row.getCell(location.columns[field]).value = value;
      const result = validateHighImpactWorkbook(changed, snapshot);
      assert.notEqual(result.rowStates[id], 'completed', label);
      assert.equal(result.complete, false, label);
      assert.ok(
        result.issues.some((issue) => issue.startsWith(`${id}:`)),
        label,
      );
      console.log(`  ok    D40 rejects ${label}`);
    }
    for (const parentValue of ['null', '"M-000111"']) {
      const changed = await cloneWorkbook(d40Bytes);
      const identity = changed.getWorksheet(IDENTITY_SHEET)!;
      const dependent = identity.getRows(8, 382)!.find((row) => row.getCell(14).text === 'parent')!;
      dependent.getCell(13).value = parentValue;
      expectContractFailure(
        () => validateHighImpactWorkbook(changed, snapshot),
        'identity manifest digest mismatch',
      );
    }
    const incompleteParent = await cloneWorkbook(d40Bytes);
    const parent = byId(incompleteParent, 'M-000057');
    parent.row.getCell(parent.columns.date).value = '';
    const incompleteParentResult = validateHighImpactWorkbook(incompleteParent, snapshot);
    const children = first.reviewRows.filter((row) => row.parentMatterReviewId === 'M-000057');
    assert.ok(children.length > 0);
    children.forEach((row) =>
      assert.equal(incompleteParentResult.rowStates[row.reviewId], 'invalid'),
    );
    const tamperedIdentity = await cloneWorkbook(d40Bytes);
    tamperedIdentity.getWorksheet(IDENTITY_SHEET)!.getCell(8, 6).value = 'tampered-source';
    expectContractFailure(
      () => validateHighImpactWorkbook(tamperedIdentity, snapshot),
      'identity manifest digest mismatch',
    );
    const fakeLookup = await cloneWorkbook(d40Bytes);
    const approvedCourtRow = fakeLookup
      .getWorksheet(LOOKUP_SHEET)!
      .getRows(2, 698)!
      .find((row) => row.getCell(1).text === 'approved_new_court')!;
    approvedCourtRow.getCell(2).value = '123';
    approvedCourtRow.getCell(5).value = 'true';
    expectContractFailure(
      () => validateHighImpactWorkbook(fakeLookup, snapshot),
      'lookup manifest digest mismatch',
    );
    await assert.rejects(
      () =>
        integrateD40OwnerAnswers(
          Buffer.concat([ownerBytes, Buffer.from('tampered')]),
          snapshot,
          successor,
        ),
      /immutable owner attachment/u,
    );
    assert.ok(readFileSync(HIGH_IMPACT_WORKBOOK_PATH).equals(ownerBytes));
    console.log(
      '  ok    D40 orphan/mismatched/invalid parent, altered identity, fabricated court identity and changed attachment rejected',
    );

    const namedRangeSource = await cloneWorkbook(firstBuffer);
    const clientRange = namedRangeSource.definedNames.getRanges('ClientChoices').ranges[0]!;
    const courtRange = namedRangeSource.definedNames.getRanges('CourtChoices').ranges[0]!;
    const namedRangeCases: Array<[string, string]> = [
      ['redirected to CourtChoices', courtRange],
      ['shortened', changeRangeEnd(clientRange, -1)],
      ['expanded', changeRangeEnd(clientRange, 1)],
    ];
    for (const [label, range] of namedRangeCases) {
      const workbook = await cloneWorkbook(firstBuffer);
      setDefinedNameRanges(workbook, 'ClientChoices', [range]);
      expectContractFailure(
        () => validateHighImpactWorkbook(workbook, snapshot),
        'named validation range ClientChoices must be exactly',
      );
      console.log(`  ok    ${label} ClientChoices range is rejected`);
    }

    const answerValidationCases: Array<[string, (workbook: ExcelJS.Workbook) => void, string]> = [
      [
        'missing reviewer validation',
        (workbook) => {
          const location = reviewLocationForTargetKind(workbook, 'client');
          location.sheet.getCell(location.row, location.columns.reviewer).dataValidation =
            {} as ExcelJS.DataValidation;
        },
        'reviewer: data-validation contract changed',
      ],
      [
        'altered reviewer maximum',
        (workbook) => {
          const location = reviewLocationForTargetKind(workbook, 'client');
          const cell = location.sheet.getCell(location.row, location.columns.reviewer);
          cell.dataValidation = { ...cell.dataValidation, formulae: [201] };
        },
        'reviewer: data-validation contract changed',
      ],
      [
        'missing review-date validation',
        (workbook) => {
          const location = reviewLocationForTargetKind(workbook, 'client');
          location.sheet.getCell(location.row, location.columns.date).dataValidation =
            {} as ExcelJS.DataValidation;
        },
        'review date: data-validation contract changed',
      ],
      [
        'altered review-date bounds',
        (workbook) => {
          const location = reviewLocationForTargetKind(workbook, 'client');
          const cell = location.sheet.getCell(location.row, location.columns.date);
          cell.dataValidation = {
            ...cell.dataValidation,
            formulae: [new Date('1999-12-31T00:00:00.000Z'), new Date('2100-12-31T00:00:00.000Z')],
          };
        },
        'review date: data-validation contract changed',
      ],
      [
        'missing decision-note validation',
        (workbook) => {
          const location = reviewLocationForTargetKind(workbook, 'client');
          location.sheet.getCell(location.row, location.columns.note).dataValidation =
            {} as ExcelJS.DataValidation;
        },
        'decision note: data-validation contract changed',
      ],
      [
        'altered decision-note maximum',
        (workbook) => {
          const location = reviewLocationForTargetKind(workbook, 'client');
          const cell = location.sheet.getCell(location.row, location.columns.note);
          cell.dataValidation = { ...cell.dataValidation, formulae: [2_001] };
        },
        'decision note: data-validation contract changed',
      ],
      [
        'altered free-text target maximum',
        (workbook) => {
          const location = reviewLocationForTargetKind(workbook, 'circuit');
          const cell = location.sheet.getCell(location.row, location.columns.target);
          cell.dataValidation = { ...cell.dataValidation, formulae: [501] };
        },
        'free-text target: data-validation contract changed',
      ],
      [
        'altered decision-list rule',
        (workbook) => {
          const location = reviewLocationForTargetKind(workbook, 'client');
          const cell = location.sheet.getCell(location.row, location.columns.decision);
          cell.dataValidation = { ...cell.dataValidation, allowBlank: false };
        },
        'decision: data-validation contract changed',
      ],
      [
        'altered target-list rule',
        (workbook) => {
          const location = reviewLocationForTargetKind(workbook, 'client');
          const cell = location.sheet.getCell(location.row, location.columns.target);
          cell.dataValidation = { ...cell.dataValidation, showErrorMessage: false };
        },
        'target: data-validation contract changed',
      ],
    ];
    for (const [label, mutate, message] of answerValidationCases) {
      const workbook = await cloneWorkbook(firstBuffer);
      mutate(workbook);
      expectContractFailure(() => validateHighImpactWorkbook(workbook, snapshot), message);
      console.log(`  ok    ${label} is rejected`);
    }

    const semanticLimitCases: Array<
      [string, TargetKind, (location: ReturnType<typeof completeCorrection>) => void, string]
    > = [
      [
        'free-text target over 500 characters',
        'circuit',
        (location) => {
          location.sheet.getCell(location.row, location.columns.target).value = 'د'.repeat(501);
        },
        'الهدف يتجاوز 500 حرفًا',
      ],
      [
        'reviewer over 200 characters',
        'client',
        (location) => {
          location.sheet.getCell(location.row, location.columns.reviewer).value = 'م'.repeat(201);
        },
        'اسم المراجع يتجاوز 200 حرفًا',
      ],
      [
        'decision note over 2,000 characters',
        'client',
        (location) => {
          location.sheet.getCell(location.row, location.columns.note).value = 'ن'.repeat(2_001);
        },
        'ملاحظة القرار تتجاوز 2000 حرفًا',
      ],
      [
        'review date below 2000-01-01',
        'client',
        (location) => {
          location.sheet.getCell(location.row, location.columns.date).value = new Date(
            '1999-12-31T00:00:00.000Z',
          );
        },
        'تاريخ المراجعة غير صحيح',
      ],
      [
        'review date above 2100-12-31',
        'client',
        (location) => {
          location.sheet.getCell(location.row, location.columns.date).value = new Date(
            '2101-01-01T00:00:00.000Z',
          );
        },
        'تاريخ المراجعة غير صحيح',
      ],
    ];
    for (const [label, targetKind, mutate, issue] of semanticLimitCases) {
      const workbook = await cloneWorkbook(firstBuffer);
      const location = completeCorrection(workbook, targetKind);
      mutate(location);
      const result = validateHighImpactWorkbook(workbook, snapshot);
      assert.equal(result.completed, 0, label);
      assert.equal(result.invalid, 1, label);
      assert.equal(result.complete, false, label);
      assert.ok(
        result.issues.some((item) => item.includes(issue)),
        label,
      );
      console.log(`  ok    ${label} is invalid, never complete`);
    }

    const inclusiveLimits = await cloneWorkbook(firstBuffer);
    const inclusiveLocation = completeCorrection(inclusiveLimits, 'circuit');
    inclusiveLocation.sheet.getCell(inclusiveLocation.row, inclusiveLocation.columns.target).value =
      'د'.repeat(500);
    inclusiveLocation.sheet.getCell(
      inclusiveLocation.row,
      inclusiveLocation.columns.reviewer,
    ).value = 'م'.repeat(200);
    inclusiveLocation.sheet.getCell(inclusiveLocation.row, inclusiveLocation.columns.note).value =
      'ن'.repeat(2_000);
    inclusiveLocation.sheet.getCell(inclusiveLocation.row, inclusiveLocation.columns.date).value =
      new Date('2000-01-01T00:00:00.000Z');
    const inclusiveResult = validateHighImpactWorkbook(inclusiveLimits, snapshot);
    assert.equal(inclusiveResult.completed, 1);
    assert.equal(inclusiveResult.invalid, 0);
    const upperDate = await cloneWorkbook(firstBuffer);
    const upperLocation = completeCorrection(upperDate, 'client');
    upperLocation.sheet.getCell(upperLocation.row, upperLocation.columns.date).value = new Date(
      '2100-12-31T00:00:00.000Z',
    );
    const upperResult = validateHighImpactWorkbook(upperDate, snapshot);
    assert.equal(upperResult.completed, 1);
    assert.equal(upperResult.invalid, 0);
    console.log('  ok    exact text limits and both inclusive date bounds remain valid');

    const extraVisibleColumn = await cloneWorkbook(firstBuffer);
    const extraSheet = extraVisibleColumn.getWorksheet(VISIBLE_SHEETS[1])!;
    const extraColumn = extraSheet.columnCount + 1;
    extraSheet.getColumn(extraColumn).width = 24;
    extraSheet.getCell(1, extraColumn).value = 'إفادة إضافية';
    extraSheet.getCell(1, extraColumn).alignment = { wrapText: true };
    extraSheet.getCell(2, extraColumn).value = 'اعتماد المكتب';
    expectContractFailure(
      () => validateHighImpactWorkbook(extraVisibleColumn, snapshot),
      'content is outside the approved visible-column contract',
    );
    console.log('  ok    an extra populated normal-width visible column is rejected');

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
