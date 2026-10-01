import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '../src/generated/prisma/client';
import { db } from '../src/lib/db';
import { setHumanAuditContext } from '../src/lib/audit';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import {
  parseAdministrativeSelectionInput,
  readAdministrativeReportSelection,
  saveAdministrativeReportSelection,
  type AdministrativeSelectionInput,
  type AdministrativeSelectionKind,
} from '../src/lib/reports/administrative-selection';
import { saveReportSelection } from '../src/lib/reports/selection';
import { saveClosedReportSelection } from '../src/lib/reports/closed-selection';
import { saveLawyerReportSelection } from '../src/lib/reports/lawyer-selection';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { administrativeSelectionFailures } from './lib/administrative-selection-checkpoint';
import { lawyerSelectionFailures } from './lib/lawyer-selection-checkpoint';
import { closedSelectionFailures } from './lib/closed-selection-checkpoint';
import { reportSelectionFailures } from './lib/report-selection-checkpoint';

async function main() {
  const url = process.env['MIGRATION_DATABASE_URL'],
    out = process.env['TASK6567_EVIDENCE'];
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
  const path = join(out, 'administrative-selection-proof.json');
  assert.ok(!existsSync(path), 'Establish prior write outcomes before another campaign');
  const events: unknown[] = [],
    requests: unknown[] = [];
  const persist = () => writeFileSync(path, JSON.stringify({ events, requests }, null, 2));
  const pass = (name: string, details: unknown = {}) => {
    events.push({ name, details });
    persist();
    console.log('PASS ' + name);
  };
  const sessions = await lifecycleSessions(db),
    admin = sessions.find((s) => s.user.role === 'Administrator')!,
    assistant = sessions.find((s) => s.user.role === 'Litigation Assistant')!,
    paralegal = sessions.find((s) => s.user.role === 'Paralegal')!;
  assert.equal(sessions.length, 4);
  const meta = () => ({ database: db, auditMetadata: createMaintenanceAuditMetadata() });
  const oldScopes = ['client', 'closed', 'lawyer'] as const;
  const newScopes = ['administrative_hearing', 'administrative_step'] as const;
  const state = () =>
    inspect(async (c) => {
      const tables: Record<string, unknown[]> = {};
      for (const scope of [...oldScopes, ...newScopes])
        for (const name of [
          `public.${scope}_report_selections`,
          `_migration.${scope}_report_selection_submission`,
          `_migration.${scope}_report_selection_change`,
        ])
          tables[name] = (
            await c.query(
              `SELECT to_jsonb(t) value FROM ${name} t ORDER BY to_jsonb(t)::text COLLATE "C"`,
            )
          ).rows;
      return {
        tables,
        audit: (await c.query('SELECT count(*)::int n FROM public.audit_events')).rows[0]
          .n as number,
      };
    });
  const baseline = await state();
  for (const scope of newScopes)
    assert.deepEqual(baseline.tables[`public.${scope}_report_selections`], []);
  const hearings = await db.$queryRaw<{ id: number; parent: number; client: number }[]>(Prisma.sql`
    SELECT h.id,h.matter_id parent,m.client_id client FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id
    WHERE NOT h.is_archived AND NOT m.is_archived AND m.client_id IS NOT NULL
    AND m.id=(SELECT x.matter_id FROM public.hearings x JOIN public.matters y ON y.id=x.matter_id WHERE NOT x.is_archived AND NOT y.is_archived AND y.client_id IS NOT NULL GROUP BY x.matter_id HAVING count(*)>3 ORDER BY x.matter_id LIMIT 1)
    ORDER BY h.id LIMIT 4`);
  const steps = await db.$queryRaw<{ id: number; parent: number; client: number }[]>(Prisma.sql`
    SELECT a.id,a.task_id parent,m.client_id client FROM public.task_actions a JOIN public.admin_tasks w ON w.id=a.task_id JOIN public.matters m ON m.id=w.matter_id
    WHERE NOT a.is_archived AND NOT w.is_archived AND NOT m.is_archived AND m.client_id IS NOT NULL
    AND w.id=(SELECT x.task_id FROM public.task_actions x JOIN public.admin_tasks y ON y.id=x.task_id JOIN public.matters z ON z.id=y.matter_id WHERE NOT x.is_archived AND NOT y.is_archived AND NOT z.is_archived AND z.client_id IS NOT NULL GROUP BY x.task_id HAVING count(*)>2 ORDER BY x.task_id LIMIT 1)
    ORDER BY a.id LIMIT 3`);
  assert.equal(hearings.length, 4);
  assert.equal(steps.length, 3);
  const input = async (
    kind: AdministrativeSelectionKind,
    index = 0,
    selected = true,
    token = randomUUID(),
  ): Promise<AdministrativeSelectionInput> => {
    const row = (kind === 'hearing' ? hearings : steps)[index]!;
    const parent =
      kind === 'hearing'
        ? await db.matter.findUniqueOrThrow({ where: { id: row.parent } })
        : await db.adminTask.findUniqueOrThrow({ where: { id: row.parent } });
    const record =
      kind === 'hearing' ? await db.hearing.findUniqueOrThrow({ where: { id: row.id } }) : null;
    const current =
      kind === 'hearing'
        ? await db.administrativeHearingReportSelection.findUnique({ where: { id: row.id } })
        : await db.administrativeStepReportSelection.findUnique({ where: { id: row.id } });
    return {
      scope: `administrative-${kind}`,
      id: row.id,
      parent: row.parent,
      client: row.client,
      version: String(current?.rowVersion ?? 0),
      parentVersion: String(parent.rowVersion),
      recordVersion: record ? String(record.rowVersion) : null,
      selected,
      submission: token,
    };
  };
  const save = async (value: unknown, session: typeof admin | null = admin) => {
    requests.push({ account: session?.user.id, value });
    persist();
    return saveAdministrativeReportSelection(session, value, meta());
  };
  const original = await input('hearing');
  for (const value of [
    null,
    [],
    {},
    { ...original, extra: true },
    { ...original, scope: 'lawyer' },
    { ...original, id: 0 },
    { ...original, parent: -1 },
    { ...original, client: 2147483648 },
    { ...original, version: '01' },
    { ...original, parentVersion: '0' },
    { ...original, recordVersion: null },
    { ...original, selected: 'true' },
    { ...original, submission: 'not-a-token' },
    { ...(await input('step')), recordVersion: '1' },
  ])
    assert.throws(() => parseAdministrativeSelectionInput(value));
  for (const actor of [
    null,
    ...sessions.filter((s) => !['Administrator', 'Litigation Assistant'].includes(s.user.role)),
    { ...admin, expires: '2000-01-01T00:00:00Z' },
    { ...admin, user: { ...admin.user, sessionVersion: admin.user.sessionVersion + 1 } },
    { ...admin, user: { ...admin.user, personId: admin.user.personId + 1 } },
  ])
    await assert.rejects(() => save(original, actor));
  for (const change of [
    { parent: 2147483647 },
    { client: 2147483647 },
    { parentVersion: String(BigInt(original.parentVersion) + 1n) },
    { recordVersion: String(BigInt(original.recordVersion!) + 1n) },
    { version: '1' },
  ])
    await assert.rejects(() => save({ ...original, ...change }));
  await assert.rejects(
    () =>
      save(
        { ...original, scope: 'administrative-step', recordVersion: original.recordVersion },
        admin,
      ),
    /invalid/u,
  );
  assert.deepEqual(await state(), baseline);
  pass(
    'Strict shape, malformed/cross-parent/stale identities and unauthenticated/unauthorized sessions leave zero effects',
  );
  const result = await save(original);
  assert.deepEqual(result, { id: original.id, version: '1', changed: true });
  const first = await state();
  assert.equal(first.audit, baseline.audit + 1);
  assert.deepEqual(await save(original), result);
  await assert.rejects(() => save(original, assistant));
  await assert.rejects(() => save({ ...original, selected: false }));
  await assert.rejects(() => save({ ...original, submission: randomUUID() }));
  assert.deepEqual(await state(), first);
  pass(
    'Atomic changed save, exact lost-response retry, changed-payload/actor and stale-save refusals',
  );
  await save(await input('hearing', 1), assistant);
  await save(await input('step'), paralegal);
  await save(await input('step', 1), assistant);
  for (const session of sessions) {
    const h = await readAdministrativeReportSelection(
      session,
      'hearing',
      hearings[0]!.client,
      hearings[0]!.parent,
      1,
      db,
    );
    const s = await readAdministrativeReportSelection(
      session,
      'step',
      steps[0]!.client,
      steps[0]!.parent,
      1,
      db,
    );
    assert.equal(h.counts.selected, 2);
    assert.equal(s.counts.selected, 2);
    assert.equal(new Set(h.records.map((r) => r.id)).size, h.records.length);
  }
  for (const kind of ['hearing', 'step'] as const) {
    const before = await state(),
      v = await input(kind),
      r = await save(v, assistant);
    assert.equal(r.changed, false);
    const after = await state();
    assert.equal(after.audit, before.audit);
    assert.deepEqual(await save(v, assistant), r);
    assert.deepEqual(await state(), after);
  }
  pass(
    'Independent multiple hearing/step choices, four-role reads, Paralegal step authority and no-op retries',
  );
  // Direct gateway checks bypass the TypeScript service but retain trusted audit context.
  for (const kind of ['hearing', 'step'] as const) {
    const v = await input(kind),
      fn =
        kind === 'hearing'
          ? Prisma.sql`public.administrative_hearing_report_selection_save`
          : Prisma.sql`public.administrative_step_report_selection_save`;
    for (const actor of sessions.filter((s) =>
      kind === 'hearing'
        ? !['Administrator', 'Litigation Assistant'].includes(s.user.role)
        : s.user.role === 'Lawyer',
    ))
      await assert.rejects(() =>
        db.$transaction(async (tx) => {
          await setHumanAuditContext(tx, Number(actor.user.id), createMaintenanceAuditMetadata());
          return tx.$queryRaw(
            Prisma.sql`SELECT ${fn}(${Number(actor.user.id)}::int,${actor.user.personId}::int,${actor.user.sessionVersion}::int,${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(v)}::jsonb)`,
          );
        }),
      );
    await assert.rejects(() =>
      db.$executeRawUnsafe(
        `UPDATE public.administrative_${kind}_report_selections SET is_selected=false`,
      ),
    );
    await assert.rejects(() =>
      db.$queryRawUnsafe(
        `SELECT * FROM _migration.administrative_${kind}_report_selection_submission`,
      ),
    );
  }
  const a = await input('hearing', 2),
    b = { ...a, submission: randomUUID() };
  requests.push({ sameRecordRace: [a, b] });
  persist();
  const race = await Promise.allSettled([save(a), save(b)]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  pass(
    'Database role/direct-write/private-read refusals and exactly one concurrent expected-version winner',
  );
  const oldInput = async (scope: (typeof oldScopes)[number], token: string) => {
    const m = await db.matter.findUniqueOrThrow({ where: { id: hearings[0]!.parent } });
    const current =
      scope === 'client'
        ? await db.clientReportSelection.findUnique({ where: { id: m.id } })
        : scope === 'closed'
          ? await db.closedReportSelection.findUnique({ where: { id: m.id } })
          : await db.lawyerReportSelection.findUnique({ where: { id: m.id } });
    const h = current?.hearingId
      ? await db.hearing.findUniqueOrThrow({ where: { id: current.hearingId } })
      : null;
    return {
      ...(scope === 'client' ? {} : { scope }),
      id: m.id,
      client: m.clientId!,
      version: String(current?.rowVersion ?? 0),
      matterVersion: String(m.rowVersion),
      hearingId: h?.id ?? null,
      hearingVersion: h ? String(h.rowVersion) : null,
      selected: current?.isSelected ?? false,
      submission: token,
    };
  };
  const invokeOld = async (
    scope: (typeof oldScopes)[number],
    v: Awaited<ReturnType<typeof oldInput>>,
  ) => {
    requests.push({ oldScope: scope, value: v });
    persist();
    return scope === 'client'
      ? saveReportSelection(admin, v, meta())
      : scope === 'closed'
        ? saveClosedReportSelection(admin, v, meta())
        : saveLawyerReportSelection(admin, v, meta());
  };
  for (const scope of oldScopes) {
    const token = randomUUID();
    await save(await input('hearing', 0, true, token));
    const oldInputPrepared = await oldInput(scope, token);
    const before = await state();
    await assert.rejects(() => invokeOld(scope, oldInputPrepared), /submission/u);
    assert.deepEqual(await state(), before);
  }
  // Each old scope claims a no-op token; both new scopes must reject it.
  for (const scope of oldScopes) {
    const token = randomUUID();
    assert.equal((await invokeOld(scope, await oldInput(scope, token))).changed, false);
    const before = await state();
    for (const kind of ['hearing', 'step'] as const) {
      const v = await input(kind, 0, true, token);
      await assert.rejects(() => save(v));
    }
    assert.deepEqual(await state(), before);
  }
  const token = randomUUID(),
    h = await input('hearing', 0, true, token),
    s = await input('step', 0, true, token),
    old = await Promise.all(oldScopes.map((scope) => oldInput(scope, token)));
  requests.push({ fivePurposeRace: [h, s, ...old] });
  persist();
  const purposes = await Promise.allSettled([
    save(h),
    save(s),
    ...oldScopes.map((scope, i) => invokeOld(scope, old[i]!)),
  ]);
  assert.equal(purposes.filter((r) => r.status === 'fulfilled').length, 1);
  pass('Old/new purpose replay refusals and one winner for simultaneous five-purpose token claim');
  const final = await state();
  for (const scope of oldScopes)
    for (const suffix of [
      `public.${scope}_report_selections`,
      `_migration.${scope}_report_selection_change`,
    ])
      assert.deepEqual(final.tables[suffix], baseline.tables[suffix]);
  await inspect(async (c) => {
    for (const check of [
      administrativeSelectionFailures,
      lawyerSelectionFailures,
      closedSelectionFailures,
      reportSelectionFailures,
    ])
      assert.deepEqual(await check(c), []);
  });
  pass('All four selection invariants; accepted current choices/history exact', {
    before: baseline,
    after: final,
    hearings,
    steps,
  });
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Administrative selection proof failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
