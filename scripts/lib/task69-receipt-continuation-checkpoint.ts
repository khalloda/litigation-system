import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { task69Sha } from './task69-contract';
export const TASK69_CONTINUATION_MIGRATION = '20261007190000_task69_receipt_continuation';
export const task69ContinuationSql = () =>
  readFileSync(`prisma/migrations/${TASK69_CONTINUATION_MIGRATION}/migration.sql`, 'utf8');
/** Receipt continuations are exact and operation-owned, never a waiver for
 * later native edits. Historical receipts remain valid after normal edits;
 * only retry eligibility requires their current postimages. */
export async function task69ContinuationApplied(db: ClientBase) {
  const source = task69ContinuationSql();
  const matches = [
    ...source.matchAll(
      /CREATE FUNCTION _migration\.(task69_\w+)\([\s\S]*?LANGUAGE (?:sql|plpgsql) ([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/gu,
    ),
  ];
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1',
      [TASK69_CONTINUATION_MIGRATION],
    )
  ).rows;
  const functions = (
    await db.query(
      "SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0) public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='_migration' AND p.proname=ANY($1::text[]) ORDER BY p.proname",
      [matches.map((m) => m[1])],
    )
  ).rows;
  assert.equal(matches.length, 2);
  if (!ledger.length) {
    assert.deepEqual(functions, []);
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  assert.equal(ledger[0].checksum, task69Sha(source));
  assert.equal(functions.length, matches.length);
  for (const fn of functions) {
    const m = matches.find((x) => x[1] === fn.proname)!;
    assert.equal(fn.prosrc, m[3]);
    assert.equal(fn.prosecdef, true);
    assert.deepEqual(fn.proconfig, [
      'search_path=pg_catalog, public',
      ...(/SET TimeZone='UTC'/u.test(m[2]!) ? ['TimeZone=UTC'] : []),
    ]);
    assert.equal(fn.provolatile, 'v');
    assert.equal(fn.runtime, false);
    assert.equal(fn.public, false);
  }
  return true;
}
export function currentTask69AuthorizationBody() {
  const m = task69ContinuationSql().match(
    /CREATE OR REPLACE FUNCTION _migration\.task69_authorize_issue\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/u,
  );
  assert(m);
  return m[1]!;
}
