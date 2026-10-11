import { task69LawyerCatalog } from './lib/task69-lawyer-checkpoint';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionClaims } from '../src/lib/auth/session';
import { loadTask69Contract, task69Sha, type Row } from './lib/task69-contract';
import {
  prepareTask69Operation,
  withTask69Fixture,
  bindTask69Operation,
  task69RunnerSourceDigest,
  task69SchemaSourceDigest,
} from './lib/task69-runner';
import { executeTask69Lawyers } from './lib/task69-lawyer-executor';
async function main() {
  const started = new Date().toISOString(),
    directory = process.env['TASK69_APPROVED_DIRECTORY']!,
    privateRoot = process.env['TASK69_PRIVATE_ROOT']!,
    output = process.env['TASK69_EVIDENCE_OUTPUT']!;
  const contract = loadTask69Contract(directory),
    descriptor = JSON.parse(readFileSync(join(privateRoot, 'fixture-descriptor.json'), 'utf8'));
  const auth = JSON.parse(readFileSync(join(privateRoot, 'fixture-logins.json'), 'utf8')) as {
    role: string;
    claims: SessionClaims;
  }[];
  const authority = auth.find((x) => x.role === 'Administrator')!.claims;
  const sql = readFileSync(
      'prisma/migrations/20261007150000_task69_lawyer_restoration/migration.sql',
      'utf8',
    ),
    draft = process.argv.includes('--draft');
  const operation = prepareTask69Operation({
      directory,
      operationId: randomUUID(),
      cluster: descriptor.cluster,
      database: descriptor.database,
      runnerSha256: task69RunnerSourceDigest(resolve('.')),
      schemaSha256: task69SchemaSourceDigest(process.cwd()),
    }),
    results: Row[] = [];
  await withTask69Fixture(operation, async (db) => {
    const before = (
      await db.query(
        "SELECT count(*)::int n,md5(string_agg(to_jsonb(l)::text,E'\\n' ORDER BY id)) hash FROM public.matter_lawyers l",
      )
    ).rows[0];
    const audit = (await db.query('SELECT count(*)::int n FROM public.audit_events')).rows[0].n;
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name<='20261007150000_task69_lawyer_restoration'",
        )
      ).rows[0].n,
      draft ? 81 : 82,
    );
    await db.query(
      draft
        ? sql.replace('BEGIN;', 'BEGIN ISOLATION LEVEL SERIALIZABLE;').replace(/COMMIT;\s*$/u, '')
        : 'BEGIN ISOLATION LEVEL SERIALIZABLE',
    );
    try {
      writeFileSync(
        output.replace(/\.json$/u, '-schema.json'),
        JSON.stringify(await task69LawyerCatalog(db), null, 2) + '\n',
        { flag: 'wx' },
      );
      await bindTask69Operation(db, operation, authority);
      const ids = process.argv.includes('--all')
        ? contract.stages['S2-lawyer-membership']
        : ['quarantine.matter_relationship_transform:431'];
      for (const [i, id] of ids.entries()) {
        const entry = contract.byIssue.get(id)!,
          result = await executeTask69Lawyers(db, operation, entry, authority);
        assert.deepEqual(await executeTask69Lawyers(db, operation, entry, authority), result);
        results.push({
          issueId: id,
          receiptId: result.receipt_id!,
          returned: result.returned_ids!,
        });
        if ((i + 1) % 25 === 0) console.log('Exact lawyer decisions completed: ' + (i + 1));
      }
      const deltas = (
        await db.query(
          "SELECT d.* FROM _migration.task69_delta d JOIN _migration.task69_receipt r USING(receipt_id) WHERE operation_id=$1 AND entity_table='matter_lawyers' ORDER BY r.issue_id,d.ordinal",
          [operation.operationId],
        )
      ).rows;
      assert.equal(deltas.filter((d) => d.before_values !== null).length, 1);
      assert.equal(deltas.filter((d) => d.before_values !== null)[0].before_values.id, 412);
      if (process.argv.includes('--all')) {
        assert.equal(ids.length, 191);
        assert.equal(deltas.length, 358);
        assert.equal(deltas.filter((d) => d.before_values === null).length, 357);
      }
      assert.deepEqual(
        (
          await db.query(
            'SELECT person_id,role,position FROM public.matter_lawyers WHERE matter_id=2232 AND NOT is_retired ORDER BY position,id',
          )
        ).rows,
        [
          { person_id: 7, role: 'lead', position: 1 },
          { person_id: 2, role: 'co_lead', position: 2 },
        ],
      );
      const fault = async (name: string, action: () => Promise<unknown>) => {
        await db.query('SAVEPOINT lawyer_fault');
        let refused = false;
        try {
          await action();
        } catch {
          refused = true;
        }
        await db.query('ROLLBACK TO SAVEPOINT lawyer_fault');
        assert.equal(refused, true, name);
      };
      const entry = contract.byIssue.get('quarantine.matter_relationship_transform:431')!;
      await fault('Lawyer cannot retry restoration', () =>
        executeTask69Lawyers(db, operation, entry, auth.find((x) => x.role === 'Lawyer')!.claims),
      );
      await fault('Expired actor cannot retry restoration', () =>
        executeTask69Lawyers(db, operation, entry, {
          ...authority,
          absoluteExpiresAt: Date.now() - 1000,
        }),
      );
      await fault('Runtime cannot execute private restoration', async () => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        await executeTask69Lawyers(db, operation, entry, authority);
      });
      await db.query(
        "SELECT set_config('litigation.task69_operation','',true),set_config('litigation.task69_issue','',true)",
      );
      const args = [
        authority.userId,
        authority.sessionVersion,
        authority.role,
        new Date(authority.absoluteExpiresAt).toISOString(),
      ];
      const state = (
        await db.query('SELECT public.matter_edit_state($1,$2,$3,$4,$5) value', [...args, 2232])
      ).rows[0].value;
      assert.equal(
        (
          await db.query('SELECT public.matter_edit_save($1,$2,$3,$4,$5::jsonb) value', [
            ...args,
            JSON.stringify({
              id: 2232,
              version: state.record.version,
              submission: randomUUID(),
              values: {},
              lawyers: state.lawyers,
            }),
          ])
        ).rows[0].value.changed,
        false,
      );
      await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
      await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
        randomUUID(),
        operation.operationId,
        authority.auditSessionId,
      ]);
      const edited = structuredClone(state.lawyers);
      edited.find((l: { person_id: number }) => l.person_id === 2).position = 3;
      assert.equal(
        (
          await db.query('SELECT public.matter_edit_save($1,$2,$3,$4,$5::jsonb) value', [
            ...args,
            JSON.stringify({
              id: 2232,
              version: state.record.version,
              submission: randomUUID(),
              values: {},
              lawyers: edited,
            }),
          ])
        ).rows[0].value.changed,
        true,
      );
      await fault('Later native assignment edit blocks restoration retry', () =>
        executeTask69Lawyers(db, operation, entry, authority),
      );
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      assert.deepEqual(
        (
          await db.query(
            'SELECT id FROM public.matters WHERE _migration.matter_edit_current_valid(id) IS NOT TRUE',
          )
        ).rows,
        [],
      );
      await db.query('ROLLBACK');
      assert.deepEqual(
        (
          await db.query(
            "SELECT count(*)::int n,md5(string_agg(to_jsonb(l)::text,E'\\n' ORDER BY id)) hash FROM public.matter_lawyers l",
          )
        ).rows[0],
        before,
      );
      assert.equal(
        (await db.query('SELECT count(*)::int n FROM public.audit_events')).rows[0].n,
        audit,
      );
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'PASS',
            started,
            completed: new Date().toISOString(),
            fixture: { cluster: descriptor.cluster, database: descriptor.database },
            draftSha256: task69Sha(sql),
            runnerSha256: operation.runnerSha256,
            issues: ids.length,
            assignments: deltas.length,
            newAssignments: deltas.filter((d) => d.before_values === null).length,
            results,
            actualAssignmentDeltas: deltas,
            probes: [
              'actor-role-expiry-runtime-denial',
              'normal-gateway-noop',
              'later-native-edit-retry-refusal',
              'complete-aggregate-continuity',
              'rollback-business-and-audit-equality',
            ],
            sequenceBehavior: 'Advanced sequences retained',
            ownerActions: 'NOT_APPLIED',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      console.log(
        JSON.stringify({ status: 'PASS', issues: ids.length, assignments: deltas.length, output }),
      );
    } catch (error) {
      await db.query('ROLLBACK');
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'FAIL',
            started,
            completed: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
            draftSha256: task69Sha(sql),
            results,
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
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
