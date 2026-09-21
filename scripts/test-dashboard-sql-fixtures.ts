import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
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
      await db.query(`CREATE TEMP TABLE matters(id integer PRIMARY KEY,status text,is_archived boolean,client_id integer);
   CREATE TEMP TABLE people(id integer PRIMARY KEY,name_ar text,is_staff boolean,is_active boolean);
   CREATE TEMP TABLE matter_lawyers(matter_id integer REFERENCES pg_temp.matters(id),person_id integer REFERENCES pg_temp.people(id),role text CHECK(role IN('lead','co_lead','support')),is_retired boolean,PRIMARY KEY(matter_id,person_id));`);
      const bindings: unknown[] = [];
      const run = async (q: ReturnType<typeof lawyerWorkloadQuery>) => {
        let text = q.text;
        for (const name of ['matters', 'matter_lawyers', 'people'])
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
