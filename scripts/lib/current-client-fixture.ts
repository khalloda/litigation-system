import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture';
import { assertStaffCheckpoint } from './staff-roster-checkpoint';
import { withIsolatedPostgres, type IsolatedPostgres } from './isolated-postgres-fixture';
import { auditDataFailures } from './audit-structure';
import { historicalHighImpactClient, readApplicationState } from './high-impact-application-state';

/** Match db:check's existing pre-Task-3.5B attribution projection. The approved
 * 804 later migration creations are reconciled by that task's own invariants. */
export async function currentFixtureAuditDataFailures(db: ClientBase, restored: boolean) {
  return auditDataFailures(
    restored ? historicalHighImpactClient(db, await readApplicationState(db)) : db,
    { historicalLive: restored },
  );
}

type CurrentFixture = Pick<
  IsolatedPostgres,
  'migrationUrl' | 'runtimeUrl' | 'environment' | 'createDatabase' | 'restoreProject'
>;

/** A child regression borrows only the already verified task-owned cluster.
 * It creates its own database; the outer wrapper owns cluster cleanup. */
export async function withCurrentClientFixture(
  work: (fixture: CurrentFixture) => Promise<void>,
  sourceUrl?: string,
) {
  if (!process.argv.includes('--restored-client-fixture')) return withIsolatedPostgres(work);
  assert.ok(sourceUrl, 'Explicit approved test-entry migration URL required');
  const source = new URL(sourceUrl);
  assert.equal(source.pathname, '/litigation');
  await withApprovedMigrationClient(
    async (db) => {
      await assertIsolatedTestCluster(db, source);
      assert.equal(await assertStaffCheckpoint(db, 'historical-full-state-upgrade'), 62);
    },
    {
      databaseUrl: source.toString(),
      clientConfig: { options: '-c default_transaction_read_only=on' },
    },
  );
  const name = 'litigation_task41_staff_' + process.pid + '_' + Date.now();
  const target = new URL(source);
  target.pathname = '/' + name;
  await withApprovedMigrationClient(
    async (db) => {
      await db.query(`CREATE DATABASE "${name}" TEMPLATE litigation`);
      await db.query(`REVOKE TEMPORARY ON DATABASE "${name}" FROM PUBLIC`);
    },
    { databaseUrl: source.toString() },
  );
  const runtime = new URL(process.env['DATABASE_URL']!);
  runtime.pathname = target.pathname;
  const created = [name];
  try {
    await work({
      migrationUrl: target.toString(),
      runtimeUrl: runtime.toString(),
      environment: {
        ...process.env,
        MIGRATION_DATABASE_URL: target.toString(),
        DATABASE_URL: runtime.toString(),
      },
      restoreProject: async () => {},
      createDatabase: async (name, template) => {
        assert.match(name, /^litigation_task40a_[a-z0-9_]+$/u);
        assert.ok(template === undefined || template === 'litigation');
        await withApprovedMigrationClient(
          async (db) => {
            await db.query(
              `CREATE DATABASE "${name}"${template ? ` TEMPLATE "${created[0]}"` : ''}`,
            );
            await db.query(`REVOKE TEMPORARY ON DATABASE "${name}" FROM PUBLIC`);
          },
          { databaseUrl: source.toString() },
        );
        created.push(name);
        const url = new URL(source);
        url.pathname = '/' + name;
        return url.toString();
      },
    });
  } finally {
    for (const database of created.reverse())
      await withApprovedMigrationClient(
        (db) => db.query(`DROP DATABASE "${database}" WITH (FORCE)`),
        { databaseUrl: source.toString() },
      );
    console.log('PASS upgraded staff fixture databases removed');
  }
}

/** Exact opt-in historical-62 fixture adapter. This never selects project
 * port 5433 or silently replaces a suite's independent canonical replay. */
export async function createCurrentClientFixture(
  admin: ClientBase,
  source: URL,
  name: string,
): Promise<boolean> {
  if (!process.argv.includes('--restored-client-fixture')) return false;
  assert.match(name, /^litigation_(?:auth|task33a|task33b|task34)_fixture_[0-9_]+$/u);
  assert.equal(source.pathname, '/litigation');
  await withApprovedMigrationClient(
    async (db) => {
      await assertIsolatedTestCluster(db, source);
      assert.equal(
        await assertStaffCheckpoint(db, 'historical-full-state-upgrade'),
        62,
        'Restored regression requires complete historical migration62 source',
      );
    },
    {
      databaseUrl: source.toString(),
      clientConfig: { options: '-c default_transaction_read_only=on' },
    },
  );
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE litigation`);
  await admin.query(`REVOKE TEMPORARY ON DATABASE "${name}" FROM PUBLIC`);
  return true;
}
