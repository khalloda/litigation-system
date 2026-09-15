import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
/** Exact old-column projections. The only permitted row delta is new archive
 * flags, the new frozen boundary, two field registrations, and ledger69. */
export async function adminLifecycleOldProjection(db: ClientBase) {
  const tables = (
    await db.query(
      "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('public','staging','quarantine','_migration') AND tablename<>'admin_lifecycle_boundary' ORDER BY 1,2",
    )
  ).rows;
  const rows = [];
  for (const { schemaname: s, tablename: t } of tables) {
    const quote = (v: string) => '"' + v.replaceAll('"', '""') + '"';
    const filter =
      t === '_prisma_migrations'
        ? "WHERE migration_name<>'20260915120000_admin_work_archive_restore'"
        : t === 'audit_event_fields'
          ? "WHERE NOT(entity_table IN('admin_tasks','task_actions') AND field_name='is_archived')"
          : '';
    const strip = ['admin_tasks', 'task_actions'].includes(t) ? "-'is_archived'" : '';
    rows.push({
      schema: s,
      table: t,
      ...(
        await db.query(
          `SELECT count(*)::int count,encode(sha256(convert_to(coalesce(string_agg(payload,chr(10) ORDER BY payload COLLATE "C"),''),'UTF8')),'hex') digest FROM(SELECT (to_jsonb(t)${strip})::text payload FROM ${quote(s)}.${quote(t)} t ${filter})q`,
        )
      ).rows[0],
    });
  }
  assert.ok(rows.length > 100);
  return rows;
}
