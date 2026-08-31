import { AUTH_ROLES, isAuthRole, type AuthRole } from './constants';

export const PERMISSION_AREAS = [
  'clients',
  'contacts',
  'matters',
  'hearings',
  'administrativeWorks',
  'powersOfAttorney',
  'documents',
  'feeLetters',
  'clientLogoUpload',
  'billing',
  'reports',
  'staff',
  'usersAndRoles',
  'dropdownLists',
] as const;

export const PERMISSION_ACTIONS = [
  'view',
  'create',
  'update',
  'archive',
  'restore',
  'manage',
  'run',
  'export',
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export type PermissionSet = Readonly<Record<PermissionAction, boolean>>;
export type PermissionPolicy = Readonly<
  Record<AuthRole, Readonly<Record<PermissionArea, PermissionSet>>>
>;

function permissions(...allowed: readonly PermissionAction[]): PermissionSet {
  const allowedSet = new Set(allowed);
  return Object.freeze(
    Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, allowedSet.has(action)])),
  ) as PermissionSet;
}

const edit = permissions('view', 'create', 'update');
const full = permissions('view', 'create', 'update', 'archive', 'restore');
const view = permissions('view');
const report = permissions('run', 'export');
const administer = permissions('view', 'manage');
const none = permissions();

/**
 * The complete Task 3.2 policy. Every role, area and supported action is
 * present. An omitted or unknown value is denied by hasPermission().
 *
 * "Full" in the firm's matrix means view/create/update/archive/restore for
 * operational records. Archive is recoverable and never means physical
 * deletion. Manage exists only for the three lifecycle areas where the firm
 * used that word explicitly.
 */
export const PERMISSION_POLICY = {
  Administrator: {
    clients: full,
    contacts: full,
    matters: full,
    hearings: full,
    administrativeWorks: full,
    powersOfAttorney: full,
    documents: full,
    feeLetters: full,
    clientLogoUpload: full,
    billing: view,
    reports: report,
    staff: administer,
    usersAndRoles: administer,
    dropdownLists: administer,
  },
  'Litigation Assistant': {
    clients: edit,
    contacts: edit,
    matters: edit,
    hearings: edit,
    administrativeWorks: edit,
    powersOfAttorney: edit,
    documents: edit,
    feeLetters: edit,
    clientLogoUpload: edit,
    billing: view,
    reports: report,
    staff: view,
    usersAndRoles: none,
    dropdownLists: none,
  },
  Lawyer: {
    clients: view,
    contacts: view,
    matters: view,
    hearings: view,
    administrativeWorks: view,
    powersOfAttorney: view,
    documents: view,
    feeLetters: view,
    clientLogoUpload: view,
    billing: view,
    reports: report,
    staff: view,
    usersAndRoles: none,
    dropdownLists: none,
  },
  Paralegal: {
    clients: view,
    contacts: view,
    matters: view,
    hearings: view,
    administrativeWorks: edit,
    powersOfAttorney: view,
    documents: view,
    feeLetters: view,
    clientLogoUpload: view,
    billing: view,
    reports: report,
    staff: view,
    usersAndRoles: none,
    dropdownLists: none,
  },
} as const satisfies PermissionPolicy;

export function isPermissionArea(value: unknown): value is PermissionArea {
  return typeof value === 'string' && PERMISSION_AREAS.some((area) => area === value);
}

export function isPermissionAction(value: unknown): value is PermissionAction {
  return typeof value === 'string' && PERMISSION_ACTIONS.some((action) => action === value);
}

export function permissionPolicyStructureFailures(policy: unknown): string[] {
  const failures: string[] = [];
  if (typeof policy !== 'object' || policy === null) return ['policy is not an object'];
  const candidate = policy as Record<string, unknown>;

  for (const role of AUTH_ROLES) {
    const rolePolicy = candidate[role];
    if (typeof rolePolicy !== 'object' || rolePolicy === null) {
      failures.push(`missing role: ${role}`);
      continue;
    }
    const areas = rolePolicy as Record<string, unknown>;
    for (const area of PERMISSION_AREAS) {
      const areaPolicy = areas[area];
      if (typeof areaPolicy !== 'object' || areaPolicy === null) {
        failures.push(`missing area: ${role}/${area}`);
        continue;
      }
      const actions = areaPolicy as Record<string, unknown>;
      for (const action of PERMISSION_ACTIONS) {
        if (typeof actions[action] !== 'boolean') {
          failures.push(`missing action: ${role}/${area}/${action}`);
        }
      }
      for (const action of Object.keys(actions)) {
        if (!isPermissionAction(action)) failures.push(`unknown action: ${role}/${area}/${action}`);
      }
    }
    for (const area of Object.keys(areas)) {
      if (!isPermissionArea(area)) failures.push(`unknown area: ${role}/${area}`);
    }
  }
  for (const role of Object.keys(candidate)) {
    if (!isAuthRole(role)) failures.push(`unknown role: ${role}`);
  }
  return failures;
}

export function hasPermissionInPolicy(
  policy: unknown,
  role: unknown,
  area: unknown,
  action: unknown,
): boolean {
  if (
    typeof role !== 'string' ||
    !isAuthRole(role) ||
    !isPermissionArea(area) ||
    !isPermissionAction(action)
  ) {
    return false;
  }
  if (typeof policy !== 'object' || policy === null) return false;
  const rolePolicy = (policy as Record<string, unknown>)[role];
  if (typeof rolePolicy !== 'object' || rolePolicy === null) return false;
  const areaPolicy = (rolePolicy as Record<string, unknown>)[area];
  if (typeof areaPolicy !== 'object' || areaPolicy === null) return false;
  return (areaPolicy as Record<string, unknown>)[action] === true;
}

export function hasPermission(role: unknown, area: unknown, action: unknown): boolean {
  return hasPermissionInPolicy(PERMISSION_POLICY, role, area, action);
}
