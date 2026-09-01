/*
 * One-time compatibility conversion for the exact review workbook returned
 * on 23 August 2026. The old importer used database ids. This script captures
 * that association permanently, but only after all 744 stored answer payloads
 * and all 76 finding source descriptions match the authoritative workbook.
 *
 *     npm run review:attach-legacy-identity -- <workbook.xlsx> [--dry-run]
 */

import 'dotenv/config';
import ExcelJS from 'exceljs';
import { migrationDb as db } from './lib/migration-db';
import {
  buildLegacyIdentityAttachmentPlan,
  type LegacyFindingRow,
  type LegacyReviewValueRow,
} from './lib/attach-legacy-workbook-identity';
import {
  parseReviewWorkbook,
  REVIEW_SHEET_SPECS,
  workbookSha256,
  WorkbookContractError,
} from './lib/review-workbook-contract';

function stop(message: string): never {
  throw new WorkbookContractError(message);
}

async function main() {
  const path = process.argv[2];
  if (path === undefined || path.startsWith('--')) {
    stop(
      'no workbook given.\n  npm run review:attach-legacy-identity -- <workbook.xlsx> [--dry-run]',
    );
  }
  const dryRun = process.argv.includes('--dry-run');
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path);
  const parsed = parseReviewWorkbook(book, workbookSha256(path));
  const findingTopics = REVIEW_SHEET_SPECS.filter((spec) => spec.kind === 'finding').flatMap(
    (spec) => spec.topics,
  );

  const result = await db.$transaction(
    async (tx) => {
      const reviewValues = await tx.$queryRaw<LegacyReviewValueRow[]>`
      SELECT id, topic, value, extraction_sha256, legacy_workbook_id,
             firm_answer, firm_person, firm_note
        FROM quarantine.review_value
       WHERE answered_at IS NOT NULL
       ORDER BY id
       FOR UPDATE`;
      const allFindings = await tx.$queryRaw<LegacyFindingRow[]>`
      SELECT id, topic, src_table, src_file, src_row_num, src_record_key,
             column_name, original_value, extraction_sha256, legacy_workbook_id,
             firm_answer, firm_note
        FROM quarantine.finding
       WHERE severity = 'review' AND answered_at IS NOT NULL
       ORDER BY id
       FOR UPDATE`;
      const findings = allFindings.filter((row) => findingTopics.includes(row.topic));
      const attachments = buildLegacyIdentityAttachmentPlan(parsed, reviewValues, findings);
      if (dryRun) return attachments;

      for (const attachment of attachments) {
        const changed =
          attachment.kind === 'review_value'
            ? await tx.$executeRaw`
              UPDATE quarantine.review_value
                 SET legacy_workbook_id = ${attachment.workbookId}
               WHERE id = ${attachment.targetId}
                 AND answered_at IS NOT NULL
                 AND (legacy_workbook_id IS NULL OR legacy_workbook_id = ${attachment.workbookId})`
            : await tx.$executeRaw`
              UPDATE quarantine.finding
                 SET legacy_workbook_id = ${attachment.workbookId}
               WHERE id = ${attachment.targetId}
                 AND answered_at IS NOT NULL
                 AND (legacy_workbook_id IS NULL OR legacy_workbook_id = ${attachment.workbookId})`;
        if (changed !== 1) {
          stop(`database row ${attachment.targetId} changed during legacy identity attachment`);
        }
      }
      return attachments;
    },
    { isolationLevel: 'Serializable', timeout: 30_000 },
  );

  const values = result.filter((row) => row.kind === 'review_value').length;
  const findings = result.filter((row) => row.kind === 'finding').length;
  console.log(`\nreview:attach-legacy-identity — ${path}`);
  console.log(`  review values : ${values}`);
  console.log(`  findings      : ${findings}`);
  console.log(`  total         : ${result.length}`);
  console.log(
    dryRun
      ? '  DRY RUN — no database row was changed.\n'
      : '  All identities recorded atomically.\n',
  );
}

main()
  .catch((error: unknown) => {
    console.error('\nreview:attach-legacy-identity — STOPPED; the transaction was rolled back.\n');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
