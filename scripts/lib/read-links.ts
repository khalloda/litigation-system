/*
 * Reads the reviewed links out of the database, in the shape the baseline
 * uses. Kept apart from scripts/lib/reviewed-links.ts, which stays pure —
 * parsing, comparing and digesting need no database and are easier to trust
 * and to test without one.
 *
 * Used by both npm run baseline:write and npm run db:check, so the two can
 * never disagree about what a link is.
 */

import { migrationDbReady } from './migration-db';
import type { AliasLink, CrosswalkLink } from './reviewed-links';

export async function readLinksFromDatabase(): Promise<{
  aliases: AliasLink[];
  crosswalk: CrosswalkLink[];
}> {
  const db = await migrationDbReady;
  const aliasRows = await db.personNameAlias.findMany({
    select: { aliasAr: true, person: { select: { nameAr: true } } },
  });
  const crosswalkRows = await db.migrationCrosswalk.findMany({
    select: {
      sourceField: true,
      sourceValue: true,
      targetField: true,
      targetValue: true,
      reviewerNote: true,
    },
  });

  return {
    aliases: aliasRows.map((r) => ({ alias: r.aliasAr, person: r.person.nameAr })),
    crosswalk: crosswalkRows.map((r) => ({
      sourceField: r.sourceField,
      sourceValue: r.sourceValue,
      targetField: r.targetField,
      targetValue: r.targetValue,
      reviewerNote: r.reviewerNote,
    })),
  };
}
