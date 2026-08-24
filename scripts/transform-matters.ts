/*
 * Stage D — transform matters (task 2.6).
 *
 *     npm run transform:matters
 *
 * The committed SQL performs one serializable transaction. It either writes
 * every staged matter to public.matters/quarantine.matter_transform and proves
 * the result, or rolls the whole operation back.
 */

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TRANSFORM = 'sql/transform-matters.sql';
const EXPECTED_PROOFS = 12;

export function runMatterTransform(
  options: {
    database?: string;
    forceFailure?: boolean;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const env = options.env ?? process.env;
  const result = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      env['POSTGRES_USER'] ?? 'litigation',
      '-d',
      options.database ?? env['POSTGRES_DB'] ?? 'litigation',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      `force_failure=${options.forceFailure === true ? '1' : '0'}`,
      '-q',
    ],
    {
      input: readFileSync(TRANSFORM, 'utf8'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env,
    },
  );

  if (result.error) {
    throw new Error(`could not run psql: ${result.error.message}`, { cause: result.error });
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const proved = (output.match(/PROVED:/g) ?? []).length;
  return { status: result.status, output, proved };
}

function main() {
  const result = runMatterTransform();
  console.log(
    result.output
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.replace(/^NOTICE: {2}/, ''))
      .join('\n'),
  );

  if (result.status !== 0) {
    console.error('\nTRANSFORM FAILED — the transaction rolled back. The tables are unchanged.\n');
    process.exit(1);
  }

  if (result.proved !== EXPECTED_PROOFS) {
    console.error(
      `\nTRANSFORM INCONCLUSIVE: expected ${EXPECTED_PROOFS} PROVED notices, ` +
        `saw ${result.proved}.\n  psql exited 0, but the checks did not all run.\n`,
    );
    process.exit(1);
  }

  console.log('\nMATTERS TRANSFORMED — every staged row is transformed or quarantined.\n');
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/transform-matters.ts')) main();
