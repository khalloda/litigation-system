BEGIN;

-- Task 2.10A final provenance correction. A billing row is application-native
-- only while every migration-only field for its table is NULL. The controlled
-- historical writer may still INSERT a complete migrated row; partial
-- provenance is rejected by the CHECK constraints.

DO $PRECONDITION$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.invoices
         WHERE legacy_source_record_key IS NULL
           AND (legacy_id IS NOT NULL
                OR legacy_contract_id IS NOT NULL
                OR legacy_currency_raw IS NOT NULL
                OR legacy_status_raw IS NOT NULL
                OR legacy_type_raw IS NOT NULL
                OR legacy_receipt_currency_raw IS NOT NULL
                OR legacy_source_extraction_sha256 IS NOT NULL
                OR legacy_source_payload IS NOT NULL)
    ) OR EXISTS (
        SELECT 1 FROM public.payments
         WHERE legacy_source_record_key IS NULL
           AND (legacy_id IS NOT NULL
                OR legacy_invoice_no IS NOT NULL
                OR legacy_currency_raw IS NOT NULL
                OR legacy_source_extraction_sha256 IS NOT NULL
                OR legacy_source_payload IS NOT NULL)
    ) OR EXISTS (
        SELECT 1 FROM public.invoice_allocations
         WHERE legacy_source_record_key IS NULL
           AND (legacy_id IS NOT NULL
                OR legacy_invoice_no IS NOT NULL
                OR legacy_lawyer_raw IS NOT NULL
                OR legacy_percent_raw IS NOT NULL
                OR legacy_lawyer_as_raw IS NOT NULL
                OR legacy_source_extraction_sha256 IS NOT NULL
                OR legacy_source_payload IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'Task 2.10A partial billing provenance exists; migration 0047 refuses to reclassify or rewrite it';
    END IF;
END
$PRECONDITION$;

ALTER TABLE public.invoices
    DROP CONSTRAINT invoices_source_identity_shape,
    ADD CONSTRAINT invoices_source_identity_shape CHECK (
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
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND jsonb_typeof(legacy_source_payload)='object'
         AND NOT (legacy_source_payload ? 'Pay-Date')
         AND legacy_id IS NOT NULL
         AND invoice_no IS NOT NULL
         AND fee_letter_id IS NOT NULL
         AND legacy_contract_id IS NOT NULL
         AND legacy_currency_raw IS NOT NULL));

ALTER TABLE public.payments
    DROP CONSTRAINT payments_source_identity_shape,
    ADD CONSTRAINT payments_source_identity_shape CHECK (
        (legacy_id IS NULL
         AND legacy_invoice_no IS NULL
         AND legacy_currency_raw IS NULL
         AND legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND legacy_source_payload IS NULL)
        OR
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND jsonb_typeof(legacy_source_payload)='object'
         AND legacy_id IS NOT NULL
         AND invoice_id IS NOT NULL
         AND legacy_invoice_no IS NOT NULL));

ALTER TABLE public.invoice_allocations
    DROP CONSTRAINT invoice_allocations_source_identity_shape,
    ADD CONSTRAINT invoice_allocations_source_identity_shape CHECK (
        (legacy_id IS NULL
         AND legacy_invoice_no IS NULL
         AND legacy_lawyer_raw IS NULL
         AND legacy_percent_raw IS NULL
         AND legacy_lawyer_as_raw IS NULL
         AND legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND legacy_source_payload IS NULL)
        OR
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND jsonb_typeof(legacy_source_payload)='object'
         AND legacy_id IS NOT NULL
         AND invoice_id IS NOT NULL
         AND person_id IS NOT NULL
         AND lawyer_role_id IS NOT NULL
         AND legacy_invoice_no IS NOT NULL
         AND legacy_lawyer_raw IS NOT NULL
         AND legacy_percent_raw IS NOT NULL
         AND legacy_lawyer_as_raw IS NOT NULL));

CREATE OR REPLACE FUNCTION public.refuse_legacy_billing_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $LEGACY_BILLING$
BEGIN
    IF TG_OP='TRUNCATE' THEN
        RAISE EXCEPTION 'Task 2.10A billing history TRUNCATE is refused';
    END IF;
    IF OLD.legacy_source_record_key IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10A migrated billing history cannot be updated or deleted';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF TG_TABLE_NAME='invoices'
           AND jsonb_strip_nulls(to_jsonb(NEW)) ?| ARRAY[
               'legacy_id','legacy_contract_id','legacy_currency_raw',
               'legacy_status_raw','legacy_type_raw','legacy_receipt_currency_raw',
               'legacy_source_record_key','legacy_source_extraction_sha256',
               'legacy_source_payload'
           ] THEN
            RAISE EXCEPTION 'Task 2.10A migration provenance cannot be attached by ordinary update';
        ELSIF TG_TABLE_NAME='payments'
           AND jsonb_strip_nulls(to_jsonb(NEW)) ?| ARRAY[
               'legacy_id','legacy_invoice_no','legacy_currency_raw',
               'legacy_source_record_key','legacy_source_extraction_sha256',
               'legacy_source_payload'
           ] THEN
            RAISE EXCEPTION 'Task 2.10A migration provenance cannot be attached by ordinary update';
        ELSIF TG_TABLE_NAME='invoice_allocations'
           AND jsonb_strip_nulls(to_jsonb(NEW)) ?| ARRAY[
               'legacy_id','legacy_invoice_no','legacy_lawyer_raw',
               'legacy_percent_raw','legacy_lawyer_as_raw',
               'legacy_source_record_key','legacy_source_extraction_sha256',
               'legacy_source_payload'
           ] THEN
            RAISE EXCEPTION 'Task 2.10A migration provenance cannot be attached by ordinary update';
        END IF;
    END IF;
    IF TG_OP='DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$LEGACY_BILLING$;

COMMIT;
