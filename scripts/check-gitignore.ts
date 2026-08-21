/*
 * Proves that .gitignore blocks the files that must never enter the
 * repository, and does NOT block the files that must.
 *
 *     npm run check:gitignore        (also part of npm run check)
 *
 * Why this is a test and not a one-off inspection: .gitignore is edited
 * casually, a single mistyped line silently stops protecting a whole class of
 * file, and nothing complains until the damage is done and permanent.
 *
 * The reason for the rule changed during Stage 0 and is worth stating, since
 * it affects how strictly to hold the line. The firm has decided this data is
 * not confidential. The rule stands anyway, on OPERATIONAL grounds: git keeps
 * every version of every file for ever. The Access database is 46 MB
 * compacted. Commit it once and the repository carries it permanently —
 * deleting it later does not shrink the history, and every clone from then on
 * pays for it.
 */

import { execFileSync } from 'node:child_process';

/* Must be refused by .gitignore. */
const MUST_BE_IGNORED = [
  // Microsoft Access, in every form it takes
  'litigation.accdb',
  'backup/Database.mdb',
  'Database.laccdb',
  'compiled.accde',
  'compiled.mde',

  // Extracted data
  '_migration/tables/العملاء.csv',
  'analysis/hearings.csv',
  'export.tsv',
  '_migration/attachments/logo_001.png',
  'attachments/x.bin',
  'staging/load.csv',

  // Spreadsheets, including the macro and binary variants
  'reports/invoices.xlsx',
  'old/clients.xls',
  'macros/tracker.xlsm',
  'big/data.xlsb',
  'open/office.ods',

  // Other databases
  'scratch.sqlite',
  'scratch.sqlite3',
  'local.db',

  // Archives — an excluded file smuggled past the rules by compression
  'export.zip',
  'export.7z',
  'export.rar',
  'export.tar',
  'dump.gz',
  'dump.tgz',
  'dump/pg.sql.gz',
  'backups/db.dump',
  'snapshot.bak',

  // Printed reports and scans
  'report.pdf',
  'docs/report-samples/تقرير عميل.pdf',
  'out/بيان بموقف العميل.pdf',

  // Client logos and uploads
  'uploads/client-logos/12/logo.png',
  'storage/a.png',
  'media/b.jpg',

  // Secrets
  '.env',
  '.env.local',
  '.env.production',
  'server.pem',
  'id_rsa.key',
  'cert.p12',
  'credentials.json',
  'secrets.json',

  // Build output and generated code
  'node_modules/next/package.json',
  '.next/build.json',
  'next-env.d.ts',
  'src/generated/prisma/client.ts',
  'postgres-data/base/1',
  'pgdata/x',

  /*
   * UPPERCASE AND MIXED CASE.
   *
   * Every one of these was committable on a case-sensitive checkout while the
   * lowercase versions above were correctly blocked. Windows hid it.
   */
  'macros/TRACKER.XLSM',
  'exports/CLIENTS.XLSX',
  'exports/Clients.Csv',
  'legacy/DATABASE.ACCDB',
  'legacy/Database.AccDb',
  'legacy/OLD.MDB',
  'archive/EXPORT.ZIP',
  'archive/EXPORT.7Z',
  'archive/BACKUP.TGZ',
  'archive/Backup.Tar',
  'scratch/LOCAL.SQLITE',
  'scratch/Local.Sqlite3',
  'scratch/DATA.DB',
  'reports/STATEMENT.PDF',
  'dump/SNAPSHOT.BAK',
  'keys/SERVER.PEM',
  'keys/Server.Key',
];

/* Must NOT be blocked — the repository would be useless without these. */
const MUST_BE_TRACKABLE = [
  'src/app/page.tsx',
  'src/strings.ts',
  'docs/PRD.md',
  'docs/DATABASE.md',
  'sql/lookups-and-crosswalk.sql',
  'prisma/schema.prisma',
  'prisma/migrations/20260820121223_x/migration.sql',
  'scripts/01_extract_access.ps1',
  'assets/logo.png',
  'public/fonts/noto-naskh-arabic-arabic-wght-normal.woff2',
  'public/fonts/LICENSE-Noto-Naskh-Arabic.txt',
  '.env.example',
  'package.json',
  'docker-compose.yml',
];

/*
 * -c core.ignorecase=false is the whole point of this function.
 *
 * Windows treats FILE.XLSM and file.xlsm as the same name, so a
 * lowercase-only .gitignore rule LOOKS correct on this machine. The Ubuntu
 * server is case-sensitive, and there .XLSM, .ZIP, .SQLITE and .TGZ were all
 * committable while this check reported everything blocked.
 *
 * Forcing case sensitivity here means the check answers the question that
 * matters — "would this be blocked on the server?" — rather than the easier
 * one this laptop happens to ask.
 */
function isIgnored(path: string): boolean {
  try {
    execFileSync('git', ['-c', 'core.ignorecase=false', 'check-ignore', '-q', '--', path], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const failures: string[] = [];

for (const path of MUST_BE_IGNORED) {
  if (!isIgnored(path)) failures.push(`  NOT IGNORED but must be:  ${path}`);
}
for (const path of MUST_BE_TRACKABLE) {
  if (isIgnored(path)) failures.push(`  IGNORED but must not be:  ${path}`);
}

/*
 * Belt and braces: nothing of the dangerous kind may already be committed.
 * check-ignore says what WOULD happen; this says what HAS happened.
 */
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const bannedExtension = /\.(csv|tsv|xlsx?|xlsm|xlsb|ods|accdb|mdb|accde|mde|pdf|sqlite3?|db|zip|7z|rar|tar|gz|tgz|bak|dump|pem|key|p12)$/i;
const committed = tracked.filter((f) => bannedExtension.test(f) || f === '.env');

for (const file of committed) {
  failures.push(`  ALREADY COMMITTED:        ${file}`);
}

if (failures.length > 0) {
  console.error(`\ncheck:gitignore found ${failures.length} problem(s):\n`);
  for (const line of failures) console.error(line);
  console.error('');
  process.exitCode = 1;
} else {
  console.log(
    `check:gitignore — ${MUST_BE_IGNORED.length} blocked, ` +
      `${MUST_BE_TRACKABLE.length} trackable, ${tracked.length} files committed, none banned.`,
  );
}
