'use server';

import type { Session } from 'next-auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { withActionPermission } from '@/lib/auth/authorization';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { mutateClient } from '@/lib/client-mutations';
import {
  ClientMutationError,
  parseClientMutationForm,
  type ClientOperation,
  type ClientErrorCode,
} from '@/lib/client-mutation-input';
import { t } from '@/strings';
import { clientErrorMessage } from '@/lib/client-mutation-copy';

export type ClientActionResult = {
  kind: 'success' | 'error';
  message: string;
  field: string;
  code?: ClientErrorCode;
  id?: number;
  clientId?: number;
};
async function execute(
  session: Session,
  operation: ClientOperation,
  form: FormData,
): Promise<ClientActionResult> {
  try {
    const result = await mutateClient(
      session,
      operation,
      parseClientMutationForm(operation, form),
      {
        auditMetadata: createServerActionAuditMetadata(
          await headers(),
          session.user.auditSessionId,
        ),
      },
    );
    if (result.changed) revalidatePath('/clients', 'layout');
    return {
      kind: 'success',
      field: '',
      message: result.changed ? t.clients.manage.saved : t.clients.manage.unchanged,
      id: result.id,
      clientId: result.clientId,
    };
  } catch (error) {
    const code = error instanceof ClientMutationError ? error.code : 'generic';
    return {
      kind: 'error',
      code,
      field: error instanceof ClientMutationError ? error.field : '',
      message: clientErrorMessage(code),
    };
  }
}
export const createClientAction = withActionPermission(
  { area: 'clients', action: 'create' },
  async (session, form: FormData) => execute(session, 'client-create', form),
);
export const updateClientAction = withActionPermission(
  { area: 'clients', action: 'update' },
  async (session, form: FormData) => execute(session, 'client-update', form),
);
export const archiveClientAction = withActionPermission(
  { area: 'clients', action: 'archive' },
  async (session, form: FormData) => execute(session, 'client-archive', form),
);
export const restoreClientAction = withActionPermission(
  { area: 'clients', action: 'restore' },
  async (session, form: FormData) => execute(session, 'client-restore', form),
);
export const createContactAction = withActionPermission(
  { area: 'contacts', action: 'create' },
  async (session, form: FormData) => execute(session, 'contact-create', form),
);
export const updateContactAction = withActionPermission(
  { area: 'contacts', action: 'update' },
  async (session, form: FormData) => execute(session, 'contact-update', form),
);
export const archiveContactAction = withActionPermission(
  { area: 'contacts', action: 'archive' },
  async (session, form: FormData) => execute(session, 'contact-archive', form),
);
export const restoreContactAction = withActionPermission(
  { area: 'contacts', action: 'restore' },
  async (session, form: FormData) => execute(session, 'contact-restore', form),
);
