/*
 * Runs sql/staging-copy-proof.sql against the database.
 *
 *     npm run test:staging-copy
 *
 * WHY THIS IS A SCRIPT AND NOT A LINE IN db:check
 *
 * `db:check` reads. This one WRITES — into a temp table, inside a
 * transaction that rolls back — because the thing being proved is a
 * behaviour, not a state. No amount of reading `information_schema` tells you
 * whether a bare empty CSV field arrives as NULL. Only a COPY does.
 *
 * The proof runs through psql inside the container, because that is how the
 * load at task 2.3 will run. Proving the property through some other path
 * would prove it about that path instead.
 *
 * The SQL is a committed file rather than a string in here, so the firm's
 * reviewer can read the fixture and the assertions side by side.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PROOF = 'sql/staging-copy-proof.sql';

const sql = readFileSync(PROOF, 'utf8');

/*
 * `-v ON_ERROR_STOP=1` is what makes a failed assertion a failed process. Without
 * it psql reports the error, carries on to the next statement and exits 0 —
 * a test that prints its own failure and calls itself passed.
 */
const result = spawnSync(
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
  ],
  { input: sql, encoding: 'utf8' },
);

if (result.error) {
  console.error(`\ntest:staging-copy — could not run psql: ${result.error.message}`);
  console.error('  Is the database up?  npm run db:up\n');
  process.exit(1);
}

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
console.log(output.trimEnd());

if (result.status !== 0) {
  console.error(`\ntest:staging-copy — FAILED (psql exit ${result.status})\n`);
  process.exit(1);
}

/*
 * A pass has to be positively identified. psql exiting 0 having done nothing
 * — an empty file, a mis-typed path, a transaction that rolled back before
 * reaching the assertions — would otherwise read as success.
 */
const proved = (output.match(/PROVED:/g) ?? []).length;
if (proved !== 3) {
  console.error(
    `\ntest:staging-copy — FAILED: expected 3 PROVED notices, saw ${proved}.\n` +
      '  psql exited 0, but the assertions did not run.\n',
  );
  process.exit(1);
}

console.log('\ntest:staging-copy — CSV values and durable identity agree. 3 proofs.\n');
