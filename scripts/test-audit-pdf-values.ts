import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';
import type { AuditResult, AuditValue } from '../src/lib/audit-history-types';
import { t } from '../src/strings';

// A pure renderer regression: no authentication, database connection or persisted event.
// The optional module path permits paired rendering with the retained pre-correction source.
async function main() {
  const [input, output, mode = 'corrected'] = process.argv.slice(2);
  assert.ok(input && output && ['baseline', 'corrected'].includes(mode));
  const modulePath =
    process.env['UI01_PDF_RENDERER'] ?? path.resolve('src/lib/audit-history-export.ts');
  assert.ok(path.isAbsolute(modulePath));
  const renderer = (await import(
    pathToFileURL(modulePath).href
  )) as typeof import('../src/lib/audit-history-export');
  mkdirSync(output);
  const string = (text: string): AuditValue => ({ kind: 'string', text });
  const cases: [string, AuditValue | undefined][] = [
    ['timestamp-before', string('2026-09-28T10:03:45.244+00:00')],
    ['timestamp-after', string('2026-09-29T13:55:07.306+00:00')],
    ['utc-Z', string('2026-09-29T13:55:07.123456Z')],
    ['positive-offset', string('2026-09-29T19:25:07.123456+05:30')],
    ['negative-offset', string('2026-09-29T09:55:07.000001-04:00')],
    ['date-only', string('2026-09-29')],
    ['numeric-identifier', string('0012/0034-56')],
    ['Latin-identifier', string('ABC-123 / 42-A')],
    ['zero', { kind: 'number', text: '0' }],
    ['negative', { kind: 'number', text: '-42.000100' }],
    ['precise-large', { kind: 'number', text: '9007199254740993.00000001' }],
    ['signed-literal', string('+0012.3400 / -0042.0001')],
    ['Arabic-marks', string('أحمد إبراهيم — أَإِؤُئْ — ثانٍ')],
    ['mixed-case', string('دعوى 1061/52ق — ABC-123')],
    ['punctuation', string('(2026-09-29), [0012/34]; +12 -34')],
    ['multiline', string('2026-09-29T13:55:07.306+00:00\nسطر أول\nABC-123\nسطر ثانٍ')],
    ['absent', undefined],
    ['null', { kind: 'null', text: 'null' }],
    ['empty', string('')],
    ['whitespace', string(' \t\n ')],
    ['false', { kind: 'boolean', text: 'false' }],
    ['true', { kind: 'boolean', text: 'true' }],
    ['object', { kind: 'object', text: '{"تاريخ":"2026-09-29","n":-42,"code":"ABC-123"}' }],
    ['array', { kind: 'array', text: '["ثانٍ","2026-09-29T13:55:07.306+00:00",-42,null]' }],
    ['redacted', { kind: 'object', text: '{"$redacted":true,"$reason":"sensitive_field"}' }],
    [
      'truncated',
      { kind: 'object', text: '{"$truncated":true,"prefix":"ثانٍ","original_length":99000}' },
    ],
    ['literal-null-marker', string(t.auditHistory.null)],
    ['literal-absent-marker', string(t.auditHistory.absent)],
    ['literal-redacted-marker', string(t.auditHistory.redacted)],
    [
      'hostile-HTML',
      string('<img src="https://invalid.test/a" onerror="alert(1)"><script>x</script>&'),
    ],
    ['control-characters', string('A\u0000B\u0007C\\path\nثانٍ')],
    ['long-wrap', string('ABC-123 — 1061/52ق — أَإِؤُئْ ثانٍ\n'.repeat(8))],
  ];
  const original: AuditResult = JSON.parse(readFileSync(input, 'utf8'));
  const result = structuredClone(original);
  const event = result.groups[0]!.events[0]!;
  event.fields = [];
  event.before = {};
  event.after = {};
  for (let i = 0; i < cases.length; i += 2) {
    const field = `UI01_O1_${String(i / 2 + 1).padStart(2, '0')}`;
    event.fields.push(field);
    if (cases[i]![1]) event.before[field] = cases[i]![1]!;
    if (cases[i + 1]![1]) event.after[field] = cases[i + 1]![1]!;
  }
  result.groups = [{ ...result.groups[0]!, key: 'UI01-O1-SYNTHETIC', events: [event], count: 1 }];
  result.totalEvents = 1;
  result.totalGroups = 1;
  const inputBytes = JSON.stringify(result);
  writeFileSync(path.join(output, 'input.json'), JSON.stringify(result, null, 2));
  writeFileSync(path.join(output, 'oracle.json'), JSON.stringify(cases, null, 2));
  const generated = '2026-09-29T14:10:57.141Z';
  const xlsx = await renderer.generateAuditExcel(result, generated);
  writeFileSync(path.join(output, 'audit.xlsx'), xlsx);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(xlsx as never);
  assert.ok(book.worksheets.every((sheet) => sheet.views[0]?.rightToLeft));
  const sheet = book.worksheets[1]!;
  const envelopes = new Map<string, string>();
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    row.eachCell((cell) => assert.notEqual(cell.type, ExcelJS.ValueType.Formula));
    const key = `${row.getCell(4).value}|${row.getCell(5).value}`;
    envelopes.set(
      key,
      (envelopes.get(key) ?? '') +
        Buffer.from(String(row.getCell(9).value), 'base64').toString('utf8'),
    );
  });
  for (let i = 0; i < cases.length; i++) {
    const field = event.fields[Math.floor(i / 2)]!;
    const side = i % 2 === 0 ? t.auditHistory.before : t.auditHistory.after;
    const encoded = envelopes.get(`${field} (${field})|${side}`);
    assert.ok(encoded, cases[i]![0]);
    const value = cases[i]![1];
    assert.deepEqual(
      JSON.parse(encoded),
      value === undefined
        ? { present: false }
        : { present: true, kind: value.kind, text: value.text },
      cases[i]![0],
    );
  }
  if (mode === 'corrected') {
    const browser = await chromium.launch({
      executablePath: process.env['AUDIT_PDF_CHROMIUM'],
      headless: true,
    });
    try {
      const page = await browser.newPage({ javaScriptEnabled: false });
      await page.route('**/*', (route) => route.abort());
      const html = cases.map(([, value]) => renderer.auditPdfValue(value));
      await page.setContent(
        `<html dir="rtl"><body>${html.map((v) => `<div>${v}</div>`).join('')}</body></html>`,
      );
      assert.equal(
        await page.locator('img,script').count(),
        0,
        'Recorded HTML must remain escaped',
      );
      for (let i = 0; i < cases.length; i++) {
        const [name, value] = cases[i]!;
        const cell = page.locator('body > div').nth(i);
        if (value?.kind === 'string' && value.text && !/^\s+$/u.test(value.text)) {
          // Independent escaping expectation, checked as DOM content, never by PDF copying.
          const expected = [...value.text]
            .map((c) =>
              c === '\\'
                ? '\\\\'
                : (c.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(c)) ||
                    ['\ufffe', '\uffff'].includes(c)
                  ? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
                  : c,
            )
            .join('');
          assert.equal(await cell.locator('.audit-literal').textContent(), expected, name);
          assert.equal(await cell.locator('.audit-literal').getAttribute('dir'), 'auto', name);
        } else if (value && ['number', 'object', 'array'].includes(value.kind)) {
          assert.equal(
            await cell.locator('.audit-literal').first().textContent(),
            value.text,
            name,
          );
          assert.equal(
            await cell.locator('.audit-literal').first().getAttribute('dir'),
            'ltr',
            name,
          );
        } else if (value?.kind === 'string' && /^\s+$/u.test(value.text)) {
          assert.equal(
            await cell.locator('.audit-literal').textContent(),
            JSON.stringify(value.text),
            name,
          );
        } else {
          const expected =
            value === undefined
              ? t.auditHistory.absent
              : value.kind === 'null'
                ? t.auditHistory.null
                : value.kind === 'boolean'
                  ? value.text === 'true'
                    ? t.auditHistory.true
                    : t.auditHistory.false
                  : t.auditHistory.emptyString;
          assert.equal(await cell.textContent(), expected, name);
        }
      }
      const escapedJson =
        '{"key":"quoted \\"2026-09-29\\"","path":"C:\\\\x","nested":["ثانٍ",-42]}';
      await page.setContent(renderer.auditPdfValue({ kind: 'object', text: escapedJson }));
      assert.equal(await page.locator('body > .audit-literal').textContent(), escapedJson);
      assert.equal(await page.locator('body > .audit-literal > .audit-literal').count(), 6);
    } finally {
      await browser.close();
    }
  }
  writeFileSync(path.join(output, 'audit.pdf'), await renderer.generateAuditPdf(result, generated));
  assert.equal(JSON.stringify(result), inputBytes, 'Renderer must not mutate the input');
  writeFileSync(
    path.join(output, 'proof.json'),
    JSON.stringify(
      {
        status: 'PASS',
        mode,
        cases: cases.length,
        exactTypedXlsx: true,
        noInputMutation: true,
        htmlEscaping: mode === 'corrected',
        visualInspectionRequired: true,
        copyingSearchTested: false,
        renderer: modulePath,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS ${cases.length} typed values and saved real PDF; visual review remains required`,
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
