/*
 * Writes scripts/baselines/reviewed-links.json — the record of every link the
 * firm reviewed.
 *
 *     npm run baseline:write                     show what would change
 *     npm run baseline:write -- --accept-changes write it
 *
 * The two-step exists because a baseline that anyone can silently regenerate
 * protects nothing at all. If a mapping has drifted, running this without the
 * flag prints exactly which links moved and refuses to write; accepting them
 * is a deliberate act, and belongs in its own commit with a reason.
 *
 * Adding links needs no ceremony beyond running it: new spellings and new
 * crosswalk rules arrive all through Stage 2 and none of them changes a
 * decision the firm already made.
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrationDb as db } from './lib/migration-db';
import { readLinksFromDatabase } from './lib/read-links';
import {
  BASELINE_PATH,
  additions,
  compare,
  digestOf,
  readBaseline,
  sortAliases,
  sortCrosswalk,
} from './lib/reviewed-links';

async function main() {
  const accept = process.argv.includes('--accept-changes');
  const current = await readLinksFromDatabase();

  let existing: ReturnType<typeof readBaseline> | null = null;
  try {
    existing = readBaseline();
  } catch (error) {
    // No baseline yet is the normal first run. A baseline that exists but
    // cannot be read is a different matter and must not be papered over.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('is missing')) throw error;
    console.log(`No baseline yet — writing the first one from the database.\n`);
  }

  if (existing !== null) {
    const drift = compare(existing, current);
    const added = additions(existing, current);
    const missingReviewerNotes = existing.crosswalk.filter(
      (rule) => !Object.prototype.hasOwnProperty.call(rule, 'reviewerNote'),
    ).length;

    if (drift.length === 0) {
      console.log(
        `No reviewed link has changed. ` +
          `${added.aliases} new spellings, ${added.crosswalk} new rules, and ` +
          `${missingReviewerNotes} existing rules needing note protection.`,
      );
      if (added.aliases === 0 && added.crosswalk === 0 && missingReviewerNotes === 0) {
        console.log('The baseline is already up to date. Nothing written.');
        return;
      }
    } else {
      console.log(`${drift.length} REVIEWED LINK(S) HAVE CHANGED:\n`);
      for (const d of drift) {
        console.log(`  ${d.kind}  ${d.subject}`);
        console.log(`      was: ${d.expected}`);
        console.log(`      now: ${d.actual}`);
      }
      console.log('');
      if (!accept) {
        console.error(
          'Refusing to write.\n\n' +
            'Each line above is a decision the firm made and something has since\n' +
            'changed it. Either the change is wrong and the database needs fixing,\n' +
            'or the change is right and the firm has agreed to it.\n\n' +
            'If it is right:  npm run baseline:write -- --accept-changes\n' +
            'and commit the new baseline on its own, saying who agreed and why.',
        );
        process.exitCode = 1;
        return;
      }
      console.log('--accept-changes given: writing the changes above into the baseline.\n');
    }
  }

  const aliases = sortAliases(current.aliases);
  const crosswalk = sortCrosswalk(current.crosswalk);
  const baseline = {
    note:
      'Every alias and crosswalk outcome the firm reviewed, including operational notes. ' +
      'npm run db:check proves each one still holds. Adding links is allowed; changing one ' +
      'fails the check. Regenerate with ' +
      'npm run baseline:write -- --accept-changes, and commit it on its own. ' +
      'See scripts/lib/reviewed-links.ts.',
    generatedAt: new Date().toISOString().slice(0, 10),
    counts: { aliases: aliases.length, crosswalk: crosswalk.length },
    digest: digestOf(aliases, crosswalk),
    aliases,
    crosswalk,
  };

  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(
    `Wrote ${BASELINE_PATH} — ${aliases.length} alias links, ${crosswalk.length} crosswalk rules.`,
  );
  console.log(`digest ${baseline.digest}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
