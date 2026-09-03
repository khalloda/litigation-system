import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { ClientBase, QueryResultRow } from 'pg';
import ExcelJS from 'exceljs';

export const HIGH_IMPACT_WORKBOOK_PATH =
  '_migration/review/task-3-5-high-impact-quarantine-review-2026-09-03.xlsx';
export const HIGH_IMPACT_SHA256_PATH = `${HIGH_IMPACT_WORKBOOK_PATH}.sha256`;
export const HIGH_IMPACT_FORMAT = 'task-3-5a-high-impact-review-v1';
export const IDENTITY_SHEET = '__identity';
export const LOOKUP_SHEET = '__lookups';

export const EXPECTED_EXTRACTION_SHA256 =
  '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979';
export const EXPECTED_DATABASE_EVIDENCE_SHA256 =
  'bb3ca71e490123dd0e8d9da7665b73bdae37e3d607fd2e6746b89862fef7ed2a';
export const EXPECTED_DATABASE_LOOKUP_SHA256 =
  '1852b58e40986aaea93eec61624562f11c233902ae6cd38852a9ad804d07debe';

export const READ_ONLY_TRANSACTION_SQL =
  'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

export const VISIBLE_SHEETS = [
  'اقرأ أولاً',
  'العميل غير الصحيح',
  'الدعاوى الأخرى',
  'الجلسات التابعة',
  'مشكلات الجلسات',
] as const;

const MATTER_SHEETS = [VISIBLE_SHEETS[1], VISIBLE_SHEETS[2]] as const;
const HEARING_SHEETS = [VISIBLE_SHEETS[3], VISIBLE_SHEETS[4]] as const;

const MATTER_REASON_COUNTS = new Map<string, number>([
  ['unmapped_importance', 18],
  ['separate_client', 14],
  ['branch_requires_review', 10],
  ['classification_conflict:matter_category', 5],
  ['classification_conflict:matter_type', 4],
  ['court_remainder_is_hearing_note', 3],
  ['matter_no_client', 1],
]);

const HEARING_REASON_COUNTS = new Map<string, number>([
  ['parent_matter_quarantined', 313],
  ['court_circuit_conflict', 11],
  ['unmapped_court', 3],
]);

const EXPECTED_LOOKUP_COUNTS = new Map<DatabaseLookupKind, number>([
  ['client', 318],
  ['court', 308],
  ['importance', 3],
  ['branch', 15],
  ['category', 21],
  ['type', 14],
]);

export const DECISION_STATUSES = [
  'تصحيح معتمد',
  'يبقى قيد المراجعة دون حل',
  'يحتاج إلى نقاش',
] as const;

export const PARENT_DECISION_STATUSES = [
  'يتبع القرار المعتمد للدعوى',
  'يبقى قيد المراجعة دون حل',
  'يحتاج إلى نقاش',
] as const;

const NULL_DISPLAY = '(فارغ / NULL)';
const EMPTY_TEXT_DISPLAY = '(نص فارغ)';
const NOT_APPLICABLE_DISPLAY = 'غير مطلوب';
const HEADER_FILL = 'FF17365D';
const EVIDENCE_FILL = 'FFF2F2F2';
const EDITABLE_FILL = 'FFDDEBF7';
const LOCKED_TARGET_FILL = 'FFE7E6E6';
const HIGHEST_PRIORITY_FILL = 'FFF4CCCC';
const NORMAL_PRIORITY_FILL = 'FFFFF2CC';
const BORDER = 'FFB4C6E7';

const MATTER_HEADERS = [
  'رقم المراجعة',
  'سبب الحجز',
  'الأولوية',
  'رقم الدعوى في أكسيس',
  'رقم الدعوى',
  'الموضوع',
  'العميل المرتبط حاليًا',
  'رقم العميل في المصدر',
  'نص العميل وصفته في المصدر',
  'الفرع في المصدر',
  'التصنيف في المصدر',
  'التصنيف المستخرج',
  'النوع المستخرج',
  'الدرجة في المصدر',
  'الدرجة المستخرجة',
  'الأهمية في المصدر',
  'المحكمة في المصدر',
  'المحكمة المستخرجة',
  'الدائرة',
  'الحالة والموقف الحالي',
  'تفاصيل سبب الحجز',
  'عدد الجلسات التابعة المحتجزة',
  'نوع الهدف المطلوب',
] as const;

const HEARING_HEADERS = [
  'رقم المراجعة',
  'سبب الحجز',
  'الأولوية',
  'رقم الجلسة في أكسيس',
  'رقم مراجعة الدعوى الأصلية',
  'رقم الدعوى',
  'العميل',
  'موضوع الدعوى',
  'تاريخ الجلسة',
  'تاريخ الجلسة القادمة',
  'المحكمة في المصدر',
  'المحكمة المستخرجة',
  'الدائرة في المصدر',
  'الدائرة المستخرجة من اسم المحكمة',
  'الإجراء',
  'القرار',
  'القرار السابق',
  'صالح / ضد',
  'ملاحظات',
  'القرار المختصر',
  'تفاصيل سبب الحجز',
  'نوع الهدف المطلوب',
] as const;

export const ANSWER_HEADERS = [
  '⬅ حالة القرار (يُملأ بواسطة المكتب)',
  '⬅ الهدف المعتمد (يُملأ عند التصحيح)',
  '⬅ اسم المراجع',
  '⬅ تاريخ المراجعة',
  '⬅ ملاحظة القرار',
] as const;

const MATTER_WIDTHS = [
  15, 27, 18, 16, 24, 38, 30, 17, 34, 28, 25, 28, 28, 24, 28, 22, 28, 28, 24, 31, 42, 17, 22, 30,
  40, 24, 16, 42,
];
const HEARING_WIDTHS = [
  15, 27, 17, 17, 20, 24, 29, 36, 17, 20, 29, 29, 27, 31, 25, 40, 35, 18, 40, 34, 42, 22, 34, 40,
  24, 16, 42,
];

type ReviewKind = 'matter' | 'hearing';
export type DatabaseLookupKind = 'client' | 'court' | 'importance' | 'branch' | 'category' | 'type';
export type TargetKind = DatabaseLookupKind | 'circuit' | 'text' | 'parent';

export type MatterDatabaseRow = {
  quarantine_id: string;
  src_record_key: string;
  extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  legacy_matter_id: string | null;
  reason_codes: string[];
  reason_details: unknown;
  resolved_at: string | null;
  case_number: string | null;
  subject: string | null;
  associated_client: string | null;
  source_client_id: string | null;
  source_client_text: string | null;
  source_branch: string | null;
  source_category: string | null;
  derived_category: string | null;
  derived_type: string | null;
  source_degree: string | null;
  derived_degree: string | null;
  source_importance: string | null;
  source_court: string | null;
  derived_court: string | null;
  source_circuit: string | null;
  source_status: string | null;
  source_current_status: string | null;
  linked_quarantined_hearings: number;
};

export type HearingDatabaseRow = {
  quarantine_id: string;
  src_record_key: string;
  extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  legacy_hearing_id: string | null;
  reason_codes: string[];
  reason_details: unknown;
  parent_matter_quarantine_id: string | null;
  parent_case_number: string | null;
  parent_subject: string | null;
  parent_client: string | null;
  hearing_date: string | null;
  next_hearing_date: string | null;
  source_court: string | null;
  derived_court: string | null;
  source_circuit: string | null;
  derived_circuit: string | null;
  source_action: string | null;
  source_decision: string | null;
  previous_decision: string | null;
  source_outcome: string | null;
  source_notes: string | null;
  short_decision: string | null;
};

export type DatabaseLookup = {
  kind: DatabaseLookupKind;
  id: string;
  label: string;
};

export type HighImpactReviewSnapshot = {
  matters: MatterDatabaseRow[];
  hearings: HearingDatabaseRow[];
  lookups: DatabaseLookup[];
  databaseEvidenceSha256: string;
  databaseLookupSha256: string;
};

export type PreparedReviewRow = {
  sheet: (typeof VISIBLE_SHEETS)[number];
  reviewId: string;
  kind: ReviewKind;
  quarantineId: string;
  sourceRecordKey: string;
  sourceFile: string;
  sourceRowNumber: number;
  legacyId: string | null;
  extractionSha256: string;
  reasonCodes: string[];
  reasonDetailsJson: string;
  parentMatterReviewId: string | null;
  targetKind: TargetKind;
  evidence: string[];
};

type IdentityRow = Omit<PreparedReviewRow, 'evidence'> & { visibleContextSha256: string };

type LookupManifestRow = {
  kind: DatabaseLookupKind | 'decision_status' | 'parent_decision_status';
  id: string;
  label: string;
  choice: string;
  databaseBacked: boolean;
};

export type WorkbookBuildResult = {
  workbook: ExcelJS.Workbook;
  reviewRows: PreparedReviewRow[];
  identityManifestSha256: string;
  lookupManifestSha256: string;
};

export type WorkbookValidationResult = {
  total: number;
  answered: number;
  completed: number;
  incomplete: number;
  invalid: number;
  complete: boolean;
  issues: string[];
  identityManifestSha256: string;
  lookupManifestSha256: string;
};

export class HighImpactWorkbookError extends Error {}

type DigestRow = QueryResultRow & { digest: string };

const MATTER_QUERY = `
SELECT q.id::text quarantine_id,
       q.src_record_key, q.extraction_sha256, q.src_file, q.src_row_num,
       q.legacy_matter_id, q.reason_codes, q.reason_details,
       q.resolved_at::text resolved_at,
       q.source_payload->>'matterAR' case_number,
       q.source_payload->>'matterSubject' subject,
       coalesce(nullif(c.full_name,''),nullif(c.name_ar,''),nullif(c.name_en,'')) associated_client,
       q.source_payload->>'clientID' source_client_id,
       q.source_payload->>'client&Cap' source_client_text,
       q.source_payload->>'clientBranch' source_branch,
       q.source_payload->>'matterCategory' source_category,
       derived.category derived_category,
       derived.matter_type derived_type,
       q.source_payload->>'matterDegree' source_degree,
       derived.degree derived_degree,
       q.source_payload->>'matterImportance' source_importance,
       q.source_payload->>'matterCourt' source_court,
       coalesce(court_rule.target_value,direct_court.label_ar) derived_court,
       q.source_payload->>'matterCircut' source_circuit,
       q.source_payload->>'matterStatus' source_status,
       q.source_payload->>'الموقف الحالي' source_current_status,
       (SELECT count(*)::int FROM quarantine.hearing_transform h
         WHERE h.source_payload->>'matterID'=q.legacy_matter_id) linked_quarantined_hearings
  FROM quarantine.matter_transform q
  LEFT JOIN clients c ON c.legacy_id::text=q.source_payload->>'clientID'
  LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT cw.target_value,'، ' ORDER BY cw.target_value)
             FILTER (WHERE cw.target_field='matter_category') category,
           string_agg(DISTINCT cw.target_value,'، ' ORDER BY cw.target_value)
             FILTER (WHERE cw.target_field='matter_type') matter_type,
           string_agg(DISTINCT cw.target_value,'، ' ORDER BY cw.target_value)
             FILTER (WHERE cw.target_field='degree') degree
      FROM (VALUES
        ('matterCategory'::text,q.source_payload->>'matterCategory'),
        ('matterDegree',q.source_payload->>'matterDegree'),
        ('client_branch',q.source_payload->>'clientBranch')
      ) source(source_field,raw_value)
      JOIN migration_crosswalk cw
        ON cw.source_field=source.source_field
       AND _migration.reviewed_text_key(cw.source_value)
           =_migration.reviewed_text_key(source.raw_value)
  ) derived ON true
  LEFT JOIN LATERAL (
    SELECT cw.target_value
      FROM migration_crosswalk cw
     WHERE cw.source_field='court'
       AND cw.target_field IN ('court','SPLIT')
       AND _migration.reviewed_text_key(cw.source_value)
           =_migration.reviewed_text_key(q.source_payload->>'matterCourt')
     LIMIT 1
  ) court_rule ON true
  LEFT JOIN lookup_court direct_court
    ON _migration.reviewed_text_key(direct_court.label_ar)
       =_migration.reviewed_text_key(q.source_payload->>'matterCourt')
 ORDER BY CASE WHEN q.reason_codes=ARRAY['separate_client'] THEN 0 ELSE 1 END,
          q.id`;

const HEARING_QUERY = `
SELECT q.id::text quarantine_id,
       q.src_record_key, q.extraction_sha256, q.src_file, q.src_row_num,
       q.legacy_hearing_id, q.reason_codes, q.reason_details,
       mq.id::text parent_matter_quarantine_id,
       coalesce(mq.source_payload->>'matterAR',m.case_number_ar) parent_case_number,
       coalesce(mq.source_payload->>'matterSubject',m.subject) parent_subject,
       coalesce(nullif(qc.full_name,''),nullif(qc.name_ar,''),nullif(qc.name_en,''),
                nullif(mc.full_name,''),nullif(mc.name_ar,''),nullif(mc.name_en,'')) parent_client,
       q.source_payload->>'التاريخ' hearing_date,
       q.source_payload->>'nextHearing' next_hearing_date,
       q.source_payload->>'المحكمة' source_court,
       coalesce(court_rule.target_value,direct_court.label_ar) derived_court,
       q.source_payload->>'الدائرة' source_circuit,
       substring(court_rule.reviewer_note FROM 'circuit=''([^'']+)''') derived_circuit,
       q.source_payload->>'الإجراء' source_action,
       q.source_payload->>'القرار' source_decision,
       q.source_payload->>'lastDecision' previous_decision,
       q.source_payload->>'صالح/ضد' source_outcome,
       q.source_payload->>'ملاحظات' source_notes,
       q.source_payload->>'shortDecision' short_decision
  FROM quarantine.hearing_transform q
  LEFT JOIN quarantine.matter_transform mq
    ON mq.legacy_matter_id=q.source_payload->>'matterID'
  LEFT JOIN matters m
    ON m.legacy_id::text=q.source_payload->>'matterID'
   AND m.legacy_source_record_key IS NOT NULL
  LEFT JOIN clients qc ON qc.legacy_id::text=mq.source_payload->>'clientID'
  LEFT JOIN clients mc ON mc.id=m.client_id
  LEFT JOIN LATERAL (
    SELECT cw.target_value,cw.reviewer_note
      FROM migration_crosswalk cw
     WHERE cw.source_field='court'
       AND cw.target_field IN ('court','SPLIT')
       AND _migration.reviewed_text_key(cw.source_value)
           =_migration.reviewed_text_key(q.source_payload->>'المحكمة')
     LIMIT 1
  ) court_rule ON true
  LEFT JOIN lookup_court direct_court
    ON _migration.reviewed_text_key(direct_court.label_ar)
       =_migration.reviewed_text_key(q.source_payload->>'المحكمة')
 ORDER BY CASE WHEN q.reason_codes=ARRAY['parent_matter_quarantined'] THEN 0 ELSE 1 END,
          q.id`;

const LOOKUP_QUERY = `
WITH lookup_rows(kind,id,label) AS (
  SELECT 'client',id::bigint,coalesce(nullif(full_name,''),nullif(name_ar,''),nullif(name_en,''))
    FROM clients
  UNION ALL SELECT 'court',id,label_ar FROM lookup_court
  UNION ALL SELECT 'importance',id,label_ar FROM lookup_importance
  UNION ALL SELECT 'branch',id,label_ar FROM lookup_client_branch
  UNION ALL SELECT 'category',id,label_ar FROM lookup_matter_category
  UNION ALL SELECT 'type',id,label_ar FROM lookup_matter_type
)
SELECT kind,id::text,label
  FROM lookup_rows
 ORDER BY kind,label COLLATE "arabic",id`;

const EVIDENCE_DIGEST_QUERY = `
WITH evidence AS (
  SELECT 'matter' kind,id::text id,
         jsonb_build_array('matter',id,src_record_key,extraction_sha256,src_file,
           src_row_num,legacy_matter_id,reason_codes,reason_details,source_payload)::text payload
    FROM quarantine.matter_transform
  UNION ALL
  SELECT 'hearing',id::text,
         jsonb_build_array('hearing',id,src_record_key,extraction_sha256,src_file,
           src_row_num,legacy_hearing_id,reason_codes,reason_details,source_payload)::text
    FROM quarantine.hearing_transform
)
SELECT encode(sha256(convert_to(string_agg(payload,E'\\n' ORDER BY kind,id::bigint),'UTF8')),'hex') digest
  FROM evidence`;

const LOOKUP_DIGEST_QUERY = `
WITH lookups AS (
  SELECT 'client' kind,id::bigint id,
         coalesce(nullif(full_name,''),nullif(name_ar,''),nullif(name_en,'')) label
    FROM clients
  UNION ALL SELECT 'court',id,label_ar FROM lookup_court
  UNION ALL SELECT 'importance',id,label_ar FROM lookup_importance
  UNION ALL SELECT 'branch',id,label_ar FROM lookup_client_branch
  UNION ALL SELECT 'category',id,label_ar FROM lookup_matter_category
  UNION ALL SELECT 'type',id,label_ar FROM lookup_matter_type
)
SELECT encode(sha256(convert_to(string_agg(jsonb_build_array(kind,id,label)::text,E'\\n'
  ORDER BY kind,id),'UTF8')),'hex') digest
  FROM lookups`;

function fail(message: string): never {
  throw new HighImpactWorkbookError(message);
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function fileSha256(buffer: Buffer): string {
  return sha256(buffer);
}

function stripSqlLiteralsAndComments(sql: string): string {
  return sql
    .replace(/--[^\r\n]*/gu, ' ')
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/'(?:''|[^'])*'/gu, "''")
    .replace(/\$[A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z0-9_]*\$/gu, '$$');
}

export function assertReadOnlyQuery(sql: string, label = 'database query'): void {
  const stripped = stripSqlLiteralsAndComments(sql).trim();
  if (!/^(SELECT|WITH)\b/iu.test(stripped)) {
    fail(`${label}: only SELECT or WITH queries are allowed`);
  }
  if (/;\s*\S/u.test(stripped)) fail(`${label}: multiple SQL statements are not allowed`);
  if (
    /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|MERGE|COPY|CALL|DO|VACUUM|ANALYZE|REFRESH)\b/iu.test(
      stripped,
    )
  ) {
    fail(`${label}: database-writing or schema-changing SQL is prohibited`);
  }
}

export function assertReadOnlyTransactionSql(sql: string): void {
  if (sql.trim().replace(/\s+/gu, ' ').toUpperCase() !== READ_ONLY_TRANSACTION_SQL) {
    fail('database snapshot transaction is not repeatable-read and read-only');
  }
}

async function selectRows<T extends QueryResultRow>(
  database: ClientBase,
  sql: string,
  label: string,
): Promise<T[]> {
  assertReadOnlyQuery(sql, label);
  return (await database.query<T>(sql)).rows;
}

function exactReasonCounts(
  rows: readonly { reason_codes: string[] }[],
  expected: ReadonlyMap<string, number>,
  label: string,
): void {
  const actual = new Map<string, number>();
  for (const row of rows) {
    if (row.reason_codes.length !== 1) {
      fail(`${label}: a row has ${row.reason_codes.length} reasons; exactly one is expected`);
    }
    const reason = row.reason_codes[0]!;
    actual.set(reason, (actual.get(reason) ?? 0) + 1);
  }
  if (actual.size !== expected.size) fail(`${label}: reason inventory changed`);
  for (const [reason, count] of expected) {
    if (actual.get(reason) !== count) {
      fail(`${label}: ${reason} has ${actual.get(reason) ?? 0} rows; expected ${count}`);
    }
  }
}

function validateSnapshot(snapshot: HighImpactReviewSnapshot): void {
  if (snapshot.matters.length !== 55)
    fail(`matter quarantine has ${snapshot.matters.length} rows; expected 55`);
  if (snapshot.hearings.length !== 327)
    fail(`hearing quarantine has ${snapshot.hearings.length} rows; expected 327`);
  exactReasonCounts(snapshot.matters, MATTER_REASON_COUNTS, 'matter quarantine');
  exactReasonCounts(snapshot.hearings, HEARING_REASON_COUNTS, 'hearing quarantine');
  if (snapshot.matters.some((row) => row.resolved_at !== null)) {
    fail('a quarantined matter is already resolved; Task 3.5A only packages the untouched queue');
  }
  const fingerprints = new Set([
    ...snapshot.matters.map((row) => row.extraction_sha256),
    ...snapshot.hearings.map((row) => row.extraction_sha256),
  ]);
  if (fingerprints.size !== 1 || !fingerprints.has(EXPECTED_EXTRACTION_SHA256)) {
    fail('quarantine extraction fingerprint changed');
  }
  if (snapshot.databaseEvidenceSha256 !== EXPECTED_DATABASE_EVIDENCE_SHA256) {
    fail('protected matter/hearing quarantine evidence digest changed');
  }
  if (snapshot.databaseLookupSha256 !== EXPECTED_DATABASE_LOOKUP_SHA256) {
    fail('protected review lookup ID/label digest changed');
  }
  const lookupKeys = new Set<string>();
  for (const lookup of snapshot.lookups) {
    if (!EXPECTED_LOOKUP_COUNTS.has(lookup.kind)) fail(`unexpected lookup kind ${lookup.kind}`);
    if (!/^[1-9][0-9]*$/u.test(lookup.id) || lookup.label.trim() === '') {
      fail(`invalid ${lookup.kind} lookup identity`);
    }
    const key = `${lookup.kind}\u0000${lookup.id}`;
    if (lookupKeys.has(key)) fail(`duplicate ${lookup.kind} lookup id ${lookup.id}`);
    lookupKeys.add(key);
  }
  for (const [kind, count] of EXPECTED_LOOKUP_COUNTS) {
    const actual = snapshot.lookups.filter((lookup) => lookup.kind === kind).length;
    if (actual !== count) fail(`${kind} lookup has ${actual} rows; expected ${count}`);
  }
}

export async function readHighImpactReviewSnapshot(
  database: ClientBase,
): Promise<HighImpactReviewSnapshot> {
  assertReadOnlyTransactionSql(READ_ONLY_TRANSACTION_SQL);
  await database.query(READ_ONLY_TRANSACTION_SQL);
  try {
    const matters = await selectRows<MatterDatabaseRow>(database, MATTER_QUERY, 'matter review');
    const hearings = await selectRows<HearingDatabaseRow>(
      database,
      HEARING_QUERY,
      'hearing review',
    );
    const lookups = await selectRows<DatabaseLookup>(database, LOOKUP_QUERY, 'review lookups');
    const evidence = await selectRows<DigestRow>(
      database,
      EVIDENCE_DIGEST_QUERY,
      'quarantine evidence digest',
    );
    const lookupDigest = await selectRows<DigestRow>(
      database,
      LOOKUP_DIGEST_QUERY,
      'lookup digest',
    );
    if (evidence.length !== 1 || lookupDigest.length !== 1)
      fail('database digest query was incomplete');
    const snapshot: HighImpactReviewSnapshot = {
      matters,
      hearings,
      lookups,
      databaseEvidenceSha256: evidence[0]!.digest,
      databaseLookupSha256: lookupDigest[0]!.digest,
    };
    validateSnapshot(snapshot);
    await database.query('COMMIT');
    return snapshot;
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function bounded(value: string, max = 500): string {
  const normalized = value.replace(/\r\n?/gu, '\n');
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 28)}… [اختصار للعرض فقط]`;
}

function sourceText(value: string | null): string {
  if (value === null) return NULL_DISPLAY;
  if (value === '') return EMPTY_TEXT_DISPLAY;
  return bounded(value);
}

function optionalText(value: string | null): string {
  return value === null || value === '' ? '—' : bounded(value);
}

function combinedStatus(status: string | null, current: string | null): string {
  return `الحالة: ${sourceText(status)}\nالموقف الحالي: ${sourceText(current)}`;
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    separate_client: 'العميل المسجل غير صحيح',
    unmapped_importance: 'قيمة الأهمية غير معروفة',
    branch_requires_review: 'الفرع يحتاج إلى قرار المكتب',
    'classification_conflict:matter_category': 'تعارض في تصنيف الدعوى',
    'classification_conflict:matter_type': 'تعارض في نوع الدعوى',
    court_remainder_is_hearing_note: 'جزء من نص المحكمة يخص ملاحظة جلسة',
    matter_no_client: 'لا يوجد عميل في المصدر',
    parent_matter_quarantined: 'الدعوى الأصلية قيد المراجعة',
    court_circuit_conflict: 'تعارض في الدائرة',
    unmapped_court: 'اسم المحكمة غير معروف',
  };
  return labels[reason] ?? fail(`no Arabic review label for ${reason}`);
}

function targetKindFor(reason: string): TargetKind {
  const targets: Record<string, TargetKind> = {
    separate_client: 'client',
    matter_no_client: 'client',
    unmapped_importance: 'importance',
    branch_requires_review: 'branch',
    'classification_conflict:matter_category': 'category',
    'classification_conflict:matter_type': 'type',
    court_remainder_is_hearing_note: 'text',
    parent_matter_quarantined: 'parent',
    court_circuit_conflict: 'circuit',
    unmapped_court: 'court',
  };
  return targets[reason] ?? fail(`no target contract for ${reason}`);
}

function targetKindLabel(kind: TargetKind): string {
  const labels: Record<TargetKind, string> = {
    client: 'عميل موجود (المعرّف والاسم)',
    court: 'محكمة موجودة (المعرّف والاسم)',
    importance: 'درجة أهمية موجودة (المعرّف والاسم)',
    branch: 'فرع موجود (المعرّف والاسم)',
    category: 'تصنيف دعوى موجود (المعرّف والاسم)',
    type: 'نوع دعوى موجود (المعرّف والاسم)',
    circuit: 'نص الدائرة المعتمد',
    text: 'النص الصريح الذي اعتمده المكتب',
    parent: NOT_APPLICABLE_DISPLAY,
  };
  return labels[kind];
}

function detailsObject(value: unknown): Record<string, unknown> {
  const first = Array.isArray(value) ? value[0] : null;
  return first !== null && typeof first === 'object' ? (first as Record<string, unknown>) : {};
}

function detailString(value: unknown): string {
  if (value === null || value === undefined) return NULL_DISPLAY;
  if (Array.isArray(value)) return value.map(detailString).join('، ');
  return bounded(String(value));
}

function matterReasonDetails(row: MatterDatabaseRow): string {
  const reason = row.reason_codes[0]!;
  const detail = detailsObject(row.reason_details);
  if (reason.startsWith('classification_conflict:')) {
    return `القيم المتعارضة: ${detailString(detail['target_values'])}`;
  }
  if (reason === 'court_remainder_is_hearing_note') {
    const note = String(detail['reviewer_note'] ?? '');
    const match = note.match(/hearing_note='([^']+)'/u);
    return `نص المحكمة: ${detailString(detail['matterCourt'])}\nجزء مخصص للجلسة: ${sourceText(match?.[1] ?? null)}`;
  }
  if (reason === 'separate_client') {
    return `رقم العميل الحالي: ${detailString(detail['clientID'])}\nنص الفرع: ${detailString(detail['clientBranch'])}`;
  }
  if (reason === 'branch_requires_review') {
    return `نص الفرع المطلوب مراجعته: ${detailString(detail['clientBranch'])}`;
  }
  if (reason === 'unmapped_importance') {
    return `قيمة الأهمية: ${detailString(detail['matterImportance'])}`;
  }
  return `رقم العميل في المصدر: ${detailString(detail['clientID'])}`;
}

function hearingReasonDetails(row: HearingDatabaseRow): string {
  const reason = row.reason_codes[0]!;
  const detail = detailsObject(row.reason_details);
  if (reason === 'court_circuit_conflict') {
    return `الدائرة في المصدر: ${detailString(detail['legacy_circuit_raw'])}\nالدائرة المستخرجة من اسم المحكمة: ${detailString(detail['reviewed_circuit'])}`;
  }
  if (reason === 'unmapped_court') return `اسم المحكمة: ${detailString(detail['value'])}`;
  return `أسباب حجز الدعوى الأصلية: ${detailString(detail['matter_reason_codes'])}`;
}

function reviewId(kind: ReviewKind, id: string): string {
  if (!/^[1-9][0-9]*$/u.test(id)) fail(`invalid ${kind} quarantine id ${id}`);
  return `${kind === 'matter' ? 'M' : 'H'}-${id.padStart(6, '0')}`;
}

export function prepareReviewRows(snapshot: HighImpactReviewSnapshot): PreparedReviewRow[] {
  validateSnapshot(snapshot);
  const matterReviewIds = new Map(
    snapshot.matters.map((row) => [row.quarantine_id, reviewId('matter', row.quarantine_id)]),
  );
  const matters: PreparedReviewRow[] = snapshot.matters.map((row) => {
    const reason = row.reason_codes[0]!;
    const targetKind = targetKindFor(reason);
    const id = reviewId('matter', row.quarantine_id);
    const evidence = [
      id,
      reasonLabel(reason),
      reason === 'separate_client' ? 'أولوية قصوى' : 'أولوية عادية',
      sourceText(row.legacy_matter_id),
      sourceText(row.case_number),
      sourceText(row.subject),
      sourceText(row.associated_client),
      sourceText(row.source_client_id),
      sourceText(row.source_client_text),
      sourceText(row.source_branch),
      sourceText(row.source_category),
      optionalText(row.derived_category),
      optionalText(row.derived_type),
      sourceText(row.source_degree),
      optionalText(row.derived_degree),
      sourceText(row.source_importance),
      sourceText(row.source_court),
      optionalText(row.derived_court),
      sourceText(row.source_circuit),
      combinedStatus(row.source_status, row.source_current_status),
      matterReasonDetails(row),
      String(row.linked_quarantined_hearings),
      targetKindLabel(targetKind),
    ];
    return {
      sheet: reason === 'separate_client' ? VISIBLE_SHEETS[1] : VISIBLE_SHEETS[2],
      reviewId: id,
      kind: 'matter',
      quarantineId: row.quarantine_id,
      sourceRecordKey: row.src_record_key,
      sourceFile: row.src_file,
      sourceRowNumber: row.src_row_num,
      legacyId: row.legacy_matter_id,
      extractionSha256: row.extraction_sha256,
      reasonCodes: row.reason_codes,
      reasonDetailsJson: canonicalJson(row.reason_details),
      parentMatterReviewId: null,
      targetKind,
      evidence,
    };
  });

  const hearings: PreparedReviewRow[] = snapshot.hearings.map((row) => {
    const reason = row.reason_codes[0]!;
    const targetKind = targetKindFor(reason);
    const id = reviewId('hearing', row.quarantine_id);
    const parentId =
      row.parent_matter_quarantine_id === null
        ? null
        : (matterReviewIds.get(row.parent_matter_quarantine_id) ??
          fail(`hearing ${id} names an unknown quarantined parent`));
    if ((reason === 'parent_matter_quarantined') !== (parentId !== null)) {
      fail(`hearing ${id} has an inconsistent parent quarantine identity`);
    }
    const evidence = [
      id,
      reasonLabel(reason),
      reason === 'parent_matter_quarantined' ? 'تابعة لقرار الدعوى' : 'أولوية عالية',
      sourceText(row.legacy_hearing_id),
      parentId ?? '—',
      sourceText(row.parent_case_number),
      sourceText(row.parent_client),
      sourceText(row.parent_subject),
      sourceText(row.hearing_date),
      sourceText(row.next_hearing_date),
      sourceText(row.source_court),
      optionalText(row.derived_court),
      sourceText(row.source_circuit),
      optionalText(row.derived_circuit),
      sourceText(row.source_action),
      sourceText(row.source_decision),
      sourceText(row.previous_decision),
      sourceText(row.source_outcome),
      sourceText(row.source_notes),
      sourceText(row.short_decision),
      hearingReasonDetails(row),
      targetKindLabel(targetKind),
    ];
    return {
      sheet: reason === 'parent_matter_quarantined' ? VISIBLE_SHEETS[3] : VISIBLE_SHEETS[4],
      reviewId: id,
      kind: 'hearing',
      quarantineId: row.quarantine_id,
      sourceRecordKey: row.src_record_key,
      sourceFile: row.src_file,
      sourceRowNumber: row.src_row_num,
      legacyId: row.legacy_hearing_id,
      extractionSha256: row.extraction_sha256,
      reasonCodes: row.reason_codes,
      reasonDetailsJson: canonicalJson(row.reason_details),
      parentMatterReviewId: parentId,
      targetKind,
      evidence,
    };
  });
  const rows = [...matters, ...hearings];
  const ids = new Set(rows.map((row) => row.reviewId));
  if (rows.length !== 382 || ids.size !== 382)
    fail('prepared review identities are not 382 unique rows');
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.sheet, (counts.get(row.sheet) ?? 0) + 1);
  const expected = new Map<string, number>([
    [VISIBLE_SHEETS[1], 14],
    [VISIBLE_SHEETS[2], 41],
    [VISIBLE_SHEETS[3], 313],
    [VISIBLE_SHEETS[4], 14],
  ]);
  for (const [sheet, count] of expected) {
    if (counts.get(sheet) !== count)
      fail(`${sheet} has ${counts.get(sheet) ?? 0} rows; expected ${count}`);
  }
  return rows;
}

function identityRow(row: PreparedReviewRow): IdentityRow {
  const { evidence: _evidence, ...identity } = row;
  void _evidence;
  return { ...identity, visibleContextSha256: sha256(canonicalJson(row.evidence)) };
}

function identityPayload(row: IdentityRow): unknown[] {
  return [
    row.sheet,
    row.reviewId,
    row.kind,
    row.quarantineId,
    row.sourceRecordKey,
    row.sourceFile,
    row.sourceRowNumber,
    row.legacyId,
    row.extractionSha256,
    row.reasonCodes,
    row.reasonDetailsJson,
    row.parentMatterReviewId,
    row.targetKind,
    row.visibleContextSha256,
  ];
}

export function identityManifestSha256(rows: readonly IdentityRow[]): string {
  const ordered = [...rows].sort((left, right) =>
    left.kind === right.kind
      ? Number(left.quarantineId) - Number(right.quarantineId)
      : left.kind.localeCompare(right.kind, 'en'),
  );
  return sha256(ordered.map((row) => canonicalJson(identityPayload(row))).join('\n'));
}

function lookupChoice(id: string, label: string): string {
  return `${id} — ${label}`;
}

function lookupManifestRows(snapshot: HighImpactReviewSnapshot): LookupManifestRow[] {
  const rows: LookupManifestRow[] = [
    ...DECISION_STATUSES.map((label, index) => ({
      kind: 'decision_status' as const,
      id: String(index + 1),
      label,
      choice: label,
      databaseBacked: false,
    })),
    ...PARENT_DECISION_STATUSES.map((label, index) => ({
      kind: 'parent_decision_status' as const,
      id: String(index + 1),
      label,
      choice: label,
      databaseBacked: false,
    })),
    ...snapshot.lookups.map((lookup) => ({
      ...lookup,
      choice: lookupChoice(lookup.id, lookup.label),
      databaseBacked: true,
    })),
  ];
  return rows;
}

export function lookupManifestSha256(rows: readonly LookupManifestRow[]): string {
  return sha256(
    rows
      .map((row) => canonicalJson([row.kind, row.id, row.label, row.choice, row.databaseBacked]))
      .join('\n'),
  );
}

function styleHeader(sheet: ExcelJS.Worksheet, headers: readonly string[]): void {
  const row = sheet.addRow([...headers]);
  row.height = 48;
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.protection = { locked: true };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
}

function calculatedHeight(values: readonly string[], widths: readonly number[]): number {
  let lines = 1;
  values.forEach((value, index) => {
    const width = Math.max(8, widths[index] ?? 20);
    const valueLines = value
      .split(/\r?\n/u)
      .reduce(
        (total, line) => total + Math.max(1, Math.ceil([...line].length / Math.max(6, width - 2))),
        0,
      );
    lines = Math.max(lines, valueLines);
  });
  return Math.max(30, Math.min(210, 16 * lines + 8));
}

function listValidation(name: string): ExcelJS.DataValidation {
  return {
    type: 'list',
    allowBlank: true,
    formulae: [`=${name}`],
    showErrorMessage: true,
    errorTitle: 'قيمة غير معتمدة',
    error: 'اختر قيمة من القائمة فقط.',
  };
}

function textValidation(maximum: number): ExcelJS.DataValidation {
  return {
    type: 'textLength',
    operator: 'lessThanOrEqual',
    allowBlank: true,
    formulae: [maximum],
    showErrorMessage: true,
    errorTitle: 'النص أطول من المسموح',
    error: `الحد الأقصى ${maximum} حرفًا.`,
  };
}

function namedRangeForTarget(kind: TargetKind): string | null {
  const ranges: Partial<Record<TargetKind, string>> = {
    client: 'ClientChoices',
    court: 'CourtChoices',
    importance: 'ImportanceChoices',
    branch: 'BranchChoices',
    category: 'CategoryChoices',
    type: 'TypeChoices',
  };
  return ranges[kind] ?? null;
}

async function protectVisibleSheet(sheet: ExcelJS.Worksheet): Promise<void> {
  await sheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    autoFilter: true,
    sort: true,
    insertRows: false,
    deleteRows: false,
  });
}

async function addReviewSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  rows: readonly PreparedReviewRow[],
  evidenceHeaders: readonly string[],
  widths: readonly number[],
): Promise<void> {
  const headers = [...evidenceHeaders, ...ANSWER_HEADERS];
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = widths.map((width) => ({ width }));
  styleHeader(sheet, headers);
  const answerStart = evidenceHeaders.length + 1;
  for (const review of rows) {
    const row = sheet.addRow([...review.evidence, '', '', '', '', '']);
    row.height = calculatedHeight(review.evidence, widths);
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = { horizontal: 'right', vertical: 'top', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: BORDER } },
        bottom: { style: 'thin', color: { argb: BORDER } },
        left: { style: 'thin', color: { argb: BORDER } },
        right: { style: 'thin', color: { argb: BORDER } },
      };
      if (column < answerStart) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EVIDENCE_FILL } };
        cell.protection = { locked: true };
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EDITABLE_FILL } };
        cell.protection = { locked: false };
      }
    });
    row.getCell(3).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb:
          review.reasonCodes[0] === 'separate_client'
            ? HIGHEST_PRIORITY_FILL
            : NORMAL_PRIORITY_FILL,
      },
    };
    const decisionCell = row.getCell(answerStart);
    const targetCell = row.getCell(answerStart + 1);
    const reviewerCell = row.getCell(answerStart + 2);
    const dateCell = row.getCell(answerStart + 3);
    const noteCell = row.getCell(answerStart + 4);
    decisionCell.dataValidation = listValidation(
      review.targetKind === 'parent' ? 'ParentDecisionStatuses' : 'DecisionStatuses',
    );
    const targetRange = namedRangeForTarget(review.targetKind);
    if (targetRange !== null) targetCell.dataValidation = listValidation(targetRange);
    else if (review.targetKind === 'circuit' || review.targetKind === 'text') {
      targetCell.dataValidation = textValidation(500);
    } else {
      targetCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: LOCKED_TARGET_FILL },
      };
      targetCell.protection = { locked: true };
      targetCell.value = NOT_APPLICABLE_DISPLAY;
    }
    reviewerCell.dataValidation = textValidation(200);
    dateCell.numFmt = 'yyyy-mm-dd';
    dateCell.dataValidation = {
      type: 'date',
      operator: 'between',
      allowBlank: true,
      formulae: [new Date('2000-01-01T00:00:00Z'), new Date('2100-12-31T00:00:00Z')],
      showErrorMessage: true,
      errorTitle: 'تاريخ غير صحيح',
      error: 'أدخل تاريخًا صحيحًا.',
    };
    noteCell.dataValidation = textValidation(2000);
  }
  await protectVisibleSheet(sheet);
}

function addCoverSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet(VISIBLE_SHEETS[0], {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [{ width: 24 }, { width: 112 }];
  styleHeader(sheet, ['البند', 'التعليمات']);
  const instructions: Array<[string, string]> = [
    [
      'الغرض',
      'حُجزت هذه السجلات لأن تحويلها يحتاج إلى قرار صريح من المكتب. لم يُحذف أي سجل أو أي قيمة.',
    ],
    [
      'الأولوية القصوى',
      'ابدأ بورقة «العميل غير الصحيح». تضم 14 دعوى مرتبطة بعميل غير صحيح، وهي أعلى أولوية.',
    ],
    [
      'عدم التخمين',
      'لا تخمّن عميلاً أو محكمة أو تصنيفًا أو دائرة. اختر قرارًا صريحًا فقط، أو اتركه للنقاش.',
    ],
    [
      'الخلايا المسموح بها',
      'اكتب فقط في الخلايا الزرقاء التي يبدأ عنوانها بالسهم ←. الخلايا الرمادية دليل مقفول.',
    ],
    [
      'التصحيح',
      'عند اختيار «تصحيح معتمد»، اختر الهدف الذي اعتمده المكتب أو اكتب النص المطلوب بحسب نوع الهدف المبين في الصف.',
    ],
    [
      'قرار نهائي بلا حل',
      '«يبقى قيد المراجعة دون حل» قرار نهائي صحيح عندما يقرر المكتب صراحة عدم ربط السجل أو تصحيحه الآن.',
    ],
    ['غير مكتمل', 'الصف الفارغ أو «يحتاج إلى نقاش» ليس قرارًا مكتملًا، ولا يجعل Task 3.5 مكتملة.'],
    [
      'الجلسات التابعة',
      '«يتبع القرار المعتمد للدعوى» صالح فقط بعد اكتمال قرار الدعوى الأصلية المذكور رقم مراجعتها في الصف.',
    ],
    [
      'مفاتيح الاختيار',
      'اختيارات العملاء والمحاكم والتصنيفات تعرض معرّف قاعدة البيانات مع الاسم. الاسم العربي وحده ليس مفتاح الربط.',
    ],
    [
      'المراجع والتاريخ',
      'لكل قرار نهائي، اكتب اسم مراجع المكتب وتاريخ المراجعة. يمكن إضافة ملاحظة توضح القرار.',
    ],
  ];
  for (const [topic, instruction] of instructions) {
    const row = sheet.addRow([topic, instruction]);
    row.height = calculatedHeight([topic, instruction], [24, 112]);
    row.eachCell((cell, column) => {
      cell.font = { name: 'Arial', size: 11, bold: column === 1 };
      cell.alignment = { horizontal: 'right', vertical: 'top', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EVIDENCE_FILL } };
      cell.protection = { locked: true };
    });
  }
  void protectVisibleSheet(sheet);
}

function addLookupSheet(workbook: ExcelJS.Workbook, rows: readonly LookupManifestRow[]): void {
  const sheet = workbook.addWorksheet(LOOKUP_SHEET, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  sheet.state = 'veryHidden';
  sheet.columns = [{ width: 26 }, { width: 16 }, { width: 70 }, { width: 88 }, { width: 18 }];
  sheet.addRow(['lookup_kind', 'database_id_or_code', 'label', 'choice', 'database_backed']);
  const ranges = new Map<string, { start: number; end: number }>();
  const rangeNames: Record<LookupManifestRow['kind'], string> = {
    decision_status: 'DecisionStatuses',
    parent_decision_status: 'ParentDecisionStatuses',
    client: 'ClientChoices',
    court: 'CourtChoices',
    importance: 'ImportanceChoices',
    branch: 'BranchChoices',
    category: 'CategoryChoices',
    type: 'TypeChoices',
  };
  rows.forEach((entry) => {
    const row = sheet.addRow([
      entry.kind,
      entry.id,
      entry.label,
      entry.choice,
      entry.databaseBacked ? 'true' : 'false',
    ]);
    const range = ranges.get(entry.kind);
    if (range === undefined) ranges.set(entry.kind, { start: row.number, end: row.number });
    else range.end = row.number;
  });
  for (const [kind, range] of ranges) {
    workbook.definedNames.add(
      `${LOOKUP_SHEET}!$D$${range.start}:$D$${range.end}`,
      rangeNames[kind as LookupManifestRow['kind']],
    );
  }
  void sheet.protect('', { selectLockedCells: true, selectUnlockedCells: false });
}

function addIdentitySheet(
  workbook: ExcelJS.Workbook,
  rows: readonly IdentityRow[],
  snapshot: HighImpactReviewSnapshot,
  identityDigest: string,
  lookupDigest: string,
): void {
  const sheet = workbook.addWorksheet(IDENTITY_SHEET);
  sheet.state = 'veryHidden';
  sheet.addRow(['format', HIGH_IMPACT_FORMAT]);
  sheet.addRow(['extraction_sha256', EXPECTED_EXTRACTION_SHA256]);
  sheet.addRow(['database_evidence_sha256', snapshot.databaseEvidenceSha256]);
  sheet.addRow(['database_lookup_sha256', snapshot.databaseLookupSha256]);
  sheet.addRow(['identity_manifest_sha256', identityDigest]);
  sheet.addRow(['lookup_manifest_sha256', lookupDigest]);
  sheet.addRow([
    'sheet',
    'review_id',
    'kind',
    'quarantine_id',
    'source_table',
    'source_record_key',
    'source_file',
    'source_row_number',
    'legacy_id_json',
    'extraction_sha256',
    'reason_codes_json',
    'reason_details_json',
    'parent_matter_review_id_json',
    'target_kind',
    'visible_context_sha256',
  ]);
  for (const row of rows) {
    sheet.addRow([
      row.sheet,
      row.reviewId,
      row.kind,
      row.quarantineId,
      row.kind === 'matter' ? 'quarantine.matter_transform' : 'quarantine.hearing_transform',
      row.sourceRecordKey,
      row.sourceFile,
      row.sourceRowNumber,
      JSON.stringify(row.legacyId),
      row.extractionSha256,
      canonicalJson(row.reasonCodes),
      row.reasonDetailsJson,
      JSON.stringify(row.parentMatterReviewId),
      row.targetKind,
      row.visibleContextSha256,
    ]);
  }
  void sheet.protect('', { selectLockedCells: true, selectUnlockedCells: false });
}

export async function buildHighImpactWorkbook(
  snapshot: HighImpactReviewSnapshot,
): Promise<WorkbookBuildResult> {
  const reviewRows = prepareReviewRows(snapshot);
  const identities = reviewRows.map(identityRow);
  const identityDigest = identityManifestSha256(identities);
  const lookupRows = lookupManifestRows(snapshot);
  const lookupDigest = lookupManifestSha256(lookupRows);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Litigation migration — Task 3.5A';
  workbook.lastModifiedBy = 'Litigation migration — Task 3.5A';
  workbook.created = new Date('2026-09-03T00:00:00.000Z');
  workbook.modified = new Date('2026-09-03T00:00:00.000Z');
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 20_000,
      height: 20_000,
      activeTab: 0,
      firstSheet: 0,
      visibility: 'visible',
    },
  ];
  addCoverSheet(workbook);
  await addReviewSheet(
    workbook,
    VISIBLE_SHEETS[1],
    reviewRows.filter((row) => row.sheet === VISIBLE_SHEETS[1]),
    MATTER_HEADERS,
    MATTER_WIDTHS,
  );
  await addReviewSheet(
    workbook,
    VISIBLE_SHEETS[2],
    reviewRows.filter((row) => row.sheet === VISIBLE_SHEETS[2]),
    MATTER_HEADERS,
    MATTER_WIDTHS,
  );
  await addReviewSheet(
    workbook,
    VISIBLE_SHEETS[3],
    reviewRows.filter((row) => row.sheet === VISIBLE_SHEETS[3]),
    HEARING_HEADERS,
    HEARING_WIDTHS,
  );
  await addReviewSheet(
    workbook,
    VISIBLE_SHEETS[4],
    reviewRows.filter((row) => row.sheet === VISIBLE_SHEETS[4]),
    HEARING_HEADERS,
    HEARING_WIDTHS,
  );
  addIdentitySheet(workbook, identities, snapshot, identityDigest, lookupDigest);
  addLookupSheet(workbook, lookupRows);
  return {
    workbook,
    reviewRows,
    identityManifestSha256: identityDigest,
    lookupManifestSha256: lookupDigest,
  };
}

function cellText(value: ExcelJS.CellValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  if (typeof value === 'object' && 'text' in value) return String(value.text ?? '');
  return String(value);
}

function nullableJson(value: ExcelJS.CellValue, where: string): string | null {
  try {
    const parsed: unknown = JSON.parse(cellText(value));
    if (parsed === null || typeof parsed === 'string') return parsed;
  } catch {
    // The contract error below is clearer than a JSON parser error.
  }
  fail(`${where}: nullable identity is not JSON null or a JSON string`);
}

function parseIdentityRows(workbook: ExcelJS.Workbook): {
  rows: IdentityRow[];
  identityDigest: string;
  lookupDigest: string;
} {
  const sheet = workbook.getWorksheet(IDENTITY_SHEET);
  if (sheet === undefined || sheet.state !== 'veryHidden')
    fail(`${IDENTITY_SHEET} is missing or not very hidden`);
  const metadata = [
    ['format', HIGH_IMPACT_FORMAT],
    ['extraction_sha256', EXPECTED_EXTRACTION_SHA256],
    ['database_evidence_sha256', EXPECTED_DATABASE_EVIDENCE_SHA256],
    ['database_lookup_sha256', EXPECTED_DATABASE_LOOKUP_SHA256],
  ] as const;
  metadata.forEach(([label, value], index) => {
    if (sheet.getCell(index + 1, 1).text !== label || sheet.getCell(index + 1, 2).text !== value) {
      fail(`${IDENTITY_SHEET}: ${label} changed`);
    }
  });
  const recordedIdentityDigest = sheet.getCell('B5').text.trim();
  const recordedLookupDigest = sheet.getCell('B6').text.trim();
  if (
    !/^[0-9a-f]{64}$/u.test(recordedIdentityDigest) ||
    !/^[0-9a-f]{64}$/u.test(recordedLookupDigest)
  ) {
    fail(`${IDENTITY_SHEET}: manifest digest is missing or malformed`);
  }
  const expectedHeader = [
    'sheet',
    'review_id',
    'kind',
    'quarantine_id',
    'source_table',
    'source_record_key',
    'source_file',
    'source_row_number',
    'legacy_id_json',
    'extraction_sha256',
    'reason_codes_json',
    'reason_details_json',
    'parent_matter_review_id_json',
    'target_kind',
    'visible_context_sha256',
  ];
  if (expectedHeader.some((header, index) => sheet.getRow(7).getCell(index + 1).text !== header)) {
    fail(`${IDENTITY_SHEET}: identity header changed`);
  }
  const rows: IdentityRow[] = [];
  const ids = new Set<string>();
  for (let rowNumber = 8; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.values.length === 0) continue;
    const kind = row.getCell(3).text as ReviewKind;
    const targetKind = row.getCell(14).text as TargetKind;
    if (kind !== 'matter' && kind !== 'hearing')
      fail(`${IDENTITY_SHEET} row ${rowNumber}: invalid kind`);
    if (
      ![
        'client',
        'court',
        'importance',
        'branch',
        'category',
        'type',
        'circuit',
        'text',
        'parent',
      ].includes(targetKind)
    ) {
      fail(`${IDENTITY_SHEET} row ${rowNumber}: invalid target kind`);
    }
    let reasonCodes: unknown;
    try {
      reasonCodes = JSON.parse(row.getCell(11).text);
    } catch {
      fail(`${IDENTITY_SHEET} row ${rowNumber}: malformed reason identity`);
    }
    if (!Array.isArray(reasonCodes) || reasonCodes.some((reason) => typeof reason !== 'string')) {
      fail(`${IDENTITY_SHEET} row ${rowNumber}: invalid reason identity`);
    }
    const review: IdentityRow = {
      sheet: row.getCell(1).text as PreparedReviewRow['sheet'],
      reviewId: row.getCell(2).text,
      kind,
      quarantineId: row.getCell(4).text,
      sourceRecordKey: row.getCell(6).text,
      sourceFile: row.getCell(7).text,
      sourceRowNumber: Number(row.getCell(8).text),
      legacyId: nullableJson(row.getCell(9).value, `${IDENTITY_SHEET} row ${rowNumber}`),
      extractionSha256: row.getCell(10).text,
      reasonCodes: reasonCodes as string[],
      reasonDetailsJson: row.getCell(12).text,
      parentMatterReviewId: nullableJson(
        row.getCell(13).value,
        `${IDENTITY_SHEET} row ${rowNumber}`,
      ),
      targetKind,
      visibleContextSha256: row.getCell(15).text,
    };
    const expectedSourceTable =
      kind === 'matter' ? 'quarantine.matter_transform' : 'quarantine.hearing_transform';
    if (row.getCell(5).text !== expectedSourceTable)
      fail(`${review.reviewId}: source table changed`);
    if (ids.has(review.reviewId)) fail(`${IDENTITY_SHEET}: duplicate ${review.reviewId}`);
    ids.add(review.reviewId);
    rows.push(review);
  }
  if (rows.length !== 382) fail(`${IDENTITY_SHEET}: ${rows.length} identities; expected 382`);
  const actualDigest = identityManifestSha256(rows);
  if (actualDigest !== recordedIdentityDigest)
    fail(`${IDENTITY_SHEET}: identity manifest digest mismatch`);
  return { rows, identityDigest: actualDigest, lookupDigest: recordedLookupDigest };
}

function parseLookupRows(workbook: ExcelJS.Workbook): LookupManifestRow[] {
  const sheet = workbook.getWorksheet(LOOKUP_SHEET);
  if (sheet === undefined || sheet.state !== 'veryHidden')
    fail(`${LOOKUP_SHEET} is missing or not very hidden`);
  const header = ['lookup_kind', 'database_id_or_code', 'label', 'choice', 'database_backed'];
  if (header.some((name, index) => sheet.getRow(1).getCell(index + 1).text !== name)) {
    fail(`${LOOKUP_SHEET}: lookup header changed`);
  }
  const rows: LookupManifestRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.values.length === 0) continue;
    const kind = row.getCell(1).text as LookupManifestRow['kind'];
    const databaseBacked = row.getCell(5).text;
    if (
      ![
        'decision_status',
        'parent_decision_status',
        'client',
        'court',
        'importance',
        'branch',
        'category',
        'type',
      ].includes(kind)
    ) {
      fail(`${LOOKUP_SHEET} row ${rowNumber}: invalid lookup kind`);
    }
    if (databaseBacked !== 'true' && databaseBacked !== 'false') {
      fail(`${LOOKUP_SHEET} row ${rowNumber}: invalid lookup classification`);
    }
    rows.push({
      kind,
      id: row.getCell(2).text,
      label: row.getCell(3).text,
      choice: row.getCell(4).text,
      databaseBacked: databaseBacked === 'true',
    });
  }
  return rows;
}

function assertWorkbookShape(workbook: ExcelJS.Workbook): void {
  const expectedSheets = [...VISIBLE_SHEETS, IDENTITY_SHEET, LOOKUP_SHEET];
  const actualSheets = workbook.worksheets.map((sheet) => sheet.name);
  if (canonicalJson(actualSheets) !== canonicalJson(expectedSheets))
    fail('workbook sheet inventory or order changed');
  for (const name of VISIBLE_SHEETS) {
    const sheet = workbook.getWorksheet(name)!;
    if (sheet.state !== 'visible') fail(`${name}: visible sheet is hidden`);
    const view = sheet.views[0];
    if (view?.rightToLeft !== true || view.state !== 'frozen' || view.ySplit !== 1) {
      fail(`${name}: RTL or frozen heading row changed`);
    }
    if (sheet.autoFilter === undefined) fail(`${name}: heading filter is missing`);
    if (sheet.getRow(1).height === undefined || sheet.getRow(1).height! < 40) {
      fail(`${name}: wrapped heading height is too small`);
    }
    sheet.getRow(1).eachCell((cell) => {
      if (cell.alignment?.wrapText !== true) fail(`${name}: a heading is not wrapped`);
    });
    if (sheet.columns.some((column) => (column.width ?? 0) < 12))
      fail(`${name}: a column is too narrow`);
    if (!worksheetIsProtected(sheet)) fail(`${name}: evidence sheet protection is missing`);
  }
  for (const name of [IDENTITY_SHEET, LOOKUP_SHEET]) {
    const sheet = workbook.getWorksheet(name);
    if (sheet === undefined || !worksheetIsProtected(sheet)) fail(`${name}: protection is missing`);
  }
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.value !== null && typeof cell.value === 'object' && 'formula' in cell.value) {
          fail(`${sheet.name}!${cell.address}: formulas are not permitted in the review package`);
        }
      });
    });
  });
}

function worksheetIsProtected(sheet: ExcelJS.Worksheet): boolean {
  return (
    (sheet as ExcelJS.Worksheet & { sheetProtection?: { sheet?: boolean } }).sheetProtection
      ?.sheet === true
  );
}

function assertNamedRanges(workbook: ExcelJS.Workbook): void {
  for (const name of [
    'DecisionStatuses',
    'ParentDecisionStatuses',
    'ClientChoices',
    'CourtChoices',
    'ImportanceChoices',
    'BranchChoices',
    'CategoryChoices',
    'TypeChoices',
  ]) {
    const ranges = workbook.definedNames.getRanges(name).ranges;
    if (ranges.length !== 1 || !ranges[0]!.replaceAll("'", '').startsWith(`${LOOKUP_SHEET}!$D$`)) {
      fail(`named validation range ${name} is missing or broken`);
    }
  }
}

function validationFormula(cell: ExcelJS.Cell): string {
  return String(cell.dataValidation?.formulae?.[0] ?? '');
}

function dateValue(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf()))
    return value.toISOString().slice(0, 10);
  const text = cellText(value).trim();
  if (text === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) return 'invalid';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text
    ? 'invalid'
    : text;
}

function lookupMaps(rows: readonly LookupManifestRow[]): Map<DatabaseLookupKind, Set<string>> {
  const result = new Map<DatabaseLookupKind, Set<string>>();
  for (const row of rows) {
    if (!row.databaseBacked) continue;
    const kind = row.kind as DatabaseLookupKind;
    const choices = result.get(kind) ?? new Set<string>();
    choices.add(row.choice);
    result.set(kind, choices);
  }
  return result;
}

export function validateHighImpactWorkbook(
  workbook: ExcelJS.Workbook,
  snapshot: HighImpactReviewSnapshot,
): WorkbookValidationResult {
  validateSnapshot(snapshot);
  assertWorkbookShape(workbook);
  assertNamedRanges(workbook);
  const expectedRows = prepareReviewRows(snapshot);
  const expectedIdentities = new Map(expectedRows.map((row) => [row.reviewId, identityRow(row)]));
  const parsedIdentity = parseIdentityRows(workbook);
  const identityById = new Map(parsedIdentity.rows.map((row) => [row.reviewId, row]));
  if (identityById.size !== parsedIdentity.rows.length) fail('identity rows are duplicated');
  for (const [id, expected] of expectedIdentities) {
    const actual = identityById.get(id);
    if (actual === undefined) fail(`${id}: identity is missing`);
    if (canonicalJson(identityPayload(actual)) !== canonicalJson(identityPayload(expected))) {
      fail(`${id}: source identity, fingerprint, reason or context identity changed`);
    }
  }
  const parsedLookups = parseLookupRows(workbook);
  const expectedLookups = lookupManifestRows(snapshot);
  const actualLookupDigest = lookupManifestSha256(parsedLookups);
  if (actualLookupDigest !== parsedIdentity.lookupDigest)
    fail(`${LOOKUP_SHEET}: lookup manifest digest mismatch`);
  if (canonicalJson(parsedLookups) !== canonicalJson(expectedLookups)) {
    fail(`${LOOKUP_SHEET}: database ID/label association changed`);
  }
  const choices = lookupMaps(parsedLookups);
  const visibleRows = new Map<
    string,
    {
      identity: IdentityRow;
      decision: string;
      target: string;
      reviewer: string;
      date: string | null;
      note: string;
    }
  >();
  for (const sheetName of [...MATTER_SHEETS, ...HEARING_SHEETS]) {
    const sheet = workbook.getWorksheet(sheetName)!;
    const evidenceHeaders = MATTER_SHEETS.includes(sheetName as (typeof MATTER_SHEETS)[number])
      ? MATTER_HEADERS
      : HEARING_HEADERS;
    const expectedHeaders = [...evidenceHeaders, ...ANSWER_HEADERS];
    if (
      expectedHeaders.some((header, index) => sheet.getRow(1).getCell(index + 1).text !== header)
    ) {
      fail(`${sheetName}: visible header contract changed`);
    }
    const answerStart = evidenceHeaders.length + 1;
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const id = row.getCell(1).text.trim();
      if (id === '') {
        let hasContent = false;
        row.eachCell({ includeEmpty: true }, (cell) => {
          if (cell.text.trim() !== '') hasContent = true;
        });
        if (hasContent) {
          fail(`${sheetName} row ${rowNumber}: content has no review identity`);
        }
        continue;
      }
      if (visibleRows.has(id)) fail(`${sheetName}: duplicate visible review id ${id}`);
      const identity = identityById.get(id);
      if (identity === undefined) fail(`${sheetName}: added or unknown review id ${id}`);
      if (identity.sheet !== sheetName) fail(`${id}: moved to a different review sheet`);
      const evidence = evidenceHeaders.map((_, index) => row.getCell(index + 1).text);
      if (sha256(canonicalJson(evidence)) !== identity.visibleContextSha256) {
        fail(`${id}: visible evidence moved or changed without its identity`);
      }
      for (let column = 1; column < answerStart; column += 1) {
        if (row.getCell(column).protection?.locked === false)
          fail(`${id}: evidence cell became editable`);
      }
      const decisionCell = row.getCell(answerStart);
      const targetCell = row.getCell(answerStart + 1);
      const reviewerCell = row.getCell(answerStart + 2);
      const dateCell = row.getCell(answerStart + 3);
      const noteCell = row.getCell(answerStart + 4);
      for (const cell of [decisionCell, reviewerCell, dateCell, noteCell]) {
        if (cell.protection?.locked !== false) fail(`${id}: an answer cell is not editable`);
        if (cell.fill.type !== 'pattern' || cell.fill.fgColor?.argb !== EDITABLE_FILL) {
          fail(`${id}: editable-cell styling changed`);
        }
      }
      const expectedStatusRange =
        identity.targetKind === 'parent' ? '=ParentDecisionStatuses' : '=DecisionStatuses';
      if (validationFormula(decisionCell) !== expectedStatusRange)
        fail(`${id}: decision dropdown changed`);
      const targetRange = namedRangeForTarget(identity.targetKind);
      if (targetRange !== null) {
        if (
          targetCell.protection?.locked !== false ||
          validationFormula(targetCell) !== `=${targetRange}`
        ) {
          fail(`${id}: target dropdown changed`);
        }
      } else if (identity.targetKind === 'parent') {
        if (targetCell.protection?.locked === false || targetCell.text !== NOT_APPLICABLE_DISPLAY) {
          fail(`${id}: parent-following target cell changed`);
        }
      } else if (
        targetCell.protection?.locked !== false ||
        targetCell.dataValidation.type !== 'textLength'
      ) {
        fail(`${id}: free-text target contract changed`);
      }
      visibleRows.set(id, {
        identity,
        decision: decisionCell.text.trim(),
        target: identity.targetKind === 'parent' ? '' : targetCell.text.trim(),
        reviewer: reviewerCell.text.trim(),
        date: dateValue(dateCell.value),
        note: noteCell.text.trim(),
      });
    }
  }
  if (visibleRows.size !== 382)
    fail(`visible workbook has ${visibleRows.size} review rows; expected 382`);
  for (const id of identityById.keys())
    if (!visibleRows.has(id)) fail(`${id}: visible review row is missing`);

  const states = new Map<string, 'completed' | 'incomplete' | 'invalid'>();
  const issues: string[] = [];
  let answered = 0;
  for (const [id, row] of visibleRows) {
    const hasAnswer =
      row.decision !== '' ||
      row.target !== '' ||
      row.reviewer !== '' ||
      row.date !== null ||
      row.note !== '';
    if (hasAnswer) answered += 1;
    let state: 'completed' | 'incomplete' | 'invalid' = 'incomplete';
    let issue = '';
    const statusSet =
      row.identity.targetKind === 'parent' ? PARENT_DECISION_STATUSES : DECISION_STATUSES;
    if (row.decision !== '' && !(statusSet as readonly string[]).includes(row.decision)) {
      state = 'invalid';
      issue = 'حالة القرار ليست من القائمة المعتمدة';
    } else if (row.date === 'invalid') {
      state = 'invalid';
      issue = 'تاريخ المراجعة غير صحيح';
    } else if (row.decision === '') {
      if (row.target !== '') {
        state = 'invalid';
        issue = 'تم اختيار هدف بلا حالة قرار';
      } else issue = 'القرار فارغ';
    } else if (row.decision === 'يحتاج إلى نقاش') {
      if (row.target !== '') {
        state = 'invalid';
        issue = 'لا يجوز اعتماد هدف بينما القرار يحتاج إلى نقاش';
      } else issue = 'القرار ما زال يحتاج إلى نقاش';
    } else if (row.decision === 'يبقى قيد المراجعة دون حل') {
      if (row.target !== '') {
        state = 'invalid';
        issue = 'قرار البقاء دون حل لا يقبل هدفًا معتمدًا';
      } else if (row.reviewer === '' || row.date === null)
        issue = 'اسم المراجع وتاريخ المراجعة مطلوبان';
      else state = 'completed';
    } else if (row.decision === 'تصحيح معتمد') {
      if (row.target === '') issue = 'هدف التصحيح مطلوب';
      else if (row.reviewer === '' || row.date === null)
        issue = 'اسم المراجع وتاريخ المراجعة مطلوبان';
      else {
        const kind = row.identity.targetKind;
        if (['client', 'court', 'importance', 'branch', 'category', 'type'].includes(kind)) {
          const available = choices.get(kind as DatabaseLookupKind);
          if (available === undefined || !available.has(row.target)) {
            state = 'invalid';
            issue = 'الهدف المختار لم يعد موجودًا بنفس المعرّف والاسم';
          } else state = 'completed';
        } else if (kind === 'circuit' || kind === 'text') state = 'completed';
        else {
          state = 'invalid';
          issue = 'نوع الهدف لا يقبل تصحيحًا مباشرًا';
        }
      }
    } else if (row.decision === 'يتبع القرار المعتمد للدعوى') {
      if (row.reviewer === '' || row.date === null) issue = 'اسم المراجع وتاريخ المراجعة مطلوبان';
      else state = 'completed';
    }
    states.set(id, state);
    if (issue !== '') issues.push(`${id}: ${issue}`);
  }
  for (const [id, row] of visibleRows) {
    if (row.decision !== 'يتبع القرار المعتمد للدعوى') continue;
    const parent = row.identity.parentMatterReviewId;
    if (parent === null || states.get(parent) !== 'completed') {
      if (states.get(id) !== 'invalid')
        issues.push(`${id}: لا يمكن اتباع قرار دعوى أصلية غير مكتمل`);
      states.set(id, 'invalid');
    }
  }
  const completed = [...states.values()].filter((state) => state === 'completed').length;
  const incomplete = [...states.values()].filter((state) => state === 'incomplete').length;
  const invalid = [...states.values()].filter((state) => state === 'invalid').length;
  return {
    total: states.size,
    answered,
    completed,
    incomplete,
    invalid,
    complete: states.size === 382 && completed === 382 && incomplete === 0 && invalid === 0,
    issues,
    identityManifestSha256: parsedIdentity.identityDigest,
    lookupManifestSha256: actualLookupDigest,
  };
}

export type ArtifactGitState = { ignored: boolean; tracked: boolean };

export function assertArtifactGitSafety(path: string, state: ArtifactGitState): void {
  if (!state.ignored || state.tracked) {
    fail(`${path}: review workbook artifacts must stay ignored and untracked`);
  }
}

export function inspectArtifactGitState(path: string): ArtifactGitState {
  const ignored = spawnSync('git', ['check-ignore', '-q', '--', path], { encoding: 'utf8' });
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', path], {
    encoding: 'utf8',
  });
  if (![0, 1].includes(ignored.status ?? -1) || ![0, 1].includes(tracked.status ?? -1)) {
    fail(`${path}: Git artifact-state check failed`);
  }
  return { ignored: ignored.status === 0, tracked: tracked.status === 0 };
}

export function assertWorkbookArtifactSafety(path: string): void {
  assertArtifactGitSafety(path, inspectArtifactGitState(path));
}

export function answerColumnIndexes(kind: ReviewKind): {
  decision: number;
  target: number;
  reviewer: number;
  date: number;
  note: number;
} {
  const start = (kind === 'matter' ? MATTER_HEADERS.length : HEARING_HEADERS.length) + 1;
  return {
    decision: start,
    target: start + 1,
    reviewer: start + 2,
    date: start + 3,
    note: start + 4,
  };
}
