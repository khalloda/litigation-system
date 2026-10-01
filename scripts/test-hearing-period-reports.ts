import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '../src/generated/prisma/client';
import { db } from '../src/lib/db';
import { hearingPeriodReports } from '../src/lib/reports/hearing-periods';
import { teamHearingReport } from '../src/lib/reports/hearing-teams';
import { parseReportInput } from '../src/lib/reports/input';
import {
  reportOptions,
  reportFilterLabels,
  validateReportOptions,
} from '../src/lib/reports/options';
import { validateDefinition, validateReportData } from '../src/lib/reports/result';
import { type ReportCell } from '../src/lib/reports/types';
import { t } from '../src/strings';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

type Row = Record<string, string | number | boolean | null>;
const num = (r: Row, key: string) => {
  const v = r[key];
  assert.equal(typeof v, 'number');
  return v as number;
};
const str = (r: Row, key: string): string | null => {
  const v = r[key];
  assert.ok(v === null || typeof v === 'string');
  return v;
};
const cell = (value: string | null, type: 'text' | 'identifier' = 'text'): ReportCell =>
  value === null ? { type: 'null' } : { type, value };
const cmp = (a: string | null, b: string | null) =>
  a === null
    ? b === null
      ? 0
      : 1
    : b === null
      ? -1
      : Buffer.compare(Buffer.from(a), Buffer.from(b));
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
      // Independent whole-relation oracle: no production WHERE/JOIN/order/aggregation.
      const tables: Record<string, Row[]> = {};
      for (const table of [
        'hearings',
        'matters',
        'lookup_court',
        'people',
        'hearing_attendees',
        'matter_lawyers',
        'matter_parties',
        'matter_party_roles',
        'lookup_party_role',
        'lookup_team',
        'lookup_matter_destination',
        'powers_of_attorney',
        'documents',
      ]) {
        const rows = await tx.$queryRaw<{ data: Row }[]>(
          Prisma.sql`SELECT to_jsonb(x) data FROM ${Prisma.raw('public.' + table)} x ORDER BY id`,
        );
        tables[table] = rows.map((r) => r.data);
      }
      const index = (table: string) => new Map(tables[table]!.map((r) => [num(r, 'id'), r]));
      const matters = index('matters'),
        courts = index('lookup_court'),
        people = index('people'),
        roles = index('lookup_party_role');
      const court = (id: Row[string] | undefined) => {
        assert.notEqual(id, undefined, 'Oracle court column must exist');
        return typeof id === 'number' ? str(courts.get(id)!, 'label_ar') : null;
      };
      const parts = (matter: number, side: string) => {
        const p = tables
          .matter_parties!.filter((p) => p.matter_id === matter && p.side === side && !p.is_retired)
          .sort(
            (a, b) =>
              Number(a.ordinal ?? Infinity) - Number(b.ordinal ?? Infinity) ||
              num(a, 'id') - num(b, 'id'),
          );
        if (!p.length) return cell(null);
        return cell(
          p
            .map((p) => {
              const labels = tables
                .matter_party_roles!.filter((r) => r.party_id === p.id && !r.is_retired)
                .sort(
                  (a, b) =>
                    Number(a.ordinal ?? Infinity) - Number(b.ordinal ?? Infinity) ||
                    num(a, 'id') - num(b, 'id'),
                )
                .map((r) =>
                  str(
                    roles.get(num(r, 'role_id'))!,
                    p.gender === 'f' ? 'label_ar_f' : 'label_ar_m',
                  ),
                );
              return [
                str(p, 'party_name') ?? t.reports.nullValue,
                ...labels.map((l) => '"' + l + '"'),
              ].join('\n');
            })
            .join('\n\n'),
        );
      };
      const runs = [];
      const referenceDescriptor = {
        ...teamHearingReport.descriptor,
        parameters: {
          team: { required: false, unassigned: true, help: t.reports.identityHelp },
          destination: { required: false, unassigned: true, help: t.reports.identityHelp },
          poa: { required: true, help: t.reports.identityHelp },
          document: { required: true, help: t.reports.identityHelp },
        },
      };
      const options = await reportOptions(tx, referenceDescriptor);
      for (const [field, table] of [
        ['team', 'lookup_team'],
        ['destination', 'lookup_matter_destination'],
        ['poa', 'powers_of_attorney'],
        ['document', 'documents'],
      ] as const) {
        assert.deepEqual(
          options[field]!.map((o) => o.id).sort((a, b) => a - b),
          tables[table]!.map((r) => num(r, 'id')),
        );
      }
      const refs = parseReportInput(
        referenceDescriptor,
        new URLSearchParams({
          format: 'preview',
          from: '2026-01-01',
          to: '2026-12-31',
          team: 'unassigned',
          destination: '1',
          poa: String(options.poa![0]!.id),
          document: String(options.document![0]!.id),
        }),
      ).parameters;
      validateReportOptions(refs, options);
      const labels = reportFilterLabels(referenceDescriptor, refs, options);
      assert.equal(labels.find((l) => l.label === t.reports.fields.poa)!.parts!.length, 6);
      assert.equal(labels.find((l) => l.label === t.reports.fields.document)!.parts!.length, 4);
      for (const [mode, definition] of hearingPeriodReports.entries()) {
        validateDefinition(definition);
        for (const [from, to] of [
          ['0001-01-01', '9998-12-31'],
          ['2026-08-22', '2026-08-27'],
          ['2024-02-29', '2024-02-29'],
          ['2080-02-28', '2080-03-01'],
        ]) {
          const params = parseReportInput(
            definition.descriptor,
            new URLSearchParams({ from: from!, to: to!, format: 'preview' }),
          ).parameters;
          const actual = await definition.query(tx, params);
          validateReportData(definition.descriptor, actual);
          const dateKey = mode === 1 ? 'hearing_date' : 'next_hearing_date';
          const population = tables.hearings!.filter((h) => {
            const m = matters.get(Number(h.matter_id)),
              date = str(h, dateKey);
            return (
              m &&
              date !== null &&
              date >= from! &&
              date <= to! &&
              (mode < 2 || m.status === 'سارية')
            );
          });
          population.sort((a, b) => {
            const ma = matters.get(Number(a.matter_id))!,
              mb = matters.get(Number(b.matter_id))!;
            const ca = mode === 3 ? ma : a,
              cb = mode === 3 ? mb : b;
            return (
              cmp(str(a, dateKey), str(b, dateKey)) ||
              cmp(court(ca.court_id), court(cb.court_id)) ||
              (mode === 2 ? 0 : cmp(str(ca, 'circuit'), str(cb, 'circuit'))) ||
              cmp(str(ma, 'case_number_ar'), str(mb, 'case_number_ar')) ||
              num(a, 'id') - num(b, 'id')
            );
          });
          const expected = population.map((h) => {
            const m = matters.get(Number(h.matter_id))!,
              mid = num(m, 'id'),
              hc = court(h.court_id),
              circuit = str(h, 'circuit');
            const courtValue =
              circuit === null || circuit === '' || circuit === hc
                ? hc
                : `${hc ?? t.reports.nullValue}\n${circuit.startsWith('(') && circuit.endsWith(')') ? circuit : '(' + circuit + ')'}`;
            let decision = str(
              h,
              mode === 0 ? 'previous_decision' : mode === 1 ? 'decision' : 'short_decision',
            );
            if (mode >= 2 && h.hearing_date !== null && !(mode === 2 && decision === 'أول  جلسة'))
              decision =
                String(h.hearing_date).replaceAll('-', '/') +
                '\n' +
                (decision ?? t.reports.nullValue);
            const names =
              mode === 2
                ? tables
                    .matter_lawyers!.filter((a) => a.matter_id === mid && !a.is_retired)
                    .sort(
                      (a, b) =>
                        ['lead', 'co_lead', 'support'].indexOf(String(a.role)) -
                          ['lead', 'co_lead', 'support'].indexOf(String(b.role)) ||
                        Number(a.position ?? Infinity) - Number(b.position ?? Infinity) ||
                        num(a, 'person_id') - num(b, 'person_id') ||
                        num(a, 'id') - num(b, 'id'),
                    )
                    .map(
                      (a) =>
                        `${t.matters.lawyerRoles[a.role as 'lead' | 'co_lead' | 'support']}: ${people.get(num(a, 'person_id'))!.name_ar}`,
                    )
                : tables
                    .hearing_attendees!.filter((a) => a.hearing_id === h.id && !a.is_retired)
                    .sort(
                      (a, b) =>
                        Number(a.current_order ?? a.ordinal ?? Infinity) -
                          Number(b.current_order ?? b.ordinal ?? Infinity) ||
                        num(a, 'id') - num(b, 'id'),
                    )
                    .map((a) => String(people.get(num(a, 'person_id'))!.name_ar));
            return {
              date: str(h, dateKey)!,
              id: 'hearing:' + h.id,
              cells: [
                cell(str(m, 'case_number_ar'), 'identifier'),
                cell(courtValue),
                parts(mid, 'client'),
                parts(mid, 'opponent'),
                cell(str(m, 'subject')),
                cell(decision),
                cell(names.length ? names.join('\n') : null),
              ],
            };
          });
          const actualRows = actual.sections.flatMap((s) =>
            s.groups.flatMap((g) =>
              g.rows.map((r) => ({ date: g.date, id: r.id, cells: r.cells })),
            ),
          );
          assert.deepEqual(actualRows, expected, definition.descriptor.id + ' ' + from + ' ' + to);
          assert.deepEqual(
            actual.sections[0]!.groups.map((g) => g.date),
            [...new Set(expected.map((r) => r.date))],
          );
          assert.equal(actual.totals[0]!.value.type, 'integer');
          assert.deepEqual(actual.totals[0]!.value, {
            type: 'integer',
            value: String(new Set(population.map((h) => h.matter_id)).size),
          });
          runs.push({
            id: definition.descriptor.id,
            from,
            to,
            rows: expected.length,
            groups: actual.sections[0]!.groups.length,
            sha256: createHash('sha256').update(JSON.stringify(expected)).digest('hex'),
            rowIds: expected.map((r) => r.id),
          });
        }
      }
      for (const choice of ['', 'unassigned', ...tables.lookup_team!.map((r) => String(r.id))]) {
        for (const [from, to] of [
          ['0001-01-01', '9998-12-31'],
          ['2026-08-22', '2026-08-27'],
        ]) {
          const parameters = parseReportInput(
            teamHearingReport.descriptor,
            new URLSearchParams({ format: 'preview', from: from!, to: to!, team: choice }),
          ).parameters;
          const actual = await teamHearingReport.query(tx, parameters);
          validateReportData(teamHearingReport.descriptor, actual);
          const expected: {
            team: number | null;
            date: string;
            id: string;
            matter: number;
            cells: ReportCell[];
          }[] = [];
          for (const h of tables.hearings!) {
            const m = matters.get(Number(h.matter_id)),
              date = str(h, 'hearing_date');
            if (!m || m.status !== 'سارية' || date === null || date < from! || date > to!) continue;
            const assigned = tables
              .matter_lawyers!.filter((a) => a.matter_id === m.id && !a.is_retired)
              .sort(
                (a, b) =>
                  ['lead', 'co_lead', 'support'].indexOf(String(a.role)) -
                    ['lead', 'co_lead', 'support'].indexOf(String(b.role)) ||
                  Number(a.position ?? Infinity) - Number(b.position ?? Infinity) ||
                  num(a, 'person_id') - num(b, 'person_id') ||
                  num(a, 'id') - num(b, 'id'),
              );
            const teams = new Set(
              assigned.map((a) => people.get(num(a, 'person_id'))!.team_id as number | null),
            );
            if (!teams.size) teams.add(null);
            const c = court(h.court_id),
              circuit = str(h, 'circuit');
            const displayed =
              circuit === null || circuit === '' || circuit === c
                ? c
                : `${c ?? t.reports.nullValue}\n${circuit.startsWith('(') && circuit.endsWith(')') ? circuit : '(' + circuit + ')'}`;
            const lawyers = assigned.map(
              (a) =>
                `${t.matters.lawyerRoles[a.role as 'lead' | 'co_lead' | 'support']}: ${people.get(num(a, 'person_id'))!.name_ar}`,
            );
            for (const team of teams) {
              if (
                choice === 'unassigned' ? team !== null : choice !== '' && team !== Number(choice)
              )
                continue;
              expected.push({
                team,
                date,
                id: `team:${team ?? 'unassigned'}:hearing:${h.id}`,
                matter: num(m, 'id'),
                cells: [
                  cell(str(m, 'case_number_ar'), 'identifier'),
                  cell(displayed),
                  parts(num(m, 'id'), 'client'),
                  parts(num(m, 'id'), 'opponent'),
                  cell(str(m, 'subject')),
                  cell(str(h, 'previous_decision')),
                  cell(lawyers.length ? lawyers.join('\n') : null),
                ],
              });
            }
          }
          const hearingId = (id: string) => Number(id.split(':').at(-1));
          const hearing = index('hearings');
          expected.sort((a, b) => {
            const ha = hearing.get(hearingId(a.id))!,
              hb = hearing.get(hearingId(b.id))!;
            const ma = matters.get(a.matter)!,
              mb = matters.get(b.matter)!;
            return (
              (a.team ?? Infinity) - (b.team ?? Infinity) ||
              cmp(a.date, b.date) ||
              cmp(court(ha.court_id), court(hb.court_id)) ||
              cmp(str(ha, 'circuit'), str(hb, 'circuit')) ||
              cmp(str(ma, 'case_number_ar'), str(mb, 'case_number_ar')) ||
              num(ha, 'id') - num(hb, 'id')
            );
          });
          const values = expected.map(({ matter, ...r }) => {
            assert.ok(matter);
            return r;
          });
          assert.deepEqual(
            actual.sections.flatMap((s) =>
              s.groups.flatMap((g) =>
                g.rows.map((r) => ({
                  team: s.id === 'team:unassigned' ? null : Number(s.id.split(':')[1]),
                  date: g.date,
                  id: r.id,
                  cells: r.cells,
                })),
              ),
            ),
            values,
          );
          for (const section of actual.sections) {
            const id = section.id === 'team:unassigned' ? null : Number(section.id.split(':')[1]);
            assert.equal(
              section.title,
              id === null
                ? t.reports.unassigned
                : tables.lookup_team!.find((r) => r.id === id)!.label_ar,
            );
          }
          const uniqueHearings = new Set(expected.map((r) => hearingId(r.id))).size;
          assert.deepEqual(
            actual.totals.map((t) => t.value),
            [
              uniqueHearings,
              new Set(expected.map((r) => r.matter)).size,
              expected.length - uniqueHearings,
            ].map((value) => ({ type: 'integer', value: String(value) })),
          );
          runs.push({
            id: teamHearingReport.descriptor.id,
            choice,
            from,
            to,
            rows: expected.length,
            groups: actual.sections.length,
            sha256: createHash('sha256').update(JSON.stringify(values)).digest('hex'),
            rowIds: expected.map((r) => r.id),
          });
        }
      }
      return {
        status: 'PASS',
        utc: new Date().toISOString(),
        volumes: Object.fromEntries(Object.entries(tables).map(([n, r]) => [n, r.length])),
        runs,
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 600000 },
  );
  writeFileSync(
    join(out, 'hearing-period-source-proof.json'),
    JSON.stringify(proof, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log(
    `PASS ${proof.runs.length} full-population hearing comparisons; exact cells, IDs, order, groups and distinct matter totals`,
  );
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : 'failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
