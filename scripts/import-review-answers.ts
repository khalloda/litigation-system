/*
 * Stage C — load the firm's answers back out of the review workbook.
 *
 *     npm run review:import -- <workbook.xlsx>
 *     npm run review:import -- <workbook.xlsx> --by "Khaled Helmy"
 *
 * MATCHED STRUCTURALLY, VERIFIED BY CONTENT. NEVER MATCHED BY TEXT.
 *
 * `review_value` rows are matched by their database id, which is stable:
 * that table is upserted on (topic, value) and keeps its ids.
 *
 * `finding` rows are matched by WHAT THEY ARE ABOUT — the source table, the
 * row number and the column — and the original value is then checked to
 * agree. The id is printed in the sheet and read back as a cross-check only.
 *
 * That distinction was learned the hard way. The first import refused every
 * finding sheet, because the profiler had been re-run between building the
 * workbook and receiving it, and rebuilding the table reissued every id from
 * the sequence. 72 answers pointed at rows that no longer existed. Migration
 * 0029 gave findings a stable identity so ids stop moving; this script no
 * longer depends on that having worked.
 *
 * Matching on the Arabic text alone would be the fragile thing this project
 * keeps getting wrong — `حسن عادل "متدرب"` differs from its stored alias by
 * ONE character. So the text is not the key. It is the CHECK on the key, and
 * a disagreement is refused rather than resolved.
 *
 * THE ANSWER COLUMNS ARE FOUND BY THEIR ⬅ MARKER, NOT BY POSITION OR NAME.
 *
 * The returned workbook has `⬅ الperson` where it was written `⬅ الشخص` — a
 * header edited in passing, on one sheet out of seven. Positions would have
 * survived that and would not survive an inserted column; header names would
 * have survived an insertion and did not survive this. The marker survives
 * both, and if it ever stops doing so the count check below refuses rather
 * than importing blanks.
 *
 * NOTHING IS INFERRED. An answer of `person` with nobody named is stored
 * exactly as written and reported as incomplete. The nearest roster match
 * being 1.00 is not permission to fill it in — that reasoning produced two
 * duplicate people in this project already.
 */

import 'dotenv/config';
import ExcelJS from 'exceljs';
import { db } from '../src/lib/db';

const MARKER = '⬅';

type Loaded = {
  sheet: string;
  kind: 'review_value' | 'finding';
  rows: number;
  answered: number;
  blank: number;
  incomplete: number;
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'richText' in (value as object)) {
    return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join('');
  }
  if (typeof value === 'object' && 'text' in (value as object)) {
    return String((value as { text: unknown }).text ?? '');
  }
  return String(value);
}

function fail(message: string): never {
  console.error(`\nreview:import — STOPPED\n\n  ${message}\n`);
  void db.$disconnect();
  process.exit(1);
}

async function main() {
  const path = process.argv[2];
  if (path === undefined || path.startsWith('--')) {
    fail('no workbook given.\n  npm run review:import -- <workbook.xlsx> [--by "name"]');
  }
  const byIndex = process.argv.indexOf('--by');
  const answeredBy = byIndex > 0 ? (process.argv[byIndex + 1] ?? 'the firm') : 'the firm';

  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path);

  const loaded: Loaded[] = [];
  const incompleteRows: string[] = [];
  const unknownIds: string[] = [];
  /* Findings whose id in the workbook no longer matches the row it describes.
   * Not an error — the natural key found it — but worth saying, because it
   * means the table was rebuilt while the firm had the workbook out. */
  let idsMoved = 0;

  for (const sheet of book.worksheets) {
    /* The cover carries no answers and no id column. */
    const header: string[] = [];
    sheet.getRow(1).eachCell((c, i) => {
      header[i] = cellText(c.value).trim();
    });
    const idCol = header.findIndex((h) => h === '#');
    if (idCol < 1) continue;

    const answerCols = header
      .map((h, i) => ({ h, i }))
      .filter((x) => typeof x.h === 'string' && x.h.startsWith(MARKER))
      .map((x) => x.i);

    /*
     * Three answer columns means a value sheet (answer / person / note); two
     * means a finding sheet (answer / note). Anything else means the workbook
     * is not the shape this script understands, and importing it would write
     * the wrong text into the wrong column.
     */
    if (answerCols.length !== 3 && answerCols.length !== 2) {
      fail(
        `${sheet.name}: found ${answerCols.length} answer columns marked "${MARKER}", expected 2 or 3.\n` +
          `      header: ${header.filter(Boolean).join(' | ')}`,
      );
    }
    const kind = answerCols.length === 3 ? 'review_value' : 'finding';

    let rows = 0;
    let answered = 0;
    let blank = 0;
    let incomplete = 0;

    for (let n = 2; n <= sheet.rowCount; n += 1) {
      const row = sheet.getRow(n);
      const rawId = cellText(row.getCell(idCol).value).trim();
      if (rawId === '') continue;
      rows += 1;

      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) {
        fail(`${sheet.name} row ${n}: "${rawId}" is not a row id`);
      }

      const answer = cellText(row.getCell(answerCols[0]!).value).trim();
      const person = kind === 'review_value' ? cellText(row.getCell(answerCols[1]!).value).trim() : '';
      const note = cellText(row.getCell(answerCols[answerCols.length - 1]!).value).trim();

      if (answer === '' && note === '' && person === '') {
        blank += 1;
        continue;
      }
      answered += 1;

      if (kind === 'review_value') {
        if ((answer === 'person' || answer === 'split') && person === '') {
          incomplete += 1;
          if (incompleteRows.length < 20) {
            incompleteRows.push(
              `${sheet.name} #${id}: "${cellText(row.getCell(2).value).replace(/\s+/g, ' ').slice(0, 48)}" → ${answer}, nobody named`,
            );
          }
        }
        const done = await db.$executeRaw`
          UPDATE quarantine.review_value
             SET firm_answer = ${answer === '' ? null : answer},
                 firm_person = ${person === '' ? null : person},
                 firm_note   = ${note === '' ? null : note},
                 answered_at = now(),
                 answered_by = ${answeredBy}
           WHERE id = ${id}`;
        if (done !== 1 && unknownIds.length < 20) unknownIds.push(`${sheet.name} #${id}`);
      } else {
        /*
         * The natural key, straight out of the sheet: which table, which row,
         * which column. `column_name` may be blank on a row-level finding, so
         * NULL and '' have to mean the same thing here — IS NOT DISTINCT FROM
         * rather than =.
         */
        const srcTable = cellText(row.getCell(2).value).trim();
        const srcRowNum = Number(cellText(row.getCell(3).value).trim());
        const columnName = cellText(row.getCell(4).value).trim();
        const shownValue = cellText(row.getCell(5).value).trim();

        if (srcTable === '' || !Number.isInteger(srcRowNum)) {
          fail(`${sheet.name} row ${n}: cannot read which staged row this answer is about`);
        }

        const match = await db.$queryRaw<{ id: bigint; original_value: string | null }[]>`
          SELECT id, original_value FROM quarantine.finding
           WHERE src_table = ${srcTable}
             AND src_row_num = ${srcRowNum}
             AND column_name IS NOT DISTINCT FROM ${columnName === '' ? null : columnName}`;

        if (match.length !== 1) {
          if (unknownIds.length < 20) {
            unknownIds.push(
              `${sheet.name} #${id}: ${srcTable} row ${srcRowNum} matched ${match.length} findings`,
            );
          }
          continue;
        }

        /*
         * The content check. The sheet renders a null original value as the
         * word `(فارغ / NULL)`, so that is what a null must look like coming
         * back. Anything else disagreeing means the workbook and the database
         * are describing different rows, and writing the answer would put the
         * firm's words against the wrong record.
         */
        const found = match[0]!;
        const expected = found.original_value === null ? '(فارغ / NULL)' : found.original_value;
        if (expected.replace(/\s+/g, ' ').trim() !== shownValue.replace(/\s+/g, ' ').trim()) {
          fail(
            `${sheet.name} #${id}: ${srcTable} row ${srcRowNum} holds a different value now.\n` +
              `      workbook: ${JSON.stringify(shownValue.slice(0, 60))}\n` +
              `      database: ${JSON.stringify(expected.slice(0, 60))}\n\n` +
              `  Nothing was imported for this row. The workbook describes an older extraction.`,
          );
        }

        if (Number(found.id) !== id) idsMoved += 1;

        await db.$executeRaw`
          UPDATE quarantine.finding
             SET firm_answer = ${answer === '' ? null : answer},
                 firm_note   = ${note === '' ? null : note},
                 answered_at = now(),
                 answered_by = ${answeredBy}
           WHERE id = ${found.id}`;
      }
    }

    loaded.push({ sheet: sheet.name, kind, rows, answered, blank, incomplete });
  }

  if (unknownIds.length > 0) {
    fail(
      `these ids are in the workbook and not in the database:\n` +
        unknownIds.map((u) => `      ${u}`).join('\n') +
        '\n\n  The workbook was built from a different profiling run. Nothing was imported\n' +
        '  for those rows; the rest were. Rebuild the workbook and re-answer, or say so.',
    );
  }

  console.log(`\nreview:import — ${path}\n`);
  for (const l of loaded) {
    console.log(
      `  ${l.sheet.padEnd(22)} ${String(l.answered).padStart(4)} answered` +
        `  ${String(l.blank).padStart(4)} blank` +
        (l.incomplete > 0 ? `   ${l.incomplete} INCOMPLETE` : ''),
    );
  }

  const totalAnswered = loaded.reduce((a, l) => a + l.answered, 0);
  const totalBlank = loaded.reduce((a, l) => a + l.blank, 0);
  const totalIncomplete = loaded.reduce((a, l) => a + l.incomplete, 0);

  /*
   * A file that imported nothing is not a success. This is the same guard as
   * counting PROVED notices: the process exiting 0 having done no work reads
   * identically to the process exiting 0 having done all of it.
   */
  if (totalAnswered === 0) {
    fail('the workbook holds no answers at all. Nothing was imported.');
  }

  console.log(`\n  ${totalAnswered} answers loaded, ${totalBlank} rows left blank.`);

  if (idsMoved > 0) {
    console.log(
      `\n  ${idsMoved} finding(s) had moved id since the workbook was built, and were` +
        `\n  matched by what they are about instead. Their values were checked to agree.`,
    );
  }

  if (totalIncomplete > 0) {
    console.log(`\n  ${totalIncomplete} ANSWER(S) NAME NO PERSON and cannot be acted on yet:`);
    for (const r of incompleteRows) console.log(`      ${r}`);
    console.log('\n  Stored exactly as written. Not inferred — see the header of this script.');
  }

  /* Still-open questions: added after the workbook was sent, so nobody has
   * seen them. Saying so is the difference between "answered" and "asked". */
  const open = await db.$queryRaw<{ topic: string; value: string }[]>`
    SELECT topic, value FROM quarantine.review_value
     WHERE answered_at IS NULL AND topic = 'open_question' ORDER BY id`;
  if (open.length > 0) {
    console.log(`\n  ${open.length} QUESTION(S) THE FIRM HAS NOT SEEN — added after the workbook went out:`);
    for (const q of open) console.log(`      ${q.value}`);
  }

  console.log('');
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error('\nreview:import — could not run.\n');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
  void db.$disconnect();
});
