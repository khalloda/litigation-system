import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { assertClientContactCatalog } from './client-contact-catalog';

export const CLIENT_CONTACT_MIGRATION = '20260909120000_client_contact_database_boundary';
export const CLIENT_CONTACT_TABLES = [
  'client_contact_boundary',
  'client_contact_client_import',
  'client_contact_contact_import',
  'client_contact_submission',
] as const;
export const CLIENT_CONTACT_FIELDS = [
  'is_application_native',
  'is_archived',
  'row_version',
  'application_modified_at',
  'application_modified_by',
] as const;
export const CLIENT_CONTACT_FIELD_RULES = ['clients', 'contacts'].flatMap(
  (table) =>
    [
      [table, 'is_application_native', 64, 'client_contact_database_provenance'],
      [table, 'is_archived', 64, 'client_contact_archive_lifecycle'],
      [table, 'row_version', 64, 'client_contact_database_version'],
      [table, 'application_modified_at', 64, 'client_contact_modification_provenance'],
      [table, 'application_modified_by', 64, 'client_contact_modification_provenance'],
    ] as const,
);
export const CLIENT_CONTACT_GATEWAYS = [
  'public.client_contact_create(p_table text, p_parent_id integer, p_submission_id uuid, p_values jsonb)',
  'public.client_contact_update(p_table text, p_id integer, p_expected_version bigint, p_patch jsonb)',
  'public.client_contact_set_archived(p_table text, p_id integer, p_expected_version bigint, p_archived boolean)',
] as const;
export const clientContactMigrationSql = () =>
  readFileSync(`prisma/migrations/${CLIENT_CONTACT_MIGRATION}/migration.sql`, 'utf8');

export async function clientContactHistoricalCounts(db: ClientBase, applied: boolean) {
  const row = (
    await db.query(
      historicalClientContactSql(
        `SELECT
    (SELECT count(*) FROM clients) clients,(SELECT count(*) FROM staging."العملاء") staged_clients,
    (SELECT count(*) FROM contacts) contacts,(SELECT count(*) FROM staging."Contacts") staged_contacts,
    (SELECT count(*) FROM contacts WHERE client_id IS NULL) orphan_contacts,
    (SELECT count(*) FROM clients WHERE cash_or_probono='') cleared_target,
    (SELECT count(*) FROM staging."العملاء" WHERE "Cash/probono"='') cleared_staged,
    (SELECT count(*) FROM staging."العملاء" s JOIN clients c ON c.legacy_id=s."ID_client"::integer WHERE c.legacy_contact_lawyer_raw IS DISTINCT FROM s."contactLawyer") lawyer_mismatch,
    (SELECT count(*) FROM clients WHERE branch_id IS NOT NULL OR legacy_branch_raw IS NOT NULL OR contact_person_id IS NOT NULL) invented_branch`,
        applied,
      ),
    )
  ).rows[0];
  return {
    clients: BigInt(row.clients),
    staged_clients: BigInt(row.staged_clients),
    contacts: BigInt(row.contacts),
    staged_contacts: BigInt(row.staged_contacts),
    orphan_contacts: BigInt(row.orphan_contacts),
    cleared_target: BigInt(row.cleared_target),
    cleared_staged: BigInt(row.cleared_staged),
    lawyer_mismatch: BigInt(row.lawyer_mismatch),
    invented_branch: BigInt(row.invented_branch),
  };
}

/** Absence means the complete predeployment baseline, never partial state. */
export async function clientContactBoundaryApplied(db: ClientBase): Promise<boolean> {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM _prisma_migrations WHERE migration_name=$1',
      [CLIENT_CONTACT_MIGRATION],
    )
  ).rows;
  const surfaces = (
    await db.query(
      `SELECT
    ARRAY(SELECT tablename::text FROM pg_tables WHERE schemaname='_migration' AND tablename LIKE 'client_contact_%' ORDER BY tablename) tables,
    ARRAY(SELECT viewname::text FROM pg_views WHERE schemaname='_migration' AND viewname LIKE 'client_contact_%' ORDER BY viewname) views,
    (SELECT count(*)::integer FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('clients','contacts') AND column_name=ANY($1::text[])) columns,
    (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','_migration') AND p.proname LIKE 'client_contact_%') functions`,
      [CLIENT_CONTACT_FIELDS],
    )
  ).rows[0];
  if (ledger.length === 0) {
    assert.deepEqual(
      surfaces,
      { tables: [], views: [], columns: 0, functions: 0 },
      'Partial client/contact boundary without migration 62',
    );
    return false;
  }
  assert.equal(ledger.length, 1, 'Duplicate client/contact migration');
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
    'Unfinished client/contact migration',
  );
  assert.equal(
    ledger[0].checksum,
    createHash('sha256')
      .update(readFileSync(`prisma/migrations/${CLIENT_CONTACT_MIGRATION}/migration.sql`))
      .digest('hex'),
    'Migration 62 checksum differs',
  );
  assert.deepEqual(
    surfaces,
    {
      tables: [...CLIENT_CONTACT_TABLES],
      views: ['client_contact_initial_clients', 'client_contact_initial_contacts'],
      columns: 10,
      functions: [...clientContactMigrationSql().matchAll(/CREATE FUNCTION /gu)].length,
    },
    'Partial or unknown client/contact boundary',
  );
  return true;
}

/** Historical reconciliation only; the expanded views retain the pre-62 row
 * shape. Never wrap operational queries or any writer with this adapter. */
export function historicalClientContactSql(sql: string, applied: boolean): string {
  if (!applied) return sql;
  assert.match(
    sql.trimStart().replace(/^(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/u, ''),
    /^(SELECT|WITH)\b/iu,
  );
  return sql.replace(
    /\b(FROM|JOIN)\s+(?:public\.)?(clients|contacts)\b/giu,
    (_, verb: string, table: string) => `${verb} _migration.client_contact_initial_${table}`,
  );
}
export function historicalClientContactClient(db: ClientBase, applied: boolean): ClientBase {
  if (!applied) return db;
  return {
    query: (sql: string, values?: unknown[]) =>
      db.query(historicalClientContactSql(sql, true), values),
  } as ClientBase;
}

export const CLIENT_CONTACT_INVARIANTS = [
  'Exact migration-62 client/contact boundary and profile',
  'Exact frozen client/contact identities, initial values and source payloads',
  'Imported identity/raw evidence and native provenance remain distinct',
  'Fixed contact ownership and eligible same-client main contact',
  'Client/contact database versions and truthful modification attribution',
  'Client/contact creation submission identities and result ownership',
  'Exact client/contact database functions and restricted gateways',
  'Client/contact lifecycle, immutable evidence and structural constraints',
  'Exact client/contact audit field classifications',
] as const;

export async function assertClientContactBoundary(db: ClientBase, profile: string) {
  assert.equal(await clientContactBoundaryApplied(db), true);
  await db.query("SET TIME ZONE 'UTC'");
  const boundary = (await db.query('SELECT * FROM _migration.client_contact_boundary')).rows;
  assert.equal(boundary.length, 1);
  assert.equal(boundary[0].profile, profile);
  const historical = profile === 'historical-full-state-upgrade';
  assert.ok(historical || profile === 'canonical-clean-replay');
  assert.equal(boundary[0].imported_clients, historical ? 318 : 0);
  assert.equal(boundary[0].imported_contacts, historical ? 188 : 0);
  const absent = async (sql: string, label: string) =>
    assert.equal(
      (await db.query(`SELECT count(*)::integer n FROM (${sql}) defects`)).rows[0].n,
      0,
      label,
    );
  for (const [table, source, key] of [
    ['clients', 'العملاء', 'ID_client'],
    ['contacts', 'Contacts', 'ID'],
  ] as const) {
    const evidence = `_migration.client_contact_${table === 'clients' ? 'client' : 'contact'}_import`;
    for (const [column, field] of [
      ['initial_values', 'initial_inventory'],
      ['source_values', 'source_inventory'],
    ] as const) {
      const actual = (
        await db.query(
          `SELECT count(*)::integer count,encode(sha256(convert_to(coalesce(string_agg(${column}::text,chr(10) ORDER BY ${column}::text COLLATE "C"),''),'UTF8')),'hex') digest FROM ${evidence}`,
        )
      ).rows[0];
      const expected = boundary[0][field].filter((v: { table: string }) => v.table === table);
      assert.equal(expected.length, 1);
      assert.deepEqual(
        actual,
        { count: expected[0].count, digest: expected[0].digest },
        `${table} immutable ${column} digest`,
      );
      if (historical && column === 'initial_values') {
        const frozen = (
          await db.query(
            `SELECT i->>'count' count,i->>'digest' digest FROM _migration.high_impact_application CROSS JOIN LATERAL jsonb_array_elements(before_inventory) i WHERE i->>'schema'='public' AND i->>'table'=$1`,
            [table],
          )
        ).rows;
        assert.deepEqual(
          frozen,
          [{ count: String(actual.count), digest: actual.digest }],
          'Original pre-62 frozen digest is unchanged',
        );
      }
    }
    await absent(
      `SELECT 1 FROM ${evidence} i FULL JOIN staging."${source}" s ON s.src_record_key=i.source_record_key WHERE i.id IS NULL OR s.src_record_key IS NULL OR i.source_values IS DISTINCT FROM to_jsonb(s) OR i.legacy_id IS DISTINCT FROM s."${key}"::integer`,
      'Exact original source rows and identities',
    );
    await absent(
      `SELECT 1 FROM ${evidence} i FULL JOIN public.${table} t ON t.id=i.id WHERE (i.id IS NOT NULL AND (t.id IS NULL OR t.legacy_id IS DISTINCT FROM i.legacy_id OR t.is_application_native)) OR (i.id IS NULL AND (NOT t.is_application_native OR t.legacy_id IS NOT NULL))`,
      'Live imported/native population',
    );
    await absent(
      `SELECT 1 FROM public.${table} t WHERE t.row_version<1 OR (t.row_version=1 AND (t.application_modified_at IS NOT NULL OR t.application_modified_by IS NOT NULL)) OR (t.row_version>1 AND (t.application_modified_at IS NULL OR t.application_modified_by IS NULL OR t.application_modified_by<>t.updated_by))`,
      'Database-owned version/provenance pairing',
    );
    await absent(
      `SELECT 1 FROM public.${table} t LEFT JOIN public.audit_actors a ON a.id=t.application_modified_by WHERE t.application_modified_by IS NOT NULL AND (a.id IS NULL OR a.actor_kind<>'human')`,
      'Modification actor must be human',
    );
    await absent(
      `SELECT 1 FROM public.${table} t WHERE t.is_application_native AND NOT EXISTS(SELECT 1 FROM _migration.client_contact_submission s WHERE s.entity_table='${table}' AND ${table === 'clients' ? 's.client_id' : 's.contact_id'}=t.id AND s.actor_id=t.created_by)`,
      'Native creation has its immutable submission receipt',
    );
    await absent(
      `SELECT 1 FROM public.${table} t LEFT JOIN LATERAL (
      SELECT count(*) n,count(DISTINCT after_values->>'row_version') versions,max((after_values->>'row_version')::bigint) latest,
        bool_and((before_values->>'row_version')::bigint+1=(after_values->>'row_version')::bigint AND actor_id=(after_values->>'application_modified_by')::integer) valid
      FROM audit_events e WHERE e.entity_schema='public' AND e.entity_table='${table}' AND e.entity_key=jsonb_build_object('id',t.id) AND e.action='record_updated' AND e.after_values ? 'row_version'
    ) e ON true WHERE e.n<>t.row_version-1 OR e.versions<>e.n OR (t.row_version>1 AND (e.latest<>t.row_version OR NOT e.valid))`,
      'Every row version has one continuous attributed audit event',
    );
    await absent(
      `SELECT 1 FROM public.${table} t WHERE t.is_application_native AND (SELECT count(*) FROM audit_events e WHERE e.entity_schema='public' AND e.entity_table='${table}' AND e.entity_key=jsonb_build_object('id',t.id) AND e.action='record_created' AND e.actor_id=t.created_by AND e.after_values->>'row_version'='1')<>1`,
      'Native creation has exactly one trusted creation event',
    );
    await absent(
      `SELECT 1 FROM ${evidence} i JOIN public.${table} t USING(id) WHERE to_jsonb(t)->'created_at' IS DISTINCT FROM i.initial_values->'created_at' OR to_jsonb(t)->'created_by' IS DISTINCT FROM i.initial_values->'created_by'`,
      'Imported original creation attribution is preserved',
    );
  }
  await absent(
    `SELECT 1 FROM clients WHERE is_application_native AND (coalesce(btrim(name_ar),'')='' OR legacy_contact_lawyer_raw IS NOT NULL OR legacy_branch_raw IS NOT NULL OR branch_id IS NOT NULL)`,
    'Native client name and absence of invented legacy fields',
  );
  await absent(
    `SELECT 1 FROM clients c JOIN _migration.client_contact_client_import i USING(id) WHERE c.legacy_contact_lawyer_raw IS DISTINCT FROM i.initial_values->>'legacy_contact_lawyer_raw' OR c.legacy_branch_raw IS DISTINCT FROM i.initial_values->>'legacy_branch_raw' OR c.branch_id IS NOT NULL OR (c.legacy_id=188 AND ROW(c.name_ar,c.name_en,c.full_name) IS DISTINCT FROM ROW(i.initial_values->>'name_ar',i.initial_values->>'name_en',i.initial_values->>'full_name'))`,
    'Raw client evidence, branch absence and D39 identity',
  );
  await absent(
    `SELECT 1 FROM contacts c LEFT JOIN clients p ON p.id=c.client_id LEFT JOIN _migration.client_contact_contact_import i ON i.id=c.id WHERE p.id IS NULL OR (i.id IS NOT NULL AND (c.client_id<>i.client_id OR c.home_phone IS DISTINCT FROM i.initial_values->>'home_phone')) OR (c.is_application_native AND coalesce(btrim(c.contact_name),'')='')`,
    'Contact parent, historical ownership and native name',
  );
  await absent(
    `SELECT 1 FROM clients p LEFT JOIN contacts c ON c.id=p.contact_person_id WHERE p.contact_person_id IS NOT NULL AND (c.id IS NULL OR c.client_id<>p.id OR c.is_archived)`,
    'Same-client unarchived optional main contact',
  );
  await absent(
    `SELECT 1 FROM _migration.client_contact_submission s JOIN clients p ON p.id=s.client_id LEFT JOIN contacts c ON c.id=s.contact_id WHERE s.request_sha256<>encode(sha256(convert_to(s.request_payload::text,'UTF8')),'hex') OR (s.entity_table='clients' AND (NOT p.is_application_native OR p.created_by<>s.actor_id)) OR (s.entity_table='contacts' AND (c.id IS NULL OR c.client_id<>p.id OR NOT c.is_application_native OR c.created_by<>s.actor_id))`,
    'Submission payload and actual result ownership',
  );
  await assertClientContactFunctions(db);
  await assertClientContactCatalog(db);
  const rules = (
    await db.query(
      `SELECT entity_table,field_name,max_text_characters,classification_reason,capture_mode FROM audit_event_fields WHERE entity_schema='public' AND entity_table IN ('clients','contacts') AND field_name=ANY($1::text[]) ORDER BY entity_table,field_name`,
      [CLIENT_CONTACT_FIELDS],
    )
  ).rows;
  assert.deepEqual(
    rules,
    CLIENT_CONTACT_FIELD_RULES.map(
      ([entity_table, field_name, max_text_characters, classification_reason]) => ({
        entity_table,
        field_name,
        max_text_characters,
        classification_reason,
        capture_mode: 'value',
      }),
    ).sort((a, b) =>
      `${a.entity_table}.${a.field_name}`.localeCompare(`${b.entity_table}.${b.field_name}`),
    ),
  );
  // Full expected constraints/triggers are verified by the focused catalog
  // oracle, retained separately from any captured historical row digest.
  return CLIENT_CONTACT_INVARIANTS.map((description, index) => ({
    id: `CLIENT-${String(index + 1).padStart(2, '0')}`,
    description,
  }));
}

export async function assertClientContactFunctions(db: ClientBase) {
  const expected = [
    ...clientContactMigrationSql().matchAll(
      /CREATE FUNCTION ([a-z_]+)\.([a-z_]+)\(([^)]*)\) RETURNS ([\s\S]*?)\s+LANGUAGE (sql|plpgsql)([\s\S]*?) AS \$\$([\s\S]*?)\$\$;/gu,
    ),
  ];
  const actual = (
    await db.query(`SELECT n.nspname schema,p.proname name,p.prosrc body,l.lanname language,p.prosecdef definer,p.provolatile volatility,p.proconfig configuration,p.proisstrict strict,p.proparallel parallel,p.prokind kind,pg_get_userbyid(p.proowner) owner,n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' signature,
    pg_get_function_result(p.oid) result_type,
    ARRAY(SELECT coalesce(r.rolname,'PUBLIC')::text FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE a.grantee<>p.proowner ORDER BY 1) nonowner_grants,
    EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute,has_function_privilege('litigation_runtime',p.oid,'EXECUTE') runtime_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','_migration') AND p.proname LIKE 'client_contact_%'`)
  ).rows;
  assert.equal(
    expected.length,
    [...clientContactMigrationSql().matchAll(/CREATE FUNCTION /gu)].length,
  );
  assert.equal(actual.length, expected.length);
  for (const m of expected) {
    const rows = actual.filter((r) => r.schema === m[1] && r.name === m[2]);
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(
      r.signature,
      `${m[1]}.${m[2]}(${m[3]!
        .split(',')
        .map((s) => s.trim())
        .join(', ')})`,
    );
    assert.equal(r.result_type, m[4]!.trim());
    assert.deepEqual(r.nonowner_grants, r.schema === 'public' ? ['litigation_runtime'] : []);
    assert.equal(
      r.body.trim().replaceAll('\r\n', '\n'),
      m[7]!.trim().replaceAll('\r\n', '\n'),
      r.name + ' body',
    );
    assert.equal(r.language, m[5]);
    assert.equal(r.definer, true);
    assert.equal(r.volatility, 'v');
    assert.equal(r.strict, false);
    assert.equal(r.parallel, 'u');
    assert.equal(r.kind, 'f');
    assert.equal(r.owner, 'litigation');
    assert.deepEqual(
      r.configuration,
      m[6]!.includes("TimeZone='UTC'")
        ? ['search_path=pg_catalog, public', 'TimeZone=UTC']
        : ['search_path=pg_catalog, public'],
    );
    assert.equal(r.public_execute, false);
    assert.equal(r.runtime_execute, r.schema === 'public');
  }
  assert.deepEqual(
    actual
      .filter((r) => r.runtime_execute)
      .map((r) => r.signature)
      .sort(),
    [...CLIENT_CONTACT_GATEWAYS].sort(),
  );
}
