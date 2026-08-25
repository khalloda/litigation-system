BEGIN;

-- Task 2.9C: source-complete paper document register and immutable evidence.
ALTER TABLE public.documents
    ADD COLUMN client_id integer,
    ADD COLUMN legacy_client_name_raw text,
    ADD COLUMN legacy_matter_ref_raw text,
    ADD COLUMN document_date date,
    ADD COLUMN legacy_page_count_raw text,
    ADD COLUMN notes text,
    ADD COLUMN legacy_mfiles_id_raw text,
    ADD COLUMN legacy_source_record_key text,
    ADD COLUMN legacy_source_extraction_sha256 text,
    ADD COLUMN legacy_source_payload jsonb,
    ADD CONSTRAINT documents_client_id_fkey FOREIGN KEY (client_id)
        REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE SET NULL,
    ADD CONSTRAINT documents_source_identity_shape CHECK (
        (legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND legacy_source_payload IS NULL)
        OR
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND jsonb_typeof(legacy_source_payload) = 'object'
         AND legacy_id IS NOT NULL)
    );

CREATE INDEX documents_client_id_idx ON public.documents (client_id);
CREATE UNIQUE INDEX documents_legacy_source_record_key_key
    ON public.documents (legacy_source_record_key);

CREATE TABLE quarantine.document_transform (
    src_record_key text PRIMARY KEY,
    extraction_sha256 text NOT NULL,
    src_file text NOT NULL,
    src_row_num integer NOT NULL,
    legacy_document_id text,
    reason_codes text[] NOT NULL,
    reason_details jsonb NOT NULL,
    source_payload jsonb NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT current_timestamp,
    CONSTRAINT document_transform_identity_shape CHECK (
        src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND extraction_sha256 ~ '^[0-9A-F]{64}$'),
    CONSTRAINT document_transform_reason_shape CHECK (
        cardinality(reason_codes) > 0
        AND jsonb_typeof(reason_details) = 'array'
        AND jsonb_array_length(reason_details) = cardinality(reason_codes)
        AND jsonb_typeof(source_payload) = 'object')
);

CREATE TABLE quarantine.document_evidence (
    src_record_key text NOT NULL,
    field_kind text NOT NULL,
    extraction_sha256 text NOT NULL,
    src_file text NOT NULL,
    src_row_num integer NOT NULL,
    raw_value text,
    reason_code text NOT NULL,
    reason_detail jsonb NOT NULL,
    source_payload jsonb NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT current_timestamp,
    PRIMARY KEY (src_record_key, field_kind),
    CONSTRAINT document_evidence_identity_shape CHECK (
        src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND extraction_sha256 ~ '^[0-9A-F]{64}$'
        AND field_kind IN ('client','matter','responsible_person','page_count','mfiles_id')),
    CONSTRAINT document_evidence_payload_shape CHECK (
        jsonb_typeof(reason_detail) = 'object'
        AND jsonb_typeof(source_payload) = 'object')
);

CREATE OR REPLACE FUNCTION quarantine.refuse_document_evidence_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $DOCUMENT_EVIDENCE$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Task 2.9C immutable migration evidence cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.9C migration evidence DELETE/TRUNCATE is refused';
END;
$DOCUMENT_EVIDENCE$;

CREATE TRIGGER document_transform_no_change
BEFORE UPDATE OR DELETE ON quarantine.document_transform
FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_document_evidence_change();
CREATE TRIGGER document_transform_no_truncate
BEFORE TRUNCATE ON quarantine.document_transform
FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_document_evidence_change();
CREATE TRIGGER document_evidence_no_change
BEFORE UPDATE OR DELETE ON quarantine.document_evidence
FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_document_evidence_change();
CREATE TRIGGER document_evidence_no_truncate
BEFORE TRUNCATE ON quarantine.document_evidence
FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_document_evidence_change();

COMMIT;
