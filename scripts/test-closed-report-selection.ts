import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import {
  saveClosedReportSelection,
  readClosedReportSelection,
  parseClosedSelectionInput,
  type ClosedSelectionInput,
} from '../src/lib/reports/closed-selection';
import { saveReportSelection, parseSelectionInput } from '../src/lib/reports/selection';
import { closedMatterReport } from '../src/lib/reports/matter-closed';
import { clientMatterReports } from '../src/lib/reports/client-matter-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { closedSelectionFailures } from './lib/closed-selection-checkpoint';
import { reportSelectionFailures } from './lib/report-selection-checkpoint';

async function main() {
  const url = process.env['MIGRATION_DATABASE_URL']!,
    out = process.env['TASK63_EVIDENCE']!;
  assert.ok(url && out);
  const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(
      async (c) => {
        await assertIsolatedTestCluster(c, new URL(url));
        return fn(c);
      },
      { databaseUrl: url },
    );
  await inspect(async () => undefined);
  const sessions = await lifecycleSessions(db),
    admin = sessions.find((s) => s.user.role === 'Administrator')!,
    assistant = sessions.find((s) => s.user.role === 'Litigation Assistant')!;
  const meta = () => ({ database: db, auditMetadata: createMaintenanceAuditMetadata() });
  const events: unknown[] = [];
  const pass = (name: string, detail: unknown = {}) => {
    events.push({ name, detail });
    writeFileSync(join(out, 'closed-selection-proof.json'), JSON.stringify(events, null, 2));
    console.log('PASS ' + name);
  };
  const states = () =>
    inspect(async (c) => ({
      client: (
        await c.query('SELECT to_jsonb(s) value FROM public.client_report_selections s ORDER BY id')
      ).rows,
      history: (
        await c.query(
          'SELECT to_jsonb(s) value FROM _migration.client_report_selection_change s ORDER BY matter_id,version',
        )
      ).rows,
      receipts: (
        await c.query(
          'SELECT to_jsonb(s) value FROM _migration.client_report_selection_submission s ORDER BY submission_id',
        )
      ).rows,
      counts: (
        await c.query(
          `SELECT (SELECT count(*)::int FROM public.audit_events) audit,(SELECT count(*)::int FROM public.closed_report_selections) current,(SELECT count(*)::int FROM _migration.closed_report_selection_change) history,(SELECT count(*)::int FROM _migration.closed_report_selection_submission) receipts`,
        )
      ).rows[0],
    }));
  const report = async (id: string, mode = 'selected') => {
    const def =
      id === 'matter-closed'
        ? closedMatterReport
        : clientMatterReports.find((d) => d.descriptor.id === id)!;
    const p = parseReportInput(
      def.descriptor,
      new URLSearchParams({
        format: 'preview',
        client: '245',
        from: '1900-01-01',
        to: '2100-12-31',
        extra_mode: mode,
      }),
    ).parameters;
    return db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return def.query(tx, p);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  };
  const baseline = await states();
  assert.equal(baseline.counts.current, 0);
  const ten = await db.clientReportSelection.findMany({
    where: { isSelected: true, matter: { clientId: 245 } },
    orderBy: { id: 'asc' },
  });
  assert.ok(ten.length > 0);
  const outputs = await Promise.all(
    ['client-matters', 'client-status'].flatMap((id) =>
      ['all', 'selected'].map((mode) => report(id, mode)),
    ),
  );
  const m = await db.matter.findFirstOrThrow({
    where: {
      clientId: 245,
      status: 'منتهية',
      isArchived: false,
      subject: { not: 'مطالبة بالأرباح السنوية' },
      hearings: { some: { hearingDate: { not: null }, isArchived: false } },
      reportSelection: { is: null },
    },
    orderBy: { id: 'asc' },
    select: { id: true, clientId: true, rowVersion: true },
  });
  const hs = await db.hearing.findMany({
    where: { matterId: m.id, isArchived: false, hearingDate: { not: null } },
    orderBy: [{ hearingDate: 'desc' }, { id: 'desc' }],
    select: { id: true, rowVersion: true, hearingDate: true },
  });
  assert.ok(hs.length);
  const chosen = hs.at(-1)!;
  const input = async (
    hearing: number | null = chosen.id,
    selected = true,
  ): Promise<ClosedSelectionInput> => {
    const current = await db.closedReportSelection.findUnique({ where: { id: m.id } }),
      matter = await db.matter.findUniqueOrThrow({
        where: { id: m.id },
        select: { rowVersion: true },
      }),
      h =
        hearing === null
          ? null
          : await db.hearing.findUniqueOrThrow({
              where: { id: hearing },
              select: { rowVersion: true },
            });
    return {
      scope: 'closed',
      client: 245,
      id: m.id,
      version: current ? String(current.rowVersion) : '0',
      matterVersion: String(matter.rowVersion),
      hearingId: hearing,
      hearingVersion: h ? String(h.rowVersion) : null,
      selected,
      submission: randomUUID(),
    };
  };
  const save = (value: unknown, session: typeof admin | null = admin) =>
    saveClosedReportSelection(session, value, meta());
  const original = await input();
  for (const session of [
    null,
    ...sessions.filter((s) => !['Administrator', 'Litigation Assistant'].includes(s.user.role)),
    { ...admin, expires: '2000-01-01T00:00:00Z' },
    { ...admin, user: { ...admin.user, sessionVersion: admin.user.sessionVersion + 1 } },
    { ...admin, user: { ...admin.user, personId: admin.user.personId + 1 } },
  ])
    await assert.rejects(() => save(original, session));
  assert.throws(() => parseSelectionInput(original));
  const { scope, ...clientInput } = original;
  assert.equal(scope, 'closed');
  assert.throws(() => parseClosedSelectionInput(clientInput));
  assert.throws(() => parseClosedSelectionInput({ ...original, scope: 'client' }));
  const foreign = await db.hearing.findFirstOrThrow({
    where: { matterId: { not: m.id } },
    select: { id: true, rowVersion: true },
  });
  await assert.rejects(() =>
    save({ ...original, hearingId: foreign.id, hearingVersion: String(foreign.rowVersion) }),
  );
  assert.deepEqual(await states(), baseline);
  pass(
    'denied roles, expired/revoked/mismatched sessions, strict scope and foreign hearing leave no effects',
  );
  const first = await save(original),
    after = await states();
  assert.deepEqual(first, { id: m.id, version: '1', changed: true });
  assert.deepEqual(after.counts, {
    audit: baseline.counts.audit + 1,
    current: 1,
    history: 1,
    receipts: 1,
  });
  for (const key of ['client', 'history', 'receipts'] as const)
    assert.deepEqual(after[key], baseline[key]);
  assert.deepEqual(await save(original), first);
  assert.deepEqual(await states(), after);
  await assert.rejects(() => save({ ...original, submission: randomUUID() }));
  await assert.rejects(() => save({ ...original, selected: false }));
  await assert.rejects(() => save(original, assistant));
  assert.deepEqual(await states(), after);
  pass(
    'separate atomic save, response-loss retry, stale/conflicting/cross-user token rejected; old rows/history/receipts exact',
  );
  const noop = await save(await input());
  assert.equal(noop.changed, false);
  assert.deepEqual((await states()).counts, { ...after.counts, receipts: 2 });
  pass('explicit no-op creates one scoped receipt, no audit/version/history');
  for (const session of sessions)
    assert.equal(
      (await readClosedReportSelection(session, 245, m.id, 1, db)).matters[0]!.hearingId,
      chosen.id,
    );
  const selected = await report('matter-closed');
  assert.equal(selected.sections[0]!.groups[0]!.rows.length, 1);
  assert.equal(selected.sections[0]!.groups[0]!.rows[0]!.id, `matter:${m.id}`);
  assert.ok(
    JSON.stringify(selected).includes(
      chosen.hearingDate!.toISOString().slice(0, 10).replaceAll('-', '/'),
    ),
  );
  assert.deepEqual(
    await Promise.all(
      ['client-matters', 'client-status'].flatMap((id) =>
        ['all', 'selected'].map((mode) => report(id, mode)),
      ),
    ),
    outputs,
  );
  assert.deepEqual(
    await db.clientReportSelection.findMany({
      where: { isSelected: true, matter: { clientId: 245 } },
      orderBy: { id: 'asc' },
    }),
    ten,
  );
  pass(
    'exact saved hearing and four-role reads; client245 baseline choices and all/selected outputs unchanged',
    { clientChoices: ten.length, matter: m.id, hearing: chosen.id, latest: hs[0]!.id },
  );
  await save(await input(null));
  await assert.rejects(() => report('matter-closed'), /selection-incomplete/u);
  await save(await input(null, false));
  assert.equal((await report('matter-closed')).sections[0]!.groups[0]!.rows.length, 0);
  pass('draft blocks Selected; explicit clear returns empty, no All fallback');
  // Demonstrate the old-pool hazard, then explicitly clear only this newly introduced fixture choice.
  const old = { ...clientInput, submission: randomUUID() };
  await saveReportSelection(admin, old, meta());
  await assert.rejects(() => report('client-matters'), /selection-incomplete/u);
  const c = await db.clientReportSelection.findUniqueOrThrow({ where: { id: m.id } });
  await saveReportSelection(
    admin,
    {
      ...old,
      version: String(c.rowVersion),
      selected: false,
      hearingId: null,
      hearingVersion: null,
      submission: randomUUID(),
    },
    meta(),
  );
  assert.deepEqual(await report('client-matters'), outputs[1]);
  pass(
    'shared-pool hazard reproduced only in fixture; clearing exact task choice restores accepted active Selected output',
  );
  const oldState = await states();
  await save(await input());
  const own = await input();
  await assert.rejects(() => save({ ...own, submission: old.submission }));
  const latestClosed = (
    await inspect((c) =>
      c.query(
        'SELECT submission_id FROM _migration.closed_report_selection_submission WHERE matter_id=$1 ORDER BY created_at DESC LIMIT 1',
        [m.id],
      ),
    )
  ).rows[0].submission_id;
  const oldCurrent = await db.clientReportSelection.findUniqueOrThrow({ where: { id: m.id } });
  await assert.rejects(() =>
    saveReportSelection(
      admin,
      { ...old, version: String(oldCurrent.rowVersion), submission: latestClosed },
      meta(),
    ),
  );
  const now = await states();
  for (const key of ['client', 'history', 'receipts'] as const)
    assert.deepEqual(now[key], oldState[key]);
  await save(await input(null, false));
  pass(
    'same matter has independent scope/version/history; cross-scope token reuse rejects in both directions',
  );
  await assert.rejects(
    () =>
      db.$executeRaw`UPDATE public.closed_report_selections SET is_selected=true WHERE id=${m.id}`,
  );
  await inspect(async (c) => {
    assert.deepEqual(await closedSelectionFailures(c), []);
    assert.deepEqual(await reportSelectionFailures(c), []);
  });
  assert.deepEqual(
    await db.clientReportSelection.findMany({
      where: { isSelected: true, matter: { clientId: 245 } },
      orderBy: { id: 'asc' },
    }),
    ten,
  );
  pass(
    'runtime direct writes denied; both ongoing schema/history invariants pass; original client245 choices exact',
    { final: await states() },
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
