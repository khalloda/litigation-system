import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const AUDIT_RUNTIME_SOURCE_EXTENSIONS = Object.freeze([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.mts',
  '.cjs',
  '.cts',
]);

export const AUDIT_GATEWAY = 'src/lib/audit.ts';
export const AUDIT_AUTH_SERVICE = 'src/lib/auth/service.ts';

const AUDIT_MODULE = 'src/lib/audit';
const AUTH_SERVICE_MODULE = 'src/lib/auth/service';
const GENERATED_EXCLUSION = 'src/generated/prisma/';
const CONTEXT_HELPERS = new Set([
  'setHumanAuditContext',
  'setAuthenticationAuditContext',
  'setAdministrationAuditContext',
  'setMigrationAuditContext',
]);
const AUTH_SERVICE_HELPERS = new Set([
  'setHumanAuditContext',
  'setAuthenticationAuditContext',
  'setAdministrationAuditContext',
]);
const SYSTEM_ACTOR_KEYS = new Set([
  'system_migration',
  'system_authentication',
  'system_administration',
]);
const CONTROLLED_LOCAL_ADMINISTRATION = 'setApprovedAccountPassword';
const LOW_LEVEL_PATTERN =
  /audit_set_(?:human|authentication|administration|migration)_context|audit_current_actor_id|litigation\.audit_actor_id|set_config|\bset\s+(?:local|session)\b/iu;

export type AuditRuntimeSource = Readonly<{
  path: string;
  text: string;
}>;

function normalized(value: string): string {
  return value.replaceAll(path.sep, '/');
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

function withoutSourceExtension(value: string): string {
  const extension = path.posix.extname(value).toLowerCase();
  return AUDIT_RUNTIME_SOURCE_EXTENSIONS.includes(extension)
    ? value.slice(0, -extension.length)
    : value;
}

function moduleTarget(sourcePath: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return withoutSourceExtension(`src/${specifier.slice(2)}`);
  if (!specifier.startsWith('.')) return null;
  return withoutSourceExtension(
    path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier)),
  );
}

function isAuditModule(sourcePath: string, specifier: string): boolean {
  return moduleTarget(sourcePath, specifier) === AUDIT_MODULE;
}

function isAuthServiceModule(sourcePath: string, specifier: string): boolean {
  return moduleTarget(sourcePath, specifier) === AUTH_SERVICE_MODULE;
}

function sourceLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${position.line + 1}:${position.character + 1}`;
}

function containingFunctionName(node: ts.Node): string | null {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      current.parent &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }
  }
  return null;
}

function literalText(node: ts.Node): string | null {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    return node.text;
  }
  return null;
}

function staticString(node: ts.Node): string | null {
  const literal = literalText(node);
  if (literal !== null && !ts.isTemplateHead(node) && !ts.isTemplateMiddle(node)) {
    return literal;
  }
  if (ts.isParenthesizedExpression(node)) return staticString(node.expression);
  if (
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return staticString(node.expression);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(node.left);
    const right = staticString(node.right);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const expression = staticString(span.expression);
      if (expression === null) return null;
      value += expression + span.literal.text;
    }
    return value;
  }
  return null;
}

function joinedLiteralFragments(node: ts.Node): string {
  const fragments: string[] = [];
  const visit = (current: ts.Node): void => {
    const literal = literalText(current);
    if (literal !== null) fragments.push(literal);
    current.forEachChild(visit);
  };
  visit(node);
  return fragments.join('');
}

function importSpecifier(node: ts.CallExpression): string | null {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1) {
    return staticString(node.arguments[0]!);
  }
  if (
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require' &&
    node.arguments.length === 1
  ) {
    return staticString(node.arguments[0]!);
  }
  return null;
}

type HelperCall = Readonly<{
  helper: string;
  functionName: string | null;
  argumentsText: string;
}>;

export function discoverAuditRuntimeSources(root: string): AuditRuntimeSource[] {
  const sourceRoot = path.join(root, 'src');
  const sources: AuditRuntimeSource[] = [];
  const extensions = new Set(AUDIT_RUNTIME_SOURCE_EXTENSIONS);
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = normalized(path.relative(root, absolute));
      if (entry.isSymbolicLink()) {
        throw new Error(`runtime source inventory refuses symbolic link ${relative}`);
      }
      if (entry.isDirectory()) {
        if (!`${relative}/`.startsWith(GENERATED_EXCLUSION)) visit(absolute);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        sources.push({ path: relative, text: readFileSync(absolute, 'utf8') });
      }
    }
  };
  visit(sourceRoot);
  return sources.sort((left, right) => left.path.localeCompare(right.path));
}

export function auditRuntimeSourceFailures(
  sources: readonly AuditRuntimeSource[],
  options: { enforceReviewedCallsites?: boolean } = {},
): string[] {
  const enforceReviewedCallsites = options.enforceReviewedCallsites ?? true;
  const failures = new Set<string>();
  const sourcePaths = new Set(sources.map((source) => source.path));
  const authCalls: HelperCall[] = [];
  const authImports = new Set<string>();

  for (const source of sources) {
    const sourceFile = ts.createSourceFile(
      source.path,
      source.text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(source.path),
    );
    const isGateway = source.path === AUDIT_GATEWAY;
    const isAuthService = source.path === AUDIT_AUTH_SERVICE;
    const add = (node: ts.Node, message: string): void => {
      failures.add(`${source.path}:${sourceLocation(sourceFile, node)} ${message}`);
    };

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (isAuditModule(source.path, specifier)) {
          if (!isAuthService) {
            add(node, 'audit context imports are allowed only in the reviewed auth service');
          } else if (
            !node.importClause?.namedBindings ||
            !ts.isNamedImports(node.importClause.namedBindings)
          ) {
            add(node, 'the reviewed auth service must use direct named audit imports');
          } else {
            for (const element of node.importClause.namedBindings.elements) {
              const imported = element.propertyName?.text ?? element.name.text;
              if (element.propertyName || !AUTH_SERVICE_HELPERS.has(imported)) {
                add(element, `unapproved or aliased audit import ${element.getText(sourceFile)}`);
              } else {
                authImports.add(imported);
              }
            }
          }
        }
        if (!isAuthService && isAuthServiceModule(source.path, specifier)) {
          const bindings = node.importClause?.namedBindings;
          if (!bindings || ts.isNamespaceImport(bindings)) {
            add(node, 'runtime auth-service access must use reviewed direct named imports');
          } else {
            for (const element of bindings.elements) {
              const imported = element.propertyName?.text ?? element.name.text;
              if (imported === CONTROLLED_LOCAL_ADMINISTRATION) {
                add(element, 'controlled local password administration is not a runtime API');
              }
            }
          }
        }
      }

      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        isAuditModule(source.path, node.moduleSpecifier.text)
      ) {
        add(node, 're-exporting the audit gateway is prohibited');
      }
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        isAuthServiceModule(source.path, node.moduleSpecifier.text)
      ) {
        add(node, 're-exporting the reviewed authentication service is prohibited');
      }

      if (ts.isCallExpression(node)) {
        const dynamicSpecifier = importSpecifier(node);
        if (dynamicSpecifier && isAuditModule(source.path, dynamicSpecifier)) {
          add(node, 'dynamic or CommonJS audit gateway access is prohibited');
        }
        if (dynamicSpecifier && isAuthServiceModule(source.path, dynamicSpecifier)) {
          add(node, 'dynamic or CommonJS authentication-service access is prohibited');
        }

        let helper: string | null = null;
        if (ts.isIdentifier(node.expression) && CONTEXT_HELPERS.has(node.expression.text)) {
          helper = node.expression.text;
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          CONTEXT_HELPERS.has(node.expression.name.text)
        ) {
          helper = node.expression.name.text;
        } else if (ts.isElementAccessExpression(node.expression)) {
          const argument = node.expression.argumentExpression;
          const computedHelper = argument ? staticString(argument) : null;
          if (computedHelper && CONTEXT_HELPERS.has(computedHelper)) {
            helper = computedHelper;
          }
        }
        if (helper) {
          if (isAuthService) {
            authCalls.push({
              helper,
              functionName: containingFunctionName(node),
              argumentsText: node.arguments
                .map((argument) => argument.getText(sourceFile).replace(/\s+/gu, ''))
                .join(','),
            });
          } else if (!isGateway) {
            add(node, `${helper} is outside the reviewed call-site inventory`);
          }
        }

        if (!isGateway && LOW_LEVEL_PATTERN.test(joinedLiteralFragments(node))) {
          add(node, 'low-level audit function or GUC access is allowed only in the audit gateway');
        }
      }

      if (ts.isTaggedTemplateExpression(node) && !isGateway) {
        if (LOW_LEVEL_PATTERN.test(joinedLiteralFragments(node.template))) {
          add(node, 'low-level audit SQL is allowed only in the audit gateway');
        }
      }

      const literal = literalText(node);
      if (literal !== null) {
        if (SYSTEM_ACTOR_KEYS.has(literal)) {
          add(node, `direct system actor selection ${literal} is prohibited in runtime source`);
        }
        if (!isGateway && LOW_LEVEL_PATTERN.test(literal)) {
          add(node, 'low-level audit token is allowed only in the audit gateway');
        }
      }

      if (ts.isBinaryExpression(node) || ts.isTemplateExpression(node)) {
        const computed = staticString(node);
        if (computed !== null) {
          if (SYSTEM_ACTOR_KEYS.has(computed)) {
            add(node, `computed system actor selection ${computed} is prohibited`);
          }
          if (CONTEXT_HELPERS.has(computed)) {
            add(node, `computed audit helper selection ${computed} is prohibited`);
          }
          if (computed === CONTROLLED_LOCAL_ADMINISTRATION) {
            add(node, 'computed local password-administration selection is prohibited');
          }
          if (isAuditModule(source.path, computed)) {
            add(node, 'computed audit gateway access is prohibited');
          }
          if (!isGateway && LOW_LEVEL_PATTERN.test(computed)) {
            add(node, 'computed low-level audit token is prohibited outside the gateway');
          }
        }
      }

      if (
        !isGateway &&
        ts.isIdentifier(node) &&
        /^(?:audit_set_(?:human|authentication|administration|migration)_context|audit_current_actor_id|set_config)$/iu.test(
          node.text,
        )
      ) {
        add(node, `low-level audit identifier ${node.text} is prohibited`);
      }
      if (
        !isAuthService &&
        ts.isIdentifier(node) &&
        node.text === CONTROLLED_LOCAL_ADMINISTRATION
      ) {
        add(node, 'controlled local password administration is outside its reviewed service');
      }
      node.forEachChild(visit);
    };
    visit(sourceFile);
  }

  if (enforceReviewedCallsites) {
    if (!sourcePaths.has(AUDIT_GATEWAY)) failures.add(`${AUDIT_GATEWAY} is missing`);
    if (!sourcePaths.has(AUDIT_AUTH_SERVICE)) failures.add(`${AUDIT_AUTH_SERVICE} is missing`);
    for (const expected of AUTH_SERVICE_HELPERS) {
      if (!authImports.has(expected)) failures.add(`${AUDIT_AUTH_SERVICE} must import ${expected}`);
    }
    const expectedCalls = [
      {
        helper: 'setAuthenticationAuditContext',
        functionName: 'authenticateCredentials',
        argumentsText: 'tx',
      },
      {
        helper: 'setHumanAuditContext',
        functionName: 'changeOwnPassword',
        argumentsText: 'tx,account.id',
      },
      {
        helper: 'setAdministrationAuditContext',
        functionName: 'setApprovedAccountPassword',
        argumentsText: 'tx',
      },
    ];
    for (const expected of expectedCalls) {
      const matching = authCalls.filter(
        (call) =>
          call.helper === expected.helper &&
          call.functionName === expected.functionName &&
          call.argumentsText === expected.argumentsText,
      );
      if (matching.length !== 1) {
        failures.add(
          `${AUDIT_AUTH_SERVICE} expected exactly one ${expected.helper}(${expected.argumentsText}) in ${expected.functionName}; found ${matching.length}`,
        );
      }
    }
    if (authCalls.length !== expectedCalls.length) {
      failures.add(
        `${AUDIT_AUTH_SERVICE} has ${authCalls.length}/${expectedCalls.length} reviewed audit context calls`,
      );
    }
  }

  return [...failures].sort();
}
