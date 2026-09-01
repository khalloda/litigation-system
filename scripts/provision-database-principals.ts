import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { runtimeRoleBoundaryFailures } from './lib/audit-structure';
import { decodeUrlPassword, postgresqlStringLiteral } from './lib/database-principal';

const RUNTIME_ROLE = 'litigation_runtime';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function databaseIdentity(url: URL): string {
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

function checkedUrl(raw: string | undefined, variable: string): URL {
  assert.ok(raw, `${variable} is required`);
  const url = new URL(raw);
  assert.equal(url.protocol, 'postgresql:', `${variable} must use PostgreSQL`);
  assert.ok(url.username, `${variable} requires a username`);
  assert.ok(url.password, `${variable} requires a password`);
  return url;
}

function setEnvironmentLine(source: string, name: string, value: string): string {
  const pattern = new RegExp(`^${name}=.*$`, 'mu');
  if (pattern.test(source)) return source.replace(pattern, `${name}=${value}`);
  const databaseLine = /^DATABASE_URL=.*$/mu;
  if (name === 'MIGRATION_DATABASE_URL' && databaseLine.test(source)) {
    return source.replace(databaseLine, `${name}=${value}\n$&`);
  }
  return `${source.replace(/\s*$/u, '')}\n${name}=${value}\n`;
}

async function prepareLocalEnvironment(): Promise<void> {
  const path = resolve('.env');
  const temporaryPath = resolve('.env.task33a.tmp');
  const source = await readFile(path, 'utf8');
  const existingMigration = source.match(/^MIGRATION_DATABASE_URL=(.+)$/mu)?.[1];
  const existingRuntime = source.match(/^DATABASE_URL=(.+)$/mu)?.[1];
  assert.ok(existingRuntime, '.env requires DATABASE_URL');

  if (existingMigration) {
    const migrationUrl = checkedUrl(existingMigration, 'MIGRATION_DATABASE_URL');
    const runtimeUrl = checkedUrl(existingRuntime, 'DATABASE_URL');
    assert.equal(runtimeUrl.username, RUNTIME_ROLE, 'DATABASE_URL must use litigation_runtime');
    assert.notEqual(migrationUrl.username, runtimeUrl.username, 'database principals must differ');
    assert.equal(databaseIdentity(migrationUrl), databaseIdentity(runtimeUrl));
    console.log(
      'PASS local ignored environment already separates DATABASE_URL and MIGRATION_DATABASE_URL',
    );
    return;
  }

  const ownerUrl = checkedUrl(existingRuntime, 'DATABASE_URL');
  assert.ok(LOCAL_HOSTS.has(ownerUrl.hostname), 'local preparation refuses a non-local database');
  assert.equal(ownerUrl.port || '5432', '5433', 'local preparation expects PostgreSQL port 5433');
  assert.notEqual(ownerUrl.username, RUNTIME_ROLE, 'MIGRATION_DATABASE_URL is missing');

  const runtimeUrl = new URL(ownerUrl);
  runtimeUrl.username = RUNTIME_ROLE;
  runtimeUrl.password = randomBytes(36).toString('base64url');
  let updated = setEnvironmentLine(source, 'MIGRATION_DATABASE_URL', ownerUrl.toString());
  updated = setEnvironmentLine(updated, 'DATABASE_URL', runtimeUrl.toString());

  try {
    await writeFile(temporaryPath, updated, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  console.log('PASS generated a new local runtime credential without displaying it');
  console.log('PASS updated only ignored DATABASE_URL and MIGRATION_DATABASE_URL values');
}

async function provisionRuntimePrincipal(): Promise<void> {
  const migrationUrl = checkedUrl(process.env['MIGRATION_DATABASE_URL'], 'MIGRATION_DATABASE_URL');
  const runtimeUrl = checkedUrl(process.env['DATABASE_URL'], 'DATABASE_URL');
  assert.equal(runtimeUrl.username, RUNTIME_ROLE, 'DATABASE_URL must use litigation_runtime');
  assert.notEqual(migrationUrl.username, runtimeUrl.username, 'database principals must differ');
  assert.equal(databaseIdentity(migrationUrl), databaseIdentity(runtimeUrl));
  const runtimePassword = decodeUrlPassword(runtimeUrl, 'DATABASE_URL');
  assert.equal(runtimePassword.startsWith('replace_'), false, 'runtime password is a placeholder');

  const owner = new Client({ connectionString: migrationUrl.toString() });
  await owner.connect();
  try {
    const boundaryFailures = await runtimeRoleBoundaryFailures(owner);
    assert.deepEqual(
      boundaryFailures,
      [],
      `restricted runtime boundary failed: ${boundaryFailures.join('; ')}`,
    );
    await owner.query(
      `ALTER ROLE litigation_runtime PASSWORD ${postgresqlStringLiteral(runtimePassword)}`,
    );
  } finally {
    await owner.end();
  }

  const runtime = new Client({ connectionString: runtimeUrl.toString() });
  await runtime.connect();
  try {
    const identity = await runtime.query<{ current_user: string; session_user: string }>(
      'SELECT current_user,session_user',
    );
    assert.deepEqual(identity.rows[0], {
      current_user: RUNTIME_ROLE,
      session_user: RUNTIME_ROLE,
    });
  } finally {
    await runtime.end();
  }
  console.log(
    'PASS provisioned litigation_runtime from ignored DATABASE_URL without displaying it',
  );
  console.log('PASS privileged MIGRATION_DATABASE_URL remained separate');
}

async function main(): Promise<void> {
  if (process.argv.length !== 3) throw new Error('use --prepare-local or --provision-runtime');
  if (process.argv[2] === '--prepare-local') return prepareLocalEnvironment();
  if (process.argv[2] === '--provision-runtime') return provisionRuntimePrincipal();
  throw new Error('use --prepare-local or --provision-runtime');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
