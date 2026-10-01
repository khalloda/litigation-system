import type ExcelJS from 'exceljs';
import { t } from '@/strings';
import { ReportError, type ReportCell, type ReportResult } from './types';

/** A blank printable worksheet; no movement values exist in ReportData. */
export function movementWorksheet(
  sheet: ExcelJS.Worksheet,
  result: ReportResult,
  convert: (cell: ReportCell) => ExcelJS.CellValue,
) {
  const manual = result.descriptor.manual!;
  if (!manual.kind || result.rowCount !== 1) throw new ReportError('generation');
  sheet.spliceRows(1, sheet.rowCount);
  sheet.columns = [
    { width: 18 },
    { width: 21 },
    { width: 21 },
    { width: 18 },
    { width: 21 },
    { width: 21 },
  ];
  sheet.views = [{ rightToLeft: true }];
  sheet.pageSetup = {
    orientation: 'portrait',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 },
  };
  const band = (value: string) => {
    const r = sheet.addRow([value]);
    sheet.mergeCells(r.number, 1, r.number, 6);
    r.height = 22;
    r.font = { name: 'Noto Sans Arabic', size: 11, bold: true };
    return r;
  };
  band(result.descriptor.title);
  if (result.data.subtitle) band(result.data.subtitle);
  const timestamp = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(result.generatedAt));
  band(t.reports.generatedAt + ': ' + timestamp);
  const record = result.data.sections.flatMap((s) => s.groups.flatMap((g) => g.rows))[0]!;
  for (const [i, column] of result.descriptor.columns.entries()) {
    const cell = record.cells.at(i)!,
      value = convert(cell);
    if (typeof value === 'string' && value.length > 30000) throw new ReportError('too-large');
    const r = sheet.addRow([column.label, value]);
    sheet.mergeCells(r.number, 2, r.number, 6);
    r.font = { name: 'Noto Sans Arabic', size: 9 };
    r.height = Math.max(
      15,
      15 *
        (typeof value === 'string'
          ? value
              .split('\n')
              .reduce((n, line) => n + Math.max(1, Math.ceil([...line].length / 105)), 0)
          : 1),
    );
    if (typeof value === 'string') r.getCell(2).numFmt = '@';
    if (cell.type === 'date') r.getCell(2).numFmt = 'yyyy-mm-dd';
  }
  band(manual.heading);
  if (manual.kind === 'poa-movement') {
    const head = sheet.addRow([...manual.labels]);
    head.height = 30;
    head.font = { name: 'Noto Sans Arabic', size: 9, bold: true };
    for (let i = 0; i < 25; i++) {
      const row = sheet.addRow(Array(6).fill(null));
      row.height = 18;
      for (let c = 1; c <= 6; c++) row.getCell(c).value = null;
    }
  } else {
    for (let i = 1; i <= 3; i++) {
      band(String(i) + ' — ' + t.documentReports.outgoing);
      for (const indexes of [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7],
      ]) {
        if (indexes[0] === 6) band(String(i) + ' — ' + t.documentReports.incoming);
        const labels = sheet.addRow(indexes.flatMap((index) => [manual.labels.at(index)!, null]));
        labels.height = 25;
        labels.font = { name: 'Noto Sans Arabic', size: 9 };
        for (const [pair] of indexes.entries()) {
          sheet.mergeCells(labels.number, 1 + 2 * pair, labels.number, 2 + 2 * pair);
        }
        const blanks = sheet.addRow(Array(6).fill(null));
        blanks.height = 24;
        for (const [pair] of indexes.entries()) {
          sheet.mergeCells(blanks.number, 1 + 2 * pair, blanks.number, 2 + 2 * pair);
        }
      }
    }
  }
  sheet.pageSetup.printArea = `A1:F${sheet.rowCount}`;
  sheet.headerFooter = { oddFooter: '&C' + result.descriptor.title + ' &P / &N' };
}
