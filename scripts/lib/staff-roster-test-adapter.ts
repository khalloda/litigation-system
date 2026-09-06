import type { PrismaClient } from '../../src/generated/prisma/client';
import { setHumanAuditContext } from '../../src/lib/audit';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';

/** Existing authentication regressions exercise the new DB-only staff gateway,
 * not a route or a UI action. Their caller has already proved fixture isolation. */
export async function setFixtureStaffActive(
  database: PrismaClient,
  administratorId: number,
  personId: number,
  active: boolean,
): Promise<void> {
  await database.$transaction(async (tx) => {
    await setHumanAuditContext(tx, administratorId, createMaintenanceAuditMetadata());
    const rows = await tx.$queryRaw<
      { version: bigint }[]
    >`SELECT staff_update_person(p.id,p.row_version,p.name_en,p.email,${active},p.is_trainee,p.team_id) version FROM people p WHERE p.id=${personId}`;
    if (rows.length !== 1) throw new Error('Exact fixture staff identity required');
  });
}
