import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ClientBase } from 'pg';
import { createDatabaseClient } from '../src/lib/db';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { prepareHearingLifecycleActors } from './lib/hearing-lifecycle-actors';
import { proveAdminIdSearch } from './lib/admin-work-id-search-proof';

async function actualState(db: ClientBase) {
  const state = await staffReadOnlyState(db);
  const names = (
    await db.query(
      `SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname IN ('public','staging','quarantine','_migration') ORDER BY 1,2`,
    )
  ).rows;
  assert.equal(names.length, 48);
  const identifier = (v: string) => '"' + v.replaceAll('"', '""') + '"';
  const sequences = [];
  for (const s of names) {
    const result = await db.query(
      'SELECT last_value::text,log_cnt::text,is_called FROM ' +
        identifier(s.schemaname) +
        '.' +
        identifier(s.sequencename),
    );
    assert.equal(result.rowCount, 1);
    sequences.push({ ...s, ...result.rows[0] });
  }
  return {
    ...state,
    completeSequenceCount: 48,
    completeSequenceFields: ['last_value', 'log_cnt', 'is_called'],
    completeSequenceDigest: createHash('sha256').update(JSON.stringify(sequences)).digest('hex'),
  };
}
async function main() {
  const root = resolve(process.env.ADMIN_ID_EVIDENCE_DIR!);
  assert.ok(process.env.ADMIN_ID_EVIDENCE_DIR);
  const red = process.argv.includes('--red'),
    output = join(root, red ? 'red' : 'green');
  mkdirSync(output, { recursive: true });
  const sourceRead = <T>(work: (db: ClientBase) => Promise<T>) =>
    withApprovedMigrationClient(work, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    });
  const before = await sourceRead(actualState);
  const boundary = join(root, 'actual-initial.json');
  if (existsSync(boundary)) assert.deepEqual(before, JSON.parse(readFileSync(boundary, 'utf8')));
  else writeFileSync(boundary, JSON.stringify({ ...before }, null, 2));
  writeFileSync(
    join(output, 'actual-before.json'),
    JSON.stringify({ at: new Date().toISOString(), state: before }, null, 2),
  );
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
  let completed = false;
  try {
    await withIsolatedPostgres(async (fixture) => {
      writeFileSync(
        join(output, 'isolation.json'),
        JSON.stringify(
          {
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
      await sourceRead(async (db) => {
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        try {
          await fixture.restoreProject(
            (await db.query('SELECT pg_export_snapshot() id')).rows[0].id,
          );
        } finally {
          await db.query('ROLLBACK');
        }
      });
      const inspect = <T>(work: (db: ClientBase) => Promise<T>) =>
        withApprovedMigrationClient(work, {
          databaseUrl: fixture.migrationUrl,
          clientConfig: { options: '-c default_transaction_read_only=on' },
        });
      await inspect(async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        assert.deepEqual((await staffReadOnlyState(db)).tables, before.tables);
      });
      const run = (name: string, script: string, args: string[], readonly = false) => {
        const env: NodeJS.ProcessEnv = { ...fixture.environment };
        if (readonly)
          for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL']) {
            const url = new URL(env[key]!);
            url.searchParams.set('options', '-c default_transaction_read_only=on');
            env[key] = url.toString();
          }
        const result = spawnSync(
          process.execPath,
          ['node_modules/tsx/dist/cli.mjs', script, ...args],
          { env, encoding: 'utf8', windowsHide: true, maxBuffer: 32000000 },
        );
        writeFileSync(
          join(output, name + '.log'),
          (result.stdout + result.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
        );
        assert.equal(result.status, 0, name);
        console.log('PASS ' + name);
      };
      if (!red)
        run(
          'invariants67',
          'scripts/check-db.ts',
          ['--profile=historical-full-state-upgrade'],
          true,
        );
      const runtime = createDatabaseClient(fixture.runtimeUrl);
      try {
        await prepareHearingLifecycleActors(fixture, runtime);
        const cases = await proveAdminIdSearch(runtime, inspect, output, red);
        if (!red) {
          const { proveHearingBrowser } = await import('./test-hearing-browser.mjs');
          const { adminIdBrowserProof } = await import('./lib/admin-work-id-browser-proof.mjs');
          await proveHearingBrowser(
            fixture,
            output,
            (
              context: Record<
                | 'page'
                | 'accounts'
                | 'login'
                | 'goto'
                | 'base'
                | 'evidence'
                | 'screenshot'
                | 'inspect',
                unknown
              >,
            ) => adminIdBrowserProof({ ...context, cases }),
            { preserveAccounts: true, boundedDependencyCheck: true, skipGenerate: true },
          );
          run('permissions', 'scripts/test-permissions.ts', ['--restored-fixture']);
        }
      } finally {
        await runtime.$disconnect();
      }
    });
    completed = true;
  } finally {
    const after = await sourceRead(actualState);
    writeFileSync(
      join(output, 'actual-after.json'),
      JSON.stringify({ at: new Date().toISOString(), state: after }, null, 2),
    );
    assert.deepEqual(after, before);
    writeFileSync(
      join(output, 'cleanup.json'),
      JSON.stringify(
        { fixtureRunnerCompleted: completed, actualIncludingCompleteSequencesUnchanged: true },
        null,
        2,
      ),
    );
  }
}
void main().catch((error) => {
  console.error(
    String(error instanceof Error ? error.stack : error).replace(
      /postgres(?:ql)?:\/\/[^\s"']+/gu,
      '[redacted]',
    ),
  );
  process.exitCode = 1;
});
