import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import type { PermissionArea } from './auth/permissions';
import {
  AuthorizationError,
  decideAuthorization,
  requireAuthorizedDecision,
} from './auth/authorization-core';

/** Each panel is a fresh authorized snapshot, never a shared/cacheable result. */
export async function dashboardRead<T>(
  session: Session | null,
  db: PrismaClient,
  areas: PermissionArea[],
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (const area of areas) requireAuthorizedDecision(decideAuthorization(session, area, 'view'));
  if (!session || !(Date.parse(session.expires) > Date.now()))
    throw new AuthorizationError('unauthenticated');
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      const accounts = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT u.id
        FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
        WHERE u.id=${Number(session.user.id)} AND u.person_id=${session.user.personId}
        AND u.role_code=${session.user.role} AND u.session_version=${session.user.sessionVersion}
        AND u.is_enabled AND NOT u.must_change_password AND u.password_hash IS NOT NULL
        AND p.is_active AND p.is_staff AND p.can_login`);
      if (accounts.length !== 1 || !(Date.parse(session.expires) > Date.now()))
        throw new AuthorizationError('unauthenticated');
      return work(tx);
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 },
  );
}
