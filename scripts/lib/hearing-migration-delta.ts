import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import { matterMigrationCatalog } from './matter-migration-delta';
import { HEARING_EDIT_TABLES } from './hearing-edit-checkpoint';
export { matterMigrationCatalog as hearingMigrationCatalog };
export function assertHearingMigrationDelta(
  before: Awaited<ReturnType<typeof matterMigrationCatalog>>,
  after: Awaited<ReturnType<typeof matterMigrationCatalog>>,
) {
  const delta: Record<string, unknown> = {};
  for (const kind of Object.keys(before)) {
    const old = new Map(before[kind]!.map((r) => [r.identity, r])),
      now = new Map(after[kind]!.map((r) => [r.identity, r]));
    const added = after[kind]!.filter((r) => !old.has(r.identity)),
      removed = before[kind]!.filter((r) => !now.has(r.identity)),
      changed = after[kind]!.filter(
        (r) => old.has(r.identity) && JSON.stringify(r) !== JSON.stringify(old.get(r.identity)),
      ).map((r) => ({ before: old.get(r.identity), after: r }));
    assert.deepEqual(removed, [], kind + ' removed existing objects');
    for (const r of added) {
      const id = String(r.identity);
      assert.ok(
        id.startsWith('_migration.hearing_edit_') ||
          id.startsWith('public.hearing_edit_') ||
          (kind === 'columns' &&
            [
              'public.hearings.row_version',
              'public.hearing_attendees.is_retired',
              'public.hearing_attendees.current_order',
            ].includes(id)) ||
          (kind === 'constraints' &&
            [
              'public.hearings.hearings_row_version_check',
              'public.hearing_attendees.hearing_attendees_current_order_check',
              ...HEARING_EDIT_TABLES.map((t) => 'public.' + t + '.hearing_edit_complete'),
            ].includes(id)) ||
          (kind === 'indexes' && id === 'public.hearing_attendees_current_order_idx') ||
          (kind === 'triggers' &&
            HEARING_EDIT_TABLES.some((t) =>
              ['zz_hearing_edit_guard', 'hearing_edit_no_truncate', 'hearing_edit_complete'].some(
                (g) => id === 'public.' + t + '.' + g,
              ),
            )),
        kind + ' unexpected addition ' + id,
      );
    }
    for (const r of changed)
      assert.ok(
        kind === 'relations' &&
          HEARING_EDIT_TABLES.some(
            (t) =>
              r.after.identity === 'public.' + t || r.after.identity === 'public.' + t + '_id_seq',
          ),
        kind + ' unexpected alteration ' + r.after.identity,
      );
    delta[kind] = { added, removed, changed };
  }
  assert.deepEqual(
    after.sequences,
    before.sequences,
    'Migration preserves every full sequence state',
  );
  return delta;
}
export async function hearingOriginalProjection(db: ClientBase) {
  const tables = (
    await db.query(
      "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('public','staging','quarantine','_migration') AND tablename NOT LIKE 'hearing_edit_%' ORDER BY 1,2",
    )
  ).rows;
  const rows = [];
  for (const { schemaname: schema, tablename: table } of tables) {
    const quote = (v: string) => '"' + v.replaceAll('"', '""') + '"';
    const subtract =
      table === 'hearings'
        ? "-'row_version'"
        : table === 'hearing_attendees'
          ? "-'is_retired'-'current_order'"
          : '';
    const filter =
      table === '_prisma_migrations'
        ? "WHERE migration_name<>'20260913120000_hearing_editing_boundary'"
        : table === 'audit_event_fields'
          ? "WHERE NOT(entity_schema='public' AND ((entity_table='hearings' AND field_name='row_version') OR (entity_table='hearing_attendees' AND field_name IN('is_retired','current_order'))))"
          : '';
    rows.push({
      schema,
      table,
      ...(
        await db.query(
          `SELECT count(*)::int count,encode(sha256(convert_to(coalesce(string_agg(payload,chr(10) ORDER BY payload COLLATE "C"),''),'UTF8')),'hex') digest FROM(SELECT (to_jsonb(t)${subtract})::text payload FROM ${quote(schema)}.${quote(table)} t ${filter})q`,
        )
      ).rows[0],
    });
  }
  return rows;
}
