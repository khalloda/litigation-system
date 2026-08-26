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

const constraints = [
  ['attendance_pkey', 'public', 'attendance', 'p', true, 'PRIMARY KEY (id)'],
  [
    'attendance_source_identity_shape',
    'public',
    'attendance',
    'c',
    false,
    "CHECK ((legacy_id IS NULL AND legacy_person_raw IS NULL AND legacy_situation_raw IS NULL AND legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL OR legacy_source_record_key IS NOT NULL AND legacy_source_extraction_sha256 IS NOT NULL AND legacy_source_payload IS NOT NULL AND legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND jsonb_typeof(legacy_source_payload) = 'object'::text AND legacy_id IS NOT NULL AND person_id IS NOT NULL AND legacy_person_raw IS NOT NULL AND attendance_date IS NOT NULL AND NOT situation IS DISTINCT FROM legacy_situation_raw) IS TRUE)",
  ],
  [
    'attendance_transform_pkey',
    'quarantine',
    'attendance_transform',
    'p',
    true,
    'PRIMARY KEY (src_record_key)',
  ],
  [
    'attendance_transform_identity_shape',
    'quarantine',
    'attendance_transform',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text)",
  ],
  [
    'attendance_transform_reason_shape',
    'quarantine',
    'attendance_transform',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
] as const;

const foreignKeys = [
  [
    'attendance_person_id_fkey',
    'public',
    'attendance',
    ['person_id'],
    'public',
    'people',
    ['id'],
    'FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE SET NULL',
    'n',
  ],
] as const;

const indexes = [
  ['attendance_pkey', 'public', 'attendance', true, ['id']],
  ['attendance_legacy_id_key', 'public', 'attendance', true, ['legacy_id']],
  [
    'attendance_legacy_source_record_key_key',
    'public',
    'attendance',
    true,
    ['legacy_source_record_key'],
  ],
  ['attendance_person_id_idx', 'public', 'attendance', false, ['person_id']],
  ['attendance_attendance_date_idx', 'public', 'attendance', false, ['attendance_date']],
  ['attendance_transform_pkey', 'quarantine', 'attendance_transform', true, ['src_record_key']],
] as const;

const triggers = [
  [
    'attendance_legacy_no_change',
    'public',
    'attendance',
    27,
    'public',
    'refuse_legacy_attendance_change',
  ],
  [
    'attendance_no_truncate',
    'public',
    'attendance',
    34,
    'public',
    'refuse_legacy_attendance_change',
  ],
  [
    'attendance_transform_no_change',
    'quarantine',
    'attendance_transform',
    27,
    'quarantine',
    'refuse_attendance_evidence_change',
  ],
  [
    'attendance_transform_no_truncate',
    'quarantine',
    'attendance_transform',
    34,
    'quarantine',
    'refuse_attendance_evidence_change',
  ],
] as const;

const functions = [
  [
    'public',
    'refuse_legacy_attendance_change',
    `BEGIN
    IF TG_OP='TRUNCATE' THEN
        RAISE EXCEPTION 'Task 2.10B attendance TRUNCATE is refused';
    END IF;
    IF TG_OP='DELETE' THEN
        IF OLD.legacy_source_record_key IS NOT NULL THEN
            RAISE EXCEPTION 'Task 2.10B migrated attendance history cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.legacy_source_record_key IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10B migrated attendance history cannot be updated';
    END IF;
    IF NEW.legacy_id IS NOT NULL
       OR NEW.legacy_person_raw IS NOT NULL
       OR NEW.legacy_situation_raw IS NOT NULL
       OR NEW.legacy_source_record_key IS NOT NULL
       OR NEW.legacy_source_extraction_sha256 IS NOT NULL
       OR NEW.legacy_source_payload IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10B migration provenance cannot be attached by ordinary update';
    END IF;
    RETURN NEW;
END;`,
  ],
  [
    'quarantine',
    'refuse_attendance_evidence_change',
    `BEGIN
    IF TG_OP='UPDATE' THEN
        RAISE EXCEPTION 'Task 2.10B immutable attendance evidence cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.10B attendance evidence DELETE/TRUNCATE is refused';
END;`,
  ],
] as const;

function canon(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim();
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function attendanceStructureFailures(db: ClientBase): Promise<string[]> {
  const names = [...constraints.map((row) => row[0]), ...foreignKeys.map((row) => row[0])];
  const constraintRows = await db.query<ConstraintRow>(
    `SELECT con.conname name,ns.nspname schema_name,rel.relname table_name,
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
      WHERE con.conname=ANY($1::text[]) ORDER BY con.conname`,
    [names],
  );
  const indexRows = await db.query<IndexRow>(
    `SELECT ir.relname name,ins.nspname schema_name,tr.relname table_name,
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
      WHERE ir.relname=ANY($1::text[]) ORDER BY ir.relname`,
    [indexes.map((row) => row[0])],
  );
  const triggerRows = await db.query<TriggerRow>(
    `SELECT t.tgname name,ns.nspname schema_name,r.relname table_name,
            t.tgenabled::text enabled,t.tgisinternal internal,t.tgtype trigger_type,
            fns.nspname function_schema,p.proname function_name,
            pg_get_triggerdef(t.oid,true) definition
       FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
       JOIN pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
       JOIN pg_namespace fns ON fns.oid=p.pronamespace
      WHERE t.tgname=ANY($1::text[]) ORDER BY t.tgname`,
    [triggers.map((row) => row[0])],
  );
  const functionRows = await db.query<FunctionRow>(
    `SELECT format('%I.%I(%s)',ns.nspname,p.proname,
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
      WHERE ns.nspname||'.'||p.proname=ANY($1::text[])
      ORDER BY ns.nspname,p.proname`,
    [functions.map(([schema, name]) => `${schema}.${name}`)],
  );

  const failures: string[] = [];
  for (const [name, schema, table, type, noInherit, definition] of constraints) {
    const row = constraintRows.rows.find((item) => item.name === name);
    if (
      !row ||
      row.schema_name !== schema ||
      row.table_name !== table ||
      row.type !== type ||
      !row.validated ||
      row.no_inherit !== noInherit ||
      row.deferrable ||
      row.deferred ||
      canon(row.definition) !== canon(definition) ||
      row.target_schema !== null ||
      row.target_table !== null
    )
      failures.push(`constraint definition: ${name}${row ? ` [${row.definition}]` : ''}`);
  }
  for (const [
    name,
    schema,
    table,
    sourceColumns,
    targetSchema,
    targetTable,
    targetColumns,
    definition,
    deleteAction,
  ] of foreignKeys) {
    const row = constraintRows.rows.find((item) => item.name === name);
    if (
      !row ||
      row.schema_name !== schema ||
      row.table_name !== table ||
      row.type !== 'f' ||
      !row.validated ||
      !row.no_inherit ||
      row.deferrable ||
      row.deferred ||
      canon(row.definition) !== canon(definition) ||
      !same(row.source_columns, sourceColumns) ||
      row.target_schema !== targetSchema ||
      row.target_table !== targetTable ||
      !same(row.target_columns, targetColumns) ||
      row.update_action !== 'c' ||
      row.delete_action !== deleteAction ||
      row.match_type !== 's'
    )
      failures.push(`foreign-key definition: ${name}${row ? ` [${row.definition}]` : ''}`);
  }
  if (constraintRows.rows.length !== constraints.length + foreignKeys.length)
    failures.push('Task 2.10B constraint inventory');

  for (const [name, schema, table, unique, columns] of indexes) {
    const row = indexRows.rows.find((item) => item.name === name);
    const relation = schema === 'public' ? table : `${schema}.${table}`;
    const definition = `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${name} ON ${relation} USING btree (${columns.join(', ')})`;
    if (
      !row ||
      row.schema_name !== schema ||
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
      canon(row.definition) !== canon(definition)
    )
      failures.push(`index definition: ${name}${row ? ` [${row.definition}]` : ''}`);
  }
  if (indexRows.rows.length !== indexes.length) failures.push('Task 2.10B index inventory');

  for (const [name, schema, table, triggerType, functionSchema, functionName] of triggers) {
    const row = triggerRows.rows.find((item) => item.name === name);
    const event = triggerType === 27 ? 'DELETE OR UPDATE' : 'TRUNCATE';
    const scope = triggerType === 27 ? 'ROW' : 'STATEMENT';
    const relation = schema === 'public' ? table : `${schema}.${table}`;
    const target = functionSchema === 'public' ? functionName : `${functionSchema}.${functionName}`;
    const definition = `CREATE TRIGGER ${name} BEFORE ${event} ON ${relation} FOR EACH ${scope} EXECUTE FUNCTION ${target}()`;
    if (
      !row ||
      row.schema_name !== schema ||
      row.table_name !== table ||
      row.enabled !== 'O' ||
      row.internal ||
      row.trigger_type !== triggerType ||
      row.function_schema !== functionSchema ||
      row.function_name !== functionName ||
      canon(row.definition) !== canon(definition)
    )
      failures.push(`trigger definition: ${name}${row ? ` [${row.definition}]` : ''}`);
  }
  if (triggerRows.rows.length !== triggers.length) failures.push('Task 2.10B trigger inventory');

  for (const [schema, name, body] of functions) {
    const row = functionRows.rows.find((item) => item.schema_name === schema && item.name === name);
    if (
      !row ||
      row.signature !== `${schema}.${name}()` ||
      row.return_type !== 'trigger' ||
      row.arguments !== '' ||
      row.identity_arguments !== '' ||
      row.language_name !== 'plpgsql' ||
      row.function_kind !== 'f' ||
      row.volatility !== 'v' ||
      row.strict ||
      row.security_definer ||
      row.leakproof ||
      row.parallel_safety !== 'u' ||
      row.configuration !== null ||
      canon(row.body) !== canon(body)
    )
      failures.push(`function definition: ${schema}.${name}()`);
  }
  if (functionRows.rows.length !== functions.length) failures.push('Task 2.10B function inventory');
  return failures;
}
