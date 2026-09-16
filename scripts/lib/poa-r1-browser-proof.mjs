import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../../src/strings.ts';
import { POA_FIELDS } from '../../src/lib/poa-mutation-input.ts';
import { mutatePoa, readPoaMutation } from '../../src/lib/poa-mutations.ts';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata.ts';
import { lifecycleSessions } from './matter-lifecycle-proof.ts';
import { adminEditState } from './admin-edit-state.ts';
import { proveStaffBrowserZoom, staffFocusProof } from './staff-accessibility-browser.mjs';

export async function provePoaR1Recovery(api, output, requests) {
  const { page, runtime, inspect, accounts, login, goto, screenshot, audit, evidence } = api;
  const results = [];
  const record = (name, facts = {}) => {
    results.push({ name, ...facts });
    writeFileSync(join(output, 'r1-recovery-results.json'), JSON.stringify(results, null, 2));
  };
  const field = (label) => page.getByLabel(label, { exact: true });
  const save = () => page.getByRole('button', { name: t.poa.save, exact: true }).click();
  const state = () => inspect(adminEditState);
  const validity = (control) =>
    control.evaluate((el) => ({
      value: el.value,
      valid: el.validity.valid,
      badInput: el.validity.badInput,
      underflow: el.validity.rangeUnderflow,
      overflow: el.validity.rangeOverflow,
      stepMismatch: el.validity.stepMismatch,
    }));
  const detail = async () => {
    await page.waitForURL(/\/powers-of-attorney\/\d+(?:\?|$)/u);
    await page.waitForLoadState('networkidle');
    return Number(new URL(page.url()).pathname.split('/').at(-1));
  };
  const payload = (request) =>
    JSON.parse(request.body.split(/\r?\n/u).find((line) => line.startsWith('{"operation":')));
  for (const account of accounts.filter((a) =>
    ['Administrator', 'Litigation Assistant'].includes(a.roleCode),
  )) {
    await login(account);
    const actor = (await lifecycleSessions(runtime)).find((s) => s.user.role === account.roleCode);
    const run = (operation, id, version, values) =>
      mutatePoa(
        actor,
        operation,
        {
          operation,
          id,
          version,
          submission: randomUUID(),
          values,
          lawyers: operation === 'create' ? [] : null,
          facts: null,
        },
        { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
      );
    let retainedId;
    for (const operation of ['create', 'update']) {
      let id =
        operation === 'update'
          ? (
              await run('create', null, null, {
                principal_name: 'TEST ONLY R1 update boundaries',
                copies_count: 2,
                issue_date: '2026-09-15',
              })
            ).id
          : null;
      const open = async () => {
        await goto(
          operation === 'create' ? '/powers-of-attorney/new' : `/powers-of-attorney/${id}/edit`,
        );
        if (operation === 'create')
          await field(t.poa.principal).fill('TEST ONLY R1 create boundaries');
      };
      await open();
      const unchanged = await state(),
        noRequests = requests.length;
      for (const count of ['-1', '1.5', '2147483648']) {
        await field(t.poa.copies).fill(count);
        const before = await validity(field(t.poa.copies));
        assert.equal(before.valid, false);
        await save();
        await page.locator('main [role=alert]').waitFor();
        assert.deepEqual(await validity(field(t.poa.copies)), before);
        assert.equal(await field(t.poa.copies).getAttribute('aria-invalid'), 'true');
        assert.equal(requests.length, noRequests);
        record(`${account.roleCode} ${operation} rejected count`, { count, validity: before });
      }
      await field(t.poa.copies).fill('1');
      await field(t.poa.copies).press('End');
      await field(t.poa.copies).press('e');
      assert.equal((await validity(field(t.poa.copies))).badInput, true);
      await save();
      assert.equal(requests.length, noRequests);
      record(`${account.roleCode} ${operation} rejected unfinished exponent`);
      await field(t.poa.copies).fill('2');
      await field(t.poa.issueDate).fill('10000-01-01');
      const outside = await validity(field(t.poa.issueDate));
      assert.equal(outside.overflow, true);
      await save();
      assert.equal(requests.length, noRequests);
      assert.deepEqual(await validity(field(t.poa.issueDate)), outside);
      record(`${account.roleCode} ${operation} rejected year above9999`, { validity: outside });
      await field(t.poa.issueDate).fill('2026-02-28');
      // Chromium's date segments retain focus after fill. Move to the first
      // segment using native keys, then enter the nonexistent 31 February.
      await field(t.poa.issueDate).press('ArrowLeft');
      await field(t.poa.issueDate).press('ArrowLeft');
      await field(t.poa.issueDate).press('3');
      await field(t.poa.issueDate).press('1');
      const calendar = await validity(field(t.poa.issueDate));
      assert.notEqual(calendar.value, '2026-02-31');
      record(
        `${account.roleCode} ${operation} native segment constraint observation, not an invalid-draft reproduction`,
        {
          validity: calendar,
        },
      );
      for (const invalidDate of ['2026-02-31', '0000-01-01', 'not-a-date']) {
        await field(t.poa.issueDate).fill('2026-02-28');
        let forwarded;
        const malformedRequest = async (route) => {
          if (route.request().method() === 'POST') {
            const body = route.request().postData();
            assert.ok(body.includes('"issue_date":"2026-02-28"'));
            forwarded = body.replace(
              '"issue_date":"2026-02-28"',
              '"issue_date":"' + invalidDate + '"',
            );
            await route.continue({ postData: forwarded });
          } else await route.continue();
        };
        await page.route('**/powers-of-attorney/**', malformedRequest);
        await Promise.all([
          page.waitForResponse(
            (response) =>
              response.request().method() === 'POST' &&
              new URL(response.url()).pathname.startsWith('/powers-of-attorney'),
          ),
          save(),
        ]);
        await page.getByText(t.poa.errors.invalid, { exact: true }).waitFor();
        await page.unroute('**/powers-of-attorney/**', malformedRequest);
        assert.ok(forwarded);
        assert.equal(await field(t.poa.issueDate).inputValue(), '2026-02-28');
        record(
          `${account.roleCode} ${operation} malformed calendar payload refused by real action (explicit network substitution)`,
          { invalidDate, forwardedPayload: payload({ body: forwarded }) },
        );
      }
      assert.equal(requests.length, noRequests + 3);
      const afterInvalid = await state();
      assert.deepEqual(
        afterInvalid,
        unchanged,
        'Entire invalid group preserves all tables, catalog and sequences',
      );
      record(`${account.roleCode} ${operation} invalid group full-state proof`, {
        before: unchanged,
        after: afterInvalid,
      });
      await audit(`${account.roleCode} ${operation} invalid form`);
      await screenshot(`invalid-${account.roleCode.replaceAll(' ', '-')}-${operation}`);
      if (account.roleCode === 'Administrator' && operation === 'create') {
        await page.setViewportSize({ width: 320, height: 900 });
        await audit('R1 invalid editor320');
        await screenshot('r1-invalid-editor320');
        await page.setViewportSize({ width: 1440, height: 1000 });
        await proveStaffBrowserZoom({ ...api, name: 'R1 invalid editor' });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.keyboard.press('Tab');
        await staffFocusProof(page);
      }
      await Promise.all([
        page.waitForURL(
          (url) =>
            url.pathname ===
            (operation === 'create' ? '/powers-of-attorney' : `/powers-of-attorney/${id}`),
        ),
        page.keyboard.press('Escape'),
      ]);
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('main form input[type=number]').count(), 0);
      assert.deepEqual(await state(), unchanged, 'Escape preserves complete state');
      await open();
      await field(t.poa.copies).fill('2');
      await field(t.poa.copies).press('ControlOrMeta+A');
      await field(t.poa.copies).press('-');
      await page.getByRole('link', { name: t.poa.cancel, exact: true }).last().click();
      await page.waitForLoadState('networkidle');
      assert.deepEqual(await state(), unchanged, 'Cancel preserves complete state');
      record(
        `${account.roleCode} ${operation} all invalid cases, Cancel and Escape have zero complete-state changes`,
      );

      for (const [copies, date] of [
        [null, null],
        [0, '0001-01-01'],
        [3, '2024-02-29'],
        [2147483647, '9999-12-31'],
      ]) {
        await open();
        const old =
          operation === 'update' ? await readPoaMutation(actor, 'update', id, runtime) : null;
        await field(t.poa.copies).fill(copies === null ? '' : String(copies));
        await field(t.poa.issueDate).fill(date ?? '');
        assert.equal((await validity(field(t.poa.copies))).valid, true);
        assert.equal((await validity(field(t.poa.issueDate))).valid, true);
        await save();
        const saved = await detail();
        const current = await readPoaMutation(actor, 'update', saved, runtime);
        const expected = old
          ? { ...old.record.values, copies_count: copies, issue_date: date }
          : {
              ...Object.fromEntries(POA_FIELDS.map((key) => [key, null])),
              principal_name: 'TEST ONLY R1 create boundaries',
              copies_count: copies,
              issue_date: date,
            };
        assert.deepEqual(current.record.values, expected, 'Only intended maintained fields change');
        assert.deepEqual(current.lawyers, old?.lawyers ?? []);
        assert.equal(current.record.sourceClient, old?.record.sourceClient ?? null);
        assert.equal(current.record.sourceLawyers, old?.record.sourceLawyers ?? null);
        assert.equal(current.record.version, old ? String(BigInt(old.record.version) + 1n) : '1');
        const request = payload(requests.at(-1));
        const receipt = await inspect(
          async (db) =>
            (
              await db.query(
                'SELECT actor_id,request_payload,poa_id,result_version::text FROM _migration.poa_edit_submission WHERE submission_id=$1',
                [request.submission],
              )
            ).rows,
        );
        assert.equal(receipt.length, 1);
        assert.deepEqual(receipt[0].request_payload, request);
        assert.equal(receipt[0].poa_id, saved);
        assert.equal(receipt[0].result_version, current.record.version);
        const history = await inspect(
          async (db) =>
            (
              await db.query(
                'SELECT actor_id,request_id,after_values FROM _migration.poa_edit_change WHERE poa_id=$1 AND version=$2',
                [saved, current.record.version],
              )
            ).rows,
        );
        assert.equal(history.length, 1);
        assert.equal(history[0].actor_id, receipt[0].actor_id);
        record(`${account.roleCode} ${operation} deliberate blank or valid boundaries saved`, {
          id: saved,
          copies,
          date,
          version: current.record.version,
          submission: request.submission,
          auditRequest: history[0].request_id,
        });
        retainedId = saved;
      }
    }

    await goto(`/powers-of-attorney/${retainedId}/edit`);
    await field(t.poa.copies).fill('7');
    await field(t.poa.issueDate).fill('2026-09-16');
    let lost = false;
    const dropCommittedResponse = async (route) => {
      if (route.request().method() === 'POST' && !lost) {
        lost = true;
        const response = await route.fetch();
        assert.ok(response.ok());
        await route.abort('failed');
      } else await route.continue();
    };
    await page.route('**/powers-of-attorney/**', dropCommittedResponse);
    await save();
    await page.getByRole('button', { name: t.poa.retry, exact: true }).waitFor();
    await page.unroute('**/powers-of-attorney/**', dropCommittedResponse);
    assert.equal(lost, true);
    const originalRequest = payload(requests.at(-1));
    assert.equal(await field(t.poa.copies).isDisabled(), true);
    const committed = await readPoaMutation(actor, 'update', retainedId, runtime);
    assert.equal(committed.record.values.copies_count, 7);
    await run('update', retainedId, committed.record.version, { copies_count: 8 });
    const beforeRetry = await state();
    await page.getByRole('button', { name: t.poa.retry, exact: true }).click();
    await detail();
    assert.deepEqual(
      payload(requests.at(-1)),
      originalRequest,
      'Retry uses exact original payload/token',
    );
    assert.deepEqual(
      await state(),
      beforeRetry,
      'Committed retry after later change makes no writes',
    );
    assert.equal(
      (await readPoaMutation(actor, 'update', retainedId, runtime)).record.values.copies_count,
      8,
    );
    record(
      `${account.roleCode} lost response after commit: exact retry preserves later count8 and complete state`,
    );

    await goto(`/powers-of-attorney/${retainedId}/edit`);
    await field(t.poa.copies).fill('9');
    await field(t.poa.issueDate).fill('2024-02-29');
    const fresh = await readPoaMutation(actor, 'update', retainedId, runtime);
    await run('update', retainedId, fresh.record.version, { notes: 'TEST ONLY R1 competing edit' });
    const beforeStale = await state();
    await save();
    await page.getByText(t.poa.errors.stale, { exact: true }).waitFor();
    assert.equal(await field(t.poa.copies).inputValue(), '9');
    assert.equal(await field(t.poa.issueDate).inputValue(), '2024-02-29');
    assert.deepEqual(await state(), beforeStale);
    record(`${account.roleCode} stale error preserves raw number/date draft and complete state`);

    const imported = (
      await runtime.$queryRawUnsafe(
        'SELECT p.id FROM powers_of_attorney p LEFT JOIN clients c ON c.id=p.client_id WHERE p.client_name IS NOT NULL AND NOT p.is_archived AND (p.client_id IS NULL OR NOT c.is_archived) ORDER BY p.id LIMIT 1',
      )
    )[0];
    const source = await readPoaMutation(actor, 'update', imported.id, runtime);
    const beforeSource = await state();
    await goto(`/powers-of-attorney/${imported.id}/edit`);
    assert.equal(
      await field(t.poa.currentClient).inputValue(),
      String(source.record.values.client_id ?? ''),
    );
    assert.equal(
      await page
        .locator('dt')
        .filter({ hasText: new RegExp('^' + t.poa.sourceClient + '$') })
        .locator('..')
        .locator('dd')
        .textContent(),
      source.record.sourceClient,
    );
    await page.getByRole('link', { name: t.poa.cancel, exact: true }).last().click();
    await detail();
    assert.deepEqual(await state(), beforeSource);
    record(`${account.roleCode} imported current/source labels and Cancel remain unchanged`);
  }
  evidence.push({
    name: 'R1 focused invalid/valid boundary, draft, Cancel/Escape, stale, lost-response retry and accessibility proof',
    resultFile: 'r1-recovery-results.json',
    cases: results.length,
  });
}
