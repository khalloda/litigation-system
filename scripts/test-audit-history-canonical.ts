import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedPostgres } from './lib/isolated-postgres-fixture';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { prepareHearingLifecycleActors } from './lib/hearing-lifecycle-actors';
import { createDatabaseClient } from '../src/lib/db';
import { withApprovedMigrationClient } from './lib/migration-principal';
async function main() {
  const output = resolve(
    process.env['TASK49_TEST_OUTPUT'] ?? 'test-results/task49-canonical-' + Date.now(),
  );
  mkdirSync(output, { recursive: true });
  copyFileSync(process.argv[1]!, resolve(output, 'executed-canonical.ts'));
  await withIsolatedPostgres(async (initial) => {
    // Retain the established exact checkpoint identity/profile, not a downgraded
    // current database. This database is newly created in the isolated cluster.
    const migrationUrl = await initial.createDatabase('litigation_task4647_canonical_prestate');
    const runtimeUrl = new URL(initial.runtimeUrl);
    runtimeUrl.pathname = new URL(migrationUrl).pathname;
    const fixture = {
      ...initial,
      migrationUrl,
      runtimeUrl: runtimeUrl.toString(),
      environment: {
        ...initial.environment,
        MIGRATION_DATABASE_URL: migrationUrl,
        DATABASE_URL: runtimeUrl.toString(),
      },
    };
    Object.assign(process.env, fixture.environment);
    writeFileSync(
      resolve(output, 'isolation.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          container: fixture.container,
          cluster: fixture.clusterId,
          sourceCluster: fixture.sourceClusterId,
          port: runtimeUrl.port,
          image: fixture.imageId,
        },
        null,
        2,
      ),
    );
    await migrateFixtureThroughCheckpoint(migrationUrl, 70, fixture.environment);
    const runtime = createDatabaseClient(fixture.runtimeUrl);
    try {
      await prepareHearingLifecycleActors(fixture, runtime, true);
    } finally {
      await runtime.$disconnect();
    }
    for (const [name, args] of [
      ['deploy', ['--import', 'tsx', 'scripts/run-prisma-migration.ts', 'deploy']],
      ['checks', ['--import', 'tsx', 'scripts/check-db.ts', '--profile=canonical-clean-replay']],
    ] as const) {
      const start = new Date().toISOString();
      const r = spawnSync(process.execPath, [...args], {
        env: fixture.environment,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 128 * 1024 * 1024,
      });
      writeFileSync(
        resolve(output, name + '.log'),
        (r.stdout + r.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[private fixture URL]'),
      );
      writeFileSync(
        resolve(output, name + '.json'),
        JSON.stringify({ start, end: new Date().toISOString(), args, exit: r.status }),
      );
      if (r.status !== 0)
        await withApprovedMigrationClient(
          async (db) => {
            const ledger = (
              await db.query(
                'SELECT migration_name,finished_at,rolled_back_at,logs FROM _prisma_migrations ORDER BY started_at DESC LIMIT 3',
              )
            ).rows;
            const identities = (
              await db.query(
                'SELECT u.id,u.username,u.person_id,u.role_code,p.name_en,a.id actor_id,a.actor_key FROM user_accounts u JOIN people p ON p.id=u.person_id JOIN audit_actors a ON a.user_account_id=u.id ORDER BY u.id',
              )
            ).rows;
            writeFileSync(
              resolve(output, name + '-failure-observation.json'),
              JSON.stringify({ ledger, identities }, null, 2),
            );
          },
          { databaseUrl: migrationUrl },
        );
      assert.equal(r.status, 0, name + ' failed; retained log');
    }
  });
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'failed');
  process.exitCode = 1;
});
