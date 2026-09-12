import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { assertMatterEditBoundary } from './lib/matter-edit-checkpoint';
import { matterLifecycleSql, matterLifecycleApplied } from './lib/matter-lifecycle-checkpoint';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { matterMigrationCatalog } from './lib/matter-migration-delta';
import { initialiseActors } from './test-client-contacts';
import { createDatabaseClient } from '../src/lib/db';
import { mutateMatter } from '../src/lib/matter-mutations';
import { mutateMatterLifecycle, readMatterLifecycle } from '../src/lib/matter-lifecycle';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { proveMatterLifecycle } from './lib/matter-lifecycle-proof';

async function main() {
  const output = process.env.MATTER_LIFECYCLE_EVIDENCE_DIR;
  assert.ok(output && resolve(output) !== process.cwd());
  mkdirSync(output, { recursive: true });
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(files.status, 0);
  writeFileSync(
    join(output, 'executed-source.json'),
    JSON.stringify(
      [...new Set(files.stdout.split('\0').filter(Boolean))].sort().map((path) => ({
        path,
        sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      })),
      null,
      2,
    ),
  );
  // Retain the exact product/assertion bytes used by this attempt, not just hashes.
  const executed = JSON.parse(readFileSync(join(output, 'executed-source.json'), 'utf8')) as {
    path: string;
    sha256: string;
  }[];
  for (const entry of executed.filter((e) => /^(?:src\/|scripts\/|prisma\/)/u.test(e.path))) {
    const target = join(output, 'executed', entry.path);
    mkdirSync(join(target, '..'), { recursive: true });
    copyFileSync(entry.path, target);
  }
  await withIsolatedPostgres(async (fixture) => {
    writeFileSync(
      join(output, 'isolation.json'),
      JSON.stringify(
        {
          container: fixture.container,
          cluster: fixture.clusterId,
          sourceCluster: fixture.sourceClusterId,
          port: new URL(fixture.runtimeUrl).port,
        },
        null,
        2,
      ),
    );
    const canonical = process.argv.includes('--canonical');
    let ownerUrl = fixture.migrationUrl,
      runtimeUrl = fixture.runtimeUrl;
    if (canonical) {
      ownerUrl = await fixture.createDatabase('litigation_task42_canonical_prestate');
      const u = new URL(runtimeUrl);
      u.pathname = new URL(ownerUrl).pathname;
      runtimeUrl = u.toString();
      await migrateFixtureThroughCheckpoint(ownerUrl, 63, fixture.environment);
    } else await fixture.restoreProject();
    const environment = {
      ...fixture.environment,
      MIGRATION_DATABASE_URL: ownerUrl,
      DATABASE_URL: runtimeUrl,
      PRISMA_SCHEMA_ENGINE_BINARY: resolve(
        'node_modules/@prisma/engines/schema-engine-windows.exe',
      ),
    };
    const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
      withApprovedMigrationClient(
        async (db) => {
          await assertIsolatedTestCluster(db, new URL(ownerUrl), environment);
          return fn(db);
        },
        { databaseUrl: ownerUrl },
      );
    const profile = canonical ? 'canonical-clean-replay' : 'historical-full-state-upgrade';
    const check = (label: string, script: string, args: string[] = []) => {
      const result = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', script, ...args],
        { env: environment, encoding: 'utf8', windowsHide: true, maxBuffer: 32000000 },
      );
      writeFileSync(
        join(output, label + '.log'),
        (result.stdout + result.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
      );
      assert.equal(result.status, 0, label + ' failed; see retained log');
      console.log('PASS ' + label);
    };
    if (!canonical) {
      const source = JSON.parse(
        readFileSync(process.env.MATTER_LIFECYCLE_SOURCE_BASELINE!, 'utf8'),
      );
      assert.deepEqual((await inspect(staffReadOnlyState)).tables, source.tables);
      const restored = await inspect(matterMigrationCatalog);
      assert.deepEqual(
        restored.sequences!.map((x) => ({
          identity: x.identity,
          last_value: x.last_value,
          is_called: x.is_called,
        })),
        source.sequences.map((x: Record<string, unknown>) => ({
          identity: x.schemaname + '.' + x.sequencename,
          last_value: x.last_value,
          is_called: x.is_called,
        })),
      );
      writeFileSync(
        join(output, 'restore-equivalence.json'),
        JSON.stringify(
          {
            tables: source.tables.length,
            portableSequences: restored.sequences!.length,
            logCnt:
              'Portable restore may reset WAL reservations; actual source strict capture retains log_cnt.',
          },
          null,
          2,
        ),
      );
    }
    await migrateFixtureThroughCheckpoint(ownerUrl, 64, environment);
    await inspect((db) => assertMatterEditBoundary(db, profile));
    await initialiseActors(ownerUrl, runtimeUrl);
    const seededRuntime = createDatabaseClient(runtimeUrl);
    const admin = (await lifecycleSessions(seededRuntime)).find(
      (s) => s.user.role === 'Administrator',
    )!;
    const dependencies = {
      database: seededRuntime,
      auditMetadata: createMaintenanceAuditMetadata(),
    };
    const oldNative = await mutateMatter(
      admin,
      'create',
      {
        id: null,
        version: null,
        submission: randomUUID(),
        values: { subject: 'TEST ONLY pre65 native history' },
      },
      dependencies,
    );
    await mutateMatter(
      admin,
      'update',
      {
        id: oldNative.id,
        version: oldNative.version,
        submission: randomUUID(),
        values: { notes_1: 'TEST ONLY pre65 native change' },
      },
      dependencies,
    );
    const before = await inspect(staffReadOnlyState),
      catalogBefore = await inspect(matterMigrationCatalog);
    await inspect(async (db) => {
      await assert.rejects(
        db.query(
          matterLifecycleSql().replace(
            /COMMIT;\s*$/u,
            () =>
              "DO $$ BEGIN RAISE EXCEPTION 'TEST ONLY late lifecycle migration failure'; END $$; COMMIT;",
          ),
        ),
        /TEST ONLY late lifecycle migration failure/u,
      );
      await db.query('ROLLBACK');
    });
    assert.deepEqual(await inspect(staffReadOnlyState), before);
    assert.deepEqual(await inspect(matterMigrationCatalog), catalogBefore);
    console.log('PASS complete lifecycle migration late failure exact rollback');
    check('deploy65', 'scripts/run-prisma-migration.ts', ['deploy']);
    // A repeated deployment is the safe recovery for a lost migration response.
    const deployed = await inspect(staffReadOnlyState);
    check('deploy65-retry', 'scripts/run-prisma-migration.ts', ['deploy']);
    assert.deepEqual(await inspect(staffReadOnlyState), deployed);
    const catalogAfter = await inspect(matterMigrationCatalog);
    const delta: Record<string, unknown> = {};
    for (const kind of Object.keys(catalogBefore)) {
      const old = new Map(catalogBefore[kind]!.map((r) => [r.identity, r])),
        now = new Map(catalogAfter[kind]!.map((r) => [r.identity, r]));
      const added = catalogAfter[kind]!.filter((r) => !old.has(r.identity)),
        removed = catalogBefore[kind]!.filter((r) => !now.has(r.identity)),
        changed = catalogAfter[kind]!.filter(
          (r) => old.has(r.identity) && JSON.stringify(r) !== JSON.stringify(old.get(r.identity)),
        );
      assert.deepEqual(removed, []);
      const expectedAdded: Record<string, string[]> = {
        columns: [
          'public.matters.is_archived',
          ...['singleton', 'initial_value', 'last_value'].map(
            (c) => '_migration.matter_lifecycle_audit_counter.' + c,
          ),
        ],
        indexes: [
          'public.matters_archive_case_id_idx',
          '_migration.matter_lifecycle_audit_counter_pkey',
        ],
        relations: ['_migration.matter_lifecycle_audit_counter'],
        constraints: ['pkey', 'range', 'singleton'].map(
          (c) => '_migration.matter_lifecycle_audit_counter.matter_lifecycle_audit_counter_' + c,
        ),
        triggers: ['matter_lawyers', 'matter_parties', 'matter_party_roles', 'matters'].map(
          (t) => 'public.' + t + '.zy_matter_lifecycle_guard',
        ),
        functions: [],
      };
      if (kind === 'functions') {
        assert.equal(added.length, 6);
        assert.ok(added.every((r) => String(r.identity).includes('.matter_lifecycle_')));
        assert.equal(changed.length, 4);
        assert.deepEqual(changed.map((r) => String(r.identity).split('(')[0]).sort(), [
          '_migration.matter_edit_current_valid',
          '_migration.matter_edit_guard',
          'public.audit_write_event',
          'public.matter_edit_state',
        ]);
      } else {
        assert.deepEqual(
          added.map((r) => r.identity).sort(),
          (expectedAdded[kind] ?? []).sort(),
          kind,
        );
        assert.deepEqual(changed, [], kind);
      }
      delta[kind] = { added, removed, changed };
    }
    writeFileSync(join(output, 'migration-delta.json'), JSON.stringify(delta, null, 2));
    await inspect(async (db) => {
      assert.equal(await matterLifecycleApplied(db), true);
      await assertMatterEditBoundary(db, profile);
    });
    // Only one new boolean, one audit classification and migration ledger are data deltas.
    const after = await inspect(staffReadOnlyState);
    assert.deepEqual(
      after.tables.filter(
        (t) =>
          ![
            'matters',
            'audit_event_fields',
            '_prisma_migrations',
            'matter_lifecycle_audit_counter',
          ].includes(t.table),
      ),
      before.tables.filter(
        (t) =>
          ![
            'matters',
            'audit_event_fields',
            '_prisma_migrations',
            'matter_lifecycle_audit_counter',
          ].includes(t.table),
      ),
    );
    await inspect(async (db) => {
      const rows = (
        await db.query(
          "SELECT count(*)::int count,encode(sha256(convert_to(coalesce(string_agg((to_jsonb(m)-'is_archived')::text,E'\\n' ORDER BY (to_jsonb(m)-'is_archived')::text COLLATE \"C\"),''),'UTF8')),'hex') digest FROM matters m",
        )
      ).rows[0];
      const prior = before.tables.find((t) => t.table === 'matters')!;
      assert.equal(rows.count, prior.count);
      assert.equal(rows.digest, prior.digest);
    });
    console.log('PASS exact migration catalog/ACL/sequence/data delta');
    for (const action of ['archive', 'restore'] as const) {
      const snapshot = await readMatterLifecycle(admin, action, oldNative.id, seededRuntime);
      await mutateMatterLifecycle(
        admin,
        action,
        {
          id: oldNative.id,
          confirmation: oldNative.id,
          version: snapshot.version,
          counts: snapshot.counts,
          action,
          submission: randomUUID(),
        },
        dependencies,
      );
    }
    const currentNative = await readMatterLifecycle(admin, 'archive', oldNative.id, seededRuntime);
    await mutateMatter(
      admin,
      'update',
      {
        id: oldNative.id,
        version: currentNative.version,
        submission: randomUUID(),
        values: { notes_1: 'TEST ONLY post65 native change' },
      },
      dependencies,
    );
    await seededRuntime.$disconnect();
    await inspect((db) => assertMatterEditBoundary(db, profile));
    console.log(
      'PASS pre65 native create/edit history preserved across archive, restore and post65 edit',
    );
    if (
      !process.argv.includes('--browser-only') &&
      !process.argv.includes('--lifecycle-followup-only')
    )
      check(
        'invariants-before',
        'scripts/check-db.ts',
        canonical ? ['--profile=canonical-clean-replay'] : [],
      );
    if (!canonical && !process.argv.includes('--migration-only')) {
      const runtime = createDatabaseClient(runtimeUrl);
      try {
        if (!process.argv.includes('--browser-only'))
          await proveMatterLifecycle(fixture, output, runtime);
      } finally {
        await runtime.$disconnect();
      }
      if (process.argv.includes('--browser')) {
        const { proveMatterBrowser } = await import('./test-matter-browser.mjs');
        const { proveMatterLifecycleBrowser } = await import('./lib/matter-lifecycle-browser.mjs');
        await proveMatterBrowser(fixture, output, null, proveMatterLifecycleBrowser);
      }
      check('permissions', 'scripts/test-permissions.ts', ['--restored-fixture']);
    }
    check(
      'invariants-final',
      'scripts/check-db.ts',
      canonical ? ['--profile=canonical-clean-replay'] : [],
    );
    writeFileSync(
      join(output, 'completed.json'),
      JSON.stringify(
        { profile, checkpoint: 65, rollback: true, migrationRetry: true, exactDelta: true },
        null,
        2,
      ),
    );
  });
  console.log('PASS owned lifecycle cluster cleanup');
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Lifecycle proof failed');
  process.exitCode = 1;
});
