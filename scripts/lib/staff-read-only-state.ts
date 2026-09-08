import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { ClientBase } from 'pg';
import { identifier } from './high-impact-application-state';

/** Full row/timestamp, sequence and catalog receipts; never export a payload. */
export async function staffReadOnlyState(db: ClientBase) {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await db.query("SET LOCAL TIME ZONE 'UTC'");
    const tables = (
      await db.query<{ schema: string; table: string }>(`
      SELECT schemaname AS schema, tablename AS table FROM pg_tables
      WHERE schemaname IN ('public','staging','quarantine','_migration')
      ORDER BY schemaname,tablename`)
    ).rows;
    const rows = [];
    for (const table of tables) {
      const result = (
        await db.query(`SELECT count(*)::integer count,
        encode(sha256(convert_to(coalesce(string_agg(payload,E'\\n' ORDER BY payload COLLATE "C"),''),'UTF8')),'hex') digest
        FROM (SELECT to_jsonb(t)::text payload FROM ${identifier(table.schema)}.${identifier(table.table)} t) x`)
      ).rows;
      assert.equal(result.length, 1);
      rows.push({ ...table, ...result[0] });
    }
    const sequences = (
      await db.query(
        `SELECT schemaname,sequencename,sequenceowner,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value FROM pg_sequences WHERE schemaname IN ('public','staging','quarantine','_migration') ORDER BY schemaname,sequencename`,
      )
    ).rows;
    // Catalog digest includes definitions and effective role/ACL metadata,
    // but never pg_authid or credential hashes.
    const catalog = [];
    for (const query of [
      `SELECT n.nspname,c.relname,c.relkind,c.relowner,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','staging','quarantine','_migration') ORDER BY 1,2`,
      `SELECT n.nspname,p.proname,p.proacl,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','_migration') AND p.prokind='f' ORDER BY 1,2,p.oid`,
      `SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal ORDER BY 1,2,3`,
      `SELECT n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl,pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname IN ('public','staging','quarantine','_migration') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,a.attnum`,
      `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_roles ORDER BY rolname`,
      `SELECT * FROM pg_auth_members ORDER BY roleid,member,grantor`,
      `SELECT datname,datacl FROM pg_database ORDER BY datname`,
    ])
      catalog.push((await db.query(query)).rows);
    const hash = (value: unknown) =>
      createHash('sha256').update(JSON.stringify(value)).digest('hex');
    return {
      tables: rows,
      tableDigest: hash(rows),
      sequenceDigest: hash(sequences),
      catalogDigest: hash(catalog),
    };
  } finally {
    await db.query('ROLLBACK');
  }
}
