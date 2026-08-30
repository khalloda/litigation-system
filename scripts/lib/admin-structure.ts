import type { ClientBase } from 'pg';

type ColumnRow = {
  schema_name: string;
  table_name: string;
  column_name: string;
  data_type: string;
  nullable: boolean;
  has_default: boolean;
  identity_kind: string;
  generated_kind: string;
  collation_name: string | null;
  default_expression: string | null;
};

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

const constraints = [
  [
    'admin_task_transform_pkey',
    'quarantine',
    'admin_task_transform',
    'p',
    true,
    'PRIMARY KEY (src_record_key)',
  ],
  [
    'admin_tasks_source_identity_shape',
    'public',
    'admin_tasks',
    'c',
    false,
    "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND jsonb_typeof(legacy_source_payload) = 'object'::text AND legacy_id IS NOT NULL)",
  ],
  [
    'task_actions_source_identity_shape',
    'public',
    'task_actions',
    'c',
    false,
    "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL AND source_ordinal IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND jsonb_typeof(legacy_source_payload) = 'object'::text AND legacy_id IS NOT NULL AND source_ordinal > 0)",
  ],
  [
    'task_action_transform_pkey',
    'quarantine',
    'task_action_transform',
    'p',
    true,
    'PRIMARY KEY (src_record_key)',
  ],
  [
    'admin_task_transform_identity_shape',
    'quarantine',
    'admin_task_transform',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text)",
  ],
  [
    'admin_task_transform_reason_shape',
    'quarantine',
    'admin_task_transform',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
  [
    'task_action_transform_identity_shape',
    'quarantine',
    'task_action_transform',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text)",
  ],
  [
    'task_action_transform_reason_shape',
    'quarantine',
    'task_action_transform',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
] as const;

const foreignKeys = [
  [
    'admin_tasks_matter_id_fkey',
    'public',
    'admin_tasks',
    ['matter_id'],
    'public',
    'matters',
    ['id'],
    'FOREIGN KEY (matter_id) REFERENCES matters(id) ON UPDATE CASCADE ON DELETE SET NULL',
  ],
  [
    'admin_tasks_assigned_to_person_id_fkey',
    'public',
    'admin_tasks',
    ['assigned_to_person_id'],
    'public',
    'people',
    ['id'],
    'FOREIGN KEY (assigned_to_person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE SET NULL',
  ],
  [
    'admin_tasks_court_id_fkey',
    'public',
    'admin_tasks',
    ['court_id'],
    'public',
    'lookup_court',
    ['id'],
    'FOREIGN KEY (court_id) REFERENCES lookup_court(id) ON UPDATE CASCADE ON DELETE SET NULL',
  ],
  [
    'admin_tasks_destination_id_fkey',
    'public',
    'admin_tasks',
    ['destination_id'],
    'public',
    'lookup_matter_destination',
    ['id'],
    'FOREIGN KEY (destination_id) REFERENCES lookup_matter_destination(id) ON UPDATE CASCADE ON DELETE SET NULL',
  ],
  [
    'task_actions_task_id_fkey',
    'public',
    'task_actions',
    ['task_id'],
    'public',
    'admin_tasks',
    ['id'],
    'FOREIGN KEY (task_id) REFERENCES admin_tasks(id) ON UPDATE CASCADE ON DELETE SET NULL',
  ],
  [
    'task_actions_performed_by_person_id_fkey',
    'public',
    'task_actions',
    ['performed_by_person_id'],
    'public',
    'people',
    ['id'],
    'FOREIGN KEY (performed_by_person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE SET NULL',
  ],
] as const;

const indexes = [
  [
    'admin_tasks_legacy_id_key',
    'public',
    'admin_tasks',
    ['legacy_id'],
    'CREATE UNIQUE INDEX admin_tasks_legacy_id_key ON admin_tasks USING btree (legacy_id)',
  ],
  [
    'admin_tasks_legacy_source_record_key_key',
    'public',
    'admin_tasks',
    ['legacy_source_record_key'],
    'CREATE UNIQUE INDEX admin_tasks_legacy_source_record_key_key ON admin_tasks USING btree (legacy_source_record_key)',
  ],
  [
    'task_actions_legacy_source_record_key_key',
    'public',
    'task_actions',
    ['legacy_source_record_key'],
    'CREATE UNIQUE INDEX task_actions_legacy_source_record_key_key ON task_actions USING btree (legacy_source_record_key)',
  ],
  [
    'task_actions_legacy_id_key',
    'public',
    'task_actions',
    ['legacy_id'],
    'CREATE UNIQUE INDEX task_actions_legacy_id_key ON task_actions USING btree (legacy_id)',
  ],
] as const;

const triggers = [
  [
    'admin_task_transform_no_change',
    'quarantine',
    'admin_task_transform',
    27,
    'CREATE TRIGGER admin_task_transform_no_change BEFORE DELETE OR UPDATE ON quarantine.admin_task_transform FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_admin_work_evidence_change()',
  ],
  [
    'admin_task_transform_no_truncate',
    'quarantine',
    'admin_task_transform',
    34,
    'CREATE TRIGGER admin_task_transform_no_truncate BEFORE TRUNCATE ON quarantine.admin_task_transform FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_admin_work_evidence_change()',
  ],
  [
    'task_action_transform_no_change',
    'quarantine',
    'task_action_transform',
    27,
    'CREATE TRIGGER task_action_transform_no_change BEFORE DELETE OR UPDATE ON quarantine.task_action_transform FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_admin_work_evidence_change()',
  ],
  [
    'task_action_transform_no_truncate',
    'quarantine',
    'task_action_transform',
    34,
    'CREATE TRIGGER task_action_transform_no_truncate BEFORE TRUNCATE ON quarantine.task_action_transform FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_admin_work_evidence_change()',
  ],
] as const;

const functionBody = `
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Task 2.9A immutable migration evidence cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.9A migration evidence DELETE/TRUNCATE is refused';
END;
`;

function canonical(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim();
}
function same(actual: readonly string[], expected: readonly string[]): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export async function adminWorkStructureFailures(db: ClientBase): Promise<string[]> {
  const columnRows = await db.query<ColumnRow>(`
    SELECT ns.nspname schema_name,rel.relname table_name,a.attname column_name,
           format_type(a.atttypid,a.atttypmod) data_type,NOT a.attnotnull nullable,
           a.atthasdef has_default,a.attidentity::text identity_kind,
           a.attgenerated::text generated_kind,c.collname collation_name,
           pg_get_expr(ad.adbin,ad.adrelid,true) default_expression
      FROM pg_attribute a JOIN pg_class rel ON rel.oid=a.attrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
      LEFT JOIN pg_collation c ON c.oid=a.attcollation
     WHERE ns.nspname='public' AND rel.relname='admin_tasks'
       AND a.attname='task_created_date' AND a.attnum>0 AND NOT a.attisdropped`);
  const constraintRows = await db.query<ConstraintRow>(
    `
    SELECT con.conname name,ns.nspname schema_name,rel.relname table_name,
           con.contype::text constraint_type,con.convalidated validated,
           con.connoinherit no_inherit,con.condeferrable deferrable,
           con.condeferred initially_deferred,pg_get_constraintdef(con.oid,true) definition,
           coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)
             FROM unnest(con.conkey) WITH ORDINALITY k(attnum,ordinality)
             JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum),ARRAY[]::name[])::text[] source_columns,
           tns.nspname target_schema,trel.relname target_table,
           coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)
             FROM unnest(con.confkey) WITH ORDINALITY k(attnum,ordinality)
             JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum),ARRAY[]::name[])::text[] target_columns,
           con.confupdtype::text update_action,con.confdeltype::text delete_action,
           con.confmatchtype::text match_type
      FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      LEFT JOIN pg_class trel ON trel.oid=con.confrelid LEFT JOIN pg_namespace tns ON tns.oid=trel.relnamespace
     WHERE con.conname=ANY($1::text[]) ORDER BY con.conname`,
    [[...constraints.map((x) => x[0]), ...foreignKeys.map((x) => x[0])]],
  );
  const indexRows = await db.query<IndexRow>(
    `
    SELECT ir.relname name,ins.nspname schema_name,tns.nspname table_schema,tr.relname table_name,
           am.amname access_method,i.indisunique unique_index,i.indisvalid valid,i.indisready ready,
           i.indislive live,i.indimmediate immediate,i.indnullsnotdistinct nulls_not_distinct,
           i.indisclustered clustered,i.indisexclusion exclusion,i.indnkeyatts key_count,
           i.indnatts attribute_count,ARRAY(SELECT pg_get_indexdef(i.indexrelid,n,true)
             FROM generate_series(1,i.indnkeyatts)n ORDER BY n) columns,
           pg_get_expr(i.indpred,i.indrelid,true) predicate,pg_get_expr(i.indexprs,i.indrelid,true) expressions,
           pg_get_indexdef(i.indexrelid,0,true) definition
      FROM pg_index i JOIN pg_class ir ON ir.oid=i.indexrelid JOIN pg_namespace ins ON ins.oid=ir.relnamespace
      JOIN pg_class tr ON tr.oid=i.indrelid JOIN pg_namespace tns ON tns.oid=tr.relnamespace
      JOIN pg_am am ON am.oid=ir.relam WHERE ir.relname=ANY($1::text[]) ORDER BY ir.relname`,
    [indexes.map((x) => x[0])],
  );
  const triggerRows = await db.query<TriggerRow>(
    `
    SELECT t.tgname name,ns.nspname schema_name,r.relname table_name,t.tgenabled::text enabled,
           t.tgisinternal internal,t.tgtype trigger_type,fns.nspname function_schema,p.proname function_name,
           pg_get_triggerdef(t.oid,true) definition
      FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace fns ON fns.oid=p.pronamespace
     WHERE t.tgname=ANY($1::text[]) ORDER BY t.tgname`,
    [triggers.map((x) => x[0])],
  );
  const functionRows = await db.query<FunctionRow>(`
    SELECT p.oid::regprocedure::text signature,p.proname name,ns.nspname schema_name,
           pg_get_function_result(p.oid) return_type,pg_get_function_arguments(p.oid) arguments,
           pg_get_function_identity_arguments(p.oid) identity_arguments,l.lanname language_name,
           p.prokind::text function_kind,p.provolatile::text volatility,p.proisstrict strict,
           p.prosecdef security_definer,p.proleakproof leakproof,p.proparallel::text parallel_safety,
           p.proconfig configuration,p.prosrc body
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
     WHERE p.oid='quarantine.refuse_admin_work_evidence_change()'::regprocedure`);

  const failures: string[] = [];
  const taskCreatedDate = columnRows.rows[0];
  if (
    columnRows.rows.length !== 1 ||
    taskCreatedDate === undefined ||
    taskCreatedDate.schema_name !== 'public' ||
    taskCreatedDate.table_name !== 'admin_tasks' ||
    taskCreatedDate.column_name !== 'task_created_date' ||
    taskCreatedDate.data_type !== 'date' ||
    !taskCreatedDate.nullable ||
    taskCreatedDate.has_default ||
    taskCreatedDate.identity_kind !== '' ||
    taskCreatedDate.generated_kind !== '' ||
    taskCreatedDate.collation_name !== null ||
    taskCreatedDate.default_expression !== null
  )
    failures.push('column definition: public.admin_tasks.task_created_date');
  for (const [name, schema, table, type, noInherit, definition] of constraints) {
    const row = constraintRows.rows.find((x) => x.name === name);
    if (
      row === undefined ||
      row.schema_name !== schema ||
      row.table_name !== table ||
      row.constraint_type !== type ||
      !row.validated ||
      row.no_inherit !== noInherit ||
      row.deferrable ||
      row.initially_deferred ||
      canonical(row.definition) !== canonical(definition) ||
      row.target_schema !== null ||
      row.target_table !== null ||
      row.target_columns.length !== 0
    )
      failures.push(`constraint definition: ${name}`);
  }
  for (const [
    name,
    schema,
    table,
    source,
    targetSchema,
    targetTable,
    target,
    definition,
  ] of foreignKeys) {
    const row = constraintRows.rows.find((x) => x.name === name);
    if (
      row === undefined ||
      row.schema_name !== schema ||
      row.table_name !== table ||
      row.constraint_type !== 'f' ||
      !row.validated ||
      !row.no_inherit ||
      row.deferrable ||
      row.initially_deferred ||
      canonical(row.definition) !== canonical(definition) ||
      !same(row.source_columns, source) ||
      row.target_schema !== targetSchema ||
      row.target_table !== targetTable ||
      !same(row.target_columns, target) ||
      row.update_action !== 'c' ||
      row.delete_action !== 'n' ||
      row.match_type !== 's'
    )
      failures.push(`foreign-key definition: ${name}`);
  }
  if (constraintRows.rows.length !== constraints.length + foreignKeys.length)
    failures.push('Task 2.9A constraint inventory');
  for (const [name, schema, table, columns, definition] of indexes) {
    const row = indexRows.rows.find((x) => x.name === name);
    if (
      row === undefined ||
      row.schema_name !== schema ||
      row.table_schema !== schema ||
      row.table_name !== table ||
      row.access_method !== 'btree' ||
      !row.unique_index ||
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
      canonical(row.definition) !== canonical(definition)
    )
      failures.push(`index definition: ${name}`);
  }
  if (indexRows.rows.length !== indexes.length) failures.push('Task 2.9A index inventory');
  for (const [name, schema, table, type, definition] of triggers) {
    const row = triggerRows.rows.find((x) => x.name === name);
    if (
      row === undefined ||
      row.schema_name !== schema ||
      row.table_name !== table ||
      row.enabled !== 'O' ||
      row.internal ||
      row.trigger_type !== type ||
      row.function_schema !== 'quarantine' ||
      row.function_name !== 'refuse_admin_work_evidence_change' ||
      canonical(row.definition) !== canonical(definition)
    )
      failures.push(`trigger definition: ${name}`);
  }
  if (triggerRows.rows.length !== triggers.length) failures.push('Task 2.9A trigger inventory');
  const fn = functionRows.rows[0];
  if (
    functionRows.rows.length !== 1 ||
    fn === undefined ||
    fn.signature !== 'quarantine.refuse_admin_work_evidence_change()' ||
    fn.name !== 'refuse_admin_work_evidence_change' ||
    fn.schema_name !== 'quarantine' ||
    fn.return_type !== 'trigger' ||
    fn.arguments !== '' ||
    fn.identity_arguments !== '' ||
    fn.language_name !== 'plpgsql' ||
    fn.function_kind !== 'f' ||
    fn.volatility !== 'v' ||
    fn.strict ||
    fn.security_definer ||
    fn.leakproof ||
    fn.parallel_safety !== 'u' ||
    fn.configuration !== null ||
    canonical(fn.body) !== canonical(functionBody)
  )
    failures.push('function definition: quarantine.refuse_admin_work_evidence_change()');
  return failures;
}
