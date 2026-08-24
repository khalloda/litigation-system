import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import {
  matterRelationshipRuleFailures,
  readMatterRelationshipRules,
} from './matter-relationship-rules';

export const MATTER_RELATIONSHIP_RECONCILIATION_SQL = readFileSync(
  new URL('../../sql/check-matter-relationship-reconciliation.sql', import.meta.url),
  'utf8',
);

type Count = bigint | number | string;

type ReconciliationRow = {
  source_matters: Count;
  transformed_matters: Count;
  parent_quarantined_matters: Count;
  parent_partition_defects: Count;
  all_source_cells: Count;
  transformed_parent_cells: Count;
  parent_quarantined_cells: Count;
  cell_partition_defects: Count;
  parent_quarantine_payload_mismatches: Count;
  rule_count: Count;
  rule_member_count: Count;
  exclusion_count: Count;
  empty_rules: Count;
  rule_ordinal_defects: Count;
  rule_duplicate_person_defects: Count;
  rule_member_alias_defects: Count;
  expected_lawyers: Count;
  actual_lawyers: Count;
  missing_lawyers: Count;
  extra_lawyers: Count;
  expected_parties: Count;
  actual_parties: Count;
  missing_parties: Count;
  extra_parties: Count;
  expected_party_roles: Count;
  actual_party_roles: Count;
  missing_party_roles: Count;
  extra_party_roles: Count;
  expected_evidence: Count;
  actual_evidence: Count;
  missing_evidence: Count;
  extra_evidence: Count;
  expected_both_outcomes: Count;
  expected_neither_outcome: Count;
  actual_both_outcomes: Count;
  actual_neither_outcome: Count;
  excluded_with_target: Count;
  quarantined_with_target: Count;
  duplicated_parent_quarantine_evidence: Count;
};

type StoredRuleRow = {
  id: number;
  raw_value: string;
  occurrences: number;
  reviewer_note: string;
  person_name: string | null;
  ordinal: number | null;
};

type StoredExclusionRow = {
  raw_value: string;
  occurrences: number;
  reason: string;
};

export type MatterRelationshipReconciliation = {
  sourceMatters: number;
  transformedMatters: number;
  parentQuarantinedMatters: number;
  allSourceCells: number;
  transformedParentCells: number;
  parentQuarantinedCells: number;
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

function number(value: Count): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`invalid reconciliation count: ${String(value)}`);
  }
  return result;
}

function addCountDefect(defects: string[], label: string, value: Count, expected = 0): void {
  const actual = number(value);
  if (actual !== expected) defects.push(`${label}: ${actual}/${expected}`);
}

async function storedRuleSourceFailures(db: ClientBase): Promise<string[]> {
  const rulesResult = await db.query<StoredRuleRow>(`
      SELECT r.id, r.raw_value, r.occurrences, r.reviewer_note,
             member.person_name, member.ordinal
        FROM migration_multi_person_rule r
        LEFT JOIN migration_multi_person_rule_member member
          ON member.rule_id = r.id
       ORDER BY r.id, member.ordinal`);
  const exclusionsResult = await db.query<StoredExclusionRow>(`
      SELECT raw_value, occurrences, reason
        FROM migration_excluded_name
       ORDER BY raw_value`);
  const storedRules = new Map<
    number,
    {
      rawValue: string;
      occurrences: number;
      reviewerNote: string;
      members: Array<{ personName: string; ordinal: number }>;
    }
  >();
  for (const row of rulesResult.rows) {
    const rule = storedRules.get(row.id) ?? {
      rawValue: row.raw_value,
      occurrences: row.occurrences,
      reviewerNote: row.reviewer_note,
      members: [],
    };
    if (row.person_name !== null && row.ordinal !== null) {
      rule.members.push({ personName: row.person_name, ordinal: row.ordinal });
    }
    storedRules.set(row.id, rule);
  }

  const canonical = readMatterRelationshipRules();
  const failures = matterRelationshipRuleFailures(canonical);
  if (JSON.stringify([...storedRules.values()]) !== JSON.stringify(canonical.rules)) {
    failures.push('database multi-person rules differ from canonical reviewed SQL');
  }
  const byRawValue = (a: { rawValue: string }, b: { rawValue: string }) =>
    a.rawValue < b.rawValue ? -1 : a.rawValue > b.rawValue ? 1 : 0;
  const storedExclusions = exclusionsResult.rows
    .map((row) => ({
      rawValue: row.raw_value,
      occurrences: row.occurrences,
      reason: row.reason,
    }))
    .sort(byRawValue);
  if (
    JSON.stringify(storedExclusions) !== JSON.stringify([...canonical.exclusions].sort(byRawValue))
  ) {
    failures.push('database excluded names differ from canonical reviewed SQL');
  }
  return failures;
}

export async function reconcileMatterRelationships(
  db: ClientBase,
): Promise<MatterRelationshipReconciliation> {
  const result = await db.query<ReconciliationRow>(MATTER_RELATIONSHIP_RECONCILIATION_SQL);
  if (result.rows.length !== 1) {
    throw new Error(`relationship reconciliation returned ${result.rows.length} rows`);
  }
  const row = result.rows[0]!;
  const defects = await storedRuleSourceFailures(db);

  addCountDefect(defects, 'rules', row.rule_count, 33);
  addCountDefect(defects, 'members', row.rule_member_count, 84);
  addCountDefect(defects, 'exclusions', row.exclusion_count, 38);
  addCountDefect(defects, 'empty database rule', row.empty_rules);
  addCountDefect(defects, 'database ordinal gap or duplicate', row.rule_ordinal_defects);
  addCountDefect(defects, 'database duplicate person in rule', row.rule_duplicate_person_defects);
  addCountDefect(
    defects,
    'member alias does not resolve exactly to stored person',
    row.rule_member_alias_defects,
  );
  addCountDefect(defects, 'matter parent partition defects', row.parent_partition_defects);
  addCountDefect(defects, 'source-cell parent partition defects', row.cell_partition_defects);
  addCountDefect(
    defects,
    'parent-quarantined source payload mismatches',
    row.parent_quarantine_payload_mismatches,
  );
  addCountDefect(defects, 'expected source cells with both outcomes', row.expected_both_outcomes);
  addCountDefect(
    defects,
    'expected source cells with neither outcome',
    row.expected_neither_outcome,
  );
  addCountDefect(defects, 'source cells with both target and evidence', row.actual_both_outcomes);
  addCountDefect(
    defects,
    'source cells with neither target nor evidence',
    row.actual_neither_outcome,
  );
  addCountDefect(defects, 'excluded source cells with target rows', row.excluded_with_target);
  addCountDefect(
    defects,
    'quarantined source cells with partial target rows',
    row.quarantined_with_target,
  );
  addCountDefect(
    defects,
    'parent-quarantined cells duplicated into Task 2.7 evidence',
    row.duplicated_parent_quarantine_evidence,
  );

  const comparisons = [
    ['matter lawyers missing or changed', row.missing_lawyers],
    ['matter lawyers extra or changed', row.extra_lawyers],
    ['matter parties missing or changed', row.missing_parties],
    ['matter parties extra or changed', row.extra_parties],
    ['matter party roles missing or changed', row.missing_party_roles],
    ['matter party roles extra or changed', row.extra_party_roles],
    ['relationship evidence missing or changed', row.missing_evidence],
    ['relationship evidence extra or changed', row.extra_evidence],
  ] as const;
  for (const [label, value] of comparisons) addCountDefect(defects, label, value);

  return {
    sourceMatters: number(row.source_matters),
    transformedMatters: number(row.transformed_matters),
    parentQuarantinedMatters: number(row.parent_quarantined_matters),
    allSourceCells: number(row.all_source_cells),
    transformedParentCells: number(row.transformed_parent_cells),
    parentQuarantinedCells: number(row.parent_quarantined_cells),
    expectedLawyers: number(row.expected_lawyers),
    actualLawyers: number(row.actual_lawyers),
    expectedParties: number(row.expected_parties),
    actualParties: number(row.actual_parties),
    expectedPartyRoles: number(row.expected_party_roles),
    actualPartyRoles: number(row.actual_party_roles),
    expectedEvidence: number(row.expected_evidence),
    actualEvidence: number(row.actual_evidence),
    defects,
  };
}

export async function matterRelationshipResultDigest(db: ClientBase): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(coalesce(string_agg(payload, E'\\n' ORDER BY kind, identity), ''), 'UTF8')), 'hex') AS digest
      FROM (
        SELECT 'L' kind, id::text identity, to_jsonb(ml)::text payload
          FROM matter_lawyers ml
         WHERE legacy_source_record_key IS NOT NULL
        UNION ALL
        SELECT 'P', id::text, to_jsonb(mp)::text
          FROM matter_parties mp
         WHERE legacy_source_record_key IS NOT NULL
        UNION ALL
        SELECT 'R', role.id::text, to_jsonb(role)::text
          FROM matter_party_roles role
          JOIN matter_parties party ON party.id = role.party_id
         WHERE party.legacy_source_record_key IS NOT NULL
        UNION ALL
        SELECT 'Q', id::text, to_jsonb(q)::text
          FROM quarantine.matter_relationship_transform q
      ) rows`);
  return result.rows[0]!.digest;
}
