import { Prisma } from '@/generated/prisma/client';
import { t } from '@/strings';
import {
  courtText,
  datedDecision,
  partyCell,
  reportParties,
  reportText,
} from './client-report-data';
import { reportDateBounds } from './input';
import { matterJudgmentReports } from './matter-judgments';
import {
  ReportError,
  type ReportDefinition,
  type ReportGroup,
  type ReportRow,
  type ReportParameters,
} from './types';

type Judgment = {
  id: number;
  matterId: number;
  client: string;
  caseNumber: string | null;
  court: string | null;
  circuit: string | null;
  subject: string | null;
  date: string;
  decision: string | null;
  outcome: string;
  notes: string | null;
  lawyerId: number | null;
  lawyer: string | null;
};
const integer = (n: number) => ({ type: 'integer' as const, value: String(n) });
function totals(rows: readonly Judgment[]) {
  return [
    {
      label: t.matterReports.favourableCount,
      value: integer(rows.filter((r) => r.outcome === 'صالح').length),
    },
    {
      label: t.matterReports.againstCount,
      value: integer(rows.filter((r) => r.outcome === 'ضد').length),
    },
    {
      label: t.matterReports.otherCount,
      value: integer(rows.filter((r) => !['صالح', 'ضد'].includes(r.outcome)).length),
    },
    { label: t.matterReports.hearingCount, value: integer(rows.length) },
  ];
}

/** Command153: all current principals, then exact outcome, then hearing date.
 * Unlike Command250 this has no selected-lawyer parameter. The approved current
 * assignment mapping replaces the legacy lawyer text, never the hearing grain. */
export const judgmentsByLawyer: ReportDefinition = {
  descriptor: {
    id: 'matter-judgments-by-lawyer',
    version: '1',
    title: t.judgmentsByLawyer.title,
    description: t.judgmentsByLawyer.description,
    date: {
      required: true,
      allowOpen: false,
      source: 'date',
      fieldMeaning: t.matterReports.judgmentPeriod,
    },
    parameters: {},
    layout: 'grouped',
    clientFacing: false,
    countLabel: t.judgmentsByLawyer.attributionCount,
    sectionPageBreaks: true,
    columns: matterJudgmentReports[1].descriptor.columns,
    permissions: matterJudgmentReports[1].descriptor.permissions,
  },
  query: readJudgmentsByLawyer,
};

async function readJudgmentsByLawyer(tx: Prisma.TransactionClient, parameters: ReportParameters) {
  const bounds = reportDateBounds(parameters, 'date');
  if (!bounds.gte || !bounds.lt) throw new ReportError('invalid', ['from', 'to']);
  const rows = await tx.$queryRaw<Judgment[]>(Prisma.sql`
      WITH principals AS (
        SELECT DISTINCT matter_id,person_id FROM public.matter_lawyers
        WHERE NOT is_retired AND role IN ('lead','co_lead')
      )
      SELECT h.id,m.id AS "matterId",c.name_ar AS client,m.case_number_ar AS "caseNumber",
        court.label_ar AS court,h.circuit,m.subject,h.hearing_date::text AS date,
        h.decision,h.outcome,h.notes,p.id AS "lawyerId",p.name_ar AS lawyer
      FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id
      JOIN public.clients c ON c.id=m.client_id
      LEFT JOIN public.lookup_court court ON court.id=h.court_id
      LEFT JOIN principals a ON a.matter_id=m.id
      LEFT JOIN public.people p ON p.id=a.person_id
      WHERE h.hearing_date>=${bounds.gte}::date AND h.hearing_date<${bounds.lt}::date
        AND h.outcome IS NOT NULL AND h.outcome<>''
      ORDER BY p.name_ar COLLATE "C" NULLS FIRST,p.id NULLS FIRST,
        h.outcome COLLATE "C",h.hearing_date,h.id`);
  const parties = await reportParties(
    tx,
    rows.map((r) => r.matterId),
  );
  const lawyers = new Map<
    number | null,
    {
      name: string;
      source: Judgment[];
      groups: Map<string, { id: string; title: string; rows: ReportRow[] }>;
    }
  >();
  for (const row of rows) {
    let lawyer = lawyers.get(row.lawyerId);
    if (!lawyer) {
      lawyer = {
        name: row.lawyer ?? t.lawyerReports.unassigned,
        source: [],
        groups: new Map(),
      };
      lawyers.set(row.lawyerId, lawyer);
    }
    lawyer.source.push(row);
    let group = lawyer.groups.get(row.outcome);
    if (!group) {
      group = { id: `outcome:${lawyer.groups.size}`, title: row.outcome, rows: [] };
      lawyer.groups.set(row.outcome, group);
    }
    group.rows.push({
      id: `lawyer:${row.lawyerId ?? 'unassigned'}:hearing:${row.id}`,
      cells: [
        reportText(row.client),
        row.caseNumber === null ? { type: 'null' } : { type: 'identifier', value: row.caseNumber },
        reportText(courtText(row.court, row.circuit)),
        partyCell(parties, row.matterId, 'client'),
        partyCell(parties, row.matterId, 'opponent'),
        reportText(row.subject),
        reportText(datedDecision(row.date, row.decision)),
        reportText(row.notes),
      ],
    });
  }
  const distinct = [...new Map(rows.map((r) => [r.id, r])).values()];
  return {
    subtitle: t.judgmentsByLawyer.attributionHelp,
    sections: [...lawyers].map(([id, lawyer]) => ({
      id: `lawyer:${id ?? 'unassigned'}`,
      title: lawyer.name,
      groups: [...lawyer.groups.values()] satisfies ReportGroup[],
      totals: totals(lawyer.source),
    })),
    totals: [
      { label: t.judgmentsByLawyer.distinctCount, value: integer(distinct.length) },
      ...totals(distinct).slice(0, 3),
    ],
  };
}
