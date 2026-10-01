import { t } from '@/strings';
import { cellText } from './result';
import { reportLineDirection } from './label';
import type { ReportColumn, ReportRow, ReportDescriptor } from './types';

export function movementHtml(
  descriptor: ReportDescriptor,
  columns: readonly ReportColumn[],
  row: ReportRow,
  text: (s: string) => string,
) {
  const manual = descriptor.manual!;
  const value = (s: string) =>
    s
      .replace(/\r\n?/gu, '\n')
      .split('\n')
      .map((line) => `<bdi dir="${reportLineDirection(line)}">${text(line)}</bdi>`)
      .join('<br>');
  const fields = columns.map((column, index) => ({ column, cell: row.cells.at(index)! }));
  if (manual.kind === 'poa-movement') {
    const copies = fields.findIndex((field) => field.column.key === 'copies');
    const before = fields.findIndex((field) => field.column.key === 'lawyers');
    if (copies >= 0 && before >= 0) fields.splice(before, 0, ...fields.splice(copies, 1));
  } else {
    for (const [key, beforeKey] of [
      ['documentDate', 'description'],
      ['mfiles', 'notes'],
    ]) {
      const index = fields.findIndex((field) => field.column.key === key);
      const before = fields.findIndex((field) => field.column.key === beforeKey);
      if (index >= 0 && before >= 0) fields.splice(before, 0, ...fields.splice(index, 1));
    }
  }
  const header = `<div class="movement-details">${fields.map(({ column: c, cell }) => `<div class="movement-field${['lawyers', 'sourceLawyers', 'description', 'notes', 'movementReference'].includes(c.key) ? ' movement-wide' : ''}${c.key === 'description' ? ' movement-description' : ''}"><strong>${text(c.label)}</strong><span>${value(cellText(cell))}</span></div>`).join('')}</div>`;
  const grid =
    manual.kind === 'poa-movement'
      ? `<table class="poa-movement-grid"><thead><tr>${manual.labels.map((label) => `<th scope="col">${text(label)}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: 25 }, () => '<tr>' + manual.labels.map(() => '<td></td>').join('') + '</tr>').join('')}</tbody></table>`
      : Array.from(
          { length: 3 },
          (_, i) =>
            `<div class="document-movement-pair"><h3>${i + 1} — ${text(t.documentReports.outgoing)}</h3><div class="document-movement-fields">${manual.labels
              .slice(0, 6)
              .map(
                (label) =>
                  `<div><strong>${text(label)}</strong><span class="writing-line"></span></div>`,
              )
              .join(
                '',
              )}</div><h3>${i + 1} — ${text(t.documentReports.incoming)}</h3><div class="document-movement-fields">${manual.labels
              .slice(6)
              .map(
                (label) =>
                  `<div><strong>${text(label)}</strong><span class="writing-line"></span></div>`,
              )
              .join('')}</div></div>`,
        ).join('');
  return `<article class="movement-card"><strong class="record">${text(row.id)}</strong>${header}<h2>${text(manual.heading)}</h2>${grid}</article>`;
}

export const movementPrintCss = `
body{max-width:190mm;margin:0;font-size:8pt;line-height:1.2}
body>p{margin-block:2px}
.movement-card{break-inside:avoid}.movement-details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-block-start:1px solid #888;border-inline-start:1px solid #888}
.movement-field{display:grid;grid-template-columns:minmax(0,1fr);border-block-end:1px solid #888;border-inline-end:1px solid #888;padding:1px;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}
.movement-field strong{font-size:7pt;color:#333}.movement-field span{font-size:8pt}.movement-wide{grid-column:1/-1;grid-template-columns:35mm minmax(0,1fr)}
.movement-description{grid-template-columns:minmax(0,1fr)}
.movement-field bdi{unicode-bidi:isolate}.movement-card .record{font-size:10pt;padding:2px;margin-block-end:3px}
.poa-movement-grid{margin-block:3px}.poa-movement-grid td{height:6mm;padding:0}.poa-movement-grid th{font-size:8pt;height:10mm;padding:1px}
.document-movement-pair{border:1px solid #888;margin-block:4px;break-inside:avoid}.document-movement-pair h3{font-size:9pt;background:#eee;margin:0;padding:2px}
.document-movement-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:2px}.document-movement-fields>div{display:grid;min-width:0}.document-movement-fields strong{font-size:8pt}.writing-line{height:8mm;border-block-end:1px dotted #444}
`;
