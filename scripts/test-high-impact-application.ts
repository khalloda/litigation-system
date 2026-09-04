import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import ExcelJS from 'exceljs';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  APPROVED_APPLICATION_FILE,
  assertApprovedApplicationBytes,
  assertD41Destinations,
  D41_COURT,
  D41_DESTINATIONS,
  D41_NOTE,
  parseHighImpactApplicationArgs,
} from './lib/high-impact-application-contract';
import {
  APPLICATION_PATH,
  runHighImpactApplication,
  verifyHighImpactApplication,
} from './lib/high-impact-application';
import { applicationInventory, identifier } from './lib/high-impact-application-state';
import { setMaintenanceAuditContext } from './lib/audit-maintenance-context';
import { applicationDigest } from './lib/high-impact-application-plan';
import {
  assertHighImpactStructure,
  HIGH_IMPACT_MIGRATION,
} from './lib/high-impact-application-structure';
import {
  readGate4RepositoryMigrationInventory,
  reconcileGate4Migrations,
  type Gate4MigrationHistoryRow,
} from './lib/gate4-migrations';

async function staticFixtures(): Promise<void> {
  const bytes = readFileSync(APPLICATION_PATH);
  assertApprovedApplicationBytes(APPROVED_APPLICATION_FILE, bytes);
  assert.throws(() => assertApprovedApplicationBytes('substitute.xlsx', bytes), /filename/);
  assert.throws(
    () => assertApprovedApplicationBytes(APPROVED_APPLICATION_FILE, bytes.subarray(1)),
    /size/,
  );
  const altered = Buffer.from(bytes);
  altered[altered.length - 1] = altered[altered.length - 1]! ^ 1;
  assert.throws(
    () => assertApprovedApplicationBytes(APPROVED_APPLICATION_FILE, altered),
    /SHA-256/,
  );
  // Change only a ZIP local-header timestamp in a disposable memory copy.
  // Workbook XML/decisions remain readable and unchanged; no file is saved.
  const validSubstitute = Buffer.from(bytes);
  assert.equal(validSubstitute.readUInt32LE(0), 0x04034b50);
  validSubstitute[10] = validSubstitute[10]! ^ 1;
  const readable = new ExcelJS.Workbook();
  await readable.xlsx.load(validSubstitute as unknown as ExcelJS.Buffer);
  assert.equal(readable.getWorksheet('__identity')!.rowCount, 389);
  assert.throws(
    () => assertApprovedApplicationBytes(APPROVED_APPLICATION_FILE, validSubstitute),
    /SHA-256/,
  );
  assert.deepEqual(parseHighImpactApplicationArgs([]), { apply: false });
  assert.deepEqual(parseHighImpactApplicationArgs(['--apply']), { apply: true });
  assert.throws(() => parseHighImpactApplicationArgs(['--dry-run', '--apply']), /conflicting/);
  assert.throws(() => parseHighImpactApplicationArgs(['--force']), /unknown/);
  const notes = D41_DESTINATIONS.map(([legacyId, legacyMatterId]) => ({
    legacyId,
    legacyMatterId,
    court: D41_COURT,
    note: D41_NOTE,
  }));
  assertD41Destinations(notes);
  assert.throws(() => assertD41Destinations(notes.slice(1)), /missing/);
  assert.throws(() => assertD41Destinations([...notes, notes[0]!]), /duplicate/);
  assert.throws(
    () => assertD41Destinations(notes.map((row, i) => (i ? row : { ...row, legacyMatterId: 468 }))),
    /wrong matter/,
  );
  assert.throws(
    () =>
      assertD41Destinations(notes.map((row, i) => (i ? row : { ...row, note: `${D41_NOTE} ` }))),
    /note text/,
  );
  assert.throws(
    () =>
      assertD41Destinations(notes.map((row, i) => (i ? row : { ...row, court: 'مصر الجديدة' }))),
    /court/,
  );
  assert.throws(
    () => assertD41Destinations([...notes, { ...notes[0]!, legacyId: 999999 }]),
    /additional/,
  );
  console.log(
    'PASS static artifact/CLI identity and exact D41 set, note, parent and court fixtures',
  );
}

function migrate(databaseUrl: string, command = 'deploy'): void {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', command],
    {
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command}: ${result.stdout}\n${result.stderr}`);
}

function checkDisposableDatabase(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/check-db.ts'],
    {
      env: {
        ...process.env,
        MIGRATION_DATABASE_URL: databaseUrl,
        PGOPTIONS: '-c default_transaction_read_only=on',
      },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `disposable db:check: ${result.stdout}\n${result.stderr}`);
  console.log(
    result.stdout
      .split('\n')
      .filter((line) => /All .* checks passed/.test(line))
      .join('\n'),
  );
}

async function proveProvenance(
  db: Client,
  profile: 'historical-live' | 'canonical-clean-replay',
): Promise<void> {
  const rows = (
    await db.query<Gate4MigrationHistoryRow>(`
    SELECT migration_name "migrationName",checksum,finished_at::text "finishedAt",
      rolled_back_at::text "rolledBackAt",applied_steps_count "appliedStepsCount"
    FROM _prisma_migrations ORDER BY migration_name,started_at,id`)
  ).rows;
  const evidence = reconcileGate4Migrations(rows, await readGate4RepositoryMigrationInventory());
  assert.deepEqual(evidence.defects, []);
  assert.equal(evidence.acceptedDatabaseProfile, profile);
  assert.equal(evidence.totalApplied, 60);
  console.log(`PASS Gate 4 migration provenance: ${profile}, 60 applied, zero pending/failed`);
}

async function proveCanonicalReplay(
  admin: Client,
  source: URL,
  fixtureName: string,
): Promise<void> {
  const name = `${fixtureName}_clean`;
  const url = new URL(source);
  url.pathname = `/${name}`;
  let created = false;
  const rolesBefore = (
    await admin.query('SELECT to_jsonb(r) value FROM pg_roles r ORDER BY rolname')
  ).rows;
  assert.equal(
    (
      await admin.query<{ count: number }>(
        "SELECT count(*)::integer count FROM pg_stat_activity WHERE usename='litigation_runtime'",
      )
    ).rows[0]!.count,
    0,
    'canonical replay refuses to interrupt existing runtime sessions',
  );
  try {
    assert.equal(
      (
        await admin.query<{ count: number }>(
          'SELECT count(*)::integer count FROM pg_database WHERE datname=$1',
          [name],
        )
      ).rows[0]!.count,
      0,
    );
    await admin.query(`CREATE DATABASE ${identifier(name)}`);
    created = true;
    migrate(url.toString());
    migrate(url.toString(), 'status');
    const fixture = new Client({ connectionString: url.toString() });
    await fixture.connect();
    try {
      assert.equal(await assertHighImpactStructure(fixture), true);
      await proveProvenance(fixture, 'canonical-clean-replay');
      assert.equal(
        (
          await fixture.query<{ count: number }>(
            'SELECT count(*)::integer count FROM _migration.client_branch_compatibility',
          )
        ).rows[0]!.count,
        0,
      );
      assert.equal(
        (
          await fixture.query<{ count: number }>(
            'SELECT count(*)::integer count FROM _migration.high_impact_application',
          )
        ).rows[0]!.count,
        0,
      );
      console.log(
        'PASS canonical clean replay creates no high-impact business releases or compatibility guesses',
      );
    } finally {
      await fixture.end();
    }
  } finally {
    if (created) await admin.query(`DROP DATABASE ${identifier(name)}`);
    assert.deepEqual(
      (await admin.query('SELECT to_jsonb(r) value FROM pg_roles r ORDER BY rolname')).rows,
      rolesBefore,
      'canonical replay changed shared role state',
    );
  }
}

async function main(): Promise<void> {
  await staticFixtures();
  const raw = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(raw, 'approved migration URL required');
  const source = new URL(raw);
  assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
  assert.equal(source.port, '5433');
  assert.equal(source.pathname, '/litigation');
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  const fixtureName = `litigation_task35b_fixture_${process.pid}_${Date.now()}`;
  const fixtureUrl = new URL(source);
  fixtureUrl.pathname = `/${fixtureName}`;
  let created = false;
  await withApprovedMigrationClient(
    async (admin) => {
      try {
        assert.equal(
          (
            await admin.query<{ count: number }>(
              'SELECT count(*)::integer count FROM pg_database WHERE datname=$1',
              [fixtureName],
            )
          ).rows[0]!.count,
          0,
        );
        // Established full-state fixture method: test-audit.ts/proveHistoricalUpgrade.
        await admin.query(`CREATE DATABASE ${identifier(fixtureName)} TEMPLATE litigation`);
        created = true;
        // CREATE DATABASE TEMPLATE copies the contents, not database-level ACLs.
        // Reproduce the accepted CONNECT-only runtime boundary on this fixture.
        await admin.query(
          `REVOKE ALL ON DATABASE ${identifier(fixtureName)} FROM PUBLIC,litigation_runtime`,
        );
        await admin.query(
          `GRANT CONNECT ON DATABASE ${identifier(fixtureName)} TO litigation_runtime`,
        );
        console.log(
          'PASS session-created full-state disposable clone; real database is not the write target',
        );
        const migrationFixture = new Client({ connectionString: fixtureUrl.toString() });
        await migrationFixture.connect();
        try {
          const beforeMigration = await applicationInventory(migrationFixture);
          const migrationSql = readFileSync(
            `prisma/migrations/${HIGH_IMPACT_MIGRATION}/migration.sql`,
            'utf8',
          );
          assert.ok(migrationSql.endsWith('COMMIT;\n'));
          await assert.rejects(
            migrationFixture.query(migrationSql.replace(/COMMIT;\n$/, 'SELECT 1/0;\nCOMMIT;\n')),
            /division by zero/,
          );
          await migrationFixture.query('ROLLBACK');
          assert.deepEqual(await applicationInventory(migrationFixture), beforeMigration);
          assert.equal(await assertHighImpactStructure(migrationFixture), false);
          console.log(
            'PASS disposable failed-migration atomicity: all new tables, guards, configuration rows and events rolled back',
          );
        } finally {
          await migrationFixture.end();
        }
        migrate(fixtureUrl.toString());
        migrate(fixtureUrl.toString(), 'status');
        console.log('PASS disposable historical-live migration 60 deployment/status');
        const fixture = new Client({ connectionString: fixtureUrl.toString() });
        await fixture.connect();
        try {
          assert.equal(
            (await fixture.query<{ name: string }>('SELECT current_database() name')).rows[0]!.name,
            fixtureName,
          );
          await proveProvenance(fixture, 'historical-live');
          const before = await applicationInventory(fixture);
          const dryRun = await runHighImpactApplication({ databaseUrl: fixtureUrl.toString() });
          assert.equal(dryRun.mode, 'dry-run');
          assert.deepEqual(await applicationInventory(fixture), before);
          console.log(`PASS exact non-writing disposable plan ${dryRun.digest}`);
          await assert.rejects(
            runHighImpactApplication({
              apply: true,
              databaseUrl: fixtureUrl.toString(),
              forceLateFailure: true,
            }),
            /fixture forced late Task 3.5B failure/,
          );
          assert.deepEqual(await applicationInventory(fixture), before);
          assert.equal((await verifyHighImpactApplication(fixture)).state, null);
          console.log(
            'PASS forced late failure rolls back business, lookups, relationships, ledger and audit events',
          );
          const applied = await runHighImpactApplication({
            apply: true,
            databaseUrl: fixtureUrl.toString(),
          });
          assert.equal(applied.mode, 'applied');
          const first = await verifyHighImpactApplication(fixture);
          console.log('RUN disposable permanent db:check after full application');
          checkDisposableDatabase(fixtureUrl.toString());
          const after = await applicationInventory(fixture);
          const reconciliationDigest = async () =>
            applicationDigest({
              tables: await applicationInventory(fixture),
              batch: (
                await fixture.query(
                  'SELECT to_jsonb(a) value FROM _migration.high_impact_application a ORDER BY application_key',
                )
              ).rows,
              resolutions: (
                await fixture.query(
                  'SELECT to_jsonb(r) value FROM _migration.high_impact_resolution r ORDER BY review_id',
                )
              ).rows,
            });
          const resultDigest = await reconciliationDigest();
          assert.equal(
            (await runHighImpactApplication({ apply: true, databaseUrl: fixtureUrl.toString() }))
              .mode,
            'no-op',
          );
          assert.deepEqual(await applicationInventory(fixture), after);
          assert.deepEqual(await verifyHighImpactApplication(fixture), first);
          assert.equal(await reconciliationDigest(), resultDigest);
          console.log(`PASS identical non-writing full-result reconciliations: ${resultDigest}`);
          console.log(
            `PASS complete disposable application, byte-identical repeat reconciliation and exact no-op: ${applied.digest}`,
          );
          const rejectChange = async (
            label: string,
            sql: string,
            expected: RegExp,
          ): Promise<void> => {
            await fixture.query('BEGIN');
            try {
              await setMaintenanceAuditContext(fixture, 'task-3-5b-adversarial-fixture');
              await assert.rejects(
                async () => {
                  await fixture.query(sql);
                  await verifyHighImpactApplication(fixture);
                },
                expected,
                label,
              );
            } finally {
              await fixture.query('ROLLBACK');
            }
            console.log(`PASS disposable rejection: ${label}`);
          };
          await rejectChange(
            'unrelated client/branch pair',
            'UPDATE matters SET client_id=142 WHERE legacy_id=425',
            /client\/branch pair/,
          );
          await rejectChange(
            'incorrect Sigma parent with branch cleared',
            'UPDATE matters SET client_id=142,branch_id=NULL WHERE legacy_id=425',
            /values differ/,
          );
          await rejectChange(
            'incorrect Alpha parent',
            'UPDATE matters SET client_id=197,branch_id=NULL WHERE legacy_id=1549',
            /values differ/,
          );
          await rejectChange(
            'generic court substitution',
            'UPDATE hearings SET court_id=123 WHERE legacy_id=15778',
            /values differ/,
          );
          await rejectChange(
            'invented court ID',
            'UPDATE hearings SET court_id=32000 WHERE legacy_id=15766',
            /foreign key/,
          );
          await rejectChange(
            'intentional NULL branch replaced',
            'UPDATE matters SET client_id=111,branch_id=1 WHERE legacy_id=87',
            /values differ/,
          );
          await rejectChange(
            'weekday circuit changed',
            "UPDATE hearings SET circuit='جنح العجوزة' WHERE legacy_id=2396",
            /values differ/,
          );
          await rejectChange(
            'D41 note changed',
            'UPDATE hearings SET notes=NULL WHERE legacy_id=7072',
            /values differ/,
          );
          await rejectChange(
            'D41 court changed',
            'UPDATE matters SET court_id=123 WHERE legacy_id=467',
            /values differ/,
          );
          await rejectChange(
            'additional hearing note destination',
            `UPDATE hearings SET notes='${D41_NOTE}' WHERE legacy_id=15778`,
            /values differ/,
          );
          await rejectChange(
            'Masters parent changed',
            'UPDATE matters SET client_id=197 WHERE legacy_id=1777',
            /values differ/,
          );
          await rejectChange(
            'dependent-hearing parent changed',
            'UPDATE hearings SET matter_id=(SELECT id FROM matters WHERE legacy_id=468) WHERE legacy_id=7072',
            /values differ/,
          );
          await rejectChange(
            'immutable hearing source evidence',
            "UPDATE quarantine.hearing_transform SET legacy_hearing_id='999999' WHERE legacy_hearing_id='7072'",
            /immutable/,
          );
          await rejectChange(
            'immutable matter source evidence',
            "UPDATE quarantine.matter_transform SET legacy_matter_id='999999' WHERE legacy_matter_id='467'",
            /immutable/,
          );
          await rejectChange(
            'resolution ledger tampering',
            'UPDATE _migration.high_impact_resolution SET d41_note=false WHERE d41_note',
            /append-only/,
          );
          await rejectChange(
            'application ledger tampering',
            "UPDATE _migration.high_impact_application SET plan_sha256=repeat('0',64)",
            /append-only/,
          );
          await rejectChange(
            'duplicate resolution',
            'INSERT INTO _migration.high_impact_resolution SELECT * FROM _migration.high_impact_resolution LIMIT 1',
            /duplicate key/,
          );
          await rejectChange(
            'disabled compatibility guard',
            'ALTER TABLE matters DISABLE TRIGGER matters_client_branch_compatibility',
            /disabled Task 3.5B guard/,
          );
          await rejectChange(
            'audit evidence deletion',
            "DELETE FROM audit_events WHERE resource_identifier='task-3-5b:application-ledger'",
            /append.only|immutable/,
          );
          await rejectChange(
            'missing audit event detected after guard restoration',
            `ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_change;
             DELETE FROM audit_events WHERE resource_identifier='task-3-5b:application-ledger';
             ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_change`,
            /missing application audit event/,
          );
          await rejectChange(
            'incorrect event actor detected after guard restoration',
            `ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_change;
             UPDATE audit_events SET actor_id=2,actor_key_snapshot='system_authentication'
             WHERE resource_identifier='task-3-5b:application-ledger';
             ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_change`,
            /incorrect application audit attribution/,
          );
          await rejectChange(
            'partial resolution ledger detected after guard restoration',
            `ALTER TABLE _migration.high_impact_resolution DISABLE TRIGGER high_impact_resolution_append_only;
             DELETE FROM _migration.high_impact_resolution WHERE review_id='H-000004';
             ALTER TABLE _migration.high_impact_resolution ENABLE TRIGGER high_impact_resolution_append_only`,
            /partial resolution ledger/,
          );
          await rejectChange(
            'stale staged hearing evidence',
            `UPDATE staging."الجلسات" SET "ملاحظات"='__task35b_stale_fixture__' WHERE "ID_hearings"='7072'`,
            /stale quarantine\/source evidence|immutable/,
          );
          assert.deepEqual(await applicationInventory(fixture), after);
          console.log(
            'PASS all adversarial transactions rolled back without changing the proven disposable result',
          );
        } finally {
          await fixture.end();
        }
        await proveCanonicalReplay(admin, source, fixtureName);
      } finally {
        if (created) {
          // Only the exact database created by this invocation may be removed.
          assert.match(fixtureName, /^litigation_task35b_fixture_[0-9]+_[0-9]+$/);
          await admin.query(`DROP DATABASE ${identifier(fixtureName)}`);
        }
        assert.equal(
          (
            await admin.query<{ count: number }>(
              'SELECT count(*)::integer count FROM pg_database WHERE datname=$1',
              [fixtureName],
            )
          ).rows[0]!.count,
          0,
        );
        console.log('PASS session-created disposable database removed');
      }
    },
    { databaseUrl: adminUrl.toString() },
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
