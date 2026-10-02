import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Session } from 'next-auth';
import { createDatabaseClient } from '../src/lib/db';
import { createReportEngine } from '../src/lib/reports/engine';
import { reportDefinitions } from '../src/lib/reports/registry';
import { REPORT_CATEGORIES, categorizeReports } from '../src/lib/reports/catalog';
import { reportSearchText } from '../src/lib/reports/search';
import { AuthorizationError } from '../src/lib/auth/authorization-core';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import type { ReportDefinition } from '../src/lib/reports/types';

async function main() {
  const output = process.argv[2]!;
  assert(output);
  const fixture = JSON.parse(readFileSync(`${output}/private/fixture.json`, 'utf8'));
  const sessions: Session[] = JSON.parse(
    readFileSync(`${output}/private/genuine-sessions.json`, 'utf8'),
  );
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment),
    { databaseUrl: fixture.migrationUrl },
  );
  const runtime = createDatabaseClient(fixture.runtimeUrl);
  const audit = () =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        await db.query('BEGIN READ ONLY');
        try {
          return (
            await db.query(
              'SELECT id::text, md5(to_jsonb(a)::text) hash FROM audit_events a ORDER BY id',
            )
          ).rows;
        } finally {
          await db.query('ROLLBACK');
        }
      },
      { databaseUrl: fixture.migrationUrl },
    );
  const results: unknown[] = [];
  let calls = 0;
  const guarded: ReportDefinition = {
    descriptor: {
      id: 'catalog-restricted-probe',
      version: '1',
      title: 'restricted probe',
      description: 'must not leak',
      parameters: {},
      columns: [{ key: 'value', label: 'value', width: 20 }],
      layout: 'flat',
      clientFacing: false,
      permissions: [{ area: 'usersAndRoles', action: 'manage' }],
    },
    query: async () => {
      calls++;
      return { subtitle: '', sections: [], totals: [] };
    },
  };
  try {
    const before = await audit();
    const engine = createReportEngine(reportDefinitions, runtime);
    const restricted = createReportEngine([guarded], runtime);
    const expected = reportDefinitions.map((d) => d.descriptor.id).sort();
    assert.deepEqual(Object.values(REPORT_CATEGORIES).flat().sort(), expected);
    for (const session of sessions) {
      const catalog = await engine.catalog(session);
      assert.deepEqual(catalog.map((d) => d.id).sort(), expected);
      for (const client of [null, 245]) {
        const grouped = categorizeReports(catalog, client);
        assert.equal(grouped.length, 7);
        assert.deepEqual(grouped.flatMap((g) => g.reports.map((r) => r.id)).sort(), expected);
        for (const report of grouped.flatMap((g) => g.reports)) {
          const descriptor = catalog.find((d) => d.id === report.id)!;
          assert.equal(
            report.href,
            `/reports/${report.id}${client && descriptor.parameters.client ? `?client=${client}` : ''}`,
          );
          assert.equal(report.title, descriptor.title);
        }
      }
      const allowed = session.user.role === 'Administrator';
      const visible = await restricted.catalog(session);
      assert.equal(visible.length, allowed ? 1 : 0);
      if (!allowed) {
        assert.deepEqual(categorizeReports(visible, null), []);
        await assert.rejects(
          restricted.describe(session, guarded.descriptor.id),
          AuthorizationError,
        );
        const response = await restricted.handle(
          session,
          new Request('http://127.0.0.1/reports/catalog-restricted-probe/run', {
            method: 'POST',
            headers: { origin: 'http://127.0.0.1' },
            body: new URLSearchParams({ format: 'preview' }),
          }),
          guarded.descriptor.id,
          'run',
        );
        assert.equal(response.status, 403);
      }
      results.push({
        role: session.user.role,
        productionCount: catalog.length,
        restrictedMetadataVisible: allowed,
      });
    }
    assert.equal(calls, 0);
    await assert.rejects(engine.catalog(null), AuthorizationError);
    await assert.rejects(
      engine.catalog({ ...sessions[0]!, expires: '2000-01-01T00:00:00Z' }),
      AuthorizationError,
    );
    assert.deepEqual(categorizeReports([], null), []);
    const subset = reportDefinitions
      .filter((d) => ['client-status', 'matter-closed'].includes(d.descriptor.id))
      .map((d) => d.descriptor);
    assert.deepEqual(
      categorizeReports(subset, 245).map((g) => ({
        id: g.id,
        count: g.reports.length,
        tools: g.tools.length,
      })),
      [
        { id: 'clients', count: 1, tools: 1 },
        { id: 'matters', count: 1, tools: 1 },
      ],
    );
    assert.throws(() => categorizeReports([guarded.descriptor], null), /coverage/);
    assert.equal(reportSearchText('أَحــكام ١٤٠'), reportSearchText('احكام140'));
    assert.notEqual(reportSearchText('JTI'), reportSearchText('قTI'));
    const after = await audit();
    assert.deepEqual(after, before);
    writeFileSync(
      `${output}/${process.argv[3] ?? 'catalog-service.json'}`,
      JSON.stringify(
        {
          status: 'PASS',
          at: new Date().toISOString(),
          results,
          queryCalls: calls,
          auditUnchanged: true,
          emptyAndSubsetCoverage: true,
        },
        null,
        2,
      ),
      { flag: 'wx' },
    );
    console.log(
      'PASS catalog authorization, coverage, client links, empty/restricted catalogs and no generation',
    );
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
