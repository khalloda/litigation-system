import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';

type SourceDocument = {
  src_record_key: string;
  src_extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  legacy_id_raw: string | null;
  client_name_raw: string | null;
  matter_ref_raw: string | null;
  description: string | null;
  document_date_raw: string | null;
  page_count_raw: string | null;
  deposit_date_raw: string | null;
  responsible_raw: string | null;
  notes: string | null;
  movement_card: string | null;
  client_id_raw: string | null;
  source_payload: Record<string, unknown>;
};
type Basic = { id: number };
type Matter = { id: number; case_number_ar: string | null };
type MatterQ = {
  src_record_key: string;
  case_number_ar: string | null;
  reason_codes: string[];
};
type Alias = { alias_ar: string; person_id: number };
type Exclusion = { raw_value: string; reason: string };
type Detail = Record<string, unknown>;

export type DocumentTargetPlan = {
  srcRecordKey: string;
  extractionSha256: string;
  legacyId: number;
  clientId: number | null;
  legacyClientNameRaw: string | null;
  matterId: number | null;
  legacyMatterRefRaw: string | null;
  description: string | null;
  documentDate: string | null;
  pageCount: number | null;
  legacyPageCountRaw: string | null;
  depositDate: string | null;
  responsiblePersonId: number | null;
  legacyResponsibleRaw: string | null;
  notes: string | null;
  movementCard: string | null;
  storageLocation: null;
  mfilesId: null;
  legacyMfilesIdRaw: null;
  sourcePayload: Record<string, unknown>;
};
export type DocumentQuarantinePlan = {
  srcRecordKey: string;
  extractionSha256: string;
  srcFile: string;
  srcRowNum: number;
  legacyIdRaw: string | null;
  reasonCodes: string[];
  reasonDetails: Detail[];
  sourcePayload: Record<string, unknown>;
};
export type DocumentEvidencePlan = {
  srcRecordKey: string;
  extractionSha256: string;
  srcFile: string;
  srcRowNum: number;
  fieldKind: 'client' | 'matter' | 'responsible_person' | 'page_count' | 'mfiles_id';
  rawValue: string | null;
  reasonCode: string;
  reasonDetail: Detail;
  sourcePayload: Record<string, unknown>;
};
export type DocumentTransformPlan = {
  sourceCount: number;
  targets: DocumentTargetPlan[];
  quarantine: DocumentQuarantinePlan[];
  evidence: DocumentEvidencePlan[];
};

function integer(value: string | null): number | null {
  if (value === null || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2147483647 ? parsed : null;
}
function date(value: string | null): string | null {
  if (value === null) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) 00:00:00$/);
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return d.getUTCFullYear() === Number(match[1]) &&
    d.getUTCMonth() === Number(match[2]) - 1 &&
    d.getUTCDate() === Number(match[3])
    ? `${match[1]}-${match[2]}-${match[3]}`
    : null;
}
function q(row: SourceDocument, reasons: Map<string, Detail>): DocumentQuarantinePlan {
  const entries = [...reasons.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'));
  return {
    srcRecordKey: row.src_record_key,
    extractionSha256: row.src_extraction_sha256,
    srcFile: row.src_file,
    srcRowNum: row.src_row_num,
    legacyIdRaw: row.legacy_id_raw,
    reasonCodes: entries.map(([code]) => code),
    reasonDetails: entries.map(([, detail]) => detail),
    sourcePayload: row.source_payload,
  };
}
function evidence(
  row: SourceDocument,
  fieldKind: DocumentEvidencePlan['fieldKind'],
  rawValue: string | null,
  reasonCode: string,
  reasonDetail: Detail,
): DocumentEvidencePlan {
  return {
    srcRecordKey: row.src_record_key,
    extractionSha256: row.src_extraction_sha256,
    srcFile: row.src_file,
    srcRowNum: row.src_row_num,
    fieldKind,
    rawValue,
    reasonCode,
    reasonDetail,
    sourcePayload: row.source_payload,
  };
}

export async function buildDocumentTransformPlan(db: ClientBase): Promise<DocumentTransformPlan> {
  const source = await db.query<SourceDocument>(`
    SELECT d.src_record_key,d.src_extraction_sha256,d.src_file,d.src_row_num,
      d."مسلسل المستند ID" legacy_id_raw,d."العميل" client_name_raw,d."رقم الدعوى" matter_ref_raw,
      d."بيان المستند" description,d."تاريخ المستند" document_date_raw,d."عدد الأوراق" page_count_raw,
      d."تاريخ الإيداع" deposit_date_raw,d."المحامي/الموظف المسئول" responsible_raw,
      d."ملاحظات" notes,d."بطاقة الحركة" movement_card,d."clientID" client_id_raw,
      to_jsonb(d)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] source_payload
    FROM staging."المستندات" d ORDER BY d.src_record_key`);
  const clients = await db.query<Basic & { legacy_id: number }>(
    'SELECT id,legacy_id FROM clients WHERE legacy_id IS NOT NULL',
  );
  const matters = await db.query<Matter>(
    'SELECT id,case_number_ar FROM matters WHERE legacy_source_record_key IS NOT NULL',
  );
  const matterQ = await db.query<MatterQ>(`
    SELECT src_record_key,source_payload->>'matterAR' case_number_ar,reason_codes
      FROM quarantine.matter_transform ORDER BY src_record_key`);
  const aliases = await db.query<Alias>('SELECT alias_ar,person_id FROM person_name_alias');
  const exclusions = await db.query<Exclusion>(
    'SELECT raw_value,reason FROM migration_excluded_name',
  );
  const clientMap = new Map(clients.rows.map((row) => [String(row.legacy_id), row.id]));
  const matterMap = new Map<string, number[]>();
  for (const row of matters.rows)
    if (row.case_number_ar !== null)
      matterMap.set(row.case_number_ar, [...(matterMap.get(row.case_number_ar) ?? []), row.id]);
  const qMatterMap = new Map<string, MatterQ[]>();
  for (const row of matterQ.rows) {
    if (row.case_number_ar === null) continue;
    qMatterMap.set(row.case_number_ar, [...(qMatterMap.get(row.case_number_ar) ?? []), row]);
  }
  const aliasMap = new Map(aliases.rows.map((row) => [row.alias_ar, row.person_id]));
  const exclusionMap = new Map(exclusions.rows.map((row) => [row.raw_value, row.reason]));
  const targets: DocumentTargetPlan[] = [];
  const quarantine: DocumentQuarantinePlan[] = [];
  const outputEvidence: DocumentEvidencePlan[] = [];
  for (const row of source.rows) {
    const fatal = new Map<string, Detail>();
    const legacyId = integer(row.legacy_id_raw);
    if (legacyId === null) fatal.set('invalid_document_id', { value: row.legacy_id_raw });
    const documentDate = date(row.document_date_raw);
    if (row.document_date_raw !== null && documentDate === null)
      fatal.set('invalid_document_date', { value: row.document_date_raw });
    const depositDate = date(row.deposit_date_raw);
    if (row.deposit_date_raw !== null && depositDate === null)
      fatal.set('invalid_deposit_date', { value: row.deposit_date_raw });
    if (fatal.size > 0 || legacyId === null) {
      quarantine.push(q(row, fatal));
      continue;
    }

    const clientId = row.client_id_raw === null ? null : (clientMap.get(row.client_id_raw) ?? null);
    if (clientId === null && row.client_id_raw !== null)
      outputEvidence.push(
        evidence(row, 'client', row.client_id_raw, 'unresolved_client_link', {
          clientID: row.client_id_raw,
        }),
      );
    let matterId: number | null = null;
    if (row.matter_ref_raw !== null) {
      const matches = matterMap.get(row.matter_ref_raw) ?? [];
      if (matches.length === 1) matterId = matches[0]!;
      else if (matches.length > 1)
        outputEvidence.push(
          evidence(row, 'matter', row.matter_ref_raw, 'ambiguous_matter_reference', {
            value: row.matter_ref_raw,
            matter_ids: matches,
          }),
        );
      else if (qMatterMap.has(row.matter_ref_raw)) {
        const quarantinedMatters = qMatterMap.get(row.matter_ref_raw)!;
        const ordered = quarantinedMatters
          .map((matter) => ({
            source_record_key: matter.src_record_key,
            reason_codes: [...matter.reason_codes].sort((left, right) =>
              left.localeCompare(right, 'en'),
            ),
          }))
          .sort((left, right) => left.source_record_key.localeCompare(right.source_record_key));
        outputEvidence.push(
          evidence(row, 'matter', row.matter_ref_raw, 'parent_matter_quarantined', {
            value: row.matter_ref_raw,
            ...(ordered.length === 1
              ? { matter_reason_codes: ordered[0]!.reason_codes }
              : {
                  matter_source_keys: ordered.map((matter) => matter.source_record_key),
                  matter_reason_codes: ordered,
                }),
          }),
        );
      } else
        outputEvidence.push(
          evidence(row, 'matter', row.matter_ref_raw, 'unresolved_matter_reference', {
            value: row.matter_ref_raw,
          }),
        );
    }
    let responsiblePersonId: number | null = null;
    if (row.responsible_raw !== null) {
      responsiblePersonId = aliasMap.get(row.responsible_raw) ?? null;
      if (responsiblePersonId === null) {
        const excluded = exclusionMap.get(row.responsible_raw);
        outputEvidence.push(
          evidence(
            row,
            'responsible_person',
            row.responsible_raw,
            excluded === undefined ? 'unreviewed_responsible_person' : 'reviewed_exclusion',
            excluded === undefined
              ? { value: row.responsible_raw }
              : { value: row.responsible_raw, reason: excluded },
          ),
        );
      }
    }
    const pageCount = integer(row.page_count_raw);
    if (row.page_count_raw !== null && pageCount === null)
      outputEvidence.push(
        evidence(row, 'page_count', row.page_count_raw, 'compound_page_count', {
          value: row.page_count_raw,
        }),
      );
    targets.push({
      srcRecordKey: row.src_record_key,
      extractionSha256: row.src_extraction_sha256,
      legacyId,
      clientId,
      legacyClientNameRaw: row.client_name_raw,
      matterId,
      legacyMatterRefRaw: row.matter_ref_raw,
      description: row.description,
      documentDate,
      pageCount,
      legacyPageCountRaw: row.page_count_raw,
      depositDate,
      responsiblePersonId,
      legacyResponsibleRaw: row.responsible_raw,
      notes: row.notes,
      movementCard: row.movement_card,
      storageLocation: null,
      mfilesId: null,
      legacyMfilesIdRaw: null,
      sourcePayload: row.source_payload,
    });
  }
  assert.equal(targets.length + quarantine.length, source.rows.length);
  assert.equal(new Set(targets.map((row) => row.srcRecordKey)).size, targets.length);
  assert.equal(
    new Set(outputEvidence.map((row) => `${row.srcRecordKey}:${row.fieldKind}`)).size,
    outputEvidence.length,
  );
  return { sourceCount: source.rows.length, targets, quarantine, evidence: outputEvidence };
}
