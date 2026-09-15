import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { proveAdminEditingBrowser } from './test-admin-work-editing-browser.mjs';
import { lifecycleSessions } from './lib/matter-lifecycle-proof.ts';
import { readAdminLifecycle, mutateAdminLifecycle } from '../src/lib/admin-lifecycle.ts';
import { mutateAdminWork, readAdminMutation } from '../src/lib/admin-work-mutations.ts';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata.ts';
import { adminEditState } from './lib/admin-edit-state.ts';
import { readAdminWork } from '../src/lib/admin-work-query.ts';
import { proveStaffBrowserZoom, staffFocusProof } from './lib/staff-accessibility-browser.mjs';
import { t } from '../src/strings.ts';

export async function proveAdminLifecycleBrowser(fixture, output, subjects) {
  const denied = [];
  await proveAdminEditingBrowser(fixture, output, subjects.id, async (api) => {
    const { page, context, accounts, login, goto, audit, screenshot, evidence, inspect, runtime } =
      api;
    const browserSession = await context.newCDPSession(page);
    const browserVersion = await browserSession.send('Browser.getVersion');
    await browserSession.detach();
    writeFileSync(
      join(output, 'browser-runtime.json'),
      JSON.stringify(
        {
          browserVersion,
          node: process.version,
          playwrightModule: process.env.STAFF_PLAYWRIGHT_MODULE,
          chromiumExecutable: process.env.STAFF_CHROMIUM_EXECUTABLE,
        },
        null,
        2,
      ),
    );
    const sessions = await lifecycleSessions(runtime),
      admin = sessions.find((s) => s.user.role === 'Administrator');
    const state = () => inspect(adminEditState),
      captions = [];
    const capture = async (name, caption) => {
      await screenshot(name);
      captions.push({
        name: name + '.png',
        caption,
        url: page.url(),
        viewport: page.viewportSize(),
        role: 'Administrator',
        subjects,
      });
      writeFileSync(join(output, 'screenshot-captions.json'), JSON.stringify(captions, null, 2));
    };
    const transition = async (operation, id, stepId = null) => {
      const s = await readAdminLifecycle(admin, operation, id, stepId, runtime);
      return mutateAdminLifecycle(
        admin,
        operation,
        {
          task_id: id,
          step_id: stepId,
          version: s.version,
          operation,
          submission: randomUUID(),
          confirmation: stepId ?? id,
          facts: s.facts,
        },
        { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
      );
    };
    const { id, step, nativeId } = subjects;
    const captured = [];
    const captureRequest = (request) => {
      if (request.method() === 'POST' && request.headers()['next-action'])
        captured.push({
          url: request.url(),
          headers: {
            'next-action': request.headers()['next-action'],
            'content-type': request.headers()['content-type'],
            origin: new URL(request.url()).origin,
          },
          data: request.postDataBuffer(),
        });
    };
    page.on('request', captureRequest);
    const parentId = (await readAdminLifecycle(admin, 'task-archive', id, null, runtime)).facts
      .matterId;
    const fromMatter = '/matters/' + parentId + '?archive=all';
    const query =
      '?' +
      new URLSearchParams({
        archive: 'all',
        q: String(id),
        status: 'all',
        matter: String(parentId),
        page: '3',
        stepArchive: 'all',
        stepPage: '2',
        fromMatter,
      });
    const detail = '/admin-works/' + id + query;
    const paths = [
      ['archive', 'task-archive', t.adminWorks.lifecycle.archive],
      ['restore', 'task-restore', t.adminWorks.lifecycle.restore],
      ['steps/' + step + '/archive', 'step-archive', t.adminWorks.lifecycle.archiveStep],
      ['steps/' + step + '/restore', 'step-restore', t.adminWorks.lifecycle.restoreStep],
    ];
    for (const account of accounts) {
      await login(account);
      await goto(detail);
      assert.equal(await page.locator('main h1').count(), 1);
      assert.ok((await page.locator('main').innerText()).length > 100);
      if (account.roleCode !== 'Administrator') {
        for (const [path] of paths) {
          await goto('/admin-works/' + id + '/' + path + query);
          assert.equal(
            await page.getByRole('button', { name: t.clients.manage.confirm, exact: true }).count(),
            0,
          );
          assert.equal(await page.locator('dialog').count(), 0);
        }
        evidence.push({
          name: 'Non-Administrator direct lifecycle page refusal and retained reads',
          role: account.roleCode,
        });
      }
    }
    await login(accounts.find((a) => a.roleCode === 'Administrator'));
    const foreignBefore = await state();
    const foreign = await goto('/admin-works/' + nativeId + '/steps/' + step + '/archive');
    assert.ok([200, 404].includes(foreign.status()));
    assert.equal(await page.getByText(t.adminWorks.notFoundHint, { exact: true }).count(), 1);
    assert.equal(await page.locator('dialog').count(), 0);
    assert.deepEqual(await state(), foreignBefore);
    for (const [path, operation, label] of paths) {
      if (operation === 'task-restore') await transition('task-archive', id);
      if (operation === 'step-archive') await transition('task-restore', id);
      if (operation === 'step-restore') await transition('step-archive', id, step);
      const before = await state();
      await goto('/admin-works/' + id + '/' + path + query);
      await page.getByRole('button', { name: label, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.ok(await dialog.getByText(t.adminWorks.lifecycle.help, { exact: true }).count());
      assert.equal(
        await dialog
          .getByRole('button', { name: t.common.cancel, exact: true })
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await audit(operation + ' confirmation');
      await capture(
        'd63-' + operation + '-confirmation',
        label + ' with exact subject and total/current/archived step counts',
      );
      await page.keyboard.press('Escape');
      assert.equal(
        await page
          .getByRole('button', { name: label, exact: true })
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.getByRole('link', { name: t.common.cancel, exact: true }).click();
      await page.waitForURL((u) => u.pathname === '/admin-works/' + id);
      assert.equal(new URL(page.url()).searchParams.get('stepArchive'), 'all');
      assert.equal(new URL(page.url()).searchParams.get('stepPage'), '2');
      assert.equal(new URL(page.url()).searchParams.get('archive'), 'all');
      assert.equal(new URL(page.url()).searchParams.get('fromMatter'), fromMatter);
      assert.equal(new URL(page.url()).searchParams.get('matter'), String(parentId));
      assert.deepEqual(
        await state(),
        before,
        'Confirmation read and Cancel preserve every table and sequence',
      );
      await goto('/admin-works/' + id + '/' + path + query);
      await page.getByRole('button', { name: label, exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: t.clients.manage.confirm, exact: true })
        .click();
      await page.waitForURL((u) => u.pathname === '/admin-works/' + id);
      assert.equal(new URL(page.url()).searchParams.get('q'), String(id));
      const fresh = await readAdminLifecycle(
        admin,
        operation,
        id,
        operation.startsWith('step') ? step : null,
        runtime,
      );
      assert.equal(fresh.archived, operation.endsWith('archive'));
      evidence.push({
        name:
          operation + ' confirmation Cancel/focus and committed transition with filter round trip',
        id,
        step,
      });
    }
    page.off('request', captureRequest);
    assert.equal(captured.length, 4);
    const replayBefore = await state();
    for (const account of accounts.filter((a) => a.roleCode !== 'Administrator')) {
      await login(account);
      for (const request of captured) {
        const response = await context.request.post(request.url, {
          headers: request.headers,
          data: request.data,
          maxRedirects: 0,
        });
        const body = await response.text();
        const digest = body.match(/"digest"\s*:\s*"([^"]+)"/u)?.[1] ?? null;
        assert.ok(
          response.status() === 403 ||
            (response.headers()['x-action-redirect'] ?? '').includes('/forbidden') ||
            (response.status() === 500 && digest !== null),
        );
        denied.push({
          role: account.roleCode,
          path: new URL(request.url).pathname,
          status: response.status(),
          digest,
        });
      }
    }
    assert.deepEqual(await state(), replayBefore);
    await login(accounts.find((a) => a.roleCode === 'Administrator'));
    for (const request of captured) {
      const response = await context.request.post(request.url, {
        headers: request.headers,
        data: request.data,
        maxRedirects: 0,
      });
      assert.ok(response.ok());
    }
    assert.deepEqual(await state(), replayBefore);
    await goto(detail);
    assert.equal((await readAdminWork(admin, String(id), '1', runtime, 'all')).archived, false);
    assert.equal(
      await page.getByRole('link', { name: t.adminWorks.lifecycle.restore, exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByRole('link', { name: t.adminWorks.lifecycle.archive, exact: true }).count(),
      1,
    );
    evidence.push({
      name: 'All four captured lifecycle server actions: three-role direct denial; Administrator exact old receipt replay changes no table/sequence; request bytes retained only in memory',
      actions: 4,
      deniedReplays: 12,
    });
    await transition('task-restore', id);
    await transition('step-restore', id, step);
    const lastPage = await readAdminWork(admin, String(id), '999', runtime, 'current');
    assert.ok(lastPage.stepPages > 1 && lastPage.steps.length > 0);
    for (const last of lastPage.steps) await transition('step-archive', id, last.id);
    await goto('/admin-works/' + id + '?archive=all&stepPage=' + lastPage.stepPage);
    assert.ok(
      (await page.getByRole('status').allTextContents()).includes(
        t.adminWorks.lifecycle.pageClamped,
      ),
    );
    await capture(
      'd63-last-page-clamped',
      'Archiving the final visible page retains history and explains the clamped step page',
    );
    for (const last of lastPage.steps) await transition('step-restore', id, last.id);
    const sourceSubject = await inspect(
      async (db) =>
        (
          await db.query(
            "SELECT a.id,a.legacy_assignee_raw FROM admin_tasks a LEFT JOIN matters m ON m.id=a.matter_id WHERE a.legacy_assignee_raw IS NOT NULL AND btrim(a.legacy_assignee_raw)<>'' AND NOT a.is_archived AND NOT coalesce(m.is_archived,false) ORDER BY a.id LIMIT 1",
          )
        ).rows[0],
    );
    assert.ok(sourceSubject);
    const original = await readAdminMutation(admin, 'task-update', sourceSubject.id, null, runtime);
    await mutateAdminWork(
      admin,
      'task-update',
      {
        operation: 'task-update',
        task_id: sourceSubject.id,
        step_id: null,
        version: original.task.version,
        submission: randomUUID(),
        values: { assigned_to_person_id: null },
      },
      { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
    );
    await goto('/admin-works/' + sourceSubject.id + '?archive=all');
    assert.equal(
      await page
        .getByRole('region', { name: t.adminWorks.details, exact: true })
        .locator('dt')
        .filter({ hasText: new RegExp('^' + t.adminWorks.person + '$', 'u') })
        .locator('..')
        .locator('dd')
        .innerText(),
      t.common.notRecorded,
    );
    assert.equal(
      await page
        .getByRole('region', { name: t.adminWorks.details, exact: true })
        .locator('dt')
        .filter({ hasText: t.adminWorks.person + ' — ' + t.adminWorks.sourceText })
        .locator('..')
        .locator('dd')
        .textContent(),
      sourceSubject.legacy_assignee_raw,
    );
    await capture(
      'd63-current-source-labels',
      'Cleared current assignee is not recorded; original source remains separately labelled',
    );
    evidence.push({
      name: 'Real foreign-parent URL refused; current state shown after old receipts; last visible step page clamps; current and original labels remain distinct; fromMatter and work filters retained',
    });
    // Stale confirmation retains a deliberate reload, and stale editor retains text.
    await goto('/admin-works/' + nativeId + '/archive?archive=all&stepArchive=archived');
    await transition('task-archive', nativeId);
    await page.getByRole('button', { name: t.adminWorks.lifecycle.archive, exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: t.clients.manage.confirm, exact: true })
      .click();
    await page
      .getByRole('alert')
      .filter({ hasText: t.adminWorks.lifecycle.stale })
      .waitFor({ timeout: 60000 });
    await capture('d63-stale-confirmation', 'A changed confirmation requires deliberate reload');
    await transition('task-restore', nativeId);
    await goto('/admin-works/' + nativeId + '/edit?archive=all&stepArchive=archived');
    const resultField = page.getByLabel(t.adminWorks.result, { exact: true });
    await resultField.fill('TEST ONLY entered text retained after archive');
    await transition('task-archive', nativeId);
    await page.getByRole('button', { name: t.common.save, exact: true }).click();
    await page
      .getByRole('alert')
      .filter({ hasText: t.adminWorks.manage.errors.stale })
      .waitFor({ timeout: 60000 });
    assert.equal(await resultField.inputValue(), 'TEST ONLY entered text retained after archive');
    await transition('task-restore', nativeId);
    evidence.push({
      name: 'Stale confirmation and stale work editor retain safe recovery and entered text',
    });
    // Native steps still append after an archived maximum, and all history stays reachable.
    const snap = await readAdminMutation(admin, 'task-update', nativeId, null, runtime);
    const created = await mutateAdminWork(
      admin,
      'step-create',
      {
        operation: 'step-create',
        task_id: nativeId,
        step_id: null,
        version: snap.task.version,
        submission: randomUUID(),
        values: {
          result: 'TEST ONLY lifecycle browser step\nنتيجة العمل',
          report: 'TEST ONLY multiline\n'.repeat(12),
        },
      },
      { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
    );
    await transition('step-archive', nativeId, created.stepId);
    for (const filter of ['current', 'archived', 'all']) {
      await goto('/admin-works/' + nativeId + '?archive=all&stepArchive=' + filter);
      await audit('D63 ' + filter + ' step view');
      await capture(
        'd63-steps-' + filter,
        'Independent ' + filter + ' steps with truthful total counts',
      );
    }
    await transition('task-archive', nativeId);
    for (const filter of ['current', 'archived', 'all']) {
      await goto('/admin-works?archive=' + filter);
      await audit('D63 ' + filter + ' works');
      await capture('d63-works-' + filter, filter + ' administrative works');
    }
    await goto('/admin-works/' + nativeId + '?archive=all&stepArchive=all');
    assert.ok((await page.locator('main').innerText()).includes(t.adminWorks.lifecycle.archived));
    await audit('Archived work with independently archived step');
    await page.setViewportSize({ width: 320, height: 900 });
    await audit('Archived work mobile320');
    await capture('d63-mobile320', 'Archived work and independent steps at 320 CSS pixels');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await proveStaffBrowserZoom({
      context,
      page,
      audit,
      screenshot,
      evidence,
      name: 'd63-detail',
    });
    await page.locator('main a').first().focus();
    await page.keyboard.press('Tab');
    evidence.push({
      name: 'Lifecycle detail keyboard focus',
      proof: await staffFocusProof(page),
    });
  });
  const server = readFileSync(join(output, 'server.log'), 'utf8');
  const guards = [
    ...server.matchAll(
      /Error \[AuthorizationError\]: Access denied[\s\S]*?status: 403,[\s\S]*?reason: 'forbidden',[\s\S]*?digest: '([^']+)'/gu,
    ),
  ].map((m) => m[1]);
  for (const digest of new Set(denied.filter((r) => r.status === 500).map((r) => r.digest))) {
    assert.ok(
      guards.filter((d) => d === digest).length >=
        denied.filter((r) => r.status === 500 && r.digest === digest).length,
      'Each RSC500 digest must map to an observed server AuthorizationError with status403',
    );
  }
  assert.equal(denied.length, 12);
  writeFileSync(
    join(output, 'direct-action-refusals.json'),
    JSON.stringify(
      {
        denied,
        serverAuthorization403Digests: guards,
        matched: true,
        explanation:
          'Next.js wraps thrown server-action AuthorizationError(status403) as RSC HTTP500. Each such response digest is matched to the server refusal; generic500 is not accepted.',
      },
      null,
      2,
    ),
  );
}
