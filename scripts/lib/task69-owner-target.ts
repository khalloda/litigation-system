import assert from 'node:assert/strict';
import { isIPv4 } from 'node:net';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { task69Digest, task69Sha, TASK69_INPUTS, type Json } from './task69-contract';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture';
import type { Task69PreparedOperation } from './task69-runner';

export const TASK69_OWNER_ANCHOR = {
  cluster: '7676117521894273062',
  database: 'litigation',
  hostname: '127.0.0.1',
  port: 5433,
} as const;
export type Task69Target = {
  cluster: string;
  database: string;
  hostname: string;
  port: number;
  serverAddress: string;
  serverPort: number;
};
export type Task69OwnerBinding = {
  kind: 'task69-owner-preparation-v1';
  mode: 'owner' | 'rehearsal';
  target: Task69Target;
  acceptedBase: '47835caec58be16cd5dc72b14f4564bbfd4cc568';
  sourceCommit: string;
  initialPreflightSha256: string;
  recoveryManifestSha256: string;
  recoveryDumpSha256: string;
  recoveryDumpBytes: number;
};
export type Task69ExecutionAuthority = {
  kind: 'TASK69_OWNER_EXECUTION' | 'TASK69_REHEARSAL_ONLY';
  owner: 'Khaled Helmy';
  operationId: string;
  contractSha256: string;
  bindingSha256: string;
  approvedSourceCommit: string;
  runnerSha256: string;
  schemaSha256: string;
  actions: ('parents' | 'remaining' | 'compensate')[];
  issuedAt: string;
  expiresAt: string;
  mandateTextSha256: string;
};
const capabilities = new WeakMap<
  ClientBase,
  { operation: string; contract: string; binding: Task69OwnerBinding; expires: number }
>();
export function task69OwnerBinding(operation: Task69PreparedOperation): Task69OwnerBinding | null {
  const body = JSON.parse(operation.contractText);
  return body.ownerPreparation ?? null;
}
export function validateTask69OwnerBinding(binding: Task69OwnerBinding): void {
  assert.equal(binding.kind, 'task69-owner-preparation-v1');
  assert(['owner', 'rehearsal'].includes(binding.mode));
  assert.equal(binding.acceptedBase, '47835caec58be16cd5dc72b14f4564bbfd4cc568');
  assert.match(binding.sourceCommit, /^[a-f0-9]{40}$/u);
  for (const hash of [
    binding.initialPreflightSha256,
    binding.recoveryManifestSha256,
    binding.recoveryDumpSha256,
  ])
    assert.match(hash, /^[a-f0-9]{64}$/u);
  assert(Number.isSafeInteger(binding.recoveryDumpBytes) && binding.recoveryDumpBytes > 0);
  assert.equal(binding.target.hostname, '127.0.0.1');
  assert(
    Number.isInteger(binding.target.port) &&
      binding.target.port > 0 &&
      binding.target.port <= 65535,
  );
  assert.match(binding.target.cluster, /^[0-9]+$/u);
  assert.equal(binding.target.serverPort, 5432);
  const [address, prefix, ...extra] = binding.target.serverAddress.split('/');
  assert(
    isIPv4(address!) && (prefix === undefined || prefix === '32') && extra.length === 0,
    'Exact PostgreSQL IPv4 host address required',
  );
  if (binding.mode === 'owner')
    assert.deepEqual(
      {
        cluster: binding.target.cluster,
        database: binding.target.database,
        hostname: binding.target.hostname,
        port: binding.target.port,
      },
      TASK69_OWNER_ANCHOR,
    );
  else {
    assert.notEqual(binding.target.cluster, TASK69_OWNER_ANCHOR.cluster);
    assert.notEqual(binding.target.port, TASK69_OWNER_ANCHOR.port);
    assert.match(binding.target.database, /^litigation_task69_[a-z0-9_]+$/u);
  }
}
export function validateTask69ExecutionAuthority(
  operation: Task69PreparedOperation,
  authority: Task69ExecutionAuthority,
  action: 'parents' | 'remaining' | 'compensate',
  now = Date.now(),
): Task69OwnerBinding {
  const binding = task69OwnerBinding(operation);
  assert(binding, 'Explicit sealed owner/rehearsal binding required');
  validateTask69OwnerBinding(binding);
  assert.equal(
    task69Sha(operation.contractText),
    operation.contractSha256,
    'Operation body seal differs',
  );
  assert.equal(operation.targetCluster, binding.target.cluster);
  assert.equal(operation.targetDatabase, binding.target.database);
  const body = JSON.parse(operation.contractText);
  for (const key of [
    'operationId',
    'registerSha256',
    'planSha256',
    'runnerSha256',
    'schemaSha256',
  ] as const)
    assert.equal(body[key], operation[key]);
  assert.equal(operation.registerSha256, TASK69_INPUTS['decision-register.json']);
  assert.equal(operation.planSha256, TASK69_INPUTS['implementation-plan.md']);
  assert.equal(operation.allowlist.length, 3585);
  assert.equal(operation.allowlist.filter((e) => e.unit_kind === 'issue').length, 3465);
  assert.deepEqual(
    body.entries,
    Object.fromEntries(operation.allowlist.map((e) => [e.issue_id, e.entry_sha256])),
  );
  for (const entry of operation.allowlist) {
    assert.equal(task69Sha(entry.entry_text), entry.entry_sha256);
    assert.equal(task69Sha(entry.payload_text), entry.payload_sha256);
  }
  assert.equal(
    authority.kind,
    binding.mode === 'owner' ? 'TASK69_OWNER_EXECUTION' : 'TASK69_REHEARSAL_ONLY',
    'A preparation or rehearsal is not an owner execution mandate',
  );
  assert.equal(authority.owner, 'Khaled Helmy');
  assert.equal(authority.operationId, operation.operationId);
  assert.equal(authority.contractSha256, operation.contractSha256);
  assert.equal(authority.bindingSha256, task69Digest(binding as unknown as Json));
  assert.equal(authority.approvedSourceCommit, binding.sourceCommit);
  assert.equal(authority.runnerSha256, operation.runnerSha256);
  assert.equal(authority.schemaSha256, operation.schemaSha256);
  assert(
    authority.actions.length > 0 &&
      authority.actions.every((a) => ['parents', 'remaining', 'compensate'].includes(a)),
  );
  assert(authority.actions.includes(action));
  const issued = Date.parse(authority.issuedAt),
    expiry = Date.parse(authority.expiresAt);
  assert(
    Number.isFinite(issued) &&
      Number.isFinite(expiry) &&
      issued <= now &&
      now < expiry &&
      expiry - issued <= 24 * 3600000,
    'Mandate has expired or is not bounded to one day',
  );
  assert.match(authority.mandateTextSha256, /^[a-f0-9]{64}$/u);
  return binding;
}
async function assertTarget(db: ClientBase, target: Task69Target) {
  const actual = (
    await db.query(
      'SELECT current_database() database,(pg_control_system()).system_identifier::text cluster,inet_server_addr()::text server_address,inet_server_port() server_port',
    )
  ).rows[0];
  assert.deepEqual(
    actual,
    {
      database: target.database,
      cluster: target.cluster,
      server_address: target.serverAddress,
      server_port: target.serverPort,
    },
    'Exact server/cluster/database target differs',
  );
}
/** The ordinary fixture path never calls this. A capability exists only during
 * this explicit local command, after a distinct sealed execution mandate,
 * immutable recovery bytes and exact connection identity have been verified.
 * Environment variables cannot grant this capability. */
export async function withTask69OwnerAuthority<T>(
  db: ClientBase,
  operation: Task69PreparedOperation,
  input: {
    action: 'parents' | 'remaining' | 'compensate';
    connectionUrl: string;
    authorityPath: string;
    authoritySha256: string;
    mandateTextPath: string;
    recoveryManifestPath: string;
    recoveryDumpPath: string;
    initialPreflightPath: string;
    fixtureEnvironment?: NodeJS.ProcessEnv;
  },
  work: () => Promise<T>,
): Promise<T> {
  assert(!capabilities.has(db), 'Nested authority scope refused');
  const bytes = readFileSync(input.authorityPath);
  assert.equal(task69Sha(bytes), input.authoritySha256, 'Explicit mandate file seal differs');
  const authority = JSON.parse(bytes.toString('utf8')) as Task69ExecutionAuthority;
  const binding = validateTask69ExecutionAuthority(operation, authority, input.action);
  assert.equal(task69Sha(readFileSync(input.mandateTextPath)), authority.mandateTextSha256);
  assert.equal(task69Sha(readFileSync(input.initialPreflightPath)), binding.initialPreflightSha256);
  const preflight = JSON.parse(readFileSync(input.initialPreflightPath, 'utf8'));
  assert.equal(preflight.status, 'PASS');
  assert.equal(
    preflight.migrations,
    94,
    'Migration78 proposal is not executable: after separately authorized migration, revalidate and seal pristine94 with a distinct future execution mandate',
  );
  assert.equal(preflight.identity.cluster, binding.target.cluster);
  assert.equal(preflight.identity.database, binding.target.database);
  assert.equal(task69Sha(readFileSync(input.recoveryManifestPath)), binding.recoveryManifestSha256);
  const dump = readFileSync(input.recoveryDumpPath);
  assert.equal(dump.length, binding.recoveryDumpBytes);
  assert.equal(task69Sha(dump), binding.recoveryDumpSha256);
  const url = new URL(input.connectionUrl);
  assert(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, binding.target.hostname);
  assert.equal(Number(url.port || 5432), binding.target.port);
  assert.equal(decodeURIComponent(url.pathname.slice(1)), binding.target.database);
  assert.equal(url.search, '', 'Connection query overrides refused');
  assert.equal(url.hash, '');
  await assertTarget(db, binding.target);
  const principal = (
    await db.query(
      'SELECT session_user,current_user,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) superuser',
    )
  ).rows[0];
  assert.equal(principal.session_user, principal.current_user);
  assert.equal(principal.superuser, true);
  assert.notEqual(principal.current_user, 'litigation_runtime');
  if (binding.mode === 'rehearsal')
    await assertIsolatedTestCluster(db, url, input.fixtureEnvironment ?? { NODE_ENV: 'test' });
  else
    assert.equal(input.fixtureEnvironment, undefined, 'Owner mode cannot carry a fixture identity');
  capabilities.set(db, {
    operation: operation.operationId,
    contract: operation.contractSha256,
    binding,
    expires: Date.parse(authority.expiresAt),
  });
  try {
    return await work();
  } finally {
    capabilities.delete(db);
  }
}
export async function assertTask69OwnerCapability(
  db: ClientBase,
  operation: Task69PreparedOperation,
): Promise<void> {
  const grant = capabilities.get(db);
  assert(grant, 'Future owner execution authority is absent');
  assert.equal(grant.operation, operation.operationId);
  assert.equal(grant.contract, operation.contractSha256);
  assert(Date.now() < grant.expires, 'Execution mandate expired');
  assert.deepEqual(task69OwnerBinding(operation), grant.binding);
  await assertTarget(db, grant.binding.target);
}
