/** Task 6.1 isolated engineering adapters. Never imported by src/production. */
import { Prisma } from '../src/generated/prisma/client';
import type {
  ReportCell,
  ReportData,
  ReportDefinition,
  ReportDescriptor,
  ReportRow,
} from '../src/lib/reports/types';
import { reportDateBounds } from '../src/lib/reports/input';

export const probeDescriptor: ReportDescriptor = {
  id: 'probe-volume',
  version: '1',
  title: 'اختبار تقني فقط',
  description: 'اختبار محرك التقارير — ليس تقرير أعمال',
  date: { required: false, allowOpen: true, source: 'date', fieldMeaning: 'تاريخ الجلسة' },
  parameters: {
    client: { required: false, unassigned: true, help: 'هوية العميل' },
    branch: { required: false, unassigned: true, help: 'هوية الفرع' },
    lawyer: { required: false, unassigned: true, help: 'المحامي المسجل على القضية' },
  },
  columns: [
    { key: 'id', label: 'المعرف', width: 12 },
    { key: 'date', label: 'التاريخ', width: 16 },
    { key: 'case', label: 'رقم الدعوى', width: 25 },
    { key: 'decision', label: 'القرار', width: 70 },
    { key: 'archived', label: 'الأرشيف', width: 10 },
  ],
  layout: 'grouped',
  clientFacing: false,
  permissions: [{ area: 'hearings', action: 'view' }],
};
const value = (v: string | null, type: 'text' | 'date' | 'identifier' = 'text'): ReportCell =>
  v === null ? { type: 'null' } : { type, value: v };
export const volumeProbe: ReportDefinition = {
  descriptor: probeDescriptor,
  async query(tx, p) {
    const bounds = reportDateBounds(p, 'date');
    const where: Prisma.Sql[] = [];
    if (bounds.gte) where.push(Prisma.sql`h.hearing_date >= ${bounds.gte}::date`);
    if (bounds.lt) where.push(Prisma.sql`h.hearing_date < ${bounds.lt}::date`);
    if (p.client.kind === 'id') where.push(Prisma.sql`m.client_id = ${p.client.id}`);
    if (p.client.kind === 'unassigned') where.push(Prisma.sql`m.client_id IS NULL`);
    if (p.branch.kind === 'id') where.push(Prisma.sql`m.branch_id = ${p.branch.id}`);
    if (p.branch.kind === 'unassigned') where.push(Prisma.sql`m.branch_id IS NULL`);
    if (p.lawyer.kind === 'id')
      where.push(
        Prisma.sql`EXISTS(SELECT 1 FROM public.matter_lawyers l WHERE l.matter_id=m.id AND l.person_id=${p.lawyer.id} AND NOT l.is_retired)`,
      );
    if (p.lawyer.kind === 'unassigned')
      where.push(
        Prisma.sql`NOT EXISTS(SELECT 1 FROM public.matter_lawyers l WHERE l.matter_id=m.id AND NOT l.is_retired)`,
      );
    const rows = await tx.$queryRaw<
      {
        id: number;
        date: string | null;
        case: string | null;
        decision: string | null;
        archived: boolean;
      }[]
    >(
      Prisma.sql`SELECT h.id,h.hearing_date::text AS date,m.case_number_ar AS case,h.decision,h.is_archived AS archived FROM public.hearings h LEFT JOIN public.matters m ON m.id=h.matter_id ${where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty} ORDER BY h.id`,
    );
    return {
      subtitle: 'نسخة اختبار معزولة',
      sections: [
        {
          id: 'all',
          title: 'سجلات الاختبار',
          groups: [
            {
              id: 'all',
              title: 'جميع السجلات بما فيها الأرشيف',
              rows: rows.map((r) => ({
                id: String(r.id),
                cells: [
                  value(String(r.id), 'identifier'),
                  value(r.date, 'date'),
                  value(r.case),
                  value(r.decision),
                  { type: 'boolean', value: r.archived },
                ],
              })),
            },
          ],
        },
      ],
      totals: [{ label: 'العدد', value: { type: 'integer', value: String(rows.length) } }],
    };
  },
};
export const edgeValues: readonly ReportCell[] = [
  { type: 'null' },
  { type: 'text', value: '' },
  { type: 'integer', value: '0' },
  { type: 'boolean', value: false },
  { type: 'boolean', value: true },
  { type: 'identifier', value: '00000106 / 52ق\n140J / JTI' },
  { type: 'decimal', value: '12345678901234567890.12345678901234567890' },
  { type: 'decimal', value: '0.50' },
  { type: 'integer', value: '42' },
  { type: 'date', value: '2024-02-29' },
  ...[
    '=HYPERLINK("https://invalid.example","x")',
    '+cmd',
    '-1+2',
    '@SUM(A1)',
    '\t=1+2',
    '\u0001nul\u0000\r\nend',
    '  leading and trailing  ',
    '<img src="https://invalid.example" onerror="alert(1)"> & "',
  ].map((value) => ({ type: 'text' as const, value })),
  {
    type: 'text',
    value:
      'START-LONG\n' +
      Array.from({ length: 700 }, (_, i) => `فقرة الاختبار العربية ${i} — 001 / 52ق — JTI\n`).join(
        '',
      ) +
      'END-LONG',
  },
];
export const edgeRows: ReportRow[] = edgeValues.map((v, i) => ({
  id: `edge-${i}`,
  cells: [{ type: 'identifier', value: `EDGE-${i}` }, v],
  ...(i === 2 ? { highlight: 'attention' as const } : {}),
}));
export const edgeDescriptor: ReportDescriptor = {
  ...probeDescriptor,
  id: 'probe-edge',
  parameters: {},
  date: undefined,
  columns: [
    { key: 'id', label: 'معرف الاختبار', width: 15 },
    { key: 'value', label: 'القيمة', width: 85 },
  ],
};
export const edgeData: ReportData = {
  subtitle: 'بيانات اصطناعية لاختبار التنسيق فقط',
  sections: [
    {
      id: 'first',
      title: 'قسم الاختبار',
      groups: [
        { id: 'a', title: 'المجموعة الأولى', rows: edgeRows.slice(0, 10) },
        { id: 'b', title: 'المجموعة الثانية', rows: edgeRows.slice(10) },
      ],
    },
    { id: 'empty', title: 'EMPTY-SECTION — قسم فارغ', groups: [] },
  ],
  totals: [],
};
export const probeDefinitions: readonly ReportDefinition[] = [
  volumeProbe,
  { descriptor: edgeDescriptor, query: async () => edgeData },
  {
    descriptor: { ...edgeDescriptor, id: 'probe-empty' },
    query: async () => ({
      ...edgeData,
      sections: [
        { id: 'e', title: 'EMPTY-SECTION', groups: [{ id: 'e', title: 'فارغ', rows: [] }] },
      ],
    }),
  },
  {
    descriptor: {
      ...edgeDescriptor,
      id: 'probe-card',
      layout: 'card',
      manual: {
        heading: 'بيانات تملأ يدوياً',
        labels: ['التاريخ', 'الملاحظات', 'التوقيع'],
        lines: 8,
      },
    },
    query: async () => ({
      ...edgeData,
      sections: [
        {
          id: 'cards',
          title: 'اختبار البطاقات',
          groups: [{ id: 'c', title: 'بطاقات', rows: edgeRows.slice(0, 3) }],
        },
      ],
    }),
  },
  {
    descriptor: { ...edgeDescriptor, id: 'probe-date', layout: 'date-grouped' },
    query: async () => ({
      ...edgeData,
      sections: [
        {
          id: 'd',
          title: 'مجموعات التاريخ',
          groups: [
            { id: 'd1', title: 'تاريخ', date: '2026-12-31', rows: edgeRows.slice(0, 3) },
            { id: 'd2', title: 'تاريخ', date: '2027-01-01', rows: edgeRows.slice(3, 6) },
          ],
        },
      ],
    }),
  },
  {
    descriptor: { ...edgeDescriptor, id: 'probe-flat', layout: 'flat', clientFacing: true },
    query: async () => ({
      ...edgeData,
      clientBrand: { name: 'عميل الاختبار بلا شعار', logo: null },
      sections: [
        {
          id: 'flat',
          title: 'حالة اختبار',
          groups: [{ id: 'f', title: '', rows: edgeRows.slice(0, 10) }],
        },
      ],
    }),
  },
];
