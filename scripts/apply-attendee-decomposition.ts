/*
 * Correction B live application — build and persist the immutable attendee
 * source-cell/span audit. The default is a read-only dry run. `--apply` is
 * required for the one serializable write transaction.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import type { Client } from 'pg';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  attendeeAuditResultDigest,
  attendeeAuditStructureFailures,
  type AttendeeAuditReconciliationBaseline,
  reconcileAttendeeAudit,
} from './lib/attendee-audit-reconciliation';
import {
  assertAttendeeSourceSnapshot,
  assertReviewSnapshot,
  buildAttendeeAuditPlan,
  readAttendeeSourceSnapshot,
  readReviewSnapshot,
  type AttendeeAuditPlanExpectations,
  type AttendeeAuditPlan,
} from './lib/attendee-audit-plan';
import { ATTENDEE_SOURCE_BASELINE, REVIEW_ANSWER_BASELINE } from './lib/migration-baselines';

type RunOptions = {
  databaseUrl?: string;
  apply?: boolean;
  forceFailure?: boolean;
  expectations?: AttendeeAuditPlanExpectations;
  reconciliationBaseline?: AttendeeAuditReconciliationBaseline | null;
};

async function protectedState(db: Client): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(string_agg(payload, E'\\n' ORDER BY kind, identity), 'UTF8')), 'hex') digest
      FROM (
        SELECT 'V' kind, id::text identity, to_jsonb(v)::text payload
          FROM quarantine.review_value v
        UNION ALL SELECT 'F', id::text, to_jsonb(f)::text FROM quarantine.finding f
        UNION ALL SELECT 'C', id::text, to_jsonb(c)::text FROM clients c
        UNION ALL SELECT 'O', id::text, to_jsonb(c)::text FROM contacts c
        UNION ALL SELECT 'M', id::text, to_jsonb(m)::text FROM matters m
        UNION ALL SELECT 'QM', id::text, to_jsonb(q)::text FROM quarantine.matter_transform q
        UNION ALL SELECT 'ML', id::text, to_jsonb(l)::text FROM matter_lawyers l
        UNION ALL SELECT 'MP', id::text, to_jsonb(p)::text FROM matter_parties p
        UNION ALL SELECT 'MR', id::text, to_jsonb(r)::text FROM matter_party_roles r
        UNION ALL SELECT 'QR', id::text, to_jsonb(q)::text
          FROM quarantine.matter_relationship_transform q
      ) protected`);
  return result.rows[0]?.digest ?? '';
}

async function insertAuditCells(db: Client, plan: AttendeeAuditPlan): Promise<void> {
  const rows = plan.cells;
  await db.query(
    `INSERT INTO _migration.attendee_source_cell (
       cell_id, source_table, src_record_key, extraction_sha256,
       source_column, source_column_ordinal, src_file, src_row_num,
       original_cell, original_cell_sha256, decomposition_version,
       review_value_id
     )
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::smallint[], $7::text[], $8::integer[], $9::text[], $10::text[],
       $11::smallint[], $12::bigint[]
     ) ON CONFLICT DO NOTHING`,
    [
      rows.map((row) => row.decomposition.cellId),
      rows.map((row) => row.decomposition.source.sourceTable),
      rows.map((row) => row.decomposition.source.sourceRecordKey),
      rows.map((row) => row.decomposition.source.sourceExtractionSha256),
      rows.map((row) => row.decomposition.source.sourceColumn),
      rows.map((row) => row.sourceColumnOrdinal),
      rows.map((row) => row.decomposition.source.sourceFile),
      rows.map((row) => row.decomposition.source.sourceRowNumber),
      rows.map((row) => row.decomposition.source.originalCell),
      rows.map((row) => row.decomposition.originalCellSha256),
      rows.map((row) => row.decomposition.version),
      rows.map((row) => row.reviewId),
    ],
  );
}

async function insertAuditSpans(db: Client, plan: AttendeeAuditPlan): Promise<void> {
  const rows = plan.cells.flatMap((cell) => cell.decomposition.fragments);
  const cells = new Map(plan.cells.map((cell) => [cell.decomposition.cellId, cell.decomposition]));
  const batchSize = 4_000;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    await db.query(
      `INSERT INTO _migration.attendee_source_span (
         fragment_id, cell_id, source_table, src_record_key,
         extraction_sha256, source_column, original_cell_sha256,
         sequence, line, start_offset, end_offset, raw, value, kind,
         classification_rule, review_required, person_id
       )
       SELECT * FROM unnest(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
         $6::text[], $7::text[], $8::integer[], $9::integer[],
         $10::integer[], $11::integer[], $12::text[], $13::text[],
         $14::text[], $15::text[], $16::boolean[], $17::integer[]
       ) ON CONFLICT DO NOTHING`,
      [
        batch.map((row) => row.fragmentId),
        batch.map((row) => row.cellId),
        batch.map((row) => row.sourceTable),
        batch.map((row) => row.sourceRecordKey),
        batch.map((row) => cells.get(row.cellId)!.source.sourceExtractionSha256),
        batch.map((row) => row.sourceColumn),
        batch.map((row) => row.originalCellSha256),
        batch.map((row) => row.sequence),
        batch.map((row) => row.line),
        batch.map((row) => row.startOffset),
        batch.map((row) => row.endOffset),
        batch.map((row) => row.raw),
        batch.map((row) => row.value),
        batch.map((row) => row.kind),
        batch.map((row) => row.rule),
        batch.map((row) => row.reviewRequired),
        batch.map((row) => (row.personKey === undefined ? null : Number(row.personKey))),
      ],
    );
  }
}

async function insertAmbiguousEvidence(db: Client, plan: AttendeeAuditPlan): Promise<void> {
  const cells = new Map(plan.cells.map((row) => [row.decomposition.cellId, row.decomposition]));
  const rows = plan.cells
    .flatMap((cell) => cell.decomposition.fragments)
    .filter((fragment) => fragment.kind === 'ambiguous');
  if (rows.length === 0) return;
  await db.query(
    `INSERT INTO quarantine.attendee_span (
       fragment_id, cell_id, source_table, src_record_key,
       extraction_sha256, source_column, original_cell_sha256,
       src_file, src_row_num, sequence, start_offset, end_offset, raw,
       classification_rule, reason_code, reason_detail
     )
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::text[], $7::text[], $8::text[], $9::integer[], $10::integer[],
       $11::integer[], $12::integer[], $13::text[], $14::text[],
       $15::text[], $16::jsonb[]
     ) ON CONFLICT DO NOTHING`,
    [
      rows.map((row) => row.fragmentId),
      rows.map((row) => row.cellId),
      rows.map((row) => row.sourceTable),
      rows.map((row) => row.sourceRecordKey),
      rows.map((row) => cells.get(row.cellId)!.source.sourceExtractionSha256),
      rows.map((row) => row.sourceColumn),
      rows.map((row) => row.originalCellSha256),
      rows.map((row) => cells.get(row.cellId)!.source.sourceFile),
      rows.map((row) => cells.get(row.cellId)!.source.sourceRowNumber),
      rows.map((row) => row.sequence),
      rows.map((row) => row.startOffset),
      rows.map((row) => row.endOffset),
      rows.map((row) => row.raw),
      rows.map((row) => row.rule),
      rows.map(() => 'ambiguous_attendee_fragment'),
      rows.map((row) =>
        JSON.stringify({ kind: 'ambiguous', raw: row.raw, rule: 'unclassified_review' }),
      ),
    ],
  );
}

export async function runAttendeeAudit(options: RunOptions = {}) {
  return withApprovedMigrationClient(
    async (db) => {
      const plan = await buildAttendeeAuditPlan(db, options.expectations);
      if (options.apply !== true) {
        return { plan, reconciliation: null, digest: null };
      }

      const protectedBefore = await protectedState(db);
      await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      try {
        await db.query("SELECT pg_advisory_xact_lock(hashtext('correction-b-attendee-audit'))");
        const transactionalReviewSnapshot = await readReviewSnapshot(db);
        assert.deepEqual(
          transactionalReviewSnapshot,
          plan.reviewSnapshot,
          'Review answers changed after the dry-run plan was built.',
        );
        assertReviewSnapshot(
          transactionalReviewSnapshot,
          options.expectations?.review ?? REVIEW_ANSWER_BASELINE,
        );
        const transactionalSourceSnapshot = await readAttendeeSourceSnapshot(db);
        assert.deepEqual(
          transactionalSourceSnapshot,
          plan.sourceSnapshot,
          'Attendee source cells changed after the dry-run plan was built.',
        );
        assertAttendeeSourceSnapshot(
          transactionalSourceSnapshot,
          options.expectations?.source ?? ATTENDEE_SOURCE_BASELINE,
        );
        await insertAuditCells(db, plan);
        await insertAuditSpans(db, plan);
        await insertAmbiguousEvidence(db, plan);
        if (options.forceFailure === true) {
          throw new Error('fixture forced late attendee-audit failure');
        }
        const reconciliation = await reconcileAttendeeAudit(db, options.reconciliationBaseline);
        assert.deepEqual(
          reconciliation.defects,
          [],
          `Permanent attendee-audit reconciliation failed:\n${reconciliation.defects.join('\n')}`,
        );
        assert.deepEqual(
          await attendeeAuditStructureFailures(db),
          [],
          'Attendee audit database safeguards differ from their reviewed definitions.',
        );
        assert.equal(
          await protectedState(db),
          protectedBefore,
          'Correction B changed staging answers or a previously transformed row.',
        );
        await db.query('COMMIT');
        return {
          plan,
          reconciliation,
          digest: await attendeeAuditResultDigest(db),
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
  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run');
  assert.ok(!(apply && dryRun), 'Choose either --dry-run or --apply, not both.');
  const result = await runAttendeeAudit({ apply });
  console.log(
    `${apply ? 'APPLIED' : 'DRY RUN'}: ${String(result.plan.sourceCellCount)} cells; ` +
      `${String(result.plan.spanCount)} spans; ${String(result.plan.personSpanCount)} person spans; ` +
      `${String(result.plan.ambiguousSpanCount)} ambiguous spans; ` +
      `${String(result.plan.distinctPeople)} distinct people.`,
  );
  console.log(
    `Review contract: ${String(result.plan.attendeeReviewValues)} attendee values; ` +
      `${String(result.plan.reviewSnapshot.valueAnswers + result.plan.reviewSnapshot.findingAnswers)} total answers; ` +
      `mapping ${result.plan.reviewSnapshot.mappingDigest}; answers ${result.plan.reviewSnapshot.answerDigest}.`,
  );
  if (!apply) {
    for (const cell of result.plan.cells) {
      for (const fragment of cell.decomposition.fragments) {
        if (fragment.kind !== 'ambiguous') continue;
        console.log(
          `AMBIGUOUS ${cell.decomposition.cellId} ${fragment.sequence} ` +
            `${JSON.stringify(cell.decomposition.source.sourceColumn)} ` +
            `${JSON.stringify(fragment.raw)}`,
        );
      }
    }
  }
  if (result.digest) console.log(`Audit result digest: ${result.digest}`);
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/apply-attendee-decomposition.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
