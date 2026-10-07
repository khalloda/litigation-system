import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { task69Sha } from './task69-contract';
export const TASK69_LAWYER_MIGRATION = '20261007150000_task69_lawyer_restoration';
export const TASK69_LAWYER_FIELDS = [
  ['matter_lawyers', 'task69_receipt_id', 64, 'task69_historical_restoration'],
] as const;
export const task69LawyerSql = () =>
  readFileSync(`prisma/migrations/${TASK69_LAWYER_MIGRATION}/migration.sql`, 'utf8');
export async function task69LawyerCatalog(db: ClientBase) {
  return {
    columns: (
      await db.query(
        "SELECT format_type(atttypid,atttypmod) type,attnotnull FROM pg_attribute WHERE attrelid='public.matter_lawyers'::regclass AND attname='task69_receipt_id' AND NOT attisdropped",
      )
    ).rows,
    constraints: (
      await db.query(
        "SELECT conname,contype,convalidated,pg_get_constraintdef(oid,true) definition FROM pg_constraint WHERE conrelid='public.matter_lawyers'::regclass AND conname IN('matter_lawyers_rule_shape','matter_lawyers_task69_source_shape','matter_lawyers_task69_receipt_id_fkey','task69_lawyer_source_complete') ORDER BY conname",
      )
    ).rows,
    indexes: (
      await db.query(
        "SELECT pg_get_indexdef(i.indexrelid) definition,i.indisvalid,i.indisready,i.indislive FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname='matter_lawyers_task69_receipt_idx'",
      )
    ).rows,
    triggers: (
      await db.query(
        "SELECT n.nspname schema,c.relname table,t.tgname name,t.tgenabled,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE t.tgname IN('task69_lawyer_receipt_complete','task69_lawyer_source_complete') ORDER BY 1,2,3",
      )
    ).rows,
  };
}
export async function task69LawyerApplied(db: ClientBase): Promise<boolean> {
  const source = task69LawyerSql(),
    names = [...source.matchAll(/CREATE FUNCTION _migration\.(task69_\w+)\(/gu)].map((m) => m[1]!);
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1',
      [TASK69_LAWYER_MIGRATION],
    )
  ).rows;
  const functions = (
    await db.query(
      "SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0) public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='_migration' AND p.proname=ANY($1::text[]) ORDER BY p.proname",
      [names],
    )
  ).rows;
  const catalog = await task69LawyerCatalog(db);
  if (!ledger.length) {
    assert.deepEqual(functions, [], 'Unledgered S2 functions');
    assert.deepEqual(catalog.columns, [], 'Unledgered S2 provenance');
    assert.deepEqual(catalog.triggers, [], 'Unledgered S2 triggers');
    assert.deepEqual(catalog.indexes, [], 'Unledgered S2 index');
    assert.equal(catalog.constraints.length, 1);
    assert.equal(catalog.constraints[0].conname, 'matter_lawyers_rule_shape');
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  assert.equal(ledger[0].checksum, task69Sha(source));
  assert.deepEqual(
    catalog,
    JSON.parse(readFileSync('scripts/lib/task69-lawyer-catalog.json', 'utf8')),
    'Exact S2 provenance constraints and triggers',
  );
  assert.equal(functions.length, names.length);
  for (const fn of functions) {
    const match = source.match(
      new RegExp(
        'CREATE FUNCTION _migration\\.' + fn.proname + '\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;',
        'u',
      ),
    );
    assert.ok(match);
    assert.equal(fn.prosrc, match[1]);
    assert.equal(fn.prosecdef, true);
    assert.equal(fn.runtime, false);
    assert.equal(fn.public, false);
    assert.deepEqual(fn.proconfig, ['search_path=pg_catalog, public']);
    assert.equal(
      fn.provolatile,
      fn.proname.endsWith('_complete') ? 'v' : fn.proname.endsWith('_history') ? 'i' : 's',
    );
  }
  assert.deepEqual(
    (
      await db.query(
        'SELECT receipt_id FROM _migration.task69_receipt WHERE _migration.task69_lawyer_receipt_valid(receipt_id) IS NOT TRUE',
      )
    ).rows,
    [],
    'Exact immutable S2 historical semantics',
  );
  return true;
}
/** Current rows must be checked through the unprojected migration client. */
export async function assertTask69LawyerSources(db: ClientBase): Promise<void> {
  assert.deepEqual(
    (
      await db.query(
        "SELECT l.id FROM public.matter_lawyers l WHERE l.task69_receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM _migration.task69_delta d JOIN _migration.task69_receipt r USING(receipt_id) JOIN _migration.task69_allowlist a USING(operation_id,issue_id) WHERE d.receipt_id=l.task69_receipt_id AND d.entity_table='matter_lawyers' AND d.entity_key=jsonb_build_object('id',l.id) AND d.before_values IS NULL AND r.phase='apply' AND a.stage='S2-lawyer-membership' AND d.after_values-ARRAY['role','position','is_retired','updated_at','updated_by'] = to_jsonb(l)-ARRAY['role','position','is_retired','updated_at','updated_by'])",
      )
    ).rows,
    [],
    'Every restored S2 row retains its exact immutable source receipt',
  );
}

export function currentTask69LawyerSql(original: string, applied: boolean): string {
  if (!applied) return original;
  let source = original;
  for (const m of task69LawyerSql().matchAll(
    /CREATE OR REPLACE FUNCTION (_migration\.matter_edit_\w+)\([\s\S]*?\$\$;/gu,
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
