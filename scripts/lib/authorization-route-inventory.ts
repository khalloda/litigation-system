import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  AUTHORIZATION_SOURCE_EXTENSIONS,
  AUTHORIZATION_SOURCE_EXCLUSIONS,
  NEXT_DEFAULT_PAGE_EXTENSIONS,
  PROXY_INFRASTRUCTURE_EXEMPTIONS,
  ROUTE_INVENTORY,
  type RouteInventoryEntry,
} from '../../src/lib/auth/route-inventory';

const AUTHORIZATION_MODULE = '@/lib/auth/authorization';
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const NON_PROJECT_SOURCE_DIRECTORIES = new Set(['.git', '.next', 'node_modules']);
const INSPECTED_SOURCE_EXTENSIONS = new Set<string>(AUTHORIZATION_SOURCE_EXTENSIONS);
const NEXT_CONFIG_FILES = ['next.config.js', 'next.config.mjs', 'next.config.ts'] as const;

type EntrypointForm =
  | 'page-function'
  | 'route-function'
  | 'route-variable'
  | 'route-binding'
  | 'route-export-alias'
  | 'module-server-function'
  | 'module-server-variable'
  | 'module-server-export-alias'
  | 'inline-server-function';

export type DiscoveredEntrypoint = {
  key: string;
  kind: RouteInventoryEntry['kind'];
  source: string;
  exportName?: string;
  form: EntrypointForm;
  sourceFile: ts.SourceFile;
  node: ts.Node;
};

function normalized(relativePath: string): string {
  return relativePath.replaceAll(path.sep, '/');
}

function isExcludedSource(source: string): boolean {
  return AUTHORIZATION_SOURCE_EXCLUSIONS.some((prefix) => source.startsWith(prefix));
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const source = normalized(path.relative(root, absolute));
      if (entry.isDirectory()) {
        if (!NON_PROJECT_SOURCE_DIRECTORIES.has(entry.name) && !isExcludedSource(`${source}/`)) {
          visit(absolute);
        }
      } else if (
        INSPECTED_SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) &&
        !isExcludedSource(source)
      ) {
        files.push(absolute);
      }
    }
  };
  visit(root);
  return files.sort();
}

function scriptKind(fileName: string): ts.ScriptKind {
  switch (path.extname(fileName).toLowerCase()) {
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.ts':
    case '.mts':
    case '.cts':
      return ts.ScriptKind.TS;
    default:
      return ts.ScriptKind.Unknown;
  }
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(
    ts.getModifiers(node as ts.HasModifiers)?.some((modifier) => modifier.kind === kind),
  );
}

function hasUseServerDirective(body: ts.Block | undefined): boolean {
  const first = body?.statements[0];
  return Boolean(
    first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use server',
  );
}

function moduleHasUseServerDirective(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === 'use server') return true;
  }
  return false;
}

function topLevelDeclarations(sourceFile: ts.SourceFile): ReadonlyMap<string, ts.Node> {
  const declarations = new Map<string, ts.Node>();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration);
      }
    }
  }
  return declarations;
}

function entrypointKey(
  kind: RouteInventoryEntry['kind'],
  source: string,
  exportName?: string,
): string {
  return `${kind}:${source}${exportName ? `#${exportName}` : ''}`;
}

function pageNode(sourceFile: ts.SourceFile): ts.Node {
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ) {
      return statement;
    }
  }
  const declarations = topLevelDeclarations(sourceFile);
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      return declarations.get(statement.expression.text) ?? statement;
    }
  }
  return sourceFile;
}

function routeHandlers(source: string, sourceFile: ts.SourceFile): DiscoveredEntrypoint[] {
  const entries: DiscoveredEntrypoint[] = [];
  const declarations = topLevelDeclarations(sourceFile);
  const add = (exportName: string, node: ts.Node, form: EntrypointForm) => {
    if (!HTTP_METHODS.has(exportName)) return;
    entries.push({
      key: entrypointKey('route', source, exportName),
      kind: 'route',
      source,
      exportName,
      form,
      sourceFile,
      node,
    });
  };

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      add(statement.name.text, statement, 'route-function');
    } else if (
      ts.isVariableStatement(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          add(declaration.name.text, declaration, 'route-variable');
        } else if (ts.isObjectBindingPattern(declaration.name)) {
          for (const element of declaration.name.elements) {
            if (ts.isIdentifier(element.name)) {
              add(element.name.text, declaration, 'route-binding');
            }
          }
        }
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        const exportName = element.name.text;
        const localName = element.propertyName?.text ?? exportName;
        add(exportName, declarations.get(localName) ?? element, 'route-export-alias');
      }
    }
  }

  if (entries.length === 0) {
    entries.push({
      key: entrypointKey('route', source),
      kind: 'route',
      source,
      form: 'route-function',
      sourceFile,
      node: sourceFile,
    });
  }
  return entries;
}

function moduleServerActions(source: string, sourceFile: ts.SourceFile): DiscoveredEntrypoint[] {
  const entries: DiscoveredEntrypoint[] = [];
  const declarations = topLevelDeclarations(sourceFile);
  const add = (exportName: string, node: ts.Node, form: EntrypointForm) => {
    entries.push({
      key: entrypointKey('server-action', source, exportName),
      kind: 'server-action',
      source,
      exportName,
      form,
      sourceFile,
      node,
    });
  };

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      const exportName = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
        ? 'default'
        : statement.name?.text;
      if (exportName) add(exportName, statement, 'module-server-function');
    } else if (
      ts.isVariableStatement(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          add(declaration.name.text, declaration, 'module-server-variable');
        } else {
          const position = sourceFile.getLineAndCharacterOfPosition(
            declaration.getStart(sourceFile),
          );
          add(
            `<unsupported-binding@${position.line + 1}:${position.character + 1}>`,
            declaration,
            'module-server-variable',
          );
        }
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        const exportName = element.name.text;
        const localName = element.propertyName?.text ?? exportName;
        const declaration = declarations.get(localName);
        add(exportName, declaration ?? element, 'module-server-export-alias');
      }
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      const position = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile));
      add(
        `<unsupported-re-export@${position.line + 1}:${position.character + 1}>`,
        statement,
        'module-server-variable',
      );
    } else if (ts.isExportAssignment(statement)) {
      const node = ts.isIdentifier(statement.expression)
        ? (declarations.get(statement.expression.text) ?? statement)
        : statement;
      add('default', node, 'module-server-variable');
    }
  }
  return entries;
}

function inlineServerActions(source: string, sourceFile: ts.SourceFile): DiscoveredEntrypoint[] {
  const entries: DiscoveredEntrypoint[] = [];
  const add = (exportName: string, node: ts.Node) => {
    entries.push({
      key: entrypointKey('server-action', source, exportName),
      kind: 'server-action',
      source,
      exportName,
      form: 'inline-server-function',
      sourceFile,
      node,
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && hasUseServerDirective(node.body)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      add(node.name?.text ?? `<anonymous@${position.line + 1}:${position.character + 1}>`, node);
      return;
    }
    if (
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      ts.isBlock(node.body) &&
      hasUseServerDirective(node.body)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const parentName =
        ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)
          ? node.parent.name.text
          : `<anonymous@${position.line + 1}:${position.character + 1}>`;
      add(parentName, node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return entries;
}

type PageExtensionPolicy = {
  extensions: readonly string[];
  failures: readonly string[];
};

function resolvedConfigObject(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | null {
  const declarations = topLevelDeclarations(sourceFile);
  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement) || statement.isExportEquals) continue;
    const expression = ts.isIdentifier(statement.expression)
      ? declarations.get(statement.expression.text)
      : statement.expression;
    if (expression && ts.isVariableDeclaration(expression)) {
      return expression.initializer && ts.isObjectLiteralExpression(expression.initializer)
        ? expression.initializer
        : null;
    }
    return expression && ts.isObjectLiteralExpression(expression) ? expression : null;
  }
  return null;
}

function nextPageExtensionPolicy(root: string): PageExtensionPolicy {
  const configFiles = NEXT_CONFIG_FILES.filter((fileName) => existsSync(path.join(root, fileName)));
  if (configFiles.length === 0) {
    return { extensions: NEXT_DEFAULT_PAGE_EXTENSIONS, failures: [] };
  }
  if (configFiles.length !== 1) {
    return {
      extensions: NEXT_DEFAULT_PAGE_EXTENSIONS,
      failures: [
        `authorization discovery requires exactly one Next.js config: ${configFiles.join(', ')}`,
      ],
    };
  }
  const configFile = configFiles[0]!;
  const configPath = path.join(root, configFile);
  const sourceFile = ts.createSourceFile(
    configPath,
    readFileSync(configPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(configPath),
  );
  const config = resolvedConfigObject(sourceFile);
  if (!config) {
    return {
      extensions: NEXT_DEFAULT_PAGE_EXTENSIONS,
      failures: [
        `${configFile} must default-export one statically analyzable object so authorization page extensions can be proved`,
      ],
    };
  }
  if (config.properties.some((property) => ts.isSpreadAssignment(property))) {
    return {
      extensions: NEXT_DEFAULT_PAGE_EXTENSIONS,
      failures: [
        `${configFile} cannot spread configuration into the default object because pageExtensions would be unprovable`,
      ],
    };
  }
  const extensionProperties = config.properties.filter(
    (property) => property.name && propertyName(property.name) === 'pageExtensions',
  );
  if (extensionProperties.length === 0) {
    return { extensions: NEXT_DEFAULT_PAGE_EXTENSIONS, failures: [] };
  }
  if (extensionProperties.length !== 1) {
    return {
      extensions: NEXT_DEFAULT_PAGE_EXTENSIONS,
      failures: [`${configFile} must declare pageExtensions at most once`],
    };
  }
  const extensionProperty = extensionProperties[0]!;
  if (!ts.isPropertyAssignment(extensionProperty)) {
    return {
      extensions: NEXT_DEFAULT_PAGE_EXTENSIONS,
      failures: [`${configFile} pageExtensions must be a static property assignment`],
    };
  }
  const initializer = extensionProperty.initializer;
  if (
    !ts.isArrayLiteralExpression(initializer) ||
    initializer.elements.length === 0 ||
    initializer.elements.some((element) => !ts.isStringLiteral(element))
  ) {
    return {
      extensions: NEXT_DEFAULT_PAGE_EXTENSIONS,
      failures: [
        `${configFile} pageExtensions must be one non-empty array of string literals for authorization discovery`,
      ],
    };
  }
  const extensions = initializer.elements.map((element) => (element as ts.StringLiteral).text);
  const failures: string[] = [];
  if (new Set(extensions).size !== extensions.length) {
    failures.push(`${configFile} pageExtensions must not contain duplicates`);
  }
  for (const extension of extensions) {
    if (!INSPECTED_SOURCE_EXTENSIONS.has(`.${extension}`)) {
      failures.push(
        `${configFile} page extension is not supported by the authorization checker: ${extension}`,
      );
    }
  }
  return { extensions, failures };
}

function existingDirectory(root: string, relativePath: string): boolean {
  const absolute = path.join(root, relativePath);
  return existsSync(absolute) && statSync(absolute).isDirectory();
}

export function authorizationSourcePolicyFailures(root: string): string[] {
  const failures: string[] = [];
  if (existingDirectory(root, 'app')) {
    failures.push(
      'root app/ is forbidden: this App Router-only project uses src/app, and Next.js ignores src/app when root app exists',
    );
  }
  if (existingDirectory(root, 'pages')) {
    failures.push(
      'root pages/ is forbidden: this App Router-only project permits routing only under src/app',
    );
  }
  if (existingDirectory(root, 'src/pages')) {
    failures.push(
      'src/pages/ is forbidden: this App Router-only project permits routing only under src/app',
    );
  }
  failures.push(...nextPageExtensionPolicy(root).failures);
  return failures;
}

export function discoverAuthorizationEntrypoints(root: string): DiscoveredEntrypoint[] {
  const discovered: DiscoveredEntrypoint[] = [];
  const pageExtensions = new Set(nextPageExtensionPolicy(root).extensions);
  for (const absolute of sourceFiles(root)) {
    const source = normalized(path.relative(root, absolute));
    const text = readFileSync(absolute, 'utf8');
    const sourceFile = ts.createSourceFile(
      absolute,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(absolute),
    );
    const base = path.basename(absolute);
    const extension = path.extname(base).slice(1).toLowerCase();
    if (
      source.startsWith('src/app/') &&
      base === `page.${extension}` &&
      pageExtensions.has(extension)
    ) {
      discovered.push({
        key: entrypointKey('page', source),
        kind: 'page',
        source,
        form: 'page-function',
        sourceFile,
        node: pageNode(sourceFile),
      });
    }
    if (
      source.startsWith('src/app/') &&
      base === `route.${extension}` &&
      pageExtensions.has(extension)
    ) {
      discovered.push(...routeHandlers(source, sourceFile));
    }
    if (moduleHasUseServerDirective(sourceFile)) {
      discovered.push(...moduleServerActions(source, sourceFile));
    } else {
      discovered.push(...inlineServerActions(source, sourceFile));
    }
  }
  return discovered.sort((left, right) => left.key.localeCompare(right.key));
}

function bindingContainsName(
  name: ts.BindingName | ts.DeclarationName | undefined,
  value: string,
): boolean {
  if (!name) return false;
  if (ts.isIdentifier(name)) return name.text === value;
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.some((element) =>
      ts.isBindingElement(element) ? bindingContainsName(element.name, value) : false,
    );
  }
  return false;
}

function containsBinding(node: ts.Node, name: string): boolean {
  let found = false;
  const visit = (current: ts.Node) => {
    if (found) return;
    if (
      (ts.isVariableDeclaration(current) || ts.isParameter(current)) &&
      bindingContainsName(current.name, name)
    ) {
      found = true;
      return;
    }
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isClassDeclaration(current)) &&
      current !== node &&
      current.name?.text === name
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function importFailures(
  entry: DiscoveredEntrypoint,
  moduleName: string,
  importedName: string,
): string[] {
  let exactImports = 0;
  for (const statement of entry.sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleName ||
      statement.importClause?.isTypeOnly ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      if (
        !element.isTypeOnly &&
        element.name.text === importedName &&
        (element.propertyName?.text ?? importedName) === importedName
      ) {
        exactImports += 1;
      }
    }
  }
  const failures: string[] = [];
  if (exactImports !== 1) {
    failures.push(
      `expected one unaliased import of ${importedName} from ${moduleName}: ${entry.key}`,
    );
  }
  if (containsBinding(entry.node, importedName)) {
    failures.push(`authoritative binding ${importedName} is locally shadowed: ${entry.key}`);
  }
  return failures;
}

function functionBody(node: ts.Node): ts.Block | null {
  if (
    (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
    node.body &&
    ts.isBlock(node.body)
  ) {
    return node.body;
  }
  return null;
}

function firstExecutableStatement(body: ts.Block): ts.Statement | undefined {
  return body.statements.find(
    (statement) =>
      !(
        ts.isExpressionStatement(statement) &&
        ts.isStringLiteral(statement.expression) &&
        statement.expression.text === 'use server'
      ),
  );
}

function awaitedCallFromAssignment(statement: ts.Statement | undefined): ts.CallExpression | null {
  if (
    !statement ||
    !ts.isVariableStatement(statement) ||
    (statement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
    statement.declarationList.declarations.length !== 1
  ) {
    return null;
  }
  const declaration = statement.declarationList.declarations[0];
  if (
    !declaration ||
    !ts.isIdentifier(declaration.name) ||
    !declaration.initializer ||
    !ts.isAwaitExpression(declaration.initializer) ||
    !ts.isCallExpression(declaration.initializer.expression)
  ) {
    return null;
  }
  return declaration.initializer.expression;
}

function awaitedCallFromExpression(statement: ts.Statement | undefined): ts.CallExpression | null {
  if (
    !statement ||
    !ts.isExpressionStatement(statement) ||
    !ts.isAwaitExpression(statement.expression) ||
    !ts.isCallExpression(statement.expression.expression)
  ) {
    return null;
  }
  return statement.expression.expression;
}

function isDirectIdentifierCall(call: ts.CallExpression | null, name: string): boolean {
  return Boolean(call && ts.isIdentifier(call.expression) && call.expression.text === name);
}

function containsAwaitedCall(node: ts.Node, name: string): boolean {
  let found = false;
  const visit = (current: ts.Node) => {
    if (
      ts.isAwaitExpression(current) &&
      ts.isCallExpression(current.expression) &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === name
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function propertyName(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return null;
}

function permissionArgumentFailures(
  node: ts.Expression | undefined,
  expected: Extract<RouteInventoryEntry['classification'], { access: 'permission' }>,
  key: string,
): string[] {
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return [`permission must be one static object literal: ${key}`];
  }
  if (node.properties.length !== 2) {
    return [`permission object must contain exactly area and action: ${key}`];
  }
  const values = new Map<string, string>();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      return [`permission object cannot use spreads, methods or shorthand: ${key}`];
    }
    const name = propertyName(property.name);
    if (
      !name ||
      !['area', 'action'].includes(name) ||
      !ts.isStringLiteral(property.initializer) ||
      values.has(name)
    ) {
      return [`permission area and action must be unique string literals: ${key}`];
    }
    values.set(name, property.initializer.text);
  }
  const failures: string[] = [];
  if (values.get('area') !== expected.area) {
    failures.push(`permission area differs from inventory (${values.get('area')}): ${key}`);
  }
  if (values.get('action') !== expected.action) {
    failures.push(`permission action differs from inventory (${values.get('action')}): ${key}`);
  }
  return failures;
}

function isAsyncFunctionExpression(node: ts.Expression | undefined): boolean {
  return Boolean(
    node &&
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    hasModifier(node, ts.SyntaxKind.AsyncKeyword),
  );
}

function protectedBindingMutationFailures(entry: DiscoveredEntrypoint): string[] {
  if (!entry.exportName) return [];
  const failures: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isBinaryExpression(node) &&
      ts.isIdentifier(node.left) &&
      node.left.text === entry.exportName &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      failures.push(`protected export is reassigned after its wrapper: ${entry.key}`);
      return;
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      ts.isIdentifier(node.operand) &&
      node.operand.text === entry.exportName &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
    ) {
      failures.push(`protected export is updated after its wrapper: ${entry.key}`);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(entry.sourceFile);
  return failures;
}

function permissionPageFailures(
  entry: DiscoveredEntrypoint,
  expected: Extract<RouteInventoryEntry['classification'], { access: 'permission' }>,
): string[] {
  const guard = 'requirePagePermission';
  const failures = importFailures(entry, AUTHORIZATION_MODULE, guard);
  const body = functionBody(entry.node);
  if (!body) return [...failures, `permission page must export an async function: ${entry.key}`];
  const call = awaitedCallFromAssignment(firstExecutableStatement(body));
  if (!isDirectIdentifierCall(call, guard)) {
    failures.push(`permission page must begin by capturing awaited ${guard}: ${entry.key}`);
    return failures;
  }
  if (call!.arguments.length !== 1) {
    failures.push(`permission page guard must receive one argument: ${entry.key}`);
    return failures;
  }
  failures.push(...permissionArgumentFailures(call!.arguments[0], expected, entry.key));
  return failures;
}

function permissionWrapperFailures(
  entry: DiscoveredEntrypoint,
  expected: Extract<RouteInventoryEntry['classification'], { access: 'permission' }>,
): string[] {
  const wrapper = entry.kind === 'route' ? 'withRoutePermission' : 'withActionPermission';
  const requiredForm: EntrypointForm =
    entry.kind === 'route' ? 'route-variable' : 'module-server-variable';
  const failures = importFailures(entry, AUTHORIZATION_MODULE, wrapper);
  if (entry.form !== requiredForm || !ts.isVariableDeclaration(entry.node)) {
    failures.push(
      `${entry.kind} permission entry must be exported through ${wrapper}: ${entry.key}`,
    );
    return failures;
  }
  const declarationList = entry.node.parent;
  const statement = declarationList.parent;
  if (
    !ts.isVariableDeclarationList(declarationList) ||
    (declarationList.flags & ts.NodeFlags.Const) === 0 ||
    declarationList.declarations.length !== 1 ||
    !ts.isVariableStatement(statement) ||
    !hasModifier(statement, ts.SyntaxKind.ExportKeyword)
  ) {
    failures.push(
      `${entry.kind} permission entry must be one direct immutable export const: ${entry.key}`,
    );
  }
  failures.push(...protectedBindingMutationFailures(entry));
  const initializer = entry.node.initializer;
  if (
    !initializer ||
    !ts.isCallExpression(initializer) ||
    !ts.isIdentifier(initializer.expression) ||
    initializer.expression.text !== wrapper
  ) {
    failures.push(
      `${entry.kind} permission wrapper must be the direct export initializer: ${entry.key}`,
    );
    return failures;
  }
  if (initializer.arguments.length !== 2) {
    failures.push(`${wrapper} must receive permission and one inline async handler: ${entry.key}`);
    return failures;
  }
  failures.push(...permissionArgumentFailures(initializer.arguments[0], expected, entry.key));
  if (!isAsyncFunctionExpression(initializer.arguments[1])) {
    failures.push(`${wrapper} handler must be an inline async function: ${entry.key}`);
  }
  return failures;
}

function exemptionFailures(
  entry: DiscoveredEntrypoint,
  expected: Exclude<RouteInventoryEntry['classification'], { access: 'permission' }>,
): string[] {
  const { enforcement } = expected;
  const failures = importFailures(entry, enforcement.module, enforcement.imported);
  if (enforcement.pattern === 'framework-handlers') {
    if (
      entry.form !== 'route-binding' ||
      !ts.isVariableDeclaration(entry.node) ||
      !ts.isObjectBindingPattern(entry.node.name) ||
      !entry.node.name.elements.some(
        (element) => ts.isIdentifier(element.name) && element.name.text === entry.exportName,
      ) ||
      !entry.node.initializer ||
      !ts.isIdentifier(entry.node.initializer) ||
      entry.node.initializer.text !== enforcement.imported
    ) {
      failures.push(
        `framework handler must be exported directly from Auth.js handlers: ${entry.key}`,
      );
    }
    return failures;
  }
  const body = functionBody(entry.node);
  if (!body) return [...failures, `exempt entrypoint must be a function: ${entry.key}`];
  if (enforcement.pattern === 'awaited-call') {
    if (!containsAwaitedCall(entry.node, enforcement.imported)) {
      failures.push(`missing awaited ${enforcement.imported} call: ${entry.key}`);
    }
    return failures;
  }
  const statement = firstExecutableStatement(body);
  const call =
    enforcement.pattern === 'first-awaited-assignment'
      ? awaitedCallFromAssignment(statement)
      : awaitedCallFromExpression(statement);
  if (!isDirectIdentifierCall(call, enforcement.imported)) {
    failures.push(
      `${enforcement.imported} must be the first awaited enforcement statement: ${entry.key}`,
    );
  }
  return failures;
}

export function routeInventoryFailures(
  discovered: readonly DiscoveredEntrypoint[],
  inventory: readonly RouteInventoryEntry[] = ROUTE_INVENTORY,
): string[] {
  const failures: string[] = [];
  const discoveredByKey = new Map<string, DiscoveredEntrypoint>();
  for (const entry of discovered) {
    if (discoveredByKey.has(entry.key)) {
      failures.push(`duplicate discovered entrypoint: ${entry.key}`);
    }
    discoveredByKey.set(entry.key, entry);
  }
  const inventoryByKey = new Map<string, RouteInventoryEntry>();
  for (const entry of inventory) {
    const key = entrypointKey(entry.kind, entry.source, entry.exportName);
    if (inventoryByKey.has(key)) failures.push(`duplicate inventory entry: ${key}`);
    inventoryByKey.set(key, entry);
  }

  for (const entry of discovered) {
    if (!inventoryByKey.has(entry.key)) failures.push(`unclassified entrypoint: ${entry.key}`);
  }
  for (const [key, expected] of inventoryByKey) {
    const actual = discoveredByKey.get(key);
    if (!actual) {
      failures.push(`inventoried entrypoint missing: ${key}`);
      continue;
    }
    if (expected.classification.access === 'permission') {
      failures.push(
        ...(actual.kind === 'page'
          ? permissionPageFailures(actual, expected.classification)
          : permissionWrapperFailures(actual, expected.classification)),
      );
    } else {
      failures.push(...exemptionFailures(actual, expected.classification));
    }
  }
  return failures;
}

export function authorizationSourceExclusionFailures(
  exclusions: readonly string[] = AUTHORIZATION_SOURCE_EXCLUSIONS,
): string[] {
  return exclusions.length === 1 && exclusions[0] === 'src/generated/prisma/'
    ? []
    : [
        `authorization source exclusions must be exactly src/generated/prisma/: ${exclusions.join(', ') || '<none>'}`,
      ];
}

export function proxyExemptionFailures(root: string): string[] {
  const source = readFileSync(path.join(root, 'proxy.ts'), 'utf8');
  return PROXY_INFRASTRUCTURE_EXEMPTIONS.filter((item) => !source.includes(item)).map(
    (item) => `proxy infrastructure exemption missing: ${item}`,
  );
}
