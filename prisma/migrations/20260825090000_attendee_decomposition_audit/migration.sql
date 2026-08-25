-- ===========================================================================
--  TASK 2.8 CORRECTION B — IMMUTABLE ATTENDEE SOURCE-CELL/SPAN AUDIT
--
--  These migration-only tables preserve every non-empty attendee source cell
--  and every ordered decomposition span before hearings are transformed.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION _migration.attendee_cell_id(
    p_source_table text,
    p_src_record_key text,
    p_source_column text
) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $FUNCTION$
    SELECT encode(sha256(convert_to(
        octet_length('attendee-cell-v1')::text || ':attendee-cell-v1' ||
        octet_length(p_source_table)::text || ':' || p_source_table ||
        octet_length(p_src_record_key)::text || ':' || p_src_record_key ||
        octet_length(p_source_column)::text || ':' || p_source_column,
        'UTF8'
    )), 'hex');
$FUNCTION$;

CREATE OR REPLACE FUNCTION _migration.attendee_cell_content_sha256(p_value text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $FUNCTION$
    SELECT encode(sha256(convert_to(
        octet_length('attendee-cell-content-v1')::text || ':attendee-cell-content-v1' ||
        octet_length(p_value)::text || ':' || p_value,
        'UTF8'
    )), 'hex');
$FUNCTION$;

CREATE OR REPLACE FUNCTION _migration.attendee_fragment_id(
    p_cell_id text,
    p_start_offset integer,
    p_end_offset integer,
    p_raw text
) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $FUNCTION$
    SELECT encode(sha256(convert_to(
        octet_length('attendee-fragment-v1')::text || ':attendee-fragment-v1' ||
        octet_length(p_cell_id)::text || ':' || p_cell_id ||
        octet_length(p_start_offset::text)::text || ':' || p_start_offset::text ||
        octet_length(p_end_offset::text)::text || ':' || p_end_offset::text ||
        octet_length(p_raw)::text || ':' || p_raw,
        'UTF8'
    )), 'hex');
$FUNCTION$;

CREATE TABLE _migration.attendee_source_cell (
    cell_id                 text        PRIMARY KEY,
    source_table            text        NOT NULL,
    src_record_key          text        NOT NULL,
    extraction_sha256       text        NOT NULL,
    source_column           text        NOT NULL,
    source_column_ordinal   smallint    NOT NULL,
    src_file                text        NOT NULL,
    src_row_num             integer     NOT NULL,
    original_cell           text        NOT NULL,
    original_cell_sha256    text        NOT NULL,
    decomposition_version   smallint    NOT NULL,
    review_value_id         bigint      REFERENCES quarantine.review_value(id)
                                      ON DELETE RESTRICT ON UPDATE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT attendee_source_cell_durable_key
        UNIQUE (source_table, src_record_key, source_column),
    CONSTRAINT attendee_source_cell_identity_shape CHECK (
        source_table = 'الجلسات'
        AND src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND extraction_sha256 ~ '^[0-9A-F]{64}$'
        AND cell_id ~ '^[0-9a-f]{64}$'
        AND original_cell_sha256 ~ '^[0-9a-f]{64}$'
        AND src_row_num > 0
        AND original_cell <> ''
        AND decomposition_version = 1
    ),
    CONSTRAINT attendee_source_cell_column CHECK (
        (source_column, source_column_ordinal) IN (
            ('الحاضر', 1), ('حاضر 1', 2), ('حاضر 2', 3),
            ('حاضر 3', 4), ('حاضر 4', 5)
        )
    ),
    CONSTRAINT attendee_source_cell_id_matches CHECK (
        cell_id = _migration.attendee_cell_id(
            source_table, src_record_key, source_column
        )
    ),
    CONSTRAINT attendee_source_cell_content_matches CHECK (
        original_cell_sha256 =
            _migration.attendee_cell_content_sha256(original_cell)
    )
);

CREATE TABLE _migration.attendee_source_span (
    fragment_id             text        PRIMARY KEY,
    cell_id                 text        NOT NULL REFERENCES _migration.attendee_source_cell(cell_id)
                                      ON DELETE RESTRICT ON UPDATE RESTRICT,
    source_table            text        NOT NULL,
    src_record_key          text        NOT NULL,
    extraction_sha256       text        NOT NULL,
    source_column           text        NOT NULL,
    original_cell_sha256    text        NOT NULL,
    sequence                integer     NOT NULL,
    line                    integer     NOT NULL,
    start_offset            integer     NOT NULL,
    end_offset              integer     NOT NULL,
    raw                     text        NOT NULL,
    value                   text        NOT NULL,
    kind                    text        NOT NULL,
    classification_rule     text        NOT NULL,
    review_required         boolean     NOT NULL,
    person_id               integer     REFERENCES people(id)
                                      ON DELETE RESTRICT ON UPDATE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT attendee_source_span_sequence UNIQUE (cell_id, sequence),
    CONSTRAINT attendee_source_span_offsets UNIQUE (cell_id, start_offset, end_offset),
    CONSTRAINT attendee_source_span_identity_shape CHECK (
        fragment_id ~ '^[0-9a-f]{64}$'
        AND src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND extraction_sha256 ~ '^[0-9A-F]{64}$'
        AND original_cell_sha256 ~ '^[0-9a-f]{64}$'
        AND sequence > 0 AND line > 0
        AND start_offset >= 0 AND end_offset > start_offset
        AND raw <> ''
    ),
    CONSTRAINT attendee_source_span_fragment_id_matches CHECK (
        fragment_id = _migration.attendee_fragment_id(
            cell_id, start_offset, end_offset, raw
        )
    ),
    CONSTRAINT attendee_source_span_classification CHECK (
        (kind = 'person'
            AND classification_rule IN ('exact_person_alias', 'reviewed_person_alias')
            AND person_id IS NOT NULL AND review_required = false)
        OR (kind = 'date' AND classification_rule = 'calendar_date'
            AND person_id IS NULL AND review_required = false)
        OR (kind = 'title' AND classification_rule = 'known_title'
            AND person_id IS NULL AND review_required = false)
        OR (kind = 'role'
            AND classification_rule IN ('known_role', 'known_parenthetical_role')
            AND person_id IS NULL AND review_required = false)
        OR (kind = 'placeholder' AND classification_rule = 'known_placeholder'
            AND person_id IS NULL AND review_required = false)
        OR (kind = 'note'
            AND classification_rule IN (
                'known_note', 'known_parenthetical_note', 'reviewed_not_a_name'
            )
            AND person_id IS NULL AND review_required = false)
        OR (kind = 'ambiguous' AND classification_rule = 'unclassified_review'
            AND person_id IS NULL AND review_required = true)
        OR (kind = 'separator'
            AND classification_rule IN (
                'line_break', 'punctuation_separator', 'horizontal_whitespace'
            )
            AND person_id IS NULL AND review_required = false)
    )
);

CREATE INDEX attendee_source_span_person_id
    ON _migration.attendee_source_span(person_id)
    WHERE person_id IS NOT NULL;

CREATE TABLE quarantine.attendee_span (
    fragment_id             text        PRIMARY KEY REFERENCES _migration.attendee_source_span(fragment_id)
                                      ON DELETE RESTRICT ON UPDATE RESTRICT,
    cell_id                 text        NOT NULL,
    source_table            text        NOT NULL,
    src_record_key          text        NOT NULL,
    extraction_sha256       text        NOT NULL,
    source_column           text        NOT NULL,
    original_cell_sha256    text        NOT NULL,
    src_file                text        NOT NULL,
    src_row_num             integer     NOT NULL,
    sequence                integer     NOT NULL,
    start_offset            integer     NOT NULL,
    end_offset              integer     NOT NULL,
    raw                     text        NOT NULL,
    classification_rule     text        NOT NULL,
    reason_code             text        NOT NULL,
    reason_detail           jsonb       NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT attendee_span_cell_fk FOREIGN KEY (cell_id)
        REFERENCES _migration.attendee_source_cell(cell_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT attendee_span_reason CHECK (
        classification_rule = 'unclassified_review'
        AND reason_code = 'ambiguous_attendee_fragment'
        AND jsonb_typeof(reason_detail) = 'object'
    )
);

COMMENT ON TABLE _migration.attendee_source_cell IS
    'Immutable Correction B audit: one exact row per non-empty legacy attendee source cell.';
COMMENT ON TABLE _migration.attendee_source_span IS
    'Immutable Correction B audit: ordered lossless spans for each legacy attendee source cell.';
COMMENT ON TABLE quarantine.attendee_span IS
    'Immutable evidence for every attendee span deliberately left ambiguous; never a guessed person.';

CREATE OR REPLACE FUNCTION _migration.refuse_attendee_audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
AS $FUNCTION$
BEGIN
    RAISE EXCEPTION '% is immutable migration evidence; % is refused',
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP;
END;
$FUNCTION$;

CREATE OR REPLACE FUNCTION _migration.refuse_attendee_audit_erasure()
RETURNS trigger
LANGUAGE plpgsql
AS $FUNCTION$
BEGIN
    RAISE EXCEPTION '% is immutable migration evidence; DELETE/TRUNCATE is refused',
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
END;
$FUNCTION$;

CREATE TRIGGER attendee_source_cell_immutable
BEFORE UPDATE ON _migration.attendee_source_cell
FOR EACH ROW EXECUTE FUNCTION _migration.refuse_attendee_audit_row_change();
CREATE TRIGGER attendee_source_cell_no_erasure
BEFORE DELETE OR TRUNCATE ON _migration.attendee_source_cell
FOR EACH STATEMENT EXECUTE FUNCTION _migration.refuse_attendee_audit_erasure();

CREATE TRIGGER attendee_source_span_immutable
BEFORE UPDATE ON _migration.attendee_source_span
FOR EACH ROW EXECUTE FUNCTION _migration.refuse_attendee_audit_row_change();
CREATE TRIGGER attendee_source_span_no_erasure
BEFORE DELETE OR TRUNCATE ON _migration.attendee_source_span
FOR EACH STATEMENT EXECUTE FUNCTION _migration.refuse_attendee_audit_erasure();

CREATE TRIGGER attendee_span_immutable
BEFORE UPDATE ON quarantine.attendee_span
FOR EACH ROW EXECUTE FUNCTION _migration.refuse_attendee_audit_row_change();
CREATE TRIGGER attendee_span_no_erasure
BEFORE DELETE OR TRUNCATE ON quarantine.attendee_span
FOR EACH STATEMENT EXECUTE FUNCTION _migration.refuse_attendee_audit_erasure();

DO $POSTCONDITIONS$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n
      FROM information_schema.tables
     WHERE (table_schema, table_name) IN (
       ('_migration', 'attendee_source_cell'),
       ('_migration', 'attendee_source_span'),
       ('quarantine', 'attendee_span')
     );
    IF n <> 3 THEN RAISE EXCEPTION 'attendee audit tables: % of 3', n; END IF;

    SELECT count(*) INTO n
      FROM pg_trigger
     WHERE NOT tgisinternal AND tgenabled = 'O'
       AND tgname IN (
         'attendee_source_cell_immutable', 'attendee_source_cell_no_erasure',
         'attendee_source_span_immutable', 'attendee_source_span_no_erasure',
         'attendee_span_immutable', 'attendee_span_no_erasure'
       );
    IF n <> 6 THEN RAISE EXCEPTION 'attendee audit triggers: % of 6', n; END IF;
END
$POSTCONDITIONS$;

COMMIT;
