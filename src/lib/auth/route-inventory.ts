import type { PermissionAction, PermissionArea } from './permissions';

type EntrypointKind = 'page' | 'route' | 'server-action';

type PermissionClassification = {
  access: 'permission';
  area: PermissionArea;
  action: PermissionAction;
};

type ExemptionEnforcement =
  | {
      pattern: 'first-awaited-assignment' | 'first-awaited-expression' | 'awaited-call';
      module: '@/auth' | '@/lib/auth/authorization';
      imported: 'auth' | 'requireAuthenticatedPage' | 'signIn' | 'signOut';
    }
  | {
      pattern: 'framework-handlers';
      module: '@/auth';
      imported: 'handlers';
    };

type ExemptClassification = {
  access:
    | 'public-authentication'
    | 'authenticated'
    | 'password-change'
    | 'auth-framework'
    | 'permission-denial';
  reason: string;
  enforcement: ExemptionEnforcement;
};

export type RouteInventoryEntry = {
  kind: EntrypointKind;
  source: string;
  route?: string;
  exportName?: string;
  classification: PermissionClassification | ExemptClassification;
};

/**
 * Every current App Router page/handler and every project-owned Server
 * Action. Future business entry points must be added with a permission
 * classification and the statically enforced authoritative guard/wrapper
 * pattern. Authentication framework entry points are narrow, named exemptions
 * rather than implicit omissions.
 */
export const ROUTE_INVENTORY = [
  {
    kind: 'page',
    source: 'src/app/page.tsx',
    route: '/',
    classification: {
      access: 'authenticated',
      reason: 'Task 3.1 signed-in landing page; available to all four roles.',
      enforcement: {
        pattern: 'first-awaited-assignment',
        module: '@/lib/auth/authorization',
        imported: 'requireAuthenticatedPage',
      },
    },
  },
  {
    kind: 'page',
    source: 'src/app/login/page.tsx',
    route: '/login',
    classification: {
      access: 'public-authentication',
      reason: 'Credentials entry; authenticated users are redirected by server-side Auth.js.',
      enforcement: { pattern: 'first-awaited-assignment', module: '@/auth', imported: 'auth' },
    },
  },
  {
    kind: 'server-action',
    source: 'src/app/login/actions.ts',
    exportName: 'loginAction',
    classification: {
      access: 'public-authentication',
      reason: 'Auth.js credential submission; no business data operation.',
      enforcement: { pattern: 'awaited-call', module: '@/auth', imported: 'signIn' },
    },
  },
  {
    kind: 'page',
    source: 'src/app/change-password/page.tsx',
    route: '/change-password',
    classification: {
      access: 'password-change',
      reason: 'Authenticated special state; only forced-password-change sessions remain here.',
      enforcement: { pattern: 'first-awaited-assignment', module: '@/auth', imported: 'auth' },
    },
  },
  {
    kind: 'server-action',
    source: 'src/app/change-password/actions.ts',
    exportName: 'changePasswordAction',
    classification: {
      access: 'password-change',
      reason: 'Changes only the validated current account password and invalidates its sessions.',
      enforcement: { pattern: 'first-awaited-assignment', module: '@/auth', imported: 'auth' },
    },
  },
  {
    kind: 'server-action',
    source: 'src/app/page.tsx',
    exportName: 'logoutAction',
    classification: {
      access: 'authenticated',
      reason: 'Clears only the caller session; no business-data permission is involved.',
      enforcement: { pattern: 'first-awaited-expression', module: '@/auth', imported: 'signOut' },
    },
  },
  {
    kind: 'route',
    source: 'src/app/api/auth/[...nextauth]/route.ts',
    route: '/api/auth/[...nextauth]',
    exportName: 'GET',
    classification: {
      access: 'auth-framework',
      reason: 'Auth.js-owned GET protocol handler and explicit proxy exemption.',
      enforcement: { pattern: 'framework-handlers', module: '@/auth', imported: 'handlers' },
    },
  },
  {
    kind: 'route',
    source: 'src/app/api/auth/[...nextauth]/route.ts',
    route: '/api/auth/[...nextauth]',
    exportName: 'POST',
    classification: {
      access: 'auth-framework',
      reason: 'Auth.js-owned POST protocol handler and explicit proxy exemption.',
      enforcement: { pattern: 'framework-handlers', module: '@/auth', imported: 'handlers' },
    },
  },
  {
    kind: 'route',
    source: 'src/app/forbidden/route.ts',
    route: '/forbidden',
    exportName: 'GET',
    classification: {
      access: 'permission-denial',
      reason: 'Authenticated Arabic denial response; always returns HTTP 403.',
      enforcement: { pattern: 'first-awaited-assignment', module: '@/auth', imported: 'auth' },
    },
  },
] as const satisfies readonly RouteInventoryEntry[];

export const PROXY_INFRASTRUCTURE_EXEMPTIONS = [
  'api/auth',
  '_next/static',
  '_next/image',
  'favicon.ico',
  'icon.png',
  'fonts/',
] as const;

/** Generated Prisma output may contain arbitrary TypeScript but cannot be an
 * application entry point. Keep this exact and narrow: neighbouring project
 * code under src/generated-* must still be scanned. */
export const AUTHORIZATION_SOURCE_EXCLUSIONS = ['src/generated/prisma/'] as const;
