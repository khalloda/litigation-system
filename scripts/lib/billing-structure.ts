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

const checks = [
  [
    'migration_billing_person_crosswalk_pkey',
    'public',
    'migration_billing_person_crosswalk',
    'p',
    true,
    'PRIMARY KEY (source_value)',
  ],
  [
    'migration_billing_person_crosswalk_reviewed',
    'public',
    'migration_billing_person_crosswalk',
    'c',
    false,
    "CHECK (source_value <> ''::text AND legacy_only IS TRUE AND reviewed_by <> ''::text AND reviewer_note <> ''::text)",
  ],
  [
    'migration_billing_currency_rule_pkey',
    'public',
    'migration_billing_currency_rule',
    'p',
    true,
    'PRIMARY KEY (field_kind, source_value)',
  ],
  [
    'migration_billing_currency_rule_kind',
    'public',
    'migration_billing_currency_rule',
    'c',
    false,
    "CHECK (field_kind = ANY (ARRAY['transaction_currency'::text, 'receipt_currency'::text]))",
  ],
  [
    'migration_billing_currency_rule_shape',
    'public',
    'migration_billing_currency_rule',
    'c',
    false,
    "CHECK (source_value <> ''::text AND reviewed_by <> ''::text AND reviewer_note <> ''::text AND (field_kind = 'transaction_currency'::text AND target_value IS NOT NULL AND require_zero_amount IS FALSE OR field_kind = 'receipt_currency'::text AND target_value IS NULL AND require_zero_amount IS TRUE))",
  ],
  [
    'invoices_source_identity_shape',
    'public',
    'invoices',
    'c',
    false,
    "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL AND legacy_currency_raw IS NULL AND legacy_receipt_currency_raw IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND jsonb_typeof(legacy_source_payload) = 'object'::text AND NOT legacy_source_payload ? 'Pay-Date'::text AND legacy_id IS NOT NULL AND invoice_no IS NOT NULL AND fee_letter_id IS NOT NULL AND legacy_contract_id IS NOT NULL AND legacy_currency_raw IS NOT NULL)",
  ],
  [
    'payments_source_identity_shape',
    'public',
    'payments',
    'c',
    false,
    "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL AND legacy_currency_raw IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND jsonb_typeof(legacy_source_payload) = 'object'::text AND legacy_id IS NOT NULL AND invoice_id IS NOT NULL AND legacy_invoice_no IS NOT NULL)",
  ],
  [
    'invoice_allocations_source_identity_shape',
    'public',
    'invoice_allocations',
    'c',
    false,
    "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL AND legacy_invoice_no IS NULL AND legacy_lawyer_raw IS NULL AND legacy_percent_raw IS NULL AND legacy_lawyer_as_raw IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND jsonb_typeof(legacy_source_payload) = 'object'::text AND legacy_id IS NOT NULL AND invoice_id IS NOT NULL AND person_id IS NOT NULL AND lawyer_role_id IS NOT NULL AND legacy_invoice_no IS NOT NULL AND legacy_lawyer_raw IS NOT NULL AND legacy_percent_raw IS NOT NULL AND legacy_lawyer_as_raw IS NOT NULL)",
  ],
  [
    'invoice_transform_pkey',
    'quarantine',
    'invoice_transform',
    'p',
    true,
    'PRIMARY KEY (src_record_key)',
  ],
  [
    'invoice_transform_identity_shape',
    'quarantine',
    'invoice_transform',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text)",
  ],
  [
    'invoice_transform_reason_shape',
    'quarantine',
    'invoice_transform',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text AND NOT source_payload ? 'Pay-Date'::text)",
  ],
  [
    'payment_transform_pkey',
    'quarantine',
    'payment_transform',
    'p',
    true,
    'PRIMARY KEY (src_record_key)',
  ],
  [
    'payment_transform_identity_shape',
    'quarantine',
    'payment_transform',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text)",
  ],
  [
    'payment_transform_reason_shape',
    'quarantine',
    'payment_transform',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
  [
    'invoice_allocation_transform_pkey',
    'quarantine',
    'invoice_allocation_transform',
    'p',
    true,
    'PRIMARY KEY (src_record_key)',
  ],
  [
    'invoice_allocation_transform_identity_shape',
    'quarantine',
    'invoice_allocation_transform',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text)",
  ],
  [
    'invoice_allocation_transform_reason_shape',
    'quarantine',
    'invoice_allocation_transform',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
] as const;

const foreignKeys = [
  [
    'migration_billing_person_crosswalk_person_fkey',
    'public',
    'migration_billing_person_crosswalk',
    ['person_id'],
    'public',
    'people',
    ['id'],
    'FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE RESTRICT',
    'r',
  ],
  [
    'invoices_fee_letter_id_fkey',
    'public',
    'invoices',
    ['fee_letter_id'],
    'public',
    'fee_letters',
    ['id'],
    'FOREIGN KEY (fee_letter_id) REFERENCES fee_letters(id) ON UPDATE CASCADE ON DELETE SET NULL',
    'n',
  ],
  [
    'invoices_status_id_fkey',
    'public',
    'invoices',
    ['status_id'],
    'public',
    'lookup_invoice_status',
    ['id'],
    'FOREIGN KEY (status_id) REFERENCES lookup_invoice_status(id) ON UPDATE CASCADE ON DELETE SET NULL',
    'n',
  ],
  [
    'invoices_type_id_fkey',
    'public',
    'invoices',
    ['type_id'],
    'public',
    'lookup_invoice_type',
    ['id'],
    'FOREIGN KEY (type_id) REFERENCES lookup_invoice_type(id) ON UPDATE CASCADE ON DELETE SET NULL',
    'n',
  ],
  [
    'payments_invoice_id_fkey',
    'public',
    'payments',
    ['invoice_id'],
    'public',
    'invoices',
    ['id'],
    'FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON UPDATE CASCADE ON DELETE SET NULL',
    'n',
  ],
  [
    'invoice_allocations_invoice_id_fkey',
    'public',
    'invoice_allocations',
    ['invoice_id'],
    'public',
    'invoices',
    ['id'],
    'FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON UPDATE CASCADE ON DELETE SET NULL',
    'n',
  ],
  [
    'invoice_allocations_person_id_fkey',
    'public',
    'invoice_allocations',
    ['person_id'],
    'public',
    'people',
    ['id'],
    'FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE SET NULL',
    'n',
  ],
  [
    'invoice_allocations_lawyer_role_id_fkey',
    'public',
    'invoice_allocations',
    ['lawyer_role_id'],
    'public',
    'lookup_lawyer_share_role',
    ['id'],
    'FOREIGN KEY (lawyer_role_id) REFERENCES lookup_lawyer_share_role(id) ON UPDATE CASCADE ON DELETE SET NULL',
    'n',
  ],
] as const;

const indexes = [
  [
    'invoices_legacy_source_record_key_key',
    'public',
    'invoices',
    true,
    ['legacy_source_record_key'],
  ],
  [
    'payments_legacy_source_record_key_key',
    'public',
    'payments',
    true,
    ['legacy_source_record_key'],
  ],
  [
    'invoice_allocations_legacy_source_record_key_key',
    'public',
    'invoice_allocations',
    true,
    ['legacy_source_record_key'],
  ],
  [
    'invoice_allocations_invoice_person_role_key',
    'public',
    'invoice_allocations',
    true,
    ['invoice_id', 'person_id', 'lawyer_role_id'],
  ],
  [
    'migration_billing_person_crosswalk_pkey',
    'public',
    'migration_billing_person_crosswalk',
    true,
    ['source_value'],
  ],
  [
    'migration_billing_currency_rule_pkey',
    'public',
    'migration_billing_currency_rule',
    true,
    ['field_kind', 'source_value'],
  ],
  ['invoice_transform_pkey', 'quarantine', 'invoice_transform', true, ['src_record_key']],
  ['payment_transform_pkey', 'quarantine', 'payment_transform', true, ['src_record_key']],
  [
    'invoice_allocation_transform_pkey',
    'quarantine',
    'invoice_allocation_transform',
    true,
    ['src_record_key'],
  ],
] as const;

const triggers = [
  [
    'invoice_transform_no_change',
    'quarantine',
    'invoice_transform',
    27,
    'quarantine',
    'refuse_billing_evidence_change',
  ],
  [
    'invoice_transform_no_truncate',
    'quarantine',
    'invoice_transform',
    34,
    'quarantine',
    'refuse_billing_evidence_change',
  ],
  [
    'payment_transform_no_change',
    'quarantine',
    'payment_transform',
    27,
    'quarantine',
    'refuse_billing_evidence_change',
  ],
  [
    'payment_transform_no_truncate',
    'quarantine',
    'payment_transform',
    34,
    'quarantine',
    'refuse_billing_evidence_change',
  ],
  [
    'invoice_allocation_transform_no_change',
    'quarantine',
    'invoice_allocation_transform',
    27,
    'quarantine',
    'refuse_billing_evidence_change',
  ],
  [
    'invoice_allocation_transform_no_truncate',
    'quarantine',
    'invoice_allocation_transform',
    34,
    'quarantine',
    'refuse_billing_evidence_change',
  ],
  ['invoices_legacy_no_change', 'public', 'invoices', 27, 'public', 'refuse_legacy_billing_change'],
  [
    'invoices_legacy_no_truncate',
    'public',
    'invoices',
    34,
    'public',
    'refuse_legacy_billing_change',
  ],
  ['payments_legacy_no_change', 'public', 'payments', 27, 'public', 'refuse_legacy_billing_change'],
  [
    'payments_legacy_no_truncate',
    'public',
    'payments',
    34,
    'public',
    'refuse_legacy_billing_change',
  ],
  [
    'invoice_allocations_legacy_no_change',
    'public',
    'invoice_allocations',
    27,
    'public',
    'refuse_legacy_billing_change',
  ],
  [
    'invoice_allocations_legacy_no_truncate',
    'public',
    'invoice_allocations',
    34,
    'public',
    'refuse_legacy_billing_change',
  ],
  [
    'migration_billing_person_crosswalk_no_change',
    'public',
    'migration_billing_person_crosswalk',
    27,
    'public',
    'refuse_billing_rule_change',
  ],
  [
    'migration_billing_person_crosswalk_no_truncate',
    'public',
    'migration_billing_person_crosswalk',
    34,
    'public',
    'refuse_billing_rule_change',
  ],
  [
    'migration_billing_currency_rule_no_change',
    'public',
    'migration_billing_currency_rule',
    27,
    'public',
    'refuse_billing_rule_change',
  ],
  [
    'migration_billing_currency_rule_no_truncate',
    'public',
    'migration_billing_currency_rule',
    34,
    'public',
    'refuse_billing_rule_change',
  ],
] as const;

const evidenceFunctionBody = `
BEGIN
    IF TG_OP='UPDATE' THEN
        RAISE EXCEPTION 'Task 2.10A immutable billing evidence cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.10A billing evidence DELETE/TRUNCATE is refused';
END;
`;
const legacyBillingFunctionBody = `
BEGIN
    IF TG_OP='TRUNCATE' THEN
        RAISE EXCEPTION 'Task 2.10A billing history TRUNCATE is refused';
    END IF;
    IF OLD.legacy_source_record_key IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10A migrated billing history cannot be updated or deleted';
    END IF;
    IF TG_OP='UPDATE' AND NEW.legacy_source_record_key IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10A migration provenance cannot be attached by ordinary update';
    END IF;
    IF TG_OP='DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
`;
const billingRuleFunctionBody = `
BEGIN
    IF TG_OP='UPDATE' THEN
        RAISE EXCEPTION 'Task 2.10A reviewed billing rules cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.10A reviewed billing rules cannot be deleted or truncated';
END;
`;
const functionsExpected = [
  ['quarantine', 'refuse_billing_evidence_change', evidenceFunctionBody],
  ['public', 'refuse_legacy_billing_change', legacyBillingFunctionBody],
  ['public', 'refuse_billing_rule_change', billingRuleFunctionBody],
] as const;
const canon = (value: string) => value.replace(/\r\n?/gu, '\n').trim();
const same = (left: readonly unknown[], right: readonly unknown[]) =>
  JSON.stringify(left) === JSON.stringify(right);

export async function billingStructureFailures(db: ClientBase): Promise<string[]> {
  const constraintNames = [...checks.map((row) => row[0]), ...foreignKeys.map((row) => row[0])];
  const constraints = await db.query<ConstraintRow>(
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
    [constraintNames],
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
  const functions = await db.query<FunctionRow>(
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
    [functionsExpected.map(([schema, name]) => `${schema}.${name}`)],
  );

  const failures: string[] = [];
  for (const [name, schema, table, type, noInherit, definition] of checks) {
    const row = constraints.rows.find((item) => item.name === name);
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
    const row = constraints.rows.find((item) => item.name === name);
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
  if (constraints.rows.length !== checks.length + foreignKeys.length)
    failures.push('Task 2.10A constraint inventory');

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
  if (indexRows.rows.length !== indexes.length) failures.push('Task 2.10A index inventory');

  for (const [name, schema, table, triggerType, functionSchema, functionName] of triggers) {
    const row = triggerRows.rows.find((item) => item.name === name);
    const event = triggerType === 27 ? 'DELETE OR UPDATE' : 'TRUNCATE';
    const scope = triggerType === 27 ? 'ROW' : 'STATEMENT';
    const relation = schema === 'public' ? table : `${schema}.${table}`;
    const targetFunction =
      functionSchema === 'public' ? functionName : `${functionSchema}.${functionName}`;
    const definition = `CREATE TRIGGER ${name} BEFORE ${event} ON ${relation} FOR EACH ${scope} EXECUTE FUNCTION ${targetFunction}()`;
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
  if (triggerRows.rows.length !== triggers.length) failures.push('Task 2.10A trigger inventory');

  for (const [schema, name, body] of functionsExpected) {
    const fn = functions.rows.find((item) => item.schema_name === schema && item.name === name);
    if (
      !fn ||
      fn.signature !== `${schema}.${name}()` ||
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
      canon(fn.body) !== canon(body)
    )
      failures.push(`function definition: ${schema}.${name}()`);
  }
  if (functions.rows.length !== functionsExpected.length)
    failures.push('Task 2.10A function inventory');
  return failures;
}
