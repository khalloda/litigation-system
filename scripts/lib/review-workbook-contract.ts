import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';

export const CONTRACT_SHEET = '__identity';
export const WORKBOOK_FORMAT = 'review-workbook-v2';
export const LEGACY_AUTHORITATIVE_SHA256 =
  '17FDDA9FCEC64528FE256789BFBFBAB72CAF3ABA5F0557D46FC9FD26CEF85BDF';
export const LEGACY_EXTRACTION_SHA256 =
  '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979';

const COVER_SHEET = 'اقرأ أولاً';
export const NULL_DISPLAY = '(فارغ / NULL)';
const MARKER = '⬅';
const PERSON_ANSWERS = new Set(['person', 'unknown person', 'not a name', 'split']);

type Kind = 'review_value' | 'finding';

type LegacySheet = {
  kind: Kind;
  rows: number;
  topics: readonly string[];
};

export type ReviewSheetSpec = {
  name: string;
  kind: Kind;
  topics: readonly string[];
};

/**
 * The expected workbook is defined independently of the workbook's hidden
 * contract. Otherwise deleting a visible sheet and deleting the matching
 * hidden rows would make the damaged file describe itself as complete.
 */
export const REVIEW_SHEET_SPECS: readonly ReviewSheetSpec[] = [
  { name: 'الحاضرون بالجلسات', kind: 'review_value', topics: ['attendee_name'] },
  { name: 'القائم بالعمل', kind: 'review_value', topics: ['admin_assignee'] },
  { name: 'أسئلة عامة', kind: 'review_value', topics: ['open_question'] },
  {
    name: 'خطابات الأتعاب',
    kind: 'finding',
    topics: ['fee_letter_matter_unmatched', 'fee_letter_matter_ambiguous'],
  },
  {
    name: 'صفوف بلا رابط',
    kind: 'finding',
    topics: ['hearing_no_matter', 'matter_no_client', 'poa_no_client', 'admin_task_no_matter'],
  },
  { name: 'إجراءات بلا مهمة', kind: 'finding', topics: ['task_action_orphan'] },
] as const;

const LEGACY_SHEETS = new Map<string, LegacySheet>([
  ['الحاضرون بالجلسات', { kind: 'review_value', rows: 663, topics: ['attendee_name'] }],
  ['القائم بالعمل', { kind: 'review_value', rows: 4, topics: ['admin_assignee'] }],
  ['أسئلة عامة', { kind: 'review_value', rows: 1, topics: ['open_question'] }],
  [
    'خطابات الأتعاب',
    {
      kind: 'finding',
      rows: 33,
      topics: ['fee_letter_matter_unmatched', 'fee_letter_matter_ambiguous'],
    },
  ],
  [
    'صفوف بلا رابط',
    {
      kind: 'finding',
      rows: 7,
      topics: ['hearing_no_matter', 'matter_no_client', 'poa_no_client', 'admin_task_no_matter'],
    },
  ],
  ['إجراءات بلا مهمة', { kind: 'finding', rows: 36, topics: ['task_action_orphan'] }],
]);

export type ContractRow = {
  sheet: string;
  kind: Kind;
  workbookId: number;
  topic: string;
  value: string | null;
  srcTable: string | null;
  srcFile: string | null;
  srcRowNum: number | null;
  srcRecordKey: string | null;
  columnName: string | null;
  originalValue: string | null;
  extractionSha256: string;
};

export type WorkbookAnswerRow = {
  sheet: string;
  rowNumber: number;
  workbookId: number;
  kind: Kind;
  topics: readonly string[];
  answer: string;
  person: string;
  note: string;
  visible: string[];
  contract: ContractRow | null;
};

export type ParsedReviewWorkbook = {
  format: 'legacy-authoritative' | typeof WORKBOOK_FORMAT;
  extractionSha256: string;
  rows: WorkbookAnswerRow[];
};

export type DatabaseReviewValue = {
  id: bigint;
  topic: string;
  value: string;
  extraction_sha256: string;
  legacy_workbook_id: bigint | null;
};

export type DatabaseFinding = {
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
};

export type PlannedAnswer = {
  sheet: string;
  rowNumber: number;
  kind: Kind;
  targetId: bigint;
  topic: string;
  value: string | null;
  srcTable: string | null;
  srcRecordKey: string | null;
  columnName: string | null;
  extractionSha256: string;
  answer: string;
  person: string;
  note: string;
};

export type ImportPlan = {
  rows: PlannedAnswer[];
  totalRows: number;
  answered: number;
  blank: number;
  incomplete: PlannedAnswer[];
  movedFindings: number;
};

export class WorkbookContractError extends Error {}

function contractPayload(row: ContractRow): readonly (string | number | null)[] {
  return [
    row.sheet,
    row.kind,
    row.workbookId,
    row.topic,
    row.value,
    row.srcTable,
    row.srcFile,
    row.srcRowNum,
    row.srcRecordKey,
    row.columnName,
    row.originalValue,
    row.extractionSha256,
  ];
}

/** A checksum of the complete, ordered identity manifest. */
export function contractSha256(rows: readonly ContractRow[]): string {
  const canonical = rows.map((row) => JSON.stringify(contractPayload(row))).join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex').toUpperCase();
}

export function workbookSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'richText' in (value as object)) {
    return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join('');
  }
  if (typeof value === 'object' && 'text' in (value as object)) {
    return String((value as { text: unknown }).text ?? '');
  }
  return String(value);
}

function fail(message: string): never {
  throw new WorkbookContractError(message);
}

function positiveId(value: unknown, where: string): number {
  const id = Number(cellText(value).trim());
  if (!Number.isSafeInteger(id) || id <= 0)
    fail(`${where}: invalid row id ${JSON.stringify(value)}`);
  return id;
}

function contractNullable(value: unknown, where: string): string | null {
  const encoded = cellText(value);
  try {
    const decoded: unknown = JSON.parse(encoded);
    if (decoded === null || typeof decoded === 'string') return decoded;
  } catch {
    // The uniform error below explains the contract rather than JSON syntax.
  }
  fail(`${where}: nullable identity value is not encoded as JSON string or null`);
}

export function parseWorkbookContract(book: ExcelJS.Workbook): {
  fingerprint: string;
  rows: ContractRow[];
} | null {
  const sheet = book.getWorksheet(CONTRACT_SHEET);
  if (sheet === undefined) return null;
  if (sheet.state !== 'veryHidden') fail(`${CONTRACT_SHEET}: identity contract is not very hidden`);
  if (sheet.getCell('B1').text !== WORKBOOK_FORMAT) {
    fail(
      `${CONTRACT_SHEET}: unsupported workbook format ${JSON.stringify(sheet.getCell('B1').text)}`,
    );
  }
  const fingerprint = sheet.getCell('B2').text.trim();
  if (!/^[0-9A-F]{64}$/.test(fingerprint)) {
    fail(`${CONTRACT_SHEET}: extraction fingerprint is missing or malformed`);
  }
  if (sheet.getCell('A3').text !== 'contract_sha256') {
    fail(`${CONTRACT_SHEET}: complete-manifest checksum label is missing`);
  }
  const expectedContractSha256 = sheet.getCell('B3').text.trim();
  if (!/^[0-9A-F]{64}$/.test(expectedContractSha256)) {
    fail(`${CONTRACT_SHEET}: complete-manifest checksum is missing or malformed`);
  }

  const expectedHeader = [
    'sheet',
    'kind',
    'id',
    'topic',
    'value',
    'src_table',
    'src_file',
    'src_row_num',
    'src_record_key',
    'column_name',
    'original_value',
    'extraction_sha256',
  ];
  const actualHeader = expectedHeader.map((_, index) => sheet.getRow(4).getCell(index + 1).text);
  if (actualHeader.some((value, index) => value !== expectedHeader[index])) {
    fail(`${CONTRACT_SHEET}: identity header is not the ${WORKBOOK_FORMAT} header`);
  }

  const rows: ContractRow[] = [];
  const identities = new Set<string>();
  for (let n = 5; n <= sheet.rowCount; n += 1) {
    const row = sheet.getRow(n);
    if (row.values.length === 0) continue;
    const kind = row.getCell(2).text as Kind;
    if (kind !== 'review_value' && kind !== 'finding')
      fail(`${CONTRACT_SHEET} row ${n}: invalid kind`);
    const entry: ContractRow = {
      sheet: row.getCell(1).text,
      kind,
      workbookId: positiveId(row.getCell(3).value, `${CONTRACT_SHEET} row ${n}`),
      topic: row.getCell(4).text,
      value: contractNullable(row.getCell(5).value, `${CONTRACT_SHEET} row ${n}`),
      srcTable: contractNullable(row.getCell(6).value, `${CONTRACT_SHEET} row ${n}`),
      srcFile: contractNullable(row.getCell(7).value, `${CONTRACT_SHEET} row ${n}`),
      srcRowNum: row.getCell(8).text === '' ? null : Number(row.getCell(8).text),
      srcRecordKey: contractNullable(row.getCell(9).value, `${CONTRACT_SHEET} row ${n}`),
      columnName: contractNullable(row.getCell(10).value, `${CONTRACT_SHEET} row ${n}`),
      originalValue: contractNullable(row.getCell(11).value, `${CONTRACT_SHEET} row ${n}`),
      extractionSha256: row.getCell(12).text.trim(),
    };
    if (entry.sheet === '' || entry.topic === '')
      fail(`${CONTRACT_SHEET} row ${n}: incomplete identity`);
    if (entry.extractionSha256 !== fingerprint) {
      fail(`${CONTRACT_SHEET} row ${n}: extraction fingerprint disagrees with the workbook`);
    }
    if (kind === 'review_value' && entry.value === null) {
      fail(`${CONTRACT_SHEET} row ${n}: a review value has no value identity`);
    }
    if (
      kind === 'review_value' &&
      (entry.srcTable !== null ||
        entry.srcFile !== null ||
        entry.srcRowNum !== null ||
        entry.srcRecordKey !== null ||
        entry.columnName !== null ||
        entry.originalValue !== null)
    ) {
      fail(`${CONTRACT_SHEET} row ${n}: a review value carries finding identity fields`);
    }
    if (
      kind === 'finding' &&
      (entry.srcTable === null ||
        entry.srcTable === '' ||
        entry.srcFile === null ||
        entry.srcFile === '' ||
        entry.srcRecordKey === null ||
        entry.srcRowNum === null)
    ) {
      fail(`${CONTRACT_SHEET} row ${n}: a finding has no complete source identity`);
    }
    if (kind === 'finding' && entry.value !== null) {
      fail(`${CONTRACT_SHEET} row ${n}: a finding carries a review-value identity`);
    }
    if (kind === 'finding' && !/^[0-9a-f]{64}:[0-9]{6}$/.test(entry.srcRecordKey!)) {
      fail(`${CONTRACT_SHEET} row ${n}: malformed durable source identity`);
    }
    if (
      entry.srcRowNum !== null &&
      (!Number.isSafeInteger(entry.srcRowNum) || entry.srcRowNum <= 0)
    ) {
      fail(`${CONTRACT_SHEET} row ${n}: invalid source row number`);
    }
    const spec = REVIEW_SHEET_SPECS.find((candidate) => candidate.name === entry.sheet);
    if (spec === undefined || spec.kind !== entry.kind || !spec.topics.includes(entry.topic)) {
      fail(
        `${CONTRACT_SHEET} row ${n}: sheet, kind and topic do not agree with the workbook contract`,
      );
    }
    const identity = `${entry.sheet}\u0000${entry.workbookId}`;
    if (identities.has(identity))
      fail(`${CONTRACT_SHEET}: duplicate identity for ${entry.sheet} #${entry.workbookId}`);
    identities.add(identity);
    rows.push(entry);
  }
  if (rows.length === 0) fail(`${CONTRACT_SHEET}: no review rows`);
  const actualContractSha256 = contractSha256(rows);
  if (actualContractSha256 !== expectedContractSha256) {
    fail(`${CONTRACT_SHEET}: complete-manifest checksum disagrees with its identity rows`);
  }
  return { fingerprint, rows };
}

function answerRows(
  sheet: ExcelJS.Worksheet,
  kind: Kind,
  topics: readonly string[],
): WorkbookAnswerRow[] {
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, index) => {
    headers[index] = cellText(cell.value).trim();
  });
  const idCol = headers.findIndex((header) => header === '#');
  if (idCol < 1) fail(`${sheet.name}: the # identity column is missing`);
  const answerCols = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => header?.startsWith(MARKER))
    .map(({ index }) => index);
  const expectedAnswers = kind === 'review_value' ? 3 : 2;
  if (answerCols.length !== expectedAnswers) {
    fail(`${sheet.name}: ${answerCols.length} answer columns, expected ${expectedAnswers}`);
  }

  const rows: WorkbookAnswerRow[] = [];
  for (let n = 2; n <= sheet.rowCount; n += 1) {
    const row = sheet.getRow(n);
    const rawId = cellText(row.getCell(idCol).value).trim();
    if (rawId === '') {
      let hasContent = false;
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cellText(cell.value).trim() !== '') hasContent = true;
      });
      if (hasContent) fail(`${sheet.name} row ${n}: content exists but the # identity is blank`);
      continue;
    }
    const visible: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      visible[index] = cellText(cell.value);
    });
    rows.push({
      sheet: sheet.name,
      rowNumber: n,
      workbookId: positiveId(rawId, `${sheet.name} row ${n}`),
      kind,
      topics,
      answer: cellText(row.getCell(answerCols[0]!).value).trim(),
      person: kind === 'review_value' ? cellText(row.getCell(answerCols[1]!).value).trim() : '',
      note: cellText(row.getCell(answerCols[answerCols.length - 1]!).value).trim(),
      visible,
      contract: null,
    });
  }
  return rows;
}

export function parseReviewWorkbook(
  book: ExcelJS.Workbook,
  fileSha256: string,
): ParsedReviewWorkbook {
  const contract = parseWorkbookContract(book);
  if (contract === null) {
    if (fileSha256.toUpperCase() !== LEGACY_AUTHORITATIVE_SHA256) {
      fail(
        `this workbook has no ${WORKBOOK_FORMAT} identity contract and is not the exact authoritative 23 August workbook`,
      );
    }
    const actualSheets = new Set(book.worksheets.map((sheet) => sheet.name));
    const expectedSheets = new Set([COVER_SHEET, ...LEGACY_SHEETS.keys()]);
    for (const name of expectedSheets)
      if (!actualSheets.has(name)) fail(`required sheet '${name}' is missing`);
    for (const name of actualSheets)
      if (!expectedSheets.has(name)) fail(`unexpected sheet '${name}'`);

    const rows: WorkbookAnswerRow[] = [];
    for (const [name, spec] of LEGACY_SHEETS) {
      const sheet = book.getWorksheet(name)!;
      const parsed = answerRows(sheet, spec.kind, spec.topics);
      if (parsed.length !== spec.rows)
        fail(`${name}: ${parsed.length} review rows, expected ${spec.rows}`);
      rows.push(...parsed);
    }
    const answered = rows.filter(
      (row) => row.answer !== '' || row.person !== '' || row.note !== '',
    ).length;
    if (rows.length !== 744 || answered !== 744) {
      fail(
        `authoritative workbook: ${rows.length} rows and ${answered} answers, expected 744 and 744`,
      );
    }
    return {
      format: 'legacy-authoritative',
      extractionSha256: LEGACY_EXTRACTION_SHA256,
      rows,
    };
  }

  const bySheetAndId = new Map(
    contract.rows.map((row) => [`${row.sheet}\u0000${row.workbookId}`, row]),
  );
  const expectedSheets = new Set([
    COVER_SHEET,
    CONTRACT_SHEET,
    ...REVIEW_SHEET_SPECS.map((spec) => spec.name),
  ]);
  const actualSheets = new Set(book.worksheets.map((sheet) => sheet.name));
  for (const name of expectedSheets)
    if (!actualSheets.has(name)) fail(`required sheet '${name}' is missing`);
  for (const name of actualSheets)
    if (!expectedSheets.has(name)) fail(`unexpected sheet '${name}'`);

  const rows: WorkbookAnswerRow[] = [];
  for (const spec of REVIEW_SHEET_SPECS) {
    const sheetName = spec.name;
    const contracts = contract.rows.filter((row) => row.sheet === sheetName);
    const parsed = answerRows(book.getWorksheet(sheetName)!, spec.kind, spec.topics);
    if (parsed.length !== contracts.length) {
      fail(
        `${sheetName}: ${parsed.length} visible rows, identity contract requires ${contracts.length}`,
      );
    }
    for (const row of parsed) {
      const identity = bySheetAndId.get(`${sheetName}\u0000${row.workbookId}`);
      if (identity === undefined) fail(`${sheetName} #${row.workbookId}: no identity-contract row`);
      row.contract = identity;
      bySheetAndId.delete(`${sheetName}\u0000${row.workbookId}`);
      rows.push(row);
    }
  }
  if (bySheetAndId.size !== 0)
    fail(`${bySheetAndId.size} identity-contract rows are absent from visible sheets`);
  const blank = rows.filter((row) => row.answer === '' && row.person === '' && row.note === '');
  if (blank.length > 0) {
    const first = blank[0]!;
    fail(`${first.sheet} row ${first.rowNumber}: ${blank.length} expected answer(s) are blank`);
  }
  return { format: WORKBOOK_FORMAT, extractionSha256: contract.fingerprint, rows };
}

function findingIdentity(row: {
  topic: string;
  src_table: string;
  src_record_key: string;
  column_name: string | null;
}): string {
  return `${row.topic}\u0000${row.src_table}\u0000${row.src_record_key}\u0000${row.column_name ?? '<NULL>'}`;
}

export function buildImportPlan(
  workbook: ParsedReviewWorkbook,
  reviewValues: readonly DatabaseReviewValue[],
  findings: readonly DatabaseFinding[],
): ImportPlan {
  const valuesByIdentity = new Map(
    reviewValues.map((row) => [`${row.topic}\u0000${row.value}`, row]),
  );
  const findingsByIdentity = new Map(findings.map((row) => [findingIdentity(row), row]));
  const valuesByLegacyWorkbookId = new Map(
    reviewValues
      .filter((row) => row.legacy_workbook_id !== null)
      .map((row) => [row.legacy_workbook_id!.toString(), row]),
  );
  const findingsByLegacyWorkbookId = new Map(
    findings
      .filter((row) => row.legacy_workbook_id !== null)
      .map((row) => [row.legacy_workbook_id!.toString(), row]),
  );
  if (
    new Set(reviewValues.map((row) => row.id.toString())).size !== reviewValues.length ||
    valuesByIdentity.size !== reviewValues.length
  ) {
    fail('database review values do not have unique ids and identities');
  }
  if (
    new Set(findings.map((row) => row.id.toString())).size !== findings.length ||
    findingsByIdentity.size !== findings.length
  ) {
    fail('database findings do not have unique ids and durable identities');
  }
  const legacyValueCount = reviewValues.filter((row) => row.legacy_workbook_id !== null).length;
  const legacyFindingCount = findings.filter((row) => row.legacy_workbook_id !== null).length;
  if (valuesByLegacyWorkbookId.size !== legacyValueCount) {
    fail('database review values do not have unique legacy workbook identities');
  }
  if (findingsByLegacyWorkbookId.size !== legacyFindingCount) {
    fail('database findings do not have unique legacy workbook identities');
  }
  const seen = new Set<string>();
  const planned: PlannedAnswer[] = [];
  let movedFindings = 0;

  for (const row of workbook.rows) {
    let plan: PlannedAnswer;
    if (row.kind === 'review_value') {
      const contract = row.contract;
      const shownValue = row.visible[2] ?? '';
      const found =
        contract === null
          ? valuesByLegacyWorkbookId.get(String(row.workbookId))
          : valuesByIdentity.get(`${contract.topic}\u0000${contract.value ?? ''}`);
      if (found === undefined)
        fail(`${row.sheet} #${row.workbookId}: review value is not in the database`);
      if (!row.topics.includes(found.topic))
        fail(`${row.sheet} #${row.workbookId}: topic mismatch`);
      if (contract !== null) {
        if (shownValue !== contract.value) {
          fail(
            `${row.sheet} #${row.workbookId}: visible value disagrees with the identity contract`,
          );
        }
        if (shownValue !== found.value)
          fail(`${row.sheet} #${row.workbookId}: source value changed`);
      }
      if (found.extraction_sha256 !== workbook.extractionSha256) {
        fail(
          `${row.sheet} #${row.workbookId}: database and workbook extraction fingerprints differ`,
        );
      }
      plan = {
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        kind: row.kind,
        targetId: found.id,
        topic: found.topic,
        value: found.value,
        srcTable: null,
        srcRecordKey: null,
        columnName: null,
        extractionSha256: found.extraction_sha256,
        answer: row.answer,
        person: row.person,
        note: row.note,
      };
    } else {
      const contract = row.contract;
      const shownTable = row.visible[2] ?? '';
      const shownRow = Number(row.visible[3] ?? '');
      const shownColumn = (row.visible[4] ?? '') || null;
      const shownValue = row.visible[5] ?? '';
      const found =
        contract === null
          ? findingsByLegacyWorkbookId.get(String(row.workbookId))
          : findingsByIdentity.get(
              findingIdentity({
                topic: contract.topic,
                src_table: contract.srcTable ?? '',
                src_record_key: contract.srcRecordKey ?? '',
                column_name: contract.columnName,
              }),
            );
      if (found === undefined)
        fail(`${row.sheet} #${row.workbookId}: durable finding identity is not in the database`);
      if (!row.topics.includes(found.topic))
        fail(`${row.sheet} #${row.workbookId}: finding topic mismatch`);
      const expectedDisplay = found.original_value === null ? NULL_DISPLAY : found.original_value;
      if (
        contract !== null &&
        (shownTable !== contract.srcTable ||
          shownRow !== contract.srcRowNum ||
          shownColumn !== contract.columnName ||
          shownValue !== (contract.originalValue === null ? NULL_DISPLAY : contract.originalValue))
      ) {
        fail(
          `${row.sheet} #${row.workbookId}: visible source description disagrees with the identity contract`,
        );
      }
      if (contract !== null) {
        if (
          shownTable !== found.src_table ||
          shownColumn !== found.column_name ||
          shownValue !== expectedDisplay
        ) {
          fail(`${row.sheet} #${row.workbookId}: visible source description changed`);
        }
        if (contract.originalValue !== found.original_value) {
          fail(
            `${row.sheet} #${row.workbookId}: source value no longer matches its durable identity`,
          );
        }
      }
      if (found.extraction_sha256 !== workbook.extractionSha256) {
        fail(
          `${row.sheet} #${row.workbookId}: database and workbook extraction fingerprints differ`,
        );
      }
      if (found.id !== BigInt(row.workbookId)) movedFindings += 1;
      plan = {
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        kind: row.kind,
        targetId: found.id,
        topic: found.topic,
        value: null,
        srcTable: found.src_table,
        srcRecordKey: found.src_record_key,
        columnName: found.column_name,
        extractionSha256: found.extraction_sha256,
        answer: row.answer,
        person: '',
        note: row.note,
      };
    }
    if (plan.answer === '') {
      fail(`${row.sheet} #${row.workbookId}: the required answer is blank`);
    }
    if (
      plan.kind === 'review_value' &&
      plan.topic !== 'open_question' &&
      !PERSON_ANSWERS.has(plan.answer)
    ) {
      fail(`${row.sheet} #${row.workbookId}: ${JSON.stringify(plan.answer)} is not a valid answer`);
    }
    if (
      plan.kind === 'review_value' &&
      plan.person !== '' &&
      plan.answer !== 'person' &&
      plan.answer !== 'split'
    ) {
      fail(`${row.sheet} #${row.workbookId}: a person is named for answer ${plan.answer}`);
    }
    const target = `${plan.kind}\u0000${plan.targetId}`;
    if (seen.has(target)) fail(`${row.sheet} #${row.workbookId}: duplicate answer target`);
    seen.add(target);
    planned.push(plan);
  }

  const expectedTargets = reviewValues.length + findings.length;
  if (workbook.format === WORKBOOK_FORMAT && seen.size !== expectedTargets) {
    fail(
      `workbook accounts for ${seen.size} database review rows, but ${expectedTargets} are expected`,
    );
  }

  const answeredRows = planned.filter(
    (row) => row.answer !== '' || row.person !== '' || row.note !== '',
  );
  if (answeredRows.length !== planned.length) {
    fail(`workbook has ${planned.length - answeredRows.length} expected answer(s) left blank`);
  }
  const incomplete = answeredRows.filter(
    (row) =>
      row.kind === 'review_value' &&
      (row.answer === 'person' || row.answer === 'split') &&
      row.person === '',
  );
  return {
    rows: answeredRows,
    totalRows: planned.length,
    answered: answeredRows.length,
    blank: planned.length - answeredRows.length,
    incomplete,
    movedFindings,
  };
}
