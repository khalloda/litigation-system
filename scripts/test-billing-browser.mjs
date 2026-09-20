import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../src/strings.ts';
import { proveHearingBrowser } from './test-hearing-browser.mjs';
import { proveStaffBrowserZoom, staffFocusProof } from './lib/staff-accessibility-browser.mjs';
import { billingOracle } from './test-billing-read-only.mjs';

export async function proveBillingBrowser(fixture, output, capture) {
  return proveHearingBrowser(
    fixture,
    output,
    async (api) => {
      const { page, context, accounts, login, goto, audit, screenshot, evidence, inspect } = api;
      const oracle = await inspect(billingOracle);
      writeFileSync(join(output, 'browser-oracle.json'), JSON.stringify(oracle, null, 2));
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const payloads = [];
      const hidden = [];
      const responses = [];
      page.on('response', (response) => {
        if (!response.url().includes('/billing')) return;
        const ct = response.headers()['content-type'] ?? '';
        if (!ct.includes('text/html') && !ct.includes('text/x-component')) return;
        let timer;
        const promise = Promise.race([
          response.text(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('body timeout')), 10000);
          }),
        ])
          .then((text) => {
            const matches =
              text.match(
                /receipt_amount|receipt_currency|legacy_receipt_currency_raw|legacy_source_payload|receiptAmount|legacySourcePayload|password_hash|passwordHash|"vat"\s*:|"report"\s*:/gu,
              ) ?? [];
            hidden.push(...matches);
            payloads.push({
              path: new URL(response.url()).pathname,
              type: ct,
              bytes: Buffer.byteLength(text),
              bodyInspected: true,
              hiddenMatches: matches,
            });
          })
          .catch((error) => {
            payloads.push({
              path: new URL(response.url()).pathname,
              type: ct,
              status: response.status(),
              bodyInspected: false,
              reason: error.message.includes('body timeout')
                ? 'background body timeout'
                : 'body unavailable after navigation/close',
              requestFailure: response.request().failure()?.errorText ?? null,
            });
          })
          .finally(() => clearTimeout(timer));
        responses.push(promise);
      });
      const ids = () =>
        page
          .locator('[data-billing-id]')
          .evaluateAll((rows) => rows.map((r) => Number(r.dataset.billingId)));
      const controls = () =>
        page
          .locator('form[data-filter-form] [name]')
          .evaluateAll((rows) => Object.fromEntries(rows.map((r) => [r.name, r.value])));
      const defaults = (kind) => ({
        q: '',
        client: 'all',
        fee: 'all',
        ...(kind === 'invoices' ? { status: 'all', type: 'all' } : { invoice: 'all' }),
        currency: 'all',
        date: 'all',
        from: '',
        to: '',
      });
      const path = (kind) => '/billing/' + kind;
      const proveState = async (kind, expected, values, url) => {
        // History URLs can settle before React commits the restored RSC tree.
        // Wait for the complete visible state, not a network-idle event alone.
        await page.waitForFunction(
          ({ expected, values, pathname, search }) => {
            const actual = Array.from(document.querySelectorAll('[data-billing-id]')).map((row) =>
              Number(row.dataset.billingId),
            );
            const controls = Object.fromEntries(
              Array.from(document.querySelectorAll('form[data-filter-form] [name]')).map((row) => [
                row.name,
                row.value,
              ]),
            );
            return (
              JSON.stringify(actual) === JSON.stringify(expected) &&
              Object.keys(values).length === Object.keys(controls).length &&
              Object.entries(values).every(([key, value]) => controls[key] === value) &&
              location.pathname === pathname &&
              (search === null || location.search === search)
            );
          },
          { expected, values, pathname: path(kind), search: url ?? null },
        );
        assert.deepEqual(await ids(), expected);
        assert.deepEqual(await controls(), values);
        assert.equal(new URL(page.url()).pathname, path(kind));
        if (url !== undefined) assert.equal(new URL(page.url()).search, url);
      };
      await goto('/billing/invoices');
      assert.equal(new URL(page.url()).pathname, '/login');
      for (const account of accounts) {
        await login(account);
        const before = await capture(fixture.migrationUrl);
        writeFileSync(
          join(output, `browser-${account.id}-before.json`),
          JSON.stringify(before, null, 2),
        );
        for (const kind of ['invoices', 'payments']) {
          await goto(path(kind));
          const initial = oracle[kind].slice(0, 25).map((r) => r.id);
          await proveState(kind, initial, defaults(kind), '');
          if (kind === 'invoices') {
            for (const [key, rows] of [
              ['status', oracle.source.statuses],
              ['type', oracle.source.types],
            ]) {
              for (const [id, label] of rows)
                assert.equal(
                  await page.locator(`select[name="${key}"] option[value="${id}"]`).textContent(),
                  label + ' · ' + id,
                );
            }
          }
          await page.getByLabel(t.billing.search, { exact: true }).fill('UNSUBMITTED');
          await page.getByRole('link', { name: t.billing.clear, exact: true }).click();
          await proveState(kind, initial, defaults(kind), '');
          const query = 'TEST ONLY';
          const expected = oracle[kind]
            .filter((r) => (r.details ?? '').includes(query) || (r.invoiceNo ?? '').includes(query))
            .slice(0, 25)
            .map((r) => r.id);
          await page.getByLabel(t.billing.search, { exact: true }).fill(query);
          await page.getByRole('button', { name: t.common.search, exact: true }).click();
          await page.waitForURL((u) => u.searchParams.get('q') === query);
          const filteredURL = new URL(page.url()).search;
          await proveState(kind, expected, { ...defaults(kind), q: query }, filteredURL);
          await page.getByRole('link', { name: t.billing.clear, exact: true }).click();
          await page.waitForURL((u) => u.pathname === path(kind) && !u.search);
          await proveState(kind, initial, defaults(kind), '');
          await page.goBack({ waitUntil: 'networkidle' });
          await proveState(kind, expected, { ...defaults(kind), q: query }, filteredURL);
          await page.goForward({ waitUntil: 'networkidle' });
          await proveState(kind, initial, defaults(kind), '');
          await page.getByRole('link', { name: t.billing.next, exact: true }).click();
          await page.waitForURL((u) => u.searchParams.get('page') === '2');
          const second = oracle[kind].slice(25, 50).map((r) => r.id);
          await proveState(kind, second, defaults(kind), '?page=2');
          await page.locator('[data-billing-id] h3 a').first().click();
          await page.waitForURL((u) => u.pathname === path(kind) + '/' + second[0]);
          await page.getByRole('link', { name: t.billing.back, exact: true }).waitFor();
          assert.equal(await page.locator('main button').count(), 0);
          await page.getByRole('link', { name: t.billing.back, exact: true }).click();
          await page.waitForURL((u) => u.pathname === path(kind));
          await proveState(kind, second, defaults(kind), '?page=2');
          await page.goBack({ waitUntil: 'networkidle' });
          assert.equal(new URL(page.url()).pathname, path(kind) + '/' + second[0]);
          await page.goForward({ waitUntil: 'networkidle' });
          await proveState(kind, second, defaults(kind), '?page=2');
          await audit(account.roleCode + ' ' + kind + ' list');
          await page.getByLabel(t.billing.search, { exact: true }).focus();
          await page.keyboard.press('Tab');
          evidence.push({
            name: account.roleCode + ' ' + kind + ' keyboard focus',
            proof: await staffFocusProof(page),
          });
          await goto(path(kind) + '/' + oracle[kind].find((r) => r.legacyId !== null).id);
          await audit(account.roleCode + ' ' + kind + ' detail');
          for (const suffix of ['/new', '/1/edit', '/1/archive', '/1/restore']) {
            await goto(path(kind) + suffix);
            assert.ok(
              (await page.locator('body').innerText()).includes('404') ||
                (await page.locator('body').innerText()).includes(t.billing.notFound),
            );
          }
          await goto(path(kind) + '?q=x&q=y');
          await page.getByRole('alert').getByText(t.billing.invalid).waitFor();
          await goto(path(kind) + '?from=2025-02-29');
          await page.getByRole('alert').getByText(t.billing.invalid).waitFor();
          await audit(account.roleCode + ' ' + kind + ' invalid-filter state');
          await goto(path(kind) + '/2147483647');
          await page.getByRole('heading', { name: t.billing.notFound, exact: true }).waitFor();
          await audit(account.roleCode + ' ' + kind + ' missing-record state');
          evidence.push({
            name: account.roleCode + ' ' + kind + ' native GET Clear/history/page/detail return',
            initial,
            second,
            filtered: expected,
            filteredURL,
          });
        }
        const split = oracle.invoices.find((r) => r.invoiceNo === '21819');
        assert.ok(split);
        await goto('/billing/invoices/' + split.id);
        assert.ok((await page.locator('main').innerText()).includes('7.5%'));
        assert.equal(
          await page.locator('[data-allocation-id]').count(),
          oracle.allocations.filter((a) => a.invoiceId === split.id).length,
        );
        await audit(account.roleCode + ' recorded shares');
        for (const [, label] of oracle.source.roles) {
          const example = oracle.allocations.find((a) => a.record.role === label);
          assert.ok(example);
          await goto('/billing/invoices/' + example.invoiceId);
          assert.ok((await page.locator('main').innerText()).includes(label));
        }
        evidence.push({
          name: account.roleCode + ' all eleven approved lookup labels',
          labels: [...oracle.source.statuses, ...oracle.source.types, ...oracle.source.roles].map(
            (r) => r[1],
          ),
        });
        const parent = oracle.invoices.find((r) => r.feeId && r.clientId);
        await goto('/fee-letters/' + parent.feeId);
        await audit(account.roleCode + ' fee-letter billing-link regression');
        await page.locator(`a[href="/billing/invoices?fee=${parent.feeId}"]`).click();
        await page.waitForURL((u) => u.pathname === '/billing/invoices');
        await proveState(
          'invoices',
          oracle.invoices
            .filter((r) => r.feeId === parent.feeId)
            .slice(0, 25)
            .map((r) => r.id),
          { ...defaults('invoices'), fee: String(parent.feeId) },
          '?fee=' + parent.feeId,
        );
        await goto('/clients/' + parent.clientId);
        await audit(account.roleCode + ' client billing-link regression');
        await page.locator(`a[href="/billing/payments?client=${parent.clientId}"]`).click();
        await page.waitForURL((u) => u.pathname === '/billing/payments');
        await proveState(
          'payments',
          oracle.payments
            .filter((r) => r.clientId === parent.clientId)
            .slice(0, 25)
            .map((r) => r.id),
          { ...defaults('payments'), client: String(parent.clientId) },
          '?client=' + parent.clientId,
        );
        const matter = await inspect(
          async (db) => (await db.query('SELECT id FROM matters ORDER BY id LIMIT 1')).rows[0].id,
        );
        await goto('/matters/' + matter);
        await audit(account.roleCode + ' matter navigation regression');
        if (account.roleCode === 'Administrator') {
          await goto('/billing/invoices/765432100');
          await audit('long native missing-money text');
          await screenshot('billing-long-native-desktop');
          await page.setViewportSize({ width: 390, height: 844 });
          await goto('/billing/invoices');
          await audit('invoice filters and register mobile');
          await page.screenshot({
            path: join(output, 'billing-invoices-mobile.png'),
            fullPage: false,
          });
          await goto('/billing/invoices/765432100');
          await audit('long native mobile');
          await screenshot('billing-long-native-mobile');
          await goto('/billing/invoices/' + split.id);
          await audit('shares mobile');
          const region = page.getByRole('region', { name: t.billing.allocations, exact: true });
          await region.focus();
          const scrollBefore = await region.evaluate((el) => ({
            left: el.scrollLeft,
            width: el.clientWidth,
            scrollWidth: el.scrollWidth,
          }));
          assert.ok(scrollBefore.scrollWidth > scrollBefore.width);
          await page.keyboard.press('ArrowLeft');
          await page.waitForFunction(() => {
            const el = document.querySelector('[role="region"]');
            return el && Math.abs(el.scrollLeft) > 0;
          });
          evidence.push({
            name: 'Native keyboard scroll of bounded RTL allocation table',
            before: scrollBefore,
            after: await region.evaluate((el) => ({
              left: el.scrollLeft,
              width: el.clientWidth,
              scrollWidth: el.scrollWidth,
            })),
          });
          await page.keyboard.press('Control+Home');
          await screenshot('billing-shares-mobile');
          await page.setViewportSize({ width: 1440, height: 1000 });
          await proveStaffBrowserZoom({
            context,
            page,
            audit,
            screenshot,
            evidence,
            name: 'billing-shares-200-percent',
            worker,
          });
          await goto('/billing/payments');
          await screenshot('billing-payments-desktop');
        }
        const after = await capture(fixture.migrationUrl);
        writeFileSync(
          join(output, `browser-${account.id}-after.json`),
          JSON.stringify(after, null, 2),
        );
        for (const key of ['tables', 'sequences', 'catalogs', 'ledger'])
          assert.deepEqual(after[key], before[key], account.roleCode + ' read window ' + key);
      }
      await context.close();
      await Promise.all(responses);
      assert.deepEqual(hidden, []);
      assert.ok(payloads.filter((p) => p.bodyInspected).length >= 32);
      writeFileSync(join(output, 'payload-projections.json'), JSON.stringify(payloads, null, 2));
      evidence.push({
        name: 'Hidden-field HTML/RSC inspection',
        responses: payloads.length,
        inspected: payloads.filter((p) => p.bodyInspected).length,
        unavailable: payloads.filter((p) => !p.bodyInspected).length,
        hiddenMatches: hidden,
      });
    },
    { skipGenerate: true, boundedDependencyCheck: true },
  );
}
