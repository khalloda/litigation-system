import { probeTask69AdminReport } from './lib/task69-admin-report-proof';
import { task69AdminOriginCatalog } from './lib/task69-admin-restoration-checkpoint';
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
} from './lib/task69-runner';
import { executeTask69Admin } from './lib/task69-admin-executor';
import { executeTask69Destination } from './lib/task69-destination-executor';
import { adminDetailQuery, adminCountQuery, parseAdminFilters } from '../src/lib/admin-work-query';
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
      'prisma/migrations/20261007180000_task69_admin_restoration/migration.sql',
      'utf8',
    ),
    draft = process.argv.includes('--draft'),
    all = process.argv.includes('--all');
  const operation = prepareTask69Operation({
      directory,
      operationId: randomUUID(),
      cluster: descriptor.cluster,
      database: descriptor.database,
      runnerSha256: task69RunnerSourceDigest(resolve('.')),
      schemaSha256: task69Sha(sql),
    }),
    results: Row[] = [],
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
    try {
      await db.query(
        draft
          ? sql.replace('BEGIN;', 'BEGIN ISOLATION LEVEL SERIALIZABLE;').replace(/COMMIT;\s*$/u, '')
          : 'BEGIN ISOLATION LEVEL SERIALIZABLE',
      );
      writeFileSync(
        output.replace(/\.json$/u, '-schema.json'),
        JSON.stringify(await task69AdminOriginCatalog(db), null, 2) + '\n',
        { flag: 'wx' },
      );
      await bindTask69Operation(db, operation, authority);
      await executeTask69Destination(db, operation, authority);
      const ids = contract.stages['S3-admin-parents'].filter(
        (id) =>
          all ||
          [8971, 11184, 11466].includes(
            Number((contract.byIssue.get(id)!.approvedOutcome.task as Row).legacy_id),
          ),
      );
      assert.equal(ids.length, all ? 544 : 3);
      for (const [i, id] of ids.entries()) {
        const entry = contract.byIssue.get(id)!,
          receipt = await executeTask69Admin(db, operation, entry, authority);
        assert.deepEqual(await executeTask69Admin(db, operation, entry, authority), receipt);
        const taskId = (receipt.returned_ids as Row).taskId;
        const actual = (
          await db.query('SELECT to_jsonb(t) task FROM public.admin_tasks t WHERE id=$1', [taskId])
        ).rows[0].task as Row;
        const expected = entry.approvedOutcome.task as Row;
        // Independent per-field comparison, retaining the accepted source values.
        for (const [key, value] of Object.entries(expected)) {
          if (['id', 'assigneePersonIds', 'noPrimary'].includes(key)) continue;
          if (key === 'court_id' || key === 'destination_id') {
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
              if (value.existingId !== null) assert.equal(actual[key], value.existingId);
              const namespace =
                key === 'court_id' ? 'public.lookup_court' : 'public.lookup_matter_destination';
              assert.equal(
                (await db.query(`SELECT label_ar FROM ${namespace} WHERE id=$1`, [actual[key]]))
                  .rows[0].label_ar,
                value.label,
              );
            } else assert.equal(actual[key], value);
          } else
            assert.deepEqual(
              actual[key],
              key === 'alert' && value !== null ? String(value) : value,
              `${id}/${key}`,
            );
        }
        const people = (
          await db.query(
            'SELECT person_id FROM public.admin_task_assignees WHERE task_id=$1 AND NOT is_retired ORDER BY position',
            [taskId],
          )
        ).rows.map((x) => x.person_id);
        assert.deepEqual(people, expected.assigneePersonIds);
        results.push({
          issueId: id,
          receiptId: receipt.receipt_id!,
          returned: receipt.returned_ids!,
          actual,
        });
        if ((i + 1) % 25 === 0) console.log('Exact administrative tasks completed: ' + (i + 1));
      }
      const totalQuery = adminCountQuery(parseAdminFilters({ archive: 'all' }));
      assert.equal(
        (await db.query(totalQuery.text, [...totalQuery.values])).rows[0].total,
        3694 + ids.length,
      );
      const protectedEntry = contract.entries.find(
        (e) =>
          e.store === 'quarantine.admin_task_transform' &&
          (e.approvedOutcome.task as Row).legacy_id === 8971,
      )!;
      const task = (results.find((r) => r.issueId === protectedEntry.issueId)!.returned as Row)
        .taskId;
      const reportProof = await probeTask69AdminReport(db, authority, Number(task));
      const details = adminDetailQuery(Number(task));
      const shown = (await db.query(details.text, [...details.values])).rows[0];
      assert.deepEqual(
        shown.assignees.map((p: { id: number }) => p.id),
        [1, 22],
      );
      assert.equal(shown.personId, null);
      const args = [
        authority.userId,
        authority.sessionVersion,
        authority.role,
        new Date(authority.absoluteExpiresAt).toISOString(),
      ];
      await db.query(
        "SELECT set_config('litigation.task69_operation','',true),set_config('litigation.task69_issue','',true)",
      );
      const state = (
        await db.query('SELECT public.admin_edit_state($1,$2,$3,$4,$5,NULL) value', [...args, task])
      ).rows[0].value;
      assert.deepEqual(state.task.values.assignee_person_ids, [1, 22]);
      const fault = async (name: string, pattern: RegExp, work: () => Promise<unknown>) => {
        await db.query('SAVEPOINT admin_fault');
        let refused = false;
        try {
          await work();
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          assert.match(message, pattern, `${name}: ${message}`);
          refused = true;
        }
        await db.query('ROLLBACK TO SAVEPOINT admin_fault');
        assert(refused, name);
        probes.push(name);
      };
      await fault('wrong-role', /Current authorized matter session required/u, () =>
        executeTask69Admin(
          db,
          operation,
          protectedEntry,
          auth.find((x) => x.role === 'Lawyer')!.claims,
        ),
      );
      await fault('expired-session', /Current authorized matter session required/u, () =>
        executeTask69Admin(db, operation, protectedEntry, {
          ...authority,
          absoluteExpiresAt: Date.now() - 1000,
        }),
      );
      await fault('runtime-private-restoration-denied', /permission denied/u, async () => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        await executeTask69Admin(db, operation, protectedEntry, authority);
      });
      const save = async (values: Row) => {
        await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
        await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
          randomUUID(),
          randomUUID(),
          authority.auditSessionId,
        ]);
        await db.query('SET LOCAL ROLE litigation_runtime');
        const value = (
          await db.query('SELECT public.admin_edit_save($1,$2,$3,$4,$5::jsonb) value', [
            ...args,
            JSON.stringify({
              operation: 'task-update',
              task_id: task,
              step_id: null,
              version: state.task.version,
              submission: randomUUID(),
              values,
            }),
          ])
        ).rows[0].value;
        await db.query('RESET ROLE');
        return value;
      };
      assert.equal((await save({ assigned_to_person_id: null })).changed, false);
      assert.equal((await save({ assignee_person_ids: [1, 22] })).changed, false);
      assert.equal(
        (
          await save({
            result:
              state.task.values.result === null
                ? 'Task69 isolated native edit'
                : state.task.values.result + ' [Task69 isolated native edit]',
          })
        ).changed,
        true,
      );
      await fault('native-edit-blocks-retry', /postimage was edited/u, () =>
        executeTask69Admin(db, operation, protectedEntry, authority),
      );
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      assert.deepEqual(
        (
          await db.query(
            'SELECT id FROM public.admin_tasks WHERE _migration.admin_edit_current_valid(id) IS NOT TRUE',
          )
        ).rows,
        [],
      );
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int n FROM _migration.admin_edit_submission s JOIN _migration.task69_admin_origin o ON o.task_id=s.task_id WHERE s.result_version=1',
          )
        ).rows[0].n,
        0,
        'Restoration and native no-ops do not invent edit submissions',
      );
      const deltas = (
        await db.query(
          "SELECT r.issue_id,d.* FROM _migration.task69_delta d JOIN _migration.task69_receipt r USING(receipt_id) WHERE operation_id=$1 AND entity_table IN('admin_tasks','admin_task_assignees') ORDER BY r.issue_id,d.ordinal",
          [operation.operationId],
        )
      ).rows;
      probes.push(
        'exact-accepted-field-and-membership-comparison',
        'protected-three-task-source-lines',
        'native-null-noop-keeps-two-assignees',
        'historical-inactive-person-retained',
        'native-edit-history-continuity',
        'distinct-list-count',
      );
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
            schemaSha256: task69Sha(sql),
            issues: ids.length,
            reportProof,
            probes,
            results,
            deltas,
            before,
            rolledBack: true,
            sequenceBehavior: 'Advancement retained',
            ownerActions: 'NOT_APPLIED',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      console.log(JSON.stringify({ status: 'PASS', issues: ids.length, output }));
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
            schemaSha256: task69Sha(sql),
            message: error instanceof Error ? error.message : String(error),
            diagnostic:
              error instanceof Error
                ? {
                    where: (error as Error & { where?: string }).where,
                    position: (error as Error & { position?: string }).position,
                    detail: (error as Error & { detail?: string }).detail,
                    stack: error.stack,
                  }
                : null,
            results,
            probes,
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
      ? JSON.stringify({ message: e.message, where: (e as Error & { where?: string }).where })
      : String(e),
  );
  process.exitCode = 1;
});
