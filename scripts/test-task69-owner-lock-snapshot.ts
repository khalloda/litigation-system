import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Client } from 'pg';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { lockTask69PreflightTables } from './lib/task69-owner-preflight';

async function main() {
  const [descriptorFile] = process.argv.slice(2);
  assert(descriptorFile && process.env.TASK69_EVIDENCE_OUTPUT);
  const descriptor = JSON.parse(readFileSync(descriptorFile, 'utf8'));
  assert.notEqual(descriptor.cluster, '7676117521894273062');
  const url = new URL(descriptor.migrationUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.notEqual(url.port, '5433');
  url.pathname = '/litigation_task69_lock_probe_20261012';
  const a = new Client({ connectionString: url.href });
  const b = new Client({ connectionString: url.href });
  await a.connect();
  await b.connect();
  try {
    for (const db of [a, b]) {
      await assertIsolatedTestCluster(db, url, {
        NODE_ENV: 'test',
        TASK40A_ISOLATED_CONTAINER: descriptor.name,
        TASK40A_ISOLATED_TOKEN: descriptor.token,
        TASK40A_ISOLATED_CLUSTER: descriptor.cluster,
      });
      assert.equal(
        (await db.query('SELECT current_database() name')).rows[0].name,
        'litigation_task69_lock_probe_20261012',
      );
    }
    assert.deepEqual(
      (
        await a.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
        )
      ).rows,
      [{ table_name: 'probe' }],
    );
    assert.deepEqual((await a.query('SELECT * FROM probe ORDER BY id')).rows, [
      { id: 1, value: 2 },
      { id: 2, value: 2 },
    ]);
    const tables = { schema: [{ schema: 'public', name: 'probe' }] };
    await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    // This committed change occurs after BEGIN and before the first table lock.
    await b.query('UPDATE probe SET value=3 WHERE id=1');
    await lockTask69PreflightTables(a, tables);
    const seen = (await a.query('SELECT * FROM probe ORDER BY id')).rows;
    assert.deepEqual(seen, [
      { id: 1, value: 3 },
      { id: 2, value: 2 },
    ]);
    assert.notDeepEqual(
      seen,
      [
        { id: 1, value: 2 },
        { id: 2, value: 2 },
      ],
      'A stale preflight cannot pass',
    );
    await a.query('ROLLBACK');
    await b.query("SET lock_timeout='250ms'");
    await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await lockTask69PreflightTables(a, tables);
    await assert.rejects(
      b.query('UPDATE probe SET value=4 WHERE id=1'),
      (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && e.code === '55P03',
    );
    assert.deepEqual((await a.query('SELECT * FROM probe ORDER BY id')).rows, seen);
    await a.query('ROLLBACK');
    assert.deepEqual((await b.query('SELECT * FROM probe ORDER BY id')).rows, seen);
    const result = {
      status: 'PASS',
      at: new Date().toISOString(),
      cluster: descriptor.cluster,
      database: url.pathname.slice(1),
      checks: [
        'A writer committed after BEGIN but before first lock is visible in the SERIALIZABLE snapshot',
        'Changed current data differs from the stale preflight',
        'A writer after lock acquisition is blocked and adds no row effects',
        'Both connections target the isolated cluster and only two synthetic integer rows',
      ],
      ownerWrites: 'NOT_APPLIED',
      targetData: 'Synthetic empty-database probe only; no full-state project-copy rows changed',
    };
    writeFileSync(process.env.TASK69_EVIDENCE_OUTPUT, JSON.stringify(result, null, 2) + '\n', {
      flag: 'wx',
    });
    console.log(JSON.stringify(result));
  } finally {
    await a.query('ROLLBACK');
    await a.end();
    await b.end();
  }
}
main().catch((e: unknown) => {
  console.error(
    (e instanceof Error ? e.message : String(e)).replace(
      /postgres(?:ql)?:\/\/[^\s]+/gu,
      '[redacted]',
    ),
  );
  process.exitCode = 1;
});
