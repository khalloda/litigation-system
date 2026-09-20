import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
export const AUDIT_HISTORY_MIGRATION = '20260920140000_audit_history_capability';
export const AUDIT_HISTORY_GATEWAYS = [
  'public.audit_history_authority(p_account integer, p_person integer, p_version integer, p_expires timestamp with time zone, p_export boolean)',
  'public.audit_history_read(p_account integer, p_person integer, p_version integer, p_expires timestamp with time zone, p_request jsonb)',
  'public.audit_history_export_complete(p_account integer, p_person integer, p_version integer, p_expires timestamp with time zone, p_operation uuid, p_request_digest text, p_artifact_digest text, p_format text, p_scope text, p_watermark text, p_groups integer, p_events integer)',
] as const;
export const AUDIT_HISTORY_PRIVATE_TABLES = {
  audit_export_capability: ['account_id:integer', 'enabled:boolean', 'event_id:bigint'],
  audit_export_capability_change: [
    'event_id:bigint',
    'account_id:integer',
    'previous_enabled:boolean',
    'enabled:boolean',
    'reason:text',
  ],
  audit_export_receipt: [
    'account_id:integer',
    'operation_id:uuid',
    'request_digest:text',
    'artifact_digest:text',
    'event_id:bigint',
  ],
} as const;
const source = () =>
  readFileSync(`prisma/migrations/${AUDIT_HISTORY_MIGRATION}/migration.sql`, 'utf8');
export async function auditHistoryApplied(db: ClientBase) {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL',
      [AUDIT_HISTORY_MIGRATION],
    )
  ).rows;
  const surface = (
    await db.query(
      "SELECT n.nspname||'.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','_migration') AND c.relkind IN('r','v','m') AND (c.relname LIKE 'audit_export_%' OR c.relname LIKE 'audit_history_%') ORDER BY 1",
    )
  ).rows.map((r) => r.name);
  const funcs = (
    await db.query(
      "SELECT n.nspname||'.'||p.proname name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND (p.proname LIKE 'audit_export_%' OR p.proname LIKE 'audit_history_%') ORDER BY 1",
    )
  ).rows.map((r) => r.name);
  if (!ledger.length) {
    assert.deepEqual(surface, [], 'Partial audit-history tables without completed migration');
    assert.deepEqual(funcs, [], 'Partial audit-history functions without completed migration');
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && ledger[0].applied_steps_count === 1,
    'Audit-history migration incomplete',
  );
  assert.equal(
    ledger[0].checksum,
    createHash('sha256').update(source()).digest('hex'),
    'Audit-history migration checksum differs',
  );
  assert.deepEqual(
    surface,
    Object.keys(AUDIT_HISTORY_PRIVATE_TABLES)
      .map((x) => '_migration.' + x)
      .sort(),
    'Exact purpose-specific non-business table classification',
  );
  const expected = [
    ...source().matchAll(
      /CREATE FUNCTION ((?:public|_migration)\.audit_(?:export|history)_\w+)\(/gu,
    ),
  ]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(funcs, expected, 'Exact audit-history function classification');
  return true;
}
export async function auditHistoryFailures(db: ClientBase) {
  const failures: string[] = [];
  try {
    if (!(await auditHistoryApplied(db))) return failures;
    const normalize = (s: string) => s.replaceAll('\r\n', '\n').trim();
    for (const match of source().matchAll(
      /CREATE FUNCTION ((?:public|_migration)\.audit_(?:export|history)_\w+)\(([\s\S]*?)\)\s*RETURNS([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/gu,
    )) {
      const [schema, name] = match[1]!.split('.');
      const rows = (
        await db.query(
          'SELECT p.prosrc,p.prosecdef,p.proconfig,p.provolatile,p.prokind,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2',
          [schema, name],
        )
      ).rows;
      assert.equal(rows.length, 1);
      const r = rows[0];
      assert.equal(normalize(r.prosrc), normalize(match[4]!), 'Exact function body ' + name);
      assert.equal(r.prosecdef, true);
      assert.equal(r.prokind, 'f');
      assert.deepEqual(r.proconfig, ['search_path=pg_catalog, public']);
      assert.equal(
        r.provolatile,
        /IMMUTABLE/u.test(match[3]!) ? 'i' : /STABLE/u.test(match[3]!) ? 's' : 'v',
      );
      const owner = (await db.query('SELECT rolsuper FROM pg_roles WHERE rolname=$1', [r.owner]))
        .rows[0];
      assert.equal(owner.rolsuper, true);
    }
    for (const [table, columns] of Object.entries(AUDIT_HISTORY_PRIVATE_TABLES)) {
      const rows = (
        await db.query(
          "SELECT attname||':'||format_type(atttypid,atttypmod) value,attnotnull FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",
          ['_migration.' + table],
        )
      ).rows;
      assert.deepEqual(
        rows.map((r) => r.value),
        columns,
        'Exact classified columns ' + table,
      );
      assert.ok(rows.every((r) => r.attnotnull));
      const base = [
        'FOREIGN KEY (account_id) REFERENCES user_accounts(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
        'FOREIGN KEY (event_id) REFERENCES audit_events(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
        'TRIGGER DEFERRABLE INITIALLY DEFERRED',
      ];
      const expectedConstraints =
        table === 'audit_export_capability'
          ? [...base, 'PRIMARY KEY (account_id)', 'UNIQUE (event_id)']
          : table === 'audit_export_capability_change'
            ? [
                ...base,
                'PRIMARY KEY (event_id)',
                'CHECK (previous_enabled <> enabled)',
                'CHECK (char_length(reason) >= 1 AND char_length(reason) <= 256 AND NOT audit_contains_secret_pattern(reason))',
              ]
            : [
                ...base,
                'PRIMARY KEY (account_id, operation_id)',
                'UNIQUE (event_id)',
                "CHECK (request_digest ~ '^[a-f0-9]{64}$'::text)",
                "CHECK (artifact_digest ~ '^[a-f0-9]{64}$'::text)",
              ];
      const constraints = (
        await db.query(
          'SELECT pg_get_constraintdef(oid,true) definition,convalidated FROM pg_constraint WHERE conrelid=$1::regclass',
          ['_migration.' + table],
        )
      ).rows;
      assert.deepEqual(
        constraints.map((r) => r.definition).sort(),
        expectedConstraints.sort(),
        'Exact capability constraints ' + table,
      );
      assert.ok(constraints.every((r) => r.convalidated));
      const indexes = (
        await db.query(
          'SELECT pg_get_indexdef(indexrelid) definition,indisvalid,indisready,indislive FROM pg_index WHERE indrelid=$1::regclass',
          ['_migration.' + table],
        )
      ).rows;
      const expectedIndexes = expectedConstraints
        .filter((x) => x.startsWith('PRIMARY KEY') || x.startsWith('UNIQUE'))
        .map(
          (x) =>
            `CREATE UNIQUE INDEX ${table}_${x.startsWith('PRIMARY') ? 'pkey' : 'event_id_key'} ON _migration.${table} USING btree ${x.slice(x.indexOf('('))}`,
        );
      assert.deepEqual(indexes.map((r) => r.definition).sort(), expectedIndexes.sort());
      assert.ok(indexes.every((r) => r.indisvalid && r.indisready && r.indislive));
      const guards = (
        await db.query(
          'SELECT tgname,tgenabled,tgdeferrable,tginitdeferred,tgtype,tgfoid::regprocedure::text function,tgqual IS NULL unqualified,tgnargs FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname',
          ['_migration.' + table],
        )
      ).rows;
      const expected =
        table === 'audit_export_capability'
          ? [
              'audit_export_capability_no_delete',
              'audit_export_capability_no_truncate',
              'audit_export_current_consistency',
            ]
          : table === 'audit_export_capability_change'
            ? [
                'audit_export_capability_change_immutable',
                'audit_export_capability_change_no_truncate',
                'audit_export_change_consistency',
              ]
            : [
                'audit_export_receipt_consistency',
                'audit_export_receipt_immutable',
                'audit_export_receipt_no_truncate',
              ];
      assert.deepEqual(
        guards.map((r) => r.tgname),
        expected.sort(),
      );
      assert.ok(
        guards.every(
          (r) =>
            r.tgenabled === 'O' &&
            r.tgdeferrable === r.tgname.endsWith('_consistency') &&
            r.tginitdeferred === r.tgname.endsWith('_consistency'),
        ),
      );
      for (const guard of guards) {
        const consistency = guard.tgname.endsWith('_consistency');
        assert.equal(
          guard.function,
          consistency ? '_migration.audit_export_assert_state()' : 'refuse_audit_event_change()',
        );
        assert.equal(
          guard.tgtype,
          consistency
            ? table === 'audit_export_capability'
              ? 21
              : 5
            : guard.tgname.endsWith('_no_truncate')
              ? 34
              : guard.tgname.endsWith('_no_delete')
                ? 11
                : 27,
        );
        assert.equal(guard.unqualified, true);
        assert.equal(guard.tgnargs, 0);
      }
      const privileges = (
        await db.query(
          "SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema='_migration' AND table_name=$1 AND grantee IN('PUBLIC','litigation_runtime')",
          [table],
        )
      ).rows;
      assert.deepEqual(privileges, []);
    }
    const eventGuard = (
      await db.query(
        "SELECT tgname,tgenabled,tgdeferrable,tginitdeferred,tgtype,tgfoid::regprocedure::text function,tgqual IS NULL unqualified,tgnargs FROM pg_trigger WHERE tgrelid='public.audit_events'::regclass AND tgname='audit_export_event_consistency' AND NOT tgisinternal",
      )
    ).rows;
    assert.deepEqual(
      eventGuard,
      [
        {
          tgname: 'audit_export_event_consistency',
          tgenabled: 'O',
          tgdeferrable: true,
          tginitdeferred: true,
          tgtype: 5,
          function: '_migration.audit_export_assert_event()',
          unqualified: true,
          tgnargs: 0,
        },
      ],
      'Event-side completion/capability correspondence is deferred and unavoidable',
    );
    assert.equal(
      (await db.query('SELECT _migration.audit_export_state_valid() valid')).rows[0].valid,
      true,
      'Capability/receipt events, chains and current state correspond in both directions',
    );
  } catch (error) {
    failures.push(error instanceof Error ? error.message : 'Audit-history integrity failed');
  }
  return failures;
}
