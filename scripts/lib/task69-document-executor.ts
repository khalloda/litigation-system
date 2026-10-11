import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import type { SessionClaims } from '../../src/lib/auth/session';
import { type Row, type Json, type Task69Entry } from './task69-contract';
import type { Task69PreparedOperation } from './task69-runner';
import { assertTask69Preflight, assertTask69EntryBound } from './task69-preflight';
import {
  authorizeTask69Issue,
  recordTask69Receipt,
  type Task69Delta,
} from './task69-matter-executor';
/** Each approved field changes one existing document aggregate. The other
 * relationship set, all source values and every document attribute are retained. */
export async function executeTask69Document(
  db: ClientBase,
  operation: Task69PreparedOperation,
  entry: Task69Entry,
  authority: SessionClaims,
): Promise<Row> {
  assertTask69EntryBound(entry, operation);
  const context = await authorizeTask69Issue(db, operation, entry.issueId, authority);
  await assertTask69Preflight(db, entry, operation);
  if (context.receipt) return context.receipt;
  const intended = entry.approvedOutcome,
    source = entry.originalIssue.original,
    id = intended.documentId;
  assert.equal(typeof id, 'number');
  const kind = source.field_kind === 'responsible_person' ? 'people' : 'matters';
  assert.ok(source.field_kind === 'responsible_person' || source.field_kind === 'matter');
  const selected =
    kind === 'people'
      ? (intended.responsiblePeople as Row[]).map((m, index) => {
          assert.equal(m.sourceOrder, index + 1);
          return m.personId!;
        })
      : (intended.matterIds as Json[]);
  assert.equal(new Set(selected).size, selected.length);
  const finish = async (newIds: Json[], mapped: Row[], deltas: Task69Delta[]) => {
    const receipt = await recordTask69Receipt(
      db,
      operation,
      entry.issueId,
      authority,
      context,
      { documentId: id!, kind, newMemberIds: newIds, mappings: mapped },
      [{ source, field: kind, mappings: mapped }],
      deltas,
    );
    assert.equal(
      (
        await db.query('SELECT _migration.task69_document_receipt_valid($1) valid', [
          receipt.receipt_id,
        ])
      ).rows[0].valid,
      true,
    );
    return receipt;
  };
  if (!selected.length) {
    assert.equal(entry.disposition, 'APPROVED_HISTORICAL_ONLY');
    return finish([], [], []);
  }
  assert.equal(
    (await db.query('SELECT _migration.document_edit_current_valid($1) valid', [id])).rows[0].valid,
    true,
  );
  const before = (await db.query('SELECT _migration.document_edit_aggregate($1) value', [id]))
    .rows[0].value as Row;
  assert.deepEqual(before[kind], [], 'Only the reviewed unresolved field may be restored');
  const table = kind === 'people' ? 'document_responsible_people' : 'document_matters',
    column = kind === 'people' ? 'person_id' : 'matter_id',
    scalar = kind === 'people' ? 'responsible_person_id' : 'matter_id';
  const original = Object.fromEntries(
    Object.entries(before).filter(([k]) => k !== 'matters' && k !== 'people'),
  ) as Row;
  await db.query("SELECT set_config('litigation.tasks46_47_gateway','on',true)");
  const rows = (
    await db.query(
      `UPDATE public.documents SET ${scalar}=$2,row_version=row_version+1,updated_at=statement_timestamp() WHERE id=$1 AND NOT is_archived RETURNING to_jsonb(documents) value`,
      [id, selected.length === 1 ? selected[0] : null],
    )
  ).rows;
  assert.equal(rows.length, 1);
  const deltas: Task69Delta[] = [{ table: 'documents', before: original, after: rows[0].value }],
    newIds: Json[] = [],
    mapped: Row[] = [];
  for (const [index, target] of selected.entries()) {
    const member = (
      await db.query(
        `INSERT INTO public.${table}(document_id,${column},position) VALUES($1,$2,$3) RETURNING to_jsonb(${table}) value`,
        [id, target, index + 1],
      )
    ).rows[0].value as Row;
    newIds.push(member.id!);
    mapped.push({ memberId: member.id!, targetId: target, sourceOrder: index + 1 });
    deltas.push({ table, before: null, after: member });
  }
  const after = (await db.query('SELECT _migration.document_edit_aggregate($1) value', [id]))
    .rows[0].value as Row;
  assert.deepEqual(
    after[kind === 'people' ? 'matters' : 'people'],
    before[kind === 'people' ? 'matters' : 'people'],
  );
  await db.query(
    'INSERT INTO _migration.document_edit_change(document_id,version,actor_id,before_values,after_values,request_id) VALUES($1,$2,$3,$4,$5,$6)',
    [
      id,
      rows[0].value.row_version,
      context.actorId,
      JSON.stringify(before),
      JSON.stringify(after),
      context.requestId,
    ],
  );
  await db.query(
    'INSERT INTO _migration.task69_document_change(document_id,version,receipt_id) VALUES($1,$2,$3)',
    [id, rows[0].value.row_version, context.receiptId],
  );
  const receipt = await finish(newIds, mapped, deltas);
  assert.equal(
    (await db.query('SELECT _migration.document_edit_current_valid($1) valid', [id])).rows[0].valid,
    true,
  );
  return receipt;
}
