import { Prisma } from '@/generated/prisma/client';

/** Aliases h/m: retained Dashboard open decisions, with D61 subject archive. */
export function openDecisionPredicate(before: string) {
  return Prisma.sql`h.next_hearing_date < ${before}::date AND h.report IS TRUE
    AND m.status = 'سارية' AND NOT h.is_archived`;
}
