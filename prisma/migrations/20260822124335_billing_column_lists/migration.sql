/*
  Warnings:

  - You are about to drop the column `status` on the `attendance` table. All the data in the column will be lost.
  - You are about to drop the column `client_id` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `payments` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "invoice_allocations" DROP CONSTRAINT "invoice_allocations_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_allocations" DROP CONSTRAINT "invoice_allocations_person_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_client_id_fkey";

-- DropIndex
DROP INDEX "clients_name_ar_normalised_trgm";

-- DropIndex
DROP INDEX "contacts_contact_name_normalised_trgm";

-- DropIndex
DROP INDEX "invoices_client_id_idx";

-- DropIndex
DROP INDEX "matters_case_number_ar_normalised_trgm";

-- DropIndex
DROP INDEX "matters_subject_normalised_trgm";

-- DropIndex
DROP INDEX "people_name_ar_normalised_trgm";

-- DropIndex
DROP INDEX "person_name_alias_alias_ar_normalised_trgm";

-- AlterTable
ALTER TABLE "attendance" DROP COLUMN "status",
ADD COLUMN     "legacy_situation_raw" TEXT,
ADD COLUMN     "situation" TEXT;

-- AlterTable
ALTER TABLE "invoice_allocations" ADD COLUMN     "lawyer_role_id" SMALLINT,
ADD COLUMN     "legacy_invoice_no" TEXT,
ADD COLUMN     "legacy_lawyer_as_raw" TEXT,
ADD COLUMN     "legacy_lawyer_raw" TEXT,
ADD COLUMN     "legacy_percent_raw" TEXT,
ALTER COLUMN "invoice_id" DROP NOT NULL,
ALTER COLUMN "person_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "client_id",
ADD COLUMN     "amount_usd" DECIMAL(14,2),
ADD COLUMN     "details" TEXT,
ADD COLUMN     "fee_letter_id" INTEGER,
ADD COLUMN     "legacy_contract_id" TEXT,
ADD COLUMN     "legacy_status_raw" TEXT,
ADD COLUMN     "legacy_type_raw" TEXT,
ADD COLUMN     "receipt_amount" DECIMAL(14,2),
ADD COLUMN     "receipt_no" TEXT,
ADD COLUMN     "report" TEXT,
ADD COLUMN     "status_id" SMALLINT,
ADD COLUMN     "type_id" SMALLINT,
ADD COLUMN     "vat" TEXT;

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "amount",
ADD COLUMN     "credit" DECIMAL(14,2),
ADD COLUMN     "debit" DECIMAL(14,2),
ADD COLUMN     "details" TEXT,
ADD COLUMN     "legacy_invoice_no" TEXT;

-- CreateTable
CREATE TABLE "lookup_invoice_status" (
    "id" SMALLSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "label_ar" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_invoice_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_invoice_type" (
    "id" SMALLSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "label_ar" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_invoice_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_lawyer_share_role" (
    "id" SMALLSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "label_ar" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_lawyer_share_role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lookup_invoice_status_code_key" ON "lookup_invoice_status"("code");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_invoice_type_code_key" ON "lookup_invoice_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_lawyer_share_role_code_key" ON "lookup_lawyer_share_role"("code");

-- CreateIndex
CREATE INDEX "invoices_fee_letter_id_idx" ON "invoices"("fee_letter_id");

-- CreateIndex
CREATE INDEX "invoices_status_id_idx" ON "invoices"("status_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_fee_letter_id_fkey" FOREIGN KEY ("fee_letter_id") REFERENCES "fee_letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "lookup_invoice_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "lookup_invoice_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_lawyer_role_id_fkey" FOREIGN KEY ("lawyer_role_id") REFERENCES "lookup_lawyer_share_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==========================================================================
--  THE BILLING COLUMN LISTS — 22 August 2026
--
--  Source: sql/billing-lookups.sql and the firm's column lists for الفواتير
--  (14), السداد (7), Attendance (4) and تقسيم التحصيلات (5).
--
--  THREE COLUMNS I INVENTED ARE DROPPED. Task 1.5 built these tables with
--  their keys and a minimal shape, and three of the guesses were wrong:
--
--    invoices.client_id   الفواتير has contractID, not clientID. An invoice
--                         attaches to a FEE LETTER — which is the link D3
--                         requires — and the client comes through it.
--    payments.amount      السداد has Credit and Debit. Two columns, not one.
--    attendance.status    AttSituation is a free-text daily log, not a status.
--
--  Their absence is asserted, because a presence check cannot see a column
--  that should not be there.
--
--  TWO CORRECTIONS THAT WOULD HAVE REJECTED ROWS AT STAGE 2
--
--  invoice_allocations.person_id and .invoice_id were NOT NULL. Both are now
--  nullable. `Lawyer` holds ENGLISH names — Ahmed Abdullah, Nagy Ramadan —
--  the only Latin person column in the database, resolved through
--  people.name_en rather than person_name_alias. Where name_en is null the
--  row quarantines. NOT NULL would have rejected every unresolvable row
--  instead, which is the one thing a load must never do.
-- ==========================================================================

-- --------------------------------------------------------------------------
--  1. Seed the three Latin lookups
--
--  Values exactly as Access holds them; label_ar deliberately left NULL.
--  Translating a financial term is guessing at terminology (rule 5), and the
--  value is what Stage 2 matches on — a translated code would mean the
--  crosswalk had to match a translation.
-- --------------------------------------------------------------------------
INSERT INTO "lookup_invoice_status" (code, sort_order, updated_at) VALUES
    ('Paid',           10, now()),   -- 460
    ('Unpaid',         20, now()),   --  60
    ('Partially Paid', 30, now()),   --  12
    ('Later',          40, now()),   --  10
    ('Canceled',       50, now());   --   1

INSERT INTO "lookup_invoice_type" (code, sort_order, updated_at) VALUES
    ('Service',  10, now()),   -- 379
    ('Expenses', 20, now());   -- 162

INSERT INTO "lookup_lawyer_share_role" (code, sort_order, updated_at) VALUES
    ('Reviewer', 10, now()),   -- 16
    ('LawyerA',  20, now()),   -- 16
    ('LawyerB',  30, now()),   --  8
    ('LawyerA+', 40, now());   --  7  MEANING UNCLEAR — ask before surfacing

-- --------------------------------------------------------------------------
--  2. Money stays non-negative
--
--  The old payments_amount_not_negative_check went with its column. Credit
--  and Debit each get their own.
-- --------------------------------------------------------------------------
ALTER TABLE "payments"
    ADD CONSTRAINT "payments_credit_not_negative_check"
    CHECK (credit IS NULL OR credit >= 0);

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_debit_not_negative_check"
    CHECK (debit IS NULL OR debit >= 0);

DO $BILLCOLS$
DECLARE
    n       integer;
    missing text;
    extra   text;
BEGIN
    -- ----------------------------------------------------------------------
    --  The lookups, by exact code
    -- ----------------------------------------------------------------------
    SELECT count(*) INTO n FROM "lookup_invoice_status";
    IF n <> 5 THEN RAISE EXCEPTION 'lookup_invoice_status: %, expected 5', n; END IF;
    SELECT count(*) INTO n FROM "lookup_invoice_type";
    IF n <> 2 THEN RAISE EXCEPTION 'lookup_invoice_type: %, expected 2', n; END IF;
    SELECT count(*) INTO n FROM "lookup_lawyer_share_role";
    IF n <> 4 THEN RAISE EXCEPTION 'lookup_lawyer_share_role: %, expected 4', n; END IF;

    -- Counted AND named. Five rows that are not these five would pass a count.
    SELECT count(*) INTO n FROM "lookup_invoice_status"
     WHERE code IN ('Paid', 'Unpaid', 'Partially Paid', 'Later', 'Canceled');
    IF n <> 5 THEN RAISE EXCEPTION 'invoice statuses are not the 5 the firm counted'; END IF;

    SELECT count(*) INTO n FROM "lookup_invoice_type"
     WHERE code IN ('Service', 'Expenses');
    IF n <> 2 THEN RAISE EXCEPTION 'invoice types are not Service and Expenses'; END IF;

    SELECT count(*) INTO n FROM "lookup_lawyer_share_role"
     WHERE code IN ('Reviewer', 'LawyerA', 'LawyerB', 'LawyerA+');
    IF n <> 4 THEN RAISE EXCEPTION 'lawyer share roles are not the 4 the firm counted'; END IF;

    -- No Arabic label may have been invented. When they arrive they arrive
    -- from the firm.
    SELECT (SELECT count(*) FROM "lookup_invoice_status"     WHERE label_ar IS NOT NULL)
         + (SELECT count(*) FROM "lookup_invoice_type"       WHERE label_ar IS NOT NULL)
         + (SELECT count(*) FROM "lookup_lawyer_share_role"  WHERE label_ar IS NOT NULL)
      INTO n;
    IF n <> 0 THEN
        RAISE EXCEPTION '% Arabic labels have been filled in — they must come from the firm, not from a translation', n;
    END IF;

    -- ----------------------------------------------------------------------
    --  Every Access column has a home
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO missing
      FROM (VALUES
                -- الفواتير, 14 columns. Pay-Date is deliberately absent (D4).
                ('invoices', 'invoice_no'), ('invoices', 'fee_letter_id'),
                ('invoices', 'legacy_contract_id'), ('invoices', 'invoice_date'),
                ('invoices', 'amount'), ('invoices', 'amount_usd'),
                ('invoices', 'currency'), ('invoices', 'details'),
                ('invoices', 'status_id'), ('invoices', 'type_id'),
                ('invoices', 'vat'), ('invoices', 'report'),
                ('invoices', 'receipt_no'), ('invoices', 'receipt_amount'),
                -- السداد, 7 columns
                ('payments', 'legacy_id'), ('payments', 'legacy_invoice_no'),
                ('payments', 'invoice_id'), ('payments', 'payment_date'),
                ('payments', 'credit'), ('payments', 'debit'),
                ('payments', 'currency'), ('payments', 'details'),
                -- Attendance, 4 columns
                ('attendance', 'legacy_id'), ('attendance', 'attendance_date'),
                ('attendance', 'situation'), ('attendance', 'legacy_situation_raw'),
                ('attendance', 'person_id'), ('attendance', 'legacy_person_raw'),
                -- تقسيم التحصيلات, 5 columns
                ('invoice_allocations', 'legacy_id'),
                ('invoice_allocations', 'invoice_id'),
                ('invoice_allocations', 'legacy_invoice_no'),
                ('invoice_allocations', 'person_id'),
                ('invoice_allocations', 'legacy_lawyer_raw'),
                ('invoice_allocations', 'share'),
                ('invoice_allocations', 'legacy_percent_raw'),
                ('invoice_allocations', 'lawyer_role_id'),
                ('invoice_allocations', 'legacy_lawyer_as_raw')
           ) AS r(t, c)
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                        WHERE ic.table_schema = 'public'
                          AND ic.table_name = r.t AND ic.column_name = r.c);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Access columns with no home: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  ...and the three placeholders are gone
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO extra
      FROM (VALUES ('invoices', 'client_id'), ('payments', 'amount'),
                   ('attendance', 'status'),
                   -- and D4 still holds
                   ('invoices', 'pay_date'), ('invoices', 'paydate')
           ) AS r(t, c)
     WHERE EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public'
                      AND ic.table_name = r.t AND ic.column_name = r.c);
    IF extra IS NOT NULL THEN
        RAISE EXCEPTION 'these must not exist — three were invented placeholders, Pay-Date is D4: %', extra;
    END IF;

    -- ----------------------------------------------------------------------
    --  THE TWO NOT NULLs THAT WOULD HAVE REJECTED ROWS
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO missing
      FROM (VALUES ('invoice_allocations', 'person_id'),
                   ('invoice_allocations', 'invoice_id'),
                   ('payments', 'payment_date'),
                   ('invoices', 'fee_letter_id')
           ) AS r(t, c)
     WHERE EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public'
                      AND ic.table_name = r.t AND ic.column_name = r.c
                      AND ic.is_nullable = 'NO');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'these must stay nullable — an English lawyer name that no name_en matches, and a third of payments with no date, both have to load: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  عدد النسخ IS A LIVE COUNT, NOT A FLAG
    --
    --  A count of copies currently in the safe: 0 on 113 rows, 1 on 577, 2 on
    --  29, 3 on 7, 4 on 2, 8 on one, and 6 blank. Zero is a MEANINGFUL state —
    --  none available, the document is signed out — and the report highlights
    --  it in yellow.
    --
    --  Asserted integer, and asserted to have NO CHECK CONSTRAINT capping it.
    --  Capping it at 1 would reject the 39 rows that legitimately hold more.
    -- ----------------------------------------------------------------------
    SELECT data_type INTO missing FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'powers_of_attorney'
       AND column_name = 'copies_count';
    IF missing IS DISTINCT FROM 'integer' THEN
        RAISE EXCEPTION 'powers_of_attorney.copies_count is %, expected integer', coalesce(missing, 'absent');
    END IF;

    SELECT string_agg(conname, ', ') INTO extra
      FROM pg_constraint
     WHERE conrelid = 'powers_of_attorney'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%copies_count%';
    IF extra IS NOT NULL THEN
        RAISE EXCEPTION 'copies_count has a CHECK constraint (%) — it is a live count with no upper bound, and 39 rows hold more than one copy', extra;
    END IF;

    -- ----------------------------------------------------------------------
    --  Money is still exact, and non-negative
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c || ' is ' || ic.data_type, ', ') INTO missing
      FROM (VALUES ('invoices', 'amount'), ('invoices', 'amount_usd'),
                   ('invoices', 'receipt_amount'),
                   ('payments', 'credit'), ('payments', 'debit'),
                   ('invoice_allocations', 'share')
           ) AS r(t, c)
      JOIN information_schema.columns ic
        ON ic.table_schema = 'public' AND ic.table_name = r.t AND ic.column_name = r.c
     WHERE ic.data_type <> 'numeric';
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'money must be exact numerics, never floating point: %', missing;
    END IF;

    SELECT string_agg(c.name, ', ' ORDER BY c.name) INTO missing
      FROM (VALUES ('payments_credit_not_negative_check'),
                   ('payments_debit_not_negative_check'),
                   ('invoices_amount_not_negative_check'),
                   ('invoice_allocations_share_range_check')
           ) AS c(name)
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint pc WHERE pc.conname = c.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'money constraints missing: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  The four tables are still empty, and nothing else moved
    -- ----------------------------------------------------------------------
    SELECT (SELECT count(*) FROM "invoices")
         + (SELECT count(*) FROM "payments")
         + (SELECT count(*) FROM "invoice_allocations")
         + (SELECT count(*) FROM "attendance")
      INTO n;
    IF n <> 0 THEN
        RAISE EXCEPTION 'the billing tables should still be empty, found % rows', n;
    END IF;

    SELECT count(*) INTO n FROM "people";
    IF n <> 135 THEN RAISE EXCEPTION 'people: %, expected 135', n; END IF;

    RAISE NOTICE 'billing column lists complete: invoices 14, payments 7, attendance 4, allocations 5; 3 Latin lookups seeded 5/2/4';
END
$BILLCOLS$;
