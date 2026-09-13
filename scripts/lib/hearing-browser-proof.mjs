import assert from 'node:assert/strict';
import { t } from '../../src/strings.ts';
import { readHearing, readHearings } from '../../src/lib/hearing-query.ts';
import { lifecycleSessions } from './matter-lifecycle-proof.ts';
import { setMatterClientArchive } from '../test-matter-read-only.ts';
import { setHearingParentArchive } from '../test-hearing-read-only.ts';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture.ts';
import { staffFocusProof, proveStaffBrowserZoom } from './staff-accessibility-browser.mjs';

export async function hearingBrowserProof({
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
  fixture,
  cases,
  runtime,
}) {
  const session = (await lifecycleSessions(runtime)).find((s) => s.user.role === 'Lawyer');
  for (const path of ['/hearings', `/hearings/${cases.detailId}`]) {
    await goto(path);
    assert.ok(page.url().includes('/login'));
  }
  evidence.push({ name: 'Unauthenticated direct list and detail refused' });
  for (const account of accounts) {
    await login(account);
    await page.getByRole('link', { name: t.nav.hearings, exact: true }).click();
    await page.waitForURL(base + '/hearings');
    await page.locator('[data-hearing-id]').first().waitFor();
    assert.equal(await page.locator('[data-hearing-id]').count(), 25);
    await audit(account.roleCode + ' list');
    await goto(`/hearings/${cases.multilineId}`);
    await audit(account.roleCode + ' detail');
    assert.equal(await page.locator('button').count(), 0);
    const detail = await readHearing(session, String(cases.multilineId), runtime);
    assert.deepEqual(
      await page
        .locator('[data-attendee-id]')
        .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.attendeeId))),
      detail.attendees.map((a) => a.id),
    );
    for (const [label, value] of [
      [t.fields.decision, detail.decision],
      [t.fields.notes, detail.notes],
      [t.fields.hearingDate, detail.hearingDate],
    ]) {
      const node = page
        .locator('dt')
        .filter({ hasText: label })
        .filter({ has: page.locator(':scope') });
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
      void node;
    }
  }
  await login(accounts.find((a) => a.roleCode === 'Lawyer'));
  const path = `/hearings?matter=${cases.parentMatter}&page=2`;
  await goto(path);
  await page.locator('[data-hearing-id] h3 a').first().click();
  await page.waitForURL(/\/hearings\/\d+\?/);
  const detailUrl = page.url();
  await page.locator('a[href^="/matters/"]').first().click();
  await page.waitForURL(/\/matters\//);
  await page.getByRole('link', { name: t.hearings.back, exact: true }).click();
  await page.waitForURL(detailUrl);
  await page.locator('a[href^="/clients/"]').first().click();
  await page.waitForURL(/\/clients\//);
  await page.getByRole('link', { name: t.hearings.back, exact: true }).click();
  await page.waitForURL(detailUrl);
  await page.getByRole('link', { name: t.hearings.back, exact: true }).click();
  await page.waitForURL(base + path);
  await page.getByRole('link', { name: t.clients.next, exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('page') === '3');
  await page.getByRole('link', { name: t.clients.previous, exact: true }).click();
  await page.waitForURL(base + path);
  await goto(`/matters/${cases.parentMatter}?archive=all&page=3`);
  await page.getByRole('link', { name: t.hearings.matterHearings, exact: true }).click();
  await page.waitForURL(/\/hearings\?/);
  assert.ok(new URL(page.url()).searchParams.get('fromMatter').includes('page=3'));
  await page.getByRole('link', { name: t.hearings.backMatter, exact: true }).click();
  await page.waitForURL(base + `/matters/${cases.parentMatter}?archive=all&page=3`);
  evidence.push({
    name: 'Pagination and two-way matter/client return preserve hearing and matter state',
  });
  await goto('/hearings');
  await page.getByLabel(t.hearings.dateField, { exact: true }).selectOption('next');
  await page.getByLabel(t.common.from, { exact: true }).fill('2020-01-01');
  await page.getByLabel(t.common.to, { exact: true }).fill('2025-12-31');
  await page.getByRole('button', { name: t.clients.apply, exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('dateField') === 'next');
  const expected = await readHearings(
    session,
    { dateField: 'next', from: '2020-01-01', to: '2025-12-31' },
    runtime,
  );
  assert.deepEqual(
    await page
      .locator('[data-hearing-id]')
      .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.hearingId))),
    expected.rows.map((h) => h.id),
  );
  await audit('Date-field and range filter');
  await goto('/hearings?matter=missing');
  assert.equal(await page.locator('[data-hearing-id]').count(), 4);
  await audit('Four unassigned hearings');
  await page.locator('[data-hearing-id] h3 a').first().click();
  await page.waitForURL(/\/hearings\//);
  await audit('Unassigned detail');
  for (const [client, matter] of [
    [true, false],
    [true, true],
    [false, true],
    [false, false],
  ]) {
    await setMatterClientArchive(fixture, cases.parentClient, client);
    await setHearingParentArchive(fixture, cases.parentMatter, matter);
    for (const account of accounts) {
      await login(account);
      await goto(`/hearings?matter=${cases.parentMatter}`);
      const rows = await readHearings(session, { matter: String(cases.parentMatter) }, runtime);
      assert.deepEqual(
        await page
          .locator('[data-hearing-id]')
          .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.hearingId))),
        rows.rows.map((h) => h.id),
      );
      await goto(`/hearings/${cases.detailId}`);
      assert.equal(
        await page.getByText(t.matters.lifecycle.archived, { exact: true }).count(),
        matter ? 1 : 0,
      );
      assert.equal(
        await page.getByText(t.clients.archivedNotice, { exact: true }).count(),
        client ? 1 : 0,
      );
    }
    await audit(`Parent archive visibility client=${client} matter=${matter}`);
    if (client && matter) await screenshot('hearing-archived-parents');
  }
  await goto('/hearings?q=__NO_SUCH_HEARING__');
  await page.getByText(t.hearings.empty, { exact: true }).waitFor();
  await audit('No matching results');
  await goto('/hearings?from=2026-02-30');
  assert.equal(
    await page.locator('main [role="alert"]').evaluate((el) => el === document.activeElement),
    true,
  );
  await audit('Invalid date alert focus');
  await goto('/hearings/2147483647');
  await page.getByText(t.hearings.notFoundHint, { exact: true }).waitFor();
  await audit('Not found');
  for (const [name, path] of [
    ['list', '/hearings'],
    ['detail', `/hearings/${cases.multilineId}`],
  ]) {
    await goto(path);
    await screenshot('hearing-' + name + '-desktop');
    await page.keyboard.press('Tab');
    evidence.push({ name: name + ' keyboard focus', proof: await staffFocusProof(page) });
    await audit(name + ' keyboard');
    await page.setViewportSize({ width: 320, height: 900 });
    await audit(name + ' 320 CSS pixels');
    await screenshot('hearing-' + name + '-320');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await proveStaffBrowserZoom({
      context,
      page,
      audit,
      screenshot,
      evidence,
      name: 'hearing-' + name,
    });
  }
  let release, ready;
  const locked = new Promise((r) => {
      ready = r;
    }),
    unlocked = new Promise((r) => {
      release = r;
    });
  const blocker = inspect(async (db) => {
    await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
    await db.query('BEGIN');
    try {
      await db.query('LOCK TABLE hearings IN ACCESS EXCLUSIVE MODE');
      ready();
      await unlocked;
    } finally {
      await db.query('ROLLBACK');
    }
  });
  await locked;
  try {
    const navigation = page.goto(base + '/hearings?q=timeout-proof', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByText(t.common.loading, { exact: true }).waitFor();
    await audit('Loading status');
    await navigation;
    await page.getByText(t.clients.loadError, { exact: true }).waitFor({ timeout: 30000 });
    await audit('Genuine read timeout');
    await screenshot('hearing-query-error');
  } finally {
    release();
    await blocker;
  }
  await page.getByRole('button', { name: t.clients.retry, exact: true }).click();
  await page.getByText(t.hearings.empty, { exact: true }).waitFor();
  await audit('Read timeout retry recovered');
  // Invalidate only the disposable current account via the accepted gateway.
  const { disableManagedAccount } = await import('../../src/lib/auth/user-management.ts');
  const { createMaintenanceAuditMetadata } = await import('../../src/lib/audit-metadata.ts');
  const current = await lifecycleSessions(runtime),
    admin = current.find((s) => s.user.role === 'Administrator'),
    target = accounts.find((a) => a.roleCode === 'Paralegal');
  await login(target);
  await disableManagedAccount(
    Number(admin.user.id),
    {
      accountId: target.id,
      expectedSessionVersion: current.find((s) => Number(s.user.id) === target.id).user
        .sessionVersion,
    },
    { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
  );
  await assert.rejects(
    readHearings(
      current.find((s) => Number(s.user.id) === target.id),
      {},
      runtime,
    ),
  );
  await assert.rejects(
    readHearing(
      current.find((s) => Number(s.user.id) === target.id),
      String(cases.detailId),
      runtime,
    ),
  );
  await goto('/hearings');
  assert.ok(page.url().includes('/login'));
  await goto(`/hearings/${cases.detailId}`);
  assert.ok(page.url().includes('/login'));
  evidence.push({
    name: 'Disabled account session denied at both direct pages and both services',
  });
}
