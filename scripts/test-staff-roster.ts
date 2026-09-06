import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  withIsolatedPostgres,
  assertIsolatedTestCluster,
  type IsolatedPostgres,
} from './lib/isolated-postgres-fixture';
import {
  staffBoundaryApplied,
  staffMigrationSql,
  STAFF_FIELD_RULES,
} from './lib/staff-roster-checkpoint';
import {
  withApprovedMigrationClient,
  createApprovedMigrationPrismaClient,
} from './lib/migration-principal';
import { setApprovedAccountPassword } from '../src/lib/auth/service';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { applicationInventory, type InventoryRow } from './lib/high-impact-application-state';
import type { ClientBase } from 'pg';
import { assertStaffBoundary } from './lib/staff-roster-structure';
import { authStructureFailures, authDataFailures } from './lib/auth-structure';
import { runtimeRoleBoundaryFailures } from './lib/audit-structure';
import { auditEventStructureFailures } from './lib/audit-event-structure';
import { proveStaffMutations } from './lib/staff-roster-fixture-tests';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';

async function fullInventory(db: ClientBase): Promise<InventoryRow[]> {
  const rows = await applicationInventory(db);
  // applicationInventory intentionally excludes these release ledgers when
  // comparing an application batch. A full-state clone must include them.
  for (const table of [
    'high_impact_application',
    'high_impact_resolution',
    'high_impact_row_proof',
  ]) {
    const row = (
      await db.query<{ count: number; digest: string }>(`
      SELECT count(*)::integer count,
        encode(sha256(convert_to(coalesce(string_agg(payload,E'\\n' ORDER BY payload COLLATE "C"),''),'UTF8')),'hex') digest
      FROM (SELECT to_jsonb(t)::text payload FROM _migration.${table} t) x
    `)
    ).rows[0]!;
    rows.push({ schema: '_migration', table, ...row });
  }
  return rows.sort((a, b) => `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`));
}

function runIsolated(script: string, args: string[], environment: NodeJS.ProcessEnv): number {
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', script, ...args], {
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, 'isolated child could not start');
  // Never report a credential-bearing URL, even if a child error contains one.
  const output = (result.stdout + result.stderr).replace(
    /postgres(?:ql)?:\/\/[^\s"']+/gu,
    '[redacted database URL]',
  );
  console.log(output.trim());
  assert.notEqual(result.status, null, 'isolated child was interrupted');
  return result.status!;
}

async function proveMigrationRollback(
  fixture: IsolatedPostgres,
  template = 'litigation',
): Promise<void> {
  const profile = template === 'litigation' ? 'historical' : 'canonical';
  const url = await fixture.createDatabase(
    'litigation_task40a_invalid_prestate_' + profile,
    template,
  );
  await withApprovedMigrationClient(
    async (db) => {
      await assertIsolatedTestCluster(db, new URL(url), fixture.environment);
      const original = await fullInventory(db);
      const sql = staffMigrationSql();
      assert.match(sql, /COMMIT;\s*$/u);
      await assert.rejects(
        db.query(sql.replace(/COMMIT;\s*$/u, 'SELECT 1/0;\nCOMMIT;\n')),
        /division by zero/u,
      );
      await db.query('ROLLBACK');
      assert.deepEqual(
        await fullInventory(db),
        original,
        'Late migration failure changed prestate',
      );
      assert.equal(await staffBoundaryApplied(db), false);
      await db.query('BEGIN');
      await db.query('SELECT audit_set_migration_context()');
      await db.query(
        "SELECT audit_set_event_context($1::uuid,$2::uuid,$3::uuid,NULL,'Task40a invalid migration fixture','system')",
        [randomUUID(), randomUUID(), randomUUID()],
      );
      assert.equal(
        (
          await db.query(
            "UPDATE people SET name_en='__TASK40A_INVALID_PRESTATE' WHERE id=(SELECT min(id) FROM people WHERE is_staff AND NOT is_application_native)",
          )
        ).rowCount,
        1,
      );
      await db.query('COMMIT');
      const invalid = await fullInventory(db);
      await assert.rejects(db.query(sql), /Original roster identity\/state differs/u);
      await db.query('ROLLBACK');
      assert.deepEqual(
        await fullInventory(db),
        invalid,
        'Rejected invalid prestate was silently corrected',
      );
      assert.equal(await staffBoundaryApplied(db), false);
      console.log(
        'PASS ' +
          profile +
          ' migration atomicity: forced late failure leaves zero Phase 1 surfaces; invalid prestate is rejected without repair or data change',
      );
    },
    { databaseUrl: url },
  );
}

async function proveMigrationPreservation(db: ClientBase, before: InventoryRow[]): Promise<void> {
  const after = await fullInventory(db);
  const replaced = new Set([
    'people',
    'person_name_alias',
    'lookup_team',
    'audit_event_fields',
    '_prisma_migrations',
  ]);
  const unchanged = before.filter((row) => !(row.schema === 'public' && replaced.has(row.table)));
  assert.deepEqual(
    after.filter((row) =>
      unchanged.some((old) => old.schema === row.schema && old.table === row.table),
    ),
    unchanged,
    'Migration changed an out-of-scope table',
  );
  for (const [table, removed] of [
    [
      'people',
      ['row_version', 'alias_epoch', 'application_modified_at', 'application_modified_by'],
    ],
    ['person_name_alias', ['is_retired', 'retirement_reason']],
    ['lookup_team', ['row_version']],
  ] as const) {
    const actual = (
      await db.query(
        `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(value,E'\\n' ORDER BY value COLLATE "C"),''),'UTF8')),'hex') digest FROM (SELECT (to_jsonb(t)-$1::text[])::text value FROM public.${table} t) x`,
        [removed],
      )
    ).rows[0];
    const prior = before.find((row) => row.schema === 'public' && row.table === table)!;
    assert.deepEqual(
      actual,
      { count: prior.count, digest: prior.digest },
      'Migration changed original roster bytes/timestamps',
    );
  }
  const oldFields = (
    await db.query(
      `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text COLLATE "C"),''),'UTF8')),'hex') digest FROM audit_event_fields t WHERE NOT ((entity_table,field_name) IN (${STAFF_FIELD_RULES.map(([table, field]) => `('${table}','${field}')`).join(',')}))`,
    )
  ).rows[0];
  const prior = before.find(
    (row) => row.schema === 'public' && row.table === 'audit_event_fields',
  )!;
  assert.deepEqual(
    oldFields,
    { count: prior.count, digest: prior.digest },
    'Original audit policy bytes changed',
  );
  console.log(
    'PASS complete migration delta: every pre-existing table, row value and timestamp unchanged except the explicit ledger/new audit-field additions',
  );
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  assert.ok(
    process.argv.length === 3 &&
      [
        '--isolation-proof',
        '--canonical-checkpoint-proof',
        '--profile-acceptance',
        '--mutation-proof',
        '--regression-proof',
        '--audit-regression-proof',
        '--audit-events-regression-proof',
      ].includes(mode!),
  );
  const fullChecks = mode === '--profile-acceptance';
  const upgrade = fullChecks || mode === '--mutation-proof';
  const before = await withApprovedMigrationClient(
    async (db) => {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        return await fullInventory(db);
      } finally {
        await db.query('ROLLBACK');
      }
    },
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  await withIsolatedPostgres(async (fixture) => {
    await fixture.restoreProject();
    if (mode === '--audit-regression-proof' || mode === '--audit-events-regression-proof') {
      for (const script of mode === '--audit-events-regression-proof'
        ? ['scripts/test-audit-events.ts']
        : ['scripts/test-audit.ts', 'scripts/test-audit-events.ts']) {
        console.log('BEGIN isolated existing audit regression: ' + script);
        assert.equal(
          runIsolated(script, [], fixture.environment),
          0,
          'Existing audit regression failed: ' + script,
        );
      }
      return;
    }
    if (mode === '--regression-proof') {
      for (const script of [
        'scripts/test-auth.ts',
        'scripts/test-permissions.ts',
        'scripts/test-user-management.ts',
      ]) {
        console.log('BEGIN isolated existing regression: ' + script);
        assert.equal(
          runIsolated(script, [], fixture.environment),
          0,
          'Existing regression failed: ' + script,
        );
      }
      return;
    }
    await withApprovedMigrationClient(
      async (db) => {
        assert.deepEqual(await fullInventory(db), before);
        const migrations = (
          await db.query<{ n: number }>(
            'SELECT count(*)::integer n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
          )
        ).rows[0]?.n;
        assert.equal(migrations, 60);
        console.log(
          `PASS isolated full-state restore equals migration-60 source inventory: all ${before.length} tables`,
        );
      },
      { databaseUrl: fixture.migrationUrl },
    );
    if (mode === '--profile-acceptance') {
      console.log('BEGIN historical migration-60 permanent suite (93 required checks)');
      assert.equal(
        runIsolated('scripts/check-db.ts', ['--profile=historical-full-state-upgrade'], {
          ...fixture.environment,
          PGOPTIONS: '-c default_transaction_read_only=on',
        }),
        0,
        'Historical pre-upgrade permanent suite failed',
      );
    }
    if (mode === '--profile-acceptance' || mode === '--mutation-proof')
      await proveMigrationRollback(fixture);
    if (upgrade) {
      const historicalDeploy = runIsolated(
        'scripts/run-prisma-migration.ts',
        ['deploy'],
        fixture.environment,
      );
      assert.equal(historicalDeploy, 0, 'historical migration 61 failed');
      await withApprovedMigrationClient(
        async (db) => {
          await proveMigrationPreservation(db, before);
          await assertStaffBoundary(db, 'historical-full-state-upgrade');
          assert.deepEqual(await authStructureFailures(db), []);
          assert.deepEqual(await authDataFailures(db), []);
          assert.deepEqual(await runtimeRoleBoundaryFailures(db), []);
          assert.deepEqual(await auditEventStructureFailures(db), []);
          console.log(
            'Historical boundary: ' +
              JSON.stringify(
                (
                  await db.query(
                    'SELECT profile,(SELECT count(*) FROM _migration.staff_roster_person WHERE NOT is_application_native)::integer imported_people,(SELECT count(*) FROM _migration.staff_roster_alias WHERE is_imported)::integer imported_aliases FROM _migration.staff_roster_boundary',
                  )
                ).rows,
              ),
          );
        },
        { databaseUrl: fixture.migrationUrl },
      );
      if (mode === '--mutation-proof' || mode === '--profile-acceptance')
        await proveStaffMutations(
          fixture.migrationUrl,
          fixture.runtimeUrl,
          fixture.environment,
          'historical-full-state-upgrade',
        );
      if (fullChecks) {
        console.log(
          'BEGIN historical migration-61 permanent suite (93 original plus every new check)',
        );
        assert.equal(
          runIsolated('scripts/check-db.ts', ['--profile=historical-full-state-upgrade'], {
            ...fixture.environment,
            PGOPTIONS: '-c default_transaction_read_only=on',
          }),
          0,
          'Historical post-upgrade permanent suite failed',
        );
      }
    }
    if (mode === '--canonical-checkpoint-proof' || upgrade) {
      let canonicalTemplate: string | undefined;
      if (mode === '--profile-acceptance' || mode === '--mutation-proof') {
        canonicalTemplate = 'litigation_task40a_canonical_prestate';
        const prestate = await fixture.createDatabase(canonicalTemplate);
        await migrateFixtureThroughCheckpoint(prestate, 60, fixture.environment);
        await proveMigrationRollback(fixture, canonicalTemplate);
        const hybridUrl = await fixture.createDatabase(
          'litigation_task40a_hybrid_prestate',
          canonicalTemplate,
        );
        const sourceRow = await withApprovedMigrationClient(
          async (db) =>
            (
              await db.query<{ payload: string }>(
                'SELECT to_jsonb(t)::text payload FROM staging.lawyers t ORDER BY src_record_key LIMIT 1',
              )
            ).rows[0]!.payload,
          {
            databaseUrl: fixture.migrationUrl,
            clientConfig: { options: '-c default_transaction_read_only=on' },
          },
        );
        await withApprovedMigrationClient(
          async (db) => {
            await assertIsolatedTestCluster(db, new URL(hybridUrl), fixture.environment);
            assert.equal(
              (
                await db.query(
                  'INSERT INTO staging.lawyers SELECT * FROM jsonb_populate_record(NULL::staging.lawyers,$1::jsonb)',
                  [sourceRow],
                )
              ).rowCount,
              1,
            );
            const beforeHybrid = await fullInventory(db);
            await assert.rejects(
              db.query(staffMigrationSql()),
              /Historical staged source rows or durable identities differ/u,
            );
            await db.query('ROLLBACK');
            assert.deepEqual(await fullInventory(db), beforeHybrid);
            assert.equal(await staffBoundaryApplied(db), false);
            console.log(
              'PASS hybrid profile rejection: one copied historical source row cannot masquerade as canonical or historical acceptance; no partial boundary or repair',
            );
          },
          { databaseUrl: hybridUrl },
        );
      }
      const cleanUrl = await fixture.createDatabase(
        'litigation_task40a_canonical_checkpoint',
        canonicalTemplate,
      );
      const runtime = new URL(fixture.runtimeUrl);
      runtime.pathname = new URL(cleanUrl).pathname;
      const environment = {
        ...fixture.environment,
        MIGRATION_DATABASE_URL: cleanUrl,
        DATABASE_URL: runtime.toString(),
      };
      const deploy = runIsolated('scripts/run-prisma-migration.ts', ['deploy'], environment);
      assert.equal(deploy, 0, 'canonical migrations failed');
      assert.equal(
        runIsolated('scripts/run-prisma-migration.ts', ['status'], environment),
        0,
        'canonical migration status failed',
      );
      await withApprovedMigrationClient(
        async (db) => {
          if (upgrade) {
            await assertStaffBoundary(db, 'canonical-clean-replay');
            assert.deepEqual(await authStructureFailures(db), []);
            assert.deepEqual(await authDataFailures(db), []);
            const runtimeState = (
              await db.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='litigation_runtime'")
            ).rows[0];
            console.log('Canonical migration-owned runtime login: ' + JSON.stringify(runtimeState));
            assert.deepEqual(
              runtimeState,
              { rolcanlogin: true },
              'Prepared isolated runtime login state changed unexpectedly',
            );
            assert.deepEqual(await runtimeRoleBoundaryFailures(db), []);
            assert.deepEqual(await auditEventStructureFailures(db), []);
          }
          const state = (
            await db.query(`SELECT
          (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::integer migrations,
          (SELECT count(*) FROM people)::integer people,
          (SELECT count(*) FROM person_name_alias)::integer aliases,
          (SELECT count(*) FROM quarantine.review_value WHERE answered_at IS NOT NULL)::integer reviewed_values,
          (SELECT count(*) FROM quarantine.finding WHERE answered_at IS NOT NULL)::integer reviewed_findings,
          (SELECT count(*) FROM _migration.high_impact_application)::integer high_impact_releases`)
          ).rows[0];
          console.log('Canonical checkpoint inventory: ' + JSON.stringify(state));
        },
        { databaseUrl: cleanUrl },
      );
      if (fullChecks || mode === '--mutation-proof' || mode === '--canonical-checkpoint-proof') {
        const owner = await createApprovedMigrationPrismaClient(cleanUrl);
        try {
          await setApprovedAccountPassword('KHelmy', randomBytes(36).toString('base64url'), {
            database: owner,
            auditMetadata: createMaintenanceAuditMetadata(),
          });
        } finally {
          await owner.$disconnect();
        }
        if (mode === '--mutation-proof' || mode === '--profile-acceptance')
          await proveStaffMutations(
            cleanUrl,
            runtime.toString(),
            environment,
            'canonical-clean-replay',
          );
      }
      if (fullChecks || mode === '--canonical-checkpoint-proof') {
        console.log('BEGIN canonical permanent suite with disposable initialized Administrator');
        assert.equal(
          runIsolated('scripts/check-db.ts', ['--profile=canonical-clean-replay'], {
            ...environment,
            PGOPTIONS: '-c default_transaction_read_only=on',
          }),
          0,
          'Canonical permanent suite failed',
        );
      }
    }
  });
}

main().catch((error: unknown) => {
  const failure = error as { code?: string; message?: string };
  console.error(
    (failure.message ?? 'staff-roster fixture failed safely').replace(
      /postgres(?:ql)?:\/\/[^\s"']+/gu,
      '[redacted database URL]',
    ),
  );
  if (failure.code) console.error('Failure code: ' + failure.code);
  process.exitCode = 1;
});
