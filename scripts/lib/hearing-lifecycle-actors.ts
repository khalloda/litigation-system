import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  createApprovedMigrationPrismaClient,
  withApprovedMigrationClient,
} from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { setApprovedAccountPassword, changeOwnPassword } from '../../src/lib/auth/service';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { setMigrationAuditContext } from '../../src/lib/audit';

/** Only disposable non-owner actors. Never called against a real cluster and
 * never reads or changes KHelmy's password, version or account state. */
export async function prepareHearingLifecycleActors(
  fixture: IsolatedPostgres,
  runtime: PrismaClient,
  canonicalAdministrator = false,
) {
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment),
    { databaseUrl: fixture.migrationUrl },
  );
  const owner = await createApprovedMigrationPrismaClient(fixture.migrationUrl);
  try {
    const accounts = await owner.userAccount.findMany({
      where: { username: { not: 'KHelmy' } },
      select: { id: true, username: true },
    });
    assert.equal(accounts.length, 3);
    for (const a of accounts) {
      assert.notEqual(a.username, 'KHelmy');
      const temporary = randomBytes(32).toString('base64url'),
        password = randomBytes(32).toString('base64url');
      await setApprovedAccountPassword(a.username, temporary, {
        database: owner,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      const current = await owner.userAccount.findUniqueOrThrow({
        where: { id: a.id },
        select: { sessionVersion: true },
      });
      assert.equal(
        await changeOwnPassword(
          {
            accountId: a.id,
            sessionVersion: current.sessionVersion,
            currentPassword: temporary,
            newPassword: password,
          },
          { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
        ),
        'changed',
      );
    }
    if (canonicalAdministrator)
      await owner.$transaction(async (tx) => {
        await setMigrationAuditContext(tx, createMaintenanceAuditMetadata());
        assert.equal(
          (
            await tx.userAccount.updateMany({
              where: { id: accounts[0]!.id, username: { not: 'KHelmy' } },
              data: { roleCode: 'Administrator', sessionVersion: { increment: 1 } },
            })
          ).count,
          1,
        );
      });
  } finally {
    await owner.$disconnect();
  }
}
