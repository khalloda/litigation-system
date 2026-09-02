import { createApprovedMigrationPrismaClient } from './migration-principal';

/** Resolves only after the privileged Prisma session passes the D35 identity check. */
export const migrationDbReady = createApprovedMigrationPrismaClient();

export async function disconnectMigrationDb(): Promise<void> {
  const database = await migrationDbReady;
  await database.$disconnect();
}
