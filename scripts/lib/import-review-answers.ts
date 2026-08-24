import type { PrismaClient } from '../../src/generated/prisma/client';
import {
  buildImportPlan,
  REVIEW_SHEET_SPECS,
  type DatabaseFinding,
  type DatabaseReviewValue,
  type ImportPlan,
  type ParsedReviewWorkbook,
  WorkbookContractError,
} from './review-workbook-contract';

/**
 * Validate the complete workbook against one transaction snapshot, then apply
 * every answer in that same transaction. Keeping this outside the CLI lets the
 * fixture suite force a late database failure and prove the earlier writes
 * roll back.
 */
export async function importReviewAnswers(
  database: PrismaClient,
  parsed: ParsedReviewWorkbook,
  answeredBy: string,
  options: { dryRun?: boolean } = {},
): Promise<ImportPlan> {
  return database.$transaction(
    async (tx) => {
      const reviewValues = await tx.$queryRaw<DatabaseReviewValue[]>`
      SELECT id, topic, value, extraction_sha256, legacy_workbook_id
        FROM quarantine.review_value`;
      const allReviewFindings = await tx.$queryRaw<DatabaseFinding[]>`
      SELECT id, topic, src_table, src_file, src_row_num, src_record_key,
             column_name, original_value, extraction_sha256, legacy_workbook_id
        FROM quarantine.finding
       WHERE severity = 'review'`;
      const workbookFindingTopics = new Set(
        REVIEW_SHEET_SPECS.filter((spec) => spec.kind === 'finding').flatMap((spec) => spec.topics),
      );
      const findings = allReviewFindings.filter((row) => workbookFindingTopics.has(row.topic));
      const plan = buildImportPlan(parsed, reviewValues, findings);
      if (options.dryRun === true) return plan;

      for (const row of plan.rows) {
        if (row.kind === 'review_value') {
          const changed = await tx.$executeRaw`
          UPDATE quarantine.review_value
             SET firm_answer = ${row.answer === '' ? null : row.answer},
                 firm_person = ${row.person === '' ? null : row.person},
                 firm_note   = ${row.note === '' ? null : row.note},
                 answered_at = now(),
                 answered_by = ${answeredBy}
           WHERE id = ${row.targetId}
             AND topic = ${row.topic}
             AND value = ${row.value!}
             AND extraction_sha256 = ${row.extractionSha256}`;
          if (changed !== 1) {
            throw new WorkbookContractError(
              `${row.sheet} row ${row.rowNumber}: review value changed during import`,
            );
          }
        } else {
          const changed = await tx.$executeRaw`
          UPDATE quarantine.finding
             SET firm_answer = ${row.answer === '' ? null : row.answer},
                 firm_note   = ${row.note === '' ? null : row.note},
                 answered_at = now(),
                 answered_by = ${answeredBy}
           WHERE id = ${row.targetId}
             AND topic = ${row.topic}
             AND src_table = ${row.srcTable!}
             AND src_record_key = ${row.srcRecordKey!}
             AND column_name IS NOT DISTINCT FROM ${row.columnName}
             AND extraction_sha256 = ${row.extractionSha256}`;
          if (changed !== 1) {
            throw new WorkbookContractError(
              `${row.sheet} row ${row.rowNumber}: finding changed during import`,
            );
          }
        }
      }
      return plan;
    },
    { isolationLevel: 'Serializable', timeout: 30_000 },
  );
}
