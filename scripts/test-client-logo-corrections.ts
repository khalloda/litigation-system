import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { clientLogoFixtureState } from './lib/client-logo-fixture-state';
import { assertCurrentClientSource } from './lib/client-regression-source';
import { withCurrentClientFixture } from './lib/current-client-fixture';
import { initialiseActors } from './test-client-contacts';
import { proveLogoPublication } from './test-client-logo-publication';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { assertStaffCheckpoint } from './lib/staff-roster-checkpoint';
import { assertClientContactBoundary } from './lib/client-contact-checkpoint';
import { clientLogoBoundaryApplied } from './lib/client-logo-checkpoint';

async function main() {
  const mode = process.argv[2];
  if (mode === '--adapter-probe') {
    const checkpoint = await withApprovedMigrationClient(assertCurrentClientSource, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    });
    assert.equal(checkpoint, 63);
    let reached = false;
    process.argv.push('--restored-client-fixture');
    await assert.rejects(
      withCurrentClientFixture(async () => {
        reached = true;
      }, process.env.MIGRATION_DATABASE_URL),
      (e) => e instanceof assert.AssertionError && e.actual === 63 && e.expected === 62,
    );
    assert.equal(reached, false);
    console.log('REPRODUCED R2: actual complete migration63 source refused before staff callback');
    return;
  }
  assert.ok(
    ['--r2-before', '--staff-62', '--staff-63', '--publication-before', '--publication'].includes(
      mode!,
    ),
  );
  assert.ok(process.env.CLIENT_LOGO_EVIDENCE_DIR);
  const output = resolve(process.env.CLIENT_LOGO_EVIDENCE_DIR);
  const suffix = relative(process.cwd(), output);
  assert.ok(suffix.startsWith('..') || isAbsolute(suffix));
  mkdirSync(output);
  const record = (name: string, value: unknown) =>
    writeFileSync(resolve(output, name + '.json'), JSON.stringify(value, null, 2));
  const list = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(list.status, 0);
  record(
    'source-inventory',
    [...new Set(list.stdout.trim().split('\n'))].map((path) => {
      const bytes = readFileSync(path);
      return {
        path,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    }),
  );
  const inspectSource = () =>
    withApprovedMigrationClient(
      async (db) => ({
        state: await staffReadOnlyState(db),
        portable: await clientLogoFixtureState(db),
      }),
      { clientConfig: { options: '-c default_transaction_read_only=on' } },
    );
  const original = await inspectSource();
  record('source', original);
  const child = (script: string, args: string[], env: NodeJS.ProcessEnv, label: string) => {
    const started = new Date().toISOString();
    const r = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', script, ...args], {
      env: {
        ...env,
        PRISMA_SCHEMA_ENGINE_BINARY: resolve(
          'node_modules/@prisma/engines/schema-engine-windows.exe',
        ),
      },
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    const log = (r.stdout + r.stderr)
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted database URL]')
      .replace(/\$argon2(?:id|i|d)\$[^\s"']+/gu, '[redacted password hash]');
    record(label, { script, args, started, ended: new Date().toISOString(), exit: r.status, log });
    assert.equal(r.status, 0, log);
    return log;
  };
  await withIsolatedPostgres(async (fixture) => {
    await fixture.restoreProject();
    await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        assert.equal(await assertCurrentClientSource(db), 62);
        const copy = {
          state: await staffReadOnlyState(db),
          portable: await clientLogoFixtureState(db),
        };
        assert.deepEqual(copy.state.tables, original.state.tables);
        assert.equal(copy.state.sequenceDigest, original.state.sequenceDigest);
        assert.deepEqual(copy.portable, original.portable);
        record('copy', copy);
      },
      {
        databaseUrl: fixture.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
    if (mode !== '--staff-62')
      child('scripts/run-prisma-migration.ts', ['deploy'], fixture.environment, 'migration63');
    const checkpoint = await withApprovedMigrationClient(assertCurrentClientSource, {
      databaseUrl: fixture.migrationUrl,
      clientConfig: { options: '-c default_transaction_read_only=on' },
    });
    assert.equal(checkpoint, mode === '--staff-62' ? 62 : 63);
    record('fixture', {
      checkpoint,
      container: fixture.container,
      cluster: fixture.clusterId,
      sourceCluster: fixture.sourceClusterId,
      port: new URL(fixture.runtimeUrl).port,
      database: new URL(fixture.migrationUrl).pathname,
      sourceMatchedBeforeMutation: true,
    });
    if (mode?.startsWith('--publication'))
      await proveLogoPublication(fixture, output, mode === '--publication-before');
    else if (mode === '--r2-before')
      child(
        'scripts/test-client-logo-corrections.ts',
        ['--adapter-probe'],
        fixture.environment,
        'original-r2',
      );
    else {
      await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
      const log = child(
        'scripts/test-client-contacts.ts',
        ['--regression-proof', '--suite=staff'],
        fixture.environment,
        'actual-staff-wrapper',
      );
      assert.ok(log.includes(`exact historical ${checkpoint}; migration applications 0`));
      assert.ok(
        log.includes(
          'PASS create, normalized email, primary alias and Administrator management read',
        ),
      );
      assert.ok(
        log.includes(
          'PASS audit and gateway failure roll back rows, versions, aliases and audit history',
        ),
      );
      assert.ok(log.includes('PASS upgraded staff fixture databases removed'));
      record('dispatch-proof', {
        checkpoint,
        actualWrapper: true,
        noImplicitUpgrade: true,
        staffBodyReached: true,
        staffAssertionsPassed: true,
      });
      if (mode === '--staff-62') {
        const canonical = await fixture.createDatabase('litigation_task41_canonical_prestate');
        await migrateFixtureThroughCheckpoint(canonical, 61, fixture.environment);
        await withApprovedMigrationClient(
          async (db) => {
            assert.equal(await assertStaffCheckpoint(db, 'canonical-clean-replay'), 61);
          },
          { databaseUrl: canonical },
        );
        await migrateFixtureThroughCheckpoint(canonical, 62, fixture.environment);
        await withApprovedMigrationClient(
          async (db) => {
            assert.equal(await assertStaffCheckpoint(db, 'canonical-clean-replay'), 62);
            await assertClientContactBoundary(db, 'canonical-clean-replay');
            assert.equal(await clientLogoBoundaryApplied(db), false);
          },
          { databaseUrl: canonical },
        );
        // Forbidden target and arbitrary number are rejected before any migration.
        const wrong = new URL(canonical);
        wrong.pathname = '/not_an_approved_fixture';
        await assert.rejects(
          migrateFixtureThroughCheckpoint(wrong.toString(), 62, fixture.environment),
        );
        await assert.rejects(
          migrateFixtureThroughCheckpoint(canonical, 63 as 62, fixture.environment),
        );
        record('canonical-61-to-62', {
          passed: true,
          exact61Then62: true,
          migration63Pending: true,
          invalidTargetAndCheckpointRefused: true,
        });
      }
    }
  });
  assert.deepEqual(await inspectSource(), original);
  record('result', {
    passed: true,
    sourceUnchanged: true,
    cleanup:
      'Guarded fixture lifecycle removed owned resources and verified unchanged preexisting resource sets',
    ended: new Date().toISOString(),
  });
  console.log('PASS correction fixture proof and source preservation/cleanup');
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Correction proof failed');
  process.exitCode = 1;
});
