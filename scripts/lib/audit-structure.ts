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

  const role = await db.query<{
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolinherit: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    rolcanlogin: boolean;
  }>(`SELECT rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,
             rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname='litigation_runtime'`);
  if (
    role.rows.length !== 1 ||
    role.rows[0]!.rolsuper ||
    role.rows[0]!.rolcreatedb ||
    role.rows[0]!.rolcreaterole ||
    role.rows[0]!.rolinherit ||
    role.rows[0]!.rolreplication ||
    role.rows[0]!.rolbypassrls ||
    !role.rows[0]!.rolcanlogin
  ) {
    failures.push('restricted runtime role attributes differ');
  }
  const privileges = await db.query<{
    table_name: string;
    owner_name: string;
    select_ok: boolean;
    insert_ok: boolean;
    update_ok: boolean;
    delete_ok: boolean;
  }>(
    `
    SELECT r.relname table_name,pg_get_userbyid(r.relowner) owner_name,
           has_table_privilege('litigation_runtime',r.oid,'SELECT') select_ok,
           has_table_privilege('litigation_runtime',r.oid,'INSERT') insert_ok,
           has_table_privilege('litigation_runtime',r.oid,'UPDATE') update_ok,
           has_table_privilege('litigation_runtime',r.oid,'DELETE') delete_ok
      FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
     WHERE n.nspname='public' AND r.relname=ANY($1::text[]) ORDER BY r.relname`,
    [AUDITED_TABLES],
  );
  if (
    privileges.rows.length !== 38 ||
    privileges.rows.some(
      (row) =>
        row.owner_name === 'litigation_runtime' ||
        !row.select_ok ||
        !row.insert_ok ||
        !row.update_ok ||
        row.delete_ok,
    )
  ) {
    failures.push('runtime application-table ownership/grants differ');
  }
  const boundary = await db.query<{
    actor_read: boolean;
    actor_write: boolean;
    schema_create: boolean;
    auth_context: boolean;
    human_context: boolean;
    admin_context: boolean;
    migration_context: boolean;
  }>(`SELECT
    has_table_privilege('litigation_runtime','audit_actors','SELECT') actor_read,
    has_table_privilege('litigation_runtime','audit_actors','INSERT,UPDATE,DELETE') actor_write,
    has_schema_privilege('litigation_runtime','public','CREATE') schema_create,
    has_function_privilege('litigation_runtime','audit_set_authentication_context()','EXECUTE') auth_context,
    has_function_privilege('litigation_runtime','audit_set_human_context(integer)','EXECUTE') human_context,
    has_function_privilege('litigation_runtime','audit_set_administration_context()','EXECUTE') admin_context,
    has_function_privilege('litigation_runtime','audit_set_migration_context()','EXECUTE') migration_context`);
  const grant = boundary.rows[0];
  if (
    !grant ||
    grant.actor_read ||
    grant.actor_write ||
    grant.schema_create ||
    !grant.auth_context ||
    !grant.human_context ||
    grant.admin_context ||
    grant.migration_context
  ) {
    failures.push('runtime actor/context threat-boundary grants differ');
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
      row.actor_id !== 1000 + row.id ||
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
