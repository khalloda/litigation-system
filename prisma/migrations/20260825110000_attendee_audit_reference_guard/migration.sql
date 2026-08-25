-- Prisma cannot introspect a public application table that has a foreign key
-- into the migration-only _migration schema unless that private schema is
-- exposed in the application datamodel. Keep the audit private and replace
-- the two cross-schema FKs with a stricter immediate provenance trigger.

BEGIN;

ALTER TABLE hearing_attendees
    DROP CONSTRAINT hearing_attendees_source_cell_id_fkey,
    DROP CONSTRAINT hearing_attendees_source_span_id_fkey;

CREATE OR REPLACE FUNCTION public.validate_hearing_attendee_audit_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $FUNCTION$
BEGIN
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
END;
$FUNCTION$;

CREATE TRIGGER hearing_attendee_audit_reference
BEFORE INSERT OR UPDATE ON hearing_attendees
FOR EACH ROW EXECUTE FUNCTION public.validate_hearing_attendee_audit_reference();

DO $POSTCONDITIONS$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n
      FROM pg_constraint
     WHERE conrelid = 'public.hearing_attendees'::regclass
       AND confrelid IN (
         '_migration.attendee_source_cell'::regclass,
         '_migration.attendee_source_span'::regclass
       );
    IF n <> 0 THEN RAISE EXCEPTION 'cross-schema attendee FKs remain: %', n; END IF;

    SELECT count(*) INTO n
      FROM pg_trigger
     WHERE tgrelid = 'public.hearing_attendees'::regclass
       AND tgname = 'hearing_attendee_audit_reference'
       AND NOT tgisinternal AND tgenabled = 'O';
    IF n <> 1 THEN RAISE EXCEPTION 'attendee audit reference trigger: % of 1', n; END IF;
END
$POSTCONDITIONS$;

COMMIT;
