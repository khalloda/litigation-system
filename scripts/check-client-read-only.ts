import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import postcss from 'postcss';
import { discoverAuditRuntimeSources, type AuditRuntimeSource } from './lib/audit-source-inventory';
import { ROUTE_INVENTORY } from '../src/lib/auth/route-inventory';
import {
  routeInventoryFailures,
  discoverAuthorizationEntrypoints,
} from './lib/authorization-route-inventory';

// Exact reviewed Phase 3 exceptions. The Phase 2 query/logo closure remains read-only.
const REVIEWED_MUTATIONS: Record<string, string> = {
  'src/lib/client-logo-management.ts':
    '5d665fcbcacbf390916f7ca554ae62c4a59d70c8c83ef7e512d4d1a0bf8bd79e',
  'src/lib/client-logo-request.ts':
    '3040f21ae54d086111b6924bb8c4e7d8536f37b4eb9c59ca474c064642bf1826',
  'src/lib/client-logo-upload.ts':
    '7573c94f56996dcf771c6f40b6de9f284085f1293380572e38901e0c5c60a9d7',
  'src/lib/client-logo-storage.ts':
    '8531e37fa093e576de5b1c324337f6f3f4e59b878f440a9858790879c7473176',
  'src/app/clients/logo-manager.tsx':
    '767f1774440b0dccda55710ee04ff302b5a5cd91e59bb9e2f0c012af83d0a026',
  'src/lib/client-mutation-input.ts':
    '7a910a21bd53be2a3b33580e9a113af39b736537594d54f741f547cc74b842fd',
  'src/lib/client-mutations.ts': 'f6beddf9b04248394555edba032fad6994fe47b334ff2d824905eba4036ca334',
  'src/app/clients/actions.ts': 'c07a904e449e43ac2ee204f570781b1745aa2268707d52e0664e8b29413be337',
  'src/app/clients/client-editor.tsx':
    'c6e93da757bb9ebe0f0f7ec83a294dfec70d6fadf1ab14da6ad261858119e9a1',
};
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
    const reviewed = REVIEWED_MUTATIONS[path];
    if (
      reviewed &&
      createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex') !== reviewed
    )
      errors.push('client mutation closure differs from reviewed inventory');
    const mutationService =
      path === 'src/lib/client-mutations.ts' || path === 'src/lib/client-logo-management.ts';
    const actionFile = path === 'src/app/clients/actions.ts';
    const editorFile = path === 'src/app/clients/client-editor.tsx';
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node)) {
        if (node.text === 'use server' && !actionFile)
          errors.push('unreviewed client server action');
        if (
          /^@\/lib\/(audit|auth\/(user-management|service))$/u.test(node.text) &&
          !mutationService
        )
          errors.push('mutation service import');
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const member = ts.isPropertyAccessExpression(node)
          ? node.name.text
          : node.argumentExpression?.getText(tree).replace(/['"]/gu, '');
        // The pure image validator hashes bytes; Hash.update is not a database write.
        const imageHashUpdate =
          [
            'src/lib/client-logo-image.ts',
            'src/lib/client-logo-upload.ts',
            'src/lib/client-logo-storage.ts',
          ].includes(path) &&
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
        if (member?.startsWith('$') && !queryFile && !mutationService)
          errors.push('database access outside query service');
        if (member === '$executeRaw') errors.push('execute outside SELECT inventory');
      }
      if (ts.isTaggedTemplateExpression(node) && node.tag.getText(tree).endsWith('.sql')) {
        const sql = ts.isNoSubstitutionTemplateLiteral(node.template)
          ? node.template.text
          : node.template.head.text +
            node.template.templateSpans.map((s) => s.literal.text).join(' ');
        if (
          !mutationService &&
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
            !editorFile &&
            (!method ||
              !ts.isStringLiteral(method) ||
              method.text !== 'get' ||
              !action ||
              !ts.isStringLiteral(action) ||
              action.text !== '/clients')
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
  assert.equal(entries.length, 29);
  assert.ok(
    entries.every(
      (entry) =>
        entry.classification.access === 'permission' &&
        ['view', 'create', 'update', 'archive', 'restore'].includes(entry.classification.action),
    ),
  );
  assert.deepEqual(
    entries
      .filter((e) => e.kind === 'page')
      .filter(
        (e) =>
          e.kind === 'page' &&
          e.classification.access === 'permission' &&
          e.classification.action === 'view',
      )
      .map((e) => e.route)
      .sort(),
    [
      '/clients',
      '/clients/[id]',
      '/clients/[id]/contacts/[contactId]',
      '/clients/[id]/logo/manage',
    ],
  );
  assert.deepEqual(
    entries
      .filter((e) => e.kind === 'route')
      .map((e) => e.exportName)
      .sort(),
    ['GET', 'GET', 'GET', 'HEAD', 'POST', 'POST', 'POST', 'POST', 'POST'],
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
  for (const path of Object.keys(REVIEWED_MUTATIONS)) {
    const text = sources.find((source) => source.path === path)!.text;
    for (const injection of [
      '\n db.client.update({});',
      '\n const actor = request.actor;',
      '\n export async function unreviewed() {}',
    ])
      assert.ok(failures([{ path, text: text + injection }]).length > 0);
  }
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
    'PASS client structure: unchanged view/logo boundary; eight permission-protected mutation pages/actions; three exact reviewed exceptions and pinned input validation; 21 rejecting fixtures; defined RTL tokens',
  );
}
main();
