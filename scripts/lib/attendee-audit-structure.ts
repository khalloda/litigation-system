import type { ClientBase } from 'pg';

type ConstraintRow = {
  name: string;
  schema_name: string;
  table_name: string;
  constraint_type: string;
  validated: boolean;
  no_inherit: boolean;
  deferrable: boolean;
  initially_deferred: boolean;
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
  table_schema: string;
  table_name: string;
  access_method: string;
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

const EXPECTED_CONSTRAINTS = [
  {
    name: 'attendee_source_cell_pkey',
    schema: '_migration',
    table: 'attendee_source_cell',
    type: 'p',
    noInherit: true,
    definition: 'PRIMARY KEY (cell_id)',
  },
  {
    name: 'attendee_source_cell_durable_key',
    schema: '_migration',
    table: 'attendee_source_cell',
    type: 'u',
    noInherit: true,
    definition: 'UNIQUE (source_table, src_record_key, source_column)',
  },
  {
    name: 'attendee_source_cell_identity_shape',
    schema: '_migration',
    table: 'attendee_source_cell',
    type: 'c',
    noInherit: false,
    definition:
      "CHECK (source_table = 'الجلسات'::text AND src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND cell_id ~ '^[0-9a-f]{64}$'::text AND original_cell_sha256 ~ '^[0-9a-f]{64}$'::text AND src_row_num > 0 AND original_cell <> ''::text AND decomposition_version = 1)",
  },
  {
    name: 'attendee_source_cell_column',
    schema: '_migration',
    table: 'attendee_source_cell',
    type: 'c',
    noInherit: false,
    definition:
      "CHECK (source_column = 'الحاضر'::text AND source_column_ordinal = 1 OR source_column = 'حاضر 1'::text AND source_column_ordinal = 2 OR source_column = 'حاضر 2'::text AND source_column_ordinal = 3 OR source_column = 'حاضر 3'::text AND source_column_ordinal = 4 OR source_column = 'حاضر 4'::text AND source_column_ordinal = 5)",
  },
  {
    name: 'attendee_source_cell_id_matches',
    schema: '_migration',
    table: 'attendee_source_cell',
    type: 'c',
    noInherit: false,
    definition:
      'CHECK (cell_id = _migration.attendee_cell_id(source_table, src_record_key, source_column))',
  },
  {
    name: 'attendee_source_cell_content_matches',
    schema: '_migration',
    table: 'attendee_source_cell',
    type: 'c',
    noInherit: false,
    definition:
      'CHECK (original_cell_sha256 = _migration.attendee_cell_content_sha256(original_cell))',
  },
  {
    name: 'attendee_source_cell_review_value_id_fkey',
    schema: '_migration',
    table: 'attendee_source_cell',
    type: 'f',
    noInherit: true,
    definition:
      'FOREIGN KEY (review_value_id) REFERENCES quarantine.review_value(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    source: ['review_value_id'],
    targetSchema: 'quarantine',
    targetTable: 'review_value',
    target: ['id'],
  },
  {
    name: 'attendee_source_span_pkey',
    schema: '_migration',
    table: 'attendee_source_span',
    type: 'p',
    noInherit: true,
    definition: 'PRIMARY KEY (fragment_id)',
  },
  {
    name: 'attendee_source_span_sequence',
    schema: '_migration',
    table: 'attendee_source_span',
    type: 'u',
    noInherit: true,
    definition: 'UNIQUE (cell_id, sequence)',
  },
  {
    name: 'attendee_source_span_offsets',
    schema: '_migration',
    table: 'attendee_source_span',
    type: 'u',
    noInherit: true,
    definition: 'UNIQUE (cell_id, start_offset, end_offset)',
  },
  {
    name: 'attendee_source_span_identity_shape',
    schema: '_migration',
    table: 'attendee_source_span',
    type: 'c',
    noInherit: false,
    definition:
      "CHECK (fragment_id ~ '^[0-9a-f]{64}$'::text AND src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND original_cell_sha256 ~ '^[0-9a-f]{64}$'::text AND sequence > 0 AND line > 0 AND start_offset >= 0 AND end_offset > start_offset AND raw <> ''::text)",
  },
  {
    name: 'attendee_source_span_fragment_id_matches',
    schema: '_migration',
    table: 'attendee_source_span',
    type: 'c',
    noInherit: false,
    definition:
      'CHECK (fragment_id = _migration.attendee_fragment_id(cell_id, start_offset, end_offset, raw))',
  },
  {
    name: 'attendee_source_span_classification',
    schema: '_migration',
    table: 'attendee_source_span',
    type: 'c',
    noInherit: false,
    definition:
      "CHECK (kind = 'person'::text AND (classification_rule = ANY (ARRAY['exact_person_alias'::text, 'reviewed_person_alias'::text])) AND person_id IS NOT NULL AND review_required = false OR kind = 'date'::text AND classification_rule = 'calendar_date'::text AND person_id IS NULL AND review_required = false OR kind = 'title'::text AND classification_rule = 'known_title'::text AND person_id IS NULL AND review_required = false OR kind = 'role'::text AND (classification_rule = ANY (ARRAY['known_role'::text, 'known_parenthetical_role'::text])) AND person_id IS NULL AND review_required = false OR kind = 'placeholder'::text AND classification_rule = 'known_placeholder'::text AND person_id IS NULL AND review_required = false OR kind = 'note'::text AND (classification_rule = ANY (ARRAY['known_note'::text, 'known_parenthetical_note'::text, 'reviewed_not_a_name'::text])) AND person_id IS NULL AND review_required = false OR kind = 'ambiguous'::text AND classification_rule = 'unclassified_review'::text AND person_id IS NULL AND review_required = true OR kind = 'separator'::text AND (classification_rule = ANY (ARRAY['line_break'::text, 'punctuation_separator'::text, 'horizontal_whitespace'::text])) AND person_id IS NULL AND review_required = false)",
  },
  {
    name: 'attendee_source_span_cell_id_fkey',
    schema: '_migration',
    table: 'attendee_source_span',
    type: 'f',
    noInherit: true,
    definition:
      'FOREIGN KEY (cell_id) REFERENCES _migration.attendee_source_cell(cell_id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    source: ['cell_id'],
    targetSchema: '_migration',
    targetTable: 'attendee_source_cell',
    target: ['cell_id'],
  },
  {
    name: 'attendee_source_span_person_id_fkey',
    schema: '_migration',
    table: 'attendee_source_span',
    type: 'f',
    noInherit: true,
    definition:
      'FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    source: ['person_id'],
    targetSchema: 'public',
    targetTable: 'people',
    target: ['id'],
  },
  {
    name: 'attendee_span_pkey',
    schema: 'quarantine',
    table: 'attendee_span',
    type: 'p',
    noInherit: true,
    definition: 'PRIMARY KEY (fragment_id)',
  },
  {
    name: 'attendee_span_fragment_id_fkey',
    schema: 'quarantine',
    table: 'attendee_span',
    type: 'f',
    noInherit: true,
    definition:
      'FOREIGN KEY (fragment_id) REFERENCES _migration.attendee_source_span(fragment_id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    source: ['fragment_id'],
    targetSchema: '_migration',
    targetTable: 'attendee_source_span',
    target: ['fragment_id'],
  },
  {
    name: 'attendee_span_cell_fk',
    schema: 'quarantine',
    table: 'attendee_span',
    type: 'f',
    noInherit: true,
    definition:
      'FOREIGN KEY (cell_id) REFERENCES _migration.attendee_source_cell(cell_id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    source: ['cell_id'],
    targetSchema: '_migration',
    targetTable: 'attendee_source_cell',
    target: ['cell_id'],
  },
  {
    name: 'attendee_span_reason',
    schema: 'quarantine',
    table: 'attendee_span',
    type: 'c',
    noInherit: false,
    definition:
      "CHECK (classification_rule = 'unclassified_review'::text AND reason_code = 'ambiguous_attendee_fragment'::text AND jsonb_typeof(reason_detail) = 'object'::text)",
  },
] as const;

const EXPECTED_INDEXES = [
  [
    'attendee_source_cell_pkey',
    '_migration',
    'attendee_source_cell',
    true,
    ['cell_id'],
    null,
    'CREATE UNIQUE INDEX attendee_source_cell_pkey ON _migration.attendee_source_cell USING btree (cell_id)',
  ],
  [
    'attendee_source_cell_durable_key',
    '_migration',
    'attendee_source_cell',
    true,
    ['source_table', 'src_record_key', 'source_column'],
    null,
    'CREATE UNIQUE INDEX attendee_source_cell_durable_key ON _migration.attendee_source_cell USING btree (source_table, src_record_key, source_column)',
  ],
  [
    'attendee_source_span_pkey',
    '_migration',
    'attendee_source_span',
    true,
    ['fragment_id'],
    null,
    'CREATE UNIQUE INDEX attendee_source_span_pkey ON _migration.attendee_source_span USING btree (fragment_id)',
  ],
  [
    'attendee_source_span_sequence',
    '_migration',
    'attendee_source_span',
    true,
    ['cell_id', 'sequence'],
    null,
    'CREATE UNIQUE INDEX attendee_source_span_sequence ON _migration.attendee_source_span USING btree (cell_id, sequence)',
  ],
  [
    'attendee_source_span_offsets',
    '_migration',
    'attendee_source_span',
    true,
    ['cell_id', 'start_offset', 'end_offset'],
    null,
    'CREATE UNIQUE INDEX attendee_source_span_offsets ON _migration.attendee_source_span USING btree (cell_id, start_offset, end_offset)',
  ],
  [
    'attendee_source_span_person_id',
    '_migration',
    'attendee_source_span',
    false,
    ['person_id'],
    'person_id IS NOT NULL',
    'CREATE INDEX attendee_source_span_person_id ON _migration.attendee_source_span USING btree (person_id) WHERE person_id IS NOT NULL',
  ],
  [
    'attendee_span_pkey',
    'quarantine',
    'attendee_span',
    true,
    ['fragment_id'],
    null,
    'CREATE UNIQUE INDEX attendee_span_pkey ON quarantine.attendee_span USING btree (fragment_id)',
  ],
] as const;

const EXPECTED_TRIGGERS = [
  [
    'attendee_source_cell_immutable',
    '_migration',
    'attendee_source_cell',
    19,
    'refuse_attendee_audit_row_change',
  ],
  [
    'attendee_source_cell_no_erasure',
    '_migration',
    'attendee_source_cell',
    42,
    'refuse_attendee_audit_erasure',
  ],
  [
    'attendee_source_span_immutable',
    '_migration',
    'attendee_source_span',
    19,
    'refuse_attendee_audit_row_change',
  ],
  [
    'attendee_source_span_no_erasure',
    '_migration',
    'attendee_source_span',
    42,
    'refuse_attendee_audit_erasure',
  ],
  [
    'attendee_span_immutable',
    'quarantine',
    'attendee_span',
    19,
    'refuse_attendee_audit_row_change',
  ],
  ['attendee_span_no_erasure', 'quarantine', 'attendee_span', 42, 'refuse_attendee_audit_erasure'],
] as const;

const EXPECTED_FUNCTIONS = [
  {
    signature: '_migration.attendee_cell_id(text,text,text)',
    name: 'attendee_cell_id',
    result: 'text',
    arguments: 'p_source_table text, p_src_record_key text, p_source_column text',
    language: 'sql',
    volatility: 'i',
    strict: true,
    parallel: 's',
    configuration: null,
    body: `
    SELECT encode(sha256(convert_to(
        octet_length('attendee-cell-v1')::text || ':attendee-cell-v1' ||
        octet_length(p_source_table)::text || ':' || p_source_table ||
        octet_length(p_src_record_key)::text || ':' || p_src_record_key ||
        octet_length(p_source_column)::text || ':' || p_source_column,
        'UTF8'
    )), 'hex');
`,
  },
  {
    signature: '_migration.attendee_cell_content_sha256(text)',
    name: 'attendee_cell_content_sha256',
    result: 'text',
    arguments: 'p_value text',
    language: 'sql',
    volatility: 'i',
    strict: true,
    parallel: 's',
    configuration: null,
    body: `
    SELECT encode(sha256(convert_to(
        octet_length('attendee-cell-content-v1')::text || ':attendee-cell-content-v1' ||
        octet_length(p_value)::text || ':' || p_value,
        'UTF8'
    )), 'hex');
`,
  },
  {
    signature: '_migration.attendee_fragment_id(text,integer,integer,text)',
    name: 'attendee_fragment_id',
    result: 'text',
    arguments: 'p_cell_id text, p_start_offset integer, p_end_offset integer, p_raw text',
    language: 'sql',
    volatility: 'i',
    strict: true,
    parallel: 's',
    configuration: null,
    body: `
    SELECT encode(sha256(convert_to(
        octet_length('attendee-fragment-v1')::text || ':attendee-fragment-v1' ||
        octet_length(p_cell_id)::text || ':' || p_cell_id ||
        octet_length(p_start_offset::text)::text || ':' || p_start_offset::text ||
        octet_length(p_end_offset::text)::text || ':' || p_end_offset::text ||
        octet_length(p_raw)::text || ':' || p_raw,
        'UTF8'
    )), 'hex');
`,
  },
  {
    signature: '_migration.refuse_attendee_audit_row_change()',
    name: 'refuse_attendee_audit_row_change',
    result: 'trigger',
    arguments: '',
    language: 'plpgsql',
    volatility: 'v',
    strict: false,
    parallel: 'u',
    configuration: null,
    body: `
BEGIN
    RAISE EXCEPTION '% is immutable migration evidence; % is refused',
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP;
END;
`,
  },
  {
    signature: '_migration.refuse_attendee_audit_erasure()',
    name: 'refuse_attendee_audit_erasure',
    result: 'trigger',
    arguments: '',
    language: 'plpgsql',
    volatility: 'v',
    strict: false,
    parallel: 'u',
    configuration: null,
    body: `
BEGIN
    RAISE EXCEPTION '% is immutable migration evidence; DELETE/TRUNCATE is refused',
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
END;
`,
  },
] as const;

function canonical(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim();
}

function sameStrings(actual: string[], expected: readonly string[]): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sameConfiguration(actual: string[] | null, expected: readonly string[] | null): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export async function attendeeAuditStructureFailures(db: ClientBase): Promise<string[]> {
  const constraintNames = EXPECTED_CONSTRAINTS.map((row) => row.name);
  const constraints = await db.query<ConstraintRow>(
    `SELECT con.conname AS name, ns.nspname AS schema_name, rel.relname AS table_name,
            con.contype::text AS constraint_type, con.convalidated AS validated,
            con.connoinherit AS no_inherit, con.condeferrable AS deferrable,
            con.condeferred AS initially_deferred,
            pg_get_constraintdef(con.oid, true) AS definition,
            coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)
                        FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ordinality)
                        JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum), ARRAY[]::name[])::text[] AS source_columns,
            target_ns.nspname AS target_schema, target_rel.relname AS target_table,
            coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)
                        FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ordinality)
                        JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum), ARRAY[]::name[])::text[] AS target_columns,
            con.confupdtype::text AS update_action, con.confdeltype::text AS delete_action,
            con.confmatchtype::text AS match_type
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace
       LEFT JOIN pg_class target_rel ON target_rel.oid=con.confrelid
       LEFT JOIN pg_namespace target_ns ON target_ns.oid=target_rel.relnamespace
      WHERE con.conname=ANY($1::text[]) ORDER BY con.conname`,
    [constraintNames],
  );

  const indexNames = EXPECTED_INDEXES.map((row) => row[0]);
  const indexes = await db.query<IndexRow>(
    `SELECT index_rel.relname AS name, index_ns.nspname AS schema_name,
            table_ns.nspname AS table_schema, table_rel.relname AS table_name,
            am.amname AS access_method, i.indisunique AS unique_index,
            i.indisvalid AS valid, i.indisready AS ready, i.indislive AS live,
            i.indimmediate AS immediate, i.indnullsnotdistinct AS nulls_not_distinct,
            i.indisclustered AS clustered, i.indisexclusion AS exclusion,
            i.indnkeyatts AS key_count, i.indnatts AS attribute_count,
            ARRAY(SELECT pg_get_indexdef(i.indexrelid,n,true)
                    FROM generate_series(1,i.indnkeyatts)n ORDER BY n) AS columns,
            pg_get_expr(i.indpred,i.indrelid,true) AS predicate,
            pg_get_expr(i.indexprs,i.indrelid,true) AS expressions,
            pg_get_indexdef(i.indexrelid,0,true) AS definition
       FROM pg_index i JOIN pg_class index_rel ON index_rel.oid=i.indexrelid
       JOIN pg_namespace index_ns ON index_ns.oid=index_rel.relnamespace
       JOIN pg_class table_rel ON table_rel.oid=i.indrelid
       JOIN pg_namespace table_ns ON table_ns.oid=table_rel.relnamespace
       JOIN pg_am am ON am.oid=index_rel.relam
      WHERE index_rel.relname=ANY($1::text[]) ORDER BY index_rel.relname`,
    [indexNames],
  );

  const triggerNames = EXPECTED_TRIGGERS.map((row) => row[0]);
  const triggers = await db.query<TriggerRow>(
    `SELECT t.tgname AS name, ns.nspname AS schema_name, rel.relname AS table_name,
            t.tgenabled::text AS enabled, t.tgisinternal AS internal,
            t.tgtype AS trigger_type, function_ns.nspname AS function_schema,
            p.proname AS function_name, pg_get_triggerdef(t.oid,true) AS definition
       FROM pg_trigger t JOIN pg_class rel ON rel.oid=t.tgrelid
       JOIN pg_namespace ns ON ns.oid=rel.relnamespace
       JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace function_ns ON function_ns.oid=p.pronamespace
      WHERE t.tgname=ANY($1::text[]) ORDER BY t.tgname`,
    [triggerNames],
  );

  const functionSignatures = EXPECTED_FUNCTIONS.map((row) => row.signature);
  const functions = await db.query<FunctionRow>(
    `SELECT p.oid::regprocedure::text AS signature, p.proname AS name,
            ns.nspname AS schema_name, pg_get_function_result(p.oid) AS return_type,
            pg_get_function_arguments(p.oid) AS arguments,
            pg_get_function_identity_arguments(p.oid) AS identity_arguments,
            language.lanname AS language_name, p.prokind::text AS function_kind,
            p.provolatile::text AS volatility, p.proisstrict AS strict,
            p.prosecdef AS security_definer, p.proleakproof AS leakproof,
            p.proparallel::text AS parallel_safety, p.proconfig AS configuration,
            p.prosrc AS body
       FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
       JOIN pg_language language ON language.oid=p.prolang
      WHERE p.oid=ANY($1::regprocedure[]) ORDER BY p.oid::regprocedure::text`,
    [functionSignatures],
  );

  const failures: string[] = [];
  for (const expected of EXPECTED_CONSTRAINTS) {
    const actual = constraints.rows.find((row) => row.name === expected.name);
    const fk = 'source' in expected;
    if (
      actual === undefined ||
      actual.schema_name !== expected.schema ||
      actual.table_name !== expected.table ||
      actual.constraint_type !== expected.type ||
      !actual.validated ||
      actual.no_inherit !== expected.noInherit ||
      actual.deferrable ||
      actual.initially_deferred ||
      canonical(actual.definition) !== canonical(expected.definition) ||
      (fk &&
        (!sameStrings(actual.source_columns, expected.source) ||
          actual.target_schema !== expected.targetSchema ||
          actual.target_table !== expected.targetTable ||
          !sameStrings(actual.target_columns, expected.target) ||
          actual.update_action !== 'r' ||
          actual.delete_action !== 'r' ||
          actual.match_type !== 's')) ||
      (!fk &&
        (actual.target_schema !== null ||
          actual.target_table !== null ||
          actual.target_columns.length !== 0))
    )
      failures.push(`constraint definition: ${expected.name}`);
  }
  if (constraints.rows.length !== EXPECTED_CONSTRAINTS.length)
    failures.push('Correction B constraint inventory');

  for (const [name, schema, table, unique, columns, predicate, definition] of EXPECTED_INDEXES) {
    const actual = indexes.rows.find((row) => row.name === name);
    if (
      actual === undefined ||
      actual.schema_name !== schema ||
      actual.table_schema !== schema ||
      actual.table_name !== table ||
      actual.access_method !== 'btree' ||
      actual.unique_index !== unique ||
      !actual.valid ||
      !actual.ready ||
      !actual.live ||
      !actual.immediate ||
      actual.nulls_not_distinct ||
      actual.clustered ||
      actual.exclusion ||
      actual.key_count !== columns.length ||
      actual.attribute_count !== columns.length ||
      !sameStrings(actual.columns, columns) ||
      actual.predicate !== predicate ||
      actual.expressions !== null ||
      canonical(actual.definition) !== canonical(definition)
    )
      failures.push(`index definition: ${name}`);
  }
  if (indexes.rows.length !== EXPECTED_INDEXES.length)
    failures.push('Correction B index inventory');

  for (const [name, schema, table, type, targetFunction] of EXPECTED_TRIGGERS) {
    const actual = triggers.rows.find((row) => row.name === name);
    const definition = `CREATE TRIGGER ${name} BEFORE ${type === 19 ? 'UPDATE' : 'DELETE OR TRUNCATE'} ON ${schema}.${table} FOR EACH ${type === 19 ? 'ROW' : 'STATEMENT'} EXECUTE FUNCTION _migration.${targetFunction}()`;
    if (
      actual === undefined ||
      actual.schema_name !== schema ||
      actual.table_name !== table ||
      actual.enabled !== 'O' ||
      actual.internal ||
      actual.trigger_type !== type ||
      actual.function_schema !== '_migration' ||
      actual.function_name !== targetFunction ||
      canonical(actual.definition) !== canonical(definition)
    )
      failures.push(`trigger definition: ${name}`);
  }
  if (triggers.rows.length !== EXPECTED_TRIGGERS.length)
    failures.push('Correction B trigger inventory');

  for (const expected of EXPECTED_FUNCTIONS) {
    const actual = functions.rows.find((row) => row.signature === expected.signature);
    if (
      actual === undefined ||
      actual.name !== expected.name ||
      actual.schema_name !== '_migration' ||
      actual.return_type !== expected.result ||
      actual.arguments !== expected.arguments ||
      actual.identity_arguments !== expected.arguments ||
      actual.language_name !== expected.language ||
      actual.function_kind !== 'f' ||
      actual.volatility !== expected.volatility ||
      actual.strict !== expected.strict ||
      actual.security_definer ||
      actual.leakproof ||
      actual.parallel_safety !== expected.parallel ||
      !sameConfiguration(actual.configuration, expected.configuration) ||
      canonical(actual.body) !== canonical(expected.body)
    )
      failures.push(`function definition: ${expected.signature}`);
  }
  if (functions.rows.length !== EXPECTED_FUNCTIONS.length)
    failures.push('Correction B function inventory');
  return failures;
}
