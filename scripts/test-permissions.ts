import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Session } from 'next-auth';
import { Client } from 'pg';
import { createDatabaseClient } from '../src/lib/db';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  AuthorizationError,
  decideAuthorization,
  requireAuthorizedDecision,
  routeDenialResponse,
  runAuthorizedAction,
  runAuthorizedRoute,
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
import {
  AUTHORIZATION_SOURCE_EXTENSIONS,
  NEXT_DEFAULT_PAGE_EXTENSIONS,
  type RouteInventoryEntry,
} from '../src/lib/auth/route-inventory';
import {
  authorizationSourceExclusionFailures,
  authorizationSourcePolicyFailures,
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

const ARCHIVABLE_AREAS = [
  ...OPERATIONAL_AREAS,
  'administrativeWorks',
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
  const operationalArchive = ARCHIVABLE_AREAS.flatMap((area) => [
    permissionKey(area, 'archive'),
    permissionKey(area, 'restore'),
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
      ...operationalArchive,
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
      auditSessionId: '00000000-0000-4000-8000-000000000001',
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

function permissionEntry(
  kind: RouteInventoryEntry['kind'],
  source: string,
  area: PermissionArea,
  action: PermissionAction,
  exportName?: string,
): RouteInventoryEntry {
  return {
    kind,
    source,
    exportName,
    classification: { access: 'permission', area, action },
  };
}

function staticFixture(
  files: Readonly<Record<string, string>>,
  inventory: readonly RouteInventoryEntry[],
): { failures: string[]; discoveredKeys: string[] } {
  const root = mkdtempSync(path.join(tmpdir(), 'litigation-authorization-fixture-'));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const absolute = path.join(root, relativePath);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, contents, 'utf8');
    }
    const discovered = discoverAuthorizationEntrypoints(root);
    return {
      failures: [
        ...authorizationSourcePolicyFailures(root),
        ...routeInventoryFailures(discovered, inventory),
      ],
      discoveredKeys: discovered.map((entry) => entry.key),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function assertStaticFailure(
  files: Readonly<Record<string, string>>,
  inventory: readonly RouteInventoryEntry[],
  pattern: RegExp,
): void {
  assert.match(staticFixture(files, inventory).failures.join('; '), pattern);
}

function identifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/u);
  return `"${value}"`;
}

function migrate(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function fixtureRuntimeUrl(fixtureOwnerUrl: URL): URL {
  const configured = process.env['DATABASE_URL'];
  assert.ok(configured, 'DATABASE_URL is required');
  const runtime = new URL(configured);
  assert.equal(runtime.username, 'litigation_runtime');
  runtime.protocol = fixtureOwnerUrl.protocol;
  runtime.hostname = fixtureOwnerUrl.hostname;
  runtime.port = fixtureOwnerUrl.port;
  runtime.pathname = fixtureOwnerUrl.pathname;
  return runtime;
}

async function proveDatabaseSessionAuthorization(): Promise<void> {
  const sourceUrl = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(sourceUrl, 'MIGRATION_DATABASE_URL is required');
  const parsed = new URL(sourceUrl);
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname));
  assert.equal(parsed.port, '5433');
  const fixtureName = `litigation_permissions_fixture_${process.pid}_${Date.now()}`;
  const fixtureUrl = new URL(parsed);
  fixtureUrl.pathname = `/${fixtureName}`;
  const runtimeUrl = fixtureRuntimeUrl(fixtureUrl);
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
    const database = createDatabaseClient(runtimeUrl.toString());
    const migrationDatabase = new PrismaClient({
      adapter: new PrismaPg({ connectionString: fixtureUrl.toString() }),
    });
    const runtimeProbe = new Client({ connectionString: runtimeUrl.toString() });
    await runtimeProbe.connect();
    try {
      assert.deepEqual(
        (
          await runtimeProbe.query<{ current_user: string; session_user: string }>(
            'SELECT current_user,session_user',
          )
        ).rows[0],
        { current_user: 'litigation_runtime', session_user: 'litigation_runtime' },
      );
      const temporaryPassword = `P ${randomBytes(18).toString('base64url')}`;
      const permanentPassword = `Q ${randomBytes(18).toString('base64url')}`;
      await setApprovedAccountPassword('KHelmy', temporaryPassword, {
        database: migrationDatabase,
      });
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
      await migrationDatabase.userAccount.update({
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
      await migrationDatabase.userAccount.update({
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
        auditSessionId: '00000000-0000-4000-8000-000000000002',
      } satisfies AuthenticatedUser);
      assert.equal(await validateSessionClaims(disabledClaims, { database }), null);

      await migrationDatabase.userAccount.update({
        where: { id: account.id },
        data: { isEnabled: true, sessionVersion: { increment: 1 }, updatedAt: new Date() },
      });
      await migrationDatabase.person.update({
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
        auditSessionId: '00000000-0000-4000-8000-000000000003',
      } satisfies AuthenticatedUser);
      assert.equal(await validateSessionClaims(inactiveClaims, { database }), null);
    } finally {
      await runtimeProbe.end();
      await migrationDatabase.$disconnect();
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
  assert.equal(AUTH_ROLES.length * PERMISSION_AREAS.length * PERMISSION_ACTIONS.length, 448);

  for (const role of AUTH_ROLES) {
    assert.equal(hasPermission(role, 'billing', 'view'), true);
    for (const action of [
      'create',
      'update',
      'archive',
      'restore',
      'manage',
      'run',
      'export',
    ] as const) {
      assert.equal(hasPermission(role, 'billing', action), false);
    }
    assert.equal(hasPermission(role, 'reports', 'run'), true);
    assert.equal(hasPermission(role, 'reports', 'export'), true);
    for (const area of PERMISSION_AREAS) {
      assert.equal(hasPermission(role, area, 'delete'), false);
      if (role === 'Administrator' && ARCHIVABLE_AREAS.some((candidate) => candidate === area)) {
        assert.equal(hasPermission(role, area, 'archive'), true);
        assert.equal(hasPermission(role, area, 'restore'), true);
      } else {
        assert.equal(hasPermission(role, area, 'archive'), false);
        assert.equal(hasPermission(role, area, 'restore'), false);
      }
    }
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
  const missingArchive = structuredClone(PERMISSION_POLICY) as MutablePolicy;
  missingArchive['Administrator']!['clients']!['archive'] = false;
  assert.match(expectationFailures(missingArchive).join('; '), /Administrator\/clients\/archive/u);
  const missingRestore = structuredClone(PERMISSION_POLICY) as MutablePolicy;
  missingRestore['Administrator']!['clients']!['restore'] = false;
  assert.match(expectationFailures(missingRestore).join('; '), /Administrator\/clients\/restore/u);
  const overGrantedArchive = structuredClone(PERMISSION_POLICY) as MutablePolicy;
  overGrantedArchive['Litigation Assistant']!['matters']!['archive'] = true;
  assert.match(
    expectationFailures(overGrantedArchive).join('; '),
    /Litigation Assistant\/matters\/archive/u,
  );
  const malformedRestore = structuredClone(PERMISSION_POLICY) as MutablePolicy;
  delete malformedRestore['Administrator']!['clients']!['restore'];
  assert.match(
    permissionPolicyStructureFailures(malformedRestore).join('; '),
    /Administrator\/clients\/restore/u,
  );
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
  assert.equal(
    directServerAction(session('Paralegal'), {
      role: 'Administrator',
      headers: { role: 'Administrator' },
      query: { role: 'Administrator' },
      cookie: { role: 'Administrator' },
    }).user.role,
    'Paralegal',
  );
  assert.throws(
    () => directServerAction(null, { role: 'Administrator' }),
    (error: unknown) => error instanceof AuthorizationError && error.status === 401,
  );

  const routeOrder: string[] = [];
  const allowedRoute = await runAuthorizedRoute(
    async () => {
      routeOrder.push('authorize');
      return session('Administrator');
    },
    async () => {
      routeOrder.push('handler');
      return new Response(null, { status: 204 });
    },
    [],
  );
  assert.equal(allowedRoute.status, 204);
  assert.deepEqual(routeOrder, ['authorize', 'handler']);

  let deniedHandlerCalled = false;
  const deniedRoute = await runAuthorizedRoute(
    async () => new Response(null, { status: 403 }),
    async () => {
      deniedHandlerCalled = true;
      return new Response(null, { status: 204 });
    },
    [],
  );
  assert.equal(deniedRoute.status, 403);
  assert.equal(deniedHandlerCalled, false);

  const actionOrder: string[] = [];
  const actionResult = await runAuthorizedAction(
    async () => {
      actionOrder.push('authorize');
      return session('Administrator');
    },
    async () => {
      actionOrder.push('handler');
      return 'completed';
    },
    [],
  );
  assert.equal(actionResult, 'completed');
  assert.deepEqual(actionOrder, ['authorize', 'handler']);

  let deniedActionCalled = false;
  await assert.rejects(
    runAuthorizedAction(
      async () => {
        throw new AuthorizationError('forbidden');
      },
      async (validatedSession, untrustedInput: Record<string, unknown>) => {
        void validatedSession;
        void untrustedInput;
        deniedActionCalled = true;
        return 'should-not-run';
      },
      [{ role: 'Administrator', headers: { role: 'Administrator' } }],
    ),
    (error: unknown) => error instanceof AuthorizationError && error.status === 403,
  );
  assert.equal(deniedActionCalled, false);

  const discovered = discoverAuthorizationEntrypoints(process.cwd());
  assert.deepEqual(AUTHORIZATION_SOURCE_EXTENSIONS, [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.mts',
    '.cjs',
    '.cts',
  ]);
  assert.deepEqual(NEXT_DEFAULT_PAGE_EXTENSIONS, ['tsx', 'ts', 'jsx', 'js']);
  assert.deepEqual(routeInventoryFailures(discovered), []);
  assert.deepEqual(authorizationSourceExclusionFailures(), []);
  assert.deepEqual(authorizationSourcePolicyFailures(process.cwd()), []);
  assert.match(authorizationSourceExclusionFailures([]).join('; '), /<none>/u);
  assert.match(
    authorizationSourceExclusionFailures(['src/generated/']).join('; '),
    /must be exactly src\/generated\/prisma\//u,
  );
  assert.deepEqual(proxyExemptionFailures(process.cwd()), []);
  const authorizationSource = readFileSync('src/lib/auth/authorization.ts', 'utf8');
  assert.match(authorizationSource, /^import 'server-only';/u);
  assert.match(authorizationSource, /const session = await auth\(\)/u);
  const denialSource = readFileSync('src/app/forbidden/route.ts', 'utf8');
  assert.match(denialSource, /status: 403/u);
  assert.match(denialSource, /const session = await auth\(\)/u);
  assert.doesNotMatch(denialSource, /[\u0600-\u06ff]/u);

  const validPage = `import { requirePagePermission } from '@/lib/auth/authorization';
export default async function Page() {
  const session = await requirePagePermission({ area: 'clients', action: 'view' });
  return session.user.name;
}
`;
  const validRoute = `import { withRoutePermission } from '@/lib/auth/authorization';
export const GET = withRoutePermission(
  { area: 'clients', action: 'view' },
  async (session) => new Response(session.user.name),
);
`;
  const validAction = `'use server';
import { withActionPermission } from '@/lib/auth/authorization';
export const updateClient = withActionPermission(
  { area: 'clients', action: 'update' },
  async (session, formData: FormData) => {
    void formData;
    return session.user.id;
  },
);
`;
  const validFiles = {
    'src/app/clients/page.tsx': validPage,
    'src/app/api/clients/route.ts': validRoute,
    'src/features/clients/actions.ts': validAction,
  };
  const validInventory = [
    permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view'),
    permissionEntry('route', 'src/app/api/clients/route.ts', 'clients', 'view', 'GET'),
    permissionEntry(
      'server-action',
      'src/features/clients/actions.ts',
      'clients',
      'update',
      'updateClient',
    ),
  ];
  assert.deepEqual(staticFixture(validFiles, validInventory).failures, []);

  assertStaticFailure(
    {
      'app/page.tsx': 'export default function HiddenRootPage() { return null; }\n',
      'src/app/clients/page.tsx': validPage,
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /root app\/ is forbidden.*ignores src\/app/u,
  );
  assertStaticFailure(
    {
      'app/api/example/route.ts':
        'export async function GET() { return new Response(null, { status: 204 }); }\n',
    },
    [],
    /root app\/ is forbidden/u,
  );
  assertStaticFailure(
    { 'pages/index.tsx': 'export default function Page() { return null; }\n' },
    [],
    /root pages\/ is forbidden.*App Router-only/u,
  );
  assertStaticFailure(
    { 'src/pages/index.tsx': 'export default function Page() { return null; }\n' },
    [],
    /src\/pages\/ is forbidden.*App Router-only/u,
  );

  const validJavaScriptPage = `import { requirePagePermission } from '@/lib/auth/authorization';
export default async function Page() {
  const session = await requirePagePermission({ area: 'clients', action: 'view' });
  return session.user.name;
}
`;
  assert.deepEqual(
    staticFixture({ 'src/app/clients/page.js': validJavaScriptPage }, [
      permissionEntry('page', 'src/app/clients/page.js', 'clients', 'view'),
    ]).failures,
    [],
  );
  assert.deepEqual(
    staticFixture(
      {
        'src/app/clients/page.jsx': validJavaScriptPage.replace(
          'return session.user.name;',
          'return <main>{session.user.name}</main>;',
        ),
      },
      [permissionEntry('page', 'src/app/clients/page.jsx', 'clients', 'view')],
    ).failures,
    [],
  );
  const validJavaScriptRoute = `import { withRoutePermission } from '@/lib/auth/authorization';
export const GET = withRoutePermission(
  { area: 'clients', action: 'view' },
  async (session) => new Response(session.user.name),
);
`;
  assert.deepEqual(
    staticFixture({ 'src/app/api/clients/route.js': validJavaScriptRoute }, [
      permissionEntry('route', 'src/app/api/clients/route.js', 'clients', 'view', 'GET'),
    ]).failures,
    [],
  );
  const validJavaScriptAction = `'use server';
import { withActionPermission } from '@/lib/auth/authorization';
export const updateClient = withActionPermission(
  { area: 'clients', action: 'update' },
  async (session) => session.user.id,
);
`;
  for (const extension of ['js', 'mjs', 'mts', 'cjs', 'cts'] as const) {
    const source = `features/clients/actions.${extension}`;
    assert.deepEqual(
      staticFixture({ [source]: validJavaScriptAction }, [
        permissionEntry('server-action', source, 'clients', 'update', 'updateClient'),
      ]).failures,
      [],
    );
  }
  assert.deepEqual(
    staticFixture(
      {
        'next.config.ts': `const nextConfig = { pageExtensions: ['mjs', 'js'] };
export default nextConfig;
`,
        'src/app/clients/page.mjs': validJavaScriptPage,
      },
      [permissionEntry('page', 'src/app/clients/page.mjs', 'clients', 'view')],
    ).failures,
    [],
  );
  assertStaticFailure(
    {
      'next.config.ts': `const nextConfig = { pageExtensions: ['tsx', 'ts', 'mdx'] };
export default nextConfig;
`,
    },
    [],
    /page extension is not supported by the authorization checker: mdx/u,
  );
  assertStaticFailure(
    {
      'next.config.ts': `const extensions = ['tsx', 'ts'];
const nextConfig = { pageExtensions: extensions };
export default nextConfig;
`,
    },
    [],
    /pageExtensions must be one non-empty array of string literals/u,
  );
  assertStaticFailure(
    {
      'features/open/actions.js':
        "'use server';\nexport async function unclassifiedAction() { return null; }\n",
    },
    [],
    /unclassified entrypoint: server-action:features\/open\/actions\.js#unclassifiedAction/u,
  );

  const protectedRouteInventory = [
    permissionEntry('route', 'src/app/api/clients/route.ts', 'clients', 'view', 'GET'),
  ];
  assertStaticFailure(
    {
      'src/app/api/clients/route.ts': validRoute.replace('export const GET', 'export let GET'),
    },
    protectedRouteInventory,
    /must be one direct immutable export const.*#GET/u,
  );
  assertStaticFailure(
    {
      'src/app/api/clients/route.ts': validRoute.replace('export const GET', 'export var GET'),
    },
    protectedRouteInventory,
    /must be one direct immutable export const.*#GET/u,
  );
  assertStaticFailure(
    { 'src/app/api/clients/route.ts': `${validRoute}\nGET = async () => new Response();\n` },
    protectedRouteInventory,
    /protected export is reassigned after its wrapper.*#GET/u,
  );
  assertStaticFailure(
    { 'src/app/api/clients/route.ts': `${validRoute}\nGET++;\n` },
    protectedRouteInventory,
    /protected export is updated after its wrapper.*#GET/u,
  );
  assertStaticFailure(
    {
      'src/app/api/clients/route.ts': `${validRoute}
export const POST = withRoutePermission(
  { area: 'clients', action: 'create' },
  async () => new Response(null, { status: 201 }),
);
POST = async () => new Response(null, { status: 201 });
`,
    },
    [
      ...protectedRouteInventory,
      permissionEntry('route', 'src/app/api/clients/route.ts', 'clients', 'create', 'POST'),
    ],
    /protected export is reassigned after its wrapper.*#POST/u,
  );
  assertStaticFailure(
    {
      'src/app/api/clients/route.ts': `import { withRoutePermission } from '@/lib/auth/authorization';
const enabled = false;
export const GET = enabled
  ? withRoutePermission({ area: 'clients', action: 'view' }, async () => new Response())
  : async () => new Response();
`,
    },
    protectedRouteInventory,
    /route permission wrapper must be the direct export initializer.*#GET/u,
  );
  assertStaticFailure(
    {
      'src/app/api/clients/route.ts': `import { withRoutePermission } from '@/lib/auth/authorization';
let guarded = withRoutePermission(
  { area: 'clients', action: 'view' },
  async () => new Response(),
);
export { guarded as GET };
`,
    },
    protectedRouteInventory,
    /route permission entry must be exported through withRoutePermission.*#GET/u,
  );

  const protectedActionInventory = [
    permissionEntry(
      'server-action',
      'src/features/clients/actions.ts',
      'clients',
      'update',
      'updateClient',
    ),
  ];
  assertStaticFailure(
    {
      'src/features/clients/actions.ts': validAction.replace(
        'export const updateClient',
        'export let updateClient',
      ),
    },
    protectedActionInventory,
    /must be one direct immutable export const.*#updateClient/u,
  );
  assertStaticFailure(
    {
      'src/features/clients/actions.ts': `${validAction}
updateClient = async () => null;
`,
    },
    protectedActionInventory,
    /protected export is reassigned after its wrapper.*#updateClient/u,
  );
  assertStaticFailure(
    {
      'src/features/clients/actions.ts': `'use server';
import { withActionPermission } from '@/lib/auth/authorization';
let guarded = withActionPermission(
  { area: 'clients', action: 'update' },
  async () => null,
);
export { guarded as updateClient };
`,
    },
    protectedActionInventory,
    /server-action permission entry must be exported through withActionPermission.*#updateClient/u,
  );

  assertStaticFailure(
    { 'src/features/clients/actions.ts': validAction },
    [],
    /unclassified entrypoint: server-action:src\/features\/clients\/actions\.ts#updateClient/u,
  );
  assertStaticFailure(
    {
      'src/features/clients/actions.ts': "'use server';\nexport * from './implementation';\n",
    },
    [],
    /unclassified entrypoint: server-action:src\/features\/clients\/actions\.ts#<unsupported-re-export/u,
  );
  assertStaticFailure(
    {
      'src/app/clients/page.tsx': `import { requirePagePermission } from '@/lib/auth/authorization';
export default async function Page(requirePagePermission: (permission: unknown) => Promise<unknown>) {
  const session = await requirePagePermission({ area: 'clients', action: 'view' });
  return session;
}
`,
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /locally shadowed/u,
  );
  assertStaticFailure(
    {
      'src/app/clients/page.tsx': validPage.replace(
        '@/lib/auth/authorization',
        '@/lib/auth/lookalike',
      ),
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /expected one unaliased import/u,
  );
  assertStaticFailure(
    {
      'src/app/clients/page.tsx': validPage.replace(
        'import { requirePagePermission }',
        'import type { requirePagePermission }',
      ),
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /expected one unaliased import/u,
  );
  assertStaticFailure(
    {
      'src/app/clients/page.tsx': `import { requirePagePermission } from '@/lib/auth/authorization';
export default async function Page() {
  requirePagePermission({ area: 'clients', action: 'view' });
  return null;
}
`,
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /must begin by capturing awaited/u,
  );
  assertStaticFailure(
    {
      'src/app/clients/page.tsx': `import { requirePagePermission } from '@/lib/auth/authorization';
export default async function Page() {
  if (false) await requirePagePermission({ area: 'clients', action: 'view' });
  return null;
}
`,
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /must begin by capturing awaited/u,
  );
  assertStaticFailure(
    {
      'src/app/clients/page.tsx': `import { requirePagePermission } from '@/lib/auth/authorization';
export default async function Page() {
  const protectedData = await loadProtectedData();
  const session = await requirePagePermission({ area: 'clients', action: 'view' });
  return { protectedData, session };
}
`,
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /must begin by capturing awaited/u,
  );
  assertStaticFailure(
    {
      'src/app/clients/page.tsx': validPage.replace("area: 'clients'", "area: 'matters'"),
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /permission area differs/u,
  );
  assertStaticFailure(
    {
      'src/app/clients/page.tsx': validPage.replace("action: 'view'", "action: 'update'"),
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /permission action differs/u,
  );
  assertStaticFailure(
    {
      'src/app/clients/page.tsx': `import { requirePagePermission } from '@/lib/auth/authorization';
const area = 'clients';
export default async function Page() {
  const session = await requirePagePermission({ area, action: 'view' });
  return session.user.name;
}
`,
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /permission object cannot use spreads, methods or shorthand/u,
  );
  assertStaticFailure(
    {
      'src/app/clients/page.tsx': `import { requirePagePermission } from '@/lib/auth/authorization';
const action = 'view';
export default async function Page() {
  const session = await requirePagePermission({ area: 'clients', action });
  return session.user.name;
}
`,
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /permission object cannot use spreads, methods or shorthand/u,
  );
  assertStaticFailure(
    {
      'src/app/api/clients/route.ts': `${validRoute}
export async function POST() {
  return new Response(null, { status: 204 });
}
`,
    },
    [
      permissionEntry('route', 'src/app/api/clients/route.ts', 'clients', 'view', 'GET'),
      permissionEntry('route', 'src/app/api/clients/route.ts', 'clients', 'create', 'POST'),
    ],
    /route permission entry must be exported through withRoutePermission.*#POST/u,
  );
  assertStaticFailure(
    {
      'src/app/clients/page.tsx': `import { proxy } from '@/proxy';
export default async function Page() {
  const session = await proxy();
  return session;
}
`,
    },
    [permissionEntry('page', 'src/app/clients/page.tsx', 'clients', 'view')],
    /expected one unaliased import/u,
  );
  assertStaticFailure(
    {
      'src/features/clients/actions.ts': `'use server';
import { withActionPermission } from '@/lib/auth/authorization';
const enabled = false;
async function handler() { return null; }
export const updateClient = enabled
  ? withActionPermission({ area: 'clients', action: 'update' }, handler)
  : handler;
`,
    },
    [
      permissionEntry(
        'server-action',
        'src/features/clients/actions.ts',
        'clients',
        'update',
        'updateClient',
      ),
    ],
    /server-action permission wrapper must be the direct export initializer/u,
  );
  assertStaticFailure(
    {
      'src/features/clients/actions.ts': `'use server';
import { requireActionPermission } from '@/lib/auth/authorization';
export async function updateClient() {
  requireActionPermission({ area: 'clients', action: 'update' });
  return null;
}
`,
    },
    [
      permissionEntry(
        'server-action',
        'src/features/clients/actions.ts',
        'clients',
        'update',
        'updateClient',
      ),
    ],
    /server-action permission entry must be exported through withActionPermission/u,
  );

  const unclassified = staticFixture(
    {
      'src/app/open/page.tsx': 'export default function Page() { return null; }\n',
      'src/app/api/open/route.ts':
        'export async function GET() { return new Response(null, { status: 204 }); }\n',
      'src/features/open/actions.ts':
        "'use server';\nexport async function openAction() { return null; }\n",
    },
    [],
  ).failures.join('; ');
  assert.match(unclassified, /page:src\/app\/open\/page\.tsx/u);
  assert.match(unclassified, /route:src\/app\/api\/open\/route\.ts#GET/u);
  assert.match(unclassified, /server-action:src\/features\/open\/actions\.ts#openAction/u);

  const exclusionFixture = staticFixture(
    {
      'src/generated/prisma/actions.ts':
        "'use server';\nexport async function generatedAction() { return null; }\n",
      'src/generated/prisma/actions.js':
        "'use server';\nexport async function generatedJavaScriptAction() { return null; }\n",
      'src/generated/prisma/actions.mjs':
        "'use server';\nexport async function generatedModuleAction() { return null; }\n",
      'src/generated/prisma-adjacent/actions.js':
        "'use server';\nexport async function visibleAction() { return null; }\n",
    },
    [],
  );
  assert.deepEqual(exclusionFixture.discoveredKeys, [
    'server-action:src/generated/prisma-adjacent/actions.js#visibleAction',
  ]);
  assert.match(exclusionFixture.failures.join('; '), /visibleAction/u);

  const tasks = readFileSync('TASKS.md', 'utf8');
  assert.match(tasks, /- \[x\] \*\*3\.3A Secure actor attribution\*\*/u);
  assert.match(tasks, /- \[x\] \*\*3\.3B Append-only event foundation\*\*/u);
  assert.match(tasks, /- \[ \] \*\*3\.4 User management\*\*/u);

  await proveDatabaseSessionAuthorization();

  console.log('PASS exhaustive permission matrix: 4 roles × 14 areas × 8 actions = 448 decisions');
  console.log('PASS recoverable archive/restore is Administrator-only on the 9 approved areas');
  console.log('PASS physical delete remains absent and lifecycle mutation proofs fail closed');
  console.log('PASS fail-closed unknowns, billing/report rules, and independent mutation proofs');
  console.log('PASS direct route/action 401 and 403 denials ignore client-supplied roles');
  console.log('PASS permission wrappers authorize before any protected route/action work');
  console.log('PASS database role refresh, forced-password, disabled and inactive denials');
  console.log('PASS permission application operations use litigation_runtime');
  console.log(
    'PASS canonical App Router entries and project-owned JS/TS server actions are inventoried',
  );
  console.log(
    'PASS alternate router roots, unclassified extensions, and mutable or reassigned wrappers fail closed',
  );
  console.log(
    'PASS static fixtures reject outside-app actions, shadowed/wrong guards, unawaited/late/conditional guards, dynamic or mismatched literals, partial methods and proxy-only enforcement',
  );
  console.log('PASS only the exact reviewed generated Prisma subtree is excluded from discovery');
  console.log('PASS Task 3.3B event foundation leaves Task 3.4 user management outstanding');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
