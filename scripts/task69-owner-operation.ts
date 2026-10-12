import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import type { ClientBase } from 'pg';
import { loadTask69Contract, type Json } from './lib/task69-contract';
import {
  assertTask69RuntimeBound,
  compileTask69Entries,
  task69SignedSession,
  type Task69PreparedOperation,
} from './lib/task69-runner';
import {
  TASK69_OWNER_ANCHOR,
  withTask69OwnerAuthority,
  assertTask69OwnerCapability,
  type Task69OwnerBinding,
  type Task69Target,
} from './lib/task69-owner-target';
import { prepareTask69OwnerOperation } from './lib/task69-owner-preparation';
import {
  task69ReadOnlyState,
  task69OwnerReadOnlyPreflight,
  assertTask69SealedPreflightState,
  lockTask69PreflightTables,
} from './lib/task69-owner-preflight';
import {
  executeTask69BoundPhase,
  task69BusinessSnapshot,
  task69Sequences,
  task69AuditState,
} from './lib/task69-operation-execution';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { assertStaffCheckpoint } from './lib/staff-roster-checkpoint';

import { classifyTask69Receipts } from './lib/task69-receipt-state';

type Request = {
  mode: 'owner' | 'rehearsal';
  target: Task69Target;
  connectionFile: string;
  approvedDirectory: string;
  outputFile: string;
  operationFile: string;
  baselineFile: string;
  initialPreflightFile: string;
  bindingFile: string;
  recoveryManifestFile: string;
  recoveryDumpFile: string;
  fixtureDescriptorFile?: string;
  authorityFile?: string;
  authoritySha256?: string;
  mandateTextFile?: string;
  sessionFile?: string;
  fault?: '--fault-before-journal' | '--fault-after-commit' | '--fault-unknown-commit';
};
const read = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')) as T;
const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
function save(path: string, value: unknown) {
  assert(isAbsolute(path), 'Explicit absolute evidence path required');
  const root = realpathSync(process.cwd()),
    dest = resolve(path),
    rel = relative(root, dest);
  assert(rel.startsWith('..') || isAbsolute(rel), 'Operation data must stay outside candidate Git');
  assert(
    !dest.toLowerCase().startsWith('d:\\projects\\litigation-system\\'),
    'Owner checkout is not an output directory',
  );
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
async function main() {
  const [action, requestFile, ...extra] = process.argv.slice(2);
  assert(
    action &&
      ['prepare', 'preflight', 'parents', 'remaining', 'inspect', 'compensate'].includes(action) &&
      requestFile &&
      !extra.length,
    'Usage: task69-owner-operation <action> <absolute request JSON>',
  );
  assert(isAbsolute(requestFile));
  const request = read<Request>(requestFile);
  assert(['owner', 'rehearsal'].includes(request.mode));
  assert(!existsSync(request.outputFile), 'An existing outcome must be read, never overwritten');
  const config = parse(readFileSync(request.connectionFile)),
    connection = config.MIGRATION_DATABASE_URL;
  assert(connection, 'Explicit connection file required');
  const url = new URL(connection);
  assert(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  assert.equal(url.hostname, request.target.hostname);
  assert.equal(Number(url.port || 5432), request.target.port);
  assert.equal(decodeURIComponent(url.pathname.slice(1)), request.target.database);
  assert.equal(url.hostname, '127.0.0.1');
  let fixtureEnvironment: NodeJS.ProcessEnv | undefined;
  if (request.mode === 'owner') {
    assert.deepEqual(
      {
        cluster: request.target.cluster,
        database: request.target.database,
        hostname: url.hostname,
        port: Number(url.port),
      },
      TASK69_OWNER_ANCHOR,
    );
    assert.equal(request.fixtureDescriptorFile, undefined);
    assert.equal(request.fault, undefined);
  } else {
    assert(request.fixtureDescriptorFile);
    const d = read<{
      name: string;
      token: string;
      cluster: string;
      database: string;
      port: string;
    }>(request.fixtureDescriptorFile);
    assert.equal(d.cluster, request.target.cluster);
    assert.equal(d.database, request.target.database);
    assert.equal(Number(d.port), request.target.port);
    assert.notEqual(d.cluster, TASK69_OWNER_ANCHOR.cluster);
    assert.notEqual(Number(d.port), 5433);
    assert.match(d.database, /^litigation_task69_[a-z0-9_]+$/u);
    fixtureEnvironment = {
      NODE_ENV: 'test',
      TASK40A_ISOLATED_CONTAINER: d.name,
      TASK40A_ISOLATED_TOKEN: d.token,
      TASK40A_ISOLATED_CLUSTER: d.cluster,
    };
  }
  const assertTarget = async (db: ClientBase) => {
    const identity = (
      await db.query(
        'SELECT current_database() database,(pg_control_system()).system_identifier::text cluster,inet_server_addr()::text server_address,inet_server_port() server_port',
      )
    ).rows[0];
    assert.deepEqual(identity, {
      database: request.target.database,
      cluster: request.target.cluster,
      server_address: request.target.serverAddress,
      server_port: request.target.serverPort,
    });
    if (fixtureEnvironment) await assertIsolatedTestCluster(db, url, fixtureEnvironment);
  };
  const readonly = async <T>(work: (db: ClientBase) => Promise<T>) =>
    withApprovedMigrationClient(
      async (db) => {
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        try {
          await db.query("SET LOCAL TIME ZONE 'UTC'");
          await db.query("SET LOCAL statement_timeout='180s'");
          await db.query("SET LOCAL lock_timeout='3s'");
          await assertTarget(db);
          return await work(db);
        } finally {
          await db.query('ROLLBACK');
        }
      },
      {
        databaseUrl: connection,
        clientConfig: {
          options: '-c default_transaction_read_only=on',
          application_name: 'task69-explicit-readonly-preflight',
        },
      },
    );
  const contract = loadTask69Contract(request.approvedDirectory);
  if (action === 'preflight') {
    const result = await readonly((db) => task69OwnerReadOnlyPreflight(db, contract));
    save(request.outputFile, result);
    console.log(
      JSON.stringify({
        status: result.status,
        conflicts: result.conflicts.length,
        sourceChecks: result.sourceChecks,
        referenceChecks: result.referenceChecks,
        output: request.outputFile,
      }),
    );
    assert.equal(result.status, 'PASS', 'Affected operation held for material drift');
    return;
  }
  if (action === 'prepare') {
    assert(
      !existsSync(request.operationFile) && !existsSync(request.baselineFile),
      'Prior proposal must be retained',
    );
    const binding = read<Task69OwnerBinding>(request.bindingFile);
    assert.equal(binding.mode, request.mode);
    assert.deepEqual(binding.target, request.target);
    const operation = prepareTask69OwnerOperation({
      directory: request.approvedDirectory,
      operationId: randomUUID(),
      binding,
      initialPreflightPath: request.initialPreflightFile,
      recoveryManifestPath: request.recoveryManifestFile,
    });
    const baseline = await readonly(async (db) => {
      const state = await task69ReadOnlyState(db);
      assertTask69SealedPreflightState(read(request.initialPreflightFile), state);
      return {
        capturedAt: new Date().toISOString(),
        sealedStateSha256: state.stateSha256,
        business: await task69BusinessSnapshotBeforeSchema(db),
        sequences: await task69Sequences(db),
        audit: await task69AuditState(db),
      };
    });
    save(request.baselineFile, baseline);
    save(request.operationFile, operation);
    save(request.outputFile, {
      status: 'PROPOSED_ONLY',
      operationId: operation.operationId,
      contractSha256: operation.contractSha256,
      mode: request.mode,
      target: request.target,
      executionAuthority: 'ABSENT',
      ownerWrites: 'NOT_APPLIED',
    });
    console.log('PROPOSED_ONLY; no operation registration or execution authority');
    return;
  }
  const operation = read<Task69PreparedOperation>(request.operationFile);
  assertTask69RuntimeBound(operation);
  assert.deepEqual(
    operation.allowlist,
    compileTask69Entries(contract),
    'Operation must contain the exact approved issue/dependency contract',
  );
  assert.equal(operation.targetCluster, request.target.cluster);
  assert.equal(operation.targetDatabase, request.target.database);
  if (action === 'inspect') {
    const result = await readonly(async (db) => {
      const found = (await db.query("SELECT to_regclass('_migration.task69_operation')::text name"))
        .rows[0].name;
      const rows = found
        ? (
            await db.query(
              'SELECT operation_id::text,contract_sha256,contract_text FROM _migration.task69_operation WHERE operation_id=$1',
              [operation.operationId],
            )
          ).rows
        : [];
      if (rows.length) {
        assert.equal(rows.length, 1);
        assert.equal(rows[0].contract_text, operation.contractText);
        assert.equal(rows[0].contract_sha256, operation.contractSha256);
      }
      const receipts = rows.length
        ? (
            await db.query(
              'SELECT operation_id::text,issue_id,phase,receipt_id::text FROM _migration.task69_receipt WHERE operation_id=$1 ORDER BY issue_id,phase',
              [operation.operationId],
            )
          ).rows
        : [];
      const activity = (
        await db.query(
          "SELECT pid,application_name,state,xact_start,query_start,wait_event_type,wait_event FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND application_name IN ('task69-explicit-owner-parents','task69-explicit-owner-remaining','task69-explicit-owner-compensate','task69-explicit-rehearsal-parents','task69-explicit-rehearsal-remaining','task69-explicit-rehearsal-compensate') AND (xact_start IS NOT NULL OR state='active') ORDER BY pid",
        )
      ).rows;
      const receiptState = classifyTask69Receipts(operation, receipts);
      return {
        status: 'READ_ONLY_OUTCOME_OBSERVATION',
        resolution: activity.length ? 'IN_FLIGHT_UNRESOLVED' : 'OBSERVED_COMPLETE_BOUNDARY',
        activity,
        receiptState,
        at: new Date().toISOString(),
        operationId: operation.operationId,
        target: request.target,
        registered: rows.length === 1,
        receipts,
        state: await task69ReadOnlyState(db),
        limit:
          'Presence/identity observation; exact retry revalidates source and postimages. No automatic apply or compensation.',
      };
    });
    save(request.outputFile, result);
    console.log(
      JSON.stringify({
        status: result.status,
        registered: result.registered,
        receipts: result.receipts.length,
      }),
    );
    return;
  }
  assert(action === 'parents' || action === 'remaining' || action === 'compensate');
  assert(
    request.authorityFile &&
      request.authoritySha256 &&
      request.mandateTextFile &&
      request.sessionFile,
    'Distinct explicit future execution mandate and genuine session required',
  );
  assert(
    !request.fault ||
      (request.mode === 'rehearsal' &&
        ['parents', 'remaining'].includes(action) &&
        ['--fault-before-journal', '--fault-after-commit', '--fault-unknown-commit'].includes(
          request.fault,
        )),
  );
  const authority = await task69SignedSession(request.sessionFile, config.AUTH_SECRET);
  assert(
    authority.absoluteExpiresAt - Date.now() >= 3 * 3600000,
    'At least three hours of genuine session validity required before each phase; no policy extension',
  );
  const outcome: Record<string, unknown> = {
    started: new Date().toISOString(),
    action,
    operation: operation.operationId,
    mode: request.mode,
    target: request.target,
    runnerSha256: operation.runnerSha256,
    schemaSha256: operation.schemaSha256,
    ownerActions: request.mode === 'rehearsal' ? 'NOT_APPLIED' : 'EXPLICIT_LATER_MANDATE',
  };
  // Each attempt has one immutable result. Intermediate progress stays in stdout.
  let persisted = false;
  const persist = () => {
    if (!persisted) {
      save(request.outputFile, { ...outcome, completed: new Date().toISOString() });
      persisted = true;
    }
  };
  await withApprovedMigrationClient(
    async (db) => {
      await withTask69OwnerAuthority(
        db,
        operation,
        {
          action,
          connectionUrl: connection,
          authorityPath: request.authorityFile!,
          authoritySha256: request.authoritySha256!,
          mandateTextPath: request.mandateTextFile!,
          initialPreflightPath: request.initialPreflightFile,
          recoveryManifestPath: request.recoveryManifestFile,
          recoveryDumpPath: request.recoveryDumpFile,
          fixtureEnvironment,
        },
        async () => {
          await db.query("SET TIME ZONE 'UTC'");
          assert.equal(await assertStaffCheckpoint(db, 'historical-full-state-upgrade'), 94);
          const fresh = await readonly(async (snapshot) => {
            const prior = (
              await snapshot.query(
                'SELECT count(*)::int n FROM _migration.task69_operation WHERE operation_id=$1',
                [operation.operationId],
              )
            ).rows[0].n;
            if (action === 'parents' && prior === 0) {
              const preflight = await task69OwnerReadOnlyPreflight(snapshot, contract);
              assert.equal(preflight.status, 'PASS', 'Fresh original guards conflict');
              assertTask69SealedPreflightState(read(request.initialPreflightFile), preflight.state);
              outcome.freshGuardCounts = {
                sources: preflight.sourceChecks,
                references: preflight.referenceChecks,
              };
            }
            return { at: new Date().toISOString(), state: await task69ReadOnlyState(snapshot) };
          });
          outcome.prewriteState = fresh;
          const beforeBind = async () => {
            // Lock before any SELECT establishes the SERIALIZABLE data snapshot.
            // A writer committed before this lock must be visible to the comparison.
            await lockTask69PreflightTables(db, fresh.state);
            await assertTask69OwnerCapability(db, operation);
            assertTask69RuntimeBound(operation);
            assert(
              Date.now() - Date.parse(fresh.at) < 15 * 60000,
              'Fresh phase preflight expired before locking',
            );
            const locked = await task69ReadOnlyState(db, 'locked-execution');
            assert.equal(
              locked.stateSha256,
              fresh.state.stateSha256,
              'State changed after preflight; no registration or sequence consumption',
            );
            await db.query("SET LOCAL statement_timeout='3h'");
          };
          await executeTask69BoundPhase({
            db,
            operation,
            contract,
            authority,
            action,
            fault: request.fault ?? '',
            baselineFile: request.baselineFile,
            beforeBind,
            beforeCommit: async () => {
              await assertTask69OwnerCapability(db, operation);
              assertTask69RuntimeBound(operation);
              await db.query(
                'SELECT _migration.task69_require_actor($1,$2,$3,$4::timestamptz,$5::uuid)',
                [
                  authority.userId,
                  authority.sessionVersion,
                  authority.role,
                  new Date(authority.absoluteExpiresAt).toISOString(),
                  authority.auditSessionId,
                ],
              );
            },
            outcome,
            persist,
          });
        },
      );
    },
    {
      databaseUrl: connection,
      clientConfig: { application_name: 'task69-explicit-' + request.mode + '-' + action },
    },
  );
  console.log(
    JSON.stringify({
      status: outcome.status,
      action,
      operation: operation.operationId,
      output: request.outputFile,
    }),
  );
}
/** Owner78 proposal has no new canonical tables. The future migration94
 * preparation creates a new reviewed baseline; never fabricate missing rows. */
async function task69BusinessSnapshotBeforeSchema(db: ClientBase) {
  const migration = (
    await db.query(
      'SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    )
  ).rows[0].n;
  if (migration === 94) return task69BusinessSnapshot(db);
  assert.equal(migration, 78);
  const result: Record<string, Json> = {};
  for (const table of [
    'matters',
    'matter_parties',
    'matter_party_roles',
    'matter_lawyers',
    'lookup_party_role',
    'lookup_court',
    'lookup_matter_destination',
    'admin_tasks',
    'task_actions',
    'powers_of_attorney',
    'power_of_attorney_lawyers',
    'documents',
    'fee_letters',
    'fee_letter_matters',
    'matter_fee_letter_references',
  ])
    result[table] = (
      await db.query(`SELECT to_jsonb(t) value FROM public.${quote(table)} t ORDER BY id`)
    ).rows.map((r) => r.value);
  return result;
}
main().catch((e: unknown) => {
  console.error(
    (e instanceof Error ? e.message : String(e)).replace(
      /postgres(?:ql)?:\/\/[^\s]+/gu,
      '[redacted connection]',
    ),
  );
  process.exitCode = 1;
});
