-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "full_name_normalised" TEXT,
ADD COLUMN     "name_ar_normalised" TEXT;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "contact_name_normalised" TEXT;

-- AlterTable
ALTER TABLE "matters" ADD COLUMN     "case_number_ar_normalised" TEXT,
ADD COLUMN     "subject_normalised" TEXT;

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "name_ar_normalised" TEXT;

-- AlterTable
ALTER TABLE "person_name_alias" ADD COLUMN     "alias_ar_normalised" TEXT;

-- ==========================================================================
--  ARABIC SEARCH — task 1.6
--
--  Users type Arabic without hamza and without diacritics. Measured on the
--  real data: a plain search fails on 49% of client names and 96% of matter
--  subjects (docs/PRD.md). Search has to find the record anyway.
--
--  THE SHAPE
--
--  One database function, ar_normalise(text). Every searchable Arabic field
--  gets a shadow column holding its normalised form, kept in step by a
--  trigger, with a trigram index on it. The user's query goes through the
--  same function, so both sides are folded identically — which is the only
--  arrangement that cannot drift.
--
--  WHY A TRIGGER AND NOT A GENERATED COLUMN
--
--  A PostgreSQL generated column would be the obvious choice and it cannot be
--  used here: Prisma does not know about generated columns, so it would
--  include them in every INSERT, and PostgreSQL refuses an insert into a
--  generated column. The application would fail on every create.
--
--  A trigger is invisible to Prisma in exactly the way a CHECK constraint is,
--  so the shadow column is an ordinary column that Prisma can read and filter
--  on — `where: { nameArNormalised: { contains: … } }` — while the database
--  guarantees its content. If anything writes a wrong value, the trigger
--  overwrites it.
--
--  db:check therefore asserts the triggers EXIST and that no stored value
--  disagrees with the function, because nothing in schema.prisma would notice
--  either.
--
--  WHAT IS FOLDED, AND WHAT IS NEVER FOLDED
--
--  Folded: diacritics and tatweel; أ إ آ ٱ -> ا; ة -> ه; ى -> ي; ؤ -> و;
--  ئ -> ي; Arabic-Indic digits ٠-٩ -> 0-9; Latin lowercased; J -> ق; and the
--  space inside a compound name, so عبدالعزيز and عبد العزيز meet.
--
--  **NEVER FOLDED: A DROPPED MIDDLE NAME.** سامي خطاب and سامي إبراهيم خطاب
--  must stay apart. No rule can fold them without merging genuinely different
--  people who share a first and last name, which in a firm this size is a
--  matter of time rather than chance. That is what person_name_alias is for.
--  It is asserted below as a NEGATIVE test, because it is the one property of
--  this function that a future "improvement" would quietly destroy.
-- ==========================================================================

-- --------------------------------------------------------------------------
--  1. The normaliser
--
--  IMMUTABLE and STRICT: the same input always gives the same output, and
--  NULL in gives NULL out. Immutability is what lets it be used in an index.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ar_normalise(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $fn$
    SELECT replace(
             replace(
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
               -- the case-year suffix: 695 matters use ق and 92 use J, and
               -- they mean the same thing. Folded AFTER lower() so J and j
               -- both arrive here.
               'j', 'ق'
             ),
             -- the space in a compound name, LAST: عبدالعزيز = عبد العزيز
             ' ', ''
           );
$fn$;

COMMENT ON FUNCTION ar_normalise(text) IS
    'Folds Arabic spelling variation for SEARCH ONLY. Never folds a dropped '
    'middle name — see docs/MIGRATION.md, "The four classes of Arabic name '
    'variation". Both the stored value and the user query go through it.';

-- --------------------------------------------------------------------------
--  2. The trigger that keeps a shadow column in step
--
--  One generic function rather than one per table. It takes the source and
--  target column names as arguments and works through jsonb, which is the
--  only way plpgsql can set a column chosen at runtime.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ar_normalise_column()
RETURNS trigger
LANGUAGE plpgsql
AS $trg$
DECLARE
    source_col text := TG_ARGV[0];
    target_col text := TG_ARGV[1];
    row_json   jsonb := to_jsonb(NEW);
BEGIN
    NEW := jsonb_populate_record(
               NEW,
               jsonb_build_object(target_col,
                                  ar_normalise(row_json ->> source_col)));
    RETURN NEW;
END;
$trg$;

-- --------------------------------------------------------------------------
--  3. Shadow columns, triggers and trigram indexes
--
--  The fields the traced screens actually search: a client by name, a matter
--  by case number or subject, a person by any spelling ever typed, a contact
--  by name.
--
--  GIN + gin_trgm_ops is what makes a LIKE '%…%' over 13,279 rows fast. The
--  extension arrived in migration 0001.
-- --------------------------------------------------------------------------

CREATE TRIGGER "clients_name_ar_normalise"
    BEFORE INSERT OR UPDATE OF "name_ar" ON "clients"
    FOR EACH ROW EXECUTE FUNCTION ar_normalise_column('name_ar', 'name_ar_normalised');

CREATE TRIGGER "clients_full_name_normalise"
    BEFORE INSERT OR UPDATE OF "full_name" ON "clients"
    FOR EACH ROW EXECUTE FUNCTION ar_normalise_column('full_name', 'full_name_normalised');

CREATE TRIGGER "matters_case_number_ar_normalise"
    BEFORE INSERT OR UPDATE OF "case_number_ar" ON "matters"
    FOR EACH ROW EXECUTE FUNCTION ar_normalise_column('case_number_ar', 'case_number_ar_normalised');

CREATE TRIGGER "matters_subject_normalise"
    BEFORE INSERT OR UPDATE OF "subject" ON "matters"
    FOR EACH ROW EXECUTE FUNCTION ar_normalise_column('subject', 'subject_normalised');

CREATE TRIGGER "people_name_ar_normalise"
    BEFORE INSERT OR UPDATE OF "name_ar" ON "people"
    FOR EACH ROW EXECUTE FUNCTION ar_normalise_column('name_ar', 'name_ar_normalised');

CREATE TRIGGER "person_name_alias_alias_ar_normalise"
    BEFORE INSERT OR UPDATE OF "alias_ar" ON "person_name_alias"
    FOR EACH ROW EXECUTE FUNCTION ar_normalise_column('alias_ar', 'alias_ar_normalised');

CREATE TRIGGER "contacts_contact_name_normalise"
    BEFORE INSERT OR UPDATE OF "contact_name" ON "contacts"
    FOR EACH ROW EXECUTE FUNCTION ar_normalise_column('contact_name', 'contact_name_normalised');

-- people and person_name_alias already hold 135 and 347 rows. Backfill them
-- through the same function, so there is exactly one definition of normalised
-- anywhere in the system.
UPDATE "people"            SET name_ar_normalised  = ar_normalise(name_ar);
UPDATE "person_name_alias" SET alias_ar_normalised = ar_normalise(alias_ar);

CREATE INDEX "clients_name_ar_normalised_trgm"
    ON "clients" USING gin ("name_ar_normalised" gin_trgm_ops);
CREATE INDEX "matters_case_number_ar_normalised_trgm"
    ON "matters" USING gin ("case_number_ar_normalised" gin_trgm_ops);
CREATE INDEX "matters_subject_normalised_trgm"
    ON "matters" USING gin ("subject_normalised" gin_trgm_ops);
CREATE INDEX "people_name_ar_normalised_trgm"
    ON "people" USING gin ("name_ar_normalised" gin_trgm_ops);
CREATE INDEX "person_name_alias_alias_ar_normalised_trgm"
    ON "person_name_alias" USING gin ("alias_ar_normalised" gin_trgm_ops);
CREATE INDEX "contacts_contact_name_normalised_trgm"
    ON "contacts" USING gin ("contact_name_normalised" gin_trgm_ops);

-- ==========================================================================
--  4. POSTCONDITIONS
-- ==========================================================================

DO $SEARCH$
DECLARE
    n       integer;
    missing text;
BEGIN
    -- ----------------------------------------------------------------------
    --  THE TWO TESTS docs/PRD.md AND TASKS.md NAME
    -- ----------------------------------------------------------------------
    IF ar_normalise('احمد') <> ar_normalise('أحمد') THEN
        RAISE EXCEPTION 'احمد does not find أحمد';
    END IF;

    IF ar_normalise('140J') <> ar_normalise('140ق') THEN
        RAISE EXCEPTION '140J does not find 140ق';
    END IF;

    -- ----------------------------------------------------------------------
    --  The rest of the fold, each named
    -- ----------------------------------------------------------------------
    IF ar_normalise('محكمه') <> ar_normalise('محكمة') THEN
        RAISE EXCEPTION 'ta marbuta is not folded';
    END IF;

    IF ar_normalise('عبدالعزيز') <> ar_normalise('عبد العزيز') THEN
        RAISE EXCEPTION 'the space in a compound name is not folded';
    END IF;

    IF ar_normalise('الدعوي') <> ar_normalise('الدعوى') THEN
        RAISE EXCEPTION 'alef maqsura is not folded';
    END IF;

    IF ar_normalise('١٤٠ق') <> ar_normalise('140ق') THEN
        RAISE EXCEPTION 'Arabic-Indic digits are not folded';
    END IF;

    IF ar_normalise('HP') <> ar_normalise('hp') THEN
        RAISE EXCEPTION 'Latin case is not folded';
    END IF;

    IF ar_normalise('أَحْمَد') <> ar_normalise('أحمد') THEN
        RAISE EXCEPTION 'diacritics are not stripped';
    END IF;

    IF ar_normalise('أحـــمد') <> ar_normalise('أحمد') THEN
        RAISE EXCEPTION 'tatweel is not stripped';
    END IF;

    IF ar_normalise(NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'the normaliser must return NULL for NULL';
    END IF;

    -- ----------------------------------------------------------------------
    --  THE NEGATIVE TESTS — what must NOT be folded
    --
    --  These matter more than the ones above. Every fold is a merge, and a
    --  fold that is right 95% of the time silently merges two people the
    --  other 5%. This project has already merged two people by accident
    --  twice, one of them carrying 1,309 hearings.
    -- ----------------------------------------------------------------------
    IF ar_normalise('سامي خطاب') = ar_normalise('سامي إبراهيم خطاب') THEN
        RAISE EXCEPTION 'A DROPPED MIDDLE NAME IS BEING FOLDED. سامي خطاب and سامي إبراهيم خطاب are not necessarily the same person and no rule may merge them — see docs/MIGRATION.md, "The four classes of Arabic name variation"';
    END IF;

    IF ar_normalise('تحكيم') = ar_normalise('تحقيق') THEN
        RAISE EXCEPTION 'تحكيم and تحقيق are different words and must not fold together';
    END IF;

    IF ar_normalise('طاعن') = ar_normalise('متظلم') THEN
        RAISE EXCEPTION 'طاعن and متظلم are different roles (D7)';
    END IF;

    IF ar_normalise('أول درجة') = ar_normalise('ابتدائي') THEN
        RAISE EXCEPTION 'أول درجة and ابتدائي are distinct degrees, confirmed by the firm';
    END IF;

    -- ----------------------------------------------------------------------
    --  The shadow columns are populated and agree with the function
    -- ----------------------------------------------------------------------
    SELECT count(*) INTO n FROM "people"
     WHERE name_ar_normalised IS DISTINCT FROM ar_normalise(name_ar);
    IF n <> 0 THEN
        RAISE EXCEPTION '% people rows disagree with the normaliser', n;
    END IF;

    SELECT count(*) INTO n FROM "person_name_alias"
     WHERE alias_ar_normalised IS DISTINCT FROM ar_normalise(alias_ar);
    IF n <> 0 THEN
        RAISE EXCEPTION '% alias rows disagree with the normaliser', n;
    END IF;

    -- The 135 roster names must still be 135 DISTINCT normalised names. If
    -- the fold were ever widened, this is where two people would silently
    -- become one — the same check that caught the three duplicates at 1.2b.
    SELECT count(*) INTO n FROM (
        SELECT name_ar_normalised FROM "people"
         GROUP BY 1 HAVING count(*) > 1) d;
    IF n <> 0 THEN
        RAISE EXCEPTION '% normalised names now collide — the fold has been widened and two people have merged', n;
    END IF;

    -- Both hamza pairs must still resolve through the alias table.
    SELECT count(DISTINCT a.person_id) INTO n
      FROM "person_name_alias" a
     WHERE a.alias_ar_normalised = ar_normalise('أحمد إسماعيل');
    IF n <> 1 THEN
        RAISE EXCEPTION 'أحمد إسماعيل resolves to % people through the normaliser, expected 1', n;
    END IF;

    -- ----------------------------------------------------------------------
    --  The triggers and indexes exist
    -- ----------------------------------------------------------------------
    SELECT string_agg(t.name, ', ' ORDER BY t.name) INTO missing
      FROM (VALUES ('clients_name_ar_normalise'), ('clients_full_name_normalise'),
                   ('matters_case_number_ar_normalise'), ('matters_subject_normalise'),
                   ('people_name_ar_normalise'),
                   ('person_name_alias_alias_ar_normalise'),
                   ('contacts_contact_name_normalise')
           ) AS t(name)
     WHERE NOT EXISTS (SELECT 1 FROM pg_trigger pt WHERE pt.tgname = t.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'normalising triggers missing: %', missing;
    END IF;

    SELECT string_agg(x.name, ', ' ORDER BY x.name) INTO missing
      FROM (VALUES ('clients_name_ar_normalised_trgm'),
                   ('matters_case_number_ar_normalised_trgm'),
                   ('matters_subject_normalised_trgm'),
                   ('people_name_ar_normalised_trgm'),
                   ('person_name_alias_alias_ar_normalised_trgm'),
                   ('contacts_contact_name_normalised_trgm')
           ) AS x(name)
     WHERE NOT EXISTS (SELECT 1 FROM pg_indexes pi
                        WHERE pi.schemaname = 'public' AND pi.indexname = x.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'trigram indexes missing: %', missing;
    END IF;

    RAISE NOTICE 'task 1.6: ar_normalise built, 7 shadow columns, 7 triggers, 6 trigram indexes';
END
$SEARCH$;
