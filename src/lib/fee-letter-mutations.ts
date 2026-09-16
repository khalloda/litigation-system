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
  FEE_LETTER_FIELDS,
  parseFeeLetterInput,
  parseMatterFeeReferenceInput,
  FeeLetterMutationError,
  type FeeLetterOperation,
  type MatterFeeReferenceOperation,
  type FeeLetterValues,
} from './fee-letter-mutation-input';

export type FeeLetterSnapshot = {
  record: null | {
    id: number;
    version: string;
    archived: boolean;
    values: FeeLetterValues;
    facts: Record<string, unknown>;
    covered: { id: number; matterId: number; retired: boolean; order: number; original: boolean }[];
  };
  clients: { id: number; name: string; active: boolean }[];
  matters: { id: number; name: string | null; active: boolean }[];
};
export type MatterFeeReferenceSnapshot = {
  matterId: number;
  matterName: string | null;
  version: string;
  matterArchived: boolean;
  references: {
    id: number;
    fee_letter_id: number;
    is_retired: boolean;
    legacy_source_record_key: string | null;
  }[];
  feeLetters: {
    id: number;
    contractId: number | null;
    clientName: string | null;
    active: boolean;
  }[];
};
function action(operation: FeeLetterOperation) {
  return operation === 'create' || operation === 'archive' || operation === 'restore'
    ? operation
    : 'update';
}
function authorize(session: Session | null, operation: FeeLetterOperation) {
  const actor = requireAuthorizedDecision(
    decideAuthorization(session, 'feeLetters', action(operation)),
  );
  if (!(Date.parse(actor.expires) > Date.now())) throw new AuthorizationError('unauthenticated');
  return actor;
}
function authorizeReference(session: Session | null) {
  const actor = requireAuthorizedDecision(decideAuthorization(session, 'feeLetters', 'update'));
  requireAuthorizedDecision(decideAuthorization(session, 'matters', 'update'));
  if (!(Date.parse(actor.expires) > Date.now())) throw new AuthorizationError('unauthenticated');
  return actor;
}
function translate(error: unknown): never {
  if (error instanceof FeeLetterMutationError || error instanceof AuthorizationError) throw error;
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Restore archived') || message.includes('Restore affected'))
    throw new FeeLetterMutationError('archived');
  if (
    message.includes('version or confirmation is stale') ||
    message.includes('version or subject is stale')
  )
    throw new FeeLetterMutationError('stale');
  if (message.includes('submission payload differs'))
    throw new FeeLetterMutationError('submission');
  if (message.includes('42501')) throw new FeeLetterMutationError('session');
  if (message.includes('P0002')) throw new FeeLetterMutationError('not-found');
  if (/22023|22001|22003|22007|22008|23502|23503|23505|23514|22P02/u.test(message))
    throw new FeeLetterMutationError('invalid');
  throw error;
}
export async function readFeeLetterMutation(
  session: Session | null,
  operation: FeeLetterOperation,
  id: number | null,
  database: PrismaClient = db,
): Promise<FeeLetterSnapshot> {
  const actor = authorize(session, operation);
  if (
    (operation === 'create') !== (id === null) ||
    (id !== null && (!Number.isInteger(id) || id < 1 || id > 2147483647))
  )
    throw new FeeLetterMutationError('invalid');
  try {
    return await database.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        const rows = await tx.$queryRaw<{ state: FeeLetterSnapshot }[]>(
          Prisma.sql`SELECT public.fee_letter_edit_state(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${id}::integer) state`,
        );
        if (rows.length !== 1) throw new FeeLetterMutationError('generic');
        const state = rows[0]!.state;
        if (state.record)
          state.record.values = Object.fromEntries(
            Object.entries(state.record.values).filter(([key]) =>
              (FEE_LETTER_FIELDS as readonly string[]).includes(key),
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
export async function mutateFeeLetter(
  session: Session | null,
  operation: FeeLetterOperation,
  untrusted: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
) {
  const actor = authorize(session, operation),
    input = parseFeeLetterInput(operation, untrusted),
    database = dependencies.database ?? db;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (tx) => {
          await setHumanAuditContext(tx, Number(actor.user.id), dependencies.auditMetadata);
          const rows = await tx.$queryRaw<
            { result: { id: number; version: string; changed: boolean } }[]
          >(
            Prisma.sql`SELECT public.fee_letter_edit_save(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(input)}::jsonb) result`,
          );
          if (rows.length !== 1) throw new FeeLetterMutationError('generic');
          return rows[0]!.result;
        },
        { isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000 },
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
export async function readMatterFeeReferenceMutation(
  session: Session | null,
  matterId: number,
  database: PrismaClient = db,
): Promise<MatterFeeReferenceSnapshot> {
  const actor = authorizeReference(session);
  if (!Number.isInteger(matterId) || matterId < 1 || matterId > 2147483647)
    throw new FeeLetterMutationError('invalid');
  try {
    return await database.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        const rows = await tx.$queryRaw<{ state: MatterFeeReferenceSnapshot }[]>(
          Prisma.sql`SELECT public.matter_fee_reference_edit_state(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${matterId}::integer) state`,
        );
        if (rows.length !== 1) throw new FeeLetterMutationError('generic');
        return rows[0]!.state;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  } catch (error) {
    return translate(error);
  }
}
export async function mutateMatterFeeReference(
  session: Session | null,
  operation: MatterFeeReferenceOperation,
  untrusted: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
) {
  const actor = authorizeReference(session),
    input = parseMatterFeeReferenceInput(operation, untrusted),
    database = dependencies.database ?? db;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (tx) => {
          await setHumanAuditContext(tx, Number(actor.user.id), dependencies.auditMetadata);
          const rows = await tx.$queryRaw<
            { result: { id: number; version: string; changed: boolean } }[]
          >(
            Prisma.sql`SELECT public.matter_fee_reference_edit_save(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(input)}::jsonb) result`,
          );
          if (rows.length !== 1) throw new FeeLetterMutationError('generic');
          return rows[0]!.result;
        },
        { isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000 },
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
