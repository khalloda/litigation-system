import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import { MATTER_EDIT_TABLES } from './matter-edit-checkpoint';

/** Exact named catalog delta on one identified disposable cluster. No secrets. */
export async function matterMigrationCatalog(db: ClientBase) {
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const [kind, sql] of Object.entries({
    functions:
      "SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' identity,pg_get_functiondef(p.oid) definition,p.proacl::text acl,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','_migration') AND p.prokind='f' ORDER BY 1",
    columns:
      "SELECT table_schema||'.'||table_name||'.'||column_name identity,data_type,udt_schema,udt_name,is_nullable,column_default,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema IN ('public','staging','quarantine','_migration') ORDER BY 1",
    constraints:
      "SELECT n.nspname||'.'||c.relname||'.'||x.conname identity,pg_get_constraintdef(x.oid) definition,x.convalidated,x.condeferrable,x.condeferred FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','staging','quarantine','_migration') ORDER BY 1",
    indexes:
      "SELECT schemaname||'.'||indexname identity,indexdef definition FROM pg_indexes WHERE schemaname IN ('public','staging','quarantine','_migration') ORDER BY 1",
    triggers:
      "SELECT n.nspname||'.'||c.relname||'.'||t.tgname identity,pg_get_triggerdef(t.oid) definition,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','staging','quarantine','_migration') AND NOT t.tgisinternal ORDER BY 1",
    relations:
      "SELECT n.nspname||'.'||c.relname identity,c.relkind,pg_get_userbyid(c.relowner) owner,c.relacl::text acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','staging','quarantine','_migration') AND c.relkind IN ('r','v','S') ORDER BY 1",
    roles:
      'SELECT rolname identity,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_roles ORDER BY 1',
    memberships:
      "SELECT roleid::text||':'||member::text identity,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY 1",
  }))
    result[kind] = (await db.query(sql)).rows;
  result.sequences = [];
  for (const row of (
    await db.query(
      "SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname IN ('public','staging','quarantine','_migration') ORDER BY 1,2",
    )
  ).rows) {
    assert.match(row.schemaname, /^[a-z_]+$/u);
    assert.match(row.sequencename, /^[a-z0-9_]+$/u);
    result.sequences.push({
      identity: row.schemaname + '.' + row.sequencename,
      ...(
        await db.query(
          `SELECT last_value::text,log_cnt::text,is_called FROM "${row.schemaname}"."${row.sequencename}"`,
        )
      ).rows[0],
    });
  }
  return result;
}
export function assertMatterMigrationDelta(
  before: Awaited<ReturnType<typeof matterMigrationCatalog>>,
  after: Awaited<ReturnType<typeof matterMigrationCatalog>>,
) {
  const delta: Record<string, unknown> = {};
  for (const kind of Object.keys(before)) {
    const old = new Map(before[kind]!.map((r) => [r.identity, r]));
    const now = new Map(after[kind]!.map((r) => [r.identity, r]));
    const added = after[kind]!.filter((r) => !old.has(r.identity));
    const removed = before[kind]!.filter((r) => !now.has(r.identity));
    const changed = after[kind]!.filter(
      (r) => old.has(r.identity) && JSON.stringify(r) !== JSON.stringify(old.get(r.identity)),
    ).map((r) => ({ before: old.get(r.identity), after: r }));
    assert.deepEqual(removed, [], kind + ' original catalog objects removed');
    for (const row of added) {
      const identity = String(row.identity);
      const approved =
        identity.startsWith('_migration.matter_edit_') ||
        identity.startsWith('public.matter_edit_') ||
        (kind === 'columns' &&
          [
            'public.matters.row_version',
            ...MATTER_EDIT_TABLES.slice(1).map((t) => 'public.' + t + '.is_retired'),
          ].includes(identity)) ||
        (kind === 'constraints' &&
          [
            'public.matters.matters_row_version_check',
            'public.matter_party_roles.matter_party_roles_party_ordinal_key',
          ].includes(identity)) ||
        (kind === 'constraints' &&
          MATTER_EDIT_TABLES.some((t) => identity === 'public.' + t + '.matter_edit_complete')) ||
        (kind === 'triggers' &&
          MATTER_EDIT_TABLES.some((t) =>
            ['zz_matter_edit_guard', 'matter_edit_no_truncate', 'matter_edit_complete'].some(
              (g) => identity === 'public.' + t + '.' + g,
            ),
          ));
      assert.ok(approved, kind + ' unexpected new object ' + identity);
    }
    for (const row of changed)
      assert.ok(
        (kind === 'indexes' &&
          row.after.identity === 'public.matter_lawyers_one_lead_per_matter') ||
          (kind === 'relations' &&
            MATTER_EDIT_TABLES.some(
              (t) =>
                row.after.identity === 'public.' + t ||
                row.after.identity === 'public.' + t + '_id_seq',
            )),
        kind + ' unexpected altered object ' + String(row.after.identity),
      );
    delta[kind] = { added, removed, changed };
  }
  assert.deepEqual(
    after.sequences,
    before.sequences,
    'Every full disposable sequence value remains unchanged by migration',
  );
  return delta;
}
