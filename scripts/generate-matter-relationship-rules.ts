/*
 * Generate task 2.7's reviewed person rules from the firm's canonical SQL.
 * Arabic names and decisions are copied by the generator, never retyped in
 * a migration.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import {
  matterRelationshipRuleFailures,
  readMatterRelationshipRules,
} from './lib/matter-relationship-rules';

const PLACEHOLDER = '-- GENERATED_MATTER_RELATIONSHIP_RULES';
const START = '-- GENERATED_MATTER_RELATIONSHIP_RULES_START';
const END = '-- GENERATED_MATTER_RELATIONSHIP_RULES_END';

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function main() {
  const target = process.argv[2];
  if (target === undefined) {
    throw new Error('usage: npm run generate:matter-relationship-rules -- <migration.sql>');
  }

  const reviewed = readMatterRelationshipRules();
  const failures = matterRelationshipRuleFailures(reviewed);
  if (failures.length > 0) throw new Error(failures.join('; '));

  const generated = [
    START,
    '-- Generated from sql/people-roster-and-aliases.sql. Do not hand-edit reviewed rows.',
  ];
  for (const rule of reviewed.rules) {
    generated.push(
      'INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) ' +
        `VALUES (${sqlText(rule.rawValue)}, ${rule.occurrences}, ${sqlText(rule.reviewerNote)});`,
    );
    for (const member of rule.members) {
      generated.push(
        'INSERT INTO migration_multi_person_rule_member ' +
          '(rule_id, person_name, person_id, ordinal)\n' +
          `SELECT r.id, ${sqlText(member.personName)}, a.person_id, ${member.ordinal}\n` +
          '  FROM migration_multi_person_rule r\n' +
          `  JOIN person_name_alias a ON a.alias_ar = ${sqlText(member.personName)}\n` +
          ` WHERE r.raw_value = ${sqlText(rule.rawValue)};`,
      );
    }
  }
  for (const exclusion of reviewed.exclusions) {
    generated.push(
      'INSERT INTO migration_excluded_name (raw_value, occurrences, reason) ' +
        `VALUES (${sqlText(exclusion.rawValue)}, ${exclusion.occurrences}, ${sqlText(exclusion.reason)});`,
    );
  }
  generated.push(END);

  const migration = readFileSync(target, 'utf8');
  const block = generated.join('\n');
  let next: string;
  const placeholders = migration.split(/\r?\n/).filter((line) => line === PLACEHOLDER);
  if (placeholders.length > 0) {
    if (placeholders.length !== 1) throw new Error('generator placeholder repeats');
    next = migration.replace(PLACEHOLDER, block);
  } else {
    const start = migration.indexOf(START);
    const end = migration.indexOf(END);
    if (start < 0 || end < start) throw new Error('generated rule markers are missing');
    next = migration.slice(0, start) + block + migration.slice(end + END.length);
  }

  if (process.argv.includes('--check')) {
    if (next !== migration) throw new Error(`${target}: generated rules differ from canonical SQL`);
  } else {
    writeFileSync(target, next, 'utf8');
  }
  console.log(
    `${process.argv.includes('--check') ? 'Verified' : 'Generated'} ` +
      '33 rules, 84 ordered members and 38 exclusions.',
  );
}

main();
