import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { t } from '../../src/strings.ts';
import { mutateHearingLifecycle, readHearingLifecycle } from '../../src/lib/hearing-lifecycle.ts';
import { lifecycleSessions } from './matter-lifecycle-proof.ts';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata.ts';
import { proveStaffBrowserZoom } from './staff-accessibility-browser.mjs';

export async function hearingLifecycleBrowserProof({
  page,
  context,
  accounts,
  login,
  goto,
  audit,
  screenshot,
  evidence,
  inspect,
  runtime,
  createdId,
}) {
  const id = createdId,
    detail = `/hearings/${id}?archive=all&q=TEST`,
    archive = `/hearings/${id}/archive?archive=all&q=TEST`;
  await context.clearCookies();
  await goto(archive);
  assert.equal(new URL(page.url()).pathname, '/login');
  for (const account of accounts) {
    await login(account);
    await goto(detail);
    assert.equal(
      await page.getByRole('heading', { name: t.hearings.identity(id), exact: true }).count(),
      1,
    );
    if (account.roleCode !== 'Administrator') {
      assert.equal(
        await page.getByRole('link', { name: t.hearings.lifecycle.archive, exact: true }).count(),
        0,
      );
      await goto(archive);
      assert.equal(
        await page.getByRole('button', { name: t.hearings.lifecycle.archive, exact: true }).count(),
        0,
      );
      await goto(`/hearings/${id}/edit`);
      assert.equal(
        await page.getByRole('button', { name: t.common.save, exact: true }).count(),
        account.roleCode === 'Litigation Assistant' ? 1 : 0,
      );
    }
  }
  const adminAccount = accounts.find((a) => a.roleCode === 'Administrator');
  await login(adminAccount);
  await goto(archive);
  const trigger = () =>
    page.getByRole('button', { name: t.hearings.lifecycle.archive, exact: true });
  await trigger().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  assert.equal(
    await dialog
      .getByRole('button', { name: t.common.cancel, exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.keyboard.press('Escape');
  assert.equal(await trigger().evaluate((e) => e === document.activeElement), true);
  await trigger().click();
  await audit('archive-confirmation-desktop');
  await screenshot('archive-confirmation-desktop');
  await page.setViewportSize({ width: 320, height: 800 });
  await audit('archive-confirmation-320');
  await screenshot('archive-confirmation-320');
  await proveStaffBrowserZoom({
    context,
    page,
    audit,
    screenshot,
    evidence,
    name: 'archive-confirmation-200-percent',
  });
  await dialog.getByRole('button', { name: t.clients.manage.confirm, exact: true }).click();
  await page.waitForURL((u) => u.pathname === `/hearings/${id}`);
  await page.waitForLoadState('networkidle');
  await page.locator(`main[data-hearing-id="${id}"]`).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('archive'), 'all');
  assert.ok(await page.getByText(t.hearings.lifecycle.archivedNotice, { exact: true }).count());
  await audit('archived-detail');
  await screenshot('archived-detail');
  await goto(`/hearings/${id}/edit`);
  assert.equal(await page.getByRole('button', { name: t.common.save, exact: true }).count(), 0);
  await login(accounts.find((a) => a.roleCode === 'Litigation Assistant'));
  await goto(`/hearings/${id}/edit`);
  assert.ok(await page.getByText(t.hearings.lifecycle.archivedNotice, { exact: true }).count());
  await login(adminAccount);
  await goto(`/hearings?archive=archived&q=TEST`);
  assert.ok(await page.locator(`a[href^="/hearings/${id}?"]`).count());
  await goto(`/hearings/${id}/restore?archive=all&q=TEST`);
  await page.getByRole('button', { name: t.hearings.lifecycle.restore, exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: t.clients.manage.confirm, exact: true })
    .click();
  await page.waitForURL((u) => u.pathname === `/hearings/${id}`);
  await page.waitForLoadState('networkidle');
  await page.locator(`main[data-hearing-id="${id}"]`).waitFor();
  await goto(archive);
  const admin = (await lifecycleSessions(runtime)).find((s) => s.user.role === 'Administrator');
  const st = await readHearingLifecycle(admin, 'archive', id, runtime);
  await mutateHearingLifecycle(
    admin,
    'archive',
    {
      id,
      confirmation: id,
      version: st.version,
      facts: st.facts,
      action: 'archive',
      submission: randomUUID(),
    },
    { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
  );
  await trigger().click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: t.clients.manage.confirm, exact: true })
    .click();
  await page.getByRole('alert').filter({ hasText: t.hearings.lifecycle.stale }).waitFor();
  assert.ok(
    await page.getByRole('link', { name: t.hearings.lifecycle.reload, exact: true }).count(),
  );
  await audit('stale-confirmation-recovery');
  await screenshot('stale-confirmation-recovery');
  await page.getByRole('link', { name: t.hearings.lifecycle.reload, exact: true }).click();
  const end = await readHearingLifecycle(admin, 'restore', id, runtime);
  await mutateHearingLifecycle(
    admin,
    'restore',
    {
      id,
      confirmation: id,
      version: end.version,
      facts: end.facts,
      action: 'restore',
      submission: randomUUID(),
    },
    { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
  );
  await inspect(async (db) => {
    await db.query(
      "CREATE FUNCTION public.task43_browser_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST ONLY browser lifecycle failure'; END $$; CREATE TRIGGER task43_browser_fault BEFORE INSERT ON _migration.hearing_edit_change FOR EACH ROW EXECUTE FUNCTION public.task43_browser_fault()",
    );
  });
  try {
    await goto(archive);
    await trigger().click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: t.clients.manage.confirm, exact: true })
      .click();
    await page.getByRole('alert').filter({ hasText: t.hearings.manage.errors.generic }).waitFor();
    await audit('failed-action-recovery');
  } finally {
    await inspect((db) =>
      db.query(
        'DROP TRIGGER task43_browser_fault ON _migration.hearing_edit_change; DROP FUNCTION public.task43_browser_fault()',
      ),
    );
  }
  evidence.push({
    name: 'Hearing lifecycle browser controls',
    roles: 4,
    cancelFocus: true,
    archiveRestore: true,
    filters: true,
    archivedEditRefusal: true,
    staleAndFailedRecovery: true,
    speech: 'Excluded',
    authentication:
      'Task-secret signed sessions validated against copied unchanged accounts; owner password never read or changed',
  });
}
