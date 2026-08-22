/*
  Warnings:

  - You are about to drop the column `capacity` on the `powers_of_attorney` table. All the data in the column will be lost.
  - You are about to drop the column `principal_capacity` on the `powers_of_attorney` table. All the data in the column will be lost.
  - The `inventory` column on the `powers_of_attorney` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "powers_of_attorney" DROP COLUMN "capacity",
DROP COLUMN "principal_capacity",
ADD COLUMN     "poa_capacity" TEXT,
ADD COLUMN     "poa_capacity_duplicate" TEXT,
DROP COLUMN "inventory",
ADD COLUMN     "inventory" BOOLEAN;

-- ==========================================================================
--  POWERS OF ATTORNEY — THE FIRM READS ITS OWN COLUMNS
--
--  Three names were translated literally at task 1.3a and flagged rather than
--  guessed (rule 5). The firm has now answered two from the data and one is
--  still open.
--
--  الصفة AND صفة الموكل بالتوكيل ARE THE SAME FIELD, DUPLICATED
--
--  Compared row by row across all 735:
--      565 identical
--      164 filled in الصفة only
--        0 filled in صفة الموكل بالتوكيل only
--        4 different, and three of those are typos of each other
--          (تويوتا إيجيبت / إيجبت / إيجيت)
--
--  One column a strict superset and the other NEVER uniquely populated is the
--  signature of a copy that stopped being maintained. الصفة is live;
--  صفة الموكل بالتوكيل is the abandoned duplicate. Both migrate (D10), the
--  application reads الصفة.
--
--  AND IT IS NOT THE D7 PARTY CAPACITY. D7 is a party's procedural ROLE in a
--  matter — plaintiff, appellant — from a closed list of 11, on
--  matter_party_roles. This is the capacity in which a person GRANTED a power
--  of attorney: شخصي, or a corporate office. Free text, 306 distinct values.
--  The columns are named so the two cannot be confused later.
--
--  حرف IS THE LETTER-SERIES of the POA reference — confirmed. 28 values,
--  nearly all single Arabic letters, أ on 183 and ب on 167. The report prints
--  982 / أ / 2009 as number / letter / year.
--
--  مسلسل IS TEXT, NOT A NUMBER. Latin letters — A, B, C. Typing it as an
--  integer would fail the load on every row. Asserted below, because "serial"
--  reads as a number and somebody will eventually try.
--
--  جرد IS STILL OPEN. 1 on 680 rows, 0 on 55, so it is a yes/no flag and is
--  typed as one. What the two states MEAN is not recoverable from the data
--  and the firm is supplying it. Not guessed.
-- ==========================================================================

DO $POA$
DECLARE
    n     integer;
    found text;
BEGIN
    -- The live field, the duplicate, and neither of the old guessed names.
    SELECT string_agg(c.name, ', ' ORDER BY c.name) INTO found
      FROM (VALUES ('poa_capacity'), ('poa_capacity_duplicate')) AS c(name)
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                        WHERE ic.table_schema = 'public'
                          AND ic.table_name = 'powers_of_attorney'
                          AND ic.column_name = c.name);
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'powers_of_attorney is missing: %', found;
    END IF;

    -- The two names from before the firm read the columns must be gone, or
    -- both readings would exist side by side and a transform could pick
    -- either. A presence check cannot see this.
    SELECT string_agg(c.name, ', ' ORDER BY c.name) INTO found
      FROM (VALUES ('capacity'), ('principal_capacity')) AS c(name)
     WHERE EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public'
                      AND ic.table_name = 'powers_of_attorney'
                      AND ic.column_name = c.name);
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'the pre-answer capacity column names still exist: %', found;
    END IF;

    -- مسلسل is Latin letters. Anything numeric here fails every row at load.
    SELECT data_type INTO found FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'powers_of_attorney'
       AND column_name = 'serial_no';
    IF found IS DISTINCT FROM 'text' THEN
        RAISE EXCEPTION 'powers_of_attorney.serial_no is %, expected text — مسلسل holds A, B, C', coalesce(found, 'absent');
    END IF;

    -- حرف likewise: a single Arabic letter is not a number.
    SELECT data_type INTO found FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'powers_of_attorney'
       AND column_name = 'poa_letter';
    IF found IS DISTINCT FROM 'text' THEN
        RAISE EXCEPTION 'powers_of_attorney.poa_letter is %, expected text', coalesce(found, 'absent');
    END IF;

    -- جرد is a flag. Typed as one so that whatever the firm says the states
    -- mean, the column cannot quietly accumulate a third.
    SELECT data_type INTO found FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'powers_of_attorney'
       AND column_name = 'inventory';
    IF found IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'powers_of_attorney.inventory is %, expected boolean — جرد is 1 on 680 rows and 0 on 55', coalesce(found, 'absent');
    END IF;

    -- عدد النسخ stays a number: the report compares it.
    SELECT data_type INTO found FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'powers_of_attorney'
       AND column_name = 'copies_count';
    IF found IS DISTINCT FROM 'integer' THEN
        RAISE EXCEPTION 'powers_of_attorney.copies_count is %, expected integer', coalesce(found, 'absent');
    END IF;

    SELECT count(*) INTO n FROM "powers_of_attorney";
    IF n <> 0 THEN
        RAISE EXCEPTION 'powers_of_attorney should still be empty, found % rows', n;
    END IF;

    RAISE NOTICE 'powers_of_attorney: الصفة is live, صفة الموكل بالتوكيل is the duplicate, مسلسل and حرف are text, جرد is a flag';
END
$POA$;
