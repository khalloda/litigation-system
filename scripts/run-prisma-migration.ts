import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { assertApprovedMigrationPrincipalUrl } from './lib/migration-principal';
import { validateFixtureMigrationConfig } from './lib/fixture-migration-checkpoint';

const commands = new Map([
  ['dev', ['migrate', 'dev']],
  ['deploy', ['migrate', 'deploy']],
  [
    'resolve-task33a',
    ['migrate', 'resolve', '--rolled-back', '20260902120000_finalize_task33a_enforcement'],
  ],
  ['status', ['migrate', 'status']],
] as const);

async function main(): Promise<void> {
  const command = process.argv[2];
  const fixture = command === 'deploy-fixture-checkpoint';
  assert.ok(
    command && process.argv.length === (fixture ? 4 : 3),
    'use dev, deploy, resolve-task33a, status, or the owned fixture checkpoint',
  );
  await assertApprovedMigrationPrincipalUrl();
  const prismaArguments = fixture
    ? ['migrate', 'deploy', '--config', await validateFixtureMigrationConfig(process.argv[3]!)]
    : commands.get(command as 'dev' | 'deploy' | 'resolve-task33a' | 'status');
  assert.ok(prismaArguments, 'use dev, deploy, resolve-task33a or status');

  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', ...prismaArguments],
    { cwd: process.cwd(), env: process.env, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error('Prisma migration command was interrupted');
  process.exitCode = result.status ?? 1;
}

main().catch((error: unknown) => {
  const message =
    error instanceof assert.AssertionError ? error.message : 'migration command failed safely';
  console.error(`ERROR ${message}`);
  process.exitCode = 1;
});
