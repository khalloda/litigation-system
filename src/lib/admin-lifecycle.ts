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
import { AdminMutationError } from './admin-work-mutation-input';
export type AdminLifecycleOperation =
  'task-archive' | 'task-restore' | 'step-archive' | 'step-restore';
export type AdminLifecycleSnapshot = {
  id: number;
  stepId: number | null;
  version: string;
  archived: boolean;
  facts: {
    taskId: number;
    stepId: number | null;
    requiredWork: string | null;
    taskCreatedDate: string | null;
    matterId: number | null;
    caseNumber: string | null;
    matterArchived: boolean;
    taskArchived: boolean;
    stepArchived: boolean | null;
    actionDate: string | null;
    result: string | null;
    report: string | null;
    currentSteps: number;
    archivedSteps: number;
  };
};
export type AdminLifecycleInput = {
  task_id: number;
  step_id: number | null;
  operation: AdminLifecycleOperation;
  version: string;
  submission: string;
  confirmation: number;
  facts: AdminLifecycleSnapshot['facts'];
};
function validId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= 2147483647;
}
export function parseAdminLifecycle(
  operation: AdminLifecycleOperation,
  value: unknown,
): AdminLifecycleInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AdminMutationError('invalid');
  const v = value as AdminLifecycleInput;
  if (
    !['task-archive', 'task-restore', 'step-archive', 'step-restore'].includes(operation) ||
    v.operation !== operation ||
    Object.keys(v).sort().join(',') !==
      'confirmation,facts,operation,step_id,submission,task_id,version' ||
    !validId(v.task_id) ||
    (v.step_id !== null && !validId(v.step_id)) ||
    operation.startsWith('step') !== (v.step_id !== null) ||
    v.confirmation !== (v.step_id ?? v.task_id) ||
    typeof v.version !== 'string' ||
    !/^[1-9][0-9]{0,18}$/u.test(v.version) ||
    BigInt(v.version) > 9223372036854775807n ||
    typeof v.submission !== 'string' ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(v.submission) ||
    !v.facts ||
    typeof v.facts !== 'object' ||
    Array.isArray(v.facts)
  )
    throw new AdminMutationError('invalid');
  const f = v.facts;
  if (
    Object.keys(f).sort().join(',') !==
      'actionDate,archivedSteps,caseNumber,currentSteps,matterArchived,matterId,report,requiredWork,result,stepArchived,stepId,taskArchived,taskCreatedDate,taskId' ||
    f.taskId !== v.task_id ||
    f.stepId !== v.step_id ||
    (f.matterId !== null && !validId(f.matterId)) ||
    typeof f.matterArchived !== 'boolean' ||
    typeof f.taskArchived !== 'boolean' ||
    (v.step_id === null ? f.stepArchived !== null : typeof f.stepArchived !== 'boolean') ||
    [f.currentSteps, f.archivedSteps].some((n) => !Number.isSafeInteger(n) || n < 0) ||
    [f.actionDate, f.caseNumber, f.report, f.requiredWork, f.result, f.taskCreatedDate].some(
      (s) => s !== null && (typeof s !== 'string' || [...s].length > 10000),
    ) ||
    Buffer.byteLength(JSON.stringify(v), 'utf8') > 200000
  )
    throw new AdminMutationError('invalid');
  return v;
}
function authorize(session: Session | null, operation: AdminLifecycleOperation) {
  const action = operation.endsWith('archive') ? 'archive' : 'restore';
  const actor = requireAuthorizedDecision(
    decideAuthorization(session, 'administrativeWorks', action),
  );
  if (!(Date.parse(actor.expires) > Date.now())) throw new AuthorizationError('unauthenticated');
  return actor;
}
function translate(error: unknown): never {
  if (error instanceof AdminMutationError || error instanceof AuthorizationError) throw error;
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Administrative version or confirmation is stale'))
    throw new AdminMutationError('stale');
  if (message.includes('Administrative submission payload differs'))
    throw new AdminMutationError('submission');
  if (message.includes('Restore archived')) throw new AdminMutationError('archived');
  if (message.includes('42501')) throw new AdminMutationError('session');
  if (message.includes('P0002')) throw new AdminMutationError('not-found');
  if (/22023|22003|22P02/u.test(message)) throw new AdminMutationError('invalid');
  throw error;
}
export async function readAdminLifecycle(
  session: Session | null,
  operation: AdminLifecycleOperation,
  id: number,
  stepId: number | null,
  database: PrismaClient = db,
): Promise<AdminLifecycleSnapshot> {
  const actor = authorize(session, operation);
  if (
    !validId(id) ||
    (stepId !== null && !validId(stepId)) ||
    operation.startsWith('step') !== (stepId !== null)
  )
    throw new AdminMutationError('invalid');
  try {
    return await database.$transaction(
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        const rows = await tx.$queryRaw<{ state: AdminLifecycleSnapshot }[]>(
          Prisma.sql`SELECT public.admin_lifecycle_state(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${id}::integer,${stepId}::integer) state`,
        );
        if (rows.length !== 1) throw new AdminMutationError('generic');
        return rows[0]!.state;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  } catch (error) {
    return translate(error);
  }
}
export async function mutateAdminLifecycle(
  session: Session | null,
  operation: AdminLifecycleOperation,
  value: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
) {
  const actor = authorize(session, operation),
    input = parseAdminLifecycle(operation, value),
    database = dependencies.database ?? db;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (tx) => {
          await setHumanAuditContext(tx, Number(actor.user.id), dependencies.auditMetadata);
          const rows = await tx.$queryRaw<
            { result: { id: number; stepId: number | null; version: string; changed: boolean } }[]
          >(
            Prisma.sql`SELECT public.admin_lifecycle_save(${Number(actor.user.id)}::integer,${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(input)}::jsonb) result`,
          );
          if (rows.length !== 1) throw new AdminMutationError('generic');
          return rows[0]!.result;
        },
        { isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000 },
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
