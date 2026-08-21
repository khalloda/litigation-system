-- CreateTable
CREATE TABLE "migration_crosswalk" (
    "id" SERIAL NOT NULL,
    "source_field" TEXT NOT NULL,
    "source_value" TEXT NOT NULL,
    "rows_affected" INTEGER,
    "target_field" TEXT,
    "target_value" TEXT,
    "reviewer_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_crosswalk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "migration_crosswalk_source_field_source_value_key" ON "migration_crosswalk"("source_field", "source_value");

-- ==========================================================================
--  LOOKUP CORRECTIONS — 21 August 2026
--
--  Source: sql/lookup-corrections.sql, confirmed by the firm.
--
--  Four values in the seeded lists were keyboard slips of other values in the
--  same list. They reached the database because the review workbook marked
--  all 23 hearing actions and all 32 client branches "already clean" without
--  inspecting them.
--
--      مجكمة       ج typed for ح, adjacent keys   ->  محكمة
--      محكمه       ه typed for ة                  ->  محكمة
--      رفع الدعوي  ي typed for ى                  ->  رفع الدعوى
--      جنح         missing definite article       ->  الجنح
--
--  Scale: محكمة is on 11,210 hearings; its two misspellings on 17 between
--  them. Typos, not distinctions.
--
--  NOT merged, though similarity scoring flags them:
--      تحكيم (arbitration, 11 rows) and تحقيق (investigation, 1 row) are
--      different words. Both kept, and asserted below.
--
--      hearing_action   23 -> 20
--      client_branch    32 -> 31
--      total           150 -> 146
--
--  Applied as a NEW migration rather than by editing migration 0002, which
--  has already run. A migration that has been applied anywhere is history and
--  is never rewritten; a fresh database replays 0002 then 0003 and arrives at
--  the same place.
-- ==========================================================================

-- ---------------------------------------------------------------------------
--  1. Record the merges in the crosswalk, so Stage 2 maps the old text
--
--  This is what makes the merge safe. When migration meets محكمه in a hearing
--  row it looks here, finds محكمة, and keeps the original in
--  hearings.legacy_action_raw. Without these rows the old text would match no
--  list entry and the hearing would be quarantined.
-- ---------------------------------------------------------------------------
INSERT INTO "migration_crosswalk"
    (source_field, source_value, rows_affected, target_field, target_value, reviewer_note)
VALUES
    ('hearing_action', 'محكمه',        9,  'hearing_action', 'محكمة',
     'Typo: ه for ة. Confirmed by the firm 21 Aug 2026.'),
    ('hearing_action', 'مجكمة',        8,  'hearing_action', 'محكمة',
     'Typo: ج for ح, adjacent keys. Confirmed by the firm 21 Aug 2026.'),
    ('hearing_action', 'رفع الدعوي',   1,  'hearing_action', 'رفع الدعوى',
     'Typo: ي for ى. Confirmed by the firm 21 Aug 2026.'),
    ('client_branch',  'جنح',          2,  'client_branch',  'الجنح',
     'Same value without the definite article. Confirmed by the firm 21 Aug 2026.');

-- ---------------------------------------------------------------------------
--  2. lookup_hearing_action — rebuilt as 20 values, ordered by frequency
--
--  Rebuilt rather than patched because the corrected list is re-sorted by how
--  often each value appears in the live data, which is more useful in a
--  dropdown than the old order. Nothing references these ids yet — matters
--  and hearings arrive in task 1.3 — so reassigning them costs nothing. Doing
--  this after 1.3 would not be safe.
-- ---------------------------------------------------------------------------
TRUNCATE TABLE "lookup_hearing_action" RESTART IDENTITY;

INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('محكمة', 10, now());                        -- 11,227 hearings (incl. 17 merged)
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('خبير', 20, now());                         -- 1,278
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('لجنة', 30, now());                         -- 259
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('نيابة', 40, now());                        -- 64
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('هيئة', 50, now());                         -- 27
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('خبراء', 60, now());                        -- 26
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('لجنة خبراء', 70, now());                   -- 18
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('تحكيم', 80, now());                        -- 11
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('طب شرعي', 90, now());                      -- 10
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('مفوضين', 100, now());                      -- 8
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('لجنة تفتيش', 110, now());                  -- 6
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('قسم', 120, now());                         -- 3
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('محكمة مجلس الدولة بالرحاب', 130, now());   -- 3
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('محضر', 140, now());                        -- 2
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('معاينة', 150, now());                      -- 2
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('رفع الدعوى', 160, now());                  -- 2 (incl. 1 merged)
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('قسم شرطة', 170, now());                    -- 1
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('تحقيق', 180, now());                       -- 1  NOT the same as تحكيم
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('حضور جلسة', 190, now());                   -- 1
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('أول جلسة', 200, now());                    -- 1

-- ---------------------------------------------------------------------------
--  3. lookup_client_branch — remove the duplicate only
--
--  A single DELETE, not a rebuild: the other 31 values and their ids are
--  unchanged, and the firm has an open question about what this column means
--  that will be settled before task 6.2. No point renumbering twice.
-- ---------------------------------------------------------------------------
DELETE FROM "lookup_client_branch" WHERE label_ar = 'جنح';

-- ==========================================================================
--  ASSERT — rule 15
-- ==========================================================================
DO $CORRECT$
DECLARE
    actual integer;
    grand  integer := 0;
BEGIN
    -- Every list, including the six the correction did not touch: a
    -- correction is exactly when an unrelated list gets damaged by accident.
    SELECT count(*) INTO actual FROM "lookup_matter_type";        grand := grand + actual;
    IF actual <> 14 THEN RAISE EXCEPTION 'lookup_matter_type: % rows, expected 14', actual; END IF;

    SELECT count(*) INTO actual FROM "lookup_matter_category";    grand := grand + actual;
    IF actual <> 21 THEN RAISE EXCEPTION 'lookup_matter_category: % rows, expected 21', actual; END IF;

    SELECT count(*) INTO actual FROM "lookup_degree";             grand := grand + actual;
    IF actual <> 12 THEN RAISE EXCEPTION 'lookup_degree: % rows, expected 12', actual; END IF;

    SELECT count(*) INTO actual FROM "lookup_venue";              grand := grand + actual;
    IF actual <> 7  THEN RAISE EXCEPTION 'lookup_venue: % rows, expected 7', actual; END IF;

    SELECT count(*) INTO actual FROM "lookup_importance";         grand := grand + actual;
    IF actual <> 3  THEN RAISE EXCEPTION 'lookup_importance: % rows, expected 3', actual; END IF;

    SELECT count(*) INTO actual FROM "lookup_party_role";         grand := grand + actual;
    IF actual <> 11 THEN RAISE EXCEPTION 'lookup_party_role: % rows, expected 11', actual; END IF;

    SELECT count(*) INTO actual FROM "lookup_hearing_action";     grand := grand + actual;
    IF actual <> 20 THEN RAISE EXCEPTION 'lookup_hearing_action: % rows, expected 20', actual; END IF;

    SELECT count(*) INTO actual FROM "lookup_matter_destination"; grand := grand + actual;
    IF actual <> 27 THEN RAISE EXCEPTION 'lookup_matter_destination: % rows, expected 27', actual; END IF;

    SELECT count(*) INTO actual FROM "lookup_client_branch";      grand := grand + actual;
    IF actual <> 31 THEN RAISE EXCEPTION 'lookup_client_branch: % rows, expected 31', actual; END IF;

    IF grand <> 146 THEN
        RAISE EXCEPTION 'lookups: % rows in total, expected 146', grand;
    END IF;

    -- The merged spellings must be GONE as list entries.
    SELECT count(*) INTO actual FROM "lookup_hearing_action"
     WHERE label_ar IN ('محكمه', 'مجكمة', 'رفع الدعوي');
    IF actual <> 0 THEN
        RAISE EXCEPTION 'the merged hearing-action spellings are still present: % rows', actual;
    END IF;

    SELECT count(*) INTO actual FROM "lookup_client_branch" WHERE label_ar = 'جنح';
    IF actual <> 0 THEN RAISE EXCEPTION 'client_branch جنح is still present'; END IF;

    -- ...and the values they merged INTO must be present. Deleting both sides
    -- would also satisfy the check above.
    SELECT count(*) INTO actual FROM "lookup_hearing_action"
     WHERE label_ar IN ('محكمة', 'رفع الدعوى');
    IF actual <> 2 THEN
        RAISE EXCEPTION 'the merge targets are missing: % of 2 present', actual;
    END IF;

    SELECT count(*) INTO actual FROM "lookup_client_branch" WHERE label_ar = 'الجنح';
    IF actual <> 1 THEN RAISE EXCEPTION 'client_branch الجنح is missing'; END IF;

    -- تحكيم and تحقيق are different words and must BOTH survive.
    SELECT count(*) INTO actual FROM "lookup_hearing_action"
     WHERE label_ar IN ('تحكيم', 'تحقيق');
    IF actual <> 2 THEN
        RAISE EXCEPTION 'تحكيم and تحقيق must both exist: % of 2 present', actual;
    END IF;

    -- Four crosswalk rows, so Stage 2 can map the old text.
    SELECT count(*) INTO actual FROM "migration_crosswalk";
    IF actual <> 4 THEN
        RAISE EXCEPTION 'migration_crosswalk: % rows, expected 4', actual;
    END IF;

    -- Every crosswalk target must be a value that actually exists, or the
    -- mapping sends a hearing to a list entry that is not there.
    SELECT count(*) INTO actual
      FROM "migration_crosswalk" c
     WHERE c.target_field = 'hearing_action'
       AND NOT EXISTS (SELECT 1 FROM "lookup_hearing_action" l
                        WHERE l.label_ar = c.target_value);
    IF actual <> 0 THEN
        RAISE EXCEPTION '% crosswalk rows point at a hearing action that does not exist', actual;
    END IF;

    SELECT count(*) INTO actual
      FROM "migration_crosswalk" c
     WHERE c.target_field = 'client_branch'
       AND NOT EXISTS (SELECT 1 FROM "lookup_client_branch" l
                        WHERE l.label_ar = c.target_value);
    IF actual <> 0 THEN
        RAISE EXCEPTION '% crosswalk rows point at a client branch that does not exist', actual;
    END IF;

    RAISE NOTICE 'lookup corrections applied: 146 rows across 9 lists, 4 crosswalk rules';
END
$CORRECT$;
