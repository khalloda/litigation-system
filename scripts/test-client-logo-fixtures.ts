import assert from 'node:assert/strict';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import type { ClientBase } from 'pg';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
  symlink,
  unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import sharp from 'sharp';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createDatabaseClient } from '../src/lib/db';
import {
  readLogoManagement,
  mutateLogo,
  logoMetadata,
  type LogoAction,
} from '../src/lib/client-logo-management';
import { prepareLogo, LOGO_UPLOAD_LIMIT, LogoError } from '../src/lib/client-logo-upload';
import { persistPreparedLogo } from '../src/lib/client-logo-storage';
import { readClientLogoFile } from '../src/lib/client-logo-file';
import { readClient, readClients } from '../src/lib/client-query';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { disableManagedAccount } from '../src/lib/auth/user-management';
import { initialiseActors } from './test-client-contacts';
import {
  withApprovedMigrationClient,
  withRestrictedRuntimeClient,
} from './lib/migration-principal';
import { assertClientLogoBoundary } from './lib/client-logo-checkpoint';
import { reconcileClientLogos } from './lib/client-logo-reconciliation';
import { runClientLogoTransform } from './transform-client-logos';
import { readFileSync } from 'node:fs';
import type { IsolatedPostgres } from './lib/isolated-postgres-fixture';

export async function proveClientLogoMutations(fixture: IsolatedPostgres, output: string) {
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment),
    { databaseUrl: fixture.migrationUrl },
  );
  await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
  const database = createDatabaseClient(fixture.runtimeUrl);
  const root = await mkdtemp(join(tmpdir(), 'litigation-task41a-logos-'));
  await cp(process.env.CLIENT_LOGO_ROOT!, root, { recursive: true });
  const evidence: { label: string; passed: true }[] = [];
  const pass = (label: string) => {
    evidence.push({ label, passed: true });
    console.log('PASS logo: ' + label);
  };
  const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(fn, { databaseUrl: fixture.migrationUrl });
  const accounts = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id,person_id,username,role_code,session_version FROM user_accounts ORDER BY id',
        )
      ).rows,
  );
  assert.equal(accounts.length, 4);
  const sessions = accounts.map(
    (a) =>
      ({
        expires: new Date(Date.now() + 3600000).toISOString(),
        user: {
          id: String(a.id),
          personId: a.person_id,
          username: a.username,
          name: 'TEST ONLY',
          role: a.role_code,
          sessionVersion: a.session_version,
          mustChangePassword: false,
          auditSessionId: randomUUID(),
        },
      }) as Session,
  );
  const admin = sessions.find((a) => a.user.role === 'Administrator')!;
  const assistant = sessions.find((a) => a.user.role === 'Litigation Assistant')!;
  const dependencies = { database, root, auditMetadata: createMaintenanceAuditMetadata() };
  const rowCounts = () =>
    inspect(
      async (db) =>
        (
          await db.query(
            "SELECT (SELECT count(*)::integer FROM client_logo_versions) versions,(SELECT count(*)::integer FROM client_logo_submissions) submissions,(SELECT count(*)::integer FROM audit_events WHERE entity_table='client_logos') events",
          )
        ).rows[0],
    );
  const ids = await inspect(async (db) => ({
    imported: (await db.query('SELECT client_id FROM client_logos ORDER BY client_id LIMIT 1'))
      .rows[0].client_id as number,
    empty: (
      await db.query(
        'SELECT id FROM clients WHERE NOT is_archived AND id NOT IN (SELECT client_id FROM client_logos) ORDER BY id LIMIT 1',
      )
    ).rows[0].id as number,
  }));
  const input = async (
    clientId: number,
    upload?: { bytes: Buffer; name: string; mime: string },
    target: string | null = null,
  ) => {
    const state = await readLogoManagement(admin, clientId, 1, null, database);
    return {
      clientId,
      version: state.version,
      clientVersion: state.clientVersion,
      submission: randomUUID(),
      target,
      upload,
    };
  };
  const human = async <T>(work: (db: ClientBase) => Promise<T>) =>
    inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await db.query('SELECT audit_set_human_context($1)', [Number(admin.user.id)]);
        await db.query(
          "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY logo fault','system')",
          [randomUUID(), randomUUID(), randomUUID()],
        );
        const result = await work(db);
        await db.query('COMMIT');
        return result;
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    });
  try {
    const volume = await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT (SELECT count(*)::integer FROM clients) clients,(SELECT count(*)::integer FROM contacts) contacts',
          )
        ).rows[0],
    );
    assert.deepEqual(volume, { clients: 318, contacts: 188 });
    const largest = await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT client_id,count(*)::integer n FROM matters GROUP BY client_id ORDER BY n DESC LIMIT 1',
          )
        ).rows[0],
    );
    assert.equal(largest.n, 378);
    assert.equal((await readClient(admin, String(largest.client_id), database))?.matterCount, 378);
    const list = await readClients(admin, { archive: 'all' }, database);
    assert.equal(list.total, 318);
    assert.ok(list.rows.length <= 25);
    pass('Real 318-client/188-contact paged reads and largest 378-matter association');
    const buffers = {
      png: await sharp({
        create: {
          width: 1800,
          height: 900,
          channels: 4,
          background: { r: 200, g: 30, b: 50, alpha: 0.4 },
        },
      })
        .png()
        .toBuffer(),
      jpg: await sharp({ create: { width: 500, height: 300, channels: 3, background: '#336699' } })
        .jpeg()
        .toBuffer(),
      gif: await sharp({
        create: {
          width: 90,
          height: 45,
          channels: 4,
          background: { r: 15, g: 70, b: 100, alpha: 0.5 },
        },
      })
        .gif()
        .toBuffer(),
    };
    const uploads = Object.entries(buffers).map(([extension, bytes]) => ({
      bytes,
      name: `TEST ONLY.${extension}`,
      mime: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
    }));
    for (const upload of uploads) {
      const image = await prepareLogo(upload.bytes, upload.name, upload.mime);
      assert.ok(image.width <= 1200);
      assert.equal(image.width / image.height, upload.mime === 'image/jpeg' ? 5 / 3 : 2);
      assert.equal((await sharp(image.bytes).metadata()).pages ?? 1, 1);
    }
    assert.equal(
      (await sharp((await prepareLogo(buffers.png, 'TEST.png', 'image/png')).bytes).metadata())
        .hasAlpha,
      true,
    );
    pass(
      'PNG/JPEG/GIF bounded decoding; 1200-pixel print width; aspect ratio, no upscaling, transparency and static GIF',
    );
    // JPEG permits whitespace after EOI. This creates actual valid exact-size
    // images, rather than asserting only the numeric constant.
    for (const length of [LOGO_UPLOAD_LIMIT - 1, LOGO_UPLOAD_LIMIT]) {
      const padded = Buffer.concat([buffers.jpg, Buffer.alloc(length - buffers.jpg.length, 0x20)]);
      assert.equal(padded.length, length);
      await prepareLogo(padded, 'boundary.jpg', 'image/jpeg');
    }
    await assert.rejects(
      prepareLogo(Buffer.alloc(LOGO_UPLOAD_LIMIT + 1), 'large.png', 'image/png'),
      LogoError,
    );
    for (const [bytes, name, mime] of [
      [Buffer.alloc(0), 'empty.png', 'image/png'],
      [buffers.png.subarray(0, 50), 'truncated.png', 'image/png'],
      [Buffer.from('<svg/>'), 'file.svg', 'image/svg+xml'],
      [buffers.png, 'file.jpg', 'image/jpeg'],
      [buffers.png, 'file.png', 'image/jpeg'],
      [buffers.png, '../file.png', 'image/png'],
      [buffers.png, 'NUL.png', 'image/png'],
      [buffers.png, 'file:ads.png', 'image/png'],
      [buffers.png, 'file.png.', 'image/png'],
      [buffers.png, 'file\u0000.png', 'image/png'],
    ] as const)
      await assert.rejects(prepareLogo(bytes, name, mime), LogoError);
    const large = await sharp({
      create: { width: 16001, height: 1, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    await assert.rejects(prepareLogo(large, 'dimension.png', 'image/png'));
    const pixels = await sharp({
      create: { width: 4001, height: 4000, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    await assert.rejects(prepareLogo(pixels, 'pixels.png', 'image/png'));
    const frames = Buffer.alloc(101 * 3);
    for (let i = 0; i < 101; i++) {
      frames[i * 3] = i;
      frames[i * 3 + 1] = (i * 2) % 256;
      frames[i * 3 + 2] = (i * 7) % 256;
    }
    const animated = await sharp(frames, {
      raw: { width: 1, height: 101, channels: 3, pageHeight: 1 },
    })
      .gif()
      .toBuffer();
    assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 101);
    await assert.rejects(prepareLogo(animated, 'frames.gif', 'image/gif'));
    const webp = await sharp(buffers.png).webp().toBuffer();
    await assert.rejects(prepareLogo(webp, 'unsupported.webp', 'image/webp'));
    const noise = randomBytes(1200 * 2800),
      noisyRgb = Buffer.alloc(noise.length * 3);
    for (let i = 0; i < noise.length; i++) {
      const value = noise[i]! % 16;
      noisyRgb[i * 3] = value * 16;
      noisyRgb[i * 3 + 1] = (value * 31) % 256;
      noisyRgb[i * 3 + 2] = (value * 47) % 256;
    }
    const expandingGif = await sharp(noisyRgb, { raw: { width: 1200, height: 2800, channels: 3 } })
      .gif({ colours: 16 })
      .toBuffer();
    assert.ok(expandingGif.length < LOGO_UPLOAD_LIMIT);
    assert.ok((await sharp(expandingGif).png().toBuffer()).length > LOGO_UPLOAD_LIMIT);
    await assert.rejects(
      prepareLogo(expandingGif, 'output-cap.gif', 'image/gif'),
      (error: unknown) => error instanceof LogoError && error.code === 'size',
    );
    const prepared = await prepareLogo(buffers.png, 'TEST.png', 'image/png');
    const outside = join(root, 'storage-fixture');
    await mkdir(outside);
    const escaped = join(root, '2147483647');
    await symlink(outside, escaped, 'junction');
    try {
      await assert.rejects(persistPreparedLogo(root, 2147483647, randomUUID(), prepared));
    } finally {
      await unlink(escaped);
    }
    const linkedRoot = join(root, 'linked-root');
    await symlink(outside, linkedRoot, 'junction');
    try {
      await assert.rejects(persistPreparedLogo(linkedRoot, 999, randomUUID(), prepared));
    } finally {
      await unlink(linkedRoot);
    }
    const occupied = join(root, '2147483646');
    await writeFile(occupied, 'TEST ONLY occupied path');
    try {
      await assert.rejects(persistPreparedLogo(root, 2147483646, randomUUID(), prepared));
    } finally {
      await unlink(occupied);
    }
    await rm(outside, { recursive: true });
    // Deny file creation on our own empty folder only, then remove that exact
    // ACE before fixture cleanup. No project or shared ACL is touched.
    const deniedFolder = join(root, '2147483645');
    await mkdir(deniedFolder);
    const sidOutput = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const sid = sidOutput.match(/S-1-[0-9-]+/u)?.[0];
    assert.ok(sid);
    try {
      execFileSync('icacls', [deniedFolder, '/deny', `*${sid}:(WD,AD)`], { windowsHide: true });
      await assert.rejects(
        persistPreparedLogo(root, 2147483645, randomUUID(), prepared),
        LogoError,
      );
    } finally {
      execFileSync('icacls', [deniedFolder, '/remove:d', `*${sid}`], { windowsHide: true });
    }
    await rm(deniedFolder, { recursive: true });
    pass(
      'Actual denied write permission on task-owned storage rejects safely; exact test ACL removed',
    );
    pass(
      'Exact 2 MiB boundaries, pixel/frame/dimension caps, invalid/truncated/spoofed/SVG/WebP input, unsafe names, linked root/client escape and write failure rejected',
    );
    const before = await rowCounts();
    for (const session of sessions) {
      const state = await readLogoManagement(session, ids.imported, 1, null, database);
      assert.ok(state.current);
      assert.equal(state.rows.length > 0, session.user.role === 'Administrator');
    }
    const firstInput = await input(ids.empty, uploads[0]);
    for (const denied of [
      null,
      ...sessions.filter((s) => ['Lawyer', 'Paralegal'].includes(s.user.role)),
    ])
      for (const action of ['create', 'update', 'archive', 'restore'] as LogoAction[])
        await assert.rejects(mutateLogo(denied, action, firstInput, dependencies));
    for (const action of ['archive', 'restore'] as LogoAction[])
      await assert.rejects(mutateLogo(assistant, action, firstInput, dependencies));
    for (const forged of [
      { ...admin, user: { ...admin.user, id: '2147483647' } },
      { ...admin, user: { ...admin.user, role: 'Lawyer' as const } },
      { ...admin, user: { ...admin.user, sessionVersion: admin.user.sessionVersion - 1 } },
      { ...admin, user: { ...admin.user, personId: 2147483647 } },
    ]) {
      await assert.rejects(mutateLogo(forged, 'create', firstInput, dependencies));
      await assert.rejects(readLogoManagement(forged, ids.empty, 1, null, database));
    }
    assert.deepEqual(await rowCounts(), before);
    pass(
      'Every disallowed service role/action, forged account/person/role and revoked session denied without business/audit changes',
    );
    const first = await mutateLogo(assistant, 'create', firstInput, dependencies);
    assert.equal(first.changed, true);
    const current = await readLogoManagement(admin, ids.empty, 1, null, database);
    assert.equal(current.current?.id, first.id);
    assert.ok(await readClientLogoFile(admin, root, logoMetadata(current.current!)));
    const createdCounts = await rowCounts();
    assert.equal((await mutateLogo(assistant, 'create', firstInput, dependencies)).replayed, true);
    assert.deepEqual(await rowCounts(), createdCounts);
    const noop = await mutateLogo(
      assistant,
      'update',
      await input(ids.empty, uploads[0]),
      dependencies,
    );
    assert.equal(noop.changed, false);
    assert.deepEqual(await rowCounts(), createdCounts);
    pass(
      'Empty-client explicit save, durable fresh read, exact replay and no-op preserve single success',
    );
    const imported = await readLogoManagement(admin, ids.imported, 1, null, database);
    const original = Buffer.from(
      (await readClientLogoFile(admin, root, logoMetadata(imported.current!)))!.data,
    );
    const replacement = await mutateLogo(
      assistant,
      'update',
      await input(ids.imported, uploads[1]),
      dependencies,
    );
    assert.notEqual(replacement.id, imported.current!.id);
    assert.deepEqual(await readFile(join(root, imported.current!.relative_path)), original);
    await mutateLogo(
      admin,
      'archive',
      await input(ids.imported, undefined, replacement.id),
      dependencies,
    );
    assert.equal((await readLogoManagement(admin, ids.imported, 1, null, database)).archived, true);
    const archivedCounts = await rowCounts();
    assert.equal(
      (
        await mutateLogo(
          admin,
          'archive',
          await input(ids.imported, undefined, replacement.id),
          dependencies,
        )
      ).changed,
      false,
    );
    assert.deepEqual(await rowCounts(), archivedCounts);
    await assert.rejects(
      mutateLogo(assistant, 'update', await input(ids.imported, uploads[2]), dependencies),
    );
    await mutateLogo(
      admin,
      'restore',
      await input(ids.imported, undefined, imported.current!.id),
      dependencies,
    );
    const restored = await readLogoManagement(admin, ids.imported, 1, null, database);
    assert.equal(restored.current!.sha256, imported.current!.sha256);
    assert.equal(restored.archived, false);
    await assert.rejects(
      mutateLogo(
        admin,
        'restore',
        await input(ids.empty, undefined, imported.current!.id),
        dependencies,
      ),
    );
    pass(
      'Imported replacement retains identical bytes; Administrator archive/restore and replaced-version recovery; cross-client restore and assistant implicit restore denied',
    );
    const racingInput = await input(ids.empty, uploads[1]);
    const racers = await Promise.allSettled([
      mutateLogo(assistant, 'update', racingInput, dependencies),
      mutateLogo(
        admin,
        'update',
        { ...racingInput, submission: randomUUID(), upload: uploads[2] },
        dependencies,
      ),
    ]);
    assert.equal(racers.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(racers.filter((r) => r.status === 'rejected').length, 1);
    pass(
      'Two actual concurrent replacements: exactly one commits, the stale save cannot overwrite',
    );
    const duplicate = await input(ids.empty, uploads[0]);
    const duplicateResults = await Promise.all([
      mutateLogo(assistant, 'update', duplicate, dependencies),
      mutateLogo(assistant, 'update', duplicate, dependencies),
    ]);
    assert.equal(duplicateResults.filter((r) => r.changed).length, 1);
    pass(
      'Concurrent duplicate submission commits one retained version and one successful operation',
    );
    const afterLaterSave = await rowCounts();
    assert.equal((await mutateLogo(assistant, 'create', firstInput, dependencies)).replayed, true);
    assert.deepEqual(await rowCounts(), afterLaterSave);
    assert.equal(
      (await readLogoManagement(admin, ids.empty, 1, null, database)).current!.id,
      duplicate.submission,
    );
    pass('Replaying an older successful submission cannot overwrite a later version');
    const failing = await input(ids.empty, uploads[1]);
    const countBeforeFailure = await rowCounts();
    let calls = 0;
    const failDb = new Proxy(database, {
      get(target, key) {
        if (key === '$transaction')
          return (...args: unknown[]) => {
            calls++;
            if (calls === 2) throw new Error('TEST database unavailable after file flush');
            return Reflect.apply(target.$transaction, target, args);
          };
        return Reflect.get(target, key);
      },
    }) as PrismaClient;
    await assert.rejects(
      mutateLogo(admin, 'update', failing, { ...dependencies, database: failDb }),
    );
    assert.deepEqual(await rowCounts(), countBeforeFailure);
    assert.ok((await readFile(join(root, String(ids.empty), failing.submission + '.jpg'))).length);
    assert.equal((await mutateLogo(admin, 'update', failing, dependencies)).changed, true);
    pass(
      'Database failure after file flush preserves previous current metadata; exact retry recovers without overwriting',
    );
    const uncertain = await input(ids.empty, uploads[2]);
    let commits = 0;
    const lostResponse = new Proxy(database, {
      get(target, key) {
        if (key === '$transaction')
          return async (...args: unknown[]) => {
            const result = await Reflect.apply(target.$transaction, target, args);
            if (++commits === 2) throw new Error('TEST lost response after committed transaction');
            return result;
          };
        return Reflect.get(target, key);
      },
    }) as PrismaClient;
    await assert.rejects(
      mutateLogo(admin, 'update', uncertain, { ...dependencies, database: lostResponse }),
    );
    const committed = await rowCounts();
    assert.equal((await mutateLogo(admin, 'update', uncertain, dependencies)).replayed, true);
    assert.deepEqual(await rowCounts(), committed);
    pass(
      'Indeterminate commit response retains referenced file; replay confirms success without duplicate audit/version',
    );
    // A failed audit write must abort the metadata/version/submission together.
    const auditInput = await input(ids.empty, uploads[1]);
    const auditBefore = await rowCounts();
    await inspect(async (db) => {
      await db.query(
        "CREATE FUNCTION public.task41a_fail_logo_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_table='client_logos' THEN RAISE EXCEPTION 'TEST ONLY audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER task41a_fail_logo_audit BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.task41a_fail_logo_audit()",
      );
    });
    try {
      await assert.rejects(mutateLogo(admin, 'update', auditInput, dependencies));
      assert.deepEqual(await rowCounts(), auditBefore);
    } finally {
      await inspect(async (db) => {
        await db.query(
          'DROP TRIGGER task41a_fail_logo_audit ON public.audit_events; DROP FUNCTION public.task41a_fail_logo_audit()',
        );
      });
    }
    assert.equal((await mutateLogo(admin, 'update', auditInput, dependencies)).changed, true);
    pass(
      'Actual audit insertion failure rolls back current/version/submission; same retained file retries successfully',
    );
    for (const mode of ['before-commit', 'after-commit']) {
      const interrupted = await input(
        ids.empty,
        mode === 'before-commit' ? uploads[0] : uploads[2],
      );
      const beforeProcess = await rowCounts();
      const workerEnvironment = {
        NODE_ENV: 'test' as const,
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) =>
            [
              'SYSTEMROOT',
              'WINDIR',
              'PATH',
              'PATHEXT',
              'COMSPEC',
              'TEMP',
              'TMP',
              'USERPROFILE',
              'LOCALAPPDATA',
              'APPDATA',
            ].includes(key.toUpperCase()),
          ),
        ),
        DATABASE_URL: fixture.runtimeUrl,
        CLIENT_LOGO_ROOT: root,
        TASK41A_INTERRUPT: mode,
        TASK41A_SESSION: JSON.stringify(admin),
        TASK41A_INPUT: JSON.stringify({
          ...interrupted,
          upload: { ...interrupted.upload, bytes: interrupted.upload!.bytes.toString('base64') },
        }),
      };
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'scripts/test-client-logo-interruption-worker.ts'],
        {
          env: {
            ...workerEnvironment,
            TASK40A_ISOLATED_CONTAINER: fixture.container,
            TASK40A_ISOLATED_TOKEN: fixture.environment.TASK40A_ISOLATED_TOKEN,
          },
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      const ended = new Promise((res) => child.once('exit', res));
      try {
        await new Promise<void>((res, rej) => {
          let text = '';
          const timer = setTimeout(
            () => rej(new Error('Owned worker did not reach interruption boundary')),
            25000,
          );
          child.once('exit', () => {
            clearTimeout(timer);
            rej(new Error('Owned worker exited early'));
          });
          child.once('error', rej);
          child.stdout.on('data', (data) => {
            text += data;
            if (text.includes('TASK41A_BOUNDARY')) {
              clearTimeout(timer);
              res();
            }
          });
        });
      } finally {
        child.kill();
        await ended;
      }
      if (mode === 'before-commit') assert.deepEqual(await rowCounts(), beforeProcess);
      const recovered = await mutateLogo(admin, 'update', interrupted, dependencies);
      assert.equal(recovered.replayed, mode === 'after-commit');
      assert.equal((await rowCounts()).versions, beforeProcess.versions + 1);
      pass(
        `Actual owned process termination ${mode}; fresh-process retry preserves exactly one committed version`,
      );
    }
    const mixed = await input(ids.empty, uploads[1]);
    const mixedResults = await Promise.allSettled([
      mutateLogo(assistant, 'update', mixed, dependencies),
      mutateLogo(
        admin,
        'restore',
        { ...mixed, submission: randomUUID(), upload: undefined, target: first.id },
        dependencies,
      ),
    ]);
    assert.equal(mixedResults.filter((r) => r.status === 'fulfilled').length, 1);
    pass('Actual replacement versus retained-version restore race has one valid winner');
    const archiveRaceState = await readLogoManagement(admin, ids.empty, 1, null, database);
    const archiveRace = await input(ids.empty, uploads[2]);
    const archiveRaceResults = await Promise.allSettled([
      mutateLogo(assistant, 'update', archiveRace, dependencies),
      mutateLogo(
        admin,
        'archive',
        {
          ...archiveRace,
          submission: randomUUID(),
          upload: undefined,
          target: archiveRaceState.current!.id,
        },
        dependencies,
      ),
    ]);
    assert.equal(archiveRaceResults.filter((r) => r.status === 'fulfilled').length, 1);
    const afterArchiveRace = await readLogoManagement(admin, ids.empty, 1, null, database);
    if (afterArchiveRace.archived)
      await mutateLogo(
        admin,
        'restore',
        await input(ids.empty, undefined, afterArchiveRace.current!.id),
        dependencies,
      );
    const lifecycleNoopBefore = await rowCounts();
    const activeForNoop = await readLogoManagement(admin, ids.empty, 1, null, database);
    assert.equal(
      (
        await mutateLogo(
          admin,
          'restore',
          await input(ids.empty, undefined, activeForNoop.current!.id),
          dependencies,
        )
      ).changed,
      false,
    );
    assert.deepEqual(await rowCounts(), lifecycleNoopBefore);
    pass(
      'Actual replacement versus logo archive race has one winner; lifecycle no-op adds no version or audit',
    );
    // Force parent archive to win while the other request has already read its
    // active snapshot and reached the committing gateway's parent lock.
    const parentInput = await input(ids.empty, uploads[2]);
    let pending: Promise<unknown> | undefined;
    await human(async (db) => {
      await db.query("SELECT client_contact_set_archived('clients',$1,$2,true)", [
        ids.empty,
        parentInput.clientVersion,
      ]);
      pending = mutateLogo(assistant, 'update', parentInput, dependencies).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      let waiting = false;
      for (let i = 0; i < 80; i++) {
        waiting = await inspect(
          async (probe) =>
            (
              await probe.query(
                "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%public.client_logo_mutate%') waiting",
              )
            ).rows[0].waiting,
        );
        if (waiting) break;
        await new Promise((res) => setTimeout(res, 25));
      }
      assert.ok(waiting, 'Concurrent request reached real database lock');
    });
    assert.ok('error' in ((await pending!) as object));
    const archivedParent = await readLogoManagement(admin, ids.empty, 1, null, database);
    assert.equal(archivedParent.clientArchived, true);
    assert.ok(await readClientLogoFile(admin, root, logoMetadata(archivedParent.current!)));
    for (const action of ['create', 'update', 'archive', 'restore'] as LogoAction[])
      await assert.rejects(
        mutateLogo(
          admin,
          action,
          {
            ...parentInput,
            version: archivedParent.version,
            clientVersion: archivedParent.clientVersion,
            target:
              action === 'restore' || action === 'archive' ? archivedParent.current!.id : null,
            upload: action === 'restore' || action === 'archive' ? undefined : uploads[0],
          },
          dependencies,
        ),
      );
    await human(async (db) => {
      await db.query("SELECT client_contact_set_archived('clients',$1,$2,false)", [
        ids.empty,
        archivedParent.clientVersion,
      ]);
    });
    const activeParent = await readLogoManagement(admin, ids.empty, 1, null, database);
    assert.equal(activeParent.version, archivedParent.version);
    assert.equal(activeParent.current!.id, archivedParent.current!.id);
    assert.equal((await readClient(admin, String(largest.client_id), database))?.matterCount, 378);
    pass(
      'Real parent-archive lock race rejects pending logo change; archived read and every mutation denial; parent restore preserves individual logo and matters',
    );
    await withRestrictedRuntimeClient(fixture.runtimeUrl, async (runtime) => {
      for (const sql of [
        'UPDATE client_logos SET is_archived=true',
        'DELETE FROM client_logos',
        'TRUNCATE client_logos',
        'INSERT INTO client_logo_versions DEFAULT VALUES',
        'DELETE FROM migration_client_logo_import',
      ])
        await assert.rejects(runtime.query(sql));
      for (const session of sessions.filter((s) => s.user.role !== 'Administrator'))
        for (const action of session.user.role === 'Litigation Assistant'
          ? ['archive', 'restore']
          : ['create', 'update', 'archive', 'restore']) {
          await runtime.query('BEGIN');
          try {
            await runtime.query('SELECT audit_set_human_context($1)', [Number(session.user.id)]);
            await runtime.query(
              "SELECT audit_set_event_context($1::uuid,$2::uuid,$3::uuid,NULL,'TEST ONLY','system')",
              [randomUUID(), randomUUID(), randomUUID()],
            );
            await assert.rejects(
              runtime.query('SELECT client_logo_mutate($1,1,1,$2,$3,NULL,$4,$5,$6)', [
                ids.empty,
                randomUUID(),
                action,
                {},
                session.user.sessionVersion,
                session.user.role,
              ]),
            );
          } finally {
            await runtime.query('ROLLBACK');
          }
        }
    });
    pass(
      'Runtime direct writes/import evidence deletion denied; database gateway independently rejects all non-Administrator lifecycle calls',
    );
    await inspect(async (db) => {
      await assertClientLogoBoundary(db);
      const reconciled = await reconcileClientLogos(db, { logoRoot: root });
      assert.equal(reconciled.auditRows, 54);
      assert.ok(
        reconciled.defects.every((d) => d.startsWith('unexpected runtime file:')),
        'Only proven uncommitted race files may need reconciliation',
      );
    });
    let releaseDisable!: () => void, disabledReady!: () => void;
    const disableReady = new Promise<void>((resolve) => {
      disabledReady = resolve;
    });
    const allowDisableCommit = new Promise<void>((resolve) => {
      releaseDisable = resolve;
    });
    const disableProxy = new Proxy(database, {
      get(target, key) {
        if (key === '$transaction')
          return (...args: unknown[]) => {
            const work = args[0] as (tx: unknown) => Promise<unknown>;
            args[0] = async (tx: unknown) => {
              const result = await work(tx);
              disabledReady();
              await allowDisableCommit;
              return result;
            };
            return Reflect.apply(target.$transaction, target, args);
          };
        return Reflect.get(target, key);
      },
    }) as PrismaClient;
    const sessionInput = await input(ids.empty, uploads[1]);
    const sessionBefore = await rowCounts();
    const disable = disableManagedAccount(
      Number(admin.user.id),
      {
        accountId: Number(assistant.user.id),
        expectedSessionVersion: assistant.user.sessionVersion,
      },
      { database: disableProxy, auditMetadata: createMaintenanceAuditMetadata() },
    );
    await Promise.race([
      disableReady,
      disable.then(() => {
        throw new Error('Disable finished without reaching the controlled boundary');
      }),
    ]);
    const sessionSave = mutateLogo(assistant, 'update', sessionInput, dependencies).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    try {
      let waiting = false;
      for (let i = 0; i < 80; i++) {
        waiting = await inspect(
          async (probe) =>
            (
              await probe.query(
                "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%public.client_logo_mutate%') waiting",
              )
            ).rows[0].waiting,
        );
        if (waiting) break;
        await new Promise((res) => setTimeout(res, 25));
      }
      assert.ok(waiting, 'Logo request waited on real actor/session lock');
    } finally {
      releaseDisable();
      await disable;
    }
    assert.ok('error' in (await sessionSave));
    assert.deepEqual(await rowCounts(), sessionBefore);
    await assert.rejects(readLogoManagement(assistant, ids.empty, 1, null, database));
    pass(
      'Actual account-disable/session race rejects an already-started save and subsequent reads without logo/audit changes',
    );
    // A stale concurrent save can leave a fully written but unreferenced file.
    // Integrity reports it; never delete by guessing whether SQL committed.
    const finalState = await readLogoManagement(admin, ids.empty, 1, null, database);
    const selected = finalState.current!;
    const selectedPath = join(root, selected.relative_path);
    const bytes = await readFile(selectedPath);
    await writeFile(selectedPath, Buffer.from('TEST CORRUPTION'));
    assert.equal(await readClientLogoFile(admin, root, logoMetadata(selected)), null);
    await inspect(async (db) =>
      assert.ok(
        (await reconcileClientLogos(db, { logoRoot: root })).defects.some((d) =>
          d.includes('retained logo'),
        ),
      ),
    );
    await writeFile(selectedPath, bytes);
    assert.ok(await readClientLogoFile(admin, root, logoMetadata(selected)));
    await unlink(selectedPath);
    try {
      assert.equal(await readClientLogoFile(admin, root, logoMetadata(selected)), null);
      await assert.rejects(
        mutateLogo(admin, 'restore', await input(ids.empty, undefined, selected.id), dependencies),
      );
      await inspect(async (db) =>
        assert.ok(
          (await reconcileClientLogos(db, { logoRoot: root })).defects.some((d) =>
            d.includes('retained logo'),
          ),
        ),
      );
    } finally {
      await writeFile(selectedPath, bytes);
    }
    await inspect(async (db) => {
      await assertClientLogoBoundary(db);
      for (const sql of [
        'UPDATE client_logo_versions SET sha256=sha256',
        'DELETE FROM client_logo_submissions',
        'TRUNCATE client_logo_versions',
      ])
        await assert.rejects(db.query(sql));
      await db.query('BEGIN');
      try {
        await db.query(
          'ALTER TABLE client_logo_versions DISABLE TRIGGER client_logo_version_immutable',
        );
        await db.query(
          "UPDATE client_logo_versions SET original_name='TEST ONLY tampered evidence' WHERE id=$1",
          [selected.id],
        );
        await assert.rejects(assertClientLogoBoundary(db));
      } finally {
        await db.query('ROLLBACK');
      }
      await assertClientLogoBoundary(db);
      const unattributed = await db.query(
        "SELECT e.id FROM audit_events e JOIN audit_actors a ON a.id=e.actor_id WHERE e.entity_table='client_logos' AND a.actor_kind<>'human'",
      );
      assert.deepEqual(unattributed.rows, []);
    });
    const beforeRetired = await rowCounts();
    await assert.rejects(
      runClientLogoTransform({
        databaseUrl: fixture.migrationUrl,
        logoRoot: root,
        apply: true,
        enforceApprovedBaselines: false,
      }),
      /retired after operational logo history/u,
    );
    await inspect(async (db) => {
      try {
        await assert.rejects(
          db.query(readFileSync('sql/transform-clients-contacts.sql', 'utf8')),
          /legacy delete-and-rebuild is prohibited/u,
        );
      } finally {
        await db.query('ROLLBACK');
      }
    });
    assert.deepEqual(await rowCounts(), beforeRetired);
    pass('Obsolete logo and client transforms fail before writes on complete operational boundary');
    pass(
      'Integrity accounts for all retained versions and detects corruption; task-owned backup bytes restore exact readability',
    );
  } finally {
    await database.$disconnect();
    const actual = await realpath(root),
      parent = await realpath(tmpdir());
    assert.ok(actual.startsWith(parent + sep));
    assert.match(relative(parent, actual), /^litigation-task41a-logos-[A-Za-z0-9]+$/u);
    await rm(actual, { recursive: true });
    await writeFile(
      join(output, 'mutation-evidence.json'),
      JSON.stringify({ evidence, ownedLogoRoot: root, removed: true }, null, 2),
    );
  }
  return evidence.length;
}
