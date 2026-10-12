import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import {
  assertTask69Guard,
  task69Digest,
  task69OriginalShape,
  type Task69Contract,
  type Row,
  type Json,
} from './task69-contract';

const sourceKeys: Record<string, string[]> = {
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
const quote = (n: string) => {
  assert(n.length > 0 && !n.includes('\0'));
  return '"' + n.replaceAll('"', '""') + '"';
};
const tableSql = (n: string) => n.split('.').map(quote).join('.');
const byId = (rows: Row[]) => [...rows].sort((a, b) => Number(a.id) - Number(b.id));

/** SELECT-only state witness. The caller must already be in a READ ONLY
 * snapshot; sequences include is_called. No actor setup, registration or IDs. */
export async function task69ReadOnlyState(
  db: ClientBase,
  mode: 'read-only' | 'locked-execution' = 'read-only',
) {
  assert.equal(
    (await db.query("SELECT current_setting('transaction_read_only') value")).rows[0].value,
    mode === 'read-only' ? 'on' : 'off',
  );
  if (mode === 'locked-execution')
    assert.equal(
      (await db.query("SELECT current_setting('transaction_isolation') value")).rows[0].value,
      'serializable',
    );
  const catalog = (
    await db.query(
      "SELECT n.nspname schema,c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','staging','quarantine','_migration') AND c.relkind IN('r','p') ORDER BY 1,2",
    )
  ).rows as { schema: string; name: string }[];
  const digests: Record<string, Json> = {};
  for (const t of catalog)
    digests[t.schema + '.' + t.name] = (
      await db.query(
        `SELECT count(*)::int count,md5(coalesce(string_agg(h,'' ORDER BY h),'')) md5 FROM (SELECT md5(to_jsonb(r)::text) h FROM ${tableSql(t.schema + '.' + t.name)} r) s`,
      )
    ).rows[0];
  const sequences: Row[] = [];
  for (const s of (
    await db.query(
      "SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname IN('public','quarantine','_migration') ORDER BY 1,2",
    )
  ).rows)
    sequences.push({
      ...s,
      ...(
        await db.query(
          `SELECT last_value::text,is_called FROM ${quote(s.schemaname)}.${quote(s.sequencename)}`,
        )
      ).rows[0],
    });
  const migrations = (
    await db.query(
      'SELECT migration_name,checksum,finished_at IS NOT NULL finished,rolled_back_at IS NOT NULL rolled_back FROM public._prisma_migrations ORDER BY migration_name,id',
    )
  ).rows as Row[];
  const schema = (
    await db.query(
      "SELECT n.nspname schema,c.relname name,c.relkind kind,(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','staging','quarantine','_migration') AND c.relkind IN('r','p') ORDER BY 1,2",
    )
  ).rows as Row[];
  const functions = (
    await db.query(
      "SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,md5(pg_get_functiondef(p.oid)) definition_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','quarantine','_migration') AND p.prokind='f' ORDER BY 1,2,3",
    )
  ).rows as Row[];
  const grants = (
    await db.query(
      "SELECT grantee,table_schema,table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema IN('public','quarantine','_migration') ORDER BY 1,2,3,4",
    )
  ).rows as Row[];
  const triggers = (
    await db.query(
      "SELECT n.nspname schema,c.relname table_name,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','quarantine','_migration') AND NOT t.tgisinternal ORDER BY 1,2,3",
    )
  ).rows as Row[];
  const value = { digests, sequences, migrations, schema, functions, grants, triggers };
  return { ...value, stateSha256: task69Digest(value) };
}

/** Must be the first database work after BEGIN SERIALIZABLE. SET LOCAL and
 * LOCK do not establish the data snapshot before writers are excluded. The
 * table list comes from the sealed fresh preflight; the complete catalog/state
 * is compared after locking, so missing/renamed/new catalog entries refuse.
 * No target/actor/catalog SELECT may precede this call in the transaction. */
export async function lockTask69PreflightTables(
  db: ClientBase,
  state: { schema: Row[] },
): Promise<void> {
  assert(state.schema.length > 0, 'A complete preflight table list is required');
  const names = state.schema.map((table) => {
    assert(typeof table.schema === 'string' && typeof table.name === 'string');
    assert(['public', 'staging', 'quarantine', '_migration'].includes(table.schema));
    return quote(table.schema) + '.' + quote(table.name);
  });
  assert.equal(new Set(names).size, names.length, 'Duplicate preflight tables');
  await db.query("SET LOCAL TIME ZONE 'UTC'");
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query('LOCK TABLE ' + names.join(',') + ' IN SHARE ROW EXCLUSIVE MODE');
}

/** A sealed proposal cannot silently absorb unrelated rows, account/audit or
 * sequence changes between its snapshot, baseline and first apply. */
export function assertTask69SealedPreflightState(
  sealed: { status: string; state: { stateSha256: string } },
  current: { stateSha256: string },
): void {
  assert.equal(sealed.status, 'PASS');
  assert.equal(
    current.stateSha256,
    sealed.state.stateSha256,
    'Complete state differs from sealed preflight; preserve changes and prepare a new operation before first apply',
  );
}

/** Pre-operation only: complete original guards, source identities, label
 * cardinalities and memberships are checked on migration78 or pristine94.
 * A later phase uses receipt-aware executor guards, never rebases these guards.
 * On an in-use owner this proves one snapshot, not a continuous write freeze. */
export async function task69OwnerReadOnlyPreflight(db: ClientBase, contract: Task69Contract) {
  const identity = (
    await db.query(
      "SELECT current_database() database,(pg_control_system()).system_identifier::text cluster,inet_server_addr()::text server_address,inet_server_port() server_port,current_setting('transaction_read_only') read_only,current_setting('transaction_isolation') isolation,txid_current_snapshot()::text snapshot,clock_timestamp()::text captured_at",
    )
  ).rows[0] as Row;
  assert.equal(identity.read_only, 'on');
  assert(['repeatable read', 'serializable'].includes(String(identity.isolation)));
  const state = await task69ReadOnlyState(db),
    completed = state.migrations.filter((r) => r.finished && !r.rolled_back).length;
  assert([78, 94].includes(completed), 'Only accepted78 or pristine reviewed94 supported');
  if (completed === 94)
    assert.equal(
      (await db.query('SELECT count(*)::int n FROM _migration.task69_operation')).rows[0].n,
      0,
      'Initial preflight refuses an already registered operation; use exact receipt recovery',
    );
  const tables = new Set<string>([
    ...contract.entries.flatMap((e) => [
      ...e.expectedStateGuards.targetGuards.map((g) => g.table),
      ...e.expectedStateGuards.lookupPreconditions.map((l) => l.table),
      ...Object.keys(e.expectedStateGuards.membershipPreconditions).filter(
        (n) => !n.endsWith('.scalarRelationships'),
      ),
    ]),
    ...Object.keys(sourceKeys),
    'public.clients',
    'public.hearings',
    'public.documents',
    'public.matter_parties',
    'public.admin_tasks',
    'public.matters',
    'public.lookup_matter_destination',
  ]);
  const rows = new Map<string, Row[]>();
  for (const table of tables)
    rows.set(
      table,
      (await db.query(`SELECT to_jsonb(r) value FROM ${tableSql(table)} r`)).rows.map(
        (r) => r.value as Row,
      ),
    );
  const conflicts: { issueId: string; check: string; message: string }[] = [];
  const check = (issueId: string, name: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      conflicts.push({ issueId, check: name, message: e instanceof Error ? e.message : String(e) });
    }
  };
  let referenceChecks = 0,
    sourceChecks = 0,
    membershipChecks = 0,
    lookupChecks = 0;
  const witnesses: Record<string, string> = {};
  for (const e of contract.entries) {
    check(e.issueId, 'source', () => {
      const original = e.originalIssue.original;
      const actual =
        e.store === 'deferred.D54'
          ? rows
              .get('public.clients')!
              .filter((r) => r.id === original.client_id)
              .map(
                (r) =>
                  ({
                    raw_value: r.legacy_contact_lawyer_raw,
                    client_id: r.id,
                    legacy_client_id: r.legacy_id,
                  }) as Row,
              )
          : rows
              .get(e.store === 'deferred.hearing-parent' ? 'quarantine.finding' : e.store)!
              .filter((r) =>
                sourceKeys[
                  e.store === 'deferred.hearing-parent' ? 'quarantine.finding' : e.store
                ]!.every((k) => r[k] === original[k]),
              );
      assert.equal(actual.length, 1, 'Source cardinality changed');
      assert.equal(task69Digest(actual[0]!), e.originalJsonSha256, 'Immutable source differs');
      sourceChecks++;
    });
    for (const g of e.expectedStateGuards.targetGuards)
      check(e.issueId, 'reference ' + g.table + '/' + g.id, () => {
        const actual = rows.get(g.table)!.filter((r) => r.id === g.id);
        assert.equal(actual.length, 1);
        assertTask69Guard(g, actual[0]!, 'pre-operation');
        referenceChecks++;
        witnesses[g.table + '/' + g.id] = task69Digest(task69OriginalShape(g.table, actual[0]!));
        for (const [column, label] of Object.entries(g.exactLabels))
          assert.equal(
            rows.get(g.table)!.filter((r) => r[column] === label).length,
            g.exactLabelCardinality[column],
            'Exact label cardinality changed',
          );
      });
    for (const l of e.expectedStateGuards.lookupPreconditions)
      check(e.issueId, 'lookup ' + l.table, () => {
        const ids = rows
          .get(l.table)!
          .filter((r) =>
            l.table === 'public.lookup_party_role'
              ? r.label_ar_m === l.exactLabel || r.label_ar_f === l.exactLabel
              : r.label_ar === l.exactLabel,
          )
          .map((r) => Number(r.id))
          .sort((a, b) => a - b);
        assert.equal(ids.length, l.expectedCardinality);
        assert.deepEqual(
          ids,
          [...l.expectedIds].sort((a, b) => a - b),
        );
        lookupChecks++;
      });
    const p = e.approvedOutcome;
    for (const [table, expected] of Object.entries(e.expectedStateGuards.membershipPreconditions))
      check(e.issueId, 'membership ' + table, () => {
        if (table === 'public.documents.scalarRelationships') {
          const actual = rows.get('public.documents')!.filter((r) => r.id === p.documentId);
          assert.equal(actual.length, 1);
          assert.deepEqual(
            {
              matter_id: actual[0]!.matter_id,
              responsible_person_id: actual[0]!.responsible_person_id,
            },
            expected,
          );
        } else {
          let actual: Row[];
          if (table === 'public.matter_parties' || table === 'public.matter_lawyers')
            actual = rows
              .get(table)!
              .filter((r) => r.matter_id === (p.matterId ?? (p.matterIds as Json[])[0]));
          else if (table === 'public.matter_party_roles') {
            const partyIds = new Set(
              rows
                .get('public.matter_parties')!
                .filter((r) => r.matter_id === (p.matterIds as Json[])[0])
                .map((r) => r.id),
            );
            actual = rows.get(table)!.filter((r) => partyIds.has(r.party_id));
          } else if (table === 'public.power_of_attorney_lawyers')
            actual = rows.get(table)!.filter((r) => r.power_of_attorney_id === p.poaId);
          else if (table === 'public.fee_letter_matters')
            actual = rows
              .get(table)!
              .filter((r) => r.fee_letter_id === (p.feeId ?? (p.mapping as Row).fee_letter_id));
          else if (table === 'public.matter_fee_letter_references')
            actual = rows.get(table)!.filter((r) => r.matter_id === (p.mapping as Row).matter_id);
          else throw new Error('Unreviewed membership namespace');
          assert.deepEqual(
            byId(actual.map((r) => task69OriginalShape(table, r))),
            byId(expected as Row[]),
            'Complete membership differs',
          );
        }
        membershipChecks++;
      });
  }
  const dependency = (contract.dependencies as { dependencies: Row[] }).dependencies[0]!;
  const inbound = (
    await db.query(
      "SELECT n.nspname schema,c.relname table,a.attname column FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.conkey[1] WHERE k.contype='f' AND k.confrelid='public.lookup_matter_destination'::regclass ORDER BY 1,2,3",
    )
  ).rows as Row[];
  check('DEST-INVESTMENT-26-32', 'complete inbound inventory', () => {
    assert.deepEqual(inbound, [
      { schema: 'public', table: 'admin_tasks', column: 'destination_id' },
      { schema: 'public', table: 'hearings', column: 'destination_id' },
      { schema: 'public', table: 'matters', column: 'destination_id' },
    ]);
    const expected = dependency.existingReferenceEffects as Row[];
    const actual = ['public.admin_tasks', 'public.hearings', 'public.matters'].flatMap((table) =>
      rows
        .get(table)!
        .filter((r) => [26, 32].includes(Number(r.destination_id)))
        .map((r) => ({ table, id: r.id, value: r })),
    );
    assert.deepEqual(
      actual.map((r) => r.table + '/' + r.id).sort(),
      expected.map((r) => r.table + '/' + r.id).sort(),
    );
    for (const effect of [...expected, ...(dependency.lookupDeltas as Row[])]) {
      const value = rows.get(String(effect.table))!.filter((r) => r.id === effect.id);
      assert.equal(value.length, 1);
      assert.equal(task69Digest(value[0]!), effect.beforeSha256);
    }
  });
  const end = (
    await db.query(
      "SELECT current_setting('transaction_read_only') read_only,txid_current_snapshot()::text snapshot,clock_timestamp()::text captured_at",
    )
  ).rows[0] as Row;
  assert.equal(end.read_only, 'on');
  assert.equal(end.snapshot, identity.snapshot);
  return {
    schema: 'task69-owner-readonly-preflight-v1',
    status: conflicts.length ? 'CONFLICT' : 'PASS',
    identity,
    end,
    migrations: completed,
    sourceChecks,
    referenceChecks,
    membershipChecks,
    lookupChecks,
    referenceWitnesses: witnesses,
    inboundNormalization: inbound,
    conflicts,
    state,
    approvedInputs: contract.inputs,
    decisions: 3465,
    dependencies: 120,
    originals: 3960,
    ownerWrites: 'NOT_APPLIED',
    limitation:
      'Snapshot only; future execution requires fresh preflight/recovery and executor checks under locks.',
  };
}
