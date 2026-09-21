import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import { cairoDate } from './cairo-date';
import { dashboardRead } from './dashboard-read';
import { openDecisionPredicate } from './open-decision-predicate';
import { parseHearingFilters } from './hearing-query';
import type { TodayHearing } from './today-hearings-query';

export type OpenDecision = TodayHearing & { shortDecision: string | null };
export const OPEN_DECISIONS_LIMIT = 25;
export function openDecisionCountQuery(before: string) {
  return Prisma.sql`SELECT count(*)::int total FROM public.hearings h
    JOIN public.matters m ON m.id=h.matter_id WHERE ${openDecisionPredicate(before)}`;
}
export function openDecisionRowsQuery(before: string) {
  return Prisma.sql`SELECT h.id,h.legacy_id AS "legacyId",h.matter_id AS "matterId",
    m.case_number_ar AS "caseNumber",m.subject,m.is_archived AS "matterArchived",
    h.is_archived AS "hearingArchived",c.id AS "clientId",c.name_ar AS "clientName",
    c.is_archived AS "clientArchived",h.hearing_date::text AS "hearingDate",
    h.next_hearing_date::text AS "nextHearingDate",ct.label_ar AS court,h.circuit,
    a.label_ar AS action,h.decision,h.short_decision AS "shortDecision"
    FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id
    LEFT JOIN public.clients c ON c.id=m.client_id
    LEFT JOIN public.lookup_court ct ON ct.id=h.court_id
    LEFT JOIN public.lookup_hearing_action a ON a.id=h.action_id
    WHERE ${openDecisionPredicate(before)}
    ORDER BY h.next_hearing_date,h.id LIMIT ${OPEN_DECISIONS_LIMIT}`;
}
export async function readOpenDecisions(
  session: Session | null,
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  const date = cairoDate(clock());
  return dashboardRead(session, db, ['hearings', 'matters'], async (tx) => {
    const counts = await tx.$queryRaw<{ total: number }[]>(
      Prisma.sql`${openDecisionCountQuery(date)}`,
    );
    const rows = await tx.$queryRaw<OpenDecision[]>(Prisma.sql`${openDecisionRowsQuery(date)}`);
    const total = counts[0]?.total;
    if (
      counts.length !== 1 ||
      total === undefined ||
      rows.length !== Math.min(total, OPEN_DECISIONS_LIMIT) ||
      new Set(rows.map((r) => r.id)).size !== rows.length
    )
      throw new Error('Open decision cardinality differs');
    return { date, total, rows, filters: parseHearingFilters({ openBefore: date }) };
  });
}
