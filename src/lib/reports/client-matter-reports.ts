import { Prisma } from '@/generated/prisma/client';
import { t } from '@/strings';
import {
  courtText,
  partyCell,
  reportClientName,
  reportParties,
  reportText,
  requiredClient,
} from './client-report-data';
import { reportDateBounds } from './input';
import {
  ReportError,
  type ReportColumn,
  type ReportData,
  type ReportDefinition,
  type ReportGroup,
  type ReportParameters,
} from './types';

type Variant =
  | 'branches'
  | 'matters'
  | 'branch-matters'
  | 'branch-finance'
  | 'evaluation'
  | 'branch-evaluation-finance'
  | 'status';
type Configuration = Readonly<{
  variant: Variant;
  title: string;
  grouped?: boolean;
  branch?: boolean;
  active?: boolean;
  matterCourt?: boolean;
  separateCircuit?: boolean;
  evaluation?: boolean;
  finance?: boolean;
}>;
const configurations: readonly Configuration[] = [
  { variant: 'branches', title: t.clientReports.branchesTitle, grouped: true, matterCourt: true },
  { variant: 'matters', title: t.clientReports.mattersTitle, active: true },
  {
    variant: 'branch-matters',
    title: t.clientReports.branchMattersTitle,
    branch: true,
    matterCourt: true,
    separateCircuit: true,
  },
  {
    variant: 'branch-finance',
    title: t.clientReports.branchFinanceTitle,
    branch: true,
    finance: true,
  },
  {
    variant: 'evaluation',
    title: t.clientReports.evaluationTitle,
    grouped: true,
    active: true,
    matterCourt: true,
    evaluation: true,
  },
  {
    variant: 'branch-evaluation-finance',
    title: t.clientReports.evaluationFinanceTitle,
    grouped: true,
    evaluation: true,
    finance: true,
  },
  { variant: 'status', title: t.clientReports.statusTitle, matterCourt: true },
];

function definition(config: Configuration): ReportDefinition {
  const status = config.variant === 'status';
  const columns: ReportColumn[] = [
    { key: 'caseNumber', label: t.fields.caseNumber, width: 25 },
    { key: 'court', label: t.fields.court, width: 25 },
    ...(config.separateCircuit ? [{ key: 'circuit', label: t.fields.circuit, width: 15 }] : []),
    { key: 'clientParty', label: t.clientReports.clientParty, width: 35 },
    { key: 'opponentParty', label: t.clientReports.opponentParty, width: 35 },
    { key: 'subject', label: t.fields.subject, width: 45 },
    { key: 'latest', label: t.clientReports.latestDecision, width: 40 },
    ...(config.evaluation
      ? [{ key: 'evaluation', label: t.clientReports.evaluation, width: 20 }]
      : []),
    ...(config.finance ? [{ key: 'provision', label: t.clientReports.provision, width: 25 }] : []),
  ];
  return {
    descriptor: {
      id: `client-${config.variant}`,
      version: '1',
      title: config.title,
      description: config.active
        ? t.clientReports.activeDescription
        : status || config.variant === 'branches'
          ? t.clientReports.latestDescription
          : t.clientReports.qualifiedDescription,
      parameters: {
        client: { required: true, help: t.clientReports.clientHelp },
        ...(config.branch
          ? { branch: { required: true, unassigned: true, help: t.clientReports.branchHelp } }
          : {}),
        ...(status ? { lawyer: { required: false, help: t.clientReports.lawyerHelp } } : {}),
      },
      ...(status
        ? {
            date: {
              required: false,
              allowOpen: true,
              source: 'date' as const,
              fieldMeaning: t.clientReports.latestPeriod,
            },
            extra: [
              {
                key: 'extra_status',
                label: t.fields.status,
                required: true,
                defaultValue: 'active',
                choices: [
                  { value: 'active', label: t.values.active },
                  { value: 'all', label: t.reports.all },
                ],
              },
            ],
          }
        : {}),
      layout: config.grouped ? 'grouped' : 'flat',
      clientFacing: true,
      countLabel: t.clientReports.matterCount,
      columns,
      permissions: [
        { area: 'clients', action: 'view' },
        { area: 'matters', action: 'view' },
        { area: 'hearings', action: 'view' },
        { area: 'clientLogoUpload', action: 'view' },
        ...(status ? [{ area: 'staff' as const, action: 'view' as const }] : []),
      ],
    },
    query: (tx, parameters) => readClientMatterReport(tx, parameters, config),
  };
}
export const clientMatterReports: readonly ReportDefinition[] = Object.freeze(
  configurations.map(definition),
);

type MatterRow = {
  id: number;
  caseNumber: string | null;
  subject: string | null;
  branchId: number | null;
  branch: string | null;
  matterCourt: string | null;
  matterCircuit: string | null;
  hearingCourt: string | null;
  hearingCircuit: string | null;
  hearingId: number | null;
  date: string | null;
  decision: string | null;
  evaluation: string | null;
  provision: string | null;
};

/** Owner-adopted selection: rank ALL hearings first, then qualify the selected
 * latest record. Never filter decisions/dates before ranking. No archive flag,
 * legacy selection flag, legacy identity or raw relationship fallback is used. */
async function readClientMatterReport(
  tx: Prisma.TransactionClient,
  parameters: ReportParameters,
  config: Configuration,
): Promise<ReportData> {
  const clientId = requiredClient(parameters),
    status = config.variant === 'status';
  if (config.branch && parameters.branch.kind === 'all')
    throw new ReportError('invalid', ['branch']);
  if (status && !['active', 'all'].includes(parameters.extra['extra_status'] ?? ''))
    throw new ReportError('invalid', ['extra_status']);
  const bounds = reportDateBounds(parameters, 'date');
  const active =
    config.active === true || (status && parameters.extra['extra_status'] === 'active');
  const branchId = parameters.branch.kind === 'id' ? parameters.branch.id : null;
  const lawyerId = parameters.lawyer.kind === 'id' ? parameters.lawyer.id : null;
  const needsDecision = !status && config.variant !== 'branches';
  const name = await reportClientName(tx, clientId);
  const rows = await tx.$queryRaw<MatterRow[]>(Prisma.sql`
    WITH latest AS (
      SELECT h.*,row_number() OVER (PARTITION BY h.matter_id ORDER BY h.hearing_date DESC NULLS LAST,h.id DESC) rank
      FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id WHERE m.client_id=${clientId}
    ) SELECT m.id,m.case_number_ar AS "caseNumber",m.subject,m.branch_id AS "branchId",b.label_ar AS branch,
      mc.label_ar AS "matterCourt",m.circuit AS "matterCircuit",hc.label_ar AS "hearingCourt",h.circuit AS "hearingCircuit",
      h.id AS "hearingId",h.hearing_date::text AS date,h.decision,m.evaluation,m.legacy_financial_allocation_raw AS provision
    FROM public.matters m LEFT JOIN latest h ON h.matter_id=m.id AND h.rank=1
    LEFT JOIN public.lookup_client_branch b ON b.id=m.branch_id
    LEFT JOIN public.lookup_court mc ON mc.id=m.court_id LEFT JOIN public.lookup_court hc ON hc.id=h.court_id
    WHERE m.client_id=${clientId} AND (NOT ${active} OR m.status=${t.values.active})
      AND (${status} OR h.id IS NOT NULL)
      AND (NOT ${needsDecision} OR (h.decision IS NOT NULL AND h.decision<>''))
      AND (NOT ${config.branch === true} OR m.branch_id IS NOT DISTINCT FROM ${branchId}::smallint)
      AND (${lawyerId}::int IS NULL OR EXISTS (SELECT 1 FROM public.matter_lawyers l WHERE l.matter_id=m.id AND l.person_id=${lawyerId} AND NOT l.is_retired))
      AND (${bounds.gte}::date IS NULL OR h.hearing_date>=${bounds.gte}::date)
      AND (${bounds.lt}::date IS NULL OR h.hearing_date<${bounds.lt}::date)
    ORDER BY h.hearing_date DESC NULLS LAST,h.id DESC NULLS LAST,m.id`);
  const parties = await reportParties(
    tx,
    rows.map((row) => row.id),
  );
  const logos = await tx.clientLogo.findMany({
    where: { clientId, isArchived: false },
    select: {
      clientId: true,
      relativePath: true,
      fileName: true,
      contentType: true,
      byteSize: true,
      sha256: true,
    },
  });
  if (logos.length > 1) throw new Error('Client logo cardinality differs');
  // PostgreSQL C-style byte order is reproducible, unlike host locale defaults.
  const compare = (a: string | null, b: string | null) =>
    a === null
      ? b === null
        ? 0
        : 1
      : b === null
        ? -1
        : Buffer.compare(Buffer.from(a), Buffer.from(b));
  if (!status)
    rows.sort(
      (a, b) =>
        (config.grouped
          ? compare(a.branch, b.branch) || (a.branchId ?? Infinity) - (b.branchId ?? Infinity)
          : 0) ||
        (config.variant === 'branches' || config.variant === 'evaluation'
          ? compare(
              parties.get(a.id)?.opponent.length ? parties.get(a.id)!.opponent.join('\n\n') : null,
              parties.get(b.id)?.opponent.length ? parties.get(b.id)!.opponent.join('\n\n') : null,
            )
          : 0) ||
        a.id - b.id,
    );
  const groups: { id: string; title: string; rows: Array<ReportGroup['rows'][number]> }[] = [];
  for (const row of rows) {
    const groupId = config.grouped ? `branch:${row.branchId ?? 'unassigned'}` : 'matters';
    let group = groups.at(-1);
    if (group?.id !== groupId) {
      group = {
        id: groupId,
        title: config.grouped ? (row.branch ?? t.reports.unassigned) : '',
        rows: [],
      };
      groups.push(group);
    }
    const court = config.matterCourt ? row.matterCourt : row.hearingCourt;
    const circuit = config.matterCourt ? row.matterCircuit : row.hearingCircuit;
    const latest =
      row.hearingId === null
        ? t.clientReports.noHearing
        : `${row.date === null ? t.clientReports.undated : row.date.replaceAll('-', '/')}\n${row.decision === null ? t.reports.nullValue : row.decision === '' ? t.reports.emptyValue : row.decision}`;
    group.rows.push({
      id: `matter:${row.id}`,
      cells: [
        row.caseNumber === null ? { type: 'null' } : { type: 'identifier', value: row.caseNumber },
        reportText(config.separateCircuit ? court : courtText(court, circuit)),
        ...(config.separateCircuit ? [reportText(circuit)] : []),
        partyCell(parties, row.id, 'client'),
        partyCell(parties, row.id, 'opponent'),
        reportText(row.subject),
        reportText(latest),
        ...(config.evaluation ? [reportText(row.evaluation)] : []),
        ...(config.finance ? [reportText(row.provision)] : []),
      ],
    });
  }
  const branchName = config.branch
    ? parameters.branch.kind === 'unassigned'
      ? t.reports.unassigned
      : ((
          await tx.lookupClientBranch.findUnique({
            where: { id: branchId! },
            select: { labelAr: true },
          })
        )?.labelAr ?? t.reports.unassigned)
    : null;
  return {
    subtitle: branchName === null ? name : `${name}\n(${branchName})`,
    clientBrand: { name, logo: logos[0] ?? null },
    totals: [],
    sections: [{ id: 'matters', title: '', groups }],
  };
}
