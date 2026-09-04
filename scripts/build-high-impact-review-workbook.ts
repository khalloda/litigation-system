/*
 * Task 3.5A — create the versioned D39 client-review successor, never overwrite.
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
  HISTORICAL_WORKBOOK_PATH,
  HighImpactWorkbookError,
  readHighImpactReviewSnapshot,
  readHistoricalClientSelection,
  populateD39WorkbookAnswers,
  validateHighImpactWorkbook,
} from './lib/high-impact-review-workbook';

async function main(): Promise<void> {
  assertWorkbookArtifactSafety(HIGH_IMPACT_WORKBOOK_PATH);
  assertWorkbookArtifactSafety(HIGH_IMPACT_SHA256_PATH);
  if (existsSync(HIGH_IMPACT_WORKBOOK_PATH) || existsSync(HIGH_IMPACT_SHA256_PATH)) {
    throw new HighImpactWorkbookError(
      'successor workbook or manifest already exists; refusing to overwrite either',
    );
  }
  assertWorkbookArtifactSafety(HISTORICAL_WORKBOOK_PATH);
  const historicalBytes = readFileSync(HISTORICAL_WORKBOOK_PATH);

  await withApprovedMigrationClient(
    async (database) => {
      const snapshot = await readHighImpactReviewSnapshot(database);
      const transferred = await readHistoricalClientSelection(historicalBytes, snapshot);
      const built = await buildHighImpactWorkbook(snapshot);
      const populated = populateD39WorkbookAnswers(built.workbook, snapshot, transferred);
      const workbookBuffer = Buffer.from(await built.workbook.xlsx.writeBuffer());

      const roundTrip = new ExcelJS.Workbook();
      await roundTrip.xlsx.load(workbookBuffer as never);
      const validation = validateHighImpactWorkbook(roundTrip, snapshot);
      if (
        validation.total !== 382 ||
        validation.answered !== 175 ||
        validation.completed !== 175 ||
        validation.incomplete !== 207 ||
        validation.invalid !== 0 ||
        validation.complete
      ) {
        throw new HighImpactWorkbookError(
          'the D39 successor did not round-trip as 175 complete, 207 incomplete and zero invalid',
        );
      }

      const workbookSha256 = fileSha256(workbookBuffer);
      if (!readFileSync(HISTORICAL_WORKBOOK_PATH).equals(historicalBytes))
        throw new HighImpactWorkbookError('historical workbook changed during generation');
      mkdirSync(dirname(HIGH_IMPACT_WORKBOOK_PATH), { recursive: true });
      writeFileSync(HIGH_IMPACT_WORKBOOK_PATH, workbookBuffer, { flag: 'wx' });
      writeFileSync(
        HIGH_IMPACT_SHA256_PATH,
        `${workbookSha256}  ${basename(HIGH_IMPACT_WORKBOOK_PATH)}\n`,
        { encoding: 'utf8', flag: 'wx' },
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
      console.log('  review status         : 175 complete, 207 incomplete, 0 invalid');
      console.log(`  D39 matters/hearings   : ${populated.matters.length}/${populated.hearings}`);
      console.log(
        `  transferred identity  : ${transferred.reviewId}; protected client ${transferred.clientId}`,
      );
      console.log(`  checksum manifest     : ${HIGH_IMPACT_SHA256_PATH}\n`);
    },
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
}

main().catch((error: unknown) => {
  console.error('\nTask 3.5A workbook generation stopped. No database row was changed.\n');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
