import assert from 'node:assert/strict';
import { t } from '../src/strings.ts';
import { proveHearingBrowser } from './test-hearing-browser.mjs';
import { proveStaffBrowserZoom } from './lib/staff-accessibility-browser.mjs';

export async function proveDocumentsFeeLettersBrowser(fixture, output) {
  return proveHearingBrowser(fixture, output, async (api) => {
    const { page, context, accounts, login, goto, audit, screenshot, evidence, runtime } = api;
    const zoomWorker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    let postCount = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST') postCount += 1;
    });
    const field = (label) => page.getByLabel(label, { exact: true });
    const save = (label) => page.getByRole('button', { name: label, exact: true }).click();
    const waitPath = (path) => page.waitForURL((url) => url.pathname === path);
    const clickAndReload = async (button, message) => {
      const before = postCount;
      const responses = [];
      const observe = async (response) => {
        if (response.request().method() === 'POST') {
          responses.push({
            status: response.status(),
            body: (await response.text().catch(() => '')).slice(0, 4000),
            request: (response.request().postData() ?? '').slice(0, 4000),
          });
        }
      };
      page.on('response', observe);
      const navigation = page.waitForNavigation({ waitUntil: 'networkidle' });
      try {
        for (let attempt = 0; attempt < 3 && postCount === before; attempt++) {
          await button.click();
          for (let poll = 0; poll < 20 && postCount === before; poll++)
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.ok(postCount > before, message + ' issued a native POST after hydration');
        await navigation;
      } catch (error) {
        await audit({ name: message + ' failed response diagnostic', responses });
        throw error;
      } finally {
        page.off('response', observe);
      }
    };
    const order = ['Administrator', 'Litigation Assistant', 'Lawyer', 'Paralegal'];
    const validity = (control) =>
      control.evaluate((element) => ({
        value: element.value,
        valid: element.validity.valid,
        badInput: element.validity.badInput,
        underflow: element.validity.rangeUnderflow,
        overflow: element.validity.rangeOverflow,
      }));
    const filterProof = async ({ path, searchLabel, clearLabel, names, defaults }) => {
      await goto(path);
      const values = () =>
        page
          .locator('form[data-filter-form] [name]')
          .evaluateAll((controls) =>
            Object.fromEntries(controls.map((control) => [control.name, control.value])),
          );
      const cards = async () =>
        (await page.locator('main article').allTextContents()).map((text) =>
          text.replace(/\r\n?/gu, '\n'),
        );
      const baseline = await cards();
      assert.deepEqual(await values(), defaults);
      await field(searchLabel).fill('UNSUBMITTED TEST ONLY');
      const clear = page.getByRole('link', { name: clearLabel, exact: true });
      const popupPromise = page.context().waitForEvent('page');
      await clear.click({ modifiers: ['Control'] });
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded');
      await popup.close();
      assert.equal(await field(searchLabel).inputValue(), 'UNSUBMITTED TEST ONLY');
      await clear.click();
      assert.deepEqual(await values(), defaults, 'same-URL Clear resets every draft control');
      await clear.click();
      assert.deepEqual(await values(), defaults, 'repeated Clear remains reset');
      assert.deepEqual(
        await cards(),
        baseline,
        'same-URL Clear preserves complete default results',
      );
      await field(searchLabel).fill('أحمد');
      await page.getByRole('button', { name: t.common.search, exact: true }).click();
      await page.waitForURL((url) => url.pathname === path && url.searchParams.get('q') === 'أحمد');
      assert.equal((await values()).q, 'أحمد');
      await page.getByRole('link', { name: clearLabel, exact: true }).click();
      await page.waitForURL((url) => url.pathname === path && !url.search);
      assert.deepEqual(await values(), defaults);
      assert.deepEqual(
        await cards(),
        baseline,
        'navigated Clear restores complete default results',
      );
      await page.goBack({ waitUntil: 'networkidle' });
      assert.equal((await values()).q, 'أحمد');
      await page.goForward({ waitUntil: 'networkidle' });
      assert.deepEqual(await values(), defaults);
      evidence.push({
        name: `${names} applied/draft/repeated Clear/history/modified-link controls`,
        baselineRows: baseline.length,
      });
    };
    const importedReference = (
      await runtime.$queryRawUnsafe(`SELECT r.matter_id "matterId",r.fee_letter_id "feeLetterId",
          r.legacy_reference_raw "rawReference"
        FROM matter_fee_letter_references r
        JOIN matters m ON m.id=r.matter_id AND NOT m.is_archived
        JOIN fee_letters f ON f.id=r.fee_letter_id AND NOT f.is_archived
        LEFT JOIN clients c ON c.id=f.client_id
        WHERE r.legacy_source_record_key IS NOT NULL AND NOT r.is_retired
          AND NOT coalesce(c.is_archived,false) AND r.legacy_reference_raw IS NOT NULL
        ORDER BY r.id LIMIT 1`)
    )[0];
    assert.ok(importedReference, 'active imported matter-side reference evidence');
    const alternateFeeLetters = await runtime.$queryRawUnsafe(
      `SELECT f.id FROM fee_letters f LEFT JOIN clients c ON c.id=f.client_id
       WHERE f.id<>$1 AND NOT f.is_archived AND NOT coalesce(c.is_archived,false)
       ORDER BY f.id DESC LIMIT 2`,
      importedReference.feeLetterId,
    );
    assert.equal(alternateFeeLetters.length, 2, 'two active replacement controls');
    const fact = (label) =>
      page.locator('dt').filter({ hasText: label }).locator('xpath=following-sibling::dd[1]');
    const originalMatterEvidence = async () =>
      assert.ok(
        (await fact(t.feeLettersModule.originalMatterReference).textContent())?.includes(
          String(importedReference.rawReference),
        ),
        'matter view retains the original raw reference',
      );
    const reverseHistoryEvidence = () =>
      page
        .locator('h3')
        .filter({ hasText: t.feeLettersModule.referencingHistory })
        .locator('xpath=following-sibling::ul[1]')
        .getByText(String(importedReference.rawReference), { exact: false })
        .first();
    let documentId;
    let feeLetterId;
    let matterId;
    for (const account of [...accounts].sort(
      (left, right) => order.indexOf(left.roleCode) - order.indexOf(right.roleCode),
    )) {
      await login(account);
      await filterProof({
        path: '/documents',
        searchLabel: t.documentsModule.search,
        clearLabel: t.documentsModule.clear,
        names: account.roleCode + ' documents',
        defaults: {
          q: '',
          client: 'all',
          matter: 'all',
          person: 'all',
          archive: 'current',
          mfiles: 'all',
        },
      });
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
      await filterProof({
        path: '/fee-letters',
        searchLabel: t.feeLettersModule.search,
        clearLabel: t.feeLettersModule.clear,
        names: account.roleCode + ' fee letters',
        defaults: {
          q: '',
          client: 'all',
          covered: 'all',
          referencing: 'all',
          archive: 'current',
          mfiles: 'all',
        },
      });
      await audit(account.roleCode + ' fee-letter list');

      await goto(`/fee-letters/${importedReference.feeLetterId}`);
      await page.getByText(t.feeLettersModule.referencingHistory, { exact: true }).waitFor();
      await reverseHistoryEvidence().waitFor();
      await goto(`/matters/${importedReference.matterId}`);
      await page.getByText(t.feeLettersModule.currentMatterReference, { exact: true }).waitFor();
      await page.getByText(t.feeLettersModule.originalMatterReference, { exact: true }).waitFor();
      await originalMatterEvidence();

      if (account.roleCode === 'Administrator') {
        await goto(`/fee-letters/matter/${importedReference.matterId}`);
        await field(t.feeLettersModule.chooseFeeLetter).selectOption(
          String(alternateFeeLetters[0].id),
        );
        await fact(t.feeLettersModule.referenceFrom).waitFor();
        await fact(t.feeLettersModule.referenceTo).waitFor();
        await save(t.feeLettersModule.save);
        await waitPath(`/matters/${importedReference.matterId}`);
        await originalMatterEvidence();
        await goto(`/fee-letters/${importedReference.feeLetterId}`);
        await reverseHistoryEvidence().waitFor();

        await goto(`/fee-letters/matter/${importedReference.matterId}`);
        await field(t.feeLettersModule.chooseFeeLetter).selectOption('');
        await save(t.feeLettersModule.save);
        await waitPath(`/matters/${importedReference.matterId}`);
        assert.equal(
          (await fact(t.feeLettersModule.currentMatterReference).textContent())?.trim(),
          t.feeLettersModule.unknown,
          'clearing keeps current matter-side reference empty',
        );
        await originalMatterEvidence();

        await goto(`/fee-letters/matter/${importedReference.matterId}`);
        await field(t.feeLettersModule.chooseFeeLetter).selectOption(
          String(alternateFeeLetters[1].id),
        );
        await save(t.feeLettersModule.save);
        await waitPath(`/matters/${importedReference.matterId}`);
        await originalMatterEvidence();
        evidence.push({
          name: 'imported matter-side replace/clear/set retains original evidence',
          matterId: importedReference.matterId,
          originalFeeLetterId: importedReference.feeLetterId,
          finalFeeLetterId: alternateFeeLetters[1].id,
        });
      }

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
      await field(t.documentsModule.pageCount).fill('1');
      await field(t.documentsModule.pageCount).press('End');
      await field(t.documentsModule.pageCount).press('e');
      const incompleteNumber = await validity(field(t.documentsModule.pageCount));
      assert.equal(incompleteNumber.badInput, true);
      const postsBeforeInvalidNumber = postCount;
      await save(t.documentsModule.save);
      assert.equal(
        postCount,
        postsBeforeInvalidNumber,
        'unfinished native number is not submitted',
      );
      await field(t.documentsModule.pageCount).fill('0');
      assert.equal((await validity(field(t.documentsModule.pageCount))).valid, true);
      await field(t.documentsModule.documentDate).fill('2024-02-29');
      await field(t.documentsModule.depositDate).fill('0001-01-01');
      if (account.roleCode === 'Administrator') {
        await screenshot('document-editor-desktop');
        await page.setViewportSize({ width: 320, height: 900 });
        await audit('document editor 320 CSS pixels');
        await screenshot('document-editor-320');
        await proveStaffBrowserZoom({ ...api, worker: zoomWorker, name: 'document editor' });
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
      await field(t.feeLettersModule.date).press('ArrowLeft');
      await field(t.feeLettersModule.date).press('Backspace');
      const incompleteDate = await validity(field(t.feeLettersModule.date));
      assert.equal(incompleteDate.badInput, true);
      const postsBeforeInvalidDate = postCount;
      await save(t.feeLettersModule.save);
      assert.equal(postCount, postsBeforeInvalidDate, 'unfinished native date is not submitted');
      await field(t.feeLettersModule.date).fill('2024-02-29');
      assert.equal((await validity(field(t.feeLettersModule.date))).valid, true);
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
      if (account.roleCode === 'Administrator') {
        const beforeCovered = await runtime.$queryRawUnsafe(
          'SELECT count(*)::integer n FROM fee_letter_matters WHERE fee_letter_id=$1 AND matter_id=$2',
          feeLetterId,
          matterId,
        );
        let dropped = false;
        let droppedBody = '';
        const currentUrl = page.url();
        const intercept = async (route) => {
          if (!dropped && route.request().method() === 'POST') {
            dropped = true;
            droppedBody = route.request().postData() ?? '';
            await route.fetch();
            await route.abort('failed');
          } else await route.continue();
        };
        await page.route(currentUrl, intercept);
        await page
          .getByRole('button', { name: t.feeLettersModule.addCovered, exact: true })
          .click();
        await page.locator('main [role=alert]').waitFor();
        assert.equal(dropped, true);
        assert.equal(await field(t.feeLettersModule.chooseMatter).isDisabled(), true);
        assert.equal(
          (
            await runtime.$queryRawUnsafe(
              'SELECT count(*)::integer n FROM fee_letter_matters WHERE fee_letter_id=$1 AND matter_id=$2',
              feeLetterId,
              matterId,
            )
          )[0].n,
          beforeCovered[0].n + 1,
        );
        await page.unroute(currentUrl, intercept);
        let retryBody = '';
        const captureRetry = async (route) => {
          if (!retryBody && route.request().method() === 'POST')
            retryBody = route.request().postData() ?? '';
          await route.continue();
        };
        await page.route(currentUrl, captureRetry);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle' }),
          page.getByRole('button', { name: t.feeLettersModule.retry, exact: true }).click(),
        ]);
        await page.unroute(currentUrl, captureRetry);
        const submission = /submission\\?"\s*:\s*\\?"([a-f0-9-]{36})/u;
        assert.equal(
          droppedBody.match(submission)?.[1],
          retryBody.match(submission)?.[1],
          'covered-matter UI retry retains the exact submission UUID',
        );
      } else {
        await page
          .getByRole('button', { name: t.feeLettersModule.addCovered, exact: true })
          .click();
        await page
          .getByRole('button', { name: t.feeLettersModule.retireCovered, exact: true })
          .first()
          .waitFor();
      }
      await clickAndReload(
        page.getByRole('button', { name: t.feeLettersModule.retireCovered, exact: true }).first(),
        'covered-matter retirement',
      );
      await page
        .getByRole('button', { name: t.feeLettersModule.restoreCovered, exact: true })
        .first()
        .waitFor();
      await clickAndReload(
        page.getByRole('button', { name: t.feeLettersModule.restoreCovered, exact: true }).first(),
        'covered-matter restoration',
      );
      await page
        .getByRole('button', { name: t.feeLettersModule.retireCovered, exact: true })
        .first()
        .waitFor();
      await goto(`/fee-letters/matter/${matterId}`);
      await field(t.feeLettersModule.chooseFeeLetter).selectOption(String(feeLetterId));
      if (account.roleCode === 'Administrator') {
        let dropped = false;
        const currentUrl = page.url();
        const intercept = async (route) => {
          if (!dropped && route.request().method() === 'POST') {
            dropped = true;
            await route.fetch();
            await route.abort('failed');
          } else await route.continue();
        };
        await page.route(currentUrl, intercept);
        await save(t.feeLettersModule.save);
        await page.locator('main [role=alert]').waitFor();
        assert.equal(dropped, true);
        assert.equal(await field(t.feeLettersModule.chooseFeeLetter).isDisabled(), true);
        await page.unroute(currentUrl, intercept);
        await save(t.feeLettersModule.retry);
        await waitPath(`/matters/${matterId}`);
      } else {
        await save(t.feeLettersModule.save);
        await waitPath(`/matters/${matterId}`);
      }
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
        await goto(
          `/documents?archive=all&q=${encodeURIComponent('TEST ONLY browser Administrator')}`,
        );
        assert.equal(
          await page.locator('main article').count(),
          1,
          'restored document remains in all-record results',
        );
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
