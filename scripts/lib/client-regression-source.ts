import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import { assertStaffCheckpoint } from './staff-roster-checkpoint';
import { assertStaffBoundary } from './staff-roster-structure';
import { assertClientContactBoundary } from './client-contact-checkpoint';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture';
import { withApprovedMigrationClient } from './migration-principal';

const PROFILE = 'historical-full-state-upgrade';

/** Current full-state source, independent of how a fixture is owned/copied.
 * Canonical replay remains a separate mandatory acceptance profile. */
export async function assertCurrentClientSource(db: ClientBase): Promise<61 | 62> {
  const checkpoint = await assertStaffCheckpoint(db, PROFILE);
  assert.ok(
    checkpoint === 61 || checkpoint === 62,
    'Current regressions require complete 61 or 62',
  );
  await assertStaffBoundary(db, PROFILE);
  if (checkpoint === 62) await assertClientContactBoundary(db, PROFILE);
  return checkpoint;
}

/** Only an owned disposable clone may be advanced. In particular, a complete
 * 62 clone never invokes the migration command or the untouched-live-row oracle. */
export async function prepareCurrentClientSource(
  migrationUrl: string,
  environment: NodeJS.ProcessEnv,
  migrate: () => Promise<void> | void,
): Promise<61 | 62> {
  const inspect = () =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(migrationUrl), environment);
        return assertCurrentClientSource(db);
      },
      {
        databaseUrl: migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
  const source = await inspect();
  if (source === 61) {
    await migrate();
    assert.equal(await inspect(), 62, 'Disposable current regression upgrade did not establish 62');
  }
  console.log(
    `PASS current regression source: exact historical ${source}; migration applications ${source === 61 ? 1 : 0}; immutable evidence and operational state verified`,
  );
  return source;
}
