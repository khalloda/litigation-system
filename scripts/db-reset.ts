/*
 * Destroys the database and rebuilds it from the migrations.
 *
 *     npm run db:reset
 *
 * This is the most dangerous command in the project. It exists because
 * loading the Access data will be attempted many times before it is right,
 * and each attempt needs a clean database.
 *
 * It refuses to run unless it can prove it is safe. Three checks, in order of
 * how bad the mistake would be:
 *
 *   1. Is this a production environment?  -> refuse. NO OVERRIDE.
 *   2. Is the database somewhere else?    -> refuse. NO OVERRIDE.
 *   3. Does the database contain rows?    -> refuse, listing them.
 *                                            Override: --force-i-know
 *
 * Why check 1 exists, when the brief only asked for 2 and 3: on the Ubuntu
 * server the database runs in a container on that same machine, so its
 * address is localhost there too. A host check alone would let this command
 * run happily against the live system. Check 1 is what actually stands
 * between a tired hand and the firm's case records, so nothing overrides it.
 */

import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';

const OVERRIDE_FLAG = '--force-i-know';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

const override = process.argv.includes(OVERRIDE_FLAG);

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

// ---------------------------------------------------------------------------
//  1. Production. No override, ever.
// ---------------------------------------------------------------------------
const appEnv = process.env['APP_ENV'] ?? '';
const nodeEnv = process.env['NODE_ENV'] ?? '';

if (appEnv === 'production' || nodeEnv === 'production') {
  refuse(
    'This is marked as a production environment.',
    [
      `APP_ENV  = ${appEnv || '(not set)'}`,
      `NODE_ENV = ${nodeEnv || '(not set)'}`,
      '',
      'Resetting production would destroy the firm\'s live case records.',
    ],
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
    [
      `host = ${host}`,
      '',
      'This command only ever runs against a local development database.',
    ],
    false,
  );
}

// ---------------------------------------------------------------------------
//  3. Does it hold anything?
// ---------------------------------------------------------------------------
type TableCount = { table: string; rows: number };

async function countRows(): Promise<TableCount[]> {
  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  try {
    const { rows: tables } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name <> '_prisma_migrations'
       ORDER BY table_name`,
    );

    const counts: TableCount[] = [];
    for (const { table_name } of tables) {
      // An exact count, not an estimate. This decides whether data is
      // destroyed; a statistic that is "usually about right" will not do.
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM "public"."${table_name.replace(/"/g, '""')}"`,
      );
      counts.push({ table: table_name, rows: Number(rows[0]?.n ?? 0) });
    }
    return counts;
  } finally {
    await client.end();
  }
}

async function main() {
  console.log(`Target: ${url.pathname.replace(/^\//, '')} on ${host}:${url.port || '5432'}`);

  let counts: TableCount[];
  try {
    counts = await countRows();
  } catch (error) {
    // Not being able to look is not permission to proceed. Wiping the Docker
    // volume destroys the data whether or not the server is answering.
    refuse(
      'Could not read the database, so it cannot be shown to be empty.',
      [
        describe(error),
        '',
        'Start it first:  npm run db:up',
      ],
      true,
    );
  }

  const occupied = counts.filter((c) => c.rows > 0);
  const total = counts.reduce((sum, c) => sum + c.rows, 0);

  if (counts.length === 0) {
    console.log('Tables: none. Nothing to lose.');
  } else if (occupied.length === 0) {
    console.log(`Tables: ${counts.length}, all empty. Nothing to lose.`);
  } else {
    const width = Math.max(...occupied.map((c) => c.table.length));
    const detail = occupied.map((c) => `${c.table.padEnd(width)}  ${c.rows.toLocaleString()} rows`);
    if (!override) {
      refuse(
        `The database is not empty: ${total.toLocaleString()} rows across ${occupied.length} of ${counts.length} tables.`,
        [...detail, '', 'All of it will be destroyed and cannot be recovered.'],
        true,
      );
    }
    console.log(
      `\nOverride given. Destroying ${total.toLocaleString()} rows across ${occupied.length} tables:`,
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
