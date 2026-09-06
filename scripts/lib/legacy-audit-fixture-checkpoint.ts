import assert from 'node:assert/strict';
import type { Client } from 'pg';
import { spawnSync } from 'node:child_process';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture';
import { verifyHighImpactApplication } from './high-impact-application';
import {
  applicationInventory,
  tableName,
  identifier,
  CREATED_TABLES,
  type ApplicationState,
} from './high-impact-application-state';

async function owned(db: Client, url: URL, pattern: RegExp): Promise<void> {
  assert.match(url.pathname, pattern);
  assert.equal(
    (await db.query('SELECT current_database() name')).rows[0]?.name,
    url.pathname.slice(1),
  );
  await assertIsolatedTestCluster(db, url);
}

/** Restore only the exact session-owned legacy audit regression checkpoint.
 * Its historical partition is independently recorded by the approved 3.5B
 * ledger. This is not a production rollback or a Phase 1 acceptance profile. */
export async function prepareHistoricalAuditFixture(db: Client, url: URL): Promise<void> {
  await owned(db, url, /^\/litigation_task33a_history_fixture_[0-9_]+$/u);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::integer n FROM pg_tables WHERE schemaname IN ('public','staging','quarantine','_migration')",
      )
    ).rows[0]?.n,
    0,
    'Legacy fixture target must be newly created and empty',
  );
  const source = new URL(url);
  source.pathname = '/litigation';
  const state: ApplicationState = await withApprovedMigrationClient(
    async (original) => {
      await assertIsolatedTestCluster(original, source);
      const { state } = await verifyHighImpactApplication(original);
      assert.ok(state, 'Historical audit regression requires the exact applied full-state source');
      assert.equal(
        (await original.query('SELECT to_regclass($1) value', ['_migration.staff_roster_boundary']))
          .rows[0]?.value,
        null,
        'Legacy fixture source must still be at migration 60',
      );
      const container = process.env['TASK40A_ISOLATED_CONTAINER']!;
      const command = (args: string[], input?: Buffer): Buffer => {
        const result = spawnSync('docker', ['exec', ...(input ? ['-i'] : []), container, ...args], {
          input,
          windowsHide: true,
          maxBuffer: 256 * 1024 * 1024,
        });
        assert.equal(result.error, undefined);
        assert.equal(
          result.status,
          0,
          'Owned legacy fixture restore failed; no guard override: ' +
            result.stderr
              .toString()
              .split(/\r?\n/u)
              .filter((line) => line.includes('ERROR:'))
              .join('\n')
              .replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted database URL]'),
        );
        return result.stdout;
      };
      const omitted = [
        ...CREATED_TABLES,
        'audit_events',
        '_prisma_migrations',
        '_migration.high_impact_application',
        '_migration.high_impact_resolution',
        '_migration.high_impact_row_proof',
        '_migration.client_branch_compatibility',
      ];
      const restoreSection = (section: string) => {
        let dump = command([
          'pg_dump',
          '-U',
          'litigation',
          '-d',
          'litigation',
          '--format=custom',
          '--section=' + section,
          ...omitted.map((table) => '--exclude-table-data=' + table),
        ]);
        try {
          command(
            ['pg_restore', '-U', 'litigation', '-d', url.pathname.slice(1), '--exit-on-error'],
            dump,
          );
        } finally {
          dump.fill(0);
          dump = Buffer.alloc(0);
        }
      };
      // Populate the exact recorded historical partition before installing
      // post-data constraints/triggers. Nothing is deleted and no preservation
      // guard is disabled. The two mandatory profiles still use complete state.
      for (const section of ['pre-data', 'data']) restoreSection(section);
      for (const table of [...CREATED_TABLES, 'audit_events', '_prisma_migrations']) {
        const ids: (number | string)[] =
          table === 'audit_events'
            ? state.audit_event_ids
            : state.created_rows.filter((row) => row.table === table).map((row) => row.id);
        const predicate =
          table === '_prisma_migrations'
            ? "migration_name <> '20260904180000_prepare_high_impact_application'"
            : 'NOT(id=ANY($1::bigint[]))';
        const rows: { payload: string }[] = (
          await original.query<{ payload: string }>(
            `SELECT to_jsonb(t)::text payload FROM ${tableName(table)} t WHERE ${predicate}`,
            table === '_prisma_migrations' ? [] : [ids],
          )
        ).rows;
        const columns = (
          await db.query<{ name: string }>(
            "SELECT attname name FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped AND attgenerated='' ORDER BY attnum",
            [tableName(table)],
          )
        ).rows
          .map((row) => identifier(row.name))
          .join(',');
        assert.ok(columns);
        if (rows.length)
          assert.equal(
            (
              await db.query(
                `INSERT INTO ${tableName(table)} (${columns}) SELECT ${columns} FROM jsonb_populate_recordset(NULL::${tableName(table)},$1::jsonb)`,
                ['[' + rows.map((row) => row.payload).join(',') + ']'],
              )
            ).rowCount,
            rows.length,
          );
      }
      restoreSection('post-data');
      return state;
    },
    {
      databaseUrl: source.toString(),
      clientConfig: { options: '-c default_transaction_read_only=on' },
    },
  );
  await db.query('BEGIN');
  try {
    await db.query(`DROP TRIGGER matters_client_branch_compatibility ON matters`);
    for (const table of [
      'lookup_client_branch',
      'lookup_court',
      'matters',
      'hearings',
      'matter_lawyers',
      'matter_parties',
      'matter_party_roles',
      'hearing_attendees',
    ])
      await db.query(`DROP TRIGGER zz_task35b_row_proof ON ${table}`);
    await db.query(`DROP TABLE _migration.high_impact_row_proof; DROP TABLE _migration.high_impact_resolution; DROP TABLE _migration.high_impact_application; DROP TABLE _migration.client_branch_compatibility;
      DROP FUNCTION _migration.capture_high_impact_row_proof(); DROP FUNCTION _migration.check_high_impact_completeness(); DROP FUNCTION _migration.audit_branch_compatibility(); DROP FUNCTION _migration.enforce_client_branch_compatibility(); DROP FUNCTION _migration.refuse_high_impact_evidence_change()`);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::integer n FROM _prisma_migrations WHERE migration_name='20260904180000_prepare_high_impact_application'",
        )
      ).rows[0]?.n,
      0,
    );
    const excluded = (row: { schema: string; table: string }) =>
      row.table === '_prisma_migrations' ||
      (row.schema === '_migration' && row.table === 'client_branch_compatibility');
    assert.deepEqual(
      (await applicationInventory(db)).filter((row) => !excluded(row)),
      state.before_inventory.filter((row) => !excluded(row)),
      'Legacy regression is not the exact independently recorded pre-application partition',
    );
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
