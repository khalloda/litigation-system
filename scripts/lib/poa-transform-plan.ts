import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';

type SourcePoa = {
  src_record_key: string;
  src_extraction_sha256: string;
  src_file: string;
  src_row_num: number;
  client_name: string | null;
  client_id_raw: string | null;
  serial_no: string | null;
  principal_name: string | null;
  poa_capacity_duplicate: string | null;
  poa_number: string | null;
  poa_letter: string | null;
  poa_year: string | null;
  issuing_authority: string | null;
  issue_date_raw: string | null;
  lawyers_raw: string | null;
  copies_raw: string | null;
  notes: string | null;
  poa_capacity: string | null;
  show_raw: string | null;
  source_payload: Record<string, unknown>;
};

type RuleRow = {
  rule_id: number;
  raw_value: string;
  ordinal: number;
  person_id: number;
  person_name: string;
  alias_matches: string;
  poa_match_mode: string | null;
};

type ExclusionRow = { raw_value: string; reason: string };
type AliasRow = { alias_ar: string; person_id: number };
type ClientRow = { id: number; legacy_id: number };
type ReasonDetail = Record<string, unknown>;

export type PoaTargetPlan = {
  srcRecordKey: string;
  extractionSha256: string;
  clientId: number | null;
  clientName: string | null;
  legacyLawyersRaw: string | null;
  serialNo: string | null;
  principalName: string | null;
  poaCapacity: string | null;
  poaCapacityDuplicate: string | null;
  poaNumber: string | null;
  poaLetter: string | null;
  poaYear: string | null;
  issuingAuthority: string | null;
  issueDate: string | null;
  copiesCount: number | null;
  notes: string | null;
  showOnPoaReport: boolean;
  sourcePayload: Record<string, unknown>;
};

export type PoaLawyerPlan = {
  srcRecordKey: string;
  extractionSha256: string;
  personId: number;
  legacyLawyersRaw: string;
  reviewedRuleId: number | null;
  sourceMemberOrdinal: number;
};

export type PoaQuarantinePlan = {
  srcRecordKey: string;
  extractionSha256: string;
  srcFile: string;
  srcRowNum: number;
  reasonCodes: string[];
  reasonDetails: ReasonDetail[];
  sourcePayload: Record<string, unknown>;
};

export type PoaRelationshipEvidencePlan = PoaQuarantinePlan & {
  relationshipKind: 'client' | 'lawyers';
  rawValue: string | null;
  reviewedRuleIds: number[];
  resolvedMemberCount: number;
};

export type PoaTransformPlan = {
  sourceCount: number;
  targets: PoaTargetPlan[];
  lawyers: PoaLawyerPlan[];
  transformQuarantine: PoaQuarantinePlan[];
  relationshipEvidence: PoaRelationshipEvidencePlan[];
  ruleCount: number;
  memberCount: number;
  exclusionCount: number;
  correctedOccurrences: number[];
};

function strictInteger(value: string | null): number | null {
  if (value === null || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function strictDate(value: string | null): string | null {
  if (value === null) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) 00:00:00$/);
  if (match === null) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
    ? `${match[1]}-${match[2]}-${match[3]}`
    : null;
}

function orderedReasons(reasons: Map<string, ReasonDetail>) {
  const rows = [...reasons.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'));
  return { reasonCodes: rows.map(([code]) => code), reasonDetails: rows.map(([, value]) => value) };
}

function qBase(row: SourcePoa, reasons: Map<string, ReasonDetail>): PoaQuarantinePlan {
  return {
    srcRecordKey: row.src_record_key,
    extractionSha256: row.src_extraction_sha256,
    srcFile: row.src_file,
    srcRowNum: row.src_row_num,
    ...orderedReasons(reasons),
    sourcePayload: row.source_payload,
  };
}

export async function buildPoaTransformPlan(
  db: ClientBase,
  expectedCorrectedOccurrences?: readonly number[],
): Promise<PoaTransformPlan> {
  const source = await db.query<SourcePoa>(`
    SELECT p.src_record_key,p.src_extraction_sha256,p.src_file,p.src_row_num,
           p."العميل" client_name,p."clientID" client_id_raw,p."مسلسل" serial_no,
           p."اسم الموكل" principal_name,p."صفة الموكل بالتوكيل" poa_capacity_duplicate,
           p."رقم التوكيل" poa_number,p."حرف" poa_letter,p."السنة" poa_year,
           p."جهة الإصدار" issuing_authority,p."تاريخ الإصدار" issue_date_raw,
           p."المحامون الصادر لهم التوكيل" lawyers_raw,p."عدد النسخ" copies_raw,
           p."ملاحظات" notes,p."الصفة" poa_capacity,p."جرد" show_raw,
           to_jsonb(p)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] source_payload
      FROM staging."التوكيلات" p ORDER BY p.src_record_key`);
  const clients = await db.query<ClientRow>(
    'SELECT id,legacy_id FROM clients WHERE legacy_id IS NOT NULL',
  );
  const aliases = await db.query<AliasRow>('SELECT alias_ar,person_id FROM person_name_alias');
  const rules = await db.query<RuleRow>(`
    SELECT r.id rule_id,r.raw_value,m.ordinal,m.person_id,m.person_name,r.poa_match_mode,
           count(a.*)::text alias_matches
      FROM migration_multi_person_rule r
      JOIN migration_multi_person_rule_member m ON m.rule_id=r.id
      LEFT JOIN person_name_alias a ON a.alias_ar=m.person_name AND a.person_id=m.person_id
     GROUP BY r.id,r.raw_value,r.poa_match_mode,m.ordinal,m.person_id,m.person_name
     ORDER BY r.id,m.ordinal`);
  const exclusions = await db.query<ExclusionRow>(
    'SELECT raw_value,reason FROM migration_excluded_name ORDER BY raw_value',
  );
  const ruleCount = new Set(rules.rows.map((row) => row.rule_id)).size;
  assert.equal(ruleCount, 33, 'reviewed multi-person rule count');
  assert.equal(rules.rows.length, 84, 'reviewed multi-person member count');
  assert.equal(exclusions.rows.length, 38, 'reviewed exclusion count');
  assert.ok(
    rules.rows.every((row) => row.alias_matches === '1'),
    'every reviewed member must resolve through its exact alias',
  );

  const ruleGroups = new Map<number, RuleRow[]>();
  for (const member of rules.rows) {
    const group = ruleGroups.get(member.rule_id) ?? [];
    group.push(member);
    ruleGroups.set(member.rule_id, group);
  }
  for (const members of ruleGroups.values()) {
    assert.ok(members.length > 0);
    assert.deepEqual(
      members.map((member) => member.ordinal),
      members.map((_, index) => index + 1),
    );
  }

  const poaSubstringRules = [...ruleGroups.values()]
    .filter((members) => members[0]!.poa_match_mode === 'substring')
    .sort((left, right) => left[0]!.rule_id - right[0]!.rule_id);
  assert.equal(poaSubstringRules.length, 3, 'approved POA substring rule count');
  const correctedOccurrences = poaSubstringRules.map(
    (members) =>
      source.rows.filter((row) => row.lawyers_raw?.includes(members[0]!.raw_value) === true).length,
  );
  if (expectedCorrectedOccurrences !== undefined)
    assert.deepEqual(
      correctedOccurrences,
      expectedCorrectedOccurrences,
      'corrected POA rule occurrences',
    );
  const clientByLegacy = new Map(clients.rows.map((row) => [String(row.legacy_id), row.id]));
  const aliasByRaw = new Map(aliases.rows.map((row) => [row.alias_ar, row.person_id]));
  const exclusionByRaw = new Map(exclusions.rows.map((row) => [row.raw_value, row]));

  const targets: PoaTargetPlan[] = [];
  const lawyers: PoaLawyerPlan[] = [];
  const transformQuarantine: PoaQuarantinePlan[] = [];
  const relationshipEvidence: PoaRelationshipEvidencePlan[] = [];

  for (const row of source.rows) {
    const fatal = new Map<string, ReasonDetail>();
    const issueDate = strictDate(row.issue_date_raw);
    if (row.issue_date_raw !== null && issueDate === null)
      fatal.set('invalid_issue_date', { value: row.issue_date_raw });
    const copiesCount = strictInteger(row.copies_raw);
    if (row.copies_raw !== null && copiesCount === null)
      fatal.set('invalid_copies_count', { value: row.copies_raw });
    const showOnPoaReport =
      row.show_raw === 'true' ? true : row.show_raw === 'false' ? false : null;
    if (showOnPoaReport === null) fatal.set('invalid_show_on_poa_report', { value: row.show_raw });

    if (fatal.size > 0 || showOnPoaReport === null) {
      transformQuarantine.push(qBase(row, fatal));
      continue;
    }

    let clientId: number | null = null;
    if (row.client_id_raw === null) {
      const reasons = new Map<string, ReasonDetail>([['missing_client_link', { clientID: null }]]);
      relationshipEvidence.push({
        ...qBase(row, reasons),
        relationshipKind: 'client',
        rawValue: null,
        reviewedRuleIds: [],
        resolvedMemberCount: 0,
      });
    } else {
      clientId = clientByLegacy.get(row.client_id_raw) ?? null;
      if (clientId === null) {
        const reasons = new Map<string, ReasonDetail>([
          ['unresolved_client_link', { clientID: row.client_id_raw }],
        ]);
        relationshipEvidence.push({
          ...qBase(row, reasons),
          relationshipKind: 'client',
          rawValue: row.client_id_raw,
          reviewedRuleIds: [],
          resolvedMemberCount: 0,
        });
      }
    }

    targets.push({
      srcRecordKey: row.src_record_key,
      extractionSha256: row.src_extraction_sha256,
      clientId,
      clientName: row.client_name,
      legacyLawyersRaw: row.lawyers_raw,
      serialNo: row.serial_no,
      principalName: row.principal_name,
      poaCapacity: row.poa_capacity,
      poaCapacityDuplicate: row.poa_capacity_duplicate,
      poaNumber: row.poa_number,
      poaLetter: row.poa_letter,
      poaYear: row.poa_year,
      issuingAuthority: row.issuing_authority,
      issueDate,
      copiesCount,
      notes: row.notes,
      showOnPoaReport,
      sourcePayload: row.source_payload,
    });

    const raw = row.lawyers_raw;
    if (raw === null || raw === '') continue;
    const matchingRules = [...ruleGroups.entries()].filter(([, members]) => {
      const ruleRaw = members[0]!.raw_value;
      return members[0]!.poa_match_mode === 'substring' ? raw.includes(ruleRaw) : raw === ruleRaw;
    });
    if (matchingRules.length > 1) {
      const reasons = new Map<string, ReasonDetail>([
        ['overlapping_reviewed_rules', { value: raw, rule_ids: matchingRules.map(([id]) => id) }],
      ]);
      relationshipEvidence.push({
        ...qBase(row, reasons),
        relationshipKind: 'lawyers',
        rawValue: raw,
        reviewedRuleIds: matchingRules.map(([id]) => id),
        resolvedMemberCount: 0,
      });
      continue;
    }
    if (matchingRules.length === 1) {
      const [ruleId, members] = matchingRules[0]!;
      for (const member of members)
        lawyers.push({
          srcRecordKey: row.src_record_key,
          extractionSha256: row.src_extraction_sha256,
          personId: member.person_id,
          legacyLawyersRaw: raw,
          reviewedRuleId: ruleId,
          sourceMemberOrdinal: member.ordinal,
        });
      if (raw !== members[0]!.raw_value) {
        const remainder = raw.replace(members[0]!.raw_value, '');
        const reasons = new Map<string, ReasonDetail>([
          [
            'partially_reviewed_compound_value',
            { value: raw, reviewed_rule_id: ruleId, unreviewed_remainder: remainder },
          ],
        ]);
        relationshipEvidence.push({
          ...qBase(row, reasons),
          relationshipKind: 'lawyers',
          rawValue: raw,
          reviewedRuleIds: [ruleId],
          resolvedMemberCount: members.length,
        });
      }
      continue;
    }
    const directPersonId = aliasByRaw.get(raw);
    if (directPersonId !== undefined) {
      lawyers.push({
        srcRecordKey: row.src_record_key,
        extractionSha256: row.src_extraction_sha256,
        personId: directPersonId,
        legacyLawyersRaw: raw,
        reviewedRuleId: null,
        sourceMemberOrdinal: 1,
      });
      continue;
    }
    const exclusion = exclusionByRaw.get(raw);
    const reasons =
      exclusion === undefined
        ? new Map<string, ReasonDetail>([['unreviewed_lawyer_value', { value: raw }]])
        : new Map<string, ReasonDetail>([
            ['reviewed_exclusion', { value: raw, reason: exclusion.reason }],
          ]);
    relationshipEvidence.push({
      ...qBase(row, reasons),
      relationshipKind: 'lawyers',
      rawValue: raw,
      reviewedRuleIds: [],
      resolvedMemberCount: 0,
    });
  }

  assert.equal(targets.length + transformQuarantine.length, source.rows.length);
  assert.equal(new Set(targets.map((row) => row.srcRecordKey)).size, targets.length);
  assert.equal(
    new Set(lawyers.map((row) => `${row.srcRecordKey}:${row.personId}`)).size,
    lawyers.length,
  );
  return {
    sourceCount: source.rows.length,
    targets,
    lawyers,
    transformQuarantine,
    relationshipEvidence,
    ruleCount,
    memberCount: rules.rows.length,
    exclusionCount: exclusions.rows.length,
    correctedOccurrences,
  };
}
