import { createHash } from 'node:crypto';
import type { ClientBase } from 'pg';
import equivalentConstraints from '../baselines/client-logo-copy-constraint-forms.json';

/** Compare logical catalog identities between different clusters. Object OIDs,
 * generated fixture credentials and sequence WAL reservation counters are not
 * portable pg_dump state. The project preservation receipt retains those too. */
export async function clientLogoFixtureState(db: ClientBase) {
  const state: Record<string, unknown> = {};
  const scope = "n.nspname IN ('public','staging','quarantine','_migration')";
  const queries = {
    relations: `SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) owner,ARRAY(SELECT a::text FROM unnest(coalesce(c.relacl,acldefault((CASE WHEN c.relkind='S' THEN 's' ELSE 'r' END)::"char",c.relowner))) a ORDER BY a::text) effective_acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} ORDER BY 1,2`,
    columns: `SELECT n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl,pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE ${scope} AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,a.attnum`,
    constraints: `SELECT n.nspname,c.relname,x.conname,pg_get_constraintdef(x.oid),x.convalidated,x.condeferrable,x.condeferred FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} ORDER BY 1,2,3`,
    functions: `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proacl,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${scope} AND p.prokind='f' ORDER BY 1,2,3`,
    triggers: `SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND NOT t.tgisinternal ORDER BY 1,2,3`,
    indexes: `SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','staging','quarantine','_migration') ORDER BY 1,2,3`,
    roles: `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_roles ORDER BY rolname`,
    members: `SELECT pg_get_userbyid(roleid) role,pg_get_userbyid(member) member,pg_get_userbyid(grantor) grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY 1,2,3`,
    databaseAccess: `SELECT datname,datacl FROM pg_database ORDER BY datname`,
  };
  for (const [key, query] of Object.entries(queries)) {
    const rows = (await db.query(query)).rows;
    if (key === 'constraints')
      for (const row of rows) {
        // Only these three reviewed pg_dump reparsing equivalents: associative
        // AND/OR grouping and element-wise varchar-to-text array casting.
        // Every other byte and every enforcement attribute still compares exactly.
        const equivalent = equivalentConstraints.find(
          (e) => JSON.stringify(e.source) === JSON.stringify(row),
        );
        if (equivalent) Object.assign(row, equivalent.copy);
      }
    state[key] = ['relations', 'constraints'].includes(key)
      ? rows
      : createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  const sequences = [];
  for (const row of (
    await db.query(
      "SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname IN ('public','staging','quarantine','_migration') ORDER BY 1,2",
    )
  ).rows) {
    const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
    sequences.push({
      ...row,
      ...(
        await db.query(
          `SELECT last_value::text,is_called FROM ${quote(row.schemaname)}.${quote(row.sequencename)}`,
        )
      ).rows[0],
    });
  }
  state.sequences = sequences;
  return state;
}
