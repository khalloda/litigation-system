import { t } from '@/strings';
import { civilDate } from './input';
import {
  REPORT_LIMITS,
  ReportError,
  type ReportCell,
  type ReportData,
  type ReportDescriptor,
  type ReportDefinition,
} from './types';

export function reportColumns(descriptor: ReportDescriptor, sectionId: string) {
  return (
    Object.entries(descriptor.sectionColumns ?? {}).find(([id]) => id === sectionId)?.[1] ??
    descriptor.columns
  );
}

export function cellText(cell: ReportCell): string {
  if (cell.type === 'null') return t.reports.nullValue;
  if (cell.type === 'boolean') return cell.value ? t.reports.trueValue : t.reports.falseValue;
  if (cell.type === 'text' && cell.value === '') return t.reports.emptyValue;
  return cell.value;
}
export function validateCell(cell: ReportCell) {
  if (!cell || typeof cell !== 'object') throw new ReportError('generation');
  if (cell.type === 'null') {
    if (Object.keys(cell).join() !== 'type') throw new ReportError('generation');
    return;
  }
  if (cell.type === 'boolean') {
    if (typeof cell.value !== 'boolean') throw new ReportError('generation');
    return;
  }
  if (
    !['text', 'identifier', 'integer', 'decimal', 'date'].includes(cell.type) ||
    typeof cell.value !== 'string' ||
    cell.value.length > REPORT_LIMITS.cellUnits ||
    /[\ud800-\udfff]/u.test(cell.value.replace(/[\ud800-\udbff][\udc00-\udfff]/gu, ''))
  )
    throw new ReportError('generation');
  if (cell.type === 'integer' && !/^-?(?:0|[1-9]\d*)$/u.test(cell.value))
    throw new ReportError('generation');
  if (cell.type === 'decimal' && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(cell.value))
    throw new ReportError('generation');
  if (cell.type === 'date') civilDate(cell.value);
}
export function validateReportData(descriptor: ReportDescriptor, data: ReportData) {
  let rows = 0;
  const identities = new Set<string>();
  const sections = new Set<string>();
  if (Buffer.byteLength(JSON.stringify(data)) > REPORT_LIMITS.resultBytes)
    throw new ReportError('too-large');
  if (data.clientBrand && !descriptor.clientFacing) throw new ReportError('generation');
  if (descriptor.clientFacing && !data.clientBrand) throw new ReportError('generation');
  if ((descriptor.details?.length ?? 0) !== (data.details?.length ?? 0))
    throw new ReportError('generation');
  data.details?.forEach(validateCell);
  if (descriptor.charts?.some((id) => !data.sections.some((s) => s.id === id)))
    throw new ReportError('generation');
  if (
    Object.keys(descriptor.sectionColumns ?? {}).some(
      (id) => !data.sections.some((s) => s.id === id),
    )
  )
    throw new ReportError('generation');
  for (const section of data.sections) {
    if (!section.id || sections.has(section.id)) throw new ReportError('generation');
    sections.add(section.id);
    const groups = new Set<string>();
    for (const group of section.groups) {
      if (!group.id || groups.has(group.id)) throw new ReportError('generation');
      groups.add(group.id);
      if (descriptor.layout === 'date-grouped') civilDate(group.date ?? '');
      for (const row of group.rows) {
        if (
          !row.id ||
          row.id.length > 256 ||
          identities.has(row.id) ||
          row.cells.length !== reportColumns(descriptor, section.id).length ||
          (row.highlight && row.highlight !== 'attention')
        )
          throw new ReportError('generation');
        identities.add(row.id);
        rows++;
        if (rows > REPORT_LIMITS.rows) throw new ReportError('too-large');
        row.cells.forEach(validateCell);
      }
    }
  }
  data.totals.forEach((x) => validateCell(x.value));
  if (Boolean(descriptor.outcomeChart) !== (data.outcomeCounts !== undefined))
    throw new ReportError('generation');
  if (data.outcomeCounts) {
    const groups = data.sections.flatMap((section) => section.groups);
    if (
      data.outcomeCounts.length !== groups.length ||
      new Set(data.outcomeCounts.map((x) => x.outcome)).size !== groups.length
    )
      throw new ReportError('generation');
    for (const [index, item] of data.outcomeCounts.entries()) {
      validateCell({ type: 'text', value: item.outcome });
      if (
        !Number.isSafeInteger(item.count) ||
        item.count < 1 ||
        item.count !== groups.at(index)!.rows.length ||
        cellText({ type: 'text', value: item.outcome }) !== groups.at(index)!.title
      )
        throw new ReportError('generation');
    }
  }
  return rows;
}
export function validateDefinition(definition: ReportDefinition) {
  const d = definition.descriptor;
  if (
    !/^[a-z][a-z0-9-]{0,63}$/u.test(d.id) ||
    !/^[a-zA-Z0-9.-]{1,32}$/u.test(d.version) ||
    !d.title ||
    !['grouped', 'date-grouped', 'flat', 'card', 'cover'].includes(d.layout) ||
    d.columns.length < 1 ||
    d.columns.length > REPORT_LIMITS.columns ||
    (d.countLabel !== undefined && (!d.countLabel || d.countLabel.length > 256)) ||
    new Set(d.columns.map((x) => x.key)).size !== d.columns.length ||
    typeof definition.query !== 'function'
  )
    throw new ReportError('generation');
  if (d.outcomeChart !== undefined && typeof d.outcomeChart !== 'boolean')
    throw new ReportError('generation');
  if (
    d.details &&
    (d.details.length > REPORT_LIMITS.columns ||
      new Set(d.details.map((c) => c.key)).size !== d.details.length)
  )
    throw new ReportError('generation');
  const sectionColumns = Object.entries(d.sectionColumns ?? {});
  if (
    sectionColumns.length > 8 ||
    sectionColumns.some(
      ([id, columns]) =>
        !/^[a-z][a-z0-9-]{0,63}$/u.test(id) ||
        !columns.length ||
        columns.length > REPORT_LIMITS.columns ||
        new Set(columns.map((column) => column.key)).size !== columns.length,
    )
  )
    throw new ReportError('generation');
  for (const c of [
    ...d.columns,
    ...(d.details ?? []),
    ...sectionColumns.flatMap(([, columns]) => columns),
  ])
    if (
      !/^[a-z][a-zA-Z0-9_]*$/u.test(c.key) ||
      !c.label ||
      c.width < 5 ||
      c.width > 100 ||
      !Number.isFinite(c.width)
    )
      throw new ReportError('generation');
  if (
    d.manual &&
    (d.manual.lines < 1 ||
      d.manual.lines > 30 ||
      !Number.isInteger(d.manual.lines) ||
      d.manual.labels.length > 10)
  )
    throw new ReportError('generation');
  const extraKeys = new Set<string>();
  if (
    d.charts &&
    (new Set(d.charts).size !== d.charts.length ||
      d.charts.length > 4 ||
      !['favourable', 'against'].every((key) => d.columns.some((c) => c.key === key)))
  )
    throw new ReportError('generation');
  for (const e of d.extra ?? []) {
    if (
      !/^extra_[a-z][a-z0-9_]{0,31}$/u.test(e.key) ||
      extraKeys.has(e.key) ||
      !e.choices.length ||
      e.choices.length > 30 ||
      (e.defaultValue !== undefined && !e.choices.some((x) => x.value === e.defaultValue)) ||
      new Set(e.choices.map((x) => x.value)).size !== e.choices.length ||
      e.choices.some((x) => !/^[a-z0-9-]{1,64}$/u.test(x.value))
    )
      throw new ReportError('generation');
    extraKeys.add(e.key);
  }
}
