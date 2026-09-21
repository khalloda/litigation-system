import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDatabaseClient } from '../src/lib/db';
import {
  readCurrentOutcomes,
  currentOutcomeWindow,
  outcomeBucketsQuery,
  outcomeCoverageQuery,
} from '../src/lib/outcome-query';
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
    const baseline = await withApprovedMigrationClient(
      async (db) =>
        (await db.query('SELECT id,hearing_date::text date,outcome FROM hearings')).rows,
      {
        databaseUrl: f.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
    const sessions = await lifecycleSessions(runtime);
    assert.equal(sessions.length, 4);
    const dates = [
      ['2026-12-31T21:59:59Z', '2026-12-31', 2026],
      ['2026-12-31T22:00:00Z', '2027-01-01', 2027],
      ['2024-02-28T22:00:00Z', '2024-02-29', 2024],
      ['2026-04-23T21:59:59Z', '2026-04-23', 2026],
      ['2026-04-23T22:00:00Z', '2026-04-24', 2026],
      ['2026-09-21T20:59:59Z', '2026-09-21', 2026],
      ['2026-09-21T21:00:00Z', '2026-09-22', 2026],
      ['2010-06-01T12:00:00Z', '2010-06-01', 2010],
    ] as const;
    const results = [];
    for (const [instant, date, year] of dates) {
      const expectedRows = Array.from({ length: 12 }, (_, i) => {
        const period = `${year}-${String(i + 1).padStart(2, '0')}`,
          rows = baseline.filter((h) => h.date?.startsWith(period + '-'));
        return {
          period,
          favour: rows.filter((h) => h.outcome === 'صالح').length,
          against: rows.filter((h) => h.outcome === 'ضد').length,
          missing: rows.filter((h) => h.outcome === null).length,
          empty: rows.filter((h) => h.outcome !== null && /^ *$/.test(h.outcome)).length,
          other: rows.filter(
            (h) =>
              h.outcome !== null && !/^ *$/.test(h.outcome) && !['صالح', 'ضد'].includes(h.outcome),
          ).length,
          total: rows.length,
        };
      });
      const inside = baseline.filter((h) => h.date?.startsWith(year + '-')).length,
        undated = baseline.filter((h) => h.date === null).length;
      for (const session of sessions) {
        let calls = 0;
        const view = await readCurrentOutcomes(session, runtime, () => {
          calls++;
          return new Date(instant);
        });
        assert.equal(calls, 1);
        assert.equal(view.window.anchor, date);
        assert.equal(view.window.start, `${year}-01-01`);
        assert.equal(view.window.end, `${year + 1}-01-01`);
        assert.deepEqual(view.rows, expectedRows);
        assert.deepEqual(view.coverage, {
          total: baseline.length,
          inside,
          undated,
          outside: baseline.length - inside - undated,
        });
      }
      results.push({ instant, date, year, expectedRows, inside, undated });
    }
    const edge = await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(f.migrationUrl), f.environment);
        await db.query(
          'CREATE TEMP TABLE hearings(id integer PRIMARY KEY,hearing_date date,outcome text,matter_id integer,is_archived boolean)',
        );
        const w = currentOutcomeWindow(new Date('2024-02-29T12:00:00Z'));
        const run = async (q: ReturnType<typeof outcomeBucketsQuery>) =>
          (await db.query(q.text.replaceAll('public.hearings', 'pg_temp.hearings'), q.values)).rows;
        assert.deepEqual(await run(outcomeBucketsQuery(w)), []);
        await db.query(`INSERT INTO pg_temp.hearings VALUES
    (1,'2024-01-01','صالح',1,false),(2,'2024-01-01','صالح',1,true),(3,'2024-01-31','ضد',NULL,true),
    (4,'2024-02-29','ضد',1,false),(5,'2024-12-31','صالح',NULL,false),
    (6,'2023-12-31','صالح',NULL,false),(7,'2025-01-01','ضد',NULL,false),
    (8,NULL,'صالح',NULL,false),(9,'2024-01-01',NULL,NULL,false),(10,'2024-01-01','',NULL,false),
    (11,'2024-01-01',' ',NULL,false),(12,'2024-01-01','TEST ONLY OTHER',NULL,false)`);
        const expected = [
          { period: '2024-01', favour: 2, against: 1, missing: 1, empty: 2, other: 1, total: 7 },
          { period: '2024-02', favour: 0, against: 1, missing: 0, empty: 0, other: 0, total: 1 },
          { period: '2024-12', favour: 1, against: 0, missing: 0, empty: 0, other: 0, total: 1 },
        ];
        assert.deepEqual(await run(outcomeBucketsQuery(w)), expected);
        assert.deepEqual(await run(outcomeCoverageQuery(w)), [
          { total: 12, undated: 1, outside: 2, inside: 9 },
        ]);
        await db.query('DELETE FROM pg_temp.hearings WHERE id<>1');
        assert.deepEqual(await run(outcomeBucketsQuery(w)), [
          { period: '2024-01', favour: 1, against: 0, missing: 0, empty: 0, other: 0, total: 1 },
        ]);
        return {
          expected,
          coverage: { total: 12, undated: 1, outside: 2, inside: 9 },
          mode: 'Session-local semantic SQL unit fixture; only explicit hearing table qualifier rebound; public schema/services independently tested',
        };
      },
      { databaseUrl: f.migrationUrl },
    );
    const plans = await withApprovedMigrationClient(
      async (db) =>
        Promise.all(
          [
            outcomeBucketsQuery(currentOutcomeWindow(new Date('2026-09-22T12:00:00Z'))),
            outcomeCoverageQuery(currentOutcomeWindow(new Date('2026-09-22T12:00:00Z'))),
          ].map(async (q) => ({
            sql: q.text,
            values: q.values,
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
      `${out}/outcome-results.json`,
      JSON.stringify(
        {
          status: 'PASS',
          view: 'current-year only; five-year window decision pending',
          cluster: f.clusterId,
          results,
          edge,
          plans,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS current-year full-volume and literal date/bucket/outcome edge oracles for all roles',
    );
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Outcome tests failed');
  process.exitCode = 1;
});
