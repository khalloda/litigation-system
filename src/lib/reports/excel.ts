import ExcelJS from 'exceljs';
import { t } from '@/strings';
import { cellText, reportColumns } from './result';
import { reportOutcomeChart } from './chart';
import { REPORT_LIMITS, ReportError, type ReportCell, type ReportResult } from './types';

export function scalarChunks(value: string, limit: number) {
  const result: string[] = [];
  let current = '';
  for (const char of value) {
    if (current.length + char.length > limit) {
      result.push(current);
      current = '';
    }
    current += char;
  }
  result.push(current);
  return result;
}
export function printableText(value: string) {
  return value.replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/gu,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
function excelCell(cell: ReportCell): ExcelJS.CellValue {
  if (cell.type === 'boolean') return cell.value;
  if (cell.type === 'date') return new Date(`${cell.value}T00:00:00.000Z`);
  if (cell.type === 'integer' || cell.type === 'decimal') {
    const value = Number(cell.value);
    // Excel stores only 15 significant decimal digits. Preserve scale, signed
    // zero and any representation which would silently change on round-trip.
    const digits = cell.value.replace(/[-.]/gu, '').replace(/^0+/u, '').length;
    if (digits <= 15 && Number.isFinite(value) && String(value) === cell.value) return value;
  }
  return printableText(cellText(cell));
}
export async function renderReportExcel(result: ReportResult, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const book = new ExcelJS.Workbook();
  book.creator = t.app.name;
  book.created = new Date(result.generatedAt);
  const info = book.addWorksheet(t.reports.infoSheet, { views: [{ rightToLeft: true }] });
  info.columns = [{ width: 32 }, { width: 110 }];
  info.addRows([
    [t.reports.title, result.descriptor.title],
    [
      t.reports.generatedAt,
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo',
        dateStyle: 'short',
        timeStyle: 'medium',
        hour12: false,
      }).format(new Date(result.generatedAt)),
    ],
    [result.descriptor.countLabel ?? t.reports.count, result.rowCount],
    [t.reports.exactHelp],
    [t.reports.controlsHelp],
    ...result.filterLabels.flatMap((x) =>
      x.parts
        ? x.parts.map((part) => [`${x.label} — ${part.label}`, part.value])
        : [[x.label, x.value]],
    ),
  ]);
  const sheet = book.addWorksheet(t.reports.dataSheet, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  const layouts = [
    result.descriptor.columns,
    ...Object.values(result.descriptor.sectionColumns ?? {}),
  ];
  sheet.columns = [
    { width: 10 },
    ...Array.from({ length: Math.max(...layouts.map((c) => c.length)) }, (_, index) => ({
      width: Math.max(...layouts.map((c) => c.at(index)?.width ?? 5)),
    })),
  ];
  if (!result.descriptor.sectionColumns)
    sheet.addRow([t.reports.rowNumber, ...result.descriptor.columns.map((c) => c.label)]);
  const exact = book.addWorksheet(t.reports.exactSheet, { views: [{ rightToLeft: true }] });
  exact.columns = [{ width: 28 }, { width: 32 }, { width: 16 }, { width: 12 }, { width: 80 }];
  exact.addRow([
    t.reports.recordId,
    t.reports.column,
    t.reports.type,
    t.reports.part,
    t.reports.exactValue,
  ]);
  const add = (target: ExcelJS.Worksheet, values: ExcelJS.CellValue[]) => {
    if (target.rowCount >= 1048576) throw new ReportError('too-large');
    return target.addRow(values);
  };
  for (const [index, cell] of (result.data.details ?? []).entries()) {
    const column = result.descriptor.details!.at(index)!;
    const value = excelCell(cell);
    const chunks = typeof value === 'string' ? scalarChunks(value, 30000) : [value];
    for (const [part, chunk] of chunks.entries()) {
      const row = add(info, [part === 0 ? column.label : t.reports.continuation, chunk]);
      if (typeof chunk === 'string') row.getCell(2).numFmt = '@';
      else if (cell.type === 'date') row.getCell(2).numFmt = 'yyyy-mm-dd';
    }
    for (const [part, chunk] of scalarChunks(
      cell.type === 'null' ? '' : String(cell.value),
      6000,
    ).entries())
      add(exact, [
        'header',
        column.key,
        cell.type,
        part + 1,
        Buffer.from(chunk, 'utf8').toString('base64'),
      ]);
  }
  for (const section of result.data.sections) {
    const columns = reportColumns(result.descriptor, section.id);
    add(sheet, [section.title]);
    if (result.descriptor.sectionColumns)
      add(sheet, [t.reports.rowNumber, ...columns.map((column) => column.label)]).font = {
        bold: true,
      };
    for (const group of section.groups) {
      if (result.descriptor.layout !== 'flat')
        add(sheet, [group.title, ...(group.date ? [group.date] : [])]);
      let number = 0;
      for (const row of group.rows) {
        signal?.throwIfAborted();
        number++;
        const values = row.cells.map(excelCell);
        const parts = values.map((v) => (typeof v === 'string' ? scalarChunks(v, 30000) : [v]));
        for (let part = 0; part < Math.max(...parts.map((x) => x.length)); part++) {
          const r = add(sheet, [
            part === 0 ? number : t.reports.continuation,
            ...parts.map((x) => x.at(part) ?? ''),
          ]);
          r.eachCell((cell, index) => {
            if (typeof cell.value === 'string') cell.numFmt = '@';
            if (index >= 2 && row.cells.at(index - 2)?.type === 'date' && part === 0)
              cell.numFmt = 'yyyy-mm-dd';
            if (row.highlight === 'attention')
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
          });
        }
        row.cells.forEach((cell, index) => {
          const raw = cell.type === 'null' ? '' : String(cell.value);
          for (const [part, chunk] of scalarChunks(raw, 6000).entries())
            add(exact, [
              row.id,
              columns.at(index)!.key,
              cell.type,
              part + 1,
              Buffer.from(chunk, 'utf8').toString('base64'),
            ]);
        });
      }
    }
  }
  for (const total of result.data.totals) add(sheet, [total.label, excelCell(total.value)]);
  const outcomes = reportOutcomeChart(result.data);
  if (outcomes) {
    add(sheet, [t.matterReports.outcomeChart]);
    add(sheet, [
      t.matterReports.outcomeLabel,
      t.matterReports.hearingCount,
      t.matterReports.outcomeShare,
    ]);
    for (const [index, item] of outcomes.rows.entries()) {
      for (const [part, chunk] of scalarChunks(printableText(item.label), 30000).entries())
        add(sheet, [chunk, ...(part === 0 ? [item.count, item.share] : [])]);
      for (const [key, type, value] of [
        ['outcome', 'text', item.outcome],
        ['count', 'integer', String(item.count)],
        ['share', 'decimal', item.share!],
      ]) {
        for (const [part, chunk] of scalarChunks(value!, 6000).entries())
          add(exact, [
            `outcome:${index}`,
            key!,
            type!,
            part + 1,
            Buffer.from(chunk, 'utf8').toString('base64'),
          ]);
      }
    }
  }
  const count = add(sheet, [result.descriptor.countLabel ?? t.reports.count, result.rowCount]);
  count.font = { bold: true };
  if (result.descriptor.manual) {
    add(sheet, [result.descriptor.manual.heading]);
    add(sheet, [...result.descriptor.manual.labels]);
    for (let i = 0; i < result.descriptor.manual.lines; i++)
      add(
        sheet,
        result.descriptor.manual.labels.map(() => '................................'),
      );
  }
  for (const target of [info, sheet, exact]) {
    target.getRow(1).font = { bold: true };
    target.eachRow((row) =>
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { wrapText: true, vertical: 'top', readingOrder: 'rtl' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        };
      }),
    );
  }
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  signal?.throwIfAborted();
  if (bytes.length > REPORT_LIMITS.artifactBytes) throw new ReportError('too-large');
  return bytes;
}
