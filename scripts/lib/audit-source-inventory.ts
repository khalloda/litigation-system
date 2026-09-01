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

const GENERATED_EXCLUSION = 'src/generated/prisma/';
const REVIEWED_NON_CODE_EXTENSIONS = new Set(['.css', '.png']);
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
  /audit_set_(?:human|authentication|administration|migration)_context|audit_current_actor_id|litigation\.audit_actor_id|set_config|\bset\s+(?:local|session)\b/iu;

const REVIEWED_RAW_SQL_CALLS = [
  [AUDIT_GATEWAY, 'setHumanAuditContext'],
  [AUDIT_GATEWAY, 'setAuthenticationAuditContext'],
  [AUDIT_GATEWAY, 'setAdministrationAuditContext'],
  [AUDIT_GATEWAY, 'setMigrationAuditContext'],
  [AUDIT_AUTH_SERVICE, 'lockedAccount'],
  [AUDIT_AUTH_SERVICE, 'changeOwnPassword'],
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

function staticString(node: ts.Node): string | null {
  const literal = literalText(node);
  if (literal !== null && !ts.isTemplateHead(node) && !ts.isTemplateMiddle(node)) return literal;
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
    let result = node.head.text;
    for (const span of node.templateSpans) {
      const expression = staticString(span.expression);
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

function rawSqlMethod(node: ts.Expression): string | null {
  if (ts.isPropertyAccessExpression(node) && RAW_SQL_METHODS.has(node.name.text)) {
    return node.name.text;
  }
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const property = staticString(node.argumentExpression);
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
  const property = node.argumentExpression ? staticString(node.argumentExpression) : null;
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
  const failures = new Set<string>();
  const sourcePaths = new Set(sources.map((source) => normalized(source.path)));
  const { program, checker, options: tsOptions, host } = semanticProgram(root, sources);
  const gatewayFile = program.getSourceFile(path.join(root, AUDIT_GATEWAY));
  const serviceFile = program.getSourceFile(path.join(root, AUDIT_AUTH_SERVICE));
  const helperSymbols = new Map<ts.Symbol, string>();
  for (const helper of CONTEXT_HELPERS) {
    const symbol = functionSymbol(checker, gatewayFile, helper);
    if (symbol) helperSymbols.set(symbol, helper);
  }
  const controlledSymbol = functionSymbol(checker, serviceFile, CONTROLLED_LOCAL_ADMINISTRATION);
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
    const add = (node: ts.Node, message: string): void => {
      failures.add(`${source.path}:${sourceLocation(sourceFile, node)} ${message}`);
    };

    for (const request of moduleRequests(sourceFile, add)) {
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
            if (!declaration)
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
        const property = node.argumentExpression ? staticString(node.argumentExpression) : null;
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
        const method = rawSqlMethod(node.expression);
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
        const method = rawSqlMethod(node.tag);
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
        const method = rawSqlMethod(node);
        if (method && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
          add(node, `${method} cannot be aliased, exported or wrapped`);
        }
      }

      const literal = literalText(node);
      if (literal !== null) {
        if (EXECUTION_ESCAPE_NAMES.has(literal)) {
          add(node, `${literal} execution-escape selection is prohibited`);
        }
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
      ['setAuthenticationAuditContext', 'authenticateCredentials', 'tx'],
      ['setHumanAuditContext', 'changeOwnPassword', 'tx,account.id'],
      ['setAdministrationAuditContext', 'setApprovedAccountPassword', 'tx'],
    ] as const;
    for (const [helper, functionName, argumentsText] of expectedCalls) {
      const count = authCalls.filter(
        (call) =>
          call.helper === helper &&
          call.functionName === functionName &&
          call.argumentsText === argumentsText,
      ).length;
      if (count !== 1) {
        failures.add(
          `${AUDIT_AUTH_SERVICE} expected exactly one ${helper}(${argumentsText}) in ${functionName}; found ${count}`,
        );
      }
    }
    if (authCalls.length !== expectedCalls.length) {
      failures.add(
        `${AUDIT_AUTH_SERVICE} has ${authCalls.length}/${expectedCalls.length} reviewed audit context calls`,
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
