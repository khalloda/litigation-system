import 'dotenv/config';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { adminEditState } from './lib/admin-edit-state';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { adminEditSql, assertAdminEditBoundary } from './lib/admin-edit-checkpoint';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { createDatabaseClient } from '../src/lib/db';
import { proveAdminEditing } from './lib/admin-edit-proof';
import { prepareHearingLifecycleActors } from './lib/hearing-lifecycle-actors';
import { proveAdminIdSearch } from './lib/admin-work-id-search-proof';
import { proveAdminAdversarial } from './lib/admin-edit-adversarial';

async function main() {
  const output = process.env.ADMIN_EDIT_EVIDENCE_DIR;
  assert.ok(output);
  mkdirSync(output, { recursive: true });
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(files.status, 0);
  const binding = () =>
    [...new Set(files.stdout.trim().split(/\r?\n/u))].sort().map((path) => ({
      path,
      bytes: readFileSync(path).length,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    }));
  const sourceBefore = binding();
  writeFileSync(join(output, 'executed-source.json'), JSON.stringify(sourceBefore, null, 2));
  const browserOnly = process.argv.includes('--browser-only');
  if (browserOnly) {
    const prior = process.env.ADMIN_EDIT_REUSE_EVIDENCE_DIR;
    assert.ok(prior, 'Prior completed backend evidence directory required');
    const old = JSON.parse(
      readFileSync(join(prior, 'executed-source.json'), 'utf8'),
    ) as typeof sourceBefore;
    const editorPath = 'src/app/admin-works/admin-editor.tsx';
    const priorEditor = readFileSync(editorPath, 'utf8').replace(
      "{operation === 'task-create' ? <p>{t.adminWorks.manage.dateHint}</p> : null}",
      '<p>{t.adminWorks.manage.dateHint}</p>',
    );
    assert.equal(
      createHash('sha256').update(priorEditor).digest('hex'),
      old.find((f) => f.path === editorPath)?.sha256,
      'Only the task-create date instruction visibility changed in the editor',
    );
    const critical = old.filter(
      (f) =>
        /^(src\/|prisma\/|scripts\/lib\/|scripts\/check-db\.ts$)/u.test(f.path) &&
        f.path !== 'src/app/admin-works/admin-editor.module.css' &&
        f.path !== editorPath,
    );
    for (const f of critical)
      assert.deepEqual(
        sourceBefore.find((n) => n.path === f.path),
        f,
        'Exact-source backend reuse: ' + f.path,
      );
    for (const name of ['invariants67', 'invariants68'])
      assert.match(readFileSync(join(prior, name + '.log'), 'utf8'), /All \d+ checks passed/u);
    const adversarial = JSON.parse(
      readFileSync(join(prior, 'adversarial-results.json'), 'utf8'),
    ) as { name: string }[];
    assert.equal(adversarial.length, 12);
    assert.ok(adversarial.at(-1)!.name.startsWith('Immutable source/parent/ordinal'));
    writeFileSync(
      join(output, 'reused-backend-binding.json'),
      JSON.stringify(
        {
          prior,
          criticalFiles: critical,
          excludedChangedCss: 'src/app/admin-works/admin-editor.module.css',
          separatelyVerifiedEditorChange: editorPath,
          evidence: [
            'invariants67.log',
            'invariants68.log',
            'mutation-results.json',
            'adversarial-results.json',
            'green-results.json',
            'id-candidates.json',
          ].map((path) => ({
            path,
            sha256: createHash('sha256')
              .update(readFileSync(join(prior, path)))
              .digest('hex'),
          })),
          reason:
            'Only checkbox target CSS and task-create hint visibility changed after the complete backend proof; the editor change is independently reconstructed and hashed above. New browser runtime, final invariants and permissions follow.',
        },
        null,
        2,
      ),
    );
  }
  await withApprovedMigrationClient(
    async (db) => {
      const before = join(output, 'actual-before.json'),
        state = await adminEditState(db);
      if (browserOnly)
        assert.deepEqual(
          state,
          JSON.parse(
            readFileSync(
              join(process.env.ADMIN_EDIT_REUSE_EVIDENCE_DIR!, 'actual-before.json'),
              'utf8',
            ),
          ).state,
          'Exact original data state for baseline reuse',
        );
      if (existsSync(before))
        assert.deepEqual(state, JSON.parse(readFileSync(before, 'utf8')).state);
      else writeFileSync(before, JSON.stringify({ at: new Date().toISOString(), state }, null, 2));
      const profile = (
        await db.query(`SELECT 'admin_tasks' entity,count(*)::int rows,
      max(length(required_work)) required_work,max(length(result)) result,max(length(previous_decision)) previous_decision,
      max(length(last_followup)) last_followup,max(length(circuit)) circuit,max(length(status)) status,max(length(alert)) alert FROM admin_tasks`)
      ).rows;
      const steps = (
        await db.query(
          `SELECT count(*)::int rows,max(length(result)) result,max(length(report)) report,count(*) FILTER(WHERE task_id IS NULL)::int detached FROM task_actions`,
        )
      ).rows;
      writeFileSync(
        join(output, 'source-profile.json'),
        JSON.stringify({ profile, steps }, null, 2),
      );
      console.log(JSON.stringify({ profile, steps }));
    },
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  if (!process.argv.includes('--preflight'))
    await withIsolatedPostgres(async (fixture) => {
      const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
        withApprovedMigrationClient(work, { databaseUrl: fixture.migrationUrl });
      writeFileSync(
        join(output, 'isolation.json'),
        JSON.stringify(
          {
            at: new Date().toISOString(),
            container: fixture.container,
            cluster: fixture.clusterId,
            sourceCluster: fixture.sourceClusterId,
            port: new URL(fixture.runtimeUrl).port,
            image: fixture.imageId,
          },
          null,
          2,
        ),
      );
      await withApprovedMigrationClient(
        async (db) => {
          await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          try {
            await fixture.restoreProject(
              (await db.query('SELECT pg_export_snapshot() id')).rows[0].id,
            );
          } finally {
            await db.query('ROLLBACK');
          }
        },
        { clientConfig: { options: '-c default_transaction_read_only=on' } },
      );
      await inspect(async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        assert.deepEqual(
          (await staffReadOnlyState(db)).tables,
          JSON.parse(readFileSync(join(output, 'actual-before.json'), 'utf8')).state.tables,
        );
      });
      const run = (name: string, script: string, args: string[] = []) => {
        const r = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', script, ...args], {
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
        console.log('PASS ' + name);
      };
      if (!browserOnly)
        run('invariants67', 'scripts/check-db.ts', ['--profile=historical-full-state-upgrade']);
      if (!browserOnly)
        await inspect(async (db) => {
          const before = await adminEditState(db);
          await assert.rejects(
            db.query(
              adminEditSql().replace(
                /COMMIT;\s*$/u,
                () => "DO $$ BEGIN RAISE EXCEPTION 'TEST ONLY late admin failure'; END $$; COMMIT;",
              ),
            ),
            /TEST ONLY late admin failure/u,
          );
          await db.query('ROLLBACK');
          assert.deepEqual(await adminEditState(db), before);
        });
      if (!browserOnly) console.log('PASS late migration rollback');
      run('deploy68', 'scripts/run-prisma-migration.ts', ['deploy']);
      await inspect((db) => assertAdminEditBoundary(db, 'historical-full-state-upgrade'));
      if (!browserOnly)
        run('invariants68', 'scripts/check-db.ts', ['--profile=historical-full-state-upgrade']);
      const runtime = createDatabaseClient(fixture.runtimeUrl);
      try {
        await prepareHearingLifecycleActors(fixture, runtime);
        if (!browserOnly) await proveAdminIdSearch(runtime, inspect, output, false);
        const subjects = browserOnly
          ? {
              createdId: 0,
              originalId: await inspect(
                async (db) =>
                  (
                    await db.query(
                      'SELECT task_id FROM task_actions GROUP BY task_id ORDER BY count(*) DESC,task_id LIMIT 1',
                    )
                  ).rows[0].task_id as number,
              ),
            }
          : await proveAdminEditing(fixture, runtime, output);
        const adversarial: unknown[] = [];
        if (!browserOnly)
          await proveAdminAdversarial(fixture, runtime, subjects.createdId, (name, details) => {
            adversarial.push({ name, details });
            writeFileSync(
              join(output, 'adversarial-results.json'),
              JSON.stringify(adversarial, null, 2),
            );
            console.log('PASS ' + name);
          });
        if (process.argv.includes('--browser') || browserOnly) {
          const { proveAdminEditingBrowser } =
            await import('./test-admin-work-editing-browser.mjs');
          const browserOutput = join(output, 'browser');
          mkdirSync(browserOutput);
          await proveAdminEditingBrowser(fixture, browserOutput, subjects.originalId);
        }
        run('invariants68-final', 'scripts/check-db.ts', [
          '--profile=historical-full-state-upgrade',
        ]);
        // Template copying requires the owned source pool to be fully closed.
        await runtime.$disconnect();
        run('permissions', 'scripts/test-permissions.ts', ['--restored-fixture']);
      } finally {
        await runtime.$disconnect();
      }
    });
  await withApprovedMigrationClient(
    async (db) => {
      const state = await adminEditState(db);
      writeFileSync(
        join(output, 'actual-after.json'),
        JSON.stringify({ at: new Date().toISOString(), state }, null, 2),
      );
      assert.deepEqual(
        state,
        JSON.parse(readFileSync(join(output, 'actual-before.json'), 'utf8')).state,
      );
    },
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  assert.deepEqual(binding(), sourceBefore, 'Executed source remained frozen throughout proof');
  writeFileSync(
    join(output, 'source-binding-pass.json'),
    JSON.stringify({ at: new Date().toISOString(), unchanged: true }),
  );
}
void main().catch((error) => {
  console.error(String(error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'));
  process.exitCode = 1;
});
