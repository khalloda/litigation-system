import { MATTER_LIFECYCLE_MIGRATION } from './matter-lifecycle-checkpoint';
import { MATTER_EDIT_MIGRATION } from './matter-edit-checkpoint';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readdir,
  realpath,
  rm,
  readFile,
  lstat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, sep, dirname, basename } from 'node:path';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture';
import { withApprovedMigrationClient, migrationDatabaseTarget } from './migration-principal';
import { readGate4RepositoryMigrationInventory } from './gate4-migrations';
import { CLIENT_CONTACT_MIGRATION } from './client-contact-checkpoint';
import { CLIENT_LOGO_MIGRATION } from './client-logo-checkpoint';

const CHECKPOINT_61_TARGET =
  /^(?:litigation|litigation_task41_canonical_prestate|litigation_task40a_canonical_checkpoint|litigation_task40a_boundary_(?:historical|canonical)_(?:login|gap|account|structural))$/u;
function checkpointFor(
  database: string,
  clientBoundary = false,
  matterPrestate = false,
  matterBoundary = false,
  hearingPrestate = false,
  hearingLifecyclePrestate = false,
): 56 | 60 | 61 | 62 | 63 | 64 | 65 | 66 {
  if (hearingLifecyclePrestate) {
    assert.ok(['litigation', 'litigation_task43_canonical_prestate'].includes(database));
    return 66;
  }
  if (hearingPrestate) {
    assert.ok(['litigation', 'litigation_task43_canonical_prestate'].includes(database));
    return 65;
  }
  if (matterBoundary) {
    assert.ok(['litigation', 'litigation_task42_canonical_prestate'].includes(database));
    return 64;
  }
  if (matterPrestate) {
    assert.equal(database, 'litigation_task42_canonical_prestate');
    return 63;
  }
  if (clientBoundary) {
    assert.match(database, /^(?:litigation|litigation_task41_canonical_prestate)$/u);
    return 62;
  }
  if (/^litigation_task33b_failed_[0-9_]+$/u.test(database)) return 56;
  if (CHECKPOINT_61_TARGET.test(database)) return 61;
  assert.match(
    database,
    /^litigation_(?:task33a_history_fixture_[0-9_]+|task40a_canonical_prestate)$/u,
  );
  return 60;
}
function reviewedRepository(
  repository: Awaited<ReturnType<typeof readGate4RepositoryMigrationInventory>>,
) {
  assert.deepEqual(repository.defects, []);
  assert.ok([61, 62, 63, 64, 65, 66, 67, 68].includes(repository.migrations.length));
  assert.equal(repository.migrations[60]?.name, '20260906180000_staff_roster_database_boundary');
  if (repository.migrations.length >= 62)
    assert.equal(repository.migrations[61]?.name, CLIENT_CONTACT_MIGRATION);
  if (repository.migrations.length >= 63)
    assert.equal(repository.migrations[62]?.name, CLIENT_LOGO_MIGRATION);
  if (repository.migrations.length >= 64)
    assert.equal(repository.migrations[63]?.name, MATTER_EDIT_MIGRATION);
  if (repository.migrations.length >= 65)
    assert.equal(repository.migrations[64]?.name, MATTER_LIFECYCLE_MIGRATION);
  if (repository.migrations.length >= 66)
    assert.equal(repository.migrations[65]?.name, '20260913120000_hearing_editing_boundary');
  if (repository.migrations.length >= 67)
    assert.equal(repository.migrations[66]?.name, '20260913160000_hearing_archive_restore');
  if (repository.migrations.length >= 68)
    assert.equal(repository.migrations[67]?.name, '20260914160000_admin_work_editing_boundary');
}

function configText(): string {
  const prismaConfigModule = resolve('node_modules/prisma/config.js').replaceAll('\\', '/');
  const schema = resolve('prisma/schema.prisma').replaceAll('\\', '/');
  return `import {defineConfig} from ${JSON.stringify(prismaConfigModule)};\nexport default defineConfig({schema:${JSON.stringify(schema)},migrations:{path:'migrations'},datasource:{url:process.env.MIGRATION_DATABASE_URL}});\n`;
}

/** Called by the ordinary D35 runner before it starts Prisma. A caller cannot
 * substitute a config, URL, SQL file, arbitrary checkpoint or existing cluster. */
export async function validateFixtureMigrationConfig(config: string): Promise<string> {
  const target = migrationDatabaseTarget();
  assert.equal(target.hostname, '127.0.0.1');
  assert.notEqual(target.port, 5433);
  const configName = basename(config);
  assert.ok(
    [
      'prisma.config.ts',
      'prisma.client62.config.ts',
      'prisma.matter63.config.ts',
      'prisma.matter64.config.ts',
      'prisma.hearing65.config.ts',
      'prisma.hearing66.config.ts',
    ].includes(configName),
  );
  const checkpoint = checkpointFor(
    target.database,
    configName === 'prisma.client62.config.ts',
    configName === 'prisma.matter63.config.ts',
    configName === 'prisma.matter64.config.ts',
    configName === 'prisma.hearing65.config.ts',
    configName === 'prisma.hearing66.config.ts',
  );
  await withApprovedMigrationClient((db) =>
    assertIsolatedTestCluster(
      db,
      new URL(`postgresql://${target.hostname}:${target.port}/${target.database}`),
    ),
  );
  const actual = await realpath(config);
  const directory = dirname(actual);
  const temporary = await realpath(tmpdir());
  assert.equal(actual.toLowerCase(), resolve(config).toLowerCase());
  assert.equal(basename(actual), configName);
  assert.match(relative(temporary, directory), /^litigation-task40a-checkpoint-[A-Za-z0-9]+$/u);
  assert.deepEqual((await readdir(directory)).sort(), ['migrations', configName].sort());
  assert.equal((await lstat(actual)).isSymbolicLink(), false);
  assert.equal(await readFile(actual, 'utf8'), configText());
  const repository = await readGate4RepositoryMigrationInventory();
  reviewedRepository(repository);
  const expected = repository.migrations.slice(0, checkpoint).map((row) => row.name);
  assert.deepEqual(
    (await readdir(join(directory, 'migrations'))).sort(),
    [...expected, 'migration_lock.toml'].sort(),
  );
  assert.equal((await lstat(join(directory, 'migrations'))).isSymbolicLink(), false);
  assert.deepEqual(
    await readFile(join(directory, 'migrations', 'migration_lock.toml')),
    await readFile('prisma/migrations/migration_lock.toml'),
  );
  for (const name of expected) {
    const folder = join(directory, 'migrations', name);
    assert.equal((await lstat(folder)).isSymbolicLink(), false);
    assert.deepEqual(await readdir(folder), ['migration.sql']);
    assert.equal((await lstat(join(folder, 'migration.sql'))).isSymbolicLink(), false);
    assert.deepEqual(
      await readFile(join(folder, 'migration.sql')),
      await readFile(join('prisma', 'migrations', name, 'migration.sql')),
    );
  }
  return actual;
}

/** Exact pre-61 fixture construction for legacy audit replay and Phase 1
 * rollback tests. Never a release acceptance shortcut, source-database target
 * or failed-migration override. Historical proofs stop at their exact reviewed
 * checkpoint. The explicit client62 config applies only 1–62, even while later
 * candidates exist; it is limited to the two reviewed client fixture targets. */
export async function migrateFixtureThroughCheckpoint(
  databaseUrl: string,
  checkpoint: 56 | 60 | 61 | 62 | 63 | 64 | 65 | 66,
  environment = process.env,
): Promise<void> {
  const target = new URL(databaseUrl);
  assert.equal(
    checkpointFor(
      target.pathname.slice(1),
      checkpoint === 62,
      checkpoint === 63,
      checkpoint === 64,
      checkpoint === 65,
      checkpoint === 66,
    ),
    checkpoint,
  );
  await withApprovedMigrationClient((db) => assertIsolatedTestCluster(db, target, environment), {
    databaseUrl,
  });
  const repository = await readGate4RepositoryMigrationInventory();
  reviewedRepository(repository);
  const temporary = await mkdtemp(join(tmpdir(), 'litigation-task40a-checkpoint-'));
  const configName =
    checkpoint === 66
      ? 'prisma.hearing66.config.ts'
      : checkpoint === 65
        ? 'prisma.hearing65.config.ts'
        : checkpoint === 64
          ? 'prisma.matter64.config.ts'
          : checkpoint === 63
            ? 'prisma.matter63.config.ts'
            : checkpoint === 62
              ? 'prisma.client62.config.ts'
              : 'prisma.config.ts';
  const owned = new Set([configName, 'migrations', 'migrations/migration_lock.toml']);
  try {
    await mkdir(join(temporary, 'migrations'));
    await copyFile(
      'prisma/migrations/migration_lock.toml',
      join(temporary, 'migrations', 'migration_lock.toml'),
    );
    for (const migration of repository.migrations.slice(0, checkpoint)) {
      const directory = 'migrations/' + migration.name;
      owned.add(directory);
      owned.add(directory + '/migration.sql');
      await mkdir(join(temporary, directory));
      await copyFile(
        join('prisma', directory, 'migration.sql'),
        join(temporary, directory, 'migration.sql'),
      );
    }
    await writeFile(join(temporary, configName), configText(), 'utf8');
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'scripts/run-prisma-migration.ts',
        'deploy-fixture-checkpoint',
        join(temporary, configName),
      ],
      {
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...environment,
          MIGRATION_DATABASE_URL: databaseUrl,
          PRISMA_SCHEMA_ENGINE_BINARY: resolve(
            'node_modules/@prisma/engines/schema-engine-windows.exe',
          ),
        },
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(
      result.status,
      0,
      (result.stdout + result.stderr).replace(
        /postgres(?:ql)?:\/\/[^\s"']+/gu,
        '[redacted database URL]',
      ),
    );
  } finally {
    const actualRoot = await realpath(temporary);
    const parent = await realpath(tmpdir());
    assert.equal(actualRoot.toLowerCase(), resolve(temporary).toLowerCase());
    assert.ok(actualRoot.toLowerCase().startsWith(parent.toLowerCase() + sep));
    assert.match(relative(parent, actualRoot), /^litigation-task40a-checkpoint-[A-Za-z0-9]+$/u);
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        const local = relative(temporary, path).replaceAll('\\', '/');
        assert.ok(
          owned.has(local) && !entry.isSymbolicLink(),
          'Unexpected checkpoint resource; do not delete: ' + local,
        );
        if (entry.isDirectory()) await walk(path);
      }
    };
    await walk(temporary);
    await rm(actualRoot, { recursive: true });
    console.log('PASS cleanup: exact generated legacy-checkpoint migration mirror removed');
  }
}
