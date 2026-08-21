/*
 * Regression tests for the db:reset guard.
 *
 *     npm run test:guard
 *
 * This guard has now been wrong three times, and each time it was wrong in
 * the same way: it inspected something ADJACENT to what it destroys. Wrong
 * schema, then wrong server, then wrong database on the right server. Each
 * fix passed the tests that existed at the time. So the tests live here now,
 * they run together, and every past failure has a case.
 *
 * ---------------------------------------------------------------------------
 *  THIS SUITE NEVER DESTROYS ANYTHING
 * ---------------------------------------------------------------------------
 *
 * It never passes --force-i-know, and it uses --dry-run for the one case
 * where the guard is expected to allow a reset. Every other case expects a
 * refusal, and a refusal changes nothing.
 *
 * Before it creates a single fixture it checks that the database holds no
 * data it did not create — CLAUDE.md rule 14 and the matching rule in
 * AGENTS.md. From Stage 2 this database holds 30,553 extracted rows and 54
 * client logos, and this suite must refuse to run rather than add tables to
 * them.
 */

import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { parseDatabaseList, parseTableCounts } from './lib/inventory';

const POSTGRES_USER = process.env['POSTGRES_USER'] ?? 'litigation';
const DATABASE = process.env['POSTGRES_DB'] ?? 'litigation';

/* Every table this suite creates. Nothing else is ever touched. */
const FIXTURE_TABLES = ['guard_fixture_rows', 'stray_data', 'review|guard_fixture'];
const FIXTURE_SCHEMAS = ['guard_stg', 'guard_qc'];

function psql(database: string, sql: string): string {
  return execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'db', 'psql', '-U', POSTGRES_USER, '-d', database, '-tAc', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

type Result = { code: number; output: string };

function runGuard(extraEnv: Record<string, string>, args: string[] = []): Result {
  try {
    /*
     * shell: true because on Windows npx is a .cmd, which execFileSync cannot
     * spawn directly. Without it the call fails to start, stdout and stderr
     * come back empty, and every case looks like a refusal for no stated
     * reason — which is how this suite first "passed" nothing at all.
     */
    const output = execFileSync('npx', ['tsx', 'scripts/db-reset.ts', ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    return { code: 0, output };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

// ---------------------------------------------------------------------------
//  Rule 14: prove there is nothing here but our own fixtures.
// ---------------------------------------------------------------------------
function assertNoProjectData() {
  /*
   * JSON, not a delimited string. This function had the identical fault the
   * guard did: it split on '=' and a table name containing one would have made
   * its rows read as zero — so the safety check protecting the firm's data
   * would itself have said "nothing here" and let the fixtures be written.
   */
  const databases = parseDatabaseList(
    psql(
      'postgres',
      `SELECT coalesce(json_agg(datname ORDER BY datname), '[]'::json)
         FROM pg_database WHERE NOT datistemplate`,
    ),
  );

  const foreign: string[] = [];
  for (const db of databases) {
    const counts = parseTableCounts(
      psql(
        db,
        `SELECT coalesce(json_agg(json_build_object(
                    'schema', t.table_schema,
                    'table',  t.table_name,
                    'rows',   (xpath('/row/c/text()',
                                     query_to_xml(format('SELECT count(*) AS c FROM %I.%I',
                                                         t.table_schema, t.table_name),
                                                  false, true, '')))[1]::text::bigint
                ) ORDER BY t.table_schema, t.table_name), '[]'::json)
           FROM information_schema.tables t
          WHERE t.table_type = 'BASE TABLE'
            AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
            AND t.table_schema NOT LIKE 'pg_toast%'
            AND NOT (t.table_schema = 'public' AND t.table_name = '_prisma_migrations')`,
      ),
      db,
    );

    for (const c of counts) {
      const isOurs = FIXTURE_TABLES.includes(c.table) || FIXTURE_SCHEMAS.includes(c.schema);
      if (!isOurs && c.rows > 0) {
        foreign.push(`${db}.${c.schema}.${c.table} — ${c.rows} rows`);
      }
    }
  }

  if (foreign.length > 0) {
    console.error('\nREFUSING TO RUN THE GUARD TESTS\n');
    console.error('This database holds data that this suite did not create:\n');
    for (const f of foreign) console.error('  ' + f);
    console.error('\nThese tests write fixture tables into it. From Stage 2 that data is');
    console.error('the extracted Access records and cannot be recreated cheaply.');
    console.error('See CLAUDE.md rule 14.\n');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
/* Quoted, because one fixture name deliberately contains a pipe. */
const quoted = (name: string) => '"' + name.replace(/"/g, '""') + '"';

function cleanup() {
  const tables = FIXTURE_TABLES.map(quoted).join(', ');
  psql(DATABASE, `DROP TABLE IF EXISTS ${tables} CASCADE`);
  psql(DATABASE, FIXTURE_SCHEMAS.map((s) => `DROP SCHEMA IF EXISTS ${s} CASCADE`).join('; '));
  psql('postgres', `DROP TABLE IF EXISTS ${tables} CASCADE`);
}

type Case = {
  name: string;
  setUp?: () => void;
  env?: Record<string, string>;
  args?: string[];
  /* Every case but one expects a refusal. */
  expect: 'refuse' | 'allow';
  /* Text that must appear, so a refusal for the WRONG reason still fails. */
  because: string;
  noOverride?: boolean;
};

const url = process.env['DATABASE_URL'] ?? '';
const otherDatabaseUrl = url.replace(/\/[^/?]+(\?|$)/, '/postgres$1');

const cases: Case[] = [
  {
    name: 'APP_ENV unset',
    env: { APP_ENV: '' },
    expect: 'refuse',
    because: 'has not been declared a development machine',
    noOverride: true,
  },
  {
    name: 'APP_ENV misspelled, override supplied',
    env: { APP_ENV: 'Development' },
    args: ['--force-i-know'],
    expect: 'refuse',
    because: 'is not "development"',
    noOverride: true,
  },
  {
    name: 'NODE_ENV=production',
    env: { NODE_ENV: 'production' },
    expect: 'refuse',
    because: 'NODE_ENV says production',
    noOverride: true,
  },
  {
    name: 'database on another machine',
    env: { DATABASE_URL: 'postgresql://a:b@db.example.com:5432/litigation' },
    args: ['--force-i-know'],
    expect: 'refuse',
    because: 'not on this machine',
    noOverride: true,
  },
  {
    /*
     * The exact attack from the re-review: five rows in `litigation`,
     * DATABASE_URL aimed at the empty built-in `postgres` in the SAME
     * container on the SAME port. Previously reported "Tables: none" and
     * destroyed them.
     */
    name: 'wrong database name, same container (the re-review attack)',
    setUp: () => {
      psql(DATABASE, 'CREATE TABLE IF NOT EXISTS guard_fixture_rows (id int)');
      psql(DATABASE, 'TRUNCATE guard_fixture_rows');
      psql(DATABASE, 'INSERT INTO guard_fixture_rows VALUES (1),(2),(3),(4),(5)');
    },
    env: { DATABASE_URL: otherDatabaseUrl },
    expect: 'refuse',
    because: 'not "litigation"',
    noOverride: true,
  },
  {
    /*
     * Correct URL, correct name, target database empty — but another database
     * in the same volume holds rows. The volume is what gets deleted.
     */
    name: 'rows in a sibling database in the same volume',
    setUp: () => {
      psql('postgres', 'CREATE TABLE IF NOT EXISTS stray_data (id int)');
      psql('postgres', 'TRUNCATE stray_data');
      psql('postgres', 'INSERT INTO stray_data SELECT generate_series(1, 412)');
    },
    expect: 'refuse',
    because: 'postgres.public.stray_data',
  },
  {
    /* Stage 2: extracted rows land in a staging schema, not public. */
    name: 'rows only in a staging schema',
    setUp: () => {
      psql(DATABASE, 'CREATE SCHEMA IF NOT EXISTS guard_stg');
      psql(DATABASE, 'CREATE TABLE IF NOT EXISTS guard_stg.hearings (id int)');
      psql(DATABASE, 'TRUNCATE guard_stg.hearings');
      psql(DATABASE, 'INSERT INTO guard_stg.hearings SELECT generate_series(1, 13279)');
    },
    expect: 'refuse',
    because: 'guard_stg.hearings',
  },
  {
    /* Stage 2: quarantined values land in their own schema too. */
    name: 'rows only in a quarantine schema',
    setUp: () => {
      psql(DATABASE, 'CREATE SCHEMA IF NOT EXISTS guard_qc');
      psql(DATABASE, 'CREATE TABLE IF NOT EXISTS guard_qc.quarantine (id int)');
      psql(DATABASE, 'TRUNCATE guard_qc.quarantine');
      psql(DATABASE, 'INSERT INTO guard_qc.quarantine SELECT generate_series(1, 289)');
    },
    expect: 'refuse',
    because: 'guard_qc.quarantine',
  },
  {
    /*
     * The red-team case: a table whose NAME contains the character the
     * inventory used to be delimited by. The count landed in the wrong field,
     * Number('guard_fixture') gave NaN, and three real rows were reported as
     * an empty table with deletion permitted.
     */
    name: 'a table name containing the old delimiter is still counted',
    setUp: () => {
      psql(DATABASE, 'CREATE TABLE IF NOT EXISTS "review|guard_fixture" (id int)');
      psql(DATABASE, 'TRUNCATE "review|guard_fixture"');
      psql(DATABASE, 'INSERT INTO "review|guard_fixture" VALUES (1),(2),(3)');
    },
    args: ['--dry-run'],
    expect: 'refuse',
    because: 'review|guard_fixture',
  },
  {
    /*
     * The passing path. --dry-run so proving the guard ALLOWS a legitimate
     * reset does not require performing one.
     */
    name: 'everything empty — the guard allows it',
    args: ['--dry-run'],
    expect: 'allow',
    because: 'every check passed',
  },
];

// ---------------------------------------------------------------------------
//  The inventory parser, tested directly.
//
//  These feed it replies a real database is awkward to produce. Every one must
//  THROW — because the rule is that a value the guard cannot understand is a
//  refusal, never a zero. Reading an unparseable count as an empty table is
//  precisely how three real rows were reported as nothing to lose.
// ---------------------------------------------------------------------------
const MALFORMED: Array<[string, string]> = [
  ['nothing at all', ''],
  ['not JSON', 'ERROR:  permission denied'],
  ['not an array', '{"schema":"public"}'],
  ['an entry that is not an object', '["public.clients"]'],
  ['a missing count', '[{"schema":"public","table":"clients"}]'],
  ['a count that is a string', '[{"schema":"public","table":"clients","rows":"12"}]'],
  ['a count that is null', '[{"schema":"public","table":"clients","rows":null}]'],
  ['a count that is not whole', '[{"schema":"public","table":"clients","rows":1.5}]'],
  ['a negative count', '[{"schema":"public","table":"clients","rows":-1}]'],
  ['a missing table name', '[{"schema":"public","rows":3}]'],
  ['an empty table name', '[{"schema":"public","table":"","rows":3}]'],
];

function testParser(): number {
  let bad = 0;

  for (const [name, raw] of MALFORMED) {
    let threw = false;
    try {
      parseTableCounts(raw, 'litigation');
    } catch {
      threw = true;
    }
    if (threw) {
      console.log(`  ok    parser refuses ${name}`);
    } else {
      bad += 1;
      console.log(`  FAIL  parser ACCEPTED ${name} — it must refuse, not read it as zero`);
    }
  }

  /* And the well-formed case, including names that would break a delimiter. */
  const awkward = JSON.stringify([
    { schema: 'public', table: 'review|guard_fixture', rows: 3 },
    { schema: 'stg', table: 'a=b', rows: 0 },
    { schema: 'qc', table: 'الجلسات', rows: 13279 },
  ]);
  try {
    const parsed = parseTableCounts(awkward, 'litigation');
    const total = parsed.reduce((sum, c) => sum + c.rows, 0);
    if (parsed.length === 3 && total === 13282) {
      console.log('  ok    parser reads names containing | and = and Arabic');
    } else {
      bad += 1;
      console.log(`  FAIL  parser misread the awkward names — ${parsed.length} rows, ${total} total`);
    }
  } catch (error) {
    bad += 1;
    console.log(`  FAIL  parser rejected a well-formed reply — ${String(error)}`);
  }

  return bad;
}

// ---------------------------------------------------------------------------
function main() {
  let failed = testParser();

  assertNoProjectData();
  cleanup();

  for (const c of cases) {
    cleanup();
    c.setUp?.();

    const result = runGuard(c.env ?? {}, c.args ?? []);
    const refused = result.code !== 0;
    const wantRefusal = c.expect === 'refuse';

    const problems: string[] = [];
    if (refused !== wantRefusal) {
      problems.push(`expected the guard to ${c.expect}, but it ${refused ? 'refused' : 'allowed'}`);
    }
    if (!result.output.includes(c.because)) {
      problems.push(`the output never mentioned "${c.because}"`);
    }
    if (c.noOverride && !result.output.includes('no override')) {
      problems.push('this refusal must state that there is no override');
    }

    if (problems.length === 0) {
      console.log(`  ok    ${c.name}`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${c.name}`);
      for (const p of problems) console.log(`          ${p}`);
      console.log('        ---- guard said ----');
      for (const line of result.output.trim().split('\n').slice(0, 12)) {
        console.log(`        ${line}`);
      }
    }
  }

  cleanup();

  console.log('');
  if (failed > 0) {
    console.error(`${failed} of ${cases.length} guard tests failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `test:guard — ${MALFORMED.length + 1} parser cases and ${cases.length} guard cases, ` +
      'all correct. Nothing was destroyed.',
  );
}

main();
