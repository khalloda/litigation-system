'use server';

import type { Session } from 'next-auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { mutateStaff, StaffMutationError, type StaffOperation } from '@/lib/staff-mutations';
import { t } from '@/strings';

export type StaffActionResult = {
  kind: 'error' | 'success';
  message: string;
  field: string;
  personId?: number;
};

function errorMessage(error: unknown): string {
  if (!(error instanceof StaffMutationError)) return t.staff.manage.errors.generic;
  switch (error.code) {
    case 'invalid':
      return t.staff.manage.errors.invalid;
    case 'name':
      return t.staff.manage.errors.name;
    case 'email':
      return t.staff.manage.errors.email;
    case 'reason':
      return t.staff.manage.errors.reason;
    case 'confirmation':
      return t.staff.manage.errors.confirmation;
    case 'not-found':
      return t.staff.manage.errors['not-found'];
    case 'stale':
      return t.staff.manage.errors.stale;
    case 'administrator':
      return t.staff.manage.errors.administrator;
    case 'self':
      return t.staff.manage.errors.self;
    case 'last-administrator':
      return t.staff.manage.errors['last-administrator'];
    case 'reviewer':
      return t.staff.manage.errors.reviewer;
    case 'immutable-alias':
      return t.staff.manage.errors['immutable-alias'];
    case 'retired-alias':
      return t.staff.manage.errors['retired-alias'];
    case 'duplicate-name':
      return t.staff.manage.errors['duplicate-name'];
    case 'duplicate-email':
      return t.staff.manage.errors['duplicate-email'];
  }
}

async function execute(
  session: Session,
  operation: StaffOperation,
  form: FormData,
): Promise<StaffActionResult> {
  try {
    const input = new Map<string, string>();
    for (const key of [
      'personId',
      'version',
      'nameAr',
      'nameEn',
      'email',
      'isTrainee',
      'teamId',
      'teamVersion',
      'reviewerId',
      'alias',
      'aliasId',
      'reason',
      'confirmation',
    ]) {
      const values = form.getAll(key);
      if (values.length > 1 || values.some((value) => typeof value !== 'string'))
        throw new StaffMutationError('invalid', key);
      if (values.length) input.set(key, values[0] as string);
    }
    const result = await mutateStaff(session, operation, Object.fromEntries(input), {
      auditMetadata: createServerActionAuditMetadata(await headers(), session.user.auditSessionId),
    });
    if (result.changed) {
      revalidatePath('/staff', 'layout');
      revalidatePath('/users');
    }
    return {
      kind: 'success',
      message: result.changed ? t.staff.manage.saved : t.staff.manage.unchanged,
      field: '',
      personId: result.personId,
    };
  } catch (error) {
    return {
      kind: 'error',
      message: errorMessage(error),
      field: error instanceof StaffMutationError ? error.field : '',
    };
  }
}

export const createStaffAction = withActionPermission(
  { area: 'staff', action: 'manage' },
  async (session, form: FormData) => execute(session, 'create', form),
);
export const updateStaffAction = withActionPermission(
  { area: 'staff', action: 'manage' },
  async (session, form: FormData) => execute(session, 'update', form),
);
export const renameStaffAction = withActionPermission(
  { area: 'staff', action: 'manage' },
  async (session, form: FormData) => execute(session, 'rename', form),
);
export const addStaffAliasAction = withActionPermission(
  { area: 'staff', action: 'manage' },
  async (session, form: FormData) => execute(session, 'add-alias', form),
);
export const retireStaffAliasAction = withActionPermission(
  { area: 'staff', action: 'manage' },
  async (session, form: FormData) => execute(session, 'retire-alias', form),
);
export const restoreStaffAliasAction = withActionPermission(
  { area: 'staff', action: 'manage' },
  async (session, form: FormData) => execute(session, 'restore-alias', form),
);
export const deactivateStaffAction = withActionPermission(
  { area: 'staff', action: 'manage' },
  async (session, form: FormData) => execute(session, 'deactivate', form),
);
export const reactivateStaffAction = withActionPermission(
  { area: 'staff', action: 'manage' },
  async (session, form: FormData) => execute(session, 'reactivate', form),
);
export const setStaffReviewerAction = withActionPermission(
  { area: 'staff', action: 'manage' },
  async (session, form: FormData) => execute(session, 'reviewer', form),
);
