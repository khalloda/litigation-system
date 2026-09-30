import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { mutateMatter, readMatterMutation } from '../src/lib/matter-mutations';
import { mutateHearing } from '../src/lib/hearing-mutations';
import { mutateHearingLifecycle, readHearingLifecycle } from '../src/lib/hearing-lifecycle';
import { mutateMatterLifecycle, readMatterLifecycle } from '../src/lib/matter-lifecycle';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { lawyerUpcomingHearings } from '../src/lib/reports/lawyer-upcoming';
import { parseReportInput } from '../src/lib/reports/input';
import { validateReportData } from '../src/lib/reports/result';

async function main() {
  const url = process.env['MIGRATION_DATABASE_URL']!,
    out = process.env['TASK64_EVIDENCE']!;
  assert.ok(url && out);
  await withApprovedMigrationClient((c) => assertIsolatedTestCluster(c, new URL(url)), {
    databaseUrl: url,
  });
  const admin = (await lifecycleSessions(db)).find((s) => s.user.role === 'Administrator')!;
  const meta = () => ({ database: db, auditMetadata: createMaintenanceAuditMetadata() });
  const report = (lawyer: number, from: string, to = from) =>
    db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const result = await lawyerUpcomingHearings.query(
          tx,
          parseReportInput(
            lawyerUpcomingHearings.descriptor,
            new URLSearchParams({ lawyer: String(lawyer), from, to, format: 'preview' }),
          ).parameters,
        );
        validateReportData(lawyerUpcomingHearings.descriptor, result);
        return result;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  const rows = (data: Awaited<ReturnType<typeof report>>) =>
    data.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
  const snapshot = await readMatterMutation(admin, 'create', null, db);
  const lawyers = [4, 7, 8];
  for (const id of lawyers)
    assert.equal(snapshot.people.filter((p) => p.id === id && p.active).length, 1);
  assert.equal(snapshot.clients.filter((c) => c.id === 245 && c.active).length, 1);
  const record = 'TEST ONLY TASK64 UPCOMING\n001 / 2080\n140J / 140ق';
  assert.equal(
    await db.matter.count({ where: { caseNumberAr: record } }),
    0,
    'New fixture only; inspect prior outcome before retry',
  );
  const requestsPath = join(out, 'upcoming-edge-requests.json');
  assert.ok(!existsSync(requestsPath));
  const requests = {
    matter: randomUUID(),
    hearings: Array.from({ length: 54 }, () => randomUUID()),
    retire: randomUUID(),
    archiveHearing: randomUUID(),
    archiveMatter: randomUUID(),
  };
  writeFileSync(requestsPath, JSON.stringify(requests), { flag: 'wx' });
  for (const id of lawyers)
    assert.equal(rows(await report(id, '2080-02-28', '2080-03-01')).length, 0);
  const created = await mutateMatter(
    admin,
    'create',
    {
      id: null,
      version: null,
      submission: requests.matter,
      values: {
        client_id: 245,
        case_number_ar: record,
        subject: 'TEST ONLY TASK64 أَإِ ثانٍ\n' + 'TEST ONLY legal text '.repeat(35),
        status: 'منتهية',
      },
      parties: [
        {
          id: null,
          side: 'client',
          party_name: 'TEST ONLY TASK64 party\nsecond line',
          gender: null,
          ordinal: 1,
          roles: [],
        },
      ],
      lawyers: lawyers.map((id, index) => ({
        id: null,
        person_id: id,
        role: ['lead', 'co_lead', 'support'][index],
        position: index + 1,
      })),
    },
    meta(),
  );
  const hearings: { id: number; version: string }[] = [];
  const checkpoints: unknown[] = [];
  const progress = () =>
    writeFileSync(
      join(out, 'upcoming-edge-progress.json'),
      JSON.stringify({ created, hearings, checkpoints }, null, 2),
    );
  progress();
  for (let i = 0; i < 54; i++) {
    const hearing = await mutateHearing(
      admin,
      'create',
      {
        id: null,
        version: null,
        submission: requests.hearings[i],
        values: {
          matter_id: created.id,
          hearing_date: i === 51 ? null : i === 0 ? '2079-12-31' : '2080-01-01',
          next_hearing_date:
            i === 0 ? '2080-02-28' : i <= 51 ? '2080-02-29' : i === 52 ? '2080-03-01' : null,
          decision:
            i === 51 ? null : i === 1 ? '' : 'TEST ONLY TASK64 previous ' + i + '\r\nأَإِ ثانٍ',
          circuit: 'TEST ONLY TASK64 circuit',
          outcome: null,
        },
        attendees: [],
      },
      meta(),
    );
    hearings.push(hearing);
    progress();
    if ([0, 50, 51].includes(i)) {
      const result = await report(4, i === 0 ? '2080-02-28' : '2080-02-29');
      assert.equal(rows(result).length, i === 0 ? 1 : i);
      checkpoints.push({ phase: 'created-' + i, count: rows(result).length });
      progress();
    }
  }
  const expected = hearings.slice(1, 52).map((h) => `hearing:${h.id}`);
  const complete = await report(4, '2080-02-29');
  assert.deepEqual(
    rows(complete).map((r) => r.id),
    expected,
  );
  assert.deepEqual(rows(complete).at(-1)!.cells.at(-1), { type: 'null' });
  assert.deepEqual(rows(complete)[0]!.cells.at(-1), { type: 'text', value: '2080/01/01\n' });
  assert.deepEqual(complete.totals[0]!.value, { type: 'integer', value: '1' });
  assert.deepEqual(await report(7, '2080-02-29'), complete);
  assert.equal(rows(await report(8, '2080-02-29')).length, 0);
  assert.equal(rows(await report(4, '2080-03-01')).length, 1);
  assert.equal(rows(await report(4, '2080-02-28', '2080-03-01')).length, 53);
  const native = await db.matter.findUniqueOrThrow({
    where: { id: created.id },
    select: { legacyId: true, legacySelected: true },
  });
  assert.deepEqual(native, { legacyId: null, legacySelected: null });
  assert.equal(await db.hearing.count({ where: { matterId: created.id, report: true } }), 0);
  const beforeRetirement = await readMatterMutation(admin, 'update', created.id, db);
  await mutateMatter(
    admin,
    'update',
    {
      id: created.id,
      version: beforeRetirement.record!.version,
      submission: requests.retire,
      values: {},
      lawyers: beforeRetirement.lawyers.filter((l) => l.person_id !== 4),
    },
    meta(),
  );
  assert.equal(rows(await report(4, '2080-02-29')).length, 0);
  const surviving = await report(7, '2080-02-29');
  assert.deepEqual(
    rows(surviving).map((r) => r.id),
    expected,
  );
  const h = await readHearingLifecycle(admin, 'archive', hearings[1]!.id, db);
  await mutateHearingLifecycle(
    admin,
    'archive',
    {
      id: h.id,
      confirmation: h.id,
      version: h.version,
      facts: h.facts,
      action: 'archive',
      submission: requests.archiveHearing,
    },
    meta(),
  );
  const m = await readMatterLifecycle(admin, 'archive', created.id, db);
  await mutateMatterLifecycle(
    admin,
    'archive',
    {
      id: m.id,
      confirmation: m.id,
      version: m.version,
      counts: m.counts,
      action: 'archive',
      submission: requests.archiveMatter,
    },
    meta(),
  );
  assert.deepEqual(await report(7, '2080-02-29'), surviving);
  writeFileSync(join(out, 'upcoming-native-oracle.json'), JSON.stringify(surviving), {
    flag: 'wx',
  });
  writeFileSync(
    join(out, 'upcoming-edges.json'),
    JSON.stringify(
      {
        status: 'PASS',
        utc: new Date().toISOString(),
        matter: created.id,
        hearings: hearings.map((h) => h.id),
        lawyers,
        scope:
          'Native closed matter; no legacy flags; all54 hearings retained, inclusive leap-day/next-day/null-next-date and undated-original cases; 0/1/50/51 detail counts; lead/co-lead versus support; retired assignment excluded; archived hearing and matter unchanged; exact null/empty/multiline cells',
        checkpoints,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  console.log('PASS Task64 upcoming native/boundary/role/archive cases');
}
main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : 'failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
