import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
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
} from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { withIsolatedPostgres } from './lib/isolated-postgres-fixture.ts';
import {
  withApprovedMigrationClient,
  createApprovedMigrationPrismaClient,
} from './lib/migration-principal.ts';
import { staffReadOnlyState } from './lib/staff-read-only-state.ts';
import { createDatabaseClient } from '../src/lib/db.ts';
import {
  setApprovedAccountPassword,
  authenticateCredentials,
  changeOwnPassword,
} from '../src/lib/auth/service.ts';
import {
  createMaintenanceAuditMetadata,
  createRequestAuditMetadata,
} from '../src/lib/audit-metadata.ts';
import { t } from '../src/strings.ts';
import { proveStaffMutationBrowser } from './lib/staff-mutation-browser.mjs';
import { proveStaffInteractions } from './lib/staff-interaction-browser.mjs';
import {
  staffZoomExtension,
  proveStaffBrowserZoom,
  staffAccessibilityTree,
  staffComputedTargets,
} from './lib/staff-accessibility-browser.mjs';

const root = process.cwd();
const output = resolve(process.env.STAFF_EVIDENCE_DIR ?? 'test-results/staff');
const playwrightModule = process.env.STAFF_PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(
  playwrightModule.startsWith('.') || /^[A-Za-z]:/u.test(playwrightModule)
    ? pathToFileURL(resolve(playwrightModule)).href
    : playwrightModule
);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
mkdirSync(output, { recursive: true });
const preservation = await withApprovedMigrationClient(staffReadOnlyState, {
  clientConfig: { options: '-c default_transaction_read_only=on' },
});

function launch(args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (data) => {
    logs += data.toString();
  });
  child.stderr.on('data', (data) => {
    logs += data.toString();
  });
  const done = new Promise((res, rej) => {
    child.once('error', rej);
    child.once('exit', (code) => res(code));
  });
  return { child, done, logs: () => logs };
}
async function freePort() {
  const server = createServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  await new Promise((res) => server.close(res));
  return port;
}
await withIsolatedPostgres(async (fixture) => {
  await fixture.restoreProject();
  const adminDb = await createApprovedMigrationPrismaClient(fixture.migrationUrl);
  const runtime = createDatabaseClient(fixture.runtimeUrl);
  const accounts = [];
  try {
    const existing = await adminDb.userAccount.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, username: true, roleCode: true, personId: true },
    });
    assert.equal(existing.length, 4);
    for (const account of existing) {
      const temporary = 'T ' + randomBytes(24).toString('base64url');
      const password = 'P ' + randomBytes(24).toString('base64url');
      await setApprovedAccountPassword(account.username, temporary, {
        database: adminDb,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      const actor = await authenticateCredentials(
        { username: account.username, password: temporary },
        {
          database: runtime,
          auditMetadata: createRequestAuditMetadata(
            new Request('http://localhost/staff-browser-fixture'),
          ),
        },
      );
      assert.ok(actor);
      assert.equal(
        await changeOwnPassword(
          {
            accountId: account.id,
            sessionVersion: actor.sessionVersion,
            currentPassword: temporary,
            newPassword: password,
          },
          { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
        ),
        'changed',
      );
      accounts.push({ ...account, password });
    }
  } finally {
    await runtime.$disconnect();
    await adminDb.$disconnect();
  }

  // Keep the mirror on the dependency drive: Next's Windows webpack entries
  // cannot be relative across drives. Run source checks after mirror cleanup.
  const buildRoot = resolve(root, 'build/litigation-staff-builds');
  mkdirSync(buildRoot, { recursive: true });
  const mirror = mkdtempSync(join(buildRoot, 'staff-browser-'));
  assert.ok(realpathSync(mirror).startsWith(realpathSync(buildRoot) + sep));
  const dependencyLink = join(mirror, 'node_modules');
  let next;
  let browser;
  try {
    for (const file of [
      'src',
      'public',
      'assets',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'next.config.ts',
    ])
      cpSync(join(root, file), join(mirror, file), { recursive: true });
    symlinkSync(join(root, 'node_modules'), dependencyLink, 'junction');
    const environment = {
      ...fixture.environment,
      NODE_ENV: 'production',
      AUTH_SECRET: randomBytes(48).toString('base64url'),
      NEXT_TELEMETRY_DISABLED: '1',
    };
    delete environment.MIGRATION_DATABASE_URL;
    delete environment.POSTGRES_PASSWORD;
    delete environment.AUTH_URL;
    delete environment.NEXTAUTH_URL;
    // No source .env is copied. The production process receives only the
    // generated isolated runtime credential and secret, never an admin URL.
    const build = launch(
      [join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'],
      mirror,
      environment,
    );
    assert.equal(await build.done, 0, build.logs());
    writeFileSync(join(output, 'production-build.log'), build.logs());
    console.log(
      'PASS production build in isolated mirror; no project .next or credential file changed',
    );
    const port = await freePort();
    const base = `http://localhost:${port}`;
    next = launch(
      [
        join(root, 'node_modules/next/dist/bin/next'),
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      mirror,
      environment,
    );
    for (let i = 0; i < 100; i++) {
      if (next.child.exitCode !== null) throw new Error('isolated Next server exited');
      try {
        if ((await fetch(base + '/login')).ok) break;
      } catch {}
      await new Promise((res) => setTimeout(res, 200));
      if (i === 99) throw new Error('isolated Next server readiness failed');
    }
    const extension = staffZoomExtension(mirror);
    const browserEnvironment = { ...process.env };
    for (const key of Object.keys(browserEnvironment))
      if (/PASSWORD|TOKEN|SECRET|API_KEY|DATABASE_URL/iu.test(key)) delete browserEnvironment[key];
    const context = await chromium.launchPersistentContext(join(mirror, 'browser-profile'), {
      headless: true,
      executablePath: process.env.STAFF_CHROMIUM_EXECUTABLE,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      env: browserEnvironment,
    });
    browser = context.browser();
    const evidence = [];
    const remoteRequests = [];
    writeFileSync(
      join(output, 'application-isolation.json'),
      JSON.stringify(
        {
          process: next.child.pid,
          base,
          container: fixture.container,
          databaseCluster: fixture.clusterId,
          projectCluster: fixture.sourceClusterId,
          runtimeHost: new URL(environment.DATABASE_URL).hostname,
          runtimePort: new URL(environment.DATABASE_URL).port,
          runtimePrincipal: new URL(environment.DATABASE_URL).username,
          migrationCredentialPresent: Object.hasOwn(environment, 'MIGRATION_DATABASE_URL'),
          sourceEnvironmentCopied: false,
        },
        null,
        2,
      ),
    );
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
      remoteRequests.push(url.origin);
      return route.abort();
    });
    const page = await context.newPage();
    // App Router can return its loading shell before the streamed form exists.
    // Wait for local navigation to settle before asserting keyboard/DOM state.
    const goto = (url) => page.goto(url, { waitUntil: 'networkidle' });
    const screenshot = async (name) => {
      const fullPage = (await page.getByRole('dialog').count()) === 0;
      if ((await page.evaluate(() => devicePixelRatio)) !== 1) {
        // Playwright's configured DPR remains 1 during true Chrome tab zoom.
        // Capture the live CDP surface without its emulation/clip adjustments.
        const cdp = await context.newCDPSession(page);
        try {
          const layout = await cdp.send('Page.getLayoutMetrics');
          // captureScreenshot's clip uses device-independent surface pixels;
          // CSS metrics are smaller by the real tab-zoom factor.
          const area = fullPage
            ? layout.contentSize
            : {
                x: layout.visualViewport.pageX,
                y: layout.visualViewport.pageY,
                width: layout.visualViewport.clientWidth,
                height: layout.visualViewport.clientHeight,
              };
          const { data } = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: fullPage,
            ...(fullPage ? { clip: { ...area, scale: 1 } } : {}),
          });
          const png = Buffer.from(data, 'base64');
          assert.equal(png.readUInt32BE(16), Math.ceil(area.width), 'zoom capture width');
          assert.equal(png.readUInt32BE(20), Math.ceil(area.height), 'zoom capture height');
          writeFileSync(join(output, name + '.png'), png);
          writeFileSync(
            join(output, name + '-capture.json'),
            JSON.stringify(
              {
                name,
                area,
                cssViewport: layout.cssVisualViewport,
                pngWidth: png.readUInt32BE(16),
                pngHeight: png.readUInt32BE(20),
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
      await page.screenshot({
        path: join(output, name + '.png'),
        fullPage,
      });
    };
    let auditAttempt = 0;
    const auditSingle = async (name) => {
      auditAttempt++;
      await page.addScriptTag({ path: axePath });
      const results = await page.evaluate(async () =>
        window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        }),
      );
      evidence.push({
        name,
        viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
        targets: await staffComputedTargets(page),
        accessibilityTree: await staffAccessibilityTree(context, page, (tree) =>
          writeFileSync(
            join(output, 'accessibility-tree-' + String(auditAttempt).padStart(3, '0') + '.json'),
            JSON.stringify({ name, tree }, null, 2),
          ),
        ),
        axeViolations: results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
      });
      assert.deepEqual(
        results.violations.map((v) => v.id),
        [],
        name,
      );
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
      assert.deepEqual(
        await page
          .locator('[role="status"], [role="alert"]')
          .evaluateAll((regions) =>
            regions
              .filter((region) => region.closest('[aria-busy="true"]'))
              .map((region) => region.textContent),
          ),
        [],
        'live feedback must not be deferred by a busy ancestor',
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
        name + ' horizontal overflow',
      );
      await screenshot('acceptance-' + String(evidence.length).padStart(3, '0'));
    };
    const audit = async (name, { variants = true } = {}) => {
      await auditSingle(name);
      if (!variants) return;
      const original = page.viewportSize();
      for (const width of [1440, 390, 320]) {
        if (width === original.width) continue;
        await page.setViewportSize({ width, height: 1000 });
        await auditSingle(name + ' reflow ' + width);
      }
      await page.setViewportSize(original);
    };
    const nativeZoom = (name) =>
      proveStaffBrowserZoom({ context, page, audit, screenshot, evidence, name });
    await goto(base + '/staff');
    await page.waitForURL('**/login');
    evidence.push({ name: 'unauthenticated roster', redirect: 'login' });
    const login = async (account) => {
      await context.clearCookies();
      await goto(base + '/login');
      await page.getByLabel(t.auth.username, { exact: true }).fill(account.username);
      await page.getByLabel(t.auth.password, { exact: true }).fill(account.password);
      await page.getByRole('button', { name: t.auth.submit, exact: true }).click();
      await page.waitForURL(base + '/');
      await page.getByRole('link', { name: t.nav.staff, exact: true }).click();
      await page.waitForURL(base + '/staff');
    };
    for (const account of accounts) {
      await login(account);
      await page
        .getByRole('status')
        .filter({ hasText: t.staff.results(23) })
        .waitFor();
      await audit('desktop ' + account.roleCode);
      if (account.roleCode === 'Administrator') await screenshot('roster-desktop');
      const requestSnapshot = await withApprovedMigrationClient(staffReadOnlyState, {
        databaseUrl: fixture.migrationUrl,
      });
      await goto(base + `/staff/${account.personId}`);
      if (account.roleCode === 'Administrator')
        await page.getByRole('heading', { name: t.staff.account, exact: true }).waitFor();
      else {
        assert.equal(
          await page.getByRole('heading', { name: t.staff.account, exact: true }).count(),
          0,
        );
        assert.equal(
          (await page.content()).includes('isEnabled'),
          false,
          'account serialized to non-admin',
        );
      }
      await audit('detail ' + account.roleCode);
      if (account.roleCode === 'Administrator') await screenshot('detail-desktop');
      await goto(base + '/staff?status=all');
      const first = await page
        .locator('#staff-results h3 a')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
      assert.equal(first.length, 25);
      await page.getByRole('link', { name: t.staff.next, exact: true }).click();
      await page.getByText(t.staff.page(2, 3), { exact: true }).waitFor();
      const second = await page
        .locator('#staff-results h3 a')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
      assert.equal(second.length, 25);
      assert.equal(new Set([...first, ...second]).size, 50);
      await page.getByRole('link', { name: t.staff.next, exact: true }).click();
      await page.getByText(t.staff.page(3, 3), { exact: true }).waitFor();
      assert.equal(await page.locator('#staff-results h3 a').count(), 16);
      await goto(base + '/staff');
      await page.getByLabel(t.staff.searchLabel, { exact: true }).fill('احمد');
      await page.getByLabel(t.staff.status, { exact: true }).selectOption('all');
      await page.getByRole('button', { name: t.staff.apply, exact: true }).click();
      await page
        .getByText(/يشمل البحث:/u)
        .first()
        .waitFor();
      await audit('alias search ' + account.roleCode);
      const after = await withApprovedMigrationClient(staffReadOnlyState, {
        databaseUrl: fixture.migrationUrl,
      });
      assert.deepEqual(
        after,
        requestSnapshot,
        'roster navigation wrote audit, session or business state',
      );
      console.log('PASS browser role: ' + account.roleCode);
    }
    const administrator = accounts.find((a) => a.roleCode === 'Administrator');
    await login(administrator);
    // Keyboard order follows the RTL source: skip, home, search, status, team,
    // trainee, submit, clear, then person links. No mouse is used here.
    await goto(base + '/staff');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').textContent(), t.staff.skip);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'staff-results');
    await goto(base + '/staff');
    const focus = [];
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab');
      focus.push(
        await page.locator(':focus').evaluate((el) => ({
          tag: el.tagName,
          id: el.id,
          text: el.textContent,
          outline: getComputedStyle(el).outlineStyle,
        })),
      );
    }
    assert.deepEqual(
      focus.slice(3, 7).map((f) => f.id),
      ['staff-search', 'staff-status', 'staff-team', 'staff-trainee'],
    );
    assert.ok(focus.every((f) => f.outline !== 'none'));
    await screenshot('keyboard-focus');
    evidence.push({ name: 'keyboard and visible focus', focus });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await goto(base + '/staff');
      await audit('roster ' + width);
      await screenshot('roster-' + width);
      await goto(base + `/staff/${administrator.personId}`);
      await audit('detail ' + width);
      await screenshot('detail-' + width);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await goto(base + '/staff');
    await nativeZoom('roster');
    await goto(base + `/staff/${administrator.personId}`);
    await nativeZoom('staff-detail');
    await goto(base + '/staff?q=لا-توجد-نتيجة');
    await page.getByRole('heading', { name: t.common.noResults, exact: true }).waitFor();
    await audit('empty results');
    await screenshot('empty-results');
    await goto(base + '/staff?status=invalid');
    await page.getByRole('alert').filter({ hasText: t.staff.invalidFilters }).waitFor();
    assert.equal(await page.locator(':focus').getAttribute('role'), 'alert');
    await audit('invalid filters');
    await screenshot('invalid-filters');
    const external = await withApprovedMigrationClient(
      async (db) =>
        (await db.query('SELECT id FROM people WHERE NOT is_staff ORDER BY id LIMIT 1')).rows[0].id,
      { databaseUrl: fixture.migrationUrl },
    );
    await goto(base + `/staff/${external}`);
    await page.getByRole('heading', { name: t.staff.notFound, exact: true }).waitFor();
    await audit('external detail denied');
    await screenshot('external-not-found');
    await goto(base + `/staff/${external}/edit`);
    await page.getByRole('heading', { name: t.staff.notFound, exact: true }).waitFor();
    const denied = await goto(base + '/forbidden');
    assert.equal(denied.status(), 403);
    await audit('shared permission denial');
    await screenshot('permission-denied');
    // Withhold one SELECT privilege only in this owned fixture. Authentication
    // remains available so the actual roster error boundary can be exercised.
    await withApprovedMigrationClient(
      async (db) => db.query('REVOKE SELECT ON public.person_name_alias FROM litigation_runtime'),
      { databaseUrl: fixture.migrationUrl },
    );
    try {
      await goto(base + '/staff?q=احمد');
      await page
        .getByRole('alert')
        .filter({ hasText: t.staff.loadError })
        .waitFor({ timeout: 15000 });
      assert.equal(await page.locator(':focus').getAttribute('role'), 'alert');
      await audit('load error');
      await screenshot('load-error');
    } finally {
      await withApprovedMigrationClient(
        async (db) => db.query('GRANT SELECT ON public.person_name_alias TO litigation_runtime'),
        { databaseUrl: fixture.migrationUrl },
      );
    }
    await page.getByRole('button', { name: t.staff.retry, exact: true }).click();
    await page.getByRole('status').waitFor();
    await withApprovedMigrationClient(
      async (db) => {
        await db.query('BEGIN');
        try {
          await db.query('LOCK TABLE public.person_name_alias IN ACCESS EXCLUSIVE MODE');
          await page.goto(base + '/staff?q=احمد', { waitUntil: 'commit' });
          await page.getByRole('status').filter({ hasText: t.common.loading }).waitFor();
          await audit('streaming loading state');
          await screenshot('loading');
        } finally {
          await db.query('ROLLBACK');
        }
      },
      { databaseUrl: fixture.migrationUrl },
    );
    await page.locator('#staff-results').waitFor();
    evidence.push({ name: 'streaming loading and recovered database error', passed: true });
    const capturedActions = new Map();
    const captureAction = (request) => {
      if (request.method() !== 'POST' || !request.headers()['next-action']) return;
      const path = new URL(request.url()).pathname;
      if (!path.startsWith('/staff')) return;
      const key = request.headers()['next-action'];
      if (capturedActions.has(key)) return;
      capturedActions.set(key, {
        request,
        acceptedForAdministrator: false,
        path,
        headers: {
          'next-action': key,
          'content-type': request.headers()['content-type'],
          origin: base,
        },
        data: Buffer.from(request.postDataBuffer()),
      });
    };
    const captureResponse = (response) => {
      const entry = capturedActions.get(response.request().headers()['next-action']);
      if (entry?.request === response.request())
        entry.acceptedForAdministrator = response.status() === 200;
    };
    page.on('request', captureAction);
    page.on('response', captureResponse);
    await proveStaffMutationBrowser({
      page,
      context,
      base,
      fixture,
      accounts,
      login,
      audit,
      screenshot,
      evidence,
      nativeZoom,
    });
    page.off('request', captureAction);
    page.off('response', captureResponse);
    assert.equal(capturedActions.size, 9, 'all nine real staff actions must be captured');
    assert.ok(
      [...capturedActions.values()].every(
        (entry) => entry.acceptedForAdministrator && entry.data.some((byte) => byte !== 0),
      ),
      'every replay must retain a valid action body decoded for the Administrator',
    );
    try {
      for (const account of accounts.filter((item) => item.roleCode !== 'Administrator')) {
        await login(account);
        const before = await withApprovedMigrationClient(staffReadOnlyState, {
          databaseUrl: fixture.migrationUrl,
        });
        for (const action of capturedActions.values()) {
          const response = await context.request.post(base + action.path, {
            headers: action.headers,
            data: action.data,
          });
          assert.ok(response.status() >= 400);
          const body = await response.text();
          for (const protectedField of [
            'nameAr',
            'rowVersion',
            'password_hash',
            'session_version',
            'isEnabled',
          ])
            assert.equal(
              body.includes(protectedField),
              false,
              'denial must not disclose protected state',
            );
        }
        assert.deepEqual(
          await withApprovedMigrationClient(staffReadOnlyState, {
            databaseUrl: fixture.migrationUrl,
          }),
          before,
        );
        evidence.push({
          name: 'all nine crafted staff actions denied ' + account.roleCode,
          denied: 9,
          unchanged: true,
        });
      }
    } finally {
      for (const action of capturedActions.values()) action.data.fill(0);
      capturedActions.clear();
    }
    await proveStaffInteractions({
      page,
      context,
      base,
      fixture,
      accounts,
      login,
      audit,
      screenshot,
      evidence,
    });
    assert.deepEqual(remoteRequests, []);
    for (const name of [
      'roster native zoom contract',
      'staff-detail native zoom contract',
      'staff-create native zoom contract',
      'staff-edit native zoom contract',
      'staff-confirmation native zoom contract',
      'complete staff keyboard workflow',
      'keyboard combined filters and preserved distinct pagination',
      'slow create pending feedback',
      'enabled rapid double activation',
      'unchanged save status',
      'retirement reason validation',
      'restoration reason validation',
      'employment restored while linked account remains disabled',
      'all nine crafted staff actions denied Lawyer',
      'all nine crafted staff actions denied Litigation Assistant',
      'all nine crafted staff actions denied Paralegal',
      'actual old browser session denied after deactivation and after employment-only reactivation',
    ])
      assert.equal(
        evidence.filter((item) => item.name === name).length,
        1,
        'missing or duplicated required proof: ' + name,
      );
    assert.ok(
      evidence.filter((item) => item.axeViolations).length >= 150,
      'complete state audit matrix required',
    );
    writeFileSync(
      join(output, 'browser-evidence.json'),
      JSON.stringify(
        { browser: await browser.version(), evidence, remoteRequests, readOnlyNavigation: true },
        null,
        2,
      ),
    );
    console.log(
      `PASS browser: ${evidence.length} accessibility/state cases; four roles; actual login; RTL desktop/390/320; focus; pagination; search; empty/error/denial; all requests local`,
    );
  } finally {
    if (browser) await browser.close();
    if (next) {
      next.child.kill();
      await next.done;
    }
    assert.equal(realpathSync(dependencyLink), realpathSync(join(root, 'node_modules')));
    unlinkSync(dependencyLink);
    assert.ok(realpathSync(mirror).startsWith(realpathSync(buildRoot) + sep));
    rmSync(mirror, { recursive: true });
    assert.equal(existsSync(mirror), false);
  }
});
assert.deepEqual(
  await withApprovedMigrationClient(staffReadOnlyState, {
    clientConfig: { options: '-c default_transaction_read_only=on' },
  }),
  preservation,
);
console.log('PASS browser/build cleanup and complete project database preservation');
