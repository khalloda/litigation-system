import { createHash } from 'node:crypto';
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
export const AUDIT_DATABASE_MODULE = 'src/lib/db.ts';

const GENERATED_EXCLUSION = 'src/generated/prisma/';
const REVIEWED_NON_CODE_EXTENSIONS = new Set(['.css', '.png']);
const CONTEXT_HELPERS = new Set([
  'setHumanAuditContext',
  'setAuthenticationAuditContext',
  'setAdministrationAuditContext',
  'setMigrationAuditContext',
  'recordLoginSucceeded',
  'recordLoginFailed',
  'recordAccountLocked',
  'recordOwnPasswordChanged',
  'recordAdministrationPasswordChange',
]);
const AUTH_SERVICE_HELPERS = new Set([
  'setHumanAuditContext',
  'setAuthenticationAuditContext',
  'setAdministrationAuditContext',
  'recordLoginSucceeded',
  'recordLoginFailed',
  'recordAccountLocked',
  'recordOwnPasswordChanged',
  'recordAdministrationPasswordChange',
]);
const SYSTEM_ACTOR_KEYS = new Set([
  'system_migration',
  'system_authentication',
  'system_administration',
]);
const CONTROLLED_LOCAL_ADMINISTRATION = 'setApprovedAccountPassword';
const MIGRATION_DATABASE_ENV = 'MIGRATION_DATABASE_URL';
const ALTERNATE_DATABASE_FACTORY = 'createDatabaseClient';
const REVIEWED_RUNTIME_ENVIRONMENT_KEYS = new Set([
  'AUDIT_TRUST_PROXY',
  'AUTH_SECRET',
  'DATABASE_URL',
  'NODE_ENV',
]);
const RAW_SQL_METHODS = new Set([
  '$queryRaw',
  '$queryRawTyped',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
]);
const DIRECT_POSTGRESQL_MODULES = new Set(['pg', 'postgres', 'postgresql']);
const EXECUTION_ESCAPE_NAMES = new Set(['eval', 'Function', 'require', 'createRequire']);
const LOW_LEVEL_PATTERN =
  /audit_set_(?:human|authentication|administration|migration|event)_context|audit_append_semantic_event|audit_current_actor_id|litigation\.audit_(?:actor|request|correlation|session|ip|user_agent|device)_|set_config|\bset\s+(?:local|session)\b/iu;

const REVIEWED_RAW_SQL_CALLS = [
  [
    AUDIT_GATEWAY,
    'setHumanAuditContext',
    '8f64c1ed5d461c4a25fbc0d6bb929850f53ee55ef991dfc9903e4998b883eea8',
  ],
  [
    AUDIT_GATEWAY,
    'setAuthenticationAuditContext',
    '8165a04922dc9d73130815857454533e6e21432aa7d2c0d7d593025c569fbd7d',
  ],
  [
    AUDIT_GATEWAY,
    'setAdministrationAuditContext',
    '88762800707ab6ec65dd6889c3bb6809fcb27617158d21195497e33465654190',
  ],
  [
    AUDIT_GATEWAY,
    'setMigrationAuditContext',
    '18657522c9fd2fb759897528c531435fceed56f406836c4687b36e5760e7dfe8',
  ],
  [
    AUDIT_GATEWAY,
    'setEventContext',
    '8cb6c0be44bafb1346ff0ac8bfa3419b087c8626a6b7b8c7898502a69e82b5fd',
  ],
  [
    AUDIT_GATEWAY,
    'appendSemanticEvent',
    '9fed0be77b8676c5f08c752ef293551beebe0fe6fae8a22edb00197c09ede34d',
  ],
  [
    AUDIT_AUTH_SERVICE,
    'lockedAccount',
    '1e16f9db148a62bc3e22921740c70430596eca908516ec093e38cafe580096bb',
  ],
  [
    AUDIT_AUTH_SERVICE,
    'changeOwnPassword',
    '94b602038781824c995eaaac3bc353a08f07c58ec002d9298d0d5c6f4172a858',
  ],
] as const;

export type AuditRuntimeSource = Readonly<{ path: string; text: string }>;

type ModuleRequest = Readonly<{
  specifier: string;
  node: ts.Node;
  kind: 'static' | 'dynamic' | 'commonjs' | 'import-equals';
}>;

type ReviewedCall = Readonly<{ file: string; functionName: string | null }>;

function normalized(value: string): string {
  return value.replaceAll(path.sep, '/');
}

function canonical(value: string): string {
  const absolute = normalized(path.resolve(value));
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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

function sourceLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${position.line + 1}:${position.character + 1}`;
}

function containingFunctionName(node: ts.Node, sourceFile: ts.SourceFile): string | null {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name && current.parent === sourceFile) {
      return current.name.text;
    }
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name) &&
      current.parent.parent.parent.parent === sourceFile
    ) {
      return current.parent.name.text;
    }
  }
  return null;
}

function literalText(node: ts.Node): string | null {
  return ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
    ? node.text
    : null;
}

function transparentExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isPartiallyEmittedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function staticString(
  checker: ts.TypeChecker,
  node: ts.Node,
  visited = new Set<ts.Symbol>(),
): string | null {
  if (ts.isNumericLiteral(node)) return node.text;
  const literal = literalText(node);
  if (literal !== null && !ts.isTemplateHead(node) && !ts.isTemplateMiddle(node)) return literal;
  if (ts.isParenthesizedExpression(node)) return staticString(checker, node.expression, visited);
  if (
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return staticString(checker, node.expression, visited);
  }
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
    const symbol = resolvedSymbol(checker, node);
    if (symbol && !visited.has(symbol)) {
      const nextVisited = new Set(visited).add(symbol);
      for (const declaration of symbol.declarations ?? []) {
        if (
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer &&
          ts.isVariableDeclarationList(declaration.parent) &&
          (declaration.parent.flags & ts.NodeFlags.Const) !== 0
        ) {
          const value = staticString(checker, declaration.initializer, nextVisited);
          if (value !== null) return value;
        }
      }
    }
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(checker, node.left, visited);
    const right = staticString(checker, node.right, visited);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    for (const span of node.templateSpans) {
      const expression = staticString(checker, span.expression, visited);
      if (expression === null) return null;
      result += expression + span.literal.text;
    }
    return result;
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

function rawSqlMethod(checker: ts.TypeChecker, node: ts.Expression): string | null {
  node = transparentExpression(node);
  if (ts.isPropertyAccessExpression(node) && RAW_SQL_METHODS.has(node.name.text)) {
    return node.name.text;
  }
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const property = staticString(checker, node.argumentExpression);
    return property && RAW_SQL_METHODS.has(property) ? property : null;
  }
  return null;
}

function resolvedSymbol(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
  let symbol = checker.getSymbolAtLocation(node);
  if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias)
    symbol = checker.getAliasedSymbol(symbol);
  return symbol;
}

function elementSymbol(
  checker: ts.TypeChecker,
  node: ts.ElementAccessExpression,
): ts.Symbol | undefined {
  const property = node.argumentExpression ? staticString(checker, node.argumentExpression) : null;
  let symbol = property
    ? checker.getTypeAtLocation(node.expression).getProperty(property)
    : undefined;
  if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias)
    symbol = checker.getAliasedSymbol(symbol);
  return symbol;
}

function functionSymbol(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile | undefined,
  name: string,
): ts.Symbol | undefined {
  const declaration = sourceFile?.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  return declaration?.name ? resolvedSymbol(checker, declaration.name) : undefined;
}

function compilerOptions(root: string): ts.CompilerOptions {
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  return {
    ...ts.parseJsonConfigFileContent(config.config, ts.sys, root).options,
    allowJs: true,
    checkJs: false,
    noEmit: true,
  };
}

function semanticProgram(root: string, sources: readonly AuditRuntimeSource[]) {
  const options = compilerOptions(root);
  const sourceByKey = new Map(
    sources.map((source) => [canonical(path.join(root, source.path)), source] as const),
  );
  const baseHost = ts.createCompilerHost(options, true);
  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: (fileName) => sourceByKey.has(canonical(fileName)) || baseHost.fileExists(fileName),
    readFile: (fileName) =>
      sourceByKey.get(canonical(fileName))?.text ?? baseHost.readFile(fileName),
    getSourceFile: (fileName, version, onError, fresh) => {
      const source = sourceByKey.get(canonical(fileName));
      return source
        ? ts.createSourceFile(fileName, source.text, version, true, scriptKind(source.path))
        : baseHost.getSourceFile(fileName, version, onError, fresh);
    },
  };
  const program = ts.createProgram({
    rootNames: sources.map((source) => path.join(root, source.path)),
    options,
    host,
  });
  return { program, checker: program.getTypeChecker(), options, host };
}

function rawCallFingerprint(node: ts.CallExpression, sourceFile: ts.SourceFile): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    sourceFile.languageVariant,
    node.getText(sourceFile),
  );
  const tokens: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    tokens.push(`${ts.SyntaxKind[kind]}:${scanner.getTokenText()}`);
  }
  return createHash('sha256').update(tokens.join('\n'), 'utf8').digest('hex');
}

function isReviewedRawCall(
  sourcePath: string,
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
): boolean {
  const functionName = containingFunctionName(node, sourceFile);
  const fingerprint = rawCallFingerprint(node, sourceFile);
  return REVIEWED_RAW_SQL_CALLS.some(
    ([file, reviewedFunction, reviewedFingerprint]) =>
      file === sourcePath &&
      reviewedFunction === functionName &&
      reviewedFingerprint === fingerprint,
  );
}

function directBuiltinCall(
  checker: ts.TypeChecker,
  node: ts.CallExpression,
  owner: 'Object' | 'Reflect',
  method: string,
): boolean {
  const expression = transparentExpression(node.expression);
  const receiver =
    ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)
      ? transparentExpression(expression.expression)
      : undefined;
  const selectedMethod = ts.isPropertyAccessExpression(expression)
    ? expression.name.text
    : ts.isElementAccessExpression(expression) && expression.argumentExpression
      ? staticString(checker, expression.argumentExpression)
      : null;
  return (
    receiver !== undefined &&
    ts.isIdentifier(receiver) &&
    receiver.text === owner &&
    selectedMethod === method
  );
}

function semanticRawCapabilityFailures(
  sources: readonly AuditRuntimeSource[],
  program: ts.Program,
  checker: ts.TypeChecker,
): string[] {
  const failures = new Set<string>();
  const sourceByFile = new Map<string, AuditRuntimeSource>();
  const nodes: ts.Node[] = [];
  const sourceFiles = new Set<ts.SourceFile>();
  for (const source of sources) {
    const sourceFile = program.getSourceFile(path.join(process.cwd(), source.path));
    if (!sourceFile) continue;
    sourceByFile.set(canonical(sourceFile.fileName), source);
    sourceFiles.add(sourceFile);
    const visit = (node: ts.Node): void => {
      nodes.push(node);
      node.forEachChild(visit);
    };
    visit(sourceFile);
  }

  const add = (node: ts.Node, message: string): void => {
    const sourceFile = node.getSourceFile();
    const source = sourceByFile.get(canonical(sourceFile.fileName));
    if (source) failures.add(`${source.path}:${sourceLocation(sourceFile, node)} ${message}`);
  };
  const taintedSymbols = new Set<ts.Symbol>();
  const taintedFunctions = new Set<ts.Symbol>();

  const symbolAt = (node: ts.Node): ts.Symbol | undefined => resolvedSymbol(checker, node);
  const localRoot = (
    expression: ts.Expression,
    visited = new Set<ts.Symbol>(),
  ): ts.Symbol | undefined => {
    const node = transparentExpression(expression);
    if (!ts.isIdentifier(node)) return undefined;
    const symbol = symbolAt(node);
    if (!symbol || visited.has(symbol)) return undefined;
    const nextVisited = new Set(visited).add(symbol);
    for (const declaration of symbol.declarations ?? []) {
      if (
        !ts.isVariableDeclaration(declaration) ||
        !declaration.initializer ||
        !ts.isVariableDeclarationList(declaration.parent) ||
        (declaration.parent.flags & ts.NodeFlags.Const) === 0
      ) {
        continue;
      }
      const initializer = transparentExpression(declaration.initializer);
      const aliasRoot = localRoot(initializer, nextVisited);
      if (aliasRoot) return aliasRoot;
      if (
        ts.isObjectLiteralExpression(initializer) ||
        ts.isArrayLiteralExpression(initializer) ||
        ts.isArrowFunction(initializer) ||
        ts.isFunctionExpression(initializer)
      ) {
        return symbol;
      }
    }
    return undefined;
  };
  const unsafeLocalRoots = new Set<ts.Symbol>();
  const markLocalValueUnsafe = (expression: ts.Expression | undefined): void => {
    if (!expression) return;
    const node = transparentExpression(expression);
    const root = localRoot(node);
    if (root) unsafeLocalRoots.add(root);
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        if (!ts.isOmittedExpression(element)) {
          markLocalValueUnsafe(ts.isSpreadElement(element) ? element.expression : element);
        }
      }
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) markLocalValueUnsafe(property.initializer);
        if (ts.isShorthandPropertyAssignment(property)) markLocalValueUnsafe(property.name);
        if (ts.isSpreadAssignment(property)) markLocalValueUnsafe(property.expression);
      }
    }
    if (ts.isConditionalExpression(node)) {
      markLocalValueUnsafe(node.whenTrue);
      markLocalValueUnsafe(node.whenFalse);
    }
  };
  const isReadOnlyReflectionArgument = (node: ts.CallExpression, index: number): boolean =>
    index === 0 &&
    (directBuiltinCall(checker, node, 'Reflect', 'get') ||
      directBuiltinCall(checker, node, 'Reflect', 'getOwnPropertyDescriptor') ||
      directBuiltinCall(checker, node, 'Object', 'getOwnPropertyDescriptor'));

  for (const node of nodes) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = transparentExpression(node.left);
      if (ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left)) {
        markLocalValueUnsafe(left.expression);
      }
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      const operand = transparentExpression(node.operand);
      if (ts.isPropertyAccessExpression(operand) || ts.isElementAccessExpression(operand)) {
        markLocalValueUnsafe(operand.expression);
      }
    }
    if (ts.isDeleteExpression(node)) {
      const expression = transparentExpression(node.expression);
      if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
        markLocalValueUnsafe(expression.expression);
      }
    }
    if (ts.isCallExpression(node)) {
      node.arguments.forEach((argument, index) => {
        if (!isReadOnlyReflectionArgument(node, index)) markLocalValueUnsafe(argument);
      });
    }
    if (ts.isReturnStatement(node)) markLocalValueUnsafe(node.expression);
    if (ts.isExportAssignment(node)) markLocalValueUnsafe(node.expression);
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of node.declarationList.declarations) {
        markLocalValueUnsafe(declaration.initializer);
      }
    }
    if (ts.isExportSpecifier(node)) {
      const symbol = symbolAt(node.propertyName ?? node.name);
      if (symbol) {
        for (const declaration of symbol.declarations ?? []) {
          if (ts.isVariableDeclaration(declaration)) markLocalValueUnsafe(declaration.initializer);
        }
      }
    }
  }

  const isLocallyClosedFunctionValue = (
    node: ts.ArrowFunction | ts.FunctionExpression,
  ): boolean => {
    let unsafe = false;
    const visit = (current: ts.Node): void => {
      if (
        ts.isCallExpression(current) ||
        ts.isNewExpression(current) ||
        ts.isTaggedTemplateExpression(current) ||
        ts.isElementAccessExpression(current)
      ) {
        unsafe = true;
        return;
      }
      current.forEachChild(visit);
    };
    visit(node.body);
    return !unsafe;
  };

  const isProvenLocalNonPrismaReceiver = (
    expression: ts.Expression,
    visited = new Set<ts.Symbol>(),
  ): boolean => {
    const node = transparentExpression(expression);
    if (
      ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node) ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword
    ) {
      return true;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      return isLocallyClosedFunctionValue(node);
    }
    if (ts.isObjectLiteralExpression(node)) {
      return node.properties.every((property) => {
        if (ts.isPropertyAssignment(property)) {
          return isProvenLocalNonPrismaReceiver(property.initializer, visited);
        }
        if (ts.isShorthandPropertyAssignment(property)) {
          return isProvenLocalNonPrismaReceiver(property.name, visited);
        }
        if (ts.isSpreadAssignment(property)) {
          return isProvenLocalNonPrismaReceiver(property.expression, visited);
        }
        return false;
      });
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.every(
        (element) =>
          ts.isOmittedExpression(element) ||
          (ts.isSpreadElement(element)
            ? isProvenLocalNonPrismaReceiver(element.expression, visited)
            : isProvenLocalNonPrismaReceiver(element, visited)),
      );
    }
    if (ts.isConditionalExpression(node)) {
      return (
        isProvenLocalNonPrismaReceiver(node.whenTrue, visited) &&
        isProvenLocalNonPrismaReceiver(node.whenFalse, visited)
      );
    }
    if (!ts.isIdentifier(node)) return false;
    const symbol = symbolAt(node);
    if (!symbol || visited.has(symbol)) return false;
    const root = localRoot(node);
    if (!root || unsafeLocalRoots.has(root)) return false;
    const nextVisited = new Set(visited).add(symbol);
    return (symbol.declarations ?? []).some(
      (declaration) =>
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer !== undefined &&
        ts.isVariableDeclarationList(declaration.parent) &&
        (declaration.parent.flags & ts.NodeFlags.Const) !== 0 &&
        isProvenLocalNonPrismaReceiver(declaration.initializer, nextVisited),
    );
  };
  const markBinding = (name: ts.BindingName): boolean => {
    let changed = false;
    if (ts.isIdentifier(name)) {
      const symbol = symbolAt(name);
      if (symbol && !taintedSymbols.has(symbol)) {
        taintedSymbols.add(symbol);
        changed = true;
      }
    } else {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) changed = markBinding(element.name) || changed;
      }
    }
    return changed;
  };
  const isStaticallyCallable = (node: ts.Expression): boolean => {
    const inspect = (type: ts.Type): boolean =>
      type.getCallSignatures().length > 0 ||
      (type.isUnionOrIntersection() && type.types.some(inspect));
    return inspect(checker.getTypeAtLocation(node));
  };
  function bindingFlowsToInvocation(name: ts.BindingName, visited: Set<ts.Node>): boolean {
    if (!ts.isIdentifier(name)) return false;
    const symbol = symbolAt(name);
    if (!symbol) return false;
    return nodes.some(
      (candidate) =>
        ts.isIdentifier(candidate) &&
        candidate !== name &&
        symbolAt(candidate) === symbol &&
        valueFlowsToInvocation(candidate, visited),
    );
  }
  function valueFlowsToInvocation(node: ts.Node, visited = new Set<ts.Node>()): boolean {
    if (visited.has(node)) return false;
    const nextVisited = new Set(visited).add(node);
    const parent = node.parent;
    if (!parent) return false;
    if (
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isTypeAssertionExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isSatisfiesExpression(parent) ||
      ts.isAwaitExpression(parent)
    ) {
      return valueFlowsToInvocation(parent, nextVisited);
    }
    if (ts.isCallExpression(parent)) {
      if (parent.expression === node) return true;
      if (directBuiltinCall(checker, parent, 'Reflect', 'apply') && parent.arguments[0] === node) {
        return true;
      }
      const index = parent.arguments.findIndex((argument) => argument === node);
      if (index >= 0) {
        const declaration = checker.getResolvedSignature(parent)?.declaration;
        if (
          declaration &&
          sourceFiles.has(declaration.getSourceFile()) &&
          ts.isFunctionLike(declaration)
        ) {
          const parameter = declaration.parameters[index] ?? declaration.parameters.at(-1);
          if (parameter && bindingFlowsToInvocation(parameter.name, nextVisited)) return true;
        }
      }
      return false;
    }
    if (ts.isNewExpression(parent) && parent.expression === node) return true;
    if (ts.isTaggedTemplateExpression(parent) && parent.tag === node) return true;
    if (
      (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
      parent.expression === node
    ) {
      const property = ts.isPropertyAccessExpression(parent)
        ? parent.name.text
        : parent.argumentExpression
          ? staticString(checker, parent.argumentExpression)
          : null;
      if (
        property !== null &&
        ['call', 'apply', 'bind'].includes(property) &&
        ts.isCallExpression(parent.parent) &&
        parent.parent.expression === parent
      ) {
        return true;
      }
      return false;
    }
    if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
      return bindingFlowsToInvocation(parent.name, nextVisited);
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.right === node &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const left = transparentExpression(parent.left);
      return ts.isIdentifier(left) && bindingFlowsToInvocation(left, nextVisited);
    }
    if (ts.isReturnStatement(parent)) {
      const owner = (() => {
        for (let current = parent.parent; current; current = current.parent) {
          if (ts.isFunctionLike(current)) return current;
        }
        return undefined;
      })();
      const ownerSymbol = owner
        ? 'name' in owner && owner.name && ts.isIdentifier(owner.name)
          ? symbolAt(owner.name)
          : ts.isVariableDeclaration(owner.parent) && ts.isIdentifier(owner.parent.name)
            ? symbolAt(owner.parent.name)
            : undefined
        : undefined;
      if (!ownerSymbol) return false;
      return nodes.some(
        (candidate) =>
          ts.isCallExpression(candidate) &&
          symbolAt(transparentExpression(candidate.expression)) === ownerSymbol &&
          valueFlowsToInvocation(candidate, nextVisited),
      );
    }
    return false;
  }
  const functionSymbolFor = (node: ts.SignatureDeclaration): ts.Symbol | undefined => {
    if ('name' in node && node.name && ts.isIdentifier(node.name)) return symbolAt(node.name);
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      return symbolAt(node.parent.name);
    }
    if (ts.isPropertyAssignment(node.parent)) return symbolAt(node.parent.name);
    return undefined;
  };
  const containingFunction = (node: ts.Node): ts.SignatureDeclaration | undefined => {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isFunctionLike(current)) return current;
    }
    return undefined;
  };
  const reflectiveCapability = (node: ts.CallExpression): boolean => {
    const reflectGet = directBuiltinCall(checker, node, 'Reflect', 'get');
    const descriptor =
      directBuiltinCall(checker, node, 'Object', 'getOwnPropertyDescriptor') ||
      directBuiltinCall(checker, node, 'Reflect', 'getOwnPropertyDescriptor');
    if (!reflectGet && !descriptor) return false;
    const receiver = node.arguments[0];
    const propertyNode = node.arguments[1];
    if (!receiver || !propertyNode) return true;
    const property = staticString(checker, propertyNode);
    if (property && RAW_SQL_METHODS.has(property)) return true;
    return property === null && !isProvenLocalNonPrismaReceiver(receiver);
  };
  const expressionTainted = (expression: ts.Expression): boolean => {
    const node = transparentExpression(expression);
    if (ts.isIdentifier(node)) {
      const symbol = symbolAt(node);
      return symbol !== undefined && taintedSymbols.has(symbol);
    }
    if (ts.isPropertyAccessExpression(node)) {
      const method = rawSqlMethod(checker, node);
      if (method) {
        return !(
          ts.isCallExpression(node.parent) &&
          node.parent.expression === node &&
          isReviewedRawCall(
            sourceByFile.get(canonical(node.getSourceFile().fileName))?.path ?? '',
            node.getSourceFile(),
            node.parent,
          )
        );
      }
      return expressionTainted(node.expression);
    }
    if (ts.isElementAccessExpression(node)) {
      const method = rawSqlMethod(checker, node);
      if (method) {
        return !(
          ts.isCallExpression(node.parent) &&
          node.parent.expression === node &&
          isReviewedRawCall(
            sourceByFile.get(canonical(node.getSourceFile().fileName))?.path ?? '',
            node.getSourceFile(),
            node.parent,
          )
        );
      }
      const property = node.argumentExpression
        ? staticString(checker, node.argumentExpression)
        : null;
      return (
        property === null &&
        !isProvenLocalNonPrismaReceiver(node.expression) &&
        (isStaticallyCallable(node) || valueFlowsToInvocation(node))
      );
    }
    if (ts.isAwaitExpression(node)) return expressionTainted(node.expression);
    if (ts.isCallExpression(node)) {
      if (reflectiveCapability(node)) return true;
      if (directBuiltinCall(checker, node, 'Object', 'getOwnPropertyDescriptors')) {
        const receiver = node.arguments[0];
        return !receiver || !isProvenLocalNonPrismaReceiver(receiver);
      }
      const callee = transparentExpression(node.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'bind' &&
        expressionTainted(callee.expression)
      ) {
        return true;
      }
      const symbol = symbolAt(callee);
      return symbol !== undefined && taintedFunctions.has(symbol);
    }
    if (ts.isConditionalExpression(node)) {
      return expressionTainted(node.whenTrue) || expressionTainted(node.whenFalse);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return expressionTainted(node.right);
    }
    return false;
  };

  const localParameters = (node: ts.CallExpression): readonly ts.ParameterDeclaration[] | null => {
    const declaration = checker.getResolvedSignature(node)?.declaration;
    return declaration &&
      sourceFiles.has(declaration.getSourceFile()) &&
      ts.isFunctionLike(declaration)
      ? (declaration.parameters as readonly ts.ParameterDeclaration[])
      : null;
  };
  const bindingProperty = (element: ts.BindingElement): string | null => {
    const property = element.propertyName;
    if (!property) return ts.isIdentifier(element.name) ? element.name.text : null;
    if (ts.isIdentifier(property) || ts.isStringLiteralLike(property)) return property.text;
    return ts.isComputedPropertyName(property) ? staticString(checker, property.expression) : null;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        expressionTainted(node.initializer)
      ) {
        changed = markBinding(node.name) || changed;
      }
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isObjectBindingPattern(node.name)
      ) {
        for (const element of node.name.elements) {
          const property = bindingProperty(element);
          if (
            (property !== null && RAW_SQL_METHODS.has(property)) ||
            (property === null && !isProvenLocalNonPrismaReceiver(node.initializer))
          ) {
            changed = markBinding(element.name) || changed;
          }
        }
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        expressionTainted(node.right)
      ) {
        if (ts.isIdentifier(node.left)) {
          const symbol = symbolAt(node.left);
          if (symbol && !taintedSymbols.has(symbol)) {
            taintedSymbols.add(symbol);
            changed = true;
          }
        }
      }
      if (ts.isReturnStatement(node) && node.expression && expressionTainted(node.expression)) {
        const owner = containingFunction(node);
        const symbol = owner ? functionSymbolFor(owner) : undefined;
        if (symbol && !taintedFunctions.has(symbol)) {
          taintedFunctions.add(symbol);
          changed = true;
        }
      }
      if (ts.isCallExpression(node)) {
        const parameters = localParameters(node);
        node.arguments.forEach((argument, index) => {
          if (!expressionTainted(argument)) return;
          const parameter = parameters?.[index] ?? parameters?.at(-1);
          if (parameter) changed = markBinding(parameter.name) || changed;
        });
      }
    }
  }

  for (const node of nodes) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isObjectBindingPattern(node.name)
    ) {
      for (const element of node.name.elements) {
        const property = bindingProperty(element);
        if (property !== null && RAW_SQL_METHODS.has(property)) {
          add(element, `${property} raw-SQL capability is extracted by destructuring`);
        }
      }
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const method = rawSqlMethod(checker, node);
      if (method) {
        const directCall =
          ts.isCallExpression(node.parent) &&
          node.parent.expression === node &&
          isReviewedRawCall(
            sourceByFile.get(canonical(node.getSourceFile().fileName))?.path ?? '',
            node.getSourceFile(),
            node.parent,
          );
        if (!directCall) {
          const callEvidence =
            ts.isCallExpression(node.parent) && node.parent.expression === node
              ? `; call fingerprint ${rawCallFingerprint(node.parent, node.getSourceFile())}`
              : '';
          add(
            node,
            `${method} raw-SQL capability is acquired outside an exact reviewed call${callEvidence}`,
          );
        }
      }
      if (
        ts.isElementAccessExpression(node) &&
        (!node.argumentExpression || staticString(checker, node.argumentExpression) === null) &&
        !isProvenLocalNonPrismaReceiver(node.expression)
      ) {
        add(node, 'runtime-selected member is acquired from an unproved receiver');
      }
    }
    if (ts.isCallExpression(node)) {
      if (reflectiveCapability(node)) {
        const property = node.arguments[1]
          ? (staticString(checker, node.arguments[1]) ?? 'runtime-selected member')
          : 'missing member';
        add(node, `reflective raw-SQL capability acquisition is prohibited (${property})`);
      }
      if (directBuiltinCall(checker, node, 'Object', 'getOwnPropertyDescriptors')) {
        const receiver = node.arguments[0];
        if (!receiver || !isProvenLocalNonPrismaReceiver(receiver)) {
          add(node, 'bulk property-descriptor extraction from an unproved receiver is prohibited');
        }
      }
      if (
        directBuiltinCall(checker, node, 'Reflect', 'apply') &&
        (!node.arguments[0] || expressionTainted(node.arguments[0]))
      ) {
        add(node, 'Reflect.apply cannot invoke an unproved raw-SQL capability');
      }
      const callee = transparentExpression(node.expression);
      const taintedInvocation = expressionTainted(callee);
      const reviewed =
        (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) &&
        rawSqlMethod(checker, callee) !== null &&
        isReviewedRawCall(
          sourceByFile.get(canonical(node.getSourceFile().fileName))?.path ?? '',
          node.getSourceFile(),
          node,
        );
      if (taintedInvocation && !reviewed) {
        add(node, 'unproved or propagated raw-SQL callable capability is invoked');
      }
      const parameters = localParameters(node);
      node.arguments.forEach((argument, index) => {
        if (expressionTainted(argument) && !parameters?.[index] && !parameters?.at(-1)) {
          add(argument, 'raw-SQL callable capability escapes to an unproved callee');
        }
      });
    }
    if (ts.isNewExpression(node) && expressionTainted(node.expression)) {
      add(node, 'unproved raw-SQL callable capability is constructed');
    }
    if (ts.isTaggedTemplateExpression(node) && expressionTainted(node.tag)) {
      add(node, 'unproved raw-SQL callable capability is used as a tag');
    }
    if (ts.isReturnStatement(node) && node.expression && expressionTainted(node.expression)) {
      add(node, 'raw-SQL callable capability is returned from its defining boundary');
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      expressionTainted(node.right) &&
      !ts.isIdentifier(node.left)
    ) {
      add(node, 'raw-SQL callable capability is stored through an unproved assignment');
    }
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (declaration.initializer && expressionTainted(declaration.initializer)) {
          add(declaration, 'raw-SQL callable capability is exported');
        }
      }
    }
    if (ts.isExportAssignment(node) && expressionTainted(node.expression)) {
      add(node, 'raw-SQL callable capability is exported');
    }
    if (ts.isIdentifier(node) && node.text === 'Reflect') {
      const parent = node.parent;
      const selectedMethod = ts.isPropertyAccessExpression(parent)
        ? parent.name.text
        : ts.isElementAccessExpression(parent) && parent.argumentExpression
          ? staticString(checker, parent.argumentExpression)
          : null;
      const approvedDirectReceiver =
        (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
        parent.expression === node &&
        selectedMethod !== null &&
        ['get', 'apply', 'getOwnPropertyDescriptor'].includes(selectedMethod) &&
        ts.isCallExpression(parent.parent) &&
        parent.parent.expression === parent;
      if (!approvedDirectReceiver) add(node, 'Reflect cannot be aliased or exposed');
    }
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      (() => {
        const receiver = transparentExpression(node.expression);
        return ts.isIdentifier(receiver) && receiver.text === 'Object';
      })() &&
      (() => {
        const method = ts.isPropertyAccessExpression(node)
          ? node.name.text
          : node.argumentExpression
            ? staticString(checker, node.argumentExpression)
            : null;
        return (
          method !== null &&
          ['getOwnPropertyDescriptor', 'getOwnPropertyDescriptors'].includes(method)
        );
      })() &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)
    ) {
      add(node, 'property-descriptor reflection cannot be aliased or exposed');
    }
  }
  return [...failures];
}

function runtimeEnvironmentFailures(
  sources: readonly AuditRuntimeSource[],
  program: ts.Program,
  checker: ts.TypeChecker,
): string[] {
  type EnvironmentKind = 'global' | 'process' | 'environment';
  const failures = new Set<string>();
  const sourceByFile = new Map<string, AuditRuntimeSource>();
  const sourceFiles = new Set<ts.SourceFile>();
  const nodes: ts.Node[] = [];
  for (const source of sources) {
    const sourceFile = program.getSourceFile(path.join(process.cwd(), source.path));
    if (!sourceFile) continue;
    sourceByFile.set(canonical(sourceFile.fileName), source);
    sourceFiles.add(sourceFile);
    const visit = (node: ts.Node): void => {
      nodes.push(node);
      node.forEachChild(visit);
    };
    visit(sourceFile);
  }
  const add = (node: ts.Node, message: string): void => {
    const sourceFile = node.getSourceFile();
    const source = sourceByFile.get(canonical(sourceFile.fileName));
    if (source) failures.add(`${source.path}:${sourceLocation(sourceFile, node)} ${message}`);
  };
  const processSymbols = new Set<ts.Symbol>();
  const environmentSymbols = new Set<ts.Symbol>();
  const globalSymbols = new Set<ts.Symbol>();
  const processFunctions = new Set<ts.Symbol>();
  const environmentFunctions = new Set<ts.Symbol>();
  const symbolAt = (node: ts.Node): ts.Symbol | undefined => resolvedSymbol(checker, node);
  const isGlobalProcessIdentifier = (node: ts.Identifier): boolean => {
    if (node.text !== 'process') return false;
    const symbol = symbolAt(node);
    return !symbol?.declarations?.some((declaration) =>
      sourceFiles.has(declaration.getSourceFile()),
    );
  };
  const isGlobalObjectIdentifier = (node: ts.Identifier): boolean => {
    if (node.text !== 'global' && node.text !== 'globalThis') return false;
    const symbol = symbolAt(node);
    return !symbol?.declarations?.some((declaration) =>
      sourceFiles.has(declaration.getSourceFile()),
    );
  };
  const functionSymbolFor = (node: ts.SignatureDeclaration): ts.Symbol | undefined => {
    if ('name' in node && node.name && ts.isIdentifier(node.name)) return symbolAt(node.name);
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      return symbolAt(node.parent.name);
    }
    return undefined;
  };
  const containingFunction = (node: ts.Node): ts.SignatureDeclaration | undefined => {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isFunctionLike(current)) return current;
    }
    return undefined;
  };
  const kindOf = (expression: ts.Expression): EnvironmentKind | null => {
    const node = transparentExpression(expression);
    if (ts.isIdentifier(node)) {
      if (isGlobalObjectIdentifier(node)) return 'global';
      if (isGlobalProcessIdentifier(node)) return 'process';
      const symbol = symbolAt(node);
      if (symbol && globalSymbols.has(symbol)) return 'global';
      if (symbol && environmentSymbols.has(symbol)) return 'environment';
      if (symbol && processSymbols.has(symbol)) return 'process';
      return null;
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const receiverKind = kindOf(node.expression);
      const property = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : node.argumentExpression
          ? staticString(checker, node.argumentExpression)
          : null;
      if (receiverKind === 'process' && property === 'env') return 'environment';
      return null;
    }
    if (ts.isCallExpression(node)) {
      const symbol = symbolAt(transparentExpression(node.expression));
      if (symbol && environmentFunctions.has(symbol)) return 'environment';
      if (symbol && processFunctions.has(symbol)) return 'process';
      return null;
    }
    if (ts.isAwaitExpression(node)) return kindOf(node.expression);
    if (ts.isConditionalExpression(node)) {
      const whenTrue = kindOf(node.whenTrue);
      return whenTrue !== null && whenTrue === kindOf(node.whenFalse) ? whenTrue : null;
    }
    return null;
  };
  const markBinding = (name: ts.BindingName, kind: EnvironmentKind): boolean => {
    if (!ts.isIdentifier(name)) return false;
    const symbol = symbolAt(name);
    const target =
      kind === 'global' ? globalSymbols : kind === 'process' ? processSymbols : environmentSymbols;
    if (!symbol || target.has(symbol)) return false;
    target.add(symbol);
    return true;
  };
  const localParameters = (node: ts.CallExpression): readonly ts.ParameterDeclaration[] | null => {
    const declaration = checker.getResolvedSignature(node)?.declaration;
    return declaration &&
      sourceFiles.has(declaration.getSourceFile()) &&
      ts.isFunctionLike(declaration)
      ? (declaration.parameters as readonly ts.ParameterDeclaration[])
      : null;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const kind = kindOf(node.initializer);
        if (kind) changed = markBinding(node.name, kind) || changed;
        if (kind === 'process' && ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            const property = element.propertyName ?? element.name;
            if (
              (ts.isIdentifier(property) || ts.isStringLiteralLike(property)) &&
              property.text === 'env'
            ) {
              changed = markBinding(element.name, 'environment') || changed;
            }
          }
        }
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = transparentExpression(node.left);
        const kind = kindOf(node.right);
        if (kind && ts.isIdentifier(left)) changed = markBinding(left, kind) || changed;
      }
      if (ts.isReturnStatement(node) && node.expression) {
        const kind = kindOf(node.expression);
        const owner = containingFunction(node);
        const symbol = owner ? functionSymbolFor(owner) : undefined;
        const target = kind === 'process' ? processFunctions : environmentFunctions;
        if (kind !== 'global' && kind && symbol && !target.has(symbol)) {
          target.add(symbol);
          changed = true;
        }
      }
      if (ts.isCallExpression(node)) {
        const parameters = localParameters(node);
        node.arguments.forEach((argument, index) => {
          const kind = kindOf(argument);
          const parameter = parameters?.[index] ?? parameters?.at(-1);
          if (kind && parameter) changed = markBinding(parameter.name, kind) || changed;
        });
      }
    }
  }

  const isDirectEnvironmentObject = (expression: ts.Expression): boolean => {
    const node = transparentExpression(expression);
    if (!ts.isPropertyAccessExpression(node)) return false;
    const receiver = transparentExpression(node.expression);
    return ts.isIdentifier(receiver) && receiver.text === 'process' && node.name.text === 'env';
  };
  const directEnvironmentKey = (
    node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  ): string | null => {
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    return node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)
      ? node.argumentExpression.text
      : null;
  };

  for (const node of nodes) {
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      kindOf(node.expression) === 'global'
    ) {
      const property = directEnvironmentKey(node);
      if (ts.isElementAccessExpression(node) || property === 'process' || property === 'env') {
        add(node, 'runtime process/environment access through the global object is prohibited');
      }
    }
    if (ts.isIdentifier(node) && isGlobalProcessIdentifier(node)) {
      const environmentObject =
        ts.isPropertyAccessExpression(node.parent) &&
        node.parent.expression === node &&
        node.parent.name.text === 'env'
          ? node.parent
          : null;
      const directKeyRead =
        environmentObject !== null &&
        (ts.isPropertyAccessExpression(environmentObject.parent) ||
          ts.isElementAccessExpression(environmentObject.parent)) &&
        environmentObject.parent.expression === environmentObject;
      if (!directKeyRead) {
        add(node, 'global process access is limited to one direct reviewed process.env key');
      }
    }
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      kindOf(node.expression) === 'environment'
    ) {
      const key = directEnvironmentKey(node);
      if (!isDirectEnvironmentObject(node.expression) || key === null) {
        add(node, 'runtime environment access must use one direct reviewed process.env key');
      } else if (!REVIEWED_RUNTIME_ENVIRONMENT_KEYS.has(key)) {
        add(node, `runtime environment key ${key} is not approved`);
      }
    }
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      kindOf(node) === 'environment'
    ) {
      const parent = node.parent;
      const directRead =
        (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
        parent.expression === node;
      if (!directRead) add(node, 'process.env cannot be aliased, passed, returned or exposed');
    }
  }
  return [...failures];
}

function moduleRequests(sourceFile: ts.SourceFile, add: (node: ts.Node, message: string) => void) {
  const requests: ModuleRequest[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        requests.push({ specifier: node.moduleSpecifier.text, node, kind: 'static' });
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const expression = node.moduleReference.expression;
      if (expression && ts.isStringLiteralLike(expression)) {
        requests.push({ specifier: expression.text, node, kind: 'import-equals' });
      } else add(node, 'ImportEquals module target must be one literal');
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]!)) {
        requests.push({ specifier: node.arguments[0]!.text, node, kind: 'dynamic' });
      } else add(node, 'dynamic import target must be one reviewed literal');
    } else if (ts.isCallExpression(node)) {
      const requireCall =
        (ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
        (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'require');
      if (requireCall) {
        if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]!)) {
          requests.push({ specifier: node.arguments[0]!.text, node, kind: 'commonjs' });
        } else add(node, 'CommonJS require target must be one reviewed literal');
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return requests;
}

export function discoverAuditRuntimeSources(root: string): AuditRuntimeSource[] {
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
  visit(path.join(root, 'src'));
  return sources.sort((left, right) => left.path.localeCompare(right.path));
}

export function auditRuntimeSourceFailures(
  sources: readonly AuditRuntimeSource[],
  options: { enforceReviewedCallsites?: boolean } = {},
): string[] {
  const enforceReviewedCallsites = options.enforceReviewedCallsites ?? true;
  const root = process.cwd();
  const sourceRoot = path.join(root, 'src');
  const generatedRoot = path.join(root, GENERATED_EXCLUSION);
  const gatewayAbsolute = canonical(path.join(root, AUDIT_GATEWAY));
  const serviceAbsolute = canonical(path.join(root, AUDIT_AUTH_SERVICE));
  const databaseAbsolute = canonical(path.join(root, AUDIT_DATABASE_MODULE));
  const failures = new Set<string>();
  const sourcePaths = new Set(sources.map((source) => normalized(source.path)));
  const { program, checker, options: tsOptions, host } = semanticProgram(root, sources);
  for (const failure of semanticRawCapabilityFailures(sources, program, checker)) {
    failures.add(failure);
  }
  for (const failure of runtimeEnvironmentFailures(sources, program, checker)) {
    failures.add(failure);
  }
  const gatewayFile = program.getSourceFile(path.join(root, AUDIT_GATEWAY));
  const serviceFile = program.getSourceFile(path.join(root, AUDIT_AUTH_SERVICE));
  const databaseFile = program.getSourceFile(path.join(root, AUDIT_DATABASE_MODULE));
  const helperSymbols = new Map<ts.Symbol, string>();
  for (const helper of CONTEXT_HELPERS) {
    const symbol = functionSymbol(checker, gatewayFile, helper);
    if (symbol) helperSymbols.set(symbol, helper);
  }
  const controlledSymbol = functionSymbol(checker, serviceFile, CONTROLLED_LOCAL_ADMINISTRATION);
  const alternateDatabaseFactorySymbol = functionSymbol(
    checker,
    databaseFile,
    ALTERNATE_DATABASE_FACTORY,
  );
  const authImports = new Set<string>();
  const authCalls: Array<ReviewedCall & { helper: string; argumentsText: string }> = [];
  const rawCalls: ReviewedCall[] = [];
  let adapterImports = 0;
  let adapterConstructions = 0;

  const resolveModule = (sourceFile: ts.SourceFile, specifier: string): string | null => {
    const resolved = ts.resolveModuleName(
      specifier,
      sourceFile.fileName,
      tsOptions,
      host,
    ).resolvedModule;
    return resolved ? canonical(resolved.resolvedFileName) : null;
  };

  for (const source of sources) {
    const absolute = canonical(path.join(root, source.path));
    const sourceFile = program.getSourceFile(path.join(root, source.path));
    if (!sourceFile) {
      failures.add(`${source.path}: compiler program omitted runtime source`);
      continue;
    }
    const isGateway = absolute === gatewayAbsolute;
    const isAuthService = absolute === serviceAbsolute;
    const isDatabaseModule = absolute === databaseAbsolute;
    const add = (node: ts.Node, message: string): void => {
      failures.add(`${source.path}:${sourceLocation(sourceFile, node)} ${message}`);
    };

    for (const request of moduleRequests(sourceFile, add)) {
      if (request.specifier === 'process' || request.specifier === 'node:process') {
        add(request.node, 'runtime source cannot import or require the process module');
      }
      const target = resolveModule(sourceFile, request.specifier);
      const internal = request.specifier.startsWith('.') || request.specifier.startsWith('@/');
      const harmless = REVIEWED_NON_CODE_EXTENSIONS.has(
        path.extname(request.specifier).toLowerCase(),
      );
      if (!target) {
        if (internal && !harmless) {
          add(request.node, `internal module target does not resolve: ${request.specifier}`);
        }
        continue;
      }
      const targetPath = normalized(path.relative(root, target));
      const projectOwned = isInside(target, root) && !target.includes('/node_modules/');
      const executable = AUDIT_RUNTIME_SOURCE_EXTENSIONS.includes(
        path.extname(target).toLowerCase(),
      );
      if (projectOwned && executable && !isInside(target, sourceRoot)) {
        add(request.node, `runtime import leaves the canonical src root: ${targetPath}`);
      }
      if (
        projectOwned &&
        executable &&
        isInside(target, sourceRoot) &&
        !isInside(target, generatedRoot) &&
        !sourcePaths.has(targetPath)
      ) {
        add(
          request.node,
          `resolved runtime module is outside the discovered closure: ${targetPath}`,
        );
      }

      if (target === gatewayAbsolute) {
        if (request.kind !== 'static') {
          add(request.node, 'audit gateway access must use the reviewed static named import');
        } else if (!isAuthService) {
          add(request.node, 'audit context imports are allowed only in the reviewed auth service');
        } else if (
          !ts.isImportDeclaration(request.node) ||
          !request.node.importClause?.namedBindings ||
          !ts.isNamedImports(request.node.importClause.namedBindings)
        ) {
          add(request.node, 'the reviewed auth service must use direct named audit imports');
        } else {
          for (const element of request.node.importClause.namedBindings.elements) {
            const imported = element.propertyName?.text ?? element.name.text;
            if (element.propertyName || !AUTH_SERVICE_HELPERS.has(imported)) {
              add(element, `unapproved or aliased audit import ${element.getText(sourceFile)}`);
            } else authImports.add(imported);
          }
        }
      }
      if (target === serviceAbsolute) {
        if (request.kind !== 'static') {
          add(request.node, 'authentication-service access must use reviewed static named imports');
        } else if (ts.isExportDeclaration(request.node)) {
          add(request.node, 're-exporting the reviewed authentication service is prohibited');
        } else if (
          !ts.isImportDeclaration(request.node) ||
          !request.node.importClause?.namedBindings ||
          !ts.isNamedImports(request.node.importClause.namedBindings)
        ) {
          add(request.node, 'runtime auth-service access must use direct named imports');
        }
      }
      if (target === databaseAbsolute && !isDatabaseModule) {
        const reviewedNamedImport =
          request.kind === 'static' &&
          ts.isImportDeclaration(request.node) &&
          request.node.importClause?.namedBindings &&
          ts.isNamedImports(request.node.importClause.namedBindings) &&
          request.node.importClause.namedBindings.elements.every(
            (element) => !element.propertyName && element.name.text !== ALTERNATE_DATABASE_FACTORY,
          );
        if (!reviewedNamedImport) {
          add(
            request.node,
            'runtime database access must use static named imports and cannot expose createDatabaseClient',
          );
        }
      }

      if (
        DIRECT_POSTGRESQL_MODULES.has(request.specifier) ||
        [...DIRECT_POSTGRESQL_MODULES].some((name) => request.specifier.startsWith(`${name}/`))
      ) {
        add(request.node, `direct PostgreSQL client module ${request.specifier} is prohibited`);
      }
      if (
        request.specifier === 'node:module' &&
        /\bcreateRequire\b/u.test(request.node.getText())
      ) {
        add(request.node, 'createRequire can escape the reviewed module closure');
      }
      if (request.specifier === '@prisma/adapter-pg') {
        const binding =
          ts.isImportDeclaration(request.node) &&
          request.node.importClause?.namedBindings &&
          ts.isNamedImports(request.node.importClause.namedBindings)
            ? request.node.importClause.namedBindings.elements
            : [];
        if (
          source.path !== 'src/lib/db.ts' ||
          request.kind !== 'static' ||
          binding.length !== 1 ||
          binding[0]?.name.text !== 'PrismaPg' ||
          binding[0]?.propertyName
        ) {
          add(
            request.node,
            'the PostgreSQL Prisma adapter is allowed only as db.ts named PrismaPg',
          );
        } else adapterImports += 1;
      }
    }

    const prismaSymbol = (() => {
      for (const statement of sourceFile.statements) {
        if (
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteralLike(statement.moduleSpecifier) &&
          resolveModule(sourceFile, statement.moduleSpecifier.text)?.startsWith(
            canonical(generatedRoot),
          ) &&
          statement.importClause?.namedBindings &&
          ts.isNamedImports(statement.importClause.namedBindings)
        ) {
          const binding = statement.importClause.namedBindings.elements.find(
            (element) => !element.propertyName && element.name.text === 'Prisma',
          );
          if (binding) return resolvedSymbol(checker, binding.name);
        }
      }
      return undefined;
    })();

    const helperFor = (node: ts.Node): string | undefined => {
      const symbol = ts.isElementAccessExpression(node)
        ? elementSymbol(checker, node)
        : resolvedSymbol(checker, node);
      return symbol ? helperSymbols.get(symbol) : undefined;
    };

    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const helper = helperFor(node);
        if (helper) {
          if (isGateway) {
            const declaration = ts.isFunctionDeclaration(node.parent) && node.parent.name === node;
            const reviewedComposition =
              helper === 'setHumanAuditContext' &&
              ts.isCallExpression(node.parent) &&
              node.parent.expression === node &&
              ['runAuditedDatabaseOperation', 'recordObservedExternalEvent'].includes(
                containingFunctionName(node.parent, sourceFile) ?? '',
              ) &&
              node.parent.arguments
                .map((argument) => argument.getText(sourceFile).replace(/\s+/gu, ''))
                .join(',') === 'transaction,actorAccountId,metadata';
            if (!declaration && !reviewedComposition)
              add(node, `${helper} gateway binding is exposed beyond its declaration`);
          } else {
            const importBinding = ts.isImportSpecifier(node.parent) && node.parent.name === node;
            const directCall = ts.isCallExpression(node.parent) && node.parent.expression === node;
            if (isAuthService && importBinding && !node.parent.propertyName) {
              // The import's resolved module and binding shape were checked above.
            } else if (isAuthService && directCall) {
              authCalls.push({
                file: source.path,
                helper,
                functionName: containingFunctionName(node.parent, sourceFile),
                argumentsText: node.parent.arguments
                  .map((argument) => argument.getText(sourceFile).replace(/\s+/gu, ''))
                  .join(','),
              });
            } else add(node, `${helper} binding is exposed outside its exact reviewed call`);
          }
        }
        const symbol = resolvedSymbol(checker, node);
        if (
          alternateDatabaseFactorySymbol &&
          symbol === alternateDatabaseFactorySymbol &&
          !isDatabaseModule
        ) {
          add(node, 'createDatabaseClient is private to src/lib/db.ts at runtime');
        }
        if (controlledSymbol && symbol === controlledSymbol && !isAuthService) {
          add(node, 'controlled local password administration is outside its reviewed service');
        }
        if (node.text === 'require') {
          const directLiteral =
            ts.isCallExpression(node.parent) &&
            node.parent.expression === node &&
            node.parent.arguments.length === 1 &&
            ts.isStringLiteralLike(node.parent.arguments[0]!);
          if (!directLiteral) add(node, 'require cannot be aliased or invoked indirectly');
        }
        if (node.text === 'eval') add(node, 'eval is prohibited in runtime source');
        if (node.text === 'Function') {
          add(node, 'Function construction or exposure is prohibited');
        }
        if (node.text === 'createRequire') {
          add(node, 'createRequire can escape the reviewed module closure');
        }
        if (node.text === MIGRATION_DATABASE_ENV) {
          add(node, 'runtime source cannot access the migration-only database credential');
        }
        if (
          RAW_SQL_METHODS.has(node.text) &&
          !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
        ) {
          add(node, `${node.text} cannot be destructured, bound or exposed`);
        }
      }

      if (ts.isElementAccessExpression(node)) {
        const helper = helperFor(node);
        if (helper && !isGateway) add(node, `${helper} computed binding access is prohibited`);
        const property = node.argumentExpression
          ? staticString(checker, node.argumentExpression)
          : null;
        if (property && EXECUTION_ESCAPE_NAMES.has(property)) {
          add(node, `${property} computed access is prohibited`);
        }
        if (
          property === null &&
          (ts.isCallExpression(node.parent) || ts.isNewExpression(node.parent)) &&
          node.parent.expression === node
        ) {
          add(node, 'runtime-computed callable member access is not provable');
        }
      }

      if (ts.isCallExpression(node)) {
        const method = rawSqlMethod(checker, node.expression);
        if (method) {
          const argument = node.arguments[0];
          const reviewedSql =
            method === '$queryRaw' &&
            node.arguments.length === 1 &&
            argument &&
            ts.isTaggedTemplateExpression(argument) &&
            ts.isPropertyAccessExpression(argument.tag) &&
            ts.isIdentifier(argument.tag.expression) &&
            argument.tag.expression.text === 'Prisma' &&
            argument.tag.name.text === 'sql' &&
            prismaSymbol !== undefined &&
            resolvedSymbol(checker, argument.tag.expression) === prismaSymbol;
          if (!(isGateway || isAuthService) || !reviewedSql) {
            add(node, `${method} is outside the exact reviewed static Prisma.sql call sites`);
          } else {
            rawCalls.push({
              file: source.path,
              functionName: containingFunctionName(node, sourceFile),
            });
          }
        }
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          ['eval', 'Function'].includes(node.expression.name.text)
        ) {
          add(node, `${node.expression.name.text} execution is prohibited`);
        }
        const joinedFragments = joinedLiteralFragments(node);
        if (!isGateway && LOW_LEVEL_PATTERN.test(joinedFragments)) {
          add(node, 'low-level audit function or GUC access is allowed only in the audit gateway');
        }
        if ([...RAW_SQL_METHODS].some((name) => joinedFragments.includes(name))) {
          add(node, 'computed raw-SQL method selection is prohibited');
        }
        if (EXECUTION_ESCAPE_NAMES.has(joinedFragments)) {
          add(node, `computed ${joinedFragments} execution escape is prohibited`);
        }
      }

      if (ts.isTaggedTemplateExpression(node)) {
        const method = rawSqlMethod(checker, node.tag);
        if (method) add(node, `${method} tagged execution is not a reviewed call shape`);
        if (!isGateway && LOW_LEVEL_PATTERN.test(joinedLiteralFragments(node.template))) {
          add(node, 'low-level audit SQL is allowed only in the audit gateway');
        }
      }

      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === 'PrismaPg' && source.path === 'src/lib/db.ts') {
          adapterConstructions += 1;
        }
      }
      if (
        ts.isNewExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'Function'
      ) {
        add(node, 'Function construction is prohibited');
      }

      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const method = rawSqlMethod(checker, node);
        if (method && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
          add(node, `${method} cannot be aliased, exported or wrapped`);
        }
      }

      const literal = literalText(node);
      if (literal !== null) {
        if (RAW_SQL_METHODS.has(literal)) {
          add(node, `standalone raw-SQL method literal ${literal} is prohibited`);
        }
        if (EXECUTION_ESCAPE_NAMES.has(literal)) {
          add(node, `${literal} execution-escape selection is prohibited`);
        }
        if (SYSTEM_ACTOR_KEYS.has(literal)) {
          add(node, `direct system actor selection ${literal} is prohibited in runtime source`);
        }
        if (literal === MIGRATION_DATABASE_ENV) {
          add(node, 'runtime source cannot access the migration-only database credential');
        }
        if (!isGateway && LOW_LEVEL_PATTERN.test(literal)) {
          add(node, 'low-level audit token is allowed only in the audit gateway');
        }
      }
      if (ts.isBinaryExpression(node) || ts.isTemplateExpression(node)) {
        const computed = staticString(checker, node);
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
          if (RAW_SQL_METHODS.has(computed)) {
            add(node, `computed raw-SQL method selection ${computed} is prohibited`);
          }
          if (!isGateway && LOW_LEVEL_PATTERN.test(computed)) {
            add(node, 'computed low-level audit token is prohibited outside the gateway');
          }
        }
      }
      node.forEachChild(visit);
    };
    visit(sourceFile);
  }

  if (enforceReviewedCallsites) {
    if (!sourcePaths.has(AUDIT_GATEWAY)) failures.add(`${AUDIT_GATEWAY} is missing`);
    if (!sourcePaths.has(AUDIT_AUTH_SERVICE)) failures.add(`${AUDIT_AUTH_SERVICE} is missing`);
    for (const helper of CONTEXT_HELPERS) {
      if (![...helperSymbols.values()].includes(helper)) {
        failures.add(`${AUDIT_GATEWAY} must declare ${helper}`);
      }
    }
    for (const helper of AUTH_SERVICE_HELPERS) {
      if (!authImports.has(helper)) failures.add(`${AUDIT_AUTH_SERVICE} must import ${helper}`);
    }
    const expectedCalls = [
      ['setAuthenticationAuditContext', 'authenticateCredentials', 'tx,auditMetadata', 2],
      ['setHumanAuditContext', 'authenticateCredentials', 'tx,account.id,auditMetadata', 1],
      [
        'recordLoginFailed',
        'authenticateCredentials',
        "tx,{attemptedUsername:username,outcome:'failed',reasonCode:'username_invalid',}",
        1,
      ],
      [
        'recordLoginFailed',
        'authenticateCredentials',
        "tx,{attemptedUsername:username,outcome:'failed',reasonCode:'username_unknown',}",
        1,
      ],
      [
        'recordLoginFailed',
        'authenticateCredentials',
        "tx,{attemptedUsername:username,targetAccountId:account.id,outcome:'blocked',reasonCode:'account_locked',}",
        1,
      ],
      [
        'recordLoginFailed',
        'authenticateCredentials',
        "tx,{attemptedUsername:username,targetAccountId:account.id,outcome:'failed',reasonCode:'role_invalid',}",
        1,
      ],
      [
        'recordLoginFailed',
        'authenticateCredentials',
        "tx,{attemptedUsername:username,targetAccountId:account.id,outcome:'failed',reasonCode,}",
        1,
      ],
      [
        'recordLoginFailed',
        'authenticateCredentials',
        "tx,{attemptedUsername:username,targetAccountId:account.id,outcome:'failed',reasonCode:'password_incorrect',}",
        1,
      ],
      ['recordAccountLocked', 'authenticateCredentials', 'tx,account.id', 1],
      ['recordLoginSucceeded', 'authenticateCredentials', 'tx,account.id', 1],
      ['setHumanAuditContext', 'changeOwnPassword', 'tx,account.id,auditMetadata', 1],
      ['recordOwnPasswordChanged', 'changeOwnPassword', 'tx,account.id', 1],
      ['setAdministrationAuditContext', 'setApprovedAccountPassword', 'tx,auditMetadata', 1],
      [
        'recordAdministrationPasswordChange',
        'setApprovedAccountPassword',
        'tx,account.id,semanticAction',
        1,
      ],
    ] as const;
    for (const [helper, functionName, argumentsText, expectedCount] of expectedCalls) {
      const count = authCalls.filter(
        (call) =>
          call.helper === helper &&
          call.functionName === functionName &&
          call.argumentsText === argumentsText,
      ).length;
      if (count !== expectedCount) {
        failures.add(
          `${AUDIT_AUTH_SERVICE} expected exactly ${expectedCount} ${helper}(${argumentsText}) in ${functionName}; found ${count}`,
        );
      }
    }
    const expectedCallCount = expectedCalls.reduce((sum, call) => sum + call[3], 0);
    if (authCalls.length !== expectedCallCount) {
      failures.add(
        `${AUDIT_AUTH_SERVICE} has ${authCalls.length}/${expectedCallCount} reviewed audit context/event calls`,
      );
    }
    for (const [file, functionName] of REVIEWED_RAW_SQL_CALLS) {
      if (
        rawCalls.filter((call) => call.file === file && call.functionName === functionName)
          .length !== 1
      ) {
        failures.add(`${file} expected one reviewed Prisma.sql call in ${functionName}`);
      }
    }
    if (rawCalls.length !== REVIEWED_RAW_SQL_CALLS.length) {
      failures.add(
        `runtime raw-SQL inventory is ${rawCalls.length}/${REVIEWED_RAW_SQL_CALLS.length}`,
      );
    }
    if (adapterImports !== 1 || adapterConstructions !== 1) {
      failures.add(
        `runtime PostgreSQL adapter inventory is ${adapterImports} import(s), ${adapterConstructions} construction(s)`,
      );
    }
  }

  return [...failures].sort();
}
