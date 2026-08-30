import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { SourceField } from './source-identity';
import { sourceRecordKeys } from './source-identity';

export type Gate4CsvRecord = Readonly<{
  fields: readonly SourceField[];
  raw: string;
}>;

export type Gate4CsvTable = Readonly<{
  path: string;
  header: readonly string[];
  records: readonly Gate4CsvRecord[];
  sourceKeys: readonly string[];
  sha256: string;
  bytes: number;
}>;

export type Gate4ManifestRow = Readonly<Record<string, string | null>>;

function hash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Strict RFC-4180 scanner retaining the quoted-empty distinction. */
export function scanGate4Csv(textWithOptionalBom: string): Gate4CsvRecord[] {
  const text = textWithOptionalBom.startsWith('\uFEFF')
    ? textWithOptionalBom.slice(1)
    : textWithOptionalBom;
  const records: Gate4CsvRecord[] = [];
  let fields: SourceField[] = [];
  let field = '';
  let quoted = false;
  let inQuotes = false;
  let closedQuote = false;
  let recordStart = 0;
  let index = 0;

  const endField = (): void => {
    fields.push({ text: field, quoted });
    field = '';
    quoted = false;
    closedQuote = false;
  };
  const endRecord = (end: number): void => {
    endField();
    records.push({ fields, raw: text.slice(recordStart, end) });
    fields = [];
  };

  while (index < text.length) {
    const character = text[index]!;
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        closedQuote = true;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }
    if (closedQuote && character !== ',' && character !== '\r' && character !== '\n')
      throw new Error(`text after a closing CSV quote at character ${index}`);
    if (character === '"') {
      if (field !== '' || closedQuote)
        throw new Error(`unexpected CSV quote at character ${index}`);
      quoted = true;
      inQuotes = true;
      index += 1;
      continue;
    }
    if (character === ',') {
      endField();
      index += 1;
      continue;
    }
    if (character === '\r') {
      if (text[index + 1] !== '\n') throw new Error(`bare CR at character ${index}`);
      endRecord(index);
      index += 2;
      recordStart = index;
      continue;
    }
    if (character === '\n') {
      endRecord(index);
      index += 1;
      recordStart = index;
      continue;
    }
    field += character;
    index += 1;
  }
  if (inQuotes) throw new Error('unterminated quoted CSV field');
  if (recordStart < text.length || field !== '' || fields.length > 0) endRecord(text.length);
  return records;
}

function value(field: SourceField): string | null {
  return field.text === '' && !field.quoted ? null : field.text;
}

export function gate4CsvValue(record: Gate4CsvRecord, index: number): string | null {
  const field = record.fields[index];
  if (field === undefined) throw new Error(`CSV record has no field ${index}`);
  return value(field);
}

export function gate4CsvObject(
  table: Gate4CsvTable,
  record: Gate4CsvRecord,
): Readonly<Record<string, string | null>> {
  if (record.fields.length !== table.header.length)
    throw new Error(
      `${table.path}: record has ${record.fields.length} fields, expected ${table.header.length}`,
    );
  return Object.fromEntries(
    table.header.map((name, index) => [name, value(record.fields[index]!)]),
  );
}

export async function readGate4Csv(path: string, sourceName: string): Promise<Gate4CsvTable> {
  const buffer = await readFile(path);
  const rows = scanGate4Csv(buffer.toString('utf8'));
  const header = rows.shift();
  if (header === undefined) throw new Error(`${path}: CSV is empty`);
  if (header.fields.some((field) => field.text === '')) throw new Error(`${path}: empty header`);
  const width = header.fields.length;
  for (const [index, record] of rows.entries())
    if (record.fields.length !== width)
      throw new Error(`${path}: record ${index + 1} has ${record.fields.length}/${width} fields`);
  return {
    path,
    header: header.fields.map((field) => field.text),
    records: rows,
    sourceKeys: sourceRecordKeys(sourceName, rows),
    sha256: hash(buffer),
    bytes: buffer.length,
  };
}

export async function readGate4Manifest(path: string): Promise<readonly Gate4ManifestRow[]> {
  const table = await readGate4Csv(path, 'manifest');
  return table.records.map((record) => gate4CsvObject(table, record));
}

export function gate4CanonicalMultiset(
  records: readonly Gate4CsvRecord[],
): readonly Readonly<{ canonical: string; occurrences: number }>[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const canonical = JSON.stringify(
      record.fields.map((field) => (field.text === '' && !field.quoted ? null : field.text)),
    );
    counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([canonical, occurrences]) => ({ canonical, occurrences }));
}
