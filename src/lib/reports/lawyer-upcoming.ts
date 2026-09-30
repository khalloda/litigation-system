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

/** Access Command232: every next-date-qualified hearing, not latest-only,
 * attendance, manual selections, business status or a today-relative window. */
export const lawyerUpcomingHearings: ReportDefinition = {
  descriptor: {
    id: 'lawyer-upcoming-hearings',
    version: '1',
    title: t.lawyerReports.upcomingTitle,
    description: t.lawyerReports.upcomingDescription,
    date: {
      required: true,
      allowOpen: false,
      source: 'date',
      fieldMeaning: t.lawyerReports.nextHearingPeriod,
    },
    parameters: { lawyer: { required: true, help: t.matterReports.leadHelp } },
    layout: 'grouped',
    clientFacing: false,
    countLabel: t.matterReports.hearingCount,
    permissions: [
      { area: 'clients', action: 'view' },
      { area: 'matters', action: 'view' },
      { area: 'hearings', action: 'view' },
      { area: 'staff', action: 'view' },
    ],
    columns: [
      { key: 'caseNumber', label: t.fields.caseNumber, width: 28 },
      { key: 'court', label: t.fields.court, width: 28 },
      { key: 'clientParty', label: t.clientReports.clientParty, width: 35 },
      { key: 'opponentParty', label: t.clientReports.opponentParty, width: 35 },
      { key: 'subject', label: t.fields.subject, width: 40 },
      { key: 'nextDate', label: t.lawyerReports.nextHearing, width: 18 },
      { key: 'principals', label: t.matterReports.leadLawyer, width: 28 },
      { key: 'previousDecision', label: t.lawyerReports.previousDecision, width: 45 },
    ],
  },
  query: readLawyerUpcomingHearings,
};

async function readLawyerUpcomingHearings(
  tx: Prisma.TransactionClient,
  parameters: ReportParameters,
): Promise<ReportData> {
  const bounds = reportDateBounds(parameters, 'date');
  if (!bounds.gte || !bounds.lt) throw new ReportError('invalid', ['from', 'to']);
  if (parameters.lawyer.kind !== 'id') throw new ReportError('invalid', ['lawyer']);
  const rows = await tx.$queryRaw<
    {
      id: number;
      matterId: number;
      clientId: number;
      client: string;
      caseNumber: string | null;
      court: string | null;
      circuit: string | null;
      subject: string | null;
      date: string | null;
      nextDate: string;
      decision: string | null;
    }[]
  >(Prisma.sql`
    SELECT h.id,m.id AS "matterId",c.id AS "clientId",c.name_ar AS client,
      m.case_number_ar AS "caseNumber",court.label_ar AS court,h.circuit,m.subject,
      h.hearing_date::text AS date,h.next_hearing_date::text AS "nextDate",h.decision
    FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id
    JOIN public.clients c ON c.id=m.client_id
    LEFT JOIN public.lookup_court court ON court.id=h.court_id
    WHERE h.next_hearing_date>=${bounds.gte}::date AND h.next_hearing_date<${bounds.lt}::date
      AND EXISTS (SELECT 1 FROM public.matter_lawyers ml
        WHERE ml.matter_id=m.id AND NOT ml.is_retired
          AND ml.role IN ('lead','co_lead') AND ml.person_id=${parameters.lawyer.id}::int)
    ORDER BY c.name_ar COLLATE "C",c.id,h.hearing_date ASC NULLS LAST,h.id`);
  const ids = [...new Set(rows.map((row) => row.matterId))];
  const parties = await reportParties(tx, ids);
  const principals = new Map<number, string[]>();
  if (ids.length) {
    const assignments = await tx.matterLawyer.findMany({
      where: { matterId: { in: ids }, isRetired: false, role: { in: ['lead', 'co_lead'] } },
      select: {
        id: true,
        matterId: true,
        personId: true,
        role: true,
        position: true,
        person: { select: { nameAr: true } },
      },
    });
    assignments.sort(
      (a, b) =>
        a.matterId - b.matterId ||
        Number(a.role !== 'lead') - Number(b.role !== 'lead') ||
        (a.position ?? Infinity) - (b.position ?? Infinity) ||
        a.personId - b.personId ||
        a.id - b.id,
    );
    const seen = new Set<string>();
    for (const assignment of assignments) {
      const key = `${assignment.matterId}:${assignment.personId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const names = principals.get(assignment.matterId) ?? [];
      names.push(assignment.person.nameAr);
      principals.set(assignment.matterId, names);
    }
  }
  const groups = new Map<
    number,
    { id: string; title: string; rows: ReportGroup['rows'][number][] }
  >();
  for (const row of rows) {
    let group = groups.get(row.clientId);
    if (!group) {
      group = { id: `client:${row.clientId}`, title: row.client, rows: [] };
      groups.set(row.clientId, group);
    }
    group.rows.push({
      id: `hearing:${row.id}`,
      cells: [
        row.caseNumber === null ? { type: 'null' } : { type: 'identifier', value: row.caseNumber },
        reportText(courtText(row.court, row.circuit)),
        partyCell(parties, row.matterId, 'client'),
        partyCell(parties, row.matterId, 'opponent'),
        reportText(row.subject),
        { type: 'date', value: row.nextDate },
        reportText(principals.get(row.matterId)?.join('\n') ?? null),
        reportText(datedDecision(row.date, row.decision)),
      ],
    });
  }
  return {
    subtitle: '',
    sections: [{ id: 'upcoming', title: '', groups: [...groups.values()] }],
    totals: [
      {
        label: t.lawyerReports.distinctMatters,
        value: { type: 'integer', value: String(ids.length) },
      },
    ],
  };
}
