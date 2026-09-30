import { Prisma } from '@/generated/prisma/client';
import { t } from '@/strings';
import { reportDateBounds } from './input';
import { ReportError, type ReportCell, type ReportDefinition, type ReportRow } from './types';

type OutcomeHearing = { id: number; matterId: number; date: string; outcome: string };
type Principal = { matterId: number; personId: number; name: string };
/** Pure aggregation of independently fetched hearing and principal relations.
 * Current responsibility, full credit; overall denominators never join lawyers. */
export function summarizeMatterOutcomes(
  hearings: readonly OutcomeHearing[],
  principals: readonly Principal[],
) {
  const favourable = hearings.filter((h) => h.outcome === 'صالح').length;
  const count = (n: number): ReportCell => ({ type: 'integer', value: String(n) });
  function row(
    id: string,
    label: string,
    values: readonly OutcomeHearing[],
    share = false,
  ): ReportRow {
    const good = values.filter((h) => h.outcome === 'صالح').length,
      bad = values.filter((h) => h.outcome === 'ضد').length;
    return {
      id,
      cells: [
        { type: 'text', value: label },
        count(good),
        count(bad),
        count(good + bad),
        count(values.filter((h) => h.outcome === '').length),
        count(values.filter((h) => !['صالح', 'ضد', ''].includes(h.outcome)).length),
        count(values.length),
        share && favourable
          ? { type: 'decimal', value: ((100 * good) / favourable).toFixed(2) }
          : { type: 'null' },
      ],
    };
  }
  function periods(size: number, prefix: string) {
    const buckets = new Map<string, OutcomeHearing[]>();
    for (const h of hearings) {
      const key = h.date.slice(0, size);
      const values = buckets.get(key) ?? [];
      values.push(h);
      buckets.set(key, values);
    }
    return [...buckets]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => row(`${prefix}:${key}`, key, values));
  }
  const byMatter = new Map<number, Map<number, string>>();
  for (const p of principals) {
    const people = byMatter.get(p.matterId) ?? new Map<number, string>();
    people.set(p.personId, p.name);
    byMatter.set(p.matterId, people);
  }
  const lawyers = new Map<number | null, { name: string; rows: OutcomeHearing[] }>();
  for (const h of hearings) {
    const people = byMatter.get(h.matterId);
    for (const [id, name] of people?.size ? people : new Map([[null, t.reports.unassigned]])) {
      const group = lawyers.get(id) ?? { name, rows: [] };
      group.rows.push(h);
      lawyers.set(id, group);
    }
  }
  return [
    {
      id: 'overall',
      title: t.matterReports.overall,
      groups: [
        { id: 'overall', title: '', rows: [row('overall', t.matterReports.overall, hearings)] },
      ],
    },
    {
      id: 'monthly',
      title: t.matterReports.monthly,
      groups: [{ id: 'months', title: '', rows: periods(7, 'month') }],
    },
    {
      id: 'annual',
      title: t.matterReports.annual,
      groups: [{ id: 'years', title: '', rows: periods(4, 'year') }],
    },
    {
      id: 'lawyers',
      title: t.matterReports.currentPrincipals,
      groups: [
        {
          id: 'lawyers',
          title: '',
          rows: [...lawyers]
            .sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
            .map(([id, g]) =>
              row(
                `lawyer:${id ?? 'unassigned'}`,
                `${g.name}${id === null ? '' : ` (${id})`}`,
                g.rows,
                true,
              ),
            ),
        },
      ],
    },
  ];
}

export const matterOutcomeSummary: ReportDefinition = {
  descriptor: {
    id: 'matter-outcome-summary',
    version: '1',
    title: t.matterReports.summaryTitle,
    description: t.matterReports.summaryDescription,
    date: {
      required: true,
      allowOpen: false,
      source: 'date',
      fieldMeaning: t.matterReports.judgmentPeriod,
    },
    parameters: {},
    layout: 'flat',
    clientFacing: false,
    countLabel: t.matterReports.summaryRows,
    charts: ['overall', 'annual'],
    permissions: [
      { area: 'clients', action: 'view' },
      { area: 'matters', action: 'view' },
      { area: 'hearings', action: 'view' },
      { area: 'staff', action: 'view' },
    ],
    columns: [
      { key: 'label', label: t.matterReports.group, width: 35 },
      { key: 'favourable', label: t.matterReports.favourableCount, width: 20 },
      { key: 'against', label: t.matterReports.againstCount, width: 20 },
      { key: 'recognised', label: t.matterReports.recognised, width: 20 },
      { key: 'empty', label: t.matterReports.emptyCount, width: 20 },
      { key: 'other', label: t.matterReports.otherCount, width: 20 },
      { key: 'all', label: t.matterReports.hearingCount, width: 20 },
      { key: 'share', label: t.matterReports.favourableShare, width: 25 },
    ],
  },
  query: readMatterOutcomeSummary,
};
async function readMatterOutcomeSummary(
  tx: Prisma.TransactionClient,
  parameters: import('./types').ReportParameters,
): Promise<import('./types').ReportData> {
  const bounds = reportDateBounds(parameters, 'date');
  if (!bounds.gte || !bounds.lt) throw new ReportError('invalid', ['from', 'to']);
  const hearings = await tx.$queryRaw<
    OutcomeHearing[]
  >(Prisma.sql`SELECT h.id,h.matter_id AS "matterId",h.hearing_date::text date,h.outcome
      FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id JOIN public.clients c ON c.id=m.client_id
      WHERE h.hearing_date>=${bounds.gte}::date AND h.hearing_date<${bounds.lt}::date AND h.outcome IS NOT NULL ORDER BY h.hearing_date,h.id`);
  const principals = await tx.$queryRaw<
    Principal[]
  >(Prisma.sql`SELECT DISTINCT ml.matter_id AS "matterId",ml.person_id AS "personId",p.name_ar AS name
      FROM public.matter_lawyers ml JOIN public.people p ON p.id=ml.person_id
      WHERE NOT ml.is_retired AND ml.role IN ('lead','co_lead') ORDER BY ml.matter_id,ml.person_id`);
  return {
    subtitle: t.matterReports.attributionNote,
    sections: summarizeMatterOutcomes(hearings, principals),
    totals: [
      {
        label: t.matterReports.hearingCount,
        value: { type: 'integer', value: String(hearings.length) },
      },
    ],
  };
}
