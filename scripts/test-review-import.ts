import 'dotenv/config';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { importReviewAnswers } from './lib/import-review-answers';
import {
  buildImportPlan,
  CONTRACT_SHEET,
  contractSha256,
  LEGACY_AUTHORITATIVE_SHA256,
  parseReviewWorkbook,
  REVIEW_SHEET_SPECS,
  workbookSha256,
  WORKBOOK_FORMAT,
  type ContractRow,
  type DatabaseFinding,
  type DatabaseReviewValue,
} from './lib/review-workbook-contract';
import { sourceRecordHash, sourceRecordKeys } from './lib/source-identity';

const FINGERPRINT = 'A'.repeat(64);
const KEYS = Array.from({ length: 3 }, (_, index) => `${String(index + 1).repeat(64)}:000001`);
const VALUE_SPECS = REVIEW_SHEET_SPECS.filter((spec) => spec.kind === 'review_value');
const FINDING_SPECS = REVIEW_SHEET_SPECS.filter((spec) => spec.kind === 'finding');

function identities(): ContractRow[] {
  return [
    {
      sheet: VALUE_SPECS[0]!.name,
      kind: 'review_value',
      workbookId: 1,
      topic: VALUE_SPECS[0]!.topics[0]!,
      value: 'أحمد',
      srcTable: null,
      srcFile: null,
      srcRowNum: null,
      srcRecordKey: null,
      columnName: null,
      originalValue: null,
      extractionSha256: FINGERPRINT,
    },
    {
      sheet: VALUE_SPECS[1]!.name,
      kind: 'review_value',
      workbookId: 2,
      topic: VALUE_SPECS[1]!.topics[0]!,
      value: 'سارة',
      srcTable: null,
      srcFile: null,
      srcRowNum: null,
      srcRecordKey: null,
      columnName: null,
      originalValue: null,
      extractionSha256: FINGERPRINT,
    },
    {
      sheet: VALUE_SPECS[2]!.name,
      kind: 'review_value',
      workbookId: 3,
      topic: VALUE_SPECS[2]!.topics[0]!,
      value: 'قرار؟',
      srcTable: null,
      srcFile: null,
      srcRowNum: null,
      srcRecordKey: null,
      columnName: null,
      originalValue: null,
      extractionSha256: FINGERPRINT,
    },
    {
      sheet: FINDING_SPECS[0]!.name,
      kind: 'finding',
      workbookId: 4,
      topic: FINDING_SPECS[0]!.topics[0]!,
      value: null,
      srcTable: 'خطابات الأتعاب.Matter',
      srcFile: 'tables/fee-letter-matter.csv',
      srcRowNum: 10,
      srcRecordKey: KEYS[0]!,
      columnName: 'value',
      originalValue: '1061/52ق',
      extractionSha256: FINGERPRINT,
    },
    {
      sheet: FINDING_SPECS[1]!.name,
      kind: 'finding',
      workbookId: 5,
      topic: FINDING_SPECS[1]!.topics[0]!,
      value: null,
      srcTable: 'الجلسات',
      srcFile: 'tables/hearings.csv',
      srcRowNum: 11,
      srcRecordKey: KEYS[1]!,
      columnName: 'matterID',
      originalValue: null,
      extractionSha256: FINGERPRINT,
    },
    {
      sheet: FINDING_SPECS[2]!.name,
      kind: 'finding',
      workbookId: 6,
      topic: FINDING_SPECS[2]!.topics[0]!,
      value: null,
      srcTable: 'إجراءات المهام',
      srcFile: 'tables/task-actions.csv',
      srcRowNum: 12,
      srcRecordKey: KEYS[2]!,
      columnName: 'ID_Task',
      originalValue: '',
      extractionSha256: FINGERPRINT,
    },
  ];
}

function addValueSheet(book: ExcelJS.Workbook, identity: ContractRow) {
  const sheet = book.addWorksheet(identity.sheet);
  sheet.addRow([
    '#',
    'القيمة كما هي في أكسيس',
    'kind',
    'occurrences',
    'years',
    'matters',
    'nearest',
    'confidence',
    '⬅ الإجابة',
    '⬅ الشخص',
    '⬅ ملاحظة',
  ]);
  sheet.addRow([
    identity.workbookId,
    identity.value,
    '',
    1,
    '',
    '',
    '',
    'none',
    'person',
    'أحمد كامل',
    'confirmed',
  ]);
}

function addFindingSheet(book: ExcelJS.Workbook, identity: ContractRow) {
  const sheet = book.addWorksheet(identity.sheet);
  sheet.addRow([
    '#',
    'الجدول',
    'رقم السطر',
    'العمود',
    'القيمة الأصلية',
    'ما وجدناه',
    '⬅ الإجابة',
    '⬅ ملاحظة',
  ]);
  sheet.addRow([
    identity.workbookId,
    identity.srcTable,
    identity.srcRowNum,
    identity.columnName,
    identity.originalValue === null ? '(فارغ / NULL)' : identity.originalValue,
    'fixture finding',
    'use source',
    'checked',
  ]);
}

function addContract(book: ExcelJS.Workbook, rows: readonly ContractRow[]) {
  const sheet = book.addWorksheet(CONTRACT_SHEET);
  sheet.state = 'veryHidden';
  sheet.addRow(['format', WORKBOOK_FORMAT]);
  sheet.addRow(['extraction_sha256', FINGERPRINT]);
  sheet.addRow(['contract_sha256', contractSha256(rows)]);
  sheet.addRow([
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
  ]);
  for (const row of rows) {
    sheet.addRow([
      row.sheet,
      row.kind,
      row.workbookId,
      row.topic,
      JSON.stringify(row.value),
      JSON.stringify(row.srcTable),
      JSON.stringify(row.srcFile),
      row.srcRowNum,
      JSON.stringify(row.srcRecordKey),
      JSON.stringify(row.columnName),
      JSON.stringify(row.originalValue),
      row.extractionSha256,
    ]);
  }
}

function fixture(): ExcelJS.Workbook {
  const rows = identities();
  const book = new ExcelJS.Workbook();
  book.addWorksheet('اقرأ أولاً');
  for (const identity of rows) {
    if (identity.kind === 'review_value') addValueSheet(book, identity);
    else addFindingSheet(book, identity);
  }
  addContract(book, rows);
  return book;
}

function database(): { values: DatabaseReviewValue[]; findings: DatabaseFinding[] } {
  const rows = identities();
  return {
    values: rows
      .filter((row) => row.kind === 'review_value')
      .map((row) => ({
        id: BigInt(row.workbookId),
        topic: row.topic,
        value: row.value!,
        extraction_sha256: row.extractionSha256,
        legacy_workbook_id: null,
      })),
    findings: rows
      .filter((row) => row.kind === 'finding')
      .map((row) => ({
        id: BigInt(row.workbookId),
        topic: row.topic,
        src_table: row.srcTable!,
        src_file: row.srcFile!,
        src_row_num: row.srcRowNum!,
        src_record_key: row.srcRecordKey!,
        column_name: row.columnName,
        original_value: row.originalValue,
        extraction_sha256: row.extractionSha256,
        legacy_workbook_id: null,
      })),
  };
}

function expectFailure(name: string, action: () => unknown, pattern: RegExp) {
  assert.throws(action, pattern, name);
  console.log(`  ok    ${name}`);
}

function parsedFixture() {
  return parseReviewWorkbook(fixture(), '0'.repeat(64));
}

function refreshContractChecksum(book: ExcelJS.Workbook, rows: readonly ContractRow[]) {
  book.getWorksheet(CONTRACT_SHEET)!.getCell('B3').value = contractSha256(rows);
}

function quoteIdentifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/);
  return `"${value}"`;
}

async function transactionRollbackFixture(parsed: ReturnType<typeof parsedFixture>) {
  const projectUrlText = process.env['DATABASE_URL'];
  assert.ok(projectUrlText, 'DATABASE_URL is required for the isolated transaction fixture');
  const databaseName = `review_import_fixture_${process.pid}_${Date.now()}`;
  const adminUrl = new URL(projectUrlText);
  adminUrl.pathname = '/postgres';
  const fixtureUrl = new URL(projectUrlText);
  fixtureUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  let prisma: PrismaClient | undefined;

  await admin.connect();
  try {
    const existing = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM pg_database WHERE datname = $1',
      [databaseName],
    );
    assert.equal(existing.rows[0]?.count, '0', 'fixture database name already exists');
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    created = true;

    const setup = new Client({ connectionString: fixtureUrl.toString() });
    await setup.connect();
    try {
      await setup.query(`
        CREATE SCHEMA quarantine;
        CREATE TABLE quarantine.review_value (
          id bigint PRIMARY KEY, topic text NOT NULL, value text NOT NULL,
          extraction_sha256 text NOT NULL, legacy_workbook_id bigint,
          firm_answer text, firm_person text,
          firm_note text, answered_at timestamptz, answered_by text
        );
        CREATE TABLE quarantine.finding (
          id bigint PRIMARY KEY, topic text NOT NULL, severity text NOT NULL,
          src_table text NOT NULL, src_file text NOT NULL, src_row_num integer NOT NULL,
          src_record_key text NOT NULL, column_name text, original_value text,
          extraction_sha256 text NOT NULL, legacy_workbook_id bigint,
          firm_answer text, firm_note text,
          answered_at timestamptz, answered_by text
        );
      `);
      const data = database();
      for (const row of data.values) {
        await setup.query(
          'INSERT INTO quarantine.review_value (id, topic, value, extraction_sha256) VALUES ($1,$2,$3,$4)',
          [row.id.toString(), row.topic, row.value, row.extraction_sha256],
        );
      }
      for (const row of data.findings) {
        await setup.query(
          `INSERT INTO quarantine.finding
             (id, topic, severity, src_table, src_file, src_row_num, src_record_key,
              column_name, original_value, extraction_sha256)
           VALUES ($1,$2,'review',$3,$4,$5,$6,$7,$8,$9)`,
          [
            row.id.toString(),
            row.topic,
            row.src_table,
            row.src_file,
            row.src_row_num,
            row.src_record_key,
            row.column_name,
            row.original_value,
            row.extraction_sha256,
          ],
        );
      }
      await setup.query(`
        CREATE FUNCTION quarantine.fail_late_import() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture forced late import failure'; END $$;
        CREATE TRIGGER fail_late_import BEFORE UPDATE ON quarantine.finding
        FOR EACH ROW EXECUTE FUNCTION quarantine.fail_late_import();
      `);
    } finally {
      await setup.end();
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: fixtureUrl.toString() }),
      log: ['error'],
    });
    const dryRun = await importReviewAnswers(prisma, parsed, 'transaction fixture', {
      dryRun: true,
    });
    assert.equal(dryRun.answered, 6);
    await assert.rejects(
      importReviewAnswers(prisma, parsed, 'transaction fixture'),
      /fixture forced late import failure/,
    );
    await prisma.$disconnect();
    prisma = undefined;

    const verify = new Client({ connectionString: fixtureUrl.toString() });
    await verify.connect();
    try {
      const changed = await verify.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM (
          SELECT id FROM quarantine.review_value
           WHERE firm_answer IS NOT NULL OR firm_person IS NOT NULL OR firm_note IS NOT NULL
              OR answered_at IS NOT NULL OR answered_by IS NOT NULL
          UNION ALL
          SELECT id FROM quarantine.finding
           WHERE firm_answer IS NOT NULL OR firm_note IS NOT NULL
              OR answered_at IS NOT NULL OR answered_by IS NOT NULL
        ) changed`);
      assert.equal(changed.rows[0]?.count, '0', 'a failed import left partial answers behind');

      // Rule 14: prove the database holds only the two tables created by this
      // fixture before the fixture database itself is dropped.
      const userTables = await verify.query<{ table_schema: string; table_name: string }>(`
        SELECT table_schema, table_name FROM information_schema.tables
         WHERE table_type = 'BASE TABLE'
           AND table_schema NOT IN ('pg_catalog', 'information_schema')
         ORDER BY table_schema, table_name`);
      assert.deepEqual(userTables.rows, [
        { table_schema: 'quarantine', table_name: 'finding' },
        { table_schema: 'quarantine', table_name: 'review_value' },
      ]);
    } finally {
      await verify.end();
    }
    console.log('  ok    a late database failure rolls back every earlier answer');
  } finally {
    if (prisma !== undefined) await prisma.$disconnect();
    if (created) {
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [databaseName],
      );
      await admin.query(`DROP DATABASE ${quoteIdentifier(databaseName)}`);
    }
    await admin.end();
  }
}

async function main() {
  let book = fixture();
  let parsed = parseReviewWorkbook(book, '0'.repeat(64));
  let data = database();
  let plan = buildImportPlan(parsed, data.values, data.findings);
  assert.equal(plan.totalRows, 6);
  assert.equal(plan.answered, 6);
  console.log('  ok    complete v2 workbook produces a complete import plan');

  book = fixture();
  const withoutFirstFinding = identities().filter((row) => row.sheet !== FINDING_SPECS[0]!.name);
  book.getWorksheet(FINDING_SPECS[0]!.name)!.spliceRows(2, 1);
  book.getWorksheet(CONTRACT_SHEET)!.spliceRows(8, 1);
  refreshContractChecksum(book, withoutFirstFinding);
  parsed = parseReviewWorkbook(book, '0'.repeat(64));
  data = database();
  data.findings.splice(0, 1);
  plan = buildImportPlan(parsed, data.values, data.findings);
  assert.equal(plan.answered, 5);
  console.log('  ok    a required sheet may be empty only when no database answer is expected');

  parsed = parsedFixture();
  data = database();
  data.findings[0]!.src_row_num = 99;
  data.findings[0]!.src_file = 'tables/reordered.csv';
  plan = buildImportPlan(parsed, data.values, data.findings);
  assert.equal(plan.answered, 6);
  console.log('  ok    reordered source rows match by durable identity, not position or filename');

  const legacyLike = {
    ...parsed,
    format: 'legacy-authoritative' as const,
    rows: parsed.rows.map((row) => ({ ...row, contract: null })),
  };
  data = database();
  data.values.forEach((row) => {
    row.legacy_workbook_id = row.id;
  });
  data.findings.forEach((row) => {
    row.legacy_workbook_id = row.id;
  });
  data.values.forEach((row) => {
    row.id += 100n;
  });
  data.findings.forEach((row) => {
    row.id += 100n;
  });
  data.values.push({
    id: 999n,
    topic: 'open_question',
    value: 'later question',
    extraction_sha256: FINGERPRINT,
    legacy_workbook_id: null,
  });
  plan = buildImportPlan(legacyLike, data.values, data.findings);
  assert.equal(plan.answered, 6);
  assert.equal(plan.movedFindings, 3);
  console.log('  ok    exact legacy identities survive moved ids and later database questions');

  data = database();
  data.values.forEach((row) => {
    row.legacy_workbook_id = row.id;
  });
  data.findings.forEach((row) => {
    row.legacy_workbook_id = row.id;
  });
  data.values[0]!.legacy_workbook_id = 999n;
  expectFailure(
    'incorrect legacy workbook identity is refused',
    () => buildImportPlan(legacyLike, data.values, data.findings),
    /review value is not in the database/,
  );

  data = database();
  data.findings[0]!.original_value = 'different value';
  expectFailure(
    'changed source value cannot inherit an answer',
    () => buildImportPlan(parsed, data.values, data.findings),
    /visible source description changed/,
  );

  data = database();
  data.findings[0]!.src_record_key = `${'9'.repeat(64)}:000001`;
  expectFailure(
    'mismatched durable identity is refused',
    () => buildImportPlan(parsed, data.values, data.findings),
    /durable finding identity is not in the database/,
  );

  data = database();
  data.values[0]!.value = 'أحمد آخر';
  expectFailure(
    'changed review value is refused',
    () => buildImportPlan(parsed, data.values, data.findings),
    /review value is not in the database/,
  );

  data = database();
  data.values[0]!.extraction_sha256 = 'B'.repeat(64);
  expectFailure(
    'mismatched extraction fingerprint is refused',
    () => buildImportPlan(parsed, data.values, data.findings),
    /fingerprints differ/,
  );

  book = fixture();
  book.removeWorksheet(book.getWorksheet(FINDING_SPECS[0]!.name)!.id);
  expectFailure(
    'missing answer sheet is refused',
    () => parseReviewWorkbook(book, '0'.repeat(64)),
    /required sheet/,
  );

  book = fixture();
  const shortened = identities().filter((row) => row.sheet !== FINDING_SPECS[0]!.name);
  book.removeWorksheet(book.getWorksheet(FINDING_SPECS[0]!.name)!.id);
  book.getWorksheet(CONTRACT_SHEET)!.spliceRows(8, 1);
  refreshContractChecksum(book, shortened);
  expectFailure(
    'a sheet removed together with its hidden identities is still refused',
    () => parseReviewWorkbook(book, '0'.repeat(64)),
    /required sheet/,
  );

  book = fixture();
  book.getWorksheet(FINDING_SPECS[0]!.name)!.spliceRows(2, 1);
  expectFailure(
    'partial answer sheet is refused',
    () => parseReviewWorkbook(book, '0'.repeat(64)),
    /visible rows, identity contract requires/,
  );

  book = fixture();
  const blankSheet = book.getWorksheet(VALUE_SPECS[0]!.name)!;
  blankSheet.getCell('I2').value = null;
  blankSheet.getCell('J2').value = null;
  blankSheet.getCell('K2').value = null;
  expectFailure(
    'missing answer is refused before any import',
    () => parseReviewWorkbook(book, '0'.repeat(64)),
    /expected answer\(s\) are blank/,
  );

  book = fixture();
  const noteOnlySheet = book.getWorksheet(VALUE_SPECS[0]!.name)!;
  noteOnlySheet.getCell('I2').value = null;
  noteOnlySheet.getCell('J2').value = null;
  noteOnlySheet.getCell('K2').value = 'a note is not an answer';
  parsed = parseReviewWorkbook(book, '0'.repeat(64));
  data = database();
  expectFailure(
    'a note without the required answer is refused',
    () => buildImportPlan(parsed, data.values, data.findings),
    /required answer is blank/,
  );

  book = fixture();
  book.getWorksheet(CONTRACT_SHEET)!.getCell('I8').value = JSON.stringify(
    `${'8'.repeat(64)}:000001`,
  );
  expectFailure(
    'identity rows cannot change without invalidating the complete manifest',
    () => parseReviewWorkbook(book, '0'.repeat(64)),
    /complete-manifest checksum disagrees/,
  );

  book = fixture();
  book.getWorksheet(CONTRACT_SHEET)!.getCell('L5').value = 'B'.repeat(64);
  expectFailure(
    'one row carrying another extraction fingerprint is refused',
    () => parseReviewWorkbook(book, '0'.repeat(64)),
    /fingerprint disagrees/,
  );

  book = fixture();
  book.getWorksheet(VALUE_SPECS[0]!.name)!.getCell('A2').value = null;
  expectFailure(
    'answer content with a missing row id is refused',
    () => parseReviewWorkbook(book, '0'.repeat(64)),
    /content exists but the # identity is blank/,
  );

  book = fixture();
  book.addWorksheet('unexpected');
  expectFailure(
    'unexpected sheet is refused',
    () => parseReviewWorkbook(book, '0'.repeat(64)),
    /unexpected sheet/,
  );

  book = fixture();
  book.getWorksheet(FINDING_SPECS[0]!.name)!.getCell('C2').value = 999;
  parsed = parseReviewWorkbook(book, '0'.repeat(64));
  data = database();
  expectFailure(
    'visible row position must agree with the hidden trace',
    () => buildImportPlan(parsed, data.values, data.findings),
    /visible source description disagrees/,
  );

  parsed = parsedFixture();
  data = database();
  data.values.push({
    id: 99n,
    topic: 'open_question',
    value: 'new expected question',
    extraction_sha256: FINGERPRINT,
    legacy_workbook_id: null,
  });
  expectFailure(
    'a workbook missing a database review row is refused',
    () => buildImportPlan(parsed, data.values, data.findings),
    /database review rows, but 7 are expected/,
  );

  book = fixture();
  book.getWorksheet(CONTRACT_SHEET)!.state = 'hidden';
  expectFailure(
    'identity contract must remain very hidden',
    () => parseReviewWorkbook(book, '0'.repeat(64)),
    /not very hidden/,
  );

  assert.notEqual(
    sourceRecordHash('t', [{ text: '', quoted: false }]),
    sourceRecordHash('t', [{ text: '', quoted: true }]),
  );
  const first = { fields: [{ text: 'one', quoted: false }] };
  const second = { fields: [{ text: 'two', quoted: false }] };
  const ordered = sourceRecordKeys('t', [first, second]);
  const reordered = sourceRecordKeys('t', [second, first]);
  assert.equal(ordered[0], reordered[1]);
  assert.equal(ordered[1], reordered[0]);
  console.log('  ok    source identity keeps NULL/empty apart and survives row reordering');

  const authoritative = new ExcelJS.Workbook();
  const authoritativePath = '_migration/review/review-2026-08-23.xlsx';
  await authoritative.xlsx.readFile(authoritativePath);
  assert.equal(workbookSha256(authoritativePath), LEGACY_AUTHORITATIVE_SHA256);
  const legacy = parseReviewWorkbook(authoritative, workbookSha256(authoritativePath));
  assert.equal(legacy.rows.length, 744);
  assert.equal(legacy.rows.filter((row) => row.answer !== '').length, 744);
  console.log('  ok    exact authoritative workbook has all 744 answers');

  expectFailure(
    'an identity-less workbook with any other hash is refused',
    () => parseReviewWorkbook(authoritative, '0'.repeat(64)),
    /not the exact authoritative/,
  );

  await transactionRollbackFixture(parsedFixture());
  console.log('\ntest:review-import -- all fixture cases correct.\n');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
