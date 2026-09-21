import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import {
  AuthorizationError,
  decideAuthorization,
  requireAuthorizedDecision,
} from './auth/authorization-core';
import { cairoDate } from './cairo-date';
import { parseHearingFilters, type HearingRow } from './hearing-query';

export const TODAY_HEARINGS_LIMIT = 25;
export type TodayHearing = Omit<HearingRow, 'attendeeCount'> & { circuit: string | null };

export function todayHearingCountQuery(date: string) {
  return Prisma.sql`SELECT count(*)::int total FROM public.hearings h
    WHERE h.next_hearing_date=${date}::date AND h.is_archived=false`;
}
export function todayHearingRowsQuery(date: string) {
  return Prisma.sql`SELECT h.id,h.legacy_id AS "legacyId",h.matter_id AS "matterId",
    m.case_number_ar AS "caseNumber",m.subject,m.is_archived AS "matterArchived",
    h.is_archived AS "hearingArchived",c.id AS "clientId",c.name_ar AS "clientName",
    c.is_archived AS "clientArchived",h.hearing_date::text AS "hearingDate",
    h.next_hearing_date::text AS "nextHearingDate",ct.label_ar AS court,h.circuit,
    a.label_ar AS action,h.decision
    FROM public.hearings h LEFT JOIN public.matters m ON m.id=h.matter_id
    LEFT JOIN public.clients c ON c.id=m.client_id
    LEFT JOIN public.lookup_court ct ON ct.id=h.court_id
    LEFT JOIN public.lookup_hearing_action a ON a.id=h.action_id
    WHERE h.next_hearing_date=${date}::date AND h.is_archived=false
    ORDER BY h.hearing_date DESC NULLS LAST,h.id DESC LIMIT ${TODAY_HEARINGS_LIMIT}`;
}

/** Clock injection is internal test support; production callers supply no request input. */
export async function readTodayHearings(
  session: Session | null,
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  const authorized = requireAuthorizedDecision(decideAuthorization(session, 'hearings', 'view'));
  if (!(Date.parse(authorized.expires) > Date.now()))
    throw new AuthorizationError('unauthenticated');
  const date = cairoDate(clock());
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      const accounts = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT u.id
      FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
      WHERE u.id=${Number(authorized.user.id)} AND u.person_id=${authorized.user.personId}
      AND u.role_code=${authorized.user.role} AND u.session_version=${authorized.user.sessionVersion}
      AND u.is_enabled AND NOT u.must_change_password AND p.is_active AND p.can_login`);
      if (accounts.length !== 1 || !(Date.parse(authorized.expires) > Date.now()))
        throw new AuthorizationError('unauthenticated');
      const counts = await tx.$queryRaw<{ total: number }[]>(
        Prisma.sql`${todayHearingCountQuery(date)}`,
      );
      const rows = await tx.$queryRaw<TodayHearing[]>(Prisma.sql`${todayHearingRowsQuery(date)}`);
      const total = counts[0]?.total;
      if (
        counts.length !== 1 ||
        total === undefined ||
        rows.length !== Math.min(total, TODAY_HEARINGS_LIMIT) ||
        new Set(rows.map((r) => r.id)).size !== rows.length
      )
        throw new Error('Today hearing cardinality differs');
      return {
        date,
        total,
        rows,
        filters: parseHearingFilters({ dateField: 'next', from: date, to: date }),
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 },
  );
}
