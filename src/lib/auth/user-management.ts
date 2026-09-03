import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import {
  createUserAccountWithActor,
  recordAccountLifecycleEvent,
  recordAdministrationPasswordChange,
  setHumanAuditContext,
} from '@/lib/audit';
import type { AuditRequestMetadata } from '@/lib/audit-metadata';
import { db } from '@/lib/db';
import { isAuthRole, normalizeUsername, type AuthRole } from './constants';
import { hashPassword, passwordMeetsPolicy } from './password';
import { withSerializableRetry } from './service';

export type ManagedAccount = Readonly<{
  id: number;
  personId: number;
  personName: string;
  username: string;
  role: AuthRole;
  isEnabled: boolean;
  mustChangePassword: boolean;
  passwordInitialized: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  isLocked: boolean;
  lastLoginAt: string | null;
  sessionVersion: number;
}>;

export type EligibleStaffPerson = Readonly<{
  id: number;
  name: string;
}>;

export type UserManagementSnapshot = Readonly<{
  accounts: readonly ManagedAccount[];
  eligibleStaff: readonly EligibleStaffPerson[];
}>;

type ManagementDependencies = Readonly<{
  auditMetadata: AuditRequestMetadata;
  database?: PrismaClient;
  now?: Date;
}>;

type LockedAccount = {
  id: number;
  personId: number;
  username: string;
  usernameNormalized: string;
  passwordHash: string | null;
  roleCode: string;
  isEnabled: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
  personActive: boolean;
  personCanLogin: boolean;
};

export type UserManagementErrorCode =
  | 'administrator-required'
  | 'invalid-input'
  | 'invalid-transition'
  | 'no-op'
  | 'not-found'
  | 'password-policy'
  | 'self-protected'
  | 'stale';

export class UserManagementError extends Error {
  constructor(readonly code: UserManagementErrorCode) {
    super(code);
    this.name = 'UserManagementError';
  }
}

function positiveId(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new UserManagementError('invalid-input');
  return value;
}

function validUsername(value: string): string {
  if (value !== value.trim() || !/^[A-Za-z][A-Za-z0-9._-]{2,63}$/u.test(value)) {
    throw new UserManagementError('invalid-input');
  }
  return value;
}

function validRole(value: string): AuthRole {
  if (!isAuthRole(value)) throw new UserManagementError('invalid-input');
  return value;
}

function validTemporaryPassword(value: string): string {
  if (!passwordMeetsPolicy(value)) throw new UserManagementError('password-policy');
  return value;
}

async function lockedManagementAccount(
  transaction: Prisma.TransactionClient,
  accountId: number,
): Promise<LockedAccount> {
  const rows = await transaction.$queryRaw<LockedAccount[]>(Prisma.sql`
    SELECT u.id,
           u.person_id AS "personId",
           u.username,
           u.username_normalized AS "usernameNormalized",
           u.password_hash AS "passwordHash",
           u.role_code AS "roleCode",
           u.is_enabled AS "isEnabled",
           u.must_change_password AS "mustChangePassword",
           u.session_version AS "sessionVersion",
           p.is_active AS "personActive",
           p.can_login AS "personCanLogin"
      FROM public.user_accounts u
      JOIN public.people p ON p.id=u.person_id
     WHERE u.id=${accountId}
     FOR UPDATE OF u
  `);
  const account = rows[0];
  if (!account) throw new UserManagementError('not-found');
  return account;
}

async function lockActingAdministrator(
  transaction: Prisma.TransactionClient,
  actorAccountId: number,
): Promise<LockedAccount> {
  const actor = await lockedManagementAccount(transaction, positiveId(actorAccountId));
  if (
    actor.roleCode !== 'Administrator' ||
    !actor.isEnabled ||
    !actor.passwordHash ||
    !actor.personActive ||
    !actor.personCanLogin
  ) {
    throw new UserManagementError('administrator-required');
  }
  return actor;
}

function requireCurrentVersion(account: LockedAccount, expectedSessionVersion: number): void {
  if (!Number.isSafeInteger(expectedSessionVersion) || expectedSessionVersion < 0) {
    throw new UserManagementError('invalid-input');
  }
  if (account.sessionVersion !== expectedSessionVersion) {
    throw new UserManagementError('stale');
  }
}

function serializable<T>(
  database: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withSerializableRetry(() =>
    database.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 30_000,
    }),
  );
}

export async function listUserManagementSnapshot(
  database: PrismaClient = db,
): Promise<UserManagementSnapshot> {
  const [accounts, eligibleStaff] = await Promise.all([
    database.userAccount.findMany({
      orderBy: [{ person: { nameAr: 'asc' } }, { id: 'asc' }],
      select: {
        id: true,
        personId: true,
        username: true,
        roleCode: true,
        isEnabled: true,
        mustChangePassword: true,
        passwordHash: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        lastLoginAt: true,
        sessionVersion: true,
        person: { select: { nameAr: true } },
      },
    }),
    database.person.findMany({
      where: {
        isStaff: true,
        isActive: true,
        account: null,
      },
      orderBy: [{ nameAr: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nameAr: true,
        aliases: { where: { isPrimary: true }, select: { aliasAr: true } },
      },
    }),
  ]);
  const observedAt = new Date();
  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      personId: account.personId,
      personName: account.person.nameAr,
      username: account.username,
      role: validRole(account.roleCode),
      isEnabled: account.isEnabled,
      mustChangePassword: account.mustChangePassword,
      passwordInitialized: account.passwordHash !== null,
      failedLoginAttempts: account.failedLoginAttempts,
      lockedUntil: account.lockedUntil?.toISOString() ?? null,
      isLocked: account.lockedUntil !== null && account.lockedUntil > observedAt,
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      sessionVersion: account.sessionVersion,
    })),
    eligibleStaff: eligibleStaff
      .filter(
        (person) => person.aliases.length === 1 && person.aliases[0]?.aliasAr === person.nameAr,
      )
      .map((person) => ({ id: person.id, name: person.nameAr })),
  };
}

export async function createManagedAccount(
  actorAccountId: number,
  input: Readonly<{ personId: number; username: string; role: string; temporaryPassword: string }>,
  dependencies: ManagementDependencies,
): Promise<number> {
  const personId = positiveId(input.personId);
  const username = validUsername(input.username);
  const role = validRole(input.role);
  const passwordHash = await hashPassword(validTemporaryPassword(input.temporaryPassword));
  const database = dependencies.database ?? db;

  return serializable(database, async (transaction) => {
    await setHumanAuditContext(transaction, positiveId(actorAccountId), dependencies.auditMetadata);
    await lockActingAdministrator(transaction, actorAccountId);
    const accountId = await createUserAccountWithActor(transaction, {
      personId,
      username,
      passwordHash,
      role,
    });
    await recordAccountLifecycleEvent(transaction, accountId, 'account_created');
    await recordAdministrationPasswordChange(transaction, accountId, 'password_initialized');
    return accountId;
  });
}

export async function correctManagedUsername(
  actorAccountId: number,
  input: Readonly<{ accountId: number; expectedSessionVersion: number; username: string }>,
  dependencies: ManagementDependencies,
): Promise<void> {
  const accountId = positiveId(input.accountId);
  const username = validUsername(input.username);
  const database = dependencies.database ?? db;
  await serializable(database, async (transaction) => {
    await setHumanAuditContext(transaction, positiveId(actorAccountId), dependencies.auditMetadata);
    await lockActingAdministrator(transaction, actorAccountId);
    const target = await lockedManagementAccount(transaction, accountId);
    requireCurrentVersion(target, input.expectedSessionVersion);
    if (target.username === username) throw new UserManagementError('no-op');
    await transaction.userAccount.update({
      where: { id: accountId },
      data: {
        username,
        usernameNormalized: normalizeUsername(username),
        sessionVersion: { increment: 1 },
        updatedAt: dependencies.now ?? new Date(),
      },
    });
    await recordAccountLifecycleEvent(transaction, accountId, 'username_changed');
  });
}

export async function changeManagedRole(
  actorAccountId: number,
  input: Readonly<{ accountId: number; expectedSessionVersion: number; role: string }>,
  dependencies: ManagementDependencies,
): Promise<void> {
  const accountId = positiveId(input.accountId);
  const role = validRole(input.role);
  const database = dependencies.database ?? db;
  await serializable(database, async (transaction) => {
    await setHumanAuditContext(transaction, positiveId(actorAccountId), dependencies.auditMetadata);
    await lockActingAdministrator(transaction, actorAccountId);
    const target = await lockedManagementAccount(transaction, accountId);
    requireCurrentVersion(target, input.expectedSessionVersion);
    if (target.roleCode === role) throw new UserManagementError('no-op');
    if (target.id === actorAccountId && role !== 'Administrator') {
      throw new UserManagementError('self-protected');
    }
    await transaction.userAccount.update({
      where: { id: accountId },
      data: {
        roleCode: role,
        sessionVersion: { increment: 1 },
        updatedAt: dependencies.now ?? new Date(),
      },
    });
    await recordAccountLifecycleEvent(transaction, accountId, 'role_changed');
  });
}

export async function disableManagedAccount(
  actorAccountId: number,
  input: Readonly<{ accountId: number; expectedSessionVersion: number }>,
  dependencies: ManagementDependencies,
): Promise<void> {
  const accountId = positiveId(input.accountId);
  const database = dependencies.database ?? db;
  await serializable(database, async (transaction) => {
    await setHumanAuditContext(transaction, positiveId(actorAccountId), dependencies.auditMetadata);
    await lockActingAdministrator(transaction, actorAccountId);
    const target = await lockedManagementAccount(transaction, accountId);
    requireCurrentVersion(target, input.expectedSessionVersion);
    if (target.id === actorAccountId) throw new UserManagementError('self-protected');
    if (!target.isEnabled) throw new UserManagementError('invalid-transition');
    await transaction.userAccount.update({
      where: { id: accountId },
      data: {
        isEnabled: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        sessionVersion: { increment: 1 },
        updatedAt: dependencies.now ?? new Date(),
      },
    });
    await recordAccountLifecycleEvent(transaction, accountId, 'account_disabled');
  });
}

async function setAdministrativeTemporaryPassword(
  transaction: Prisma.TransactionClient,
  target: LockedAccount,
  passwordHash: string,
  now: Date,
  enable: boolean,
): Promise<void> {
  await transaction.userAccount.update({
    where: { id: target.id },
    data: {
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: now,
      failedLoginAttempts: 0,
      lockedUntil: null,
      isEnabled: enable,
      sessionVersion: { increment: 1 },
      updatedAt: now,
    },
  });
}

export async function reactivateManagedAccount(
  actorAccountId: number,
  input: Readonly<{
    accountId: number;
    expectedSessionVersion: number;
    temporaryPassword: string;
  }>,
  dependencies: ManagementDependencies,
): Promise<void> {
  const accountId = positiveId(input.accountId);
  const passwordHash = await hashPassword(validTemporaryPassword(input.temporaryPassword));
  const database = dependencies.database ?? db;
  const now = dependencies.now ?? new Date();
  await serializable(database, async (transaction) => {
    await setHumanAuditContext(transaction, positiveId(actorAccountId), dependencies.auditMetadata);
    await lockActingAdministrator(transaction, actorAccountId);
    const target = await lockedManagementAccount(transaction, accountId);
    requireCurrentVersion(target, input.expectedSessionVersion);
    if (target.isEnabled) throw new UserManagementError('invalid-transition');
    await setAdministrativeTemporaryPassword(transaction, target, passwordHash, now, true);
    await recordAccountLifecycleEvent(transaction, accountId, 'account_enabled');
    await recordAdministrationPasswordChange(transaction, accountId, 'password_reset');
  });
}

export async function resetManagedPassword(
  actorAccountId: number,
  input: Readonly<{
    accountId: number;
    expectedSessionVersion: number;
    temporaryPassword: string;
  }>,
  dependencies: ManagementDependencies,
): Promise<void> {
  const accountId = positiveId(input.accountId);
  const passwordHash = await hashPassword(validTemporaryPassword(input.temporaryPassword));
  const database = dependencies.database ?? db;
  const now = dependencies.now ?? new Date();
  await serializable(database, async (transaction) => {
    await setHumanAuditContext(transaction, positiveId(actorAccountId), dependencies.auditMetadata);
    await lockActingAdministrator(transaction, actorAccountId);
    const target = await lockedManagementAccount(transaction, accountId);
    requireCurrentVersion(target, input.expectedSessionVersion);
    if (target.id === actorAccountId) throw new UserManagementError('self-protected');
    if (!target.isEnabled) throw new UserManagementError('invalid-transition');
    const semanticAction = target.passwordHash ? 'password_reset' : 'password_initialized';
    await setAdministrativeTemporaryPassword(transaction, target, passwordHash, now, true);
    await recordAdministrationPasswordChange(transaction, accountId, semanticAction);
  });
}
