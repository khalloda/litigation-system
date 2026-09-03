import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { setHumanAuditContext, setMigrationAuditContext } from '../src/lib/audit';
import {
  createMaintenanceAuditMetadata,
  createRequestAuditMetadata,
} from '../src/lib/audit-metadata';
import { setApprovedAccountPassword } from '../src/lib/auth/service';
import {
  changeManagedRole,
  correctManagedUsername,
  createManagedAccount,
  disableManagedAccount,
  listUserManagementSnapshot,
  reactivateManagedAccount,
  resetManagedPassword,
  UserManagementError,
} from '../src/lib/auth/user-management';
import { createDatabaseClient } from '../src/lib/db';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { auditDataFailures, auditStructureFailures } from './lib/audit-structure';
import { authDataFailures, authStructureFailures } from './lib/auth-structure';
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

function fixtureRuntimeUrl(ownerUrl: URL): URL {
  const configured = process.env['DATABASE_URL'];
  assert.ok(configured, 'DATABASE_URL is required');
  const runtime = new URL(configured);
  assert.equal(runtime.username, 'litigation_runtime');
  runtime.protocol = ownerUrl.protocol;
  runtime.hostname = ownerUrl.hostname;
  runtime.port = ownerUrl.port;
  runtime.pathname = ownerUrl.pathname;
  return runtime;
}

function temporaryPassword(): string {
  return `Task34-${randomBytes(12).toString('base64url')}`;
}

function requestMetadata() {
  return createRequestAuditMetadata(
    new Request('http://localhost/users', {
      headers: {
        'user-agent': 'Task 3.4 disposable user-management fixture',
        'x-actor-id': '999999',
        'x-user-role': 'Administrator',
      },
    }),
  );
}

async function withMigrationContext<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return database.$transaction(async (transaction) => {
    await setMigrationAuditContext(transaction, createMaintenanceAuditMetadata());
    return operation(transaction);
  });
}

async function addPerson(
  database: PrismaClient,
  input: { name: string; staff?: boolean; active?: boolean; primaryAlias?: boolean },
): Promise<number> {
  return withMigrationContext(database, async (transaction) => {
    const person = await transaction.person.create({
      data: {
        nameAr: input.name,
        isStaff: input.staff ?? true,
        isActive: input.active ?? true,
        isApplicationNative: true,
      },
      select: { id: true },
    });
    if (input.primaryAlias ?? true) {
      await transaction.personNameAlias.create({
        data: { personId: person.id, aliasAr: input.name, isPrimary: true },
      });
    }
    return person.id;
  });
}

async function expectManagementError(
  operation: Promise<unknown>,
  code: UserManagementError['code'],
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof UserManagementError);
    assert.equal(error.code, code);
    return true;
  });
}

async function eventCount(database: Client): Promise<number> {
  return Number(
    (await database.query<{ count: string }>('SELECT count(*)::text count FROM audit_events'))
      .rows[0]!.count,
  );
}

async function main(): Promise<void> {
  const source = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(source, 'MIGRATION_DATABASE_URL is required');
  const parsed = new URL(source);
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname));
  assert.equal(parsed.port, '5433');
  const fixtureName = `litigation_task34_fixture_${process.pid}_${Date.now()}`;
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

    const runtime = createDatabaseClient(runtimeUrl.toString());
    const owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: fixtureUrl.toString() }),
    });
    const catalog = new Client({ connectionString: fixtureUrl.toString() });
    const runtimeProbe = new Client({ connectionString: runtimeUrl.toString() });
    await catalog.connect();
    await runtimeProbe.connect();
    try {
      assert.deepEqual(await authStructureFailures(catalog), []);
      assert.deepEqual(await authDataFailures(catalog), []);
      assert.deepEqual(await auditStructureFailures(catalog), []);
      assert.deepEqual(await auditDataFailures(catalog), []);
      assert.deepEqual(await auditEventStructureFailures(catalog), []);
      assert.deepEqual(await auditEventDataFailures(catalog), []);

      const administrator = await owner.userAccount.findFirstOrThrow({
        where: { username: 'KHelmy' },
        select: { id: true, sessionVersion: true },
      });
      const secondAccount = await owner.userAccount.findFirstOrThrow({
        where: { username: 'MHussien' },
        select: { id: true, sessionVersion: true },
      });
      const originalOther = await owner.userAccount.findFirstOrThrow({
        where: { username: 'IHamdy' },
        select: { id: true, sessionVersion: true },
      });

      await setApprovedAccountPassword('KHelmy', temporaryPassword(), {
        database: owner,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      await setApprovedAccountPassword('MHussien', temporaryPassword(), {
        database: owner,
        auditMetadata: createMaintenanceAuditMetadata(),
      });

      const eligibleId = await addPerson(owner, { name: '__TASK34_ELIGIBLE_STAFF__' });
      const rollbackId = await addPerson(owner, { name: '__TASK34_ROLLBACK_STAFF__' });
      const inactiveId = await addPerson(owner, {
        name: '__TASK34_INACTIVE_STAFF__',
        active: false,
      });
      const externalId = await addPerson(owner, {
        name: '__TASK34_EXTERNAL_PERSON__',
        staff: false,
      });
      const ambiguousId = await addPerson(owner, {
        name: '__TASK34_AMBIGUOUS_STAFF__',
        primaryAlias: false,
      });
      const mismatchedAliasId = await addPerson(owner, {
        name: '__TASK34_MISMATCHED_ALIAS_STAFF__',
        primaryAlias: false,
      });
      await withMigrationContext(owner, (transaction) =>
        transaction.personNameAlias.create({
          data: {
            personId: mismatchedAliasId,
            aliasAr: '__TASK34_DIFFERENT_PRIMARY_ALIAS__',
            isPrimary: true,
          },
        }),
      );

      const snapshot = await listUserManagementSnapshot(runtime);
      assert.ok(snapshot.accounts.every((account) => typeof account.personName === 'string'));
      assert.ok(snapshot.eligibleStaff.some((person) => person.id === eligibleId));
      assert.ok(!snapshot.eligibleStaff.some((person) => person.id === inactiveId));
      assert.ok(!snapshot.eligibleStaff.some((person) => person.id === externalId));
      assert.ok(!snapshot.eligibleStaff.some((person) => person.id === ambiguousId));
      assert.ok(!snapshot.eligibleStaff.some((person) => person.id === mismatchedAliasId));

      const directPrivileges = (
        await catalog.query<{
          insert_ok: boolean;
          delete_ok: boolean;
          truncate_ok: boolean;
          actor_select_ok: boolean;
        }>(`
          SELECT has_table_privilege('litigation_runtime','public.user_accounts','INSERT') insert_ok,
                 has_table_privilege('litigation_runtime','public.user_accounts','DELETE') delete_ok,
                 has_table_privilege('litigation_runtime','public.user_accounts','TRUNCATE') truncate_ok,
                 has_table_privilege('litigation_runtime','public.audit_actors','SELECT') actor_select_ok`)
      ).rows[0]!;
      assert.deepEqual(directPrivileges, {
        insert_ok: false,
        delete_ok: false,
        truncate_ok: false,
        actor_select_ok: false,
      });
      await assert.rejects(
        runtimeProbe.query(
          "INSERT INTO user_accounts(person_id,username,username_normalized,role_code,updated_at) VALUES(1,'Nope','nope','Lawyer',CURRENT_TIMESTAMP)",
        ),
        /permission denied/u,
      );
      await assert.rejects(
        runtimeProbe.query('DELETE FROM user_accounts WHERE id=-1'),
        /permission denied/u,
      );
      await assert.rejects(runtimeProbe.query('TRUNCATE user_accounts'), /permission denied/u);

      const firstPassword = temporaryPassword();
      const createdAccountId = await createManagedAccount(
        administrator.id,
        {
          personId: eligibleId,
          username: 'Task34User',
          role: 'Lawyer',
          temporaryPassword: firstPassword,
        },
        { database: runtime, auditMetadata: requestMetadata() },
      );
      const createdAccount = await owner.userAccount.findUniqueOrThrow({
        where: { id: createdAccountId },
      });
      const createdActor = await owner.auditActor.findUniqueOrThrow({
        where: { userAccountId: createdAccountId },
      });
      assert.ok(createdActor.id >= 2000);
      assert.notEqual(createdActor.id, 1000 + createdAccountId);
      assert.equal(createdAccount.mustChangePassword, true);
      assert.equal(createdAccount.isEnabled, true);
      assert.ok(createdAccount.passwordHash);
      assert.notEqual(createdAccount.passwordHash, firstPassword);
      assert.deepEqual(
        (
          await catalog.query<{ action: string }>(
            `SELECT action FROM audit_events
              WHERE target_actor_id=$1 AND action IN ('account_created','password_initialized')
              ORDER BY id`,
            [createdActor.id],
          )
        ).rows.map((row) => row.action),
        ['account_created', 'password_initialized'],
      );
      assert.equal(
        (
          await catalog.query<{ count: string }>(
            'SELECT count(*)::text count FROM audit_events WHERE to_jsonb(audit_events)::text LIKE $1',
            [`%${firstPassword}%`],
          )
        ).rows[0]!.count,
        '0',
      );

      const afterCreateEvents = await eventCount(catalog);
      await assert.rejects(
        createManagedAccount(
          administrator.id,
          {
            personId: inactiveId,
            username: 'InactiveUser',
            role: 'Lawyer',
            temporaryPassword: temporaryPassword(),
          },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
        /target must be an existing active staff person/iu,
      );
      for (const [personId, username] of [
        [externalId, 'ExternalUser'],
        [ambiguousId, 'AmbiguousUser'],
        [999999, 'MissingUser'],
        [eligibleId, 'AlreadyLinked'],
      ] as const) {
        await assert.rejects(
          createManagedAccount(
            administrator.id,
            {
              personId,
              username,
              role: 'Lawyer',
              temporaryPassword: temporaryPassword(),
            },
            { database: runtime, auditMetadata: requestMetadata() },
          ),
        );
      }
      await assert.rejects(
        createManagedAccount(
          administrator.id,
          {
            personId: rollbackId,
            username: 'task34user',
            role: 'Lawyer',
            temporaryPassword: temporaryPassword(),
          },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
      );
      await expectManagementError(
        createManagedAccount(
          administrator.id,
          {
            personId: rollbackId,
            username: 'bad name',
            role: 'Lawyer',
            temporaryPassword: temporaryPassword(),
          },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
        'invalid-input',
      );
      await expectManagementError(
        createManagedAccount(
          administrator.id,
          {
            personId: rollbackId,
            username: 'AnotherUser',
            role: 'Lawyer',
            temporaryPassword: 'short',
          },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
        'password-policy',
      );
      assert.equal(await eventCount(catalog), afterCreateEvents);

      const beforeUsernameVersion = createdAccount.sessionVersion;
      await correctManagedUsername(
        administrator.id,
        {
          accountId: createdAccountId,
          expectedSessionVersion: beforeUsernameVersion,
          username: 'CorrectedUser',
        },
        { database: runtime, auditMetadata: requestMetadata() },
      );
      let current = await owner.userAccount.findUniqueOrThrow({ where: { id: createdAccountId } });
      assert.equal(current.username, 'CorrectedUser');
      assert.equal(current.usernameNormalized, 'correcteduser');
      assert.equal(current.sessionVersion, beforeUsernameVersion + 1);
      assert.equal(
        await owner.auditEvent.count({
          where: { targetActorId: createdActor.id, action: 'username_changed' },
        }),
        1,
      );
      await expectManagementError(
        correctManagedUsername(
          administrator.id,
          {
            accountId: createdAccountId,
            expectedSessionVersion: beforeUsernameVersion,
            username: 'StaleUser',
          },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
        'stale',
      );
      await expectManagementError(
        correctManagedUsername(
          administrator.id,
          {
            accountId: createdAccountId,
            expectedSessionVersion: current.sessionVersion,
            username: current.username,
          },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
        'no-op',
      );

      await changeManagedRole(
        administrator.id,
        {
          accountId: createdAccountId,
          expectedSessionVersion: current.sessionVersion,
          role: 'Paralegal',
        },
        { database: runtime, auditMetadata: requestMetadata() },
      );
      current = await owner.userAccount.findUniqueOrThrow({ where: { id: createdAccountId } });
      assert.equal(current.roleCode, 'Paralegal');
      assert.equal(
        await owner.auditEvent.count({
          where: { targetActorId: createdActor.id, action: 'role_changed' },
        }),
        1,
      );

      await withMigrationContext(owner, (transaction) =>
        transaction.userAccount.update({
          where: { id: createdAccountId },
          data: {
            failedLoginAttempts: 5,
            lockedUntil: new Date(Date.now() + 60_000),
          },
        }),
      );
      current = await owner.userAccount.findUniqueOrThrow({ where: { id: createdAccountId } });
      await disableManagedAccount(
        administrator.id,
        { accountId: createdAccountId, expectedSessionVersion: current.sessionVersion },
        { database: runtime, auditMetadata: requestMetadata() },
      );
      current = await owner.userAccount.findUniqueOrThrow({ where: { id: createdAccountId } });
      assert.equal(current.isEnabled, false);
      assert.equal(current.failedLoginAttempts, 0);
      assert.equal(current.lockedUntil, null);
      assert.equal(
        await owner.auditEvent.count({
          where: { targetActorId: createdActor.id, action: 'account_disabled' },
        }),
        1,
      );

      const reactivationPassword = temporaryPassword();
      await reactivateManagedAccount(
        administrator.id,
        {
          accountId: createdAccountId,
          expectedSessionVersion: current.sessionVersion,
          temporaryPassword: reactivationPassword,
        },
        { database: runtime, auditMetadata: requestMetadata() },
      );
      current = await owner.userAccount.findUniqueOrThrow({ where: { id: createdAccountId } });
      assert.equal(current.isEnabled, true);
      assert.equal(current.mustChangePassword, true);
      assert.notEqual(current.passwordHash, reactivationPassword);
      assert.deepEqual(
        (
          await catalog.query<{ action: string }>(
            `SELECT action FROM audit_events
              WHERE target_actor_id=$1 AND action IN ('account_enabled','password_reset')
              ORDER BY id DESC LIMIT 2`,
            [createdActor.id],
          )
        ).rows
          .map((row) => row.action)
          .reverse(),
        ['account_enabled', 'password_reset'],
      );

      const resetPassword = temporaryPassword();
      await resetManagedPassword(
        administrator.id,
        {
          accountId: createdAccountId,
          expectedSessionVersion: current.sessionVersion,
          temporaryPassword: resetPassword,
        },
        { database: runtime, auditMetadata: requestMetadata() },
      );
      const resetEvent = (
        await catalog.query<{ actor_id: number; target_actor_id: number }>(
          `SELECT actor_id,target_actor_id FROM audit_events
            WHERE action='password_reset' AND target_actor_id=$1 ORDER BY id DESC LIMIT 1`,
          [createdActor.id],
        )
      ).rows[0]!;
      const administratorActor = await owner.auditActor.findUniqueOrThrow({
        where: { userAccountId: administrator.id },
        select: { id: true },
      });
      assert.deepEqual(resetEvent, {
        actor_id: administratorActor.id,
        target_actor_id: createdActor.id,
      });

      const originalBeforeInitialization = await owner.userAccount.findUniqueOrThrow({
        where: { id: originalOther.id },
      });
      assert.equal(originalBeforeInitialization.passwordHash, null);
      await resetManagedPassword(
        administrator.id,
        {
          accountId: originalOther.id,
          expectedSessionVersion: originalBeforeInitialization.sessionVersion,
          temporaryPassword: temporaryPassword(),
        },
        { database: runtime, auditMetadata: requestMetadata() },
      );
      assert.equal(
        await owner.auditEvent.count({
          where: { targetActorId: 1003, action: 'password_initialized' },
        }),
        1,
      );

      const adminCurrent = await owner.userAccount.findUniqueOrThrow({
        where: { id: administrator.id },
      });
      await expectManagementError(
        disableManagedAccount(
          administrator.id,
          { accountId: administrator.id, expectedSessionVersion: adminCurrent.sessionVersion },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
        'self-protected',
      );
      await expectManagementError(
        changeManagedRole(
          administrator.id,
          {
            accountId: administrator.id,
            expectedSessionVersion: adminCurrent.sessionVersion,
            role: 'Lawyer',
          },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
        'self-protected',
      );
      await expectManagementError(
        resetManagedPassword(
          administrator.id,
          {
            accountId: administrator.id,
            expectedSessionVersion: adminCurrent.sessionVersion,
            temporaryPassword: temporaryPassword(),
          },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
        'self-protected',
      );

      const secondCurrent = await owner.userAccount.findUniqueOrThrow({
        where: { id: secondAccount.id },
      });
      await changeManagedRole(
        administrator.id,
        {
          accountId: secondAccount.id,
          expectedSessionVersion: secondCurrent.sessionVersion,
          role: 'Administrator',
        },
        { database: runtime, auditMetadata: requestMetadata() },
      );
      const beforeConcurrent = await owner.userAccount.findMany({
        where: { id: { in: [administrator.id, secondAccount.id] } },
        select: { id: true, sessionVersion: true },
      });
      const byId = new Map(beforeConcurrent.map((account) => [account.id, account.sessionVersion]));
      const concurrent = await Promise.allSettled([
        disableManagedAccount(
          administrator.id,
          { accountId: secondAccount.id, expectedSessionVersion: byId.get(secondAccount.id)! },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
        disableManagedAccount(
          secondAccount.id,
          { accountId: administrator.id, expectedSessionVersion: byId.get(administrator.id)! },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
      ]);
      assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
      const usable = await catalog.query<{ id: number }>(`
        SELECT u.id FROM user_accounts u JOIN people p ON p.id=u.person_id
         WHERE u.role_code='Administrator' AND u.is_enabled AND u.password_hash IS NOT NULL
           AND p.is_active AND p.can_login ORDER BY u.id`);
      assert.equal(usable.rows.length, 1);
      const remainingAdminId = usable.rows[0]!.id;
      const disabledAdminId =
        remainingAdminId === administrator.id ? secondAccount.id : administrator.id;
      const disabledAdmin = await owner.userAccount.findUniqueOrThrow({
        where: { id: disabledAdminId },
      });
      await reactivateManagedAccount(
        remainingAdminId,
        {
          accountId: disabledAdminId,
          expectedSessionVersion: disabledAdmin.sessionVersion,
          temporaryPassword: temporaryPassword(),
        },
        { database: runtime, auditMetadata: requestMetadata() },
      );

      const secondAdmin = await owner.userAccount.findUniqueOrThrow({
        where: { id: secondAccount.id },
      });
      const secondPerson = await owner.person.findUniqueOrThrow({
        where: { id: secondAdmin.personId },
      });
      await owner.$transaction(async (transaction) => {
        await setHumanAuditContext(transaction, administrator.id, requestMetadata());
        await transaction.person.update({
          where: { id: secondPerson.id },
          data: { isActive: false },
        });
      });
      await assert.rejects(
        owner.$transaction(async (transaction) => {
          await setHumanAuditContext(transaction, administrator.id, requestMetadata());
          const adminPerson = await transaction.userAccount.findUniqueOrThrow({
            where: { id: administrator.id },
            select: { personId: true },
          });
          await transaction.person.update({
            where: { id: adminPerson.personId },
            data: { isActive: false },
          });
        }),
        /retain at least one usable Administrator/u,
      );
      await owner.$transaction(async (transaction) => {
        await setHumanAuditContext(transaction, administrator.id, requestMetadata());
        await transaction.person.update({
          where: { id: secondPerson.id },
          data: { isActive: true },
        });
      });

      const originalBeforeRename = await owner.userAccount.findUniqueOrThrow({
        where: { id: originalOther.id },
      });
      await correctManagedUsername(
        administrator.id,
        {
          accountId: originalOther.id,
          expectedSessionVersion: originalBeforeRename.sessionVersion,
          username: 'IHamdyCorrected',
        },
        { database: runtime, auditMetadata: requestMetadata() },
      );
      const localResult = await setApprovedAccountPassword('IHamdyCorrected', temporaryPassword(), {
        database: owner,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      assert.equal(localResult.username, 'IHamdyCorrected');
      await assert.rejects(
        setApprovedAccountPassword('CorrectedUser', temporaryPassword(), {
          database: owner,
          auditMetadata: createMaintenanceAuditMetadata(),
        }),
        /approved-account-required/u,
      );

      await catalog.query(`
        CREATE FUNCTION fixture_refuse_password_initialization()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.action='password_initialized' THEN
            RAISE EXCEPTION 'fixture rejects password initialization';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER fixture_refuse_password_initialization
        BEFORE INSERT ON audit_events FOR EACH ROW
        EXECUTE FUNCTION fixture_refuse_password_initialization();`);
      const rollbackEvents = await eventCount(catalog);
      const rollbackActors = await owner.auditActor.count();
      await assert.rejects(
        createManagedAccount(
          administrator.id,
          {
            personId: rollbackId,
            username: 'RollbackUser',
            role: 'Lawyer',
            temporaryPassword: temporaryPassword(),
          },
          { database: runtime, auditMetadata: requestMetadata() },
        ),
        /fixture rejects password initialization/u,
      );
      assert.equal(await owner.userAccount.count({ where: { personId: rollbackId } }), 0);
      assert.equal(await owner.auditActor.count(), rollbackActors);
      assert.equal(await eventCount(catalog), rollbackEvents);
      await catalog.query(`
        DROP TRIGGER fixture_refuse_password_initialization ON audit_events;
        DROP FUNCTION fixture_refuse_password_initialization();`);

      await owner.$transaction(async (transaction) => {
        await setHumanAuditContext(transaction, administrator.id, requestMetadata());
        await assert.rejects(
          transaction.$queryRaw(Prisma.sql`
            SELECT public.audit_append_semantic_event_for_account(
              'role_changed','succeeded','public','user_accounts',
              ${JSON.stringify({ id: createdAccountId, extra: 1 })}::jsonb,
              ${createdAccountId},NULL,NULL,'{}'::jsonb,NULL,'{}'::jsonb
            )
          `),
          /Account lifecycle actor or shape is invalid/u,
        );
      });

      assert.deepEqual(await authStructureFailures(catalog), []);
      assert.deepEqual(await authDataFailures(catalog), []);
      assert.deepEqual(await auditStructureFailures(catalog), []);
      assert.deepEqual(await auditDataFailures(catalog), []);
      assert.deepEqual(await auditEventStructureFailures(catalog), []);
      assert.deepEqual(await auditEventDataFailures(catalog), []);

      const trail = (
        await catalog.query<{ trail: string }>(
          `SELECT string_agg(to_jsonb(e)::text,E'\n' ORDER BY id) trail FROM audit_events e`,
        )
      ).rows[0]!.trail;
      for (const secret of [firstPassword, reactivationPassword, resetPassword]) {
        assert.equal(trail.includes(secret), false);
      }
      assert.equal(
        await owner.person.count({ where: { id: { in: [eligibleId, rollbackId] } } }),
        2,
      );

      console.log('PASS Task 3.4 account lifecycle disposable database suite');
      console.log(
        'PASS eligible staff selection, account/actor atomicity and non-arithmetic actor IDs',
      );
      console.log('PASS username, role, disable, reactivate and human password-reset semantics');
      console.log(
        'PASS self/last-Administrator, concurrent lockout and future person-deactivation guards',
      );
      console.log(
        'PASS direct runtime INSERT/DELETE/TRUNCATE refusal and complete rollback on event failure',
      );
      console.log('PASS original local command remains identity-bounded after username correction');
      console.log('PASS password values do not enter return values or append-only audit evidence');
    } finally {
      await runtimeProbe.end();
      await catalog.end();
      await owner.$disconnect();
      await runtime.$disconnect();
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
