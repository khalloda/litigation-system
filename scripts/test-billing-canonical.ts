import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedPostgres } from './lib/isolated-postgres-fixture';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { prepareHearingLifecycleActors } from './lib/hearing-lifecycle-actors';
import { createDatabaseClient } from '../src/lib/db';

async function main() {
  const output = resolve(
    process.env.TASK48_TEST_OUTPUT ?? 'test-results/task48-canonical-' + Date.now(),
  );
  mkdirSync(output, { recursive: true });
  await withIsolatedPostgres(async (initial) => {
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
      const result = spawnSync(process.execPath, [...args], {
        env: fixture.environment,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 64000000,
      });
      writeFileSync(
        resolve(output, name + '.log'),
        (result.stdout + result.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
      );
      assert.equal(result.status, 0, name + '; see retained log');
      console.log('PASS canonical ' + name);
    }
  });
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
