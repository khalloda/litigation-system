import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../src/strings.ts';
import { proveHearingBrowser } from './test-hearing-browser.mjs';
import { lifecycleSessions } from './lib/matter-lifecycle-proof.ts';
import { mutatePoa, readPoaMutation } from '../src/lib/poa-mutations.ts';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata.ts';
import { adminEditState } from './lib/admin-edit-state.ts';
import { provePoaR1Recovery } from './lib/poa-r1-browser-proof.mjs';

export async function provePoaBrowser(fixture, output) {
  const red = process.argv.includes('--r1-red');
  return proveHearingBrowser(
    fixture,
    output,
    async (api) => {
      const { page, runtime, inspect, accounts, login, goto, screenshot, evidence } = api;
      const field = (label) => page.getByLabel(label, { exact: true });
      const save = () => page.getByRole('button', { name: t.poa.save, exact: true }).click();
      const requests = [];
      page.on('request', (request) => {
        if (
          request.method() === 'POST' &&
          new URL(request.url()).pathname.startsWith('/powers-of-attorney')
        )
          requests.push({ path: new URL(request.url()).pathname, body: request.postData() });
      });
      const state = () => inspect(adminEditState);
      const dom = (control) =>
        control.evaluate((el) => ({
          value: el.value,
          badInput: el.validity.badInput,
          valid: el.validity.valid,
          underflow: el.validity.rangeUnderflow,
          overflow: el.validity.rangeOverflow,
          stepMismatch: el.validity.stepMismatch,
        }));
      const detail = async () => {
        await page.waitForURL(/\/powers-of-attorney\/\d+(?:\?|$)/u);
        await page.waitForLoadState('networkidle');
        return Number(new URL(page.url()).pathname.split('/').at(-1));
      };
      const observations = [];
      try {
        for (const account of accounts.filter((a) =>
          ['Administrator', 'Litigation Assistant'].includes(a.roleCode),
        )) {
          await login(account);
          const actor = (await lifecycleSessions(runtime)).find(
            (s) => s.user.role === account.roleCode,
          );
          for (const operation of ['create', 'update']) {
            for (const key of ['copies_count', 'issue_date']) {
              let id = null;
              if (operation === 'update') {
                id = (
                  await mutatePoa(
                    actor,
                    'create',
                    {
                      operation: 'create',
                      id: null,
                      version: null,
                      submission: randomUUID(),
                      values: {
                        principal_name: 'TEST ONLY R1 native red/green control',
                        copies_count: 2,
                        issue_date: '2026-09-15',
                      },
                      lawyers: [],
                      facts: null,
                    },
                    { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
                  )
                ).id;
              }
              await goto(
                operation === 'create'
                  ? '/powers-of-attorney/new'
                  : `/powers-of-attorney/${id}/edit`,
              );
              if (operation === 'create') {
                await field(t.poa.principal).fill(
                  'TEST ONLY R1 create native input ' + account.roleCode,
                );
                await field(t.poa.copies).fill('2');
                await field(t.poa.issueDate).fill('2026-09-15');
              }
              const control = field(key === 'copies_count' ? t.poa.copies : t.poa.issueDate);
              const before = await state();
              const priorRequests = requests.length;
              const sequence =
                key === 'copies_count'
                  ? ['ControlOrMeta+A', '-']
                  : ['ArrowRight', 'ArrowRight', 'Backspace'];
              await control.focus();
              for (const stroke of sequence) await control.press(stroke);
              const native = await dom(control);
              observations.push({ role: account.roleCode, operation, key, sequence, native });
              await screenshot(
                `${red ? 'red' : 'green'}-${account.roleCode.replaceAll(' ', '-')}-${operation}-${key}-draft`,
              );
              assert.equal(
                native.badInput,
                true,
                'Native keyboard must reproduce an incomplete control, not a synthesized event',
              );
              assert.equal(native.value, '');
              await save();
              if (red) {
                const saved = await detail();
                const current = await readPoaMutation(actor, 'update', saved, runtime);
                assert.equal(
                  current.record.values[key],
                  null,
                  'Original candidate silently accepts incomplete draft as NULL',
                );
                assert.equal(requests.length, priorRequests + 1);
                observations.at(-1).saved = {
                  id: saved,
                  value: current.record.values[key],
                  version: current.record.version,
                };
                observations.at(-1).request = requests.at(-1);
                observations.at(-1).stateChanged =
                  JSON.stringify(before) !== JSON.stringify(await state());
                assert.equal(observations.at(-1).stateChanged, true);
              } else {
                await page.locator('main [role=alert]').waitFor();
                const afterRejected = await state();
                assert.deepEqual(
                  afterRejected,
                  before,
                  'Rejected input must not change any row, history, audit, receipt or sequence',
                );
                observations.at(-1).unchangedState = { before, after: afterRejected };
                assert.equal(requests.length, priorRequests);
                assert.equal(
                  (await dom(control)).badInput,
                  true,
                  'Incomplete browser draft remains for correction',
                );
                assert.equal(
                  await page
                    .locator('main [role=alert]')
                    .evaluate((el) => el === document.activeElement),
                  true,
                );
                await field(t.fields.notes).fill('TEST ONLY retained unrelated draft');
                assert.equal(
                  (await dom(control)).badInput,
                  true,
                  'A React rerender retains the incomplete native draft',
                );
                await control.fill(key === 'copies_count' ? '3' : '2024-02-29');
                await save();
                const saved = await detail();
                const recovered = await readPoaMutation(actor, 'update', saved, runtime);
                assert.equal(
                  recovered.record.values[key],
                  key === 'copies_count' ? 3 : '2024-02-29',
                );
                assert.equal(recovered.record.values.notes, 'TEST ONLY retained unrelated draft');
                observations.at(-1).recoverySaved = {
                  id: saved,
                  value: recovered.record.values[key],
                };
              }
              evidence.push({
                name: `${red ? 'RED reproduced silent NULL' : 'GREEN refused without mutation'} ${account.roleCode} ${operation} ${key}`,
              });
            }
          }
        }
        if (!red) await provePoaR1Recovery(api, output, requests);
      } finally {
        writeFileSync(
          join(output, 'native-input-results.json'),
          JSON.stringify(
            { mode: red ? 'red-original' : 'green-correction', observations, requests },
            null,
            2,
          ),
        );
      }
    },
    { preserveAccounts: true },
  );
}
