import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import type { ClientBase } from 'pg';

/** Reviewed data stays outside Git. These byte identities bind the executable
 * contract to the independently accepted v1.292 inventory, adopted by v1.293. */
export const TASK69_INPUTS = {
  'decision-register.json': '23e9aaecc39c5dbed4025495ac328e36e6b635285371524c9b72e7fb1a09d512',
  'corrected-inventory.json': 'faab36b075b3bc5544dacc555c30bca1098a151ee28176aab75d6667a040aa83',
  'regenerated-counts.json': 'c2832566270311b95980f6c21d69005accd88b7778a50ad4a6dfcb9049585311',
  'shared-dependencies.json': '56588ae9a79246c8facc2bea7e82e4d337f9644967a83e4281fa59c444017dc6',
  'implementation-plan.md': '2984c0910801835cc95a2358bb08e94c8ffb37def51d847355720cff0e565ded',
  'scripts/source_semantics.py': '9c3bd195667b0abe093246e9145e9f914a08c10f19223c31e3a2e1ecc79909d3',
  'scripts/guard_contract.py': '6eee8727b98b7d22f49360e207699ce3fd5cb3a6773a92362d873b035832c0d1',
  'scripts/correction_checks.py':
    'c0c88a3c4fed08fe1dc1ad4d5b767ae1ec8192c1e1369270f5803b24bc602e97',
} as const;

export const TASK69_STAGES = {
  'S1-party-display': 743,
  'S2-lawyer-membership': 191,
  'S3-admin-parents': 544,
  'S4-step-restoration': 769,
  'S5-poa-membership': 714,
  'S6-documents': 291,
  'S7-fee-provenance': 76,
  'S8-history-dispositions': 137,
} as const;
export type Task69Stage = keyof typeof TASK69_STAGES;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Row = { [key: string]: Json };
export type Task69Guard = {
  table: string;
  id: number;
  hash: string;
  expectedIdCardinality: number;
  exactLabels: Record<string, string>;
  exactLabelCardinality: Record<string, number>;
  eligibility: { requireUnarchived: boolean; inactiveHistoricalIdentityAllowed: boolean };
};
export type Task69Entry = {
  issueId: string;
  store: string;
  unit: string;
  sourceRecordKey: string;
  extractionSha256: string;
  originalJsonSha256: string;
  originalIssue: { id: string; original: Row; originalJsonSha256: string };
  approvedOutcome: Row;
  disposition: string;
  authority: Json[];
  dependencies: string[];
  expectedStateGuards: {
    sourceObjectSha256: string;
    targetGuards: Task69Guard[];
    lookupPreconditions: {
      table: string;
      exactLabel: string;
      expectedIds: number[];
      expectedCardinality: number;
    }[];
    membershipPreconditions: Record<string, Json>;
    parentDependencies: Json[];
  };
};
export type Task69Contract = {
  root: string;
  entries: Task69Entry[];
  byIssue: Map<string, Task69Entry>;
  stages: Record<Task69Stage, string[]>;
  originals: Json[];
  dependencies: Json;
  inputs: typeof TASK69_INPUTS;
};

export function task69Sha(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Match the accepted Python contract: exact UTF-8, sorted object keys, no
 * whitespace. No Arabic normalization, NULL folding or date rewriting. */
export function task69Canonical(value: Json): string {
  if (Array.isArray(value)) return '[' + value.map(task69Canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + task69Canonical(value[key]!))
        .join(',') +
      '}'
    );
  }
  assert.ok(typeof value !== 'number' || Number.isFinite(value), 'Non-finite contract value');
  return JSON.stringify(value);
}
export function task69Digest(value: Json): string {
  return task69Sha(task69Canonical(value));
}

export function loadTask69Contract(directory: string): Task69Contract {
  const root = realpathSync(directory);
  const buffers = new Map<string, Buffer>();
  for (const [name, expected] of Object.entries(TASK69_INPUTS)) {
    const path = realpathSync(join(root, name));
    const contained = relative(root, path);
    assert.ok(
      contained && !contained.startsWith('..') && !isAbsolute(contained),
      'Contract file escapes reviewed directory',
    );
    const bytes = readFileSync(path);
    assert.equal(task69Sha(bytes), expected, `Reviewed input differs: ${name}`);
    buffers.set(name, bytes);
  }
  const read = (name: string) => JSON.parse(buffers.get(name)!.toString('utf8'));
  const entries = read('decision-register.json').entries as Task69Entry[];
  const counts = read('regenerated-counts.json');
  const stages = counts.stageIssueSets as Record<Task69Stage, string[]>;
  const originals = read('corrected-inventory.json').issues as Json[];
  assert.equal(entries.length, 3465);
  assert.equal(originals.length, 3960);
  const byIssue = new Map(entries.map((entry) => [entry.issueId, entry]));
  assert.equal(byIssue.size, 3465, 'Duplicate approved issue');
  assert.deepEqual(Object.keys(stages).sort(), Object.keys(TASK69_STAGES).sort());
  const assigned = new Set<string>();
  for (const [stage, count] of Object.entries(TASK69_STAGES)) {
    const ids = stages[stage as Task69Stage];
    assert.equal(ids.length, count, `${stage}: incomplete stage`);
    for (const id of ids) {
      assert.ok(!assigned.has(id) && byIssue.has(id), `${stage}: duplicate or unknown issue`);
      assigned.add(id);
      const entry = byIssue.get(id)!;
      assert.ok(entry.dependencies.includes(stage), `${id}: wrong stage`);
      assert.equal(entry.originalIssue.id, id);
      assert.equal(
        task69Digest(entry.originalIssue.original),
        entry.originalJsonSha256,
        `${id}: changed source`,
      );
      assert.equal(entry.expectedStateGuards.sourceObjectSha256, entry.originalJsonSha256);
      assert.ok(entry.authority.length > 0, `${id}: missing authority`);
    }
  }
  assert.equal(assigned.size, byIssue.size);
  return {
    root,
    entries,
    byIssue,
    stages,
    originals,
    dependencies: read('shared-dependencies.json'),
    inputs: TASK69_INPUTS,
  };
}

export const TASK69_REFERENCE_TABLES = [
  'public.admin_tasks',
  'public.clients',
  'public.documents',
  'public.fee_letter_matters',
  'public.fee_letters',
  'public.hearings',
  'public.lookup_court',
  'public.lookup_matter_destination',
  'public.lookup_party_role',
  'public.matter_fee_letter_references',
  'public.matter_lawyers',
  'public.matter_parties',
  'public.matter_party_roles',
  'public.matters',
  'public.people',
  'public.power_of_attorney_lawyers',
  'public.powers_of_attorney',
] as const;

export function task69ReferenceSql(table: string): string {
  assert.ok(
    (TASK69_REFERENCE_TABLES as readonly string[]).includes(table),
    'Unreviewed reference namespace',
  );
  return table
    .split('.')
    .map((part) => '"' + part + '"')
    .join('.');
}

export type Task69RowTransition = {
  operationId: string;
  issueId: string;
  receiptId: string;
  table: string;
  id: number;
  before: Row | null;
  after: Row;
};

/** A changed guard is valid only through a receipt chain for this exact
 * operation, starting at the complete reviewed row and ending at the exact
 * current row. This never exempts a normalized lookup from freshness checks. */
export function assertTask69Guard(
  guard: Task69Guard,
  current: Row,
  operationId: string,
  transitions: readonly Task69RowTransition[] = [],
): void {
  task69ReferenceSql(guard.table);
  assert.equal(guard.expectedIdCardinality, 1, 'Unexpected reviewed cardinality');
  assert.equal(current.id, guard.id, 'Reference identity differs');
  let hash = guard.hash;
  const links = transitions.filter((t) => t.table === guard.table && t.id === guard.id);
  const receipts = new Set<string>();
  for (const change of links) {
    assert.equal(change.operationId, operationId, 'Foreign operation cannot satisfy a dependency');
    assert.ok(change.receiptId && change.issueId, 'Unreceipted dependency change');
    assert.ok(!receipts.has(change.receiptId), 'Repeated dependency receipt');
    receipts.add(change.receiptId);
    assert.ok(change.before, 'Existing reference cannot be replaced with a new insert');
    assert.equal(
      task69Digest(change.before),
      hash,
      'Dependency does not start at exact reviewed preimage',
    );
    assert.equal(change.before.id, guard.id);
    assert.equal(change.after.id, guard.id);
    hash = task69Digest(change.after);
  }
  assert.equal(task69Digest(current), hash, `${guard.table}/${guard.id}: stale complete row`);
  if (guard.eligibility.requireUnarchived)
    assert.equal(current.is_archived, false, 'Archived parent');
}

/** Caller uses a serializable transaction and holds the affected relationship
 * tables against concurrent writes. Exact JSON comes from PostgreSQL so dates,
 * microseconds and bigint values are not rounded through a JS Date parser. */
export async function assertTask69References(
  db: ClientBase,
  entries: readonly Task69Entry[],
  operationId: string,
  transitions: readonly Task69RowTransition[] = [],
): Promise<number> {
  const guards = new Map<string, Task69Guard>();
  for (const entry of entries)
    for (const guard of entry.expectedStateGuards.targetGuards) {
      task69ReferenceSql(guard.table);
      const key = guard.table + '/' + guard.id;
      const prior = guards.get(key);
      if (prior) assert.equal(prior.hash, guard.hash, `${key}: conflicting reviewed guard`);
      else guards.set(key, guard);
    }
  const state = await db.query<{ isolation: string }>(
    "SELECT current_setting('transaction_isolation') isolation",
  );
  assert.equal(state.rows[0]?.isolation, 'serializable', 'Serializable guard transaction required');
  for (const table of TASK69_REFERENCE_TABLES) {
    const selected = [...guards.values()].filter((guard) => guard.table === table);
    if (!selected.length) continue;
    const rows = await db.query<{ value: Row }>(
      `SELECT to_jsonb(r) value FROM ${task69ReferenceSql(table)} r WHERE id=ANY($1::int[]) ORDER BY id FOR SHARE`,
      [selected.map((guard) => guard.id)],
    );
    assert.equal(rows.rowCount, selected.length, `${table}: missing or repeated target`);
    const byId = new Map(rows.rows.map(({ value }) => [value.id, value]));
    for (const guard of selected)
      assertTask69Guard(guard, byId.get(guard.id)!, operationId, transitions);
  }
  return guards.size;
}
