import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import type { SessionClaims } from '../../src/lib/auth/session';
import type { Row, Task69Entry } from './task69-contract';
import type { Task69PreparedOperation } from './task69-runner';
import { assertTask69EntryBound, assertTask69Preflight } from './task69-preflight';
import { authorizeTask69Issue, recordTask69Receipt } from './task69-matter-executor';
/** History is an explicit factual disposition, never a business update or attendance claim. */
export async function executeTask69History(
  db: ClientBase,
  operation: Task69PreparedOperation,
  entry: Task69Entry,
  authority: SessionClaims,
): Promise<Row> {
  assertTask69EntryBound(entry, operation);
  const context = await authorizeTask69Issue(db, operation, entry.issueId, authority);
  await assertTask69Preflight(db, entry, operation);
  if (context.receipt) return context.receipt;
  assert.equal(entry.disposition, 'APPROVED_HISTORICAL_ONLY');
  const p = entry.approvedOutcome,
    source = entry.originalIssue.original;
  let kind: string, subjectId;
  if (entry.store === 'deferred.D54') {
    kind = 'historical-staff';
    subjectId = p.clientId;
    assert.equal(p.rawHistoricalStaff, source.raw_value);
    for (const k of ['createOwnership', 'createAccount', 'createNotifications'])
      assert.equal(p[k], false);
  } else if (entry.store === 'deferred.hearing-parent') {
    kind = 'unassigned-hearing';
    subjectId = p.hearingId;
    assert.equal(p.matter_id, null);
    assert.equal(p.preserveAllValues, true);
  } else {
    assert.equal(entry.store, 'quarantine.attendee_span');
    kind = 'attendee-fragment';
    subjectId = p.hearingId;
    assert.equal(p.createPhysicalAttendance, false);
    for (const [a, b] of [
      ['fragmentId', 'fragment_id'],
      ['cellId', 'cell_id'],
      ['sequence', 'sequence'],
      ['startUTF16', 'start_offset'],
      ['endUTF16', 'end_offset'],
      ['raw', 'raw'],
    ])
      assert.deepEqual(p[a!], source[b!]);
  }
  assert.equal(typeof subjectId, 'number');
  const witness = (
    await db.query('SELECT _migration.task69_history_context($1,$2::jsonb) value', [
      entry.issueId,
      JSON.stringify(p),
    ])
  ).rows[0].value as Row;
  if (kind === 'historical-staff')
    assert.equal((witness.client as Row).contact_person_id, p.contact_person_id);
  if (kind === 'unassigned-hearing') assert.equal((witness.hearing as Row).matter_id, null);
  if (kind === 'attendee-fragment') {
    const cell = witness.cell as Row,
      spans = witness.spans as Row[];
    let cursor = 0,
      reconstructed = '';
    assert(spans.length > 0);
    spans.forEach((span, i) => {
      assert.equal(span.cell_id, p.cellId);
      assert.equal(span.sequence, i + 1);
      assert.equal(span.start_offset, cursor);
      assert.equal(typeof span.raw, 'string');
      const raw = span.raw as string;
      assert.equal(span.end_offset, cursor + raw.length);
      assert.equal((cell.original_cell as string).slice(cursor, cursor + raw.length), raw);
      cursor += raw.length;
      reconstructed += raw;
    });
    assert.equal(reconstructed, cell.original_cell);
    const fragments = spans.filter((s) => s.fragment_id === p.fragmentId);
    assert.equal(fragments.length, 1);
    assert.equal(fragments[0]!.raw, p.raw);
  }
  await db.query(
    'INSERT INTO _migration.task69_history_disposition(receipt_id,kind,source_values,approved_outcome,witness) VALUES($1,$2,$3,$4,$5)',
    [context.receiptId, kind, source, p, witness],
  );
  const receipt = await recordTask69Receipt(
    db,
    operation,
    entry.issueId,
    authority,
    context,
    { kind, subjectId: subjectId!, businessChanged: false },
    [{ source, approvedOutcome: p, witness }],
    [],
  );
  assert.equal(
    (
      await db.query('SELECT _migration.task69_history_receipt_valid($1) valid', [
        receipt.receipt_id,
      ])
    ).rows[0].valid,
    true,
  );
  return receipt;
}
