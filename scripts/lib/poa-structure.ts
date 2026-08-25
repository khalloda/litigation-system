import type { ClientBase } from 'pg';

type Constraint = {
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
type Index = {
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
type Trigger = {
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
type FunctionDefinition = {
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
    'migration_multi_person_rule_poa_match_mode_check',
    'public',
    'migration_multi_person_rule',
    'c',
    false,
    "CHECK (poa_match_mode IS NULL OR poa_match_mode = 'substring'::text)",
  ],
  [
    'powers_of_attorney_source_identity_shape',
    'public',
    'powers_of_attorney',
    'c',
    false,
    "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_source_payload IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND jsonb_typeof(legacy_source_payload) = 'object'::text)",
  ],
  [
    'power_of_attorney_lawyers_source_shape',
    'public',
    'power_of_attorney_lawyers',
    'c',
    false,
    "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND legacy_lawyers_raw IS NULL AND reviewed_rule_id IS NULL AND source_member_ordinal IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND legacy_lawyers_raw IS NOT NULL AND source_member_ordinal > 0)",
  ],
  [
    'power_of_attorney_lawyers_pkey',
    'public',
    'power_of_attorney_lawyers',
    'p',
    true,
    'PRIMARY KEY (id)',
  ],
  [
    'power_of_attorney_transform_pkey',
    'quarantine',
    'power_of_attorney_transform',
    'p',
    true,
    'PRIMARY KEY (src_record_key)',
  ],
  [
    'power_of_attorney_transform_identity_shape',
    'quarantine',
    'power_of_attorney_transform',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text)",
  ],
  [
    'power_of_attorney_transform_reason_shape',
    'quarantine',
    'power_of_attorney_transform',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
  [
    'power_of_attorney_relationship_pkey',
    'quarantine',
    'power_of_attorney_relationship',
    'p',
    true,
    'PRIMARY KEY (src_record_key, relationship_kind)',
  ],
  [
    'power_of_attorney_relationship_identity_shape',
    'quarantine',
    'power_of_attorney_relationship',
    'c',
    false,
    "CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND (relationship_kind = ANY (ARRAY['client'::text, 'lawyers'::text])))",
  ],
  [
    'power_of_attorney_relationship_reason_shape',
    'quarantine',
    'power_of_attorney_relationship',
    'c',
    false,
    "CHECK (cardinality(reason_codes) > 0 AND resolved_member_count >= 0 AND jsonb_typeof(reason_details) = 'array'::text AND jsonb_array_length(reason_details) = cardinality(reason_codes) AND jsonb_typeof(source_payload) = 'object'::text)",
  ],
] as const;

const foreignKeys = [
  [
    'powers_of_attorney_client_id_fkey',
    'public',
    'powers_of_attorney',
    ['client_id'],
    'public',
    'clients',
    ['id'],
    'FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE CASCADE ON DELETE SET NULL',
    'c',
    'n',
  ],
  [
    'power_of_attorney_lawyers_poa_fk',
    'public',
    'power_of_attorney_lawyers',
    ['power_of_attorney_id'],
    'public',
    'powers_of_attorney',
    ['id'],
    'FOREIGN KEY (power_of_attorney_id) REFERENCES powers_of_attorney(id) ON UPDATE CASCADE ON DELETE RESTRICT',
    'c',
    'r',
  ],
  [
    'power_of_attorney_lawyers_person_fk',
    'public',
    'power_of_attorney_lawyers',
    ['person_id'],
    'public',
    'people',
    ['id'],
    'FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE RESTRICT',
    'c',
    'r',
  ],
  [
    'power_of_attorney_lawyers_rule_fk',
    'public',
    'power_of_attorney_lawyers',
    ['reviewed_rule_id'],
    'public',
    'migration_multi_person_rule',
    ['id'],
    'FOREIGN KEY (reviewed_rule_id) REFERENCES migration_multi_person_rule(id) ON UPDATE CASCADE ON DELETE RESTRICT',
    'c',
    'r',
  ],
] as const;

const indexes = [
  [
    'powers_of_attorney_legacy_source_record_key_key',
    'public',
    'powers_of_attorney',
    true,
    ['legacy_source_record_key'],
    'CREATE UNIQUE INDEX powers_of_attorney_legacy_source_record_key_key ON powers_of_attorney USING btree (legacy_source_record_key)',
  ],
  [
    'power_of_attorney_lawyers_poa_person_key',
    'public',
    'power_of_attorney_lawyers',
    true,
    ['power_of_attorney_id', 'person_id'],
    'CREATE UNIQUE INDEX power_of_attorney_lawyers_poa_person_key ON power_of_attorney_lawyers USING btree (power_of_attorney_id, person_id)',
  ],
  [
    'power_of_attorney_lawyers_source_rule_ordinal_key',
    'public',
    'power_of_attorney_lawyers',
    true,
    ['legacy_source_record_key', 'reviewed_rule_id', 'source_member_ordinal'],
    'CREATE UNIQUE INDEX power_of_attorney_lawyers_source_rule_ordinal_key ON power_of_attorney_lawyers USING btree (legacy_source_record_key, reviewed_rule_id, source_member_ordinal)',
  ],
  [
    'power_of_attorney_lawyers_person_id_idx',
    'public',
    'power_of_attorney_lawyers',
    false,
    ['person_id'],
    'CREATE INDEX power_of_attorney_lawyers_person_id_idx ON power_of_attorney_lawyers USING btree (person_id)',
  ],
  [
    'power_of_attorney_lawyers_reviewed_rule_id_idx',
    'public',
    'power_of_attorney_lawyers',
    false,
    ['reviewed_rule_id'],
    'CREATE INDEX power_of_attorney_lawyers_reviewed_rule_id_idx ON power_of_attorney_lawyers USING btree (reviewed_rule_id)',
  ],
] as const;

const triggers = [
  [
    'power_of_attorney_lawyers_provenance',
    'public',
    'power_of_attorney_lawyers',
    23,
    'public',
    'enforce_poa_lawyer_provenance',
    'CREATE TRIGGER power_of_attorney_lawyers_provenance BEFORE INSERT OR UPDATE ON power_of_attorney_lawyers FOR EACH ROW EXECUTE FUNCTION enforce_poa_lawyer_provenance()',
  ],
  [
    'power_of_attorney_transform_no_change',
    'quarantine',
    'power_of_attorney_transform',
    27,
    'quarantine',
    'refuse_poa_evidence_change',
    'CREATE TRIGGER power_of_attorney_transform_no_change BEFORE DELETE OR UPDATE ON quarantine.power_of_attorney_transform FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_poa_evidence_change()',
  ],
  [
    'power_of_attorney_transform_no_truncate',
    'quarantine',
    'power_of_attorney_transform',
    34,
    'quarantine',
    'refuse_poa_evidence_change',
    'CREATE TRIGGER power_of_attorney_transform_no_truncate BEFORE TRUNCATE ON quarantine.power_of_attorney_transform FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_poa_evidence_change()',
  ],
  [
    'power_of_attorney_relationship_no_change',
    'quarantine',
    'power_of_attorney_relationship',
    27,
    'quarantine',
    'refuse_poa_evidence_change',
    'CREATE TRIGGER power_of_attorney_relationship_no_change BEFORE DELETE OR UPDATE ON quarantine.power_of_attorney_relationship FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_poa_evidence_change()',
  ],
  [
    'power_of_attorney_relationship_no_truncate',
    'quarantine',
    'power_of_attorney_relationship',
    34,
    'quarantine',
    'refuse_poa_evidence_change',
    'CREATE TRIGGER power_of_attorney_relationship_no_truncate BEFORE TRUNCATE ON quarantine.power_of_attorney_relationship FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_poa_evidence_change()',
  ],
] as const;

const provenanceBody = `
DECLARE
    parent_source record;
BEGIN
    IF NEW.legacy_source_record_key IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT legacy_source_record_key, legacy_source_extraction_sha256, legacy_lawyers_raw
      INTO parent_source
      FROM public.powers_of_attorney
     WHERE id = NEW.power_of_attorney_id;
    IF parent_source.legacy_source_record_key IS DISTINCT FROM NEW.legacy_source_record_key
       OR parent_source.legacy_source_extraction_sha256 IS DISTINCT FROM NEW.legacy_source_extraction_sha256
       OR parent_source.legacy_lawyers_raw IS DISTINCT FROM NEW.legacy_lawyers_raw THEN
        RAISE EXCEPTION 'POA lawyer provenance does not match its source POA';
    END IF;

    IF NEW.reviewed_rule_id IS NULL THEN
        IF NEW.source_member_ordinal <> 1 OR NOT EXISTS (
            SELECT 1 FROM public.person_name_alias a
             WHERE a.alias_ar = NEW.legacy_lawyers_raw AND a.person_id = NEW.person_id
        ) THEN
            RAISE EXCEPTION 'Direct POA lawyer must resolve through one exact alias';
        END IF;
    ELSIF NOT EXISTS (
        SELECT 1
          FROM public.migration_multi_person_rule r
          JOIN public.migration_multi_person_rule_member m ON m.rule_id = r.id
         WHERE r.id = NEW.reviewed_rule_id
           AND (
               (r.poa_match_mode IS NULL AND r.raw_value = NEW.legacy_lawyers_raw)
               OR
               (r.poa_match_mode = 'substring'
                AND position(r.raw_value in NEW.legacy_lawyers_raw) > 0)
           )
           AND m.ordinal = NEW.source_member_ordinal
           AND m.person_id = NEW.person_id
    ) THEN
        RAISE EXCEPTION 'POA lawyer does not match the reviewed rule member';
    END IF;
    RETURN NEW;
END;
`;
const evidenceBody = `
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Task 2.9B immutable migration evidence cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.9B migration evidence DELETE/TRUNCATE is refused';
END;
`;
function canonical(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim();
}
function same(a: readonly unknown[], b: readonly unknown[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function poaStructureFailures(db: ClientBase): Promise<string[]> {
  const names = [...checks.map((x) => x[0]), ...foreignKeys.map((x) => x[0])];
  const constraintRows = await db.query<Constraint>(
    `
    SELECT con.conname name,ns.nspname schema_name,rel.relname table_name,con.contype::text type,
      con.convalidated validated,con.connoinherit no_inherit,con.condeferrable deferrable,
      con.condeferred deferred,pg_get_constraintdef(con.oid,true) definition,
      coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality) FROM unnest(con.conkey) WITH ORDINALITY k(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum),ARRAY[]::name[])::text[] source_columns,
      tns.nspname target_schema,trel.relname target_table,
      coalesce((SELECT array_agg(a.attname ORDER BY k.ordinality) FROM unnest(con.confkey) WITH ORDINALITY k(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum),ARRAY[]::name[])::text[] target_columns,
      con.confupdtype::text update_action,con.confdeltype::text delete_action,con.confmatchtype::text match_type
    FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace
    LEFT JOIN pg_class trel ON trel.oid=con.confrelid LEFT JOIN pg_namespace tns ON tns.oid=trel.relnamespace
    WHERE con.conname=ANY($1::text[]) ORDER BY con.conname`,
    [names],
  );
  const indexRows = await db.query<Index>(
    `
    SELECT ir.relname name,ins.nspname schema_name,tr.relname table_name,am.amname method,
      i.indisunique unique_index,i.indisvalid valid,i.indisready ready,i.indislive live,
      i.indimmediate immediate,i.indnullsnotdistinct nulls_not_distinct,i.indisclustered clustered,
      i.indisexclusion exclusion,i.indnkeyatts key_count,i.indnatts attribute_count,
      ARRAY(SELECT pg_get_indexdef(i.indexrelid,n,true) FROM generate_series(1,i.indnkeyatts)n ORDER BY n) columns,
      pg_get_expr(i.indpred,i.indrelid,true) predicate,pg_get_expr(i.indexprs,i.indrelid,true) expressions,
      pg_get_indexdef(i.indexrelid,0,true) definition
    FROM pg_index i JOIN pg_class ir ON ir.oid=i.indexrelid JOIN pg_namespace ins ON ins.oid=ir.relnamespace
    JOIN pg_class tr ON tr.oid=i.indrelid JOIN pg_am am ON am.oid=ir.relam
    WHERE ir.relname=ANY($1::text[]) ORDER BY ir.relname`,
    [indexes.map((x) => x[0])],
  );
  const triggerRows = await db.query<Trigger>(
    `
    SELECT t.tgname name,ns.nspname schema_name,r.relname table_name,t.tgenabled::text enabled,
      t.tgisinternal internal,t.tgtype trigger_type,fns.nspname function_schema,p.proname function_name,
      pg_get_triggerdef(t.oid,true) definition
    FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace fns ON fns.oid=p.pronamespace
    WHERE t.tgname=ANY($1::text[]) ORDER BY t.tgname`,
    [triggers.map((x) => x[0])],
  );
  const functionRows = await db.query<FunctionDefinition>(`
    SELECT p.oid::regprocedure::text signature,p.proname name,ns.nspname schema_name,
      pg_get_function_result(p.oid) return_type,pg_get_function_arguments(p.oid) arguments,
      pg_get_function_identity_arguments(p.oid) identity_arguments,l.lanname language_name,
      p.prokind::text function_kind,p.provolatile::text volatility,p.proisstrict strict,
      p.prosecdef security_definer,p.proleakproof leakproof,p.proparallel::text parallel_safety,
      p.proconfig configuration,p.prosrc body
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid=ANY(ARRAY['public.enforce_poa_lawyer_provenance()'::regprocedure,
      'quarantine.refuse_poa_evidence_change()'::regprocedure]::oid[]) ORDER BY 1`);
  const failures: string[] = [];
  for (const [name, schema, table, type, noInherit, definition] of checks) {
    const r = constraintRows.rows.find((x) => x.name === name);
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
  for (const [
    name,
    schema,
    table,
    source,
    targetSchema,
    targetTable,
    target,
    definition,
    updateAction,
    deleteAction,
  ] of foreignKeys) {
    const r = constraintRows.rows.find((x) => x.name === name);
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
      r.update_action !== updateAction ||
      r.delete_action !== deleteAction ||
      r.match_type !== 's'
    )
      failures.push(`foreign-key definition: ${name}`);
  }
  if (constraintRows.rows.length !== checks.length + foreignKeys.length)
    failures.push('Task 2.9B constraint inventory');
  for (const [name, schema, table, unique, columns, definition] of indexes) {
    const r = indexRows.rows.find((x) => x.name === name);
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
  if (indexRows.rows.length !== indexes.length) failures.push('Task 2.9B index inventory');
  for (const [name, schema, table, type, functionSchema, functionName, definition] of triggers) {
    const r = triggerRows.rows.find((x) => x.name === name);
    if (
      !r ||
      r.schema_name !== schema ||
      r.table_name !== table ||
      r.enabled !== 'O' ||
      r.internal ||
      r.trigger_type !== type ||
      r.function_schema !== functionSchema ||
      r.function_name !== functionName ||
      canonical(r.definition) !== canonical(definition)
    )
      failures.push(`trigger definition: ${name}`);
  }
  if (triggerRows.rows.length !== triggers.length) failures.push('Task 2.9B trigger inventory');
  const expectedFunctions = [
    ['enforce_poa_lawyer_provenance()', 'enforce_poa_lawyer_provenance', 'public', provenanceBody],
    [
      'quarantine.refuse_poa_evidence_change()',
      'refuse_poa_evidence_change',
      'quarantine',
      evidenceBody,
    ],
  ] as const;
  for (const [signature, name, schema, body] of expectedFunctions) {
    const f = functionRows.rows.find((x) => x.signature === signature);
    if (
      !f ||
      f.name !== name ||
      f.schema_name !== schema ||
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
      failures.push(`function definition: ${signature}`);
  }
  if (functionRows.rows.length !== 2) failures.push('Task 2.9B function inventory');
  return failures;
}
