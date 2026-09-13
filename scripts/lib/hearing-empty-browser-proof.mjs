import assert from 'node:assert/strict';
import { lifecycleSessions } from './matter-lifecycle-proof.ts';
import { readHearings } from '../../src/lib/hearing-query.ts';
import { t } from '../../src/strings.ts';
export async function emptyHearingBrowserProof({
  page,
  accounts,
  login,
  goto,
  audit,
  screenshot,
  runtime,
  evidence,
}) {
  for (const session of await lifecycleSessions(runtime)) {
    const result = await readHearings(session, {}, runtime);
    assert.equal(result.total, 0);
    assert.deepEqual(result.rows, []);
  }
  for (const account of accounts) {
    await login(account);
    await goto('/hearings');
    await page.getByText(t.hearings.none, { exact: true }).waitFor();
    assert.equal(await page.locator('[data-hearing-id]').count(), 0);
    await audit(account.roleCode + ' genuinely empty hearings');
  }
  await screenshot('hearing-genuinely-empty');
  evidence.push({
    name: 'All roles: actual zero-stored-hearing database, service and browser, no deletion',
  });
}
