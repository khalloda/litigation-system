import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { withApprovedMigrationClient } from './lib/migration-principal.ts';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture.ts';
import { capture } from './lib/audit-history-test-state.ts';
import {
  staffZoomExtension,
  proveStaffBrowserZoom,
  staffFocusProof,
} from './lib/staff-accessibility-browser.mjs';
import { t } from '../src/strings.ts';
import {
  browserSurfaceOracle,
  requiredEntryTables,
} from './lib/audit-history-browser-surfaces.mjs';
const require = createRequire(import.meta.url),
  { chromium } = require('playwright');
const output = process.env.TASK49_TEST_OUTPUT,
  privateRoot = process.env.TASK49_PRIVATE_ROOT;
assert.ok(output && privateRoot && process.env.TASK49_LOGINS);
mkdirSync(output, { recursive: true });
copyFileSync(process.argv[1], join(output, 'executed-browser.mjs'));
const mirror = resolve(process.env.TASK49_BUILD_ROOT ?? 'test-results/task49-20260920/build-work'),
  s = t.auditHistory;
const logins = JSON.parse(readFileSync(process.env.TASK49_LOGINS, 'utf8'));
const focusTrace = [];
const evidence = [],
  errors = [],
  requests = [];
let server, context, page;
const others = [];
let serverLog = '';
const put = (name, value) =>
  writeFileSync(join(output, name + '.json'), JSON.stringify(value, null, 2), { flag: 'wx' });
async function freePort() {
  const socket = createServer();
  await new Promise((r) => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  return port;
}
const stateBody = (state) => {
  const { capturedAt, ...rest } = state;
  void capturedAt;
  return rest;
};
async function main() {
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(process.env.MIGRATION_DATABASE_URL), process.env),
    { databaseUrl: process.env.MIGRATION_DATABASE_URL },
  );
  const port = await freePort(),
    base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    AUTH_TRUST_HOST: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  delete env.MIGRATION_DATABASE_URL;
  delete env.POSTGRES_PASSWORD;
  delete env.AUTH_URL;
  delete env.NEXTAUTH_URL;
  server = spawn(
    process.execPath,
    [
      join(mirror, 'node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { cwd: mirror, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout.on('data', (b) => (serverLog += b));
  server.stderr.on('data', (b) => (serverLog += b));
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null);
    try {
      if ((await fetch(base + '/login')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
    if (i === 99) throw Error('App readiness timeout');
  }
  const extension = staffZoomExtension(privateRoot),
    browserEnv = { ...process.env };
  for (const k of Object.keys(browserEnv))
    if (/PASSWORD|TOKEN|SECRET|API_KEY|DATABASE_URL/iu.test(k)) delete browserEnv[k];
  context = await chromium.launchPersistentContext(join(privateRoot, 'profile'), {
    headless: true,
    executablePath: process.env.AUDIT_PDF_CHROMIUM,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    env: browserEnv,
    acceptDownloads: true,
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base || url.protocol === 'data:' || url.protocol === 'blob:')
      return route.continue();
    requests.push(url.origin);
    return route.abort();
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (e) => errors.push(e.message));
  async function login(p, credentials) {
    await p.goto(base + '/login');
    await p.locator('[name=username]').fill(credentials.username);
    await p.locator('[name=password]').fill(credentials.password);
    await Promise.all([
      p.waitForURL((u) => u.pathname === '/'),
      p.locator('button[type=submit]').click(),
    ]);
  }
  await login(
    page,
    logins.find((x) => x.username === 'KHelmy'),
  );
  if (process.argv.includes('--export-probe')) {
    const response = await page.evaluate(async () => {
      const r = await fetch('/audit-history/read?table=documents&id=815').then((r) => r.json());
      const payload = {
        format: 'xlsx',
        operationId: crypto.randomUUID(),
        query: new URLSearchParams({
          table: 'documents',
          id: '815',
          cursor: r.snapshot,
        }).toString(),
      };
      const exported = await fetch('/audit-history/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return {
        status: exported.status,
        type: exported.headers.get('content-type'),
        error: exported.ok ? null : await exported.text(),
        scope: r.subject,
        filters: r.filters,
      };
    });
    put('export-probe', response);
    return;
  }
  for (const account of logins.filter((x) => x.username !== 'KHelmy')) {
    const c = await context.browser().newContext({ viewport: { width: 1280, height: 900 } });
    others.push(c);
    const p = await c.newPage();
    await login(p, account);
    evidence.push({ roleAccount: account.username, context: c, page: p });
  }
  const before = await capture(process.env.MIGRATION_DATABASE_URL);
  put('read-before', before);
  // Submit the real Server Action transport with a forged capability field.
  // The request must be refused before changing even an otherwise valid username.
  await page.goto(base + '/users');
  const usernameForm = page
    .locator('form')
    .filter({ has: page.locator('input[name=accountId][value="2"]') })
    .filter({ has: page.locator('input[name=username]') });
  await usernameForm.waitFor({ state: 'attached' });
  await usernameForm.evaluate((form) => {
    form.closest('details').open = true;
    const extra = document.createElement('input');
    extra.type = 'hidden';
    extra.name = 'auditExport';
    extra.value = 'true';
    form.append(extra);
  });
  await usernameForm.locator('[name=username]').fill('TASK49_FORGED_MUST_NOT_PERSIST');
  await usernameForm.locator('button[type=submit]').click();
  await usernameForm.getByRole('alert').waitFor();
  assert.equal(
    await usernameForm.getByRole('alert').textContent(),
    t.users.errors['invalid-input'],
  );
  evidence.push({
    case: 'actual /users Server Action forged auditExport field',
    refusedBeforeWrite: true,
  });
  const screenshot = (name) =>
    page.screenshot({ path: join(output, name + '.png'), fullPage: false });
  const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  async function audit(name) {
    await page.evaluate(axe);
    const result = await page.evaluate(async () =>
      window.axe.run(document.querySelector('dialog[open]') ?? document.querySelector('main'), {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      }),
    );
    put(name.replace(/[^a-z0-9-]/giu, '-') + '-axe', {
      violations: result.violations,
      passes: result.passes.map((x) => x.id),
    });
    assert.deepEqual(result.violations, [], 'Automated accessibility ' + name);
    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      dialog: document.querySelector('dialog[open]')?.getBoundingClientRect().toJSON(),
    }));
    assert.ok(metrics.scroll <= metrics.width + 1);
    evidence.push({ case: name, metrics });
  }
  async function loaded(scope = page) {
    await scope
      .getByRole('status')
      .first()
      .filter({ hasText: s.results })
      .waitFor({ timeout: 20000 });
  }
  async function act(button, scope = page) {
    await button.click();
    await loaded(scope);
  }
  await page.goto(base + '/audit-history');
  await loaded();
  await audit('global-desktop');
  await screenshot('global-desktop');
  const search = page.locator('input[name=q]');
  await search.fill('UNSENT TASK49');
  await act(page.getByRole('button', { name: s.clear, exact: true }));
  assert.equal(await search.inputValue(), '');
  assert.equal(new URL(page.url()).search, '');
  assert.equal(await search.evaluate((e) => e === document.activeElement), true);
  await search.fill('TASK49-no-match-browser');
  await act(page.getByRole('button', { name: s.apply, exact: true }));
  await page.getByText(s.empty, { exact: true }).waitFor();
  const filtered = page.url();
  await search.fill('UNSENT AFTER FILTER');
  await act(page.getByRole('button', { name: s.clear, exact: true }));
  assert.equal(await search.inputValue(), '');
  await page.goBack();
  await loaded();
  assert.equal(page.url(), filtered);
  assert.equal(await search.inputValue(), 'TASK49-no-match-browser');
  await page.goForward();
  await loaded();
  assert.equal(await search.inputValue(), '');
  await act(page.getByRole('button', { name: s.more, exact: true }));
  assert.match(page.url(), /cursor=/);
  assert.equal(
    await page
      .getByRole('status')
      .first()
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await act(page.getByRole('button', { name: s.clear, exact: true }));
  await proveStaffBrowserZoom({ context, page, audit, screenshot, evidence, name: 'global' });
  await page.setViewportSize({ width: 320, height: 812 });
  await audit('global-mobile');
  await screenshot('global-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Direct methods and non-Administrator UI/endpoint denial after all login bookkeeping.
  for (const entry of evidence.filter((x) => x.context)) {
    for (const method of ['GET', 'HEAD', 'OPTIONS'])
      assert.equal(
        await entry.page.evaluate(
          async ({ url, method }) => (await fetch(url, { method })).status,
          { url: base + '/audit-history/read', method },
        ),
        403,
      );
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'])
      assert.equal(
        await entry.page.evaluate(
          async ({ url, method }) => (await fetch(url, { method })).status,
          { url: base + '/audit-history/export', method },
        ),
        403,
      );
    await entry.page.goto(base + '/audit-history');
    assert.ok(new URL(entry.page.url()).pathname.includes('forbidden'));
    assert.equal(await entry.page.getByRole('button', { name: s.open, exact: true }).count(), 0);
    entry.denied = true;
    delete entry.context;
    delete entry.page;
  }
  for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'])
    assert.equal(
      await page.evaluate(async ({ url, method }) => (await fetch(url, { method })).status, {
        url: base + '/audit-history/export',
        method,
      }),
      405,
    );
  const oracle = await withApprovedMigrationClient(browserSurfaceOracle, {
    databaseUrl: process.env.MIGRATION_DATABASE_URL,
  });
  put('required-surface-oracle', oracle);
  const entries = [];
  for (const record of oracle.routes) {
    await page.bringToFront();
    await page.goto(base + record.route);
    const buttons = page.locator(
      `button[data-audit-table="${record.table}"][data-audit-id="${record.id}"]`,
    );
    await buttons.first().waitFor({ timeout: 20000 });
    assert.ok((await buttons.count()) > 0, 'entry ' + record.route);
    for (let i = 0; i < (await buttons.count()); i++) {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/audit-history/read?') && r.request().method() === 'GET',
      );
      await buttons.nth(i).click();
      let response = await (await responsePromise).json();
      const dialog = page.getByRole('dialog');
      await loaded(dialog);
      assert.equal(
        await dialog
          .getByRole('button', { name: s.close, exact: true })
          .evaluate((e) => e === document.activeElement),
        true,
        'Initial drawer focus',
      );
      const params = new URLSearchParams(
        decodeURIComponent(new URL(page.url()).hash.split('=').slice(1).join('=')),
      );
      const table = params.get('table');
      assert.equal(table, record.table);
      assert.equal(params.get('id'), record.id);
      const actual = response.groups.flatMap((g) => g.events.map((e) => e.id));
      while (response.next) {
        const nextReply = page.waitForResponse(
          (r) => r.url().includes('/audit-history/read?') && r.request().method() === 'GET',
        );
        await dialog.getByRole('button', { name: s.more, exact: true }).click();
        response = await (await nextReply).json();
        await loaded(dialog);
        actual.push(...response.groups.flatMap((g) => g.events.map((e) => e.id)));
      }
      assert.deepEqual(actual.sort(), record.expected, record.surface);
      entries.push({
        surface: record.surface,
        expected: record.expected,
        actual,
        route: record.route,
        table,
        id: params.get('id'),
        status: await dialog.getByRole('status').first().textContent(),
      });
      await audit('drawer-' + record.surface + '-' + i);
      await screenshot('drawer-' + record.surface + '-' + i);
      // Initial close focus is asserted before pagination, which deliberately
      // moves focus to result status. Restore close for the keyboard cycle.
      await dialog.getByRole('button', { name: s.close, exact: true }).focus();
      assert.equal(
        await dialog
          .getByRole('button', { name: s.close, exact: true })
          .evaluate((e) => e === document.activeElement),
        true,
      );
      for (let n = 0; n < 14; n++) {
        await page.keyboard.press('Tab');
        const focus = await page.evaluate(() => ({
          inside: Boolean(document.activeElement?.closest('dialog[open]')),
          tag: document.activeElement?.tagName,
          name: document.activeElement?.getAttribute('name'),
          text:
            document.activeElement?.tagName === 'BUTTON'
              ? document.activeElement?.textContent
              : null,
          documentFocus: document.hasFocus(),
        }));
        focusTrace.push({ route: record.route, table, step: n, ...focus });
        if (n === 0)
          focusTrace.push({ route: record.route, computedFocus: await staffFocusProof(page) });
        assert.equal(focus.inside, true, JSON.stringify(focus));
      }
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await buttons.nth(i).evaluate((e) => e === document.activeElement), true);
      entries.at(-1).keyboard = {
        initialCloseFocus: true,
        tabSteps: 14,
        escapeClosed: true,
        focusReturnedToExactTrigger: true,
      };
    }
  }
  assert.deepEqual(
    [...new Set(entries.map((e) => e.table))].sort(),
    [...requiredEntryTables].sort(),
  );
  assert.deepEqual(
    [...new Set(entries.map((e) => e.surface))].sort(),
    oracle.routes.map((r) => r.surface).sort(),
  );
  put('record-entry-mapping', entries);
  put('successful-focus-trace', focusTrace);
  const doc = await withApprovedMigrationClient(
    async (db) =>
      (
        await db.query(
          "SELECT id FROM documents WHERE description LIKE 'TASK49 SYNTHETIC ONLY%' ORDER BY id DESC LIMIT 1",
        )
      ).rows[0].id,
    { databaseUrl: process.env.MIGRATION_DATABASE_URL },
  );
  await page.goto(base + '/documents/' + doc);
  await page.getByRole('button', { name: s.open, exact: true }).click();
  let dialog = page.getByRole('dialog');
  await loaded(dialog);
  await screenshot('document-drawer-desktop');
  await dialog.locator('input[name=q]').fill('UNSENT');
  await act(dialog.getByRole('button', { name: s.clear, exact: true }), dialog);
  assert.equal(await dialog.locator('input[name=q]').inputValue(), '');
  await dialog.locator('input[name=q]').fill('TASK49');
  await act(dialog.getByRole('button', { name: s.apply, exact: true }), dialog);
  await page.goBack();
  await loaded(dialog);
  assert.equal(await dialog.locator('input[name=q]').inputValue(), '');
  await page.goForward();
  await loaded(dialog);
  assert.equal(await dialog.locator('input[name=q]').inputValue(), 'TASK49');
  await proveStaffBrowserZoom({ context, page, audit, screenshot, evidence, name: 'drawer' });
  await page.setViewportSize({ width: 320, height: 812 });
  await audit('drawer-mobile');
  await screenshot('drawer-mobile');
  assert.ok(
    await dialog.evaluate((e) => Math.abs(e.getBoundingClientRect().width - innerWidth) <= 1),
  );
  await page.keyboard.press('Escape');
  // Closing a drawer before its delayed fetch completes must not display it on the next record.
  let release;
  const barrier = new Promise((r) => (release = r));
  await page.route('**/audit-history/read?**', async (route) => {
    await barrier;
    await route.continue().catch(() => {});
  });
  await page.getByRole('button', { name: s.open, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: s.close, exact: true }).click();
  release();
  await page.unroute('**/audit-history/read?**');
  await page.goto(base + '/documents/' + doc);
  assert.equal(await page.getByRole('dialog').count(), 0);
  const after = await capture(process.env.MIGRATION_DATABASE_URL);
  put('read-after', after);
  assert.deepEqual(
    stateBody(after),
    stateBody(before),
    'Complete all-state equality across browser read/refusal workflows',
  );
  await page.getByRole('button', { name: s.open, exact: true }).click();
  dialog = page.getByRole('dialog');
  await loaded(dialog);
  for (const [label, format] of [
    [s.exportExcel, 'xlsx'],
    [s.exportPdf, 'pdf'],
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: label, exact: true }).click(),
    ]);
    await download.saveAs(join(output, 'browser-synthetic-document.' + format));
    assert.equal(await download.failure(), null);
    await dialog.getByText(s.exported, { exact: true }).waitFor();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  // Explicitly synthetic response exercises the actual production viewer,
  // not authentication/query evidence or invented historical database facts.
  if (process.env.TASK49_VALUE_FIXTURE) {
    const typed = JSON.parse(readFileSync(process.env.TASK49_VALUE_FIXTURE, 'utf8'));
    await page.keyboard.press('Escape');
    await page.route('**/audit-history/read?**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(typed) }),
    );
    await page.getByRole('button', { name: s.open, exact: true }).click();
    await loaded(page.getByRole('dialog'));
    const texts = await page.getByRole('dialog').textContent();
    assert.ok(texts.includes(s.emptyString));
    assert.ok(texts.includes(`${s.string}: «نص فارغ مسجل»`));
    assert.ok(texts.includes(`${s.string}: «${s.null}»`));
    assert.ok(texts.includes(`${s.string}: «${s.false}»`));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole('dialog')
      .getByText('empty (empty)', { exact: true })
      .scrollIntoViewIfNeeded();
    await screenshot('typed-state-collisions');
    await page
      .getByRole('dialog')
      .getByText('literal-marker-3 (literal-marker-3)', { exact: true })
      .scrollIntoViewIfNeeded();
    await screenshot('typed-state-literals');
    await page
      .getByRole('dialog')
      .getByText('redacted (redacted)', { exact: true })
      .scrollIntoViewIfNeeded();
    await screenshot('typed-state-metadata');
    put('typed-viewer', {
      syntheticRendererOnly: true,
      texts,
      emptyVsLiteralDistinct: true,
      nullVsLiteralDistinct: true,
      falseVsLiteralDistinct: true,
    });
    await page.keyboard.press('Escape');
    await page.unroute('**/audit-history/read?**');
  }
  put('result', {
    at: new Date().toISOString(),
    status: 'PASS',
    base,
    pid: server.pid,
    build: readFileSync(join(mirror, '.next/BUILD_ID'), 'utf8'),
    axeSha256: createHash('sha256').update(axe).digest('hex'),
    evidence,
    entries,
    noSpeechTest: true,
    fullReadStateEquality: true,
    downloads:
      'server artifact received by isolated test browser; product audit still makes no client receipt claim',
  });
}
try {
  await main();
} catch (e) {
  put('focus-trace', focusTrace);
  if (page)
    await page.screenshot({ path: join(output, 'failure.png'), fullPage: false }).catch(() => {});
  put('failure', { at: new Date().toISOString(), message: e.message, errors, requests });
  throw e;
} finally {
  for (const c of others) await c.close().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((r) => server.once('exit', r));
  }
  writeFileSync(
    join(output, 'server.log'),
    serverLog.replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[private URL]'),
  );
  put('cleanup', {
    at: new Date().toISOString(),
    serverPid: server?.pid,
    serverExited: Boolean(server && (server.exitCode !== null || server.signalCode !== null)),
    exitCode: server?.exitCode,
    signalCode: server?.signalCode,
    taskContextsClosed: true,
    ownerProcessUntouched: true,
  });
}
