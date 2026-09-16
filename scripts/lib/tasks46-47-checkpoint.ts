import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';

export const TASKS46_47_MIGRATION = '20260916180000_documents_fee_letters_boundary';
export const TASKS46_47_TABLES = [
  'documents',
  'fee_letters',
  'fee_letter_matters',
  'matter_fee_letter_references',
] as const;
export const TASKS46_47_GATEWAYS = [
  'public.document_edit_state(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_id integer)',
  'public.document_edit_save(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_request jsonb)',
  'public.document_edit_evidence_count(p_source_key text)',
  'public.fee_letter_edit_state(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_id integer)',
  'public.fee_letter_edit_save(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_request jsonb)',
  'public.fee_letter_edit_forward_quarantine_count(p_contract_id integer)',
  'public.fee_letter_edit_reverse_quarantine_count(p_source_key text)',
  'public.matter_fee_reference_edit_state(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_matter integer)',
  'public.matter_fee_reference_edit_save(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_request jsonb)',
] as const;
export const TASKS46_47_FIELDS = [
  ['documents', 'row_version', 64, 'document_aggregate_version'],
  ['documents', 'is_archived', 64, 'document_archive_state'],
  ['fee_letters', 'row_version', 64, 'fee_letter_aggregate_version'],
  ['fee_letters', 'is_archived', 64, 'fee_letter_archive_state'],
  ['fee_letter_matters', 'is_retired', 64, 'fee_letter_covered_matter_retirement'],
  ['fee_letter_matters', 'current_order', 64, 'fee_letter_covered_matter_order'],
  ['matter_fee_letter_references', 'is_retired', 64, 'matter_current_fee_letter_retirement'],
] as const;
export const tasks46_47Sql = () =>
  readFileSync(`prisma/migrations/${TASKS46_47_MIGRATION}/migration.sql`, 'utf8');
export async function tasks46_47Applied(db: ClientBase) {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM _prisma_migrations WHERE migration_name=$1',
      [TASKS46_47_MIGRATION],
    )
  ).rows;
  const surface = (
    await db.query(`SELECT
  ARRAY(SELECT tablename::text FROM pg_tables WHERE schemaname='_migration' AND
    (tablename LIKE 'tasks46_47_%' OR tablename LIKE 'document_edit_%' OR
      tablename LIKE 'fee_letter_edit_%' OR tablename LIKE 'matter_fee_reference_%') ORDER BY 1) tables,
  ARRAY(SELECT viewname::text FROM pg_views WHERE schemaname='_migration' AND viewname LIKE 'tasks46_47_%' ORDER BY 1) views,
  ARRAY(SELECT table_name||'.'||column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name IN('documents','fee_letters') AND column_name IN('row_version','is_archived')) OR (table_name='fee_letter_matters' AND column_name IN('is_retired','current_order')) OR (table_name='matter_fee_letter_references' AND column_name='is_retired')) ORDER BY 1) columns,
  ARRAY(SELECT n.nspname||'.'||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND (p.proname LIKE 'tasks46_47_%' OR p.proname LIKE 'document_edit_%' OR p.proname LIKE 'fee_letter_edit_%' OR p.proname LIKE 'matter_fee_reference_%') ORDER BY 1) functions`)
  ).rows[0];
  if (!ledger.length) {
    assert.deepEqual(
      surface,
      { tables: [], views: [], columns: [], functions: [] },
      'Partial Tasks 4.6/4.7 boundary without ledger',
    );
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  assert.equal(ledger[0].checksum, createHash('sha256').update(tasks46_47Sql()).digest('hex'));
  assert.deepEqual(
    surface,
    {
      tables: [
        'document_edit_change',
        'document_edit_submission',
        'fee_letter_edit_change',
        'fee_letter_edit_submission',
        'matter_fee_reference_change',
        'matter_fee_reference_state',
        'matter_fee_reference_submission',
        'tasks46_47_boundary',
        'tasks46_47_import',
        'tasks46_47_submission_owner',
      ],
      views: TASKS46_47_TABLES.map((table) => 'tasks46_47_initial_' + table).sort(),
      columns: TASKS46_47_FIELDS.map(([table, column]) => table + '.' + column).sort(),
      functions: [
        ...tasks46_47Sql().matchAll(
          /CREATE FUNCTION ((?:public|_migration)\.(?:tasks46_47|document_edit|fee_letter_edit|matter_fee_reference)_\w+)/gu,
        ),
      ]
        .map((match) => match[1])
        .sort(),
    },
    'Exact Tasks 4.6/4.7 boundary surface',
  );
  return true;
}
export function historicalTasks46_47Sql(sql: string, applied: boolean) {
  if (!applied) return sql;
  let leading = sql.trimStart();
  while (leading.startsWith('--') || leading.startsWith('/*')) {
    if (leading.startsWith('--')) {
      const end = leading.indexOf('\n');
      assert.ok(end >= 0);
      leading = leading.slice(end + 1).trimStart();
    } else {
      const end = leading.indexOf('*/');
      assert.ok(end >= 0);
      leading = leading.slice(end + 2).trimStart();
    }
  }
  assert.match(leading, /^(SELECT|WITH)\b/iu);
  return sql.replace(
    /\b(FROM|JOIN)\s+(?:(?:public|"public")\.)?"?(documents|fee_letters|fee_letter_matters|matter_fee_letter_references)"?(?=[\s),;]|$)/giu,
    (_, verb: string, table: string) => `${verb} _migration.tasks46_47_initial_${table}`,
  );
}
export function historicalTasks46_47Client(db: ClientBase, applied: boolean): ClientBase {
  return applied
    ? ({
        query: (sql: string, values?: unknown[]) =>
          db.query(historicalTasks46_47Sql(sql, true), values),
      } as ClientBase)
    : db;
}
export async function assertTasks46_47Boundary(db: ClientBase, profile: string) {
  assert.equal(await tasks46_47Applied(db), true);
  const boundary = (await db.query('SELECT * FROM _migration.tasks46_47_boundary')).rows;
  assert.equal(boundary.length, 1);
  assert.equal(boundary[0].profile, profile);
  for (const [table, count] of [
    ['documents', 407],
    ['fee_letters', 331],
    ['fee_letter_matters', 231],
    ['matter_fee_letter_references', 393],
  ] as const) {
    const inventory = (
      await db.query(
        `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(initial_values::text,chr(10) ORDER BY initial_values::text COLLATE "C"),''),'UTF8')),'hex') digest FROM _migration.tasks46_47_import WHERE entity_table=$1`,
        [table],
      )
    ).rows[0];
    assert.equal(inventory.count, profile === 'canonical-clean-replay' ? 0 : count);
    if (inventory.count)
      assert.deepEqual(
        boundary[0].inventory.find((x: { table: string }) => x.table === table),
        { table, ...inventory },
      );
  }
  assert.deepEqual(
    (
      await db.query(
        'SELECT id FROM documents WHERE _migration.document_edit_current_valid(id) IS DISTINCT FROM true',
      )
    ).rows,
    [],
  );
  assert.deepEqual(
    (
      await db.query(
        'SELECT id FROM fee_letters WHERE _migration.fee_letter_edit_current_valid(id) IS DISTINCT FROM true',
      )
    ).rows,
    [],
  );
  assert.deepEqual(
    (
      await db.query(
        'SELECT id FROM matters WHERE _migration.matter_fee_reference_current_valid(id) IS DISTINCT FROM true',
      )
    ).rows,
    [],
  );
  assert.deepEqual(
    (
      await db.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
        AND indexname IN('documents_operational_list_idx','fee_letters_operational_list_idx',
          'fee_letter_current_matter_pair_idx','fee_letter_current_order_idx',
          'matter_fee_reference_current_matter_idx','matter_fee_reference_matter_fee_idx')
        ORDER BY indexname`)
    ).rows,
    [
      [
        'documents_operational_list_idx',
        'CREATE INDEX documents_operational_list_idx ON public.documents USING btree (is_archived, id)',
      ],
      [
        'fee_letter_current_matter_pair_idx',
        'CREATE UNIQUE INDEX fee_letter_current_matter_pair_idx ON public.fee_letter_matters USING btree (fee_letter_id, matter_id) WHERE (NOT is_retired)',
      ],
      [
        'fee_letter_current_order_idx',
        'CREATE UNIQUE INDEX fee_letter_current_order_idx ON public.fee_letter_matters USING btree (fee_letter_id, COALESCE(current_order, (ordinal + 1))) WHERE (NOT is_retired)',
      ],
      [
        'fee_letters_operational_list_idx',
        'CREATE INDEX fee_letters_operational_list_idx ON public.fee_letters USING btree (is_archived, id)',
      ],
      [
        'matter_fee_reference_current_matter_idx',
        'CREATE UNIQUE INDEX matter_fee_reference_current_matter_idx ON public.matter_fee_letter_references USING btree (matter_id) WHERE (NOT is_retired)',
      ],
      [
        'matter_fee_reference_matter_fee_idx',
        'CREATE UNIQUE INDEX matter_fee_reference_matter_fee_idx ON public.matter_fee_letter_references USING btree (matter_id, fee_letter_id)',
      ],
    ].map(([indexname, indexdef]) => ({ indexname, indexdef })),
    'Exact operational indexes and partial current uniqueness',
  );
  assert.deepEqual(
    (
      await db.query(`SELECT c.relname "table",a.attname "column",format_type(a.atttypid,a.atttypmod) type,
        a.attnotnull required,pg_get_expr(d.adbin,d.adrelid) "default"
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE n.nspname='public' AND ((c.relname IN('documents','fee_letters')
          AND a.attname IN('row_version','is_archived')) OR
          (c.relname='fee_letter_matters' AND a.attname IN('is_retired','current_order')) OR
          (c.relname='matter_fee_letter_references' AND a.attname='is_retired')) ORDER BY 1,2`)
    ).rows,
    [
      ['documents', 'is_archived', 'boolean', true, 'false'],
      ['documents', 'row_version', 'bigint', true, '1'],
      ['fee_letter_matters', 'current_order', 'integer', false, null],
      ['fee_letter_matters', 'is_retired', 'boolean', true, 'false'],
      ['fee_letters', 'is_archived', 'boolean', true, 'false'],
      ['fee_letters', 'row_version', 'bigint', true, '1'],
      ['matter_fee_letter_references', 'is_retired', 'boolean', true, 'false'],
    ].map(([table, column, type, required, defaultValue]) => ({
      table,
      column,
      type,
      required,
      default: defaultValue,
    })),
    'Exact operational columns and defaults',
  );
  for (const table of [
    'tasks46_47_import',
    'tasks46_47_boundary',
    'document_edit_change',
    'document_edit_submission',
    'fee_letter_edit_change',
    'fee_letter_edit_submission',
    'matter_fee_reference_change',
    'matter_fee_reference_submission',
    'tasks46_47_submission_owner',
  ]) {
    const guards = (
      await db.query(
        `SELECT tgname,tgenabled,tgtype::integer type,tgfoid::regprocedure::text function
          FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname`,
        ['_migration.' + table],
      )
    ).rows;
    assert.deepEqual(
      guards,
      [
        ...(table === 'tasks46_47_import' || table === 'tasks46_47_boundary'
          ? [
              {
                tgname: 'immutable_insert',
                tgenabled: 'O',
                type: 6,
                function: '_migration.tasks46_47_immutable()',
              },
            ]
          : []),
        {
          tgname: 'immutable_rows',
          tgenabled: 'O',
          type: 58,
          function: '_migration.tasks46_47_immutable()',
        },
      ],
      'Immutable Tasks 4.6/4.7 evidence trigger ' + table,
    );
  }
  const functions = (
    await db.query(`SELECT n.nspname schema,p.proname name,p.prosrc body,p.prosecdef,p.proconfig,
      has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,
      EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN('public','_migration') AND
        (p.proname LIKE 'tasks46_47_%' OR p.proname LIKE 'document_edit_%'
          OR p.proname LIKE 'fee_letter_edit_%' OR p.proname LIKE 'matter_fee_reference_%')`)
  ).rows;
  for (const fn of functions) {
    const source = tasks46_47Sql().match(
      new RegExp(
        'CREATE FUNCTION ' +
          fn.schema +
          '\\.' +
          fn.name +
          '\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;',
      ),
    );
    assert.ok(source, 'Migration source for ' + fn.schema + '.' + fn.name);
    assert.equal(
      fn.body.trim().replaceAll('\r\n', '\n'),
      source[1]!.trim().replaceAll('\r\n', '\n'),
    );
    assert.equal(fn.prosecdef, true);
    assert.equal(fn.runtime, fn.schema === 'public');
    assert.equal(fn.public, false);
    assert.equal(fn.proconfig[0], 'search_path=pg_catalog, public');
  }
  for (const table of TASKS46_47_TABLES) {
    assert.deepEqual(
      (
        await db.query(
          `SELECT tgname,tgenabled,tgdeferrable,tginitdeferred,tgtype::integer type,
            tgfoid::regprocedure::text function FROM pg_trigger WHERE tgrelid=$1::regclass
            AND tgname IN('zz_tasks46_47_guard','tasks46_47_no_truncate','tasks46_47_complete') ORDER BY tgname`,
          ['public.' + table],
        )
      ).rows,
      [
        {
          tgname: 'tasks46_47_complete',
          tgenabled: 'O',
          tgdeferrable: true,
          tginitdeferred: true,
          type: 21,
          function: '_migration.tasks46_47_complete()',
        },
        {
          tgname: 'tasks46_47_no_truncate',
          tgenabled: 'O',
          tgdeferrable: false,
          tginitdeferred: false,
          type: 34,
          function: '_migration.tasks46_47_guard()',
        },
        {
          tgname: 'zz_tasks46_47_guard',
          tgenabled: 'O',
          tgdeferrable: false,
          tginitdeferred: false,
          type: 31,
          function: '_migration.tasks46_47_guard()',
        },
      ],
      'Exact guarded business trigger set for ' + table,
    );
    assert.equal(
      (
        await db.query(
          `SELECT has_table_privilege('litigation_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE') allowed`,
          ['public.' + table],
        )
      ).rows[0].allowed,
      false,
      'Runtime direct writes remain denied for ' + table,
    );
  }
  return [
    'Immutable document and fee-letter source evidence',
    'Complete document aggregate replay',
    'Complete fee-letter and covered-matter replay',
    'Independent current matter fee-letter replay',
    'Exact guarded runtime gateways',
  ].map((description, index) => ({ id: `Tasks 4.6/4.7 boundary ${index + 1}`, description }));
}
