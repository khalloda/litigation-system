import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { Client } from 'pg';
import {
  assertNoCaseInsensitiveLogoPathCollisions,
  assertSafeLogoFileName,
} from './lib/client-logo-image';
import { buildClientLogoPlan, type ClientLogoSourcePaths } from './lib/client-logo-plan';
import { reconcileClientLogos } from './lib/client-logo-reconciliation';
import { clientLogoStructureFailures } from './lib/client-logo-structure';
import { assertPublishedClientLogoPlan, runClientLogoTransform } from './transform-client-logos';

const FP = 'F'.repeat(64);
const key = (number: number) => `${number.toString(16).padStart(64, '0')}:000001`;

type FixtureRow = Readonly<{
  parentKey: number;
  fileName: string;
  clientId: number;
  sourceRecordKey: string;
}>;

function identifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/u);
  return `"${value}"`;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function fixturePng(red: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, red, 32, 64]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function csvLine(values: readonly string[]): string {
  return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',');
}

function migrate(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

async function writeSource(
  fixtureRoot: string,
  rows: readonly FixtureRow[],
): Promise<ClientLogoSourcePaths> {
  const sourceRoot = join(fixtureRoot, 'source');
  const complexCsv = join(fixtureRoot, 'complex.csv');
  const manifest = join(fixtureRoot, 'manifest.csv');
  const summary = join(fixtureRoot, 'summary.json');
  await rm(sourceRoot, { recursive: true, force: true });
  await mkdir(sourceRoot, { recursive: true });
  const csvRows = [csvLine(['parent_key', 'file_name', 'file_type', 'byte_size', 'stored_path'])];
  for (const [index, row] of rows.entries()) {
    const bytes = fixturePng(80 + index);
    const stored = `العملاء__logo\\${row.parentKey}__${row.fileName}`;
    await writeFile(join(sourceRoot, `${row.parentKey}__${row.fileName}`), bytes);
    csvRows.push(
      csvLine([String(row.parentKey), row.fileName, 'png', String(bytes.length), stored]),
    );
  }
  const csvBuffer = Buffer.from(`${csvRows.join('\r\n')}\r\n`, 'utf8');
  await writeFile(complexCsv, csvBuffer);
  await writeFile(
    manifest,
    `${csvLine([
      'object_type',
      'name',
      'output_file',
      'row_count',
      'csv_rows_verified',
      'csv_columns_verified',
      'plain_columns',
      'complex_columns',
      'attachments',
      'mvf_values',
      'mvf_parents',
      'sha256',
      'bytes',
      'source_modified_utc',
    ])}\r\n${csvLine([
      'complex',
      'العملاء.logo',
      'complex/العملاء__logo__attachments.csv',
      String(rows.length),
      '',
      '',
      '0',
      '0',
      String(rows.length),
      '0',
      '0',
      sha256(csvBuffer).toUpperCase(),
      String(csvBuffer.length),
      '',
    ])}\r\n`,
    'utf8',
  );
  await writeFile(summary, JSON.stringify({ source_sha256: FP }), 'utf8');
  return { sourceRoot, complexCsv, manifest, summary };
}

async function syncManifestToComplexCsv(paths: ClientLogoSourcePaths): Promise<void> {
  const csv = await readFile(paths.complexCsv);
  const manifest = await readFile(paths.manifest, 'utf8');
  await writeFile(
    paths.manifest,
    manifest
      .replace(/[0-9A-F]{64}(?=","[0-9]+",)/u, sha256(csv).toUpperCase())
      .replace(/,"[0-9]+",""\r?\n$/u, `,"${csv.length}",""\r\n`),
  );
}

async function seedFixture(db: Client, paths: ClientLogoSourcePaths): Promise<FixtureRow[]> {
  const clients: FixtureRow[] = [];
  for (const parentKey of [1, 2]) {
    const client = await db.query<{ id: number }>(
      `INSERT INTO clients(legacy_id,name_ar,updated_at)
       VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING id`,
      [parentKey, `fixture client ${parentKey}`],
    );
    clients.push({
      parentKey,
      fileName: parentKey === 1 ? 'Alpha.png' : 'beta logo.png',
      clientId: client.rows[0]!.id,
      sourceRecordKey: key(parentKey),
    });
  }
  await writeSource(dirname(paths.sourceRoot), clients);
  for (const [index, row] of clients.entries()) {
    const bytes = fixturePng(80 + index);
    await db.query(
      `INSERT INTO staging."العملاء__logo"(
         src_file,src_row_num,parent_key,file_name,file_type,byte_size,stored_path,
         src_record_key,src_extraction_sha256)
       VALUES('fixture/complex.csv',$1,$2,$3,'png',$4,$5,$6,$7)`,
      [
        index + 1,
        String(row.parentKey),
        row.fileName,
        String(bytes.length),
        `العملاء__logo\\${row.parentKey}__${row.fileName}`,
        row.sourceRecordKey,
        FP,
      ],
    );
  }
  return clients;
}

async function expectFailure(label: string, operation: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(operation, pattern);
  console.log(`  ok    ${label}`);
}

async function structureFailure(
  db: Client,
  label: string,
  mutation: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await mutation();
    assert.match((await clientLogoStructureFailures(db)).join('\n'), pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  assert.deepEqual(await clientLogoStructureFailures(db), []);
  console.log(`  ok    ${label}`);
}

async function reconciliationFailure(
  db: Client,
  label: string,
  paths: ClientLogoSourcePaths,
  logoRoot: string,
  complexCsvSha256: string,
  mutation: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await mutation();
    const result = await reconcileClientLogos(db, {
      logoRoot,
      sourceRoot: paths.sourceRoot,
      requireCurrentImportRows: true,
      enforceApprovedBaseline: false,
      complexCsvSha256,
    });
    assert.match(result.defects.join('\n'), pattern);
  } finally {
    await db.query('ROLLBACK');
  }
  console.log(`  ok    ${label}`);
}

async function fileSnapshot(root: string): Promise<string> {
  const rows: unknown[] = [];
  async function visit(path: string, relative: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child, rel);
      else {
        const item = await stat(child);
        rows.push([rel, item.size, item.mtimeMs, sha256(await readFile(child))]);
      }
    }
  }
  await visit(root, '');
  return JSON.stringify(rows);
}

async function main(): Promise<void> {
  const projectUrl = process.env['DATABASE_URL'];
  assert.ok(projectUrl, 'DATABASE_URL is required');
  const projectTarget = new URL(projectUrl);
  assert.equal(projectTarget.hostname, 'localhost');
  assert.equal(projectTarget.port, '5433');
  assert.equal(projectTarget.pathname, '/litigation');
  const databaseName = `client_logo_fixture_${process.pid}_${Date.now()}`;
  const adminUrl = new URL(projectUrl);
  adminUrl.pathname = '/postgres';
  const fixtureUrl = new URL(projectUrl);
  fixtureUrl.pathname = `/${databaseName}`;
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'litigation-task211-'));
  const logoRoot = join(fixtureRoot, 'runtime');
  const paths: ClientLogoSourcePaths = {
    sourceRoot: join(fixtureRoot, 'source'),
    complexCsv: join(fixtureRoot, 'complex.csv'),
    manifest: join(fixtureRoot, 'manifest.csv'),
    summary: join(fixtureRoot, 'summary.json'),
  };
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${identifier(databaseName)}`);
    created = true;
    migrate(fixtureUrl.toString());
    const db = new Client({ connectionString: fixtureUrl.toString() });
    await db.connect();
    try {
      const rows = await seedFixture(db, paths);
      assert.deepEqual(await clientLogoStructureFailures(db), []);
      console.log('  ok    clean PostgreSQL 17.11 Task 2.11 structure is exact');

      const originalPlan = await buildClientLogoPlan(db, paths, false);
      assert.equal(originalPlan.rows.length, 2);
      const originalDigest = originalPlan.sourceDigest;
      const originalCsv = await readFile(paths.complexCsv, 'utf8');
      const lines = originalCsv.trimEnd().split(/\r?\n/u);
      await writeFile(paths.complexCsv, `${lines[0]}\r\n${lines[2]}\r\n${lines[1]}\r\n`);
      await syncManifestToComplexCsv(paths);
      assert.equal((await buildClientLogoPlan(db, paths, false)).sourceDigest, originalDigest);
      console.log('  ok    reordered CSV rows retain durable source and result identities');
      await writeSource(fixtureRoot, rows);

      await rm(join(paths.sourceRoot, `1__${rows[0]!.fileName}`));
      await expectFailure(
        'missing source file is rejected',
        () => buildClientLogoPlan(db, paths, false),
        /directory and complex CSV counts differ/,
      );
      await writeSource(fixtureRoot, rows);

      await writeFile(join(paths.sourceRoot, 'unexpected.png'), fixturePng(9));
      await expectFailure(
        'unexpected additional source file is rejected',
        () => buildClientLogoPlan(db, paths, false),
        /directory and complex CSV counts differ/,
      );
      await writeSource(fixtureRoot, rows);

      const manifest = await readFile(paths.manifest, 'utf8');
      await writeFile(paths.manifest, `${manifest}${manifest.split(/\r?\n/u)[1]}\r\n`);
      await expectFailure(
        'duplicate manifest entry is rejected',
        () => buildClientLogoPlan(db, paths, false),
        /exactly one العملاء\.logo/,
      );
      await writeSource(fixtureRoot, rows);

      const duplicateCsv = (await readFile(paths.complexCsv, 'utf8')).replace(
        /^"2","beta logo\.png"/mu,
        '"1","beta logo.png"',
      );
      await writeFile(paths.complexCsv, duplicateCsv);
      await syncManifestToComplexCsv(paths);
      await expectFailure(
        'duplicate parent key is rejected',
        () => buildClientLogoPlan(db, paths, false),
        /duplicate parent key|unexpected stored_path/,
      );
      await writeSource(fixtureRoot, rows);

      await db.query('BEGIN');
      try {
        await db.query('UPDATE clients SET legacy_id=NULL WHERE legacy_id=1');
        await expectFailure(
          'missing client mapping is rejected',
          () => buildClientLogoPlan(db, paths, false),
          /mapping is missing or ambiguous/,
        );
      } finally {
        await db.query('ROLLBACK');
      }

      await db.query('BEGIN');
      try {
        await db.query('DROP INDEX clients_legacy_id_key');
        await db.query(
          `INSERT INTO clients(legacy_id,name_ar,updated_at) VALUES(1,'duplicate',CURRENT_TIMESTAMP)`,
        );
        await expectFailure(
          'ambiguous client mapping is rejected',
          () => buildClientLogoPlan(db, paths, false),
          /mapping is missing or ambiguous/,
        );
      } finally {
        await db.query('ROLLBACK');
      }

      await writeFile(join(paths.sourceRoot, `1__${rows[0]!.fileName}`), Buffer.alloc(0));
      await expectFailure(
        'zero-byte source is rejected',
        () => buildClientLogoPlan(db, paths, false),
        /zero-byte source/,
      );
      await writeSource(fixtureRoot, rows);

      await writeFile(
        join(paths.sourceRoot, `1__${rows[0]!.fileName}`),
        Buffer.from('not an image'),
      );
      await expectFailure(
        'unsupported content is rejected',
        () => buildClientLogoPlan(db, paths, false),
        /unsupported, corrupt or truncated/,
      );
      await writeSource(fixtureRoot, rows);

      const truncated = fixturePng(81).subarray(0, -8);
      await writeFile(join(paths.sourceRoot, `1__${rows[0]!.fileName}`), truncated);
      await expectFailure(
        'truncated image is rejected',
        () => buildClientLogoPlan(db, paths, false),
        /unsupported, corrupt or truncated/,
      );
      await writeSource(fixtureRoot, rows);

      await rename(
        join(paths.sourceRoot, `1__${rows[0]!.fileName}`),
        join(paths.sourceRoot, '1__Alpha.jpg'),
      );
      const mismatchCsv = (await readFile(paths.complexCsv, 'utf8')).replaceAll(
        'Alpha.png',
        'Alpha.jpg',
      );
      await writeFile(paths.complexCsv, mismatchCsv);
      await syncManifestToComplexCsv(paths);
      await expectFailure(
        'signature/extension disagreement is rejected',
        () => buildClientLogoPlan(db, paths, false),
        /signature\/extension mismatch/,
      );
      await writeSource(fixtureRoot, rows);

      await writeFile(
        paths.complexCsv,
        (await readFile(paths.complexCsv, 'utf8')).replace(
          /,"[0-9]+","العملاء__logo\\1__/u,
          ',"999","العملاء__logo\\1__',
        ),
      );
      await syncManifestToComplexCsv(paths);
      await expectFailure(
        'declared byte-size mismatch is rejected',
        () => buildClientLogoPlan(db, paths, false),
        /999 !== 69|byte_size/,
      );
      await writeSource(fixtureRoot, rows);

      await expectFailure(
        'unsafe path traversal is rejected',
        async () => assertSafeLogoFileName('../escape.png'),
        /unsafe logo filename/,
      );
      await expectFailure(
        'case-insensitive destination collision is rejected',
        async () => assertNoCaseInsensitiveLogoPathCollisions(['9/Logo.png', '9/logo.png']),
        /case-insensitive logo path collision/,
      );

      await mkdir(logoRoot, { recursive: true });
      await writeFile(join(logoRoot, 'conflict.txt'), Buffer.from('conflict'));
      await expectFailure(
        'conflicting or partial destination is refused',
        () =>
          runClientLogoTransform({
            databaseUrl: fixtureUrl.toString(),
            logoRoot,
            sourcePaths: paths,
            apply: true,
            enforceApprovedBaselines: false,
          }),
        /partial or has extras/,
      );
      await rm(logoRoot, { recursive: true, force: true });

      await expectFailure(
        'pre-copy source checksum change is detected',
        () =>
          runClientLogoTransform({
            databaseUrl: fixtureUrl.toString(),
            logoRoot,
            sourcePaths: paths,
            apply: true,
            enforceApprovedBaselines: false,
            afterTransactionalPlan: async () => {
              await writeFile(join(paths.sourceRoot, `1__${rows[0]!.fileName}`), fixturePng(240));
            },
          }),
        /Expected values to be strictly deep-equal|sha256/,
      );
      await writeSource(fixtureRoot, rows);
      assert.equal((await db.query('SELECT count(*) FROM client_logos')).rows[0]!.count, '0');
      assert.equal((await readdir(fixtureRoot)).includes('runtime'), false);

      await expectFailure(
        'forced late database failure rolls back rows and removes only attempted files',
        () =>
          runClientLogoTransform({
            databaseUrl: fixtureUrl.toString(),
            logoRoot,
            sourcePaths: paths,
            apply: true,
            forceLateFailure: true,
            enforceApprovedBaselines: false,
          }),
        /forced late Task 2\.11 database failure/,
      );
      assert.equal((await db.query('SELECT count(*) FROM client_logos')).rows[0]!.count, '0');
      assert.equal(
        (await db.query('SELECT count(*) FROM migration_client_logo_import')).rows[0]!.count,
        '0',
      );
      assert.equal((await readdir(fixtureRoot)).includes('runtime'), false);

      const applied = await runClientLogoTransform({
        databaseUrl: fixtureUrl.toString(),
        logoRoot,
        sourcePaths: paths,
        apply: true,
        enforceApprovedBaselines: false,
      });
      assert.equal(applied.applied, true);
      assert.deepEqual(applied.reconciliation?.defects, []);
      console.log('  ok    transactional filesystem publication and database import reconcile');

      const databaseBefore = JSON.stringify(
        (
          await db.query(`SELECT 'logo' kind,to_jsonb(l) payload FROM client_logos l
                          UNION ALL SELECT 'audit',to_jsonb(a) FROM migration_client_logo_import a
                          ORDER BY 1,2`)
        ).rows,
      );
      const filesBefore = await fileSnapshot(logoRoot);
      const second = await runClientLogoTransform({
        databaseUrl: fixtureUrl.toString(),
        logoRoot,
        sourcePaths: paths,
        apply: true,
        enforceApprovedBaselines: false,
      });
      assert.equal(second.noOp, true);
      assert.equal(
        JSON.stringify(
          (
            await db.query(`SELECT 'logo' kind,to_jsonb(l) payload FROM client_logos l
                            UNION ALL SELECT 'audit',to_jsonb(a) FROM migration_client_logo_import a
                            ORDER BY 1,2`)
          ).rows,
        ),
        databaseBefore,
      );
      assert.equal(await fileSnapshot(logoRoot), filesBefore);
      console.log(
        '  ok    identical rerun preserves IDs, timestamps, files, associations and digests',
      );

      const first = applied.plan.rows[0]!;
      const firstPath = resolve(logoRoot, ...first.relativePath.split('/'));
      const originalBytes = await readFile(firstPath);
      await writeFile(firstPath, fixturePng(222));
      await expectFailure(
        'post-copy checksum change is detected',
        () => assertPublishedClientLogoPlan(logoRoot, applied.plan.rows),
        /deep-equal/,
      );
      await writeFile(firstPath, originalBytes);

      await reconciliationFailure(
        db,
        'incorrect client mapping is detected',
        paths,
        logoRoot,
        applied.plan.complexCsvSha256,
        async () => {
          await db.query(
            'ALTER TABLE migration_client_logo_import DISABLE TRIGGER migration_client_logo_import_no_change',
          );
          await db.query(
            'ALTER TABLE migration_client_logo_import DROP CONSTRAINT migration_client_logo_import_client_id_fkey',
          );
          await db.query(
            'ALTER TABLE migration_client_logo_import DROP CONSTRAINT migration_client_logo_import_client_id_key',
          );
          await db.query(
            'ALTER TABLE migration_client_logo_import DROP CONSTRAINT migration_client_logo_import_file_shape',
          );
          await db.query(
            'UPDATE migration_client_logo_import SET client_id=$1 WHERE source_parent_key=1',
            [rows[1]!.clientId],
          );
        },
        /audit differs/,
      );

      for (const [label, column, value] of [
        ['relative path', 'destination_relative_path', `${rows[0]!.clientId}/wrong.png`],
        ['filename', 'source_file_name', 'wrong.png'],
        ['MIME type', 'detected_content_type', 'image/jpeg'],
        ['byte size', 'byte_size', 999],
        ['checksum', 'sha256', 'a'.repeat(64)],
      ] as const) {
        await reconciliationFailure(
          db,
          `wrong database ${label} is detected`,
          paths,
          logoRoot,
          applied.plan.complexCsvSha256,
          async () => {
            await db.query(
              'ALTER TABLE migration_client_logo_import DISABLE TRIGGER migration_client_logo_import_no_change',
            );
            await db.query(
              'ALTER TABLE migration_client_logo_import DROP CONSTRAINT migration_client_logo_import_file_shape',
            );
            await db.query(
              `UPDATE migration_client_logo_import SET ${column}=$1 WHERE source_parent_key=1`,
              [value],
            );
          },
          /audit differs|imported destination/,
        );
      }

      await reconciliationFailure(
        db,
        'missing target metadata is detected',
        paths,
        logoRoot,
        applied.plan.complexCsvSha256,
        () => db.query('DELETE FROM client_logos WHERE client_id=$1', [first.clientId]),
        /current client_logo/,
      );

      await reconciliationFailure(
        db,
        'missing immutable audit row is detected',
        paths,
        logoRoot,
        applied.plan.complexCsvSha256,
        async () => {
          await db.query(
            'ALTER TABLE migration_client_logo_import DISABLE TRIGGER migration_client_logo_import_no_change',
          );
          await db.query('DELETE FROM migration_client_logo_import WHERE source_parent_key=1');
        },
        /missing immutable import audit row|source\/audit count differs/,
      );

      let extraTargetDirectory = '';
      await reconciliationFailure(
        db,
        'additional target metadata row is detected',
        paths,
        logoRoot,
        applied.plan.complexCsvSha256,
        async () => {
          const extra = await db.query<{ id: number }>(
            `INSERT INTO clients(legacy_id,name_ar,updated_at)
             VALUES(98,'extra target',CURRENT_TIMESTAMP) RETURNING id`,
          );
          const extraId = extra.rows[0]!.id;
          const bytes = fixturePng(188);
          extraTargetDirectory = join(logoRoot, String(extraId));
          await mkdir(extraTargetDirectory, { recursive: true });
          await writeFile(join(extraTargetDirectory, 'extra.png'), bytes);
          await db.query(
            `INSERT INTO client_logos(
               client_id,relative_path,file_name,content_type,byte_size,sha256,updated_at)
             VALUES($1,$2,'extra.png','image/png',$3,$4,CURRENT_TIMESTAMP)`,
            [extraId, `${extraId}/extra.png`, bytes.length, sha256(bytes)],
          );
        },
        /current client_logo rows/,
      );
      await rm(extraTargetDirectory, { recursive: true, force: true });

      await rm(firstPath);
      const missingFileResult = await reconcileClientLogos(db, {
        logoRoot,
        sourceRoot: paths.sourceRoot,
        requireCurrentImportRows: true,
        enforceApprovedBaseline: false,
        complexCsvSha256: applied.plan.complexCsvSha256,
      });
      assert.match(missingFileResult.defects.join('\n'), /imported destination/);
      await writeFile(firstPath, originalBytes);
      console.log('  ok    missing destination file is detected');

      await reconciliationFailure(
        db,
        'additional audit row is detected',
        paths,
        logoRoot,
        applied.plan.complexCsvSha256,
        async () => {
          const extra = await db.query<{ id: number }>(
            `INSERT INTO clients(legacy_id,name_ar,updated_at) VALUES(99,'extra',CURRENT_TIMESTAMP) RETURNING id`,
          );
          await db.query(
            `INSERT INTO migration_client_logo_import(source_parent_key,client_id,client_logo_id,source_record_key,source_extraction_sha256,source_stored_path,source_file_name,detected_content_type,byte_size,sha256,destination_relative_path,complex_csv_sha256)
          VALUES(99,$1,999,$2,$3,'العملاء__logo\\99__extra.png','extra.png','image/png',1,$4,$5,$6)`,
            [
              extra.rows[0]!.id,
              key(99),
              FP,
              'a'.repeat(64),
              `${extra.rows[0]!.id}/extra.png`,
              applied.plan.complexCsvSha256,
            ],
          );
        },
        /source\/audit count differs|result digest/,
      );

      await assert.rejects(
        db.query(`UPDATE migration_client_logo_import SET byte_size=1 WHERE source_parent_key=1`),
        /cannot be updated/,
      );
      await assert.rejects(
        db.query(`DELETE FROM migration_client_logo_import WHERE source_parent_key=1`),
        /DELETE\/TRUNCATE is refused/,
      );
      await assert.rejects(
        db.query('TRUNCATE migration_client_logo_import'),
        /DELETE\/TRUNCATE is refused/,
      );
      console.log('  ok    immutable audit refuses update, delete and truncate');

      const nativeClient = await db.query<{ id: number }>(
        `INSERT INTO clients(legacy_id,name_ar,updated_at) VALUES(100,'native logo client',CURRENT_TIMESTAMP) RETURNING id`,
      );
      const nativeId = nativeClient.rows[0]!.id;
      const nativeBytes = fixturePng(199);
      const nativeSha = sha256(nativeBytes);
      const nativeRelative = `${nativeId}/native.png`;
      await mkdir(join(logoRoot, String(nativeId)), { recursive: true });
      await writeFile(resolve(logoRoot, nativeRelative), nativeBytes);
      await db.query(
        `INSERT INTO client_logos(client_id,relative_path,file_name,content_type,byte_size,sha256,updated_at,updated_by) VALUES($1,$2,'native.png','image/png',$3,$4,CURRENT_TIMESTAMP,999)`,
        [nativeId, nativeRelative, nativeBytes.length, nativeSha],
      );
      const nativeResult = await reconcileClientLogos(db, {
        logoRoot,
        sourceRoot: paths.sourceRoot,
        enforceApprovedBaseline: false,
        complexCsvSha256: applied.plan.complexCsvSha256,
      });
      assert.deepEqual(nativeResult.defects, []);
      const replacementBytes = fixturePng(177);
      const replacementPath = join(logoRoot, String(first.clientId), 'replacement.png');
      await writeFile(replacementPath, replacementBytes);
      await db.query('BEGIN');
      try {
        await db.query(
          `UPDATE client_logos
              SET relative_path=$1,file_name='replacement.png',content_type='image/png',
                  byte_size=$2,sha256=$3,updated_at=CURRENT_TIMESTAMP,updated_by=999
            WHERE client_id=$4`,
          [
            `${first.clientId}/replacement.png`,
            replacementBytes.length,
            sha256(replacementBytes),
            first.clientId,
          ],
        );
        const replacementResult = await reconcileClientLogos(db, {
          logoRoot,
          sourceRoot: paths.sourceRoot,
          enforceApprovedBaseline: false,
          complexCsvSha256: applied.plan.complexCsvSha256,
        });
        assert.deepEqual(replacementResult.defects, []);
      } finally {
        await db.query('ROLLBACK');
      }
      await rm(replacementPath);
      await db.query('DELETE FROM client_logos WHERE client_id=$1', [nativeId]);
      await rm(join(logoRoot, String(nativeId)), { recursive: true });
      console.log(
        '  ok    future application-native logo insertion and replacement remain outside immutable import reconciliation',
      );

      await structureFailure(
        db,
        'weakened CHECK retaining its name is rejected',
        async () => {
          await db.query('ALTER TABLE client_logos DROP CONSTRAINT client_logos_byte_size_shape');
          await db.query(
            'ALTER TABLE client_logos ADD CONSTRAINT client_logos_byte_size_shape CHECK(byte_size>0 OR true)',
          );
        },
        /constraint definition: client_logos_byte_size_shape/,
      );
      await structureFailure(
        db,
        'non-unique expected index is rejected',
        async () => {
          await db.query(
            'ALTER TABLE migration_client_logo_import DROP CONSTRAINT migration_client_logo_import_source_record_key_key',
          );
          await db.query(
            'CREATE INDEX migration_client_logo_import_source_record_key_key ON migration_client_logo_import(source_record_key)',
          );
        },
        /constraint inventory|index definition/,
      );
      await structureFailure(
        db,
        'correctly named trigger pointing to permissive function is rejected',
        async () => {
          await db.query(
            `CREATE FUNCTION permissive_client_logo_import_change() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN OLD; END$$`,
          );
          await db.query(
            'DROP TRIGGER migration_client_logo_import_no_change ON migration_client_logo_import',
          );
          await db.query(
            `CREATE TRIGGER migration_client_logo_import_no_change BEFORE UPDATE OR DELETE ON migration_client_logo_import FOR EACH ROW EXECUTE FUNCTION permissive_client_logo_import_change()`,
          );
        },
        /trigger definition/,
      );
      await structureFailure(
        db,
        'permissive function retaining diagnostic wording is rejected',
        () =>
          db.query(`CREATE OR REPLACE FUNCTION refuse_client_logo_import_change() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN -- Task 2.11 client-logo import evidence DELETE/TRUNCATE is refused
        RETURN OLD; END$$`),
        /function definition/,
      );
      await structureFailure(
        db,
        'per-function search_path configuration is rejected',
        () => db.query('ALTER FUNCTION refuse_client_logo_import_change() SET search_path=public'),
        /function definition/,
      );
      await structureFailure(
        db,
        'wrong audit foreign-key action is rejected',
        async () => {
          await db.query(
            'ALTER TABLE migration_client_logo_import DROP CONSTRAINT migration_client_logo_import_client_id_fkey',
          );
          await db.query(
            'ALTER TABLE migration_client_logo_import ADD CONSTRAINT migration_client_logo_import_client_id_fkey FOREIGN KEY(client_id) REFERENCES clients(id) ON UPDATE CASCADE ON DELETE CASCADE',
          );
        },
        /constraint definition: migration_client_logo_import_client_id_fkey/,
      );
    } finally {
      await db.end();
    }
  } finally {
    if (created) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [
        databaseName,
      ]);
      await admin.query(`DROP DATABASE ${identifier(databaseName)}`);
    }
    await admin.end();
    await rm(fixtureRoot, { recursive: true, force: true });
  }
  console.log('Task 2.11 client-logo fixture passed. Disposable database and files removed.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
