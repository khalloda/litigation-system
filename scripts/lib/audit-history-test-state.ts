import 'dotenv/config';
import { createHash } from 'node:crypto';
import { withApprovedMigrationClient } from './migration-principal';

const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const q = (x: string) => '"' + x.replaceAll('"', '""') + '"';
export async function capture(databaseUrl?: string, priorAuditIds?: string[]) {
  return withApprovedMigrationClient(
    async (db) => {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL TIME ZONE 'UTC'");
      const identity = (
        await db.query(`SELECT current_database() database,session_user,current_user,
      inet_server_addr()::text address,inet_server_port() port,current_setting('server_version') version,
      (SELECT system_identifier::text FROM pg_control_system()) cluster`)
      ).rows[0];
      const names = (
        await db.query(`SELECT schemaname schema,tablename name FROM pg_tables
      WHERE schemaname !~ '^pg_' AND schemaname<>'information_schema' ORDER BY 1,2`)
      ).rows;
      const tables = [];
      for (const table of names) {
        const columns = (
          await db.query(
            `SELECT attname name FROM pg_attribute WHERE attrelid=$1::regclass
        AND attnum>0 AND NOT attisdropped ORDER BY attnum`,
            [`${q(table.schema)}.${q(table.name)}`],
          )
        ).rows.map((r) => r.name);
        const digest = (
          await db.query(`SELECT count(*)::int count,
        encode(sha256(convert_to(coalesce(string_agg(payload,E'\n' ORDER BY payload COLLATE "C"),''),'UTF8')),'hex') sha256
        FROM (SELECT to_jsonb(t)::text payload FROM ${q(table.schema)}.${q(table.name)} t) s`)
        ).rows[0];
        const columnDigests = (
          await db.query(`SELECT ${columns.map((c: string) => `encode(sha256(convert_to(coalesce(string_agg(coalesce(to_jsonb(t.${q(c)})::text,'null'),E'\n' ORDER BY coalesce(to_jsonb(t.${q(c)})::text,'null') COLLATE "C"),''),'UTF8')),'hex') AS ${q(c)}`).join(',')}
        FROM ${q(table.schema)}.${q(table.name)} t`)
        ).rows[0];
        tables.push({ ...table, columns, ...digest, columnDigests });
      }
      const definitions = (
        await db.query(`SELECT schemaname schema,sequencename name,sequenceowner owner,data_type,
      start_value::text,min_value::text,max_value::text,increment_by::text,cycle,cache_size::text FROM pg_sequences
      WHERE schemaname !~ '^pg_' AND schemaname<>'information_schema' ORDER BY 1,2`)
      ).rows;
      const sequences = [];
      for (const def of definitions)
        sequences.push({
          ...def,
          ...(
            await db.query(
              `SELECT last_value::text,log_cnt::text,is_called FROM ${q(def.schema)}.${q(def.name)}`,
            )
          ).rows[0],
        });
      const queries = {
        defaultPrivileges: `SELECT pg_get_userbyid(d.defaclrole) role,coalesce(n.nspname,'ALL') schema,d.defaclobjtype,d.defaclacl::text acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 1,2,3`,
        sequenceOwnership: `SELECT n.nspname schema,s.relname sequence,tn.nspname table_schema,t.relname table_name,a.attname column_name,d.deptype FROM pg_class s JOIN pg_namespace n ON n.oid=s.relnamespace LEFT JOIN pg_depend d ON d.objid=s.oid AND d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND d.deptype IN('a','i') LEFT JOIN pg_class t ON t.oid=d.refobjid LEFT JOIN pg_namespace tn ON tn.oid=t.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid WHERE s.relkind='S' AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1,2`,
        namespaces: `SELECT n.nspname name,r.rolname owner,n.nspacl::text raw_acl,n.nspacl IS NULL acl_is_null FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1`,
        schemaGrants: `SELECT n.nspname name,pg_get_userbyid(n.nspowner) owner,pg_get_userbyid(x.grantor) grantor,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END grantee,x.privilege_type,x.is_grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1,3,4,5`,
        relations: `SELECT n.nspname schema,c.relname name,c.relkind,pg_get_userbyid(c.relowner) owner,c.relacl::text raw_acl,c.relacl IS NULL acl_is_null,c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1,2`,
        relationGrants: `SELECT n.nspname schema,c.relname name,c.relkind,pg_get_userbyid(x.grantor) grantor,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END grantee,x.privilege_type,x.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's' ELSE 'r' END::"char",c.relowner))) x WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN('r','p','v','m','S') ORDER BY 1,2,4,5,6`,
        columns: `SELECT n.nspname schema,c.relname relation,a.attname name,a.attnum,format_type(a.atttypid,a.atttypmod) data_type,a.attnotnull,a.attidentity,a.attgenerated,a.attacl::text raw_acl,encode(sha256(convert_to(coalesce(pg_get_expr(d.adbin,d.adrelid),''),'UTF8')),'hex') default_sha256 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,a.attnum`,
        routines: `SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text raw_acl,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition_sha256 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind='f' ORDER BY 1,2,3`,
        triggers: `SELECT n.nspname schema,c.relname relation,t.tgname name,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1,2,3`,
        constraints: `SELECT n.nspname schema,c.relname relation,k.conname name,k.contype,pg_get_constraintdef(k.oid,true) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1,2,3`,
        indexes: `SELECT schemaname schema,tablename relation,indexname name,indexdef definition FROM pg_indexes WHERE schemaname !~ '^pg_' AND schemaname<>'information_schema' ORDER BY 1,2,3`,
        roles: `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolvaliduntil,encode(sha256(convert_to(coalesce(rolpassword,''),'UTF8')),'hex') credential_sha256 FROM pg_authid ORDER BY rolname`,
        memberships: `SELECT pg_get_userbyid(roleid) role,pg_get_userbyid(member) member,pg_get_userbyid(grantor) grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY 1,2,3`,
        databases: `SELECT datname,pg_get_userbyid(datdba) owner,datacl::text raw_acl FROM pg_database ORDER BY datname`,
        settings: `SELECT coalesce(d.datname,'ALL') database,coalesce(r.rolname,'ALL') role,encode(sha256(convert_to(coalesce(s.setconfig::text,''),'UTF8')),'hex') configuration_sha256 FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase LEFT JOIN pg_roles r ON r.oid=s.setrole ORDER BY 1,2`,
      };
      const catalogs: Record<string, unknown> = {};
      for (const [name, sql] of Object.entries(queries)) {
        const rows = (await db.query(sql)).rows;
        catalogs[name] = { count: rows.length, sha256: hash(rows), rows };
      }
      const ledger = (
        await db.query(
          `SELECT id,migration_name,checksum,started_at,finished_at,rolled_back_at,applied_steps_count,encode(sha256(convert_to(coalesce(logs,''),'UTF8')),'hex') logs_sha256 FROM public._prisma_migrations ORDER BY started_at,id`,
        )
      ).rows;
      const billing = (
        await db.query(
          `SELECT 'invoices' entity,count(*)::int rows FROM public.invoices UNION ALL SELECT 'payments',count(*)::int FROM public.payments UNION ALL SELECT 'allocations',count(*)::int FROM public.invoice_allocations`,
        )
      ).rows;
      const frozen: Record<string, { id: string; sha256: string }[]> = {};
      for (const table of ['audit_events', '_prisma_migrations'])
        frozen[table] = (
          await db.query(
            `SELECT id::text id,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') sha256 FROM public.${table} t ORDER BY id::text COLLATE "C"`,
          )
        ).rows;
      const lookups: Record<string, unknown> = {};
      for (const table of [
        'lookup_invoice_status',
        'lookup_invoice_type',
        'lookup_lawyer_share_role',
      ])
        lookups[table] = (
          await db.query(`SELECT to_jsonb(t) row FROM public.${table} t ORDER BY id`)
        ).rows;
      const counter = (
        await db.query('SELECT to_jsonb(t) row FROM _migration.matter_lifecycle_audit_counter t')
      ).rows;
      const auditAdditions = priorAuditIds
        ? (
            await db.query(
              'SELECT to_jsonb(t) row FROM public.audit_events t WHERE NOT(id::text=ANY($1::text[])) ORDER BY id',
              [priorAuditIds],
            )
          ).rows
        : [];
      await db.query('COMMIT');
      return {
        capturedAt: new Date().toISOString(),
        mode: 'read-only repeatable-read; UTC; full rows and all columns hashed; frozen prior audit/ledger IDs individually hashed; private bodies excluded',
        identity,
        tables,
        sequences,
        catalogs,
        ledger,
        billing,
        frozen,
        lookups,
        counter,
        auditAdditions,
      };
    },
    {
      ...(databaseUrl ? { databaseUrl } : {}),
      clientConfig: {
        application_name: 'task49-preservation-read-only',
        options: '-c default_transaction_read_only=on',
      },
    },
  );
}
