import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { t } from '../src/strings';
import { reportLineDirection } from '../src/lib/reports/label';

// Exercise the real server-page JSX and existing label helper with a fixed read
// model. No database, session forgery, browser or mutation service is involved.
const nativeRequire = createRequire(import.meta.url);
function load(file: string, imports: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports,
    require(name: string) {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (['react', 'react/jsx-runtime'].includes(name)) return nativeRequire(name);
      throw new Error(`Unexpected page dependency: ${name}`);
    },
  });
  return exports;
}
const styles = new Proxy({}, { get: (_, key) => String(key) });
const helper = load('src/app/reports/label-parts.tsx', {
  '@/lib/reports/label': { reportLineDirection },
  './reports.module.css': { default: styles },
});
const fixtures: [string | null, string | null, string[]][] = [
  ['1 / 2010', 'TEST ONLY', ['ltr']],
  ['دعوى اختبار\n001 / 2026', 'TEST ONLY', ['rtl', 'ltr']],
  ['001 / 52ق\n140J / 140ق', 'TEST ONLY', ['rtl', 'ltr']],
  ['933/2025', 'TEST ONLY', ['ltr']],
  [null, 'موضوع اختبار\nTEST ONLY 001 / 2026', ['rtl', 'ltr']],
  [null, null, ['rtl']],
];
async function main() {
  for (const canEdit of [true, false]) {
    for (const [caseNumber, subject, directions] of fixtures) {
      const matter = Object.freeze({ id: 90001, caseNumber, subject });
      const hearings = Object.freeze([{ id: 90002, date: '2080-01-01' }]);
      const model = Object.freeze({ name: 'TEST ONLY عميل', matters: [matter], hearings });
      let read = false;
      let editor = false;
      const loaded = load('src/app/reports/lawyer-selection/page.tsx', {
        'next/link': { default: 'a' },
        'next/navigation': { notFound: () => assert.fail('Unexpected missing route') },
        '@/lib/auth/authorization': { requirePagePermission: async () => ({ fixture: true }) },
        '@/lib/auth/authorization-core': { decideAuthorization: () => ({ allowed: canEdit }) },
        '@/lib/reports/selection': { ReportSelectionError: class extends Error {} },
        '../reference-select': { ReportReferenceSelect: () => null },
        '@/lib/reports/production': { reporting: {} },
        '@/lib/reports/lawyer-selection': {
          readLawyerReportSelection: async (
            _: unknown,
            client: number,
            id: number,
            page: number,
          ) => {
            assert.equal(client, 90000);
            assert.equal(id, matter.id);
            assert.equal(page, 1);
            read = true;
            return model;
          },
        },
        '@/strings': { t },
        '../selection/editor': {
          SelectionEditor: (props: Record<string, unknown>) => {
            assert.equal(props.client, 90000);
            assert.equal(props.matter, matter);
            assert.equal(props.hearings, hearings);
            assert.equal(props.canEdit, canEdit);
            assert.equal(props.scope, 'lawyer');
            editor = true;
            return createElement('form');
          },
        },
        '../label-parts': helper,
        '../reports.module.css': { default: styles },
      });
      const page = loaded.default as (p: unknown) => Promise<ReturnType<typeof createElement>>;
      const html = renderToStaticMarkup(
        await page({ searchParams: Promise.resolve({ client: '90000', id: String(matter.id) }) }),
      );
      assert.ok(read && editor);
      const context = html.match(/<p class="hint">([\s\S]*?)<\/p>/u)![1]!;
      const lines = [...context.matchAll(/<bdi dir="(rtl|ltr)">([^<]*)<\/bdi>/gu)].map((m) => ({
        dir: m[1],
        value: m[2],
      }));
      const value = caseNumber ?? subject ?? t.reports.nullValue;
      assert.deepEqual(lines, [
        { dir: 'ltr', value: model.name },
        { dir: 'ltr', value: '90000' },
        ...value.split('\n').map((line, i) => ({ dir: directions[i], value: line })),
        { dir: 'ltr', value: String(matter.id) },
      ]);
      for (const label of [
        t.fields.client,
        t.auditHistory.fields.client_id,
        caseNumber === null ? t.fields.subject : t.fields.caseNumber,
        t.auditHistory.fields.matter_id,
      ])
        assert.ok(context.includes(label));
      assert.equal((context.match(/\n/gu) ?? []).length, value.split('\n').length - 1);
      assert.ok(!context.includes('null'));
      assert.ok(html.includes('href="/reports/lawyer-selection?client=90000"'));
    }
  }
  console.log(
    'PASS 12 real-page context cases: exact per-line text/direction, labels, null fallback, stable IDs/hearings and unchanged edit affordances',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
