import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  constants,
  existsSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { withApprovedMigrationClient, migrationDatabaseTarget } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { authenticateCredentials } from '../src/lib/auth/service';
import {
  createSessionClaims,
  validateSessionClaims,
  type SessionClaims,
} from '../src/lib/auth/session';
import { createRequestAuditMetadata } from '../src/lib/audit-metadata';
async function main() {
  const root = realpathSync(process.env['TASK69_PRIVATE_ROOT']!),
    output = process.env['TASK69_EVIDENCE_OUTPUT']!,
    target = migrationDatabaseTarget();
  const url = new URL(`${target.protocol}//${target.hostname}:${target.port}/${target.database}`),
    runtime = new URL(process.env['DATABASE_URL']!);
  assert.equal(runtime.hostname, url.hostname);
  assert.equal(runtime.port, url.port);
  assert.equal(runtime.pathname, url.pathname);
  assert.ok(url.pathname.startsWith('/litigation_task69_'));
  const verify = () =>
    withApprovedMigrationClient(async (db) => {
      await assertIsolatedTestCluster(db, url);
      return (
        await db.query('SELECT count(*)::int n,max(id)::text max_id FROM public.audit_events')
      ).rows[0];
    });
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, '-'),
    loginPath = join(root, 'fixture-logins.json'),
    planPath = join(root, 'fixture-refresh-pending.json');
  assert.equal(
    existsSync(planPath),
    false,
    'Existing refresh outcome requires reconciliation before another sign-in',
  );
  const accounts = JSON.parse(readFileSync(loginPath, 'utf8')) as {
    id: number;
    username: string;
    password: string;
    role: string;
    claims: SessionClaims;
  }[];
  assert.equal(accounts.length, 4);
  assert.ok(
    accounts.every((a) => a.claims.absoluteExpiresAt < Date.now()),
    'Only refresh the fully expired fixture batch',
  );
  const before = await verify(),
    started = new Date().toISOString(),
    plan = {
      started,
      before,
      accounts: accounts.map((a) => ({
        id: a.id,
        role: a.role,
        status: 'pending',
        claims: null as SessionClaims | null,
      })),
    };
  copyFileSync(
    loginPath,
    join(root, `fixture-logins-before-refresh-${stamp}.json`),
    constants.COPYFILE_EXCL,
  );
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  for (const [index, account] of accounts.entries()) {
    await verify();
    plan.accounts[index]!.status = 'sign-in-started';
    writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n');
    const user = await authenticateCredentials(
      { username: account.username, password: account.password },
      {
        auditMetadata: createRequestAuditMetadata(
          new Request('http://127.0.0.1:3169/task69-fixture-sign-in'),
        ),
      },
    );
    assert.ok(user, 'Genuine fixture login refused; inspect outcome before retry');
    const claims = await validateSessionClaims(createSessionClaims(user));
    assert.ok(claims);
    assert.equal(claims.userId, account.id);
    assert.equal(claims.role, account.role);
    account.claims = claims;
    plan.accounts[index]!.claims = claims;
    plan.accounts[index]!.status = 'authenticated';
    writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n');
  }
  const after = await verify();
  writeFileSync(loginPath, JSON.stringify(accounts, null, 2) + '\n');
  // Retain the completed plan as immutable private evidence; no uncertain repeat.
  const completed = new Date().toISOString();
  copyFileSync(
    planPath,
    join(root, `fixture-refresh-completed-${stamp}.json`),
    constants.COPYFILE_EXCL,
  );
  const result = {
    status: 'PASS',
    started,
    completed,
    before,
    after,
    accounts: accounts.map((a) => ({
      id: a.id,
      role: a.role,
      auditSessionId: a.claims.auditSessionId,
    })),
    passwordChanges: 0,
    ownerActions: 'NOT_APPLIED',
    pendingPlanState: 'All four authenticated; retained file prevents blind repeated refresh',
  };
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result));
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Fixture authentication refresh failed');
  process.exitCode = 1;
});
