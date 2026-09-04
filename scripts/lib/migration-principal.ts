import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client, type ClientBase, type ClientConfig } from 'pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const PREFLIGHT_FAILURE =
  'MIGRATION_DATABASE_URL must authenticate directly as the approved PostgreSQL superuser migration/administration principal';
const CONNECTION_FAILURE =
  'MIGRATION_DATABASE_URL principal preflight could not authenticate safely';
const RUNTIME_ROLE = 'litigation_runtime';

type PrincipalRow = {
  session_user: string;
  current_user: string;
  session_superuser: boolean;
  current_superuser: boolean;
};

export type MigrationDatabaseTarget = Readonly<{
  protocol: 'postgres:' | 'postgresql:';
  hostname: string;
  port: number;
  database: string;
}>;

function parsePostgreSqlUrl(rawUrl: string | undefined, variable: string): URL {
  assert.ok(rawUrl, `${variable} is required`);
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${variable} is not a valid PostgreSQL URL`);
  }
  assert.ok(
    parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:',
    `${variable} must use PostgreSQL`,
  );
  return parsed;
}

function migrationDatabaseUrl(rawUrl?: string): string {
  const value = rawUrl ?? process.env['MIGRATION_DATABASE_URL'];
  parsePostgreSqlUrl(value, 'MIGRATION_DATABASE_URL');
  return value!;
}

function assertPrincipalRow(rows: readonly PrincipalRow[]): void {
  assert.equal(rows.length, 1, PREFLIGHT_FAILURE);
  const row = rows[0];
  assert.ok(row, PREFLIGHT_FAILURE);
  assert.notEqual(row.session_user, RUNTIME_ROLE, PREFLIGHT_FAILURE);
  assert.equal(row.current_user, row.session_user, PREFLIGHT_FAILURE);
  assert.equal(row.session_superuser, true, PREFLIGHT_FAILURE);
  assert.equal(row.current_superuser, true, PREFLIGHT_FAILURE);
}

async function assertApprovedMigrationPrincipalSession(database: ClientBase): Promise<void> {
  const identity = await database.query<PrincipalRow>(`
    SELECT session_user,current_user,
           coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=session_user),false)
             session_superuser,
           coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false)
             current_superuser`);
  assertPrincipalRow(identity.rows);
}

export function migrationDatabaseTarget(rawUrl?: string): MigrationDatabaseTarget {
  const parsed = parsePostgreSqlUrl(
    rawUrl ?? process.env['MIGRATION_DATABASE_URL'],
    'MIGRATION_DATABASE_URL',
  );
  return {
    protocol: parsed.protocol as MigrationDatabaseTarget['protocol'],
    hostname: parsed.hostname,
    port: parsed.port === '' ? 5432 : Number(parsed.port),
    database: decodeURIComponent(parsed.pathname.replace(/^\//u, '')),
  };
}

/** Parsed non-secret URL options for destructive-operation gates. */
export function migrationDatabaseUrlOptions(
  rawUrl?: string,
): Readonly<{ search: string; hash: string }> {
  const parsed = parsePostgreSqlUrl(
    rawUrl ?? process.env['MIGRATION_DATABASE_URL'],
    'MIGRATION_DATABASE_URL',
  );
  return { search: parsed.search, hash: parsed.hash };
}

export async function withApprovedMigrationClient<T>(
  run: (database: Client) => Promise<T>,
  options: Readonly<{
    databaseUrl?: string;
    clientConfig?: Omit<ClientConfig, 'connectionString'>;
  }> = {},
): Promise<T> {
  const database = new Client({
    ...options.clientConfig,
    connectionString: migrationDatabaseUrl(options.databaseUrl),
  });
  try {
    await database.connect();
    await assertApprovedMigrationPrincipalSession(database);
  } catch (error) {
    await database.end().catch(() => undefined);
    if (error instanceof assert.AssertionError) throw error;
    throw new Error(CONNECTION_FAILURE);
  }

  try {
    return await run(database);
  } finally {
    await database.end().catch(() => undefined);
  }
}

export async function assertApprovedMigrationPrincipalUrl(rawUrl?: string): Promise<void> {
  await withApprovedMigrationClient(async () => undefined, { databaseUrl: rawUrl });
}

export async function createApprovedMigrationPrismaClient(rawUrl?: string): Promise<PrismaClient> {
  const connectionString = migrationDatabaseUrl(rawUrl);
  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  try {
    await database.$connect();
    const rows = await database.$queryRaw<PrincipalRow[]>`
      SELECT session_user,current_user,
             coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=session_user),false)
               session_superuser,
             coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false)
               current_superuser`;
    assertPrincipalRow(rows);
    return database;
  } catch (error) {
    await database.$disconnect().catch(() => undefined);
    if (error instanceof assert.AssertionError) throw error;
    throw new Error(CONNECTION_FAILURE);
  }
}

export async function withRestrictedRuntimeClient<T>(
  rawUrl: string | undefined,
  run: (database: Client) => Promise<T>,
): Promise<T> {
  const parsed = parsePostgreSqlUrl(rawUrl, 'DATABASE_URL');
  assert.equal(parsed.username, RUNTIME_ROLE, 'DATABASE_URL must use litigation_runtime');
  const database = new Client({ connectionString: rawUrl });
  try {
    await database.connect();
    const identity = await database.query<PrincipalRow>(`
      SELECT session_user,current_user,
             coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=session_user),false)
               session_superuser,
             coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false)
               current_superuser`);
    assert.equal(identity.rows.length, 1, 'DATABASE_URL runtime identity is invalid');
    assert.deepEqual(identity.rows[0], {
      session_user: RUNTIME_ROLE,
      current_user: RUNTIME_ROLE,
      session_superuser: false,
      current_superuser: false,
    });
    return await run(database);
  } finally {
    await database.end().catch(() => undefined);
  }
}
