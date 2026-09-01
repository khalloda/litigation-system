import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

function applicationSources(directory = 'src/app'): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(resolve(directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...applicationSources(path));
    else if (entry.isFile() && /\.[cm]?[jt]sx?$/u.test(entry.name)) paths.push(path);
  }
  return paths.sort();
}

function main(): void {
  const audit = source('src/lib/audit.ts');
  const database = source('src/lib/db.ts');
  const prisma = source('prisma.config.ts');
  const service = source('src/lib/auth/service.ts');
  const login = source('src/app/login/actions.ts');
  const changePassword = source('src/app/change-password/actions.ts');
  const passwordCommand = source('scripts/auth-set-password.ts');
  const packageJson = JSON.parse(source('package.json')) as { scripts?: Record<string, string> };

  assert.match(database, /runtimeIdentity\.username !== 'litigation_runtime'/u);
  assert.match(prisma, /process\.env\['MIGRATION_DATABASE_URL'\]/u);
  assert.doesNotMatch(prisma, /process\.env\['MIGRATION_DATABASE_URL'\]\s*\?\?/u);
  assert.match(prisma, /must use separate principals/u);

  assert.match(audit, /audit_set_human_context\(\$\{accountId\}\)/u);
  assert.match(audit, /audit_set_authentication_context\(\)/u);
  assert.match(audit, /audit_set_administration_context\(\)/u);
  assert.match(audit, /audit_set_migration_context\(\)/u);
  assert.doesNotMatch(audit, /actorKey|actorId:\s*number|systemActor/u);
  assert.doesNotMatch(audit, /set_config|\bSET\s+(?:LOCAL|SESSION)\b/iu);

  assert.equal((service.match(/setAuthenticationAuditContext\(tx\)/gu) ?? []).length, 1);
  assert.equal((service.match(/setHumanAuditContext\(tx, account\.id\)/gu) ?? []).length, 1);
  assert.equal((service.match(/setAdministrationAuditContext\(tx\)/gu) ?? []).length, 1);
  assert.doesNotMatch(service, /credentials\?\.(?:actor|createdBy|updatedBy)/u);
  assert.doesNotMatch(service, /setMigrationAuditContext/u);

  assert.deepEqual(
    [...login.matchAll(/formData\.get\('([^']+)'\)/gu)].map((match) => match[1]),
    ['username', 'password', 'rememberMe'],
  );
  assert.deepEqual(
    [...changePassword.matchAll(/formData\.get\('([^']+)'\)/gu)].map((match) => match[1]),
    ['currentPassword', 'newPassword', 'confirmPassword'],
  );
  assert.match(changePassword, /accountId: Number\(session\.user\.id\)/u);
  assert.doesNotMatch(changePassword, /accountId:\s*Number\(formData/u);
  assert.match(passwordCommand, /database: migrationDb/u);

  const ingressTerms =
    /\b(?:actorId|actorKey|auditActor|createdBy|updatedBy|system_migration|system_authentication|system_administration)\b/u;
  for (const path of applicationSources()) {
    assert.doesNotMatch(source(path), ingressTerms, `${path} exposes an actor-selection ingress`);
  }

  assert.equal(packageJson.scripts?.['check:audit'], 'tsx scripts/check-audit.ts');
  assert.match(packageJson.scripts?.['check'] ?? '', /npm run check:audit/u);
  console.log(
    'PASS actor selection is absent from forms, bodies, headers, cookies and query inputs',
  );
  console.log(
    'PASS authentication, human, administration and migration contexts are fixed server paths',
  );
  console.log('PASS runtime and migration database principals are statically separated');
}

main();
