import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { Gate4Extraction } from './gate4-extraction';
import {
  GATE4_ACCESS_BYTES,
  GATE4_ARCHIVE_TABLES,
  GATE4_CURRENT_ACCESS_MODIFIED,
  GATE4_CURRENT_ACCESS_SHA256,
} from './gate4-extraction';
import { gate4CodePoint, gate4DigestText } from './gate4-contract';

export type Gate4AccessColumn = Readonly<{
  name: string;
  ordinal: number;
  type: number;
  size: number;
  required: boolean;
  allow_zero_length: boolean;
}>;

export type Gate4AccessTable = Readonly<{
  name: string;
  rows: number;
  columns: readonly Gate4AccessColumn[];
}>;

export type Gate4AccessRelationship = Readonly<{
  name: string;
  source_table: string;
  target_table: string;
  attributes: number;
  fields: readonly Readonly<{ source: string; target: string }>[];
}>;

export type Gate4AccessQuery = Readonly<{
  name: string;
  sql: string;
  parameters: readonly Readonly<{ name: string; type: number }>[];
  parameter_error: string | null;
  created: string | null;
  modified: string | null;
}>;

export type Gate4AccessReport = Readonly<{
  name: string;
  created: string | null;
  modified: string | null;
}>;

type HelperResult = Readonly<{
  tables: readonly Gate4AccessTable[];
  relationships: readonly Gate4AccessRelationship[];
  queries: readonly Gate4AccessQuery[];
  reports: readonly Gate4AccessReport[];
}>;

export type Gate4AccessAudit = Readonly<{
  sourcePath: string;
  sourceFileName: string;
  physicalSha256: string;
  physicalBytes: number;
  physicalModified: string;
  tables: readonly Gate4AccessTable[];
  relationships: readonly Gate4AccessRelationship[];
  queries: readonly Gate4AccessQuery[];
  reports: readonly Gate4AccessReport[];
  archiveRows: number;
  allUserRows: number;
  tableDigest: string;
  relationshipDigest: string;
  queryDigest: string;
  reportContainerDigest: string;
  logicalActiveReportCount: number;
  selectedReports: readonly Gate4AccessReport[];
  selectedQueries: readonly Gate4AccessQuery[];
  sourceUnchanged: boolean;
  copyUnchanged: boolean;
}>;

const SELECTED_REPORTS = [
  'rptClientMatters1',
  'rptJudgmentsForAgainst',
  'إحصائية أعداد الدعاوى لكل محامي أ',
  'rptHearingsBetween2Dates',
  'أعمال إدارية جميع الجهات -جديد',
  'الفواتير المحصلة -بدون تقسيم',
] as const;

const SELECTED_QUERIES = [
  'إحصائية أعداد الدعاوى لكل محامي أ',
  'الفواتير المحصلة حسب التاريخ',
  'qryMaxAdminFollowUp',
  'qryMaxAdminFollowUp2',
] as const;

function hash(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function fileHash(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return hash(await readFile(path));
}

function canonical<T>(values: readonly T[]): string {
  return JSON.stringify(values);
}

function accessRelationshipRows(
  rows: readonly Gate4AccessRelationship[],
): readonly Readonly<Record<string, string>>[] {
  return rows.flatMap((relationship) =>
    relationship.fields.map((field) => ({
      name: relationship.name,
      parent_table: relationship.source_table,
      parent_field: field.source,
      child_table: relationship.target_table,
      child_field: field.target,
      enforced: String((relationship.attributes & 2) === 0),
      cascade_update: String((relationship.attributes & 256) !== 0),
      cascade_delete: String((relationship.attributes & 4096) !== 0),
      one_to_one: String((relationship.attributes & 1) !== 0),
    })),
  );
}

function extractionRelationshipRows(
  rows: Gate4Extraction['relationships'],
): readonly Readonly<Record<string, string>>[] {
  const fields = [
    'name',
    'parent_table',
    'parent_field',
    'child_table',
    'child_field',
    'enforced',
    'cascade_update',
    'cascade_delete',
    'one_to_one',
  ] as const;
  return rows.map((row) =>
    Object.fromEntries(
      fields.map((field) => {
        const value = row[field];
        if (value === undefined || value === null)
          throw new Error(`extraction relationship ${field} is missing`);
        return [field, value];
      }),
    ),
  );
}

function safeHelperResult(value: unknown): HelperResult {
  if (typeof value !== 'object' || value === null)
    throw new Error('Access helper returned no object');
  const root = value as Record<string, unknown>;
  for (const key of ['tables', 'relationships', 'queries', 'reports'])
    if (!Array.isArray(root[key])) throw new Error(`Access helper ${key} is not an array`);
  return value as HelperResult;
}

function exactNames<T extends { name: string }>(
  rows: readonly T[],
  expected: readonly string[],
  label: string,
): T[] {
  return expected.map((name) => {
    const matches = rows.filter((row) => row.name === name);
    if (matches.length !== 1) throw new Error(`${label} ${name} has ${matches.length} matches`);
    return matches[0]!;
  });
}

function runHelper(copy: string): HelperResult {
  if (process.platform !== 'win32') throw new Error('Gate 4 Access audit requires Windows DAO');
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-File', resolve('scripts', 'lib', 'gate4-access.ps1'), '-DatabasePath', copy],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error) throw new Error(`Access helper did not start: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`Access helper failed (${result.status}): ${result.stderr || result.stdout}`);
  try {
    return safeHelperResult(JSON.parse(result.stdout.trim()));
  } catch (error) {
    throw new Error(
      `Access helper output was not valid JSON: ${error instanceof Error ? error.message : String(error)}\n${result.stderr}`,
    );
  }
}

export async function auditGate4Access(extraction: Gate4Extraction): Promise<Gate4AccessAudit> {
  const sourcePath = resolve(extraction.sourcePath);
  const beforeStat = await stat(sourcePath);
  const beforeHash = (await fileHash(sourcePath)).toUpperCase();
  if (!beforeStat.isFile()) throw new Error(`Access source is not a file: ${sourcePath}`);
  if (beforeStat.size !== GATE4_ACCESS_BYTES)
    throw new Error(`current Access bytes are ${beforeStat.size}/${GATE4_ACCESS_BYTES}`);
  if (beforeHash !== GATE4_CURRENT_ACCESS_SHA256)
    throw new Error(`current Access SHA-256 is ${beforeHash}/${GATE4_CURRENT_ACCESS_SHA256}`);
  // Windows records 100-nanosecond file times; Node exposes milliseconds and
  // rounds this specific .2957010 value to .296. The hash and byte size remain
  // exact, while a one-millisecond tolerance represents only that API loss.
  if (Math.abs(beforeStat.mtime.getTime() - new Date(GATE4_CURRENT_ACCESS_MODIFIED).getTime()) > 1)
    throw new Error(
      `current Access modified time is ${beforeStat.mtime.toISOString()}/${GATE4_CURRENT_ACCESS_MODIFIED}`,
    );

  const root = await mkdtemp(join(tmpdir(), 'litigation-gate4-access-'));
  const copy = join(root, 'source-copy.accdb');
  let helper: HelperResult;
  let copyHashAfter = '';
  try {
    await copyFile(sourcePath, copy, fsConstants.COPYFILE_EXCL);
    const copyHashBefore = (await fileHash(copy)).toUpperCase();
    if (copyHashBefore !== beforeHash) throw new Error('disposable Access copy hash differs');
    const readOnly = spawnSync('attrib.exe', ['+R', copy], { encoding: 'utf8', windowsHide: true });
    if (readOnly.status !== 0)
      throw new Error(`could not mark Access copy read-only: ${readOnly.stderr}`);
    helper = runHelper(copy);
    copyHashAfter = (await fileHash(copy)).toUpperCase();
  } finally {
    spawnSync('attrib.exe', ['-R', copy], { encoding: 'utf8', windowsHide: true });
    await rm(root, { recursive: true, force: true });
  }

  if (helper.tables.length !== 27)
    throw new Error(`Access user tables are ${helper.tables.length}/27`);
  if (helper.relationships.length !== 17)
    throw new Error(`Access relationships are ${helper.relationships.length}/17`);
  if (helper.queries.length !== 138)
    throw new Error(`Access saved queries are ${helper.queries.length}/138`);
  if (helper.reports.length !== 138)
    throw new Error(`Access report documents are ${helper.reports.length}/138`);

  const expectedTableNames = new Set([...extraction.tables.keys(), ...GATE4_ARCHIVE_TABLES]);
  const actualTableNames = new Set(helper.tables.map((table) => table.name));
  const missingTables = [...expectedTableNames].filter((name) => !actualTableNames.has(name));
  const additionalTables = [...actualTableNames].filter((name) => !expectedTableNames.has(name));
  if (missingTables.length > 0 || additionalTables.length > 0)
    throw new Error(
      `Access table inventory differs; missing [${missingTables.join(', ')}], additional [${additionalTables.join(', ')}]`,
    );

  const tableByName = new Map(helper.tables.map((table) => [table.name, table]));
  for (const [name, extracted] of extraction.tables) {
    const access = tableByName.get(name);
    if (access === undefined) throw new Error(`Access table is missing: ${name}`);
    if (access.rows !== extracted.rows.length)
      throw new Error(
        `${name}: Access/extraction rows are ${access.rows}/${extracted.rows.length}`,
      );
    const expectedColumns = extraction.columnsByTable.get(name);
    if (expectedColumns === undefined)
      throw new Error(`${name}: extraction column inventory is missing`);
    const actualColumns = [...access.columns]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((column) => column.name);
    if (JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns))
      throw new Error(`${name}: Access/extraction columns differ`);
  }
  const archiveTables = exactNames(helper.tables, GATE4_ARCHIVE_TABLES, 'archive table');
  const archiveRows = archiveTables.reduce((sum, table) => sum + table.rows, 0);
  const allUserRows = helper.tables.reduce((sum, table) => sum + table.rows, 0);
  const selectedReports = exactNames(helper.reports, SELECTED_REPORTS, 'Access report');
  const selectedQueries = exactNames(helper.queries, SELECTED_QUERIES, 'Access query');
  const relationshipSort = (
    left: Readonly<Record<string, string>>,
    right: Readonly<Record<string, string>>,
  ) => gate4CodePoint(JSON.stringify(left), JSON.stringify(right));
  const actualRelationships = [...accessRelationshipRows(helper.relationships)].sort(
    relationshipSort,
  );
  const expectedRelationships = [...extractionRelationshipRows(extraction.relationships)].sort(
    relationshipSort,
  );
  if (JSON.stringify(actualRelationships) !== JSON.stringify(expectedRelationships))
    throw new Error('current Access relationships differ from the authoritative extraction');

  const afterStat = await stat(sourcePath);
  const afterHash = (await fileHash(sourcePath)).toUpperCase();
  const sourceUnchanged =
    afterHash === beforeHash &&
    afterStat.size === beforeStat.size &&
    afterStat.mtime.getTime() === beforeStat.mtime.getTime();
  if (!sourceUnchanged) throw new Error('authoritative Access source changed during Gate 4 audit');
  if (copyHashAfter !== beforeHash)
    throw new Error('disposable Access copy changed during read-only audit');

  const tableDigest = gate4DigestText(
    canonical(
      [...helper.tables]
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
        .map((table) => [table.name, table.rows, table.columns]),
    ),
  );
  const relationshipDigest = gate4DigestText(
    canonical(
      [...helper.relationships].sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      ),
    ),
  );
  const queryDigest = gate4DigestText(
    canonical(
      [...helper.queries]
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
        .map((query) => [query.name, query.sql, query.parameters, query.parameter_error]),
    ),
  );
  const reportContainerDigest = gate4DigestText(
    canonical(
      [...helper.reports]
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
        .map((report) => report.name),
    ),
  );

  return {
    sourcePath,
    sourceFileName: basename(sourcePath),
    physicalSha256: beforeHash,
    physicalBytes: beforeStat.size,
    physicalModified: GATE4_CURRENT_ACCESS_MODIFIED,
    tables: helper.tables,
    relationships: helper.relationships,
    queries: helper.queries,
    reports: helper.reports,
    archiveRows,
    allUserRows,
    tableDigest,
    relationshipDigest,
    queryDigest,
    reportContainerDigest,
    logicalActiveReportCount: 131,
    selectedReports,
    selectedQueries,
    sourceUnchanged,
    copyUnchanged: true,
  };
}
