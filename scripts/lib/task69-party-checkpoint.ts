import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { task69Sha } from './task69-contract';
export const TASK69_PARTY_MIGRATION = '20261007130000_task69_party_semantics';
export const TASK69_PARTY_FIELDS = [
  ...['semantic_party_name', 'representative_name', 'contextual_text', 'explanatory_text'].map(
    (k) => ['matter_parties', k, 2048, 'task69_party_semantics'] as const,
  ),
  ...['display_label', 'qualifier'].map(
    (k) => ['matter_party_roles', k, 2048, 'task69_party_semantics'] as const,
  ),
];
export const task69PartySql = () =>
  readFileSync(`prisma/migrations/${TASK69_PARTY_MIGRATION}/migration.sql`, 'utf8');
export const task69PartyExpected = () =>
  JSON.parse(readFileSync('scripts/lib/task69-party-catalog.json', 'utf8'));
export async function task69PartyCatalog(db: ClientBase) {
  return {
    columns: (
      await db.query(
        "SELECT c.relname table_name,a.attname column_name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) default_value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname IN('matter_parties','matter_party_roles') AND a.attname IN('semantic_party_name','representative_name','contextual_text','explanatory_text','display_label','qualifier') AND NOT a.attisdropped ORDER BY 1,2",
      )
    ).rows,
    constraints: (
      await db.query(
        "SELECT c.relname table_name,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid,true) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='_migration' AND k.conname='task69_delta_exact_identity') OR (n.nspname='public' AND k.conname IN('matter_parties_semantic_party_name_check','matter_parties_representative_name_check','matter_parties_contextual_text_check','matter_parties_explanatory_text_check','matter_party_roles_display_label_check','matter_party_roles_qualifier_check','matter_party_roles_party_role_key')) ORDER BY 1,2",
      )
    ).rows,
  };
}
export async function task69PartyApplied(db: ClientBase): Promise<boolean> {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1',
      [TASK69_PARTY_MIGRATION],
    )
  ).rows;
  const catalog = await task69PartyCatalog(db);
  const functions = (
    await db.query(
      "SELECT p.prosrc,p.prosecdef,p.proconfig,p.provolatile,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0) public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='_migration' AND p.proname='task69_party_history'",
    )
  ).rows;
  if (!ledger.length) {
    assert.deepEqual(catalog.columns, [], 'Unledgered party fields');
    assert.deepEqual(functions, [], 'Unledgered party history');
    assert.deepEqual(
      catalog.constraints.filter((c) => c.conname !== 'matter_party_roles_party_role_key'),
      [],
      'Unledgered party constraints',
    );
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  const source = task69PartySql();
  assert.equal(ledger[0].checksum, task69Sha(source));
  assert.deepEqual(catalog, task69PartyExpected(), 'Exact party semantic fields and constraints');
  const body = source.match(
    /CREATE FUNCTION _migration\.task69_party_history\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/u,
  )![1]!;
  assert.deepEqual(
    functions,
    [
      {
        prosrc: body,
        prosecdef: true,
        proconfig: ['search_path=pg_catalog, public'],
        provolatile: 'i',
        runtime: false,
        public: false,
      },
    ],
    'Exact private additive history projection',
  );
  return true;
}
/** Explicit later replacements retain the old source and earlier checkpoints. */
export function currentTask69PartySql(original: string, applied: boolean): string {
  if (!applied) return original;
  let source = original;
  for (const m of task69PartySql().matchAll(
    /CREATE OR REPLACE FUNCTION ((?:public|_migration)\.matter_edit_\w+)\([\s\S]*?\$\$;/gu,
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
