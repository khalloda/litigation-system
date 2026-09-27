import { AuthorizationError } from '../src/lib/auth/authorization-core';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { disableManagedAccount, resetManagedPassword } from '../src/lib/auth/user-management';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import {
  createApprovedMigrationPrismaClient,
  withApprovedMigrationClient,
} from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import {
  readReportSelection,
  saveReportSelection,
  type SelectionInput,
} from '../src/lib/reports/selection';
import { clientMatterReports } from '../src/lib/reports/client-matter-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { readMatterLifecycle, mutateMatterLifecycle } from '../src/lib/matter-lifecycle';
import { readHearingLifecycle, mutateHearingLifecycle } from '../src/lib/hearing-lifecycle';
import { mutateHearing } from '../src/lib/hearing-mutations';

async function main() {
  const url = process.env['MIGRATION_DATABASE_URL']!;
  await withApprovedMigrationClient((c) => assertIsolatedTestCluster(c, new URL(url)), {
    databaseUrl: url,
  });
  const journal = JSON.parse(
    readFileSync(process.env['TASK51_PRIVATE']! + '/family-edge-journal.json', 'utf8'),
  );
  const results: unknown[] = [];
  const pass = (name: string, detail: unknown = {}) => {
    results.push({ name, detail });
    writeFileSync(process.env['TASK51_OUTPUT']! + '/edges.json', JSON.stringify(results, null, 2));
    console.log('PASS ' + name);
  };
  const sessions = await lifecycleSessions(db),
    admin = sessions.find((s) => s.user.role === 'Administrator')!;
  const dependencies = { database: db, auditMetadata: createMaintenanceAuditMetadata() };
  const input = async (
    name: string,
    hearing: string | null,
    selected = true,
  ): Promise<SelectionInput> => {
    const m = await db.matter.findUniqueOrThrow({ where: { id: journal.matters[name] } });
    const h =
      hearing === null
        ? null
        : await db.hearing.findUniqueOrThrow({ where: { id: journal.hearings[hearing] } });
    const s = await db.clientReportSelection.findUnique({ where: { id: m.id } });
    return {
      client: journal.client,
      id: m.id,
      matterVersion: String(m.rowVersion),
      version: String(s?.rowVersion ?? 0),
      hearingId: h?.id ?? null,
      hearingVersion: h ? String(h.rowVersion) : null,
      selected,
      submission: randomUUID(),
    };
  };
  const save = async (name: string, hearing: string | null, selected = true) =>
    saveReportSelection(admin, await input(name, hearing, selected), dependencies);
  const query = async (id = 'client-status', extra: Record<string, string> = {}) => {
    const def = clientMatterReports.find((d) => d.descriptor.id === id)!;
    const { parameters } = parseReportInput(
      def.descriptor,
      new URLSearchParams({
        format: 'preview',
        client: String(journal.client),
        extra_mode: 'selected',
        ...extra,
      }),
    );
    return db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return def.query(tx, parameters);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  };
  const rows = (data: Awaited<ReturnType<typeof query>>) =>
    data.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
  if (!process.argv.includes('--authority-only')) {
    assert.equal(rows(await query()).length, 0);
    await save('no-hearing', null);
    for (const id of ['client-status', 'client-matters'])
      await assert.rejects(() => query(id), /selection-incomplete/u);
    await save('no-hearing', null, false);
    await save('blank', 'blank-jan');
    await save('tie', 'tie-old');
    await save('undated', 'undated');
    const expected = [journal.matters.blank, journal.matters.tie, journal.matters.undated].map(
      (id) => 'matter:' + id,
    );
    assert.deepEqual(
      rows(await query()).map((r) => r.id),
      expected,
    );
    assert.deepEqual(
      rows(await query('client-status', { from: '2026-01-31', to: '2026-01-31' })).map((r) => r.id),
      expected.slice(0, 1),
    );
    assert.equal(
      rows(await query('client-status', { from: '2024-02-29', to: '2024-02-29' }))[0]!.id,
      expected[1],
    );
    assert.equal(rows(await query('client-status', { from: '2024-01-01' })).length, 2);
    assert.ok(JSON.stringify(rows(await query())[1]).includes('equal date older'));
    assert.ok(!JSON.stringify(rows(await query())[1]).includes('equal date latest'));
    assert.equal(rows(await query('client-matters')).length, 3);
    pass(
      'native zero/one/many; explicit older equal-date hearing; undated unbounded only; inclusive date endpoints; null court',
    );
    await save('blank', 'blank-sep');
    assert.ok(JSON.stringify(rows(await query())[0]).includes('2026/09/01'));
    await assert.rejects(() => query('client-matters'), /selection-incomplete/u);
    await save('blank', 'blank-jan');
    await save('closed', 'closed');
    assert.equal(rows(await query()).length, 3);
    assert.equal(rows(await query('client-status', { extra_status: 'all' })).length, 4);
    await assert.rejects(() => query('client-matters'), /selection-incomplete/u);
    await save('closed', 'closed', false);
    await save('null-status', 'null-status');
    assert.equal(rows(await query('client-status', { extra_status: 'all' })).length, 4);
    await assert.rejects(() => query('client-matters'), /selection-incomplete/u);
    await save('null-status', 'null-status', false);
    pass(
      'empty decision and mandatory active qualification preserved; optional status filter exposes exclusions',
    );
    const nullHearing = await mutateHearing(
      admin,
      'create',
      {
        id: null,
        version: null,
        submission: randomUUID(),
        values: { matter_id: journal.matters['no-hearing'], decision: null },
        attendees: [],
      },
      dependencies,
    );
    journal.hearings['null-decision'] = nullHearing.id;
    await save('no-hearing', 'null-decision');
    assert.equal(rows(await query()).length, 4);
    await assert.rejects(() => query('client-matters'), /selection-incomplete/u);
    await save('no-hearing', 'null-decision', false);
    pass('explicit null decision remains valid status data and blocks mandatory-decision variant');
    const old = await input('tie', 'tie-old');
    await assert.rejects(() =>
      saveReportSelection(
        admin,
        { ...old, matterVersion: String(Number(old.matterVersion) + 1) },
        dependencies,
      ),
    );
    await assert.rejects(() =>
      saveReportSelection(
        admin,
        { ...old, hearingVersion: String(Number(old.hearingVersion) + 1) },
        dependencies,
      ),
    );
    const baseline = await query();
    const hearingLife = async (action: 'archive' | 'restore') => {
      const id = journal.hearings['tie-old'];
      const s = await readHearingLifecycle(admin, action, id, db);
      return mutateHearingLifecycle(
        admin,
        action,
        {
          id,
          confirmation: id,
          version: s.version,
          submission: randomUUID(),
          action,
          facts: s.facts,
        },
        dependencies,
      );
    };
    const matterLife = async (action: 'archive' | 'restore') => {
      const id = journal.matters.tie;
      const s = await readMatterLifecycle(admin, action, id, db);
      return mutateMatterLifecycle(
        admin,
        action,
        {
          id,
          confirmation: id,
          version: s.version,
          submission: randomUUID(),
          action,
          counts: s.counts,
        },
        dependencies,
      );
    };
    await hearingLife('archive');
    assert.deepEqual(await query(), baseline);
    await assert.rejects(() => save('tie', 'tie-old'), /archived/u);
    await matterLife('archive');
    assert.deepEqual(await query(), baseline);
    await assert.rejects(() => save('tie', 'tie-new'), /archived/u);
    await matterLife('restore');
    await hearingLife('restore');
    assert.deepEqual(await query(), baseline);
    pass(
      'saved archived hearing/matter remain reportable; both write restrictions and stale row versions enforced',
    );
  }
  const assistant = sessions.find((s) => s.user.role === 'Litigation Assistant')!;
  const old = await input('tie', 'tie-old');
  const migration = await createApprovedMigrationPrismaClient(url);
  try {
    for (const field of ['isEnabled', 'mustChangePassword'] as const) {
      let refused = false;
      await assert.rejects(
        () =>
          migration.$transaction(async (tx) => {
            const proxy = {
              $transaction: async (work: (q: typeof tx) => Promise<unknown>) => work(tx),
            } as unknown as PrismaClient;
            const target = {
              accountId: Number(assistant.user.id),
              expectedSessionVersion: assistant.user.sessionVersion,
            };
            if (field === 'isEnabled')
              await disableManagedAccount(Number(admin.user.id), target, {
                ...dependencies,
                database: proxy,
              });
            else
              await resetManagedPassword(
                Number(admin.user.id),
                { ...target, temporaryPassword: randomUUID() + randomUUID() },
                { ...dependencies, database: proxy },
              );
            const freshVersion = {
              ...assistant,
              user: { ...assistant.user, sessionVersion: assistant.user.sessionVersion + 1 },
            };
            try {
              await saveReportSelection(freshVersion, await input('tie', 'tie-old'), {
                ...dependencies,
                database: proxy,
              });
            } catch (error) {
              assert.ok(error instanceof AuthorizationError);
              refused = true;
            }
            throw new Error('intentional credential rollback');
          }),
        /intentional credential rollback/u,
      );
      assert.equal(refused, true, field);
    }
  } finally {
    await migration.$disconnect();
  }
  const deniedSession = { ...admin, user: { ...admin.user, mustChangePassword: true } };
  let transactionCalls = 0;
  const noQueries = {
    $transaction: () => {
      transactionCalls++;
      throw new Error('must not query');
    },
  } as unknown as PrismaClient;
  await assert.rejects(() =>
    saveReportSelection(deniedSession, old, { ...dependencies, database: noQueries }),
  );
  await assert.rejects(() => readReportSelection(null, journal.client, null, 1, noQueries));
  assert.equal(transactionCalls, 0);
  pass(
    'fresh disabled/password-change database identity denies even stale valid session; early anonymous/password-required service denial runs zero protected transactions',
  );
  writeFileSync(
    process.env['TASK51_OUTPUT']! + '/fixture-identities.json',
    JSON.stringify(journal, null, 2),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
