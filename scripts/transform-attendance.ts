import 'dotenv/config';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import type { ClientBase } from 'pg';
import { setMaintenanceAuditContext } from './lib/audit-maintenance-context';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  ATTENDANCE_SOURCE_BASELINE,
  attendanceSourceBaselineFailures,
  attendanceSourceState,
} from './lib/attendance-baseline';
import { reconcileAttendance } from './lib/attendance-reconciliation';
import { attendanceStructureFailures } from './lib/attendance-structure';
import {
  buildAttendancePlan,
  type AttendancePlan,
  type AttendanceQuarantine,
  type AttendanceTarget,
} from './lib/attendance-transform-plan';
import { BILLING_CANONICAL_BASELINE, billingCanonicalState } from './lib/billing-baseline';
import { task210bProtectedState } from './lib/task210b-protected-state';
import { billingResultDigest } from './transform-billing-history';

type ExpectedCounts = {
  source: number;
  target: number;
  quarantine: number;
  distinctPeople: number;
};
type Options = {
  databaseUrl?: string;
  apply?: boolean;
  forceFailure?: boolean;
  expectedCounts?: ExpectedCounts;
  enforceLiveBaselines?: boolean;
};

export const LIVE_ATTENDANCE_COUNTS: ExpectedCounts = {
  source: 4_022,
  target: 4_022,
  quarantine: 0,
  distinctPeople: 10,
};

async function assertBillingBaseline(db: ClientBase): Promise<void> {
  assert.equal(await billingResultDigest(db), BILLING_CANONICAL_BASELINE.semanticDigest);
  assert.deepEqual(await billingCanonicalState(db), {
    completeRowDigest: BILLING_CANONICAL_BASELINE.completeRowDigest,
    identityTimestampDigest: BILLING_CANONICAL_BASELINE.identityTimestampDigest,
  });
}

async function assertAttendanceSourceBaseline(db: ClientBase): Promise<void> {
  const failures = attendanceSourceBaselineFailures(await attendanceSourceState(db));
  assert.deepEqual(
    failures,
    [],
    `Task 2.10B source differs from the approved extraction:\n${failures.join('\n')}`,
  );
}

async function assertAttendanceStructure(db: ClientBase): Promise<void> {
  const failures = await attendanceStructureFailures(db);
  assert.deepEqual(
    failures,
    [],
    `Task 2.10B safeguards differ from PostgreSQL 17.11:\n${failures.join('\n')}`,
  );
}

function assertPlanCounts(plan: AttendancePlan, expected: ExpectedCounts): void {
  assert.equal(plan.sourceCount, expected.source);
  assert.equal(plan.targets.length, expected.target);
  assert.equal(plan.quarantine.length, expected.quarantine);
  assert.equal(new Set(plan.targets.map((row) => row.personId)).size, expected.distinctPeople);
}

async function insertAttendance(db: ClientBase, rows: readonly AttendanceTarget[]): Promise<void> {
  await db.query(
    `INSERT INTO attendance(
       legacy_id,person_id,legacy_person_raw,attendance_date,situation,
       legacy_situation_raw,legacy_source_record_key,
       legacy_source_extraction_sha256,legacy_source_payload,updated_at)
     SELECT x."legacyId",x."personId",x."legacyPersonRaw",x."attendanceDate"::date,
            x.situation,x."legacySituationRaw",x."srcRecordKey",x."extractionSha256",
            x."sourcePayload",CURRENT_TIMESTAMP
       FROM jsonb_to_recordset($1::jsonb) x(
         "srcRecordKey" text,"extractionSha256" text,"legacyId" integer,
         "personId" integer,"legacyPersonRaw" text,"attendanceDate" text,
         situation text,"legacySituationRaw" text,"sourcePayload" jsonb)
     ON CONFLICT(legacy_source_record_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

async function insertQuarantine(
  db: ClientBase,
  rows: readonly AttendanceQuarantine[],
): Promise<void> {
  await db.query(
    `INSERT INTO quarantine.attendance_transform(
       src_record_key,extraction_sha256,src_file,src_row_num,
       legacy_attendance_id_raw,reason_codes,reason_details,source_payload)
     SELECT x."srcRecordKey",x."extractionSha256",x."srcFile",x."srcRowNum",
            x."legacyAttendanceIdRaw",x."reasonCodes",x."reasonDetails",x."sourcePayload"
       FROM jsonb_to_recordset($1::jsonb) x(
         "srcRecordKey" text,"extractionSha256" text,"srcFile" text,
         "srcRowNum" integer,"legacyAttendanceIdRaw" text,"reasonCodes" text[],
         "reasonDetails" jsonb,"sourcePayload" jsonb)
     ON CONFLICT(src_record_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

async function lockAttendanceDomain(db: ClientBase): Promise<void> {
  await db.query(`LOCK TABLE staging."Attendance",person_name_alias,people IN SHARE MODE`);
  await db.query(`LOCK TABLE invoices,payments,invoice_allocations,
    migration_billing_person_crosswalk,migration_billing_currency_rule,
    quarantine.invoice_transform,quarantine.payment_transform,
    quarantine.invoice_allocation_transform IN SHARE MODE`);
  await db.query(`LOCK TABLE attendance,quarantine.attendance_transform
    IN SHARE ROW EXCLUSIVE MODE`);
}

export async function runAttendanceTransform(options: Options = {}) {
  const enforceLive = options.enforceLiveBaselines ?? options.databaseUrl === undefined;
  const expected =
    options.expectedCounts ??
    (options.databaseUrl === undefined ? LIVE_ATTENDANCE_COUNTS : undefined);
  return withApprovedMigrationClient(
    async (db) => {
      if (enforceLive) {
        await assertBillingBaseline(db);
        await assertAttendanceSourceBaseline(db);
      }
      const preview = await buildAttendancePlan(db);
      if (expected) assertPlanCounts(preview, expected);
      if (options.apply !== true) return { plan: preview, reconciliation: null };

      const protectedBefore = await task210bProtectedState(db);
      await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      try {
        await setMaintenanceAuditContext(db, 'task-2-10b-attendance');
        await lockAttendanceDomain(db);
        await assertAttendanceStructure(db);
        if (enforceLive) {
          await assertBillingBaseline(db);
          await assertAttendanceSourceBaseline(db);
        }
        const plan = await buildAttendancePlan(db);
        if (expected) assertPlanCounts(plan, expected);
        await insertAttendance(db, plan.targets);
        await insertQuarantine(db, plan.quarantine);
        if (options.forceFailure) throw new Error('forced late Task 2.10B failure');
        const reconciliation = await reconcileAttendance(db, enforceLive);
        assert.deepEqual(reconciliation.defects, [], reconciliation.defects.join('\n'));
        if (expected) {
          assert.equal(reconciliation.sourceCount, expected.source);
          assert.equal(reconciliation.targetCount, expected.target);
          assert.equal(reconciliation.quarantineCount, expected.quarantine);
          assert.equal(reconciliation.distinctPeople, expected.distinctPeople);
        }
        assert.equal(await task210bProtectedState(db), protectedBefore);
        await assertAttendanceStructure(db);
        if (enforceLive) {
          await assertBillingBaseline(db);
          await assertAttendanceSourceBaseline(db);
        }
        await db.query('COMMIT');
        return { plan, reconciliation };
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    },
    { databaseUrl: options.databaseUrl },
  );
}

function reasonBreakdown(rows: readonly AttendanceQuarantine[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows)
    for (const code of row.reasonCodes) counts[code] = (counts[code] ?? 0) + 1;
  return counts;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const result = await runAttendanceTransform({ apply });
  console.log(apply ? 'TASK 2.10B APPLIED' : 'TASK 2.10B DRY RUN — no database writes');
  console.log(
    `Attendance: ${result.plan.sourceCount} = ${result.plan.targets.length} transformed + ${result.plan.quarantine.length} quarantined ${JSON.stringify(reasonBreakdown(result.plan.quarantine))}`,
  );
  console.log(`Approved source digest: ${ATTENDANCE_SOURCE_BASELINE.digest}`);
  if (result.reconciliation) console.log(`Result digest: ${result.reconciliation.resultDigest}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
