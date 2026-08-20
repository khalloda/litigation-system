/*
 * Destroys the database and rebuilds it from the migrations.
 *
 *     npm run db:reset
 *
 * This is the most dangerous command in the project. It exists because
 * loading the Access data will be attempted many times before it is right,
 * and each attempt needs a clean database.
 *
 * It refuses to run unless it can PROVE it is safe. Four checks, in order of
 * how bad the mistake would be:
 *
 *   1. Is this environment explicitly marked development?  no  -> refuse
 *   2. Is the database address on this machine?            no  -> refuse
 *   3. Is it the very database this command will delete?   no  -> refuse
 *   4. Does ANY schema hold rows?                          yes -> refuse
 *
 * Checks 1 to 3 have NO override. Check 4 has one, and it must be typed by
 * hand every time — never placed in a script.
 *
 * Three of these exist because of failures found in review, and each was a
 * gap in a check that already looked complete:
 *
 *   Check 1 used to refuse only when APP_ENV said "production", so an unset,
 *   misspelled or unfamiliar value sailed straight through. A safety check
 *   must fail closed: if it cannot tell where it is, it refuses.
 *
 *   Check 3 exists because counting rows in one database and then deleting
 *   the volume of another is not a check at all. It compares the PostgreSQL
 *   system identifier seen through DATABASE_URL against the one inside the
 *   container whose volume is about to be removed.
 *
 *   Check 4 used to count only the `public` schema. From Stage 2 onward every
 *   extracted Access row lands in `stg` and every quarantined value in `qc`.
 *   `public` would have been empty, the guard would have said proceed, and
 *   `docker compose down -v` would have destroyed the entire extraction —
 *   the exact disaster this command exists to prevent, at the exact moment it
 *   matters most. It now counts every non-system schema.
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

/* Schemas PostgreSQL owns. Everything else is ours, and must be counted. */
const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast'];

const override = process.argv.includes(OVERRIDE_FLAG);

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
//  2. Where is this database?
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

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
type TableCount = { schema: string; table: string; rows: number };

function quote(identifier: string): string {
  return '"' + identifier.replace(/"/g, '""') + '"';
}

/*
 * The container's own view of itself. `docker compose exec` targets the `db`
 * service in this project's compose file — the same service whose volume the
 * reset removes — so whatever this returns belongs to the thing being
 * deleted.
 */
function containerSystemIdentifier(): string {
  return execFileSync(
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
      '-tAc',
      'SELECT system_identifier FROM pg_control_system()',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

async function inspect(): Promise<{ identifier: string; counts: TableCount[] }> {
  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  try {
    const { rows: control } = await client.query<{ id: string }>(
      'SELECT system_identifier::text AS id FROM pg_control_system()',
    );
    const identifier = control[0]?.id ?? '';

    /*
     * EVERY non-system schema, not only `public`. From Stage 2 the extracted
     * Access data lives in `stg` and the quarantine in `qc`; counting only
     * `public` would report an empty database while holding the extraction.
     *
     * `_prisma_migrations` is excluded because it is Prisma's own bookkeeping,
     * not data — it always holds rows once a migration has run.
     */
    const { rows: tables } = await client.query<{ schema: string; table: string }>(
      `SELECT table_schema AS schema, table_name AS table
         FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_schema <> ALL ($1::text[])
          AND table_schema NOT LIKE 'pg_temp%'
          AND table_schema NOT LIKE 'pg_toast%'
          AND NOT (table_schema = 'public' AND table_name = '_prisma_migrations')
        ORDER BY table_schema, table_name`,
      [SYSTEM_SCHEMAS],
    );

    const counts: TableCount[] = [];
    for (const { schema, table } of tables) {
      /*
       * An exact count, never an estimate. This decides whether data is
       * destroyed; a statistic that is "usually about right" will not do.
       */
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${quote(schema)}.${quote(table)}`,
      );
      counts.push({ schema, table, rows: Number(rows[0]?.n ?? 0) });
    }
    return { identifier, counts };
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
async function main() {
  const database = url.pathname.replace(/^\//, '');
  console.log(`Target: ${database} on ${host}:${url.port || '5432'}`);

  let identifier: string;
  let counts: TableCount[];
  try {
    ({ identifier, counts } = await inspect());
  } catch (error) {
    /*
     * Not being able to look is not permission to proceed. Removing the
     * Docker volume destroys the data whether or not the server is answering.
     */
    refuse(
      'Could not read the database, so it cannot be shown to be empty.',
      [describe(error), '', 'Start it first:  npm run db:up'],
      true,
    );
  }

  // -------------------------------------------------------------------------
  //  3. Is the database just inspected the one whose volume will be deleted?
  // -------------------------------------------------------------------------
  let containerIdentifier: string;
  try {
    containerIdentifier = containerSystemIdentifier();
  } catch (error) {
    refuse(
      'Could not reach the Docker container to confirm which database it holds.',
      [describe(error), '', 'Start it first:  npm run db:up'],
      false,
    );
  }

  if (identifier === '' || containerIdentifier === '' || identifier !== containerIdentifier) {
    refuse(
      'DATABASE_URL does not point at the container this command would delete.',
      [
        `DATABASE_URL reaches database   ${identifier || '(unknown)'}`,
        `the Docker container holds      ${containerIdentifier || '(unknown)'}`,
        '',
        'These are two different servers. This command would count rows in one',
        'and destroy the other, so it would report "empty" and then delete real',
        'data. Point DATABASE_URL at the container, or stop the other server.',
      ],
      false,
    );
  }
  console.log(`Confirmed: this is the container's own database (id ${identifier}).`);

  // -------------------------------------------------------------------------
  //  4. Does anything hold rows, in any schema?
  // -------------------------------------------------------------------------
  const occupied = counts.filter((c) => c.rows > 0);
  const total = occupied.reduce((sum, c) => sum + c.rows, 0);
  const schemas = [...new Set(counts.map((c) => c.schema))];

  if (counts.length === 0) {
    console.log('Tables: none. Nothing to lose.');
  } else if (occupied.length === 0) {
    console.log(
      `Tables: ${counts.length} across ${schemas.length} schema(s) ` +
        `(${schemas.join(', ')}), all empty.`,
    );
  } else {
    const labels = occupied.map((c) => `${c.schema}.${c.table}`);
    const width = Math.max(...labels.map((l) => l.length));
    const detail = occupied.map(
      (c, i) => `${(labels[i] ?? '').padEnd(width)}  ${c.rows.toLocaleString()} rows`,
    );
    const occupiedSchemas = [...new Set(occupied.map((c) => c.schema))].join(', ');

    if (!override) {
      refuse(
        `The database is not empty: ${total.toLocaleString()} rows across ` +
          `${occupied.length} of ${counts.length} tables, in schema(s) ${occupiedSchemas}.`,
        [...detail, '', 'All of it will be destroyed and cannot be recovered.'],
        true,
      );
    }
    console.log(
      `\nOverride given. Destroying ${total.toLocaleString()} rows ` +
        `across ${occupied.length} tables:`,
    );
    for (const line of detail) console.log('  ' + line);
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
