import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { t } from '../src/strings';
import { lawyerReports } from '../src/lib/reports/lawyer-matters';
import { parseReportInput } from '../src/lib/reports/input';
import { validateDefinition, validateReportData } from '../src/lib/reports/result';
import type { ReportCell, ReportDefinition } from '../src/lib/reports/types';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';

/** Reconstruct from complete relations in JavaScript, independent of production
 * LATERAL/EXISTS selection, party, date, court and assignment formatting. */
async function main() {
  const url = process.env['MIGRATION_DATABASE_URL'],
    out = process.env['TASK64_EVIDENCE'];
  assert.ok(url && out);
  const historical = await withApprovedMigrationClient(
    async (c) => {
      await assertIsolatedTestCluster(c, new URL(url));
      await c.query('BEGIN READ ONLY');
      try {
        return {
          matters: (
            await c.query(
              "SELECT id,legacy_source_payload IS NULL missing,legacy_source_payload->>'فريق العمل' team FROM public.matters ORDER BY id",
            )
          ).rows,
          teams: (
            await c.query(
              'SELECT "ID"::text id,"المراجع" reviewer FROM staging."فريق العمل" ORDER BY "ID"',
            )
          ).rows,
        };
      } finally {
        await c.query('ROLLBACK');
      }
    },
    { databaseUrl: url },
  );
  const proof = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const clients = await tx.client.findMany({ select: { id: true, nameAr: true } });
      const matters = await tx.matter.findMany({
        select: {
          id: true,
          clientId: true,
          caseNumberAr: true,
          subject: true,
          status: true,
          courtId: true,
          circuit: true,
          startDate: true,
          matterCategoryId: true,
        },
      });
      const hearings = await tx.$queryRaw<
        {
          id: number;
          matterId: number | null;
          date: string | null;
          decision: string | null;
          courtId: number | null;
          circuit: string | null;
        }[]
      >`SELECT id,matter_id AS "matterId",hearing_date::text AS date,decision,court_id AS "courtId",circuit FROM public.hearings ORDER BY id`;
      const assignments = await tx.matterLawyer.findMany({
        select: {
          id: true,
          matterId: true,
          personId: true,
          role: true,
          position: true,
          isRetired: true,
        },
      });
      const people = await tx.person.findMany({ select: { id: true, nameAr: true } });
      const courts = await tx.lookupCourt.findMany({ select: { id: true, labelAr: true } });
      const categories = await tx.lookupMatterCategory.findMany({
        select: { id: true, labelAr: true },
      });
      const choices = await tx.lawyerReportSelection.findMany({ orderBy: { id: 'asc' } });
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
      const clientMap = new Map(clients.map((x) => [x.id, x.nameAr])),
        courtMap = new Map(courts.map((x) => [x.id, x.labelAr])),
        nameMap = new Map(people.map((x) => [x.id, x.nameAr]));
      const text = (value: string | null): ReportCell =>
        value === null ? { type: 'null' } : { type: 'text', value };
      const date = (value: string | null): ReportCell =>
        value === null ? { type: 'null' } : { type: 'date', value };
      const ordinal = <T extends { id: number; ordinal: number | null }>(rows: T[]) =>
        rows.sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.id - b.id);
      function party(id: number, side: string) {
        const current = ordinal(
          parties.filter((p) => p.matterId === id && p.side === side && !p.isRetired),
        );
        return text(
          current.length
            ? current
                .map((p) =>
                  [
                    p.partyName ?? t.reports.nullValue,
                    ...ordinal(roles.filter((r) => r.partyId === p.id && !r.isRetired)).map((r) => {
                      const label = capacities.find((c) => c.id === r.roleId)!;
                      return '"' + (p.gender === 'f' ? label.labelArF : label.labelArM) + '"';
                    }),
                  ].join('\n'),
                )
                .join('\n\n')
            : null,
        );
      }
      function assigned(id: number, support = false) {
        const rows = assignments
          .filter(
            (a) =>
              a.matterId === id &&
              !a.isRetired &&
              (support ? a.role === 'support' : ['lead', 'co_lead'].includes(a.role)),
          )
          .sort(
            (a, b) =>
              (a.role === b.role ? 0 : a.role === 'lead' ? -1 : 1) ||
              (a.position ?? Infinity) - (b.position ?? Infinity) ||
              a.personId - b.personId ||
              a.id - b.id,
          );
        return [...new Set(rows.map((a) => a.personId))];
      }
      function reviewer(id: number) {
        const m = historical.matters.find((x) => x.id === id)!;
        const teams = historical.teams.filter((x) => x.id === m.team);
        assert.ok(teams.length <= 1);
        if (m.missing) return text(t.lawyerReports.reviewerStates.no_source);
        if (m.team === null) return text(t.lawyerReports.reviewerStates.no_team);
        if (m.team === '') return text(t.lawyerReports.reviewerStates.empty_team);
        if (!teams.length)
          return text(t.lawyerReports.reviewerStates.unknown_team + ' [' + m.team + ']');
        return text(
          teams[0].reviewer === null
            ? t.lawyerReports.reviewerStates.reviewer_null
            : teams[0].reviewer,
        );
      }
      const runs: unknown[] = [];
      async function compare(
        def: ReportDefinition,
        lawyer: number | null,
        mode: 'all' | 'selected',
        from = '0001-01-01',
        to = '9998-12-31',
        client: number | null = null,
        save = false,
      ) {
        validateDefinition(def);
        const id = def.descriptor.id,
          distribution = id === 'lawyer-new-matters',
          position = id === 'lawyer-current-position',
          support = id === 'lawyer-supporting-matters';
        const relevant = matters.filter(
          (m) =>
            m.clientId !== null &&
            clientMap.has(m.clientId) &&
            (client === null || client === m.clientId) &&
            (distribution || position || m.status === 'سارية') &&
            (!distribution || assigned(m.id).length > 0) &&
            (lawyer === null || assigned(m.id, support).includes(lawyer)) &&
            (mode === 'all' || choices.some((s) => s.id === m.id && s.isSelected)),
        );
        const selected = relevant.map((m) => {
          const hs = hearings
            .filter((h) => h.matterId === m.id)
            .sort((a, b) =>
              a.date === b.date
                ? b.id - a.id
                : a.date === null
                  ? 1
                  : b.date === null
                    ? -1
                    : a.date > b.date
                      ? -1
                      : 1,
            );
          return {
            m,
            h:
              mode === 'all'
                ? hs[0]
                : hs.find((h) => h.id === choices.find((s) => s.id === m.id)!.hearingId),
          };
        });
        const invalid =
          mode === 'selected' && !distribution && selected.some((x) => !x.h || x.h.date === null);
        const params = new URLSearchParams({ format: 'preview', extra_mode: mode });
        if (lawyer !== null) params.set('lawyer', String(lawyer));
        if (client !== null) params.set('client', String(client));
        if (def.descriptor.date) {
          params.set('from', from);
          params.set('to', to);
        }
        const parsed = parseReportInput(def.descriptor, params).parameters;
        if (invalid) {
          await assert.rejects(() => def.query(tx, parsed), /selection-incomplete/);
          runs.push({ id, lawyer, mode, client, invalid: true });
          return;
        }
        const qualified = selected.filter(({ m, h }) => {
          const d = distribution
            ? (m.startDate?.toISOString().slice(0, 10) ?? null)
            : (h?.date ?? null);
          return (
            (distribution || !!h) &&
            (!(distribution || position) || (d !== null && d >= from && d <= to))
          );
        });
        const grouped = !distribution && !position;
        const group = (m: (typeof matters)[number]) =>
          grouped
            ? assigned(m.id, support)
                .map((p) => `${nameMap.get(p)} [${p}]`)
                .join('\n')
            : '';
        qualified.sort(
          (a, b) =>
            Buffer.compare(Buffer.from(group(a.m)), Buffer.from(group(b.m))) ||
            Buffer.compare(
              Buffer.from(clientMap.get(a.m.clientId!)!),
              Buffer.from(clientMap.get(b.m.clientId!)!),
            ) ||
            a.m.clientId! - b.m.clientId! ||
            (distribution || position
              ? (distribution ? a.m.startDate!.toISOString() : a.h!.date!).localeCompare(
                  distribution ? b.m.startDate!.toISOString() : b.h!.date!,
                )
              : a.m.caseNumberAr === null
                ? b.m.caseNumberAr === null
                  ? 0
                  : 1
                : b.m.caseNumberAr === null
                  ? -1
                  : Buffer.compare(Buffer.from(a.m.caseNumberAr), Buffer.from(b.m.caseNumberAr))) ||
            a.m.id - b.m.id,
        );
        const actual = await def.query(tx, parsed);
        assert.equal(validateReportData(def.descriptor, actual), qualified.length);
        const flat = actual.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
        assert.deepEqual(
          flat.map((x) => x.id),
          qualified.map((x) => `matter:${x.m.id}`),
        );
        assert.ok(
          actual.subtitle.includes(
            mode === 'all' ? t.lawyerSelection.all : t.reportSelection.selected,
          ),
        );
        if (mode === 'selected' && !qualified.length)
          assert.ok(actual.subtitle.includes(t.lawyerSelection.empty));
        const expectedGroups = new Map<string, { title: string; ids: string[] }>();
        for (const [index, { m, h }] of qualified.entries()) {
          const a = assigned(m.id),
            b = assigned(m.id, true),
            caseCell: ReportCell =
              m.caseNumberAr === null
                ? { type: 'null' }
                : { type: 'identifier', value: m.caseNumberAr };
          const names = (ids: number[]) =>
            text(ids.length ? ids.map((p) => nameMap.get(p)!).join('\n') : null);
          const court = courtMap.get((support ? m.courtId : h?.courtId) ?? -1) ?? null,
            circuit = support ? m.circuit : (h?.circuit ?? null);
          let courtText = court;
          if (circuit !== null && circuit !== '' && circuit !== court)
            courtText =
              (court ?? t.reports.nullValue) +
              '\n' +
              (/^\(.*\)$/su.test(circuit) ? circuit : '(' + circuit + ')');
          const cells = distribution
            ? [
                date(m.startDate?.toISOString().slice(0, 10) ?? null),
                caseCell,
                text(m.subject),
                names(a),
                names(b),
                text(categories.find((c) => c.id === m.matterCategoryId)?.labelAr ?? null),
              ]
            : [
                caseCell,
                text(courtText),
                party(m.id, 'client'),
                party(m.id, 'opponent'),
                text(m.subject),
                date(h!.date),
                text(h!.decision),
                names(a),
                ...(!position ? [names(b), reviewer(m.id)] : []),
              ];
          assert.deepEqual(
            flat[index]!.cells,
            cells,
            `${id} ${mode} coherent matter${m.id} hearing${h?.id}`,
          );
          const people = assigned(m.id, support),
            key = (grouped ? people.join(',') + ':' : '') + `client:${m.clientId}`;
          const entry = expectedGroups.get(key) ?? {
            title:
              (grouped
                ? (people.map((p) => `${nameMap.get(p)} [${p}]`).join(' · ') ||
                    t.reports.unassigned) + '\n'
                : '') + `${clientMap.get(m.clientId!)} [${m.clientId}]`,
            ids: [],
          };
          entry.ids.push(`matter:${m.id}`);
          expectedGroups.set(key, entry);
        }
        assert.deepEqual(
          actual.sections.flatMap((s) =>
            s.groups.map((g) => [g.id, { title: g.title, ids: g.rows.map((r) => r.id) }]),
          ),
          [...expectedGroups.entries()],
        );
        const total = (label: string, value: number) => ({
          label,
          value: { type: 'integer', value: String(value) },
        });
        const totals = [
          total(t.lawyerReports.distinctMatters, qualified.length),
          ...(!distribution ? [total(t.matterReports.hearingCount, qualified.length)] : []),
          ...(mode === 'selected'
            ? [
                total(t.lawyerSelection.relevantSaved, relevant.length),
                total(t.reportSelection.includedCount, qualified.length),
                total(t.reportSelection.excludedCount, relevant.length - qualified.length),
              ]
            : []),
        ];
        if (id === 'lawyer-principal-matters' || id === 'lawyer-all-matters') {
          totals.push(
            total(
              t.lawyerReports.unassigned,
              qualified.filter((x) => !assigned(x.m.id).length).length,
            ),
          );
          const ids = [...new Set(qualified.flatMap((x) => assigned(x.m.id)))].sort(
            (a, b) => a - b,
          );
          for (const p of ids)
            totals.push(
              total(
                `${t.lawyerReports.principalCredit} — ${nameMap.get(p)} [${p}]`,
                qualified.filter((x) => assigned(x.m.id).includes(p)).length,
              ),
            );
          assert.ok(actual.subtitle.includes(t.lawyerReports.summaryNote));
        }
        assert.deepEqual(actual.totals, totals);
        const result = {
          id,
          lawyer,
          mode,
          client,
          from,
          to,
          rows: qualified.length,
          ids: qualified.map((x) => ({ matter: x.m.id, hearing: distribution ? null : x.h!.id })),
          sha256: createHash('sha256').update(JSON.stringify(actual)).digest('hex'),
        };
        runs.push(result);
        if (save)
          writeFileSync(
            join(
              out!,
              id + '-' + mode + (client === null ? '' : '-client' + client) + '-oracle.json',
            ),
            JSON.stringify(
              {
                parameters: parsed,
                descriptor: def.descriptor,
                data: actual,
                expectedIds: result.ids,
              },
              null,
              2,
            ),
            { flag: 'wx' },
          );
      }
      for (const def of lawyerReports) {
        for (const mode of ['all', 'selected'] as const) {
          if (def.descriptor.parameters.lawyer) {
            for (const p of people) await compare(def, p.id, mode);
          } else await compare(def, null, mode);
          await compare(
            def,
            def.descriptor.parameters.lawyer ? 4 : null,
            mode,
            '0001-01-01',
            '9998-12-31',
            null,
            true,
          );
          await compare(
            def,
            def.descriptor.parameters.lawyer ? 4 : null,
            mode,
            '0001-01-01',
            '9998-12-31',
            245,
            true,
          );
          if (def.descriptor.date)
            for (const day of ['2024-02-29', '2026-01-01', '2080-02-29'])
              await compare(def, def.descriptor.parameters.lawyer ? 4 : null, mode, day, day);
        }
      }
      return {
        status: 'PASS',
        utc: new Date().toISOString(),
        volumes: {
          clients: clients.length,
          matters: matters.length,
          hearings: hearings.length,
          people: people.length,
          lawyerChoices: choices.length,
        },
        runs,
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 600000 },
  );
  writeFileSync(join(out, 'lawyer-reports-source-proof.json'), JSON.stringify(proof, null, 2), {
    flag: 'wx',
  });
  console.log(`PASS ${proof.runs.length} independent full-population lawyer-report comparisons`);
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : 'failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
