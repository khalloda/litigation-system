import { task69CompensationApplied } from './task69-compensation-checkpoint';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { task69Sha } from './task69-contract';
export const TASK69_STEP_MIGRATION = '20261007200000_task69_step_restoration';
export const task69StepSql = () =>
  readFileSync(`prisma/migrations/${TASK69_STEP_MIGRATION}/migration.sql`, 'utf8');
export async function task69StepCatalog(db: ClientBase) {
  const names = ['_migration.task69_step_origin', '_migration.task69_step_change'];
  return {
    columns: (
      await db.query(
        "SELECT n.nspname schema,c.relname table,a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attidentity,pg_get_expr(d.adbin,d.adrelid) default_value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname||'.'||c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,3",
        [names],
      )
    ).rows,
    constraints: (
      await db.query(
        "SELECT n.nspname schema,c.relname table,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid,true) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname||'.'||c.relname=ANY($1::text[]) ORDER BY 1,2,3",
        [names],
      )
    ).rows,
    triggers: (
      await db.query(
        "SELECT n.nspname schema,c.relname table,t.tgname name,t.tgenabled,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname||'.'||c.relname=ANY($1::text[]) AND NOT t.tgisinternal ORDER BY 1,2,3",
        [names],
      )
    ).rows,
    indexes: (
      await db.query(
        "SELECT n.nspname schema,c.relname table,pg_get_indexdef(i.indexrelid) definition,i.indisvalid,i.indisready,i.indislive FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname||'.'||c.relname=ANY($1::text[]) ORDER BY 1,2,3",
        [names],
      )
    ).rows,
    grants: (
      await db.query(
        "SELECT n.nspname schema,c.relname name,pg_get_userbyid(a.grantee) grantee,a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END,c.relowner))) a WHERE (n.nspname||'.'||c.relname=ANY($1::text[])) AND a.grantee<>c.relowner ORDER BY 1,2,3,4",
        [names],
      )
    ).rows,
  };
}

export async function task69StepApplied(db: ClientBase) {
  const raw = task69StepSql(),
    matches = [
      ...raw.matchAll(
        /CREATE FUNCTION ((?:_migration|public)\.(?:task69_\w+|admin_source_parent_context))\([\s\S]*?LANGUAGE (?:sql|plpgsql) ([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/gu,
      ),
    ];
  assert.equal(matches.length, 7);
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1',
      [TASK69_STEP_MIGRATION],
    )
  ).rows;
  const catalog = await task69StepCatalog(db);
  const functions = (
    await db.query(
      "SELECT n.nspname||'.'||p.proname name,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0) public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname=ANY($1::text[]) ORDER BY 1",
      [matches.map((m) => m[1])],
    )
  ).rows;
  if (!ledger.length) {
    assert.deepEqual(catalog, {
      columns: [],
      constraints: [],
      triggers: [],
      indexes: [],
      grants: [],
    });
    assert.deepEqual(functions, []);
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  assert.equal(ledger[0].checksum, task69Sha(raw));
  assert.deepEqual(
    catalog,
    JSON.parse(readFileSync('scripts/lib/task69-step-catalog.json', 'utf8')),
    'Exact S4 private origin/change schema and ACL',
  );
  assert.equal(functions.length, matches.length);
  for (const fn of functions) {
    const m = matches.find((x) => x[1] === fn.name)!;
    assert.equal(fn.prosrc, m[3]);
    assert.equal(fn.prosecdef, true);
    assert.deepEqual(fn.proconfig, ['search_path=pg_catalog, public']);
    assert.equal(fn.provolatile, /STABLE/u.test(m[2]!) ? 's' : 'v');
    assert.equal(fn.runtime, fn.name.startsWith('public.'));
    assert.equal(fn.public, false);
  }
  return true;
}
/** Exact forward bodies override only named existing functions. Old migrations
 * and their ledger checksums remain untouched and independently verified. */
export function currentTask69StepSql(original: string, applied: boolean) {
  if (!applied) return original;
  let result = original;
  for (const m of task69StepSql().matchAll(
    /CREATE OR REPLACE FUNCTION (_migration\.\w+)\([\s\S]*?\$\$;/gu,
  )) {
    const pattern = new RegExp(
      'CREATE (?:OR REPLACE )?FUNCTION ' + m[1]!.replaceAll('.', '\\.') + '\\([\\s\\S]*?\\$\\$;',
      'gu',
    );
    const existing = [...result.matchAll(pattern)];
    if (!existing.length) continue;
    assert.equal(existing.length, 1);
    result = result.replace(pattern, () =>
      m[0].replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION'),
    );
  }
  return result;
}
export async function assertTask69Steps(db: ClientBase) {
  const compensation = await task69CompensationApplied(db);
  assert.deepEqual(
    (
      await db.query(
        'SELECT receipt_id FROM _migration.task69_receipt WHERE _migration.task69_step_receipt_valid(receipt_id) IS NOT TRUE OR _migration.task69_generated_receipt_valid(receipt_id) IS NOT TRUE',
      )
    ).rows,
    [],
    'Exact source step/generated parent receipt semantics',
  );
  assert.deepEqual(
    (
      await db.query(
        `SELECT o.step_id FROM _migration.task69_step_origin o JOIN _migration.task69_receipt r USING(receipt_id) LEFT JOIN public.task_actions s ON s.id=o.step_id WHERE s.id IS NULL OR (s.task_id IS NULL AND NOT EXISTS(SELECT 1 FROM _migration.task69_delta d WHERE d.receipt_id=r.receipt_id AND d.entity_table='task_actions' AND d.after_values=to_jsonb(s))${compensation ? ' AND _migration.task69_compensation_unassigned_valid(s.id,to_jsonb(s)) IS NOT TRUE' : ''}) OR (s.task_id IS NOT NULL AND _migration.admin_edit_current_valid(s.task_id) IS NOT TRUE)`,
      )
    ).rows,
    [],
    'Every restored step retains exact isolated source or complete native aggregate continuity',
  );
}
