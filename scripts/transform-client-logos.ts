import 'dotenv/config';
import assert from 'node:assert/strict';
import { constants as fsConstants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, rename, rm, rmdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client, type ClientBase } from 'pg';
import {
  CLIENT_LOGO_RESULT_BASELINE,
  CLIENT_LOGO_SOURCE_BASELINE,
} from './lib/client-logo-baseline';
import { inspectLogo } from './lib/client-logo-image';
import {
  buildClientLogoPlan,
  type ClientLogoPlan,
  type ClientLogoPlanRow,
  type ClientLogoSourcePaths,
} from './lib/client-logo-plan';
import { reconcileClientLogos } from './lib/client-logo-reconciliation';
import { clientLogoStructureFailures } from './lib/client-logo-structure';
import { task211ProtectedState } from './lib/task211-protected-state';

type Options = Readonly<{
  databaseUrl?: string;
  logoRoot?: string;
  sourcePaths?: ClientLogoSourcePaths;
  apply?: boolean;
  forceLateFailure?: boolean;
  enforceApprovedBaselines?: boolean;
  afterTransactionalPlan?: (plan: ClientLogoPlan) => Promise<void>;
}>;

type RunResult = Readonly<{
  plan: ClientLogoPlan;
  applied: boolean;
  noOp: boolean;
  reconciliation: Awaited<ReturnType<typeof reconcileClientLogos>> | null;
}>;

const DEFAULT_SOURCE_PATHS: ClientLogoSourcePaths = {
  sourceRoot: resolve('_migration', 'attachments', 'العملاء__logo'),
  complexCsv: resolve('_migration', 'complex', 'العملاء__logo__attachments.csv'),
  manifest: resolve('_migration', 'meta', 'manifest.csv'),
  summary: resolve('_migration', 'meta', 'summary.json'),
};

function assertLiveTarget(connectionString: string): void {
  const target = new URL(connectionString);
  assert.equal(target.protocol, 'postgresql:');
  assert.equal(target.hostname, 'localhost', 'Task 2.11 live host must be localhost');
  assert.equal(target.port, '5433', 'Task 2.11 live port must be 5433, never 5432');
  assert.equal(target.pathname, '/litigation', 'Task 2.11 live database must be litigation');
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function relativeFiles(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const output: string[] = [];
  async function visit(path: string, relative: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child, childRelative);
      else if (entry.isFile()) output.push(childRelative);
      else output.push(`${childRelative} [non-file]`);
    }
  }
  await visit(root, '');
  return output.sort((left, right) => left.localeCompare(right));
}

export async function assertPublishedClientLogoPlan(
  root: string,
  rows: readonly ClientLogoPlanRow[],
): Promise<void> {
  const expected = [...rows.map((row) => row.relativePath)].sort((left, right) =>
    left.localeCompare(right),
  );
  assert.deepEqual(
    await relativeFiles(root),
    expected,
    'runtime logo folder is partial or has extras',
  );
  for (const row of rows) {
    const path = resolve(root, ...row.relativePath.split('/'));
    const buffer = await import('node:fs/promises').then(({ readFile }) => readFile(path));
    const evidence = inspectLogo(buffer, row.fileName);
    assert.deepEqual(evidence, {
      contentType: row.contentType,
      byteSize: row.byteSize,
      sha256: row.sha256,
    });
  }
}

async function publishPlan(
  root: string,
  rows: readonly ClientLogoPlanRow[],
): Promise<{ createdRoot: boolean; restoreEmptyRoot: boolean }> {
  const parent = dirname(root);
  await mkdir(parent, { recursive: true });
  const before = await relativeFiles(root);
  if (before.length > 0) {
    await assertPublishedClientLogoPlan(root, rows);
    return { createdRoot: false, restoreEmptyRoot: false };
  }
  const rootExisted = await exists(root);
  const stagingRoot = await mkdtemp(join(parent, '.client-logos-task-'));
  try {
    for (const row of rows) {
      const source = await import('node:fs/promises').then(({ readFile }) =>
        readFile(row.sourcePath),
      );
      const sourceEvidence = inspectLogo(source, row.fileName, row.declaredType);
      assert.deepEqual(sourceEvidence, {
        contentType: row.contentType,
        byteSize: row.byteSize,
        sha256: row.sha256,
      });
      const destination = resolve(stagingRoot, ...row.relativePath.split('/'));
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(row.sourcePath, destination, fsConstants.COPYFILE_EXCL);
    }
    await assertPublishedClientLogoPlan(stagingRoot, rows);
    if (rootExisted) await rmdir(root);
    await rename(stagingRoot, root);
    await assertPublishedClientLogoPlan(root, rows);
    return { createdRoot: true, restoreEmptyRoot: rootExisted };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

async function cleanupPublishedRoot(
  root: string,
  rows: readonly ClientLogoPlanRow[],
  restoreEmptyRoot: boolean,
): Promise<void> {
  await assertPublishedClientLogoPlan(root, rows);
  await rm(root, { recursive: true, force: false });
  if (restoreEmptyRoot) await mkdir(root);
}

async function lockDomain(db: ClientBase): Promise<void> {
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended('task-2.11-client-logos',0))`);
  await db.query(`LOCK TABLE staging."العملاء__logo",clients IN SHARE MODE`);
  await db.query(
    `LOCK TABLE client_logos,migration_client_logo_import IN SHARE ROW EXCLUSIVE MODE`,
  );
}

async function insertCurrentRows(db: ClientBase, rows: readonly ClientLogoPlanRow[]) {
  const inserted = await db.query<{ id: number; client_id: number }>(
    `INSERT INTO client_logos(
       client_id,relative_path,file_name,content_type,byte_size,sha256,updated_at)
     SELECT x."clientId",x."relativePath",x."fileName",x."contentType",
            x."byteSize",x.sha256,CURRENT_TIMESTAMP
       FROM jsonb_to_recordset($1::jsonb) x(
         "sourceParentKey" integer,"clientId" integer,"relativePath" text,
         "fileName" text,"contentType" text,"byteSize" integer,sha256 text)
      ORDER BY x."sourceParentKey"
     RETURNING id,client_id`,
    [JSON.stringify(rows)],
  );
  assert.equal(inserted.rows.length, rows.length);
  return new Map(inserted.rows.map((row) => [row.client_id, row.id]));
}

async function insertAuditRows(
  db: ClientBase,
  rows: readonly ClientLogoPlanRow[],
  logoIds: ReadonlyMap<number, number>,
  complexCsvSha256: string,
): Promise<void> {
  const audit = rows.map((row) => ({
    ...row,
    clientLogoId: logoIds.get(row.clientId),
    complexCsvSha256,
  }));
  assert.ok(audit.every((row) => row.clientLogoId !== undefined));
  const inserted = await db.query(
    `INSERT INTO migration_client_logo_import(
       source_parent_key,client_id,client_logo_id,source_record_key,
       source_extraction_sha256,source_stored_path,source_file_name,
       detected_content_type,byte_size,sha256,destination_relative_path,
       complex_csv_sha256)
     SELECT x."sourceParentKey",x."clientId",x."clientLogoId",x."sourceRecordKey",
            x."extractionSha256",x."sourceStoredPath",x."fileName",
            x."contentType",x."byteSize",x.sha256,x."relativePath",
            x."complexCsvSha256"
       FROM jsonb_to_recordset($1::jsonb) x(
         "sourceParentKey" integer,"clientId" integer,"clientLogoId" integer,
         "sourceRecordKey" text,"extractionSha256" text,"sourceStoredPath" text,
         "fileName" text,"contentType" text,"byteSize" integer,sha256 text,
         "relativePath" text,"complexCsvSha256" text)`,
    [JSON.stringify(audit)],
  );
  assert.equal(inserted.rowCount, rows.length);
}

async function assertStructure(db: ClientBase): Promise<void> {
  const failures = await clientLogoStructureFailures(db);
  assert.deepEqual(
    failures,
    [],
    `Task 2.11 database safeguards differ from PostgreSQL 17.11:\n${failures.join('\n')}`,
  );
}

export async function runClientLogoTransform(options: Options = {}): Promise<RunResult> {
  const connectionString = options.databaseUrl ?? process.env['MIGRATION_DATABASE_URL'];
  assert.ok(connectionString, 'MIGRATION_DATABASE_URL is required');
  const logoRoot = options.logoRoot ?? process.env['CLIENT_LOGO_ROOT'];
  assert.ok(logoRoot, 'CLIENT_LOGO_ROOT is required');
  const paths = options.sourcePaths ?? DEFAULT_SOURCE_PATHS;
  const enforceLive = options.enforceApprovedBaselines ?? options.databaseUrl === undefined;
  if (enforceLive) assertLiveTarget(connectionString);
  const db = new Client({ connectionString });
  await db.connect();
  let published: { createdRoot: boolean; restoreEmptyRoot: boolean } | null = null;
  try {
    const protectedBefore = enforceLive ? await task211ProtectedState(db) : null;
    const preview = await buildClientLogoPlan(db, paths, enforceLive);
    if (enforceLive) assert.equal(preview.rows.length, 54);
    if (options.apply !== true) {
      const target = await db.query<{ logos: number }>(
        'SELECT count(*)::int logos FROM client_logos',
      );
      assert.equal(
        target.rows[0]?.logos,
        0,
        'dry run requires the approved empty client_logos target',
      );
      assert.equal(
        (await relativeFiles(logoRoot)).length,
        0,
        'dry run requires an absent or empty destination',
      );
      return { plan: preview, applied: false, noOp: false, reconciliation: null };
    }

    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      await lockDomain(db);
      await assertStructure(db);
      if (enforceLive) assert.equal(await task211ProtectedState(db), protectedBefore);
      const plan = await buildClientLogoPlan(db, paths, enforceLive);
      assert.deepEqual(plan, preview, 'source or mapping changed between dry plan and transaction');
      await options.afterTransactionalPlan?.(plan);
      const state = await db.query<{ logos: number; audit: number }>(`
        SELECT (SELECT count(*)::int FROM client_logos) logos,
               (SELECT count(*)::int FROM migration_client_logo_import) audit`);
      const counts = state.rows[0]!;
      if (counts.logos === plan.rows.length && counts.audit === plan.rows.length) {
        const reconciliation = await reconcileClientLogos(db, {
          logoRoot,
          sourceRoot: paths.sourceRoot,
          requireCurrentImportRows: true,
          enforceApprovedBaseline: enforceLive,
          complexCsvSha256: plan.complexCsvSha256,
        });
        assert.deepEqual(reconciliation.defects, [], reconciliation.defects.join('\n'));
        if (enforceLive) assert.equal(await task211ProtectedState(db), protectedBefore);
        await db.query('COMMIT');
        return { plan, applied: false, noOp: true, reconciliation };
      }
      assert.deepEqual(counts, { logos: 0, audit: 0 }, 'conflicting partial database state');
      published = await publishPlan(logoRoot, plan.rows);
      const logoIds = await insertCurrentRows(db, plan.rows);
      await insertAuditRows(db, plan.rows, logoIds, plan.complexCsvSha256);
      if (options.forceLateFailure) throw new Error('forced late Task 2.11 database failure');
      const finalPlan = await buildClientLogoPlan(db, paths, enforceLive);
      assert.deepEqual(finalPlan, plan, 'source changed before commit');
      const reconciliation = await reconcileClientLogos(db, {
        logoRoot,
        sourceRoot: paths.sourceRoot,
        requireCurrentImportRows: true,
        enforceApprovedBaseline: enforceLive,
        complexCsvSha256: plan.complexCsvSha256,
      });
      assert.deepEqual(reconciliation.defects, [], reconciliation.defects.join('\n'));
      if (enforceLive) {
        assert.equal(reconciliation.sourceDigest, CLIENT_LOGO_SOURCE_BASELINE.digest);
        assert.equal(reconciliation.resultDigest, CLIENT_LOGO_RESULT_BASELINE.digest);
      }
      await assertStructure(db);
      if (enforceLive) assert.equal(await task211ProtectedState(db), protectedBefore);
      await db.query('COMMIT');
      return { plan, applied: true, noOp: false, reconciliation };
    } catch (error) {
      await db.query('ROLLBACK');
      if (published?.createdRoot)
        await cleanupPublishedRoot(logoRoot, preview.rows, published.restoreEmptyRoot);
      throw error;
    }
  } finally {
    await db.end();
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const result = await runClientLogoTransform({ apply });
  console.log(
    apply
      ? result.noOp
        ? 'TASK 2.11 NO-OP — identical import already complete'
        : 'TASK 2.11 APPLIED'
      : 'TASK 2.11 DRY RUN — no filesystem or database writes',
  );
  console.log(
    `Logos: ${result.plan.rows.length}; ${result.plan.totalBytes} bytes; ` +
      `${JSON.stringify(result.plan.mimeCounts)}`,
  );
  for (const row of result.plan.rows)
    console.log(
      `${row.sourceParentKey} -> client ${row.clientId} -> ${row.relativePath} ` +
        `${row.contentType} ${row.byteSize} ${row.sha256}`,
    );
  console.log(`Source digest: ${result.plan.sourceDigest}`);
  console.log(`Result digest: ${result.plan.resultDigest}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
