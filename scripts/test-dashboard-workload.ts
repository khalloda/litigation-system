import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDatabaseClient } from '../src/lib/db';
import {
  readLawyerWorkload,
  lawyerPopulationQuery,
  lawyerWorkloadQuery,
} from '../src/lib/lawyer-workload-query';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
async function main() {
  const output = process.env['TASK51_OUTPUT'],
    priv = process.env['TASK51_PRIVATE'];
  assert.ok(output && priv);
  const f = JSON.parse(readFileSync(`${priv}/fixture.json`, 'utf8'));
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(f.migrationUrl), f.environment),
    { databaseUrl: f.migrationUrl },
  );
  const runtime = createDatabaseClient(f.runtimeUrl);
  try {
    const baseline = await withApprovedMigrationClient(
      async (db) => ({
        matters: (await db.query('SELECT id,status,is_archived FROM matters')).rows,
        people: (await db.query('SELECT id,name_ar,is_staff,is_active,can_login FROM people')).rows,
        members: (await db.query('SELECT matter_id,person_id,role,is_retired FROM matter_lawyers'))
          .rows,
      }),
      {
        databaseUrl: f.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
    const active = new Set(baseline.matters.filter((m) => m.status === 'سارية').map((m) => m.id));
    const assigned = baseline.members.filter(
      (m) => active.has(m.matter_id) && m.is_retired === false,
    );
    const expected = baseline.people
      .map((p) => {
        const own = assigned.filter((m) => m.person_id === p.id);
        const count = (role?: string) =>
          new Set(own.filter((m) => !role || m.role === role).map((m) => m.matter_id)).size;
        return {
          id: p.id,
          name: p.name_ar,
          staff: p.is_staff,
          active: p.is_active,
          lead: count('lead'),
          coLead: count('co_lead'),
          support: count('support'),
          total: count(),
        };
      })
      .filter((p) => p.total > 0)
      .sort((a, b) => a.id - b.id);
    const total = active.size,
      unassigned = total - new Set(assigned.map((m) => m.matter_id)).size;
    const sessions = await lifecycleSessions(runtime);
    assert.equal(sessions.length, 4);
    for (const s of sessions)
      assert.deepEqual(await readLawyerWorkload(s, runtime), { total, unassigned, rows: expected });
    const plans = await withApprovedMigrationClient(
      async (db) =>
        Promise.all(
          [lawyerPopulationQuery(), lawyerWorkloadQuery()].map(async (q) => ({
            sql: q.text,
            plan: (await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + q.text, q.values))
              .rows[0]['QUERY PLAN'],
          })),
        ),
      {
        databaseUrl: f.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
    writeFileSync(
      `${output}/workload-results.json`,
      JSON.stringify(
        {
          status: 'PASS',
          cluster: f.clusterId,
          total,
          unassigned,
          expected,
          roles: sessions.map((s) => s.user.role),
          coverage: {
            activeMatters: active.size,
            retiredMembers: baseline.members.filter((m) => m.is_retired).length,
            coLeads: assigned.filter((m) => m.role === 'co_lead').length,
            nonStaffGroups: expected.filter((p) => !p.staff).length,
            inactiveGroups: expected.filter((p) => !p.active).length,
            overlapping: assigned.length > new Set(assigned.map((m) => m.matter_id)).size,
          },
          plans,
        },
        null,
        2,
      ),
    );
    console.log('PASS independent distinct matter/person/role oracle and all four roles');
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Workload tests failed');
  process.exitCode = 1;
});
