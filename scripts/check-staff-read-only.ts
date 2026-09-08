import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import postcss from 'postcss';
import { discoverAuditRuntimeSources, type AuditRuntimeSource } from './lib/audit-source-inventory';
import { ROUTE_INVENTORY } from '../src/lib/auth/route-inventory';
import {
  routeInventoryFailures,
  discoverAuthorizationEntrypoints,
} from './lib/authorization-route-inventory';

/** Permanent Phase 2 architecture boundary. Phase 3 must deliberately replace
 * this allowlist alongside its independently reviewed mutation contract. */
function failures(sources: AuditRuntimeSource[]): string[] {
  const errors: string[] = [];
  for (const { path, text } of sources.filter(
    (s) => s.path.startsWith('src/app/staff/') || s.path.startsWith('src/lib/staff-roster'),
  )) {
    const tree = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const queryFile = path === 'src/lib/staff-roster-query.ts';
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node)) {
        if (node.text === 'use server') errors.push('staff server action');
        if (/^@\/lib\/(audit|auth\/(user-management|service))/u.test(node.text))
          errors.push('mutation service import');
        if (/^\/staff\/(new|.*\/edit)(?:$|\?)/u.test(node.text)) errors.push('mutation route link');
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const member = ts.isPropertyAccessExpression(node)
          ? node.name.text
          : node.argumentExpression?.getText(tree).replace(/['"]/gu, '');
        if (
          member &&
          /^(create|createMany|update|updateMany|upsert|delete|deleteMany|\$executeRawUnsafe|\$queryRawUnsafe)$/u.test(
            member,
          )
        )
          errors.push('write or unsafe database call');
        if (member?.startsWith('$') && !queryFile)
          errors.push('database access outside query service');
        if (member === '$executeRaw') errors.push('execute outside SELECT inventory');
      }
      if (ts.isTaggedTemplateExpression(node) && node.tag.getText(tree).endsWith('.sql')) {
        const sql = ts.isNoSubstitutionTemplateLiteral(node.template)
          ? node.template.text
          : node.template.head.text +
            node.template.templateSpans.map((s) => s.literal.text).join(' ');
        if (
          /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|CALL|staff_create_person|staff_update_person|staff_rename_person|staff_add_alias|staff_set_alias_retired|staff_set_team_reviewer)\b/iu.test(
            sql,
          )
        )
          errors.push('mutation SQL');
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        if (node.tagName.getText(tree) === 'form') {
          const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
          const method = attrs.find((a) => a.name.getText(tree) === 'method')?.initializer;
          const action = attrs.find((a) => a.name.getText(tree) === 'action')?.initializer;
          if (
            !method ||
            !ts.isStringLiteral(method) ||
            method.text !== 'get' ||
            !action ||
            !ts.isStringLiteral(action) ||
            action.text !== '/staff'
          )
            errors.push('non-GET roster form');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return errors;
}

function main() {
  const sources = discoverAuditRuntimeSources(process.cwd());
  assert.deepEqual(failures(sources), []);
  assert.deepEqual(routeInventoryFailures(discoverAuthorizationEntrypoints(process.cwd())), []);
  const entries = ROUTE_INVENTORY.filter((e) => e.source.startsWith('src/app/staff/'));
  assert.equal(entries.length, 2);
  for (const entry of entries)
    assert.deepEqual(entry.classification, { access: 'permission', area: 'staff', action: 'view' });
  assert.deepEqual(entries.map((e) => ('route' in e ? e.route : undefined)).sort(), [
    '/staff',
    '/staff/[id]',
  ]);
  for (const text of [
    "'use server'; export async function change(){}",
    "import { setHumanAuditContext } from '@/lib/audit';",
    'db.person.update({});',
    'db["person"]["delete"]({});',
    'db.$executeRawUnsafe(sql);',
    'tx.$executeRaw`SELECT public.staff_create_person()`;',
    'Prisma.sql`SELECT public.staff_add_alias(1,1,${name})`;',
    '<form method="post" action="/staff"/>',
    '<a href="/staff/new"/>',
  ])
    assert.ok(failures([{ path: 'src/app/staff/fixture.tsx', text }]).length > 0, text);
  const css = postcss.parse(readFileSync('src/app/staff/staff.module.css', 'utf8'));
  const tokens = new Set(
    [...readFileSync('src/app/globals.css', 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/gu)].map(
      (m) => m[1],
    ),
  );
  css.walkDecls((decl) => {
    for (const m of decl.value.matchAll(/var\((--[a-z0-9-]+)/gu))
      assert.ok(tokens.has(m[1]), `undefined token ${m[1]}`);
  });
  console.log(
    'PASS Phase 2 read-only structure: two guarded pages, GET-only forms, no mutation imports/actions/SQL, defined RTL CSS tokens; nine rejecting fixtures',
  );
}
main();
