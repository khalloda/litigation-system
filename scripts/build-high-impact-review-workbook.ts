/*
 * Task 3.5A — create the firm's unanswered high-impact quarantine workbook.
 *
 *   npm run review:high-impact:build
 *
 * Database work is one repeatable-read, read-only snapshot. The XLSX and its
 * checksum manifest are raw review artifacts under the ignored _migration/
 * tree; neither may enter Git.
 */

import 'dotenv/config';
import { basename, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  assertWorkbookArtifactSafety,
  buildHighImpactWorkbook,
  fileSha256,
  HIGH_IMPACT_SHA256_PATH,
  HIGH_IMPACT_WORKBOOK_PATH,
  HighImpactWorkbookError,
  readHighImpactReviewSnapshot,
  validateHighImpactWorkbook,
} from './lib/high-impact-review-workbook';

async function main(): Promise<void> {
  assertWorkbookArtifactSafety(HIGH_IMPACT_WORKBOOK_PATH);
  assertWorkbookArtifactSafety(HIGH_IMPACT_SHA256_PATH);

  await withApprovedMigrationClient(async (database) => {
    const snapshot = await readHighImpactReviewSnapshot(database);
    if (existsSync(HIGH_IMPACT_WORKBOOK_PATH)) {
      const existing = new ExcelJS.Workbook();
      await existing.xlsx.readFile(HIGH_IMPACT_WORKBOOK_PATH);
      const existingResult = validateHighImpactWorkbook(existing, snapshot);
      if (existingResult.answered > 0) {
        throw new HighImpactWorkbookError(
          'the existing workbook contains firm input; refusing to overwrite it',
        );
      }
    }

    const built = await buildHighImpactWorkbook(snapshot);
    mkdirSync(dirname(HIGH_IMPACT_WORKBOOK_PATH), { recursive: true });
    await built.workbook.xlsx.writeFile(HIGH_IMPACT_WORKBOOK_PATH);

    const roundTrip = new ExcelJS.Workbook();
    await roundTrip.xlsx.readFile(HIGH_IMPACT_WORKBOOK_PATH);
    const validation = validateHighImpactWorkbook(roundTrip, snapshot);
    if (
      validation.total !== 382 ||
      validation.answered !== 0 ||
      validation.completed !== 0 ||
      validation.incomplete !== 382 ||
      validation.invalid !== 0 ||
      validation.complete
    ) {
      throw new HighImpactWorkbookError(
        'the unanswered workbook did not round-trip as 382 valid incomplete decisions',
      );
    }

    const workbookBuffer = readFileSync(HIGH_IMPACT_WORKBOOK_PATH);
    const workbookSha256 = fileSha256(workbookBuffer);
    writeFileSync(
      HIGH_IMPACT_SHA256_PATH,
      `${workbookSha256}  ${basename(HIGH_IMPACT_WORKBOOK_PATH)}\n`,
      'utf8',
    );
    const manifestLine = readFileSync(HIGH_IMPACT_SHA256_PATH, 'utf8').trim();
    if (manifestLine !== `${workbookSha256}  ${basename(HIGH_IMPACT_WORKBOOK_PATH)}`) {
      throw new HighImpactWorkbookError('the adjacent SHA-256 manifest did not round-trip');
    }
    assertWorkbookArtifactSafety(HIGH_IMPACT_WORKBOOK_PATH);
    assertWorkbookArtifactSafety(HIGH_IMPACT_SHA256_PATH);

    console.log('\nTask 3.5A high-impact review package created (database read-only).');
    console.log(`  workbook              : ${HIGH_IMPACT_WORKBOOK_PATH}`);
    console.log(`  bytes                 : ${workbookBuffer.length}`);
    console.log(`  workbook SHA-256      : ${workbookSha256}`);
    console.log(`  identity SHA-256      : ${built.identityManifestSha256}`);
    console.log(`  lookup manifest SHA-256: ${built.lookupManifestSha256}`);
    console.log('  visible rows          : 14 + 41 matters; 313 + 14 hearings');
    console.log('  review status         : 0 complete, 382 incomplete, 0 invalid');
    console.log(`  checksum manifest     : ${HIGH_IMPACT_SHA256_PATH}\n`);
  });
}

main().catch((error: unknown) => {
  console.error('\nTask 3.5A workbook generation stopped. No database row was changed.\n');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
