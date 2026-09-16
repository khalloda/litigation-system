import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedPostgres } from './lib/isolated-postgres-fixture';

async function main() {
  const output = resolve(
    process.env.TASKS46_47_TEST_OUTPUT ?? 'test-results/tasks46-47-browser-' + Date.now(),
  );
  mkdirSync(output, { recursive: true });
  await withIsolatedPostgres(async (fixture) => {
    Object.assign(process.env, fixture.environment);
    await fixture.restoreProject();
    const deploy = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/run-prisma-migration.ts', 'deploy'],
      { env: fixture.environment, encoding: 'utf8', windowsHide: true, maxBuffer: 32_000_000 },
    );
    writeFileSync(resolve(output, 'deploy.log'), deploy.stdout + deploy.stderr);
    assert.equal(deploy.status, 0, deploy.stdout + deploy.stderr);
    const { proveDocumentsFeeLettersBrowser } =
      await import('./test-documents-fee-letters-browser.mjs');
    await proveDocumentsFeeLettersBrowser(fixture, output);
  });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
