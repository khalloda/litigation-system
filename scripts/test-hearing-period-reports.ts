import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '../src/generated/prisma/client';
import { db } from '../src/lib/db';
import { hearingPeriodReports } from '../src/lib/reports/hearing-periods';
import { parseReportInput } from '../src/lib/reports/input';
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
