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
 * Before it creates a single fixture it checks that the database holds no data
 * it did not create — CLAUDE.md rule 14 and the matching rule in AGENTS.md.
 *
 * ---------------------------------------------------------------------------
 *  IT RUNS AGAINST ITS OWN THROWAWAY DATABASE — task 2.3, 23 August 2026
 * ---------------------------------------------------------------------------
 *
 * It used to write its fixtures into the project database. Rule 14 then did
 * exactly what it was written to do and refused: from Stage 2 that database
 * holds the extracted Access records and 54 client logos, which cost a full
 * extraction run to produce. The suite stopped running — and its 22 cases had
 * not run since task 1.1 while the guard they protect kept changing.
 *
 * The firm's ruling: give it a database of its own, created and destroyed per
 * run, so the suite never touches the project one and rule 14 never has to
 * choose between protecting the data and running the tests.
 *
 * The throwaway is created on the SAME local server, because that is the whole
 * point of several of these cases — the guard's worst failure was destroying
 * five rows in one database while inspecting another in the same container.
 * Testing it against a server somewhere else would not test that at all.
 *
 * The drop is guarded harder than anything else in here. See dropThrowaway().
 */

import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { parseDatabaseList, parseTableCounts } from './lib/inventory';

const POSTGRES_USER = process.env['POSTGRES_USER'] ?? 'litigation';
const PROJECT_DATABASE = process.env['POSTGRES_DB'] ?? 'litigation';

/*
 * The throwaway. The prefix is not decoration: dropThrowaway() refuses to drop
 * anything that does not carry it, so the one destructive statement in this
 * file cannot be aimed at the project database by a bad variable.
 */
const THROWAWAY_PREFIX = 'guard_test_';
const DATABASE = `${THROWAWAY_PREFIX}${process.pid}_${Date.now().toString(36)}`;

/* Every table this suite creates. Nothing else is ever touched. */
const FIXTURE_TABLES = ['guard_fixture_rows', 'stray_data', 'review|guard_fixture'];
const FIXTURE_SCHEMAS = ['guard_stg', 'guard_qc'];

/* An identifier, and a string literal. Both are used before the SQL below. */
const quoted = (name: string) => '"' + name.replace(/"/g, '""') + '"';
const lit = (value: string) => "'" + value.replace(/'/g, "''") + "'";

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
//  The throwaway database.
// ---------------------------------------------------------------------------
function createThrowaway() {
  if (DATABASE === PROJECT_DATABASE || !DATABASE.startsWith(THROWAWAY_PREFIX)) {
    console.error(`\nREFUSING TO RUN: '${DATABASE}' is not a throwaway name.\n`);
    process.exit(1);
  }
  psql('postgres', `CREATE DATABASE ${quoted(DATABASE)}`);
}

function dropThrowaway() {
  /*
   * The only destructive statement in this suite, and the guarded one.
   *
   * Both conditions, not either: the name must carry the throwaway prefix AND
   * must not be the project database. A prefix check alone would be satisfied
   * by a project database somebody had named unluckily, and an inequality
   * check alone would be satisfied by every database on the server except one.
   *
   * If this refuses, it leaves a database behind. That is the right way round:
   * a stray empty database costs a `DROP DATABASE` typed by a human, and the
   * other mistake costs the extraction.
   */
  if (!DATABASE.startsWith(THROWAWAY_PREFIX) || DATABASE === PROJECT_DATABASE) {
    console.error(`\nREFUSING TO DROP '${DATABASE}' — it is not a throwaway database.\n`);
    return;
  }
  try {
    psql('postgres', `DROP DATABASE IF EXISTS ${quoted(DATABASE)} WITH (FORCE)`);
  } catch (error) {
    console.error(`\nCould not drop ${DATABASE}: ${String(error)}`);
    console.error("Drop it by hand — it holds nothing but this suite's fixtures.\n");
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
  /*
   * ONLY the databases this suite writes to: its own throwaway, and the
   * built-in `postgres`, which cleanup() also clears because one case aims
   * the guard at it.
   *
   * This used to scan every database on the server, which from Stage 2 meant
   * it found the extracted Access records in the project database and refused
   * — correctly, but for a database this suite no longer goes near. The check
   * is narrowed to what it protects, not weakened: both databases it does
   * write to are still proved empty of anything but our own fixtures, and
   * they are proved empty every run.
   */
  const databases = parseDatabaseList(
    psql(
      'postgres',
      `SELECT coalesce(json_agg(datname ORDER BY datname), '[]'::json)
         FROM pg_database
        WHERE NOT datistemplate
          AND datname IN (${lit(DATABASE)}, 'postgres')`,
    ),
  );

  if (databases.length !== 2) {
    console.error(
      `\nREFUSING TO RUN: expected the throwaway and postgres, found ${databases.length}.\n`,
    );
    process.exit(1);
  }

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
    console.error('\nThese tests write fixture tables into it, and it is meant to hold');
    console.error('nothing but their fixtures. Something else is using it.');
    console.error('See CLAUDE.md rule 14.\n');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
/* `quoted` is defined above, because the throwaway database needs it first.
 * It matters here too: one fixture name deliberately contains a pipe. */
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
  /*
   * This case can only be proved on a machine whose VOLUME is empty. See
   * emptyVolume below — the guard protects the whole volume, not one
   * database, so a throwaway database is not enough for this one.
   */
  needsEmptyVolume?: boolean;
};

const projectUrl = process.env['MIGRATION_DATABASE_URL'] ?? '';

/* The same server, the same port, the throwaway database. */
const url = projectUrl.replace(/\/[^/?]+(\?|$)/, `/${DATABASE}$1`);
const otherDatabaseUrl = projectUrl.replace(/\/[^/?]+(\?|$)/, '/postgres$1');

/*
 * Every child inherits these unless a case overrides them, so the guard under
 * test treats the THROWAWAY as its legitimate target. Without POSTGRES_DB the
 * guard would compare the connection against the project database and refuse
 * every case for the same uninteresting reason — twenty-two green refusals
 * that prove nothing.
 */
const BASE_ENV: Record<string, string> = { POSTGRES_DB: DATABASE, MIGRATION_DATABASE_URL: url };

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
    env: { MIGRATION_DATABASE_URL: 'postgresql://a:b@db.example.com:5432/litigation' },
    args: ['--force-i-know'],
    expect: 'refuse',
    because: 'not on this machine',
    noOverride: true,
  },
  {
    /*
     * The exact attack from the re-review: five rows in `litigation`,
     * MIGRATION_DATABASE_URL aimed at the empty built-in `postgres` in the SAME
     * container on the SAME port. Previously reported "Tables: none" and
     * destroyed them.
     */
    name: 'wrong database name, same container (the re-review attack)',
    setUp: () => {
      psql(DATABASE, 'CREATE TABLE IF NOT EXISTS guard_fixture_rows (id int)');
      psql(DATABASE, 'TRUNCATE guard_fixture_rows');
      psql(DATABASE, 'INSERT INTO guard_fixture_rows VALUES (1),(2),(3),(4),(5)');
    },
    env: { MIGRATION_DATABASE_URL: otherDatabaseUrl },
    expect: 'refuse',
    because: `not "${DATABASE}"`,
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
    needsEmptyVolume: true,
  },
];

// ---------------------------------------------------------------------------
//  Is the VOLUME empty?
//
//  The guard's unit of protection is the volume, not the database: `docker
//  compose down -v` destroys every database in it at once, which is why the
//  guard enumerates all of them and refuses if ANY holds rows. That is the
//  fix for its worst historical failure — it destroyed five rows in one
//  database while inspecting another in the same container.
//
//  A consequence the throwaway database cannot escape: on a machine that
//  holds the project data, the guard MUST refuse, so the one case that proves
//  it can ALLOW a reset cannot be proved here. That case is not skipped — it
//  is run in a reduced form that still asserts something real, and the
//  reduction is announced. See main().
// ---------------------------------------------------------------------------
function volumeIsEmpty(): boolean {
  const databases = parseDatabaseList(
    psql(
      'postgres',
      `SELECT coalesce(json_agg(datname ORDER BY datname), '[]'::json)
         FROM pg_database WHERE NOT datistemplate`,
    ),
  );
  for (const database of databases) {
    const counts = parseTableCounts(
      psql(
        database,
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
      database,
    );
    if (counts.some((c) => c.rows > 0)) return false;
  }
  return true;
}

/*
 * The six refusals that are NOT "the volume is not empty". When the reduced
 * form of the allow case runs, the guard must have got past every one of
 * these — otherwise it is refusing for a reason that has nothing to do with
 * the project data being present, and the case has proved nothing.
 */
const OTHER_REFUSALS = [
  'has not been declared a development machine',
  'is not "development"',
  'NODE_ENV says production',
  'not on this machine',
  'does not hold a database called',
  'does not reach the container',
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
      console.log(
        `  FAIL  parser misread the awkward names — ${parsed.length} rows, ${total} total`,
      );
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

  createThrowaway();
  console.log(`  ..    throwaway database ${DATABASE} created`);

  assertNoProjectData();
  cleanup();

  const emptyVolume = volumeIsEmpty();
  let reduced = 0;

  for (const c of cases) {
    cleanup();
    c.setUp?.();

    const result = runGuard({ ...BASE_ENV, ...(c.env ?? {}) }, c.args ?? []);
    const refused = result.code !== 0;

    /*
     * The reduced form. The guard must still refuse — the project data is
     * there and refusing is correct — but it must refuse ONLY because the
     * volume is not empty, having passed all six earlier checks. That is a
     * real assertion: it proves the guard is not simply refusing everything,
     * which is the failure mode dropping this case would hide.
     *
     * It is not the full proof, and the summary says so.
     */
    const isReduced = c.needsEmptyVolume === true && !emptyVolume;
    const wantRefusal = isReduced ? true : c.expect === 'refuse';
    const because = isReduced ? 'The volume is not empty' : c.because;

    const problems: string[] = [];
    if (refused !== wantRefusal) {
      problems.push(
        `expected the guard to ${wantRefusal ? 'refuse' : 'allow'}, but it ${refused ? 'refused' : 'allowed'}`,
      );
    }
    if (!result.output.includes(because)) {
      problems.push(`the output never mentioned "${because}"`);
    }
    if (c.noOverride && !result.output.includes('no override')) {
      problems.push('this refusal must state that there is no override');
    }
    if (isReduced) {
      for (const other of OTHER_REFUSALS) {
        if (result.output.includes(other)) {
          problems.push(`it refused for an unrelated reason as well: "${other}"`);
        }
      }
    }

    if (problems.length === 0 && isReduced) {
      reduced += 1;
      console.log(`  part  ${c.name}`);
      console.log('          the volume holds the project data, so the guard MUST refuse.');
      console.log('          Proved instead: it passed all six earlier checks and refused');
      console.log('          only because the volume is not empty.');
    } else if (problems.length === 0) {
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
  /*
   * The summary says how many cases were FULLY proved, not how many ran. A
   * line reading "all correct" over a run containing a reduced case is the
   * same kind of claim as a total standing in for something it does not
   * measure.
   */
  const full = cases.length - reduced;
  console.log(
    `test:guard — ${MALFORMED.length + 1} parser cases and ${cases.length} guard cases. ` +
      (reduced === 0
        ? 'All fully proved. Nothing was destroyed.'
        : `${full} fully proved, ${reduced} reduced. Nothing was destroyed.`),
  );

  if (reduced > 0) {
    console.log('');
    console.log(`  ${reduced} case ran in REDUCED form, and this is worth reading.`);
    console.log('');
    console.log('  The guard protects the VOLUME, not a database. A throwaway database');
    console.log('  keeps this suite away from the project data — which is what got the');
    console.log('  other cases running again — but it cannot make the volume empty, so');
    console.log('  the guard rightly refuses, and the one case that proves it ever');
    console.log('  ALLOWS a reset cannot be proved on this machine.');
    console.log('');
    console.log('  Fully proving it needs a throwaway CLUSTER: a second compose service');
    console.log('  with its own volume, and db-reset.ts able to be pointed at it. That');
    console.log('  puts a service-selecting override into the most safety-critical');
    console.log("  script in the project, so it is the firm's decision, not this");
    console.log("  suite's. Until then, this case proves six of the seven checks and");
    console.log('  says so rather than reporting a pass it has not earned.');
  }
}

/*
 * The drop runs whether the cases passed, failed, or threw. A suite that
 * leaves a database behind on every failure turns a red run into a growing
 * pile of them.
 */
try {
  main();
} finally {
  dropThrowaway();
}
