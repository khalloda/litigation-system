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
    source: 'src/app/matters/page.tsx',
    route: '/matters',
    classification: { access: 'permission', area: 'matters', action: 'view' },
  },
  {
    kind: 'page',
    source: 'src/app/matters/[id]/page.tsx',
    route: '/matters/[id]',
    classification: { access: 'permission', area: 'matters', action: 'view' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/[id]/logo/manage/page.tsx',
    route: '/clients/[id]/logo/manage',
    classification: { access: 'permission', area: 'clientLogoUpload', action: 'view' },
  },
  {
    kind: 'route',
    source: 'src/app/clients/[id]/logo/preview/route.ts',
    route: '/clients/[id]/logo/preview',
    exportName: 'POST',
    classification: { access: 'permission', area: 'clientLogoUpload', action: 'create' },
  },
  {
    kind: 'route',
    source: 'src/app/clients/[id]/logo/upload/route.ts',
    route: '/clients/[id]/logo/upload',
    exportName: 'POST',
    classification: { access: 'permission', area: 'clientLogoUpload', action: 'create' },
  },
  {
    kind: 'route',
    source: 'src/app/clients/[id]/logo/replace/route.ts',
    route: '/clients/[id]/logo/replace',
    exportName: 'POST',
    classification: { access: 'permission', area: 'clientLogoUpload', action: 'update' },
  },
  {
    kind: 'route',
    source: 'src/app/clients/[id]/logo/archive/route.ts',
    route: '/clients/[id]/logo/archive',
    exportName: 'POST',
    classification: { access: 'permission', area: 'clientLogoUpload', action: 'archive' },
  },
  {
    kind: 'route',
    source: 'src/app/clients/[id]/logo/restore/route.ts',
    route: '/clients/[id]/logo/restore',
    exportName: 'POST',
    classification: { access: 'permission', area: 'clientLogoUpload', action: 'restore' },
  },
  {
    kind: 'route',
    source: 'src/app/clients/[id]/logo/state/route.ts',
    route: '/clients/[id]/logo/state',
    exportName: 'GET',
    classification: { access: 'permission', area: 'clientLogoUpload', action: 'view' },
  },
  {
    kind: 'route',
    source: 'src/app/clients/[id]/logo/version/route.ts',
    route: '/clients/[id]/logo/version',
    exportName: 'GET',
    classification: { access: 'permission', area: 'clientLogoUpload', action: 'restore' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/new/page.tsx',
    route: '/clients/new',
    classification: { access: 'permission', area: 'clients', action: 'create' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/[id]/edit/page.tsx',
    route: '/clients/[id]/edit',
    classification: { access: 'permission', area: 'clients', action: 'update' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/[id]/archive/page.tsx',
    route: '/clients/[id]/archive',
    classification: { access: 'permission', area: 'clients', action: 'archive' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/[id]/restore/page.tsx',
    route: '/clients/[id]/restore',
    classification: { access: 'permission', area: 'clients', action: 'restore' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/[id]/contacts/new/page.tsx',
    route: '/clients/[id]/contacts/new',
    classification: { access: 'permission', area: 'contacts', action: 'create' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/[id]/contacts/[contactId]/edit/page.tsx',
    route: '/clients/[id]/contacts/[contactId]/edit',
    classification: { access: 'permission', area: 'contacts', action: 'update' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/[id]/contacts/[contactId]/archive/page.tsx',
    route: '/clients/[id]/contacts/[contactId]/archive',
    classification: { access: 'permission', area: 'contacts', action: 'archive' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/[id]/contacts/[contactId]/restore/page.tsx',
    route: '/clients/[id]/contacts/[contactId]/restore',
    classification: { access: 'permission', area: 'contacts', action: 'restore' },
  },
  {
    kind: 'server-action',
    source: 'src/app/clients/actions.ts',
    exportName: 'createClientAction',
    classification: { access: 'permission', area: 'clients', action: 'create' },
  },
  {
    kind: 'server-action',
    source: 'src/app/clients/actions.ts',
    exportName: 'updateClientAction',
    classification: { access: 'permission', area: 'clients', action: 'update' },
  },
  {
    kind: 'server-action',
    source: 'src/app/clients/actions.ts',
    exportName: 'archiveClientAction',
    classification: { access: 'permission', area: 'clients', action: 'archive' },
  },
  {
    kind: 'server-action',
    source: 'src/app/clients/actions.ts',
    exportName: 'restoreClientAction',
    classification: { access: 'permission', area: 'clients', action: 'restore' },
  },
  {
    kind: 'server-action',
    source: 'src/app/clients/actions.ts',
    exportName: 'createContactAction',
    classification: { access: 'permission', area: 'contacts', action: 'create' },
  },
  {
    kind: 'server-action',
    source: 'src/app/clients/actions.ts',
    exportName: 'updateContactAction',
    classification: { access: 'permission', area: 'contacts', action: 'update' },
  },
  {
    kind: 'server-action',
    source: 'src/app/clients/actions.ts',
    exportName: 'archiveContactAction',
    classification: { access: 'permission', area: 'contacts', action: 'archive' },
  },
  {
    kind: 'server-action',
    source: 'src/app/clients/actions.ts',
    exportName: 'restoreContactAction',
    classification: { access: 'permission', area: 'contacts', action: 'restore' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/page.tsx',
    route: '/clients',
    classification: { access: 'permission', area: 'clients', action: 'view' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/[id]/page.tsx',
    route: '/clients/[id]',
    classification: { access: 'permission', area: 'clients', action: 'view' },
  },
  {
    kind: 'page',
    source: 'src/app/clients/[id]/contacts/[contactId]/page.tsx',
    route: '/clients/[id]/contacts/[contactId]',
    classification: { access: 'permission', area: 'contacts', action: 'view' },
  },
  {
    kind: 'route',
    source: 'src/app/clients/[id]/logo/route.ts',
    route: '/clients/[id]/logo',
    exportName: 'GET',
    classification: { access: 'permission', area: 'clientLogoUpload', action: 'view' },
  },
  {
    kind: 'route',
    source: 'src/app/clients/[id]/logo/route.ts',
    route: '/clients/[id]/logo',
    exportName: 'HEAD',
    classification: { access: 'permission', area: 'clientLogoUpload', action: 'view' },
  },
  {
    kind: 'page',
    source: 'src/app/staff/new/page.tsx',
    route: '/staff/new',
    classification: { access: 'permission', area: 'staff', action: 'manage' },
  },
  {
    kind: 'page',
    source: 'src/app/staff/[id]/edit/page.tsx',
    route: '/staff/[id]/edit',
    classification: { access: 'permission', area: 'staff', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/staff/actions.ts',
    exportName: 'createStaffAction',
    classification: { access: 'permission', area: 'staff', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/staff/actions.ts',
    exportName: 'updateStaffAction',
    classification: { access: 'permission', area: 'staff', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/staff/actions.ts',
    exportName: 'renameStaffAction',
    classification: { access: 'permission', area: 'staff', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/staff/actions.ts',
    exportName: 'addStaffAliasAction',
    classification: { access: 'permission', area: 'staff', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/staff/actions.ts',
    exportName: 'retireStaffAliasAction',
    classification: { access: 'permission', area: 'staff', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/staff/actions.ts',
    exportName: 'restoreStaffAliasAction',
    classification: { access: 'permission', area: 'staff', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/staff/actions.ts',
    exportName: 'deactivateStaffAction',
    classification: { access: 'permission', area: 'staff', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/staff/actions.ts',
    exportName: 'reactivateStaffAction',
    classification: { access: 'permission', area: 'staff', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/staff/actions.ts',
    exportName: 'setStaffReviewerAction',
    classification: { access: 'permission', area: 'staff', action: 'manage' },
  },
  {
    kind: 'page',
    source: 'src/app/staff/page.tsx',
    route: '/staff',
    classification: { access: 'permission', area: 'staff', action: 'view' },
  },
  {
    kind: 'page',
    source: 'src/app/staff/[id]/page.tsx',
    route: '/staff/[id]',
    classification: { access: 'permission', area: 'staff', action: 'view' },
  },
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
    kind: 'page',
    source: 'src/app/users/page.tsx',
    route: '/users',
    classification: { access: 'permission', area: 'usersAndRoles', action: 'view' },
  },
  {
    kind: 'server-action',
    source: 'src/app/users/actions.ts',
    exportName: 'changeRoleAction',
    classification: { access: 'permission', area: 'usersAndRoles', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/users/actions.ts',
    exportName: 'correctUsernameAction',
    classification: { access: 'permission', area: 'usersAndRoles', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/users/actions.ts',
    exportName: 'createUserAction',
    classification: { access: 'permission', area: 'usersAndRoles', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/users/actions.ts',
    exportName: 'disableAccountAction',
    classification: { access: 'permission', area: 'usersAndRoles', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/users/actions.ts',
    exportName: 'reactivateAccountAction',
    classification: { access: 'permission', area: 'usersAndRoles', action: 'manage' },
  },
  {
    kind: 'server-action',
    source: 'src/app/users/actions.ts',
    exportName: 'resetPasswordAction',
    classification: { access: 'permission', area: 'usersAndRoles', action: 'manage' },
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
  {
    kind: 'page',
    source: 'src/app/matters/new/page.tsx',
    route: '/matters/new',
    classification: { access: 'permission', area: 'matters', action: 'create' },
  },
  {
    kind: 'page',
    source: 'src/app/matters/[id]/edit/page.tsx',
    route: '/matters/[id]/edit',
    classification: { access: 'permission', area: 'matters', action: 'update' },
  },
  {
    kind: 'server-action',
    source: 'src/app/matters/actions.ts',
    exportName: 'createMatterAction',
    classification: { access: 'permission', area: 'matters', action: 'create' },
  },
  {
    kind: 'server-action',
    source: 'src/app/matters/actions.ts',
    exportName: 'updateMatterAction',
    classification: { access: 'permission', area: 'matters', action: 'update' },
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

/**
 * Project-owned JavaScript and TypeScript source forms that the authorization
 * inventory parses. Keep this explicit: silently ignoring a new executable
 * extension would create an authorization blind spot.
 */
export const AUTHORIZATION_SOURCE_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.mts',
  '.cjs',
  '.cts',
] as const;

/** Installed Next.js 16.3.1 defaults when next.config.ts omits pageExtensions. */
export const NEXT_DEFAULT_PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js'] as const;
