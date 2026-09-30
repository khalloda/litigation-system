import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { closedMatterReport } from '../src/lib/reports/matter-closed';
import {
  matterOutcomeSummary,
  summarizeMatterOutcomes,
} from '../src/lib/reports/matter-outcome-summary';
import { parseReportInput } from '../src/lib/reports/input';
import { validateDefinition, validateReportData } from '../src/lib/reports/result';
import { reportChart } from '../src/lib/reports/chart';
import { t } from '../src/strings';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import type { ReportCell } from '../src/lib/reports/types';

async function main() {
  const url = process.env['MIGRATION_DATABASE_URL']!,
    out = process.env['TASK63_EVIDENCE']!;
  assert.ok(url && out);
  await withApprovedMigrationClient((c) => assertIsolatedTestCluster(c, new URL(url)), {
    databaseUrl: url,
  });
  [closedMatterReport, matterOutcomeSummary].forEach(validateDefinition);
  // Independent literal expectations: duplicate principal roles do not multiply credit.
  const synthetic = [
    { id: 1, matterId: 1, date: '2026-01-01', outcome: 'صالح' },
    { id: 2, matterId: 2, date: '2026-02-01', outcome: 'صالح' },
    { id: 3, matterId: 1, date: '2026-02-02', outcome: 'ضد' },
    { id: 4, matterId: 3, date: '2025-12-31', outcome: '' },
    { id: 5, matterId: 3, date: '2026-01-31', outcome: 'unknown' },
  ];
  const principal = [
    { matterId: 1, personId: 10, name: 'TEST ONLY A' },
    { matterId: 1, personId: 10, name: 'TEST ONLY A' },
    { matterId: 1, personId: 20, name: 'TEST ONLY B' },
  ];
  const simple = summarizeMatterOutcomes(synthetic, principal);
  const values = (cells: readonly ReportCell[]) =>
    cells.map((c) => ('value' in c ? c.value : null));
  assert.deepEqual(values(simple[0]!.groups[0]!.rows[0]!.cells), [
    t.matterReports.overall,
    '2',
    '1',
    '3',
    '1',
    '1',
    '5',
    null,
  ]);
  assert.deepEqual(
    simple[3]!.groups[0]!.rows.map((r) => values(r.cells).slice(1)),
    [
      ['1', '1', '2', '0', '0', '2', '50.00'],
      ['1', '1', '2', '0', '0', '2', '50.00'],
      ['1', '0', '1', '1', '1', '3', '50.00'],
    ],
  );
  assert.deepEqual(
    summarizeMatterOutcomes(synthetic.slice(0, 1), principal)[3]!.groups[0]!.rows.map((r) =>
      values(r.cells).at(-1),
    ),
    ['100.00', '100.00'],
  );
  assert.ok(
    summarizeMatterOutcomes(synthetic.slice(2), principal)[3]!.groups[0]!.rows.every(
      (r) => r.cells.at(-1)!.type === 'null',
    ),
  );
  const third = summarizeMatterOutcomes(
    [...synthetic, { id: 6, matterId: 3, date: '2026-01-01', outcome: 'صالح' }],
    principal,
  );
  assert.equal(values(third[3]!.groups[0]!.rows[0]!.cells).at(-1), '33.33');
  const proof = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const matters = await tx.matter.findMany({
        select: { id: true, clientId: true, status: true, subject: true, caseNumberAr: true },
      });
      const hearings = await tx.hearing.findMany({
        select: {
          id: true,
          matterId: true,
          hearingDate: true,
          outcome: true,
          decision: true,
          courtId: true,
          circuit: true,
        },
      });
      const clients = await tx.client.findMany({ select: { id: true, nameAr: true } });
      const courts = new Map((await tx.lookupCourt.findMany()).map((c) => [c.id, c.labelAr]));
      const parties = await tx.matterParty.findMany({
        select: {
          id: true,
          matterId: true,
          partyName: true,
          side: true,
          gender: true,
          ordinal: true,
          isRetired: true,
        },
      });
      const capacities = new Map((await tx.lookupPartyRole.findMany()).map((c) => [c.id, c]));
      const roles = await tx.matterPartyRole.findMany({
        select: { id: true, partyId: true, roleId: true, ordinal: true, isRetired: true },
      });
      const assignments = await tx.matterLawyer.findMany({
        select: { matterId: true, personId: true, role: true, isRetired: true },
      });
      const people = new Map(
        (await tx.person.findMany({ select: { id: true, nameAr: true } })).map((p) => [
          p.id,
          p.nameAr,
        ]),
      );
      const selections = await tx.closedReportSelection.findMany();
      const text = (s: string | null): ReportCell =>
        s === null ? { type: 'null' } : { type: 'text', value: s };
      const side = (id: number, side: string) => {
        const ps = parties
          .filter((p) => p.matterId === id && p.side === side && !p.isRetired)
          .sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.id - b.id);
        return ps.length
          ? ps
              .map((p) =>
                [
                  p.partyName ?? t.reports.nullValue,
                  ...roles
                    .filter((r) => r.partyId === p.id && !r.isRetired)
                    .sort(
                      (a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.id - b.id,
                    )
                    .map(
                      (r) =>
                        '"' +
                        (p.gender === 'f'
                          ? capacities.get(r.roleId)!.labelArF
                          : capacities.get(r.roleId)!.labelArM) +
                        '"',
                    ),
                ].join('\n'),
              )
              .join('\n\n')
          : null;
      };
      const ranges = [
        ['1900-01-01', '2100-12-31'],
        ['2026-01-01', '2026-12-31'],
        ['2026-01-01', '2026-01-01'],
      ] as const;
      let closedRuns = 0;
      for (const client of clients)
        for (const [from, to] of ranges)
          for (const mode of ['all', 'selected']) {
            const input = parseReportInput(
              closedMatterReport.descriptor,
              new URLSearchParams({
                client: String(client.id),
                from,
                to,
                extra_mode: mode,
                format: 'preview',
              }),
            ).parameters;
            const saved = selections.filter(
              (s) => s.isSelected && matters.find((m) => m.id === s.id)?.clientId === client.id,
            );
            const invalid = saved.some((s) => {
              const h = hearings.find((h) => h.id === s.hearingId);
              return (
                !h ||
                h.matterId !== s.id ||
                !h.hearingDate ||
                matters.find((m) => m.id === s.id)!.status !== 'منتهية'
              );
            });
            if (mode === 'selected' && invalid) {
              await assert.rejects(
                () => closedMatterReport.query(tx, input),
                /selection-incomplete/u,
              );
              closedRuns++;
              continue;
            }
            const expected = matters
              .filter(
                (m) =>
                  m.clientId === client.id &&
                  m.status === 'منتهية' &&
                  m.subject !== null &&
                  m.subject !== 'مطالبة بالأرباح السنوية',
              )
              .flatMap((m) => {
                const h =
                  mode === 'selected'
                    ? hearings.find((h) => h.id === saved.find((s) => s.id === m.id)?.hearingId)
                    : hearings
                        .filter((h) => h.matterId === m.id)
                        .sort(
                          (a, b) =>
                            (b.hearingDate?.getTime() ?? -Infinity) -
                              (a.hearingDate?.getTime() ?? -Infinity) || b.id - a.id,
                        )[0];
                const date = h?.hearingDate?.toISOString().slice(0, 10);
                if (!h || !date || date < from || date > to) return [];
                const court = courts.get(h.courtId!) ?? null;
                const circuit =
                  h.circuit === null || h.circuit === '' || h.circuit === court
                    ? court
                    : `${court ?? t.reports.nullValue}\n${h.circuit.startsWith('(') && h.circuit.endsWith(')') ? h.circuit : `(${h.circuit})`}`;
                return [
                  {
                    id: `matter:${m.id}`,
                    opponent: side(m.id, 'opponent'),
                    numericId: m.id,
                    cells: [
                      m.caseNumberAr === null
                        ? { type: 'null' as const }
                        : { type: 'identifier' as const, value: m.caseNumberAr },
                      text(circuit),
                      text(side(m.id, 'client')),
                      text(side(m.id, 'opponent')),
                      text(m.subject),
                      text(date.replaceAll('-', '/') + '\n' + (h.decision ?? t.reports.nullValue)),
                    ],
                  },
                ];
              })
              .sort(
                (a, b) =>
                  (a.opponent === null
                    ? b.opponent === null
                      ? 0
                      : 1
                    : b.opponent === null
                      ? -1
                      : Buffer.compare(Buffer.from(a.opponent), Buffer.from(b.opponent))) ||
                  a.numericId - b.numericId,
              )
              .map(({ id, cells }) => ({ id, cells }));
            const actual = await closedMatterReport.query(tx, input);
            assert.deepEqual(
              actual.sections.flatMap((s) => s.groups.flatMap((g) => g.rows)),
              expected,
              `closed ${client.id} ${mode} ${from}`,
            );
            assert.equal(
              validateReportData(closedMatterReport.descriptor, actual),
              expected.length,
            );
            if (client.id === 245 && from === '1900-01-01')
              writeFileSync(
                join(out, `matter-closed-${mode}-245-oracle.json`),
                JSON.stringify(actual),
                { flag: 'wx' },
              );
            closedRuns++;
          }
      let summaryRuns = 0;
      for (const [from, to] of [...ranges, ['1800-01-01', '1800-12-31']] as readonly (readonly [
        string,
        string,
      ])[]) {
        const input = parseReportInput(
          matterOutcomeSummary.descriptor,
          new URLSearchParams({ from, to, format: 'preview' }),
        ).parameters;
        const hs = hearings.filter((h) => {
          const date = h.hearingDate?.toISOString().slice(0, 10);
          return (
            date &&
            date >= from &&
            date <= to &&
            h.outcome !== null &&
            clients.some((c) => c.id === matters.find((m) => m.id === h.matterId)?.clientId)
          );
        });
        // Oracle groups independently from base relations, without the production reducer.
        const buckets = new Map<string, typeof hs>();
        buckets.set('overall', hs);
        for (const h of hs) {
          const d = h.hearingDate!.toISOString();
          for (const key of [`month:${d.slice(0, 7)}`, `year:${d.slice(0, 4)}`]) {
            const list = buckets.get(key) ?? [];
            list.push(h);
            buckets.set(key, list);
          }
          const ids = [
            ...new Set(
              assignments
                .filter(
                  (a) =>
                    a.matterId === h.matterId &&
                    !a.isRetired &&
                    ['lead', 'co_lead'].includes(a.role),
                )
                .map((a) => a.personId),
            ),
          ];
          for (const id of ids.length ? ids : ['unassigned']) {
            const key = `lawyer:${id}`,
              list = buckets.get(key) ?? [];
            list.push(h);
            buckets.set(key, list);
          }
        }
        const actual = await matterOutcomeSummary.query(tx, input);
        validateReportData(matterOutcomeSummary.descriptor, actual);
        const rows = actual.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
        assert.equal(rows.length, buckets.size);
        const denominator = hs.filter((h) => h.outcome === 'صالح').length;
        for (const row of rows) {
          const source = buckets.get(row.id)!;
          assert.ok(source);
          const good = source.filter((h) => h.outcome === 'صالح').length,
            bad = source.filter((h) => h.outcome === 'ضد').length,
            empty = source.filter((h) => h.outcome === '').length;
          const rounded = denominator
            ? ((BigInt(good) * 10000n * 2n) / BigInt(denominator) + 1n) / 2n
            : 0n;
          const percentage =
            row.id.startsWith('lawyer:') && denominator
              ? `${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}`
              : null;
          assert.deepEqual(values(row.cells).slice(1), [
            String(good),
            String(bad),
            String(good + bad),
            String(empty),
            String(source.length - good - bad - empty),
            String(source.length),
            percentage,
          ]);
          if (row.id.startsWith('lawyer:') && row.id !== 'lawyer:unassigned')
            assert.equal(
              values(row.cells)[0],
              `${people.get(Number(row.id.split(':')[1]))} (${row.id.split(':')[1]})`,
            );
        }
        for (const section of actual.sections) {
          const chart = reportChart(matterOutcomeSummary.descriptor, section);
          if (chart)
            assert.deepEqual(
              chart.rows.map((r) => r.values.map((v) => v.value)),
              section.groups
                .flatMap((g) => g.rows)
                .map((r) => values(r.cells).slice(1, 3).map(Number)),
            );
        }
        assert.equal(values([actual.totals[0]!.value])[0], String(hs.length));
        if (from === '1900-01-01')
          writeFileSync(join(out, 'matter-outcome-summary-oracle.json'), JSON.stringify(actual), {
            flag: 'wx',
          });
        summaryRuns++;
      }
      return {
        status: 'PASS',
        closedRuns,
        summaryRuns,
        matters: matters.length,
        hearings: hearings.length,
        clients: clients.length,
        synthetic:
          'principal overlap and duplicate roles, unassigned, null denominator, exact two-decimal shares; chart/table equality',
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 600000, maxWait: 15000 },
  );
  writeFileSync(join(out, 'closed-summary-proof.json'), JSON.stringify(proof, null, 2), {
    flag: 'wx',
  });
  console.log(JSON.stringify(proof));
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
