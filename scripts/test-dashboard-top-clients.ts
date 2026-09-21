import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDatabaseClient } from '../src/lib/db';
import {
  readTopClients,
  topClientRowsQuery,
  topClientPopulationQuery,
} from '../src/lib/top-clients-query';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
async function main() {
  const out = process.env['TASK51_OUTPUT'],
    priv = process.env['TASK51_PRIVATE'];
  assert.ok(out && priv);
  const f = JSON.parse(readFileSync(`${priv}/fixture.json`, 'utf8'));
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(f.migrationUrl), f.environment),
    { databaseUrl: f.migrationUrl },
  );
  const runtime = createDatabaseClient(f.runtimeUrl);
  try {
    const b = await withApprovedMigrationClient(
      async (db) => ({
        matters: (await db.query('SELECT id,status,client_id FROM matters')).rows,
        clients: (await db.query('SELECT id,name_ar,is_archived,status FROM clients')).rows,
      }),
      {
        databaseUrl: f.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
    const active = b.matters.filter((m) => m.status === 'سارية');
    const scores = b.clients
      .map((c) => ({
        id: c.id,
        name: c.name_ar,
        archived: c.is_archived,
        status: c.status,
        total: new Set(active.filter((m) => m.client_id === c.id).map((m) => m.id)).size,
      }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total || a.id - b.id);
    const expected = scores
      .filter((c) => c.total >= (scores[4]?.total ?? 1))
      .map((c) => ({ ...c, rank: scores.filter((s) => s.total > c.total).length + 1 }));
    const total = active.length,
      unassigned = active.filter((m) => m.client_id === null).length,
      clients = scores.length;
    const sessions = await lifecycleSessions(runtime);
    assert.equal(sessions.length, 4);
    for (const s of sessions)
      assert.deepEqual(await readTopClients(s, runtime), {
        total,
        unassigned,
        clients,
        rows: expected,
      });
    const plans = await withApprovedMigrationClient(
      async (db) =>
        Promise.all(
          [topClientPopulationQuery(), topClientRowsQuery()].map(async (q) => ({
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
      `${out}/top-results.json`,
      JSON.stringify(
        { status: 'PASS', cluster: f.clusterId, total, unassigned, clients, expected, plans },
        null,
        2,
      ),
    );
    console.log('PASS top-client independent full-volume ID ranking and all four roles');
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Top client test failed');
  process.exitCode = 1;
});
