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
      assertOnlyD39Answers(excelSaved);
      console.log(
        '  ok    supplied real-Excel-saved successor retains exactly the authorized 175 answers',
      );
    }
    assert.ok(readFileSync(HISTORICAL_WORKBOOK_PATH).equals(historicalBytes));
    console.log(
      '  ok    only D39 14/161 answers populated, transfer follows durable identity after reordering, historical bytes preserved',
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
