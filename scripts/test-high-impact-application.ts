import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
  assertRealApplicationRequest,
  assertRealPreconditions,
  realApplicationConfirmation,
  REAL_MIGRATION_SHA256,
  REAL_PROTECTED_SHA256,
  type RealPreconditions,
} from './lib/high-impact-real-gate';
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
  const revision = 'a'.repeat(40);
  const real = { expectedRevision: revision, confirmation: realApplicationConfirmation(revision) };
  assert.deepEqual(
    parseHighImpactApplicationArgs([
      '--apply-real',
      `--expected-revision=${revision}`,
      `--confirm=${real.confirmation}`,
    ]),
    { apply: false, real },
  );
  assert.throws(() => parseHighImpactApplicationArgs(['--apply-real']), /exactly three/);
  assert.throws(
    () =>
      assertRealApplicationRequest(
        { ...real, confirmation: 'yes' },
        process.env['MIGRATION_DATABASE_URL'],
      ),
    /confirmation/,
  );
  assert.throws(
    () => assertRealApplicationRequest(real, 'postgresql://litigation@localhost:5433/other'),
    /target database/,
  );
  assert.throws(
    () =>
      assertRealApplicationRequest(
        real,
        'postgresql://litigation@localhost:5433/litigation?options=unsafe',
      ),
    /URL options/,
  );
  assertRealApplicationRequest(real, process.env['MIGRATION_DATABASE_URL']);
  const gate: RealPreconditions = {
    branch: 'main',
    head: revision,
    remote: revision,
    remoteHead: revision,
    clean: true,
    gitIdle: true,
    database: 'litigation',
    cluster: '123',
    containerCluster: '123',
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
    workbookSha256: '0dc23134639e0bc6477fe1f39613bd7575b56cdcd0085d2f2831a96693f2376b',
    workbookBytes: 172273,
    planSha256: '4a1fee01d011b960f48204102e28ed71731a5f1d682006141749460828e33da3',
    unresolved: 0,
    invariantCount: 92,
  };
  assertRealPreconditions(gate, revision);
  for (const key of Object.keys(gate) as (keyof RealPreconditions)[]) {
    if (['cluster', 'containerCluster'].includes(key)) continue;
    const bad = {
      ...gate,
      [key]:
        key === 'clean' || key === 'gitIdle' || key === 'superuser'
          ? false
          : key === 'migrationDefects'
            ? ['fixture']
            : key === 'branch'
              ? 'other'
              : null,
    };
    assert.throws(
      () => assertRealPreconditions(bad as RealPreconditions, revision),
      /real application refused/,
    );
  }
  assert.throws(
    () => assertRealPreconditions({ ...gate, containerCluster: '999' }, revision),
    /target differs/,
  );
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
function checkWithoutWorkbook(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/test-high-impact-workbook-absence.ts'],
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
  assert.equal(result.status, 0, result.stdout + result.stderr);
  console.log(result.stdout.trim());
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
          assert.equal(
            applicationDigest(
              (await applicationInventory(fixture)).filter(
                (row) =>
                  !(
                    row.schema === 'public' &&
                    ['audit_events', '_prisma_migrations'].includes(row.table)
                  ) &&
                  !(row.schema === '_migration' && row.table === 'client_branch_compatibility'),
              ),
            ),
            REAL_PROTECTED_SHA256,
            'real gate protected pre-application snapshot changed',
          );
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
          const permanent = async () => {
            assert.ok((await verifyHighImpactApplication(fixture)).state);
          };
          const human = async () => {
            await fixture.query('SELECT audit_set_human_context(2)');
            await fixture.query('SELECT audit_set_event_context($1,$2,$3,NULL,$4,$5)', [
              randomUUID(),
              randomUUID(),
              randomUUID(),
              'task35b-operational-positive',
              'desktop',
            ]);
          };
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
          const rejectAuthorizedChange = async (
            label: string,
            sql: string,
            values: unknown[],
            expected: RegExp,
          ): Promise<void> => {
            await fixture.query('BEGIN');
            try {
              await human();
              await fixture.query('SET LOCAL ROLE litigation_runtime');
              await fixture.query(sql, values);
              await fixture.query('RESET ROLE');
              await assert.rejects(permanent, expected, label);
            } finally {
              await fixture.query('ROLLBACK');
            }
            console.log(`PASS disposable authorized rejection: ${label}`);
          };
          await rejectChange(
            'unrelated client/branch pair',
            'UPDATE matters SET client_id=142 WHERE legacy_id=425',
            /client\/branch pair/,
          );
          await rejectChange(
            'unaudited released-row mutation',
            "ALTER TABLE matters DISABLE TRIGGER audit_event_capture; UPDATE matters SET notes_1='__task35b_unaudited_fixture__' WHERE legacy_id=467",
            /lacks its audit event/,
          );
          await rejectChange(
            'extra D19 compatibility evidence',
            "INSERT INTO _migration.client_branch_compatibility(client_id,branch_id,authority) VALUES(197,1,'D19-existing-association')",
            /D19 exact relationship inventory/,
          );
          await rejectChange(
            'missing D19 compatibility evidence',
            "ALTER TABLE _migration.client_branch_compatibility DISABLE TRIGGER client_branch_compatibility_append_only; DELETE FROM _migration.client_branch_compatibility WHERE authority='D19-existing-association' AND ctid=(SELECT min(ctid) FROM _migration.client_branch_compatibility WHERE authority='D19-existing-association'); ALTER TABLE _migration.client_branch_compatibility ENABLE TRIGGER client_branch_compatibility_append_only",
            /D19 exact relationship inventory/,
          );
          await rejectChange(
            'wrong-parent D19 compatibility evidence',
            "ALTER TABLE _migration.client_branch_compatibility DISABLE TRIGGER client_branch_compatibility_append_only; UPDATE _migration.client_branch_compatibility p SET client_id=(SELECT min(c.id) FROM clients c WHERE NOT EXISTS(SELECT 1 FROM _migration.client_branch_compatibility x WHERE x.client_id=c.id AND x.branch_id=p.branch_id)) WHERE p.authority='D19-existing-association' AND p.ctid=(SELECT min(ctid) FROM _migration.client_branch_compatibility WHERE authority='D19-existing-association'); ALTER TABLE _migration.client_branch_compatibility ENABLE TRIGGER client_branch_compatibility_append_only",
            /D19 exact relationship inventory/,
          );
          await rejectChange(
            'duplicate D19 compatibility evidence',
            "INSERT INTO _migration.client_branch_compatibility(client_id,branch_id,authority) SELECT client_id,branch_id,authority FROM _migration.client_branch_compatibility WHERE authority='D19-existing-association' LIMIT 1",
            /duplicate key/,
          );
          await rejectChange(
            'wrongly attributed D19 compatibility event',
            "ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_change; UPDATE audit_events SET actor_id=2,actor_key_snapshot='system_authentication' WHERE id=(SELECT registration_event_id FROM _migration.client_branch_compatibility WHERE authority='D19-existing-association' ORDER BY client_id,branch_id LIMIT 1); ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_change",
            /altered compatibility event|incorrect compatibility event actor/,
          );
          await rejectChange(
            'incorrect Sigma parent with branch cleared',
            'UPDATE matters SET client_id=142,branch_id=NULL WHERE legacy_id=425',
            /values differ|unauthorized released-row mutation/,
          );
          await rejectChange(
            'incorrect Alpha parent',
            'UPDATE matters SET client_id=197,branch_id=NULL WHERE legacy_id=1549',
            /values differ|unauthorized released-row mutation/,
          );
          await rejectChange(
            'generic court substitution',
            'UPDATE hearings SET court_id=123 WHERE legacy_id=15778',
            /values differ|unauthorized released-row mutation/,
          );
          await rejectChange(
            'invented court ID',
            'UPDATE hearings SET court_id=32000 WHERE legacy_id=15766',
            /foreign key/,
          );
          await rejectChange(
            'intentional NULL branch replaced',
            'UPDATE matters SET client_id=111,branch_id=1 WHERE legacy_id=87',
            /values differ|unauthorized released-row mutation/,
          );
          await rejectChange(
            'weekday circuit changed',
            "UPDATE hearings SET circuit='جنح العجوزة' WHERE legacy_id=2396",
            /values differ|unauthorized released-row mutation/,
          );
          await rejectChange(
            'Masters parent changed',
            'UPDATE matters SET client_id=197 WHERE legacy_id=1777',
            /values differ|unauthorized released-row mutation/,
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
            /missing D41 hearing/,
          );
          await rejectChange(
            'stale staged hearing evidence',
            `UPDATE staging."الجلسات" SET "ملاحظات"='__task35b_stale_fixture__' WHERE "ID_hearings"='7072'`,
            /stale quarantine\/source evidence|immutable/,
          );
          const otherReviewedHearing = (
            await fixture.query<{ id: number; legacy_id: number }>(`
              SELECT h.id,h.legacy_id
              FROM _migration.high_impact_resolution r
              JOIN hearings h ON h.id=r.hearing_id
              WHERE r.hearing_id IS NOT NULL AND NOT r.d41_note
              ORDER BY r.review_id
              LIMIT 1`)
          ).rows;
          assert.equal(otherReviewedHearing.length, 1);
          await rejectAuthorizedChange(
            'a different released historical hearing cannot become a thirteenth D41 destination',
            'UPDATE hearings SET matter_id=NULL,notes=$1 WHERE id=$2',
            [D41_NOTE, otherReviewedHearing[0]!.id],
            /additional hearing would receive D41 note/,
          );
          await rejectAuthorizedChange(
            'an approved D41 note destination cannot be removed',
            'UPDATE hearings SET notes=NULL WHERE legacy_id=7072',
            [],
            /D41 note text changed/,
          );
          await rejectAuthorizedChange(
            'an approved D41 destination cannot move to a different matter',
            'UPDATE hearings SET matter_id=(SELECT id FROM matters WHERE legacy_id=468) WHERE legacy_id=7072',
            [],
            /D41 hearing belongs to wrong matter/,
          );
          await rejectAuthorizedChange(
            'the approved D41 court cannot change',
            'UPDATE matters SET court_id=123 WHERE legacy_id=467',
            [],
            /D41 matter court changed/,
          );
          assert.deepEqual(await applicationInventory(fixture), after);
          console.log(
            'PASS all adversarial transactions rolled back without changing the proven disposable result',
          );
          await fixture.query('BEGIN');
          await human();
          await fixture.query(
            "SELECT audit_write_event('report_executed','succeeded',NULL,NULL,NULL,ARRAY[]::text[],'{}','{}',NULL,NULL,'fixture:later-report','{}',NULL,'{}')",
          );
          await permanent();
          await fixture.query('COMMIT');
          const released = (
            await fixture.query<{ id: number }>(
              'SELECT matter_id id FROM _migration.high_impact_resolution WHERE matter_id IS NOT NULL ORDER BY review_id LIMIT 1',
            )
          ).rows[0]!.id;
          await fixture.query('BEGIN');
          await human();
          await fixture.query('SET LOCAL ROLE litigation_runtime');
          await fixture.query(
            "UPDATE matters SET notes_1='__task35b_authorized_operational_fixture__' WHERE id=$1",
            [released],
          );
          await fixture.query('RESET ROLE');
          await permanent();
          await fixture.query('COMMIT');
          await fixture.query('BEGIN');
          await human();
          await fixture.query('SET LOCAL ROLE litigation_runtime');
          const nativeMatter = await fixture.query<{ id: number }>(
            "INSERT INTO matters(subject,updated_at) VALUES('__task35b_native_operational_fixture__',CURRENT_TIMESTAMP) RETURNING id",
          );
          const nativeHearing = await fixture.query<{ id: number; legacy_id: number | null }>(
            'INSERT INTO hearings(matter_id,notes,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING id,legacy_id',
            [nativeMatter.rows[0]!.id, D41_NOTE],
          );
          await fixture.query('RESET ROLE');
          assert.equal(nativeHearing.rows[0]!.legacy_id, null);
          assert.equal(
            (
              await fixture.query<{ count: number }>(
                'SELECT count(*)::integer count FROM _migration.high_impact_resolution WHERE hearing_id=$1',
                [nativeHearing.rows[0]!.id],
              )
            ).rows[0]!.count,
            0,
          );
          await permanent();
          await fixture.query('COMMIT');
          await fixture.query(
            'CREATE TABLE public.task35b_future_unrelated_fixture(id integer PRIMARY KEY)',
          );
          await permanent();
          await fixture.query(
            "INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES(gen_random_uuid()::text,repeat('a',64),'20990101000000_unrelated_fixture',now(),now(),1)",
          );
          await permanent();
          const exactD41 = (
            await fixture.query<{
              legacyId: number;
              legacyMatterId: number;
              note: string | null;
              court: string | null;
            }>(`
              SELECT h.legacy_id "legacyId",m.legacy_id "legacyMatterId",h.notes note,c.label_ar court
              FROM _migration.high_impact_resolution r
              JOIN hearings h ON h.id=r.hearing_id
              JOIN matters m ON m.id=h.matter_id
              LEFT JOIN lookup_court c ON c.id=h.court_id
              WHERE r.d41_note
              ORDER BY r.review_id`)
          ).rows;
          assert.equal(exactD41.length, 12);
          assertD41Destinations(exactD41);
          checkWithoutWorkbook(fixtureUrl.toString());
          console.log(
            'PASS later semantic event, authorized audited edit, native matter/hearing with shared note, exact D41 set, unrelated table/migration and workbook-absent permanent verification',
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
