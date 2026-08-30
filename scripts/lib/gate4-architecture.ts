import { readFile } from 'node:fs/promises';
import ts from 'typescript';

export type Gate4ArchitectureSources = Readonly<{
  database: string;
  sourceReports: string;
  runner: string;
}>;

const REQUIRED_DATABASE_ORACLES = [
  './matter-reconciliation',
  './matter-relationship-reconciliation',
  './hearing-reconciliation',
  './admin-reconciliation',
  './billing-reconciliation',
] as const;

const WRITER_OR_TRANSFORM_PLANNER =
  /\/(?:[^/]*transform[^/]*|matter-relationship-plan|client-logo-plan|[^/]*writer[^/]*)$/u;

export function gate4ModuleImports(source: string): readonly string[] {
  const file = ts.createSourceFile(
    'gate4-architecture.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      imports.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      imports.push(node.arguments[0]!.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return imports;
}

function hasFunction(source: string, name: string, exported: boolean): boolean {
  const file = ts.createSourceFile(
    'gate4-architecture.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return file.statements.some(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === name &&
      (!exported ||
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ===
          true),
  );
}

export function gate4ArchitectureFailures(sources: Gate4ArchitectureSources): string[] {
  const failures: string[] = [];
  const databaseImports = gate4ModuleImports(sources.database);
  const sourceImports = gate4ModuleImports(sources.sourceReports);
  const runnerImports = gate4ModuleImports(sources.runner);

  for (const oracle of REQUIRED_DATABASE_ORACLES) {
    if (!databaseImports.includes(oracle)) failures.push(`database reader omits ${oracle}`);
  }
  if (
    databaseImports.some(
      (name) => name.includes('gate4-source-reports') || WRITER_OR_TRANSFORM_PLANNER.test(name),
    )
  )
    failures.push('database reader imports the Access-side builder or a transform writer/planner');
  if (
    sourceImports.some(
      (name) =>
        /(?:gate4-database|reconciliation)(?:$|[-/])/u.test(name) ||
        WRITER_OR_TRANSFORM_PLANNER.test(name),
    )
  )
    failures.push('Access-side report builder imports a target writer, planner or oracle');
  if (!sourceImports.includes('./gate4-extraction'))
    failures.push('Access-side report builder is not rooted in the extracted CSV reader');
  if (!runnerImports.includes('./lib/gate4-database'))
    failures.push('Gate 4 runner omits the independent PostgreSQL reader');
  if (!runnerImports.includes('./lib/gate4-source-reports'))
    failures.push('Gate 4 runner omits the independent Access-side builder');
  if (runnerImports.some((name) => WRITER_OR_TRANSFORM_PLANNER.test(name)))
    failures.push('Gate 4 runner imports a transform writer or planner');
  if (!hasFunction(sources.database, 'loadReports', false))
    failures.push('PostgreSQL report SQL is not implemented in the database reader');
  if (!hasFunction(sources.sourceReports, 'buildGate4SourceReports', true))
    failures.push('Access report construction is not implemented in the source reader');
  return failures;
}

export async function gate4RepositoryArchitectureFailures(): Promise<string[]> {
  const [database, sourceReports, runner] = await Promise.all([
    readFile(new URL('./gate4-database.ts', import.meta.url), 'utf8'),
    readFile(new URL('./gate4-source-reports.ts', import.meta.url), 'utf8'),
    readFile(new URL('../reconcile-gate4.ts', import.meta.url), 'utf8'),
  ]);
  return gate4ArchitectureFailures({ database, sourceReports, runner });
}
