/*
 * Generates the staging schema from the extraction's own column dictionary.
 *
 *     npm run generate:staging-schema -- prisma/migrations/<new folder>/migration.sql
 *
 * WHY GENERATE RATHER THAN TYPE IT OUT
 *
 * There are 191 columns across 17 tables and most of the names are Arabic:
 * `الموقف الحالي`, `المحامون الصادر لهم التوكيل`, `تاريخ التنفيذ`. Several
 * differ from each other by one character. Retyping those by hand is exactly
 * where a silent error enters, and this project already has two duplicate
 * people created by that class of mistake — a single missing hamza that
 * matched nothing, reported success, and detached 1,309 hearings.
 *
 * So the extraction's own `meta/columns.csv` is the source of truth for the
 * names, and no human copies Arabic between two files.
 *
 * WHAT THE STAGING SCHEMA IS FOR — docs/MIGRATION.md, stage B
 *
 * EVERY COLUMN IS `text`. No conversions, no types, no constraints on any
 * source column. A load must not be able to fail on a bad date or a
 * non-numeric number: those rows arrive intact and are dealt with at Gate 3,
 * where the decision is visible, reversible, and in front of the firm. A row
 * rejected at the door is a row nobody ever sees again.
 *
 * The only constraints are on the two BOOKKEEPING columns, `src_file` and
 * `src_row_num`, which are ours and not the firm's. They cannot fail on the
 * firm's data because they do not come from it. Their primary key is what
 * makes loading the same file twice an error rather than a silent doubling.
 *
 * COLUMN NAMES ARE VERBATIM. Arabic and all, including `Cash/probono` and
 * `Inv-No`. Staging must be directly comparable to the source — that is the
 * whole point of it. Renaming to snake_case ASCII (docs/DATA-MODEL.md)
 * happens at TRANSFORM, stage D, not here.
 *
 * NULL AND EMPTY STRING STAY DISTINCT. In this data they mean different
 * things: an unassigned `lawyerA` is not the same as one that was cleared.
 * The extractor writes NULL as a bare empty field and '' as `""`, and
 * PostgreSQL's CSV COPY reads exactly that distinction back — a bare empty
 * field is NULL, a quoted empty field is never NULL. So the schema simply
 * must not get in the way: every source column is nullable, has no default,
 * and has no check.
 *
 * WHAT IT ASSERTS BEFORE WRITING ANYTHING
 *
 * The column dictionary and the manifest are written by two different parts
 * of the extractor, so they can be checked against each other: the set of
 * tables must match, and every table's plain-column count in the dictionary
 * must equal the `plain_columns` the manifest recorded. A file that yields
 * the wrong number is a hard failure, never a partial write.
 *
 * Nothing here is compared against a remembered figure. 191 and 17 appear in
 * the comment above for a reader; the script derives them.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const META = '_migration/meta';
const COLUMNS_CSV = `${META}/columns.csv`;
const MANIFEST_CSV = `${META}/manifest.csv`;
const SUMMARY_JSON = `${META}/summary.json`;

/* PostgreSQL truncates an identifier longer than this, with a notice rather
 * than an error — two columns could silently become one. Assert instead. */
const MAX_IDENTIFIER_BYTES = 63;

/* The two columns that are ours. Every other column in staging comes from
 * Access and is untouched. */
const SRC_FILE = 'src_file';
const SRC_ROW_NUM = 'src_row_num';

function fail(message: string): never {
  console.error(`\ngenerate:staging-schema — REFUSING TO WRITE\n\n  ${message}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------------
 * A CSV reader.
 *
 * `Import-Csv` on the PowerShell side and this on the Node side have to agree
 * about the same files, so this is a real RFC 4180 parse: quoted fields,
 * doubled quotes inside them, and newlines inside them. A split on commas
 * would be wrong the moment a caption or a validation rule contains one, and
 * they do.
 * --------------------------------------------------------------------- */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  /* A byte-order mark would otherwise become part of the first header name. */
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  /* A trailing newline must not produce a phantom final row. */
  if (field !== '' || row.length > 0) endRow();

  return rows;
}

function readCsvObjects(path: string): Record<string, string>[] {
  if (!existsSync(path)) {
    fail(
      `${path} does not exist.\n  Run the extraction first:\n` +
        `    scripts/01_extract_access.ps1 -DatabasePath <copy.accdb> -OutputRoot _migration`,
    );
  }
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const header = rows[0];
  if (header === undefined) fail(`${path} is empty`);

  return rows.slice(1).map((cells) => {
    const o: Record<string, string> = {};
    header.forEach((name, idx) => {
      o[name] = cells[idx] ?? '';
    });
    return o;
  });
}

function need(row: Record<string, string>, key: string, where: string): string {
  const v = row[key];
  if (v === undefined) fail(`${where}: no column named '${key}'`);
  return v;
}

/* ------------------------------------------------------------------------
 * Identifier quoting.
 *
 * Every identifier is double-quoted, so Arabic, spaces, slashes and hyphens
 * all survive: "الموقف الحالي", "Cash/probono", "Inv-No". A double quote in
 * a name would be doubled — there are none today, and the assertion below
 * says so rather than assuming it.
 * --------------------------------------------------------------------- */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function identifierBytes(name: string): number {
  return Buffer.byteLength(name, 'utf8');
}

/* ---------------------------------------------------------------------- */

type Column = { table: string; name: string; ordinal: number; complex: boolean };

const columnRows = readCsvObjects(COLUMNS_CSV);
const manifestRows = readCsvObjects(MANIFEST_CSV);
const summary = JSON.parse(readFileSync(SUMMARY_JSON, 'utf8')) as {
  source_path: string;
  source_bytes: number;
  source_modified_utc: string;
  source_sha256: string;
  tables_extracted: number;
  total_rows: number;
  warnings: number;
  extracted_at: string;
};

/* ---- 1. the extraction this is generated from must be a clean one ------ */

if (summary.warnings !== 0) {
  fail(
    `the extraction recorded ${summary.warnings} warning(s).\n` +
      `  Gate 1 fails on any warning, and a staging schema built from a\n` +
      `  failed extraction would describe something nobody has accepted.`,
  );
}
if (!/^[0-9a-fA-F]{64}$/.test(summary.source_sha256 ?? '')) {
  fail('the extraction summary does not record a SHA-256 for the source file');
}

/* ---- 2. the dictionary and the manifest must agree -------------------- */

const manifestTables = manifestRows.filter((r) => need(r, 'object_type', MANIFEST_CSV) === 'table');
const manifestComplex = manifestRows.filter(
  (r) => need(r, 'object_type', MANIFEST_CSV) === 'complex',
);

const columns: Column[] = columnRows.map((r) => ({
  table: need(r, 'table_name', COLUMNS_CSV),
  name: need(r, 'column_name', COLUMNS_CSV),
  ordinal: Number(need(r, 'ordinal', COLUMNS_CSV)),
  complex: need(r, 'is_complex', COLUMNS_CSV).toLowerCase() === 'true',
}));

const dictTables = [...new Set(columns.map((c) => c.table))];
const manifestTableNames = manifestTables.map((r) => need(r, 'name', MANIFEST_CSV));

const onlyInDict = dictTables.filter((t) => !manifestTableNames.includes(t));
const onlyInManifest = manifestTableNames.filter((t) => !dictTables.includes(t));
if (onlyInDict.length > 0 || onlyInManifest.length > 0) {
  fail(
    `the column dictionary and the manifest describe different tables.\n` +
      `  only in columns.csv : ${onlyInDict.join(', ') || '(none)'}\n` +
      `  only in manifest.csv: ${onlyInManifest.join(', ') || '(none)'}`,
  );
}
if (manifestTableNames.length !== summary.tables_extracted) {
  fail(
    `the manifest lists ${manifestTableNames.length} tables but the summary says ` +
      `${summary.tables_extracted} were extracted`,
  );
}

/*
 * The real cross-check. `plain_columns` is counted by the extraction loop as
 * it writes each CSV; the dictionary is written afterwards from the table
 * definitions. Two independent counts of the same thing, so a disagreement
 * means one of them is wrong and neither can be trusted.
 */
for (const t of manifestTables) {
  const name = need(t, 'name', MANIFEST_CSV);
  const expected = Number(need(t, 'plain_columns', MANIFEST_CSV));
  const actual = columns.filter((c) => c.table === name && !c.complex).length;
  if (actual !== expected) {
    fail(
      `table '${name}': the manifest recorded ${expected} plain columns, ` +
        `the dictionary has ${actual}`,
    );
  }
}

const complexInDict = columns.filter((c) => c.complex);
if (complexInDict.length !== manifestComplex.length) {
  fail(
    `the dictionary has ${complexInDict.length} complex columns but the manifest ` +
      `has ${manifestComplex.length} complex output files`,
  );
}

/* ---- 3. every identifier must survive PostgreSQL unchanged ------------ */

for (const name of [...dictTables, ...columns.map((c) => c.name)]) {
  const bytes = identifierBytes(name);
  if (bytes > MAX_IDENTIFIER_BYTES) {
    fail(
      `'${name}' is ${bytes} bytes. PostgreSQL truncates identifiers over ` +
        `${MAX_IDENTIFIER_BYTES} with a notice, not an error, so two columns ` +
        `could silently become one.`,
    );
  }
  if (name.includes('"')) {
    fail(`'${name}' contains a double quote. Check the quoting before proceeding.`);
  }
  if (name.trim() === '') {
    fail('an identifier is empty or whitespace only');
  }
}

for (const table of dictTables) {
  const inTable = columns.filter((c) => c.table === table).map((c) => c.name);
  const seen = new Set<string>();
  for (const name of inTable) {
    if (seen.has(name)) fail(`table '${table}' has two columns named '${name}'`);
    seen.add(name);
  }
  for (const bookkeeping of [SRC_FILE, SRC_ROW_NUM]) {
    if (inTable.includes(bookkeeping)) {
      fail(
        `table '${table}' already has a column called '${bookkeeping}', which ` +
          `collides with the bookkeeping column of the same name`,
      );
    }
  }
}

/* ---- 4. the complex tables, from the extractor's own CSV headers ------ */

/*
 * Read back rather than retyped, for the same reason as everything else here.
 * These headers are written by the extraction — `parent_key,file_name,...`
 * for an attachment, `parent_key,ordinal,value` for a multi-value field —
 * and staging has to match them exactly or the load will not line up.
 */
type ComplexTable = { staging: string; source: string; file: string; columns: string[] };

const complexTables: ComplexTable[] = manifestComplex.map((r) => {
  const source = need(r, 'name', MANIFEST_CSV); // e.g. العملاء.logo
  const file = need(r, 'output_file', MANIFEST_CSV);
  const path = `_migration/${file}`;
  if (!existsSync(path)) fail(`${path} is in the manifest but not on disk`);

  const firstRow = parseCsv(readFileSync(path, 'utf8'))[0];
  if (firstRow === undefined || firstRow.length === 0) {
    fail(`${path} has no header row`);
  }

  /* `العملاء.logo` becomes `العملاء__logo`: one staging table per complex
   * column, named after the table and the column it came from. */
  const dot = source.lastIndexOf('.');
  if (dot < 1) fail(`complex entry '${source}' is not in table.column form`);
  const staging = `${source.slice(0, dot)}__${source.slice(dot + 1)}`;

  if (identifierBytes(staging) > MAX_IDENTIFIER_BYTES) {
    fail(`staging table name '${staging}' is ${identifierBytes(staging)} bytes`);
  }
  return { staging, source, file, columns: firstRow };
});

/* ---- 5. build the SQL ------------------------------------------------- */

const target = process.argv[2];
if (target === undefined) {
  fail(
    'no output path given. Usage:\n' +
      '  npm run generate:staging-schema -- prisma/migrations/<folder>/migration.sql',
  );
}

const out: string[] = [];

function table(name: string, sourceColumns: string[], comment: string) {
  out.push(`CREATE TABLE staging.${quoteIdent(name)} (`);
  /* Bookkeeping first, so the source columns stay contiguous and in their
   * Access order, and so nobody mistakes one of ours for one of theirs. */
  out.push(`    ${SRC_FILE}    text    NOT NULL,`);
  out.push(`    ${SRC_ROW_NUM} integer NOT NULL,`);
  for (const c of sourceColumns) {
    out.push(`    ${quoteIdent(c)} text,`);
  }
  out.push(`    PRIMARY KEY (${SRC_FILE}, ${SRC_ROW_NUM})`);
  out.push(');');
  out.push(`COMMENT ON TABLE staging.${quoteIdent(name)} IS`);
  out.push(`    ${sqlString(comment)};`);
  out.push('');
}

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

let sourceColumnCount = 0;
let totalColumnCount = 0;

out.push('-- ' + '='.repeat(73));
out.push('--  0024 — STAGING SCHEMA (task 2.2)');
out.push('--');
out.push('--  GENERATED. Do not edit this file by hand.');
out.push('--      npm run generate:staging-schema -- <this file>');
out.push("--  Source of truth for the names: the extraction's own");
out.push('--  _migration/meta/columns.csv. 191 columns, most of them Arabic;');
out.push('--  retyping them is where a silent error would enter.');
out.push('--');
out.push('--  EVERY SOURCE COLUMN IS `text`, nullable, with no default and no');
out.push('--  check. A load must not be able to fail on a bad date or a');
out.push('--  non-numeric number — those arrive intact and are dealt with at');
out.push('--  Gate 3, where the firm can see them. A row rejected at the door');
out.push('--  is a row nobody ever sees again.');
out.push('--');
out.push('--  NULL and empty string stay distinct. An unassigned `lawyerA` is');
out.push('--  not the same as one that was cleared. The extractor writes NULL');
out.push('--  as a bare empty field and \'\' as "", and PostgreSQL CSV COPY reads');
out.push('--  back exactly that distinction, so the schema only has to stay out');
out.push('--  of the way.');
out.push('--');
out.push('--  Names are VERBATIM — Arabic, `Cash/probono`, `Inv-No` and all.');
out.push('--  Staging must be directly comparable to the source. Renaming to');
out.push('--  snake_case ASCII happens at transform, stage D.');
out.push('--');
out.push('--  THE EXTRACTION THIS DESCRIBES');
out.push(`--      source     ${summary.source_path}`);
out.push(`--      bytes      ${summary.source_bytes.toLocaleString('en-US')}`);
out.push(`--      modified   ${summary.source_modified_utc}`);
out.push(`--      sha256     ${summary.source_sha256}`);
out.push(`--      extracted  ${summary.extracted_at}`);
out.push(`--      tables     ${manifestTableNames.length}`);
out.push(`--      rows       ${Number(summary.total_rows).toLocaleString('en-US')}`);
out.push('-- ' + '='.repeat(73));
out.push('');

out.push('CREATE SCHEMA staging;');
out.push('COMMENT ON SCHEMA staging IS');
out.push(
  `    ${sqlString(
    'Stage B of the Access migration. Every source column is text: a load ' +
      'can never fail on a type conversion, so no row is rejected at the ' +
      'door. Cleaning happens at Gate 3. See docs/MIGRATION.md.',
  )};`,
);
out.push('');
out.push('-- ' + '-'.repeat(73));
out.push('--  THE EXTRACTED TABLES — column names exactly as Access holds them');
out.push('-- ' + '-'.repeat(73));
out.push('');

for (const name of manifestTableNames) {
  const cols = columns
    .filter((c) => c.table === name && !c.complex)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((c) => c.name);

  sourceColumnCount += cols.length;
  totalColumnCount += cols.length + 2;

  const complexHere = columns.filter((c) => c.table === name && c.complex).map((c) => c.name);
  const note =
    complexHere.length > 0
      ? `Access table ${name}. ${cols.length} columns, all text. The complex ` +
        `column${complexHere.length > 1 ? 's' : ''} ${complexHere.join(', ')} ` +
        `${complexHere.length > 1 ? 'are' : 'is'} not here — a complex column holds a ` +
        `pointer, not data, and its real content is staged separately.`
      : `Access table ${name}. ${cols.length} columns, all text.`;

  table(name, cols, note);
}

out.push('-- ' + '-'.repeat(73));
out.push('--  THE COMPLEX COLUMNS');
out.push('--');
out.push('--  Attachment and multi-value columns are not stored in the visible');
out.push('--  table: the visible column holds an internal pointer. Exporting');
out.push('--  العملاء to CSV gives a `logo` column where all 318 rows look');
out.push('--  populated with values like 136, 42, 1 — and only 54 clients have');
out.push('--  a logo. Each one is staged as its own table, keyed back to its');
out.push('--  parent row. See D11 and docs/MIGRATION.md.');
out.push('-- ' + '-'.repeat(73));
out.push('');

for (const c of complexTables) {
  sourceColumnCount += c.columns.length;
  totalColumnCount += c.columns.length + 2;
  table(
    c.staging,
    c.columns,
    `The complex column ${c.source}, flattened. Extracted to ${c.file}. ` +
      `parent_key points back at the row it belongs to.`,
  );
}

/* ---- 6. assert the shape the migration just created ------------------- */

/*
 * Rule 16: an assertion that runs once is a snapshot, not an invariant. These
 * prove the migration built what it meant to build, at the moment it ran;
 * `npm run db:check` re-proves them every time anyone looks.
 */
const tableCount = manifestTableNames.length + complexTables.length;

out.push('-- ' + '-'.repeat(73));
out.push('--  ASSERTIONS');
out.push('--');
out.push('--  Not "did the CREATE statements run" — that much a syntax error');
out.push('--  would catch. These prove the PROPERTIES the staging layer exists');
out.push('--  for: nothing can reject a row. A NOT NULL, a default or a check');
out.push('--  on a source column would each turn a load failure into a lost');
out.push('--  row, and none of them would look wrong in a diff.');
out.push('-- ' + '-'.repeat(73));
out.push('');
out.push('DO $STAGING$');
out.push('DECLARE');
out.push('    n integer;');
out.push('BEGIN');
out.push('    SELECT count(*) INTO n FROM information_schema.tables');
out.push("     WHERE table_schema = 'staging' AND table_type = 'BASE TABLE';");
out.push(`    IF n <> ${tableCount} THEN`);
out.push(`        RAISE EXCEPTION 'staging: % tables, expected ${tableCount}', n;`);
out.push('    END IF;');
out.push('');
out.push('    SELECT count(*) INTO n FROM information_schema.columns');
out.push("     WHERE table_schema = 'staging';");
out.push(`    IF n <> ${totalColumnCount} THEN`);
out.push(
  `        RAISE EXCEPTION 'staging: % columns, expected ${totalColumnCount} ` +
    `(${sourceColumnCount} from Access + ${tableCount} x 2 bookkeeping)', n;`,
);
out.push('    END IF;');
out.push('');
out.push('    --  Every source column is text. A typed column here would be a');
out.push('    --  column that can refuse a row.');
out.push('    SELECT count(*) INTO n FROM information_schema.columns');
out.push("     WHERE table_schema = 'staging'");
out.push(`       AND column_name NOT IN ('${SRC_FILE}', '${SRC_ROW_NUM}')`);
out.push("       AND data_type <> 'text';");
out.push('    IF n <> 0 THEN');
out.push("        RAISE EXCEPTION 'staging: % source columns are not text', n;");
out.push('    END IF;');
out.push('');
out.push("    --  ...and every one of them is nullable, so NULL and '' can both");
out.push('    --  arrive and stay different.');
out.push('    SELECT count(*) INTO n FROM information_schema.columns');
out.push("     WHERE table_schema = 'staging'");
out.push(`       AND column_name NOT IN ('${SRC_FILE}', '${SRC_ROW_NUM}')`);
out.push("       AND is_nullable <> 'YES';");
out.push('    IF n <> 0 THEN');
out.push("        RAISE EXCEPTION 'staging: % source columns are NOT NULL', n;");
out.push('    END IF;');
out.push('');
out.push('    --  No defaults. A default would invent a value for a field the');
out.push('    --  firm left empty, which is the opposite of what staging is for.');
out.push('    SELECT count(*) INTO n FROM information_schema.columns');
out.push("     WHERE table_schema = 'staging' AND column_default IS NOT NULL;");
out.push('    IF n <> 0 THEN');
out.push("        RAISE EXCEPTION 'staging: % columns have a default', n;");
out.push('    END IF;');
out.push('');
out.push('    --  No checks anywhere in the schema.');
out.push('    SELECT count(*) INTO n');
out.push('      FROM pg_constraint c');
out.push('      JOIN pg_class t ON t.oid = c.conrelid');
out.push('      JOIN pg_namespace ns ON ns.oid = t.relnamespace');
out.push("     WHERE ns.nspname = 'staging' AND c.contype = 'c';");
out.push('    IF n <> 0 THEN');
out.push("        RAISE EXCEPTION 'staging: % check constraints', n;");
out.push('    END IF;');
out.push('');
out.push('    --  No foreign keys either. A staging row that fails to find its');
out.push('    --  parent is a finding for Gate 3, not a load error.');
out.push('    SELECT count(*) INTO n');
out.push('      FROM pg_constraint c');
out.push('      JOIN pg_class t ON t.oid = c.conrelid');
out.push('      JOIN pg_namespace ns ON ns.oid = t.relnamespace');
out.push("     WHERE ns.nspname = 'staging' AND c.contype = 'f';");
out.push('    IF n <> 0 THEN');
out.push("        RAISE EXCEPTION 'staging: % foreign keys', n;");
out.push('    END IF;');
out.push('');
out.push('    --  Every table keyed on the bookkeeping pair, so loading the same');
out.push('    --  file twice is an error rather than a silent doubling.');
out.push('    SELECT count(*) INTO n');
out.push('      FROM pg_constraint c');
out.push('      JOIN pg_class t ON t.oid = c.conrelid');
out.push('      JOIN pg_namespace ns ON ns.oid = t.relnamespace');
out.push("     WHERE ns.nspname = 'staging' AND c.contype = 'p';");
out.push(`    IF n <> ${tableCount} THEN`);
out.push(`        RAISE EXCEPTION 'staging: % primary keys, expected ${tableCount}', n;`);
out.push('    END IF;');
out.push('');
out.push(
  `    RAISE NOTICE 'staging: ${tableCount} tables, ${sourceColumnCount} source columns, all text, nothing can refuse a row';`,
);
out.push('END');
out.push('$STAGING$;');
out.push('');

writeFileSync(target, out.join('\n'), 'utf8');

console.log(`\ngenerate:staging-schema — wrote ${target}`);
console.log(
  `  tables       : ${tableCount}  (${manifestTableNames.length} extracted + ${complexTables.length} complex)`,
);
console.log(`  source cols  : ${sourceColumnCount}`);
console.log(`  total cols   : ${totalColumnCount}  (+ ${tableCount} x 2 bookkeeping)`);
console.log(`  from         : ${summary.source_path}`);
console.log(`  sha256       : ${summary.source_sha256}\n`);
