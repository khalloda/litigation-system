import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';

/** Reviewed PostgreSQL 17 definitions, not regenerated from the inspected DB.
 * Check semantics, validity, target and uniqueness; names alone prove nothing. */
const CONSTRAINTS = [
  ['_migration', 'staff_roster_alias', 'staff_roster_alias_pkey', 'p', 'PRIMARY KEY (id)'],
  [
    '_migration',
    'staff_roster_boundary',
    'staff_roster_boundary_check',
    'c',
    "CHECK ((((profile = 'canonical-clean-replay'::text) AND (extraction_sha256 IS NULL)) OR ((profile = 'historical-full-state-upgrade'::text) AND (extraction_sha256 = '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979'::text))))",
  ],
  [
    '_migration',
    'staff_roster_boundary',
    'staff_roster_boundary_pkey',
    'p',
    'PRIMARY KEY (singleton)',
  ],
  [
    '_migration',
    'staff_roster_boundary',
    'staff_roster_boundary_profile_check',
    'c',
    "CHECK ((profile = ANY (ARRAY['historical-full-state-upgrade'::text, 'canonical-clean-replay'::text])))",
  ],
  [
    '_migration',
    'staff_roster_boundary',
    'staff_roster_boundary_singleton_check',
    'c',
    'CHECK (singleton)',
  ],
  [
    '_migration',
    'staff_roster_change',
    'staff_roster_change_audit_event_id_fkey',
    'f',
    'FOREIGN KEY (audit_event_id) REFERENCES audit_events(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
  ],
  [
    '_migration',
    'staff_roster_change',
    'staff_roster_change_audit_event_id_key',
    'u',
    'UNIQUE (audit_event_id)',
  ],
  [
    '_migration',
    'staff_roster_change',
    'staff_roster_change_entity_table_check',
    'c',
    "CHECK ((entity_table = ANY (ARRAY['people'::text, 'person_name_alias'::text, 'lookup_team'::text])))",
  ],
  [
    '_migration',
    'staff_roster_change',
    'staff_roster_change_event_sha256_check',
    'c',
    "CHECK ((event_sha256 ~ '^[a-f0-9]{64}$'::text))",
  ],
  [
    '_migration',
    'staff_roster_change',
    'staff_roster_change_pkey',
    'p',
    'PRIMARY KEY (entity_table, entity_id, revision)',
  ],
  [
    '_migration',
    'staff_roster_change',
    'staff_roster_change_revision_check',
    'c',
    'CHECK ((revision > 0))',
  ],
  [
    '_migration',
    'staff_roster_change',
    'staff_roster_change_row_sha256_check',
    'c',
    "CHECK ((row_sha256 ~ '^[a-f0-9]{64}$'::text))",
  ],
  ['_migration', 'staff_roster_mutex', 'staff_roster_mutex_pkey', 'p', 'PRIMARY KEY (singleton)'],
  [
    '_migration',
    'staff_roster_mutex',
    'staff_roster_mutex_singleton_check',
    'c',
    'CHECK (singleton)',
  ],
  ['_migration', 'staff_roster_person', 'staff_roster_person_pkey', 'p', 'PRIMARY KEY (id)'],
  ['_migration', 'staff_roster_team', 'staff_roster_team_pkey', 'p', 'PRIMARY KEY (id)'],
  ['public', 'lookup_team', 'lookup_team_row_version_check', 'c', 'CHECK ((row_version > 0))'],
  ['public', 'people', 'people_alias_epoch_check', 'c', 'CHECK ((alias_epoch >= 0))'],
  [
    'public',
    'people',
    'people_application_modification_pair',
    'c',
    'CHECK (((application_modified_at IS NULL) = (application_modified_by IS NULL)))',
  ],
  [
    'public',
    'people',
    'people_application_modified_by_fkey',
    'f',
    'FOREIGN KEY (application_modified_by) REFERENCES audit_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
  ],
  [
    'public',
    'people',
    'people_email_normalized_shape',
    'c',
    "CHECK (((email IS NULL) OR ((email = lower(btrim(email))) AND (email <> ''::text))))",
  ],
  ['public', 'people', 'people_row_version_check', 'c', 'CHECK ((row_version > 0))'],
  [
    'public',
    'person_name_alias',
    'person_name_alias_person_id_fkey',
    'f',
    'FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE RESTRICT',
  ],
  [
    'public',
    'person_name_alias',
    'staff_alias_retirement_shape',
    'c',
    'CHECK ((((NOT is_retired) OR (NOT is_primary)) AND ((retirement_reason IS NULL) OR ((retirement_reason = btrim(retirement_reason)) AND ((char_length(retirement_reason) >= 1) AND (char_length(retirement_reason) <= 2048)))) AND ((NOT is_retired) OR (retirement_reason IS NOT NULL))))',
  ],
] as const;
const INDEXES = [
  ...CONSTRAINTS.filter((row) => row[0] === '_migration' && (row[3] === 'p' || row[3] === 'u')).map(
    ([schema, table, name, , definition]) => ({
      schema,
      table,
      name,
      unique: true,
      valid: true,
      ready: true,
      definition: `CREATE UNIQUE INDEX ${name} ON ${schema}.${table} USING btree ${definition.slice(definition.indexOf('('))}`,
    }),
  ),
  {
    schema: 'public',
    table: 'people',
    name: 'people_email_key',
    unique: true,
    valid: true,
    ready: true,
    definition: 'CREATE UNIQUE INDEX people_email_key ON public.people USING btree (email)',
  },
  {
    schema: 'public',
    table: 'people',
    name: 'people_email_normalized_unique',
    unique: true,
    valid: true,
    ready: true,
    definition:
      'CREATE UNIQUE INDEX people_email_normalized_unique ON public.people USING btree (lower(btrim(email))) WHERE (email IS NOT NULL)',
  },
  {
    schema: 'public',
    table: 'person_name_alias',
    name: 'person_name_alias_active_normalized_idx',
    unique: false,
    valid: true,
    ready: true,
    definition:
      'CREATE INDEX person_name_alias_active_normalized_idx ON public.person_name_alias USING btree (alias_ar_normalised) WHERE (NOT is_retired)',
  },
];
export async function assertStaffConstraintsAndIndexes(db: ClientBase): Promise<void> {
  const constraints = (
    await db.query(
      `SELECT n.nspname::text schema,c.relname::text "table",k.conname::text name,k.contype::text type,k.convalidated validated,k.condeferrable deferrable,k.condeferred deferred,pg_get_constraintdef(k.oid) definition
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='_migration' AND c.relname LIKE 'staff_roster_%') OR (n.nspname='public' AND k.conname=ANY($1::text[]))`,
      [CONSTRAINTS.filter((row) => row[0] === 'public').map((row) => row[2])],
    )
  ).rows;
  const indexes = (
    await db.query(
      `SELECT n.nspname::text schema,c.relname::text "table",i.relname::text name,x.indisunique unique,x.indisvalid valid,x.indisready ready,pg_get_indexdef(i.oid) definition
    FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='_migration' AND c.relname LIKE 'staff_roster_%') OR i.relname=ANY($1::text[])`,
      [INDEXES.filter((row) => row.schema === 'public').map((row) => row.name)],
    )
  ).rows;
  const ordered = <T extends { schema: string; table: string; name: string }>(rows: T[]) =>
    rows.sort((a, b) =>
      `${a.schema}.${a.table}.${a.name}`.localeCompare(`${b.schema}.${b.table}.${b.name}`),
    );
  assert.deepEqual(
    ordered(constraints),
    ordered(
      CONSTRAINTS.map(([schema, table, name, type, definition]) => ({
        schema,
        table,
        name,
        type,
        validated: true,
        deferrable: false,
        deferred: false,
        definition,
      })),
    ),
    'Staff constraint semantics or enforcement differs',
  );
  assert.deepEqual(
    ordered(indexes),
    ordered([...INDEXES]),
    'Staff unique/index semantics or validity differs',
  );
}
