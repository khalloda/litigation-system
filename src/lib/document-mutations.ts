import type { Session } from 'next-auth';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { db } from './db';
import { setHumanAuditContext } from './audit';
import type { AuditRequestMetadata } from './audit-metadata';
import {
  decideAuthorization,
  requireAuthorizedDecision,
  AuthorizationError,
} from './auth/authorization-core';
import { withSerializableRetry } from './auth/service';
import {
  DOCUMENT_FIELDS,
  parseDocumentInput,
  DocumentMutationError,
  type DocumentOperation,
  type DocumentValues,
} from './document-mutation-input';

export type DocumentSnapshot = {
  record: {
    id: number;
    version: string;
    archived: boolean;
    values: DocumentValues;
    facts: Record<string, unknown>;
  } | null;
  clients: { id: number; name: string; active: boolean }[];
  matters: { id: number; name: string | null; active: boolean }[];
  people: { id: number; name: string; active: boolean; staff: boolean }[];
};
function authorize(session: Session | null, operation: DocumentOperation) {
  const actor = requireAuthorizedDecision(decideAuthorization(session, 'documents', operation));
  if (!(Date.parse(actor.expires) > Date.now())) throw new AuthorizationError('unauthenticated');
  return actor;
}
function translate(error: unknown): never {
  if (error instanceof DocumentMutationError || error instanceof AuthorizationError) throw error;
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Restore archived')) throw new DocumentMutationError('archived');
  if (message.includes('version or confirmation is stale'))
    throw new DocumentMutationError('stale');
  if (message.includes('submission payload differs')) throw new DocumentMutationError('submission');
  if (message.includes('42501')) throw new DocumentMutationError('session');
  if (message.includes('P0002')) throw new DocumentMutationError('not-found');
  if (/22023|22001|22003|22007|22008|23502|23503|23505|23514|22P02/u.test(message))
    throw new DocumentMutationError('invalid');
  throw error;
}
export async function readDocumentMutation(
  session: Session | null,
  operation: DocumentOperation,
  id: number | null,
  database: PrismaClient = db,
): Promise<DocumentSnapshot> {
  const actor = authorize(session, operation);
  if (
    (operation === 'create') !== (id === null) ||
    (id !== null && (!Number.isInteger(id) || id < 1 || id > 2147483647))
  )
    throw new DocumentMutationError('invalid');
  try {
    return await database.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        const rows = await tx.$queryRaw<{ state: DocumentSnapshot }[]>(
          Prisma.sql`SELECT public.document_edit_state(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${id}::integer) state`,
        );
        if (rows.length !== 1) throw new DocumentMutationError('generic');
        const state = rows[0]!.state;
        if (state.record)
          state.record.values = Object.fromEntries(
            Object.entries(state.record.values).filter(([key]) =>
              (DOCUMENT_FIELDS as readonly string[]).includes(key),
            ),
          );
        return state;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  } catch (error) {
    return translate(error);
  }
}
export async function mutateDocument(
  session: Session | null,
  operation: DocumentOperation,
  untrusted: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
) {
  const actor = authorize(session, operation);
  const input = parseDocumentInput(operation, untrusted);
  const database = dependencies.database ?? db;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (tx) => {
          await setHumanAuditContext(tx, Number(actor.user.id), dependencies.auditMetadata);
          const rows = await tx.$queryRaw<
            { result: { id: number; version: string; changed: boolean } }[]
          >(
            Prisma.sql`SELECT public.document_edit_save(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(input)}::jsonb) result`,
          );
          if (rows.length !== 1) throw new DocumentMutationError('generic');
          return rows[0]!.result;
        },
        { isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000 },
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
