import assert from 'node:assert/strict';
import { t } from '../../src/strings.ts';
import { proveStaffBrowserZoom, staffFocusProof } from './staff-accessibility-browser.mjs';

export async function proveMatterEditorBrowser({
  page,
  context,
  base,
  accounts,
  login,
  goto,
  audit,
  screenshot,
  evidence,
  inspect,
}) {
  const count = () =>
    inspect(async (db) => Number((await db.query('SELECT count(*) FROM matters')).rows[0].count));
  let captured;
  const timings = [];
  page.on('requestfinished', (request) => {
    const url = new URL(request.url());
    if (url.origin === base && url.pathname.startsWith('/matters'))
      timings.push({
        path: url.pathname,
        method: request.method(),
        milliseconds: request.timing().responseEnd,
      });
  });
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.headers()['next-action'] &&
      new URL(request.url()).pathname.startsWith('/matters/')
    )
      captured = {
        path: new URL(request.url()).pathname,
        headers: {
          'content-type': request.headers()['content-type'],
          'next-action': request.headers()['next-action'],
        },
        body: request.postDataBuffer(),
      };
  });
  for (const account of accounts.filter((a) =>
    ['Administrator', 'Litigation Assistant'].includes(a.roleCode),
  )) {
    await login(account);
    const suffix = '?client=111&page=2';
    await goto('/matters' + suffix);
    await page.getByRole('link', { name: t.matters.manage.create, exact: true }).click();
    await page.getByRole('heading', { name: t.matters.manage.create, exact: true }).waitFor();
    await page.getByRole('link', { name: t.matters.manage.cancel, exact: true }).click();
    assert.equal(new URL(page.url()).search, '?client=111&page=2');
    await goto('/matters/new' + suffix);
    await page
      .getByLabel(t.fields.caseNumber, { exact: true })
      .fill('TEST ONLY browser\n140J\n140ق');
    await page.getByLabel(t.fields.subject, { exact: true }).fill('TEST ONLY ' + account.roleCode);
    await page.getByRole('button', { name: t.matters.manage.addParty, exact: true }).click();
    await page
      .getByLabel(t.matters.manage.partyName, { exact: true })
      .fill('TEST ONLY party\nsecond line');
    await page.getByLabel(t.matters.manage.gender, { exact: true }).selectOption('f');
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: t.matters.manage.addCapacity, exact: true }).click();
      const select = page.getByLabel(t.matters.manage.capacity, { exact: true }).nth(i);
      const values = await select
        .locator('option')
        .evaluateAll((nodes) => nodes.filter((n) => n.value && !n.disabled).map((n) => n.value));
      await select.selectOption(values[i]);
    }
    const ordered = await page
      .getByLabel(t.matters.manage.capacity, { exact: true })
      .evaluateAll((nodes) => nodes.map((n) => n.value));
    const up = page
      .getByRole('group', { name: t.matters.manage.capacity + ' 2', exact: true })
      .getByRole('button', { name: t.matters.manage.up, exact: true });
    await up.focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(
      await page
        .getByLabel(t.matters.manage.capacity, { exact: true })
        .evaluateAll((nodes) => nodes.map((n) => n.value)),
      ordered.reverse(),
    );
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: t.matters.manage.addLawyer, exact: true }).click();
      const select = page.getByLabel(t.matters.filters.lawyer, { exact: true }).nth(i);
      const values = await select
        .locator('option')
        .evaluateAll((nodes) => nodes.filter((n) => n.value && !n.disabled).map((n) => n.value));
      await select.selectOption(values[i]);
      await page
        .getByLabel(t.matters.manage.role, { exact: true })
        .nth(i)
        .selectOption(['lead', 'co_lead', 'support'][i]);
    }
    await page.getByLabel(t.matters.askedAmount, { exact: true }).fill('1e3');
    await page.getByRole('button', { name: t.matters.manage.save, exact: true }).click();
    await page.locator('main [role="alert"]').waitFor();
    assert.equal(
      await page.getByLabel(t.fields.caseNumber, { exact: true }).inputValue(),
      'TEST ONLY browser\n140J\n140ق',
    );
    assert.equal(await page.getByLabel(t.matters.manage.capacity, { exact: true }).count(), 2);
    assert.equal(
      await page.locator('main [role="alert"]').evaluate((el) => el === document.activeElement),
      true,
    );
    await audit(account.roleCode + ' editor validation');
    await screenshot('editor-' + account.roleCode + '-error');
    await page.getByLabel(t.matters.askedAmount, { exact: true }).fill('12345.67');
    await page.keyboard.press('Tab');
    evidence.push({ name: 'Editor keyboard focus', proof: await staffFocusProof(page) });
    await audit(account.roleCode + ' editor desktop');
    await screenshot('editor-' + account.roleCode + '-desktop');
    await page.setViewportSize({ width: 320, height: 900 });
    await audit(account.roleCode + ' editor 320');
    await screenshot('editor-' + account.roleCode + '-320');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await proveStaffBrowserZoom({
      context,
      page,
      audit,
      screenshot,
      evidence,
      name: 'editor-' + account.roleCode,
    });
    const before = await count();
    // Send once, let the server commit, then lose only its response.
    let responseLost = false;
    await page.route('**/matters/new?**', async (route) => {
      if (route.request().method() === 'POST' && !responseLost) {
        responseLost = true;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: t.matters.manage.save, exact: true }).click();
    await page.getByRole('alert').filter({ hasText: t.matters.manage.errors.generic }).waitFor();
    assert.equal(await count(), before + 1);
    await page.unroute('**/matters/new?**');
    await page.getByRole('button', { name: t.matters.manage.save, exact: true }).click();
    await page.getByRole('link', { name: t.matters.backMatter, exact: true }).waitFor();
    assert.equal(await count(), before + 1);
    await page.getByRole('link', { name: t.matters.backMatter, exact: true }).click();
    await page.locator('main[data-matter-id]').waitFor();
    const id = Number(await page.locator('main').getAttribute('data-matter-id'));
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    await page.getByRole('link', { name: t.matters.manage.edit, exact: true }).click();
    await page.getByRole('heading', { name: t.matters.manage.edit, exact: true }).waitFor();
    const stale = await context.newPage();
    try {
      await stale.goto(page.url(), { waitUntil: 'networkidle' });
      await stale
        .getByLabel(t.matters.notes1, { exact: true })
        .fill('TEST ONLY retained stale input');
      await page.getByLabel(t.matters.notes1, { exact: true }).fill('TEST ONLY winner');
      await page.getByRole('button', { name: t.matters.manage.save, exact: true }).click();
      await page.getByRole('link', { name: t.matters.backMatter, exact: true }).waitFor();
      await stale.getByRole('button', { name: t.matters.manage.save, exact: true }).click();
      await stale.getByRole('alert').filter({ hasText: t.matters.manage.errors.stale }).waitFor();
      assert.equal(
        await stale.getByLabel(t.matters.notes1, { exact: true }).inputValue(),
        'TEST ONLY retained stale input',
      );
      await stale.getByRole('link', { name: t.matters.manage.reload, exact: true }).click();
      await stale.getByLabel(t.matters.notes1, { exact: true }).waitFor();
      assert.equal(
        await stale.getByLabel(t.matters.notes1, { exact: true }).inputValue(),
        'TEST ONLY winner',
      );
    } finally {
      await stale.close();
    }
    evidence.push({
      name:
        account.roleCode +
        ' create/edit, arrays, validation, retained input, lost-response retry and stale reload',
      id,
    });
  }
  assert.ok(captured, 'Actual Server Action request captured');
  for (const account of accounts.filter((a) => ['Lawyer', 'Paralegal'].includes(a.roleCode))) {
    await login(account);
    await goto('/matters');
    assert.equal(
      await page.getByRole('link', { name: t.matters.manage.create, exact: true }).count(),
      0,
    );
    const before = await count();
    const response = await context.request.post(base + captured.path, {
      headers: captured.headers,
      data: captured.body,
      maxRedirects: 0,
    });
    const redirect = response.headers()['x-action-redirect'] ?? '';
    const body = await response.text();
    const denied =
      response.status() === 403 ||
      (response.status() === 500 && body.includes('"digest"')) ||
      redirect.includes('/forbidden') ||
      (body.includes('NEXT_REDIRECT') && body.includes('/forbidden'));
    evidence.push({
      name: account.roleCode + ' forged action denial transport',
      status: response.status(),
      redirect,
      denied,
    });
    assert.ok(denied, 'Forged Server Action must carry an explicit forbidden response or redirect');
    assert.equal(await count(), before);
    for (const path of ['/matters/new', '/matters/1/edit']) {
      await goto(path);
      assert.ok(page.url().includes('/forbidden'));
    }
    evidence.push({
      name:
        account.roleCode + ' denied controls, direct pages and forged real Server Action request',
    });
  }
  evidence.push({
    name: 'Local form/document/Server Action HTTP measurements; no production latency guarantee',
    timings,
  });
}
