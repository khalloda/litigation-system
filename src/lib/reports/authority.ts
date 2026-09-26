import type { Session } from 'next-auth';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import {
  AuthorizationError,
  decideAuthorization,
  requireAuthorizedDecision,
  type PermissionRequest,
} from '@/lib/auth/authorization-core';

export function reportSession(
  session: Session | null,
  action: 'run' | 'export',
  permissions: readonly PermissionRequest[],
) {
  requireAuthorizedDecision(decideAuthorization(session, 'reports', action));
  if (
    !session ||
    !(Date.parse(session.expires) > Date.now()) ||
    !/^[1-9]\d*$/u.test(session.user.id) ||
    !Number.isSafeInteger(Number(session.user.id))
  )
    throw new AuthorizationError('unauthenticated');
  for (const permission of permissions)
    requireAuthorizedDecision(decideAuthorization(session, permission.area, permission.action));
  return session;
}
export async function verifyReportAccount(tx: Prisma.TransactionClient, session: Session) {
  const accounts = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT u.id
    FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
    WHERE u.id=${Number(session.user.id)} AND u.person_id=${session.user.personId}
    AND u.role_code=${session.user.role} AND u.session_version=${session.user.sessionVersion}
    AND u.is_enabled AND NOT u.must_change_password AND u.password_hash IS NOT NULL
    AND p.is_active AND p.is_staff AND p.can_login`);
  if (accounts.length !== 1 || !(Date.parse(session.expires) > Date.now()))
    throw new AuthorizationError('unauthenticated');
}
export async function reportSnapshot<T>(
  session: Session | null,
  database: PrismaClient,
  action: 'run' | 'export',
  permissions: readonly PermissionRequest[],
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const current = reportSession(session, action, permissions);
  return database.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      await verifyReportAccount(tx, current);
      return work(tx);
    },
    { isolationLevel: 'RepeatableRead', timeout: 60000 },
  );
}
export async function requireReportAuthority(
  session: Session | null,
  database: PrismaClient,
  action: 'run' | 'export',
  permissions: readonly PermissionRequest[] = [],
) {
  return reportSnapshot(session, database, action, permissions, async () => undefined);
}
