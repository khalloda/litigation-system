import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { t } from '../../src/strings.ts';
import { readMatterMutation, mutateMatter } from '../../src/lib/matter-mutations.ts';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata.ts';
import { staffReadOnlyState } from './staff-read-only-state.ts';
import { matterMigrationCatalog } from './matter-migration-delta.ts';
import { proveStaffBrowserZoom, staffFocusProof } from './staff-accessibility-browser.mjs';

// All synthetic native rows enter through the accepted gateway on the runner's
// positively identified disposable database. No imported row is modified.
export async function seedNullablePartyOrder(runtime) {
  const result = [];
  const accounts = await runtime.userAccount.findMany();
  for (const role of ['Administrator', 'Litigation Assistant']) {
    const matches = accounts.filter((a) => a.roleCode === role);
    assert.equal(matches.length, 1);
    const a = matches[0];
    const actor = {
      expires: new Date(Date.now() + 3600000).toISOString(),
      user: {
        id: String(a.id),
        personId: a.personId,
        username: a.username,
        name: 'TEST ONLY',
        role,
        sessionVersion: a.sessionVersion,
        mustChangePassword: false,
        auditSessionId: randomUUID(),
      },
    };
    const options = await readMatterMutation(actor, 'create', null, runtime);
    for (const [pattern, positions] of Object.entries({
      mixed: [1, null],
      allNull: [null, null],
      numbered: [3, 8],
      empty: [],
    })) {
      for (const operation of ['toOpponent', 'toClient', 'add']) {
        const destination = operation === 'toOpponent' ? 'opponent' : 'client';
        const parties = ['client', 'opponent'].flatMap((side) =>
          (side === destination ? positions : [4, null]).map((ordinal, i) => ({
            id: null,
            side,
            party_name: `TEST ONLY ${side} ${i}`,
            gender: 'f',
            ordinal,
            roles: [{ id: null, role_id: options.roles.find((r) => r.active).id, ordinal: null }],
          })),
        );
        const created = await mutateMatter(
          actor,
          'create',
          {
            id: null,
            version: null,
            submission: randomUUID(),
            values: { subject: `TEST ONLY nullable order ${role} ${pattern} ${operation}` },
            parties,
            lawyers: [
              {
                id: null,
                person_id: options.people.find((p) => p.active).id,
                role: 'lead',
                position: null,
              },
            ],
          },
          { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
        );
        result.push({ role, pattern, operation, destination, id: created.id });
      }
    }
  }
  return result;
}

export async function proveNullablePartyOrder(ctx, cases, original) {
  const { page, context, accounts, login, goto, audit, screenshot, evidence, inspect } = ctx;
  const save = async () => {
    await page.getByRole('button', { name: t.matters.manage.save, exact: true }).click();
    await page.getByRole('link', { name: t.matters.backMatter, exact: true }).waitFor();
  };
  const complete = async () => ({
    state: await inspect(staffReadOnlyState),
    catalog: await inspect(matterMigrationCatalog),
  });
  const names = () =>
    page
      .getByLabel(t.matters.manage.partyName, { exact: true })
      .evaluateAll((nodes) => nodes.map((n) => n.value));
  const party = (index) =>
    page
      .getByRole('group', { name: t.matters.parties, exact: true })
      .getByRole('group', { name: t.matters.manage.row(index + 1), exact: true });
  const button = (index, direction) =>
    party(index).getByRole('button', { name: t.matters.manage[direction], exact: true }).last();
  const rows = (id) =>
    inspect(
      async (db) =>
        (
          await db.query(
            `SELECT p.id,p.side,p.ordinal,p.party_name,p.gender,(SELECT jsonb_agg(jsonb_build_object('id',r.id,'role_id',r.role_id,'ordinal',r.ordinal) ORDER BY r.ordinal NULLS LAST,r.id) FROM matter_party_roles r WHERE r.party_id=p.id AND NOT r.is_retired) capacities FROM matter_parties p WHERE p.matter_id=$1 AND NOT p.is_retired ORDER BY p.side,p.ordinal NULLS LAST,p.id`,
            [id],
          )
        ).rows,
    );
  const detail = async (id, expected) => {
    await goto(`/matters/${id}`);
    assert.deepEqual(
      await page
        .locator('[data-party-id]')
        .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.partyId))),
      expected.map((p) => p.id),
    );
    await goto(`/matters/${id}/edit`);
    assert.deepEqual(
      await names(),
      expected.map((p) => p.party_name),
    );
  };
  for (const account of accounts.filter((a) =>
    ['Administrator', 'Litigation Assistant'].includes(a.roleCode),
  )) {
    await login(account);
    const own = cases.filter((c) => c.role === account.roleCode);
    // Reuse the established R1 full-state browser assertions, with nullable
    // party/capacity/lawyer positions. No broader gateway suite is invoked.
    if (!original) {
      const id = own.find((c) => c.pattern === 'mixed' && c.operation === 'add').id;
      for (const kind of ['unchanged', 'sameSide', 'lawyer', 'capacity']) {
        await goto(`/matters/${id}/edit`);
        const before = await complete();
        if (kind === 'sameSide') {
          const select = party(0).getByLabel(t.matters.manage.side, { exact: true });
          await select.selectOption(await select.inputValue());
        } else if (kind !== 'unchanged') {
          const select = page
            .getByLabel(kind === 'lawyer' ? t.matters.filters.lawyer : t.matters.manage.capacity, {
              exact: true,
            })
            .first();
          const first = await select.inputValue();
          const options = await select
            .locator('option')
            .evaluateAll((nodes) =>
              nodes.filter((n) => n.value && !n.disabled).map((n) => n.value),
            );
          await select.selectOption(options.find((v) => v !== first));
          await select.selectOption(first);
        }
        await save();
        const after = await complete();
        assert.deepEqual(after, before);
        evidence.push({ name: `${account.roleCode} ${kind} complete no-op`, before, after });
      }
      await goto(`/matters/${id}/edit`);
      const before = await rows(id);
      await page.getByLabel(t.fields.subject, { exact: true }).fill('TEST ONLY unrelated scalar');
      await save();
      assert.deepEqual(await rows(id), before);
      evidence.push({
        name: account.roleCode + ' unrelated scalar preserves all nullable relationships',
        before,
        after: await rows(id),
      });
    }
    for (const c of own.filter(
      (c) => !original || (c.pattern === 'mixed' && ['toOpponent', 'add'].includes(c.operation)),
    )) {
      await goto(`/matters/${c.id}/edit`);
      const before = await rows(c.id);
      assert.deepEqual(
        await names(),
        before.map((p) => p.party_name),
      );
      let appended;
      if (c.operation === 'add') {
        await page.getByRole('button', { name: t.matters.manage.addParty, exact: true }).click();
        const index = (await names()).indexOf('');
        assert.ok(index >= 0);
        await page
          .getByLabel(t.matters.manage.partyName, { exact: true })
          .nth(index)
          .fill('TEST ONLY added party');
        appended = {
          id: null,
          side: c.destination,
          ordinal: null,
          party_name: 'TEST ONLY added party',
          gender: null,
          capacities: null,
        };
      } else {
        const index = before.findIndex((p) => p.side !== c.destination);
        appended = { ...before[index], side: c.destination };
        await party(index)
          .getByLabel(t.matters.manage.side, { exact: true })
          .selectOption(c.destination);
      }
      const remaining = before.filter((p) => p.id !== appended.id);
      const destination = [...remaining.filter((p) => p.side === c.destination), appended].map(
        (p, i) => ({ ...p, ordinal: i + 1 }),
      );
      const expected = ['client', 'opponent'].flatMap((side) =>
        side === c.destination ? destination : remaining.filter((p) => p.side === side),
      );
      assert.deepEqual(
        await names(),
        expected.map((p) => p.party_name),
      );
      if (!original) {
        for (const side of ['client', 'opponent']) {
          const indexes = expected.map((p, i) => (p.side === side ? i : -1)).filter((i) => i >= 0);
          if (indexes.length) {
            assert.equal(await button(indexes[0], 'up').isDisabled(), true);
            assert.equal(await button(indexes.at(-1), 'down').isDisabled(), true);
          }
        }
        if (c.pattern === 'allNull' && c.operation === 'toClient') {
          // One explicit within-side keyboard move; the other side stays exact.
          await button(1, 'up').focus();
          await page.keyboard.press('Enter');
          [expected[0], expected[1]] = [expected[1], expected[0]];
          expected
            .filter((p) => p.side === c.destination)
            .forEach((p, i) => {
              p.ordinal = i + 1;
            });
          const draft = await names();
          assert.deepEqual(
            draft,
            expected.map((p) => p.party_name),
          );
          await page.getByLabel(t.matters.askedAmount, { exact: true }).fill('1e3');
          await page.getByRole('button', { name: t.matters.manage.save, exact: true }).click();
          await page.locator('main [role="alert"]').waitFor();
          assert.equal(
            await page
              .locator('main [role="alert"]')
              .evaluate((el) => el === document.activeElement),
            true,
          );
          assert.deepEqual(await names(), draft);
          assert.deepEqual(await rows(c.id), before);
          await page.getByLabel(t.matters.askedAmount, { exact: true }).fill('1.00');
          await page.keyboard.press('Tab');
          evidence.push({
            name: account.roleCode + ' validation draft and keyboard focus',
            proof: await staffFocusProof(page),
          });
          await audit(account.roleCode + ' nullable ordering desktop');
          await screenshot('nullable-' + account.roleCode + '-desktop');
          await page.setViewportSize({ width: 320, height: 900 });
          await audit(account.roleCode + ' nullable ordering 320');
          await screenshot('nullable-' + account.roleCode + '-320');
          await page.setViewportSize({ width: 1440, height: 1000 });
          await proveStaffBrowserZoom({
            context,
            page,
            audit,
            screenshot,
            evidence,
            name: 'nullable-' + account.roleCode,
          });
        }
      }
      await save();
      const saved = await rows(c.id);
      if (c.operation === 'add') {
        const added = saved.filter((p) => !before.some((b) => b.id === p.id));
        assert.equal(added.length, 1);
        expected.find((p) => p.id === null).id = added[0].id;
      }
      if (original) {
        let failedBefore;
        try {
          assert.deepEqual(
            saved.map((p) => p.id),
            expected.map((p) => p.id),
          );
        } catch (error) {
          failedBefore = error.message;
        }
        assert.ok(failedBefore, 'Unchanged candidate must exhibit the append reversal');
        evidence.push({
          name: `${account.roleCode} ${c.operation} failed-before reproduced`,
          before,
          displayed: expected,
          saved,
          failedBefore,
        });
      } else {
        assert.deepEqual(saved, expected);
        evidence.push({
          name: `${account.roleCode} ${c.pattern} ${c.operation} exact saved order/identity`,
          before,
          expected,
          saved,
        });
      }
      await detail(c.id, saved);
    }
  }
}
