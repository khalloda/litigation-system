import type { ClientBase } from 'pg';
type C = {
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
type I = {
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
type T = {
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
type F = {
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
    'fee_letters_source_identity_shape',
    'public',
    'fee_letters',
    'c',
    false,
    "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL AND legacy_mfiles_id_raw IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND jsonb_typeof(legacy_source_payload) = 'object'::text AND contract_id IS NOT NULL AND NOT mfiles_id IS DISTINCT FROM legacy_mfiles_id_raw)",
  ],
  [
    'fee_letter_matters_source_identity_shape',
    'public',
    'fee_letter_matters',
    'c',
    false,
    "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL AND legacy_parent_contract_id_raw IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND jsonb_typeof(legacy_source_payload) = 'object'::text AND legacy_parent_contract_id_raw IS NOT NULL AND legacy_matter_ref IS NOT NULL AND ordinal IS NOT NULL)",
  ],
  [
    'matter_fee_letter_references_pkey',
    'public',
    'matter_fee_letter_references',
    'p',
    true,
    'PRIMARY KEY (id)',
  ],
  [
    'matter_fee_letter_references_matter_id_key',
    'public',
    'matter_fee_letter_references',
    'u',
    true,
    'UNIQUE (matter_id)',
  ],
  [
    'matter_fee_letter_references_legacy_source_record_key_key',
    'public',
    'matter_fee_letter_references',
    'u',
    true,
    'UNIQUE (legacy_source_record_key)',
  ],
  [
    'matter_fee_letter_references_identity_shape',
    'public',
    'matter_fee_letter_references',
    'c',
    false,
    "CHECK (identifier_space IS NULL AND legacy_reference_raw IS NULL AND legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL OR (identifier_space = ANY (ARRAY['contract_id'::text, 'mfiles_id'::text])) AND legacy_reference_raw IS NOT NULL AND legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND jsonb_typeof(legacy_source_payload) = 'object'::text)",
  ],
  [
    'fee_letter_transform_pkey',
    'quarantine',
    'fee_letter_transform',
    'p',
    true,
    'PRIMARY KEY (src_record_key)',
  ],
  [
    'fee_letter_transform_identity_shape',
    'quarantine',
    'fee_letter_transform',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text)",
  ],
  [
    'fee_letter_transform_reason_shape',
    'quarantine',
    'fee_letter_transform',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
  [
    'fee_letter_matter_transform_pkey',
    'quarantine',
    'fee_letter_matter_transform',
    'p',
    true,
    'PRIMARY KEY (src_record_key)',
  ],
  [
    'fee_letter_matter_transform_identity_shape',
    'quarantine',
    'fee_letter_matter_transform',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text)",
  ],
  [
    'fee_letter_matter_transform_reason_shape',
    'quarantine',
    'fee_letter_matter_transform',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
  [
    'matter_fee_letter_reference_pkey',
    'quarantine',
    'matter_fee_letter_reference',
    'p',
    true,
    'PRIMARY KEY (src_record_key)',
  ],
  [
    'matter_fee_letter_reference_identity_shape',
    'quarantine',
    'matter_fee_letter_reference',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND (identifier_space = ANY (ARRAY['contract_id'::text, 'mfiles_id'::text])) AND resolved_fee_letter_source_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text)",
  ],
  [
    'matter_fee_letter_reference_reason_shape',
    'quarantine',
    'matter_fee_letter_reference',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
] as const;
const fks = [
  [
    'fee_letters_client_id_fkey',
    'public',
    'fee_letters',
    ['client_id'],
    'public',
    'clients',
    ['id'],
    'FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE CASCADE ON DELETE SET NULL',
    'n',
  ],
  [
    'fee_letter_matters_fee_letter_id_fkey',
    'public',
    'fee_letter_matters',
    ['fee_letter_id'],
    'public',
    'fee_letters',
    ['id'],
    'FOREIGN KEY (fee_letter_id) REFERENCES fee_letters(id) ON UPDATE CASCADE ON DELETE CASCADE',
    'c',
  ],
  [
    'fee_letter_matters_matter_id_fkey',
    'public',
    'fee_letter_matters',
    ['matter_id'],
    'public',
    'matters',
    ['id'],
    'FOREIGN KEY (matter_id) REFERENCES matters(id) ON UPDATE CASCADE ON DELETE SET NULL',
    'n',
  ],
  [
    'matter_fee_letter_references_matter_fk',
    'public',
    'matter_fee_letter_references',
    ['matter_id'],
    'public',
    'matters',
    ['id'],
    'FOREIGN KEY (matter_id) REFERENCES matters(id) ON UPDATE CASCADE ON DELETE RESTRICT',
    'r',
  ],
  [
    'matter_fee_letter_references_fee_fk',
    'public',
    'matter_fee_letter_references',
    ['fee_letter_id'],
    'public',
    'fee_letters',
    ['id'],
    'FOREIGN KEY (fee_letter_id) REFERENCES fee_letters(id) ON UPDATE CASCADE ON DELETE RESTRICT',
    'r',
  ],
] as const;
const indexes = [
  [
    'fee_letters_contract_id_key',
    'public',
    'fee_letters',
    true,
    ['contract_id'],
    'CREATE UNIQUE INDEX fee_letters_contract_id_key ON fee_letters USING btree (contract_id)',
  ],
  [
    'fee_letters_client_id_idx',
    'public',
    'fee_letters',
    false,
    ['client_id'],
    'CREATE INDEX fee_letters_client_id_idx ON fee_letters USING btree (client_id)',
  ],
  [
    'fee_letters_legacy_source_record_key_key',
    'public',
    'fee_letters',
    true,
    ['legacy_source_record_key'],
    'CREATE UNIQUE INDEX fee_letters_legacy_source_record_key_key ON fee_letters USING btree (legacy_source_record_key)',
  ],
  [
    'fee_letter_matters_fee_letter_id_idx',
    'public',
    'fee_letter_matters',
    false,
    ['fee_letter_id'],
    'CREATE INDEX fee_letter_matters_fee_letter_id_idx ON fee_letter_matters USING btree (fee_letter_id)',
  ],
  [
    'fee_letter_matters_matter_id_idx',
    'public',
    'fee_letter_matters',
    false,
    ['matter_id'],
    'CREATE INDEX fee_letter_matters_matter_id_idx ON fee_letter_matters USING btree (matter_id)',
  ],
  [
    'fee_letter_matters_legacy_source_record_key_key',
    'public',
    'fee_letter_matters',
    true,
    ['legacy_source_record_key'],
    'CREATE UNIQUE INDEX fee_letter_matters_legacy_source_record_key_key ON fee_letter_matters USING btree (legacy_source_record_key)',
  ],
  [
    'matter_fee_letter_references_fee_letter_id_idx',
    'public',
    'matter_fee_letter_references',
    false,
    ['fee_letter_id'],
    'CREATE INDEX matter_fee_letter_references_fee_letter_id_idx ON matter_fee_letter_references USING btree (fee_letter_id)',
  ],
] as const;
const triggers = [
  [
    'fee_letter_transform_no_change',
    'fee_letter_transform',
    27,
    'CREATE TRIGGER fee_letter_transform_no_change BEFORE DELETE OR UPDATE ON quarantine.fee_letter_transform FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_fee_letter_evidence_change()',
  ],
  [
    'fee_letter_transform_no_truncate',
    'fee_letter_transform',
    34,
    'CREATE TRIGGER fee_letter_transform_no_truncate BEFORE TRUNCATE ON quarantine.fee_letter_transform FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_fee_letter_evidence_change()',
  ],
  [
    'fee_letter_matter_transform_no_change',
    'fee_letter_matter_transform',
    27,
    'CREATE TRIGGER fee_letter_matter_transform_no_change BEFORE DELETE OR UPDATE ON quarantine.fee_letter_matter_transform FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_fee_letter_evidence_change()',
  ],
  [
    'fee_letter_matter_transform_no_truncate',
    'fee_letter_matter_transform',
    34,
    'CREATE TRIGGER fee_letter_matter_transform_no_truncate BEFORE TRUNCATE ON quarantine.fee_letter_matter_transform FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_fee_letter_evidence_change()',
  ],
  [
    'matter_fee_letter_reference_no_change',
    'matter_fee_letter_reference',
    27,
    'CREATE TRIGGER matter_fee_letter_reference_no_change BEFORE DELETE OR UPDATE ON quarantine.matter_fee_letter_reference FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_fee_letter_evidence_change()',
  ],
  [
    'matter_fee_letter_reference_no_truncate',
    'matter_fee_letter_reference',
    34,
    'CREATE TRIGGER matter_fee_letter_reference_no_truncate BEFORE TRUNCATE ON quarantine.matter_fee_letter_reference FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_fee_letter_evidence_change()',
  ],
] as const;
const body = `
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Task 2.9D immutable migration evidence cannot be updated'; END IF;
 RAISE EXCEPTION 'Task 2.9D migration evidence DELETE/TRUNCATE is refused';
END;
`;
const canon = (v: string) => v.replace(/\r\n?/gu, '\n').trim();
const same = (a: readonly unknown[], b: readonly unknown[]) =>
  JSON.stringify(a) === JSON.stringify(b);
export async function feeLetterStructureFailures(db: ClientBase): Promise<string[]> {
  const names = [...checks.map((x) => x[0]), ...fks.map((x) => x[0])];
  const cs = await db.query<C>(
    `SELECT con.conname name,ns.nspname schema_name,rel.relname table_name,con.contype::text type,con.convalidated validated,con.connoinherit no_inherit,con.condeferrable deferrable,con.condeferred deferred,pg_get_constraintdef(con.oid,true)definition,coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)FROM unnest(con.conkey)WITH ORDINALITY k(attnum,ordinality)JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum),ARRAY[]::name[])::text[]source_columns,tns.nspname target_schema,trel.relname target_table,coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)FROM unnest(con.confkey)WITH ORDINALITY k(attnum,ordinality)JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum),ARRAY[]::name[])::text[]target_columns,con.confupdtype::text update_action,con.confdeltype::text delete_action,con.confmatchtype::text match_type FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace LEFT JOIN pg_class trel ON trel.oid=con.confrelid LEFT JOIN pg_namespace tns ON tns.oid=trel.relnamespace WHERE con.conname=ANY($1::text[])ORDER BY con.conname`,
    [names],
  );
  const ix = await db.query<I>(
    `SELECT ir.relname name,ins.nspname schema_name,tr.relname table_name,am.amname method,i.indisunique unique_index,i.indisvalid valid,i.indisready ready,i.indislive live,i.indimmediate immediate,i.indnullsnotdistinct nulls_not_distinct,i.indisclustered clustered,i.indisexclusion exclusion,i.indnkeyatts key_count,i.indnatts attribute_count,ARRAY(SELECT pg_get_indexdef(i.indexrelid,n,true)FROM generate_series(1,i.indnkeyatts)n ORDER BY n)columns,pg_get_expr(i.indpred,i.indrelid,true)predicate,pg_get_expr(i.indexprs,i.indrelid,true)expressions,pg_get_indexdef(i.indexrelid,0,true)definition FROM pg_index i JOIN pg_class ir ON ir.oid=i.indexrelid JOIN pg_namespace ins ON ins.oid=ir.relnamespace JOIN pg_class tr ON tr.oid=i.indrelid JOIN pg_am am ON am.oid=ir.relam WHERE ir.relname=ANY($1::text[])ORDER BY ir.relname`,
    [indexes.map((x) => x[0])],
  );
  const ts = await db.query<T>(
    `SELECT t.tgname name,ns.nspname schema_name,r.relname table_name,t.tgenabled::text enabled,t.tgisinternal internal,t.tgtype trigger_type,fns.nspname function_schema,p.proname function_name,pg_get_triggerdef(t.oid,true)definition FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace fns ON fns.oid=p.pronamespace WHERE t.tgname=ANY($1::text[])ORDER BY t.tgname`,
    [triggers.map((x) => x[0])],
  );
  const fs = await db.query<F>(
    `SELECT p.oid::regprocedure::text signature,p.proname name,ns.nspname schema_name,pg_get_function_result(p.oid)return_type,pg_get_function_arguments(p.oid)arguments,pg_get_function_identity_arguments(p.oid)identity_arguments,l.lanname language_name,p.prokind::text function_kind,p.provolatile::text volatility,p.proisstrict strict,p.prosecdef security_definer,p.proleakproof leakproof,p.proparallel::text parallel_safety,p.proconfig configuration,p.prosrc body FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='quarantine.refuse_fee_letter_evidence_change()'::regprocedure`,
  );
  const failures: string[] = [];
  for (const [name, schema, table, type, noInherit, definition] of checks) {
    const r = cs.rows.find((x) => x.name === name);
    if (
      !r ||
      r.schema_name !== schema ||
      r.table_name !== table ||
      r.type !== type ||
      !r.validated ||
      r.no_inherit !== noInherit ||
      r.deferrable ||
      r.deferred ||
      canon(r.definition) !== canon(definition) ||
      r.target_schema !== null ||
      r.target_table !== null
    )
      failures.push(`constraint definition: ${name}${r ? ` [${r.definition}]` : ''}`);
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
    deleteAction,
  ] of fks) {
    const r = cs.rows.find((x) => x.name === name);
    if (
      !r ||
      r.schema_name !== schema ||
      r.table_name !== table ||
      r.type !== 'f' ||
      !r.validated ||
      !r.no_inherit ||
      r.deferrable ||
      r.deferred ||
      canon(r.definition) !== canon(definition) ||
      !same(r.source_columns, source) ||
      r.target_schema !== targetSchema ||
      r.target_table !== targetTable ||
      !same(r.target_columns, target) ||
      r.update_action !== 'c' ||
      r.delete_action !== deleteAction ||
      r.match_type !== 's'
    )
      failures.push(`foreign-key definition: ${name}`);
  }
  if (cs.rows.length !== checks.length + fks.length)
    failures.push('Task 2.9D constraint inventory');
  for (const [name, schema, table, unique, columns, definition] of indexes) {
    const r = ix.rows.find((x) => x.name === name);
    if (
      !r ||
      r.schema_name !== schema ||
      r.table_name !== table ||
      r.method !== 'btree' ||
      r.unique_index !== unique ||
      !r.valid ||
      !r.ready ||
      !r.live ||
      !r.immediate ||
      r.nulls_not_distinct ||
      r.clustered ||
      r.exclusion ||
      r.key_count !== columns.length ||
      r.attribute_count !== columns.length ||
      !same(r.columns, columns) ||
      r.predicate !== null ||
      r.expressions !== null ||
      canon(r.definition) !== canon(definition)
    )
      failures.push(`index definition: ${name}`);
  }
  if (ix.rows.length !== indexes.length) failures.push('Task 2.9D index inventory');
  for (const [name, table, type, definition] of triggers) {
    const r = ts.rows.find((x) => x.name === name);
    if (
      !r ||
      r.schema_name !== 'quarantine' ||
      r.table_name !== table ||
      r.enabled !== 'O' ||
      r.internal ||
      r.trigger_type !== type ||
      r.function_schema !== 'quarantine' ||
      r.function_name !== 'refuse_fee_letter_evidence_change' ||
      canon(r.definition) !== canon(definition)
    )
      failures.push(`trigger definition: ${name}`);
  }
  if (ts.rows.length !== triggers.length) failures.push('Task 2.9D trigger inventory');
  const f = fs.rows[0];
  if (
    fs.rows.length !== 1 ||
    !f ||
    f.signature !== 'quarantine.refuse_fee_letter_evidence_change()' ||
    f.name !== 'refuse_fee_letter_evidence_change' ||
    f.schema_name !== 'quarantine' ||
    f.return_type !== 'trigger' ||
    f.arguments !== '' ||
    f.identity_arguments !== '' ||
    f.language_name !== 'plpgsql' ||
    f.function_kind !== 'f' ||
    f.volatility !== 'v' ||
    f.strict ||
    f.security_definer ||
    f.leakproof ||
    f.parallel_safety !== 'u' ||
    f.configuration !== null ||
    canon(f.body) !== canon(body)
  )
    failures.push('function definition: quarantine.refuse_fee_letter_evidence_change()');
  return failures;
}
