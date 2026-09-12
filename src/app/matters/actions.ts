'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Session } from 'next-auth';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { mutateMatter } from '@/lib/matter-mutations';
import {
  parseMatterMutationForm,
  MatterMutationError,
  type MatterMutationCode,
} from '@/lib/matter-mutation-input';
import { t } from '@/strings';
export type MatterActionResult = {
  kind: 'success' | 'error';
  message: string;
  field: string;
  code?: MatterMutationCode;
  id?: number;
  version?: string;
};
async function execute(
  session: Session,
  action: 'create' | 'update',
  form: FormData,
): Promise<MatterActionResult> {
  try {
    const result = await mutateMatter(session, action, parseMatterMutationForm(action, form), {
      auditMetadata: createServerActionAuditMetadata(await headers(), session.user.auditSessionId),
    });
    if (result.changed) {
      revalidatePath('/matters', 'layout');
      revalidatePath('/clients', 'layout');
    }
    return {
      kind: 'success',
      message: result.changed ? t.matters.manage.saved : t.matters.manage.unchanged,
      field: '',
      id: result.id,
      version: result.version,
    };
  } catch (error) {
    const code = error instanceof MatterMutationError ? error.code : 'generic';
    return {
      kind: 'error',
      message:
        new Map(Object.entries(t.matters.manage.errors)).get(code) ??
        t.matters.manage.errors.generic,
      field: error instanceof MatterMutationError ? error.field : '',
      code,
    };
  }
}
export const createMatterAction = withActionPermission(
  { area: 'matters', action: 'create' },
  async (session, form: FormData) => execute(session, 'create', form),
);
export const updateMatterAction = withActionPermission(
  { area: 'matters', action: 'update' },
  async (session, form: FormData) => execute(session, 'update', form),
);
