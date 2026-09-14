import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { setMaintenanceAuditContext } from './audit-maintenance-context';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { readAdminWork, readAdminWorks } from '../../src/lib/admin-work-query';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { staffReadOnlyState } from './staff-read-only-state';

/** Explicitly synthetic application-native rows, only inside the owned copy.
 * Imported ordinals cannot be changed; native NULL ordinals exercise the
 * permitted tie case without weakening any source constraint. */
export async function proveAdminWorkEdges(
  fixture: IsolatedPostgres,
  output: string,
  runtime: PrismaClient,
) {
  const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(work, { databaseUrl: fixture.migrationUrl });
  const fixtureIds = await inspect(async (db) => {
    await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
    await db.query('BEGIN');
    try {
      await setMaintenanceAuditContext(db, 'task44-native-edge-fixtures');
      const ids = [];
      for (let i = 0; i < 2; i++)
        ids.push(
          (
            await db.query(
              `INSERT INTO admin_tasks(required_work,last_followup,legacy_assignee_raw,status,task_created_date,updated_at) VALUES($1,$2,$3,$4,$5,now()) RETURNING id`,
              [
                'TEST ONLY duplicate work',
                'TEST ONLY <script> literal & note\n'.repeat(30),
                'TEST ONLY unresolved',
                i ? '' : null,
                i ? '2020-02-29' : null,
              ],
            )
          ).rows[0].id as number,
        );
      const steps = [];
      for (let i = 0; i < 27; i++)
        steps.push(
          (
            await db.query(
              `INSERT INTO task_actions(task_id,action_date,result,report,legacy_performed_by_raw,updated_at) VALUES($1,$2,$3,$4,$5,now()) RETURNING id`,
              [
                ids[0],
                i % 2 ? '2024-12-31' : '2020-01-01',
                'TEST ONLY result',
                i === 0 ? 'TEST ONLY long report\n'.repeat(40) : 'TEST ONLY report',
                'TEST ONLY unresolved',
              ],
            )
          ).rows[0].id as number,
        );
      await db.query('COMMIT');
      return { ids, steps };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  });
  try {
    const before = await inspect(staffReadOnlyState);
    for (const session of await lifecycleSessions(runtime)) {
      const rows = await readAdminWorks(session, { q: 'TEST ONLY duplicate work' }, runtime);
      assert.equal(rows.total, 2);
      assert.deepEqual(new Set(rows.rows.map((r) => r.id)), new Set(fixtureIds.ids));
      const first = await readAdminWork(session, String(fixtureIds.ids[0]), '1', runtime),
        second = await readAdminWork(session, String(fixtureIds.ids[0]), '2', runtime);
      assert.ok(first && second);
      assert.equal(first.matterId, null);
      assert.equal(first.clientId, null);
      assert.equal(first.personId, null);
      assert.equal(first.taskCreatedDate, null);
      assert.equal(first.assigneeRaw, 'TEST ONLY unresolved');
      assert.equal(first.lastFollowup, 'TEST ONLY <script> literal & note\n'.repeat(30));
      assert.deepEqual(
        [...first.steps, ...second.steps].map((s) => s.id),
        fixtureIds.steps,
      );
      assert.ok(
        [...first.steps, ...second.steps].every(
          (s) =>
            s.sourceOrdinal === null &&
            s.personId === null &&
            s.performerRaw === 'TEST ONLY unresolved',
        ),
      );
      assert.equal(
        (await readAdminWork(session, String(fixtureIds.ids[0]), '2147483647', runtime))!.stepPage,
        2,
      );
      assert.equal(
        (
          await readAdminWorks(
            session,
            { q: 'TEST ONLY duplicate work', status: 'missing' },
            runtime,
          )
        ).total,
        1,
      );
      assert.equal(
        (
          await readAdminWorks(
            session,
            { q: 'TEST ONLY duplicate work', status: 'value:' },
            runtime,
          )
        ).total,
        1,
      );
    }
    assert.deepEqual(await inspect(staffReadOnlyState), before);
    writeFileSync(
      join(output, 'edge-results.json'),
      JSON.stringify(
        {
          fixtureOnly: true,
          tasks: 2,
          steps: 27,
          allFourRoles: true,
          duplicateTextDistinctIds: true,
          nullOrdinalIdTieBreak: true,
          datesDoNotReorder: true,
          nullAndEmptyStatusDistinct: true,
          missingParentAndRawPeople: true,
          longMultilineExact: true,
          readsUnchanged: true,
          fixtureIds,
        },
        null,
        2,
      ),
    );
    console.log('PASS synthetic native edge cases for all four roles; source rows unchanged');
    return fixtureIds.ids[0]!;
  } finally {
    await runtime.$disconnect();
  }
}
