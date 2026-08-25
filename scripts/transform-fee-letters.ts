import 'dotenv/config';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { Client, type ClientBase } from 'pg';
import {
  buildFeeLetterPlan,
  type FeeTarget,
  type ForwardTarget,
  type ReverseTarget,
  type Q,
} from './lib/fee-letter-transform-plan';
import { reconcileFeeLetters } from './lib/fee-letter-reconciliation';
import { feeLetterStructureFailures } from './lib/fee-letter-structure';
import { task29dProtectedState } from './lib/task29d-protected-state';
type Options = {
  databaseUrl?: string;
  apply?: boolean;
  forceFailure?: boolean;
  expectedReferenceCounts?: {
    contract: number;
    mfiles: number;
    both: number;
    neither: number;
  };
};

async function assertFeeLetterStructure(db: ClientBase): Promise<void> {
  const failures = await feeLetterStructureFailures(db);
  assert.deepEqual(
    failures,
    [],
    `Task 2.9D database safeguards differ from the reviewed definitions:\n${failures.join('\n')}`,
  );
}
async function insertFees(db: ClientBase, rows: readonly FeeTarget[]) {
  await db.query(
    `INSERT INTO fee_letters(contract_id,client_id,mfiles_id,legacy_mfiles_id_raw,client_name,contract_type,contract_date,contract_details,contract_structure,status,legacy_source_record_key,legacy_source_extraction_sha256,legacy_source_payload,updated_at)SELECT x."contractId",x."clientId",x."mfilesId",x."legacyMfilesIdRaw",x."clientName",x."contractType",x."contractDate"::date,x."contractDetails",x."contractStructure",x.status,x."srcRecordKey",x."extractionSha256",x."sourcePayload",CURRENT_TIMESTAMP FROM jsonb_to_recordset($1::jsonb)x("srcRecordKey"text,"extractionSha256"text,"contractId"integer,"clientId"integer,"clientName"text,"mfilesId"text,"legacyMfilesIdRaw"text,"contractType"text,"contractDate"text,"contractDetails"text,"contractStructure"text,status text,"sourcePayload"jsonb)ON CONFLICT(legacy_source_record_key)DO NOTHING`,
    [JSON.stringify(rows)],
  );
}
async function insertForward(db: ClientBase, rows: readonly ForwardTarget[]) {
  await db.query(
    `INSERT INTO fee_letter_matters(fee_letter_id,matter_id,legacy_matter_ref,ordinal,legacy_parent_contract_id_raw,legacy_source_record_key,legacy_source_extraction_sha256,legacy_source_payload,updated_at)SELECT f.id,x."matterId",x."legacyMatterRef",x.ordinal,x."legacyParentContractIdRaw",x."srcRecordKey",x."extractionSha256",x."sourcePayload",CURRENT_TIMESTAMP FROM jsonb_to_recordset($1::jsonb)x("srcRecordKey"text,"extractionSha256"text,"feeSourceKey"text,"matterId"integer,"legacyMatterRef"text,ordinal integer,"legacyParentContractIdRaw"text,"sourcePayload"jsonb)JOIN fee_letters f ON f.legacy_source_record_key=x."feeSourceKey" ON CONFLICT(legacy_source_record_key)DO NOTHING`,
    [JSON.stringify(rows)],
  );
}
async function insertReverse(db: ClientBase, rows: readonly ReverseTarget[]) {
  await db.query(
    `INSERT INTO matter_fee_letter_references(matter_id,fee_letter_id,identifier_space,legacy_reference_raw,legacy_source_record_key,legacy_source_extraction_sha256,legacy_source_payload,updated_at)SELECT x."matterId",f.id,x."identifierSpace",x."legacyReferenceRaw",x."srcRecordKey",x."extractionSha256",x."sourcePayload",CURRENT_TIMESTAMP FROM jsonb_to_recordset($1::jsonb)x("srcRecordKey"text,"extractionSha256"text,"matterId"integer,"feeSourceKey"text,"identifierSpace"text,"legacyReferenceRaw"text,"sourcePayload"jsonb)JOIN fee_letters f ON f.legacy_source_record_key=x."feeSourceKey" ON CONFLICT(legacy_source_record_key)DO NOTHING`,
    [JSON.stringify(rows)],
  );
}
async function insertQ(
  db: ClientBase,
  table: 'fee_letter_transform' | 'fee_letter_matter_transform' | 'matter_fee_letter_reference',
  rows: readonly Q[],
) {
  if (table === 'fee_letter_transform') {
    await db.query(
      `INSERT INTO quarantine.fee_letter_transform(src_record_key,extraction_sha256,src_file,src_row_num,contract_id_raw,reason_codes,reason_details,source_payload)SELECT x."srcRecordKey",x."extractionSha256",x."srcFile",x."srcRowNum",x."contractIdRaw",x."reasonCodes",x."reasonDetails",x."sourcePayload" FROM jsonb_to_recordset($1::jsonb)x("srcRecordKey"text,"extractionSha256"text,"srcFile"text,"srcRowNum"integer,"contractIdRaw"text,"reasonCodes"text[],"reasonDetails"jsonb,"sourcePayload"jsonb)ON CONFLICT(src_record_key)DO NOTHING`,
      [JSON.stringify(rows)],
    );
    return;
  }
  if (table === 'fee_letter_matter_transform') {
    await db.query(
      `INSERT INTO quarantine.fee_letter_matter_transform(src_record_key,extraction_sha256,src_file,src_row_num,parent_contract_id_raw,ordinal_raw,matter_ref_raw,reason_codes,reason_details,source_payload)SELECT x."srcRecordKey",x."extractionSha256",x."srcFile",x."srcRowNum",x."parentKey",x."ordinalRaw",x."matterRefRaw",x."reasonCodes",x."reasonDetails",x."sourcePayload" FROM jsonb_to_recordset($1::jsonb)x("srcRecordKey"text,"extractionSha256"text,"srcFile"text,"srcRowNum"integer,"parentKey"text,"ordinalRaw"text,"matterRefRaw"text,"reasonCodes"text[],"reasonDetails"jsonb,"sourcePayload"jsonb)ON CONFLICT(src_record_key)DO NOTHING`,
      [JSON.stringify(rows)],
    );
    return;
  }
  await db.query(
    `INSERT INTO quarantine.matter_fee_letter_reference(src_record_key,extraction_sha256,src_file,src_row_num,legacy_matter_id,reference_raw,identifier_space,resolved_fee_letter_source_key,reason_codes,reason_details,source_payload)SELECT x."srcRecordKey",x."extractionSha256",x."srcFile",x."srcRowNum",x."legacyMatterId",x."referenceRaw",x."identifierSpace",x."resolvedFeeSourceKey",x."reasonCodes",x."reasonDetails",x."sourcePayload" FROM jsonb_to_recordset($1::jsonb)x("srcRecordKey"text,"extractionSha256"text,"srcFile"text,"srcRowNum"integer,"legacyMatterId"text,"referenceRaw"text,"identifierSpace"text,"resolvedFeeSourceKey"text,"reasonCodes"text[],"reasonDetails"jsonb,"sourcePayload"jsonb)ON CONFLICT(src_record_key)DO NOTHING`,
    [JSON.stringify(rows)],
  );
}
export async function feeResultDigest(db: ClientBase): Promise<string> {
  return (
    (
      await db.query<{ digest: string }>(
        `SELECT encode(sha256(convert_to(coalesce(string_agg(payload,E'\\n'ORDER BY kind,identity),''),'UTF8')),'hex')digest FROM(SELECT'F'kind,legacy_source_record_key identity,to_jsonb(f)::text payload FROM fee_letters f WHERE legacy_source_record_key IS NOT NULL UNION ALL SELECT'L',legacy_source_record_key,to_jsonb(l)::text FROM fee_letter_matters l WHERE legacy_source_record_key IS NOT NULL UNION ALL SELECT'R',legacy_source_record_key,to_jsonb(r)::text FROM matter_fee_letter_references r WHERE legacy_source_record_key IS NOT NULL UNION ALL SELECT'QF',src_record_key,to_jsonb(q)::text FROM quarantine.fee_letter_transform q UNION ALL SELECT'QL',src_record_key,to_jsonb(q)::text FROM quarantine.fee_letter_matter_transform q UNION ALL SELECT'QR',src_record_key,to_jsonb(q)::text FROM quarantine.matter_fee_letter_reference q)result`,
      )
    ).rows[0]?.digest ?? ''
  );
}
export async function runFeeLetterTransform(options: Options = {}) {
  const connectionString = options.databaseUrl ?? process.env['DATABASE_URL'];
  assert.ok(connectionString);
  const db = new Client({ connectionString });
  await db.connect();
  try {
    const expected =
      options.expectedReferenceCounts ??
      (options.databaseUrl === undefined
        ? { contract: 289, mfiles: 123, both: 0, neither: 0 }
        : undefined);
    const preview = await buildFeeLetterPlan(db, expected);
    if (options.apply !== true) return { plan: preview, digest: null };
    const before = await task29dProtectedState(db);
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      await assertFeeLetterStructure(db);
      const plan = await buildFeeLetterPlan(db, expected);
      await insertFees(db, plan.fees);
      await insertQ(db, 'fee_letter_transform', plan.feeQuarantine);
      await insertForward(db, plan.forward);
      await insertQ(db, 'fee_letter_matter_transform', plan.forwardQuarantine);
      await insertReverse(db, plan.reverse);
      await insertQ(db, 'matter_fee_letter_reference', plan.reverseQuarantine);
      if (options.forceFailure) throw new Error('forced late Task 2.9D failure');
      const r = await reconcileFeeLetters(db, {
        ...plan.referenceCounts,
        collisions: options.databaseUrl === undefined ? 2 : undefined,
        collisionRefs: 0,
      });
      assert.deepEqual(r.defects, [], r.defects.join('\n'));
      assert.equal(await task29dProtectedState(db), before);
      await assertFeeLetterStructure(db);
      await db.query('COMMIT');
      return { plan, digest: await feeResultDigest(db) };
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  } finally {
    await db.end();
  }
}
function breakdown(rows: readonly Q[]) {
  const x: Record<string, number> = {};
  for (const row of rows) for (const code of row.reasonCodes) x[code] = (x[code] ?? 0) + 1;
  return x;
}
async function main() {
  const apply = process.argv.includes('--apply');
  const r = await runFeeLetterTransform({ apply });
  console.log(apply ? 'TASK 2.9D APPLIED' : 'TASK 2.9D DRY RUN — no database writes');
  console.log(
    `Fee letters: ${r.plan.feeSourceCount} = ${r.plan.fees.length} transformed + ${r.plan.feeQuarantine.length} quarantined`,
  );
  console.log(
    `Forward links: ${r.plan.forwardSourceCount} = ${r.plan.forward.length} transformed + ${r.plan.forwardQuarantine.length} quarantined ${JSON.stringify(breakdown(r.plan.forwardQuarantine))}`,
  );
  console.log(
    `Matter references: ${r.plan.reverseSourceCount} = ${r.plan.reverse.length} transformed + ${r.plan.reverseQuarantine.length} quarantined ${JSON.stringify(r.plan.referenceCounts)}`,
  );
  if (r.digest) console.log(`Result digest: ${r.digest}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exitCode = 1;
  });
