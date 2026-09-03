import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { ROUTE_INVENTORY } from '../src/lib/auth/route-inventory';
import {
  discoverAuthorizationEntrypoints,
  routeInventoryFailures,
} from './lib/authorization-route-inventory';
import { discoverAuditRuntimeSources } from './lib/audit-source-inventory';
import { userManagementSourceFailures } from './lib/user-management-source';

const root = process.cwd();
const pagePath = 'src/app/users/page.tsx';
const actionsPath = 'src/app/users/actions.ts';
const componentPath = 'src/app/users/user-management.tsx';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

function attribute(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  name: string,
): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function literalAttribute(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  name: string,
): string | null {
  const found = attribute(node, name);
  return found?.initializer && ts.isStringLiteral(found.initializer)
    ? found.initializer.text
    : null;
}

function main(): void {
  const discovered = discoverAuthorizationEntrypoints(root);
  assert.deepEqual(routeInventoryFailures(discovered), []);
  const usersInventory = ROUTE_INVENTORY.filter((entry) =>
    entry.source.startsWith('src/app/users/'),
  );
  assert.equal(usersInventory.length, 7);
  const page = usersInventory.find((entry) => entry.kind === 'page');
  assert.deepEqual(page?.classification, {
    access: 'permission',
    area: 'usersAndRoles',
    action: 'view',
  });
  assert.equal(
    usersInventory.filter(
      (entry) =>
        entry.kind === 'server-action' &&
        entry.classification.access === 'permission' &&
        entry.classification.area === 'usersAndRoles' &&
        entry.classification.action === 'manage',
    ).length,
    6,
  );

  const runtimeSources = discoverAuditRuntimeSources(root);
  assert.deepEqual(userManagementSourceFailures(runtimeSources), []);
  const pageSource = source(pagePath);
  const actionsSource = source(actionsPath);
  const componentSource = source(componentPath);
  const cssSource = source('src/app/users/users.module.css');
  assert.equal((actionsSource.match(/Number\(session\.user\.id\)/gu) ?? []).length, 6);
  assert.doesNotMatch(actionsSource, /console\.|passwordHash|actorId|actorRole/iu);
  assert.doesNotMatch(componentSource, /useState[^;]*(?:password|hash)/iu);
  assert.doesNotMatch(`${pageSource}\n${componentSource}`, /audit[_ -]?(?:history|export)/iu);
  assert.match(cssSource, /:focus-visible/u);
  assert.match(cssSource, /@media \(max-width:/u);

  const parsed = ts.createSourceFile(
    componentPath,
    componentSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const passwordInputs: Array<ts.JsxSelfClosingElement | ts.JsxOpeningElement> = [];
  const visibleLiteralAttributes: string[] = [];
  const visibleText: string[] = [];
  let liveRegions = 0;
  let detailCount = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && node.text.trim()) visibleText.push(node.text.trim());
    if (
      ts.isJsxAttribute(node) &&
      ['alt', 'aria-label', 'placeholder', 'title'].includes(node.name.getText())
    ) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        visibleLiteralAttributes.push(node.initializer.text);
      }
    }
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (node.tagName.getText() === 'input' && literalAttribute(node, 'type') === 'password') {
        passwordInputs.push(node);
      }
      if (node.tagName.getText() === 'details') detailCount += 1;
      if (attribute(node, 'aria-live')) liveRegions += 1;
    }
    node.forEachChild(visit);
  };
  visit(parsed);
  assert.deepEqual(visibleText, []);
  assert.deepEqual(visibleLiteralAttributes, []);
  assert.equal(passwordInputs.length, 2);
  for (const input of passwordInputs) {
    assert.equal(literalAttribute(input, 'autoComplete'), 'new-password');
    assert.equal(attribute(input, 'value'), undefined);
    assert.equal(attribute(input, 'defaultValue'), undefined);
    assert.ok(attribute(input, 'aria-describedby'));
  }
  assert.equal(detailCount, 4);
  assert.ok(liveRegions >= 1);
  assert.match(componentSource, /formRef\.current\?\.reset\(\)/u);
  assert.doesNotMatch(componentSource, /Date\.now\(\)/u);
  assert.match(componentSource, /account\.isLocked/u);
  assert.match(componentSource, /type="checkbox"/u);
  assert.match(componentSource, /styles\.disabled/u);

  console.log('PASS /users page plus six actions are exact usersAndRoles view/manage entries');
  console.log(
    'PASS action actor identity is session-owned and exact lifecycle service imports cannot escape',
  );
  console.log(
    'PASS password inputs are uncontrolled, hidden, non-repopulating and reset after every result',
  );
  console.log(
    'PASS named confirmations, textual states, live regions, focus and narrow-screen rules are present',
  );
  console.log('PASS focused JSX inspection covers the two known multiline-literal checker gaps');
  console.log(
    'PASS no audit history, staff mutation, account deletion or password/hash output is introduced',
  );
}

main();
