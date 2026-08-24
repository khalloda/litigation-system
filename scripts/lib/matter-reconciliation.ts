import { readFileSync } from 'node:fs';

export type DatabaseCount = bigint | number | string;

export type MatterReconciliationRow = Record<string, DatabaseCount> & {
  source_rows: DatabaseCount;
  target_rows: DatabaseCount;
  quarantine_rows: DatabaseCount;
};

export const MATTER_RECONCILIATION_SQL = readFileSync(
  new URL('../../sql/check-matter-reconciliation.sql', import.meta.url),
  'utf8',
);

export type MatterStructureRow = {
  source_constraint_definition: string | null;
  source_index_definition: string | null;
  branch_fk_definition: string | null;
  immutable_trigger_definition: string | null;
  immutable_trigger_enabled: string | null;
  immutable_trigger_internal: boolean | null;
  immutable_function_source: string | null;
  immutable_function_return_type: string | null;
  no_erasure_trigger_definition: string | null;
  no_erasure_trigger_enabled: string | null;
  no_erasure_trigger_internal: boolean | null;
  no_erasure_function_source: string | null;
  no_erasure_function_return_type: string | null;
};

export const MATTER_STRUCTURE_SQL = String.raw`
SELECT
  (SELECT pg_get_constraintdef(c.oid)
     FROM pg_constraint c
    WHERE c.conrelid = 'public.matters'::regclass
      AND c.conname = 'matters_source_identity_shape'
      AND c.contype = 'c'
      AND c.convalidated) AS source_constraint_definition,
  (SELECT pg_get_indexdef(i.indexrelid)
     FROM pg_index i
     JOIN pg_class index_class ON index_class.oid = i.indexrelid
     JOIN pg_am access_method ON access_method.oid = index_class.relam
    WHERE i.indrelid = 'public.matters'::regclass
      AND index_class.relname = 'matters_legacy_source_record_key_key'
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indnkeyatts = 1
      AND i.indnatts = 1
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND access_method.amname = 'btree'
      AND pg_get_indexdef(i.indexrelid, 1, true) = 'legacy_source_record_key')
    AS source_index_definition,
  (SELECT pg_get_constraintdef(c.oid)
     FROM pg_constraint c
     JOIN pg_attribute source_column
       ON source_column.attrelid = c.conrelid
      AND source_column.attname = 'branch_id'
     JOIN pg_attribute target_column
       ON target_column.attrelid = c.confrelid
      AND target_column.attname = 'id'
    WHERE c.conrelid = 'public.matters'::regclass
      AND c.conname = 'matters_branch_id_fkey'
      AND c.contype = 'f'
      AND c.convalidated
      AND c.confrelid = 'public.lookup_client_branch'::regclass
      AND c.conkey = ARRAY[source_column.attnum]::smallint[]
      AND c.confkey = ARRAY[target_column.attnum]::smallint[]
      AND c.confupdtype = 'c'
      AND c.confdeltype = 'n') AS branch_fk_definition,
  immutable.definition AS immutable_trigger_definition,
  immutable.tgenabled AS immutable_trigger_enabled,
  immutable.tgisinternal AS immutable_trigger_internal,
  immutable.function_source AS immutable_function_source,
  immutable.function_return_type AS immutable_function_return_type,
  erasure.definition AS no_erasure_trigger_definition,
  erasure.tgenabled AS no_erasure_trigger_enabled,
  erasure.tgisinternal AS no_erasure_trigger_internal,
  erasure.function_source AS no_erasure_function_source,
  erasure.function_return_type AS no_erasure_function_return_type
FROM (VALUES (1)) singleton(value)
LEFT JOIN LATERAL (
    SELECT pg_get_triggerdef(t.oid) AS definition,
           t.tgenabled::text AS tgenabled,
           t.tgisinternal,
           p.prosrc AS function_source,
           p.prorettype::regtype::text AS function_return_type
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE t.tgrelid = 'quarantine.matter_transform'::regclass
       AND t.tgname = 'matter_transform_source_immutable'
       AND n.nspname = 'quarantine'
       AND p.proname = 'protect_matter_transform_source'
) immutable ON true
LEFT JOIN LATERAL (
    SELECT pg_get_triggerdef(t.oid) AS definition,
           t.tgenabled::text AS tgenabled,
           t.tgisinternal,
           p.prosrc AS function_source,
           p.prorettype::regtype::text AS function_return_type
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE t.tgrelid = 'quarantine.matter_transform'::regclass
       AND t.tgname = 'matter_transform_no_erasure'
       AND n.nspname = 'quarantine'
       AND p.proname = 'refuse_matter_transform_erasure'
) erasure ON true`;

const EXPECTED_SOURCE_CONSTRAINT = `CHECK ((((legacy_source_record_key IS NULL) AND (legacy_source_extraction_sha256 IS NULL) AND (legacy_source_payload IS NULL)) OR ((legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text) AND (legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text) AND (jsonb_typeof(legacy_source_payload) = 'object'::text))))`;

const EXPECTED_SOURCE_INDEX =
  'CREATE UNIQUE INDEX matters_legacy_source_record_key_key ON public.matters USING btree (legacy_source_record_key)';

const EXPECTED_BRANCH_FK =
  'FOREIGN KEY (branch_id) REFERENCES lookup_client_branch(id) ON UPDATE CASCADE ON DELETE SET NULL';

const EXPECTED_IMMUTABLE_TRIGGER =
  'CREATE TRIGGER matter_transform_source_immutable BEFORE UPDATE ON quarantine.matter_transform FOR EACH ROW EXECUTE FUNCTION quarantine.protect_matter_transform_source()';

const EXPECTED_NO_ERASURE_TRIGGER =
  'CREATE TRIGGER matter_transform_no_erasure BEFORE DELETE OR TRUNCATE ON quarantine.matter_transform FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_matter_transform_erasure()';

const EXPECTED_IMMUTABLE_FUNCTION = `
BEGIN
    IF NEW.src_record_key IS DISTINCT FROM OLD.src_record_key
       OR NEW.extraction_sha256 IS DISTINCT FROM OLD.extraction_sha256
       OR NEW.src_file IS DISTINCT FROM OLD.src_file
       OR NEW.src_row_num IS DISTINCT FROM OLD.src_row_num
       OR NEW.legacy_matter_id IS DISTINCT FROM OLD.legacy_matter_id
       OR NEW.reason_codes IS DISTINCT FROM OLD.reason_codes
       OR NEW.reason_details IS DISTINCT FROM OLD.reason_details
       OR NEW.source_payload IS DISTINCT FROM OLD.source_payload THEN
        RAISE EXCEPTION 'matter transform source and reasons are immutable; resolve the row without rewriting its evidence';
    END IF;
    RETURN NEW;
END`;

const EXPECTED_NO_ERASURE_FUNCTION = `
BEGIN
    RAISE EXCEPTION 'matter transform quarantine is migration evidence; resolve rows, never delete or truncate them';
END`;

function canonicalDefinition(value: string | null): string {
  return value?.replace(/\r\n?/g, '\n').trim() ?? '';
}

export function matterStructureFailures(row: MatterStructureRow): string[] {
  const failures: string[] = [];
  const expect = (name: string, actual: string | null, expected: string) => {
    if (canonicalDefinition(actual) !== canonicalDefinition(expected)) failures.push(name);
  };

  expect(
    'source identity CHECK definition',
    row.source_constraint_definition,
    EXPECTED_SOURCE_CONSTRAINT,
  );
  expect(
    'unique source identity index definition',
    row.source_index_definition,
    EXPECTED_SOURCE_INDEX,
  );
  expect('branch foreign key definition', row.branch_fk_definition, EXPECTED_BRANCH_FK);
  expect(
    'quarantine immutability trigger definition',
    row.immutable_trigger_definition,
    EXPECTED_IMMUTABLE_TRIGGER,
  );
  expect(
    'quarantine immutability function definition',
    row.immutable_function_source,
    EXPECTED_IMMUTABLE_FUNCTION,
  );
  expect(
    'quarantine erasure trigger definition',
    row.no_erasure_trigger_definition,
    EXPECTED_NO_ERASURE_TRIGGER,
  );
  expect(
    'quarantine erasure function definition',
    row.no_erasure_function_source,
    EXPECTED_NO_ERASURE_FUNCTION,
  );

  if (row.immutable_trigger_enabled !== 'O' || row.immutable_trigger_internal !== false) {
    failures.push('quarantine immutability trigger enabled state');
  }
  if (row.no_erasure_trigger_enabled !== 'O' || row.no_erasure_trigger_internal !== false) {
    failures.push('quarantine erasure trigger enabled state');
  }
  if (row.immutable_function_return_type !== 'trigger') {
    failures.push('quarantine immutability function return type');
  }
  if (row.no_erasure_function_return_type !== 'trigger') {
    failures.push('quarantine erasure function return type');
  }
  return failures;
}

export const MATTER_DIRECT_MISMATCH_FIELDS = [
  'legacy_id_mismatch',
  'legacy_source_extraction_sha256_mismatch',
  'case_number_ar_mismatch',
  'case_number_en_mismatch',
  'subject_mismatch',
  'status_mismatch',
  'notes_1_mismatch',
  'notes_2_mismatch',
  'start_date_mismatch',
  'end_date_mismatch',
  'asked_amount_mismatch',
  'judged_amount_mismatch',
  'legacy_selected_mismatch',
  'evaluation_mismatch',
  'current_status_mismatch',
  'legacy_client_type_raw_mismatch',
  'legacy_financial_allocation_raw_mismatch',
  'legal_opinion_mismatch',
  'legacy_contract_id_raw_mismatch',
  'legacy_partner_raw_mismatch',
  'circuit_secretary_mismatch',
  'court_floor_mismatch',
  'court_hall_mismatch',
  'court_shelf_mismatch',
  'court_secretary_room_mismatch',
  'fee_letter_ref_mismatch',
] as const;

export const MATTER_QUARANTINE_MISMATCH_FIELDS = [
  'quarantine_source_key_mismatch',
  'safe_row_in_quarantine',
  'unsafe_row_missing_quarantine',
  'quarantine_extraction_mismatch',
  'quarantine_src_file_mismatch',
  'quarantine_src_row_mismatch',
  'quarantine_legacy_id_mismatch',
  'quarantine_payload_mismatch',
  'quarantine_reason_codes_mismatch',
  'quarantine_reason_details_mismatch',
] as const;

export const MATTER_RECONCILIATION_DEFECT_FIELDS = [
  'missing_or_duplicate',
  'stale_target',
  'stale_quarantine',
  'target_payload_mismatch',
  'raw_mismatch',
  'client_mismatch',
  'mapping_mismatch',
  'mapping_coverage',
  'mapping_key_collisions',
  'separate_client_in_target',
  'conflicts_in_target',
  'unsafe_court_in_target',
  ...MATTER_DIRECT_MISMATCH_FIELDS,
  ...MATTER_QUARANTINE_MISMATCH_FIELDS,
] as const;

export function asBigInt(value: DatabaseCount): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

export function matterReconciliationFailures(row: MatterReconciliationRow): string[] {
  return MATTER_RECONCILIATION_DEFECT_FIELDS.filter((field) => {
    const value = row[field];
    if (value === undefined) throw new Error(`matter reconciliation did not return ${field}`);
    return asBigInt(value) !== 0n;
  });
}
