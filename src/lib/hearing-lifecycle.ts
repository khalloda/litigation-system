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
import { HearingMutationError } from './hearing-mutation-input';
function hearingLifecycleId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new HearingMutationError('invalid');
}

export type HearingLifecycleAction = 'archive' | 'restore';
export type HearingLifecycleSnapshot = {
  id: number;
  version: string;
  archived: boolean;
  facts: {
    hearingDate: string | null;
    matterId: number | null;
    caseNumber: string | null;
    matterArchived: boolean;
    currentAttendees: number;
    retiredAttendees: number;
  };
};
export type HearingLifecycleInput = {
  id: number;
  confirmation: number;
  version: string;
  submission: string;
  action: HearingLifecycleAction;
  facts: HearingLifecycleSnapshot['facts'];
};
export function parseHearingLifecycle(
  action: HearingLifecycleAction,
  value: unknown,
): HearingLifecycleInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HearingMutationError('invalid');
  const v = value as HearingLifecycleInput;
  if (
    Object.keys(v).sort().join(',') !== 'action,confirmation,facts,id,submission,version' ||
    v.action !== action ||
    v.confirmation !== v.id ||
    typeof v.version !== 'string' ||
    !/^[1-9][0-9]{0,18}$/u.test(v.version) ||
    BigInt(v.version) > 9223372036854775807n ||
    typeof v.submission !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(v.submission) ||
    !v.facts ||
    typeof v.facts !== 'object' ||
    Array.isArray(v.facts) ||
    Object.keys(v.facts).sort().join(',') !==
      'caseNumber,currentAttendees,hearingDate,matterArchived,matterId,retiredAttendees' ||
    [v.facts.currentAttendees, v.facts.retiredAttendees].some(
      (n) => !Number.isSafeInteger(n) || n < 0,
    ) ||
    typeof v.facts.matterArchived !== 'boolean' ||
    (v.facts.matterId !== null &&
      (!Number.isInteger(v.facts.matterId) ||
        v.facts.matterId < 1 ||
        v.facts.matterId > 2147483647)) ||
    [v.facts.caseNumber, v.facts.hearingDate].some(
      (v) => v !== null && (typeof v !== 'string' || v.length > 10000),
    )
  )
    throw new HearingMutationError('invalid');
  hearingLifecycleId(v.id);
  return v;
}
function authorize(session: Session | null, action: HearingLifecycleAction) {
  const actor = requireAuthorizedDecision(decideAuthorization(session, 'hearings', action));
  if (!(Date.parse(actor.expires) > Date.now())) throw new AuthorizationError('unauthenticated');
  return actor;
}
function translate(error: unknown): never {
  if (error instanceof HearingMutationError || error instanceof AuthorizationError) throw error;
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Hearing version or confirmation is stale'))
    throw new HearingMutationError('stale');
  if (message.includes('Hearing submission payload differs'))
    throw new HearingMutationError('submission');
  if (message.includes('Restore archived matter before editing hearing'))
    throw new HearingMutationError('archived');
  if (message.includes('42501')) throw new HearingMutationError('session');
  if (message.includes('P0002')) throw new HearingMutationError('not-found');
  if (/22023|22003|22P02/u.test(message)) throw new HearingMutationError('invalid');
  throw error;
}
export async function readHearingLifecycle(
  session: Session | null,
  action: HearingLifecycleAction,
  id: number,
  database: PrismaClient = db,
): Promise<HearingLifecycleSnapshot> {
  const actor = authorize(session, action);
  hearingLifecycleId(id);
  try {
    return await database.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        const rows = await tx.$queryRaw<{ state: HearingLifecycleSnapshot }[]>(
          Prisma.sql`SELECT public.hearing_lifecycle_state(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${id}::integer) state`,
        );
        if (rows.length !== 1) throw new HearingMutationError('generic');
        return rows[0]!.state;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  } catch (error) {
    return translate(error);
  }
}
export async function mutateHearingLifecycle(
  session: Session | null,
  action: HearingLifecycleAction,
  value: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
) {
  const actor = authorize(session, action),
    input = parseHearingLifecycle(action, value),
    database = dependencies.database ?? db;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (tx) => {
          await setHumanAuditContext(tx, Number(actor.user.id), dependencies.auditMetadata);
          const rows = await tx.$queryRaw<
            { result: { id: number; version: string; changed: boolean } }[]
          >(
            Prisma.sql`SELECT public.hearing_lifecycle_save(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(input)}::jsonb) result`,
          );
          if (rows.length !== 1) throw new HearingMutationError('generic');
          return rows[0]!.result;
        },
        { isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000 },
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
