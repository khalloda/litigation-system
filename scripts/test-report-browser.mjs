import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { withApprovedMigrationClient } from './lib/migration-principal.ts';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture.ts';
import {
  staffZoomExtension,
  proveStaffBrowserZoom,
  staffAccessibilityTree,
} from './lib/staff-accessibility-browser.mjs';
import { t } from '../src/strings.ts';

const out = process.env.TASK51_OUTPUT,
  priv = process.env.TASK51_PRIVATE,
  normal = process.env.TASK51_BUILD,
  H = dirname(out),
  harness = join(H, 'harness-artifact');
const { chromium } = createRequire(join(normal, 'package.json'))('playwright');
const fixture = JSON.parse(readFileSync(join(priv, 'fixture.json'))),
  config = JSON.parse(readFileSync(join(H, 'context.json'))),
  logins = JSON.parse(readFileSync(join(priv, 'logins.json')));
const axe = readFileSync(join(H, 'axe.min.js'), 'utf8');
const records = [],
  apps = [],
  contexts = [],
  errors = [],
  external = [];
const put = (n, x) => writeFileSync(join(out, n + '.json'), JSON.stringify(x, null, 2));
const pass = (name, details = {}) => {
  records.push({ name, details, at: new Date().toISOString() });
  put('results', records);
  console.log('PASS ' + name);
};
const inspect = (work) =>
  withApprovedMigrationClient(
    async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      return work(db);
    },
    { databaseUrl: fixture.migrationUrl },
  );
const events = () =>
  inspect(
    async (db) =>
      (
        await db.query(
          "SELECT id::text,action,correlation_id::text,resource_identifier,event_metadata FROM public.audit_events WHERE resource_identifier LIKE 'report:%' ORDER BY id",
        )
      ).rows,
  );
let browser;
async function start(build) {
  const sock = createServer();
  await new Promise((r) => sock.listen(0, '127.0.0.1', r));
  const port = sock.address().port;
  await new Promise((r) => sock.close(r));
  const base = 'http://127.0.0.1:' + port;
  const env = { ...process.env, NODE_ENV: 'production', AUTH_URL: base, REPORT_ASSET_ROOT: build };
  for (const k of ['MIGRATION_DATABASE_URL', 'POSTGRES_PASSWORD', 'NEXTAUTH_URL', 'NODE_OPTIONS'])
    delete env[k];
  const app = spawn(
    process.execPath,
    [
      join(build, 'node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { cwd: build, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  app.stdout.on('data', (b) => (log += b));
  app.stderr.on('data', (b) => (log += b));
  apps.push({ app, build, base, log: () => log });
  for (let i = 0; i < 150; i++) {
    assert.equal(app.exitCode, null);
    try {
      if ((await fetch(base + '/login')).ok) return base;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error('readiness timeout');
}
async function login(context, base, user) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/reports');
  assert.equal(new URL(page.url()).pathname, '/login');
  await page.locator('[name=username]').fill(user.username);
  await page.locator('[name=password]').fill(user.password);
  await Promise.all([
    page.waitForURL((u) => u.pathname != '/login'),
    page.locator('button[type=submit]').click(),
  ]);
  await page.goto(base + '/reports');
  return page;
}
async function main() {
  await inspect(async () => undefined);
  const safeEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !/PASSWORD|SECRET|TOKEN|DATABASE_URL|API_KEY/i.test(k),
    ),
  );
  browser = await chromium.launch({
    headless: true,
    executablePath: config.chromium,
    env: safeEnv,
  });
  const base = await start(normal),
    test = await start(harness);
  put(
    'processes',
    apps.map((x) => ({
      pid: x.app.pid,
      base: x.base,
      build: x.build,
      buildId: readFileSync(join(x.build, '.next/BUILD_ID'), 'utf8').trim(),
    })),
  );
  const before = await events();
  for (const user of process.argv.includes('--zoom-only') ? [] : logins) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      timezoneId: 'Africa/Cairo',
      acceptDownloads: true,
    });
    contexts.push(context);
    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if ([base, test].includes(u.origin) || ['data:', 'blob:'].includes(u.protocol))
        return route.continue();
      external.push(u.origin);
      return route.abort();
    });
    const page = await login(context, base, user);
    assert.equal(await page.getByText(t.reports.emptyCatalog, { exact: true }).count(), 1);
    assert.equal(await page.locator('a[href^="/reports/"]').count(), 0);
    const unknown = await page.evaluate(async () => {
      const response = await fetch('/reports/probe-volume/run', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'format=preview',
      });
      return { status: response.status, body: await response.text() };
    });
    assert.equal(unknown.status, 404, JSON.stringify(unknown));
    await page.goto(base + '/reports/probe-volume');
    assert.equal(await page.locator('h1').textContent(), '404');
    // The separate test app requires its own normal sign-in; no cookie injection.
    await context.clearCookies();
    const probe = await login(context, test, user);
    await probe.goto(test + '/reports/probe-volume');
    await probe.locator('#report-client').waitFor();
    const navBefore = await events();
    await probe.reload();
    await probe.locator('#report-client').waitFor();
    assert.deepEqual(await events(), navBefore);
    await probe.locator('#report-from').fill('2022-11-15');
    await probe.locator('#report-to').fill('2022-11-15');
    await probe.getByRole('button', { name: t.reports.run, exact: true }).click();
    await probe.getByRole('heading', { name: t.reports.result, exact: true }).waitFor();
    assert.ok((await probe.locator('tbody tr').count()) > 0);
    await probe.goto(test + '/reports/probe-empty');
    for (const format of ['xlsx', 'pdf']) {
      await probe
        .getByRole('button', {
          name: format === 'xlsx' ? t.reports.xlsx : t.reports.pdf,
          exact: true,
        })
        .click();
      await probe.locator('a[download]').waitFor();
      const [download] = await Promise.all([
        probe.waitForEvent('download'),
        probe.locator('a[download]').click(),
      ]);
      const file = `${user.role}-empty.${format}`;
      await download.saveAs(join(out, file));
      const bytes = readFileSync(join(out, file));
      assert.ok(bytes.length > 1000);
      pass('genuine saved browser download', {
        role: user.role,
        format,
        file,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    pass('ordinary empty registry / actual shared harness form / navigation without audit noise', {
      role: user.role,
    });
    await context.close();
  }
  const profile = join(priv, 'browser-profile-' + out.split(/[\\/]/).at(-1));
  mkdirSync(profile);
  const extension = staffZoomExtension(profile);
  const persistent = await chromium.launchPersistentContext(join(profile, 'profile'), {
    headless: true,
    executablePath: config.chromium,
    env: safeEnv,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  contexts.push(persistent);
  const page = await login(
    persistent,
    test,
    logins.find((x) => x.role === 'Lawyer'),
  );
  await page.goto(test + '/reports/probe-volume');
  await page.locator('#report-client').waitFor();
  const screenshot = async (name) => {
    if (name.includes('browser-zoom')) {
      await page.evaluate(() => scrollTo(0, 0));
      const cdp = await persistent.newCDPSession(page);
      put(name + '-capture-metrics', await cdp.send('Page.getLayoutMetrics'));
      const capture = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      });
      writeFileSync(join(out, name + '.png'), Buffer.from(capture.data, 'base64'));
      await cdp.detach();
      return;
    }
    await page.screenshot({ path: join(out, name + '.png'), fullPage: true });
  };
  const audit = async (name) => {
    await page.evaluate(axe);
    const result = await page.evaluate(
      async () =>
        await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        }),
    );
    put(name + '-axe', {
      violations: result.violations,
      incomplete: result.incomplete,
      passes: result.passes.map((x) => x.id),
    });
    assert.equal(result.violations.length, 0, name);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
      name + ' page overflow',
    );
    await staffAccessibilityTree(persistent, page, (tree) => put(name + '-ax-tree', tree));
    pass(name + ' axe and accessible control names');
  };
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await audit('width-' + width);
    await screenshot('width-' + width);
  }
  const zoom = [];
  await proveStaffBrowserZoom({
    context: persistent,
    page,
    audit,
    screenshot,
    evidence: zoom,
    name: 'report-form',
  });
  put('zoom', zoom);
  await page.setViewportSize({ width: 1280, height: 900 });
  // Invalid values are established, then submission, summary and correction-link
  // traversal use the keyboard; entered values must survive the server response.
  await page.locator('#report-from').fill('2026-12-31');
  await page.locator('#report-to').fill('2026-01-01');
  await page.getByRole('button', { name: t.reports.run, exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByText(t.reports.validation, { exact: true }).waitFor();
  assert.equal(await page.locator('#report-from').inputValue(), '2026-12-31');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'status');
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('href')),
    '#report-from',
  );
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'report-from');
  await screenshot('validation');
  await audit('validation');
  await page.locator('#report-from').fill('2026-09-21');
  await page.locator('#report-to').fill('2026-09-21');
  await page.getByRole('button', { name: t.reports.run, exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: t.reports.result, exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    t.reports.result,
  );
  await screenshot('preview');
  await audit('preview');
  const selected = await page.locator('#report-client option').nth(2).getAttribute('value');
  await page.locator('#report-client').selectOption(selected);
  await page.locator('#report-client-search').fill('NO-MATCH-TEST-61');
  assert.equal(await page.locator('#report-client').inputValue(), selected);
  pass('filtering selector choices preserves selected stable ID');
  const forged = await page.evaluate(async () => {
    const response = await fetch('/reports/probe-volume/run', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'format=preview&client=1&client=2',
    });
    return { status: response.status, body: await response.text() };
  });
  assert.equal(forged.status, 400, JSON.stringify(forged));
  pass('genuine captured-session forged duplicate denied');
  const after = await events();
  put('audit-window', after.slice(before.length));
  assert.equal(errors.length, 0);
  assert.equal(external.length, 0);
  pass('complete browser cycle', {
    errors,
    external,
    reportEvents: after.length - before.length,
    screenReaderSpeech: 'excluded by owner',
  });
}
try {
  await main();
} catch (e) {
  writeFileSync(
    join(priv, 'browser-' + out.split(/[\\/]/).at(-1) + '-failure.txt'),
    String(e.stack),
  );
  console.error('Browser proof failed; private diagnostic retained');
  process.exitCode = 1;
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  await browser?.close();
  for (const x of apps) {
    x.app.kill();
    await new Promise((r) => {
      if (x.app.exitCode !== null) return r();
      x.app.once('exit', r);
      setTimeout(r, 5000);
    });
    writeFileSync(
      join(out, (x.build === normal ? 'normal' : 'harness') + '-server.log'),
      x.log().replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[private URL]'),
    );
  }
  put(
    'cleanup',
    apps.map((x) => ({
      pid: x.app.pid,
      exitCode: x.app.exitCode,
      signalCode: x.app.signalCode,
      build: x.build,
    })),
  );
}
