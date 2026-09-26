import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { t } from '../src/strings';
import { clientMatterReports } from '../src/lib/reports/client-matter-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { validateDefinition, validateReportData } from '../src/lib/reports/result';
import type {
  ReportCell,
  ReportData,
  ReportGroup,
  ReportParameters,
  ReportRow,
} from '../src/lib/reports/types';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

/** Independent normalized-relation oracle. No production selection, formatting,
 * grouping or query helper constructs expected values. Full content, not counts. */
async function main() {
  const url = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(url);
  await withApprovedMigrationClient((c) => assertIsolatedTestCluster(c, new URL(url)), {
    databaseUrl: url,
  });
  const proof = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const clients = await tx.client.findMany({ select: { id: true, nameAr: true } });
      const matters = await tx.matter.findMany({
        select: {
          id: true,
          clientId: true,
          branchId: true,
          status: true,
          caseNumberAr: true,
          subject: true,
          courtId: true,
          circuit: true,
          evaluation: true,
          legacyFinancialAllocationRaw: true,
          legacySelected: true,
          legacyId: true,
        },
      });
      const hearings = await tx.hearing.findMany({
        select: {
          id: true,
          matterId: true,
          hearingDate: true,
          decision: true,
          courtId: true,
          circuit: true,
          report: true,
        },
      });
      const branches = await tx.lookupClientBranch.findMany({
        select: { id: true, labelAr: true },
      });
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
      const lawyers = await tx.matterLawyer.findMany({
        select: { matterId: true, personId: true, isRetired: true },
      });
      const logos = await tx.clientLogo.findMany({
        where: { isArchived: false },
        select: {
          clientId: true,
          relativePath: true,
          fileName: true,
          contentType: true,
          byteSize: true,
          sha256: true,
        },
      });
      const day = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;
      const hearingOrder = (a: (typeof hearings)[number], b: (typeof hearings)[number]) =>
        (b.hearingDate?.getTime() ?? -Infinity) - (a.hearingDate?.getTime() ?? -Infinity) ||
        b.id - a.id;
      const latest = new Map<number, (typeof hearings)[number]>();
      for (const h of hearings.toSorted(hearingOrder))
        if (h.matterId !== null && !latest.has(h.matterId)) latest.set(h.matterId, h);
      const text = (value: string | null): ReportCell =>
        value === null ? { type: 'null' } : { type: 'text', value };
      const order = <T extends { id: number; ordinal: number | null }>(items: T[]) =>
        items.sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.id - b.id);
      const party = (matterId: number, side: string): ReportCell => {
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
                      const c = capacities.find((c) => c.id === r.roleId)!;
                      return '"' + (p.gender === 'f' ? c.labelArF : c.labelArM) + '"';
                    }),
                  ].join('\n'),
                )
                .join('\n\n'),
            )
          : text(null);
      };
      const branchName = (id: number | null) => branches.find((b) => b.id === id)?.labelAr ?? null;
      const byteOrder = (a: string | null, b: string | null) =>
        a === null
          ? b === null
            ? 0
            : 1
          : b === null
            ? -1
            : Buffer.compare(Buffer.from(a), Buffer.from(b));
      // Contracts are deliberately listed independently of production configurations.
      const contracts = [
        {
          id: 'client-branches',
          group: true,
          opponent: true,
          matterCourt: true,
          active: false,
          decision: false,
          branch: false,
          separate: false,
          evaluation: false,
          finance: false,
        },
        {
          id: 'client-matters',
          group: false,
          opponent: false,
          matterCourt: false,
          active: true,
          decision: true,
          branch: false,
          separate: false,
          evaluation: false,
          finance: false,
        },
        {
          id: 'client-branch-matters',
          group: false,
          opponent: false,
          matterCourt: true,
          active: false,
          decision: true,
          branch: true,
          separate: true,
          evaluation: false,
          finance: false,
        },
        {
          id: 'client-branch-finance',
          group: false,
          opponent: false,
          matterCourt: false,
          active: false,
          decision: true,
          branch: true,
          separate: false,
          evaluation: false,
          finance: true,
        },
        {
          id: 'client-evaluation',
          group: true,
          opponent: true,
          matterCourt: true,
          active: true,
          decision: true,
          branch: false,
          separate: false,
          evaluation: true,
          finance: false,
        },
        {
          id: 'client-branch-evaluation-finance',
          group: true,
          opponent: false,
          matterCourt: false,
          active: false,
          decision: true,
          branch: false,
          separate: false,
          evaluation: true,
          finance: true,
        },
        {
          id: 'client-status',
          group: false,
          opponent: false,
          matterCourt: true,
          active: false,
          decision: false,
          branch: false,
          separate: false,
          evaluation: false,
          finance: false,
        },
      ];
      const runs: unknown[] = [],
        membership: unknown[] = [],
        samples: Record<string, unknown> = {},
        largest: Record<string, { rows: number; parameters: ReportParameters; data: ReportData }> =
          {};
      for (const c of contracts) {
        const def = clientMatterReports.find((d) => d.descriptor.id === c.id)!;
        validateDefinition(def);
        const status = c.id === 'client-status';
        const adoptedAll = new Set<number>(),
          legacyAll = new Set<number>();
        const added: unknown[] = [],
          removed: unknown[] = [];
        if (!status)
          for (const m of matters) {
            const h = latest.get(m.id);
            const common = m.clientId !== null && (!c.active || m.status === t.values.active);
            const old =
              common &&
              m.legacySelected === true &&
              hearings.some(
                (h) =>
                  h.matterId === m.id &&
                  h.report === true &&
                  (!c.decision || (h.decision !== null && h.decision !== '')),
              );
            const now =
              common && !!h && (!c.decision || (h.decision !== null && h.decision !== ''));
            if (old) legacyAll.add(m.id);
            if (now) adoptedAll.add(m.id);
            if (now && !old)
              added.push({
                matterId: m.id,
                native: m.legacyId === null,
                reasons: [
                  ...(m.legacySelected !== true ? ['old matter selection off/null'] : []),
                  ...(!hearings.some(
                    (h) =>
                      h.matterId === m.id &&
                      h.report === true &&
                      (!c.decision || (h.decision !== null && h.decision !== '')),
                  )
                    ? ['no old flagged qualifying hearing']
                    : []),
                ],
              });
            if (old && !now)
              removed.push({
                matterId: m.id,
                reason: !h
                  ? 'no hearing'
                  : 'selected latest decision null/empty; older flagged decision not substituted',
              });
          }
        for (const client of clients) {
          const branchChoices = c.branch
            ? [
                'unassigned',
                ...new Set(
                  matters
                    .filter((m) => m.clientId === client.id && m.branchId !== null)
                    .map((m) => String(m.branchId)),
                ),
              ]
            : [''];
          for (const branch of branchChoices) {
            const periods: Record<string, string>[] = status
              ? [
                  {},
                  { extra_status: 'all' },
                  { extra_status: 'all', from: '2026-01-01', to: '2026-01-31' },
                  { extra_status: 'all', from: '2026-09-01', to: '2026-09-30' },
                  { extra_status: 'all', from: '2024-02-29' },
                  { extra_status: 'all', to: '2024-02-29' },
                ]
              : [{}];
            for (const period of periods) {
              const pairs = new URLSearchParams({
                format: 'preview',
                client: String(client.id),
                ...(c.branch ? { branch } : {}),
                ...period,
              });
              const p = parseReportInput(def.descriptor, pairs).parameters;
              const expected = matters.filter((m) => {
                const h = latest.get(m.id),
                  date = day(h?.hearingDate);
                return (
                  m.clientId === client.id &&
                  (!(c.active || (status && p.extra['extra_status'] === 'active')) ||
                    m.status === t.values.active) &&
                  (status || !!h) &&
                  (!c.decision ||
                    (h?.decision !== null && h?.decision !== undefined && h?.decision !== '')) &&
                  (!c.branch ||
                    (branch === 'unassigned'
                      ? m.branchId === null
                      : m.branchId === Number(branch))) &&
                  (!p.from || (date !== null && date >= p.from)) &&
                  (!p.to || (date !== null && date <= p.to)) &&
                  (p.lawyer.kind !== 'id' ||
                    lawyers.some(
                      (l) =>
                        l.matterId === m.id &&
                        !l.isRetired &&
                        p.lawyer.kind === 'id' &&
                        l.personId === p.lawyer.id,
                    ))
                );
              });
              expected.sort((a, b) => {
                if (status) {
                  const x = latest.get(a.id),
                    y = latest.get(b.id);
                  return (
                    (y?.hearingDate?.getTime() ?? -Infinity) -
                      (x?.hearingDate?.getTime() ?? -Infinity) ||
                    (y?.id ?? -Infinity) - (x?.id ?? -Infinity) ||
                    a.id - b.id
                  );
                }
                const x = party(a.id, 'opponent'),
                  y = party(b.id, 'opponent');
                return (
                  (c.group
                    ? byteOrder(branchName(a.branchId), branchName(b.branchId)) ||
                      (a.branchId ?? Infinity) - (b.branchId ?? Infinity)
                    : 0) ||
                  (c.opponent
                    ? byteOrder(
                        x.type === 'text' ? x.value : null,
                        y.type === 'text' ? y.value : null,
                      )
                    : 0) ||
                  a.id - b.id
                );
              });
              const groups: { id: string; title: string; rows: ReportRow[] }[] = [];
              for (const m of expected) {
                const h = latest.get(m.id),
                  courtId = c.matterCourt ? m.courtId : h?.courtId,
                  court = courts.find((x) => x.id === courtId)?.labelAr ?? null,
                  circuit = c.matterCourt ? m.circuit : (h?.circuit ?? null);
                let courtValue = court;
                if (!c.separate && circuit !== null && circuit !== '' && circuit !== court)
                  courtValue =
                    (court ?? t.reports.nullValue) +
                    '\n' +
                    (/^\(.*\)$/su.test(circuit) ? circuit : '(' + circuit + ')');
                const groupId = c.group ? 'branch:' + (m.branchId ?? 'unassigned') : 'matters';
                let group = groups.at(-1);
                if (group?.id !== groupId) {
                  group = {
                    id: groupId,
                    title: c.group ? (branchName(m.branchId) ?? t.reports.unassigned) : '',
                    rows: [],
                  };
                  groups.push(group);
                }
                const decision = !h
                  ? t.clientReports.noHearing
                  : (day(h.hearingDate)?.split('-').join('/') ?? t.clientReports.undated) +
                    '\n' +
                    (h.decision === null
                      ? t.reports.nullValue
                      : h.decision === ''
                        ? t.reports.emptyValue
                        : h.decision);
                group.rows.push({
                  id: 'matter:' + m.id,
                  cells: [
                    m.caseNumberAr === null
                      ? { type: 'null' }
                      : { type: 'identifier', value: m.caseNumberAr },
                    text(courtValue),
                    ...(c.separate ? [text(circuit)] : []),
                    party(m.id, 'client'),
                    party(m.id, 'opponent'),
                    text(m.subject),
                    text(decision),
                    ...(c.evaluation ? [text(m.evaluation)] : []),
                    ...(c.finance ? [text(m.legacyFinancialAllocationRaw)] : []),
                  ],
                });
              }
              const data: ReportData = {
                subtitle:
                  client.nameAr +
                  (c.branch
                    ? '\n(' +
                      (branch === 'unassigned'
                        ? t.reports.unassigned
                        : branchName(Number(branch))) +
                      ')'
                    : ''),
                clientBrand: {
                  name: client.nameAr,
                  logo: logos.find((l) => l.clientId === client.id) ?? null,
                },
                totals: [],
                sections: [{ id: 'matters', title: '', groups: groups as ReportGroup[] }],
              };
              const start = performance.now();
              const actual = await def.query(tx, p);
              const milliseconds = performance.now() - start;
              assert.deepEqual(actual, data, `${c.id} ${pairs}`);
              assert.equal(validateReportData(def.descriptor, actual), expected.length);
              const run = {
                id: c.id,
                clientId: client.id,
                pairs: pairs.toString(),
                rows: expected.length,
                milliseconds,
                sha256: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
              };
              runs.push(run);
              if (
                expected.length &&
                (!samples[c.id] || expected.length < (samples[c.id] as { rows: number }).rows)
              )
                samples[c.id] = { ...run, parameters: p, data };
              if (!largest[c.id] || expected.length > largest[c.id]!.rows)
                largest[c.id] = { rows: expected.length, parameters: p, data };
            }
          }
        }
        if (!status)
          membership.push({
            id: c.id,
            scope:
              'All clients; branch-specific variants union all current branch IDs and unassigned; logical matter membership, legacy may have multiple flagged hearings',
            legacyCount: legacyAll.size,
            adoptedCount: adoptedAll.size,
            added,
            removed,
            legacyIds: [...legacyAll].sort((a, b) => a - b),
            adoptedIds: [...adoptedAll].sort((a, b) => a - b),
          });
      }
      assert.equal(Object.keys(samples).length, 7);
      assert.equal(membership.length, 6);
      return {
        status: 'PASS',
        clients: clients.length,
        matters: matters.length,
        hearings: hearings.length,
        branches: branches.length,
        runs,
        membership,
        samples,
        largest,
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 900000 },
  );
  const output = process.env['TASK51_OUTPUT'];
  assert.ok(output);
  writeFileSync(join(output, 'matter-source-oracle.json'), JSON.stringify(proof, null, 2));
  console.log(
    `PASS seven complete typed adapters: ${proof.runs.length} runs; six legacy/adopted membership comparisons`,
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
