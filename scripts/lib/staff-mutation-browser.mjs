import assert from 'node:assert/strict';
import { t } from '../../src/strings.ts';
import { withApprovedMigrationClient } from './migration-principal.ts';
import { staffReadOnlyState } from './staff-read-only-state.ts';

/** Runs only inside test-staff-browser's owned full-state fixture/browser. */
export async function proveStaffMutationBrowser({
  page,
  context,
  base,
  fixture,
  accounts,
  login,
  audit,
  screenshot,
  evidence,
}) {
  const goto = (path) => page.goto(base + path, { waitUntil: 'networkidle' });
  const section = (title) => page.getByRole('region', { name: title, exact: true });
  const saved = (area) =>
    area.getByRole('status').filter({ hasText: t.staff.manage.saved }).waitFor();
  const confirm = async () => {
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await page.locator(':focus').textContent(), t.staff.manage.cancel);
    await dialog.getByRole('button', { name: t.staff.manage.confirm, exact: true }).click();
  };
  const admin = accounts.find((account) => account.roleCode === 'Administrator');
  await login(admin);
  await goto('/staff/new');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await audit('staff creation ' + width);
    await screenshot('staff-create-' + width);
  }
  // Keyboard-only creation and validation recovery, with no click/fill shortcut.
  await goto('/staff/new');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), t.staff.back);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').getAttribute('name'), 'nameAr');
  assert.notEqual(
    await page.locator(':focus').evaluate((el) => getComputedStyle(el).outlineStyle),
    'none',
  );
  await screenshot('staff-keyboard-focus');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), t.staff.manage.create);
  await page.keyboard.press('Enter');
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator(':focus').getAttribute('role'), 'alert');
  await audit('staff focused validation summary');
  await screenshot('staff-validation');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator(':focus').getAttribute('name'), 'nameAr');
  await page.keyboard.type('اختبار متصفح للموظف TEST ONLY');
  await page.keyboard.press('Tab');
  await page.keyboard.type('BROWSER TEST ONLY');
  await page.keyboard.press('Tab');
  await page.keyboard.type(' Browser.Test@Example.Invalid ');
  // Preserve an actual action request in memory for later non-admin replay.
  let actionRequest;
  const capture = (request) => {
    if (request.method() === 'POST' && request.headers()['next-action'])
      actionRequest = {
        headers: {
          'next-action': request.headers()['next-action'],
          'content-type': request.headers()['content-type'],
          origin: base,
        },
        data: request.postDataBuffer(),
      };
  };
  page.on('request', capture);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await saved(section(t.staff.manage.create));
  page.off('request', capture);
  assert.ok(actionRequest?.data);
  const detailHref = await section(t.staff.manage.create)
    .getByRole('link', { name: t.staff.manage.view, exact: true })
    .getAttribute('href');
  const personId = Number(detailHref.split('/').at(-1));
  assert.ok(Number.isSafeInteger(personId));
  await audit('staff successful creation and recovery');
  await screenshot('staff-created');

  await goto('/staff/new');
  await page.getByLabel(t.staff.name, { exact: true }).fill('اختبار متصفح للموظف TEST ONLY');
  await page.getByRole('button', { name: t.staff.manage.create, exact: true }).click();
  await page
    .getByRole('alert')
    .filter({ hasText: t.staff.manage.errors['duplicate-name'] })
    .waitFor();
  assert.equal(
    await page.getByLabel(t.staff.name, { exact: true }).inputValue(),
    'اختبار متصفح للموظف TEST ONLY',
  );
  await audit('duplicate identity Arabic conflict');
  await screenshot('staff-duplicate-name');
  await page.getByLabel(t.staff.name, { exact: true }).fill('اختبار متصفح لبريد مكرر TEST ONLY');
  await page.getByLabel(t.staff.email, { exact: true }).fill('BROWSER.TEST@EXAMPLE.INVALID');
  await page.getByRole('button', { name: t.staff.manage.create, exact: true }).click();
  await page
    .getByRole('alert')
    .filter({ hasText: t.staff.manage.errors['duplicate-email'] })
    .waitFor();
  await audit('duplicate email Arabic conflict');
  await screenshot('staff-duplicate-email');

  await goto(`/staff/${personId}/edit`);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await audit('staff editing ' + width);
    await screenshot('staff-edit-' + width);
  }
  await page.setViewportSize({ width: 720, height: 600 });
  await audit('staff editing 200 percent equivalent viewport');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await audit('staff editing 200 percent CSS zoom');
  await screenshot('staff-edit-200-percent');
  await goto(`/staff/${personId}/edit`);
  const update = section(t.staff.manage.update);
  await update.getByLabel(t.staff.englishName, { exact: true }).fill('BROWSER UPDATED');
  await update.getByRole('button', { name: t.staff.manage.update, exact: true }).click();
  await saved(update);
  // The surrounding page refresh must never upgrade another form's token
  // while retaining its unsaved old values. This form must now fail stale.
  const rename = section(t.staff.manage.rename);
  await rename.getByLabel(t.staff.name, { exact: true }).fill('اختبار متصفح اسم مصحح TEST ONLY');
  await rename.getByRole('button', { name: t.staff.manage.rename, exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await audit('rename confirmation');
  await screenshot('staff-confirmation');
  await page.setViewportSize({ width: 320, height: 700 });
  await audit('rename confirmation 320');
  await screenshot('staff-confirmation-320');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator(':focus').textContent(), t.staff.manage.rename);
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.keyboard.press('Enter');
  await confirm();
  await rename.getByRole('alert').filter({ hasText: t.staff.manage.errors.stale }).waitFor();
  assert.equal(
    await rename.getByLabel(t.staff.name, { exact: true }).inputValue(),
    'اختبار متصفح اسم مصحح TEST ONLY',
  );
  assert.equal(await page.locator(':focus').getAttribute('role'), 'alert');
  await audit('stale form preserves input and focuses recovery');
  await screenshot('staff-stale');
  await rename.getByRole('link', { name: t.staff.manage.reload, exact: true }).click();
  await page.waitForLoadState('networkidle');
  await section(t.staff.manage.rename)
    .getByLabel(t.staff.name, { exact: true })
    .fill('اختبار متصفح اسم مصحح TEST ONLY');
  await section(t.staff.manage.rename)
    .getByRole('button', { name: t.staff.manage.rename, exact: true })
    .click();
  await confirm();
  await saved(section(t.staff.manage.rename));

  await goto(`/staff/${personId}/edit`);
  await section(t.staff.manage.addAlias)
    .getByLabel(t.staff.manage.alias, { exact: true })
    .fill('اختبار متصفح اسم محفوظ TEST ONLY');
  await section(t.staff.manage.addAlias)
    .getByRole('button', { name: t.staff.manage.addAlias, exact: true })
    .click();
  await saved(section(t.staff.manage.addAlias));
  await goto(`/staff/${personId}/edit`);
  const native = section(t.staff.manage.retireAlias).filter({
    hasText: 'اختبار متصفح اسم محفوظ TEST ONLY',
  });
  await native.getByRole('button', { name: t.staff.manage.retireAlias, exact: true }).click();
  await confirm();
  await native.getByRole('alert').filter({ hasText: t.staff.manage.errors.reason }).waitFor();
  await native
    .getByLabel(t.staff.manage.reason, { exact: true })
    .fill('اختبار سبب استبعاد من المتصفح');
  await native.getByRole('button', { name: t.staff.manage.retireAlias, exact: true }).click();
  await confirm();
  // A successful save can replace the retired control with its restore control.
  await page.getByRole('status').filter({ hasText: t.staff.manage.saved }).waitFor();
  await goto(`/staff/${personId}/edit`);
  const restore = section(t.staff.manage.restoreAlias);
  await restore
    .getByLabel(t.staff.manage.reason, { exact: true })
    .fill('اختبار سبب إعادة من المتصفح');
  await restore.getByRole('button', { name: t.staff.manage.restoreAlias, exact: true }).click();
  await confirm();
  await page.getByRole('status').filter({ hasText: t.staff.manage.saved }).waitFor();
  await goto(`/staff/${personId}/edit`);
  await section(t.staff.manage.deactivate)
    .getByRole('button', { name: t.staff.manage.deactivate, exact: true })
    .click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: t.staff.manage.cancel, exact: true }).click();
  assert.equal(await page.locator(':focus').textContent(), t.staff.manage.deactivate);
  await page.keyboard.press('Enter');
  await confirm();
  await page.getByRole('status').filter({ hasText: t.staff.manage.saved }).waitFor();
  await goto(`/staff/${personId}/edit`);
  await section(t.staff.manage.reactivate)
    .getByRole('button', { name: t.staff.manage.reactivate, exact: true })
    .click();
  await confirm();
  await page.getByRole('status').filter({ hasText: t.staff.manage.saved }).waitFor();
  await screenshot('staff-reactivated');
  evidence.push({
    name: 'create/update/rename/alias retire-restore/deactivate-reactivate; cancel and Escape restore focus',
    passed: true,
  });

  // Both fixed teams may share an eligible reviewer without team membership.
  for (let index = 0; index < 2; index++) {
    await goto(`/staff/${personId}/edit`);
    const reviewer = page
      .getByRole('region', { name: new RegExp(t.staff.manage.reviewer) })
      .nth(index);
    await reviewer.getByLabel(t.staff.reviewer, { exact: true }).selectOption(String(personId));
    await reviewer.getByRole('button').click();
    await saved(reviewer);
  }
  await goto(`/staff/${personId}/edit`);
  await section(t.staff.manage.deactivate).getByRole('button').click();
  await confirm();
  await section(t.staff.manage.deactivate)
    .getByRole('alert')
    .filter({ hasText: t.staff.manage.errors.reviewer })
    .waitFor();
  await audit('reviewer replacement required before deactivation');
  await screenshot('staff-reviewer-protection');
  await section(t.staff.manage.update)
    .getByLabel(t.staff.trainee, { exact: true })
    .selectOption('true');
  await section(t.staff.manage.update).getByRole('button').click();
  await section(t.staff.manage.update)
    .getByRole('alert')
    .filter({ hasText: t.staff.manage.errors.reviewer })
    .waitFor();
  evidence.push({
    name: 'both team reviewers assigned without membership; deactivation and trainee conversion refused',
    passed: true,
  });

  const imported = await withApprovedMigrationClient(
    async (db) => {
      const rows = (
        await db.query(
          'SELECT p.id FROM people p WHERE p.is_staff AND NOT p.is_application_native AND NOT EXISTS (SELECT 1 FROM person_name_alias a WHERE a.person_id=p.id AND a.created_by<>1) ORDER BY p.id LIMIT 1',
        )
      ).rows;
      assert.equal(rows.length, 1);
      return rows[0].id;
    },
    { databaseUrl: fixture.migrationUrl },
  );
  await goto(`/staff/${imported}/edit`);
  assert.equal(
    await page.getByRole('button', { name: t.staff.manage.retireAlias, exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole('button', { name: t.staff.manage.restoreAlias, exact: true }).count(),
    0,
  );
  await audit('imported alias evidence has no lifecycle controls');
  await screenshot('staff-imported-evidence');

  // Revoke only one gateway in the owned fixture, then restore its exact grant.
  const signature = 'public.staff_add_alias(integer,bigint,text)';
  await withApprovedMigrationClient(
    (db) => db.query(`REVOKE EXECUTE ON FUNCTION ${signature} FROM litigation_runtime`),
    { databaseUrl: fixture.migrationUrl },
  );
  try {
    await goto(`/staff/${personId}/edit`);
    await section(t.staff.manage.addAlias)
      .getByLabel(t.staff.manage.alias, { exact: true })
      .fill('اختبار تعافي الحفظ TEST ONLY');
    await section(t.staff.manage.addAlias)
      .getByRole('button', { name: t.staff.manage.addAlias, exact: true })
      .click();
    await section(t.staff.manage.addAlias).getByRole('alert').waitFor();
    assert.equal(await page.locator(':focus').getAttribute('role'), 'alert');
    await audit('gateway refusal preserves input');
    await screenshot('staff-save-error');
  } finally {
    await withApprovedMigrationClient(
      (db) => db.query(`GRANT EXECUTE ON FUNCTION ${signature} TO litigation_runtime`),
      { databaseUrl: fixture.migrationUrl },
    );
  }
  await section(t.staff.manage.addAlias)
    .getByRole('button', { name: t.staff.manage.addAlias, exact: true })
    .click();
  await saved(section(t.staff.manage.addAlias));
  evidence.push({
    name: 'gateway refusal and successful retry with preserved input',
    passed: true,
  });

  for (const account of accounts.filter((account) => account.roleCode !== 'Administrator')) {
    await login(account);
    assert.equal(
      await page.getByRole('link', { name: t.staff.manage.create, exact: true }).count(),
      0,
    );
    await goto(`/staff/${personId}`);
    assert.equal(
      await page.getByRole('link', { name: t.staff.manage.edit, exact: true }).count(),
      0,
    );
    await goto('/staff/new');
    await page.waitForURL('**/forbidden');
    assert.equal(await page.locator('form').count(), 0);
    await goto(`/staff/${personId}/edit`);
    await page.waitForURL('**/forbidden');
    const before = await withApprovedMigrationClient(staffReadOnlyState, {
      databaseUrl: fixture.migrationUrl,
    });
    const response = await context.request.post(base + '/staff/new', actionRequest);
    assert.ok(response.status() >= 400, 'crafted non-admin action must fail');
    assert.deepEqual(
      await withApprovedMigrationClient(staffReadOnlyState, { databaseUrl: fixture.migrationUrl }),
      before,
    );
    await audit('mutation visibility and direct URL/action denial ' + account.roleCode);
    await screenshot('staff-denied-' + account.roleCode.replaceAll(' ', '-'));
    evidence.push({
      name: 'crafted create action denial ' + account.roleCode,
      status: response.status(),
      unchanged: true,
    });
  }
  actionRequest.data.fill(0);
  await login(admin);
  await goto(`/staff/${admin.personId}/edit`);
  assert.equal(
    await page.getByRole('button', { name: t.staff.manage.deactivate, exact: true }).count(),
    0,
  );
  await page.getByText(t.staff.manage.selfHint, { exact: true }).waitFor();
  evidence.push({ name: 'self-deactivation control absent', passed: true });
  console.log(
    'PASS Phase 3 browser mutations, keyboard/focus, confirmations, validation/conflicts, stale token retention, recovery and crafted authorization denials',
  );
}
