import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { topClientRowsQuery, topClientPopulationQuery } from '../src/lib/top-clients-query';
import { lawyerWorkloadQuery, lawyerPopulationQuery } from '../src/lib/lawyer-workload-query';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';

/** Semantic SQL unit fixtures. Only explicit table qualifiers change to new
 * session-local tables; real public-schema service/auth tests run separately.
 * No public trigger/grant/constraint is removed or bypassed. */
async function main() {
  const out = process.env['TASK51_OUTPUT'],
    priv = process.env['TASK51_PRIVATE'];
  assert.ok(out && priv);
  const f = JSON.parse(readFileSync(`${priv}/fixture.json`, 'utf8'));
  await withApprovedMigrationClient(
    async (db) => {
      await assertIsolatedTestCluster(db, new URL(f.migrationUrl), f.environment);
      await db.query(`CREATE TEMP TABLE clients(id integer PRIMARY KEY,name_ar text,is_archived boolean,status text);
       CREATE TEMP TABLE matters(id integer PRIMARY KEY,status text,is_archived boolean,client_id integer);
   CREATE TEMP TABLE people(id integer PRIMARY KEY,name_ar text,is_staff boolean,is_active boolean);
   CREATE TEMP TABLE matter_lawyers(matter_id integer REFERENCES pg_temp.matters(id),person_id integer REFERENCES pg_temp.people(id),role text CHECK(role IN('lead','co_lead','support')),is_retired boolean,PRIMARY KEY(matter_id,person_id));`);
      const bindings: unknown[] = [];
      const run = async (q: ReturnType<typeof lawyerWorkloadQuery>) => {
        let text = q.text;
        for (const name of ['matters', 'matter_lawyers', 'people', 'clients'])
          text = text.replaceAll(`public.${name}`, `pg_temp.${name}`);
        assert.ok(!text.includes('public.'));
        bindings.push({ original: q.text, fixtureSql: text, values: q.values });
        return (await db.query(text, q.values)).rows;
      };
      assert.deepEqual(await run(lawyerWorkloadQuery()), []);
      assert.deepEqual(await run(lawyerPopulationQuery()), [{ total: 0, unassigned: 0 }]);
      await db.query(`INSERT INTO pg_temp.matters VALUES(1,'سارية',false,1),(2,'سارية',true,1),(3,'منتهية',false,1),(4,NULL,false,NULL),(5,'سارية',false,NULL);
   INSERT INTO pg_temp.people VALUES(10,'TEST ONLY SAME NAME',true,true),(11,'TEST ONLY SAME NAME',false,false),(12,'TEST ONLY RETIRED',true,true);
   INSERT INTO pg_temp.matter_lawyers VALUES(1,10,'lead',false),(2,10,'support',false),(1,11,'co_lead',false),(2,11,'support',false),(3,10,'lead',false),(4,10,'lead',false),(5,12,'lead',true);`);
      const expected = [
        {
          id: 10,
          name: 'TEST ONLY SAME NAME',
          staff: true,
          active: true,
          lead: 1,
          coLead: 0,
          support: 1,
          total: 2,
        },
        {
          id: 11,
          name: 'TEST ONLY SAME NAME',
          staff: false,
          active: false,
          lead: 0,
          coLead: 1,
          support: 1,
          total: 2,
        },
      ];
      assert.deepEqual(await run(lawyerWorkloadQuery()), expected);
      assert.deepEqual(await run(lawyerPopulationQuery()), [{ total: 3, unassigned: 1 }]);
      await db.query('DELETE FROM pg_temp.matter_lawyers WHERE person_id=10');
      assert.deepEqual(await run(lawyerWorkloadQuery()), [expected[1]]);
      const rankingCases = [
        { scores: [], ids: [], ranks: [] },
        { scores: [9], ids: [1], ranks: [1] },
        { scores: [9, 8, 7, 6], ids: [1, 2, 3, 4], ranks: [1, 2, 3, 4] },
        { scores: [9, 8, 7, 6, 5], ids: [1, 2, 3, 4, 5], ranks: [1, 2, 3, 4, 5] },
        { scores: [9, 8, 7, 6, 5, 5], ids: [1, 2, 3, 4, 5, 6], ranks: [1, 2, 3, 4, 5, 5] },
        { scores: [9, 8, 7, 6, 5, 4], ids: [1, 2, 3, 4, 5], ranks: [1, 2, 3, 4, 5] },
        { scores: [2, 2, 2, 2, 2, 2], ids: [1, 2, 3, 4, 5, 6], ranks: [1, 1, 1, 1, 1, 1] },
      ];
      for (const test of rankingCases) {
        // These exact pg_temp tables contain only rows created above in this session.
        await db.query('TRUNCATE pg_temp.matter_lawyers,pg_temp.matters,pg_temp.clients');
        let id = 1;
        for (let c = 0; c < test.scores.length; c++) {
          await db.query('INSERT INTO pg_temp.clients VALUES($1,$2,$3,$4)', [
            c + 1,
            'TEST ONLY SAME CLIENT',
            c === 0,
            c === 1 ? 'Disabled' : 'Active',
          ]);
          for (let i = 0; i < test.scores[c]!; i++)
            await db.query('INSERT INTO pg_temp.matters VALUES($1,$2,$3,$4)', [
              id++,
              'سارية',
              i % 2 === 0,
              c + 1,
            ]);
        }
        await db.query(
          "INSERT INTO pg_temp.matters VALUES(9999,'سارية',true,NULL),(9998,'منتهية',false,NULL),(9997,NULL,false,NULL)",
        );
        const actual = await run(topClientRowsQuery());
        assert.deepEqual(
          actual.map((r) => r.id),
          test.ids,
        );
        assert.deepEqual(
          actual.map((r) => r.rank),
          test.ranks,
        );
        assert.deepEqual(
          actual.map((r) => r.total),
          test.ids.map((id) => test.scores[id - 1]),
        );
        assert.deepEqual(await run(topClientPopulationQuery()), [
          {
            total: 1 + test.scores.reduce((a, b) => a + b, 0),
            unassigned: 1,
            clients: test.scores.length,
          },
        ]);
      }
      writeFileSync(
        `${out}/sql-fixtures.json`,
        JSON.stringify(
          {
            status: 'PASS',
            cluster: f.clusterId,
            mode: 'Session-local semantic SQL fixtures; qualifier-only binding; full public-schema service tests recorded separately',
            workloadCases: [
              'empty',
              'one group',
              'three roles',
              'shared matter overlap',
              'retired excluded',
              'inactive external retained',
              'same name distinct IDs',
              'archived matter included',
              'closed and NULL status excluded',
              'unassigned reconciliation',
            ],
            rankingCases,
            expected,
            bindings,
          },
          null,
          2,
        ),
      );
      console.log(
        'PASS workload semantic SQL edge fixtures; public database definitions unchanged',
      );
    },
    { databaseUrl: f.migrationUrl },
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'SQL edge fixtures failed');
  process.exitCode = 1;
});
