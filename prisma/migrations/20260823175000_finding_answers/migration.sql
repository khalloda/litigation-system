-- =========================================================================
--  0026 — SOMEWHERE FOR THE FIRM'S ANSWER TO LAND (task 2.4)
--
--  `quarantine.review_value` already has three answer columns, because it
--  asks about a VALUE: `م. أحمد` is answered once, however many hearings
--  carry it.
--
--  Some questions are not about a value. "This hearing records no matter" is
--  about one row, and the answer is different for each of the four. Those
--  sheets are driven by `quarantine.finding`, which had nowhere for an answer
--  to go — so the workbook would have shipped with columns that led nowhere,
--  which is worse than not asking.
--
--  The columns are nullable and the table stays derived-and-rebuilt: see the
--  note on re-running below, which is the part that matters.
-- =========================================================================

ALTER TABLE quarantine.finding
    ADD COLUMN firm_answer text,
    ADD COLUMN firm_note   text,
    ADD COLUMN answered_at timestamptz,
    ADD COLUMN answered_by text;

COMMENT ON COLUMN quarantine.finding.firm_answer IS
    'The firm''s answer to this specific row. Free text on purpose: these questions are one-offs and a dropdown would force a guess.';

-- -------------------------------------------------------------------------
--  A DELIBERATE HAZARD, WRITTEN DOWN RATHER THAN DESIGNED AROUND
--
--  `sql/profile-staging.sql` TRUNCATEs this table on every run, because
--  findings are derived and a stale one is worse than none. That is correct
--  for the finding — and it would destroy an answer written here.
--
--  Today that cannot happen: no answers exist yet, and the workbook has not
--  been sent. Before the first answered workbook comes back, the profiler
--  must stop truncating and start upserting, exactly as it already does for
--  `review_value`.
--
--  This is recorded as a constraint rather than a comment so it cannot be
--  forgotten: the profiler's TRUNCATE will fail the moment any answer exists.
--  A migration that refuses is a migration somebody reads.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION quarantine.refuse_to_discard_answers()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    n bigint;
BEGIN
    SELECT count(*) INTO n FROM quarantine.finding WHERE answered_at IS NOT NULL;
    IF n > 0 THEN
        RAISE EXCEPTION
            'refusing to truncate quarantine.finding: % row(s) carry an answer from the firm. Change the profiler to upsert before re-running it (rule 7).', n;
    END IF;
    RETURN NULL;
END
$$;

CREATE TRIGGER finding_truncate_guard
    BEFORE TRUNCATE ON quarantine.finding
    FOR EACH STATEMENT
    EXECUTE FUNCTION quarantine.refuse_to_discard_answers();

COMMENT ON TRIGGER finding_truncate_guard ON quarantine.finding IS
    'Rule 7. The profiler rebuilds findings from scratch; this refuses if that would discard an answer the firm has written.';

DO $ANSWERS$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'quarantine' AND table_name = 'finding'
       AND column_name IN ('firm_answer', 'firm_note', 'answered_at', 'answered_by');
    IF n <> 4 THEN
        RAISE EXCEPTION 'quarantine.finding: % answer columns, expected 4', n;
    END IF;

    SELECT count(*) INTO n FROM pg_trigger
     WHERE tgrelid = 'quarantine.finding'::regclass AND tgname = 'finding_truncate_guard';
    IF n <> 1 THEN
        RAISE EXCEPTION 'the truncate guard on quarantine.finding is missing';
    END IF;

    RAISE NOTICE 'quarantine.finding: 4 answer columns, truncate guarded';
END
$ANSWERS$;
