import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabaseClient } from '../src/lib/db';
import { prepareHearingLifecycleActors } from './lib/hearing-lifecycle-actors';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  assertTasks46_47Boundary,
  tasks46_47Applied,
  tasks46_47Sql,
} from './lib/tasks46-47-checkpoint';

async function main() {
  const output = resolve(
    process.env.TASKS46_47_TEST_OUTPUT ?? 'test-results/tasks46-47-canonical-' + Date.now(),
  );
  mkdirSync(output, { recursive: true });
  await withIsolatedPostgres(async (initial) => {
    const migrationUrl = await initial.createDatabase('litigation_task4647_canonical_prestate');
    const runtimeUrl = new URL(initial.runtimeUrl);
    runtimeUrl.pathname = new URL(migrationUrl).pathname;
    const fixture = {
      ...initial,
      migrationUrl,
      runtimeUrl: runtimeUrl.toString(),
      environment: {
        ...initial.environment,
        MIGRATION_DATABASE_URL: migrationUrl,
        DATABASE_URL: runtimeUrl.toString(),
      },
    };
    Object.assign(process.env, fixture.environment);
    writeFileSync(
      resolve(output, 'isolation.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          container: fixture.container,
          cluster: fixture.clusterId,
          sourceCluster: fixture.sourceClusterId,
          port: new URL(migrationUrl).port,
          image: fixture.imageId,
        },
        null,
        2,
      ),
    );
    await migrateFixtureThroughCheckpoint(migrationUrl, 70, fixture.environment);
    const runtime = createDatabaseClient(fixture.runtimeUrl);
    try {
      await prepareHearingLifecycleActors(fixture, runtime, true);
    } finally {
      await runtime.$disconnect();
    }
    await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(migrationUrl), fixture.environment);
        assert.equal(await tasks46_47Applied(db), false);
        await assert.rejects(
          db.query(
            tasks46_47Sql().replace(
              /COMMIT;\s*$/u,
              () =>
                "DO $$ BEGIN RAISE EXCEPTION 'TEST ONLY late Tasks 4.6/4.7 failure'; END $$; COMMIT;",
            ),
          ),
          /TEST ONLY late Tasks 4\.6\/4\.7 failure/u,
        );
        await db.query('ROLLBACK');
        assert.equal(await tasks46_47Applied(db), false);
      },
      { databaseUrl: migrationUrl },
    );
    console.log('PASS canonical late migration failure rolls back every migration-71 object');

    const deploy = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/run-prisma-migration.ts', 'deploy'],
      {
        env: fixture.environment,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 32_000_000,
      },
    );
    writeFileSync(
      resolve(output, 'deploy.log'),
      (deploy.stdout + deploy.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
    );
    assert.equal(deploy.status, 0, deploy.stdout + deploy.stderr);
    await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(migrationUrl), fixture.environment);
        await assertTasks46_47Boundary(db, 'canonical-clean-replay');
        const actor = (
          await db.query(`SELECT u.id,u.session_version session,u.role_code role
            FROM user_accounts u JOIN people p ON p.id=u.person_id
            WHERE u.role_code='Administrator' AND u.is_enabled AND u.password_hash IS NOT NULL
              AND NOT u.must_change_password AND p.is_active AND p.can_login ORDER BY u.id LIMIT 1`)
        ).rows[0];
        assert.ok(actor, 'usable canonical Administrator fixture');
        await db.query('BEGIN');
        try {
          await db.query('SELECT audit_set_human_context($1)', [actor.id]);
          await db.query('SELECT audit_set_event_context($1,$2,$3,NULL,$4,$5)', [
            randomUUID(),
            randomUUID(),
            randomUUID(),
            'tasks-4-6-4-7-canonical-proof',
            'system',
          ]);
          const submission = randomUUID();
          const made = (
            await db.query('SELECT document_edit_save($1,$2,$3,$4,$5) result', [
              actor.id,
              actor.session,
              actor.role,
              '2099-01-01T00:00:00Z',
              {
                operation: 'create',
                id: null,
                version: null,
                submission,
                values: { description: 'مستند أصلي\nسطر ثان', page_count: 0 },
                related: null,
                facts: null,
              },
            ])
          ).rows[0].result;
          assert.equal(made.changed, true);
          assert.equal(
            (
              await db.query('SELECT document_edit_save($1,$2,$3,$4,$5) result', [
                actor.id,
                actor.session,
                actor.role,
                '2099-01-01T00:00:00Z',
                {
                  operation: 'create',
                  id: null,
                  version: null,
                  submission,
                  values: { description: 'مستند أصلي\nسطر ثان', page_count: 0 },
                  related: null,
                  facts: null,
                },
              ])
            ).rows[0].result.id,
            made.id,
          );
          await db.query('ROLLBACK');
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        }
      },
      { databaseUrl: migrationUrl },
    );
    const check = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/check-db.ts', '--profile=canonical-clean-replay'],
      {
        env: fixture.environment,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 32_000_000,
      },
    );
    writeFileSync(resolve(output, 'invariants.log'), check.stdout + check.stderr);
    assert.equal(check.status, 0, check.stdout + check.stderr);
    console.log('PASS canonical migrations 1–71, exact empty boundary, native create and retry');
  });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
