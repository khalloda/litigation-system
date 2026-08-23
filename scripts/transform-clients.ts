/*
 * Stage D — transform clients and contacts (task 2.5).
 *
 *     npm run transform:clients
 *
 * The work is in sql/transform-clients-contacts.sql, a committed file, so the
 * reviewer can read every mapping beside its assertion. This wrapper runs it
 * and refuses to believe a silent success.
 */

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TRANSFORM = 'sql/transform-clients-contacts.sql';
const EXPECTED_PROOFS = 7;

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
    '-q',
  ],
  { input: readFileSync(TRANSFORM, 'utf8'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

if (result.error) {
  console.error(`\ntransform:clients — could not run psql: ${result.error.message}`);
  console.error('  Is the database up?  npm run db:up\n');
  process.exit(1);
}

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
console.log(
  output
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => l.replace(/^NOTICE: {2}/, ''))
    .join('\n'),
);

if (result.status !== 0) {
  console.error('\nTRANSFORM FAILED — the transaction rolled back. The tables are unchanged.\n');
  process.exit(1);
}

/*
 * A test must fail when it is REMOVED, not only when it is wrong
 * (docs/MIGRATION.md). psql exits 0 for a script whose assertions never ran.
 */
const proved = (output.match(/PROVED:/g) ?? []).length;
if (proved !== EXPECTED_PROOFS) {
  console.error(
    `\nTRANSFORM INCONCLUSIVE: expected ${EXPECTED_PROOFS} PROVED notices, saw ${proved}.\n` +
      '  psql exited 0, but the checks did not all run.\n',
  );
  process.exit(1);
}

console.log('\nCLIENTS AND CONTACTS TRANSFORMED — every staged row arrived.\n');
