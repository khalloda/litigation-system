import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
type FeeSource = {
  src_record_key: string;
  src_extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  contract_id_raw: string | null;
  mfiles_id_raw: string | null;
  contract_type: string | null;
  contract_date_raw: string | null;
  contract_details: string | null;
  contract_structure: string | null;
  client_name: string | null;
  client_id_raw: string | null;
  status: string | null;
  source_payload: Record<string, unknown>;
};
type LinkSource = {
  src_record_key: string;
  src_extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  parent_key: string | null;
  ordinal_raw: string | null;
  value: string | null;
  source_payload: Record<string, unknown>;
};
type MatterSource = {
  src_record_key: string;
  src_extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  legacy_matter_id: string | null;
  reference_raw: string;
  source_payload: Record<string, unknown>;
};
type Detail = Record<string, unknown>;
type MatterQ = {
  src_record_key: string;
  legacy_matter_id: string | null;
  case_number_ar: string | null;
  reason_codes: string[];
};
export type FeeTarget = {
  srcRecordKey: string;
  extractionSha256: string;
  contractId: number;
  clientId: number;
  clientName: string | null;
  mfilesId: string | null;
  legacyMfilesIdRaw: string | null;
  contractType: string | null;
  contractDate: string | null;
  contractDetails: string | null;
  contractStructure: string | null;
  status: string | null;
  sourcePayload: Record<string, unknown>;
};
export type ForwardTarget = {
  srcRecordKey: string;
  extractionSha256: string;
  feeSourceKey: string;
  matterId: number;
  legacyMatterRef: string;
  ordinal: number;
  legacyParentContractIdRaw: string;
  sourcePayload: Record<string, unknown>;
};
export type ReverseTarget = {
  srcRecordKey: string;
  extractionSha256: string;
  matterId: number;
  feeSourceKey: string;
  identifierSpace: 'contract_id' | 'mfiles_id';
  legacyReferenceRaw: string;
  sourcePayload: Record<string, unknown>;
};
export type Q = {
  srcRecordKey: string;
  extractionSha256: string;
  srcFile: string;
  srcRowNum: number;
  reasonCodes: string[];
  reasonDetails: Detail[];
  sourcePayload: Record<string, unknown>;
  contractIdRaw?: string | null;
  parentKey?: string | null;
  ordinalRaw?: string | null;
  matterRefRaw?: string | null;
  legacyMatterId?: string | null;
  referenceRaw?: string;
  identifierSpace?: 'contract_id' | 'mfiles_id';
  resolvedFeeSourceKey?: string;
};
export type FeePlan = {
  feeSourceCount: number;
  forwardSourceCount: number;
  reverseSourceCount: number;
  fees: FeeTarget[];
  feeQuarantine: Q[];
  forward: ForwardTarget[];
  forwardQuarantine: Q[];
  reverse: ReverseTarget[];
  reverseQuarantine: Q[];
  referenceCounts: { contract: number; mfiles: number; both: number; neither: number };
};
const int = (v: string | null) => {
  if (v === null || !/^[0-9]+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n <= 2147483647 ? n : null;
};
const date = (v: string | null) => {
  if (v === null) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2}) 00:00:00$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! &&
    d.getUTCMonth() === +m[2]! - 1 &&
    d.getUTCDate() === +m[3]!
    ? `${m[1]}-${m[2]}-${m[3]}`
    : null;
};
function q(
  row: {
    src_record_key: string;
    src_extraction_sha256: string;
    src_file: string;
    src_row_num: number;
    source_payload: Record<string, unknown>;
  },
  reasons: Map<string, Detail>,
): Q {
  const x = [...reasons].sort(([a], [b]) => a.localeCompare(b, 'en'));
  return {
    srcRecordKey: row.src_record_key,
    extractionSha256: row.src_extraction_sha256,
    srcFile: row.src_file,
    srcRowNum: row.src_row_num,
    reasonCodes: x.map(([c]) => c),
    reasonDetails: x.map(([, d]) => d),
    sourcePayload: row.source_payload,
  };
}
export async function buildFeeLetterPlan(
  db: ClientBase,
  expectedReferenceCounts?: FeePlan['referenceCounts'],
): Promise<FeePlan> {
  const answer = await db.query<{ firm_answer: string | null; firm_note: string | null }>(
    `SELECT firm_answer,firm_note FROM quarantine.review_value WHERE id=1331 AND topic='open_question' AND value='Does الدعاوى.[خطاب الأتعاب] point at contractID OR mfilesID, depending on the value?'`,
  );
  assert.equal(answer.rows.length, 1, 'reviewed fee-reference answer missing');
  assert.equal(answer.rows[0]!.firm_answer, 'depending on the value');
  assert.equal(
    answer.rows[0]!.firm_note,
    'Both are contract IDs, but the access file were here before we operated mfiles, starting the usage of mfiles we used the file ID in mfiles that refere to the contract.',
  );
  const fees = await db.query<FeeSource>(
    `SELECT f.src_record_key,f.src_extraction_sha256,f.src_file,f.src_row_num,f."contractID" contract_id_raw,f."mfilesID" mfiles_id_raw,f."Cont-Type" contract_type,f."Cont-Date" contract_date_raw,f."Cont-Details" contract_details,f."Cont-Structure" contract_structure,f."Client" client_name,f."clientID" client_id_raw,f."Status" status,to_jsonb(f)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] source_payload FROM staging."خطابات الأتعاب" f ORDER BY f.src_record_key`,
  );
  const links = await db.query<LinkSource>(
    `SELECT v.src_record_key,v.src_extraction_sha256,v.src_file,v.src_row_num,v.parent_key,v.ordinal ordinal_raw,v.value,to_jsonb(v)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] source_payload FROM staging."خطابات الأتعاب__Matter" v ORDER BY v.src_record_key`,
  );
  const refs = await db.query<MatterSource>(
    `SELECT m.src_record_key,m.src_extraction_sha256,m.src_file,m.src_row_num,m."matterID" legacy_matter_id,m."خطاب الأتعاب" reference_raw,to_jsonb(m)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] source_payload FROM staging."الدعاوى" m WHERE m."خطاب الأتعاب" IS NOT NULL ORDER BY m.src_record_key`,
  );
  const clients = await db.query<{ id: number; legacy_id: number }>(
    'SELECT id,legacy_id FROM clients WHERE legacy_id IS NOT NULL',
  );
  const matters = await db.query<{
    id: number;
    legacy_source_record_key: string;
    case_number_ar: string | null;
  }>(
    'SELECT id,legacy_source_record_key,case_number_ar FROM matters WHERE legacy_source_record_key IS NOT NULL ORDER BY id',
  );
  const matterQ = await db.query<MatterQ>(
    `SELECT src_record_key,legacy_matter_id,source_payload->>'matterAR' case_number_ar,reason_codes FROM quarantine.matter_transform ORDER BY src_record_key`,
  );
  const clientMap = new Map(clients.rows.map((x) => [String(x.legacy_id), x.id]));
  const matterBySource = new Map(matters.rows.map((x) => [x.legacy_source_record_key, x.id]));
  const qBySource = new Map(matterQ.rows.map((x) => [x.src_record_key, x]));
  const matterByCase = new Map<string, number[]>();
  for (const m of matters.rows)
    if (m.case_number_ar !== null)
      matterByCase.set(m.case_number_ar, [...(matterByCase.get(m.case_number_ar) ?? []), m.id]);
  const qByCase = new Map<string, MatterQ[]>();
  for (const m of matterQ.rows)
    if (m.case_number_ar !== null)
      qByCase.set(m.case_number_ar, [...(qByCase.get(m.case_number_ar) ?? []), m]);
  const feeTargets: FeeTarget[] = [];
  const feeQ: Q[] = [];
  const feeSourceByContract = new Map<string, FeeSource>();
  const feeSourcesByMfiles = new Map<string, FeeSource[]>();
  for (const row of fees.rows) {
    const reasons = new Map<string, Detail>();
    const contractId = int(row.contract_id_raw);
    if (contractId === null) reasons.set('invalid_contract_id', { value: row.contract_id_raw });
    const clientId = row.client_id_raw === null ? null : (clientMap.get(row.client_id_raw) ?? null);
    if (clientId === null) reasons.set('invalid_client_link', { clientID: row.client_id_raw });
    if (feeSourceByContract.has(row.contract_id_raw ?? ''))
      reasons.set('duplicate_contract_id', { value: row.contract_id_raw });
    const contractDate = date(row.contract_date_raw);
    if (row.contract_date_raw !== null && contractDate === null)
      reasons.set('invalid_contract_date', { value: row.contract_date_raw });
    if (reasons.size || contractId === null || clientId === null) {
      feeQ.push({ ...q(row, reasons), contractIdRaw: row.contract_id_raw });
      continue;
    }
    feeSourceByContract.set(row.contract_id_raw!, row);
    if (row.mfiles_id_raw !== null)
      feeSourcesByMfiles.set(row.mfiles_id_raw, [
        ...(feeSourcesByMfiles.get(row.mfiles_id_raw) ?? []),
        row,
      ]);
    feeTargets.push({
      srcRecordKey: row.src_record_key,
      extractionSha256: row.src_extraction_sha256,
      contractId,
      clientId,
      clientName: row.client_name,
      mfilesId: row.mfiles_id_raw,
      legacyMfilesIdRaw: row.mfiles_id_raw,
      contractType: row.contract_type,
      contractDate,
      contractDetails: row.contract_details,
      contractStructure: row.contract_structure,
      status: row.status,
      sourcePayload: row.source_payload,
    });
  }
  assert.equal(feeQ.length, 0, 'current fee-letter parents must all be safe');
  const forward: ForwardTarget[] = [];
  const forwardQ: Q[] = [];
  for (const row of links.rows) {
    const reasons = new Map<string, Detail>();
    const parent = row.parent_key === null ? undefined : feeSourceByContract.get(row.parent_key);
    if (!parent) reasons.set('invalid_fee_letter_parent', { parent_key: row.parent_key });
    const ordinal = int(row.ordinal_raw);
    if (ordinal === null) reasons.set('invalid_ordinal', { value: row.ordinal_raw });
    const candidates = row.value === null ? [] : (matterByCase.get(row.value) ?? []);
    const quarantined = row.value === null ? [] : (qByCase.get(row.value) ?? []);
    if (candidates.length > 1)
      reasons.set('ambiguous_matter_reference', { value: row.value, matter_ids: candidates });
    else if (candidates.length === 0 && quarantined.length > 0)
      reasons.set('parent_matter_quarantined', {
        value: row.value,
        matter_source_keys: quarantined.map((x) => x.src_record_key).sort(),
        matter_reason_codes: quarantined.map((x) => x.reason_codes),
      });
    else if (candidates.length === 0)
      reasons.set('unresolved_matter_reference', { value: row.value });
    if (reasons.size || !parent || ordinal === null || candidates.length !== 1) {
      forwardQ.push({
        ...q(row, reasons),
        parentKey: row.parent_key,
        ordinalRaw: row.ordinal_raw,
        matterRefRaw: row.value,
      });
      continue;
    }
    forward.push({
      srcRecordKey: row.src_record_key,
      extractionSha256: row.src_extraction_sha256,
      feeSourceKey: parent.src_record_key,
      matterId: candidates[0]!,
      legacyMatterRef: row.value!,
      ordinal,
      legacyParentContractIdRaw: row.parent_key!,
      sourcePayload: row.source_payload,
    });
  }
  const reverse: ReverseTarget[] = [];
  const reverseQ: Q[] = [];
  let contract = 0,
    mfiles = 0,
    both = 0,
    neither = 0;
  for (const row of refs.rows) {
    const contractMatch = feeSourceByContract.get(row.reference_raw);
    const mfilesMatches = feeSourcesByMfiles.get(row.reference_raw) ?? [];
    if (contractMatch && mfilesMatches.length) both++;
    else if (!contractMatch && mfilesMatches.length !== 1) neither++;
    else if (contractMatch) contract++;
    else mfiles++;
    assert.ok(
      !(contractMatch && mfilesMatches.length > 0),
      `fee reference matches both identifier spaces: ${row.reference_raw}`,
    );
    assert.ok(
      contractMatch !== undefined || mfilesMatches.length === 1,
      `fee reference matches neither or multiple M-Files rows: ${row.reference_raw}`,
    );
    const fee = contractMatch ?? mfilesMatches[0]!;
    const space = contractMatch ? 'contract_id' : 'mfiles_id';
    const matterId = matterBySource.get(row.src_record_key);
    if (matterId !== undefined) {
      reverse.push({
        srcRecordKey: row.src_record_key,
        extractionSha256: row.src_extraction_sha256,
        matterId,
        feeSourceKey: fee.src_record_key,
        identifierSpace: space,
        legacyReferenceRaw: row.reference_raw,
        sourcePayload: row.source_payload,
      });
    } else {
      const parent = qBySource.get(row.src_record_key);
      assert.ok(parent, 'fee reference parent matter missing from target and quarantine');
      const reasons = new Map<string, Detail>([
        [
          'parent_matter_quarantined',
          { legacy_matter_id: row.legacy_matter_id, matter_reason_codes: parent.reason_codes },
        ],
      ]);
      reverseQ.push({
        ...q(row, reasons),
        legacyMatterId: row.legacy_matter_id,
        referenceRaw: row.reference_raw,
        identifierSpace: space,
        resolvedFeeSourceKey: fee.src_record_key,
      });
    }
  }
  if (expectedReferenceCounts !== undefined)
    assert.deepEqual({ contract, mfiles, both, neither }, expectedReferenceCounts);
  assert.equal(feeTargets.length + feeQ.length, fees.rows.length);
  assert.equal(forward.length + forwardQ.length, links.rows.length);
  assert.equal(reverse.length + reverseQ.length, refs.rows.length);
  return {
    feeSourceCount: fees.rows.length,
    forwardSourceCount: links.rows.length,
    reverseSourceCount: refs.rows.length,
    fees: feeTargets,
    feeQuarantine: feeQ,
    forward,
    forwardQuarantine: forwardQ,
    reverse,
    reverseQuarantine: reverseQ,
    referenceCounts: { contract, mfiles, both, neither },
  };
}
