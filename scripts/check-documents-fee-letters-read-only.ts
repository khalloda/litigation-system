import assert from 'node:assert/strict';
import ts from 'typescript';
import { discoverAuditRuntimeSources, type AuditRuntimeSource } from './lib/audit-source-inventory';
import { ROUTE_INVENTORY } from '../src/lib/auth/route-inventory';
import {
  routeInventoryFailures,
  discoverAuthorizationEntrypoints,
} from './lib/authorization-route-inventory';
const readFiles = new Set([
  'src/app/documents/page.tsx',
  'src/app/documents/[id]/page.tsx',
  'src/app/fee-letters/page.tsx',
  'src/app/fee-letters/[id]/page.tsx',
  'src/lib/document-query.ts',
  'src/lib/documents.ts',
  'src/lib/fee-letter-query.ts',
  'src/lib/fee-letters.ts',
]);
function failures(sources: AuditRuntimeSource[]) {
  const errors: string[] = [];
  for (const { path, text } of sources.filter(
    (s) => readFiles.has(s.path) || s.path === 'src/app/documents/fixture.tsx',
  )) {
    const query = path.endsWith('-query.ts'),
      tree = ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.Latest,
        true,
        path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
    const visit = (node: ts.Node) => {
      if (
        ts.isStringLiteral(node) &&
        (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) &&
        /(?:mutations|auth\/service|user-management)$/u.test(node.text)
      )
        errors.push('mutation dependency');
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const member = ts.isPropertyAccessExpression(node)
          ? node.name.text
          : node.argumentExpression?.getText(tree).replace(/['"]/gu, '');
        if (
          member &&
          !node.getText(tree).startsWith('t.') &&
          /^(?:create|createMany|update|updateMany|upsert|delete|deleteMany|\$executeRaw|\$executeRawUnsafe|\$queryRawUnsafe)$/u.test(
            member,
          )
        )
          errors.push(`write/unsafe call ${path} ${member}`);
        if (member?.startsWith('$') && !query) errors.push('database access outside read service');
      }
      if (ts.isTaggedTemplateExpression(node) && node.tag.getText(tree).endsWith('.sql')) {
        const sql = ts.isNoSubstitutionTemplateLiteral(node.template)
          ? node.template.text
          : node.template.head.text +
            node.template.templateSpans.map((s) => s.literal.text).join(' ');
        const sqlWithoutReviewedReaders = sql.replace(
          /public\.(?:document_edit_evidence_count|fee_letter_edit_forward_quarantine_count|fee_letter_edit_reverse_quarantine_count)\b/gu,
          '',
        );
        if (
          /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|CALL|audit_set_\w+|document_edit_\w+|fee_letter_edit_\w+|matter_fee_reference_edit_\w+)\b/iu.test(
            sqlWithoutReviewedReaders,
          )
        )
          errors.push('mutation SQL');
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
  [
    'src/app/documents/page.tsx',
    'src/app/documents/[id]/page.tsx',
    'src/app/fee-letters/page.tsx',
    'src/app/fee-letters/[id]/page.tsx',
  ].includes(e.source),
);
assert.equal(entries.length, 4);
assert.ok(
  entries.every(
    (e) =>
      e.kind === 'page' &&
      e.classification.access === 'permission' &&
      e.classification.action === 'view',
  ),
);
for (const text of [
  "import x from '@/lib/document-mutations';",
  'db.document.update({})',
  'db.$executeRawUnsafe(sql)',
  'Prisma.sql`DELETE FROM documents`',
  'Prisma.sql`SELECT public.fee_letter_edit_save(1)`',
  'db.$queryRaw(Prisma.sql`SELECT * FROM documents`)',
])
  assert.ok(failures([{ path: 'src/app/documents/fixture.tsx', text }]).length, text);
console.log(
  'PASS document/fee-letter read-only closure, four guarded pages, six rejecting fixtures',
);
