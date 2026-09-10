import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { proveClientLogoMutations } from './test-client-logo-fixtures';
import { initialiseActors } from './test-client-contacts';
import { proveClientContactMutations } from './lib/client-contact-fixture-tests';
import { proveLogoApplication } from './lib/client-logo-application-proof.mjs';
import { proveLogoBrowser } from './test-client-logo-browser.mjs';
import { clientLogoFixtureState } from './lib/client-logo-fixture-state';
import { assertStaffCheckpoint } from './lib/staff-roster-checkpoint';
import { auditStructureFailures, runtimeRoleBoundaryFailures } from './lib/audit-structure';
import { auditEventStructureFailures, auditEventDataFailures } from './lib/audit-event-structure';
import { assertClientContactBoundary } from './lib/client-contact-checkpoint';
import { clientLogoStructureFailures } from './lib/client-logo-structure';
import {
  assertClientLogoBoundary,
  CLIENT_LOGO_CATALOG_QUERIES,
} from './lib/client-logo-checkpoint';

function child(
  script: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  output: string,
  label: string,
) {
  const started = new Date().toISOString();
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', script, ...args], {
    env: {
      ...environment,
      PRISMA_SCHEMA_ENGINE_BINARY: resolve(
        'node_modules/@prisma/engines/schema-engine-windows.exe',
      ),
    },
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const log = (result.stdout + result.stderr)
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted database URL]')
    .replace(/\$argon2(?:id|i|d)\$[^\s"']+/gu, '[redacted password hash]');
  writeFileSync(
    resolve(output, label + '.json'),
    JSON.stringify(
      { script, args, started, ended: new Date().toISOString(), exit: result.status, log },
      null,
      2,
    ),
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, log);
}

async function main() {
  assert.ok(
    process.env.CLIENT_LOGO_EVIDENCE_DIR,
    'Explicit new external evidence directory required',
  );
  const output = resolve(process.env.CLIENT_LOGO_EVIDENCE_DIR);
  const local = relative(process.cwd(), output);
  assert.ok(local.startsWith('..') || isAbsolute(local));
  mkdirSync(output); // Refuse overwriting prior attempts.
  const sourceList = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(sourceList.status, 0);
  const sourceFiles = [...new Set(sourceList.stdout.trim().split('\n'))].map((path) => {
    const bytes = readFileSync(path);
    return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  writeFileSync(
    resolve(output, 'execution-source-inventory.json'),
    JSON.stringify({ captured: new Date().toISOString(), files: sourceFiles }, null, 2),
  );
  const original = await withApprovedMigrationClient(staffReadOnlyState, {
    clientConfig: { options: '-c default_transaction_read_only=on' },
  });
  writeFileSync(resolve(output, 'source.json'), JSON.stringify(original, null, 2));
  const portable = await withApprovedMigrationClient(clientLogoFixtureState, {
    clientConfig: { options: '-c default_transaction_read_only=on' },
  });
  writeFileSync(resolve(output, 'source-portable.json'), JSON.stringify(portable, null, 2));
  await withIsolatedPostgres(async (fixture) => {
    await fixture.restoreProject();
    await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        assert.equal(await assertStaffCheckpoint(db, 'historical-full-state-upgrade'), 62);
        const copied = await staffReadOnlyState(db);
        assert.deepEqual(copied.tables, original.tables, 'Exact complete copied rows');
        assert.equal(
          copied.sequenceDigest,
          original.sequenceDigest,
          'Complete sequence attributes and values',
        );
        const portableCopy = await clientLogoFixtureState(db);
        writeFileSync(resolve(output, 'copy-portable.json'), JSON.stringify(portableCopy, null, 2));
        assert.deepEqual(
          portableCopy,
          portable,
          'Logical catalogs, owners, grants, roles and sequence is_called',
        );
      },
      {
        databaseUrl: fixture.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
    writeFileSync(
      resolve(output, 'fixture.json'),
      JSON.stringify(
        {
          container: fixture.container,
          cluster: fixture.clusterId,
          sourceCluster: fixture.sourceClusterId,
          port: new URL(fixture.runtimeUrl).port,
          sourceMatched: true,
        },
        null,
        2,
      ),
    );
    child(
      'scripts/run-prisma-migration.ts',
      ['deploy'],
      fixture.environment,
      output,
      'historical-upgrade',
    );
    await withApprovedMigrationClient(
      async (db) => {
        assert.equal(await assertStaffCheckpoint(db, 'historical-full-state-upgrade'), 63);
        const catalog: Record<string, unknown> = {};
        for (const [key, query] of Object.entries(CLIENT_LOGO_CATALOG_QUERIES))
          catalog[key] = (await db.query(query)).rows;
        writeFileSync(resolve(output, 'candidate-catalog.json'), JSON.stringify(catalog, null, 2));
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::integer n FROM client_logo_versions WHERE origin='import'",
            )
          ).rows[0].n,
          54,
        );
        if (process.argv[2] !== '--catalog-only') await assertClientLogoBoundary(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
    if (process.argv[2] === '--catalog-only') return;
    if (process.argv[2] === '--regressions') {
      await withApprovedMigrationClient(
        async (db) => {
          await assertClientContactBoundary(db, 'historical-full-state-upgrade');
          for (const check of [
            auditStructureFailures,
            runtimeRoleBoundaryFailures,
            auditEventStructureFailures,
            clientLogoStructureFailures,
          ])
            assert.deepEqual(await check(db), []);
          assert.deepEqual(await auditEventDataFailures(db, { historicalLive: true }), []);
        },
        { databaseUrl: fixture.migrationUrl },
      );
      for (const [script, args, label] of [
        ['scripts/test-permissions.ts', ['--restored-fixture'], 'permissions-448'],
        [
          'scripts/test-audit.ts',
          ['--profile=current-state-63', '--restored-client-fixture'],
          'audit-regression',
        ],
        ['scripts/test-audit-events.ts', ['--restored-client-fixture'], 'audit-events-regression'],
        ['scripts/test-gate4.ts', [], 'gate4-regression'],
      ] as const)
        child(script, [...args], fixture.environment, output, label);
      await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
      const clientGroups = await proveClientContactMutations(
        fixture.migrationUrl,
        fixture.runtimeUrl,
        fixture.environment,
        'historical-full-state-upgrade',
      );
      writeFileSync(
        resolve(output, 'client-contact-regression.json'),
        JSON.stringify(
          { passed: true, groups: clientGroups, ended: new Date().toISOString() },
          null,
          2,
        ),
      );
      return;
    }
    if (process.argv[2] === '--application' || process.argv[2] === '--browser') {
      await proveLogoApplication(
        fixture,
        output,
        process.argv[2] === '--browser'
          ? (application: Parameters<typeof proveLogoBrowser>[2]) =>
              proveLogoBrowser(fixture, output, application)
          : undefined,
      );
      return;
    }
    await proveClientLogoMutations(fixture, output);
    const canonical = await fixture.createDatabase('litigation_task41a_canonical');
    await withApprovedMigrationClient(
      async (db) => {
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::integer n FROM pg_tables WHERE schemaname IN ('public','staging','_migration')",
            )
          ).rows[0].n,
          0,
        );
      },
      { databaseUrl: canonical },
    );
    const canonicalRuntime = new URL(fixture.runtimeUrl);
    canonicalRuntime.pathname = new URL(canonical).pathname;
    child(
      'scripts/run-prisma-migration.ts',
      ['deploy'],
      {
        ...fixture.environment,
        MIGRATION_DATABASE_URL: canonical,
        DATABASE_URL: canonicalRuntime.toString(),
      },
      output,
      'canonical-replay',
    );
    await withApprovedMigrationClient(
      async (db) => {
        assert.equal(await assertStaffCheckpoint(db, 'canonical-clean-replay'), 63);
        await assertClientLogoBoundary(db);
        assert.equal(
          (await db.query('SELECT count(*)::integer n FROM client_logo_versions')).rows[0].n,
          0,
        );
      },
      { databaseUrl: canonical },
    );
  });
  const after = await withApprovedMigrationClient(staffReadOnlyState, {
    clientConfig: { options: '-c default_transaction_read_only=on' },
  });
  assert.deepEqual(after, original);
  writeFileSync(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        projectUnchanged: true,
        cleanup: 'owned fixture resources removed and preexisting Docker resource sets unchanged',
        ended: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log('PASS isolated logo migration proof; source unchanged; owned resources removed');
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted database URL]')
      : 'Logo proof failed',
  );
  process.exitCode = 1;
});
