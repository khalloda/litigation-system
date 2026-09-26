import assert from 'node:assert/strict';
import {
  civilDate,
  nextCivilDay,
  cairoDayStart,
  parseReportInput,
  reportDateBounds,
  readReportRequest,
} from '../src/lib/reports/input';
import { validateReportOptions } from '../src/lib/reports/options';
import { validateReportData, validateDefinition, cellText } from '../src/lib/reports/result';
import { ReportError, type ReportDescriptor, type ReportData } from '../src/lib/reports/types';
import { scalarChunks, renderReportExcel } from '../src/lib/reports/excel';
import { escapeReportHtml } from '../src/lib/reports/pdf';
import { t } from '../src/strings';

let cases = 0;
function check(name: string, body: () => void) {
  body();
  cases++;
  console.log('PASS ' + name);
}
const descriptor: ReportDescriptor = {
  id: 'contract-probe',
  version: '1',
  title: t.reports.title,
  description: t.reports.title,
  date: { required: false, allowOpen: true, source: 'date', fieldMeaning: t.reports.fields.from },
  parameters: {
    client: { required: false, unassigned: true, help: t.reports.identityHelp },
    branch: { required: false, unassigned: true, help: t.reports.identityHelp },
    lawyer: { required: false, unassigned: true, help: t.reports.identityHelp },
  },
  columns: [{ key: 'value', label: t.reports.column, width: 50 }],
  layout: 'grouped',
  clientFacing: false,
  permissions: [{ area: 'hearings', action: 'view' }],
};
const parse = (query: string, d = descriptor) => parseReportInput(d, new URLSearchParams(query));
for (const value of [
  '2026-02-29',
  '2024-02-30',
  '2026-13-01',
  '2026-00-01',
  '2026-01-00',
  '2026-1-1',
  '01/02/2026',
  '2026-01-01T00:00:00Z',
  '0000-01-01',
])
  check('reject civil date ' + value, () => assert.throws(() => civilDate(value), ReportError));
for (const [value, next] of [
  ['2024-02-29', '2024-03-01'],
  ['2026-12-31', '2027-01-01'],
  ['2026-04-30', '2026-05-01'],
])
  check('next civil ' + value, () => assert.equal(nextCivilDay(value!), next));
for (const [date, expected] of [
  ['2026-01-01', '2025-12-31T22:00:00.000Z'],
  ['2024-02-29', '2024-02-28T22:00:00.000Z'],
  ['2026-04-24', '2026-04-23T22:00:00.000Z'],
  ['2026-04-25', '2026-04-24T21:00:00.000Z'],
  ['2026-10-29', '2026-10-28T21:00:00.000Z'],
  ['2026-10-30', '2026-10-29T22:00:00.000Z'],
])
  check('literal Cairo boundary ' + date, () =>
    assert.equal(cairoDayStart(date!).toISOString(), expected),
  );
check('Cairo 23-hour spring day', () =>
  assert.equal(
    cairoDayStart('2026-04-25').getTime() - cairoDayStart('2026-04-24').getTime(),
    23 * 3600000,
  ),
);
check('Cairo 25-hour autumn day', () =>
  assert.equal(
    cairoDayStart('2026-10-30').getTime() - cairoDayStart('2026-10-29').getTime(),
    25 * 3600000,
  ),
);
check('missing optional means all', () =>
  assert.deepEqual(parse('format=preview').parameters.branch, { kind: 'all' }),
);
check('unassigned distinct from all', () =>
  assert.deepEqual(parse('format=preview&branch=unassigned').parameters.branch, {
    kind: 'unassigned',
  }),
);
for (const value of ['0', '-1', '01', '1.0', '1e2', '2147483648', '123abc', '١', 'null'])
  check('reject identity ' + value, () =>
    assert.throws(() => parse('format=preview&client=' + value), ReportError),
  );
for (const query of [
  'format=preview&client=1&client=2',
  'format=preview&unknown=1',
  'format=html',
  'format=preview&sql=SELECT',
  'format=preview&from=2026-12-31&to=2026-01-01',
])
  check('reject payload ' + query, () => assert.throws(() => parse(query), ReportError));
check('unsupported date rejected', () =>
  assert.throws(
    () => parse('format=preview&from=2026-01-01', { ...descriptor, date: undefined }),
    ReportError,
  ),
);
check('required client rejects all', () =>
  assert.throws(
    () =>
      parse('format=preview', {
        ...descriptor,
        parameters: { client: { required: true, help: '' } },
      }),
    ReportError,
  ),
);
check('required range rejects omitted end', () =>
  assert.throws(
    () =>
      parse('format=preview&from=2026-01-01', {
        ...descriptor,
        date: { ...descriptor.date!, required: true },
      }),
    ReportError,
  ),
);
check('closed range requires paired dates', () =>
  assert.throws(
    () =>
      parse('format=preview&from=2026-01-01', {
        ...descriptor,
        date: { ...descriptor.date!, allowOpen: false },
      }),
    ReportError,
  ),
);
check('inclusive date end becomes next day', () =>
  assert.deepEqual(
    reportDateBounds(parse('format=preview&from=2024-02-29&to=2024-02-29').parameters, 'date'),
    { gte: '2024-02-29', lt: '2024-03-01' },
  ),
);
check('Cairo timestamp end is next civil day', () =>
  assert.equal(
    reportDateBounds(
      parse('format=preview&to=2026-04-24').parameters,
      'cairo-timestamp',
    ).lt?.toString(),
    new Date('2026-04-24T21:00:00.000Z').toString(),
  ),
);
check('nonexistent option is not all', () =>
  assert.throws(
    () =>
      validateReportOptions(parse('format=preview&client=99').parameters, {
        client: [],
        branch: [],
        lawyer: [],
      }),
    ReportError,
  ),
);
check('duplicate labels retain selected ID', () =>
  validateReportOptions(parse('format=preview&client=2').parameters, {
    client: [
      { id: 1, label: 'same' },
      { id: 2, label: 'same' },
    ],
    branch: [],
    lawyer: [],
  }),
);
check('narrow enum extension rejects unknown choice', () =>
  assert.throws(
    () =>
      parse('format=preview&extra_status=sql', {
        ...descriptor,
        extra: [
          {
            key: 'extra_status',
            label: 'status',
            required: false,
            choices: [{ value: 'all', label: 'all' }],
          },
        ],
      }),
    ReportError,
  ),
);
const data: ReportData = {
  subtitle: '',
  sections: [
    {
      id: 's',
      title: '',
      groups: [
        {
          id: 'g',
          title: '',
          rows: [{ id: '1', cells: [{ type: 'text', value: '=1+2\n001 / 52ق' }] }],
        },
      ],
    },
  ],
  totals: [],
};
check('descriptor contract', () => validateDefinition({ descriptor, query: async () => data }));
check('logical count', () => assert.equal(validateReportData(descriptor, data), 1));
check('duplicate row identity rejected', () =>
  assert.throws(
    () =>
      validateReportData(descriptor, {
        ...data,
        sections: [
          {
            id: 's',
            title: '',
            groups: [
              {
                id: 'g',
                title: '',
                rows: [
                  data.sections[0]!.groups[0]!.rows[0]!,
                  data.sections[0]!.groups[0]!.rows[0]!,
                ],
              },
            ],
          },
        ],
      }),
    ReportError,
  ),
);
check('null and empty distinct', () =>
  assert.notEqual(cellText({ type: 'null' }), cellText({ type: 'text', value: '' })),
);
check('zero and false distinct', () =>
  assert.notEqual(
    cellText({ type: 'integer', value: '0' }),
    cellText({ type: 'boolean', value: false }),
  ),
);
check('HTML escaped without injected markup', () =>
  assert.equal(escapeReportHtml('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;'),
);
check('long Unicode chunks never split scalar', () =>
  assert.deepEqual(scalarChunks('أ😀ب', 2), ['أ', '😀', 'ب']),
);
async function main() {
  const request = (body: string) =>
    new Request('http://127.0.0.1:3100/reports/probe/run', {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3100',
        origin: 'http://127.0.0.1:3100',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  assert.equal(
    (await readReportRequest(request('format=preview&client=1&client=2'))).getAll('client').length,
    2,
  );
  cases++;
  await assert.rejects(readReportRequest(request('format=%ZZ')), ReportError);
  cases++;
  await assert.rejects(readReportRequest(request('x'.repeat(8193))), ReportError);
  cases++;
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    renderReportExcel(
      {
        descriptor,
        parameters: parse('format=preview').parameters,
        filterLabels: [],
        data,
        generatedAt: '2026-09-26T00:00:00Z',
        operationId: 'probe',
        rowCount: 1,
      },
      aborted.signal,
    ),
  );
  cases++;
  console.log(
    JSON.stringify({
      status: 'PASS',
      cases,
      scope: 'pure contract boundaries; no database/browser or owner operations',
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
