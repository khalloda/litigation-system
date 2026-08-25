BEGIN;

-- Task 2.9A: durable administrative-work provenance and quarantine.
-- This migration is deliberately schema-only. The serializable TypeScript
-- transform writes data only after its independent dry-run reconciliation.

ALTER TABLE public.admin_tasks
    ALTER COLUMN last_followup TYPE text USING last_followup::text,
    ADD COLUMN legacy_destination_raw text,
    ADD COLUMN legacy_circuit_raw text,
    ADD COLUMN legacy_source_record_key text,
    ADD COLUMN legacy_source_extraction_sha256 text,
    ADD COLUMN legacy_source_payload jsonb;

ALTER TABLE public.admin_tasks
    ADD CONSTRAINT admin_tasks_source_identity_shape CHECK (
        (legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND legacy_source_payload IS NULL)
        OR
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND jsonb_typeof(legacy_source_payload) = 'object'
         AND legacy_id IS NOT NULL)
    );

CREATE UNIQUE INDEX admin_tasks_legacy_source_record_key_key
    ON public.admin_tasks (legacy_source_record_key);

ALTER TABLE public.task_actions
    ADD COLUMN source_ordinal integer,
    ADD COLUMN legacy_source_record_key text,
    ADD COLUMN legacy_source_extraction_sha256 text,
    ADD COLUMN legacy_source_payload jsonb;

ALTER TABLE public.task_actions
    ADD CONSTRAINT task_actions_source_identity_shape CHECK (
        (legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND legacy_source_payload IS NULL
         AND source_ordinal IS NULL)
        OR
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND jsonb_typeof(legacy_source_payload) = 'object'
         AND legacy_id IS NOT NULL
         AND source_ordinal > 0)
    );

CREATE UNIQUE INDEX task_actions_legacy_source_record_key_key
    ON public.task_actions (legacy_source_record_key);

CREATE SCHEMA IF NOT EXISTS quarantine;

CREATE TABLE quarantine.admin_task_transform (
    src_record_key text PRIMARY KEY,
    extraction_sha256 text NOT NULL,
    src_file text NOT NULL,
    src_row_num integer NOT NULL,
    legacy_task_id text,
    reason_codes text[] NOT NULL,
    reason_details jsonb NOT NULL,
    source_payload jsonb NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT current_timestamp,
    CONSTRAINT admin_task_transform_identity_shape CHECK (
        src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND extraction_sha256 ~ '^[0-9A-F]{64}$'
    ),
    CONSTRAINT admin_task_transform_reason_shape CHECK (
        cardinality(reason_codes) > 0
        AND jsonb_typeof(reason_details) = 'array'
        AND jsonb_array_length(reason_details) = cardinality(reason_codes)
        AND jsonb_typeof(source_payload) = 'object'
    )
);

CREATE TABLE quarantine.task_action_transform (
    src_record_key text PRIMARY KEY,
    extraction_sha256 text NOT NULL,
    src_file text NOT NULL,
    src_row_num integer NOT NULL,
    legacy_action_id text,
    legacy_task_id_raw text,
    reason_codes text[] NOT NULL,
    reason_details jsonb NOT NULL,
    source_payload jsonb NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT current_timestamp,
    CONSTRAINT task_action_transform_identity_shape CHECK (
        src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND extraction_sha256 ~ '^[0-9A-F]{64}$'
    ),
    CONSTRAINT task_action_transform_reason_shape CHECK (
        cardinality(reason_codes) > 0
        AND jsonb_typeof(reason_details) = 'array'
        AND jsonb_array_length(reason_details) = cardinality(reason_codes)
        AND jsonb_typeof(source_payload) = 'object'
    )
);

CREATE OR REPLACE FUNCTION quarantine.refuse_admin_work_evidence_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $ADMIN_EVIDENCE$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Task 2.9A immutable migration evidence cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.9A migration evidence DELETE/TRUNCATE is refused';
END;
$ADMIN_EVIDENCE$;

CREATE TRIGGER admin_task_transform_no_change
BEFORE UPDATE OR DELETE ON quarantine.admin_task_transform
FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_admin_work_evidence_change();

CREATE TRIGGER admin_task_transform_no_truncate
BEFORE TRUNCATE ON quarantine.admin_task_transform
FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_admin_work_evidence_change();

CREATE TRIGGER task_action_transform_no_change
BEFORE UPDATE OR DELETE ON quarantine.task_action_transform
FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_admin_work_evidence_change();

CREATE TRIGGER task_action_transform_no_truncate
BEFORE TRUNCATE ON quarantine.task_action_transform
FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_admin_work_evidence_change();

COMMIT;
