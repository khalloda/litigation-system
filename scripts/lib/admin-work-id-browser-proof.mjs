import assert from 'node:assert/strict';
import { t } from '../../src/strings.ts';
import { staffReadOnlyState } from './staff-read-only-state.ts';
export async function adminIdBrowserProof({
  cases,
  page,
  accounts,
  login,
  goto,
  base,
  evidence,
  screenshot,
  inspect: browserInspect,
}) {
  const beforeBrowser = await browserInspect(staffReadOnlyState);
  await login(accounts.find((a) => a.roleCode === 'Lawyer'));
  for (const branch of ['id', 'legacy_id']) {
    const c = cases.find((c) => c.branch === branch && c.western.includes('0'));
    assert.ok(c);
    for (const q of [c.western, c.arabic]) {
      await goto('/admin-works');
      await page.getByLabel(t.adminWorks.search, { exact: true }).fill(q);
      await page.getByRole('button', { name: t.clients.apply, exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get('q') === q);
      await page.locator('[data-admin-id]').first().waitFor();
      assert.deepEqual(
        await page
          .locator('[data-admin-id]')
          .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.adminId))),
        c.expectedIds.slice(0, 25),
      );
      await page.getByText(t.adminWorks.results(c.expectedIds.length), { exact: true }).waitFor();
      await page.locator(`[data-admin-id="${c.id}"] h3 a`).click();
      await page.waitForURL(
        (u) => u.pathname === `/admin-works/${c.id}` && u.searchParams.get('q') === q,
      );
      await page.getByRole('link', { name: t.adminWorks.back, exact: true }).click();
      await page.waitForURL(
        (u) => u.origin === base && u.pathname === '/admin-works' && u.searchParams.get('q') === q,
      );
      await page.locator('[data-admin-id]').first().waitFor();
      await screenshot(`id-search-${branch}-${q === c.western ? 'western' : 'arabic'}`);
      evidence.push({
        branch,
        q,
        selectedId: c.id,
        expectedIds: c.expectedIds,
        count: c.expectedIds.length,
        listDetailBack: true,
      });
    }
  }
  assert.deepEqual(await browserInspect(staffReadOnlyState), beforeBrowser);
}
