import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { task69Sha } from './task69-contract';
export const TASK69_DOCUMENT_MIGRATION = '20261007220000_task69_document_relationships';
export const TASK69_DOCUMENT_TABLES = ['document_matters', 'document_responsible_people'];
export const TASK69_DOCUMENT_FIELDS = TASK69_DOCUMENT_TABLES.flatMap((table) =>
  [
    'id',
    'document_id',
    table === 'document_matters' ? 'matter_id' : 'person_id',
    'position',
    'is_retired',
  ].map(
    (field) => [table, field, field === 'id' ? 0 : 64, 'task69_document_relationship'] as const,
  ),
);
export const task69DocumentSql = () =>
  readFileSync(`prisma/migrations/${TASK69_DOCUMENT_MIGRATION}/migration.sql`, 'utf8');
export async function task69DocumentCatalog(db: ClientBase) {
  const names = [
    'public.document_matters',
    'public.document_responsible_people',
    '_migration.task69_document_relationship_boundary',
  ];
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
        "SELECT n.nspname schema,c.relname name,pg_get_userbyid(a.grantee) grantee,a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END,c.relowner))) a WHERE (n.nspname||'.'||c.relname=ANY($1::text[]) OR n.nspname||'.'||c.relname IN('public.document_matters_id_seq','public.document_responsible_people_id_seq')) AND a.grantee<>c.relowner ORDER BY 1,2,3,4",
        [names],
      )
    ).rows,
  };
}
/** Catalog only; safe for historical projected clients. Current invariants are separate. */
export async function task69DocumentApplied(db: ClientBase): Promise<boolean> {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1',
      [TASK69_DOCUMENT_MIGRATION],
    )
  ).rows;
  const catalog = await task69DocumentCatalog(db);
  const source = task69DocumentSql();
  const matches = [
    ...source.matchAll(
      /CREATE FUNCTION _migration\.(task69_\w+)\([\s\S]*?LANGUAGE (?:sql|plpgsql) ([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/gu,
    ),
  ];
  const functions = (
    await db.query(
      "SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0) public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='_migration' AND p.proname=ANY($1::text[]) ORDER BY p.proname",
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
  assert.equal(ledger[0].checksum, task69Sha(source));
  assert.deepEqual(
    catalog,
    JSON.parse(readFileSync('scripts/lib/task69-document-catalog.json', 'utf8')),
    'Exact document membership schema/ACL',
  );
  assert.equal(functions.length, matches.length);
  for (const fn of functions) {
    const m = matches.find((x) => x[1] === fn.proname)!;
    assert.equal(fn.prosrc, m[3]);
    assert.equal(fn.prosecdef, true);
    assert.deepEqual(fn.proconfig, ['search_path=pg_catalog, public']);
    assert.equal(
      fn.provolatile,
      /IMMUTABLE/u.test(m[2]!) ? 'i' : /STABLE/u.test(m[2]!) ? 's' : 'v',
    );
    assert.equal(fn.runtime, false);
    assert.equal(fn.public, false);
  }
  return true;
}
export async function assertTask69Documents(db: ClientBase) {
  assert.deepEqual(
    (
      await db.query(
        'SELECT d.id FROM public.documents d WHERE _migration.task69_document_compatibility(d.id) IS NOT TRUE OR _migration.document_edit_current_valid(d.id) IS NOT TRUE',
      )
    ).rows,
    [],
    'Every canonical document relationship has complete aggregate history',
  );
  for (const table of TASK69_DOCUMENT_TABLES)
    assert.deepEqual(
      (
        await db.query(
          `SELECT document_id FROM public.${table} WHERE NOT is_retired GROUP BY document_id HAVING min(position)<>1 OR max(position)<>count(*)`,
        )
      ).rows,
      [],
      'Contiguous document relationship order',
    );
  assert.deepEqual(
    (
      await db.query(
        'SELECT b.document_id FROM _migration.task69_document_relationship_boundary b LEFT JOIN public.documents d ON d.id=b.document_id WHERE d.id IS NULL OR d.row_version<b.version',
      )
    ).rows,
    [],
    'Every original document identity/boundary retained',
  );
}
export function currentTask69DocumentSql(original: string, applied: boolean): string {
  if (!applied) return original;
  let source = original;
  for (const m of task69DocumentSql().matchAll(
    /CREATE OR REPLACE FUNCTION ((?:public|_migration)\.(?:document_edit|tasks46_47|audit_history|matter_lifecycle)_\w+)\([\s\S]*?\$\$;/gu,
  )) {
    const pattern = new RegExp(
      'CREATE FUNCTION ' + m[1]!.replaceAll('.', '\\.') + '\\([\\s\\S]*?\\$\\$;',
      'g',
    );
    const found = [...source.matchAll(pattern)];
    if (!found.length) continue;
    assert.equal(found.length, 1);
    source = source.replace(pattern, () =>
      m[0].replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION'),
    );
  }
  return source;
}
