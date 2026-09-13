'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Session } from 'next-auth';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { mutateHearing } from '@/lib/hearing-mutations';
import {
  parseHearingMutationForm,
  HearingMutationError,
  type HearingMutationCode,
} from '@/lib/hearing-mutation-input';
import { t } from '@/strings';
export type HearingActionResult = {
  kind: 'success' | 'error';
  message: string;
  field: string;
  code?: HearingMutationCode;
  id?: number;
  version?: string;
};
async function execute(
  session: Session,
  action: 'create' | 'update',
  form: FormData,
): Promise<HearingActionResult> {
  try {
    const result = await mutateHearing(session, action, parseHearingMutationForm(action, form), {
      auditMetadata: createServerActionAuditMetadata(await headers(), session.user.auditSessionId),
    });
    if (result.changed) {
      revalidatePath('/hearings', 'layout');
      revalidatePath('/matters', 'layout');
    }
    return {
      kind: 'success',
      message: result.changed ? t.hearings.manage.saved : t.hearings.manage.unchanged,
      field: '',
      id: result.id,
      version: result.version,
    };
  } catch (error) {
    const code = error instanceof HearingMutationError ? error.code : 'generic';
    return {
      kind: 'error',
      message:
        new Map(Object.entries(t.hearings.manage.errors)).get(code) ??
        t.hearings.manage.errors.generic,
      field: error instanceof HearingMutationError ? error.field : '',
      code,
    };
  }
}
export const createHearingAction = withActionPermission(
  { area: 'hearings', action: 'create' },
  async (session, form: FormData) => execute(session, 'create', form),
);
export const updateHearingAction = withActionPermission(
  { area: 'hearings', action: 'update' },
  async (session, form: FormData) => execute(session, 'update', form),
);
