import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { adminEditState } from './lib/admin-edit-state';
import { createDatabaseClient } from '../src/lib/db';
import { prepareHearingLifecycleActors } from './lib/hearing-lifecycle-actors';

async function main() {
  const output = process.env.ADMIN_REFERENCE_EVIDENCE_DIR;
  assert.ok(output);
  mkdirSync(output, { recursive: true });
  const red = process.argv.includes('--expect-red');
  const paths = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(paths.status, 0);
  const binding = () =>
    [...new Set(paths.stdout.trim().split(/\r?\n/u))].sort().map((path) => ({
      path,
      bytes: readFileSync(path).length,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    }));
  const source = binding();
  writeFileSync(join(output, 'executed-source.json'), JSON.stringify(source, null, 2));
  const prior = 'D:/Projects/LitigationData/review-evidence/task44-phase2-20260914';
  const baseline = JSON.parse(readFileSync(join(prior, 'source-closure.json'), 'utf8'))
    .final as typeof source;
  const presentation = [
    'src/app/admin-works/page.tsx',
    'src/app/admin-works/[id]/page.tsx',
    'src/strings.ts',
  ];
  const protectedFiles = baseline.filter(
    (f) => /^(src\/|prisma\/|scripts\/)/u.test(f.path) && !presentation.includes(f.path),
  );
  for (const f of protectedFiles)
    assert.deepEqual(
      source.find((s) => s.path === f.path),
      f,
      f.path,
    );
  writeFileSync(
    join(output, 'reused-backend.json'),
    JSON.stringify(
      {
        prior,
        protectedFiles,
        reused: [
          'run05/invariants67.log',
          'run05/invariants68.log',
          'run05/mutation-results.json',
          'run05/adversarial-results.json',
          'run05/green-results.json',
          'run05/id-candidates.json',
          'run07/permissions.log',
          'guard/guard.log',
        ].map((path) => ({
          path,
          sha256: createHash('sha256')
            .update(readFileSync(join(prior, path)))
            .digest('hex'),
        })),
        reason:
          'Only current/source presentation changes; original schema, migrations 1–68, query, input, services, actions, authority and proof helpers are byte-identical.',
      },
      null,
      2,
    ),
  );
  const actual = async (phase: string) =>
    withApprovedMigrationClient(
      async (db) => {
        const state = await adminEditState(db);
        writeFileSync(
          join(output, 'actual-' + phase + '.json'),
          JSON.stringify({ at: new Date().toISOString(), state }, null, 2),
        );
        assert.deepEqual(
          state,
          JSON.parse(readFileSync(join(prior, 'run07/actual-after.json'), 'utf8')).state,
          'Exact original owner state for baseline reuse',
        );
      },
      { clientConfig: { options: '-c default_transaction_read_only=on' } },
    );
  await actual('before');
  try {
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
          (await adminEditState(db)).tables,
          JSON.parse(readFileSync(join(output, 'actual-before.json'), 'utf8')).state.tables,
        );
      });
      const run = (name: string, script: string, args: string[]) => {
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
      run('deploy68', 'scripts/run-prisma-migration.ts', ['deploy']);
      const runtime = createDatabaseClient(fixture.runtimeUrl);
      try {
        await prepareHearingLifecycleActors(fixture, runtime);
        const { proveAdminReferenceDisplay } =
          await import('./test-admin-reference-display-browser.mjs');
        mkdirSync(join(output, 'browser'));
        await proveAdminReferenceDisplay(fixture, join(output, 'browser'), red);
      } finally {
        await runtime.$disconnect();
      }
      if (!red) {
        run('invariants68-final', 'scripts/check-db.ts', [
          '--profile=historical-full-state-upgrade',
        ]);
        run('permissions', 'scripts/test-permissions.ts', ['--restored-fixture']);
      }
    });
  } finally {
    await actual('after');
  }
  assert.deepEqual(binding(), source, 'Executed source stayed frozen');
  writeFileSync(
    join(output, 'completion.json'),
    JSON.stringify({
      at: new Date().toISOString(),
      expectedRed: red,
      sourceFrozen: true,
      ownerPreserved: true,
      completed: true,
    }),
  );
}
void main().catch((e) => {
  console.error(String(e).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'));
  process.exitCode = 1;
});
