import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { t } from '../src/strings';
import { matterJudgmentReports } from '../src/lib/reports/matter-judgments';
import { parseReportInput } from '../src/lib/reports/input';
import { validateDefinition, validateReportData } from '../src/lib/reports/result';
import type { ReportCell, ReportData, ReportGroup, ReportRow } from '../src/lib/reports/types';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

/** Independent reconstruction from separately loaded relations. No adapter,
 * production display helper or production grouping helper creates expectations. */
async function main() {
  const url = process.env['MIGRATION_DATABASE_URL'];
  const output = process.env['TASK63_EVIDENCE'] ?? '';
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
      const people = await tx.person.findMany({ select: { id: true } });
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
      const runs: {
        id: string;
        lawyer: number | null;
        from: string;
        to: string;
        rows: number;
        sha256: string;
      }[] = [];
      async function compare(byLawyer: boolean, lawyer: number | null, from: string, to: string) {
        const definition = matterJudgmentReports[byLawyer ? 1 : 0];
        validateDefinition(definition);
        const qualified = hearings
          .filter((h) => {
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
              (!byLawyer ||
                (h.outcome !== '' &&
                  assignments.some(
                    (a) =>
                      a.matterId === m.id &&
                      !a.isRetired &&
                      ['lead', 'co_lead'].includes(a.role) &&
                      a.personId === lawyer,
                  )))
            );
          })
          .sort(
            (a, b) =>
              Buffer.compare(Buffer.from(a.outcome!), Buffer.from(b.outcome!)) ||
              a.hearingDate!.getTime() - b.hearingDate!.getTime() ||
              a.id - b.id,
          );
        const outcomes = [...new Set(qualified.map((h) => h.outcome!))];
        const groups: ReportGroup[] = outcomes.map((outcome, index) => ({
          id: `outcome:${index}`,
          title: outcome === '' ? t.reports.emptyValue : outcome,
          rows: qualified
            .filter((h) => h.outcome === outcome)
            .map((h): ReportRow => {
              const m = mm.get(h.matterId!)!;
              const court = h.courtId === null ? null : (courtsById.get(h.courtId) ?? null);
              let courtValue = court;
              if (h.circuit !== null && h.circuit !== '' && h.circuit !== court)
                courtValue =
                  (court ?? t.reports.nullValue) +
                  '\n' +
                  (/^\(.*\)$/su.test(h.circuit) ? h.circuit : '(' + h.circuit + ')');
              return {
                id: `hearing:${h.id}`,
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
                  ...(byLawyer ? [text(h.notes)] : []),
                ],
              };
            }),
        }));
        const integer = (count: number): ReportCell => ({ type: 'integer', value: String(count) });
        const expected: ReportData = {
          subtitle: '',
          sections: [{ id: 'judgments', title: '', groups }],
          ...(!byLawyer
            ? {
                outcomeCounts: outcomes.map((outcome) => ({
                  outcome,
                  count: qualified.filter((h) => h.outcome === outcome).length,
                })),
              }
            : {}),
          totals: [
            {
              label: t.matterReports.favourableCount,
              value: integer(qualified.filter((h) => h.outcome === 'صالح').length),
            },
            {
              label: t.matterReports.againstCount,
              value: integer(qualified.filter((h) => h.outcome === 'ضد').length),
            },
            {
              label: t.matterReports.emptyCount,
              value: integer(qualified.filter((h) => h.outcome === '').length),
            },
            {
              label: t.matterReports.otherCount,
              value: integer(
                qualified.filter((h) => !['صالح', 'ضد', ''].includes(h.outcome!)).length,
              ),
            },
          ],
        };
        const pairs = new URLSearchParams({ format: 'preview', from, to });
        if (byLawyer) pairs.set('lawyer', String(lawyer));
        const actual = await definition.query(
          tx,
          parseReportInput(definition.descriptor, pairs).parameters,
        );
        assert.deepEqual(actual, expected);
        assert.equal(validateReportData(definition.descriptor, actual), qualified.length);
        const sha256 = createHash('sha256').update(JSON.stringify(actual)).digest('hex');
        runs.push({
          id: definition.descriptor.id,
          lawyer,
          from,
          to,
          rows: qualified.length,
          sha256,
        });
        if (!byLawyer && from === '0001-01-01')
          writeFileSync(join(output, 'judgments-all-oracle.json'), JSON.stringify(expected), {
            flag: 'wx',
          });
        if (byLawyer && lawyer === 7 && from === '0001-01-01')
          writeFileSync(join(output, 'judgments-lawyer7-oracle.json'), JSON.stringify(expected), {
            flag: 'wx',
          });
      }
      await compare(false, null, '0001-01-01', '9998-12-31');
      for (const p of people) await compare(true, p.id, '0001-01-01', '9998-12-31');
      for (const day of ['2024-02-29', '2026-01-01', '9998-12-31'])
        await compare(false, null, day, day);
      const example = hearings.find((h) => h.outcome && h.hearingDate && h.matterId !== null);
      assert.ok(example?.hearingDate);
      const date = example.hearingDate.toISOString().slice(0, 10);
      await compare(false, null, date, date);
      assert.ok(runs.some((r) => r.rows === 0) && runs.some((r) => r.rows > 50));
      return {
        status: 'PASS',
        utc: new Date().toISOString(),
        scope:
          'Independent full-volume read-only relational oracle; browser/authorization/edge mutations are separate gates',
        volumes: {
          clients: clients.length,
          matters: matters.length,
          hearings: hearings.length,
          people: people.length,
        },
        runs,
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 120000 },
  );
  writeFileSync(join(output, 'judgments-source-proof.json'), JSON.stringify(proof, null, 2), {
    flag: 'wx',
  });
  console.log(
    `PASS ${proof.runs.length} judgment comparisons across ${proof.volumes.hearings} hearings`,
  );
}
main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : 'failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
