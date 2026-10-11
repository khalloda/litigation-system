import {
  adminDetailQuery,
  adminCountQuery,
  adminRowsQuery,
  parseAdminFilters,
  unassignedAdminCountQuery,
  unassignedAdminRowsQuery,
} from '../src/lib/admin-work-query';
import { task69StepCatalog } from './lib/task69-step-checkpoint';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionClaims } from '../src/lib/auth/session';
import { loadTask69Contract, type Row } from './lib/task69-contract';
import {
  prepareTask69Operation,
  withTask69Fixture,
  bindTask69Operation,
  task69RunnerSourceDigest,
  task69SchemaSourceDigest,
  type Task69PreparedOperation,
} from './lib/task69-runner';
import { executeTask69Step, executeTask69GeneratedParent } from './lib/task69-step-executor';
import { executeTask69Admin } from './lib/task69-admin-executor';
import { executeTask69Destination } from './lib/task69-destination-executor';
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
    }[],
    authority = auth.find((x) => x.role === 'Administrator')!.claims;
  const sql = readFileSync(
      'prisma/migrations/20261007200000_task69_step_restoration/migration.sql',
      'utf8',
    ),
    draft = process.argv.includes('--draft'),
    focused = process.argv.includes('--focused'),
    parents = process.argv.includes('--parents');
  const planPath = join(privateRoot, 'step-operation.json');
  let operation: Task69PreparedOperation;
  if (draft || focused || parents) {
    if (parents)
      assert(
        !existsSync(planPath),
        'Inspect retained parent-operation state before any repeated preparation',
      );
    operation = prepareTask69Operation({
      directory,
      operationId: randomUUID(),
      cluster: descriptor.cluster,
      database: descriptor.database,
      runnerSha256: task69RunnerSourceDigest(resolve('.')),
      schemaSha256: task69SchemaSourceDigest(process.cwd()),
    });
  } else {
    operation = JSON.parse(readFileSync(planPath, 'utf8')).operation;
    assert.equal(
      operation.runnerSha256,
      task69RunnerSourceDigest(resolve('.')),
      'Committed rehearsal runner changed; keep old evidence and start a distinct fixture',
    );
    assert.equal(operation.schemaSha256, task69SchemaSourceDigest(process.cwd()));
  }
  assert.equal(operation.targetCluster, descriptor.cluster);
  assert.equal(operation.targetDatabase, descriptor.database);
  const results: Row[] = [],
    probes: string[] = [];
  await withTask69Fixture(operation, async (db) => {
    const capture = async () => {
      const out = [];
      for (const table of [
        'admin_tasks',
        'admin_task_assignees',
        'task_actions',
        'audit_events',
        'matters',
        'lookup_court',
        'lookup_matter_destination',
      ])
        out.push({
          table,
          ...(
            await db.query(
              `SELECT count(*)::int n,md5(string_agg(to_jsonb(r)::text,E'\\n' ORDER BY id)) digest FROM public.${table} r`,
            )
          ).rows[0],
        });
      return out;
    };
    const before = await capture();
    let committed = false,
      commitAttempted = false;
    try {
      if (parents)
        writeFileSync(
          planPath,
          JSON.stringify({ state: 'prepared', started, operation }, null, 2) + '\n',
          { flag: 'wx' },
        );
      await db.query(
        draft
          ? sql.replace('BEGIN;', 'BEGIN ISOLATION LEVEL SERIALIZABLE;').replace(/COMMIT;\s*$/u, '')
          : 'BEGIN ISOLATION LEVEL SERIALIZABLE',
      );
      if (draft)
        writeFileSync(
          output.replace(/\.json$/u, '-schema.json'),
          JSON.stringify(await task69StepCatalog(db), null, 2) + '\n',
          { flag: 'wx' },
        );
      await bindTask69Operation(db, operation, authority);
      if (parents) {
        await executeTask69Destination(db, operation, authority);
        for (const [i, id] of contract.stages['S3-admin-parents'].entries()) {
          const r = await executeTask69Admin(db, operation, contract.byIssue.get(id)!, authority);
          results.push({ issueId: id, receiptId: r.receipt_id!, returned: r.returned_ids! });
          if ((i + 1) % 100 === 0) console.log('Prepared S3 parent ' + (i + 1) + '/544');
        }
        for (const e of operation.allowlist.filter((e) =>
          e.issue_id.startsWith('GENERATED-PARENT/'),
        )) {
          const r = await executeTask69GeneratedParent(db, operation, e.issue_id, authority);
          results.push({
            issueId: e.issue_id,
            receiptId: r.receipt_id!,
            returned: r.returned_ids!,
          });
        }
        assert.equal(results.length, 574);
        await db.query('SET CONSTRAINTS ALL IMMEDIATE');
        commitAttempted = true;
        await db.query('COMMIT');
        committed = true;
        writeFileSync(
          planPath,
          JSON.stringify(
            { state: 'committed-parents', started, completed: new Date().toISOString(), operation },
            null,
            2,
          ) + '\n',
        );
      } else {
        const ids = contract.stages['S4-step-restoration'].filter(
          (id) =>
            !(draft || focused) ||
            typeof (contract.byIssue.get(id)!.approvedOutcome.step as Row).parentTask ===
              'number' ||
            (contract.byIssue.get(id)!.approvedOutcome.step as Row).parentTask === null,
        );
        assert.equal(ids.length, draft || focused ? 40 : 769);
        for (const [i, id] of ids.entries()) {
          const entry = contract.byIssue.get(id)!,
            intended = entry.approvedOutcome.step as Row,
            r = await executeTask69Step(db, operation, entry, authority);
          assert.deepEqual(await executeTask69Step(db, operation, entry, authority), r);
          const returned = r.returned_ids as Row,
            actual = (
              await db.query('SELECT to_jsonb(s) value FROM public.task_actions s WHERE id=$1', [
                returned.stepId,
              ])
            ).rows[0].value as Row;
          for (const [key, value] of Object.entries(intended)) {
            if (['id', 'parentTask', 'unassignedSeparateRecord'].includes(key)) continue;
            assert.deepEqual(
              actual[key],
              key === 'report' && value !== null ? String(value) : value,
              id + '/' + key,
            );
          }
          assert.equal(actual.current_order, null);
          assert.equal(actual.task_id, returned.taskId);
          if (intended.parentTask === null) assert.equal(actual.task_id, null);
          if (typeof intended.parentTask === 'number')
            assert.equal(actual.task_id, intended.parentTask);
          results.push({
            issueId: id,
            receiptId: r.receipt_id!,
            returned: r.returned_ids!,
            actual,
            sourceOccurrences: r.source_occurrences!,
          });
          if ((i + 1) % 100 === 0) console.log('Proved S4 ' + (i + 1) + '/769');
        }
        // Production query builders execute with the real runtime role. Every
        // true NULL-parent source stays an individual row across page boundaries.
        const orphanFilter = parseAdminFilters({});
        const runQuery = async (sql: { text: string; values: readonly unknown[] }) => {
          await db.query('SET LOCAL ROLE litigation_runtime');
          const rows = (await db.query(sql.text, [...sql.values])).rows;
          await db.query('RESET ROLE');
          return rows;
        };
        const expectedOrphans = (
          await db.query('SELECT id FROM public.task_actions WHERE task_id IS NULL ORDER BY id')
        ).rows.map((r) => r.id);
        const orphanCount = (await runQuery(unassignedAdminCountQuery(orphanFilter)))[0].total;
        assert.equal(orphanCount, expectedOrphans.length);
        const shown: number[] = [];
        for (let page = 1; page <= Math.ceil(orphanCount / 25); page++)
          shown.push(
            ...(await runQuery(unassignedAdminRowsQuery(orphanFilter, page))).map((r) => r.id),
          );
        assert.deepEqual(shown, expectedOrphans);
        assert.equal(new Set(shown).size, shown.length);
        assert.equal(results.filter((r) => (r.returned as Row).taskId === null).length, 39);
        probes.push('all-39-null-parent-sources-remain-distinct-across-runtime-pages');
        for (const result of results.filter((r) => (r.returned as Row).taskId === null)) {
          const actual = result.actual as Row;
          const filter = parseAdminFilters({ q: String(actual.legacy_id) });
          const found = await runQuery(unassignedAdminRowsQuery(filter, 1));
          assert(
            found.some((r) => r.id === actual.id),
            'Exact individual source remains searchable',
          );
        }
        if (!draft && !focused) {
          const dependencies = operation.allowlist.filter((e) =>
            e.issue_id.startsWith('GENERATED-PARENT/'),
          );
          assert.equal(dependencies.length, 30);
          for (const dependency of dependencies) {
            const payload = JSON.parse(dependency.payload_text);
            const parentId = (
              await db.query('SELECT _migration.task69_committed_parent($1,$2) id', [
                operation.operationId,
                dependency.issue_id,
              ])
            ).rows[0].id;
            const detail = (await runQuery(adminDetailQuery(parentId)))[0];
            assert.equal(detail.requiredWork, null);
            assert.equal(detail.legacyId, null);
            assert.equal(detail.matterId, null);
            assert.deepEqual(detail.assignees, []);
            assert.equal(detail.historicalContext.label, payload.contract.displayLabel);
            assert.equal(detail.historicalContext.sourceTaskId, payload.sourceTaskId);
            const filter = parseAdminFilters({ q: payload.contract.displayLabel });
            assert.equal((await runQuery(adminCountQuery(filter)))[0].total, 1);
            assert.deepEqual(
              (await runQuery(adminRowsQuery(filter, 1))).map((r) => r.id),
              [parentId],
            );
          }
          probes.push(
            '30-generated-contexts-visible-with-null-business-fields-and-distinct-counts',
          );
        }
        const fault = async (name: string, expected: RegExp, work: () => Promise<unknown>) => {
          await db.query('SAVEPOINT step_fault');
          let refused = false;
          try {
            await work();
          } catch (e) {
            assert.match(e instanceof Error ? e.message : String(e), expected);
            refused = true;
          }
          await db.query('ROLLBACK TO SAVEPOINT step_fault');
          assert(refused, name);
          probes.push(name);
        };
        const example = contract.byIssue.get(ids[0]!)!;
        await fault('runtime-cannot-restore', /permission denied/u, async () => {
          await db.query('SET LOCAL ROLE litigation_runtime');
          await executeTask69Step(db, operation, example, authority);
        });
        await fault(
          'lawyer-cannot-retry-restoration',
          /Current authorized matter session required/u,
          () =>
            executeTask69Step(
              db,
              operation,
              example,
              auth.find((a) => a.role === 'Lawyer')!.claims,
            ),
        );
        await fault(
          'expired-session-cannot-retry-restoration',
          /Current authorized matter session required/u,
          () =>
            executeTask69Step(db, operation, example, {
              ...authority,
              absoluteExpiresAt: Date.now() - 1,
            }),
        );
        const changed = structuredClone(example);
        (changed.approvedOutcome.step as Row).result = 'altered';
        await fault(
          'changed-source-outcome-refused',
          /Source, authority, payload or complete guard closure changed/u,
          () => executeTask69Step(db, operation, changed, authority),
        );
        if (draft || focused) {
          const generated = operation.allowlist.find((e) =>
            e.issue_id.startsWith('GENERATED-PARENT/'),
          )!;
          const r = await executeTask69GeneratedParent(
            db,
            operation,
            generated.issue_id,
            authority,
          );
          assert.deepEqual(
            await executeTask69GeneratedParent(db, operation, generated.issue_id, authority),
            r,
          );
          await fault(
            'uncommitted-generated-parent-refused',
            /Committed exact parent receipt required/u,
            () =>
              db.query('SELECT _migration.task69_committed_parent($1,$2)', [
                operation.operationId,
                generated.issue_id,
              ]),
          );
        }
        const attached = results.find((r) => (r.returned as Row).taskId !== null)!;
        assert(attached);
        const restored = contract.byIssue.get(String(attached.issueId))!;
        const taskId = (attached.returned as Row).taskId,
          stepId = (attached.returned as Row).stepId;
        for (const account of auth) {
          await db.query('SAVEPOINT native_step_proof');
          await db.query(
            "SELECT set_config('litigation.task69_operation','',true),set_config('litigation.task69_issue','',true)",
          );
          const actor = account.claims,
            args = [
              actor.userId,
              actor.sessionVersion,
              actor.role,
              new Date(actor.absoluteExpiresAt).toISOString(),
            ];
          await db.query('SELECT public.audit_set_human_context($1)', [actor.userId]);
          await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
            randomUUID(),
            randomUUID(),
            actor.auditSessionId,
          ]);
          if (account.role === 'Lawyer') {
            await fault(
              'ordinary-lawyer-step-write-refused',
              /Current authorized administrative work session required/u,
              async () => {
                await db.query('SET LOCAL ROLE litigation_runtime');
                await db.query('SELECT public.admin_edit_state($1,$2,$3,$4,$5,$6)', [
                  ...args,
                  taskId,
                  stepId,
                ]);
              },
            );
          } else {
            await db.query('SET LOCAL ROLE litigation_runtime');
            const state = (
              await db.query('SELECT public.admin_edit_state($1,$2,$3,$4,$5,$6) value', [
                ...args,
                taskId,
                stepId,
              ])
            ).rows[0].value;
            const request = {
              operation: 'step-update',
              task_id: taskId,
              step_id: stepId,
              version: state.task.version,
              submission: randomUUID(),
              values: {},
            };
            const unchanged = (
              await db.query('SELECT public.admin_edit_save($1,$2,$3,$4,$5::jsonb) value', [
                ...args,
                JSON.stringify(request),
              ])
            ).rows[0].value;
            assert.equal(unchanged.changed, false);
            const changed = (
              await db.query('SELECT public.admin_edit_save($1,$2,$3,$4,$5::jsonb) value', [
                ...args,
                JSON.stringify({
                  ...request,
                  submission: randomUUID(),
                  values: {
                    result:
                      String(state.step.values.result ?? '') +
                      '\nTask69 isolated native step continuity',
                  },
                }),
              ])
            ).rows[0].value;
            assert.equal(changed.changed, true);
            await db.query('RESET ROLE');
            assert.equal(
              (await db.query('SELECT _migration.admin_edit_current_valid($1) valid', [taskId]))
                .rows[0].valid,
              true,
            );
            await fault(
              account.role + '-native-step-edit-refuses-restoration-retry',
              /postimage was edited/u,
              () => executeTask69Step(db, operation, restored, authority),
            );
            probes.push(account.role + '-ordinary-step-noop-and-edit-continue-source-history');
          }
          await db.query('ROLLBACK TO SAVEPOINT native_step_proof');
        }
        await db.query('SET CONSTRAINTS ALL IMMEDIATE');
        await db.query('ROLLBACK');
        assert.deepEqual(await capture(), before);
      }
      const after = await capture();
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'PASS',
            started,
            completed: new Date().toISOString(),
            draft,
            parents,
            operationId: operation.operationId,
            runnerSha256: operation.runnerSha256,
            schemaSha256: task69SchemaSourceDigest(process.cwd()),
            results,
            probes,
            before,
            after,
            rolledBack: !parents,
            committed,
            ownerActions: 'NOT_APPLIED',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      console.log(
        JSON.stringify({
          status: 'PASS',
          stage: parents ? 'committed-parents' : 'S4',
          issues: results.length,
          probes: probes.length,
          output,
        }),
      );
    } catch (e) {
      await db.query('ROLLBACK');
      const after = await capture();
      if (!commitAttempted) assert.deepEqual(after, before);
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'FAIL',
            started,
            completed: new Date().toISOString(),
            draft,
            parents,
            operationId: operation.operationId,
            schemaSha256: task69SchemaSourceDigest(process.cwd()),
            results,
            probes,
            message: e instanceof Error ? e.message : String(e),
            where: (e as { where?: string }).where,
            position: (e as { position?: string }).position,
            rolledBack: !commitAttempted,
            commitAttempted,
            committed,
            before,
            after,
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
