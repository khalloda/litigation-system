import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import { assertReadOnlyQuery } from './high-impact-review-workbook';
import { applicationDigest, type Fields } from './high-impact-application-plan';

export const APPLICATION_KEY = 'task-3-5b-d39-d40-d41';
export const APPROVED_PLAN_SHA256 =
  '4a1fee01d011b960f48204102e28ed71731a5f1d682006141749460828e33da3';
export const CREATED_TABLES = [
  'lookup_client_branch',
  'lookup_court',
  'matters',
  'hearings',
  'matter_lawyers',
  'matter_parties',
  'matter_party_roles',
  'hearing_attendees',
  'quarantine.matter_relationship_transform',
] as const;
export type CreatedRow = { table: string; key: string; id: number; sha256: string };
export type InventoryRow = { schema: string; table: string; count: number; digest: string };
export type ApplicationState = {
  application_key: string;
  workbook_sha256: string;
  workbook_bytes: number;
  plan_sha256: string;
  created_rows: CreatedRow[];
  before_inventory: InventoryRow[];
  audit_event_ids: string[];
  applied_by: number;
};

export function identifier(value: string): string {
  assert.ok(value.length > 0 && !value.includes('\0'), 'invalid SQL identifier');
  return `"${value.replaceAll('"', '""')}"`;
}
export function tableName(value: string): string {
  const parts = value.split('.');
  return parts.length === 1 ? `public.${identifier(value)}` : parts.map(identifier).join('.');
}
export async function readApplicationState(db: ClientBase): Promise<ApplicationState | null> {
  const exists = (
    await db.query<{ present: boolean }>(
      "SELECT to_regclass('_migration.high_impact_application') IS NOT NULL present",
    )
  ).rows[0]!.present;
  if (!exists) return null;
  const rows = (
    await db.query<ApplicationState>('SELECT * FROM _migration.high_impact_application')
  ).rows;
  assert.ok(rows.length <= 1, 'multiple high-impact batches');
  return rows[0] ?? null;
}

export function assertStateIdentity(state: ApplicationState): void {
  assert.equal(state.application_key, APPLICATION_KEY);
  assert.equal(state.plan_sha256, APPROVED_PLAN_SHA256, 'tampered application plan identity');
  assert.equal(state.created_rows.length, 841, 'partial created-row ledger');
  assert.equal(
    new Set(state.created_rows.map((row) => `${row.table}:${row.id}`)).size,
    841,
    'duplicate created-row ledger identity',
  );
  for (const row of state.created_rows) {
    assert.ok((CREATED_TABLES as readonly string[]).includes(row.table), 'unapproved ledger table');
    assert.ok(Number.isSafeInteger(row.id) && row.id > 0, 'invalid created-row identity');
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(state.audit_event_ids.length, 808);
  assert.equal(new Set(state.audit_event_ids).size, 808, 'duplicate event ledger identity');
  assert.equal(state.applied_by, 1, 'incorrect application actor');
}

/** Explicit historical partition for the frozen Stage 2/Task 3.3 checkpoints.
 * Only the exact recorded created IDs are excluded. The current release is
 * separately rebuilt and checked; this must never be used by a writer or UI. */
export function historicalHighImpactSql(sql: string, state: ApplicationState | null): string {
  if (state === null) return sql;
  assertStateIdentity(state);
  assertReadOnlyQuery(sql, 'historical checkpoint query');
  let result = sql;
  for (const table of CREATED_TABLES) {
    const ids = state.created_rows.filter((row) => row.table === table).map((row) => row.id);
    if (ids.length === 0) continue;
    const qualified = table.includes('.') ? table.replace('.', '\\.') : `(?:public\\.)?${table}`;
    // Exact FROM/JOIN table tokens only: not column names, catalog strings or arbitrary identifiers.
    const pattern = new RegExp(`\\b(FROM|JOIN)\\s+${qualified}\\b`, 'gi');
    result = result.replace(
      pattern,
      (_, keyword: string) =>
        `${keyword} (SELECT * FROM ${tableName(table)} WHERE id NOT IN (${ids.join(',')}))`,
    );
  }
  return result;
}
export function historicalHighImpactClient(
  db: ClientBase,
  state: ApplicationState | null,
): ClientBase {
  if (state === null) return db;
  return {
    query: (sql: string, values?: unknown[]) => {
      assert.equal(typeof sql, 'string', 'historical checks require explicit SQL');
      return db.query(historicalHighImpactSql(sql, state), values);
    },
  } as ClientBase;
}

export async function applicationInventory(
  db: ClientBase,
  state: ApplicationState | null = null,
): Promise<InventoryRow[]> {
  const tables = (
    await db.query<{ schemaname: string; tablename: string }>(
      `SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','staging','quarantine','_migration')
     AND tablename NOT IN ('high_impact_application','high_impact_resolution') ORDER BY schemaname,tablename`,
    )
  ).rows;
  const result: InventoryRow[] = [];
  for (const { schemaname: schema, tablename: table } of tables) {
    const key = schema === 'public' ? table : `${schema}.${table}`;
    const ids = state?.created_rows.filter((row) => row.table === key).map((row) => row.id) ?? [];
    let filter = ids.length === 0 ? '' : `WHERE id <> ALL($1::integer[])`;
    let parameters: unknown[] = ids.length === 0 ? [] : [ids];
    if (state && key === 'audit_events') {
      filter = 'WHERE id <> ALL($1::bigint[])';
      parameters = [state.audit_event_ids];
    }
    if (state && key === '_migration.client_branch_compatibility') {
      filter = "WHERE authority <> 'D39'";
      parameters = [];
    }
    const row = (
      await db.query<{ count: number; digest: string }>(
        `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(payload,E'\\n' ORDER BY payload COLLATE "C"),''),'UTF8')),'hex') digest
       FROM (SELECT to_jsonb(t)::text payload FROM ${identifier(schema)}.${identifier(table)} t ${filter}) x`,
        parameters,
      )
    ).rows[0]!;
    result.push({ schema, table, ...row });
  }
  return result;
}

/** Compare every requested field using the database's native column types. */
export async function assertProjectedRow(
  db: ClientBase,
  table: string,
  id: number,
  fields: Fields,
): Promise<void> {
  assert.ok((CREATED_TABLES as readonly string[]).includes(table));
  const columns = Object.keys(fields);
  const comparisons = columns
    .map((key) => `actual.${identifier(key)} IS NOT DISTINCT FROM expected.${identifier(key)}`)
    .join(' AND ');
  const result = await db.query<{ matches: boolean }>(
    `SELECT (${comparisons}) matches FROM ${tableName(table)} actual,
     jsonb_populate_record(NULL::${tableName(table)},$1::jsonb) expected WHERE actual.id=$2`,
    [JSON.stringify(fields), id],
  );
  assert.equal(result.rowCount, 1, `missing/duplicate applied ${table}`);
  assert.equal(
    result.rows[0]!.matches,
    true,
    `applied ${table} values differ from approved source plan`,
  );
}

export async function rowDigest(db: ClientBase, table: string, id: number): Promise<string> {
  const rows = (
    await db.query<{ row: Fields }>(
      `SELECT to_jsonb(t) row FROM ${tableName(table)} t WHERE id=$1`,
      [id],
    )
  ).rows;
  assert.equal(rows.length, 1, `missing created ${table}`);
  return applicationDigest(rows[0]!.row);
}
