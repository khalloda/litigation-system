import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClientBase } from 'pg';
import { decode } from 'next-auth/jwt';
import { readSessionClaims, type SessionClaims } from '../../src/lib/auth/session';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture';
import { migrationDatabaseTarget, withApprovedMigrationClient } from './migration-principal';
import { task69FoundationFailures } from './task69-foundation-checkpoint';
import {
  loadTask69Contract,
  task69Canonical,
  task69Digest,
  task69Sha,
  type Json,
  type Row,
  type Task69Contract,
} from './task69-contract';

export type Task69OperationEntry = {
  issue_id: string;
  stage: string;
  unit_kind: 'issue' | 'dependency';
  entry_text: string;
  entry_sha256: string;
  payload_text: string;
  payload_sha256: string;
};
export type Task69PreparedOperation = {
  operationId: string;
  targetCluster: string;
  targetDatabase: string;
  registerSha256: string;
  planSha256: string;
  runnerSha256: string;
  schemaSha256: string;
  contractText: string;
  contractSha256: string;
  allowlist: Task69OperationEntry[];
};

/** Mechanical dependencies add no issue units and cannot broaden an approved
 * outcome. Lookup identity remains namespaced and exact; normalization is one
 * approved shared operation, never an independent same-label creation. */
export function compileTask69Entries(contract: Task69Contract): Task69OperationEntry[] {
  const result: Task69OperationEntry[] = [];
  const dependencies = new Map<string, Row>();
  const insert = (
    issueId: string,
    stage: string,
    unitKind: 'issue' | 'dependency',
    approvedOutcome: Row,
    details: Row,
  ) => {
    const payloadText = task69Canonical(approvedOutcome);
    const entryText = task69Canonical({ ...details, issueId, stage, unitKind, approvedOutcome });
    result.push({
      issue_id: issueId,
      stage,
      unit_kind: unitKind,
      entry_text: entryText,
      entry_sha256: task69Sha(entryText),
      payload_text: payloadText,
      payload_sha256: task69Sha(payloadText),
    });
  };
  const shared = (contract.dependencies as { dependencies: Row[] }).dependencies;
  assert.equal(shared.length, 1);
  assert.equal(shared[0]!.id, 'DEST-INVESTMENT-26-32');
  dependencies.set(String(shared[0]!.id), shared[0]!);
  for (const [stage, ids] of Object.entries(contract.stages))
    for (const id of ids) {
      const e = contract.byIssue.get(id)!;
      insert(id, stage, 'issue', e.approvedOutcome, {
        source: e.originalIssue.original,
        sourceObjectSha256: e.originalJsonSha256,
        sourceRecordKey: e.sourceRecordKey,
        extractionSha256: e.extractionSha256,
        authority: e.authority,
        guards: e.expectedStateGuards as unknown as Json,
        dependencies: e.dependencies,
        disposition: e.disposition,
      });
      for (const lookup of e.expectedStateGuards.lookupPreconditions) {
        if (lookup.expectedCardinality !== 0) continue;
        const normalization = shared[0]!;
        if (
          lookup.table === normalization.namespace &&
          lookup.exactLabel === normalization.canonicalLabel
        )
          continue;
        const key = 'LOOKUP/' + task69Digest({ namespace: lookup.table, label: lookup.exactLabel });
        const payload: Row = {
          namespace: lookup.table,
          exactLabel: lookup.exactLabel,
          expectedIds: [],
          expectedCardinality: 0,
        };
        const existing = dependencies.get(key);
        if (existing) assert.equal(task69Digest(existing), task69Digest(payload));
        else dependencies.set(key, payload);
      }
      for (const value of e.expectedStateGuards.parentDependencies) {
        assert.ok(value && !Array.isArray(value) && typeof value === 'object');
        if (typeof value.id !== 'string' || !value.id.startsWith('GENERATED-PARENT/')) continue;
        const existing = dependencies.get(value.id);
        if (existing) assert.equal(task69Digest(existing), task69Digest(value));
        else dependencies.set(value.id, value);
      }
    }
  for (const [id, payload] of [...dependencies].sort(([a], [b]) => a.localeCompare(b))) {
    insert(id, 'shared-dependency', 'dependency', payload, { addsIssueUnits: 0 });
  }
  assert.equal(result.filter((r) => r.unit_kind === 'issue').length, 3465);
  assert.equal(new Set(result.map((r) => r.issue_id)).size, result.length);
  return result;
}

export function prepareTask69Operation(input: {
  directory: string;
  operationId: string;
  cluster: string;
  database: string;
  runnerSha256: string;
  schemaSha256: string;
}): Task69PreparedOperation {
  assert.match(input.operationId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
  assert.match(input.cluster, /^[0-9]+$/u);
  assert.match(input.database, /^litigation_task69_[a-z0-9_]+$/u);
  assert.match(input.runnerSha256, /^[a-f0-9]{64}$/u);
  assert.match(input.schemaSha256, /^[a-f0-9]{64}$/u);
  const contract = loadTask69Contract(input.directory);
  const allowlist = compileTask69Entries(contract);
  const value = {
    operationId: input.operationId,
    registerSha256: contract.inputs['decision-register.json'],
    planSha256: contract.inputs['implementation-plan.md'],
    runnerSha256: input.runnerSha256,
    schemaSha256: input.schemaSha256,
    entries: Object.fromEntries(allowlist.map((entry) => [entry.issue_id, entry.entry_sha256])),
  };
  const contractText = task69Canonical(value);
  return {
    ...value,
    targetCluster: input.cluster,
    targetDatabase: input.database,
    contractText,
    contractSha256: task69Sha(contractText),
    allowlist,
  };
}

export async function task69SignedSession(path: string): Promise<SessionClaims> {
  const stored = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(['authjs.session-token', '__Secure-authjs.session-token'].includes(stored.cookieName));
  assert.equal(typeof stored.token, 'string');
  assert.ok(process.env['AUTH_SECRET'], 'Fixture app authentication secret required');
  const decoded = await decode({
    token: stored.token,
    salt: stored.cookieName,
    secret: process.env['AUTH_SECRET'],
  });
  assert.ok(decoded);
  const claims = readSessionClaims(decoded);
  assert.ok(
    claims &&
      !claims.mustChangePassword &&
      claims.authenticatedAt <= Date.now() + 60000 &&
      claims.absoluteExpiresAt > Date.now(),
  );
  assert.ok(['Administrator', 'Litigation Assistant'].includes(claims.role));
  return claims;
}

export async function withTask69Fixture<T>(
  operation: Task69PreparedOperation,
  work: (db: ClientBase) => Promise<T>,
): Promise<T> {
  const target = migrationDatabaseTarget();
  const url = new URL(`${target.protocol}//${target.hostname}:${target.port}/${target.database}`);
  assert.equal(url.pathname, '/' + operation.targetDatabase);
  return withApprovedMigrationClient(async (db) => {
    await assertIsolatedTestCluster(db, url);
    assert.equal(
      (await db.query('SELECT (pg_control_system()).system_identifier::text cluster')).rows[0]
        .cluster,
      operation.targetCluster,
    );
    assert.deepEqual(await task69FoundationFailures(db), []);
    return work(db);
  });
}

/** Preparation writes only a private, immutable contract. The complete body,
 * not a count, is compared on retries; source execution has separate receipts. */
export async function registerTask69Operation(
  db: ClientBase,
  operation: Task69PreparedOperation,
  authority: SessionClaims,
): Promise<'registered' | 'already-registered'> {
  const target = migrationDatabaseTarget();
  await assertIsolatedTestCluster(
    db,
    new URL(`${target.protocol}//${target.hostname}:${target.port}/${target.database}`),
  );
  const actual = (
    await db.query(
      'SELECT current_database() database,(pg_control_system()).system_identifier::text cluster',
    )
  ).rows[0];
  assert.deepEqual(actual, {
    database: operation.targetDatabase,
    cluster: operation.targetCluster,
  });
  assert.match(operation.targetDatabase, /^litigation_task69_[a-z0-9_]+$/u);
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    const result = await bindTask69Operation(db, operation, authority);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

/** Transaction-local contract insertion; the caller owns commit/rollback. */
export async function bindTask69Operation(
  db: ClientBase,
  operation: Task69PreparedOperation,
  authority: SessionClaims,
): Promise<'registered' | 'already-registered'> {
  const target = migrationDatabaseTarget();
  await assertIsolatedTestCluster(
    db,
    new URL(`${target.protocol}//${target.hostname}:${target.port}/${target.database}`),
  );
  const state = (
    await db.query(
      "SELECT current_database() database,(pg_control_system()).system_identifier::text cluster,current_setting('transaction_isolation') isolation",
    )
  ).rows[0];
  assert.deepEqual(state, {
    database: operation.targetDatabase,
    cluster: operation.targetCluster,
    isolation: 'serializable',
  });
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    'task69/' + operation.operationId,
  ]);
  await db.query('SELECT _migration.task69_require_actor($1,$2,$3,$4::timestamptz,$5::uuid)', [
    authority.userId,
    authority.sessionVersion,
    authority.role,
    new Date(authority.absoluteExpiresAt).toISOString(),
    authority.auditSessionId,
  ]);
  const existing = (
    await db.query(
      'SELECT contract_text,contract_sha256 FROM _migration.task69_operation WHERE operation_id=$1 FOR SHARE',
      [operation.operationId],
    )
  ).rows;
  if (existing.length) {
    assert.equal(existing.length, 1);
    assert.equal(existing[0].contract_text, operation.contractText, 'Conflicting prior operation');
    assert.equal(existing[0].contract_sha256, operation.contractSha256);
    assert.equal(
      (await db.query('SELECT _migration.task69_contract_valid($1) valid', [operation.operationId]))
        .rows[0].valid,
      true,
    );
    return 'already-registered';
  }
  await db.query(
    'INSERT INTO _migration.task69_operation(operation_id,target_cluster,target_database,register_sha256,plan_sha256,runner_sha256,schema_sha256,contract_text,contract_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      operation.operationId,
      operation.targetCluster,
      operation.targetDatabase,
      operation.registerSha256,
      operation.planSha256,
      operation.runnerSha256,
      operation.schemaSha256,
      operation.contractText,
      operation.contractSha256,
    ],
  );
  await db.query(
    'INSERT INTO _migration.task69_allowlist(operation_id,issue_id,stage,unit_kind,entry_text,entry_sha256,payload_text,payload_sha256) SELECT $1::uuid,x.* FROM jsonb_to_recordset($2::jsonb) AS x(issue_id text,stage text,unit_kind text,entry_text text,entry_sha256 text,payload_text text,payload_sha256 text)',
    [operation.operationId, JSON.stringify(operation.allowlist)],
  );
  return 'registered';
}

export function task69RunnerSourceDigest(repository: string): string {
  return task69Digest(
    Object.fromEntries(
      [
        'scripts/lib/task69-contract.ts',
        'scripts/lib/task69-runner.ts',
        'scripts/lib/task69-preflight.ts',
      ].map((name) => [name, task69Sha(readFileSync(join(repository, name)))]),
    ),
  );
}
