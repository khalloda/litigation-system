import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Client, type ClientBase } from 'pg';
import {
  assertGate4DatabaseUrl,
  assertReadOnlySnapshot,
  gate4CodePoint,
  type Gate4Dataset,
  type Gate4Row,
  type Gate4Scalar,
  type Gate4TableAccounting,
} from './gate4-contract';
import {
  GATE4_CLIENT_LEGACY_ID,
  GATE4_FROM_DATE,
  GATE4_LAWYER_PARAMETER,
  GATE4_REPORT_FIELDS,
  GATE4_TO_DATE,
  type Gate4CurrencyRule,
  type Gate4QuarantineKeys,
} from './gate4-report-contract';
import { reconcileClientLogos, type ClientLogoReconciliation } from './client-logo-reconciliation';
import { readReviewSnapshot, type ReviewSnapshot } from './attendee-audit-plan';
import {
  asBigInt,
  MATTER_RECONCILIATION_SQL,
  matterReconciliationFailures,
  type MatterReconciliationRow,
} from './matter-reconciliation';
import { reconcileMatterRelationships } from './matter-relationship-reconciliation';
import { reconcileHearings } from './hearing-reconciliation';
import { ADMIN_TASK_CREATION_DATE_BASELINE, reconcileAdminWorks } from './admin-reconciliation';
import { reconcileBillingHistory } from './billing-reconciliation';
import { task211ProtectedState } from './task211-protected-state';
import {
  readGate4RepositoryMigrationInventory,
  reconcileGate4Migrations,
  type Gate4MigrationEvidence,
  type Gate4MigrationHistoryRow,
} from './gate4-migrations';

type QueryDatasetRow = Readonly<{ identity: string; values: (string | null)[] }>;

export type Gate4DatabaseSettings = Readonly<{
  database: string;
  readOnly: string;
  isolation: string;
  serverPort: number;
}>;

export type Gate4Aggregate = Readonly<{ rows: number; amount: string }>;

export const GATE4_PREREQUISITE_NAMES = [
  'matter',
  'matter relationships',
  'hearings',
  'administrative works',
  'billing',
] as const;

export const GATE4_BILLING_CURRENCY_RULE_DIGEST =
  '522db79859bd6240df60ee7a78f5a3e389c102970e5f6f231c4aef39f14618e8';

export function gate4BillingCurrencyRuleDigest(rows: readonly Record<string, unknown>[]): string {
  return createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex');
}

export type Gate4PrerequisiteResult = Readonly<{
  name: (typeof GATE4_PREREQUISITE_NAMES)[number];
  implementation: 'independent permanent oracle';
  defects: readonly string[];
}>;

export type Gate4PrerequisiteEvidence = Readonly<{
  results: readonly Gate4PrerequisiteResult[];
  quarantine: Gate4QuarantineKeys;
  currencyRules: readonly Gate4CurrencyRule[];
  currencyRuleDigest: string;
  adminCreatedAtSubstitutions: number;
}>;

export type Gate4DatabaseSnapshot = Readonly<{
  settings: Gate4DatabaseSettings;
  quarantine: Gate4QuarantineKeys;
  currencyRules: readonly Gate4CurrencyRule[];
  datasets: readonly Gate4Dataset[];
  accountingByName: ReadonlyMap<string, Readonly<{ target: number; quarantine: number }>>;
  complexAccountingByName: ReadonlyMap<string, Readonly<{ target: number; quarantine: number }>>;
  matterStatus: ReadonlyMap<string, number>;
  hearingYears: ReadonlyMap<string, number>;
  invoiceTotals: ReadonlyMap<string, Gate4Aggregate>;
  paymentTotals: ReadonlyMap<string, Gate4Aggregate>;
  lawyerTotals: readonly Readonly<{ name: string; matters: number; active: number }>[];
  adminCreatedAtSubstitutions: number;
  stagingRows: number;
  stagingFingerprint: string;
  review: ReviewSnapshot;
  migrations: Gate4MigrationEvidence;
  logos: ClientLogoReconciliation;
  protectedDigest: string;
  prerequisites: Gate4PrerequisiteEvidence['results'];
  currencyRuleDigest: string;
}>;

export function gate4PrerequisiteFailures(results: readonly Gate4PrerequisiteResult[]): string[] {
  const failures: string[] = [];
  for (const name of GATE4_PREREQUISITE_NAMES) {
    const matches = results.filter((result) => result.name === name);
    if (matches.length !== 1) {
      failures.push(`${name}: ${matches.length} prerequisite results`);
      continue;
    }
    const result = matches[0]!;
    if (result.implementation !== 'independent permanent oracle')
      failures.push(`${name}: prerequisite implementation is not independent`);
    failures.push(...result.defects.map((defect) => `${name}: ${defect}`));
  }
  if (results.length !== GATE4_PREREQUISITE_NAMES.length)
    failures.push(`unexpected prerequisite result count: ${results.length}`);
  return failures;
}

async function proveGate4Prerequisites(db: ClientBase): Promise<Gate4PrerequisiteEvidence> {
  const matterQuery = await db.query<MatterReconciliationRow>(MATTER_RECONCILIATION_SQL);
  if (matterQuery.rows.length !== 1)
    throw new Error(`matter prerequisite returned ${matterQuery.rows.length} rows`);
  const matter = matterQuery.rows[0]!;
  const matterDefects = matterReconciliationFailures(matter);
  if (
    asBigInt(matter.source_rows) !== 1744n ||
    asBigInt(matter.target_rows) !== 1689n ||
    asBigInt(matter.quarantine_rows) !== 55n
  )
    matterDefects.push(
      `approved partition changed: ${String(matter.source_rows)} = ${String(matter.target_rows)} + ${String(matter.quarantine_rows)}`,
    );

  const relationships = await reconcileMatterRelationships(db);
  const hearings = await reconcileHearings(db);
  const administrative = await reconcileAdminWorks(db, {
    creationDateBaseline: ADMIN_TASK_CREATION_DATE_BASELINE,
  });
  const billing = await reconcileBillingHistory(db, true);
  const results: Gate4PrerequisiteResult[] = [
    {
      name: 'matter',
      implementation: 'independent permanent oracle',
      defects: matterDefects,
    },
    {
      name: 'matter relationships',
      implementation: 'independent permanent oracle',
      defects: relationships.defects,
    },
    {
      name: 'hearings',
      implementation: 'independent permanent oracle',
      defects: hearings.defects,
    },
    {
      name: 'administrative works',
      implementation: 'independent permanent oracle',
      defects: administrative.defects,
    },
    {
      name: 'billing',
      implementation: 'independent permanent oracle',
      defects: billing.defects,
    },
  ];
  const failures = gate4PrerequisiteFailures(results);
  if (failures.length > 0)
    throw new Error(`Gate 4 permanent prerequisite failed: ${failures.join('; ')}`);

  const quarantine: Gate4QuarantineKeys = {
    matter: await keys(db, 'quarantine.matter_transform'),
    hearing: await keys(db, 'quarantine.hearing_transform'),
    adminTask: await keys(db, 'quarantine.admin_task_transform'),
    invoice: await keys(db, 'quarantine.invoice_transform'),
    payment: await keys(db, 'quarantine.payment_transform'),
  };
  const currency = await db.query<{
    field_kind: string;
    source_value: string;
    target_value: string | null;
    require_zero_amount: boolean;
    reviewed_by: string;
    reviewed_at: string;
    reviewer_note: string;
  }>(`SELECT field_kind,source_value,target_value,require_zero_amount,reviewed_by,
             reviewed_at::text,reviewer_note
        FROM migration_billing_currency_rule ORDER BY field_kind,source_value`);
  const currencyRules = currency.rows.map((row) => ({
    fieldKind: row.field_kind,
    sourceValue: row.source_value,
    targetValue: row.target_value,
    requireZeroAmount: row.require_zero_amount,
  }));
  const currencyRuleDigest = gate4BillingCurrencyRuleDigest(currency.rows);
  if (currencyRuleDigest !== GATE4_BILLING_CURRENCY_RULE_DIGEST)
    throw new Error(`reviewed billing currency-rule digest changed: ${currencyRuleDigest}`);
  return {
    results,
    quarantine,
    currencyRules,
    currencyRuleDigest,
    adminCreatedAtSubstitutions: Number(
      administrative.row['creation_date_created_at_substitution'] ?? -1,
    ),
  };
}

function dataset(
  name: string,
  fields: readonly string[],
  parameters: Readonly<Record<string, Gate4Scalar>>,
  rows: readonly QueryDatasetRow[],
): Gate4Dataset {
  const canonicalRows: Gate4Row[] = rows.map((row) => ({
    identity: row.identity,
    values: row.values,
  }));
  canonicalRows.sort((left, right) => gate4CodePoint(left.identity, right.identity));
  return { name, fields, parameters, rows: canonicalRows, ordering: ['identity'] };
}

async function queryDataset(
  db: ClientBase,
  name: string,
  fields: readonly string[],
  parameters: Readonly<Record<string, Gate4Scalar>>,
  sql: string,
  values: unknown[] = [],
): Promise<Gate4Dataset> {
  const result = await db.query<QueryDatasetRow>(sql, values);
  for (const row of result.rows) {
    if (typeof row.identity !== 'string' || !Array.isArray(row.values))
      throw new Error(`${name}: PostgreSQL returned a malformed row`);
    if (row.values.length !== fields.length)
      throw new Error(`${name}: PostgreSQL returned ${row.values.length}/${fields.length} fields`);
    if (row.values.some((value) => value !== null && typeof value !== 'string'))
      throw new Error(`${name}: PostgreSQL returned a non-text scalar`);
  }
  return dataset(name, fields, parameters, result.rows);
}

async function keys(db: ClientBase, table: string): Promise<ReadonlySet<string>> {
  if (!/^(?:quarantine\.)?[a-z_]+$/u.test(table)) throw new Error(`unsafe table name: ${table}`);
  const result = await db.query<{ src_record_key: string }>(
    `SELECT src_record_key FROM ${table} ORDER BY src_record_key`,
  );
  const output = new Set(result.rows.map((row) => row.src_record_key));
  if (output.size !== result.rows.length)
    throw new Error(`${table} has duplicate source identities`);
  return output;
}

function mapCounts(
  rows: readonly Readonly<{ key: string; rows: number }>[],
): ReadonlyMap<string, number> {
  return new Map(rows.map((row) => [row.key, row.rows]));
}

function mapAmounts(
  rows: readonly Readonly<{ currency: string; rows: number; amount: string }>[],
): ReadonlyMap<string, Gate4Aggregate> {
  return new Map(rows.map((row) => [row.currency, { rows: row.rows, amount: row.amount }]));
}

async function loadReports(db: ClientBase): Promise<readonly Gate4Dataset[]> {
  const loaders = [
    () =>
      queryDataset(
        db,
        'client matters',
        GATE4_REPORT_FIELDS.clientMatters,
        { client_legacy_id: GATE4_CLIENT_LEGACY_ID },
        `SELECT m.legacy_source_record_key identity,
              ARRAY[m.legacy_id::text,m.case_number_ar,m.subject,m.status,c.legacy_id::text,
                    m.legacy_branch_raw,m.legacy_category_raw,m.legacy_court_raw] values
         FROM matters m JOIN clients c ON c.id=m.client_id
        WHERE c.legacy_id=$1::integer AND m.legacy_source_record_key IS NOT NULL
        ORDER BY m.legacy_source_record_key`,
        [GATE4_CLIENT_LEGACY_ID],
      ),
    () =>
      queryDataset(
        db,
        'judgments for/against',
        GATE4_REPORT_FIELDS.forAgainst,
        { from: GATE4_FROM_DATE, to: GATE4_TO_DATE },
        `SELECT h.legacy_source_record_key identity,
              ARRAY[h.legacy_id::text,to_char(h.hearing_date,'YYYY-MM-DD'),m.legacy_id::text,
                    h.outcome,h.decision] values
         FROM hearings h LEFT JOIN matters m ON m.id=h.matter_id
        WHERE h.outcome IS NOT NULL AND h.hearing_date BETWEEN $1::date AND $2::date
          AND h.legacy_source_record_key IS NOT NULL
        ORDER BY h.legacy_source_record_key`,
        [GATE4_FROM_DATE, GATE4_TO_DATE],
      ),
    () =>
      queryDataset(
        db,
        'lawyer workload',
        GATE4_REPORT_FIELDS.lawyerWorkload,
        { lawyer: GATE4_LAWYER_PARAMETER, status: 'سارية', source_field: 'lawyerA' },
        `SELECT m.legacy_source_record_key identity,
              ARRAY[m.legacy_id::text,m.case_number_ar,m.status,ml.legacy_source] values
         FROM matter_lawyers ml
         JOIN matters m ON m.id=ml.matter_id
         JOIN people p ON p.id=ml.person_id
        WHERE p.name_ar=$1 AND m.status='سارية' AND ml.source_field='lawyerA'
          AND position($1 in coalesce(ml.legacy_source,''))>0
          AND m.legacy_source_record_key IS NOT NULL
        ORDER BY m.legacy_source_record_key`,
        [GATE4_LAWYER_PARAMETER],
      ),
    () =>
      queryDataset(
        db,
        'hearings by date',
        GATE4_REPORT_FIELDS.hearingsByDate,
        { from: GATE4_FROM_DATE, to: GATE4_TO_DATE },
        `SELECT h.legacy_source_record_key identity,
              ARRAY[h.legacy_id::text,to_char(h.hearing_date,'YYYY-MM-DD'),
                    to_char(h.next_hearing_date,'YYYY-MM-DD'),m.legacy_id::text,h.decision,
                    h.previous_decision,h.outcome,h.legacy_action_raw,h.legacy_court_raw,
                    h.legacy_circuit_raw,h.legacy_destination_raw,h.legacy_notes_raw,
                    h.client_notified::text] values
         FROM hearings h LEFT JOIN matters m ON m.id=h.matter_id
        WHERE h.hearing_date BETWEEN $1::date AND $2::date
          AND h.legacy_source_record_key IS NOT NULL
        ORDER BY h.legacy_source_record_key`,
        [GATE4_FROM_DATE, GATE4_TO_DATE],
      ),
    () =>
      queryDataset(
        db,
        'administrative works',
        GATE4_REPORT_FIELDS.adminWorks,
        { population: 'transformed legacy rows', business_date: 'task_created_date' },
        `SELECT a.legacy_source_record_key identity,
              ARRAY[a.legacy_id::text,m.legacy_id::text,a.required_work,a.legacy_assignee_raw,
                    to_char(a.task_created_date,'YYYY-MM-DD'),to_char(a.execution_date,'YYYY-MM-DD'),
                    a.result,a.previous_decision,a.last_followup,to_char(a.deadline,'YYYY-MM-DD'),
                    a.legacy_court_raw,a.legacy_circuit_raw,a.legacy_destination_raw,a.status,a.alert] values
         FROM admin_tasks a LEFT JOIN matters m ON m.id=a.matter_id
        WHERE a.legacy_source_record_key IS NOT NULL
        ORDER BY a.legacy_source_record_key`,
      ),
    () =>
      queryDataset(
        db,
        'financial history',
        GATE4_REPORT_FIELDS.financial,
        { population: 'transformed legacy invoices and payments' },
        `SELECT 'invoice:'||i.legacy_source_record_key identity,
              ARRAY['invoice',i.legacy_id::text,i.legacy_contract_id,
                    to_char(i.invoice_date,'YYYY-MM-DD'),i.amount::text,i.amount_usd::text,
                    i.currency,i.legacy_currency_raw,i.details,i.legacy_status_raw,i.legacy_type_raw,
                    i.vat::text,i.report::text,i.receipt_amount::text,
                    i.legacy_receipt_currency_raw] values
         FROM invoices i WHERE i.legacy_source_record_key IS NOT NULL
        UNION ALL
       SELECT 'payment:'||p.legacy_source_record_key,
              ARRAY['payment',p.legacy_id::text,p.legacy_invoice_no,
                    to_char(p.payment_date,'YYYY-MM-DD'),p.credit::text,p.debit::text,
                    p.currency,p.legacy_currency_raw,p.details,NULL,NULL,NULL,NULL,NULL,NULL]
         FROM payments p WHERE p.legacy_source_record_key IS NOT NULL
        ORDER BY 1`,
      ),
  ];
  const reports: Gate4Dataset[] = [];
  for (const load of loaders) reports.push(await load());
  return reports;
}

async function loadAccounting(
  db: ClientBase,
): Promise<ReadonlyMap<string, Readonly<{ target: number; quarantine: number }>>> {
  const result = await db.query<{ name: string; target: number; quarantine: number }>(`
    SELECT * FROM (VALUES
      ('admin work table',(SELECT count(*)::int FROM admin_tasks WHERE legacy_source_record_key IS NOT NULL),(SELECT count(*)::int FROM quarantine.admin_task_transform)),
      ('Attendance',(SELECT count(*)::int FROM attendance WHERE legacy_source_record_key IS NOT NULL),(SELECT count(*)::int FROM quarantine.attendance_transform)),
      ('Contacts',(SELECT count(*)::int FROM contacts),(0)),
      ('lawyers',(SELECT count(DISTINCT p.id)::int FROM staging."lawyers" s JOIN people p ON p.name_en=CASE WHEN s."Title"='Dr.' THEN 'Dr. '||s."LawyerName" ELSE s."LawyerName" END OR EXISTS (SELECT 1 FROM person_name_alias a WHERE a.person_id=p.id AND a.alias_ar=s."اسم المحامي") WHERE s."اسم المحامي"<>'**'),(0)),
      ('إجراءات المهام',(SELECT count(*)::int FROM task_actions WHERE legacy_source_record_key IS NOT NULL),(SELECT count(*)::int FROM quarantine.task_action_transform)),
      ('التوكيلات',(SELECT count(*)::int FROM powers_of_attorney WHERE legacy_source_record_key IS NOT NULL),(SELECT count(*)::int FROM quarantine.power_of_attorney_transform)),
      ('الجلسات',(SELECT count(*)::int FROM hearings WHERE legacy_source_record_key IS NOT NULL),(SELECT count(*)::int FROM quarantine.hearing_transform)),
      ('الدعاوى',(SELECT count(*)::int FROM matters WHERE legacy_source_record_key IS NOT NULL),(SELECT count(*)::int FROM quarantine.matter_transform)),
      ('السداد',(SELECT count(*)::int FROM payments WHERE legacy_source_record_key IS NOT NULL),(SELECT count(*)::int FROM quarantine.payment_transform)),
      ('العملاء',(SELECT count(*)::int FROM clients),(0)),
      ('الفواتير',(SELECT count(*)::int FROM invoices WHERE legacy_source_record_key IS NOT NULL),(SELECT count(*)::int FROM quarantine.invoice_transform)),
      ('المستندات',(SELECT count(*)::int FROM documents WHERE legacy_source_record_key IS NOT NULL),(SELECT count(*)::int FROM quarantine.document_transform)),
      ('تقسيم التحصيلات',(SELECT count(*)::int FROM invoice_allocations WHERE legacy_source_record_key IS NOT NULL),(SELECT count(*)::int FROM quarantine.invoice_allocation_transform)),
      ('خطابات الأتعاب',(SELECT count(*)::int FROM fee_letters WHERE legacy_source_record_key IS NOT NULL),(SELECT count(*)::int FROM quarantine.fee_letter_transform)),
      ('فريق العمل',(SELECT count(*)::int FROM lookup_team),(0))
    ) row(name,target,quarantine)`);
  return new Map(
    result.rows.map((row) => [row.name, { target: row.target, quarantine: row.quarantine }]),
  );
}

async function loadComplexAccounting(
  db: ClientBase,
): Promise<ReadonlyMap<string, Readonly<{ target: number; quarantine: number }>>> {
  const result = await db.query<{ name: string; target: number; quarantine: number }>(`
    SELECT * FROM (VALUES
      ('Contacts.Attachments',0,0),
      ('العملاء.logo',(SELECT count(*)::int FROM migration_client_logo_import),0),
      ('خطابات الأتعاب.Matter',(SELECT count(*)::int FROM fee_letter_matters),(SELECT count(*)::int FROM quarantine.fee_letter_matter_transform))
    ) row(name,target,quarantine)`);
  return new Map(
    result.rows.map((row) => [row.name, { target: row.target, quarantine: row.quarantine }]),
  );
}

async function assertLawyerSourceResolution(db: ClientBase): Promise<void> {
  const result = await db.query<{
    source_rows: number;
    excluded: number;
    bad_matches: number;
    people: number;
  }>(`
    WITH resolved AS (
      SELECT s."LawyerID",s."اسم المحامي",count(DISTINCT p.id)::int matches
        FROM staging."lawyers" s
        LEFT JOIN people p ON p.name_en=CASE WHEN s."Title"='Dr.' THEN 'Dr. '||s."LawyerName" ELSE s."LawyerName" END
          OR EXISTS (SELECT 1 FROM person_name_alias a WHERE a.person_id=p.id AND a.alias_ar=s."اسم المحامي")
       GROUP BY s."LawyerID",s."اسم المحامي"
    )
    SELECT count(*)::int source_rows,
           count(*) FILTER (WHERE "اسم المحامي"='**')::int excluded,
           count(*) FILTER (WHERE "اسم المحامي"<>'**' AND matches<>1)::int bad_matches,
           sum(CASE WHEN "اسم المحامي"<>'**' THEN matches ELSE 0 END)::int people
      FROM resolved`);
  const row = result.rows[0];
  if (
    row === undefined ||
    row.source_rows !== 23 ||
    row.excluded !== 1 ||
    row.bad_matches !== 0 ||
    row.people !== 22
  )
    throw new Error(`lawyers source resolution differs: ${JSON.stringify(row)}`);
}

export async function loadGate4DatabaseSnapshot(db: Client): Promise<Gate4DatabaseSnapshot> {
  const settingsResult = await db.query<{
    database: string;
    read_only: string;
    isolation: string;
    server_port: number;
  }>(`SELECT current_database() database,current_setting('transaction_read_only') read_only,
             current_setting('transaction_isolation') isolation,current_setting('port')::int server_port`);
  const settingsRow = settingsResult.rows[0];
  if (settingsRow === undefined) throw new Error('PostgreSQL returned no transaction settings');
  const settings: Gate4DatabaseSettings = {
    database: settingsRow.database,
    readOnly: settingsRow.read_only,
    isolation: settingsRow.isolation,
    serverPort: settingsRow.server_port,
  };
  assertReadOnlySnapshot(settings);

  const prerequisites = await proveGate4Prerequisites(db);
  await assertLawyerSourceResolution(db);

  const status = await db.query<{ key: string; rows: number }>(`
    SELECT coalesce(status,'<NULL>') key,count(*)::int rows
      FROM matters WHERE legacy_source_record_key IS NOT NULL GROUP BY status ORDER BY status NULLS LAST`);
  const years = await db.query<{ key: string; rows: number }>(`
    SELECT extract(year FROM hearing_date)::int::text key,count(*)::int rows
      FROM hearings WHERE legacy_source_record_key IS NOT NULL AND hearing_date IS NOT NULL
     GROUP BY 1 ORDER BY 1`);
  const invoices = await db.query<{ currency: string; rows: number; amount: string }>(`
    SELECT coalesce(currency,'<NULL>') currency,count(*)::int rows,
           coalesce(sum(amount),0)::numeric(30,2)::text amount
      FROM invoices WHERE legacy_source_record_key IS NOT NULL GROUP BY currency ORDER BY currency NULLS LAST`);
  const payments = await db.query<{ currency: string; rows: number; amount: string }>(`
    SELECT coalesce(currency,'<NULL>') currency,count(*)::int rows,
           coalesce(sum(credit),0)::numeric(30,2)::text amount
      FROM payments WHERE legacy_source_record_key IS NOT NULL GROUP BY currency ORDER BY currency NULLS LAST`);
  const lawyers = await db.query<{ name: string; matters: number; active: number }>(`
    SELECT p.name_ar name,count(*)::int matters,count(*) FILTER (WHERE m.status='سارية')::int active
      FROM matter_lawyers ml JOIN matters m ON m.id=ml.matter_id JOIN people p ON p.id=ml.person_id
     WHERE m.legacy_source_record_key IS NOT NULL GROUP BY p.name_ar ORDER BY p.name_ar`);
  const staging = await db.query<{ rows: number; fingerprint: string }>(`
    SELECT (SELECT sum(c)::int FROM (
      SELECT count(*) c FROM staging."admin work table" UNION ALL SELECT count(*) FROM staging."Attendance"
      UNION ALL SELECT count(*) FROM staging."Contacts" UNION ALL SELECT count(*) FROM staging."lawyers"
      UNION ALL SELECT count(*) FROM staging."LawyerShare4Invoices" UNION ALL SELECT count(*) FROM staging."إجراءات المهام"
      UNION ALL SELECT count(*) FROM staging."التوكيلات" UNION ALL SELECT count(*) FROM staging."الجلسات"
      UNION ALL SELECT count(*) FROM staging."الدعاوى" UNION ALL SELECT count(*) FROM staging."السداد"
      UNION ALL SELECT count(*) FROM staging."العملاء" UNION ALL SELECT count(*) FROM staging."الفواتير"
      UNION ALL SELECT count(*) FROM staging."المحامين" UNION ALL SELECT count(*) FROM staging."المستندات"
      UNION ALL SELECT count(*) FROM staging."تقسيم التحصيلات" UNION ALL SELECT count(*) FROM staging."خطابات الأتعاب"
      UNION ALL SELECT count(*) FROM staging."فريق العمل" UNION ALL SELECT count(*) FROM staging."Contacts__Attachments"
      UNION ALL SELECT count(*) FROM staging."العملاء__logo" UNION ALL SELECT count(*) FROM staging."خطابات الأتعاب__Matter"
    ) totals) rows,_migration.current_staging_fingerprint() fingerprint`);
  const migration = await db.query<{
    migration_name: string;
    checksum: string;
    finished_at: string | null;
    rolled_back_at: string | null;
    applied_steps_count: number;
  }>(`
    SELECT migration_name,checksum,finished_at::text,rolled_back_at::text,
           applied_steps_count
      FROM _prisma_migrations
     ORDER BY migration_name,started_at,id`);
  const migrationHistory: Gate4MigrationHistoryRow[] = migration.rows.map((row) => ({
    migrationName: row.migration_name,
    checksum: row.checksum,
    finishedAt: row.finished_at,
    rolledBackAt: row.rolled_back_at,
    appliedStepsCount: row.applied_steps_count,
  }));
  const stagingRow = staging.rows[0];
  if (stagingRow === undefined) throw new Error('PostgreSQL baseline query returned no row');

  const logos = await reconcileClientLogos(db, {
    logoRoot: resolve('storage', 'client-logos'),
    sourceRoot: resolve('_migration', 'attachments', 'العملاء__logo'),
    requireCurrentImportRows: true,
    enforceApprovedBaseline: true,
  });
  assert.deepEqual(logos.defects, [], 'client logo reconciliation');

  return {
    settings,
    quarantine: prerequisites.quarantine,
    currencyRules: prerequisites.currencyRules,
    datasets: await loadReports(db),
    accountingByName: await loadAccounting(db),
    complexAccountingByName: await loadComplexAccounting(db),
    matterStatus: mapCounts(status.rows),
    hearingYears: mapCounts(years.rows),
    invoiceTotals: mapAmounts(invoices.rows),
    paymentTotals: mapAmounts(payments.rows),
    lawyerTotals: lawyers.rows,
    adminCreatedAtSubstitutions: prerequisites.adminCreatedAtSubstitutions,
    stagingRows: stagingRow.rows,
    stagingFingerprint: stagingRow.fingerprint,
    review: await readReviewSnapshot(db),
    migrations: reconcileGate4Migrations(
      migrationHistory,
      await readGate4RepositoryMigrationInventory(),
    ),
    logos,
    protectedDigest: await task211ProtectedState(db),
    prerequisites: prerequisites.results,
    currencyRuleDigest: prerequisites.currencyRuleDigest,
  };
}

export async function withGate4ReadOnlyDatabase<T>(run: (db: Client) => Promise<T>): Promise<T> {
  const url = assertGate4DatabaseUrl(process.env.MIGRATION_DATABASE_URL);
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await run(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }
}

export function buildGate4Accounting(
  sourceCounts: ReadonlyMap<string, number>,
  targetCounts: Gate4DatabaseSnapshot['accountingByName'],
): Gate4TableAccounting[] {
  const rows: Gate4TableAccounting[] = [];
  for (const [name, sourceRows] of sourceCounts) {
    const target = targetCounts.get(name);
    if (target === undefined) throw new Error(`${name}: target accounting is missing`);
    const reviewedExcludedRows = name === 'lawyers' || name === 'فريق العمل' ? 1 : 0;
    rows.push({
      name,
      classification: 'migrated',
      sourceRows,
      representedSourceRows: sourceRows - target.quarantine - reviewedExcludedRows,
      targetRows: target.target,
      transformedRows: target.target,
      quarantinedRows: target.quarantine,
      reviewedExcludedRows,
      note:
        name === 'lawyers'
          ? '22 people resolved; the reviewed ** placeholder is excluded.'
          : name === 'فريق العمل'
            ? 'Two teams retained; Access row 3 repeats code A and is the D6 abandoned duplicate.'
            : undefined,
    });
  }
  return rows;
}
