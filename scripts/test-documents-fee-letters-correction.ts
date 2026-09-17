import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedPostgres } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { adminEditState } from './lib/admin-edit-state';

type RunRecord = {
  name: string;
  command: string[];
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  log: string;
};

async function main() {
  const output = resolve(
    process.env.TASKS46_47_TEST_OUTPUT ??
      `test-results/tasks46-47-correction-historical-${Date.now()}`,
  );
  mkdirSync(output, { recursive: true });
  const sourceFiles = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8', windowsHide: true },
  )
    .trim()
    .split('\n')
    .filter((path) => /^(?:scripts|src|prisma|docs)\//u.test(path) || path === 'package.json')
    .map((path) => ({
      path,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    }));
  writeFileSync(resolve(output, 'source-binding.json'), JSON.stringify(sourceFiles, null, 2));
  const runs: RunRecord[] = [];
  await withIsolatedPostgres(async (initial) => {
    await initial.restoreProject();
    const migrationUrl = await initial.createDatabase(
      'litigation_task4647_correction',
      'litigation',
    );
    const runtimeUrl = new URL(initial.runtimeUrl);
    runtimeUrl.pathname = new URL(migrationUrl).pathname;
    const environment = {
      ...initial.environment,
      MIGRATION_DATABASE_URL: migrationUrl,
      DATABASE_URL: runtimeUrl.toString(),
      TASKS46_47_TEST_DATABASE: 'litigation_task4647_correction',
    };
    const beforeMigration = await withApprovedMigrationClient((db) => adminEditState(db), {
      databaseUrl: migrationUrl,
    });
    writeFileSync(
      resolve(output, 'migration-state-before.json'),
      JSON.stringify(beforeMigration, null, 2),
    );
    writeFileSync(
      resolve(output, 'isolation.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          container: initial.container,
          cluster: initial.clusterId,
          sourceCluster: initial.sourceClusterId,
          database: 'litigation_task4647_correction',
          port: new URL(migrationUrl).port,
          image: initial.imageId,
        },
        null,
        2,
      ),
    );
    const run = (name: string, command: string[], assertSuccess = true) => {
      const startedAt = new Date().toISOString();
      const result = spawnSync(process.execPath, command, {
        env: environment,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 64_000_000,
      });
      const finishedAt = new Date().toISOString();
      const log = (result.stdout + result.stderr).replace(
        /postgres(?:ql)?:\/\/[^\s"']+/gu,
        '[redacted]',
      );
      writeFileSync(resolve(output, `${name}.log`), log);
      runs.push({
        name,
        command: [process.execPath, ...command],
        startedAt,
        finishedAt,
        exitCode: result.status,
        log: `${name}.log`,
      });
      writeFileSync(resolve(output, 'execution-record.json'), JSON.stringify(runs, null, 2));
      if (assertSuccess) assert.equal(result.status, 0, log);
      return result.status;
    };
    const deploy = run(
      'deploy',
      ['--import', 'tsx', 'scripts/run-prisma-migration.ts', 'deploy'],
      false,
    );
    if (deploy !== 0) {
      await withApprovedMigrationClient(
        async (db) => {
          const logs = await db.query(
            `SELECT migration_name,logs FROM _prisma_migrations
             WHERE migration_name='20260916180000_documents_fee_letters_boundary'`,
          );
          writeFileSync(
            resolve(output, 'deploy-database-error.json'),
            JSON.stringify(logs.rows, null, 2),
          );
          try {
            await db.query(
              readFileSync(
                'prisma/migrations/20260916180000_documents_fee_letters_boundary/migration.sql',
                'utf8',
              ),
            );
          } catch (error) {
            const problem = error as Error & { code?: string; detail?: string; where?: string };
            writeFileSync(
              resolve(output, 'direct-migration-error.json'),
              JSON.stringify(
                {
                  name: problem.name,
                  message: problem.message,
                  code: problem.code,
                  detail: problem.detail,
                  where: problem.where,
                  stack: problem.stack,
                },
                null,
                2,
              ),
            );
          }
        },
        { databaseUrl: migrationUrl },
      );
      throw new Error('Disposable migration deploy failed; see deploy-database-error.json');
    }
    const afterMigration = await withApprovedMigrationClient((db) => adminEditState(db), {
      databaseUrl: migrationUrl,
    });
    writeFileSync(
      resolve(output, 'migration-state-after.json'),
      JSON.stringify(afterMigration, null, 2),
    );
    assert.deepEqual(
      afterMigration.sequences,
      beforeMigration.sequences,
      'all complete pre-existing sequence definitions and last_value/log_cnt/is_called vectors',
    );
    const changedExisting = new Set([
      'public._prisma_migrations',
      'public.audit_event_fields',
      'public.documents',
      'public.fee_letters',
      'public.fee_letter_matters',
      'public.matter_fee_letter_references',
    ]);
    const beforeTables = new Map(
      beforeMigration.tables.map((row) => [`${row.schema}.${row.table}`, row]),
    );
    const afterTables = new Map(
      afterMigration.tables.map((row) => [`${row.schema}.${row.table}`, row]),
    );
    for (const [name, before] of beforeTables) {
      const after = afterTables.get(name);
      assert.ok(after, `pre-existing table retained: ${name}`);
      if (!changedExisting.has(name))
        assert.deepEqual(after, before, `unrelated table remains byte-value equivalent: ${name}`);
    }
    for (const name of [
      'public.documents',
      'public.fee_letters',
      'public.fee_letter_matters',
      'public.matter_fee_letter_references',
    ])
      assert.equal(
        afterTables.get(name)!.count,
        beforeTables.get(name)!.count,
        `${name} row count is unchanged by migration 71`,
      );
    assert.equal(
      afterTables.get('public.audit_event_fields')!.count,
      beforeTables.get('public.audit_event_fields')!.count + 7,
      'exact seven audit-field registrations',
    );
    assert.equal(
      afterTables.get('public._prisma_migrations')!.count,
      beforeTables.get('public._prisma_migrations')!.count + 1,
      'exact one completed migration-ledger row',
    );
    const addedTables = [...afterTables.keys()].filter((name) => !beforeTables.has(name)).sort();
    assert.deepEqual(addedTables, [
      '_migration.document_edit_change',
      '_migration.document_edit_submission',
      '_migration.fee_letter_edit_change',
      '_migration.fee_letter_edit_submission',
      '_migration.matter_fee_reference_change',
      '_migration.matter_fee_reference_state',
      '_migration.matter_fee_reference_submission',
      '_migration.tasks46_47_boundary',
      '_migration.tasks46_47_import',
      '_migration.tasks46_47_submission_owner',
    ]);
    writeFileSync(
      resolve(output, 'migration-delta.json'),
      JSON.stringify(
        {
          beforeTables: beforeMigration.tables.length,
          afterTables: afterMigration.tables.length,
          addedTables,
          changedExisting: [...changedExisting].sort(),
          unchangedExisting: beforeMigration.tables.length - changedExisting.size,
          completeSequences: afterMigration.sequences.length,
          completeSequenceVectorsEqual: true,
          catalogBefore: beforeMigration.catalogDigest,
          catalogAfter: afterMigration.catalogDigest,
          exactCatalogSurfaceValidatedBy: 'scripts/lib/tasks46-47-checkpoint.ts',
          fixtureAccountsOrBusinessMutationsStarted: false,
        },
        null,
        2,
      ),
    );
    run('functional', ['--import', 'tsx', 'scripts/test-documents-fee-letters.ts']);
    run('invariants', [
      '--import',
      'tsx',
      'scripts/check-db.ts',
      '--profile=historical-full-state-upgrade',
    ]);
    writeFileSync(
      resolve(output, 'tool-versions.json'),
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          node: process.version,
          platform: process.platform,
          architecture: process.arch,
          postgresImage: initial.imageId,
        },
        null,
        2,
      ),
    );
  });
  console.log(
    'PASS correction historical migration, functional suite, full read oracle and invariants',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
