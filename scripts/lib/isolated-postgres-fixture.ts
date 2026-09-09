import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { ClientBase } from 'pg';
import { withApprovedMigrationClient } from './migration-principal';

const LABEL = 'litigation.task40a.isolation';
const PREFIX = 'litigation-task40a-';
const PROJECT = 'litigation-db';
const VERSION = '17.11';

type Container = {
  Id: string;
  Image: string;
  Name: string;
  Config: { Labels: Record<string, string> };
  State: { Running: boolean; StartedAt: string };
  Mounts: { Type: string; Name?: string; Source: string; Destination: string }[];
  HostConfig: { NetworkMode: string; PortBindings: unknown; Privileged: boolean };
  NetworkSettings: {
    Networks: Record<string, { NetworkID: string }>;
    Ports: Record<string, { HostIp: string; HostPort: string }[] | null>;
  };
};

function docker(args: string[], input?: Buffer | string, env = process.env): Buffer {
  const result = spawnSync('docker', args, {
    input,
    env,
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  // Never include stderr/arguments: restore errors and container environment
  // arguments can contain database data or generated credentials.
  assert.equal(result.error, undefined, 'isolated Docker subprocess could not start');
  assert.equal(result.status, 0, 'isolated Docker subprocess failed');
  return result.stdout;
}

function inspect(name: string): Container {
  return JSON.parse(docker(['inspect', name]).toString())[0] as Container;
}

function projectIdentity(value: Container): unknown {
  return {
    id: value.Id,
    image: value.Image,
    // Docker's mount-array order is not stable between inspect calls.
    mounts: [...value.Mounts].sort((a, b) => a.Destination.localeCompare(b.Destination)),
    host: value.HostConfig,
    networks: value.NetworkSettings.Networks,
    ports: value.NetworkSettings.Ports,
    started: value.State.StartedAt,
    running: value.State.Running,
  };
}

function resourceNames(kind: 'container' | 'network' | 'volume'): string[] {
  const args =
    kind === 'container'
      ? ['ps', '-a', '--format', '{{.Names}}']
      : [kind, 'ls', '--format', '{{.Name}}'];
  return docker(args).toString().trim().split(/\r?\n/u).filter(Boolean).sort();
}

export type IsolatedPostgres = Readonly<{
  container: string;
  clusterId: string;
  imageId: string;
  migrationUrl: string;
  runtimeUrl: string;
  sourceClusterId: string;
  /** Generated secrets are passed only in child-process environments. */
  environment: NodeJS.ProcessEnv;
  createDatabase: (name: string, template?: string) => Promise<string>;
  restoreProject: () => Promise<void>;
}>;

/** Defense in depth for test commands launched by this fixture. This is not a
 * db-reset override and never authorizes an existing project cluster. */
export async function assertIsolatedTestCluster(
  database: ClientBase,
  url: URL,
  environment = process.env,
): Promise<void> {
  const name = environment['TASK40A_ISOLATED_CONTAINER'];
  const token = environment['TASK40A_ISOLATED_TOKEN'];
  const cluster = environment['TASK40A_ISOLATED_CLUSTER'];
  assert.ok(name, 'isolated fixture container identity required');
  assert.ok(name?.startsWith(PREFIX) && token && cluster, 'isolated fixture identity required');
  assert.equal(url.hostname, '127.0.0.1', 'fixture must bind only to localhost');
  assert.notEqual(url.port, '5433', 'fixture must not use the project port');
  const container = inspect(name);
  assert.equal(container.Config.Labels[LABEL], token, 'fixture ownership label differs');
  assert.equal(container.State.Running, true);
  const port = container.NetworkSettings.Ports['5432/tcp'];
  assert.deepEqual(port, [{ HostIp: '127.0.0.1', HostPort: url.port }]);
  const actual = (
    await database.query<{ id: string; version: string }>(
      "SELECT system_identifier::text id,current_setting('server_version') version FROM pg_control_system()",
    )
  ).rows[0];
  assert.equal(actual?.id, cluster, 'database is not the task-owned isolated cluster');
  assert.ok(actual.version.startsWith(VERSION + ' '));
}

/** The affected authentication/audit fixtures can change cluster-wide roles.
 * A database-name prefix on the project cluster is therefore insufficient.
 * They must run through the separate-cluster owner, never directly on 5433. */
export async function assertDisposableFixtureSource(url: URL): Promise<void> {
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.ok(
    process.env['TASK40A_ISOLATED_CONTAINER'],
    'Use scripts/test-staff-roster.ts: cluster-mutating regression fixtures require its isolated PostgreSQL descriptor',
  );
  assert.notEqual(url.port, '5433', 'Project cluster is never a regression-fixture target');
  await withApprovedMigrationClient((db) => assertIsolatedTestCluster(db, url), {
    databaseUrl: url.toString(),
    clientConfig: { options: '-c default_transaction_read_only=on' },
  });
}

/** Owner-authorized separate cluster. No project Compose command, shared
 * volume/network, real credential copy, temporary dump file, or public port.
 * The only source database operation is pg_dump in forced read-only mode. */
export async function withIsolatedPostgres<T>(
  operation: (fixture: IsolatedPostgres) => Promise<T>,
): Promise<T> {
  const project = inspect(PROJECT);
  assert.equal(project.State.Running, true, 'project must already be running');
  const originalProject = projectIdentity(project);
  // Normal entry points may be launched by an outer fixture against its
  // existing 61 or 62 source. Validate the actual connection and descriptor
  // before selecting the dump container; never silently fall back to project.
  const sourceName = process.env['TASK40A_ISOLATED_CONTAINER'] ?? PROJECT;
  const sourceContainer = inspect(sourceName);
  const originalSource = projectIdentity(sourceContainer);
  const image = JSON.parse(docker(['image', 'inspect', project.Image]).toString())[0] as {
    Id: string;
    RepoDigests: string[];
  };
  assert.equal(image.Id, project.Image);
  assert.ok(image.RepoDigests.some((d) => /^postgres@sha256:[a-f0-9]{64}$/u.test(d)));
  assert.equal(
    docker(['exec', PROJECT, 'postgres', '--version']).toString().trim(),
    'postgres (PostgreSQL) 17.11 (Debian 17.11-1.pgdg12+2)',
    'the local official image must be the approved PostgreSQL 17.11 build',
  );
  const sourceClusterId = docker([
    'exec',
    '-e',
    'PGOPTIONS=-c default_transaction_read_only=on',
    sourceName,
    'psql',
    '-X',
    '-U',
    'litigation',
    '-d',
    'litigation',
    '-Atqc',
    'SELECT system_identifier FROM pg_control_system()',
  ])
    .toString()
    .trim();
  assert.match(sourceClusterId, /^\d+$/u);
  assert.equal(sourceContainer.Image, project.Image, 'source must use the approved cached image');
  const databaseAcl = await withApprovedMigrationClient(
    async (db) => {
      const actual = (
        await db.query(
          'SELECT current_database() database,system_identifier::text id FROM pg_control_system()',
        )
      ).rows[0];
      assert.deepEqual(
        actual,
        { database: 'litigation', id: sourceClusterId },
        'configured source connection differs from the selected dump container',
      );
      if (sourceName !== PROJECT) {
        const port = sourceContainer.NetworkSettings.Ports['5432/tcp']?.[0]?.HostPort;
        await assertIsolatedTestCluster(db, new URL(`postgresql://127.0.0.1:${port}/litigation`));
      } else {
        assert.ok(
          !process.env['TASK40A_ISOLATED_TOKEN'] && !process.env['TASK40A_ISOLATED_CLUSTER'],
          'partial isolated source descriptor',
        );
      }
      const acl = (
        await db.query(
          'SELECT ARRAY(SELECT unnest(datacl)::text ORDER BY 1) acl FROM pg_database WHERE datname=current_database()',
        )
      ).rows[0]?.acl as string[];
      const expected = ['=c/litigation', 'litigation=CTc/litigation'];
      if (sourceName !== PROJECT && acl.includes('litigation_runtime=c/litigation'))
        expected.push('litigation_runtime=c/litigation');
      assert.deepEqual(
        acl,
        expected,
        'Source database ACL differs from the approved full-state clone profile',
      );
      return acl;
    },
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
  const token = randomUUID();
  const name = PREFIX + token;
  const volume = name + '-data';
  const network = name + '-net';
  const before = {
    containers: resourceNames('container'),
    volumes: resourceNames('volume'),
    networks: resourceNames('network'),
  };
  assert.ok(!before.containers.includes(name));
  assert.ok(!before.volumes.includes(volume));
  assert.ok(!before.networks.includes(network));
  assert.ok(project.Mounts.every((m) => m.Name !== volume));
  assert.ok(!(network in project.NetworkSettings.Networks));
  const password = randomBytes(36).toString('base64url');
  const runtimePassword = randomBytes(36).toString('base64url');
  const environment = { ...process.env, POSTGRES_PASSWORD: password };
  const created = { container: false, volume: false, network: false };
  let containerId: string | undefined;
  let networkId: string | undefined;
  try {
    // The complete plan is validated above, before creating any resource.
    docker(['volume', 'create', '--label', `${LABEL}=${token}`, volume]);
    created.volume = true;
    // Docker Desktop suppresses published ports on an internal bridge. A
    // dedicated bridge with an explicit loopback binding keeps this cluster
    // separate while allowing local test clients to reach it.
    networkId = docker([
      'network',
      'create',
      '--driver',
      'bridge',
      '--label',
      `${LABEL}=${token}`,
      network,
    ])
      .toString()
      .trim();
    created.network = true;
    containerId = docker(
      [
        'create',
        '--name',
        name,
        '--label',
        `${LABEL}=${token}`,
        '--network',
        network,
        '--publish',
        '127.0.0.1::5432',
        '--mount',
        `type=volume,source=${volume},target=/var/lib/postgresql/data`,
        '--env',
        'POSTGRES_USER=litigation',
        '--env',
        'POSTGRES_DB=litigation',
        '--env',
        'POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale-provider=icu --icu-locale=ar-EG --locale=C.UTF-8',
        '--env',
        'POSTGRES_PASSWORD',
        image.Id,
      ],
      undefined,
      environment,
    )
      .toString()
      .trim();
    created.container = true;
    const planned = inspect(name);
    assert.equal(planned.Id, containerId);
    assert.equal(planned.Image, image.Id);
    assert.equal(planned.Config.Labels[LABEL], token);
    assert.equal(planned.HostConfig.Privileged, false);
    assert.equal(planned.HostConfig.NetworkMode, network);
    assert.equal(
      planned.Mounts.length,
      1,
      'planned isolated container must have exactly one mount',
    );
    assert.equal(planned.Mounts[0]?.Type, 'volume');
    assert.equal(planned.Mounts[0]?.Name, volume);
    assert.equal(planned.Mounts[0]?.Destination, '/var/lib/postgresql/data');
    assert.ok(project.Mounts.every((m) => m.Source !== planned.Mounts[0]?.Source));
    docker(['start', name]);
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      // The official entrypoint's temporary initialization server has only a
      // Unix socket. Require TCP readiness to avoid racing its final restart.
      const probe = spawnSync(
        'docker',
        ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'litigation'],
        {
          windowsHide: true,
          stdio: 'ignore',
        },
      );
      if (probe.status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'isolated PostgreSQL readiness timed out');
    const running = inspect(name);
    const ports = running.NetworkSettings.Ports['5432/tcp'];
    assert.equal(
      ports?.length,
      1,
      'running isolated container must publish exactly one localhost endpoint',
    );
    const port = ports?.[0];
    assert.equal(port?.HostIp, '127.0.0.1');
    assert.ok(port && /^\d+$/u.test(port.HostPort) && port.HostPort !== '5433');
    assert.deepEqual(Object.keys(running.NetworkSettings.Networks), [network]);
    assert.equal(running.NetworkSettings.Networks[network]?.NetworkID, networkId);
    const migrationUrl = `postgresql://litigation:${password}@127.0.0.1:${port.HostPort}/litigation`;
    const runtimeUrl = `postgresql://litigation_runtime:${runtimePassword}@127.0.0.1:${port.HostPort}/litigation`;
    const clusterId = await withApprovedMigrationClient(
      async (db) => {
        const result = (
          await db.query<{ id: string; version: string }>(
            "SELECT system_identifier::text id,current_setting('server_version') version FROM pg_control_system()",
          )
        ).rows[0]!;
        assert.notEqual(result.id, sourceClusterId, 'fixture shares the project cluster');
        assert.ok(result.version.startsWith(VERSION + ' '));
        assert.deepEqual(
          (
            await db.query(
              `SELECT pg_encoding_to_char(encoding) encoding,datlocprovider::text provider,datlocale locale,datcollate collate,datctype ctype FROM pg_database WHERE datname=current_database()`,
            )
          ).rows,
          [
            {
              encoding: 'UTF8',
              provider: 'i',
              locale: 'ar-EG',
              collate: 'C.UTF-8',
              ctype: 'C.UTF-8',
            },
          ],
          'Disposable cluster must use the repository-approved Arabic ICU initialization',
        );
        // Distinct generated password, never copied from the project role.
        assert.match(runtimePassword, /^[A-Za-z0-9_-]+$/u);
        await db.query(
          `CREATE ROLE litigation_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${runtimePassword}'`,
        );
        return result.id;
      },
      { databaseUrl: migrationUrl },
    );
    console.log(
      `PASS isolated PostgreSQL ${VERSION}: ${name}; distinct cluster, owned volume/network, localhost-only port; image ${image.Id}`,
    );
    const childEnvironment = {
      ...process.env,
      MIGRATION_DATABASE_URL: migrationUrl,
      DATABASE_URL: runtimeUrl,
      TASK40A_ISOLATED_CONTAINER: name,
      TASK40A_ISOLATED_TOKEN: token,
      TASK40A_ISOLATED_CLUSTER: clusterId,
    };
    const createDatabase = async (database: string, template?: string) => {
      assert.match(database, /^litigation_task[0-9a-z_]+$/u);
      if (template)
        assert.ok(template === 'litigation' || /^litigation_task[0-9a-z_]+$/u.test(template));
      await withApprovedMigrationClient(
        async (db) => {
          assert.equal(
            (
              await db.query<{ id: string }>(
                'SELECT system_identifier::text id FROM pg_control_system()',
              )
            ).rows[0]?.id,
            clusterId,
          );
          await db.query(
            `CREATE DATABASE "${database}"${template ? ` TEMPLATE "${template}"` : ''}`,
          );
          if (template) {
            // CREATE DATABASE ... TEMPLATE copies tables, not the database
            // object's ACL. Preserve the independently checked source ACL.
            const acl = (
              await db.query(
                'SELECT ARRAY(SELECT unnest(datacl)::text ORDER BY 1) acl FROM pg_database WHERE datname=$1',
                [template],
              )
            ).rows[0]?.acl as string[];
            const approved = ['=c/litigation', 'litigation=CTc/litigation'];
            acl.sort();
            if (acl.includes('litigation_runtime=c/litigation'))
              approved.push('litigation_runtime=c/litigation');
            approved.sort();
            assert.deepEqual(acl, approved);
            await db.query(`REVOKE TEMPORARY ON DATABASE "${database}" FROM PUBLIC`);
            if (approved.length === 3)
              await db.query(`GRANT CONNECT ON DATABASE "${database}" TO litigation_runtime`);
            assert.deepEqual(
              (
                await db.query(
                  'SELECT ARRAY(SELECT unnest(datacl)::text ORDER BY 1) acl FROM pg_database WHERE datname=$1',
                  [database],
                )
              ).rows[0]?.acl.sort(),
              acl,
            );
          }
        },
        { databaseUrl: migrationUrl },
      );
      const target = new URL(migrationUrl);
      target.pathname = '/' + database;
      return target.toString();
    };
    const restoreProject = async () => {
      assert.deepEqual(projectIdentity(inspect(PROJECT)), originalProject);
      assert.deepEqual(projectIdentity(inspect(sourceName)), originalSource);
      let dump = docker([
        'exec',
        '-e',
        'PGOPTIONS=-c default_transaction_read_only=on',
        sourceName,
        'pg_dump',
        '-U',
        'litigation',
        '-d',
        'litigation',
        '--format=custom',
      ]);
      try {
        // Memory-to-stdin only: no dump, real role password or credential file.
        assert.equal(inspect(name).Id, containerId);
        docker(
          [
            'exec',
            '-i',
            name,
            'pg_restore',
            '-U',
            'litigation',
            '-d',
            'litigation',
            '--exit-on-error',
          ],
          dump,
        );
        // pg_dump without --create omits the database object's ACL. Restore
        // that independently verified state only on the new cluster.
        await withApprovedMigrationClient(
          async (db) => {
            assert.equal(
              (await db.query('SELECT system_identifier::text id FROM pg_control_system()')).rows[0]
                ?.id,
              clusterId,
            );
            await db.query('REVOKE TEMPORARY ON DATABASE litigation FROM PUBLIC');
            if (databaseAcl.includes('litigation_runtime=c/litigation'))
              await db.query('GRANT CONNECT ON DATABASE litigation TO litigation_runtime');
            assert.deepEqual(
              (
                await db.query(
                  'SELECT ARRAY(SELECT unnest(datacl)::text ORDER BY 1) acl FROM pg_database WHERE datname=current_database()',
                )
              ).rows[0]?.acl,
              databaseAcl,
            );
          },
          { databaseUrl: migrationUrl },
        );
      } finally {
        dump.fill(0);
        dump = Buffer.alloc(0);
      }
    };
    return await operation({
      container: name,
      clusterId,
      imageId: image.Id,
      migrationUrl,
      runtimeUrl,
      sourceClusterId,
      environment: childEnvironment,
      createDatabase,
      restoreProject,
    });
  } finally {
    // Validate each exact owned resource before removing it. Never prune,
    // force-remove, inspect/delete a glob, or repair a pre-existing resource.
    if (created.container) {
      const owned = inspect(name);
      assert.equal(owned.Id, containerId);
      assert.equal(owned.Config.Labels[LABEL], token);
      assert.equal(owned.Mounts.length, 1, 'cleanup ownership requires exactly one task volume');
      assert.equal(owned.Mounts[0]?.Name, volume);
      if (owned.State.Running) docker(['stop', '--time', '10', name]);
      docker(['rm', name]);
    }
    if (created.volume) {
      const owned = JSON.parse(docker(['volume', 'inspect', volume]).toString())[0] as {
        Name: string;
        Labels: Record<string, string>;
      };
      assert.equal(owned.Name, volume);
      assert.equal(owned.Labels[LABEL], token);
      docker(['volume', 'rm', volume]);
    }
    if (created.network) {
      const owned = JSON.parse(docker(['network', 'inspect', network]).toString())[0] as {
        Id: string;
        Labels: Record<string, string>;
        Containers: unknown;
      };
      assert.equal(owned.Id, networkId);
      assert.equal(owned.Labels[LABEL], token);
      assert.deepEqual(owned.Containers, {});
      docker(['network', 'rm', network]);
    }
    assert.deepEqual(
      projectIdentity(inspect(PROJECT)),
      originalProject,
      'project Docker identity/configuration changed',
    );
    assert.deepEqual(
      projectIdentity(inspect(sourceName)),
      originalSource,
      'source Docker identity/configuration changed',
    );
    assert.deepEqual(resourceNames('container'), before.containers);
    assert.deepEqual(resourceNames('volume'), before.volumes);
    assert.deepEqual(resourceNames('network'), before.networks);
    console.log(
      'PASS cleanup: exact task container, cluster/databases/roles/credentials, volume and network removed; pre-existing Docker resources unchanged; no dump file created',
    );
  }
}
