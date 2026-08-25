-- ============================================================================
--  BILLING LOOKUPS — three closed sets, 22 August 2026
--
--  Counted in the Access file by the firm. These are the only lookups in this
--  system whose values are LATIN, and they stay exactly as they are.
--
--  WHY THEY ARE NOT TRANSLATED
--  ---------------------------
--  The value is what the Access data holds and what Stage 2 matches on.
--  Translating it would mean the crosswalk had to match a translation, which
--  is one more place to get a mapping wrong for no gain.
--
--  So each of these lookups has a `code` — the exact Access value — and a
--  NULLABLE `label_ar` for the Arabic word that will be shown on screen.
--  **The Arabic labels are not supplied and are NOT invented here.** They are
--  financial and legal terms; rule 5 says ask rather than guess. They are
--  needed before task 4.8 (the billing screen), not before Stage 2.
--
--  This is the same separation the rest of the system already uses: the
--  database holds the value, src/strings.ts holds the word (D12).
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1. lookup_invoice_status — Access `الفواتير.Inv-Status`, 100% filled
--     Ordered by how often each appears in the live data.
-- ---------------------------------------------------------------------------
INSERT INTO lookup_invoice_status (code, sort_order) VALUES ('Paid',           10);  -- 460
INSERT INTO lookup_invoice_status (code, sort_order) VALUES ('Unpaid',         20);  --  60
INSERT INTO lookup_invoice_status (code, sort_order) VALUES ('Partially Paid', 30);  --  12
INSERT INTO lookup_invoice_status (code, sort_order) VALUES ('Later',          40);  --  10
INSERT INTO lookup_invoice_status (code, sort_order) VALUES ('Canceled',       50);  --   1
-- 460 + 60 + 12 + 10 + 1 = 543, the whole table.


-- ---------------------------------------------------------------------------
--  2. lookup_invoice_type — Access `الفواتير.Inv-Type`, 541 / 543 filled
-- ---------------------------------------------------------------------------
INSERT INTO lookup_invoice_type (code, sort_order) VALUES ('Service',  10);  -- 379
INSERT INTO lookup_invoice_type (code, sort_order) VALUES ('Expenses', 20);  -- 162
-- 379 + 162 = 541; invoices 21269 and 21772 are reviewed exact NULLs.


-- ---------------------------------------------------------------------------
--  3. lookup_lawyer_share_role — Access `تقسيم التحصيلات.LawyerAs`, 100%
--
--  What role a lawyer held for the purpose of splitting a collection.
--
--  **`LawyerA+` MEANING UNCLEAR — ASK BEFORE SURFACING IT ANYWHERE.** It is
--  seeded because the value exists on 7 of the 47 rows and nothing is
--  deleted (D10), but nothing may display or branch on it until the firm
--  says what it means.
-- ---------------------------------------------------------------------------
INSERT INTO lookup_lawyer_share_role (code, sort_order) VALUES ('Reviewer', 10);  -- 16
INSERT INTO lookup_lawyer_share_role (code, sort_order) VALUES ('LawyerA',  20);  -- 16
INSERT INTO lookup_lawyer_share_role (code, sort_order) VALUES ('LawyerB',  30);  --  8
INSERT INTO lookup_lawyer_share_role (code, sort_order) VALUES ('LawyerA+', 40);  --  7
-- 16 + 16 + 8 + 7 = 47, the whole table.


-- ============================================================================
--  VALIDATION — assert, do not assume
-- ============================================================================
SELECT 'invoice_status' AS lookup, count(*) FROM lookup_invoice_status
UNION ALL SELECT 'invoice_type',       count(*) FROM lookup_invoice_type
UNION ALL SELECT 'lawyer_share_role',  count(*) FROM lookup_lawyer_share_role;
-- Expected: 5, 2, 4

-- Every Arabic label is still empty. When they arrive they arrive from the
-- firm, not from a translation.
SELECT count(*) FROM lookup_invoice_status WHERE label_ar IS NOT NULL;
-- Expected: 0
