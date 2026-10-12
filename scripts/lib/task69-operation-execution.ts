import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import type { SessionClaims } from '../../src/lib/auth/session';
import {
  task69Digest,
  assertTask69References,
  TASK69_REFERENCE_TABLES,
  task69ReferenceSql,
  type Row,
  type Task69Entry,
} from './task69-contract';
import { bindTask69Operation, type Task69PreparedOperation } from './task69-runner';
import {
  assertTask69Source,
  assertTask69EntryBound,
  assertTask69Lookups,
  assertTask69Memberships,
  readTask69Transitions,
} from './task69-preflight';
import { executeTask69Lookup, executeTask69Parties } from './task69-matter-executor';
import { executeTask69Lawyers } from './task69-lawyer-executor';
import { executeTask69Admin } from './task69-admin-executor';
import { executeTask69Step, executeTask69GeneratedParent } from './task69-step-executor';
import { executeTask69Destination } from './task69-destination-executor';
import { executeTask69Poa } from './task69-poa-executor';
import { executeTask69Document } from './task69-document-executor';
import { executeTask69Fee } from './task69-fee-executor';
import { executeTask69History } from './task69-history-executor';
import { compensateTask69Operation } from './task69-compensation-executor';
import { assertTask69Compensation } from './task69-compensation-checkpoint';

const tables = [
  'matters',
  'matter_parties',
  'matter_party_roles',
  'matter_lawyers',
  'lookup_party_role',
  'lookup_court',
  'lookup_matter_destination',
  'admin_tasks',
  'admin_task_assignees',
  'task_actions',
  'powers_of_attorney',
  'power_of_attorney_lawyers',
  'documents',
  'document_matters',
  'document_responsible_people',
  'fee_letters',
  'fee_letter_matters',
  'fee_letter_matter_scopes',
  'matter_fee_letter_references',
];
export async function task69BusinessSnapshot(db: ClientBase) {
  const values: Record<string, Row[]> = {};
  for (const table of tables)
    values[table] = (
      await db.query(`SELECT to_jsonb(t) value FROM public.${table} t ORDER BY id`)
    ).rows.map((r) => r.value);
  return values;
}
export async function task69Sequences(db: ClientBase) {
  const out = [];
  for (const r of (
    await db.query(
      "SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname IN('public','quarantine','_migration') ORDER BY 1,2",
    )
  ).rows) {
    assert.match(r.schemaname, /^[a-z_]+$/u);
    assert.match(r.sequencename, /^[a-z_0-9]+$/u);
    out.push({
      ...r,
      ...(
        await db.query(
          `SELECT last_value::text,is_called FROM "${r.schemaname}"."${r.sequencename}"`,
        )
      ).rows[0],
    });
  }
  return out;
}
export async function task69AuditState(db: ClientBase) {
  return (
    await db.query(
      "SELECT count(*)::int count,max(id)::text last_id,md5(coalesce(string_agg(md5(to_jsonb(e)::text),'' ORDER BY id),'')) digest FROM public.audit_events e",
    )
  ).rows[0];
}
/** Same reviewed stage ordering, receipts and compensation assertions as the
 * isolated coordinator. The explicit entry point supplies the authority scope
 * and a fresh, locked state check before registration. Unknown COMMIT outcome
 * is never reported as rollback and never triggers automatic compensation. */
export async function executeTask69BoundPhase(input: {
  db: ClientBase;
  operation: Task69PreparedOperation;
  contract: import('./task69-contract').Task69Contract;
  authority: SessionClaims;
  action: 'parents' | 'remaining' | 'compensate' | 'inspect';
  fault: '' | '--fault-before-journal' | '--fault-after-commit' | '--fault-unknown-commit';
  baselineFile: string;
  beforeBind: () => Promise<void>;
  beforeCommit: () => Promise<void>;
  outcome: Record<string, unknown>;
  persist: () => void;
}): Promise<void> {
  const {
    db,
    operation,
    contract,
    authority,
    action,
    fault,
    baselineFile,
    beforeBind,
    beforeCommit,
    outcome,
    persist,
  } = input;
  const parentStages = ['S1-party-display', 'S2-lawyer-membership', 'S3-admin-parents'];
  const expected = operation.allowlist
    .filter((a) =>
      action === 'parents'
        ? a.unit_kind === 'dependency' || parentStages.includes(a.stage)
        : action === 'remaining'
          ? a.unit_kind === 'issue' && !parentStages.includes(a.stage)
          : true,
    )
    .map((a) => a.issue_id)
    .sort();
  const initialBusiness = await task69BusinessSnapshot(db),
    initialAudit = await task69AuditState(db),
    initialSequences = await task69Sequences(db);
  let committed = false;
  let commitSent = false;
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await beforeBind();
    if (action === 'inspect')
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int n FROM _migration.task69_operation WHERE operation_id=$1',
            [operation.operationId],
          )
        ).rows[0].n,
        1,
        'Inspection requires an already registered operation; it must not register one',
      );
    await bindTask69Operation(db, operation, authority);
    const prior = (
      await db.query(
        'SELECT * FROM _migration.task69_receipt WHERE operation_id=$1 ORDER BY issue_id,phase',
        [operation.operationId],
      )
    ).rows as Row[];
    outcome.before = {
      businessDigest: task69Digest(initialBusiness),
      audit: initialAudit,
      sequences: initialSequences,
      receipts: prior.length,
    };
    if (action === 'inspect') {
      const proof = (
        await db.query(
          "SELECT to_jsonb(r) receipt,a.stage,a.unit_kind,a.entry_sha256,a.payload_sha256,coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY ordinal) FROM _migration.task69_delta d WHERE d.receipt_id=r.receipt_id),'[]') deltas,_migration.task69_receipt_valid(r.receipt_id) valid FROM _migration.task69_receipt r JOIN _migration.task69_allowlist a USING(operation_id,issue_id) WHERE r.operation_id=$1 ORDER BY a.stage,r.issue_id,r.phase",
          [operation.operationId],
        )
      ).rows;
      assert(proof.every((r) => r.valid === true));
      outcome.status = 'OBSERVED';
      outcome.receipts = proof;
      assert.deepEqual(await task69BusinessSnapshot(db), initialBusiness);
      assert.deepEqual(await task69AuditState(db), initialAudit);
      assert.deepEqual(await task69Sequences(db), initialSequences);
    } else if (action === 'compensate') {
      assert.equal(
        prior.filter((r) => r.phase === 'apply').length,
        3585,
        'All issues and dependencies required before combined compensation',
      );
      const receipts = await compensateTask69Operation(db, operation, contract, authority);
      assert.equal(receipts.length, 3585);
      await assertTask69Compensation(db);
      outcome.receipts = receipts;
      outcome.status = 'COMPENSATED';
      const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')).business as Record<
          string,
          Row[]
        >,
        after = await task69BusinessSnapshot(db),
        clean = (r: Row) =>
          Object.fromEntries(
            Object.entries(r).filter(
              ([k]) => !['row_version', 'updated_at', 'updated_by'].includes(k),
            ),
          );
      for (const table of tables) {
        const old = new Map(baseline[table]!.map((r) => [r.id, r]));
        for (const row of after[table]!) {
          const original = old.get(row.id);
          if (original) {
            assert.deepEqual(clean(row), clean(original), table + '/' + row.id);
            old.delete(row.id);
          } else if (table === 'admin_task_assignees')
            assert(after.admin_tasks!.some((t) => t.id === row.task_id && t.is_archived === true));
          else if (table === 'fee_letter_matter_scopes')
            assert(after.fee_letter_matters!.some((t) => t.id === row.id && t.is_retired === true));
          else
            assert(
              row.is_retired === true || row.is_archived === true || row.is_active === false,
              'Preserved inactive source object required',
            );
        }
        assert.equal(old.size, 0, 'No original row removed');
      }
      outcome.originalBusinessProjection =
        'MATCH; retained archived/retired source objects and truthful metadata/history are separate';
    } else {
      assert.equal(
        prior.filter((r) => r.phase === 'compensate').length,
        0,
        'Compensated operation cannot apply again',
      );
      const phasePrior = prior.filter((r) => expected.includes(String(r.issue_id)));
      if (phasePrior.length) {
        assert.deepEqual(
          phasePrior.map((r) => String(r.issue_id)).sort(),
          expected,
          'Partial or unknown prior phase requires investigation before retry',
        );
        await db.query(
          'LOCK TABLE ' +
            TASK69_REFERENCE_TABLES.map(task69ReferenceSql).join(',') +
            ' IN SHARE MODE',
        );
        const transitions = await readTask69Transitions(db, operation.operationId),
          entries = expected
            .map((id) => contract.byIssue.get(id))
            .filter((e): e is Task69Entry => !!e);
        await assertTask69References(db, entries, operation.operationId, transitions);
        for (const r of phasePrior)
          assert.equal(
            (
              await db.query('SELECT _migration.task69_receipt_postimages_valid($1) valid', [
                r.receipt_id,
              ])
            ).rows[0].valid,
            true,
            'Committed outcome has changed postimages',
          );
        for (const e of entries) {
          assertTask69EntryBound(e, operation);
          await assertTask69Source(db, e);
          await assertTask69Lookups(db, e, operation);
          await assertTask69Memberships(db, e, transitions);
        }
        outcome.status = 'RECOVERED_COMMITTED_OUTCOME';
        outcome.originalReceiptIds = phasePrior.map((r) => ({
          issueId: r.issue_id,
          receiptId: r.receipt_id,
          returned: r.returned_ids,
        }));
        assert.deepEqual(await task69BusinessSnapshot(db), initialBusiness);
        assert.deepEqual(await task69AuditState(db), initialAudit);
      } else {
        if (action === 'parents') assert.equal(prior.length, 0);
        else {
          assert.equal(prior.length, 1598);
          assert.deepEqual(
            prior.map((r) => String(r.issue_id)).sort(),
            operation.allowlist
              .filter((a) => a.unit_kind === 'dependency' || parentStages.includes(a.stage))
              .map((a) => a.issue_id)
              .sort(),
          );
        }
        if (fault === '--fault-before-journal')
          await db.query(
            "ALTER TABLE _migration.task69_receipt ADD CONSTRAINT isolated_apply_journal_failure CHECK(phase<>'apply') NOT VALID",
          );
        const executeStage = async (
          stage: keyof typeof contract.stages,
          run: typeof executeTask69Parties,
        ) => {
          const ids = contract.stages[stage];
          for (const [i, id] of ids.entries()) {
            await run(db, operation, contract.byIssue.get(id)!, authority);
            if (i % 50 === 0 || i === ids.length - 1)
              console.log(new Date().toISOString(), stage, i + 1 + '/' + ids.length);
          }
          outcome[stage] = { issues: ids.length };
        };
        if (action === 'parents') {
          await executeTask69Destination(db, operation, authority);
          for (const a of operation.allowlist.filter((a) => a.issue_id.startsWith('LOOKUP/')))
            await executeTask69Lookup(db, operation, a.issue_id, authority);
          await executeStage('S1-party-display', executeTask69Parties);
          await executeStage('S2-lawyer-membership', executeTask69Lawyers);
          await executeStage('S3-admin-parents', executeTask69Admin);
          for (const a of operation.allowlist.filter((a) =>
            a.issue_id.startsWith('GENERATED-PARENT/'),
          ))
            await executeTask69GeneratedParent(db, operation, a.issue_id, authority);
        } else {
          await executeStage('S4-step-restoration', executeTask69Step);
          await executeStage('S5-poa-membership', executeTask69Poa);
          await executeStage('S6-documents', executeTask69Document);
          await executeStage('S7-fee-provenance', executeTask69Fee);
          await executeStage('S8-history-dispositions', executeTask69History);
        }
        assert.deepEqual(
          (
            await db.query(
              "SELECT issue_id FROM _migration.task69_receipt WHERE operation_id=$1 AND phase='apply' AND issue_id=ANY($2::text[]) ORDER BY issue_id",
              [operation.operationId, expected],
            )
          ).rows.map((r) => r.issue_id),
          expected,
        );
        outcome.status = 'APPLIED';
        outcome.phaseReceipts = expected.length;
      }
    }
    console.log(new Date().toISOString(), 'Validating deferred constraints before commit');
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    console.log(
      new Date().toISOString(),
      'Deferred constraints passed; rechecking execution authority',
    );
    await beforeCommit();
    commitSent = true;
    await db.query('COMMIT');
    if (fault === '--fault-unknown-commit')
      throw new Error('ISOLATED injected COMMIT response loss after actual server commit');
    committed = true;
    outcome.after = {
      businessDigest: task69Digest(await task69BusinessSnapshot(db)),
      audit: await task69AuditState(db),
      sequences: await task69Sequences(db),
    };
    if (fault === '--fault-after-commit') {
      outcome.status = 'INJECTED_LOST_RESPONSE_AFTER_COMMIT';
      persist();
      throw new Error(
        'ISOLATED injected lost response after server commit; inspect exact receipts before retry',
      );
    }
    persist();
  } catch (e) {
    if (commitSent && !committed) {
      outcome.status = 'UNKNOWN_COMMIT_OUTCOME';
      outcome.error =
        'Commit response unavailable; inspect exact server receipts before any retry or compensation';
      persist();
      throw e;
    }
    if (!committed) {
      await db.query('ROLLBACK');
      assert.deepEqual(
        await task69BusinessSnapshot(db),
        initialBusiness,
        'Failed transaction preserves full business state',
      );
      assert.deepEqual(
        await task69AuditState(db),
        initialAudit,
        'Failed transaction preserves audit state',
      );
      outcome.status = 'ROLLED_BACK_FAILURE';
      outcome.afterRollback = {
        businessDigest: task69Digest(await task69BusinessSnapshot(db)),
        audit: await task69AuditState(db),
        sequences: await task69Sequences(db),
      };
    }
    outcome.error = e instanceof Error ? e.message : String(e);
    persist();
    throw e;
  }
}
