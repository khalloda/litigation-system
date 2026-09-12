import assert from 'node:assert/strict';
import { t } from '../../src/strings.ts';
import { staffReadOnlyState } from './staff-read-only-state.ts';
import { matterMigrationCatalog } from './matter-migration-delta.ts';
import { proveStaffBrowserZoom, staffFocusProof } from './staff-accessibility-browser.mjs';
import { proveMatterEditorBrowser } from './matter-editor-browser.mjs';

export async function proveMatterCorrectionBrowser(ctx, original) {
  const { page, context, accounts, login, goto, audit, screenshot, evidence, inspect } = ctx;
  const save = async () => {
    await page.getByRole('button', { name: t.matters.manage.save, exact: true }).click();
    await page.getByRole('link', { name: t.matters.backMatter, exact: true }).waitFor();
  };
  const detail = async () => {
    await page.getByRole('link', { name: t.matters.backMatter, exact: true }).click();
    await page.locator('main[data-matter-id]').waitFor();
    return Number(await page.locator('main').getAttribute('data-matter-id'));
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
  const keyboardMove = async (index, direction) => {
    await button(index, direction).focus();
    await page.keyboard.press('Enter');
  };
  const rows = (id) =>
    inspect(
      async (db) =>
        (
          await db.query(
            `SELECT p.id,p.side,p.ordinal,p.party_name,(SELECT jsonb_agg(jsonb_build_object('id',r.id,'role_id',r.role_id,'ordinal',r.ordinal) ORDER BY r.ordinal,r.id) FROM matter_party_roles r WHERE r.party_id=p.id AND NOT r.is_retired) capacities FROM matter_parties p WHERE p.matter_id=$1 AND NOT p.is_retired ORDER BY p.side,p.ordinal NULLS LAST,p.id`,
            [id],
          )
        ).rows,
    );
  for (const account of accounts.filter((a) =>
    ['Administrator', 'Litigation Assistant'].includes(a.roleCode),
  )) {
    await login(account);
    await goto('/matters/new');
    await page
      .getByLabel(t.fields.subject, { exact: true })
      .fill('TEST ONLY correction browser ' + account.roleCode);
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: t.matters.manage.addParty, exact: true }).click();
      const blank = page
        .getByLabel(t.matters.manage.partyName, { exact: true })
        .filter({ visible: true });
      // New client rows are inserted at their group's end in the corrected editor.
      const index = (await blank.evaluateAll((nodes) => nodes.map((n) => n.value))).indexOf('');
      await blank.nth(index).fill('TEST ONLY party ' + i);
      await party(index)
        .getByRole('button', { name: t.matters.manage.addCapacity, exact: true })
        .click();
      const cap = party(index).getByLabel(t.matters.manage.capacity, { exact: true });
      const roles = await cap
        .locator('option')
        .evaluateAll((nodes) => nodes.filter((n) => n.value && !n.disabled).map((n) => n.value));
      await cap.selectOption(roles[0]);
      if (i >= 2)
        await party(index)
          .getByLabel(t.matters.manage.side, { exact: true })
          .selectOption('opponent');
    }
    await page.getByRole('button', { name: t.matters.manage.addLawyer, exact: true }).click();
    const lawyer = page.getByLabel(t.matters.filters.lawyer, { exact: true });
    const people = await lawyer
      .locator('option')
      .evaluateAll((nodes) => nodes.filter((n) => n.value && !n.disabled).map((n) => n.value));
    await lawyer.selectOption(people[0]);
    await save();
    const id = await detail();
    for (const kind of ['lawyer', 'capacity']) {
      await goto(`/matters/${id}/edit`);
      const select = page
        .getByLabel(kind === 'lawyer' ? t.matters.filters.lawyer : t.matters.manage.capacity, {
          exact: true,
        })
        .first();
      const first = await select.inputValue();
      const alternate = await select
        .locator('option')
        .evaluateAll((nodes) => nodes.filter((n) => n.value && !n.disabled).map((n) => n.value));
      const before = await complete();
      await select.selectOption(alternate.find((v) => v !== first));
      await select.selectOption(first);
      await save();
      const after = await complete();
      if (original) assert.notDeepEqual(after.state.tables, before.state.tables);
      else assert.deepEqual(after, before);
      evidence.push({
        name:
          'R1 ' +
          account.roleCode +
          ' ' +
          kind +
          (original ? ' original false edit reproduced' : ' selection round trip exact no-op'),
        before,
        after,
      });
    }
    await goto(`/matters/${id}/edit`);
    const beforeRows = await rows(id);
    if (original) {
      assert.equal(await button(2, 'up').isEnabled(), true);
      await keyboardMove(2, 'up');
      const submitted = await names();
      assert.deepEqual(submitted, [
        'TEST ONLY party 0',
        'TEST ONLY party 2',
        'TEST ONLY party 1',
        'TEST ONLY party 3',
      ]);
      await save();
      await goto(`/matters/${id}/edit`);
      assert.deepEqual(
        await names(),
        beforeRows.map((r) => r.party_name),
      );
      evidence.push({
        name: 'R3 original cross-side movement reversed on reload',
        submitted,
        reloaded: await names(),
      });
    } else {
      assert.equal(await button(0, 'up').isDisabled(), true);
      assert.equal(await button(1, 'down').isDisabled(), true);
      assert.equal(await button(2, 'up').isDisabled(), true);
      assert.equal(await button(3, 'down').isDisabled(), true);
      await keyboardMove(1, 'up');
      await keyboardMove(3, 'up');
      const moved = await names();
      assert.deepEqual(moved, [
        'TEST ONLY party 1',
        'TEST ONLY party 0',
        'TEST ONLY party 3',
        'TEST ONLY party 2',
      ]);
      await page.getByLabel(t.matters.askedAmount, { exact: true }).fill('1e3');
      await page.getByRole('button', { name: t.matters.manage.save, exact: true }).click();
      await page.locator('main [role="alert"]').waitFor();
      assert.deepEqual(await names(), moved);
      assert.equal(
        await page.locator('main [role="alert"]').evaluate((el) => el === document.activeElement),
        true,
      );
      await page.getByLabel(t.matters.askedAmount, { exact: true }).fill('1.00');
      await save();
      await detail();
      const saved = await rows(id);
      assert.deepEqual(
        saved.map((r) => r.id),
        [beforeRows[1].id, beforeRows[0].id, beforeRows[3].id, beforeRows[2].id],
      );
      for (const r of saved)
        assert.deepEqual(r.capacities, beforeRows.find((p) => p.id === r.id).capacities);
      assert.deepEqual(
        await page
          .locator('[data-party-id]')
          .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.partyId))),
        saved.map((r) => r.id),
      );
      await goto(`/matters/${id}/edit`);
      assert.deepEqual(await names(), moved);
      await party(0).getByLabel(t.matters.manage.side, { exact: true }).selectOption('opponent');
      assert.deepEqual(await names(), [
        'TEST ONLY party 0',
        'TEST ONLY party 3',
        'TEST ONLY party 2',
        'TEST ONLY party 1',
      ]);
      await page.keyboard.press('Tab');
      evidence.push({ name: 'R3 keyboard focus', proof: await staffFocusProof(page) });
      await audit(account.roleCode + ' correction desktop');
      await screenshot('correction-' + account.roleCode + '-desktop');
      await page.setViewportSize({ width: 320, height: 900 });
      await audit(account.roleCode + ' correction 320');
      await screenshot('correction-' + account.roleCode + '-320');
      await page.setViewportSize({ width: 1440, height: 1000 });
      await proveStaffBrowserZoom({
        context,
        page,
        audit,
        screenshot,
        evidence,
        name: 'correction-' + account.roleCode,
      });
      await save();
      await detail();
      const changedSide = await rows(id);
      assert.deepEqual(
        changedSide.map((r) => [r.id, r.side]),
        [
          [beforeRows[0].id, 'client'],
          [beforeRows[3].id, 'opponent'],
          [beforeRows[2].id, 'opponent'],
          [beforeRows[1].id, 'opponent'],
        ],
      );
      for (const r of changedSide)
        assert.deepEqual(r.capacities, beforeRows.find((p) => p.id === r.id).capacities);
      assert.deepEqual(
        await page
          .locator('[data-party-id]')
          .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.partyId))),
        changedSide.map((r) => r.id),
      );
      evidence.push({
        name:
          'R3 ' +
          account.roleCode +
          ' within-side keyboard/boundaries/validation/side change/save/reload/detail',
        beforeRows,
        saved,
        changedSide,
      });
    }
    const protectedRows = await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT id,legacy_id,court_id FROM matters WHERE legacy_id IN (467,468,515) ORDER BY legacy_id',
          )
        ).rows,
    );
    assert.deepEqual(
      protectedRows.map((r) => r.legacy_id),
      [467, 468, 515],
    );
    for (const row of protectedRows) {
      await goto(`/matters/${row.id}/edit`);
      const court = page.getByLabel(t.fields.court, { exact: true });
      assert.equal(await court.isDisabled(), !original);
      if (!original) {
        assert.equal(await court.inputValue(), String(row.court_id));
        await page.getByText(t.matters.manage.protectedCourt, { exact: true }).waitFor();
      }
      evidence.push({
        name:
          'R2 ' +
          account.roleCode +
          ' court form ' +
          (original ? 'restriction absent' : 'protected'),
        legacyId: row.legacy_id,
        id: row.id,
      });
    }
    await audit(account.roleCode + ' protected court');
    await screenshot('correction-' + account.roleCode + '-protected-court');
  }
  // Existing tests supply actual lost-response replay, stale reload and both read-only-role action denials.
  if (!original) await proveMatterEditorBrowser(ctx);
}
