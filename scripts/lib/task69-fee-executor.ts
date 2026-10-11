import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import type { SessionClaims } from '../../src/lib/auth/session';
import type { Row, Json, Task69Entry } from './task69-contract';
import type { Task69PreparedOperation } from './task69-runner';
import { assertTask69EntryBound, assertTask69Preflight } from './task69-preflight';
import {
  authorizeTask69Issue,
  recordTask69Receipt,
  type Task69Delta,
} from './task69-matter-executor';
export async function executeTask69Fee(
  db: ClientBase,
  operation: Task69PreparedOperation,
  entry: Task69Entry,
  authority: SessionClaims,
): Promise<Row> {
  assertTask69EntryBound(entry, operation);
  const context = await authorizeTask69Issue(db, operation, entry.issueId, authority);
  await assertTask69Preflight(db, entry, operation);
  if (context.receipt) return context.receipt;
  const p = entry.approvedOutcome,
    source = entry.originalIssue.original,
    mapping = p.mapping as Row | undefined,
    direction = p.direction;
  assert.ok(direction === 'FORWARD' || direction === 'REVERSE');
  assert.equal(p.synchronizeOtherDirection, false);
  const fee = p.feeId ?? mapping!.fee_letter_id;
  assert.equal(typeof fee, 'number');
  const selected = (
    direction === 'FORWARD' ? (p.matterIds ?? mapping!.matter_ids) : [mapping!.matter_id]
  ) as number[];
  assert.equal(new Set(selected).size, selected.length);
  const desiredNew = (p.newMatterIds ?? selected) as number[];
  assert.equal(
    (await db.query('SELECT _migration.fee_letter_edit_current_valid($1) valid', [fee])).rows[0]
      .valid,
    true,
  );
  const feeBefore = (await db.query('SELECT _migration.fee_letter_edit_aggregate($1) value', [fee]))
      .rows[0].value as Row,
    parent = feeBefore.feeLetter as Row;
  if (p.originalWork !== undefined) assert.equal(p.originalWork, parent.contract_details);
  const before =
    direction === 'FORWARD'
      ? feeBefore
      : ((
          await db.query('SELECT _migration.matter_fee_reference_aggregate($1) value', [
            selected[0],
          ])
        ).rows[0].value as Row);
  if (direction === 'REVERSE')
    assert.equal(
      (
        await db.query('SELECT _migration.matter_fee_reference_current_valid($1) valid', [
          selected[0],
        ])
      ).rows[0].valid,
      true,
    );
  const existing = before[direction === 'FORWARD' ? 'covered' : 'references'] as Row[],
    missing = selected.filter(
      (id) => !existing.some((m) => m.matter_id === id && m.fee_letter_id === fee && !m.is_retired),
    );
  assert.deepEqual(missing, desiredNew, 'Exact approved new associations only');
  assert.equal(parent.is_archived, false);
  await db.query("SELECT set_config('litigation.tasks46_47_gateway','on',true)");
  await db.query(
    'INSERT INTO _migration.task69_fee_occurrence(receipt_id,direction,fee_id,fee_version,source_contract_id,source_ordinal,identifier_space,source_values,original_work) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      context.receiptId,
      direction,
      fee,
      parent.row_version,
      parent.contract_id,
      direction === 'FORWARD' ? source.ordinal_raw : null,
      direction === 'FORWARD' ? 'contract_id' : source.identifier_space,
      JSON.stringify(source),
      parent.contract_details,
    ],
  );
  const deltas: Task69Delta[] = [],
    ids: Json[] = [],
    maps: Row[] = [];
  let version: Json = parent.row_version!;
  if (missing.length && direction === 'FORWARD') {
    const after = (
      await db.query(
        'UPDATE public.fee_letters SET row_version=row_version+1,updated_at=statement_timestamp() WHERE id=$1 RETURNING to_jsonb(fee_letters) value',
        [fee],
      )
    ).rows[0].value as Row;
    deltas.push({ table: 'fee_letters', before: parent, after });
    version = after.row_version!;
  }
  let order = Math.max(
    0,
    ...existing.map((m) =>
      Number(m.current_order ?? (m.ordinal === null ? 0 : Number(m.ordinal) + 1)),
    ),
  );
  for (const [index, id] of selected.entries()) {
    const created = missing.includes(id);
    let member: Row;
    if (created) {
      if (direction === 'FORWARD')
        member = (
          await db.query(
            'INSERT INTO public.fee_letter_matters(fee_letter_id,matter_id,current_order,updated_at) VALUES($1,$2,$3,statement_timestamp()) RETURNING to_jsonb(fee_letter_matters) value',
            [fee, id, ++order],
          )
        ).rows[0].value;
      else
        member = (
          await db.query(
            'INSERT INTO public.matter_fee_letter_references(matter_id,fee_letter_id,identifier_space,legacy_reference_raw,legacy_source_record_key,legacy_source_extraction_sha256,legacy_source_payload) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING to_jsonb(matter_fee_letter_references) value',
            [
              id,
              fee,
              source.identifier_space,
              source.reference_raw,
              source.src_record_key,
              source.extraction_sha256,
              JSON.stringify(source.source_payload),
            ],
          )
        ).rows[0].value;
      deltas.push({
        table: direction === 'FORWARD' ? 'fee_letter_matters' : 'matter_fee_letter_references',
        before: null,
        after: member,
      });
      ids.push(member.id!);
      if (p.scope === 'BOUNDED_ORIGINAL_WORK') {
        assert.equal(direction, 'FORWARD');
        assert.equal(selected.length, 1);
        const scope = (
          await db.query(
            'INSERT INTO public.fee_letter_matter_scopes(id,scope_kind,covered_proceeding,original_work,scope_statement,excluded_stages) VALUES($1,$2,$3,$4,$5,$6) RETURNING to_jsonb(fee_letter_matter_scopes) value',
            [
              member.id,
              p.scope,
              p.coveredProceeding,
              p.originalWork,
              p.approvedAction,
              p.excludedStages,
            ],
          )
        ).rows[0].value as Row;
        await db.query('INSERT INTO _migration.task69_fee_scope_binding VALUES($1,$2)', [
          member.id,
          context.receiptId,
        ]);
        deltas.push({ table: 'fee_letter_matter_scopes', before: null, after: scope });
      }
    } else {
      member = existing.find(
        (m) => m.matter_id === id && m.fee_letter_id === fee && !m.is_retired,
      )!;
      assert.ok(member);
    }
    await db.query(
      'INSERT INTO _migration.task69_fee_association(receipt_id,position,forward_id,reverse_id,was_created) VALUES($1,$2,$3,$4,$5)',
      [
        context.receiptId,
        index + 1,
        direction === 'FORWARD' ? member.id : null,
        direction === 'REVERSE' ? member.id : null,
        created,
      ],
    );
    maps.push({ memberId: member.id!, matterId: id, sourcePosition: index + 1, created });
  }
  if (missing.length) {
    if (direction === 'REVERSE') {
      await db.query(
        'INSERT INTO _migration.matter_fee_reference_state(matter_id) VALUES($1) ON CONFLICT(matter_id) DO NOTHING',
        [selected[0]],
      );
      version = (
        await db.query(
          'UPDATE _migration.matter_fee_reference_state SET row_version=row_version+1 WHERE matter_id=$1 RETURNING row_version',
          [selected[0]],
        )
      ).rows[0].row_version;
    }
    const after = (
      await db.query(
        direction === 'FORWARD'
          ? 'SELECT _migration.fee_letter_edit_aggregate($1) value'
          : 'SELECT _migration.matter_fee_reference_aggregate($1) value',
        [direction === 'FORWARD' ? fee : selected[0]],
      )
    ).rows[0].value;
    await db.query(
      direction === 'FORWARD'
        ? 'INSERT INTO _migration.fee_letter_edit_change(fee_letter_id,version,actor_id,before_values,after_values,request_id) VALUES($1,$2,$3,$4,$5,$6)'
        : 'INSERT INTO _migration.matter_fee_reference_change(matter_id,version,actor_id,before_values,after_values,request_id) VALUES($1,$2,$3,$4,$5,$6)',
      [
        direction === 'FORWARD' ? fee : selected[0],
        version,
        context.actorId,
        JSON.stringify(before),
        JSON.stringify(after),
        context.requestId,
      ],
    );
    await db.query('INSERT INTO _migration.task69_fee_change VALUES($1,$2,$3,$4)', [
      direction === 'FORWARD' ? 'fee_letters' : 'matter_fee_letter_references',
      direction === 'FORWARD' ? fee : selected[0],
      version,
      context.receiptId,
    ]);
  }
  const receipt = await recordTask69Receipt(
    db,
    operation,
    entry.issueId,
    authority,
    context,
    { feeId: fee!, direction: direction!, newMemberIds: ids, mappings: maps },
    [{ source, direction: direction!, mappings: maps }],
    deltas,
  );
  assert.equal(
    (await db.query('SELECT _migration.task69_fee_receipt_valid($1) valid', [receipt.receipt_id]))
      .rows[0].valid,
    true,
    'Exact S7 receipt semantics',
  );
  assert.equal(
    (
      await db.query(
        direction === 'FORWARD'
          ? 'SELECT _migration.fee_letter_edit_current_valid($1) valid'
          : 'SELECT _migration.matter_fee_reference_current_valid($1) valid',
        [direction === 'FORWARD' ? fee : selected[0]],
      )
    ).rows[0].valid,
    true,
    'S7 native continuity',
  );
  return receipt;
}
