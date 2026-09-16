'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Session } from 'next-auth';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { mutateDocument } from '@/lib/document-mutations';
import {
  parseDocumentForm,
  DocumentMutationError,
  type DocumentCode,
  type DocumentOperation,
} from '@/lib/document-mutation-input';
import { t } from '@/strings';

export type DocumentActionResult = {
  kind: 'success' | 'error';
  message: string;
  code?: DocumentCode;
  field?: string;
  id?: number;
};
async function execute(
  session: Session,
  operation: DocumentOperation,
  form: FormData,
): Promise<DocumentActionResult> {
  try {
    const result = await mutateDocument(session, operation, parseDocumentForm(operation, form), {
      auditMetadata: createServerActionAuditMetadata(await headers(), session.user.auditSessionId),
    });
    if (result.changed) {
      revalidatePath('/documents', 'layout');
      revalidatePath('/clients', 'layout');
      revalidatePath('/matters', 'layout');
    }
    return {
      kind: 'success',
      message: result.changed ? t.documentsModule.saved : t.documentsModule.unchanged,
      id: result.id,
    };
  } catch (error) {
    const code = error instanceof DocumentMutationError ? error.code : 'generic';
    return {
      kind: 'error',
      code,
      field: error instanceof DocumentMutationError ? error.field : '',
      message: new Map(Object.entries(t.documentsModule.errors)).get(code)!,
    };
  }
}
export const createDocumentAction = withActionPermission(
  { area: 'documents', action: 'create' },
  async (s, f: FormData) => execute(s, 'create', f),
);
export const updateDocumentAction = withActionPermission(
  { area: 'documents', action: 'update' },
  async (s, f: FormData) => execute(s, 'update', f),
);
export const archiveDocumentAction = withActionPermission(
  { area: 'documents', action: 'archive' },
  async (s, f: FormData) => execute(s, 'archive', f),
);
export const restoreDocumentAction = withActionPermission(
  { area: 'documents', action: 'restore' },
  async (s, f: FormData) => execute(s, 'restore', f),
);
