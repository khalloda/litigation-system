-- CreateIndex
CREATE INDEX "clients_full_name_normalised_idx" ON "clients" USING GIN ("full_name_normalised" gin_trgm_ops);

-- ==========================================================================
--  THE TWO MONEY COLUMNS THAT WERE NOT CONSTRAINED
--
--  Migration 0015 stated that money in this system is never negative and gave
--  invoices.amount, payments.credit and payments.debit a CHECK. Two later
--  money columns never got one: amount_usd (added at 1.5a) and
--  receipt_amount (added at 1.5b, and renamed from my inverted reading of
--  R-#). Both accepted negatives while the migration above them said they
--  could not.
--
--  A rule stated in a comment and enforced on three of five columns is not a
--  rule. Both now carry the same constraint as their neighbours, and
--  db:check verifies all six BY RULE rather than by name — see
--  scripts/check-db.ts.
-- ==========================================================================

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_amount_usd_not_negative_check"
    CHECK (amount_usd IS NULL OR amount_usd >= 0);

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_receipt_amount_not_negative_check"
    CHECK (receipt_amount IS NULL OR receipt_amount >= 0);

DO $MONEY$
DECLARE missing text;
BEGIN
    -- All six, and each one VALIDATED. A constraint added NOT VALID is not
    -- enforced against existing rows and reads as present to a name check.
    SELECT string_agg(c.name, ', ' ORDER BY c.name) INTO missing
      FROM (VALUES ('invoices_amount_not_negative_check'),
                   ('invoices_amount_usd_not_negative_check'),
                   ('invoices_receipt_amount_not_negative_check'),
                   ('payments_credit_not_negative_check'),
                   ('payments_debit_not_negative_check'),
                   ('invoice_allocations_share_range_check')
           ) AS c(name)
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint pc
                        WHERE pc.conname = c.name
                          AND pc.contype = 'c'
                          AND pc.convalidated);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'financial constraints missing or not validated: %', missing;
    END IF;

    -- And each carries a real expression, not CHECK (true). Named columns,
    -- because a constraint on the wrong column would satisfy everything above.
    SELECT string_agg(c.name, ', ' ORDER BY c.name) INTO missing
      FROM (VALUES ('invoices_amount_not_negative_check',         'amount'),
                   ('invoices_amount_usd_not_negative_check',     'amount_usd'),
                   ('invoices_receipt_amount_not_negative_check', 'receipt_amount'),
                   ('payments_credit_not_negative_check',         'credit'),
                   ('payments_debit_not_negative_check',          'debit'),
                   ('invoice_allocations_share_range_check',      'share')
           ) AS c(name, col)
     WHERE NOT EXISTS (
        SELECT 1 FROM pg_constraint pc
         WHERE pc.conname = c.name
           AND pg_get_constraintdef(pc.oid) LIKE '%' || c.col || '%'
           AND pg_get_constraintdef(pc.oid) LIKE '%>=%');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'these do not constrain what they claim to: %', missing;
    END IF;

    RAISE NOTICE 'six financial constraints present, validated and real';
END
$MONEY$;
