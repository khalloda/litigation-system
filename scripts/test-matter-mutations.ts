import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import type { Session } from 'next-auth';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { withIsolatedPostgres, assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { clientLogoFixtureState } from './lib/client-logo-fixture-state';
import { assertCurrentClientSource } from './lib/client-regression-source';
import { assertMatterEditBoundary } from './lib/matter-edit-checkpoint';
import { initialiseActors } from './test-client-contacts';
import { createDatabaseClient } from '../src/lib/db';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';
import { readMatterMutation, mutateMatter } from '../src/lib/matter-mutations';
import { proveMatterMutations } from './lib/matter-mutation-proof';
import { proveMatterReads } from './test-matter-read-only';
import { proveMatterCanonical } from './lib/matter-canonical-proof';
import { proveMatterSupplemental } from './lib/matter-supplemental-proof';
import { matterMigrationCatalog, assertMatterMigrationDelta } from './lib/matter-migration-delta';

async function main() {
  const output = process.env.MATTER_MUTATION_EVIDENCE_DIR;
  assert.ok(output && resolve(output) !== process.cwd());
  mkdirSync(output, { recursive: true });
  const tracked = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { windowsHide: true, encoding: 'utf8' },
  );
  assert.equal(tracked.status, 0);
  writeFileSync(
    join(output, 'proof-source-inventory.json'),
    JSON.stringify(
      [...new Set(tracked.stdout.split('\0').filter(Boolean))].sort().map((path) => {
        const bytes = readFileSync(path);
        return {
          path,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        };
      }),
      null,
      2,
    ),
  );
  const results: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    results.push({ name, details });
    writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log('PASS ' + name);
  };
  const source = await withApprovedMigrationClient(
    async (db) => ({
      state: await staffReadOnlyState(db),
      portable: await clientLogoFixtureState(db),
    }),
    { clientConfig: { options: '-c default_transaction_read_only=on' } },
  );
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
    await fixture.restoreProject();
    const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
      withApprovedMigrationClient(fn, { databaseUrl: fixture.migrationUrl });
    await inspect(async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      assert.equal(await assertCurrentClientSource(db), 63);
      assert.deepEqual((await staffReadOnlyState(db)).tables, source.state.tables);
      assert.deepEqual(await clientLogoFixtureState(db), source.portable);
    });
    pass('Full 63 restore: every table and portable catalog/sequence value equal');
    const catalogBefore = await inspect(matterMigrationCatalog);
    if (process.argv.includes('--canonical')) {
      await proveMatterCanonical(fixture, output);
      return;
    }
    await inspect(async (db) => {
      await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
      try {
        await db.query(
          readFileSync(
            'prisma/migrations/20260912120000_matter_editing_boundary/migration.sql',
            'utf8',
          ).replace(/COMMIT;\s*$/u, 'ROLLBACK;'),
        );
      } catch (error) {
        await db.query('ROLLBACK');
        const e = error as { code: string; message: string; where: string };
        writeFileSync(
          join(output, 'migration-diagnostic.json'),
          JSON.stringify({ code: e.code, message: e.message, where: e.where }, null, 2),
        );
        throw error;
      }
      assert.deepEqual((await staffReadOnlyState(db)).tables, source.state.tables);
    });
    pass('Complete candidate transaction rolls back without table changes');
    const migration = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'scripts/run-prisma-migration.ts', 'deploy'],
      {
        env: {
          ...fixture.environment,
          PRISMA_SCHEMA_ENGINE_BINARY: resolve(
            'node_modules/@prisma/engines/schema-engine-windows.exe',
          ),
        },
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 16000000,
      },
    );
    writeFileSync(
      join(output, 'migration.log'),
      (migration.stdout + migration.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
    );
    if (migration.status !== 0) {
      await inspect(async (db) => {
        await db.query('ROLLBACK');
        writeFileSync(
          join(output, 'failed-migration-state.json'),
          JSON.stringify(
            {
              ledger: (
                await db.query(
                  'SELECT migration_name,finished_at IS NOT NULL finished,rolled_back_at IS NOT NULL rolled_back,applied_steps_count FROM _prisma_migrations ORDER BY migration_name',
                )
              ).rows,
              state: await staffReadOnlyState(db),
            },
            null,
            2,
          ),
        );
      });
    }
    assert.equal(
      migration.status,
      0,
      'Migration failed; actual ledger/state preserved before cleanup',
    );
    await inspect(async (db) => {
      await assertMatterEditBoundary(db, 'historical-full-state-upgrade');
    });
    pass('Migration 64 original and current boundary');
    const catalogAfter = await inspect(matterMigrationCatalog);
    writeFileSync(
      join(output, 'migration-catalog-delta.json'),
      JSON.stringify(assertMatterMigrationDelta(catalogBefore, catalogAfter), null, 2),
    );
    pass('Exact named catalog delta and complete unchanged sequence states');
    const check = (label: string, script: string, args: string[] = []) => {
      const result = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', script, ...args],
        { env: fixture.environment, windowsHide: true, encoding: 'utf8', maxBuffer: 32000000 },
      );
      writeFileSync(
        join(output, label + '.log'),
        (result.stdout + result.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
      );
      assert.equal(result.status, 0, label + ' failed; retained log');
      pass(label);
    };
    if (
      !process.argv.includes('--editor-browser-only') &&
      !process.argv.includes('--supplemental') &&
      !process.argv.includes('--measure')
    )
      check('invariants-before', 'scripts/check-db.ts');
    await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
    if (process.argv.includes('--supplemental')) {
      await proveMatterSupplemental(fixture, output, createDatabaseClient(fixture.runtimeUrl));
      check('invariants-after-supplemental', 'scripts/check-db.ts');
      return;
    }
    if (process.argv.includes('--browser')) {
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
          'litigation',
        ],
        { input: readFileSync('docker/postgres/verify.sql'), windowsHide: true, encoding: 'utf8' },
      );
      writeFileSync(join(output, 'database-setup.log'), setup.stdout + setup.stderr);
      assert.equal(setup.status, 0, 'Database setup proof');
      if (!process.argv.includes('--editor-browser-only'))
        check('permissions', 'scripts/test-permissions.ts', ['--restored-fixture']);
      const cases = process.argv.includes('--editor-browser-only')
        ? null
        : await proveMatterReads(fixture, output);
      const { proveMatterBrowser } = await import('./test-matter-browser.mjs');
      const { proveMatterEditorBrowser } = await import('./lib/matter-editor-browser.mjs');
      await proveMatterBrowser(fixture, output, cases, proveMatterEditorBrowser);
      await proveMatterSupplemental(fixture, output, createDatabaseClient(fixture.runtimeUrl));
      check('invariants-after-browser', 'scripts/check-db.ts');
      return;
    }
    const runtime = createDatabaseClient(fixture.runtimeUrl);
    try {
      const accounts = await runtime.userAccount.findMany({
        select: { id: true, personId: true, username: true, roleCode: true, sessionVersion: true },
      });
      const session = (role: string): Session => {
        const rows = accounts.filter((a) => a.roleCode === role);
        assert.equal(rows.length, 1);
        const a = rows[0]!;
        return {
          expires: new Date(Date.now() + 3600000).toISOString(),
          user: {
            id: String(a.id),
            personId: a.personId,
            username: a.username,
            name: 'TEST ONLY',
            role: a.roleCode,
            sessionVersion: a.sessionVersion,
            mustChangePassword: false,
            auditSessionId: randomUUID(),
          },
        } as Session;
      };
      const admin = session('Administrator');
      const timings: unknown[] = [];
      const measurementPath = join(output, 'service-measurements.json');
      async function timed<T>(name: string, work: () => Promise<T>): Promise<T> {
        const start = performance.now();
        let outcome = 'rejected',
          bytes = 0;
        try {
          const result = await work();
          outcome = 'fulfilled';
          bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
          return result;
        } finally {
          timings.push({
            name,
            outcome,
            milliseconds: performance.now() - start,
            resultBytes: bytes,
          });
          writeFileSync(measurementPath, JSON.stringify(timings, null, 2));
        }
      }
      const read = (id: number | null, actor = admin) =>
        timed(id === null ? 'create form' : 'edit form', () =>
          readMatterMutation(actor, id === null ? 'create' : 'update', id, runtime),
        );
      const run = (action: 'create' | 'update', input: unknown, actor = admin) =>
        timed(action, () =>
          mutateMatter(actor, action, input, {
            database: runtime,
            auditMetadata: createMaintenanceAuditMetadata(),
          }),
        );
      const draft = {
        id: null,
        version: null,
        submission: randomUUID(),
        values: {
          subject: 'TEST ONLY Task 4.2 fixture\nJ 140ق',
          case_number_ar: 'TEST ONLY\n140J\n140ق',
        },
        parties: [],
        lawyers: [],
      };
      const options = await read(null);
      assert.ok(options.defaultType);
      const created = await run('create', draft);
      assert.ok(created.id > 0);
      assert.equal((await read(created.id)).record!.values.subject, draft.values.subject);
      assert.deepEqual(await run('create', draft), created);
      await assert.rejects(
        run('create', { ...draft, values: { subject: 'TEST ONLY altered payload' } }),
      );
      pass('Native create, exact lost-response retry and conflicting submission refusal');
      let snapshot = await read(created.id);
      const noOp = {
        id: created.id,
        version: snapshot.record!.version,
        submission: randomUUID(),
        values: {},
        parties: snapshot.parties,
        lawyers: snapshot.lawyers,
      };
      assert.equal((await run('update', noOp)).changed, false);
      const edit = {
        ...noOp,
        submission: randomUUID(),
        values: {
          notes_1: 'TEST ONLY changed\nsecond line',
          asked_amount: '9999999999999999.99',
          start_date: '2024-02-29',
        },
        parties: [
          {
            id: null,
            side: 'client',
            party_name: 'TEST ONLY PARTY',
            gender: null,
            ordinal: 1,
            roles: [
              { id: null, role_id: options.roles[0]!.id, ordinal: 1 },
              { id: null, role_id: options.roles[1]!.id, ordinal: 2 },
            ],
          },
        ],
        lawyers: options.people.slice(0, 3).map((p, i) => ({
          id: null,
          person_id: p.id,
          role: ['lead', 'co_lead', 'support'][i],
          position: i + 1,
        })),
      };
      const updated = await run('update', edit);
      assert.deepEqual(await run('update', edit), updated);
      snapshot = await read(created.id);
      assert.equal(snapshot.parties.length, 1);
      assert.equal(snapshot.parties[0]!.roles.length, 2);
      assert.equal(snapshot.lawyers.length, 3);
      assert.equal(snapshot.record!.values.asked_amount, '9999999999999999.99');
      await assert.rejects(run('update', { ...edit, submission: randomUUID() }));
      pass('Atomic parties/capacities/lawyers, exact decimal/date and stale refusal');
      for (const role of ['Lawyer', 'Paralegal']) {
        await assert.rejects(read(null, session(role)));
        await assert.rejects(run('create', { ...draft, submission: randomUUID() }, session(role)));
      }
      pass('Read-only roles denied form reads and writes');
      await inspect(async (db) => {
        await assertMatterEditBoundary(db, 'historical-full-state-upgrade');
      });
      pass('Current state remains exactly reconciled after native aggregate edits');
      if (process.argv.includes('--measure')) {
        pass(
          'Measured form reads, native create/update, exact retries and refusals; full current boundary verified',
        );
        return;
      }
      await proveMatterMutations(fixture, runtime, admin, session('Litigation Assistant'), output);
      check('invariants-after', 'scripts/check-db.ts');
    } finally {
      await runtime.$disconnect();
    }
  });
  assert.deepEqual(
    await withApprovedMigrationClient(staffReadOnlyState, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    }),
    source.state,
  );
  pass('Owned cleanup and exact source preservation');
}
void main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]')
      : 'Proof failed',
  );
  process.exitCode = 1;
});
