import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { dirname, resolve } from 'node:path';
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

function fixtureFailures(fixturePath: string, text: string): string[] {
  const root = mkdtempSync(path.join(tmpdir(), 'litigation-audit-source-'));
  try {
    const absolute = path.join(root, ...fixturePath.split('/'));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text, 'utf8');
    return auditRuntimeSourceFailures(discoverAuditRuntimeSources(root), {
      enforceReviewedCallsites: false,
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function selfTest(): void {
  const positive: readonly AuditRuntimeSource[] = [
    {
      path: 'src/app/ordinary/actions.ts',
      text: `'use server';\nexport async function save(formData: FormData) { return formData.get('person'); }`,
    },
    {
      path: 'src/lib/audit.ts',
      text: `export async function gateway(tx: any, id: number) { return tx.sql('audit_set_human_context', id); }`,
    },
    {
      path: 'src/lib/auth/service.ts',
      text: `import { setHumanAuditContext } from '@/lib/audit';\nasync function changeOwnPassword(tx: any, account: any) { await setHumanAuditContext(tx, account.id); }`,
    },
  ];
  for (const fixture of positive) {
    assert.deepEqual(
      fixtureFailures(fixture.path, fixture.text),
      [],
      `${fixture.path} legitimate fixture failed`,
    );
  }

  const negative: readonly AuditRuntimeSource[] = [
    {
      path: 'src/app/unsafe/actions.ts',
      text: `import { setHumanAuditContext } from '@/lib/audit';\nexport async function save(formData: FormData, tx: any) { await setHumanAuditContext(tx, Number(formData.get('person'))); }`,
    },
    {
      path: 'src/lib/unsafe-service.ts',
      text: `export async function save(tx: any, person: string) { return tx.$queryRawUnsafe('SELECT audit_set_human_context(' + person + ')'); }`,
    },
    {
      path: 'src/lib/guc-service.ts',
      text: `export async function save(tx: any) { return tx.$queryRawUnsafe("SELECT set_config('litigation.audit_actor_id','1',true)"); }`,
    },
    {
      path: 'src/lib/set-service.ts',
      text: `export async function save(tx: any) { return tx.$executeRawUnsafe("SET LOCAL litigation.audit_actor_id='1'"); }`,
    },
    {
      path: 'src/lib/system-service.ts',
      text: `import { setAuthenticationAuditContext } from '@/lib/audit';\nexport async function save(tx: any) { return setAuthenticationAuditContext(tx); }`,
    },
    {
      path: 'src/lib/admin-service.ts',
      text: `import { setAdministrationAuditContext as choose } from '@/lib/audit';\nexport async function save(tx: any) { return choose(tx); }`,
    },
    {
      path: 'src/lib/migration-service.ts',
      text: `const audit = require('@/lib/audit');\nexport async function save(tx: any) { return audit['setMigrationAuditContext'](tx); }`,
    },
    {
      path: 'src/lib/dynamic-service.ts',
      text: `export async function save(tx: any) { const audit = await import('@/lib/audit'); return audit.setHumanAuditContext(tx, 1); }`,
    },
    {
      path: 'src/lib/reexport.ts',
      text: `export { setHumanAuditContext } from '@/lib/audit';`,
    },
    {
      path: 'src/lib/computed-sql.ts',
      text: `export async function save(tx: any) { return tx.$queryRawUnsafe('audit_' + 'set_human_context(1)'); }`,
    },
    {
      path: 'src/lib/indirect-computed-sql.ts',
      text: `const query = 'SELECT audit_' + 'set_human_context(1)';\nexport async function save(tx: any) { return tx.$queryRawUnsafe(query); }`,
    },
    {
      path: 'src/lib/computed-import.ts',
      text: `export async function save(tx: any) { const audit = await import('@/lib/' + 'audit'); return audit['set' + 'HumanAuditContext'](tx, 1); }`,
    },
    {
      path: 'src/lib/key-selection.ts',
      text: `export const actor = 'system_authentication';`,
    },
    {
      path: 'src/app/unsafe-admin/actions.ts',
      text: `import { setApprovedAccountPassword } from '@/lib/auth/service';\nexport async function save(formData: FormData) { return setApprovedAccountPassword(String(formData.get('person')), String(formData.get('password'))); }`,
    },
  ];
  for (const fixture of negative) {
    assert.ok(
      fixtureFailures(fixture.path, fixture.text).length > 0,
      `${fixture.path} bypass was not rejected`,
    );
  }
  console.log(
    `check:audit self-test — ${negative.length} bypass fixtures rejected; ${positive.length} legitimate fixtures accepted; all disposable files removed.`,
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
