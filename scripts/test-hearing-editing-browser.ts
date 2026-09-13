import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withIsolatedPostgres } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { clientLogoFixtureState } from './lib/client-logo-fixture-state';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { initialiseActors } from './test-client-contacts';
import { proveHearingCanonical } from './lib/hearing-canonical-proof';
async function main() {
  const output = process.env.HEARING_EDIT_EVIDENCE_DIR;
  assert.ok(output);
  mkdirSync(output, { recursive: true });
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(files.status, 0);
  const manifest = [
    ...new Set(files.stdout.split('\0').filter((f) => /\.(ts|tsx|mjs|css|sql|json)$/u.test(f))),
  ]
    .sort()
    .map((path) => ({
      path,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    }));
  writeFileSync(join(output, 'executed-source-before.json'), JSON.stringify(manifest, null, 2));
  const source = await withApprovedMigrationClient(
    async (db) => ({
      state: await staffReadOnlyState(db),
      portable: await clientLogoFixtureState(db),
    }),
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  await withIsolatedPostgres(async (fixture) => {
    if (!process.argv.includes('--canonical-only')) {
      await fixture.restoreProject();
      await withApprovedMigrationClient(
        async (db) => {
          assert.deepEqual((await staffReadOnlyState(db)).tables, source.state.tables);
          assert.deepEqual(await clientLogoFixtureState(db), source.portable);
        },
        { databaseUrl: fixture.migrationUrl },
      );
      await migrateFixtureThroughCheckpoint(fixture.migrationUrl, 65, fixture.environment);
      const run = (name: string, script: string) => {
        const r = spawnSync(
          process.execPath,
          ['--import', 'tsx', script, ...(script.includes('run-prisma') ? ['deploy'] : [])],
          { env: fixture.environment, encoding: 'utf8', windowsHide: true, maxBuffer: 32000000 },
        );
        writeFileSync(
          join(output, name + '.log'),
          (r.stdout + r.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
        );
        assert.equal(r.status, 0, name);
      };
      run('deploy66', 'scripts/run-prisma-migration.ts');
      await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
      const ids = await withApprovedMigrationClient(
        async (db) => ({
          createdId: (
            await db.query('SELECT id FROM hearings WHERE matter_id IS NULL ORDER BY id LIMIT 1')
          ).rows[0].id,
          d41Id: (await db.query('SELECT id FROM hearings WHERE legacy_id=7072')).rows[0].id,
        }),
        { databaseUrl: fixture.migrationUrl },
      );
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
            | 'accounts'
            | 'login'
            | 'goto'
            | 'audit'
            | 'screenshot'
            | 'evidence'
            | 'inspect',
            unknown
          >,
        ) => hearingEditingBrowserProof({ ...context, ...ids }),
      );
      run('browser-final-invariants', 'scripts/check-db.ts');
    }
    await proveHearingCanonical(fixture, output);
  });
  assert.deepEqual(
    await withApprovedMigrationClient(staffReadOnlyState, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    }),
    source.state,
  );
  for (const row of manifest)
    assert.equal(
      createHash('sha256').update(readFileSync(row.path)).digest('hex'),
      row.sha256,
      row.path + ' changed during proof',
    );
  writeFileSync(
    join(output, 'completion.json'),
    JSON.stringify(
      {
        sourceUnchanged: true,
        executedSourceExact: true,
        ownedResourcesCleaned: true,
        browser: !process.argv.includes('--canonical-only'),
        canonical: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS focused browser/canonical proof, exact executed source and actual source preservation',
  );
}
void main().catch((e) => {
  console.error(String(e.stack ?? e).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'));
  process.exitCode = 1;
});
