import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import type { Session } from 'next-auth';
import type { IsolatedPostgres } from './lib/isolated-postgres-fixture';
import { initialiseActors } from './test-client-contacts';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { createDatabaseClient } from '../src/lib/db';
import { readLogoManagement } from '../src/lib/client-logo-management';
import { prepareLogo } from '../src/lib/client-logo-upload';

export async function proveLogoPublication(
  fixture: IsolatedPostgres,
  output: string,
  original: boolean,
) {
  await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
  const root = await mkdtemp(join(tmpdir(), 'litigation-task41ac-publication-'));
  await cp(process.env.CLIENT_LOGO_ROOT!, root, { recursive: true });
  const db = createDatabaseClient(fixture.runtimeUrl);
  const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(work, { databaseUrl: fixture.migrationUrl });
  const account = await inspect(
    async (db) =>
      (
        await db.query(
          "SELECT u.id,u.person_id,u.username,u.role_code,u.session_version,a.id actor_id FROM user_accounts u JOIN audit_actors a ON a.user_account_id=u.id WHERE u.role_code='Administrator' AND a.actor_kind='human'",
        )
      ).rows[0],
  );
  const session = {
    expires: new Date(Date.now() + 3600000).toISOString(),
    user: {
      id: String(account.id),
      personId: account.person_id,
      username: account.username,
      name: 'TEST ONLY',
      role: account.role_code,
      sessionVersion: account.session_version,
      mustChangePassword: false,
      auditSessionId: randomUUID(),
    },
  } as Session;
  const clients = await inspect(async (db) =>
    (
      await db.query(
        'SELECT id FROM clients WHERE NOT is_archived AND id NOT IN (SELECT client_id FROM client_logos) ORDER BY id LIMIT 10',
      )
    ).rows.map((r) => r.id as number),
  );
  assert.equal(clients.length, 10);
  const bytes = await sharp({
    create: { width: 12, height: 6, channels: 4, background: '#1166aa' },
  })
    .png()
    .toBuffer();
  const prepared = await prepareLogo(bytes, 'TEST ONLY.png', 'image/png');
  const records: unknown[] = [];
  const running = new Set<ReturnType<typeof spawn>>();
  const start = (request: unknown, mode: string) => {
    const process = spawn(
      globalThis.process.execPath,
      ['--import', 'tsx', 'scripts/test-client-logo-publication-worker.ts', mode],
      {
        env: {
          ...fixture.environment,
          TASK41AC_LOGO_ROOT: root,
          TASK41AC_REQUEST: JSON.stringify(request),
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
      },
    );
    running.add(process);
    const messages: { phase: string; [key: string]: unknown }[] = [];
    const waiters = new Set<() => void>();
    process.on('message', (message) => {
      assert.equal(
        (message as { pid: number }).pid,
        process.pid,
        'Fault boundary must be the directly owned process, not a launcher child',
      );
      messages.push(message as (typeof messages)[number]);
      for (const wake of waiters) wake();
    });
    const ended = new Promise<void>((resolve, reject) => {
      process.once('error', reject);
      process.once('exit', (code, signal) => {
        records.push({ mode, pid: process.pid, messages, exit: code, signal });
        running.delete(process);
        resolve();
        for (const wake of waiters) wake();
      });
    });
    const wait = (phase: string) =>
      new Promise<(typeof messages)[number]>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error('Worker boundary timeout: ' + mode + '/' + phase));
        }, 35000);
        const check = () => {
          const value = messages.find((m) => m.phase === phase);
          if (value) {
            clearTimeout(timer);
            waiters.delete(check);
            resolve(value);
          } else if (messages.some((m) => m.phase === 'fatal')) {
            clearTimeout(timer);
            waiters.delete(check);
            reject(new Error('Worker fixture failure'));
          }
        };
        waiters.add(check);
        check();
      });
    return {
      wait,
      ended,
      release: () => process.send({ continue: true }),
      kill: async () => {
        process.kill();
        await ended;
      },
    };
  };
  const request = async (clientId: number) => {
    const state = await readLogoManagement(session, clientId, 1, null, db);
    return {
      session,
      action: 'create',
      input: {
        clientId,
        clientVersion: state.clientVersion,
        version: state.version,
        target: null,
        submission: randomUUID(),
        upload: { bytes: bytes.toString('base64'), name: 'TEST ONLY.png', mime: 'image/png' },
      },
    };
  };
  const state = (client: number) =>
    inspect(async (db) => ({
      current: (
        await db.query(
          'SELECT relative_path,sha256,row_version::text FROM client_logos WHERE client_id=$1',
          [client],
        )
      ).rows,
      versions: (
        await db.query(
          'SELECT id,relative_path,sha256 FROM client_logo_versions WHERE client_id=$1',
          [client],
        )
      ).rows,
      receipts: (
        await db.query(
          'SELECT submission_id,result_id,result_version::text,actor_id FROM client_logo_submissions WHERE client_id=$1',
          [client],
        )
      ).rows,
      events: (
        await db.query(
          "SELECT id,actor_id FROM audit_events WHERE entity_table='client_logos' AND entity_key IN (SELECT jsonb_build_object('id',id) FROM client_logos WHERE client_id=$1) ORDER BY id",
          [client],
        )
      ).rows,
    }));
  const verifyFile = async (req: Awaited<ReturnType<typeof request>>) => {
    const actual = await state(req.input.clientId);
    assert.equal(actual.current.length, 1);
    assert.equal(actual.versions.length, 1);
    assert.equal(actual.receipts.length, 1);
    assert.equal(actual.events.length, 1);
    assert.equal(actual.events[0].actor_id, actual.receipts[0].actor_id);
    assert.equal(actual.receipts[0].actor_id, account.actor_id);
    assert.equal(actual.receipts[0].submission_id, req.input.submission);
    assert.equal(actual.versions[0].id, req.input.submission);
    assert.equal(actual.receipts[0].result_id, req.input.submission);
    const data = await readFile(join(root, actual.current[0].relative_path));
    assert.deepEqual(data, prepared.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), prepared.sha256);
    assert.equal(actual.current[0].sha256, prepared.sha256);
    assert.equal(actual.versions[0].relative_path, actual.current[0].relative_path);
    assert.equal(actual.versions[0].sha256, prepared.sha256);
    return actual;
  };
  try {
    const req = await request(clients[0]!);
    const a = start(req, 'hold-sync-fail');
    await a.wait('flush');
    const b = start(req, 'normal');
    const success = await b.wait('result');
    await b.ended;
    const committed = await verifyFile(req);
    a.release();
    assert.equal((await a.wait('error')).code, 'storage');
    await a.ended;
    if (original) {
      await assert.rejects(readFile(join(root, committed.current[0].relative_path)), {
        code: 'ENOENT',
      });
      assert.deepEqual(await state(req.input.clientId), committed);
      records.push({
        reproduced:
          'R1 actual PostgreSQL reference loses file after overlapping creator flush failure',
        success,
        committed,
      });
    } else {
      assert.deepEqual(await verifyFile(req), committed);
      const retry = start(req, 'normal');
      assert.equal(((await retry.wait('result')).result as { replayed: boolean }).replayed, true);
      await retry.ended;
      assert.deepEqual(await verifyFile(req), committed);
      records.push({
        passed:
          'Separate-process A flush failure cannot delete B acknowledged PostgreSQL current/retained version; replay duplicates nothing',
        committed,
      });
      const linkRequest = await request(clients[5]!);
      const beforeLink = await state(linkRequest.input.clientId);
      const linkFailure = start(linkRequest, 'link-fail');
      assert.equal((await linkFailure.wait('error')).code, 'storage');
      await linkFailure.ended;
      assert.deepEqual(await state(linkRequest.input.clientId), beforeLink);
      const linkRetry = start(linkRequest, 'normal');
      await linkRetry.wait('result');
      await linkRetry.ended;
      await verifyFile(linkRequest);
      records.push({
        passed:
          'Publication link failure leaves previous metadata/audit unchanged and retry recovers',
      });
      for (const [index, mode, phase] of [
        [1, 'hold-sync-exit', 'flush'],
        [2, 'hold-before-link-exit', 'before-link'],
        [3, 'hold-link-exit', 'linked'],
        [4, 'lost-response', 'committed'],
      ] as const) {
        const req = await request(clients[index]!);
        const previous = await state(req.input.clientId);
        const a = start(req, mode);
        await a.wait(phase);
        await a.kill();
        if (mode !== 'lost-response') assert.deepEqual(await state(req.input.clientId), previous);
        const b = start(req, 'normal');
        await b.wait('result');
        await b.ended;
        const recovered = await verifyFile(req);
        const replay = start(req, 'normal');
        await replay.wait('result');
        await replay.ended;
        assert.deepEqual(await verifyFile(req), recovered);
        if (mode === 'hold-link-exit') {
          const failedAdopter = start(req, 'adopt-sync-fail');
          assert.equal((await failedAdopter.wait('error')).code, 'storage');
          await failedAdopter.ended;
          assert.deepEqual(await verifyFile(req), recovered);
        }
        records.push({
          passed:
            mode + ' recovery: exactly one retained version/receipt and stable audit on replay',
          recovered,
        });
      }
      // Same submission with conflicting valid content cannot replace its immutable path.
      const conflicting = structuredClone(req);
      conflicting.input.upload.bytes = (
        await sharp({ create: { width: 12, height: 6, channels: 4, background: '#aa3311' } })
          .png()
          .toBuffer()
      ).toString('base64');
      const conflict = start(conflicting, 'normal');
      assert.equal((await conflict.wait('error')).code, 'submission');
      await conflict.ended;
      assert.deepEqual(await verifyFile(req), committed);
    }
    await writeFile(
      resolve(output, 'publication-proof.json'),
      JSON.stringify(
        {
          original,
          passed: true,
          records,
          privateFilesRetainedAfterKilledWriters: (await readdir(root, { recursive: true })).filter(
            (n) => n.endsWith('.tmp'),
          ),
          ended: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } finally {
    for (const child of running) {
      child.kill();
      await new Promise<void>((done) => child.once('exit', () => done()));
    }
    await db.$disconnect();
    const suffix = relative(tmpdir(), root);
    assert.ok(!isAbsolute(suffix) && suffix.startsWith('litigation-task41ac-'));
    assert.equal(await realpath(root), root);
    await rm(root, { recursive: true, force: true });
  }
}
