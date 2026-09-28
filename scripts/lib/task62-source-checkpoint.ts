import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';

export const TASK62_SOURCE_MIGRATION = '20260928070000_task62_bounded_source_provenance';
export const TASK62_PLAN_SHA = 'c0b0590c693b139b57bb78a4a8d24640af2ee6ab73e4e0ee1f9aa89d12b1be6e';
const table = '_migration.task62_source_receipt';
const source = () =>
  readFileSync(`prisma/migrations/${TASK62_SOURCE_MIGRATION}/migration.sql`, 'utf8');
export async function task62SourceApplied(db: ClientBase) {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL',
      [TASK62_SOURCE_MIGRATION],
    )
  ).rows;
  const tables = (
    await db.query(
      "SELECT n.nspname||'.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='_migration' AND c.relkind IN('r','v','m','S') AND c.relname LIKE 'task62_source_%' ORDER BY 1",
    )
  ).rows.map((r) => r.name);
  const functions = (
    await db.query(
      "SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='_migration' AND proname LIKE 'task62_source_%' ORDER BY 1",
    )
  ).rows.map((r) => r.proname);
  const triggers = (
    await db.query(
      "SELECT tgname FROM pg_trigger WHERE tgname LIKE 'task62_source_%' AND NOT tgisinternal ORDER BY 1",
    )
  ).rows.map((r) => r.tgname);
  if (!ledger.length) {
    assert.deepEqual(tables, [], 'Partial bounded provenance table');
    assert.deepEqual(functions, [], 'Partial bounded provenance functions');
    assert.deepEqual(triggers, [], 'Partial bounded provenance triggers');
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(ledger[0].finished_at);
  assert.equal(ledger[0].applied_steps_count, 1);
  assert.equal(ledger[0].checksum, createHash('sha256').update(source()).digest('hex'));
  assert.deepEqual(tables, [table]);
  assert.deepEqual(functions, ['task62_source_operation_valid', 'task62_source_require_complete']);
  assert.deepEqual(triggers, [
    'task62_source_atomic_audit',
    'task62_source_complete',
    'task62_source_immutable',
  ]);
  return true;
}

/** Complete definitions excluding OIDs and physical/catalog ordering. */
export async function task62SourceCatalog(db: ClientBase) {
  const columns = (
    await db.query(
      'SELECT a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) default_value FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum',
      [table],
    )
  ).rows;
  const constraints = (
    await db.query(
      'SELECT conname,contype,convalidated,pg_get_constraintdef(oid,true) definition FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname',
      [table],
    )
  ).rows;
  const indexes = (
    await db.query(
      'SELECT pg_get_indexdef(indexrelid) definition,indisvalid,indisready,indislive FROM pg_index WHERE indrelid=$1::regclass ORDER BY 1',
      [table],
    )
  ).rows;
  const triggers = (
    await db.query(
      "SELECT tgname,tgrelid::regclass::text relation,tgtype,tgenabled,tgdeferrable,tginitdeferred,tgfoid::regprocedure::text function,tgnargs,tgattr::text attributes,pg_get_triggerdef(oid,true) definition FROM pg_trigger WHERE tgname LIKE 'task62_source_%' AND NOT tgisinternal ORDER BY tgname",
    )
  ).rows;
  return { columns, constraints, indexes, triggers };
}

export async function task62SourceFailures(db: ClientBase) {
  const failures: string[] = [];
  try {
    if (!(await task62SourceApplied(db))) return failures;
    const owner = (
      await db.query(
        "SELECT pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='public._prisma_migrations'::regclass",
      )
    ).rows[0].owner;
    assert.equal(
      (
        await db.query(
          'SELECT pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass',
          [table],
        )
      ).rows[0].owner,
      owner,
    );
    assert.equal(
      (await db.query('SELECT rolsuper FROM pg_roles WHERE rolname=$1', [owner])).rows[0].rolsuper,
      true,
    );
    assert.deepEqual(
      (
        await db.query(
          "SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='_migration' AND table_name='task62_source_receipt' AND grantee<>$1 ORDER BY 1,2",
          [owner],
        )
      ).rows,
      [],
    );
    const normalize = (s: string) => s.replaceAll('\r\n', '\n').trim();
    for (const match of source().matchAll(
      /CREATE FUNCTION (_migration\.task62_source_\w+)\(([\s\S]*?)\)\s*RETURNS([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/gu,
    )) {
      const rows = (
        await db.query(
          'SELECT p.oid,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,p.prokind,p.proisstrict,p.proleakproof,p.proparallel,pg_get_function_identity_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,l.lanname,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 AND p.proname=$2',
          match[1]!.split('.'),
        )
      ).rows;
      assert.equal(rows.length, 1);
      const r = rows[0];
      assert.equal(normalize(r.prosrc), normalize(match[4]!));
      assert.equal(r.owner, owner);
      assert.equal(r.prosecdef, true);
      assert.equal(r.prokind, 'f');
      assert.equal(r.lanname, 'plpgsql');
      assert.equal(r.proisstrict, false);
      assert.equal(r.proleakproof, false);
      assert.equal(r.proparallel, 'u');
      assert.equal(r.arguments, match[2]!.trim());
      assert.equal(r.result, match[1]!.endsWith('_valid') ? 'boolean' : 'trigger');
      assert.equal(r.provolatile, /STABLE/u.test(match[3]!) ? 's' : 'v');
      assert.deepEqual(r.proconfig, ['search_path=pg_catalog, public']);
      assert.deepEqual(
        (
          await db.query(
            "SELECT pg_get_userbyid(a.grantee) grantee,a.privilege_type FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1 AND a.grantee<>p.proowner",
            [r.oid],
          )
        ).rows,
        [],
      );
    }
    const defaultGrants = (
      await db.query(
        "SELECT d.defaclobjtype,a.grantee,a.privilege_type FROM pg_default_acl d,LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole=$1::regrole AND d.defaclnamespace IN(0,'_migration'::regnamespace) AND a.grantee<>d.defaclrole",
        [owner],
      )
    ).rows;
    assert.deepEqual(defaultGrants, [], 'No inherited public/runtime private-object grants');
    assert.deepEqual(
      (
        await db.query(
          'SELECT tgname FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname',
          [table],
        )
      ).rows.map((r) => r.tgname),
      ['task62_source_complete', 'task62_source_immutable'],
    );
    const expected = JSON.parse(readFileSync('scripts/lib/task62-source-catalog.json', 'utf8'));
    assert.deepEqual(
      await task62SourceCatalog(db),
      expected,
      'Exact bounded provenance columns/defaults/constraints/indexes/triggers',
    );
    const invalid = (
      await db.query(
        "SELECT operation_id FROM (SELECT operation_id FROM _migration.task62_source_receipt UNION SELECT request_id FROM public.audit_events WHERE request_id::text ~ '^62620075-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') x WHERE NOT _migration.task62_source_operation_valid(operation_id)",
      )
    ).rows;
    assert.deepEqual(
      invalid,
      [],
      'Complete immutable approved provenance and atomic audit correspondence',
    );
  } catch (error) {
    failures.push(error instanceof Error ? error.message : 'Bounded provenance check failed');
  }
  return failures;
}

/** Exact approved additions only, after permanent provenance validation. */
export async function task62ApprovedCapacityIds(db: ClientBase): Promise<number[]> {
  if (!(await task62SourceApplied(db))) return [];
  assert.deepEqual(
    await task62SourceFailures(db),
    [],
    'Valid provenance before historical projection',
  );
  const rows = (
    await db.query('SELECT operation_manifest FROM _migration.task62_source_receipt LIMIT 1')
  ).rows;
  if (!rows.length) return [];
  const ids = rows[0].operation_manifest.capacities
    .map((r: { id: number }) => r.id)
    .sort((a: number, b: number) => a - b);
  assert.equal(ids.length, 8);
  assert.equal(new Set(ids).size, 8);
  assert.ok(ids.every((id: number) => Number.isSafeInteger(id) && id > 0));
  return ids;
}

/** Read-only historical oracle adapter. New approved lookup definitions must not
 * retroactively reinterpret untouched import/quarantine source cells. Current
 * product reads and future migrations do not use this projection. */
export function historicalTask62CapacityClient(db: ClientBase, ids: readonly number[]): ClientBase {
  if (!ids.length) return db;
  assert.equal(ids.length, 8);
  assert.ok(ids.every((id) => Number.isSafeInteger(id) && id > 0));
  return {
    query: (sql: string, values?: unknown[]) => {
      assert.equal(typeof sql, 'string');
      if (!/\b(?:FROM|JOIN)\s+(?:public\.)?lookup_party_role\b/iu.test(sql))
        return db.query(sql, values);
      let body = sql.trimStart();
      while (body.startsWith('--') || body.startsWith('/*')) {
        const end = body.startsWith('--') ? body.indexOf('\n') : body.indexOf('*/') + 1;
        assert.ok(end >= 1);
        body = body.slice(end + 1).trimStart();
      }
      assert.match(
        body,
        /^(?:SELECT|WITH)\b/iu,
        'Historical capacity projection must be read-only',
      );
      body = body.replace(
        /\b(FROM|JOIN)\s+(?:public\.)?lookup_party_role\b/giu,
        '$1 task62_historical_party_role',
      );
      const cte = `WITH task62_historical_party_role AS (SELECT * FROM public.lookup_party_role WHERE NOT(id=ANY(ARRAY[${ids.join(',')}]::int[]))) `;
      return db.query(cte + (/^WITH\b/iu.test(body) ? ',' + body.slice(4) : body), values);
    },
  } as ClientBase;
}
