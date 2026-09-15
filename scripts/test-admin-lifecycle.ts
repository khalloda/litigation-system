import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { adminEditState } from './lib/admin-edit-state';
import { createDatabaseClient } from '../src/lib/db';
import { prepareHearingLifecycleActors } from './lib/hearing-lifecycle-actors';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { mutateAdminWork, readAdminMutation } from '../src/lib/admin-work-mutations';
import { assertAdminLifecycleBoundary, adminLifecycleSql } from './lib/admin-lifecycle-checkpoint';
import { adminLifecycleOldProjection } from './lib/admin-lifecycle-upgrade';
import { matterMigrationCatalog } from './lib/matter-migration-delta';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { proveAdminLifecycle } from './lib/admin-lifecycle-proof';
import { proveAdminEditing } from './lib/admin-edit-proof';
import { proveAdminAdversarial } from './lib/admin-edit-adversarial';
import { proveAdminIdSearch } from './lib/admin-work-id-search-proof';
import { readAdminLifecycle, mutateAdminLifecycle } from '../src/lib/admin-lifecycle';

async function main() {
  const output = process.env.ADMIN_LIFECYCLE_EVIDENCE_DIR;
  assert.ok(output);
  mkdirSync(output, { recursive: true });
  const evidence = (name: string, value: unknown) =>
    writeFileSync(join(output, name + '.json'), JSON.stringify(value, null, 2));
  const list = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(list.status, 0);
  const source = [...new Set(list.stdout.split('\0').filter(Boolean))].sort();
  const manifest = () =>
    source.map((path) => ({
      path,
      bytes: readFileSync(path).length,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    }));
  const executed = manifest();
  evidence('executed-source', executed);
  for (const path of source.filter((p) => /^(src|scripts|prisma)\//u.test(p))) {
    const to = join(output, 'executed', path + '.txt');
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(path, to);
  }
  const readOwner = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(work, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    });
  const ownerBefore = await readOwner(adminEditState);
  evidence('owner-before', ownerBefore);
  try {
    await withIsolatedPostgres(async (initialFixture) => {
      let fixture = initialFixture;
      const canonical = process.argv.includes('--canonical'),
        edited = process.argv.includes('--edited');
      if (canonical) {
        const migrationUrl = await fixture.createDatabase('litigation_task44_canonical_prestate'),
          url = new URL(fixture.runtimeUrl);
        url.pathname = new URL(migrationUrl).pathname;
        fixture = {
          ...fixture,
          migrationUrl,
          runtimeUrl: url.toString(),
          environment: {
            ...fixture.environment,
            MIGRATION_DATABASE_URL: migrationUrl,
            DATABASE_URL: url.toString(),
          },
        };
        await migrateFixtureThroughCheckpoint(migrationUrl, 68, fixture.environment);
      } else
        await readOwner(async (db) => {
          await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          try {
            await fixture.restoreProject(
              (await db.query('SELECT pg_export_snapshot() id')).rows[0].id,
            );
          } finally {
            await db.query('ROLLBACK');
          }
        });
      evidence('isolation', {
        at: new Date().toISOString(),
        container: fixture.container,
        cluster: fixture.clusterId,
        sourceCluster: fixture.sourceClusterId,
        image: fixture.imageId,
        port: new URL(fixture.runtimeUrl).port,
        database: new URL(fixture.runtimeUrl).pathname,
        canonical,
        edited,
      });
      const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
        withApprovedMigrationClient(
          async (db) => {
            await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
            return work(db);
          },
          { databaseUrl: fixture.migrationUrl },
        );
      const state = () => inspect(adminEditState),
        initial = await state();
      if (!canonical) {
        assert.deepEqual(initial.tables, ownerBefore.tables);
        const portable = (s: typeof initial.sequences) =>
          s.map(({ schemaname, sequencename, last_value, is_called }) => ({
            schemaname,
            sequencename,
            last_value,
            is_called,
          }));
        assert.deepEqual(portable(initial.sequences), portable(ownerBefore.sequences));
      }
      evidence('restore-equivalence', {
        coherentSnapshot: !canonical,
        allTableContents: !canonical,
        tables: initial.tables.length,
        sequences: initial.sequences.length,
        portableSequenceValues: !canonical,
        logCnt:
          'Portable dump restore resets WAL reservations; all following no-op/rollback comparisons include log_cnt.',
      });
      const run = (name: string, script: string, args: string[], readOnly = false) => {
        const r = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', script, ...args], {
          env: {
            ...fixture.environment,
            ...(readOnly ? { PGOPTIONS: '-c default_transaction_read_only=on' } : {}),
          },
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 32e6,
        });
        writeFileSync(
          join(output, name + '.log'),
          (r.stdout + r.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
        );
        assert.equal(r.status, 0, name);
        console.log('PASS ' + name);
      };
      const profile = canonical
        ? '--profile=canonical-clean-replay'
        : '--profile=historical-full-state-upgrade';
      const runtime = createDatabaseClient(fixture.runtimeUrl);
      try {
        if (canonical) await prepareHearingLifecycleActors(fixture, runtime, true);
        const setup = spawnSync(
          'docker',
          [
            'exec',
            '-i',
            '-e',
            'PGOPTIONS=-c default_transaction_read_only=on',
            fixture.container,
            'psql',
            '-X',
            '-v',
            'ON_ERROR_STOP=1',
            '-U',
            'litigation',
            '-d',
            new URL(fixture.migrationUrl).pathname.slice(1),
          ],
          {
            input: readFileSync('docker/postgres/verify.sql'),
            encoding: 'utf8',
            windowsHide: true,
          },
        );
        writeFileSync(join(output, 'setup68.log'), setup.stdout + setup.stderr);
        assert.equal(setup.status, 0);
        assert.equal((setup.stdout.match(/PASS/gu) ?? []).length, 15);
        assert.ok(!setup.stdout.includes('FAIL'));
        run('invariants68', 'scripts/check-db.ts', [profile], true);
        let retry: Parameters<typeof mutateAdminWork>[2] | undefined,
          retryResult: Awaited<ReturnType<typeof mutateAdminWork>> | undefined;
        const priorReceipts: {
          input: Parameters<typeof mutateAdminWork>[2];
          operation: Parameters<typeof mutateAdminWork>[1];
          result: Awaited<ReturnType<typeof mutateAdminWork>>;
        }[] = [];
        if (edited) {
          await prepareHearingLifecycleActors(fixture, runtime);
          const admin = (await lifecycleSessions(runtime)).find(
            (s) => s.user.role === 'Administrator',
          )!;
          const save68 = async (
            operation: Parameters<typeof mutateAdminWork>[1],
            input: Parameters<typeof mutateAdminWork>[2],
          ) => {
            const result = await mutateAdminWork(admin, operation, input, {
              database: runtime,
              auditMetadata: createMaintenanceAuditMetadata(),
            });
            priorReceipts.push({ operation, input, result });
            return result;
          };
          retry = {
            operation: 'task-create',
            task_id: null,
            step_id: null,
            version: null,
            submission: randomUUID(),
            values: {
              required_work: 'TEST ONLY genuine native68 retained receipt',
              matter_id: null,
              task_created_date: null,
            },
          };
          retryResult = await save68('task-create', retry);
          await save68('step-create', {
            operation: 'step-create',
            task_id: retryResult.id,
            step_id: null,
            version: retryResult.version,
            submission: randomUUID(),
            values: { result: 'TEST ONLY genuine step68' },
          });
          const importedId = await inspect(async (db) => {
            const rows = (
              await db.query(
                'SELECT a.id FROM admin_tasks a LEFT JOIN matters m ON m.id=a.matter_id WHERE a.legacy_id IS NOT NULL AND NOT coalesce(m.is_archived,false) ORDER BY a.id LIMIT 1',
              )
            ).rows;
            assert.equal(rows.length, 1, 'One imported work with an eligible parent is required');
            return rows[0].id;
          });
          const snap = await readAdminMutation(admin, 'task-update', importedId, null, runtime);
          await save68('task-update', {
            operation: 'task-update',
            task_id: importedId,
            step_id: null,
            version: snap.task!.version,
            submission: randomUUID(),
            values: { result: 'TEST ONLY genuine edited68 aggregate' },
          });
        }
        const before = await inspect(adminLifecycleOldProjection),
          catalog = await inspect(matterMigrationCatalog),
          pre = await state();
        await inspect(async (db) => {
          try {
            await assert.rejects(
              db.query(
                adminLifecycleSql().replace(
                  /COMMIT;\s*$/u,
                  () => "DO $$ BEGIN RAISE EXCEPTION 'TEST ONLY late69 failure'; END $$; COMMIT;",
                ),
              ),
              /TEST ONLY late69 failure/u,
            );
          } finally {
            await db.query('ROLLBACK');
          }
        });
        assert.deepEqual(await state(), pre);
        assert.deepEqual(await inspect(matterMigrationCatalog), catalog);
        evidence('late-rollback', { allRows: true, completeSequences: true, catalog: true });
        run('deploy69', 'scripts/run-prisma-migration.ts', ['deploy']);
        assert.deepEqual(await inspect(adminLifecycleOldProjection), before);
        const after = await inspect(matterMigrationCatalog);
        assert.deepEqual(after.sequences, catalog.sequences);
        const delta: Record<string, unknown> = {};
        for (const kind of Object.keys(catalog)) {
          const old = new Map(catalog[kind]!.map((r) => [r.identity, r])),
            now = new Map(after[kind]!.map((r) => [r.identity, r]));
          const added = after[kind]!.filter((r) => !old.has(r.identity)),
            removed = catalog[kind]!.filter((r) => !now.has(r.identity)),
            changed = after[kind]!.filter(
              (r) =>
                old.has(r.identity) && JSON.stringify(r) !== JSON.stringify(old.get(r.identity)),
            );
          assert.deepEqual(removed, []);
          for (const r of added)
            assert.ok(
              /^(_migration|public)\.admin_lifecycle_/u.test(String(r.identity)) ||
                [
                  'public.admin_tasks.is_archived',
                  'public.task_actions.is_archived',
                  'public.admin_tasks_archive_date_id_idx',
                  'public.task_actions_archive_order_idx',
                  'public.admin_tasks.zy_admin_lifecycle_guard',
                  'public.task_actions.zy_admin_lifecycle_guard',
                ].includes(String(r.identity)),
              String(r.identity),
            );
          for (const r of changed)
            assert.ok(
              kind === 'functions' &&
                /^(public|_migration)\.admin_edit_(current_valid|guard|state|save)\(/u.test(
                  String(r.identity),
                ),
              String(r.identity),
            );
          delta[kind] = {
            added,
            removed,
            changed: changed.map((r) => ({ before: old.get(r.identity), after: r })),
          };
        }
        evidence('migration-delta', delta);
        assert.equal(
          await inspect(
            async (db) =>
              (
                await db.query(
                  'SELECT (SELECT count(*) FROM admin_tasks WHERE is_archived)+(SELECT count(*) FROM task_actions WHERE is_archived) count',
                )
              ).rows[0].count,
          ),
          '0',
        );
        await inspect(assertAdminLifecycleBoundary);
        run('invariants69', 'scripts/check-db.ts', [profile], true);
        evidence('upgrade', {
          oldTablesExact: before.length,
          completeSequencesExact: catalog.sequences!.length,
          allArchiveFlagsFalse: true,
          editedNative68: edited,
        });
        if (edited) {
          const admin = (await lifecycleSessions(runtime)).find(
              (s) => s.user.role === 'Administrator',
            )!,
            beforeRetry = await state();
          for (const receipt of priorReceipts)
            assert.deepEqual(
              await mutateAdminWork(admin, receipt.operation, receipt.input, {
                database: runtime,
                auditMetadata: createMaintenanceAuditMetadata(),
              }),
              receipt.result,
            );
          assert.deepEqual(await state(), beforeRetry);
          evidence('old68-receipt-retry', {
            exact: true,
            fullStateUnchanged: true,
            operations: priorReceipts.map((r) => r.operation),
          });
          assert.ok(retryResult);
          const nativeStep = priorReceipts.find((r) => r.operation === 'step-create')!.result
            .stepId!;
          const initialVersion = BigInt(
            (await readAdminLifecycle(admin, 'task-archive', retryResult.id, null, runtime))
              .version,
          );
          for (const operation of [
            'step-archive',
            'task-archive',
            'task-restore',
            'step-restore',
          ] as const) {
            const stepId = operation.startsWith('step') ? nativeStep : null;
            const snapshot = await readAdminLifecycle(
              admin,
              operation,
              retryResult.id,
              stepId,
              runtime,
            );
            await mutateAdminLifecycle(
              admin,
              operation,
              {
                task_id: retryResult.id,
                step_id: stepId,
                operation,
                version: snapshot.version,
                submission: randomUUID(),
                confirmation: stepId ?? retryResult.id,
                facts: snapshot.facts,
              },
              { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
            );
          }
          const continued = await readAdminLifecycle(
            admin,
            'step-restore',
            retryResult.id,
            nativeStep,
            runtime,
          );
          assert.equal(BigInt(continued.version), initialVersion + 4n);
          assert.equal(continued.archived, false);
          assert.equal(continued.facts.taskArchived, false);
          const afterContinuation = await state();
          for (const receipt of priorReceipts)
            assert.deepEqual(
              await mutateAdminWork(admin, receipt.operation, receipt.input, {
                database: runtime,
                auditMetadata: createMaintenanceAuditMetadata(),
              }),
              receipt.result,
            );
          assert.deepEqual(await state(), afterContinuation);
          await inspect(assertAdminLifecycleBoundary);
          evidence('old68-lifecycle-continuation', {
            changedTransitions: 4,
            versionAdvance: 4,
            workAndStepRestored: true,
            oldReceiptsStillExact: true,
            receiptReplayFullStateUnchanged: true,
          });
        }
        if (!canonical && !edited && !process.argv.includes('--migration-only')) {
          await prepareHearingLifecycleActors(fixture, runtime);
          if (!process.argv.includes('--lifecycle-only')) {
            await proveAdminIdSearch(runtime, inspect, output, false);
            const d62 = await proveAdminEditing(fixture, runtime, output);
            const adversarial: unknown[] = [];
            await proveAdminAdversarial(fixture, runtime, d62.createdId, (name, details) => {
              adversarial.push({ name, details });
              evidence('d62-adversarial', adversarial);
            });
          } else
            evidence('scope', {
              lifecycleOnly: true,
              unchangedIdEditingAdversarialEvidence:
                'full-attempt7; exact source dependency binding required in final review ledger',
            });
          const subjects = await proveAdminLifecycle(fixture, runtime, output);
          evidence('subjects', subjects);
          if (process.argv.includes('--browser')) {
            const { proveAdminLifecycleBrowser } =
              await import('./test-admin-lifecycle-browser.mjs');
            await proveAdminLifecycleBrowser(fixture, output, subjects);
          }
          run('invariants-final', 'scripts/check-db.ts', [profile], true);
        }
        if (edited && process.argv.includes('--browser')) {
          assert.ok(retryResult);
          const subject = await inspect(
            async (db) =>
              (
                await db.query(
                  'SELECT a.id,(SELECT s.id FROM task_actions s WHERE s.task_id=a.id ORDER BY s.source_ordinal NULLS LAST,s.id LIMIT 1) step FROM admin_tasks a JOIN task_actions t ON t.task_id=a.id LEFT JOIN matters m ON m.id=a.matter_id WHERE a.legacy_id IS NOT NULL AND NOT coalesce(m.is_archived,false) GROUP BY a.id ORDER BY count(*) DESC,a.id LIMIT 1',
                )
              ).rows[0],
          );
          const subjects = process.argv.includes('--lifecycle-proof')
            ? await proveAdminLifecycle(fixture, runtime, output)
            : { ...subject, nativeId: retryResult.id };
          evidence('subjects', subjects);
          const { proveAdminLifecycleBrowser } = await import('./test-admin-lifecycle-browser.mjs');
          await proveAdminLifecycleBrowser(fixture, output, subjects);
          run('invariants-final', 'scripts/check-db.ts', [profile], true);
        }
        run('permissions', 'scripts/test-permissions.ts', ['--static-only']);
      } finally {
        await runtime.$disconnect();
      }
    });
  } finally {
    const ownerAfter = await readOwner(adminEditState);
    evidence('owner-after', ownerAfter);
    assert.deepEqual(ownerAfter, ownerBefore);
  }
  evidence('executed-source-after', manifest());
  assert.deepEqual(manifest(), executed, 'Executed source must stay frozen throughout this run');
  evidence('cleanup', {
    ownedFixtureRemoved: true,
    ownerUnchanged: true,
    ownerCheckpoint: 68,
    acceptedAppActivated: false,
  });
}
void main().catch((error) => {
  console.error(
    (error.stack ?? String(error)).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
  );
  process.exitCode = 1;
});
