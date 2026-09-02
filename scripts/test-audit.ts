import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { setHumanAuditContext } from '../src/lib/audit';
import {
  auditDataFailures,
  auditStructureFailures,
  AUDITED_TABLES,
  protectedAuditExcludedDigest,
  runtimeRoleBoundaryFailures,
  TASK33A_PROTECTED_AUDIT_EXCLUDED_DIGEST,
} from './lib/audit-structure';
import { decodeUrlPassword, postgresqlStringLiteral } from './lib/database-principal';
import {
  assertApprovedMigrationPrincipalUrl,
  withApprovedMigrationClient,
} from './lib/migration-principal';
import {
  readGate4RepositoryMigrationInventory,
  reconcileGate4Migrations,
  type Gate4MigrationHistoryRow,
} from './lib/gate4-migrations';

const TASK33A_MIGRATION = '20260901120000_secure_audit_actor_attribution';
const TASK33A_CORRECTION_MIGRATION = '20260901170000_close_task33a_acceptance_gaps';
const TASK33A_FINAL_ENFORCEMENT_MIGRATION = '20260901190000_complete_task33a_enforcement_inventory';
const TASK33A_FINAL_ACCEPTANCE_MIGRATION = '20260902120000_finalize_task33a_enforcement';

function identifier(value: string): string {
  assert.match(value, /^[a-z0-9_]+$/u);
  return `"${value}"`;
}

async function migrate(databaseUrl: string): Promise<void> {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const failed = new Client({ connectionString: databaseUrl });
    let migrationLog = '';
    try {
      await failed.connect();
      const row = await failed.query<{ migration_name: string; logs: string | null }>(`
        SELECT migration_name,logs FROM _prisma_migrations
         WHERE finished_at IS NULL AND rolled_back_at IS NULL
         ORDER BY started_at DESC LIMIT 1`);
      if (row.rows[0]) {
        migrationLog = `\nfailed migration ${row.rows[0].migration_name}:\n${row.rows[0].logs ?? ''}`;
      }
    } finally {
      await failed.end().catch(() => undefined);
    }
    const commandOutput = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, `${migrationLog}\n${commandOutput.slice(-12_000)}`);
  }
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
      ALTER DEFAULT PRIVILEGES
        GRANT EXECUTE ON FUNCTIONS TO PUBLIC`);
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
        WHERE migration_name IN ($1,$2,$3,$4)
        RETURNING migration_name`,
      [
        TASK33A_MIGRATION,
        TASK33A_CORRECTION_MIGRATION,
        TASK33A_FINAL_ENFORCEMENT_MIGRATION,
        TASK33A_FINAL_ACCEPTANCE_MIGRATION,
      ],
    );
    assert.ok(removed.rowCount !== null && removed.rowCount >= 1 && removed.rowCount <= 4);
    assert.ok(removed.rows.some((row) => row['migration_name'] === TASK33A_MIGRATION));
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

    await migrate(fixtureUrl.toString());
    const upgraded = new Client({ connectionString: fixtureUrl.toString() });
    await upgraded.connect();
    try {
      assert.equal(
        await protectedAuditExcludedDigest(upgraded),
        TASK33A_PROTECTED_AUDIT_EXCLUDED_DIGEST,
      );
      assert.deepEqual(await protectedGuardState(upgraded), guardsBefore);
      assert.deepEqual(await auditStructureFailures(upgraded), []);
      assert.deepEqual(await runtimeRoleBoundaryFailures(upgraded), []);
      assert.deepEqual(await auditDataFailures(upgraded), []);
      const evidence = await gate4MigrationEvidence(upgraded);
      assert.deepEqual(evidence.defects, []);
      assert.equal(evidence.acceptedDatabaseProfile, 'historical-live');
      assert.deepEqual(
        evidence.laterAppliedMigrations.map((migration) => migration.name),
        [
          '20260831100000_authentication',
          TASK33A_MIGRATION,
          TASK33A_CORRECTION_MIGRATION,
          TASK33A_FINAL_ENFORCEMENT_MIGRATION,
          TASK33A_FINAL_ACCEPTANCE_MIGRATION,
        ],
      );
    } finally {
      await upgraded.end();
    }
    console.log(
      'PASS historical-live clone: migrations 53/54/55/56 replay, protected digest and guard definitions unchanged',
    );
  } finally {
    if (created) {
      await admin.query(`DROP DATABASE ${identifier(fixtureName)}`);
    }
  }
}

async function grantProbeRuntimeBoundary(
  owner: Client,
  fixtureName: string,
  roleName: string,
): Promise<void> {
  await owner.query(
    `GRANT CONNECT ON DATABASE ${identifier(fixtureName)} TO ${identifier(roleName)}`,
  );
  await owner.query(`GRANT USAGE ON SCHEMA public TO ${identifier(roleName)}`);
  for (const table of AUDITED_TABLES) {
    await owner.query(
      `GRANT SELECT,INSERT,UPDATE ON TABLE public.${identifier(table)} TO ${identifier(roleName)}`,
    );
  }
  const sequences = await owner.query<{ schema_name: string; sequence_name: string }>(
    `
    SELECT n.nspname schema_name,c.relname sequence_name
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind='S' AND c.oid IN (
       SELECT to_regclass(pg_get_serial_sequence(format('public.%I',table_name),'id'))::oid
         FROM unnest($1::text[]) table_name
     ) ORDER BY n.nspname,c.relname`,
    [AUDITED_TABLES],
  );
  for (const sequence of sequences.rows) {
    await owner.query(
      `GRANT USAGE,SELECT ON SEQUENCE ${identifier(sequence.schema_name)}.${identifier(sequence.sequence_name)} TO ${identifier(roleName)}`,
    );
  }
  await owner.query(
    `GRANT EXECUTE ON FUNCTION public.audit_current_actor_id() TO ${identifier(roleName)}`,
  );
  await owner.query(
    `GRANT EXECUTE ON FUNCTION public.audit_set_human_context(integer) TO ${identifier(roleName)}`,
  );
  await owner.query(
    `GRANT EXECUTE ON FUNCTION public.audit_set_authentication_context() TO ${identifier(roleName)}`,
  );
}

async function proveRoleBoundaryAdversarial(
  admin: Client,
  owner: Client,
  fixtureOwnerUrl: URL,
  fixtureName: string,
): Promise<void> {
  const suffix = `${process.pid}_${Date.now()}`;
  const probeRole = `litigation_task33a_probe_${suffix}`;
  const bridgeRole = `litigation_task33a_bridge_${suffix}`;
  const targetRole = `litigation_task33a_target_${suffix}`;
  const probePassword = randomBytes(36).toString('base64url');
  const ownedTable = `task33a_role_owned_${process.pid}`;
  for (const role of [probeRole, bridgeRole, targetRole]) assert.match(role, /^[a-z0-9_]+$/u);
  let created = false;
  try {
    const existing = await admin.query<{ count: string }>(
      `SELECT count(*)::text count FROM pg_roles WHERE rolname=ANY($1::text[])`,
      [[probeRole, bridgeRole, targetRole]],
    );
    assert.equal(existing.rows[0]?.count, '0');
    await admin.query(
      `CREATE ROLE ${identifier(probeRole)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${postgresqlStringLiteral(probePassword)}`,
    );
    await admin.query(`CREATE ROLE ${identifier(bridgeRole)} NOLOGIN`);
    await admin.query(`CREATE ROLE ${identifier(targetRole)} NOLOGIN`);
    created = true;
    // This database was created solely for this test. Remove the real runtime
    // role's cloned object ACLs so the probe role can be checked as the one
    // exact approved grantee, then restore the real grants in finally.
    await owner.query('DROP OWNED BY litigation_runtime');
    await grantProbeRuntimeBoundary(owner, fixtureName, probeRole);
    assert.deepEqual(await runtimeRoleBoundaryFailures(owner, probeRole), []);

    // Execute the exact forward migration with only its reviewed runtime-role
    // identifier substituted for this disposable probe. An unexpected PUBLIC
    // grant must leave the probe NOLOGIN and without CONNECT after validation
    // fails, proving that the committed first transaction fails closed.
    const migration56 = readFileSync(
      new URL(
        '../prisma/migrations/20260902120000_finalize_task33a_enforcement/migration.sql',
        import.meta.url,
      ),
      'utf8',
    ).replaceAll('litigation_runtime', probeRole);

    const activeRuntimeUrl = new URL(fixtureOwnerUrl);
    activeRuntimeUrl.username = probeRole;
    activeRuntimeUrl.password = probePassword;
    const activeRuntime = new Client({ connectionString: activeRuntimeUrl.toString() });
    let terminationError: Error | undefined;
    activeRuntime.on('error', (error) => {
      terminationError = error;
    });
    await activeRuntime.connect();
    try {
      assert.equal(
        (
          await owner.query<{ sessions: string }>(
            `SELECT count(*)::text sessions FROM pg_stat_activity
              WHERE datname=current_database() AND usename=$1`,
            [probeRole],
          )
        ).rows[0]?.sessions,
        '1',
      );
      await owner.query(migration56);
      await assert.rejects(
        activeRuntime.query('SELECT 1'),
        /terminating connection|Connection terminated|connection is closed|connection error|not queryable/u,
      );
      assert.match(terminationError?.message ?? '', /terminat/u);
    } finally {
      await activeRuntime.end().catch(() => undefined);
    }
    assert.deepEqual(await runtimeRoleBoundaryFailures(owner, probeRole), []);
    console.log(
      'PASS migration 56 superuser path terminates only the active disposable runtime session and restores the approved boundary',
    );

    await owner.query('GRANT SELECT ON public.lookup_importance TO PUBLIC');
    try {
      await assert.rejects(
        owner.query(migration56),
        /project relation has a PUBLIC or unapproved-grantee ACL/u,
      );
      await owner.query('ROLLBACK');
      assert.equal(
        (
          await admin.query<{ rolcanlogin: boolean }>(
            'SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',
            [probeRole],
          )
        ).rows[0]?.rolcanlogin,
        false,
      );
      assert.equal(
        (
          await owner.query<{ direct_connect: string }>(
            `SELECT count(*)::text direct_connect
               FROM pg_database d,LATERAL aclexplode(d.datacl) acl
               JOIN pg_roles grantee ON grantee.oid=acl.grantee
              WHERE d.datname=current_database() AND grantee.rolname=$1
                AND acl.privilege_type='CONNECT'`,
            [probeRole],
          )
        ).rows[0]?.direct_connect,
        '0',
      );
    } finally {
      await owner.query('ROLLBACK').catch(() => undefined);
      await owner.query('REVOKE SELECT ON public.lookup_importance FROM PUBLIC');
      await admin.query(`ALTER ROLE ${identifier(probeRole)} LOGIN`);
      await owner.query(
        `GRANT CONNECT ON DATABASE ${identifier(fixtureName)} TO ${identifier(probeRole)}`,
      );
    }
    assert.deepEqual(await runtimeRoleBoundaryFailures(owner, probeRole), []);
    console.log('PASS migration 56 validation failure leaves the disposable runtime unavailable');

    await admin.query(`ALTER ROLE ${identifier(probeRole)} INHERIT`);
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('attributes'),
      ),
    );
    await admin.query(`ALTER ROLE ${identifier(probeRole)} NOINHERIT`);

    await admin.query(
      `GRANT ${identifier(targetRole)} TO ${identifier(probeRole)} WITH INHERIT FALSE, SET TRUE`,
    );
    const directMembership = await runtimeRoleBoundaryFailures(owner, probeRole);
    assert.ok(directMembership.some((failure) => failure.includes('memberships')));
    assert.ok(directMembership.some((failure) => failure.includes('SET ROLE')));
    const impersonation = new Client({ connectionString: fixtureOwnerUrl.toString() });
    await impersonation.connect();
    try {
      await impersonation.query(`SET SESSION AUTHORIZATION ${identifier(probeRole)}`);
      await impersonation.query(`SET ROLE ${identifier(targetRole)}`);
      assert.equal(
        (await impersonation.query<{ current_user: string }>('SELECT current_user')).rows[0]
          ?.current_user,
        targetRole,
      );
      await impersonation.query('RESET ROLE');
      await impersonation.query('RESET SESSION AUTHORIZATION');
    } finally {
      await impersonation.end();
    }
    await admin.query(`ALTER ROLE ${identifier(probeRole)} SET role TO ${identifier(targetRole)}`);
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('role-level settings'),
      ),
    );
    await admin.query(`ALTER ROLE ${identifier(probeRole)} RESET role`);
    await admin.query(`REVOKE ${identifier(targetRole)} FROM ${identifier(probeRole)}`);

    await admin.query(
      `GRANT ${identifier(bridgeRole)} TO ${identifier(probeRole)} WITH INHERIT FALSE, SET TRUE`,
    );
    await admin.query(
      `GRANT ${identifier(targetRole)} TO ${identifier(bridgeRole)} WITH INHERIT FALSE, SET TRUE`,
    );
    const indirectMembership = await runtimeRoleBoundaryFailures(owner, probeRole);
    assert.ok(indirectMembership.some((failure) => failure.includes(targetRole)));
    await admin.query(`REVOKE ${identifier(targetRole)} FROM ${identifier(bridgeRole)}`);
    await admin.query(`REVOKE ${identifier(bridgeRole)} FROM ${identifier(probeRole)}`);

    await admin.query(
      `ALTER ROLE ${identifier(probeRole)} IN DATABASE ${identifier(fixtureName)} SET litigation.audit_actor_id TO '1'`,
    );
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('database-specific settings'),
      ),
    );
    await admin.query(
      `ALTER ROLE ${identifier(probeRole)} IN DATABASE ${identifier(fixtureName)} RESET litigation.audit_actor_id`,
    );

    await owner.query(`CREATE TABLE public.${identifier(ownedTable)}(id integer)`);
    await owner.query(
      `ALTER TABLE public.${identifier(ownedTable)} OWNER TO ${identifier(probeRole)}`,
    );
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('owns a database'),
      ),
    );
    await owner.query(
      `ALTER TABLE public.${identifier(ownedTable)} OWNER TO ${identifier('litigation')}`,
    );
    await owner.query(`DROP TABLE public.${identifier(ownedTable)}`);

    await owner.query('BEGIN');
    await owner.query(`GRANT DELETE ON public.lookup_importance TO ${identifier(probeRole)}`);
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('lookup_importance'),
      ),
    );
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query('GRANT DELETE ON public.lookup_importance TO PUBLIC');
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('lookup_importance'),
      ),
    );
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(`GRANT SELECT ON public._prisma_migrations TO ${identifier(probeRole)}`);
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('_prisma_migrations'),
      ),
    );
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(`GRANT CREATE ON SCHEMA public TO ${identifier(probeRole)}`);
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('schema boundary'),
      ),
    );
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(
      `GRANT TEMPORARY ON DATABASE ${identifier(fixtureName)} TO ${identifier(probeRole)}`,
    );
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('CONNECT/CREATE/TEMPORARY'),
      ),
    );
    await owner.query('ROLLBACK');

    const unapprovedSequence = (
      await owner.query<{ schema_name: string; sequence_name: string }>(
        `SELECT n.nspname schema_name,c.relname sequence_name
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ('public','staging','quarantine') AND c.relkind='S'
            AND c.oid NOT IN (
              SELECT to_regclass(
                       pg_get_serial_sequence(format('public.%I',table_name),'id')
                     )::oid
                FROM unnest($1::text[]) table_name
               WHERE pg_get_serial_sequence(format('public.%I',table_name),'id') IS NOT NULL
            )
          ORDER BY n.nspname,c.relname LIMIT 1`,
        [AUDITED_TABLES],
      )
    ).rows[0];
    assert.ok(unapprovedSequence, 'fixture requires an unapproved project sequence');
    await owner.query('BEGIN');
    await owner.query(
      `GRANT USAGE,SELECT ON SEQUENCE ${identifier(unapprovedSequence.schema_name)}.${identifier(unapprovedSequence.sequence_name)} TO ${identifier(probeRole)}`,
    );
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes(unapprovedSequence.sequence_name),
      ),
    );
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(`GRANT SELECT ON public.audit_actors TO ${identifier(probeRole)}`);
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('audit_actors'),
      ),
    );
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(
      `GRANT EXECUTE ON FUNCTION public.audit_set_administration_context() TO ${identifier(probeRole)}`,
    );
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('SECURITY DEFINER'),
      ),
    );
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(
      'GRANT EXECUTE ON FUNCTION public.audit_set_administration_context() TO PUBLIC',
    );
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('SECURITY DEFINER'),
      ),
    );
    await owner.query('ROLLBACK');

    const grantor = (await admin.query<{ session_user: string }>('SELECT session_user')).rows[0]!
      .session_user;
    await admin.query(
      `GRANT ${identifier(probeRole)} TO ${identifier(targetRole)} WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`,
    );
    const adminOnlyInbound = await runtimeRoleBoundaryFailures(owner, probeRole);
    assert.ok(
      adminOnlyInbound.some((failure) =>
        failure.includes(`${targetRole}[grantor=${grantor},admin=true,inherit=false,set=false]`),
      ),
    );

    const delegator = new Client({ connectionString: fixtureOwnerUrl.toString() });
    await delegator.connect();
    try {
      await delegator.query(`SET SESSION AUTHORIZATION ${identifier(targetRole)}`);
      await delegator.query(
        `GRANT ${identifier(probeRole)} TO ${identifier(bridgeRole)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
      );
      const delegatedInbound = await runtimeRoleBoundaryFailures(owner, probeRole);
      assert.ok(
        delegatedInbound.some((failure) =>
          failure.includes(
            `${bridgeRole}[grantor=${targetRole},admin=false,inherit=false,set=true]`,
          ),
        ),
      );

      const delegatedRecipient = new Client({ connectionString: fixtureOwnerUrl.toString() });
      await delegatedRecipient.connect();
      try {
        await delegatedRecipient.query(`SET SESSION AUTHORIZATION ${identifier(bridgeRole)}`);
        await delegatedRecipient.query(`SET ROLE ${identifier(probeRole)}`);
        assert.equal(
          (await delegatedRecipient.query<{ current_user: string }>('SELECT current_user')).rows[0]
            ?.current_user,
          probeRole,
        );
      } finally {
        await delegatedRecipient.end();
      }

      await assert.rejects(owner.query(migration56), /explicit inbound membership/u);
      await owner.query('ROLLBACK');
      assert.equal(
        (
          await admin.query<{ rolcanlogin: boolean }>(
            'SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',
            [probeRole],
          )
        ).rows[0]?.rolcanlogin,
        false,
      );
      await delegator.query(`REVOKE ${identifier(probeRole)} FROM ${identifier(bridgeRole)}`);
      await delegator.query('RESET SESSION AUTHORIZATION');
    } finally {
      await delegator.end();
    }
    await admin.query(`REVOKE ${identifier(probeRole)} FROM ${identifier(targetRole)}`);
    await admin.query(`ALTER ROLE ${identifier(probeRole)} LOGIN`);
    await owner.query(
      `GRANT CONNECT ON DATABASE ${identifier(fixtureName)} TO ${identifier(probeRole)}`,
    );

    for (const options of [
      'ADMIN FALSE, INHERIT TRUE, SET FALSE',
      'ADMIN FALSE, INHERIT FALSE, SET TRUE',
      'ADMIN FALSE, INHERIT FALSE, SET FALSE',
    ]) {
      await admin.query(
        `GRANT ${identifier(probeRole)} TO ${identifier(targetRole)} WITH ${options}`,
      );
      const inbound = await runtimeRoleBoundaryFailures(owner, probeRole);
      assert.ok(inbound.some((failure) => failure.includes('explicit inbound memberships')));
      assert.ok(inbound.some((failure) => failure.includes(`grantor=${grantor}`)));
      await admin.query(`REVOKE ${identifier(probeRole)} FROM ${identifier(targetRole)}`);
    }
    assert.deepEqual(await runtimeRoleBoundaryFailures(owner, probeRole), []);
    console.log(
      'PASS every inbound ADMIN/INHERIT/SET combination and exact member/grantor provenance is rejected; ADMIN-only delegation and recipient SET ROLE were proved then removed',
    );

    await owner.query('BEGIN');
    await owner.query('GRANT SELECT ON public.lookup_importance TO PUBLIC');
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('unapproved relation ACL grantee PUBLIC/SELECT'),
      ),
    );
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(
      `GRANT SELECT(id),INSERT(id),UPDATE(id),REFERENCES(id) ON public.audit_actors TO ${identifier(probeRole)}`,
    );
    const columnAcl = await runtimeRoleBoundaryFailures(owner, probeRole);
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
      assert.ok(columnAcl.some((failure) => failure.includes(`/${privilege}`)));
    }
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(`GRANT MAINTAIN ON public.lookup_importance TO ${identifier(probeRole)}`);
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('lookup_importance'),
      ),
    );
    await owner.query('ROLLBACK');

    const approvedSequence = (
      await owner.query<{ schema_name: string; sequence_name: string }>(
        `SELECT n.nspname schema_name,c.relname sequence_name
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE c.relkind='S' AND c.oid IN (
            SELECT to_regclass(pg_get_serial_sequence(format('public.%I',table_name),'id'))::oid
              FROM unnest($1::text[]) table_name
          ) ORDER BY n.nspname,c.relname LIMIT 1`,
        [AUDITED_TABLES],
      )
    ).rows[0];
    assert.ok(approvedSequence);
    await owner.query('BEGIN');
    await owner.query(
      `GRANT SELECT ON SEQUENCE ${identifier(approvedSequence.schema_name)}.${identifier(approvedSequence.sequence_name)} TO PUBLIC`,
    );
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('unapproved sequence ACL grantee PUBLIC/SELECT'),
      ),
    );
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query('GRANT EXECUTE ON FUNCTION public.audit_current_actor_id() TO PUBLIC');
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('unapproved SECURITY DEFINER ACL grantee PUBLIC/EXECUTE'),
      ),
    );
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(`GRANT SELECT ON public.lookup_importance TO ${identifier(targetRole)}`);
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes(`unapproved relation ACL grantee ${targetRole}/SELECT`),
      ),
    );
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(`CREATE SCHEMA ${identifier(`task33a_schema_${process.pid}`)}`);
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('project schema inventory differs'),
      ),
    );
    await owner.query('ROLLBACK');

    const triggerTable = `task33a_replica_probe_${process.pid}`;
    const triggerFunction = `task33a_replica_mark_${process.pid}`;
    await owner.query('BEGIN');
    await owner.query(
      `CREATE TABLE public.${identifier(triggerTable)}(id integer GENERATED ALWAYS AS IDENTITY,fired boolean NOT NULL DEFAULT false)`,
    );
    await owner.query(`
      CREATE FUNCTION public.${identifier(triggerFunction)}() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN NEW.fired:=true; RETURN NEW; END $$`);
    await owner.query(
      `CREATE TRIGGER mark_before_insert BEFORE INSERT ON public.${identifier(triggerTable)}
       FOR EACH ROW EXECUTE FUNCTION public.${identifier(triggerFunction)}()`,
    );
    await owner.query(
      `GRANT SET ON PARAMETER session_replication_role TO ${identifier(probeRole)}`,
    );
    const parameterAcl = await runtimeRoleBoundaryFailures(owner, probeRole);
    assert.ok(parameterAcl.some((failure) => failure.includes('session_replication_role')));
    await owner.query(
      `GRANT INSERT,SELECT ON public.${identifier(triggerTable)} TO ${identifier(probeRole)}`,
    );
    await owner.query(`SET LOCAL ROLE ${identifier(probeRole)}`);
    const originTrigger = await owner.query<{ fired: boolean }>(
      `INSERT INTO public.${identifier(triggerTable)} DEFAULT VALUES RETURNING fired`,
    );
    assert.equal(originTrigger.rows[0]?.fired, true);
    await owner.query(`SET LOCAL session_replication_role='replica'`);
    const replicaTrigger = await owner.query<{ fired: boolean }>(
      `INSERT INTO public.${identifier(triggerTable)} DEFAULT VALUES RETURNING fired`,
    );
    assert.equal(replicaTrigger.rows[0]?.fired, false);
    await owner.query(`RESET session_replication_role`);
    await owner.query('RESET ROLE');
    await owner.query('ROLLBACK');

    await owner.query('BEGIN');
    await owner.query(
      `GRANT ALTER SYSTEM ON PARAMETER session_replication_role TO ${identifier(probeRole)}`,
    );
    assert.ok(
      (await runtimeRoleBoundaryFailures(owner, probeRole)).some((failure) =>
        failure.includes('session_replication_role'),
      ),
    );
    await owner.query('ROLLBACK');

    assert.deepEqual(await runtimeRoleBoundaryFailures(owner, probeRole), []);
    console.log(
      'PASS disposable bidirectional role graph, exact ACL provenance, columns, sequences, MAINTAIN, schemas and session_replication_role paths are rejected',
    );
  } finally {
    if (created) {
      await owner.query(`DROP TABLE IF EXISTS public.${identifier(ownedTable)}`);
      await owner.query(`DROP OWNED BY ${identifier(probeRole)}`);
      await grantProbeRuntimeBoundary(owner, fixtureName, 'litigation_runtime');
      await admin.query(`DROP ROLE IF EXISTS ${identifier(probeRole)}`);
      await admin.query(`DROP ROLE IF EXISTS ${identifier(bridgeRole)}`);
      await admin.query(`DROP ROLE IF EXISTS ${identifier(targetRole)}`);
    }
  }
}

async function provePasswordProvisioning(admin: Client, source: URL): Promise<void> {
  const roleName = `litigation_task33a_password_${process.pid}_${Date.now()}`;
  assert.match(roleName, /^[a-z0-9_]+$/u);
  let created = false;
  let reservedClient: Client | undefined;
  let base64urlClient: Client | undefined;
  try {
    assert.equal(
      (
        await admin.query<{ count: string }>(
          'SELECT count(*)::text count FROM pg_roles WHERE rolname=$1',
          [roleName],
        )
      ).rows[0]?.count,
      '0',
    );
    const reservedPassword =
      randomBytes(18).toString('base64url') +
      String.fromCharCode(47, 58, 64, 63, 35, 38, 61, 39, 37, 43, 59, 92);
    const connection = new URL(source);
    connection.username = roleName;
    connection.password = encodeURIComponent(reservedPassword);
    assert.notEqual(connection.password, reservedPassword);
    assert.equal(decodeUrlPassword(connection, 'fixture URL'), reservedPassword);
    await admin.query(
      `CREATE ROLE ${identifier(roleName)} LOGIN PASSWORD ${postgresqlStringLiteral(decodeUrlPassword(connection, 'fixture URL'))}`,
    );
    created = true;
    reservedClient = new Client({ connectionString: connection.toString() });
    await reservedClient.connect();
    await reservedClient.query('SELECT 1');
    await reservedClient.end();

    const base64urlPassword = randomBytes(36).toString('base64url');
    connection.password = base64urlPassword;
    assert.equal(decodeUrlPassword(connection, 'fixture URL'), base64urlPassword);
    await admin.query(
      `ALTER ROLE ${identifier(roleName)} PASSWORD ${postgresqlStringLiteral(decodeUrlPassword(connection, 'fixture URL'))}`,
    );
    base64urlClient = new Client({ connectionString: connection.toString() });
    await base64urlClient.connect();
    await base64urlClient.query('SELECT 1');
    await base64urlClient.end();
    console.log(
      'PASS URL-reserved and existing base64url runtime passwords authenticate after one safe decode',
    );
  } finally {
    await base64urlClient?.end().catch(() => undefined);
    await reservedClient?.end().catch(() => undefined);
    if (created) await admin.query(`DROP ROLE ${identifier(roleName)}`);
  }
}

async function proveMigrationPrincipalPreflight(admin: Client, source: URL): Promise<void> {
  const suffix = `${process.pid}_${Date.now()}`;
  const roleName = `litigation_task33a_migrator_${suffix}`;
  const databaseName = `litigation_task33a_preflight_${suffix}`;
  const password = randomBytes(36).toString('base64url');
  let roleCreated = false;
  let databaseCreated = false;
  try {
    await assertApprovedMigrationPrincipalUrl(source.toString());
    let approvedWorkRan = false;
    await withApprovedMigrationClient(
      async (database) => {
        const identity = await database.query<{ approved: boolean }>(
          `SELECT rolsuper approved FROM pg_roles WHERE rolname=current_user`,
        );
        assert.equal(identity.rows[0]?.approved, true);
        approvedWorkRan = true;
      },
      { databaseUrl: source.toString() },
    );
    assert.equal(approvedWorkRan, true);
    await admin.query(
      `CREATE ROLE ${identifier(roleName)} LOGIN NOSUPERUSER NOCREATEDB CREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${postgresqlStringLiteral(password)}`,
    );
    roleCreated = true;
    await admin.query(`CREATE DATABASE ${identifier(databaseName)}`);
    databaseCreated = true;

    const unapprovedUrl = new URL(source);
    unapprovedUrl.username = roleName;
    unapprovedUrl.password = password;
    unapprovedUrl.pathname = `/${databaseName}`;
    let rejectedWorkRan = false;
    await assert.rejects(
      () =>
        withApprovedMigrationClient(
          async () => {
            rejectedWorkRan = true;
          },
          { databaseUrl: unapprovedUrl.toString() },
        ),
      /approved PostgreSQL superuser migration\/administration principal/u,
    );
    assert.equal(rejectedWorkRan, false);
    const result = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', 'deploy'],
      {
        cwd: process.cwd(),
        env: { ...process.env, MIGRATION_DATABASE_URL: unapprovedUrl.toString() },
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    if (result.error) throw result.error;
    assert.notEqual(result.status, 0);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /approved PostgreSQL superuser migration\/administration principal/u);
    assert.equal(output.includes(password), false);
    assert.equal(output.includes(unapprovedUrl.toString()), false);
    assert.doesNotMatch(output, /postgresql:\/\//u);

    const evidenceUrl = new URL(source);
    evidenceUrl.pathname = `/${databaseName}`;
    const evidence = new Client({ connectionString: evidenceUrl.toString() });
    await evidence.connect();
    try {
      assert.equal(
        (
          await evidence.query<{ migration_table: string | null }>(
            `SELECT to_regclass('public._prisma_migrations')::text migration_table`,
          )
        ).rows[0]?.migration_table,
        null,
      );
    } finally {
      await evidence.end();
    }
    console.log(
      'PASS approved migration work runs only after verified superuser identity; rejected-principal work never runs; Prisma does not start and no credential is output',
    );
  } finally {
    if (databaseCreated) {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE datname=$1 AND pid<>pg_backend_pid()`,
        [databaseName],
      );
      await admin.query(`DROP DATABASE ${identifier(databaseName)}`);
    }
    if (roleCreated) await admin.query(`DROP ROLE ${identifier(roleName)}`);
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
  const runtimeLoginBefore = (
    await admin.query<{ rolcanlogin: boolean }>(
      `SELECT rolcanlogin FROM pg_roles WHERE rolname='litigation_runtime'`,
    )
  ).rows[0]?.rolcanlogin;
  assert.equal(typeof runtimeLoginBefore, 'boolean');
  try {
    await proveMigrationPrincipalPreflight(admin, source);
    await provePasswordProvisioning(admin, source);
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
    await migrate(fixtureOwnerUrl.toString());

    const owner = new Client({ connectionString: fixtureOwnerUrl.toString() });
    const runtimeOne = new Client({ connectionString: runtimeUrl.toString() });
    const runtimeTwo = new Client({ connectionString: runtimeUrl.toString() });
    // Import only after both replay migrations finish: evaluating db.ts creates
    // its global runtime pool, which fail-closed deployment must terminate.
    const { createDatabaseClient } = await import('../src/lib/db');
    const rejectedMarker = `task33a-rejected-url-${process.pid}`;
    const rejectedRuntimeUrls = ['litigation', 'litigation_runtime_extra', ''].map((username) => {
      const rejected = new URL(runtimeUrl);
      rejected.username = username;
      rejected.password = rejectedMarker;
      return rejected.toString();
    });
    rejectedRuntimeUrls.push(`not-a-postgresql-url-${rejectedMarker}`);
    for (const protocol of ['https:', 'http:', 'file:']) {
      rejectedRuntimeUrls.push(
        runtimeUrl
          .toString()
          .replace(/^postgresql:/u, protocol)
          .replace(/(?:\?|$)/u, `?marker=${rejectedMarker}`),
      );
    }
    for (const rejectedUrl of rejectedRuntimeUrls) {
      let unexpectedClient: ReturnType<typeof createDatabaseClient> | undefined;
      try {
        unexpectedClient = createDatabaseClient(rejectedUrl);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        assert.doesNotMatch(message, new RegExp(rejectedMarker, 'u'));
        assert.match(message, /valid PostgreSQL URL|restricted litigation_runtime/u);
        continue;
      }
      await unexpectedClient.$disconnect();
      assert.fail('createDatabaseClient accepted a non-litigation_runtime URL');
    }
    const postgresProtocolUrl = new URL(runtimeUrl);
    postgresProtocolUrl.protocol = 'postgres:';
    await createDatabaseClient(postgresProtocolUrl.toString()).$disconnect();
    const prismaRuntime = createDatabaseClient(runtimeUrl.toString());
    await owner.connect();
    try {
      await proveRoleBoundaryAdversarial(admin, owner, fixtureOwnerUrl, fixtureName);
      await runtimeOne.connect();
      await runtimeTwo.connect();
      const migrationEvidence = await gate4MigrationEvidence(owner);
      assert.deepEqual(migrationEvidence.defects, []);
      assert.equal(migrationEvidence.acceptedDatabaseProfile, 'canonical-clean-replay');
      assert.deepEqual(
        migrationEvidence.laterAppliedMigrations.map((migration) => migration.name),
        [
          '20260831100000_authentication',
          TASK33A_MIGRATION,
          TASK33A_CORRECTION_MIGRATION,
          TASK33A_FINAL_ENFORCEMENT_MIGRATION,
          TASK33A_FINAL_ACCEPTANCE_MIGRATION,
        ],
      );
      assert.deepEqual(await auditStructureFailures(owner), []);
      assert.deepEqual(await runtimeRoleBoundaryFailures(owner), []);
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
        () => runtimeOne.query(`SET session_replication_role='replica'`),
        /permission denied/u,
      );
      assert.equal(
        (
          await runtimeOne.query<{ setting: string }>(
            `SELECT current_setting('session_replication_role') setting`,
          )
        ).rows[0]?.setting,
        'origin',
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
      const otherRoles = await owner.query<{ role_name: string }>(
        `SELECT rolname role_name FROM pg_roles
          WHERE rolname<>'litigation_runtime' ORDER BY rolname`,
      );
      for (const role of otherRoles.rows) {
        await rejectsDatabase(
          () => runtimeOne.query(`SET ROLE ${identifier(role.role_name)}`),
          /permission denied/u,
        );
      }

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
      assert.deepEqual(await runtimeRoleBoundaryFailures(owner), []);
      assert.deepEqual(await auditDataFailures(owner), []);
      assert.equal(AUDITED_TABLES.length, 38);
      console.log(
        'PASS canonical clean replay: Gate 4 profile plus migrations 52/53/54/55/56, exact 38 tables and immutable 7-actor registry',
      );
      console.log(
        'PASS missing/invalid context, spoof overwrite and immutable creation attribution',
      );
      console.log('PASS commit/rollback pool isolation and concurrent human actor separation');
      console.log('PASS Prisma, direct SQL, multi-row, junction and nested-trigger attribution');
      console.log('PASS runtime ownership/DDL/actor/admin/migration bypass attempts are refused');
      console.log(
        'PASS every supplied Prisma client URL requires litigation_runtime without URL disclosure',
      );
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
    const runtimeLoginAfter = (
      await admin.query<{ rolcanlogin: boolean }>(
        `SELECT rolcanlogin FROM pg_roles WHERE rolname='litigation_runtime'`,
      )
    ).rows[0]?.rolcanlogin;
    if (runtimeLoginAfter !== runtimeLoginBefore) {
      await admin.query(
        runtimeLoginBefore
          ? 'ALTER ROLE litigation_runtime LOGIN'
          : 'ALTER ROLE litigation_runtime NOLOGIN',
      );
    }
    await admin.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
