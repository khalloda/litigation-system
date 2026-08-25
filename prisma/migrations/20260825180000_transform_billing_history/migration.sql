BEGIN;

-- Task 2.10A: durable billing provenance, the two owner-reviewed legacy
-- crosswalks, and immutable target-or-quarantine evidence. This migration is
-- additive and does not transform a live source row; the serializable writer
-- runs only after its dry run and fixture suite pass.

DO $PRECONDITION$
BEGIN
    IF (SELECT count(*) FROM public.invoices)
       + (SELECT count(*) FROM public.payments)
       + (SELECT count(*) FROM public.invoice_allocations) <> 0 THEN
        RAISE EXCEPTION 'Task 2.10A schema migration requires empty billing targets';
    END IF;
END
$PRECONDITION$;

CREATE TABLE public.migration_billing_person_crosswalk (
    source_value text PRIMARY KEY,
    person_id integer NOT NULL,
    legacy_only boolean NOT NULL DEFAULT true,
    reviewed_by text NOT NULL,
    reviewed_at date NOT NULL,
    reviewer_note text NOT NULL,
    CONSTRAINT migration_billing_person_crosswalk_person_fkey
        FOREIGN KEY (person_id) REFERENCES public.people(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT migration_billing_person_crosswalk_reviewed CHECK (
        source_value <> '' AND legacy_only IS TRUE
        AND reviewed_by <> '' AND reviewer_note <> '')
);

INSERT INTO public.migration_billing_person_crosswalk
    (source_value,person_id,legacy_only,reviewed_by,reviewed_at,reviewer_note)
SELECT 'Ahmed Abdullah',p.id,true,'Khaled Helmy',DATE '2026-08-25',
       'Owner-reviewed Task 2.10A legacy-only English allocation name; preserve canonical Dr. Ahmed Abdullah / أحمد عبد الله and never infer through Arabic aliases.'
  FROM public.people p
 WHERE p.id=25 AND p.name_en='Dr. Ahmed Abdullah' AND p.name_ar='أحمد عبد الله';

DO $PERSON_RULE$
BEGIN
    IF (SELECT count(*) FROM public.migration_billing_person_crosswalk) <> 1 THEN
        RAISE EXCEPTION 'reviewed Ahmed Abdullah billing crosswalk did not resolve exactly once';
    END IF;
END
$PERSON_RULE$;

CREATE TABLE public.migration_billing_currency_rule (
    field_kind text NOT NULL,
    source_value text NOT NULL,
    target_value text,
    require_zero_amount boolean NOT NULL DEFAULT false,
    reviewed_by text NOT NULL,
    reviewed_at date NOT NULL,
    reviewer_note text NOT NULL,
    CONSTRAINT migration_billing_currency_rule_pkey PRIMARY KEY (field_kind,source_value),
    CONSTRAINT migration_billing_currency_rule_kind CHECK (
        field_kind IN ('transaction_currency','receipt_currency')),
    CONSTRAINT migration_billing_currency_rule_shape CHECK (
        source_value <> '' AND reviewed_by <> '' AND reviewer_note <> ''
        AND ((field_kind='transaction_currency' AND target_value IS NOT NULL
              AND require_zero_amount IS FALSE)
             OR (field_kind='receipt_currency' AND target_value IS NULL
                 AND require_zero_amount IS TRUE)))
);

INSERT INTO public.migration_billing_currency_rule
    (field_kind,source_value,target_value,require_zero_amount,reviewed_by,reviewed_at,reviewer_note)
VALUES
    ('transaction_currency',' USD','USD',false,'Khaled Helmy',DATE '2026-08-25',
     'Exact leading-space normalization for invoice 21352 and its two payments; never trim or case-fold another value.'),
    ('receipt_currency','0',NULL,true,'Khaled Helmy',DATE '2026-08-25',
     'Raw receipt currency 0 becomes NULL only when the receipt amount is zero; non-zero must fail safely.');

ALTER TABLE public.invoices
    ADD COLUMN legacy_currency_raw text,
    ADD COLUMN legacy_receipt_currency_raw text,
    ADD COLUMN legacy_source_record_key text,
    ADD COLUMN legacy_source_extraction_sha256 text,
    ADD COLUMN legacy_source_payload jsonb,
    ADD CONSTRAINT invoices_source_identity_shape CHECK (
        (legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND legacy_source_payload IS NULL
         AND legacy_currency_raw IS NULL
         AND legacy_receipt_currency_raw IS NULL)
        OR
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND jsonb_typeof(legacy_source_payload)='object'
         AND NOT (legacy_source_payload ? 'Pay-Date')
         AND legacy_id IS NOT NULL
         AND invoice_no IS NOT NULL
         AND fee_letter_id IS NOT NULL
         AND legacy_contract_id IS NOT NULL
         AND legacy_currency_raw IS NOT NULL))
;
CREATE UNIQUE INDEX invoices_legacy_source_record_key_key
    ON public.invoices(legacy_source_record_key);

ALTER TABLE public.payments
    ADD COLUMN legacy_currency_raw text,
    ADD COLUMN legacy_source_record_key text,
    ADD COLUMN legacy_source_extraction_sha256 text,
    ADD COLUMN legacy_source_payload jsonb,
    ADD CONSTRAINT payments_source_identity_shape CHECK (
        (legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND legacy_source_payload IS NULL
         AND legacy_currency_raw IS NULL)
        OR
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND jsonb_typeof(legacy_source_payload)='object'
         AND legacy_id IS NOT NULL
         AND invoice_id IS NOT NULL
         AND legacy_invoice_no IS NOT NULL))
;
CREATE UNIQUE INDEX payments_legacy_source_record_key_key
    ON public.payments(legacy_source_record_key);

ALTER TABLE public.invoice_allocations
    ADD COLUMN legacy_source_record_key text,
    ADD COLUMN legacy_source_extraction_sha256 text,
    ADD COLUMN legacy_source_payload jsonb,
    ADD CONSTRAINT invoice_allocations_source_identity_shape CHECK (
        (legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND legacy_source_payload IS NULL
         AND legacy_invoice_no IS NULL
         AND legacy_lawyer_raw IS NULL
         AND legacy_percent_raw IS NULL
         AND legacy_lawyer_as_raw IS NULL)
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
         AND legacy_lawyer_as_raw IS NOT NULL))
;
CREATE UNIQUE INDEX invoice_allocations_legacy_source_record_key_key
    ON public.invoice_allocations(legacy_source_record_key);
CREATE UNIQUE INDEX invoice_allocations_invoice_person_role_key
    ON public.invoice_allocations(invoice_id,person_id,lawyer_role_id);

CREATE TABLE quarantine.invoice_transform (
    src_record_key text PRIMARY KEY,
    extraction_sha256 text NOT NULL,
    src_file text NOT NULL,
    src_row_num integer NOT NULL,
    legacy_invoice_no_raw text,
    reason_codes text[] NOT NULL,
    reason_details jsonb NOT NULL,
    source_payload jsonb NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT current_timestamp,
    CONSTRAINT invoice_transform_identity_shape CHECK (
        src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND extraction_sha256 ~ '^[0-9A-F]{64}$'),
    CONSTRAINT invoice_transform_reason_shape CHECK (
        cardinality(reason_codes)>0
        AND jsonb_typeof(reason_details)='array'
        AND jsonb_array_length(reason_details)=cardinality(reason_codes)
        AND jsonb_typeof(source_payload)='object'
        AND NOT (source_payload ? 'Pay-Date'))
);

CREATE TABLE quarantine.payment_transform (
    src_record_key text PRIMARY KEY,
    extraction_sha256 text NOT NULL,
    src_file text NOT NULL,
    src_row_num integer NOT NULL,
    legacy_payment_id_raw text,
    legacy_invoice_no_raw text,
    reason_codes text[] NOT NULL,
    reason_details jsonb NOT NULL,
    source_payload jsonb NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT current_timestamp,
    CONSTRAINT payment_transform_identity_shape CHECK (
        src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND extraction_sha256 ~ '^[0-9A-F]{64}$'),
    CONSTRAINT payment_transform_reason_shape CHECK (
        cardinality(reason_codes)>0
        AND jsonb_typeof(reason_details)='array'
        AND jsonb_array_length(reason_details)=cardinality(reason_codes)
        AND jsonb_typeof(source_payload)='object')
);

CREATE TABLE quarantine.invoice_allocation_transform (
    src_record_key text PRIMARY KEY,
    extraction_sha256 text NOT NULL,
    src_file text NOT NULL,
    src_row_num integer NOT NULL,
    legacy_allocation_id_raw text,
    legacy_invoice_no_raw text,
    reason_codes text[] NOT NULL,
    reason_details jsonb NOT NULL,
    source_payload jsonb NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT current_timestamp,
    CONSTRAINT invoice_allocation_transform_identity_shape CHECK (
        src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
        AND extraction_sha256 ~ '^[0-9A-F]{64}$'),
    CONSTRAINT invoice_allocation_transform_reason_shape CHECK (
        cardinality(reason_codes)>0
        AND jsonb_typeof(reason_details)='array'
        AND jsonb_array_length(reason_details)=cardinality(reason_codes)
        AND jsonb_typeof(source_payload)='object')
);

CREATE OR REPLACE FUNCTION quarantine.refuse_billing_evidence_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $BILLING_EVIDENCE$
BEGIN
    IF TG_OP='UPDATE' THEN
        RAISE EXCEPTION 'Task 2.10A immutable billing evidence cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.10A billing evidence DELETE/TRUNCATE is refused';
END;
$BILLING_EVIDENCE$;

CREATE TRIGGER invoice_transform_no_change
    BEFORE UPDATE OR DELETE ON quarantine.invoice_transform
    FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_billing_evidence_change();
CREATE TRIGGER invoice_transform_no_truncate
    BEFORE TRUNCATE ON quarantine.invoice_transform
    FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_billing_evidence_change();
CREATE TRIGGER payment_transform_no_change
    BEFORE UPDATE OR DELETE ON quarantine.payment_transform
    FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_billing_evidence_change();
CREATE TRIGGER payment_transform_no_truncate
    BEFORE TRUNCATE ON quarantine.payment_transform
    FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_billing_evidence_change();
CREATE TRIGGER invoice_allocation_transform_no_change
    BEFORE UPDATE OR DELETE ON quarantine.invoice_allocation_transform
    FOR EACH ROW EXECUTE FUNCTION quarantine.refuse_billing_evidence_change();
CREATE TRIGGER invoice_allocation_transform_no_truncate
    BEFORE TRUNCATE ON quarantine.invoice_allocation_transform
    FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_billing_evidence_change();

DO $POSTCONDITION$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n
      FROM staging."LawyerShare4Invoices";
    IF n <> 0 THEN
        RAISE EXCEPTION 'LawyerShare4Invoices must remain exactly empty, found % rows',n;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='invoices'
           AND lower(replace(column_name,'_','')) IN ('paydate')) THEN
        RAISE EXCEPTION 'D4 violation: a Pay-Date target column exists';
    END IF;
END
$POSTCONDITION$;

COMMIT;
