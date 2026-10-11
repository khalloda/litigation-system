import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import type { Row } from './task69-contract';
const tables = ['lookup_party_role', 'lookup_court', 'lookup_matter_destination'] as const;
/** The original transform must see its original vocabulary. Newly approved
 * exact source labels must not retroactively transform a quarantined row or
 * change the original crosswalk. This is a read-only receipt-derived projection,
 * used only by historical checks, never application queries or the runner. */
export function historicalTask69LookupSql(sql: string, applied: boolean) {
  if (!applied) return sql;
  const used = new Set<string>();
  const replaced = sql.replace(
    /\b(FROM|JOIN)\s+(?:(?:public|"public")\.)?"?(lookup_party_role|lookup_court|lookup_matter_destination)"?(?=[\s),;]|$)/giu,
    (_all, verb: string, table: string) => {
      used.add(table);
      return `${verb} ${table}`;
    },
  );
  if (!used.size) return sql;
  const ctes = [...used]
    .map((table) => {
      assert(tables.includes(table as (typeof tables)[number]));
      assert(
        !new RegExp('\\b' + table + '\\s+AS\\s*\\(', 'iu').test(sql),
        'Historical lookup CTE name collision',
      );
      return `${table} AS (SELECT historical.* FROM public.${table} current_row LEFT JOIN LATERAL (SELECT d.receipt_id,d.before_values FROM _migration.task69_delta d JOIN _migration.task69_receipt r USING(receipt_id) WHERE d.entity_schema='public' AND d.entity_table='${table}' AND d.entity_key=jsonb_build_object('id',current_row.id) ORDER BY d.audit_event_id LIMIT 1) origin ON true CROSS JOIN LATERAL jsonb_populate_record(NULL::public.${table},coalesce(origin.before_values,to_jsonb(current_row))) historical WHERE origin.receipt_id IS NULL OR origin.before_values IS NOT NULL)`;
    })
    .join(',');
  const prefix =
    /^(\s*(?:(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*)(WITH(?:\s+RECURSIVE)?\s+|SELECT\b)/iu;
  assert(prefix.test(replaced), 'Historical lookup projection accepts SELECT only');
  return replaced.replace(
    prefix,
    (_all, comments: string, leader: string) =>
      `${comments}${/^WITH/iu.test(leader) ? leader + ctes + ',' : 'WITH ' + ctes + ' ' + leader}`,
  );
}
export function historicalTask69LookupClient(db: ClientBase, applied: boolean): ClientBase {
  return applied
    ? ({
        query: (sql: string, values?: unknown[]) =>
          db.query(historicalTask69LookupSql(sql, true), values),
      } as ClientBase)
    : db;
}
export async function task69OriginalLookups(db: ClientBase, applied: boolean) {
  const result = {} as Record<(typeof tables)[number], Row[]>;
  for (const table of tables)
    result[table] = (
      await db.query(
        historicalTask69LookupSql(
          `SELECT to_jsonb(t) value FROM public.${table} t ORDER BY id`,
          applied,
        ),
      )
    ).rows.map((r) => r.value);
  return result;
}
/** Excluding a restored lookup from a frozen count is permitted only when its
 * entire current row equals the latest truthful operation delta. No arbitrary
 * extra lookup or later unreceipted edit is hidden by the historical oracle. */
export async function assertTask69LookupPostimages(db: ClientBase) {
  for (const table of tables) {
    const invalid = (
      await db.query(
        `SELECT d.entity_key FROM (SELECT DISTINCT ON(d.entity_key) d.* FROM _migration.task69_delta d WHERE d.entity_schema='public' AND d.entity_table=$1 ORDER BY d.entity_key,d.audit_event_id DESC) d LEFT JOIN public.${table} t ON t.id=(d.entity_key->>'id')::integer WHERE to_jsonb(t) IS DISTINCT FROM d.after_values OR _migration.task69_receipt_valid(d.receipt_id) IS NOT TRUE OR _migration.task69_lookup_receipt_valid(d.receipt_id) IS NOT TRUE`,
        [table],
      )
    ).rows;
    assert.deepEqual(
      invalid,
      [],
      `${table}: current approved lookup differs from complete receipt`,
    );
  }
}
