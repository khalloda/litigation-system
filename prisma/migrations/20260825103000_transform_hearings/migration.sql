-- ===========================================================================
--  TASK 2.8 — DURABLE HEARING / ATTENDEE TRANSFORM PROVENANCE
--
--  The transform itself is a separately invoked serializable transaction.
--  This migration adds the application-visible source fields and permanent
--  evidence safeguards that Prisma cannot express.
-- ===========================================================================

BEGIN;

ALTER TABLE hearings
    ADD COLUMN report boolean,
    ADD COLUMN previous_decision text,
    ADD COLUMN next_attendance_raw text,
    ADD COLUMN destination_id smallint,
    ADD COLUMN legacy_destination_raw text,
    ADD COLUMN legacy_circuit_raw text,
    ADD COLUMN notes text,
    ADD COLUMN legacy_notes_raw text,
    ADD COLUMN short_decision text,
    ADD COLUMN legacy_source_record_key text,
    ADD COLUMN legacy_source_extraction_sha256 text,
    ADD COLUMN legacy_source_payload jsonb;

ALTER TABLE hearings
    ADD CONSTRAINT hearings_destination_id_fkey
        FOREIGN KEY (destination_id) REFERENCES lookup_matter_destination(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    ADD CONSTRAINT hearings_source_identity_shape CHECK (
        (legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND legacy_source_payload IS NULL)
        OR
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND jsonb_typeof(legacy_source_payload) = 'object')
    );

CREATE UNIQUE INDEX hearings_legacy_source_record_key_key
    ON hearings (legacy_source_record_key);
CREATE INDEX hearings_destination_id_idx ON hearings (destination_id);

ALTER TABLE hearing_attendees
    ADD COLUMN legacy_source_record_key text,
    ADD COLUMN legacy_source_extraction_sha256 text,
    ADD COLUMN source_column text,
    ADD COLUMN source_column_ordinal smallint,
    ADD COLUMN source_cell_id text,
    ADD COLUMN source_span_id text,
    ADD COLUMN source_span_sequence integer;

ALTER TABLE hearing_attendees
    ADD CONSTRAINT hearing_attendees_source_identity_shape CHECK (
        (legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND source_column IS NULL
         AND source_column_ordinal IS NULL
         AND source_cell_id IS NULL
         AND source_span_id IS NULL
         AND source_span_sequence IS NULL)
        OR
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND source_column IS NOT NULL
         AND source_column_ordinal BETWEEN 1 AND 5
         AND source_cell_id ~ '^[0-9a-f]{64}$'
         AND source_span_id ~ '^[0-9a-f]{64}$'
         AND source_span_sequence > 0
         AND legacy_name_raw IS NOT NULL
         AND person_id IS NOT NULL
         AND ordinal > 0)
    ),
    ADD CONSTRAINT hearing_attendees_source_cell_id_fkey
        FOREIGN KEY (source_cell_id)
        REFERENCES _migration.attendee_source_cell(cell_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT hearing_attendees_source_span_id_fkey
        FOREIGN KEY (source_span_id)
        REFERENCES _migration.attendee_source_span(fragment_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT hearing_attendees_hearing_ordinal_key
        UNIQUE (hearing_id, ordinal),
    ADD CONSTRAINT hearing_attendees_source_span_id_key
        UNIQUE (source_span_id);

CREATE TABLE quarantine.hearing_transform (
    id                  bigserial   PRIMARY KEY,
    src_record_key      text        NOT NULL UNIQUE,
    extraction_sha256   text        NOT NULL,
    src_file            text        NOT NULL,
    src_row_num         integer     NOT NULL,
    legacy_hearing_id   text,
    reason_codes        text[]      NOT NULL,
    reason_details      jsonb       NOT NULL,
    source_payload      jsonb       NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT hearing_transform_evidence_shape CHECK (
        src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND extraction_sha256 ~ '^[0-9A-F]{64}$'
        AND src_row_num > 0
        AND cardinality(reason_codes) > 0
        AND jsonb_typeof(reason_details) = 'array'
        AND jsonb_array_length(reason_details) = cardinality(reason_codes)
        AND jsonb_typeof(source_payload) = 'object'
    )
);

COMMENT ON TABLE quarantine.hearing_transform IS
    'Immutable Task 2.8 evidence: every staged hearing that cannot safely become a target row.';
COMMENT ON COLUMN hearings.legacy_source_payload IS
    'All 21 Access hearing columns, byte-exact with JSON null distinct from empty text.';
COMMENT ON COLUMN hearing_attendees.legacy_name_raw IS
    'The complete original attendee source cell, not merely the resolved person span.';

CREATE OR REPLACE FUNCTION quarantine.refuse_hearing_transform_change()
RETURNS trigger
LANGUAGE plpgsql
AS $FUNCTION$
BEGIN
    RAISE EXCEPTION 'hearing transform quarantine is immutable migration evidence; UPDATE is refused';
END;
$FUNCTION$;

CREATE OR REPLACE FUNCTION quarantine.refuse_hearing_transform_erasure()
RETURNS trigger
LANGUAGE plpgsql
AS $FUNCTION$
BEGIN
    RAISE EXCEPTION 'hearing transform quarantine is immutable migration evidence; DELETE/TRUNCATE is refused';
END;
$FUNCTION$;

CREATE TRIGGER hearing_transform_immutable
BEFORE UPDATE ON quarantine.hearing_transform
FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_hearing_transform_change();

CREATE TRIGGER hearing_transform_no_erasure
BEFORE DELETE OR TRUNCATE ON quarantine.hearing_transform
FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_hearing_transform_erasure();

DO $POSTCONDITIONS$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hearings'
       AND column_name IN (
         'report','previous_decision','next_attendance_raw','destination_id',
         'legacy_destination_raw','legacy_circuit_raw','notes','legacy_notes_raw',
         'short_decision','legacy_source_record_key',
         'legacy_source_extraction_sha256','legacy_source_payload'
       );
    IF n <> 12 THEN RAISE EXCEPTION 'hearing transform columns: % of 12', n; END IF;

    SELECT count(*) INTO n
      FROM pg_trigger
     WHERE tgrelid = 'quarantine.hearing_transform'::regclass
       AND NOT tgisinternal AND tgenabled = 'O'
       AND tgname IN ('hearing_transform_immutable','hearing_transform_no_erasure');
    IF n <> 2 THEN RAISE EXCEPTION 'hearing quarantine triggers: % of 2', n; END IF;
END
$POSTCONDITIONS$;

COMMIT;
