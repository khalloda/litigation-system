/*
 * Proves the application can actually reach the database and that the
 * database is in the state the application expects.
 *
 *     npm run db:check
 *
 * Every line must read OK. This exists because "the container is running" and
 * "the application can use the database" are different claims, and only the
 * second one matters.
 */

import 'dotenv/config';
import { db } from '../src/lib/db';

type Check = { name: string; expected: string; actual: string; ok: boolean };

const checks: Check[] = [];

function record(name: string, expected: string, actual: string, ok: boolean) {
  checks.push({ name, expected, actual, ok });
}

/*
 * A query that returns nothing is a failure, not an empty value to shrug at.
 * Say so here rather than letting an undefined travel onwards.
 */
function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${what}: the database returned no rows`);
  }
  return row;
}

async function main() {
  // 1. Can we connect at all?
  const { version } = one(
    await db.$queryRaw<{ version: string }[]>`
      SELECT current_setting('server_version') AS version`,
    'server version',
  );
  const major = Number(version.split('.')[0]);
  record('Connects to PostgreSQL', '16 or newer', version, major >= 16);

  // 2. Did migration 0001 run?
  const { count: migrations } = one(
    await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    'migration count',
  );
  record('Migrations applied', 'at least 1', String(migrations), migrations >= 1n);

  // 3. Extensions, from migration 0001.
  const extensions = await db.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension
    WHERE extname IN ('pg_trgm', 'btree_gin', 'unaccent') ORDER BY extname`;
  record(
    'Search extensions',
    'btree_gin, pg_trgm, unaccent',
    extensions.map((e) => e.extname).join(', ') || '(none)',
    extensions.length === 3,
  );

  // 4. Arabic must survive the round trip through the driver, not only
  //    through psql. A wrong client encoding shows up here and nowhere else.
  const arabic = 'الدعاوى والجلسات والتوكيلات';
  const { echoed } = one(
    await db.$queryRaw<{ echoed: string }[]>`SELECT ${arabic}::text AS echoed`,
    'Arabic round trip',
  );
  record('Arabic survives the driver', arabic, echoed, echoed === arabic);

  // 5. The collation must SORT correctly, not merely exist. أحمد and احمد are
  //    the same name, one written without the hamza; they must sit together,
  //    both before بسام.
  const sorted = await db.$queryRaw<{ word: string }[]>`
    SELECT word FROM unnest(ARRAY['بسام', 'احمد', 'أحمد']) AS word
    ORDER BY word COLLATE "arabic"`;
  const order = sorted.map((r) => r.word);
  record('Arabic sorts correctly', '… ,… ,بسام last', order.join(' '), order[2] === 'بسام');

  // ---- report --------------------------------------------------------------
  const width = Math.max(...checks.map((c) => c.name.length));
  for (const c of checks) {
    console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name.padEnd(width)}  ${c.actual}`);
    if (!c.ok) console.log(`      ${''.padEnd(width)}  expected: ${c.expected}`);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} of ${checks.length} checks failed.`);
    console.error('If the database is empty, run: npm run db:migrate');
    process.exitCode = 1;
    return;
  }
  console.log(`\nAll ${checks.length} checks passed.`);
}

main()
  .catch((error: unknown) => {
    console.error('\nCould not check the database.\n');
    console.error(error instanceof Error ? error.message : error);
    console.error('\nIs it running?  npm run db:up');
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
