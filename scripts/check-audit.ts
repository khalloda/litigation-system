import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { resolve } from 'node:path';
import ts from 'typescript';
import {
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
  console.log(
    `check:audit self-test — ${negative.length + 1} semantic bypass fixtures rejected; ${positive.length} legitimate fixtures accepted; all 8 runtime extensions discovered and the exact generated-Prisma subtree excluded; all disposable files removed.`,
  );
}

function main(): void {
  if (process.argv.length === 3 && process.argv[2] === '--self-test') return selfTest();
  if (process.argv.length !== 2) throw new Error('use no argument or --self-test');

  const audit = source('src/lib/audit.ts');
  const database = source('src/lib/db.ts');
  const prisma = source('prisma.config.ts');
  const passwordCommand = source('scripts/auth-set-password.ts');
  const packageJson = JSON.parse(source('package.json')) as { scripts?: Record<string, string> };

  assert.match(database, /runtimeIdentity\.username !== 'litigation_runtime'/u);
  assert.match(prisma, /process\.env\['MIGRATION_DATABASE_URL'\]/u);
  assert.doesNotMatch(prisma, /process\.env\['MIGRATION_DATABASE_URL'\]\s*\?\?/u);
  assert.match(prisma, /must use separate principals/u);

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
  assert.match(packageJson.scripts?.['check'] ?? '', /npm run check:audit/u);
  console.log(
    `PASS ${runtimeSources.length} project runtime sources use the exact reviewed audit gateway and call-site inventory`,
  );
  console.log('PASS request data cannot select human or system audit context');
  console.log('PASS runtime and migration database principals are statically separated');
}

main();
