import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { renderReportExcel } from '../src/lib/reports/excel';
import type { ReportResult } from '../src/lib/reports/types';
import { t } from '../src/strings';

// Fixed independent expectations, deliberately not computed with the formatter
// under test. Changing the host TZ must not change these visible Cairo values.
const cases = [
  ['winter', '2026-01-15T12:00:00.000Z', '15/01/2026, 14:00:00'],
  ['summer', '2026-09-26T11:32:36.000Z', '26/09/2026, 14:32:36'],
  ['rollover', '2026-09-26T22:30:00.000Z', '27/09/2026, 01:30:00'],
] as const;

async function main() {
  const output = process.argv[2];
  assert.ok(output, 'Supply a new task-owned output directory');
  mkdirSync(output, { recursive: false });
  const proofs = [];
  for (const [name, instant, expected] of cases) {
    const result: ReportResult = {
      descriptor: {
        id: 'clock-fixture',
        version: '1',
        title: t.reports.title,
        description: t.reports.title,
        parameters: {},
        columns: [{ key: 'date', label: t.reports.fields.from, width: 20 }],
        layout: 'flat',
        clientFacing: false,
        permissions: [],
      },
      parameters: {
        from: null,
        to: null,
        client: { kind: 'all' },
        branch: { kind: 'all' },
        lawyer: { kind: 'all' },
        extra: {},
      },
      filterLabels: [],
      data: {
        subtitle: '',
        totals: [],
        sections: [
          {
            id: 'clock-fixture',
            title: '',
            groups: [
              {
                id: 'clock-fixture',
                title: '',
                rows: [{ id: 'clock-fixture', cells: [{ type: 'date', value: '2024-02-29' }] }],
              },
            ],
          },
        ],
      },
      generatedAt: instant,
      operationId: '00000000-0000-4000-8000-000000000062',
      rowCount: 1,
    };
    const original = JSON.stringify(result);
    Object.freeze(result);
    const bytes = await renderReportExcel(result);
    const file = path.join(output, `${name}.xlsx`);
    writeFileSync(file, bytes, { flag: 'wx' });
    const saved = readFileSync(file);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    const metadata = book.getWorksheet(t.reports.infoSheet)!;
    assert.equal(metadata.getCell('A2').value, t.reports.generatedAt);
    assert.equal(metadata.getCell('B2').value, expected);
    assert.equal(metadata.getCell('B2').type, ExcelJS.ValueType.String);
    assert.equal(book.created.toISOString(), instant);
    assert.equal(JSON.stringify(result), original, 'Do not alter machine/audit input or IDs');
    const data = book.getWorksheet(t.reports.dataSheet)!;
    assert.equal((data.getCell('B3').value as Date).toISOString(), '2024-02-29T00:00:00.000Z');
    assert.equal(data.getCell('B3').numFmt, 'yyyy-mm-dd');
    const exact = book.getWorksheet(t.reports.exactSheet)!;
    assert.equal(exact.getCell('C2').value, 'date');
    assert.equal(Buffer.from(String(exact.getCell('E2').value), 'base64').toString(), '2024-02-29');
    for (const sheet of book.worksheets) assert.equal(sheet.views[0]!.rightToLeft, true);
    const zip = await JSZip.loadAsync(saved);
    const core = await zip.file('docProps/core.xml')!.async('string');
    const created = /<dcterms:created\b[^>]*>([^<]+)<\/dcterms:created>/u.exec(core)?.[1];
    assert.ok(created, 'OOXML creation property exists');
    assert.equal(new Date(created).toISOString(), instant, 'OOXML retains absolute UTC instant');
    const strings = await zip.file('xl/sharedStrings.xml')!.async('string');
    assert.ok(strings.includes(expected));
    assert.ok(!Object.keys(zip.files).some((entry) => /externalLinks|vbaProject/u.test(entry)));
    proofs.push({
      name,
      instant,
      expected,
      actual: metadata.getCell('B2').value,
      created: book.created.toISOString(),
      machineInputUnchanged: true,
      businessDateUnchanged: true,
      bytes: saved.length,
      sha256: createHash('sha256').update(saved).digest('hex'),
    });
  }
  writeFileSync(
    path.join(output, 'proof.json'),
    JSON.stringify({ status: 'PASS', hostTZ: process.env.TZ ?? null, cases: proofs }, null, 2),
    { flag: 'wx' },
  );
  console.log('PASS T61-N1: three actual saved/decoded XLSX cases; UTC and business dates exact');
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
