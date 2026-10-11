import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import {
  assertTask69References,
  task69ExpandedBaseline,
  task69Digest,
  task69ReferenceSql,
  TASK69_REFERENCE_TABLES,
  type Json,
  type Row,
  type Task69Entry,
  type Task69RowTransition,
} from './task69-contract';
import type { Task69PreparedOperation } from './task69-runner';

const sourceIdentities: Record<string, readonly string[]> = {
  'quarantine.matter_relationship_transform': ['id'],
  'quarantine.admin_task_transform': ['extraction_sha256', 'src_record_key'],
  'quarantine.task_action_transform': ['extraction_sha256', 'src_record_key'],
  'quarantine.power_of_attorney_relationship': [
    'extraction_sha256',
    'src_record_key',
    'relationship_kind',
  ],
  'quarantine.document_evidence': ['extraction_sha256', 'src_record_key', 'field_kind'],
  'quarantine.fee_letter_matter_transform': ['extraction_sha256', 'src_record_key'],
  'quarantine.matter_fee_letter_reference': ['extraction_sha256', 'src_record_key'],
  'quarantine.attendee_span': ['fragment_id'],
  'quarantine.finding': ['id'],
};
const quote = (name: string) => '"' + name + '"';
const byId = (rows: readonly Row[]) => [...rows].sort((a, b) => Number(a.id) - Number(b.id));

export function assertTask69EntryBound(
  entry: Task69Entry,
  operation: Task69PreparedOperation,
): void {
  const allowed = operation.allowlist.find(
    (e) => e.issue_id === entry.issueId && e.unit_kind === 'issue',
  );
  assert.ok(allowed, 'Unapproved issue');
  const sealed = JSON.parse(allowed.entry_text);
  assert.equal(
    task69Digest({
      source: entry.originalIssue.original,
      sourceObjectSha256: entry.originalJsonSha256,
      sourceRecordKey: entry.sourceRecordKey,
      extractionSha256: entry.extractionSha256,
      authority: entry.authority,
      guards: entry.expectedStateGuards as unknown as Json,
      dependencies: entry.dependencies,
      disposition: entry.disposition,
      approvedOutcome: entry.approvedOutcome,
    }),
    task69Digest(
      Object.fromEntries(
        [
          'source',
          'sourceObjectSha256',
          'sourceRecordKey',
          'extractionSha256',
          'authority',
          'guards',
          'dependencies',
          'disposition',
          'approvedOutcome',
        ].map((k) => [k, sealed[k]]),
      ),
    ),
    'Source, authority, payload or complete guard closure changed',
  );
}

export async function assertTask69Source(db: ClientBase, entry: Task69Entry): Promise<void> {
  const original = entry.originalIssue.original;
  let rows: { value: Row }[];
  if (entry.store === 'deferred.D54') {
    rows = (
      await db.query(
        "SELECT jsonb_build_object('raw_value',legacy_contact_lawyer_raw,'client_id',id,'legacy_client_id',legacy_id) value FROM public.clients WHERE id=$1 FOR SHARE",
        [original.client_id],
      )
    ).rows;
  } else {
    const table = entry.store === 'deferred.hearing-parent' ? 'quarantine.finding' : entry.store;
    const keys = sourceIdentities[table];
    assert.ok(keys, 'Unreviewed source namespace');
    const predicate = keys
      .map((key, i) => {
        assert.notEqual(original[key], undefined, 'Missing exact source identity');
        return `${quote(key)} IS NOT DISTINCT FROM $${i + 1}`;
      })
      .join(' AND ');
    rows = (
      await db.query(
        `SELECT to_jsonb(r) value FROM ${table.split('.').map(quote).join('.')} r WHERE ${predicate} FOR SHARE`,
        keys.map((k) => original[k]),
      )
    ).rows;
  }
  assert.equal(rows.length, 1, `${entry.issueId}: source cardinality changed`);
  assert.equal(
    task69Digest(rows[0]!.value),
    entry.originalJsonSha256,
    `${entry.issueId}: original source changed`,
  );
}

/** Receipt validity proves exact immutable audit/delta correspondence. Guards
 * then follow the complete same-operation chain; a later unrelated edit never
 * becomes an allowed baseline merely because the row still exists. */
export async function readTask69Transitions(
  db: ClientBase,
  operationId: string,
): Promise<Task69RowTransition[]> {
  const rows = (
    await db.query(
      "WITH receipts AS MATERIALIZED (SELECT r.*,_migration.task69_receipt_valid(r.receipt_id) valid FROM _migration.task69_receipt r WHERE r.operation_id=$1) SELECT r.operation_id,r.issue_id,r.receipt_id,d.entity_schema||'.'||d.entity_table table_name,(d.entity_key->>'id')::int id,d.before_values,d.after_values,r.valid FROM receipts r JOIN _migration.task69_delta d USING(receipt_id) ORDER BY r.created_at,r.receipt_id,d.ordinal",
      [operationId],
    )
  ).rows;
  return rows.map((r) => {
    assert.equal(r.valid, true, 'Incomplete dependency receipt');
    return {
      operationId: r.operation_id,
      issueId: r.issue_id,
      receiptId: r.receipt_id,
      table: r.table_name,
      id: r.id,
      before: r.before_values,
      after: r.after_values,
    };
  });
}

export async function assertTask69Lookups(
  db: ClientBase,
  entry: Task69Entry,
  operation: Task69PreparedOperation,
): Promise<void> {
  for (const guard of entry.expectedStateGuards.targetGuards) {
    if (!guard.table.startsWith('public.lookup_')) continue;
    for (const [column, originalLabel] of Object.entries(guard.exactLabels)) {
      assert.ok(['label_ar', 'label_ar_m', 'label_ar_f'].includes(column));
      const rows = (
        await db.query(
          `SELECT id FROM ${task69ReferenceSql(guard.table)} WHERE ${quote(column)} IS NOT DISTINCT FROM $1 ORDER BY id FOR SHARE`,
          [originalLabel],
        )
      ).rows;
      let expected = guard.exactLabelCardinality[column];
      if (guard.table === 'public.lookup_matter_destination' && guard.id === 26) {
        const normalization = (
          await db.query(
            "SELECT receipt_id FROM _migration.task69_receipt WHERE operation_id=$1 AND issue_id='DEST-INVESTMENT-26-32' AND phase='apply'",
            [operation.operationId],
          )
        ).rows;
        if (normalization.length) expected = 0;
      }
      assert.equal(
        rows.length,
        expected,
        `${guard.table}.${column}: exact label cardinality changed`,
      );
    }
  }
  for (const lookup of entry.expectedStateGuards.lookupPreconditions) {
    assert.ok(
      [
        'public.lookup_party_role',
        'public.lookup_court',
        'public.lookup_matter_destination',
      ].includes(lookup.table),
    );
    const predicate =
      lookup.table === 'public.lookup_party_role'
        ? '(label_ar_m=$1 OR label_ar_f=$1)'
        : 'label_ar=$1';
    const rows = (
      await db.query(
        `SELECT id FROM ${task69ReferenceSql(lookup.table)} WHERE ${predicate} ORDER BY id FOR SHARE`,
        [lookup.exactLabel],
      )
    ).rows;
    let ids = lookup.expectedIds;
    if (lookup.expectedCardinality === 0) {
      const key =
        lookup.table === 'public.lookup_matter_destination' &&
        lookup.exactLabel === 'الهيئة العامة للاستثمار والمناطق الحرة'
          ? 'DEST-INVESTMENT-26-32'
          : 'LOOKUP/' + task69Digest({ namespace: lookup.table, label: lookup.exactLabel });
      const receipt = (
        await db.query(
          "SELECT returned_ids,_migration.task69_receipt_valid(receipt_id) valid FROM _migration.task69_receipt WHERE operation_id=$1 AND issue_id=$2 AND phase='apply'",
          [operation.operationId, key],
        )
      ).rows;
      if (receipt.length) {
        assert.equal(receipt.length, 1);
        assert.equal(receipt[0].valid, true);
        assert.equal(typeof receipt[0].returned_ids.id, 'number');
        ids = [receipt[0].returned_ids.id];
        const deltas = (
          await db.query(
            "SELECT d.after_values FROM _migration.task69_delta d JOIN _migration.task69_receipt r USING(receipt_id) WHERE r.operation_id=$1 AND r.issue_id=$2 AND r.phase='apply' AND d.entity_table=$3 AND d.entity_key=jsonb_build_object('id',$4::int)",
            [operation.operationId, key, lookup.table.split('.')[1], ids[0]],
          )
        ).rows;
        assert.equal(deltas.length, 1, 'Lookup receipt lacks exact postimage');
        const current = (
          await db.query(
            `SELECT to_jsonb(r) value FROM ${task69ReferenceSql(lookup.table)} r WHERE id=$1 FOR SHARE`,
            ids,
          )
        ).rows;
        assert.deepEqual(
          current.map((r) => r.value),
          deltas.map((r) => r.after_values),
          'Lookup changed after dependency receipt',
        );
      }
    }
    assert.equal(
      ids.length,
      lookup.expectedCardinality === 0 ? ids.length : lookup.expectedCardinality,
    );
    assert.deepEqual(
      rows.map((r) => r.id),
      [...ids].sort((a, b) => a - b),
      'Lookup namespace, label, IDs or cardinality changed',
    );
  }
}

export async function assertTask69Memberships(
  db: ClientBase,
  entry: Task69Entry,
  transitions: readonly Task69RowTransition[],
): Promise<void> {
  const p = entry.approvedOutcome;
  for (const [table, expectedValue] of Object.entries(
    entry.expectedStateGuards.membershipPreconditions,
  )) {
    if (table === 'public.documents.scalarRelationships') {
      const rows = (
        await db.query(
          "SELECT jsonb_build_object('matter_id',matter_id,'responsible_person_id',responsible_person_id) value FROM public.documents WHERE id=$1 FOR SHARE",
          [p.documentId],
        )
      ).rows;
      assert.equal(rows.length, 1);
      const projection = (r: Row) => ({
        matter_id: r.matter_id,
        responsible_person_id: r.responsible_person_id,
      });
      let expected = expectedValue;
      for (const t of transitions.filter(
        (t) => t.table === 'public.documents' && t.id === p.documentId,
      )) {
        assert.ok(t.before, 'An existing document must retain its identity');
        assert.deepEqual(
          projection(t.before),
          expected,
          'Document transition must start at reviewed scalar relationships',
        );
        expected = projection(t.after) as Row;
      }
      assert.deepEqual(rows[0].value, expected, 'Document scalar relationships changed');
      // Structural migration starts each exact reviewed aggregate without a
      // business write. Follow only complete receipts in this operation from
      // that immutable boundary, including retained and retired link objects.
      const boundary = (
        await db.query(
          'SELECT version,matters,people FROM _migration.task69_document_relationship_boundary WHERE document_id=$1',
          [p.documentId],
        )
      ).rows;
      assert.equal(boundary.length, 1, 'Reviewed document boundary required');
      const guard = entry.expectedStateGuards.targetGuards.find(
        (g) => g.table === 'public.documents' && g.id === p.documentId,
      );
      assert.ok(guard, 'Complete original document guard required');
      for (const [namespace, kind] of [
        ['public.document_matters', 'matters'],
        ['public.document_responsible_people', 'people'],
      ] as const) {
        const members = new Map((boundary[0][kind] as Row[]).map((r) => [r.id, r]));
        for (const t of transitions.filter(
          (t) => t.table === namespace && t.after.document_id === p.documentId,
        )) {
          if (t.before === null) assert.ok(!members.has(t.id), 'Repeated document member insert');
          else
            assert.deepEqual(
              members.get(t.id),
              t.before,
              'Membership transition must start at structural boundary',
            );
          members.set(t.id, t.after);
        }
        const current = (
          await db.query(
            `SELECT to_jsonb(r) value FROM ${task69ReferenceSql(namespace)} r WHERE document_id=$1 ORDER BY id FOR SHARE`,
            [p.documentId],
          )
        ).rows.map((r) => r.value);
        assert.deepEqual(
          current,
          byId([...members.values()]),
          'Complete canonical document membership changed',
        );
      }
      continue;
    }
    assert.ok(Array.isArray(expectedValue), 'Invalid membership baseline');
    let sql: string;
    let id: Json | undefined;
    if (table === 'public.matter_parties' || table === 'public.matter_lawyers') {
      id = p.matterId ?? (p.matterIds as Json[])[0];
      sql = `SELECT to_jsonb(r) value FROM ${task69ReferenceSql(table)} r WHERE matter_id=$1 ORDER BY id FOR SHARE`;
    } else if (table === 'public.matter_party_roles') {
      id = (p.matterIds as Json[])[0];
      sql =
        'SELECT to_jsonb(r) value FROM public.matter_party_roles r JOIN public.matter_parties p ON p.id=r.party_id WHERE p.matter_id=$1 ORDER BY r.id FOR SHARE OF r,p';
    } else if (table === 'public.power_of_attorney_lawyers') {
      id = p.poaId;
      sql =
        'SELECT to_jsonb(r) value FROM public.power_of_attorney_lawyers r WHERE power_of_attorney_id=$1 ORDER BY id FOR SHARE';
    } else if (table === 'public.fee_letter_matters') {
      id = p.feeId ?? (p.mapping as Row).fee_letter_id;
      sql =
        'SELECT to_jsonb(r) value FROM public.fee_letter_matters r WHERE fee_letter_id=$1 ORDER BY id FOR SHARE';
    } else if (table === 'public.matter_fee_letter_references') {
      id = (p.mapping as Row).matter_id;
      sql =
        'SELECT to_jsonb(r) value FROM public.matter_fee_letter_references r WHERE matter_id=$1 ORDER BY id FOR SHARE';
    } else throw new Error('Unreviewed membership namespace');
    assert.equal(typeof id, 'number', 'Exact parent identity required');
    const rows: Row[] = (await db.query(sql, [id])).rows.map((r) => r.value);
    const expected = new Map(
      (expectedValue as Row[]).map((r) => [r.id, task69ExpandedBaseline(table, r)]),
    );
    const inScope = (row: Row) =>
      table === 'public.matter_party_roles'
        ? rows.some((r) => r.party_id === row.party_id) ||
          (expectedValue as Row[]).some((r) => r.party_id === row.party_id)
        : row[
            table === 'public.power_of_attorney_lawyers'
              ? 'power_of_attorney_id'
              : table === 'public.fee_letter_matters'
                ? 'fee_letter_id'
                : 'matter_id'
          ] === id;
    for (const t of transitions.filter((t) => t.table === table && inScope(t.after))) {
      if (t.before === null)
        assert.ok(!expected.has(t.id), 'Repeated effective relationship insert');
      else
        assert.deepEqual(
          expected.get(t.id),
          t.before,
          'Relationship transition does not start at reviewed membership',
        );
      expected.set(t.id, t.after);
    }
    assert.deepEqual(
      byId(rows),
      byId([...expected.values()]),
      `${entry.issueId}: complete membership changed`,
    );
  }
}

export async function assertTask69Preflight(
  db: ClientBase,
  entry: Task69Entry,
  operation: Task69PreparedOperation,
): Promise<void> {
  assertTask69EntryBound(entry, operation);
  assert.equal(
    (await db.query("SELECT current_setting('transaction_isolation') isolation")).rows[0].isolation,
    'serializable',
  );
  // Shared locks prevent additions/removals from escaping an exact membership or
  // label-cardinality test between the final check and this transaction's writes.
  await db.query(
    'LOCK TABLE ' + TASK69_REFERENCE_TABLES.map(task69ReferenceSql).join(',') + ' IN SHARE MODE',
  );
  await assertTask69Source(db, entry);
  const transitions = await readTask69Transitions(db, operation.operationId);
  await assertTask69References(db, [entry], operation.operationId, transitions);
  await assertTask69Lookups(db, entry, operation);
  await assertTask69Memberships(db, entry, transitions);
}
