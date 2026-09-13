import assert from 'node:assert/strict';
import { t } from '../../src/strings.ts';
import { staffFocusProof, proveStaffBrowserZoom } from './staff-accessibility-browser.mjs';
export async function hearingEditingBrowserProof({
  page,
  context,
  accounts,
  login,
  goto,
  audit,
  screenshot,
  evidence,
  inspect,
  createdId,
  d41Id,
}) {
  const currentPlans = await inspect(async (db) => {
    await db.query('BEGIN READ ONLY');
    try {
      return {
        population: (
          await db.query(
            'SELECT count(*)::int total,count(*) FILTER(WHERE legacy_id IS NOT NULL)::int imported,count(*) FILTER(WHERE legacy_id IS NOT NULL AND matter_id IS NULL)::int imported_unassigned FROM hearings',
          )
        ).rows[0],
        detail: (
          await db.query(
            "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT ha.id FROM hearing_attendees ha WHERE NOT coalesce((to_jsonb(ha)->>'is_retired')::boolean,false) AND ha.hearing_id=$1 ORDER BY coalesce((to_jsonb(ha)->>'current_order')::integer,ha.ordinal) NULLS LAST,ha.id LIMIT 1001",
            [createdId],
          )
        ).rows,
        filter: (
          await db.query(
            "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT h.id FROM hearings h WHERE EXISTS(SELECT 1 FROM hearing_attendees ha WHERE NOT coalesce((to_jsonb(ha)->>'is_retired')::boolean,false) AND ha.hearing_id=h.id AND ha.person_id=(SELECT person_id FROM hearing_attendees WHERE hearing_id=$1 LIMIT 1)) ORDER BY h.hearing_date DESC NULLS LAST,h.id DESC LIMIT 25",
            [createdId],
          )
        ).rows,
      };
    } finally {
      await db.query('ROLLBACK');
    }
  });
  assert.equal(currentPlans.population.imported, 13382);
  assert.equal(currentPlans.population.imported_unassigned, 4);
  evidence.push({
    name: 'Fresh current membership detail/filter plans at real volume',
    ...currentPlans,
  });
  for (const path of ['/hearings/new', `/hearings/${createdId}/edit`]) {
    await goto(path);
    assert.ok(page.url().includes('/login'));
  }
  for (const account of accounts) {
    await login(account);
    if (!['Administrator', 'Litigation Assistant'].includes(account.roleCode)) {
      for (const path of ['/hearings/new', `/hearings/${createdId}/edit`]) {
        await goto(path);
        assert.equal(await page.locator('main form').count(), 0);
        await audit(account.roleCode + ' denied ' + path);
      }
      continue;
    }
    await goto('/hearings/new');
    await page.getByLabel(t.fields.decision, { exact: true }).waitFor();
    await audit(account.roleCode + ' new hearing');
    await page.getByLabel(t.fields.decision, { exact: true }).fill('TEST ONLY invalid\u0001');
    await page.getByRole('button', { name: t.common.save, exact: true }).click();
    await page.getByRole('alert').filter({ hasText: t.hearings.manage.errors.invalid }).waitFor();
    assert.equal(
      await page.getByLabel(t.fields.decision, { exact: true }).inputValue(),
      'TEST ONLY invalid\u0001',
    );
    assert.equal(
      await page.locator('main [role=alert]').evaluate((e) => e === document.activeElement),
      true,
    );
    await audit(account.roleCode + ' validation recovery');
    await page
      .getByLabel(t.fields.decision, { exact: true })
      .fill('TEST ONLY browser hearing\nsecond line');
    await page.getByLabel(t.fields.hearingDate, { exact: true }).fill('2024-02-29');
    const select = page.getByLabel(t.hearings.filters.attendee, { exact: true });
    const options = await select
      .locator('option')
      .evaluateAll((nodes) => nodes.map((n) => n.value).filter(Boolean));
    assert.ok(options.length);
    await select.selectOption(options[0]);
    await page.getByRole('button', { name: t.common.add, exact: true }).click();
    const count = () =>
      inspect(async (db) => (await db.query('SELECT count(*)::int n FROM hearings')).rows[0].n);
    const before = await count();
    let lost = false;
    await page.route('**/hearings/new', async (route) => {
      if (route.request().method() === 'POST' && !lost) {
        lost = true;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: t.common.save, exact: true }).click();
    await page.getByRole('alert').filter({ hasText: t.hearings.manage.errors.generic }).waitFor();
    assert.equal(await count(), before + 1);
    await page.unroute('**/hearings/new');
    await page.getByRole('button', { name: t.clients.retry, exact: true }).click();
    await page.locator('main [role=status]').waitFor();
    assert.equal(await count(), before + 1);
    assert.ok(
      (await page.locator('main [role=status]').innerText()).includes(t.hearings.manage.saved),
    );
    await audit(account.roleCode + ' created');
    const href = await page
      .getByRole('link', { name: t.clients.manage.backRecord, exact: true })
      .getAttribute('href');
    assert.match(href, /^\/hearings\/\d+$/);
    await goto(href + '/edit');
    await page.getByLabel(t.fields.decision, { exact: true }).waitFor();
    await page.getByRole('button', { name: t.matters.manage.remove, exact: true }).click();
    await page.getByRole('button', { name: new RegExp('^' + t.hearings.manage.reselect) }).click();
    await page.getByRole('button', { name: t.common.save, exact: true }).click();
    await page.getByText(t.hearings.manage.unchanged, { exact: true }).waitFor();
    await audit(account.roleCode + ' unchanged');
    await goto(href + '/edit');
    await page.getByLabel(t.fields.notes, { exact: true }).waitFor();
    const stale = await context.newPage();
    try {
      await stale.goto(page.url(), { waitUntil: 'networkidle' });
      await stale
        .getByLabel(t.fields.notes, { exact: true })
        .fill('TEST ONLY retained stale input');
      await page.getByLabel(t.fields.notes, { exact: true }).fill('TEST ONLY browser editing');
      await page.getByRole('button', { name: t.common.save, exact: true }).click();
      await page.getByText(t.hearings.manage.saved, { exact: true }).waitFor();
      await stale.getByRole('button', { name: t.common.save, exact: true }).click();
      await stale.getByRole('alert').filter({ hasText: t.hearings.manage.errors.stale }).waitFor();
      assert.equal(
        await stale.getByLabel(t.fields.notes, { exact: true }).inputValue(),
        'TEST ONLY retained stale input',
      );
      await stale.getByRole('link', { name: t.logos.reload, exact: true }).click();
      await stale.getByLabel(t.fields.notes, { exact: true }).waitFor();
      assert.equal(
        await stale.getByLabel(t.fields.notes, { exact: true }).inputValue(),
        'TEST ONLY browser editing',
      );
    } finally {
      await stale.close();
    }
    evidence.push({
      name:
        account.roleCode +
        ' validation retains values and focus; lost response retry exactly once; stale form retained and reload correct',
    });
    await goto(`/hearings/${d41Id}/edit`);
    await page.getByLabel(t.fields.notes, { exact: true }).waitFor();
    for (const label of [t.fields.notes, t.fields.circuit, t.fields.court])
      assert.equal(await page.getByLabel(label, { exact: true }).isDisabled(), true);
    await audit(account.roleCode + ' protected fields');
  }
  const inactive = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT a.hearing_id,a.person_id FROM hearing_attendees a JOIN people p ON p.id=a.person_id LEFT JOIN matters m ON m.id=(SELECT matter_id FROM hearings WHERE id=a.hearing_id) WHERE NOT a.is_retired AND NOT p.is_active AND NOT coalesce(m.is_archived,false) ORDER BY a.id LIMIT 1',
        )
      ).rows[0],
  );
  await login(accounts.find((a) => a.roleCode === 'Administrator'));
  await goto('/hearings/' + inactive.hearing_id + '/edit');
  await page.getByLabel(t.fields.decision, { exact: true }).waitFor();
  assert.ok(await page.getByText(new RegExp(t.staff.former)).count());
  assert.equal(
    await page
      .getByLabel(t.hearings.filters.attendee, { exact: true })
      .locator('option[value="' + inactive.person_id + '"]')
      .count(),
    0,
  );
  await audit('Inactive attendee visible and excluded from new selection');
  await screenshot('hearing-editor-inactive');
  await goto('/hearings/new');
  await page.getByLabel(t.fields.decision, { exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 900 });
  await audit('320px hearing editor');
  await screenshot('hearing-editor-320');
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.getByLabel(t.fields.decision, { exact: true }).focus();
  await staffFocusProof(page);
  await proveStaffBrowserZoom({
    page,
    context,
    audit,
    screenshot,
    evidence,
    name: 'hearing-editor',
  });
  const fonts = await page.evaluate(async () => {
    await document.fonts.load('16px "Noto Naskh Arabic"', 'الجلسات ABC');
    return document.fonts.check('16px "Noto Naskh Arabic"', 'الجلسات ABC');
  });
  assert.equal(fonts, true);
  for (const subset of ['arabic', 'latin', 'latin-ext']) {
    const response = await page.request.get(
      new URL('/fonts/noto-naskh-arabic-' + subset + '-wght-normal.woff2', page.url()).href,
    );
    assert.equal(response.status(), 200);
  }
  evidence.push({ name: 'Bundled Arabic/Latin fonts load successfully' });
  evidence.push({
    name: 'Both editors create/edit/no-op; denied roles and unauthenticated; D41 disabled; 320px, real browser zoom, keyboard and axe',
  });
}
