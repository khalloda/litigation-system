import type { Client } from 'pg';

export type AttendeeAuditReconciliation = Readonly<{
  sourceCells: number;
  auditCells: number;
  spans: number;
  personSpans: number;
  ambiguousSpans: number;
  quarantineRows: number;
  distinctPeople: number;
  defects: readonly string[];
}>;

async function count(db: Client, sql: string): Promise<number> {
  const result = await db.query<{ count: string }>(sql);
  return Number(result.rows[0]?.count ?? Number.NaN);
}

function add(defects: string[], label: string, value: number): void {
  if (value !== 0) defects.push(`${label}: ${String(value)}`);
}

const SOURCE_CELLS = `
  SELECT h.src_record_key,
         h.src_extraction_sha256 extraction_sha256,
         h.src_file,
         h.src_row_num,
         v.source_column,
         v.source_column_ordinal,
         v.original_cell,
         r.id review_value_id,
         _migration.attendee_cell_id('الجلسات', h.src_record_key, v.source_column) cell_id,
         _migration.attendee_cell_content_sha256(v.original_cell) original_cell_sha256
    FROM staging."الجلسات" h
    CROSS JOIN LATERAL (VALUES
      ('الحاضر', 1::smallint, h."الحاضر"),
      ('حاضر 1', 2::smallint, h."حاضر 1"),
      ('حاضر 2', 3::smallint, h."حاضر 2"),
      ('حاضر 3', 4::smallint, h."حاضر 3"),
      ('حاضر 4', 5::smallint, h."حاضر 4")
    ) v(source_column, source_column_ordinal, original_cell)
    LEFT JOIN quarantine.review_value r
      ON r.topic = 'attendee_name' AND r.value = btrim(v.original_cell)
   WHERE v.original_cell IS NOT NULL AND v.original_cell <> ''`;

export async function reconcileAttendeeAudit(db: Client): Promise<AttendeeAuditReconciliation> {
  const defects: string[] = [];
  const totals = await db.query<{
    source_cells: string;
    audit_cells: string;
    spans: string;
    person_spans: string;
    ambiguous_spans: string;
    quarantine_rows: string;
    distinct_people: string;
  }>(`
    SELECT
      (SELECT count(*)::text FROM (${SOURCE_CELLS}) source) source_cells,
      (SELECT count(*)::text FROM _migration.attendee_source_cell) audit_cells,
      (SELECT count(*)::text FROM _migration.attendee_source_span) spans,
      (SELECT count(*)::text FROM _migration.attendee_source_span WHERE kind='person') person_spans,
      (SELECT count(*)::text FROM _migration.attendee_source_span WHERE kind='ambiguous') ambiguous_spans,
      (SELECT count(*)::text FROM quarantine.attendee_span) quarantine_rows,
      (SELECT count(DISTINCT person_id)::text FROM _migration.attendee_source_span
        WHERE person_id IS NOT NULL) distinct_people`);
  const total = totals.rows[0]!;

  add(
    defects,
    'source attendee cells missing, extra or changed in the immutable audit',
    await count(
      db,
      `WITH expected AS (${SOURCE_CELLS})
       SELECT count(*)
         FROM expected e
         FULL JOIN _migration.attendee_source_cell c USING (cell_id)
        WHERE e.cell_id IS NULL OR c.cell_id IS NULL
           OR (c.source_table, c.src_record_key, c.extraction_sha256,
               c.source_column, c.source_column_ordinal, c.src_file,
               c.src_row_num, c.original_cell, c.original_cell_sha256,
               c.decomposition_version, c.review_value_id)
              IS DISTINCT FROM
              ('الجلسات', e.src_record_key, e.extraction_sha256,
               e.source_column, e.source_column_ordinal, e.src_file,
               e.src_row_num, e.original_cell, e.original_cell_sha256,
               1::smallint, e.review_value_id)`,
    ),
  );

  add(
    defects,
    'audit spans with wrong durable identity or copied source evidence',
    await count(
      db,
      `SELECT count(*)
         FROM _migration.attendee_source_span s
         LEFT JOIN _migration.attendee_source_cell c ON c.cell_id=s.cell_id
        WHERE c.cell_id IS NULL
           OR (s.source_table, s.src_record_key, s.extraction_sha256,
               s.source_column, s.original_cell_sha256)
              IS DISTINCT FROM
              (c.source_table, c.src_record_key, c.extraction_sha256,
               c.source_column, c.original_cell_sha256)
           OR s.fragment_id <> _migration.attendee_fragment_id(
                s.cell_id, s.start_offset, s.end_offset, s.raw
              )`,
    ),
  );

  add(
    defects,
    'audit cells whose ordered spans do not reconstruct exactly',
    await count(
      db,
      `SELECT count(*)
         FROM _migration.attendee_source_cell c
         LEFT JOIN LATERAL (
           SELECT string_agg(s.raw, '' ORDER BY s.sequence) reconstructed,
                  count(*) span_count,
                  count(DISTINCT s.sequence) distinct_sequences,
                  min(s.sequence) min_sequence,
                  max(s.sequence) max_sequence,
                  min(s.start_offset) min_offset,
                  max(s.end_offset) max_offset
             FROM _migration.attendee_source_span s WHERE s.cell_id=c.cell_id
         ) spans ON true
        WHERE spans.span_count = 0
           OR spans.reconstructed IS DISTINCT FROM c.original_cell
           OR spans.distinct_sequences <> spans.span_count
           OR spans.min_sequence <> 1 OR spans.max_sequence <> spans.span_count
           OR spans.min_offset <> 0 OR spans.max_offset <> char_length(c.original_cell)`,
    ),
  );

  add(
    defects,
    'audit spans with a gap, overlap, changed raw slice or wrong line number',
    await count(
      db,
      `WITH ordered AS (
         SELECT s.*, c.original_cell,
                lag(s.end_offset, 1, 0) OVER (
                  PARTITION BY s.cell_id ORDER BY s.sequence
                ) expected_start
           FROM _migration.attendee_source_span s
           JOIN _migration.attendee_source_cell c ON c.cell_id=s.cell_id
       )
       SELECT count(*) FROM ordered
        WHERE start_offset <> expected_start
           OR substring(original_cell FROM start_offset + 1 FOR end_offset-start_offset) <> raw
           OR line <> 1 + regexp_count(left(original_cell, start_offset), E'\\r\\n|\\r|\\n')`,
    ),
  );

  add(
    defects,
    'person spans that do not resolve through exactly one exact alias',
    await count(
      db,
      `SELECT count(*)
         FROM _migration.attendee_source_span s
        WHERE s.kind='person'
          AND 1 <> (SELECT count(*) FROM person_name_alias a
                     WHERE a.alias_ar=s.raw AND a.person_id=s.person_id)`,
    ),
  );

  add(
    defects,
    'non-person spans carrying a person or person spans without one',
    await count(
      db,
      `SELECT count(*) FROM _migration.attendee_source_span
        WHERE (kind='person') IS DISTINCT FROM (person_id IS NOT NULL)
           OR (kind IN ('date','title','role','placeholder','note','ambiguous','separator')
               AND person_id IS NOT NULL)
           OR (raw='**' AND person_id IS NOT NULL)`,
    ),
  );

  add(
    defects,
    'ambiguous spans missing or differing from immutable quarantine evidence',
    await count(
      db,
      `SELECT count(*)
         FROM _migration.attendee_source_span s
         JOIN _migration.attendee_source_cell c ON c.cell_id=s.cell_id
         FULL JOIN quarantine.attendee_span q ON q.fragment_id=s.fragment_id
        WHERE (s.kind='ambiguous') IS DISTINCT FROM (q.fragment_id IS NOT NULL)
           OR (s.kind='ambiguous' AND (
             (q.cell_id, q.source_table, q.src_record_key, q.extraction_sha256,
              q.source_column, q.original_cell_sha256, q.src_file, q.src_row_num,
              q.sequence, q.start_offset, q.end_offset, q.raw,
              q.classification_rule, q.reason_code, q.reason_detail)
             IS DISTINCT FROM
             (s.cell_id, s.source_table, s.src_record_key, s.extraction_sha256,
              s.source_column, s.original_cell_sha256, c.src_file, c.src_row_num,
              s.sequence, s.start_offset, s.end_offset, s.raw,
              'unclassified_review', 'ambiguous_attendee_fragment',
              jsonb_build_object(
                'kind', 'ambiguous', 'raw', s.raw,
                'rule', 'unclassified_review'
              ))
           ))`,
    ),
  );

  add(
    defects,
    'attendee review values no longer covering their recorded occurrence count',
    await count(
      db,
      `WITH actual AS (
         SELECT c.review_value_id id, count(*) occurrences
           FROM _migration.attendee_source_cell c
          WHERE c.review_value_id IS NOT NULL GROUP BY c.review_value_id
       )
       SELECT count(*)
         FROM quarantine.review_value r
         FULL JOIN actual a ON a.id=r.id
        WHERE r.topic='attendee_name'
          AND (a.id IS NULL OR a.occurrences <> r.occurrences)
           OR (a.id IS NOT NULL AND r.id IS NULL)`,
    ),
  );

  add(
    defects,
    'reviewed not-a-name cells that produced a person',
    await count(
      db,
      `SELECT count(*)
         FROM _migration.attendee_source_cell c
         JOIN quarantine.review_value r ON r.id=c.review_value_id
        WHERE r.firm_answer='not a name'
          AND EXISTS (SELECT 1 FROM _migration.attendee_source_span s
                       WHERE s.cell_id=c.cell_id AND s.person_id IS NOT NULL)`,
    ),
  );

  add(
    defects,
    'reviewed person/split cells whose ordered people differ from the firm answer',
    await count(
      db,
      `SELECT count(*)
         FROM _migration.attendee_source_cell c
         JOIN quarantine.review_value r ON r.id=c.review_value_id
         LEFT JOIN LATERAL (
           SELECT array_agg(resolved.person_id ORDER BY resolved.ordinal) expected
             FROM (
               SELECT names.ordinal, min(a.person_id) person_id,
                      count(*) alias_count
                 FROM regexp_split_to_table(r.firm_person, ' [+] ')
                        WITH ORDINALITY names(name, ordinal)
                 LEFT JOIN person_name_alias a ON a.alias_ar=names.name
                GROUP BY names.ordinal
               HAVING count(*)=1
             ) resolved
         ) expected ON true
         LEFT JOIN LATERAL (
           SELECT array_agg(actual.person_id ORDER BY actual.first_sequence) actual
             FROM (
               SELECT s.person_id, min(s.sequence) first_sequence
                 FROM _migration.attendee_source_span s
                WHERE s.cell_id=c.cell_id AND s.person_id IS NOT NULL
                GROUP BY s.person_id
             ) actual
         ) actual ON true
        WHERE r.firm_answer IN ('person','split')
          AND expected.expected IS DISTINCT FROM actual.actual`,
    ),
  );

  add(
    defects,
    'unreviewed cells that are not exactly one exact person alias',
    await count(
      db,
      `SELECT count(*)
         FROM _migration.attendee_source_cell c
        WHERE c.review_value_id IS NULL
          AND (
            1 <> (SELECT count(*) FROM person_name_alias a
                   WHERE a.alias_ar=c.original_cell)
            OR 1 <> (SELECT count(*) FROM _migration.attendee_source_span s
                      WHERE s.cell_id=c.cell_id AND s.kind='person'
                        AND s.raw=c.original_cell)
          )`,
    ),
  );

  return Object.freeze({
    sourceCells: Number(total.source_cells),
    auditCells: Number(total.audit_cells),
    spans: Number(total.spans),
    personSpans: Number(total.person_spans),
    ambiguousSpans: Number(total.ambiguous_spans),
    quarantineRows: Number(total.quarantine_rows),
    distinctPeople: Number(total.distinct_people),
    defects: Object.freeze(defects),
  });
}

export async function attendeeAuditResultDigest(db: Client): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(string_agg(payload, E'\\n' ORDER BY kind, identity), 'UTF8')), 'hex') digest
      FROM (
        SELECT 'C' kind, cell_id identity,
               (to_jsonb(c) - ARRAY['src_file','src_row_num','created_at'])::text payload
          FROM _migration.attendee_source_cell c
        UNION ALL
        SELECT 'S', fragment_id,
               (to_jsonb(s) - 'created_at')::text
          FROM _migration.attendee_source_span s
        UNION ALL
        SELECT 'Q', fragment_id,
               (to_jsonb(q) - ARRAY['src_file','src_row_num','created_at'])::text
          FROM quarantine.attendee_span q
      ) stable`);
  return result.rows[0]?.digest ?? '';
}

type CatalogRow = { name: string; enabled?: string; definition: string };

export async function attendeeAuditStructureFailures(db: Client): Promise<string[]> {
  const failures: string[] = [];
  const expectedConstraints = new Set([
    'attendee_source_cell_pkey',
    'attendee_source_cell_durable_key',
    'attendee_source_cell_identity_shape',
    'attendee_source_cell_column',
    'attendee_source_cell_id_matches',
    'attendee_source_cell_content_matches',
    'attendee_source_cell_review_value_id_fkey',
    'attendee_source_span_pkey',
    'attendee_source_span_sequence',
    'attendee_source_span_offsets',
    'attendee_source_span_identity_shape',
    'attendee_source_span_fragment_id_matches',
    'attendee_source_span_classification',
    'attendee_source_span_cell_id_fkey',
    'attendee_source_span_person_id_fkey',
    'attendee_span_pkey',
    'attendee_span_fragment_id_fkey',
    'attendee_span_cell_fk',
    'attendee_span_reason',
  ]);
  const constraints = await db.query<CatalogRow>(`
    SELECT conname name, pg_get_constraintdef(oid) definition
      FROM pg_constraint
     WHERE conrelid IN (
       '_migration.attendee_source_cell'::regclass,
       '_migration.attendee_source_span'::regclass,
       'quarantine.attendee_span'::regclass
     ) ORDER BY conname`);
  const names = new Set(constraints.rows.map((row) => row.name));
  for (const name of expectedConstraints) {
    if (!names.has(name)) failures.push(`constraint definition missing: ${name}`);
  }
  if (names.size !== expectedConstraints.size)
    failures.push('attendee audit constraint set changed');
  const criticalConstraintText = new Map([
    ['attendee_source_cell_id_matches', '_migration.attendee_cell_id'],
    ['attendee_source_cell_content_matches', '_migration.attendee_cell_content_sha256'],
    ['attendee_source_span_fragment_id_matches', '_migration.attendee_fragment_id'],
    ['attendee_source_span_classification', 'reviewed_person_alias'],
    ['attendee_span_reason', 'ambiguous_attendee_fragment'],
  ]);
  for (const [name, text] of criticalConstraintText) {
    if (!constraints.rows.find((row) => row.name === name)?.definition.includes(text)) {
      failures.push(`constraint definition changed: ${name}`);
    }
  }
  const foreignKeyRequirements = new Map([
    [
      'attendee_source_cell_review_value_id_fkey',
      'FOREIGN KEY (review_value_id) REFERENCES quarantine.review_value(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    ],
    [
      'attendee_source_span_cell_id_fkey',
      'FOREIGN KEY (cell_id) REFERENCES _migration.attendee_source_cell(cell_id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    ],
    [
      'attendee_source_span_person_id_fkey',
      'FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    ],
    [
      'attendee_span_fragment_id_fkey',
      'FOREIGN KEY (fragment_id) REFERENCES _migration.attendee_source_span(fragment_id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    ],
    [
      'attendee_span_cell_fk',
      'FOREIGN KEY (cell_id) REFERENCES _migration.attendee_source_cell(cell_id) ON UPDATE RESTRICT ON DELETE RESTRICT',
    ],
  ]);
  for (const [name, definition] of foreignKeyRequirements) {
    if (constraints.rows.find((row) => row.name === name)?.definition !== definition) {
      failures.push(`foreign key definition changed: ${name}`);
    }
  }

  const indexes = await db.query<CatalogRow>(`
    SELECT indexrelid::regclass::text name, pg_get_indexdef(indexrelid) definition
      FROM pg_index
     WHERE indexrelid IN (
       '_migration.attendee_source_cell_pkey'::regclass,
       '_migration.attendee_source_cell_durable_key'::regclass,
       '_migration.attendee_source_span_pkey'::regclass,
       '_migration.attendee_source_span_sequence'::regclass,
       '_migration.attendee_source_span_offsets'::regclass,
       '_migration.attendee_source_span_person_id'::regclass,
       'quarantine.attendee_span_pkey'::regclass
     ) ORDER BY indexrelid::regclass::text`);
  if (indexes.rows.length !== 7)
    failures.push(`unique/index definitions: ${indexes.rows.length} of 7`);
  const indexRequirements = [
    ['attendee_source_cell_durable_key', '(source_table, src_record_key, source_column)'],
    ['attendee_source_span_sequence', '(cell_id, sequence)'],
    ['attendee_source_span_offsets', '(cell_id, start_offset, end_offset)'],
    ['attendee_source_span_person_id', '(person_id) WHERE (person_id IS NOT NULL)'],
  ] as const;
  for (const [name, columns] of indexRequirements) {
    const row = indexes.rows.find((candidate) => candidate.name.endsWith(name));
    if (!row?.definition.includes(columns)) failures.push(`index definition changed: ${name}`);
  }

  const triggers = await db.query<CatalogRow>(`
    SELECT tgname name, tgenabled::text enabled, pg_get_triggerdef(oid) definition
      FROM pg_trigger
     WHERE NOT tgisinternal AND tgname IN (
       'attendee_source_cell_immutable','attendee_source_cell_no_erasure',
       'attendee_source_span_immutable','attendee_source_span_no_erasure',
       'attendee_span_immutable','attendee_span_no_erasure'
     ) ORDER BY tgname`);
  if (triggers.rows.length !== 6)
    failures.push(`audit protection triggers: ${triggers.rows.length} of 6`);
  for (const row of triggers.rows) {
    if (row.enabled !== 'O') failures.push(`trigger disabled: ${row.name}`);
    if (row.name.endsWith('_immutable')) {
      if (!row.definition.includes('BEFORE UPDATE') || !row.definition.includes('FOR EACH ROW')) {
        failures.push(`trigger definition changed: ${row.name}`);
      }
    } else if (
      !row.definition.includes('BEFORE DELETE OR TRUNCATE') ||
      !row.definition.includes('FOR EACH STATEMENT')
    ) {
      failures.push(`trigger definition changed: ${row.name}`);
    }
  }

  const functions = await db.query<CatalogRow>(`
    SELECT p.oid::regprocedure::text name, pg_get_functiondef(p.oid) definition
      FROM pg_proc p
     WHERE p.oid IN (
       '_migration.attendee_cell_id(text,text,text)'::regprocedure,
       '_migration.attendee_cell_content_sha256(text)'::regprocedure,
       '_migration.attendee_fragment_id(text,integer,integer,text)'::regprocedure,
       '_migration.refuse_attendee_audit_row_change()'::regprocedure,
       '_migration.refuse_attendee_audit_erasure()'::regprocedure
     ) ORDER BY p.oid::regprocedure::text`);
  if (functions.rows.length !== 5)
    failures.push(`audit function definitions: ${functions.rows.length} of 5`);
  const functionRequirements = [
    ['attendee_cell_id', 'attendee-cell-v1'],
    ['attendee_cell_content_sha256', 'attendee-cell-content-v1'],
    ['attendee_fragment_id', 'attendee-fragment-v1'],
    ['refuse_attendee_audit_row_change', "TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME"],
    ['refuse_attendee_audit_erasure', 'DELETE/TRUNCATE is refused'],
  ] as const;
  for (const [name, text] of functionRequirements) {
    const row = functions.rows.find((candidate) => candidate.name.includes(name));
    if (!row?.definition.includes(text)) failures.push(`function definition changed: ${name}`);
  }
  return failures;
}
