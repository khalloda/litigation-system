import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { openDecisionCountQuery, openDecisionRowsQuery } from '../src/lib/open-decisions-query';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';

/** Literal semantic cases in new session-local tables. This complements, rather
 * than replaces, the public-schema service/auth and full-volume tests. */
async function main() {
  const out = process.env['TASK51_OUTPUT'],
    priv = process.env['TASK51_PRIVATE'];
  assert.ok(out && priv);
  const fixture = JSON.parse(readFileSync(`${priv}/fixture.json`, 'utf8'));
  await withApprovedMigrationClient(
    async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      await db.query(`CREATE TEMP TABLE clients(id integer PRIMARY KEY,name_ar text,is_archived boolean);
      CREATE TEMP TABLE matters(id integer PRIMARY KEY,status text,is_archived boolean,client_id integer,case_number_ar text,subject text);
      CREATE TEMP TABLE lookup_court(id integer PRIMARY KEY,label_ar text);
      CREATE TEMP TABLE lookup_hearing_action(id integer PRIMARY KEY,label_ar text);
      CREATE TEMP TABLE hearings(id integer PRIMARY KEY,legacy_id integer,matter_id integer,report boolean,is_archived boolean,hearing_date date,next_hearing_date date,court_id integer,circuit text,action_id integer,decision text,short_decision text);`);
      const bindings: unknown[] = [];
      const run = async (q: ReturnType<typeof openDecisionRowsQuery>) => {
        let sql = q.text;
        for (const name of [
          'hearings',
          'matters',
          'clients',
          'lookup_court',
          'lookup_hearing_action',
        ])
          sql = sql.replaceAll(`public.${name}`, `pg_temp.${name}`);
        assert.ok(!sql.includes('public.'));
        bindings.push({ original: q.text, fixtureSql: sql, values: q.values });
        return (await db.query(sql, q.values)).rows;
      };
      const before = '2026-09-22';
      assert.deepEqual(await run(openDecisionCountQuery(before)), [{ total: 0 }]);
      assert.deepEqual(await run(openDecisionRowsQuery(before)), []);
      await db.query(`INSERT INTO pg_temp.clients VALUES(1,'TEST ONLY ARCHIVED CLIENT',true);
      INSERT INTO pg_temp.matters VALUES
      (1,'سارية',true,1,'TEST ONLY 1','TEST ONLY'),
      (2,'سارية',false,NULL,NULL,NULL),
      (3,'منتهية',false,1,NULL,NULL),
      (4,NULL,false,1,NULL,NULL);`);
      const cases = [
        {
          id: 1,
          matter: 1,
          report: true,
          archived: false,
          next: '2026-09-21',
          include: true,
          reason: 'archived parents retained',
        },
        {
          id: 2,
          matter: 1,
          report: true,
          archived: false,
          next: '2026-09-20',
          include: true,
          reason: 'multiple hearings on one matter',
        },
        {
          id: 3,
          matter: 2,
          report: true,
          archived: false,
          next: '2026-09-20',
          include: true,
          reason: 'missing client and legal text retained',
        },
        {
          id: 4,
          matter: 1,
          report: false,
          archived: false,
          next: '2026-09-20',
          include: false,
          reason: 'false report excluded',
        },
        {
          id: 5,
          matter: 1,
          report: null,
          archived: false,
          next: '2026-09-20',
          include: false,
          reason: 'NULL report excluded',
        },
        {
          id: 6,
          matter: 1,
          report: true,
          archived: false,
          next: '2026-09-22',
          include: false,
          reason: 'today excluded',
        },
        {
          id: 7,
          matter: 1,
          report: true,
          archived: false,
          next: '2026-09-23',
          include: false,
          reason: 'future excluded',
        },
        {
          id: 8,
          matter: 1,
          report: true,
          archived: false,
          next: null,
          include: false,
          reason: 'NULL next date excluded',
        },
        {
          id: 9,
          matter: 3,
          report: true,
          archived: false,
          next: '2026-09-20',
          include: false,
          reason: 'closed matter excluded',
        },
        {
          id: 10,
          matter: 4,
          report: true,
          archived: false,
          next: '2026-09-20',
          include: false,
          reason: 'NULL status excluded',
        },
        {
          id: 11,
          matter: null,
          report: true,
          archived: false,
          next: '2026-09-20',
          include: false,
          reason: 'missing matter cannot be active',
        },
        {
          id: 12,
          matter: 1,
          report: true,
          archived: true,
          next: '2026-09-20',
          include: false,
          reason: 'archived subject excluded',
        },
      ];
      for (const row of cases)
        await db.query(
          `INSERT INTO pg_temp.hearings VALUES($1,NULL,$2,$3,$4,NULL,$5,NULL,NULL,NULL,$6,$7)`,
          [
            row.id,
            row.matter,
            row.report,
            row.archived,
            row.next,
            'TEST ONLY DECISION\nSECOND LINE',
            'TEST ONLY SHORT',
          ],
        );
      const rows = await run(openDecisionRowsQuery(before));
      assert.deepEqual(
        rows.map((row) => row.id),
        [2, 3, 1],
      );
      assert.deepEqual(await run(openDecisionCountQuery(before)), [{ total: 3 }]);
      assert.equal(rows[0]!.matterArchived, true);
      assert.equal(rows[0]!.clientArchived, true);
      assert.equal(rows[1]!.clientId, null);
      assert.equal(rows[1]!.caseNumber, null);
      assert.equal(rows[0]!.decision, 'TEST ONLY DECISION\nSECOND LINE');
      assert.equal(rows[0]!.shortDecision, 'TEST ONLY SHORT');
      assert.ok(rows.every((row) => row.hearingDate === null));
      writeFileSync(
        `${out}/open-sql-fixtures.json`,
        JSON.stringify(
          {
            status: 'PASS',
            cluster: fixture.clusterId,
            mode: 'Session-local SQL semantic cases; only table qualifiers rebound. No public schema/data changes.',
            before,
            cases,
            expectedIds: [2, 3, 1],
            rows,
            bindings,
          },
          null,
          2,
        ),
      );
      console.log(
        'PASS 12 literal open-decision SQL cases plus empty, exact order, missing-reference and multiline projections',
      );
    },
    { databaseUrl: fixture.migrationUrl },
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Open SQL fixtures failed');
  process.exitCode = 1;
});
