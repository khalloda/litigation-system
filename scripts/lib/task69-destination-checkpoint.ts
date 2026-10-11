import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { task69Sha } from './task69-contract';
export const TASK69_DESTINATION_MIGRATION = '20261007170000_task69_destination_dependency';
export const task69DestinationSql = () =>
  readFileSync(`prisma/migrations/${TASK69_DESTINATION_MIGRATION}/migration.sql`, 'utf8');
export async function task69DestinationApplied(db: ClientBase): Promise<boolean> {
  const source = task69DestinationSql(),
    definitions = [
      ...source.matchAll(
        /CREATE FUNCTION _migration\.(task69_\w+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/gu,
      ),
    ];
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1',
      [TASK69_DESTINATION_MIGRATION],
    )
  ).rows;
  const functions = (
    await db.query(
      "SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0) public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='_migration' AND p.proname=ANY($1::text[]) ORDER BY p.proname",
      [definitions.map((m) => m[1])],
    )
  ).rows;
  const triggers = (
    await db.query(
      "SELECT t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t WHERE t.tgname='task69_destination_receipt_complete' ORDER BY 1",
    )
  ).rows;
  if (!ledger.length) {
    assert.deepEqual(functions, []);
    assert.deepEqual(triggers, []);
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  assert.equal(ledger[0].checksum, task69Sha(source));
  assert.equal(functions.length, definitions.length);
  for (const fn of functions) {
    assert.equal(fn.prosrc, definitions.find((m) => m[1] === fn.proname)![2]);
    assert.equal(fn.prosecdef, true);
    assert.deepEqual(fn.proconfig, ['search_path=pg_catalog, public']);
    assert.equal(fn.runtime, false);
    assert.equal(fn.public, false);
    assert.equal(fn.provolatile, fn.proname.endsWith('_complete') ? 'v' : 's');
  }
  assert.deepEqual(triggers, [
    {
      tgname: 'task69_destination_receipt_complete',
      tgenabled: 'O',
      definition:
        'CREATE CONSTRAINT TRIGGER task69_destination_receipt_complete AFTER INSERT ON _migration.task69_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _migration.task69_destination_receipt_complete()',
    },
  ]);
  assert.deepEqual(
    (
      await db.query(
        'SELECT receipt_id FROM _migration.task69_receipt WHERE _migration.task69_destination_receipt_valid(receipt_id) IS NOT TRUE',
      )
    ).rows,
    [],
    'Exact immutable normalization semantics and aliases',
  );
  return true;
}
export function currentTask69DestinationSql(original: string, applied: boolean) {
  if (!applied) return original;
  const replacement = task69DestinationSql().match(
    /CREATE OR REPLACE FUNCTION _migration\.task69_lookup_receipt_valid\([\s\S]*?\$\$;/u,
  )![0];
  const pattern = /CREATE FUNCTION _migration\.task69_lookup_receipt_valid\([\s\S]*?\$\$;/u;
  assert.ok(pattern.test(original));
  return original.replace(pattern, () =>
    replacement.replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION'),
  );
}
