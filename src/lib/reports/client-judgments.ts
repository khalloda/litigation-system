import { Prisma } from '@/generated/prisma/client';
import { t } from '@/strings';
import {
  courtText,
  datedDecision,
  partyCell,
  reportClientName,
  reportParties,
  reportText,
  requiredClient,
} from './client-report-data';
import { reportDateBounds } from './input';
import { ReportError, type ReportDefinition, type ReportParameters } from './types';

type JudgmentRow = {
  id: number;
  matterId: number;
  caseNumber: string | null;
  court: string | null;
  circuit: string | null;
  subject: string | null;
  date: string;
  decision: string | null;
};

/** One source-qualified hearing, not one matter or a dashboard outcome bucket. */
export const clientJudgments: ReportDefinition = {
  descriptor: {
    id: 'client-judgments',
    version: '1',
    title: t.clientReports.judgmentsTitle,
    description: t.clientReports.judgmentsDescription,
    date: {
      required: true,
      allowOpen: false,
      source: 'date',
      fieldMeaning: t.clientReports.judgmentPeriod,
    },
    parameters: { client: { required: true, help: t.clientReports.clientHelp } },
    layout: 'flat',
    // The traced judgment report has firm branding, with no client-logo control.
    clientFacing: false,
    permissions: [
      { area: 'clients', action: 'view' },
      { area: 'matters', action: 'view' },
      { area: 'hearings', action: 'view' },
    ],
    columns: [
      { key: 'caseNumber', label: t.fields.caseNumber, width: 25 },
      { key: 'court', label: t.fields.court, width: 25 },
      { key: 'clientParty', label: t.clientReports.clientParty, width: 35 },
      { key: 'opponentParty', label: t.clientReports.opponentParty, width: 35 },
      { key: 'subject', label: t.fields.subject, width: 50 },
      { key: 'judgment', label: t.clientReports.judgment, width: 45 },
    ],
  },
  query: readClientJudgments,
};

async function readClientJudgments(tx: Prisma.TransactionClient, parameters: ReportParameters) {
  const id = requiredClient(parameters);
  const bounds = reportDateBounds(parameters, 'date');
  if (!bounds.gte || !bounds.lt) throw new ReportError('invalid', ['from', 'to']);
  const name = await reportClientName(tx, id);
  const rows = await tx.$queryRaw<JudgmentRow[]>(Prisma.sql`
      SELECT h.id,m.id AS "matterId",m.case_number_ar AS "caseNumber",c.label_ar AS court,
        h.circuit,m.subject,h.hearing_date::text AS date,h.decision
      FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id
      LEFT JOIN public.lookup_court c ON c.id=h.court_id
      WHERE m.client_id=${id} AND h.hearing_date>=${bounds.gte}::date
        AND h.hearing_date<${bounds.lt}::date AND h.outcome IS NOT NULL AND h.outcome<>''
      ORDER BY h.hearing_date,h.id`);
  const parties = await reportParties(
    tx,
    rows.map((row) => row.matterId),
  );
  return {
    subtitle: name,
    totals: [],
    sections: [
      {
        id: 'judgments',
        title: '',
        groups: [
          {
            id: 'judgments',
            title: '',
            rows: rows.map((row) => ({
              id: `hearing:${row.id}`,
              cells: [
                row.caseNumber === null
                  ? ({ type: 'null' } as const)
                  : ({ type: 'identifier', value: row.caseNumber } as const),
                reportText(courtText(row.court, row.circuit)),
                partyCell(parties, row.matterId, 'client'),
                partyCell(parties, row.matterId, 'opponent'),
                reportText(row.subject),
                reportText(datedDecision(row.date, row.decision)),
              ],
            })),
          },
        ],
      },
    ],
  };
}
