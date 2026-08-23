/*
 * Turns sql/lookup-court-and-crosswalk.sql into a migration seed.
 *
 *     npm run generate:court-seed -- prisma/migrations/<new folder>/migration.sql
 *
 * The firm reviewed all 401 distinct court names by hand. 309 courts and 94
 * crosswalk rules come out of that, and **none of them is retyped here** —
 * there are hundreds of Arabic strings and several differ by one character.
 * The same reasoning as generate-lookup-seed.ts and generate-roster-seed.ts.
 *
 * WHAT IT CHANGES, AND WHY
 *
 * Two things cannot be copied across verbatim:
 *
 *   1. The source file creates lookup_court itself. **The table already
 *      exists** — Prisma built it at task 1.3, with audit columns the source
 *      file does not know about. The CREATE TABLE is dropped and the INSERTs
 *      gain `updated_at`.
 *
 *   2. Four of the seven WRONG rows point at matter_destination values that
 *      DO NOT EXIST in that list. Only نقابة الأطباء is there. The firm's note
 *      says "a venue or destination" — `or`, which is not a decision — so
 *      those four become quarantine rules rather than dangling ones or four
 *      invented lookup entries. See the note written onto each row.
 *
 * Every count is asserted before a byte is written.
 */

import { readFileSync, writeFileSync, appendFileSync, statSync } from 'node:fs';

const SOURCE = 'sql/lookup-court-and-crosswalk.sql';

/* The four whose destination does not exist in lookup_matter_destination.
 * نقابة الأطباء is deliberately absent from this list: it IS in the list. */
const DESTINATIONS_NOT_IN_THE_LIST = [
  'مقر شركة أدخنة النخلة بشبين الكوم',
  'نادي المقطم الرياضي',
  'كايرو فيستيفال سيتي',
  'مكتب بريد المعادي',
];

const QUARANTINE_NOTE =
  'Not a court. The firm classified it as "a venue or destination" — but it is ' +
  'not in lookup_matter_destination, and "or" is not a decision. Quarantined ' +
  'rather than guessed at, and rather than inventing a destination entry. The ' +
  'firm decides whether it becomes one. The original stays in legacy_court_raw.';

function main() {
  const target = process.argv[2];
  if (target === undefined) {
    throw new Error(
      'Give the migration file to write to:\n' +
        '  npm run generate:court-seed -- prisma/migrations/<folder>/migration.sql',
    );
  }

  /* The roster generator once appended 638 lines to an ALREADY-APPLIED
   * migration, because the target was chosen with `find | sort | tail -1` and
   * the folder it assumed existed had never been created. Prisma's shadow
   * database caught it; nothing in this project did. So: the target must be a
   * migration.sql that exists and is empty or nearly so. */
  if (!target.endsWith('migration.sql')) {
    throw new Error(`${target} is not a migration.sql`);
  }
  const size = statSync(target).size;
  if (size > 200) {
    throw new Error(
      `${target} already holds ${size} bytes. Refusing to append to a migration ` +
        `that is not new — see "Choosing a migration folder" in docs/MIGRATION.md.`,
    );
  }

  const source = readFileSync(SOURCE, 'utf8');
  const lines = source.split('\n');

  const courtInserts = lines.filter((l) => l.startsWith('INSERT INTO lookup_court '));
  const crosswalkInserts = lines.filter((l) => l.startsWith('INSERT INTO migration_crosswalk '));

  if (courtInserts.length !== 309) {
    throw new Error(`${SOURCE}: ${courtInserts.length} court rows, expected 309`);
  }
  if (crosswalkInserts.length !== 94) {
    throw new Error(`${SOURCE}: ${crosswalkInserts.length} crosswalk rules, expected 94`);
  }

  /* lookup_court.updated_at is NOT NULL — Prisma's @updatedAt. The source file
   * predates the table and does not supply it. */
  const courts = courtInserts.map((line) => {
    const rewritten = line
      .replace('INSERT INTO lookup_court (label_ar, sort_order)', 'INSERT INTO "lookup_court" (label_ar, sort_order, updated_at)')
      .replace(/VALUES \((.*)\);/, 'VALUES ($1, now());');
    if (!rewritten.includes('now()')) {
      throw new Error(`could not rewrite a court insert:\n${line}`);
    }
    return rewritten;
  });

  let requarantined = 0;
  const crosswalk = crosswalkInserts.map((line) => {
    const affected = DESTINATIONS_NOT_IN_THE_LIST.filter((v) => line.includes(`'${v}'`));
    if (affected.length === 0) return line;
    requarantined += 1;
    /* Rewrite target_field and target_value, and replace the note. The row
     * keeps its source_value and rows_affected exactly. */
    const rewritten = line
      .replace(", 'matter_destination', '", ", 'quarantine', NULL_MARKER, '")
      .replace(/NULL_MARKER, '[^']*', '[^']*'\);$/, `NULL, '${QUARANTINE_NOTE}');`);
    //  Match the FIELD, not the word: the replacement note itself contains
    //  "lookup_matter_destination", and checking for the bare substring made
    //  this guard fire on its own output.
    if (rewritten.includes('NULL_MARKER') || rewritten.includes(", 'matter_destination',")) {
      throw new Error(`could not requarantine:\n${line}\n-> ${rewritten}`);
    }
    return rewritten;
  });

  if (requarantined !== 4) {
    throw new Error(`requarantined ${requarantined} rows, expected 4`);
  }

  const header = `-- Generated by npm run generate:court-seed from ${SOURCE}.
-- 309 courts, 94 crosswalk rules. DO NOT EDIT BY HAND: correct the source
-- file and regenerate, or the reviewed data and the migration diverge.
--
-- Four WRONG rows were rewritten to 'quarantine' because the
-- matter_destination values they named do not exist in that list. See the
-- generator for the reasoning.

`;

  writeFileSync(target, header, 'utf8');
  appendFileSync(target, '-- ---- 309 courts ----\n' + courts.join('\n') + '\n\n', 'utf8');
  appendFileSync(
    target,
    '-- ---- 94 crosswalk rules ----\n' + crosswalk.join('\n') + '\n',
    'utf8',
  );

  console.log(`Wrote ${target}`);
  console.log(`  courts            ${courts.length}`);
  console.log(`  crosswalk rules   ${crosswalk.length}`);
  console.log(`  requarantined     ${requarantined} (destination not in the list)`);
}

main();
