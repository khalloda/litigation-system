import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';

export const POA_EDIT_MIGRATION = '20260915180000_poa_editing_lifecycle_boundary';
export const POA_EDIT_TABLES = ['powers_of_attorney', 'power_of_attorney_lawyers'] as const;
export const POA_EDIT_GATEWAYS = [
  'public.poa_edit_state(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_id integer)',
  'public.poa_edit_save(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_request jsonb)',
];
export const POA_EDIT_FIELDS = [
  ['powers_of_attorney', 'row_version', 64, 'poa_aggregate_version'],
  ['powers_of_attorney', 'is_archived', 64, 'poa_archive_state'],
  ['power_of_attorney_lawyers', 'is_retired', 64, 'poa_current_membership_retirement'],
  ['power_of_attorney_lawyers', 'current_order', 64, 'poa_current_membership_order'],
] as const;
export const poaEditSql = () =>
  readFileSync(`prisma/migrations/${POA_EDIT_MIGRATION}/migration.sql`, 'utf8');
export async function poaEditApplied(db: ClientBase) {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM _prisma_migrations WHERE migration_name=$1',
      [POA_EDIT_MIGRATION],
    )
  ).rows;
  const surface = (
    await db.query(`SELECT
    ARRAY(SELECT tablename::text FROM pg_tables WHERE schemaname='_migration' AND tablename LIKE 'poa_edit_%' ORDER BY 1) tables,
    ARRAY(SELECT viewname::text FROM pg_views WHERE schemaname='_migration' AND viewname LIKE 'poa_edit_%' ORDER BY 1) views,
    ARRAY(SELECT table_name||'.'||column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='powers_of_attorney' AND column_name IN('row_version','is_archived')) OR (table_name='power_of_attorney_lawyers' AND column_name IN('is_retired','current_order'))) ORDER BY 1) columns,
    ARRAY(SELECT n.nspname||'.'||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND p.proname LIKE 'poa_edit_%' ORDER BY 1) functions`)
  ).rows[0];
  if (!ledger.length) {
    assert.deepEqual(
      surface,
      { tables: [], views: [], columns: [], functions: [] },
      'Partial POA boundary without ledger',
    );
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  assert.equal(ledger[0].checksum, createHash('sha256').update(poaEditSql()).digest('hex'));
  assert.deepEqual(
    surface,
    {
      tables: ['poa_edit_boundary', 'poa_edit_change', 'poa_edit_import', 'poa_edit_submission'],
      views: POA_EDIT_TABLES.map((t) => 'poa_edit_initial_' + t).sort(),
      columns: POA_EDIT_FIELDS.map(([t, c]) => t + '.' + c).sort(),
      functions: [
        ...poaEditSql().matchAll(/CREATE FUNCTION ((?:public|_migration)\.poa_edit_\w+)/gu),
      ]
        .map((m) => m[1])
        .sort(),
    },
    'Exact POA boundary surface',
  );
  return true;
}
/** Only historical verification reads use this frozen old-column projection. */
export function historicalPoaSql(sql: string, applied: boolean) {
  if (!applied) return sql;
  assert.match(
    sql.trimStart().replace(/^(?:\s+|--[^\n]*\n|\/\*[\s\S]*?\*\/)*/u, ''),
    /^(SELECT|WITH)\b/iu,
  );
  return sql.replace(
    /\b(FROM|JOIN)\s+(?:(?:public|"public")\.)?"?(powers_of_attorney|power_of_attorney_lawyers)"?(?=[\s),;]|$)/giu,
    (_, verb: string, table: string) => `${verb} _migration.poa_edit_initial_${table}`,
  );
}
export function historicalPoaClient(db: ClientBase, applied: boolean): ClientBase {
  return applied
    ? ({
        query: (sql: string, values?: unknown[]) => db.query(historicalPoaSql(sql, true), values),
      } as ClientBase)
    : db;
}
export async function assertPoaEditBoundary(db: ClientBase, profile: string) {
  assert.equal(await poaEditApplied(db), true);
  const boundary = (await db.query('SELECT * FROM _migration.poa_edit_boundary')).rows;
  assert.equal(boundary.length, 1);
  assert.equal(boundary[0].profile, profile);
  assert.ok(['historical-full-state-upgrade', 'canonical-clean-replay'].includes(profile));
  for (const table of POA_EDIT_TABLES) {
    const inventory = (
      await db.query(
        `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(initial_values::text,chr(10) ORDER BY initial_values::text COLLATE "C"),''),'UTF8')),'hex') digest FROM _migration.poa_edit_import WHERE entity_table=$1`,
        [table],
      )
    ).rows[0];
    assert.equal(
      inventory.count,
      profile === 'canonical-clean-replay' ? 0 : table === 'powers_of_attorney' ? 752 : 87,
    );
    if (inventory.count) {
      assert.deepEqual(
        boundary[0].inventory.find((x: { table: string }) => x.table === table),
        { table, ...inventory },
      );
      assert.deepEqual(
        (
          await db.query(
            `SELECT i-ARRAY['schema','table'] expected FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.before_inventory) i WHERE i->>'schema'='public' AND i->>'table'=$1`,
            [table],
          )
        ).rows,
        [{ expected: inventory }],
        'POA immutable boundary anchored to accepted historical inventory',
      );
    }
    assert.deepEqual(
      (
        await db.query(
          `SELECT i.id FROM _migration.poa_edit_import i LEFT JOIN public.${table} p ON p.id=i.id WHERE i.entity_table=$1 AND p.id IS NULL`,
          [table],
        )
      ).rows,
      [],
      'Every original POA identity remains',
    );
  }
  assert.deepEqual(
    (
      await db.query(
        'SELECT id FROM powers_of_attorney WHERE _migration.poa_edit_current_valid(id) IS DISTINCT FROM true',
      )
    ).rows,
    [],
    'Complete POA history/current state replay',
  );
  assert.deepEqual(
    (
      await db.query(
        'SELECT s.submission_id FROM _migration.poa_edit_submission s LEFT JOIN _migration.poa_edit_change c ON c.poa_id=s.poa_id AND c.version=s.result_version WHERE c.poa_id IS NULL OR c.actor_id<>s.actor_id',
      )
    ).rows,
    [],
    'POA receipt ownership',
  );
  assert.deepEqual(
    (
      await db.query(
        `SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND indexname IN('poa_current_order_idx','poa_operational_list_idx') ORDER BY indexname`,
      )
    ).rows,
    [
      {
        indexname: 'poa_current_order_idx',
        indexdef:
          'CREATE UNIQUE INDEX poa_current_order_idx ON public.power_of_attorney_lawyers USING btree (power_of_attorney_id, current_order)',
      },
      {
        indexname: 'poa_operational_list_idx',
        indexdef:
          'CREATE INDEX poa_operational_list_idx ON public.powers_of_attorney USING btree (is_archived, id)',
      },
    ],
    'exact POA operational indexes',
  );
  assert.deepEqual(
    (
      await db.query(
        `SELECT conname,convalidated,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid IN('public.powers_of_attorney'::regclass,'public.power_of_attorney_lawyers'::regclass) AND conname IN('powers_of_attorney_row_version_check','power_of_attorney_lawyers_current_order_check') ORDER BY conname`,
      )
    ).rows,
    [
      {
        conname: 'power_of_attorney_lawyers_current_order_check',
        convalidated: true,
        definition: 'CHECK ((current_order > 0))',
      },
      {
        conname: 'powers_of_attorney_row_version_check',
        convalidated: true,
        definition: 'CHECK ((row_version > 0))',
      },
    ],
    'exact POA operational checks',
  );
  const columns = (
    await db.query(
      `SELECT c.relname AS "table",a.attname AS "column",format_type(a.atttypid,a.atttypmod) type,a.attnotnull required,pg_get_expr(d.adbin,d.adrelid) AS "default" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND ((c.relname='powers_of_attorney' AND a.attname IN('row_version','is_archived')) OR (c.relname='power_of_attorney_lawyers' AND a.attname IN('current_order','is_retired'))) ORDER BY 1,2`,
    )
  ).rows;
  assert.deepEqual(
    columns,
    [
      {
        table: 'power_of_attorney_lawyers',
        column: 'current_order',
        type: 'integer',
        required: false,
        default: null,
      },
      {
        table: 'power_of_attorney_lawyers',
        column: 'is_retired',
        type: 'boolean',
        required: true,
        default: 'false',
      },
      {
        table: 'powers_of_attorney',
        column: 'is_archived',
        type: 'boolean',
        required: true,
        default: 'false',
      },
      {
        table: 'powers_of_attorney',
        column: 'row_version',
        type: 'bigint',
        required: true,
        default: '1',
      },
    ],
    'exact operational POA columns/defaults',
  );
  for (const table of [
    'poa_edit_import',
    'poa_edit_boundary',
    'poa_edit_change',
    'poa_edit_submission',
  ]) {
    const guards = (
      await db.query(
        `SELECT tgname,tgenabled,tgtype::integer type,tgfoid::regprocedure::text function FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname`,
        ['_migration.' + table],
      )
    ).rows;
    assert.deepEqual(
      guards,
      [
        ...(table === 'poa_edit_import' || table === 'poa_edit_boundary'
          ? [
              {
                tgname: 'immutable_insert',
                tgenabled: 'O',
                type: 6,
                function: '_migration.poa_edit_immutable()',
              },
            ]
          : []),
        {
          tgname: 'immutable_rows',
          tgenabled: 'O',
          type: 58,
          function: '_migration.poa_edit_immutable()',
        },
      ],
      'immutable evidence trigger ' + table,
    );
  }
  const functions = (
    await db.query(
      "SELECT n.nspname schema,p.proname name,p.prosrc body,p.prosecdef,p.proconfig,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND p.proname LIKE 'poa_edit_%'",
    )
  ).rows;
  for (const f of functions) {
    const m = poaEditSql().match(
      new RegExp(
        'CREATE FUNCTION ' +
          f.schema +
          '\\.' +
          f.name +
          '\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;',
      ),
    );
    assert.ok(m);
    assert.equal(
      f.body.trim().replaceAll('\r\n', '\n'),
      m[1]!.trim().replaceAll('\r\n', '\n'),
      f.name,
    );
    assert.equal(f.prosecdef, true);
    assert.equal(f.runtime, f.schema === 'public');
    assert.equal(f.public, false);
    assert.equal(f.proconfig[0], 'search_path=pg_catalog, public');
  }
  for (const table of POA_EDIT_TABLES) {
    assert.deepEqual(
      (
        await db.query(
          `SELECT tgname,tgenabled,tgdeferrable,tginitdeferred,tgtype::integer type,tgfoid::regprocedure::text function FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname IN('zz_poa_edit_guard','poa_edit_no_truncate','poa_edit_complete') ORDER BY tgname`,
          ['public.' + table],
        )
      ).rows,
      [
        {
          tgname: 'poa_edit_complete',
          tgenabled: 'O',
          tgdeferrable: true,
          tginitdeferred: true,
          type: 21,
          function: '_migration.poa_edit_complete()',
        },
        {
          tgname: 'poa_edit_no_truncate',
          tgenabled: 'O',
          tgdeferrable: false,
          tginitdeferred: false,
          type: 34,
          function: '_migration.poa_edit_guard()',
        },
        {
          tgname: 'zz_poa_edit_guard',
          tgenabled: 'O',
          tgdeferrable: false,
          tginitdeferred: false,
          type: 31,
          function: '_migration.poa_edit_guard()',
        },
      ],
    );
  }
  return [
    'Immutable POA source and original memberships',
    'Complete POA current state and history replay',
    'POA owned version receipts',
    'Exact POA gateway authorization and triggers',
  ].map((description, index) => ({ id: `Task 4.5 boundary ${index + 1}`, description }));
}
