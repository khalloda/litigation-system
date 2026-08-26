BEGIN;

-- Task 2.10A post-review correction: historical billing targets and the
-- reviewed rules that produced them are evidence. Application-native rows
-- remain editable while every migration-provenance field is NULL.

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
    IF TG_OP='UPDATE' AND NEW.legacy_source_record_key IS NOT NULL THEN
        RAISE EXCEPTION 'Task 2.10A migration provenance cannot be attached by ordinary update';
    END IF;
    IF TG_OP='DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$LEGACY_BILLING$;

CREATE TRIGGER invoices_legacy_no_change
    BEFORE UPDATE OR DELETE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.refuse_legacy_billing_change();
CREATE TRIGGER invoices_legacy_no_truncate
    BEFORE TRUNCATE ON public.invoices
    FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_legacy_billing_change();
CREATE TRIGGER payments_legacy_no_change
    BEFORE UPDATE OR DELETE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.refuse_legacy_billing_change();
CREATE TRIGGER payments_legacy_no_truncate
    BEFORE TRUNCATE ON public.payments
    FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_legacy_billing_change();
CREATE TRIGGER invoice_allocations_legacy_no_change
    BEFORE UPDATE OR DELETE ON public.invoice_allocations
    FOR EACH ROW EXECUTE FUNCTION public.refuse_legacy_billing_change();
CREATE TRIGGER invoice_allocations_legacy_no_truncate
    BEFORE TRUNCATE ON public.invoice_allocations
    FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_legacy_billing_change();

CREATE OR REPLACE FUNCTION public.refuse_billing_rule_change()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $BILLING_RULE$
BEGIN
    IF TG_OP='UPDATE' THEN
        RAISE EXCEPTION 'Task 2.10A reviewed billing rules cannot be updated';
    END IF;
    RAISE EXCEPTION 'Task 2.10A reviewed billing rules cannot be deleted or truncated';
END;
$BILLING_RULE$;

CREATE TRIGGER migration_billing_person_crosswalk_no_change
    BEFORE UPDATE OR DELETE ON public.migration_billing_person_crosswalk
    FOR EACH ROW EXECUTE FUNCTION public.refuse_billing_rule_change();
CREATE TRIGGER migration_billing_person_crosswalk_no_truncate
    BEFORE TRUNCATE ON public.migration_billing_person_crosswalk
    FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_billing_rule_change();
CREATE TRIGGER migration_billing_currency_rule_no_change
    BEFORE UPDATE OR DELETE ON public.migration_billing_currency_rule
    FOR EACH ROW EXECUTE FUNCTION public.refuse_billing_rule_change();
CREATE TRIGGER migration_billing_currency_rule_no_truncate
    BEFORE TRUNCATE ON public.migration_billing_currency_rule
    FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_billing_rule_change();

-- INSERT is intentionally not trigger-blocked. A future reviewed rule is a
-- new fact rather than a rewrite of old evidence, but the exact Task 2.10A
-- baseline in the independent reconciliation rejects any unapproved extra row.

COMMIT;
