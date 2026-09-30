import { Prisma } from '@/generated/prisma/client';
import { t } from '@/strings';
import { partyCell, reportParties, reportText } from './client-report-data';
import {
  ReportError,
  type ReportColumn,
  type ReportDefinition,
  type ReportParameters,
} from './types';

const recordColumns: readonly ReportColumn[] = [
  { key: 'client', label: t.fields.client, width: 30 },
  { key: 'caseNumber', label: t.fields.caseNumber, width: 30 },
  { key: 'clientParty', label: t.clientReports.clientParty, width: 40 },
  { key: 'opponentParty', label: t.clientReports.opponentParty, width: 40 },
  { key: 'subject', label: t.fields.subject, width: 50 },
  { key: 'category', label: t.matters.filters.category, width: 25 },
  { key: 'degree', label: t.matters.filters.degree, width: 25 },
  { key: 'leadLawyer', label: t.matterReports.leadLawyer, width: 30 },
];
const historyDetails: readonly ReportColumn[] = [
  ...recordColumns,
  { key: 'status', label: t.matters.filters.status, width: 25 },
  { key: 'importance', label: t.matters.importance, width: 25 },
];

function definition(cover: boolean): ReportDefinition {
  return {
    descriptor: {
      id: cover ? 'matter-file-cover' : 'matter-hearing-history',
      version: '1',
      title: cover ? t.matterReports.coverTitle : t.matterReports.historyTitle,
      description: cover ? t.matterReports.coverDescription : t.matterReports.historyDescription,
      parameters: { matter: { required: true, help: t.matterReports.matterHelp } },
      layout: cover ? 'cover' : 'flat',
      clientFacing: true,
      countLabel: cover ? t.clientReports.matterCount : t.matterReports.hearingCount,
      permissions: [
        { area: 'clients', action: 'view' },
        { area: 'matters', action: 'view' },
        { area: 'staff', action: 'view' },
        { area: 'clientLogoUpload', action: 'view' },
        ...(!cover ? [{ area: 'hearings' as const, action: 'view' as const }] : []),
      ],
      columns: cover
        ? recordColumns
        : [
            { key: 'date', label: t.fields.hearingDate, width: 18 },
            { key: 'decision', label: t.fields.decision, width: 55 },
            { key: 'action', label: t.hearings.action, width: 25 },
            { key: 'court', label: t.fields.court, width: 30 },
            { key: 'circuit', label: t.fields.circuit, width: 20 },
            { key: 'attendees', label: t.fields.attendees, width: 30 },
          ],
      ...(!cover ? { details: historyDetails } : {}),
    },
    query: (tx, parameters) => readMatterRecord(tx, parameters, cover),
  };
}

export const matterRecordReports = [definition(false), definition(true)] as const;

async function readMatterRecord(
  tx: Prisma.TransactionClient,
  parameters: ReportParameters,
  cover: boolean,
) {
  if (parameters.matter?.kind !== 'id') throw new ReportError('invalid', ['matter']);
  const id = parameters.matter.id;
  const matter = await tx.matter.findUnique({
    where: { id },
    select: {
      id: true,
      caseNumberAr: true,
      subject: true,
      status: true,
      clientId: true,
      client: { select: { nameAr: true } },
      matterCategory: { select: { labelAr: true } },
      degree: { select: { labelAr: true } },
      importance: { select: { labelAr: true } },
    },
  });
  if (!matter) throw new ReportError('invalid', ['matter']);
  const parties = await reportParties(tx, [id]);
  const leads = await tx.matterLawyer.findMany({
    where: { matterId: id, role: { in: ['lead', 'co_lead'] }, isRetired: false },
    orderBy: [{ position: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    select: { person: { select: { nameAr: true } } },
  });
  const logos =
    matter.clientId === null
      ? []
      : await tx.clientLogo.findMany({
          where: { clientId: matter.clientId, isArchived: false },
          select: {
            clientId: true,
            relativePath: true,
            fileName: true,
            contentType: true,
            byteSize: true,
            sha256: true,
          },
        });
  if (logos.length > 1) throw new ReportError('generation');
  const cells = [
    reportText(matter.client?.nameAr ?? null),
    matter.caseNumberAr === null
      ? { type: 'null' as const }
      : { type: 'identifier' as const, value: matter.caseNumberAr },
    partyCell(parties, id, 'client'),
    partyCell(parties, id, 'opponent'),
    reportText(matter.subject),
    reportText(matter.matterCategory?.labelAr ?? null),
    reportText(matter.degree?.labelAr ?? null),
    reportText(leads.length ? leads.map((row) => row.person.nameAr).join('\n') : null),
  ];
  const header = {
    subtitle: matter.client?.nameAr ?? '',
    clientBrand: { name: matter.client?.nameAr ?? t.common.notRecorded, logo: logos[0] ?? null },
    totals: [],
  };
  if (cover)
    return {
      ...header,
      sections: [
        {
          id: 'record',
          title: '',
          groups: [{ id: 'matter', title: '', rows: [{ id: `matter:${id}`, cells }] }],
        },
      ],
    };
  const hearings = await tx.$queryRaw<
    {
      id: number;
      date: string | null;
      decision: string | null;
      action: string | null;
      court: string | null;
      circuit: string | null;
      attendees: (string | null)[] | null;
    }[]
  >(Prisma.sql`
    SELECT h.id,h.hearing_date::text AS date,h.decision,a.label_ar AS action,c.label_ar AS court,h.circuit,
      (SELECT jsonb_agg(p.name_ar ORDER BY coalesce(ha.current_order,ha.ordinal),ha.id)
       FROM public.hearing_attendees ha LEFT JOIN public.people p ON p.id=ha.person_id
       WHERE ha.hearing_id=h.id AND NOT ha.is_retired) AS attendees
    FROM public.hearings h LEFT JOIN public.lookup_hearing_action a ON a.id=h.action_id
    LEFT JOIN public.lookup_court c ON c.id=h.court_id
    WHERE h.matter_id=${id} ORDER BY h.hearing_date ASC NULLS LAST,h.id`);
  return {
    ...header,
    details: [...cells, reportText(matter.status), reportText(matter.importance?.labelAr ?? null)],
    sections: [
      {
        id: 'hearings',
        title: t.hearings.title,
        groups: [
          {
            id: 'history',
            title: '',
            rows: hearings.map((h) => ({
              id: `hearing:${h.id}`,
              cells: [
                h.date === null
                  ? { type: 'null' as const }
                  : { type: 'date' as const, value: h.date },
                reportText(h.decision),
                reportText(h.action),
                reportText(h.court),
                reportText(h.circuit),
                reportText(
                  h.attendees?.length
                    ? h.attendees.map((name) => name ?? t.reports.nullValue).join('\n')
                    : null,
                ),
              ],
            })),
          },
        ],
      },
    ],
  };
}
