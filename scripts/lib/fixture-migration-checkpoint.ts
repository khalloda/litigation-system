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

const CHECKPOINT_61_TARGET =
  /^(?:litigation|litigation_task41_canonical_prestate|litigation_task40a_canonical_checkpoint|litigation_task40a_boundary_(?:historical|canonical)_(?:login|gap|account|structural))$/u;
function checkpointFor(database: string): 56 | 60 | 61 {
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
  assert.ok([61, 62].includes(repository.migrations.length));
  assert.equal(repository.migrations[60]?.name, '20260906180000_staff_roster_database_boundary');
  if (repository.migrations.length === 62)
    assert.equal(repository.migrations[61]?.name, CLIENT_CONTACT_MIGRATION);
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
  const checkpoint = checkpointFor(target.database);
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
  assert.equal(basename(actual), 'prisma.config.ts');
  assert.match(relative(temporary, directory), /^litigation-task40a-checkpoint-[A-Za-z0-9]+$/u);
  assert.deepEqual((await readdir(directory)).sort(), ['migrations', 'prisma.config.ts']);
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
 * checkpoint; the separate Task 4.1 acceptance deploys 62 normally afterward. */
export async function migrateFixtureThroughCheckpoint(
  databaseUrl: string,
  checkpoint: 56 | 60 | 61,
  environment = process.env,
): Promise<void> {
  const target = new URL(databaseUrl);
  assert.equal(checkpointFor(target.pathname.slice(1)), checkpoint);
  await withApprovedMigrationClient((db) => assertIsolatedTestCluster(db, target, environment), {
    databaseUrl,
  });
  const repository = await readGate4RepositoryMigrationInventory();
  reviewedRepository(repository);
  const temporary = await mkdtemp(join(tmpdir(), 'litigation-task40a-checkpoint-'));
  const owned = new Set(['prisma.config.ts', 'migrations', 'migrations/migration_lock.toml']);
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
    await writeFile(join(temporary, 'prisma.config.ts'), configText(), 'utf8');
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'scripts/run-prisma-migration.ts',
        'deploy-fixture-checkpoint',
        join(temporary, 'prisma.config.ts'),
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
