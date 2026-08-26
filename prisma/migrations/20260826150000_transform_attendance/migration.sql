BEGIN;

-- Task 2.10B: durable source identity, complete source payload and immutable
-- target-or-quarantine evidence for the staff leave/location register. The
-- migration is additive and writes no Attendance source or target row.

DO $PRECONDITION$
BEGIN
    IF (SELECT count(*) FROM public.attendance) <> 0 THEN
        RAISE EXCEPTION 'Task 2.10B schema migration requires an empty attendance target';
    END IF;
END
$PRECONDITION$;

ALTER TABLE public.attendance
    ADD COLUMN legacy_source_record_key text,
    ADD COLUMN legacy_source_extraction_sha256 text,
    ADD COLUMN legacy_source_payload jsonb,
    ADD CONSTRAINT attendance_source_identity_shape CHECK ((
        (legacy_id IS NULL
         AND legacy_person_raw IS NULL
         AND legacy_situation_raw IS NULL
         AND legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND legacy_source_payload IS NULL)
        OR
        (legacy_source_record_key IS NOT NULL
         AND legacy_source_extraction_sha256 IS NOT NULL
         AND legacy_source_payload IS NOT NULL
         AND legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND jsonb_typeof(legacy_source_payload)='object'
         AND legacy_id IS NOT NULL
         AND person_id IS NOT NULL
         AND legacy_person_raw IS NOT NULL
         AND attendance_date IS NOT NULL
         AND situation IS NOT DISTINCT FROM legacy_situation_raw)
    ) IS TRUE);

CREATE UNIQUE INDEX attendance_legacy_source_record_key_key
    ON public.attendance(legacy_source_record_key);

CREATE TABLE quarantine.attendance_transform (
    src_record_key text PRIMARY KEY,
    extraction_sha256 text NOT NULL,
    src_file text NOT NULL,
    src_row_num integer NOT NULL,
    legacy_attendance_id_raw text,
    reason_codes text[] NOT NULL,
    reason_details jsonb NOT NULL,
    source_payload jsonb NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT current_timestamp,
    CONSTRAINT attendance_transform_identity_shape CHECK (
        src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND extraction_sha256 ~ '^[0-9A-F]{64}$'),
    CONSTRAINT attendance_transform_reason_shape CHECK (
        cardinality(reason_codes)>0
        AND jsonb_typeof(reason_details)='array'
        AND jsonb_array_length(reason_details)=cardinality(reason_codes)
        AND jsonb_typeof(source_payload)='object')
);

CREATE OR REPLACE FUNCTION public.refuse_legacy_attendance_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $ATTENDANCE_HISTORY$
BEGIN
    IF TG_OP='TRUNCATE' THEN
        RAISE EXCEPTION 'Task 2.10B attendance TRUNCATE is refused';
    END IF;
    IF TG_OP='DELETE' THEN
        IF OLD.legacy_source_record_key IS NOT NULL THEN
            RAISE EXCEPTION 'Task 2.10B migrated attendance history cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.legacy_source_record_key IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10B migrated attendance history cannot be updated';
    END IF;
    IF NEW.legacy_id IS NOT NULL
       OR NEW.legacy_person_raw IS NOT NULL
       OR NEW.legacy_situation_raw IS NOT NULL
       OR NEW.legacy_source_record_key IS NOT NULL
       OR NEW.legacy_source_extraction_sha256 IS NOT NULL
       OR NEW.legacy_source_payload IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10B migration provenance cannot be attached by ordinary update';
    END IF;
    RETURN NEW;
END;
$ATTENDANCE_HISTORY$;

CREATE OR REPLACE FUNCTION quarantine.refuse_attendance_evidence_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $ATTENDANCE_EVIDENCE$
BEGIN
    IF TG_OP='UPDATE' THEN
        RAISE EXCEPTION 'Task 2.10B immutable attendance evidence cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.10B attendance evidence DELETE/TRUNCATE is refused';
END;
$ATTENDANCE_EVIDENCE$;

CREATE TRIGGER attendance_legacy_no_change
    BEFORE UPDATE OR DELETE ON public.attendance
    FOR EACH ROW EXECUTE FUNCTION public.refuse_legacy_attendance_change();
CREATE TRIGGER attendance_no_truncate
    BEFORE TRUNCATE ON public.attendance
    FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_legacy_attendance_change();
CREATE TRIGGER attendance_transform_no_change
    BEFORE UPDATE OR DELETE ON quarantine.attendance_transform
    FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_attendance_evidence_change();
CREATE TRIGGER attendance_transform_no_truncate
    BEFORE TRUNCATE ON quarantine.attendance_transform
    FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_attendance_evidence_change();

COMMIT;
