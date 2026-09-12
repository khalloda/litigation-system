import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { type IsolatedPostgres, assertIsolatedTestCluster } from './isolated-postgres-fixture';
import { withApprovedMigrationClient } from './migration-principal';
import { migrateFixtureThroughCheckpoint } from './fixture-migration-checkpoint';
import { assertStaffCheckpoint } from './staff-roster-checkpoint';
import { matterEditSql, assertMatterEditBoundary } from './matter-edit-checkpoint';
import { staffReadOnlyState } from './staff-read-only-state';
import { initialiseActors } from '../test-client-contacts';

export async function proveMatterCanonical(fixture: IsolatedPostgres, output: string) {
  const url = await fixture.createDatabase('litigation_task42_canonical_prestate');
  const runtime = new URL(fixture.runtimeUrl);
  runtime.pathname = new URL(url).pathname;
  const environment = {
    ...fixture.environment,
    MIGRATION_DATABASE_URL: url,
    DATABASE_URL: runtime.toString(),
  };
  const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(url), environment);
        return fn(db);
      },
      { databaseUrl: url },
    );
  await migrateFixtureThroughCheckpoint(url, 63, environment);
  await inspect(async (db) => {
    assert.equal(await assertStaffCheckpoint(db, 'canonical-clean-replay'), 63);
    const before = await staffReadOnlyState(db);
    await assert.rejects(
      db.query(
        matterEditSql().replace(
          /COMMIT;\s*$/u,
          () => "DO $$ BEGIN RAISE EXCEPTION 'TEST ONLY late failure'; END $$; COMMIT;",
        ),
      ),
      /TEST ONLY late failure/u,
    );
    await db.query('ROLLBACK');
    assert.deepEqual(await staffReadOnlyState(db), before);
  });
  await migrateFixtureThroughCheckpoint(url, 64, environment);
  writeFileSync(
    join(output, 'canonical-deploy.log'),
    'PASS bounded checkpoint64 deployment through owned fixture gateway\n',
  );
  for (const [label, script, args] of [
    ['canonical-invariants', 'scripts/check-db.ts', ['--profile=canonical-clean-replay']],
  ] as const) {
    if (label === 'canonical-invariants') await initialiseActors(url, runtime.toString());
    const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', script, ...args], {
      env: {
        ...environment,
        PRISMA_SCHEMA_ENGINE_BINARY: resolve(
          'node_modules/@prisma/engines/schema-engine-windows.exe',
        ),
      },
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 32000000,
    });
    writeFileSync(
      join(output, label + '.log'),
      (result.stdout + result.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
    );
    assert.equal(result.status, 0, label + ' failed');
  }
  await inspect(async (db) => {
    assert.equal(await assertStaffCheckpoint(db, 'canonical-clean-replay'), 64);
    await assertMatterEditBoundary(db, 'canonical-clean-replay');
  });
  writeFileSync(
    join(output, 'canonical-results.json'),
    JSON.stringify(
      {
        profile: 'canonical-clean-replay',
        prestate: 63,
        lateFailureExactRollback: true,
        applied: 64,
        invariants: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS canonical clean replay: exact 63, late failure rollback, deployed 64 and standing invariants',
  );
}
