import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { ClientBase } from 'pg';
import { CLIENT_LOGO_RESULT_BASELINE, CLIENT_LOGO_SOURCE_BASELINE } from './client-logo-baseline';

type SourceRow = {
  parent_key: string;
  file_name: string;
  file_type: string;
  byte_size: string;
  stored_path: string;
  source_record_key: string;
  extraction_sha256: string;
  client_id: number | null;
  client_matches: number;
};

type AuditRow = {
  source_parent_key: number;
  client_id: number;
  client_logo_id: number;
  source_record_key: string;
  source_extraction_sha256: string;
  source_stored_path: string;
  source_file_name: string;
  detected_content_type: string;
  byte_size: number;
  sha256: string;
  destination_relative_path: string;
  complex_csv_sha256: string;
};

type CurrentRow = {
  id: number;
  client_id: number;
  relative_path: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  created_at: Date;
  updated_at: Date;
  updated_by: number | null;
  updated_by_actor_key: string | null;
};

export type ClientLogoReconciliation = Readonly<{
  defects: readonly string[];
  sourceRows: number;
  auditRows: number;
  currentRows: number;
  distinctClients: number;
  totalBytes: number;
  sourceDigest: string;
  resultDigest: string;
}>;

export type ClientLogoReconciliationOptions = Readonly<{
  logoRoot: string;
  sourceRoot?: string;
  requireCurrentImportRows?: boolean;
  enforceApprovedBaseline?: boolean;
  complexCsvSha256?: string;
}>;

function hash(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceLeaf(storedPath: string): string {
  return storedPath.split(/[\\/]/u).at(-1) ?? '';
}

function runtimePath(root: string, relativePath: string): string | null {
  if (!/^[1-9][0-9]*\/[^/\\]+$/u.test(relativePath)) return null;
  const resolvedRoot = resolve(root);
  const path = resolve(resolvedRoot, ...relativePath.split('/'));
  return path.startsWith(`${resolvedRoot}${sep}`) ? path : null;
}

function independentMime(buffer: Buffer): 'image/gif' | 'image/jpeg' | 'image/png' | null {
  if (buffer.length >= 45 && buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
    let offset = 8;
    let first = true;
    let ended = false;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      if (offset + 12 + length > buffer.length) return null;
      const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
      if (first && (type !== 'IHDR' || length !== 13)) return null;
      first = false;
      offset += 12 + length;
      if (type === 'IEND') {
        ended = length === 0;
        break;
      }
    }
    if (ended && offset === buffer.length) return 'image/png';
    return null;
  }
  if (buffer.length >= 20 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let hasFrame = false;
    let hasScan = false;
    let lastEnd = -1;
    for (let index = 2; index < buffer.length - 1; index++) {
      if (buffer[index] !== 0xff) continue;
      const marker = buffer[index + 1]!;
      if (marker === 0xda) hasScan = true;
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      )
        hasFrame = true;
      if (marker === 0xd9) lastEnd = index + 2;
    }
    if (lastEnd > 0 && hasFrame && hasScan) {
      const trailing = buffer.subarray(lastEnd);
      if ([...trailing].every((byte) => [0x09, 0x0a, 0x0d, 0x20].includes(byte)))
        return 'image/jpeg';
    }
    return null;
  }
  if (buffer.length >= 14) {
    const header = buffer.subarray(0, 6).toString('ascii');
    if (
      (header === 'GIF87a' || header === 'GIF89a') &&
      buffer.readUInt16LE(6) > 0 &&
      buffer.readUInt16LE(8) > 0 &&
      buffer.at(-1) === 0x3b
    )
      return 'image/gif';
  }
  return null;
}

async function fileEvidence(
  path: string,
): Promise<{ bytes: number; sha256: string; mime: string } | null> {
  try {
    const item = await stat(path);
    if (!item.isFile() || item.size === 0) return null;
    const buffer = await readFile(path);
    const mime = independentMime(buffer);
    if (mime === null) return null;
    return { bytes: buffer.length, sha256: hash(buffer), mime };
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : null;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

async function recursiveRelativeFiles(root: string): Promise<string[]> {
  try {
    const output: string[] = [];
    async function visit(path: string, relative: string): Promise<void> {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
        const childPath = join(path, entry.name);
        if (entry.isDirectory()) await visit(childPath, childRelative);
        else if (entry.isFile()) output.push(childRelative);
        else output.push(`${childRelative} [non-file]`);
      }
    }
    await visit(root, '');
    return output.sort((left, right) => left.localeCompare(right));
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : null;
    if (code === 'ENOENT') return [];
    throw error;
  }
}

function sameEvidence(
  label: string,
  expected: { byteSize: number; sha256: string; contentType: string },
  actual: { bytes: number; sha256: string; mime: string } | null,
  defects: string[],
): void {
  if (actual === null) defects.push(`${label}: missing, empty or invalid image`);
  else if (
    actual.bytes !== expected.byteSize ||
    actual.sha256 !== expected.sha256 ||
    actual.mime !== expected.contentType
  )
    defects.push(
      `${label}: expected ${expected.byteSize}/${expected.contentType}/${expected.sha256}, got ${actual.bytes}/${actual.mime}/${actual.sha256}`,
    );
}

export async function reconcileClientLogos(
  db: ClientBase,
  options: ClientLogoReconciliationOptions,
): Promise<ClientLogoReconciliation> {
  const defects: string[] = [];
  const source = await db.query<SourceRow>(`
    SELECT s.parent_key,s.file_name,s.file_type,s.byte_size,s.stored_path,
           s.src_record_key source_record_key,
           s.src_extraction_sha256 extraction_sha256,
           min(c.id)::int client_id,count(c.id)::int client_matches
      FROM staging."العملاء__logo" s
      LEFT JOIN clients c ON c.legacy_id=s.parent_key::integer
     GROUP BY s.parent_key,s.file_name,s.file_type,s.byte_size,s.stored_path,
              s.src_record_key,s.src_extraction_sha256
     ORDER BY s.parent_key::integer,s.src_record_key`);
  const audit = await db.query<AuditRow>(`
    SELECT source_parent_key,client_id,client_logo_id,source_record_key,
           source_extraction_sha256,source_stored_path,source_file_name,
           detected_content_type,byte_size,sha256,destination_relative_path,
           complex_csv_sha256
      FROM migration_client_logo_import
     ORDER BY source_parent_key,source_record_key`);
  const current = await db.query<CurrentRow>(`
    SELECT l.id,l.client_id,l.relative_path,l.file_name,l.content_type,l.byte_size,l.sha256,
           l.created_at,l.updated_at,l.updated_by,a.actor_key updated_by_actor_key
      FROM client_logos l
      LEFT JOIN audit_actors a ON a.id=l.updated_by
     ORDER BY l.client_id,l.id`);
  const auditByParent = new Map(audit.rows.map((row) => [row.source_parent_key, row]));
  if (auditByParent.size !== audit.rows.length)
    defects.push('duplicate client-logo audit parent key');
  const sourceCanonical: unknown[][] = [];
  const resultCanonical: unknown[][] = [];
  const allowedRuntime = new Set<string>();
  let totalBytes = 0;
  for (const row of source.rows) {
    if (!/^[1-9][0-9]*$/u.test(row.parent_key)) {
      defects.push(`invalid source parent key: ${row.parent_key}`);
      continue;
    }
    const parentKey = Number(row.parent_key);
    if (row.client_matches !== 1 || row.client_id === null)
      defects.push(`${parentKey}: client mapping has ${row.client_matches} matches`);
    const evidence =
      options.sourceRoot === undefined
        ? null
        : await fileEvidence(resolve(options.sourceRoot, sourceLeaf(row.stored_path)));
    const auditRow = auditByParent.get(parentKey);
    if (auditRow === undefined) {
      defects.push(`${parentKey}: missing immutable import audit row`);
      continue;
    }
    const actualSource = evidence ?? {
      bytes: auditRow.byte_size,
      sha256: auditRow.sha256,
      mime: auditRow.detected_content_type,
    };
    if (options.sourceRoot !== undefined)
      sameEvidence(
        `${parentKey} source`,
        {
          byteSize: Number(row.byte_size),
          sha256: auditRow.sha256,
          contentType: auditRow.detected_content_type,
        },
        evidence,
        defects,
      );
    sourceCanonical.push([
      row.parent_key,
      row.file_name,
      row.file_type,
      row.byte_size,
      row.stored_path,
      row.source_record_key,
      row.extraction_sha256,
      actualSource.mime,
      actualSource.bytes,
      actualSource.sha256,
    ]);
    const expectedRelative = `${row.client_id}/${row.file_name}`;
    const expectedAudit = [
      parentKey,
      row.client_id,
      row.source_record_key,
      row.extraction_sha256,
      row.stored_path,
      row.file_name,
      actualSource.mime,
      actualSource.bytes,
      actualSource.sha256,
      expectedRelative,
      options.complexCsvSha256 ?? CLIENT_LOGO_SOURCE_BASELINE.complexCsvSha256,
    ];
    const actualAudit = [
      auditRow.source_parent_key,
      auditRow.client_id,
      auditRow.source_record_key,
      auditRow.source_extraction_sha256,
      auditRow.source_stored_path,
      auditRow.source_file_name,
      auditRow.detected_content_type,
      auditRow.byte_size,
      auditRow.sha256,
      auditRow.destination_relative_path,
      auditRow.complex_csv_sha256,
    ];
    if (JSON.stringify(actualAudit) !== JSON.stringify(expectedAudit))
      defects.push(`${parentKey}: immutable import audit differs from staging/source`);
    resultCanonical.push(actualAudit.slice(0, 10));
    totalBytes += auditRow.byte_size;
    allowedRuntime.add(auditRow.destination_relative_path.toLocaleLowerCase('en-US'));
    sameEvidence(
      `${parentKey} imported destination`,
      {
        byteSize: auditRow.byte_size,
        sha256: auditRow.sha256,
        contentType: auditRow.detected_content_type,
      },
      await (async () => {
        const path = runtimePath(options.logoRoot, auditRow.destination_relative_path);
        return path === null ? null : fileEvidence(path);
      })(),
      defects,
    );
    const currentForClient = current.rows.find((item) => item.client_id === auditRow.client_id);
    if (currentForClient === undefined) {
      defects.push(`${parentKey}: current client_logo is missing for the imported client`);
    } else if (
      options.requireCurrentImportRows ||
      currentForClient.updated_by_actor_key === 'system_migration'
    ) {
      if (
        currentForClient.id !== auditRow.client_logo_id ||
        currentForClient.relative_path !== auditRow.destination_relative_path ||
        currentForClient.file_name !== auditRow.source_file_name ||
        currentForClient.content_type !== auditRow.detected_content_type ||
        currentForClient.byte_size !== auditRow.byte_size ||
        currentForClient.sha256 !== auditRow.sha256
      )
        defects.push(`${parentKey}: current client_logo differs from the original import`);
    } else if (currentForClient.updated_by_actor_key === null) {
      defects.push(
        `${parentKey}: unattributed current client_logo cannot replace the original import`,
      );
    }
  }
  if (source.rows.length !== audit.rows.length)
    defects.push(`source/audit count differs: ${source.rows.length}/${audit.rows.length}`);
  for (const row of current.rows) {
    allowedRuntime.add(row.relative_path.toLocaleLowerCase('en-US'));
    sameEvidence(
      `current client_logo ${row.id}`,
      { byteSize: row.byte_size, sha256: row.sha256, contentType: row.content_type },
      await (async () => {
        const path = runtimePath(options.logoRoot, row.relative_path);
        return path === null ? null : fileEvidence(path);
      })(),
      defects,
    );
  }
  const runtimeFiles = await recursiveRelativeFiles(options.logoRoot);
  for (const relative of runtimeFiles)
    if (!allowedRuntime.has(relative.toLocaleLowerCase('en-US')))
      defects.push(`unexpected runtime file: ${relative}`);
  const sourceDigest = hash(JSON.stringify(sourceCanonical));
  const resultDigest = hash(JSON.stringify(resultCanonical));
  const distinctClients = new Set(audit.rows.map((row) => row.client_id)).size;
  if (options.enforceApprovedBaseline !== false) {
    if (source.rows.length !== CLIENT_LOGO_SOURCE_BASELINE.rows)
      defects.push(`source rows are ${source.rows.length}`);
    if (audit.rows.length !== CLIENT_LOGO_RESULT_BASELINE.auditRows)
      defects.push(`audit rows are ${audit.rows.length}`);
    if (distinctClients !== CLIENT_LOGO_RESULT_BASELINE.distinctClients)
      defects.push(`audit resolves to ${distinctClients} clients`);
    if (totalBytes !== CLIENT_LOGO_RESULT_BASELINE.totalBytes)
      defects.push(`audit byte total is ${totalBytes}`);
    if (sourceDigest !== CLIENT_LOGO_SOURCE_BASELINE.digest)
      defects.push(`source digest is ${sourceDigest}`);
    if (resultDigest !== CLIENT_LOGO_RESULT_BASELINE.digest)
      defects.push(`result digest is ${resultDigest}`);
  }
  const expectedCurrentRows =
    options.enforceApprovedBaseline === false
      ? audit.rows.length
      : CLIENT_LOGO_RESULT_BASELINE.auditRows;
  if (options.requireCurrentImportRows && current.rows.length !== expectedCurrentRows)
    defects.push(`current client_logo rows are ${current.rows.length}`);
  return {
    defects,
    sourceRows: source.rows.length,
    auditRows: audit.rows.length,
    currentRows: current.rows.length,
    distinctClients,
    totalBytes,
    sourceDigest,
    resultDigest,
  };
}
