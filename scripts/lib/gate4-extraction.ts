import { resolve } from 'node:path';
import {
  gate4CsvObject,
  readGate4Csv,
  readGate4Manifest,
  type Gate4CsvTable,
  type Gate4ManifestRow,
} from './gate4-csv';
import { assertGate4Fingerprint } from './gate4-contract';

export const GATE4_EXTRACTION_FINGERPRINT =
  '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979';

export const GATE4_CURRENT_ACCESS_SHA256 =
  '1A1DA8D573CA92AD67EFBE638F2C043D02DF278E88563C31EEA8CE4A4F07B4BC';

export const GATE4_ACCESS_BYTES = 46_661_632;
export const GATE4_EXTRACTION_MODIFIED = '2026-08-23T07:31:52.6811852Z';
export const GATE4_CURRENT_ACCESS_MODIFIED = '2026-08-24T11:52:37.2957010Z';

export const GATE4_COMPLEX_OBJECTS = [
  'Contacts.Attachments',
  'العملاء.logo',
  'خطابات الأتعاب.Matter',
] as const;

export const GATE4_MIGRATED_TABLES = [
  'admin work table',
  'Attendance',
  'Contacts',
  'lawyers',
  'إجراءات المهام',
  'التوكيلات',
  'الجلسات',
  'الدعاوى',
  'السداد',
  'العملاء',
  'الفواتير',
  'المستندات',
  'تقسيم التحصيلات',
  'خطابات الأتعاب',
  'فريق العمل',
] as const;

export const GATE4_REFERENCE_TABLES = ['LawyerShare4Invoices', 'المحامين'] as const;

export const GATE4_ARCHIVE_TABLES = [
  'Copy Of العملاء',
  'Follow-up',
  'meeting_attendance',
  'Paste Errors',
  'pivotCharصالح-ضد',
  'Switchboard Items',
  'tblMinMatterHearingDate',
  'اجتماع',
  'حضور الاجتماع اليومي',
  'عهدة قسم القضايا',
] as const;

export type Gate4ExtractedRow = Readonly<{
  sourceKey: string;
  values: Readonly<Record<string, string | null>>;
}>;

export type Gate4ExtractedTable = Readonly<{
  name: string;
  manifest: Gate4ManifestRow;
  csv: Gate4CsvTable;
  rows: readonly Gate4ExtractedRow[];
}>;

export type Gate4Extraction = Readonly<{
  root: string;
  sourcePath: string;
  sourceModified: string;
  sourceBytes: number;
  fingerprint: string;
  tables: ReadonlyMap<string, Gate4ExtractedTable>;
  complex: ReadonlyMap<string, Gate4ExtractedTable>;
  parentRows: number;
  migratedRows: number;
  referenceRows: number;
  complexRows: number;
  stagingRows: number;
  columnsByTable: ReadonlyMap<string, readonly string[]>;
  columns: readonly Gate4ManifestRow[];
  relationships: readonly Gate4ManifestRow[];
}>;

export type Gate4ExtractionIdentity = Readonly<{
  fingerprint: string;
  sourceBytes: number;
  sourceModified?: string;
}>;

const AUTHORITATIVE_EXTRACTION_IDENTITY: Gate4ExtractionIdentity = {
  fingerprint: GATE4_EXTRACTION_FINGERPRINT,
  sourceBytes: GATE4_ACCESS_BYTES,
  sourceModified: GATE4_EXTRACTION_MODIFIED,
};

function required(row: Gate4ManifestRow, field: string, where: string): string {
  const value = row[field];
  if (value === undefined || value === null || value === '')
    throw new Error(`${where}: ${field} is missing`);
  return value;
}

function count(value: string, where: string): number {
  if (!/^[0-9]+$/u.test(value)) throw new Error(`${where}: invalid count ${value}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${where}: unsafe count ${value}`);
  return parsed;
}

function expectedSet<T extends readonly string[]>(values: T): Set<string> {
  return new Set(values);
}

export async function loadGate4Extraction(
  root = resolve('_migration'),
  identity: Gate4ExtractionIdentity = AUTHORITATIVE_EXTRACTION_IDENTITY,
): Promise<Gate4Extraction> {
  const manifestPath = resolve(root, 'meta', 'manifest.csv');
  const manifest = await readGate4Manifest(manifestPath);
  const sourceRows = manifest.filter((row) => row['object_type'] === 'source');
  if (sourceRows.length !== 1) throw new Error(`manifest has ${sourceRows.length} source rows`);
  const source = sourceRows[0]!;
  const fingerprint = required(source, 'sha256', 'manifest source').toUpperCase();
  assertGate4Fingerprint(fingerprint, identity.fingerprint);
  const sourceBytes = count(required(source, 'bytes', 'manifest source'), 'manifest source bytes');
  if (sourceBytes !== identity.sourceBytes)
    throw new Error(`manifest source bytes are ${sourceBytes}/${identity.sourceBytes}`);
  const sourceModified = required(source, 'source_modified_utc', 'manifest source');
  if (identity.sourceModified !== undefined && sourceModified !== identity.sourceModified)
    throw new Error(
      `manifest source modified time is ${sourceModified}/${identity.sourceModified}`,
    );

  const tableManifest = manifest.filter((row) => row['object_type'] === 'table');
  const complexManifest = manifest.filter((row) => row['object_type'] === 'complex');
  const expectedTables = expectedSet([...GATE4_MIGRATED_TABLES, ...GATE4_REFERENCE_TABLES]);
  if (tableManifest.length !== expectedTables.size)
    throw new Error(`manifest has ${tableManifest.length}/${expectedTables.size} table rows`);
  for (const row of tableManifest) {
    const name = required(row, 'name', 'manifest table');
    if (!expectedTables.delete(name))
      throw new Error(`unexpected or duplicate manifest table: ${name}`);
  }
  if (expectedTables.size > 0)
    throw new Error(`manifest tables missing: ${[...expectedTables].join(', ')}`);
  const expectedComplex = expectedSet(GATE4_COMPLEX_OBJECTS);
  if (complexManifest.length !== expectedComplex.size)
    throw new Error(`manifest has ${complexManifest.length}/${expectedComplex.size} complex rows`);
  for (const row of complexManifest) {
    const name = required(row, 'name', 'manifest complex object');
    if (!expectedComplex.delete(name))
      throw new Error(`unexpected or duplicate manifest complex object: ${name}`);
  }
  if (expectedComplex.size > 0)
    throw new Error(`manifest complex objects missing: ${[...expectedComplex].join(', ')}`);

  const columnsCsv = await readGate4Csv(resolve(root, 'meta', 'columns.csv'), 'columns');
  const columns = columnsCsv.records.map((record) => gate4CsvObject(columnsCsv, record));
  const plainColumns = new Map<string, string[]>();
  const allColumns = new Map<string, string[]>();
  for (const row of columns) {
    const table = row['table_name'];
    const column = row['column_name'];
    if (table === undefined || table === null || column === undefined || column === null)
      throw new Error('columns.csv has an empty name');
    allColumns.set(table, [...(allColumns.get(table) ?? []), column]);
    if (row['is_complex'] === 'true') continue;
    plainColumns.set(table, [...(plainColumns.get(table) ?? []), column]);
  }

  async function load(
    rows: readonly Gate4ManifestRow[],
  ): Promise<Map<string, Gate4ExtractedTable>> {
    const output = new Map<string, Gate4ExtractedTable>();
    for (const row of rows) {
      const name = required(row, 'name', 'manifest object');
      const outputFile = required(row, 'output_file', `manifest ${name}`);
      const csv = await readGate4Csv(resolve(root, ...outputFile.split('/')), name);
      const expectedRows = count(required(row, 'row_count', `manifest ${name}`), `${name} rows`);
      if (csv.records.length !== expectedRows)
        throw new Error(`${name}: CSV has ${csv.records.length}/${expectedRows} rows`);
      const expectedSha = required(row, 'sha256', `manifest ${name}`).toLowerCase();
      if (csv.sha256 !== expectedSha)
        throw new Error(`${name}: CSV SHA-256 is ${csv.sha256}/${expectedSha}`);
      const expectedBytes = count(required(row, 'bytes', `manifest ${name}`), `${name} bytes`);
      if (csv.bytes !== expectedBytes)
        throw new Error(`${name}: CSV bytes are ${csv.bytes}/${expectedBytes}`);
      if (row['object_type'] === 'table') {
        const expectedHeader = plainColumns.get(name);
        if (expectedHeader === undefined) throw new Error(`${name}: no column dictionary`);
        if (JSON.stringify(csv.header) !== JSON.stringify(expectedHeader))
          throw new Error(`${name}: CSV header differs from columns.csv`);
      }
      output.set(name, {
        name,
        manifest: row,
        csv,
        rows: csv.records.map((record, index) => ({
          sourceKey: csv.sourceKeys[index]!,
          values: gate4CsvObject(csv, record),
        })),
      });
    }
    return output;
  }

  const tables = await load(tableManifest);
  const complex = await load(complexManifest);
  const parentRows = [...tables.values()].reduce((sum, table) => sum + table.rows.length, 0);
  const migratedRows = GATE4_MIGRATED_TABLES.reduce(
    (sum, name) => sum + (tables.get(name)?.rows.length ?? 0),
    0,
  );
  const referenceRows = GATE4_REFERENCE_TABLES.reduce(
    (sum, name) => sum + (tables.get(name)?.rows.length ?? 0),
    0,
  );
  const complexRows = [...complex.values()].reduce((sum, table) => sum + table.rows.length, 0);
  if (complexRows !== 342) throw new Error(`complex rows are ${complexRows}/342`);
  const relationshipsCsv = await readGate4Csv(
    resolve(root, 'meta', 'relationships.csv'),
    'relationships',
  );
  const relationships = relationshipsCsv.records.map((record) =>
    gate4CsvObject(relationshipsCsv, record),
  );
  if (relationships.length !== 17)
    throw new Error(`extraction relationships are ${relationships.length}/17`);
  return {
    root,
    sourcePath: required(source, 'output_file', 'manifest source'),
    sourceModified,
    sourceBytes,
    fingerprint,
    tables,
    complex,
    parentRows,
    migratedRows,
    referenceRows,
    complexRows,
    stagingRows: parentRows + complexRows,
    columnsByTable: allColumns,
    columns,
    relationships,
  };
}

export function extractionTable(extraction: Gate4Extraction, name: string): Gate4ExtractedTable {
  const table = extraction.tables.get(name);
  if (table === undefined) throw new Error(`extraction table is missing: ${name}`);
  return table;
}
