import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { t } from '../src/strings';
import { lawyerUpcomingHearings } from '../src/lib/reports/lawyer-upcoming';
import { parseReportInput } from '../src/lib/reports/input';
import { validateDefinition, validateReportData } from '../src/lib/reports/result';
import type { ReportCell, ReportData, ReportGroup } from '../src/lib/reports/types';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

/** Independent relational reconstruction: no production selector, text,
 * party, assignment, grouping or date formatter builds the expected result. */
async function main() {
  const url = process.env['MIGRATION_DATABASE_URL'];
  const output = process.env['TASK64_EVIDENCE'];
  assert.ok(url && output);
  await withApprovedMigrationClient((c) => assertIsolatedTestCluster(c, new URL(url)), {
    databaseUrl: url,
  });
  validateDefinition(lawyerUpcomingHearings);
  const proof = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const clients = await tx.client.findMany({ select: { id: true, nameAr: true } });
      const matters = await tx.matter.findMany({
        select: { id: true, clientId: true, caseNumberAr: true, subject: true },
      });
      const hearings = await tx.$queryRaw<
        {
          id: number;
          matterId: number | null;
          date: string | null;
          nextDate: string | null;
          decision: string | null;
          courtId: number | null;
          circuit: string | null;
        }[]
      >`SELECT id,matter_id AS "matterId",hearing_date::text AS date,
        next_hearing_date::text AS "nextDate",decision,court_id AS "courtId",circuit
        FROM public.hearings ORDER BY id`;
      const assignments = await tx.matterLawyer.findMany({
        select: {
          id: true,
          personId: true,
          matterId: true,
          role: true,
          position: true,
          isRetired: true,
        },
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
      const clientById = new Map(clients.map((c) => [c.id, c.nameAr]));
      const matterById = new Map(matters.map((m) => [m.id, m]));
      const personById = new Map(people.map((p) => [p.id, p.nameAr]));
      const courtById = new Map(courts.map((c) => [c.id, c.labelAr]));
      const capacityById = new Map(capacities.map((c) => [c.id, c]));
      const text = (value: string | null): ReportCell =>
        value === null ? { type: 'null' } : { type: 'text', value };
      const integer = (value: number): ReportCell => ({ type: 'integer', value: String(value) });
      const order = <T extends { id: number; ordinal: number | null }>(rows: T[]) =>
        rows.sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.id - b.id);
      const current = assignments
        .filter((a) => !a.isRetired && ['lead', 'co_lead'].includes(a.role))
        .sort(
          (a, b) =>
            a.matterId - b.matterId ||
            (a.role === b.role ? 0 : a.role === 'lead' ? -1 : 1) ||
            (a.position ?? Infinity) - (b.position ?? Infinity) ||
            a.personId - b.personId ||
            a.id - b.id,
        );
      function side(matterId: number, side: string): ReportCell {
        const rows = order(
          parties.filter((p) => p.matterId === matterId && p.side === side && !p.isRetired),
        );
        return rows.length
          ? text(
              rows
                .map((p) =>
                  [
                    p.partyName ?? t.reports.nullValue,
                    ...order(roles.filter((r) => r.partyId === p.id && !r.isRetired)).map((r) => {
                      const c = capacityById.get(r.roleId)!;
                      return '"' + (p.gender === 'f' ? c.labelArF : c.labelArM) + '"';
                    }),
                  ].join('\n'),
                )
                .join('\n\n'),
            )
          : text(null);
      }
      const runs: { lawyer: number; from: string; to: string; rows: number; sha256: string }[] = [];
      async function compare(lawyer: number, from: string, to: string, save = false) {
        const eligible = new Set(
          current.filter((a) => a.personId === lawyer).map((a) => a.matterId),
        );
        const qualified = hearings
          .filter((h) => {
            const m = matterById.get(h.matterId ?? -1);
            return (
              m &&
              m.clientId !== null &&
              clientById.has(m.clientId) &&
              eligible.has(m.id) &&
              h.nextDate !== null &&
              h.nextDate >= from &&
              h.nextDate <= to
            );
          })
          .sort((a, b) => {
            const x = matterById.get(a.matterId!)!;
            const y = matterById.get(b.matterId!)!;
            return (
              Buffer.compare(
                Buffer.from(clientById.get(x.clientId!)!),
                Buffer.from(clientById.get(y.clientId!)!),
              ) ||
              x.clientId! - y.clientId! ||
              (a.date === b.date
                ? 0
                : a.date === null
                  ? 1
                  : b.date === null
                    ? -1
                    : a.date < b.date
                      ? -1
                      : 1) ||
              a.id - b.id
            );
          });
        const clientIds = [
          ...new Set(qualified.map((h) => matterById.get(h.matterId!)!.clientId!)),
        ];
        const groups: ReportGroup[] = clientIds.map((id) => ({
          id: `client:${id}`,
          title: clientById.get(id)!,
          rows: qualified
            .filter((h) => matterById.get(h.matterId!)!.clientId === id)
            .map((h) => {
              const m = matterById.get(h.matterId!)!;
              const court = courtById.get(h.courtId ?? -1) ?? null;
              let courtValue = court;
              if (h.circuit !== null && h.circuit !== '' && h.circuit !== court)
                courtValue =
                  (court ?? t.reports.nullValue) +
                  '\n' +
                  (/^\(.*\)$/su.test(h.circuit) ? h.circuit : '(' + h.circuit + ')');
              const principalIds = [
                ...new Set(current.filter((a) => a.matterId === m.id).map((a) => a.personId)),
              ];
              return {
                id: `hearing:${h.id}`,
                cells: [
                  m.caseNumberAr === null
                    ? { type: 'null' as const }
                    : { type: 'identifier' as const, value: m.caseNumberAr },
                  text(courtValue),
                  side(m.id, 'client'),
                  side(m.id, 'opponent'),
                  text(m.subject),
                  { type: 'date' as const, value: h.nextDate! },
                  text(principalIds.map((p) => personById.get(p)!).join('\n')),
                  text(
                    h.date === null
                      ? h.decision
                      : h.date.split('-').join('/') + '\n' + (h.decision ?? t.reports.nullValue),
                  ),
                ],
              };
            }),
        }));
        const expected: ReportData = {
          subtitle: '',
          sections: [{ id: 'upcoming', title: '', groups }],
          totals: [
            {
              label: t.lawyerReports.distinctMatters,
              value: integer(new Set(qualified.map((h) => h.matterId)).size),
            },
          ],
        };
        const input = new URLSearchParams({ format: 'preview', lawyer: String(lawyer), from, to });
        const actual = await lawyerUpcomingHearings.query(
          tx,
          parseReportInput(lawyerUpcomingHearings.descriptor, input).parameters,
        );
        assert.deepEqual(actual, expected);
        assert.equal(
          validateReportData(lawyerUpcomingHearings.descriptor, actual),
          qualified.length,
        );
        runs.push({
          lawyer,
          from,
          to,
          rows: qualified.length,
          sha256: createHash('sha256').update(JSON.stringify(actual)).digest('hex'),
        });
        if (save)
          writeFileSync(
            join(output!, `upcoming-lawyer${lawyer}-oracle.json`),
            JSON.stringify(expected),
            { flag: 'wx' },
          );
      }
      for (const p of people) await compare(p.id, '0001-01-01', '9998-12-31', p.id === 4);
      for (const day of ['2024-02-29', '2026-01-01', '9998-12-31']) await compare(4, day, day);
      const example = hearings.find(
        (h) => h.nextDate && current.some((a) => a.matterId === h.matterId),
      );
      assert.ok(example?.nextDate);
      const person = current.find((a) => a.matterId === example.matterId)!;
      await compare(person.personId, example.nextDate, example.nextDate);
      assert.ok(runs.some((r) => r.rows > 50) && runs.some((r) => r.rows === 0));
      return {
        status: 'PASS',
        utc: new Date().toISOString(),
        scope:
          'Independent complete current relations, all person IDs, inclusive next-date qualification, exact cells/groups/order/totals; browser/auth/synthetic edges are separate',
        volumes: {
          clients: clients.length,
          matters: matters.length,
          hearings: hearings.length,
          people: people.length,
        },
        runs,
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 180000 },
  );
  writeFileSync(join(output, 'upcoming-source-proof.json'), JSON.stringify(proof, null, 2), {
    flag: 'wx',
  });
  console.log(
    `PASS ${proof.runs.length} upcoming comparisons across ${proof.volumes.hearings} hearings`,
  );
}
main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : 'failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
