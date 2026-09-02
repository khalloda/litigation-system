import 'dotenv/config';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { Client, type ClientBase } from 'pg';
import { assertApprovedMigrationPrincipalSession } from './lib/migration-principal';
import {
  buildPoaTransformPlan,
  type PoaLawyerPlan,
  type PoaQuarantinePlan,
  type PoaRelationshipEvidencePlan,
  type PoaTargetPlan,
} from './lib/poa-transform-plan';
import { reconcilePowersOfAttorney } from './lib/poa-reconciliation';
import { poaStructureFailures } from './lib/poa-structure';
import { task29bProtectedState } from './lib/task29b-protected-state';

type RunOptions = {
  databaseUrl?: string;
  apply?: boolean;
  forceFailure?: boolean;
  expectedCorrectedOccurrences?: readonly number[];
};

async function assertPoaStructure(db: ClientBase): Promise<void> {
  const failures = await poaStructureFailures(db);
  assert.deepEqual(
    failures,
    [],
    `Task 2.9B database safeguards differ from the reviewed definitions:\n${failures.join('\n')}`,
  );
}

async function insertTargets(db: ClientBase, rows: readonly PoaTargetPlan[]): Promise<void> {
  await db.query(
    `
    INSERT INTO powers_of_attorney (
      client_id,client_name,legacy_lawyers_raw,serial_no,principal_name,poa_capacity,
      poa_capacity_duplicate,poa_number,poa_letter,poa_year,issuing_authority,
      issue_date,copies_count,notes,show_on_poa_report,legacy_source_record_key,
      legacy_source_extraction_sha256,legacy_source_payload,updated_at)
    SELECT x."clientId",x."clientName",x."legacyLawyersRaw",x."serialNo",x."principalName",
           x."poaCapacity",x."poaCapacityDuplicate",x."poaNumber",x."poaLetter",x."poaYear",
           x."issuingAuthority",x."issueDate"::date,x."copiesCount",x.notes,x."showOnPoaReport",
           x."srcRecordKey",x."extractionSha256",x."sourcePayload",CURRENT_TIMESTAMP
      FROM jsonb_to_recordset($1::jsonb) AS x(
        "srcRecordKey" text,"extractionSha256" text,"clientId" integer,"clientName" text,
        "legacyLawyersRaw" text,"serialNo" text,"principalName" text,"poaCapacity" text,
        "poaCapacityDuplicate" text,"poaNumber" text,"poaLetter" text,"poaYear" text,
        "issuingAuthority" text,"issueDate" text,"copiesCount" integer,notes text,
        "showOnPoaReport" boolean,"sourcePayload" jsonb)
    ON CONFLICT (legacy_source_record_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

async function insertLawyers(db: ClientBase, rows: readonly PoaLawyerPlan[]): Promise<void> {
  await db.query(
    `
    INSERT INTO power_of_attorney_lawyers (
      power_of_attorney_id,person_id,legacy_source_record_key,
      legacy_source_extraction_sha256,legacy_lawyers_raw,reviewed_rule_id,
      source_member_ordinal,updated_at)
    SELECT p.id,x."personId",x."srcRecordKey",x."extractionSha256",x."legacyLawyersRaw",
           x."reviewedRuleId",x."sourceMemberOrdinal",CURRENT_TIMESTAMP
      FROM jsonb_to_recordset($1::jsonb) AS x(
        "srcRecordKey" text,"extractionSha256" text,"personId" integer,
        "legacyLawyersRaw" text,"reviewedRuleId" integer,"sourceMemberOrdinal" integer)
      JOIN powers_of_attorney p ON p.legacy_source_record_key=x."srcRecordKey"
    ON CONFLICT (power_of_attorney_id,person_id) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

async function insertTransformQuarantine(db: ClientBase, rows: readonly PoaQuarantinePlan[]) {
  await db.query(
    `
    INSERT INTO quarantine.power_of_attorney_transform (
      src_record_key,extraction_sha256,src_file,src_row_num,reason_codes,reason_details,source_payload)
    SELECT x."srcRecordKey",x."extractionSha256",x."srcFile",x."srcRowNum",
           x."reasonCodes",x."reasonDetails",x."sourcePayload"
      FROM jsonb_to_recordset($1::jsonb) AS x(
        "srcRecordKey" text,"extractionSha256" text,"srcFile" text,"srcRowNum" integer,
        "reasonCodes" text[],"reasonDetails" jsonb,"sourcePayload" jsonb)
    ON CONFLICT (src_record_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

async function insertRelationshipEvidence(
  db: ClientBase,
  rows: readonly PoaRelationshipEvidencePlan[],
) {
  await db.query(
    `
    INSERT INTO quarantine.power_of_attorney_relationship (
      src_record_key,relationship_kind,extraction_sha256,src_file,src_row_num,
      raw_value,reviewed_rule_ids,resolved_member_count,reason_codes,reason_details,source_payload)
    SELECT x."srcRecordKey",x."relationshipKind",x."extractionSha256",x."srcFile",x."srcRowNum",
           x."rawValue",x."reviewedRuleIds",x."resolvedMemberCount",x."reasonCodes",
           x."reasonDetails",x."sourcePayload"
      FROM jsonb_to_recordset($1::jsonb) AS x(
        "srcRecordKey" text,"relationshipKind" text,"extractionSha256" text,
        "srcFile" text,"srcRowNum" integer,"rawValue" text,"reviewedRuleIds" integer[],
        "resolvedMemberCount" integer,"reasonCodes" text[],"reasonDetails" jsonb,
        "sourcePayload" jsonb)
    ON CONFLICT (src_record_key,relationship_kind) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

export async function poaResultDigest(db: ClientBase): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(coalesce(string_agg(payload,E'\\n' ORDER BY kind,identity),''),'UTF8')),'hex') digest
      FROM (
        SELECT 'P' kind,legacy_source_record_key identity,to_jsonb(p)::text payload
          FROM powers_of_attorney p WHERE legacy_source_record_key IS NOT NULL
        UNION ALL SELECT 'L',legacy_source_record_key||':'||person_id,to_jsonb(l)::text
          FROM power_of_attorney_lawyers l WHERE legacy_source_record_key IS NOT NULL
        UNION ALL SELECT 'QT',src_record_key,to_jsonb(q)::text FROM quarantine.power_of_attorney_transform q
        UNION ALL SELECT 'QR',src_record_key||':'||relationship_kind,to_jsonb(q)::text
          FROM quarantine.power_of_attorney_relationship q
      ) result`);
  return result.rows[0]?.digest ?? '';
}

export async function runPoaTransform(options: RunOptions = {}) {
  const connectionString = options.databaseUrl ?? process.env['MIGRATION_DATABASE_URL'];
  assert.ok(connectionString, 'MIGRATION_DATABASE_URL is required');
  const db = new Client({ connectionString });
  await db.connect();
  try {
    await assertApprovedMigrationPrincipalSession(db);
    const expectedOccurrences =
      options.expectedCorrectedOccurrences ??
      (options.databaseUrl === undefined ? [8, 0, 1] : undefined);
    const preview = await buildPoaTransformPlan(db, expectedOccurrences);
    if (options.apply !== true) return { plan: preview, digest: null };
    const protectedBefore = await task29bProtectedState(db);
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      await assertPoaStructure(db);
      const plan = await buildPoaTransformPlan(db, expectedOccurrences);
      assert.equal(plan.sourceCount, preview.sourceCount);
      await insertTargets(db, plan.targets);
      await insertTransformQuarantine(db, plan.transformQuarantine);
      await insertLawyers(db, plan.lawyers);
      await insertRelationshipEvidence(db, plan.relationshipEvidence);
      if (options.forceFailure === true) throw new Error('forced late Task 2.9B failure');
      const reconciliation = await reconcilePowersOfAttorney(db, plan.correctedOccurrences);
      assert.deepEqual(reconciliation.defects, [], reconciliation.defects.join('\n'));
      assert.equal(
        await task29bProtectedState(db),
        protectedBefore,
        'prior protected state changed',
      );
      await assertPoaStructure(db);
      await db.query('COMMIT');
      return { plan, digest: await poaResultDigest(db) };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } finally {
    await db.end();
  }
}

function breakdown(rows: readonly PoaRelationshipEvidencePlan[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows)
    for (const code of row.reasonCodes) result[code] = (result[code] ?? 0) + 1;
  return result;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const result = await runPoaTransform({ apply });
  console.log(apply ? 'TASK 2.9B APPLIED' : 'TASK 2.9B DRY RUN — no database writes');
  console.log(
    `POAs: ${result.plan.sourceCount} = ${result.plan.targets.length} transformed + ${result.plan.transformQuarantine.length} quarantined`,
  );
  console.log(
    `Reviewed lawyers: ${result.plan.lawyers.length}; relationship evidence: ${result.plan.relationshipEvidence.length}`,
  );
  console.log(
    `Report setting: ${result.plan.targets.filter((row) => row.showOnPoaReport).length} shown / ${result.plan.targets.filter((row) => !row.showOnPoaReport).length} hidden`,
  );
  console.log(`Corrected rule occurrences: ${result.plan.correctedOccurrences.join('/')}`);
  console.log(
    `Relationship reasons: ${JSON.stringify(breakdown(result.plan.relationshipEvidence))}`,
  );
  if (result.digest !== null) console.log(`Result digest: ${result.digest}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
