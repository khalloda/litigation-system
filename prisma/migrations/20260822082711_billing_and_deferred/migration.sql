-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "invoice_no" TEXT,
    "client_id" INTEGER,
    "currency" TEXT,
    "amount" DECIMAL(14,2),
    "invoice_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "invoice_id" INTEGER,
    "currency" TEXT,
    "amount" DECIMAL(14,2),
    "payment_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_allocations" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "invoice_id" INTEGER NOT NULL,
    "person_id" INTEGER NOT NULL,
    "share" DECIMAL(6,5),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "invoice_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "person_id" INTEGER,
    "legacy_person_raw" TEXT,
    "attendance_date" DATE,
    "status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_legacy_id_key" ON "invoices"("legacy_id");

-- CreateIndex
CREATE INDEX "invoices_client_id_idx" ON "invoices"("client_id");

-- CreateIndex
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");

-- CreateIndex
CREATE UNIQUE INDEX "payments_legacy_id_key" ON "payments"("legacy_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_allocations_legacy_id_key" ON "invoice_allocations"("legacy_id");

-- CreateIndex
CREATE INDEX "invoice_allocations_invoice_id_idx" ON "invoice_allocations"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_allocations_person_id_idx" ON "invoice_allocations"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_legacy_id_key" ON "attendance"("legacy_id");

-- CreateIndex
CREATE INDEX "attendance_person_id_idx" ON "attendance"("person_id");

-- CreateIndex
CREATE INDEX "attendance_attendance_date_idx" ON "attendance"("attendance_date");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==========================================================================
--  TASK 1.5 — CONSTRAINTS AND POSTCONDITIONS
--
--  Empty tables with correct keys (D3). The assertions are about the shape,
--  because there is no data yet — and the shape is where the money decisions
--  live.
-- ==========================================================================

-- --------------------------------------------------------------------------
--  A share is a FRACTION, never a percentage
--
--  0.25, not 25. Catching it here catches it at the moment somebody writes
--  the Phase 2 screen, rather than in a report that quietly says a lawyer is
--  owed 2,500% of an invoice.
--
--  The rule that the shares on one invoice sum to 1 is a rule ACROSS rows and
--  no CHECK constraint can express it — it lives in npm run db:check.
-- --------------------------------------------------------------------------
ALTER TABLE "invoice_allocations"
    ADD CONSTRAINT "invoice_allocations_share_range_check"
    CHECK (share IS NULL OR (share >= 0 AND share <= 1));

-- Money is never negative in this system: a refund would be its own row with
-- its own meaning, not a negative invoice nobody notices in a total.
ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_amount_not_negative_check"
    CHECK (amount IS NULL OR amount >= 0);

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_amount_not_negative_check"
    CHECK (amount IS NULL OR amount >= 0);

DO $BILLING$
DECLARE
    n       integer;
    missing text;
BEGIN
    -- ----------------------------------------------------------------------
    --  The four tables
    -- ----------------------------------------------------------------------
    SELECT string_agg(t.name, ', ' ORDER BY t.name) INTO missing
      FROM (VALUES ('invoices'), ('payments'), ('invoice_allocations'), ('attendance')
           ) AS t(name)
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables it
                        WHERE it.table_schema = 'public' AND it.table_name = t.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'task 1.5 tables missing: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  MONEY IS NEVER A FLOATING-POINT NUMBER
    --
    --  A double cannot hold 0.1 exactly. Summing 597 payments in a double
    --  gives a total that is close and wrong, and it is wrong in a report a
    --  partner sends to a client. Gate 4 reconciles total invoiced and total
    --  paid against Access; that comparison only means something if both
    --  sides add up exactly.
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c || ' is ' || ic.data_type, ', ') INTO missing
      FROM (VALUES ('invoices', 'amount'), ('payments', 'amount'),
                   ('invoice_allocations', 'share')
           ) AS r(t, c)
      JOIN information_schema.columns ic
        ON ic.table_schema = 'public' AND ic.table_name = r.t AND ic.column_name = r.c
     WHERE ic.data_type <> 'numeric';
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'money and shares must be exact numerics, never floating point: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  D4 — Pay-Date IS NOT MIGRATED
    --
    --  It stopped in September 2019 and holds 126 stale values the payments
    --  table supersedes. Asserted as ABSENT, which no presence check can see.
    --  If it ever appears, two disagreeing answers to "when was this paid"
    --  are in front of a partner.
    -- ----------------------------------------------------------------------
    SELECT string_agg(column_name, ', ') INTO missing
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'invoices'
       AND column_name IN ('pay_date', 'paydate');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'invoices.% exists — D4 says Pay-Date is not migrated', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  The currency survives
    --
    --  Gate 4 reconciles per currency. A total across mixed currencies is a
    --  meaningless number, and a missing currency column makes it impossible
    --  to tell that is what happened.
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.currency', ', ' ORDER BY r.t) INTO missing
      FROM (VALUES ('invoices'), ('payments')) AS r(t)
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                        WHERE ic.table_schema = 'public' AND ic.table_name = r.t
                          AND ic.column_name = 'currency');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'the currency must survive for Gate 4: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  The constraints exist, named
    -- ----------------------------------------------------------------------
    SELECT string_agg(c.name, ', ' ORDER BY c.name) INTO missing
      FROM (VALUES ('invoice_allocations_share_range_check'),
                   ('invoices_amount_not_negative_check'),
                   ('payments_amount_not_negative_check')
           ) AS c(name)
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint pc WHERE pc.conname = c.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'billing check constraints missing: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  Links that must stay nullable
    --
    --  A payment whose invoice cannot be resolved, and a leave entry whose
    --  person cannot be resolved, both load with a null link and go to the
    --  review queue.
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO missing
      FROM (VALUES ('payments', 'invoice_id'), ('attendance', 'person_id'),
                   ('invoices', 'client_id')
           ) AS r(t, c)
     WHERE EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public'
                      AND ic.table_name = r.t AND ic.column_name = r.c
                      AND ic.is_nullable = 'NO');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'these must stay nullable: %', missing;
    END IF;

    -- The fifth person-name mapping gets its raw partner, like the other four.
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'attendance'
       AND column_name = 'legacy_person_raw';
    IF n <> 1 THEN
        RAISE EXCEPTION 'attendance.legacy_person_raw is missing';
    END IF;

    -- ----------------------------------------------------------------------
    --  Empty, and nothing else moved
    -- ----------------------------------------------------------------------
    SELECT (SELECT count(*) FROM "invoices")
         + (SELECT count(*) FROM "payments")
         + (SELECT count(*) FROM "invoice_allocations")
         + (SELECT count(*) FROM "attendance")
      INTO n;
    IF n <> 0 THEN
        RAISE EXCEPTION 'the task 1.5 tables should arrive empty, found % rows', n;
    END IF;

    SELECT count(*) INTO n FROM "people";
    IF n <> 135 THEN RAISE EXCEPTION 'people: %, expected 135', n; END IF;

    RAISE NOTICE 'task 1.5: 4 tables, exact numerics, no Pay-Date, currency kept, all empty';
END
$BILLING$;
