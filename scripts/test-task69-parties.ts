import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadTask69Contract, task69Sha, type Row } from './lib/task69-contract';
import {
  prepareTask69Operation,
  withTask69Fixture,
  bindTask69Operation,
  task69RunnerSourceDigest,
  task69SchemaSourceDigest,
} from './lib/task69-runner';
import { executeTask69Lookup, executeTask69Parties } from './lib/task69-matter-executor';
import type { SessionClaims } from '../src/lib/auth/session';
import { parseMatterMutationInput } from '../src/lib/matter-mutation-input';
import { task69RestorationSql } from './lib/task69-restoration-checkpoint';

async function main() {
  const started = new Date().toISOString();
  const directory = process.env['TASK69_APPROVED_DIRECTORY']!,
    privateRoot = process.env['TASK69_PRIVATE_ROOT']!,
    output = process.env['TASK69_EVIDENCE_OUTPUT']!;
  const contract = loadTask69Contract(directory);
  const descriptor = JSON.parse(readFileSync(join(privateRoot, 'fixture-descriptor.json'), 'utf8'));
  const auth = JSON.parse(readFileSync(join(privateRoot, 'fixture-logins.json'), 'utf8')) as {
    role: string;
    claims: SessionClaims;
  }[];
  const authority = auth.find((x) => x.role === 'Administrator')!.claims;
  const draft = task69RestorationSql();
  const draftMode = process.argv.includes('--draft');
  const operation = prepareTask69Operation({
    directory,
    operationId: randomUUID(),
    cluster: descriptor.cluster,
    database: descriptor.database,
    runnerSha256: task69RunnerSourceDigest(resolve('.')),
    schemaSha256: task69SchemaSourceDigest(process.cwd()),
  });
  const results: Row[] = [];
  await withTask69Fixture(operation, async (db) => {
    const before = (await db.query('SELECT count(*)::int n FROM public.audit_events')).rows[0].n;
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name<='20261007150000_task69_lawyer_restoration'",
        )
      ).rows[0].n,
      draftMode ? 80 : 82,
    );
    await db.query(
      draftMode
        ? draft.replace('BEGIN;', 'BEGIN ISOLATION LEVEL SERIALIZABLE;').replace(/COMMIT;\s*$/u, '')
        : 'BEGIN ISOLATION LEVEL SERIALIZABLE',
    );
    try {
      await bindTask69Operation(db, operation, authority);
      const ids = process.argv.includes('--all')
        ? contract.stages['S1-party-display']
        : [86, 402, 701, 702, 788, 789, 863, 921, 318].map(
            (n) => 'quarantine.matter_relationship_transform:' + n,
          );
      const lookups = new Set(
        ids.flatMap((id) =>
          contract.byIssue
            .get(id)!
            .expectedStateGuards.lookupPreconditions.filter(
              (g) => g.table === 'public.lookup_party_role' && g.expectedCardinality === 0,
            )
            .map((g) => g.exactLabel),
        ),
      );
      for (const name of lookups) {
        const dependency = operation.allowlist.find(
          (e) =>
            e.unit_kind === 'dependency' &&
            JSON.parse(e.payload_text).namespace === 'public.lookup_party_role' &&
            JSON.parse(e.payload_text).exactLabel === name,
        )!;
        await executeTask69Lookup(db, operation, dependency.issue_id, authority);
      }
      for (const [index, id] of ids.entries()) {
        const entry = contract.byIssue.get(id)!;
        const result = await executeTask69Parties(db, operation, entry, authority);
        const replay = await executeTask69Parties(db, operation, entry, authority);
        assert.deepEqual(
          replay,
          result,
          'Exact immediate retry returns unchanged original receipt',
        );
        results.push({
          issueId: id,
          receiptId: result.receipt_id!,
          returned: result.returned_ids!,
        });
        if ((index + 1) % 50 === 0) console.log('Exact parties completed: ' + (index + 1));
      }
      const roles = (
        await db.query(
          "SELECT count(*)::int n FROM _migration.task69_delta d JOIN _migration.task69_receipt r USING(receipt_id) WHERE operation_id=$1 AND entity_table='matter_party_roles'",
          [operation.operationId],
        )
      ).rows[0].n;
      if (process.argv.includes('--all')) assert.equal(roles, 1020);
      if (!process.argv.includes('--all')) {
        const entry = contract.byIssue.get('quarantine.matter_relationship_transform:86')!;
        const mid = (entry.approvedOutcome.matterIds as number[])[0]!;
        const args = [
          authority.userId,
          authority.sessionVersion,
          authority.role,
          new Date(authority.absoluteExpiresAt).toISOString(),
        ];
        const state = (
          await db.query('SELECT public.matter_edit_state($1,$2,$3,$4,$5) value', [...args, mid])
        ).rows[0].value;
        const parties = structuredClone(state.parties);
        for (const p of parties) {
          for (const k of [
            'semantic_party_name',
            'representative_name',
            'contextual_text',
            'explanatory_text',
          ])
            delete p[k];
          for (const role of p.roles) {
            delete role.display_label;
            delete role.qualifier;
          }
        }
        const parsed = parseMatterMutationInput('update', {
          id: mid,
          version: state.record.version,
          submission: randomUUID(),
          values: {},
          parties,
        });
        await db.query(
          "SELECT set_config('litigation.task69_operation','',true),set_config('litigation.task69_issue','',true)",
        );
        const unchanged = (
          await db.query('SELECT public.matter_edit_save($1,$2,$3,$4,$5::jsonb) value', [
            ...args,
            JSON.stringify(parsed),
          ])
        ).rows[0].value;
        assert.equal(unchanged.changed, false);
        const fault = async (name: string, query: () => Promise<unknown>) => {
          await db.query('SAVEPOINT party_fault');
          let refused = false;
          try {
            await query();
          } catch {
            refused = true;
          }
          await db.query('ROLLBACK TO SAVEPOINT party_fault');
          assert.equal(refused, true, name);
        };
        await fault('Read-only runtime cannot invoke private restoration', async () => {
          await db.query('SET LOCAL ROLE litigation_runtime');
          await executeTask69Parties(db, operation, entry, authority);
        });
        const lawyer = auth.find((x) => x.role === 'Lawyer')!.claims;
        await fault('Lawyer cannot reuse a restoration receipt', () =>
          executeTask69Parties(db, operation, entry, lawyer),
        );
        await fault('Expired actor cannot reuse a receipt', () =>
          executeTask69Parties(db, operation, entry, {
            ...authority,
            absoluteExpiresAt: Date.now() - 1000,
          }),
        );
        await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
        await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
          randomUUID(),
          operation.operationId,
          authority.auditSessionId,
        ]);
        const edited = structuredClone(state.parties);
        const qualified = edited.find(
          (p: { roles: { role_id: number }[] }) =>
            p.roles.filter((r) => r.role_id === 6).length === 2,
        );
        assert.ok(qualified);
        qualified.roles[0].qualifier = 'Task69 native fixture edit';
        const saved = (
          await db.query('SELECT public.matter_edit_save($1,$2,$3,$4,$5::jsonb) value', [
            ...args,
            JSON.stringify({
              id: mid,
              version: state.record.version,
              submission: randomUUID(),
              values: {},
              parties: edited,
            }),
          ])
        ).rows[0].value;
        assert.equal(saved.changed, true);
        await fault('Later native edit refuses prior receipt retry', () =>
          executeTask69Parties(db, operation, entry, authority),
        );
        results.push({
          probe:
            'Old request through parser/native gateway preserves qualified roles; private/runtime/role/expiry denial; later native edit remains valid and blocks retry',
          status: 'PASS',
        });
      }
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      assert.deepEqual(
        (
          await db.query(
            'SELECT id FROM public.matters WHERE NOT _migration.matter_edit_current_valid(id)',
          )
        ).rows,
        [],
      );
      const receipts = (
        await db.query(
          'SELECT issue_id,expected_delta_count FROM _migration.task69_receipt WHERE operation_id=$1 ORDER BY issue_id',
          [operation.operationId],
        )
      ).rows;
      const count = (
        await db.query(
          "SELECT count(*)::int n FROM _migration.task69_delta d JOIN _migration.task69_receipt r USING(receipt_id) WHERE operation_id=$1 AND entity_table='matter_parties'",
          [operation.operationId],
        )
      ).rows[0].n;
      if (process.argv.includes('--all')) assert.equal(count, 918);
      await db.query('ROLLBACK');
      assert.equal(
        (await db.query('SELECT count(*)::int n FROM public.audit_events')).rows[0].n,
        before,
      );
      const evidence = {
        status: 'PASS',
        started,
        completed: new Date().toISOString(),
        fixture: { cluster: descriptor.cluster, database: descriptor.database },
        draftSha256: task69Sha(draft),
        runnerSha256: operation.runnerSha256,
        source: contract.inputs,
        scope:
          'Real exact approved S1 restoration through dedicated historical provenance path; transaction rolled back',
        issues: ids.length,
        parties: count,
        roles,
        receipts,
        results,
        sequenceBehavior: 'Actual sequence advancement retained; no reset',
        ownerActions: 'NOT_APPLIED',
      };
      writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
      console.log(JSON.stringify({ status: 'PASS', issues: ids.length, parties: count, output }));
    } catch (error) {
      await db.query('ROLLBACK');
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'FAIL',
            started,
            completed: new Date().toISOString(),
            message: error instanceof Error ? error.message : String(error),
            draftSha256: task69Sha(draft),
            completedIssues: results,
            fixture: { cluster: descriptor.cluster, database: descriptor.database },
            rolledBack: true,
            ownerActions: 'NOT_APPLIED',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      throw error;
    }
  });
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
