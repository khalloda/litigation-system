import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

async function main(): Promise<void> {
  const original = fs.readFileSync;
  fs.readFileSync = ((path: fs.PathOrFileDescriptor, ...args: unknown[]) => {
    if (String(path).toLowerCase().endsWith('.xlsx'))
      throw Object.assign(new Error('fixture forbids workbook reads'), { code: 'ENOENT' });
    return (original as (...values: unknown[]) => unknown)(path, ...args);
  }) as typeof fs.readFileSync;
  syncBuiltinESMExports();
  const { verifyHighImpactApplication } = await import('./lib/high-impact-application');
  const { withApprovedMigrationClient } = await import('./lib/migration-principal');
  await withApprovedMigrationClient(async (db) => {
    assert.ok((await verifyHighImpactApplication(db)).state);
  });
  console.log('PASS permanent verification completed while every XLSX read was refused');
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
