-- ===========================================================================
--  PROOF: NULL and the empty string arrive distinct, and stay distinct.
--
--      npm run test:staging-copy
--
--  In this data they mean different things. An unassigned `lawyerA` is a
--  matter nobody has been put on; a cleared one is a matter somebody was
--  taken off. Collapse them and that difference is gone for good, because
--  staging is the only place the original text still exists.
--
--  The extractor writes NULL as a BARE empty field and '' as a QUOTED empty
--  field. PostgreSQL CSV COPY reads back exactly that distinction. This is
--  the whole mechanism, and the point of this file is that it is PROVED
--  rather than reasoned about — "the check catches a failure" is not
--  something to take on trust (docs/MIGRATION.md).
--
--  It also proves the four kinds of content that break a naive loader: a
--  comma inside a quoted field, a NEWLINE inside a quoted field, a doubled
--  quote, and trailing spaces. A line-counting loader gets the second one
--  wrong on real data -- this database has memo fields with newlines in them.
--
--  SAFE TO RUN AT ANY TIME. Everything happens in a TEMP table inside a
--  transaction that rolls back. No project table is written to, and the last
--  statement re-reads a staging table to show it is untouched.
-- ===========================================================================

BEGIN;

-- INCLUDING ALL copies the real definition — types, nullability, defaults,
-- the primary key. If staging."lawyers" ever gained a NOT NULL or a DEFAULT
-- on a source column, this proof would inherit it and fail.
CREATE TEMP TABLE proof (LIKE staging."lawyers" INCLUDING ALL);

\copy proof (src_file, src_row_num, src_record_key, src_extraction_sha256, "اسم المحامي", "LawyerID", "LawyerName", "Title", "AttTrack") FROM STDIN WITH (FORMAT csv, HEADER false)
"lawyers.csv",1,"595b3f47de8165c21f5eec9b4d2522197f991eb960453f44d7ba74802e8717ec:000001","AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",,"","plain value","إيهاب حمدي","a ""quoted"" word"
"lawyers.csv",2,"88ede5a147be6d9aea179fa6cfdc8438963791f274c349877e9144df6cf68ae6:000001","AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","","he said, ""hello""","line one
line two",,"trailing spaces   "
\.

SELECT
    src_row_num,
    CASE WHEN "اسم المحامي" IS NULL THEN 'NULL' ELSE '[' || "اسم المحامي" || ']' END AS arabic_col,
    CASE WHEN "LawyerID"    IS NULL THEN 'NULL' ELSE '[' || "LawyerID"    || ']' END AS lawyer_id,
    CASE WHEN "LawyerName"  IS NULL THEN 'NULL' ELSE '[' || "LawyerName"  || ']' END AS lawyer_name,
    CASE WHEN "Title"       IS NULL THEN 'NULL' ELSE '[' || "Title"       || ']' END AS title,
    CASE WHEN "AttTrack"    IS NULL THEN 'NULL' ELSE '[' || "AttTrack"    || ']' END AS att_track
FROM proof ORDER BY src_row_num;

DO $PROOF$
DECLARE
    n integer;
BEGIN
    --  THE CLAIM: a bare empty field is NULL, a quoted empty field is ''.
    --  In this data those mean different things — an unassigned lawyerA is
    --  not the same as one that was cleared — and the whole staging design
    --  rests on PostgreSQL's CSV COPY telling them apart without being asked.

    SELECT count(*) INTO n FROM proof
     WHERE src_row_num = 1 AND "اسم المحامي" IS NULL;
    IF n <> 1 THEN RAISE EXCEPTION 'a bare empty field did not arrive as NULL'; END IF;

    SELECT count(*) INTO n FROM proof
     WHERE src_row_num = 1 AND "LawyerID" = '' AND "LawyerID" IS NOT NULL;
    IF n <> 1 THEN RAISE EXCEPTION 'a quoted empty field did not arrive as the empty string'; END IF;

    --  ...and the other way round on row 2, so neither result is an accident
    --  of column position.
    SELECT count(*) INTO n FROM proof
     WHERE src_row_num = 2 AND "اسم المحامي" = '' AND "اسم المحامي" IS NOT NULL;
    IF n <> 1 THEN RAISE EXCEPTION 'row 2: quoted empty did not arrive as empty string'; END IF;

    SELECT count(*) INTO n FROM proof WHERE src_row_num = 2 AND "Title" IS NULL;
    IF n <> 1 THEN RAISE EXCEPTION 'row 2: bare empty did not arrive as NULL'; END IF;

    --  The awkward content the extractor is capable of writing, all of which
    --  a naive line-count or comma-split loader would get wrong.
    SELECT count(*) INTO n FROM proof
     WHERE src_row_num = 1 AND "Title" = 'إيهاب حمدي';
    IF n <> 1 THEN RAISE EXCEPTION 'Arabic did not survive the COPY'; END IF;

    SELECT count(*) INTO n FROM proof
     WHERE src_row_num = 1 AND "AttTrack" = 'a "quoted" word';
    IF n <> 1 THEN RAISE EXCEPTION 'a doubled quote did not unescape'; END IF;

    SELECT count(*) INTO n FROM proof
     WHERE src_row_num = 2 AND "LawyerID" = 'he said, "hello"';
    IF n <> 1 THEN RAISE EXCEPTION 'a comma inside a quoted field split the row'; END IF;

    SELECT count(*) INTO n FROM proof
     WHERE src_row_num = 2 AND "LawyerName" = E'line one\nline two';
    IF n <> 1 THEN RAISE EXCEPTION 'a newline inside a quoted field split the row'; END IF;

    SELECT count(*) INTO n FROM proof
     WHERE src_row_num = 2 AND "AttTrack" = 'trailing spaces   ';
    IF n <> 1 THEN RAISE EXCEPTION 'trailing spaces were stripped'; END IF;

    SELECT count(*) INTO n FROM proof;
    IF n <> 2 THEN RAISE EXCEPTION 'expected 2 rows, got %', n; END IF;

    SELECT count(*) INTO n FROM proof
     WHERE src_record_key = _migration.source_record_hash(
             'lawyers',
             ARRAY["اسم المحامي", "LawyerID", "LawyerName", "Title", "AttTrack"]::text[]
           ) || ':000001';
    IF n <> 2 THEN
        RAISE EXCEPTION 'TypeScript fixture keys and PostgreSQL source_record_hash disagree on % row(s)', 2 - n;
    END IF;

    RAISE NOTICE 'PROVED: bare empty -> NULL, quoted empty -> empty string, and they stay apart';
    RAISE NOTICE 'PROVED: Arabic, embedded comma, embedded newline, doubled quote, trailing spaces all intact';
    RAISE NOTICE 'PROVED: TypeScript and PostgreSQL compute the same complete-row identity';
END
$PROOF$;

ROLLBACK;

-- Nothing was written to any project table. Show the live row count without
-- claiming the Stage 2 staging table is empty.
SELECT count(*) AS unchanged_live_lawyers_rows FROM staging."lawyers";
