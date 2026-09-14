import assert from 'node:assert/strict';
import ts from 'typescript';
import { discoverAuditRuntimeSources, type AuditRuntimeSource } from './lib/audit-source-inventory';
import { ROUTE_INVENTORY } from '../src/lib/auth/route-inventory';
import {
  routeInventoryFailures,
  discoverAuthorizationEntrypoints,
} from './lib/authorization-route-inventory';

function failures(sources: AuditRuntimeSource[]) {
  const errors: string[] = [];
  for (const { path, text } of sources.filter(
    (s) =>
      [
        'src/app/admin-works/page.tsx',
        'src/app/admin-works/[id]/page.tsx',
        'src/app/admin-works/fixture.tsx',
      ].includes(s.path) ||
      ['src/lib/admin-work-query.ts', 'src/lib/admin-works.ts'].includes(s.path),
  )) {
    const query = path === 'src/lib/admin-work-query.ts';
    const tree = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isStringLiteral(node) &&
        (node.text === 'use server' ||
          /(?:mutations|lifecycle|auth\/service|user-management)$/u.test(node.text))
      )
        errors.push('mutation dependency');
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const member = ts.isPropertyAccessExpression(node)
          ? node.name.text
          : node.argumentExpression?.getText(tree).replace(/['"]/gu, '');
        if (
          member &&
          node.getText(tree) !== 't.adminWorks.manage.create' &&
          /^(?:create|createMany|update|updateMany|upsert|delete|deleteMany|\$executeRaw|\$executeRawUnsafe|\$queryRawUnsafe)$/u.test(
            member,
          )
        )
          errors.push('write/unsafe call');
        if (member?.startsWith('$') && !query) errors.push('database access outside read service');
      }
      if (ts.isTaggedTemplateExpression(node) && node.tag.getText(tree).endsWith('.sql')) {
        const sql = ts.isNoSubstitutionTemplateLiteral(node.template)
          ? node.template.text
          : node.template.head.text +
            node.template.templateSpans.map((s) => s.literal.text).join(' ');
        if (
          /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|CALL|audit_set_\w+|client_contact_\w+|matter_lifecycle_\w+)\b/iu.test(
            sql,
          )
        )
          errors.push('mutation SQL');
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
        if (node.tagName.getText(tree) === 'form') {
          const attrs = node.attributes.properties.filter(ts.isJsxAttribute),
            method = attrs.find((a) => a.name.getText(tree) === 'method')?.initializer,
            action = attrs.find((a) => a.name.getText(tree) === 'action')?.initializer;
          if (
            !method ||
            !ts.isStringLiteral(method) ||
            method.text !== 'get' ||
            !action ||
            !ts.isStringLiteral(action) ||
            action.text !== '/admin-works'
          )
            errors.push('non-GET form');
        }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return errors;
}
assert.deepEqual(failures(discoverAuditRuntimeSources(process.cwd())), []);
assert.deepEqual(routeInventoryFailures(discoverAuthorizationEntrypoints(process.cwd())), []);
const entries = ROUTE_INVENTORY.filter((e) =>
  ['src/app/admin-works/page.tsx', 'src/app/admin-works/[id]/page.tsx'].includes(e.source),
);
assert.equal(entries.length, 2);
assert.ok(
  entries.every(
    (e) =>
      e.kind === 'page' &&
      e.classification.access === 'permission' &&
      e.classification.area === 'administrativeWorks' &&
      e.classification.action === 'view',
  ),
);
for (const text of [
  "'use server';",
  "import x from '@/lib/matter-lifecycle';",
  'db.hearing.update({})',
  'db["hearing"]["delete"]({})',
  'db.$executeRawUnsafe(sql)',
  'Prisma.sql`DELETE FROM admin-works`',
  'Prisma.sql`SELECT public.client_contact_create(1)`',
  '<form method="post" action="/admin-works"/>',
  'db.$queryRaw(Prisma.sql`SELECT * FROM admin-works`)',
])
  assert.ok(failures([{ path: 'src/app/admin-works/fixture.tsx', text }]).length, text);
console.log('PASS administrative read-only closure, two guarded pages, nine rejecting fixtures');
