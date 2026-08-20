/*
 * Guards the file encodings that Arabic depends on.
 *
 *     npm run check:encoding        (also part of npm run check)
 *
 * Two rules, both learned the hard way:
 *
 *   1. Every PowerShell script must be UTF-8 WITH a byte-order mark.
 *
 *      Windows PowerShell 5.1 — the version that ships with Windows, and the
 *      one that has to be used for Access COM interop — reads a .ps1 without
 *      a BOM as Windows-1252. Every Arabic table name in the extraction
 *      script is then corrupted. This was real: before the BOM was added,
 *      01_extract_access.ps1 would not even parse under 5.1, and the failure
 *      mode had it parsed would have been worse — table names not matching,
 *      tables silently skipped, and a "successful" extraction missing whole
 *      tables.
 *
 *   2. Every other source file must be UTF-8 WITHOUT a BOM.
 *
 *      A BOM at the start of a .sql file becomes part of the first statement.
 *      In .ts and .css it can appear as a stray character. PostgreSQL COPY in
 *      particular does not want one.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', '.next', '.git', 'out', 'build', 'generated', 'coverage']);

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/* Must have a BOM. */
const NEEDS_BOM = /\.ps1$/;

/* Must not have one. */
const NEEDS_NO_BOM = /\.(ts|tsx|css|scss|sql|json|md|mjs|yml|yaml)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (SKIP.has(name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const problems: string[] = [];
let checked = 0;

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join('/');
  if (!NEEDS_BOM.test(rel) && !NEEDS_NO_BOM.test(rel)) continue;

  const buf = readFileSync(file);
  const hasBom = buf.subarray(0, 3).equals(BOM);
  checked += 1;

  if (NEEDS_BOM.test(rel) && !hasBom) {
    problems.push(
      `  ${rel}\n` +
        '    missing the UTF-8 byte-order mark. Windows PowerShell 5.1 will read\n' +
        '    the Arabic in this file as Windows-1252 and corrupt every table name.',
    );
  }

  if (NEEDS_NO_BOM.test(rel) && hasBom) {
    problems.push(
      `  ${rel}\n` +
        '    has a UTF-8 byte-order mark and should not. It becomes a stray\n' +
        '    character in the first line of the file.',
    );
  }

  /*
   * Whatever the BOM situation, the bytes must be valid UTF-8. Decoding and
   * re-encoding is lossless only if they were.
   */
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf)) {
    problems.push(`  ${rel}\n    is not valid UTF-8. Arabic will not survive.`);
  }
}

if (problems.length > 0) {
  console.error(`\ncheck:encoding found ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(p + '\n');
  process.exitCode = 1;
} else {
  console.log(`check:encoding — ${checked} files, all correctly encoded.`);
}
