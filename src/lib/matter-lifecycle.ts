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
import { MatterMutationError, matterMutationId } from './matter-mutation-input';

export type MatterLifecycleAction = 'archive' | 'restore';
import { MATTER_COUNT_KEYS } from './matter-mutation-input';
export type MatterLifecycleSnapshot = {
  id: number;
  version: string;
  archived: boolean;
  caseNumber: string | null;
  subject: string | null;
  counts: Record<(typeof MATTER_COUNT_KEYS)[number], number>;
};
export type MatterLifecycleInput = {
  id: number;
  confirmation: number;
  version: string;
  submission: string;
  action: MatterLifecycleAction;
  counts: MatterLifecycleSnapshot['counts'];
};
export function parseMatterLifecycle(
  action: MatterLifecycleAction,
  value: unknown,
): MatterLifecycleInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MatterMutationError('invalid');
  const v = value as MatterLifecycleInput;
  if (
    Object.keys(v).sort().join(',') !== 'action,confirmation,counts,id,submission,version' ||
    v.action !== action ||
    v.confirmation !== v.id ||
    typeof v.version !== 'string' ||
    !/^[1-9][0-9]{0,18}$/u.test(v.version) ||
    BigInt(v.version) > 9223372036854775807n ||
    typeof v.submission !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(v.submission) ||
    !v.counts ||
    typeof v.counts !== 'object' ||
    Array.isArray(v.counts) ||
    Object.keys(v.counts).sort().join(',') !== [...MATTER_COUNT_KEYS].sort().join(',') ||
    Object.values(v.counts).some((n) => !Number.isSafeInteger(n) || n < 0)
  )
    throw new MatterMutationError('invalid');
  matterMutationId(v.id);
  return v;
}
function authorize(session: Session | null, action: MatterLifecycleAction) {
  const actor = requireAuthorizedDecision(decideAuthorization(session, 'matters', action));
  if (!(Date.parse(actor.expires) > Date.now())) throw new AuthorizationError('unauthenticated');
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
  if (/22023|22003|22P02/u.test(message)) throw new MatterMutationError('invalid');
  throw error;
}
export async function readMatterLifecycle(
  session: Session | null,
  action: MatterLifecycleAction,
  id: number,
  database: PrismaClient = db,
): Promise<MatterLifecycleSnapshot> {
  const actor = authorize(session, action);
  matterMutationId(id);
  try {
    return await database.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        const rows = await tx.$queryRaw<{ state: MatterLifecycleSnapshot }[]>(
          Prisma.sql`SELECT public.matter_lifecycle_state(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${id}::integer) state`,
        );
        if (rows.length !== 1) throw new MatterMutationError('generic');
        return rows[0]!.state;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  } catch (error) {
    return translate(error);
  }
}
export async function mutateMatterLifecycle(
  session: Session | null,
  action: MatterLifecycleAction,
  value: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
) {
  const actor = authorize(session, action),
    input = parseMatterLifecycle(action, value),
    database = dependencies.database ?? db;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (tx) => {
          await setHumanAuditContext(tx, Number(actor.user.id), dependencies.auditMetadata);
          const rows = await tx.$queryRaw<
            { result: { id: number; version: string; changed: boolean } }[]
          >(
            Prisma.sql`SELECT public.matter_lifecycle_save(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(input)}::jsonb) result`,
          );
          if (rows.length !== 1) throw new MatterMutationError('generic');
          return rows[0]!.result;
        },
        { isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000 },
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
