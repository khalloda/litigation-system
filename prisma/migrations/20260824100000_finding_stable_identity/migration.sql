-- =========================================================================
--  0029 — A FINDING NEEDS AN IDENTITY THAT SURVIVES BEING REBUILT
--
--  The review workbook prints every row's database id and the answers are
--  read back by it. That works for `review_value`, which is upserted on
--  (topic, value) and keeps its ids.
--
--  It did not work for `finding`. The profiler rebuilt that table from
--  scratch, so every id was reissued from the sequence, and the workbook the
--  firm had spent a week on referred to rows that no longer existed. 72
--  answers across three sheets could not be matched.
--
--  Nothing was lost — the importer refused rather than writing answers into
--  whatever rows happened to hold those ids now, which would have been far
--  worse. But the id was never a stable identity for a derived row, and
--  printing it in a document that leaves the building said it was.
--
--  WHAT ACTUALLY IDENTIFIES A FINDING is what it is about: the topic, the
--  row, and the column. That is unique across all 5,491 of them today, and
--  this makes it unique by construction so the profiler can upsert on it and
--  ids stop moving.
--
--  NULLS NOT DISTINCT matters here. `column_name` is null on findings that
--  are about a whole row, and the default NULL-is-distinct behaviour would
--  let two of those coexist — which is the same "an assertion tests what it
--  looks at" fault that let a duplicate `lawyers` entry through Gate 1.
-- =========================================================================

ALTER TABLE quarantine.finding
    ADD CONSTRAINT finding_identity
    UNIQUE NULLS NOT DISTINCT (topic, src_table, src_file, src_row_num, column_name);

COMMENT ON CONSTRAINT finding_identity ON quarantine.finding IS
    'What a finding IS: this topic, about this row, about this column. The id is a handle, not an identity — the profiler upserts on this so ids survive a rebuild and a workbook stays readable back.';

DO $IDENTITY$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM pg_constraint
     WHERE conrelid = 'quarantine.finding'::regclass AND conname = 'finding_identity';
    IF n <> 1 THEN RAISE EXCEPTION 'finding_identity is missing'; END IF;

    --  Prove NULLS NOT DISTINCT is actually in force rather than assumed.
    --  A plain UNIQUE would accept two row-level findings on the same row.
    SELECT count(*) INTO n
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.relname = 'finding_identity' AND i.indnullsnotdistinct;
    IF n <> 1 THEN
        RAISE EXCEPTION 'finding_identity does not treat NULL column_name as a duplicate';
    END IF;

    SELECT count(*) INTO n FROM quarantine.finding;
    RAISE NOTICE 'finding_identity in force over % rows, nulls not distinct', n;
END
$IDENTITY$;
