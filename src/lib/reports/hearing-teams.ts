import { Prisma } from '@/generated/prisma/client';
import { t } from '@/strings';
import { courtText, partyCell, reportParties, reportText } from './client-report-data';
import { reportDateBounds } from './input';
import {
  ReportError,
  type ReportDefinition,
  type ReportGroup,
  type ReportParameters,
  type ReportData,
} from './types';

export const teamHearingReport: ReportDefinition = {
  descriptor: {
    id: 'team-hearings',
    version: '1',
    title: t.hearingReports.teamTitle,
    description: t.hearingReports.teamDescription,
    date: { required: true, allowOpen: false, source: 'date', fieldMeaning: t.fields.hearingDate },
    parameters: { team: { required: false, unassigned: true, help: t.hearingReports.teamHelp } },
    layout: 'date-grouped',
    clientFacing: false,
    countLabel: t.hearingReports.teamEntries,
    permissions: [
      { area: 'matters', action: 'view' },
      { area: 'hearings', action: 'view' },
      { area: 'staff', action: 'view' },
    ],
    columns: [
      { key: 'caseNumber', label: t.fields.caseNumber, width: 25 },
      { key: 'court', label: t.fields.court, width: 29 },
      { key: 'clientParty', label: t.clientReports.clientParty, width: 34 },
      { key: 'opponentParty', label: t.clientReports.opponentParty, width: 34 },
      { key: 'subject', label: t.fields.subject, width: 40 },
      { key: 'previousDecision', label: t.hearingReports.previousDecision, width: 40 },
      { key: 'assignments', label: t.hearingReports.assignments, width: 40 },
    ],
  },
  query: readTeamHearings,
};

async function readTeamHearings(
  tx: Prisma.TransactionClient,
  parameters: ReportParameters,
): Promise<ReportData> {
  const { gte, lt } = reportDateBounds(parameters, 'date');
  if (!gte || !lt) throw new ReportError('invalid', ['from', 'to']);
  const rows = await tx.$queryRaw<
    {
      id: number;
      matterId: number;
      date: string;
      caseNumber: string | null;
      court: string | null;
      circuit: string | null;
      subject: string | null;
      previousDecision: string | null;
    }[]
  >(Prisma.sql`
    SELECT h.id,m.id AS "matterId",h.hearing_date::text AS date,m.case_number_ar AS "caseNumber",
      c.label_ar AS court,h.circuit,m.subject,h.previous_decision AS "previousDecision"
    FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id
    LEFT JOIN public.lookup_court c ON c.id=h.court_id
    WHERE m.status='سارية' AND h.hearing_date>=${gte}::date AND h.hearing_date<${lt}::date
    ORDER BY h.hearing_date,c.label_ar COLLATE "C" NULLS LAST,h.circuit COLLATE "C" NULLS LAST,
      m.case_number_ar COLLATE "C" NULLS LAST,h.id`);
  const ids = [...new Set(rows.map((r) => r.matterId))];
  const assignments = ids.length
    ? await tx.$queryRaw<
        {
          matterId: number;
          personId: number;
          role: 'lead' | 'co_lead' | 'support';
          name: string;
          teamId: number | null;
          team: string | null;
        }[]
      >(Prisma.sql`
    SELECT ml.matter_id AS "matterId",ml.person_id AS "personId",ml.role,p.name_ar AS name,
      p.team_id AS "teamId",t.label_ar AS team
    FROM public.matter_lawyers ml JOIN public.people p ON p.id=ml.person_id
    LEFT JOIN public.lookup_team t ON t.id=p.team_id
    WHERE NOT ml.is_retired AND ml.matter_id=ANY(${ids}::int[])
    ORDER BY ml.matter_id,CASE ml.role WHEN 'lead' THEN 0 WHEN 'co_lead' THEN 1 ELSE 2 END,
      ml.position NULLS LAST,ml.person_id,ml.id`)
    : [];
  const byMatter = new Map<number, typeof assignments>();
  for (const a of assignments) {
    const list = byMatter.get(a.matterId) ?? [];
    list.push(a);
    byMatter.set(a.matterId, list);
  }
  const parties = await reportParties(tx, ids);
  const sections = new Map<
    number | null,
    {
      id: string;
      title: string;
      dates: Map<
        string,
        { id: string; date: string; title: string; rows: ReportGroup['rows'][number][] }
      >;
    }
  >();
  const heard = new Set<number>(),
    matters = new Set<number>();
  let entries = 0;
  const selected = parameters.team ?? { kind: 'all' };
  for (const h of rows) {
    const assigned = byMatter.get(h.matterId) ?? [];
    const teams = new Map(assigned.map((a) => [a.teamId, a.team]));
    if (!teams.size) teams.set(null, null);
    for (const [id, name] of teams) {
      if (
        (selected.kind === 'id' && id !== selected.id) ||
        (selected.kind === 'unassigned' && id !== null)
      )
        continue;
      let section = sections.get(id);
      if (!section) {
        section = {
          id: `team:${id ?? 'unassigned'}`,
          title: name ?? t.reports.unassigned,
          dates: new Map(),
        };
        sections.set(id, section);
      }
      let group = section.dates.get(h.date);
      if (!group) {
        group = { id: h.date, date: h.date, title: '', rows: [] };
        section.dates.set(h.date, group);
      }
      group.rows.push({
        id: `${section.id}:hearing:${h.id}`,
        cells: [
          h.caseNumber === null ? { type: 'null' } : { type: 'identifier', value: h.caseNumber },
          reportText(courtText(h.court, h.circuit)),
          partyCell(parties, h.matterId, 'client'),
          partyCell(parties, h.matterId, 'opponent'),
          reportText(h.subject),
          reportText(h.previousDecision),
          reportText(
            assigned.length
              ? assigned
                  .map(
                    (a) =>
                      `${a.role === 'lead' ? t.matters.lawyerRoles.lead : a.role === 'co_lead' ? t.matters.lawyerRoles.co_lead : t.matters.lawyerRoles.support}: ${a.name}`,
                  )
                  .join('\n')
              : null,
          ),
        ],
      });
      entries++;
      heard.add(h.id);
      matters.add(h.matterId);
    }
  }
  return {
    subtitle: '',
    sections: [...sections]
      .sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
      .map(([, s]) => ({ id: s.id, title: s.title, groups: [...s.dates.values()] })),
    totals: [
      {
        label: t.matterReports.hearingCount,
        value: { type: 'integer', value: String(heard.size) },
      },
      {
        label: t.lawyerReports.distinctMatters,
        value: { type: 'integer', value: String(matters.size) },
      },
      {
        label: t.hearingReports.teamOverlap,
        value: { type: 'integer', value: String(entries - heard.size) },
      },
    ],
  };
}
