import { readFileSync } from 'node:fs';

export const RELATIONSHIP_RULE_SOURCE = 'sql/people-roster-and-aliases.sql';

export type MultiPersonRule = {
  rawValue: string;
  occurrences: number;
  reviewerNote: string;
  members: Array<{ personName: string; ordinal: number }>;
};

export type ExcludedName = {
  rawValue: string;
  occurrences: number;
  reason: string;
};

export type MatterRelationshipRules = {
  rules: MultiPersonRule[];
  exclusions: ExcludedName[];
};

const RULE_PATTERN =
  /^INSERT INTO migration_multi_person_rule \(raw_value, occurrences, reviewer_note\) VALUES \('((?:[^']|'')*)', (\d+), '((?:[^']|'')*)'\);$/;
const MEMBER_PATTERN =
  /^INSERT INTO migration_multi_person_member \(rule_id, person_name, ordinal\) SELECT id, '((?:[^']|'')*)', (\d+) FROM migration_multi_person_rule WHERE raw_value = '((?:[^']|'')*)';$/;
const EXCLUSION_PATTERN =
  /^INSERT INTO migration_excluded_name VALUES \('((?:[^']|'')*)',\s*(\d+), '((?:[^']|'')*)'\);$/;

function sqlText(value: string): string {
  return value.replaceAll("''", "'");
}

export function readMatterRelationshipRules(
  source = RELATIONSHIP_RULE_SOURCE,
): MatterRelationshipRules {
  const rules = new Map<string, MultiPersonRule>();
  const exclusions: ExcludedName[] = [];

  for (const line of readFileSync(source, 'utf8').split(/\r?\n/)) {
    const rule = line.match(RULE_PATTERN);
    if (rule !== null) {
      const rawValue = sqlText(rule[1]!);
      if (rules.has(rawValue)) throw new Error(`duplicate multi-person rule: ${rawValue}`);
      rules.set(rawValue, {
        rawValue,
        occurrences: Number(rule[2]),
        reviewerNote: sqlText(rule[3]!),
        members: [],
      });
      continue;
    }

    const member = line.match(MEMBER_PATTERN);
    if (member !== null) {
      const rawValue = sqlText(member[3]!);
      const parent = rules.get(rawValue);
      if (parent === undefined) {
        throw new Error(`multi-person member appears before or without its rule: ${rawValue}`);
      }
      parent.members.push({ personName: sqlText(member[1]!), ordinal: Number(member[2]) });
      continue;
    }

    const exclusion = line.match(EXCLUSION_PATTERN);
    if (exclusion !== null) {
      exclusions.push({
        rawValue: sqlText(exclusion[1]!),
        occurrences: Number(exclusion[2]),
        reason: sqlText(exclusion[3]!),
      });
    }
  }

  return { rules: [...rules.values()], exclusions };
}

export const correctedMultiPersonRules = [
  {
    rawValue:
      'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي',
    members: [
      'خالد عطيه',
      'أحمد عبد الله',
      'محمد عبد العزيز عبد الحافظ',
      'شريف أبو المكارم',
      'أحمد سعيد',
      'محمد الغرابلي',
    ],
  },
  {
    rawValue:
      'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي',
    members: [
      'خالد عطيه',
      'أحمد عبد الله',
      'محمد عبد العزيز عبد الحافظ',
      'أحمد سعيد',
      'محمد الغرابلي',
    ],
  },
  {
    rawValue:
      'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا',
    members: [
      'هاني سري الدين',
      'أميرة شريف',
      'إيهاب حمدي',
      'محمد عبد العزيز',
      'أحمد سعيد',
      'محمد حمدي',
      'هاني الدالي',
      'عبد الرحمن البنا',
    ],
  },
] as const;

export function matterRelationshipRuleFailures(data: MatterRelationshipRules): string[] {
  const failures: string[] = [];
  const members = data.rules.flatMap((rule) => rule.members);

  if (data.rules.length !== 33) failures.push(`rules ${data.rules.length}/33`);
  if (members.length !== 84) failures.push(`members ${members.length}/84`);
  if (data.exclusions.length !== 38) failures.push(`exclusions ${data.exclusions.length}/38`);

  for (const rule of data.rules) {
    const ordinals = rule.members.map((member) => member.ordinal);
    if (ordinals.length === 0) failures.push(`empty rule: ${rule.rawValue}`);
    if (ordinals.some((ordinal, index) => ordinal !== index + 1)) {
      failures.push(`ordinal gap or duplicate: ${rule.rawValue}`);
    }
    if (new Set(rule.members.map((member) => member.personName)).size !== rule.members.length) {
      failures.push(`duplicate member: ${rule.rawValue}`);
    }
  }

  for (const corrected of correctedMultiPersonRules) {
    const actual = data.rules.find((rule) => rule.rawValue === corrected.rawValue);
    if (actual === undefined) {
      failures.push(`corrected rule missing: ${corrected.rawValue}`);
      continue;
    }
    const names = actual.members.map((member) => member.personName);
    if (JSON.stringify(names) !== JSON.stringify(corrected.members)) {
      failures.push(`corrected membership/order wrong: ${corrected.rawValue}`);
    }
  }

  const malformed =
    'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز عبدالحافظ - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا';
  if (members.some((member) => member.personName === malformed)) {
    failures.push('malformed eight-person pseudo-member remains');
  }
  return failures;
}
