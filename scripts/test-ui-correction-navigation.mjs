// Regression proof requires an already-owned isolated fixture and genuine test session.
// It never provisions, starts, or authenticates against the owner application.
import path from 'node:path';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture.ts';
import { withApprovedMigrationClient } from './lib/migration-principal.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import pg from 'pg';
const requested = process.env.UI_CORRECTION_FIXTURE_ROOT;
assert.ok(requested && path.isAbsolute(requested));
const H = fs.realpathSync(requested) + path.sep;
assert.ok(H.startsWith(fs.realpathSync('test-results') + path.sep));
const base = 'http://127.0.0.1:3158',
  label = process.argv[2] ?? 'navigation-regression';
assert.match(label, /^[a-z0-9-]+$/u);
assert.ok(!fs.existsSync(H + label + '.json'));
const out = {
  utc: new Date().toISOString(),
  build: fs.readFileSync('.next/BUILD_ID', 'utf8').trim(),
  checks: [],
  requests: [],
};
const f = JSON.parse(fs.readFileSync(H + 'private/fixture.json'));
assert.notEqual(new URL(f.migrationUrl).port, '5433');
Object.assign(process.env, f.environment);
await withApprovedMigrationClient(
  (c) => assertIsolatedTestCluster(c, new URL(f.migrationUrl), f.environment),
  { databaseUrl: f.migrationUrl },
);
const db = new pg.Client({ connectionString: f.migrationUrl });
await db.connect();
assert.equal(
  (await db.query('select system_identifier::text id from pg_control_system()')).rows[0].id,
  f.clusterId,
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Users/Khaled/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
});
let revoked = false;
try {
  const context = await browser.newContext({
      storageState: H + 'private/session-0.json',
      viewport: { width: 1440, height: 1080 },
    }),
    page = await context.newPage();
  page.on('request', (r) => {
    if (r.method() !== 'GET')
      out.requests.push({ url: r.url().replace(base, ''), method: r.method() });
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto(base + '/matters?archive=current&page=2', { waitUntil: 'networkidle' });
    const row = page.locator('a[id^="matter-select-"]').nth(8),
      id = (await row.getAttribute('id')).replace('matter-select-', '');
    await row.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    await row.click();
    await page.waitForURL('**selected=' + id);
    await page.locator('[data-full-matter]').click();
    await page.waitForURL('**workspace=' + id);
    await page.locator('[data-workspace-return]').click();
    await page.waitForURL('**selected=' + id);
    await page.waitForTimeout(300);
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    assert.equal(new URL(page.url()).searchParams.get('selected'), id);
    if (width < 960) {
      await page.locator('aside > a').first().click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('selected'));
    }
    const after = await page.evaluate(() => ({
      scroll: scrollY,
      focus: document.activeElement?.id,
    }));
    assert.equal(after.focus, 'matter-select-' + id);
    assert.ok(Math.abs(after.scroll - before) < 3, JSON.stringify({ before, after }));
    await page.goBack({ waitUntil: 'networkidle' });
    await page.goForward({ waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    if (width >= 960) assert.equal(new URL(page.url()).searchParams.get('selected'), id);
    out.checks.push({
      name: 'full record application return and Back/Forward/reload',
      width,
      id,
      before,
      after,
      status: 'PASS',
    });
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto(base + '/?view=analytics', { waitUntil: 'networkidle' });
  await page.locator('#today-panel form button').click();
  await page.waitForLoadState('networkidle');
  assert.equal(new URL(page.url()).searchParams.get('view'), 'analytics');
  out.checks.push({ name: 'Today Refresh retains analytics', status: 'PASS' });
  const beforeAudit = (await db.query('select count(*)::int n from public.audit_events')).rows[0].n;
  const acl = (
    await db.query(
      "select relacl::text acl from pg_class where oid='public.matter_lawyers'::regclass",
    )
  ).rows[0].acl;
  assert.equal(
    (
      await db.query(
        "select has_table_privilege('litigation_runtime','public.matter_lawyers','SELECT') yes",
      )
    ).rows[0].yes,
    true,
  );
  await db.query('REVOKE SELECT ON public.matter_lawyers FROM litigation_runtime');
  revoked = true;
  await page.reload({ waitUntil: 'networkidle' });
  const workload = page.locator('section[aria-labelledby="workload-title"]');
  assert.equal(await workload.locator('[role=alert]').count(), 1);
  assert.equal(await page.locator('main [role=alert]').count(), 1);
  assert.equal((await page.locator('[data-top-client-id]').count()) > 0, true);
  assert.equal(await page.locator('[data-outcome-row]').count(), 17);
  await page.screenshot({ path: H + label + '-one-panel-failure.png' });
  await db.query('GRANT SELECT ON public.matter_lawyers TO litigation_runtime');
  revoked = false;
  await workload.locator('button').click();
  await page.waitForLoadState('networkidle');
  assert.equal(new URL(page.url()).searchParams.get('view'), 'analytics');
  assert.equal(await page.locator('main [role=alert]').count(), 0);
  assert.equal((await page.locator('[data-lawyer-id]').count()) > 0, true);
  assert.equal(
    (
      await db.query(
        "select relacl::text acl from pg_class where oid='public.matter_lawyers'::regclass",
      )
    ).rows[0].acl,
    acl,
  );
  assert.equal(
    (await db.query('select count(*)::int n from public.audit_events')).rows[0].n,
    beforeAudit,
  );
  out.checks.push({
    name: 'real isolated one-panel query denial, unrelated results, exact ACL restore and analytics retry',
    status: 'PASS',
    auditDelta: 0,
  });
  assert.equal(out.requests.length, 0);
  await context.close();
} catch (e) {
  out.failure = { message: e.message, stack: e.stack };
  process.exitCode = 1;
} finally {
  if (revoked) await db.query('GRANT SELECT ON public.matter_lawyers TO litigation_runtime');
  await browser.close();
  await db.end();
  fs.writeFileSync(H + label + '.json', JSON.stringify(out, null, 2));
}
console.log(JSON.stringify({ checks: out.checks.length, failure: out.failure?.message }));
