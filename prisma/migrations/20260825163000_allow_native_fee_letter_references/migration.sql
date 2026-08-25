BEGIN;

-- Task 2.9D follow-up: the resolved relationship is also an application
-- table. Rows created after migration have no legacy provenance and must stay
-- outside legacy reconciliation, just like every other transformed target.
ALTER TABLE public.matter_fee_letter_references
    ALTER COLUMN identifier_space DROP NOT NULL,
    ALTER COLUMN legacy_reference_raw DROP NOT NULL,
    ALTER COLUMN legacy_source_record_key DROP NOT NULL,
    ALTER COLUMN legacy_source_extraction_sha256 DROP NOT NULL,
    ALTER COLUMN legacy_source_payload DROP NOT NULL,
    DROP CONSTRAINT matter_fee_letter_references_identity_shape,
    ADD CONSTRAINT matter_fee_letter_references_identity_shape CHECK (
        (identifier_space IS NULL
         AND legacy_reference_raw IS NULL
         AND legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND legacy_source_payload IS NULL)
        OR
        (identifier_space IN ('contract_id','mfiles_id')
         AND legacy_reference_raw IS NOT NULL
         AND legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND jsonb_typeof(legacy_source_payload)='object')
    );

COMMIT;
