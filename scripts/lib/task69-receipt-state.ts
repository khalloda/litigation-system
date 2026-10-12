import assert from 'node:assert/strict';
import type { Task69PreparedOperation } from './task69-runner';

export const TASK69_PARENT_STAGES = [
  'S1-party-display',
  'S2-lawyer-membership',
  'S3-admin-parents',
];
export type Task69ReceiptIdentity = {
  operation_id: unknown;
  issue_id: unknown;
  phase: unknown;
  receipt_id: unknown;
};
/** The caller verifies the sealed allowlist against compileTask69Entries and
 * binds it to the database. Counts alone never authorize a phase or inverse. */
export function task69PhaseSets(operation: Task69PreparedOperation) {
  const all = operation.allowlist.map((a) => a.issue_id).sort();
  assert.equal(new Set(all).size, all.length, 'Duplicate sealed issue identity');
  const parents = operation.allowlist
    .filter((a) => a.unit_kind === 'dependency' || TASK69_PARENT_STAGES.includes(a.stage))
    .map((a) => a.issue_id)
    .sort();
  const parentSet = new Set(parents);
  const remaining = all.filter((id) => !parentSet.has(id));
  assert(parents.length && remaining.length, 'Both sealed phase sets required');
  return { all, parents, remaining };
}
/** Only complete atomic transaction boundaries are recognized. Receipt validity,
 * current postimages, references and actor/target authority are additional gates. */
export function classifyTask69Receipts(
  operation: Task69PreparedOperation,
  receipts: Task69ReceiptIdentity[],
) {
  const sets = task69PhaseSets(operation),
    allowed = new Set(sets.all);
  const ids = new Set<string>(),
    identities = new Set<string>();
  const applied: string[] = [],
    compensated: string[] = [];
  for (const receipt of receipts) {
    assert.equal(receipt.operation_id, operation.operationId, 'Foreign operation receipt');
    assert(
      typeof receipt.issue_id === 'string' && allowed.has(receipt.issue_id),
      'Foreign issue receipt',
    );
    assert(receipt.phase === 'apply' || receipt.phase === 'compensate', 'Unknown receipt phase');
    assert(
      typeof receipt.receipt_id === 'string' &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(receipt.receipt_id),
      'Malformed receipt identity',
    );
    const identity = receipt.phase + '/' + receipt.issue_id;
    assert(!ids.has(receipt.receipt_id) && !identities.has(identity), 'Duplicate receipt identity');
    ids.add(receipt.receipt_id);
    identities.add(identity);
    (receipt.phase === 'apply' ? applied : compensated).push(receipt.issue_id);
  }
  applied.sort();
  compensated.sort();
  if (!applied.length) {
    assert.equal(compensated.length, 0, 'Compensation without apply receipts');
    return { state: 'ZERO_COMMITTED' as const, boundary: 'none' as const, applied, compensated };
  }
  const equals = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id, i) => id === b[i]);
  const boundary = equals(applied, sets.parents)
    ? 'parents'
    : equals(applied, sets.all)
      ? 'full'
      : null;
  assert(
    boundary,
    'Unsupported apply receipt set; exact complete parents or full operation required',
  );
  if (compensated.length)
    assert.deepEqual(compensated, applied, 'Incomplete or mixed compensation set');
  return {
    state: compensated.length ? ('COMPENSATED' as const) : ('APPLIED' as const),
    boundary,
    applied,
    compensated,
  };
}
