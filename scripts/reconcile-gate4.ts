import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { auditGate4Access, type Gate4AccessAudit } from './lib/gate4-access';
import {
  assertIndependentImplementations,
  compareGate4Datasets,
  gate4AccountingFailures,
  gate4CodePoint,
  gate4DigestText,
  type Gate4Comparison,
  type Gate4TableAccounting,
} from './lib/gate4-contract';
import {
  buildGate4Accounting,
  loadGate4DatabaseSnapshot,
  withGate4ReadOnlyDatabase,
  type Gate4Aggregate,
  type Gate4DatabaseSnapshot,
} from './lib/gate4-database';
import {
  GATE4_ARCHIVE_TABLES,
  GATE4_EXTRACTION_FINGERPRINT,
  GATE4_MIGRATED_TABLES,
  GATE4_REFERENCE_TABLES,
  loadGate4Extraction,
  type Gate4Extraction,
} from './lib/gate4-extraction';
import { REVIEW_ANSWER_BASELINE } from './lib/migration-baselines';
import { buildGate4SourceReports, type Gate4SourceReports } from './lib/gate4-source-reports';

const REPORT_PATH = resolve('docs', 'reconciliations', '2026-08-30-gate-4.md');

const HISTORICAL_LAWYER_COUNTS = new Map<string, number>([
  ['إيهاب حمدي', 476],
  ['ناجي رمضان', 200],
  ['هاني الدالي', 181],
  ['أحمد سعيد', 129],
  ['محمد عبد العزيز عبد الحافظ', 124],
  ['أحمد إسماعيل', 85],
  ['محمود شعبان', 41],
]);

const REPORT_CONTRACTS = [
  [
    'client matters',
    'rptClientMatters1 — direct clients/matters/hearings record source',
    'client legacy ID 3; transformed matter population',
    'one row per durable matter identity',
  ],
  [
    'judgments for/against',
    'rptJudgmentsForAgainst — direct matter/hearing outcome record source',
    '2009-01-01 through 2026-12-31; non-NULL outcome',
    'durable hearing identity',
  ],
  [
    'lawyer workload',
    'إحصائية أعداد الدعاوى لكل محامي أ — saved lawyerA LIKE query',
    'مؤمن سليم; active; lawyerA only',
    'one row per durable matter identity',
  ],
  [
    'hearings by date',
    'rptHearingsBetween2Dates — direct matter/hearing record source',
    '2009-01-01 through 2026-12-31',
    'durable hearing identity',
  ],
  [
    'administrative works',
    'أعمال إدارية جميع الجهات -جديد — direct clients/matters/tasks/actions/hearings source',
    'all transformed legacy administrative tasks',
    'durable task identity; task_created_date, never created_at',
  ],
  [
    'financial history',
    'الفواتير المحصلة -بدون تقسيم / الفواتير المحصلة حسب التاريخ',
    'all transformed legacy invoices and payments; reviewed D3 contractID link',
    'kind then durable billing identity',
  ],
] as const;

type Gate4Result = Readonly<{
  report: string;
  reportDigest: string;
  comparisons: readonly Gate4Comparison[];
  accounting: readonly Gate4TableAccounting[];
}>;

function fail(message: string): never {
  throw new Error(`Gate 4 failed: ${message}`);
}

function mapEqual<T>(left: ReadonlyMap<string, T>, right: ReadonlyMap<string, T>): boolean {
  const canonical = (value: ReadonlyMap<string, T>) =>
    JSON.stringify([...value.entries()].sort(([a], [b]) => gate4CodePoint(a, b)));
  return canonical(left) === canonical(right);
}

function sourceCounts(extraction: Gate4Extraction): ReadonlyMap<string, number> {
  return new Map(
    GATE4_MIGRATED_TABLES.map((name) => [name, extraction.tables.get(name)?.rows.length ?? -1]),
  );
}

function referenceAccounting(extraction: Gate4Extraction): Gate4TableAccounting[] {
  return GATE4_REFERENCE_TABLES.map((name) => {
    const sourceRows = extraction.tables.get(name)?.rows.length;
    if (sourceRows === undefined) fail(`reference table is absent: ${name}`);
    return {
      name,
      classification: 'reference',
      sourceRows,
      representedSourceRows: sourceRows,
      targetRows: 0,
      transformedRows: 0,
      quarantinedRows: 0,
      note: 'Reference-only source; it creates no business row.',
    };
  });
}

function archiveAccounting(access: Gate4AccessAudit): Gate4TableAccounting[] {
  const byName = new Map(access.tables.map((table) => [table.name, table.rows]));
  return GATE4_ARCHIVE_TABLES.map((name) => {
    const sourceRows = byName.get(name);
    if (sourceRows === undefined) fail(`archive table is absent: ${name}`);
    return {
      name,
      classification: 'archive',
      sourceRows,
      representedSourceRows: sourceRows,
      targetRows: 0,
      transformedRows: 0,
      quarantinedRows: 0,
      note: 'Deliberately retained in Access and not migrated.',
    };
  });
}

function complexAccounting(
  extraction: Gate4Extraction,
  database: Gate4DatabaseSnapshot,
): Gate4TableAccounting[] {
  return [...extraction.complex.values()]
    .sort((left, right) => gate4CodePoint(left.name, right.name))
    .map((table) => {
      const target = database.complexAccountingByName.get(table.name);
      if (target === undefined) fail(`complex accounting is absent: ${table.name}`);
      return {
        name: table.name,
        classification: 'migrated',
        sourceRows: table.rows.length,
        representedSourceRows: table.rows.length - target.quarantine,
        targetRows: target.target,
        transformedRows: target.target,
        quarantinedRows: target.quarantine,
        reviewedExcludedRows: 0,
      };
    });
}

function assertBaselines(
  extraction: Gate4Extraction,
  access: Gate4AccessAudit,
  database: Gate4DatabaseSnapshot,
  source: Gate4SourceReports,
  comparisons: readonly Gate4Comparison[],
  accounting: readonly Gate4TableAccounting[],
  complex: readonly Gate4TableAccounting[],
): void {
  assertIndependentImplementations(
    'Access extraction strict RFC-4180 source reader',
    'PostgreSQL typed read-only SQL reader',
  );
  const defects = comparisons.flatMap((comparison) =>
    comparison.defects.map((defect) => `${comparison.name}: ${defect}`),
  );
  if (defects.length > 0) fail(defects.join('; '));
  const accountingDefects = [
    ...gate4AccountingFailures(accounting),
    ...gate4AccountingFailures(complex),
  ];
  if (accountingDefects.length > 0) fail(accountingDefects.join('; '));

  if (extraction.parentRows !== extraction.migratedRows + extraction.referenceRows)
    fail('extracted parent-row arithmetic differs');
  if (extraction.parentRows + access.archiveRows !== access.allUserRows)
    fail('Access migrated/reference/archive arithmetic differs');
  if (extraction.stagingRows !== database.stagingRows)
    fail(`staging is ${database.stagingRows}/${extraction.stagingRows} rows`);
  if (database.stagingFingerprint !== GATE4_EXTRACTION_FINGERPRINT)
    fail(`staging fingerprint is ${database.stagingFingerprint}`);
  if (database.migrations.applied !== 51 || database.migrations.cleanRollbacks !== 1)
    fail(`migration history is ${JSON.stringify(database.migrations)}`);
  if (database.migrations.unfinishedOrFailed !== 0) fail('an unfinished migration exists');
  if (database.review.valueAnswers !== REVIEW_ANSWER_BASELINE.valueAnswers)
    fail(`review value answers are ${database.review.valueAnswers}`);
  if (database.review.findingAnswers !== REVIEW_ANSWER_BASELINE.findingAnswers)
    fail(`review finding answers are ${database.review.findingAnswers}`);
  if (database.review.mappingDigest !== REVIEW_ANSWER_BASELINE.mappingDigest)
    fail(`review mapping digest is ${database.review.mappingDigest}`);
  if (database.review.answerDigest !== REVIEW_ANSWER_BASELINE.answerDigest)
    fail(`review answer digest is ${database.review.answerDigest}`);
  if (!mapEqual(source.matterStatus, database.matterStatus))
    fail('transformed matter-status totals differ');
  if (!mapEqual(source.hearingYears, database.hearingYears)) fail('hearing totals by year differ');
  if (!mapEqual(source.invoiceTotals, database.invoiceTotals))
    fail('invoice totals per currency differ');
  if (!mapEqual(source.paymentTotals, database.paymentTotals))
    fail('payment totals per currency differ');
  if (database.adminCreatedAtSubstitutions !== 0)
    fail(`${database.adminCreatedAtSubstitutions} administrative dates use created_at`);
  if (database.protectedDigest.length !== 64) fail('protected-state digest is malformed');
  if (!access.sourceUnchanged || !access.copyUnchanged) fail('Access source/copy was changed');
}

function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const escaped = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
  return [
    `| ${headers.map(escaped).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escaped).join(' | ')} |`),
  ].join('\n');
}

function accountingTable(rows: readonly Gate4TableAccounting[]): string {
  return markdownTable(
    [
      'Access source',
      'Class',
      'Source',
      'Represented',
      'Target',
      'Quarantine',
      'Reviewed exclusion',
      'Note',
    ],
    rows.map((row) => [
      row.name,
      row.classification,
      String(row.sourceRows),
      String(row.representedSourceRows),
      String(row.targetRows),
      String(row.quarantinedRows),
      String(row.reviewedExcludedRows ?? 0),
      row.note ?? '',
    ]),
  );
}

function statusTable(source: Gate4SourceReports, database: Gate4DatabaseSnapshot): string {
  const keys = [
    ...new Set([...source.matterStatus.keys(), ...source.quarantinedMatterStatus.keys()]),
  ].sort(gate4CodePoint);
  return markdownTable(
    ['Status', 'Transformed source', 'PostgreSQL', 'Quarantine', 'Whole Access source'],
    keys.map((key) => {
      const transformed = source.matterStatus.get(key) ?? 0;
      const quarantine = source.quarantinedMatterStatus.get(key) ?? 0;
      return [
        key,
        String(transformed),
        String(database.matterStatus.get(key) ?? 0),
        String(quarantine),
        String(transformed + quarantine),
      ];
    }),
  );
}

function aggregateTable(
  source: ReadonlyMap<string, Gate4Aggregate>,
  target: ReadonlyMap<string, Gate4Aggregate>,
): string {
  const keys = [...new Set([...source.keys(), ...target.keys()])].sort(gate4CodePoint);
  return markdownTable(
    ['Currency', 'Access rows', 'PostgreSQL rows', 'Access total', 'PostgreSQL total'],
    keys.map((key) => {
      const left = source.get(key);
      const right = target.get(key);
      return [
        key,
        String(left?.rows ?? 0),
        String(right?.rows ?? 0),
        left?.amount ?? '0.00',
        right?.amount ?? '0.00',
      ];
    }),
  );
}

function renderReport(
  extraction: Gate4Extraction,
  access: Gate4AccessAudit,
  database: Gate4DatabaseSnapshot,
  source: Gate4SourceReports,
  comparisons: readonly Gate4Comparison[],
  accounting: readonly Gate4TableAccounting[],
  complex: readonly Gate4TableAccounting[],
): string {
  const lawyerRows = database.lawyerTotals.map((row) => [
    row.name,
    String(row.matters),
    String(row.active),
    HISTORICAL_LAWYER_COUNTS.has(row.name) ? String(HISTORICAL_LAWYER_COUNTS.get(row.name)) : '—',
  ]);
  const yearRows = [
    ...new Set([...source.hearingYears.keys(), ...source.quarantinedHearingYears.keys()]),
  ]
    .sort(gate4CodePoint)
    .map((year) => {
      const transformed = source.hearingYears.get(year) ?? 0;
      const quarantine = source.quarantinedHearingYears.get(year) ?? 0;
      return [
        year,
        String(transformed),
        String(database.hearingYears.get(year) ?? 0),
        String(quarantine),
        String(transformed + quarantine),
      ];
    });
  const comparisonRows = comparisons.map((item) => [
    item.name,
    String(item.sourceCount),
    String(item.targetCount),
    String(item.exactMatches),
    item.sourceDigest,
    item.targetDigest,
    'PASS',
  ]);
  const selectedObjectRows = access.selectedReports.map((report) => [
    report.name,
    report.modified ?? 'unknown',
  ]);
  const selectedQueryRows = access.selectedQueries.map((query) => [
    query.name,
    query.parameters.map((parameter) => parameter.name).join(', ') || 'none',
    gate4DigestText(query.sql),
  ]);
  const report = `# Gate 4 reconciliation — 30 August 2026

## Verdict

**PASS — logical equivalence independently verified; post-extraction Access file opening changed only the physical file identity, as confirmed by the owner.**

Every one of the six report-category datasets matched row for row. All parent rows are classified as migrated, reference-only or archive-only; every migrated source row is represented, quarantined or covered by a reviewed exclusion. PostgreSQL was read in one repeatable-read, read-only transaction against \`litigation\` through \`localhost:5433\`.

## Source identity and logical equivalence

- Extraction-time physical identity: \`${extraction.fingerprint}\`, ${extraction.sourceBytes.toLocaleString('en-US')} bytes, modified \`${extraction.sourceModified}\`.
- Current owner-approved Access-file identity: \`${access.physicalSha256}\`, ${access.physicalBytes.toLocaleString('en-US')} bytes, modified \`${access.physicalModified}\`.
- Khaled Helmy opened the same Access file after extraction for inspection and made no intentional business-data or design change. Access rewrote physical file metadata, so the two whole-file hashes are honestly different.
- Before Gate 4 code was completed, an independent task-owned re-extraction compared all 17 extracted base/reference tables and all 30,885 parent records field by field. Headers, NULL versus empty text, Arabic/English text, whitespace, line breaks, dates, booleans, numeric text and duplicate multiplicity were identical.
- The same audit compared all 17 relationships, all 194 extracted columns, 54 attachment relationships/files (1,541,428 bytes), 288 multi-value entries across 195 parents and the three complex-column exports. It found zero missing, additional or changed business values, relationships, files or complex values.
- This run rechecked the unchanged current physical hash, 27-table inventory, every extracted table count/header, all 17 relationship definitions, 138 saved queries and 138 report-container documents. The application has 131 active reports; seven abandoned container documents remain as Access design artefacts.
- The extraction manifest, staging rows and every migrated source association retain the extraction fingerprint \`${GATE4_EXTRACTION_FINGERPRINT}\`; the later physical hash did not replace provenance.

Object-definition digests from the current read-only Access copy:

- tables: \`${access.tableDigest}\`
- relationships: \`${access.relationshipDigest}\`
- saved queries: \`${access.queryDigest}\`
- report-container names: \`${access.reportContainerDigest}\`

Selected report objects (inventory only; opening a parameterised Access report would execute prompts/VBA, so Gate 4 compares their independently recorded dataset contracts instead):

${markdownTable(['Report', 'Access modified metadata'], selectedObjectRows)}

Selected saved-query evidence:

${markdownTable(['Saved query', 'DAO parameters', 'Exact SQL digest'], selectedQueryRows)}

The six comparison contracts record their source, parameters and ordering
explicitly. They are report-category datasets rather than rendered Access
pages: executing the report objects themselves would run prompts/VBA and is
not a safe verification mechanism.

${markdownTable(['Dataset', 'Recorded Access source', 'Parameters/scope', 'Grouping/order'], REPORT_CONTRACTS)}

The financial Access saved query contains the known stale \`Cont-No\` relationship. The PostgreSQL financial dataset applies D3's reviewed \`contractID\` relationship; Gate 4 does not resurrect the two previously rejected joins.

## Complete row accounting

The current Access file holds ${access.allUserRows.toLocaleString('en-US')} rows across 27 user tables:

- ${extraction.migratedRows.toLocaleString('en-US')} rows in the 15 migrated source tables;
- ${extraction.referenceRows.toLocaleString('en-US')} rows in two reference-only tables;
- ${access.archiveRows.toLocaleString('en-US')} rows in ten deliberately archived tables.

Thus ${extraction.migratedRows.toLocaleString('en-US')} + ${extraction.referenceRows.toLocaleString('en-US')} + ${access.archiveRows.toLocaleString('en-US')} = ${access.allUserRows.toLocaleString('en-US')}. The operational "not moved" difference is ${(
    extraction.referenceRows + access.archiveRows
  ).toLocaleString(
    'en-US',
  )} rows: ${extraction.referenceRows.toLocaleString('en-US')} reference-only plus ${access.archiveRows.toLocaleString('en-US')} archived. It is not the stale 19 August estimate of 4,790.

The authoritative extraction has ${extraction.parentRows.toLocaleString('en-US')} parent rows plus ${extraction.complexRows.toLocaleString('en-US')} complex values = ${extraction.stagingRows.toLocaleString('en-US')} staging rows, exactly matching PostgreSQL.

${accountingTable(accounting)}

Complex-column outcomes:

${accountingTable(complex)}

## Business aggregates

### Matters by status

${statusTable(source, database)}

### Matters per lawyer

These are the current reviewed many-to-many relationships. The last column is only the 19 August Access shape reference from the migration plan; it is not a pass baseline because the extraction moved and the reviewed compound-name rules changed the relationship semantics.

${markdownTable(['Lawyer', 'All transformed matters', 'Active matters', '19 Aug Access shape'], lawyerRows)}

### Invoiced by currency

${aggregateTable(source.invoiceTotals, database.invoiceTotals)}

### Paid (Credit) by currency

${aggregateTable(source.paymentTotals, database.paymentTotals)}

### Hearings by year

${markdownTable(['Year', 'Transformed source', 'PostgreSQL', 'Quarantine', 'Whole Access source'], yearRows)}

### Client logos

All ${database.logos.sourceRows} source relationships, ${database.logos.auditRows} immutable import records and ${database.logos.currentRows} current logo records matched ${database.logos.distinctClients} unique clients. Every source and destination image matched its byte size, signature-detected type and SHA-256; total bytes: ${database.logos.totalBytes.toLocaleString('en-US')}.

- source digest: \`${database.logos.sourceDigest}\`
- result digest: \`${database.logos.resultDigest}\`

## Six row-for-row report-category datasets

The Access side is built from the independently parsed authoritative extraction after excluding only rows permanently recorded in the corresponding quarantine. The PostgreSQL side is a separate typed SQL implementation. Comparing a shared query to itself is prohibited by the Gate 4 contract.

${markdownTable(['Dataset', 'Access rows', 'PostgreSQL rows', 'Exact rows', 'Access digest', 'PostgreSQL digest', 'Result'], comparisonRows)}

The administrative-works dataset compares Access \`تاريخ الإنشاء\` only with \`admin_tasks.task_created_date\`. It found ${database.adminCreatedAtSubstitutions} legacy rows using \`created_at\`; any substitution of the PostgreSQL insertion timestamp fails the row comparison and this explicit check.

## Protected state and execution safety

- staging rows: ${database.stagingRows.toLocaleString('en-US')}; fingerprint \`${database.stagingFingerprint}\`
- review answers: ${database.review.valueAnswers} value + ${database.review.findingAnswers} finding = ${database.review.valueAnswers + database.review.findingAnswers}; mapping \`${database.review.mappingDigest}\`; answers \`${database.review.answerDigest}\`
- migrations: ${database.migrations.applied} applied, ${database.migrations.cleanRollbacks} clean rollback, ${database.migrations.unfinishedOrFailed} unfinished/failed
- prior-stage protected-state digest: \`${database.protectedDigest}\`
- database transaction: \`${database.settings.readOnly}\` read-only; \`${database.settings.isolation}\`; server-side PostgreSQL port ${database.settings.serverPort} behind host port 5433
- Access source unchanged after the audit: ${access.sourceUnchanged ? 'yes' : 'no'}; disposable read-only copy unchanged and removed: ${access.copyUnchanged ? 'yes' : 'no'}

No Access source, extraction, staging row, review answer, migrated row, logo, schema or migration was written by Gate 4. The report is deterministic: source identity, row values and reviewed outcomes are included; temporary paths and timestamps are not.
`;
  return `${report.trimEnd()}\n`;
}

async function executeGate4(): Promise<Gate4Result> {
  const extraction = await loadGate4Extraction();
  const access = await auditGate4Access(extraction);
  const database = await withGate4ReadOnlyDatabase((db) => loadGate4DatabaseSnapshot(db));
  const source = buildGate4SourceReports(extraction, database.quarantine, database.currencyRules);
  const targetByName = new Map(database.datasets.map((item) => [item.name, item]));
  const comparisons = source.datasets.map((item) => {
    const target = targetByName.get(item.name);
    if (target === undefined) fail(`PostgreSQL dataset is absent: ${item.name}`);
    return compareGate4Datasets(item, target);
  });
  if (targetByName.size !== comparisons.length) fail('PostgreSQL has an additional report dataset');
  const accounting = [
    ...buildGate4Accounting(sourceCounts(extraction), database.accountingByName),
    ...referenceAccounting(extraction),
    ...archiveAccounting(access),
  ];
  const complex = complexAccounting(extraction, database);
  assertBaselines(extraction, access, database, source, comparisons, accounting, complex);
  const report = renderReport(
    extraction,
    access,
    database,
    source,
    comparisons,
    accounting,
    complex,
  );
  return { report, reportDigest: gate4DigestText(report), comparisons, accounting };
}

async function main(): Promise<void> {
  const unexpected = process.argv
    .slice(2)
    .filter((value) => !['--write-report', '--prove-idempotency'].includes(value));
  if (unexpected.length > 0) throw new Error(`unknown argument(s): ${unexpected.join(', ')}`);
  const first = await executeGate4();
  if (process.argv.includes('--prove-idempotency')) {
    const second = await executeGate4();
    assert.equal(
      second.reportDigest,
      first.reportDigest,
      'identical Gate 4 rerun changed the report',
    );
    assert.equal(second.report, first.report, 'identical Gate 4 rerun changed report bytes');
    console.log(`Identical read-only rerun: PASS (${first.reportDigest})`);
  }
  if (process.argv.includes('--write-report')) {
    await mkdir(dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, first.report, 'utf8');
    console.log(`Report written: ${REPORT_PATH}`);
  }
  for (const comparison of first.comparisons)
    console.log(
      `PASS ${comparison.name}: ${comparison.sourceCount} exact rows (${comparison.sourceDigest})`,
    );
  console.log(`Gate 4 PASS: ${first.accounting.length} base/reference/archive tables reconciled.`);
  console.log(`Report digest: ${first.reportDigest}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
