import { createHash } from 'node:crypto';
import type { ClientBase } from 'pg';

export const AUDITED_TABLES = [
  'admin_tasks',
  'attendance',
  'client_logos',
  'clients',
  'contacts',
  'documents',
  'fee_letter_matters',
  'fee_letters',
  'hearing_attendees',
  'hearings',
  'invoice_allocations',
  'invoices',
  'lookup_client_branch',
  'lookup_court',
  'lookup_degree',
  'lookup_hearing_action',
  'lookup_importance',
  'lookup_invoice_status',
  'lookup_invoice_type',
  'lookup_lawyer_share_role',
  'lookup_matter_category',
  'lookup_matter_destination',
  'lookup_matter_type',
  'lookup_party_role',
  'lookup_team',
  'lookup_venue',
  'matter_fee_letter_references',
  'matter_lawyers',
  'matter_parties',
  'matter_party_roles',
  'matters',
  'payments',
  'people',
  'person_name_alias',
  'power_of_attorney_lawyers',
  'powers_of_attorney',
  'task_actions',
  'user_accounts',
] as const;

export const SYSTEM_AUDIT_ACTORS = [
  {
    id: 1,
    key: 'system_migration',
    label: 'Migration system',
    purpose: 'Migration, import, seed and evidenced backfill activity',
  },
  {
    id: 2,
    key: 'system_authentication',
    label: 'Authentication system',
    purpose: 'Login, lockout and authentication-state activity',
  },
  {
    id: 3,
    key: 'system_administration',
    label: 'Controlled administration',
    purpose: 'Local controlled administration where no human operator identity is proved',
  },
] as const;

export const TASK33A_PROTECTED_AUDIT_EXCLUDED_DIGEST =
  'b50879f52200275e70515cb4e1daa76594c304237a40b864205108e15490aeab';
export const TASK33A_ATTRIBUTION_DIGEST =
  'edf4be9e8668fc65005deaa69cababf79dec1ac1b3e12f2356b9e6da892c009d';

export const RUNTIME_DATABASE_ROLE = 'litigation_runtime';
export const PROJECT_DATABASE_SCHEMAS = ['_migration', 'public', 'quarantine', 'staging'] as const;
export const APPROVED_RUNTIME_SECURITY_DEFINERS = [
  'public.audit_append_semantic_event_for_account(p_action text, p_outcome text, p_entity_schema text, p_entity_table text, p_entity_key jsonb, p_target_user_account_id integer, p_attempted_username text, p_resource_identifier text, p_parameters jsonb, p_reason_code text, p_event_metadata jsonb)',
  'public.audit_current_actor_id()',
  'public.audit_set_event_context(p_request_id uuid, p_correlation_id uuid, p_audit_session_id uuid, p_ip_address inet, p_user_agent text, p_device_class text)',
  'public.audit_set_authentication_context()',
  'public.audit_set_human_context(p_user_account_id integer)',
] as const;

const FUNCTION_DEFINITION_MD5 = new Map([
  ['audit_current_actor_id', 'd84ec5a3e3065721f22f641ddce91b83'],
  ['audit_set_administration_context', 'cbf5acdf79e2c56439f934d5f5397320'],
  ['audit_set_authentication_context', '67507f5cde5dcb13be779811da0df7ca'],
  ['audit_set_human_context', '73feabf98fa0384b1f0062b9e65e3b60'],
  ['audit_set_migration_context', '2c9cef400046ecf085849d1b7867113a'],
  ['enforce_audit_actor_columns', 'feeb29427e8b432be33609c5246e21e8'],
  ['refuse_audit_actor_identity_change', '9cface3f217d424f3c629b4f68b86d0c'],
]);

const ACTOR_CONSTRAINTS = new Map([
  ['audit_actors_actor_key_key', 'UNIQUE (actor_key)'],
  [
    'audit_actors_identity_shape',
    "CHECK (actor_kind = 'human'::text AND user_account_id IS NOT NULL AND actor_key = ('user_account:'::text || user_account_id::text) AND purpose = 'Authenticated application account'::text OR actor_kind = 'system'::text AND user_account_id IS NULL AND actor_key ~ '^system_[a-z]+(?:_[a-z]+)*$'::text)",
  ],
  ['audit_actors_kind_shape', "CHECK (actor_kind = ANY (ARRAY['human'::text, 'system'::text]))"],
  ['audit_actors_pkey', 'PRIMARY KEY (id)'],
  [
    'audit_actors_text_shape',
    "CHECK (identity_label = btrim(identity_label) AND identity_label <> ''::text AND purpose = btrim(purpose) AND purpose <> ''::text)",
  ],
  [
    'audit_actors_user_account_id_fkey',
    'FOREIGN KEY (user_account_id) REFERENCES user_accounts(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
  ],
  ['audit_actors_user_account_id_key', 'UNIQUE (user_account_id)'],
]);

type ActorRow = {
  id: number;
  actor_key: string;
  actor_kind: string;
  user_account_id: number | null;
  identity_label: string;
  purpose: string;
};

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function auditStructureFailures(db: ClientBase): Promise<string[]> {
  const failures: string[] = [];
  const inventory = await db.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.columns
     WHERE table_schema='public'
     GROUP BY table_name
    HAVING bool_or(column_name='created_at') AND bool_or(column_name='created_by')
       AND bool_or(column_name='updated_at') AND bool_or(column_name='updated_by')
     ORDER BY table_name`);
  if (
    !same(
      inventory.rows.map((row) => row.table_name),
      AUDITED_TABLES,
    )
  ) {
    failures.push('audited application-table inventory is not the exact approved 38');
  }

  const columns = await db.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `
    SELECT table_name,column_name,data_type,is_nullable,column_default
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name=ANY($1::text[])
       AND column_name IN ('created_at','created_by','updated_at','updated_by')
     ORDER BY table_name,column_name`,
    [AUDITED_TABLES],
  );
  for (const table of AUDITED_TABLES) {
    const rows = columns.rows.filter((row) => row.table_name === table);
    if (rows.length !== 4) {
      failures.push(`${table}: audit quartet is incomplete`);
      continue;
    }
    for (const actorColumn of ['created_by', 'updated_by'] as const) {
      const row = rows.find((candidate) => candidate.column_name === actorColumn);
      const nullable = table === 'user_accounts' && actorColumn === 'updated_by' ? 'YES' : 'NO';
      if (
        !row ||
        row.data_type !== 'integer' ||
        row.is_nullable !== nullable ||
        row.column_default !== 'audit_current_actor_id()'
      ) {
        failures.push(`${table}.${actorColumn}: type/nullability/default differs`);
      }
    }
    for (const timeColumn of ['created_at', 'updated_at'] as const) {
      const row = rows.find((candidate) => candidate.column_name === timeColumn);
      if (!row || row.data_type !== 'timestamp with time zone' || row.is_nullable !== 'NO') {
        failures.push(`${table}.${timeColumn}: timestamp definition differs`);
      }
    }
  }

  const relations = await db.query<{
    table_name: string;
    constraint_name: string;
    source_column: string;
    target_table: string;
    target_column: string;
    update_action: string;
    delete_action: string;
    validated: boolean;
  }>(
    `
    SELECT r.relname table_name,c.conname constraint_name,a.attname source_column,
           tr.relname target_table,ta.attname target_column,
           c.confupdtype::text update_action,c.confdeltype::text delete_action,
           c.convalidated validated
      FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
      JOIN pg_class tr ON tr.oid=c.confrelid
      JOIN pg_attribute ta ON ta.attrelid=c.confrelid AND ta.attnum=c.confkey[1]
     WHERE n.nspname='public' AND r.relname=ANY($1::text[]) AND c.contype='f'
       AND a.attname IN ('created_by','updated_by')
     ORDER BY r.relname,a.attname`,
    [AUDITED_TABLES],
  );
  if (relations.rows.length !== 76)
    failures.push(`actor foreign-key count is ${relations.rows.length}/76`);
  for (const table of AUDITED_TABLES) {
    for (const column of ['created_by', 'updated_by'] as const) {
      const row = relations.rows.find(
        (candidate) => candidate.table_name === table && candidate.source_column === column,
      );
      if (
        !row ||
        row.constraint_name !== `${table}_${column}_fkey` ||
        row.target_table !== 'audit_actors' ||
        row.target_column !== 'id' ||
        row.update_action !== 'r' ||
        row.delete_action !== 'r' ||
        !row.validated
      ) {
        failures.push(`${table}.${column}: actor foreign key/actions differ`);
      }
    }
  }

  const indexes = await db.query<{ table_name: string; index_name: string; column_name: string }>(
    `
    SELECT t.relname table_name,i.relname index_name,
           pg_get_indexdef(x.indexrelid,1,true) column_name
      FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class i ON i.oid=x.indexrelid
     WHERE n.nspname='public' AND t.relname=ANY($1::text[])
       AND i.relname ~ '_(created|updated)_by_idx$'
       AND x.indisvalid AND x.indisready AND x.indnkeyatts=1
     ORDER BY t.relname,i.relname`,
    [AUDITED_TABLES],
  );
  if (indexes.rows.length !== 76) failures.push(`actor index count is ${indexes.rows.length}/76`);
  for (const table of AUDITED_TABLES) {
    for (const column of ['created_by', 'updated_by'] as const) {
      const row = indexes.rows.find(
        (candidate) => candidate.index_name === `${table}_${column}_idx`,
      );
      if (!row || row.table_name !== table || row.column_name !== column) {
        failures.push(`${table}.${column}: supporting actor index differs`);
      }
    }
  }

  const triggerCount = await db.query<{ count: string }>(
    `
    SELECT count(*)::text count FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname=ANY($1::text[])
      AND t.tgname='audit_actor_columns_guard' AND NOT t.tgisinternal
      AND t.tgenabled='O'
      AND pg_get_triggerdef(t.oid,true)=
          'CREATE TRIGGER audit_actor_columns_guard BEFORE INSERT OR UPDATE ON '||r.relname||
          ' FOR EACH ROW EXECUTE FUNCTION enforce_audit_actor_columns()'`,
    [AUDITED_TABLES],
  );
  if (triggerCount.rows[0]?.count !== '38')
    failures.push('exact enabled audit-trigger count differs');

  const constraints = await db.query<{ name: string; definition: string }>(`
    SELECT conname name,pg_get_constraintdef(oid,true) definition
      FROM pg_constraint WHERE conrelid='public.audit_actors'::regclass ORDER BY conname`);
  if (constraints.rows.length !== ACTOR_CONSTRAINTS.size)
    failures.push('actor constraint inventory differs');
  for (const [name, definition] of ACTOR_CONSTRAINTS) {
    if (!constraints.rows.some((row) => row.name === name && row.definition === definition)) {
      failures.push(`actor constraint ${name} differs`);
    }
  }

  const functions = await db.query<{
    name: string;
    definition_md5: string;
    security_definer: boolean;
    configuration: string[] | null;
  }>(
    `
    SELECT p.proname name,md5(pg_get_functiondef(p.oid)) definition_md5,
           p.prosecdef security_definer,p.proconfig configuration
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=ANY($1::text[]) ORDER BY p.proname`,
    [[...FUNCTION_DEFINITION_MD5.keys()]],
  );
  for (const [name, hash] of FUNCTION_DEFINITION_MD5) {
    const row = functions.rows.find((candidate) => candidate.name === name);
    if (
      !row ||
      row.definition_md5 !== hash ||
      !row.security_definer ||
      !same(row.configuration ?? [], ['search_path=pg_catalog, public'])
    ) {
      failures.push(`audit function ${name} definition/security configuration differs`);
    }
  }

  const actorTriggers = await db.query<{ name: string; enabled: string; definition: string }>(`
    SELECT tgname name,tgenabled::text enabled,pg_get_triggerdef(oid,true) definition
      FROM pg_trigger WHERE tgrelid='public.audit_actors'::regclass AND NOT tgisinternal
     ORDER BY tgname`);
  if (
    actorTriggers.rows.length !== 2 ||
    actorTriggers.rows.some((row) => row.enabled !== 'O') ||
    !actorTriggers.rows.some((row) => row.name === 'audit_actors_no_change') ||
    !actorTriggers.rows.some((row) => row.name === 'audit_actors_no_truncate')
  ) {
    failures.push('actor-registry immutability triggers differ');
  }

  return failures;
}

export async function runtimeRoleBoundaryFailures(
  db: ClientBase,
  roleName = RUNTIME_DATABASE_ROLE,
): Promise<string[]> {
  const failures: string[] = [];
  if (!/^[a-z][a-z0-9_]*$/u.test(roleName)) return ['runtime role name is invalid'];

  const role = await db.query<{
    oid: string;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolinherit: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    rolcanlogin: boolean;
    rolconfig: string[] | null;
  }>(
    `SELECT oid::text,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,
            rolbypassrls,rolcanlogin,rolconfig FROM pg_roles WHERE rolname=$1`,
    [roleName],
  );
  const roleRow = role.rows[0];
  if (
    role.rows.length !== 1 ||
    !roleRow ||
    roleRow.rolsuper ||
    roleRow.rolcreatedb ||
    roleRow.rolcreaterole ||
    roleRow.rolinherit ||
    roleRow.rolreplication ||
    roleRow.rolbypassrls ||
    !roleRow.rolcanlogin
  ) {
    failures.push('restricted runtime role attributes differ');
    if (!roleRow) return failures;
  }

  const memberships = await db.query<{ chain: string }>(
    `WITH RECURSIVE paths(roleid,chain,visited) AS (
       SELECT m.roleid,ARRAY[member.rolname,granted.rolname]::text[],
              ARRAY[m.member,m.roleid]::oid[]
         FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member
         JOIN pg_roles granted ON granted.oid=m.roleid
        WHERE member.rolname=$1
       UNION ALL
       SELECT m.roleid,p.chain||granted.rolname,p.visited||m.roleid
         FROM paths p JOIN pg_auth_members m ON m.member=p.roleid
         JOIN pg_roles granted ON granted.oid=m.roleid
        WHERE NOT m.roleid=ANY(p.visited)
     ) SELECT array_to_string(chain,' -> ') chain FROM paths ORDER BY chain::text`,
    [roleName],
  );
  if (memberships.rows.length > 0) {
    failures.push(
      `runtime role has direct/indirect memberships: ${memberships.rows
        .map((row) => row.chain)
        .join(', ')}`,
    );
  }

  const settableRoles = await db.query<{ role_name: string }>(
    `SELECT rolname role_name FROM pg_roles
      WHERE rolname<>$1 AND pg_has_role($1,oid,'SET') ORDER BY rolname`,
    [roleName],
  );
  if (settableRoles.rows.length > 0) {
    failures.push(
      `runtime can SET ROLE to: ${settableRoles.rows.map((row) => row.role_name).join(', ')}`,
    );
  }

  const explicitInboundMemberships = await db.query<{
    member_name: string;
    grantor_name: string;
    admin_option: boolean;
    inherit_option: boolean;
    set_option: boolean;
  }>(
    `SELECT member.rolname member_name,grantor.rolname grantor_name,
            membership.admin_option,membership.inherit_option,membership.set_option
       FROM pg_auth_members membership
       JOIN pg_roles granted ON granted.oid=membership.roleid
       JOIN pg_roles member ON member.oid=membership.member
       JOIN pg_roles grantor ON grantor.oid=membership.grantor
      WHERE granted.rolname=$1
      ORDER BY member.rolname,grantor.rolname`,
    [roleName],
  );
  if (explicitInboundMemberships.rows.length > 0) {
    failures.push(
      `runtime role has explicit inbound memberships: ${explicitInboundMemberships.rows
        .map(
          (row) =>
            `${row.member_name}[grantor=${row.grantor_name},admin=${String(row.admin_option)},inherit=${String(row.inherit_option)},set=${String(row.set_option)}]`,
        )
        .join(', ')}`,
    );
  }

  const inboundMemberships = await db.query<{
    role_name: string;
    inherits_runtime: boolean;
    can_set_runtime: boolean;
  }>(
    `SELECT rolname role_name,
            pg_has_role(oid,(SELECT oid FROM pg_roles WHERE rolname=$1),'USAGE') inherits_runtime,
            pg_has_role(oid,(SELECT oid FROM pg_roles WHERE rolname=$1),'SET') can_set_runtime
       FROM pg_roles
      WHERE rolname<>$1 AND NOT rolsuper
        AND (pg_has_role(oid,(SELECT oid FROM pg_roles WHERE rolname=$1),'USAGE')
          OR pg_has_role(oid,(SELECT oid FROM pg_roles WHERE rolname=$1),'SET'))
      ORDER BY rolname`,
    [roleName],
  );
  if (inboundMemberships.rows.length > 0) {
    failures.push(
      `non-superuser roles can inherit or assume runtime: ${inboundMemberships.rows
        .map(
          (row) =>
            `${row.role_name}[inherit=${String(row.inherits_runtime)},set=${String(row.can_set_runtime)}]`,
        )
        .join(', ')}`,
    );
  }

  if ((roleRow?.rolconfig?.length ?? 0) > 0) failures.push('runtime role-level settings differ');
  const databaseSettings = await db.query<{ database_name: string; settings: string[] }>(
    `SELECT coalesce(d.datname,'all databases') database_name,s.setconfig settings
       FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase
      WHERE s.setrole=(SELECT oid FROM pg_roles WHERE rolname=$1)
      ORDER BY database_name`,
    [roleName],
  );
  if (databaseSettings.rows.length > 0) failures.push('runtime database-specific settings differ');

  const ownership = await db.query<{
    databases: string;
    schemas: string;
    relations: string;
    functions: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM pg_database WHERE datdba=r.oid) databases,
       (SELECT count(*)::text FROM pg_namespace WHERE nspowner=r.oid) schemas,
       (SELECT count(*)::text FROM pg_class WHERE relowner=r.oid) relations,
       (SELECT count(*)::text FROM pg_proc WHERE proowner=r.oid) functions
       FROM pg_roles r WHERE r.rolname=$1`,
    [roleName],
  );
  const owned = ownership.rows[0];
  if (
    !owned ||
    owned.databases !== '0' ||
    owned.schemas !== '0' ||
    owned.relations !== '0' ||
    owned.functions !== '0'
  ) {
    failures.push('runtime owns a database, schema, relation, sequence or function');
  }

  const databasePrivileges = await db.query<{
    connect_ok: boolean;
    create_ok: boolean;
    temporary_ok: boolean;
  }>(
    `SELECT has_database_privilege($1,current_database(),'CONNECT') connect_ok,
            has_database_privilege($1,current_database(),'CREATE') create_ok,
            has_database_privilege($1,current_database(),'TEMPORARY') temporary_ok`,
    [roleName],
  );
  const databaseGrant = databasePrivileges.rows[0];
  if (
    !databaseGrant ||
    !databaseGrant.connect_ok ||
    databaseGrant.create_ok ||
    databaseGrant.temporary_ok
  ) {
    failures.push('runtime database CONNECT/CREATE/TEMPORARY boundary differs');
  }

  const projectSchemaInventory = await db.query<{ schema_name: string }>(`
    SELECT nspname schema_name FROM pg_namespace
     WHERE left(nspname,3)<>'pg_' AND nspname<>'information_schema'
     ORDER BY nspname`);
  if (
    !same(
      projectSchemaInventory.rows.map((row) => row.schema_name),
      [...PROJECT_DATABASE_SCHEMAS],
    )
  ) {
    failures.push(
      `project schema inventory differs: ${projectSchemaInventory.rows
        .map((row) => row.schema_name)
        .join(', ')}`,
    );
  }

  const schemas = await db.query<{
    schema_name: string;
    usage_ok: boolean;
    create_ok: boolean;
  }>(
    `SELECT nspname schema_name,has_schema_privilege($1,oid,'USAGE') usage_ok,
            has_schema_privilege($1,oid,'CREATE') create_ok
       FROM pg_namespace WHERE nspname=ANY($2::text[]) ORDER BY nspname`,
    [roleName, PROJECT_DATABASE_SCHEMAS],
  );
  if (
    schemas.rows.length !== PROJECT_DATABASE_SCHEMAS.length ||
    schemas.rows.some(
      (row) => row.create_ok || (row.schema_name === 'public' ? !row.usage_ok : row.usage_ok),
    )
  ) {
    failures.push('runtime exact project-schema boundary differs');
  }

  const relations = await db.query<{
    schema_name: string;
    relation_name: string;
    select_ok: boolean;
    insert_ok: boolean;
    update_ok: boolean;
    delete_ok: boolean;
    truncate_ok: boolean;
    references_ok: boolean;
    trigger_ok: boolean;
    maintain_ok: boolean;
  }>(
    `SELECT n.nspname schema_name,c.relname relation_name,
            has_table_privilege($1,c.oid,'SELECT') select_ok,
            has_table_privilege($1,c.oid,'INSERT') insert_ok,
            has_table_privilege($1,c.oid,'UPDATE') update_ok,
            has_table_privilege($1,c.oid,'DELETE') delete_ok,
            has_table_privilege($1,c.oid,'TRUNCATE') truncate_ok,
            has_table_privilege($1,c.oid,'REFERENCES') references_ok,
            has_table_privilege($1,c.oid,'TRIGGER') trigger_ok,
            has_table_privilege($1,c.oid,'MAINTAIN') maintain_ok
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=ANY($2::text[]) AND c.relkind IN ('r','p','v','m','f')
      ORDER BY n.nspname,c.relname`,
    [roleName, PROJECT_DATABASE_SCHEMAS],
  );
  for (const row of relations.rows) {
    const approved =
      row.schema_name === 'public' && AUDITED_TABLES.includes(row.relation_name as never);
    if (
      row.select_ok !== approved ||
      row.insert_ok !== approved ||
      row.update_ok !== approved ||
      row.delete_ok ||
      row.truncate_ok ||
      row.references_ok ||
      row.trigger_ok ||
      row.maintain_ok
    ) {
      failures.push(`${row.schema_name}.${row.relation_name}: runtime relation grants differ`);
    }
  }
  const approvedRelationCount = relations.rows.filter(
    (row) => row.schema_name === 'public' && AUDITED_TABLES.includes(row.relation_name as never),
  ).length;
  if (approvedRelationCount !== AUDITED_TABLES.length)
    failures.push(`runtime approved relation inventory is ${approvedRelationCount}/38`);

  const relationAcls = await db.query<{
    schema_name: string;
    relation_name: string;
    owner_name: string;
    grantee_name: string;
    grantor_name: string | null;
    privilege_type: string;
    is_grantable: boolean;
  }>(
    `SELECT n.nspname schema_name,c.relname relation_name,owner.rolname owner_name,
            coalesce(grantee.rolname,'PUBLIC') grantee_name,grantor.rolname grantor_name,
            acl.privilege_type,acl.is_grantable
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_roles owner ON owner.oid=c.relowner
       CROSS JOIN LATERAL aclexplode(c.relacl) acl
       LEFT JOIN pg_roles grantee ON grantee.oid=acl.grantee
       LEFT JOIN pg_roles grantor ON grantor.oid=acl.grantor
      WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','v','m','f')
      ORDER BY n.nspname,c.relname,grantee_name,acl.privilege_type`,
    [PROJECT_DATABASE_SCHEMAS],
  );
  for (const acl of relationAcls.rows) {
    if (acl.grantee_name !== acl.owner_name && acl.grantee_name !== roleName) {
      failures.push(
        `${acl.schema_name}.${acl.relation_name}: unapproved relation ACL grantee ${acl.grantee_name}/${acl.privilege_type}`,
      );
    }
    if (
      acl.grantee_name === roleName &&
      (acl.grantor_name !== acl.owner_name || acl.is_grantable)
    ) {
      failures.push(
        `${acl.schema_name}.${acl.relation_name}: runtime relation ACL provenance differs`,
      );
    }
  }
  for (const relation of relations.rows) {
    const approved =
      relation.schema_name === 'public' && AUDITED_TABLES.includes(relation.relation_name as never);
    const direct = relationAcls.rows
      .filter(
        (acl) =>
          acl.schema_name === relation.schema_name &&
          acl.relation_name === relation.relation_name &&
          acl.grantee_name === roleName,
      )
      .map((acl) => acl.privilege_type)
      .sort();
    const expected = approved ? ['INSERT', 'SELECT', 'UPDATE'] : [];
    if (!same(direct, expected)) {
      failures.push(
        `${relation.schema_name}.${relation.relation_name}: direct runtime relation ACL is ${direct.join(',') || 'none'}`,
      );
    }
  }

  const columnPrivileges = await db.query<{
    schema_name: string;
    relation_name: string;
    select_ok: boolean;
    insert_ok: boolean;
    update_ok: boolean;
    references_ok: boolean;
  }>(
    `SELECT n.nspname schema_name,c.relname relation_name,
            has_any_column_privilege($1,c.oid,'SELECT') select_ok,
            has_any_column_privilege($1,c.oid,'INSERT') insert_ok,
            has_any_column_privilege($1,c.oid,'UPDATE') update_ok,
            has_any_column_privilege($1,c.oid,'REFERENCES') references_ok
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=ANY($2::text[]) AND c.relkind IN ('r','p','v','m','f')
      ORDER BY n.nspname,c.relname`,
    [roleName, PROJECT_DATABASE_SCHEMAS],
  );
  for (const row of columnPrivileges.rows) {
    const approved =
      row.schema_name === 'public' && AUDITED_TABLES.includes(row.relation_name as never);
    if (
      row.select_ok !== approved ||
      row.insert_ok !== approved ||
      row.update_ok !== approved ||
      row.references_ok
    ) {
      failures.push(`${row.schema_name}.${row.relation_name}: effective column grants differ`);
    }
  }
  const columnAcls = await db.query<{
    schema_name: string;
    relation_name: string;
    column_name: string;
    owner_name: string;
    grantee_name: string;
    privilege_type: string;
  }>(
    `SELECT n.nspname schema_name,c.relname relation_name,a.attname column_name,
            owner.rolname owner_name,coalesce(grantee.rolname,'PUBLIC') grantee_name,
            acl.privilege_type
       FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_roles owner ON owner.oid=c.relowner
       CROSS JOIN LATERAL aclexplode(a.attacl) acl
       LEFT JOIN pg_roles grantee ON grantee.oid=acl.grantee
      WHERE n.nspname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY n.nspname,c.relname,a.attname,grantee_name,acl.privilege_type`,
    [PROJECT_DATABASE_SCHEMAS],
  );
  for (const acl of columnAcls.rows) {
    if (acl.grantee_name !== acl.owner_name) {
      failures.push(
        `${acl.schema_name}.${acl.relation_name}.${acl.column_name}: unapproved column ACL ${acl.grantee_name}/${acl.privilege_type}`,
      );
    }
  }

  const approvedSequences = await db.query<{ oid: string | null }>(
    `SELECT to_regclass(pg_get_serial_sequence(format('public.%I',table_name),'id'))::oid::text oid
       FROM unnest($1::text[]) table_name ORDER BY table_name`,
    [AUDITED_TABLES],
  );
  const approvedSequenceOids = new Set(
    approvedSequences.rows.flatMap((row) => (row.oid === null ? [] : [row.oid])),
  );
  const sequences = await db.query<{
    oid: string;
    schema_name: string;
    sequence_name: string;
    usage_ok: boolean;
    select_ok: boolean;
    update_ok: boolean;
  }>(
    `SELECT c.oid::text,n.nspname schema_name,c.relname sequence_name,
            has_sequence_privilege($1,c.oid,'USAGE') usage_ok,
            has_sequence_privilege($1,c.oid,'SELECT') select_ok,
            has_sequence_privilege($1,c.oid,'UPDATE') update_ok
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=ANY($2::text[]) AND c.relkind='S'
      ORDER BY n.nspname,c.relname`,
    [roleName, PROJECT_DATABASE_SCHEMAS],
  );
  for (const row of sequences.rows) {
    const approved = approvedSequenceOids.has(row.oid);
    if (row.usage_ok !== approved || row.select_ok !== approved || row.update_ok) {
      failures.push(`${row.schema_name}.${row.sequence_name}: runtime sequence grants differ`);
    }
  }
  if (
    sequences.rows.filter((row) => approvedSequenceOids.has(row.oid)).length !==
    approvedSequenceOids.size
  ) {
    failures.push('runtime approved sequence inventory differs');
  }

  const sequenceAcls = await db.query<{
    oid: string;
    schema_name: string;
    sequence_name: string;
    owner_name: string;
    grantee_name: string;
    grantor_name: string | null;
    privilege_type: string;
    is_grantable: boolean;
  }>(
    `SELECT c.oid::text,n.nspname schema_name,c.relname sequence_name,
            owner.rolname owner_name,coalesce(grantee.rolname,'PUBLIC') grantee_name,
            grantor.rolname grantor_name,acl.privilege_type,acl.is_grantable
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_roles owner ON owner.oid=c.relowner
       CROSS JOIN LATERAL aclexplode(c.relacl) acl
       LEFT JOIN pg_roles grantee ON grantee.oid=acl.grantee
       LEFT JOIN pg_roles grantor ON grantor.oid=acl.grantor
      WHERE n.nspname=ANY($1::text[]) AND c.relkind='S'
      ORDER BY n.nspname,c.relname,grantee_name,acl.privilege_type`,
    [PROJECT_DATABASE_SCHEMAS],
  );
  for (const acl of sequenceAcls.rows) {
    if (acl.grantee_name !== acl.owner_name && acl.grantee_name !== roleName) {
      failures.push(
        `${acl.schema_name}.${acl.sequence_name}: unapproved sequence ACL grantee ${acl.grantee_name}/${acl.privilege_type}`,
      );
    }
    if (
      acl.grantee_name === roleName &&
      (acl.grantor_name !== acl.owner_name || acl.is_grantable)
    ) {
      failures.push(
        `${acl.schema_name}.${acl.sequence_name}: runtime sequence ACL provenance differs`,
      );
    }
  }
  for (const sequence of sequences.rows) {
    const direct = sequenceAcls.rows
      .filter((acl) => acl.oid === sequence.oid && acl.grantee_name === roleName)
      .map((acl) => acl.privilege_type)
      .sort();
    const expected = approvedSequenceOids.has(sequence.oid) ? ['SELECT', 'USAGE'] : [];
    if (!same(direct, expected)) {
      failures.push(
        `${sequence.schema_name}.${sequence.sequence_name}: direct runtime sequence ACL is ${direct.join(',') || 'none'}`,
      );
    }
  }

  const executableDefiners = await db.query<{ signature: string }>(
    `SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' signature
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=ANY($2::text[]) AND p.prosecdef
        AND has_function_privilege($1,p.oid,'EXECUTE')
      ORDER BY signature`,
    [roleName, PROJECT_DATABASE_SCHEMAS],
  );
  if (
    !same(
      executableDefiners.rows.map((row) => row.signature),
      [...APPROVED_RUNTIME_SECURITY_DEFINERS].sort(),
    )
  ) {
    failures.push('runtime executable SECURITY DEFINER inventory differs');
  }

  const definerAcls = await db.query<{
    signature: string;
    owner_name: string;
    grantee_name: string;
    grantor_name: string | null;
    privilege_type: string;
    is_grantable: boolean;
  }>(
    `SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' signature,
            owner.rolname owner_name,coalesce(grantee.rolname,'PUBLIC') grantee_name,
            grantor.rolname grantor_name,acl.privilege_type,acl.is_grantable
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       JOIN pg_roles owner ON owner.oid=p.proowner
       CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
       LEFT JOIN pg_roles grantee ON grantee.oid=acl.grantee
       LEFT JOIN pg_roles grantor ON grantor.oid=acl.grantor
      WHERE n.nspname=ANY($1::text[]) AND p.prosecdef
      ORDER BY signature,grantee_name,acl.privilege_type`,
    [PROJECT_DATABASE_SCHEMAS],
  );
  for (const acl of definerAcls.rows) {
    if (acl.grantee_name !== acl.owner_name && acl.grantee_name !== roleName) {
      failures.push(
        `${acl.signature}: unapproved SECURITY DEFINER ACL grantee ${acl.grantee_name}/${acl.privilege_type}`,
      );
    }
    if (
      acl.grantee_name === roleName &&
      (!APPROVED_RUNTIME_SECURITY_DEFINERS.includes(acl.signature as never) ||
        acl.privilege_type !== 'EXECUTE' ||
        acl.grantor_name !== acl.owner_name ||
        acl.is_grantable)
    ) {
      failures.push(`${acl.signature}: runtime SECURITY DEFINER ACL provenance differs`);
    }
  }
  for (const signature of APPROVED_RUNTIME_SECURITY_DEFINERS) {
    if (
      definerAcls.rows.filter(
        (acl) =>
          acl.signature === signature &&
          acl.grantee_name === roleName &&
          acl.privilege_type === 'EXECUTE',
      ).length !== 1
    ) {
      failures.push(`${signature}: direct runtime EXECUTE ACL differs`);
    }
  }

  const defaultFunctionPrivileges = await db.query<{
    global_acl_count: number;
    global_acl_entry_count: number;
    owner_execute_count: number;
    project_schema_acl_count: number;
  }>(`
    WITH project_owner AS (
      SELECT relowner owner_oid FROM pg_class
       WHERE oid='public.people'::regclass
    )
    SELECT
      (SELECT count(*)::int FROM pg_default_acl d,project_owner o
        WHERE d.defaclrole=o.owner_oid AND d.defaclobjtype='f'
          AND d.defaclnamespace=0) global_acl_count,
      (SELECT count(*)::int FROM pg_default_acl d,project_owner o,
              LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclrole=o.owner_oid AND d.defaclobjtype='f'
          AND d.defaclnamespace=0) global_acl_entry_count,
      (SELECT count(*)::int FROM pg_default_acl d,project_owner o,
              LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclrole=o.owner_oid AND d.defaclobjtype='f'
          AND d.defaclnamespace=0 AND a.grantee=o.owner_oid
          AND a.privilege_type='EXECUTE') owner_execute_count,
      (SELECT count(*)::int FROM pg_default_acl d,project_owner o
        WHERE d.defaclrole=o.owner_oid AND d.defaclobjtype='f'
          AND d.defaclnamespace IN (
            '_migration'::regnamespace,'public'::regnamespace,
            'quarantine'::regnamespace,'staging'::regnamespace
          )) project_schema_acl_count`);
  const defaultFunctionPrivilege = defaultFunctionPrivileges.rows[0];
  if (
    defaultFunctionPrivileges.rows.length !== 1 ||
    defaultFunctionPrivilege?.global_acl_count !== 1 ||
    defaultFunctionPrivilege.global_acl_entry_count !== 1 ||
    defaultFunctionPrivilege.owner_execute_count !== 1 ||
    defaultFunctionPrivilege.project_schema_acl_count !== 0
  ) {
    failures.push('project-owner default SECURITY DEFINER execution boundary differs');
  }

  const parameterCapabilities = await db.query<{
    set_ok: boolean;
    alter_system_ok: boolean;
  }>(
    `SELECT has_parameter_privilege($1,'session_replication_role','SET') set_ok,
            has_parameter_privilege($1,'session_replication_role','ALTER SYSTEM') alter_system_ok`,
    [roleName],
  );
  const parameterCapability = parameterCapabilities.rows[0];
  if (!parameterCapability || parameterCapability.set_ok || parameterCapability.alter_system_ok) {
    failures.push('runtime can SET or ALTER SYSTEM session_replication_role');
  }
  const unsafeParameterAcls = await db.query<{
    grantee_name: string;
    privilege_type: string;
  }>(`
    SELECT coalesce(r.rolname,'PUBLIC') grantee_name,acl.privilege_type
      FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) acl
      LEFT JOIN pg_roles r ON r.oid=acl.grantee
     WHERE p.parname='session_replication_role'
       AND (acl.grantee=0 OR NOT coalesce(r.rolsuper,false))
     ORDER BY grantee_name,acl.privilege_type`);
  if (unsafeParameterAcls.rows.length > 0) {
    failures.push(
      `session_replication_role has non-superuser/PUBLIC ACLs: ${unsafeParameterAcls.rows
        .map((row) => `${row.grantee_name}/${row.privilege_type}`)
        .join(', ')}`,
    );
  }
  return failures;
}

export async function auditDataFailures(
  db: ClientBase,
  options: { historicalLive?: boolean } = {},
): Promise<string[]> {
  const failures: string[] = [];
  const actors = await db.query<ActorRow>(`
    SELECT id,actor_key,actor_kind,user_account_id,identity_label,purpose
      FROM audit_actors ORDER BY id`);
  if (actors.rows.length !== 7)
    failures.push(`actor registry contains ${actors.rows.length}/7 rows`);
  for (const expected of SYSTEM_AUDIT_ACTORS) {
    const row = actors.rows.find((candidate) => candidate.actor_key === expected.key);
    if (
      !row ||
      row.id !== expected.id ||
      row.actor_kind !== 'system' ||
      row.user_account_id !== null ||
      row.identity_label !== expected.label ||
      row.purpose !== expected.purpose
    ) {
      failures.push(`${expected.key}: immutable system identity differs`);
    }
  }
  const accounts = await db.query<{
    id: number;
    username: string;
    actor_count: number;
    actor_id: number | null;
    actor_key: string | null;
    identity_label: string | null;
  }>(`
    SELECT u.id,u.username,count(a.id)::int actor_count,min(a.id) actor_id,min(a.actor_key) actor_key,
           min(a.identity_label) identity_label
      FROM user_accounts u LEFT JOIN audit_actors a
        ON a.user_account_id=u.id AND a.actor_kind='human'
     GROUP BY u.id,u.username ORDER BY u.id`);
  if (accounts.rows.length !== 4)
    failures.push(`current account count is ${accounts.rows.length}/4`);
  for (const row of accounts.rows) {
    if (
      row.actor_count !== 1 ||
      row.actor_key !== `user_account:${row.id}` ||
      row.identity_label !== `${row.username} (account ${row.id})`
    ) {
      failures.push(`account ${row.id}: immutable human actor linkage differs`);
    }
  }

  let rowTotal = 0;
  let createdMigration = 0;
  let updatedMigration = 0;
  let createdNulls = 0;
  let updatedNulls = 0;
  const migrationActor = actors.rows.find((row) => row.actor_key === 'system_migration');
  if (!migrationActor) return [...failures, 'system_migration is absent'];
  for (const table of AUDITED_TABLES) {
    const result = await db.query<{
      rows: string;
      created_migration: string;
      updated_migration: string;
      created_nulls: string;
      updated_nulls: string;
    }>(
      `SELECT count(*)::text rows,
       count(*) FILTER(WHERE created_by=$1)::text created_migration,
       count(*) FILTER(WHERE updated_by=$1)::text updated_migration,
       count(*) FILTER(WHERE created_by IS NULL)::text created_nulls,
       count(*) FILTER(WHERE updated_by IS NULL)::text updated_nulls
       FROM public.${table}`,
      [migrationActor.id],
    );
    const row = result.rows[0]!;
    rowTotal += Number(row.rows);
    createdMigration += Number(row.created_migration);
    updatedMigration += Number(row.updated_migration);
    createdNulls += Number(row.created_nulls);
    updatedNulls += Number(row.updated_nulls);
    const expectedUpdatedNulls = table === 'user_accounts' ? 4 : 0;
    if (Number(row.created_nulls) !== 0 || Number(row.updated_nulls) !== expectedUpdatedNulls) {
      failures.push(`${table}: historical actor-null exceptions differ`);
    }
  }
  if (createdNulls !== 0 || updatedNulls !== 4)
    failures.push('aggregate actor-null exceptions differ');
  if (options.historicalLive) {
    if (rowTotal !== 45_463) failures.push(`historical audited row count is ${rowTotal}/45463`);
    if (createdMigration !== 45_463)
      failures.push(`system_migration creation count is ${createdMigration}/45463`);
    if (updatedMigration !== 45_459)
      failures.push(`system_migration update count is ${updatedMigration}/45459`);
  }
  return failures;
}

export async function auditAttributionDigest(db: ClientBase): Promise<string> {
  const projection: unknown[] = [];
  for (const table of AUDITED_TABLES) {
    const rows = await db.query(
      `SELECT id,created_by,updated_by,created_at,updated_at FROM public.${table} ORDER BY id`,
    );
    projection.push([table, rows.rows]);
  }
  return createHash('sha256').update(JSON.stringify(projection), 'utf8').digest('hex');
}

export async function protectedAuditExcludedDigest(db: ClientBase): Promise<string> {
  const projection: unknown[] = [];
  for (const table of ['attendance', 'invoice_allocations', 'invoices', 'payments'] as const) {
    const rows = await db.query(
      `SELECT id,to_jsonb(t)-'created_by'-'updated_by' row,created_at,updated_at
         FROM public.${table} t ORDER BY id`,
    );
    const complete = createHash('sha256')
      .update(JSON.stringify(rows.rows.map((row) => row['row'])), 'utf8')
      .digest('hex');
    const times = createHash('sha256')
      .update(
        JSON.stringify(rows.rows.map((row) => [row['id'], row['created_at'], row['updated_at']])),
        'utf8',
      )
      .digest('hex');
    projection.push([table, rows.rowCount, complete, times]);
  }
  return createHash('sha256').update(JSON.stringify(projection), 'utf8').digest('hex');
}
