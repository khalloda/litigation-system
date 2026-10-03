/** Presentation-only regression. Synthetic renderer inputs never enter a database. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Session } from 'next-auth';
import { cellText, validateReportData } from '../src/lib/reports/result';
import { reportHtml, renderReportPdf } from '../src/lib/reports/pdf';
import { renderReportExcel } from '../src/lib/reports/excel';
import { auditOriginalValue, auditValue } from '../src/lib/audit-history-projection';
import {
  auditPdfValue,
  generateAuditExcel,
  generateAuditPdf,
} from '../src/lib/audit-history-export';
import type { AuditResult, AuditValue } from '../src/lib/audit-history-types';
import type { ReportCell, ReportResult } from '../src/lib/reports/types';
import { probeDescriptor } from './test-report-probes';
import { t } from '../src/strings';

const business: [string, ReportCell, string][] = [
  ['null', { type: 'null' }, 'غير مسجل'],
  ['empty', { type: 'text', value: '' }, 'نص فارغ'],
  ['whitespace', { type: 'text', value: ' \t\n ' }, ' \t\n '],
  ['zero', { type: 'integer', value: '0' }, '0'],
  ['false', { type: 'boolean', value: false }, 'لا'],
  ['Arabic', { type: 'text', value: 'أحمد إبراهيم — ثانٍ' }, 'أحمد إبراهيم — ثانٍ'],
  ...['(NULL)', 'NULL', 'null', 'غير مسجل', 'غير مسجل (NULL)'].map(
    (value): [string, ReportCell, string] => ['literal-' + value, { type: 'text', value }, value],
  ),
  ['date', { type: 'date', value: '2026-10-03' }, '2026-10-03'],
  ['sign', { type: 'decimal', value: '-42.0010' }, '-42.0010'],
  [
    'wrap',
    { type: 'text', value: 'السطر الأول\nABC-123 / 1061/52ق\nالسطر الثاني' },
    'السطر الأول\nABC-123 / 1061/52ق\nالسطر الثاني',
  ],
];
const audit: [string, AuditValue | undefined, string][] = [
  ['absent', undefined, 'الحقل غير موجود في هذا الحدث'],
  ['null', { kind: 'null', text: 'null' }, 'غير مسجل'],
  ['empty', { kind: 'string', text: '' }, 'نص فارغ مسجل'],
  [
    'whitespace',
    { kind: 'string', text: ' \t\n ' },
    'نص يحتوي على فراغات فقط — عرض المحارف: " \\t\\n "',
  ],
  ['zero', { kind: 'number', text: '0' }, '0'],
  ['false', { kind: 'boolean', text: 'false' }, 'لا (false)'],
  ...[
    'أحمد إبراهيم — ثانٍ',
    '(NULL)',
    'NULL',
    'null',
    'غير مسجل',
    'قيمة فارغة مسجلة (NULL)',
    '2026-09-29T19:25:07.123456+05:30',
    '+0012.3400 / -0042.0001',
    'السطر الأول\nABC-123\nالسطر الثاني',
  ].map((text): [string, AuditValue, string] => [
    'literal-' + text,
    { kind: 'string', text },
    `نص: «${text}»`,
  ]),
  [
    'redacted',
    { kind: 'object', text: '{"$redacted":true}' },
    'قيمة محجوبة في الدليل الأصلي\n{"$redacted":true}',
  ],
];

async function main() {
  const output = process.argv[2];
  assert.ok(output, 'Provide a new task-owned output directory');
  mkdirSync(output, { recursive: true });
  const put = (name: string, value: unknown) =>
    writeFileSync(path.join(output, name), JSON.stringify(value, null, 2), { flag: 'wx' });
  assert.equal(t.reports.nullValue, 'غير مسجل');
  assert.equal(t.auditHistory.null, 'غير مسجل');
  for (const [name, cell, expected] of business) assert.equal(cellText(cell), expected, name);
  for (const [name, value, expected] of audit) {
    assert.equal(auditValue(value), expected, name);
    assert.deepEqual(
      JSON.parse(auditOriginalValue(value)),
      value === undefined
        ? { present: false }
        : { present: true, kind: value.kind, text: value.text },
    );
  }
  assert.equal(auditPdfValue({ kind: 'null', text: 'null' }), '<bdi>غير مسجل</bdi>');
  assert.equal(auditPdfValue(undefined), '<bdi>الحقل غير موجود في هذا الحدث</bdi>');
  assert.notEqual(
    auditValue({ kind: 'string', text: 'غير مسجل' }),
    auditValue({ kind: 'null', text: 'null' }),
  );
  // No client logo or authorization callback is used by these synthetic renderer-only inputs.
  const session = {} as Session;
  const generatedAt = '2026-10-03T07:10:11.123Z';
  const results = [];
  for (const layout of ['flat', 'grouped', 'sections', 'cover'] as const) {
    const columns = [
      { key: 'state', label: 'الحالة', width: 25 },
      { key: 'value', label: 'القيمة', width: 75 },
    ];
    const result: ReportResult = {
      descriptor: {
        ...probeDescriptor,
        id: `probe-null-${layout}`,
        title: 'اختبار تقني فقط',
        layout: layout === 'sections' ? 'grouped' : layout,
        columns,
        ...(layout === 'sections'
          ? { sectionColumns: { one: columns }, details: columns, sectionPageBreaks: true }
          : {}),
      },
      parameters: {
        from: null,
        to: null,
        client: { kind: 'all' },
        branch: { kind: 'all' },
        lawyer: { kind: 'all' },
        extra: {},
      },
      data: {
        subtitle: 'نسخة اختبار معزولة',
        ...(layout === 'sections'
          ? { details: [{ type: 'text' as const, value: 'null' }, { type: 'null' as const }] }
          : {}),
        sections: [
          {
            id: 'one',
            title: 'سجلات الاختبار',
            groups: [
              {
                id: 'one',
                title: 'مجموعة الاختبار',
                rows: business.map(([id, cell]) => ({
                  id,
                  cells: [{ type: 'text' as const, value: id }, cell],
                })),
              },
            ],
            totals: [{ label: 'قيمة غير مسجلة', value: { type: 'null' } }],
          },
        ],
        totals: [{ label: 'قيمة غير مسجلة', value: { type: 'null' } }],
      },
      generatedAt,
      operationId: 'synthetic-null-label',
      filterLabels: [],
      rowCount: business.length,
    };
    validateReportData(result.descriptor, result.data);
    const before = JSON.stringify(result);
    const html = await reportHtml(result, session);
    assert.ok(html.html.includes('<bdi>غير مسجل</bdi>'));
    assert.ok(html.html.includes('<bdi>غير مسجل (NULL)</bdi>'), 'Literal data preserved');
    put(layout + '-input.json', result);
    writeFileSync(path.join(output, layout + '.xlsx'), await renderReportExcel(result), {
      flag: 'wx',
    });
    // The two compact landscape layouts exercise table/section/detail paths; cover checks use HTML/XLSX.
    if (layout === 'flat' || layout === 'sections')
      writeFileSync(path.join(output, layout + '.pdf'), await renderReportPdf(result, session), {
        flag: 'wx',
      });
    assert.equal(JSON.stringify(result), before);
    results.push({
      layout,
      cells: business.length,
      html: true,
      xlsx: true,
      pdf: layout === 'flat' || layout === 'sections',
    });
  }
  const values = Object.fromEntries(
    audit.filter(([, value]) => value !== undefined).map(([name, value]) => [name, value!]),
  ) as Record<string, AuditValue>;
  const result: AuditResult = {
    watermark: '1',
    totalGroups: 1,
    totalEvents: 1,
    actors: [],
    actions: [],
    next: null,
    snapshot: 'synthetic-only',
    canExport: true,
    filters: { q: '', actor: '', action: '', from: '', to: '' },
    subject: { table: 'documents', id: '1' },
    groups: [
      {
        key: 'SYNTHETIC NULL LABEL',
        occurredAt: '2026-10-03T07:10:11.123456Z',
        lastId: '1',
        count: 1,
        events: [
          {
            id: '1',
            occurredAt: '2026-10-03T07:10:11.123456Z',
            actorId: '1',
            actorKey: 'system_migration',
            actorUsername: null,
            actorName: 'SYNTHETIC ONLY',
            actorRole: null,
            targetId: null,
            targetKey: null,
            targetUsername: null,
            targetName: null,
            targetRole: null,
            action: 'row_updated',
            outcome: 'succeeded',
            table: 'documents',
            key: { id: { kind: 'number', text: '1' } },
            fields: audit.map(([name]) => name),
            before: values,
            after: {},
            requestId: 'synthetic',
            correlationId: 'synthetic',
            auditSessionId: 'synthetic',
            device: 'synthetic',
            ip: null,
            userAgent: null,
            userAgentTruncated: false,
            attemptedUsername: null,
            attemptedUsernameTruncated: false,
            resource: null,
            reason: null,
            parameters: {},
            metadata: {},
            matched: true,
          },
        ],
      },
    ],
  };
  const before = JSON.stringify(result);
  put('audit-input.json', result);
  put('specified-values.json', { business, audit });
  writeFileSync(path.join(output, 'audit.xlsx'), await generateAuditExcel(result, generatedAt), {
    flag: 'wx',
  });
  writeFileSync(path.join(output, 'audit.pdf'), await generateAuditPdf(result, generatedAt), {
    flag: 'wx',
  });
  assert.equal(JSON.stringify(result), before);
  put('generation.json', {
    status: 'PASS',
    businessCases: business.length,
    auditCases: audit.length,
    results,
    noDatabase: true,
    noInputMutation: true,
    independentFileAndVisualInspectionRequired: true,
    copyingSearchTested: false,
  });
  console.log(
    'PASS null-label matrix and real renderer outputs; independent inspection remains required',
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
