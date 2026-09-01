/*
 * Stage C — the review workbooks the firm answers.
 *
 *     npm run review:workbook
 *
 * WHY A WORKBOOK AND NOT A LIST
 *
 * The largest sheet is 663 attendee spellings. A bare list of them is
 * unanswerable: nobody can identify `م. أحمد` from the string alone. Every
 * row therefore carries the context needed to decide it WITHOUT OPENING
 * ACCESS — how often it appears, over which years, across how many matters,
 * and the closest names already in the roster with a closeness score.
 *
 * That is the whole point of the gate: the firm works through it at their own
 * desk, with a long-serving colleague present, because most of this is
 * institutional memory. Who `م. أحمد` was in 2013 is not written down
 * anywhere in the file.
 *
 * COLOUR IS EVIDENCE, NOT DECORATION. The confidence column is computed by
 * the profiler from trigram similarity against the roster, so a green row is
 * green for a stated reason and a grey row is one the machine has nothing to
 * say about. A near-certain match can be confirmed in a glance; the genuinely
 * ambiguous rows then get the time they deserve.
 *
 * "UNKNOWN PERSON" IS ONE OF THE ANSWERS, and it is a correct permanent one.
 * CLAUDE.md rules 4 and 15 both land here: a guessed name attaches one
 * person's historical work to another, which is precisely the failure a
 * missing hamza already caused twice in this project. It is not a gap to be
 * filled in later by inference.
 *
 * EVERY ROW CARRIES ITS DATABASE ID in the first column, and the very-hidden
 * contract carries the complete durable identity. Reading answers back never
 * matches on Arabic text or CSV position — both have already failed here.
 */

import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { migrationDb as db } from './lib/migration-db';
import {
  CONTRACT_SHEET,
  contractSha256,
  parseWorkbookContract,
  REVIEW_SHEET_SPECS,
  WORKBOOK_FORMAT,
  type ContractRow,
} from './lib/review-workbook-contract';

/*
 * Every visible string, in one place. The workbook is read by the firm in
 * Arabic; the English is there because the same sheet is read by whoever is
 * running the migration.
 */
const T = {
  readFirst: 'اقرأ أولاً',
  sheets: {
    attendee_name: 'الحاضرون بالجلسات',
    admin_assignee: 'القائم بالعمل',
    fee_letter_matter: 'خطابات الأتعاب',
    unlinked_rows: 'صفوف بلا رابط',
    task_actions: 'إجراءات بلا مهمة',
    open_question: 'أسئلة عامة',
  },
  cols: {
    id: '#',
    value: 'القيمة كما هي في أكسيس',
    kind: 'النوع (تخمين الآلة)',
    occurrences: 'عدد المرات',
    years: 'السنوات',
    matters: 'القضايا',
    nearest: 'أقرب الأسماء المسجلة',
    confidence: 'الثقة',
    table: 'الجدول',
    rowNum: 'رقم السطر',
    column: 'العمود',
    original: 'القيمة الأصلية',
    detail: 'ما وجدناه',
    answer: '⬅ الإجابة',
    person: '⬅ الشخص',
    note: '⬅ ملاحظة',
  },
  answers: ['person', 'unknown person', 'not a name', 'split'],
  answersAr: 'شخص / شخص غير معروف / ليس اسمًا / يُقسَّم',
} as const;

/* Confidence drives the fill. Grey is "the machine has nothing to say", which
 * is different from "no match" and is coloured differently on purpose. */
const FILL: Record<string, string> = {
  exact: 'FFC6EFCE',
  high: 'FFD9F0D3',
  medium: 'FFFFF2CC',
  low: 'FFFCE4D6',
  none: 'FFEFEFEF',
};

const HEADER_FILL = 'FF1F3864';
const ANSWER_FILL = 'FFDCE6F1';

type ReviewRow = {
  id: bigint;
  topic: string;
  value: string;
  occurrences: number;
  years: string | null;
  matters: string | null;
  clients: string | null;
  nearest: unknown;
  confidence: string;
  kind: string | null;
  extraction_sha256: string;
};

type FindingRow = {
  id: bigint;
  topic: string;
  severity: string;
  src_table: string;
  src_file: string;
  src_row_num: number;
  src_record_key: string;
  column_name: string | null;
  original_value: string | null;
  detail: string;
  extraction_sha256: string;
};

function nearestText(nearest: unknown): string {
  if (!Array.isArray(nearest) || nearest.length === 0) return '';
  return (nearest as { name: string; score: number }[])
    .map((n) => `${n.name} (${Number(n.score).toFixed(2)})`)
    .join('  ·  ');
}

/* Every sheet is right-to-left, frozen at the header, and filtered. */
function newSheet(book: ExcelJS.Workbook, name: string, widths: number[]): ExcelJS.Worksheet {
  const sheet = book.addWorksheet(name, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = widths.map((width) => ({ width }));
  return sheet;
}

function header(sheet: ExcelJS.Worksheet, names: string[], answerFrom: number) {
  const row = sheet.addRow(names);
  row.height = 28;
  row.eachCell((cell, i) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: i >= answerFrom ? 'FF375623' : HEADER_FILL },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: names.length } };
}

function styleAnswerCells(row: ExcelJS.Row, from: number, to: number) {
  for (let i = from; i <= to; i += 1) {
    const cell = row.getCell(i);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ANSWER_FILL } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF9DC3E6' } },
      left: { style: 'thin', color: { argb: 'FF9DC3E6' } },
      bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } },
      right: { style: 'thin', color: { argb: 'FF9DC3E6' } },
    };
  }
}

async function main() {
  const reviews = await db.$queryRaw<ReviewRow[]>`
    SELECT id, topic, value, occurrences, years, matters, clients, nearest, confidence, kind,
           extraction_sha256
      FROM quarantine.review_value
     ORDER BY topic,
              array_position(ARRAY['none','low','medium','high','exact'], confidence) DESC,
              occurrences DESC, value`;

  const findings = await db.$queryRaw<FindingRow[]>`
    SELECT id, topic, severity, src_table, src_file, src_row_num, src_record_key,
           column_name, original_value, detail, extraction_sha256
      FROM quarantine.finding
     WHERE severity = 'review'
     ORDER BY topic, src_table, src_row_num`;

  const book = new ExcelJS.Workbook();
  book.creator = 'Litigation migration — stage C';
  book.created = new Date();
  book.views = [
    { x: 0, y: 0, width: 20000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' },
  ];
  const contractRows: ContractRow[] = [];
  const mappedReviewTopics = new Set(
    REVIEW_SHEET_SPECS.filter((spec) => spec.kind === 'review_value').flatMap(
      (spec) => spec.topics,
    ),
  );
  const mappedFindingTopics = new Set(
    REVIEW_SHEET_SPECS.filter((spec) => spec.kind === 'finding').flatMap((spec) => spec.topics),
  );
  const unmappedReviews = reviews.filter((row) => !mappedReviewTopics.has(row.topic));
  const workbookFindings = findings.filter((row) => mappedFindingTopics.has(row.topic));
  if (unmappedReviews.length > 0) {
    throw new Error(
      `review workbook would omit ${unmappedReviews.length} review value(s) whose topics have no sheet`,
    );
  }
  const fingerprints = new Set([
    ...reviews.map((r) => r.extraction_sha256),
    ...workbookFindings.map((f) => f.extraction_sha256),
  ]);
  if (fingerprints.size !== 1) {
    throw new Error(
      `review rows carry ${fingerprints.size} extraction fingerprints, expected exactly one`,
    );
  }
  const extractionSha256 = [...fingerprints][0]!;

  // ---- the cover ---------------------------------------------------------
  const cover = newSheet(book, T.readFirst, [4, 110]);
  cover.views = [{ rightToLeft: true }];
  const lines: [string, boolean][] = [
    ['مراجعة بيانات الترحيل', true],
    ['', false],
    [
      'هذه الأوراق بها القيم التي لم نستطع ربطها تلقائيًا. لا شيء محذوف — كل قيمة موجودة كما هي في أكسيس.',
      false,
    ],
    ['', false],
    ['كيف تُجيب', true],
    ['١ — الأعمدة الخضراء في آخر كل ورقة هي أعمدتك. اكتب فيها فقط.', false],
    [`٢ — في عمود «الإجابة» اكتب واحدة من: ${T.answersAr}`, false],
    [
      '٣ — «شخص غير معروف» إجابة صحيحة ونهائية. لا تخمّن. اسم مخمَّن يُلحق عمل شخص بشخص آخر.',
      false,
    ],
    [
      '٤ — الألوان: الأخضر تطابق شبه مؤكد، الأصفر محتمل، البرتقالي بعيد، الرمادي لا يوجد ما يقترحه الحاسب.',
      false,
    ],
    ['٥ — لا تُغيّر عمود # ولا القيمة الأصلية. بهما نُعيد إجاباتك إلى مكانها.', false],
    ['', false],
    ['يُفضَّل الإجابة بحضور زميل قديم بالمكتب — أغلب هذا ذاكرة بشرية لا توجد في الملف.', false],
    ['', false],
    ['HOW TO ANSWER — the last columns of each sheet, shaded green, are yours.', true],
    ['"unknown person" is a correct, permanent answer. Never guess a name.', false],
    [
      'Do not change the # column or the original value: both are checked against the hidden source identity.',
      false,
    ],
  ];
  for (const [text, bold] of lines) {
    const row = cover.addRow(['', text]);
    row.getCell(2).font = { bold, size: bold ? 13 : 11 };
    row.getCell(2).alignment = { horizontal: 'right', wrapText: true };
    row.height = text === '' ? 8 : 20;
  }

  // ---- value-driven sheets ----------------------------------------------
  for (const spec of REVIEW_SHEET_SPECS.filter((candidate) => candidate.kind === 'review_value')) {
    const title = spec.name;
    const rows = reviews.filter((r) => spec.topics.includes(r.topic));

    const sheet = newSheet(book, title, [7, 34, 16, 11, 12, 14, 46, 10, 16, 22, 30]);
    header(
      sheet,
      [
        T.cols.id,
        T.cols.value,
        T.cols.kind,
        T.cols.occurrences,
        T.cols.years,
        T.cols.matters,
        T.cols.nearest,
        T.cols.confidence,
        T.cols.answer,
        T.cols.person,
        T.cols.note,
      ],
      9,
    );

    for (const r of rows) {
      const row = sheet.addRow([
        Number(r.id),
        r.value,
        r.kind ?? '',
        r.occurrences,
        r.years ?? '',
        r.matters ?? '',
        nearestText(r.nearest),
        r.confidence,
        '',
        '',
        '',
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
      const fill = FILL[r.confidence] ?? FILL['none'];
      for (let i = 2; i <= 8; i += 1) {
        row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill! } };
      }
      /* The original text is shown in a monospaced font so a trailing space
       * or a doubled character is visible rather than merely present. */
      row.getCell(2).font = { name: 'Consolas', size: 11 };
      styleAnswerCells(row, 9, 11);

      row.getCell(9).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${T.answers.join(',')}"`],
        showErrorMessage: true,
        errorTitle: 'One of the four',
        error: T.answers.join(' / '),
      };
      contractRows.push({
        sheet: title,
        kind: 'review_value',
        workbookId: Number(r.id),
        topic: r.topic,
        value: r.value,
        srcTable: null,
        srcFile: null,
        srcRowNum: null,
        srcRecordKey: null,
        columnName: null,
        originalValue: null,
        extractionSha256: r.extraction_sha256,
      });
    }
  }

  // ---- finding-driven sheets --------------------------------------------
  for (const spec of REVIEW_SHEET_SPECS.filter((candidate) => candidate.kind === 'finding')) {
    const rows = workbookFindings.filter((f) => spec.topics.includes(f.topic));
    const title = spec.name;
    const sheet = newSheet(book, title, [7, 22, 11, 16, 40, 60, 22, 30]);
    header(
      sheet,
      [
        T.cols.id,
        T.cols.table,
        T.cols.rowNum,
        T.cols.column,
        T.cols.original,
        T.cols.detail,
        T.cols.answer,
        T.cols.note,
      ],
      7,
    );

    for (const f of rows) {
      const row = sheet.addRow([
        Number(f.id),
        f.src_table,
        f.src_row_num,
        f.column_name ?? '',
        /* NULL is shown as the word, not as a blank cell. A blank cell reads
         * as "nothing to see"; the whole finding is that there is nothing. */
        f.original_value === null ? '(فارغ / NULL)' : f.original_value,
        f.detail,
        '',
        '',
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
      row.getCell(5).font = { name: 'Consolas', size: 11 };
      if (f.original_value === null) {
        row.getCell(5).font = {
          name: 'Consolas',
          size: 11,
          italic: true,
          color: { argb: 'FF888888' },
        };
      }
      styleAnswerCells(row, 7, 8);
      contractRows.push({
        sheet: title,
        kind: 'finding',
        workbookId: Number(f.id),
        topic: f.topic,
        value: null,
        srcTable: f.src_table,
        srcFile: f.src_file,
        srcRowNum: f.src_row_num,
        srcRecordKey: f.src_record_key,
        columnName: f.column_name,
        originalValue: f.original_value,
        extractionSha256: f.extraction_sha256,
      });
    }
  }

  // ---- machine-readable identity contract -------------------------------
  // Very hidden rather than merely hidden: a user cannot accidentally expose
  // and edit it from Excel's ordinary Unhide dialog. The visible source text
  // remains a human cross-check; this sheet is the complete machine identity.
  const contract = newSheet(book, CONTRACT_SHEET, [24, 18, 10, 28, 42, 24, 44, 12, 76, 24, 48, 70]);
  contract.state = 'veryHidden';
  contract.addRow(['format', WORKBOOK_FORMAT]);
  contract.addRow(['extraction_sha256', extractionSha256]);
  const completeContractSha256 = contractSha256(contractRows);
  contract.addRow(['contract_sha256', completeContractSha256]);
  contract.addRow([
    'sheet',
    'kind',
    'id',
    'topic',
    'value',
    'src_table',
    'src_file',
    'src_row_num',
    'src_record_key',
    'column_name',
    'original_value',
    'extraction_sha256',
  ]);
  for (const r of contractRows) {
    contract.addRow([
      r.sheet,
      r.kind,
      r.workbookId,
      r.topic,
      JSON.stringify(r.value),
      JSON.stringify(r.srcTable),
      JSON.stringify(r.srcFile),
      r.srcRowNum,
      JSON.stringify(r.srcRecordKey),
      JSON.stringify(r.columnName),
      JSON.stringify(r.originalValue),
      r.extractionSha256,
    ]);
  }

  // ---- write -------------------------------------------------------------
  const dir = '_migration/review';
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const path = join(dir, `review-${stamp}.xlsx`);
  await book.xlsx.writeFile(path);

  /*
   * READ IT BACK AND CHECK IT.
   *
   * The same round trip the loader does, for the same reason: the object in
   * memory is not the file on disk. A workbook that writes without error and
   * opens empty, or opens left-to-right, is not something to discover when
   * the firm opens it. "It wrote without throwing" is not evidence that it
   * wrote anything.
   */
  const check = new ExcelJS.Workbook();
  await check.xlsx.readFile(path);

  const problems: string[] = [];
  const expected = new Map<string, number>();
  for (const sheet of book.worksheets) expected.set(sheet.name, sheet.rowCount);

  if (check.worksheets.length !== book.worksheets.length) {
    problems.push(
      `the file holds ${check.worksheets.length} sheets, ${book.worksheets.length} were written`,
    );
  }

  for (const sheet of check.worksheets) {
    const want = expected.get(sheet.name);
    if (want === undefined) {
      problems.push(`the file holds an unexpected sheet '${sheet.name}'`);
      continue;
    }
    if (sheet.rowCount !== want) {
      problems.push(`${sheet.name}: ${sheet.rowCount} rows in the file, ${want} written`);
    }
    /* Arabic in a left-to-right sheet is readable but wrong, and it is the
     * kind of wrong nobody reports: they just find the workbook awkward. */
    if (sheet.views[0]?.rightToLeft !== true) {
      problems.push(`${sheet.name}: not right-to-left`);
    }
  }

  const checkedContract = check.getWorksheet(CONTRACT_SHEET);
  if (checkedContract === undefined || checkedContract.state !== 'veryHidden') {
    problems.push(`${CONTRACT_SHEET}: identity contract is missing or not very hidden`);
  } else {
    if (checkedContract.getCell('B1').text !== WORKBOOK_FORMAT) {
      problems.push(`${CONTRACT_SHEET}: workbook format did not survive the write`);
    }
    if (checkedContract.getCell('B2').text !== extractionSha256) {
      problems.push(`${CONTRACT_SHEET}: extraction fingerprint did not survive the write`);
    }
    if (checkedContract.getCell('B3').text !== completeContractSha256) {
      problems.push(`${CONTRACT_SHEET}: complete-manifest checksum did not survive the write`);
    }
    if (checkedContract.rowCount - 4 !== contractRows.length) {
      problems.push(
        `${CONTRACT_SHEET}: ${checkedContract.rowCount - 4} identities in the file, ${contractRows.length} written`,
      );
    }
    try {
      const parsedContract = parseWorkbookContract(check);
      if (parsedContract === null || parsedContract.rows.length !== contractRows.length) {
        problems.push(`${CONTRACT_SHEET}: complete identity manifest did not parse back`);
      }
    } catch (error: unknown) {
      problems.push(
        `${CONTRACT_SHEET}: ${error instanceof Error ? error.message : 'identity manifest did not parse back'}`,
      );
    }
  }

  /* The id column is how answers come home. If it did not survive the write,
   * the workbook cannot be read back and the firm's work would be lost. */
  for (const [key, title] of [
    ['attendee_name', T.sheets.attendee_name],
    ['admin_assignee', T.sheets.admin_assignee],
  ] as const) {
    const sheet = check.getWorksheet(title);
    const wanted = reviews.filter((r) => r.topic === key).map((r) => Number(r.id));
    if (sheet === undefined) {
      if (wanted.length > 0) problems.push(`${title}: missing from the file`);
      continue;
    }
    const seen = new Set<number>();
    sheet.eachRow((row, n) => {
      if (n > 1) seen.add(Number(row.getCell(1).value));
    });
    const missing = wanted.filter((id) => !seen.has(id));
    if (missing.length > 0) {
      problems.push(`${title}: ${missing.length} review id(s) did not survive the write`);
    }
  }

  console.log(`\nreview:workbook — wrote ${path}\n`);
  for (const sheet of book.worksheets) {
    if (sheet.name === T.readFirst) continue;
    console.log(`  ${sheet.name.padEnd(24)} ${String(sheet.rowCount - 1).padStart(5)} rows`);
  }

  if (problems.length > 0) {
    console.error('\nreview:workbook — THE FILE IS NOT WHAT WAS WRITTEN\n');
    for (const p of problems) console.error(`  ${p}`);
    console.error('');
    process.exitCode = 1;
    await db.$disconnect();
    return;
  }

  console.log(
    `\n  read back and verified: ${check.worksheets.length} sheets, all right-to-left, every id present\n`,
  );

  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error('\nreview:workbook — could not run.\n');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
  void db.$disconnect();
});
