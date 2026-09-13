import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { clientLogoFixtureState } from './lib/client-logo-fixture-state';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { initialiseActors } from './test-client-contacts';

async function main() {
  const output = process.env.HEARING_EVIDENCE_DIR;
  assert.ok(output && resolve(output) !== process.cwd());
  mkdirSync(output, { recursive: true });
  const source = await withApprovedMigrationClient(
    async (db) => ({
      state: await staffReadOnlyState(db),
      portable: await clientLogoFixtureState(db),
    }),
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  assert.deepEqual(
    source.state.tables,
    JSON.parse(readFileSync(process.env.HEARING_SOURCE_BASELINE!, 'utf8')).tables,
  );
  await withIsolatedPostgres(async (fixture) => {
    await fixture.restoreProject();
    await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        assert.deepEqual((await staffReadOnlyState(db)).tables, source.state.tables);
        assert.deepEqual(await clientLogoFixtureState(db), source.portable);
      },
      {
        databaseUrl: fixture.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
    await migrateFixtureThroughCheckpoint(fixture.migrationUrl, 64, fixture.environment);
    const migration = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', 'deploy'],
      {
        env: fixture.environment,
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 32000000,
      },
    );
    writeFileSync(
      join(output, 'deploy65.log'),
      (migration.stdout + migration.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
    );
    assert.equal(migration.status, 0);
    await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
    const migrationUrl = await fixture.createDatabase('litigation_task43_empty');
    const runtimeUrl = new URL(fixture.runtimeUrl);
    runtimeUrl.pathname = '/litigation_task43_empty';
    const empty = {
      ...fixture,
      migrationUrl,
      runtimeUrl: runtimeUrl.toString(),
      environment: {
        ...fixture.environment,
        DATABASE_URL: runtimeUrl.toString(),
        MIGRATION_DATABASE_URL: migrationUrl,
      },
    };
    await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(migrationUrl), empty.environment);
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')",
            )
          ).rows[0].n,
          0,
        );
      },
      { databaseUrl: migrationUrl },
    );
    const docker = (args: string[], input?: Buffer) => {
      const result = spawnSync(
        'docker',
        ['exec', ...(input ? ['-i'] : []), fixture.container, ...args],
        {
          input,
          windowsHide: true,
          maxBuffer: 128 * 1024 * 1024,
        },
      );
      // Never echo dumps, authentication hashes, or subprocess arguments/errors.
      assert.equal(result.status, 0, 'Owned empty-fixture schema/data subprocess failed');
      return result.stdout;
    };
    const supportingTables = [
      'public.people',
      'public.lookup_team',
      'public.user_accounts',
      'public.audit_actors',
      'public.audit_event_table_rules',
      'public.audit_event_fields',
      '_migration.staff_roster_mutex',
      '_migration.matter_lifecycle_audit_counter',
    ];
    let schema = docker([
      'pg_dump',
      '-U',
      'litigation',
      '-d',
      'litigation',
      '--format=custom',
      '--schema-only',
    ]);
    let support = docker([
      'pg_dump',
      '-U',
      'litigation',
      '-d',
      'litigation',
      '--format=custom',
      '--data-only',
      ...supportingTables.flatMap((table) => ['--table=' + table]),
    ]);
    try {
      docker(
        [
          'pg_restore',
          '-U',
          'litigation',
          '-d',
          'litigation_task43_empty',
          '--exit-on-error',
          '--section=pre-data',
        ],
        schema,
      );
      docker(
        [
          'pg_restore',
          '-U',
          'litigation',
          '-d',
          'litigation_task43_empty',
          '--exit-on-error',
          '--section=data',
        ],
        support,
      );
      docker(
        [
          'pg_restore',
          '-U',
          'litigation',
          '-d',
          'litigation_task43_empty',
          '--exit-on-error',
          '--section=post-data',
        ],
        schema,
      );
    } finally {
      schema.fill(0);
      support.fill(0);
      schema = Buffer.alloc(0);
      support = Buffer.alloc(0);
    }
    await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(migrationUrl), empty.environment);
        assert.deepEqual(
          (
            await db.query(
              'SELECT (SELECT count(*)::int FROM hearings) hearings,(SELECT count(*)::int FROM hearing_attendees) attendees,(SELECT count(*)::int FROM matters) matters,(SELECT count(*)::int FROM clients) clients',
            )
          ).rows[0],
          { hearings: 0, attendees: 0, matters: 0, clients: 0 },
        );
      },
      { databaseUrl: migrationUrl },
    );
    writeFileSync(
      join(output, 'empty-fixture.json'),
      JSON.stringify(
        {
          container: fixture.container,
          cluster: fixture.clusterId,
          sourceExcluded: fixture.sourceClusterId,
          database: 'litigation_task43_empty',
          schemaCheckpoint: 65,
          supportingTables,
          hearings: 0,
          attendees: 0,
          matters: 0,
          clients: 0,
          deletedRows: 0,
          purpose:
            'Synthetic sparse read/browser fixture, not a reconciled migrated dataset; complete invariants run on the full-volume candidate separately.',
        },
        null,
        2,
      ),
    );
    await initialiseActors(empty.migrationUrl, empty.runtimeUrl);
    const { proveHearingBrowser } = await import('./test-hearing-browser.mjs');
    const { emptyHearingBrowserProof } = await import('./lib/hearing-empty-browser-proof.mjs');
    await proveHearingBrowser(empty, output, emptyHearingBrowserProof);
  });
  assert.deepEqual(
    await withApprovedMigrationClient(staffReadOnlyState, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    }),
    source.state,
  );
  writeFileSync(
    join(output, 'cleanup.json'),
    JSON.stringify({ ownedClusterVolumeNetworkRemoved: true, sourceExact: true }, null, 2),
  );
}
void main().catch((error) => {
  console.error(
    (error instanceof Error
      ? (error.stack ?? error.message)
      : 'Empty fixture proof failed'
    ).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
  );
  process.exitCode = 1;
});
