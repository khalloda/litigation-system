/*
 * Stage C — profile the staged data, then Gate 3.
 *
 *     npm run profile:staging
 *
 * The work is in sql/profile-staging.sql, a committed file, so the firm's
 * reviewer can read every check and every wording beside the assertions. This
 * wrapper runs it and refuses to believe a silent success.
 *
 * SAFE TO RE-RUN. Findings are derived and rebuilt; the firm's own answers in
 * quarantine.review_value are upserted around and never touched.
 */

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PROFILE = 'sql/profile-staging.sql';
const EXPECTED_PROOFS = 5;

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
  { input: readFileSync(PROFILE, 'utf8'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

if (result.error) {
  console.error(`\nprofile:staging — could not run psql: ${result.error.message}`);
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
  console.error('\nGATE 3 FAILED — the transaction rolled back. Nothing was written.\n');
  process.exit(1);
}

/*
 * A test must fail when it is REMOVED, not only when it is wrong
 * (docs/MIGRATION.md). psql exits 0 for a script whose assertions never ran.
 */
const proved = (output.match(/PROVED:/g) ?? []).length;
if (proved !== EXPECTED_PROOFS) {
  console.error(
    `\nGATE 3 INCONCLUSIVE: expected ${EXPECTED_PROOFS} PROVED notices, saw ${proved}.\n` +
      '  psql exited 0, but the checks did not all run.\n',
  );
  process.exit(1);
}

console.log('\nGATE 3 PASSED — every staged row is in exactly one state.\n');
