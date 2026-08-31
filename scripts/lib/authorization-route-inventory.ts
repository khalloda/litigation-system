import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  PROXY_INFRASTRUCTURE_EXEMPTIONS,
  ROUTE_INVENTORY,
  type RouteInventoryEntry,
} from '../../src/lib/auth/route-inventory';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export type DiscoveredEntrypoint = {
  key: string;
  kind: RouteInventoryEntry['kind'];
  source: string;
  exportName?: string;
  calls: ReadonlySet<string>;
};

function normalized(relativePath: string): string {
  return relativePath.replaceAll(path.sep, '/');
}

function sourceFiles(root: string): string[] {
  const start = path.join(root, 'src', 'app');
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:ts|tsx)$/u.test(entry.name)) files.push(absolute);
    }
  };
  visit(start);
  return files.sort();
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

function callNames(sourceFile: ts.Node): ReadonlySet<string> {
  const calls = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) calls.add(node.expression.text);
      else if (ts.isPropertyAccessExpression(node.expression)) calls.add(node.expression.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return calls;
}

function isHttpMethod(value: string): boolean {
  return HTTP_METHODS.has(value);
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

function resolvedCallNames(
  node: ts.Node,
  declarations: ReadonlyMap<string, ts.Node>,
): ReadonlySet<string> {
  const calls = new Set(callNames(node));
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.initializer)) {
    const target = declarations.get(node.initializer.text);
    if (target) for (const call of callNames(target)) calls.add(call);
  }
  return calls;
}

function entrypointKey(
  kind: RouteInventoryEntry['kind'],
  source: string,
  exportName?: string,
): string {
  return `${kind}:${source}${exportName ? `#${exportName}` : ''}`;
}

export function discoverAuthorizationEntrypoints(root: string): DiscoveredEntrypoint[] {
  const discovered: DiscoveredEntrypoint[] = [];
  for (const absolute of sourceFiles(root)) {
    const source = normalized(path.relative(root, absolute));
    const text = readFileSync(absolute, 'utf8');
    const sourceFile = ts.createSourceFile(
      absolute,
      text,
      ts.ScriptTarget.Latest,
      true,
      absolute.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const base = path.basename(absolute);
    if (base === 'page.tsx' || base === 'page.ts') {
      discovered.push({
        key: entrypointKey('page', source),
        kind: 'page',
        source,
        calls: callNames(sourceFile),
      });
    }
    if (base === 'route.tsx' || base === 'route.ts') {
      const declarations = topLevelDeclarations(sourceFile);
      let handlers = 0;
      const addHandler = (exportName: string, node: ts.Node) => {
        if (!isHttpMethod(exportName)) return;
        handlers += 1;
        discovered.push({
          key: entrypointKey('route', source, exportName),
          kind: 'route',
          source,
          exportName,
          calls: resolvedCallNames(node, declarations),
        });
      };
      for (const statement of sourceFile.statements) {
        if (
          ts.isFunctionDeclaration(statement) &&
          statement.name &&
          hasModifier(statement, ts.SyntaxKind.ExportKeyword)
        ) {
          addHandler(statement.name.text, statement);
        } else if (
          ts.isVariableStatement(statement) &&
          hasModifier(statement, ts.SyntaxKind.ExportKeyword)
        ) {
          for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name)) {
              addHandler(declaration.name.text, declaration);
            } else if (ts.isObjectBindingPattern(declaration.name)) {
              for (const element of declaration.name.elements) {
                if (ts.isIdentifier(element.name)) addHandler(element.name.text, declaration);
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
            addHandler(exportName, declarations.get(localName) ?? element);
          }
        }
      }
      if (handlers === 0) {
        discovered.push({
          key: entrypointKey('route', source),
          kind: 'route',
          source,
          calls: callNames(sourceFile),
        });
      }
    }

    const moduleIsServer = sourceFile.statements.some(
      (statement, index) =>
        index === 0 &&
        ts.isExpressionStatement(statement) &&
        ts.isStringLiteral(statement.expression) &&
        statement.expression.text === 'use server',
    );
    if (moduleIsServer) {
      for (const statement of sourceFile.statements) {
        if (
          ts.isFunctionDeclaration(statement) &&
          statement.name &&
          hasModifier(statement, ts.SyntaxKind.ExportKeyword)
        ) {
          const exportName = statement.name.text;
          discovered.push({
            key: entrypointKey('server-action', source, exportName),
            kind: 'server-action',
            source,
            exportName,
            calls: callNames(statement),
          });
        } else if (
          ts.isVariableStatement(statement) &&
          hasModifier(statement, ts.SyntaxKind.ExportKeyword)
        ) {
          for (const declaration of statement.declarationList.declarations) {
            if (
              ts.isIdentifier(declaration.name) &&
              declaration.initializer &&
              (ts.isArrowFunction(declaration.initializer) ||
                ts.isFunctionExpression(declaration.initializer))
            ) {
              const exportName = declaration.name.text;
              discovered.push({
                key: entrypointKey('server-action', source, exportName),
                kind: 'server-action',
                source,
                exportName,
                calls: callNames(declaration.initializer),
              });
            }
          }
        }
      }
    }

    const visitInlineActions = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name && hasUseServerDirective(node.body)) {
        const exportName = node.name.text;
        discovered.push({
          key: entrypointKey('server-action', source, exportName),
          kind: 'server-action',
          source,
          exportName,
          calls: callNames(node),
        });
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
        ts.isBlock(node.initializer.body) &&
        hasUseServerDirective(node.initializer.body)
      ) {
        const exportName = node.name.text;
        discovered.push({
          key: entrypointKey('server-action', source, exportName),
          kind: 'server-action',
          source,
          exportName,
          calls: callNames(node.initializer),
        });
      }
      ts.forEachChild(node, visitInlineActions);
    };
    visitInlineActions(sourceFile);
  }
  return discovered.sort((left, right) => left.key.localeCompare(right.key));
}

export function routeInventoryFailures(
  discovered: readonly DiscoveredEntrypoint[],
  inventory: readonly RouteInventoryEntry[] = ROUTE_INVENTORY,
): string[] {
  const failures: string[] = [];
  const discoveredByKey = new Map<string, DiscoveredEntrypoint>();
  for (const entry of discovered) {
    if (discoveredByKey.has(entry.key))
      failures.push(`duplicate discovered entrypoint: ${entry.key}`);
    discoveredByKey.set(entry.key, entry);
  }
  const inventoryByKey = new Map<string, RouteInventoryEntry>();

  for (const entry of inventory) {
    const key = entrypointKey(entry.kind, entry.source, entry.exportName);
    if (inventoryByKey.has(key)) failures.push(`duplicate inventory entry: ${key}`);
    inventoryByKey.set(key, entry);
    if (entry.classification.access === 'permission') {
      const required =
        entry.kind === 'page'
          ? 'requirePagePermission'
          : entry.kind === 'route'
            ? 'authorizeRoutePermission'
            : 'requireActionPermission';
      if (entry.enforcementCall !== required) {
        failures.push(`permission entry lacks authoritative guard ${required}: ${key}`);
      }
    }
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
    if (expected.enforcementCall && !actual.calls.has(expected.enforcementCall)) {
      failures.push(`missing server enforcement ${expected.enforcementCall}: ${key}`);
    }
  }
  return failures;
}

export function proxyExemptionFailures(root: string): string[] {
  const source = readFileSync(path.join(root, 'proxy.ts'), 'utf8');
  return PROXY_INFRASTRUCTURE_EXEMPTIONS.filter((item) => !source.includes(item)).map(
    (item) => `proxy infrastructure exemption missing: ${item}`,
  );
}
