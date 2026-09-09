import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';
import { CLIENT_CONTACT_TABLES, CLIENT_CONTACT_FIELDS } from './client-contact-checkpoint';

/** Reviewed PostgreSQL 17 expressions. Compare real semantics and enforcement,
 * never only object names or constraint counts. */
export async function assertClientContactCatalog(db: ClientBase) {
  const privateConstraints: Record<string, string> = {
    client_contact_boundary_pkey: 'PRIMARY KEY (singleton)',
    client_contact_boundary_singleton_check: 'CHECK (singleton)',
    client_contact_boundary_profile_check:
      "CHECK ((profile = ANY (ARRAY['historical-full-state-upgrade'::text, 'canonical-clean-replay'::text])))",
    client_contact_submission_pkey: 'PRIMARY KEY (actor_id, entity_table, submission_id)',
    client_contact_submission_entity_table_check:
      "CHECK ((entity_table = ANY (ARRAY['clients'::text, 'contacts'::text])))",
    client_contact_submission_request_payload_check:
      "CHECK ((jsonb_typeof(request_payload) = 'object'::text))",
    client_contact_submission_check:
      "CHECK ((request_sha256 = encode(sha256(convert_to((request_payload)::text, 'UTF8'::name)), 'hex'::text)))",
    client_contact_submission_check1:
      "CHECK ((((entity_table = 'clients'::text) AND (contact_id IS NULL)) OR ((entity_table = 'contacts'::text) AND (contact_id IS NOT NULL))))",
  };
  for (const [entity, table, key] of [
    ['client', 'clients', 'ID_client'],
    ['contact', 'contacts', 'ID'],
  ]) {
    const prefix = `client_contact_${entity}_import`;
    privateConstraints[prefix + '_pkey'] = 'PRIMARY KEY (id)';
    for (const field of ['legacy_id', 'source_record_key'])
      privateConstraints[prefix + '_' + field + '_key'] = `UNIQUE (${field})`;
    for (const field of ['initial_values', 'source_values'])
      privateConstraints[prefix + '_' + field + '_check'] =
        `CHECK ((jsonb_typeof(${field}) = 'object'::text))`;
    privateConstraints[prefix + '_id_fkey'] =
      `FOREIGN KEY (id) REFERENCES ${table}(id) ON UPDATE RESTRICT ON DELETE RESTRICT`;
    privateConstraints[prefix + '_check'] =
      `CHECK (((((initial_values ->> 'id'::text))::integer = id) AND (((initial_values ->> 'legacy_id'::text))::integer = legacy_id)${entity === 'contact' ? " AND (((initial_values ->> 'client_id'::text))::integer = client_id)" : ''}))`;
    privateConstraints[prefix + '_check1'] =
      `CHECK ((((source_values ->> 'src_record_key'::text) = source_record_key) AND ((source_values ->> 'src_extraction_sha256'::text) = source_extraction_sha256) AND (((source_values ->> '${key}'::text))::integer = legacy_id)))`;
  }
  privateConstraints.client_contact_contact_import_client_id_fkey =
    'FOREIGN KEY (client_id) REFERENCES _migration.client_contact_client_import(id) ON UPDATE RESTRICT ON DELETE RESTRICT';
  for (const [field, table] of [
    ['actor_id', 'audit_actors'],
    ['client_id', 'clients'],
    ['contact_id', 'contacts'],
  ])
    privateConstraints['client_contact_submission_' + field + '_fkey'] =
      `FOREIGN KEY (${field}) REFERENCES ${table}(id) ON UPDATE RESTRICT ON DELETE RESTRICT`;
  const privateActual = (
    await db.query(
      `SELECT conname name,pg_get_constraintdef(oid) definition,convalidated validated,condeferrable deferrable,condeferred deferred FROM pg_constraint WHERE conrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='_migration' AND c.relname=ANY($1::text[])) ORDER BY conname`,
      [CLIENT_CONTACT_TABLES],
    )
  ).rows;
  assert.deepEqual(
    privateActual,
    Object.entries(privateConstraints)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, definition]) => ({
        name,
        definition,
        validated: true,
        deferrable: false,
        deferred: false,
      })),
    'Exact private evidence/submission constraints',
  );
  const privateAccess = (
    await db.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='_migration' AND c.relname LIKE 'client_contact_%' AND (pg_get_userbyid(c.relowner)<>'litigation' OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner))`,
    )
  ).rows;
  assert.deepEqual(privateAccess, [], 'Client/contact evidence must be owner-only');
  const expected: Record<string, string> = {};
  for (const table of ['clients', 'contacts']) {
    expected[table + '_row_version_check'] = 'CHECK ((row_version > 0))';
    expected[table + '_modification_pair'] =
      'CHECK (((application_modified_at IS NULL) = (application_modified_by IS NULL)))';
    expected[table + '_native_identity'] =
      'CHECK (((NOT is_application_native) OR (legacy_id IS NULL)))';
    expected[table + '_application_modified_by_fkey'] =
      'FOREIGN KEY (application_modified_by) REFERENCES audit_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT';
  }
  expected['contacts_operational_parent'] = 'CHECK ((client_id IS NOT NULL))';
  expected['contacts_id_client_id_key'] = 'UNIQUE (id, client_id)';
  expected['clients_same_client_main_contact'] =
    'FOREIGN KEY (contact_person_id, id) REFERENCES contacts(id, client_id) ON UPDATE RESTRICT ON DELETE RESTRICT';
  const constraints = (
    await db.query(
      `SELECT conname name,pg_get_constraintdef(oid) definition,convalidated validated,condeferrable deferrable,condeferred deferred FROM pg_constraint WHERE conrelid IN ('public.clients'::regclass,'public.contacts'::regclass) AND conname=ANY($1::text[]) ORDER BY conname`,
      [Object.keys(expected)],
    )
  ).rows;
  assert.deepEqual(
    constraints,
    Object.entries(expected)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, definition]) => ({
        name,
        definition,
        validated: true,
        deferrable: false,
        deferred: false,
      })),
    'Client/contact constraint definitions differ',
  );
  const columns = (
    await db.query(
      `SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('clients','contacts') AND column_name=ANY($1::text[]) ORDER BY table_name,column_name`,
      [CLIENT_CONTACT_FIELDS],
    )
  ).rows;
  const expectedColumns = ['clients', 'contacts'].flatMap((table_name) =>
    [
      ['application_modified_at', 'timestamp with time zone', 'YES', null],
      ['application_modified_by', 'integer', 'YES', null],
      ['is_application_native', 'boolean', 'NO', 'true'],
      ['is_archived', 'boolean', 'NO', 'false'],
      ['row_version', 'bigint', 'NO', '1'],
    ].map(([column_name, data_type, is_nullable, column_default]) => ({
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default,
    })),
  );
  assert.deepEqual(
    columns,
    expectedColumns,
    'Client/contact live column/default declarations differ',
  );
  const indexes = (
    await db.query(
      `SELECT c.relname name,x.indisunique unique,x.indisvalid valid,x.indisready ready,pg_get_indexdef(c.oid) definition FROM pg_index x JOIN pg_class c ON c.oid=x.indexrelid WHERE c.relname=ANY($1::text[]) ORDER BY c.relname`,
      [
        [
          'clients_archive_name_id_idx',
          'contacts_parent_archive_id_idx',
          'clients_application_modified_by_idx',
          'contacts_application_modified_by_idx',
        ],
      ],
    )
  ).rows;
  const indexDefinitions = [
    ['clients_application_modified_by_idx', 'clients', 'application_modified_by'],
    ['clients_archive_name_id_idx', 'clients', 'is_archived, name_ar, id'],
    ['contacts_application_modified_by_idx', 'contacts', 'application_modified_by'],
    ['contacts_parent_archive_id_idx', 'contacts', 'client_id, is_archived, id'],
  ];
  assert.deepEqual(
    indexes,
    indexDefinitions.map(([name, table, fields]) => ({
      name,
      unique: false,
      valid: true,
      ready: true,
      definition: `CREATE INDEX ${name} ON public.${table} USING btree (${fields})`,
    })),
  );
  const triggers = (
    await db.query(
      `SELECT n.nspname schema,c.relname "table",t.tgname name,t.tgtype::integer type,t.tgenabled::text enabled,pn.nspname function_schema,p.proname function,t.tgqual IS NULL unconditional,t.tgnargs::integer arguments FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE NOT t.tgisinternal AND ((n.nspname='_migration' AND c.relname LIKE 'client_contact_%') OR (n.nspname='public' AND t.tgname IN ('zz_client_contact_guard','client_contact_no_truncate'))) ORDER BY 1,2,3`,
    )
  ).rows;
  const expectedTriggers = [];
  for (const table of CLIENT_CONTACT_TABLES) {
    for (const [name, type] of [
      ['immutable_rows', 27],
      ['immutable_truncate', 34],
      ...(table === 'client_contact_submission' ? [] : [['immutable_insert', 6]]),
    ] as const)
      expectedTriggers.push({
        schema: '_migration',
        table,
        name,
        type,
        enabled: 'O',
        function_schema: '_migration',
        function: 'client_contact_refuse_evidence_change',
        unconditional: true,
        arguments: 0,
      });
  }
  for (const table of ['clients', 'contacts'])
    for (const [name, type] of [
      ['zz_client_contact_guard', 31],
      ['client_contact_no_truncate', 34],
    ] as const)
      expectedTriggers.push({
        schema: 'public',
        table,
        name,
        type,
        enabled: 'O',
        function_schema: '_migration',
        function: 'client_contact_guard',
        unconditional: true,
        arguments: 0,
      });
  expectedTriggers.sort((a, b) =>
    `${a.schema}.${a.table}.${a.name}`.localeCompare(`${b.schema}.${b.table}.${b.name}`),
  );
  assert.deepEqual(
    triggers,
    expectedTriggers,
    'Client/contact immutable/lifecycle trigger semantics differ',
  );
}
