/*
 * Stage B — load the extraction into the staging schema, then Gate 2.
 *
 *     npm run load:staging
 *     npm run load:staging -- --reload     (empty staging first and load again)
 *
 * GATE 2 PROVES NOTHING WAS LOST BETWEEN READING AND LOADING.
 *
 * Staged row counts must equal the manifest counts EXACTLY, per table and in
 * total. Not approximately. The manifest count was taken as the extractor read
 * each row out of Access; the staged count is what landed in PostgreSQL. Two
 * measurements of the same thing at opposite ends of the journey.
 *
 * The whole load runs in ONE transaction and Gate 2 runs inside it, so a
 * failure rolls the entire thing back. A half-loaded staging schema that looks
 * plausible is worse than an empty one.
 *
 * HOW src_row_num IS PRODUCED — ruled by the firm, 23 August 2026
 *
 * It is the ordinal of the record within its CSV, counted BY THIS SCRIPT as it
 * streams the file. It is never derived after loading: PostgreSQL gives no
 * guarantee that a SELECT returns rows in the order COPY wrote them, and a
 * number that is usually the line number is not a line number. Every target row
 * three stages from here has to trace back to a line in a file the firm still
 * has.
 *
 * Note it counts RECORDS, not lines. A memo field in this database can hold a
 * newline, so record 400 may begin well past line 400.
 *
 * HOW NULL AND '' STAY APART
 *
 * By never being decoded. The scanner finds record boundaries and hands the
 * record's ORIGINAL TEXT through untouched; this script prepends the four
 * provenance fields without re-encoding the source fields. A bare empty field
 * stays bare and a quoted empty field stays quoted, so PostgreSQL's CSV COPY
 * makes the same distinction it always would.
 *
 * Across the whole extraction that difference is 193,445 NULLs against 2 empty
 * strings. Two cells, both in العملاء."Cash/probono". Decoding and re-encoding
 * would have been the obvious way to write this and would have lost them
 * without moving a single count.
 */

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrationDb as db } from './lib/migration-db';
import { sourceRecordKeys } from './lib/source-identity';

const META = '_migration/meta';
const CONTAINER_DIR = '/tmp/staging-load';
const RELOAD = process.argv.includes('--reload');

const CR = '\r';
const LF = '\n';

function fail(message: string): never {
  console.error(`\nload:staging — STOPPED\n\n  ${message}\n`);
  void db.$disconnect();
  process.exit(1);
}

/* ------------------------------------------------------------------------
 *  The scanner.
 *
 *  Returns, for every record, both its ORIGINAL TEXT and its fields. The load
 *  uses the original text — that is what keeps NULL and '' apart. The fields
 *  are used only to check the header and to count what should arrive, and
 *  because they come from the same single pass they cannot disagree with the
 *  record boundaries.
 * --------------------------------------------------------------------- */
type Field = { text: string; quoted: boolean };
type Rec = { raw: string; fields: Field[] };

function scanCsv(text: string): Rec[] {
  const records: Rec[] = [];
  let fields: Field[] = [];
  let field = '';
  let quoted = false; // this field was quoted at some point
  let inQuotes = false;
  let start = 0;
  let i = 0;

  const endField = () => {
    fields.push({ text: field, quoted });
    field = '';
    quoted = false;
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      i += 1;
      continue;
    }

    /*
     * The CR of a CRLF, outside quotes. Skipping it is not cosmetic: without
     * this branch it is appended to the LAST FIELD OF EVERY RECORD, so every
     * `matterID` arrives with a carriage return stuck to it. The header check
     * further down is what caught it — fifteen column names that printed
     * identically and compared unequal.
     *
     * A lone CR is not a line ending here. The extractor writes CRLF, so one
     * on its own means the file is not what this script thinks it is, and
     * guessing at that is how a record boundary lands in the wrong place.
     */
    if (ch === CR) {
      if (text[i + 1] !== LF) {
        throw new Error(
          `a carriage return with no line feed at position ${i} — the file is not CRLF as written`,
        );
      }
      i += 1;
      continue;
    }

    if (ch === LF) {
      /* The record's raw text stops before the newline, and before the
       * carriage return of a CRLF. */
      let end = i;
      if (end > start && text[end - 1] === CR) end -= 1;
      endField();
      records.push({ raw: text.slice(start, end), fields });
      fields = [];
      start = i + 1;
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  /* A final record with no trailing newline. The files as written end with
   * one, so this must not invent a phantom empty record. */
  if (start < text.length) {
    endField();
    records.push({ raw: text.slice(start), fields });
  }

  return records;
}

function csvQuote(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/* ------------------------------------------------------------------------ */

type Load = {
  kind: 'table' | 'complex'; // an extracted table, or a flattened complex column
  staging: string; // the staging table
  source: string; // what the manifest calls it
  file: string; // relative to _migration, and the value stored in src_file
  expected: number; // the row count the extraction recorded
  workFile: string; // handed to psql, named by index so no container path is Arabic
  columns: string[];
  nulls: number;
  empties: number;
};

function readManifest(): Record<string, string>[] {
  const rows = scanCsv(readFileSync(`${META}/manifest.csv`, 'utf8'));
  const header = rows[0];
  if (header === undefined) fail('manifest.csv is empty');
  const names = header.fields.map((f) => f.text);
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    names.forEach((n, idx) => {
      o[n] = r.fields[idx]?.text ?? '';
    });
    return o;
  });
}

async function main() {
  /* ---- 1. the extraction ------------------------------------------- */

  if (!existsSync(`${META}/manifest.csv`)) {
    fail(
      'there is no extraction to load.\n' +
        '  Run:  scripts/01_extract_access.ps1 -DatabasePath <copy.accdb> -OutputRoot _migration',
    );
  }

  const manifest = readManifest();
  const summary = JSON.parse(readFileSync(`${META}/summary.json`, 'utf8')) as {
    source_path: string;
    source_sha256: string;
    total_rows: number;
    total_attachments: number;
    total_mvf_values: number;
    warnings: number;
  };

  if (summary.warnings !== 0) {
    fail(
      `the extraction recorded ${summary.warnings} warning(s), so it did not pass Gate 1.\n` +
        '  Loading it would carry a known fault forward.',
    );
  }
  if (!/^[0-9A-F]{64}$/.test(summary.source_sha256)) {
    fail('the extraction summary has no valid uppercase SHA-256 source fingerprint');
  }

  /* ---- 2. what staging expects -------------------------------------- */

  const stagingColumns = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'staging'
       AND column_name NOT IN (
           'src_file', 'src_row_num', 'src_record_key', 'src_extraction_sha256'
       )
     ORDER BY table_name, ordinal_position`;

  if (stagingColumns.length === 0) {
    fail('the staging schema has no tables. Run: npm run db:migrate');
  }

  const columnsOf = new Map<string, string[]>();
  for (const c of stagingColumns) {
    const list = columnsOf.get(c.table_name) ?? [];
    list.push(c.column_name);
    columnsOf.set(c.table_name, list);
  }

  /* ---- 3. staging must be empty ------------------------------------- */

  const occupied: string[] = [];
  for (const table of columnsOf.keys()) {
    const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM staging.${ident(table)}`,
    );
    const n = rows[0]?.n ?? 0n;
    if (n > 0n) occupied.push(`${table}: ${n}`);
  }

  if (occupied.length > 0 && !RELOAD) {
    fail(
      'staging already holds rows:\n' +
        occupied.map((o) => `      ${o}`).join('\n') +
        '\n\n  Staging is derived — everything in it comes from _migration and can be\n' +
        '  rebuilt from the same files. To empty it and load again:\n\n' +
        '      npm run load:staging -- --reload',
    );
  }

  /* ---- 4. read, check, and transform every file --------------------- */

  const work = join(tmpdir(), `staging-load-${process.pid}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  const loads: Load[] = [];
  let index = 0;

  for (const entry of manifest) {
    const kind = entry['object_type'];
    if (kind !== 'table' && kind !== 'complex') continue;

    const source = entry['name'] ?? '';
    const file = entry['output_file'] ?? '';
    const expected = Number(entry['row_count'] ?? '0');

    /* `العملاء.logo` is staged as `العملاء__logo`, as the schema generator
     * named it. */
    const dot = source.lastIndexOf('.');
    const staging =
      kind === 'complex' ? `${source.slice(0, dot)}__${source.slice(dot + 1)}` : source;

    const columns = columnsOf.get(staging);
    if (columns === undefined) {
      fail(`the manifest has '${source}' but staging has no table '${staging}'`);
    }

    const path = `_migration/${file}`;
    if (!existsSync(path)) fail(`${path} is in the manifest but not on disk`);

    const records = scanCsv(readFileSync(path, 'utf8'));
    const header = records[0];
    if (header === undefined) fail(`${path} has no header row`);

    /*
     * The header must be the staging table's columns, in order. This is what
     * "staging is directly comparable to the source" actually means, and it
     * is what catches a schema generated from a different extraction — or a
     * scanner that mangles the last field of every record.
     */
    const headerNames = header.fields.map((f) => f.text);
    if (headerNames.length !== columns.length || headerNames.some((n, k) => n !== columns[k])) {
      fail(
        `${path}: the header does not match staging.${ident(staging)}.\n` +
          `      file   : ${headerNames.map((n) => JSON.stringify(n)).join(' ')}\n` +
          `      staging: ${columns.map((n) => JSON.stringify(n)).join(' ')}`,
      );
    }

    const data = records.slice(1);

    /* Checked here as well as in SQL after the load. This one says the FILE
     * holds what the manifest claims; Gate 2 says the DATABASE does. */
    if (data.length !== expected) {
      fail(
        `${path}: the manifest says ${expected.toLocaleString('en-US')} rows, ` +
          `the file holds ${data.length.toLocaleString('en-US')}`,
      );
    }

    const recordKeys = sourceRecordKeys(staging, data);
    let nulls = 0;
    let empties = 0;
    const lines: string[] = [];
    const srcFile = csvQuote(file);

    data.forEach((rec, k) => {
      if (rec.fields.length !== columns.length) {
        fail(
          `${path}: record ${k + 1} has ${rec.fields.length} fields, expected ${columns.length}`,
        );
      }
      for (const f of rec.fields) {
        if (f.text === '') {
          if (f.quoted) empties += 1;
          else nulls += 1;
        }
      }
      /* The record's ORIGINAL text, with its positional trace, content-derived
       * identity, and extraction fingerprint in front. The source fields are
       * still not decoded and re-encoded. */
      lines.push(
        `${srcFile},${k + 1},${csvQuote(recordKeys[k]!)},${csvQuote(summary.source_sha256)},${rec.raw}`,
      );
    });

    const workFile = `${String(index).padStart(2, '0')}.csv`;
    writeFileSync(join(work, workFile), lines.length > 0 ? `${lines.join(LF)}${LF}` : '', 'utf8');
    index += 1;

    loads.push({ kind, staging, source, file, expected, workFile, columns, nulls, empties });
  }

  /*
   * THREE TOTALS, AND EACH ONE SAYS WHAT IT COUNTS.
   *
   * The first version of this gate reported a single figure — 31,227 — and
   * compared it against its own sum of the same rows, which proves almost
   * nothing. Worse, 31,227 is not the 30,885 Gate 1 reported, because staging
   * holds the flattened complex columns as rows of their own. The two numbers
   * measure different things and neither is wrong; printing one under the
   * other's name is the fault.
   *
   * So: the table subtotal is checked against `summary.total_rows`, which the
   * extraction recorded independently and Gate 1 has already accepted, and
   * the complex subtotal against the attachment and multi-value figures from
   * the same place.
   */
  const tables = loads.filter((l) => l.kind === 'table');
  const complex = loads.filter((l) => l.kind === 'complex');

  const expectedTableRows = tables.reduce((a, l) => a + l.expected, 0);
  const expectedComplexRows = complex.reduce((a, l) => a + l.expected, 0);
  const expectedTotal = expectedTableRows + expectedComplexRows;
  const expectedNulls = loads.reduce((a, l) => a + l.nulls, 0);
  const expectedEmpties = loads.reduce((a, l) => a + l.empties, 0);

  if (expectedTableRows !== Number(summary.total_rows)) {
    fail(
      `the ${tables.length} extracted tables hold ${expectedTableRows.toLocaleString('en-US')} rows ` +
        `but the extraction summary says ${Number(summary.total_rows).toLocaleString('en-US')}`,
    );
  }
  if (
    expectedComplexRows !==
    Number(summary.total_attachments) + Number(summary.total_mvf_values)
  ) {
    fail(
      `the complex files hold ${expectedComplexRows.toLocaleString('en-US')} rows but the ` +
        `extraction summary says ${summary.total_attachments} attachments + ` +
        `${summary.total_mvf_values} multi-value entries`,
    );
  }

  console.log(`\nload:staging — ${loads.length} files read and checked`);
  console.log(
    `  extracted rows : ${expectedTableRows.toLocaleString('en-US')} over ${tables.length} tables`,
  );
  console.log(
    `  complex rows   : ${expectedComplexRows.toLocaleString('en-US')} over ${complex.length} tables ` +
      `(${summary.total_attachments} attachments + ${summary.total_mvf_values} multi-value)`,
  );
  console.log(
    `  to stage       : ${expectedTotal.toLocaleString('en-US')} over ${loads.length} tables`,
  );
  console.log(`  NULL cells     : ${expectedNulls.toLocaleString('en-US')}`);
  console.log(`  empty strings  : ${expectedEmpties.toLocaleString('en-US')}`);
  console.log(`  from           : ${summary.source_path}`);
  console.log(`  sha256         : ${summary.source_sha256}\n`);

  await db.$disconnect();

  /* ---- 5. hand the files to the container --------------------------- */

  spawnSync('docker', ['compose', 'exec', '-T', 'db', 'rm', '-rf', CONTAINER_DIR]);
  const copied = spawnSync('docker', ['compose', 'cp', work, `db:${CONTAINER_DIR}`], {
    encoding: 'utf8',
  });
  if (copied.status !== 0) {
    fail(`could not copy the files into the container:\n      ${copied.stderr ?? ''}`);
  }

  /* ---- 6. one transaction: load, then Gate 2 ------------------------ */

  const sql: string[] = ['BEGIN;'];
  if (RELOAD) {
    for (const l of loads) sql.push(`TRUNCATE staging.${ident(l.staging)};`);
  }
  for (const l of loads) {
    const cols = [
      'src_file',
      'src_row_num',
      'src_record_key',
      'src_extraction_sha256',
      ...l.columns,
    ]
      .map(ident)
      .join(', ');
    /* A psql meta-command has to be one line. */
    sql.push(
      `\\copy staging.${ident(l.staging)} (${cols}) FROM '${CONTAINER_DIR}/${l.workFile}' WITH (FORMAT csv)`,
    );
  }
  sql.push(
    gate2(loads, {
      tableRows: expectedTableRows,
      complexRows: expectedComplexRows,
      total: expectedTotal,
      nulls: expectedNulls,
      empties: expectedEmpties,
      extractionSha256: summary.source_sha256,
    }),
  );
  sql.push('COMMIT;');
  sql.push('');

  const psql = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      process.env['POSTGRES_USER'] ?? 'litigation',
      '-d',
      process.env['POSTGRES_DB'] ?? 'litigation',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
    ],
    { input: sql.join(LF), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  const output = `${psql.stdout ?? ''}${psql.stderr ?? ''}`;
  console.log(
    output
      .split(LF)
      .filter((l) => l.trim() !== '')
      .map((l) => l.replace(/^NOTICE: {2}/, ''))
      .join(LF),
  );

  spawnSync('docker', ['compose', 'exec', '-T', 'db', 'rm', '-rf', CONTAINER_DIR]);
  rmSync(work, { recursive: true, force: true });

  if (psql.status !== 0) {
    console.error('\nGATE 2 FAILED — the transaction rolled back. Staging is unchanged.\n');
    process.exit(1);
  }

  /*
   * A test must fail when it is REMOVED, not only when it is wrong
   * (docs/MIGRATION.md). psql exits 0 for a script whose assertions never ran,
   * so the proofs are counted rather than assumed.
   */
  const proved = (output.match(/PROVED:/g) ?? []).length;
  if (proved !== 8) {
    console.error(
      `\nGATE 2 INCONCLUSIVE: expected 8 PROVED notices, saw ${proved}.\n` +
        '  psql exited 0, but the checks did not all run.\n',
    );
    process.exit(1);
  }

  console.log('\nGATE 2 PASSED — nothing was lost between reading and loading.\n');
}

/* ------------------------------------------------------------------------
 *  GATE 2.
 *
 *  Runs inside the same transaction as the load, so a failure takes the load
 *  with it. Every figure it compares against came from the extraction, which
 *  Gate 1 has already accepted.
 * --------------------------------------------------------------------- */
type Gate2Figures = {
  tableRows: number;
  complexRows: number;
  total: number;
  nulls: number;
  empties: number;
  extractionSha256: string;
};

function gate2(loads: Load[], figures: Gate2Figures): string {
  const { tableRows, complexRows, total, nulls, empties, extractionSha256 } = figures;
  const rows = loads
    .map((l) => `        (${lit(l.staging)}, ${l.expected}, ${lit(l.kind)})`)
    .join(',\n');

  return `
DO $GATE2$
DECLARE
    r           record;
    n           bigint;
    distinct_n  bigint;
    lo          bigint;
    hi          bigint;
    files       bigint;
    identities  bigint;
    fingerprints bigint;
    running     bigint := 0;
    table_rows  bigint := 0;
    cplx_rows   bigint := 0;
    problems    text[] := '{}';
    c           bigint;
    null_total  bigint := 0;
    empty_total bigint := 0;
BEGIN
    --  1. PER TABLE: staged rows = the rows the extractor read out of Access.
    --     Exactly. This is the whole of Gate 2's promise.
    FOR r IN
        SELECT * FROM (VALUES
${rows}
        ) AS t(staging_table, expected, kind)
    LOOP
        EXECUTE format(
            'SELECT count(*), count(DISTINCT src_row_num), min(src_row_num), max(src_row_num), count(DISTINCT src_file), count(DISTINCT src_record_key), count(DISTINCT src_extraction_sha256) FROM staging.%I',
            r.staging_table)
           INTO n, distinct_n, lo, hi, files, identities, fingerprints;

        running := running + n;
        IF r.kind = 'table' THEN
            table_rows := table_rows + n;
        ELSE
            cplx_rows := cplx_rows + n;
        END IF;

        IF n <> r.expected THEN
            problems := problems || format('%s: %s rows staged, manifest says %s',
                                           r.staging_table, n, r.expected);
            CONTINUE;
        END IF;

        --  2. src_row_num must be 1..n with no gaps and no repeats. A count
        --     that matches can still be the wrong rows: two copies of record 7
        --     and no record 12 counts exactly the same as 1..n does.
        IF n > 0 THEN
            IF distinct_n <> n OR lo <> 1 OR hi <> n THEN
                problems := problems || format(
                    '%s: src_row_num is not 1..%s (distinct %s, min %s, max %s)',
                    r.staging_table, n, distinct_n, lo, hi);
            END IF;
            IF files <> 1 THEN
                problems := problems || format('%s: rows came from %s different files',
                                               r.staging_table, files);
            END IF;
            IF identities <> n THEN
                problems := problems || format('%s: %s durable identities for %s rows',
                                               r.staging_table, identities, n);
            END IF;
            IF fingerprints <> 1 THEN
                problems := problems || format('%s: rows carry %s extraction fingerprints',
                                               r.staging_table, fingerprints);
            END IF;
            EXECUTE format(
                'SELECT count(*) FROM staging.%I WHERE src_record_key !~ ''^[0-9a-f]{64}:[0-9]{6}$'' OR src_extraction_sha256 <> %L',
                r.staging_table, ${lit(extractionSha256)}) INTO c;
            IF c <> 0 THEN
                problems := problems || format('%s: %s rows carry a malformed identity or the wrong extraction fingerprint',
                                               r.staging_table, c);
            END IF;
        END IF;

        RAISE NOTICE '  % %  of %', rpad(r.staging_table, 24),
                     lpad(n::text, 6), lpad(r.expected::text, 6);
    END LOOP;

    IF array_length(problems, 1) > 0 THEN
        RAISE EXCEPTION E'GATE 2 FAILED\\n  %', array_to_string(problems, E'\\n  ');
    END IF;

    RAISE NOTICE 'PROVED: every table staged exactly the number of rows the extraction read';
    RAISE NOTICE 'PROVED: src_row_num runs 1..n with no gaps and no repeats, one file per table';
    RAISE NOTICE 'PROVED: every staged row has one unique content identity and the extraction fingerprint ${extractionSha256}';

    --  3. THE TOTALS, as a cross-check and nothing more. A total cannot tell a
    --     missing table from a larger one elsewhere — that is what the
    --     per-table loop above is for.
    --
    --     THREE of them, each saying what it counts. The extracted-table
    --     subtotal is the one Gate 1 reported; the staged total is larger
    --     because the flattened complex columns are rows of their own here.
    --     Printing either under the other's name would be a figure standing
    --     in for something it does not measure.
    IF table_rows <> ${tableRows} THEN
        RAISE EXCEPTION 'GATE 2 FAILED: % rows staged from the extracted tables, expected ${tableRows}', table_rows;
    END IF;
    IF cplx_rows <> ${complexRows} THEN
        RAISE EXCEPTION 'GATE 2 FAILED: % rows staged from the complex columns, expected ${complexRows}', cplx_rows;
    END IF;
    IF running <> ${total} THEN
        RAISE EXCEPTION 'GATE 2 FAILED: % rows staged in total, expected ${total}', running;
    END IF;
    RAISE NOTICE 'PROVED: % rows from the extracted tables (Gate 1 reported ${tableRows})', table_rows;
    RAISE NOTICE 'PROVED: % rows from the complex columns, % staged in total', cplx_rows, running;

    --  4. NULL AND THE EMPTY STRING SURVIVED, at full volume and on real data.
    --     ${nulls} against ${empties}. The empty strings are in
    --     العملاء."Cash/probono" — clients where somebody typed something and
    --     cleared it, against the rest where nothing was ever entered.
    --     Decoding and re-encoding the CSV would have lost them, and not one
    --     row count would have moved.
    FOR r IN
        SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'staging'
           AND column_name NOT IN (
               'src_file', 'src_row_num', 'src_record_key', 'src_extraction_sha256'
           )
    LOOP
        EXECUTE format('SELECT count(*) FROM staging.%I WHERE %I IS NULL',
                       r.table_name, r.column_name) INTO c;
        null_total := null_total + c;
        EXECUTE format('SELECT count(*) FROM staging.%I WHERE %I = ''''',
                       r.table_name, r.column_name) INTO c;
        empty_total := empty_total + c;
    END LOOP;

    IF null_total <> ${nulls} THEN
        RAISE EXCEPTION 'GATE 2 FAILED: % NULL cells staged, expected ${nulls}', null_total;
    END IF;
    IF empty_total <> ${empties} THEN
        RAISE EXCEPTION 'GATE 2 FAILED: % empty-string cells staged, expected ${empties}', empty_total;
    END IF;
    RAISE NOTICE 'PROVED: % NULL cells and % empty-string cells, exactly as the files hold them',
                 null_total, empty_total;
    RAISE NOTICE 'PROVED: NULL and the empty string stayed apart on real data, not only in a fixture';

    --  5. Every staged row can name the file it came from and where in it.
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'staging'
       AND column_name IN ('src_file', 'src_row_num', 'src_record_key', 'src_extraction_sha256');
    IF n <> ${loads.length * 4} THEN
        RAISE EXCEPTION 'GATE 2 FAILED: % provenance columns, expected ${loads.length * 4}', n;
    END IF;
    RAISE NOTICE 'PROVED: all ${loads.length} staged tables carry file, row, durable record key and extraction fingerprint';
END
$GATE2$;
`;
}

main().catch((error: unknown) => {
  console.error('\nload:staging — could not run.\n');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
  void db.$disconnect();
});
