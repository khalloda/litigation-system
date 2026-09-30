import type { ReportDescriptor, ReportSection } from './types';
import { cellText } from './result';

/** Charts consume the same canonical cells as their adjacent accessible tables. */
export function reportChart(descriptor: ReportDescriptor, section: ReportSection) {
  if (!descriptor.charts?.includes(section.id)) return null;
  const keys = ['favourable', 'against'] as const;
  const series = keys.map((key) => ({
    index: descriptor.columns.findIndex((c) => c.key === key),
    key,
  }));
  const rows = section.groups
    .flatMap((g) => g.rows)
    .map((row) => ({
      id: row.id,
      label: cellText(row.cells[0]!),
      values: series.map((s) => ({
        key: s.key,
        label: descriptor.columns.at(s.index)!.label,
        value: Number(cellText(row.cells.at(s.index)!)),
      })),
    }));
  return { rows, maximum: Math.max(1, ...rows.flatMap((row) => row.values.map((v) => v.value))) };
}
