import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { createDatabaseClient } from '../src/lib/db';
import { setHumanAuditContext } from '../src/lib/audit';
import {
  auditDataFailures,
  auditStructureFailures,
  AUDITED_TABLES,
  protectedAuditExcludedDigest,
  TASK33A_PROTECTED_AUDIT_EXCLUDED_DIGEST,
} from './lib/audit-structure';
import {
  readGate4RepositoryMigrationInventory,
  reconcileGate4Migrations,
  type Gate4MigrationHistoryRow,
} from './lib/gate4-migrations';

function identifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/u);
  return `"${value}"`;
}

function migrate(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function fixtureRuntimeUrl(fixtureOwnerUrl: URL): URL {
  const configured = process.env['DATABASE_URL'];
  assert.ok(configured, 'DATABASE_URL is required');
  const runtime = new URL(configured);
  assert.equal(runtime.username, 'litigation_runtime');
  runtime.protocol = fixtureOwnerUrl.protocol;
  runtime.hostname = fixtureOwnerUrl.hostname;
  runtime.port = fixtureOwnerUrl.port;
  runtime.pathname = fixtureOwnerUrl.pathname;
  return runtime;
}

async function rejectsDatabase(operation: () => Promise<unknown>, expected: RegExp): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return expected.test(message);
  });
}

async function gate4MigrationEvidence(db: Client) {
  const migrationRows = await db.query<{
    migration_name: string;
    checksum: string;
    finished_at: string | null;
    rolled_back_at: string | null;
    applied_steps_count: number;
  }>(`
    SELECT migration_name,checksum,finished_at::text,rolled_back_at::text,
           applied_steps_count
      FROM _prisma_migrations
     ORDER BY migration_name,started_at,id`);
  const migrationHistory: Gate4MigrationHistoryRow[] = migrationRows.rows.map((row) => ({
    migrationName: row.migration_name,
    checksum: row.checksum,
    finishedAt: row.finished_at,
    rolledBackAt: row.rolled_back_at,
    appliedStepsCount: row.applied_steps_count,
  }));
  return reconcileGate4Migrations(migrationHistory, await readGate4RepositoryMigrationInventory());
}

async function protectedGuardState(db: Client): Promise<unknown[]> {
  const result = await db.query(`
    SELECT 'function' kind,p.proname name,
           md5(pg_get_functiondef(p.oid)) definition,
           NULL::text table_name,NULL::text enabled
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('refuse_legacy_billing_change','refuse_legacy_attendance_change')
    UNION ALL
    SELECT 'trigger',t.tgname,md5(pg_get_triggerdef(t.oid)),c.relname,t.tgenabled::text
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND NOT t.tgisinternal
       AND c.relname IN ('invoices','payments','invoice_allocations','attendance')
       AND t.tgname IN ('legacy_billing_history_guard','legacy_billing_no_truncate',
                        'legacy_attendance_history_guard','legacy_attendance_no_truncate')
     ORDER BY kind,name,table_name`);
  return result.rows;
}

async function reverseTask33AForHistoricalFixture(db: Client, fixtureName: string): Promise<void> {
  assert.match(fixtureName, /^litigation_task33a_history_fixture_[0-9_]+$/u);
  assert.equal(
    (await db.query<{ database: string }>('SELECT current_database() database')).rows[0]?.database,
    fixtureName,
  );
  await db.query('BEGIN');
  try {
    await db.query(`
      DO $REVERSE_TASK33A$
      DECLARE
        audited_tables constant text[] := ARRAY[
          'admin_tasks','attendance','client_logos','clients','contacts','documents',
          'fee_letter_matters','fee_letters','hearing_attendees','hearings',
          'invoice_allocations','invoices','lookup_client_branch','lookup_court',
          'lookup_degree','lookup_hearing_action','lookup_importance',
          'lookup_invoice_status','lookup_invoice_type','lookup_lawyer_share_role',
          'lookup_matter_category','lookup_matter_destination','lookup_matter_type',
          'lookup_party_role','lookup_team','lookup_venue',
          'matter_fee_letter_references','matter_lawyers','matter_parties',
          'matter_party_roles','matters','payments','people',
          'power_of_attorney_lawyers','powers_of_attorney','task_actions','user_accounts',
          'person_name_alias'
        ];
        audited_table text;
      BEGIN
        FOREACH audited_table IN ARRAY audited_tables LOOP
          EXECUTE format('DROP TRIGGER audit_actor_columns_guard ON public.%I',audited_table);
          EXECUTE format('ALTER TABLE public.%1$I DROP CONSTRAINT %2$I, DROP CONSTRAINT %3$I',
                         audited_table,audited_table||'_created_by_fkey',
                         audited_table||'_updated_by_fkey');
          EXECUTE format('DROP INDEX public.%I',audited_table||'_created_by_idx');
          EXECUTE format('DROP INDEX public.%I',audited_table||'_updated_by_idx');
          EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_by DROP DEFAULT, '
                         'ALTER COLUMN created_by DROP NOT NULL, '
                         'ALTER COLUMN updated_by DROP DEFAULT, '
                         'ALTER COLUMN updated_by DROP NOT NULL',audited_table);
        END LOOP;
      END
      $REVERSE_TASK33A$`);
    await db.query(`SET LOCAL session_replication_role='replica'`);
    for (const table of AUDITED_TABLES.filter((name) => name !== 'person_name_alias')) {
      assert.match(table, /^[a-z_]+$/u);
      await db.query(`UPDATE public.${table} SET created_by=NULL,updated_by=NULL`);
    }
    await db.query(`SET LOCAL session_replication_role='origin'`);
    await db.query(`
      ALTER TABLE public.person_name_alias
        DROP COLUMN created_by,
        DROP COLUMN updated_at,
        DROP COLUMN updated_by;
      DROP TABLE public.audit_actors;
      DROP FUNCTION public.refuse_audit_actor_identity_change();
      DROP FUNCTION public.audit_current_actor_id();
      DROP FUNCTION public.audit_set_human_context(integer);
      DROP FUNCTION public.audit_set_authentication_context();
      DROP FUNCTION public.audit_set_administration_context();
      DROP FUNCTION public.audit_set_migration_context();
      DROP FUNCTION public.enforce_audit_actor_columns()`);
    const removed = await db.query(
      `DELETE FROM _prisma_migrations
        WHERE migration_name='20260901120000_secure_audit_actor_attribution'
        RETURNING id`,
    );
    assert.equal(removed.rowCount, 1);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function proveHistoricalUpgrade(admin: Client, source: URL): Promise<void> {
  assert.equal(decodeURIComponent(source.pathname), '/litigation');
  const fixtureName = `litigation_task33a_history_fixture_${process.pid}_${Date.now()}`;
  const fixtureUrl = new URL(source);
  fixtureUrl.pathname = `/${fixtureName}`;
  let created = false;
  let guardsBefore: unknown[] = [];
  try {
    assert.equal(
      (
        await admin.query<{ count: string }>(
          'SELECT count(*)::text count FROM pg_database WHERE datname=$1',
          [fixtureName],
        )
      ).rows[0]?.count,
      '0',
    );
    await admin.query(`CREATE DATABASE ${identifier(fixtureName)} TEMPLATE litigation`);
    created = true;
    const fixture = new Client({ connectionString: fixtureUrl.toString() });
    await fixture.connect();
    try {
      const protectedBefore = await protectedAuditExcludedDigest(fixture);
      assert.equal(protectedBefore, TASK33A_PROTECTED_AUDIT_EXCLUDED_DIGEST);
      guardsBefore = await protectedGuardState(fixture);
      await reverseTask33AForHistoricalFixture(fixture, fixtureName);
      assert.equal(await protectedAuditExcludedDigest(fixture), protectedBefore);
      assert.deepEqual(await protectedGuardState(fixture), guardsBefore);
      assert.equal(
        (
          await fixture.query<{ nulls: string }>(`
            SELECT sum(actor_nulls)::text nulls FROM (
              SELECT count(*) FILTER(WHERE created_by IS NULL)::bigint
                     +count(*) FILTER(WHERE updated_by IS NULL)::bigint actor_nulls
                FROM user_accounts
              UNION ALL
              SELECT count(*) FILTER(WHERE created_by IS NULL)::bigint
                     +count(*) FILTER(WHERE updated_by IS NULL)::bigint
                FROM invoices
            ) evidence`)
        ).rows[0]?.nulls,
        '1094',
      );
    } finally {
      await fixture.end();
    }

    migrate(fixtureUrl.toString());
    const upgraded = new Client({ connectionString: fixtureUrl.toString() });
    await upgraded.connect();
    try {
      assert.equal(
        await protectedAuditExcludedDigest(upgraded),
        TASK33A_PROTECTED_AUDIT_EXCLUDED_DIGEST,
      );
      assert.deepEqual(await protectedGuardState(upgraded), guardsBefore);
      assert.deepEqual(await auditStructureFailures(upgraded), []);
      assert.deepEqual(await auditDataFailures(upgraded), []);
      const evidence = await gate4MigrationEvidence(upgraded);
      assert.deepEqual(evidence.defects, []);
      assert.equal(evidence.acceptedDatabaseProfile, 'historical-live');
      assert.deepEqual(
        evidence.laterAppliedMigrations.map((migration) => migration.name),
        ['20260831100000_authentication', '20260901120000_secure_audit_actor_attribution'],
      );
    } finally {
      await upgraded.end();
    }
    console.log(
      'PASS historical-live clone: migration 53 replay, protected digest and guard definitions unchanged',
    );
  } finally {
    if (created) {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE datname=$1 AND pid<>pg_backend_pid()`,
        [fixtureName],
      );
      await admin.query(`DROP DATABASE ${identifier(fixtureName)}`);
    }
  }
}

async function main(): Promise<void> {
  const sourceUrl = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(sourceUrl, 'MIGRATION_DATABASE_URL is required');
  const source = new URL(sourceUrl);
  assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
  assert.equal(source.port, '5433');
  const fixtureName = `litigation_task33a_fixture_${process.pid}_${Date.now()}`;
  const fixtureOwnerUrl = new URL(source);
  fixtureOwnerUrl.pathname = `/${fixtureName}`;
  const runtimeUrl = fixtureRuntimeUrl(fixtureOwnerUrl);
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  await admin.connect();
  try {
    await proveHistoricalUpgrade(admin, source);
    assert.equal(
      (
        await admin.query<{ count: string }>(
          'SELECT count(*)::text count FROM pg_database WHERE datname=$1',
          [fixtureName],
        )
      ).rows[0]?.count,
      '0',
    );
    await admin.query(`CREATE DATABASE ${identifier(fixtureName)}`);
    created = true;
    migrate(fixtureOwnerUrl.toString());

    const owner = new Client({ connectionString: fixtureOwnerUrl.toString() });
    const runtimeOne = new Client({ connectionString: runtimeUrl.toString() });
    const runtimeTwo = new Client({ connectionString: runtimeUrl.toString() });
    const prismaRuntime = createDatabaseClient(runtimeUrl.toString());
    await owner.connect();
    await runtimeOne.connect();
    await runtimeTwo.connect();
    try {
      const migrationEvidence = await gate4MigrationEvidence(owner);
      assert.deepEqual(migrationEvidence.defects, []);
      assert.equal(migrationEvidence.acceptedDatabaseProfile, 'canonical-clean-replay');
      assert.deepEqual(
        migrationEvidence.laterAppliedMigrations.map((migration) => migration.name),
        ['20260831100000_authentication', '20260901120000_secure_audit_actor_attribution'],
      );
      assert.deepEqual(await auditStructureFailures(owner), []);
      assert.deepEqual(await auditDataFailures(owner), []);
      assert.deepEqual(
        (
          await runtimeOne.query<{ current_user: string; session_user: string }>(
            'SELECT current_user,session_user',
          )
        ).rows[0],
        { current_user: 'litigation_runtime', session_user: 'litigation_runtime' },
      );

      await rejectsDatabase(
        () =>
          runtimeOne.query(
            `INSERT INTO lookup_importance(id,label_ar,sort_order,is_active)
             VALUES(30000,'__task33a_missing_context__',30000,true)`,
          ),
        /approved transaction-local audit actor context is required/u,
      );
      await runtimeOne.query('BEGIN');
      await runtimeOne.query(`SELECT set_config('litigation.audit_actor_id','999999',true)`);
      await rejectsDatabase(
        () =>
          runtimeOne.query(
            `INSERT INTO lookup_importance(id,label_ar,sort_order,is_active)
             VALUES(30000,'__task33a_invalid_context__',30000,true)`,
          ),
        /audit actor does not exist/u,
      );
      await runtimeOne.query('ROLLBACK');

      await runtimeOne.query('BEGIN');
      await runtimeOne.query('SELECT audit_set_authentication_context()');
      await runtimeOne.query(
        `INSERT INTO lookup_importance
           (id,label_ar,sort_order,is_active,created_at,created_by,updated_at,updated_by)
         VALUES(30000,'__task33a_spoof_fixture__',30000,true,
                '2000-01-01Z',1,'2001-01-01Z',1001)`,
      );
      const inserted = (
        await runtimeOne.query<{
          created_by: number;
          updated_by: number;
          created_at: Date;
          updated_at: Date;
        }>(`SELECT created_by,updated_by,created_at,updated_at
              FROM lookup_importance WHERE id=30000`)
      ).rows[0]!;
      assert.equal(inserted.created_by, 2);
      assert.equal(inserted.updated_by, 2);
      assert.notEqual(inserted.created_at.toISOString(), '2000-01-01T00:00:00.000Z');
      assert.notEqual(inserted.updated_at.toISOString(), '2001-01-01T00:00:00.000Z');
      await runtimeOne.query('SELECT audit_set_human_context(1)');
      await runtimeOne.query(
        `UPDATE lookup_importance
            SET created_by=1,updated_by=1,created_at='1990-01-01Z',updated_at='1991-01-01Z'
          WHERE id=30000`,
      );
      const updated = (
        await runtimeOne.query<{
          created_by: number;
          updated_by: number;
          created_at: Date;
          updated_at: Date;
        }>(`SELECT created_by,updated_by,created_at,updated_at
              FROM lookup_importance WHERE id=30000`)
      ).rows[0]!;
      assert.equal(updated.created_by, 2);
      assert.equal(updated.updated_by, 1001);
      assert.equal(updated.created_at.toISOString(), inserted.created_at.toISOString());
      assert.ok(updated.updated_at.getTime() >= inserted.updated_at.getTime());
      await runtimeOne.query('ROLLBACK');

      // Transaction-local state disappears after both commit and rollback.
      await runtimeOne.query('BEGIN');
      await runtimeOne.query('SELECT audit_set_authentication_context()');
      await runtimeOne.query('COMMIT');
      assert.equal(
        (
          await runtimeOne.query<{ context: string }>(
            `SELECT current_setting('litigation.audit_actor_id',true) context`,
          )
        ).rows[0]?.context,
        '',
      );
      await rejectsDatabase(
        () =>
          runtimeOne.query(
            `INSERT INTO lookup_importance(id,label_ar,sort_order,is_active)
             VALUES(30000,'__task33a_after_commit__',30000,true)`,
          ),
        /approved transaction-local audit actor context is required/u,
      );
      await runtimeOne.query('BEGIN');
      await runtimeOne.query('SELECT audit_set_authentication_context()');
      await runtimeOne.query('ROLLBACK');
      await rejectsDatabase(
        () =>
          runtimeOne.query(
            `INSERT INTO lookup_importance(id,label_ar,sort_order,is_active)
             VALUES(30000,'__task33a_after_rollback__',30000,true)`,
          ),
        /approved transaction-local audit actor context is required/u,
      );

      // Reused and concurrent connections keep actors separate.
      await Promise.all([runtimeOne.query('BEGIN'), runtimeTwo.query('BEGIN')]);
      await Promise.all([
        runtimeOne.query('SELECT audit_set_human_context(1)'),
        runtimeTwo.query('SELECT audit_set_human_context(2)'),
      ]);
      await Promise.all([
        runtimeOne.query(
          `INSERT INTO lookup_importance(id,label_ar,sort_order,is_active)
           VALUES(30010,'__task33a_concurrent_one__',30010,true)`,
        ),
        runtimeTwo.query(
          `INSERT INTO lookup_importance(id,label_ar,sort_order,is_active)
           VALUES(30011,'__task33a_concurrent_two__',30011,true)`,
        ),
      ]);
      assert.equal(
        (
          await runtimeOne.query<{ created_by: number }>(
            'SELECT created_by FROM lookup_importance WHERE id=30010',
          )
        ).rows[0]?.created_by,
        1001,
      );
      assert.equal(
        (
          await runtimeTwo.query<{ created_by: number }>(
            'SELECT created_by FROM lookup_importance WHERE id=30011',
          )
        ).rows[0]?.created_by,
        1002,
      );
      await Promise.all([runtimeOne.query('ROLLBACK'), runtimeTwo.query('ROLLBACK')]);

      // Global Prisma cannot escape the database guard; the audited
      // transaction handles a multi-row write and a junction write.
      await assert.rejects(
        prismaRuntime.lookupImportance.create({
          data: { id: 30020, labelAr: '__task33a_prisma_missing__', sortOrder: 30020 },
        }),
        /approved transaction-local audit actor context is required/u,
      );
      await prismaRuntime
        .$transaction(async (transaction) => {
          await setHumanAuditContext(transaction, 1);
          await transaction.lookupImportance.createMany({
            data: [
              { id: 30020, labelAr: '__task33a_prisma_one__', sortOrder: 30020 },
              { id: 30021, labelAr: '__task33a_prisma_two__', sortOrder: 30021 },
            ],
          });
          const matter = await transaction.matter.create({ data: {} });
          const person = await transaction.person.findFirstOrThrow({ orderBy: { id: 'asc' } });
          const junction = await transaction.matterLawyer.create({
            data: { matterId: matter.id, personId: person.id, role: 'lead' },
          });
          assert.equal(junction.createdBy, 1001);
          const created = await transaction.lookupImportance.findMany({
            where: { id: { in: [30020, 30021] } },
          });
          assert.deepEqual(
            created.map((row) => row.createdBy),
            [1001, 1001],
          );
          throw new Error('rollback audited Prisma fixture');
        })
        .catch((error: unknown) => {
          assert.match(error instanceof Error ? error.message : String(error), /rollback audited/u);
        });

      // Existing nested auth trigger writes inherit the originating actor.
      await runtimeOne.query('BEGIN');
      await runtimeOne.query('SELECT audit_set_authentication_context()');
      const account = (
        await runtimeOne.query<{ id: number; person_id: number }>(
          'SELECT id,person_id FROM user_accounts ORDER BY id LIMIT 1',
        )
      ).rows[0]!;
      await runtimeOne.query(
        `UPDATE user_accounts SET is_enabled=false,session_version=session_version+1,
               failed_login_attempts=0,locked_until=NULL
          WHERE id=$1`,
        [account.id],
      );
      assert.equal(
        (
          await runtimeOne.query<{ updated_by: number }>(
            'SELECT updated_by FROM people WHERE id=$1',
            [account.person_id],
          )
        ).rows[0]?.updated_by,
        2,
      );
      await runtimeOne.query('ROLLBACK');

      // The privileged connection defaults only controlled writes to the
      // migration actor; the web principal cannot choose admin/migration.
      await owner.query('BEGIN');
      await owner.query(
        `INSERT INTO lookup_importance(id,label_ar,sort_order,is_active)
         VALUES(30030,'__task33a_migration_default__',30030,true)`,
      );
      assert.equal(
        (
          await owner.query<{ created_by: number }>(
            'SELECT created_by FROM lookup_importance WHERE id=30030',
          )
        ).rows[0]?.created_by,
        1,
      );
      await owner.query('ROLLBACK');
      await rejectsDatabase(
        () => runtimeOne.query('SELECT audit_set_administration_context()'),
        /permission denied/u,
      );
      await rejectsDatabase(
        () => runtimeOne.query('SELECT audit_set_migration_context()'),
        /permission denied/u,
      );

      // Registry identities and the enforcement boundary cannot be changed.
      await rejectsDatabase(
        () => owner.query(`UPDATE audit_actors SET identity_label='changed' WHERE id=1`),
        /immutable/u,
      );
      await rejectsDatabase(() => owner.query('DELETE FROM audit_actors WHERE id=1'), /immutable/u);
      await rejectsDatabase(() => owner.query('TRUNCATE audit_actors CASCADE'), /immutable/u);
      await rejectsDatabase(
        () => runtimeOne.query('ALTER TABLE people DISABLE TRIGGER audit_actor_columns_guard'),
        /must be owner|permission denied/u,
      );
      await rejectsDatabase(
        () => runtimeOne.query('CREATE TABLE public.task33a_forbidden(id integer)'),
        /permission denied/u,
      );
      await rejectsDatabase(
        () => runtimeOne.query('UPDATE audit_actors SET identity_label=identity_label'),
        /permission denied/u,
      );
      await rejectsDatabase(() => runtimeOne.query('SET ROLE litigation'), /permission denied/u);

      // PostgreSQL custom GUCs remain a trust boundary for a compromised
      // application process. The application exposes no request-controlled
      // actor selector; static checks enforce that boundary explicitly.
      await runtimeOne.query('BEGIN');
      await runtimeOne.query(`SELECT set_config('litigation.audit_actor_id','1',true)`);
      await runtimeOne.query(
        `INSERT INTO lookup_importance(id,label_ar,sort_order,is_active)
         VALUES(30040,'__task33a_residual_process_boundary__',30040,true)`,
      );
      assert.equal(
        (
          await runtimeOne.query<{ created_by: number }>(
            'SELECT created_by FROM lookup_importance WHERE id=30040',
          )
        ).rows[0]?.created_by,
        1,
      );
      await runtimeOne.query('ROLLBACK');

      assert.deepEqual(await auditStructureFailures(owner), []);
      assert.deepEqual(await auditDataFailures(owner), []);
      assert.equal(AUDITED_TABLES.length, 38);
      console.log(
        'PASS canonical clean replay: Gate 4 profile plus migrations 52/53, exact 38 tables and immutable 7-actor registry',
      );
      console.log(
        'PASS missing/invalid context, spoof overwrite and immutable creation attribution',
      );
      console.log('PASS commit/rollback pool isolation and concurrent human actor separation');
      console.log('PASS Prisma, direct SQL, multi-row, junction and nested-trigger attribution');
      console.log('PASS runtime ownership/DDL/actor/admin/migration bypass attempts are refused');
      console.log(
        'PASS residual compromised-process GUC boundary is reproduced and not overstated',
      );
    } finally {
      await prismaRuntime.$disconnect();
      await runtimeTwo.end();
      await runtimeOne.end();
      await owner.end();
    }
  } finally {
    if (created) {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE datname=$1 AND pid<>pg_backend_pid()`,
        [fixtureName],
      );
      await admin.query(`DROP DATABASE ${identifier(fixtureName)}`);
    }
    await admin.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
