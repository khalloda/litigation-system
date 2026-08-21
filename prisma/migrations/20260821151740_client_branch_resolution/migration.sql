-- ==========================================================================
--  CLIENT BRANCH RESOLUTION — 21 August 2026
--
--  Source: sql/client-branch-resolution.sql, decided by the firm.
--  Decision D19. Read that file for the full reasoning; this is the applied
--  version of it.
--
--  lookup_client_branch held 31 values carrying at least three different
--  concepts at once — the same overloaded-column pattern as matterDegree
--  (D8), affecting 560 matters. The firm has ruled: a branch is A SITE OR
--  SUBSIDIARY OF A CLIENT, and nothing else.
--
--      lookup_client_branch    31 -> 15
--      total seeded rows      146 -> 130
--      migration_crosswalk      4 -> 20 rules
--
--  THE COUNTS WERE COUNTED, NOT TAKEN ON TRUST. The two lists the firm
--  supplied were compared byte for byte against the 31 rows actually seeded:
--  15 + 16 = 31, no duplicates, nothing stated that is not in the table and
--  nothing in the table left unstated.
--
--  المنطقة الحرة IS A BRANCH, not a venue — the third site of أدخنة النخلة,
--  193 matters. lookup_venue stays at 7 and this migration asserts it.
--
--  ONE FIELD CORRECTED, FLAGGED FOR THE FIRM: آراء قانونية was given as
--  matter_category -> رأي قانوني, but رأي قانوني is not a matter_category. It
--  is a matter_TYPE (id 3), which is where D8 puts "what kind of work?".
--  Written as matter_type, with a reviewer_note saying so. One UPDATE if the
--  firm meant otherwise; nothing has loaded against it.
--
--  NOTHING IS LOST. Every moved value gets a crosswalk row so Stage 2 maps
--  the old text, and every client keeps its branch text byte for byte in
--  clients.legacy_branch_raw (task 1.3). Fourteen matters lose their branch
--  outright — the two document headings — with the agreement of the firm.
--
--  TWO RULES CARRIED INTO STAGE 2, in every affected reviewer_note and on
--  tasks 2.5 and 2.6 of TASKS.md:
--    (a) never overwrite an existing matter_category — quarantine the clash
--    (b) the three separate_client values mean the matter is on the WRONG
--        CLIENT. Quarantine at 2.6. Never guess the right client.
--
--  Applied as a NEW migration rather than by editing 0002 or 0003, which have
--  already run. An applied migration is history and is never rewritten.
--
--  Everything below runs inside one PL/pgSQL block so that every statement
--  can assert its own ROW_COUNT. A migration runs in a transaction: one
--  failed assertion rolls back the whole thing, so there is no half-applied
--  state to discover later.
-- ==========================================================================

DO $BRANCH$
DECLARE
    n integer;

    -- The 15 genuine branches and sites. Quoted exactly as stored.
    expected_keep text[] := ARRAY[
        'تويوتا إيجيبت',
        'تويوتا مصر للتجارة',
        'تويوتا إيجيبت لصناعة السيارات',
        'الفطيم للتنمية العقارية',
        'الفطيم للسيارات',
        'الفطيم مصر للبيع بالتجزئة',
        'الفطيم لإنشاء وتنمية المنتجعات السكنية',
        'الفطيم لإقامة المراكز التجارية والإدارية',
        'أوراسكوم للفنادق',
        'أوراسكوم للاتصالات',
        'المصنع المحلي',
        'المركز الرئيسي',
        'المنطقة الحرة',
        'فرع المنصورة',
        'فرع الإسكندرية'
    ];

    -- The 16 that are not branches at all.
    expected_drop text[] := ARRAY[
        'دعاوى عمالية',
        'الجنح',
        'قضاء إداري',
        'القضاء الإداري',
        'مدني',
        'ضرائب',
        'تعويضات',
        'إقتصادي',
        'آراء قانونية',
        'النقض',
        'دعاوى قضائية',
        'سيجما للإعلام (تليفزيون الحياة)',
        'سيجما للصناعات الدوائية',
        'ألفا مصر للتجارة',
        'أولاً: طلب وشكوى أمام الهيئة العامة للاستثمار',
        'ثانياً: النزاعات القضائية المقامة من وضد شركتي الإمارات هايتس ويافا ماك'
    ];
BEGIN
    -- ----------------------------------------------------------------------
    --  0. The starting state must be what this migration was written against
    --
    --  Checked from both sides. "31 rows" alone would also be satisfied by 31
    --  rows that are not these rows, so the membership of BOTH lists is
    --  asserted as well as the total.
    -- ----------------------------------------------------------------------
    SELECT count(*) INTO n FROM "lookup_client_branch";
    IF n <> 31 THEN
        RAISE EXCEPTION 'lookup_client_branch: % rows at the start, expected 31', n;
    END IF;

    SELECT count(*) INTO n FROM "lookup_client_branch" WHERE label_ar = ANY(expected_keep);
    IF n <> 15 THEN
        RAISE EXCEPTION 'of the 15 branches to KEEP, only % are present. A spelling here does not match the seeded value.', n;
    END IF;

    SELECT count(*) INTO n FROM "lookup_client_branch" WHERE label_ar = ANY(expected_drop);
    IF n <> 16 THEN
        RAISE EXCEPTION 'of the 16 values to REMOVE, only % are present. A spelling here does not match the seeded value.', n;
    END IF;

    SELECT count(*) INTO n FROM "migration_crosswalk";
    IF n <> 4 THEN
        RAISE EXCEPTION 'migration_crosswalk: % rows at the start, expected 4', n;
    END IF;

    -- Every destination must exist BEFORE anything is pointed at it. A
    -- crosswalk row aimed at a list entry that is not there sends its matters
    -- nowhere, and Stage 2 would only find out with 1,730 matters in hand.
    SELECT count(*) INTO n FROM "lookup_matter_category"
     WHERE label_ar IN ('عمال', 'جنح', 'قضاء إداري', 'مدني', 'ضرائب', 'تعويضات', 'اقتصادي');
    IF n <> 7 THEN
        RAISE EXCEPTION 'matter_category destinations: % of 7 exist', n;
    END IF;

    SELECT count(*) INTO n FROM "lookup_matter_type" WHERE label_ar = 'رأي قانوني';
    IF n <> 1 THEN
        RAISE EXCEPTION 'matter_type رأي قانوني does not exist — see the field-correction note above';
    END IF;

    SELECT count(*) INTO n FROM "lookup_degree" WHERE label_ar = 'نقض';
    IF n <> 1 THEN
        RAISE EXCEPTION 'degree نقض does not exist';
    END IF;

    -- ----------------------------------------------------------------------
    --  1. Collapse the جنح chain
    --
    --  Migration 0003 recorded  client_branch جنح -> client_branch الجنح.
    --  الجنح itself now moves on to matter_category جنح, so that rule became
    --  a two-step chain: جنح -> الجنح -> جنح. A chain is a second chance to
    --  get it wrong. It is collapsed to point straight at its destination.
    -- ----------------------------------------------------------------------
    UPDATE "migration_crosswalk"
       SET target_field  = 'matter_category',
           target_value  = 'جنح',
           reviewer_note = 'Was client_branch -> الجنح (migration 0003). الجنح itself moved to matter_category جنح on 21 Aug 2026, so the two-step chain is collapsed to one step. RULE (a): never overwrite an existing matter_category — quarantine the conflict.'
     WHERE source_field = 'client_branch'
       AND source_value = 'جنح';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
        RAISE EXCEPTION 'collapsing the جنح chain touched % rows, expected 1', n;
    END IF;

    -- ----------------------------------------------------------------------
    --  2. One crosswalk rule for every value that moves
    --
    --  rows_affected is NULL except where the firm has stated a figure. The
    --  per-value matter counts cannot be checked against anything in this
    --  database — matters do not load until Stage 2 — and an unverifiable
    --  number written down as a fact is the habit these files exist to break.
    --
    --  target_field conventions:
    --    a lookup name      map to that list; target_value must exist there
    --    'quarantine'       no automatic mapping; send to the review queue
    --    'separate_client'  the matter is on the WRONG CLIENT (rule b)
    --    NULL               discarded; the matter simply loses its branch
    -- ----------------------------------------------------------------------
    INSERT INTO "migration_crosswalk"
        (source_field, source_value, rows_affected, target_field, target_value, reviewer_note)
    VALUES
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

        ('client_branch', 'آراء قانونية',   NULL, 'matter_type', 'رأي قانوني',
         'FIELD CORRECTED — CONFIRM WITH THE FIRM. Given as matter_category -> رأي قانوني, but that value does not exist in lookup_matter_category; it exists exactly so in lookup_matter_type (id 3), and D8 defines matter_type as "what kind of work?". Written as matter_type. One UPDATE to change if the firm meant a new matter_category value.'),

        ('client_branch', 'النقض',          NULL, 'degree', 'نقض',
         'Court instance, not a branch. Same value with the definite article.'),

        ('client_branch', 'دعاوى قضائية',   NULL, 'quarantine', NULL,
         'A work type, not a branch, and not specific enough to map anywhere. Send to the review queue.'),

        ('client_branch', 'سيجما للإعلام (تليفزيون الحياة)', NULL, 'separate_client', NULL,
         'RULE (b): a client in its own right, not a branch. Any matter carrying this value is attached to THE WRONG CLIENT ENTIRELY. Quarantine at task 2.6. DO NOT GUESS the right client — the firm decides.'),
        ('client_branch', 'سيجما للصناعات الدوائية', NULL, 'separate_client', NULL,
         'RULE (b): a client in its own right, not a branch. Any matter carrying this value is attached to THE WRONG CLIENT ENTIRELY. Quarantine at task 2.6. DO NOT GUESS the right client — the firm decides.'),
        ('client_branch', 'ألفا مصر للتجارة', NULL, 'separate_client', NULL,
         'RULE (b): a client in its own right, not a branch. Any matter carrying this value is attached to THE WRONG CLIENT ENTIRELY. Quarantine at task 2.6. DO NOT GUESS the right client — the firm decides.'),

        ('client_branch', 'أولاً: طلب وشكوى أمام الهيئة العامة للاستثمار', 1, NULL, NULL,
         'A heading pasted out of a document, not data. Discarded with the agreement of the firm: 1 matter loses its branch. The original text survives in clients.legacy_branch_raw.'),
        ('client_branch', 'ثانياً: النزاعات القضائية المقامة من وضد شركتي الإمارات هايتس ويافا ماك', 13, NULL, NULL,
         'A heading pasted out of a document, not data. Discarded with the agreement of the firm: 13 matters lose their branch. The original text survives in clients.legacy_branch_raw.');
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 16 THEN
        RAISE EXCEPTION 'crosswalk insert wrote % rows, expected 16', n;
    END IF;

    -- ----------------------------------------------------------------------
    --  3. Reduce the list to the 15 genuine branches
    --
    --  Deleted by naming the 16 that go, not by keeping the 15 that stay: a
    --  DELETE written the other way round would also remove anything added
    --  later that nobody has ruled on.
    -- ----------------------------------------------------------------------
    DELETE FROM "lookup_client_branch" WHERE label_ar = ANY(expected_drop);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 16 THEN
        RAISE EXCEPTION 'removing the non-branches deleted % rows, expected 16', n;
    END IF;

    -- ----------------------------------------------------------------------
    --  4. The finished state
    -- ----------------------------------------------------------------------
    SELECT count(*) INTO n FROM "lookup_client_branch";
    IF n <> 15 THEN
        RAISE EXCEPTION 'lookup_client_branch: % rows, expected 15', n;
    END IF;

    -- Both directions again: 15 of the keep list survive, and nothing that is
    -- NOT on the keep list survives.
    SELECT count(*) INTO n FROM "lookup_client_branch" WHERE label_ar = ANY(expected_keep);
    IF n <> 15 THEN
        RAISE EXCEPTION 'only % of the 15 branches to KEEP survived', n;
    END IF;

    SELECT count(*) INTO n FROM "lookup_client_branch" WHERE NOT (label_ar = ANY(expected_keep));
    IF n <> 0 THEN
        RAISE EXCEPTION '% surviving branches are not on the KEEP list', n;
    END IF;

    -- المنطقة الحرة is a BRANCH. The earlier note that moved it to venue was
    -- wrong and the firm corrected it. Named on its own because it is the one
    -- value in this migration that changed side.
    SELECT count(*) INTO n FROM "lookup_client_branch" WHERE label_ar = 'المنطقة الحرة';
    IF n <> 1 THEN
        RAISE EXCEPTION 'المنطقة الحرة is a branch and must have survived';
    END IF;

    -- ...and venue must NOT have gained an eighth entry as a result.
    SELECT count(*) INTO n FROM "lookup_venue";
    IF n <> 7 THEN
        RAISE EXCEPTION 'lookup_venue: % rows, expected 7 — no venue was added', n;
    END IF;

    -- The nine lists together.
    SELECT (SELECT count(*) FROM "lookup_matter_type")
         + (SELECT count(*) FROM "lookup_matter_category")
         + (SELECT count(*) FROM "lookup_degree")
         + (SELECT count(*) FROM "lookup_venue")
         + (SELECT count(*) FROM "lookup_importance")
         + (SELECT count(*) FROM "lookup_party_role")
         + (SELECT count(*) FROM "lookup_hearing_action")
         + (SELECT count(*) FROM "lookup_matter_destination")
         + (SELECT count(*) FROM "lookup_client_branch")
      INTO n;
    IF n <> 130 THEN
        RAISE EXCEPTION 'lookups: % rows in total, expected 130', n;
    END IF;

    -- Twenty crosswalk rules.
    SELECT count(*) INTO n FROM "migration_crosswalk";
    IF n <> 20 THEN
        RAISE EXCEPTION 'migration_crosswalk: % rows, expected 20', n;
    END IF;

    -- The chain is gone: nothing points at client_branch any more.
    SELECT count(*) INTO n FROM "migration_crosswalk" WHERE target_field = 'client_branch';
    IF n <> 0 THEN
        RAISE EXCEPTION '% crosswalk rows still point at client_branch', n;
    END IF;

    -- Every target_field must be one this project recognises. Without this,
    -- a misspelled target_field would simply be skipped by the resolve checks
    -- below and look perfectly healthy — the same shape of fault as an
    -- assertion over member rows that cannot see a rule with no members.
    SELECT count(*) INTO n FROM "migration_crosswalk"
     WHERE target_field IS NOT NULL
       AND target_field NOT IN ('hearing_action', 'matter_category', 'matter_type',
                                'degree', 'venue', 'client_branch',
                                'quarantine', 'separate_client');
    IF n <> 0 THEN
        RAISE EXCEPTION '% crosswalk rows carry an unrecognised target_field', n;
    END IF;

    -- Every rule that names a list must resolve to a value that exists.
    SELECT count(*) INTO n FROM "migration_crosswalk" c
     WHERE c.target_field = 'hearing_action'
       AND NOT EXISTS (SELECT 1 FROM "lookup_hearing_action" l WHERE l.label_ar = c.target_value);
    IF n <> 0 THEN
        RAISE EXCEPTION '% crosswalk rows point at a hearing action that does not exist', n;
    END IF;

    SELECT count(*) INTO n FROM "migration_crosswalk" c
     WHERE c.target_field = 'matter_category'
       AND NOT EXISTS (SELECT 1 FROM "lookup_matter_category" l WHERE l.label_ar = c.target_value);
    IF n <> 0 THEN
        RAISE EXCEPTION '% crosswalk rows point at a matter category that does not exist', n;
    END IF;

    SELECT count(*) INTO n FROM "migration_crosswalk" c
     WHERE c.target_field = 'matter_type'
       AND NOT EXISTS (SELECT 1 FROM "lookup_matter_type" l WHERE l.label_ar = c.target_value);
    IF n <> 0 THEN
        RAISE EXCEPTION '% crosswalk rows point at a matter type that does not exist', n;
    END IF;

    SELECT count(*) INTO n FROM "migration_crosswalk" c
     WHERE c.target_field = 'degree'
       AND NOT EXISTS (SELECT 1 FROM "lookup_degree" l WHERE l.label_ar = c.target_value);
    IF n <> 0 THEN
        RAISE EXCEPTION '% crosswalk rows point at a degree that does not exist', n;
    END IF;

    -- A marker rule carries no target_value; a list rule must carry one.
    -- Checked because a NULL target_value on a list rule would sail through
    -- the NOT EXISTS checks above as "nothing to resolve".
    SELECT count(*) INTO n FROM "migration_crosswalk"
     WHERE target_field IN ('hearing_action', 'matter_category', 'matter_type', 'degree',
                            'venue', 'client_branch')
       AND target_value IS NULL;
    IF n <> 0 THEN
        RAISE EXCEPTION '% crosswalk rows name a list but no value in it', n;
    END IF;

    -- The three separate_client rules are the correctness problem of rule
    -- (b). Asserted by name so that losing one is loud rather than silent.
    SELECT count(*) INTO n FROM "migration_crosswalk" WHERE target_field = 'separate_client';
    IF n <> 3 THEN
        RAISE EXCEPTION 'separate_client rules: % of 3 present — these matters are on the wrong client', n;
    END IF;

    RAISE NOTICE 'client_branch resolved: 15 branches, 130 lookup rows, 20 crosswalk rules';
END
$BRANCH$;
