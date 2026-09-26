import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportAssets } from '../src/lib/reports/assets';
import { validateReportData, validateDefinition } from '../src/lib/reports/result';
import { edgeData, edgeDescriptor } from './test-report-probes';
import {
  auditRuntimeSourceFailures,
  discoverAuditRuntimeSources,
} from './lib/audit-source-inventory';
async function main() {
  const source = discoverAuditRuntimeSources(process.cwd());
  assert.deepEqual(auditRuntimeSourceFailures(source), []);
  for (const [path, from, to] of [
    ['src/lib/reports/authority.ts', 'await verifyReportAccount(tx, current);', ''],
    [
      'src/lib/reports/engine.ts',
      'await requireReportAuthority(session, database, action, d.descriptor.permissions);',
      '',
    ],
    ['src/lib/reports/options.ts', 'ORDER BY name_ar', 'WHERE NOT is_archived ORDER BY name_ar'],
    ['src/lib/reports/engine.ts', 'recordObservedExternalEvent', 'setHumanAuditContext'],
  ] as const) {
    let changed = false;
    const candidate = source.map((s) => {
      if (s.path !== path) return s;
      assert.ok(s.text.includes(from));
      changed = true;
      return { ...s, text: s.text.replace(from, to) };
    });
    assert.ok(changed);
    assert.ok(auditRuntimeSourceFailures(candidate).length > 0);
    console.log('PASS rejecting source mutation ' + path + ' ' + from);
  }
  assert.throws(() =>
    validateDefinition({
      descriptor: { ...edgeDescriptor, columns: [] },
      query: async () => edgeData,
    }),
  );
  assert.throws(() =>
    validateReportData(edgeDescriptor, {
      ...edgeData,
      sections: [
        {
          id: 's',
          title: '',
          groups: [
            {
              id: 'g',
              title: '',
              rows: Array.from({ length: 100001 }, (_, i) => ({
                id: String(i),
                cells: [
                  { type: 'text', value: '' },
                  { type: 'text', value: '' },
                ],
              })),
            },
          ],
        },
      ],
    }),
  );
  assert.throws(() =>
    validateReportData(edgeDescriptor, {
      ...edgeData,
      sections: [
        {
          id: 's',
          title: '',
          groups: [
            {
              id: 'g',
              title: '',
              rows: [
                {
                  id: '1',
                  cells: [
                    { type: 'text', value: '\ud800' },
                    { type: 'text', value: '' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  console.log('PASS empty definition, excessive rows and malformed Unicode fail closed');
  const root = process.env.REPORT_ASSET_ROOT!;
  const owned = mkdtempSync(join(process.env.TASK51_PRIVATE!, 'asset-negative-'));
  mkdirSync(join(owned, 'assets'));
  mkdirSync(join(owned, 'public/fonts'), { recursive: true });
  for (const file of [
    'assets/logo.png',
    'assets/emblem.png',
    ...['arabic', 'latin', 'latin-ext'].map(
      (x) => `public/fonts/noto-naskh-arabic-${x}-wght-normal.woff2`,
    ),
  ])
    copyFileSync(join(root, file), join(owned, file));
  process.env.REPORT_ASSET_ROOT = owned;
  try {
    await reportAssets();
    writeFileSync(join(owned, 'assets/logo.png'), Buffer.alloc(20, 1));
    await assert.rejects(reportAssets());
    copyFileSync(join(root, 'assets/logo.png'), join(owned, 'assets/logo.png'));
    writeFileSync(
      join(owned, 'public/fonts/noto-naskh-arabic-arabic-wght-normal.woff2'),
      Buffer.alloc(20, 1),
    );
    await assert.rejects(reportAssets());
    process.env.REPORT_ASSET_ROOT = 'relative-root';
    await assert.rejects(reportAssets());
    console.log('PASS corrupt mandatory logo/font and relative asset root reject generation');
  } finally {
    process.env.REPORT_ASSET_ROOT = root;
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
