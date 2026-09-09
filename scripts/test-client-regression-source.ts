import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ClientBase } from 'pg';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import {
  withApprovedMigrationClient,
  withRestrictedRuntimeClient,
} from './lib/migration-principal';
import {
  assertCurrentClientSource,
  prepareCurrentClientSource,
} from './lib/client-regression-source';
import { CLIENT_CONTACT_MIGRATION } from './lib/client-contact-checkpoint';
import { STAFF_MIGRATION } from './lib/staff-roster-checkpoint';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { initialiseActors } from './test-client-contacts';

function child(args: string[], environment: NodeJS.ProcessEnv, label: string, refusal?: RegExp) {
  const result = spawnSync(process.execPath, args, {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...environment,
      PRISMA_SCHEMA_ENGINE_BINARY: resolve(
        'node_modules/@prisma/engines/schema-engine-windows.exe',
      ),
    },
  });
  const output = (result.stdout + result.stderr)
    .replace(/\$argon2(?:id|i|d)\$[^\s"']+/gu, '[redacted password hash]')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted database URL]');
  if (process.env['CLIENT_SOURCE_EVIDENCE_DIR'])
    writeFileSync(resolve(process.env['CLIENT_SOURCE_EVIDENCE_DIR'], label + '.log'), output);
  console.log(output);
  assert.equal(result.status, refusal ? 1 : 0, label);
  if (refusal) assert.match(output, refusal, label);
}

async function refusals(db: ClientBase, checkpoint: 61 | 62) {
  const before = await staffReadOnlyState(db);
  const migration = checkpoint === 61 ? STAFF_MIGRATION : CLIENT_CONTACT_MIGRATION;
  const probes: [string, string][] = [
    [
      'unfinished current ledger',
      `UPDATE _prisma_migrations SET finished_at=NULL WHERE migration_name='${migration}'`,
    ],
    [
      'wrong current checksum',
      `UPDATE _prisma_migrations SET checksum=repeat('0',64) WHERE migration_name='${migration}'`,
    ],
    [
      'wrong earlier checksum',
      `UPDATE _prisma_migrations SET checksum=repeat('0',64) WHERE migration_name=(SELECT min(migration_name) FROM _prisma_migrations)`,
    ],
    [
      'unsupported later checkpoint',
      `INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES(gen_random_uuid()::text,repeat('0',64),now(),'20260910120000_unapproved_fixture',now(),1)`,
    ],
    [
      'hybrid source payload',
      `UPDATE staging."Contacts" SET src_file='__TASK41_TEST_ONLY__' WHERE src_record_key=(SELECT min(src_record_key) FROM staging."Contacts")`,
    ],
  ];
  if (checkpoint === 61)
    probes.push([
      'partial boundary without ledger',
      'ALTER TABLE clients ADD COLUMN row_version bigint',
    ]);
  else
    probes.push(
      [
        'unfinished staff prerequisite',
        `UPDATE _prisma_migrations SET finished_at=NULL WHERE migration_name='${STAFF_MIGRATION}'`,
      ],
      [
        'wrong staff checksum',
        `UPDATE _prisma_migrations SET checksum=repeat('0',64) WHERE migration_name='${STAFF_MIGRATION}'`,
      ],
      [
        'missing relationship constraint',
        'ALTER TABLE clients DROP CONSTRAINT clients_same_client_main_contact',
      ],
      [
        'disabled evidence guard',
        'ALTER TABLE _migration.client_contact_client_import DISABLE TRIGGER immutable_rows',
      ],
      [
        'unknown boundary function',
        "CREATE FUNCTION public.client_contact_unknown() RETURNS void LANGUAGE sql AS 'SELECT'",
      ],
      [
        'partial boundary columns',
        'ALTER TABLE clients RENAME COLUMN application_modified_at TO unreviewed_fixture_column',
      ],
    );
  for (const [label, sql] of probes) {
    await db.query('BEGIN');
    try {
      const mutation = await db.query(sql);
      if (/^(?:UPDATE|INSERT)/u.test(sql)) assert.equal(mutation.rowCount, 1);
      await assert.rejects(assertCurrentClientSource(db), label);
    } finally {
      await db.query('ROLLBACK');
    }
    assert.deepEqual(
      await staffReadOnlyState(db),
      before,
      'Negative probe changed source: ' + label,
    );
    assert.equal(await assertCurrentClientSource(db), checkpoint);
    console.log(`PASS source ${checkpoint} refuses ${label}, exact rollback`);
  }
}

/** Durable test data uses trusted gateways only, and keeps imported evidence
 * untouched. The resulting operational state becomes the regression source. */
async function operationalChanges(migrationUrl: string, runtimeUrl: string) {
  await withApprovedMigrationClient(
    async (owner) => {
      assert.equal(await assertCurrentClientSource(owner), 62);
      const before = await staffReadOnlyState(owner);
      const accounts = (
        await owner.query(
          "SELECT id FROM user_accounts WHERE role_code='Administrator' AND is_enabled",
        )
      ).rows;
      assert.equal(accounts.length, 1);
      await withRestrictedRuntimeClient(runtimeUrl, async (db) => {
        await db.query('BEGIN');
        try {
          await db.query('SELECT audit_set_human_context($1)', [accounts[0].id]);
          await db.query(
            "SELECT audit_set_event_context($1::uuid,$2::uuid,$3::uuid,NULL,'Task41 current source fixture','system')",
            [randomUUID(), randomUUID(), randomUUID()],
          );
          const imported = (
            await db.query(
              'SELECT id,row_version,client_id FROM contacts WHERE legacy_id IS NOT NULL ORDER BY id LIMIT 1',
            )
          ).rows;
          assert.equal(imported.length, 1);
          const contact = imported[0];
          const parent = (
            await db.query('SELECT id,row_version FROM clients WHERE id=$1', [contact.client_id])
          ).rows;
          assert.equal(parent.length, 1);
          await db.query('SELECT client_contact_update($1,$2,$3,$4::jsonb)', [
            'clients',
            parent[0].id,
            parent[0].row_version,
            JSON.stringify({ documents_location: '__TASK41_TEST_ONLY_EDIT__' }),
          ]);
          await db.query('SELECT client_contact_update($1,$2,$3,$4::jsonb)', [
            'contacts',
            contact.id,
            contact.row_version,
            JSON.stringify({ job_title: '__TASK41_TEST_ONLY_EDIT__' }),
          ]);
          const native = (
            await db.query("SELECT client_contact_create('clients',NULL,$1,$2::jsonb) id", [
              randomUUID(),
              JSON.stringify({ name_ar: '__TASK41_CURRENT_SOURCE_TEST_ONLY__' }),
            ])
          ).rows[0].id;
          const child = (
            await db.query("SELECT client_contact_create('contacts',$1,$2,$3::jsonb) id", [
              native,
              randomUUID(),
              JSON.stringify({ contact_name: '__TASK41_CONTACT_TEST_ONLY__' }),
            ])
          ).rows[0].id;
          await db.query("SELECT client_contact_set_archived('contacts',$1,1,true)", [child]);
          await db.query("SELECT client_contact_set_archived('clients',$1,1,true)", [native]);
          await db.query("SELECT client_contact_set_archived('clients',$1,2,false)", [native]);
          await db.query('COMMIT');
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        }
      });
      assert.equal(await assertCurrentClientSource(owner), 62);
      const after = await staffReadOnlyState(owner);
      const frozen = (state: typeof before) =>
        state.tables.filter(
          (t) =>
            t.schema === '_migration' &&
            t.table.startsWith('client_contact_') &&
            t.table !== 'client_contact_submission',
        );
      assert.deepEqual(frozen(after), frozen(before), 'Every imported snapshot remains byte-exact');
      for (const table of ['clients', 'contacts']) {
        const old = before.tables.find((t) => t.schema === 'public' && t.table === table)!;
        const current = after.tables.find((t) => t.schema === 'public' && t.table === table)!;
        assert.equal(current.count, old.count + 1);
        assert.notEqual(current.digest, old.digest);
      }
      console.log(
        'PASS 62 source after imported client/contact edits, native additions, archive/restore and a separately archived contact; immutable evidence unchanged',
      );
    },
    { databaseUrl: migrationUrl },
  );
}

async function main() {
  assert.ok(
    process.argv.length === 2 ||
      (process.argv.length === 3 && process.argv[2] === '--entry-points'),
  );
  const npm = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  await withIsolatedPostgres(async (fixture) => {
    await fixture.restoreProject();
    const inspect = <T>(work: (db: ClientBase) => Promise<T>) =>
      withApprovedMigrationClient(work, { databaseUrl: fixture.migrationUrl });
    await inspect(async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      assert.equal(
        await assertCurrentClientSource(db),
        61,
        'This proof requires an actual historical61 source',
      );
      await refusals(db, 61);
    });
    child([npm, 'run', 'test:staff-read-only'], fixture.environment, 'staff-normal61');
    let applications = 0;
    assert.equal(
      await prepareCurrentClientSource(fixture.migrationUrl, fixture.environment, () => {
        applications++;
        child(
          ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', 'deploy'],
          fixture.environment,
          'current-upgrade61',
        );
      }),
      61,
    );
    assert.equal(applications, 1);
    await inspect((db) => refusals(db, 62));
    await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
    await operationalChanges(fixture.migrationUrl, fixture.runtimeUrl);
    const before = await inspect(staffReadOnlyState);
    assert.equal(
      await prepareCurrentClientSource(fixture.migrationUrl, fixture.environment, () => {
        applications++;
        assert.fail('Complete62 path must never invoke migration deployment');
      }),
      62,
    );
    assert.equal(applications, 1);
    assert.deepEqual(
      await inspect(staffReadOnlyState),
      before,
      'Complete62 preparation changed rows, ledger, boundary, sequences or catalog',
    );
    child(
      [
        'node_modules/tsx/dist/cli.mjs',
        'scripts/check-db.ts',
        '--profile=historical-full-state-upgrade',
      ],
      { ...fixture.environment, PGOPTIONS: '-c default_transaction_read_only=on' },
      'current-source116',
    );
    child([npm, 'run', 'test:staff-read-only'], fixture.environment, 'staff-normal62');
    child(
      [npm, 'run', 'test:staff-read-only', '--', '--project-read-only'],
      fixture.environment,
      'staff-forced-read-only62',
    );
    child(
      [
        'node_modules/tsx/dist/cli.mjs',
        'scripts/test-client-contacts.ts',
        '--historical-acceptance',
      ],
      fixture.environment,
      'historical-proof-refuses62',
      /Historical client upgrade proof requires the exact untouched migration61 source/u,
    );
    if (process.argv.includes('--entry-points'))
      for (const command of ['test:client-regressions', 'test:audit', 'test:audit-events'])
        child([npm, 'run', command], fixture.environment, 'entry-' + command.replaceAll(':', '-'));
    assert.deepEqual(
      await inspect(staffReadOnlyState),
      before,
      'Normal commands changed the selected source',
    );
    console.log(
      'PASS current source61/62 proof, zero second migration invocation and unchanged source after normal commands',
    );
  });
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Current source proof failed');
  process.exitCode = 1;
});
