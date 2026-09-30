import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { setHumanAuditContext } from '../src/lib/audit';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import {
  saveLawyerReportSelection,
  readLawyerReportSelection,
  parseLawyerSelectionInput,
  type LawyerSelectionInput,
} from '../src/lib/reports/lawyer-selection';
import { saveReportSelection, parseSelectionInput } from '../src/lib/reports/selection';
import {
  saveClosedReportSelection,
  parseClosedSelectionInput,
} from '../src/lib/reports/closed-selection';
import { lawyerReports } from '../src/lib/reports/lawyer-matters';
import { clientMatterReports } from '../src/lib/reports/client-matter-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { lawyerSelectionFailures } from './lib/lawyer-selection-checkpoint';
import { reportSelectionFailures } from './lib/report-selection-checkpoint';
import { closedSelectionFailures } from './lib/closed-selection-checkpoint';

async function main() {
  const url = process.env['MIGRATION_DATABASE_URL'],
    out = process.env['TASK64_EVIDENCE'];
  assert.ok(url && out);
  const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(
      async (c) => {
        await assertIsolatedTestCluster(c, new URL(url));
        return work(c);
      },
      { databaseUrl: url },
    );
  await inspect(async () => undefined);
  const path = join(out, 'lawyer-selection-proof.json');
  assert.ok(!existsSync(path), 'Inspect prior test effects before rerun');
  const sessions = await lifecycleSessions(db),
    admin = sessions.find((s) => s.user.role === 'Administrator')!,
    assistant = sessions.find((s) => s.user.role === 'Litigation Assistant')!;
  const meta = () => ({ database: db, auditMetadata: createMaintenanceAuditMetadata() });
  const events: unknown[] = [],
    requests: unknown[] = [];
  const pass = (name: string, detail: unknown = {}) => {
    events.push({ name, detail });
    writeFileSync(path, JSON.stringify({ events, requests }, null, 2));
    console.log('PASS ' + name);
  };
  const states = () =>
    inspect(async (c) => {
      const tables = [
        'public.client_report_selections',
        'public.closed_report_selections',
        'public.lawyer_report_selections',
        '_migration.client_report_selection_change',
        '_migration.closed_report_selection_change',
        '_migration.lawyer_report_selection_change',
        '_migration.client_report_selection_submission',
        '_migration.closed_report_selection_submission',
        '_migration.lawyer_report_selection_submission',
        '_migration.lawyer_report_submission_scope',
      ];
      const values: Record<string, unknown[]> = {};
      for (const table of tables)
        values[table] = (
          await c.query(
            `SELECT to_jsonb(t) value FROM ${table} t ORDER BY to_jsonb(t)::text COLLATE "C"`,
          )
        ).rows;
      return {
        values,
        audit: (await c.query('SELECT count(*)::int n FROM public.audit_events')).rows[0]
          .n as number,
      };
    });
  const baseline = await states();
  assert.deepEqual(baseline.values['public.lawyer_report_selections'], []);
  const matter = await db.matter.findUniqueOrThrow({
    where: { id: 3269 },
    select: { id: true, clientId: true, status: true, isArchived: true, rowVersion: true },
  });
  assert.equal(matter.clientId, 245);
  assert.equal(matter.isArchived, false);
  const hs = await db.hearing.findMany({
    where: { matterId: matter.id, isArchived: false, hearingDate: { not: null } },
    orderBy: [{ hearingDate: 'desc' }, { id: 'desc' }],
    select: { id: true, rowVersion: true, hearingDate: true },
  });
  assert.ok(hs.length > 1);
  const chosen = hs.at(-1)!;
  const input = async (
    hearing: number | null = chosen.id,
    selected = true,
  ): Promise<LawyerSelectionInput> => {
    const m = await db.matter.findUniqueOrThrow({ where: { id: matter.id } }),
      s = await db.lawyerReportSelection.findUnique({ where: { id: matter.id } }),
      h = hearing === null ? null : await db.hearing.findUniqueOrThrow({ where: { id: hearing } });
    return {
      scope: 'lawyer',
      client: 245,
      id: m.id,
      version: String(s?.rowVersion ?? 0),
      matterVersion: String(m.rowVersion),
      hearingId: hearing,
      hearingVersion: h ? String(h.rowVersion) : null,
      selected,
      submission: randomUUID(),
    };
  };
  const save = async (v: unknown, session: typeof admin | null = admin) => {
    requests.push({ session: session?.user.id, input: v });
    writeFileSync(path, JSON.stringify({ events, requests }, null, 2));
    return saveLawyerReportSelection(session, v, meta());
  };
  const report = async (
    id: string,
    mode: string,
    client = 245,
    lawyer = 4,
    from = '0001-01-01',
    to = '9998-12-31',
  ) => {
    const def = [...lawyerReports, ...clientMatterReports].find((x) => x.descriptor.id === id)!;
    const pairs = new URLSearchParams({
      format: 'preview',
      client: String(client),
      extra_mode: mode,
    });
    if (def.descriptor.parameters.lawyer) pairs.set('lawyer', String(lawyer));
    if (def.descriptor.date) {
      pairs.set('from', from);
      pairs.set('to', to);
    }
    return db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return def.query(tx, parseReportInput(def.descriptor, pairs).parameters);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  };
  const clientBaseline = await Promise.all(
    ['client-matters', 'client-status'].flatMap((id) =>
      ['all', 'selected'].map((mode) => report(id, mode)),
    ),
  );
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
  assert.throws(() => parseClosedSelectionInput(original));
  assert.throws(() => parseLawyerSelectionInput({ ...original, scope: 'closed' }));
  const foreign = await db.hearing.findFirstOrThrow({
    where: { matterId: { not: matter.id } },
    select: { id: true, rowVersion: true },
  });
  await assert.rejects(() =>
    save({ ...original, hearingId: foreign.id, hearingVersion: String(foreign.rowVersion) }),
  );
  await assert.rejects(() =>
    save({ ...original, matterVersion: String(BigInt(original.matterVersion) + 1n) }),
  );
  await assert.rejects(() =>
    save({ ...original, hearingVersion: String(BigInt(original.hearingVersion!) + 1n) }),
  );
  assert.deepEqual(await states(), baseline);
  pass(
    'denied sessions, strict purpose, exact parent and matter/hearing versions leave zero effects',
  );
  const result = await save(original);
  assert.deepEqual(result, { id: matter.id, version: '1', changed: true });
  const after = await states();
  assert.equal(after.audit, baseline.audit + 1);
  assert.deepEqual(await save(original), result);
  await assert.rejects(() => save(original, assistant));
  await assert.rejects(() => save({ ...original, selected: false }));
  await assert.rejects(() => save({ ...original, submission: randomUUID() }));
  assert.deepEqual(await states(), after);
  pass('atomic changed save, exact lost-response retry and cross-actor/payload/stale refusals', {
    matter: matter.id,
    chosen: chosen.id,
    latest: hs[0]!.id,
  });
  for (const session of sessions)
    assert.equal(
      (await readLawyerReportSelection(session, 245, matter.id, 1, db)).matters[0]!.hearingId,
      chosen.id,
    );
  const exact = await report('lawyer-principal-matters', 'selected');
  assert.deepEqual(
    exact.sections.flatMap((s) => s.groups.flatMap((g) => g.rows.map((r) => r.id))),
    [`matter:${matter.id}`],
  );
  assert.deepEqual(exact.sections[0]!.groups[0]!.rows[0]!.cells[5], {
    type: 'date',
    value: chosen.hearingDate!.toISOString().slice(0, 10),
  });
  const beforeNoop = await states(),
    noopInput = await input(),
    noop = await save(noopInput, assistant);
  assert.equal(noop.changed, false);
  const afterNoop = await states();
  assert.equal(afterNoop.audit, beforeNoop.audit);
  assert.equal(
    afterNoop.values['_migration.lawyer_report_selection_submission']!.length,
    beforeNoop.values['_migration.lawyer_report_selection_submission']!.length + 1,
  );
  assert.deepEqual(await save(noopInput, assistant), noop);
  assert.deepEqual(await states(), afterNoop);
  pass('four-role reads, deliberately older hearing and assistant no-op/exact retry');
  await save(await input(null));
  await assert.rejects(
    () => report('lawyer-principal-matters', 'selected'),
    /selection-incomplete/,
  );
  // A missing hearing does not invalidate the other date grain or another client.
  await report('lawyer-new-matters', 'selected');
  await report('lawyer-principal-matters', 'selected', 239);
  await save(await input(chosen.id));
  const day = hs[0]!.hearingDate!.toISOString().slice(0, 10);
  if (day !== chosen.hearingDate!.toISOString().slice(0, 10))
    assert.equal(
      (await report('lawyer-current-position', 'selected', 245, 4, day, day)).sections[0]!.groups
        .length,
      0,
    );
  await save(await input(null, false));
  assert.equal(
    (await report('lawyer-principal-matters', 'selected')).sections[0]!.groups.length,
    0,
  );
  pass(
    'missing hearing blocks only relevant position scope; distribution allows none; chosen period excludes without substitution; clear stays empty',
  );
  // Reusing one token across purposes must fail in every direction. Old-purpose
  // requests are genuine no-ops so their current rows and histories remain exact.
  const buildScope = async (scope: 'client' | 'closed' | 'lawyer', token: string) => {
    const req = await input(null, false),
      s =
        scope === 'client'
          ? await db.clientReportSelection.findUnique({ where: { id: matter.id } })
          : scope === 'closed'
            ? await db.closedReportSelection.findUnique({ where: { id: matter.id } })
            : await db.lawyerReportSelection.findUnique({ where: { id: matter.id } });
    const h = s?.hearingId
      ? await db.hearing.findUniqueOrThrow({ where: { id: s.hearingId } })
      : null;
    const { scope: discard, ...base } = req;
    assert.equal(discard, 'lawyer');
    return {
      ...base,
      ...(scope === 'client' ? {} : { scope }),
      submission: token,
      version: String(s?.rowVersion ?? 0),
      selected: s?.isSelected ?? false,
      hearingId: h?.id ?? null,
      hearingVersion: h ? String(h.rowVersion) : null,
    };
  };
  const invoke = (scope: string, value: unknown) =>
    scope === 'client'
      ? saveReportSelection(admin, value, meta())
      : scope === 'closed'
        ? saveClosedReportSelection(admin, value, meta())
        : saveLawyerReportSelection(admin, value, meta());
  const scopes = ['client', 'closed', 'lawyer'] as const;
  for (const first of scopes)
    for (const second of scopes)
      if (first !== second) {
        const token = randomUUID(),
          a = await buildScope(first, token),
          b = await buildScope(second, token);
        requests.push({ first, second, a, b });
        pass('cross-purpose requests prepared', { first, second, token });
        const firstResult = await invoke(first, a);
        assert.equal(firstResult.changed, false);
        const committed = await states();
        await assert.rejects(() => invoke(second, b));
        assert.deepEqual(await states(), committed);
      }
  const token = randomUUID(),
    concurrent = await Promise.all(scopes.map((s) => buildScope(s, token)));
  requests.push({ concurrent });
  pass('concurrent three-purpose requests prepared', { token });
  const race = await Promise.allSettled(scopes.map((s, i) => invoke(s, concurrent[i]!)));
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  pass(
    'all six cross-purpose directions and simultaneous three-purpose token claim reject replay',
    { winner: scopes[race.findIndex((r) => r.status === 'fulfilled')] },
  );
  const a = await input(chosen.id, true),
    b = {
      ...a,
      hearingId: hs[0]!.id,
      hearingVersion: String(hs[0]!.rowVersion),
      submission: randomUUID(),
    };
  requests.push({ staleRace: [a, b] });
  pass('concurrent same-matter requests prepared');
  const stale = await Promise.allSettled([save(a), save(b)]);
  assert.equal(stale.filter((r) => r.status === 'fulfilled').length, 1);
  await save(await input(null, false));
  await assert.rejects(
    () =>
      db.$executeRaw`UPDATE public.lawyer_report_selections SET is_selected=true WHERE id=${matter.id}`,
  );
  for (const session of sessions.filter(
    (s) => !['Administrator', 'Litigation Assistant'].includes(s.user.role),
  ))
    await assert.rejects(() =>
      db.$transaction(async (tx) => {
        await setHumanAuditContext(tx, Number(session.user.id), createMaintenanceAuditMetadata());
        return tx.$queryRaw`SELECT public.lawyer_report_selection_save(${Number(session.user.id)}::int,${session.user.personId}::int,${session.user.sessionVersion}::int,${session.user.role}::text,${session.expires}::timestamptz,${JSON.stringify(await input())}::jsonb)`;
      }),
    );
  const final = await states();
  for (const key of [
    'public.client_report_selections',
    'public.closed_report_selections',
    '_migration.client_report_selection_change',
    '_migration.closed_report_selection_change',
  ])
    assert.deepEqual(final.values[key], baseline.values[key]);
  for (const scope of ['client', 'closed'])
    for (const old of baseline.values[`_migration.${scope}_report_selection_submission`]!)
      assert.ok(
        final.values[`_migration.${scope}_report_selection_submission`]!.some(
          (r) => JSON.stringify(r) === JSON.stringify(old),
        ),
      );
  assert.deepEqual(
    await Promise.all(
      ['client-matters', 'client-status'].flatMap((id) =>
        ['all', 'selected'].map((mode) => report(id, mode)),
      ),
    ),
    clientBaseline,
  );
  await inspect(async (c) => {
    for (const check of [lawyerSelectionFailures, closedSelectionFailures, reportSelectionFailures])
      assert.deepEqual(await check(c), []);
  });
  pass(
    'same-matter serializable conflict; direct runtime/role refusals; all three invariants; client245 exact accepted choices and outputs',
    { before: baseline, after: final },
  );
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : 'failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
