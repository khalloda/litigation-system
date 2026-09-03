import path from 'node:path';
import ts from 'typescript';

export type UserManagementRuntimeSource = Readonly<{ path: string; text: string }>;

const USER_MANAGEMENT_SERVICE = 'src/lib/auth/user-management.ts';
const AUTHENTICATION_SERVICE = 'src/lib/auth/service.ts';
const MANAGEMENT_MODULE = '@/lib/auth/user-management';
const MANAGEMENT_ACTIONS = 'src/app/users/actions.ts';
const MANAGEMENT_PAGE = 'src/app/users/page.tsx';
const MUTATION_METHODS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'delete',
  'deleteMany',
  'update',
  'updateMany',
  'upsert',
]);
const PROHIBITED_ACCOUNT_METHODS = new Set(['delete', 'deleteMany']);
const STAFF_DELEGATES = new Set(['person', 'personNameAlias']);
const SECRET_NAMES = new Set([
  'confirmPassword',
  'newPassword',
  'password',
  'passwordHash',
  'temporaryPassword',
]);

const EXPECTED_ACCOUNT_MUTATIONS = new Map([
  [`${AUTHENTICATION_SERVICE}:authenticateCredentials:update`, 2],
  [`${AUTHENTICATION_SERVICE}:changeOwnPassword:update`, 1],
  [`${AUTHENTICATION_SERVICE}:setApprovedAccountPassword:update`, 1],
  [`${USER_MANAGEMENT_SERVICE}:correctManagedUsername:update`, 1],
  [`${USER_MANAGEMENT_SERVICE}:changeManagedRole:update`, 1],
  [`${USER_MANAGEMENT_SERVICE}:disableManagedAccount:update`, 1],
  [`${USER_MANAGEMENT_SERVICE}:setAdministrativeTemporaryPassword:update`, 1],
]);

const EXPECTED_MANAGEMENT_EXPORTS = new Set([
  'changeManagedRole',
  'correctManagedUsername',
  'createManagedAccount',
  'disableManagedAccount',
  'listUserManagementSnapshot',
  'reactivateManagedAccount',
  'resetManagedPassword',
]);
const MANAGEMENT_MUTATIONS = new Set(
  [...EXPECTED_MANAGEMENT_EXPORTS].filter((name) => name !== 'listUserManagementSnapshot'),
);

function normalized(value: string): string {
  return value.replaceAll(path.sep, '/');
}

function sourceKind(fileName: string): ts.ScriptKind {
  return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function propertyName(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | null {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  const argument = node.argumentExpression;
  if (!argument) return null;
  if (ts.isStringLiteralLike(argument)) return argument.text;
  if (
    ts.isBinaryExpression(argument) &&
    argument.operatorToken.kind === ts.SyntaxKind.PlusToken &&
    ts.isStringLiteralLike(argument.left) &&
    ts.isStringLiteralLike(argument.right)
  ) {
    return argument.left.text + argument.right.text;
  }
  return null;
}

function containingFunctionName(node: ts.Node): string | null {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }
  }
  return null;
}

function sourceLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${position.line + 1}:${position.character + 1}`;
}

function containsSecretIdentifier(node: ts.Node): boolean {
  let found = false;
  const visit = (candidate: ts.Node): void => {
    if (
      ts.isIdentifier(candidate) &&
      SECRET_NAMES.has(candidate.text) &&
      !(ts.isPropertyAccessExpression(candidate.parent) && candidate.parent.name === candidate) &&
      !(
        (ts.isPropertyAssignment(candidate.parent) || ts.isMethodDeclaration(candidate.parent)) &&
        candidate.parent.name === candidate
      )
    ) {
      found = true;
    }
    if (candidate !== node && ts.isFunctionLike(candidate)) return;
    if (!found) candidate.forEachChild(visit);
  };
  visit(node);
  return found;
}

function directDelegateUse(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): Readonly<{ method: string | null; directCall: boolean }> {
  const parent = node.parent;
  if (!ts.isPropertyAccessExpression(parent) && !ts.isElementAccessExpression(parent)) {
    return { method: null, directCall: false };
  }
  const method = propertyName(parent);
  return {
    method,
    directCall: ts.isCallExpression(parent.parent) && parent.parent.expression === parent,
  };
}

export function userManagementSourceFailures(
  sources: readonly UserManagementRuntimeSource[],
  options: { enforceInventory?: boolean } = {},
): string[] {
  const enforceInventory = options.enforceInventory ?? true;
  const failures = new Set<string>();
  const mutationCounts = new Map<string, number>();
  const managementExports = new Set<string>();

  for (const source of sources) {
    const sourcePath = normalized(source.path);
    const sourceFile = ts.createSourceFile(
      sourcePath,
      source.text,
      ts.ScriptTarget.Latest,
      true,
      sourceKind(sourcePath),
    );
    const inManagementSurface =
      sourcePath === USER_MANAGEMENT_SERVICE || sourcePath.startsWith('src/app/users/');
    const add = (node: ts.Node, message: string): void => {
      failures.add(`${sourcePath}:${sourceLocation(sourceFile, node)} ${message}`);
    };

    const visit = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteralLike(node.moduleSpecifier) &&
        node.moduleSpecifier.text.includes('auth/user-management') &&
        !node.importClause?.isTypeOnly
      ) {
        if (node.moduleSpecifier.text !== MANAGEMENT_MODULE) {
          add(node, 'user-management service must use its canonical module import');
        } else if (
          !node.importClause?.namedBindings ||
          !ts.isNamedImports(node.importClause.namedBindings)
        ) {
          add(node, 'user-management service must use direct named imports');
        } else {
          for (const element of node.importClause.namedBindings.elements) {
            const imported = element.propertyName?.text ?? element.name.text;
            const allowed =
              (sourcePath === MANAGEMENT_PAGE && imported === 'listUserManagementSnapshot') ||
              (sourcePath === MANAGEMENT_ACTIONS &&
                (MANAGEMENT_MUTATIONS.has(imported) || imported === 'UserManagementError'));
            if (element.propertyName || !allowed) {
              add(element, `${imported} is imported outside its exact protected entry point`);
            }
          }
        }
      }
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier) &&
        node.moduleSpecifier.text.includes('auth/user-management')
      ) {
        add(node, 'user-management service cannot be re-exported');
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments.some(
          (argument) =>
            ts.isStringLiteralLike(argument) && argument.text.includes('auth/user-management'),
        )
      ) {
        add(node, 'dynamic or CommonJS user-management service loading is prohibited');
      }
      if (
        sourcePath === MANAGEMENT_ACTIONS &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        MANAGEMENT_MUTATIONS.has(node.expression.text)
      ) {
        const actor = node.arguments[0]?.getText(sourceFile).replace(/\s+/gu, '');
        if (actor !== 'Number(session.user.id)') {
          add(node, 'user-management acting account must come directly from session.user.id');
        }
      }
      if (
        sourcePath === USER_MANAGEMENT_SERVICE &&
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
        node.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
      ) {
        managementExports.add(node.name.text);
      }

      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const delegate = propertyName(node);
        if (delegate === 'userAccount' || STAFF_DELEGATES.has(delegate ?? '')) {
          const use = directDelegateUse(node);
          if (delegate !== 'userAccount') {
            if (
              sourcePath === USER_MANAGEMENT_SERVICE &&
              use.directCall &&
              use.method !== null &&
              MUTATION_METHODS.has(use.method)
            ) {
              add(node, 'Task 3.4 service cannot mutate people or aliases');
            }
          } else if (!use.directCall) {
            add(node, `${delegate} Prisma delegate cannot be aliased, computed, passed or wrapped`);
          } else if (ts.isElementAccessExpression(node)) {
            add(node, `${delegate} Prisma delegate must use direct property access`);
          } else if (use.method === null) {
            add(node, `${delegate} Prisma operation must be statically named`);
          } else if (MUTATION_METHODS.has(use.method)) {
            const functionName = containingFunctionName(node);
            if (PROHIBITED_ACCOUNT_METHODS.has(use.method)) {
              add(node, 'physical user-account deletion is prohibited');
            } else {
              const key = `${sourcePath}:${functionName ?? '(top-level)'}:${use.method}`;
              mutationCounts.set(key, (mutationCounts.get(key) ?? 0) + 1);
              if (!EXPECTED_ACCOUNT_MUTATIONS.has(key)) {
                add(
                  node,
                  `user-account ${use.method} is outside the exact reviewed lifecycle service`,
                );
              }
            }
          }
        }
      }

      if (inManagementSurface && ts.isReturnStatement(node) && node.expression) {
        if (containsSecretIdentifier(node.expression)) {
          add(node, 'password or password-hash material cannot be returned from user management');
        }
      }
      if (
        inManagementSurface &&
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'console' &&
        node.arguments.some(containsSecretIdentifier)
      ) {
        add(node, 'password or password-hash material cannot be logged');
      }
      node.forEachChild(visit);
    };
    visit(sourceFile);
  }

  if (enforceInventory) {
    for (const [key, expected] of EXPECTED_ACCOUNT_MUTATIONS) {
      const actual = mutationCounts.get(key) ?? 0;
      if (actual !== expected) failures.add(`${key} mutation inventory is ${actual}/${expected}`);
    }
    for (const key of mutationCounts.keys()) {
      if (!EXPECTED_ACCOUNT_MUTATIONS.has(key))
        failures.add(`${key} is not in the reviewed inventory`);
    }
    const missingExports = [...EXPECTED_MANAGEMENT_EXPORTS].filter(
      (name) => !managementExports.has(name),
    );
    const extraExports = [...managementExports].filter(
      (name) => !EXPECTED_MANAGEMENT_EXPORTS.has(name),
    );
    if (missingExports.length || extraExports.length) {
      failures.add(
        `Task 3.4 service export inventory differs (missing: ${missingExports.join(', ') || 'none'}; extra: ${extraExports.join(', ') || 'none'})`,
      );
    }
  }
  return [...failures].sort();
}
