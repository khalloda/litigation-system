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
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
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
  integrateD40OwnerAnswers,
} from './lib/high-impact-review-workbook';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    if (args.length !== 4 || args[0] !== '--owner' || args[2] !== '--output')
      throw new HighImpactWorkbookError(
        'usage: --owner immutable-owner.xlsx --output external-successor.xlsx',
      );
    const input = resolve(args[1]!);
    const output = resolve(args[3]!);
    const relativeOutput = relative(process.cwd(), output);
    if (!(isAbsolute(relativeOutput) || relativeOutput.startsWith(`..${sep}`)))
      throw new HighImpactWorkbookError('D40 successor must be outside the repository');
    const manifest = `${output}.sha256`;
    assertWorkbookArtifactSafety(input);
    assertWorkbookArtifactSafety(output);
    assertWorkbookArtifactSafety(manifest);
    if (existsSync(output) || existsSync(manifest))
      throw new HighImpactWorkbookError(
        'D40 successor or manifest already exists; refusing overwrite',
      );
    const ownerBytes = readFileSync(input);
    await withApprovedMigrationClient(
      async (database) => {
        const snapshot = await readHighImpactReviewSnapshot(database);
        const baseline = await buildHighImpactWorkbook(snapshot);
        populateD39WorkbookAnswers(
          baseline.workbook,
          snapshot,
          await readHistoricalClientSelection(readFileSync(HISTORICAL_WORKBOOK_PATH), snapshot),
        );
        const successor = await integrateD40OwnerAnswers(ownerBytes, snapshot, baseline.workbook);
        const bytes = Buffer.from(await successor.xlsx.writeBuffer());
        const roundTrip = new ExcelJS.Workbook();
        await roundTrip.xlsx.load(bytes as never);
        const result = validateHighImpactWorkbook(roundTrip, snapshot);
        if (!result.complete || result.pendingLookupCreation.length !== 2)
          throw new HighImpactWorkbookError(
            'D40 successor serialization changed its decision contract',
          );
        if (!readFileSync(input).equals(ownerBytes))
          throw new HighImpactWorkbookError('immutable owner input changed');
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, bytes, { flag: 'wx' });
        writeFileSync(manifest, `${fileSha256(bytes)}  ${basename(output)}\n`, { flag: 'wx' });
        console.log(
          JSON.stringify(
            {
              workbook: output,
              bytes: bytes.length,
              sha256: fileSha256(bytes),
              ownerComplete: result.completed,
              incomplete: result.incomplete,
              invalid: result.invalid,
              pendingLookupCreation: result.pendingLookupCreation,
              application:
                'Not applied. All 382 decisions await Task 3.5B; D39 branch prerequisites also remain.',
            },
            null,
            2,
          ),
        );
      },
      { clientConfig: { options: '-c default_transaction_read_only=on' } },
    );
    return;
  }
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
