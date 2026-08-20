-- ============================================================================
--  Litigation Database — Lawyer / Team / Assignment slice
--  Target schema (PostgreSQL 18) + migration logic from Access
-- ============================================================================
--
--  PROBLEM BEING SOLVED
--  --------------------
--  Access attaches lawyers to matters three different ways at once:
--
--    1. الدعاوى.lawyerA / lawyerB   -- Arabic name TEXT, FK by name to المحامين
--                                      896 / 241 matters
--    2. المحامين combination rows    -- 38 rows = 21 people as permutations;
--                                      19 rows are multi-name strings such as
--                                      'ناجي رمضان، محمد عبد العزيز، مؤمن سليم'
--                                      171 matters use one in lawyerA
--    3. الدعاوى.فريق العمل           -- FK to فريق العمل, whose member list is a
--                                      single TEXT blob containing tabs + CRLF
--                                      1,662 matters
--
--  RESOLUTION
--  ----------
--    * `lawyers` (23 rows) is the only real entity table -> becomes canonical.
--    * `المحامين` is a UI pick-list artefact, not data -> DROPPED entirely.
--    * lawyerA / lawyerB / combinations -> one `matter_lawyers` junction.
--    * فريق العمل text blob            -> `teams` + `team_members`.
--    * Team assignment stays a separate FK on the matter: practice-group
--      ownership is a different concept from named responsible lawyers.
-- ============================================================================


-- ============================================================================
--  1. LOOKUPS
-- ============================================================================

CREATE TYPE lawyer_title AS ENUM ('dr', 'mr', 'ms');

-- lead     : primary responsible lawyer (from lawyerA, or first name in a combo)
-- co_lead   : additional lawyer named inside a lawyerA combination string
-- support  : from lawyerB
CREATE TYPE matter_lawyer_role AS ENUM ('lead', 'co_lead', 'support');


-- ============================================================================
--  2. LAWYERS  -- canonical person roster
-- ============================================================================

CREATE TABLE lawyers (
    id                  integer      PRIMARY KEY,          -- from lawyers.LawyerID
    name_ar             text         NOT NULL,
    name_en             text,
    title               lawyer_title,

    -- Access `AttTrack` flag: staff whose attendance is tracked.
    -- Carried forward for the deferred attendance module.
    track_attendance    boolean      NOT NULL DEFAULT false,

    -- Never-assigned staff are retained, not deleted: they are real people and
    -- must remain selectable when the attendance module launches.
    is_active           boolean      NOT NULL DEFAULT true,

    email               text,
    legacy_name_ar      text,        -- original Access string, for audit
    created_at          timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT lawyers_name_ar_unique UNIQUE (name_ar)
);

COMMENT ON TABLE  lawyers IS
    'Canonical lawyer roster. Migrated from Access `lawyers` (23 rows). '
    'The Access table `المحامين` was NOT migrated: it held lawyer combinations, '
    'not people, and is superseded by matter_lawyers.';
COMMENT ON COLUMN lawyers.legacy_name_ar IS
    'Original Access name string. Retained so historical reports and any '
    'un-migrated spreadsheet can still be reconciled by name.';

CREATE INDEX lawyers_active_idx ON lawyers (is_active) WHERE is_active;


-- ============================================================================
--  3. TEAMS  -- normalised from فريق العمل
-- ============================================================================

CREATE TABLE teams (
    id              integer      PRIMARY KEY,              -- from فريق العمل.ID
    code            text,                                  -- 'A' / 'B'
    specialisms     text,                                  -- التخصصات (free text)
    reviewer_id     integer      REFERENCES lawyers (id),  -- المراجع
    is_active       boolean      NOT NULL DEFAULT true,
    created_at      timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON COLUMN teams.specialisms IS
    'Access التخصصات, e.g. "شركات، سوق مال، استثمار، تجاري". Kept as free text '
    'in phase 1; promote to a lookup table only if the business needs to filter '
    'or report by specialism.';

-- Replaces the single TEXT blob that held team members separated by
-- tab and CRLF characters.
CREATE TABLE team_members (
    team_id     integer NOT NULL REFERENCES teams   (id) ON DELETE CASCADE,
    lawyer_id   integer NOT NULL REFERENCES lawyers (id),
    PRIMARY KEY (team_id, lawyer_id)
);


-- ============================================================================
--  4. MATTER  <-> LAWYER  assignment
-- ============================================================================

CREATE TABLE matter_lawyers (
    matter_id       integer             NOT NULL REFERENCES matters (id) ON DELETE CASCADE,
    lawyer_id       integer             NOT NULL REFERENCES lawyers (id),
    role            matter_lawyer_role  NOT NULL,

    -- Ordinal within a combination string, so the original ordering (which
    -- appears to carry seniority) is not lost.
    position        smallint            NOT NULL DEFAULT 1,

    -- The exact Access source string this row was derived from, e.g.
    -- 'ناجي رمضان، هاني الدالي'. Kept for audit and for verifying that
    -- migrated reports reproduce the legacy numbers.
    legacy_source   text,

    PRIMARY KEY (matter_id, lawyer_id, role)
);

CREATE INDEX matter_lawyers_lawyer_idx ON matter_lawyers (lawyer_id);
CREATE INDEX matter_lawyers_role_idx   ON matter_lawyers (matter_id, role);

-- At most one lead per matter.
CREATE UNIQUE INDEX matter_lawyers_one_lead_idx
    ON matter_lawyers (matter_id)
    WHERE role = 'lead';

COMMENT ON TABLE matter_lawyers IS
    'Replaces الدعاوى.lawyerA / lawyerB and the المحامين combination rows. '
    'A matter with no assigned lawyer simply has no rows here — the Access '
    'schema could not distinguish "unassigned" from "blank".';


-- ============================================================================
--  5. MATTER  -- assignment-related columns only
-- ============================================================================
-- Shown for context; the full matters table is defined elsewhere.
--
--   ALTER TABLE matters
--       ADD COLUMN team_id integer REFERENCES teams (id);
--
-- Team assignment is deliberately NOT folded into matter_lawyers. It is
-- populated on 1,662 matters versus 896 for lawyerA, and answers a different
-- question: which practice group owns the matter, not who works it.


-- ============================================================================
--  6. MIGRATION LOGIC
-- ============================================================================

-- ----------------------------------------------------------------------------
--  6.1  Name crosswalk
--       Applied BEFORE loading matter_lawyers. Only two real corrections are
--       needed: 16 distinct people appear on matters and 14 already match.
-- ----------------------------------------------------------------------------

CREATE TEMP TABLE lawyer_name_crosswalk (
    access_name  text PRIMARY KEY,
    lawyer_id    integer,
    action       text
);

INSERT INTO lawyer_name_crosswalk (access_name, lawyer_id, action) VALUES
    -- Spelling duplicate: 'احمد سعيد' is 'أحمد سعيد' without the hamza.
    -- Appears on 3 matters. MERGE into the existing person (LawyerID 5).
    ('احمد سعيد',      5,    'merge_spelling_variant'),

    -- Genuinely absent from the roster. Appears on 2 matters. ADD as a new
    -- lawyer row before loading assignments.
    ('محمد الغرابلي',  NULL, 'add_to_roster'),

    -- Junk placeholder row in Access `lawyers` (LawyerID 15, name '**').
    -- Used by zero matters. DROP; do not migrate.
    ('**',             NULL, 'drop_junk_row');

-- Names present in `المحامين` but never used on any matter — these were
-- pick-list entries that were never selected. Do NOT add to the roster:
--     أحمد الصيرفي, شريف أبو المكارم, منة الله البلتاجي, نهى رضوان
--
-- Roster entries never used on any matter — RETAIN as is_active = false:
--     أحمد رزق, خالد كمال, سامي خطاب, عمر عصام,
--     عمرو صقر, محمد طارق, محمود علي, نيرمين هاني


-- ----------------------------------------------------------------------------
--  6.2  Splitting lawyerA / lawyerB into matter_lawyers
--
--  Pseudocode — run in the ETL layer, not in SQL, so that unresolved names
--  can be routed to a reconciliation queue rather than silently dropped.
--
--    for each matter m:
--
--        # lawyerA -> lead (+ co_lead for any additional names in a combination)
--        if m.lawyerA is not blank:
--            names = split(m.lawyerA, on = ['،', ','])   # Arabic comma AND Latin
--            names = [trim(n) for n in names if trim(n)]
--            for i, n in enumerate(names):
--                lid = resolve(n)                        # crosswalk, then roster
--                if lid is null:
--                    queue_for_review(m.id, n, 'lawyerA'); continue
--                insert matter_lawyers(
--                    matter_id     = m.id,
--                    lawyer_id     = lid,
--                    role          = 'lead' if i == 0 else 'co_lead',
--                    position      = i + 1,
--                    legacy_source = m.lawyerA)
--
--        # lawyerB -> support. No lawyerB value is a combination string
--        # (verified: 0 of 241), but split defensively anyway.
--        if m.lawyerB is not blank:
--            for i, n in enumerate(split(m.lawyerB, on = ['،', ','])):
--                lid = resolve(trim(n))
--                if lid is null:
--                    queue_for_review(m.id, n, 'lawyerB'); continue
--                insert matter_lawyers(
--                    matter_id     = m.id,
--                    lawyer_id     = lid,
--                    role          = 'support',
--                    position      = i + 1,
--                    legacy_source = m.lawyerB)
--
--  Expected volumes:
--      matters with lawyerA        896
--      matters with lawyerB        241
--      lawyerA combination strings 171   -> these produce >1 row each
--      matters with no lawyer      834   -> produce no rows, correctly
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
--  6.3  Splitting the team member blob
--
--  Access stores فريق العمل.الفريق as ONE text field, e.g.
--      '\tإيهاب حمدي\r\nمؤمن سليم\r\nأحمد إسماعيل\r\nأحمد سيف'
--
--    for each team t:
--        for n in split(t.الفريق, on = ['\r\n', '\n']):
--            n = trim(n, strip = ['\t', ' '])
--            if not n: continue
--            lid = resolve(n)
--            if lid is null: queue_for_review(t.ID, n, 'team'); continue
--            insert team_members(team_id = t.ID, lawyer_id = lid)
--
--  Note: teams 1 and 3 both carry code 'A' but have different members and
--  different reviewers, and team 3 is used by only 3 matters. Confirm with the
--  business whether team 3 is a genuine third team or an abandoned duplicate
--  before migrating it.
-- ----------------------------------------------------------------------------


-- ============================================================================
--  7. VALIDATION — run after load, compare against Access
-- ============================================================================

-- 7.1  Matters with a named lead should equal the Access lawyerA count (896).
SELECT count(DISTINCT matter_id) AS matters_with_lead
FROM   matter_lawyers
WHERE  role = 'lead';

-- 7.2  Matters with a support lawyer should equal the lawyerB count (241).
SELECT count(DISTINCT matter_id) AS matters_with_support
FROM   matter_lawyers
WHERE  role = 'support';

-- 7.3  Per-lawyer matter counts. Compare against the legacy figures:
--        إيهاب حمدي 476, ناجي رمضان 200, هاني الدالي 181,
--        أحمد سعيد 126 (+3 merged from the spelling variant = 129),
--        محمد عبد العزيز 124, أحمد إسماعيل 85, محمود شعبان 41, ...
SELECT l.name_ar,
       l.name_en,
       count(DISTINCT ml.matter_id) AS matters
FROM   lawyers l
JOIN   matter_lawyers ml ON ml.lawyer_id = l.id
GROUP  BY l.id, l.name_ar, l.name_en
ORDER  BY matters DESC;

-- 7.4  Nothing should have been silently dropped.
SELECT count(*) AS unresolved_names FROM migration_review_queue;


-- ============================================================================
--  8. WHAT THIS UNLOCKS IN REPORTING
-- ============================================================================
-- The Access reports hub carries two separately-maintained reports:
--     بالاشتراك مع محامي آخر   -- matters shared with another lawyer
--     بدون اشتراك مع محامي آخر -- matters not shared
-- They exist as two reports only because the old schema could not count the
-- lawyers on a matter. They now collapse into one parameterised query:

-- Matters shared with another lawyer:
SELECT matter_id
FROM   matter_lawyers
GROUP  BY matter_id
HAVING count(*) > 1;

-- Matters handled by a single lawyer:
SELECT matter_id
FROM   matter_lawyers
GROUP  BY matter_id
HAVING count(*) = 1;

-- The per-lawyer workload reports simplify the same way: they no longer need
-- to check two columns and parse combination strings to attribute a matter.
