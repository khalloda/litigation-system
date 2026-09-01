/*
 * Task 2.7 — transform matter lawyers and parties.
 *
 * The plan is rebuilt from staging, exact aliases and reviewed rule tables on
 * every run. One serializable transaction writes the whole result and then
 * invokes the permanent reconciliation before commit.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import { Client, type ClientConfig } from 'pg';
import { buildMatterRelationshipPlan } from './lib/matter-relationship-plan';
import {
  reconcileMatterRelationships,
  matterRelationshipResultDigest,
} from './lib/matter-relationship-reconciliation';

type RunOptions = {
  databaseUrl?: string;
  dryRun?: boolean;
  forceFailure?: boolean;
};

async function protectedState(db: Client): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(string_agg(payload, E'\n' ORDER BY kind, identity), 'UTF8')), 'hex') AS digest
      FROM (
        SELECT 'V' kind, v.id::text identity, to_jsonb(v)::text payload
          FROM quarantine.review_value v
        UNION ALL
        SELECT 'F', f.id::text, to_jsonb(f)::text FROM quarantine.finding f
        UNION ALL
        SELECT 'C', c.id::text, to_jsonb(c)::text FROM clients c
        UNION ALL
        SELECT 'O', c.id::text, to_jsonb(c)::text FROM contacts c
        UNION ALL
        SELECT 'M', m.id::text, to_jsonb(m)::text FROM matters m
        UNION ALL
        SELECT 'Q', q.id::text, to_jsonb(q)::text FROM quarantine.matter_transform q
      ) protected`);
  return result.rows[0]!.digest;
}

export async function runMatterRelationshipTransform(options: RunOptions = {}) {
  const connectionString = options.databaseUrl ?? process.env['MIGRATION_DATABASE_URL'];
  assert.ok(connectionString, 'MIGRATION_DATABASE_URL is required');
  const config: ClientConfig = { connectionString };
  const db = new Client(config);
  await db.connect();
  try {
    const plan = await buildMatterRelationshipPlan(db);
    assert.deepEqual(
      plan.ruleFailures,
      [],
      `reviewed rules are not safe:\n${plan.ruleFailures.join('\n')}`,
    );
    const representedCells = new Set([
      ...plan.lawyers.map((row) => `${row.legacySourceRecordKey}\0${row.sourceField}`),
      ...plan.parties.map((row) => `${row.legacySourceRecordKey}\0${row.sourceField}`),
      ...plan.evidence.map((row) => `${row.srcRecordKey}\0${row.sourceField}`),
    ]);
    assert.equal(
      representedCells.size,
      plan.sourceCellCount,
      'dry-run source-cell reconciliation did not account for every populated source cell',
    );
    if (options.dryRun === true) {
      return { plan, digest: null, defects: [] as string[] };
    }

    const beforeProtected = await protectedState(db);
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      await db.query("SELECT pg_advisory_xact_lock(hashtext('task-2.7-matter-relationships'))");

      for (const row of plan.lawyers) {
        await db.query(
          `INSERT INTO matter_lawyers (
             matter_id, person_id, role, position, legacy_source,
             legacy_source_record_key, legacy_source_extraction_sha256,
             source_field, reviewed_rule_id, source_member_ordinal, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
           ON CONFLICT (legacy_source_record_key, source_field, source_member_ordinal)
           DO NOTHING`,
          [
            row.matterId,
            row.personId,
            row.role,
            row.position,
            row.legacySource,
            row.legacySourceRecordKey,
            row.legacySourceExtractionSha256,
            row.sourceField,
            row.reviewedRuleId,
            row.sourceMemberOrdinal,
          ],
        );
      }

      for (const row of plan.parties) {
        const inserted = await db.query<{ id: number }>(
          `INSERT INTO matter_parties (
             matter_id, side, party_name, gender, ordinal, legacy_raw,
             legacy_source_record_key, legacy_source_extraction_sha256,
             source_field, source_fragment_ordinal, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
           ON CONFLICT (legacy_source_record_key, source_field, source_fragment_ordinal)
           DO NOTHING RETURNING id`,
          [
            row.matterId,
            row.side,
            row.partyName,
            row.gender,
            row.ordinal,
            row.legacyRaw,
            row.legacySourceRecordKey,
            row.legacySourceExtractionSha256,
            row.sourceField,
            row.sourceFragmentOrdinal,
          ],
        );
        let partyId = inserted.rows[0]?.id;
        if (partyId === undefined) {
          const existing = await db.query<{ id: number }>(
            `SELECT id FROM matter_parties
              WHERE legacy_source_record_key = $1 AND source_field = $2
                AND source_fragment_ordinal = $3`,
            [row.legacySourceRecordKey, row.sourceField, row.sourceFragmentOrdinal],
          );
          assert.equal(existing.rowCount, 1, 'existing matter party identity is not unique');
          partyId = existing.rows[0]!.id;
        }
        for (const role of row.roles) {
          await db.query(
            `INSERT INTO matter_party_roles (
               party_id, role_id, ordinal, legacy_role_raw, updated_at
             ) VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)
             ON CONFLICT (party_id, role_id) DO NOTHING`,
            [partyId, role.roleId, role.ordinal, role.legacyRoleRaw],
          );
        }
      }

      for (const row of plan.evidence) {
        await db.query(
          `INSERT INTO quarantine.matter_relationship_transform (
             relationship_kind, source_field, side, src_record_key,
             extraction_sha256, src_file, src_row_num, legacy_matter_id,
             raw_value, outcome, reason_codes, reason_details, source_payload,
             reviewed_exclusion_raw_value
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14)
           ON CONFLICT (src_record_key, source_field) DO NOTHING`,
          [
            row.relationshipKind,
            row.sourceField,
            row.side,
            row.srcRecordKey,
            row.extractionSha256,
            row.srcFile,
            row.srcRowNum,
            row.legacyMatterId,
            row.rawValue,
            row.outcome,
            row.reasonCodes,
            JSON.stringify(row.reasonDetails),
            JSON.stringify(row.sourcePayload),
            row.reviewedExclusionRawValue,
          ],
        );
      }

      if (options.forceFailure === true) {
        throw new Error('fixture forced late matter-relationship failure');
      }

      const reconciliation = await reconcileMatterRelationships(db);
      assert.deepEqual(
        reconciliation.defects,
        [],
        `permanent matter-relationship reconciliation failed:\n${reconciliation.defects.join('\n')}`,
      );
      assert.equal(
        await protectedState(db),
        beforeProtected,
        'task 2.7 changed matters, prior quarantines, clients, contacts or review answers',
      );
      await db.query('COMMIT');
      return {
        plan,
        reconciliation,
        digest: await matterRelationshipResultDigest(db),
        defects: reconciliation.defects,
      };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } finally {
    await db.end();
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const result = await runMatterRelationshipTransform({ dryRun });
  console.log(
    `${dryRun ? 'DRY RUN' : 'TRANSFORMED'}: ` +
      `${result.plan.lawyers.length} lawyer relationships; ` +
      `${result.plan.parties.length} parties; ` +
      `${result.plan.parties.reduce((total, row) => total + row.roles.length, 0)} party roles; ` +
      `${result.plan.evidence.length} reviewed exclusions/quarantines; ` +
      `${result.plan.sourceCellCount} transformed-parent source cells reconciled.`,
  );
  if (result.digest !== null) console.log(`Result digest: ${result.digest}`);
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/transform-matter-relationships.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
