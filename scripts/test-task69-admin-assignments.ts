import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../src/generated/prisma/client';
import type { SessionClaims } from '../src/lib/auth/session';
import { parseAdminMutationInput, AdminMutationError } from '../src/lib/admin-work-mutation-input';
import {
  adminCountQuery,
  adminRowsQuery,
  adminDetailQuery,
  adminOptionsQuery,
  parseAdminFilters,
  type AdminRow,
} from '../src/lib/admin-work-query';
import { withApprovedMigrationClient, migrationDatabaseTarget } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import {
  task69AdminAssignmentApplied,
  assertTask69AdminAssignments,
} from './lib/task69-admin-assignment-checkpoint';
async function main() {
  const started = new Date().toISOString(),
    root = process.env['TASK69_PRIVATE_ROOT']!,
    output = process.env['TASK69_EVIDENCE_OUTPUT']!;
  const auth = JSON.parse(readFileSync(join(root, 'fixture-logins.json'), 'utf8')) as {
    role: string;
    claims: SessionClaims;
  }[];
  const actor = auth.find((x) => x.role === 'Administrator')!.claims,
    probes: string[] = [];
  await withApprovedMigrationClient(async (db) => {
    const target = migrationDatabaseTarget();
    assert(target.database.startsWith('litigation_task69_'));
    await assertIsolatedTestCluster(
      db,
      new URL(`${target.protocol}//${target.hostname}:${target.port}/${target.database}`),
    );
    assert.equal(await task69AdminAssignmentApplied(db), true);
    const capture = async () =>
      (
        await db.query(
          "SELECT 'admin_tasks' entity,count(*)::int n,md5(string_agg(to_jsonb(a)::text,E'\\n' ORDER BY id)) digest FROM public.admin_tasks a UNION ALL SELECT 'admin_task_assignees',count(*)::int,md5(string_agg(to_jsonb(a)::text,E'\\n' ORDER BY id)) FROM public.admin_task_assignees a UNION ALL SELECT 'audit_events',count(*)::int,md5(string_agg(to_jsonb(a)::text,E'\\n' ORDER BY id)) FROM public.audit_events a",
        )
      ).rows;
    const before = await capture();
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      const task = (
        await db.query(
          'SELECT a.id FROM public.admin_tasks a LEFT JOIN public.matters m ON m.id=a.matter_id WHERE NOT a.is_archived AND NOT coalesce(m.is_archived,false) ORDER BY a.id LIMIT 1',
        )
      ).rows[0].id;
      const ids = (
        await db.query(
          'SELECT id FROM public.people WHERE is_staff AND is_active ORDER BY id LIMIT 2',
        )
      ).rows.map((x) => x.id as number);
      assert.equal(ids.length, 2);
      const args = [
        actor.userId,
        actor.sessionVersion,
        actor.role,
        new Date(actor.absoluteExpiresAt).toISOString(),
      ];
      const state = async () =>
        (
          await db.query('SELECT public.admin_edit_state($1,$2,$3,$4,$5,NULL) value', [
            ...args,
            task,
          ])
        ).rows[0].value;
      const save = async (values: Record<string, unknown>, claims = actor, version?: string) => {
        const versionNow = version ?? (await state()).task.version;
        const input = parseAdminMutationInput('task-update', {
          operation: 'task-update',
          task_id: task,
          step_id: null,
          version: versionNow,
          submission: randomUUID(),
          values,
        });
        await db.query('SELECT public.audit_set_human_context($1)', [claims.userId]);
        await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
          randomUUID(),
          randomUUID(),
          claims.auditSessionId,
        ]);
        await db.query('SET LOCAL ROLE litigation_runtime');
        const result = (
          await db.query('SELECT public.admin_edit_save($1,$2,$3,$4,$5::jsonb) value', [
            claims.userId,
            claims.sessionVersion,
            claims.role,
            new Date(claims.absoluteExpiresAt).toISOString(),
            JSON.stringify(input),
          ])
        ).rows[0].value;
        await db.query('RESET ROLE');
        return result;
      };
      const fault = async (name: string, action: () => Promise<unknown>) => {
        await db.query('SAVEPOINT assignment_fault');
        let refused = false;
        try {
          await action();
        } catch {
          refused = true;
        }
        await db.query('ROLLBACK TO SAVEPOINT assignment_fault');
        assert(refused, name);
        probes.push(name);
      };
      const old = await state();
      assert.equal((await save({ assignee_person_ids: ids })).changed, true);
      const after = await state();
      assert.equal(after.task.values.assigned_to_person_id, null);
      assert.deepEqual(after.task.values.assignee_person_ids, ids);
      assert.equal((await save({ assignee_person_ids: ids })).changed, false);
      assert.equal((await save({ assigned_to_person_id: null })).changed, false);
      const query = async <T>(sql: Prisma.Sql) => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        const rows = (await db.query(sql.text, [...sql.values])).rows as T[];
        await db.query('RESET ROLE');
        return rows;
      };
      const details = await query<AdminRow>(adminDetailQuery(task));
      assert.equal(details.length, 1);
      assert.deepEqual(
        details[0]!.assignees.map((x) => x.id),
        ids,
      );
      const total = (
        await query<{ total: number }>(adminCountQuery(parseAdminFilters({ archive: 'all' })))
      )[0]!.total;
      assert.equal(total, before.find((x) => x.entity === 'admin_tasks').n);
      for (const id of ids) {
        const filters = parseAdminFilters({ person: String(id), archive: 'all' });
        const expected = (
          await db.query(
            'SELECT task_id id FROM public.admin_task_assignees WHERE person_id=$1 AND NOT is_retired ORDER BY task_id',
            [id],
          )
        ).rows
          .map((x) => x.id)
          .sort((a, b) => a - b);
        const count = (await query<{ total: number }>(adminCountQuery(filters)))[0]!.total;
        assert.equal(count, expected.length);
        const found: number[] = [];
        for (let page = 1; page <= Math.ceil(count / 25); page++)
          found.push(...(await query<AdminRow>(adminRowsQuery(filters, page))).map((x) => x.id));
        assert.equal(new Set(found).size, found.length);
        assert.deepEqual(
          found.sort((a, b) => a - b),
          expected,
        );
        assert(found.includes(task));
      }
      const unassigned = await query<{ total: number }>(
        adminCountQuery(parseAdminFilters({ person: 'missing', archive: 'all' })),
      );
      const expectedUnassigned = (
        await db.query(
          'SELECT count(*)::int n FROM public.admin_tasks a WHERE NOT EXISTS(SELECT 1 FROM public.admin_task_assignees m WHERE m.task_id=a.id AND NOT m.is_retired)',
        )
      ).rows[0].n;
      assert.equal(unassigned[0]!.total, expectedUnassigned);
      const aliases = (
        await db.query(
          'SELECT alias_ar FROM public.person_name_alias WHERE person_id=$1 AND NOT is_retired ORDER BY id LIMIT 1',
          [ids[1]],
        )
      ).rows;
      assert.equal(aliases.length, 1);
      const searched = await query<AdminRow>(
        adminRowsQuery(
          parseAdminFilters({
            q: aliases[0].alias_ar,
            matter:
              old.task.values.matter_id === null ? 'missing' : String(old.task.values.matter_id),
            archive: 'all',
          }),
          1,
        ),
      );
      assert(searched.some((x) => x.id === task));
      const choices = await query<{ kind: string; value: string }>(adminOptionsQuery());
      for (const id of ids)
        assert(choices.some((x) => x.kind === 'person' && x.value === String(id)));
      probes.push(
        'two-person-detail-filter-alias-search-options-distinct-count-and-complete-pagination',
        'old-null-and-equal-array-noop',
      );
      for (const value of [[ids[0], ids[0]], [null], ['1'], null, {}, Array(1001).fill(1)])
        assert.throws(
          () =>
            parseAdminMutationInput('task-update', {
              operation: 'task-update',
              task_id: task,
              step_id: null,
              version: after.task.version,
              submission: randomUUID(),
              values: { assignee_person_ids: value },
            }),
          AdminMutationError,
        );
      assert.throws(
        () =>
          parseAdminMutationInput('task-update', {
            operation: 'task-update',
            task_id: task,
            step_id: null,
            version: after.task.version,
            submission: randomUUID(),
            values: { assignee_person_ids: ids, assigned_to_person_id: null },
          }),
        AdminMutationError,
      );
      probes.push('invalid-and-ambiguous-input-refused');
      await fault('lawyer-denied', () =>
        save({ assignee_person_ids: [ids[0]] }, auth.find((x) => x.role === 'Lawyer')!.claims),
      );
      await fault('expired-denied', () =>
        save({ assignee_person_ids: [ids[0]] }, { ...actor, absoluteExpiresAt: Date.now() - 1000 }),
      );
      await fault('stale-denied', () =>
        save({ assignee_person_ids: [ids[0]] }, actor, old.task.version),
      );
      const inactive = (
        await db.query('SELECT id FROM public.people WHERE NOT is_active ORDER BY id LIMIT 1')
      ).rows[0].id;
      await fault('inactive-new-assignment-denied', () =>
        save({ assignee_person_ids: [inactive] }),
      );
      await fault('direct-runtime-membership-denied', async () => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        await db.query(
          'UPDATE public.admin_task_assignees SET is_retired=true,position=NULL WHERE task_id=$1',
          [task],
        );
      });
      assert.equal(
        (
          await save(
            { assigned_to_person_id: ids[0] },
            auth.find((x) => x.role === 'Paralegal')!.claims,
          )
        ).changed,
        true,
      );
      assert.equal(
        (
          await save(
            { assignee_person_ids: ids },
            auth.find((x) => x.role === 'Litigation Assistant')!.claims,
          )
        ).changed,
        true,
      );
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      await assertTask69AdminAssignments(db);
      probes.push('administrator-paralegal-assistant-allowed-with-audit-and-continuous-history');
      await db.query('ROLLBACK');
      assert.deepEqual(await capture(), before);
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'PASS',
            started,
            completed: new Date().toISOString(),
            target: {
              cluster: process.env['TASK40A_ISOLATED_CLUSTER'],
              database: target.database,
              port: target.port,
            },
            taskId: task,
            probes,
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
            probes,
            message: error instanceof Error ? error.message : String(error),
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
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
