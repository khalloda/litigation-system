import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateAuditExcel, generateAuditPdf } from '../src/lib/audit-history-export';
import { auditValue } from '../src/lib/audit-history-projection';
import type { AuditResult, AuditValue } from '../src/lib/audit-history-types';
import { t } from '../src/strings';
async function main() {
  const out = process.env['TASK49_TEST_OUTPUT']!;
  assert.ok(out);
  mkdirSync(out, { recursive: true });
  copyFileSync(process.argv[1]!, resolve(out, 'executed-values.ts'));
  // These literal typed inputs, not the implementation formatter, are the oracle.
  const cases: [string, AuditValue | undefined][] = [
    ['absent', undefined],
    ['null', { kind: 'null', text: 'null' }],
    ['empty', { kind: 'string', text: '' }],
    ...[
      'نص فارغ مسجل',
      t.auditHistory.absent,
      t.auditHistory.null,
      t.auditHistory.false,
      t.auditHistory.redacted,
      t.auditHistory.truncated,
    ].map((text, i): [string, AuditValue] => ['literal-marker-' + i, { kind: 'string', text }]),
    ['whitespace', { kind: 'string', text: ' \t\r\n  ' }],
    ['newlines', { kind: 'string', text: 'السطر الأول\r\nsecond\nالثالث' }],
    ['controls', { kind: 'string', text: 'a\u0000\u0001\u000b\u001f\ufffe\uffffz\\u0001' }],
    ['unicode', { kind: 'string', text: 'أحمد ABC 123 😀 漢字 é' }],
    ['false', { kind: 'boolean', text: 'false' }],
    ['zero', { kind: 'number', text: '0' }],
    ['bigint', { kind: 'number', text: '9007199254740993123456789' }],
    ['decimal', { kind: 'number', text: '9007199254740993.00000000000000000000001' }],
    ['object', { kind: 'object', text: '{"اسم": "أحمد", "n": 9007199254740993}' }],
    ['array', { kind: 'array', text: '[null, false, "", "أحمد", 9007199254740993]' }],
    ['redacted', { kind: 'object', text: '{"$redacted":true,"reason":"password"}' }],
    [
      'truncated',
      { kind: 'object', text: '{"$truncated":true,"prefix":"أحمد","original_length":99000}' },
    ],
    [
      'hostile',
      {
        kind: 'string',
        text: '=HYPERLINK("https://invalid.example","x")\n<script>fetch("https://invalid.example")</script>\n@SUM(1,2)',
      },
    ],
    ['chunked', { kind: 'string', text: '漢😀أ\n'.repeat(7000) }],
  ];
  const expected = cases.map(([name, value]) => ({ name, present: value !== undefined, ...value }));
  writeFileSync(resolve(out, 'specified-inputs.json'), JSON.stringify(expected, null, 2), {
    flag: 'wx',
  });
  const values = Object.fromEntries(cases.filter(([, v]) => v !== undefined)) as Record<
    string,
    AuditValue
  >;
  const result: AuditResult = {
    watermark: '9007199254740993',
    totalGroups: 1,
    totalEvents: 1,
    actors: [],
    actions: [],
    next: null,
    snapshot: 'synthetic-renderer-only',
    canExport: true,
    filters: { q: '', actor: '', action: '', from: '', to: '' },
    subject: { table: 'documents', id: '1' },
    groups: [
      {
        key: 'TASK49 CORRECTION SYNTHETIC VALUES',
        occurredAt: '2026-09-20T00:00:00.123456Z',
        lastId: '9007199254740993',
        count: 1,
        events: [
          {
            id: '9007199254740993',
            occurredAt: '2026-09-20T00:00:00.123456Z',
            actorId: '1',
            actorKey: 'system_migration',
            actorUsername: null,
            actorName: 'TASK49 SYNTHETIC ONLY',
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
            fields: cases.map(([n]) => n),
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
  const display = cases.map(([name, value]) => ({ name, display: auditValue(value) }));
  assert.notEqual(
    display.find((x) => x.name === 'empty')!.display,
    display.find((x) => x.name === 'literal-marker-0')!.display,
  );
  for (const [state, label] of [
    ['absent', t.auditHistory.absent],
    ['null', t.auditHistory.null],
    ['false', t.auditHistory.false],
  ] as const)
    assert.notEqual(
      auditValue(cases.find(([n]) => n === state)![1]),
      auditValue({ kind: 'string', text: label }),
    );
  writeFileSync(resolve(out, 'actual-display.json'), JSON.stringify(display, null, 2), {
    flag: 'wx',
  });
  writeFileSync(
    resolve(out, 'typed-values.xlsx'),
    await generateAuditExcel(result, '2026-09-20T00:00:00Z'),
    { flag: 'wx' },
  );
  const pdf = structuredClone(result);
  pdf.groups[0]!.events[0]!.fields = cases.filter(([n]) => n !== 'chunked').map(([n]) => n);
  writeFileSync(resolve(out, 'browser-renderer-fixture.json'), JSON.stringify(pdf, null, 2), {
    flag: 'wx',
  });
  writeFileSync(
    resolve(out, 'typed-values.pdf'),
    await generateAuditPdf(pdf, '2026-09-20T00:00:00Z'),
    { flag: 'wx' },
  );
  console.log(
    'PASS typed synthetic generation and distinct special-state projections; independent saved-XLSX decoding remains a separate required gate.',
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
