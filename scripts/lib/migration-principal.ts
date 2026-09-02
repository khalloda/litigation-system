import assert from 'node:assert/strict';
import { Client, type ClientBase } from 'pg';

const PREFLIGHT_FAILURE =
  'MIGRATION_DATABASE_URL must authenticate directly as the approved PostgreSQL superuser migration/administration principal';

type PrincipalRow = {
  session_user: string;
  current_user: string;
  session_superuser: boolean;
  current_superuser: boolean;
};

export async function assertApprovedMigrationPrincipalSession(database: ClientBase): Promise<void> {
  const identity = await database.query<PrincipalRow>(`
    SELECT session_user,current_user,
           coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=session_user),false)
             session_superuser,
           coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false)
             current_superuser`);
  const row = identity.rows[0];
  assert.equal(identity.rows.length, 1, PREFLIGHT_FAILURE);
  assert.ok(row, PREFLIGHT_FAILURE);
  assert.notEqual(row.session_user, 'litigation_runtime', PREFLIGHT_FAILURE);
  assert.equal(row.current_user, row.session_user, PREFLIGHT_FAILURE);
  assert.equal(row.session_superuser, true, PREFLIGHT_FAILURE);
  assert.equal(row.current_superuser, true, PREFLIGHT_FAILURE);
}

export async function assertApprovedMigrationPrincipalUrl(
  rawUrl: string | undefined,
): Promise<void> {
  assert.ok(rawUrl, 'MIGRATION_DATABASE_URL is required');
  const database = new Client({ connectionString: rawUrl });
  try {
    await database.connect();
    await assertApprovedMigrationPrincipalSession(database);
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    throw new Error('MIGRATION_DATABASE_URL principal preflight could not authenticate safely');
  } finally {
    await database.end().catch(() => undefined);
  }
}
