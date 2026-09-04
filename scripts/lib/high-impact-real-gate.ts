import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { ClientBase } from 'pg';
import { migrationDatabaseTarget, migrationDatabaseUrlOptions } from './migration-principal';
import {
  APPROVED_APPLICATION_BYTES,
  APPROVED_APPLICATION_SHA256,
  assertApprovedApplicationBytes,
} from './high-impact-application-contract';
import { APPROVED_PLAN_SHA256, applicationInventory } from './high-impact-application-state';
import { applicationDigest } from './high-impact-application-plan';
import { HIGH_IMPACT_MIGRATION } from './high-impact-application-structure';
import {
  readGate4RepositoryMigrationInventory,
  reconcileGate4Migrations,
  type Gate4MigrationHistoryRow,
} from './gate4-migrations';

export type RealApplicationOptions = { expectedRevision: string; confirmation: string };
export const REAL_PROTECTED_SHA256 =
  '323f2bf1bae96d02af78b51eb7c14d8d54e8d8997eee171e15216e62896706b9';
// Pinned after the corrected migration's disposable verification, not a dynamic acceptance of arbitrary SQL.
export const REAL_MIGRATION_SHA256 =
  '7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5';
export function realApplicationConfirmation(revision: string): string {
  return `APPLY-TASK-3.5B-TO-litigation-WORKBOOK-${APPROVED_APPLICATION_BYTES}-${APPROVED_APPLICATION_SHA256}-PLAN-${APPROVED_PLAN_SHA256}-REVISION-${revision}`;
}

export function assertRealApplicationRequest(
  options: RealApplicationOptions,
  rawUrl: string | undefined,
): void {
  assert.match(
    options.expectedRevision,
    /^[0-9a-f]{40}$/,
    'expected reviewed Git revision required',
  );
  assert.equal(
    options.confirmation,
    realApplicationConfirmation(options.expectedRevision),
    'exact real-application confirmation required',
  );
  const target = migrationDatabaseTarget(rawUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname), 'unapproved real target host');
  assert.equal(target.port, 5433, 'unapproved real target port');
  assert.equal(target.database, 'litigation', 'unapproved real target database');
  const urlOptions = migrationDatabaseUrlOptions(rawUrl);
  assert.ok(
    urlOptions.search === '' || urlOptions.search === '?schema=public',
    'real target URL options are not approved',
  );
  assert.equal(urlOptions.hash, '', 'real target URL fragment is not approved');
}

export type RealPreconditions = {
  branch: string;
  head: string;
  remote: string;
  clean: boolean;
  gitIdle: boolean;
  remoteHead: string;
  database: string;
  cluster: string;
  containerCluster: string;
  principal: string;
  sessionPrincipal: string;
  superuser: boolean;
  runtimeSessions: number;
  migrationCount: number;
  migrationSha256: string;
  migrationDefects: string[];
  migrationProfile: string | null;
  pendingMigrations: number;
  priorRows: number;
  protectedSha256: string;
  baselineSha256: string;
  eventCount: number;
  workbookSha256: string;
  workbookBytes: number;
  planSha256: string;
  unresolved: number;
  invariantCount: number;
};

/** Pure and exhaustively rejection-tested. No caller-supplied boolean can skip a check. */
export function assertRealPreconditions(p: RealPreconditions, revision: string): void {
  const expected: Omit<RealPreconditions, 'cluster' | 'containerCluster'> = {
    branch: 'main',
    head: revision,
    remote: revision,
    remoteHead: revision,
    clean: true,
    gitIdle: true,
    database: 'litigation',
    principal: 'litigation',
    sessionPrincipal: 'litigation',
    superuser: true,
    runtimeSessions: 0,
    migrationCount: 60,
    migrationSha256: REAL_MIGRATION_SHA256,
    migrationDefects: [],
    migrationProfile: 'historical-live',
    pendingMigrations: 0,
    priorRows: 0,
    protectedSha256: REAL_PROTECTED_SHA256,
    baselineSha256: 'cb5507511715e332e28a7b749eac417c709ef84295b40112d8cea721e0a5167d',
    eventCount: 16,
    workbookSha256: APPROVED_APPLICATION_SHA256,
    workbookBytes: APPROVED_APPLICATION_BYTES,
    planSha256: APPROVED_PLAN_SHA256,
    unresolved: 0,
    invariantCount: 92,
  };
  for (const key of Object.keys(expected) as (keyof typeof expected)[])
    assert.deepEqual(p[key], expected[key], `real application refused: ${key}`);
  assert.match(p.cluster, /^[0-9]+$/, 'unknown target cluster');
  assert.equal(p.cluster, p.containerCluster, 'target differs from the approved Compose database');
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function readRealGitState(): Pick<
  RealPreconditions,
  'branch' | 'head' | 'remote' | 'remoteHead' | 'clean' | 'gitIdle'
> {
  const operations = [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'BISECT_LOG',
    'rebase-merge',
    'rebase-apply',
    'sequencer',
    'index.lock',
    'HEAD.lock',
  ];
  return {
    branch: git(['branch', '--show-current']),
    head: git(['rev-parse', 'HEAD']),
    remote: git(['rev-parse', 'origin/main']),
    remoteHead: git(['ls-remote', '--exit-code', 'origin', 'refs/heads/main']).split(/\s+/)[0]!,
    clean: git(['status', '--porcelain=v1', '--untracked-files=all']) === '',
    gitIdle: operations.every((p) => !existsSync(git(['rev-parse', '--git-path', p]))),
  };
}

/** Called only by the distinct real mode. This does not deploy migration 60. */
export async function collectRealPreconditions(
  db: ClientBase,
  bytes: Buffer,
  path: string,
  planSha256: string,
  invariantCount: number,
): Promise<RealPreconditions> {
  assertApprovedApplicationBytes(path, bytes);
  const identity = (
    await db.query<{
      database: string;
      cluster: string;
      principal: string;
      sessionPrincipal: string;
      superuser: boolean;
      runtimeSessions: number;
    }>(`
    SELECT current_database() database,(SELECT system_identifier::text FROM pg_control_system()) cluster,
      current_user principal,session_user "sessionPrincipal",(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) superuser,
      (SELECT count(*)::integer FROM pg_stat_activity WHERE usename='litigation_runtime') "runtimeSessions"`)
  ).rows[0]!;
  const containerCluster = execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'litigation',
      '-d',
      'litigation',
      '-tAc',
      'SELECT system_identifier FROM pg_control_system()',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
  const migrations = (
    await db.query<Gate4MigrationHistoryRow>(`
    SELECT migration_name "migrationName",checksum,finished_at::text "finishedAt",rolled_back_at::text "rolledBackAt",applied_steps_count "appliedStepsCount"
    FROM _prisma_migrations ORDER BY migration_name,started_at,id`)
  ).rows;
  const provenance = reconcileGate4Migrations(
    migrations,
    await readGate4RepositoryMigrationInventory(),
  );
  const sqlHash = createHash('sha256')
    .update(readFileSync(`prisma/migrations/${HIGH_IMPACT_MIGRATION}/migration.sql`))
    .digest('hex');
  assert.equal(sqlHash, REAL_MIGRATION_SHA256, 'unreviewed migration bytes');
  const protectedRows = (await applicationInventory(db)).filter(
    (r) =>
      !(r.schema === 'public' && ['audit_events', '_prisma_migrations'].includes(r.table)) &&
      !(r.schema === '_migration' && r.table === 'client_branch_compatibility'),
  );
  const counts = (
    await db.query<{ priorRows: number; eventCount: number; baselineSha256: string }>(`
    SELECT ((SELECT count(*) FROM _migration.high_impact_application)+(SELECT count(*) FROM _migration.high_impact_resolution)+(SELECT count(*) FROM _migration.high_impact_row_proof))::integer "priorRows",
    (SELECT count(*)::integer FROM audit_events) "eventCount",
    (SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(e)::text,E'\n' ORDER BY to_jsonb(e)::text COLLATE "C"),''),'UTF8')),'hex') FROM audit_events e WHERE action='audit_baseline_established') "baselineSha256"`)
  ).rows[0]!;
  return {
    ...readRealGitState(),
    ...identity,
    containerCluster,
    ...counts,
    migrationCount: provenance.totalApplied,
    migrationSha256:
      migrations.find(
        (r) => r.migrationName === HIGH_IMPACT_MIGRATION && r.finishedAt && !r.rolledBackAt,
      )?.checksum ?? '',
    migrationDefects: [...provenance.defects],
    migrationProfile: provenance.acceptedDatabaseProfile,
    pendingMigrations: provenance.pendingRepositoryMigrations.length,
    protectedSha256: applicationDigest(protectedRows),
    workbookSha256: createHash('sha256').update(bytes).digest('hex'),
    workbookBytes: bytes.length,
    planSha256,
    unresolved: planSha256 === APPROVED_PLAN_SHA256 ? 0 : 1,
    invariantCount,
  };
}

export function checkRealInvariantsReadOnly(databaseUrl: string | undefined): number {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/check-db.ts'],
    {
      env: {
        ...process.env,
        ...(databaseUrl ? { MIGRATION_DATABASE_URL: databaseUrl } : {}),
        PGOPTIONS: '-c default_transaction_read_only=on',
      },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  assert.equal(result.status, 0, 'real pre-application invariants refused');
  assert.match(
    result.stdout,
    /All 92 checks passed\./,
    'unexpected real pre-application invariant set',
  );
  return 92;
}
