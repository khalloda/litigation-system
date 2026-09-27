import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { Session } from 'next-auth';
import { Prisma } from '../src/generated/prisma/client';
import { db } from '../src/lib/db';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { setHumanAuditContext } from '../src/lib/audit';
import {
  saveReportSelection,
  readReportSelection,
  parseSelectionInput,
  type SelectionInput,
} from '../src/lib/reports/selection';
import { clientMatterReports } from '../src/lib/reports/client-matter-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { reportSelectionFailures } from './lib/report-selection-checkpoint';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';

async function main() {
  const url = process.env['MIGRATION_DATABASE_URL']!;
  const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(
      async (c) => {
        await assertIsolatedTestCluster(c, new URL(url));
        return work(c);
      },
      { databaseUrl: url },
    );
  await inspect(async () => undefined);
  const results: unknown[] = [];
  const pass = (name: string, detail: unknown = {}) => {
    results.push({ name, detail });
    writeFileSync(
      process.env['TASK51_OUTPUT']! + '/selection-results.json',
      JSON.stringify(results, null, 2),
    );
    console.log('PASS ' + name);
  };
  const sessions = await lifecycleSessions(db),
    admin = sessions.find((s) => s.user.role === 'Administrator')!,
    assistant = sessions.find((s) => s.user.role === 'Litigation Assistant')!;
  const state = async () =>
    inspect(
      async (c) =>
        (
          await c.query(
            `SELECT (SELECT count(*)::int FROM public.audit_events) audit,(SELECT count(*)::int FROM public.client_report_selections) current,(SELECT count(*)::int FROM _migration.client_report_selection_change) history,(SELECT count(*)::int FROM _migration.client_report_selection_submission) receipts`,
          )
        ).rows[0],
    );
  const input = async (
    id: number,
    hearingId: number | null,
    selected = true,
  ): Promise<SelectionInput> => {
    const m = await db.matter.findUniqueOrThrow({
      where: { id },
      select: { rowVersion: true, clientId: true },
    });
    const h =
      hearingId === null
        ? null
        : await db.hearing.findUniqueOrThrow({
            where: { id: hearingId },
            select: { rowVersion: true },
          });
    const rows = await db.$queryRaw<
      { version: string }[]
    >`SELECT row_version::text version FROM public.client_report_selections WHERE id=${id}`;
    return {
      id,
      client: m.clientId!,
      version: rows[0]?.version ?? '0',
      matterVersion: String(m.rowVersion),
      hearingId,
      hearingVersion: h ? String(h.rowVersion) : null,
      selected,
      submission: randomUUID(),
    };
  };
  const save = (value: unknown, session: Session | null = admin) =>
    saveReportSelection(session, value, {
      database: db,
      auditMetadata: createMaintenanceAuditMetadata(),
    });
  const report = async (id: string, mode = 'all', extra: Record<string, string> = {}) => {
    const def = clientMatterReports.find((d) => d.descriptor.id === id)!;
    const { parameters } = parseReportInput(
      def.descriptor,
      new URLSearchParams({ format: 'preview', client: '245', extra_mode: mode, ...extra }),
    );
    return db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return def.query(tx, parameters);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  };
  const allBefore = await report('client-status');
  assert.equal(allBefore.sections.flatMap((s) => s.groups.flatMap((g) => g.rows)).length, 38);
  assert.equal((await report('client-status', 'selected')).sections.length, 1);
  assert.deepEqual((await report('client-status', 'selected')).sections[0]!.groups, []);
  pass('zero saved choices; comprehensive baseline retains 38');
  const base = await input(3310, 9273),
    before = await state();
  for (const session of [
    null,
    ...sessions.filter((s) => !['Administrator', 'Litigation Assistant'].includes(s.user.role)),
    { ...admin, expires: '2000-01-01T00:00:00Z' },
  ])
    await assert.rejects(() => save(base, session));
  for (const user of [
    { ...admin.user, sessionVersion: admin.user.sessionVersion + 1 },
    { ...admin.user, personId: admin.user.personId + 1 },
    { ...admin.user, role: 'Lawyer' as const },
  ])
    await assert.rejects(() => save(base, { ...admin, user }));
  assert.deepEqual(await state(), before);
  pass(
    'anonymous/read-only roles/expired/revoked/mismatched sessions refuse without rows or audit',
  );
  assert.throws(() => parseSelectionInput({ ...base, extra: 1 }));
  await assert.rejects(() => save({ ...base, client: 239 }));
  await assert.rejects(() => save({ ...base, hearingId: base.hearingId! + 1 }));
  assert.deepEqual(await state(), before);
  pass('strict request shape and client/hearing parent membership');
  const first = await save(base);
  assert.equal(first.changed, true);
  assert.equal(first.version, '1');
  const after = await state();
  assert.deepEqual(after, {
    audit: before.audit + 1,
    current: before.current + 1,
    history: before.history + 1,
    receipts: before.receipts + 1,
  });
  assert.deepEqual(await save(base), first);
  assert.deepEqual(await state(), after);
  await assert.rejects(() => save({ ...base, selected: false }));
  await assert.rejects(() => save(base, assistant));
  await assert.rejects(() => save({ ...base, submission: randomUUID() }));
  assert.deepEqual(await state(), after);
  pass(
    'atomic exact audit/history/receipt; owned retry; altered/cross-user token and stale rejection',
  );
  const noOp = await save(await input(3310, 9273));
  assert.equal(noOp.changed, false);
  assert.deepEqual(await state(), { ...after, receipts: after.receipts + 1 });
  pass('no-op changes only an owned receipt, without version/history/audit manufacture');
  for (const session of sessions)
    assert.equal(
      (await readReportSelection(session, 245, 3310, 1, db)).matters[0]!.hearingId,
      9273,
    );
  const selected = await report('client-status', 'selected'),
    row = selected.sections[0]!.groups[0]!.rows[0]!;
  assert.equal(row.id, 'matter:3310');
  assert.match(JSON.stringify(row), /2026\/07\/30/u);
  assert.doesNotMatch(JSON.stringify(row), /2026\/08\/02/u);
  const court = await db.hearing.findUniqueOrThrow({
    where: { id: 9273 },
    select: { court: { select: { labelAr: true } }, circuit: true, decision: true },
  });
  assert.equal(row.cells[1]!.type, 'text');
  assert.equal(
    'value' in row.cells[1]! ? row.cells[1].value : null,
    [court.court?.labelAr, court.circuit ? `(${court.circuit})` : null].filter(Boolean).join('\n'),
  );
  assert.ok(JSON.stringify(row).includes(JSON.stringify(court.decision!).slice(1, -1)));
  assert.deepEqual(await report('client-status'), allBefore);
  pass(
    '933/2025 uses chosen July30 hearing consistently; newer expert action retained; All active exact',
  );
  const filtered = await report('client-status', 'selected', { from: '2026-08-01' });
  assert.deepEqual(filtered.sections[0]!.groups, []);
  assert.deepEqual(
    filtered.totals.map((x) => ('value' in x.value ? x.value.value : null)),
    ['1', '0', '1'],
  );
  await save(await input(3269, null));
  await assert.rejects(
    () => report('client-status', 'selected', { from: '2026-08-01' }),
    /selection-incomplete/u,
  );
  await save(await input(3269, null, false));
  pass('chosen-date filtering, honest exclusion totals and draft blocked before filtering');
  const request = await input(3310, 470);
  const concurrent = await Promise.allSettled([
    save(request),
    save({ ...request, submission: randomUUID() }, assistant),
  ]);
  assert.equal(concurrent.filter((x) => x.status === 'fulfilled').length, 1);
  pass('concurrent editors: exactly one wins');
  await save(await input(3310, 9273));
  await assert.rejects(
    () =>
      db.$executeRaw`UPDATE public.client_report_selections SET is_selected=false WHERE id=3310`,
  );
  await assert.rejects(
    () =>
      db.$executeRaw`INSERT INTO _migration.client_report_selection_change(matter_id) VALUES(3310)`,
  );
  await assert.rejects(() =>
    db.$transaction(async (tx) => {
      await setHumanAuditContext(tx, Number(admin.user.id), createMaintenanceAuditMetadata());
      await tx.$queryRaw(
        Prisma.sql`SELECT public.client_report_selection_save(${Number(assistant.user.id)}::int,${assistant.user.personId}::int,${assistant.user.sessionVersion}::int,${assistant.user.role}::text,${assistant.expires}::timestamptz,${JSON.stringify(await input(3310, 9273))}::jsonb)`,
      );
    }),
  );
  pass('direct table/history writes and forged actor denied');
  const rollbackInput = await input(3310, 470),
    rollbackBefore = await state();
  await assert.rejects(
    () =>
      db.$transaction(async (tx) => {
        await setHumanAuditContext(tx, Number(admin.user.id), createMaintenanceAuditMetadata());
        await tx.$queryRaw(
          Prisma.sql`SELECT public.client_report_selection_save(${Number(admin.user.id)}::int,${admin.user.personId}::int,${admin.user.sessionVersion}::int,${admin.user.role}::text,${admin.expires}::timestamptz,${JSON.stringify(rollbackInput)}::jsonb)`,
        );
        throw new Error('intentional rollback');
      }),
    /intentional rollback/u,
  );
  assert.deepEqual(await state(), rollbackBefore);
  pass('rollback removes current/history/audit/receipt changes; sequence reservations retained');
  const failures = await inspect(reportSelectionFailures);
  assert.deepEqual(failures, []);
  pass('permanent schema/gateway/privilege/history invariants');
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
