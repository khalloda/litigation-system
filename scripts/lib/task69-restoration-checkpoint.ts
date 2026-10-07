import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { task69Sha } from './task69-contract';
export const TASK69_RESTORATION_MIGRATION = '20261007140000_task69_matter_restoration';
export const task69RestorationSql = () =>
  readFileSync(`prisma/migrations/${TASK69_RESTORATION_MIGRATION}/migration.sql`, 'utf8');
export async function task69RestorationApplied(db: ClientBase): Promise<boolean> {
  const source = task69RestorationSql();
  const names = [...source.matchAll(/CREATE FUNCTION _migration\.(task69_\w+)\(/gu)].map(
    (m) => m[1]!,
  );
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1',
      [TASK69_RESTORATION_MIGRATION],
    )
  ).rows;
  const functions = (
    await db.query(
      "SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0) public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='_migration' AND p.proname=ANY($1::text[]) ORDER BY p.proname",
      [names],
    )
  ).rows;
  const triggers = (
    await db.query(
      "SELECT n.nspname schema,c.relname table,t.tgname name,t.tgenabled,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE t.tgname IN('task69_party_receipt_complete','task69_party_source_complete') ORDER BY 1,2,3",
    )
  ).rows;
  if (!ledger.length) {
    assert.deepEqual(functions, [], 'Unledgered restoration functions');
    assert.deepEqual(triggers, [], 'Unledgered restoration triggers');
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  assert.equal(ledger[0].checksum, task69Sha(source));
  assert.equal(functions.length, names.length);
  for (const fn of functions) {
    const definition = source.match(
      new RegExp(
        'CREATE FUNCTION _migration\\.' + fn.proname + '\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;',
        'u',
      ),
    );
    assert.ok(definition);
    assert.equal(fn.prosrc, definition[1]);
    assert.equal(fn.prosecdef, true);
    assert.equal(fn.runtime, false);
    assert.equal(fn.public, false);
    assert.deepEqual(fn.proconfig, ['search_path=pg_catalog, public']);
    assert.equal(fn.provolatile, fn.proname.endsWith('_complete') ? 'v' : 's');
  }
  assert.deepEqual(triggers, [
    {
      schema: '_migration',
      table: 'task69_receipt',
      name: 'task69_party_receipt_complete',
      tgenabled: 'O',
      definition:
        'CREATE CONSTRAINT TRIGGER task69_party_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_party_receipt_complete()',
    },
    {
      schema: 'public',
      table: 'matter_parties',
      name: 'task69_party_source_complete',
      tgenabled: 'O',
      definition:
        'CREATE CONSTRAINT TRIGGER task69_party_source_complete AFTER INSERT ON matter_parties DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_party_source_complete()',
    },
    {
      schema: 'public',
      table: 'matter_party_roles',
      name: 'task69_party_source_complete',
      tgenabled: 'O',
      definition:
        'CREATE CONSTRAINT TRIGGER task69_party_source_complete AFTER INSERT ON matter_party_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_party_source_complete()',
    },
  ]);
  assert.deepEqual(
    (
      await db.query(
        'SELECT receipt_id FROM _migration.task69_receipt WHERE _migration.task69_party_receipt_valid(receipt_id) IS NOT TRUE OR _migration.task69_lookup_receipt_valid(receipt_id) IS NOT TRUE',
      )
    ).rows,
    [],
    'Every historical party and lookup receipt preserves the approved semantic projection',
  );
  return true;
}
export function currentTask69RestorationSql(original: string, applied: boolean): string {
  if (!applied) return original;
  const replacement = task69RestorationSql().match(
    /CREATE OR REPLACE FUNCTION _migration\.matter_edit_guard\([\s\S]*?\$\$;/u,
  )![0];
  const pattern = /CREATE FUNCTION _migration\.matter_edit_guard\([\s\S]*?\$\$;/u;
  assert.ok(pattern.test(original));
  return original.replace(pattern, () =>
    replacement.replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION'),
  );
}
