// Owned fixture process only. Never accepts a migration/owner credential.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createDatabaseClient } from '../src/lib/db';
import { mutateLogo } from '../src/lib/client-logo-management';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, '127.0.0.1');
  assert.notEqual(url.port, '5433');
  assert.equal(url.username, 'litigation_runtime');
  const name = process.env.TASK40A_ISOLATED_CONTAINER!;
  assert.match(name, /^litigation-task40a-[a-f0-9-]+$/u);
  const container = JSON.parse(
    execFileSync('docker', ['inspect', name], { windowsHide: true, encoding: 'utf8' }),
  )[0];
  assert.equal(
    container.Config.Labels['litigation.task40a.isolation'],
    process.env.TASK40A_ISOLATED_TOKEN,
  );
  assert.deepEqual(container.NetworkSettings.Ports['5432/tcp'], [
    { HostIp: '127.0.0.1', HostPort: url.port },
  ]);
  assert.equal(container.State.Running, true);
  const mode = process.env.TASK41A_INTERRUPT;
  assert.ok(mode === 'before-commit' || mode === 'after-commit');
  const session = JSON.parse(process.env.TASK41A_SESSION!) as Session;
  const input = JSON.parse(process.env.TASK41A_INPUT!);
  input.upload.bytes = Buffer.from(input.upload.bytes, 'base64');
  const database = createDatabaseClient(url.toString());
  const pause = () =>
    new Promise<never>(() => {
      process.stdout.write('TASK41A_BOUNDARY\n');
      setInterval(() => {}, 1000);
    });
  let calls = 0;
  const proxy = new Proxy(database, {
    get(target, key) {
      if (key === '$transaction')
        return async (...args: unknown[]) => {
          calls++;
          if (calls === 2 && mode === 'before-commit') {
            const work = args[0] as (tx: unknown) => Promise<unknown>;
            args[0] = async (tx: unknown) => {
              await work(tx);
              return pause();
            };
          }
          return Reflect.apply(target.$transaction, target, args);
        };
      return Reflect.get(target, key);
    },
  }) as PrismaClient;
  await mutateLogo(session, 'update', input, {
    database: proxy,
    root: process.env.CLIENT_LOGO_ROOT,
    auditMetadata: createMaintenanceAuditMetadata(),
  });
  if (mode === 'after-commit') await pause();
  throw new Error('Interruption worker escaped its expected boundary');
}
main().catch(() => {
  console.error('Owned interruption worker failed before its expected boundary');
  process.exit(1);
});
