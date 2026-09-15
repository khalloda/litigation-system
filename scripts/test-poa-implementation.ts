import 'dotenv/config';
import { createDatabaseClient } from '../src/lib/db';
import { prepareHearingLifecycleActors } from './lib/hearing-lifecycle-actors';
import { mutatePoa, readPoaMutation } from '../src/lib/poa-mutations';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { randomUUID } from 'node:crypto';
import { provePoaSession } from './lib/poa-session-proof';
import { provePoaSearch } from './lib/poa-search-proof';
import { provePoaAdversarial } from './lib/poa-adversarial-proof';
import { provePoaImplementation } from './lib/poa-implementation-proof';
import { createHash } from 'node:crypto';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { adminEditState } from './lib/admin-edit-state';
import { poaEditSql, assertPoaEditBoundary } from './lib/poa-edit-checkpoint';

async function main() {
  const output = resolve(process.env.POA_TEST_OUTPUT ?? 'test-results/poa-' + Date.now());
  mkdirSync(output, { recursive: true });
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(files.status, 0);
  const source = [...new Set(files.stdout.split('\0').filter(Boolean))].sort();
  writeFileSync(
    join(output, 'executed-source.json'),
    JSON.stringify(
      source.map((path) => ({
        path,
        bytes: readFileSync(path).length,
        sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      })),
      null,
      2,
    ),
  );
  for (const path of source.filter((p) => /^(src|scripts|prisma)\//u.test(p))) {
    const to = join(output, 'executed', path + '.txt');
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(path, to);
  }
  const canonical = process.argv.includes('--canonical');
  await withIsolatedPostgres(async (initialFixture) => {
    let fixture = initialFixture;
    if (canonical) {
      const migrationUrl = await fixture.createDatabase('litigation_task45_canonical_prestate'),
        url = new URL(fixture.runtimeUrl);
      url.pathname = new URL(migrationUrl).pathname;
      fixture = {
        ...fixture,
        migrationUrl,
        runtimeUrl: url.toString(),
        environment: {
          ...fixture.environment,
          MIGRATION_DATABASE_URL: migrationUrl,
          DATABASE_URL: url.toString(),
        },
      };
      await migrateFixtureThroughCheckpoint(migrationUrl, 69, fixture.environment);
    }

    Object.assign(process.env, fixture.environment);
    if (!canonical) await fixture.restoreProject();
    const profile = canonical ? 'canonical-clean-replay' : 'historical-full-state-upgrade';
    writeFileSync(
      join(output, 'isolation.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          container: fixture.container,
          cluster: fixture.clusterId,
          sourceCluster: fixture.sourceClusterId,
          port: new URL(fixture.migrationUrl).port,
          image: fixture.imageId,
        },
        null,
        2,
      ),
    );
    const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
      withApprovedMigrationClient(fn, { databaseUrl: fixture.migrationUrl });
    if (canonical) {
      const runtime = createDatabaseClient(fixture.runtimeUrl);
      try {
        await prepareHearingLifecycleActors(fixture, runtime, true);
      } finally {
        await runtime.$disconnect();
      }
    }
    const setup = spawnSync(
      'docker',
      [
        'exec',
        '-i',
        '-e',
        'PGOPTIONS=-c default_transaction_read_only=on',
        fixture.container,
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'litigation',
        '-d',
        new URL(fixture.migrationUrl).pathname.slice(1),
      ],
      { input: readFileSync('docker/postgres/verify.sql'), encoding: 'utf8', windowsHide: true },
    );
    writeFileSync(join(output, 'setup69.log'), setup.stdout + setup.stderr);
    assert.equal(setup.status, 0);
    assert.equal((setup.stdout.match(/PASS/gu) ?? []).length, 15);
    const baseline = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/check-db.ts', '--profile=' + profile],
      {
        env: { ...fixture.environment, PGOPTIONS: '-c default_transaction_read_only=on' },
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 32000000,
      },
    );
    writeFileSync(join(output, 'invariants69.log'), baseline.stdout + baseline.stderr);
    assert.equal(baseline.status, 0, 'accepted 69 baseline');
    await inspect(async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      const before = await adminEditState(db);
      writeFileSync(join(output, 'copy-before.json'), JSON.stringify(before, null, 2));
      await assert.rejects(
        db
          .query(
            poaEditSql().replace(
              /COMMIT;\s*$/u,
              () => "DO $$ BEGIN RAISE EXCEPTION 'TEST ONLY late POA failure'; END $$; COMMIT;",
            ),
          )
          .catch((e) => {
            console.log(
              JSON.stringify({
                message: e.message,
                position: e.position,
                internalPosition: e.internalPosition,
                internalQuery: e.internalQuery,
                where: e.where,
              }),
            );
            throw e;
          }),
        /TEST ONLY late POA failure/u,
      );
      await db.query('ROLLBACK');
      assert.deepEqual(await adminEditState(db), before);
      console.log('PASS POA late migration failure rolls back complete state');
    });
    const deploy = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/run-prisma-migration.ts', 'deploy'],
      { env: fixture.environment, encoding: 'utf8', windowsHide: true, maxBuffer: 32000000 },
    );
    writeFileSync(
      join(output, 'deploy.log'),
      (deploy.stdout + deploy.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
    );
    assert.equal(deploy.status, 0, 'isolated deploy');
    await inspect(async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      await assertPoaEditBoundary(db, profile);
      const before = JSON.parse(readFileSync(join(output, 'copy-before.json'), 'utf8')) as Awaited<
        ReturnType<typeof adminEditState>
      >;
      const after = await adminEditState(db);
      assert.deepEqual(after.sequences, before.sequences, 'all 48 complete old sequence vectors');
      for (const table of before.tables) {
        if (
          table.schema === 'public' &&
          ['powers_of_attorney', 'power_of_attorney_lawyers'].includes(table.table)
        ) {
          const columns =
            table.table === 'powers_of_attorney'
              ? ['row_version', 'is_archived']
              : ['is_retired', 'current_order'];
          const row = (
            await db.query(
              `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(payload,chr(10) ORDER BY payload COLLATE "C"),''),'UTF8')),'hex') digest FROM (SELECT (to_jsonb(p)-$1::text[])::text payload FROM public.${table.table} p) x`,
              [columns],
            )
          ).rows[0];
          assert.deepEqual(
            row,
            { count: table.count, digest: table.digest },
            'exact old POA column projection',
          );
        } else if (!['audit_event_fields', '_prisma_migrations'].includes(table.table))
          assert.deepEqual(
            after.tables.find((t) => t.schema === table.schema && t.table === table.table),
            table,
            'unchanged prior table ' + table.schema + '.' + table.table,
          );
      }
      writeFileSync(
        join(output, 'upgrade-preservation.json'),
        JSON.stringify(
          {
            oldTables: before.tables.length,
            oldSequences: before.sequences.length,
            allOldPoaColumns: true,
            allOtherPriorTables: true,
            onlyExcluded: [
              'migration ledger new record',
              'four reviewed audit field classifications',
            ],
            after,
          },
          null,
          2,
        ),
      );
    });
    const check = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/check-db.ts', '--profile=' + profile],
      {
        env: fixture.environment,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 32000000,
      },
    );
    writeFileSync(
      join(output, 'invariants.log'),
      (check.stdout + check.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
    );
    assert.equal(check.status, 0, 'isolated invariants');
    console.log('PASS POA historical migration and invariant checks');
    if (!canonical && !process.argv.includes('--browser-only')) {
      const permissions = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/test-permissions.ts', '--restored-fixture'],
        {
          cwd: process.env.POA_CHECK_MIRROR ?? process.cwd(),
          env: fixture.environment,
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 32000000,
        },
      );
      writeFileSync(join(output, 'permissions.log'), permissions.stdout + permissions.stderr);
      assert.equal(permissions.status, 0, 'isolated permission suite');
    }
    const runtime = createDatabaseClient(fixture.runtimeUrl);
    try {
      if (!canonical) await prepareHearingLifecycleActors(fixture, runtime);
      const beforeDirect = await withApprovedMigrationClient(adminEditState, {
        databaseUrl: fixture.migrationUrl,
      });
      for (const sql of [
        "SELECT nextval('public.powers_of_attorney_id_seq')",
        "SELECT nextval('public.power_of_attorney_lawyers_id_seq')",
        'SELECT _migration.poa_edit_aggregate(1)',
        'SELECT * FROM _migration.poa_edit_submission',
        "INSERT INTO powers_of_attorney(principal_name) VALUES('TEST ONLY denied direct insertion') RETURNING id",
      ])
        await assert.rejects(runtime.$queryRawUnsafe(sql), /42501|permission denied/u);
      assert.deepEqual(
        await withApprovedMigrationClient(adminEditState, { databaseUrl: fixture.migrationUrl }),
        beforeDirect,
      );
      console.log(
        'PASS runtime direct insert, private helper/receipt and both sequence bypasses denied without state changes',
      );
      if (!canonical) {
        if (!process.argv.includes('--browser-only')) {
          await provePoaImplementation(fixture, runtime, output);
          await provePoaAdversarial(fixture, runtime, output);
          await provePoaSearch(fixture, runtime, output);
          await provePoaSession(fixture, runtime, output);
        }
      } else {
        const admin = (await lifecycleSessions(runtime)).find(
            (s) => s.user.role === 'Administrator' && s.user.username !== 'KHelmy',
          )!,
          dep = { database: runtime, auditMetadata: createMaintenanceAuditMetadata() };
        const created = await mutatePoa(
          admin,
          'create',
          {
            operation: 'create',
            id: null,
            version: null,
            submission: randomUUID(),
            values: {
              principal_name: 'TEST ONLY canonical',
              copies_count: 0,
              show_on_poa_report: null,
            },
            lawyers: [],
            facts: null,
          },
          dep,
        );
        const lifecycleReceipts: { request: unknown; result: unknown }[] = [];
        for (const operation of ['archive', 'restore'] as const) {
          const state = await readPoaMutation(admin, operation, created.id, runtime);
          const request = {
            operation,
            id: created.id,
            version: state.record!.version,
            submission: randomUUID(),
            values: {},
            lawyers: null,
            facts: state.facts,
          };
          lifecycleReceipts.push({
            request,
            result: await mutatePoa(admin, operation, request, dep),
          });
        }
        const restored = await withApprovedMigrationClient(adminEditState, {
          databaseUrl: fixture.migrationUrl,
        });
        for (const [index, operation] of (['archive', 'restore'] as const).entries())
          assert.deepEqual(
            await mutatePoa(admin, operation, lifecycleReceipts[index]!.request, dep),
            lifecycleReceipts[index]!.result,
          );
        assert.deepEqual(
          await withApprovedMigrationClient(adminEditState, { databaseUrl: fixture.migrationUrl }),
          restored,
        );
        console.log(
          'PASS exact old archive/restore receipts after later lifecycle state do not replay writes',
        );
        console.log('PASS canonical 1–69→70 empty boundary and native create/archive/restore');
      }
      if (process.argv.includes('--browser') || process.argv.includes('--browser-only')) {
        const browserModule = './test-poa-browser.mjs';
        const { provePoaBrowser } = await import(browserModule);
        await provePoaBrowser(fixture, output);
      }
      const finalCheck = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/check-db.ts', '--profile=' + profile],
        { env: fixture.environment, encoding: 'utf8', windowsHide: true, maxBuffer: 32000000 },
      );
      writeFileSync(join(output, 'invariants-final.log'), finalCheck.stdout + finalCheck.stderr);
      assert.equal(finalCheck.status, 0, 'final disposable invariants');
    } finally {
      await runtime.$disconnect();
    }
  });
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
