import { Prisma, type PrismaClient } from '@/generated/prisma/client';

type AuditTransaction = Prisma.TransactionClient;

function assertAccountId(accountId: number): void {
  if (!Number.isSafeInteger(accountId) || accountId < 1) {
    throw new Error('A validated positive account ID is required for human audit context.');
  }
}

/**
 * Select the immutable actor linked to a server-validated account. Call this
 * only inside the same interactive transaction that performs the write.
 */
export async function setHumanAuditContext(
  transaction: AuditTransaction,
  accountId: number,
): Promise<void> {
  assertAccountId(accountId);
  await transaction.$queryRaw(
    Prisma.sql`SELECT public.audit_set_human_context(${accountId})::text AS audit_context`,
  );
}

/** Fixed, argument-free context for login and lockout state changes. */
export async function setAuthenticationAuditContext(transaction: AuditTransaction): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT public.audit_set_authentication_context()::text AS audit_context`,
  );
}

/**
 * Fixed context for the local password initialization/reset command. The
 * function is intentionally not executable by the restricted web principal.
 */
export async function setAdministrationAuditContext(transaction: AuditTransaction): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT public.audit_set_administration_context()::text AS audit_context`,
  );
}

/** Fixed context for controlled migration, import, seed and backfill tools. */
export async function setMigrationAuditContext(transaction: AuditTransaction): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT public.audit_set_migration_context()::text AS audit_context`,
  );
}

export type AuditedDatabase = Pick<PrismaClient, '$transaction'>;
