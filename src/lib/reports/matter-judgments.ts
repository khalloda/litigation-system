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
import {
  ReportError,
  type ReportData,
  type ReportDefinition,
  type ReportGroup,
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
};

function definition(byLawyer: boolean): ReportDefinition {
  return {
    descriptor: {
      id: byLawyer ? 'matter-lawyer-judgments' : 'matter-judgments',
      version: '1',
      title: byLawyer ? t.matterReports.lawyerJudgmentsTitle : t.matterReports.judgmentsTitle,
      description: byLawyer
        ? t.matterReports.lawyerJudgmentsDescription
        : t.matterReports.judgmentsDescription,
      date: {
        required: true,
        allowOpen: false,
        source: 'date',
        fieldMeaning: t.matterReports.judgmentPeriod,
      },
      parameters: byLawyer ? { lawyer: { required: true, help: t.matterReports.leadHelp } } : {},
      layout: 'grouped',
      clientFacing: false,
      countLabel: t.matterReports.hearingCount,
      ...(!byLawyer ? { outcomeChart: true } : {}),
      permissions: [
        { area: 'clients', action: 'view' },
        { area: 'matters', action: 'view' },
        { area: 'hearings', action: 'view' },
        ...(byLawyer ? [{ area: 'staff' as const, action: 'view' as const }] : []),
      ],
      columns: [
        { key: 'client', label: t.reports.fields.client, width: 25 },
        { key: 'caseNumber', label: t.fields.caseNumber, width: 25 },
        { key: 'court', label: t.fields.court, width: 25 },
        { key: 'clientParty', label: t.clientReports.clientParty, width: 35 },
        { key: 'opponentParty', label: t.clientReports.opponentParty, width: 35 },
        { key: 'subject', label: t.fields.subject, width: 45 },
        { key: 'judgment', label: t.matterReports.judgment, width: 40 },
        ...(byLawyer ? [{ key: 'notes', label: t.matterReports.hearingNotes, width: 30 }] : []),
      ],
    },
    query: (tx, parameters) => readMatterJudgments(tx, parameters, byLawyer),
  };
}

export const matterJudgmentReports = [definition(false), definition(true)] as const;

/** Source-qualified hearings. EXISTS tests a current lead assignment without
 * multiplying a hearing by its parties, lawyer roles or number of attendees. */
async function readMatterJudgments(
  tx: Prisma.TransactionClient,
  parameters: ReportParameters,
  byLawyer: boolean,
): Promise<ReportData> {
  const bounds = reportDateBounds(parameters, 'date');
  if (!bounds.gte || !bounds.lt) throw new ReportError('invalid', ['from', 'to']);
  if (byLawyer && parameters.lawyer.kind !== 'id') throw new ReportError('invalid', ['lawyer']);
  const lawyer = parameters.lawyer.kind === 'id' ? parameters.lawyer.id : null;
  const rows = await tx.$queryRaw<Judgment[]>(Prisma.sql`
    SELECT h.id,m.id AS "matterId",c.name_ar AS client,m.case_number_ar AS "caseNumber",
      court.label_ar AS court,h.circuit,m.subject,h.hearing_date::text AS date,
      h.decision,h.outcome,h.notes
    FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id
    JOIN public.clients c ON c.id=m.client_id
    LEFT JOIN public.lookup_court court ON court.id=h.court_id
    WHERE h.hearing_date>=${bounds.gte}::date AND h.hearing_date<${bounds.lt}::date
      AND h.outcome IS NOT NULL AND (NOT ${byLawyer}::boolean OR h.outcome<>'')
      AND (NOT ${byLawyer}::boolean OR EXISTS(
        SELECT 1 FROM public.matter_lawyers ml WHERE ml.matter_id=m.id
          AND NOT ml.is_retired AND ml.role IN ('lead','co_lead') AND ml.person_id=${lawyer}::int))
    ORDER BY h.outcome COLLATE "C",h.hearing_date,h.id`);
  const parties = await reportParties(
    tx,
    rows.map((row) => row.matterId),
  );
  const groups = new Map<
    string,
    { id: string; title: string; rows: ReportGroup['rows'][number][] }
  >();
  for (const row of rows) {
    let group = groups.get(row.outcome);
    if (!group) {
      group = {
        id: `outcome:${groups.size}`,
        title: row.outcome === '' ? t.reports.emptyValue : row.outcome,
        rows: [],
      };
      groups.set(row.outcome, group);
    }
    group.rows.push({
      id: `hearing:${row.id}`,
      cells: [
        reportText(row.client),
        row.caseNumber === null ? { type: 'null' } : { type: 'identifier', value: row.caseNumber },
        reportText(courtText(row.court, row.circuit)),
        partyCell(parties, row.matterId, 'client'),
        partyCell(parties, row.matterId, 'opponent'),
        reportText(row.subject),
        reportText(datedDecision(row.date, row.decision)),
        ...(byLawyer ? [reportText(row.notes)] : []),
      ],
    });
  }
  const count = (predicate: (row: Judgment) => boolean) => ({
    type: 'integer' as const,
    value: String(rows.filter(predicate).length),
  });
  return {
    subtitle: '',
    sections: [{ id: 'judgments', title: '', groups: [...groups.values()] }],
    ...(!byLawyer
      ? {
          outcomeCounts: [...groups].map(([outcome, group]) => ({
            outcome,
            count: group.rows.length,
          })),
        }
      : {}),
    totals: [
      { label: t.matterReports.favourableCount, value: count((row) => row.outcome === 'صالح') },
      { label: t.matterReports.againstCount, value: count((row) => row.outcome === 'ضد') },
      { label: t.matterReports.emptyCount, value: count((row) => row.outcome === '') },
      {
        label: t.matterReports.otherCount,
        value: count((row) => !['صالح', 'ضد', ''].includes(row.outcome)),
      },
    ],
  };
}
