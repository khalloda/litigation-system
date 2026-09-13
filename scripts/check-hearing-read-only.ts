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
      (s.path.startsWith('src/app/hearings/') &&
        ![
          'src/app/hearings/actions.ts',
          'src/app/hearings/hearing-editor.tsx',
          'src/app/hearings/hearing-management-page.tsx',
          'src/app/hearings/new/page.tsx',
          'src/app/hearings/[id]/edit/page.tsx',
        ].includes(s.path)) ||
      ['src/lib/hearing-query.ts', 'src/lib/hearings.ts'].includes(s.path),
  )) {
    const query = path === 'src/lib/hearing-query.ts';
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
          node.getText(tree) !== 't.hearings.manage.create' &&
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
            action.text !== '/hearings'
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
const entries = ROUTE_INVENTORY.filter((e) => e.source.startsWith('src/app/hearings/'));
assert.equal(entries.length, 6);
assert.ok(
  entries
    .filter((e) => e.classification.access === 'permission' && e.classification.action === 'view')
    .every(
      (e) =>
        e.kind === 'page' &&
        e.classification.access === 'permission' &&
        e.classification.area === 'hearings' &&
        e.classification.action === 'view',
    ),
);
assert.deepEqual(
  entries
    .flatMap((e) =>
      e.classification.access === 'permission' && e.classification.action !== 'view'
        ? [[e.kind, e.classification.action]]
        : [],
    )
    .sort(),
  [
    ['page', 'create'],
    ['page', 'update'],
    ['server-action', 'create'],
    ['server-action', 'update'],
  ].sort(),
);
for (const text of [
  "'use server';",
  "import x from '@/lib/matter-lifecycle';",
  'db.hearing.update({})',
  'db["hearing"]["delete"]({})',
  'db.$executeRawUnsafe(sql)',
  'Prisma.sql`DELETE FROM hearings`',
  'Prisma.sql`SELECT public.client_contact_create(1)`',
  '<form method="post" action="/hearings"/>',
  'db.$queryRaw(Prisma.sql`SELECT * FROM hearings`)',
])
  assert.ok(failures([{ path: 'src/app/hearings/fixture.tsx', text }]).length, text);
console.log(
  'PASS hearing read-only closure, four exact separately guarded mutation entrypoints, nine rejecting fixtures',
);
