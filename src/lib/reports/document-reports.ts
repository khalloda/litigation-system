import { Prisma } from '@/generated/prisma/client';
import { t } from '@/strings';
import { reportClientName, reportText, requiredClient } from './client-report-data';
import {
  ReportError,
  type ReportCell,
  type ReportColumn,
  type ReportData,
  type ReportDefinition,
  type ReportGroup,
  type ReportParameters,
} from './types';

type Purpose = 'inventory' | 'client' | 'card';
const s = t.documentReports;
const idCell = (v: string | null): ReportCell =>
  v === null ? { type: 'null' } : { type: 'identifier', value: v };
const dateCell = (v: string | null): ReportCell =>
  v === null ? { type: 'null' } : { type: 'date', value: v };
const numberCell = (v: number | null): ReportCell =>
  v === null ? { type: 'null' } : { type: 'integer', value: String(v) };
const poaColumns: readonly ReportColumn[] = [
  { key: 'serial', label: t.poa.serial, width: 14 },
  { key: 'principal', label: t.poa.principal, width: 28 },
  { key: 'capacity', label: t.poa.capacity, width: 25 },
  { key: 'number', label: t.poa.number, width: 14 },
  { key: 'letter', label: t.poa.letter, width: 12 },
  { key: 'year', label: t.poa.year, width: 10 },
  { key: 'issuer', label: t.poa.issuer, width: 22 },
  { key: 'issueDate', label: t.poa.issueDate, width: 24 },
  { key: 'lawyers', label: t.poa.currentLawyers, width: 38 },
  { key: 'sourceLawyers', label: s.historicalLawyers, width: 38 },
  { key: 'copies', label: t.poa.copies, width: 16 },
  { key: 'notes', label: t.fields.notes, width: 32 },
];
const documentColumns: readonly ReportColumn[] = [
  { key: 'recordId', label: t.reports.recordId, width: 15 },
  { key: 'serial', label: t.reports.sourceSerial, width: 18 },
  { key: 'caseNumber', label: t.fields.caseNumber, width: 22 },
  { key: 'description', label: t.documentsModule.description, width: 50 },
  { key: 'documentDate', label: t.documentsModule.documentDate, width: 26 },
  { key: 'pages', label: t.documentsModule.pageCount, width: 16 },
  { key: 'sourcePages', label: s.historicalPages, width: 22 },
  { key: 'depositDate', label: t.documentsModule.depositDate, width: 26 },
  { key: 'person', label: t.documentsModule.responsible, width: 20 },
  { key: 'storage', label: t.documentsModule.storageLocation, width: 20 },
  { key: 'notes', label: t.fields.notes, width: 28 },
  { key: 'mfiles', label: t.documentsModule.mfilesId, width: 14 },
];
const headerColumns: readonly ReportColumn[] = [
  { key: 'client', label: t.fields.client, width: 30 },
  { key: 'fileNumber', label: s.fileNumber, width: 15 },
];
const poaEntries = [
  ['inventory', 'poa-inventory', s.poaInventoryTitle, s.poaInventoryDescription],
  ['client', 'client-poas', s.clientPoaTitle, s.clientPoaDescription],
  ['card', 'poa-movement-card', s.poaCardTitle, s.cardDescription],
] as const;
const documentEntries = [
  ['inventory', 'document-inventory', s.documentsInventoryTitle, s.documentsInventoryDescription],
  ['client', 'client-documents', s.clientDocumentsTitle, s.clientDocumentsDescription],
  ['card', 'document-movement-card', s.documentCardTitle, s.cardDescription],
] as const;
export const documentReports: readonly ReportDefinition[] = [
  ...poaEntries.map(([purpose, id, title, description]): ReportDefinition => ({
    descriptor: {
      id,
      version: '1',
      title,
      description,
      layout: purpose === 'card' ? 'card' : purpose === 'client' ? 'flat' : 'grouped',
      clientFacing: false,
      parameters:
        purpose === 'client'
          ? { client: { required: true, help: t.clientReports.clientHelp } }
          : purpose === 'card'
            ? { poa: { required: true, help: s.cardDescription } }
            : {},
      countLabel: s.poaCount,
      permissions: [
        { area: 'powersOfAttorney', action: 'view' },
        { area: 'clients', action: 'view' },
        { area: 'staff', action: 'view' },
      ],
      columns:
        purpose === 'card'
          ? [
              { key: 'recordId', label: t.reports.recordId, width: 12 },
              ...headerColumns,
              ...poaColumns,
            ]
          : purpose === 'inventory'
            ? [{ key: 'fileNumber', label: s.fileNumber, width: 12 }, ...poaColumns]
            : poaColumns,
      ...(purpose === 'card'
        ? {
            manual: {
              kind: 'poa-movement' as const,
              heading: s.poaMovement,
              lines: 25,
              labels: [
                s.receivedDate,
                s.recipientSignature,
                s.poaPurpose,
                s.expectedReturn,
                s.actualReturn,
                s.administratorSignature,
              ],
            },
          }
        : {}),
    },
    query: (tx, p) => readPoaReport(tx, p, purpose),
  })),
  ...documentEntries.map(([purpose, id, title, description]): ReportDefinition => ({
    descriptor: {
      id,
      version: '1',
      title,
      description,
      layout: purpose === 'card' ? 'card' : purpose === 'client' ? 'flat' : 'grouped',
      clientFacing: false,
      parameters:
        purpose === 'client'
          ? { client: { required: true, help: t.clientReports.clientHelp } }
          : purpose === 'card'
            ? { document: { required: true, help: s.cardDescription } }
            : {},
      countLabel: s.documentCount,
      permissions: [
        { area: 'documents', action: 'view' },
        { area: 'clients', action: 'view' },
        { area: 'matters', action: 'view' },
        { area: 'staff', action: 'view' },
      ],
      columns:
        purpose === 'card'
          ? [
              ...headerColumns,
              ...documentColumns,
              { key: 'movementReference', label: t.documentsModule.movementCard, width: 20 },
            ]
          : purpose === 'inventory'
            ? [
                { key: 'fileNumber', label: s.fileNumber, width: 12 },
                ...documentColumns,
                { key: 'clientStorage', label: s.clientStorage, width: 20 },
              ]
            : documentColumns,
      ...(purpose === 'card'
        ? {
            manual: {
              kind: 'document-movement' as const,
              heading: s.documentMovement,
              lines: 3,
              labels: [
                s.receivedDate,
                s.recipient,
                s.job,
                s.documentPurpose,
                s.expectedReturn,
                s.recipientSignature,
                s.actualReturn,
                s.keeper,
              ],
            },
          }
        : {}),
    },
    query: (tx, p) => readDocumentReport(tx, p, purpose),
  })),
];
type Poa = {
  id: number;
  clientId: number | null;
  client: string | null;
  storage: string | null;
  serial: string | null;
  principal: string | null;
  capacity: string | null;
  number: string | null;
  letter: string | null;
  year: string | null;
  issuer: string | null;
  issueDate: string | null;
  copies: number | null;
  notes: string | null;
  sourceLawyers: string | null;
  lawyers: string[];
};
async function readPoaReport(
  tx: Prisma.TransactionClient,
  parameters: ReportParameters,
  purpose: Purpose,
): Promise<ReportData> {
  const client = purpose === 'client' ? requiredClient(parameters) : null;
  if (purpose === 'card' && parameters.poa?.kind !== 'id')
    throw new ReportError('invalid', ['poa']);
  const record = parameters.poa?.kind === 'id' ? parameters.poa.id : null;
  const rows = await tx.$queryRaw<Poa[]>(Prisma.sql`
    SELECT p.id,p.client_id AS "clientId",c.name_ar AS client,c.poa_location AS storage,
      p.serial_no AS serial,p.principal_name AS principal,p.poa_capacity AS capacity,
      p.poa_number AS number,p.poa_letter AS letter,p.poa_year AS year,p.issuing_authority AS issuer,
      p.issue_date::text AS "issueDate",p.copies_count AS copies,p.notes,p.legacy_lawyers_raw AS "sourceLawyers",
      coalesce((SELECT jsonb_agg(person.name_ar ORDER BY (l.current_order IS NOT NULL),l.source_member_ordinal NULLS LAST,l.current_order,l.id)
        FROM public.power_of_attorney_lawyers l JOIN public.people person ON person.id=l.person_id
        WHERE l.power_of_attorney_id=p.id AND NOT l.is_retired),'[]'::jsonb) AS lawyers
    FROM public.powers_of_attorney p LEFT JOIN public.clients c ON c.id=p.client_id
    WHERE ${purpose === 'card' ? Prisma.sql`p.id=${record}` : Prisma.sql`p.show_on_poa_report IS TRUE AND c.id IS NOT NULL`}
      ${purpose === 'inventory' ? Prisma.sql`AND c.poa_location<>'تم تسليمه للعميل'` : Prisma.empty}
      ${purpose === 'client' ? Prisma.sql`AND p.client_id=${client}` : Prisma.empty}
    ORDER BY ${purpose === 'inventory' ? Prisma.sql`c.poa_location COLLATE "C" DESC NULLS LAST,c.id,c.name_ar COLLATE "C",` : Prisma.empty}
      p.serial_no COLLATE "C" NULLS LAST,p.id`);
  if (purpose === 'card' && rows.length !== 1) throw new ReportError('invalid', ['poa']);
  const groups = new Map<
    string,
    { id: string; title: string; rows: ReportGroup['rows'][number][] }
  >();
  for (const r of rows) {
    const key = purpose === 'inventory' ? `client:${r.clientId}` : 'records';
    const g = groups.get(key) ?? {
      id: key,
      title:
        purpose === 'inventory'
          ? `${r.storage ?? t.reports.nullValue}\n${r.client ?? t.reports.nullValue}`
          : '',
      rows: [],
    };
    g.rows.push({
      id: `poa:${r.id}`,
      ...(purpose !== 'card' && r.copies === 0 ? { highlight: 'attention' as const } : {}),
      cells: [
        ...(purpose === 'card'
          ? [numberCell(r.id), reportText(r.client), numberCell(r.clientId)]
          : purpose === 'inventory'
            ? [numberCell(r.clientId)]
            : []),
        idCell(r.serial),
        reportText(r.principal),
        reportText(r.capacity),
        idCell(r.number),
        idCell(r.letter),
        idCell(r.year),
        reportText(r.issuer),
        dateCell(r.issueDate),
        reportText(r.lawyers.length ? r.lawyers.join('\n') : null),
        reportText(r.sourceLawyers),
        numberCell(r.copies),
        reportText(r.notes),
      ],
    });
    groups.set(key, g);
  }
  return {
    subtitle: client !== null ? await reportClientName(tx, client) : '',
    sections: [{ id: 'poas', title: '', groups: [...groups.values()] }],
    totals:
      purpose === 'card'
        ? []
        : [
            {
              label: s.positivePoaCount,
              value: numberCell(rows.filter((r) => r.copies !== null && r.copies > 0).length),
            },
            { label: s.zeroPoaCount, value: numberCell(rows.filter((r) => r.copies === 0).length) },
            {
              label: s.unknownPoaCount,
              value: numberCell(rows.filter((r) => r.copies === null).length),
            },
          ],
  };
}
type Document = {
  id: number;
  serial: number | null;
  clientId: number | null;
  client: string | null;
  clientStorage: string | null;
  caseNumber: string | null;
  description: string | null;
  documentDate: string | null;
  pages: number | null;
  sourcePages: string | null;
  depositDate: string | null;
  person: string | null;
  storage: string | null;
  notes: string | null;
  mfiles: string | null;
  movementReference: string | null;
};
async function readDocumentReport(
  tx: Prisma.TransactionClient,
  parameters: ReportParameters,
  purpose: Purpose,
): Promise<ReportData> {
  const client = purpose === 'client' ? requiredClient(parameters) : null;
  if (purpose === 'card' && parameters.document?.kind !== 'id')
    throw new ReportError('invalid', ['document']);
  const record = parameters.document?.kind === 'id' ? parameters.document.id : null;
  const rows = await tx.$queryRaw<Document[]>(Prisma.sql`
    SELECT d.id,d.legacy_id AS serial,d.client_id AS "clientId",c.name_ar AS client,c.documents_location AS "clientStorage",
      m.case_number_ar AS "caseNumber",d.description,d.document_date::text AS "documentDate",d.page_count AS pages,
      d.legacy_page_count_raw AS "sourcePages",d.deposit_date::text AS "depositDate",p.name_ar AS person,
      d.storage_location AS storage,d.notes,d.mfiles_id AS mfiles,d.movement_card AS "movementReference"
    FROM public.documents d LEFT JOIN public.clients c ON c.id=d.client_id
    LEFT JOIN public.matters m ON m.id=d.matter_id LEFT JOIN public.people p ON p.id=d.responsible_person_id
    WHERE ${purpose === 'card' ? Prisma.sql`d.id=${record}` : Prisma.sql`c.id IS NOT NULL`}
      ${purpose === 'client' ? Prisma.sql`AND d.client_id=${client}` : Prisma.empty}
    ORDER BY ${purpose === 'inventory' ? Prisma.sql`c.id,c.name_ar COLLATE "C",` : Prisma.empty}d.legacy_id NULLS LAST,d.id`);
  if (purpose === 'card' && rows.length !== 1) throw new ReportError('invalid', ['document']);
  const groups = new Map<
    string,
    { id: string; title: string; rows: ReportGroup['rows'][number][] }
  >();
  for (const r of rows) {
    const key = purpose === 'inventory' ? `client:${r.clientId}` : 'records';
    const g = groups.get(key) ?? {
      id: key,
      title: purpose === 'inventory' ? (r.client ?? t.reports.nullValue) : '',
      rows: [],
    };
    g.rows.push({
      id: `document:${r.id}`,
      cells: [
        ...(purpose === 'card'
          ? [reportText(r.client), numberCell(r.clientId)]
          : purpose === 'inventory'
            ? [numberCell(r.clientId)]
            : []),
        numberCell(r.id),
        r.serial === null ? { type: 'null' } : idCell(String(r.serial)),
        idCell(r.caseNumber),
        reportText(r.description),
        dateCell(r.documentDate),
        numberCell(r.pages),
        reportText(r.sourcePages),
        dateCell(r.depositDate),
        reportText(r.person),
        reportText(r.storage),
        reportText(r.notes),
        idCell(r.mfiles),
        ...(purpose === 'inventory'
          ? [reportText(r.clientStorage)]
          : purpose === 'card'
            ? [reportText(r.movementReference)]
            : []),
      ],
    });
    groups.set(key, g);
  }
  return {
    subtitle: client !== null ? await reportClientName(tx, client) : '',
    sections: [{ id: 'documents', title: '', groups: [...groups.values()] }],
    totals: [],
  };
}
