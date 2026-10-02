import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { t } from '../src/strings';
import { judgmentsByLawyer } from '../src/lib/reports/judgments-by-lawyer';
import { parseReportInput } from '../src/lib/reports/input';
import { validateDefinition, validateReportData } from '../src/lib/reports/result';
import type { ReportCell, ReportData, ReportGroup, ReportRow } from '../src/lib/reports/types';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

/** Independent reconstruction from separately loaded relations. No adapter,
 * production display helper or production grouping helper creates expectations. */
async function main() {
  const url = process.env['MIGRATION_DATABASE_URL'];
  const output = process.argv[2] ?? '';
  assert.ok(url && output);
  await withApprovedMigrationClient((client) => assertIsolatedTestCluster(client, new URL(url)), {
    databaseUrl: url,
  });
  const proof = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const clients = await tx.client.findMany({ select: { id: true, nameAr: true } });
      const matters = await tx.matter.findMany({
        select: { id: true, clientId: true, caseNumberAr: true, subject: true },
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
          notes: true,
        },
      });
      const assignments = await tx.matterLawyer.findMany({
        select: { personId: true, matterId: true, role: true, isRetired: true },
      });
      const people = await tx.person.findMany({ select: { id: true, nameAr: true } });
      const courts = await tx.lookupCourt.findMany({ select: { id: true, labelAr: true } });
      const parties = await tx.matterParty.findMany({
        select: {
          id: true,
          matterId: true,
          side: true,
          partyName: true,
          gender: true,
          ordinal: true,
          isRetired: true,
        },
      });
      const roles = await tx.matterPartyRole.findMany({
        select: { id: true, partyId: true, roleId: true, ordinal: true, isRetired: true },
      });
      const capacities = await tx.lookupPartyRole.findMany({
        select: { id: true, labelArM: true, labelArF: true },
      });
      const cm = new Map(clients.map((c) => [c.id, c.nameAr]));
      const mm = new Map(matters.map((m) => [m.id, m]));
      const courtsById = new Map(courts.map((c) => [c.id, c.labelAr]));
      const labels = new Map(capacities.map((c) => [c.id, c]));
      const text = (value: string | null): ReportCell =>
        value === null ? { type: 'null' } : { type: 'text', value };
      const ordered = <T extends { id: number; ordinal: number | null }>(values: T[]) =>
        values.sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.id - b.id);
      function side(matterId: number, side: string): ReportCell {
        const current = ordered(
          parties.filter((p) => p.matterId === matterId && p.side === side && !p.isRetired),
        );
        if (!current.length) return { type: 'null' };
        return text(
          current
            .map((p) =>
              [
                p.partyName ?? t.reports.nullValue,
                ...ordered(roles.filter((r) => r.partyId === p.id && !r.isRetired)).map((r) => {
                  const l = labels.get(r.roleId)!;
                  return '"' + (p.gender === 'f' ? l.labelArF : l.labelArM) + '"';
                }),
              ].join('\n'),
            )
            .join('\n\n'),
        );
      }
      const integer = (n: number): ReportCell => ({ type: 'integer', value: String(n) });
      const counts = (rows: typeof hearings) => [
        {
          label: t.matterReports.favourableCount,
          value: integer(rows.filter((h) => h.outcome === 'صالح').length),
        },
        {
          label: t.matterReports.againstCount,
          value: integer(rows.filter((h) => h.outcome === 'ضد').length),
        },
        {
          label: t.matterReports.otherCount,
          value: integer(rows.filter((h) => !['صالح', 'ضد'].includes(h.outcome!)).length),
        },
        { label: t.matterReports.hearingCount, value: integer(rows.length) },
      ];
      const runs: unknown[] = [];
      const compare = async (name: string, from: string, to: string) => {
        const qualified = hearings.filter((h) => {
          const m = h.matterId === null ? undefined : mm.get(h.matterId);
          const date = h.hearingDate?.toISOString().slice(0, 10);
          return (
            m &&
            m.clientId !== null &&
            cm.has(m.clientId) &&
            date &&
            date >= from &&
            date <= to &&
            h.outcome !== null &&
            h.outcome !== ''
          );
        });
        const attributions = new Map<number | null, typeof hearings>();
        for (const h of qualified) {
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
          for (const id of ids.length ? ids : [null]) {
            const list = attributions.get(id) ?? [];
            list.push(h);
            attributions.set(id, list);
          }
        }
        const order = [...attributions.keys()].sort((a, b) =>
          a === null
            ? -1
            : b === null
              ? 1
              : Buffer.compare(
                  Buffer.from(people.find((p) => p.id === a)!.nameAr),
                  Buffer.from(people.find((p) => p.id === b)!.nameAr),
                ) || a - b,
        );
        const sections = order.map((id) => {
          const values = attributions
            .get(id)!
            .sort(
              (a, b) =>
                Buffer.compare(Buffer.from(a.outcome!), Buffer.from(b.outcome!)) ||
                a.hearingDate!.getTime() - b.hearingDate!.getTime() ||
                a.id - b.id,
            );
          const outcomes = [...new Set(values.map((h) => h.outcome!))];
          const groups: ReportGroup[] = outcomes.map((outcome, index) => ({
            id: `outcome:${index}`,
            title: outcome,
            rows: values
              .filter((h) => h.outcome === outcome)
              .map((h): ReportRow => {
                const m = mm.get(h.matterId!)!,
                  court = h.courtId === null ? null : (courtsById.get(h.courtId) ?? null);
                let courtValue = court;
                if (h.circuit !== null && h.circuit !== '' && h.circuit !== court)
                  courtValue =
                    (court ?? t.reports.nullValue) +
                    '\n' +
                    (/^\(.*\)$/su.test(h.circuit) ? h.circuit : '(' + h.circuit + ')');
                return {
                  id: `lawyer:${id ?? 'unassigned'}:hearing:${h.id}`,
                  cells: [
                    text(cm.get(m.clientId!)!),
                    m.caseNumberAr === null
                      ? { type: 'null' }
                      : { type: 'identifier', value: m.caseNumberAr },
                    text(courtValue),
                    side(m.id, 'client'),
                    side(m.id, 'opponent'),
                    text(m.subject),
                    text(
                      h.hearingDate!.toISOString().slice(0, 10).split('-').join('/') +
                        '\n' +
                        (h.decision ?? t.reports.nullValue),
                    ),
                    text(h.notes),
                  ],
                };
              }),
          }));
          return {
            id: `lawyer:${id ?? 'unassigned'}`,
            title:
              id === null ? t.lawyerReports.unassigned : people.find((p) => p.id === id)!.nameAr,
            groups,
            totals: counts(values),
          };
        });
        const expected: ReportData = {
          subtitle: t.judgmentsByLawyer.attributionHelp,
          sections,
          totals: [
            { label: t.judgmentsByLawyer.distinctCount, value: integer(qualified.length) },
            ...counts(qualified).slice(0, 3),
          ],
        };
        const d = judgmentsByLawyer;
        validateDefinition(d);
        const parameters = parseReportInput(
          d.descriptor,
          new URLSearchParams({ format: 'preview', from, to }),
        ).parameters;
        const actual = await d.query(tx, parameters);
        assert.deepEqual(actual, expected);
        for (const section of actual.sections) assert.ok(section.title?.length);
        const rows = sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
        assert.equal(validateReportData(d.descriptor, actual), rows.length);
        assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
        const entry = {
          name,
          from,
          to,
          distinct: qualified.length,
          attributions: rows.length,
          sections: sections.length,
          unassigned: attributions.get(null)?.length ?? 0,
          sha256: createHash('sha256').update(JSON.stringify(actual)).digest('hex'),
        };
        runs.push(entry);
        writeFileSync(
          join(output, `judgments-by-lawyer-${name}-oracle.json`),
          JSON.stringify({ parameters, data: expected, ...entry }),
          { flag: 'wx' },
        );
        return entry;
      };
      const all = await compare('all', '0001-01-01', '9998-12-31');
      assert(all.distinct > 50);
      assert(all.unassigned > 0);
      await compare('sample-period', '2010-03-01', '2010-12-01');
      await compare('known-comparison-period', '2011-07-01', '2021-10-31');
      await compare('edges', '2080-02-29', '2080-02-29');
      for (const day of ['2010-03-01', '2010-12-01', '2024-02-29', '9998-12-31'])
        await compare(day, day, day);
      const dated = hearings.find((h) => h.outcome && h.hearingDate && h.matterId !== null)!;
      const day = dated.hearingDate!.toISOString().slice(0, 10);
      await compare('nonempty-boundary', day, day);
      for (const pairs of [
        new URLSearchParams({ format: 'preview' }),
        new URLSearchParams({ format: 'preview', from: '2026-01-02', to: '2026-01-01' }),
        new URLSearchParams({
          format: 'preview',
          from: '2010-03-01',
          to: '2010-12-01',
          lawyer: '7',
        }),
      ])
        assert.throws(() => parseReportInput(judgmentsByLawyer.descriptor, pairs));
      return {
        status: 'PASS',
        at: new Date().toISOString(),
        volumes: {
          hearings: hearings.length,
          matters: matters.length,
          people: people.length,
          assignments: assignments.length,
        },
        runs,
        scope:
          'Independent complete relational oracle; shared field formatting reconstructed independently; original date endpoints; null/empty exclusion; repeated hearings and attribution IDs; no fixture mutation',
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 120000 },
  );
  writeFileSync(
    join(output, 'judgments-by-lawyer-source-proof.json'),
    JSON.stringify(proof, null, 2),
    { flag: 'wx' },
  );
  console.log(`PASS Task68 independent oracle over ${proof.volumes.hearings} hearings`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
