import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { withApprovedMigrationClient } from './lib/migration-principal.ts';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture.ts';
import { t } from '../src/strings.ts';

// Source-bound incremental proof for the two entries with settled semantics.
// This does not stand in for the final nine-definition family/browser matrix.
const out = process.env.TASK51_OUTPUT,
  priv = process.env.TASK51_PRIVATE,
  build = process.env.TASK51_BUILD,
  H = dirname(out);
const fixture = JSON.parse(readFileSync(join(priv, 'fixture.json')));
const config = JSON.parse(readFileSync(join(H, 'context.json')));
const logins = JSON.parse(readFileSync(join(priv, 'logins.json')));
const oracle = JSON.parse(
  readFileSync(join(H, 'contact-judgment-oracle-reviewed/source-oracle.json')),
);
const example = oracle.judgmentRuns
  .filter((r) => r.rows > 0 && r.from === '0001-01-01')
  .sort((a, b) => a.rows - b.rows || a.clientId - b.clientId)[0];
assert.ok(example);
const { chromium } = createRequire(join(build, 'package.json'))('playwright');
const { default: ExcelJS } = await import('exceljs');
const records = [],
  requests = [],
  errors = [],
  external = [];
const put = (name, data) => writeFileSync(join(out, name + '.json'), JSON.stringify(data, null, 2));
const pass = (name, details = {}) => {
  records.push({ name, details, at: new Date().toISOString() });
  put('results', records);
  console.log('PASS ' + name);
};
const inspect = (work) =>
  withApprovedMigrationClient(
    async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      await db.query('BEGIN READ ONLY');
      try {
        return await work(db);
      } finally {
        await db.query('ROLLBACK');
      }
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
let browser,
  app,
  base,
  log = '';
const contexts = [];
async function main() {
  await inspect(async () => undefined);
  const sock = createServer();
  await new Promise((r) => sock.listen(0, '127.0.0.1', r));
  const port = sock.address().port;
  await new Promise((r) => sock.close(r));
  assert.notEqual(port, 3000);
  base = 'http://127.0.0.1:' + port;
  const env = { ...process.env, NODE_ENV: 'production', AUTH_URL: base, REPORT_ASSET_ROOT: build };
  for (const key of ['MIGRATION_DATABASE_URL', 'POSTGRES_PASSWORD', 'NEXTAUTH_URL', 'NODE_OPTIONS'])
    delete env[key];
  app = spawn(
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
  app.stdout.on('data', (b) => {
    log += b;
  });
  app.stderr.on('data', (b) => {
    log += b;
  });
  put('process', {
    pid: app.pid,
    base,
    build,
    buildId: readFileSync(join(build, '.next/BUILD_ID'), 'utf8').trim(),
  });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    assert.equal(app.exitCode, null);
    try {
      if ((await fetch(base + '/login')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready);
  browser = await chromium.launch({
    headless: true,
    executablePath: config.chromium,
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => !/PASSWORD|SECRET|TOKEN|DATABASE_URL|API_KEY/i.test(k),
      ),
    ),
  });
  const before = await events();
  for (const user of logins) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      timezoneId: 'Africa/Cairo',
      acceptDownloads: true,
    });
    contexts.push(context);
    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.origin === base || ['data:', 'blob:'].includes(u.protocol)) return route.continue();
      external.push(u.origin);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      const u = new URL(response.url());
      if (/\/reports\/[^/]+\/(run|export)$/.test(u.pathname))
        requests.push({
          role: user.role,
          path: u.pathname,
          status: response.status(),
          headers: response.headers(),
        });
    });
    await page.goto(base + '/reports');
    assert.equal(new URL(page.url()).pathname, '/login');
    await page.locator('[name=username]').fill(user.username);
    await page.locator('[name=password]').fill(user.password);
    await Promise.all([
      page.waitForURL((u) => u.pathname != '/login'),
      page.locator('button[type=submit]').click(),
    ]);
    await page.goto(base + '/reports');
    for (const id of ['client-active-contacts', 'client-judgments'])
      assert.equal(await page.locator(`a[href="/reports/${id}"]`).count(), 1);
    const navBefore = await events();
    await page.reload();
    assert.deepEqual(await events(), navBefore);
    for (const id of ['client-active-contacts', 'client-judgments']) {
      await page.goto(base + '/reports/' + id);
      if (id === 'client-judgments') {
        await page.getByRole('button', { name: t.reports.run, exact: true }).click();
        await page.getByText(t.reports.validation, { exact: true }).waitFor();
        assert.equal(await page.locator('#report-client').getAttribute('aria-invalid'), 'true');
        await page.locator('#report-client').selectOption(String(example.clientId));
        await page.locator('#report-from').fill('0001-01-01');
        await page.locator('#report-to').fill('9998-12-31');
      }
      await page.getByRole('button', { name: t.reports.run, exact: true }).click();
      await page.getByRole('heading', { name: t.reports.result, exact: true }).waitFor();
      assert.equal(
        await page.locator('tbody tr').count(),
        Math.min(50, id === 'client-active-contacts' ? oracle.contacts.rows : example.rows),
      );
      if (user.role === 'Lawyer') {
        for (const width of [320, 390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: join(out, `${id}-${width}.png`), fullPage: true });
        }
      }
      for (const format of ['xlsx', 'pdf']) {
        await page
          .getByRole('button', {
            name: format === 'xlsx' ? t.reports.xlsx : t.reports.pdf,
            exact: true,
          })
          .click();
        await page.locator('a[download]').waitFor({ timeout: 120000 });
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.locator('a[download]').click(),
        ]);
        const file = `${user.role}-${id}.${format}`;
        await download.saveAs(join(out, file));
        assert.equal(await download.failure(), null);
        const bytes = readFileSync(join(out, file)),
          hash = createHash('sha256').update(bytes).digest('hex');
        const request = requests.at(-1);
        assert.equal(request.status, 200);
        assert.equal(request.headers['x-artifact-sha256'], hash);
        assert.equal(Number(request.headers['content-length']), bytes.length);
        assert.ok(request.headers['cache-control'].includes('no-store'));
        if (format === 'xlsx') {
          const book = new ExcelJS.Workbook();
          await book.xlsx.readFile(join(out, file));
          assert.ok(book.worksheets.every((s) => s.views[0]?.rightToLeft));
          assert.equal(
            book.getWorksheet(t.reports.infoSheet).getCell('B3').value,
            id === 'client-active-contacts' ? oracle.contacts.rows : example.rows,
          );
          for (const sheet of book.worksheets)
            sheet.eachRow((row) => row.eachCell((cell) => assert.ok(!cell.formula)));
        } else assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
        pass('saved ordinary candidate download', {
          role: user.role,
          id,
          format,
          file,
          bytes: bytes.length,
          sha256: hash,
          operation: request.headers['x-report-operation'],
        });
      }
      if (id === 'client-judgments') {
        await page.locator('#report-from').fill('9998-12-31');
        assert.equal(await page.locator('a[download]').count(), 0);
        await page.getByRole('button', { name: t.reports.run, exact: true }).click();
        await page.getByText(t.reports.noRows, { exact: true }).waitFor();
        await page.locator('#report-from').fill('0001-01-01');
        assert.equal(
          await page.getByRole('heading', { name: t.reports.result, exact: true }).count(),
          0,
        );
        await page.getByRole('button', { name: t.reports.clear, exact: true }).click();
        assert.equal(await page.locator('#report-client').inputValue(), '');
        assert.equal(await page.locator('#report-from').inputValue(), '');
        assert.equal(await page.locator('#report-to').inputValue(), '');
        pass('validation, stale download/preview, empty result and reset', { role: user.role });
      }
    }
    await context.close();
  }
  const after = await events(),
    added = after.slice(before.length);
  put('audit-window', added);
  assert.equal(added.filter((e) => e.action === 'export_completed').length, 16);
  for (const request of requests.filter((r) => r.status === 200)) {
    const correlated = added.filter(
      (e) => e.correlation_id === request.headers['x-report-operation'],
    );
    assert.ok(correlated.length);
    if (request.path.endsWith('/export')) {
      const e = correlated.find((e) => e.action === 'export_completed');
      assert.ok(e);
      assert.equal(e.event_metadata.sha256, request.headers['x-artifact-sha256']);
      assert.equal(e.event_metadata.bytes, Number(request.headers['content-length']));
    }
  }
  assert.equal(errors.length, 0);
  assert.equal(external.length, 0);
  put('requests', requests);
  pass('two report ordinary browser cycle', {
    roles: logins.map((x) => x.role),
    events: added.length,
    errors,
    external,
    scope:
      'Incremental contact/judgment proof; final nine-report and accessibility matrix still required',
  });
}
try {
  await main();
} catch (e) {
  writeFileSync(
    join(priv, 'browser-' + out.split(/[\\/]/).at(-1) + '-failure.txt'),
    String(e.stack),
  );
  console.error('Client-report browser proof failed; private diagnostic retained');
  process.exitCode = 1;
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  await browser?.close();
  if (app) {
    app.kill();
    await new Promise((r) => {
      if (app.exitCode !== null) return r();
      app.once('exit', r);
      setTimeout(r, 5000);
    });
  }
  writeFileSync(
    join(out, 'server.log'),
    log.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[private URL]'),
  );
  put('cleanup', {
    pid: app?.pid,
    build,
    exitCode: app?.exitCode,
    signalCode: app?.signalCode,
    browserClosed: true,
  });
}
