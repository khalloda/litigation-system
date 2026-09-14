import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { t } from '../src/strings.ts';
import { proveHearingBrowser } from './test-hearing-browser.mjs';
import { proveStaffBrowserZoom } from './lib/staff-accessibility-browser.mjs';
import { lifecycleSessions } from './lib/matter-lifecycle-proof.ts';
import { mutateAdminWork, readAdminMutation } from '../src/lib/admin-work-mutations.ts';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata.ts';

export async function proveAdminEditingBrowser(fixture, output, originalId) {
  return proveHearingBrowser(
    fixture,
    output,
    async (api) => {
      const { page, accounts, login, goto, audit, screenshot, evidence, runtime } = api;
      const save = () => page.getByRole('button', { name: t.common.save, exact: true }).click();
      const field = (label) => page.getByLabel(label, { exact: true });
      const detail = async () => {
        await page.waitForURL(/\/admin-works\/\d+(?:\?|$)/u);
        await page.waitForLoadState('networkidle');
        return Number(new URL(page.url()).pathname.split('/').at(-1));
      };
      for (const account of accounts) {
        await login(account);
        await goto('/admin-works');
        await audit(account.roleCode + ' administrative list');
        await goto('/admin-works/' + originalId);
        assert.ok(await page.getByRole('heading', { level: 1 }).count());
        if (account.roleCode === 'Lawyer') {
          assert.equal(
            await page.getByRole('link', { name: t.adminWorks.manage.edit, exact: true }).count(),
            0,
          );
          for (const path of [
            '/new',
            `/${originalId}/edit`,
            `/${originalId}/steps/new`,
            `/${originalId}/steps/1/edit`,
          ]) {
            await goto('/admin-works' + path);
            assert.equal(await page.locator('main form').count(), 0, 'Lawyer editor denied');
          }
          evidence.push({ name: 'Lawyer reads and four direct editor denials' });
          continue;
        }
        await goto('/admin-works/new');
        await save();
        await page.locator('main form').getByRole('alert').waitFor();
        assert.equal(
          await page
            .locator('main form')
            .getByRole('alert')
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await field(t.nav.matters).selectOption('none');
        await page.getByRole('checkbox').check();
        await field(t.adminWorks.requiredWork).fill(
          'TEST ONLY browser ' + account.roleCode + '\nأحمد ١٤٠ق',
        );
        await field(t.adminWorks.lastFollowup).fill('TEST ONLY\n  second line  ');
        if (account.roleCode === 'Administrator') {
          await audit('task editor labelled validation');
          await screenshot('task-editor');
          await page.setViewportSize({ width: 320, height: 900 });
          await audit('task editor 320px');
          await screenshot('task-editor-320');
          await proveStaffBrowserZoom({ ...api, name: 'task editor' });
          await page.setViewportSize({ width: 1440, height: 1000 });
        }
        await save();
        const id = await detail();
        const query = '?q=TEST&page=1&stepPage=1';
        await goto('/admin-works/' + id + '/edit' + query);
        assert.equal(
          await field(t.adminWorks.lastFollowup).inputValue(),
          'TEST ONLY\n  second line  ',
        );
        const cancel = await page
          .getByRole('link', { name: t.common.cancel, exact: true })
          .getAttribute('href');
        assert.ok(cancel.includes('q=TEST'));
        await field(t.adminWorks.result).fill('TEST ONLY cancelled');
        await page.getByRole('link', { name: t.common.cancel, exact: true }).click();
        assert.equal((await runtime.adminTask.findUniqueOrThrow({ where: { id } })).result, null);
        await goto('/admin-works/' + id + '/edit' + query);
        await field(t.adminWorks.result).fill('TEST ONLY edited');
        await save();
        await detail();
        assert.ok(new URL(page.url()).searchParams.get('q') === 'TEST');
        await goto('/admin-works/' + id + '/steps/new');
        await save();
        await page.locator('main form').getByRole('alert').waitFor();
        await field(t.adminWorks.report).fill('TEST ONLY browser step\nأحمد');
        if (account.roleCode === 'Administrator') {
          await audit('step editor validation');
          await screenshot('step-editor');
          await page.setViewportSize({ width: 320, height: 900 });
          await audit('step editor 320px');
          await screenshot('step-editor-320');
          await proveStaffBrowserZoom({ ...api, name: 'step editor' });
          await page.setViewportSize({ width: 1440, height: 1000 });
        }
        await save();
        await detail();
        const step = await runtime.taskAction.findFirstOrThrow({ where: { taskId: id } });
        await goto(`/admin-works/${id}/steps/${step.id}/edit`);
        await field(t.adminWorks.report).fill('TEST ONLY cancelled step');
        await page.getByRole('link', { name: t.common.cancel, exact: true }).click();
        assert.equal(
          (await runtime.taskAction.findUniqueOrThrow({ where: { id: step.id } })).report,
          step.report,
        );
        await goto(`/admin-works/${id}/steps/${step.id}/edit`);
        await field(t.adminWorks.result).fill('TEST ONLY edited step');
        await save();
        await detail();
        assert.equal(
          (await runtime.taskAction.findUniqueOrThrow({ where: { id: step.id } })).result,
          'TEST ONLY edited step',
        );
        if (account.roleCode === 'Administrator') {
          const actor = (await lifecycleSessions(runtime)).find(
            (s) => s.user.role === 'Administrator',
          );
          await goto('/admin-works/' + id + '/edit');
          await field(t.adminWorks.result).fill('TEST ONLY preserved conflict draft');
          const state = await readAdminMutation(actor, 'task-update', id, null, runtime);
          await mutateAdminWork(
            actor,
            'task-update',
            {
              operation: 'task-update',
              task_id: id,
              step_id: null,
              version: state.task.version,
              submission: randomUUID(),
              values: { result: 'TEST ONLY concurrent winner' },
            },
            { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
          );
          await save();
          await page.locator('main form').getByRole('alert').waitFor();
          assert.ok(
            (await page.locator('main form').getByRole('alert').innerText()).includes(
              t.adminWorks.manage.errors.stale,
            ),
          );
          assert.equal(
            await field(t.adminWorks.result).inputValue(),
            'TEST ONLY preserved conflict draft',
          );
          await audit('task conflict draft and focused error');
          await screenshot('task-conflict');
          await goto(`/admin-works/${id}/steps/${step.id}/edit`);
          await field(t.adminWorks.report).fill('TEST ONLY preserved step conflict');
          const state2 = await readAdminMutation(actor, 'task-update', id, null, runtime);
          await mutateAdminWork(
            actor,
            'task-update',
            {
              operation: 'task-update',
              task_id: id,
              step_id: null,
              version: state2.task.version,
              submission: randomUUID(),
              values: { alert: 'TEST ONLY step conflict winner' },
            },
            { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
          );
          await save();
          await page.locator('main form').getByRole('alert').waitFor();
          assert.ok(
            (await page.locator('main form').getByRole('alert').innerText()).includes(
              t.adminWorks.manage.errors.stale,
            ),
          );
          assert.equal(
            await field(t.adminWorks.report).inputValue(),
            'TEST ONLY preserved step conflict',
          );
          await screenshot('step-conflict');
          await goto('/admin-works/new');
          await field(t.nav.matters).selectOption('none');
          await page.getByRole('checkbox').check();
          await field(t.adminWorks.requiredWork).fill('TEST ONLY lost response browser');
          const before = await runtime.adminTask.count();
          let dropped = false;
          const intercept = async (route) => {
            if (!dropped && route.request().method() === 'POST') {
              dropped = true;
              await route.fetch();
              await route.abort('failed');
            } else await route.continue();
          };
          await page.route('**/admin-works/new', intercept);
          await save();
          await page.locator('main form').getByRole('alert').waitFor();
          assert.equal(dropped, true);
          assert.equal(await runtime.adminTask.count(), before + 1);
          assert.equal(await field(t.adminWorks.requiredWork).isDisabled(), true);
          await page.unroute('**/admin-works/new', intercept);
          await page.getByRole('button', { name: t.adminWorks.manage.retry, exact: true }).click();
          await detail();
          assert.equal(await runtime.adminTask.count(), before + 1);
          evidence.push({
            name: 'Lost committed response: exact retry, one native task, frozen draft',
          });
        }
        evidence.push({
          name: account.roleCode + ' task/step create and edit, cancel and return context',
        });
      }
      // Keyboard focus is programmatically visible and the controls remain reachable.
      await login(accounts.find((a) => a.roleCode === 'Administrator'));
      await goto('/admin-works/new');
      await field(t.nav.matters).focus();
      await page.keyboard.press('Tab');
      assert.equal(
        await field(t.adminWorks.requiredWork).evaluate((el) => el === document.activeElement),
        true,
      );
      const focus = await field(t.adminWorks.requiredWork).evaluate((el) => ({
        outline: getComputedStyle(el).outlineStyle,
        width: getComputedStyle(el).outlineWidth,
      }));
      assert.notEqual(focus.outline, 'none');
      assert.notEqual(focus.width, '0px');
      evidence.push({ name: 'Keyboard traversal and visible focus', focus });
      await screenshot('task-keyboard-focus');
    },
    { preserveAccounts: true, boundedDependencyCheck: true },
  );
}
