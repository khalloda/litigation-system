import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { withIsolatedPostgres } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { clientLogoFixtureState } from './lib/client-logo-fixture-state';
import { initialiseActors } from './test-client-contacts';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { createDatabaseClient } from '../src/lib/db';
import { mutateHearing, readHearingMutation } from '../src/lib/hearing-mutations';
import {
  parseHearingMutationInput,
  parseHearingMutationForm,
} from '../src/lib/hearing-mutation-input';
import { readHearing, readHearings } from '../src/lib/hearing-query';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { hearingEditSql, assertHearingEditBoundary } from './lib/hearing-edit-checkpoint';
import { setHearingParentArchive } from './test-hearing-read-only';
import { proveHearingAdversarial } from './lib/hearing-adversarial-proof';
import {
  hearingMigrationCatalog,
  assertHearingMigrationDelta,
  hearingOriginalProjection,
} from './lib/hearing-migration-delta';
import { proveHearingRetention } from './lib/hearing-retention-proof';
import { proveHearingCanonical } from './lib/hearing-canonical-proof';
async function main() {
  const output = process.env.HEARING_EDIT_EVIDENCE_DIR;
  assert.ok(output && resolve(output) !== process.cwd());
  mkdirSync(output, { recursive: true });
  const source = await withApprovedMigrationClient(
    async (db) => ({
      state: await staffReadOnlyState(db),
      portable: await clientLogoFixtureState(db),
    }),
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  const evidence: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    evidence.push({ name, details });
    writeFileSync(join(output, 'results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS ' + name);
  };
  await withIsolatedPostgres(async (fixture) => {
    const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
      withApprovedMigrationClient(fn, { databaseUrl: fixture.migrationUrl });
    const check = (name: string, script: string, args: string[] = []) => {
      const r = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
        env: fixture.environment,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 32000000,
      });
      writeFileSync(
        join(output, name + '.log'),
        (r.stdout + r.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
      );
      assert.equal(r.status, 0, name);
    };
    writeFileSync(
      join(output, 'isolation.json'),
      JSON.stringify(
        {
          container: fixture.container,
          cluster: fixture.clusterId,
          sourceCluster: fixture.sourceClusterId,
          image: fixture.imageId,
          port: new URL(fixture.runtimeUrl).port,
        },
        null,
        2,
      ),
    );
    await fixture.restoreProject();
    await inspect(async (db) => {
      assert.deepEqual((await staffReadOnlyState(db)).tables, source.state.tables);
      assert.deepEqual(await clientLogoFixtureState(db), source.portable);
    });
    await migrateFixtureThroughCheckpoint(fixture.migrationUrl, 65, fixture.environment);
    const beforeCatalog = await inspect(hearingMigrationCatalog),
      beforeProjection = await inspect(hearingOriginalProjection);
    await inspect(async (db) => {
      const before = await staffReadOnlyState(db);
      await assert.rejects(
        db.query(
          hearingEditSql().replace(
            /COMMIT;\s*$/u,
            () => "DO $$ BEGIN RAISE EXCEPTION 'TEST ONLY late hearing failure'; END $$; COMMIT;",
          ),
        ),
        /TEST ONLY late hearing failure/u,
      );
      await db.query('ROLLBACK');
      assert.deepEqual(await staffReadOnlyState(db), before);
      writeFileSync(join(output, 'before66.json'), JSON.stringify(before, null, 2));
    });
    pass('Full-volume restore equivalence, exact65 checkpoint and late66 failure exact rollback');
    check('deploy66', 'scripts/run-prisma-migration.ts', ['deploy']);
    const migrationDelta = assertHearingMigrationDelta(
      beforeCatalog,
      await inspect(hearingMigrationCatalog),
    );
    assert.deepEqual(await inspect(hearingOriginalProjection), beforeProjection);
    writeFileSync(join(output, 'migration-delta.json'), JSON.stringify(migrationDelta, null, 2));
    pass(
      'Exact named migration66 catalog delta and every original table/sequence projection preserved',
    );
    await inspect(async (db) => {
      await assertHearingEditBoundary(db, 'historical-full-state-upgrade');
      writeFileSync(
        join(output, 'after66.json'),
        JSON.stringify(await staffReadOnlyState(db), null, 2),
      );
    });
    await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
    check('invariants-initial', 'scripts/check-db.ts');
    const runtime = createDatabaseClient(fixture.runtimeUrl);
    try {
      const sessions = await lifecycleSessions(runtime),
        admin = sessions.find((s) => s.user.role === 'Administrator')!,
        assistant = sessions.find((s) => s.user.role === 'Litigation Assistant')!;
      const run = (action: 'create' | 'update', input: unknown, session = admin) =>
        mutateHearing(session, action, input, {
          database: runtime,
          auditMetadata: createMaintenanceAuditMetadata(),
        });
      const draft = () => ({
        id: null,
        version: null,
        submission: randomUUID(),
        values: { matter_id: null, decision: 'TEST ONLY hearing editing' },
      });
      const state = () => inspect(staffReadOnlyState);
      const beforeDenied = await state();
      for (const actor of sessions.filter(
        (s) => !['Administrator', 'Litigation Assistant'].includes(s.user.role),
      )) {
        await assert.rejects(run('create', draft(), actor));
        await assert.rejects(readHearingMutation(actor, 'create', null, runtime));
      }
      for (const values of [
        { matter_id: 0 },
        { matter_id: null, legacy_id: 1 },
        { matter_id: null, notes: 'x'.repeat(10001) },
        { matter_id: null, hearing_date: '2026-02-29' },
        { matter_id: null, hearing_date: '2024-01-01T00:00:00Z' },
        { matter_id: null, notes: {} },
        { matter_id: null, client_notified: true },
      ])
        assert.throws(() => parseHearingMutationInput('create', { ...draft(), values }));
      const form = new FormData();
      form.set('payload', '{"id":null,"id":null}');
      assert.throws(() => parseHearingMutationForm('create', form));
      await assert.rejects(
        runtime.$executeRawUnsafe('UPDATE hearings SET notes=notes WHERE false'),
      );
      await assert.rejects(runtime.$executeRawUnsafe('DELETE FROM hearing_attendees WHERE false'));
      assert.deepEqual((await state()).tables, beforeDenied.tables);
      pass(
        'Denied roles, malformed/protected input and direct runtime writes leave every table unchanged',
      );
      const choices = await readHearingMutation(admin, 'create', null, runtime),
        people = choices.people.filter((p) => p.active);
      assert.ok(people.length > 2);
      const request = {
        ...draft(),
        values: {
          matter_id: null,
          decision: 'TEST ONLY\r\nmultiline\nretained',
          hearing_date: '2024-02-29',
          next_hearing_date: null,
        },
        attendees: [
          { id: null, person_id: people[0]!.id },
          { id: null, person_id: people[1]!.id },
        ],
      };
      const created = await run('create', request);
      assert.equal(created.version, '1');
      const beforeRetry = await state();
      assert.deepEqual(await run('create', request), created);
      assert.deepEqual(await state(), beforeRetry);
      await assert.rejects(
        run('create', { ...request, values: { ...request.values, decision: 'different' } }),
      );
      await assert.rejects(run('create', request, assistant));
      assert.deepEqual(await state(), beforeRetry);
      let current = await readHearingMutation(admin, 'update', created.id, runtime);
      assert.equal(current.record!.values.decision, request.values.decision);
      const noop = {
        id: created.id,
        version: current.record!.version,
        submission: randomUUID(),
        values: { decision: request.values.decision },
        attendees: current.attendees,
      };
      assert.equal((await run('update', noop)).changed, false);
      assert.deepEqual(await state(), beforeRetry);
      pass(
        'Native creation, date-only/multiline retention, exact retry/owner binding and complete-state no-op equality',
      );
      const ids = current.attendees.map((a) => a.id);
      const removed = await run(
        'update',
        { ...noop, submission: randomUUID(), values: {}, attendees: current.attendees.slice(1) },
        assistant,
      );
      const retained = await inspect(
        async (db) =>
          (
            await db.query(
              'SELECT id,ordinal,legacy_name_raw,is_retired FROM hearing_attendees WHERE hearing_id=$1 ORDER BY id',
              [created.id],
            )
          ).rows,
      );
      assert.equal(retained.length, 2);
      assert.equal(retained[0].is_retired, true);
      current = await readHearingMutation(admin, 'update', created.id, runtime);
      assert.equal(current.attendees.length, 1);
      await run('update', {
        id: created.id,
        version: removed.version,
        submission: randomUUID(),
        values: {},
        attendees: [...current.attendees, { id: null, person_id: people[0]!.id }],
      });
      current = await readHearingMutation(admin, 'update', created.id, runtime);
      assert.deepEqual(
        current.attendees.map((a) => a.id),
        [ids[1], ids[0]],
      );
      const duplicate = await inspect(
        async (db) =>
          (
            await db.query(
              'SELECT hearing_id FROM hearing_attendees WHERE legacy_name_raw IS NOT NULL GROUP BY hearing_id,person_id HAVING count(*)>1 ORDER BY hearing_id LIMIT 1',
            )
          ).rows[0].hearing_id,
      );
      const imported = await readHearingMutation(admin, 'update', duplicate, runtime);
      const membershipBefore = await inspect(
        async (db) =>
          (
            await db.query(
              'SELECT to_jsonb(a) v FROM hearing_attendees a WHERE hearing_id=$1 ORDER BY id',
              [duplicate],
            )
          ).rows,
      );
      await run('update', {
        id: duplicate,
        version: imported.record!.version,
        submission: randomUUID(),
        values: { decision: 'TEST ONLY imported edit' },
        attendees: imported.attendees,
      });
      assert.deepEqual(
        await inspect(
          async (db) =>
            (
              await db.query(
                'SELECT to_jsonb(a) v FROM hearing_attendees a WHERE hearing_id=$1 ORDER BY id',
                [duplicate],
              )
            ).rows,
        ),
        membershipBefore,
      );
      pass(
        'Retirement/restoration retain IDs, append restored display order and preserve imported duplicate membership/source rows',
      );
      const d41 = await inspect(
        async (db) =>
          (
            await db.query('SELECT id FROM hearings WHERE legacy_id=ANY($1::int[]) ORDER BY id', [
              [7072, 7071, 7237, 7383, 7451, 7073, 7070, 7219, 7351, 7129, 7159, 7382],
            ])
          ).rows,
      );
      assert.equal(d41.length, 12);
      for (const { id } of d41) {
        const s = await readHearingMutation(admin, 'update', id, runtime);
        assert.equal(s.record!.protected, true);
        await assert.rejects(
          run('update', {
            id,
            version: s.record!.version,
            submission: randomUUID(),
            values: { notes: 'TEST ONLY forbidden' },
          }),
        );
        await run('update', {
          id,
          version: s.record!.version,
          submission: randomUUID(),
          values: { decision: 'TEST ONLY allowed D41 field' },
        });
      }
      pass(
        'All twelve D41 hearings reject protected fields and accept ordinary authorized decision edits',
      );
      const parent = choices.matters.find((m) => m.active)!.id;
      const linked = await run('create', {
        ...draft(),
        values: { matter_id: parent, decision: 'TEST ONLY linked' },
      });
      await setHearingParentArchive(fixture, parent, true);
      await assert.rejects(
        run('update', {
          id: linked.id,
          version: linked.version,
          submission: randomUUID(),
          values: { notes: 'blocked' },
        }),
      );
      await assert.rejects(run('create', { ...draft(), values: { matter_id: parent } }));
      await setHearingParentArchive(fixture, parent, false);
      const raced = await Promise.allSettled(
        [1, 2].map((n) =>
          run('update', {
            id: linked.id,
            version: linked.version,
            submission: randomUUID(),
            values: { decision: 'TEST ONLY race ' + n },
          }),
        ),
      );
      assert.equal(raced.filter((v) => v.status === 'fulfilled').length, 1);
      pass('Archived parent refusal and simultaneous editing commit one exact aggregate version');
      for (const session of sessions) {
        const first = await readHearings(session, {}, runtime);
        assert.equal(first.total, 13384);
        assert.ok(await readHearing(session, String(created.id), runtime));
      }
      await proveHearingAdversarial(fixture, runtime, admin, assistant, created.id, pass);
      await proveHearingRetention(fixture, runtime, sessions, created.id, pass);
      await inspect((db) => assertHearingEditBoundary(db, 'historical-full-state-upgrade'));
      check('invariants-final', 'scripts/check-db.ts');
      await runtime.$disconnect();
      check('permissions', 'scripts/test-permissions.ts', ['--restored-fixture']);
      if (process.argv.includes('--browser')) {
        const { proveHearingBrowser } = await import('./test-hearing-browser.mjs');
        const { hearingEditingBrowserProof } =
          await import('./lib/hearing-editing-browser-proof.mjs');
        await proveHearingBrowser(
          fixture,
          output,
          (
            context: Record<
              | 'page'
              | 'context'
              | 'base'
              | 'accounts'
              | 'login'
              | 'goto'
              | 'audit'
              | 'screenshot'
              | 'evidence'
              | 'inspect'
              | 'runtime',
              unknown
            >,
          ) => hearingEditingBrowserProof({ ...context, createdId: created.id, d41Id: d41[0].id }),
        );
      }
    } finally {
      await runtime.$disconnect();
    }
    if (process.argv.includes('--canonical')) await proveHearingCanonical(fixture, output);
  });
  assert.deepEqual(
    await withApprovedMigrationClient(staffReadOnlyState, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    }),
    source.state,
  );
  pass('Source database exact and owned database/container/volume/network cleaned');
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(files.status, 0);
  writeFileSync(
    join(output, 'executed-source.json'),
    JSON.stringify(
      [...new Set(files.stdout.split('\0').filter(Boolean))].sort().map((path) => ({
        path,
        sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      })),
      null,
      2,
    ),
  );
}
void main().catch((e) => {
  console.error((e.stack ?? e.message).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'));
  process.exitCode = 1;
});
