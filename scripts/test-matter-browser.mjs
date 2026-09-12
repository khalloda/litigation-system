import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  readdirSync,
  statSync,
  readFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import {
  withApprovedMigrationClient,
  createApprovedMigrationPrismaClient,
} from './lib/migration-principal.ts';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture.ts';
import { createDatabaseClient } from '../src/lib/db.ts';
import { readLogoMetadata } from '../src/lib/client-query.ts';
import { setApprovedAccountPassword, changeOwnPassword } from '../src/lib/auth/service.ts';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata.ts';
import {
  readMatters,
  readMatter,
  matterListHref,
  parseMatterFilters,
} from '../src/lib/matter-query.ts';
import { setMatterClientArchive, matterViewer } from './test-matter-read-only.ts';
import { t } from '../src/strings.ts';
import {
  staffZoomExtension,
  proveStaffBrowserZoom,
  staffAccessibilityTree,
  staffComputedTargets,
  staffFocusProof,
} from './lib/staff-accessibility-browser.mjs';

export async function proveMatterBrowser(fixture, output, cases) {
  const source = process.cwd();
  const inspect = (work) =>
    withApprovedMigrationClient(work, { databaseUrl: fixture.migrationUrl });
  await inspect((db) =>
    assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment),
  );
  assert.ok(process.env.STAFF_PLAYWRIGHT_MODULE && process.env.STAFF_CHROMIUM_EXECUTABLE);
  const { chromium } = await import(
    pathToFileURL(resolve(process.env.STAFF_PLAYWRIGHT_MODULE)).href
  );
  const axe = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
  const parent = resolve(dirname(source), 'litigation-client-builds');
  const mirror = mkdtempSync(join(parent, 'task42-'));
  const dependencyLink = join(mirror, 'node_modules');
  const evidence = [],
    commands = [],
    remoteRequests = [];
  let server, context, page, port;
  const runtime = createDatabaseClient(fixture.runtimeUrl);
  const environment = {
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
    NODE_ENV: 'production',
    DATABASE_URL: fixture.runtimeUrl,
    AUTH_SECRET: randomBytes(48).toString('base64url'),
    CLIENT_LOGO_ROOT: join(mirror, 'client-logos'),
    NEXT_TELEMETRY_DISABLED: '1',
  };
  const boundedRuntime = new URL(environment.DATABASE_URL);
  boundedRuntime.searchParams.set('options', '-c statement_timeout=8000');
  environment.DATABASE_URL = boundedRuntime.toString();
  const launch = (args, env = environment) => {
    const child = spawn(process.execPath, args, {
      cwd: mirror,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (b) => {
      log += b;
    });
    child.stderr.on('data', (b) => {
      log += b;
    });
    const done = new Promise((res, rej) => {
      child.once('exit', res);
      child.once('error', rej);
    });
    return { child, done, log: () => log.replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]') };
  };
  // Shared installed packages are read inputs only. Build caches/generated
  // outputs reside in the task mirror; compare every dependency file's metadata.
  function dependencyState() {
    const entries = [];
    function walk(path) {
      for (const e of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        const p = join(path, e.name);
        if (e.isDirectory()) walk(p);
        else {
          const s = statSync(p);
          entries.push([p, s.size, s.mtimeMs]);
        }
      }
    }
    walk(join(source, 'node_modules'));
    return entries;
  }
  const dependenciesBefore = dependencyState();
  try {
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: source,
      encoding: 'utf8',
      windowsHide: true,
    })
      .trim()
      .split('\n');
    for (const file of new Set(files)) {
      assert.ok(!file.startsWith('..'));
      const dest = join(mirror, file);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(source, file), dest);
    }
    writeFileSync(
      join(output, 'build-source.json'),
      JSON.stringify(
        [...new Set(files)].map((file) => ({
          path: file,
          sha256: createHash('sha256')
            .update(readFileSync(join(mirror, file)))
            .digest('hex'),
        })),
        null,
        2,
      ),
    );
    cpSync(join(source, 'src/generated'), join(mirror, 'src/generated'), { recursive: true });
    symlinkSync(join(source, 'node_modules'), dependencyLink, 'junction');
    cpSync(process.env.CLIENT_LOGO_ROOT, environment.CLIENT_LOGO_ROOT, { recursive: true });
    const build = launch(['node_modules/next/dist/bin/next', 'build', '--webpack']);
    const exit = await build.done;
    writeFileSync(join(output, 'production-build.log'), build.log());
    commands.push({ name: 'production-build', exit });
    assert.equal(exit, 0, 'Production build failed; see retained log');
    console.log('PASS isolated production build');
    const accounts = [];
    const owner = await createApprovedMigrationPrismaClient(fixture.migrationUrl);
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
        const a = await owner.userAccount.findUniqueOrThrow({ where: { id: row.id } });
        assert.equal(
          await changeOwnPassword(
            {
              accountId: row.id,
              sessionVersion: a.sessionVersion,
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
      await owner.$disconnect();
    }
    const listener = createServer();
    await new Promise((res) => listener.listen(0, '127.0.0.1', res));
    port = listener.address().port;
    await new Promise((res) => listener.close(res));
    const base = `http://localhost:${port}`;
    server = launch([
      'node_modules/next/dist/bin/next',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ]);
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/login')).ok) break;
      } catch {}
      await new Promise((res) => setTimeout(res, 200));
      if (i === 99) throw new Error('Listener not ready');
    }
    const extension = staffZoomExtension(mirror),
      browserEnv = { ...environment };
    delete browserEnv.DATABASE_URL;
    delete browserEnv.AUTH_SECRET;
    context = await chromium.launchPersistentContext(join(mirror, 'browser-profile'), {
      headless: true,
      executablePath: process.env.STAFF_CHROMIUM_EXECUTABLE,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
      viewport: { width: 1440, height: 1000 },
      env: browserEnv,
    });
    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.origin === base || u.origin === `http://127.0.0.1:${port}`) return route.continue();
      remoteRequests.push(u.origin);
      return route.abort();
    });
    page = await context.newPage();
    const goto = (path) =>
      page.goto(path.startsWith('http') ? path : base + path, { waitUntil: 'networkidle' });
    const screenshot = async (name) => {
      if ((await page.evaluate(() => devicePixelRatio)) !== 1) {
        const cdp = await context.newCDPSession(page);
        try {
          const { contentSize } = await cdp.send('Page.getLayoutMetrics');
          const { data } = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: true,
            clip: { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 },
          });
          const png = Buffer.from(data, 'base64');
          assert.equal(
            png.readUInt32BE(16),
            Math.ceil(contentSize.width),
            'complete zoom capture width',
          );
          assert.equal(
            png.readUInt32BE(20),
            Math.ceil(contentSize.height),
            'complete zoom capture height',
          );
          writeFileSync(join(output, name + '.png'), png);
          writeFileSync(
            join(output, name + '-capture.json'),
            JSON.stringify(
              {
                contentSize,
                pixels: { width: png.readUInt32BE(16), height: png.readUInt32BE(20) },
              },
              null,
              2,
            ),
          );
        } finally {
          await cdp.detach();
        }
        return;
      }
      await page.screenshot({ path: join(output, name + '.png'), fullPage: true });
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
      evidence.push({
        name,
        violations,
        width: await page.evaluate(() => innerWidth),
        targets: await staffComputedTargets(page),
      });
      writeFileSync(join(output, 'browser-results.json'), JSON.stringify(evidence, null, 2));
      assert.deepEqual(violations, [], name);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        name + ' reflow',
      );
      await staffAccessibilityTree(context, page);
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    };
    const login = async (account) => {
      await context.clearCookies();
      await goto('/login');
      await page.getByLabel(t.auth.username, { exact: true }).fill(account.username);
      await page.getByLabel(t.auth.password, { exact: true }).fill(account.password);
      await page.getByRole('button', { name: t.auth.submit, exact: true }).click();
      await page.waitForURL(base + '/');
    };
    const browserSet = async (client) => {
      const expected = [];
      let current = await readMatters(matterViewer('Lawyer'), { client: String(client) }, runtime);
      for (let p = 1; p <= current.pages; p++) {
        current = await readMatters(
          matterViewer('Lawyer'),
          { client: String(client), page: String(p) },
          runtime,
        );
        await goto(matterListHref(current.filters));
        const ids = await page
          .locator('li[data-matter-id]')
          .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.matterId)));
        assert.deepEqual(
          ids,
          current.rows.map((r) => r.id),
        );
        for (const row of current.rows) {
          const item = page.locator(`li[data-matter-id="${row.id}"]`);
          // innerText normalizes rendered whitespace. Verify the actual text
          // nodes so source line breaks and leading/trailing spaces are tested.
          const htmlText = (value) => value.replace(/\r\n|\r/g, '\n');
          assert.equal(
            await item.locator('h3 bdi').textContent(),
            htmlText(row.caseNumber?.trim() ? row.caseNumber : t.common.notRecorded),
            `Matter ${row.id} case number text`,
          );
          assert.equal(
            await item.locator(':scope > div').first().locator(':scope > p').textContent(),
            htmlText(row.subject ?? ''),
            `Matter ${row.id} subject text`,
          );
        }
        expected.push(...ids);
      }
      return expected;
    };
    await goto('/matters');
    assert.ok(page.url().includes('/login'));
    await goto(`/matters/${cases.multilineId}`);
    assert.ok(page.url().includes('/login'));
    evidence.push({ name: 'Unauthenticated direct list and detail denied' });
    if (!process.argv.includes('--browser-accessibility-only')) {
      for (const account of accounts) {
        await login(account);
        await page.getByRole('link', { name: t.nav.matters, exact: true }).click();
        await page.waitForURL(base + '/matters');
        await audit(account.roleCode + ' list');
        await goto(`/matters/${cases.multilineId}`);
        const detail = await readMatter(
          matterViewer(account.roleCode),
          String(cases.multilineId),
          runtime,
        );
        assert.equal(
          await page.locator('h1 bdi').count(),
          detail.caseNumber.split(/\r\n|\n|\r/u).length,
        );
        assert.equal(await page.locator('button').count(), 0);
        await audit(account.roleCode + ' multiline detail');
        for (const target of cases.targets) {
          const original = await browserSet(target.id);
          assert.equal(original.length, target.matters);
          for (const archived of [true, false]) {
            await setMatterClientArchive(fixture, target.id, archived);
            assert.deepEqual(await browserSet(target.id), original);
            await goto(`/matters/${original[0]}`);
            assert.equal(
              await page.getByText(t.clients.archivedNotice, { exact: true }).count(),
              archived ? 1 : 0,
            );
            await page
              .getByRole('link')
              .filter({
                hasText: (
                  await readMatter(matterViewer(account.roleCode), String(original[0]), runtime)
                ).clientName,
              })
              .click();
            await page.waitForURL((url) => url.pathname === `/clients/${target.id}`, {
              waitUntil: 'networkidle',
            });
            await page
              .getByRole('heading', {
                level: 1,
                name: (
                  await readMatter(matterViewer(account.roleCode), String(original[0]), runtime)
                ).clientName,
                exact: true,
              })
              .waitFor();
            assert.equal(
              await page.getByText(t.clients.archivedNotice, { exact: true }).count(),
              archived ? 1 : 0,
            );
            const logoMetadata = await readLogoMetadata(
              matterViewer(account.roleCode),
              String(target.id),
              runtime,
            );
            const logoResponse = await context.request.get(base + `/clients/${target.id}/logo`);
            if (!logoMetadata) assert.equal(logoResponse.status(), 404);
            else {
              assert.equal(logoResponse.status(), 200);
              const bytes = await logoResponse.body();
              assert.equal(bytes.length, logoMetadata.byteSize);
              assert.equal(createHash('sha256').update(bytes).digest('hex'), logoMetadata.sha256);
            }
            evidence.push({
              name: account.roleCode + ' client logo regression',
              clientId: target.id,
              archived,
              status: logoResponse.status(),
            });
            await audit(
              account.roleCode +
                ' client ' +
                target.id +
                ' ' +
                (archived ? 'archived' : 'restored'),
            );
          }
          evidence.push({
            name: account.roleCode + ' new browser archive integration',
            clientId: target.id,
            count: original.length,
            ids: original,
          });
          console.log(
            `PASS browser ${account.roleCode}: client ${target.id}, ${original.length} matters active/archive/restored`,
          );
        }
      }
      await login(accounts.find((a) => a.roleCode === 'Lawyer'));
      const filter = { client: String(cases.targets[1].id), page: '2' };
      const href = matterListHref(parseMatterFilters(filter));
      await goto(href);
      await page.locator('li[data-matter-id] h3 a').first().click();
      await page.waitForURL(/\/matters\/\d+\?/);
      const detailReturn = page.url();
      await page.locator('main dl a[href^="/clients/"]').click();
      await page.waitForURL((url) => url.pathname.startsWith('/clients/'), {
        waitUntil: 'networkidle',
      });
      await page.getByRole('link', { name: t.matters.back, exact: true }).click();
      await page.waitForURL(detailReturn, { waitUntil: 'networkidle' });
      await page.getByRole('link', { name: t.matters.back, exact: true }).click();
      await page.waitForURL(base + href);
      assert.equal(new URL(page.url()).searchParams.get('page'), '2');
      await page.getByRole('link', { name: t.clients.next, exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get('page') === '3');
      assert.equal(new URL(page.url()).searchParams.get('page'), '3');
      await page.getByRole('link', { name: t.clients.previous, exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get('page') === '2');
      assert.equal(new URL(page.url()).searchParams.get('page'), '2');
      await goto(
        `/clients/${cases.targets[0].id}?status=Active&archive=all&q=JTI&page=2&contactsPage=1`,
      );
      await page.getByRole('link', { name: t.matters.clientMatters, exact: true }).click();
      await page.waitForURL(/\/matters\?/);
      const fromClient = new URL(page.url()).searchParams.get('fromClient');
      assert.ok(fromClient.includes('page=2'));
      await page.getByRole('link', { name: t.clients.backClient, exact: true }).click();
      await page.waitForURL(base + fromClient);
      assert.equal(page.url(), base + fromClient);
    } else await login(accounts.find((a) => a.roleCode === 'Lawyer'));
    await goto('/matters?q=' + encodeURIComponent('احمد'));
    assert.ok(await page.getByText(t.matters.searchIncludes, { exact: true }).count());
    await audit('alias search');
    await screenshot('matter-alias-search');
    await goto('/matters?q=__NO_SUCH_MATTER__');
    await audit('no results');
    await screenshot('matter-empty');
    await goto('/matters?page=0');
    await audit('invalid filters');
    assert.equal(
      await page.locator('main [role="alert"]').evaluate((el) => el === document.activeElement),
      true,
    );
    await goto('/matters/2147483647');
    await audit('not found');
    await goto('/matters?lawyer=missing');
    assert.equal(await page.getByText(t.matters.noLawyer, { exact: true }).count(), 26);
    await audit('unassigned list');
    for (const [name, path] of [
      ['list', '/matters'],
      ['detail', `/matters/${cases.complexId}`],
      ['multiline', `/matters/${cases.multilineId}`],
    ]) {
      await goto(path);
      if (name === 'multiline') {
        const lines = await page.locator('h1 bdi').evaluateAll((nodes) =>
          nodes.map((n) => ({
            text: n.textContent,
            font: parseFloat(getComputedStyle(n).fontSize),
          })),
        );
        const nonblank = lines.filter((l) => l.text.trim());
        assert.ok(nonblank.length > 1);
        assert.ok(nonblank[0].font > nonblank[1].font, 'first visible case number must be larger');
        evidence.push({ name: 'two visible case lines retain descending size', lines });
      }
      await screenshot('matter-' + name + '-desktop');
      await page.keyboard.press('Tab');
      evidence.push({ name: name + ' keyboard focus', proof: await staffFocusProof(page) });
      await audit(name + ' keyboard focus');
      await page.setViewportSize({ width: 320, height: 900 });
      await audit(name + ' 320 CSS pixels');
      await screenshot('matter-' + name + '-320');
      await page.setViewportSize({ width: 1440, height: 1000 });
      await proveStaffBrowserZoom({
        context,
        page,
        audit,
        screenshot,
        evidence,
        name: 'matter-' + name,
      });
    }
    // Controlled lock exists only in the positively identified owned cluster.
    // It creates a genuine server query timeout without altering schema/grants.
    let unlock, locked;
    const held = new Promise((res) => {
      locked = res;
    });
    const release = new Promise((res) => {
      unlock = res;
    });
    const blocker = inspect(async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      await db.query('BEGIN');
      try {
        await db.query('LOCK TABLE matters IN ACCESS EXCLUSIVE MODE');
        locked();
        await release;
      } finally {
        await db.query('ROLLBACK');
      }
    });
    await held;
    try {
      const navigation = page.goto(base + '/matters?q=timeout-proof', {
        waitUntil: 'domcontentloaded',
      });
      await page.getByText(t.common.loading, { exact: true }).waitFor();
      await audit('loading status');
      await screenshot('matter-loading');
      await navigation;
      await page.getByText(t.clients.loadError, { exact: true }).waitFor({ timeout: 30000 });
      await audit('genuine server query failure');
      await screenshot('matter-query-error');
    } finally {
      unlock();
      await blocker;
    }
    await page.getByRole('button', { name: t.clients.retry, exact: true }).click();
    await page.getByText(t.matters.empty, { exact: true }).waitFor();
    await audit('query failure retry recovered');
    const cookies = await context.cookies();
    await context.addCookies(
      cookies.map((cookie) => ({ ...cookie, expires: Math.floor(Date.now() / 1000) - 60 })),
    );
    await goto(`/matters/${cases.complexId}`);
    assert.ok(page.url().includes('/login'));
    evidence.push({ name: 'Expired session cookie cannot access direct matter detail' });
    assert.deepEqual(remoteRequests, []);
    writeFileSync(join(output, 'browser-results.json'), JSON.stringify(evidence, null, 2));
    console.log(
      process.argv.includes('--browser-accessibility-only')
        ? 'PASS remaining matter accessibility, states and capture proof; role/archive integration retained from the full browser run'
        : 'PASS matter browser interactions and archive integration',
    );
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {});
      writeFileSync(
        join(output, 'failure-state.json'),
        JSON.stringify(
          {
            url: new URL(page.url()).pathname,
            text: await page
              .locator('body')
              .innerText()
              .catch(() => 'Unavailable'),
          },
          null,
          2,
        ),
      );
    }
    throw error;
  } finally {
    if (context) await context.close();
    if (server) {
      server.child.kill();
      await server.done;
      writeFileSync(join(output, 'server.log'), server.log());
      const probe = createServer();
      await new Promise((res, rej) => {
        probe.once('error', rej);
        probe.listen(port, '127.0.0.1', res);
      });
      await new Promise((res) => probe.close(res));
    }
    await runtime.$disconnect();
    assert.deepEqual(
      dependencyState(),
      dependenciesBefore,
      'Shared installed dependencies changed',
    );
    if (existsSync(dependencyLink)) {
      assert.equal(realpathSync(dependencyLink), realpathSync(join(source, 'node_modules')));
      unlinkSync(dependencyLink);
    }
    assert.ok(realpathSync(mirror).startsWith(realpathSync(parent) + sep));
    assert.match(mirror.slice(parent.length + 1), /^task42-[A-Za-z0-9]+$/u);
    rmSync(mirror, { recursive: true });
    writeFileSync(
      join(output, 'browser-cleanup.json'),
      JSON.stringify(
        {
          mirror,
          removed: !existsSync(mirror),
          listenerStopped:
            !server || server.child.exitCode !== null || server.child.signalCode !== null,
          portReusable: true,
          dependenciesUnchanged: true,
          dependencyFiles: dependenciesBefore.length,
          commands,
          remoteRequests,
        },
        null,
        2,
      ),
    );
  }
}
