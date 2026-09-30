import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import {
  saveClosedReportSelection,
  readClosedReportSelection,
} from '../src/lib/reports/closed-selection';
import { closedMatterReport } from '../src/lib/reports/matter-closed';
import { parseReportInput } from '../src/lib/reports/input';
import { mutateMatter } from '../src/lib/matter-mutations';
import { mutateMatterLifecycle, readMatterLifecycle } from '../src/lib/matter-lifecycle';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';

async function main() {
  const url = process.env['MIGRATION_DATABASE_URL']!,
    out = process.env['TASK63_EVIDENCE']!;
  assert.ok(url && out);
  await withApprovedMigrationClient((c) => assertIsolatedTestCluster(c, new URL(url)), {
    databaseUrl: url,
  });
  const matches = await db.matter.findMany({
    where: { caseNumberAr: 'TEST ONLY TASK63 001\n140J / 140ق', legacyId: null },
    select: { id: true },
  });
  assert.equal(matches.length, 1);
  const id = matches[0]!.id;
  const sessions = await lifecycleSessions(db),
    admin = sessions.find((s) => s.user.role === 'Administrator')!,
    assistant = sessions.find((s) => s.user.role === 'Litigation Assistant')!;
  const meta = () => ({ database: db, auditMetadata: createMaintenanceAuditMetadata() });
  const log: unknown[] = [];
  const pass = (name: string) => {
    log.push({ name });
    writeFileSync(join(out, 'closed-edges.json'), JSON.stringify(log, null, 2));
    console.log('PASS ' + name);
  };
  const hearings = await db.hearing.findMany({
    where: { matterId: id },
    orderBy: { id: 'asc' },
    select: { id: true, hearingDate: true, rowVersion: true },
  });
  assert.equal(hearings.length, 52);
  const input = async (hearing: number | null, selected = true) => {
    const s = await db.closedReportSelection.findUniqueOrThrow({ where: { id } }),
      m = await db.matter.findUniqueOrThrow({ where: { id }, select: { rowVersion: true } }),
      h = hearings.find((h) => h.id === hearing);
    return {
      scope: 'closed',
      client: 245,
      id,
      version: String(s.rowVersion),
      matterVersion: String(m.rowVersion),
      hearingId: hearing,
      hearingVersion: h ? String(h.rowVersion) : null,
      selected,
      submission: randomUUID(),
    };
  };
  const report = (mode: string, from = '2026-01-01', to = '2026-12-31') =>
    db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return closedMatterReport.query(
          tx,
          parseReportInput(
            closedMatterReport.descriptor,
            new URLSearchParams({ client: '245', from, to, extra_mode: mode, format: 'preview' }),
          ).parameters,
        );
      },
      { isolationLevel: 'RepeatableRead' },
    );
  const rows = (r: Awaited<ReturnType<typeof report>>) =>
    r.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
  assert.equal(rows(await report('all')).length, 0);
  assert.equal(rows(await report('all', '2027-01-01', '2027-01-01')).length, 1);
  const request = await input(hearings[1]!.id);
  const race = await Promise.allSettled([
    saveClosedReportSelection(admin, request, meta()),
    saveClosedReportSelection(assistant, { ...request, submission: randomUUID() }, meta()),
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(rows(await report('selected', '2026-01-01', '2026-01-01')).length, 1);
  assert.equal(rows(await report('selected', '2026-01-02', '2026-12-31')).length, 0);
  pass(
    'latest overall before period, native same-date selected hearing, inclusive boundaries and exactly one concurrent save',
  );
  await saveClosedReportSelection(admin, await input(hearings.at(-1)!.id), meta());
  await assert.rejects(() => report('selected'), /selection-incomplete/u);
  pass('undated exact saved hearing is incomplete, not a latest fallback');
  await saveClosedReportSelection(admin, await input(hearings[1]!.id), meta());
  const changeStatus = async (status: string) => {
    const m = await db.matter.findUniqueOrThrow({ where: { id }, select: { rowVersion: true } });
    return mutateMatter(
      admin,
      'update',
      { id, version: String(m.rowVersion), submission: randomUUID(), values: { status } },
      meta(),
    );
  };
  const saved = await db.closedReportSelection.findUniqueOrThrow({ where: { id } });
  await changeStatus('سارية');
  assert.deepEqual(await db.closedReportSelection.findUniqueOrThrow({ where: { id } }), saved);
  assert.equal(
    (await readClosedReportSelection(admin, 245, id, 1, db)).matters[0]!.eligible,
    false,
  );
  await assert.rejects(() => report('selected'), /selection-incomplete/u);
  await assert.rejects(() => saveClosedReportSelection(admin, awaitInputInvalid(), meta()));
  function awaitInputInvalid() {
    return { ...request, version: String(saved.rowVersion), submission: randomUUID() };
  }
  await saveClosedReportSelection(admin, await input(null, false), meta());
  await changeStatus('منتهية');
  await saveClosedReportSelection(admin, await input(hearings[1]!.id), meta());
  pass(
    'reopened status preserves choice, reports it ineligible, blocks output, permits deliberate clear',
  );
  const before = await report('selected');
  const state = await readMatterLifecycle(admin, 'archive', id, db);
  await mutateMatterLifecycle(
    admin,
    'archive',
    {
      id,
      confirmation: id,
      version: state.version,
      counts: state.counts,
      action: 'archive',
      submission: randomUUID(),
    },
    meta(),
  );
  assert.deepEqual(await report('selected'), before);
  await assert.rejects(() => saveClosedReportSelection(admin, awaitInputInvalid(), meta()));
  const restored = await readMatterLifecycle(admin, 'restore', id, db);
  await mutateMatterLifecycle(
    admin,
    'restore',
    {
      id,
      confirmation: id,
      version: restored.version,
      counts: restored.counts,
      action: 'restore',
      submission: randomUUID(),
    },
    meta(),
  );
  assert.deepEqual(await report('selected'), before);
  pass('archived business content remains exact, editing restricted; explicit restoration');
  // Leave a genuine saved choice for four-role browser preview/export and editor tests.
  const model = await readClosedReportSelection(admin, 245, id, 1, db);
  assert.equal(model.hearings.length, 25);
  assert.equal(model.moreHearings, true);
  assert.ok(!model.hearings.some((h) => h.id === model.matters[0]!.hearingId));
  assert.ok(model.matters[0]!.hearingVersion);
  pass('saved older hearing remains exact outside first loaded page; 52-hearing pagination');
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
