/*
 * Stage C — import the firm's complete workbook answers.
 *
 *     npm run review:import -- <workbook.xlsx> [--by "name"]
 *     npm run review:import -- <workbook.xlsx> --dry-run
 *
 * Every answer can span ⬅ الإجابة, ⬅ الشخص and ⬅ ملاحظة. The importer reads
 * all of them. Future workbooks carry a very-hidden identity contract with
 * the extraction fingerprint and the durable source-record identity. The
 * exact authoritative 23 August workbook is accepted through a one-file
 * compatibility contract identified by its SHA-256; no other identity-less
 * workbook is accepted.
 *
 * Parsing, sheet completeness, identities, source values and fingerprints
 * are all validated before the first update. Every update then runs in one
 * database transaction. A fault on the last row rolls back the first 743.
 */

import 'dotenv/config';
import ExcelJS from 'exceljs';
import { migrationDb as db, migrationPrincipalReady } from './lib/migration-db';
import {
  parseReviewWorkbook,
  workbookSha256,
  WorkbookContractError,
} from './lib/review-workbook-contract';
import { importReviewAnswers } from './lib/import-review-answers';

function stop(message: string): never {
  throw new WorkbookContractError(message);
}

async function main() {
  await migrationPrincipalReady;
  const path = process.argv[2];
  if (path === undefined || path.startsWith('--')) {
    stop('no workbook given.\n  npm run review:import -- <workbook.xlsx> [--by "name"]');
  }
  const byIndex = process.argv.indexOf('--by');
  const answeredBy = byIndex > 0 ? (process.argv[byIndex + 1] ?? 'the firm') : 'the firm';
  const dryRun = process.argv.includes('--dry-run');

  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path);
  const parsed = parseReviewWorkbook(book, workbookSha256(path));

  const result = await importReviewAnswers(db, parsed, answeredBy, { dryRun });

  console.log(`\nreview:import — ${path}`);
  console.log(`  contract       : ${parsed.format}`);
  console.log(`  extraction     : ${parsed.extractionSha256}`);
  console.log(`  expected rows  : ${result.totalRows}`);
  console.log(`  answers ${dryRun ? 'validated' : 'loaded'} : ${result.answered}`);
  console.log(`  blank rows     : ${result.blank}`);
  if (result.movedFindings > 0) {
    console.log(
      `  moved findings : ${result.movedFindings} matched by durable identity, not CSV position`,
    );
  }
  if (result.incomplete.length > 0) {
    console.log(`\n  ${result.incomplete.length} ANSWER(S) INTENTIONALLY NAME NO PERSON:`);
    for (const row of result.incomplete) {
      console.log(`      ${row.sheet} row ${row.rowNumber}: ${row.answer}`);
    }
    console.log('  Stored exactly as written. Nothing was inferred.');
  }
  if (dryRun) console.log('\n  DRY RUN — no database row was changed.');

  const open = await db.$queryRaw<{ value: string }[]>`
    SELECT value FROM quarantine.review_value
     WHERE answered_at IS NULL AND topic = 'open_question' ORDER BY id`;
  if (open.length > 0) {
    console.log(`\n  ${open.length} QUESTION(S) ADDED AFTER THIS WORKBOOK:`);
    for (const question of open) console.log(`      ${question.value}`);
  }
  console.log('');
}

main()
  .catch((error: unknown) => {
    console.error('\nreview:import — STOPPED; the transaction was rolled back.\n');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
