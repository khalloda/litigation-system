import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { assertApprovedMigrationPrincipalUrl } from './lib/migration-principal';

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
  assert.ok(command && process.argv.length === 3, 'use dev, deploy, resolve-task33a or status');
  const prismaArguments = commands.get(command as 'dev' | 'deploy' | 'resolve-task33a' | 'status');
  assert.ok(prismaArguments, 'use dev, deploy, resolve-task33a or status');

  await assertApprovedMigrationPrincipalUrl(process.env['MIGRATION_DATABASE_URL']);
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
