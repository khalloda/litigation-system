import { Prisma } from '@/generated/prisma/client';
import { cairoDate } from '@/lib/cairo-date';
import { t } from '@/strings';
import {
  courtText,
  datedDecision,
  partyCell,
  reportParties,
  reportText,
  requiredClient,
} from './client-report-data';
import { reportDateBounds } from './input';
import {
  ReportError,
  type ReportCell,
  type ReportColumn,
  type ReportData,
  type ReportDefinition,
  type ReportGroup,
  type ReportParameters,
} from './types';

type WorkPurpose = 'destination' | 'all' | 'client';
type DecisionPurpose = 'embedded' | 'destination' | 'all' | 'unnotified';
const textDate = (value: string | null): ReportCell =>
  value === null ? { type: 'null' } : { type: 'date', value };
const identifier = (value: string | null): ReportCell =>
  value === null ? { type: 'null' } : { type: 'identifier', value };
const a = t.administrativeReports;
const contextText = (date: string | null, value: string | null) =>
  datedDecision(date, value === '' ? t.reports.emptyValue : value) ?? t.reports.nullValue;
const baseColumns: readonly ReportColumn[] = [
  { key: 'caseNumber', label: t.fields.caseNumber, width: 22 },
  { key: 'court', label: t.lawyerReports.hearingCourt, width: 24 },
  { key: 'clientParty', label: t.clientReports.clientParty, width: 30 },
  { key: 'opponentParty', label: t.clientReports.opponentParty, width: 30 },
];
function decisionColumns(purpose: DecisionPurpose): readonly ReportColumn[] {
  return [
    ...baseColumns.map((column) =>
      column.key === 'court' && purpose === 'all'
        ? { ...column, label: t.lawyerReports.matterCourt }
        : column,
    ),
    ...(purpose === 'unnotified'
      ? [
          { key: 'subject', label: t.fields.subject, width: 30 },
          { key: 'previousDecision', label: t.hearingReports.previousDecision, width: 32 },
        ]
      : []),
    { key: 'hearingDate', label: t.fields.hearingDate, width: 16 },
    {
      key: 'decision',
      label:
        purpose === 'all' || purpose === 'embedded'
          ? t.hearingReports.shortDecision
          : t.fields.decision,
      width: 38,
    },
    ...(purpose === 'unnotified'
      ? [
          { key: 'notified', label: t.auditHistory.fields.client_notified, width: 14 },
          { key: 'attendees', label: t.fields.attendees, width: 28 },
        ]
      : [{ key: 'nextDate', label: a.nextDate, width: 17 }]),
  ];
}
function workColumns(purpose: WorkPurpose): readonly ReportColumn[] {
  return [
    ...baseColumns.map((column) =>
      column.key === 'court' ? { ...column, label: a.workCourt } : column,
    ),
    ...(purpose === 'client' ? [{ key: 'destination', label: a.workDestination, width: 22 }] : []),
    { key: 'decisions', label: a.chosenDecisions, width: 37 },
    { key: 'requiredWork', label: t.adminWorks.requiredWork, width: 37 },
    { key: 'steps', label: purpose === 'destination' ? a.latestSteps : a.chosenSteps, width: 37 },
    { key: 'status', label: t.adminWorks.status, width: 14 },
    { key: 'createdDate', label: t.adminWorks.createdDate, width: 16 },
    { key: 'age', label: a.age, width: 13 },
  ];
}
const permissions = [
  { area: 'matters', action: 'view' },
  { area: 'hearings', action: 'view' },
  { area: 'clients', action: 'view' },
  { area: 'staff', action: 'view' },
] as const;
const workEntries = [
  ['destination', 'administrative-by-destination', a.destinationTitle, a.destinationDescription],
  ['all', 'administrative-all-destinations', a.allTitle, a.allDescription],
  ['client', 'administrative-by-client', a.clientTitle, a.clientDescription],
] as const;
const decisionEntries = [
  [
    'destination',
    'open-decisions-by-destination',
    a.openDestinationTitle,
    a.openDestinationDescription,
  ],
  ['all', 'open-decisions-all-destinations', a.openAllTitle, a.openAllDescription],
  ['unnotified', 'unnotified-decisions', a.unnotifiedTitle, a.unnotifiedDescription],
] as const;
export const administrativeReports: readonly ReportDefinition[] = [
  ...workEntries.map(([purpose, id, title, description]): ReportDefinition => ({
    descriptor: {
      id,
      version: '1',
      title,
      description,
      layout: 'grouped',
      clientFacing: false,
      parameters:
        purpose === 'destination'
          ? { destination: { required: true, help: a.workDestination } }
          : purpose === 'client'
            ? { client: { required: true, help: t.reports.fields.client } }
            : {},
      columns: workColumns(purpose),
      ...(purpose === 'destination'
        ? {
            sectionColumns: { works: workColumns(purpose), decisions: decisionColumns('embedded') },
          }
        : {}),
      countLabel: purpose === 'destination' ? a.mixedCount : a.workCount,
      permissions: [...permissions, { area: 'administrativeWorks', action: 'view' }],
    },
    query: (tx, parameters, context) =>
      readAdministrative(
        tx,
        parameters,
        purpose,
        cairoDate(new Date(context?.generatedAt ?? new Date().toISOString())),
      ),
  })),
  ...decisionEntries.map(([purpose, id, title, description]): ReportDefinition => ({
    descriptor: {
      id,
      version: '1',
      title,
      description,
      layout: purpose === 'all' ? 'grouped' : 'date-grouped',
      clientFacing: false,
      parameters:
        purpose === 'destination'
          ? { destination: { required: true, help: a.hearingDestination } }
          : {},
      ...(purpose !== 'all'
        ? {
            date: {
              required: true,
              allowOpen: false,
              source: 'date' as const,
              fieldMeaning: purpose === 'unnotified' ? a.unnotifiedPeriod : a.nextDate,
            },
          }
        : {}),
      columns: decisionColumns(purpose),
      countLabel: t.matterReports.hearingCount,
      permissions,
    },
    async query(tx, parameters, context) {
      const groups = await readAdministrativeDecisions(
        tx,
        parameters,
        purpose,
        cairoDate(new Date(context?.generatedAt ?? new Date().toISOString())),
      );
      return { subtitle: '', sections: [{ id: 'decisions', title: '', groups }], totals: [] };
    },
  })),
];

function requiredDestination(parameters: ReportParameters) {
  if (parameters.destination?.kind !== 'id') throw new ReportError('invalid', ['destination']);
  return parameters.destination.id;
}
type Context = { id: number; date: string | null; value: string | null; person?: string | null };
type Work = {
  id: number;
  matterId: number;
  caseNumber: string | null;
  court: string | null;
  circuit: string | null;
  destinationId: number | null;
  destination: string | null;
  requiredWork: string | null;
  status: string;
  createdDate: string | null;
  age: number | null;
  hearings: Context[];
  steps: Context[];
};
async function readAdministrative(
  tx: Prisma.TransactionClient,
  parameters: ReportParameters,
  purpose: WorkPurpose,
  today: string,
): Promise<ReportData> {
  const destination = purpose === 'destination' ? requiredDestination(parameters) : null;
  const client = purpose === 'client' ? requiredClient(parameters) : null;
  // Aggregate the two child sets independently, before joining to their work.
  // A 2-hearing / 3-step choice is one work with 2 + 3 contexts, never 6 works.
  const rows = await tx.$queryRaw<Work[]>(Prisma.sql`
    WITH chosen_hearings AS (
      SELECT h.matter_id,jsonb_agg(jsonb_build_object('id',h.id,'date',h.hearing_date::text,'value',h.decision)
        ORDER BY h.hearing_date NULLS LAST,h.id) AS contexts
      FROM public.hearings h JOIN public.administrative_hearing_report_selections s ON s.id=h.id AND s.is_selected
      GROUP BY h.matter_id
    ), followups AS (
      SELECT f.task_id,jsonb_agg(jsonb_build_object('id',f.id,'date',f.action_date::text,'value',f.result,'person',p.name_ar)
        ORDER BY f.action_date NULLS LAST,coalesce(f.current_order,f.source_ordinal) NULLS LAST,f.id) AS contexts
      FROM public.task_actions f LEFT JOIN public.people p ON p.id=f.performed_by_person_id
      WHERE ${
        purpose === 'destination'
          ? Prisma.sql`f.action_date=(SELECT max(last.action_date) FROM public.task_actions last WHERE last.task_id=f.task_id)`
          : Prisma.sql`EXISTS (SELECT 1 FROM public.administrative_step_report_selections s WHERE s.id=f.id AND s.is_selected)`
      }
      GROUP BY f.task_id
    ) SELECT w.id,m.id AS "matterId",m.case_number_ar AS "caseNumber",c.label_ar AS court,w.circuit,
      w.destination_id AS "destinationId",d.label_ar AS destination,w.required_work AS "requiredWork",
      w.status,w.task_created_date::text AS "createdDate",${today}::date-w.task_created_date AS age,
      h.contexts AS hearings,coalesce(f.contexts,'[]'::jsonb) AS steps
    FROM public.admin_tasks w JOIN public.matters m ON m.id=w.matter_id
    JOIN chosen_hearings h ON h.matter_id=m.id LEFT JOIN followups f ON f.task_id=w.id
    LEFT JOIN public.lookup_court c ON c.id=w.court_id
    LEFT JOIN public.lookup_matter_destination d ON d.id=w.destination_id
    WHERE w.status<>'منجزة'
      ${
        purpose === 'destination'
          ? Prisma.sql`AND w.destination_id=${destination}`
          : Prisma.sql`AND f.task_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id=m.client_id)`
      }
      ${purpose === 'client' ? Prisma.sql`AND m.client_id=${client}` : Prisma.empty}
    ORDER BY ${purpose === 'all' ? Prisma.sql`d.label_ar COLLATE "C" NULLS LAST,w.destination_id NULLS LAST,` : Prisma.empty}
      c.label_ar COLLATE "C" NULLS LAST,w.circuit COLLATE "C" NULLS LAST,m.case_number_ar COLLATE "C" NULLS LAST,w.id`);
  const parties = await reportParties(
    tx,
    rows.map((r) => r.matterId),
  );
  const groups = new Map<
    string,
    { id: string; title: string; rows: ReportGroup['rows'][number][] }
  >();
  for (const r of rows) {
    const key =
      purpose === 'all' ? `destination:${r.destinationId ?? 'none'}` : `court:${r.court ?? 'none'}`;
    const group = groups.get(key) ?? {
      id: key,
      title: (purpose === 'all' ? r.destination : r.court) ?? t.reports.nullValue,
      rows: [],
    };
    group.rows.push({
      id: `work:${r.id}`,
      cells: [
        identifier(r.caseNumber),
        reportText(courtText(r.court, r.circuit)),
        partyCell(parties, r.matterId, 'client'),
        partyCell(parties, r.matterId, 'opponent'),
        ...(purpose === 'client' ? [reportText(r.destination)] : []),
        reportText(r.hearings.map((h) => contextText(h.date, h.value)).join('\n\n')),
        reportText(r.requiredWork),
        reportText(
          r.steps.length
            ? r.steps
                .map((step) =>
                  [
                    contextText(step.date, step.value),
                    ...(purpose === 'destination'
                      ? [`${t.adminWorks.person}: ${step.person ?? t.reports.nullValue}`]
                      : []),
                  ].join('\n'),
                )
                .join('\n\n')
            : null,
        ),
        reportText(r.status),
        textDate(r.createdDate),
        r.age === null ? { type: 'null' } : { type: 'integer', value: String(r.age) },
      ],
    });
    groups.set(key, group);
  }
  const decisions =
    purpose === 'destination'
      ? await readAdministrativeDecisions(tx, parameters, 'embedded', today)
      : null;
  return {
    subtitle: a.ageHelp,
    sections: [
      {
        id: 'works',
        title: purpose === 'destination' ? a.workSection : '',
        groups: [...groups.values()],
      },
      ...(decisions ? [{ id: 'decisions', title: a.decisionSection, groups: decisions }] : []),
    ],
    totals: [
      { label: a.workCount, value: { type: 'integer', value: String(rows.length) } },
      ...(decisions
        ? [
            {
              label: t.matterReports.hearingCount,
              value: {
                type: 'integer' as const,
                value: String(decisions.reduce((count, g) => count + g.rows.length, 0)),
              },
            },
          ]
        : []),
    ],
  };
}

type Decision = {
  id: number;
  matterId: number;
  caseNumber: string | null;
  court: string | null;
  circuit: string | null;
  date: string | null;
  nextDate: string | null;
  destinationId: number | null;
  destination: string | null;
  decision: string | null;
  shortDecision: string | null;
  previousDecision: string | null;
  subject: string | null;
  notified: boolean | null;
  attendees: string[];
};
async function readAdministrativeDecisions(
  tx: Prisma.TransactionClient,
  parameters: ReportParameters,
  purpose: DecisionPurpose,
  today: string,
): Promise<ReportGroup[]> {
  const explicit = purpose === 'destination' || purpose === 'unnotified';
  const bounds = explicit ? reportDateBounds(parameters, 'date') : null;
  if (explicit && (!bounds?.gte || !bounds.lt)) throw new ReportError('invalid', ['from', 'to']);
  if (purpose === 'unnotified' && parameters.to! > today) throw new ReportError('invalid', ['to']);
  const destination =
    purpose === 'destination' || purpose === 'embedded' ? requiredDestination(parameters) : null;
  const rows = await tx.$queryRaw<Decision[]>(Prisma.sql`
    SELECT h.id,m.id AS "matterId",m.case_number_ar AS "caseNumber",
      c.label_ar AS court,${purpose === 'all' ? Prisma.sql`m.circuit` : Prisma.sql`h.circuit`} AS circuit,
      h.hearing_date::text AS date,h.next_hearing_date::text AS "nextDate",
      m.destination_id AS "destinationId",d.label_ar AS destination,h.decision,
      h.short_decision AS "shortDecision",h.previous_decision AS "previousDecision",m.subject,
      h.client_notified AS notified,
      coalesce((SELECT jsonb_agg(p.name_ar ORDER BY coalesce(ha.current_order,ha.ordinal),ha.id)
        FROM public.hearing_attendees ha JOIN public.people p ON p.id=ha.person_id
        WHERE ha.hearing_id=h.id AND NOT ha.is_retired),'[]'::jsonb) AS attendees
    FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id
    LEFT JOIN public.lookup_court c ON c.id=${purpose === 'all' ? Prisma.sql`m.court_id` : Prisma.sql`h.court_id`}
    LEFT JOIN public.lookup_matter_destination d ON d.id=m.destination_id
    WHERE m.status='سارية'
      ${
        purpose === 'unnotified'
          ? Prisma.sql`AND h.decision IS NOT NULL AND h.client_notified IS FALSE
        AND EXISTS (SELECT 1 FROM public.matter_lawyers l WHERE l.matter_id=m.id AND NOT l.is_retired AND l.role IN ('lead','co_lead'))`
          : Prisma.sql`AND EXISTS (SELECT 1 FROM public.administrative_hearing_report_selections s WHERE s.id=h.id AND s.is_selected)`
      }
      ${purpose === 'all' || purpose === 'unnotified' ? Prisma.sql`AND EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id=m.client_id)` : Prisma.empty}
      ${destination !== null ? Prisma.sql`AND h.destination_id=${destination}` : Prisma.empty}
      ${purpose === 'embedded' || purpose === 'all' ? Prisma.sql`AND h.next_hearing_date<${today}::date` : Prisma.empty}
      ${
        purpose === 'embedded'
          ? Prisma.sql`AND h.next_hearing_date=(SELECT max(hm.next_hearing_date)
        FROM public.hearings hm JOIN public.lookup_hearing_action action ON action.id=hm.action_id
        WHERE hm.matter_id=m.id AND action.label_ar='محكمة')`
          : Prisma.empty
      }
      ${
        bounds
          ? purpose === 'unnotified'
            ? Prisma.sql`AND h.hearing_date>=${bounds.gte}::date AND h.hearing_date<${bounds.lt}::date`
            : Prisma.sql`AND h.next_hearing_date>=${bounds.gte}::date AND h.next_hearing_date<${bounds.lt}::date`
          : Prisma.empty
      }
    ORDER BY ${purpose === 'all' ? Prisma.sql`d.label_ar COLLATE "C" NULLS LAST,m.destination_id NULLS LAST,` : Prisma.empty}
      ${
        purpose === 'embedded'
          ? Prisma.sql`c.label_ar COLLATE "C" NULLS LAST,h.hearing_date NULLS LAST,`
          : purpose === 'destination'
            ? Prisma.sql`h.next_hearing_date,c.label_ar COLLATE "C" NULLS LAST,`
            : Prisma.sql`h.hearing_date NULLS LAST,c.label_ar COLLATE "C" NULLS LAST,`
      }
      ${purpose === 'all' ? Prisma.sql`m.circuit` : Prisma.sql`h.circuit`} COLLATE "C" NULLS LAST,h.id`);
  const parties = await reportParties(
    tx,
    rows.map((r) => r.matterId),
  );
  const groups = new Map<
    string,
    { id: string; title: string; date?: string; rows: ReportGroup['rows'][number][] }
  >();
  for (const r of rows) {
    const date = purpose === 'destination' ? r.nextDate : r.date;
    const key =
      purpose === 'all'
        ? `destination:${r.destinationId ?? 'none'}`
        : purpose === 'embedded'
          ? `court:${r.court ?? 'none'}`
          : date!;
    const group = groups.get(key) ?? {
      id: key,
      title:
        (purpose === 'all' ? r.destination : purpose === 'embedded' ? r.court : date) ??
        t.reports.nullValue,
      ...(explicit ? { date: date! } : {}),
      rows: [],
    };
    group.rows.push({
      id: `hearing:${r.id}`,
      cells: [
        identifier(r.caseNumber),
        reportText(courtText(r.court, r.circuit)),
        partyCell(parties, r.matterId, 'client'),
        partyCell(parties, r.matterId, 'opponent'),
        ...(purpose === 'unnotified'
          ? [reportText(r.subject), reportText(r.previousDecision)]
          : []),
        textDate(r.date),
        reportText(purpose === 'all' || purpose === 'embedded' ? r.shortDecision : r.decision),
        ...(purpose === 'unnotified'
          ? [
              { type: 'boolean' as const, value: r.notified! },
              reportText(r.attendees.length ? r.attendees.join('\n') : null),
            ]
          : [textDate(r.nextDate)]),
      ],
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}
