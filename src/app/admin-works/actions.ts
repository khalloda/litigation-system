'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Session } from 'next-auth';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { mutateAdminWork } from '@/lib/admin-work-mutations';
import {
  parseAdminMutationForm,
  AdminMutationError,
  type AdminMutationCode,
  type AdminOperation,
} from '@/lib/admin-work-mutation-input';
import { t } from '@/strings';
export type AdminActionResult = {
  kind: 'success' | 'error';
  message: string;
  field: string;
  code?: AdminMutationCode;
  id?: number;
  stepId?: number | null;
};
async function execute(
  session: Session,
  operation: AdminOperation,
  form: FormData,
): Promise<AdminActionResult> {
  try {
    const result = await mutateAdminWork(
      session,
      operation,
      parseAdminMutationForm(operation, form),
      {
        auditMetadata: createServerActionAuditMetadata(
          await headers(),
          session.user.auditSessionId,
        ),
      },
    );
    if (result.changed) {
      revalidatePath('/admin-works', 'layout');
      revalidatePath('/matters', 'layout');
    }
    return {
      kind: 'success',
      message: result.changed ? t.adminWorks.manage.saved : t.adminWorks.manage.unchanged,
      field: '',
      id: result.id,
      stepId: result.stepId,
    };
  } catch (error) {
    const code = error instanceof AdminMutationError ? error.code : 'generic';
    return {
      kind: 'error',
      message:
        new Map(Object.entries(t.adminWorks.manage.errors)).get(code) ??
        t.adminWorks.manage.errors.generic,
      field: error instanceof AdminMutationError ? error.field : '',
      code,
    };
  }
}
export const createAdminTaskAction = withActionPermission(
  { area: 'administrativeWorks', action: 'create' },
  async (session, form: FormData) => execute(session, 'task-create', form),
);
export const updateAdminTaskAction = withActionPermission(
  { area: 'administrativeWorks', action: 'update' },
  async (session, form: FormData) => execute(session, 'task-update', form),
);
export const createAdminStepAction = withActionPermission(
  { area: 'administrativeWorks', action: 'create' },
  async (session, form: FormData) => execute(session, 'step-create', form),
);
export const updateAdminStepAction = withActionPermission(
  { area: 'administrativeWorks', action: 'update' },
  async (session, form: FormData) => execute(session, 'step-update', form),
);
