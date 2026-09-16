import assert from 'node:assert/strict';
import { t } from '../src/strings.ts';
import { proveHearingBrowser } from './test-hearing-browser.mjs';
import { proveStaffBrowserZoom } from './lib/staff-accessibility-browser.mjs';

export async function proveDocumentsFeeLettersBrowser(fixture, output) {
  return proveHearingBrowser(fixture, output, async (api) => {
    const { page, accounts, login, goto, audit, screenshot, evidence } = api;
    const field = (label) => page.getByLabel(label, { exact: true });
    const save = (label) => page.getByRole('button', { name: label, exact: true }).click();
    const waitPath = (path) => page.waitForURL((url) => url.pathname === path);
    const order = ['Administrator', 'Litigation Assistant', 'Lawyer', 'Paralegal'];
    let documentId;
    let feeLetterId;
    let matterId;
    for (const account of [...accounts].sort(
      (left, right) => order.indexOf(left.roleCode) - order.indexOf(right.roleCode),
    )) {
      await login(account);
      await goto('/documents');
      await audit(account.roleCode + ' documents list');
      await field(t.documentsModule.search).fill('أحمد ١٤٠ق');
      await page.getByRole('button', { name: t.common.search, exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get('q') === 'أحمد ١٤٠ق');
      await page.getByRole('link', { name: t.documentsModule.clear, exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/documents' && !url.search);
      await page.goBack({ waitUntil: 'networkidle' });
      assert.equal(new URL(page.url()).searchParams.get('q'), 'أحمد ١٤٠ق');
      await page.goForward({ waitUntil: 'networkidle' });
      assert.equal(new URL(page.url()).search, '');
      await goto('/fee-letters');
      await audit(account.roleCode + ' fee-letter list');

      const writer = ['Administrator', 'Litigation Assistant'].includes(account.roleCode);
      if (!writer) {
        for (const route of ['/documents/new', '/fee-letters/new']) {
          await goto(route);
          assert.equal(await page.locator('main form').count(), 0);
        }
        evidence.push({ name: account.roleCode + ' direct create routes denied' });
        continue;
      }

      await goto('/documents/new');
      await field(t.documentsModule.description).fill(
        'TEST ONLY browser ' + account.roleCode + '\nأحمد ١٤٠ق',
      );
      await field(t.documentsModule.pageCount).fill('-1');
      await save(t.documentsModule.save);
      await page.locator('main [role=alert]').waitFor();
      assert.equal(await field(t.documentsModule.pageCount).inputValue(), '-1');
      assert.equal(
        await page
          .locator('main [role=alert]')
          .evaluate((element) => element === document.activeElement),
        true,
      );
      await field(t.documentsModule.pageCount).fill('0');
      await field(t.documentsModule.documentDate).fill('2024-02-29');
      await field(t.documentsModule.depositDate).fill('0001-01-01');
      if (account.roleCode === 'Administrator') {
        await screenshot('document-editor-desktop');
        await page.setViewportSize({ width: 320, height: 900 });
        await audit('document editor 320 CSS pixels');
        await screenshot('document-editor-320');
        await proveStaffBrowserZoom({ ...api, name: 'document editor' });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await save(t.documentsModule.save);
      await page.waitForURL(/\/documents\/\d+(?:\?|$)/u);
      documentId = Number(new URL(page.url()).pathname.split('/').at(-1));
      await goto(`/documents/${documentId}/edit`);
      await field(t.fields.notes).fill('TEST ONLY\nsecond line');
      await page.keyboard.press('Escape');
      await waitPath(`/documents/${documentId}`);
      await goto(`/documents/${documentId}/edit`);
      assert.equal(await field(t.fields.notes).inputValue(), '');
      await field(t.fields.notes).fill('TEST ONLY\nsecond line');
      await save(t.documentsModule.save);
      await waitPath(`/documents/${documentId}`);

      await goto('/fee-letters/new');
      const clientOption = await field(t.feeLettersModule.client)
        .locator('option')
        .nth(1)
        .getAttribute('value');
      assert.ok(clientOption);
      await field(t.feeLettersModule.client).selectOption(clientOption);
      await field(t.feeLettersModule.type).fill('TEST ONLY ' + account.roleCode);
      await field(t.feeLettersModule.date).fill('10000-01-01');
      await save(t.feeLettersModule.save);
      await page.locator('main [role=alert]').waitFor();
      assert.equal(await field(t.feeLettersModule.date).inputValue(), '10000-01-01');
      await field(t.feeLettersModule.date).fill('2024-02-29');
      await field(t.feeLettersModule.detailsField).fill('TEST ONLY\nmultiline details');
      await save(t.feeLettersModule.save);
      await page.waitForURL(/\/fee-letters\/\d+(?:\?|$)/u);
      feeLetterId = Number(new URL(page.url()).pathname.split('/').at(-1));

      await goto(`/fee-letters/${feeLetterId}/covered`);
      const matterOption = await field(t.feeLettersModule.chooseMatter)
        .locator('option')
        .nth(1)
        .getAttribute('value');
      assert.ok(matterOption);
      matterId = Number(matterOption);
      await field(t.feeLettersModule.chooseMatter).selectOption(matterOption);
      await page.getByRole('button', { name: t.feeLettersModule.addCovered, exact: true }).click();
      await page.waitForLoadState('networkidle');
      await page
        .getByRole('button', { name: t.feeLettersModule.retireCovered, exact: true })
        .first()
        .click();
      await page.waitForLoadState('networkidle');
      await page
        .getByRole('button', { name: t.feeLettersModule.restoreCovered, exact: true })
        .first()
        .click();
      await page.waitForLoadState('networkidle');
      await goto(`/fee-letters/matter/${matterId}`);
      await field(t.feeLettersModule.chooseFeeLetter).selectOption(String(feeLetterId));
      await save(t.feeLettersModule.save);
      await waitPath(`/matters/${matterId}`);
      await goto(`/fee-letters/matter/${matterId}`);
      await field(t.feeLettersModule.chooseFeeLetter).selectOption('');
      await save(t.feeLettersModule.save);
      await waitPath(`/matters/${matterId}`);

      if (account.roleCode === 'Administrator') {
        await goto(`/documents/${documentId}/archive`);
        assert.equal(
          await page.locator('h2').evaluate((element) => element === document.activeElement),
          true,
        );
        await save(t.documentsModule.save);
        await waitPath(`/documents/${documentId}`);
        await goto(`/documents/${documentId}/restore`);
        await save(t.documentsModule.save);
        await waitPath(`/documents/${documentId}`);
        await goto(`/fee-letters/${feeLetterId}/archive`);
        await save(t.feeLettersModule.save);
        await waitPath(`/fee-letters/${feeLetterId}`);
        await goto(`/fee-letters/${feeLetterId}/restore`);
        await save(t.feeLettersModule.save);
        await waitPath(`/fee-letters/${feeLetterId}`);
        await screenshot('fee-letter-detail-restored');
      } else {
        for (const route of [
          `/documents/${documentId}/archive`,
          `/documents/${documentId}/restore`,
          `/fee-letters/${feeLetterId}/archive`,
          `/fee-letters/${feeLetterId}/restore`,
        ]) {
          await goto(route);
          assert.equal(await page.locator('main form').count(), 0);
        }
      }
      evidence.push({
        name: account.roleCode + ' document and fee-letter browser mutations',
        documentId,
        feeLetterId,
        matterId,
      });
    }
    assert.ok(documentId && feeLetterId && matterId);
  });
}
