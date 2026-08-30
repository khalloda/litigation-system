import { createHash } from 'node:crypto';

export type Gate4Scalar = string | null;

export type Gate4Row = Readonly<{
  identity: string;
  values: readonly Gate4Scalar[];
}>;

export type Gate4Dataset = Readonly<{
  name: string;
  fields: readonly string[];
  parameters: Readonly<Record<string, Gate4Scalar>>;
  rows: readonly Gate4Row[];
  ordering: readonly string[];
}>;

export type Gate4ChangedRow = Readonly<{
  identity: string;
  source: readonly Gate4Scalar[];
  target: readonly Gate4Scalar[];
}>;

export type Gate4Comparison = Readonly<{
  name: string;
  sourceCount: number;
  targetCount: number;
  exactMatches: number;
  missing: readonly Gate4Row[];
  additional: readonly Gate4Row[];
  changed: readonly Gate4ChangedRow[];
  orderMatches: boolean;
  parameterMatches: boolean;
  sourceDigest: string;
  targetDigest: string;
  defects: readonly string[];
}>;

export type Gate4TableAccounting = Readonly<{
  name: string;
  classification: 'migrated' | 'reference' | 'archive';
  sourceRows: number;
  representedSourceRows: number;
  targetRows: number;
  transformedRows: number;
  quarantinedRows: number;
  reviewedExcludedRows?: number;
  note?: string;
}>;

export const GATE4_DATABASE = 'litigation';
export const GATE4_HOST = 'localhost';
export const GATE4_PORT = 5433;

/**
 * Canonical scalar contract used by every Gate 4 digest and comparison.
 *
 * - NULL is encoded as the JSON value null; it never equals empty text.
 * - Text remains exact UTF-8, including Arabic, whitespace and line breaks.
 * - Decimals must already be exact base-10 text. Callers never pass a JS
 *   number for money.
 * - Dates must already be YYYY-MM-DD. Gate 4 never constructs a local Date,
 *   so a timezone cannot move a hearing into another day or year.
 */
export function gate4CanonicalRows(rows: readonly Gate4Row[]): string {
  return JSON.stringify(rows.map((row) => [row.identity, ...row.values]));
}

export function gate4Digest(rows: readonly Gate4Row[]): string {
  return createHash('sha256').update(gate4CanonicalRows(rows), 'utf8').digest('hex');
}

export function gate4DigestText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function gate4CodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function occurrences(rows: readonly Gate4Row[]): Map<string, Gate4Row[]> {
  const result = new Map<string, Gate4Row[]>();
  for (const row of rows) result.set(row.identity, [...(result.get(row.identity) ?? []), row]);
  return result;
}

function sameValues(left: readonly Gate4Scalar[], right: readonly Gate4Scalar[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function compareGate4Datasets(source: Gate4Dataset, target: Gate4Dataset): Gate4Comparison {
  const defects: string[] = [];
  if (source.name !== target.name)
    defects.push(`dataset name differs: ${source.name}/${target.name}`);
  if (JSON.stringify(source.fields) !== JSON.stringify(target.fields))
    defects.push('field contract differs');
  const parameterMatches = JSON.stringify(source.parameters) === JSON.stringify(target.parameters);
  if (!parameterMatches) defects.push('parameter contract differs');
  if (JSON.stringify(source.ordering) !== JSON.stringify(target.ordering))
    defects.push('ordering contract differs');

  const sourceByIdentity = occurrences(source.rows);
  const targetByIdentity = occurrences(target.rows);
  const missing: Gate4Row[] = [];
  const additional: Gate4Row[] = [];
  const changed: Gate4ChangedRow[] = [];
  let exactMatches = 0;
  const identities = [...new Set([...sourceByIdentity.keys(), ...targetByIdentity.keys()])].sort(
    gate4CodePoint,
  );
  for (const identity of identities) {
    const sourceRows = sourceByIdentity.get(identity) ?? [];
    const targetRows = targetByIdentity.get(identity) ?? [];
    const shared = Math.min(sourceRows.length, targetRows.length);
    for (let index = 0; index < shared; index += 1) {
      const sourceRow = sourceRows[index]!;
      const targetRow = targetRows[index]!;
      if (sameValues(sourceRow.values, targetRow.values)) exactMatches += 1;
      else changed.push({ identity, source: sourceRow.values, target: targetRow.values });
    }
    missing.push(...sourceRows.slice(shared));
    additional.push(...targetRows.slice(shared));
  }
  if (missing.length > 0) defects.push(`${missing.length} source row(s) are missing`);
  if (additional.length > 0) defects.push(`${additional.length} target row(s) are additional`);
  if (changed.length > 0) defects.push(`${changed.length} row(s) changed`);

  const orderMatches =
    source.ordering.length === 0 ||
    JSON.stringify(source.rows.map((row) => row.identity)) ===
      JSON.stringify(target.rows.map((row) => row.identity));
  if (!orderMatches) defects.push('defined row order differs');

  return {
    name: source.name,
    sourceCount: source.rows.length,
    targetCount: target.rows.length,
    exactMatches,
    missing,
    additional,
    changed,
    orderMatches,
    parameterMatches,
    sourceDigest: gate4Digest(source.rows),
    targetDigest: gate4Digest(target.rows),
    defects,
  };
}

export function gate4AccountingFailures(rows: readonly Gate4TableAccounting[]): string[] {
  const failures: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.name)) failures.push(`table is classified twice: ${row.name}`);
    seen.add(row.name);
    for (const [field, value] of Object.entries({
      sourceRows: row.sourceRows,
      representedSourceRows: row.representedSourceRows,
      targetRows: row.targetRows,
      transformedRows: row.transformedRows,
      quarantinedRows: row.quarantinedRows,
      reviewedExcludedRows: row.reviewedExcludedRows ?? 0,
    })) {
      if (!Number.isSafeInteger(value) || value < 0)
        failures.push(`${row.name}.${field} is not a non-negative integer`);
    }
    if (row.classification === 'migrated') {
      if (
        row.representedSourceRows + row.quarantinedRows + (row.reviewedExcludedRows ?? 0) !==
        row.sourceRows
      )
        failures.push(
          `${row.name}: ${row.sourceRows} source != ${row.representedSourceRows} represented + ${row.quarantinedRows} quarantined + ${row.reviewedExcludedRows ?? 0} reviewed exclusions`,
        );
      if (row.transformedRows !== row.targetRows)
        failures.push(`${row.name}: transformed and target rows differ`);
      if (row.representedSourceRows !== row.targetRows && row.note === undefined)
        failures.push(`${row.name}: a merge/expansion needs an explicit accounting note`);
      if ((row.reviewedExcludedRows ?? 0) > 0 && row.note === undefined)
        failures.push(`${row.name}: reviewed exclusions need an explicit accounting note`);
    } else {
      if (row.targetRows !== 0 || row.transformedRows !== 0 || row.quarantinedRows !== 0)
        failures.push(`${row.name}: ${row.classification}-only table produced a business outcome`);
      if (row.representedSourceRows !== row.sourceRows)
        failures.push(`${row.name}: ${row.classification} rows are not completely represented`);
      if ((row.reviewedExcludedRows ?? 0) !== 0)
        failures.push(`${row.name}: ${row.classification} rows cannot be reviewed exclusions`);
    }
  }
  return failures;
}

export function assertGate4DatabaseUrl(raw: string | undefined): URL {
  if (raw === undefined || raw.trim() === '') throw new Error('DATABASE_URL is missing');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:')
    throw new Error('Gate 4 requires PostgreSQL');
  const port = parsed.port === '' ? 5432 : Number(parsed.port);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//u, ''));
  if (parsed.hostname !== GATE4_HOST || port !== GATE4_PORT || database !== GATE4_DATABASE)
    throw new Error(
      `Gate 4 refuses ${parsed.hostname}:${port}/${database}; expected ${GATE4_HOST}:${GATE4_PORT}/${GATE4_DATABASE}`,
    );
  return parsed;
}

export function assertReadOnlySnapshot(settings: {
  database: string;
  readOnly: string;
  isolation: string;
  serverPort: number;
}): void {
  if (settings.database !== GATE4_DATABASE)
    throw new Error(`connected database is ${settings.database}, expected ${GATE4_DATABASE}`);
  if (settings.serverPort !== 5432)
    throw new Error(`PostgreSQL container server port is ${settings.serverPort}, expected 5432`);
  if (settings.readOnly !== 'on') throw new Error('Gate 4 transaction is writable');
  if (settings.isolation.toLowerCase() !== 'repeatable read')
    throw new Error(`Gate 4 isolation is ${settings.isolation}, expected repeatable read`);
}

export function assertGate4Fingerprint(actual: string, expected: string): void {
  if (!/^[0-9A-F]{64}$/u.test(expected)) throw new Error('expected fingerprint is malformed');
  if (actual.toUpperCase() !== expected)
    throw new Error(`source extraction fingerprint differs: ${actual}/${expected}`);
}

export function assertIndependentImplementations(sourceMarker: string, targetMarker: string): void {
  if (sourceMarker.trim() === '' || targetMarker.trim() === '')
    throw new Error('source and target implementation markers are required');
  if (sourceMarker === targetMarker)
    throw new Error('source and target accidentally use the same implementation');
}

export function gate4FileEvidenceFailures(
  expected: Readonly<{ path: string; bytes: number; sha256: string; mime: string }>,
  actual: Readonly<{ path: string; bytes: number; sha256: string; mime: string }> | null,
): string[] {
  if (actual === null) return [`${expected.path}: file is missing`];
  const failures: string[] = [];
  if (actual.path !== expected.path)
    failures.push(`${expected.path}: path differs (${actual.path})`);
  if (actual.bytes !== expected.bytes)
    failures.push(`${expected.path}: byte size differs (${actual.bytes}/${expected.bytes})`);
  if (actual.sha256 !== expected.sha256)
    failures.push(`${expected.path}: SHA-256 differs (${actual.sha256}/${expected.sha256})`);
  if (actual.mime !== expected.mime)
    failures.push(`${expected.path}: content type differs (${actual.mime}/${expected.mime})`);
  return failures;
}

export function parseExactDecimal(value: Gate4Scalar): { units: bigint; scale: number } | null {
  if (value === null) return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(value);
  if (match === null) throw new Error(`invalid exact decimal: ${value}`);
  const fraction = match[3] ?? '';
  const units = BigInt(`${match[1]}${match[2]}${fraction}`);
  return { units, scale: fraction.length };
}

export function formatExactDecimal(units: bigint, scale: number): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const raw = absolute.toString().padStart(scale + 1, '0');
  const text =
    scale === 0 ? raw : `${raw.slice(0, raw.length - scale)}.${raw.slice(raw.length - scale)}`;
  return negative ? `-${text}` : text;
}

export function sumExactDecimals(values: readonly Gate4Scalar[], scale = 2): string {
  let total = 0n;
  for (const value of values) {
    const parsed = parseExactDecimal(value);
    if (parsed === null) continue;
    if (parsed.scale > scale) throw new Error(`decimal ${value} has more than ${scale} places`);
    total += parsed.units * 10n ** BigInt(scale - parsed.scale);
  }
  return formatExactDecimal(total, scale);
}

export function gate4Date(value: Gate4Scalar): Gate4Scalar {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: 00:00:00)?$/u.exec(value);
  if (match === null) throw new Error(`invalid Gate 4 date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    throw new Error(`invalid Gate 4 date: ${value}`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}
