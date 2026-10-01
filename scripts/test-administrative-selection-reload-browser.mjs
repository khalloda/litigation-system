import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { t } from '../src/strings.ts';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture.ts';

// A real production fixture and genuine fixture sessions are prerequisites.
// No account creation, owner target, migration or implicit test retry is permitted here.
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const fixture = JSON.parse(fs.readFileSync(config.fixtureFile, 'utf8'));
const launch = JSON.parse(fs.readFileSync(config.launchFile, 'utf8'));
const url = new URL(config.base);
assert.equal(url.hostname, '127.0.0.1');
assert.notEqual(url.port, '3000');
assert.equal(Number(url.port), launch.port);
assert.equal(fixture.clusterId, launch.cluster);
assert.notEqual(fixture.clusterId, fixture.sourceClusterId);
assert.notEqual(new URL(fixture.migrationUrl).port, '5433');
assert.ok(!fs.existsSync(config.output), 'Reconcile a previous attempt before retrying');
fs.mkdirSync(config.output);
const require = createRequire(path.join(config.artifact, 'package.json'));
const { chromium } = require('playwright');
const { Client } = require('pg');
const result = {
  startedAt: new Date().toISOString(),
  source: launch.source,
  build: launch.build,
  cases: [],
  requests: [],
};
const save = () =>
  fs.writeFileSync(path.join(config.output, 'progress.json'), JSON.stringify(result, null, 2));
async function state() {
  const db = new Client({ connectionString: fixture.migrationUrl });
  await db.connect();
  try {
    await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
    await db.query('BEGIN READ ONLY');
    const data = {};
    for (const kind of ['hearing', 'step']) {
      data[kind] = (
        await db.query(`SELECT * FROM public.administrative_${kind}_report_selections ORDER BY id`)
      ).rows;
      data[kind + 'Receipts'] = (
        await db.query(
          `SELECT * FROM _migration.administrative_${kind}_report_selection_submission ORDER BY created_at,submission_id`,
        )
      ).rows;
      data[kind + 'History'] = (
        await db.query(
          `SELECT * FROM _migration.administrative_${kind}_report_selection_change ORDER BY record_id,version`,
        )
      ).rows;
    }
    data.audit = (
      await db.query('SELECT id::text,action,entity_table,entity_key FROM audit_events ORDER BY id')
    ).rows;
    return JSON.parse(JSON.stringify(data));
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
}
function oneEffect(before, after, kind, id) {
  assert.equal(after[kind + 'Receipts'].length, before[kind + 'Receipts'].length + 1);
  assert.equal(after[kind + 'History'].length, before[kind + 'History'].length + 1);
  assert.equal(after.audit.length, before.audit.length + 1);
  const added = after[kind + 'Receipts'].filter(
    (r) => !before[kind + 'Receipts'].some((b) => b.submission_id === r.submission_id),
  );
  assert.equal(added[0].record_id, id);
  assert.equal(added[0].changed, true);
}
const forms = (p) => p.locator('form').filter({ has: p.locator('input[name=selected]') });
const form = (p, id) =>
  forms(p).filter({ has: p.getByRole('heading', { name: new RegExp('\\(' + id + '\\)$') }) });
async function submit(p, id, value, expected) {
  const row = form(p, id);
  await row.locator('input').setChecked(value);
  await row.getByRole('button', { name: t.reportSelection.save, exact: true }).click();
  await row.getByRole('status').filter({ hasText: expected }).waitFor();
  await p.waitForFunction(() => document.activeElement?.getAttribute('role') === 'status');
}
let browser;
try {
  result.before = await state();
  browser = await chromium.launch({
    executablePath: config.chromium,
    headless: true,
    proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1' },
  });
  async function context(role, narrow = false) {
    const c = await browser.newContext({
      storageState: config.sessions[role],
      viewport: { width: narrow ? 390 : 1440, height: 1000 },
    });
    c.on('page', (p) => {
      p.setDefaultTimeout(20000);
      p.on('request', (r) => {
        if (
          r.method() === 'POST' &&
          new URL(r.url()).pathname === '/reports/administrative-selection'
        ) {
          result.requests.push({ role, body: r.postData(), at: new Date().toISOString() });
          save();
        }
      });
    });
    return c;
  }
  const route = (e) =>
    config.base +
    '/reports/administrative-selection?' +
    new URLSearchParams({
      kind: e.kind,
      client: String(e.client),
      parent: String(e.parent),
      page: '1',
    });
  async function reload(p, id, expected, record, keyboard = false) {
    const row = form(p, id),
      before = await state(),
      href = await row
        .getByRole('link', { name: t.reportSelection.reload, exact: true })
        .getAttribute('href');
    let accept = false;
    const dialogs = [];
    const handler = async (d) => {
      dialogs.push({ accept, type: d.type(), message: d.message() });
      if (accept) await d.accept();
      else await d.dismiss();
    };
    p.on('dialog', handler);
    const oldUrl = p.url();
    await row.getByRole('link', { name: t.reportSelection.reload, exact: true }).click();
    assert.equal(p.url(), oldUrl);
    assert.equal(await row.locator('input').isChecked(), expected);
    assert.deepEqual(await state(), before);
    accept = true;
    const navigation = p.waitForEvent(
      'request',
      (r) => r.isNavigationRequest() && r.method() === 'GET',
    );
    const link = row.getByRole('link', { name: t.reportSelection.reload, exact: true });
    if (keyboard) {
      await link.focus();
      await p.keyboard.press('Enter');
    } else await link.click();
    const request = await navigation;
    await p.waitForLoadState('load');
    await form(p, id).waitFor();
    assert.equal(new URL(request.url()).pathname, '/reports/administrative-selection');
    assert.equal(p.url(), new URL(href, config.base).href);
    assert.equal(await form(p, id).locator('input').isChecked(), expected);
    assert.equal(await form(p, id).getByRole('status').textContent(), '');
    assert.equal(
      await form(p, id)
        .getByRole('button', { name: t.reportSelection.save, exact: true })
        .isDisabled(),
      true,
    );
    assert.deepEqual(await state(), before);
    p.off('dialog', handler);
    record.reload = {
      dialogs,
      documentGet: request.url(),
      cancelledDraftPreserved: true,
      bothReloadsNoWrite: true,
      keyboard,
    };
  }
  for (const e of config.existing) {
    const c = await context(e.role, e.kind === 'hearing'),
      a = await c.newPage(),
      b = await c.newPage();
    await a.goto(route(e));
    await b.goto(route(e));
    const initial = await form(a, e.id).locator('input').isChecked(),
      record = { name: e.kind + ' selection conflict', ...e, initial };
    result.cases.push(record);
    save();
    const before = await state();
    await submit(a, e.id, !initial, t.administrativeSelection.saved);
    const changed = await state();
    oneEffect(before, changed, e.kind, e.id);
    await submit(b, e.id, !initial, t.reportSelection.errors.stale);
    assert.deepEqual(await state(), changed);
    await b.screenshot({ path: path.join(config.output, e.kind + '-stale.png'), fullPage: true });
    await reload(b, e.id, !initial, record, e.kind === 'hearing');
    await submit(b, e.id, initial, t.administrativeSelection.saved);
    oneEffect(changed, await state(), e.kind, e.id);
    await b.screenshot({
      path: path.join(config.output, e.kind + '-recovered.png'),
      fullPage: true,
    });
    record.status = 'PASS';
    save();
    await c.close();
  }
  for (const e of config.synthetic) {
    const c = await context(0),
      p = await c.newPage();
    await p.goto(route(e));
    const first = form(p, e.ids[0]),
      other = form(p, e.ids[1]);
    const initial = await first.locator('input').isChecked(),
      otherInitial = await other.locator('input').isChecked();
    await other.locator('input').setChecked(!otherInitial);
    await submit(p, e.ids[0], !initial, t.administrativeSelection.saved);
    assert.equal(await other.locator('input').isChecked(), !otherInitial);
    assert.equal(
      await other.getByRole('button', { name: t.reportSelection.save, exact: true }).isEnabled(),
      true,
    );
    const record = { name: e.kind + ' other draft survives Save/refresh', status: 'PASS' };
    result.cases.push(record);
    save();
    p.on('dialog', (d) => d.accept());
    await p.reload();
    p.removeAllListeners('dialog');
    for (const variant of ['parent', 'record']) {
      const current = await form(p, e.ids[0]).locator('input').isChecked();
      const command = spawnSync(
        process.execPath,
        [
          config.mutationWrapper,
          'r1-' + e.kind + '-' + variant,
          'r1-fixture.ts',
          e.kind + '-' + variant,
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 60000 },
      );
      assert.equal(command.status, 0, 'Inspect retained mutation receipt before retry');
      const afterMutation = await state();
      await submit(p, e.ids[0], !current, t.reportSelection.errors.stale);
      assert.deepEqual(await state(), afterMutation);
      // The draft differs from stored state in this case. Deliberate reload discards it.
      const r = { name: e.kind + ' ' + variant + ' version conflict' };
      result.cases.push(r);
      const row = form(p, e.ids[0]);
      let accept = false;
      const dialogs = [];
      const handler = async (d) => {
        dialogs.push({ accept, type: d.type() });
        if (accept) await d.accept();
        else await d.dismiss();
      };
      p.on('dialog', handler);
      await row.getByRole('link', { name: t.reportSelection.reload, exact: true }).click();
      assert.equal(await row.locator('input').isChecked(), !current);
      assert.deepEqual(await state(), afterMutation);
      accept = true;
      const nav = p.waitForEvent('request', (x) => x.isNavigationRequest() && x.method() === 'GET');
      await row.getByRole('link', { name: t.reportSelection.reload, exact: true }).click();
      await nav;
      await p.waitForLoadState('load');
      await form(p, e.ids[0]).waitFor();
      p.off('dialog', handler);
      assert.equal(p.url(), route(e));
      assert.equal(await form(p, e.ids[0]).locator('input').isChecked(), current);
      assert.deepEqual(await state(), afterMutation);
      await submit(p, e.ids[0], !current, t.administrativeSelection.saved);
      oneEffect(afterMutation, await state(), e.kind, e.ids[0]);
      r.dialogs = dialogs;
      r.status = 'PASS';
      save();
    }
    const current = await form(p, e.ids[0]).locator('input').isChecked(),
      beforeLoss = await state(),
      start = result.requests.length;
    let intercepted = false;
    await p.route('**/reports/administrative-selection?*', async (r) => {
      if (r.request().method() !== 'POST' || intercepted) return r.continue();
      intercepted = true;
      const response = await r.fetch();
      assert.equal(response.status(), 200);
      await r.abort('failed');
    });
    await submit(p, e.ids[0], !current, t.reportSelection.errors.generic);
    const committed = await state();
    oneEffect(beforeLoss, committed, e.kind, e.ids[0]);
    assert.equal(await form(p, e.ids[0]).locator('input').isDisabled(), true);
    assert.equal(
      await form(p, e.ids[0])
        .getByRole('link', { name: t.reportSelection.reload, exact: true })
        .count(),
      0,
    );
    await p.unroute('**/reports/administrative-selection?*');
    await form(p, e.ids[0])
      .getByRole('button', { name: t.reportSelection.save, exact: true })
      .click();
    await form(p, e.ids[0])
      .getByRole('status')
      .filter({ hasText: t.administrativeSelection.saved })
      .waitFor();
    assert.equal(result.requests.length, start + 2);
    assert.equal(result.requests[start].body, result.requests[start + 1].body);
    assert.deepEqual(await state(), committed);
    result.cases.push({
      name: e.kind + ' response loss retry',
      exactPayloadAndSubmission: true,
      oneReceiptHistoryAudit: true,
      status: 'PASS',
    });
    save();
    await c.close();
  }
  const beforeRoles = await state();
  for (let role = 0; role < 4; role++)
    for (const e of config.existing) {
      const c = await context(role),
        p = await c.newPage();
      await p.goto(route(e));
      const canEdit = role < 2 || (role === 3 && e.kind === 'step');
      assert.equal(await form(p, e.id).locator('input').isEnabled(), canEdit);
      assert.equal(
        await form(p, e.id)
          .getByRole('button', { name: t.reportSelection.save, exact: true })
          .count(),
        canEdit ? 1 : 0,
      );
      result.cases.push({ name: 'role ' + role + ' ' + e.kind, canEdit, status: 'PASS' });
      await c.close();
    }
  assert.deepEqual(await state(), beforeRoles);
  result.after = await state();
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.error = error.message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(config.output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({ status: result.status, cases: result.cases.length, error: result.error }),
  );
}
