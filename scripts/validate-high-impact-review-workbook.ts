/*
 * Task 3.5A — read-only validation of the firm's high-impact workbook.
 *
 *   npm run review:high-impact:validate
 *   npm run review:high-impact:validate -- path/to/review.xlsx
 */

import 'dotenv/config';
import { basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  assertWorkbookArtifactSafety,
  fileSha256,
  HIGH_IMPACT_SHA256_PATH,
  HIGH_IMPACT_WORKBOOK_PATH,
  readHighImpactReviewSnapshot,
  validateHighImpactWorkbook,
} from './lib/high-impact-review-workbook';

async function main(): Promise<void> {
  const path = process.argv[2] ?? HIGH_IMPACT_WORKBOOK_PATH;
  assertWorkbookArtifactSafety(path);
  await withApprovedMigrationClient(async (database) => {
    const snapshot = await readHighImpactReviewSnapshot(database);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const result = validateHighImpactWorkbook(workbook, snapshot);
    const buffer = readFileSync(path);
    const sha = fileSha256(buffer);
    console.log('\nTask 3.5A high-impact review validation (database read-only).');
    console.log(`  workbook         : ${path}`);
    console.log(`  bytes            : ${buffer.length}`);
    console.log(`  current SHA-256  : ${sha}`);
    console.log(`  identity SHA-256 : ${result.identityManifestSha256}`);
    console.log(`  completed        : ${result.completed}`);
    console.log(`  incomplete       : ${result.incomplete}`);
    console.log(`  invalid          : ${result.invalid}`);
    console.log(`  total            : ${result.total}`);
    console.log(`  decision status  : ${result.complete ? 'COMPLETE' : 'INCOMPLETE'}`);
    if (path === HIGH_IMPACT_WORKBOOK_PATH && existsSync(HIGH_IMPACT_SHA256_PATH)) {
      const expectedLine = `${sha}  ${basename(path)}`;
      const actualLine = readFileSync(HIGH_IMPACT_SHA256_PATH, 'utf8').trim();
      console.log(
        `  generation manifest: ${actualLine === expectedLine ? 'matches' : 'differs (expected after firm edits)'}`,
      );
    }
    if (result.issues.length > 0) {
      console.log('\n  First incomplete/invalid rows:');
      result.issues.slice(0, 12).forEach((issue) => console.log(`    ${issue}`));
      if (result.issues.length > 12) console.log(`    … ${result.issues.length - 12} more`);
    }
    console.log('');
    if (result.invalid > 0) process.exitCode = 1;
  });
}

main().catch((error: unknown) => {
  console.error('\nTask 3.5A workbook validation stopped. No database row was changed.\n');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
