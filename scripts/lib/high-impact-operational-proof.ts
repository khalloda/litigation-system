import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import { hasPermission } from '../../src/lib/auth/permissions';
import { auditEventStructureFailures } from './audit-event-structure';
import { applicationDigest, type Fields } from './high-impact-application-plan';
import { D39_BRANCHES, assertD41Destinations, D41_NOTE } from './high-impact-application-contract';
import {
  CREATED_TABLES,
  databaseJsonDigest,
  readInitialRow,
  tableName,
  identifier,
  type ApplicationState,
  type SourceEvidence,
} from './high-impact-application-state';

// These are review-result columns, not original evidence. Later approved work
// may fill them; it must not rewrite the original finding/source columns.
const REVIEW_RESULTS: Record<string, readonly string[]> = {
  'quarantine.finding': ['firm_answer', 'firm_note', 'answered_at', 'answered_by'],
  'quarantine.review_value': [
    'firm_answer',
    'firm_person',
    'firm_note',
    'answered_at',
    'answered_by',
  ],
  'quarantine.matter_transform': ['resolved_at', 'resolved_by', 'resolution_note'],
  'quarantine.matter_relationship_transform': ['resolved_at', 'resolution_note'],
};

async function sourceRows(
  db: ClientBase,
  entry: Omit<SourceEvidence, 'rows'>,
): Promise<SourceEvidence['rows']> {
  const object = (columns: string[]) =>
    `jsonb_build_object(${columns.map((c) => `'${c.replaceAll("'", "''")}',t.${identifier(c)}`).join(',')})`;
  return (
    await db.query<{ key: Fields; sha256: string }>(
      `SELECT ${object(entry.keys)} key,encode(sha256(convert_to(${object(entry.columns)}::text,'UTF8')),'hex') sha256 FROM ${tableName(entry.table)} t`,
    )
  ).rows;
}

export async function captureSourceEvidence(db: ClientBase): Promise<SourceEvidence[]> {
  const tables = (
    await db.query<{ table: string; keys: string[]; columns: string[] }>(`
    SELECT n.nspname||'.'||c.relname "table",
      ARRAY(SELECT a.attname::text FROM pg_constraint p,unnest(p.conkey) WITH ORDINALITY k(num,pos)
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num
        WHERE p.conrelid=c.oid AND p.contype='p' ORDER BY k.pos) keys,
      ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('staging','quarantine') AND c.relkind='r' ORDER BY n.nspname,c.relname`)
  ).rows;
  const result: SourceEvidence[] = [];
  for (const table of tables) {
    assert.ok(table.keys.length, 'source evidence lacks a durable key');
    const entry = {
      ...table,
      columns: table.columns.filter((c) => !REVIEW_RESULTS[table.table]?.includes(c)),
    };
    result.push({ ...entry, rows: await sourceRows(db, entry) });
  }
  return result;
}

export async function verifySourceEvidence(
  db: ClientBase,
  evidence: SourceEvidence[],
): Promise<void> {
  for (const table of evidence) {
    const current = await sourceRows(db, table);
    const keyed = new Map(current.map((row) => [applicationDigest(row.key), row.sha256]));
    assert.equal(keyed.size, current.length, 'duplicate historical source key');
    for (const original of table.rows)
      assert.equal(
        keyed.get(applicationDigest(original.key)),
        original.sha256,
        'altered or missing immutable staging/quarantine evidence',
      );
    // Deliberately no whole-table cardinality equality: new evidence may append.
  }
}

export async function captureHistoricalIds(db: ClientBase): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  for (const table of CREATED_TABLES)
    result[table] = (
      await db.query<{ id: number }>(`SELECT id FROM ${tableName(table)} ORDER BY id`)
    ).rows.map((r) => r.id);
  return result;
}

export async function eventFingerprints(
  db: ClientBase,
  ids: string[],
): Promise<{ id: string; sha256: string }[]> {
  return (
    await db.query<{ id: string; sha256: string }>(
      `SELECT id::text,encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') sha256 FROM audit_events e WHERE id=ANY($1::bigint[]) ORDER BY e.id`,
      [ids],
    )
  ).rows;
}

/** Exact D19 evidence, even before a batch exists; D39 is checked separately. */
export async function verifyCompatibility(
  db: ClientBase,
  state: ApplicationState | null,
): Promise<void> {
  const expected = (
    await db.query<{ client_id: number; branch_id: number }>(`
    SELECT DISTINCT c.id client_id,b.id branch_id
    FROM matters m JOIN staging."الدعاوى" s ON s.src_record_key=m.legacy_source_record_key
    JOIN clients c ON c.legacy_id=CASE WHEN s."clientID" ~ '^[0-9]+$' THEN s."clientID"::integer END
    JOIN lookup_client_branch b ON _migration.reviewed_text_key(b.label_ar)=_migration.reviewed_text_key(s."clientBranch")
    WHERE NOT EXISTS(SELECT 1 FROM quarantine.matter_transform q WHERE q.src_record_key=s.src_record_key)
    ORDER BY client_id,branch_id`)
  ).rows;
  const imported = (
    await db.query<{ n: number }>(
      'SELECT count(*)::integer n FROM matters WHERE legacy_source_record_key IS NOT NULL',
    )
  ).rows[0]!.n;
  assert.equal(expected.length, imported ? 15 : 0, 'D19 historical evidence inventory changed');
  const actual = (
    await db.query<{
      client_id: number;
      branch_id: number;
      authority: string;
      registered_by: number;
      registration_event_id: string;
      registration_event_sha256: string;
    }>('SELECT * FROM _migration.client_branch_compatibility ORDER BY client_id,branch_id')
  ).rows;
  assert.deepEqual(
    actual
      .filter((r) => r.authority === 'D19-existing-association')
      .map(({ client_id, branch_id }) => ({ client_id, branch_id })),
    expected,
    'D19 exact relationship inventory mismatch',
  );
  const d39 = actual.filter((r) => r.authority === 'D39');
  assert.equal(d39.length, state ? 3 : 0, 'missing or extra D39 pair');
  if (state)
    for (const branch of D39_BRANCHES) {
      const target: import('./high-impact-application-state').CreatedRow | undefined =
        state.created_rows.find(
          (r) => r.table === 'lookup_client_branch' && r.key === branch.label,
        );
      assert.ok(target, 'missing D39 branch identity');
      assert.equal(
        d39.filter((r) => r.client_id === branch.clientId && r.branch_id === target.id).length,
        1,
        'wrong D39 parent',
      );
    }
  for (const row of actual) {
    assert.equal(row.registered_by, 1, 'incorrect compatibility attribution');
    const events = (
      await db.query<{ value: Fields }>(
        'SELECT to_jsonb(e) value FROM audit_events e WHERE id=$1',
        [row.registration_event_id],
      )
    ).rows;
    assert.equal(events.length, 1, 'missing compatibility event');
    const e = events[0]!.value;
    assert.equal(
      await databaseJsonDigest(db, e),
      row.registration_event_sha256,
      'altered compatibility event',
    );
    assert.equal(e.actor_id, 1, 'incorrect compatibility event actor');
    assert.equal(e.actor_key_snapshot, 'system_migration');
    assert.equal(e.action, 'relationship_added');
    assert.equal(e.outcome, 'succeeded');
    assert.equal(e.resource_identifier, 'task-3-5b:client-branch-compatibility');
    assert.deepEqual(e.after_values, { client_id: row.client_id, branch_id: row.branch_id });
    assert.deepEqual(e.event_metadata, { authority: row.authority });
    assert.ok(
      e.request_id && e.correlation_id && e.audit_session_id,
      'missing compatibility context',
    );
  }
}

/** Initial snapshots remain immutable evidence, not a ban on later updates. */
export async function verifyRowContinuity(db: ClientBase, state: ApplicationState): Promise<void> {
  assert.deepEqual(await auditEventStructureFailures(db), [], 'audit enforcement changed');
  const proofs = (
    await db.query<{
      event_id: string;
      entity_table: string;
      entity_id: number;
      before_sha256: string;
      after_sha256: string;
      event_sha256: string;
    }>('SELECT * FROM _migration.high_impact_row_proof ORDER BY event_id')
  ).rows;
  for (const p of proofs)
    assert.ok(
      state.created_rows.some((r) => r.table === p.entity_table && r.id === p.entity_id),
      'proof outside approved release',
    );
  for (const row of state.created_rows) {
    assert.equal(
      await databaseJsonDigest(db, row.initial),
      row.sha256,
      'initial row digest changed',
    );
    const current = await readInitialRow(db, row.table, row.id);
    const projected = Object.fromEntries(Object.keys(row.initial).map((k) => [k, current[k]]));
    const history = proofs.filter((p) => p.entity_table === row.table && p.entity_id === row.id);
    let digest = row.sha256;
    for (const proof of history) {
      assert.ok(
        BigInt(proof.event_id) > BigInt(state.audit_event_ids.at(-1)!),
        'post-application event sequence changed',
      );
      assert.equal(proof.before_sha256, digest, 'unaudited released-row mutation');
      const events = (
        await db.query<{ value: Fields }>(
          'SELECT to_jsonb(e) value FROM audit_events e WHERE id=$1',
          [proof.event_id],
        )
      ).rows;
      assert.equal(events.length, 1, 'missing operational audit event');
      const event = events[0]!.value;
      assert.equal(
        await databaseJsonDigest(db, event),
        proof.event_sha256,
        'altered operational audit event',
      );
      const area = row.table.startsWith('lookup_')
        ? 'dropdownLists'
        : ['hearings', 'hearing_attendees'].includes(row.table)
          ? 'hearings'
          : 'matters';
      assert.ok(
        Number(event.actor_id) > 2 &&
          hasPermission(
            event.actor_role_snapshot,
            area,
            area === 'dropdownLists' ? 'manage' : 'update',
          ),
        'unauthorized released-row mutation',
      );
      assert.equal(event.entity_schema, 'public');
      assert.equal(event.entity_table, row.table);
      assert.deepEqual(event.entity_key, { id: row.id });
      assert.ok(['record_updated', 'relationship_updated'].includes(String(event.action)));
      assert.equal(event.outcome, 'succeeded');
      assert.ok(
        event.request_id && event.correlation_id && event.audit_session_id,
        'missing operational attribution/context',
      );
      digest = proof.after_sha256;
    }
    if (row.table.startsWith('quarantine.')) {
      const excluded = REVIEW_RESULTS[row.table] ?? [];
      assert.deepEqual(
        Object.fromEntries(Object.entries(projected).filter(([k]) => !excluded.includes(k))),
        Object.fromEntries(Object.entries(row.initial).filter(([k]) => !excluded.includes(k))),
        'altered released quarantine provenance',
      );
    } else {
      assert.equal(
        await databaseJsonDigest(db, projected),
        digest,
        'unaudited released-row mutation or missing proof',
      );
      const immutable = (
        await db.query<{ field_name: string }>(
          `SELECT field_name FROM audit_event_fields WHERE entity_schema='public' AND entity_table=$1 AND (classification_reason='immutable_legacy_source_evidence' OR field_name IN ('id','created_at','created_by'))`,
          [row.table],
        )
      ).rows;
      for (const { field_name } of immutable)
        assert.deepEqual(
          current[field_name],
          row.initial[field_name],
          'altered released historical provenance',
        );
      if (history.length) {
        const actor = (
          await db.query<{ actor_id: number }>('SELECT actor_id FROM audit_events WHERE id=$1', [
            history.at(-1)!.event_id,
          ])
        ).rows[0]!.actor_id;
        if ('updated_by' in current)
          assert.equal(current.updated_by, actor, 'missing update attribution');
      }
    }
  }
  const hearings = (
    await db.query<{
      legacyId: number;
      legacyMatterId: number;
      note: string | null;
      court: string | null;
    }>(
      `
    SELECT h.legacy_id "legacyId",m.legacy_id "legacyMatterId",h.notes note,c.label_ar court
    FROM hearings h JOIN matters m ON m.id=h.matter_id LEFT JOIN lookup_court c ON c.id=h.court_id
    WHERE h.id IN(SELECT hearing_id FROM _migration.high_impact_resolution) OR h.notes=$1`,
      [D41_NOTE],
    )
  ).rows;
  assertD41Destinations(hearings);
  const badCourt = (
    await db.query<{ n: number }>(`
    SELECT count(*)::integer n FROM matters m LEFT JOIN lookup_court c ON c.id=m.court_id
    WHERE m.legacy_id IN(467,468,515) AND c.label_ar IS DISTINCT FROM 'نيابة الشئون المالية والتجارية'`)
  ).rows[0]!.n;
  assert.equal(badCourt, 0, 'D41 matter court changed');
}
