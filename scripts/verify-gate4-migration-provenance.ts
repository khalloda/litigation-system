import 'dotenv/config';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { assertApprovedMigrationPrincipalSession } from './lib/migration-principal';
import {
  readGate4RepositoryMigrationInventory,
  reconcileGate4Migrations,
  type Gate4MigrationHistoryRow,
} from './lib/gate4-migrations';

async function main(): Promise<void> {
  const expectedProfile = process.argv[2];
  if (!['historical-live', 'canonical-clean-replay'].includes(expectedProfile ?? ''))
    throw new Error(
      'usage: tsx scripts/verify-gate4-migration-provenance.ts historical-live|canonical-clean-replay',
    );

  const rawUrl = process.env.MIGRATION_DATABASE_URL;
  if (rawUrl === undefined) throw new Error('MIGRATION_DATABASE_URL is required');
  const url = new URL(rawUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '5433')
    throw new Error('migration-provenance verification requires localhost port 5433');
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ''));
  if (database !== 'litigation' && !/^litigation_gate4_replay_[a-z0-9_]+$/u.test(database))
    throw new Error(`refusing unexpected database name: ${database}`);

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await assertApprovedMigrationPrincipalSession(client);
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const target = await client.query<{ database: string; port: number }>(
      `SELECT current_database() database,current_setting('port')::int port`,
    );
    assert.equal(target.rows[0]?.database, database);
    assert.equal(target.rows[0]?.port, 5432);
    const result = await client.query<{
      migration_name: string;
      checksum: string;
      finished_at: string | null;
      rolled_back_at: string | null;
      applied_steps_count: number;
    }>(`
      SELECT migration_name,checksum,finished_at::text,rolled_back_at::text,applied_steps_count
        FROM _prisma_migrations
       ORDER BY migration_name,started_at,id`);
    const history: Gate4MigrationHistoryRow[] = result.rows.map((row) => ({
      migrationName: row.migration_name,
      checksum: row.checksum,
      finishedAt: row.finished_at,
      rolledBackAt: row.rolled_back_at,
      appliedStepsCount: row.applied_steps_count,
    }));
    const evidence = reconcileGate4Migrations(
      history,
      await readGate4RepositoryMigrationInventory(),
    );
    assert.deepEqual(evidence.defects, []);
    assert.equal(evidence.acceptedDatabaseProfile, expectedProfile);
    assert.equal(evidence.unaccountedDatabaseRows, 0);
    assert.equal(evidence.unaccountedRepositoryFiles, 0);
    assert.equal(evidence.pendingRepositoryMigrations.length, 0);
    await client.query('COMMIT');
    console.log(`Migration provenance PASS: ${evidence.acceptedDatabaseProfile}`);
    console.log(`Database profile digest: ${evidence.acceptedDatabaseProfileDigest}`);
    console.log(`Canonical repository digest: ${evidence.canonicalRepositoryDigest}`);
    console.log(
      `Required/later/rollback: ${evidence.requiredStage2Proved}/${evidence.laterApplied}/${evidence.cleanRollbacks}`,
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
