import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';

export const HEARING_RECONCILIATION_SQL = readFileSync(
  new URL('../../sql/check-hearing-reconciliation.sql', import.meta.url),
  'utf8',
);

type Count = string | number | bigint;
type ReconciliationRow = {
  source_hearings: Count;
  expected_hearings: Count;
  expected_quarantine: Count;
  actual_hearings: Count;
  actual_quarantine: Count;
  target_defects: Count;
  quarantine_defects: Count;
  source_partition_defects: Count;
  audit_cell_partition_defects: Count;
  audit_cells: Count;
  target_audit_cells: Count;
  quarantined_audit_cells: Count;
  expected_attendees: Count;
  actual_attendees: Count;
  attendee_defects: Count;
  quarantined_person_spans: Count;
  distinct_attendee_people: Count;
  attendee_alias_defects: Count;
  nonperson_attendee_defects: Count;
  reviewed_key_collisions: Count;
};

export type HearingReconciliation = {
  sourceHearings: number;
  expectedTransformedHearings: number;
  expectedQuarantinedHearings: number;
  expectedAttendees: number;
  transformedHearings: number;
  quarantinedHearings: number;
  auditCells: number;
  targetAuditCells: number;
  quarantinedAuditCells: number;
  attendees: number;
  quarantinedPersonSpans: number;
  distinctAttendeePeople: number;
  quarantineBreakdown: Array<{ reason: string; count: number }>;
  defects: string[];
};

function number(value: Count): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`invalid hearing reconciliation count: ${String(value)}`);
  }
  return parsed;
}

function defect(list: string[], label: string, value: Count): void {
  const actual = number(value);
  if (actual !== 0) list.push(`${label}: ${String(actual)}`);
}

export async function reconcileHearings(db: ClientBase): Promise<HearingReconciliation> {
  const result = await db.query<ReconciliationRow>(HEARING_RECONCILIATION_SQL);
  if (result.rows.length !== 1) {
    throw new Error(`hearing reconciliation returned ${String(result.rows.length)} rows`);
  }
  const row = result.rows[0]!;
  const defects: string[] = [];
  defect(defects, 'hearing target rows missing, extra or changed', row.target_defects);
  defect(defects, 'hearing quarantine rows missing, extra or changed', row.quarantine_defects);
  defect(defects, 'source hearing partition defects', row.source_partition_defects);
  defect(defects, 'attendee audit-cell parent partition defects', row.audit_cell_partition_defects);
  defect(defects, 'hearing attendees missing, extra or changed', row.attendee_defects);
  defect(defects, 'person spans not backed by exactly one alias', row.attendee_alias_defects);
  defect(defects, 'non-person spans creating attendees', row.nonperson_attendee_defects);
  defect(defects, 'reviewed hearing mapping key collisions', row.reviewed_key_collisions);

  if (number(row.actual_hearings) !== number(row.expected_hearings)) {
    defects.push(
      `transformed hearing count: ${String(row.actual_hearings)}/${String(row.expected_hearings)}`,
    );
  }
  if (number(row.actual_quarantine) !== number(row.expected_quarantine)) {
    defects.push(
      `hearing quarantine count: ${String(row.actual_quarantine)}/${String(row.expected_quarantine)}`,
    );
  }
  if (number(row.actual_attendees) !== number(row.expected_attendees)) {
    defects.push(
      `hearing attendee count: ${String(row.actual_attendees)}/${String(row.expected_attendees)}`,
    );
  }

  const breakdown = await db.query<{ reason: string; count: string }>(`
    SELECT reason, count(*)::text count
      FROM quarantine.hearing_transform q
      CROSS JOIN LATERAL unnest(q.reason_codes) reason
     GROUP BY reason ORDER BY reason COLLATE "C"`);

  return {
    sourceHearings: number(row.source_hearings),
    expectedTransformedHearings: number(row.expected_hearings),
    expectedQuarantinedHearings: number(row.expected_quarantine),
    expectedAttendees: number(row.expected_attendees),
    transformedHearings: number(row.actual_hearings),
    quarantinedHearings: number(row.actual_quarantine),
    auditCells: number(row.audit_cells),
    targetAuditCells: number(row.target_audit_cells),
    quarantinedAuditCells: number(row.quarantined_audit_cells),
    attendees: number(row.actual_attendees),
    quarantinedPersonSpans: number(row.quarantined_person_spans),
    distinctAttendeePeople: number(row.distinct_attendee_people),
    quarantineBreakdown: breakdown.rows.map((item) => ({
      reason: item.reason,
      count: number(item.count),
    })),
    defects,
  };
}

export async function hearingResultDigest(db: ClientBase): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(coalesce(string_agg(payload, E'\n' ORDER BY kind, identity), ''), 'UTF8')), 'hex') digest
      FROM (
        SELECT 'H' kind, legacy_source_record_key identity, to_jsonb(h)::text payload
          FROM hearings h WHERE legacy_source_record_key IS NOT NULL
        UNION ALL
        SELECT 'A', source_span_id, to_jsonb(a)::text
          FROM hearing_attendees a WHERE legacy_source_record_key IS NOT NULL
        UNION ALL
        SELECT 'Q', src_record_key, to_jsonb(q)::text
          FROM quarantine.hearing_transform q
      ) legacy_result`);
  return result.rows[0]?.digest ?? '';
}

type CatalogRow = { name: string; definition: string; enabled?: string };

export async function hearingStructureFailures(db: ClientBase): Promise<string[]> {
  const failures: string[] = [];
  const constraints = await db.query<CatalogRow>(`
    SELECT conname name, pg_get_constraintdef(oid) definition
      FROM pg_constraint
     WHERE conrelid IN (
       'public.hearings'::regclass,
       'public.hearing_attendees'::regclass,
       'quarantine.hearing_transform'::regclass
     ) ORDER BY conname`);
  const requiredConstraints = new Map([
    [
      'hearings_source_identity_shape',
      `CHECK ((((legacy_source_record_key IS NULL) AND (legacy_source_extraction_sha256 IS NULL) AND (legacy_source_payload IS NULL)) OR ((legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text) AND (legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text) AND (jsonb_typeof(legacy_source_payload) = 'object'::text))))`,
    ],
    [
      'hearings_destination_id_fkey',
      'FOREIGN KEY (destination_id) REFERENCES lookup_matter_destination(id) ON UPDATE CASCADE ON DELETE SET NULL',
    ],
    [
      'hearing_attendees_source_identity_shape',
      `CHECK ((((legacy_source_record_key IS NULL) AND (legacy_source_extraction_sha256 IS NULL) AND (source_column IS NULL) AND (source_column_ordinal IS NULL) AND (source_cell_id IS NULL) AND (source_span_id IS NULL) AND (source_span_sequence IS NULL)) OR ((legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text) AND (legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'::text) AND (source_column IS NOT NULL) AND ((source_column_ordinal >= 1) AND (source_column_ordinal <= 5)) AND (source_cell_id ~ '^[0-9a-f]{64}$'::text) AND (source_span_id ~ '^[0-9a-f]{64}$'::text) AND (source_span_sequence > 0) AND (legacy_name_raw IS NOT NULL) AND (person_id IS NOT NULL) AND (ordinal > 0))))`,
    ],
    ['hearing_attendees_hearing_ordinal_key', 'UNIQUE (hearing_id, ordinal)'],
    ['hearing_attendees_source_span_id_key', 'UNIQUE (source_span_id)'],
    [
      'hearing_transform_evidence_shape',
      `CHECK (((src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'::text) AND (extraction_sha256 ~ '^[0-9A-F]{64}$'::text) AND (src_row_num > 0) AND (cardinality(reason_codes) > 0) AND (jsonb_typeof(reason_details) = 'array'::text) AND (jsonb_array_length(reason_details) = cardinality(reason_codes)) AND (jsonb_typeof(source_payload) = 'object'::text)))`,
    ],
    ['hearing_transform_src_record_key_key', 'UNIQUE (src_record_key)'],
  ]);
  for (const [name, expected] of requiredConstraints) {
    const actual = constraints.rows.find((row) => row.name === name)?.definition;
    if (actual !== expected) {
      failures.push(`constraint definition changed: ${name}`);
    }
  }

  const indexes = await db.query<CatalogRow>(`
    SELECT CASE WHEN n.nspname='quarantine' THEN n.nspname || '.' || c.relname
                ELSE c.relname END name,
           pg_get_indexdef(c.oid) definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind='i'
       AND (n.nspname,c.relname) IN (
         ('public','hearings_legacy_source_record_key_key'),
         ('public','hearings_destination_id_idx'),
         ('public','hearing_attendees_hearing_ordinal_key'),
         ('public','hearing_attendees_source_span_id_key'),
         ('quarantine','hearing_transform_src_record_key_key')
       ) ORDER BY name`);
  const requiredIndexes = new Map([
    [
      'hearings_legacy_source_record_key_key',
      'CREATE UNIQUE INDEX hearings_legacy_source_record_key_key ON public.hearings USING btree (legacy_source_record_key)',
    ],
    [
      'hearings_destination_id_idx',
      'CREATE INDEX hearings_destination_id_idx ON public.hearings USING btree (destination_id)',
    ],
    [
      'hearing_attendees_hearing_ordinal_key',
      'CREATE UNIQUE INDEX hearing_attendees_hearing_ordinal_key ON public.hearing_attendees USING btree (hearing_id, ordinal)',
    ],
    [
      'hearing_attendees_source_span_id_key',
      'CREATE UNIQUE INDEX hearing_attendees_source_span_id_key ON public.hearing_attendees USING btree (source_span_id)',
    ],
    [
      'quarantine.hearing_transform_src_record_key_key',
      'CREATE UNIQUE INDEX hearing_transform_src_record_key_key ON quarantine.hearing_transform USING btree (src_record_key)',
    ],
  ]);
  for (const [name, expected] of requiredIndexes) {
    const actual = indexes.rows.find((row) => row.name === name)?.definition;
    if (actual !== expected) failures.push(`index definition changed: ${name}`);
  }
  if (indexes.rows.length !== requiredIndexes.size) failures.push('hearing index set changed');

  const crossSchemaForeignKeys = await db.query<{ count: string }>(`
    SELECT count(*)::text count
      FROM pg_constraint
     WHERE conrelid='public.hearing_attendees'::regclass
       AND contype='f'
       AND confrelid IN (
         '_migration.attendee_source_cell'::regclass,
         '_migration.attendee_source_span'::regclass
       )`);
  if (crossSchemaForeignKeys.rows[0]?.count !== '0') {
    failures.push('Prisma-incompatible cross-schema attendee foreign key returned');
  }

  const triggers = await db.query<CatalogRow>(`
    SELECT tgname name, tgenabled::text enabled, pg_get_triggerdef(oid) definition
      FROM pg_trigger
     WHERE tgrelid='quarantine.hearing_transform'::regclass
       AND NOT tgisinternal
     ORDER BY tgname`);
  const expectedTriggers = new Map([
    [
      'hearing_transform_immutable',
      'BEFORE UPDATE ON quarantine.hearing_transform FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_hearing_transform_change()',
    ],
    [
      'hearing_transform_no_erasure',
      'BEFORE DELETE OR TRUNCATE ON quarantine.hearing_transform FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_hearing_transform_erasure()',
    ],
  ]);
  for (const [name, definition] of expectedTriggers) {
    const row = triggers.rows.find((item) => item.name === name);
    if (row?.enabled !== 'O' || row.definition !== `CREATE TRIGGER ${name} ${definition}`) {
      failures.push(`trigger definition changed: ${name}`);
    }
  }
  if (triggers.rows.length !== 2) failures.push('hearing quarantine trigger set changed');

  const functions = await db.query<{ name: string; source: string; return_type: string }>(`
    SELECT p.proname name, p.prosrc source, p.prorettype::regtype::text return_type
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='quarantine'
       AND p.proname IN (
         'refuse_hearing_transform_change','refuse_hearing_transform_erasure'
       ) ORDER BY p.proname`);
  const expectedFunctionText = new Map([
    [
      'refuse_hearing_transform_change',
      `BEGIN
    RAISE EXCEPTION 'hearing transform quarantine is immutable migration evidence; UPDATE is refused';
END;`,
    ],
    [
      'refuse_hearing_transform_erasure',
      `BEGIN
    RAISE EXCEPTION 'hearing transform quarantine is immutable migration evidence; DELETE/TRUNCATE is refused';
END;`,
    ],
  ]);
  for (const [name, expected] of expectedFunctionText) {
    const row = functions.rows.find((item) => item.name === name);
    if (row?.return_type !== 'trigger' || row.source.trim() !== expected) {
      failures.push(`function definition changed: ${name}`);
    }
  }
  if (functions.rows.length !== 2) failures.push('hearing quarantine function set changed');

  const attendeeTrigger = await db.query<CatalogRow>(`
    SELECT tgname name, tgenabled::text enabled, pg_get_triggerdef(oid) definition
      FROM pg_trigger
     WHERE tgrelid='public.hearing_attendees'::regclass
       AND tgname='hearing_attendee_audit_reference'
       AND NOT tgisinternal`);
  const expectedAttendeeTrigger =
    'CREATE TRIGGER hearing_attendee_audit_reference BEFORE INSERT OR UPDATE ON public.hearing_attendees FOR EACH ROW EXECUTE FUNCTION validate_hearing_attendee_audit_reference()';
  if (
    attendeeTrigger.rows.length !== 1 ||
    attendeeTrigger.rows[0]?.enabled !== 'O' ||
    attendeeTrigger.rows[0]?.definition !== expectedAttendeeTrigger
  ) {
    failures.push('attendee audit-reference trigger definition changed');
  }

  const attendeeFunction = await db.query<{ source: string; return_type: string }>(`
    SELECT p.prosrc source, p.prorettype::regtype::text return_type
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname='validate_hearing_attendee_audit_reference'`);
  const expectedAttendeeFunction = `BEGIN
    IF NEW.legacy_source_record_key IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM hearings hearing
          JOIN _migration.attendee_source_cell cell
            ON cell.cell_id = NEW.source_cell_id
          JOIN _migration.attendee_source_span span
            ON span.fragment_id = NEW.source_span_id
           AND span.cell_id = cell.cell_id
         WHERE hearing.id = NEW.hearing_id
           AND hearing.legacy_source_record_key = NEW.legacy_source_record_key
           AND hearing.legacy_source_extraction_sha256 =
               NEW.legacy_source_extraction_sha256
           AND cell.src_record_key = NEW.legacy_source_record_key
           AND cell.extraction_sha256 = NEW.legacy_source_extraction_sha256
           AND cell.source_column = NEW.source_column
           AND cell.source_column_ordinal = NEW.source_column_ordinal
           AND cell.original_cell = NEW.legacy_name_raw
           AND span.src_record_key = NEW.legacy_source_record_key
           AND span.extraction_sha256 = NEW.legacy_source_extraction_sha256
           AND span.source_column = NEW.source_column
           AND span.sequence = NEW.source_span_sequence
           AND span.kind = 'person'
           AND span.person_id = NEW.person_id
    ) THEN
        RAISE EXCEPTION 'hearing attendee provenance does not match one proved Correction B person span';
    END IF;
    RETURN NEW;
END;`;
  if (
    attendeeFunction.rows.length !== 1 ||
    attendeeFunction.rows[0]?.return_type !== 'trigger' ||
    attendeeFunction.rows[0]?.source.trim() !== expectedAttendeeFunction
  ) {
    failures.push('attendee audit-reference function definition changed');
  }
  return failures;
}
