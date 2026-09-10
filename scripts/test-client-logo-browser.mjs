import assert from 'node:assert/strict';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture.ts';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import sharp from 'sharp';
import {
  createApprovedMigrationPrismaClient,
  withApprovedMigrationClient,
} from './lib/migration-principal.ts';
import { createDatabaseClient } from '../src/lib/db.ts';
import { setApprovedAccountPassword, changeOwnPassword } from '../src/lib/auth/service.ts';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata.ts';
import { disableManagedAccount } from '../src/lib/auth/user-management.ts';
import { t } from '../src/strings.ts';
import {
  staffZoomExtension,
  proveStaffBrowserZoom,
  staffAccessibilityTree,
  staffComputedTargets,
} from './lib/staff-accessibility-browser.mjs';

export async function proveLogoBrowser(fixture, output, { mirror, environment }) {
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment),
    { databaseUrl: fixture.migrationUrl },
  );
  assert.ok(
    process.env.STAFF_PLAYWRIGHT_MODULE && process.env.STAFF_CHROMIUM_EXECUTABLE,
    'Installed full Chromium and Playwright paths required',
  );
  const { chromium } = await import(
    pathToFileURL(resolve(process.env.STAFF_PLAYWRIGHT_MODULE)).href
  );
  const require = createRequire(import.meta.url);
  const axe = require.resolve('axe-core/axe.min.js');
  const owner = await createApprovedMigrationPrismaClient(fixture.migrationUrl),
    runtime = createDatabaseClient(fixture.runtimeUrl);
  const accounts = [];
  try {
    const rows = await owner.userAccount.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, username: true, roleCode: true },
    });
    assert.equal(rows.length, 4);
    for (const row of rows) {
      const temporary = randomBytes(32).toString('base64url'),
        password = randomBytes(32).toString('base64url');
      await setApprovedAccountPassword(row.username, temporary, {
        database: owner,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      const account = await owner.userAccount.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(
        await changeOwnPassword(
          {
            accountId: row.id,
            sessionVersion: account.sessionVersion,
            currentPassword: temporary,
            newPassword: password,
          },
          { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
        ),
        'changed',
      );
      accounts.push({ ...row, password });
    }
  } finally {
    await runtime.$disconnect();
    await owner.$disconnect();
  }
  const inspect = (work) =>
    withApprovedMigrationClient(work, { databaseUrl: fixture.migrationUrl });
  const admin = accounts.find((a) => a.roleCode === 'Administrator');
  const clientId = await inspect(async (db) => {
    await db.query('BEGIN');
    try {
      await db.query('SELECT audit_set_human_context($1)', [admin.id]);
      await db.query(
        "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY logo browser','system')",
        [randomUUID(), randomUUID(), randomUUID()],
      );
      const id = (
        await db.query("SELECT client_contact_create('clients',NULL,$1,$2) id", [
          randomUUID(),
          { name_ar: '__TASK41A_TEST شعار JTI 123', full_name: 'TEST ONLY' },
        ])
      ).rows[0].id;
      await db.query('COMMIT');
      return id;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  });
  const listener = createServer();
  await new Promise((res) => listener.listen(0, '127.0.0.1', res));
  const port = listener.address().port;
  await new Promise((res) => listener.close(res));
  const base = `http://localhost:${port}`;
  const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd: mirror, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  server.stdout.on('data', (data) => {
    log += data;
  });
  server.stderr.on('data', (data) => {
    log += data;
  });
  const done = new Promise((res) => server.once('exit', res));
  let context;
  const evidence = [];
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/login')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((res) => setTimeout(res, 200));
    }
    assert.ok(ready);
    const extension = staffZoomExtension(mirror);
    const browserEnv = { ...process.env };
    for (const key of Object.keys(browserEnv))
      if (/PASSWORD|TOKEN|SECRET|API_KEY|DATABASE_URL/iu.test(key)) delete browserEnv[key];
    context = await chromium.launchPersistentContext(join(mirror, 'logo-browser-profile'), {
      headless: true,
      executablePath: process.env.STAFF_CHROMIUM_EXECUTABLE,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
      viewport: { width: 1440, height: 1000 },
      env: browserEnv,
    });
    const remotes = [];
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
      remotes.push(url.origin);
      return route.abort();
    });
    const page = await context.newPage();
    const goto = (url) => page.goto(url, { waitUntil: 'networkidle' });
    const screenshot = async (name) => {
      if ((await page.evaluate(() => devicePixelRatio)) !== 1) {
        const cdp = await context.newCDPSession(page);
        try {
          const { contentSize } = await cdp.send('Page.getLayoutMetrics');
          const { data } = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
            clip: { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 },
          });
          writeFileSync(join(output, name + '.png'), Buffer.from(data, 'base64'));
        } finally {
          await cdp.detach();
        }
      } else await page.screenshot({ path: join(output, name + '.png'), fullPage: true });
    };
    const audit = async (name) => {
      await page.addScriptTag({ path: axe });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          })
        ).violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        })),
      );
      assert.deepEqual(violations, [], name);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      const targets = await staffComputedTargets(page);
      await staffAccessibilityTree(context, page);
      evidence.push({ name, violations, targets, width: await page.evaluate(() => innerWidth) });
      await screenshot('logo-state-' + evidence.length);
    };
    const login = async (account) => {
      await context.clearCookies();
      await goto(base + '/login');
      await page.getByLabel(t.auth.username, { exact: true }).fill(account.username);
      await page.getByLabel(t.auth.password, { exact: true }).fill(account.password);
      await page.getByRole('button', { name: t.auth.submit, exact: true }).click();
      await page.waitForURL(base + '/');
    };
    const path = `/clients/${clientId}/logo/manage?status=Potential&archive=all&q=JTI&page=2&contactsPage=2`;
    const counts = () =>
      inspect(
        async (db) =>
          (
            await db.query(
              "SELECT (SELECT count(*) FROM client_logo_versions) versions,(SELECT count(*) FROM client_logo_submissions) submissions,(SELECT count(*) FROM audit_events WHERE entity_table='client_logos') events",
            )
          ).rows[0],
      );
    for (const account of accounts) {
      await login(account);
      await goto(base + path);
      const editable = ['Administrator', 'Litigation Assistant'].includes(account.roleCode);
      assert.equal(await page.locator('#logo-file').count(), editable ? 1 : 0);
      assert.equal(
        await page.getByRole('heading', { name: t.logos.history, exact: true }).count(),
        account.roleCode === 'Administrator' ? 1 : 0,
      );
      assert.ok(
        (
          await page.getByRole('link', { name: t.logos.back, exact: true }).getAttribute('href')
        ).includes('contactsPage=2'),
      );
      const backUrl = new URL(
        await page.getByRole('link', { name: t.logos.back, exact: true }).getAttribute('href'),
        base,
      );
      for (const [key, value] of Object.entries({
        status: 'Potential',
        archive: 'all',
        q: 'JTI',
        page: '2',
        contactsPage: '2',
      }))
        assert.equal(backUrl.searchParams.get(key), value);
      await audit(account.roleCode + ' management view');
      for (const route of ['preview', 'upload', 'replace', 'archive', 'restore']) {
        const allowed =
          route === 'preview' || route === 'upload' || route === 'replace'
            ? editable
            : account.roleCode === 'Administrator';
        if (!allowed) {
          const response = await context.request.post(base + `/clients/${clientId}/logo/${route}`, {
            headers: { Origin: base },
            multipart: { version: '0' },
          });
          assert.equal(response.status(), 403);
        }
      }
    }
    await login(admin);
    await goto(base + path);
    const png = await sharp({
      create: {
        width: 1600,
        height: 800,
        channels: 4,
        background: { r: 90, g: 20, b: 140, alpha: 0.6 },
      },
    })
      .png()
      .toBuffer();
    const select = () =>
      page
        .locator('#logo-file')
        .setInputFiles({ name: 'TEST شعار JTI.png', mimeType: 'image/png', buffer: png });
    const before = await counts();
    await select();
    await page.getByRole('button', { name: t.logos.preview, exact: true }).click();
    await page.getByAltText(t.logos.previewAlt, { exact: true }).waitFor();
    await audit('preview before explicit save');
    assert.deepEqual(await counts(), before);
    await page.getByRole('button', { name: t.logos.cancel, exact: true }).click();
    assert.equal(await page.getByAltText(t.logos.previewAlt, { exact: true }).count(), 0);
    assert.deepEqual(await counts(), before);
    await select();
    await page.getByRole('button', { name: t.logos.preview, exact: true }).click();
    await page.getByAltText(t.logos.previewAlt, { exact: true }).waitFor();
    await page.getByRole('button', { name: t.logos.save, exact: true }).click();
    await page.locator('dialog[open]').waitFor();
    await audit('save confirmation client filename context');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await page.locator(':focus').textContent(), t.logos.save);
    await page.getByRole('button', { name: t.logos.save, exact: true }).click();
    await page.getByRole('button', { name: t.logos.confirm, exact: true }).click();
    await page.getByRole('status').filter({ hasText: t.logos.success }).waitFor();
    assert.equal(await page.locator(':focus').getAttribute('role'), 'status');
    const saved = await counts();
    assert.equal(Number(saved.versions) - Number(before.versions), 1);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await context.request.get(base + `/clients/${clientId}/logo`)).status(), 200);
    const head = await context.request.head(base + `/clients/${clientId}/logo`);
    assert.equal(head.status(), 200);
    assert.equal(head.headers()['x-content-type-options'], 'nosniff');
    assert.match(head.headers()['cache-control'], /private/u);
    await page.getByRole('button', { name: t.logos.archive, exact: true }).click();
    await page.getByRole('button', { name: t.logos.confirm, exact: true }).click();
    await page.getByRole('status').filter({ hasText: t.logos.success }).waitFor();
    assert.equal((await context.request.get(base + `/clients/${clientId}/logo`)).status(), 404);
    assert.equal(await page.locator('main header img').count(), 0);
    await audit('archived logo name fallback and recovery');
    await page.getByRole('button', { name: t.logos.restore, exact: true }).click();
    await page.getByRole('button', { name: t.logos.confirm, exact: true }).click();
    await page.getByRole('status').filter({ hasText: t.logos.success }).waitFor();
    assert.equal((await context.request.get(base + `/clients/${clientId}/logo`)).status(), 200);
    const getState = async () =>
      (await context.request.get(base + `/clients/${clientId}/logo/state`)).json();
    const originalVersion = (await getState()).current.id;
    const jpeg = await sharp(png).flatten({ background: '#ffffff' }).jpeg().toBuffer();
    const exactJpeg = Buffer.concat([jpeg, Buffer.alloc(2 * 1024 * 1024 - jpeg.length, 0x20)]);
    for (const [buffer, status] of [
      [exactJpeg, 200],
      [Buffer.concat([exactJpeg, Buffer.from('x')]), 413],
    ]) {
      const response = await context.request.post(base + `/clients/${clientId}/logo/preview`, {
        headers: { Origin: base },
        multipart: { file: { name: 'boundary.jpg', mimeType: 'image/jpeg', buffer } },
      });
      assert.equal(response.status(), status);
    }
    const safeCounts = await counts();
    for (const multipart of [
      { version: '1' },
      { file: '', is_archived: 'true' },
      { file: { name: 'TEST.png', mimeType: 'image/png', buffer: png }, actorId: String(admin.id) },
    ]) {
      assert.equal(
        (
          await context.request.post(base + `/clients/${clientId}/logo/replace`, {
            headers: { Origin: base },
            multipart,
          })
        ).status(),
        400,
      );
    }
    assert.equal(
      (
        await context.request.post(base + `/clients/${clientId}/logo/preview`, {
          headers: { Origin: 'http://untrusted.invalid' },
          multipart: { file: { name: 'TEST.png', mimeType: 'image/png', buffer: png } },
        })
      ).status(),
      400,
    );
    assert.deepEqual(await counts(), safeCounts);
    // Prepare a draft, then make an independent legitimate replacement. The
    // actual stale HTTP response must retain the file/preview until refresh.
    await select();
    await page.getByRole('button', { name: t.logos.preview, exact: true }).click();
    await page.getByAltText(t.logos.previewAlt, { exact: true }).waitFor();
    const prior = await getState();
    assert.equal(
      (
        await context.request.post(base + `/clients/${clientId}/logo/replace`, {
          headers: { Origin: base },
          multipart: {
            version: prior.version,
            clientVersion: prior.clientVersion,
            submission: randomUUID(),
            file: { name: 'TEST replacement.jpg', mimeType: 'image/jpeg', buffer: jpeg },
          },
        })
      ).status(),
      200,
    );
    await page.getByRole('button', { name: t.logos.replace, exact: true }).click();
    await page.getByRole('button', { name: t.logos.confirm, exact: true }).click();
    await page.getByRole('alert').filter({ hasText: t.logos.errors.stale }).waitFor();
    assert.ok(await page.locator('#logo-file').evaluate((e) => e.files.length === 1));
    await audit('stale save retains file and preview');
    await page.getByRole('button', { name: t.logos.reload, exact: true }).click();
    await page.locator('#logo-feedback[role="alert"]').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: t.logos.replace, exact: true }).click();
    await page.getByRole('button', { name: t.logos.confirm, exact: true }).click();
    await page.getByRole('status').filter({ hasText: t.logos.success }).waitFor();
    assert.notEqual((await getState()).current.id, originalVersion);
    const originalRow = page.locator('li').filter({ hasText: originalVersion });
    await originalRow.getByRole('button', { name: t.logos.restore, exact: true }).click();
    await page.locator('dialog[open] img').waitFor();
    await audit('replaced version recovery confirmation');
    await page.getByRole('button', { name: t.logos.confirm, exact: true }).click();
    await page.getByRole('status').filter({ hasText: t.logos.success }).waitFor();
    assert.equal((await getState()).current.id, originalVersion);
    const setParentArchive = async (archived) =>
      inspect(async (db) => {
        await db.query('BEGIN');
        try {
          await db.query('SELECT audit_set_human_context($1)', [admin.id]);
          await db.query(
            "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY parent browser','system')",
            [randomUUID(), randomUUID(), randomUUID()],
          );
          await db.query(
            "SELECT client_contact_set_archived('clients',$1,(SELECT row_version FROM clients WHERE id=$1),$2)",
            [clientId, archived],
          );
          await db.query('COMMIT');
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        }
      });
    await setParentArchive(true);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#logo-file').count(), 0);
    assert.equal(await page.getByRole('button', { name: t.logos.archive, exact: true }).count(), 0);
    assert.equal((await context.request.get(base + `/clients/${clientId}/logo`)).status(), 200);
    const archivedState = await getState();
    for (const route of ['preview', 'upload', 'replace', 'archive', 'restore']) {
      const multipart =
        route === 'preview'
          ? { file: { name: 'TEST.png', mimeType: 'image/png', buffer: png } }
          : {
              version: archivedState.version,
              clientVersion: archivedState.clientVersion,
              submission: randomUUID(),
              ...(route === 'archive' || route === 'restore'
                ? { target: originalVersion }
                : { file: { name: 'TEST.png', mimeType: 'image/png', buffer: png } }),
            };
      assert.equal(
        (
          await context.request.post(base + `/clients/${clientId}/logo/${route}`, {
            headers: { Origin: base },
            multipart,
          })
        ).status(),
        400,
      );
    }
    await audit('archived client stays readable with preserved logo and no mutation controls');
    await setParentArchive(false);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await getState()).version, archivedState.version);
    await page.locator('#logo-file').setInputFiles({
      name: 'bad.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image'),
    });
    await page.getByRole('button', { name: t.logos.preview, exact: true }).click();
    await page.locator('#logo-feedback[role="alert"]').waitFor();
    assert.equal(await page.locator(':focus').getAttribute('role'), 'alert');
    assert.ok(await page.locator('#logo-file').evaluate((e) => e.files.length === 1));
    await audit('validation retains selected file and focuses error');
    assert.equal(await page.locator('#logo-file').getAttribute('aria-invalid'), 'true');
    assert.match(
      await page.locator('#logo-file').getAttribute('aria-describedby'),
      /logo-feedback/u,
    );
    await page.setViewportSize({ width: 320, height: 900 });
    await audit('320 pixel reflow');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await proveStaffBrowserZoom({
      context,
      page,
      audit,
      screenshot,
      evidence,
      name: 'logo management',
    });
    const assistant = accounts.find((account) => account.roleCode === 'Litigation Assistant');
    await login(assistant);
    const assistantVersion = await inspect(
      async (db) =>
        (await db.query('SELECT session_version FROM user_accounts WHERE id=$1', [assistant.id]))
          .rows[0].session_version,
    );
    const disableRuntime = createDatabaseClient(fixture.runtimeUrl);
    try {
      await disableManagedAccount(
        admin.id,
        { accountId: assistant.id, expectedSessionVersion: assistantVersion },
        { database: disableRuntime, auditMetadata: createMaintenanceAuditMetadata() },
      );
    } finally {
      await disableRuntime.$disconnect();
    }
    for (const route of ['state', 'version?id=' + originalVersion])
      assert.ok(
        [401, 403].includes(
          (await context.request.get(base + `/clients/${clientId}/logo/${route}`)).status(),
        ),
      );
    for (const route of ['preview', 'upload', 'replace', 'archive', 'restore'])
      assert.ok(
        [401, 403].includes(
          (
            await context.request.post(base + `/clients/${clientId}/logo/${route}`, {
              headers: { Origin: base },
              multipart: { version: '0' },
            })
          ).status(),
        ),
      );
    await context.clearCookies();
    assert.equal(
      (await context.request.post(base + `/clients/${clientId}/logo/upload`)).status(),
      401,
    );
    assert.deepEqual(remotes, []);
    writeFileSync(
      join(output, 'logo-browser-evidence.json'),
      JSON.stringify(
        {
          evidence,
          remoteRequests: remotes,
          roleCount: 4,
          browser: await context.browser().version(),
          clientId,
        },
        null,
        2,
      ),
    );
  } finally {
    await context?.close();
    server.kill();
    await done;
    writeFileSync(
      join(output, 'logo-server.log'),
      log.replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted database URL]'),
    );
    writeFileSync(
      join(output, 'logo-browser-cleanup.json'),
      JSON.stringify(
        {
          serverPid: server.pid,
          stopped: server.exitCode !== null || server.signalCode !== null,
          browserClosed: true,
        },
        null,
        2,
      ),
    );
  }
}
