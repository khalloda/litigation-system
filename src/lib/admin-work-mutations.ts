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
  parseAdminMutationInput,
  AdminMutationError,
  ADMIN_TASK_FIELDS,
  ADMIN_STEP_FIELDS,
  type AdminOperation,
  type AdminValues,
} from './admin-work-mutation-input';
type Choice = { id: number; name: string; active: boolean; context?: string | null };
export type AdminMutationSnapshot = {
  task: {
    id: number;
    version: string;
    matterArchived: boolean;
    archived: boolean;
    values: AdminValues;
  } | null;
  step: { id: number; archived: boolean; values: AdminValues } | null;
  matters: Choice[];
  courts: Choice[];
  destinations: Choice[];
  people: Choice[];
};
function authorize(session: Session | null, operation: AdminOperation) {
  const actor = requireAuthorizedDecision(
    decideAuthorization(
      session,
      'administrativeWorks',
      operation.endsWith('create') ? 'create' : 'update',
    ),
  );
  if (!Number.isFinite(Date.parse(actor.expires)) || Date.parse(actor.expires) <= Date.now())
    throw new AuthorizationError('unauthenticated');
  return actor;
}
function translate(error: unknown): never {
  if (error instanceof AdminMutationError || error instanceof AuthorizationError) throw error;
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Restore archived')) throw new AdminMutationError('archived');
  if (message.includes('Administrative version is stale')) throw new AdminMutationError('stale');
  if (message.includes('Administrative submission payload differs'))
    throw new AdminMutationError('submission');
  if (message.includes('42501')) throw new AdminMutationError('session');
  if (message.includes('P0002')) throw new AdminMutationError('not-found');
  if (/22023|22001|22003|22007|22008|23502|23503|23505|23514|22P02/u.test(message))
    throw new AdminMutationError('invalid');
  throw error;
}
export async function readAdminMutation(
  session: Session | null,
  operation: AdminOperation,
  taskId: number | null,
  stepId: number | null,
  database: PrismaClient = db,
): Promise<AdminMutationSnapshot> {
  const actor = authorize(session, operation);
  if (
    (operation === 'task-create') !== (taskId === null) ||
    (operation === 'step-update') !== (stepId !== null) ||
    [taskId, stepId].some(
      (id) => id !== null && (!Number.isInteger(id) || id < 1 || id > 2147483647),
    )
  )
    throw new AdminMutationError('invalid');
  try {
    return await database.$transaction(
      async (transaction) => {
        await transaction.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        const rows = await transaction.$queryRaw<{ state: AdminMutationSnapshot }[]>(
          Prisma.sql`SELECT public.admin_edit_state(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${taskId}::integer,${stepId}::integer) AS state`,
        );
        if (rows.length !== 1) throw new AdminMutationError('generic');
        const state = rows[0]!.state;
        // Keep source, audit and hidden values out of client form props.
        if (state.task)
          state.task.values = Object.fromEntries(
            Object.entries(state.task.values).filter(([k]) =>
              [...ADMIN_TASK_FIELDS, 'matter_id'].includes(k),
            ),
          );
        if (state.step)
          state.step.values = Object.fromEntries(
            Object.entries(state.step.values).filter(([k]) =>
              (ADMIN_STEP_FIELDS as readonly string[]).includes(k),
            ),
          );
        return state;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  } catch (error) {
    return translate(error);
  }
}
export async function mutateAdminWork(
  session: Session | null,
  operation: AdminOperation,
  untrusted: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
) {
  const actor = authorize(session, operation),
    input = parseAdminMutationInput(operation, untrusted),
    database = dependencies.database ?? db;
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
            { result: { id: number; stepId: number | null; version: string; changed: boolean } }[]
          >(
            Prisma.sql`SELECT public.admin_edit_save(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(input)}::jsonb) AS result`,
          );
          if (rows.length !== 1) throw new AdminMutationError('generic');
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
