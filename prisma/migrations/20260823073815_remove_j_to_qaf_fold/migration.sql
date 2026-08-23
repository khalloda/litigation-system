-- This is an empty migration.
-- ==========================================================================
--  REMOVE THE J -> ق FOLD ENTIRELY
--
--  A live defect, not a latent one. ar_normalise() folded every Latin `j` to
--  `ق`, so `JTI` normalised to `قti`. **JTI is a real client**, and searching
--  for them returned wrong results from the moment task 1.6 shipped.
--
--  THE FIRM'S RULING: do not normalise J to ق anywhere. Not restricted to a
--  case-number context, not conditionally — removed completely. The risk of
--  corrupting a client name outweighs the convenience of matching 140J
--  against 140ق.
--
--  **THIS SUPERSEDES docs/PRD.md SECTION 4**, which listed `J ↔ ق` among the
--  folds. That document, docs/MIGRATION.md, docs/DATA-MODEL.md,
--  docs/GLOSSARY.md and TASKS.md 1.6 are all updated in the same commit, so
--  nobody reinstates this later as a missing feature.
--
--  WHAT REPLACES IT: nothing. A lawyer searching a case number types it as
--  recorded, and both spellings stay findable by their own form — 695 matters
--  use ق and 92 use J. Neither becomes unfindable; they simply do not find
--  each other.
--
--  WHY THE ORIGINAL FOLD LOOKED SAFE, AND WAS NOT
--
--  It was reasoned about only in the case-number context, where `140J` and
--  `140ق` genuinely are the same thing. The fold was then applied to every
--  field in the system, including client names. **A rule justified by one
--  column was applied to all of them** — which is the same shape as the
--  overloaded-column faults this project keeps finding, arriving from the
--  other direction.
--
--  The negative tests below exist so that reasoning cannot be repeated.
-- ==========================================================================

CREATE OR REPLACE FUNCTION ar_normalise(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $fn$
    SELECT replace(
             lower(
               translate(
                 translate(
                   -- diacritics (064B-0652), tatweel (0640) and the
                   -- superscript alef (0670) carry no meaning for matching
                   regexp_replace(input, '[ًٌٍَُِّْـٰ]', '', 'g'),
                   -- hamza forms, ta marbuta, alef maqsura, hamza carriers
                   'أإآٱةىؤئ',
                   'ااااهيوي'
                 ),
                 -- Arabic-Indic and extended Arabic-Indic digits. The live
                 -- data holds none, but a user may type them (docs/PRD.md).
                 '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
                 '01234567890123456789'
               )
             ),
             -- the space in a compound name, LAST: عبدالعزيز = عبد العزيز
             ' ', ''
           );
    -- NO J -> ق FOLD. Removed 24 August 2026 by the firm's ruling. Latin
    -- letters pass through untouched apart from being lowercased.
$fn$;

COMMENT ON FUNCTION ar_normalise(text) IS
    'Folds Arabic spelling variation for SEARCH ONLY. Never folds a dropped '
    'middle name, and NEVER folds Latin J to ق — that corrupted the client '
    'name JTI. See docs/MIGRATION.md. Both the stored value and the user '
    'query go through it.';

-- Recompute every shadow column through the new definition. clients, matters
-- and contacts are empty today; people and person_name_alias are not.
UPDATE "people"            SET name_ar_normalised       = ar_normalise(name_ar);
UPDATE "person_name_alias" SET alias_ar_normalised      = ar_normalise(alias_ar);
UPDATE "clients"           SET name_ar_normalised       = ar_normalise(name_ar),
                               full_name_normalised     = ar_normalise(full_name);
UPDATE "matters"           SET case_number_ar_normalised = ar_normalise(case_number_ar),
                               subject_normalised        = ar_normalise(subject);
UPDATE "contacts"          SET contact_name_normalised  = ar_normalise(contact_name);

DO $NOJ$
DECLARE n integer;
BEGIN
    -- ----------------------------------------------------------------------
    --  THE NEGATIVE TESTS — the whole point of this migration
    -- ----------------------------------------------------------------------
    IF ar_normalise('JTI') = ar_normalise('قTI') THEN
        RAISE EXCEPTION 'JTI still folds to قTI — JTI is a real client and this corrupts their name';
    END IF;

    -- Latin J must survive as a Latin letter, lowercased and nothing more.
    IF ar_normalise('JTI') <> 'jti' THEN
        RAISE EXCEPTION 'ar_normalise(JTI) is %, expected jti — Latin J must pass through untouched', ar_normalise('JTI');
    END IF;

    IF position('ق' in ar_normalise('J')) > 0 THEN
        RAISE EXCEPTION 'a bare J still produces a ق';
    END IF;

    -- ...and the two forms of the case-year suffix now stay APART. This is
    -- the behaviour the firm asked for, asserted so that restoring the fold
    -- fails loudly rather than looking like a fix.
    IF ar_normalise('140J') = ar_normalise('140ق') THEN
        RAISE EXCEPTION '140J still folds to 140ق — the J fold has been reinstated';
    END IF;

    -- ----------------------------------------------------------------------
    --  Everything else still folds exactly as before
    -- ----------------------------------------------------------------------
    IF ar_normalise('احمد')      <> ar_normalise('أحمد')        THEN RAISE EXCEPTION 'hamza fold lost'; END IF;
    IF ar_normalise('محكمه')     <> ar_normalise('محكمة')       THEN RAISE EXCEPTION 'ta marbuta fold lost'; END IF;
    IF ar_normalise('الدعوي')    <> ar_normalise('الدعوى')      THEN RAISE EXCEPTION 'alef maqsura fold lost'; END IF;
    IF ar_normalise('عبدالعزيز') <> ar_normalise('عبد العزيز')  THEN RAISE EXCEPTION 'compound-space fold lost'; END IF;
    IF ar_normalise('١٤٠')       <> ar_normalise('140')         THEN RAISE EXCEPTION 'Arabic-Indic digit fold lost'; END IF;
    IF ar_normalise('HP')        <> ar_normalise('hp')          THEN RAISE EXCEPTION 'Latin case fold lost'; END IF;
    IF ar_normalise('أَحْمَد')     <> ar_normalise('أحمد')        THEN RAISE EXCEPTION 'diacritic stripping lost'; END IF;
    IF ar_normalise('أحـــمد')   <> ar_normalise('أحمد')        THEN RAISE EXCEPTION 'tatweel stripping lost'; END IF;
    IF ar_normalise(NULL) IS NOT NULL THEN RAISE EXCEPTION 'NULL handling lost'; END IF;

    -- ...and nothing that must stay apart has come together.
    IF ar_normalise('سامي خطاب') = ar_normalise('سامي إبراهيم خطاب') THEN
        RAISE EXCEPTION 'a dropped middle name is being folded';
    END IF;
    IF ar_normalise('تحكيم')    = ar_normalise('تحقيق')  THEN RAISE EXCEPTION 'تحكيم = تحقيق'; END IF;
    IF ar_normalise('طاعن')     = ar_normalise('متظلم')  THEN RAISE EXCEPTION 'طاعن = متظلم'; END IF;
    IF ar_normalise('أول درجة') = ar_normalise('ابتدائي') THEN RAISE EXCEPTION 'أول درجة = ابتدائي'; END IF;

    -- ----------------------------------------------------------------------
    --  Every shadow column agrees with the new definition
    -- ----------------------------------------------------------------------
    SELECT (SELECT count(*) FROM "people"
             WHERE name_ar_normalised IS DISTINCT FROM ar_normalise(name_ar))
         + (SELECT count(*) FROM "person_name_alias"
             WHERE alias_ar_normalised IS DISTINCT FROM ar_normalise(alias_ar))
         + (SELECT count(*) FROM "clients"
             WHERE name_ar_normalised IS DISTINCT FROM ar_normalise(name_ar)
                OR full_name_normalised IS DISTINCT FROM ar_normalise(full_name))
         + (SELECT count(*) FROM "matters"
             WHERE case_number_ar_normalised IS DISTINCT FROM ar_normalise(case_number_ar)
                OR subject_normalised IS DISTINCT FROM ar_normalise(subject))
         + (SELECT count(*) FROM "contacts"
             WHERE contact_name_normalised IS DISTINCT FROM ar_normalise(contact_name))
      INTO n;
    IF n <> 0 THEN
        RAISE EXCEPTION '% rows disagree with the new normaliser', n;
    END IF;

    -- The roster is unchanged by this: 135 people, still 135 distinct
    -- normalised names, and no spelling has stopped resolving.
    SELECT count(*) INTO n FROM (
        SELECT name_ar_normalised FROM "people" GROUP BY 1 HAVING count(*) > 1) d;
    IF n <> 0 THEN
        RAISE EXCEPTION '% normalised names collide', n;
    END IF;

    SELECT count(DISTINCT a.person_id) INTO n FROM "person_name_alias" a
     WHERE a.alias_ar_normalised = ar_normalise('أحمد إسماعيل');
    IF n <> 1 THEN
        RAISE EXCEPTION 'أحمد إسماعيل resolves to % people, expected 1', n;
    END IF;

    RAISE NOTICE 'J -> ق fold removed; JTI survives as jti';
END
$NOJ$;
