'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Session } from 'next-auth';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { mutatePoa } from '@/lib/poa-mutations';
import {
  parsePoaForm,
  PoaMutationError,
  type PoaCode,
  type PoaOperation,
} from '@/lib/poa-mutation-input';
import { t } from '@/strings';
export type PoaActionResult = {
  kind: 'success' | 'error';
  message: string;
  code?: PoaCode;
  field?: string;
  id?: number;
};
async function execute(
  session: Session,
  operation: PoaOperation,
  form: FormData,
): Promise<PoaActionResult> {
  try {
    const r = await mutatePoa(session, operation, parsePoaForm(operation, form), {
      auditMetadata: createServerActionAuditMetadata(await headers(), session.user.auditSessionId),
    });
    if (r.changed) {
      revalidatePath('/powers-of-attorney', 'layout');
      revalidatePath('/clients', 'layout');
    }
    return { kind: 'success', message: r.changed ? t.poa.saved : t.poa.unchanged, id: r.id };
  } catch (e) {
    const code = e instanceof PoaMutationError ? e.code : 'generic';
    return {
      kind: 'error',
      code,
      message: new Map(Object.entries(t.poa.errors)).get(code)!,
      field: e instanceof PoaMutationError ? e.field : '',
    };
  }
}
export const createPoaAction = withActionPermission(
  { area: 'powersOfAttorney', action: 'create' },
  async (session, form: FormData) => execute(session, 'create', form),
);
export const updatePoaAction = withActionPermission(
  { area: 'powersOfAttorney', action: 'update' },
  async (session, form: FormData) => execute(session, 'update', form),
);
export const archivePoaAction = withActionPermission(
  { area: 'powersOfAttorney', action: 'archive' },
  async (session, form: FormData) => execute(session, 'archive', form),
);
export const restorePoaAction = withActionPermission(
  { area: 'powersOfAttorney', action: 'restore' },
  async (session, form: FormData) => execute(session, 'restore', form),
);
