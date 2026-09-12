'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Session } from 'next-auth';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { mutateMatterLifecycle, type MatterLifecycleAction } from '@/lib/matter-lifecycle';
import { MatterMutationError } from '@/lib/matter-mutation-input';
import type { MatterActionResult } from './actions';
import { t } from '@/strings';
async function execute(
  session: Session,
  action: MatterLifecycleAction,
  input: unknown,
): Promise<MatterActionResult> {
  try {
    const result = await mutateMatterLifecycle(session, action, input, {
      auditMetadata: createServerActionAuditMetadata(await headers(), session.user.auditSessionId),
    });
    if (result.changed) {
      revalidatePath('/matters', 'layout');
      revalidatePath('/clients', 'layout');
    }
    return {
      kind: 'success',
      field: '',
      id: result.id,
      version: result.version,
      message: result.changed
        ? action === 'archive'
          ? t.matters.lifecycle.archivedSuccess
          : t.matters.lifecycle.restoredSuccess
        : t.matters.lifecycle.unchanged,
    };
  } catch (error) {
    const code = error instanceof MatterMutationError ? error.code : 'generic';
    return {
      kind: 'error',
      field: '',
      code,
      message:
        code === 'stale'
          ? t.matters.lifecycle.stale
          : (new Map(Object.entries(t.matters.manage.errors)).get(code) ??
            t.matters.manage.errors.generic),
    };
  }
}
export const archiveMatterAction = withActionPermission(
  { area: 'matters', action: 'archive' },
  async (session, input: unknown) => execute(session, 'archive', input),
);
export const restoreMatterAction = withActionPermission(
  { area: 'matters', action: 'restore' },
  async (session, input: unknown) => execute(session, 'restore', input),
);
