import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Session } from 'next-auth';
import { Client } from 'pg';
import { createDatabaseClient } from '../src/lib/db';
import {
  AuthorizationError,
  decideAuthorization,
  requireAuthorizedDecision,
  routeDenialResponse,
} from '../src/lib/auth/authorization-core';
import {
  changeOwnPassword,
  authenticateCredentials,
  setApprovedAccountPassword,
  type AuthenticatedUser,
} from '../src/lib/auth/service';
import { AUTH_ROLES, type AuthRole } from '../src/lib/auth/constants';
import {
  PERMISSION_ACTIONS,
  PERMISSION_AREAS,
  PERMISSION_POLICY,
  hasPermission,
  hasPermissionInPolicy,
  permissionPolicyStructureFailures,
  type PermissionAction,
  type PermissionArea,
} from '../src/lib/auth/permissions';
import { createSessionClaims, validateSessionClaims } from '../src/lib/auth/session';
import { ROUTE_INVENTORY } from '../src/lib/auth/route-inventory';
import {
  discoverAuthorizationEntrypoints,
  proxyExemptionFailures,
  routeInventoryFailures,
} from './lib/authorization-route-inventory';

type MutablePolicy = Record<string, Record<string, Record<string, boolean>>>;

const OPERATIONAL_AREAS = [
  'clients',
  'contacts',
  'matters',
  'hearings',
  'powersOfAttorney',
  'documents',
  'feeLetters',
  'clientLogoUpload',
] as const satisfies readonly PermissionArea[];

function permissionKey(area: PermissionArea, action: PermissionAction): string {
  return `${area}/${action}`;
}

function expectedAllowed(): Record<AuthRole, ReadonlySet<string>> {
  const operationalEdit = OPERATIONAL_AREAS.flatMap((area) => [
    permissionKey(area, 'view'),
    permissionKey(area, 'create'),
    permissionKey(area, 'update'),
  ]);
  const operationalView = OPERATIONAL_AREAS.map((area) => permissionKey(area, 'view'));
  const universal = [
    permissionKey('billing', 'view'),
    permissionKey('reports', 'run'),
    permissionKey('reports', 'export'),
    permissionKey('staff', 'view'),
  ];
  const adminWorkEdit = ['view', 'create', 'update'].map((action) =>
    permissionKey('administrativeWorks', action as PermissionAction),
  );
  const adminWorkView = [permissionKey('administrativeWorks', 'view')];
  return {
    Administrator: new Set([
      ...operationalEdit,
      ...adminWorkEdit,
      ...universal,
      permissionKey('staff', 'manage'),
      permissionKey('usersAndRoles', 'view'),
      permissionKey('usersAndRoles', 'manage'),
      permissionKey('dropdownLists', 'view'),
      permissionKey('dropdownLists', 'manage'),
    ]),
    'Litigation Assistant': new Set([...operationalEdit, ...adminWorkEdit, ...universal]),
    Lawyer: new Set([...operationalView, ...adminWorkView, ...universal]),
    Paralegal: new Set([...operationalView, ...adminWorkEdit, ...universal]),
  };
}

const EXPECTED_ALLOWED = expectedAllowed();

function expectationFailures(policy: unknown): string[] {
  const failures: string[] = [];
  for (const role of AUTH_ROLES) {
    for (const area of PERMISSION_AREAS) {
      for (const action of PERMISSION_ACTIONS) {
        const expected = EXPECTED_ALLOWED[role].has(permissionKey(area, action));
        const actual = hasPermissionInPolicy(policy, role, area, action);
        if (actual !== expected)
          failures.push(`${role}/${area}/${action}: ${actual} != ${expected}`);
      }
    }
  }
  return failures;
}

function session(role: unknown, mustChangePassword = false): Session {
  return {
    expires: '2026-09-01T12:00:00.000Z',
    user: {
      id: '1',
      personId: 1,
      username: 'fixture',
      name: 'Fixture',
      role: role as AuthRole,
      mustChangePassword,
      sessionVersion: 0,
    },
  };
}

function directRouteHandler(
  validatedSession: Session | null,
  untrustedInput: Record<string, unknown>,
): Response {
  void untrustedInput;
  const decision = decideAuthorization(validatedSession, 'billing', 'update');
  return routeDenialResponse(decision) ?? new Response(null, { status: 204 });
}

function directServerAction(
  validatedSession: Session | null,
  untrustedInput: Record<string, unknown>,
): Session {
  void untrustedInput;
  return requireAuthorizedDecision(
    decideAuthorization(validatedSession, 'administrativeWorks', 'update'),
  );
}

function identifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/u);
  return `"${value}"`;
}

function migrate(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

async function proveDatabaseSessionAuthorization(): Promise<void> {
  const sourceUrl = process.env['DATABASE_URL'];
  assert.ok(sourceUrl, 'DATABASE_URL is required');
  const parsed = new URL(sourceUrl);
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname));
  assert.equal(parsed.port, '5433');
  const fixtureName = `litigation_permissions_fixture_${process.pid}_${Date.now()}`;
  const fixtureUrl = new URL(parsed);
  fixtureUrl.pathname = `/${fixtureName}`;
  const adminUrl = new URL(parsed);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  await admin.connect();
  try {
    assert.equal(
      (
        await admin.query<{ count: string }>(
          'SELECT count(*)::text count FROM pg_database WHERE datname=$1',
          [fixtureName],
        )
      ).rows[0]?.count,
      '0',
    );
    await admin.query(`CREATE DATABASE ${identifier(fixtureName)}`);
    created = true;
    migrate(fixtureUrl.toString());
    const database = createDatabaseClient(fixtureUrl.toString());
    try {
      const temporaryPassword = `P ${randomBytes(18).toString('base64url')}`;
      const permanentPassword = `Q ${randomBytes(18).toString('base64url')}`;
      await setApprovedAccountPassword('KHelmy', temporaryPassword, { database });
      const forcedUser = await authenticateCredentials(
        { username: 'KHelmy', password: temporaryPassword },
        { database },
      );
      assert.ok(forcedUser);
      const forcedClaims = createSessionClaims(forcedUser);
      const forcedSession = await validateSessionClaims(forcedClaims, { database });
      assert.ok(forcedSession?.mustChangePassword);
      assert.deepEqual(decideAuthorization(session(forcedSession.role, true), 'clients', 'view'), {
        allowed: false,
        reason: 'password-change-required',
      });

      assert.equal(
        await changeOwnPassword(
          {
            accountId: Number(forcedUser.id),
            sessionVersion: forcedUser.sessionVersion,
            currentPassword: temporaryPassword,
            newPassword: permanentPassword,
          },
          { database },
        ),
        'changed',
      );
      const administrator = await authenticateCredentials(
        { username: 'KHelmy', password: permanentPassword },
        { database },
      );
      assert.ok(administrator);
      const staleAdministratorClaims = createSessionClaims(administrator);
      await database.userAccount.update({
        where: { id: Number(administrator.id) },
        data: { roleCode: 'Lawyer', updatedAt: new Date() },
      });
      const refreshed = await validateSessionClaims(staleAdministratorClaims, { database });
      assert.equal(staleAdministratorClaims.role, 'Administrator');
      assert.equal(refreshed?.role, 'Lawyer');
      assert.equal(hasPermission(refreshed?.role, 'usersAndRoles', 'manage'), false);

      const account = await database.userAccount.findUniqueOrThrow({
        where: { id: Number(administrator.id) },
        select: {
          id: true,
          personId: true,
          username: true,
          roleCode: true,
          sessionVersion: true,
          person: { select: { nameAr: true } },
        },
      });
      await database.userAccount.update({
        where: { id: account.id },
        data: { isEnabled: false, sessionVersion: { increment: 1 }, updatedAt: new Date() },
      });
      const disabledState = await database.userAccount.findUniqueOrThrow({
        where: { id: account.id },
        select: { sessionVersion: true },
      });
      const disabledClaims = createSessionClaims({
        id: String(account.id),
        personId: account.personId,
        username: account.username,
        name: account.person.nameAr,
        role: account.roleCode as AuthRole,
        mustChangePassword: false,
        sessionVersion: disabledState.sessionVersion,
        rememberSession: false,
        authenticatedAt: Date.now(),
      } satisfies AuthenticatedUser);
      assert.equal(await validateSessionClaims(disabledClaims, { database }), null);

      await database.userAccount.update({
        where: { id: account.id },
        data: { isEnabled: true, sessionVersion: { increment: 1 }, updatedAt: new Date() },
      });
      await database.person.update({
        where: { id: account.personId },
        data: { isActive: false, updatedAt: new Date() },
      });
      const inactiveState = await database.userAccount.findUniqueOrThrow({
        where: { id: account.id },
        select: { sessionVersion: true },
      });
      const inactiveClaims = createSessionClaims({
        id: String(account.id),
        personId: account.personId,
        username: account.username,
        name: account.person.nameAr,
        role: account.roleCode as AuthRole,
        mustChangePassword: false,
        sessionVersion: inactiveState.sessionVersion,
        rememberSession: false,
        authenticatedAt: Date.now(),
      } satisfies AuthenticatedUser);
      assert.equal(await validateSessionClaims(inactiveClaims, { database }), null);
    } finally {
      await database.$disconnect();
    }
  } finally {
    if (created) {
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
        [fixtureName],
      );
      await admin.query(`DROP DATABASE ${identifier(fixtureName)}`);
    }
    await admin.end();
  }
}

async function main(): Promise<void> {
  assert.deepEqual(permissionPolicyStructureFailures(PERMISSION_POLICY), []);
  assert.deepEqual(expectationFailures(PERMISSION_POLICY), []);
  assert.equal(AUTH_ROLES.length * PERMISSION_AREAS.length * PERMISSION_ACTIONS.length, 336);

  for (const role of AUTH_ROLES) {
    assert.equal(hasPermission(role, 'billing', 'view'), true);
    for (const action of ['create', 'update', 'manage', 'run', 'export'] as const) {
      assert.equal(hasPermission(role, 'billing', action), false);
    }
    assert.equal(hasPermission(role, 'reports', 'run'), true);
    assert.equal(hasPermission(role, 'reports', 'export'), true);
  }
  assert.equal(hasPermission('Paralegal', 'administrativeWorks', 'create'), true);
  assert.equal(hasPermission('Paralegal', 'administrativeWorks', 'update'), true);
  assert.equal(hasPermission('Paralegal', 'matters', 'update'), false);
  assert.equal(hasPermission('Litigation Assistant', 'feeLetters', 'update'), true);
  assert.equal(hasPermission('Litigation Assistant', 'usersAndRoles', 'manage'), false);
  assert.equal(hasPermission('Administrator', 'staff', 'manage'), true);
  assert.equal(hasPermission('Administrator', 'usersAndRoles', 'manage'), true);
  assert.equal(hasPermission('Administrator', 'dropdownLists', 'manage'), true);
  assert.equal(hasPermission('Administrator', 'clients', 'manage'), false);
  assert.equal(hasPermission('Administrator', 'clients', 'delete'), false);
  assert.equal(hasPermission('Unknown', 'clients', 'view'), false);
  assert.equal(hasPermission({ toString: () => 'Administrator' }, 'clients', 'view'), false);
  assert.equal(hasPermission('Administrator', 'unknown', 'view'), false);
  assert.equal(hasPermission('Administrator', 'clients', 'unknown'), false);

  const weakened = structuredClone(PERMISSION_POLICY) as MutablePolicy;
  weakened['Lawyer']!['billing']!['update'] = true;
  assert.match(expectationFailures(weakened).join('; '), /Lawyer\/billing\/update/u);
  const missing = structuredClone(PERMISSION_POLICY) as MutablePolicy;
  delete missing['Administrator']!['clients'];
  assert.match(permissionPolicyStructureFailures(missing).join('; '), /Administrator\/clients/u);

  assert.equal(routeDenialResponse(decideAuthorization(null, 'clients', 'view'))?.status, 401);
  assert.equal(
    routeDenialResponse(decideAuthorization(session('Lawyer'), 'clients', 'update'))?.status,
    403,
  );
  assert.equal(
    routeDenialResponse(decideAuthorization(session('Lawyer'), 'clients', 'view')),
    null,
  );
  assert.equal(
    directRouteHandler(session('Lawyer'), {
      role: 'Administrator',
      headers: { role: 'Administrator' },
      query: { role: 'Administrator' },
      cookie: { role: 'Administrator' },
    }).status,
    403,
  );
  assert.throws(
    () => directServerAction(session('Lawyer'), { role: 'Administrator' }),
    (error: unknown) =>
      error instanceof AuthorizationError && error.status === 403 && error.reason === 'forbidden',
  );
  assert.equal(directServerAction(session('Paralegal'), { role: 'Lawyer' }).user.role, 'Paralegal');
  assert.throws(
    () => directServerAction(null, { role: 'Administrator' }),
    (error: unknown) => error instanceof AuthorizationError && error.status === 401,
  );

  const discovered = discoverAuthorizationEntrypoints(process.cwd());
  assert.deepEqual(routeInventoryFailures(discovered), []);
  assert.deepEqual(proxyExemptionFailures(process.cwd()), []);
  const authorizationSource = readFileSync('src/lib/auth/authorization.ts', 'utf8');
  assert.match(authorizationSource, /^import 'server-only';/u);
  assert.match(authorizationSource, /const session = await auth\(\)/u);
  const denialSource = readFileSync('src/app/forbidden/route.ts', 'utf8');
  assert.match(denialSource, /status: 403/u);
  assert.match(denialSource, /const session = await auth\(\)/u);
  assert.doesNotMatch(denialSource, /[\u0600-\u06ff]/u);

  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'litigation-route-inventory-'));
  try {
    const fixtureRoute = path.join(fixtureRoot, 'src', 'app', 'unclassified', 'page.tsx');
    mkdirSync(path.dirname(fixtureRoute), { recursive: true });
    writeFileSync(fixtureRoute, 'export default function Page() { return null; }\n', 'utf8');
    assert.match(
      routeInventoryFailures(discoverAuthorizationEntrypoints(fixtureRoot), []).join('; '),
      /unclassified entrypoint/u,
    );

    const fixtureHandler = path.join(fixtureRoot, 'src', 'app', 'partial', 'route.ts');
    mkdirSync(path.dirname(fixtureHandler), { recursive: true });
    writeFileSync(
      fixtureHandler,
      `export async function GET() {
  return authorizeRoutePermission({ area: 'clients', action: 'view' });
}
export async function POST() {
  return new Response(null, { status: 204 });
}
`,
      'utf8',
    );
    const partialInventory = [
      {
        kind: 'route',
        source: 'src/app/partial/route.ts',
        exportName: 'GET',
        enforcementCall: 'authorizeRoutePermission',
        classification: { access: 'permission', area: 'clients', action: 'view' },
      },
      {
        kind: 'route',
        source: 'src/app/partial/route.ts',
        exportName: 'POST',
        enforcementCall: 'authorizeRoutePermission',
        classification: { access: 'permission', area: 'clients', action: 'create' },
      },
    ] as const;
    assert.match(
      routeInventoryFailures(discoverAuthorizationEntrypoints(fixtureRoot), partialInventory).join(
        '; ',
      ),
      /missing server enforcement authorizeRoutePermission: route:src\/app\/partial\/route\.ts#POST/u,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }

  const proxyOnly = ROUTE_INVENTORY.map((entry) =>
    entry.source === 'src/app/page.tsx' && entry.kind === 'page'
      ? {
          ...entry,
          enforcementCall: 'proxy',
          classification: { access: 'permission', area: 'clients', action: 'view' } as const,
        }
      : entry,
  );
  assert.match(routeInventoryFailures(discovered, proxyOnly).join('; '), /authoritative guard/u);

  const tasks = readFileSync('TASKS.md', 'utf8');
  assert.match(tasks, /- \[ \] \*\*3\.3 Audit columns\*\*/u);
  assert.match(tasks, /- \[ \] \*\*3\.4 User management\*\*/u);

  await proveDatabaseSessionAuthorization();

  console.log('PASS exhaustive permission matrix: 4 roles × 14 areas × 6 actions = 336 decisions');
  console.log('PASS fail-closed unknowns, billing/report rules, and independent mutation proofs');
  console.log('PASS direct route/action 401 and 403 denials ignore client-supplied roles');
  console.log('PASS database role refresh, forced-password, disabled and inactive denials');
  console.log('PASS every current page, HTTP handler and server action is explicitly inventoried');
  console.log('PASS unclassified, partially guarded handler and proxy-only fixture protections');
  console.log('PASS Task 3.3 auditing and Task 3.4 user management remain outstanding');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
