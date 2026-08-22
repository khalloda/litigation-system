/*
  Warnings:

  - You are about to drop the column `name_ar` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the column `name_en` on the `contacts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "name_ar",
DROP COLUMN "name_en",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "business_phone" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contact_name" TEXT,
ADD COLUMN     "country_region" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "fax_number" TEXT,
ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "home_phone" TEXT,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "mobile_phone" TEXT,
ADD COLUMN     "state_province" TEXT,
ADD COLUMN     "web_page" TEXT,
ADD COLUMN     "zip_postal_code" TEXT;

-- AlterTable
ALTER TABLE "fee_letters" ADD COLUMN     "client_name" TEXT,
ADD COLUMN     "contract_date" DATE,
ADD COLUMN     "contract_details" TEXT,
ADD COLUMN     "contract_structure" TEXT,
ADD COLUMN     "contract_type" TEXT,
ADD COLUMN     "status" TEXT;

-- AlterTable
ALTER TABLE "powers_of_attorney" ADD COLUMN     "capacity" TEXT,
ADD COLUMN     "client_name" TEXT,
ADD COLUMN     "copies_count" INTEGER,
ADD COLUMN     "inventory" TEXT,
ADD COLUMN     "issue_date" DATE,
ADD COLUMN     "issuing_authority" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "poa_letter" TEXT,
ADD COLUMN     "poa_number" TEXT,
ADD COLUMN     "poa_year" TEXT,
ADD COLUMN     "principal_capacity" TEXT,
ADD COLUMN     "principal_name" TEXT,
ADD COLUMN     "serial_no" TEXT;

-- AlterTable
ALTER TABLE "task_actions" ADD COLUMN     "action_date" DATE,
ADD COLUMN     "legacy_performed_by_raw" TEXT,
ADD COLUMN     "next_appointment" DATE,
ADD COLUMN     "performed_by_person_id" INTEGER,
ADD COLUMN     "report" TEXT,
ADD COLUMN     "result" TEXT;

-- CreateIndex
CREATE INDEX "task_actions_performed_by_person_id_idx" ON "task_actions"("performed_by_person_id");

-- AddForeignKey
ALTER TABLE "task_actions" ADD CONSTRAINT "task_actions_performed_by_person_id_fkey" FOREIGN KEY ("performed_by_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==========================================================================
--  THE FOUR COLUMN LISTS — POSTCONDITIONS
--
--  Task 1.3 built contacts, task_actions, powers_of_attorney and fee_letters
--  with their keys and only the columns the documents named, and said so
--  rather than inventing the rest. The firm has now supplied the real Access
--  column lists, with the fill rate of every column.
--
--  This asserts that every Access column has a home. Counting columns would
--  not do it — a count is satisfied by the wrong columns — so each one is
--  named.
--
--  Two things are asserted NOT to exist, which is the half a presence check
--  cannot see:
--    * contacts.attachments. It looks 100% populated in Access and holds
--      ZERO files. D11: never build for a complex column.
--    * contacts.name_ar / name_en. Those were placeholder names invented
--      before the real list arrived. Access has Contact1 (97%) and Full_name
--      (10%) and neither is what those names implied.
-- ==========================================================================

DO $COLS$
DECLARE
    n       integer;
    missing text;
    extra   text;
BEGIN
    -- ----------------------------------------------------------------------
    --  Every Access column has a home
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO missing
      FROM (VALUES
                -- contacts, 17 Access columns. Attachments is deliberately
                -- absent (D11); ID and clientID are legacy_id and client_id.
                ('contacts', 'contact_name'), ('contacts', 'full_name'),
                ('contacts', 'job_title'), ('contacts', 'email'),
                ('contacts', 'mobile_phone'), ('contacts', 'business_phone'),
                ('contacts', 'home_phone'), ('contacts', 'fax_number'),
                ('contacts', 'web_page'), ('contacts', 'address'),
                ('contacts', 'city'), ('contacts', 'state_province'),
                ('contacts', 'zip_postal_code'), ('contacts', 'country_region'),
                ('contacts', 'legacy_id'), ('contacts', 'client_id'),

                -- task_actions, 7 Access columns.
                ('task_actions', 'legacy_id'), ('task_actions', 'task_id'),
                ('task_actions', 'legacy_task_id_raw'),
                ('task_actions', 'action_date'),
                ('task_actions', 'performed_by_person_id'),
                ('task_actions', 'legacy_performed_by_raw'),
                ('task_actions', 'result'), ('task_actions', 'report'),
                ('task_actions', 'next_appointment'),

                -- powers_of_attorney, 15 Access columns.
                ('powers_of_attorney', 'client_id'),
                ('powers_of_attorney', 'client_name'),
                ('powers_of_attorney', 'serial_no'),
                ('powers_of_attorney', 'principal_name'),
                ('powers_of_attorney', 'principal_capacity'),
                ('powers_of_attorney', 'capacity'),
                ('powers_of_attorney', 'poa_number'),
                ('powers_of_attorney', 'poa_letter'),
                ('powers_of_attorney', 'poa_year'),
                ('powers_of_attorney', 'issuing_authority'),
                ('powers_of_attorney', 'issue_date'),
                ('powers_of_attorney', 'copies_count'),
                ('powers_of_attorney', 'notes'),
                ('powers_of_attorney', 'inventory'),
                ('powers_of_attorney', 'legacy_lawyers_raw'),

                -- fee_letters, 10 Access columns. Matter is the multi-value
                -- column and becomes fee_letter_matters at task 1.4.
                ('fee_letters', 'contract_id'), ('fee_letters', 'client_id'),
                ('fee_letters', 'client_name'), ('fee_letters', 'mfiles_id'),
                ('fee_letters', 'contract_type'), ('fee_letters', 'contract_date'),
                ('fee_letters', 'contract_details'),
                ('fee_letters', 'contract_structure'),
                ('fee_letters', 'status')
           ) AS r(t, c)
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                        WHERE ic.table_schema = 'public'
                          AND ic.table_name = r.t AND ic.column_name = r.c);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Access columns with no home: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  ...and the columns that must NOT exist
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO extra
      FROM (VALUES
                ('contacts', 'attachments'),
                ('contacts', 'name_ar'),
                ('contacts', 'name_en')
           ) AS r(t, c)
     WHERE EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public'
                      AND ic.table_name = r.t AND ic.column_name = r.c);
    IF extra IS NOT NULL THEN
        RAISE EXCEPTION 'these must not exist — attachments is an empty complex column (D11), name_ar/name_en were placeholders: %', extra;
    END IF;

    -- ----------------------------------------------------------------------
    --  The raw partner for the FOURTH person-name mapping
    --
    --  القائم بالعمل is a typed person name on 96% of 4,130 rows. Names are
    --  the highest-ratio mapping in this project and the one that has already
    --  gone wrong twice, so it gets the same raw partner as the other three.
    -- ----------------------------------------------------------------------
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'task_actions'
       AND column_name = 'legacy_performed_by_raw';
    IF n <> 1 THEN
        RAISE EXCEPTION 'task_actions.legacy_performed_by_raw is missing — القائم بالعمل would map to a person with no record of the spelling used';
    END IF;

    -- ----------------------------------------------------------------------
    --  عدد النسخ must be a NUMBER
    --
    --  It drives the yellow-row highlighting on the powers-of-attorney report
    --  (docs/REPORT-LAYOUTS.md). Highlighting compares it, and comparing text
    --  would order 10 before 2.
    -- ----------------------------------------------------------------------
    SELECT data_type INTO missing FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'powers_of_attorney'
       AND column_name = 'copies_count';
    IF missing IS DISTINCT FROM 'integer' THEN
        RAISE EXCEPTION 'powers_of_attorney.copies_count is %, expected integer — the POA report compares it', coalesce(missing, 'absent');
    END IF;

    -- ----------------------------------------------------------------------
    --  Still empty, and nothing else moved
    -- ----------------------------------------------------------------------
    SELECT (SELECT count(*) FROM "contacts")
         + (SELECT count(*) FROM "task_actions")
         + (SELECT count(*) FROM "powers_of_attorney")
         + (SELECT count(*) FROM "fee_letters")
      INTO n;
    IF n <> 0 THEN
        RAISE EXCEPTION 'these tables should still be empty, found % rows', n;
    END IF;

    SELECT count(*) INTO n FROM "people";
    IF n <> 135 THEN RAISE EXCEPTION 'people: %, expected 135', n; END IF;

    RAISE NOTICE 'four column lists complete: contacts 17, task_actions 7, powers_of_attorney 15, fee_letters 10';
END
$COLS$;
