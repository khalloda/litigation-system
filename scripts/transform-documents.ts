import 'dotenv/config';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { Client, type ClientBase } from 'pg';
import {
  buildDocumentTransformPlan,
  type DocumentEvidencePlan,
  type DocumentQuarantinePlan,
  type DocumentTargetPlan,
} from './lib/document-transform-plan';
import { reconcileDocuments } from './lib/document-reconciliation';
import { documentStructureFailures } from './lib/document-structure';
import { task29cProtectedState } from './lib/task29c-protected-state';
type Options = { databaseUrl?: string; apply?: boolean; forceFailure?: boolean };

async function assertDocumentStructure(db: ClientBase): Promise<void> {
  const failures = await documentStructureFailures(db);
  assert.deepEqual(
    failures,
    [],
    `Task 2.9C database safeguards differ from the reviewed definitions:\n${failures.join('\n')}`,
  );
}

async function insertTargets(db: ClientBase, rows: readonly DocumentTargetPlan[]) {
  await db.query(
    `INSERT INTO documents(
  legacy_id,client_id,legacy_client_name_raw,matter_id,legacy_matter_ref_raw,description,document_date,
  page_count,legacy_page_count_raw,deposit_date,responsible_person_id,legacy_responsible_raw,notes,
  movement_card,storage_location,mfiles_id,legacy_mfiles_id_raw,legacy_source_record_key,
  legacy_source_extraction_sha256,legacy_source_payload,updated_at)
 SELECT x."legacyId",x."clientId",x."legacyClientNameRaw",x."matterId",x."legacyMatterRefRaw",x.description,
  x."documentDate"::date,x."pageCount",x."legacyPageCountRaw",x."depositDate"::date,x."responsiblePersonId",
  x."legacyResponsibleRaw",x.notes,x."movementCard",x."storageLocation",x."mfilesId",x."legacyMfilesIdRaw",
  x."srcRecordKey",x."extractionSha256",x."sourcePayload",CURRENT_TIMESTAMP FROM jsonb_to_recordset($1::jsonb)x(
  "srcRecordKey" text,"extractionSha256" text,"legacyId" integer,"clientId" integer,"legacyClientNameRaw" text,
  "matterId" integer,"legacyMatterRefRaw" text,description text,"documentDate" text,"pageCount" integer,
  "legacyPageCountRaw" text,"depositDate" text,"responsiblePersonId" integer,"legacyResponsibleRaw" text,
  notes text,"movementCard" text,"storageLocation" text,"mfilesId" text,"legacyMfilesIdRaw" text,"sourcePayload" jsonb)
 ON CONFLICT(legacy_source_record_key)DO NOTHING`,
    [JSON.stringify(rows)],
  );
}
async function insertQuarantine(db: ClientBase, rows: readonly DocumentQuarantinePlan[]) {
  await db.query(
    `INSERT INTO quarantine.document_transform(
  src_record_key,extraction_sha256,src_file,src_row_num,legacy_document_id,reason_codes,reason_details,source_payload)
 SELECT x."srcRecordKey",x."extractionSha256",x."srcFile",x."srcRowNum",x."legacyIdRaw",x."reasonCodes",x."reasonDetails",x."sourcePayload"
 FROM jsonb_to_recordset($1::jsonb)x("srcRecordKey" text,"extractionSha256" text,"srcFile" text,"srcRowNum" integer,"legacyIdRaw" text,"reasonCodes" text[],"reasonDetails" jsonb,"sourcePayload" jsonb)
 ON CONFLICT(src_record_key)DO NOTHING`,
    [JSON.stringify(rows)],
  );
}
async function insertEvidence(db: ClientBase, rows: readonly DocumentEvidencePlan[]) {
  await db.query(
    `INSERT INTO quarantine.document_evidence(
  src_record_key,field_kind,extraction_sha256,src_file,src_row_num,raw_value,reason_code,reason_detail,source_payload)
 SELECT x."srcRecordKey",x."fieldKind",x."extractionSha256",x."srcFile",x."srcRowNum",x."rawValue",x."reasonCode",x."reasonDetail",x."sourcePayload"
 FROM jsonb_to_recordset($1::jsonb)x("srcRecordKey" text,"fieldKind" text,"extractionSha256" text,"srcFile" text,"srcRowNum" integer,"rawValue" text,"reasonCode" text,"reasonDetail" jsonb,"sourcePayload" jsonb)
 ON CONFLICT(src_record_key,field_kind)DO NOTHING`,
    [JSON.stringify(rows)],
  );
}
export async function documentResultDigest(db: ClientBase): Promise<string> {
  return (
    (
      await db.query<{
        digest: string;
      }>(`SELECT encode(sha256(convert_to(coalesce(string_agg(payload,E'\\n' ORDER BY kind,identity),''),'UTF8')),'hex') digest FROM(
 SELECT 'D'kind,legacy_source_record_key identity,to_jsonb(d)::text payload FROM documents d WHERE legacy_source_record_key IS NOT NULL
 UNION ALL SELECT 'Q',src_record_key,to_jsonb(q)::text FROM quarantine.document_transform q
 UNION ALL SELECT 'E',src_record_key||':'||field_kind,to_jsonb(e)::text FROM quarantine.document_evidence e)result`)
    ).rows[0]?.digest ?? ''
  );
}
export async function runDocumentTransform(options: Options = {}) {
  const connectionString = options.databaseUrl ?? process.env['DATABASE_URL'];
  assert.ok(connectionString, 'DATABASE_URL is required');
  const db = new Client({ connectionString });
  await db.connect();
  try {
    const preview = await buildDocumentTransformPlan(db);
    if (options.apply !== true) return { plan: preview, digest: null };
    const protectedBefore = await task29cProtectedState(db);
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      await assertDocumentStructure(db);
      const plan = await buildDocumentTransformPlan(db);
      assert.equal(plan.sourceCount, preview.sourceCount);
      await insertTargets(db, plan.targets);
      await insertQuarantine(db, plan.quarantine);
      await insertEvidence(db, plan.evidence);
      if (options.forceFailure) throw new Error('forced late Task 2.9C failure');
      const reconciliation = await reconcileDocuments(db);
      assert.deepEqual(reconciliation.defects, [], reconciliation.defects.join('\n'));
      assert.equal(
        await task29cProtectedState(db),
        protectedBefore,
        'prior protected state changed',
      );
      await assertDocumentStructure(db);
      await db.query('COMMIT');
      return { plan, digest: await documentResultDigest(db) };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } finally {
    await db.end();
  }
}
function breakdown(rows: readonly DocumentEvidencePlan[]) {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.reasonCode] = (out[row.reasonCode] ?? 0) + 1;
  return out;
}
async function main() {
  const apply = process.argv.includes('--apply');
  const result = await runDocumentTransform({ apply });
  console.log(apply ? 'TASK 2.9C APPLIED' : 'TASK 2.9C DRY RUN — no database writes');
  console.log(
    `Documents: ${result.plan.sourceCount} = ${result.plan.targets.length} transformed + ${result.plan.quarantine.length} quarantined`,
  );
  console.log(
    `Evidence: ${result.plan.evidence.length}; reasons: ${JSON.stringify(breakdown(result.plan.evidence))}`,
  );
  if (result.digest) console.log(`Result digest: ${result.digest}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
