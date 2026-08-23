-- =========================================================================
--  0028 — TWO ROSTER REPAIRS, AND ROOM FOR THE FIRM'S ACTUAL ANSWERS
--
--  The firm returned the Gate 3 review workbook. Two things it found are
--  faults in OUR roster, not in their data, and both are repaired here.
--
--  Rule 15 governs every statement below: each one states how many rows it
--  expects to touch and fails loudly if the number differs. A statement that
--  matched nothing would otherwise report success and change nothing, which
--  is how this project produced two duplicate people.
-- =========================================================================

-- -------------------------------------------------------------------------
--  1. A HAMZA PAIR THAT SURVIVED THE NAMES REVIEW
--
--  `احمد رزق` (bare alif, U+0627) and `أحمد رزق` (hamza, U+0623) are one
--  person. Every other hamza pair in this file was merged; this one was not.
--
--  That is exactly the failure D5 exists to prevent, surviving inside the
--  work that implements D5 — which is worth saying plainly rather than
--  filing as a tidy-up. `احمد سعيد`/`أحمد سعيد` and
--  `احمد إسماعيل`/`أحمد إسماعيل` were both caught; this third one was not,
--  and it was found by the firm reading a workbook, not by any check here.
-- -------------------------------------------------------------------------
DO $HAMZA$
DECLARE
    target_id integer;
    n         integer;
BEGIN
    --  Identify the person by their EXACT primary spelling, and prove there
    --  is exactly one. Rule 15.
    SELECT p.id INTO target_id FROM people p WHERE p.name_ar = 'أحمد رزق';
    IF target_id IS NULL THEN
        RAISE EXCEPTION 'no person named أحمد رزق (hamza) — the roster is not what this migration expects';
    END IF;

    SELECT count(*) INTO n FROM people WHERE name_ar IN ('أحمد رزق', 'احمد رزق');
    IF n <> 1 THEN
        RAISE EXCEPTION 'expected exactly one رزق person, found % — a duplicate may already exist', n;
    END IF;

    --  The bare-alif spelling must not already be an alias of anyone.
    SELECT count(*) INTO n FROM person_name_alias WHERE alias_ar = 'احمد رزق';
    IF n <> 0 THEN
        RAISE EXCEPTION 'احمد رزق is already an alias (% rows)', n;
    END IF;

    INSERT INTO person_name_alias (person_id, alias_ar, is_primary)
    VALUES (target_id, 'احمد رزق', false);

    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
        RAISE EXCEPTION 'inserting احمد رزق touched % rows, expected 1', n;
    END IF;

    RAISE NOTICE 'احمد رزق added as an alias of أحمد رزق (person %)', target_id;
END
$HAMZA$;

-- -------------------------------------------------------------------------
--  2. AN ALIAS TRUNCATED BY ONE CHARACTER
--
--  The stored alias is `حسن عادل "متدرب` — fifteen characters, ending at ب.
--  The source holds `حسن عادل "متدرب"` — sixteen, ending at the closing
--  quotation mark. One character short, so it never matched, so every
--  hearing carrying it fell into the human pile.
--
--  REPAIR THE ENTRY. DO NOT STRIP QUOTES IN THE NORMALISER. That was tried
--  and rejected: a normaliser loose enough to make `حسن عادل` reach
--  `حسن خلف` matches them through general looseness rather than through the
--  firm's ruling, and a normaliser that loose will merge people it should
--  not. The damage is in one row; fix the one row.
-- -------------------------------------------------------------------------
DO $QUOTE$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM person_name_alias WHERE alias_ar = 'حسن عادل "متدرب';
    IF n <> 1 THEN
        RAISE EXCEPTION 'expected exactly 1 truncated alias حسن عادل "متدرب, found %', n;
    END IF;

    UPDATE person_name_alias
       SET alias_ar = 'حسن عادل "متدرب"'
     WHERE alias_ar = 'حسن عادل "متدرب';

    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
        RAISE EXCEPTION 'repairing the alias touched % rows, expected 1', n;
    END IF;

    --  Both halves, not just the first. "The broken spelling is gone" is
    --  satisfied by deleting it; the repaired one has to be PRESENT.
    SELECT count(*) INTO n FROM person_name_alias WHERE alias_ar = 'حسن عادل "متدرب';
    IF n <> 0 THEN RAISE EXCEPTION 'the truncated alias is still present'; END IF;
    SELECT count(*) INTO n FROM person_name_alias WHERE alias_ar = 'حسن عادل "متدرب"';
    IF n <> 1 THEN RAISE EXCEPTION 'the repaired alias is not present'; END IF;

    RAISE NOTICE 'حسن عادل "متدرب" repaired — its closing quotation mark restored';
END
$QUOTE$;

-- -------------------------------------------------------------------------
--  3. THE ANSWER SHAPES THE FIRM ACTUALLY USED
--
--  Two constraints written before any answer existed turned out to describe
--  a narrower reality than the firm's.
--
--  (a) `open_question` rows are RULE questions, not person questions. The
--      firm answered one "depending on the value", which is the right answer
--      and is not in the four-value list. Free text there; the list still
--      applies everywhere else.
--
--  (b) `person` with no name is INCOMPLETE, not invalid. Two rows came back
--      that way. Refusing them would discard what the firm wrote (rule 7),
--      and inferring the name would be guessing (rule 4). So they are stored
--      as given and REPORTED as incomplete — by Gate 3 and by db:check —
--      until the firm adds the missing word.
-- -------------------------------------------------------------------------
ALTER TABLE quarantine.review_value DROP CONSTRAINT review_firm_answer;
ALTER TABLE quarantine.review_value ADD CONSTRAINT review_firm_answer CHECK (
    firm_answer IS NULL
    OR topic = 'open_question'
    OR firm_answer IN ('person', 'unknown person', 'not a name', 'split')
);

ALTER TABLE quarantine.review_value DROP CONSTRAINT review_person_only_when_person;

COMMENT ON COLUMN quarantine.review_value.firm_person IS
    'Which person, when firm_answer is person or split. May be empty on an answered row: that is an INCOMPLETE answer, reported by Gate 3 and db:check, never filled in by inference.';

DO $SHAPES$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM pg_constraint
     WHERE conrelid = 'quarantine.review_value'::regclass
       AND conname = 'review_person_only_when_person';
    IF n <> 0 THEN RAISE EXCEPTION 'review_person_only_when_person is still present'; END IF;

    SELECT count(*) INTO n FROM pg_constraint
     WHERE conrelid = 'quarantine.review_value'::regclass AND conname = 'review_firm_answer';
    IF n <> 1 THEN RAISE EXCEPTION 'review_firm_answer is missing'; END IF;

    SELECT count(*) INTO n FROM person_name_alias;
    RAISE NOTICE 'aliases now %, answer shapes widened', n;
END
$SHAPES$;
