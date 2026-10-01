import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { documentReports } from '../src/lib/reports/document-reports';
import { movementHtml } from '../src/lib/reports/movement-html';
import { renderReportExcel } from '../src/lib/reports/excel';
import { validateDefinition, validateReportData } from '../src/lib/reports/result';
import { ReportError, type ReportData, type ReportResult } from '../src/lib/reports/types';
import { t } from '../src/strings';

async function main() {
  let cases = 0;
  for (const definition of documentReports.filter((d) => d.descriptor.manual?.kind)) {
    const descriptor = definition.descriptor;
    validateDefinition(definition);
    const exact = '=TEST ONLY <script>\r\nأَإِ ثانٍ\r001 / 140J / 140ق';
    const row = {
      id: 'fixture:1',
      cells: descriptor.columns.map(() => ({ type: 'text' as const, value: exact })),
    };
    const data: ReportData = {
      subtitle: '',
      sections: [{ id: 'fixture', title: '', groups: [{ id: 'record', title: '', rows: [row] }] }],
      totals: [],
    };
    assert.equal(validateReportData(descriptor, data), 1);
    for (const rows of [[], [row, { ...row, id: 'fixture:2' }]]) {
      assert.throws(
        () =>
          validateReportData(descriptor, {
            ...data,
            sections: [{ id: 'fixture', title: '', groups: [{ id: 'record', title: '', rows }] }],
          }),
        ReportError,
      );
      cases++;
    }
    for (const manual of [
      { ...descriptor.manual!, lines: 1 },
      { ...descriptor.manual!, labels: [] },
    ]) {
      assert.throws(
        () => validateDefinition({ ...definition, descriptor: { ...descriptor, manual } }),
        ReportError,
      );
      cases++;
    }
    const html = movementHtml(descriptor, descriptor.columns, row, (s) =>
      s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    );
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('\r'));
    assert.equal((html.match(/<br>/gu) ?? []).length, descriptor.columns.length * 2);
    assert.equal(
      row.cells[0]!.value,
      exact,
      'Presentation line-ending normalization must not mutate source',
    );
    if (descriptor.manual!.kind === 'poa-movement') {
      assert.equal((html.match(/<td><\/td>/gu) ?? []).length, 150);
      assert.equal((html.match(/<tr>/gu) ?? []).length, 26);
    } else {
      assert.equal((html.match(/class="writing-line"/gu) ?? []).length, 24);
      assert.equal((html.match(/class="document-movement-pair"/gu) ?? []).length, 3);
    }
    cases++;
    const result: ReportResult = {
      descriptor,
      data,
      parameters: {
        from: null,
        to: null,
        client: { kind: 'all' },
        branch: { kind: 'all' },
        lawyer: { kind: 'all' },
        extra: {},
      },
      filterLabels: [],
      generatedAt: '2026-09-30T21:00:00Z',
      operationId: 'fixture-only',
      rowCount: 1,
    };
    const buffer = await renderReportExcel(result);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(new Uint8Array(buffer) as never);
    assert.equal(book.worksheets.length, 3);
    for (const sheet of book.worksheets) {
      assert.equal(sheet.views[0]!.rightToLeft, true);
      sheet.eachRow((r) => r.eachCell((c) => assert.equal(c.formula, undefined)));
    }
    const exactSheet = book.getWorksheet(t.reports.exactSheet)!;
    for (let index = 2; index <= descriptor.columns.length + 1; index++)
      assert.equal(
        Buffer.from(String(exactSheet.getRow(index).getCell(5).value), 'base64').toString('utf8'),
        exact,
      );
    const sheet = book.getWorksheet(t.reports.dataSheet)!;
    assert.equal(sheet.pageSetup.orientation, 'portrait');
    assert.equal(sheet.pageSetup.printArea, `A1:F${sheet.rowCount}`);
    if (descriptor.manual!.kind === 'poa-movement')
      for (let n = sheet.rowCount - 24; n <= sheet.rowCount; n++)
        for (let c = 1; c <= 6; c++) {
          assert.equal(sheet.getCell(n, c).value, null);
          assert.equal(sheet.getCell(n, c).border.bottom?.style, 'thin');
        }
    cases++;
  }
  console.log(
    JSON.stringify({
      status: 'PASS',
      cases,
      scope:
        'Blank card invariants, cardinality, CRLF presentation, literal markup/formulas, lossless workbook',
    }),
  );
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
