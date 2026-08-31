import type { PermissionAction, PermissionArea } from './permissions';

type EntrypointKind = 'page' | 'route' | 'server-action';

type PermissionClassification = {
  access: 'permission';
  area: PermissionArea;
  action: PermissionAction;
};

type ExemptClassification = {
  access:
    | 'public-authentication'
    | 'authenticated'
    | 'password-change'
    | 'auth-framework'
    | 'permission-denial';
  reason: string;
};

export type RouteInventoryEntry = {
  kind: EntrypointKind;
  source: string;
  route?: string;
  exportName?: string;
  enforcementCall?: string;
  classification: PermissionClassification | ExemptClassification;
};

/**
 * Every current App Router entry point. Future business pages, handlers and
 * actions must be added with a permission classification and a matching call
 * to the authoritative server guard. Authentication framework entry points
 * are narrow, named exemptions rather than implicit omissions.
 */
export const ROUTE_INVENTORY = [
  {
    kind: 'page',
    source: 'src/app/page.tsx',
    route: '/',
    enforcementCall: 'requireAuthenticatedPage',
    classification: {
      access: 'authenticated',
      reason: 'Task 3.1 signed-in landing page; available to all four roles.',
    },
  },
  {
    kind: 'page',
    source: 'src/app/login/page.tsx',
    route: '/login',
    enforcementCall: 'auth',
    classification: {
      access: 'public-authentication',
      reason: 'Credentials entry; authenticated users are redirected by server-side Auth.js.',
    },
  },
  {
    kind: 'server-action',
    source: 'src/app/login/actions.ts',
    exportName: 'loginAction',
    enforcementCall: 'signIn',
    classification: {
      access: 'public-authentication',
      reason: 'Auth.js credential submission; no business data operation.',
    },
  },
  {
    kind: 'page',
    source: 'src/app/change-password/page.tsx',
    route: '/change-password',
    enforcementCall: 'auth',
    classification: {
      access: 'password-change',
      reason: 'Authenticated special state; only forced-password-change sessions remain here.',
    },
  },
  {
    kind: 'server-action',
    source: 'src/app/change-password/actions.ts',
    exportName: 'changePasswordAction',
    enforcementCall: 'auth',
    classification: {
      access: 'password-change',
      reason: 'Changes only the validated current account password and invalidates its sessions.',
    },
  },
  {
    kind: 'server-action',
    source: 'src/app/page.tsx',
    exportName: 'logoutAction',
    enforcementCall: 'signOut',
    classification: {
      access: 'authenticated',
      reason: 'Clears only the caller session; no business-data permission is involved.',
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
    },
  },
  {
    kind: 'route',
    source: 'src/app/forbidden/route.ts',
    route: '/forbidden',
    exportName: 'GET',
    enforcementCall: 'auth',
    classification: {
      access: 'permission-denial',
      reason: 'Authenticated Arabic denial response; always returns HTTP 403.',
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
