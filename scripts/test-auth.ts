import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { createDatabaseClient } from '../src/lib/db';
import { setMigrationAuditContext } from '../src/lib/audit';
import {
  createMaintenanceAuditMetadata,
  createRequestAuditMetadata,
} from '../src/lib/audit-metadata';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import {
  authenticateCredentials,
  changeOwnPassword,
  setApprovedAccountPassword,
} from '../src/lib/auth/service';
import {
  createSessionClaims,
  readSessionClaims,
  validateSessionClaims,
} from '../src/lib/auth/session';
import {
  ARGON2ID_PARAMETERS,
  hashPassword,
  isApprovedArgon2idHash,
  passwordMeetsPolicy,
  verifyPassword,
} from '../src/lib/auth/password';
import { NORMAL_SESSION_SECONDS, REMEMBERED_SESSION_SECONDS } from '../src/lib/auth/constants';
import { authDataFailures, authStructureFailures } from './lib/auth-structure';
import { createAuthConfig } from '../src/auth';
import { auditEventDataFailures, auditEventStructureFailures } from './lib/audit-event-structure';

function identifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/u);
  return `"${value}"`;
}

function migrate(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function fixtureRuntimeUrl(fixtureOwnerUrl: URL): URL {
  const configured = process.env['DATABASE_URL'];
  assert.ok(configured, 'DATABASE_URL is required');
  const runtime = new URL(configured);
  assert.equal(runtime.username, 'litigation_runtime');
  runtime.protocol = fixtureOwnerUrl.protocol;
  runtime.hostname = fixtureOwnerUrl.hostname;
  runtime.port = fixtureOwnerUrl.port;
  runtime.pathname = fixtureOwnerUrl.pathname;
  return runtime;
}

async function withMaintenanceContext<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return database.$transaction(async (transaction) => {
    await setMigrationAuditContext(transaction, createMaintenanceAuditMetadata());
    return operation(transaction);
  });
}

async function proveStructureMutation(
  db: Client,
  label: string,
  mutation: string,
  expected: RegExp,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await db.query(mutation);
    const failures = await authStructureFailures(db);
    assert.match(failures.join('; '), expected, label);
  } finally {
    await db.query('ROLLBACK');
  }
  assert.deepEqual(
    await authStructureFailures(db),
    [],
    `${label} rollback did not restore structure`,
  );
}

async function main(): Promise<void> {
  const sourceUrl = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(sourceUrl, 'MIGRATION_DATABASE_URL is required');
  const parsed = new URL(sourceUrl);
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname));
  assert.equal(parsed.port, '5433');
  const fixtureName = `litigation_auth_fixture_${process.pid}_${Date.now()}`;
  const fixtureUrl = new URL(parsed);
  fixtureUrl.pathname = `/${fixtureName}`;
  const runtimeUrl = fixtureRuntimeUrl(fixtureUrl);
  const adminUrl = new URL(parsed);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  await admin.connect();
  try {
    const prior = await admin.query<{ count: string }>(
      'SELECT count(*)::text count FROM pg_database WHERE datname=$1',
      [fixtureName],
    );
    assert.equal(prior.rows[0]?.count, '0');
    await admin.query(`CREATE DATABASE ${identifier(fixtureName)}`);
    created = true;
    migrate(fixtureUrl.toString());

    const database = createDatabaseClient(runtimeUrl.toString());
    const migrationDatabase = new PrismaClient({
      adapter: new PrismaPg({ connectionString: fixtureUrl.toString() }),
    });
    const catalog = new Client({ connectionString: fixtureUrl.toString() });
    const runtimeProbe = new Client({ connectionString: runtimeUrl.toString() });
    await catalog.connect();
    await runtimeProbe.connect();
    try {
      const fixtureRequestMetadata = () =>
        createRequestAuditMetadata(
          new Request('http://localhost/auth-fixture', {
            headers: { 'user-agent': 'Task 3.3B authentication fixture' },
          }),
        );
      assert.deepEqual(
        (
          await runtimeProbe.query<{ current_user: string; session_user: string }>(
            'SELECT current_user,session_user',
          )
        ).rows[0],
        { current_user: 'litigation_runtime', session_user: 'litigation_runtime' },
      );
      assert.deepEqual(await authStructureFailures(catalog), []);
      assert.deepEqual(await authDataFailures(catalog), []);
      assert.deepEqual(await auditEventStructureFailures(catalog), []);
      assert.deepEqual(await auditEventDataFailures(catalog), []);

      const priorSecret = process.env['AUTH_SECRET'];
      delete process.env['AUTH_SECRET'];
      assert.throws(() => createAuthConfig(), /AUTH_SECRET/u);
      const productionConfig = createAuthConfig({
        secret: randomBytes(48).toString('base64url'),
        secure: true,
      });
      assert.equal(productionConfig.providers.length, 1);
      assert.equal(productionConfig.session?.strategy, 'jwt');
      assert.equal(productionConfig.session?.maxAge, REMEMBERED_SESSION_SECONDS);
      assert.equal(productionConfig.useSecureCookies, true);
      assert.equal(productionConfig.cookies?.sessionToken?.options?.httpOnly, true);
      assert.equal(productionConfig.cookies?.sessionToken?.options?.sameSite, 'lax');
      assert.equal(productionConfig.cookies?.sessionToken?.options?.secure, true);
      if (priorSecret === undefined) delete process.env['AUTH_SECRET'];
      else process.env['AUTH_SECRET'] = priorSecret;

      const mappings = await database.userAccount.findMany({
        where: { username: { in: ['KHelmy', 'MHussien', 'IHamdy', 'SKhattab'] } },
        select: {
          username: true,
          usernameNormalized: true,
          roleCode: true,
          passwordHash: true,
          person: {
            select: {
              id: true,
              nameAr: true,
              email: true,
              isApplicationNative: true,
              canLogin: true,
            },
          },
        },
        orderBy: { username: 'asc' },
      });
      assert.deepEqual(
        mappings.map((row) => ({
          username: row.username,
          normalized: row.usernameNormalized,
          role: row.roleCode,
          nameAr: row.person.nameAr,
          email: row.person.email,
          native: row.person.isApplicationNative,
          canLogin: row.person.canLogin,
          initialized: row.passwordHash !== null,
        })),
        [
          {
            username: 'IHamdy',
            normalized: 'ihamdy',
            role: 'Lawyer',
            nameAr: 'إيهاب حمدي',
            email: 'ihamdy@sarieldin.com',
            native: false,
            canLogin: true,
            initialized: false,
          },
          {
            username: 'KHelmy',
            normalized: 'khelmy',
            role: 'Administrator',
            nameAr: 'خالد حلمي',
            email: 'khelmy@sarieldin.com',
            native: true,
            canLogin: true,
            initialized: false,
          },
          {
            username: 'MHussien',
            normalized: 'mhussien',
            role: 'Litigation Assistant',
            nameAr: 'محمد حسين',
            email: 'mhussien@sarieldin.com',
            native: true,
            canLogin: true,
            initialized: false,
          },
          {
            username: 'SKhattab',
            normalized: 'skhattab',
            role: 'Paralegal',
            nameAr: 'سامي إبراهيم خطاب',
            email: 'skhattab@sarieldin.com',
            native: false,
            canLogin: true,
            initialized: false,
          },
        ],
      );
      assert.equal(mappings.find((row) => row.username === 'IHamdy')?.person.id, 4);
      assert.equal(mappings.find((row) => row.username === 'SKhattab')?.person.id, 5);
      assert.notEqual(
        mappings.find((row) => row.username === 'KHelmy')?.person.id,
        mappings.find((row) => row.username === 'MHussien')?.person.id,
      );
      assert.equal(await database.person.count({ where: { isApplicationNative: false } }), 135);
      assert.equal(await database.person.count({ where: { isApplicationNative: true } }), 2);
      assert.equal(await database.personNameAlias.count(), 350);
      const auditActors = (
        await catalog.query<{
          id: number;
          actor_key: string;
          actor_kind: string;
          user_account_id: number | null;
        }>('SELECT id,actor_key,actor_kind,user_account_id FROM audit_actors ORDER BY id')
      ).rows;
      const actorIdForAccount = (accountId: number): number => {
        const actor = auditActors.find((candidate) => candidate.user_account_id === accountId);
        assert.ok(actor, `fixture account ${accountId} has no immutable audit actor`);
        return actor.id;
      };
      assert.equal(auditActors.length, 7);
      assert.deepEqual(
        auditActors
          .filter((actor) => actor.actor_kind === 'system')
          .map((actor) => actor.actor_key),
        ['system_migration', 'system_authentication', 'system_administration'],
      );
      assert.deepEqual(
        auditActors
          .filter((actor) => actor.actor_kind === 'human')
          .map((actor) => [actor.actor_key, actor.user_account_id]),
        [
          ['user_account:1', 1],
          ['user_account:2', 2],
          ['user_account:3', 3],
          ['user_account:4', 4],
        ],
      );

      await assert.rejects(
        database.personNameAlias.create({
          data: { personId: 4, aliasAr: 'سامي إبراهيم خطاب', isPrimary: false },
        }),
      );
      await assert.rejects(
        database.userAccount.create({
          data: {
            personId: 4,
            username: 'Another',
            usernameNormalized: 'another',
            roleCode: 'Lawyer',
            updatedAt: new Date(),
          },
        }),
      );
      await assert.rejects(
        database.userAccount.create({
          data: {
            personId: 6,
            username: 'khelmy',
            usernameNormalized: 'khelmy',
            roleCode: 'Lawyer',
            updatedAt: new Date(),
          },
        }),
      );

      assert.equal(ARGON2ID_PARAMETERS.memoryCost, 19_456);
      assert.equal(ARGON2ID_PARAMETERS.timeCost, 2);
      assert.equal(ARGON2ID_PARAMETERS.parallelism, 1);
      assert.equal(passwordMeetsPolicy('مسافات مقبولة 12'), true);
      assert.equal(passwordMeetsPolicy('short'), false);
      const directHash = await hashPassword(`fixture ${randomBytes(12).toString('base64url')}`);
      assert.equal(isApprovedArgon2idHash(directHash), true);
      assert.equal(await verifyPassword(directHash, 'incorrect fixture value'), false);
      assert.equal(await verifyPassword('malformed', 'anything'), false);

      const temporaryPassword = `A ${randomBytes(18).toString('base64url')}`;
      const replacementPassword = `B ${randomBytes(18).toString('base64url')}`;
      await setApprovedAccountPassword('kHeLmY', temporaryPassword, {
        database: migrationDatabase,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      const initialized = await database.userAccount.findUniqueOrThrow({
        where: { usernameNormalized: 'khelmy' },
      });
      assert.equal(initialized.mustChangePassword, true);
      assert.equal(initialized.failedLoginAttempts, 0);
      assert.equal(initialized.lockedUntil, null);
      assert.equal(initialized.createdBy, 1);
      assert.equal(initialized.updatedBy, 3);
      assert.ok(initialized.passwordHash);
      assert.equal(isApprovedArgon2idHash(initialized.passwordHash), true);
      const initializedEvent = (
        await catalog.query<{
          actor_key: string;
          target_actor_id: number;
          action: string;
        }>(`
          SELECT actor_key_snapshot actor_key,target_actor_id,action FROM audit_events
           WHERE action='password_initialized' ORDER BY id DESC LIMIT 1`)
      ).rows[0];
      assert.deepEqual(initializedEvent, {
        actor_key: 'system_administration',
        target_actor_id: actorIdForAccount(initialized.id),
        action: 'password_initialized',
      });
      await assert.rejects(
        withMaintenanceContext(migrationDatabase, (transaction) =>
          transaction.userAccount.update({
            where: { id: initialized.id },
            data: {
              passwordHash: 'malformed',
              passwordChangedAt: new Date(),
              sessionVersion: { increment: 1 },
            },
          }),
        ),
      );
      await assert.rejects(
        setApprovedAccountPassword('not-approved', temporaryPassword, {
          database: migrationDatabase,
          auditMetadata: createMaintenanceAuditMetadata(),
        }),
        /approved-account-not-found/u,
      );

      let dummyCalls = 0;
      const priorTrustProxy = process.env['AUDIT_TRUST_PROXY'];
      process.env['AUDIT_TRUST_PROXY'] = 'false';
      const untrustedProxyMetadata = createRequestAuditMetadata(
        new Request('http://localhost/login', {
          headers: {
            authorization: 'Bearer task33b_auth_token_sentinel',
            cookie: 'session=task33b_cookie_sentinel',
            'x-forwarded-for': '198.51.100.77',
            'user-agent': 'Cookie task33b_user_agent_cookie_sentinel',
          },
        }),
      );
      assert.equal(untrustedProxyMetadata.ipAddress, null);
      assert.equal(
        await authenticateCredentials(
          { username: 'does-not-exist', password: temporaryPassword },
          {
            database,
            auditMetadata: untrustedProxyMetadata,
            dummyVerify: async () => {
              dummyCalls += 1;
            },
          },
        ),
        null,
      );
      assert.equal(dummyCalls, 1, 'nonexistent username did not take the dummy verification path');
      const unknownEvent = (
        await catalog.query<{
          actor_key: string;
          target_actor_id: number | null;
          attempted_username: string;
          ip_address: string | null;
          user_agent: string;
          user_agent_truncated: boolean;
          audit_session_id: string;
        }>(`
          SELECT actor_key_snapshot actor_key,target_actor_id,attempted_username,
                 ip_address::text,user_agent,user_agent_truncated,audit_session_id::text
            FROM audit_events WHERE action='login_failed'
              AND attempted_username='does-not-exist' ORDER BY id DESC LIMIT 1`)
      ).rows[0];
      assert.deepEqual(unknownEvent, {
        actor_key: 'system_authentication',
        target_actor_id: null,
        attempted_username: 'does-not-exist',
        ip_address: null,
        user_agent: '[redacted]',
        user_agent_truncated: true,
        audit_session_id: untrustedProxyMetadata.auditSessionId,
      });
      process.env['AUDIT_TRUST_PROXY'] = 'true';
      const trustedProxyMetadata = createRequestAuditMetadata(
        new Request('http://localhost/login', {
          headers: { 'x-forwarded-for': '198.51.100.77', 'user-agent': 'Task33B fixture' },
        }),
      );
      assert.equal(trustedProxyMetadata.ipAddress, '198.51.100.77');
      assert.equal(
        await authenticateCredentials(
          { username: 'postgresql://task33b_connection_sentinel', password: temporaryPassword },
          { database, auditMetadata: trustedProxyMetadata, dummyVerify: async () => undefined },
        ),
        null,
      );
      const redactedAttempt = (
        await catalog.query<{ attempted_username: string; ip_address: string }>(`
          SELECT attempted_username,ip_address::text FROM audit_events
           WHERE action='login_failed' AND ip_address='198.51.100.77'::inet
           ORDER BY id DESC LIMIT 1`)
      ).rows[0];
      assert.deepEqual(redactedAttempt, {
        attempted_username: '[redacted]',
        ip_address: '198.51.100.77/32',
      });
      if (priorTrustProxy === undefined) delete process.env['AUDIT_TRUST_PROXY'];
      else process.env['AUDIT_TRUST_PROXY'] = priorTrustProxy;
      assert.equal(
        await authenticateCredentials(
          { username: 'MHussien', password: temporaryPassword },
          {
            database,
            auditMetadata: fixtureRequestMetadata(),
            dummyVerify: async () => {
              dummyCalls += 1;
            },
          },
        ),
        null,
        'an account without an initial password authenticated',
      );

      const clock = new Date('2026-08-31T09:00:00.000Z');
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        assert.equal(
          await authenticateCredentials(
            { username: 'KHELmy', password: `${temporaryPassword} wrong` },
            { database, now: clock, auditMetadata: fixtureRequestMetadata() },
          ),
          null,
        );
        const state = await database.userAccount.findUniqueOrThrow({
          where: { usernameNormalized: 'khelmy' },
        });
        assert.equal(state.failedLoginAttempts, attempt);
        assert.equal(state.lockedUntil, null);
        assert.equal(state.updatedBy, 2);
      }
      assert.equal(
        await authenticateCredentials(
          { username: 'KHelmy', password: `${temporaryPassword} wrong` },
          { database, now: clock, auditMetadata: fixtureRequestMetadata() },
        ),
        null,
      );
      let state = await database.userAccount.findUniqueOrThrow({
        where: { usernameNormalized: 'khelmy' },
      });
      assert.equal(state.failedLoginAttempts, 5);
      assert.equal(state.lockedUntil?.toISOString(), '2026-08-31T09:15:00.000Z');
      assert.equal(
        await authenticateCredentials(
          { username: 'KHelmy', password: temporaryPassword },
          {
            database,
            now: new Date('2026-08-31T09:14:59.999Z'),
            auditMetadata: fixtureRequestMetadata(),
          },
        ),
        null,
      );

      const afterExpiry = await authenticateCredentials(
        { username: 'KHelmy', password: temporaryPassword },
        {
          database,
          now: new Date('2026-08-31T09:15:00.001Z'),
          auditMetadata: fixtureRequestMetadata(),
        },
      );
      assert.ok(afterExpiry);
      state = await database.userAccount.findUniqueOrThrow({
        where: { usernameNormalized: 'khelmy' },
      });
      assert.equal(state.failedLoginAttempts, 0);
      assert.equal(state.lockedUntil, null);
      assert.equal(state.updatedBy, actorIdForAccount(state.id));

      await withMaintenanceContext(migrationDatabase, (transaction) =>
        transaction.userAccount.update({
          where: { id: state.id },
          data: { failedLoginAttempts: 3, updatedAt: clock },
        }),
      );
      assert.ok(
        await authenticateCredentials(
          { username: 'KHelmy', password: temporaryPassword },
          { database, now: clock, auditMetadata: fixtureRequestMetadata() },
        ),
      );
      assert.equal(
        (await database.userAccount.findUniqueOrThrow({ where: { id: state.id } }))
          .failedLoginAttempts,
        0,
      );

      await withMaintenanceContext(migrationDatabase, (transaction) =>
        transaction.userAccount.update({
          where: { id: state.id },
          data: { failedLoginAttempts: 0, lockedUntil: null, updatedAt: clock },
        }),
      );
      await Promise.all(
        Array.from({ length: 5 }, () =>
          authenticateCredentials(
            { username: 'KHelmy', password: `${temporaryPassword} concurrent-wrong` },
            { database, now: clock, auditMetadata: fixtureRequestMetadata() },
          ),
        ),
      );
      state = await database.userAccount.findUniqueOrThrow({ where: { id: state.id } });
      assert.equal(state.failedLoginAttempts, 5);
      assert.ok(state.lockedUntil);
      const knownFailureTargets = await catalog.query<{
        action: string;
        target_actor_id: number;
      }>(
        `
        SELECT action,target_actor_id FROM audit_events
         WHERE action IN ('login_failed','account_locked')
           AND entity_key=jsonb_build_object('id',$1::integer)
         ORDER BY id`,
        [state.id],
      );
      assert.ok(
        knownFailureTargets.rows.some(
          (event) =>
            event.action === 'login_failed' &&
            event.target_actor_id === actorIdForAccount(state.id),
        ),
      );
      assert.ok(
        knownFailureTargets.rows.some(
          (event) =>
            event.action === 'account_locked' &&
            event.target_actor_id === actorIdForAccount(state.id),
        ),
      );

      await setApprovedAccountPassword('KHelmy', temporaryPassword, {
        database: migrationDatabase,
        now: clock,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      assert.equal(
        (
          await catalog.query<{ target_actor_id: number }>(
            `
            SELECT target_actor_id FROM audit_events
             WHERE action='password_reset'
               AND entity_key=jsonb_build_object('id',$1::integer)
             ORDER BY id DESC LIMIT 1`,
            [state.id],
          )
        ).rows[0]?.target_actor_id,
        actorIdForAccount(state.id),
      );
      const normalUser = await authenticateCredentials(
        { username: 'KHelmy', password: temporaryPassword },
        { database, now: clock, auditMetadata: fixtureRequestMetadata() },
      );
      const rememberedUser = await authenticateCredentials(
        { username: 'KHelmy', password: temporaryPassword, rememberMe: 'true' },
        { database, now: clock, auditMetadata: fixtureRequestMetadata() },
      );
      assert.ok(normalUser);
      assert.ok(rememberedUser);
      const normalClaims = createSessionClaims(normalUser);
      const rememberedClaims = createSessionClaims(rememberedUser);
      assert.equal(
        normalClaims.absoluteExpiresAt - normalClaims.authenticatedAt,
        NORMAL_SESSION_SECONDS * 1_000,
      );
      assert.equal(
        rememberedClaims.absoluteExpiresAt - rememberedClaims.authenticatedAt,
        REMEMBERED_SESSION_SECONDS * 1_000,
      );
      assert.equal(normalClaims.auditSessionId, normalUser.auditSessionId);
      assert.notEqual(normalClaims.auditSessionId, rememberedClaims.auditSessionId);
      assert.ok(
        await validateSessionClaims(normalClaims, {
          database,
          now: new Date(normalClaims.absoluteExpiresAt - 1),
        }),
      );
      assert.equal(
        await validateSessionClaims(normalClaims, {
          database,
          now: new Date(normalClaims.absoluteExpiresAt),
        }),
        null,
      );
      assert.equal(readSessionClaims({ ...normalClaims, remembered: true }), null);
      assert.equal(
        await validateSessionClaims(
          { ...normalClaims, personId: 999_999 },
          { database, now: clock },
        ),
        null,
      );

      assert.equal(
        await changeOwnPassword(
          {
            accountId: Number(normalUser.id),
            sessionVersion: normalUser.sessionVersion,
            currentPassword: temporaryPassword,
            newPassword: temporaryPassword,
          },
          { database, now: clock, auditMetadata: fixtureRequestMetadata() },
        ),
        'reused',
      );
      assert.equal(
        await changeOwnPassword(
          {
            accountId: Number(normalUser.id),
            sessionVersion: normalUser.sessionVersion,
            currentPassword: `${temporaryPassword} wrong`,
            newPassword: replacementPassword,
          },
          { database, now: clock, auditMetadata: fixtureRequestMetadata() },
        ),
        'invalid-current',
      );
      assert.equal(
        await changeOwnPassword(
          {
            accountId: Number(normalUser.id),
            sessionVersion: normalUser.sessionVersion,
            currentPassword: temporaryPassword,
            newPassword: replacementPassword,
          },
          { database, now: clock, auditMetadata: fixtureRequestMetadata() },
        ),
        'changed',
      );
      assert.equal(
        (await database.userAccount.findUniqueOrThrow({ where: { id: Number(normalUser.id) } }))
          .updatedBy,
        actorIdForAccount(Number(normalUser.id)),
      );
      const ownPasswordEvent = (
        await catalog.query<{
          actor_id: number;
          target_actor_id: number;
          actor_role: string;
          action: string;
        }>(`
          SELECT actor_id,target_actor_id,actor_role_snapshot actor_role,action
            FROM audit_events WHERE action='password_changed' ORDER BY id DESC LIMIT 1`)
      ).rows[0];
      assert.deepEqual(ownPasswordEvent, {
        actor_id: actorIdForAccount(Number(normalUser.id)),
        target_actor_id: actorIdForAccount(Number(normalUser.id)),
        actor_role: 'Administrator',
        action: 'password_changed',
      });
      assert.equal(await validateSessionClaims(normalClaims, { database, now: clock }), null);
      const replacementLogin = await authenticateCredentials(
        { username: 'KHelmy', password: replacementPassword },
        { database, now: clock, auditMetadata: fixtureRequestMetadata() },
      );
      assert.ok(replacementLogin);
      assert.equal(replacementLogin.mustChangePassword, false);
      const replacementClaims = createSessionClaims(replacementLogin);

      const secondaryAdministratorPassword = `${temporaryPassword}-secondary`;
      await setApprovedAccountPassword('MHussien', secondaryAdministratorPassword, {
        database: migrationDatabase,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      const secondaryAdministrator = await migrationDatabase.userAccount.findUniqueOrThrow({
        where: { usernameNormalized: 'mhussien' },
      });
      await withMaintenanceContext(migrationDatabase, (transaction) =>
        transaction.userAccount.update({
          where: { id: secondaryAdministrator.id },
          data: { roleCode: 'Administrator', sessionVersion: { increment: 1 }, updatedAt: clock },
        }),
      );

      const beforeDisable = await database.userAccount.findUniqueOrThrow({
        where: { id: Number(replacementLogin.id) },
      });
      await withMaintenanceContext(migrationDatabase, (transaction) =>
        transaction.userAccount.update({
          where: { id: beforeDisable.id },
          data: {
            isEnabled: false,
            failedLoginAttempts: 0,
            lockedUntil: null,
            sessionVersion: { increment: 1 },
            updatedAt: clock,
          },
        }),
      );
      assert.equal(await validateSessionClaims(replacementClaims, { database, now: clock }), null);
      assert.equal(
        await authenticateCredentials(
          { username: 'KHelmy', password: replacementPassword },
          { database, now: clock, auditMetadata: fixtureRequestMetadata() },
        ),
        null,
      );
      assert.equal(
        (await database.person.findUniqueOrThrow({ where: { id: beforeDisable.personId } }))
          .canLogin,
        false,
      );
      const reactivatedAt = new Date(clock.getTime() + 1);
      const reactivatedPasswordHash = await hashPassword(`${temporaryPassword}-reactivated`);
      await withMaintenanceContext(migrationDatabase, async (transaction) => {
        await transaction.userAccount.update({
          where: { id: beforeDisable.id },
          data: {
            isEnabled: true,
            passwordHash: reactivatedPasswordHash,
            mustChangePassword: true,
            passwordChangedAt: reactivatedAt,
            failedLoginAttempts: 0,
            lockedUntil: null,
            sessionVersion: { increment: 1 },
            updatedAt: reactivatedAt,
          },
        });
        await transaction.person.update({
          where: { id: beforeDisable.personId },
          data: { isActive: false, updatedAt: clock },
        });
      });
      assert.equal(
        await authenticateCredentials(
          { username: 'KHelmy', password: replacementPassword },
          { database, now: clock, auditMetadata: fixtureRequestMetadata() },
        ),
        null,
      );
      await withMaintenanceContext(migrationDatabase, (transaction) =>
        transaction.person.update({
          where: { id: beforeDisable.personId },
          data: { isActive: true, updatedAt: clock },
        }),
      );
      assert.equal(
        (await database.person.findUniqueOrThrow({ where: { id: beforeDisable.personId } }))
          .canLogin,
        true,
      );

      const nonInteractive = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'scripts/auth-set-password.ts', 'KHelmy'],
        {
          cwd: process.cwd(),
          env: { ...process.env, MIGRATION_DATABASE_URL: fixtureUrl.toString() },
          input: '',
          encoding: 'utf8',
        },
      );
      assert.equal(nonInteractive.status, 1);
      assert.match(nonInteractive.stderr, /طرفية تفاعلية/u);

      await proveStructureMutation(
        catalog,
        'weakened role CHECK',
        `ALTER TABLE user_accounts DROP CONSTRAINT user_accounts_role_code_shape;
         ALTER TABLE user_accounts ADD CONSTRAINT user_accounts_role_code_shape CHECK(role_code <> '');`,
        /constraint user_accounts_role_code_shape/u,
      );
      await proveStructureMutation(
        catalog,
        'wrong foreign-key action',
        `ALTER TABLE user_accounts DROP CONSTRAINT user_accounts_person_id_fkey;
         ALTER TABLE user_accounts ADD CONSTRAINT user_accounts_person_id_fkey
           FOREIGN KEY(person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE CASCADE;`,
        /user_accounts_person_id_fkey/u,
      );
      await proveStructureMutation(
        catalog,
        'non-unique username index',
        `ALTER TABLE user_accounts DROP CONSTRAINT user_accounts_username_normalized_key;
         CREATE INDEX user_accounts_username_normalized_key ON user_accounts(username_normalized);`,
        /index user_accounts_username_normalized_key/u,
      );
      await proveStructureMutation(
        catalog,
        'permissive diagnostic-retaining function',
        `CREATE OR REPLACE FUNCTION guard_user_account_security() RETURNS trigger
           LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
         BEGIN
           PERFORM 'Password changes and account disabling must invalidate sessions';
           RETURN NEW;
         END; $$;`,
        /function guard_user_account_security/u,
      );
      await proveStructureMutation(
        catalog,
        'function configuration change',
        `ALTER FUNCTION guard_user_account_security() SET search_path=public;`,
        /function guard_user_account_security/u,
      );
      await proveStructureMutation(
        catalog,
        'trigger retargeted to permissive function',
        `CREATE FUNCTION fixture_permissive_auth_guard() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN RETURN NEW; END; $$;
         DROP TRIGGER user_accounts_security_guard ON user_accounts;
         CREATE TRIGGER user_accounts_security_guard BEFORE UPDATE OF person_id,password_hash,
           is_enabled,failed_login_attempts,locked_until,session_version ON user_accounts
           FOR EACH ROW EXECUTE FUNCTION fixture_permissive_auth_guard();`,
        /trigger user_accounts_security_guard/u,
      );

      assert.deepEqual(await authStructureFailures(catalog), []);
      assert.deepEqual(await authDataFailures(catalog), []);
      assert.deepEqual(await auditEventStructureFailures(catalog), []);
      assert.deepEqual(await auditEventDataFailures(catalog), []);
      const eventSummary = await catalog.query<{ action: string; count: string }>(`
        SELECT action,count(*)::text count FROM audit_events
         GROUP BY action ORDER BY action`);
      for (const action of [
        'account_locked',
        'login_failed',
        'login_succeeded',
        'password_changed',
        'password_initialized',
        'password_reset',
      ]) {
        assert.ok(eventSummary.rows.some((row) => row.action === action && Number(row.count) > 0));
      }
      const completeTrail = (
        await catalog.query<{ trail: string }>(`
          SELECT string_agg(to_jsonb(e)::text,E'\\n' ORDER BY id) trail FROM audit_events e`)
      ).rows[0]!.trail;
      for (const forbidden of [
        temporaryPassword,
        replacementPassword,
        initialized.passwordHash,
        'task33b_auth_token_sentinel',
        'task33b_cookie_sentinel',
        'task33b_connection_sentinel',
      ]) {
        assert.ok(forbidden);
        assert.equal(completeTrail.includes(forbidden), false);
      }
      console.log('PASS Task 3.1 authentication fixture and negative tests');
      console.log('PASS exact four identities; two native people; Ihab person 4; Samy person 5');
      console.log(
        'PASS Argon2id, lockout concurrency, forced change, absolute sessions, invalidation',
      );
      console.log('PASS authentication application operations use litigation_runtime');
      console.log('PASS exact PostgreSQL constraints, indexes, triggers and functions');
      console.log(
        'PASS login success/failure/unknown/lockout and password initialize/reset/change events',
      );
      console.log(
        'PASS proxy trust defaults off and no password/hash/token/cookie/URL sentinel leaks',
      );
    } finally {
      await runtimeProbe.end();
      await catalog.end();
      await migrationDatabase.$disconnect();
      await database.$disconnect();
    }
  } finally {
    if (created) {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`,
        [fixtureName],
      );
      await admin.query(`DROP DATABASE ${identifier(fixtureName)}`);
    }
    await admin.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
