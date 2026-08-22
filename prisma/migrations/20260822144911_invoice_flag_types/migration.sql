/*
  Warnings:

  - You are about to drop the column `receipt_no` on the `invoices` table. All the data in the column will be lost.
  - The `report` column on the `invoices` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `vat` column on the `invoices` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- Prisma warns that three columns are dropped and recreated. Safe only
-- because invoices is EMPTY, which is asserted here BEFORE the ALTER runs
-- rather than assumed. If this is ever replayed against a database holding
-- invoices it stops instead of silently discarding them.
DO $GUARD$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n FROM "invoices";
    IF n <> 0 THEN
        RAISE EXCEPTION 'invoices holds % rows — this migration drops and recreates columns and would destroy them', n;
    END IF;
END
$GUARD$;

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "receipt_no",
ADD COLUMN     "receipt_currency" TEXT,
DROP COLUMN "report",
ADD COLUMN     "report" BOOLEAN,
DROP COLUMN "vat",
ADD COLUMN     "vat" BOOLEAN;

-- ==========================================================================
--  INVOICE FLAGS AND THE RECEIPT PAIR — the firm read the data
--
--  Prisma warns that this migration drops and recreates three columns. That
--  is safe here for exactly one reason: `invoices` is EMPTY. The block below
--  asserts it BEFORE anything else, so if this migration is ever replayed
--  against a database that does hold invoices it stops rather than silently
--  discarding them.
--
--  VAT? IS A FLAG, NOT AN AMOUNT. Only 1 (289 rows) and 0 (254). The 1 rows
--  are Service invoices with ordinary amounts and nothing anywhere encodes a
--  rate or a value. It means "VAT applies to this invoice". Boolean.
--
--  report IS A FLAG ON EIGHT INVOICES. 535 zeros, 8 ones, meaning unknown.
--  Migrated under D10 and never surfaced.
--
--  R-# AND R-$ — AND MY FIRST READING WAS INVERTED.
--  The names suggest a receipt NUMBER and an amount. The content says the
--  opposite:
--      R-#   278 blank, 244 zero, 21 rows with round figures 5000 / 10000 /
--            44000. Amounts.
--      R-$   520 blank, 21 rows `EGP`, 2 rows `0`. The same 21 rows.
--  So they are an amount and its currency: receipt_amount numeric,
--  receipt_currency text. 21 of 543 invoices, under 4%, and not surfaced.
--
--  **The `R-` naming suggests "receipt". That is an INFERENCE, not a fact.**
--  The data shows only an amount and a currency travelling together.
-- ==========================================================================

DO $INVTYPES$
DECLARE
    n     integer;
    found text;
BEGIN
    -- Types, named. A count of columns would be satisfied by the wrong ones.
    SELECT string_agg(r.c || ' is ' || ic.data_type, ', ' ORDER BY r.c) INTO found
      FROM (VALUES ('vat', 'boolean'), ('report', 'boolean'),
                   ('receipt_amount', 'numeric'), ('receipt_currency', 'text')
           ) AS r(c, want)
      JOIN information_schema.columns ic
        ON ic.table_schema = 'public' AND ic.table_name = 'invoices'
       AND ic.column_name = r.c
     WHERE ic.data_type <> r.want;
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'invoice column types wrong: %', found;
    END IF;

    -- receipt_no was my inverted reading and must be gone. A presence check
    -- cannot see a column that should not be there.
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'invoices'
       AND column_name = 'receipt_no';
    IF n <> 0 THEN
        RAISE EXCEPTION 'invoices.receipt_no still exists — R-# is an amount, not a number';
    END IF;

    -- All four must still be nullable: 278 blank R-#, 520 blank R-$.
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO found
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'invoices'
       AND column_name IN ('vat', 'report', 'receipt_amount', 'receipt_currency')
       AND is_nullable = 'NO';
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'these must stay nullable: %', found;
    END IF;

    -- D4 still holds.
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'invoices'
       AND column_name IN ('pay_date', 'paydate');
    IF n <> 0 THEN
        RAISE EXCEPTION 'invoices.pay_date exists — D4 says it is not migrated';
    END IF;

    -- The four LawyerAs values are unchanged. LawyerA+ is a CO-LEAD sharing
    -- the lead allocation, not a variant of LawyerA — it maps to
    -- matter_lawyers.role = co_lead (D5). See docs/GLOSSARY.md.
    SELECT count(*) INTO n FROM "lookup_lawyer_share_role"
     WHERE code IN ('Reviewer', 'LawyerA', 'LawyerA+', 'LawyerB');
    IF n <> 4 THEN
        RAISE EXCEPTION 'lawyer share roles: % of 4 present', n;
    END IF;

    -- The role names on the other side of that alignment must exist too, or
    -- the mapping recorded in the glossary has nothing to land on.
    SELECT count(*) INTO n FROM pg_constraint
     WHERE conname = 'matter_lawyers_role_check'
       AND pg_get_constraintdef(oid) LIKE '%co_lead%';
    IF n <> 1 THEN
        RAISE EXCEPTION 'matter_lawyers.role no longer allows co_lead, which is what LawyerA+ maps to';
    END IF;

    RAISE NOTICE 'invoices: vat and report are flags, R-# is an amount and R-$ its currency; LawyerA+ = co_lead';
END
$INVTYPES$;
