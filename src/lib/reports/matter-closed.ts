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
import { ReportError, type ReportDefinition } from './types';

export const closedMatterReport: ReportDefinition = {
  descriptor: {
    id: 'matter-closed',
    version: '1',
    title: t.matterReports.closedTitle,
    description: t.matterReports.closedDescription,
    parameters: { client: { required: true, help: t.clientReports.clientHelp } },
    date: {
      required: true,
      allowOpen: false,
      source: 'date',
      fieldMeaning: t.closedSelection.period,
    },
    extra: [
      {
        key: 'extra_mode',
        label: t.reportSelection.mode,
        required: true,
        defaultValue: 'all',
        choices: [
          { value: 'all', label: t.closedSelection.all },
          { value: 'selected', label: t.reportSelection.selected },
        ],
      },
    ],
    layout: 'flat',
    clientFacing: true,
    countLabel: t.clientReports.matterCount,
    columns: [
      { key: 'caseNumber', label: t.fields.caseNumber, width: 25 },
      { key: 'court', label: t.fields.court, width: 25 },
      { key: 'clientParty', label: t.clientReports.clientParty, width: 35 },
      { key: 'opponentParty', label: t.clientReports.opponentParty, width: 35 },
      { key: 'subject', label: t.fields.subject, width: 45 },
      { key: 'decision', label: t.reportSelection.decision, width: 40 },
    ],
    permissions: [
      { area: 'clients', action: 'view' },
      { area: 'matters', action: 'view' },
      { area: 'hearings', action: 'view' },
      { area: 'clientLogoUpload', action: 'view' },
    ],
  },
  query: readClosedMatterReport,
};
async function readClosedMatterReport(
  tx: Prisma.TransactionClient,
  parameters: import('./types').ReportParameters,
): Promise<import('./types').ReportData> {
  const client = requiredClient(parameters),
    bounds = reportDateBounds(parameters, 'date');
  if (!bounds.gte || !bounds.lt) throw new ReportError('invalid', ['from', 'to']);
  const mode = parameters.extra['extra_mode'];
  if (mode !== 'all' && mode !== 'selected') throw new ReportError('invalid', ['extra_mode']);
  const selected = mode === 'selected',
    name = await reportClientName(tx, client);
  let saved = 0;
  if (selected) {
    const counts = await tx.$queryRaw<{ saved: number; invalid: number }[]>(Prisma.sql`
        SELECT count(*)::int saved,count(*) FILTER(WHERE h.id IS NULL OR h.matter_id<>m.id
          OR h.hearing_date IS NULL OR m.status IS DISTINCT FROM 'منتهية')::int invalid
        FROM public.closed_report_selections s JOIN public.matters m ON m.id=s.id
        LEFT JOIN public.hearings h ON h.id=s.hearing_id WHERE m.client_id=${client} AND s.is_selected`);
    saved = counts[0]!.saved;
    if (counts[0]!.invalid) throw new ReportError('selection-incomplete', ['extra_mode']);
  }
  const rows = await tx.$queryRaw<
    {
      id: number;
      caseNumber: string | null;
      subject: string | null;
      date: string;
      decision: string | null;
      court: string | null;
      circuit: string | null;
    }[]
  >(Prisma.sql`
      WITH ranked AS (SELECT h.*,row_number() OVER(PARTITION BY h.matter_id ORDER BY h.hearing_date DESC NULLS LAST,h.id DESC) rank
        FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id WHERE m.client_id=${client})
      SELECT m.id,m.case_number_ar AS "caseNumber",m.subject,h.hearing_date::text date,h.decision,c.label_ar court,h.circuit
      FROM public.matters m LEFT JOIN public.closed_report_selections s ON s.id=m.id
      JOIN ranked h ON h.matter_id=m.id AND ((${selected} AND s.is_selected AND h.id=s.hearing_id) OR (NOT ${selected} AND h.rank=1))
      LEFT JOIN public.lookup_court c ON c.id=h.court_id
      WHERE m.client_id=${client} AND m.status='منتهية' AND m.subject<>'مطالبة بالأرباح السنوية'
        AND h.hearing_date>=${bounds.gte}::date AND h.hearing_date<${bounds.lt}::date ORDER BY m.id`);
  const parties = await reportParties(
    tx,
    rows.map((r) => r.id),
  );
  const opponent = (id: number) =>
    parties.get(id)?.opponent.length ? parties.get(id)!.opponent.join('\n\n') : null;
  rows.sort((a, b) => {
    const x = opponent(a.id),
      y = opponent(b.id);
    return (
      (x === null
        ? y === null
          ? 0
          : 1
        : y === null
          ? -1
          : Buffer.compare(Buffer.from(x), Buffer.from(y))) || a.id - b.id
    );
  });
  const logos = await tx.clientLogo.findMany({
    where: { clientId: client, isArchived: false },
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
  return {
    subtitle: name + '\n' + t.closedSelection.title,
    clientBrand: { name, logo: logos[0] ?? null },
    totals: selected
      ? [
          {
            label: t.reportSelection.savedCount,
            value: { type: 'integer', value: String(saved) },
          },
          {
            label: t.reportSelection.includedCount,
            value: { type: 'integer', value: String(rows.length) },
          },
          {
            label: t.reportSelection.excludedCount,
            value: { type: 'integer', value: String(saved - rows.length) },
          },
        ]
      : [],
    sections: [
      {
        id: 'closed',
        title: '',
        groups: [
          {
            id: 'matters',
            title: '',
            rows: rows.map((r) => ({
              id: `matter:${r.id}`,
              cells: [
                r.caseNumber === null
                  ? { type: 'null' }
                  : { type: 'identifier', value: r.caseNumber },
                reportText(courtText(r.court, r.circuit)),
                partyCell(parties, r.id, 'client'),
                partyCell(parties, r.id, 'opponent'),
                reportText(r.subject),
                reportText(datedDecision(r.date, r.decision)),
              ],
            })),
          },
        ],
      },
    ],
  };
}
