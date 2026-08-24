import type { ClientBase } from 'pg';
import {
  buildMatterRelationshipPlan,
  type ExpectedMatterLawyer,
  type ExpectedMatterParty,
  type ExpectedRelationshipEvidence,
} from './matter-relationship-plan';

type ActualLawyer = {
  matter_id: number;
  person_id: number;
  role: ExpectedMatterLawyer['role'];
  position: number;
  legacy_source: string;
  legacy_source_record_key: string;
  legacy_source_extraction_sha256: string;
  source_field: ExpectedMatterLawyer['sourceField'];
  reviewed_rule_id: number | null;
  source_member_ordinal: number;
};

type ActualParty = {
  id: number;
  matter_id: number;
  side: ExpectedMatterParty['side'];
  party_name: string;
  gender: ExpectedMatterParty['gender'];
  ordinal: number;
  legacy_raw: string;
  legacy_source_record_key: string;
  legacy_source_extraction_sha256: string;
  source_field: ExpectedMatterParty['sourceField'];
  source_fragment_ordinal: number;
};

type ActualRole = {
  party_id: number;
  role_id: number;
  ordinal: number;
  legacy_role_raw: string;
};

type ActualEvidence = {
  relationship_kind: ExpectedRelationshipEvidence['relationshipKind'];
  source_field: ExpectedRelationshipEvidence['sourceField'];
  side: ExpectedRelationshipEvidence['side'];
  src_record_key: string;
  extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  legacy_matter_id: string | null;
  raw_value: string;
  outcome: ExpectedRelationshipEvidence['outcome'];
  reason_codes: string[];
  reason_details: Array<Record<string, unknown>>;
  source_payload: Record<string, unknown>;
  reviewed_exclusion_raw_value: string | null;
};

export type MatterRelationshipReconciliation = {
  sourceCells: number;
  expectedLawyers: number;
  actualLawyers: number;
  expectedParties: number;
  actualParties: number;
  expectedPartyRoles: number;
  actualPartyRoles: number;
  expectedEvidence: number;
  actualEvidence: number;
  defects: string[];
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function compareSets(name: string, expected: unknown[], actual: unknown[]): string[] {
  const expectedCounts = new Map<string, number>();
  const actualCounts = new Map<string, number>();
  for (const row of expected) {
    const key = canonical(row);
    expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
  }
  for (const row of actual) {
    const key = canonical(row);
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
  }
  const missing = [...expectedCounts].reduce(
    (total, [key, count]) => total + Math.max(0, count - (actualCounts.get(key) ?? 0)),
    0,
  );
  const extra = [...actualCounts].reduce(
    (total, [key, count]) => total + Math.max(0, count - (expectedCounts.get(key) ?? 0)),
    0,
  );
  return [
    ...(missing === 0 ? [] : [`${name}: ${missing} missing or changed`]),
    ...(extra === 0 ? [] : [`${name}: ${extra} extra or changed`]),
  ];
}

function expectedLawyerRow(row: ExpectedMatterLawyer) {
  return {
    matter_id: row.matterId,
    person_id: row.personId,
    role: row.role,
    position: row.position,
    legacy_source: row.legacySource,
    legacy_source_record_key: row.legacySourceRecordKey,
    legacy_source_extraction_sha256: row.legacySourceExtractionSha256,
    source_field: row.sourceField,
    reviewed_rule_id: row.reviewedRuleId,
    source_member_ordinal: row.sourceMemberOrdinal,
  };
}

function expectedPartyRow(row: ExpectedMatterParty) {
  return {
    matter_id: row.matterId,
    side: row.side,
    party_name: row.partyName,
    gender: row.gender,
    ordinal: row.ordinal,
    legacy_raw: row.legacyRaw,
    legacy_source_record_key: row.legacySourceRecordKey,
    legacy_source_extraction_sha256: row.legacySourceExtractionSha256,
    source_field: row.sourceField,
    source_fragment_ordinal: row.sourceFragmentOrdinal,
    roles: row.roles.map((role) => ({
      role_id: role.roleId,
      ordinal: role.ordinal,
      legacy_role_raw: role.legacyRoleRaw,
    })),
  };
}

function expectedEvidenceRow(row: ExpectedRelationshipEvidence) {
  return {
    relationship_kind: row.relationshipKind,
    source_field: row.sourceField,
    side: row.side,
    src_record_key: row.srcRecordKey,
    extraction_sha256: row.extractionSha256,
    src_file: row.srcFile,
    src_row_num: row.srcRowNum,
    legacy_matter_id: row.legacyMatterId,
    raw_value: row.rawValue,
    outcome: row.outcome,
    reason_codes: row.reasonCodes,
    reason_details: row.reasonDetails,
    source_payload: row.sourcePayload,
    reviewed_exclusion_raw_value: row.reviewedExclusionRawValue,
  };
}

export async function reconcileMatterRelationships(
  db: ClientBase,
): Promise<MatterRelationshipReconciliation> {
  const plan = await buildMatterRelationshipPlan(db);
  const lawyerResult = await db.query<ActualLawyer>(`
      SELECT matter_id, person_id, role, position, legacy_source,
             legacy_source_record_key, legacy_source_extraction_sha256,
             source_field, reviewed_rule_id, source_member_ordinal
        FROM matter_lawyers ORDER BY id`);
  const partyResult = await db.query<ActualParty>(`
      SELECT id, matter_id, side, party_name, gender, ordinal, legacy_raw,
             legacy_source_record_key, legacy_source_extraction_sha256,
             source_field, source_fragment_ordinal
        FROM matter_parties ORDER BY id`);
  const roleResult = await db.query<ActualRole>(`
      SELECT party_id, role_id, ordinal, legacy_role_raw
        FROM matter_party_roles ORDER BY party_id, ordinal, id`);
  const evidenceResult = await db.query<ActualEvidence>(`
      SELECT relationship_kind, source_field, side, src_record_key,
             extraction_sha256, src_file, src_row_num, legacy_matter_id,
             raw_value, outcome, reason_codes, reason_details, source_payload,
             reviewed_exclusion_raw_value
        FROM quarantine.matter_relationship_transform ORDER BY id`);

  const rolesByParty = new Map<number, ActualRole[]>();
  for (const role of roleResult.rows) {
    const rows = rolesByParty.get(role.party_id) ?? [];
    rows.push(role);
    rolesByParty.set(role.party_id, rows);
  }
  const actualParties = partyResult.rows.map((party) => ({
    matter_id: party.matter_id,
    side: party.side,
    party_name: party.party_name,
    gender: party.gender,
    ordinal: party.ordinal,
    legacy_raw: party.legacy_raw,
    legacy_source_record_key: party.legacy_source_record_key,
    legacy_source_extraction_sha256: party.legacy_source_extraction_sha256,
    source_field: party.source_field,
    source_fragment_ordinal: party.source_fragment_ordinal,
    roles: (rolesByParty.get(party.id) ?? []).map((role) => ({
      role_id: role.role_id,
      ordinal: role.ordinal,
      legacy_role_raw: role.legacy_role_raw,
    })),
  }));

  const expectedCellKeys = new Set([
    ...plan.lawyers.map((row) => `${row.legacySourceRecordKey}\0${row.sourceField}`),
    ...plan.parties.map((row) => `${row.legacySourceRecordKey}\0${row.sourceField}`),
    ...plan.evidence.map((row) => `${row.srcRecordKey}\0${row.sourceField}`),
  ]);
  const defects = [...plan.ruleFailures];
  if (expectedCellKeys.size !== plan.sourceCellCount) {
    defects.push(
      `source-cell accounting: ${expectedCellKeys.size}/${plan.sourceCellCount} represented`,
    );
  }
  defects.push(
    ...compareSets('matter lawyers', plan.lawyers.map(expectedLawyerRow), lawyerResult.rows),
    ...compareSets('matter parties', plan.parties.map(expectedPartyRow), actualParties),
    ...compareSets(
      'relationship evidence',
      plan.evidence.map(expectedEvidenceRow),
      evidenceResult.rows,
    ),
  );

  return {
    sourceCells: plan.sourceCellCount,
    expectedLawyers: plan.lawyers.length,
    actualLawyers: lawyerResult.rows.length,
    expectedParties: plan.parties.length,
    actualParties: partyResult.rows.length,
    expectedPartyRoles: plan.parties.reduce((total, party) => total + party.roles.length, 0),
    actualPartyRoles: roleResult.rows.length,
    expectedEvidence: plan.evidence.length,
    actualEvidence: evidenceResult.rows.length,
    defects,
  };
}

export async function matterRelationshipResultDigest(db: ClientBase): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(coalesce(string_agg(payload, E'\n' ORDER BY kind, identity), ''), 'UTF8')), 'hex') AS digest
      FROM (
        SELECT 'L' kind, id::text identity, to_jsonb(ml)::text payload FROM matter_lawyers ml
        UNION ALL
        SELECT 'P', id::text, to_jsonb(mp)::text FROM matter_parties mp
        UNION ALL
        SELECT 'R', id::text, to_jsonb(mpr)::text FROM matter_party_roles mpr
        UNION ALL
        SELECT 'Q', id::text, to_jsonb(q)::text FROM quarantine.matter_relationship_transform q
      ) rows`);
  return result.rows[0]!.digest;
}
