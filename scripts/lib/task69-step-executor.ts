import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import type { SessionClaims } from '../../src/lib/auth/session';
import { type Row, type Task69Entry } from './task69-contract';
import type { Task69PreparedOperation } from './task69-runner';
import { assertTask69Preflight, assertTask69EntryBound } from './task69-preflight';
import {
  authorizeTask69Issue,
  recordTask69Receipt,
  insertTask69Row,
  type Task69Delta,
} from './task69-matter-executor';
/** A generated parent is an explicit container for a proved missing source
 * number. Its business/source fields remain NULL, with display context read
 * separately from the immutable approved dependency receipt. */
export async function executeTask69GeneratedParent(
  db: ClientBase,
  operation: Task69PreparedOperation,
  issueId: string,
  authority: SessionClaims,
): Promise<Row> {
  assert.match(issueId, /^GENERATED-PARENT\/[1-9][0-9]*$/u);
  const allowed = operation.allowlist.find(
    (e) => e.issue_id === issueId && e.stage === 'shared-dependency',
  );
  assert(allowed);
  const payload = JSON.parse(allowed.payload_text) as Row;
  assert.equal(payload.id, issueId);
  const context = await authorizeTask69Issue(db, operation, issueId, authority);
  if (context.receipt) return context.receipt;
  assert.equal(
    (await db.query("SELECT current_setting('transaction_isolation') value")).rows[0].value,
    'serializable',
  );
  const expected = (
    await db.query('SELECT _migration.task69_generated_expected($1,$2) value', [
      operation.operationId,
      issueId,
    ])
  ).rows[0].value as Row;
  const task = await insertTask69Row(db, 'admin_tasks', expected);
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
  const returned: Row = { taskId: task.id!, assigneeIds: [] };
  const receipt = await recordTask69Receipt(
    db,
    operation,
    issueId,
    authority,
    context,
    returned,
    [{ dependency: payload, mappings: returned }],
    [{ table: 'admin_tasks', before: null, after: task }],
  );
  assert.equal(
    (
      await db.query('SELECT _migration.task69_generated_receipt_valid($1) valid', [
        receipt.receipt_id,
      ])
    ).rows[0].valid,
    true,
  );
  assert.equal(
    (await db.query('SELECT _migration.admin_edit_current_valid($1) valid', [task.id])).rows[0]
      .valid,
    true,
  );
  return receipt;
}
/** Restores one source action, including true NULL-parent records. A source
 * or generated parent receipt must have committed in an earlier transaction. */
export async function executeTask69Step(
  db: ClientBase,
  operation: Task69PreparedOperation,
  entry: Task69Entry,
  authority: SessionClaims,
): Promise<Row> {
  assertTask69EntryBound(entry, operation);
  const context = await authorizeTask69Issue(db, operation, entry.issueId, authority);
  if (context.receipt) return context.receipt;
  await assertTask69Preflight(db, entry, operation);
  const intended = entry.approvedOutcome.step as Row;
  assert(intended);
  let parentId: number | null = null;
  const parent = intended.parentTask;
  if (typeof parent === 'number') parentId = parent;
  else if (
    typeof parent === 'string' ||
    (parent && typeof parent === 'object' && !Array.isArray(parent))
  ) {
    const parentIssue =
      typeof parent === 'string'
        ? parent
        : 'GENERATED-PARENT/' + String(parent.generatedParentGroup);
    parentId = (
      await db.query('SELECT _migration.task69_committed_parent($1,$2) id', [
        operation.operationId,
        parentIssue,
      ])
    ).rows[0].id;
  } else {
    assert.equal(parent, null);
    assert.equal(intended.unassignedSeparateRecord, true);
  }
  let before: Row | null = null,
    taskBefore: Row | null = null;
  if (parentId !== null) {
    const rows = (
      await db.query(
        'SELECT to_jsonb(t) value FROM public.admin_tasks t WHERE id=$1 AND NOT is_archived FOR UPDATE',
        [parentId],
      )
    ).rows;
    assert.equal(rows.length, 1, 'Exact unarchived parent required');
    taskBefore = rows[0].value;
    assert.equal(
      (await db.query('SELECT _migration.admin_edit_current_valid($1) valid', [parentId])).rows[0]
        .valid,
      true,
    );
    before = (await db.query('SELECT _migration.admin_edit_aggregate($1) value', [parentId]))
      .rows[0].value;
  }
  assert.deepEqual(
    (
      await db.query(
        'SELECT id FROM public.task_actions WHERE legacy_id=$1 OR legacy_source_record_key=$2 FOR UPDATE',
        [intended.legacy_id, intended.legacy_source_record_key],
      )
    ).rows,
    [],
    'Exact step source identity must be absent',
  );
  const values: Row = structuredClone(intended);
  assert.equal(values.id, 'RETURNED_ID:' + entry.issueId);
  for (const key of ['id', 'parentTask', 'unassignedSeparateRecord']) delete values[key];
  assert(values.report === null || typeof values.report === 'boolean');
  values.report = values.report === null ? null : String(values.report);
  values.task_id = parentId;
  values.current_order = null;
  const step = await insertTask69Row(db, 'task_actions', values),
    deltas: Task69Delta[] = [{ table: 'task_actions', before: null, after: step }];
  await db.query('INSERT INTO _migration.task69_step_origin(step_id,receipt_id) VALUES($1,$2)', [
    step.id,
    context.receiptId,
  ]);
  if (parentId !== null) {
    const task = (
      await db.query(
        'UPDATE public.admin_tasks SET row_version=row_version+1,updated_at=statement_timestamp() WHERE id=$1 RETURNING to_jsonb(admin_tasks) value',
        [parentId],
      )
    ).rows[0].value as Row;
    const after = (await db.query('SELECT _migration.admin_edit_aggregate($1) value', [parentId]))
      .rows[0].value;
    await db.query(
      'INSERT INTO _migration.admin_edit_change(task_id,version,actor_id,before_values,after_values,request_id) VALUES($1,$2,$3,$4,$5,$6)',
      [
        parentId,
        task.row_version,
        context.actorId,
        JSON.stringify(before),
        JSON.stringify(after),
        context.requestId,
      ],
    );
    await db.query(
      'INSERT INTO _migration.task69_step_change(task_id,version,receipt_id) VALUES($1,$2,$3)',
      [parentId, task.row_version, context.receiptId],
    );
    deltas.push({ table: 'admin_tasks', before: taskBefore, after: task });
  }
  const returned: Row = { stepId: step.id!, taskId: parentId };
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
    (await db.query('SELECT _migration.task69_step_receipt_valid($1) valid', [receipt.receipt_id]))
      .rows[0].valid,
    true,
  );
  if (parentId !== null)
    assert.equal(
      (await db.query('SELECT _migration.admin_edit_current_valid($1) valid', [parentId])).rows[0]
        .valid,
      true,
    );
  return receipt;
}
