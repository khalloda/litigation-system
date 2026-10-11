import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { withApprovedMigrationClient, migrationDatabaseTarget } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { assertStaffCheckpoint } from './lib/staff-roster-checkpoint';
import { task69FoundationFailures } from './lib/task69-foundation-checkpoint';

async function main() {
  const started = new Date().toISOString();
  const result = await withApprovedMigrationClient(async (db) => {
    const target = migrationDatabaseTarget();
    const url = new URL(
      'postgresql://' + target.hostname + ':' + target.port + '/' + target.database,
    );
    await assertIsolatedTestCluster(db, url);
    assert.ok(url.pathname.startsWith('/litigation_task69_'));
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      const checkpoint = await assertStaffCheckpoint(db, 'historical-full-state-upgrade');
      assert.ok(
        checkpoint === 78 ||
          checkpoint === 79 ||
          checkpoint === 80 ||
          checkpoint === 81 ||
          checkpoint === 82 ||
          checkpoint === 83 ||
          checkpoint === 84 ||
          checkpoint === 85,
      );
      assert.deepEqual(await task69FoundationFailures(db), []);
      await db.query('ROLLBACK');
      return {
        status: 'PASS',
        checkpoint,
        profile: 'historical-live',
        target: 'verified isolated Task69 fixture',
        ownerActions: 'NOT_APPLIED',
        started,
        completed: new Date().toISOString(),
      };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  });
  const output = process.env['TASK69_EVIDENCE_OUTPUT'];
  assert.ok(output);
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result));
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Task69 fixture checkpoint failed');
  process.exitCode = 1;
});
