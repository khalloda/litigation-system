import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import type { SessionClaims } from '../../src/lib/auth/session';
import { type Row, type Json, type Task69Entry } from './task69-contract';
import type { Task69PreparedOperation } from './task69-runner';
import { assertTask69Preflight } from './task69-preflight';
import {
  authorizeTask69Issue,
  recordTask69Receipt,
  insertTask69Row,
  type Task69Delta,
} from './task69-matter-executor';

export async function executeTask69Lawyers(
  db: ClientBase,
  operation: Task69PreparedOperation,
  entry: Task69Entry,
  authority: SessionClaims,
): Promise<Row> {
  const context = await authorizeTask69Issue(db, operation, entry.issueId, authority);
  if (context.receipt) return context.receipt;
  await assertTask69Preflight(db, entry, operation);
  const intended = entry.approvedOutcome,
    source = entry.originalIssue.original;
  assert.equal(source.source_field, 'lawyerA');
  assert.equal(typeof intended.matterId, 'number');
  assert.ok(Array.isArray(intended.assignments));
  const matterId = intended.matterId as number;
  const before = (await db.query('SELECT _migration.matter_edit_aggregate($1) value', [matterId]))
    .rows[0].value as Row;
  assert.equal(
    (await db.query('SELECT _migration.matter_edit_current_valid($1) valid', [matterId])).rows[0]
      .valid,
    true,
  );
  const changed = (
    await db.query(
      'UPDATE public.matters SET row_version=row_version+1 WHERE id=$1 AND NOT is_archived RETURNING to_jsonb(matters) value',
      [matterId],
    )
  ).rows;
  assert.equal(changed.length, 1);
  const deltas: Task69Delta[] = [
    { table: 'matters', before: before.matter as Row, after: changed[0].value },
  ];
  const returned: Row = { matterId, assignments: [] };
  const retained: Json[] = [];
  for (const a of intended.assignments) {
    assert.ok(a && typeof a === 'object' && !Array.isArray(a));
    const role = a.role === 'المحامي الرئيسي (lead)' ? 'lead' : a.role;
    assert.ok(role === 'lead' || role === 'co_lead' || role === 'support');
    const existing = (
      await db.query(
        'SELECT to_jsonb(l) value FROM public.matter_lawyers l WHERE matter_id=$1 AND person_id=$2 FOR UPDATE',
        [matterId, a.personId],
      )
    ).rows;
    assert.ok(existing.length <= 1);
    let after: Row;
    if (existing.length) {
      assert.equal(entry.issueId, 'quarantine.matter_relationship_transform:431');
      assert.equal(a.personId, 2);
      assert.equal(intended.reuseExistingPerson2Relation, true);
      assert.equal(intended.removeOnlyEffectiveDuplicateBSupport, true);
      assert.equal(intended.preserveAandBOccurrences, true);
      const previous = existing[0].value as Row;
      assert.equal(previous.id, 412);
      assert.equal(previous.source_field, 'lawyerB');
      assert.equal(previous.role, 'support');
      assert.equal(previous.is_retired, false);
      after = (
        await db.query(
          'UPDATE public.matter_lawyers SET role=$1,position=$2 WHERE id=$3 RETURNING to_jsonb(matter_lawyers) value',
          [role, a.ordinal, previous.id],
        )
      ).rows[0].value;
      deltas.push({ table: 'matter_lawyers', before: previous, after });
      const historical = { ...previous };
      delete historical.task69_receipt_id;
      retained.push(historical);
    } else {
      // No ordinary person/account activation: this private path admits only the
      // reviewed historical identity after exact current guards have passed.
      after = await insertTask69Row(db, 'matter_lawyers', {
        matter_id: matterId,
        person_id: a.personId!,
        role,
        position: a.ordinal!,
        legacy_source: source.raw_value!,
        legacy_source_record_key: source.src_record_key!,
        legacy_source_extraction_sha256: source.extraction_sha256!,
        source_field: source.source_field!,
        source_member_ordinal: a.ordinal!,
        reviewed_rule_id: null,
        is_retired: false,
        task69_receipt_id: context.receiptId,
      });
      deltas.push({ table: 'matter_lawyers', before: null, after });
    }
    (returned.assignments as Json[]).push(after.id!);
  }
  const after = (await db.query('SELECT _migration.matter_edit_aggregate($1) value', [matterId]))
    .rows[0].value;
  await db.query(
    'INSERT INTO _migration.matter_edit_change(matter_id,version,actor_id,before_values,after_values,request_id) VALUES($1,$2,$3,$4,$5,$6)',
    [
      matterId,
      changed[0].value.row_version,
      context.actorId,
      JSON.stringify(before),
      JSON.stringify(after),
      context.requestId,
    ],
  );
  const receipt = await recordTask69Receipt(
    db,
    operation,
    entry.issueId,
    authority,
    context,
    returned,
    [{ source, mappings: returned, retainedExisting: retained }],
    deltas,
  );
  assert.equal(
    (
      await db.query('SELECT _migration.task69_lawyer_receipt_valid($1) valid', [
        receipt.receipt_id,
      ])
    ).rows[0].valid,
    true,
  );
  return receipt;
}
