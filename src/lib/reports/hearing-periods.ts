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

type Purpose = 'next' | 'decisions' | 'preliminary' | 'final';
const entries = [
  ['next', 'hearings-by-next-date', t.hearingReports.nextTitle, t.hearingReports.nextDescription],
  [
    'decisions',
    'hearing-decisions-by-date',
    t.hearingReports.decisionsTitle,
    t.hearingReports.decisionsDescription,
  ],
  [
    'preliminary',
    'hearing-distribution-preliminary',
    t.hearingReports.preliminaryTitle,
    t.hearingReports.preliminaryDescription,
  ],
  [
    'final',
    'hearing-distribution-final',
    t.hearingReports.finalTitle,
    t.hearingReports.finalDescription,
  ],
] as const;

/** Four different Access purposes. Each retains the qualifying hearing itself;
 * neither report flags nor a latest-hearing choice constrain these lists. */
export const hearingPeriodReports: readonly ReportDefinition[] = entries.map(
  ([purpose, id, title, description]) => ({
    descriptor: {
      id,
      version: '1',
      title,
      description,
      date: {
        required: true,
        allowOpen: false,
        source: 'date',
        fieldMeaning:
          purpose === 'decisions' ? t.fields.hearingDate : t.lawyerReports.nextHearingPeriod,
      },
      parameters: {},
      layout: 'date-grouped',
      clientFacing: false,
      countLabel: t.matterReports.hearingCount,
      permissions: [
        { area: 'matters', action: 'view' },
        { area: 'hearings', action: 'view' },
        { area: 'staff', action: 'view' },
      ],
      columns: [
        { key: 'caseNumber', label: t.fields.caseNumber, width: 25 },
        { key: 'court', label: t.fields.court, width: 29 },
        { key: 'clientParty', label: t.clientReports.clientParty, width: 35 },
        { key: 'opponentParty', label: t.clientReports.opponentParty, width: 35 },
        { key: 'subject', label: t.fields.subject, width: 40 },
        {
          key: 'decision',
          label:
            purpose === 'next'
              ? t.hearingReports.previousDecision
              : purpose === 'decisions'
                ? t.fields.decision
                : t.hearingReports.shortDecision,
          width: 42,
        },
        {
          key: 'people',
          label: purpose === 'preliminary' ? t.hearingReports.assignments : t.fields.attendees,
          width: 30,
        },
      ],
    },
    query: (tx, parameters) => readHearingPeriod(tx, parameters, purpose),
  }),
);

async function readHearingPeriod(
  tx: Prisma.TransactionClient,
  parameters: ReportParameters,
  purpose: Purpose,
): Promise<ReportData> {
  const bounds = reportDateBounds(parameters, 'date');
  if (!bounds.gte || !bounds.lt) throw new ReportError('invalid', ['from', 'to']);
  const period =
    purpose === 'decisions' ? Prisma.sql`h.hearing_date` : Prisma.sql`h.next_hearing_date`;
  const distribution = purpose === 'preliminary' || purpose === 'final';
  const order =
    purpose === 'final'
      ? Prisma.sql`mc.label_ar COLLATE "C" NULLS LAST,m.circuit COLLATE "C" NULLS LAST`
      : purpose === 'preliminary'
        ? Prisma.sql`hc.label_ar COLLATE "C" NULLS LAST`
        : Prisma.sql`hc.label_ar COLLATE "C" NULLS LAST,h.circuit COLLATE "C" NULLS LAST`;
  const rows = await tx.$queryRaw<
    {
      id: number;
      matterId: number;
      date: string;
      hearingDate: string | null;
      caseNumber: string | null;
      court: string | null;
      circuit: string | null;
      subject: string | null;
      decision: string | null;
      previousDecision: string | null;
      shortDecision: string | null;
      attendees: string[];
      assignments: { name: string; role: 'lead' | 'co_lead' | 'support' }[];
    }[]
  >(Prisma.sql`
    SELECT h.id,m.id AS "matterId",${period}::text AS date,h.hearing_date::text AS "hearingDate",
      m.case_number_ar AS "caseNumber",hc.label_ar AS court,h.circuit,m.subject,h.decision,
      h.previous_decision AS "previousDecision",h.short_decision AS "shortDecision",
      coalesce((SELECT jsonb_agg(p.name_ar ORDER BY coalesce(a.current_order,a.ordinal),a.id)
        FROM public.hearing_attendees a JOIN public.people p ON p.id=a.person_id
        WHERE a.hearing_id=h.id AND NOT a.is_retired),'[]'::jsonb) AS attendees,
      coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.name_ar,'role',ml.role)
        ORDER BY CASE ml.role WHEN 'lead' THEN 0 WHEN 'co_lead' THEN 1 ELSE 2 END,
          ml.position NULLS LAST,ml.person_id,ml.id)
        FROM public.matter_lawyers ml JOIN public.people p ON p.id=ml.person_id
        WHERE ml.matter_id=m.id AND NOT ml.is_retired),'[]'::jsonb) AS assignments
    FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id
    LEFT JOIN public.lookup_court hc ON hc.id=h.court_id
    LEFT JOIN public.lookup_court mc ON mc.id=m.court_id
    WHERE ${period}>=${bounds.gte}::date AND ${period}<${bounds.lt}::date
      ${distribution ? Prisma.sql`AND m.status='سارية'` : Prisma.empty}
    ORDER BY ${period},${order},m.case_number_ar COLLATE "C" NULLS LAST,h.id`);
  const parties = await reportParties(
    tx,
    rows.map((r) => r.matterId),
  );
  const groups = new Map<
    string,
    { id: string; date: string; title: string; rows: ReportGroup['rows'][number][] }
  >();
  for (const r of rows) {
    let group = groups.get(r.date);
    if (!group) {
      group = { id: r.date, date: r.date, title: '', rows: [] };
      groups.set(r.date, group);
    }
    const decision =
      purpose === 'next'
        ? r.previousDecision
        : purpose === 'decisions'
          ? r.decision
          : // Exact Access exception; this is a source value, not display vocabulary.
            purpose === 'preliminary' && r.shortDecision === 'أول  جلسة'
            ? r.shortDecision
            : datedDecision(r.hearingDate, r.shortDecision);
    const names =
      purpose === 'preliminary'
        ? r.assignments.map((a) => `${t.matters.lawyerRoles[a.role]}: ${a.name}`)
        : r.attendees;
    group.rows.push({
      id: `hearing:${r.id}`,
      cells: [
        r.caseNumber === null ? { type: 'null' } : { type: 'identifier', value: r.caseNumber },
        reportText(courtText(r.court, r.circuit)),
        partyCell(parties, r.matterId, 'client'),
        partyCell(parties, r.matterId, 'opponent'),
        reportText(r.subject),
        reportText(decision),
        reportText(names.length ? names.join('\n') : null),
      ],
    });
  }
  return {
    subtitle: '',
    sections: [{ id: 'hearings', title: '', groups: [...groups.values()] }],
    totals: [
      {
        label: t.lawyerReports.distinctMatters,
        value: { type: 'integer', value: String(new Set(rows.map((r) => r.matterId)).size) },
      },
    ],
  };
}
