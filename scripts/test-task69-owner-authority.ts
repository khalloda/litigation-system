import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  loadTask69Contract,
  task69Canonical,
  task69Digest,
  task69Sha,
  type Json,
} from './lib/task69-contract';
import {
  compileTask69Entries,
  prepareTask69Operation,
  assertTask69RuntimeBound,
  task69RunnerSourceDigest,
  task69SchemaSourceDigest,
  type Task69PreparedOperation,
} from './lib/task69-runner';
import {
  validateTask69OwnerBinding,
  validateTask69ExecutionAuthority,
  type Task69OwnerBinding,
  type Task69ExecutionAuthority,
} from './lib/task69-owner-target';

const root = process.env.TASK69_PRIVATE_ROOT!,
  output = process.env.TASK69_EVIDENCE_OUTPUT!,
  contract = loadTask69Contract(process.env.TASK69_APPROVED_DIRECTORY!);
const d = JSON.parse(readFileSync(join(root, 'fixture-descriptor.json'), 'utf8'));
const hash = '1'.repeat(64),
  now = Date.now(),
  checks: { name: string; status: string; message?: string }[] = [];
const binding: Task69OwnerBinding = {
  kind: 'task69-owner-preparation-v1',
  mode: 'rehearsal',
  target: {
    cluster: d.cluster,
    database: d.database,
    hostname: '127.0.0.1',
    port: Number(d.port),
    serverAddress: '172.20.0.2',
    serverPort: 5432,
  },
  acceptedBase: '47835caec58be16cd5dc72b14f4564bbfd4cc568',
  sourceCommit: '47835caec58be16cd5dc72b14f4564bbfd4cc568',
  initialPreflightSha256: hash,
  recoveryManifestSha256: hash,
  recoveryDumpSha256: hash,
  recoveryDumpBytes: 1,
};
const allowlist = compileTask69Entries(contract);
const body = {
  operationId: randomUUID(),
  registerSha256: contract.inputs['decision-register.json'],
  planSha256: contract.inputs['implementation-plan.md'],
  runnerSha256: task69RunnerSourceDigest(process.cwd()),
  schemaSha256: task69SchemaSourceDigest(process.cwd()),
  entries: Object.fromEntries(allowlist.map((e) => [e.issue_id, e.entry_sha256])),
  ownerPreparation: binding,
};
const contractText = task69Canonical(body as unknown as Json);
const operation: Task69PreparedOperation = {
  ...body,
  targetCluster: d.cluster,
  targetDatabase: d.database,
  contractText,
  contractSha256: task69Sha(contractText),
  allowlist,
};
const authority: Task69ExecutionAuthority = {
  kind: 'TASK69_REHEARSAL_ONLY',
  owner: 'Khaled Helmy',
  operationId: operation.operationId,
  contractSha256: operation.contractSha256,
  bindingSha256: task69Digest(binding as unknown as Json),
  approvedSourceCommit: binding.sourceCommit,
  runnerSha256: operation.runnerSha256,
  schemaSha256: operation.schemaSha256,
  actions: ['parents', 'remaining', 'compensate'],
  issuedAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
  mandateTextSha256: hash,
};
function rejects(name: string, run: () => unknown) {
  let message = '';
  try {
    run();
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  assert(message, name + ' unexpectedly passed');
  checks.push({ name, status: 'REFUSED', message });
}
validateTask69ExecutionAuthority(operation, authority, 'parents', now);
checks.push({
  name: 'well-formed rehearsal authority structure (not an executed operation)',
  status: 'PASS',
});
rejects('preparation is not execution', () =>
  validateTask69ExecutionAuthority(
    operation,
    { ...authority, kind: 'PROPOSED_ONLY' } as unknown as Task69ExecutionAuthority,
    'parents',
    now,
  ),
);
rejects('rehearsal cannot name owner cluster', () =>
  validateTask69OwnerBinding({
    ...binding,
    target: { ...binding.target, cluster: '7676117521894273062' },
  }),
);
rejects('rehearsal cannot use owner port', () =>
  validateTask69OwnerBinding({ ...binding, target: { ...binding.target, port: 5433 } }),
);
rejects('rehearsal cannot use owner database name', () =>
  validateTask69OwnerBinding({ ...binding, target: { ...binding.target, database: 'litigation' } }),
);
rejects('owner identity cannot be only a database name', () =>
  validateTask69OwnerBinding({
    ...binding,
    mode: 'owner',
    target: { ...binding.target, database: 'litigation' },
  }),
);
rejects('fixture constructor still rejects owner database', () =>
  prepareTask69Operation({
    directory: contract.root,
    operationId: randomUUID(),
    cluster: '7676117521894273062',
    database: 'litigation',
    runnerSha256: body.runnerSha256,
    schemaSha256: body.schemaSha256,
  }),
);
rejects('foreign operation authority', () =>
  validateTask69ExecutionAuthority(
    operation,
    { ...authority, operationId: randomUUID() },
    'parents',
    now,
  ),
);
rejects('changed plan', () =>
  validateTask69ExecutionAuthority({ ...operation, planSha256: hash }, authority, 'parents', now),
);
rejects('changed source', () => assertTask69RuntimeBound({ ...operation, runnerSha256: hash }));
rejects('changed schema', () => assertTask69RuntimeBound({ ...operation, schemaSha256: hash }));
rejects('foreign target cluster', () =>
  validateTask69ExecutionAuthority(
    { ...operation, targetCluster: '123' },
    authority,
    'parents',
    now,
  ),
);
rejects('foreign target database', () =>
  validateTask69ExecutionAuthority(
    { ...operation, targetDatabase: 'litigation_task69_wrong' },
    authority,
    'parents',
    now,
  ),
);
rejects('different sealed body', () =>
  validateTask69ExecutionAuthority(
    { ...operation, contractText: operation.contractText + ' ' },
    authority,
    'parents',
    now,
  ),
);
rejects('rehearsal authority cannot stand in for owner mandate', () =>
  validateTask69ExecutionAuthority(
    operation,
    { ...authority, kind: 'TASK69_OWNER_EXECUTION' },
    'parents',
    now,
  ),
);
rejects('expired mandate', () =>
  validateTask69ExecutionAuthority(
    operation,
    { ...authority, expiresAt: new Date(now - 1).toISOString() },
    'parents',
    now,
  ),
);
rejects('future-dated mandate', () =>
  validateTask69ExecutionAuthority(
    operation,
    { ...authority, issuedAt: new Date(now + 1).toISOString() },
    'parents',
    now,
  ),
);
rejects('unbounded mandate duration', () =>
  validateTask69ExecutionAuthority(
    operation,
    { ...authority, expiresAt: new Date(now + 48 * 3600000).toISOString() },
    'parents',
    now,
  ),
);
rejects('unapproved compensation action', () =>
  validateTask69ExecutionAuthority(
    operation,
    { ...authority, actions: ['parents'] },
    'compensate',
    now,
  ),
);
rejects('wrong recovery binding', () =>
  validateTask69ExecutionAuthority(
    operation,
    { ...authority, bindingSha256: hash },
    'parents',
    now,
  ),
);
writeFileSync(
  output,
  JSON.stringify(
    {
      status: 'PASS',
      checks,
      ownerActions: 'NOT_APPLIED',
      scope:
        'Structural authority negatives; no database mutation or owner execution; real database entry checks are a separate gate.',
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
console.log(JSON.stringify({ status: 'PASS', checks: checks.length, output }));
