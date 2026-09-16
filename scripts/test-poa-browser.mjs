import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { t } from '../src/strings.ts';
import { proveHearingBrowser } from './test-hearing-browser.mjs';
import { proveStaffBrowserZoom, staffFocusProof } from './lib/staff-accessibility-browser.mjs';
import { lifecycleSessions } from './lib/matter-lifecycle-proof.ts';
import { readPoaMutation, mutatePoa } from '../src/lib/poa-mutations.ts';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata.ts';
import { readPoa, readPoas } from '../src/lib/poa-query.ts';
import { provePoaFilterNavigation } from './test-poa-filter-browser.mjs';

export async function provePoaBrowser(fixture, output) {
  return proveHearingBrowser(
    fixture,
    output,
    async (api) => {
      const { page, accounts, login, goto, audit, screenshot, evidence, runtime, base } = api;
      const field = (label) => page.getByLabel(label, { exact: true });
      const save = () => page.getByRole('button', { name: t.poa.save, exact: true }).click();
      const detail = async () => {
        await page.waitForURL(/\/powers-of-attorney\/\d+(?:\?|$)/u);
        await page.waitForLoadState('networkidle');
        return Number(new URL(page.url()).pathname.split('/').at(-1));
      };
      const fixtureAdmin = (await lifecycleSessions(runtime)).find(
        (s) => s.user.role === 'Administrator',
      );
      const sourceIds = await runtime.$queryRawUnsafe(
        'SELECT id FROM powers_of_attorney WHERE client_name IS NOT NULL AND NOT is_archived ORDER BY id LIMIT 2',
      );
      const sources = [];
      for (const [index, row] of sourceIds.entries()) {
        const state = await readPoaMutation(fixtureAdmin, 'update', row.id, runtime);
        const client =
          index === 0
            ? null
            : state.clients.find((c) => c.active && c.id !== state.record.values.client_id).id;
        await mutatePoa(
          fixtureAdmin,
          'update',
          {
            operation: 'update',
            id: row.id,
            version: state.record.version,
            submission: randomUUID(),
            values: { client_id: client },
            lawyers: [],
            facts: null,
          },
          { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
        );
        sources.push(await readPoa(fixtureAdmin, String(row.id), runtime));
      }
      const filterRows = await runtime.$queryRawUnsafe(
        'SELECT id,client_id,is_archived FROM powers_of_attorney ORDER BY id DESC',
      );
      const filterMembers = await runtime.$queryRawUnsafe(
        'SELECT power_of_attorney_id,person_id,is_retired FROM power_of_attorney_lawyers',
      );
      for (const [key, choices] of [
        ['archive', ['current', 'archived', 'all']],
        [
          'client',
          [
            'missing',
            ...new Set(
              filterRows.filter((r) => r.client_id !== null).map((r) => String(r.client_id)),
            ),
          ],
        ],
        ['lawyer', ['missing', ...new Set(filterMembers.map((r) => String(r.person_id)))]],
      ]) {
        for (const choice of choices) {
          const expected = filterRows
            .filter((row) =>
              key === 'archive'
                ? choice === 'all' || row.is_archived === (choice === 'archived')
                : key === 'client'
                  ? row.client_id === (choice === 'missing' ? null : Number(choice))
                  : choice === 'missing'
                    ? !filterMembers.some((m) => m.power_of_attorney_id === row.id && !m.is_retired)
                    : filterMembers.some(
                        (m) =>
                          m.power_of_attorney_id === row.id &&
                          !m.is_retired &&
                          m.person_id === Number(choice),
                      ),
            )
            .map((row) => row.id);
          const params = { archive: 'all', [key]: choice };
          const first = await readPoas(fixtureAdmin, params, runtime),
            actual = [...first.rows];
          for (let pageNumber = 2; pageNumber <= first.pages; pageNumber++)
            actual.push(
              ...(await readPoas(fixtureAdmin, { ...params, page: String(pageNumber) }, runtime))
                .rows,
            );
          assert.deepEqual(
            actual.map((row) => row.id),
            expected,
          );
          assert.equal(first.total, expected.length);
          evidence.push({
            name: 'Independent complete ' + key + '=' + choice,
            expectedIds: expected,
          });
        }
      }
      await goto('/powers-of-attorney');
      assert.equal(new URL(page.url()).pathname, '/login');
      for (const account of accounts) {
        await login(account);
        for (const source of sources) {
          const firstSourcePage = await readPoas(fixtureAdmin, { q: String(source.id) }, runtime);
          let sourcePage = 1;
          for (; sourcePage <= firstSourcePage.pages; sourcePage++) {
            const result =
              sourcePage === 1
                ? firstSourcePage
                : await readPoas(
                    fixtureAdmin,
                    { q: String(source.id), page: String(sourcePage) },
                    runtime,
                  );
            if (result.rows.some((row) => row.id === source.id)) break;
          }
          assert.ok(sourcePage <= firstSourcePage.pages);
          for (const isList of [false, true]) {
            await goto(
              isList
                ? '/powers-of-attorney?q=' + source.id + '&page=' + sourcePage
                : '/powers-of-attorney/' + source.id,
            );
            const scope = isList
              ? page.locator('article').filter({
                  has: page.locator('h3 a[href^="/powers-of-attorney/' + source.id + '?"]'),
                })
              : page.locator('main');
            const current = scope
              .locator('dt')
              .filter({ hasText: new RegExp('^' + t.poa.currentClient + '$') })
              .locator('..')
              .locator('dd');
            assert.equal(await current.textContent(), source.clientName ?? t.poa.unknown);
            assert.equal(await current.locator('a').count(), source.clientId === null ? 0 : 1);
            const original = scope
              .locator('dt')
              .filter({ hasText: new RegExp('^' + t.poa.sourceClient + '$') })
              .locator('..')
              .locator('dd');
            assert.equal(await original.textContent(), source.sourceClient);
            assert.ok(await scope.getByText(t.poa.noCurrent, { exact: true }).count());
          }
        }
        await screenshot('current-source-' + account.roleCode.replaceAll(' ', '-'));
        await goto('/powers-of-attorney');
        await audit(account.roleCode + ' POA list');
        await screenshot('list-' + account.roleCode.replaceAll(' ', '-'));
        await field(t.poa.copies).selectOption('positive');
        await field(t.poa.report).selectOption('shown');
        await page.getByRole('button', { name: t.common.search, exact: true }).click();
        await page.waitForURL(
          (url) =>
            url.searchParams.get('copies') === 'positive' &&
            url.searchParams.get('report') === 'shown',
        );
        await page.waitForLoadState('networkidle');
        assert.equal(new URL(page.url()).searchParams.get('copies'), 'positive');
        await page.getByRole('link', { name: t.poa.next, exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get('page') === '2');
        await page.waitForLoadState('networkidle');
        const listContext = new URL(page.url()).search;
        assert.equal(new URL(page.url()).searchParams.get('page'), '2');
        await page.locator('#poa-results article h3 a').first().click();
        await detail();
        assert.equal(new URL(page.url()).search, listContext);
        await page.getByRole('link', { name: t.poa.back, exact: true }).first().click();
        await page.waitForURL(
          (url) => url.pathname === '/powers-of-attorney' && url.search === listContext,
        );
        await page.waitForLoadState('networkidle');
        assert.equal(new URL(page.url()).search, listContext);
        await page
          .getByRole('textbox', { name: t.poa.search, exact: true })
          .fill('TEST ONLY browser impossible search');
        await page.getByRole('button', { name: t.common.search, exact: true }).click();
        await page.waitForURL(
          (url) => url.searchParams.get('q') === 'TEST ONLY browser impossible search',
        );
        await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('#poa-results article').count(), 0);
        await goto('/powers-of-attorney/1');
        await audit(account.roleCode + ' POA imported detail');
        if (!['Administrator', 'Litigation Assistant'].includes(account.roleCode)) {
          for (const route of ['/new', '/1/edit', '/1/archive', '/1/restore']) {
            await goto('/powers-of-attorney' + route);
            assert.equal(await page.locator('main form').count(), 0);
          }
          evidence.push({ name: account.roleCode + ' four direct write routes denied' });
          continue;
        }
        await goto('/powers-of-attorney/new');
        await save();
        await page.locator('main [role=alert]').waitFor();
        assert.equal(
          await page.locator('main [role=alert]').evaluate((el) => el === document.activeElement),
          true,
        );
        assert.equal(await field(t.poa.principal).getAttribute('aria-invalid'), 'true');
        await field(t.poa.principal).fill('TEST ONLY browser ' + account.roleCode + '\nأحمد ١٤٠ق');
        await field(t.poa.number).fill('TEST ONLY 140J');
        await field(t.poa.serial).fill('A/B');
        await field(t.poa.capacity).fill('TEST ONLY capacity\ncomplete');
        await field(t.poa.letter).fill('أ/B');
        await field(t.poa.year).fill('A/B');
        await field(t.poa.issuer).fill('TEST ONLY issuer');
        await field(t.poa.issueDate).fill('2026-09-15');
        await field(t.poa.copies).fill('0');
        await field(t.poa.report).selectOption('false');
        await field(t.fields.notes).fill('TEST ONLY\n  complete second line  ');
        await audit(account.roleCode + ' POA editor');
        if (account.roleCode === 'Administrator') {
          await screenshot('editor-desktop');
          await page.setViewportSize({ width: 320, height: 900 });
          await audit('POA editor 320px');
          await screenshot('editor-320');
          await proveStaffBrowserZoom({ ...api, name: 'POA editor' });
          await page.setViewportSize({ width: 1440, height: 1000 });
        }
        await save();
        const id = await detail();
        await goto(`/powers-of-attorney/${id}/edit?q=TEST&page=2`);
        assert.equal(await field(t.poa.copies).inputValue(), '0');
        assert.equal(await field(t.poa.report).inputValue(), 'false');
        await field(t.fields.notes).fill('TEST ONLY cancel');
        await page.getByRole('link', { name: t.poa.cancel, exact: true }).last().click();
        await detail();
        await goto(`/powers-of-attorney/${id}/edit?q=TEST&page=2`);
        assert.equal(
          await field(t.fields.notes).inputValue(),
          'TEST ONLY\n  complete second line  ',
        );
        const picker = field(t.poa.selectLawyer),
          option = await picker.locator('option').nth(1).getAttribute('value');
        await picker.selectOption(option);
        await page.getByRole('button', { name: t.poa.addLawyer, exact: true }).click();
        await save();
        await detail();
        await goto(`/powers-of-attorney/${id}/edit`);
        await page
          .getByRole('button', { name: new RegExp(t.poa.removeLawyer) })
          .first()
          .click();
        await save();
        await detail();
        const actor = (await lifecycleSessions(runtime)).find(
          (s) => s.user.role === account.roleCode,
        );
        await goto(`/powers-of-attorney/${id}/edit`);
        await field(t.fields.notes).fill('TEST ONLY preserved stale draft');
        const fresh = await readPoaMutation(actor, 'update', id, runtime);
        await mutatePoa(
          actor,
          'update',
          {
            operation: 'update',
            id,
            version: fresh.record.version,
            submission: randomUUID(),
            values: { notes: 'TEST ONLY competing edit' },
            lawyers: null,
            facts: null,
          },
          { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
        );
        await save();
        await page.locator('main [role=alert]').waitFor();
        assert.equal(await field(t.fields.notes).inputValue(), 'TEST ONLY preserved stale draft');
        assert.equal(
          await page.locator('main [role=alert]').evaluate((el) => el === document.activeElement),
          true,
        );
        await screenshot('stale-' + account.roleCode.replaceAll(' ', '-'));
        if (account.roleCode === 'Litigation Assistant') {
          for (const op of ['archive', 'restore']) {
            await goto(`/powers-of-attorney/${id}/${op}`);
            assert.equal(await page.locator('main form').count(), 0);
          }
          continue;
        }
        await goto(`/powers-of-attorney/${id}/archive?q=TEST&page=2`);
        await audit('POA archive confirmation');
        await screenshot('archive-confirmation');
        assert.equal(
          await page
            .getByRole('heading', { name: t.poa.confirmTitle })
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await page.keyboard.press('Escape');
        await page.waitForURL(base + `/powers-of-attorney/${id}?q=TEST&page=2#poa-lifecycle`);
        await goto(`/powers-of-attorney/${id}/archive`);
        await page.getByRole('button', { name: t.poa.confirm, exact: true }).click();
        await detail();
        assert.equal((await readPoaMutation(actor, 'restore', id, runtime)).record.archived, true);
        await goto(`/powers-of-attorney/${id}/restore`);
        await page.getByRole('button', { name: t.poa.confirm, exact: true }).click();
        await detail();
        assert.equal((await readPoaMutation(actor, 'update', id, runtime)).record.archived, false);
        await page.setViewportSize({ width: 320, height: 900 });
        await audit('POA detail 320px');
        await screenshot('detail-320');
        await page.setViewportSize({ width: 1440, height: 1000 });
        const backLink = page.getByRole('link', { name: t.poa.back, exact: true }).first();
        for (let tab = 0; tab < 30; tab++) {
          await page.keyboard.press('Tab');
          if (await backLink.evaluate((el) => el === document.activeElement)) break;
        }
        assert.equal(await backLink.evaluate((el) => el === document.activeElement), true);
        await staffFocusProof(page);
      }
      evidence.push({
        name: 'Both writer roles create/edit/current lawyer add and retire; stale drafts retained; Administrator archive/restore; keyboard Escape; real 320px and zoom',
      });
      await provePoaFilterNavigation(api, output);
    },
    { preserveAccounts: true },
  );
}
