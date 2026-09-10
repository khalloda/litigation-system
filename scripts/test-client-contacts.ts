import 'dotenv/config';
import assert from 'node:assert/strict';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import {
  withApprovedMigrationClient,
  createApprovedMigrationPrismaClient,
} from './lib/migration-principal';
import { randomBytes } from 'node:crypto';
import { setApprovedAccountPassword, changeOwnPassword } from '../src/lib/auth/service';
import { createDatabaseClient } from '../src/lib/db';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import type { ClientBase } from 'pg';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clientContactMigrationSql,
  clientContactBoundaryApplied,
  assertClientContactBoundary,
  CLIENT_CONTACT_FIELDS,
} from './lib/client-contact-checkpoint';
import { proveClientContactMutations } from './lib/client-contact-fixture-tests';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { assertStaffCheckpoint } from './lib/staff-roster-checkpoint';
import { loadAccounting } from './lib/gate4-database';
import { prepareCurrentClientSource } from './lib/client-regression-source';
import {
  proveClientContactPrestateRefusals,
  proveClientContactMalformedBoundary,
} from './lib/client-contact-state-tests';

export async function initialiseActors(migrationUrl: string, runtimeUrl: string) {
  const owner = await createApprovedMigrationPrismaClient(migrationUrl);
  const runtime = createDatabaseClient(runtimeUrl);
  try {
    for (const username of ['KHelmy', 'MHussien', 'IHamdy', 'SKhattab']) {
      const temporary = randomBytes(32).toString('base64url');
      await setApprovedAccountPassword(username, temporary, {
        database: owner,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
      const account = await owner.userAccount.findFirstOrThrow({
        where: { username },
        select: { id: true, sessionVersion: true },
      });
      assert.equal(
        await changeOwnPassword(
          {
            accountId: account.id,
            sessionVersion: account.sessionVersion,
            currentPassword: temporary,
            newPassword: randomBytes(32).toString('base64url'),
          },
          { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
        ),
        'changed',
      );
    }
  } finally {
    await runtime.$disconnect();
    await owner.$disconnect();
  }
}

function child(script: string, args: string[], environment: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', script, ...args], {
    windowsHide: true,
    encoding: 'utf8',
    env: {
      ...environment,
      PRISMA_SCHEMA_ENGINE_BINARY: resolve(
        'node_modules/@prisma/engines/schema-engine-windows.exe',
      ),
    },
    maxBuffer: 32 * 1024 * 1024,
  });
  console.log(
    (result.stdout + result.stderr)
      .replace(/\$argon2(?:id|i|d)\$[^\s"']+/gu, '[redacted password hash]')
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted database URL]'),
  );
  assert.equal(result.status, 0, 'Isolated command failed: ' + script + ' ' + args.join(' '));
}

/** Independent source oracle: exact values and actual stored ID associations. */
export async function proveClientImportSource(db: ClientBase) {
  await db.query("SET TIME ZONE 'UTC'");
  for (const [table, source, key, fields] of [
    [
      'clients',
      'العملاء',
      'ID_client',
      {
        name_ar: 'العميل',
        name_en: 'Client_en',
        full_name: 'Full_name',
        cash_or_probono: 'Cash/probono',
        status: 'Status',
        poa_location: 'مكان التوكيل',
        documents_location: 'مكان المستندات',
        legacy_contact_lawyer_raw: 'contactLawyer',
      },
    ],
    [
      'contacts',
      'Contacts',
      'ID',
      {
        contact_name: 'Contact1',
        full_name: 'Full_name',
        job_title: 'Job Title',
        email: 'E-mail Address',
        business_phone: 'Business Phone',
        home_phone: 'Home Phone',
        mobile_phone: 'Mobile Phone',
        fax_number: 'Fax Number',
        address: 'Address',
        city: 'City',
        state_province: 'State/Province',
        zip_postal_code: 'ZIP/Postal Code',
        country_region: 'Country/Region',
        web_page: 'Web Page',
      },
    ],
  ] as const) {
    const expected = (
      await db.query(
        `SELECT i->>'count' count,i->>'digest' digest FROM _migration.high_impact_application a CROSS JOIN LATERAL jsonb_array_elements(a.before_inventory) i WHERE i->>'schema'='public' AND i->>'table'=$1`,
        [table],
      )
    ).rows;
    assert.equal(expected.length, 1);
    const actual = (
      await db.query(
        `SELECT count(*)::text count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text COLLATE "C"),''),'UTF8')),'hex') digest FROM public.${table} t`,
      )
    ).rows;
    assert.deepEqual(
      actual,
      expected,
      `${table}: exact original associations and initial full values`,
    );
    const mismatch = (
      await db.query(
        `SELECT count(*)::integer n FROM public.${table} t FULL JOIN staging."${source}" s ON t.legacy_id=s."${key}"::integer WHERE t.id IS NULL OR s.src_record_key IS NULL OR ${Object.entries(
          fields,
        )
          .map(([target, original]) => `t.${target} IS DISTINCT FROM s."${original}"`)
          .join(' OR ')}`,
      )
    ).rows[0].n;
    assert.equal(mismatch, 0, `${table}: all source values match exactly`);
  }
  assert.equal(
    (
      await db.query(
        `SELECT count(*)::integer n FROM clients c JOIN staging."العملاء" s ON s."ID_client"::integer=c.legacy_id WHERE c.client_start IS DISTINCT FROM CASE WHEN s."clientStart" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN s."clientStart"::timestamp::date END OR c.client_end IS DISTINCT FROM CASE WHEN s."clientEnd" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN s."clientEnd"::timestamp::date END OR c.branch_id IS NOT NULL OR c.legacy_branch_raw IS NOT NULL OR c.contact_person_id IS NOT NULL`,
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        `SELECT count(*)::integer n FROM contacts c JOIN staging."Contacts" s ON s."ID"::integer=c.legacy_id JOIN clients p ON p.id=c.client_id WHERE p.legacy_id IS DISTINCT FROM s."clientID"::integer`,
      )
    ).rows[0].n,
    0,
  );
  console.log(
    'PASS all 318/188 original identities, frozen full values, source fields, dates and imported ownership',
  );
}

async function reproduce(db: ClientBase) {
  const original = await staffReadOnlyState(db);
  const contact = (await db.query('SELECT id,client_id FROM contacts ORDER BY id LIMIT 1')).rows[0];
  const other = (
    await db.query('SELECT id FROM clients WHERE id<>$1 ORDER BY id LIMIT 1', [contact.client_id])
  ).rows[0].id;
  for (const [label, sql, parameters] of [
    [
      'cross-client main contact accepted',
      'UPDATE clients SET contact_person_id=$1 WHERE id=$2',
      [contact.id, other],
    ],
    [
      'imported ownership overwrite accepted',
      'UPDATE contacts SET client_id=$1 WHERE id=$2',
      [other, contact.id],
    ],
    [
      'imported raw evidence overwrite accepted',
      "UPDATE clients SET legacy_contact_lawyer_raw='__TASK41_TEST_ONLY__' WHERE id=$1",
      [other],
    ],
  ] as const) {
    await db.query('BEGIN');
    try {
      await db.query('SELECT audit_set_migration_context()');
      await db.query(
        "SELECT audit_set_event_context(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),NULL,'task41-gap-fixture','system')",
      );
      assert.equal((await db.query(sql, [...parameters])).rowCount, 1);
      console.log('REPRODUCED migration-61 gap: ' + label);
    } finally {
      await db.query('ROLLBACK');
    }
  }
  const after = await staffReadOnlyState(db);
  assert.deepEqual(
    after.tables,
    original.tables,
    'gap reproductions leave all fixture rows unchanged',
  );
  console.log(
    'PASS baseline gap rollback: all fixture rows unchanged (sequence gaps are expected)',
  );
}

async function main() {
  assert.ok(
    [
      '--baseline-gaps',
      '--migration-smoke',
      '--sql-smoke',
      '--profile-acceptance',
      '--historical-acceptance',
      '--regression-proof',
      '--audit-regression-proof',
      '--audit-events-regression-proof',
    ].includes(process.argv[2]!),
  );
  const acceptance = process.argv[2]!.includes('acceptance');
  const currentRegression = process.argv[2]!.includes('regression-proof');
  const suite = process.argv[3];
  assert.ok(
    process.argv.length === 3 ||
      (process.argv.length === 4 &&
        process.argv[2] === '--regression-proof' &&
        [
          '--suite=authentication',
          '--suite=accounts',
          '--suite=staff',
          '--suite=audit',
          '--suite=gate4',
        ].includes(suite!)),
  );
  const selected = (name: string) => suite === undefined || suite === '--suite=' + name;
  await withIsolatedPostgres(async (fixture) => {
    await fixture.restoreProject();
    if (!currentRegression)
      await withApprovedMigrationClient(
        async (db) => {
          await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
          assert.equal(
            await assertStaffCheckpoint(db, 'historical-full-state-upgrade'),
            61,
            'Historical client upgrade proof requires the exact untouched migration61 source',
          );
          await proveClientImportSource(db);
          if (process.argv[2] === '--baseline-gaps') await reproduce(db);
          if (process.argv[2] === '--sql-smoke') {
            try {
              await db.query(
                readFileSync(
                  'prisma/migrations/20260909120000_client_contact_database_boundary/migration.sql',
                  'utf8',
                ),
              );
            } catch (error) {
              await db.query('ROLLBACK');
              throw error;
            }
          }
        },
        { databaseUrl: fixture.migrationUrl },
      );
    if (process.argv[2] === '--migration-smoke') {
      const result = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', 'deploy'],
        {
          windowsHide: true,
          encoding: 'utf8',
          env: fixture.environment,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      console.log(
        (result.stdout + result.stderr).replace(
          /postgres(?:ql)?:\/\/[^\s"']+/gu,
          '[redacted database URL]',
        ),
      );
      assert.equal(result.status, 0, 'Migration 62 isolated deployment failed');
    }
    if (currentRegression) {
      const sourceCheckpoint = await prepareCurrentClientSource(
        fixture.migrationUrl,
        fixture.environment,
        () => child('scripts/run-prisma-migration.ts', ['deploy'], fixture.environment),
      );
      const all = process.argv[2] === '--regression-proof';
      if (all) {
        for (const script of [
          ...(selected('authentication') ? ['scripts/test-auth.ts'] : []),
          ...(selected('accounts') ? ['scripts/test-user-management.ts'] : []),
        ])
          for (const args of [[], ['--restored-client-fixture']])
            child(script, args, fixture.environment);
        if (selected('authentication'))
          child('scripts/test-permissions.ts', ['--restored-fixture'], fixture.environment);
        if (selected('accounts'))
          child('scripts/test-user-management-ui.ts', [], fixture.environment);
        if (selected('staff')) {
          child('scripts/test-staff-read-only.ts', [], fixture.environment);
          child(
            'scripts/test-staff-mutations.ts',
            ['--restored-client-fixture'],
            fixture.environment,
          );
        }
        if (selected('gate4')) child('scripts/test-gate4.ts', [], fixture.environment);
      }
      if (!all || selected('audit'))
        for (const args of [[], ['--restored-client-fixture']]) {
          if (process.argv[2] !== '--audit-events-regression-proof')
            child(
              'scripts/test-audit.ts',
              [`--profile=current-state-${sourceCheckpoint === 63 ? 63 : 62}`, ...args],
              fixture.environment,
            );
          child('scripts/test-audit-events.ts', args, fixture.environment);
        }
    }
    if (acceptance) {
      const sourceRow = await withApprovedMigrationClient(
        async (db) =>
          (
            await db.query(
              'SELECT to_jsonb(s) value FROM staging."العملاء" s ORDER BY src_record_key LIMIT 1',
            )
          ).rows[0].value as object,
        { databaseUrl: fixture.migrationUrl },
      );
      for (const profile of process.argv[2] === '--historical-acceptance'
        ? ['historical-full-state-upgrade']
        : ['historical-full-state-upgrade', 'canonical-clean-replay']) {
        const migrationUrl =
          profile === 'historical-full-state-upgrade'
            ? fixture.migrationUrl
            : await fixture.createDatabase('litigation_task41_canonical_prestate');
        const runtimeUrl = new URL(fixture.runtimeUrl);
        runtimeUrl.pathname = new URL(migrationUrl).pathname;
        const environment = {
          ...fixture.environment,
          MIGRATION_DATABASE_URL: migrationUrl,
          DATABASE_URL: runtimeUrl.toString(),
        };
        if (profile === 'canonical-clean-replay')
          await migrateFixtureThroughCheckpoint(migrationUrl, 61, environment);
        const before = await withApprovedMigrationClient(
          async (db) => {
            assert.equal(
              await assertStaffCheckpoint(
                db,
                profile as 'historical-full-state-upgrade' | 'canonical-clean-replay',
              ),
              61,
            );
            await proveClientContactPrestateRefusals(db, profile, sourceRow);
            const before = await staffReadOnlyState(db);
            await assert.rejects(
              db.query(
                clientContactMigrationSql().replace(
                  /COMMIT;\s*$/u,
                  () =>
                    "DO $$ BEGIN RAISE EXCEPTION 'Task41 forced late migration failure'; END $$; COMMIT;",
                ),
              ),
              /Task41 forced late migration failure/u,
            );
            await db.query('ROLLBACK');
            assert.deepEqual(
              await staffReadOnlyState(db),
              before,
              'Migration failure must roll back all rows and catalogs',
            );
            assert.equal(await clientContactBoundaryApplied(db), false);
            console.log(
              'PASS ' +
                profile +
                ' migration62 atomicity: forced final failure leaves exact migration61 state',
            );
            return before;
          },
          { databaseUrl: migrationUrl },
        );
        child('scripts/run-prisma-migration.ts', ['deploy'], environment);
        await withApprovedMigrationClient(
          async (db) => {
            await assertClientContactBoundary(db, profile);
            await proveClientContactMalformedBoundary(db, profile);
            const after = await staffReadOnlyState(db);
            const excluded = ['clients', 'contacts', 'audit_event_fields', '_prisma_migrations'];
            assert.deepEqual(
              after.tables.filter(
                (t) =>
                  before.tables.some((b) => b.schema === t.schema && b.table === t.table) &&
                  !(t.schema === 'public' && excluded.includes(t.table)),
              ),
              before.tables.filter((t) => !(t.schema === 'public' && excluded.includes(t.table))),
              'Migration changes no unrelated domain',
            );
            for (const table of ['clients', 'contacts']) {
              const actual = (
                await db.query(
                  `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg((to_jsonb(t)-$1::text[])::text,chr(10) ORDER BY (to_jsonb(t)-$1::text[])::text COLLATE "C"),''),'UTF8')),'hex') digest FROM public.${table} t`,
                  [CLIENT_CONTACT_FIELDS],
                )
              ).rows[0];
              const prior = before.tables.find((t) => t.schema === 'public' && t.table === table)!;
              assert.deepEqual(actual, { count: prior.count, digest: prior.digest });
            }
            console.log(
              'PASS ' +
                profile +
                ' exact original client/contact rows and unrelated domain preservation',
            );
          },
          { databaseUrl: migrationUrl },
        );
        await initialiseActors(migrationUrl, runtimeUrl.toString());
        await proveClientContactMutations(
          migrationUrl,
          runtimeUrl.toString(),
          environment,
          profile,
        );
        await withApprovedMigrationClient(
          async (db) => {
            const accounting = await loadAccounting(db);
            assert.deepEqual(accounting.get('العملاء'), {
              target: profile === 'historical-full-state-upgrade' ? 318 : 0,
              quarantine: 0,
            });
            assert.deepEqual(accounting.get('Contacts'), {
              target: profile === 'historical-full-state-upgrade' ? 188 : 0,
              quarantine: 0,
            });
            console.log(
              'PASS Gate 4 exact imported accounting excludes native creations after legitimate edits',
            );
          },
          { databaseUrl: migrationUrl },
        );
        child('scripts/check-db.ts', ['--profile=' + profile], {
          ...environment,
          PGOPTIONS: '-c default_transaction_read_only=on',
        });
      }
    }
  });
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/test-client-contacts.ts'))
  void main().catch((error: unknown) => {
    console.error(
      (error instanceof Error ? error.message : 'Client/contact fixture failed').replace(
        /postgres(?:ql)?:\/\/[^\s"']+/gu,
        '[redacted database URL]',
      ),
    );
    process.exitCode = 1;
  });
