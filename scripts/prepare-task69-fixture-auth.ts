import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import {
  withApprovedMigrationClient,
  migrationDatabaseTarget,
  createApprovedMigrationPrismaClient,
} from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import {
  setApprovedAccountPassword,
  changeOwnPassword,
  authenticateCredentials,
} from '../src/lib/auth/service';
import { createSessionClaims, validateSessionClaims } from '../src/lib/auth/session';
import {
  createMaintenanceAuditMetadata,
  createRequestAuditMetadata,
} from '../src/lib/audit-metadata';

/** Credential setup is allowed only on an already verified Task69 full-state
 * fixture. Private plans survive uncertainty; existing plans are never rerun. */
async function main() {
  const privateDirectory = process.env['TASK69_PRIVATE_ROOT'];
  const output = process.env['TASK69_EVIDENCE_OUTPUT'];
  const target = migrationDatabaseTarget();
  const fixtureUrl = new URL(
    `${target.protocol}//${target.hostname}:${target.port}/${target.database}`,
  );
  const runtimeUrl = process.env['DATABASE_URL'];
  assert.ok(privateDirectory && output && runtimeUrl);
  const runtimeTarget = new URL(runtimeUrl);
  assert.equal(runtimeTarget.hostname, fixtureUrl.hostname);
  assert.equal(runtimeTarget.port, fixtureUrl.port);
  assert.equal(runtimeTarget.pathname, fixtureUrl.pathname);
  const privateRoot = realpathSync(privateDirectory);
  const planPath = join(privateRoot, 'fixture-auth-plan.json');
  const loginPath = join(privateRoot, 'fixture-logins.json');
  assert.ok(
    !existsSync(planPath) && !existsSync(loginPath),
    'Existing authentication preparation must be reconciled before retry',
  );
  const started = new Date().toISOString();
  const admin = await createApprovedMigrationPrismaClient();
  const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(async (db) => {
      const url = fixtureUrl;
      await assertIsolatedTestCluster(db, url);
      assert.ok(url.pathname.startsWith('/litigation_task69_'));
      return work(db);
    });
  try {
    const accounts = await inspect(
      async (db) =>
        (
          await db.query<{ id: number; username: string; role: string }>(
            'SELECT u.id,u.username,u.role_code role FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id WHERE u.is_enabled AND p.is_active AND p.is_staff AND p.can_login ORDER BY u.id',
          )
        ).rows,
    );
    assert.equal(accounts.length, 4, 'Exact copied fixture-account set required');
    const plan = accounts.map((account) => ({
      ...account,
      temporary: randomBytes(32).toString('base64url'),
      password: randomBytes(32).toString('base64url'),
      phase: 'prepared',
    }));
    const save = () =>
      writeFileSync(planPath, JSON.stringify({ started, accounts: plan }, null, 2) + '\n');
    writeFileSync(planPath, JSON.stringify({ started, accounts: plan }, null, 2) + '\n', {
      flag: 'wx',
    });
    const logins = [];
    for (const account of plan) {
      await inspect(async () => undefined);
      await setApprovedAccountPassword(account.username, account.temporary, {
        database: admin,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      account.phase = 'temporary-password-set';
      save();
      const current = await admin.userAccount.findUniqueOrThrow({ where: { id: account.id } });
      await inspect(async () => undefined);
      assert.equal(
        await changeOwnPassword(
          {
            accountId: account.id,
            sessionVersion: current.sessionVersion,
            currentPassword: account.temporary,
            newPassword: account.password,
          },
          { auditMetadata: createMaintenanceAuditMetadata() },
        ),
        'changed',
      );
      account.phase = 'password-changed';
      save();
      await inspect(async () => undefined);
      const user = await authenticateCredentials(
        { username: account.username, password: account.password },
        {
          auditMetadata: createRequestAuditMetadata(
            new Request('http://127.0.0.1:3169/task69-fixture-sign-in'),
          ),
        },
      );
      assert.ok(user, 'Genuine fixture authentication failed');
      const claims = await validateSessionClaims(createSessionClaims(user));
      assert.ok(claims);
      assert.equal(claims.userId, account.id);
      assert.equal(claims.role, account.role);
      account.phase = 'authenticated';
      save();
      logins.push({
        id: account.id,
        username: account.username,
        password: account.password,
        role: account.role,
        claims,
      });
    }
    writeFileSync(loginPath, JSON.stringify(logins, null, 2) + '\n', { flag: 'wx' });
    assert.equal(JSON.parse(readFileSync(loginPath, 'utf8')).length, 4);
    const result = {
      status: 'PASS',
      scope: 'Task69 copied fixture accounts only; genuine password authentication',
      started,
      completed: new Date().toISOString(),
      accounts: logins.map(({ id, role, claims }) => ({
        id,
        role,
        auditSessionId: claims.auditSessionId,
      })),
      ownerActions: 'NOT_APPLIED',
      protectedCredentialFile: 'private/fixture-logins.json',
    };
    writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(result));
  } finally {
    await admin.$disconnect();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Task69 fixture authentication setup failed',
  );
  process.exitCode = 1;
});
