import { Prisma } from '@/generated/prisma/client';
import { t } from '@/strings';
import { courtText, partyCell, reportParties, reportText } from './client-report-data';
import { reportDateBounds } from './input';
import {
  ReportError,
  type ReportCell,
  type ReportData,
  type ReportDefinition,
  type ReportGroup,
  type ReportParameters,
} from './types';

type Purpose = 'principal' | 'supporting' | 'all' | 'position' | 'new';
const definitions = [
  [
    'principal',
    'lawyer-principal-matters',
    t.lawyerReports.principalTitle,
    t.lawyerReports.principalDescription,
  ],
  [
    'supporting',
    'lawyer-supporting-matters',
    t.lawyerReports.supportTitle,
    t.lawyerReports.supportDescription,
  ],
  ['all', 'lawyer-all-matters', t.lawyerReports.allTitle, t.lawyerReports.allDescription],
  [
    'position',
    'lawyer-current-position',
    t.lawyerReports.positionTitle,
    t.lawyerReports.positionDescription,
  ],
  ['new', 'lawyer-new-matters', t.lawyerReports.newTitle, t.lawyerReports.newDescription],
] as const;
const permissions = [
  { area: 'clients', action: 'view' },
  { area: 'matters', action: 'view' },
  { area: 'hearings', action: 'view' },
  { area: 'staff', action: 'view' },
] as const;
export const lawyerReports: readonly ReportDefinition[] = definitions.map(
  ([purpose, id, title, description]) => ({
    descriptor: {
      id,
      version: '1',
      title,
      description,
      parameters: {
        client: { required: false, help: t.clientReports.clientHelp },
        ...(['principal', 'supporting', 'position'].includes(purpose)
          ? {
              lawyer: {
                required: true,
                help:
                  purpose === 'supporting' ? t.lawyerReports.supportHelp : t.matterReports.leadHelp,
              },
            }
          : {}),
      },
      ...(['position', 'new'].includes(purpose)
        ? {
            date: {
              required: true,
              allowOpen: false,
              source: 'date' as const,
              fieldMeaning:
                purpose === 'new' ? t.lawyerReports.startPeriod : t.lawyerSelection.period,
            },
          }
        : {}),
      extra: [
        {
          key: 'extra_mode',
          label: t.reportSelection.mode,
          required: true,
          defaultValue: 'all',
          choices: [
            { value: 'all', label: t.lawyerSelection.all },
            { value: 'selected', label: t.reportSelection.selected },
          ],
        },
      ],
      layout: 'grouped',
      clientFacing: false,
      countLabel: t.clientReports.matterCount,
      permissions,
      columns:
        purpose === 'new'
          ? [
              { key: 'startDate', label: t.lawyerReports.startDate, width: 18 },
              { key: 'caseNumber', label: t.fields.caseNumber, width: 28 },
              { key: 'subject', label: t.fields.subject, width: 40 },
              { key: 'principals', label: t.matterReports.leadLawyer, width: 28 },
              { key: 'support', label: t.lawyerReports.support, width: 28 },
              { key: 'category', label: t.lawyerReports.category, width: 24 },
            ]
          : [
              { key: 'caseNumber', label: t.fields.caseNumber, width: 28 },
              {
                key: 'court',
                label:
                  purpose === 'supporting'
                    ? t.lawyerReports.matterCourt
                    : t.lawyerReports.hearingCourt,
                width: 28,
              },
              { key: 'clientParty', label: t.clientReports.clientParty, width: 35 },
              { key: 'opponentParty', label: t.clientReports.opponentParty, width: 35 },
              { key: 'subject', label: t.fields.subject, width: 40 },
              { key: 'hearingDate', label: t.lawyerReports.hearingDate, width: 18 },
              { key: 'decision', label: t.reportSelection.decision, width: 40 },
              { key: 'principals', label: t.matterReports.leadLawyer, width: 28 },
              ...(['principal', 'supporting', 'all'].includes(purpose)
                ? [
                    { key: 'support', label: t.lawyerReports.support, width: 28 },
                    { key: 'reviewer', label: t.lawyerReports.reviewer, width: 28 },
                  ]
                : []),
            ],
    },
    query: (tx, parameters) => readLawyerMatters(tx, parameters, purpose),
  }),
);

type MatterRow = {
  id: number;
  clientId: number;
  client: string;
  caseNumber: string | null;
  subject: string | null;
  startDate: string | null;
  category: string | null;
  hearingId: number | null;
  hearingMatter: number | null;
  date: string | null;
  decision: string | null;
  court: string | null;
  circuit: string | null;
};
type Assignment = {
  matterId: number;
  personId: number;
  name: string;
  role: string;
  position: number | null;
  id: number;
};
const dateCell = (value: string | null): ReportCell =>
  value === null ? { type: 'null' } : { type: 'date', value };
const idCell = (value: string | null): ReportCell =>
  value === null ? { type: 'null' } : { type: 'identifier', value };
const integer = (value: number): ReportCell => ({ type: 'integer', value: String(value) });

/** Approved D64-2: qualify the matter first, choose a coherent hearing, then period.
 * Historical flags, latest-within-period and another purpose's selections are never used. */
async function readLawyerMatters(
  tx: Prisma.TransactionClient,
  parameters: ReportParameters,
  purpose: Purpose,
): Promise<ReportData> {
  const mode = parameters.extra['extra_mode'];
  if (mode !== 'all' && mode !== 'selected') throw new ReportError('invalid', ['extra_mode']);
  const selected = mode === 'selected',
    distribution = purpose === 'new';
  const lawyerRequired = ['principal', 'supporting', 'position'].includes(purpose);
  if (lawyerRequired && parameters.lawyer.kind !== 'id')
    throw new ReportError('invalid', ['lawyer']);
  const lawyer = parameters.lawyer.kind === 'id' ? parameters.lawyer.id : null;
  const client = parameters.client.kind === 'id' ? parameters.client.id : null;
  const period =
    purpose === 'position' || distribution ? reportDateBounds(parameters, 'date') : null;
  if (period && (!period.gte || !period.lt)) throw new ReportError('invalid', ['from', 'to']);
  const active = ['principal', 'supporting', 'all'].includes(purpose);
  const rows = await tx.$queryRaw<MatterRow[]>(Prisma.sql`
    SELECT m.id,c.id AS "clientId",c.name_ar AS client,m.case_number_ar AS "caseNumber",m.subject,
      m.start_date::text AS "startDate",category.label_ar AS category,
      h.id AS "hearingId",h.matter_id AS "hearingMatter",h.hearing_date::text AS date,h.decision,
      court.label_ar AS court,CASE WHEN ${purpose === 'supporting'} THEN m.circuit ELSE h.circuit END AS circuit
    FROM public.matters m JOIN public.clients c ON c.id=m.client_id
    LEFT JOIN public.lawyer_report_selections s ON s.id=m.id
    LEFT JOIN LATERAL (SELECT candidate.* FROM public.hearings candidate
      WHERE NOT ${distribution} AND candidate.matter_id=m.id
        AND (NOT ${selected} OR candidate.id=s.hearing_id)
      ORDER BY candidate.hearing_date DESC NULLS LAST,candidate.id DESC LIMIT 1) h ON true
    LEFT JOIN public.lookup_court court ON court.id=CASE WHEN ${purpose === 'supporting'} THEN m.court_id ELSE h.court_id END
    LEFT JOIN public.lookup_matter_category category ON category.id=m.matter_category_id
    WHERE (${client}::int IS NULL OR m.client_id=${client})
      AND (NOT ${active} OR m.status='سارية') AND (NOT ${selected} OR s.is_selected)
      AND (NOT ${lawyerRequired || distribution} OR EXISTS(SELECT 1 FROM public.matter_lawyers ml
        WHERE ml.matter_id=m.id AND NOT ml.is_retired
          AND ((${purpose === 'supporting'} AND ml.role='support') OR (NOT ${purpose === 'supporting'} AND ml.role IN('lead','co_lead')))
          AND (${lawyer}::int IS NULL OR ml.person_id=${lawyer})))
    ORDER BY c.name_ar COLLATE "C",c.id,m.case_number_ar COLLATE "C" NULLS LAST,m.id`);
  // Scope the correction to the otherwise relevant population, before a date
  // filter can hide a missing/invalid chosen hearing. Distribution needs none.
  if (
    selected &&
    !distribution &&
    rows.some((r) => r.hearingId === null || r.hearingMatter !== r.id || r.date === null)
  )
    throw new ReportError('selection-incomplete', ['extra_mode']);
  const included = rows.filter((r) => {
    if (!distribution && r.hearingId === null) return false;
    if (!period) return true;
    const date = distribution ? r.startDate : r.date;
    return date !== null && date >= period.gte! && date < period.lt!;
  });
  const ids = included.map((r) => r.id);
  const parties = distribution ? new Map() : await reportParties(tx, ids);
  const assignments = ids.length
    ? await tx.$queryRaw<Assignment[]>(Prisma.sql`
    SELECT ml.id,ml.matter_id AS "matterId",ml.person_id AS "personId",p.name_ar AS name,ml.role,ml.position
    FROM public.matter_lawyers ml JOIN public.people p ON p.id=ml.person_id
    WHERE ml.matter_id=ANY(${ids}::int[]) AND NOT ml.is_retired AND ml.role IN('lead','co_lead','support')
    ORDER BY ml.matter_id,CASE ml.role WHEN 'lead' THEN 0 WHEN 'co_lead' THEN 1 ELSE 2 END,ml.position NULLS LAST,ml.person_id,ml.id`)
    : [];
  const principals = new Map<number, Assignment[]>(),
    support = new Map<number, Assignment[]>();
  for (const assignment of assignments) {
    const target = assignment.role === 'support' ? support : principals;
    const people = target.get(assignment.matterId) ?? [];
    if (!people.some((p) => p.personId === assignment.personId)) people.push(assignment);
    target.set(assignment.matterId, people);
  }
  const historical =
    ids.length && ['principal', 'supporting', 'all'].includes(purpose)
      ? await tx.$queryRaw<
          {
            id: number;
            team_key: string | null;
            source_state: keyof typeof t.lawyerReports.reviewerStates;
            reviewer: string | null;
          }[]
        >(
          Prisma.sql`SELECT id,team_key,source_state,reviewer FROM public.lawyer_report_historical_reviewer(${ids}::int[])`,
        )
      : [];
  const reviewers = new Map(historical.map((r) => [r.id, r]));
  if (
    ['principal', 'supporting', 'all'].includes(purpose) &&
    (reviewers.size !== ids.length || historical.length !== ids.length)
  )
    throw new ReportError('generation');
  const names = (map: Map<number, Assignment[]>, id: number) =>
    map
      .get(id)
      ?.map((p) => p.name)
      .join('\n') ?? null;
  const summary = new Map<number, { name: string; matters: Set<number> }>();
  let unassigned = 0;
  for (const row of included) {
    const people = principals.get(row.id) ?? [];
    if (!people.length) unassigned++;
    for (const person of people) {
      const entry = summary.get(person.personId) ?? {
        name: person.name,
        matters: new Set<number>(),
      };
      entry.matters.add(row.id);
      summary.set(person.personId, entry);
    }
  }
  const groupedByAssignments = ['principal', 'supporting', 'all'].includes(purpose);
  const assignmentsFor = (r: MatterRow) =>
    (purpose === 'supporting' ? support : principals).get(r.id) ?? [];
  included.sort((a, b) => {
    const groupA = groupedByAssignments
      ? assignmentsFor(a)
          .map((p) => `${p.name} [${p.personId}]`)
          .join('\n')
      : '';
    const groupB = groupedByAssignments
      ? assignmentsFor(b)
          .map((p) => `${p.name} [${p.personId}]`)
          .join('\n')
      : '';
    return (
      Buffer.compare(Buffer.from(groupA), Buffer.from(groupB)) ||
      Buffer.compare(Buffer.from(a.client), Buffer.from(b.client)) ||
      a.clientId - b.clientId ||
      (purpose === 'position' || distribution
        ? (distribution ? a.startDate! : a.date!).localeCompare(
            distribution ? b.startDate! : b.date!,
          )
        : a.caseNumber === null
          ? b.caseNumber === null
            ? 0
            : 1
          : b.caseNumber === null
            ? -1
            : Buffer.compare(Buffer.from(a.caseNumber), Buffer.from(b.caseNumber))) ||
      a.id - b.id
    );
  });
  const groups = new Map<
    string,
    { id: string; title: string; rows: ReportGroup['rows'][number][] }
  >();
  for (const r of included) {
    const people = assignmentsFor(r);
    const key =
      (groupedByAssignments ? people.map((p) => p.personId).join(',') + ':' : '') +
      `client:${r.clientId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        id: key,
        title:
          (groupedByAssignments
            ? (people.map((p) => `${p.name} [${p.personId}]`).join(' · ') || t.reports.unassigned) +
              '\n'
            : '') + `${r.client} [${r.clientId}]`,
        rows: [],
      };
      groups.set(key, group);
    }
    const source = reviewers.get(r.id);
    const reviewer =
      source?.source_state === 'recorded' || source?.source_state === 'reviewer_empty'
        ? reportText(source.reviewer)
        : reportText(
            source
              ? (Object.entries(t.lawyerReports.reviewerStates)
                  .find(([key]) => key === source.source_state)
                  ?.at(1) ?? t.common.notRecorded) +
                  (source.source_state === 'unknown_team' ? ` [${source.team_key}]` : '')
              : null,
          );
    group.rows.push({
      id: `matter:${r.id}`,
      cells: distribution
        ? [
            dateCell(r.startDate),
            idCell(r.caseNumber),
            reportText(r.subject),
            reportText(names(principals, r.id)),
            reportText(names(support, r.id)),
            reportText(r.category),
          ]
        : [
            idCell(r.caseNumber),
            reportText(courtText(r.court, r.circuit)),
            partyCell(parties, r.id, 'client'),
            partyCell(parties, r.id, 'opponent'),
            reportText(r.subject),
            dateCell(r.date),
            reportText(r.decision),
            reportText(names(principals, r.id)),
            ...(['principal', 'supporting', 'all'].includes(purpose)
              ? [reportText(names(support, r.id)), reviewer]
              : []),
          ],
    });
  }
  const principalSummary = purpose === 'principal' || purpose === 'all';
  return {
    subtitle: [
      selected ? t.reportSelection.selected : t.lawyerSelection.all,
      selected && !included.length ? t.lawyerSelection.empty : '',
      ['principal', 'supporting', 'all'].includes(purpose) ? t.lawyerReports.reviewerNote : '',
      principalSummary ? t.lawyerReports.summaryNote : '',
    ]
      .filter(Boolean)
      .join('\n'),
    sections: [{ id: purpose, title: '', groups: [...groups.values()] }],
    totals: [
      { label: t.lawyerReports.distinctMatters, value: integer(included.length) },
      ...(!distribution
        ? [{ label: t.matterReports.hearingCount, value: integer(included.length) }]
        : []),
      ...(selected
        ? [
            { label: t.lawyerSelection.relevantSaved, value: integer(rows.length) },
            { label: t.reportSelection.includedCount, value: integer(included.length) },
            {
              label: t.reportSelection.excludedCount,
              value: integer(rows.length - included.length),
            },
          ]
        : []),
      ...(principalSummary
        ? [
            { label: t.lawyerReports.unassigned, value: integer(unassigned) },
            ...[...summary.entries()]
              .sort(([a], [b]) => a - b)
              .map(([id, p]) => ({
                label: `${t.lawyerReports.principalCredit} — ${p.name} [${id}]`,
                value: integer(p.matters.size),
              })),
          ]
        : []),
    ],
  };
}
