import type { ClientBase } from 'pg';

type ConstraintRow = {
  name: string;
  schema_name: string;
  table_name: string;
  type: string;
  validated: boolean;
  no_inherit: boolean;
  deferrable: boolean;
  deferred: boolean;
  definition: string;
  source_columns: string[];
  target_schema: string | null;
  target_table: string | null;
  target_columns: string[];
  update_action: string;
  delete_action: string;
  match_type: string;
};
type IndexRow = {
  name: string;
  schema_name: string;
  table_name: string;
  method: string;
  unique_index: boolean;
  valid: boolean;
  ready: boolean;
  live: boolean;
  immediate: boolean;
  nulls_not_distinct: boolean;
  clustered: boolean;
  exclusion: boolean;
  key_count: number;
  attribute_count: number;
  columns: string[];
  predicate: string | null;
  expressions: string | null;
  definition: string;
};
type TriggerRow = {
  name: string;
  schema_name: string;
  table_name: string;
  enabled: string;
  internal: boolean;
  trigger_type: number;
  function_schema: string;
  function_name: string;
  definition: string;
};
type FunctionRow = {
  signature: string;
  name: string;
  schema_name: string;
  return_type: string;
  arguments: string;
  identity_arguments: string;
  language_name: string;
  function_kind: string;
  volatility: string;
  strict: boolean;
  security_definer: boolean;
  leakproof: boolean;
  parallel_safety: string;
  configuration: string[] | null;
  body: string;
};

const constraintDefinitions: Readonly<Record<string, string>> = {
  client_logos_pkey: 'PRIMARY KEY (id)',
  client_logos_client_id_fkey:
    'FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE CASCADE ON DELETE CASCADE',
  client_logos_relative_path_shape:
    "CHECK (relative_path ~ '^[1-9][0-9]*/[^/\\\\]+$'::text AND relative_path = ((client_id::text || '/'::text) || file_name))",
  client_logos_file_name_shape:
    "CHECK (file_name <> ''::text AND file_name !~ '[/\\\\]'::text AND file_name !~ '[[:cntrl:]]'::text AND (file_name <> ALL (ARRAY['.'::text, '..'::text])) AND file_name !~ '[. ]$'::text AND file_name !~* '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\..*)?$'::text)",
  client_logos_content_type_shape:
    "CHECK (content_type = ANY (ARRAY['image/gif'::text, 'image/jpeg'::text, 'image/png'::text]))",
  client_logos_byte_size_shape: 'CHECK (byte_size > 0)',
  client_logos_sha256_shape: "CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)",
  migration_client_logo_import_pkey: 'PRIMARY KEY (source_parent_key)',
  migration_client_logo_import_client_id_key: 'UNIQUE (client_id)',
  migration_client_logo_import_client_logo_id_key: 'UNIQUE (client_logo_id)',
  migration_client_logo_import_source_record_key_key: 'UNIQUE (source_record_key)',
  migration_client_logo_import_source_stored_path_key: 'UNIQUE (source_stored_path)',
  migration_client_logo_import_destination_relative_path_key: 'UNIQUE (destination_relative_path)',
  migration_client_logo_import_client_id_fkey:
    'FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE CASCADE ON DELETE RESTRICT',
  migration_client_logo_import_identity_shape:
    "CHECK (source_parent_key > 0 AND client_id > 0 AND client_logo_id > 0 AND source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text)",
  migration_client_logo_import_file_shape:
    "CHECK (source_file_name <> ''::text AND source_file_name !~ '[/\\\\]'::text AND source_file_name !~ '[[:cntrl:]]'::text AND (source_file_name <> ALL (ARRAY['.'::text, '..'::text])) AND source_file_name !~ '[. ]$'::text AND (detected_content_type = ANY (ARRAY['image/gif'::text, 'image/jpeg'::text, 'image/png'::text])) AND byte_size > 0 AND sha256 ~ '^[0-9a-f]{64}$'::text AND complex_csv_sha256 ~ '^[0-9a-f]{64}$'::text AND destination_relative_path = ((client_id::text || '/'::text) || source_file_name))",
};

const indexes = [
  ['client_logos_pkey', 'client_logos', true, ['id']],
  ['client_logos_client_id_key', 'client_logos', true, ['client_id']],
  [
    'migration_client_logo_import_pkey',
    'migration_client_logo_import',
    true,
    ['source_parent_key'],
  ],
  [
    'migration_client_logo_import_client_id_key',
    'migration_client_logo_import',
    true,
    ['client_id'],
  ],
  [
    'migration_client_logo_import_client_logo_id_key',
    'migration_client_logo_import',
    true,
    ['client_logo_id'],
  ],
  [
    'migration_client_logo_import_source_record_key_key',
    'migration_client_logo_import',
    true,
    ['source_record_key'],
  ],
  [
    'migration_client_logo_import_source_stored_path_key',
    'migration_client_logo_import',
    true,
    ['source_stored_path'],
  ],
  [
    'migration_client_logo_import_destination_relative_path_key',
    'migration_client_logo_import',
    true,
    ['destination_relative_path'],
  ],
] as const;

const triggers = [
  ['migration_client_logo_import_no_change', 27],
  ['migration_client_logo_import_no_truncate', 34],
] as const;

const functionBody = `BEGIN
    IF TG_OP='UPDATE' THEN
        RAISE EXCEPTION 'Task 2.11 immutable client-logo import evidence cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.11 client-logo import evidence DELETE/TRUNCATE is refused';
END;`;

function canon(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim();
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function clientLogoStructureFailures(db: ClientBase): Promise<string[]> {
  const constraintRows = await db.query<ConstraintRow>(`
    SELECT con.conname name,ns.nspname schema_name,rel.relname table_name,
           con.contype::text type,con.convalidated validated,con.connoinherit no_inherit,
           con.condeferrable deferrable,con.condeferred deferred,
           pg_get_constraintdef(con.oid,true) definition,
           coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)
             FROM unnest(con.conkey) WITH ORDINALITY k(attnum,ordinality)
             JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum),
             ARRAY[]::name[])::text[] source_columns,
           tns.nspname target_schema,trel.relname target_table,
           coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)
             FROM unnest(con.confkey) WITH ORDINALITY k(attnum,ordinality)
             JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum),
             ARRAY[]::name[])::text[] target_columns,
           con.confupdtype::text update_action,con.confdeltype::text delete_action,
           con.confmatchtype::text match_type
      FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      LEFT JOIN pg_class trel ON trel.oid=con.confrelid
      LEFT JOIN pg_namespace tns ON tns.oid=trel.relnamespace
     WHERE ns.nspname='public' AND rel.relname IN ('client_logos','migration_client_logo_import')
     ORDER BY con.conname`);
  const indexRows = await db.query<IndexRow>(`
    SELECT ir.relname name,ins.nspname schema_name,tr.relname table_name,
           am.amname method,i.indisunique unique_index,i.indisvalid valid,
           i.indisready ready,i.indislive live,i.indimmediate immediate,
           i.indnullsnotdistinct nulls_not_distinct,i.indisclustered clustered,
           i.indisexclusion exclusion,i.indnkeyatts key_count,i.indnatts attribute_count,
           ARRAY(SELECT pg_get_indexdef(i.indexrelid,n,true)
                   FROM generate_series(1,i.indnkeyatts)n ORDER BY n) columns,
           pg_get_expr(i.indpred,i.indrelid,true) predicate,
           pg_get_expr(i.indexprs,i.indrelid,true) expressions,
           pg_get_indexdef(i.indexrelid,0,true) definition
      FROM pg_index i JOIN pg_class ir ON ir.oid=i.indexrelid
      JOIN pg_namespace ins ON ins.oid=ir.relnamespace
      JOIN pg_class tr ON tr.oid=i.indrelid JOIN pg_am am ON am.oid=ir.relam
     WHERE ins.nspname='public' AND tr.relname IN ('client_logos','migration_client_logo_import')
     ORDER BY ir.relname`);
  const triggerRows = await db.query<TriggerRow>(`
    SELECT t.tgname name,ns.nspname schema_name,r.relname table_name,
           t.tgenabled::text enabled,t.tgisinternal internal,t.tgtype trigger_type,
           fns.nspname function_schema,p.proname function_name,
           pg_get_triggerdef(t.oid,true) definition
      FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
      JOIN pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
      JOIN pg_namespace fns ON fns.oid=p.pronamespace
     WHERE ns.nspname='public' AND r.relname='migration_client_logo_import' AND NOT t.tgisinternal
     ORDER BY t.tgname`);
  const functionRows = await db.query<FunctionRow>(`
    SELECT format('%I.%I(%s)',ns.nspname,p.proname,
                  pg_get_function_identity_arguments(p.oid)) signature,
           p.proname name,ns.nspname schema_name,
           pg_get_function_result(p.oid) return_type,
           pg_get_function_arguments(p.oid) arguments,
           pg_get_function_identity_arguments(p.oid) identity_arguments,
           l.lanname language_name,p.prokind::text function_kind,
           p.provolatile::text volatility,p.proisstrict strict,
           p.prosecdef security_definer,p.proleakproof leakproof,
           p.proparallel::text parallel_safety,p.proconfig configuration,p.prosrc body
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang
     WHERE ns.nspname='public' AND p.proname='refuse_client_logo_import_change'`);

  const failures: string[] = [];
  for (const [name, definition] of Object.entries(constraintDefinitions)) {
    const row = constraintRows.rows.find((item) => item.name === name);
    const isForeignKey = name.endsWith('_fkey');
    if (
      !row ||
      row.schema_name !== 'public' ||
      !['client_logos', 'migration_client_logo_import'].includes(row.table_name) ||
      !row.validated ||
      (row.type === 'c' ? row.no_inherit : !row.no_inherit) ||
      row.deferrable ||
      row.deferred ||
      canon(row.definition) !== canon(definition) ||
      (isForeignKey &&
        (row.type !== 'f' ||
          !same(row.source_columns, ['client_id']) ||
          row.target_schema !== 'public' ||
          row.target_table !== 'clients' ||
          !same(row.target_columns, ['id']) ||
          row.update_action !== 'c' ||
          row.delete_action !== (name.startsWith('client_logos_') ? 'c' : 'r') ||
          row.match_type !== 's')) ||
      (!isForeignKey && row.target_schema !== null)
    )
      failures.push(`constraint definition: ${name}${row ? ` [${row.definition}]` : ''}`);
  }
  if (constraintRows.rows.length !== Object.keys(constraintDefinitions).length)
    failures.push(`Task 2.11 constraint inventory: ${constraintRows.rows.length}`);

  for (const [name, table, unique, columns] of indexes) {
    const row = indexRows.rows.find((item) => item.name === name);
    const expectedDefinition = `CREATE UNIQUE INDEX ${name} ON ${table} USING btree (${columns.join(', ')})`;
    if (
      !row ||
      row.schema_name !== 'public' ||
      row.table_name !== table ||
      row.method !== 'btree' ||
      row.unique_index !== unique ||
      !row.valid ||
      !row.ready ||
      !row.live ||
      !row.immediate ||
      row.nulls_not_distinct ||
      row.clustered ||
      row.exclusion ||
      row.key_count !== columns.length ||
      row.attribute_count !== columns.length ||
      !same(row.columns, columns) ||
      row.predicate !== null ||
      row.expressions !== null ||
      canon(row.definition) !== canon(expectedDefinition)
    )
      failures.push(`index definition: ${name}${row ? ` [${row.definition}]` : ''}`);
  }
  if (indexRows.rows.length !== indexes.length)
    failures.push(`Task 2.11 index inventory: ${indexRows.rows.length}`);

  for (const [name, triggerType] of triggers) {
    const row = triggerRows.rows.find((item) => item.name === name);
    const event = triggerType === 27 ? 'DELETE OR UPDATE' : 'TRUNCATE';
    const scope = triggerType === 27 ? 'ROW' : 'STATEMENT';
    const expectedDefinition = `CREATE TRIGGER ${name} BEFORE ${event} ON migration_client_logo_import FOR EACH ${scope} EXECUTE FUNCTION refuse_client_logo_import_change()`;
    if (
      !row ||
      row.schema_name !== 'public' ||
      row.table_name !== 'migration_client_logo_import' ||
      row.enabled !== 'O' ||
      row.internal ||
      row.trigger_type !== triggerType ||
      row.function_schema !== 'public' ||
      row.function_name !== 'refuse_client_logo_import_change' ||
      canon(row.definition) !== canon(expectedDefinition)
    )
      failures.push(`trigger definition: ${name}${row ? ` [${row.definition}]` : ''}`);
  }
  if (triggerRows.rows.length !== triggers.length)
    failures.push(`Task 2.11 trigger inventory: ${triggerRows.rows.length}`);

  const functionRow = functionRows.rows[0];
  if (
    functionRows.rows.length !== 1 ||
    !functionRow ||
    functionRow.signature !== 'public.refuse_client_logo_import_change()' ||
    functionRow.return_type !== 'trigger' ||
    functionRow.arguments !== '' ||
    functionRow.identity_arguments !== '' ||
    functionRow.language_name !== 'plpgsql' ||
    functionRow.function_kind !== 'f' ||
    functionRow.volatility !== 'v' ||
    functionRow.strict ||
    functionRow.security_definer ||
    functionRow.leakproof ||
    functionRow.parallel_safety !== 'u' ||
    functionRow.configuration !== null ||
    canon(functionRow.body) !== canon(functionBody)
  )
    failures.push('function definition: public.refuse_client_logo_import_change()');
  return failures;
}
