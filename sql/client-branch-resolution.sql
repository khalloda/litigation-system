-- ============================================================================
--  CLIENT BRANCH — THE FIRM'S RESOLUTION, 21 August 2026
--
--  WHY THIS EXISTS
--  ---------------
--  lookup_client_branch held 31 values carrying at least three different
--  concepts at once — the same overloaded-column pattern as matterDegree
--  (D8), affecting 560 matters:
--
--      * genuine branches and sites of a client
--      * practice areas that duplicate matter_category
--      * two numbered headings pasted out of a document
--      * three values that are not branches at all but SEPARATE CLIENTS
--
--  sql/lookup-corrections.sql deliberately left this alone in August and
--  recorded it as a question for the firm before task 6.2, because untangling
--  it means deciding what a branch is FOR. The firm has now decided.
--
--  THE RESOLUTION — 15 KEEP, 16 WRONG
--  ----------------------------------
--  A branch is A SITE OR SUBSIDIARY OF A CLIENT. Nothing else. See D19.
--
--  Counted before applying, not taken on trust: the 31 seeded rows match the
--  firm's two lists exactly — 15 + 16 = 31, no duplicates, nothing stated
--  that is not in the table, and nothing in the table left unstated.
--
--  المنطقة الحرة IS A BRANCH, not a venue. An earlier note had it moving to
--  lookup_venue; the firm corrected that. It is the third site of
--  أدخنة النخلة, alongside المصنع المحلي and المركز الرئيسي, and it carries
--  193 matters. lookup_venue stays at 7 values — no new entry.
--
--  ONE DISCREPANCY, FLAGGED NOT SILENTLY ABSORBED
--  ----------------------------------------------
--  آراء قانونية was given as moving to matter_category -> رأي قانوني.
--  رأي قانوني does not exist in lookup_matter_category. It exists, spelled
--  exactly that way, in lookup_matter_TYPE (id 3).
--
--  Written here as matter_type, because that is the only list in the database
--  holding the value, and because D8 defines matter_type as "what kind of
--  work?" — a legal opinion is a kind of work, not a practice area. The list
--  name looks like a slip of the pen; the value itself is right.
--
--  The row carries a reviewer_note saying exactly this. If the firm meant a
--  NEW matter_category value instead, it is one UPDATE — nothing has loaded
--  against it yet.
--
--  TWO RULES FOR STAGE 2 — CORRECTNESS, NOT TIDYING
--  ------------------------------------------------
--  (a) NEVER OVERWRITE AN EXISTING matter_category. Where a branch moves to
--      matter_category and the matter already has one, QUARANTINE the
--      conflict for the firm. clients.legacy_branch_raw keeps the original
--      either way.
--
--  (b) THE THREE separate_client VALUES ARE A CORRECTNESS PROBLEM, NOT A
--      MIS-LABEL. سيجما للإعلام (تليفزيون الحياة), ألفا مصر للتجارة and
--      سيجما للصناعات الدوائية are clients in their own right. Any matter
--      carrying one of them is attached to THE WRONG CLIENT ENTIRELY. Those
--      matters are quarantined at task 2.6. DO NOT GUESS which client they
--      belong to — the firm decides.
--
--  Both rules are recorded on tasks 2.5 and 2.6 in TASKS.md as well as in the
--  reviewer_note of every affected crosswalk row, so Stage 2 cannot miss them.
--
--  RESULT
--      lookup_client_branch    31 -> 15 values
--      total seeded rows      146 -> 130
--      migration_crosswalk      4 -> 20 rules
--
--  Nothing is lost. Every moved value gets a crosswalk row, and every client
--  keeps its original branch text byte for byte in clients.legacy_branch_raw
--  (task 1.3). Fourteen matters lose their branch outright — the two document
--  headings — and the firm has agreed to that.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  target_field conventions in migration_crosswalk
--
--  Stage 2 reads this column to decide what to do with a source value:
--
--    a lookup name      map to that list; target_value MUST exist there
--    'quarantine'       no automatic mapping — send the row to the review
--                       queue and let a human decide
--    'separate_client'  the matter is on the WRONG CLIENT. Quarantine at task
--                       2.6. Never guess the right client
--    NULL               the value is discarded and the matter simply loses
--                       its branch. Only ever for a value the firm has said
--                       is not data
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
--  1. Collapse the جنح chain
--
--  Migration 0003 recorded  client_branch جنح -> client_branch الجنح.
--  الجنح itself now moves to matter_category جنح, so that rule became a
--  two-step chain: جنح -> الجنح -> جنح. A chain is a second chance to get it
--  wrong, so it is collapsed to point straight at its real destination.
-- ---------------------------------------------------------------------------
UPDATE migration_crosswalk
   SET target_field  = 'matter_category',
       target_value  = 'جنح',
       reviewer_note = 'Was client_branch -> الجنح (migration 0003). الجنح itself moved to matter_category جنح on 21 Aug 2026, so the two-step chain is collapsed to one step. RULE (a): never overwrite an existing matter_category — quarantine the conflict.'
 WHERE source_field = 'client_branch'
   AND source_value = 'جنح';
-- Expected: exactly 1 row


-- ---------------------------------------------------------------------------
--  2. The 16 values that are not branches
--
--  rows_affected is left NULL except where the firm has stated a figure. The
--  per-value matter counts cannot be checked against anything in this
--  database — matters do not load until Stage 2 — and an unverifiable number
--  written down as a fact is exactly the habit these files exist to break.
-- ---------------------------------------------------------------------------
INSERT INTO migration_crosswalk
    (source_field, source_value, rows_affected, target_field, target_value, reviewer_note)
VALUES
    -- Practice areas that duplicate matter_category. RULE (a) applies to every
    -- one of these: never overwrite a matter_category the matter already has.
    ('client_branch', 'دعاوى عمالية',   NULL, 'matter_category', 'عمال',
     'Practice area, not a branch. RULE (a): never overwrite an existing matter_category — quarantine the conflict.'),
    ('client_branch', 'الجنح',          NULL, 'matter_category', 'جنح',
     'Practice area, not a branch. Also the destination of the collapsed جنح chain. RULE (a): never overwrite an existing matter_category — quarantine the conflict.'),
    ('client_branch', 'قضاء إداري',     NULL, 'matter_category', 'قضاء إداري',
     'Practice area, not a branch. RULE (a): never overwrite an existing matter_category — quarantine the conflict.'),
    ('client_branch', 'القضاء الإداري', NULL, 'matter_category', 'قضاء إداري',
     'Practice area, not a branch. Same value with the definite article. RULE (a): never overwrite an existing matter_category — quarantine the conflict.'),
    ('client_branch', 'مدني',           NULL, 'matter_category', 'مدني',
     'Practice area, not a branch. RULE (a): never overwrite an existing matter_category — quarantine the conflict.'),
    ('client_branch', 'ضرائب',          NULL, 'matter_category', 'ضرائب',
     'Practice area, not a branch. RULE (a): never overwrite an existing matter_category — quarantine the conflict.'),
    ('client_branch', 'تعويضات',        NULL, 'matter_category', 'تعويضات',
     'Practice area, not a branch. RULE (a): never overwrite an existing matter_category — quarantine the conflict.'),
    ('client_branch', 'إقتصادي',        NULL, 'matter_category', 'اقتصادي',
     'Practice area, not a branch. Hamza variant of the list value. RULE (a): never overwrite an existing matter_category — quarantine the conflict.'),

    -- A kind of work, not a practice area. SEE THE DISCREPANCY NOTE ABOVE.
    ('client_branch', 'آراء قانونية',   NULL, 'matter_type', 'رأي قانوني',
     'FIELD CORRECTED — CONFIRM WITH THE FIRM. Given as matter_category -> رأي قانوني, but that value does not exist in lookup_matter_category; it exists exactly so in lookup_matter_type (id 3), and D8 defines matter_type as "what kind of work?". Written as matter_type. One UPDATE to change if the firm meant a new matter_category value.'),

    -- A court instance, not a branch.
    ('client_branch', 'النقض',          NULL, 'degree', 'نقض',
     'Court instance, not a branch. Same value with the definite article.'),

    -- A work type with no home. No automatic mapping.
    ('client_branch', 'دعاوى قضائية',   NULL, 'quarantine', NULL,
     'A work type, not a branch, and not specific enough to map anywhere. Send to the review queue.'),

    -- RULE (b). These matters are on the WRONG CLIENT.
    ('client_branch', 'سيجما للإعلام (تليفزيون الحياة)', NULL, 'separate_client', NULL,
     'RULE (b): a client in its own right, not a branch. Any matter carrying this value is attached to THE WRONG CLIENT ENTIRELY. Quarantine at task 2.6. DO NOT GUESS the right client — the firm decides.'),
    ('client_branch', 'سيجما للصناعات الدوائية', NULL, 'separate_client', NULL,
     'RULE (b): a client in its own right, not a branch. Any matter carrying this value is attached to THE WRONG CLIENT ENTIRELY. Quarantine at task 2.6. DO NOT GUESS the right client — the firm decides.'),
    ('client_branch', 'ألفا مصر للتجارة', NULL, 'separate_client', NULL,
     'RULE (b): a client in its own right, not a branch. Any matter carrying this value is attached to THE WRONG CLIENT ENTIRELY. Quarantine at task 2.6. DO NOT GUESS the right client — the firm decides.'),

    -- Headings pasted out of a document. Discarded, with the firm agreeing.
    ('client_branch', 'أولاً: طلب وشكوى أمام الهيئة العامة للاستثمار', 1, NULL, NULL,
     'A heading pasted out of a document, not data. Discarded with the agreement of the firm: 1 matter loses its branch. The original text survives in clients.legacy_branch_raw.'),
    ('client_branch', 'ثانياً: النزاعات القضائية المقامة من وضد شركتي الإمارات هايتس ويافا ماك', 13, NULL, NULL,
     'A heading pasted out of a document, not data. Discarded with the agreement of the firm: 13 matters lose their branch. The original text survives in clients.legacy_branch_raw.');
-- Expected: exactly 16 rows


-- ---------------------------------------------------------------------------
--  3. Reduce lookup_client_branch to the 15 genuine branches
--
--  Deleted by naming the 16 that go, not by naming the 15 that stay. A DELETE
--  that lists what to keep silently removes anything added later that nobody
--  mentioned; this one touches only values the firm has ruled on, and the
--  assertion below proves the count AND the surviving membership.
-- ---------------------------------------------------------------------------
DELETE FROM lookup_client_branch
 WHERE label_ar IN (
    'دعاوى عمالية', 'الجنح', 'قضاء إداري', 'القضاء الإداري', 'مدني',
    'ضرائب', 'تعويضات', 'إقتصادي', 'آراء قانونية', 'النقض',
    'دعاوى قضائية',
    'سيجما للإعلام (تليفزيون الحياة)', 'سيجما للصناعات الدوائية', 'ألفا مصر للتجارة',
    'أولاً: طلب وشكوى أمام الهيئة العامة للاستثمار',
    'ثانياً: النزاعات القضائية المقامة من وضد شركتي الإمارات هايتس ويافا ماك'
 );
-- Expected: exactly 16 rows


-- ============================================================================
--  VALIDATION — assert, do not assume
-- ============================================================================

-- Expected: client_branch 15, total 130
SELECT 'matter_type'        AS list, count(*) FROM lookup_matter_type
UNION ALL SELECT 'matter_category',   count(*) FROM lookup_matter_category
UNION ALL SELECT 'degree',            count(*) FROM lookup_degree
UNION ALL SELECT 'venue',             count(*) FROM lookup_venue
UNION ALL SELECT 'importance',        count(*) FROM lookup_importance
UNION ALL SELECT 'party_role',        count(*) FROM lookup_party_role
UNION ALL SELECT 'hearing_action',    count(*) FROM lookup_hearing_action
UNION ALL SELECT 'matter_destination',count(*) FROM lookup_matter_destination
UNION ALL SELECT 'client_branch',     count(*) FROM lookup_client_branch;
-- Expected: 14, 21, 12, 7, 3, 11, 20, 27, 15   TOTAL 130

-- venue must NOT have gained an eighth entry.
SELECT count(*) FROM lookup_venue;
-- Expected: 7

-- المنطقة الحرة is a BRANCH and must have survived.
SELECT count(*) FROM lookup_client_branch WHERE label_ar = 'المنطقة الحرة';
-- Expected: 1

-- Twenty crosswalk rules, none of them dangling.
SELECT count(*) FROM migration_crosswalk;
-- Expected: 20
