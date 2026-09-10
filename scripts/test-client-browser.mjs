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
import { resolve, join, sep, dirname, relative, isAbsolute } from 'node:path';
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
import { setupClientCases } from './test-client-read-only.ts';
import { assertCurrentClientSource } from './lib/client-regression-source.ts';
import { proveClientMutationBrowser } from './lib/client-mutation-browser.mjs';

import {
  staffZoomExtension,
  proveStaffBrowserZoom,
  staffAccessibilityTree,
  staffComputedTargets,
} from './lib/staff-accessibility-browser.mjs';

const root = process.cwd();
assert.ok(process.env.CLIENT_EVIDENCE_DIR, 'Explicit external client evidence directory required');
const output = resolve(process.env.CLIENT_EVIDENCE_DIR);
assert.ok(
  relative(root, output).startsWith('..') || isAbsolute(relative(root, output)),
  'Evidence must remain outside repository',
);
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
  writeFileSync(
    join(output, 'browser-fixture.json'),
    JSON.stringify(
      {
        container: fixture.container,
        cluster: fixture.clusterId,
        sourceCluster: fixture.sourceClusterId,
        port: new URL(fixture.runtimeUrl).port,
        runtimePrincipal: new URL(fixture.runtimeUrl).username,
        cleaned: false,
      },
      null,
      2,
    ),
  );
  await fixture.restoreProject();
  await withApprovedMigrationClient(
    async (db) => assert.equal(await assertCurrentClientSource(db), 62),
    { databaseUrl: fixture.migrationUrl },
  );
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

  const cases = await setupClientCases(fixture);
  const identities = await withApprovedMigrationClient(
    async (db) => ({
      logos: (await db.query('SELECT client_id FROM client_logos ORDER BY client_id')).rows,
      unnamed: (
        await db.query(
          "SELECT id,client_id FROM contacts WHERE contact_name IS NULL OR btrim(contact_name)= '' ORDER BY id",
        )
      ).rows,
      noContacts: (
        await db.query(
          'SELECT c.id FROM clients c WHERE NOT EXISTS (SELECT 1 FROM contacts k WHERE k.client_id=c.id) ORDER BY c.id LIMIT 1',
        )
      ).rows[0],
    }),
    { databaseUrl: fixture.migrationUrl },
  );
  // Keep the mirror on the dependency drive: Next's Windows webpack entries
  // cannot be relative across drives. Run source checks after mirror cleanup.
  const buildRoot = resolve(dirname(root), 'litigation-client-builds');
  mkdirSync(buildRoot, { recursive: true });
  const mirror = mkdtempSync(join(buildRoot, 'client-browser-'));
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
    const copiedLogos = join(mirror, 'client-logos');
    cpSync(process.env.CLIENT_LOGO_ROOT, copiedLogos, { recursive: true });
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
      DATABASE_URL: fixture.runtimeUrl,
      NODE_ENV: 'production',
      CLIENT_LOGO_ROOT: copiedLogos,
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
          coordinatorCredentialPresent: Object.keys(environment).some((key) =>
            key.startsWith('TASK40A_'),
          ),
          mirror,
          copiedLogos,
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
    const goto = (url) => page.goto(url, { waitUntil: 'networkidle' });
    const screenshot = async (name) => {
      if ((await page.evaluate(() => devicePixelRatio)) !== 1) {
        const cdp = await context.newCDPSession(page);
        try {
          // Chrome's native zoom uses device-pixel clip dimensions here.
          // CSS content dimensions silently crop the right half at 200%.
          const { contentSize } = await cdp.send('Page.getLayoutMetrics');
          const { data } = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
            clip: { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 },
          });
          const png = Buffer.from(data, 'base64');
          assert.equal(
            png.readUInt32BE(16),
            contentSize.width,
            'zoom screenshot must include full width',
          );
          writeFileSync(join(output, name + '.png'), png);
        } finally {
          await cdp.detach();
        }
      } else await page.screenshot({ path: join(output, name + '.png'), fullPage: true });
    };
    const audit = async (name) => {
      await page.addScriptTag({ path: axePath });
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
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        name + ' overflow',
      );
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      const targets = await staffComputedTargets(page);
      await staffAccessibilityTree(context, page);
      evidence.push({ name, violations, targets, width: await page.evaluate(() => innerWidth) });
      await screenshot('state-' + String(evidence.length).padStart(3, '0'));
    };
    const login = async (account) => {
      await context.clearCookies();
      await goto(base + '/login');
      await page.getByLabel(t.auth.username, { exact: true }).fill(account.username);
      await page.getByLabel(t.auth.password, { exact: true }).fill(account.password);
      await page.getByRole('button', { name: t.auth.submit, exact: true }).click();
      await page.waitForURL(base + '/');
      await page.getByRole('link', { name: t.nav.clients, exact: true }).click();
      await page.waitForURL(base + '/clients');
      await page.locator('#client-results').waitFor();
    };
    const proveNavigation = async () => {
      const observations = [];
      const controls = async () => ({
        q: await page.getByLabel(t.clients.searchLabel, { exact: true }).inputValue(),
        status: await page.getByLabel(t.clients.status, { exact: true }).inputValue(),
        archive: await page.getByLabel(t.clients.archive, { exact: true }).inputValue(),
      });
      const query = () => Object.fromEntries(new URL(page.url()).searchParams);
      const search = '__PHASE2_ARCHIVED_PARENT_CONTACT';
      await goto(base + `/clients?q=${search}&status=Disabled&archive=current&page=2`);
      await page.getByRole('heading', { name: t.common.noResults, exact: true }).waitFor();
      assert.deepEqual(await controls(), { q: search, status: 'Disabled', archive: 'current' });
      await page.getByRole('link', { name: t.clients.allArchives, exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get('archive') === 'all', {
        waitUntil: 'networkidle',
      });
      observations.push({
        name: 'R1 include archived retains search/status and resets list page',
        actual: {
          query: query(),
          controls: await controls(),
          resultPaths: await page
            .locator('#client-results h3 a')
            .evaluateAll((links) => links.map((link) => new URL(link.href).pathname)),
          archivedRows: await page
            .locator('#client-results li')
            .filter({
              has: page.getByText(t.clients.archived, { exact: true }),
            })
            .count(),
        },
        expected: {
          query: { q: search, status: 'Disabled', archive: 'all' },
          controls: { q: search, status: 'Disabled', archive: 'all' },
          resultPaths: [`/clients/${cases.archived}`],
          archivedRows: 1,
        },
      });
      await screenshot('navigation-r1');

      const filters = {
        q: '__PHASE2_TEST_DUPLICATE',
        status: 'Disabled',
        archive: 'all',
        page: '2',
      };
      const detail =
        base + `/clients/${cases.primary}?${new URLSearchParams(filters)}&contactsPage=2`;
      const contactRegion = page.getByRole('region', { name: t.clients.contacts, exact: true });
      const contactState = async () => ({
        query: query(),
        pagination: await page
          .getByRole('navigation', {
            name: t.clients.contactPagination,
            exact: true,
          })
          .locator('p')
          .textContent(),
        contacts: await contactRegion
          .locator('h3 a')
          .evaluateAll((links) => links.map((link) => new URL(link.href).pathname)),
      });
      await goto(detail);
      await contactRegion.getByText(t.clients.page(2, 2), { exact: true }).waitFor();
      const expectedContactState = await contactState();
      assert.equal(expectedContactState.contacts.length, 3);
      await page
        .getByRole('region', { name: t.clients.details, exact: true })
        .getByRole('link')
        .click();
      await page.waitForURL(
        (url) => url.pathname === `/clients/${cases.primary}/contacts/${cases.contacts[0]}`,
      );
      const mainContactQuery = query();
      await page.getByRole('link', { name: t.clients.backClient, exact: true }).click();
      await page.waitForURL((url) => url.pathname === `/clients/${cases.primary}`, {
        waitUntil: 'networkidle',
      });
      observations.push({
        name: 'R2 main contact and displayed Back preserve contact page and list state',
        actual: { mainContactQuery, returned: await contactState() },
        expected: {
          mainContactQuery: { ...filters, contactsPage: '2' },
          returned: expectedContactState,
        },
      });
      await screenshot('navigation-r2');

      // Record both independent paths before asserting, so a failing build
      // retains reproducible observations for both navigation regressions.
      writeFileSync(
        join(output, 'navigation-evidence.json'),
        JSON.stringify(observations, null, 2),
      );
      for (const observation of observations)
        assert.deepEqual(observation.actual, observation.expected, observation.name);
      evidence.push(...observations.map(({ name }) => ({ name, passed: true })));

      await goto(detail);
      await contactRegion.locator('h3 a').first().click();
      await page.getByRole('link', { name: t.clients.backClient, exact: true }).click();
      await page.waitForURL((url) => url.pathname === `/clients/${cases.primary}`, {
        waitUntil: 'networkidle',
      });
      assert.deepEqual(await contactState(), expectedContactState, 'ordinary contact row return');
      await page.getByRole('link', { name: t.clients.back, exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/clients', { waitUntil: 'networkidle' });
      assert.deepEqual(query(), filters);
      assert.deepEqual(await controls(), {
        q: filters.q,
        status: filters.status,
        archive: filters.archive,
      });
      await page.getByText(t.clients.page(2, 2), { exact: true }).waitFor();
      assert.equal(await page.locator('#client-results h3 a').count(), 3);
      evidence.push({
        name: 'ordinary contact and displayed list Back preserve pages and filters',
        passed: true,
      });
      await goto(base + '/clients');
      console.log('PASS R1/R2 navigation, ordinary contact return and client-list return');
    };
    for (const path of [
      '/clients',
      `/clients/${cases.primary}`,
      `/clients/${cases.primary}/contacts/${cases.contacts[0]}`,
    ]) {
      await goto(base + path);
      assert.equal(new URL(page.url()).pathname, '/login');
    }
    assert.equal(
      (await context.request.get(base + `/clients/${identities.logos[0].client_id}/logo`)).status(),
      401,
    );
    for (const account of accounts) {
      await login(account);
      const before = await withApprovedMigrationClient(staffReadOnlyState, {
        databaseUrl: fixture.migrationUrl,
      });
      if (account === accounts[0]) await proveNavigation();
      await audit('list ' + account.roleCode);
      await goto(base + `/clients/${cases.primary}`);
      await page.getByRole('heading', { name: t.clients.details, exact: true }).waitFor();
      await audit('client detail ' + account.roleCode);
      assert.equal(await page.getByRole('button').count(), 0);
      await goto(base + `/clients/${cases.primary}/contacts/${cases.contacts[0]}`);
      await audit('contact detail ' + account.roleCode);
      assert.ok(!(await page.content()).includes('home_phone'));
      await goto(base + `/clients/${cases.archived}/contacts/${cases.archivedParentContact}`);
      await page.getByText(t.clients.archivedNotice, { exact: true }).waitFor();
      await audit('archived parent ' + account.roleCode);
      await goto(base + `/clients/${cases.primary}/contacts/${cases.archivedContact}`);
      await page.getByText(t.clients.contactArchivedNotice, { exact: true }).waitFor();
      await goto(base + `/clients/${cases.primary + 10000}/contacts/${cases.contacts[0]}`);
      await page.getByRole('heading', { name: t.clients.notFound, exact: true }).waitFor();
      const logo = await context.request.get(
        base + `/clients/${identities.logos[0].client_id}/logo`,
      );
      assert.equal(logo.status(), 200);
      assert.equal(logo.headers()['cache-control'], 'private, no-store');
      assert.equal(logo.headers()['x-content-type-options'], 'nosniff');
      assert.deepEqual(
        await withApprovedMigrationClient(staffReadOnlyState, {
          databaseUrl: fixture.migrationUrl,
        }),
        before,
      );
      console.log('PASS client browser role and read preservation: ' + account.roleCode);
    }
    for (const logo of identities.logos) {
      await goto(base + `/clients/${logo.client_id}`);
      const image = page.locator('img');
      await image.waitFor();
      await page.waitForFunction(() => {
        const img = document.querySelector('img');
        return img?.complete && img.naturalWidth > 0;
      });
      assert.equal(
        (await context.request.head(base + `/clients/${logo.client_id}/logo`)).status(),
        200,
      );
    }
    evidence.push({ name: 'all 54 existing logos decoded in browser', count: 54 });
    for (const contact of identities.unnamed) {
      await goto(base + `/clients/${contact.client_id}/contacts/${contact.id}`);
      await page.getByRole('heading', { name: t.clients.unnamed, exact: true }).waitFor();
    }
    assert.equal(identities.unnamed.length, 6);
    await audit('unnamed imported contact');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [name, path] of [
        ['list', '/clients'],
        ['logo detail', `/clients/${identities.logos[0].client_id}`],
        ['contact', `/clients/${cases.primary}/contacts/${cases.contacts[0]}`],
        ['empty contacts', `/clients/${identities.noContacts.id}`],
        ['archive filter', '/clients?archive=archived'],
        ['empty search', '/clients?q=__ABSENT_PHASE2__'],
        ['invalid filters', '/clients?status=bad'],
        ['not found', '/clients/0'],
      ]) {
        await goto(base + path);
        await audit(name + ' width ' + width);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await goto(base + '/clients');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').textContent(), t.clients.skip);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'client-results');
    await goto(base + '/clients');
    const focus = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      focus.push(
        await page.locator(':focus').evaluate((el) => ({
          name: el.textContent,
          id: el.id,
          outline: getComputedStyle(el).outlineStyle,
        })),
      );
    }
    assert.ok(focus.every((f) => f.outline !== 'none'));
    assert.deepEqual(
      focus.filter((f) => f.id).map((f) => f.id),
      ['client-search', 'client-status', 'client-archive'],
    );
    evidence.push({ name: 'keyboard source order and visible focus', passed: true });
    await page.getByLabel(t.clients.searchLabel, { exact: true }).fill('__PHASE2_TEST_DUPLICATE');
    await page.getByLabel(t.clients.status, { exact: true }).selectOption('Disabled');
    await page.getByLabel(t.clients.archive, { exact: true }).selectOption('all');
    await page.getByRole('button', { name: t.clients.apply, exact: true }).click();
    await page.getByText(t.clients.results(28), { exact: true }).waitFor();
    await page.getByRole('link', { name: t.clients.next, exact: true }).click();
    await page.getByText(t.clients.page(2, 2), { exact: true }).waitFor();
    assert.equal(await page.locator('#client-results h3 a').count(), 3);
    await page.getByRole('link', { name: t.clients.clear, exact: true }).click();
    await page.waitForURL(base + '/clients');
    assert.equal(await page.getByLabel(t.clients.searchLabel, { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel(t.clients.status, { exact: true }).inputValue(), 'all');
    assert.equal(await page.getByLabel(t.clients.archive, { exact: true }).inputValue(), 'current');
    await page.goBack({ waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    assert.equal(await page.getByLabel(t.clients.status, { exact: true }).inputValue(), 'Disabled');
    assert.equal(await page.getByLabel(t.clients.archive, { exact: true }).inputValue(), 'all');
    assert.equal(await page.locator('#client-results h3 a').count(), 3);
    assert.equal(
      await page.getByLabel(t.clients.searchLabel, { exact: true }).inputValue(),
      '__PHASE2_TEST_DUPLICATE',
    );
    await audit('clear filters and browser back');
    await goto(base + '/clients?q=__PHASE2_CONTACT');
    await page.getByText(t.clients.matchContact, { exact: true }).waitFor();
    await audit('contact match disclosure');
    const logoUrl = base + `/clients/${identities.logos[0].client_id}/logo`;
    await context.route(logoUrl, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: 'invalid late image' }),
    );
    await goto(base + `/clients/${identities.logos[0].client_id}`);
    await page
      .locator('img[src="/clients/' + identities.logos[0].client_id + '/logo"]')
      .waitFor({ state: 'detached' });
    await audit('image failure before hydration fallback');
    await context.unroute(logoUrl);
    await goto(base + `/clients/${identities.logos[0].client_id}`);
    const clientImage = page.locator(
      'img[src="/clients/' + identities.logos[0].client_id + '/logo"]',
    );
    await clientImage.waitFor();
    await page.waitForFunction((src) => {
      const img = document.querySelector('img[src="' + src + '"]');
      return img?.complete && img.naturalWidth > 0;
    }, `/clients/${identities.logos[0].client_id}/logo`);
    await context.route(logoUrl + '?late=1', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: 'invalid late image' }),
    );
    await clientImage.evaluate((img) => {
      img.src += '?late=1';
    });
    await page.locator('img[src$="/logo?late=1"]').waitFor({ state: 'detached' });
    await audit('late browser logo fallback');
    await context.unroute(logoUrl + '?late=1');
    const forbidden = await goto(base + '/forbidden');
    assert.equal(forbidden.status(), 403);
    await audit('shared forbidden response');
    await withApprovedMigrationClient(
      (db) => db.query('REVOKE SELECT ON public.clients FROM litigation_runtime'),
      { databaseUrl: fixture.migrationUrl },
    );
    try {
      await goto(base + '/clients');
      await page.getByRole('alert').filter({ hasText: t.clients.loadError }).waitFor();
      assert.equal(await page.locator(':focus').getAttribute('role'), 'alert');
      await audit('recoverable database error');
    } finally {
      await withApprovedMigrationClient(
        (db) => db.query('GRANT SELECT ON public.clients TO litigation_runtime'),
        { databaseUrl: fixture.migrationUrl },
      );
    }
    await page.getByRole('button', { name: t.clients.retry, exact: true }).click();
    await page.locator('#client-results').waitFor();
    await audit('retry recovered');
    await withApprovedMigrationClient(
      async (db) => {
        await db.query('BEGIN');
        try {
          await db.query('LOCK TABLE public.clients IN ACCESS EXCLUSIVE MODE');
          await page.goto(base + '/clients?q=loading', { waitUntil: 'commit' });
          await page.getByRole('status').filter({ hasText: t.common.loading }).waitFor();
          await screenshot('loading');
        } finally {
          await db.query('ROLLBACK');
        }
      },
      { databaseUrl: fixture.migrationUrl },
    );
    await page.locator('#client-results').waitFor();
    evidence.push({ name: 'streamed loading then results', passed: true });
    await goto(base + '/clients');
    await proveStaffBrowserZoom({
      context,
      page,
      audit,
      screenshot,
      evidence,
      name: 'client list',
    });
    await goto(base + `/clients/${cases.primary}/contacts/${cases.contacts[0]}`);
    await proveStaffBrowserZoom({
      context,
      page,
      audit,
      screenshot,
      evidence,
      name: 'contact detail',
    });
    if (process.argv.includes('--phase3'))
      await proveClientMutationBrowser({
        page,
        context,
        base,
        goto,
        login,
        accounts,
        fixture,
        cases,
        identities,
        audit,
        screenshot,
        evidence,
      });
    assert.deepEqual(remoteRequests, []);
    writeFileSync(
      join(output, 'browser-evidence.json'),
      JSON.stringify(
        {
          browser: await browser.version(),
          evidence,
          remoteRequests,
          readOnlyNavigation: true,
          mutations: process.argv.includes('--phase3'),
        },
        null,
        2,
      ),
    );
    console.log(
      `PASS client browser ${evidence.length} states/proofs, ${evidence.filter((e) => e.violations).length} zero-violation accessibility audits, all roles, 54 logos, six unnamed contacts, desktop/390/320 and genuine zoom`,
    );
  } finally {
    if (browser) await browser.close();
    if (next) {
      next.child.kill();
      await next.done;
    }
    if (existsSync(dependencyLink)) {
      assert.equal(realpathSync(dependencyLink), realpathSync(join(root, 'node_modules')));
      unlinkSync(dependencyLink);
    }
    assert.ok(realpathSync(mirror).startsWith(realpathSync(buildRoot) + sep));
    rmSync(mirror, { recursive: true });
    assert.equal(existsSync(mirror), false);
    writeFileSync(
      join(output, 'browser-cleanup.json'),
      JSON.stringify(
        {
          mirror,
          removed: true,
          serverStopped: !next || next.child.exitCode !== null || next.child.signalCode !== null,
          browserClosed: true,
          dependencyLinkRemoved: !existsSync(dependencyLink),
        },
        null,
        2,
      ),
    );
  }
});
assert.deepEqual(
  await withApprovedMigrationClient(staffReadOnlyState, {
    clientConfig: { options: '-c default_transaction_read_only=on' },
  }),
  preservation,
);
console.log('PASS client browser/build cleanup and project preservation');
writeFileSync(
  join(output, 'browser-preservation.json'),
  JSON.stringify({ fullProjectStateUnchanged: true, clusterCleanupVerified: true }, null, 2),
);
