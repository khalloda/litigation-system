import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
export const ADMIN_LIFECYCLE_MIGRATION = '20260915120000_admin_work_archive_restore';
export const ADMIN_LIFECYCLE_FIELDS = [
  ['admin_tasks', 'is_archived', 64, 'admin_archive_lifecycle'],
  ['task_actions', 'is_archived', 64, 'admin_step_archive_lifecycle'],
] as const;
export const ADMIN_LIFECYCLE_GATEWAYS = [
  'public.admin_lifecycle_state(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_task integer, p_step integer)',
  'public.admin_lifecycle_save(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_request jsonb)',
];
export const adminLifecycleSql = () =>
  readFileSync(`prisma/migrations/${ADMIN_LIFECYCLE_MIGRATION}/migration.sql`, 'utf8');
export function currentAdminEditSql(original: string, lifecycle: boolean) {
  if (!lifecycle) return original;
  let source = original;
  for (const m of adminLifecycleSql().matchAll(
    /CREATE OR REPLACE FUNCTION ((?:public|_migration)\.admin_edit_\w+)\([\s\S]*?\$\$;/gu,
  )) {
    const pattern = new RegExp(
      'CREATE FUNCTION ' + m[1]!.replaceAll('.', '\\.') + '\\([\\s\\S]*?\\$\\$;',
      'g',
    );
    assert.equal([...source.matchAll(pattern)].length, 1);
    source = source.replace(pattern, () =>
      m[0].replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION'),
    );
  }
  return source;
}
export async function adminLifecycleApplied(db: ClientBase) {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM _prisma_migrations WHERE migration_name=$1',
      [ADMIN_LIFECYCLE_MIGRATION],
    )
  ).rows;
  const columns = (
    await db.query(
      "SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN('admin_tasks','task_actions') AND column_name='is_archived' ORDER BY table_name",
    )
  ).rows;
  const tables = (
    await db.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='_migration' AND tablename LIKE 'admin_lifecycle_%' ORDER BY 1",
    )
  ).rows;
  const routines = (
    await db.query(
      "SELECT n.nspname schema,p.proname name,p.prosrc body,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND p.proname LIKE 'admin_lifecycle_%' ORDER BY 1,2",
    )
  ).rows;
  if (!ledger.length) {
    assert.deepEqual(columns, []);
    assert.deepEqual(tables, []);
    assert.deepEqual(routines, []);
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  const source = adminLifecycleSql();
  assert.equal(ledger[0].checksum, createHash('sha256').update(source).digest('hex'));
  assert.deepEqual(
    columns,
    ['admin_tasks', 'task_actions'].map((table_name) => ({
      table_name,
      column_name: 'is_archived',
      udt_name: 'bool',
      is_nullable: 'NO',
      column_default: 'false',
    })),
  );
  assert.deepEqual(tables, [{ tablename: 'admin_lifecycle_boundary' }]);
  assert.deepEqual(
    (
      await db.query(
        "SELECT column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='_migration' AND table_name='admin_lifecycle_boundary' ORDER BY column_name",
      )
    ).rows,
    [
      ['established_at', 'timestamptz', 'statement_timestamp()'],
      ['prior_history_count', 'int4', null],
      ['prior_history_digest', 'text', null],
      ['prior_receipt_count', 'int4', null],
      ['prior_receipt_digest', 'text', null],
      ['prior_versions', 'jsonb', null],
      ['singleton', 'bool', null],
    ].map(([column_name, udt_name, column_default]) => ({
      column_name,
      udt_name,
      is_nullable: 'NO',
      column_default,
    })),
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT conname,pg_get_constraintdef(oid) definition,convalidated,condeferrable,condeferred FROM pg_constraint WHERE conrelid='_migration.admin_lifecycle_boundary'::regclass ORDER BY conname",
      )
    ).rows,
    [
      ['pkey', 'PRIMARY KEY (singleton)'],
      ['prior_history_count_check', 'CHECK ((prior_history_count >= 0))'],
      ['prior_history_digest_check', "CHECK ((prior_history_digest ~ '^[a-f0-9]{64}$'::text))"],
      ['prior_receipt_count_check', 'CHECK ((prior_receipt_count >= 0))'],
      ['prior_receipt_digest_check', "CHECK ((prior_receipt_digest ~ '^[a-f0-9]{64}$'::text))"],
      ['prior_versions_check', "CHECK ((jsonb_typeof(prior_versions) = 'object'::text))"],
      ['singleton_check', 'CHECK (singleton)'],
    ].map(([suffix, definition]) => ({
      conname: 'admin_lifecycle_boundary_' + suffix,
      definition,
      convalidated: true,
      condeferrable: false,
      condeferred: false,
    })),
  );
  const definitions = [
    ...source.matchAll(
      /CREATE FUNCTION ((?:public|_migration)\.admin_lifecycle_\w+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/gu,
    ),
  ];
  assert.deepEqual(
    routines.map((f) => f.schema + '.' + f.name).sort(),
    definitions.map((m) => m[1]).sort(),
  );
  for (const fn of routines) {
    assert.equal(
      fn.body.trim().replaceAll('\r\n', '\n'),
      definitions
        .find((m) => m[1] === fn.schema + '.' + fn.name)![2]!
        .trim()
        .replaceAll('\r\n', '\n'),
      fn.name,
    );
    assert.equal(fn.prosecdef, true);
    assert.equal(fn.runtime, fn.schema === 'public');
    assert.equal(fn.public, false);
    assert.equal(fn.owner, 'litigation');
    assert.deepEqual(
      fn.proconfig,
      ['admin_lifecycle_facts', 'admin_lifecycle_save'].includes(fn.name)
        ? ['search_path=pg_catalog, public', 'TimeZone=UTC']
        : ['search_path=pg_catalog, public'],
    );
  }
  assert.equal(
    (
      await db.query(
        "SELECT has_table_privilege('litigation_runtime','_migration.admin_lifecycle_boundary','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') access",
      )
    ).rows[0].access,
    false,
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT tgname,tgtype::int type,tgenabled,tgfoid::regprocedure::text function FROM pg_trigger WHERE tgrelid='_migration.admin_lifecycle_boundary'::regclass AND NOT tgisinternal ORDER BY 1",
      )
    ).rows,
    [
      {
        tgname: 'immutable_rows',
        type: 62,
        tgenabled: 'O',
        function: '_migration.admin_edit_immutable()',
      },
    ],
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT c.relname,t.tgenabled,t.tgtype::int type,t.tgfoid::regprocedure::text function FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname='zy_admin_lifecycle_guard' ORDER BY 1",
      )
    ).rows,
    ['admin_tasks', 'task_actions'].map((relname) => ({
      relname,
      tgenabled: 'O',
      type: 23,
      function: '_migration.admin_lifecycle_guard()',
    })),
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND indexname IN('admin_tasks_archive_date_id_idx','task_actions_archive_order_idx') ORDER BY indexname",
      )
    ).rows,
    [
      {
        indexname: 'admin_tasks_archive_date_id_idx',
        indexdef:
          'CREATE INDEX admin_tasks_archive_date_id_idx ON public.admin_tasks USING btree (is_archived, task_created_date DESC NULLS LAST, id DESC)',
      },
      {
        indexname: 'task_actions_archive_order_idx',
        indexdef:
          'CREATE INDEX task_actions_archive_order_idx ON public.task_actions USING btree (task_id, is_archived, ((current_order IS NOT NULL)), source_ordinal, current_order, id)',
      },
    ],
  );
  return true;
}
export async function assertAdminLifecycleBoundary(db: ClientBase) {
  assert.equal(await adminLifecycleApplied(db), true);
  const boundary = (await db.query('SELECT * FROM _migration.admin_lifecycle_boundary')).rows;
  assert.equal(boundary.length, 1);
  assert.equal(boundary[0].singleton, true);
  for (const [table, version, prefix] of [
    ['admin_edit_change', 'version', 'history'],
    ['admin_edit_submission', 'result_version', 'receipt'],
  ] as const) {
    const row = (
      await db.query(
        `SELECT count(*)::int count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(c)::text,chr(10) ORDER BY task_id,${version}),''),'UTF8')),'hex') digest FROM _migration.${table} c WHERE ${version}<=coalesce(($1::jsonb->>task_id::text)::bigint,0)`,
        [boundary[0].prior_versions],
      )
    ).rows[0];
    assert.equal(row.count, boundary[0][`prior_${prefix}_count`]);
    assert.equal(row.digest, boundary[0][`prior_${prefix}_digest`]);
  }
  assert.deepEqual(
    (
      await db.query(
        "SELECT key FROM _migration.admin_lifecycle_boundary b,LATERAL jsonb_each(b.prior_versions) v LEFT JOIN public.admin_tasks a ON a.id=v.key::integer WHERE jsonb_typeof(v.value)<>'number' OR v.value::text::bigint<1 OR a.id IS NULL OR a.row_version<v.value::text::bigint",
      )
    ).rows,
    [],
  );
  assert.deepEqual(
    (
      await db.query(
        'SELECT id FROM public.admin_tasks WHERE NOT _migration.admin_edit_current_valid(id)',
      )
    ).rows,
    [],
  );
  return [
    {
      id: 'Task 4.4 lifecycle 1',
      description: 'Frozen pre69 histories/receipts and complete current archive state',
    },
    {
      id: 'Task 4.4 lifecycle 2',
      description: 'Exact lifecycle gateway, privilege, trigger and index definitions',
    },
  ];
}
