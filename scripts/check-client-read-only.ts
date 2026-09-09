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

/** Enforce the Phase 2 read-only client/contact boundary. */
function failures(sources: AuditRuntimeSource[]): string[] {
  const errors: string[] = [];
  for (const { path, text } of sources.filter(
    (s) => s.path.startsWith('src/app/clients/') || s.path.startsWith('src/lib/client'),
  )) {
    const tree = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const queryFile = path === 'src/lib/client-query.ts';
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node)) {
        if (node.text === 'use server') errors.push('unreviewed client server action');
        if (/^@\/lib\/(audit|auth\/(user-management|service))$/u.test(node.text))
          errors.push('mutation service import');
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const member = ts.isPropertyAccessExpression(node)
          ? node.name.text
          : node.argumentExpression?.getText(tree).replace(/['"]/gu, '');
        // The pure image validator hashes bytes; Hash.update is not a database write.
        const imageHashUpdate =
          path === 'src/lib/client-logo-image.ts' &&
          member === 'update' &&
          ts.isCallExpression(node.expression) &&
          node.expression.expression.getText(tree) === 'createHash' &&
          node.expression.arguments.length === 1 &&
          node.expression.arguments[0]?.getText(tree) === "'sha256'";
        if (
          member &&
          !imageHashUpdate &&
          !node.getText(tree).startsWith('t.clients.') &&
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
          /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|CALL|client_contact_create|client_contact_update|client_contact_set_archived)\b/iu.test(
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
            action.text !== '/clients'
          )
            errors.push('non-GET client form');
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
  const entries = ROUTE_INVENTORY.filter((e) => e.source.startsWith('src/app/clients/'));
  assert.equal(entries.length, 5);
  assert.ok(
    entries.every(
      (entry) =>
        entry.classification.access === 'permission' && entry.classification.action === 'view',
    ),
  );
  assert.deepEqual(
    entries
      .filter((e) => e.kind === 'page')
      .map((e) => e.route)
      .sort(),
    ['/clients', '/clients/[id]', '/clients/[id]/contacts/[contactId]'],
  );
  assert.deepEqual(
    entries
      .filter((e) => e.kind === 'route')
      .map((e) => e.exportName)
      .sort(),
    ['GET', 'HEAD'],
  );
  for (const text of [
    "'use server'; export async function change(){}",
    "import { setHumanAuditContext } from '@/lib/audit';",
    'db.person.update({});',
    'db["person"]["delete"]({});',
    'db.$executeRawUnsafe(sql);',
    'tx.$executeRaw`SELECT public.client_contact_create()`;',
    'Prisma.sql`SELECT public.client_contact_create(1,1,${name})`;',
    '<form method="post" action="/clients"/>',
    'db.$queryRaw(Prisma.sql`SELECT * FROM people`);',
  ])
    assert.ok(failures([{ path: 'src/app/clients/fixture.tsx', text }]).length > 0, text);
  const css = postcss.parse(readFileSync('src/app/clients/clients.module.css', 'utf8'));
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
    'PASS client structure: three view pages, GET/HEAD logo handler, no mutations or UI database access, defined RTL tokens; nine rejecting fixtures',
  );
}
main();
