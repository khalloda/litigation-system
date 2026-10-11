import { Prisma } from '@/generated/prisma/client';
import { t } from '@/strings';
import type { FeeLetterScope } from '@/lib/fee-letter-query';
import { reportText } from './client-report-data';
import type { ReportDefinition, ReportParameters, ReportData } from './types';
type Link = { id: number; number: string | null; scope: FeeLetterScope | null };
type FeeRow = {
  id: number;
  contractId: number | null;
  client: string | null;
  work: string | null;
  archived: boolean;
  covered: Link[];
  references: { id: number; number: string | null }[];
};
const s = t.feeScope;
/** One fee letter per row. Forward scope never implies reverse synchronization. */
export const feeEngagementReport: ReportDefinition = {
  descriptor: {
    id: 'fee-letter-engagements',
    version: '1',
    title: s.reportTitle,
    description: s.reportDescription,
    layout: 'flat',
    clientFacing: false,
    parameters: {
      client: { required: false, help: t.clientReports.clientHelp },
      matter: { required: false, help: s.reportMatterHelp },
    },
    permissions: [
      { area: 'feeLetters', action: 'view' },
      { area: 'clients', action: 'view' },
      { area: 'matters', action: 'view' },
    ],
    countLabel: s.count,
    columns: [
      { key: 'id', label: t.reports.recordId, width: 12 },
      { key: 'contract', label: t.feeLettersModule.contractId, width: 15 },
      { key: 'client', label: t.fields.client, width: 28 },
      { key: 'work', label: t.feeLettersModule.detailsField, width: 46 },
      { key: 'covered', label: t.feeLettersModule.covered, width: 75 },
      { key: 'referencing', label: t.feeLettersModule.referencing, width: 40 },
      { key: 'archived', label: t.feeLettersModule.archived, width: 12 },
    ],
  },
  query: readFeeEngagementReport,
};
export const feeEngagementQuery = (
  p: ReportParameters,
) => Prisma.sql`SELECT f.id,f.contract_id AS "contractId",c.name_ar client,f.contract_details work,f.is_archived archived,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'number',m.case_number_ar,'scope',public.fee_letter_link_provenance('fee_letter_matters',l.id)->'scope') ORDER BY coalesce(l.current_order,l.ordinal+1),l.id) FROM public.fee_letter_matters l JOIN public.matters m ON m.id=l.matter_id WHERE l.fee_letter_id=f.id AND NOT l.is_retired),'[]') covered,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'number',m.case_number_ar) ORDER BY r.id) FROM public.matter_fee_letter_references r JOIN public.matters m ON m.id=r.matter_id WHERE r.fee_letter_id=f.id AND NOT r.is_retired),'[]') references
 FROM public.fee_letters f LEFT JOIN public.clients c ON c.id=f.client_id
 WHERE true ${p.client.kind === 'id' ? Prisma.sql`AND f.client_id=${p.client.id}` : Prisma.empty}
 ${p.matter?.kind === 'id' ? Prisma.sql`AND EXISTS(SELECT 1 FROM public.fee_letter_matters l WHERE l.fee_letter_id=f.id AND l.matter_id=${p.matter.id} AND NOT l.is_retired)` : Prisma.empty}
 ORDER BY f.id`;
export async function readFeeEngagementReport(
  tx: Prisma.TransactionClient,
  p: ReportParameters,
): Promise<ReportData> {
  const rows = await tx.$queryRaw<FeeRow[]>(Prisma.sql`${feeEngagementQuery(p)}`);
  return {
    subtitle: s.reportDescription,
    sections: [
      {
        id: 'fee-letters',
        title: '',
        groups: [
          {
            id: 'records',
            title: '',
            rows: rows.map((r) => ({
              id: 'fee-letter:' + r.id,
              cells: [
                { type: 'integer', value: String(r.id) },
                r.contractId === null
                  ? { type: 'null' }
                  : { type: 'identifier', value: String(r.contractId) },
                reportText(r.client),
                reportText(r.work),
                reportText(
                  r.covered.length
                    ? r.covered
                        .map((l) =>
                          [
                            l.number ?? String(l.id),
                            ...(l.scope
                              ? [
                                  s.bounded,
                                  s.limitation,
                                  s.proceeding + ': ' + l.scope.covered_proceeding,
                                  s.originalWork + ': ' + l.scope.original_work,
                                  s.statement + ': ' + l.scope.scope_statement,
                                  s.excluded + ': ' + l.scope.excluded_stages,
                                ]
                              : [s.recorded]),
                          ].join('\n'),
                        )
                        .join('\n\n')
                    : null,
                ),
                reportText(
                  r.references.length
                    ? r.references.map((l) => l.number ?? String(l.id)).join('\n')
                    : null,
                ),
                { type: 'boolean', value: r.archived },
              ],
            })),
          },
        ],
      },
    ],
    totals: [],
  };
}
