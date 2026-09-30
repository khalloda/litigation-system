import assert from 'node:assert/strict';
import { countPercentage } from '../src/lib/reports/percentage';
import { summarizeMatterOutcomes } from '../src/lib/reports/matter-outcome-summary';
import { reportOutcomeChart } from '../src/lib/reports/chart';
import { matterJudgmentReports } from '../src/lib/reports/matter-judgments';
import { validateReportData } from '../src/lib/reports/result';
import { reportFilterLabels } from '../src/lib/reports/options';
import { reportOptionDisplay } from '../src/lib/reports/label';
import { t } from '../src/strings';
import type { ReportData, ReportParameters } from '../src/lib/reports/types';

const cases: [number, number, string | null][] = [
  [41, 4000, '1.03'],
  [40, 4000, '1.00'],
  [42, 4000, '1.05'],
  [41, 3999, '1.03'],
  [41, 4001, '1.02'],
  [1, 32, '3.13'],
  [3, 32, '9.38'],
  [1, 3, '33.33'],
  [2, 3, '66.67'],
  [0, 4000, '0.00'],
  [4000, 4000, '100.00'],
  [0, 0, null],
];
for (const [numerator, denominator, expected] of cases) {
  assert.equal(countPercentage(numerator, denominator), expected);
  const hearings = Array.from({ length: denominator }, (_, i) => ({
    id: i + 1,
    matterId: i < numerator ? 1 : 2,
    date: '2026-01-01',
    outcome: 'صالح',
  }));
  // Ensure both assigned and unassigned groups exist even when numerator is zero.
  hearings.push({ id: denominator + 1, matterId: 1, date: '2026-01-01', outcome: 'ضد' });
  const sections = summarizeMatterOutcomes(hearings, [
    { matterId: 1, personId: 10, name: 'TEST ONLY A' },
    { matterId: 1, personId: 10, name: 'TEST ONLY A' },
    { matterId: 1, personId: 20, name: 'TEST ONLY B' },
  ]);
  const people = sections[3]!.groups[0]!.rows;
  for (const row of people.slice(0, 2)) {
    assert.deepEqual(
      row.cells[7],
      expected === null ? { type: 'null' } : { type: 'decimal', value: expected },
    );
    assert.deepEqual(row.cells[1], { type: 'integer', value: String(numerator) });
  }
  assert.deepEqual(sections[0]!.groups[0]!.rows[0]!.cells[1], {
    type: 'integer',
    value: String(denominator),
  });
  if (denominator > numerator)
    assert.equal(
      people[2]!.cells[0]!.type === 'text' && people[2]!.cells[0]!.value,
      t.reports.unassigned,
    );
}
for (const args of [
  [-1, 1],
  [2, 1],
  [0.5, 2],
  [1, 0],
  [Infinity, 3],
])
  assert.throws(() => countPercentage(args[0]!, args[1]!));
const definition = matterJudgmentReports[0]!;
for (const counts of [
  [],
  [['صالح', 1]],
  [
    ['صالح', 41],
    ['ضد', 20],
    ['', 2],
    ['TEST ONLY UNKNOWN', 3],
  ],
] as [string, number][][]) {
  const data: ReportData = {
    subtitle: '',
    totals: [],
    sections: [
      {
        id: 'judgments',
        title: '',
        groups: counts.map(([outcome, count], i) => ({
          id: `outcome:${i}`,
          title: outcome || t.reports.emptyValue,
          rows: Array.from({ length: count }, (_, n) => ({
            id: `${i}:${n}`,
            cells: definition.descriptor.columns.map(() => ({ type: 'null' as const })),
          })),
        })),
      },
    ],
    outcomeCounts: counts.map(([outcome, count]) => ({ outcome, count })),
  };
  const total = counts.reduce((s, x) => s + x[1], 0);
  assert.equal(validateReportData(definition.descriptor, data), total);
  const chart = reportOutcomeChart(data)!;
  assert.equal(chart.total, total);
  assert.deepEqual(
    chart.rows.map((x) => [x.outcome, x.count]),
    counts,
  );
  const limited = structuredClone(data);
  let remaining = 50;
  for (const g of limited.sections.flatMap((s) => s.groups)) {
    const rows = g.rows.slice(0, remaining);
    remaining -= rows.length;
    Object.assign(g, { rows });
  }
  assert.deepEqual(reportOutcomeChart(limited), chart);
  if (counts.length) {
    const bad = structuredClone(data);
    Object.assign(bad.outcomeCounts![0]!, { count: 999 });
    assert.throws(() => validateReportData(definition.descriptor, bad));
  }
}
const parameters: ReportParameters = {
  from: null,
  to: null,
  client: { kind: 'all' },
  branch: { kind: 'all' },
  lawyer: { kind: 'all' },
  matter: { kind: 'id', id: 1698 },
  extra: {},
};
for (const value of [
  '1 / 2010',
  '0001 / 0020',
  'TEST ONLY TASK63 001\n140J / 140ق',
  'أَإِ ثانٍ\n001 / 2026',
  '',
  t.common.notRecorded,
  '<img src=x onerror=alert(1)>',
]) {
  const parts = [
    { label: t.fields.caseNumber, value },
    { label: t.fields.client, value: 'TEST ONLY عميل طويل '.repeat(12) },
    { label: t.reports.recordId, value: '1698' },
  ];
  const option = { id: 1698, label: value + ' — client [1698]', parts };
  const before = JSON.stringify(option);
  const displayed = reportOptionDisplay(option);
  assert.equal(displayed.replace(/[\u2066-\u2069]/gu, ''), parts.map((x) => x.value).join(' — '));
  assert.equal(JSON.stringify(option), before);
  const labels = reportFilterLabels(
    {
      ...definition.descriptor,
      date: undefined,
      parameters: { matter: { required: true, help: '' } },
    },
    parameters,
    { client: [], branch: [], lawyer: [], matter: [option] },
  );
  assert.deepEqual(labels[0]!.parts, parts);
  assert.equal(labels[0]!.value, option.label);
}
console.log(
  'PASS T63-R1 exact rational ties/adjacent/overlap/zero; R2 complete outcome counts/preview bound/refusal; R3 unchanged canonical label pieces',
);
