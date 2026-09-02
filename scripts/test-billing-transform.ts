import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { setMaintenanceAuditContext } from './lib/audit-maintenance-context';
import { buildBillingPlan } from './lib/billing-transform-plan';
import { reconcileBillingHistory } from './lib/billing-reconciliation';
import { billingStructureFailures } from './lib/billing-structure';
import {
  billingResultDigest,
  runBillingTransform,
  type LIVE_BILLING_COUNTS,
} from './transform-billing-history';

const FP = 'F'.repeat(64);
const expected: typeof LIVE_BILLING_COUNTS = {
  invoiceSource: 2,
  invoiceTarget: 1,
  invoiceQuarantine: 1,
  paymentSource: 3,
  paymentTarget: 2,
  paymentQuarantine: 1,
  allocationSource: 8,
  allocationTarget: 7,
  allocationQuarantine: 1,
  allocationGroups: 1,
  allocationPeople: 5,
  referenceOnly: 0,
};

const fixtureKey = (number: number) => `${number.toString(16).padStart(64, '0')}:000001`;
type LegacyBillingTable = 'invoices' | 'payments' | 'invoice_allocations';
type ProvenanceFieldFixture = Readonly<{ field: string; value: unknown }>;
type IdentityShapeFixture = Readonly<{
  label: string;
  key: string | null;
  fingerprint: string | null;
  payload: Readonly<Record<string, string>> | null;
}>;

const legacyChangeTrigger: Record<LegacyBillingTable, string> = {
  invoices: 'invoices_legacy_no_change',
  payments: 'payments_legacy_no_change',
  invoice_allocations: 'invoice_allocations_legacy_no_change',
};
const sourceIdentityConstraint: Record<LegacyBillingTable, string> = {
  invoices: 'invoices_source_identity_shape',
  payments: 'payments_source_identity_shape',
  invoice_allocations: 'invoice_allocations_source_identity_shape',
};
const provenanceFields: Record<LegacyBillingTable, readonly ProvenanceFieldFixture[]> = {
  invoices: [
    { field: 'legacy_id', value: 999 },
    { field: 'legacy_contract_id', value: 'legacy-looking' },
    { field: 'legacy_currency_raw', value: 'legacy-looking' },
    { field: 'legacy_status_raw', value: 'legacy-looking' },
    { field: 'legacy_type_raw', value: 'legacy-looking' },
    { field: 'legacy_receipt_currency_raw', value: 'legacy-looking' },
    { field: 'legacy_source_record_key', value: fixtureKey(300) },
    { field: 'legacy_source_extraction_sha256', value: FP },
    { field: 'legacy_source_payload', value: { fixture: 'partial-invoice' } },
  ],
  payments: [
    { field: 'legacy_id', value: 999 },
    { field: 'legacy_invoice_no', value: 'legacy-looking' },
    { field: 'legacy_currency_raw', value: 'legacy-looking' },
    { field: 'legacy_source_record_key', value: fixtureKey(301) },
    { field: 'legacy_source_extraction_sha256', value: FP },
    { field: 'legacy_source_payload', value: { fixture: 'partial-payment' } },
  ],
  invoice_allocations: [
    { field: 'legacy_id', value: 999 },
    { field: 'legacy_invoice_no', value: 'legacy-looking' },
    { field: 'legacy_lawyer_raw', value: 'legacy-looking' },
    { field: 'legacy_percent_raw', value: 'legacy-looking' },
    { field: 'legacy_lawyer_as_raw', value: 'legacy-looking' },
    { field: 'legacy_source_record_key', value: fixtureKey(302) },
    { field: 'legacy_source_extraction_sha256', value: FP },
    { field: 'legacy_source_payload', value: { fixture: 'partial-allocation' } },
  ],
};
const identityShapeFixtures: readonly IdentityShapeFixture[] = [
  {
    label: 'all three identity fields NULL',
    key: null,
    fingerprint: null,
    payload: null,
  },
  {
    label: 'only the source key missing',
    key: null,
    fingerprint: FP,
    payload: { fixture: 'missing-key' },
  },
  {
    label: 'only the extraction fingerprint missing',
    key: fixtureKey(310),
    fingerprint: null,
    payload: { fixture: 'missing-fingerprint' },
  },
  {
    label: 'only the source payload missing',
    key: fixtureKey(311),
    fingerprint: FP,
    payload: null,
  },
  {
    label: 'combined partial identity with payload but no key or fingerprint',
    key: null,
    fingerprint: null,
    payload: { fixture: 'combined-partial' },
  },
];

function identifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/u);
  return `"${value}"`;
}

function migrate(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

async function clean(db: Client): Promise<void> {
  const result = await reconcileBillingHistory(db, false);
  assert.deepEqual(result.defects, [], result.defects.join('\n'));
  assert.deepEqual(await billingStructureFailures(db), []);
}

async function reconciliationFailure(
  db: Client,
  label: string,
  mutation: () => Promise<unknown>,
  pattern: RegExp,
  guardedTable?: LegacyBillingTable,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await setMaintenanceAuditContext(db, 'test-billing-reconciliation-negative');
    if (guardedTable)
      await db.query(
        `ALTER TABLE ${identifier(guardedTable)} DISABLE TRIGGER ${identifier(legacyChangeTrigger[guardedTable])}`,
      );
    await mutation();
    assert.match((await reconcileBillingHistory(db, false)).defects.join('\n'), pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  await clean(db);
  console.log(`  ok    ${label}`);
}

async function planFailure(
  db: Client,
  label: string,
  mutation: () => Promise<unknown>,
  verify: (plan: Awaited<ReturnType<typeof buildBillingPlan>>) => void | Promise<void>,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await setMaintenanceAuditContext(db, 'test-billing-plan-negative');
    await mutation();
    await verify(await buildBillingPlan(db));
  } finally {
    await db.query('ROLLBACK');
  }
  await clean(db);
  console.log(`  ok    ${label}`);
}

async function refusal(
  db: Client,
  label: string,
  statement: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await setMaintenanceAuditContext(db, 'test-billing-expected-refusal');
    await assert.rejects(statement, pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  await clean(db);
  console.log(`  ok    ${label}`);
}

async function transactionalRefusal(
  db: Client,
  label: string,
  prepare: () => Promise<unknown>,
  statement: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await setMaintenanceAuditContext(db, 'test-billing-transactional-refusal');
    await prepare();
    await assert.rejects(statement, pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  await clean(db);
  console.log(`  ok    ${label}`);
}

async function partialProvenanceRefusal(
  db: Client,
  table: LegacyBillingTable,
  nativeId: number,
  fixture: ProvenanceFieldFixture,
): Promise<void> {
  const relation = identifier(table);
  const column = identifier(fixture.field);
  await refusal(
    db,
    'partial provenance update',
    () => db.query(`UPDATE ${relation} SET ${column}=$1 WHERE id=$2`, [fixture.value, nativeId]),
    /migration provenance cannot be attached by ordinary update/,
  );
  await refusal(
    db,
    'partial provenance insert',
    () =>
      db.query(`INSERT INTO ${relation}(${column},updated_at) VALUES($1,CURRENT_TIMESTAMP)`, [
        fixture.value,
      ]),
    new RegExp(sourceIdentityConstraint[table]),
  );
  await clean(db);
  console.log(
    `  ok    ${table}.${fixture.field} cannot be attached to a native UPDATE or partial INSERT`,
  );
}

async function insertMigratedShape(
  db: Client,
  table: LegacyBillingTable,
  fixture: IdentityShapeFixture,
  ordinal: number,
): Promise<void> {
  const identity = [
    fixture.key,
    fixture.fingerprint,
    fixture.payload === null ? null : JSON.stringify(fixture.payload),
    ordinal,
  ];
  if (table === 'invoices') {
    await db.query(
      `INSERT INTO invoices(
         legacy_id,invoice_no,fee_letter_id,legacy_contract_id,invoice_date,
         amount,currency,legacy_currency_raw,status_id,legacy_status_raw,
         legacy_source_record_key,legacy_source_extraction_sha256,
         legacy_source_payload,updated_at)
       SELECT 910000+$4,'fixture-null-safe-i-'||$4::text,f.id,'100',DATE '2026-08-26',
              1,'EGP','EGP',s.id,'Paid',$1,$2,$3::jsonb,CURRENT_TIMESTAMP
         FROM fee_letters f CROSS JOIN lookup_invoice_status s
        WHERE f.contract_id=100 AND s.code='Paid'`,
      identity,
    );
    return;
  }
  if (table === 'payments') {
    await db.query(
      `INSERT INTO payments(
         legacy_id,invoice_id,legacy_invoice_no,credit,currency,
         legacy_currency_raw,legacy_source_record_key,
         legacy_source_extraction_sha256,legacy_source_payload,updated_at)
       SELECT 920000+$4,i.id,i.invoice_no,1,'EGP','EGP',$1,$2,$3::jsonb,
              CURRENT_TIMESTAMP
         FROM invoices i WHERE i.legacy_id=21819`,
      identity,
    );
    return;
  }
  await db.query(
    `INSERT INTO invoice_allocations(
       legacy_id,invoice_id,legacy_invoice_no,person_id,legacy_lawyer_raw,
       share,legacy_percent_raw,lawyer_role_id,legacy_lawyer_as_raw,
       legacy_source_record_key,legacy_source_extraction_sha256,
       legacy_source_payload,updated_at)
     SELECT 930000+$4,i.id,i.invoice_no,p.id,'Fixture Person',1,'1.000',r.id,
            'Reviewer',$1,$2,$3::jsonb,CURRENT_TIMESTAMP
       FROM invoices i CROSS JOIN lookup_lawyer_share_role r
       CROSS JOIN LATERAL (
         SELECT candidate.id FROM people candidate
          WHERE NOT EXISTS (
            SELECT 1 FROM invoice_allocations existing
             WHERE existing.invoice_id=i.id
               AND existing.person_id=candidate.id
               AND existing.lawyer_role_id=r.id)
          ORDER BY candidate.id LIMIT 1
       ) p
      WHERE i.legacy_id=21819 AND r.code='Reviewer'`,
    identity,
  );
}

async function migratedIdentityShapeRefusals(db: Client, table: LegacyBillingTable): Promise<void> {
  for (const [index, fixture] of identityShapeFixtures.entries()) {
    await refusal(
      db,
      'partial migrated identity',
      () => insertMigratedShape(db, table, fixture, index + 1),
      new RegExp(sourceIdentityConstraint[table]),
    );
    await clean(db);
    console.log(`  ok    ${table}: ${fixture.label} is refused directly by its named CHECK`);
  }
}

async function partialProvenanceReconciliationDetection(
  db: Client,
  table: LegacyBillingTable,
): Promise<void> {
  for (const [index, fixture] of identityShapeFixtures.entries()) {
    await db.query('BEGIN');
    try {
      await setMaintenanceAuditContext(db, 'test-billing-partial-provenance');
      await db.query(
        `ALTER TABLE ${identifier(table)}
           DROP CONSTRAINT ${identifier(sourceIdentityConstraint[table])},
           ADD CONSTRAINT ${identifier(sourceIdentityConstraint[table])} CHECK (true)`,
      );
      await insertMigratedShape(db, table, fixture, index + 90);
      assert.match(
        (await reconcileBillingHistory(db, false)).defects.join('\n'),
        /partial billing provenance: 1/,
      );
    } finally {
      await db.query('ROLLBACK');
    }
    await clean(db);
    console.log(
      `  ok    ${table}: reconciliation detects ${fixture.label} when its CHECK is disabled`,
    );
  }
}

async function structureFailure(
  db: Client,
  label: string,
  mutation: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await mutation();
    assert.match((await billingStructureFailures(db)).join('\n'), pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  assert.deepEqual(await billingStructureFailures(db), []);
  console.log(`  ok    ${label}`);
}

async function main(): Promise<void> {
  const projectUrl = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(projectUrl, 'MIGRATION_DATABASE_URL is required');
  const databaseName = `billing_fixture_${process.pid}_${Date.now()}`;
  const adminUrl = new URL(projectUrl);
  adminUrl.pathname = '/postgres';
  const fixtureUrl = new URL(projectUrl);
  fixtureUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${identifier(databaseName)}`);
    created = true;
    migrate(fixtureUrl.toString());
    const db = new Client({ connectionString: fixtureUrl.toString() });
    await db.connect();
    try {
      await db.query('BEGIN');
      await setMaintenanceAuditContext(db, 'test-billing-fixtures');
      const feeSourceKey = fixtureKey(900);
      await db.query(
        `INSERT INTO fee_letters(
           contract_id,legacy_source_record_key,legacy_source_extraction_sha256,
           legacy_source_payload,updated_at)
         VALUES(100,$1,$2,'{"contractID":"100"}',CURRENT_TIMESTAMP)`,
        [feeSourceKey, FP],
      );
      await db.query(
        `INSERT INTO staging."الفواتير"(
           src_file,src_row_num,src_record_key,src_extraction_sha256,"Inv-No",
           "contractID","Inv-Date","Amount","USD$","Currency","Inv-Details",
           "Inv-Status","Inv-Type","VAT?",report,"R-#","R-$","Pay-Date")
         VALUES
           ('fixture/invoices-a.csv',77,$1,$3,'21819','100','2026-08-25 00:00:00',
            '16500','100',' USD','فاتورة عربية','Paid',NULL,'true','false','0','0',
            '2019-09-01 00:00:00'),
           ('fixture/invoices-b.csv',88,$2,$3,'1001','100','2026-08-25 00:00:00',
            '5',NULL,'EGP','يجب الحجر','Unpaid','Service','false','true','1','0',NULL)`,
        [fixtureKey(1), fixtureKey(2), FP],
      );
      await db.query(
        `INSERT INTO staging."السداد"(
           src_file,src_row_num,src_record_key,src_extraction_sha256,"رقم الفاتورة",
           "التاريخ","ID","Credit","Debit","العملة","بيان السداد")
         VALUES
           ('fixture/payments.csv',1,$1,$4,'21819','2026-08-25 00:00:00','1',
            '16500','0',' USD','سداد عربي'),
           ('fixture/payments.csv',2,$2,$4,'21819',NULL,'2','0','0',NULL,NULL),
           ('fixture/payments.csv',3,$3,$4,'1001',NULL,'3','5','0','EGP','تابع لمحجور')`,
        [fixtureKey(10), fixtureKey(11), fixtureKey(12), FP],
      );
      const allocationRows = [
        ['1', 'Ahmed Abdullah', '.060', 'Reviewer'],
        ['2', 'Nagy Ramadan', '.110', 'Reviewer'],
        ['3', 'Mahmoud Sha’ban', '.100', 'LawyerB'],
        ['4', "Mo'men Selim", '.100', 'LawyerB'],
        ['5', 'Mohamed Abd El-Aziz', '.240', 'LawyerA'],
        ['6', 'Ahmed Abdullah', '.315', 'LawyerA'],
        ['7', 'Mohamed Abd El-Aziz', '.075', 'LawyerA+'],
        ['8', 'Not A Person', '1.000', 'LawyerA'],
      ];
      for (const [index, [id, lawyer, percent, role]] of allocationRows.entries())
        await db.query(
          `INSERT INTO staging."تقسيم التحصيلات"(
             src_file,src_row_num,src_record_key,src_extraction_sha256,
             "ID","InvNo","Lawyer","Percent","LawyerAs")
           VALUES('fixture/allocations.csv',$1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            index + 1,
            fixtureKey(100 + index),
            FP,
            id,
            id === '8' ? '1001' : '21819',
            lawyer,
            percent,
            role,
          ],
        );

      await db.query('COMMIT');
      const dry = await runBillingTransform({
        databaseUrl: fixtureUrl.toString(),
        expectedCounts: expected,
      });
      assert.equal((await db.query('SELECT count(*) FROM invoices')).rows[0]!.count, '0');
      assert.deepEqual(
        dry.plan.allocations.map((row) => [
          row.legacyLawyerRaw,
          row.legacyPercentRaw,
          row.share,
          row.legacyLawyerAsRaw,
        ]),
        allocationRows.slice(0, 7).map((row) => [row[1], row[2], `0${row[2]}00`, row[3]]),
      );
      assert.equal(dry.plan.invoices[0]!.legacyTypeRaw, null);
      assert.equal(dry.plan.invoices[0]!.typeId, null);
      assert.equal(dry.plan.invoices[0]!.legacyCurrencyRaw, ' USD');
      assert.equal(dry.plan.invoices[0]!.currency, 'USD');
      assert.equal(dry.plan.invoices[0]!.legacyReceiptCurrencyRaw, '0');
      assert.equal(dry.plan.invoices[0]!.receiptCurrency, null);
      assert.equal(dry.plan.invoices[0]!.sourcePayload['Pay-Date'], undefined);
      console.log(
        '  ok    dry run copies reviewed fractions, NULL type, exact currency rules and excludes Pay-Date without writes',
      );

      const applied = await runBillingTransform({
        databaseUrl: fixtureUrl.toString(),
        apply: true,
        expectedCounts: expected,
      });
      assert.ok(applied.digest);
      await clean(db);
      console.log(
        '  ok    target-or-quarantine partitions all fixture sources and complete PostgreSQL definitions are exact',
      );

      for (const table of ['invoices', 'payments', 'invoice_allocations'] as const)
        await migratedIdentityShapeRefusals(db, table);
      for (const table of ['invoices', 'payments', 'invoice_allocations'] as const)
        await partialProvenanceReconciliationDetection(db, table);

      const storedShares = (
        await db.query<{ raw: string; interpreted: string; lawyer: string }>(
          `SELECT legacy_percent_raw raw,share::text interpreted,legacy_lawyer_raw lawyer
             FROM invoice_allocations ORDER BY legacy_id`,
        )
      ).rows;
      assert.deepEqual(
        storedShares,
        allocationRows.slice(0, 7).map((row) => ({
          raw: row[2]!,
          interpreted: `0${row[2]}00`,
          lawyer: row[1]!,
        })),
      );
      assert.equal(
        (
          await db.query<{ total: string }>(
            'SELECT sum(share)::text total FROM invoice_allocations',
          )
        ).rows[0]!.total,
        '1.00000',
      );
      assert.equal(
        (
          await db.query<{ count: string }>(
            `SELECT count(*) FROM invoice_allocations
              WHERE legacy_lawyer_raw='Ahmed Abdullah' AND person_id=25`,
          )
        ).rows[0]!.count,
        '2',
      );
      console.log(
        '  ok    all seven 21819 shares copy exactly, sum to one and use the reviewed person crosswalk',
      );

      await reconciliationFailure(
        db,
        'changed invoice text is detected independently',
        () => db.query(`UPDATE invoices SET details='بديل' WHERE legacy_id=21819`),
        /invoice target\/source mismatch/,
        'invoices',
      );
      await reconciliationFailure(
        db,
        'changed typed invoice amount is detected independently',
        () => db.query(`UPDATE invoices SET amount=16501 WHERE legacy_id=21819`),
        /invoice target\/source mismatch/,
        'invoices',
      );
      await reconciliationFailure(
        db,
        'changed invoice extraction fingerprint is detected',
        () =>
          db.query(`UPDATE invoices SET legacy_source_extraction_sha256=$1 WHERE legacy_id=21819`, [
            'A'.repeat(64),
          ]),
        /invoice target\/source mismatch/,
        'invoices',
      );
      await reconciliationFailure(
        db,
        'changed payment NULL versus empty distinction is detected',
        () => db.query(`UPDATE payments SET details='' WHERE legacy_id=2`),
        /payment target\/source mismatch/,
        'payments',
      );
      await reconciliationFailure(
        db,
        'changed payment link is detected',
        () => db.query(`UPDATE payments SET legacy_invoice_no='changed' WHERE legacy_id=1`),
        /payment target\/source mismatch/,
        'payments',
      );
      await reconciliationFailure(
        db,
        'changed interpreted share is detected',
        () => db.query(`UPDATE invoice_allocations SET share=.061 WHERE legacy_id=1`),
        /allocation target\/source mismatch/,
        'invoice_allocations',
      );
      await reconciliationFailure(
        db,
        'changed exact allocation raw text is detected',
        () =>
          db.query(`UPDATE invoice_allocations SET legacy_percent_raw='0.060' WHERE legacy_id=1`),
        /allocation target\/source mismatch/,
        'invoice_allocations',
      );
      await reconciliationFailure(
        db,
        'missing target payment is detected',
        () => db.query(`DELETE FROM payments WHERE legacy_id=1`),
        /payment target\/source mismatch/,
        'payments',
      );
      await reconciliationFailure(
        db,
        'incorrect quarantine reason is detected',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.invoice_transform DISABLE TRIGGER invoice_transform_no_change',
          );
          await db.query(
            `UPDATE quarantine.invoice_transform SET reason_codes=ARRAY['unsupported_invoice_currency'],reason_details='[{"value":"EGP"}]' WHERE legacy_invoice_no_raw='1001'`,
          );
        },
        /invoice quarantine\/source mismatch/,
      );
      await reconciliationFailure(
        db,
        'changed quarantine source trace is detected',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.payment_transform DISABLE TRIGGER payment_transform_no_change',
          );
          await db.query(
            `UPDATE quarantine.payment_transform SET src_row_num=999 WHERE legacy_payment_id_raw='3'`,
          );
        },
        /payment quarantine\/source mismatch/,
      );
      await reconciliationFailure(
        db,
        'missing allocation quarantine is detected',
        async () => {
          await db.query(
            'ALTER TABLE quarantine.invoice_allocation_transform DISABLE TRIGGER invoice_allocation_transform_no_change',
          );
          await db.query(`DELETE FROM quarantine.invoice_allocation_transform`);
        },
        /allocation quarantine\/source mismatch/,
      );

      await db.query('BEGIN');
      try {
        await db.query(`UPDATE staging."الفواتير" SET "R-#"='1' WHERE "Inv-No"='21819'`);
        const unsafe = await buildBillingPlan(db);
        assert.equal(unsafe.invoices.length, 0);
        assert.ok(
          unsafe.invoiceQuarantine.some((row) =>
            row.reasonCodes.includes('zero_receipt_currency_with_nonzero_amount'),
          ),
        );
      } finally {
        await db.query('ROLLBACK');
      }
      await clean(db);
      console.log('  ok    R-$ text 0 with a nonzero R-# is quarantined, never interpreted');

      await db.query('BEGIN');
      try {
        await db.query(`UPDATE staging."الفواتير" SET "Inv-Type"='' WHERE "Inv-No"='21819'`);
        const emptyType = await buildBillingPlan(db);
        assert.ok(
          emptyType.invoiceQuarantine.some((row) =>
            row.reasonCodes.includes('unsupported_invoice_type'),
          ),
        );
      } finally {
        await db.query('ROLLBACK');
      }
      await clean(db);
      console.log(
        '  ok    NULL invoice type is accepted but an unreviewed empty string is quarantined',
      );

      await db.query('BEGIN');
      try {
        await db.query(`UPDATE staging."الفواتير" SET "Currency"=' EGP' WHERE "Inv-No"='21819'`);
        assert.ok(
          (await buildBillingPlan(db)).invoiceQuarantine.some((row) =>
            row.reasonCodes.includes('unsupported_invoice_currency'),
          ),
        );
      } finally {
        await db.query('ROLLBACK');
      }
      await clean(db);
      console.log('  ok    no unreviewed whitespace trim or currency fold is applied');

      await db.query('BEGIN');
      try {
        await db.query(
          `UPDATE staging."تقسيم التحصيلات" SET "Lawyer"='أحمد عبد الله' WHERE "ID"='1'`,
        );
        assert.ok(
          (await buildBillingPlan(db)).allocationQuarantine.some((row) =>
            row.reasonCodes.includes('unresolved_english_person'),
          ),
        );
      } finally {
        await db.query('ROLLBACK');
      }
      await clean(db);
      console.log(
        '  ok    Arabic and fuzzy names do not inherit the exact legacy English crosswalk',
      );

      await planFailure(
        db,
        'missing fee-letter contract is quarantined',
        () => db.query(`UPDATE staging."الفواتير" SET "contractID"='999' WHERE "Inv-No"='21819'`),
        (plan) =>
          assert.ok(
            plan.invoiceQuarantine.some((row) => row.reasonCodes.includes('unresolved_fee_letter')),
          ),
      );
      await planFailure(
        db,
        'ambiguous fee-letter contract is quarantined',
        async () => {
          await db.query('DROP INDEX fee_letters_contract_id_key');
          await db.query(
            `INSERT INTO fee_letters(
               contract_id,legacy_source_record_key,
               legacy_source_extraction_sha256,legacy_source_payload,updated_at)
             VALUES(100,$1,$2,'{"contractID":"100"}',CURRENT_TIMESTAMP)`,
            [fixtureKey(901), FP],
          );
        },
        (plan) =>
          assert.ok(
            plan.invoiceQuarantine.some((row) => row.reasonCodes.includes('ambiguous_fee_letter')),
          ),
      );
      await planFailure(
        db,
        'duplicate invoice numbers are quarantined',
        () =>
          db.query(
            `INSERT INTO staging."الفواتير"(
               src_file,src_row_num,src_record_key,src_extraction_sha256,"Inv-No",
               "contractID","Inv-Date","Amount","Currency","Inv-Details",
               "Inv-Status","Inv-Type","VAT?",report)
             VALUES('fixture/duplicate.csv',1,$1,$2,'21819','100',
                    '2026-08-25 00:00:00','1','EGP','duplicate','Paid',
                    'Service','false','false')`,
            [fixtureKey(3), FP],
          ),
        (plan) =>
          assert.equal(
            plan.invoiceQuarantine.filter((row) =>
              row.reasonCodes.includes('duplicate_invoice_number'),
            ).length,
            2,
          ),
      );
      await planFailure(
        db,
        'unsupported invoice status is quarantined',
        () =>
          db.query(
            `UPDATE staging."الفواتير" SET "Inv-Status"='Not reviewed' WHERE "Inv-No"='21819'`,
          ),
        (plan) =>
          assert.ok(
            plan.invoiceQuarantine.some((row) =>
              row.reasonCodes.includes('unsupported_invoice_status'),
            ),
          ),
      );
      await planFailure(
        db,
        'impossible invoice date is quarantined',
        () =>
          db.query(
            `UPDATE staging."الفواتير" SET "Inv-Date"='2026-02-30 00:00:00' WHERE "Inv-No"='21819'`,
          ),
        (plan) =>
          assert.ok(
            plan.invoiceQuarantine.some((row) => row.reasonCodes.includes('invalid_invoice_date')),
          ),
      );
      await planFailure(
        db,
        'impossible payment date is quarantined',
        () =>
          db.query(`UPDATE staging."السداد" SET "التاريخ"='2026-02-30 00:00:00' WHERE "ID"='1'`),
        (plan) =>
          assert.ok(
            plan.paymentQuarantine.some((row) => row.reasonCodes.includes('invalid_payment_date')),
          ),
      );
      await planFailure(
        db,
        'excess-precision invoice amount is quarantined',
        () => db.query(`UPDATE staging."الفواتير" SET "Amount"='1.234' WHERE "Inv-No"='21819'`),
        (plan) =>
          assert.ok(
            plan.invoiceQuarantine.some((row) =>
              row.reasonCodes.includes('invalid_invoice_amount'),
            ),
          ),
      );
      await planFailure(
        db,
        'invalid payment Credit and Debit are quarantined independently',
        () => db.query(`UPDATE staging."السداد" SET "Credit"='bad',"Debit"='1.234' WHERE "ID"='1'`),
        (plan) => {
          const row = plan.paymentQuarantine.find((item) =>
            item.reasonCodes.includes('invalid_payment_credit'),
          );
          assert.ok(row?.reasonCodes.includes('invalid_payment_debit'));
        },
      );
      await planFailure(
        db,
        'invalid VAT boolean is quarantined',
        () => db.query(`UPDATE staging."الفواتير" SET "VAT?"='1' WHERE "Inv-No"='21819'`),
        (plan) =>
          assert.ok(
            plan.invoiceQuarantine.some((row) => row.reasonCodes.includes('invalid_vat_boolean')),
          ),
      );
      await planFailure(
        db,
        'invalid report boolean is quarantined',
        () => db.query(`UPDATE staging."الفواتير" SET report='0' WHERE "Inv-No"='21819'`),
        (plan) =>
          assert.ok(
            plan.invoiceQuarantine.some((row) =>
              row.reasonCodes.includes('invalid_report_boolean'),
            ),
          ),
      );
      await reconciliationFailure(
        db,
        'swapped Credit and Debit columns are detected independently',
        () => db.query(`UPDATE payments SET credit=0,debit=16500 WHERE legacy_id=1`),
        /payment target\/source mismatch/,
        'payments',
      );
      await planFailure(
        db,
        'unsupported allocation role is quarantined',
        () => db.query(`UPDATE staging."تقسيم التحصيلات" SET "LawyerAs"='Owner' WHERE "ID"='1'`),
        (plan) =>
          assert.ok(
            plan.allocationQuarantine.some((row) =>
              row.reasonCodes.includes('unsupported_allocation_role'),
            ),
          ),
      );
      await planFailure(
        db,
        'invalid allocation fraction is quarantined',
        () => db.query(`UPDATE staging."تقسيم التحصيلات" SET "Percent"='1.00001' WHERE "ID"='1'`),
        (plan) =>
          assert.ok(
            plan.allocationQuarantine.some((row) =>
              row.reasonCodes.includes('invalid_allocation_share'),
            ),
          ),
      );
      await planFailure(
        db,
        'allocation group not totaling exactly one is quarantined',
        () => db.query(`UPDATE staging."تقسيم التحصيلات" SET "Percent"='.061' WHERE "ID"='1'`),
        (plan) =>
          assert.equal(
            plan.allocationQuarantine.filter((row) =>
              row.reasonCodes.includes('invalid_allocation_total'),
            ).length,
            7,
          ),
      );
      await planFailure(
        db,
        'duplicate invoice/person/role allocation is quarantined',
        () =>
          db.query(
            `INSERT INTO staging."تقسيم التحصيلات"(
               src_file,src_row_num,src_record_key,src_extraction_sha256,
               "ID","InvNo","Lawyer","Percent","LawyerAs")
             VALUES('fixture/allocations-duplicate.csv',1,$1,$2,'9','21819',
                    'Ahmed Abdullah','0','Reviewer')`,
            [fixtureKey(109), FP],
          ),
        (plan) =>
          assert.equal(
            plan.allocationQuarantine.filter((row) =>
              row.reasonCodes.includes('duplicate_allocation'),
            ).length,
            2,
          ),
      );
      await db.query('BEGIN');
      try {
        await db.query(
          `INSERT INTO staging."LawyerShare4Invoices"(
             src_file,src_row_num,src_record_key,src_extraction_sha256,"ID")
           VALUES('fixture/reference-only.csv',1,$1,$2,'1')`,
          [fixtureKey(200), FP],
        );
        await assert.rejects(
          buildBillingPlan(db),
          /LawyerShare4Invoices must remain exactly empty/,
        );
      } finally {
        await db.query('ROLLBACK');
      }
      await clean(db);
      console.log('  ok    non-empty LawyerShare4Invoices is refused');

      await refusal(
        db,
        'changed reviewed person crosswalk is refused immediately',
        () =>
          db.query(
            `UPDATE migration_billing_person_crosswalk SET person_id=4 WHERE source_value='Ahmed Abdullah'`,
          ),
        /reviewed billing rules cannot be updated/,
      );
      await refusal(
        db,
        'changed reviewed currency rule is refused immediately',
        () =>
          db.query(
            `UPDATE migration_billing_currency_rule SET target_value='EGP' WHERE field_kind='transaction_currency' AND source_value=' USD'`,
          ),
        /reviewed billing rules cannot be updated/,
      );
      await db.query('BEGIN');
      try {
        await db.query(
          `INSERT INTO migration_billing_currency_rule(
             field_kind,source_value,target_value,require_zero_amount,
             reviewed_by,reviewed_at,reviewer_note)
           VALUES('transaction_currency',' EUR','EUR',false,
                  'Fixture reviewer',DATE '2026-08-26','Fixture-only candidate')`,
        );
        assert.match(
          (await reconcileBillingHistory(db, false)).defects.join('\n'),
          /reviewed billing currency rules changed/,
        );
      } finally {
        await db.query('ROLLBACK');
      }
      await clean(db);
      console.log(
        '  ok    unapproved inserted billing rule is rejected by permanent reconciliation',
      );

      const legacyDigestBeforeNative = await billingResultDigest(db);
      await db.query('BEGIN');
      await setMaintenanceAuditContext(db, 'test-billing-native-fixtures');
      await db.query(
        `INSERT INTO invoices(invoice_no,amount,currency,updated_at)
         VALUES('fixture-native',10,'EGP',CURRENT_TIMESTAMP) RETURNING id`,
      );
      const nativeInvoiceId = Number(
        (
          await db.query<{ id: number }>(
            `SELECT id FROM invoices WHERE invoice_no='fixture-native' AND legacy_source_record_key IS NULL`,
          )
        ).rows[0]!.id,
      );
      const nativePaymentId = Number(
        (
          await db.query<{ id: number }>(
            `INSERT INTO payments(invoice_id,credit,currency,updated_at)
             VALUES($1,10,'EGP',CURRENT_TIMESTAMP) RETURNING id`,
            [nativeInvoiceId],
          )
        ).rows[0]!.id,
      );
      const nativeRoleId = Number(
        (
          await db.query<{ id: number }>(
            `SELECT id FROM lookup_lawyer_share_role WHERE code='Reviewer'`,
          )
        ).rows[0]!.id,
      );
      const nativeAllocationId = Number(
        (
          await db.query<{ id: number }>(
            `INSERT INTO invoice_allocations(
               invoice_id,person_id,lawyer_role_id,share,updated_at)
             VALUES($1,25,$2,1,CURRENT_TIMESTAMP) RETURNING id`,
            [nativeInvoiceId, nativeRoleId],
          )
        ).rows[0]!.id,
      );
      await db.query(`UPDATE invoices SET details='native edited' WHERE id=$1`, [nativeInvoiceId]);
      await db.query(`UPDATE payments SET details='native edited' WHERE id=$1`, [nativePaymentId]);
      await db.query(`UPDATE invoice_allocations SET updated_by=25 WHERE id=$1`, [
        nativeAllocationId,
      ]);
      assert.equal(
        (
          await db.query(
            `SELECT count(*) FROM (
               SELECT id FROM invoices WHERE id=$1 AND
                 (legacy_id IS NOT NULL OR legacy_contract_id IS NOT NULL OR
                  legacy_currency_raw IS NOT NULL OR legacy_receipt_currency_raw IS NOT NULL OR
                  legacy_status_raw IS NOT NULL OR legacy_type_raw IS NOT NULL OR
                  legacy_source_record_key IS NOT NULL OR
                  legacy_source_extraction_sha256 IS NOT NULL OR legacy_source_payload IS NOT NULL)
               UNION ALL
               SELECT id FROM payments WHERE id=$2 AND
                 (legacy_id IS NOT NULL OR legacy_invoice_no IS NOT NULL OR
                  legacy_currency_raw IS NOT NULL OR legacy_source_record_key IS NOT NULL OR
                  legacy_source_extraction_sha256 IS NOT NULL OR legacy_source_payload IS NOT NULL)
               UNION ALL
               SELECT id FROM invoice_allocations WHERE id=$3 AND
                 (legacy_id IS NOT NULL OR legacy_invoice_no IS NOT NULL OR
                  legacy_lawyer_raw IS NOT NULL OR legacy_percent_raw IS NOT NULL OR
                  legacy_lawyer_as_raw IS NOT NULL OR legacy_source_record_key IS NOT NULL OR
                  legacy_source_extraction_sha256 IS NOT NULL OR legacy_source_payload IS NOT NULL)
             ) migration_provenance`,
            [nativeInvoiceId, nativePaymentId, nativeAllocationId],
          )
        ).rows[0]!.count,
        '0',
      );
      assert.equal(await billingResultDigest(db), legacyDigestBeforeNative);
      assert.deepEqual((await reconcileBillingHistory(db, false)).defects, []);
      await db.query('COMMIT');
      for (const fixture of provenanceFields.invoices)
        await partialProvenanceRefusal(db, 'invoices', nativeInvoiceId, fixture);
      for (const fixture of provenanceFields.payments)
        await partialProvenanceRefusal(db, 'payments', nativePaymentId, fixture);
      for (const fixture of provenanceFields.invoice_allocations)
        await partialProvenanceRefusal(db, 'invoice_allocations', nativeAllocationId, fixture);
      assert.equal(await billingResultDigest(db), legacyDigestBeforeNative);
      assert.deepEqual((await reconcileBillingHistory(db, false)).defects, []);
      await db.query('BEGIN');
      await setMaintenanceAuditContext(db, 'test-billing-native-cleanup');
      await db.query(`DELETE FROM invoice_allocations WHERE id=$1`, [nativeAllocationId]);
      await db.query(`DELETE FROM payments WHERE id=$1`, [nativePaymentId]);
      await db.query(`DELETE FROM invoices WHERE id=$1`, [nativeInvoiceId]);
      await db.query('COMMIT');
      await clean(db);
      console.log(
        '  ok    application-native invoice, payment and allocation remain valid, editable and outside legacy reconciliation/digest',
      );

      await db.query('BEGIN');
      try {
        await setMaintenanceAuditContext(db, 'test-billing-complete-identity');
        const completeInvoiceId = Number(
          (
            await db.query<{ id: number }>(
              `INSERT INTO invoices(
                 legacy_id,invoice_no,fee_letter_id,legacy_contract_id,invoice_date,
                 amount,currency,legacy_currency_raw,status_id,legacy_status_raw,
                 type_id,legacy_type_raw,legacy_receipt_currency_raw,
                 legacy_source_record_key,legacy_source_extraction_sha256,
                 legacy_source_payload,updated_at)
               SELECT 900001,'fixture-complete',f.id,'100',DATE '2026-08-26',
                      1,'EGP','EGP',s.id,'Paid',NULL,NULL,NULL,$1,$2,
                      '{"Inv-No":"fixture-complete"}'::jsonb,CURRENT_TIMESTAMP
                 FROM fee_letters f CROSS JOIN lookup_invoice_status s
                WHERE f.contract_id=100 AND s.code='Paid'
               RETURNING id`,
              [fixtureKey(400), FP],
            )
          ).rows[0]!.id,
        );
        const completePaymentId = Number(
          (
            await db.query<{ id: number }>(
              `INSERT INTO payments(
                 legacy_id,invoice_id,legacy_invoice_no,credit,currency,
                 legacy_currency_raw,legacy_source_record_key,
                 legacy_source_extraction_sha256,legacy_source_payload,updated_at)
               VALUES(900001,$1,'fixture-complete',0,NULL,NULL,$2,$3,
                      '{"ID":"900001"}'::jsonb,CURRENT_TIMESTAMP)
               RETURNING id`,
              [completeInvoiceId, fixtureKey(401), FP],
            )
          ).rows[0]!.id,
        );
        const completeAllocationId = Number(
          (
            await db.query<{ id: number }>(
              `INSERT INTO invoice_allocations(
                 legacy_id,invoice_id,legacy_invoice_no,person_id,
                 legacy_lawyer_raw,share,legacy_percent_raw,lawyer_role_id,
                 legacy_lawyer_as_raw,legacy_source_record_key,
                 legacy_source_extraction_sha256,legacy_source_payload,updated_at)
               SELECT 900001,$1,'fixture-complete',25,'Ahmed Abdullah',1,
                      '1.000',r.id,'Reviewer',$2,$3,
                      '{"ID":"900001"}'::jsonb,CURRENT_TIMESTAMP
                 FROM lookup_lawyer_share_role r WHERE r.code='Reviewer'
               RETURNING id`,
              [completeInvoiceId, fixtureKey(402), FP],
            )
          ).rows[0]!.id,
        );
        assert.ok(completeInvoiceId > 0);
        assert.ok(completePaymentId > 0);
        assert.ok(completeAllocationId > 0);
        assert.deepEqual(await billingStructureFailures(db), []);
      } finally {
        await db.query('ROLLBACK');
      }
      await clean(db);
      console.log(
        '  ok    controlled complete migrated invoice, payment and allocation inserts remain structurally valid, including reviewed NULL raw values',
      );

      const digestBeforeTrace = await billingResultDigest(db);
      const keysBefore = (await buildBillingPlan(db)).invoices.map((row) => row.srcRecordKey);
      await db.query('BEGIN');
      try {
        await db.query(
          `UPDATE staging."الفواتير" SET src_file='renamed.csv',src_row_num=999,"Pay-Date"='2000-01-01 00:00:00' WHERE "Inv-No"='21819'`,
        );
        const reordered = await buildBillingPlan(db);
        assert.deepEqual(
          reordered.invoices.map((row) => row.srcRecordKey),
          keysBefore,
        );
        assert.equal(await billingResultDigest(db), digestBeforeTrace);
        assert.equal(reordered.invoices[0]!.sourcePayload['Pay-Date'], undefined);
      } finally {
        await db.query('ROLLBACK');
      }
      await clean(db);
      console.log(
        '  ok    filename, row position and Pay-Date change neither durable identity nor result digest',
      );

      const snapshot = (
        await db.query(
          `SELECT jsonb_agg(to_jsonb(x) ORDER BY kind,id) snapshot FROM (
             SELECT 'I' kind,id,created_at,updated_at FROM invoices WHERE legacy_source_record_key IS NOT NULL
             UNION ALL SELECT 'P',id,created_at,updated_at FROM payments WHERE legacy_source_record_key IS NOT NULL
             UNION ALL SELECT 'A',id,created_at,updated_at FROM invoice_allocations WHERE legacy_source_record_key IS NOT NULL
           ) x`,
        )
      ).rows[0];
      const second = await runBillingTransform({
        databaseUrl: fixtureUrl.toString(),
        apply: true,
        expectedCounts: expected,
      });
      assert.equal(second.digest, applied.digest);
      assert.deepEqual(
        (
          await db.query(
            `SELECT jsonb_agg(to_jsonb(x) ORDER BY kind,id) snapshot FROM (
               SELECT 'I' kind,id,created_at,updated_at FROM invoices WHERE legacy_source_record_key IS NOT NULL
               UNION ALL SELECT 'P',id,created_at,updated_at FROM payments WHERE legacy_source_record_key IS NOT NULL
               UNION ALL SELECT 'A',id,created_at,updated_at FROM invoice_allocations WHERE legacy_source_record_key IS NOT NULL
             ) x`,
          )
        ).rows[0],
        snapshot,
      );
      console.log('  ok    identical rerun preserves IDs, timestamps, rows and digest');

      await db.query(
        `INSERT INTO staging."الفواتير"(
           src_file,src_row_num,src_record_key,src_extraction_sha256,"Inv-No",
           "contractID","Inv-Date","Amount","Currency","Inv-Details","Inv-Status",
           "Inv-Type","VAT?",report)
         VALUES('fixture/late.csv',1,$1,$2,'1002','100','2026-08-25 00:00:00',
                '10','EGP','late','Paid','Service','false','false')`,
        [fixtureKey(999), FP],
      );
      await assert.rejects(
        runBillingTransform({
          databaseUrl: fixtureUrl.toString(),
          apply: true,
          forceFailure: true,
          expectedCounts: { ...expected, invoiceSource: 3, invoiceTarget: 2 },
        }),
        /forced late Task 2\.10A failure/,
      );
      assert.equal(
        (await db.query(`SELECT count(*) FROM invoices WHERE legacy_id=1002`)).rows[0]!.count,
        '0',
      );
      await db.query(`DELETE FROM staging."الفواتير" WHERE "Inv-No"='1002'`);
      await clean(db);
      console.log('  ok    forced late failure rolls back every newly planned billing row');

      await refusal(
        db,
        'UPDATE of a migrated invoice is refused immediately',
        () => db.query(`UPDATE invoices SET details='blocked' WHERE legacy_id=21819`),
        /migrated billing history cannot be updated or deleted/,
      );
      await refusal(
        db,
        'UPDATE of a migrated payment is refused immediately',
        () => db.query(`UPDATE payments SET details='blocked' WHERE legacy_id=1`),
        /migrated billing history cannot be updated or deleted/,
      );
      await refusal(
        db,
        'UPDATE of a migrated allocation is refused immediately',
        () => db.query(`UPDATE invoice_allocations SET share=.5 WHERE legacy_id=1`),
        /migrated billing history cannot be updated or deleted/,
      );
      await refusal(
        db,
        'DELETE of a migrated invoice is refused immediately',
        () => db.query(`DELETE FROM invoices WHERE legacy_id=21819`),
        /migrated billing history cannot be updated or deleted/,
      );
      await refusal(
        db,
        'DELETE of a migrated payment is refused immediately',
        () => db.query(`DELETE FROM payments WHERE legacy_id=1`),
        /migrated billing history cannot be updated or deleted/,
      );
      await refusal(
        db,
        'DELETE of a migrated allocation is refused immediately',
        () => db.query(`DELETE FROM invoice_allocations WHERE legacy_id=1`),
        /migrated billing history cannot be updated or deleted/,
      );
      await transactionalRefusal(
        db,
        'TRUNCATE of invoices is refused by its own migration trigger',
        async () => {
          await db.query('ALTER TABLE payments DROP CONSTRAINT payments_invoice_id_fkey');
          await db.query(
            'ALTER TABLE invoice_allocations DROP CONSTRAINT invoice_allocations_invoice_id_fkey',
          );
        },
        () => db.query('TRUNCATE invoices'),
        /billing history TRUNCATE is refused/,
      );
      await refusal(
        db,
        'TRUNCATE of payments is refused immediately',
        () => db.query('TRUNCATE payments'),
        /billing history TRUNCATE is refused/,
      );
      await refusal(
        db,
        'TRUNCATE of allocations is refused immediately',
        () => db.query('TRUNCATE invoice_allocations'),
        /billing history TRUNCATE is refused/,
      );
      await refusal(
        db,
        'DELETE of reviewed person crosswalk is refused immediately',
        () =>
          db.query(
            `DELETE FROM migration_billing_person_crosswalk WHERE source_value='Ahmed Abdullah'`,
          ),
        /reviewed billing rules cannot be deleted or truncated/,
      );
      await refusal(
        db,
        'TRUNCATE of reviewed person crosswalk is refused immediately',
        () => db.query('TRUNCATE migration_billing_person_crosswalk'),
        /reviewed billing rules cannot be deleted or truncated/,
      );
      await refusal(
        db,
        'DELETE of reviewed currency rule is refused immediately',
        () =>
          db.query(
            `DELETE FROM migration_billing_currency_rule WHERE field_kind='transaction_currency' AND source_value=' USD'`,
          ),
        /reviewed billing rules cannot be deleted or truncated/,
      );
      await refusal(
        db,
        'TRUNCATE of reviewed currency rules is refused immediately',
        () => db.query('TRUNCATE migration_billing_currency_rule'),
        /reviewed billing rules cannot be deleted or truncated/,
      );

      await db.query('BEGIN');
      try {
        await db.query(`CREATE OR REPLACE FUNCTION public.refuse_legacy_billing_change()
          RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN COALESCE(NEW,OLD); END$$`);
        const beforeWrite = (await db.query(`SELECT count(*) FROM invoices`)).rows[0]!.count;
        assert.match(
          (await billingStructureFailures(db)).join('\n'),
          /function definition: public\.refuse_legacy_billing_change/,
        );
        await assert.rejects(async () => {
          const failures = await billingStructureFailures(db);
          assert.deepEqual(
            failures,
            [],
            `Task 2.10A database safeguards differ from the PostgreSQL 17.11 reviewed definitions:\n${failures.join('\n')}`,
          );
          await db.query(
            `INSERT INTO invoices(invoice_no,updated_at) VALUES('must-not-write',CURRENT_TIMESTAMP)`,
          );
        }, /database safeguards differ/);
        assert.equal((await db.query(`SELECT count(*) FROM invoices`)).rows[0]!.count, beforeWrite);
      } finally {
        await db.query('ROLLBACK');
      }
      await clean(db);
      assert.equal(
        (await db.query(`SELECT count(*) FROM invoices WHERE invoice_no='must-not-write'`)).rows[0]!
          .count,
        '0',
      );
      console.log(
        '  ok    weakened migrated-row safeguard aborts before apply writes and its fixture mutation rolls back',
      );

      await structureFailure(
        db,
        'expanded invoice provenance CHECK weakened with OR true is rejected',
        async () => {
          await db.query('ALTER TABLE invoices DROP CONSTRAINT invoices_source_identity_shape');
          await db.query(`ALTER TABLE invoices ADD CONSTRAINT invoices_source_identity_shape
            CHECK (legacy_source_record_key IS NULL OR legacy_source_record_key IS NOT NULL OR true)`);
        },
        /constraint definition: invoices_source_identity_shape/,
      );
      await structureFailure(
        db,
        'expanded payment provenance CHECK weakened with OR true is rejected',
        async () => {
          await db.query('ALTER TABLE payments DROP CONSTRAINT payments_source_identity_shape');
          await db.query(`ALTER TABLE payments ADD CONSTRAINT payments_source_identity_shape
            CHECK (legacy_source_record_key IS NULL OR legacy_source_record_key IS NOT NULL OR true)`);
        },
        /constraint definition: payments_source_identity_shape/,
      );
      await structureFailure(
        db,
        'expanded allocation provenance CHECK weakened with OR true is rejected',
        async () => {
          await db.query(
            'ALTER TABLE invoice_allocations DROP CONSTRAINT invoice_allocations_source_identity_shape',
          );
          await db.query(`ALTER TABLE invoice_allocations
            ADD CONSTRAINT invoice_allocations_source_identity_shape
            CHECK (legacy_source_record_key IS NULL OR legacy_source_record_key IS NOT NULL OR true)`);
        },
        /constraint definition: invoice_allocations_source_identity_shape/,
      );
      await structureFailure(
        db,
        'non-unique source identity index with the expected name and column is rejected',
        async () => {
          await db.query('DROP INDEX invoices_legacy_source_record_key_key');
          await db.query(
            'CREATE INDEX invoices_legacy_source_record_key_key ON invoices(legacy_source_record_key)',
          );
        },
        /index definition: invoices_legacy_source_record_key_key/,
      );
      await structureFailure(
        db,
        'correctly named trigger pointing to a permissive function is rejected',
        async () => {
          await db.query(`CREATE FUNCTION quarantine.permissive_billing_evidence_change()
            RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN OLD; END$$`);
          await db.query(
            'DROP TRIGGER invoice_transform_no_change ON quarantine.invoice_transform',
          );
          await db.query(`CREATE TRIGGER invoice_transform_no_change BEFORE UPDATE OR DELETE
            ON quarantine.invoice_transform FOR EACH ROW
            EXECUTE FUNCTION quarantine.permissive_billing_evidence_change()`);
        },
        /trigger definition: invoice_transform_no_change/,
      );
      await structureFailure(
        db,
        'permissive function retaining the diagnostic phrase is rejected',
        () =>
          db.query(`CREATE OR REPLACE FUNCTION quarantine.refuse_billing_evidence_change()
            RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
              -- Task 2.10A billing evidence DELETE/TRUNCATE is refused
              RETURN OLD;
            END$$`),
        /function definition/,
      );
      await structureFailure(
        db,
        'per-function search_path configuration is rejected',
        () =>
          db.query(
            'ALTER FUNCTION quarantine.refuse_billing_evidence_change() SET search_path=quarantine',
          ),
        /function definition/,
      );
      await structureFailure(
        db,
        'migrated-row guard per-function search_path configuration is rejected',
        () =>
          db.query('ALTER FUNCTION public.refuse_legacy_billing_change() SET search_path=public'),
        /function definition: public\.refuse_legacy_billing_change/,
      );
      await structureFailure(
        db,
        'reviewed-rule guard permissive body is rejected',
        () =>
          db.query(`CREATE OR REPLACE FUNCTION public.refuse_billing_rule_change()
            RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
              -- Task 2.10A reviewed billing rules cannot be deleted or truncated
              RETURN COALESCE(NEW,OLD);
            END$$`),
        /function definition: public\.refuse_billing_rule_change/,
      );
      await structureFailure(
        db,
        'migrated-row trigger with incomplete events is rejected',
        async () => {
          await db.query('DROP TRIGGER payments_legacy_no_change ON payments');
          await db.query(`CREATE TRIGGER payments_legacy_no_change BEFORE UPDATE
            ON payments FOR EACH ROW EXECUTE FUNCTION public.refuse_legacy_billing_change()`);
        },
        /trigger definition: payments_legacy_no_change/,
      );
      await structureFailure(
        db,
        'foreign key with the wrong delete action is rejected',
        async () => {
          await db.query('ALTER TABLE payments DROP CONSTRAINT payments_invoice_id_fkey');
          await db.query(`ALTER TABLE payments ADD CONSTRAINT payments_invoice_id_fkey
            FOREIGN KEY(invoice_id) REFERENCES invoices(id)
            ON UPDATE CASCADE ON DELETE CASCADE`);
        },
        /foreign-key definition: payments_invoice_id_fkey/,
      );

      await assert.rejects(
        db.query(`DELETE FROM quarantine.invoice_transform WHERE legacy_invoice_no_raw='1001'`),
        /DELETE\/TRUNCATE is refused/,
      );
      await clean(db);
      console.log('  ok    immutable quarantine evidence refuses deletion');

      assert.equal(
        (
          await db.query<{ count: string }>(`
            SELECT count(*) FROM information_schema.columns
             WHERE table_schema IN ('public','quarantine')
               AND lower(replace(column_name,'_',''))='paydate'`)
        ).rows[0]!.count,
        '0',
      );
      assert.equal(
        (
          await db.query<{ count: string }>(`
            SELECT count(*) FROM (
              SELECT legacy_source_payload payload FROM invoices
              UNION ALL SELECT source_payload FROM quarantine.invoice_transform
            ) x WHERE payload ? 'Pay-Date'`)
        ).rows[0]!.count,
        '0',
      );
      console.log('  ok    Pay-Date has no target, audit field or permitted payload');
    } finally {
      await db.end();
    }
  } finally {
    if (created) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [
        databaseName,
      ]);
      await admin.query(`DROP DATABASE ${identifier(databaseName)}`);
    }
    await admin.end();
  }
  console.log('Task 2.10A billing fixture passed. Disposable database removed.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
