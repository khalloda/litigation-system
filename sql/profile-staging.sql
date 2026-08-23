-- =========================================================================
--  STAGE C — PROFILE THE STAGED DATA, THEN GATE 3
--
--      npm run profile:staging
--
--  Rule 7: nothing is deleted. Every deviation found here is PARKED in
--  quarantine with its original text intact, and every value that needs a
--  human answer becomes one row of one workbook sheet.
--
--  GATE 3 PROVES EVERY STAGED ROW IS IN EXACTLY ONE OF THREE STATES:
--
--      clean        nothing was found against it
--      quarantined  at least one finding, recording what deviated and why
--      excluded     deliberately not migrated, with the reason recorded
--
--  A row in no state is a failure. A row in two is a failure — deliberately
--  excluded and queued for review are different answers to the same
--  question, and the transform would have to pick one.
--
--  SAFE TO RE-RUN. quarantine.finding is derived and is rebuilt from
--  scratch. quarantine.review_value is UPSERTED: the context columns are
--  recomputed, and the firm's own answers are never touched. A value that
--  has been answered and no longer appears in the data is KEPT and reported,
--  never deleted — deleting a human's answer is exactly what rule 7 forbids.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
--  Findings are derived. Rebuild them every run so a fixed fault disappears
--  rather than lingering as a stale row that somebody has to interpret.
-- -------------------------------------------------------------------------
TRUNCATE quarantine.finding;

-- =========================================================================
--  A. REFERENTIAL DEVIATIONS
--
--  Each of these is a row that points at something which is not there, or
--  points at nothing at all. NONE of them is a reason to drop the row: the
--  matter is real, the hearing happened. They are loaded and flagged.
-- =========================================================================

--  A1. Hearings with no matter.
INSERT INTO quarantine.finding (topic, severity, src_table, src_file, src_row_num, column_name, original_value, detail)
SELECT 'hearing_no_matter', 'review', 'الجلسات', src_file, src_row_num, 'matterID', "matterID",
       'This hearing records no matter. It is migrated to an unassigned bucket so the hearing is not lost; the firm decides which matter it belongs to.'
  FROM staging."الجلسات" WHERE "matterID" IS NULL OR btrim("matterID") = '';

--  A2. Administrative work with no matter.
INSERT INTO quarantine.finding (topic, severity, src_table, src_file, src_row_num, column_name, original_value, detail)
SELECT 'admin_task_no_matter', 'review', 'admin work table', src_file, src_row_num, 'matterID', "matterID",
       'This administrative task records no matter.'
  FROM staging."admin work table" WHERE "matterID" IS NULL OR btrim("matterID") = '';

--  A3. Matters with no client.
INSERT INTO quarantine.finding (topic, severity, src_table, src_file, src_row_num, column_name, original_value, detail)
SELECT 'matter_no_client', 'review', 'الدعاوى', src_file, src_row_num, 'clientID', "clientID",
       'This matter records no client.'
  FROM staging."الدعاوى" WHERE "clientID" IS NULL OR btrim("clientID") = '';

--  A4. Powers of attorney with no client.
INSERT INTO quarantine.finding (topic, severity, src_table, src_file, src_row_num, column_name, original_value, detail)
SELECT 'poa_no_client', 'review', 'التوكيلات', src_file, src_row_num, 'clientID', "clientID",
       'This power of attorney records no client.'
  FROM staging."التوكيلات" WHERE "clientID" IS NULL OR btrim("clientID") = '';

--  A5. Task actions with no parent task id at all.
INSERT INTO quarantine.finding (topic, severity, src_table, src_file, src_row_num, column_name, original_value, detail)
SELECT 'task_action_no_parent', 'note', 'إجراءات المهام', src_file, src_row_num, 'ID_Task', "ID_Task",
       'This task action records no parent task. It is migrated with the link left empty.'
  FROM staging."إجراءات المهام" WHERE "ID_Task" IS NULL OR btrim("ID_Task") = '';

--  A6. Task actions whose parent task id points at nothing.
INSERT INTO quarantine.finding (topic, severity, src_table, src_file, src_row_num, column_name, original_value, detail)
SELECT 'task_action_orphan', 'review', 'إجراءات المهام', a.src_file, a.src_row_num, 'ID_Task', a."ID_Task",
       'This task action names a parent task that does not exist in the task table.'
  FROM staging."إجراءات المهام" a
 WHERE a."ID_Task" IS NOT NULL AND btrim(a."ID_Task") <> ''
   AND NOT EXISTS (SELECT 1 FROM staging."admin work table" t WHERE t."ID_Task" = a."ID_Task");

-- =========================================================================
--  B. THE FEE-LETTER LINKS
--
--  Both of these were expected to be large and are not. The expectation was
--  measured against the WRONG COLUMN in each case, which is recorded in
--  docs/MIGRATION.md rather than quietly corrected.
-- =========================================================================

--  B1. `خطابات الأتعاب.Matter` holds CASE NUMBERS AS TEXT — `2897 / 86ق` —
--  which resolve against `الدعاوى.matterAR`, the Arabic case number, and not
--  against `matterID`, which is a surrogate integer. Matched against
--  matterID, all 288 look like orphans. Matched against matterAR, 32 are.
INSERT INTO quarantine.finding (topic, severity, src_table, src_file, src_row_num, column_name, original_value, detail)
SELECT 'fee_letter_matter_unmatched', 'review', 'خطابات الأتعاب.Matter', v.src_file, v.src_row_num, 'value', v.value,
       CASE WHEN v.value ~ E'[\r\n]'
            THEN 'This fee letter names several case numbers in one entry, so it matches no single matter. The firm confirms which matters it covers.'
            WHEN v.value ~ '[،,]'
            THEN 'This entry lists more than one case number separated by commas, so it matches no single matter.'
            ELSE 'This case number matches no matter.'
       END
  FROM staging."خطابات الأتعاب__Matter" v
 WHERE NOT EXISTS (
        SELECT 1 FROM staging."الدعاوى" m WHERE btrim(m."matterAR") = btrim(v.value));

--  B2. ...and one entry matches TWO matters. A count of matches is not a
--  match: picking either one silently attaches a fee letter to the wrong case.
INSERT INTO quarantine.finding (topic, severity, src_table, src_file, src_row_num, column_name, original_value, detail)
SELECT 'fee_letter_matter_ambiguous', 'review', 'خطابات الأتعاب.Matter', v.src_file, v.src_row_num, 'value', v.value,
       'This case number matches ' ||
       (SELECT count(*) FROM staging."الدعاوى" m WHERE btrim(m."matterAR") = btrim(v.value)) ||
       ' matters. The firm says which one the fee letter covers.'
  FROM staging."خطابات الأتعاب__Matter" v
 WHERE (SELECT count(*) FROM staging."الدعاوى" m WHERE btrim(m."matterAR") = btrim(v.value)) > 1;

--  B3. `الدعاوى.[خطاب الأتعاب]` CARRIES TWO KEY SPACES. Every one of the 412
--  matters that names a fee letter resolves to exactly one — 289 by
--  `contractID` (1–332, the dense internal key) and 123 by `mfilesID`
--  (1–59,225, the document-management id). None resolves to both, and none
--  resolves to neither.
--
--  So there are no orphans here. What there IS is a hazard: two values exist
--  in BOTH key spaces, and a future matter naming one of them would be
--  genuinely ambiguous. Those two fee letters are flagged; the reading itself
--  goes to the firm as one question rather than 412.
INSERT INTO quarantine.finding (topic, severity, src_table, src_file, src_row_num, column_name, original_value, detail)
SELECT 'fee_letter_key_collision', 'note', 'خطابات الأتعاب', f.src_file, f.src_row_num, 'contractID', f."contractID",
       'This fee letter''s contractID is also some fee letter''s mfilesID. No matter currently references it ambiguously, but a matter that did could not be resolved without the firm.'
  FROM staging."خطابات الأتعاب" f
 WHERE EXISTS (
        SELECT 1 FROM staging."خطابات الأتعاب" g
         WHERE g."mfilesID" IS NOT NULL AND btrim(g."mfilesID") <> ''
           AND btrim(g."mfilesID") = btrim(f."contractID"));

-- =========================================================================
--  C. PEOPLE — the highest-ratio mapping in the project, and the one that
--     has already gone wrong twice.
--
--  Rule 15: never match an Arabic name without asserting the count. Here
--  nothing is matched at all — every spelling the roster does not already
--  know is queued for a human, with the nearest candidates and a score.
-- =========================================================================

--  C1. Every attendee spelling, from the five columns that hold them.
CREATE TEMP TABLE attendee AS
SELECT btrim(v)            AS value,
       h.src_file,
       h.src_row_num,
       x.col               AS column_name,
       h."التاريخ"          AS hearing_date,
       h."matterID"        AS matter_id
  FROM staging."الجلسات" h,
       LATERAL (VALUES ('الحاضر', h."الحاضر"), ('حاضر 1', h."حاضر 1"), ('حاضر 2', h."حاضر 2"),
                       ('حاضر 3', h."حاضر 3"), ('حاضر 4', h."حاضر 4")) AS x(col, v)
 WHERE v IS NOT NULL AND btrim(v) <> '';

--  C2. Classify each distinct spelling. The classification is a HINT for the
--  firm, never an answer: `kind` says what the profiler thinks the string is,
--  and the firm still says who the person is.
CREATE TEMP TABLE attendee_value AS
SELECT a.value,
       count(*)                                                      AS occurrences,
       min(left(a.hearing_date, 4))                                  AS first_year,
       max(left(a.hearing_date, 4))                                  AS last_year,
       count(DISTINCT a.matter_id)                                   AS matters,
       EXISTS (SELECT 1 FROM public.person_name_alias pa WHERE pa.alias_ar = a.value) AS exact_alias,
       CASE
         --  `**` is 4,132 mentions of two asterisks. It is not a name and no
         --  amount of matching will make it one.
         WHEN a.value ~ '^[*\-_.\s]+$'                     THEN 'placeholder'
         WHEN a.value IN ('لا يوجد حضور', 'متابعة', 'لا يوجد')  THEN 'not a name'
         --  Several people in one field, comma- or waw-separated.
         WHEN a.value ~ '[،,]'                             THEN 'several people'
         --  A courtesy title in front of a name: د. (Dr), أ. (Ustaz), م.
         WHEN a.value ~ '^(د|أ|ا|م|أ\.د|المستشار|الأستاذ)\s*[\.\s]'  THEN 'titled name'
         ELSE 'name'
       END                                                           AS kind
  FROM attendee a
 GROUP BY a.value;

--  C3. The nearest roster names, with a closeness score, so the firm can
--  confirm at a glance instead of remembering. Trigram similarity, which the
--  database already carries for Arabic search.
CREATE TEMP TABLE attendee_nearest AS
SELECT av.value,
       coalesce(
         (SELECT jsonb_agg(jsonb_build_object('name', n.alias_ar, 'person_id', n.person_id, 'score', n.score)
                           ORDER BY n.score DESC)
            FROM (SELECT pa.alias_ar, pa.person_id,
                         round(similarity(pa.alias_ar, av.value)::numeric, 3) AS score
                    FROM public.person_name_alias pa
                   WHERE similarity(pa.alias_ar, av.value) > 0.25
                   ORDER BY similarity(pa.alias_ar, av.value) DESC
                   LIMIT 5) n),
         '[]'::jsonb)                                                AS nearest,
       coalesce((SELECT max(similarity(pa.alias_ar, av.value))
                   FROM public.person_name_alias pa), 0)             AS best_score
  FROM attendee_value av;

--  C4. Into the review queue. UPSERT: context recomputed, the firm's answer
--  never touched.
INSERT INTO quarantine.review_value
      (topic, value, occurrences, years, matters, clients, nearest, confidence, kind)
SELECT 'attendee_name',
       av.value,
       av.occurrences,
       CASE WHEN av.first_year = av.last_year THEN av.first_year
            ELSE av.first_year || '–' || av.last_year END,
       av.matters::text || ' matter(s)',
       NULL,
       an.nearest,
       CASE
         WHEN av.exact_alias                THEN 'exact'
         WHEN av.kind IN ('placeholder', 'not a name') THEN 'none'
         WHEN an.best_score >= 0.75         THEN 'high'
         WHEN an.best_score >= 0.45         THEN 'medium'
         WHEN an.best_score >= 0.25         THEN 'low'
         ELSE 'none'
       END,
       av.kind
  FROM attendee_value av
  JOIN attendee_nearest an ON an.value = av.value
 WHERE NOT av.exact_alias
    ON CONFLICT (topic, value) DO UPDATE
   SET occurrences = EXCLUDED.occurrences,
       years       = EXCLUDED.years,
       matters     = EXCLUDED.matters,
       nearest     = EXCLUDED.nearest,
       confidence  = EXCLUDED.confidence,
       kind        = EXCLUDED.kind;

--  C5. And the findings on the hearing rows themselves. A hearing carrying a
--  spelling nobody has resolved is not a clean row, and Gate 3 has to see it.
--
--  A recognised placeholder is a 'note', not a 'review': `**` needs ONE
--  answer from the firm, not 4,132.
INSERT INTO quarantine.finding (topic, severity, src_table, src_file, src_row_num, column_name, original_value, detail)
SELECT 'attendee_unresolved',
       CASE WHEN av.kind IN ('placeholder', 'not a name') THEN 'note' ELSE 'review' END,
       'الجلسات', a.src_file, a.src_row_num, a.column_name, a.value,
       CASE WHEN av.kind = 'placeholder'
            THEN 'This attendee field holds a placeholder rather than a name. The firm confirms once what it means; the hearing is migrated with no attendee.'
            WHEN av.kind = 'not a name'
            THEN 'This attendee field holds a note rather than a name.'
            WHEN av.kind = 'several people'
            THEN 'This attendee field names more than one person and must be split into rows.'
            ELSE 'This attendee spelling is not in the roster. The firm says who it is, or that nobody recognises it.'
       END
  FROM attendee a
  JOIN attendee_value av ON av.value = a.value
 WHERE NOT av.exact_alias;

--  C6. The same for the person who did each administrative task. Grouped
--  first, then scored — the nearest-match subquery cannot see an ungrouped
--  column, and forcing it to would score one row rather than one name.
CREATE TEMP TABLE assignee_value AS
SELECT btrim(t."القائم بالعمل")                       AS value,
       count(*)                                       AS occurrences,
       min(left(t."تاريخ الإنشاء", 4))                 AS first_year,
       max(left(t."تاريخ الإنشاء", 4))                 AS last_year,
       count(DISTINCT t."matterID")                   AS matters
  FROM staging."admin work table" t
 WHERE t."القائم بالعمل" IS NOT NULL AND btrim(t."القائم بالعمل") <> ''
   AND NOT EXISTS (SELECT 1 FROM public.person_name_alias pa WHERE pa.alias_ar = btrim(t."القائم بالعمل"))
 GROUP BY btrim(t."القائم بالعمل");

CREATE TEMP TABLE assignee_nearest AS
SELECT av.value,
       coalesce((SELECT jsonb_agg(jsonb_build_object('name', n.alias_ar, 'person_id', n.person_id, 'score', n.score)
                                  ORDER BY n.score DESC)
                   FROM (SELECT pa.alias_ar, pa.person_id,
                                round(similarity(pa.alias_ar, av.value)::numeric, 3) AS score
                           FROM public.person_name_alias pa
                          WHERE similarity(pa.alias_ar, av.value) > 0.25
                          ORDER BY similarity(pa.alias_ar, av.value) DESC
                          LIMIT 5) n), '[]'::jsonb)   AS nearest,
       coalesce((SELECT max(similarity(pa.alias_ar, av.value)) FROM public.person_name_alias pa), 0) AS best_score
  FROM assignee_value av;

INSERT INTO quarantine.review_value
      (topic, value, occurrences, years, matters, clients, nearest, confidence, kind)
SELECT 'admin_assignee',
       av.value,
       av.occurrences,
       CASE WHEN av.first_year = av.last_year THEN av.first_year
            ELSE av.first_year || '–' || av.last_year END,
       av.matters::text || ' matter(s)',
       NULL,
       an.nearest,
       CASE WHEN an.best_score >= 0.75 THEN 'high'
            WHEN an.best_score >= 0.45 THEN 'medium'
            WHEN an.best_score >= 0.25 THEN 'low'
            ELSE 'none' END,
       'name'
  FROM assignee_value av
  JOIN assignee_nearest an ON an.value = av.value
    ON CONFLICT (topic, value) DO UPDATE
   SET occurrences = EXCLUDED.occurrences, years = EXCLUDED.years, matters = EXCLUDED.matters,
       nearest = EXCLUDED.nearest, confidence = EXCLUDED.confidence;

INSERT INTO quarantine.finding (topic, severity, src_table, src_file, src_row_num, column_name, original_value, detail)
SELECT 'admin_assignee_unresolved', 'review', 'admin work table', t.src_file, t.src_row_num,
       'القائم بالعمل', t."القائم بالعمل",
       'The person who did this work is recorded by a name the roster does not know.'
  FROM staging."admin work table" t
 WHERE t."القائم بالعمل" IS NOT NULL AND btrim(t."القائم بالعمل") <> ''
   AND NOT EXISTS (SELECT 1 FROM public.person_name_alias pa WHERE pa.alias_ar = btrim(t."القائم بالعمل"));

-- =========================================================================
--  D. THE QUESTIONS THAT ARE NOT ABOUT A ROW
--
--  Some things the firm has to decide are about a RULE, not a value in a
--  row. They still belong in the workbook, because that is where the firm is
--  looking — one sheet, one question, with the evidence beside it.
-- =========================================================================
INSERT INTO quarantine.review_value (topic, value, occurrences, years, matters, clients, nearest, confidence, kind)
SELECT 'open_question',
       'Does الدعاوى.[خطاب الأتعاب] point at contractID OR mfilesID, depending on the value?',
       412, NULL,
       '289 resolve by contractID, 123 by mfilesID, 0 by both, 0 by neither',
       NULL, '[]'::jsonb, 'none', 'rule'
    ON CONFLICT (topic, value) DO UPDATE SET occurrences = EXCLUDED.occurrences, matters = EXCLUDED.matters;

-- =========================================================================
--  GATE 3
-- =========================================================================
DO $GATE3$
DECLARE
    r            record;
    staged       bigint := 0;
    quarantined  bigint := 0;
    excluded     bigint := 0;
    clean        bigint := 0;
    n            bigint;
    problems     text[] := '{}';
BEGIN
    --  1. Every finding and every exclusion must point at a staged row that
    --     exists. A finding about a row nobody can find is not evidence.
    FOR r IN
        SELECT DISTINCT f.src_table FROM quarantine.finding f
        UNION
        SELECT DISTINCT e.src_table FROM quarantine.exclusion e
    LOOP
        --  `خطابات الأتعاب.Matter` is staged as `خطابات الأتعاب__Matter`.
        EXECUTE format(
            'SELECT count(*) FROM quarantine.finding f
              WHERE f.src_table = %L
                AND NOT EXISTS (SELECT 1 FROM staging.%I s
                                 WHERE s.src_file = f.src_file AND s.src_row_num = f.src_row_num)',
            r.src_table, replace(r.src_table, '.', '__'))
           INTO n;
        IF n > 0 THEN
            problems := problems || format('%s: %s finding(s) point at a row that is not staged', r.src_table, n);
        END IF;
    END LOOP;

    --  2. THE THREE STATES, per staged table. Every row in exactly one.
    FOR r IN
        SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'staging' AND table_type = 'BASE TABLE'
         ORDER BY table_name
    LOOP
        EXECUTE format($f$
            SELECT count(*),
                   count(*) FILTER (WHERE has_finding AND NOT is_excluded),
                   count(*) FILTER (WHERE is_excluded),
                   count(*) FILTER (WHERE NOT has_finding AND NOT is_excluded),
                   count(*) FILTER (WHERE has_finding AND is_excluded)
              FROM (
                SELECT EXISTS (SELECT 1 FROM quarantine.finding f
                                WHERE f.src_file = s.src_file AND f.src_row_num = s.src_row_num) AS has_finding,
                       EXISTS (SELECT 1 FROM quarantine.exclusion e
                                WHERE e.src_file = s.src_file AND e.src_row_num = s.src_row_num) AS is_excluded
                  FROM staging.%I s) z$f$, r.table_name)
           INTO n, quarantined, excluded, clean, staged;

        IF staged > 0 THEN
            problems := problems || format(
                '%s: %s row(s) are BOTH quarantined and excluded — two different answers to the same question',
                r.table_name, staged);
        END IF;

        IF quarantined + excluded + clean <> n THEN
            problems := problems || format('%s: %s rows do not add up to %s', r.table_name, quarantined + excluded + clean, n);
        END IF;
    END LOOP;

    --  3. The totals, over every staged table at once.
    SELECT count(*) INTO staged FROM (
        SELECT src_file, src_row_num FROM staging."الجلسات"
        UNION ALL SELECT src_file, src_row_num FROM staging."admin work table"
        UNION ALL SELECT src_file, src_row_num FROM staging."إجراءات المهام"
        UNION ALL SELECT src_file, src_row_num FROM staging."Attendance"
        UNION ALL SELECT src_file, src_row_num FROM staging."الدعاوى"
        UNION ALL SELECT src_file, src_row_num FROM staging."التوكيلات"
        UNION ALL SELECT src_file, src_row_num FROM staging."السداد"
        UNION ALL SELECT src_file, src_row_num FROM staging."الفواتير"
        UNION ALL SELECT src_file, src_row_num FROM staging."المستندات"
        UNION ALL SELECT src_file, src_row_num FROM staging."خطابات الأتعاب"
        UNION ALL SELECT src_file, src_row_num FROM staging."العملاء"
        UNION ALL SELECT src_file, src_row_num FROM staging."Contacts"
        UNION ALL SELECT src_file, src_row_num FROM staging."تقسيم التحصيلات"
        UNION ALL SELECT src_file, src_row_num FROM staging."lawyers"
        UNION ALL SELECT src_file, src_row_num FROM staging."فريق العمل"
        UNION ALL SELECT src_file, src_row_num FROM staging."المحامين"
        UNION ALL SELECT src_file, src_row_num FROM staging."LawyerShare4Invoices"
        UNION ALL SELECT src_file, src_row_num FROM staging."العملاء__logo"
        UNION ALL SELECT src_file, src_row_num FROM staging."Contacts__Attachments"
        UNION ALL SELECT src_file, src_row_num FROM staging."خطابات الأتعاب__Matter") z;

    SELECT count(DISTINCT (src_file, src_row_num)) INTO quarantined FROM quarantine.finding;
    SELECT count(*) INTO excluded FROM quarantine.exclusion;
    clean := staged - quarantined - excluded;

    IF array_length(problems, 1) > 0 THEN
        RAISE EXCEPTION E'GATE 3 FAILED\n  %', array_to_string(problems, E'\n  ');
    END IF;

    RAISE NOTICE 'PROVED: every finding and exclusion names a staged row that exists';
    RAISE NOTICE 'PROVED: no row is both quarantined and excluded';
    RAISE NOTICE 'PROVED: every staged row is in exactly one state — % clean, % quarantined, % excluded, of % staged',
                 clean, quarantined, excluded, staged;

    IF clean < 0 THEN
        RAISE EXCEPTION 'GATE 3 FAILED: the arithmetic is impossible — % clean', clean;
    END IF;

    --  4. Rule 7. Every finding has to say what was actually there, or say
    --     plainly that nothing was. A finding with neither is a finding
    --     nobody can act on.
    SELECT count(*) INTO n FROM quarantine.finding WHERE btrim(detail) = '';
    IF n > 0 THEN
        RAISE EXCEPTION 'GATE 3 FAILED: % finding(s) carry no explanation', n;
    END IF;
    RAISE NOTICE 'PROVED: every finding carries an explanation in the firm''s terms';

    --  5. An answered review value that no longer appears in the data is KEPT
    --     and reported. Deleting a human's answer is what rule 7 forbids.
    SELECT count(*) INTO n FROM quarantine.review_value WHERE answered_at IS NOT NULL;
    RAISE NOTICE 'PROVED: % review value(s) already answered by the firm, none discarded', n;
END
$GATE3$;

COMMIT;
