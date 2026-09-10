import assert from 'node:assert/strict';
import { withApprovedMigrationClient } from './migration-principal.ts';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture.ts';
import {
  archiveVisibilityTargets,
  archiveVisibilitySnapshot,
  assertArchiveVisibility,
  archiveVisibilityReceipt,
} from './client-archive-visibility.ts';
import { t } from '../../src/strings.ts';

/** Real production actions and four-role read pages for nonempty imported clients. */
export async function proveClientArchiveBrowser({
  page,
  base,
  goto,
  login,
  accounts,
  fixture,
  audit,
  screenshot,
  evidence,
}) {
  const inspect = (work) =>
    withApprovedMigrationClient(work, {
      databaseUrl: fixture.migrationUrl,
      clientConfig: { options: '-c default_transaction_read_only=on' },
    });
  await inspect((db) =>
    assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment),
  );
  const targets = await inspect(archiveVisibilityTargets);
  const admin = accounts.find((account) => account.roleCode === 'Administrator');
  for (const target of targets) {
    const baseline = await inspect((db) => archiveVisibilitySnapshot(db, target.id));
    assert.equal(baseline.client.is_archived, false);
    for (const [index, phase] of ['before', 'archived', 'restored'].entries()) {
      if (index > 0) {
        await login(admin);
        const operation = index === 1 ? 'client-archive' : 'client-restore';
        const segment = index === 1 ? 'archive' : 'restore';
        await goto(base + `/clients/${target.id}/${segment}?status=all&archive=all`);
        await page
          .getByRole('button', { name: t.clients.manage.titles[operation], exact: true })
          .click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        assert.equal(await page.locator(':focus').textContent(), t.common.cancel);
        assert.ok((await dialog.textContent()).includes(String(target.matters)));
        await audit(`Phase4 ${target.id} ${phase} confirmation with ${target.matters} matters`);
        await dialog.getByRole('button', { name: t.clients.manage.confirm, exact: true }).click();
        await page.getByRole('status').filter({ hasText: t.clients.manage.saved }).waitFor();
      }
      const snapshot = await inspect((db) => archiveVisibilitySnapshot(db, target.id));
      assertArchiveVisibility(baseline, snapshot, index === 1, index);
      for (const account of accounts) {
        await login(account);
        await goto(base + `/clients/${target.id}?status=all&archive=all`);
        assert.equal(new URL(page.url()).pathname, `/clients/${target.id}`);
        const count = page
          .locator('dt')
          .filter({ hasText: t.clients.matterCount })
          .locator('..')
          .locator('dd');
        assert.equal((await count.textContent()).trim(), String(target.matters));
        assert.equal(
          await page.getByText(t.clients.archivedNotice, { exact: true }).count(),
          index === 1 ? 1 : 0,
        );
        if (index === 1) {
          assert.equal(
            await page
              .getByRole('link', { name: t.clients.manage.titles['client-update'], exact: true })
              .count(),
            0,
          );
          assert.equal(
            await page
              .getByRole('link', { name: t.clients.manage.titles['client-restore'], exact: true })
              .count(),
            account.roleCode === 'Administrator' ? 1 : 0,
          );
        }
        await audit(`Phase4 ${target.id} ${phase} ${account.roleCode} existing client details`);
      }
      if (index === 1 && target.matters === 378) {
        await page.setViewportSize({ width: 320, height: 1000 });
        await audit('Phase4 archived 378-matter client at 320 CSS pixels');
        await screenshot('phase4-archived-largest-320');
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      evidence.push({
        name: `Phase4 ${target.id} ${phase} nonempty query preservation`,
        ...archiveVisibilityReceipt(snapshot),
        fourRoles: true,
        passed: true,
      });
    }
  }
  console.log(
    'PASS Phase4 production archive/restore of fixed-report and 378-matter imported clients; exact report datasets and four-role details retained',
  );
}
