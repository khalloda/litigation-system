-- =========================================================================
--  0025 — QUARANTINE SCHEMA (task 2.4)
--
--  Rule 7: NOTHING IS EVER DELETED IN MIGRATION. A value that cannot be
--  mapped is parked here with its ORIGINAL TEXT INTACT, never dropped and
--  never guessed at.
--
--  WHAT GATE 3 PROVES
--
--  Every staged row is in exactly ONE of three states:
--
--      clean        nothing was found against it
--      quarantined  at least one finding, recording what deviated and why
--      excluded     deliberately not migrated, with the reason recorded
--
--  A row in NO state is a failure. So is a row in two — a row cannot be both
--  deliberately excluded and queued for review, because those are different
--  answers to the same question and the transform would have to pick one.
--
--  WHY THIS IS A SEPARATE SCHEMA
--
--  `public` is the system. `staging` is the loading dock. `quarantine` is the
--  record of everything the migration could not do cleanly, and it outlives
--  both: when somebody asks in 2028 why a 2013 hearing has no lawyer, the
--  answer is a row in here with the original text still in it.
--
--  Prisma's datasource is `public`, so `schema.prisma` does not describe
--  these tables and `migrate dev` leaves them alone.
-- =========================================================================

CREATE SCHEMA quarantine;
COMMENT ON SCHEMA quarantine IS
    'Stage C of the Access migration. Every deviation found in staging, with the original text intact. Rule 7: nothing is deleted, it is parked. See docs/MIGRATION.md.';

-- -------------------------------------------------------------------------
--  FINDING — one row per deviation, against one staged row.
--
--  A staged row may have several findings: a matter can be missing its client
--  AND carry an unresolvable lawyer. It is quarantined either way; the
--  findings say why, one reason each, rather than one row with a list in it.
-- -------------------------------------------------------------------------
CREATE TABLE quarantine.finding (
    id             bigserial PRIMARY KEY,

    --  The workbook sheet this belongs to. Not a lookup table: these are
    --  named by the profiler and change as the profiling does, unlike the
    --  firm's own lists which are lookups by D8.
    topic          text        NOT NULL,

    --  'review' — the firm must answer this before the transform can proceed.
    --  'note'   — recorded for the record; the transform knows what to do.
    severity       text        NOT NULL,

    src_table      text        NOT NULL,
    src_file       text        NOT NULL,
    src_row_num    integer     NOT NULL,

    --  The column the deviation is in, and the text exactly as Access held
    --  it. original_value IS NULLABLE ON PURPOSE: for a great many findings
    --  the deviation IS that the value is null — a hearing with no matter.
    --  Recording '' there would be a lie about the source.
    column_name    text,
    original_value text,

    --  What is wrong, in a sentence, in the terms the firm uses.
    detail         text        NOT NULL,

    detected_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT finding_severity CHECK (severity IN ('review', 'note')),
    CONSTRAINT finding_detail_not_blank CHECK (btrim(detail) <> ''),
    CONSTRAINT finding_topic_not_blank CHECK (btrim(topic) <> '')
);

CREATE INDEX finding_row ON quarantine.finding (src_table, src_file, src_row_num);
CREATE INDEX finding_topic ON quarantine.finding (topic);

COMMENT ON TABLE quarantine.finding IS
    'One deviation found against one staged row. original_value is nullable because for many findings the deviation is that the value is null.';

-- -------------------------------------------------------------------------
--  EXCLUSION — a row deliberately not migrated.
--
--  Deliberately is the whole word. Every exclusion names a person and a date,
--  because "we decided not to migrate these" with nobody attached is how a
--  decision becomes an accident in hindsight.
-- -------------------------------------------------------------------------
CREATE TABLE quarantine.exclusion (
    src_table   text    NOT NULL,
    src_file    text    NOT NULL,
    src_row_num integer NOT NULL,

    reason      text    NOT NULL,
    decided_by  text    NOT NULL,
    decided_at  date    NOT NULL,

    PRIMARY KEY (src_table, src_file, src_row_num),
    CONSTRAINT exclusion_reason_not_blank CHECK (btrim(reason) <> ''),
    CONSTRAINT exclusion_decided_by_not_blank CHECK (btrim(decided_by) <> '')
);

COMMENT ON TABLE quarantine.exclusion IS
    'A staged row deliberately not migrated, with the reason and the person who decided. Empty is the normal state.';

-- -------------------------------------------------------------------------
--  REVIEW_VALUE — the workbook rows.
--
--  A finding is about a ROW. A review value is about a VALUE, aggregated
--  across every row that carries it: nobody can answer `م. أحمد` 47 times,
--  they answer it once.
--
--  The three firm_* columns are where the answer comes back. They are empty
--  until the firm fills them in, and the workbook is generated FROM this
--  table and read back INTO it.
-- -------------------------------------------------------------------------
CREATE TABLE quarantine.review_value (
    id          bigserial PRIMARY KEY,
    topic       text    NOT NULL,

    --  The original text, exactly as Access holds it. Never trimmed, never
    --  normalised — the firm has to see what is actually there, including a
    --  trailing space that is the whole reason a match failed.
    value       text    NOT NULL,

    occurrences integer NOT NULL,

    --  Context, so the firm can answer WITHOUT OPENING ACCESS. That is the
    --  point of the whole sheet.
    years       text,
    matters     text,
    clients     text,

    --  [{ "name": "...", "score": 0.83, "person_id": 12 }, ...]
    nearest     jsonb   NOT NULL DEFAULT '[]'::jsonb,

    --  Drives the colour. Set by the profiler from the evidence, never by a
    --  human, so that a confident-looking row is confident for a stated
    --  reason.
    confidence  text    NOT NULL,

    --  A hint at what KIND of value this is, when the profiler can tell:
    --  a multi-person string, a placeholder, a title-prefixed name. It is a
    --  hint, not an answer — the firm still decides.
    kind        text,

    --  ---- the firm's answer -------------------------------------------
    firm_answer text,   --  person | unknown person | not a name | split
    firm_person text,   --  which person, when firm_answer = 'person'
    firm_note   text,

    answered_at timestamptz,
    answered_by text,

    UNIQUE (topic, value),
    CONSTRAINT review_confidence CHECK (confidence IN ('exact', 'high', 'medium', 'low', 'none')),
    CONSTRAINT review_occurrences CHECK (occurrences > 0),
    CONSTRAINT review_firm_answer CHECK (
        firm_answer IS NULL OR firm_answer IN ('person', 'unknown person', 'not a name', 'split')
    ),
    --  'unknown person' IS A CORRECT PERMANENT ANSWER, not a gap. It must not
    --  require a person, and it must not be quietly upgraded later by
    --  inference. Rule 4 and rule 15 both land here.
    CONSTRAINT review_person_only_when_person CHECK (
        firm_answer IS DISTINCT FROM 'person' OR btrim(coalesce(firm_person, '')) <> ''
    )
);

CREATE INDEX review_value_topic ON quarantine.review_value (topic);

COMMENT ON TABLE quarantine.review_value IS
    'One row per distinct value needing a human answer, with the context to answer it without opening Access. Becomes one row of one workbook sheet.';

COMMENT ON COLUMN quarantine.review_value.firm_answer IS
    '"unknown person" is a correct permanent answer, not a gap to be filled in later by inference. See CLAUDE.md rules 4 and 15.';

-- -------------------------------------------------------------------------
--  ASSERTIONS
--
--  The properties, not the statements. A CREATE TABLE that ran is proved by
--  the next line failing if it did not.
-- -------------------------------------------------------------------------
DO $QUARANTINE$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM information_schema.tables
     WHERE table_schema = 'quarantine' AND table_type = 'BASE TABLE';
    IF n <> 3 THEN
        RAISE EXCEPTION 'quarantine: % tables, expected 3', n;
    END IF;

    --  Every finding and every exclusion must be able to name the row it is
    --  about. A finding that cannot is not evidence of anything.
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'quarantine'
       AND table_name IN ('finding', 'exclusion')
       AND column_name IN ('src_table', 'src_file', 'src_row_num')
       AND is_nullable = 'YES';
    IF n <> 0 THEN
        RAISE EXCEPTION 'quarantine: % row-identity columns are nullable, expected 0', n;
    END IF;

    --  original_value MUST stay nullable. If somebody ever adds NOT NULL to
    --  it, every finding whose deviation is a null value becomes unrecordable
    --  — and the natural fix is to write '' instead, which is a lie about the
    --  source. Assert the nullability rather than trusting a comment.
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'quarantine' AND table_name = 'finding'
       AND column_name = 'original_value' AND is_nullable = 'YES';
    IF n <> 1 THEN
        RAISE EXCEPTION 'quarantine.finding.original_value must stay nullable';
    END IF;

    RAISE NOTICE 'quarantine: 3 tables, findings and exclusions both row-identified';
END
$QUARANTINE$;
