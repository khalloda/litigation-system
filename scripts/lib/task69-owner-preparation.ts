import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadTask69Contract, task69Canonical, task69Sha, type Json } from './task69-contract';
import {
  compileTask69Entries,
  task69RunnerSourceDigest,
  task69SchemaSourceDigest,
  type Task69PreparedOperation,
} from './task69-runner';
import { validateTask69OwnerBinding, type Task69OwnerBinding } from './task69-owner-target';

/** Artifact-only construction. A PROPOSED operation is not an execution grant. */
export function prepareTask69OwnerOperation(input: {
  directory: string;
  operationId: string;
  binding: Task69OwnerBinding;
  initialPreflightPath: string;
  recoveryManifestPath: string;
}): Task69PreparedOperation {
  assert.match(input.operationId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
  validateTask69OwnerBinding(input.binding);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
  ) as NodeJS.ProcessEnv;
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  assert.equal(
    git('rev-parse', 'HEAD'),
    input.binding.sourceCommit,
    'Exact source commit required',
  );
  assert.equal(git('status', '--porcelain'), '', 'Only a clean committed candidate can be sealed');
  git('merge-base', '--is-ancestor', input.binding.acceptedBase, input.binding.sourceCommit);
  const preflightBytes = readFileSync(input.initialPreflightPath);
  assert.equal(task69Sha(preflightBytes), input.binding.initialPreflightSha256);
  const preflight = JSON.parse(preflightBytes.toString('utf8'));
  assert.equal(preflight.status, 'PASS');
  assert.equal(preflight.conflicts.length, 0);
  assert.equal(preflight.sourceChecks, 3465);
  assert.equal(preflight.referenceChecks, 13283);
  assert.equal(preflight.identity.cluster, input.binding.target.cluster);
  assert.equal(preflight.identity.database, input.binding.target.database);
  assert.equal(
    task69Sha(readFileSync(input.recoveryManifestPath)),
    input.binding.recoveryManifestSha256,
  );
  const contract = loadTask69Contract(input.directory),
    allowlist = compileTask69Entries(contract);
  assert.equal(allowlist.length, 3585);
  const value = {
    operationId: input.operationId,
    registerSha256: contract.inputs['decision-register.json'],
    planSha256: contract.inputs['implementation-plan.md'],
    runnerSha256: task69RunnerSourceDigest(process.cwd()),
    schemaSha256: task69SchemaSourceDigest(process.cwd()),
    entries: Object.fromEntries(allowlist.map((e) => [e.issue_id, e.entry_sha256])),
    ownerPreparation: input.binding,
  };
  const contractText = task69Canonical(value as unknown as Json);
  return {
    ...value,
    targetCluster: input.binding.target.cluster,
    targetDatabase: input.binding.target.database,
    contractText,
    contractSha256: task69Sha(contractText),
    allowlist,
  };
}
