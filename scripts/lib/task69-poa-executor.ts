import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import type { SessionClaims } from '../../src/lib/auth/session';
import { type Row, type Json, type Task69Entry } from './task69-contract';
import type { Task69PreparedOperation } from './task69-runner';
import { assertTask69Preflight, assertTask69EntryBound } from './task69-preflight';
import {
  authorizeTask69Issue,
  recordTask69Receipt,
  insertTask69Row,
  type Task69Delta,
} from './task69-matter-executor';
/** Add only the missing approved effective members. Existing relation bytes and
 * source ordinals remain untouched; full-cell display order and every original
 * occurrence are bound separately to the immutable restoration receipt. */
export async function executeTask69Poa(
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
    id = intended.poaId;
  assert.equal(typeof id, 'number');
  const members = intended.members as Row[],
    missing = intended.newMembers as Row[],
    preserved = intended.preservedExistingLinks as Row[];
  if (missing.length === 0) {
    assert.deepEqual(members, []);
    assert.deepEqual(preserved, []);
    assert.deepEqual(intended.sourceOccurrences, []);
    assert.deepEqual(intended.personStateChanges, []);
    assert.equal(source.relationship_kind, 'client');
    assert.equal(source.raw_value, null);
    const receipt = await recordTask69Receipt(
      db,
      operation,
      entry.issueId,
      authority,
      context,
      { poaId: id!, newMemberIds: [], members: [] },
      [{ source, occurrences: [], preservedExistingLinks: [], mappings: [] }],
      [],
    );
    assert.equal(
      (await db.query('SELECT _migration.task69_poa_receipt_valid($1) valid', [receipt.receipt_id]))
        .rows[0].valid,
      true,
    );
    return receipt;
  }
  assert.equal(members.length, missing.length + preserved.length);
  assert.equal(new Set(members.map((m) => m.personId)).size, members.length);
  assert.deepEqual(intended.personStateChanges, []);
  assert.equal(
    (await db.query('SELECT _migration.poa_edit_current_valid($1) valid', [id])).rows[0].valid,
    true,
  );
  const before = (await db.query('SELECT _migration.poa_edit_aggregate($1) value', [id])).rows[0]
    .value as Row;
  const baseOrder = Math.max(
    0,
    ...(before.lawyers as Row[]).map((m) =>
      Number(m.current_order ?? m.source_member_ordinal ?? 0),
    ),
  );
  const updated = (
    await db.query(
      'UPDATE public.powers_of_attorney SET row_version=row_version+1,updated_at=statement_timestamp() WHERE id=$1 AND NOT is_archived RETURNING to_jsonb(powers_of_attorney) value',
      [id],
    )
  ).rows;
  assert.equal(updated.length, 1);
  const deltas: Task69Delta[] = [
    { table: 'powers_of_attorney', before: before.poa as Row, after: updated[0].value },
  ];
  const newIds: Json[] = [];
  for (const [index, m] of missing.entries()) {
    const row = await insertTask69Row(db, 'power_of_attorney_lawyers', {
      power_of_attorney_id: id!,
      person_id: m.personId!,
      is_retired: false,
      current_order: baseOrder + index + 1,
      legacy_source_record_key: source.src_record_key!,
      legacy_source_extraction_sha256: source.extraction_sha256!,
      legacy_lawyers_raw: source.raw_value!,
      reviewed_rule_id: null,
      source_member_ordinal: null,
    });
    newIds.push(row.id!);
    deltas.push({ table: 'power_of_attorney_lawyers', before: null, after: row });
  }
  const after = (await db.query('SELECT _migration.poa_edit_aggregate($1) value', [id])).rows[0]
    .value as Row;
  for (const old of before.lawyers as Row[])
    assert.deepEqual(
      (after.lawyers as Row[]).find((m) => m.id === old.id),
      old,
      'Existing link must remain byte-identical',
    );
  const mapped: Row[] = [];
  for (const [index, m] of members.entries()) {
    assert.equal(m.displayOrder, index + 1);
    const matching = (after.lawyers as Row[]).filter((l) => l.person_id === m.personId);
    assert.equal(matching.length, 1);
    const row = matching[0]!;
    await db.query(
      'INSERT INTO _migration.task69_poa_order(member_id,poa_id,position,receipt_id) VALUES($1,$2,$3,$4)',
      [row.id, id, index + 1, context.receiptId],
    );
    mapped.push({ memberId: row.id!, personId: m.personId!, displayOrder: index + 1 });
  }
  await db.query(
    'INSERT INTO _migration.poa_edit_change(poa_id,version,actor_id,before_values,after_values,request_id) VALUES($1,$2,$3,$4,$5,$6)',
    [
      id,
      updated[0].value.row_version,
      context.actorId,
      JSON.stringify(before),
      JSON.stringify(after),
      context.requestId,
    ],
  );
  await db.query(
    'INSERT INTO _migration.task69_poa_change(poa_id,version,receipt_id) VALUES($1,$2,$3)',
    [id, updated[0].value.row_version, context.receiptId],
  );
  const receipt = await recordTask69Receipt(
    db,
    operation,
    entry.issueId,
    authority,
    context,
    { poaId: id!, newMemberIds: newIds, members: mapped },
    [
      {
        source,
        occurrences: intended.sourceOccurrences!,
        preservedExistingLinks: intended.preservedExistingLinks!,
        mappings: mapped,
      },
    ],
    deltas,
  );
  assert.equal(
    (await db.query('SELECT _migration.task69_poa_receipt_valid($1) valid', [receipt.receipt_id]))
      .rows[0].valid,
    true,
  );
  assert.equal(
    (await db.query('SELECT _migration.poa_edit_current_valid($1) valid', [id])).rows[0].valid,
    true,
  );
  return receipt;
}
