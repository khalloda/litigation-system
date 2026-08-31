import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import {
  APPROVED_INITIAL_USERNAMES,
  LOCKOUT_FAILURES,
  LOCKOUT_MINUTES,
  normalizeUsername,
  type AuthRole,
  isAuthRole,
} from './constants';
import {
  hashPassword,
  isApprovedArgon2idHash,
  passwordMeetsPolicy,
  performDummyPasswordVerification,
  verifyPassword,
} from './password';

type AccountRow = {
  id: number;
  personId: number;
  username: string;
  passwordHash: string | null;
  roleCode: string;
  isEnabled: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  sessionVersion: number;
  displayName: string;
  personActive: boolean;
  personCanLogin: boolean;
};

export type AuthenticatedUser = {
  id: string;
  personId: number;
  username: string;
  name: string;
  role: AuthRole;
  mustChangePassword: boolean;
  sessionVersion: number;
  rememberSession: boolean;
  authenticatedAt: number;
};

type AuthenticationDependencies = {
  database?: PrismaClient;
  now?: Date;
  verify?: typeof verifyPassword;
  dummyVerify?: typeof performDummyPasswordVerification;
};

const approvedNormalizedUsernames = new Set(
  APPROVED_INITIAL_USERNAMES.map((username) => normalizeUsername(username)),
);

async function withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const databaseCode =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        typeof error.meta === 'object' &&
        error.meta !== null &&
        'code' in error.meta
          ? String(error.meta.code)
          : '';
      const message = error instanceof Error ? error.message : '';
      if (
        attempt < 10 &&
        ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') ||
          databaseCode === '40001' ||
          message.includes('Code: `40001`'))
      ) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 5));
        continue;
      }
      throw error;
    }
  }
  throw new Error('serializable transaction retry exhausted');
}

async function lockedAccount(
  tx: Prisma.TransactionClient,
  usernameNormalized: string,
): Promise<AccountRow | undefined> {
  const rows = await tx.$queryRaw<AccountRow[]>(Prisma.sql`
    SELECT u.id,
           u.person_id AS "personId",
           u.username,
           u.password_hash AS "passwordHash",
           u.role_code AS "roleCode",
           u.is_enabled AS "isEnabled",
           u.must_change_password AS "mustChangePassword",
           u.failed_login_attempts AS "failedLoginAttempts",
           u.locked_until AS "lockedUntil",
           u.session_version AS "sessionVersion",
           p.name_ar AS "displayName",
           p.is_active AS "personActive",
           p.can_login AS "personCanLogin"
      FROM user_accounts u
      JOIN people p ON p.id = u.person_id
     WHERE u.username_normalized = ${usernameNormalized}
     FOR UPDATE OF u
  `);
  return rows[0];
}

function rememberRequested(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

export async function authenticateCredentials(
  credentials: Partial<Record<'username' | 'password' | 'rememberMe', unknown>> | undefined,
  dependencies: AuthenticationDependencies = {},
): Promise<AuthenticatedUser | null> {
  const database = dependencies.database ?? db;
  const now = dependencies.now ?? new Date();
  const verify = dependencies.verify ?? verifyPassword;
  const dummyVerify = dependencies.dummyVerify ?? performDummyPasswordVerification;
  const username = typeof credentials?.username === 'string' ? credentials.username : '';
  const password = typeof credentials?.password === 'string' ? credentials.password : '';
  const usernameNormalized = normalizeUsername(username);

  if (usernameNormalized.length < 3 || usernameNormalized.length > 64) {
    await dummyVerify(password);
    return null;
  }

  return withSerializableRetry(() =>
    database.$transaction(
      async (tx) => {
        const account = await lockedAccount(tx, usernameNormalized);
        if (!account) {
          await dummyVerify(password);
          return null;
        }

        const hashUsable =
          account.passwordHash !== null && isApprovedArgon2idHash(account.passwordHash);
        const passwordCorrect = hashUsable
          ? await verify(account.passwordHash!, password)
          : await dummyVerify(password).then(() => false);

        if (account.lockedUntil && account.lockedUntil.getTime() > now.getTime()) return null;

        const priorFailures = account.lockedUntil ? 0 : account.failedLoginAttempts;
        if (!isAuthRole(account.roleCode)) return null;
        const eligible =
          account.isEnabled && account.personActive && account.personCanLogin && hashUsable;
        if (!eligible) return null;

        if (!passwordCorrect) {
          const failures = Math.min(priorFailures + 1, LOCKOUT_FAILURES);
          await tx.userAccount.update({
            where: { id: account.id },
            data: {
              failedLoginAttempts: failures,
              lockedUntil:
                failures === LOCKOUT_FAILURES
                  ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000)
                  : null,
              updatedAt: now,
            },
          });
          return null;
        }

        await tx.userAccount.update({
          where: { id: account.id },
          data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now },
        });
        return {
          id: String(account.id),
          personId: account.personId,
          username: account.username,
          name: account.displayName,
          role: account.roleCode,
          mustChangePassword: account.mustChangePassword,
          sessionVersion: account.sessionVersion,
          rememberSession: rememberRequested(credentials?.rememberMe),
          authenticatedAt: now.getTime(),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 30_000,
      },
    ),
  );
}

export type PasswordChangeResult =
  'changed' | 'invalid-current' | 'invalid-session' | 'policy' | 'reused';

export async function changeOwnPassword(
  input: {
    accountId: number;
    sessionVersion: number;
    currentPassword: string;
    newPassword: string;
  },
  dependencies: Pick<AuthenticationDependencies, 'database' | 'now' | 'verify'> = {},
): Promise<PasswordChangeResult> {
  if (!passwordMeetsPolicy(input.newPassword)) return 'policy';
  if (input.currentPassword === input.newPassword) return 'reused';

  const database = dependencies.database ?? db;
  const now = dependencies.now ?? new Date();
  const verify = dependencies.verify ?? verifyPassword;

  return withSerializableRetry(() =>
    database.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<AccountRow[]>(Prisma.sql`
          SELECT u.id,
                 u.person_id AS "personId",
                 u.username,
                 u.password_hash AS "passwordHash",
                 u.role_code AS "roleCode",
                 u.is_enabled AS "isEnabled",
                 u.must_change_password AS "mustChangePassword",
                 u.failed_login_attempts AS "failedLoginAttempts",
                 u.locked_until AS "lockedUntil",
                 u.session_version AS "sessionVersion",
                 p.name_ar AS "displayName",
                 p.is_active AS "personActive",
                 p.can_login AS "personCanLogin"
            FROM user_accounts u JOIN people p ON p.id=u.person_id
           WHERE u.id=${input.accountId}
           FOR UPDATE OF u
        `);
        const account = rows[0];
        if (
          !account ||
          !account.isEnabled ||
          !account.personActive ||
          !account.personCanLogin ||
          account.sessionVersion !== input.sessionVersion ||
          !account.passwordHash
        ) {
          return 'invalid-session';
        }
        if (!(await verify(account.passwordHash, input.currentPassword))) return 'invalid-current';

        const passwordHash = await hashPassword(input.newPassword);
        await tx.userAccount.update({
          where: { id: account.id },
          data: {
            passwordHash,
            mustChangePassword: false,
            passwordChangedAt: now,
            failedLoginAttempts: 0,
            lockedUntil: null,
            sessionVersion: { increment: 1 },
            updatedAt: now,
          },
        });
        return 'changed';
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 30_000,
      },
    ),
  );
}

export async function setApprovedAccountPassword(
  username: string,
  password: string,
  dependencies: Pick<AuthenticationDependencies, 'database' | 'now'> = {},
): Promise<{ username: string; personName: string }> {
  const usernameNormalized = normalizeUsername(username);
  if (!approvedNormalizedUsernames.has(usernameNormalized))
    throw new Error('approved-account-required');
  if (!passwordMeetsPolicy(password)) throw new Error('password-policy');

  const database = dependencies.database ?? db;
  const now = dependencies.now ?? new Date();
  const passwordHash = await hashPassword(password);

  return withSerializableRetry(() =>
    database.$transaction(
      async (tx) => {
        const account = await lockedAccount(tx, usernameNormalized);
        if (!account) throw new Error('approved-account-not-found');
        await tx.userAccount.update({
          where: { id: account.id },
          data: {
            passwordHash,
            mustChangePassword: true,
            passwordChangedAt: now,
            failedLoginAttempts: 0,
            lockedUntil: null,
            sessionVersion: { increment: 1 },
            updatedAt: now,
          },
        });
        return { username: account.username, personName: account.displayName };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 30_000,
      },
    ),
  );
}
