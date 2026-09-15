'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Session } from 'next-auth';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { mutateAdminLifecycle, type AdminLifecycleOperation } from '@/lib/admin-lifecycle';
import { AdminMutationError } from '@/lib/admin-work-mutation-input';
import type { AdminActionResult } from './actions';
import { t } from '@/strings';
async function execute(
  session: Session,
  operation: AdminLifecycleOperation,
  input: unknown,
): Promise<AdminActionResult> {
  try {
    const result = await mutateAdminLifecycle(session, operation, input, {
      auditMetadata: createServerActionAuditMetadata(await headers(), session.user.auditSessionId),
    });
    if (result.changed) {
      revalidatePath('/admin-works', 'layout');
      revalidatePath('/matters', 'layout');
    }
    return {
      kind: 'success',
      field: '',
      id: result.id,
      stepId: result.stepId,
      message: t.adminWorks.lifecycle.acknowledged,
    };
  } catch (error) {
    const code = error instanceof AdminMutationError ? error.code : 'generic';
    return {
      kind: 'error',
      field: '',
      code,
      message:
        code === 'stale'
          ? t.adminWorks.lifecycle.stale
          : code === 'archived'
            ? t.adminWorks.manage.errors.archived
            : (new Map(Object.entries(t.adminWorks.manage.errors)).get(code) ??
              t.adminWorks.manage.errors.generic),
    };
  }
}
export const archiveAdminTaskAction = withActionPermission(
  { area: 'administrativeWorks', action: 'archive' },
  async (session, input: unknown) => execute(session, 'task-archive', input),
);
export const restoreAdminTaskAction = withActionPermission(
  { area: 'administrativeWorks', action: 'restore' },
  async (session, input: unknown) => execute(session, 'task-restore', input),
);
export const archiveAdminStepAction = withActionPermission(
  { area: 'administrativeWorks', action: 'archive' },
  async (session, input: unknown) => execute(session, 'step-archive', input),
);
export const restoreAdminStepAction = withActionPermission(
  { area: 'administrativeWorks', action: 'restore' },
  async (session, input: unknown) => execute(session, 'step-restore', input),
);
