'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Session } from 'next-auth';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { mutateFeeLetter, mutateMatterFeeReference } from '@/lib/fee-letter-mutations';
import {
  parseFeeLetterForm,
  parseMatterFeeReferenceForm,
  FeeLetterMutationError,
  type FeeLetterCode,
  type FeeLetterOperation,
  type MatterFeeReferenceOperation,
} from '@/lib/fee-letter-mutation-input';
import { t } from '@/strings';
export type FeeLetterActionResult = {
  kind: 'success' | 'error';
  message: string;
  code?: FeeLetterCode;
  field?: string;
  id?: number;
};
async function execute(
  session: Session,
  operation: FeeLetterOperation,
  form: FormData,
): Promise<FeeLetterActionResult> {
  try {
    const r = await mutateFeeLetter(session, operation, parseFeeLetterForm(operation, form), {
      auditMetadata: createServerActionAuditMetadata(await headers(), session.user.auditSessionId),
    });
    if (r.changed) {
      revalidatePath('/fee-letters', 'layout');
      revalidatePath('/matters', 'layout');
      revalidatePath('/clients', 'layout');
    }
    return {
      kind: 'success',
      message: r.changed ? t.feeLettersModule.saved : t.feeLettersModule.unchanged,
      id: r.id,
    };
  } catch (e) {
    const code = e instanceof FeeLetterMutationError ? e.code : 'generic';
    return {
      kind: 'error',
      code,
      field: e instanceof FeeLetterMutationError ? e.field : '',
      message: new Map(Object.entries(t.feeLettersModule.errors)).get(code)!,
    };
  }
}
async function executeReference(
  session: Session,
  operation: MatterFeeReferenceOperation,
  form: FormData,
): Promise<FeeLetterActionResult> {
  try {
    const r = await mutateMatterFeeReference(
      session,
      operation,
      parseMatterFeeReferenceForm(operation, form),
      {
        auditMetadata: createServerActionAuditMetadata(
          await headers(),
          session.user.auditSessionId,
        ),
      },
    );
    if (r.changed) {
      revalidatePath('/fee-letters', 'layout');
      revalidatePath('/matters', 'layout');
    }
    return {
      kind: 'success',
      message: r.changed ? t.feeLettersModule.saved : t.feeLettersModule.unchanged,
      id: r.id,
    };
  } catch (e) {
    const code = e instanceof FeeLetterMutationError ? e.code : 'generic';
    return {
      kind: 'error',
      code,
      message: new Map(Object.entries(t.feeLettersModule.errors)).get(code)!,
    };
  }
}
export const createFeeLetterAction = withActionPermission(
  { area: 'feeLetters', action: 'create' },
  async (s, f: FormData) => execute(s, 'create', f),
);
export const updateFeeLetterAction = withActionPermission(
  { area: 'feeLetters', action: 'update' },
  async (s, f: FormData) => execute(s, 'update', f),
);
export const archiveFeeLetterAction = withActionPermission(
  { area: 'feeLetters', action: 'archive' },
  async (s, f: FormData) => execute(s, 'archive', f),
);
export const restoreFeeLetterAction = withActionPermission(
  { area: 'feeLetters', action: 'restore' },
  async (s, f: FormData) => execute(s, 'restore', f),
);
export const addCoveredMatterAction = withActionPermission(
  { area: 'feeLetters', action: 'update' },
  async (s, f: FormData) => execute(s, 'covered-add', f),
);
export const retireCoveredMatterAction = withActionPermission(
  { area: 'feeLetters', action: 'update' },
  async (s, f: FormData) => execute(s, 'covered-retire', f),
);
export const restoreCoveredMatterAction = withActionPermission(
  { area: 'feeLetters', action: 'update' },
  async (s, f: FormData) => execute(s, 'covered-restore', f),
);
export const setMatterFeeReferenceAction = withActionPermission(
  { area: 'feeLetters', action: 'update' },
  async (s, f: FormData) => executeReference(s, 'set', f),
);
export const clearMatterFeeReferenceAction = withActionPermission(
  { area: 'feeLetters', action: 'update' },
  async (s, f: FormData) => executeReference(s, 'clear', f),
);
export const replaceMatterFeeReferenceAction = withActionPermission(
  { area: 'feeLetters', action: 'update' },
  async (s, f: FormData) => executeReference(s, 'replace', f),
);
