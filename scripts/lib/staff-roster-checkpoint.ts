import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import {
  CLIENT_CONTACT_MIGRATION,
  clientContactBoundaryApplied,
} from './client-contact-checkpoint';
import {
  gate4MigrationIdentityDigest,
  readGate4RepositoryMigrationInventory,
  reconcileGate4Migrations,
  type Gate4MigrationHistoryRow,
} from './gate4-migrations';

export const STAFF_MIGRATION = '20260906180000_staff_roster_database_boundary';
export const STAFF_TABLES = [
  'staff_roster_alias',
  'staff_roster_boundary',
  'staff_roster_change',
  'staff_roster_mutex',
  'staff_roster_person',
  'staff_roster_team',
] as const;
export type StaffProfile = 'historical-full-state-upgrade' | 'canonical-clean-replay';
export const STAFF_FIELD_RULES = [
  ['people', 'row_version', 64, 'staff_database_version'],
  ['people', 'alias_epoch', 64, 'staff_database_alias_revision'],
  ['people', 'application_modified_at', 64, 'staff_application_modification_provenance'],
  ['people', 'application_modified_by', 64, 'staff_application_modification_provenance'],
  ['person_name_alias', 'is_retired', 64, 'staff_alias_lifecycle'],
  ['person_name_alias', 'retirement_reason', 2048, 'staff_alias_lifecycle_reason'],
  ['lookup_team', 'row_version', 64, 'staff_database_version'],
] as const;
export const STAFF_ROSTER_TABLES = ['people', 'person_name_alias', 'lookup_team'];
export const STAFF_RUNTIME_GATEWAYS = [
  'public.staff_create_person(p_name_ar text, p_name_en text, p_email text, p_is_trainee boolean, p_team_id smallint)',
  'public.staff_update_person(p_person_id integer, p_expected_version bigint, p_name_en text, p_email text, p_is_active boolean, p_is_trainee boolean, p_team_id smallint)',
  'public.staff_rename_person(p_person_id integer, p_expected_version bigint, p_name_ar text)',
  'public.staff_add_alias(p_person_id integer, p_expected_version bigint, p_alias_ar text)',
  'public.staff_set_alias_retired(p_person_id integer, p_expected_version bigint, p_alias_id integer, p_retired boolean, p_reason text)',
  'public.staff_set_team_reviewer(p_team_id smallint, p_expected_version bigint, p_reviewer_id integer)',
] as const;

export function staffMigrationSql(): string {
  return readFileSync(`prisma/migrations/${STAFF_MIGRATION}/migration.sql`, 'utf8');
}

/** Exact source inventory recorded independently before the migration draft.
 * Shared with the SQL precondition so profiles cannot classify a hybrid by count. */
export function historicalStaffSourceInventory(): {
  table: string;
  count: number;
  sha256: string;
}[] {
  const matches = [
    ...staffMigrationSql().matchAll(/IF inventory IS DISTINCT FROM '(\[[^']+\])'::jsonb/gu),
  ];
  assert.equal(matches.length, 1, 'Missing or ambiguous source inventory contract');
  const rows = JSON.parse(matches[0]![1]!) as { table: string; count: number; sha256: string }[];
  assert.equal(rows.length, 20);
  assert.equal(new Set(rows.map((row) => row.table)).size, 20);
  return rows;
}

export async function assertStaffSourceProfile(
  db: ClientBase,
  profile: StaffProfile,
): Promise<void> {
  const expected = historicalStaffSourceInventory();
  assert.deepEqual(
    (
      await db.query<{ name: string }>(
        `SELECT tablename::text name FROM pg_tables WHERE schemaname='staging' ORDER BY tablename COLLATE "C"`,
      )
    ).rows.map((row) => row.name),
    expected.map((row) => row.table),
  );
  for (const row of expected) {
    const table = '"' + row.table.replaceAll('"', '""') + '"';
    const actual = (
      await db.query(
        `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(s)::text,E'\\n' ORDER BY to_jsonb(s)::text COLLATE "C"),''),'UTF8')),'hex') sha256 FROM staging.${table} s`,
      )
    ).rows[0];
    assert.deepEqual(
      actual,
      profile === 'historical-full-state-upgrade'
        ? { count: row.count, sha256: row.sha256 }
        : { count: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
      'Source profile differs: ' + row.table,
    );
  }
  if (profile === 'historical-full-state-upgrade') {
    assert.equal(
      (await db.query('SELECT _migration.current_staging_fingerprint() fingerprint')).rows[0]
        ?.fingerprint,
      '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979',
    );
    assert.deepEqual(
      (
        await db.query(`SELECT
      (SELECT count(*)::integer FROM quarantine.review_value WHERE answered_at IS NOT NULL)+(SELECT count(*)::integer FROM quarantine.finding WHERE answered_at IS NOT NULL) answers,
      (SELECT count(*)::integer FROM _migration.high_impact_application) releases,
      (SELECT count(*)::integer FROM _migration.high_impact_resolution) resolutions`)
      ).rows,
      [{ answers: 744, releases: 1, resolutions: 382 }],
    );
  } else {
    for (const table of [
      'quarantine.review_value',
      'quarantine.finding',
      '_migration.high_impact_application',
      '_migration.high_impact_resolution',
      '_migration.high_impact_row_proof',
    ])
      assert.equal(
        (await db.query(`SELECT count(*)::integer n FROM ${table}`)).rows[0]?.n,
        0,
        'Unexpected non-Git artifact: ' + table,
      );
  }
}

/** Individual legacy structural tests also exercise earlier accepted migration
 * checkpoints. An absent 61 ledger is accepted only with zero 61 surfaces;
 * release commands additionally require the complete exact 60/61 ledger below. */
export async function staffBoundaryApplied(db: ClientBase): Promise<boolean> {
  const history = (
    await db.query<{
      checksum: string;
      finished_at: unknown;
      rolled_back_at: unknown;
      applied_steps_count: number;
    }>(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM _prisma_migrations WHERE migration_name=$1',
      [STAFF_MIGRATION],
    )
  ).rows;
  const surfaces = (
    await db.query<{ tables: string[]; functions: number; columns: number }>(`
    SELECT ARRAY(SELECT tablename::text FROM pg_tables WHERE schemaname='_migration' AND tablename LIKE 'staff_roster_%' ORDER BY tablename) tables,
      (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE (n.nspname='public' AND p.proname LIKE 'staff_%') OR (n.nspname='_migration' AND (p.proname LIKE 'staff_%' OR p.proname IN ('lock_staff_roster','refuse_staff_evidence_change')))) functions,
      (SELECT count(*)::integer FROM information_schema.columns WHERE table_schema='public'
        AND (table_name,column_name) IN (('people','row_version'),('people','alias_epoch'),('people','application_modified_at'),('people','application_modified_by'),('person_name_alias','is_retired'),('person_name_alias','retirement_reason'),('lookup_team','row_version'))) columns
  `)
  ).rows[0]!;
  if (history.length === 0) {
    assert.deepEqual(
      surfaces,
      { tables: [], functions: 0, columns: 0 },
      'partial Phase 1 surfaces without migration 61',
    );
    return false;
  }
  assert.equal(history.length, 1, 'duplicate migration 61');
  assert.ok(
    history[0]!.finished_at && !history[0]!.rolled_back_at && history[0]!.applied_steps_count === 1,
    'unfinished or rolled-back migration 61',
  );
  assert.equal(
    history[0]!.checksum,
    createHash('sha256')
      .update(readFileSync(`prisma/migrations/${STAFF_MIGRATION}/migration.sql`))
      .digest('hex'),
    'migration 61 bytes differ',
  );
  assert.deepEqual(
    surfaces.tables,
    [...STAFF_TABLES],
    'partial or unexpected Phase 1 table inventory',
  );
  assert.equal(surfaces.columns, 7, 'partial Phase 1 column inventory');
  assert.equal(
    surfaces.functions,
    [...staffMigrationSql().matchAll(/CREATE FUNCTION /gu)].length,
    'partial or extra Phase 1 function inventory',
  );
  return true;
}

export async function assertStaffCheckpoint(
  db: ClientBase,
  profile: StaffProfile,
): Promise<60 | 61 | 62> {
  assert.ok(
    ['historical-full-state-upgrade', 'canonical-clean-replay'].includes(profile),
    'explicit accepted profile required',
  );
  const applied = await staffBoundaryApplied(db);
  const clientsApplied = await clientContactBoundaryApplied(db);
  assert.ok(!clientsApplied || applied, 'Client boundary requires complete staff boundary');
  const history = (
    await db.query<Gate4MigrationHistoryRow>(
      `SELECT migration_name "migrationName",checksum,finished_at::text "finishedAt",rolled_back_at::text "rolledBackAt",applied_steps_count "appliedStepsCount" FROM _prisma_migrations ORDER BY migration_name,started_at,id`,
    )
  ).rows;
  const repository = await readGate4RepositoryMigrationInventory();
  assert.deepEqual(repository.defects, []);
  assert.ok(
    [61, 62].includes(repository.migrations.length),
    'Exact reviewed repository checkpoint required',
  );
  assert.equal(repository.migrations[60]?.name, STAFF_MIGRATION);
  if (repository.migrations.length === 62)
    assert.equal(repository.migrations[61]?.name, CLIENT_CONTACT_MIGRATION);
  const checkpoint = clientsApplied ? 62 : applied ? 61 : 60;
  const checkpointFiles = repository.migrations.slice(0, checkpoint);
  const evidence = reconcileGate4Migrations(history, {
    ...repository,
    migrations: checkpointFiles,
    digest: gate4MigrationIdentityDigest(checkpointFiles),
  });
  assert.deepEqual(evidence.defects, [], 'checkpoint-specific migration ledger differs');
  assert.equal(evidence.totalApplied, checkpoint);
  assert.equal(
    evidence.acceptedDatabaseProfile,
    profile === 'historical-full-state-upgrade' ? 'historical-live' : 'canonical-clean-replay',
    'migration profile is not the requested data profile',
  );
  if (applied) {
    const boundary = (
      await db.query<{ profile: string }>('SELECT profile FROM _migration.staff_roster_boundary')
    ).rows;
    assert.deepEqual(boundary, [{ profile }], 'boundary profile is missing, duplicated or hybrid');
  }
  await assertStaffSourceProfile(db, profile);
  return checkpoint;
}

/** Read-only historical reconciliation only. Never use for a writer or UI. */
export function historicalStaffSql(sql: string, applied: boolean): string {
  if (!applied) return sql;
  // Classify the statement after repository SQL-file header comments.
  let leading = sql.trimStart();
  while (leading.startsWith('--') || leading.startsWith('/*')) {
    if (leading.startsWith('--')) {
      const end = leading.indexOf('\n');
      assert.ok(end >= 0);
      leading = leading.slice(end + 1).trimStart();
    } else {
      const end = leading.indexOf('*/');
      assert.ok(end >= 0);
      leading = leading.slice(end + 2).trimStart();
    }
  }
  assert.match(leading, /^(?:SELECT|WITH)\b/iu, 'historical roster query must be read-only');
  let result = sql;
  for (const [live, snapshot] of [
    ['people', 'staff_roster_person'],
    ['person_name_alias', 'staff_roster_alias'],
    ['lookup_team', 'staff_roster_team'],
  ]) {
    const pattern = new RegExp(`\\b(FROM|JOIN)\\s+(?:public\\.)?${live}\\b`, 'giu');
    result = result.replace(pattern, (_, keyword: string) => `${keyword} _migration.${snapshot}`);
  }
  return result;
}

export function historicalStaffClient(db: ClientBase, applied: boolean): ClientBase {
  if (!applied) return db;
  return {
    query: (sql: string, values?: unknown[]) => {
      assert.equal(typeof sql, 'string');
      return db.query(historicalStaffSql(sql, true), values);
    },
  } as ClientBase;
}
