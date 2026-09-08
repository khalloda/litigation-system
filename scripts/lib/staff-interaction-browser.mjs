import assert from 'node:assert/strict';
import { t } from '../../src/strings.ts';
import { withApprovedMigrationClient } from './migration-principal.ts';
import { staffReadOnlyState } from './staff-read-only-state.ts';
import { staffFocusProof, staffDialogKeyboard } from './staff-accessibility-browser.mjs';

/** Additional final acceptance, always inside the existing owned full-state fixture. */
export async function proveStaffInteractions({
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
  const admin = accounts.find((account) => account.roleCode === 'Administrator');
  const goto = (path) => page.goto(base + path, { waitUntil: 'networkidle' });
  const region = (name) => page.getByRole('region', { name, exact: true });
  const query = (sql, params = []) =>
    withApprovedMigrationClient(async (db) => (await db.query(sql, params)).rows, {
      databaseUrl: fixture.migrationUrl,
    });
  const receipt = () =>
    withApprovedMigrationClient(staffReadOnlyState, { databaseUrl: fixture.migrationUrl });
  const focus = [];
  const tabTo = async (target) => {
    await target.waitFor({ state: 'visible' });
    assert.equal(await target.count(), 1, 'one keyboard destination required');
    for (let i = 0; i < 160; i++) {
      if (await target.evaluate((element) => document.activeElement === element)) {
        focus.push(await staffFocusProof(page));
        return;
      }
      await page.keyboard.press('Tab');
    }
    throw new Error('keyboard destination unreachable');
  };
  const activate = async (target) => {
    await tabTo(target);
    await page.keyboard.press('Enter');
  };
  const input = async (target, value) => {
    await tabTo(target);
    await page.keyboard.press('Control+A');
    await page.keyboard.type(value);
  };
  const select = async (target, value) => {
    const options = await target
      .locator('option')
      .evaluateAll((items) => items.map((option) => option.value));
    const index = options.indexOf(value);
    assert.ok(index >= 0);
    await tabTo(target);
    await page.keyboard.press('Home');
    for (let i = 0; i < index; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    assert.equal(await target.inputValue(), value);
  };
  const confirm = async () => {
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.locator(':focus').textContent(), t.staff.manage.cancel);
    focus.push(...(await staffDialogKeyboard(page)));
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').textContent(), t.staff.manage.confirm);
    await page.keyboard.press('Enter');
  };
  const saved = () => page.getByRole('status').filter({ hasText: t.staff.manage.saved }).waitFor();
  await login(admin);
  await goto('/staff');
  await input(page.getByLabel(t.staff.searchLabel, { exact: true }), '');
  await select(page.getByLabel(t.staff.status, { exact: true }), 'all');
  await select(page.getByLabel(t.staff.team, { exact: true }), 'unassigned');
  await select(page.getByLabel(t.staff.trainee, { exact: true }), 'no');
  await activate(page.getByRole('button', { name: t.staff.apply, exact: true }));
  await page.waitForURL((url) => url.searchParams.get('team') === 'unassigned');
  await page.waitForLoadState('networkidle');
  const first = await page
    .locator('#staff-results h3 a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  await activate(page.getByRole('link', { name: t.staff.next, exact: true }));
  await page.waitForURL((url) => url.searchParams.get('page') === '2');
  await page.waitForLoadState('networkidle');
  const params = new URL(page.url()).searchParams;
  assert.equal(params.get('status'), 'all');
  assert.equal(params.get('team'), 'unassigned');
  assert.equal(params.get('trainee'), 'no');
  assert.equal(params.get('page'), '2');
  const second = await page
    .locator('#staff-results h3 a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  assert.equal(new Set([...first, ...second]).size, first.length + second.length);
  await audit('keyboard combined filters and preserved distinct pagination');
  await activate(page.getByRole('link', { name: t.staff.previous, exact: true }));
  await page.waitForURL((url) => url.searchParams.get('page') !== '2');
  await activate(page.getByRole('link', { name: t.staff.clear, exact: true }));
  await page.waitForURL(base + '/staff');
  await activate(page.getByRole('link', { name: t.staff.manage.create, exact: true }));
  await page.waitForURL(base + '/staff/new');
  await page.getByLabel(t.staff.name, { exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  await input(page.getByLabel(t.staff.name, { exact: true }), 'اختبار تفاعل نهائي TEST ONLY');
  await input(page.getByLabel(t.staff.email, { exact: true }), 'interaction.only@example.invalid');
  await select(page.getByLabel(t.staff.team, { exact: true }), '1');

  // Hold a real action request, assert feedback/focus while pending, and try
  // repeated activation. Only one HTTP action and one staff identity may result.
  let release;
  let started;
  let posts = 0;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const arrived = new Promise((resolve) => {
    started = resolve;
  });
  const intercept = async (route) => {
    if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
      posts++;
      started();
      await held;
    }
    await route.continue();
  };
  await context.route(base + '/staff/new', intercept);
  try {
    await activate(page.getByRole('button', { name: t.staff.manage.create, exact: true }));
    await Promise.race([
      arrived,
      new Promise((_, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('held staff action did not arrive')),
          15000,
        );
        timeout.unref();
        arrived.then(() => clearTimeout(timeout));
      }),
    ]);
    await page.getByRole('status').filter({ hasText: t.staff.manage.saving }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: t.staff.manage.saving, exact: true }).isDisabled(),
      true,
    );
    await audit('slow create pending feedback');
    assert.equal(await page.locator(':focus').getAttribute('role'), 'status');
    assert.equal(await page.locator(':focus').textContent(), t.staff.manage.saving);
    focus.push(await staffFocusProof(page));
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
    assert.equal(posts, 1, 'pending keyboard repeats must not submit again');
    const pendingButton = await page
      .getByRole('button', { name: t.staff.manage.saving, exact: true })
      .boundingBox();
    await page.mouse.click(
      pendingButton.x + pendingButton.width / 2,
      pendingButton.y + pendingButton.height / 2,
      { clickCount: 2 },
    );
    assert.equal(posts, 1, 'pending pointer repeats must not submit again');
  } finally {
    release();
    await context.unroute(base + '/staff/new', intercept);
  }
  await saved();
  const href = await region(t.staff.manage.create)
    .getByRole('link', { name: t.staff.manage.view, exact: true })
    .getAttribute('href');
  const personId = Number(href.split('/').at(-1));
  assert.ok(Number.isSafeInteger(personId));
  assert.equal(
    (await query('SELECT id FROM people WHERE email=$1', ['interaction.only@example.invalid']))
      .length,
    1,
  );
  await audit('slow creation completed once');

  // Double-activate an enabled submit control, before pending UI can be
  // relied upon. This complements the keyboard repeats during the held request.
  await goto('/staff/new');
  await input(page.getByLabel(t.staff.name, { exact: true }), 'اختبار نقر مزدوج TEST ONLY');
  await input(page.getByLabel(t.staff.email, { exact: true }), 'double.only@example.invalid');
  let rapidPosts = 0;
  const countRapid = (request) => {
    if (request.method() === 'POST' && request.headers()['next-action']) rapidPosts++;
  };
  page.on('request', countRapid);
  try {
    const submit = page.getByRole('button', { name: t.staff.manage.create, exact: true });
    await tabTo(submit);
    assert.equal(await submit.isEnabled(), true);
    const bounds = await submit.boundingBox();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
      clickCount: 2,
      delay: 0,
    });
    await saved();
    await page.waitForLoadState('networkidle');
    assert.equal(rapidPosts, 1, 'enabled rapid double activation must issue one action');
    assert.equal(
      (await query('SELECT id FROM people WHERE email=$1', ['double.only@example.invalid'])).length,
      1,
    );
    await audit('enabled rapid double activation creates exactly once');
    evidence.push({ name: 'enabled rapid double activation', requests: rapidPosts, people: 1 });
  } finally {
    page.off('request', countRapid);
  }

  await goto(`/staff/${personId}/edit`);
  const beforeNoop = await receipt();
  await activate(
    region(t.staff.manage.update).getByRole('button', { name: t.staff.manage.update, exact: true }),
  );
  await region(t.staff.manage.update)
    .getByRole('status')
    .filter({ hasText: t.staff.manage.unchanged })
    .waitFor();
  assert.deepEqual(await receipt(), beforeNoop, 'no-op must preserve complete fixture state');
  await audit('unchanged save status');

  await goto(`/staff/${personId}/edit`);
  await input(
    region(t.staff.manage.update).getByLabel(t.staff.email, { exact: true }),
    'invalid-email',
  );
  await activate(
    region(t.staff.manage.update).getByRole('button', { name: t.staff.manage.update, exact: true }),
  );
  await region(t.staff.manage.update).getByRole('alert').waitFor();
  await page.locator('[role="alert"]:focus').waitFor({ timeout: 5000 });
  assert.equal(await page.locator(':focus').getAttribute('role'), 'alert');
  await audit('email validation field association');
  await activate(
    region(t.staff.manage.update).getByRole('link', { name: t.staff.email, exact: true }),
  );
  assert.equal(await page.locator(':focus').getAttribute('name'), 'email');
  await input(
    region(t.staff.manage.update).getByLabel(t.staff.email, { exact: true }),
    'interaction.only@example.invalid',
  );
  await input(
    region(t.staff.manage.update).getByLabel(t.staff.englishName, { exact: true }),
    'KEYBOARD ONLY',
  );
  await select(region(t.staff.manage.update).getByLabel(t.staff.team, { exact: true }), '2');
  await activate(
    region(t.staff.manage.update).getByRole('button', { name: t.staff.manage.update, exact: true }),
  );
  await saved();
  await goto(`/staff/${personId}/edit`);
  await input(
    region(t.staff.manage.rename).getByLabel(t.staff.name, { exact: true }),
    'اختبار تفاعل باسم مصحح TEST ONLY',
  );
  await activate(
    region(t.staff.manage.rename).getByRole('button', { name: t.staff.manage.rename, exact: true }),
  );
  await confirm();
  await saved();
  await goto('/staff?status=all&q=' + encodeURIComponent('اختبار تفاعل نهائي TEST ONLY'));
  const oldLinks = await page
    .locator('#staff-results h3 a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  assert.deepEqual(oldLinks, [`/staff/${personId}`]);
  await page
    .getByText(t.staff.aliasMatch('اختبار تفاعل نهائي TEST ONLY'), { exact: true })
    .waitFor();
  await audit('prior canonical spelling resolves same identity with alias explanation');
  await goto(`/staff/${personId}/edit`);
  await input(
    region(t.staff.manage.addAlias).getByLabel(t.staff.manage.alias, { exact: true }),
    'اختبار هجاء تفاعل محفوظ TEST ONLY',
  );
  await activate(
    region(t.staff.manage.addAlias).getByRole('button', {
      name: t.staff.manage.addAlias,
      exact: true,
    }),
  );
  await saved();
  await goto(`/staff/${personId}/edit`);
  const retire = region(t.staff.manage.retireAlias).filter({
    hasText: 'اختبار هجاء تفاعل محفوظ TEST ONLY',
  });
  await activate(retire.getByRole('button'));
  await confirm();
  await retire.getByRole('alert').waitFor();
  await audit('retirement reason validation');
  await activate(retire.getByRole('link', { name: t.staff.manage.reason, exact: true }));
  assert.equal(await page.locator(':focus').getAttribute('name'), 'reason');
  await input(retire.getByLabel(t.staff.manage.reason, { exact: true }), 'اختبار سبب تقاعد هجاء');
  await activate(retire.getByRole('button'));
  await page.getByRole('dialog').waitFor();
  await audit('retirement consequence dialog');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator(':focus').textContent(), t.staff.manage.retireAlias);
  await page.keyboard.press('Enter');
  await confirm();
  await saved();
  await goto('/staff?status=all&q=' + encodeURIComponent('اختبار هجاء تفاعل محفوظ TEST ONLY'));
  assert.equal(await page.locator('#staff-results h3 a').count(), 0);
  await audit('retired native alias excluded from search');
  await goto(`/staff/${personId}`);
  await page.getByText('اختبار هجاء تفاعل محفوظ TEST ONLY', { exact: true }).waitFor();
  await page.getByText(t.staff.retired, { exact: true }).waitFor();
  await audit('retired alias preserved and labelled in detail');
  await goto(`/staff/${personId}/edit`);
  const restore = region(t.staff.manage.restoreAlias);
  await activate(restore.getByRole('button'));
  await confirm();
  await restore.getByRole('alert').waitFor();
  await audit('restoration reason validation');
  await activate(restore.getByRole('link', { name: t.staff.manage.reason, exact: true }));
  await input(restore.getByLabel(t.staff.manage.reason, { exact: true }), 'اختبار سبب إعادة هجاء');
  await activate(restore.getByRole('button'));
  await page.getByRole('dialog').waitFor();
  await audit('restoration consequence dialog');
  await activate(
    page.getByRole('dialog').getByRole('button', { name: t.staff.manage.cancel, exact: true }),
  );
  assert.equal(await page.locator(':focus').textContent(), t.staff.manage.restoreAlias);
  await page.keyboard.press('Enter');
  await confirm();
  await saved();
  await goto('/staff?status=all&q=' + encodeURIComponent('اختبار هجاء تفاعل محفوظ TEST ONLY'));
  assert.equal(
    await page.locator('#staff-results h3 a').getAttribute('href'),
    `/staff/${personId}`,
  );

  // The exact reviewer candidate set must exclude every inactive/external/trainee.
  await goto(`/staff/${personId}/edit`);
  const eligible = (
    await query('SELECT id FROM people WHERE is_staff AND is_active AND NOT is_trainee ORDER BY id')
  ).map((row) => row.id);
  for (const picker of await page.getByLabel(t.staff.reviewer, { exact: true }).all())
    assert.deepEqual(
      (
        await picker
          .locator('option')
          .evaluateAll((items) => items.map((item) => Number(item.value)))
      ).sort((a, b) => a - b),
      eligible,
    );
  const reviewedTeams = await query('SELECT id,reviewer_id FROM lookup_team ORDER BY id');
  for (let index = 0; index < 2; index++) {
    await goto(`/staff/${personId}/edit`);
    const area = page.getByRole('region', { name: new RegExp(t.staff.manage.reviewer) }).nth(index);
    await select(area.getByLabel(t.staff.reviewer, { exact: true }), String(personId));
    await activate(area.getByRole('button'));
    await saved();
  }
  await goto(`/staff/${personId}/edit`);
  await activate(region(t.staff.manage.deactivate).getByRole('button'));
  await confirm();
  await region(t.staff.manage.deactivate)
    .getByRole('alert')
    .filter({ hasText: t.staff.manage.errors.reviewer })
    .waitFor();
  await audit('keyboard reviewer blocks employment deactivation');
  for (let index = 0; index < 2; index++) {
    await goto(`/staff/${personId}/edit`);
    const area = page.getByRole('region', { name: new RegExp(t.staff.manage.reviewer) }).nth(index);
    await select(
      area.getByLabel(t.staff.reviewer, { exact: true }),
      String(reviewedTeams[index].reviewer_id),
    );
    await activate(area.getByRole('button'));
    await saved();
  }
  await goto(`/staff/${personId}/edit`);
  await activate(region(t.staff.manage.deactivate).getByRole('button'));
  await page.getByRole('dialog').waitFor();
  await audit('employment deactivation consequence dialog');
  await confirm();
  await saved();
  await audit('deactivated employment status');
  await goto(`/staff/${personId}/edit`);
  await activate(region(t.staff.manage.reactivate).getByRole('button'));
  await page.getByRole('dialog').waitFor();
  await audit('employment reactivation consequence dialog');
  await confirm();
  await saved();
  await audit('reactivated employment status');
  evidence.push({ name: 'complete staff keyboard workflow', focus, passed: true });

  // Keep a real independently authenticated browser session alive while the
  // Administrator changes linked employment. Never export cookies or passwords.
  const account = accounts.find((item) => item.roleCode === 'Lawyer');
  const other = await context.browser().newContext();
  await other.route('**/*', (route) =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  let cookies;
  try {
    const otherPage = await other.newPage();
    await otherPage.goto(base + '/login', { waitUntil: 'networkidle' });
    await otherPage.getByLabel(t.auth.username, { exact: true }).fill(account.username);
    await otherPage.getByLabel(t.auth.password, { exact: true }).fill(account.password);
    await otherPage.getByRole('button', { name: t.auth.submit, exact: true }).click();
    await otherPage.waitForURL(base + '/');
    cookies = await other.cookies();
    const before = (
      await query('SELECT is_enabled,session_version FROM user_accounts WHERE id=$1', [account.id])
    )[0];
    await goto(`/staff/${account.personId}/edit`);
    await activate(region(t.staff.manage.deactivate).getByRole('button'));
    await page.getByRole('dialog').waitFor();
    await audit('linked-account deactivation consequences');
    await confirm();
    await saved();
    const disabled = (
      await query(
        'SELECT is_enabled,session_version,failed_login_attempts,locked_until FROM user_accounts WHERE id=$1',
        [account.id],
      )
    )[0];
    assert.equal(disabled.is_enabled, false);
    assert.equal(disabled.session_version, before.session_version + 1);
    assert.equal(disabled.failed_login_attempts, 0);
    assert.equal(disabled.locked_until, null);
    await otherPage.goto(base + '/staff', { waitUntil: 'networkidle' });
    await otherPage.waitForURL('**/login');
    await goto(`/staff/${account.personId}/edit`);
    await activate(region(t.staff.manage.reactivate).getByRole('button'));
    await confirm();
    await saved();
    assert.deepEqual(
      (
        await query(
          'SELECT is_enabled,session_version,failed_login_attempts,locked_until FROM user_accounts WHERE id=$1',
          [account.id],
        )
      )[0],
      disabled,
    );
    await other.clearCookies();
    await other.addCookies(cookies);
    await otherPage.goto(base + '/staff', { waitUntil: 'networkidle' });
    await otherPage.waitForURL('**/login');
    await goto(`/staff/${account.personId}`);
    await audit('employment restored while linked account remains disabled');
    await screenshot('linked-account-stays-disabled');
    evidence.push({
      name: 'actual old browser session denied after deactivation and after employment-only reactivation',
      passed: true,
      accountDisabled: true,
      sessionVersionIncrement: 1,
    });
  } finally {
    cookies = undefined;
    await other.close();
  }
  console.log(
    'PASS Phase 4 keyboard, slow/repeated submission, no-op, field recovery, alias search lifecycle, reviewer replacement and actual browser session protection',
  );
}
