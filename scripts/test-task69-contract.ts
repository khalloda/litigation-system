import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import {
  loadTask69Contract,
  assertTask69Guard,
  assertTask69References,
  task69Digest,
  task69ReferenceSql,
  task69Canonical,
  TASK69_STAGES,
  type Row,
  type Task69Guard,
  type Task69RowTransition,
} from './lib/task69-contract';

async function main() {
  const source = process.env['TASK69_APPROVED_DIRECTORY'];
  const output = process.env['TASK69_EVIDENCE_OUTPUT'];
  assert.ok(source && output && process.env['MIGRATION_DATABASE_URL']);
  const started = new Date().toISOString();
  const contract = loadTask69Contract(source);
  const witnesses = JSON.parse(readFileSync(join(source, 'evidence/database-before.json'), 'utf8'))
    .tables as Record<string, Row[]>;
  const operationId = randomUUID();
  let allGuardOccurrences = 0;
  for (const entry of contract.entries)
    for (const guard of entry.expectedStateGuards.targetGuards) {
      const rows = witnesses[guard.table]!.filter((row) => row.id === guard.id);
      assert.equal(rows.length, 1);
      assertTask69Guard(guard, rows[0]!, operationId);
      allGuardOccurrences++;
    }
  const probes: { name: string; status: string }[] = [];
  const refuses = (name: string, fn: () => void) => {
    assert.throws(fn, (error: unknown) => error instanceof Error, name);
    probes.push({ name, status: 'REFUSED_AS_REQUIRED' });
  };
  const guard = contract.entries
    .flatMap((entry) => entry.expectedStateGuards.targetGuards)
    .find((item) => item.table === 'public.matters' && item.eligibility.requireUnarchived)!;
  const before = witnesses[guard.table]!.find((row) => row.id === guard.id)!;
  const after = { ...before, notes_1: 'Task-owned in-memory guard probe' };
  const transition: Task69RowTransition = {
    operationId,
    issueId: 'test-only',
    receiptId: randomUUID(),
    table: guard.table,
    id: guard.id,
    before,
    after,
  };
  refuses('later edit is refused', () => assertTask69Guard(guard, after, operationId));
  refuses('missing guard cannot authorize a row', () =>
    assertTask69Guard(undefined as unknown as Task69Guard, before, operationId),
  );
  refuses('wrong namespace is refused', () => task69ReferenceSql('public.user_accounts'));
  refuses('SQL identifier injection is refused', () => task69ReferenceSql('public.matters;DELETE'));
  refuses('wrong target identity is refused', () =>
    assertTask69Guard(guard, { ...before, id: guard.id + 1 }, operationId),
  );
  refuses('changed label is refused', () =>
    assertTask69Guard(guard, { ...before, case_number_ar: 'test-only-changed' }, operationId),
  );
  refuses('wrong cardinality is refused', () =>
    assertTask69Guard({ ...guard, expectedIdCardinality: 2 }, before, operationId),
  );
  refuses('foreign receipt is refused', () =>
    assertTask69Guard(guard, after, randomUUID(), [transition]),
  );
  refuses('unreceipted change is refused', () =>
    assertTask69Guard(guard, after, operationId, [{ ...transition, receiptId: '' }]),
  );
  refuses('receipt wrong starting row is refused', () =>
    assertTask69Guard(guard, after, operationId, [{ ...transition, before: after }]),
  );
  refuses('receipt does not authorize later edits', () =>
    assertTask69Guard(guard, { ...after, row_version: 500 }, operationId, [transition]),
  );
  refuses('duplicate receipt is refused', () =>
    assertTask69Guard(guard, after, operationId, [transition, transition]),
  );
  const archived = { ...before, is_archived: true };
  refuses('receipted archive cannot bypass parent rule', () =>
    assertTask69Guard(guard, archived, operationId, [{ ...transition, after: archived }]),
  );
  assertTask69Guard(guard, after, operationId, [transition]);
  assert.notEqual(
    task69Digest({ text: '\r\n', value: null }),
    task69Digest({ text: '\n', value: '' }),
  );
  assert.notEqual(task69Digest({ text: 'أحمد' }), task69Digest({ text: 'احمد' }));
  assert.equal(task69Canonical({ b: 2, a: ['س', null] }), '{"a":["س",null],"b":2}');
  const live = await withApprovedMigrationClient(async (db) => {
    const url = new URL(process.env['MIGRATION_DATABASE_URL']!);
    await assertIsolatedTestCluster(db, url);
    assert.ok(url.pathname.startsWith('/litigation_task69_'));
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await db.query("SET LOCAL TIME ZONE 'UTC'");
    try {
      const distinctReferences = await assertTask69References(db, contract.entries, operationId);
      await db.query('ROLLBACK');
      return {
        distinctReferences,
        allGuardOccurrences,
        source: 'fresh task-owned full-state fixture',
        mutations: 0,
      };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  });
  const result = {
    status: 'PASS',
    scope: 'Input and reference foundation only; no stage apply or consumer certification',
    started,
    completed: new Date().toISOString(),
    inputIdentities: contract.inputs,
    issues: contract.entries.length,
    originals: contract.originals.length,
    stages: TASK69_STAGES,
    live,
    probes,
  };
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result));
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Task 6.9 contract test failed');
  process.exitCode = 1;
});
