import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { AuditRequestMetadata } from '@/lib/audit-metadata';

type AuditTransaction = Prisma.TransactionClient;

export const AUDITED_ENTITY_TABLES = [
  'admin_tasks',
  'attendance',
  'client_logos',
  'clients',
  'contacts',
  'documents',
  'fee_letter_matters',
  'fee_letters',
  'hearing_attendees',
  'hearings',
  'invoice_allocations',
  'invoices',
  'lookup_client_branch',
  'lookup_court',
  'lookup_degree',
  'lookup_hearing_action',
  'lookup_importance',
  'lookup_invoice_status',
  'lookup_invoice_type',
  'lookup_lawyer_share_role',
  'lookup_matter_category',
  'lookup_matter_destination',
  'lookup_matter_type',
  'lookup_party_role',
  'lookup_team',
  'lookup_venue',
  'matter_fee_letter_references',
  'matter_lawyers',
  'matter_parties',
  'matter_party_roles',
  'matters',
  'payments',
  'people',
  'person_name_alias',
  'power_of_attorney_lawyers',
  'powers_of_attorney',
  'task_actions',
  'user_accounts',
] as const;

export type AuditedEntityTable = (typeof AUDITED_ENTITY_TABLES)[number];
/**
 * Later history readers must preserve PostgreSQL's microseconds as text.
 * JavaScript Date truncates them and can skip equal-timestamp events.
 */
export type AuditEventKeysetCursor = Readonly<{
  occurredAtPostgres: string;
  id: string;
}>;
type AuditScalar = string | number | boolean | null;
type SafeAuditObject = Readonly<Record<string, AuditScalar>>;

export type AuditedEntity = Readonly<{
  schema: 'public';
  table: AuditedEntityTable;
  key: SafeAuditObject;
}>;

type DatabaseLifecycleAction =
  | 'archive'
  | 'restore'
  | 'account_created'
  | 'account_enabled'
  | 'account_disabled'
  | 'username_changed'
  | 'role_changed';

type ObservedExternalAction = 'report_executed' | 'export_completed' | 'download_completed';

type SemanticAuditEvent = Readonly<{
  action:
    | DatabaseLifecycleAction
    | ObservedExternalAction
    | 'login_succeeded'
    | 'login_failed'
    | 'account_locked'
    | 'password_changed'
    | 'password_initialized'
    | 'password_reset';
  outcome: 'succeeded' | 'failed' | 'blocked';
  entity?: AuditedEntity;
  targetAccountId?: number;
  resourceIdentifier?: string;
  parameters?: SafeAuditObject;
  reasonCode?: string;
  metadata?: SafeAuditObject;
  attemptedUsername?: string;
}>;

export type AuditedDatabaseOperationResult<T> = Readonly<{
  result: T;
  event: SemanticAuditEvent & Readonly<{ action: DatabaseLifecycleAction }>;
}>;

export type ObservedExternalAuditEvent = SemanticAuditEvent &
  Readonly<{ action: ObservedExternalAction; resourceIdentifier: string }>;

function assertAccountId(accountId: number): void {
  if (!Number.isSafeInteger(accountId) || accountId < 1) {
    throw new Error('A validated positive account ID is required for human audit context.');
  }
}

async function setEventContext(
  transaction: AuditTransaction,
  metadata: AuditRequestMetadata,
): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT public.audit_set_event_context(
      ${metadata.requestId}::uuid,
      ${metadata.correlationId}::uuid,
      ${metadata.auditSessionId}::uuid,
      CAST(${metadata.ipAddress} AS inet),
      ${metadata.userAgent},
      ${metadata.deviceClass}
    )::text AS audit_context`,
  );
}

/**
 * Select the immutable actor linked to a server-validated account. Call this
 * only inside the same interactive transaction that performs the write.
 */
export async function setHumanAuditContext(
  transaction: AuditTransaction,
  accountId: number,
  metadata: AuditRequestMetadata,
): Promise<void> {
  assertAccountId(accountId);
  await transaction.$queryRaw(
    Prisma.sql`SELECT public.audit_set_human_context(${accountId})::text AS audit_context`,
  );
  await setEventContext(transaction, metadata);
}

/** Fixed, argument-free context for login and lockout state changes. */
export async function setAuthenticationAuditContext(
  transaction: AuditTransaction,
  metadata: AuditRequestMetadata,
): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT public.audit_set_authentication_context()::text AS audit_context`,
  );
  await setEventContext(transaction, metadata);
}

/**
 * Fixed context for the local password initialization/reset command. The
 * function is intentionally not executable by the restricted web principal.
 */
export async function setAdministrationAuditContext(
  transaction: AuditTransaction,
  metadata: AuditRequestMetadata,
): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT public.audit_set_administration_context()::text AS audit_context`,
  );
  await setEventContext(transaction, metadata);
}

/** Fixed context for controlled migration, import, seed and backfill tools. */
export async function setMigrationAuditContext(
  transaction: AuditTransaction,
  metadata: AuditRequestMetadata,
): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT public.audit_set_migration_context()::text AS audit_context`,
  );
  await setEventContext(transaction, metadata);
}

async function appendSemanticEvent(
  transaction: AuditTransaction,
  event: SemanticAuditEvent,
): Promise<bigint> {
  const entity = event.entity;
  const parameters = JSON.stringify(event.parameters ?? {});
  const eventMetadata = JSON.stringify(event.metadata ?? {});
  const entityKey = entity ? JSON.stringify(entity.key) : null;
  if (event.resourceIdentifier && event.resourceIdentifier.length > 256) {
    throw new Error('Audit resource identifiers are limited to 256 characters.');
  }
  if (parameters.length > 16_384 || eventMetadata.length > 16_384) {
    throw new Error('Audit semantic metadata exceeds its safe bound.');
  }
  const rows = await transaction.$queryRaw<Array<{ eventId: string }>>(Prisma.sql`
    SELECT public.audit_append_semantic_event_for_account(
      ${event.action},
      ${event.outcome},
      ${entity?.schema ?? null},
      ${entity?.table ?? null},
      ${entityKey}::jsonb,
      ${event.targetAccountId ?? null},
      ${event.attemptedUsername?.slice(0, 65) ?? null},
      ${event.resourceIdentifier ?? null},
      ${parameters}::jsonb,
      ${event.reasonCode ?? null},
      ${eventMetadata}::jsonb
    )::text AS "eventId"
  `);
  const eventId = rows[0]?.eventId;
  if (!eventId || !/^\d+$/u.test(eventId)) throw new Error('Audit event gateway returned no ID.');
  return BigInt(eventId);
}

export async function recordLoginSucceeded(
  transaction: AuditTransaction,
  accountId: number,
): Promise<bigint> {
  assertAccountId(accountId);
  return appendSemanticEvent(transaction, {
    action: 'login_succeeded',
    outcome: 'succeeded',
    entity: { schema: 'public', table: 'user_accounts', key: { id: accountId } },
  });
}

export async function recordLoginFailed(
  transaction: AuditTransaction,
  input: Readonly<{
    attemptedUsername: string;
    targetAccountId?: number;
    outcome: 'failed' | 'blocked';
    reasonCode: string;
  }>,
): Promise<bigint> {
  const accountId = input.targetAccountId;
  if (accountId !== undefined) assertAccountId(accountId);
  return appendSemanticEvent(transaction, {
    action: 'login_failed',
    outcome: input.outcome,
    attemptedUsername: input.attemptedUsername,
    targetAccountId: accountId,
    entity:
      accountId === undefined
        ? undefined
        : { schema: 'public', table: 'user_accounts', key: { id: accountId } },
    reasonCode: input.reasonCode,
  });
}

export async function recordAccountLocked(
  transaction: AuditTransaction,
  accountId: number,
): Promise<bigint> {
  assertAccountId(accountId);
  return appendSemanticEvent(transaction, {
    action: 'account_locked',
    outcome: 'succeeded',
    targetAccountId: accountId,
    entity: { schema: 'public', table: 'user_accounts', key: { id: accountId } },
  });
}

export async function recordOwnPasswordChanged(
  transaction: AuditTransaction,
  accountId: number,
): Promise<bigint> {
  assertAccountId(accountId);
  return appendSemanticEvent(transaction, {
    action: 'password_changed',
    outcome: 'succeeded',
    targetAccountId: accountId,
    entity: { schema: 'public', table: 'user_accounts', key: { id: accountId } },
  });
}

export async function recordAdministrationPasswordChange(
  transaction: AuditTransaction,
  accountId: number,
  action: 'password_initialized' | 'password_reset',
): Promise<bigint> {
  assertAccountId(accountId);
  return appendSemanticEvent(transaction, {
    action,
    outcome: 'succeeded',
    targetAccountId: accountId,
    entity: { schema: 'public', table: 'user_accounts', key: { id: accountId } },
  });
}

export async function recordAccountLifecycleEvent(
  transaction: AuditTransaction,
  accountId: number,
  action:
    | 'account_created'
    | 'account_enabled'
    | 'account_disabled'
    | 'username_changed'
    | 'role_changed',
): Promise<bigint> {
  assertAccountId(accountId);
  return appendSemanticEvent(transaction, {
    action,
    outcome: 'succeeded',
    targetAccountId: accountId,
    entity: { schema: 'public', table: 'user_accounts', key: { id: accountId } },
  });
}

/**
 * The sole restricted-runtime account creation path. PostgreSQL validates the
 * current human Administrator, locks and re-reads the staff identity, creates
 * the account and immutable actor, and returns no actor details.
 */
export async function createUserAccountWithActor(
  transaction: AuditTransaction,
  input: Readonly<{
    personId: number;
    username: string;
    passwordHash: string;
    role: string;
  }>,
): Promise<number> {
  assertAccountId(input.personId);
  const rows = await transaction.$queryRaw<Array<{ accountId: number }>>(Prisma.sql`
    SELECT public.create_user_account_with_actor(
      ${input.personId},
      ${input.username},
      ${input.passwordHash},
      ${input.role}
    ) AS "accountId"
  `);
  const accountId = rows[0]?.accountId;
  if (!accountId) throw new Error('Account creation gateway returned no account ID.');
  assertAccountId(accountId);
  return accountId;
}

/**
 * Future database lifecycle workflows use this contract so their reversible
 * PostgreSQL changes and semantic event either commit together or both roll
 * back. It deliberately excludes filesystem, generated-artifact, response and
 * network side effects, and implements no later workflow or UI.
 */
export async function runAuditedDatabaseOperation<T>(
  database: AuditedDatabase,
  actorAccountId: number,
  metadata: AuditRequestMetadata,
  operation: (transaction: AuditTransaction) => Promise<AuditedDatabaseOperationResult<T>>,
): Promise<T> {
  return database.$transaction(async (transaction) => {
    await setHumanAuditContext(transaction, actorAccountId, metadata);
    const completed = await operation(transaction);
    await appendSemanticEvent(transaction, completed.event);
    return completed.result;
  });
}

/**
 * Record a fact the server observed only after the external operation reaches
 * the named server-side emission point. This event cannot make a file write,
 * generated artifact, response stream or network delivery atomic with
 * PostgreSQL. In particular, download_completed never proves client receipt.
 */
export async function recordObservedExternalEvent(
  database: AuditedDatabase,
  actorAccountId: number,
  metadata: AuditRequestMetadata,
  event: ObservedExternalAuditEvent,
): Promise<bigint> {
  return database.$transaction(async (transaction) => {
    await setHumanAuditContext(transaction, actorAccountId, metadata);
    return appendSemanticEvent(transaction, event);
  });
}

export type AuditedDatabase = Pick<PrismaClient, '$transaction'>;
