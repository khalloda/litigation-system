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
 *   2. A SPLIT's court part may itself be a MERGE SOURCE. Taking it into the
 *      court list verbatim builds a two-step chain — which is what the first
 *      version of this generator did, and what the migration's own assertion
 *      refused:
 *
 *          هيئة الاستثمار ⏎ لجان فض المنازعات  --SPLIT-->  هيئة الاستثمار
 *          هيئة الاستثمار                      --MERGE-->  الهيئة العامة …
 *
 *      **The firm's review was consistent; the generator was not.** Every
 *      split's court part is now resolved through the merge map first, and
 *      any label that is a merge source is kept OUT of the court list.
 *
 *      That makes the list **308**, not the 309 the source file states — the
 *      309th was this artefact. Counted here, not assumed: see the assertion
 *      below, which reports the difference rather than trusting either number.
 *
 * Every count is asserted before a byte is written.
 */

import { readFileSync, writeFileSync, appendFileSync, statSync } from 'node:fs';

const SOURCE = 'sql/lookup-court-and-crosswalk.sql';

/* The court list the source file states, and the list this generator produces.
 * They differ by the one artefact described above; the assertion reports the
 * difference rather than either number being taken on trust. */
const STATED_COURTS = 309;
const EXPECTED_COURTS = 308;
const EXPECTED_RULES = 94;

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

  if (courtInserts.length !== STATED_COURTS) {
    throw new Error(`${SOURCE}: ${courtInserts.length} court rows, expected ${STATED_COURTS}`);
  }
  if (crosswalkInserts.length !== EXPECTED_RULES) {
    throw new Error(`${SOURCE}: ${crosswalkInserts.length} rules, expected ${EXPECTED_RULES}`);
  }

  /* The merge map: every value that is folded into another court. A label in
   * here is NOT a court — it is a spelling of one. */
  const mergeTarget = new Map<string, string>();
  for (const line of crosswalkInserts) {
    const m = /VALUES \('court', '(.*?)', \d+, 'court', '(.*?)', '/.exec(line);
    if (m !== null && m[1] !== undefined && m[2] !== undefined) mergeTarget.set(m[1], m[2]);
  }
  if (mergeTarget.size !== 52) {
    throw new Error(`${mergeTarget.size} merge rules, expected 52`);
  }

  /* lookup_court.updated_at is NOT NULL — Prisma's @updatedAt. The source file
   * predates the table and does not supply it. */
  /* A label that is a merge source is a spelling, not a court. Dropping it is
   * what removes the chain. Counted and reported, never silent. */
  const droppedAsMergeSource: string[] = [];
  const courts = courtInserts
    .filter((line) => {
      const m = /VALUES \('(.*)', \d+\);/.exec(line);
      const label = m?.[1];
      if (label !== undefined && mergeTarget.has(label)) {
        droppedAsMergeSource.push(label);
        return false;
      }
      return true;
    })
    .map((line) => {
      const rewritten = line
        .replace(
          'INSERT INTO lookup_court (label_ar, sort_order)',
          'INSERT INTO "lookup_court" (label_ar, sort_order, updated_at)',
        )
        .replace(/VALUES \((.*)\);/, 'VALUES ($1, now());');
      if (!rewritten.includes('now()')) {
        throw new Error(`could not rewrite a court insert:\n${line}`);
      }
      return rewritten;
    });

  if (courts.length !== EXPECTED_COURTS) {
    throw new Error(
      `${courts.length} courts after dropping ${droppedAsMergeSource.length} merge ` +
        `sources, expected ${EXPECTED_COURTS}`,
    );
  }

  /* Resolve every SPLIT's court part through the merge map. Without this the
   * split points at a spelling that is no longer a court, and Stage 2 would
   * follow value -> spelling -> court: a two-step chain, and a second chance
   * to get it wrong. */
  let splitsResolved = 0;
  const crosswalk = crosswalkInserts.map((line) => {
    const m = /VALUES \('court', '(.*?)', \d+, 'SPLIT', '(.*?)', '/.exec(line);
    if (m === null) return line;
    const courtPart = m[2];
    if (courtPart === undefined) return line;
    const resolved = mergeTarget.get(courtPart);
    if (resolved === undefined) return line;
    splitsResolved += 1;
    const rewritten = line.replace(`, 'SPLIT', '${courtPart}', '`, `, 'SPLIT', '${resolved}', '`);
    if (rewritten === line) {
      throw new Error(`could not resolve a split court part:\n${line}`);
    }
    return rewritten;
  });

  const header = `-- Generated by npm run generate:court-seed from ${SOURCE}.
-- ${courts.length} courts, ${crosswalk.length} crosswalk rules.
-- DO NOT EDIT BY HAND: correct the source file and regenerate, or the
-- reviewed data and the migration diverge.
--
-- The source file lists ${STATED_COURTS} courts. ${droppedAsMergeSource.length} of them is also a MERGE
-- SOURCE — a spelling of another court, not a court — so it is dropped and the
-- list is ${courts.length}. ${splitsResolved} SPLIT court part was resolved through the merge
-- map for the same reason. See the generator header.

`;

  writeFileSync(target, header, 'utf8');
  appendFileSync(target, '-- ---- 309 courts ----\n' + courts.join('\n') + '\n\n', 'utf8');
  appendFileSync(target, '-- ---- 94 crosswalk rules ----\n' + crosswalk.join('\n') + '\n', 'utf8');

  console.log(`Wrote ${target}`);
  console.log(`  courts stated     ${STATED_COURTS}`);
  console.log(
    `  dropped           ${droppedAsMergeSource.length} (also a merge source: ${droppedAsMergeSource.join(', ')})`,
  );
  console.log(`  courts written    ${courts.length}`);
  console.log(`  crosswalk rules   ${crosswalk.length}`);
  console.log(`  splits resolved   ${splitsResolved} (court part was a merge source)`);
}

main();
