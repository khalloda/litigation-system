import assert from 'node:assert/strict';
import { join } from 'node:path';
import { withApprovedMigrationClient } from './migration-principal.ts';
import { t } from '../../src/strings.ts';
import { proveStaffBrowserZoom } from './staff-accessibility-browser.mjs';

/** Actual production Server Actions, real sessions and browser interactions on the owned copy. */
export async function proveClientMutationBrowser({
  page,
  context,
  base,
  goto,
  login,
  accounts,
  fixture,
  cases,
  identities,
  audit,
  screenshot,
  evidence,
}) {
  const inspect = (work) =>
    withApprovedMigrationClient(work, { databaseUrl: fixture.migrationUrl });
  const admin = accounts.find((a) => a.roleCode === 'Administrator');
  const assistant = accounts.find((a) => a.roleCode === 'Litigation Assistant');
  const query = '?q=__PHASE3&status=Potential&archive=all&page=2&contactsPage=2';
  const save = async (target = page) => {
    await target.getByRole('button', { name: t.common.save, exact: true }).click();
    await target.getByRole('status').filter({ hasText: t.clients.manage.saved }).waitFor();
  };
  const error = async (message, target = page) => {
    await target.getByRole('alert').filter({ hasText: message }).waitFor();
    // On retry, the previous error remains visible while the new request is
    // pending. Wait for the completed request's focus handoff as well.
    await target.waitForFunction(() => document.activeElement?.getAttribute('role') === 'alert');
    assert.equal(await target.locator(':focus').getAttribute('role'), 'alert');
  };
  for (const account of accounts) {
    await login(account);
    const canEdit = ['Administrator', 'Litigation Assistant'].includes(account.roleCode);
    const canArchive = account.roleCode === 'Administrator';
    await goto(base + `/clients/${cases.primary}`);
    assert.equal(
      await page
        .getByRole('link', { name: t.clients.manage.titles['client-update'], exact: true })
        .count(),
      canEdit ? 1 : 0,
    );
    assert.equal(
      await page
        .getByRole('link', { name: t.clients.manage.titles['client-archive'], exact: true })
        .count(),
      canArchive ? 1 : 0,
    );
    for (const [path, allowed] of [
      ['/clients/new', canEdit],
      [`/clients/${cases.primary}/edit`, canEdit],
      [`/clients/${cases.primary}/archive`, canArchive],
      [`/clients/${cases.archived}/restore`, canArchive],
      [`/clients/${cases.primary}/contacts/new`, canEdit],
      [`/clients/${cases.primary}/contacts/${cases.contacts[0]}/edit`, canEdit],
      [`/clients/${cases.primary}/contacts/${cases.contacts[0]}/archive`, canArchive],
      [`/clients/${cases.primary}/contacts/${cases.archivedContact}/restore`, canArchive],
    ]) {
      await goto(base + path);
      assert.equal(new URL(page.url()).pathname, allowed ? path : '/forbidden');
    }
    evidence.push({
      name: 'Phase3 route/control permissions ' + account.roleCode,
      paths: 8,
      passed: true,
    });
  }
  await login(admin);
  await goto(base + '/clients/new' + query);
  assert.equal(await page.locator('[name=status]').inputValue(), '');
  assert.equal(await page.locator('[name=cash_or_probono]').inputValue(), '');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await audit('Phase3 new client ' + width);
  }
  await proveStaffBrowserZoom({
    context,
    page,
    audit,
    screenshot,
    evidence,
    name: 'Phase3 client form',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: t.common.save, exact: true }).click();
  await error(t.clients.manage.errors.required);
  await audit('Phase3 validation summary and field association');
  await page.getByRole('link', { name: t.clients.displayName, exact: true }).click();
  assert.equal(await page.locator(':focus').getAttribute('name'), 'name_ar');
  await page.getByLabel(t.clients.displayName, { exact: true }).fill('__PHASE3_BROWSER_JTI');
  await page
    .getByLabel(t.clients.fullName, { exact: true })
    .fill('__PHASE3_BROWSER_FULL\nSECOND LINE');
  await page.getByLabel(t.clients.startDate, { exact: true }).fill('2024-02-29');
  await page.getByLabel(t.clients.status, { exact: true }).selectOption('Potential');
  await page.getByLabel(t.clients.classification, { exact: true }).selectOption('Probono');
  const requestPromise = page.waitForRequest(
    (request) => request.method() === 'POST' && Boolean(request.headers()['next-action']),
  );
  await save();
  const request = await requestPromise;
  // Keep request body only in memory for exact network retry/forged action proofs.
  const captured = {
    url: request.url(),
    headers: {
      'next-action': request.headers()['next-action'],
      'content-type': request.headers()['content-type'],
      origin: base,
    },
    data: request.postDataBuffer(),
  };
  const viewHref = await page
    .getByRole('link', { name: t.clients.manage.view, exact: true })
    .getAttribute('href');
  const created = Number(new URL(viewHref, base).pathname.split('/')[2]);
  assert.ok(created > 0);
  assert.deepEqual(
    Object.fromEntries(new URL(viewHref, base).searchParams),
    Object.fromEntries(new URL(query, base).searchParams),
  );
  const beforeReplay = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT row_version::text version,(SELECT count(*)::integer FROM audit_events) events FROM clients WHERE id=$1',
          [created],
        )
      ).rows[0],
  );
  const retried = await context.request.post(captured.url, {
    headers: captured.headers,
    data: captured.data,
  });
  assert.equal(retried.status(), 200);
  assert.deepEqual(
    await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT row_version::text version,(SELECT count(*)::integer FROM audit_events) events FROM clients WHERE id=$1',
            [created],
          )
        ).rows[0],
    ),
    beforeReplay,
  );
  assert.equal(await page.locator('[name=name_ar]').inputValue(), '__PHASE3_BROWSER_JTI');
  await audit('Phase3 successful creation retains context and prevents double submit');
  for (const account of accounts.filter((a) => ['Lawyer', 'Paralegal'].includes(a.roleCode))) {
    await login(account);
    const denied = await context.request.post(captured.url, {
      headers: captured.headers,
      data: captured.data,
    });
    assert.ok(denied.status() >= 400, 'forged action must not succeed for ' + account.roleCode);
  }
  await context.clearCookies();
  assert.ok(
    (
      await context.request.post(captured.url, { headers: captured.headers, data: captured.data })
    ).status() >= 400,
  );
  captured.data = null;
  await login(assistant);
  await goto(base + `/clients/${created}/edit` + query);
  const beforeNoop = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT row_version::text version,(SELECT count(*)::integer FROM audit_events) events FROM clients WHERE id=$1',
          [created],
        )
      ).rows[0],
  );
  await page.getByRole('button', { name: t.common.save, exact: true }).click();
  await page.getByRole('status').filter({ hasText: t.clients.manage.unchanged }).waitFor();
  assert.deepEqual(
    await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT row_version::text version,(SELECT count(*)::integer FROM audit_events) events FROM clients WHERE id=$1',
            [created],
          )
        ).rows[0],
    ),
    beforeNoop,
  );
  await goto(base + `/clients/${created}/edit` + query);
  await page.getByLabel(t.clients.englishName, { exact: true }).fill('__PHASE3_CANCELLED');
  await page.getByRole('link', { name: t.common.cancel, exact: true }).click();
  await page.waitForURL((url) => url.pathname === `/clients/${created}`);
  assert.equal(new URL(page.url()).searchParams.get('contactsPage'), '2');
  await goto(base + `/clients/${created}/edit` + query);
  const second = await context.newPage();
  try {
    await second.goto(base + `/clients/${created}/edit` + query, { waitUntil: 'networkidle' });
    await second.getByLabel(t.clients.englishName, { exact: true }).fill('__PHASE3_STALE_TYPED');
    await page.getByLabel(t.clients.englishName, { exact: true }).fill('__PHASE3_WINNER');
    await save();
    await second.getByRole('button', { name: t.common.save, exact: true }).click();
    await error(t.clients.manage.errors.stale, second);
    assert.equal(
      await second.getByLabel(t.clients.englishName, { exact: true }).inputValue(),
      '__PHASE3_STALE_TYPED',
    );
    // The action's RSC response has current server props. Retry must still retain the original version.
    await second.getByRole('button', { name: t.common.save, exact: true }).click();
    await error(t.clients.manage.errors.stale, second);
    assert.equal(
      (
        await inspect(
          async (db) =>
            (await db.query('SELECT name_en FROM clients WHERE id=$1', [created])).rows[0],
        )
      ).name_en,
      '__PHASE3_WINNER',
    );
    await second.screenshot({
      path: join(process.env.CLIENT_EVIDENCE_DIR, 'phase3-stale.png'),
      fullPage: true,
    });
  } finally {
    await second.close();
  }
  await goto(base + `/clients/${created}/contacts/new` + query);
  await page.getByLabel(t.clients.contactName, { exact: true }).fill('__PHASE3_CONTACT_BROWSER');
  await page
    .getByLabel(t.clients.secondaryFullName, { exact: true })
    .fill('__PHASE3_SEPARATE_FULL');
  await page.getByLabel(t.clients.email, { exact: true }).fill('TEST@example.invalid');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await audit('Phase3 contact form ' + width);
  }
  await proveStaffBrowserZoom({
    context,
    page,
    audit,
    screenshot,
    evidence,
    name: 'Phase3 contact form',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await save();
  const contactHref = await page
    .getByRole('link', { name: t.clients.manage.view, exact: true })
    .getAttribute('href');
  const contactId = Number(new URL(contactHref, base).pathname.split('/')[4]);
  await goto(base + `/clients/${created}/edit` + query);
  await page.getByLabel(t.clients.mainContact, { exact: true }).selectOption(String(contactId));
  await save();
  await login(admin);
  await goto(base + `/clients/${created}/contacts/${contactId}/archive` + query);
  await page
    .getByRole('button', { name: t.clients.manage.titles['contact-archive'], exact: true })
    .click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.locator(':focus').textContent(), t.common.cancel);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await audit('Phase3 contact confirmation ' + width);
  }
  await proveStaffBrowserZoom({
    context,
    page,
    audit,
    screenshot,
    evidence,
    name: 'Phase3 contact confirmation',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), t.clients.manage.confirm);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), t.common.cancel);
  await page.keyboard.press('Escape');
  assert.equal(
    await page.locator(':focus').textContent(),
    t.clients.manage.titles['contact-archive'],
  );
  await page
    .getByRole('button', { name: t.clients.manage.titles['contact-archive'], exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: t.common.cancel, exact: true })
    .click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(
    await page.locator(':focus').textContent(),
    t.clients.manage.titles['contact-archive'],
  );
  await page
    .getByRole('button', { name: t.clients.manage.titles['contact-archive'], exact: true })
    .click();
  await page.getByRole('button', { name: t.clients.manage.confirm, exact: true }).click();
  await error(t.clients.manage.errors['main-contact']);
  await audit('Phase3 selected main contact archive refused');
  await goto(base + `/clients/${created}/edit` + query);
  await page.getByLabel(t.clients.mainContact, { exact: true }).selectOption('');
  await save();
  await goto(base + `/clients/${created}/contacts/${contactId}/archive` + query);
  await page
    .getByRole('button', { name: t.clients.manage.titles['contact-archive'], exact: true })
    .click();
  await page.getByRole('button', { name: t.clients.manage.confirm, exact: true }).click();
  await page.getByRole('status').filter({ hasText: t.clients.manage.saved }).waitFor();
  await goto(base + `/clients/${created}/archive` + query);
  await page
    .getByRole('button', { name: t.clients.manage.titles['client-archive'], exact: true })
    .click();
  await page.getByRole('dialog').waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await audit('Phase3 archive confirmation ' + width);
  }
  await proveStaffBrowserZoom({
    context,
    page,
    audit,
    screenshot,
    evidence,
    name: 'Phase3 client confirmation',
  });
  await page.getByRole('button', { name: t.clients.manage.confirm, exact: true }).click();
  await page.getByRole('status').filter({ hasText: t.clients.manage.saved }).waitFor();
  await goto(base + `/clients/${created}/contacts/${contactId}/restore` + query);
  await page
    .getByRole('status')
    .filter({ hasText: t.clients.manage.errors['parent-archived'] })
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: t.clients.manage.titles['contact-restore'], exact: true })
      .isDisabled(),
    true,
  );
  await audit('Phase3 archived-parent restriction');
  await goto(base + `/clients/${created}/restore` + query);
  await page
    .getByRole('button', { name: t.clients.manage.titles['client-restore'], exact: true })
    .click();
  await page.getByRole('button', { name: t.clients.manage.confirm, exact: true }).click();
  await page.getByRole('status').filter({ hasText: t.clients.manage.saved }).waitFor();
  assert.equal(
    (
      await inspect(
        async (db) =>
          (await db.query('SELECT is_archived FROM contacts WHERE id=$1', [contactId])).rows[0],
      )
    ).is_archived,
    true,
  );
  await goto(base + `/clients/${created}/contacts/${contactId}/restore` + query);
  await page
    .getByRole('button', { name: t.clients.manage.titles['contact-restore'], exact: true })
    .click();
  await page.getByRole('button', { name: t.clients.manage.confirm, exact: true }).click();
  await page.getByRole('status').filter({ hasText: t.clients.manage.saved }).waitFor();
  await goto(base + '/clients/197/edit');
  for (const name of ['name_ar', 'name_en', 'full_name'])
    assert.equal(await page.locator(`[name=${name}]`).getAttribute('readonly'), '');
  assert.equal(await page.locator('[name=legacy_contact_lawyer_raw]').count(), 0);
  assert.equal(await page.locator('[name=home_phone]').count(), 0);
  const unnamed = identities.unnamed[0];
  await goto(base + `/clients/${unnamed.client_id}/contacts/${unnamed.id}/edit`);
  await page.getByLabel(t.clients.jobTitle, { exact: true }).fill('__PHASE3_BROWSER_UNNAMED');
  await save();
  assert.equal(
    (
      await inspect(
        async (db) =>
          (await db.query('SELECT contact_name FROM contacts WHERE id=$1', [unnamed.id])).rows[0],
      )
    ).contact_name,
    null,
  );
  await goto(base + `/clients/${created}/edit?returnTo=https://example.invalid`);
  await page.getByRole('alert').filter({ hasText: t.clients.invalidFilters }).waitFor();
  await page.getByRole('link', { name: t.clients.clear, exact: true }).click();
  await page.getByLabel(t.clients.displayName, { exact: true }).waitFor();
  evidence.push({
    name: 'Phase3 real actions, exact network replay, forged role requests, stale/RSC retry, navigation, main-contact/lifecycle, Sigma and unnamed preservation',
    passed: true,
  });
  console.log(
    'PASS Phase3 production browser mutations, action denials, stale recovery, confirmations, native 200% zoom and narrow-view accessibility',
  );
}
