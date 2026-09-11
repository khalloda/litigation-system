import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

async function main() {
  assert.ok(process.send, 'Test worker requires its parent IPC channel');
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(process.env.MIGRATION_DATABASE_URL!)),
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  const root = resolve(process.env.TASK41AC_LOGO_ROOT!);
  const suffix = relative(tmpdir(), root);
  assert.ok(!isAbsolute(suffix) && suffix.startsWith('litigation-task41ac-'));
  assert.equal(await fs.realpath(root), root);
  const payload = JSON.parse(process.env.TASK41AC_REQUEST!);
  const mode = process.argv[2];
  assert.ok(
    [
      'normal',
      'hold-sync-fail',
      'hold-sync-exit',
      'hold-before-link-exit',
      'hold-link-exit',
      'adopt-sync-fail',
      'lost-response',
      'link-fail',
    ].includes(mode!),
  );
  const pause = (phase: string) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Test IPC boundary timeout')), 30000);
      process.once('message', () => {
        clearTimeout(timer);
        resolve();
      });
      process.send!({ phase, pid: process.pid });
    });
  const originalOpen = fs.open;
  let trapped = false;
  fs.open = (async (...args: Parameters<typeof fs.open>) => {
    const handle = await originalOpen(...args);
    const flags = args[1];
    const privateWrite = typeof flags === 'number' && (flags & constants.O_EXCL) !== 0;
    const adopted = flags === constants.O_RDWR;
    if (
      !trapped &&
      ((privateWrite && mode?.startsWith('hold-sync')) || (adopted && mode === 'adopt-sync-fail'))
    ) {
      trapped = true;
      return new Proxy(handle, {
        get(target, key) {
          if (key === 'sync')
            return async () => {
              if (mode !== 'adopt-sync-fail') await pause('flush');
              throw Object.assign(new Error('TEST ONLY injected flush failure'), { code: 'EIO' });
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }
    return handle;
  }) as typeof fs.open;
  const originalLink = fs.link;
  fs.link = async (...args) => {
    if (mode === 'link-fail')
      throw Object.assign(new Error('TEST ONLY publication failure'), { code: 'EIO' });
    if (mode === 'hold-before-link-exit') await pause('before-link');
    await originalLink(...args);
    if (mode === 'hold-link-exit') await pause('linked');
  };
  syncBuiltinESMExports();
  const { createDatabaseClient } = await import('../src/lib/db');
  const { mutateLogo } = await import('../src/lib/client-logo-management');
  const { createMaintenanceAuditMetadata } = await import('../src/lib/audit-metadata');
  const database = createDatabaseClient(process.env.DATABASE_URL!);
  try {
    const input = {
      ...payload.input,
      upload: { ...payload.input.upload, bytes: Buffer.from(payload.input.upload.bytes, 'base64') },
    };
    try {
      const result = await mutateLogo(payload.session, payload.action, input, {
        database,
        root,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      if (mode === 'lost-response') await pause('committed');
      process.send!({ phase: 'result', result, pid: process.pid });
    } catch (error) {
      process.send!({
        phase: 'error',
        code: error instanceof Error && 'code' in error ? error.code : 'unexpected',
        pid: process.pid,
      });
    }
  } finally {
    await database.$disconnect();
    process.disconnect();
  }
}
void main().catch(() => {
  process.send?.({ phase: 'fatal', pid: process.pid });
  process.exitCode = 1;
  process.disconnect?.();
});
