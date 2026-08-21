-- ==========================================================================
--  MERGE THREE NAME-VARIANT DUPLICATES — 21 August 2026
--
--  138 people -> 135. Confirmed by the firm.
--
--  WHAT ACTUALLY HAPPENED — worth stating, because the first two diagnoses
--  were both wrong.
--
--  The firm's reviewed names workbook had already resolved all four
--  fragments. It said:
--
--      وأحمد عبد الله محمد                        ->  احمد عبدالله
--      والأساتذه أحمد عبد الله محمد علي            ->  احمد عبدالله
--      ود. خالد محمود حمدي عبد العزيز عطية        ->  خالد عطية
--      نبيل فرحات                                 ->  احمد فرحات
--
--  Every target is a real person, written the way the reviewer spells them:
--  without the hamza, without the space in عبد الله, or with ة for ه. The
--  generator looked for a person whose name matched that target EXACTLY,
--  found none, and created one. All three "duplicates" are that artefact.
--  The data was correct throughout.
--
--  The lesson, now in docs/MIGRATION.md: a merge instruction is itself Arabic
--  text and must be normalised before matching. Matching it exactly creates
--  the duplicate the merge was meant to prevent.
--
--  NOT stripping conjunctions. The و-prefixed spellings genuinely appeared in
--  the Access data, the firm assigned each to the right person, and they stay
--  as aliases so those rows still resolve.
--
--  نبيل فرحات -> احمد فرحات is a DROPPED-NAME merge. No normaliser could ever
--  infer it; a human made that judgement in the review. That is exactly what
--  the alias table is for, and why class four stays out of the normaliser.
-- ==========================================================================

-- ---------------------------------------------------------------------------
--  The merges, by the names as stored.
--
--  Matched exactly here on purpose: these strings were read back out of this
--  database, so an exact match is verifiable. What the assertion then proves
--  is that each pair really is the same name under normalisation — so a
--  mistyped row cannot quietly merge two DIFFERENT people, which is the one
--  thing worse than leaving the duplicate.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE merge_pair (phantom text, target text) ON COMMIT DROP;
INSERT INTO merge_pair (phantom, target) VALUES
    ('احمد عبدالله', 'أحمد عبد الله'),   -- hamza AND the space in عبد الله
    ('احمد فرحات',   'أحمد فرحات'),      -- hamza
    ('خالد عطية',    'خالد عطيه');       -- ta marbuta

DO $MERGE$
DECLARE
    r          record;
    phantom_id integer;
    target_id  integer;
    moved      integer;
    n          integer;
BEGIN
    -- The normaliser, inline. The real one becomes a database function in
    -- task 1.6; duplicating three lines here is better than pre-empting it.
    -- Folds hamza, ta marbuta, alef maqsura, and the space in compound names.
    CREATE TEMP TABLE IF NOT EXISTS _norm_check (x int);

    FOR r IN SELECT * FROM merge_pair LOOP
        SELECT id INTO phantom_id FROM people WHERE name_ar = r.phantom;
        SELECT id INTO target_id  FROM people WHERE name_ar = r.target;

        IF phantom_id IS NULL THEN
            RAISE EXCEPTION 'no person named %, so this merge cannot be checked', r.phantom;
        END IF;
        IF target_id IS NULL THEN
            RAISE EXCEPTION 'no person named %, so this merge cannot be checked', r.target;
        END IF;
        IF phantom_id = target_id THEN
            RAISE EXCEPTION 'merge of % into % is the same person', r.phantom, r.target;
        END IF;

        -- PROVE they are the same name before deleting anybody. Two people
        -- who merely look similar must never be merged by this migration.
        IF replace(translate(regexp_replace(r.phantom, '[ًٌٍَُِّْـ]', '', 'g'),
                             'أإآٱةىؤئ', 'ااااهيوي'), ' ', '')
           <> replace(translate(regexp_replace(r.target, '[ًٌٍَُِّْـ]', '', 'g'),
                                'أإآٱةىؤئ', 'ااااهيوي'), ' ', '')
        THEN
            RAISE EXCEPTION
                'refusing to merge % into %: they are not the same name once normalised',
                r.phantom, r.target;
        END IF;

        -- Every spelling the phantom carried belongs to the real person. This
        -- includes the phantom's own name, which migration 0005 added as a
        -- self-alias — a valid spelling, since the firm wrote it.
        UPDATE person_name_alias SET person_id = target_id WHERE person_id = phantom_id;
        GET DIAGNOSTICS moved = ROW_COUNT;
        IF moved = 0 THEN
            RAISE EXCEPTION 'merging % moved no spellings, which cannot be right', r.phantom;
        END IF;

        -- The phantom's name must survive as a spelling of the real person,
        -- or every row that used it becomes unresolvable.
        IF NOT EXISTS (SELECT 1 FROM person_name_alias WHERE alias_ar = r.phantom) THEN
            INSERT INTO person_name_alias (person_id, alias_ar, is_primary)
            VALUES (target_id, r.phantom, false);
        END IF;

        DELETE FROM people WHERE id = phantom_id;

        RAISE NOTICE 'merged % (id %) into % (id %), % spellings moved',
                     r.phantom, phantom_id, r.target, target_id, moved;
    END LOOP;

    -- ---- every figure, re-derived --------------------------------------
    -- The cascade rule: one change moved five numbers last time and four were
    -- left stale. All of them are stated.
    SELECT count(*) INTO n FROM people;
    IF n <> 135 THEN RAISE EXCEPTION 'people: %, expected 135', n; END IF;

    SELECT count(*) INTO n FROM people WHERE is_staff;
    IF n <> 64 THEN RAISE EXCEPTION 'firm staff: %, expected 64', n; END IF;

    SELECT count(*) INTO n FROM people WHERE is_staff AND is_active;
    IF n <> 21 THEN RAISE EXCEPTION 'current staff: %, expected 21', n; END IF;

    SELECT count(*) INTO n FROM people WHERE is_staff AND NOT is_active;
    IF n <> 43 THEN RAISE EXCEPTION 'former staff: %, expected 43', n; END IF;

    SELECT count(*) INTO n FROM people WHERE NOT is_staff;
    IF n <> 71 THEN RAISE EXCEPTION 'external people: %, expected 71', n; END IF;

    -- Aliases are MOVED, never dropped: the count must not change.
    SELECT count(*) INTO n FROM person_name_alias;
    IF n <> 347 THEN RAISE EXCEPTION 'aliases: %, expected 347 — spellings were lost', n; END IF;

    SELECT count(*) INTO n FROM people WHERE team_id IS NOT NULL;
    IF n <> 8 THEN RAISE EXCEPTION 'people with a team: %, expected 8', n; END IF;

    SELECT count(*) INTO n FROM people WHERE is_staff AND is_active AND team_id IS NULL;
    IF n <> 16 THEN RAISE EXCEPTION 'current staff with no team: %, expected 16', n; END IF;

    -- ---- and the properties the merge existed to produce ---------------
    -- No two people may share a fully-normalised name any more.
    SELECT count(*) INTO n FROM (
        SELECT replace(translate(regexp_replace(name_ar, '[ًٌٍَُِّْـ]', '', 'g'),
                                 'أإآٱةىؤئ', 'ااااهيوي'), ' ', '') AS f
          FROM people GROUP BY 1 HAVING count(*) > 1) d;
    IF n <> 0 THEN
        RAISE EXCEPTION '% names still collide once normalised', n;
    END IF;

    -- The four fragments the firm resolved must each reach the right person.
    SELECT count(*) INTO n FROM person_name_alias a JOIN people p ON p.id = a.person_id
     WHERE (a.alias_ar = 'وأحمد عبد الله محمد'              AND p.name_ar = 'أحمد عبد الله')
        OR (a.alias_ar = 'والأساتذه أحمد عبد الله محمد علي' AND p.name_ar = 'أحمد عبد الله')
        OR (a.alias_ar = 'ود. خالد محمود حمدي عبد العزيز عطية' AND p.name_ar = 'خالد عطيه')
        OR (a.alias_ar = 'نبيل فرحات'                       AND p.name_ar = 'أحمد فرحات');
    IF n <> 4 THEN
        RAISE EXCEPTION 'only % of the 4 resolved fragments reach the right person', n;
    END IF;

    -- Still a complete index, and still one spelling per person.
    SELECT count(*) INTO n FROM people p
     WHERE NOT EXISTS (SELECT 1 FROM person_name_alias a WHERE a.alias_ar = p.name_ar);
    IF n <> 0 THEN RAISE EXCEPTION '% people are not findable by their own name', n; END IF;

    SELECT count(*) INTO n FROM (
        SELECT alias_ar FROM person_name_alias GROUP BY alias_ar HAVING count(*) > 1) d;
    IF n <> 0 THEN RAISE EXCEPTION '% spellings map to more than one person', n; END IF;

    -- No alias may point at a person who no longer exists.
    SELECT count(*) INTO n FROM person_name_alias a
     WHERE NOT EXISTS (SELECT 1 FROM people p WHERE p.id = a.person_id);
    IF n <> 0 THEN RAISE EXCEPTION '% orphaned spellings', n; END IF;

    RAISE NOTICE 'merge complete: 135 people, 347 spellings, no normalised collisions';
END
$MERGE$;
