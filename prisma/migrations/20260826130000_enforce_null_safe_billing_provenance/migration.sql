BEGIN;

-- Task 2.10A null-safety correction. PostgreSQL accepts a CHECK expression
-- when it is TRUE or UNKNOWN. Migration 0047's migrated branch therefore
-- needs both explicit non-NULL identity requirements and a whole-expression
-- IS TRUE guard. This migration changes schema only; it never rewrites data.

DO $PRECONDITION$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.invoices
         WHERE NOT ((
             (legacy_id IS NULL
              AND legacy_contract_id IS NULL
              AND legacy_currency_raw IS NULL
              AND legacy_status_raw IS NULL
              AND legacy_type_raw IS NULL
              AND legacy_receipt_currency_raw IS NULL
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
              AND NOT (legacy_source_payload ? 'Pay-Date')
              AND legacy_id IS NOT NULL
              AND invoice_no IS NOT NULL
              AND fee_letter_id IS NOT NULL
              AND legacy_contract_id IS NOT NULL
              AND legacy_currency_raw IS NOT NULL)
         ) IS TRUE)
    ) OR EXISTS (
        SELECT 1 FROM public.payments
         WHERE NOT ((
             (legacy_id IS NULL
              AND legacy_invoice_no IS NULL
              AND legacy_currency_raw IS NULL
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
              AND invoice_id IS NOT NULL
              AND legacy_invoice_no IS NOT NULL)
         ) IS TRUE)
    ) OR EXISTS (
        SELECT 1 FROM public.invoice_allocations
         WHERE NOT ((
             (legacy_id IS NULL
              AND legacy_invoice_no IS NULL
              AND legacy_lawyer_raw IS NULL
              AND legacy_percent_raw IS NULL
              AND legacy_lawyer_as_raw IS NULL
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
              AND invoice_id IS NOT NULL
              AND person_id IS NOT NULL
              AND lawyer_role_id IS NOT NULL
              AND legacy_invoice_no IS NOT NULL
              AND legacy_lawyer_raw IS NOT NULL
              AND legacy_percent_raw IS NOT NULL
              AND legacy_lawyer_as_raw IS NOT NULL)
         ) IS TRUE)
    ) THEN
        RAISE EXCEPTION 'Task 2.10A invalid native or migrated billing provenance exists; migration 0048 refuses to reclassify or rewrite it';
    END IF;
END
$PRECONDITION$;

ALTER TABLE public.invoices
    DROP CONSTRAINT invoices_source_identity_shape,
    ADD CONSTRAINT invoices_source_identity_shape CHECK ((
        (legacy_id IS NULL
         AND legacy_contract_id IS NULL
         AND legacy_currency_raw IS NULL
         AND legacy_status_raw IS NULL
         AND legacy_type_raw IS NULL
         AND legacy_receipt_currency_raw IS NULL
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
         AND NOT (legacy_source_payload ? 'Pay-Date')
         AND legacy_id IS NOT NULL
         AND invoice_no IS NOT NULL
         AND fee_letter_id IS NOT NULL
         AND legacy_contract_id IS NOT NULL
         AND legacy_currency_raw IS NOT NULL)
    ) IS TRUE);

ALTER TABLE public.payments
    DROP CONSTRAINT payments_source_identity_shape,
    ADD CONSTRAINT payments_source_identity_shape CHECK ((
        (legacy_id IS NULL
         AND legacy_invoice_no IS NULL
         AND legacy_currency_raw IS NULL
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
         AND invoice_id IS NOT NULL
         AND legacy_invoice_no IS NOT NULL)
    ) IS TRUE);

ALTER TABLE public.invoice_allocations
    DROP CONSTRAINT invoice_allocations_source_identity_shape,
    ADD CONSTRAINT invoice_allocations_source_identity_shape CHECK ((
        (legacy_id IS NULL
         AND legacy_invoice_no IS NULL
         AND legacy_lawyer_raw IS NULL
         AND legacy_percent_raw IS NULL
         AND legacy_lawyer_as_raw IS NULL
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
         AND invoice_id IS NOT NULL
         AND person_id IS NOT NULL
         AND lawyer_role_id IS NOT NULL
         AND legacy_invoice_no IS NOT NULL
         AND legacy_lawyer_raw IS NOT NULL
         AND legacy_percent_raw IS NOT NULL
         AND legacy_lawyer_as_raw IS NOT NULL)
    ) IS TRUE);

COMMIT;
