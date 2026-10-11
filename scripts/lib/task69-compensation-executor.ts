import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import type { SessionClaims } from '../../src/lib/auth/session';
import {
  assertTask69References,
  TASK69_REFERENCE_TABLES,
  task69ReferenceSql,
  type Task69Contract,
  type Row,
} from './task69-contract';
import {
  assertTask69EntryBound,
  assertTask69Source,
  assertTask69Lookups,
  assertTask69Memberships,
  readTask69Transitions,
} from './task69-preflight';
import { bindTask69Operation, type Task69PreparedOperation } from './task69-runner';

const aggregates = {
  matters: ['matter_edit', 'matter_id', 'matter'],
  admin_tasks: ['admin_edit', 'task_id', 'task'],
  powers_of_attorney: ['poa_edit', 'poa_id', 'poa'],
  documents: ['document_edit', 'document_id', null],
  fee_letters: ['fee_letter_edit', 'fee_letter_id', 'feeLetter'],
  matter_fee_letter_references: ['matter_fee_reference', 'matter_id', 'version'],
} as const;
type Aggregate = keyof typeof aggregates;
type Delta = {
  ordinal: number;
  entity_table: string;
  entity_key: { id: number };
  before_values: Row | null;
  after_values: Row;
};
const roots = new Set(['matters', 'admin_tasks', 'powers_of_attorney', 'documents', 'fee_letters']);
async function currentRows(db: ClientBase, operation: string) {
  const deltas = (
    await db.query(
      'SELECT DISTINCT ON(d.entity_table,d.entity_key) d.* FROM _migration.task69_delta d JOIN _migration.task69_receipt r USING(receipt_id) WHERE r.operation_id=$1 ORDER BY d.entity_table,d.entity_key,d.audit_event_id DESC',
      [operation],
    )
  ).rows;
  for (const d of deltas) {
    assert.match(d.entity_table, /^[a-z_]+$/u);
    const rows = (
      await db.query(
        `SELECT to_jsonb(t) value FROM public.${d.entity_table} t WHERE id=$1 FOR UPDATE`,
        [d.entity_key.id],
      )
    ).rows;
    assert.deepEqual(
      rows.map((r) => r.value),
      [d.after_values],
      'Compensation refuses later-edited postimage: ' + d.entity_table + '/' + d.entity_key.id,
    );
  }
}
/** Caller owns a serializable transaction. Every applied receipt in this operation
 * is compensated together; no partial issue selection, row deletion or history rewrite. */
export async function compensateTask69Operation(
  db: ClientBase,
  operation: Task69PreparedOperation,
  contract: Task69Contract,
  authority: SessionClaims,
): Promise<Row[]> {
  await bindTask69Operation(db, operation, authority);
  await db.query(
    'LOCK TABLE ' +
      TASK69_REFERENCE_TABLES.map(task69ReferenceSql).join(',') +
      ' IN SHARE ROW EXCLUSIVE MODE',
  );
  const receipts = (
    await db.query(
      "SELECT r.*,coalesce((SELECT max(audit_event_id) FROM _migration.task69_delta WHERE receipt_id=r.receipt_id),0) write_order FROM _migration.task69_receipt r WHERE operation_id=$1 AND phase='apply' ORDER BY write_order DESC,created_at DESC,receipt_id",
      [operation.operationId],
    )
  ).rows as Row[];
  assert(receipts.length > 0, 'No committed operation effects to compensate');
  const existing = (
    await db.query(
      "SELECT to_jsonb(r) value FROM _migration.task69_receipt r WHERE operation_id=$1 AND phase='compensate' ORDER BY issue_id",
      [operation.operationId],
    )
  ).rows.map((r) => r.value as Row);
  await currentRows(db, operation.operationId);
  if (existing.length) {
    assert.equal(
      existing.length,
      receipts.length,
      'Incomplete prior compensation requires investigation',
    );
    const transitions = await readTask69Transitions(db, operation.operationId);
    for (const prior of receipts.filter((r) => r.expected_delta_count === 0)) {
      const entry = contract.byIssue.get(String(prior.issue_id));
      assert(entry);
      assertTask69EntryBound(entry, operation);
      await assertTask69Source(db, entry);
      await assertTask69References(db, [entry], operation.operationId, transitions);
      await assertTask69Memberships(db, entry, transitions);
    }
    for (const r of existing)
      assert.equal(
        (
          await db.query('SELECT _migration.task69_compensation_receipt_valid($1) valid', [
            r.receipt_id,
          ])
        ).rows[0].valid,
        true,
      );
    return existing;
  }
  const transitions = await readTask69Transitions(db, operation.operationId);
  for (const r of receipts) {
    assert.equal(
      (
        await db.query('SELECT _migration.task69_receipt_postimages_valid($1) valid', [
          r.receipt_id,
        ])
      ).rows[0].valid,
      true,
      'Complete original receipt postimage required',
    );
    const entry = contract.byIssue.get(String(r.issue_id));
    if (entry) {
      assertTask69EntryBound(entry, operation);
      await assertTask69Source(db, entry);
      await assertTask69References(db, [entry], operation.operationId, transitions);
      await assertTask69Lookups(db, entry, operation);
      await assertTask69Memberships(db, entry, transitions);
    }
  }
  await db.query('SET CONSTRAINTS ALL DEFERRED');
  const result: Row[] = [];
  for (const prior of receipts) {
    const actor = (
      await db.query(
        'SELECT _migration.task69_require_actor($1,$2,$3,$4::timestamptz,$5::uuid) id',
        [
          authority.userId,
          authority.sessionVersion,
          authority.role,
          new Date(authority.absoluteExpiresAt).toISOString(),
          authority.auditSessionId,
        ],
      )
    ).rows[0].id;
    const receiptId = randomUUID(),
      request = randomUUID();
    await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
    await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
      request,
      operation.operationId,
      authority.auditSessionId,
    ]);
    await db.query(
      "SELECT set_config('litigation.tasks46_47_gateway','on',true),set_config('litigation.task69_operation',$1,true),set_config('litigation.task69_issue',$2,true)",
      [operation.operationId, prior.issue_id],
    );
    const original = (
      await db.query('SELECT * FROM _migration.task69_delta WHERE receipt_id=$1 ORDER BY ordinal', [
        prior.receipt_id,
      ])
    ).rows as Delta[];
    const affected = new Map<string, { table: Aggregate; id: number; before: Row }>();
    for (const d of original) {
      const table = (
        roots.has(d.entity_table)
          ? d.entity_table
          : d.entity_table === 'matter_fee_letter_references'
            ? d.entity_table
            : null
      ) as Aggregate | null;
      if (!table) continue;
      const id =
        table === 'matter_fee_letter_references'
          ? Number(d.after_values.matter_id)
          : d.entity_key.id;
      if (affected.has(table + '/' + id)) continue;
      const [prefix] = aggregates[table];
      assert.equal(
        (await db.query(`SELECT _migration.${prefix}_current_valid($1) valid`, [id])).rows[0].valid,
        true,
        'Compensation requires continuous native aggregate',
      );
      affected.set(table + '/' + id, {
        table,
        id,
        before: (await db.query(`SELECT _migration.${prefix}_aggregate($1) value`, [id])).rows[0]
          .value,
      });
    }
    const rows: { original: Delta; before: Row; after: Row }[] = [];
    for (const d of original) {
      assert.match(d.entity_table, /^[a-z_]+$/u);
      const before = (
        await db.query(
          `SELECT to_jsonb(t) value FROM public.${d.entity_table} t WHERE id=$1 FOR UPDATE`,
          [d.entity_key.id],
        )
      ).rows[0]?.value as Row;
      assert(before);
      const desired = (
        await db.query('SELECT _migration.task69_compensation_expected($1,$2,$3,$4) value', [
          d.entity_table,
          d.before_values,
          d.after_values,
          before,
        ])
      ).rows[0].value as Row;
      const keys = Object.keys(desired).filter(
        (k) =>
          !['updated_at', 'updated_by'].includes(k) &&
          JSON.stringify(desired[k]) !== JSON.stringify(before[k]),
      );
      let after = before;
      if (keys.length) {
        assert(keys.every((k) => /^[a-z_]+$/u.test(k)));
        const assignments = keys.map((k) => `"${k}"=v."${k}"`);
        if ('updated_at' in before) assignments.push('updated_at=statement_timestamp()');
        after = (
          await db.query(
            `UPDATE public.${d.entity_table} t SET ${assignments.join(',')} FROM jsonb_populate_record(NULL::public.${d.entity_table},$1::jsonb) v WHERE t.id=$2 RETURNING to_jsonb(t) value`,
            [JSON.stringify(desired), d.entity_key.id],
          )
        ).rows[0].value;
      }
      rows.push({ original: d, before, after });
    }
    for (const item of affected.values()) {
      const [prefix, idColumn, root] = aggregates[item.table];
      if (item.table === 'matter_fee_letter_references')
        await db.query(
          'UPDATE _migration.matter_fee_reference_state SET row_version=row_version+1 WHERE matter_id=$1',
          [item.id],
        );
      const after = (await db.query(`SELECT _migration.${prefix}_aggregate($1) value`, [item.id]))
        .rows[0].value as Row;
      const version =
        root === 'version'
          ? after.version
          : root === null
            ? after.row_version
            : (after[root] as Row).row_version;
      await db.query(
        `INSERT INTO _migration.${prefix}_change(${idColumn},version,actor_id,before_values,after_values,request_id) VALUES($1,$2,$3,$4,$5,$6)`,
        [item.id, version, actor, item.before, after, request],
      );
      await db.query('INSERT INTO _migration.task69_compensation_change VALUES($1,$2,$3,$4)', [
        item.table,
        item.id,
        version,
        receiptId,
      ]);
    }
    const changed = rows.filter((r) => r.after !== r.before);
    await db.query(
      "INSERT INTO _migration.task69_receipt(receipt_id,operation_id,issue_id,payload_sha256,phase,actor_id,audit_session_id,request_id,returned_ids,source_occurrences,effect,expected_delta_count,prior_receipt_id) VALUES($1,$2,$3,$4,'compensate',$5,$6,$7,$8,$9,'compensated',$10,$11)",
      [
        receiptId,
        operation.operationId,
        prior.issue_id,
        prior.payload_sha256,
        actor,
        authority.auditSessionId,
        request,
        prior.returned_ids,
        JSON.stringify(prior.source_occurrences),
        changed.length,
        prior.receipt_id,
      ],
    );
    for (const [i, r] of changed.entries()) {
      const events = (
        await db.query(
          "SELECT id FROM public.audit_events WHERE request_id=$1 AND entity_schema='public' AND entity_table=$2 AND entity_key=jsonb_build_object('id',$3::int)",
          [request, r.original.entity_table, r.original.entity_key.id],
        )
      ).rows;
      assert.equal(events.length, 1, 'One truthful event for each inverse delta');
      await db.query(
        "INSERT INTO _migration.task69_delta(receipt_id,ordinal,entity_schema,entity_table,entity_key,before_values,after_values,audit_event_id) VALUES($1,$2,'public',$3,$4,$5,$6,$7)",
        [
          receiptId,
          i + 1,
          r.original.entity_table,
          r.original.entity_key,
          r.before,
          r.after,
          events[0].id,
        ],
      );
    }
    for (const r of rows)
      await db.query('INSERT INTO _migration.task69_compensation_row VALUES($1,$2,$3,$4,$5,$6)', [
        receiptId,
        r.original.ordinal,
        r.original.entity_table,
        r.original.entity_key.id,
        r.before,
        r.after,
      ]);
    assert.equal(
      (await db.query('SELECT _migration.task69_compensation_receipt_valid($1) valid', [receiptId]))
        .rows[0].valid,
      true,
      'Exact bounded inverse journal required',
    );
    for (const item of affected.values())
      assert.equal(
        (
          await db.query(`SELECT _migration.${aggregates[item.table][0]}_current_valid($1) valid`, [
            item.id,
          ])
        ).rows[0].valid,
        true,
        'Compensated aggregate remains continuous',
      );
    result.push(
      (
        await db.query(
          'SELECT to_jsonb(r) value FROM _migration.task69_receipt r WHERE receipt_id=$1',
          [receiptId],
        )
      ).rows[0].value,
    );
  }
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  assert.equal(result.length, receipts.length);
  return result.sort((a, b) => String(a.issue_id).localeCompare(String(b.issue_id)));
}
