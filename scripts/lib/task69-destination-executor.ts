import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import type { SessionClaims } from '../../src/lib/auth/session';
import { assertTask69Guard, task69Digest, type Row, type Json } from './task69-contract';
import type { Task69PreparedOperation } from './task69-runner';
import { readTask69Transitions } from './task69-preflight';
import {
  authorizeTask69Issue,
  recordTask69Receipt,
  type Task69Delta,
} from './task69-matter-executor';

/** One exact shared normalization. Dynamic FK discovery is bounded to the three
 * reviewed tables; locking them prevents an unseen inbound reference race. */
export async function executeTask69Destination(
  db: ClientBase,
  operation: Task69PreparedOperation,
  authority: SessionClaims,
): Promise<Row> {
  const issue = 'DEST-INVESTMENT-26-32',
    allowed = operation.allowlist.find((e) => e.issue_id === issue && e.unit_kind === 'dependency');
  assert.ok(allowed);
  const payload = JSON.parse(allowed.payload_text) as Row;
  assert.equal(payload.namespace, 'public.lookup_matter_destination');
  assert.equal(payload.survivorId, 26);
  assert.equal(payload.retiredId, 32);
  assert.equal(payload.independentCreateAllowed, false);
  const context = await authorizeTask69Issue(db, operation, issue, authority);
  if (context.receipt) return context.receipt;
  await db.query(
    'LOCK TABLE public.lookup_matter_destination,public.admin_tasks,public.hearings,public.matters IN SHARE ROW EXCLUSIVE MODE',
  );
  const fk = (
    await db.query(
      "SELECT n.nspname schema,c.relname table,a.attname column FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.conkey[1] WHERE k.contype='f' AND k.confrelid='public.lookup_matter_destination'::regclass ORDER BY 1,2,3",
    )
  ).rows;
  assert.deepEqual(
    fk,
    [
      { schema: 'public', table: 'admin_tasks', column: 'destination_id' },
      { schema: 'public', table: 'hearings', column: 'destination_id' },
      { schema: 'public', table: 'matters', column: 'destination_id' },
    ],
    'Complete exact inbound FK inventory',
  );
  assert.ok(Array.isArray(payload.existingReferenceEffects));
  assert.equal(payload.existingReferenceEffects.length, 15);
  assert.ok(Array.isArray(payload.lookupDeltas));
  assert.equal(payload.lookupDeltas.length, 2);
  const refs = payload.existingReferenceEffects as Row[],
    lookups = payload.lookupDeltas as Row[];
  const current = (
    await db.query(
      "SELECT 'public.admin_tasks' table,to_jsonb(a) value FROM public.admin_tasks a WHERE destination_id IN(26,32) UNION ALL SELECT 'public.hearings',to_jsonb(h) FROM public.hearings h WHERE destination_id IN(26,32) UNION ALL SELECT 'public.matters',to_jsonb(m) FROM public.matters m WHERE destination_id IN(26,32)",
    )
  ).rows as { table: string; value: Row }[];
  const key = (table: string, id: Json) => table + '/' + String(id);
  assert.deepEqual(
    current.map((x) => key(x.table, x.value.id!)).sort(),
    refs.map((x) => key(String(x.table), x.id!)).sort(),
    'Complete inbound membership set',
  );
  const transitions = await readTask69Transitions(db, operation.operationId);
  for (const effect of [...refs, ...lookups]) {
    const table = String(effect.table);
    assert(
      ['public.matters', 'public.admin_tasks', 'public.lookup_matter_destination'].includes(table),
    );
    const rows = (
      await db.query(`SELECT to_jsonb(r) value FROM ${table} r WHERE id=$1 FOR UPDATE`, [effect.id])
    ).rows;
    assert.equal(rows.length, 1);
    const original = effect.beforeRow as Row;
    assert.equal(task69Digest(original), effect.beforeSha256);
    assertTask69Guard(
      {
        table,
        id: Number(effect.id),
        hash: String(effect.beforeSha256),
        expectedIdCardinality: 1,
        exactLabels: {},
        exactLabelCardinality: {},
        eligibility: {
          requireUnarchived: table !== 'public.lookup_matter_destination',
          inactiveHistoricalIdentityAllowed: false,
        },
      },
      rows[0].value,
      operation.operationId,
      transitions,
    );
  }
  assert.deepEqual(
    (
      await db.query('SELECT id FROM public.lookup_matter_destination WHERE label_ar=$1', [
        payload.canonicalLabel,
      ])
    ).rows,
    [],
  );
  for (const l of lookups) {
    assert.deepEqual(
      (
        await db.query(
          'SELECT id FROM public.lookup_matter_destination WHERE label_ar=$1 ORDER BY id',
          [(l.beforeRow as Row).label_ar],
        )
      ).rows,
      [{ id: l.id }],
    );
  }
  const before = (await db.query('SELECT _migration.matter_edit_aggregate(3048) value')).rows[0]
    .value as Row;
  assert.equal(
    (await db.query('SELECT _migration.matter_edit_current_valid(3048) valid')).rows[0].valid,
    true,
  );
  const deltas: Task69Delta[] = [];
  for (const item of lookups) {
    const field = item.id === 26 ? 'label_ar' : 'is_active';
    const changes = item.columns as Row;
    assert.deepEqual(Object.keys(changes), [field]);
    const value = (changes[field] as Row).after;
    const after = (
      await db.query(
        `UPDATE public.lookup_matter_destination SET ${field}=$1 WHERE id=$2 RETURNING to_jsonb(lookup_matter_destination) value`,
        [value, item.id],
      )
    ).rows[0].value;
    deltas.push({ table: 'lookup_matter_destination', before: item.beforeRow as Row, after });
  }
  const updated = (
    await db.query(
      'UPDATE public.matters SET destination_id=26,row_version=row_version+1 WHERE id=3048 AND destination_id=32 AND NOT is_archived RETURNING to_jsonb(matters) value',
    )
  ).rows;
  assert.equal(updated.length, 1);
  deltas.push({ table: 'matters', before: before.matter as Row, after: updated[0].value });
  const after = (await db.query('SELECT _migration.matter_edit_aggregate(3048) value')).rows[0]
    .value;
  await db.query(
    'INSERT INTO _migration.matter_edit_change(matter_id,version,actor_id,before_values,after_values,request_id) VALUES(3048,$1,$2,$3,$4,$5)',
    [
      updated[0].value.row_version,
      context.actorId,
      JSON.stringify(before),
      JSON.stringify(after),
      context.requestId,
    ],
  );
  // Fourteen existing referencing rows receive neither a rewrite nor a fake audit.
  for (const prior of current.filter(
    (x) => !(x.table === 'public.matters' && x.value.id === 3048),
  )) {
    const now = (
      await db.query(`SELECT to_jsonb(r) value FROM ${prior.table} r WHERE id=$1`, [prior.value.id])
    ).rows;
    assert.deepEqual(now, [{ value: prior.value }]);
  }
  const receipt = await recordTask69Receipt(
    db,
    operation,
    issue,
    authority,
    context,
    { id: 26, retiredId: 32, redirectedMatterId: 3048 },
    payload.preservedAliasProvenance as Json[],
    deltas,
  );
  assert.equal(
    (
      await db.query('SELECT _migration.task69_destination_receipt_valid($1) valid', [
        receipt.receipt_id,
      ])
    ).rows[0].valid,
    true,
  );
  return receipt;
}
