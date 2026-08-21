/*
 * Turns the firm-reviewed SQL files into the seed half of a Prisma migration.
 *
 *     npm run generate:lookup-seed
 *
 * WHY GENERATE RATHER THAN RETYPE
 *
 * There are 150 seed rows across nine lists, almost all Arabic, and several
 * pairs differ by a single character. أول درجة and ابتدائي are genuinely
 * different court degrees. Retyping those by hand is precisely how a silent
 * error enters, and this project already has two duplicate people created by
 * exactly that class of mistake.
 *
 * A CORRECTION, kept here because it shows what this script is for.
 * An earlier version of this comment said محكمة, محكمه and مجكمة were three
 * distinct hearing actions "the firm chose to keep apart". They are not. They
 * are one word typed three ways — ه for ة, and ج for ح on an adjacent key.
 * The review sheet had marked all 23 hearing actions "already clean" without
 * inspecting them, and that unexamined default reached the schema as though
 * it were a decision.
 *
 * The firm re-analysed the three lists on 21 August 2026 and confirmed four
 * merges (sql/lookup-corrections.sql): محكمه and مجكمة into محكمة,
 * رفع الدعوي into رفع الدعوى, and جنح into الجنح. 150 rows became 146.
 *
 * Because the seed is GENERATED, applying that was one edit to one source
 * file and a regeneration. Had these values been typed into a migration by
 * hand, it would have been a hunt through 150 Arabic strings.
 *
 * So the SQL files the firm reviewed stay the source of truth for the DATA,
 * prisma/schema.prisma stays the source of truth for the STRUCTURE, and this
 * script joins them without a human copying Arabic between two files.
 *
 * It asserts the row count of every list before writing anything. A list that
 * yields the wrong number is a hard failure, never a partial file — rule 15,
 * and "a value the check cannot parse is a refusal, never a zero"
 * (docs/MIGRATION.md).
 */

import { readFileSync, writeFileSync } from 'node:fs';

type Lookup = {
  table: string;
  source: string;
  expected: number;
  /* Columns in the order the source INSERTs supply them. */
  columns: string[];
};

const PART1 = 'sql/lookups-and-crosswalk.sql';
const PART2 = 'sql/lookups-part2-and-teams.sql';

/*
 * The nine lists and the number of rows each must have, from
 * docs/DATA-MODEL.md. These numbers are the assertion — if a source file
 * changes, this script fails rather than quietly seeding a different list.
 */
const LOOKUPS: Lookup[] = [
  {
    table: 'lookup_matter_type',
    source: PART1,
    expected: 14,
    columns: ['label_ar', 'label_en', 'sort_order', 'is_default'],
  },
  {
    table: 'lookup_degree',
    source: PART1,
    expected: 12,
    columns: ['label_ar', 'label_en', 'sort_order'],
  },
  {
    table: 'lookup_venue',
    source: PART1,
    expected: 7,
    columns: ['label_ar', 'label_en', 'sort_order'],
  },
  {
    table: 'lookup_matter_category',
    source: PART1,
    expected: 21,
    columns: ['label_ar', 'sort_order'],
  },
  {
    table: 'lookup_importance',
    source: PART1,
    expected: 3,
    columns: ['label_ar', 'sort_order'],
  },
  {
    table: 'lookup_party_role',
    source: PART2,
    expected: 11,
    columns: ['code', 'label_ar_m', 'label_ar_f', 'label_en', 'sort_order'],
  },
  {
    table: 'lookup_hearing_action',
    source: PART2,
    expected: 20,   // 23 before the 21 Aug 2026 merges
    columns: ['label_ar', 'sort_order'],
  },
  {
    table: 'lookup_matter_destination',
    source: PART2,
    expected: 27,
    columns: ['label_ar', 'sort_order'],
  },
  {
    table: 'lookup_client_branch',
    source: PART2,
    expected: 31,   // 32 before جنح merged into الجنح
    columns: ['label_ar', 'sort_order'],
  },
];

/*
 * Split a SQL VALUES list on commas that are not inside quotes. Written by
 * hand rather than with a regular expression because a value may legitimately
 * contain a comma, and splitting on the delimiter is the fault that made a
 * three-row table read as empty.
 */
function splitValues(inner: string, where: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "'") {
      // '' inside a quoted string is an escaped apostrophe, not a terminator.
      if (inQuote && inner[i + 1] === "'") {
        current += "''";
        i += 1;
        continue;
      }
      inQuote = !inQuote;
      current += ch;
      continue;
    }
    if (ch === ',' && !inQuote) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());

  if (inQuote) {
    throw new Error(`${where}: unterminated quote in VALUES (${inner})`);
  }
  return parts;
}

function extract(lookup: Lookup): string[][] {
  const sql = readFileSync(lookup.source, 'utf8');
  const rows: string[][] = [];

  for (const line of sql.split('\n')) {
    if (!line.startsWith(`INSERT INTO ${lookup.table} `)) continue;

    const open = line.indexOf('VALUES (');
    if (open === -1) {
      throw new Error(`${lookup.table}: an INSERT with no VALUES — ${line}`);
    }
    /* Trim the trailing ");" and anything after it (row-count comments). */
    const close = line.lastIndexOf(');');
    if (close === -1 || close < open) {
      throw new Error(`${lookup.table}: an INSERT that does not close — ${line}`);
    }
    const inner = line.slice(open + 'VALUES ('.length, close);

    const values = splitValues(inner, lookup.table);
    if (values.length !== lookup.columns.length) {
      throw new Error(
        `${lookup.table}: expected ${lookup.columns.length} values ` +
          `(${lookup.columns.join(', ')}), found ${values.length} — ${line}`,
      );
    }
    for (const [i, value] of values.entries()) {
      if (value === '') {
        throw new Error(`${lookup.table}: empty value for ${lookup.columns[i]} — ${line}`);
      }
    }
    rows.push(values);
  }

  /* Rule 15: state the count, and fail loudly if it differs. */
  if (rows.length !== lookup.expected) {
    throw new Error(
      `${lookup.table}: found ${rows.length} rows in ${lookup.source}, ` +
        `expected ${lookup.expected}. Either the source changed or the parse is ` +
        `wrong. Neither may be seeded.`,
    );
  }
  return rows;
}

// ---------------------------------------------------------------------------
const out: string[] = [];
let total = 0;

out.push('-- ==========================================================================');
out.push('--  SEED — the nine lookup lists');
out.push('--');
out.push('--  GENERATED by scripts/generate-lookup-seed.ts from the two SQL files.');
out.push('--  Do not hand-edit this section: change the source and regenerate, or the');
out.push('--  two will drift apart.');
out.push('--');
out.push('--  Re-analysed 21 August 2026 after three lists were found to have been');
out.push('--  marked "already clean" without inspection. hearing_action and');
out.push('--  matter_destination are now settled. client_branch has one open');
out.push('--  question — it holds three different concepts — to be raised with the');
out.push('--  firm before task 6.2. The VALUES are settled; the meaning is not.');
out.push('--');
out.push('--    sql/lookups-and-crosswalk.sql       matter_type, degree, venue,');
out.push('--                                        matter_category, importance');
out.push('--    sql/lookups-part2-and-teams.sql     party_role, hearing_action,');
out.push('--                                        matter_destination, client_branch');
out.push('--');
out.push('--  Loaded by the migration rather than a seed script, because the');
out.push('--  application cannot work without these lists: a fresh database, on any');
out.push('--  machine, must arrive complete. `prisma migrate deploy` runs this;');
out.push('--  `prisma db seed` would not.');
out.push('-- ==========================================================================');
out.push('');

for (const lookup of LOOKUPS) {
  const rows = extract(lookup);
  total += rows.length;

  out.push(
    `-- ---- ${lookup.table}: ${rows.length} rows ` +
      '-'.repeat(Math.max(0, 50 - lookup.table.length)),
  );
  /*
   * updated_at is NOT NULL with no database default: Prisma's @updatedAt sets
   * it from the application. A raw INSERT has to supply it, so it is added
   * here rather than given a default in the schema, which would show up as
   * drift on the next `prisma migrate dev`.
   */
  const columns = [...lookup.columns, 'updated_at'].join(', ');
  for (const values of rows) {
    out.push(`INSERT INTO "${lookup.table}" (${columns}) VALUES (${[...values, 'now()'].join(', ')});`);
  }
  out.push('');
}

/*
 * The assertion block. Every count stated, and any difference aborts the
 * migration inside its own transaction, so a half-seeded database cannot
 * exist. This is rule 15 applied to the seed itself.
 */
out.push('-- ==========================================================================');
out.push('--  ASSERT — rule 15');
out.push('--');
out.push('--  Every count is stated and checked. A migration runs in a transaction, so');
out.push('--  a failure here rolls the whole thing back: there is no half-seeded');
out.push('--  database to discover later.');
out.push('--');
out.push('--  A silent zero is how أحمد إسماعيل became two people, one of them');
out.push('--  carrying 1,309 hearings.');
out.push('-- ==========================================================================');
out.push('DO $SEED$');
out.push('DECLARE');
out.push('    actual integer;');
out.push('    grand  integer := 0;');
out.push('BEGIN');
for (const lookup of LOOKUPS) {
  out.push(`    SELECT count(*) INTO actual FROM "${lookup.table}";`);
  out.push(`    grand := grand + actual;`);
  out.push(`    IF actual <> ${lookup.expected} THEN`);
  out.push(
    `        RAISE EXCEPTION '${lookup.table}: seeded % rows, expected ${lookup.expected}', actual;`,
  );
  out.push('    END IF;');
  out.push('');
}
out.push(`    IF grand <> ${total} THEN`);
out.push(`        RAISE EXCEPTION 'lookups: % rows in total, expected ${total}', grand;`);
out.push('    END IF;');
out.push('');
out.push('    -- Exactly one default matter type. Matters fall back to it (تقاضي).');
out.push('    SELECT count(*) INTO actual FROM "lookup_matter_type" WHERE is_default;');
out.push('    IF actual <> 1 THEN');
out.push("        RAISE EXCEPTION 'lookup_matter_type: % rows marked default, expected 1', actual;");
out.push('    END IF;');
out.push('');
out.push(`    RAISE NOTICE 'lookups seeded: % rows across ${LOOKUPS.length} lists', grand;`);
out.push('END');
out.push('$SEED$;');
out.push('');

const target = process.argv[2];
if (!target) {
  throw new Error('usage: tsx scripts/generate-lookup-seed.ts <path to migration.sql>');
}

const existing = readFileSync(target, 'utf8');
const MARKER = '-- ==========================================================================\n--  SEED';
if (existing.includes(MARKER)) {
  throw new Error(`${target} already contains a seed section. Regenerate from a fresh migration.`);
}
writeFileSync(target, existing.trimEnd() + '\n\n' + out.join('\n'), 'utf8');

console.log(`Seed written to ${target}`);
for (const lookup of LOOKUPS) {
  console.log(`  ${lookup.table.padEnd(28)} ${String(lookup.expected).padStart(3)} rows`);
}
console.log(`  ${'TOTAL'.padEnd(28)} ${String(total).padStart(3)} rows`);
