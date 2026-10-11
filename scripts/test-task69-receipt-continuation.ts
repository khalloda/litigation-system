import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionClaims } from '../src/lib/auth/session';
import {
  loadTask69Contract,
  task69Digest,
  type Row,
  type Task69Entry,
} from './lib/task69-contract';
import {
  prepareTask69Operation,
  withTask69Fixture,
  bindTask69Operation,
  task69RunnerSourceDigest,
  task69SchemaSourceDigest,
} from './lib/task69-runner';
import { executeTask69Parties, executeTask69Lookup } from './lib/task69-matter-executor';
import { executeTask69Lawyers } from './lib/task69-lawyer-executor';
import { executeTask69Admin } from './lib/task69-admin-executor';
async function main() {
  const started = new Date().toISOString(),
    directory = process.env['TASK69_APPROVED_DIRECTORY']!,
    root = process.env['TASK69_PRIVATE_ROOT']!,
    output = process.env['TASK69_EVIDENCE_OUTPUT']!;
  const contract = loadTask69Contract(directory),
    d = JSON.parse(readFileSync(join(root, 'fixture-descriptor.json'), 'utf8'));
  const auth = JSON.parse(readFileSync(join(root, 'fixture-logins.json'), 'utf8')) as {
      role: string;
      claims: SessionClaims;
    }[],
    actor = auth.find((a) => a.role === 'Administrator')!.claims;
  const sql = readFileSync(
      'prisma/migrations/20261007190000_task69_receipt_continuation/migration.sql',
      'utf8',
    ),
    draft = process.argv.includes('--draft');
  const operation = prepareTask69Operation({
      directory,
      operationId: randomUUID(),
      cluster: d.cluster,
      database: d.database,
      runnerSha256: task69RunnerSourceDigest(resolve('.')),
      schemaSha256: task69SchemaSourceDigest(process.cwd()),
    }),
    probes: string[] = [];
  const parties = contract.stages['S1-party-display'].map((id) => contract.byIssue.get(id)!);
  const lawyer = contract.stages['S2-lawyer-membership']
    .map((id) => contract.byIssue.get(id)!)
    .find((l) =>
      parties.some((p) =>
        (p.approvedOutcome.matterIds as number[]).includes(Number(l.approvedOutcome.matterId)),
      ),
    )!;
  assert(lawyer);
  const party = parties.find((p) =>
    (p.approvedOutcome.matterIds as number[]).includes(Number(lawyer.approvedOutcome.matterId)),
  )!;
  const admin = contract.stages['S3-admin-parents']
    .map((id) => contract.byIssue.get(id)!)
    .find((e) => (e.approvedOutcome.task as Row).legacy_id === 8971)!;
  await withTask69Fixture(operation, async (db) => {
    const capture = async () => {
      const values = [];
      for (const table of [
        'matters',
        'matter_parties',
        'matter_party_roles',
        'matter_lawyers',
        'admin_tasks',
        'admin_task_assignees',
        'lookup_party_role',
        'audit_events',
      ])
        values.push({
          table,
          ...(
            await db.query(
              `SELECT count(*)::int n,md5(string_agg(to_jsonb(x)::text,E'\\n' ORDER BY id)) digest FROM public.${table} x`,
            )
          ).rows[0],
        });
      return values;
    };
    const before = await capture();
    try {
      await db.query(
        draft
          ? sql.replace('BEGIN;', 'BEGIN ISOLATION LEVEL SERIALIZABLE;').replace(/COMMIT;\s*$/u, '')
          : 'BEGIN ISOLATION LEVEL SERIALIZABLE',
      );
      await bindTask69Operation(db, operation, actor);
      for (const value of party.approvedOutcome.parties as Row[]) {
        for (const role of value.roles as Row[])
          if (role.lookupId === null) {
            await executeTask69Lookup(
              db,
              operation,
              'LOOKUP/' +
                task69Digest({ namespace: 'public.lookup_party_role', label: role.role! }),
              actor,
            );
          }
      }
      const p = await executeTask69Parties(db, operation, party, actor),
        l = await executeTask69Lawyers(db, operation, lawyer, actor),
        a = await executeTask69Admin(db, operation, admin, actor);
      const counts = async () =>
        (
          await db.query(
            'SELECT (SELECT count(*)::int FROM _migration.task69_receipt) receipts,(SELECT count(*)::int FROM _migration.task69_delta) deltas,(SELECT count(*)::int FROM public.audit_events) audits',
          )
        ).rows[0];
      const originalCounts = await counts();
      assert.deepEqual(await executeTask69Parties(db, operation, party, actor), p);
      assert.deepEqual(await executeTask69Lawyers(db, operation, lawyer, actor), l);
      assert.deepEqual(await executeTask69Admin(db, operation, admin, actor), a);
      assert.deepEqual(await counts(), originalCounts);
      probes.push('exact-old-receipt-survives-only-complete-owned-parent-transition');
      const fault = async (name: string, expected: RegExp, work: () => Promise<unknown>) => {
        await db.query('SAVEPOINT continuation_fault');
        let refused = false;
        try {
          await work();
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          assert.match(m, expected, `${name}: ${m}`);
          refused = true;
        }
        await db.query('ROLLBACK TO SAVEPOINT continuation_fault');
        assert(refused, name);
        probes.push(name);
      };
      for (const [label, entry, execute] of [
        ['party', party, executeTask69Parties],
        ['lawyer', lawyer, executeTask69Lawyers],
        ['admin', admin, executeTask69Admin],
      ] as const) {
        for (const field of ['source', 'payload', 'guard']) {
          const changed = structuredClone(entry) as Task69Entry;
          if (field === 'source') changed.originalIssue.original.testChanged = true;
          if (field === 'payload') changed.approvedOutcome.testChanged = true;
          if (field === 'guard') changed.expectedStateGuards.targetGuards = [];
          await fault(
            label + '-' + field + '-changed-on-retry',
            /Source, authority, payload or complete guard closure changed/u,
            () => execute(db, operation, changed, actor),
          );
        }
        await fault(
          label + '-unusable-role-on-retry',
          /Current authorized matter session required/u,
          () => execute(db, operation, entry, auth.find((x) => x.role === 'Lawyer')!.claims),
        );
        await fault(
          label + '-expired-on-retry',
          /Current authorized matter session required/u,
          () => execute(db, operation, entry, { ...actor, absoluteExpiresAt: Date.now() - 1000 }),
        );
      }
      await fault(
        'same-transaction-parent-refused',
        /Committed exact parent receipt required/u,
        () =>
          db.query('SELECT _migration.task69_committed_parent($1,$2)', [
            operation.operationId,
            admin.issueId,
          ]),
      );
      await fault(
        'missing-parent-receipt-refused',
        /Committed exact parent receipt required/u,
        () =>
          db.query('SELECT _migration.task69_committed_parent($1,$2)', [
            operation.operationId,
            'GENERATED-PARENT/9809',
          ]),
      );
      await db.query(
        "SELECT set_config('litigation.task69_operation','',true),set_config('litigation.task69_issue','',true)",
      );
      const args = [
          actor.userId,
          actor.sessionVersion,
          actor.role,
          new Date(actor.absoluteExpiresAt).toISOString(),
        ],
        matterId = Number(lawyer.approvedOutcome.matterId);
      const state = (
        await db.query('SELECT public.matter_edit_state($1,$2,$3,$4,$5) value', [...args, matterId])
      ).rows[0].value;
      await db.query('SELECT public.audit_set_human_context($1)', [actor.userId]);
      await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
        randomUUID(),
        randomUUID(),
        actor.auditSessionId,
      ]);
      await db.query('SET LOCAL ROLE litigation_runtime');
      await db.query('SELECT public.matter_edit_save($1,$2,$3,$4,$5::jsonb)', [
        ...args,
        JSON.stringify({
          id: matterId,
          version: state.record.version,
          submission: randomUUID(),
          values: { notes_2: 'Task69 isolated native-edit proof' },
        }),
      ]);
      await db.query('RESET ROLE');
      await fault('unreceipted-native-edit-refuses-old-party-retry', /postimage was edited/u, () =>
        executeTask69Parties(db, operation, party, actor),
      );
      await fault('unreceipted-native-edit-refuses-lawyer-retry', /postimage was edited/u, () =>
        executeTask69Lawyers(db, operation, lawyer, actor),
      );
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      const records = (
        await db.query(
          'SELECT issue_id,receipt_id,returned_ids FROM _migration.task69_receipt WHERE operation_id=$1 ORDER BY issue_id',
          [operation.operationId],
        )
      ).rows;
      await db.query('ROLLBACK');
      assert.deepEqual(await capture(), before);
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'PASS',
            started,
            completed: new Date().toISOString(),
            draft,
            schemaSha256: task69SchemaSourceDigest(process.cwd()),
            probes,
            records,
            before,
            rolledBack: true,
            ownerActions: 'NOT_APPLIED',
            remaining:
              'Committed parent positive/unknown commit and full compensation tested in final dedicated fixture',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      console.log(JSON.stringify({ status: 'PASS', probes: probes.length, output }));
    } catch (e) {
      await db.query('ROLLBACK');
      assert.deepEqual(await capture(), before);
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'FAIL',
            started,
            completed: new Date().toISOString(),
            draft,
            schemaSha256: task69SchemaSourceDigest(process.cwd()),
            probes,
            message: e instanceof Error ? e.message : String(e),
            diagnostic:
              e instanceof Error
                ? {
                    where: (e as Error & { where?: string }).where,
                    position: (e as Error & { position?: string }).position,
                    stack: e.stack,
                  }
                : null,
            rolledBack: true,
            ownerActions: 'NOT_APPLIED',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      throw e;
    }
  });
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
