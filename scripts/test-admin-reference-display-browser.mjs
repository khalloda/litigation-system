import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { proveHearingBrowser } from './test-hearing-browser.mjs';
import { lifecycleSessions } from './lib/matter-lifecycle-proof.ts';
import { mutateAdminWork, readAdminMutation } from '../src/lib/admin-work-mutations.ts';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata.ts';
import { adminEditState } from './lib/admin-edit-state.ts';
import { setFixtureStaffActive } from './lib/staff-roster-test-adapter.ts';
import { proveStaffBrowserZoom, staffFocusProof } from './lib/staff-accessibility-browser.mjs';
import { t } from '../src/strings.ts';

export async function proveAdminReferenceDisplay(fixture, output, red) {
  return proveHearingBrowser(
    fixture,
    output,
    async (api) => {
      const { page, inspect, runtime, accounts, login, goto, evidence, audit, screenshot } = api;
      const sessions = await lifecycleSessions(runtime),
        writers = sessions.filter((s) => s.user.role !== 'Lawyer'),
        admin = writers.find((s) => s.user.role === 'Administrator');
      const state = () => inspect((db) => adminEditState(db));
      const save = async (actor, id, values, stepId = null) => {
        const current = await readAdminMutation(actor, 'task-update', id, null, runtime);
        return mutateAdminWork(
          actor,
          stepId ? 'step-update' : 'task-update',
          {
            operation: stepId ? 'step-update' : 'task-update',
            task_id: id,
            step_id: stepId,
            version: current.task.version,
            submission: randomUUID(),
            values,
          },
          { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
        );
      };
      const subjects = await inspect(
        async (db) =>
          (
            await db.query(`SELECT a.id,s.id step_id,length(a.legacy_assignee_raw)+length(a.legacy_destination_raw)+length(s.legacy_performed_by_raw) raw_length
      FROM admin_tasks a LEFT JOIN matters m ON m.id=a.matter_id
      JOIN LATERAL (SELECT id,legacy_performed_by_raw FROM task_actions WHERE task_id=a.id AND length(legacy_performed_by_raw)>0 ORDER BY source_ordinal NULLS LAST,id LIMIT 1) s ON true
      WHERE a.legacy_id IS NOT NULL AND length(a.legacy_assignee_raw)>0 AND length(a.legacy_destination_raw)>0 AND NOT coalesce(m.is_archived,false)
      ORDER BY raw_length DESC,a.id LIMIT 3`)
          ).rows,
      );
      assert.equal(
        subjects.length,
        3,
        'Three imported tasks with all three retained raw references',
      );
      const facts = async (id) =>
        inspect(
          async (db) =>
            (
              await db.query(
                `SELECT to_jsonb(a) task,(SELECT jsonb_agg(to_jsonb(s) ORDER BY source_ordinal NULLS LAST,id) FROM task_actions s WHERE s.task_id=a.id) steps FROM admin_tasks a WHERE id=$1`,
                [id],
              )
            ).rows[0],
        );
      const provenance = (f) => ({
        task: Object.fromEntries(
          Object.entries(f.task).filter(
            ([k]) =>
              /^(legacy_|source_)/u.test(k) ||
              ['id', 'matter_id', 'court_id', 'created_at', 'created_by'].includes(k),
          ),
        ),
        steps: f.steps.map((s) =>
          Object.fromEntries(
            Object.entries(s).filter(
              ([k]) =>
                /^(legacy_|source_)/u.test(k) ||
                [
                  'id',
                  'task_id',
                  'current_order',
                  'next_appointment',
                  'created_at',
                  'created_by',
                ].includes(k),
            ),
          ),
        ),
      });
      const originals = [];
      for (let i = 0; i < subjects.length; i++) {
        const subject = subjects[i],
          actor = writers[i];
        const original = await facts(subject.id);
        originals.push(provenance(original));
        const options = await readAdminMutation(actor, 'task-update', subject.id, null, runtime);
        const person = options.people.find((p) => p.active),
          destination = options.destinations.find((d) => d.active);
        assert.ok(person && destination);
        // Establish known current references through the unchanged gateway, then deliberately clear.
        await save(actor, subject.id, {
          assigned_to_person_id: person.id,
          destination_id: destination.id,
        });
        await save(actor, subject.id, { performed_by_person_id: person.id }, subject.step_id);
        await save(actor, subject.id, { assigned_to_person_id: null, destination_id: null });
        await save(actor, subject.id, { performed_by_person_id: null }, subject.step_id);
        const after = await facts(subject.id);
        assert.equal(after.task.assigned_to_person_id, null);
        assert.equal(after.task.destination_id, null);
        assert.equal(
          after.steps.find((s) => s.id === subject.step_id).performed_by_person_id,
          null,
        );
        assert.deepEqual(provenance(after), originals[i]);
        subject.rawAssignee = original.task.legacy_assignee_raw;
        subject.rawDestination = original.task.legacy_destination_raw;
        subject.rawPerformer = original.steps.find(
          (s) => s.id === subject.step_id,
        ).legacy_performed_by_raw;
        subject.writer = actor.user.role;
      }
      writeFileSync(
        join(output, 'selected-subjects.json'),
        JSON.stringify(
          {
            selection:
              'Three imported tasks with nonempty assignee/destination and a first imported step with nonempty performer, unarchived parent; longest combined original text first, then ID. Native NULL provenance cannot expose fallback.',
            subjects,
            provenanceSha256: originals.map((p) =>
              createHash('sha256').update(JSON.stringify(p)).digest('hex'),
            ),
          },
          null,
          2,
        ),
      );
      const value = async (scope, label) =>
        scope
          .locator('dt')
          .filter({
            hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') + '$', 'u'),
          })
          .locator('..')
          .locator('dd')
          .textContent();
      const currentLabel = t.adminWorks.person,
        sourceLabel = currentLabel + ' — ' + t.adminWorks.sourceText,
        destinationSource = t.fields.destination + ' — ' + t.adminWorks.sourceText;
      const details = () => page.getByRole('region', { name: t.adminWorks.details, exact: true });
      const checks = [];
      const check = async (name, actual, expected) => {
        checks.push({ name, actual, expected, pass: actual === expected });
        if (!red) assert.equal(actual, expected, name);
      };
      const first = subjects[0];
      for (const account of red
        ? [accounts.find((a) => a.roleCode === 'Administrator')]
        : accounts) {
        await login(account);
        const beforeReads = await state();
        for (const subject of red ? [first] : subjects) {
          await goto(`/admin-works?q=${subject.id}&person=missing`);
          const card = page.locator(`[data-admin-id="${subject.id}"]`);
          assert.equal(
            await card.count(),
            1,
            'Current missing-person filter includes cleared imported task',
          );
          await check(
            account.roleCode + ' list assignee ' + subject.id,
            await value(card, currentLabel),
            t.common.notRecorded,
          );
          if (!red) assert.equal(await value(card, sourceLabel), subject.rawAssignee);
          await card
            .getByRole('link', { name: t.adminWorks.identity(subject.id), exact: true })
            .click();
          await page.waitForURL(/\/admin-works\/\d+/u);
          assert.equal(new URL(page.url()).searchParams.get('person'), 'missing');
          await check(
            account.roleCode + ' detail assignee ' + subject.id,
            await value(details(), currentLabel),
            t.common.notRecorded,
          );
          await check(
            account.roleCode + ' detail destination ' + subject.id,
            await value(details(), t.fields.destination),
            t.common.notRecorded,
          );
          const step = page.locator(`[data-step-id="${subject.step_id}"]`);
          await check(
            account.roleCode + ' step performer ' + subject.id,
            await value(step, currentLabel),
            t.common.notRecorded,
          );
          if (!red) {
            assert.equal(await value(details(), sourceLabel), subject.rawAssignee);
            assert.equal(await value(details(), destinationSource), subject.rawDestination);
            assert.equal(await value(step, sourceLabel), subject.rawPerformer);
            if (account.roleCode === 'Lawyer') {
              for (const name of [
                t.adminWorks.manage.edit,
                t.adminWorks.manage.editStep,
                t.adminWorks.manage.createStep,
              ])
                assert.equal(await page.getByRole('link', { name, exact: true }).count(), 0);
            } else {
              await page.getByRole('link', { name: t.adminWorks.manage.edit, exact: true }).click();
              await page.locator('main form').waitFor();
              assert.equal(await page.getByLabel(currentLabel, { exact: true }).inputValue(), '');
              assert.equal(
                await page.getByLabel(t.fields.destination, { exact: true }).inputValue(),
                '',
              );
              await page.getByRole('link', { name: t.common.cancel, exact: true }).click();
              await page
                .locator(`[data-step-id="${subject.step_id}"]`)
                .getByRole('link', { name: t.adminWorks.manage.editStep, exact: true })
                .click();
              await page.locator('main form').waitFor();
              assert.equal(await page.getByLabel(currentLabel, { exact: true }).inputValue(), '');
              await page.getByRole('link', { name: t.common.cancel, exact: true }).click();
              assert.equal(new URL(page.url()).searchParams.get('person'), 'missing');
            }
            await page.getByRole('link', { name: t.adminWorks.back, exact: true }).click();
            assert.equal(new URL(page.url()).searchParams.get('q'), String(subject.id));
            assert.equal(new URL(page.url()).searchParams.get('person'), 'missing');
          }
        }
        if (!red && account.roleCode === 'Lawyer')
          for (const path of [
            '/new',
            `/${first.id}/edit`,
            `/${first.id}/steps/new`,
            `/${first.id}/steps/${first.step_id}/edit`,
          ]) {
            await goto('/admin-works' + path);
            assert.equal(await page.locator('main form').count(), 0);
          }
        assert.deepEqual(
          await state(),
          beforeReads,
          'Read/edit/cancel navigation adds no business/audit/history/receipt/sequence state',
        );
      }
      writeFileSync(join(output, 'current-display-results.json'), JSON.stringify(checks, null, 2));
      if (red) {
        assert.equal(checks.length, 4);
        assert.equal(checks.filter((c) => !c.pass).length, 4);
        await screenshot('uncorrected-cleared-import');
        evidence.push({
          name: 'EXPECTED RED: all four current-field assertions fail after proven NULL clears with unchanged source',
          checks,
        });
        return;
      }
      await login(accounts.find((a) => a.roleCode === 'Administrator'));
      const options = await readAdminMutation(admin, 'task-update', first.id, null, runtime);
      const person = options.people.find(
          (p) => p.active && !accounts.some((a) => a.personId === p.id),
        ),
        destination = options.destinations.find((d) => d.active);
      assert.ok(person && destination);
      await save(admin, first.id, {
        assigned_to_person_id: person.id,
        destination_id: destination.id,
      });
      await save(admin, first.id, { performed_by_person_id: person.id }, first.step_id);
      await goto('/admin-works/' + first.id);
      assert.equal(await value(details(), currentLabel), person.name);
      assert.equal(await value(details(), t.fields.destination), destination.name);
      assert.equal(
        await value(page.locator(`[data-step-id="${first.step_id}"]`), currentLabel),
        person.name,
      );
      await setFixtureStaffActive(runtime, Number(admin.user.id), person.id, false);
      try {
        await goto('/admin-works/' + first.id);
        assert.equal(await value(details(), currentLabel), person.name);
        assert.equal(
          await value(page.locator(`[data-step-id="${first.step_id}"]`), currentLabel),
          person.name,
        );
        assert.ok(await page.getByText(t.matters.former, { exact: true }).count());
        await page.getByRole('link', { name: t.adminWorks.manage.edit, exact: true }).click();
        assert.equal(
          await page.getByLabel(currentLabel, { exact: true }).inputValue(),
          String(person.id),
        );
        await page.getByRole('link', { name: t.common.cancel, exact: true }).click();
        const before = await state();
        assert.equal((await save(admin, first.id, {})).changed, false);
        assert.deepEqual(await state(), before);
        await save(admin, first.id, { alert: 'TEST ONLY P2-R1 unrelated edit' });
        await goto('/admin-works/' + first.id);
        assert.equal(await value(details(), currentLabel), person.name);
        assert.equal(await value(details(), sourceLabel), first.rawAssignee);
      } finally {
        await setFixtureStaffActive(runtime, Number(admin.user.id), person.id, true);
      }
      const unresolved = await inspect(
        async (db) =>
          (
            await db.query(
              `SELECT id,legacy_assignee_raw raw FROM admin_tasks WHERE assigned_to_person_id IS NULL AND length(legacy_assignee_raw)>0 AND id<>ALL($1::integer[]) ORDER BY id LIMIT 1`,
              [subjects.map((s) => s.id)],
            )
          ).rows[0],
      );
      assert.ok(unresolved, 'Existing unresolved imported assignee required');
      await goto('/admin-works/' + unresolved.id);
      assert.equal(await value(details(), currentLabel), t.common.notRecorded);
      assert.equal(await value(details(), sourceLabel), unresolved.raw);
      const native = await mutateAdminWork(
        admin,
        'task-create',
        {
          operation: 'task-create',
          task_id: null,
          step_id: null,
          version: null,
          submission: randomUUID(),
          values: {
            matter_id: null,
            task_created_date: null,
            required_work: 'TEST ONLY P2-R1 native NULL',
          },
        },
        { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
      );
      await goto('/admin-works/' + native.id);
      assert.equal(await value(details(), currentLabel), t.common.notRecorded);
      assert.equal(await value(details(), t.fields.destination), t.common.notRecorded);
      assert.equal(await details().getByText(sourceLabel, { exact: true }).count(), 0);
      const nativeState = await readAdminMutation(admin, 'task-update', native.id, null, runtime);
      const nativeStep = await mutateAdminWork(
        admin,
        'step-create',
        {
          operation: 'step-create',
          task_id: native.id,
          step_id: null,
          version: nativeState.task.version,
          submission: randomUUID(),
          values: { result: 'TEST ONLY P2-R1 native step NULL' },
        },
        { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
      );
      await goto('/admin-works/' + native.id);
      const nativeStepCard = page.locator(`[data-step-id="${nativeStep.stepId}"]`);
      assert.equal(await value(nativeStepCard, currentLabel), t.common.notRecorded);
      assert.equal(await nativeStepCard.getByText(sourceLabel, { exact: true }).count(), 0);
      for (let i = 0; i < subjects.length; i++)
        assert.deepEqual(provenance(await facts(subjects[i].id)), originals[i]);
      evidence.push({
        name: 'Replacement, inactive retained reference, unrelated edit, exact no-op, unresolved imported and native NULL controls; source/parent/ordinal preservation',
        unresolvedId: unresolved.id,
        nativeId: native.id,
      });
      for (const [name, path] of [
        ['list', `/admin-works?q=${first.id}`],
        ['detail', '/admin-works/' + first.id],
      ]) {
        const before = await state();
        await goto(path);
        await page.locator('main a').first().focus();
        await page.keyboard.press('Tab');
        const focus = await staffFocusProof(page);
        evidence.push({
          name: 'Current/source ' + name + ' keyboard traversal and visible focus',
          focus,
        });
        await audit('source labels ' + name);
        await screenshot('source-' + name);
        await page.setViewportSize({ width: 320, height: 900 });
        await audit('source labels ' + name + ' 320');
        await screenshot('source-' + name + '-320');
        await proveStaffBrowserZoom({ ...api, name: 'source ' + name });
        await page.setViewportSize({ width: 1440, height: 1000 });
        assert.deepEqual(await state(), before, 'Layout reads have no database side effects');
      }
      const paged = await inspect(
        async (db) =>
          (
            await db.query(
              'SELECT task_id id,count(*)::integer count FROM task_actions GROUP BY task_id HAVING count(*)>25 ORDER BY count(*) DESC,task_id LIMIT 1',
            )
          ).rows[0],
      );
      assert.ok(paged);
      await goto(`/admin-works/${paged.id}?q=${paged.id}&stepPage=2`);
      await page.getByRole('link', { name: t.adminWorks.manage.edit, exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get('stepPage'), '2');
      await page.getByRole('link', { name: t.common.cancel, exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get('stepPage'), '2');
      const expectedIds = await inspect(async (db) =>
        (
          await db.query(
            'SELECT id FROM task_actions WHERE task_id=$1 ORDER BY (current_order IS NOT NULL),source_ordinal NULLS LAST,current_order,id LIMIT 25 OFFSET 25',
            [paged.id],
          )
        ).rows.map((r) => r.id),
      );
      assert.deepEqual(
        await page
          .locator('[data-step-id]')
          .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.stepId))),
        expectedIds,
      );
      evidence.push({
        name: 'Step pagination and edit/cancel query context preserved',
        taskId: paged.id,
        stepPage: 2,
        expectedIds,
      });
    },
    { preserveAccounts: true, boundedDependencyCheck: true },
  );
}
