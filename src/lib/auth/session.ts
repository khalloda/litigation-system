import type { PrismaClient } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import {
  isAuthRole,
  NORMAL_SESSION_SECONDS,
  REMEMBERED_SESSION_SECONDS,
  type AuthRole,
} from './constants';
import type { AuthenticatedUser } from './service';

export type SessionClaims = {
  userId: number;
  personId: number;
  username: string;
  displayName: string;
  role: AuthRole;
  sessionVersion: number;
  mustChangePassword: boolean;
  authenticatedAt: number;
  absoluteExpiresAt: number;
  remembered: boolean;
};

export function createSessionClaims(user: AuthenticatedUser): SessionClaims {
  const duration = user.rememberSession ? REMEMBERED_SESSION_SECONDS : NORMAL_SESSION_SECONDS;
  return {
    userId: Number(user.id),
    personId: user.personId,
    username: user.username,
    displayName: user.name,
    role: user.role,
    sessionVersion: user.sessionVersion,
    mustChangePassword: user.mustChangePassword,
    authenticatedAt: user.authenticatedAt,
    absoluteExpiresAt: user.authenticatedAt + duration * 1_000,
    remembered: user.rememberSession,
  };
}

export function readSessionClaims(value: Record<string, unknown>): SessionClaims | null {
  const role = value['role'];
  const claims: SessionClaims = {
    userId: Number(value['userId']),
    personId: Number(value['personId']),
    username: typeof value['username'] === 'string' ? value['username'] : '',
    displayName: typeof value['displayName'] === 'string' ? value['displayName'] : '',
    role: typeof role === 'string' && isAuthRole(role) ? role : 'Lawyer',
    sessionVersion: Number(value['sessionVersion']),
    mustChangePassword: value['mustChangePassword'] === true,
    authenticatedAt: Number(value['authenticatedAt']),
    absoluteExpiresAt: Number(value['absoluteExpiresAt']),
    remembered: value['remembered'] === true,
  };
  const expectedDuration = claims.remembered
    ? REMEMBERED_SESSION_SECONDS * 1_000
    : NORMAL_SESSION_SECONDS * 1_000;
  if (
    !Number.isSafeInteger(claims.userId) ||
    claims.userId < 1 ||
    !Number.isSafeInteger(claims.personId) ||
    claims.personId < 1 ||
    !Number.isSafeInteger(claims.sessionVersion) ||
    claims.sessionVersion < 0 ||
    !Number.isSafeInteger(claims.authenticatedAt) ||
    !Number.isSafeInteger(claims.absoluteExpiresAt) ||
    claims.username.length === 0 ||
    claims.displayName.length === 0 ||
    typeof role !== 'string' ||
    !isAuthRole(role) ||
    claims.absoluteExpiresAt - claims.authenticatedAt !== expectedDuration
  ) {
    return null;
  }
  return claims;
}

export async function validateSessionClaims(
  value: Record<string, unknown>,
  options: { database?: PrismaClient; now?: Date } = {},
): Promise<SessionClaims | null> {
  const claims = readSessionClaims(value);
  const now = options.now ?? new Date();
  if (
    !claims ||
    claims.authenticatedAt > now.getTime() + 60_000 ||
    claims.absoluteExpiresAt <= now.getTime()
  ) {
    return null;
  }

  const database = options.database ?? db;
  const account = await database.userAccount.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      personId: true,
      username: true,
      roleCode: true,
      isEnabled: true,
      mustChangePassword: true,
      sessionVersion: true,
      passwordHash: true,
      person: { select: { nameAr: true, isActive: true, canLogin: true } },
    },
  });
  if (
    !account ||
    !account.isEnabled ||
    !account.passwordHash ||
    !account.person.isActive ||
    !account.person.canLogin ||
    account.personId !== claims.personId ||
    account.sessionVersion !== claims.sessionVersion ||
    !isAuthRole(account.roleCode)
  ) {
    return null;
  }

  return {
    ...claims,
    username: account.username,
    displayName: account.person.nameAr,
    role: account.roleCode,
    mustChangePassword: account.mustChangePassword,
  };
}
