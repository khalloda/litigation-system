import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import type { SessionClaims } from '../../src/lib/auth/session';
import { type Row, type Json, type Task69Entry, task69Digest } from './task69-contract';
import type { Task69PreparedOperation } from './task69-runner';
import { assertTask69Preflight } from './task69-preflight';
import {
  authorizeTask69Issue,
  recordTask69Receipt,
  insertTask69Row,
  executeTask69Lookup,
  type Task69Delta,
} from './task69-matter-executor';
/** Restores one complete approved source task. Membership is authoritative;
 * no source field is synthesized from display summaries or current defaults. */
export async function executeTask69Admin(
  db: ClientBase,
  operation: Task69PreparedOperation,
  entry: Task69Entry,
  authority: SessionClaims,
): Promise<Row> {
  let context = await authorizeTask69Issue(db, operation, entry.issueId, authority);
  if (context.receipt) return context.receipt;
  await assertTask69Preflight(db, entry, operation);
  const intended = entry.approvedOutcome.task as Row;
  assert.ok(intended && typeof intended === 'object' && !Array.isArray(intended));
  const values: Row = structuredClone(intended);
  assert.equal(values.id, 'RETURNED_ID:' + entry.issueId);
  const people = values.assigneePersonIds;
  assert.ok(Array.isArray(people));
  assert.equal(new Set(people).size, people.length);
  for (const key of ['court_id', 'destination_id']) {
    const value = values[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      assert.equal(
        value.namespace,
        key === 'court_id' ? 'public.lookup_court' : 'public.lookup_matter_destination',
      );
      if (value.action === 'CREATE_EXACT_LABEL_LATER') {
        const issue =
          'LOOKUP/' + task69Digest({ namespace: value.namespace!, label: value.label! });
        const receipt = await executeTask69Lookup(db, operation, issue, authority);
        values[key] = (receipt.returned_ids as Row).id!;
      } else if (value.action === 'REUSE_AFTER_SHARED_NORMALIZATION') {
        const receipts = (
          await db.query(
            "SELECT r.returned_ids FROM _migration.task69_receipt r WHERE operation_id=$1 AND issue_id=$2 AND phase='apply' AND _migration.task69_destination_receipt_valid(r.receipt_id)",
            [operation.operationId, value.dependencyId],
          )
        ).rows;
        assert.equal(receipts.length, 1);
        assert.equal(receipts[0].returned_ids.id, value.existingId);
        values[key] = value.existingId!;
      } else {
        assert.equal(value.action, 'REUSE');
        assert.equal(value.expectedMatches, 1);
        values[key] = value.existingId!;
      }
    }
  }
  // Dependency creation has its own actor/audit context; restore this issue's
  // context immediately before its writes and recheck the complete closure.
  context = await authorizeTask69Issue(db, operation, entry.issueId, authority);
  await assertTask69Preflight(db, entry, operation);
  assert.equal(context.receipt, null);
  assert.equal(values.assigned_to_person_id, people.length === 1 ? people[0] : null);
  for (const key of ['id', 'assigneePersonIds', 'noPrimary']) delete values[key];
  assert(values.alert === null || typeof values.alert === 'boolean');
  values.alert = values.alert === null ? null : String(values.alert);
  values.row_version = 1;
  assert.deepEqual(
    (
      await db.query(
        'SELECT id FROM public.admin_tasks WHERE legacy_id=$1 OR legacy_source_record_key=$2 FOR UPDATE',
        [values.legacy_id, values.legacy_source_record_key],
      )
    ).rows,
    [],
    'Exact task source identity must be absent',
  );
  const task = await insertTask69Row(db, 'admin_tasks', values),
    deltas: Task69Delta[] = [{ table: 'admin_tasks', before: null, after: task }];
  const returned: Row = { taskId: task.id!, assigneeIds: [] };
  for (const [i, person] of people.entries()) {
    assert.equal(typeof person, 'number');
    const member = (
      await db.query(
        'INSERT INTO public.admin_task_assignees(task_id,person_id,position) VALUES($1,$2,$3) RETURNING to_jsonb(admin_task_assignees) value',
        [task.id, person, i + 1],
      )
    ).rows[0].value as Row;
    deltas.push({ table: 'admin_task_assignees', before: null, after: member });
    (returned.assigneeIds as Json[]).push(member.id!);
  }
  await db.query('INSERT INTO _migration.task69_admin_origin(task_id,receipt_id) VALUES($1,$2)', [
    task.id,
    context.receiptId,
  ]);
  const aggregate = (await db.query('SELECT _migration.admin_edit_aggregate($1) value', [task.id]))
    .rows[0].value;
  await db.query(
    'INSERT INTO _migration.admin_edit_change(task_id,version,actor_id,before_values,after_values,request_id) VALUES($1,1,$2,NULL,$3,$4)',
    [task.id, context.actorId, JSON.stringify(aggregate), context.requestId],
  );
  const receipt = await recordTask69Receipt(
    db,
    operation,
    entry.issueId,
    authority,
    context,
    returned,
    [{ source: entry.originalIssue.original, mappings: returned }],
    deltas,
  );
  assert.equal(
    (await db.query('SELECT _migration.task69_admin_receipt_valid($1) valid', [receipt.receipt_id]))
      .rows[0].valid,
    true,
  );
  assert.equal(
    (await db.query('SELECT _migration.admin_edit_current_valid($1) valid', [task.id])).rows[0]
      .valid,
    true,
  );
  return receipt;
}
