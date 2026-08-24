/*
 * Generate the task 2.6 matter-classification crosswalk from the SQL file
 * reviewed by the firm. The Arabic values are never retyped into a migration.
 *
 *   npm run generate:matter-crosswalk -- prisma/migrations/<folder>/migration.sql
 */

import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'sql/lookups-and-crosswalk.sql';
const PLACEHOLDER = '-- GENERATED_MATTER_CROSSWALK';
const START = '-- GENERATED_MATTER_CROSSWALK_START';
const END = '-- GENERATED_MATTER_CROSSWALK_END';
const EXPECTED = new Map([
  ['matterCategory', 50],
  ['matterDegree', 40],
]);
type SqlRow = [string, string, string, string, string, string];

function splitValues(inner: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index];
    if (character === "'") {
      if (quoted && inner[index + 1] === "'") {
        value += "''";
        index += 1;
        continue;
      }
      quoted = !quoted;
      value += character;
      continue;
    }
    if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
      continue;
    }
    value += character;
  }
  values.push(value.trim());

  if (quoted) throw new Error('unterminated SQL string in reviewed crosswalk');
  return values;
}

function parseSqlText(value: string): string | null {
  if (value === 'NULL') return null;
  if (!value.startsWith("'") || !value.endsWith("'")) {
    throw new Error(`expected a SQL text literal, received ${value}`);
  }
  return value.slice(1, -1).replaceAll("''", "'");
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function main() {
  const target = process.argv[2];
  if (target === undefined) {
    throw new Error('usage: npm run generate:matter-crosswalk -- <new migration.sql>');
  }

  const reviewedRows: SqlRow[] = [];
  for (const line of readFileSync(SOURCE, 'utf8').split('\n')) {
    if (!line.startsWith('INSERT INTO migration_crosswalk ')) continue;
    const match = line.match(/ VALUES \((.*)\);$/);
    if (match?.[1] === undefined) throw new Error(`could not parse reviewed row: ${line}`);
    const values = splitValues(match[1]);
    if (values.length !== 6) throw new Error(`reviewed row has ${values.length} fields: ${line}`);
    const row = values as SqlRow;
    const sourceField = parseSqlText(row[0]);
    if (sourceField !== null && EXPECTED.has(sourceField)) reviewedRows.push(row);
  }

  for (const [sourceField, expected] of EXPECTED) {
    const actual = reviewedRows.filter((row) => parseSqlText(row[0]) === sourceField).length;
    if (actual !== expected) {
      throw new Error(`${sourceField}: found ${actual} reviewed rows, expected ${expected}`);
    }
  }
  if (reviewedRows.length !== 90) {
    throw new Error(`matter classification crosswalk: found ${reviewedRows.length}, expected 90`);
  }

  const targetFieldNames = new Map([
    ['matterCategory', 'matter_category'],
    ['matterImportance', 'importance'],
  ]);
  const generated: string[] = [
    START,
    `-- Generated from ${SOURCE}. Do not hand-edit the Arabic mapping rows.`,
  ];
  let splitDestination: string | undefined;

  for (const values of reviewedRows) {
    const rawTargetField = parseSqlText(values[3]);
    if (rawTargetField !== null) {
      values[3] = sqlText(targetFieldNames.get(rawTargetField) ?? rawTargetField);
    }
    if (rawTargetField === 'SPLIT') {
      const structured = parseSqlText(values[4]);
      const match = structured?.match(/^category=.+ \+ distination=(.+)$/);
      if (match?.[1] === undefined) {
        throw new Error(`the reviewed matter SPLIT is not structured as expected: ${structured}`);
      }
      if (splitDestination !== undefined)
        throw new Error('more than one matter SPLIT was reviewed');
      splitDestination = match[1];
    }
    generated.push(
      'INSERT INTO "migration_crosswalk" ' +
        '(source_field, source_value, rows_affected, target_field, target_value, reviewer_note) ' +
        `VALUES (${values.join(', ')});`,
    );
  }

  if (splitDestination === undefined) throw new Error('the reviewed matter SPLIT is missing');
  generated.push('');
  generated.push(
    '-- The reviewed SPLIT names this destination; it is therefore not invented here.',
  );
  generated.push(
    'INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at)\n' +
      `SELECT ${sqlText(splitDestination)},\n` +
      '       (SELECT coalesce(max(sort_order), 0) + 10 FROM "lookup_matter_destination"),\n' +
      '       now()\n' +
      ` WHERE NOT EXISTS (SELECT 1 FROM "lookup_matter_destination" WHERE label_ar = ${sqlText(splitDestination)});`,
  );
  generated.push(END);

  const migration = readFileSync(target, 'utf8');
  const block = generated.join('\n');
  let next: string;
  const placeholderLines = migration.split(/\r?\n/).filter((line) => line === PLACEHOLDER);
  if (placeholderLines.length > 0) {
    if (placeholderLines.length !== 1) {
      throw new Error(`${target}: ${PLACEHOLDER} appears more than once`);
    }
    next = migration.replace(PLACEHOLDER, block);
  } else {
    const start = migration.indexOf(START);
    const end = migration.indexOf(END);
    if (start === -1 || end === -1 || end < start) {
      throw new Error(`${target}: generated matter crosswalk markers are missing`);
    }
    next = migration.slice(0, start) + block + migration.slice(end + END.length);
  }

  if (process.argv.includes('--check')) {
    if (next !== migration) {
      throw new Error(`${target}: generated matter mappings differ from ${SOURCE}`);
    }
  } else {
    writeFileSync(target, next, 'utf8');
  }
  console.log(
    `${process.argv.includes('--check') ? 'Verified' : 'Generated'} 90 reviewed matter mappings in ${target}`,
  );
  console.log(`  matterCategory  50`);
  console.log(`  matterDegree    40`);
  console.log(`  split destination: ${splitDestination}`);
}

main();
