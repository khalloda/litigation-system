import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import type { SessionClaims } from '../../src/lib/auth/session';
import {
  task69Canonical,
  task69Digest,
  type Json,
  type Row,
  type Task69Entry,
} from './task69-contract';
import type { Task69PreparedOperation } from './task69-runner';
import { assertTask69Preflight, assertTask69EntryBound } from './task69-preflight';

export type Task69Delta = { table: string; before: Row | null; after: Row };
export type Task69Context = {
  actorId: number;
  requestId: string;
  receiptId: string;
  receipt: Row | null;
};

export async function authorizeTask69Issue(
  db: ClientBase,
  operation: Task69PreparedOperation,
  issueId: string,
  authority: SessionClaims,
): Promise<Task69Context> {
  const allowed = operation.allowlist.find((e) => e.issue_id === issueId);
  assert.ok(allowed);
  const result = (
    await db.query(
      'SELECT _migration.task69_authorize_issue($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::uuid) value',
      [
        operation.operationId,
        issueId,
        allowed.payload_sha256,
        authority.userId,
        authority.sessionVersion,
        authority.role,
        new Date(authority.absoluteExpiresAt).toISOString(),
        authority.auditSessionId,
      ],
    )
  ).rows[0].value;
  const requestId = randomUUID();
  if (!result.receipt) {
    await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
    await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
      requestId,
      operation.operationId,
      authority.auditSessionId,
    ]);
    await db.query(
      "SELECT set_config('litigation.task69_operation',$1,true),set_config('litigation.task69_issue',$2,true)",
      [operation.operationId, issueId],
    );
  }
  return {
    actorId: result.actorId,
    requestId,
    receiptId: result.receipt?.receipt_id ?? randomUUID(),
    receipt: result.receipt,
  };
}

export async function recordTask69Receipt(
  db: ClientBase,
  operation: Task69PreparedOperation,
  issueId: string,
  authority: SessionClaims,
  context: Task69Context,
  returned: Row,
  occurrences: Json[],
  deltas: Task69Delta[],
): Promise<Row> {
  const allowed = operation.allowlist.find((e) => e.issue_id === issueId);
  assert.ok(allowed);
  assert.equal(context.receipt, null);
  const receiptId = context.receiptId;
  await db.query(
    "INSERT INTO _migration.task69_receipt(receipt_id,operation_id,issue_id,payload_sha256,phase,actor_id,audit_session_id,request_id,returned_ids,source_occurrences,effect,expected_delta_count) VALUES($1,$2,$3,$4,'apply',$5,$6,$7,$8,$9,$10,$11)",
    [
      receiptId,
      operation.operationId,
      issueId,
      allowed.payload_sha256,
      context.actorId,
      authority.auditSessionId,
      context.requestId,
      JSON.stringify(returned),
      JSON.stringify(occurrences),
      deltas.length ? 'business-change' : 'no-business-write',
      deltas.length,
    ],
  );
  for (const [index, delta] of deltas.entries()) {
    const events = (
      await db.query(
        "SELECT id FROM public.audit_events WHERE request_id=$1 AND entity_schema='public' AND entity_table=$2 AND entity_key=jsonb_build_object('id',$3::int)",
        [context.requestId, delta.table, delta.after.id],
      )
    ).rows;
    assert.equal(events.length, 1, 'Every actual business delta needs exactly one truthful event');
    await db.query(
      "INSERT INTO _migration.task69_delta(receipt_id,ordinal,entity_schema,entity_table,entity_key,before_values,after_values,audit_event_id) VALUES($1,$2,'public',$3,$4,$5,$6,$7)",
      [
        receiptId,
        index + 1,
        delta.table,
        JSON.stringify({ id: delta.after.id }),
        delta.before === null ? null : JSON.stringify(delta.before),
        JSON.stringify(delta.after),
        events[0].id,
      ],
    );
  }
  assert.equal(
    (await db.query('SELECT _migration.task69_receipt_valid($1) valid', [receiptId])).rows[0].valid,
    true,
  );
  return (
    await db.query(
      'SELECT to_jsonb(r) value FROM _migration.task69_receipt r WHERE receipt_id=$1',
      [receiptId],
    )
  ).rows[0].value;
}

const writableTables = [
  'admin_tasks',
  'matter_lawyers',
  'matter_parties',
  'matter_party_roles',
  'lookup_party_role',
  'lookup_court',
  'lookup_matter_destination',
] as const;
export async function insertTask69Row(
  db: ClientBase,
  table: (typeof writableTables)[number],
  row: Row,
): Promise<Row> {
  assert.ok(writableTables.includes(table));
  const keys = Object.keys(row);
  assert(keys.length && keys.every((k) => /^[a-z_][a-z0-9_]*$/u.test(k)));
  const columns = keys.map((k) => '"' + k + '"').join(',');
  return (
    await db.query(
      `INSERT INTO public.${table}(${columns},updated_at) SELECT ${keys.map((k) => 'v."' + k + '"').join(',')},statement_timestamp() FROM jsonb_populate_record(NULL::public.${table},$1::jsonb) v RETURNING to_jsonb(${table}) value`,
      [JSON.stringify(row)],
    )
  ).rows[0].value;
}

export async function executeTask69Lookup(
  db: ClientBase,
  operation: Task69PreparedOperation,
  issueId: string,
  authority: SessionClaims,
): Promise<Row> {
  const item = operation.allowlist.find(
    (e) => e.issue_id === issueId && e.unit_kind === 'dependency',
  );
  assert.ok(item);
  const payload = JSON.parse(item.payload_text) as Row;
  assert.equal(
    issueId,
    'LOOKUP/' + task69Digest({ namespace: payload.namespace!, label: payload.exactLabel! }),
  );
  assert.equal(payload.expectedCardinality, 0);
  assert.deepEqual(payload.expectedIds, []);
  const table = String(payload.namespace).replace(/^public\./u, '');
  assert.ok(
    table === 'lookup_party_role' ||
      table === 'lookup_court' ||
      table === 'lookup_matter_destination',
  );
  const context = await authorizeTask69Issue(db, operation, issueId, authority);
  if (context.receipt) return context.receipt;
  await db.query(`LOCK TABLE public.${table} IN SHARE ROW EXCLUSIVE MODE`);
  const condition =
    table === 'lookup_party_role' ? 'label_ar_m=$1 OR label_ar_f=$1' : 'label_ar=$1';
  assert.deepEqual(
    (await db.query(`SELECT id FROM public.${table} WHERE ${condition}`, [payload.exactLabel]))
      .rows,
    [],
    'Approved exact label must still be absent',
  );
  const fields: Row = {
    is_active: true,
    sort_order: 0,
  };
  if (table === 'lookup_party_role') {
    fields.code =
      't69_' +
      task69Digest({ namespace: payload.namespace!, label: payload.exactLabel! }).slice(0, 20);
    fields.label_ar_m = payload.exactLabel!;
    fields.label_ar_f = payload.exactLabel!;
  } else fields.label_ar = payload.exactLabel!;
  const after = await insertTask69Row(db, table, fields);
  return recordTask69Receipt(
    db,
    operation,
    issueId,
    authority,
    context,
    { id: after.id! },
    [],
    [{ table, before: null, after }],
  );
}

/** Exact approved field -> ordered party and capacity rows. Native creation is
 * deliberately not used: these are restored historical rows with source proof. */
export async function executeTask69Parties(
  db: ClientBase,
  operation: Task69PreparedOperation,
  entry: Task69Entry,
  authority: SessionClaims,
): Promise<Row> {
  assertTask69EntryBound(entry, operation);
  const context = await authorizeTask69Issue(db, operation, entry.issueId, authority);
  if (context.receipt) return context.receipt;
  await assertTask69Preflight(db, entry, operation);
  const p = entry.approvedOutcome,
    src = entry.originalIssue.original;
  assert.ok(Array.isArray(p.matterIds) && p.matterIds.length === 1);
  const matterId = p.matterIds[0];
  assert.equal(typeof matterId, 'number');
  assert.ok(Array.isArray(p.parties) && p.parties.length > 0);
  const before = (await db.query('SELECT _migration.matter_edit_aggregate($1) value', [matterId]))
    .rows[0].value as Row;
  assert.equal(
    (await db.query('SELECT _migration.matter_edit_current_valid($1) valid', [matterId])).rows[0]
      .valid,
    true,
  );
  assert.deepEqual(
    (
      await db.query('SELECT id FROM public.matter_parties WHERE matter_id=$1 AND side=$2', [
        matterId,
        p.side,
      ])
    ).rows,
    [],
    'Existing same-side rows require independent reconciliation',
  );
  const matter = (
    await db.query(
      'UPDATE public.matters SET row_version=row_version+1 WHERE id=$1 AND NOT is_archived RETURNING to_jsonb(matters) value',
      [matterId],
    )
  ).rows;
  assert.equal(matter.length, 1, 'Missing or archived matter');
  const deltas: Task69Delta[] = [
    { table: 'matters', before: before.matter as Row, after: matter[0].value },
  ];
  const returned: Row = { matterId: matterId!, parties: [] };
  for (const [pi, value] of p.parties.entries()) {
    assert.ok(value && !Array.isArray(value) && typeof value === 'object');
    const party = value;
    const after = await insertTask69Row(db, 'matter_parties', {
      matter_id: matterId!,
      side: p.side!,
      party_name: party.name!,
      gender: party.gender ?? null,
      ordinal: pi + 1,
      semantic_party_name: party.semantic_party_name ?? null,
      representative_name: party.representative_name ?? null,
      contextual_text: party.contextual_text ?? null,
      explanatory_text: party.explanatoryText ?? null,
      legacy_raw: src.raw_value!,
      legacy_source_record_key: src.src_record_key!,
      legacy_source_extraction_sha256: src.extraction_sha256!,
      source_field: src.source_field!,
      source_fragment_ordinal: pi + 1,
      is_retired: false,
    });
    deltas.push({ table: 'matter_parties', before: null, after });
    const mapping: Row = { id: after.id!, roleIds: [] };
    assert.ok(Array.isArray(party.roles));
    for (const [ri, v] of party.roles.entries()) {
      assert.ok(v && !Array.isArray(v) && typeof v === 'object');
      let roleId = v.lookupId;
      if (roleId === null) {
        const key =
          'LOOKUP/' + task69Digest({ namespace: 'public.lookup_party_role', label: v.role! });
        const dependency = (
          await db.query(
            "SELECT returned_ids FROM _migration.task69_receipt WHERE operation_id=$1 AND issue_id=$2 AND phase='apply'",
            [operation.operationId, key],
          )
        ).rows;
        assert.equal(dependency.length, 1);
        roleId = dependency[0].returned_ids.id;
      }
      assert.equal(typeof roleId, 'number');
      const role = await insertTask69Row(db, 'matter_party_roles', {
        party_id: after.id!,
        role_id: roleId!,
        ordinal: ri + 1,
        display_label: v.role!,
        qualifier: v.qualifier ?? null,
        legacy_role_raw: v.source_role ?? null,
        is_retired: false,
      });
      deltas.push({ table: 'matter_party_roles', before: null, after: role });
      (mapping.roleIds as Json[]).push(role.id!);
    }
    (returned.parties as Json[]).push(mapping);
  }
  const after = (await db.query('SELECT _migration.matter_edit_aggregate($1) value', [matterId]))
    .rows[0].value;
  await db.query(
    'INSERT INTO _migration.matter_edit_change(matter_id,version,actor_id,before_values,after_values,request_id) VALUES($1,$2,$3,$4,$5,$6)',
    [
      matterId,
      matter[0].value.row_version,
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
    [{ source: src, mappings: returned }],
    deltas,
  );
  assert.equal(
    (await db.query('SELECT _migration.task69_party_receipt_valid($1) valid', [receipt.receipt_id]))
      .rows[0].valid,
    true,
  );
  assert.equal(task69Canonical(receipt.returned_ids!), task69Canonical(returned));
  return receipt;
}
