import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../src/strings.ts';
import { lifecycleSessions } from './lib/matter-lifecycle-proof.ts';
import { mutatePoa, readPoaMutation } from '../src/lib/poa-mutations.ts';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata.ts';
import { adminEditState } from './lib/admin-edit-state.ts';
import { staffFocusProof } from './lib/staff-accessibility-browser.mjs';

/** Called only by an already positively identified disposable browser fixture. */
export async function provePoaFilterNavigation(api, output, { red = false } = {}) {
  const { page, accounts, login, goto, inspect, runtime, screenshot } = api;
  const defaults = {
    q: '',
    client: 'all',
    lawyer: 'all',
    archive: 'current',
    copies: 'all',
    report: 'all',
  };
  const observations = [];
  const controls = () =>
    page
      .locator('form [name]')
      .evaluateAll((els) => Object.fromEntries(els.map((el) => [el.name, el.value])));
  const settle = () => page.waitForLoadState('networkidle');
  const follow = async (link) => {
    const target = new URL(await link.getAttribute('href'), page.url()).href;
    await Promise.all([page.waitForURL(target), link.click()]);
    await settle();
    const path = new URL(target).pathname;
    if (path === '/powers-of-attorney')
      await page.locator('form [name="q"]').waitFor({ state: 'visible' });
    else if (/\/powers-of-attorney\/\d+$/u.test(path))
      await page
        .getByRole('heading', { name: t.poa.details + ' · ' + path.split('/').at(-1), exact: true })
        .waitFor({ state: 'visible' });
    else await page.locator('form').waitFor({ state: 'visible' });
  };
  const clear = async () => {
    await follow(page.getByRole('link', { name: t.clients.clear, exact: true }));
  };
  const submit = async () => {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.getByRole('button', { name: t.common.search, exact: true }).click(),
    ]);
  };
  const set = async (values) => {
    for (const [key, value] of Object.entries(values)) {
      const control = page.locator('form [name="' + key + '"]');
      if (key === 'q') await control.fill(value);
      else await control.selectOption(value);
    }
  };
  const client = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT p.client_id id FROM powers_of_attorney p JOIN clients c ON c.id=p.client_id WHERE NOT p.is_archived AND NOT c.is_archived ORDER BY p.id DESC LIMIT 1',
        )
      ).rows[0],
  );
  assert(client);
  try {
    if (red) {
      const beforeState = await inspect(adminEditState);
      await login(accounts.find((a) => a.roleCode === 'Administrator'));
      await goto('/powers-of-attorney');
      await set({ client: String(client.id) });
      await submit();
      const before = {
        url: page.url(),
        controls: await controls(),
        results: await page.locator('#poa-results h2').innerText(),
      };
      await clear();
      const after = {
        url: page.url(),
        controls: await controls(),
        results: await page.locator('#poa-results h2').innerText(),
      };
      assert.equal(new URL(after.url).search, '');
      assert.equal(
        after.controls.client,
        String(client.id),
        'Reproduce stale client after in-place Clear',
      );
      await screenshot('red-stale-client');
      await submit();
      assert.equal(new URL(page.url()).searchParams.get('client'), String(client.id));
      observations.push({
        name: 'RED reproduced Clear and Search resurrection',
        before,
        after,
        resurrected: page.url(),
      });
      assert.deepEqual(await inspect(adminEditState), beforeState);
      return;
    }
    const actor = (await lifecycleSessions(runtime)).find((s) => s.user.role === 'Administrator');
    const options = await readPoaMutation(actor, 'create', null, runtime);
    const lawyer = options.people.find((p) => p.active);
    assert(lawyer);
    const dep = { database: runtime, auditMetadata: createMaintenanceAuditMetadata() };
    const seed = [];
    for (const [copies, report, linked] of [
      [0, false, false],
      [null, null, false],
      [2, true, true],
    ]) {
      const result = await mutatePoa(
        actor,
        'create',
        {
          operation: 'create',
          id: null,
          version: null,
          submission: randomUUID(),
          values: {
            principal_name: 'TEST ONLY A1 navigation ' + seed.length,
            client_id: linked ? client.id : null,
            copies_count: copies,
            show_on_poa_report: report,
          },
          lawyers: linked ? [lawyer.id] : [],
          facts: null,
        },
        dep,
      );
      seed.push(result.id);
    }
    const archived = await readPoaMutation(actor, 'archive', seed[0], runtime);
    await mutatePoa(
      actor,
      'archive',
      {
        operation: 'archive',
        id: seed[0],
        version: archived.record.version,
        submission: randomUUID(),
        values: {},
        lawyers: null,
        facts: archived.facts,
      },
      dep,
    );
    // Independent oracle: read all raw rows once, then filter/sort in this test.
    // No production parser, query builder, list loader or result counts are called.
    const raw = await inspect(
      async (db) =>
        (
          await db.query(`SELECT p.*,c.name_ar,c.full_name,c.name_en,
      ARRAY(SELECT l.person_id FROM power_of_attorney_lawyers l WHERE l.power_of_attorney_id=p.id AND NOT l.is_retired) current_lawyers,
      ARRAY(SELECT public.ar_normalise(v) FROM unnest(ARRAY[p.principal_name,p.poa_capacity,p.poa_number,p.poa_letter,p.poa_year,concat_ws(' / ',p.poa_number,p.poa_letter,p.poa_year),p.serial_no,p.issuing_authority,p.notes,p.client_name,p.legacy_lawyers_raw,c.name_ar,c.full_name,c.name_en]) v) search_values
      FROM powers_of_attorney p LEFT JOIN clients c ON c.id=p.client_id ORDER BY p.id DESC`)
        ).rows,
    );
    const oracle = (f) =>
      raw.filter((r) => {
        if (f.archive !== 'all' && r.is_archived !== (f.archive === 'archived')) return false;
        if (
          f.client === 'missing'
            ? r.client_id !== null
            : f.client !== 'all' && String(r.client_id) !== f.client
        )
          return false;
        if (
          f.lawyer === 'missing'
            ? r.current_lawyers.length !== 0
            : f.lawyer !== 'all' && !r.current_lawyers.includes(Number(f.lawyer))
        )
          return false;
        if (
          f.copies === 'unknown'
            ? r.copies_count !== null
            : f.copies === 'zero'
              ? r.copies_count !== 0
              : f.copies === 'positive' && !(r.copies_count > 0)
        )
          return false;
        if (
          f.report === 'unknown'
            ? r.show_on_poa_report !== null
            : f.report !== 'all' && r.show_on_poa_report !== (f.report === 'shown')
        )
          return false;
        const q = f.q
          .replace(/[٠-٩]/gu, (n) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(n)))
          .toLowerCase()
          .replaceAll(' ', '');
        return (
          !q || String(r.id) === q || r.search_values.some((v) => v?.toLowerCase().includes(q))
        );
      });
    const verify = async (name) => {
      await settle();
      await page.locator('form [name="q"]').waitFor({ state: 'visible' });
      await page.locator('#poa-results h2').waitFor({ state: 'visible' });
      const params = new URL(page.url()).searchParams;
      const f = Object.fromEntries(
        Object.entries(defaults).map(([k, v]) => [k, params.get(k) ?? v]),
      );
      assert.deepEqual(await controls(), f, name + ': controls match URL');
      const expected = oracle(f),
        pages = Math.max(1, Math.ceil(expected.length / 25));
      const current = Math.min(Number(params.get('page') ?? 1), pages);
      const ids = await page
        .locator('#poa-results article h3 a')
        .evaluateAll((els) => els.map((el) => Number(new URL(el.href).pathname.split('/').at(-1))));
      assert.deepEqual(
        ids,
        expected.slice((current - 1) * 25, current * 25).map((r) => r.id),
        name + ': independent page IDs',
      );
      assert.equal(
        await page.locator('#poa-results h2').innerText(),
        t.poa.results + ' · ' + expected.length,
      );
      observations.push({
        name,
        role: activeRole,
        url: page.url(),
        controls: f,
        total: expected.length,
        ids,
      });
    };
    let activeRole;
    const baseline = await inspect(adminEditState);
    for (const account of accounts) {
      activeRole = account.roleCode;
      await login(account);
      await goto('/powers-of-attorney');
      await verify('default');
      assert.equal(
        await page.getByRole('link', { name: t.poa.create, exact: true }).count(),
        ['Administrator', 'Litigation Assistant'].includes(activeRole) ? 1 : 0,
      );
      const cases = [
        { client: String(client.id) },
        { client: 'missing' },
        { lawyer: String(lawyer.id) },
        { lawyer: 'missing' },
        { archive: 'archived' },
        { archive: 'all' },
        { copies: 'zero' },
        { copies: 'positive' },
        { copies: 'unknown' },
        { report: 'shown' },
        { report: 'hidden' },
        { report: 'unknown' },
        { q: 'TEST ONLY A1 navigation' },
        { q: String(seed[2]) },
        { q: String(seed[2]).replace(/[0-9]/gu, (n) => '٠١٢٣٤٥٦٧٨٩'[Number(n)]) },
        {
          client: String(client.id),
          lawyer: String(lawyer.id),
          copies: 'positive',
          report: 'shown',
          archive: 'all',
        },
        { client: 'missing', copies: 'unknown', report: 'unknown', archive: 'all' },
      ];
      for (const values of cases) {
        await set({ ...defaults, ...values });
        await submit();
        await verify('submitted ' + JSON.stringify(values));
        await clear();
        await verify('Clear');
        assert.equal(new URL(page.url()).search, '');
        await submit();
        await verify('Search after Clear');
        assert.deepEqual(await controls(), defaults);
      }
      await clear();
      await set({
        q: 'UNSUBMITTED TEST ONLY',
        client: String(client.id),
        lawyer: String(lawyer.id),
        archive: 'all',
        copies: 'unknown',
        report: 'hidden',
      });
      await page.locator('[name=q]').blur();
      assert.equal((await controls()).q, 'UNSUBMITTED TEST ONLY', 'Draft survives ordinary blur');
      assert.equal(new URL(page.url()).search, '');
      await clear();
      await verify('same URL draft Clear');
      assert.deepEqual(await controls(), defaults);
      await clear();
      await verify('repeated Clear');
      await submit();
      await verify('same URL Clear then Search');
      await set({ q: 'UNSUBMITTED HISTORY DRAFT' });
      await page.goBack();
      await verify('Back discards draft between equivalent default URLs');
      await page.goForward();
      await verify('Forward discards restored draft');
      await follow(page.getByRole('link', { name: t.poa.next, exact: true }));
      await verify('page2');
      await clear();
      await verify('Clear resets page');
      assert.equal(new URL(page.url()).search, '');
      await page.goBack();
      await verify('Back to page2');
      await page.goForward();
      await verify('Forward to cleared page1');
      await set({ report: 'shown', archive: 'all' });
      await submit();
      await verify('filtered before detail');
      await follow(page.locator('#poa-results article h3 a').first());
      assert.equal(
        await page.getByRole('link', { name: t.poa.edit, exact: true }).count(),
        ['Administrator', 'Litigation Assistant'].includes(activeRole) ? 1 : 0,
      );
      assert.equal(
        await page.locator('#poa-lifecycle').count(),
        activeRole === 'Administrator' ? 1 : 0,
      );
      if (['Administrator', 'Litigation Assistant'].includes(activeRole)) {
        await follow(page.getByRole('link', { name: t.poa.edit, exact: true }));
        await follow(page.locator('form').getByRole('link', { name: t.poa.cancel, exact: true }));
      }
      if (activeRole === 'Administrator') {
        await follow(page.locator('#poa-lifecycle'));
        await follow(page.locator('form').getByRole('link', { name: t.poa.cancel, exact: true }));
      }
      await follow(page.getByRole('link', { name: t.poa.back, exact: true }));
      await verify('detail/edit Cancel return');
      await page.goBack();
      await settle();
      await page.goForward();
      await verify('Back/Forward return context');
      if (activeRole === 'Administrator') {
        await set({ ...defaults, archive: 'archived' });
        await submit();
        await verify('archived before restore Cancel');
        await follow(page.locator('#poa-results article h3 a').first());
        await follow(page.locator('#poa-lifecycle'));
        await follow(page.locator('form').getByRole('link', { name: t.poa.cancel, exact: true }));
        await follow(page.getByRole('link', { name: t.poa.back, exact: true }));
        await verify('restore Cancel return');
      }
      await page.setViewportSize({ width: 320, height: 900 });
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await screenshot('green-' + activeRole.replaceAll(' ', '-') + '-320');
      const link = page.getByRole('link', { name: t.clients.clear, exact: true });
      await page.getByRole('button', { name: t.common.search, exact: true }).focus();
      await page.keyboard.press('Tab');
      assert.equal(await link.evaluate((el) => el === document.activeElement), true);
      await staffFocusProof(page);
      await Promise.all([
        page.waitForURL(new URL('/powers-of-attorney', page.url()).href),
        link.press('Enter'),
      ]);
      await verify('keyboard Clear');
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    // Preserve native GET/anchor markup even when the framework's existing
    // streamed loading shell prevents visible interaction without JavaScript.
    const noJs = await api.context.browser().newContext({
      javaScriptEnabled: false,
    });
    try {
      await noJs.addCookies(await api.context.cookies());
      const plain = await noJs.newPage();
      const base = new URL(page.url()).origin;
      await noJs.route('**/*', (route) =>
        new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
      );
      await plain.goto(base + '/powers-of-attorney', { waitUntil: 'networkidle' });
      assert.equal(await plain.locator('form').getAttribute('method'), 'get');
      assert.equal(await plain.locator('form').getAttribute('action'), '/powers-of-attorney');
      assert.equal(await plain.locator('form a').getAttribute('href'), '/powers-of-attorney');
      const visible = await plain.locator('[name=client]').isVisible();
      if (visible) {
        await plain.locator('[name=client]').selectOption(String(client.id));
        await Promise.all([
          plain.waitForNavigation({ waitUntil: 'networkidle' }),
          plain.getByRole('button', { name: t.common.search, exact: true }).click(),
        ]);
        assert.equal(new URL(plain.url()).searchParams.get('client'), String(client.id));
        await Promise.all([
          plain.waitForNavigation({ waitUntil: 'networkidle' }),
          plain.getByRole('link', { name: t.clients.clear, exact: true }).click(),
        ]);
        assert.equal(new URL(plain.url()).search, '');
      } else assert.equal(await plain.getByRole('status').isVisible(), true);
      assert.deepEqual(
        await plain
          .locator('form [name]')
          .evaluateAll((els) => Object.fromEntries(els.map((el) => [el.name, el.value]))),
        defaults,
      );
      observations.push({
        name: 'Native GET/clear-anchor HTML preserved with JavaScript disabled',
        visibleInteraction: visible,
        limit: visible
          ? null
          : 'Existing streamed loading shell; no no-JavaScript interaction claim. Unchanged-build comparison is supplied separately.',
        role: activeRole,
        url: plain.url(),
      });
    } finally {
      await noJs.close();
    }
    assert.deepEqual(
      await inspect(adminEditState),
      baseline,
      'All navigation leaves complete fixture state unchanged',
    );
  } finally {
    writeFileSync(
      join(output, 'filter-navigation.json'),
      JSON.stringify(
        {
          mode: red ? 'red' : 'green',
          observations,
          oracle:
            'Independent raw-row snapshot plus test-side filtering and paging; q subjects are fixture principal markers and digits, not lawyer aliases.',
        },
        null,
        2,
      ),
    );
  }
}
