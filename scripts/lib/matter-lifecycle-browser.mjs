import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { t } from '../../src/strings.ts';
import { staffFocusProof, proveStaffBrowserZoom } from './staff-accessibility-browser.mjs';
import { staffReadOnlyState } from './staff-read-only-state.ts';
import { matterMigrationCatalog } from './matter-migration-delta.ts';

export async function proveMatterLifecycleBrowser({
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
  const administrator = accounts.find((a) => a.roleCode === 'Administrator');
  assert.ok(administrator);
  const complete = () =>
    inspect(async (db) => ({
      state: await staffReadOnlyState(db),
      catalog: await matterMigrationCatalog(db),
    }));
  const state = (id) =>
    inspect(
      async (db) =>
        (
          await db.query(
            'SELECT id,row_version::text version,is_archived archived,_migration.matter_lifecycle_counts(id) counts,_migration.matter_edit_aggregate(id) aggregate FROM matters WHERE id=$1',
            [id],
          )
        ).rows[0],
    );
  const direct = (gateway, makeRequest) =>
    inspect(async (db) => {
      await db.query('BEGIN');
      try {
        const actor = (
          await db.query('SELECT id,session_version,role_code FROM user_accounts WHERE id=$1', [
            administrator.id,
          ])
        ).rows[0];
        await db.query('SELECT audit_set_human_context($1)', [actor.id]);
        await db.query(
          "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY browser lifecycle fixture','system')",
          [randomUUID(), randomUUID(), randomUUID()],
        );
        assert.ok(['matter_edit_save', 'matter_lifecycle_save'].includes(gateway));
        const request = await makeRequest(db);
        const result = (
          await db.query(`SELECT public.${gateway}($1,$2,$3,$4,$5::jsonb) result`, [
            actor.id,
            actor.session_version,
            actor.role_code,
            new Date(Date.now() + 3600000).toISOString(),
            JSON.stringify(request),
          ])
        ).rows[0].result;
        await db.query('COMMIT');
        return result;
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    });
  const create = (subject) =>
    direct('matter_edit_save', async () => ({
      id: null,
      version: null,
      submission: randomUUID(),
      values: { subject, case_number_ar: 'TEST ONLY 140J\n140ق' },
    }));
  const change = (id, action) =>
    direct('matter_lifecycle_save', async (db) => {
      const row = (
        await db.query(
          'SELECT row_version::text version,_migration.matter_lifecycle_counts(id) counts FROM matters WHERE id=$1',
          [id],
        )
      ).rows[0];
      return { ...row, id, confirmation: id, action, submission: randomUUID() };
    });
  const created = await create('TEST ONLY browser lifecycle unique'),
    empty = await create('TEST ONLY last row lifecycle');
  let captured;
  const listener = (request) => {
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
  };
  page.on('request', listener);
  const open = async (action) => {
    const trigger = page.getByRole('button', { name: t.matters.lifecycle[action], exact: true });
    await trigger.focus();
    await trigger.press('Enter');
    await page.getByRole('dialog').waitFor();
  };
  const confirm = async () =>
    page
      .getByRole('dialog')
      .getByRole('button', { name: t.clients.manage.confirm, exact: true })
      .click();
  const success = async (action) =>
    page
      .getByText(
        action === 'archive'
          ? t.matters.lifecycle.archivedSuccess
          : t.matters.lifecycle.restoredSuccess,
        { exact: true },
      )
      .waitFor();
  await login(administrator);
  const query =
    '?archive=all&q=TEST+ONLY&fromClient=' +
    encodeURIComponent('/clients/12?archive=all&page=2&contactsPage=1');
  await goto(`/matters/${created.id}/archive${query}`);
  const before = await complete();
  await open('archive');
  assert.equal(
    await page
      .getByRole('dialog')
      .getByRole('button', { name: t.common.cancel, exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  evidence.push({ name: 'Confirmation begins on Cancel', focus: await staffFocusProof(page) });
  await audit('Archive confirmation');
  await screenshot('archive-confirmation-desktop');
  await page.keyboard.press('Escape');
  assert.equal(
    await page
      .getByRole('button', { name: t.matters.lifecycle.archive, exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  assert.deepEqual(await complete(), before);
  await open('archive');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: t.common.cancel, exact: true })
    .click();
  assert.deepEqual(await complete(), before);
  await open('archive');
  await confirm();
  await success('archive');
  assert.ok(captured);
  const originalRequest = captured;
  const archived = await state(created.id);
  assert.equal(archived.archived, true);
  assert.equal(BigInt(archived.version), BigInt(created.version) + 1n);
  const retryBefore = await complete();
  const retry = await context.request.post(base + originalRequest.path, {
    headers: { ...originalRequest.headers, origin: base },
    data: originalRequest.body,
    maxRedirects: 0,
  });
  assert.ok(retry.status() < 400);
  assert.deepEqual(await complete(), retryBefore);
  await page.getByRole('link', { name: t.clients.manage.backRecord, exact: true }).last().click();
  await page.waitForURL((url) => url.pathname === `/matters/${created.id}`);
  assert.equal(new URL(page.url()).searchParams.get('archive'), 'all');
  assert.ok(new URL(page.url()).searchParams.get('fromClient').includes('archive=all'));
  assert.equal(
    await page
      .locator('h1 bdi')
      .allTextContents()
      .then((x) => x.join('\n')),
    'TEST ONLY 140J\n140ق',
  );
  assert.equal(
    await page.getByRole('link', { name: t.matters.manage.edit, exact: true }).count(),
    0,
  );
  await audit('Archived complete detail');
  await screenshot('archived-detail');
  for (const account of accounts) {
    await login(account);
    await goto(`/matters/${created.id}${query}`);
    await page.getByText(t.matters.lifecycle.notice, { exact: true }).waitFor();
    assert.equal(
      await page.getByRole('link', { name: t.matters.manage.edit, exact: true }).count(),
      0,
    );
    if (account.roleCode !== 'Administrator') {
      const prior = await complete();
      const response = await context.request.post(base + originalRequest.path, {
        headers: { ...originalRequest.headers, origin: base },
        data: originalRequest.body,
        maxRedirects: 0,
      });
      const redirect = response.headers()['x-action-redirect'] ?? '',
        body = await response.text();
      assert.ok(
        response.status() === 403 ||
          (response.status() === 500 && body.includes('"digest"')) ||
          redirect.includes('/forbidden') ||
          (body.includes('NEXT_REDIRECT') && body.includes('/forbidden')),
      );
      assert.deepEqual(await complete(), prior);
      for (const action of ['archive', 'restore']) {
        await goto(`/matters/${created.id}/${action}`);
        assert.ok(page.url().includes('/forbidden'));
      }
    }
    await goto(`/matters/${created.id}/edit`);
    if (['Administrator', 'Litigation Assistant'].includes(account.roleCode)) {
      await page.getByText(t.matters.lifecycle.notice, { exact: true }).waitFor();
      assert.equal(await page.locator('textarea').count(), 0);
    } else assert.ok(page.url().includes('/forbidden'));
    evidence.push({
      name:
        account.roleCode +
        ' archived read access, no edit controls, direct pages and forged action denial',
    });
  }
  await login(administrator);
  await goto(`/matters/${created.id}/restore${query}`);
  await open('restore');
  await audit('Restore confirmation');
  await confirm();
  await success('restore');
  assert.equal((await state(created.id)).archived, false);
  await login(accounts.find((a) => a.roleCode === 'Litigation Assistant'));
  await goto(`/matters/${created.id}/edit${query}`);
  assert.ok(await page.locator('textarea').count());
  evidence.push({
    name: 'Restoration returns normal Litigation Assistant editing with complete multiline case number',
  });
  // Stale confirmation retains the original version and requires explicit reload.
  await login(administrator);
  await goto(`/matters/${created.id}/archive`);
  await direct('matter_edit_save', async (db) => ({
    id: created.id,
    version: (await db.query('SELECT row_version::text v FROM matters WHERE id=$1', [created.id]))
      .rows[0].v,
    submission: randomUUID(),
    values: { notes_1: 'TEST ONLY concurrent browser edit' },
  }));
  const staleBefore = await complete();
  await open('archive');
  await confirm();
  await page.getByText(t.matters.lifecycle.stale, { exact: true }).waitFor();
  assert.deepEqual(await complete(), staleBefore);
  assert.equal(
    await page.getByRole('button', { name: t.matters.lifecycle.archive, exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole('alert')
      .filter({ hasText: t.matters.lifecycle.stale })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await audit('Stale confirmation focus');
  await page.getByRole('link', { name: t.matters.lifecycle.reload, exact: true }).click();
  await page.waitForLoadState('networkidle');
  // Lose an actual successful Server Action response, then retry the exact UUID/payload.
  let lost = false;
  await page.route('**/matters/**', async (route) => {
    if (!lost && route.request().method() === 'POST' && route.request().headers()['next-action']) {
      lost = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await open('archive');
  await confirm();
  await page.getByText(t.matters.manage.errors.generic, { exact: true }).waitFor();
  assert.equal((await state(created.id)).archived, true);
  const lostState = await complete();
  await page.unroute('**/matters/**');
  await open('archive');
  await confirm();
  await success('archive');
  assert.deepEqual(await complete(), lostState);
  evidence.push({
    name: 'Lost successful response recovers by exact same submission without duplicate row/history/event/version',
  });
  await change(created.id, 'restore');
  await goto(`/matters/${created.id}/archive`);
  await inspect((db) =>
    db.query(
      "CREATE FUNCTION public.task42_browser_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST ONLY browser audit failure'; END $$; CREATE TRIGGER task42_browser_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action='archive') EXECUTE FUNCTION public.task42_browser_audit_failure()",
    ),
  );
  try {
    const prior = await complete();
    await open('archive');
    await confirm();
    await page.getByText(t.matters.manage.errors.generic, { exact: true }).waitFor();
    assert.deepEqual(await complete(), prior);
    await audit('Recoverable lifecycle error');
  } finally {
    await inspect((db) =>
      db.query(
        'DROP TRIGGER task42_browser_audit_failure ON audit_events; DROP FUNCTION public.task42_browser_audit_failure()',
      ),
    );
  }
  await open('archive');
  await confirm();
  await success('archive');
  await change(created.id, 'restore');
  // Last matching ordinary row disappears; archive filter exposes it and restoration empties archive results.
  const unique = 'TEST ONLY last row lifecycle';
  await goto('/matters?q=' + encodeURIComponent(unique) + '&page=99');
  assert.equal(await page.locator('li[data-matter-id]').count(), 1);
  await page.locator('li[data-matter-id] h3 a').click();
  await page.getByRole('link', { name: t.matters.lifecycle.archive, exact: true }).click();
  await open('archive');
  await confirm();
  await success('archive');
  await goto('/matters?q=' + encodeURIComponent(unique) + '&page=99');
  await page.getByText(t.matters.empty, { exact: true }).waitFor();
  await page
    .getByLabel(t.matters.lifecycle.archiveFilter, { exact: true })
    .selectOption('archived');
  await page.getByRole('button', { name: t.clients.apply, exact: true }).click();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('li[data-matter-id]').count(), 1);
  await page.locator('li[data-matter-id] h3 a').click();
  assert.equal(new URL(page.url()).searchParams.get('archive'), 'archived');
  await page.getByRole('link', { name: t.matters.lifecycle.restore, exact: true }).click();
  await open('restore');
  await confirm();
  await success('restore');
  await goto('/matters?archive=archived&q=' + encodeURIComponent(unique) + '&page=99');
  await page.getByText(t.matters.empty, { exact: true }).waitFor();
  await audit('Empty archive page after restoring last row');
  evidence.push({
    name: 'Last-row archive, current/archive/all filter navigation and empty-page clamp',
  });
  const linked = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT m.id,m.client_id FROM matters m JOIN clients c ON c.id=m.client_id WHERE NOT m.is_archived AND NOT c.is_archived ORDER BY m.id LIMIT 1',
        )
      ).rows[0],
  );
  assert.ok(linked);
  const clientArchive = async (archived) =>
    inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await db.query('SELECT audit_set_human_context($1)', [administrator.id]);
        await db.query(
          "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY browser client independence','system')",
          [randomUUID(), randomUUID(), randomUUID()],
        );
        const rows = (
          await db.query('SELECT row_version FROM clients WHERE id=$1', [linked.client_id])
        ).rows;
        assert.equal(rows.length, 1);
        await db.query("SELECT client_contact_set_archived('clients',$1,$2,$3)", [
          linked.client_id,
          rows[0].row_version,
          archived,
        ]);
        await db.query('COMMIT');
      } catch (e) {
        await db.query('ROLLBACK');
        throw e;
      }
    });
  const linkedBefore = (await state(linked.id)).aggregate;
  await clientArchive(true);
  await goto(`/matters/${linked.id}/archive`);
  await open('archive');
  await confirm();
  await success('archive');
  assert.equal((await state(linked.id)).archived, true);
  await clientArchive(false);
  assert.equal((await state(linked.id)).archived, true);
  await goto(`/matters/${linked.id}/restore`);
  await open('restore');
  await confirm();
  await success('restore');
  await change(linked.id, 'archive');
  await clientArchive(true);
  await goto(`/matters/${linked.id}/restore`);
  await open('restore');
  await confirm();
  await success('restore');
  assert.equal((await state(linked.id)).archived, false);
  assert.equal(
    await inspect(
      async (db) =>
        (await db.query('SELECT is_archived FROM clients WHERE id=$1', [linked.client_id])).rows[0]
          .is_archived,
    ),
    true,
  );
  await login(accounts.find((a) => a.roleCode === 'Litigation Assistant'));
  await goto(`/matters/${linked.id}/edit`);
  assert.ok(await page.locator('textarea').count());
  await login(administrator);
  await clientArchive(false);
  const linkedAfter = (await state(linked.id)).aggregate;
  for (const v of [linkedBefore, linkedAfter])
    for (const k of ['is_archived', 'row_version', 'updated_at', 'updated_by']) delete v.matter[k];
  assert.deepEqual(linkedAfter, linkedBefore);
  evidence.push({
    name: 'Production browser archive and restore with archived/current clients, client restore does not restore matter, assistant can edit restored matter under archived client; business aggregate exact',
  });
  await goto(`/matters/${empty.id}/archive`);
  await open('archive');
  await page.setViewportSize({ width: 320, height: 950 });
  await audit('320px archive confirmation');
  await screenshot('archive-confirmation-320');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open('archive');
  await proveStaffBrowserZoom({
    context,
    page,
    audit,
    screenshot,
    evidence,
    name: 'matter-lifecycle-confirmation',
  });
  await page.keyboard.press('Escape');
  page.off('request', listener);
  evidence.push({
    name: 'Keyboard cancel/focus, programmatic errors/status, Arabic RTL, narrow reflow and genuine browser zoom completed; no speech actions',
  });
}
