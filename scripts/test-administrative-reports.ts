import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '../src/generated/prisma/client';
import { db } from '../src/lib/db';
import { administrativeReports } from '../src/lib/reports/administrative-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { reportColumns, validateDefinition, validateReportData } from '../src/lib/reports/result';
import {
  ReportError,
  type ReportCell,
  type ReportGroup,
  type ReportParameters,
} from '../src/lib/reports/types';
import { t } from '../src/strings';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

type Row = Record<string, string | number | boolean | null>;
const number = (row: Row, key: string) => {
  assert.equal(typeof row[key], 'number');
  return row[key] as number;
};
const value = (row: Row, key: string) => {
  const v = row[key];
  assert.ok(v === null || typeof v === 'string', key);
  return v;
};
const cell = (
  v: string | null,
  type: 'text' | 'identifier' | 'date' | 'integer' = 'text',
): ReportCell => (v === null ? { type: 'null' } : { type, value: v });
const compare = (a: string | null, b: string | null) =>
  a === null
    ? b === null
      ? 0
      : 1
    : b === null
      ? -1
      : Buffer.compare(Buffer.from(a), Buffer.from(b));
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function main() {
  const url = process.env.MIGRATION_DATABASE_URL,
    out = process.env.TASK6567_EVIDENCE;
  assert.ok(url && out);
  await withApprovedMigrationClient((c) => assertIsolatedTestCluster(c, new URL(url)), {
    databaseUrl: url,
  });
  const proof = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      // Whole relations, not a restatement of the adapter SQL: membership, joins,
      // independent child aggregation, sort and every typed cell are rebuilt here.
      const tables: Record<string, Row[]> = {};
      for (const name of [
        'hearings',
        'matters',
        'clients',
        'admin_tasks',
        'task_actions',
        'people',
        'lookup_court',
        'lookup_matter_destination',
        'lookup_hearing_action',
        'matter_lawyers',
        'hearing_attendees',
        'matter_parties',
        'matter_party_roles',
        'lookup_party_role',
        'administrative_hearing_report_selections',
        'administrative_step_report_selections',
      ]) {
        const r = await tx.$queryRaw<{ data: Row }[]>(
          Prisma.sql`SELECT to_jsonb(x) data FROM ${Prisma.raw('public.' + name)} x ORDER BY id`,
        );
        tables[name] = r.map((x) => x.data);
      }
      const index = (name: string) => new Map(tables[name]!.map((r) => [number(r, 'id'), r]));
      const matters = index('matters'),
        clients = index('clients'),
        courts = index('lookup_court'),
        destinations = index('lookup_matter_destination'),
        people = index('people'),
        roles = index('lookup_party_role'),
        actions = index('lookup_hearing_action');
      const hearingChoices = new Set(
        tables
          .administrative_hearing_report_selections!.filter((s) => s.is_selected)
          .map((s) => s.id),
      );
      const stepChoices = new Set(
        tables.administrative_step_report_selections!.filter((s) => s.is_selected).map((s) => s.id),
      );
      const court = (r: Row) =>
        r.court_id === null ? null : value(courts.get(number(r, 'court_id'))!, 'label_ar');
      const destination = (r: Row) =>
        r.destination_id === null
          ? null
          : value(destinations.get(number(r, 'destination_id'))!, 'label_ar');
      const courtCell = (r: Row) => {
        const c = court(r),
          circuit = value(r, 'circuit');
        return cell(
          circuit === null || circuit === '' || circuit === c
            ? c
            : `${c ?? t.reports.nullValue}\n${circuit.startsWith('(') && circuit.endsWith(')') ? circuit : '(' + circuit + ')'}`,
        );
      };
      const parties = (matter: number, side: string) => {
        const p = tables
          .matter_parties!.filter((r) => r.matter_id === matter && r.side === side && !r.is_retired)
          .sort(
            (a, b) =>
              Number(a.ordinal ?? Infinity) - Number(b.ordinal ?? Infinity) ||
              number(a, 'id') - number(b, 'id'),
          );
        return cell(
          p.length
            ? p
                .map((r) =>
                  [
                    value(r, 'party_name') ?? t.reports.nullValue,
                    ...tables
                      .matter_party_roles!.filter((pr) => pr.party_id === r.id && !pr.is_retired)
                      .sort(
                        (a, b) =>
                          Number(a.ordinal ?? Infinity) - Number(b.ordinal ?? Infinity) ||
                          number(a, 'id') - number(b, 'id'),
                      )
                      .map(
                        (pr) =>
                          '"' +
                          value(
                            roles.get(number(pr, 'role_id'))!,
                            r.gender === 'f' ? 'label_ar_f' : 'label_ar_m',
                          ) +
                          '"',
                      ),
                  ].join('\n'),
                )
                .join('\n\n')
            : null,
        );
      };
      const dated = (date: string | null, text: string | null) => {
        const rendered = text === '' ? t.reports.emptyValue : (text ?? t.reports.nullValue);
        return date === null ? rendered : date.replaceAll('-', '/') + '\n' + rendered;
      };
      const base = (r: Row, origin: Row) => {
        const m = matters.get(number(r, 'matter_id'))!;
        return [
          cell(value(m, 'case_number_ar'), 'identifier'),
          courtCell(origin),
          parties(number(m, 'id'), 'client'),
          parties(number(m, 'id'), 'opponent'),
        ];
      };
      function expectedDecisions(
        kind: 'embedded' | 'destination' | 'all' | 'unnotified',
        p: ReportParameters,
        today: string,
      ): ReportGroup[] {
        const rows = tables.hearings!.filter((h) => {
          const m = matters.get(Number(h.matter_id));
          if (!m || m.status !== 'سارية') return false;
          if ((kind === 'all' || kind === 'unnotified') && !clients.has(Number(m.client_id)))
            return false;
          if (kind === 'unnotified')
            return (
              h.decision !== null &&
              h.client_notified === false &&
              h.hearing_date !== null &&
              String(h.hearing_date) >= p.from! &&
              String(h.hearing_date) <= p.to! &&
              tables.matter_lawyers!.some(
                (l) =>
                  l.matter_id === m.id &&
                  !l.is_retired &&
                  ['lead', 'co_lead'].includes(String(l.role)),
              )
            );
          if (!hearingChoices.has(h.id)) return false;
          if (
            (kind === 'destination' || kind === 'embedded') &&
            (p.destination?.kind !== 'id' || h.destination_id !== p.destination.id)
          )
            return false;
          if (h.next_hearing_date === null) return false;
          if (kind === 'destination')
            return String(h.next_hearing_date) >= p.from! && String(h.next_hearing_date) <= p.to!;
          if (String(h.next_hearing_date) >= today) return false;
          if (kind === 'embedded') {
            const dates = tables
              .hearings!.filter(
                (o) =>
                  o.matter_id === m.id &&
                  o.next_hearing_date !== null &&
                  actions.get(Number(o.action_id))?.label_ar === 'محكمة',
              )
              .map((o) => String(o.next_hearing_date))
              .sort();
            return dates.at(-1) === h.next_hearing_date;
          }
          return true;
        });
        rows.sort((x, y) => {
          const mx = matters.get(number(x, 'matter_id'))!,
            my = matters.get(number(y, 'matter_id'))!;
          const cx = kind === 'all' ? mx : x,
            cy = kind === 'all' ? my : y;
          return (
            (kind === 'all'
              ? compare(destination(mx), destination(my)) ||
                Number(mx.destination_id ?? Infinity) - Number(my.destination_id ?? Infinity)
              : 0) ||
            (kind === 'embedded'
              ? compare(court(cx), court(cy)) ||
                compare(value(x, 'hearing_date'), value(y, 'hearing_date'))
              : compare(
                  value(x, kind === 'destination' ? 'next_hearing_date' : 'hearing_date'),
                  value(y, kind === 'destination' ? 'next_hearing_date' : 'hearing_date'),
                ) || compare(court(cx), court(cy))) ||
            compare(value(cx, 'circuit'), value(cy, 'circuit')) ||
            number(x, 'id') - number(y, 'id')
          );
        });
        const groups = new Map<
          string,
          { id: string; title: string; date?: string; rows: ReportGroup['rows'][number][] }
        >();
        for (const h of rows) {
          const m = matters.get(number(h, 'matter_id'))!,
            date = value(h, kind === 'destination' ? 'next_hearing_date' : 'hearing_date');
          const id =
            kind === 'all'
              ? `destination:${m.destination_id ?? 'none'}`
              : kind === 'embedded'
                ? `court:${court(h) ?? 'none'}`
                : date!;
          const g = groups.get(id) ?? {
            id,
            title:
              (kind === 'all' ? destination(m) : kind === 'embedded' ? court(h) : date) ??
              t.reports.nullValue,
            ...(['destination', 'unnotified'].includes(kind) ? { date: date! } : {}),
            rows: [],
          };
          const attendee = tables
            .hearing_attendees!.filter((r) => r.hearing_id === h.id && !r.is_retired)
            .sort(
              (x, y) =>
                Number(x.current_order ?? x.ordinal) - Number(y.current_order ?? y.ordinal) ||
                number(x, 'id') - number(y, 'id'),
            )
            .map((r) => value(people.get(number(r, 'person_id'))!, 'name_ar'));
          g.rows.push({
            id: `hearing:${h.id}`,
            cells: [
              ...base(h, kind === 'all' ? m : h),
              ...(kind === 'unnotified'
                ? [cell(value(m, 'subject')), cell(value(h, 'previous_decision'))]
                : []),
              cell(value(h, 'hearing_date'), 'date'),
              cell(value(h, kind === 'all' || kind === 'embedded' ? 'short_decision' : 'decision')),
              ...(kind === 'unnotified'
                ? [
                    { type: 'boolean' as const, value: false },
                    cell(attendee.length ? attendee.join('\n') : null),
                  ]
                : [cell(value(h, 'next_hearing_date'), 'date')]),
            ],
          });
          groups.set(id, g);
        }
        return [...groups.values()];
      }
      const cases: {
        id: string;
        parameters: unknown;
        today: string;
        rows: number;
        hash: string;
      }[] = [];
      const allDestinations = [...destinations.keys()];
      const chosenMatters = new Set(
        tables.hearings!.filter((h) => hearingChoices.has(h.id)).map((h) => h.matter_id),
      );
      const chosenClients = [
        ...new Set(
          [...matters.values()]
            .filter((m) => chosenMatters.has(m.id) && m.client_id !== null)
            .map((m) => number(m, 'client_id')),
        ),
      ];
      for (const d of administrativeReports) {
        validateDefinition(d);
        const isWork = d.descriptor.id.startsWith('administrative-');
        const kind = d.descriptor.id.endsWith('by-client')
          ? 'client'
          : d.descriptor.id.endsWith('by-destination')
            ? 'destination'
            : d.descriptor.id === 'unnotified-decisions'
              ? 'unnotified'
              : 'all';
        const choices =
          kind === 'destination'
            ? allDestinations.map((id) => ({ destination: String(id) }))
            : kind === 'client'
              ? [...new Set([245, ...chosenClients])].map((id) => ({ client: String(id) }))
              : [{}];
        for (const choice of choices)
          for (const [instant, today] of [
            ['2026-09-30T20:59:59.999Z', '2026-09-30'],
            ['2026-09-30T21:00:00.000Z', '2026-10-01'],
          ]) {
            const p = parseReportInput(
              d.descriptor,
              new URLSearchParams({
                format: 'preview',
                ...(d.descriptor.date ? { from: '0001-01-01', to: today! } : {}),
                ...choice,
              }),
            ).parameters;
            const actual = await d.query(tx, p, { generatedAt: instant! });
            const count = validateReportData(d.descriptor, actual);
            if (!isWork)
              assert.deepEqual(actual.sections, [
                {
                  id: 'decisions',
                  title: '',
                  groups: expectedDecisions(
                    kind as 'all' | 'destination' | 'unnotified',
                    p,
                    today!,
                  ),
                },
              ]);
            else {
              const works = tables
                .admin_tasks!.filter((w) => {
                  const m = matters.get(Number(w.matter_id));
                  return (
                    m &&
                    w.status !== null &&
                    w.status !== 'منجزة' &&
                    chosenMatters.has(m.id) &&
                    (kind === 'destination'
                      ? p.destination?.kind === 'id' && w.destination_id === p.destination.id
                      : clients.has(Number(m.client_id)) &&
                        tables.task_actions!.some(
                          (s) => s.task_id === w.id && stepChoices.has(s.id),
                        ) &&
                        (kind !== 'client' ||
                          (p.client.kind === 'id' && m.client_id === p.client.id)))
                  );
                })
                .sort(
                  (x, y) =>
                    (kind === 'all'
                      ? compare(destination(x), destination(y)) ||
                        Number(x.destination_id ?? Infinity) - Number(y.destination_id ?? Infinity)
                      : 0) ||
                    compare(court(x), court(y)) ||
                    compare(value(x, 'circuit'), value(y, 'circuit')) ||
                    compare(
                      value(matters.get(number(x, 'matter_id'))!, 'case_number_ar'),
                      value(matters.get(number(y, 'matter_id'))!, 'case_number_ar'),
                    ) ||
                    number(x, 'id') - number(y, 'id'),
                );
              const groups = new Map<
                string,
                { id: string; title: string; rows: ReportGroup['rows'][number][] }
              >();
              for (const w of works) {
                const id =
                  kind === 'all'
                    ? `destination:${w.destination_id ?? 'none'}`
                    : `court:${court(w) ?? 'none'}`;
                const g = groups.get(id) ?? {
                  id,
                  title: (kind === 'all' ? destination(w) : court(w)) ?? t.reports.nullValue,
                  rows: [],
                };
                const hearings = tables
                  .hearings!.filter((h) => h.matter_id === w.matter_id && hearingChoices.has(h.id))
                  .sort(
                    (x, y) =>
                      compare(value(x, 'hearing_date'), value(y, 'hearing_date')) ||
                      number(x, 'id') - number(y, 'id'),
                  );
                const candidates = tables.task_actions!.filter((s) => s.task_id === w.id),
                  latest = candidates
                    .filter((s) => s.action_date !== null)
                    .map((s) => String(s.action_date))
                    .sort()
                    .at(-1);
                const steps = candidates
                  .filter((s) =>
                    kind === 'destination'
                      ? s.action_date !== null && s.action_date === latest
                      : stepChoices.has(s.id),
                  )
                  .sort(
                    (x, y) =>
                      compare(value(x, 'action_date'), value(y, 'action_date')) ||
                      Number(x.current_order ?? x.source_ordinal ?? Infinity) -
                        Number(y.current_order ?? y.source_ordinal ?? Infinity) ||
                      number(x, 'id') - number(y, 'id'),
                  );
                const age =
                  w.task_created_date === null
                    ? null
                    : String(
                        (Date.parse(today! + 'T00:00:00Z') -
                          Date.parse(String(w.task_created_date) + 'T00:00:00Z')) /
                          86400000,
                      );
                g.rows.push({
                  id: `work:${w.id}`,
                  cells: [
                    ...base(w, w),
                    ...(kind === 'client' ? [cell(destination(w))] : []),
                    cell(
                      hearings
                        .map((h) => dated(value(h, 'hearing_date'), value(h, 'decision')))
                        .join('\n\n'),
                    ),
                    cell(value(w, 'required_work')),
                    cell(
                      steps.length
                        ? steps
                            .map((s) =>
                              [
                                dated(value(s, 'action_date'), value(s, 'result')),
                                ...(kind === 'destination'
                                  ? [
                                      `${t.adminWorks.person}: ${s.performed_by_person_id === null ? t.reports.nullValue : value(people.get(number(s, 'performed_by_person_id'))!, 'name_ar')}`,
                                    ]
                                  : []),
                              ].join('\n'),
                            )
                            .join('\n\n')
                        : null,
                    ),
                    cell(value(w, 'status')),
                    cell(value(w, 'task_created_date'), 'date'),
                    cell(age, 'integer'),
                  ],
                });
                groups.set(id, g);
              }
              const decisions =
                kind === 'destination' ? expectedDecisions('embedded', p, today!) : null;
              assert.deepEqual(actual.sections, [
                {
                  id: 'works',
                  title: kind === 'destination' ? t.administrativeReports.workSection : '',
                  groups: [...groups.values()],
                },
                ...(decisions
                  ? [
                      {
                        id: 'decisions',
                        title: t.administrativeReports.decisionSection,
                        groups: decisions,
                      },
                    ]
                  : []),
              ]);
              assert.deepEqual(actual.totals, [
                {
                  label: t.administrativeReports.workCount,
                  value: cell(String(works.length), 'integer'),
                },
                ...(decisions
                  ? [
                      {
                        label: t.matterReports.hearingCount,
                        value: cell(
                          String(decisions.reduce((n, g) => n + g.rows.length, 0)),
                          'integer',
                        ),
                      },
                    ]
                  : []),
              ]);
            }
            for (const s of actual.sections)
              for (const g of s.groups)
                for (const r of g.rows)
                  assert.equal(r.cells.length, reportColumns(d.descriptor, s.id).length);
            cases.push({
              id: d.descriptor.id,
              parameters: p,
              today: today!,
              rows: count,
              hash: hash(actual),
            });
          }
      }
      const unnotified = administrativeReports.find(
        (d) => d.descriptor.id === 'unnotified-decisions',
      )!;
      const p = parseReportInput(
        unnotified.descriptor,
        new URLSearchParams({ format: 'preview', from: '2026-10-01', to: '2026-10-01' }),
      ).parameters;
      await assert.rejects(
        unnotified.query(tx, p, { generatedAt: '2026-09-30T20:59:59Z' }),
        ReportError,
      );
      await unnotified.query(tx, p, { generatedAt: '2026-09-30T21:00:00Z' });
      const missing = { subtitle: '', sections: [], totals: [] };
      assert.throws(
        () => validateReportData(administrativeReports[0]!.descriptor, missing),
        ReportError,
      );
      return {
        status: 'PASS',
        cases,
        boundaries: [
          'Cairo midnight, not host date',
          'future date rejected',
          'both mixed sections required',
        ],
        populations: Object.fromEntries(
          Object.entries(tables).map(([name, rows]) => [
            name,
            { rows: rows.length, sha256: hash(rows) },
          ]),
        ),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 240000 },
  );
  writeFileSync(
    join(out, 'administrative-report-source-proof.json'),
    JSON.stringify(proof, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify({
      status: proof.status,
      cases: proof.cases.length,
      nonempty: proof.cases.filter((r) => r.rows > 0).length,
    }),
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
