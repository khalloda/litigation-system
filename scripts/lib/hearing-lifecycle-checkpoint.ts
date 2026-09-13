import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
export const HEARING_LIFECYCLE_MIGRATION = '20260913160000_hearing_archive_restore';
export const HEARING_LIFECYCLE_FIELDS = [
  ['hearings', 'is_archived', 64, 'hearing_archive_lifecycle'],
] as const;
export const HEARING_LIFECYCLE_GATEWAYS = [
  'public.hearing_lifecycle_state(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_id integer)',
  'public.hearing_lifecycle_save(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_request jsonb)',
];
export const hearingLifecycleSql = () =>
  readFileSync(`prisma/migrations/${HEARING_LIFECYCLE_MIGRATION}/migration.sql`, 'utf8');
export function currentHearingEditSql(original: string, lifecycle: boolean) {
  if (!lifecycle) return original;
  let source = original;
  for (const m of hearingLifecycleSql().matchAll(
    /CREATE OR REPLACE FUNCTION ((?:public|_migration)\.hearing_edit_\w+)\([\s\S]*?\$\$;/gu,
  )) {
    const pattern = new RegExp(
      'CREATE FUNCTION ' + m[1]!.replaceAll('.', '\\.') + '\\([\\s\\S]*?\\$\\$;',
    );
    assert.equal([...source.matchAll(new RegExp(pattern.source, 'g'))].length, 1);
    source = source.replace(pattern, () =>
      m[0].replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION'),
    );
  }
  return source;
}
export async function hearingLifecycleApplied(db: ClientBase) {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM _prisma_migrations WHERE migration_name=$1',
      [HEARING_LIFECYCLE_MIGRATION],
    )
  ).rows;
  const columns = (
    await db.query(
      "SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='hearings' AND column_name='is_archived'",
    )
  ).rows;
  const routines = (
    await db.query(
      "SELECT n.nspname schema,p.proname name,p.prosrc body,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','_migration') AND p.proname LIKE 'hearing_lifecycle_%' ORDER BY 1,2",
    )
  ).rows;
  const tables = (
    await db.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='_migration' AND tablename LIKE 'hearing_lifecycle_%' ORDER BY 1",
    )
  ).rows;
  if (!ledger.length) {
    assert.deepEqual(columns, [], 'Partial hearing lifecycle column');
    assert.deepEqual(routines, [], 'Partial hearing lifecycle routines');
    assert.deepEqual(tables, [], 'Partial hearing lifecycle metadata');
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  const source = hearingLifecycleSql();
  assert.equal(ledger[0].checksum, createHash('sha256').update(source).digest('hex'));
  assert.deepEqual(columns, [
    { column_name: 'is_archived', is_nullable: 'NO', column_default: 'false' },
  ]);
  assert.deepEqual(tables, [{ tablename: 'hearing_lifecycle_boundary' }]);
  assert.deepEqual(
    (
      await db.query(
        "SELECT column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='_migration' AND table_name='hearing_lifecycle_boundary' ORDER BY ordinal_position",
      )
    ).rows,
    [
      ['singleton', 'bool', null],
      ['prior_versions', 'jsonb', null],
      ['prior_history_count', 'int4', null],
      ['prior_history_digest', 'text', null],
      ['established_at', 'timestamptz', 'statement_timestamp()'],
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
        "SELECT conname,pg_get_constraintdef(oid) definition,convalidated,condeferrable,condeferred FROM pg_constraint WHERE conrelid='_migration.hearing_lifecycle_boundary'::regclass ORDER BY conname",
      )
    ).rows,
    [
      ['pkey', 'PRIMARY KEY (singleton)'],
      ['prior_history_count_check', 'CHECK ((prior_history_count >= 0))'],
      ['prior_history_digest_check', "CHECK ((prior_history_digest ~ '^[a-f0-9]{64}$'::text))"],
      ['prior_versions_check', "CHECK ((jsonb_typeof(prior_versions) = 'object'::text))"],
      ['singleton_check', 'CHECK (singleton)'],
    ].map(([name, definition]) => ({
      conname: 'hearing_lifecycle_boundary_' + name,
      definition,
      convalidated: true,
      condeferrable: false,
      condeferred: false,
    })),
  );
  const definitions = [
    ...source.matchAll(
      /CREATE FUNCTION ((?:public|_migration)\.hearing_lifecycle_\w+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/gu,
    ),
  ];
  assert.deepEqual(
    routines.map((f) => f.schema + '.' + f.name).sort(),
    definitions.map((m) => m[1]).sort(),
  );
  for (const fn of routines) {
    const def = definitions.find((m) => m[1] === fn.schema + '.' + fn.name)!;
    assert.equal(
      fn.body.trim().replaceAll('\r\n', '\n'),
      def[2]!.trim().replaceAll('\r\n', '\n'),
      fn.name,
    );
    assert.equal(fn.prosecdef, true);
    assert.equal(fn.runtime, fn.schema === 'public');
    assert.equal(fn.public, false);
    assert.equal(fn.owner, 'litigation');
    assert.deepEqual(
      fn.proconfig,
      ['hearing_lifecycle_save', 'hearing_lifecycle_facts'].includes(fn.name)
        ? ['search_path=pg_catalog, public', 'TimeZone=UTC']
        : ['search_path=pg_catalog, public'],
    );
  }
  assert.equal(
    (
      await db.query(
        "SELECT has_table_privilege('litigation_runtime','_migration.hearing_lifecycle_boundary','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') access",
      )
    ).rows[0].access,
    false,
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT t.tgname,t.tgtype::int type,t.tgenabled,t.tgfoid::regprocedure::text function FROM pg_trigger t WHERE t.tgrelid='_migration.hearing_lifecycle_boundary'::regclass AND NOT t.tgisinternal ORDER BY 1",
      )
    ).rows,
    [
      {
        tgname: 'immutable_rows',
        type: 62,
        tgenabled: 'O',
        function: '_migration.hearing_edit_immutable()',
      },
    ],
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT c.relname,t.tgenabled,t.tgtype::int type,t.tgfoid::regprocedure::text function FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname='zy_hearing_lifecycle_guard' ORDER BY 1",
      )
    ).rows,
    ['hearing_attendees', 'hearings'].map((relname) => ({
      relname,
      tgenabled: 'O',
      type: 23,
      function: '_migration.hearing_lifecycle_guard()',
    })),
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM pg_indexes WHERE schemaname='public' AND indexname='hearings_archive_date_id_idx' AND indexdef='CREATE INDEX hearings_archive_date_id_idx ON public.hearings USING btree (is_archived, hearing_date DESC NULLS LAST, id DESC)'",
      )
    ).rows[0].n,
    1,
  );
  return true;
}
export async function assertHearingLifecycleBoundary(db: ClientBase) {
  assert.equal(await hearingLifecycleApplied(db), true);
  const boundary = (await db.query('SELECT * FROM _migration.hearing_lifecycle_boundary')).rows;
  assert.equal(boundary.length, 1);
  assert.equal(boundary[0].singleton, true);
  const historical = (
    await db.query(
      `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(c)::text,chr(10) ORDER BY hearing_id,version),''),'UTF8')),'hex') digest FROM _migration.hearing_edit_change c WHERE version<=coalesce(($1::jsonb->>hearing_id::text)::bigint,0)`,
      [boundary[0].prior_versions],
    )
  ).rows[0];
  assert.equal(historical.count, boundary[0].prior_history_count);
  assert.equal(historical.digest, boundary[0].prior_history_digest);
  assert.deepEqual(
    (
      await db.query(
        `SELECT key FROM _migration.hearing_lifecycle_boundary b,LATERAL jsonb_each(b.prior_versions) v LEFT JOIN public.hearings h ON h.id=v.key::integer WHERE jsonb_typeof(v.value)<>'number' OR v.value::text::bigint<1 OR h.id IS NULL OR h.row_version<v.value::text::bigint`,
      )
    ).rows,
    [],
  );
  assert.deepEqual(
    (
      await db.query(
        'SELECT id FROM public.hearings WHERE NOT _migration.hearing_edit_current_valid(id)',
      )
    ).rows,
    [],
  );
  return [
    {
      id: 'Task 4.3 lifecycle 1',
      description: 'Frozen pre67 history and explicit current archive state',
    },
    {
      id: 'Task 4.3 lifecycle 2',
      description: 'Exact lifecycle functions, grants, triggers and archive index',
    },
  ];
}
