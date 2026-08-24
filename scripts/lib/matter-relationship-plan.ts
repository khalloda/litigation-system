import type { ClientBase } from 'pg';
import {
  correctedMultiPersonRules,
  matterRelationshipRuleFailures,
  readMatterRelationshipRules,
} from './matter-relationship-rules';

type SourceRow = {
  matter_id: number;
  src_record_key: string;
  src_extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  legacy_matter_id: string | null;
  lawyer_a: string | null;
  lawyer_b: string | null;
  client_cap: string | null;
  opponent_cap: string | null;
  source_payload: Record<string, unknown>;
};

type RuleRow = {
  id: number;
  raw_value: string;
  occurrences: number;
  reviewer_note: string;
  person_name: string | null;
  person_id: number | null;
  ordinal: number | null;
};

type AliasRow = { alias_ar: string; person_id: number };
type RoleRow = { id: number; label_ar_m: string; label_ar_f: string };
type ExclusionRow = { raw_value: string; occurrences: number; reason: string };

export type ExpectedMatterLawyer = {
  matterId: number;
  personId: number;
  role: 'lead' | 'co_lead' | 'support';
  position: number;
  legacySource: string;
  legacySourceRecordKey: string;
  legacySourceExtractionSha256: string;
  sourceField: 'lawyerA' | 'lawyerB';
  reviewedRuleId: number | null;
  sourceMemberOrdinal: number;
};

export type ExpectedMatterParty = {
  matterId: number;
  side: 'client' | 'opponent';
  partyName: string;
  gender: 'm' | 'f' | null;
  ordinal: number;
  legacyRaw: string;
  legacySourceRecordKey: string;
  legacySourceExtractionSha256: string;
  sourceField: 'client&Cap' | 'opponent&Cap';
  sourceFragmentOrdinal: number;
  roles: Array<{ roleId: number; ordinal: number; legacyRoleRaw: string }>;
};

export type ExpectedRelationshipEvidence = {
  relationshipKind: 'lawyer' | 'party';
  sourceField: 'lawyerA' | 'lawyerB' | 'client&Cap' | 'opponent&Cap';
  side: 'client' | 'opponent' | null;
  srcRecordKey: string;
  extractionSha256: string;
  srcFile: string;
  srcRowNum: number;
  legacyMatterId: string | null;
  rawValue: string;
  outcome: 'quarantined' | 'excluded';
  reasonCodes: string[];
  reasonDetails: Array<Record<string, unknown>>;
  sourcePayload: Record<string, unknown>;
  reviewedExclusionRawValue: string | null;
};

export type MatterRelationshipPlan = {
  lawyers: ExpectedMatterLawyer[];
  parties: ExpectedMatterParty[];
  evidence: ExpectedRelationshipEvidence[];
  sourceCellCount: number;
  ruleFailures: string[];
};

type ResolvedRule = {
  id: number;
  rawValue: string;
  occurrences: number;
  reviewerNote: string;
  members: Array<{ personName: string; personId: number; ordinal: number }>;
};

function evidence(
  source: SourceRow,
  field: ExpectedRelationshipEvidence['sourceField'],
  rawValue: string,
  relationshipKind: ExpectedRelationshipEvidence['relationshipKind'],
  side: ExpectedRelationshipEvidence['side'],
  outcome: ExpectedRelationshipEvidence['outcome'],
  reasonCodes: string[],
  reasonDetails: Array<Record<string, unknown>>,
  reviewedExclusionRawValue: string | null = null,
): ExpectedRelationshipEvidence {
  return {
    relationshipKind,
    sourceField: field,
    side,
    srcRecordKey: source.src_record_key,
    extractionSha256: source.src_extraction_sha256,
    srcFile: source.src_file,
    srcRowNum: source.src_row_num,
    legacyMatterId: source.legacy_matter_id,
    rawValue,
    outcome,
    reasonCodes,
    reasonDetails,
    sourcePayload: source.source_payload,
    reviewedExclusionRawValue,
  };
}

function nonempty(value: string | null): value is string {
  return value !== null && value !== '';
}

function parseParty(
  rawValue: string,
  roles: RoleRow[],
  exclusions: Map<string, ExclusionRow>,
):
  | {
      ok: true;
      parties: Array<{
        name: string;
        gender: 'm' | 'f' | null;
        roles: Array<{ roleId: number; raw: string }>;
      }>;
    }
  | { ok: false; code: string; detail: Record<string, unknown> } {
  const lines = rawValue
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line, index) => ({ text: line.trim(), line: index + 1 }))
    .filter((line) => line.text !== '');
  if (lines.length === 0) return { ok: false, code: 'empty_party_value', detail: {} };

  const parties: Array<{
    name: string;
    gender: 'm' | 'f' | null;
    roles: Array<{ roleId: number; raw: string }>;
  }> = [];
  for (const line of lines) {
    const quoted = line.text.match(/^"([\s\S]*)"$/);
    if (quoted === null) {
      if (line.text.includes('"')) {
        return {
          ok: false,
          code: 'malformed_party_quotes',
          detail: { line: line.line, value: line.text },
        };
      }
      if (exclusions.has(line.text)) {
        return {
          ok: false,
          code: 'reviewed_exclusion_fragment',
          detail: { line: line.line, value: line.text },
        };
      }
      parties.push({ name: line.text, gender: null, roles: [] });
      continue;
    }

    const current = parties.at(-1);
    if (current === undefined) {
      return {
        ok: false,
        code: 'party_role_without_name',
        detail: { line: line.line, value: line.text },
      };
    }
    const roleTexts = quoted[1]!
      .split(/[،,]/u)
      .map((part) => part.trim())
      .filter((part) => part !== '');
    if (roleTexts.length === 0) {
      return { ok: false, code: 'empty_party_role', detail: { line: line.line } };
    }
    for (const roleText of roleTexts) {
      const matches = roles.filter(
        (role) => role.label_ar_m === roleText || role.label_ar_f === roleText,
      );
      if (matches.length !== 1) {
        return {
          ok: false,
          code: matches.length === 0 ? 'unreviewed_party_role' : 'ambiguous_party_role',
          detail: { line: line.line, value: roleText, matches: matches.length },
        };
      }
      const role = matches[0]!;
      if (current.roles.some((item) => item.roleId === role.id)) {
        return {
          ok: false,
          code: 'duplicate_party_role',
          detail: { line: line.line, value: roleText },
        };
      }
      const gender =
        role.label_ar_m === role.label_ar_f ? null : role.label_ar_m === roleText ? 'm' : 'f';
      if (gender !== null && current.gender !== null && gender !== current.gender) {
        return {
          ok: false,
          code: 'conflicting_party_gender',
          detail: { line: line.line, value: roleText },
        };
      }
      if (gender !== null) current.gender = gender;
      current.roles.push({ roleId: role.id, raw: roleText });
    }
  }
  return { ok: true, parties };
}

function canonicalRuleSourceFailures(rules: ResolvedRule[], exclusions: ExclusionRow[]): string[] {
  const canonical = readMatterRelationshipRules();
  const failures = matterRelationshipRuleFailures(canonical);
  const actual = rules.map((rule) => ({
    rawValue: rule.rawValue,
    occurrences: rule.occurrences,
    reviewerNote: rule.reviewerNote,
    members: rule.members.map((member) => ({
      personName: member.personName,
      ordinal: member.ordinal,
    })),
  }));
  if (JSON.stringify(actual) !== JSON.stringify(canonical.rules)) {
    failures.push('database multi-person rules differ from canonical reviewed SQL');
  }
  const byRawValue = (a: { rawValue: string }, b: { rawValue: string }) =>
    a.rawValue < b.rawValue ? -1 : a.rawValue > b.rawValue ? 1 : 0;
  const expectedExclusions = [...canonical.exclusions].sort(byRawValue);
  const actualExclusions = exclusions
    .map((row) => ({
      rawValue: row.raw_value,
      occurrences: row.occurrences,
      reason: row.reason,
    }))
    .sort(byRawValue);
  if (JSON.stringify(actualExclusions) !== JSON.stringify(expectedExclusions)) {
    failures.push('database excluded names differ from canonical reviewed SQL');
  }
  return failures;
}

export async function buildMatterRelationshipPlan(db: ClientBase): Promise<MatterRelationshipPlan> {
  const sourceResult = await db.query<SourceRow>(`
      SELECT m.id AS matter_id,
             s.src_record_key, s.src_extraction_sha256, s.src_file, s.src_row_num,
             s."matterID" AS legacy_matter_id,
             s."lawyerA" AS lawyer_a, s."lawyerB" AS lawyer_b,
             s."client&Cap" AS client_cap, s."opponent&Cap" AS opponent_cap,
             to_jsonb(s) - ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] AS source_payload
        FROM matters m
        JOIN staging."الدعاوى" s ON s.src_record_key = m.legacy_source_record_key
       ORDER BY s.src_record_key`);
  const ruleResult = await db.query<RuleRow>(`
      SELECT r.id, r.raw_value, r.occurrences, r.reviewer_note,
             m.person_name, m.person_id, m.ordinal
        FROM migration_multi_person_rule r
        LEFT JOIN migration_multi_person_rule_member m ON m.rule_id = r.id
       ORDER BY r.id, m.ordinal`);
  const aliasResult = await db.query<AliasRow>(
    'SELECT alias_ar, person_id FROM person_name_alias ORDER BY alias_ar, person_id',
  );
  const exclusionResult = await db.query<ExclusionRow>(
    'SELECT raw_value, occurrences, reason FROM migration_excluded_name ORDER BY raw_value',
  );
  const roleResult = await db.query<RoleRow>(
    'SELECT id, label_ar_m, label_ar_f FROM lookup_party_role ORDER BY id',
  );

  const aliases = new Map<string, number[]>();
  for (const alias of aliasResult.rows) {
    const ids = aliases.get(alias.alias_ar) ?? [];
    ids.push(alias.person_id);
    aliases.set(alias.alias_ar, ids);
  }
  const exclusions = new Map(exclusionResult.rows.map((row) => [row.raw_value, row]));
  const rules = new Map<string, ResolvedRule>();
  for (const row of ruleResult.rows) {
    const rule = rules.get(row.raw_value) ?? {
      id: row.id,
      rawValue: row.raw_value,
      occurrences: row.occurrences,
      reviewerNote: row.reviewer_note,
      members: [],
    };
    if (row.person_name !== null && row.person_id !== null && row.ordinal !== null) {
      rule.members.push({
        personName: row.person_name,
        personId: row.person_id,
        ordinal: row.ordinal,
      });
    }
    rules.set(row.raw_value, rule);
  }

  const ruleFailures = canonicalRuleSourceFailures([...rules.values()], exclusionResult.rows);
  for (const rule of rules.values()) {
    if (rule.members.length === 0) ruleFailures.push(`empty database rule: ${rule.rawValue}`);
    if (rule.members.some((member, index) => member.ordinal !== index + 1)) {
      ruleFailures.push(`database ordinal gap or duplicate: ${rule.rawValue}`);
    }
    if (new Set(rule.members.map((member) => member.personId)).size !== rule.members.length) {
      ruleFailures.push(`database duplicate person in rule: ${rule.rawValue}`);
    }
    for (const member of rule.members) {
      const matches = aliases.get(member.personName) ?? [];
      if (matches.length !== 1 || matches[0] !== member.personId) {
        ruleFailures.push(
          `member alias does not resolve exactly to stored person: ${rule.rawValue}/${member.personName}`,
        );
      }
    }
  }
  for (const corrected of correctedMultiPersonRules) {
    if (!rules.has(corrected.rawValue)) ruleFailures.push(`corrected database rule missing`);
  }

  const lawyers: ExpectedMatterLawyer[] = [];
  const parties: ExpectedMatterParty[] = [];
  const evidenceRows: ExpectedRelationshipEvidence[] = [];
  let sourceCellCount = 0;

  for (const source of sourceResult.rows) {
    const candidateLawyers: ExpectedMatterLawyer[] = [];
    const lawyerFields = [
      ['lawyerA', source.lawyer_a],
      ['lawyerB', source.lawyer_b],
    ] as const;
    for (const [field, rawValue] of lawyerFields) {
      if (!nonempty(rawValue)) continue;
      sourceCellCount += 1;
      const aliasMatches = aliases.get(rawValue) ?? [];
      const reviewedRule = rules.get(rawValue);
      const exclusion = exclusions.get(rawValue);
      const resolutionCount =
        Number(aliasMatches.length > 0) +
        Number(reviewedRule !== undefined) +
        Number(exclusion !== undefined);
      if (resolutionCount !== 1 || aliasMatches.length > 1) {
        const code =
          aliasMatches.length > 1
            ? 'ambiguous_person_alias'
            : resolutionCount > 1
              ? 'ambiguous_reviewed_resolution'
              : 'unreviewed_person_value';
        evidenceRows.push(
          evidence(
            source,
            field,
            rawValue,
            'lawyer',
            null,
            'quarantined',
            [code],
            [
              {
                alias_matches: aliasMatches.length,
                rule_matches: reviewedRule === undefined ? 0 : 1,
                exclusion_matches: exclusion === undefined ? 0 : 1,
              },
            ],
          ),
        );
        continue;
      }
      if (exclusion !== undefined) {
        evidenceRows.push(
          evidence(
            source,
            field,
            rawValue,
            'lawyer',
            null,
            'excluded',
            ['reviewed_exclusion'],
            [{ reason: exclusion.reason }],
            exclusion.raw_value,
          ),
        );
        continue;
      }

      const members =
        reviewedRule === undefined
          ? [{ personName: rawValue, personId: aliasMatches[0]!, ordinal: 1 }]
          : reviewedRule.members.map((member) => ({
              ...member,
              personId: (aliases.get(member.personName) ?? [])[0] ?? member.personId,
            }));
      for (const member of members) {
        candidateLawyers.push({
          matterId: source.matter_id,
          personId: member.personId,
          role: field === 'lawyerB' ? 'support' : member.ordinal === 1 ? 'lead' : 'co_lead',
          position: member.ordinal,
          legacySource: rawValue,
          legacySourceRecordKey: source.src_record_key,
          legacySourceExtractionSha256: source.src_extraction_sha256,
          sourceField: field,
          reviewedRuleId: reviewedRule?.id ?? null,
          sourceMemberOrdinal: member.ordinal,
        });
      }
    }

    const duplicatePeople = new Set(
      candidateLawyers
        .filter(
          (candidate, index, all) =>
            all.findIndex((row) => row.personId === candidate.personId) !== index,
        )
        .map((row) => row.personId),
    );
    if (duplicatePeople.size > 0) {
      const affectedFields = new Set(
        candidateLawyers
          .filter((row) => duplicatePeople.has(row.personId))
          .map((row) => row.sourceField),
      );
      for (const field of affectedFields) {
        const rawValue = field === 'lawyerA' ? source.lawyer_a! : source.lawyer_b!;
        evidenceRows.push(
          evidence(
            source,
            field,
            rawValue,
            'lawyer',
            null,
            'quarantined',
            ['duplicate_matter_person'],
            [{ person_ids: [...duplicatePeople].sort((a, b) => a - b) }],
          ),
        );
      }
      lawyers.push(...candidateLawyers.filter((row) => !affectedFields.has(row.sourceField)));
    } else {
      lawyers.push(...candidateLawyers);
    }

    const partyFields = [
      ['client&Cap', 'client', source.client_cap],
      ['opponent&Cap', 'opponent', source.opponent_cap],
    ] as const;
    for (const [field, side, rawValue] of partyFields) {
      if (!nonempty(rawValue)) continue;
      sourceCellCount += 1;
      const exclusion = exclusions.get(rawValue);
      if (exclusion !== undefined) {
        evidenceRows.push(
          evidence(
            source,
            field,
            rawValue,
            'party',
            side,
            'excluded',
            ['reviewed_exclusion'],
            [{ reason: exclusion.reason }],
            exclusion.raw_value,
          ),
        );
        continue;
      }
      const parsed = parseParty(rawValue, roleResult.rows, exclusions);
      if (!parsed.ok) {
        evidenceRows.push(
          evidence(
            source,
            field,
            rawValue,
            'party',
            side,
            'quarantined',
            [parsed.code],
            [parsed.detail],
          ),
        );
        continue;
      }
      for (const [index, party] of parsed.parties.entries()) {
        parties.push({
          matterId: source.matter_id,
          side,
          partyName: party.name,
          gender: party.gender,
          ordinal: index + 1,
          legacyRaw: rawValue,
          legacySourceRecordKey: source.src_record_key,
          legacySourceExtractionSha256: source.src_extraction_sha256,
          sourceField: field,
          sourceFragmentOrdinal: index + 1,
          roles: party.roles.map((role, roleIndex) => ({
            roleId: role.roleId,
            ordinal: roleIndex + 1,
            legacyRoleRaw: role.raw,
          })),
        });
      }
    }
  }

  return {
    lawyers,
    parties,
    evidence: evidenceRows,
    sourceCellCount,
    ruleFailures,
  };
}
