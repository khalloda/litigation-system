import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { ClientBase } from 'pg';
import { CLIENT_LOGO_RESULT_BASELINE, CLIENT_LOGO_SOURCE_BASELINE } from './client-logo-baseline';
import {
  assertNoCaseInsensitiveLogoPathCollisions,
  inspectLogo,
  safeRelativeLogoPath,
  type SupportedLogoMime,
} from './client-logo-image';

type CsvRecord = Record<string, string>;

type StagingRow = {
  parent_key: string;
  file_name: string;
  file_type: string;
  byte_size: string;
  stored_path: string;
  src_record_key: string;
  src_extraction_sha256: string;
  client_id: number | null;
  matches: number;
};

export type ClientLogoPlanRow = Readonly<{
  sourceParentKey: number;
  clientId: number;
  sourceRecordKey: string;
  extractionSha256: string;
  sourceStoredPath: string;
  sourcePath: string;
  fileName: string;
  declaredType: string;
  declaredByteSize: string;
  contentType: SupportedLogoMime;
  byteSize: number;
  sha256: string;
  relativePath: string;
}>;

export type ClientLogoPlan = Readonly<{
  rows: readonly ClientLogoPlanRow[];
  sourceDigest: string;
  resultDigest: string;
  totalBytes: number;
  mimeCounts: Readonly<Record<SupportedLogoMime, number>>;
  complexCsvSha256: string;
}>;

export type ClientLogoSourcePaths = Readonly<{
  sourceRoot: string;
  complexCsv: string;
  manifest: string;
  summary: string;
}>;

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseCsv(text: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = text.charCodeAt(0) === 0xfeff ? 1 : 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else field += char;
  }
  assert.ok(!quoted, 'unterminated quoted CSV field');
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift();
  assert.ok(headers && headers.length > 0, 'CSV has no header');
  assert.equal(new Set(headers).size, headers.length, 'CSV has duplicate headers');
  return rows.map((values, rowIndex) => {
    assert.equal(
      values.length,
      headers.length,
      `CSV row ${rowIndex + 2} has the wrong column count`,
    );
    return Object.fromEntries(headers.map((header, index) => [header, values[index]!]));
  });
}

function exactColumns(record: CsvRecord, expected: readonly string[], label: string): void {
  assert.deepEqual(Object.keys(record), expected, `${label} columns changed`);
}

function integer(raw: string, label: string): number {
  assert.match(raw, /^[1-9][0-9]*$/u, `${label} is not a positive integer: ${raw}`);
  const value = Number(raw);
  assert.ok(Number.isSafeInteger(value), `${label} is outside the safe integer range`);
  return value;
}

function canonicalSource(rows: readonly ClientLogoPlanRow[]): string {
  return JSON.stringify(
    rows.map((row) => [
      String(row.sourceParentKey),
      row.fileName,
      row.declaredType,
      row.declaredByteSize,
      row.sourceStoredPath,
      row.sourceRecordKey,
      row.extractionSha256,
      row.contentType,
      row.byteSize,
      row.sha256,
    ]),
  );
}

function canonicalResult(rows: readonly ClientLogoPlanRow[]): string {
  return JSON.stringify(
    rows.map((row) => [
      row.sourceParentKey,
      row.clientId,
      row.sourceRecordKey,
      row.extractionSha256,
      row.sourceStoredPath,
      row.fileName,
      row.contentType,
      row.byteSize,
      row.sha256,
      row.relativePath,
    ]),
  );
}

export async function buildClientLogoPlan(
  db: ClientBase,
  paths: ClientLogoSourcePaths,
  enforceApprovedBaseline = true,
): Promise<ClientLogoPlan> {
  const [csvBuffer, manifestText, summaryText] = await Promise.all([
    readFile(paths.complexCsv),
    readFile(paths.manifest, 'utf8'),
    readFile(paths.summary, 'utf8'),
  ]);
  const csvRows = parseCsv(csvBuffer.toString('utf8'));
  if (enforceApprovedBaseline)
    assert.equal(csvRows.length, 54, 'client-logo complex CSV must contain exactly 54 rows');
  else assert.ok(csvRows.length > 0, 'client-logo fixture CSV must not be empty');
  for (const record of csvRows)
    exactColumns(
      record,
      ['parent_key', 'file_name', 'file_type', 'byte_size', 'stored_path'],
      'logo CSV',
    );

  const manifestRows = parseCsv(manifestText);
  const manifestMatches = manifestRows.filter((row) => row['name'] === 'العملاء.logo');
  assert.equal(manifestMatches.length, 1, 'manifest must contain exactly one العملاء.logo row');
  const manifest = manifestMatches[0]!;
  assert.equal(manifest['object_type'], 'complex');
  assert.equal(manifest['output_file'], 'complex/العملاء__logo__attachments.csv');
  assert.equal(integer(manifest['row_count'] ?? '', 'manifest row_count'), csvRows.length);
  assert.equal(integer(manifest['attachments'] ?? '', 'manifest attachments'), csvRows.length);
  assert.equal(integer(manifest['bytes'] ?? '', 'manifest bytes'), csvBuffer.length);
  assert.equal((manifest['sha256'] ?? '').toLowerCase(), sha256(csvBuffer));

  const summary = JSON.parse(summaryText) as { source_sha256?: unknown };
  assert.equal(typeof summary.source_sha256, 'string', 'summary source_sha256 is missing');
  const extractionSha256 = summary.source_sha256 as string;

  const staging = await db.query<StagingRow>(`
    SELECT s.parent_key,s.file_name,s.file_type,s.byte_size,s.stored_path,
           s.src_record_key,s.src_extraction_sha256,
           min(c.id)::int client_id,count(c.id)::int matches
      FROM staging."العملاء__logo" s
      LEFT JOIN clients c ON c.legacy_id=s.parent_key::integer
     GROUP BY s.parent_key,s.file_name,s.file_type,s.byte_size,s.stored_path,
              s.src_record_key,s.src_extraction_sha256
     ORDER BY s.parent_key::integer,s.src_record_key`);
  assert.equal(staging.rows.length, csvRows.length, 'staging logo rows changed');
  const stageByStoredPath = new Map(staging.rows.map((row) => [row.stored_path, row]));
  assert.equal(stageByStoredPath.size, csvRows.length, 'staging contains duplicate stored paths');

  const sourceEntries = await readdir(paths.sourceRoot, { withFileTypes: true });
  assert.ok(
    sourceEntries.every((entry) => entry.isFile()),
    'authoritative logo directory contains an unexpected non-file entry',
  );
  const sourceFiles = sourceEntries.filter((entry) => entry.isFile());
  assert.equal(
    sourceFiles.length,
    csvRows.length,
    'authoritative logo directory and complex CSV counts differ',
  );
  const sourceNames = new Set(sourceFiles.map((entry) => entry.name.toLocaleLowerCase('en-US')));
  assert.equal(sourceNames.size, csvRows.length, 'case-insensitive source filename collision');

  const parentKeys = new Set<number>();
  const relativePaths = new Set<string>();
  const rows: ClientLogoPlanRow[] = [];
  for (const csv of csvRows) {
    const parentKeyRaw = csv['parent_key'] ?? '';
    const parentKey = integer(parentKeyRaw, 'parent_key');
    assert.ok(parentKeys.add(parentKey), `duplicate parent key: ${parentKey}`);
    const fileName = csv['file_name'] ?? '';
    const expectedStoredPath = `العملاء__logo\\${parentKey}__${fileName}`;
    assert.equal(csv['stored_path'], expectedStoredPath, `${parentKey}: unexpected stored_path`);
    const sourcePath = resolve(paths.sourceRoot, `${parentKey}__${fileName}`);
    assert.equal(resolve(sourcePath), resolve(paths.sourceRoot, basename(sourcePath)));
    assert.ok(
      sourceNames.has(basename(sourcePath).toLocaleLowerCase('en-US')),
      `${parentKey}: source file missing`,
    );
    const source = await readFile(sourcePath);
    const inspected = inspectLogo(source, fileName, csv['file_type']);
    assert.equal(integer(csv['byte_size'] ?? '', `${parentKey} byte_size`), inspected.byteSize);
    const stage = stageByStoredPath.get(expectedStoredPath);
    assert.ok(stage, `${parentKey}: no exact staging row`);
    assert.equal(stage.parent_key, parentKeyRaw);
    assert.equal(stage.file_name, fileName);
    assert.equal(stage.file_type, csv['file_type']);
    assert.equal(stage.byte_size, csv['byte_size']);
    assert.equal(stage.matches, 1, `${parentKey}: client mapping is missing or ambiguous`);
    assert.ok(stage.client_id !== null, `${parentKey}: client mapping missing`);
    assert.equal(stage.src_extraction_sha256, extractionSha256);
    const relativePath = safeRelativeLogoPath(stage.client_id, fileName);
    const foldedPath = relativePath.toLocaleLowerCase('en-US');
    assert.ok(
      !relativePaths.has(foldedPath),
      `case-insensitive destination collision: ${relativePath}`,
    );
    relativePaths.add(foldedPath);
    rows.push({
      sourceParentKey: parentKey,
      clientId: stage.client_id,
      sourceRecordKey: stage.src_record_key,
      extractionSha256,
      sourceStoredPath: expectedStoredPath,
      sourcePath,
      fileName,
      declaredType: csv['file_type'] ?? '',
      declaredByteSize: csv['byte_size'] ?? '',
      contentType: inspected.contentType,
      byteSize: inspected.byteSize,
      sha256: inspected.sha256,
      relativePath,
    });
  }
  rows.sort(
    (left, right) =>
      left.sourceParentKey - right.sourceParentKey ||
      left.sourceRecordKey.localeCompare(right.sourceRecordKey),
  );
  assert.equal(
    new Set(rows.map((row) => row.clientId)).size,
    rows.length,
    'two source logos map to one client',
  );
  assertNoCaseInsensitiveLogoPathCollisions(rows.map((row) => row.relativePath));
  assert.equal(
    new Set(rows.map((row) => basename(row.sourcePath).toLocaleLowerCase('en-US'))).size,
    sourceNames.size,
    'unreferenced source file',
  );
  const mimeCounts: Record<SupportedLogoMime, number> = {
    'image/gif': 0,
    'image/jpeg': 0,
    'image/png': 0,
  };
  for (const row of rows) mimeCounts[row.contentType]++;
  const totalBytes = rows.reduce((total, row) => total + row.byteSize, 0);
  const sourceDigest = sha256(canonicalSource(rows));
  const resultDigest = sha256(canonicalResult(rows));
  if (enforceApprovedBaseline) {
    assert.equal(csvBuffer.length, CLIENT_LOGO_SOURCE_BASELINE.complexCsvBytes);
    assert.equal(sha256(csvBuffer), CLIENT_LOGO_SOURCE_BASELINE.complexCsvSha256);
    assert.equal(extractionSha256, CLIENT_LOGO_SOURCE_BASELINE.extractionSha256);
    assert.equal(rows.length, CLIENT_LOGO_SOURCE_BASELINE.rows);
    assert.equal(parentKeys.size, CLIENT_LOGO_SOURCE_BASELINE.parentKeys);
    assert.equal(totalBytes, CLIENT_LOGO_SOURCE_BASELINE.totalBytes);
    assert.deepEqual(mimeCounts, CLIENT_LOGO_SOURCE_BASELINE.mimeCounts);
    assert.equal(sourceDigest, CLIENT_LOGO_SOURCE_BASELINE.digest);
    assert.equal(resultDigest, CLIENT_LOGO_RESULT_BASELINE.digest);
  }
  await stat(paths.sourceRoot);
  return {
    rows,
    sourceDigest,
    resultDigest,
    totalBytes,
    mimeCounts,
    complexCsvSha256: sha256(csvBuffer),
  };
}
