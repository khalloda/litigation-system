import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import { dashboardRead } from './dashboard-read';

export type LawyerWorkloadRow = {
  id: number;
  name: string;
  staff: boolean;
  active: boolean;
  lead: number;
  coLead: number;
  support: number;
  total: number;
};
export function lawyerWorkloadQuery() {
  return Prisma.sql`SELECT p.id,p.name_ar AS name,p.is_staff AS staff,p.is_active AS active,
   count(DISTINCT m.id) FILTER(WHERE ml.role='lead')::int lead,
   count(DISTINCT m.id) FILTER(WHERE ml.role='co_lead')::int "coLead",
   count(DISTINCT m.id) FILTER(WHERE ml.role='support')::int support,
   count(DISTINCT m.id)::int total
   FROM public.matters m JOIN public.matter_lawyers ml ON ml.matter_id=m.id
   JOIN public.people p ON p.id=ml.person_id
   WHERE m.status='سارية' AND NOT ml.is_retired
   GROUP BY p.id ORDER BY p.id`;
}
export function lawyerPopulationQuery() {
  return Prisma.sql`SELECT count(*)::int total,
   count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM public.matter_lawyers ml
     WHERE ml.matter_id=m.id AND NOT ml.is_retired))::int unassigned
   FROM public.matters m WHERE m.status='سارية'`;
}
export async function readLawyerWorkload(session: Session | null, db: PrismaClient) {
  return dashboardRead(session, db, ['matters', 'staff'], async (tx) => {
    const counts = await tx.$queryRaw<{ total: number; unassigned: number }[]>(
      Prisma.sql`${lawyerPopulationQuery()}`,
    );
    const rows = await tx.$queryRaw<LawyerWorkloadRow[]>(Prisma.sql`${lawyerWorkloadQuery()}`);
    if (
      counts.length !== 1 ||
      new Set(rows.map((r) => r.id)).size !== rows.length ||
      rows.some((r) => r.total < 1 || r.lead + r.coLead + r.support !== r.total)
    )
      throw new Error('Workload cardinality differs');
    return { ...counts[0]!, rows };
  });
}
