import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionClaims } from '../src/lib/auth/session';
import { loadTask69Contract } from './lib/task69-contract';
import {
  prepareTask69Operation,
  withTask69Fixture,
  bindTask69Operation,
  task69RunnerSourceDigest,
  task69SchemaSourceDigest,
} from './lib/task69-runner';
import { executeTask69Destination } from './lib/task69-destination-executor';
import { executeTask69Lookup } from './lib/task69-matter-executor';
import { assertTask69Preflight } from './lib/task69-preflight';
async function main() {
  const started = new Date().toISOString(),
    directory = process.env['TASK69_APPROVED_DIRECTORY']!,
    privateRoot = process.env['TASK69_PRIVATE_ROOT']!,
    output = process.env['TASK69_EVIDENCE_OUTPUT']!;
  const auth = JSON.parse(readFileSync(join(privateRoot, 'fixture-logins.json'), 'utf8')) as {
      role: string;
      claims: SessionClaims;
    }[],
    authority = auth.find((x) => x.role === 'Administrator')!.claims;
  const descriptor = JSON.parse(readFileSync(join(privateRoot, 'fixture-descriptor.json'), 'utf8')),
    contract = loadTask69Contract(directory),
    draft = process.argv.includes('--draft');
  const sql = readFileSync(
    'prisma/migrations/20261007170000_task69_destination_dependency/migration.sql',
    'utf8',
  );
  const operation = prepareTask69Operation({
      directory,
      operationId: randomUUID(),
      cluster: descriptor.cluster,
      database: descriptor.database,
      runnerSha256: task69RunnerSourceDigest(resolve('.')),
      schemaSha256: task69SchemaSourceDigest(process.cwd()),
    }),
    probes: string[] = [];
  await withTask69Fixture(operation, async (db) => {
    const capture = async () =>
      (
        await db.query(
          "SELECT 'lookup_matter_destination' entity,count(*)::int n,md5(string_agg(to_jsonb(a)::text,E'\\n' ORDER BY id)) digest FROM public.lookup_matter_destination a UNION ALL SELECT 'matters',count(*)::int,md5(string_agg(to_jsonb(a)::text,E'\\n' ORDER BY id)) FROM public.matters a UNION ALL SELECT 'admin_tasks',count(*)::int,md5(string_agg(to_jsonb(a)::text,E'\\n' ORDER BY id)) FROM public.admin_tasks a UNION ALL SELECT 'audit_events',count(*)::int,md5(string_agg(to_jsonb(a)::text,E'\\n' ORDER BY id)) FROM public.audit_events a",
        )
      ).rows;
    const before = await capture();
    await db.query(
      draft
        ? sql.replace('BEGIN;', 'BEGIN ISOLATION LEVEL SERIALIZABLE;').replace(/COMMIT;\s*$/u, '')
        : 'BEGIN ISOLATION LEVEL SERIALIZABLE',
    );
    try {
      await bindTask69Operation(db, operation, authority);
      const fault = async (name: string, work: () => Promise<unknown>) => {
        await db.query('SAVEPOINT destination_fault');
        let refused = false;
        try {
          await work();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const expected =
            name === 'wrong-role' || name === 'expired-session'
              ? /^Current authorized matter session required$/u
              : name === 'changed-lookup-label'
                ? /stale complete row/u
                : name === 'retry-after-later-lookup-edit-refused'
                  ? /postimage was edited/u
                  : /Complete inbound membership set/u;
          assert.match(message, expected, `${name}: ${message}`);
          refused = true;
        }
        await db.query('ROLLBACK TO SAVEPOINT destination_fault');
        assert(refused, name);
        probes.push(name);
      };
      await fault('wrong-role', () =>
        executeTask69Destination(db, operation, auth.find((a) => a.role === 'Lawyer')!.claims),
      );
      await fault('expired-session', () =>
        executeTask69Destination(db, operation, {
          ...authority,
          absoluteExpiresAt: Date.now() - 1000,
        }),
      );
      await fault('changed-lookup-label', async () => {
        await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
        await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
          randomUUID(),
          operation.operationId,
          authority.auditSessionId,
        ]);
        await db.query(
          "UPDATE public.lookup_matter_destination SET label_ar=label_ar||' [task69 drift fixture]' WHERE id=26",
        );
        await executeTask69Destination(db, operation, authority);
      });
      for (const [name, id, destination] of [
        ['extra-reference-refused', 1, 26],
        ['missing-reference-refused', 1663, null],
      ] as const) {
        await fault(name, async () => {
          await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
          await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
            randomUUID(),
            operation.operationId,
            authority.auditSessionId,
          ]);
          await db.query(
            'UPDATE public.admin_tasks SET destination_id=$1,row_version=row_version+1 WHERE id=$2',
            [destination, id],
          );
          await executeTask69Destination(db, operation, authority);
        });
      }
      const result = await executeTask69Destination(db, operation, authority);
      assert.deepEqual(await executeTask69Destination(db, operation, authority), result);
      const deltas = (
        await db.query(
          'SELECT entity_table,entity_key,before_values,after_values FROM _migration.task69_delta WHERE receipt_id=$1 ORDER BY ordinal',
          [result.receipt_id],
        )
      ).rows;
      assert.equal(deltas.length, 3);
      assert.deepEqual(
        deltas.map((d) => [d.entity_table, d.entity_key.id]),
        [
          ['lookup_matter_destination', 26],
          ['lookup_matter_destination', 32],
          ['matters', 3048],
        ],
      );
      const aliases = result.source_occurrences as unknown[];
      assert.equal(aliases.length, 2);
      probes.push(
        'exact-three-deltas-fifteen-inbound-references-and-two-retained-labels',
        'same-receipt-retry-no-new-effects',
      );
      let dependents = 0;
      for (const id of contract.stages['S3-admin-parents']) {
        const e = contract.byIssue.get(id)!;
        if (e.dependencies.includes('DEST-INVESTMENT-26-32')) {
          await assertTask69Preflight(db, e, operation);
          dependents++;
        }
      }
      assert.equal(dependents, 31);
      probes.push('all31-dependent-guards-follow-exact-normalization-receipt');
      for (const namespace of ['public.lookup_court', 'public.lookup_matter_destination']) {
        const allowed = operation.allowlist.find(
          (e) =>
            e.issue_id.startsWith('LOOKUP/') && JSON.parse(e.payload_text).namespace === namespace,
        )!;
        assert.ok(allowed);
        const added = await executeTask69Lookup(db, operation, allowed.issue_id, authority);
        assert.deepEqual(
          await executeTask69Lookup(db, operation, allowed.issue_id, authority),
          added,
        );
        assert.equal(
          (
            await db.query('SELECT _migration.task69_lookup_receipt_valid($1) valid', [
              added.receipt_id,
            ])
          ).rows[0].valid,
          true,
        );
      }
      probes.push('court-and-destination-native-schema-shapes-no-fabricated-code');
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      await fault('retry-after-later-lookup-edit-refused', async () => {
        await db.query('SET CONSTRAINTS ALL DEFERRED');
        await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
        await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
          randomUUID(),
          randomUUID(),
          authority.auditSessionId,
        ]);
        await db.query(
          'UPDATE public.lookup_matter_destination SET sort_order=sort_order+1 WHERE id=26',
        );
        await executeTask69Destination(db, operation, authority);
      });
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
            result,
            deltas,
            before,
            rolledBack: true,
            ownerActions: 'NOT_APPLIED',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      console.log('PASS ' + probes.join('; '));
    } catch (error) {
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
            probes,
            message: error instanceof Error ? error.message : String(error),
            diagnostic:
              error instanceof Error
                ? {
                    where: (error as Error & { where?: string }).where,
                    detail: (error as Error & { detail?: string }).detail,
                    stack: error.stack,
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
      throw error;
    }
  });
}
main().catch((e) => {
  console.error(
    e instanceof Error
      ? JSON.stringify({
          message: e.message,
          where: (e as Error & { where?: string }).where,
          detail: (e as Error & { detail?: string }).detail,
        })
      : String(e),
  );
  process.exitCode = 1;
});
