import { Prisma } from '@/generated/prisma/client';
import { t } from '@/strings';
import { ReportError, type ReportCell, type ReportParameters } from './types';

export const reportText = (value: string | null): ReportCell =>
  value === null ? { type: 'null' } : { type: 'text', value };

export function requiredClient(parameters: ReportParameters) {
  if (parameters.client.kind !== 'id') throw new ReportError('invalid', ['client']);
  return parameters.client.id;
}

export async function reportClientName(tx: Prisma.TransactionClient, clientId: number) {
  const rows = await tx.$queryRaw<{ name: string }[]>(
    Prisma.sql`SELECT name_ar AS name FROM public.clients WHERE id=${clientId}`,
  );
  if (rows.length !== 1) throw new ReportError('invalid', ['client']);
  return rows[0]!.name;
}

/** Current ordered parties/capacities, in one set query. Never revive raw text
 * after a relationship is deliberately cleared or retired. Archive is unrelated. */
export async function reportParties(tx: Prisma.TransactionClient, matterIds: readonly number[]) {
  const ids = [...new Set(matterIds)];
  const result = new Map<number, { client: string[]; opponent: string[] }>();
  if (!ids.length) return result;
  const rows = await tx.$queryRaw<
    { matterId: number; side: 'client' | 'opponent'; name: string | null; roles: string[] }[]
  >(Prisma.sql`WITH roles AS (
      SELECT r.party_id,jsonb_agg(CASE WHEN p.gender='f' THEN l.label_ar_f ELSE l.label_ar_m END
        ORDER BY r.ordinal NULLS LAST,r.id) labels
      FROM public.matter_party_roles r JOIN public.matter_parties p ON p.id=r.party_id
      JOIN public.lookup_party_role l ON l.id=r.role_id
      WHERE NOT r.is_retired AND NOT p.is_retired AND p.matter_id=ANY(${ids}::int[])
      GROUP BY r.party_id
    ) SELECT p.matter_id AS "matterId",p.side,p.party_name AS name,
      coalesce(r.labels,'[]'::jsonb) roles
    FROM public.matter_parties p LEFT JOIN roles r ON r.party_id=p.id
    WHERE NOT p.is_retired AND p.matter_id=ANY(${ids}::int[])
    ORDER BY p.matter_id,p.side,p.ordinal NULLS LAST,p.id`);
  for (const row of rows) {
    const sides = result.get(row.matterId) ?? { client: [], opponent: [] };
    const value = [row.name ?? t.reports.nullValue, ...row.roles.map((role) => `"${role}"`)].join(
      '\n',
    );
    if (row.side === 'client') sides.client.push(value);
    else sides.opponent.push(value);
    result.set(row.matterId, sides);
  }
  return result;
}

export function partyCell(
  parties: Awaited<ReturnType<typeof reportParties>>,
  matterId: number,
  side: 'client' | 'opponent',
) {
  const entry = parties.get(matterId);
  const values = side === 'client' ? entry?.client : entry?.opponent;
  return reportText(values?.length ? values.join('\n\n') : null);
}

export function courtText(court: string | null, circuit: string | null): string | null {
  if (circuit === null || circuit === '' || circuit === court) return court;
  const displayed = circuit.startsWith('(') && circuit.endsWith(')') ? circuit : `(${circuit})`;
  return `${court ?? t.reports.nullValue}\n${displayed}`;
}

export function datedDecision(date: string | null, decision: string | null): string | null {
  if (date === null) return decision;
  return `${date.replaceAll('-', '/')}\n${decision ?? t.reports.nullValue}`;
}
