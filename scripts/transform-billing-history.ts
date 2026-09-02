import 'dotenv/config';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import type { ClientBase } from 'pg';
import { setMaintenanceAuditContext } from './lib/audit-maintenance-context';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  buildBillingPlan,
  type AllocationTarget,
  type BillingPlan,
  type BillingQuarantine,
  type InvoiceTarget,
  type PaymentTarget,
} from './lib/billing-transform-plan';
import { reconcileBillingHistory } from './lib/billing-reconciliation';
import { billingStructureFailures } from './lib/billing-structure';
import { task210aProtectedState } from './lib/task210a-protected-state';

type ExpectedCounts = {
  invoiceSource: number;
  invoiceTarget: number;
  invoiceQuarantine: number;
  paymentSource: number;
  paymentTarget: number;
  paymentQuarantine: number;
  allocationSource: number;
  allocationTarget: number;
  allocationQuarantine: number;
  allocationGroups: number;
  allocationPeople: number;
  referenceOnly: number;
};
type Options = {
  databaseUrl?: string;
  apply?: boolean;
  forceFailure?: boolean;
  expectedCounts?: ExpectedCounts;
};

export const LIVE_BILLING_COUNTS: ExpectedCounts = {
  invoiceSource: 543,
  invoiceTarget: 543,
  invoiceQuarantine: 0,
  paymentSource: 597,
  paymentTarget: 597,
  paymentQuarantine: 0,
  allocationSource: 47,
  allocationTarget: 47,
  allocationQuarantine: 0,
  allocationGroups: 15,
  allocationPeople: 9,
  referenceOnly: 0,
};

async function assertBillingStructure(db: ClientBase): Promise<void> {
  const failures = await billingStructureFailures(db);
  assert.deepEqual(
    failures,
    [],
    `Task 2.10A database safeguards differ from the PostgreSQL 17.11 reviewed definitions:\n${failures.join('\n')}`,
  );
}

function assertPlanCounts(plan: BillingPlan, expected: ExpectedCounts): void {
  assert.equal(plan.invoiceSourceCount, expected.invoiceSource);
  assert.equal(plan.invoices.length, expected.invoiceTarget);
  assert.equal(plan.invoiceQuarantine.length, expected.invoiceQuarantine);
  assert.equal(plan.paymentSourceCount, expected.paymentSource);
  assert.equal(plan.payments.length, expected.paymentTarget);
  assert.equal(plan.paymentQuarantine.length, expected.paymentQuarantine);
  assert.equal(plan.allocationSourceCount, expected.allocationSource);
  assert.equal(plan.allocations.length, expected.allocationTarget);
  assert.equal(plan.allocationQuarantine.length, expected.allocationQuarantine);
  assert.equal(
    new Set(plan.allocations.map((row) => row.legacyInvoiceNo)).size,
    expected.allocationGroups,
  );
  assert.equal(
    new Set(plan.allocations.map((row) => row.personId)).size,
    expected.allocationPeople,
  );
  assert.equal(plan.referenceOnlyCount, expected.referenceOnly);
}

async function insertInvoices(db: ClientBase, rows: readonly InvoiceTarget[]): Promise<void> {
  await db.query(
    `INSERT INTO invoices(
       legacy_id,invoice_no,fee_letter_id,legacy_contract_id,invoice_date,amount,
       amount_usd,currency,legacy_currency_raw,details,status_id,legacy_status_raw,
       type_id,legacy_type_raw,vat,report,receipt_amount,receipt_currency,
       legacy_receipt_currency_raw,legacy_source_record_key,
       legacy_source_extraction_sha256,legacy_source_payload,updated_at)
     SELECT x."legacyId",x."invoiceNo",x."feeLetterId",x."legacyContractId",
            x."invoiceDate"::date,x.amount::numeric,x."amountUsd"::numeric,
            x.currency,x."legacyCurrencyRaw",x.details,x."statusId",x."legacyStatusRaw",
            x."typeId",x."legacyTypeRaw",x.vat,x.report,x."receiptAmount"::numeric,
            x."receiptCurrency",x."legacyReceiptCurrencyRaw",x."srcRecordKey",
            x."extractionSha256",x."sourcePayload",CURRENT_TIMESTAMP
       FROM jsonb_to_recordset($1::jsonb) x(
         "srcRecordKey" text,"extractionSha256" text,"legacyId" integer,
         "invoiceNo" text,"feeLetterId" integer,"legacyContractId" text,
         "invoiceDate" text,amount text,"amountUsd" text,currency text,
         "legacyCurrencyRaw" text,details text,"statusId" smallint,
         "legacyStatusRaw" text,"typeId" smallint,"legacyTypeRaw" text,
         vat boolean,report boolean,"receiptAmount" text,"receiptCurrency" text,
         "legacyReceiptCurrencyRaw" text,"sourcePayload" jsonb)
     ON CONFLICT(legacy_source_record_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

async function insertPayments(db: ClientBase, rows: readonly PaymentTarget[]): Promise<void> {
  await db.query(
    `INSERT INTO payments(
       legacy_id,invoice_id,legacy_invoice_no,payment_date,credit,debit,currency,
       legacy_currency_raw,details,legacy_source_record_key,
       legacy_source_extraction_sha256,legacy_source_payload,updated_at)
     SELECT x."legacyId",i.id,x."legacyInvoiceNo",x."paymentDate"::date,
            x.credit::numeric,x.debit::numeric,x.currency,x."legacyCurrencyRaw",
            x.details,x."srcRecordKey",x."extractionSha256",x."sourcePayload",
            CURRENT_TIMESTAMP
       FROM jsonb_to_recordset($1::jsonb) x(
         "srcRecordKey" text,"extractionSha256" text,"legacyId" integer,
         "invoiceSourceKey" text,"legacyInvoiceNo" text,"paymentDate" text,
         credit text,debit text,currency text,"legacyCurrencyRaw" text,
         details text,"sourcePayload" jsonb)
       JOIN invoices i ON i.legacy_source_record_key=x."invoiceSourceKey"
     ON CONFLICT(legacy_source_record_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

async function insertAllocations(db: ClientBase, rows: readonly AllocationTarget[]): Promise<void> {
  await db.query(
    `INSERT INTO invoice_allocations(
       legacy_id,invoice_id,legacy_invoice_no,person_id,legacy_lawyer_raw,share,
       legacy_percent_raw,lawyer_role_id,legacy_lawyer_as_raw,
       legacy_source_record_key,legacy_source_extraction_sha256,
       legacy_source_payload,updated_at)
     SELECT x."legacyId",i.id,x."legacyInvoiceNo",x."personId",
            x."legacyLawyerRaw",x.share::numeric,x."legacyPercentRaw",
            x."lawyerRoleId",x."legacyLawyerAsRaw",x."srcRecordKey",
            x."extractionSha256",x."sourcePayload",CURRENT_TIMESTAMP
       FROM jsonb_to_recordset($1::jsonb) x(
         "srcRecordKey" text,"extractionSha256" text,"legacyId" integer,
         "invoiceSourceKey" text,"legacyInvoiceNo" text,"personId" integer,
         "legacyLawyerRaw" text,share text,"legacyPercentRaw" text,
         "lawyerRoleId" smallint,"legacyLawyerAsRaw" text,"sourcePayload" jsonb)
       JOIN invoices i ON i.legacy_source_record_key=x."invoiceSourceKey"
     ON CONFLICT(legacy_source_record_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

async function insertQuarantine(
  db: ClientBase,
  kind: 'invoice' | 'payment' | 'allocation',
  rows: readonly BillingQuarantine[],
): Promise<void> {
  if (kind === 'invoice') {
    await db.query(
      `INSERT INTO quarantine.invoice_transform(
         src_record_key,extraction_sha256,src_file,src_row_num,
         legacy_invoice_no_raw,reason_codes,reason_details,source_payload)
       SELECT x."srcRecordKey",x."extractionSha256",x."srcFile",x."srcRowNum",
              x."legacyInvoiceNoRaw",x."reasonCodes",x."reasonDetails",x."sourcePayload"
         FROM jsonb_to_recordset($1::jsonb) x(
           "srcRecordKey" text,"extractionSha256" text,"srcFile" text,
           "srcRowNum" integer,"legacyInvoiceNoRaw" text,"reasonCodes" text[],
           "reasonDetails" jsonb,"sourcePayload" jsonb)
       ON CONFLICT(src_record_key) DO NOTHING`,
      [JSON.stringify(rows)],
    );
    return;
  }
  if (kind === 'payment') {
    await db.query(
      `INSERT INTO quarantine.payment_transform(
         src_record_key,extraction_sha256,src_file,src_row_num,
         legacy_payment_id_raw,legacy_invoice_no_raw,reason_codes,reason_details,source_payload)
       SELECT x."srcRecordKey",x."extractionSha256",x."srcFile",x."srcRowNum",
              x."legacyPaymentIdRaw",x."legacyInvoiceNoRaw",x."reasonCodes",
              x."reasonDetails",x."sourcePayload"
         FROM jsonb_to_recordset($1::jsonb) x(
           "srcRecordKey" text,"extractionSha256" text,"srcFile" text,
           "srcRowNum" integer,"legacyPaymentIdRaw" text,"legacyInvoiceNoRaw" text,
           "reasonCodes" text[],"reasonDetails" jsonb,"sourcePayload" jsonb)
       ON CONFLICT(src_record_key) DO NOTHING`,
      [JSON.stringify(rows)],
    );
    return;
  }
  await db.query(
    `INSERT INTO quarantine.invoice_allocation_transform(
       src_record_key,extraction_sha256,src_file,src_row_num,
       legacy_allocation_id_raw,legacy_invoice_no_raw,reason_codes,reason_details,source_payload)
     SELECT x."srcRecordKey",x."extractionSha256",x."srcFile",x."srcRowNum",
            x."legacyAllocationIdRaw",x."legacyInvoiceNoRaw",x."reasonCodes",
            x."reasonDetails",x."sourcePayload"
       FROM jsonb_to_recordset($1::jsonb) x(
         "srcRecordKey" text,"extractionSha256" text,"srcFile" text,
         "srcRowNum" integer,"legacyAllocationIdRaw" text,"legacyInvoiceNoRaw" text,
         "reasonCodes" text[],"reasonDetails" jsonb,"sourcePayload" jsonb)
     ON CONFLICT(src_record_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

async function lockBillingDomain(db: ClientBase): Promise<void> {
  await db.query(`LOCK TABLE
    staging."الفواتير",staging."السداد",staging."تقسيم التحصيلات",
    staging."LawyerShare4Invoices",fee_letters,people,lookup_invoice_status,
    lookup_invoice_type,lookup_lawyer_share_role,
    migration_billing_person_crosswalk,migration_billing_currency_rule
    IN SHARE MODE`);
  await db.query(`LOCK TABLE
    invoices,payments,invoice_allocations,quarantine.invoice_transform,
    quarantine.payment_transform,quarantine.invoice_allocation_transform
    IN SHARE ROW EXCLUSIVE MODE`);
}

/** Stable semantic digest. It excludes generated IDs, timestamps, filenames and row positions. */
export async function billingResultDigest(db: ClientBase): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(
      coalesce(string_agg(kind||E'\\t'||identity||E'\\t'||payload,E'\\n'
                          ORDER BY kind,identity),''),'UTF8')),'hex') digest
      FROM (
        SELECT 'I' kind,i.legacy_source_record_key identity,
               jsonb_build_object(
                 'extraction',i.legacy_source_extraction_sha256,'legacy_id',i.legacy_id,
                 'invoice_no',i.invoice_no,'fee_source_key',f.legacy_source_record_key,
                 'legacy_contract_id',i.legacy_contract_id,'invoice_date',i.invoice_date,
                 'amount',i.amount,'amount_usd',i.amount_usd,'currency',i.currency,
                 'legacy_currency_raw',i.legacy_currency_raw,'details',i.details,
                 'status',s.code,'legacy_status_raw',i.legacy_status_raw,
                 'type',t.code,'legacy_type_raw',i.legacy_type_raw,'vat',i.vat,
                 'report',i.report,'receipt_amount',i.receipt_amount,
                 'receipt_currency',i.receipt_currency,
                 'legacy_receipt_currency_raw',i.legacy_receipt_currency_raw,
                 'source_payload',i.legacy_source_payload)::text payload
          FROM invoices i JOIN fee_letters f ON f.id=i.fee_letter_id
          JOIN lookup_invoice_status s ON s.id=i.status_id
          LEFT JOIN lookup_invoice_type t ON t.id=i.type_id
         WHERE i.legacy_source_record_key IS NOT NULL
        UNION ALL
        SELECT 'P',p.legacy_source_record_key,
               jsonb_build_object(
                 'extraction',p.legacy_source_extraction_sha256,'legacy_id',p.legacy_id,
                 'invoice_source_key',i.legacy_source_record_key,
                 'legacy_invoice_no',p.legacy_invoice_no,'payment_date',p.payment_date,
                 'credit',p.credit,'debit',p.debit,'currency',p.currency,
                 'legacy_currency_raw',p.legacy_currency_raw,'details',p.details,
                 'source_payload',p.legacy_source_payload)::text
          FROM payments p JOIN invoices i ON i.id=p.invoice_id
         WHERE p.legacy_source_record_key IS NOT NULL
        UNION ALL
        SELECT 'A',a.legacy_source_record_key,
               jsonb_build_object(
                 'extraction',a.legacy_source_extraction_sha256,'legacy_id',a.legacy_id,
                 'invoice_source_key',i.legacy_source_record_key,
                 'legacy_invoice_no',a.legacy_invoice_no,'person_id',a.person_id,
                 'legacy_lawyer_raw',a.legacy_lawyer_raw,'share',a.share,
                 'legacy_percent_raw',a.legacy_percent_raw,'role',r.code,
                 'legacy_lawyer_as_raw',a.legacy_lawyer_as_raw,
                 'source_payload',a.legacy_source_payload)::text
          FROM invoice_allocations a JOIN invoices i ON i.id=a.invoice_id
          JOIN lookup_lawyer_share_role r ON r.id=a.lawyer_role_id
         WHERE a.legacy_source_record_key IS NOT NULL
        UNION ALL
        SELECT 'QI',q.src_record_key,
               jsonb_build_object('extraction',q.extraction_sha256,
                 'legacy_invoice_no_raw',q.legacy_invoice_no_raw,
                 'reason_codes',q.reason_codes,'reason_details',q.reason_details,
                 'source_payload',q.source_payload)::text
          FROM quarantine.invoice_transform q
        UNION ALL
        SELECT 'QP',q.src_record_key,
               jsonb_build_object('extraction',q.extraction_sha256,
                 'legacy_payment_id_raw',q.legacy_payment_id_raw,
                 'legacy_invoice_no_raw',q.legacy_invoice_no_raw,
                 'reason_codes',q.reason_codes,'reason_details',q.reason_details,
                 'source_payload',q.source_payload)::text
          FROM quarantine.payment_transform q
        UNION ALL
        SELECT 'QA',q.src_record_key,
               jsonb_build_object('extraction',q.extraction_sha256,
                 'legacy_allocation_id_raw',q.legacy_allocation_id_raw,
                 'legacy_invoice_no_raw',q.legacy_invoice_no_raw,
                 'reason_codes',q.reason_codes,'reason_details',q.reason_details,
                 'source_payload',q.source_payload)::text
          FROM quarantine.invoice_allocation_transform q
      ) result`);
  return result.rows[0]?.digest ?? '';
}

export async function runBillingTransform(options: Options = {}) {
  const expected =
    options.expectedCounts ?? (options.databaseUrl === undefined ? LIVE_BILLING_COUNTS : undefined);
  return withApprovedMigrationClient(
    async (db) => {
      const preview = await buildBillingPlan(db);
      if (expected) assertPlanCounts(preview, expected);
      if (options.apply !== true) return { plan: preview, reconciliation: null, digest: null };

      const protectedBefore = await task210aProtectedState(db);
      await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      try {
        await setMaintenanceAuditContext(db, 'task-2-10a-billing-history');
        await lockBillingDomain(db);
        await assertBillingStructure(db);
        const plan = await buildBillingPlan(db);
        if (expected) assertPlanCounts(plan, expected);
        await insertInvoices(db, plan.invoices);
        await insertQuarantine(db, 'invoice', plan.invoiceQuarantine);
        await insertPayments(db, plan.payments);
        await insertQuarantine(db, 'payment', plan.paymentQuarantine);
        await insertAllocations(db, plan.allocations);
        await insertQuarantine(db, 'allocation', plan.allocationQuarantine);
        if (options.forceFailure) throw new Error('forced late Task 2.10A failure');
        const reconciliation = await reconcileBillingHistory(db, options.databaseUrl === undefined);
        assert.deepEqual(reconciliation.defects, [], reconciliation.defects.join('\n'));
        if (expected) {
          assert.equal(reconciliation.invoiceSourceCount, expected.invoiceSource);
          assert.equal(reconciliation.invoiceTargetCount, expected.invoiceTarget);
          assert.equal(reconciliation.invoiceQuarantineCount, expected.invoiceQuarantine);
          assert.equal(reconciliation.paymentSourceCount, expected.paymentSource);
          assert.equal(reconciliation.paymentTargetCount, expected.paymentTarget);
          assert.equal(reconciliation.paymentQuarantineCount, expected.paymentQuarantine);
          assert.equal(reconciliation.allocationSourceCount, expected.allocationSource);
          assert.equal(reconciliation.allocationTargetCount, expected.allocationTarget);
          assert.equal(reconciliation.allocationQuarantineCount, expected.allocationQuarantine);
          assert.equal(reconciliation.allocationGroupCount, expected.allocationGroups);
          assert.equal(reconciliation.distinctAllocationPeople, expected.allocationPeople);
          assert.equal(reconciliation.referenceOnlyCount, expected.referenceOnly);
        }
        assert.equal(await task210aProtectedState(db), protectedBefore);
        await assertBillingStructure(db);
        const digest = await billingResultDigest(db);
        await db.query('COMMIT');
        return { plan, reconciliation, digest };
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    },
    { databaseUrl: options.databaseUrl },
  );
}

function reasonBreakdown(rows: readonly BillingQuarantine[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows)
    for (const code of row.reasonCodes) result[code] = (result[code] ?? 0) + 1;
  return result;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const result = await runBillingTransform({ apply });
  console.log(apply ? 'TASK 2.10A APPLIED' : 'TASK 2.10A DRY RUN — no database writes');
  console.log(
    `Invoices: ${result.plan.invoiceSourceCount} = ${result.plan.invoices.length} transformed + ${result.plan.invoiceQuarantine.length} quarantined ${JSON.stringify(reasonBreakdown(result.plan.invoiceQuarantine))}`,
  );
  console.log(
    `Payments: ${result.plan.paymentSourceCount} = ${result.plan.payments.length} transformed + ${result.plan.paymentQuarantine.length} quarantined ${JSON.stringify(reasonBreakdown(result.plan.paymentQuarantine))}`,
  );
  console.log(
    `Allocations: ${result.plan.allocationSourceCount} = ${result.plan.allocations.length} transformed + ${result.plan.allocationQuarantine.length} quarantined ${JSON.stringify(reasonBreakdown(result.plan.allocationQuarantine))}`,
  );
  console.log(`LawyerShare4Invoices: ${result.plan.referenceOnlyCount}`);
  if (result.digest) console.log(`Result digest: ${result.digest}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
