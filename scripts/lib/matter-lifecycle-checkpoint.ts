import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
export const MATTER_LIFECYCLE_MIGRATION = '20260912210000_matter_archive_restore';
export const MATTER_LIFECYCLE_FIELDS = [
  ['matters', 'is_archived', 64, 'matter_archive_lifecycle'],
] as const;
export const MATTER_LIFECYCLE_GATEWAYS = [
  'public.matter_lifecycle_state(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_id integer)',
  'public.matter_lifecycle_save(p_account integer, p_session integer, p_role text, p_expires timestamp with time zone, p_request jsonb)',
];
export const matterLifecycleSql = () =>
  readFileSync(`prisma/migrations/${MATTER_LIFECYCLE_MIGRATION}/migration.sql`, 'utf8');
export async function matterLifecycleApplied(db: ClientBase) {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM _prisma_migrations WHERE migration_name=$1',
      [MATTER_LIFECYCLE_MIGRATION],
    )
  ).rows;
  const columns = (
    await db.query(
      "SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='matters' AND column_name='is_archived'",
    )
  ).rows;
  const routines = (
    await db.query(
      "SELECT n.nspname schema,p.proname name,p.prosrc body,p.prosecdef,p.proconfig,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','_migration') AND p.proname LIKE 'matter_lifecycle_%' ORDER BY 1,2",
    )
  ).rows;
  if (!ledger.length) {
    assert.deepEqual(columns, [], 'Partial lifecycle column without ledger');
    assert.deepEqual(routines, [], 'Partial lifecycle functions without ledger');
    assert.equal(
      (await db.query("SELECT to_regclass('_migration.matter_lifecycle_audit_counter') counter"))
        .rows[0].counter,
      null,
    );
    return false;
  }
  assert.equal(ledger.length, 1);
  const row = ledger[0];
  assert.ok(row.finished_at && !row.rolled_back_at && row.applied_steps_count === 1);
  const source = matterLifecycleSql();
  assert.equal(row.checksum, createHash('sha256').update(source).digest('hex'));
  assert.deepEqual(columns, [
    { column_name: 'is_archived', is_nullable: 'NO', column_default: 'false' },
  ]);
  const definitions = [
    ...source.matchAll(
      /CREATE FUNCTION ((?:public|_migration)\.matter_lifecycle_\w+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/gu,
    ),
  ];
  assert.deepEqual(
    routines.map((f) => f.schema + '.' + f.name).sort(),
    definitions.map((m) => m[1]).sort(),
  );
  for (const fn of routines) {
    const definition = definitions.find((m) => m[1] === fn.schema + '.' + fn.name)!;
    assert.equal(
      fn.body.trim().replaceAll('\r\n', '\n'),
      definition[2]!.trim().replaceAll('\r\n', '\n'),
    );
    assert.equal(fn.prosecdef, true);
    assert.equal(fn.runtime, fn.schema === 'public');
    assert.equal(fn.public, false);
    assert.deepEqual(
      fn.proconfig,
      fn.name === 'matter_lifecycle_save'
        ? ['search_path=pg_catalog, public', 'TimeZone=UTC']
        : ['search_path=pg_catalog, public'],
    );
  }
  const counter = (
    await db.query(
      'SELECT singleton,initial_value::text,last_value::text,(SELECT last_value::text FROM public.audit_events_id_seq) frozen_sequence,coalesce((SELECT max(id) FROM audit_events),0)::text max_id FROM _migration.matter_lifecycle_audit_counter',
    )
  ).rows;
  assert.equal(counter.length, 1);
  assert.equal(counter[0].singleton, true);
  assert.equal(counter[0].initial_value, counter[0].frozen_sequence);
  assert.equal(
    BigInt(counter[0].last_value),
    BigInt(counter[0].max_id) > BigInt(counter[0].initial_value)
      ? BigInt(counter[0].max_id)
      : BigInt(counter[0].initial_value),
  );
  const writer = (
    await db.query(
      "SELECT prosrc FROM pg_proc WHERE oid='public.audit_write_event(text,text,text,text,jsonb,text[],jsonb,jsonb,integer,text,text,jsonb,text,jsonb)'::regprocedure",
    )
  ).rows[0];
  const writerSource = source.match(
    /CREATE OR REPLACE FUNCTION public\.audit_write_event\([\s\S]*?AS \$WRITE_EVENT\$([\s\S]*?)\$WRITE_EVENT\$;/u,
  )![1]!;
  assert.equal(
    writer.prosrc.trim().replaceAll('\r\n', '\n'),
    writerSource.trim().replaceAll('\r\n', '\n'),
  );
  assert.equal(
    (
      await db.query(
        "SELECT has_table_privilege('litigation_runtime','_migration.matter_lifecycle_audit_counter','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') access",
      )
    ).rows[0].access,
    false,
  );
  const counterConstraints = (
    await db.query(
      "SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='_migration.matter_lifecycle_audit_counter'::regclass ORDER BY conname",
    )
  ).rows;
  assert.deepEqual(counterConstraints, [
    { conname: 'matter_lifecycle_audit_counter_pkey', definition: 'PRIMARY KEY (singleton)' },
    {
      conname: 'matter_lifecycle_audit_counter_range',
      definition: 'CHECK (((initial_value >= 0) AND (last_value >= initial_value)))',
    },
    { conname: 'matter_lifecycle_audit_counter_singleton', definition: 'CHECK (singleton)' },
  ]);
  const triggers = (
    await db.query(
      "SELECT c.relname,t.tgenabled,t.tgtype::integer type,t.tgfoid::regprocedure::text function FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname='zy_matter_lifecycle_guard' ORDER BY 1",
    )
  ).rows;
  assert.deepEqual(
    triggers,
    ['matter_lawyers', 'matter_parties', 'matter_party_roles', 'matters'].map((relname) => ({
      relname,
      tgenabled: 'O',
      type: 23,
      function: '_migration.matter_lifecycle_guard()',
    })),
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM pg_indexes WHERE schemaname='public' AND indexname='matters_archive_case_id_idx' AND indexdef='CREATE INDEX matters_archive_case_id_idx ON public.matters USING btree (is_archived, case_number_ar COLLATE arabic, id)'",
      )
    ).rows[0].n,
    1,
  );
  return true;
}
/** The final explicit replacement for an old function is the current contract.
 * Old database checkpoints continue to compare with the untouched migration64. */
export function currentMatterEditSql(original: string, lifecycle: boolean) {
  if (!lifecycle) return original;
  let source = original;
  for (const m of matterLifecycleSql().matchAll(
    /CREATE OR REPLACE FUNCTION ((?:public|_migration)\.matter_edit_\w+)\([\s\S]*?\$\$;/gu,
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
