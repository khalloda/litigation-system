/*
 * Destroys the database and rebuilds it from the migrations.
 *
 *     npm run db:reset
 *
 * This is the most dangerous command in the project. It exists because
 * loading the Access data will be attempted many times before it is right,
 * and each attempt needs a clean database.
 *
 * ---------------------------------------------------------------------------
 *  WHAT THIS COMMAND ACTUALLY DESTROYS
 * ---------------------------------------------------------------------------
 *
 * `docker compose down -v` removes the whole VOLUME. A volume holds a
 * PostgreSQL cluster, and a cluster holds MANY databases — `litigation`, the
 * built-in `postgres`, and anything else anyone has created in it. Every one
 * of them goes.
 *
 * Three times this guard was written to inspect something ADJACENT to that
 * and each time it was wrong:
 *
 *   1. It counted only the `public` schema, so data staged in `stg` was
 *      invisible and would have been destroyed.
 *   2. It counted whatever DATABASE_URL reached, which might be a different
 *      server entirely, and then deleted this container regardless.
 *   3. It compared the cluster identifier, which fixed (2) — but every
 *      database inside one cluster shares that identifier. Pointing
 *      DATABASE_URL at the empty built-in `postgres` database in this very
 *      container passed every check, and five rows in `litigation` were
 *      destroyed.
 *
 * So the shape is different now. **The container is the authority.** This
 * script asks the container what is inside the volume, enumerates every
 * non-template database in it, and counts every table in every schema of
 * every one of them. DATABASE_URL is no longer trusted to describe what is
 * about to be deleted — it is only checked for agreement.
 *
 * If it cannot enumerate everything it is about to destroy, it refuses.
 *
 * ---------------------------------------------------------------------------
 *  THE CHECKS
 * ---------------------------------------------------------------------------
 *
 *   1. APP_ENV is exactly "development"            no  -> refuse, NO OVERRIDE
 *   2. DATABASE_URL host is on this machine        no  -> refuse, NO OVERRIDE
 *   3. DATABASE_URL names the expected database    no  -> refuse, NO OVERRIDE
 *   4. The container can be enumerated             no  -> refuse, NO OVERRIDE
 *   5. DATABASE_URL reaches that same cluster      no  -> refuse, NO OVERRIDE
 *   6. Every database in the volume is empty       no  -> refuse, --force-i-know
 */

import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';

const OVERRIDE_FLAG = '--force-i-know';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

/*
 * Only this exact value permits a reset. Not "anything that is not
 * production" — a positive, explicit statement that this is a development
 * machine.
 */
const DEVELOPMENT = 'development';

const POSTGRES_USER = process.env['POSTGRES_USER'] ?? 'litigation';
const EXPECTED_DATABASE = process.env['POSTGRES_DB'] ?? 'litigation';

const override = process.argv.includes(OVERRIDE_FLAG);

/*
 * --dry-run runs every check and reports the verdict without destroying
 * anything. It exists so the PASSING path can be tested: without it, the only
 * way to prove the guard lets a legitimate reset through is to perform one,
 * and a test suite that destroys the database to prove it may is not a test
 * suite anybody will run twice.
 */
const dryRun = process.argv.includes('--dry-run');

function refuse(reason: string, detail: string[], overridable: boolean): never {
  console.error('\nREFUSING TO RESET THE DATABASE\n');
  console.error(reason + '\n');
  for (const line of detail) console.error('  ' + line);
  console.error(
    overridable
      ? `\nIf you are certain, run:\n    npm run db:reset -- ${OVERRIDE_FLAG}\n`
      : '\nThere is no override for this. It is deliberate.\n',
  );
  process.exit(1);
}

/*
 * Node's connection failures often arrive as an AggregateError whose own
 * message is empty — one attempt per resolved address. An empty reason on a
 * refusal is useless, so dig the real text out.
 */
function describe(error: unknown): string {
  if (error instanceof AggregateError) {
    const inner = error.errors.map(describe).filter(Boolean);
    if (inner.length > 0) return [...new Set(inner)].join('; ');
  }
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (error.message) return code ? `${error.message} (${code})` : error.message;
    if (code) return code;
    return error.name;
  }
  return String(error);
}

// ---------------------------------------------------------------------------
//  1. Is this explicitly a development machine? Fail closed.
// ---------------------------------------------------------------------------
const appEnv = process.env['APP_ENV'] ?? '';
const nodeEnv = process.env['NODE_ENV'] ?? '';

if (appEnv !== DEVELOPMENT) {
  refuse(
    appEnv === ''
      ? 'APP_ENV is not set, so this machine has not been declared a development machine.'
      : `APP_ENV is "${appEnv}", which is not "${DEVELOPMENT}".`,
    [
      `APP_ENV  = ${appEnv || '(not set)'}`,
      `NODE_ENV = ${nodeEnv || '(not set)'}`,
      '',
      `Only APP_ENV=${DEVELOPMENT} permits a reset. Anything else — unset,`,
      'misspelled, or a name this script does not recognise — is refused,',
      'because a check that cannot tell where it is must assume the worst.',
      '',
      'On a development machine, put APP_ENV=development in .env.',
    ],
    false,
  );
}

if (nodeEnv === 'production') {
  refuse(
    'NODE_ENV says production.',
    ["Resetting production would destroy the firm's live case records."],
    false,
  );
}

// ---------------------------------------------------------------------------
//  2 and 3. Where does DATABASE_URL point, and does it name the right thing?
// ---------------------------------------------------------------------------
const rawUrl = process.env['DATABASE_URL'];
if (!rawUrl) {
  refuse('DATABASE_URL is not set.', ['Copy .env.example to .env — see docs/DATABASE.md.'], false);
}

let url: URL;
try {
  url = new URL(rawUrl);
} catch {
  refuse('DATABASE_URL could not be read as an address.', [rawUrl], false);
}

const host = url.hostname;
if (!LOCAL_HOSTS.includes(host)) {
  refuse(
    'The database is not on this machine.',
    [`host = ${host}`, '', 'This command only ever runs against a local development database.'],
    false,
  );
}

const namedDatabase = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (namedDatabase !== EXPECTED_DATABASE) {
  refuse(
    `DATABASE_URL names the database "${namedDatabase}", not "${EXPECTED_DATABASE}".`,
    [
      `DATABASE_URL names   ${namedDatabase || '(none)'}`,
      `expected             ${EXPECTED_DATABASE}`,
      '',
      'One cluster holds several databases, and this command deletes the whole',
      'volume. A wrong name here means the emptiness check looks at one',
      'database while every database in the volume is destroyed — which is',
      'exactly how five rows were lost during review.',
      '',
      'Fix DATABASE_URL in .env, or set POSTGRES_DB if the name really changed.',
    ],
    false,
  );
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
type TableCount = { database: string; schema: string; table: string; rows: number };

/*
 * Run psql INSIDE the container. `docker compose exec` targets the `db`
 * service in this project's compose file — the same service whose volume the
 * reset removes — so anything this returns belongs to the thing being
 * deleted. That is the whole point: the container is the authority, not
 * DATABASE_URL.
 */
function inContainer(database: string, sql: string): string {
  return execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'db', 'psql', '-U', POSTGRES_USER, '-d', database, '-tAc', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

/*
 * Every database in the cluster except the two templates. `postgres` — the
 * built-in maintenance database — is deliberately included: it is a real
 * database in this volume, and it was the one used to slip past the guard.
 */
function listDatabases(): string[] {
  const out = inContainer(
    'postgres',
    'SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname',
  );
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/*
 * Exact row counts for every table in every non-system schema of one
 * database, in a single round trip.
 *
 * query_to_xml takes its query as text, so the table names do not have to
 * exist when this statement is planned — which is what makes one generic
 * query work against any database.
 */
const COUNT_SQL = `
SELECT t.table_schema || '|' || t.table_name || '|' ||
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I',
                                  t.table_schema, t.table_name),
                           false, true, '')))[1]::text
  FROM information_schema.tables t
 WHERE t.table_type = 'BASE TABLE'
   AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
   AND t.table_schema NOT LIKE 'pg_toast%'
   AND t.table_schema NOT LIKE 'pg_temp%'
   AND NOT (t.table_schema = 'public' AND t.table_name = '_prisma_migrations')
 ORDER BY 1`;

function countDatabase(database: string): TableCount[] {
  const out = inContainer(database, COUNT_SQL);
  if (out === '') return [];
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [schema, table, rows] = line.split('|');
      if (schema === undefined || table === undefined || rows === undefined) {
        throw new Error(`could not read the row count for "${line}" in ${database}`);
      }
      return { database, schema, table, rows: Number(rows) };
    });
}

function clusterIdentifier(): string {
  return inContainer('postgres', 'SELECT system_identifier FROM pg_control_system()');
}

/* What DATABASE_URL actually reaches, for the agreement check. */
async function identifierViaUrl(): Promise<string> {
  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      'SELECT system_identifier::text AS id FROM pg_control_system()',
    );
    return rows[0]?.id ?? '';
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`Target: the volume behind the "db" container (${host}:${url.port || '5432'})`);

  // -------------------------------------------------------------------------
  //  4. Enumerate everything in the volume. Failure here is not permission.
  // -------------------------------------------------------------------------
  let databases: string[];
  let counts: TableCount[];
  let containerIdentifier: string;
  try {
    containerIdentifier = clusterIdentifier();
    databases = listDatabases();
    if (databases.length === 0) {
      throw new Error('the container reported no databases at all');
    }
    counts = databases.flatMap(countDatabase);
  } catch (error) {
    refuse(
      'Could not list what is inside the volume, so it cannot be shown to be empty.',
      [
        describe(error),
        '',
        'This command deletes the whole volume. Not being able to look inside',
        'it is not permission to proceed — the data goes whether or not the',
        'server is answering.',
        '',
        'Start it first:  npm run db:up',
      ],
      false,
    );
  }

  if (!databases.includes(EXPECTED_DATABASE)) {
    refuse(
      `The container does not hold a database called "${EXPECTED_DATABASE}".`,
      [
        `found: ${databases.join(', ')}`,
        '',
        'This is not the volume this project expects. Refusing rather than',
        'guessing which of these to destroy.',
      ],
      false,
    );
  }

  // -------------------------------------------------------------------------
  //  5. Does DATABASE_URL reach this same cluster?
  // -------------------------------------------------------------------------
  let urlIdentifier: string;
  try {
    urlIdentifier = await identifierViaUrl();
  } catch (error) {
    refuse(
      'DATABASE_URL could not be reached, so it cannot be shown to match this container.',
      [describe(error), '', 'Start it first:  npm run db:up'],
      false,
    );
  }

  if (urlIdentifier === '' || containerIdentifier === '' || urlIdentifier !== containerIdentifier) {
    refuse(
      'DATABASE_URL does not reach the container this command would delete.',
      [
        `DATABASE_URL reaches cluster   ${urlIdentifier || '(unknown)'}`,
        `the Docker container holds     ${containerIdentifier || '(unknown)'}`,
        '',
        'These are two different servers. Point DATABASE_URL at the container,',
        'or stop the other server.',
      ],
      false,
    );
  }

  console.log(
    `Volume holds ${databases.length} database(s): ${databases.join(', ')} ` +
      `(cluster ${containerIdentifier}).`,
  );

  // -------------------------------------------------------------------------
  //  6. Is every database in the volume empty?
  // -------------------------------------------------------------------------
  const occupied = counts.filter((c) => c.rows > 0);
  const total = occupied.reduce((sum, c) => sum + c.rows, 0);

  if (counts.length === 0) {
    console.log('No tables in any database. Nothing to lose.');
  } else if (occupied.length === 0) {
    console.log(`Tables: ${counts.length} across ${databases.length} database(s), all empty.`);
  } else {
    const labels = occupied.map((c) => `${c.database}.${c.schema}.${c.table}`);
    const width = Math.max(...labels.map((l) => l.length));
    const detail = occupied.map(
      (c, i) => `${(labels[i] ?? '').padEnd(width)}  ${c.rows.toLocaleString()} rows`,
    );
    const affected = [...new Set(occupied.map((c) => c.database))].join(', ');

    if (!override) {
      refuse(
        `The volume is not empty: ${total.toLocaleString()} rows across ` +
          `${occupied.length} table(s) in database(s) ${affected}.`,
        [
          ...detail,
          '',
          'Deleting the volume destroys every database above, not only the one',
          'DATABASE_URL points at. None of it can be recovered.',
        ],
        true,
      );
    }
    console.log(
      `\nOverride given. Destroying ${total.toLocaleString()} rows ` +
        `across ${occupied.length} table(s) in ${affected}:`,
    );
    for (const line of detail) console.log('  ' + line);
  }

  if (dryRun) {
    console.log('\nDRY RUN — every check passed, so a real run would now destroy');
    console.log(`the volume holding: ${databases.join(', ')}`);
    console.log('Nothing has been changed.');
    return;
  }

  console.log('\nRebuilding…\n');
  const run = (cmd: string, args: string[]) =>
    execFileSync(cmd, args, { stdio: 'inherit', shell: true });

  run('docker', ['compose', 'down', '-v']);
  run('docker', ['compose', 'up', '-d', '--wait']);
  run('npx', ['prisma', 'migrate', 'deploy']);

  console.log('\nDone. The database is empty and rebuilt from the migrations.');
  console.log('Check it with:  npm run db:check');
}

main().catch((error: unknown) => {
  console.error('\nReset failed.\n');
  console.error(describe(error));
  process.exitCode = 1;
});
