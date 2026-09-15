import { adminLifecycleApplied, currentAdminEditSql } from './admin-lifecycle-checkpoint';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';

export const ADMIN_EDIT_MIGRATION = '20260914160000_admin_work_editing_boundary';
export const ADMIN_EDIT_TABLES = ['admin_tasks', 'task_actions'] as const;
export const ADMIN_EDIT_GATEWAYS = [
  'public.admin_edit_state(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_task integer, p_step integer)',
  'public.admin_edit_save(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_request jsonb)',
];
export const ADMIN_EDIT_FIELDS = [
  ['admin_tasks', 'row_version', 64, 'admin_edit_aggregate_version'],
  ['task_actions', 'current_order', 64, 'admin_edit_current_order'],
] as const;
export const adminEditSql = () =>
  readFileSync(`prisma/migrations/${ADMIN_EDIT_MIGRATION}/migration.sql`, 'utf8');
export async function adminEditApplied(db: ClientBase) {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM _prisma_migrations WHERE migration_name=$1',
      [ADMIN_EDIT_MIGRATION],
    )
  ).rows;
  const found = (
    await db.query("SELECT to_regclass('_migration.admin_edit_boundary') IS NOT NULL present")
  ).rows[0].present;
  const surfaces = (
    await db.query(`SELECT
    ARRAY(SELECT tablename::text FROM pg_tables WHERE schemaname='_migration' AND tablename LIKE 'admin_edit_%' ORDER BY tablename) tables,
    ARRAY(SELECT viewname::text FROM pg_views WHERE schemaname='_migration' AND viewname LIKE 'admin_edit_%' ORDER BY viewname) views,
    ARRAY(SELECT table_name||'.'||column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='admin_tasks' AND column_name='row_version') OR (table_name='task_actions' AND column_name IN('current_order'))) ORDER BY 1) columns,
    ARRAY(SELECT n.nspname||'.'||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','_migration') AND p.proname LIKE 'admin_edit_%' ORDER BY 1) functions`)
  ).rows[0];
  if (!ledger.length) {
    assert.equal(found, false, 'Partial administrative boundary without ledger');
    assert.deepEqual(
      surfaces,
      { tables: [], views: [], columns: [], functions: [] },
      'Partial administrative surface without ledger',
    );
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  assert.equal(ledger[0].checksum, createHash('sha256').update(adminEditSql()).digest('hex'));
  assert.equal(found, true);
  assert.deepEqual(
    surfaces,
    {
      tables: [
        'admin_edit_boundary',
        'admin_edit_change',
        'admin_edit_import',
        'admin_edit_submission',
      ],
      views: ADMIN_EDIT_TABLES.map((t) => 'admin_edit_initial_' + t).sort(),
      columns: ['admin_tasks.row_version', 'task_actions.current_order'].sort(),
      functions: [
        ...adminEditSql().matchAll(/CREATE FUNCTION ((?:public|_migration)\.admin_edit_\w+)/gu),
      ]
        .map((m) => m[1])
        .sort(),
    },
    'Exact complete administrative boundary surface inventory',
  );
  return true;
}
/** Immutable source projection for historical readers only. */
export function historicalAdminSql(sql: string, applied: boolean) {
  if (!applied) return sql;
  assert.match(
    sql.trimStart().replace(/^(?:\s+|--[^\n]*\n|\/\*[\s\S]*?\*\/)*/u, ''),
    /^(SELECT|WITH)\b/iu,
  );
  return sql.replace(
    /\b(FROM|JOIN)\s+(?:(?:public|"public")\.)?"?(admin_tasks|task_actions)"?(?=[\s),;]|$)/giu,
    (_, verb: string, table: string) => `${verb} _migration.admin_edit_initial_${table}`,
  );
}
export function historicalAdminClient(db: ClientBase, applied: boolean): ClientBase {
  return applied
    ? ({
        query: (sql: string, values?: unknown[]) => db.query(historicalAdminSql(sql, true), values),
      } as ClientBase)
    : db;
}
export async function assertAdminEditBoundary(db: ClientBase, profile: string) {
  assert.equal(await adminEditApplied(db), true);
  await db.query("SET TIME ZONE 'UTC'");
  const boundary = (await db.query('SELECT * FROM _migration.admin_edit_boundary')).rows;
  assert.equal(boundary.length, 1);
  assert.equal(boundary[0].profile, profile);
  assert.equal(
    (
      await db.query(
        "SELECT pg_get_indexdef('public.task_actions_current_order_idx'::regclass) definition",
      )
    ).rows[0].definition,
    'CREATE UNIQUE INDEX task_actions_current_order_idx ON public.task_actions USING btree (task_id, current_order)',
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname IN('admin_tasks_row_version_check','task_actions_current_order_check') ORDER BY conname",
      )
    ).rows,
    [
      { conname: 'admin_tasks_row_version_check', definition: 'CHECK ((row_version > 0))' },
      { conname: 'task_actions_current_order_check', definition: 'CHECK ((current_order > 0))' },
    ],
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT table_name,column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND ((table_name='admin_tasks' AND column_name='row_version') OR (table_name='task_actions' AND column_name='current_order')) ORDER BY table_name",
      )
    ).rows,
    [
      {
        table_name: 'admin_tasks',
        column_name: 'row_version',
        is_nullable: 'NO',
        column_default: '1',
      },
      {
        table_name: 'task_actions',
        column_name: 'current_order',
        is_nullable: 'YES',
        column_default: null,
      },
    ],
  );
  const historical = profile === 'historical-full-state-upgrade';
  assert.ok(historical || profile === 'canonical-clean-replay');
  const counts = historical
    ? { admin_tasks: 3694, task_actions: 3483 }
    : { admin_tasks: 0, task_actions: 0 };
  for (const table of ADMIN_EDIT_TABLES) {
    assert.deepEqual(
      (
        await db.query(
          `SELECT i.id FROM _migration.admin_edit_import i LEFT JOIN public.${table} a ON a.id=i.id WHERE i.entity_table=$1 AND a.id IS NULL`,
          [table],
        )
      ).rows,
      [],
      table + ' every original identity remains present',
    );
    const actual = (
      await db.query(
        "SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(initial_values::text,chr(10) ORDER BY initial_values::text COLLATE \"C\"),''),'UTF8')),'hex') digest FROM _migration.admin_edit_import WHERE entity_table=$1",
        [table],
      )
    ).rows[0];
    assert.equal(actual.count, counts[table]);
    if (historical) {
      assert.deepEqual(
        boundary[0].inventory.find((v: { table: string }) => v.table === table),
        { table, ...actual },
      );
      const original = (
        await db.query(
          `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(i.initial_values::text,chr(10) ORDER BY i.initial_values::text COLLATE "C"),''),'UTF8')),'hex') digest FROM _migration.admin_edit_import i WHERE entity_table=$1 AND NOT EXISTS(SELECT 1 FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.created_rows) r WHERE r->>'table'=$1 AND (r->>'id')::integer=i.id)`,
          [table],
        )
      ).rows[0];
      const frozen = (
        await db.query(
          "SELECT i-'schema'-'table' expected FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.before_inventory) i WHERE i->>'schema'='public' AND i->>'table'=$1",
          [table],
        )
      ).rows;
      assert.deepEqual(
        frozen,
        [{ expected: original }],
        table + ' frozen pre-release identity/content',
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT r->>'id' id FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.created_rows) r LEFT JOIN _migration.admin_edit_import i ON i.entity_table=r->>'table' AND i.id=(r->>'id')::integer WHERE r->>'table'=$1 AND i.initial_values IS DISTINCT FROM r->'initial'",
            [table],
          )
        ).rows,
        [],
        table + ' original released values',
      );
    }
  }
  assert.deepEqual(
    (
      await db.query(
        `SELECT m.id FROM admin_tasks m WHERE NOT _migration.admin_edit_current_valid(m.id)`,
      )
    ).rows,
    [],
    'Every current aggregate matches original evidence or its continuous retained change chain',
  );
  assert.deepEqual(
    (
      await db.query(
        `SELECT s.submission_id FROM _migration.admin_edit_submission s LEFT JOIN _migration.admin_edit_change c ON c.task_id=s.task_id AND c.version=s.result_version WHERE c.task_id IS NULL OR c.actor_id<>s.actor_id OR NOT s.changed`,
      )
    ).rows,
    [],
    'Submission result ownership',
  );
  const functions = (
    await db.query(
      "SELECT n.nspname schema,p.proname name,p.prosrc body,p.prosecdef,p.proconfig,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime, EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','_migration') AND p.proname LIKE 'admin_edit_%'",
    )
  ).rows;
  const source = currentAdminEditSql(adminEditSql(), await adminLifecycleApplied(db));
  assert.equal(functions.length, [...source.matchAll(/CREATE FUNCTION /gu)].length);
  for (const fn of functions) {
    const match = source.match(
      new RegExp(
        'CREATE FUNCTION ' +
          fn.schema +
          '\\.' +
          fn.name +
          '\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;',
      ),
    );
    assert.ok(match);
    assert.equal(
      fn.body.trim().replaceAll('\r\n', '\n'),
      match[1]!.trim().replaceAll('\r\n', '\n'),
      fn.name,
    );
    assert.equal(fn.prosecdef, true);
    assert.equal(fn.runtime, fn.schema === 'public');
    assert.equal(fn.public, false);
    assert.equal(fn.proconfig[0], 'search_path=pg_catalog, public');
  }
  for (const table of ADMIN_EDIT_TABLES) {
    assert.deepEqual(
      (
        await db.query(
          `SELECT tgname,tgenabled,tgdeferrable,tginitdeferred,tgtype::integer type,tgfoid::regprocedure::text function FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname IN ('zz_admin_edit_guard','admin_edit_no_truncate','admin_edit_complete') ORDER BY tgname`,
          ['public.' + table],
        )
      ).rows,
      [
        {
          tgname: 'admin_edit_complete',
          tgenabled: 'O',
          tgdeferrable: true,
          tginitdeferred: true,
          type: 21,
          function: '_migration.admin_edit_complete()',
        },
        {
          tgname: 'admin_edit_no_truncate',
          type: 34,
          function: '_migration.admin_edit_guard()',
          tgenabled: 'O',
          tgdeferrable: false,
          tginitdeferred: false,
        },
        {
          tgname: 'zz_admin_edit_guard',
          type: 31,
          function: '_migration.admin_edit_guard()',
          tgenabled: 'O',
          tgdeferrable: false,
          tginitdeferred: false,
        },
      ],
    );
  }
  return [
    'Original imported identity/content and released proof',
    'Current aggregate history and provenance',
    'Atomic version and submission ownership',
    'Exact narrow administrative gateway definitions',
  ].map((description, index) => ({
    id: `Task 4.4 administrative boundary ${index + 1}`,
    description,
  }));
}
