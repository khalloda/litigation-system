import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { resolve } from 'node:path';
import ts from 'typescript';
import {
  AUDIT_RUNTIME_SOURCE_EXTENSIONS,
  auditRuntimeSourceFailures,
  discoverAuditRuntimeSources,
  type AuditRuntimeSource,
} from './lib/audit-source-inventory';

function source(filePath: string): string {
  return readFileSync(resolve(filePath), 'utf8');
}

function parsed(filePath: string): ts.SourceFile {
  return ts.createSourceFile(filePath, source(filePath), ts.ScriptTarget.Latest, true);
}

function normalizedPath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/\/+$/u, '').toLowerCase();
}

export function isD35TestScriptPath(scriptPath: string, scriptsRoot = resolve('scripts')): boolean {
  const root = normalizedPath(scriptsRoot);
  const candidate = normalizedPath(scriptPath);
  if (!candidate.startsWith(`${root}/`)) return false;
  const relative = candidate.slice(root.length + 1);
  return !relative.includes('/') && relative.startsWith('test-');
}

export function d35ScriptSources(directory = resolve('scripts')): string[] {
  const files: string[] = [];
  const extensions = new Set(AUDIT_RUNTIME_SOURCE_EXTENSIONS);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...d35ScriptSources(target));
    else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(target);
    }
  }
  return files;
}

function d35ScriptKind(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath).toLowerCase()) {
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.tsx':
      return ts.ScriptKind.TSX;
    default:
      return ts.ScriptKind.TS;
  }
}

export function d35ScriptSourceFailures(
  scriptPath: string,
  scriptSource: string,
  scriptsRoot = resolve('scripts'),
): string[] {
  const failures: string[] = [];
  const sourceFile = ts.createSourceFile(
    scriptPath,
    scriptSource,
    ts.ScriptTarget.Latest,
    true,
    d35ScriptKind(scriptPath),
  );
  let migrationEnvironmentReferences = 0;
  let clientConstructions = 0;
  let principalSessionChecks = 0;
  let migrationDatabaseReferences = 0;
  let awaitedMigrationPrincipal = 0;
  const postgresqlClientBindings = new Set(['Client']);
  const principalSessionBindings = new Set(['assertApprovedMigrationPrincipalSession']);
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const element of node.importClause.namedBindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (node.moduleSpecifier.text === 'pg' && imported === 'Client') {
          postgresqlClientBindings.add(element.name.text);
        }
        if (
          /(?:^|[/\\])lib[/\\]migration-principal$/u.test(node.moduleSpecifier.text) &&
          imported === 'assertApprovedMigrationPrincipalSession'
        ) {
          principalSessionBindings.add(element.name.text);
        }
      }
    }
    if (
      (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) &&
      node.text === 'MIGRATION_DATABASE_URL'
    ) {
      migrationEnvironmentReferences += 1;
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      postgresqlClientBindings.has(node.expression.text)
    ) {
      clientConstructions += 1;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      principalSessionBindings.has(node.expression.text)
    ) {
      principalSessionChecks += 1;
    }
    if (ts.isIdentifier(node) && node.text === 'migrationDb') {
      migrationDatabaseReferences += 1;
    }
    if (
      ts.isAwaitExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'migrationPrincipalReady'
    ) {
      awaitedMigrationPrincipal += 1;
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);

  if (
    /node_modules[/\\]prisma[/\\]build[/\\]index\.js[\s\S]{0,120}['"]migrate['"]/u.test(
      scriptSource,
    )
  ) {
    failures.push(`${scriptPath} bypasses the D35 migration-principal runner`);
  }
  if (
    !isD35TestScriptPath(scriptPath, scriptsRoot) &&
    normalizedPath(scriptPath) !== normalizedPath(resolve('scripts/check-audit.ts')) &&
    normalizedPath(scriptPath) !== normalizedPath(resolve('scripts/lib/migration-principal.ts')) &&
    migrationEnvironmentReferences > 0 &&
    clientConstructions > 0 &&
    principalSessionChecks < 1
  ) {
    failures.push(
      `${scriptPath} connects controlled PostgreSQL tooling without the D35 principal preflight`,
    );
  }
  if (
    normalizedPath(scriptPath) !== normalizedPath(resolve('scripts/lib/migration-db.ts')) &&
    migrationDatabaseReferences > 0 &&
    awaitedMigrationPrincipal === 0
  ) {
    failures.push(
      `${scriptPath} can use the migration Prisma client before the D35 principal preflight`,
    );
  }
  return failures;
}

function formDataKeys(sourceFile: ts.SourceFile): string[] {
  const keys: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'formData' &&
      node.expression.name.text === 'get' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      keys.push(node.arguments[0]!.text);
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return keys;
}

function accountIdExpressions(sourceFile: ts.SourceFile): string[] {
  const expressions: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === 'accountId') ||
        (ts.isStringLiteral(node.name) && node.name.text === 'accountId'))
    ) {
      expressions.push(node.initializer.getText(sourceFile).replace(/\s+/gu, ''));
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return expressions;
}

function selfTest(): void {
  const legitimateRuntime = discoverAuditRuntimeSources(process.cwd());
  assert.deepEqual(
    auditRuntimeSourceFailures(legitimateRuntime),
    [],
    'the complete legitimate runtime source and six reviewed SQL calls failed',
  );
  const alteredReviewedSql = legitimateRuntime.map((runtimeSource) =>
    runtimeSource.path === 'src/lib/audit.ts'
      ? {
          ...runtimeSource,
          text: runtimeSource.text.replace(
            'audit_set_authentication_context()::text AS audit_context',
            'audit_set_authentication_context()::varchar AS audit_context',
          ),
        }
      : runtimeSource,
  );
  assert.ok(
    auditRuntimeSourceFailures(alteredReviewedSql).some((failure) =>
      failure.includes('call fingerprint'),
    ),
    'a reviewed SQL-template change retained approval without a new fingerprint',
  );
  const gateway: AuditRuntimeSource = {
    path: 'src/lib/audit.ts',
    text: `export async function setHumanAuditContext(tx: any, id: number) {}
export async function setAuthenticationAuditContext(tx: any) {}
export async function setAdministrationAuditContext(tx: any) {}
export async function setMigrationAuditContext(tx: any) {}`,
  };
  const service: AuditRuntimeSource = {
    path: 'src/lib/auth/service.ts',
    text: `import { setAdministrationAuditContext, setAuthenticationAuditContext, setHumanAuditContext } from '@/lib/audit';
export async function authenticateCredentials(tx: any) { await setAuthenticationAuditContext(tx); }
export async function changeOwnPassword(tx: any, account: any) { await setHumanAuditContext(tx, account.id); }
export async function setApprovedAccountPassword(tx: any) { await setAdministrationAuditContext(tx); }`,
  };
  const failures = (extra: readonly AuditRuntimeSource[], serviceSuffix = ''): string[] =>
    auditRuntimeSourceFailures(
      [gateway, { ...service, text: service.text + serviceSuffix }, ...extra],
      { enforceReviewedCallsites: false },
    );

  const positive: readonly AuditRuntimeSource[] = [
    {
      path: 'src/app/ordinary/actions.ts',
      text: `'use server';\nexport async function save(formData: FormData) { return formData.get('person'); }`,
    },
    {
      path: 'src/app/literal-dynamic.ts',
      text: `export async function navigate() { return import('next/navigation'); }`,
    },
    {
      path: 'src/lib/safe-reflection.ts',
      text: `interface SafeObject { value: number; run(): number }
const safe: SafeObject = { value: 1, run: () => 1 };
export function inspect(key: keyof SafeObject) {
  return [safe[key], Reflect.get(safe, key), Object.getOwnPropertyDescriptor(safe, key)];
}`,
    },
  ];
  assert.deepEqual(failures(positive), [], 'legitimate semantic source fixture failed');
  assert.ok(
    auditRuntimeSourceFailures(
      [
        {
          ...gateway,
          text: `${gateway.text}\nexport const exposed = setHumanAuditContext;`,
        },
        service,
      ],
      { enforceReviewedCallsites: false },
    ).length > 0,
    'audit gateway helper exposure was not rejected',
  );

  const negative: ReadonlyArray<
    readonly [label: string, extra: readonly AuditRuntimeSource[], serviceSuffix?: string]
  > = [
    [
      'helper local alias and request actor',
      [],
      `\nconst delegated = setHumanAuditContext;\nexport async function unsafe(formData: FormData, tx: any) { return delegated(tx, Number(formData.get('person'))); }`,
    ],
    [
      'auth-service helper re-export and renamed invocation',
      [
        {
          path: 'src/lib/reexport-user.ts',
          text: `import { exposed as invoke } from '@/lib/auth/service';\nexport const unsafe = (tx: any) => invoke(tx, 1);`,
        },
      ],
      `\nexport { setHumanAuditContext as exposed };`,
    ],
    [
      'equivalent normalized audit path',
      [
        {
          path: 'src/lib/normalized.ts',
          text: `import { setMigrationAuditContext as invoke } from '@/lib/../lib/audit';\nexport const unsafe = (tx: any) => invoke(tx);`,
        },
      ],
    ],
    [
      'ImportEquals alias',
      [
        {
          path: 'src/lib/import-equals.ts',
          text: `import audit = require('@/lib/audit');\nconst hidden = audit.setMigrationAuditContext;\nexport const unsafe = (tx: any) => hidden(tx);`,
        },
      ],
    ],
    [
      'variable dynamic import',
      [
        {
          path: 'src/lib/dynamic.ts',
          text: `const target = ['@/lib/', 'audit'].join('');\nexport async function unsafe(tx: any) { const audit = await import(target); return audit.setMigrationAuditContext(tx); }`,
        },
      ],
    ],
    [
      'variable CommonJS require',
      [
        {
          path: 'src/lib/commonjs.ts',
          text: `const loader = require;\nexport const unsafe = (target: string) => loader(target);`,
        },
      ],
    ],
    [
      'computed CommonJS require',
      [
        {
          path: 'src/lib/computed-require.ts',
          text: `const load=module['requ'+'ire']; export const unsafe=()=>load('@/lib/audit');`,
        },
      ],
    ],
    [
      'runtime-constructed raw SQL',
      [
        {
          path: 'src/lib/computed-sql.ts',
          text: `const command=['SET','LOCAL'].join(' '); const a=['litigation.','audit_'].join(''); const b=['actor_','id'].join('');\nexport const unsafe=(tx:any)=>tx.$executeRawUnsafe([command,a+b,'=1'].join(' '));`,
        },
      ],
    ],
    [
      'project-owned executable outside src',
      [
        {
          path: 'outside-runtime.ts',
          text: `import { setMigrationAuditContext as hidden } from '@/lib/audit';\nexport const outside = (tx: any) => hidden(tx);`,
        },
        {
          path: 'src/lib/outside-user.ts',
          text: `export { outside } from '../../outside-runtime';`,
        },
      ],
    ],
    [
      'direct PostgreSQL client',
      [
        {
          path: 'src/lib/direct-pg.ts',
          text: `import { Client } from 'pg'; export const db=Client;`,
        },
      ],
    ],
    [
      'eval',
      [{ path: 'src/lib/eval.ts', text: `export const unsafe = (code: string) => eval(code);` }],
    ],
    [
      'Function constructor alias',
      [
        {
          path: 'src/lib/function.ts',
          text: `const Build = Function; export const unsafe=Build('return 1');`,
        },
      ],
    ],
    [
      'computed global Function constructor alias',
      [
        {
          path: 'src/lib/computed-function.ts',
          text: `const Build=globalThis['Fun'+'ction']; export const unsafe=Build('return 1');`,
        },
      ],
    ],
    [
      'destructured raw SQL method',
      [
        {
          path: 'src/lib/destructured-sql.ts',
          text: `export const unsafe=(tx:any)=>{ const {$queryRaw:run}=tx; return run('SELECT 1'); };`,
        },
      ],
    ],
    [
      'constant-identifier bracket extraction and call',
      [
        {
          path: 'src/lib/extracted-sql.ts',
          text: `const method = '$executeRawUnsafe';
export async function unsafe(tx: any, sqlFromRequest: string) {
  const execute = tx[method];
  return execute.call(tx, sqlFromRequest);
}`,
        },
      ],
    ],
    [
      'multi-step assignment and parameter aliases',
      [
        {
          path: 'src/lib/aliased-sql.ts',
          text: `function invoke(fn: (...args: any[]) => unknown, receiver: unknown, sql: string) {
  const first = fn;
  let second: typeof first;
  second = first;
  return second.call(receiver, sql);
}
export function unsafe(tx: any, selected: string, sql: string) {
  const capability = tx[selected];
  return invoke(capability, tx, sql);
}`,
        },
      ],
    ],
    [
      'concatenated raw SQL key',
      [
        {
          path: 'src/lib/concatenated-sql.ts',
          text: `const prefix = '$execute'; const suffix = 'RawUnsafe';
export const unsafe = (tx: unknown, sql: string) => (tx as any)[prefix + suffix](sql);`,
        },
      ],
    ],
    [
      'template-computed raw SQL key',
      [
        {
          path: 'src/lib/template-sql.ts',
          text: `const kind = 'execute'; const safety = 'Unsafe';
export const unsafe = (tx: unknown, sql: string) => (tx as unknown as any)[\`$\${kind}Raw\${safety}\`](sql);`,
        },
      ],
    ],
    [
      'request-selected callable member',
      [
        {
          path: 'src/lib/request-selected-sql.ts',
          text: `export const unsafe = (tx: any, selected: string, sql: string) => tx[selected](sql);`,
        },
      ],
    ],
    [
      'wrapper return and exported wrapper',
      [
        {
          path: 'src/lib/wrapper-sql.ts',
          text: `export function extract(tx: any, selected: string) { return tx[selected]; }
export function wrapper(tx: any, selected: string) {
  const capability = extract(tx, selected);
  return (...args: unknown[]) => capability(...args);
}`,
        },
      ],
    ],
    [
      'cross-module capability propagation',
      [
        {
          path: 'src/lib/capability-source.ts',
          text: `export function extract(tx: any, selected: string) { return tx[selected]; }`,
        },
        {
          path: 'src/lib/capability-user.ts',
          text: `import { extract } from './capability-source';
export const unsafe = (tx: any, selected: string, sql: string) => extract(tx, selected)(sql);`,
        },
      ],
    ],
    [
      'call apply and bind invocation',
      [
        {
          path: 'src/lib/call-apply-bind-sql.ts',
          text: `export function unsafe(tx: any, selected: string, sql: string) {
  const capability = tx[selected];
  capability.call(tx, sql);
  capability.apply(tx, [sql]);
  return capability.bind(tx)(sql);
}`,
        },
      ],
    ],
    [
      'Reflect get and apply invocation',
      [
        {
          path: 'src/lib/reflect-sql.ts',
          text: `export function unsafe(tx: any, selected: string, sql: string) {
  return Reflect.apply(Reflect.get(tx, selected), tx, [sql]);
}`,
        },
      ],
    ],
    [
      'property-descriptor extraction',
      [
        {
          path: 'src/lib/descriptor-sql.ts',
          text: `export function unsafe(tx: any, selected: string, sql: string) {
  const descriptor = Object.getOwnPropertyDescriptor(tx, selected);
  return descriptor!.value.call(tx, sql);
}`,
        },
      ],
    ],
    [
      'request-selected destructuring',
      [
        {
          path: 'src/lib/destructured-request-sql.ts',
          text: `export function unsafe(tx: any, selected: string, sql: string) {
  const { [selected]: capability } = tx;
  return capability(sql);
}`,
        },
      ],
    ],
    [
      'computed property-descriptor reflection',
      [
        {
          path: 'src/lib/computed-descriptor-sql.ts',
          text: `const descriptor = 'getOwn' + 'PropertyDescriptor';
export function unsafe(tx: any, selected: string, sql: string) {
  return Object[descriptor](tx, selected)!.value.apply(tx, [sql]);
}`,
        },
      ],
    ],
    [
      'optional and parenthesized invocation',
      [
        {
          path: 'src/lib/optional-sql.ts',
          text: `export function unsafe(tx: any, selected: string, sql: string) {
  return ((tx as any)?.[selected])?.(sql);
}`,
        },
      ],
    ],
    [
      'any and unknown cast erasure',
      [
        {
          path: 'src/lib/cast-sql.ts',
          text: `export function unsafe(tx: unknown, selected: string, sql: string) {
  const erased = ((tx as unknown) as any)!;
  return erased[selected](sql);
}`,
        },
      ],
    ],
    [
      'type-laundered structural callable map',
      [
        {
          path: 'src/lib/type-laundered-sql.ts',
          text: `type HarmlessCallableMap = Record<string, (...args: any[]) => unknown>;
export function unsafe(tx: unknown, selected: string, sql: string) {
  const disguised = tx as HarmlessCallableMap;
  const execute = disguised[selected];
  return execute.call(tx, sql);
}`,
        },
      ],
    ],
    [
      'type-laundered wrapper return',
      [
        {
          path: 'src/lib/returned-type-launder.ts',
          text: `type Innocent = Record<string, (...args: unknown[]) => unknown>;
function disguise(value: unknown): Innocent { return value as Innocent; }
export function unsafe(tx: unknown, selected: string, sql: string) {
  const execute = disguise(tx)[selected];
  return execute.apply(tx, [sql]);
}`,
        },
      ],
    ],
    [
      'mutated property selector raw method',
      [
        {
          path: 'src/lib/mutated-selector-sql.ts',
          text: `const selector = { value: 'findMany' };
selector.value = '$executeRawUnsafe';
export function unsafe(tx: any, sql: string) {
  const execute = tx[selector.value];
  return execute.call(tx, sql);
}`,
        },
      ],
    ],
    [
      'externally mutable property selector',
      [
        {
          path: 'src/lib/external-selector-sql.ts',
          text: `const selector = { value: 'findMany' };
export function select(value: string) { selector.value = value; }
export function unsafe(tx: any, sql: string) {
  const execute = tx[selector.value];
  return execute.call(tx, sql);
}`,
        },
      ],
    ],
    [
      'local wrapper closes over an unproved capability',
      [
        {
          path: 'src/lib/closed-over-capability.ts',
          text: `type CallableMap = Record<string, (...args: any[]) => unknown>;
export function unsafe(tx: unknown, selected: string, wrapperKey: string, sql: string) {
  const wrapper = { capability: () => (tx as CallableMap)[selected] };
  return wrapper[wrapperKey]().call(tx, sql);
}`,
        },
      ],
    ],
    [
      'computed invocation selects audit actor',
      [
        {
          path: 'src/lib/computed-actor-sql.ts',
          text: `export function unsafe(tx: any, selected: string, actor: string) {
  const sql = ['SELECT set_', 'config(?, ?, true)'].join('');
  return tx[selected](sql, 'litigation.' + 'audit_actor_id', actor);
}`,
        },
      ],
    ],
    [
      'migration credential access from runtime',
      [
        {
          path: 'src/lib/migration-secret.ts',
          text: `export const unsafe = process.env.MIGRATION_DATABASE_URL;`,
        },
      ],
    ],
    [
      'computed migration credential and alternate runtime client',
      [
        {
          path: 'src/lib/computed-migration-client.ts',
          text: `import { createDatabaseClient } from '@/lib/db';
const migrationKey = ['MIGRATION', 'DATABASE', 'URL'].join('_');
export const unsafe = createDatabaseClient(process.env[migrationKey]!);`,
        },
      ],
    ],
    [
      'concatenated runtime environment key',
      [
        {
          path: 'src/lib/concatenated-environment.ts',
          text: `const key = 'MIGRATION_' + 'DATABASE_URL';
export const unsafe = process.env[key];`,
        },
      ],
    ],
    [
      'namespace access to alternate runtime database factory',
      [
        {
          path: 'src/lib/namespace-database-client.ts',
          text: `import * as databaseModule from '@/lib/db';
export const unsafe = databaseModule['createDatabaseClient'];`,
        },
      ],
    ],
    [
      'aliased runtime environment object',
      [
        {
          path: 'src/lib/aliased-environment.ts',
          text: `const environment = process.env;
export const unsafe = environment['DATABASE_URL'];`,
        },
      ],
    ],
    [
      'computed reviewed runtime environment key',
      [
        {
          path: 'src/lib/computed-environment.ts',
          text: `const key = 'DATABASE_URL';
export const unsafe = process.env[key];`,
        },
      ],
    ],
    [
      'aliased process object environment access',
      [
        {
          path: 'src/lib/aliased-process.ts',
          text: `const runtimeProcess = process;
export const unsafe = runtimeProcess.env.DATABASE_URL;`,
        },
      ],
    ],
    [
      'nested destructuring from the global process object',
      [
        {
          path: 'src/lib/destructured-process.ts',
          text: `const { env: { DATABASE_URL: runtimeUrl } } = process;
export const unsafe = runtimeUrl;`,
        },
      ],
    ],
    [
      'standalone raw SQL method literal',
      [
        {
          path: 'src/lib/raw-method-label.ts',
          text: `const local = { label: '$queryRawUnsafe' };
export function inspect() { return local.label; }`,
        },
      ],
    ],
    [
      'migration-only helper import from runtime',
      [
        {
          path: 'src/lib/migration-helper.ts',
          text: `export { migrationDb } from '../../../scripts/lib/migration-db';`,
        },
      ],
    ],
    [
      'controlled password administration import',
      [
        {
          path: 'src/app/unsafe-admin/actions.ts',
          text: `import { setApprovedAccountPassword as reset } from '@/lib/auth/service';\nexport const unsafe=(tx:any)=>reset(tx);`,
        },
      ],
    ],
    [
      'direct system actor selection',
      [{ path: 'src/lib/system-key.ts', text: `export const actor='system_authentication';` }],
    ],
  ];
  for (const [label, extra, suffix] of negative) {
    assert.ok(failures(extra, suffix).length > 0, `${label} bypass was not rejected`);
  }

  const root = mkdtempSync(path.join(tmpdir(), 'litigation-audit-source-'));
  try {
    mkdirSync(path.join(root, 'src', 'generated', 'prisma'), { recursive: true });
    for (const extension of ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts', '.cjs', '.cts']) {
      writeFileSync(path.join(root, 'src', `runtime${extension}`), 'export {};', 'utf8');
    }
    writeFileSync(
      path.join(root, 'src', 'generated', 'prisma', 'ignored.ts'),
      `import '@/lib/audit';`,
      'utf8',
    );
    assert.equal(discoverAuditRuntimeSources(root).length, 8);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }

  const d35Root = mkdtempSync(path.join(tmpdir(), 'litigation-d35-script-source-'));
  try {
    for (const extension of AUDIT_RUNTIME_SOURCE_EXTENSIONS) {
      writeFileSync(path.join(d35Root, `controlled${extension}`), 'export {};', 'utf8');
    }
    assert.deepEqual(
      d35ScriptSources(d35Root)
        .map((filePath) => path.extname(filePath).toLowerCase())
        .sort(),
      [...AUDIT_RUNTIME_SOURCE_EXTENSIONS].sort(),
    );
    const unguardedControlledSource = `import { Client as Connection } from 'pg';
const url = process.env.MIGRATION_DATABASE_URL;
export const database = new Connection({ connectionString: url });`;
    assert.equal(
      isD35TestScriptPath('C:\\repo\\scripts\\test-audit.ts', 'C:\\repo\\scripts'),
      true,
    );
    assert.equal(isD35TestScriptPath('/repo/scripts/test-audit.ts', '/repo/scripts'), true);
    assert.equal(
      d35ScriptSourceFailures(
        'C:\\repo\\scripts\\test-audit.ts',
        unguardedControlledSource,
        'C:\\repo\\scripts',
      ).length,
      0,
    );
    assert.equal(
      d35ScriptSourceFailures(
        '/repo/scripts/test-audit.ts',
        unguardedControlledSource,
        '/repo/scripts',
      ).length,
      0,
    );
    assert.match(
      d35ScriptSourceFailures(
        path.join(d35Root, 'controlled.mjs'),
        unguardedControlledSource,
        d35Root,
      ).join('; '),
      /without the D35 principal preflight/u,
    );
  } finally {
    rmSync(d35Root, { force: true, recursive: true });
  }
  console.log(
    `check:audit self-test — ${negative.length + 2} semantic/fingerprint bypass fixtures rejected; ${positive.length} focused legitimate fixtures plus the complete runtime and six fingerprinted SQL calls accepted; all 8 runtime and D35 script extensions discovered; Windows/POSIX test paths classified identically; unguarded JavaScript tooling rejected; the exact generated-Prisma subtree excluded; all disposable files removed.`,
  );
}

function main(): void {
  if (process.argv.length === 3 && process.argv[2] === '--self-test') return selfTest();
  if (process.argv.length !== 2) throw new Error('use no argument or --self-test');

  const audit = source('src/lib/audit.ts');
  const database = source('src/lib/db.ts');
  const prisma = source('prisma.config.ts');
  const migrationCommand = source('scripts/run-prisma-migration.ts');
  const migrationDatabase = source('scripts/lib/migration-db.ts');
  const passwordCommand = source('scripts/auth-set-password.ts');
  const packageJson = JSON.parse(source('package.json')) as { scripts?: Record<string, string> };

  assert.match(database, /runtimeIdentity\.username !== 'litigation_runtime'/u);
  assert.match(prisma, /process\.env\['MIGRATION_DATABASE_URL'\]/u);
  assert.doesNotMatch(prisma, /process\.env\['MIGRATION_DATABASE_URL'\]\s*\?\?/u);
  assert.match(prisma, /must use separate principals/u);
  assert.match(migrationCommand, /assertApprovedMigrationPrincipalUrl/u);
  assert.match(migrationDatabase, /migrationPrincipalReady = assertApprovedMigrationPrincipalUrl/u);

  assert.equal((audit.match(/audit_set_human_context/gu) ?? []).length, 1);
  assert.equal((audit.match(/audit_set_authentication_context/gu) ?? []).length, 1);
  assert.equal((audit.match(/audit_set_administration_context/gu) ?? []).length, 1);
  assert.equal((audit.match(/audit_set_migration_context/gu) ?? []).length, 1);
  assert.doesNotMatch(audit, /actorKey|actorId:\s*number|systemActor/u);
  assert.doesNotMatch(audit, /set_config|litigation\.audit_actor_id|\bSET\s+(?:LOCAL|SESSION)\b/iu);

  const login = parsed('src/app/login/actions.ts');
  const changePassword = parsed('src/app/change-password/actions.ts');
  assert.deepEqual(formDataKeys(login), ['username', 'password', 'rememberMe']);
  assert.deepEqual(formDataKeys(changePassword), [
    'currentPassword',
    'newPassword',
    'confirmPassword',
  ]);
  assert.deepEqual(accountIdExpressions(changePassword), ['Number(session.user.id)']);
  assert.match(passwordCommand, /database: migrationDb/u);

  const runtimeSources = discoverAuditRuntimeSources(process.cwd());
  const failures = auditRuntimeSourceFailures(runtimeSources);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`ERROR ${failure}`);
    process.exitCode = 1;
    return;
  }

  assert.equal(
    packageJson.scripts?.['check:audit'],
    'tsx scripts/check-audit.ts && tsx scripts/check-audit.ts --self-test',
  );
  assert.equal(packageJson.scripts?.['db:migrate'], 'tsx scripts/run-prisma-migration.ts dev');
  assert.equal(
    packageJson.scripts?.['db:migrate:deploy'],
    'tsx scripts/run-prisma-migration.ts deploy',
  );
  assert.equal(
    packageJson.scripts?.['db:migrate:status'],
    'tsx scripts/run-prisma-migration.ts status',
  );
  for (const scriptPath of d35ScriptSources()) {
    if (scriptPath === resolve('scripts/run-prisma-migration.ts')) continue;
    const scriptSource = source(scriptPath);
    assert.deepEqual(d35ScriptSourceFailures(scriptPath, scriptSource), []);
  }
  assert.match(packageJson.scripts?.['check'] ?? '', /npm run check:audit/u);
  console.log(
    `PASS ${runtimeSources.length} project runtime sources use the exact reviewed audit gateway and call-site inventory`,
  );
  console.log('PASS request data cannot select human or system audit context');
  console.log('PASS runtime and migration database principals are statically separated');
}

main();
