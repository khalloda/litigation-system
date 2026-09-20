import assert from 'node:assert/strict';
import ts from 'typescript';
import { discoverAuditRuntimeSources } from './lib/audit-source-inventory';
import { ROUTE_INVENTORY } from '../src/lib/auth/route-inventory';
import { billingDecimal, billingPercent } from '../src/lib/billing-format';
import { billingLabelsMatch, BILLING_LABELS } from './lib/billing-labels';

function failures(path: string, text: string) {
  const errors: string[] = [];
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
      ts.isImportDeclaration(node.parent) &&
      /(?:mutations|auth\/service|user-management|audit)$/u.test(node.text)
    )
      errors.push('write dependency');
    if (
      ts.isPropertyAccessExpression(node) &&
      !node.getText(tree).startsWith('t.') &&
      /^(create|createMany|update|updateMany|delete|deleteMany|upsert|\$executeRaw|\$executeRawUnsafe|\$queryRawUnsafe)$/u.test(
        node.name.text,
      )
    )
      errors.push('write or unsafe call');
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text.startsWith('$') &&
      path !== 'src/lib/billing-query.ts'
    )
      errors.push('database outside query service');
    if (ts.isTaggedTemplateExpression(node) && node.tag.getText(tree).endsWith('.sql')) {
      if (
        /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|CALL|audit_set_\w+|\w+_edit_\w+|nextval|setval)\b/iu.test(
          node.template.getText(tree),
        )
      )
        errors.push('mutation SQL');
      if (/SELECT\s+(?:[a-z]+\.)?\*/iu.test(node.template.getText(tree)))
        errors.push('unbounded projection');
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (
    /\b(vat|report|receipt_amount|receipt_currency|legacy_receipt_currency_raw|legacy_source_payload|legacySourcePayload|Pay-Date)\b/u.test(
      text,
    )
  )
    errors.push('hidden billing field');
  return errors;
}
const files = discoverAuditRuntimeSources(process.cwd()).filter(
  (s) =>
    s.path.startsWith('src/app/billing/') ||
    /^src\/lib\/billing(?:-query|-format)?\.ts$/u.test(s.path),
);
assert.deepEqual(
  files.map((f) => f.path).sort(),
  [
    'src/app/billing/billing-detail.tsx',
    'src/app/billing/billing-fields.tsx',
    'src/app/billing/billing-list.tsx',
    'src/app/billing/error.tsx',
    'src/app/billing/invoices/[id]/page.tsx',
    'src/app/billing/invoices/page.tsx',
    'src/app/billing/loading.tsx',
    'src/app/billing/not-found.tsx',
    'src/app/billing/page.tsx',
    'src/app/billing/payments/[id]/page.tsx',
    'src/app/billing/payments/page.tsx',
    'src/lib/billing-format.ts',
    'src/lib/billing-query.ts',
    'src/lib/billing.ts',
  ].sort(),
);
for (const file of files) assert.deepEqual(failures(file.path, file.text), [], file.path);
const entries = ROUTE_INVENTORY.filter((e) => e.source.startsWith('src/app/billing/'));
assert.equal(entries.length, 5);
assert.ok(
  entries.every(
    (e) =>
      e.kind === 'page' &&
      e.classification.access === 'permission' &&
      e.classification.area === 'billing' &&
      e.classification.action === 'view',
  ),
);
for (const fixture of [
  "import x from '@/lib/auth/service';",
  'db.invoice.update({})',
  'db.$queryRawUnsafe(sql)',
  'Prisma.sql`DELETE FROM invoices`',
  'Prisma.sql`SELECT public.audit_set_migration_context()`',
  'Prisma.sql`SELECT * FROM invoices`',
  'const receipt_amount = 2',
  'db.$queryRaw(Prisma.sql`SELECT id FROM invoices`)',
])
  assert.ok(failures('src/app/billing/fixture.tsx', fixture).length, fixture);
assert.equal(billingDecimal('999999999999.99'), '999,999,999,999.99');
assert.equal(billingDecimal('-0.01'), '-0.01');
assert.equal(billingDecimal('0.00'), '0.00');
assert.equal(billingDecimal(null), null);
assert.equal(billingPercent('0.07500'), '7.5%');
assert.equal(billingPercent('0.00001'), '0.001%');
assert.equal(billingPercent('1.00000'), '100%');
assert.equal(billingPercent('0.00000'), '0%');
const labels = BILLING_LABELS.map(([list, code, label]) => ({ list, code, label }));
assert.ok(billingLabelsMatch(labels));
assert.equal(billingLabelsMatch(labels.slice(1)), false);
assert.equal(billingLabelsMatch([...labels, labels[0]!]), false);
assert.equal(billingLabelsMatch(labels.map((r) => ({ ...r, label: r.label + ' ' }))), false);
console.log(
  `PASS billing read-only closure: ${files.length} sources, 5 guarded pages, 8 rejecting static fixtures, 8 exact decimal cases, 4 label-map cases`,
);
