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
  POA_FIELDS,
  parsePoaInput,
  PoaMutationError,
  type PoaOperation,
  type PoaValues,
} from './poa-mutation-input';
export type PoaSnapshot = {
  record: {
    id: number;
    version: string;
    archived: boolean;
    parentArchived: boolean;
    values: PoaValues;
    sourceClient: string | null;
    sourceLawyers: string | null;
  } | null;
  clients: { id: number; name: string; active: boolean }[];
  people: { id: number; name: string; active: boolean; staff: boolean }[];
  lawyers: { personId: number; retired: boolean; original: boolean; order: number }[];
  facts: Record<string, unknown> | null;
};
function authorize(session: Session | null, op: PoaOperation) {
  const actor = requireAuthorizedDecision(decideAuthorization(session, 'powersOfAttorney', op));
  if (!(Date.parse(actor.expires) > Date.now())) throw new AuthorizationError('unauthenticated');
  return actor;
}
function translate(error: unknown): never {
  if (error instanceof PoaMutationError || error instanceof AuthorizationError) throw error;
  const m = error instanceof Error ? error.message : '';
  if (m.includes('Restore archived')) throw new PoaMutationError('archived');
  if (m.includes('POA version or confirmation is stale')) throw new PoaMutationError('stale');
  if (m.includes('POA submission payload differs')) throw new PoaMutationError('submission');
  if (m.includes('42501')) throw new PoaMutationError('session');
  if (m.includes('P0002')) throw new PoaMutationError('not-found');
  if (/22023|22001|22003|22007|22008|23502|23503|23505|23514|22P02/u.test(m))
    throw new PoaMutationError('invalid');
  throw error;
}
export async function readPoaMutation(
  session: Session | null,
  operation: PoaOperation,
  id: number | null,
  database: PrismaClient = db,
): Promise<PoaSnapshot> {
  const actor = authorize(session, operation);
  if (
    (operation === 'create') !== (id === null) ||
    (id !== null && (!Number.isInteger(id) || id < 1 || id > 2147483647))
  )
    throw new PoaMutationError('invalid');
  try {
    return await database.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        const rows = await tx.$queryRaw<{ state: PoaSnapshot }[]>(
          Prisma.sql`SELECT public.poa_edit_state(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${id}::integer) AS state`,
        );
        if (rows.length !== 1) throw new PoaMutationError('generic');
        const state = rows[0]!.state;
        if (state.record)
          state.record.values = Object.fromEntries(
            Object.entries(state.record.values).filter(([k]) =>
              (POA_FIELDS as readonly string[]).includes(k),
            ),
          );
        return state;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  } catch (e) {
    return translate(e);
  }
}
export async function mutatePoa(
  session: Session | null,
  operation: PoaOperation,
  untrusted: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
) {
  const actor = authorize(session, operation),
    input = parsePoaInput(operation, untrusted),
    database = dependencies.database ?? db;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (tx) => {
          await setHumanAuditContext(tx, Number(actor.user.id), dependencies.auditMetadata);
          const rows = await tx.$queryRaw<
            { result: { id: number; version: string; changed: boolean } }[]
          >(
            Prisma.sql`SELECT public.poa_edit_save(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(input)}::jsonb) AS result`,
          );
          if (rows.length !== 1) throw new PoaMutationError('generic');
          return rows[0]!.result;
        },
        { isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000 },
      ),
    );
  } catch (e) {
    return translate(e);
  }
}
