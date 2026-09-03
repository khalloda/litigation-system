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
import { t } from '../src/strings';

const root = process.cwd();
const homePath = 'src/app/page.tsx';
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

function expressionAttribute(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  name: string,
): string | null {
  const found = attribute(node, name);
  return found?.initializer && ts.isJsxExpression(found.initializer) && found.initializer.expression
    ? found.initializer.expression.getText()
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
  const homeSource = source(homePath);
  const pageSource = source(pagePath);
  const actionsSource = source(actionsPath);
  const componentSource = source(componentPath);
  const cssSource = source('src/app/users/users.module.css');
  const authCssSource = source('src/app/auth.module.css');
  assert.match(homeSource, /hasPermission\(session\.user\.role, 'usersAndRoles', 'view'\)/u);
  assert.match(homeSource, /canViewUsers \? \([\s\S]*?href="\/users"[\s\S]*?\{t\.nav\.users\}/u);
  assert.doesNotMatch(homeSource, /session\.user\.role\s*={2,3}/u);
  assert.equal((actionsSource.match(/Number\(session\.user\.id\)/gu) ?? []).length, 6);
  assert.doesNotMatch(actionsSource, /console\.|passwordHash|actorId|actorRole/iu);
  assert.doesNotMatch(componentSource, /useState[^;]*(?:password|hash)/iu);
  assert.doesNotMatch(`${pageSource}\n${componentSource}`, /audit[_ -]?(?:history|export)/iu);
  assert.match(cssSource, /:focus-visible/u);
  assert.match(authCssSource, /\.secondaryButton:focus-visible/u);
  assert.match(authCssSource, /\.navigationLink/u);
  assert.match(cssSource, /@media \(max-width:/u);
  assert.equal(
    t.users.usernameHint,
    'يجب أن يبدأ اسم المستخدم بحرف لاتيني، وأن يكون طوله الإجمالي من 3 إلى 64 حرفاً. ويجوز أن تتضمن الأحرف اللاحقة حروفاً لاتينية وأرقاماً ونقطة وشرطة وشرطة سفلية.',
  );

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
  const forms: Array<ts.JsxSelfClosingElement | ts.JsxOpeningElement> = [];
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
      if (node.tagName.getText() === 'form') forms.push(node);
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
  assert.equal(forms.length, 5);
  for (const form of forms) {
    assert.equal(expressionAttribute(form, 'action'), 'formAction');
    assert.equal(expressionAttribute(form, 'onSubmit'), 'onSubmit');
    assert.equal(expressionAttribute(form, 'aria-busy'), 'pending');
    assert.equal(attribute(form, 'method'), undefined);
  }
  assert.equal(detailCount, 4);
  assert.ok(liveRegions >= 1);
  assert.match(componentSource, /event\.preventDefault\(\)/u);
  assert.match(
    componentSource,
    /const \[state, formAction, pending\] = useActionState\(action, initialState\)/u,
  );
  assert.match(
    componentSource,
    /return \{ state, formAction, onSubmit, pending, formRef, feedbackRef \}/u,
  );
  assert.match(componentSource, /startTransition\(\(\) => formAction\(formData\)\)/u);
  assert.equal((componentSource.match(/formAction\(formData\)/gu) ?? []).length, 1);
  assert.match(componentSource, /if \(state\.revision === 0\) return/u);
  assert.match(componentSource, /\['temporaryPassword', 'confirmPassword'\] as const/u);
  assert.match(
    componentSource,
    /passwordField instanceof HTMLInputElement\) passwordField\.value = ''/u,
  );
  assert.match(componentSource, /if \(state\.kind === 'success'\) form\.reset\(\)/u);
  assert.doesNotMatch(componentSource, /state\.kind === 'error'[\s\S]{0,200}form\.reset\(\)/u);
  assert.match(componentSource, /form\.elements\.namedItem\(state\.field\)/u);
  assert.match(
    componentSource,
    /focusField instanceof HTMLElement\)[\s\S]*?focusField\.focus\(\)/u,
  );
  assert.match(componentSource, /feedbackRef\.current\?\.focus\(\)/u);
  assert.match(componentSource, /tabIndex=\{-1\}/u);
  assert.doesNotMatch(componentSource, /Date\.now\(\)/u);
  assert.match(componentSource, /account\.isLocked/u);
  assert.match(componentSource, /type="checkbox"/u);
  assert.match(componentSource, /styles\.disabled/u);

  console.log('PASS /users page plus six actions are exact usersAndRoles view/manage entries');
  console.log('PASS authenticated-home /users link is conditioned by usersAndRoles/view policy');
  console.log(
    'PASS all management forms retain the Server Action fallback plus one hydrated dispatch',
  );
  console.log(
    'PASS action actor identity is session-owned and exact lifecycle service imports cannot escape',
  );
  console.log('PASS both uncontrolled password inputs are cleared after every completed result');
  console.log(
    'PASS result handling consumes state.field and wires named-control plus summary focus fallback',
  );
  console.log(
    'PASS errors preserve non-secret form values while successful operations may reset the form',
  );
  console.log(
    'PASS live regions, programmatic summary focusability, visible-focus CSS and narrow layout are present',
  );
  console.log('PASS focused JSX inspection covers the two known multiline-literal checker gaps');
  console.log(
    'PASS no audit history, staff mutation, account deletion or password/hash output is introduced',
  );
}

main();
