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
  body: string;
};

const EXPECTED_CHECKS = [
  {
    name: 'matter_lawyers_legacy_source_shape',
    schema: 'public',
    table: 'matter_lawyers',
    definition:
      "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND source_field IS NULL AND source_member_ordinal IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND (source_field = ANY (ARRAY['lawyerA'::text, 'lawyerB'::text])) AND source_member_ordinal >= 1)",
  },
  {
    name: 'matter_lawyers_rule_shape',
    schema: 'public',
    table: 'matter_lawyers',
    definition:
      'CHECK (legacy_source_record_key IS NULL AND reviewed_rule_id IS NULL OR legacy_source_record_key IS NOT NULL AND (reviewed_rule_id IS NULL AND source_member_ordinal = 1 OR reviewed_rule_id IS NOT NULL))',
  },
  {
    name: 'matter_parties_legacy_source_shape',
    schema: 'public',
    table: 'matter_parties',
    definition:
      "CHECK (legacy_source_record_key IS NULL AND legacy_source_extraction_sha256 IS NULL AND source_field IS NULL AND source_fragment_ordinal IS NULL OR legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text AND (source_field = ANY (ARRAY['client&Cap'::text, 'opponent&Cap'::text])) AND source_fragment_ordinal >= 1)",
  },
] as const;

const EXPECTED_FOREIGN_KEYS = [
  {
    name: 'matter_lawyers_reviewed_rule_id_fkey',
    schema: 'public',
    table: 'matter_lawyers',
    source: ['reviewed_rule_id'],
    targetSchema: 'public',
    targetTable: 'migration_multi_person_rule',
    target: ['id'],
    definition:
      'FOREIGN KEY (reviewed_rule_id) REFERENCES migration_multi_person_rule(id) ON UPDATE CASCADE ON DELETE RESTRICT',
  },
  {
    name: 'matter_relationship_transform_exclusion_fkey',
    schema: 'quarantine',
    table: 'matter_relationship_transform',
    source: ['reviewed_exclusion_raw_value'],
    targetSchema: 'public',
    targetTable: 'migration_excluded_name',
    target: ['raw_value'],
    definition:
      'FOREIGN KEY (reviewed_exclusion_raw_value) REFERENCES migration_excluded_name(raw_value) ON UPDATE CASCADE ON DELETE RESTRICT',
  },
  {
    name: 'migration_multi_person_rule_member_person_id_fkey',
    schema: 'public',
    table: 'migration_multi_person_rule_member',
    source: ['person_id'],
    targetSchema: 'public',
    targetTable: 'people',
    target: ['id'],
    definition:
      'FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE RESTRICT',
  },
  {
    name: 'migration_multi_person_rule_member_rule_id_fkey',
    schema: 'public',
    table: 'migration_multi_person_rule_member',
    source: ['rule_id'],
    targetSchema: 'public',
    targetTable: 'migration_multi_person_rule',
    target: ['id'],
    definition:
      'FOREIGN KEY (rule_id) REFERENCES migration_multi_person_rule(id) ON UPDATE CASCADE ON DELETE RESTRICT',
  },
] as const;

const EXPECTED_INDEXES = [
  {
    name: 'matter_lawyers_legacy_source_key',
    table: 'matter_lawyers',
    columns: ['legacy_source_record_key', 'source_field', 'source_member_ordinal'],
    definition:
      'CREATE UNIQUE INDEX matter_lawyers_legacy_source_key ON matter_lawyers USING btree (legacy_source_record_key, source_field, source_member_ordinal)',
  },
  {
    name: 'matter_lawyers_matter_person_key',
    table: 'matter_lawyers',
    columns: ['matter_id', 'person_id'],
    definition:
      'CREATE UNIQUE INDEX matter_lawyers_matter_person_key ON matter_lawyers USING btree (matter_id, person_id)',
  },
  {
    name: 'matter_parties_legacy_source_key',
    table: 'matter_parties',
    columns: ['legacy_source_record_key', 'source_field', 'source_fragment_ordinal'],
    definition:
      'CREATE UNIQUE INDEX matter_parties_legacy_source_key ON matter_parties USING btree (legacy_source_record_key, source_field, source_fragment_ordinal)',
  },
  {
    name: 'matter_party_roles_party_ordinal_key',
    table: 'matter_party_roles',
    columns: ['party_id', 'ordinal'],
    definition:
      'CREATE UNIQUE INDEX matter_party_roles_party_ordinal_key ON matter_party_roles USING btree (party_id, ordinal)',
  },
  {
    name: 'matter_party_roles_party_role_key',
    table: 'matter_party_roles',
    columns: ['party_id', 'role_id'],
    definition:
      'CREATE UNIQUE INDEX matter_party_roles_party_role_key ON matter_party_roles USING btree (party_id, role_id)',
  },
] as const;

const EXPECTED_TRIGGERS = [
  {
    name: 'matter_relationship_transform_no_erasure',
    type: 42,
    function: 'refuse_matter_relationship_transform_erasure',
    definition:
      'CREATE TRIGGER matter_relationship_transform_no_erasure BEFORE DELETE OR TRUNCATE ON quarantine.matter_relationship_transform FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_matter_relationship_transform_erasure()',
  },
  {
    name: 'matter_relationship_transform_source_immutable',
    type: 19,
    function: 'protect_matter_relationship_transform_source',
    definition:
      'CREATE TRIGGER matter_relationship_transform_source_immutable BEFORE UPDATE ON quarantine.matter_relationship_transform FOR EACH ROW EXECUTE FUNCTION quarantine.protect_matter_relationship_transform_source()',
  },
] as const;

const EXPECTED_IMMUTABILITY_BODY = `
BEGIN
    IF NEW.relationship_kind IS DISTINCT FROM OLD.relationship_kind
       OR NEW.source_field IS DISTINCT FROM OLD.source_field
       OR NEW.side IS DISTINCT FROM OLD.side
       OR NEW.src_record_key IS DISTINCT FROM OLD.src_record_key
       OR NEW.extraction_sha256 IS DISTINCT FROM OLD.extraction_sha256
       OR NEW.src_file IS DISTINCT FROM OLD.src_file
       OR NEW.src_row_num IS DISTINCT FROM OLD.src_row_num
       OR NEW.legacy_matter_id IS DISTINCT FROM OLD.legacy_matter_id
       OR NEW.raw_value IS DISTINCT FROM OLD.raw_value
       OR NEW.outcome IS DISTINCT FROM OLD.outcome
       OR NEW.reason_codes IS DISTINCT FROM OLD.reason_codes
       OR NEW.reason_details IS DISTINCT FROM OLD.reason_details
       OR NEW.source_payload IS DISTINCT FROM OLD.source_payload
       OR NEW.reviewed_exclusion_raw_value IS DISTINCT FROM OLD.reviewed_exclusion_raw_value THEN
        RAISE EXCEPTION 'matter relationship migration evidence is immutable; resolve without rewriting it';
    END IF;
    RETURN NEW;
END;
`;

const EXPECTED_ERASURE_BODY = `
BEGIN
    RAISE EXCEPTION 'matter relationship rows are migration evidence; never delete or truncate them';
END;
`;

function canonical(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

function sameStrings(actual: string[], expected: readonly string[]): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export async function matterRelationshipStructureFailures(db: ClientBase): Promise<string[]> {
  const constraintNames = [
    ...EXPECTED_CHECKS.map((row) => row.name),
    ...EXPECTED_FOREIGN_KEYS.map((row) => row.name),
  ];
  const indexNames = EXPECTED_INDEXES.map((row) => row.name);
  const triggerNames = EXPECTED_TRIGGERS.map((row) => row.name);
  const functionNames = EXPECTED_TRIGGERS.map((row) => row.function);

  const constraints = await db.query<ConstraintRow>(
    `SELECT con.conname AS name,
              ns.nspname AS schema_name,
              rel.relname AS table_name,
              con.contype::text AS constraint_type,
              con.convalidated AS validated,
              con.connoinherit AS no_inherit,
              con.condeferrable AS deferrable,
              con.condeferred AS initially_deferred,
              pg_get_constraintdef(con.oid, true) AS definition,
              coalesce((
                SELECT array_agg(attribute.attname ORDER BY key.ordinality)
                  FROM unnest(con.conkey) WITH ORDINALITY key(attnum, ordinality)
                  JOIN pg_attribute attribute
                    ON attribute.attrelid = con.conrelid
                   AND attribute.attnum = key.attnum
              ), ARRAY[]::name[])::text[] AS source_columns,
              target_ns.nspname AS target_schema,
              target_rel.relname AS target_table,
              coalesce((
                SELECT array_agg(attribute.attname ORDER BY key.ordinality)
                  FROM unnest(con.confkey) WITH ORDINALITY key(attnum, ordinality)
                  JOIN pg_attribute attribute
                    ON attribute.attrelid = con.confrelid
                   AND attribute.attnum = key.attnum
              ), ARRAY[]::name[])::text[] AS target_columns,
              con.confupdtype::text AS update_action,
              con.confdeltype::text AS delete_action,
              con.confmatchtype::text AS match_type
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = rel.relnamespace
         LEFT JOIN pg_class target_rel ON target_rel.oid = con.confrelid
         LEFT JOIN pg_namespace target_ns ON target_ns.oid = target_rel.relnamespace
        WHERE con.conname = ANY($1::text[])
        ORDER BY con.conname`,
    [constraintNames],
  );
  const indexes = await db.query<IndexRow>(
    `SELECT index_rel.relname AS name,
              index_ns.nspname AS schema_name,
              table_ns.nspname AS table_schema,
              table_rel.relname AS table_name,
              access_method.amname AS access_method,
              index_info.indisunique AS unique_index,
              index_info.indisvalid AS valid,
              index_info.indisready AS ready,
              index_info.indislive AS live,
              index_info.indimmediate AS immediate,
              index_info.indnullsnotdistinct AS nulls_not_distinct,
              index_info.indisclustered AS clustered,
              index_info.indisexclusion AS exclusion,
              index_info.indnkeyatts AS key_count,
              index_info.indnatts AS attribute_count,
              ARRAY(
                SELECT pg_get_indexdef(index_info.indexrelid, ordinal, true)
                  FROM generate_series(1, index_info.indnkeyatts) ordinal
                 ORDER BY ordinal
              ) AS columns,
              pg_get_expr(index_info.indpred, index_info.indrelid, true) AS predicate,
              pg_get_expr(index_info.indexprs, index_info.indrelid, true) AS expressions,
              pg_get_indexdef(index_info.indexrelid, 0, true) AS definition
         FROM pg_index index_info
         JOIN pg_class index_rel ON index_rel.oid = index_info.indexrelid
         JOIN pg_namespace index_ns ON index_ns.oid = index_rel.relnamespace
         JOIN pg_class table_rel ON table_rel.oid = index_info.indrelid
         JOIN pg_namespace table_ns ON table_ns.oid = table_rel.relnamespace
         JOIN pg_am access_method ON access_method.oid = index_rel.relam
        WHERE index_rel.relname = ANY($1::text[])
        ORDER BY index_rel.relname`,
    [indexNames],
  );
  const triggers = await db.query<TriggerRow>(
    `SELECT trigger.tgname AS name,
              table_ns.nspname AS schema_name,
              table_rel.relname AS table_name,
              trigger.tgenabled::text AS enabled,
              trigger.tgisinternal AS internal,
              trigger.tgtype AS trigger_type,
              function_ns.nspname AS function_schema,
              function.proname AS function_name,
              pg_get_triggerdef(trigger.oid, true) AS definition
         FROM pg_trigger trigger
         JOIN pg_class table_rel ON table_rel.oid = trigger.tgrelid
         JOIN pg_namespace table_ns ON table_ns.oid = table_rel.relnamespace
         JOIN pg_proc function ON function.oid = trigger.tgfoid
         JOIN pg_namespace function_ns ON function_ns.oid = function.pronamespace
        WHERE trigger.tgname = ANY($1::text[])
        ORDER BY trigger.tgname`,
    [triggerNames],
  );
  const functions = await db.query<FunctionRow>(
    `SELECT function.proname AS name,
              function_ns.nspname AS schema_name,
              pg_get_function_result(function.oid) AS return_type,
              pg_get_function_arguments(function.oid) AS arguments,
              pg_get_function_identity_arguments(function.oid) AS identity_arguments,
              language.lanname AS language_name,
              function.prokind::text AS function_kind,
              function.provolatile::text AS volatility,
              function.proisstrict AS strict,
              function.prosecdef AS security_definer,
              function.proleakproof AS leakproof,
              function.proparallel::text AS parallel_safety,
              function.prosrc AS body
         FROM pg_proc function
         JOIN pg_namespace function_ns ON function_ns.oid = function.pronamespace
         JOIN pg_language language ON language.oid = function.prolang
        WHERE function_ns.nspname = 'quarantine'
          AND function.proname = ANY($1::text[])
        ORDER BY function.proname`,
    [functionNames],
  );

  const defects: string[] = [];
  for (const expected of EXPECTED_CHECKS) {
    const actual = constraints.rows.find((row) => row.name === expected.name);
    if (
      actual === undefined ||
      actual.schema_name !== expected.schema ||
      actual.table_name !== expected.table ||
      actual.constraint_type !== 'c' ||
      !actual.validated ||
      actual.no_inherit ||
      actual.deferrable ||
      actual.initially_deferred ||
      actual.target_schema !== null ||
      actual.target_table !== null ||
      actual.target_columns.length !== 0 ||
      canonical(actual.definition) !== canonical(expected.definition)
    ) {
      defects.push(`CHECK definition: ${expected.name}`);
    }
  }
  for (const expected of EXPECTED_FOREIGN_KEYS) {
    const actual = constraints.rows.find((row) => row.name === expected.name);
    if (
      actual === undefined ||
      actual.schema_name !== expected.schema ||
      actual.table_name !== expected.table ||
      actual.constraint_type !== 'f' ||
      !actual.validated ||
      !actual.no_inherit ||
      actual.deferrable ||
      actual.initially_deferred ||
      !sameStrings(actual.source_columns, expected.source) ||
      actual.target_schema !== expected.targetSchema ||
      actual.target_table !== expected.targetTable ||
      !sameStrings(actual.target_columns, expected.target) ||
      actual.update_action !== 'c' ||
      actual.delete_action !== 'r' ||
      actual.match_type !== 's' ||
      canonical(actual.definition) !== canonical(expected.definition)
    ) {
      defects.push(`foreign key definition: ${expected.name}`);
    }
  }
  if (constraints.rows.length !== EXPECTED_CHECKS.length + EXPECTED_FOREIGN_KEYS.length) {
    defects.push('Task 2.7 constraint inventory');
  }

  for (const expected of EXPECTED_INDEXES) {
    const actual = indexes.rows.find((row) => row.name === expected.name);
    if (
      actual === undefined ||
      actual.schema_name !== 'public' ||
      actual.table_schema !== 'public' ||
      actual.table_name !== expected.table ||
      actual.access_method !== 'btree' ||
      !actual.unique_index ||
      !actual.valid ||
      !actual.ready ||
      !actual.live ||
      !actual.immediate ||
      actual.nulls_not_distinct ||
      actual.clustered ||
      actual.exclusion ||
      actual.key_count !== expected.columns.length ||
      actual.attribute_count !== expected.columns.length ||
      !sameStrings(actual.columns, expected.columns) ||
      actual.predicate !== null ||
      actual.expressions !== null ||
      canonical(actual.definition) !== canonical(expected.definition)
    ) {
      defects.push(`unique index definition: ${expected.name}`);
    }
  }
  if (indexes.rows.length !== EXPECTED_INDEXES.length) {
    defects.push('Task 2.7 unique-index inventory');
  }

  for (const expected of EXPECTED_TRIGGERS) {
    const actual = triggers.rows.find((row) => row.name === expected.name);
    if (
      actual === undefined ||
      actual.schema_name !== 'quarantine' ||
      actual.table_name !== 'matter_relationship_transform' ||
      actual.enabled !== 'O' ||
      actual.internal ||
      actual.trigger_type !== expected.type ||
      actual.function_schema !== 'quarantine' ||
      actual.function_name !== expected.function ||
      canonical(actual.definition) !== canonical(expected.definition)
    ) {
      defects.push(`trigger definition: ${expected.name}`);
    }
  }
  if (triggers.rows.length !== EXPECTED_TRIGGERS.length) {
    defects.push('Task 2.7 trigger inventory');
  }

  const expectedFunctions = new Map([
    ['protect_matter_relationship_transform_source', EXPECTED_IMMUTABILITY_BODY],
    ['refuse_matter_relationship_transform_erasure', EXPECTED_ERASURE_BODY],
  ]);
  for (const [name, body] of expectedFunctions) {
    const actual = functions.rows.find((row) => row.name === name);
    if (
      actual === undefined ||
      actual.schema_name !== 'quarantine' ||
      actual.return_type !== 'trigger' ||
      actual.arguments !== '' ||
      actual.identity_arguments !== '' ||
      actual.language_name !== 'plpgsql' ||
      actual.function_kind !== 'f' ||
      actual.volatility !== 'v' ||
      actual.strict ||
      actual.security_definer ||
      actual.leakproof ||
      actual.parallel_safety !== 'u' ||
      canonical(actual.body) !== canonical(body)
    ) {
      defects.push(`trigger function definition: quarantine.${name}()`);
    }
  }
  if (functions.rows.length !== expectedFunctions.size) {
    defects.push('Task 2.7 trigger-function inventory');
  }

  return defects;
}
