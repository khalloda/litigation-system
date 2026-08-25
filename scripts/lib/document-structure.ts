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
    'documents_source_identity_shape',
    'public',
    'documents',
    'c',
    false,
    "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND jsonb_typeof(legacy_source_payload) = 'object'::text AND legacy_id IS NOT NULL)",
  ],
  [
    'document_transform_pkey',
    'quarantine',
    'document_transform',
    'p',
    true,
    'PRIMARY KEY (src_record_key)',
  ],
  [
    'document_transform_identity_shape',
    'quarantine',
    'document_transform',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text)",
  ],
  [
    'document_transform_reason_shape',
    'quarantine',
    'document_transform',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
  [
    'document_evidence_pkey',
    'quarantine',
    'document_evidence',
    'p',
    true,
    'PRIMARY KEY (src_record_key, field_kind)',
  ],
  [
    'document_evidence_identity_shape',
    'quarantine',
    'document_evidence',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND (field_kind = ANY (ARRAY['client'::text, 'matter'::text, 'responsible_person'::text, 'page_count'::text, 'mfiles_id'::text])))",
  ],
  [
    'document_evidence_payload_shape',
    'quarantine',
    'document_evidence',
    'c',
    false,
    "CHECK (jsonb_typeof(reason_detail) = 'object'::text AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
] as const;
const fks = [
  [
    'documents_matter_id_fkey',
    'public',
    'documents',
    ['matter_id'],
    'public',
    'matters',
    ['id'],
    'FOREIGN KEY (matter_id) REFERENCES matters(id) ON UPDATE CASCADE ON DELETE SET NULL',
  ],
  [
    'documents_responsible_person_id_fkey',
    'public',
    'documents',
    ['responsible_person_id'],
    'public',
    'people',
    ['id'],
    'FOREIGN KEY (responsible_person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE SET NULL',
  ],
  [
    'documents_client_id_fkey',
    'public',
    'documents',
    ['client_id'],
    'public',
    'clients',
    ['id'],
    'FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE CASCADE ON DELETE SET NULL',
  ],
] as const;
const indexes = [
  [
    'documents_legacy_id_key',
    'public',
    'documents',
    true,
    ['legacy_id'],
    'CREATE UNIQUE INDEX documents_legacy_id_key ON documents USING btree (legacy_id)',
  ],
  [
    'documents_legacy_source_record_key_key',
    'public',
    'documents',
    true,
    ['legacy_source_record_key'],
    'CREATE UNIQUE INDEX documents_legacy_source_record_key_key ON documents USING btree (legacy_source_record_key)',
  ],
  [
    'documents_matter_id_idx',
    'public',
    'documents',
    false,
    ['matter_id'],
    'CREATE INDEX documents_matter_id_idx ON documents USING btree (matter_id)',
  ],
  [
    'documents_responsible_person_id_idx',
    'public',
    'documents',
    false,
    ['responsible_person_id'],
    'CREATE INDEX documents_responsible_person_id_idx ON documents USING btree (responsible_person_id)',
  ],
  [
    'documents_client_id_idx',
    'public',
    'documents',
    false,
    ['client_id'],
    'CREATE INDEX documents_client_id_idx ON documents USING btree (client_id)',
  ],
] as const;
const triggers = [
  [
    'document_transform_no_change',
    'quarantine',
    'document_transform',
    27,
    'CREATE TRIGGER document_transform_no_change BEFORE DELETE OR UPDATE ON quarantine.document_transform FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_document_evidence_change()',
  ],
  [
    'document_transform_no_truncate',
    'quarantine',
    'document_transform',
    34,
    'CREATE TRIGGER document_transform_no_truncate BEFORE TRUNCATE ON quarantine.document_transform FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_document_evidence_change()',
  ],
  [
    'document_evidence_no_change',
    'quarantine',
    'document_evidence',
    27,
    'CREATE TRIGGER document_evidence_no_change BEFORE DELETE OR UPDATE ON quarantine.document_evidence FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_document_evidence_change()',
  ],
  [
    'document_evidence_no_truncate',
    'quarantine',
    'document_evidence',
    34,
    'CREATE TRIGGER document_evidence_no_truncate BEFORE TRUNCATE ON quarantine.document_evidence FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_document_evidence_change()',
  ],
] as const;
const body = `
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Task 2.9C immutable migration evidence cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.9C migration evidence DELETE/TRUNCATE is refused';
END;
`;
const canonical = (v: string) => v.replace(/\r\n?/gu, '\n').trim();
const same = (a: readonly unknown[], b: readonly unknown[]) =>
  JSON.stringify(a) === JSON.stringify(b);
export async function documentStructureFailures(db: ClientBase): Promise<string[]> {
  const names = [...checks.map((x) => x[0]), ...fks.map((x) => x[0])];
  const cs = await db.query<C>(
    `SELECT con.conname name,ns.nspname schema_name,rel.relname table_name,con.contype::text type,con.convalidated validated,con.connoinherit no_inherit,con.condeferrable deferrable,con.condeferred deferred,pg_get_constraintdef(con.oid,true) definition,
 coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)FROM unnest(con.conkey)WITH ORDINALITY k(attnum,ordinality)JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum),ARRAY[]::name[])::text[] source_columns,
 tns.nspname target_schema,trel.relname target_table,coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality)FROM unnest(con.confkey)WITH ORDINALITY k(attnum,ordinality)JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum),ARRAY[]::name[])::text[] target_columns,
 con.confupdtype::text update_action,con.confdeltype::text delete_action,con.confmatchtype::text match_type FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace LEFT JOIN pg_class trel ON trel.oid=con.confrelid LEFT JOIN pg_namespace tns ON tns.oid=trel.relnamespace WHERE con.conname=ANY($1::text[]) ORDER BY con.conname`,
    [names],
  );
  const ix = await db.query<I>(
    `SELECT ir.relname name,ins.nspname schema_name,tr.relname table_name,am.amname method,i.indisunique unique_index,i.indisvalid valid,i.indisready ready,i.indislive live,i.indimmediate immediate,i.indnullsnotdistinct nulls_not_distinct,i.indisclustered clustered,i.indisexclusion exclusion,i.indnkeyatts key_count,i.indnatts attribute_count,ARRAY(SELECT pg_get_indexdef(i.indexrelid,n,true)FROM generate_series(1,i.indnkeyatts)n ORDER BY n)columns,pg_get_expr(i.indpred,i.indrelid,true)predicate,pg_get_expr(i.indexprs,i.indrelid,true)expressions,pg_get_indexdef(i.indexrelid,0,true)definition FROM pg_index i JOIN pg_class ir ON ir.oid=i.indexrelid JOIN pg_namespace ins ON ins.oid=ir.relnamespace JOIN pg_class tr ON tr.oid=i.indrelid JOIN pg_am am ON am.oid=ir.relam WHERE ir.relname=ANY($1::text[]) ORDER BY ir.relname`,
    [indexes.map((x) => x[0])],
  );
  const ts = await db.query<T>(
    `SELECT t.tgname name,ns.nspname schema_name,r.relname table_name,t.tgenabled::text enabled,t.tgisinternal internal,t.tgtype trigger_type,fns.nspname function_schema,p.proname function_name,pg_get_triggerdef(t.oid,true)definition FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace fns ON fns.oid=p.pronamespace WHERE t.tgname=ANY($1::text[]) ORDER BY t.tgname`,
    [triggers.map((x) => x[0])],
  );
  const fs = await db.query<F>(
    `SELECT p.oid::regprocedure::text signature,p.proname name,ns.nspname schema_name,pg_get_function_result(p.oid)return_type,pg_get_function_arguments(p.oid)arguments,pg_get_function_identity_arguments(p.oid)identity_arguments,l.lanname language_name,p.prokind::text function_kind,p.provolatile::text volatility,p.proisstrict strict,p.prosecdef security_definer,p.proleakproof leakproof,p.proparallel::text parallel_safety,p.proconfig configuration,p.prosrc body FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='quarantine.refuse_document_evidence_change()'::regprocedure`,
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
      canonical(r.definition) !== canonical(definition) ||
      r.target_schema !== null ||
      r.target_table !== null
    )
      failures.push(`constraint definition: ${name}${r ? ` [${r.definition}]` : ''}`);
  }
  for (const [name, schema, table, source, targetSchema, targetTable, target, definition] of fks) {
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
      canonical(r.definition) !== canonical(definition) ||
      !same(r.source_columns, source) ||
      r.target_schema !== targetSchema ||
      r.target_table !== targetTable ||
      !same(r.target_columns, target) ||
      r.update_action !== 'c' ||
      r.delete_action !== 'n' ||
      r.match_type !== 's'
    )
      failures.push(`foreign-key definition: ${name}`);
  }
  if (cs.rows.length !== checks.length + fks.length)
    failures.push('Task 2.9C constraint inventory');
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
      canonical(r.definition) !== canonical(definition)
    )
      failures.push(`index definition: ${name}`);
  }
  if (ix.rows.length !== indexes.length) failures.push('Task 2.9C index inventory');
  for (const [name, schema, table, type, definition] of triggers) {
    const r = ts.rows.find((x) => x.name === name);
    if (
      !r ||
      r.schema_name !== schema ||
      r.table_name !== table ||
      r.enabled !== 'O' ||
      r.internal ||
      r.trigger_type !== type ||
      r.function_schema !== 'quarantine' ||
      r.function_name !== 'refuse_document_evidence_change' ||
      canonical(r.definition) !== canonical(definition)
    )
      failures.push(`trigger definition: ${name}`);
  }
  if (ts.rows.length !== triggers.length) failures.push('Task 2.9C trigger inventory');
  const f = fs.rows[0];
  if (
    fs.rows.length !== 1 ||
    !f ||
    f.signature !== 'quarantine.refuse_document_evidence_change()' ||
    f.name !== 'refuse_document_evidence_change' ||
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
    canonical(f.body) !== canonical(body)
  )
    failures.push('function definition: quarantine.refuse_document_evidence_change()');
  return failures;
}
