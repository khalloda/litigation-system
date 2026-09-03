export const AUTH_ROLES = ['Administrator', 'Litigation Assistant', 'Lawyer', 'Paralegal'] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const APPROVED_INITIAL_USERNAMES = ['KHelmy', 'MHussien', 'IHamdy', 'SKhattab'] as const;
export const APPROVED_INITIAL_ACCOUNT_IDS = [1, 2, 3, 4] as const;

export const NORMAL_SESSION_SECONDS = 8 * 60 * 60;
export const REMEMBERED_SESSION_SECONDS = 7 * 24 * 60 * 60;
export const LOCKOUT_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;
export const MINIMUM_PASSWORD_CHARACTERS = 12;

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export function isAuthRole(value: string): value is AuthRole {
  return AUTH_ROLES.some((role) => role === value);
}
