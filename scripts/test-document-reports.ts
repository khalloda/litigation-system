import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '../src/generated/prisma/client';
import { db } from '../src/lib/db';
import { documentReports } from '../src/lib/reports/document-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { validateDefinition, validateReportData } from '../src/lib/reports/result';
import { type ReportCell, type ReportGroup, type ReportRow } from '../src/lib/reports/types';
import { t } from '../src/strings';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

type Row = Record<string, string | number | boolean | null>;
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const number = (r: Row, k: string) => {
  assert.equal(typeof r[k], 'number');
  return r[k] as number;
};
const str = (r: Row, k: string) => {
  const v = r[k];
  assert.ok(v === null || typeof v === 'string', k);
  return v;
};
const cell = (v: unknown, type: 'text' | 'identifier' | 'integer' | 'date' = 'text'): ReportCell =>
  v === null ? { type: 'null' } : { type, value: String(v) };
const compare = (a: string | null, b: string | null) =>
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
      const tables: Record<string, Row[]> = {};
      for (const name of [
        'clients',
        'matters',
        'powers_of_attorney',
        'power_of_attorney_lawyers',
        'people',
        'documents',
      ]) {
        const r = await tx.$queryRaw<{ data: Row }[]>(
          Prisma.sql`SELECT to_jsonb(x) data FROM ${Prisma.raw('public.' + name)} x ORDER BY id`,
        );
        tables[name] = r.map((r) => r.data);
      }
      const index = (name: string) => new Map(tables[name]!.map((r) => [number(r, 'id'), r]));
      const clients = index('clients'),
        matters = index('matters'),
        people = index('people');
      const runs: unknown[] = [];
      for (const d of documentReports) {
        validateDefinition(d);
        assert.equal(d.descriptor.clientFacing, false);
        const poa = d.descriptor.id.includes('poa'),
          card = d.descriptor.layout === 'card',
          byClient = d.descriptor.id.startsWith('client-');
        const records = tables[poa ? 'powers_of_attorney' : 'documents']!;
        // All client IDs exercise both populated and empty client lists. Every
        // record, including orphans and archived records, is eligible for its card.
        const choices = card
          ? records.map((r) => number(r, 'id'))
          : byClient
            ? [...clients.keys()]
            : [null];
        for (const choice of choices) {
          const fields: Record<string, string> = { format: 'preview' };
          if (choice !== null)
            Object.assign(fields, {
              [card ? (poa ? 'poa' : 'document') : 'client']: String(choice),
            });
          const p = parseReportInput(d.descriptor, new URLSearchParams(fields)).parameters;
          const actual = await d.query(tx, p);
          const count = validateReportData(d.descriptor, actual);
          const population = records.filter((r) => {
            if (card) return r.id === choice;
            const c = clients.get(Number(r.client_id));
            return (
              c &&
              (!byClient || r.client_id === choice) &&
              (!poa ||
                (r.show_on_poa_report === true &&
                  (byClient || (c.poa_location !== null && c.poa_location !== 'تم تسليمه للعميل'))))
            );
          });
          population.sort((a, b) => {
            const ca = clients.get(Number(a.client_id)),
              cb = clients.get(Number(b.client_id));
            return (
              (!byClient && !card
                ? (poa ? -compare(str(ca!, 'poa_location'), str(cb!, 'poa_location')) : 0) ||
                  Number(a.client_id) - Number(b.client_id) ||
                  compare(str(ca!, 'name_ar'), str(cb!, 'name_ar'))
                : 0) ||
              (poa
                ? compare(str(a, 'serial_no'), str(b, 'serial_no'))
                : Number(a.legacy_id ?? Infinity) - Number(b.legacy_id ?? Infinity)) ||
              number(a, 'id') - number(b, 'id')
            );
          });
          const groups = new Map<string, { id: string; title: string; rows: ReportRow[] }>();
          for (const r of population) {
            const c = clients.get(Number(r.client_id));
            const id = !card && !byClient ? `client:${r.client_id}` : 'records';
            const title =
              card || byClient
                ? ''
                : poa
                  ? `${str(c!, 'poa_location') ?? t.reports.nullValue}\n${str(c!, 'name_ar') ?? t.reports.nullValue}`
                  : (str(c!, 'name_ar') ?? t.reports.nullValue);
            const group = groups.get(id) ?? { id, title, rows: [] };
            const name = c ? str(c, 'name_ar') : null;
            let cells: ReportCell[];
            if (poa) {
              const members = tables
                .power_of_attorney_lawyers!.filter(
                  (l) => l.power_of_attorney_id === r.id && !l.is_retired,
                )
                .sort(
                  (x, y) =>
                    Number(x.current_order !== null) - Number(y.current_order !== null) ||
                    Number(x.source_member_ordinal ?? Infinity) -
                      Number(y.source_member_ordinal ?? Infinity) ||
                    Number(x.current_order ?? Infinity) - Number(y.current_order ?? Infinity) ||
                    number(x, 'id') - number(y, 'id'),
                );
              cells = [
                ...(card
                  ? [cell(r.id, 'integer'), cell(name), cell(r.client_id, 'integer')]
                  : !byClient
                    ? [cell(r.client_id, 'integer')]
                    : []),
                cell(str(r, 'serial_no'), 'identifier'),
                cell(str(r, 'principal_name')),
                cell(str(r, 'poa_capacity')),
                cell(str(r, 'poa_number'), 'identifier'),
                cell(str(r, 'poa_letter'), 'identifier'),
                cell(str(r, 'poa_year'), 'identifier'),
                cell(str(r, 'issuing_authority')),
                cell(str(r, 'issue_date'), 'date'),
                cell(
                  members.length
                    ? members
                        .map((l) => str(people.get(number(l, 'person_id'))!, 'name_ar'))
                        .join('\n')
                    : null,
                ),
                cell(str(r, 'legacy_lawyers_raw')),
                cell(r.copies_count, 'integer'),
                cell(str(r, 'notes')),
              ];
            } else {
              const matter = matters.get(Number(r.matter_id)),
                person = people.get(Number(r.responsible_person_id));
              cells = [
                ...(card
                  ? [cell(name), cell(r.client_id, 'integer')]
                  : !byClient
                    ? [cell(r.client_id, 'integer')]
                    : []),
                cell(r.id, 'integer'),
                cell(r.legacy_id, 'identifier'),
                cell(matter ? str(matter, 'case_number_ar') : null, 'identifier'),
                cell(str(r, 'description')),
                cell(str(r, 'document_date'), 'date'),
                cell(r.page_count, 'integer'),
                cell(str(r, 'legacy_page_count_raw')),
                cell(str(r, 'deposit_date'), 'date'),
                cell(person ? str(person, 'name_ar') : null),
                cell(str(r, 'storage_location')),
                cell(str(r, 'notes')),
                cell(str(r, 'mfiles_id'), 'identifier'),
                ...(!card && !byClient
                  ? [cell(str(c!, 'documents_location'))]
                  : card
                    ? [cell(str(r, 'movement_card'))]
                    : []),
              ];
            }
            group.rows.push({
              id: `${poa ? 'poa' : 'document'}:${r.id}`,
              ...(poa && !card && r.copies_count === 0 ? { highlight: 'attention' as const } : {}),
              cells,
            });
            groups.set(id, group);
          }
          assert.deepEqual(actual.sections, [
            {
              id: poa ? 'poas' : 'documents',
              title: '',
              groups: [...groups.values()] as ReportGroup[],
            },
          ]);
          assert.equal(actual.subtitle, byClient ? str(clients.get(choice!)!, 'name_ar') : '');
          assert.equal(count, population.length);
          assert.deepEqual(
            actual.totals,
            poa && !card
              ? [
                  {
                    label: t.documentReports.positivePoaCount,
                    value: cell(
                      population.filter(
                        (r) => typeof r.copies_count === 'number' && r.copies_count > 0,
                      ).length,
                      'integer',
                    ),
                  },
                  {
                    label: t.documentReports.zeroPoaCount,
                    value: cell(population.filter((r) => r.copies_count === 0).length, 'integer'),
                  },
                  {
                    label: t.documentReports.unknownPoaCount,
                    value: cell(
                      population.filter((r) => r.copies_count === null).length,
                      'integer',
                    ),
                  },
                ]
              : [],
          );
          if (card) {
            assert.equal(count, 1);
            assert.equal(actual.totals.length, 0);
            assert.equal(d.descriptor.manual!.lines, poa ? 25 : 3);
            assert.equal(d.descriptor.manual!.labels.length, poa ? 6 : 8);
          }
          runs.push({ id: d.descriptor.id, choice, rows: count, sha256: hash(actual) });
        }
      }
      return {
        status: 'PASS',
        cases: runs.length,
        runs,
        sourcePopulations: Object.fromEntries(
          Object.entries(tables).map(([name, rows]) => [
            name,
            { rows: rows.length, sha256: hash(rows) },
          ]),
        ),
        scope:
          'Every typed value/order/total for every full-data client list and every record card; no mutations, browser or render claims',
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 240000 },
  );
  writeFileSync(
    join(out, 'document-report-source-proof.json'),
    JSON.stringify(proof, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log(JSON.stringify({ status: proof.status, cases: proof.cases }));
}
main()
  .finally(() => db.$disconnect())
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
