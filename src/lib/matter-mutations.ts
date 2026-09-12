import type { Session } from 'next-auth';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { setHumanAuditContext } from '@/lib/audit';
import type { AuditRequestMetadata } from '@/lib/audit-metadata';
import {
  decideAuthorization,
  requireAuthorizedDecision,
  AuthorizationError,
} from '@/lib/auth/authorization-core';
import { withSerializableRetry } from '@/lib/auth/service';
import {
  parseMatterMutationInput,
  MatterMutationError,
  type MatterValues,
  type MatterPartyInput,
  type MatterLawyerInput,
} from './matter-mutation-input';

type Choice = { id: number; name: string; active: boolean; context?: string | null };
export type MatterMutationSnapshot = {
  record: { id: number; version: string; values: MatterValues } | null;
  choices: Record<string, Choice[]>;
  clients: Choice[];
  people: Choice[];
  branches: { client_id: number; branch_id: number }[];
  roles: { id: number; male: string; female: string | null; active: boolean }[];
  defaultType: number;
  parties: MatterPartyInput[];
  lawyers: MatterLawyerInput[];
};
function authorize(session: Session | null, action: 'create' | 'update') {
  const actor = requireAuthorizedDecision(decideAuthorization(session, 'matters', action));
  if (!Number.isFinite(Date.parse(actor.expires)) || Date.parse(actor.expires) <= Date.now())
    throw new AuthorizationError('unauthenticated');
  return actor;
}
function translate(error: unknown): never {
  if (error instanceof MatterMutationError || error instanceof AuthorizationError) throw error;
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Matter version is stale')) throw new MatterMutationError('stale');
  if (message.includes('Matter submission payload differs'))
    throw new MatterMutationError('submission');
  if (message.includes('42501')) throw new MatterMutationError('session');
  if (message.includes('P0002')) throw new MatterMutationError('not-found');
  if (/22023|22001|22003|22007|22008|23502|23503|23505|23514|22P02/u.test(message))
    throw new MatterMutationError('invalid');
  throw error;
}
export async function readMatterMutation(
  session: Session | null,
  action: 'create' | 'update',
  id: number | null,
  database: PrismaClient = db,
): Promise<MatterMutationSnapshot> {
  const actor = authorize(session, action);
  if (
    (action === 'create') !== (id === null) ||
    (id !== null && (!Number.isInteger(id) || id < 1 || id > 2147483647))
  )
    throw new MatterMutationError('invalid');
  try {
    return await database.$transaction(
      async (transaction) => {
        await transaction.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        const rows = await transaction.$queryRaw<{ state: MatterMutationSnapshot }[]>(Prisma.sql`
        SELECT public.matter_edit_state(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,
          ${actor.user.role}::text,${actor.expires}::timestamptz,${id}::integer) AS state`);
        if (rows.length !== 1) throw new MatterMutationError('generic');
        return rows[0]!.state;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  } catch (error) {
    return translate(error);
  }
}
export async function mutateMatter(
  session: Session | null,
  action: 'create' | 'update',
  untrusted: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
) {
  const actor = authorize(session, action);
  const input = parseMatterMutationInput(action, untrusted);
  const database = dependencies.database ?? db;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (transaction) => {
          await setHumanAuditContext(
            transaction,
            Number(actor.user.id),
            dependencies.auditMetadata,
          );
          const rows = await transaction.$queryRaw<
            { result: { id: number; version: string; changed: boolean } }[]
          >(Prisma.sql`
        SELECT public.matter_edit_save(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,
          ${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(input)}::jsonb) AS result`);
          if (rows.length !== 1) throw new MatterMutationError('generic');
          return rows[0]!.result;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 30000,
        },
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
