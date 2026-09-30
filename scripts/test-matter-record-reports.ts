import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { t } from '../src/strings';
import { matterRecordReports } from '../src/lib/reports/matter-record';
import { parseReportInput } from '../src/lib/reports/input';
import { validateDefinition, validateReportData } from '../src/lib/reports/result';
import { reportMatterReturn } from '../src/lib/reports/matter-context';
import type { ReportCell, ReportData } from '../src/lib/reports/types';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

async function main() {
  const url = process.env['MIGRATION_DATABASE_URL'];
  const output = process.env['TASK63_EVIDENCE'] ?? '';
  assert.ok(url && output);
  await withApprovedMigrationClient((client) => assertIsolatedTestCluster(client, new URL(url)), {
    databaseUrl: url,
  });
  assert.equal(
    reportMatterReturn('/matters?archive=all&selected=1698'),
    '/matters?archive=all&selected=1698',
  );
  assert.equal(reportMatterReturn('/matters/1698?archive=all'), '/matters/1698?archive=all');
  for (const value of [
    'https://example.com',
    '//example.com',
    '/matters?selected=1&selected=2',
    '/matters?selected=0',
    '/matters/1?selected=2',
    '/matters?selected=1#other',
    '/matters?unexpected=1',
  ])
    assert.throws(() => reportMatterReturn(value));
  for (const def of matterRecordReports) {
    validateDefinition(def);
    for (const matter of ['', '0', 'unassigned', '2147483648', '1 OR 1=1'])
      assert.throws(() =>
        parseReportInput(def.descriptor, new URLSearchParams({ matter, format: 'preview' })),
      );
  }
  const proof = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      // Expectations are independently joined from separately read base relations.
      const matters = await tx.matter.findMany({
        orderBy: { id: 'asc' },
        select: {
          id: true,
          clientId: true,
          caseNumberAr: true,
          subject: true,
          legacyPartnerRaw: true,
          status: true,
          matterCategoryId: true,
          degreeId: true,
          importanceId: true,
        },
      });
      const clients = new Map(
        (await tx.client.findMany({ select: { id: true, nameAr: true } })).map((r) => [
          r.id,
          r.nameAr,
        ]),
      );
      const people = new Map(
        (await tx.person.findMany({ select: { id: true, nameAr: true } })).map((r) => [
          r.id,
          r.nameAr,
        ]),
      );
      const categories = new Map(
        (await tx.lookupMatterCategory.findMany()).map((r) => [r.id, r.labelAr]),
      );
      const degrees = new Map((await tx.lookupDegree.findMany()).map((r) => [r.id, r.labelAr]));
      const importance = new Map(
        (await tx.lookupImportance.findMany()).map((r) => [r.id, r.labelAr]),
      );
      const courts = new Map((await tx.lookupCourt.findMany()).map((r) => [r.id, r.labelAr]));
      const actions = new Map(
        (await tx.lookupHearingAction.findMany()).map((r) => [r.id, r.labelAr]),
      );
      const assignments = await tx.matterLawyer.findMany({
        select: {
          id: true,
          matterId: true,
          personId: true,
          position: true,
          role: true,
          isRetired: true,
        },
      });
      const hearings = await tx.hearing.findMany({
        select: {
          id: true,
          matterId: true,
          hearingDate: true,
          decision: true,
          actionId: true,
          courtId: true,
          circuit: true,
        },
      });
      const attendees = await tx.hearingAttendee.findMany({
        select: {
          id: true,
          hearingId: true,
          personId: true,
          ordinal: true,
          currentOrder: true,
          isRetired: true,
        },
      });
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
      const capacities = new Map((await tx.lookupPartyRole.findMany()).map((r) => [r.id, r]));
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
      const text = (value: string | null): ReportCell =>
        value === null ? { type: 'null' } : { type: 'text', value };
      const ordered = <T extends { id: number; ordinal: number | null }>(rows: T[]) =>
        rows.sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.id - b.id);
      function side(id: number, side: string) {
        const rows = ordered(
          parties.filter((p) => p.matterId === id && p.side === side && !p.isRetired),
        );
        return text(
          rows.length
            ? rows
                .map((p) =>
                  [
                    p.partyName ?? t.reports.nullValue,
                    ...ordered(roles.filter((r) => r.partyId === p.id && !r.isRetired)).map((r) => {
                      const c = capacities.get(r.roleId)!;
                      return '"' + (p.gender === 'f' ? c.labelArF : c.labelArM) + '"';
                    }),
                  ].join('\n'),
                )
                .join('\n\n')
            : null,
        );
      }
      const runs: { id: string; matter: number; rows: number; sha256: string }[] = [];
      for (const m of matters) {
        const lead = assignments
          .filter(
            (a) => a.matterId === m.id && ['lead', 'co_lead'].includes(a.role) && !a.isRetired,
          )
          .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.id - b.id);
        const cells: ReportCell[] = [
          text(clients.get(m.clientId!) ?? null),
          m.caseNumberAr === null
            ? { type: 'null' }
            : { type: 'identifier', value: m.caseNumberAr },
          side(m.id, 'client'),
          side(m.id, 'opponent'),
          text(m.subject),
          text(categories.get(m.matterCategoryId!) ?? null),
          text(degrees.get(m.degreeId!) ?? null),
          text(lead.length ? lead.map((a) => people.get(a.personId)!).join('\n') : null),
          text(m.legacyPartnerRaw),
        ];
        const hs = hearings
          .filter((h) => h.matterId === m.id)
          .sort(
            (a, b) =>
              (a.hearingDate?.getTime() ?? Infinity) - (b.hearingDate?.getTime() ?? Infinity) ||
              a.id - b.id,
          );
        const header = {
          subtitle: [clients.get(m.clientId!), t.matterReports.partnerNote]
            .filter(Boolean)
            .join('\n'),
          clientBrand: {
            name: clients.get(m.clientId!) ?? t.common.notRecorded,
            logo: logos.find((l) => l.clientId === m.clientId) ?? null,
          },
          totals: [],
        };
        const expected: ReportData[] = [
          {
            ...header,
            details: [...cells, text(m.status), text(importance.get(m.importanceId!) ?? null)],
            sections: [
              {
                id: 'hearings',
                title: t.hearings.title,
                groups: [
                  {
                    id: 'history',
                    title: '',
                    rows: hs.map((h) => {
                      const attendance = attendees
                        .filter((a) => a.hearingId === h.id && !a.isRetired)
                        .sort(
                          (a, b) =>
                            (a.currentOrder ?? a.ordinal ?? Infinity) -
                              (b.currentOrder ?? b.ordinal ?? Infinity) || a.id - b.id,
                        );
                      return {
                        id: `hearing:${h.id}`,
                        cells: [
                          h.hearingDate
                            ? { type: 'date', value: h.hearingDate.toISOString().slice(0, 10) }
                            : { type: 'null' },
                          text(h.decision),
                          text(actions.get(h.actionId!) ?? null),
                          text(courts.get(h.courtId!) ?? null),
                          text(h.circuit),
                          text(
                            attendance.length
                              ? attendance
                                  .map((a) => people.get(a.personId!) ?? t.reports.nullValue)
                                  .join('\n')
                              : null,
                          ),
                        ],
                      };
                    }),
                  },
                ],
              },
            ],
          },
          {
            ...header,
            sections: [
              {
                id: 'record',
                title: '',
                groups: [{ id: 'matter', title: '', rows: [{ id: `matter:${m.id}`, cells }] }],
              },
            ],
          },
        ];
        for (const [index, def] of matterRecordReports.entries()) {
          const actual = await def.query(
            tx,
            parseReportInput(
              def.descriptor,
              new URLSearchParams({ format: 'preview', matter: String(m.id) }),
            ).parameters,
          );
          assert.deepEqual(actual, expected[index], `${def.descriptor.id} matter ${m.id}`);
          const count = validateReportData(def.descriptor, actual);
          assert.equal(count, index === 0 ? hs.length : 1);
          runs.push({
            id: def.descriptor.id,
            matter: m.id,
            rows: count,
            sha256: createHash('sha256').update(JSON.stringify(expected[index])).digest('hex'),
          });
          if ([1698, 1755].includes(m.id))
            writeFileSync(
              join(output, `${def.descriptor.id}-${m.id}-oracle.json`),
              JSON.stringify(expected[index]),
              { flag: 'wx' },
            );
        }
      }
      return { status: 'PASS', matters: matters.length, hearings: hearings.length, runs };
    },
    { isolationLevel: 'RepeatableRead', timeout: 600000, maxWait: 15000 },
  );
  writeFileSync(join(output, 'record-source-proof.json'), JSON.stringify(proof, null, 2), {
    flag: 'wx',
  });
  console.log(`PASS ${proof.runs.length} independent complete matter/history comparisons`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
