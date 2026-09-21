import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import { dashboardRead } from './dashboard-read';
export type TopClientRow = {
  id: number;
  name: string;
  archived: boolean;
  status: string | null;
  total: number;
  rank: number;
};
export function topClientRowsQuery() {
  return Prisma.sql`WITH scores AS (
  SELECT c.id,c.name_ar AS name,c.is_archived AS archived,c.status,count(DISTINCT m.id)::int total
  FROM public.matters m JOIN public.clients c ON c.id=m.client_id
  WHERE m.status='سارية' GROUP BY c.id
 ), ranked AS (SELECT *,rank() OVER(ORDER BY total DESC)::int rank FROM scores)
 SELECT * FROM ranked WHERE rank<=5 ORDER BY total DESC,id`;
}
export function topClientPopulationQuery() {
  return Prisma.sql`SELECT count(*)::int total,count(*) FILTER(WHERE client_id IS NULL)::int unassigned,
 count(DISTINCT client_id)::int clients FROM public.matters WHERE status='سارية'`;
}
export async function readTopClients(session: Session | null, db: PrismaClient) {
  return dashboardRead(session, db, ['matters', 'clients'], async (tx) => {
    const counts = await tx.$queryRaw<{ total: number; unassigned: number; clients: number }[]>(
      Prisma.sql`${topClientPopulationQuery()}`,
    );
    const rows = await tx.$queryRaw<TopClientRow[]>(Prisma.sql`${topClientRowsQuery()}`);
    if (
      counts.length !== 1 ||
      new Set(rows.map((r) => r.id)).size !== rows.length ||
      rows.some((r) => r.total < 1 || r.rank < 1 || r.rank > 5)
    )
      throw new Error('Top client cardinality differs');
    return { ...counts[0]!, rows };
  });
}
