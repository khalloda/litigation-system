import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDatabaseClient } from '../src/lib/db';
import {
  readCurrentOutcomes,
  readFiveYearOutcomes,
  currentOutcomeWindow,
  fiveYearOutcomeWindow,
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
        const annualExpected = Array.from({ length: 5 }, (_, i) => {
          const period = String(year - 4 + i),
            annualRows = baseline.filter((h) => h.date?.startsWith(period + '-'));
          return {
            period,
            favour: annualRows.filter((h) => h.outcome === 'صالح').length,
            against: annualRows.filter((h) => h.outcome === 'ضد').length,
            missing: annualRows.filter((h) => h.outcome === null).length,
            empty: annualRows.filter((h) => h.outcome !== null && /^ *$/.test(h.outcome)).length,
            other: annualRows.filter(
              (h) =>
                h.outcome !== null &&
                !/^ *$/.test(h.outcome) &&
                !['صالح', 'ضد'].includes(h.outcome),
            ).length,
            total: annualRows.length,
          };
        });
        let annualClockCalls = 0;
        const annual = await readFiveYearOutcomes(session, runtime, () => {
          annualClockCalls++;
          return new Date(instant);
        });
        assert.equal(annualClockCalls, 1);
        assert.deepEqual(annual.window, {
          anchor: date,
          start: `${year - 4}-01-01`,
          end: `${year + 1}-01-01`,
          periods: annualExpected.map((r) => r.period),
          granularity: 'year',
        });
        assert.deepEqual(annual.rows, annualExpected);
        const annualInside = annualExpected.reduce((sum, row) => sum + row.total, 0);
        assert.deepEqual(annual.coverage, {
          total: baseline.length,
          inside: annualInside,
          undated,
          outside: baseline.length - annualInside - undated,
        });
        assert.equal(
          annual.sums.favour,
          annualExpected.reduce((sum, row) => sum + row.favour, 0),
        );
        assert.equal(
          annual.sums.against,
          annualExpected.reduce((sum, row) => sum + row.against, 0),
        );
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
        // All rows in this session-local table were created above by this test.
        await db.query('TRUNCATE pg_temp.hearings');
        await db.query(`INSERT INTO pg_temp.hearings VALUES
          (1,'2021-12-31','صالح',1,false),(2,'2022-01-01','صالح',1,true),
          (3,'2022-01-01','صالح',1,false),(4,'2024-02-29','ضد',NULL,true),
          (5,'2026-12-31','ضد',NULL,false),(6,'2027-01-01','صالح',NULL,false),
          (7,NULL,'ضد',NULL,false),(8,'2025-01-01',NULL,NULL,false),
          (9,'2025-01-01','',NULL,false),(10,'2025-01-01',' ',NULL,false),
          (11,'2025-01-01','TEST ONLY OTHER',NULL,false)`);
        const annualWindow = fiveYearOutcomeWindow(new Date('2026-12-31T21:59:59Z'));
        assert.deepEqual(annualWindow, {
          anchor: '2026-12-31',
          start: '2022-01-01',
          end: '2027-01-01',
          periods: ['2022', '2023', '2024', '2025', '2026'],
          granularity: 'year',
        });
        const annualExpected = [
          { period: '2022', favour: 2, against: 0, missing: 0, empty: 0, other: 0, total: 2 },
          { period: '2024', favour: 0, against: 1, missing: 0, empty: 0, other: 0, total: 1 },
          { period: '2025', favour: 0, against: 0, missing: 1, empty: 2, other: 1, total: 4 },
          { period: '2026', favour: 0, against: 1, missing: 0, empty: 0, other: 0, total: 1 },
        ];
        assert.deepEqual(await run(outcomeBucketsQuery(annualWindow)), annualExpected);
        assert.deepEqual(await run(outcomeCoverageQuery(annualWindow)), [
          { total: 11, inside: 8, outside: 2, undated: 1 },
        ]);
        const rolloverWindow = fiveYearOutcomeWindow(new Date('2026-12-31T22:00:00Z'));
        assert.deepEqual(rolloverWindow, {
          anchor: '2027-01-01',
          start: '2023-01-01',
          end: '2028-01-01',
          periods: ['2023', '2024', '2025', '2026', '2027'],
          granularity: 'year',
        });
        assert.deepEqual(await run(outcomeBucketsQuery(rolloverWindow)), [
          ...annualExpected.slice(1),
          { period: '2027', favour: 1, against: 0, missing: 0, empty: 0, other: 0, total: 1 },
        ]);
        assert.deepEqual(await run(outcomeCoverageQuery(rolloverWindow)), [
          { total: 11, inside: 7, outside: 3, undated: 1 },
        ]);
        await db.query('DELETE FROM pg_temp.hearings WHERE id<>2');
        assert.deepEqual(await run(outcomeBucketsQuery(annualWindow)), [
          { period: '2022', favour: 1, against: 0, missing: 0, empty: 0, other: 0, total: 1 },
        ]);
        assert.deepEqual(await run(outcomeBucketsQuery(rolloverWindow)), []);
        return {
          expected,
          annualExpected,
          annualWindow,
          rolloverWindow,
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
            outcomeBucketsQuery(fiveYearOutcomeWindow(new Date('2026-09-22T12:00:00Z'))),
            outcomeCoverageQuery(fiveYearOutcomeWindow(new Date('2026-09-22T12:00:00Z'))),
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
          view: 'current-year and owner-approved current Cairo year plus four preceding calendar years',
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
      'PASS both outcome views: full-volume, literal boundaries, five annual buckets and Cairo rollover for all roles',
    );
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Outcome tests failed');
  process.exitCode = 1;
});
