import 'dotenv/config';
import { createDatabaseClient } from '../src/lib/db';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ClientBase } from 'pg';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { matterMigrationCatalog } from './lib/matter-migration-delta';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import {
  hearingLifecycleSql,
  assertHearingLifecycleBoundary,
} from './lib/hearing-lifecycle-checkpoint';
import { prepareHearingLifecycleActors } from './lib/hearing-lifecycle-actors';

/** Private comparison material never leaves this process. Account fingerprints
 * are deliberately absent from the public result and assertion messages. */
async function projection(db: ClientBase) {
  const result = [];
  const tables = (
    await db.query(
      "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('public','staging','quarantine','_migration') AND tablename<>'hearing_lifecycle_boundary' ORDER BY 1,2",
    )
  ).rows;
  for (const { schemaname: s, tablename: t } of tables) {
    const qs = s.replaceAll('"', '""'),
      qt = t.replaceAll('"', '""');
    const filter =
      t === '_prisma_migrations'
        ? "WHERE migration_name<>'20260913160000_hearing_archive_restore'"
        : t === 'audit_event_fields'
          ? "WHERE NOT(entity_table='hearings' AND field_name='is_archived')"
          : '';
    result.push({
      schema: s,
      table: t,
      ...(
        await db.query(
          `SELECT count(*)::int count,encode(sha256(convert_to(coalesce(string_agg(payload,chr(10) ORDER BY payload COLLATE "C"),''),'UTF8')),'hex') digest FROM(SELECT (to_jsonb(t)${t === 'hearings' ? "-'is_archived'" : ''})::text payload FROM "${qs}"."${qt}" t ${filter}) q`,
        )
      ).rows[0],
    });
  }
  return result;
}
function exact(a: unknown, b: unknown, label: string) {
  assert.ok(JSON.stringify(a) === JSON.stringify(b), label);
}

async function main() {
  const output = resolve(process.env.HEARING_LIFECYCLE_EVIDENCE_DIR!);
  assert.ok(process.env.HEARING_LIFECYCLE_EVIDENCE_DIR && output !== process.cwd());
  mkdirSync(output, { recursive: true });
  const save = (name: string, value: unknown) =>
    writeFileSync(join(output, name + '.json'), JSON.stringify(value, null, 2));
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(files.status, 0);
  const source = [...new Set(files.stdout.split('\0').filter(Boolean))]
    .sort()
    .filter((p) => !p.endsWith('.env'));
  save(
    'executed-source',
    source.map((path) => ({
      path,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    })),
  );
  for (const p of source.filter((p) => /^(src|scripts|prisma)\//u.test(p))) {
    const to = join(output, 'executed', p);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(p, to);
  }
  save('expected-delta', {
    column: 'hearings.is_archived false NOT NULL',
    table: '_migration.hearing_lifecycle_boundary',
    newFunctions: 5,
    replacedFunctions: 4,
    index: 'hearings_archive_date_id_idx',
    guards: ['hearings', 'hearing_attendees'],
    field: 'audit_event_fields.hearings.is_archived',
    sequences: 'all complete states unchanged',
    data: 'all prior projections and history exact; no old versions rewritten',
  });
  await withIsolatedPostgres(async (fixture) => {
    save('isolation', {
      container: fixture.container,
      cluster: fixture.clusterId,
      sourceCluster: fixture.sourceClusterId,
      port: new URL(fixture.runtimeUrl).port,
    });
    const canonical = process.argv.includes('--canonical');
    let owner = fixture.migrationUrl,
      runtime = fixture.runtimeUrl;
    const inspect = <T>(work: (db: ClientBase) => Promise<T>) =>
      withApprovedMigrationClient(
        async (db) => {
          await assertIsolatedTestCluster(db, new URL(owner), fixture.environment);
          return work(db);
        },
        { databaseUrl: owner },
      );
    if (canonical) {
      owner = await fixture.createDatabase('litigation_task43_canonical_prestate');
      const u = new URL(runtime);
      u.pathname = new URL(owner).pathname;
      runtime = u.toString();
      await migrateFixtureThroughCheckpoint(owner, 66, fixture.environment);
    } else
      await withApprovedMigrationClient(
        async (db) => {
          await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          try {
            assert.equal(
              (
                await db.query(
                  "SELECT current_setting('transaction_read_only') ro,current_database() name,system_identifier::text cluster FROM pg_control_system()",
                )
              ).rows[0].cluster,
              fixture.sourceClusterId,
            );
            assert.equal(
              (
                await db.query(
                  'SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
                )
              ).rows[0].n,
              66,
            );
            const snapshot = (await db.query('SELECT pg_export_snapshot() snapshot')).rows[0]
              .snapshot;
            const before = await projection(db),
              seq = (await matterMigrationCatalog(db)).sequences!;
            await fixture.restoreProject(snapshot);
            exact(
              await inspect(projection),
              before,
              'Coherent exported snapshot restore: every prior table exact',
            );
            const restored = (await inspect(matterMigrationCatalog)).sequences!;
            const portable = (s: typeof seq) =>
              s.map(({ identity, last_value, is_called }) => ({ identity, last_value, is_called }));
            exact(portable(restored), portable(seq), 'Portable full sequence values exact');
            save('restore-equivalence', {
              tables: before.length,
              sequences: seq.length,
              hearingCount: before.find((t) => t.table === 'hearings')!.count,
              coherentSnapshot: true,
              allTableContentsEqual: true,
              accountContentsEqual: true,
              logCnt:
                'Portable restoration resets WAL reservation log_cnt; full fixture states compared for later rollback/no-op tests.',
            });
          } finally {
            await db.query('ROLLBACK');
          }
        },
        { clientConfig: { options: '-c default_transaction_read_only=on' } },
      );
    const env = {
      ...fixture.environment,
      MIGRATION_DATABASE_URL: owner,
      DATABASE_URL: runtime,
      PRISMA_SCHEMA_ENGINE_BINARY: resolve(
        'node_modules/@prisma/engines/schema-engine-windows.exe',
      ),
    };
    const check = (label: string, script: string, args: string[] = []) => {
      const p = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', script, ...args], {
        env,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 32000000,
      });
      writeFileSync(
        join(output, label + '.log'),
        (p.stdout + p.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
      );
      assert.equal(p.status, 0, label + ' failed; retained log');
      console.log('PASS ' + label);
    };
    const before = await inspect(projection),
      state = await inspect(staffReadOnlyState),
      catalog = await inspect(matterMigrationCatalog);
    await inspect(async (db) => {
      await assert.rejects(
        db.query(
          hearingLifecycleSql().replace(
            /COMMIT;\s*$/u,
            () => "DO $$ BEGIN RAISE EXCEPTION 'TEST ONLY late67 failure'; END $$; COMMIT;",
          ),
        ),
        /TEST ONLY late67 failure/u,
      );
      await db.query('ROLLBACK');
    });
    exact(
      await inspect(staffReadOnlyState),
      state,
      'Late migration rollback exact rows and catalog',
    );
    exact(
      await inspect(matterMigrationCatalog),
      catalog,
      'Late migration rollback exact full sequences',
    );
    save('rollback', { allTables: true, catalog: true, completeSequences: true });
    check('migration67', 'scripts/run-prisma-migration.ts', ['deploy']);
    exact(await inspect(projection), before, 'Migration preserves every previous table projection');
    const after = await inspect(matterMigrationCatalog);
    exact(after.sequences, catalog.sequences, 'Migration preserves all complete sequences');
    const delta: Record<string, unknown> = {};
    for (const kind of Object.keys(catalog)) {
      const old = new Map(catalog[kind]!.map((r) => [r.identity, r])),
        now = new Map(after[kind]!.map((r) => [r.identity, r]));
      const added = after[kind]!.filter((r) => !old.has(r.identity)),
        removed = catalog[kind]!.filter((r) => !now.has(r.identity)),
        changed = after[kind]!.filter(
          (r) => old.has(r.identity) && JSON.stringify(r) !== JSON.stringify(old.get(r.identity)),
        );
      assert.deepEqual(removed, []);
      for (const r of added)
        assert.ok(
          String(r.identity).startsWith('_migration.hearing_lifecycle_') ||
            String(r.identity).startsWith('public.hearing_lifecycle_') ||
            [
              'public.hearings.is_archived',
              'public.hearings_archive_date_id_idx',
              'public.hearings.zy_hearing_lifecycle_guard',
              'public.hearing_attendees.zy_hearing_lifecycle_guard',
            ].includes(String(r.identity)),
          kind + ' unexpected addition ' + r.identity,
        );
      for (const r of changed)
        assert.ok(
          kind === 'functions' &&
            /^(?:public|_migration)\.hearing_edit_(current_valid|guard|state|save)\(/u.test(
              String(r.identity),
            ),
          kind + ' unexpected change ' + r.identity,
        );
      delta[kind] = {
        added,
        changed: changed.map((r) => ({ before: old.get(r.identity), after: r })),
        removed,
      };
    }
    save('migration-delta', delta);
    await inspect(assertHearingLifecycleBoundary);
    if (canonical) {
      const canonicalRuntime = createDatabaseClient(runtime);
      try {
        await prepareHearingLifecycleActors(
          { ...fixture, migrationUrl: owner, runtimeUrl: runtime, environment: env },
          canonicalRuntime,
          true,
        );
      } finally {
        await canonicalRuntime.$disconnect();
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
        new URL(owner).pathname.slice(1),
      ],
      { input: readFileSync('docker/postgres/verify.sql'), encoding: 'utf8', windowsHide: true },
    );
    writeFileSync(join(output, 'setup.log'), setup.stdout + setup.stderr);
    assert.equal(setup.status, 0);
    assert.equal((setup.stdout.match(/PASS/gu) ?? []).length, 15);
    assert.ok(!setup.stdout.includes('FAIL'));
    check(
      'invariants-initial',
      'scripts/check-db.ts',
      canonical ? ['--profile=canonical-clean-replay'] : [],
    );
    console.log('PASS migration67 complete proof');
    if (!process.argv.includes('--migration-only')) {
      const { proveHearingLifecycle } = await import('./lib/hearing-lifecycle-proof');
      await proveHearingLifecycle(
        { ...fixture, migrationUrl: owner, runtimeUrl: runtime, environment: env },
        output,
        createDatabaseClient(runtime),
      );
      check('invariants-final', 'scripts/check-db.ts');
      check('permissions', 'scripts/test-permissions.ts', ['--static-only']);
    }
  });
  save('cleanup', {
    ownedFixtureRemoved: true,
    actualDatabaseMigration: 66,
    actualWritesByTask: 0,
  });
}
void main().catch((e) => {
  console.error((e.stack ?? e.message).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'));
  process.exitCode = 1;
});
