'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { withActionPermission } from '@/lib/auth/authorization';
import {
  changeManagedRole,
  correctManagedUsername,
  createManagedAccount,
  disableManagedAccount,
  reactivateManagedAccount,
  resetManagedPassword,
  UserManagementError,
} from '@/lib/auth/user-management';
import { t } from '@/strings';

export type UserManagementActionState = Readonly<{
  kind: 'idle' | 'error' | 'success';
  message: string;
  field: string | null;
  revision: number;
}>;

function nextRevision(previous: UserManagementActionState): number {
  return Number.isSafeInteger(previous.revision) && previous.revision >= 0
    ? previous.revision + 1
    : 1;
}

function result(
  previous: UserManagementActionState,
  kind: 'error' | 'success',
  message: string,
  field: string | null = null,
): UserManagementActionState {
  return { kind, message, field, revision: nextRevision(previous) };
}

function numeric(formData: FormData, key: string): number {
  return Number(String(formData.get(key) ?? ''));
}

function messageFor(error: unknown): string {
  if (!(error instanceof UserManagementError)) return t.users.errors.generic;
  switch (error.code) {
    case 'administrator-required':
      return t.users.errors['administrator-required'];
    case 'invalid-input':
      return t.users.errors['invalid-input'];
    case 'invalid-transition':
      return t.users.errors['invalid-transition'];
    case 'no-op':
      return t.users.errors['no-op'];
    case 'not-found':
      return t.users.errors['not-found'];
    case 'password-policy':
      return t.users.errors['password-policy'];
    case 'self-protected':
      return t.users.errors['self-protected'];
    case 'stale':
      return t.users.errors.stale;
  }
}

async function metadata(auditSessionId: string) {
  return createServerActionAuditMetadata(await headers(), auditSessionId);
}

function passwords(formData: FormData): Readonly<{ value: string; matches: boolean }> {
  const value = String(formData.get('temporaryPassword') ?? '');
  const confirmation = String(formData.get('confirmPassword') ?? '');
  return { value, matches: value === confirmation };
}

export const createUserAction = withActionPermission(
  { area: 'usersAndRoles', action: 'manage' },
  async (session, previous: UserManagementActionState, formData: FormData) => {
    const temporaryPassword = passwords(formData);
    if (!temporaryPassword.matches) {
      return result(previous, 'error', t.users.errors.passwordMismatch, 'confirmPassword');
    }
    try {
      await createManagedAccount(
        Number(session.user.id),
        {
          personId: numeric(formData, 'personId'),
          username: String(formData.get('username') ?? ''),
          role: String(formData.get('role') ?? ''),
          temporaryPassword: temporaryPassword.value,
        },
        { auditMetadata: await metadata(session.user.auditSessionId) },
      );
      revalidatePath('/users');
      return result(previous, 'success', t.users.success.created);
    } catch (error: unknown) {
      return result(previous, 'error', messageFor(error), 'create');
    }
  },
);

export const correctUsernameAction = withActionPermission(
  { area: 'usersAndRoles', action: 'manage' },
  async (session, previous: UserManagementActionState, formData: FormData) => {
    try {
      await correctManagedUsername(
        Number(session.user.id),
        {
          accountId: numeric(formData, 'accountId'),
          expectedSessionVersion: numeric(formData, 'sessionVersion'),
          username: String(formData.get('username') ?? ''),
        },
        { auditMetadata: await metadata(session.user.auditSessionId) },
      );
      revalidatePath('/users');
      return result(previous, 'success', t.users.success.username);
    } catch (error: unknown) {
      return result(previous, 'error', messageFor(error), 'username');
    }
  },
);

export const changeRoleAction = withActionPermission(
  { area: 'usersAndRoles', action: 'manage' },
  async (session, previous: UserManagementActionState, formData: FormData) => {
    try {
      await changeManagedRole(
        Number(session.user.id),
        {
          accountId: numeric(formData, 'accountId'),
          expectedSessionVersion: numeric(formData, 'sessionVersion'),
          role: String(formData.get('role') ?? ''),
        },
        { auditMetadata: await metadata(session.user.auditSessionId) },
      );
      revalidatePath('/users');
      return result(previous, 'success', t.users.success.role);
    } catch (error: unknown) {
      return result(previous, 'error', messageFor(error), 'role');
    }
  },
);

export const disableAccountAction = withActionPermission(
  { area: 'usersAndRoles', action: 'manage' },
  async (session, previous: UserManagementActionState, formData: FormData) => {
    const accountId = numeric(formData, 'accountId');
    if (String(formData.get('confirmation') ?? '') !== String(accountId)) {
      return result(previous, 'error', t.users.errors.confirmationRequired, 'confirmation');
    }
    try {
      await disableManagedAccount(
        Number(session.user.id),
        { accountId, expectedSessionVersion: numeric(formData, 'sessionVersion') },
        { auditMetadata: await metadata(session.user.auditSessionId) },
      );
      revalidatePath('/users');
      return result(previous, 'success', t.users.success.disabled);
    } catch (error: unknown) {
      return result(previous, 'error', messageFor(error), 'disable');
    }
  },
);

export const reactivateAccountAction = withActionPermission(
  { area: 'usersAndRoles', action: 'manage' },
  async (session, previous: UserManagementActionState, formData: FormData) => {
    const temporaryPassword = passwords(formData);
    if (!temporaryPassword.matches) {
      return result(previous, 'error', t.users.errors.passwordMismatch, 'confirmPassword');
    }
    try {
      await reactivateManagedAccount(
        Number(session.user.id),
        {
          accountId: numeric(formData, 'accountId'),
          expectedSessionVersion: numeric(formData, 'sessionVersion'),
          temporaryPassword: temporaryPassword.value,
        },
        { auditMetadata: await metadata(session.user.auditSessionId) },
      );
      revalidatePath('/users');
      return result(previous, 'success', t.users.success.reactivated);
    } catch (error: unknown) {
      return result(previous, 'error', messageFor(error), 'reactivate');
    }
  },
);

export const resetPasswordAction = withActionPermission(
  { area: 'usersAndRoles', action: 'manage' },
  async (session, previous: UserManagementActionState, formData: FormData) => {
    const temporaryPassword = passwords(formData);
    if (!temporaryPassword.matches) {
      return result(previous, 'error', t.users.errors.passwordMismatch, 'confirmPassword');
    }
    try {
      await resetManagedPassword(
        Number(session.user.id),
        {
          accountId: numeric(formData, 'accountId'),
          expectedSessionVersion: numeric(formData, 'sessionVersion'),
          temporaryPassword: temporaryPassword.value,
        },
        { auditMetadata: await metadata(session.user.auditSessionId) },
      );
      revalidatePath('/users');
      return result(previous, 'success', t.users.success.password);
    } catch (error: unknown) {
      return result(previous, 'error', messageFor(error), 'password');
    }
  },
);
