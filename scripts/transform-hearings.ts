/*
 * Task 2.8 — transform hearings and attendees.
 *
 * Attendees are created only from immutable Correction B person spans. The
 * source cells are never parsed here. One serializable transaction writes all
 * hearing targets, attendee rows and durable quarantine evidence.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import type { Client } from 'pg';
import { setMaintenanceAuditContext } from './lib/audit-maintenance-context';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  type AttendeeAuditReconciliationBaseline,
  attendeeAuditStructureFailures,
  reconcileAttendeeAudit,
} from './lib/attendee-audit-reconciliation';
import {
  buildHearingTransformPlan,
  type HearingAttendeePlan,
  type HearingQuarantinePlan,
  type HearingTargetPlan,
} from './lib/hearing-transform-plan';
import {
  hearingResultDigest,
  hearingStructureFailures,
  reconcileHearings,
} from './lib/hearing-reconciliation';

type RunOptions = {
  databaseUrl?: string;
  dryRun?: boolean;
  forceFailure?: boolean;
  attendeeAuditBaseline?: AttendeeAuditReconciliationBaseline | null;
};

async function protectedState(db: Client): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(string_agg(payload, E'\n' ORDER BY kind, identity), 'UTF8')), 'hex') digest
      FROM (
        SELECT 'FINGERPRINT' kind, '1' identity,
               _migration.current_staging_fingerprint() payload
        UNION ALL SELECT 'V', id::text, to_jsonb(v)::text FROM quarantine.review_value v
        UNION ALL SELECT 'F', id::text, to_jsonb(f)::text FROM quarantine.finding f
        UNION ALL SELECT 'C', id::text, to_jsonb(c)::text FROM clients c
        UNION ALL SELECT 'O', id::text, to_jsonb(c)::text FROM contacts c
        UNION ALL SELECT 'M', id::text, to_jsonb(m)::text FROM matters m
        UNION ALL SELECT 'QM', id::text, to_jsonb(q)::text FROM quarantine.matter_transform q
        UNION ALL SELECT 'ML', id::text, to_jsonb(l)::text FROM matter_lawyers l
        UNION ALL SELECT 'MP', id::text, to_jsonb(p)::text FROM matter_parties p
        UNION ALL SELECT 'MR', id::text, to_jsonb(r)::text FROM matter_party_roles r
        UNION ALL SELECT 'QR', id::text, to_jsonb(q)::text FROM quarantine.matter_relationship_transform q
        UNION ALL SELECT 'AC', cell_id, to_jsonb(c)::text FROM _migration.attendee_source_cell c
        UNION ALL SELECT 'AS', fragment_id, to_jsonb(s)::text FROM _migration.attendee_source_span s
        UNION ALL SELECT 'AQ', fragment_id, to_jsonb(q)::text FROM quarantine.attendee_span q
      ) protected`);
  return result.rows[0]?.digest ?? '';
}

async function insertBatches<T>(
  db: Client,
  rows: readonly T[],
  insert: (batch: readonly T[]) => Promise<unknown>,
): Promise<void> {
  const batchSize = 750;
  for (let start = 0; start < rows.length; start += batchSize) {
    await insert(rows.slice(start, start + batchSize));
  }
}

async function insertHearings(db: Client, rows: readonly HearingTargetPlan[]): Promise<void> {
  await insertBatches(db, rows, async (batch) => {
    await db.query(
      `INSERT INTO hearings (
         legacy_id, matter_id, hearing_date, next_hearing_date,
         action_id, legacy_action_raw, decision, report, previous_decision,
         outcome, court_id, legacy_court_raw, destination_id,
         legacy_destination_raw, next_attendance_raw, circuit,
         legacy_circuit_raw, notes, legacy_notes_raw, client_notified,
         short_decision, legacy_source_record_key,
         legacy_source_extraction_sha256, legacy_source_payload, updated_at
       )
       SELECT x."legacyId", x."matterId", x."hearingDate", x."nextHearingDate",
              x."actionId", x."legacyActionRaw", x.decision, x.report,
              x."previousDecision", x.outcome, x."courtId", x."legacyCourtRaw",
              x."destinationId", x."legacyDestinationRaw", x."nextAttendanceRaw",
              x.circuit, x."legacyCircuitRaw", x.notes, x."legacyNotesRaw",
              x."clientNotified", x."shortDecision", x."srcRecordKey",
              x."extractionSha256", x."sourcePayload", CURRENT_TIMESTAMP
         FROM jsonb_to_recordset($1::jsonb) AS x(
           "srcRecordKey" text, "extractionSha256" text, "legacyId" integer,
           "matterId" integer, "hearingDate" date, "nextHearingDate" date,
           "actionId" smallint, "legacyActionRaw" text, decision text,
           report boolean, "previousDecision" text, outcome text,
           "courtId" smallint, "legacyCourtRaw" text, "destinationId" smallint,
           "legacyDestinationRaw" text, "nextAttendanceRaw" text, circuit text,
           "legacyCircuitRaw" text, notes text, "legacyNotesRaw" text,
           "clientNotified" boolean, "shortDecision" text,
           "sourcePayload" jsonb
         )
       ON CONFLICT (legacy_source_record_key) DO NOTHING`,
      [JSON.stringify(batch)],
    );
  });
}

async function insertQuarantine(db: Client, rows: readonly HearingQuarantinePlan[]): Promise<void> {
  await insertBatches(db, rows, async (batch) => {
    await db.query(
      `INSERT INTO quarantine.hearing_transform (
         src_record_key, extraction_sha256, src_file, src_row_num,
         legacy_hearing_id, reason_codes, reason_details, source_payload
       )
       SELECT x."srcRecordKey", x."extractionSha256", x."srcFile", x."srcRowNum",
              x."legacyHearingId", x."reasonCodes", x."reasonDetails", x."sourcePayload"
         FROM jsonb_to_recordset($1::jsonb) AS x(
           "srcRecordKey" text, "extractionSha256" text, "srcFile" text,
           "srcRowNum" integer, "legacyHearingId" text,
           "reasonCodes" text[], "reasonDetails" jsonb, "sourcePayload" jsonb
         )
       ON CONFLICT (src_record_key) DO NOTHING`,
      [JSON.stringify(batch)],
    );
  });
}

async function insertAttendees(db: Client, rows: readonly HearingAttendeePlan[]): Promise<void> {
  await insertBatches(db, rows, async (batch) => {
    await db.query(
      `INSERT INTO hearing_attendees (
         hearing_id, person_id, legacy_name_raw, ordinal,
         legacy_source_record_key, legacy_source_extraction_sha256,
         source_column, source_column_ordinal, source_cell_id,
         source_span_id, source_span_sequence, updated_at
       )
       SELECT hearing.id, x."personId", x."legacyNameRaw", x.ordinal,
              x."legacySourceRecordKey", x."legacySourceExtractionSha256",
              x."sourceColumn", x."sourceColumnOrdinal", x."sourceCellId",
              x."sourceSpanId", x."sourceSpanSequence", CURRENT_TIMESTAMP
         FROM jsonb_to_recordset($1::jsonb) AS x(
           "hearingSourceRecordKey" text, "personId" integer,
           "legacyNameRaw" text, ordinal integer,
           "legacySourceRecordKey" text, "legacySourceExtractionSha256" text,
           "sourceColumn" text, "sourceColumnOrdinal" smallint,
           "sourceCellId" text, "sourceSpanId" text,
           "sourceSpanSequence" integer
         )
         JOIN hearings hearing
           ON hearing.legacy_source_record_key=x."hearingSourceRecordKey"
       ON CONFLICT (source_span_id) DO NOTHING`,
      [JSON.stringify(batch)],
    );
  });
}

export async function runHearingTransform(options: RunOptions = {}) {
  return withApprovedMigrationClient(
    async (db) => {
      const audit = await reconcileAttendeeAudit(db, options.attendeeAuditBaseline);
      assert.deepEqual(audit.defects, [], 'Correction B attendee audit is not reconciled');
      assert.deepEqual(
        await attendeeAuditStructureFailures(db),
        [],
        'Correction B attendee safeguards differ from their reviewed definitions',
      );
      const proposed = await buildHearingTransformPlan(db);
      const independentPlan = await reconcileHearings(db);
      assert.deepEqual(
        {
          source: independentPlan.sourceHearings,
          targets: independentPlan.expectedTransformedHearings,
          quarantine: independentPlan.expectedQuarantinedHearings,
          attendees: independentPlan.expectedAttendees,
        },
        {
          source: proposed.sourceCount,
          targets: proposed.targets.length,
          quarantine: proposed.quarantine.length,
          attendees: proposed.attendees.length,
        },
        'independent hearing oracle disagrees with the write plan',
      );
      if (options.dryRun === true) {
        return { plan: proposed, reconciliation: null, digest: null };
      }

      const beforeProtected = await protectedState(db);
      await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      try {
        await setMaintenanceAuditContext(db, 'task-2-8-hearings');
        await db.query("SELECT pg_advisory_xact_lock(hashtext('task-2.8-hearings'))");
        const plan = await buildHearingTransformPlan(db);
        assert.deepEqual(plan, proposed, 'hearing source or reviewed rules changed after dry run');
        await insertHearings(db, plan.targets);
        await insertQuarantine(db, plan.quarantine);
        await insertAttendees(db, plan.attendees);
        if (options.forceFailure === true) {
          throw new Error('fixture forced late hearing-transform failure');
        }

        const reconciliation = await reconcileHearings(db);
        assert.deepEqual(
          reconciliation.defects,
          [],
          `permanent hearing reconciliation failed:\n${reconciliation.defects.join('\n')}`,
        );
        assert.deepEqual(
          await hearingStructureFailures(db),
          [],
          'Task 2.8 database safeguards differ from their reviewed definitions',
        );
        assert.equal(
          await protectedState(db),
          beforeProtected,
          'Task 2.8 changed staging, review answers, prior transforms or attendee audit evidence',
        );
        await db.query('COMMIT');
        return {
          plan,
          reconciliation,
          digest: await hearingResultDigest(db),
        };
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    },
    { databaseUrl: options.databaseUrl },
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const result = await runHearingTransform({ dryRun });
  console.log(
    `${dryRun ? 'DRY RUN' : 'TRANSFORMED'}: ${String(result.plan.sourceCount)} source hearings = ` +
      `${String(result.plan.targets.length)} targets + ${String(result.plan.quarantine.length)} quarantine; ` +
      `${String(result.plan.attendees.length)} attendees across ` +
      `${String(result.plan.distinctAttendeePeople)} people.`,
  );
  console.log(
    `Attendee evidence: ${String(result.plan.auditCellCount)} cells = ` +
      `${String(result.plan.targetAuditCells)} target-parent + ` +
      `${String(result.plan.quarantinedAuditCells)} quarantined-parent; ` +
      `${String(result.plan.quarantinedPersonSpans)} person spans retained only in audit.`,
  );
  const plannedReasons = new Map<string, number>();
  for (const row of result.plan.quarantine) {
    for (const reason of row.reasonCodes) {
      plannedReasons.set(reason, (plannedReasons.get(reason) ?? 0) + 1);
    }
  }
  console.log(
    `Planned quarantine: ${[...plannedReasons]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([reason, count]) => `${reason}=${String(count)}`)
      .join(', ')}.`,
  );
  if (result.reconciliation !== null) {
    console.log(
      `Quarantine: ${result.reconciliation.quarantineBreakdown
        .map((row) => `${row.reason}=${String(row.count)}`)
        .join(', ')}.`,
    );
  }
  if (result.digest !== null) console.log(`Result digest: ${result.digest}`);
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/transform-hearings.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
