'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Session } from 'next-auth';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { mutateHearingLifecycle, type HearingLifecycleAction } from '@/lib/hearing-lifecycle';
import { HearingMutationError } from '@/lib/hearing-mutation-input';
import type { HearingActionResult } from './actions';
import { t } from '@/strings';
async function execute(
  session: Session,
  action: HearingLifecycleAction,
  input: unknown,
): Promise<HearingActionResult> {
  try {
    const result = await mutateHearingLifecycle(session, action, input, {
      auditMetadata: createServerActionAuditMetadata(await headers(), session.user.auditSessionId),
    });
    if (result.changed) {
      revalidatePath('/hearings', 'layout');
      revalidatePath('/clients', 'layout');
    }
    return {
      kind: 'success',
      field: '',
      id: result.id,
      version: result.version,
      message: t.hearings.lifecycle.acknowledged,
    };
  } catch (error) {
    const code = error instanceof HearingMutationError ? error.code : 'generic';
    return {
      kind: 'error',
      field: '',
      code,
      message:
        code === 'stale'
          ? t.hearings.lifecycle.stale
          : (new Map(Object.entries(t.hearings.manage.errors)).get(code) ??
            t.hearings.manage.errors.generic),
    };
  }
}
export const archiveHearingAction = withActionPermission(
  { area: 'hearings', action: 'archive' },
  async (session, input: unknown) => execute(session, 'archive', input),
);
export const restoreHearingAction = withActionPermission(
  { area: 'hearings', action: 'restore' },
  async (session, input: unknown) => execute(session, 'restore', input),
);
