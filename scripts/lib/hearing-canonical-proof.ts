import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IsolatedPostgres } from './isolated-postgres-fixture';
import { withApprovedMigrationClient } from './migration-principal';
import { migrateFixtureThroughCheckpoint } from './fixture-migration-checkpoint';
import { assertStaffCheckpoint } from './staff-roster-checkpoint';
import { hearingEditSql, assertHearingEditBoundary } from './hearing-edit-checkpoint';
import { staffReadOnlyState } from './staff-read-only-state';
import { initialiseActors } from '../test-client-contacts';
export async function proveHearingCanonical(fixture: IsolatedPostgres, output: string) {
  const url = await fixture.createDatabase('litigation_task43_canonical_prestate'),
    runtime = new URL(fixture.runtimeUrl);
  runtime.pathname = new URL(url).pathname;
  const environment = {
    ...fixture.environment,
    MIGRATION_DATABASE_URL: url,
    DATABASE_URL: runtime.toString(),
  };
  const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(fn, { databaseUrl: url });
  await migrateFixtureThroughCheckpoint(url, 65, environment);
  await inspect(async (db) => {
    assert.equal(await assertStaffCheckpoint(db, 'canonical-clean-replay'), 65);
    const before = await staffReadOnlyState(db);
    await assert.rejects(
      db.query(
        hearingEditSql().replace(
          /COMMIT;\s*$/u,
          () =>
            "DO $$ BEGIN RAISE EXCEPTION 'TEST ONLY canonical late hearing failure'; END $$; COMMIT;",
        ),
      ),
      /TEST ONLY canonical late hearing failure/u,
    );
    await db.query('ROLLBACK');
    assert.deepEqual(await staffReadOnlyState(db), before);
  });
  const run = (name: string, script: string, args: string[]) => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
      env: environment,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 32000000,
    });
    writeFileSync(
      join(output, name + '.log'),
      (r.stdout + r.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
    );
    assert.equal(r.status, 0, name);
  };
  run('canonical-deploy66', 'scripts/run-prisma-migration.ts', ['deploy']);
  await initialiseActors(url, runtime.toString());
  run('canonical-invariants', 'scripts/check-db.ts', ['--profile=canonical-clean-replay']);
  await inspect(async (db) => {
    assert.equal(await assertStaffCheckpoint(db, 'canonical-clean-replay'), 66);
    await assertHearingEditBoundary(db, 'canonical-clean-replay');
  });
  writeFileSync(
    join(output, 'canonical-result.json'),
    JSON.stringify(
      {
        profile: 'canonical-clean-replay',
        prestate: 65,
        lateFailureExactRollback: true,
        applied: 66,
        invariants: true,
      },
      null,
      2,
    ),
  );
  console.log('PASS canonical exact65, late failure, deployed66 and full canonical invariants');
}
