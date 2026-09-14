import assert from 'node:assert/strict';
import { t } from '../../src/strings.ts';
import { readAdminWork, readAdminWorks } from '../../src/lib/admin-work-query.ts';
import { lifecycleSessions } from './matter-lifecycle-proof.ts';
import { staffReadOnlyState } from './staff-read-only-state.ts';
import { staffFocusProof, proveStaffBrowserZoom } from './staff-accessibility-browser.mjs';

export async function adminWorkBrowserProof({
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
  cases,
  runtime,
}) {
  const before = await inspect(staffReadOnlyState);
  const viewer = (await lifecycleSessions(runtime)).find((s) => s.user.role === 'Lawyer');
  for (const path of ['/admin-works', `/admin-works/${cases.detailId}`]) {
    await goto(path);
    assert.ok(page.url().includes('/login'));
  }
  evidence.push({ name: 'Anonymous list and detail direct URLs refused' });
  for (const account of accounts) {
    await login(account);
    await page.getByRole('link', { name: t.nav.adminWorks, exact: true }).click();
    await page.waitForURL(base + '/admin-works');
    await page.locator('[data-admin-id]').first().waitFor();
    assert.equal(await page.locator('[data-admin-id]').count(), 25);
    await audit(account.roleCode + ' list');
    await goto(`/admin-works/${cases.multilineId}`);
    await audit(account.roleCode + ' detail');
    assert.equal(await page.locator('button').count(), 0);
    const detail = await readAdminWork(viewer, String(cases.multilineId), '1', runtime);
    for (const [label, value] of [
      [t.adminWorks.lastFollowup, detail.lastFollowup],
      [t.adminWorks.createdDate, detail.taskCreatedDate],
      [t.adminWorks.requiredWork, detail.requiredWork],
    ]) {
      const values = await page
        .locator('dl > div')
        .evaluateAll(
          (nodes, label) =>
            nodes
              .filter((n) => n.querySelector('dt')?.textContent === label)
              .map((n) => n.querySelector('dd')?.textContent),
          label,
        );
      assert.deepEqual(values, [
        (value?.trim() ? value : t.common.notRecorded).replace(/\r\n|\r/g, '\n'),
      ]);
    }
    assert.deepEqual(
      await page
        .locator('[data-step-id]')
        .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.stepId))),
      detail.steps.map((s) => s.id),
    );
  }
  await screenshot('admin-detail-desktop');
  await goto('/admin-works?page=2');
  await screenshot('admin-list-desktop');
  await page.locator('[data-admin-id] h3 a').first().click();
  await page.waitForURL(/\/admin-works\/\d+\?page=2/);
  await page.getByRole('link', { name: t.adminWorks.back, exact: true }).click();
  await page.waitForURL(base + '/admin-works?page=2');
  await page.getByRole('link', { name: t.clients.next, exact: true }).click();
  await page.waitForURL(base + '/admin-works?page=3');
  await page.getByRole('link', { name: t.clients.previous, exact: true }).click();
  await page.waitForURL(base + '/admin-works?page=2');
  await goto(`/admin-works/${cases.manyId}?q=test&page=2`);
  const seen = [];
  for (let p = 1; p <= Math.ceil(cases.manyCount / 25); p++) {
    seen.push(
      ...(await page
        .locator('[data-step-id]')
        .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.stepId)))),
    );
    if (p < Math.ceil(cases.manyCount / 25)) {
      await page.getByRole('link', { name: t.clients.next, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get('stepPage') === String(p + 1));
      assert.equal(new URL(page.url()).searchParams.get('q'), 'test');
    }
  }
  assert.equal(seen.length, cases.manyCount);
  assert.equal(new Set(seen).size, cases.manyCount);
  await audit('Last page of 53-step history');
  await page.getByRole('link', { name: t.adminWorks.back, exact: true }).click();
  await page.waitForURL(base + '/admin-works?q=test&page=2');
  evidence.push({
    name: 'List/detail/back and step pagination preserve filters with distinct complete rendered step identities',
  });
  await goto('/admin-works');
  await page.getByLabel(t.adminWorks.person, { exact: true }).selectOption('missing');
  await page.getByLabel(t.adminWorks.status, { exact: true }).selectOption('missing');
  await page.getByRole('button', { name: t.clients.apply, exact: true }).click();
  await page.waitForURL(
    (u) => u.searchParams.get('person') === 'missing' && u.searchParams.get('status') === 'missing',
  );
  const expected = await readAdminWorks(viewer, { person: 'missing', status: 'missing' }, runtime);
  assert.deepEqual(
    await page
      .locator('[data-admin-id]')
      .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.adminId))),
    expected.rows.map((r) => r.id),
  );
  await audit('Missing person/status intersection');
  await page.getByRole('link', { name: t.clients.clear, exact: true }).click();
  await page.waitForURL(base + '/admin-works');
  await page.keyboard.press('Tab');
  await staffFocusProof(page);
  await page.getByLabel(t.adminWorks.search, { exact: true }).focus();
  await page.keyboard.type('__NO_TASK__');
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => u.searchParams.get('q') === '__NO_TASK__');
  await page.getByText(t.adminWorks.empty, { exact: true }).waitFor();
  await audit('Keyboard search and empty result');
  await screenshot('admin-empty-search');
  for (const path of [
    '/admin-works?page=0',
    '/admin-works?person=2147483647',
    `/admin-works/${cases.detailId}?stepPage=0`,
  ]) {
    await goto(path);
    await page.getByText(t.clients.invalidFilters, { exact: true }).waitFor();
    await audit('Invalid query ' + path);
  }
  await screenshot('admin-invalid');
  await goto('/admin-works/2147483647');
  await page.getByText(t.adminWorks.notFoundHint, { exact: true }).waitFor();
  await audit('Missing record');
  await goto(`/admin-works/${cases.emptyId}`);
  await page.getByText(t.adminWorks.noSteps, { exact: true }).waitFor();
  await audit('Empty history');
  await screenshot('admin-empty-history');
  await goto(`/admin-works/${cases.edgeId}`);
  await page.getByText('TEST ONLY duplicate work', { exact: true }).waitFor();
  assert.equal(await page.locator('main script').count(), 0);
  await audit('Synthetic missing parent/raw person, literal markup and long multiline content');
  await page.setViewportSize({ width: 320, height: 900 });
  await audit('Synthetic long multiline content 320px');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [name, path] of [
    ['list', '/admin-works'],
    ['detail', `/admin-works/${cases.multilineId}`],
  ]) {
    await goto(path);
    await page.setViewportSize({ width: 320, height: 900 });
    await audit(name + ' 320px');
    await screenshot('admin-' + name + '-320');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await proveStaffBrowserZoom({
      context,
      page,
      audit,
      screenshot,
      evidence,
      name: 'admin-' + name,
    });
  }
  assert.deepEqual(await inspect(staffReadOnlyState), before);
  evidence.push({
    name: 'All rendered business reads preserve all table, audit, sequence and catalog digests; fixture sessions use independent secret',
  });
}
