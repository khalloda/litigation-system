-- ==========================================================================
--  ONE PRIMARY ALIAS PER PERSON — ENFORCED BY THE DATABASE
--
--  Found by the Codex review of Stage 1. A live defect, and every one of the
--  17 db:check checks passed while it was there.
--
--  WHAT WAS WRONG
--  --------------
--  Two people carried TWO primary aliases each:
--
--      أحمد عبد الله   primary as أحمد عبد الله AND احمد عبدالله
--      أحمد فرحات      primary as أحمد فرحات    AND احمد فرحات
--
--  Migration 0005 asserted that nobody had more than one primary alias, and
--  it was true when it ran. Migration 0006 then merged three phantom people
--  into their real counterparts with
--
--      UPDATE person_name_alias SET person_id = target_id WHERE person_id = ...
--
--  which moved each phantom's primary alias onto the survivor without
--  demoting it — and never re-checked. The third merge escaped only by luck:
--  خالد عطية already existed on the target as a NON-primary spelling.
--
--  WHY IT MATTERS
--  --------------
--  The primary alias is the spelling the system shows for a person. Two of
--  them means the answer to "what is this person called?" depends on which
--  row a query happens to read first. It is also the exact shape of fault
--  this project keeps meeting: two spellings of one person, disagreeing.
--
--  THE REAL LESSON — AN ASSERTION THAT RUNS ONCE IS A SNAPSHOT
--  ----------------------------------------------------------
--  Migration 0005's check was not wrong. It was momentary. It proved a fact
--  about the database on 21 August at 11:48 and could say nothing about 21
--  August at 12:17, when 0006 broke it.
--
--  So this migration does not merely repair the rows. Anything that must
--  stay true forever belongs in the DATABASE or in db:check, not only in the
--  migration that first established it:
--
--    * the partial unique index below makes a second primary IMPOSSIBLE,
--      whatever a future migration does
--    * db:check now asserts exactly one primary per person, that the primary
--      spelling equals people.name_ar, and that this index still exists
--
--  A constraint outranks a check: a check tells you afterwards, a constraint
--  refuses at the moment of the mistake. The check is kept as well, because
--  an index can be dropped and something must notice.
-- ==========================================================================

DO $PRIMARY$
DECLARE n integer;
BEGIN
    -- ----------------------------------------------------------------------
    --  0. The state this migration was written against
    --
    --  Every person already has a correct primary — the spelling equal to
    --  their own name_ar. The two faulty rows are SURPLUS, not replacements,
    --  so demoting them cannot leave anybody without a primary. That is
    --  asserted here rather than assumed, because if it were not true the
    --  repair below would silently strip two people of their display name.
    -- ----------------------------------------------------------------------
    SELECT count(DISTINCT a.person_id) INTO n
      FROM "person_name_alias" a JOIN "people" p ON p.id = a.person_id
     WHERE a.is_primary AND a.alias_ar = p.name_ar;
    IF n <> 135 THEN
        RAISE EXCEPTION 'only % of 135 people have a primary alias equal to their own name; the repair below is not safe', n;
    END IF;

    SELECT count(*) INTO n
      FROM "person_name_alias" a JOIN "people" p ON p.id = a.person_id
     WHERE a.is_primary AND a.alias_ar <> p.name_ar;
    IF n <> 2 THEN
        RAISE EXCEPTION 'expected exactly 2 surplus primary aliases, found %', n;
    END IF;

    -- ----------------------------------------------------------------------
    --  1. Demote the two spellings migration 0006 carried across
    --
    --  Demoted, never deleted. Both are real spellings that appear in the
    --  Access data and both must keep resolving to their person — that is
    --  what the alias table is for (D10, rule 15). Only the "this is the
    --  name we show" flag comes off.
    -- ----------------------------------------------------------------------
    UPDATE "person_name_alias" a
       SET is_primary = false
      FROM "people" p
     WHERE p.id = a.person_id
       AND a.is_primary
       AND a.alias_ar <> p.name_ar;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 2 THEN
        RAISE EXCEPTION 'demoting the surplus primaries touched % rows, expected 2', n;
    END IF;

    -- ----------------------------------------------------------------------
    --  2. Every person has exactly one primary, and it is their own name
    -- ----------------------------------------------------------------------
    SELECT count(*) INTO n FROM (
        SELECT a.person_id FROM "person_name_alias" a
         WHERE a.is_primary GROUP BY a.person_id HAVING count(*) <> 1
    ) bad;
    IF n <> 0 THEN
        RAISE EXCEPTION '% people do not have exactly one primary alias', n;
    END IF;

    -- Counted from the PEOPLE side as well. "No person has two primaries" is
    -- also satisfied by a person who has none, and a person with no primary
    -- has no name to display.
    SELECT count(*) INTO n FROM "people" p
     WHERE NOT EXISTS (SELECT 1 FROM "person_name_alias" a
                        WHERE a.person_id = p.id AND a.is_primary);
    IF n <> 0 THEN
        RAISE EXCEPTION '% people have no primary alias at all', n;
    END IF;

    SELECT count(*) INTO n
      FROM "person_name_alias" a JOIN "people" p ON p.id = a.person_id
     WHERE a.is_primary AND a.alias_ar <> p.name_ar;
    IF n <> 0 THEN
        RAISE EXCEPTION '% primary aliases are not the person''s own name', n;
    END IF;

    -- Nothing was lost on the way. Demoting must not delete.
    SELECT count(*) INTO n FROM "person_name_alias";
    IF n <> 347 THEN
        RAISE EXCEPTION 'person_name_alias: % rows, expected 347 — a spelling was lost', n;
    END IF;

    -- Both demoted spellings must STILL resolve to their person. This is the
    -- half that "the duplicate is gone" cannot see: deleting the row would
    -- satisfy that check too, and would lose a spelling the Access data uses.
    SELECT count(*) INTO n
      FROM "person_name_alias" a JOIN "people" p ON p.id = a.person_id
     WHERE (a.alias_ar = 'احمد عبدالله' AND p.name_ar = 'أحمد عبد الله')
        OR (a.alias_ar = 'احمد فرحات'   AND p.name_ar = 'أحمد فرحات');
    IF n <> 2 THEN
        RAISE EXCEPTION 'the two demoted spellings no longer resolve to their person: % of 2', n;
    END IF;
END
$PRIMARY$;

-- --------------------------------------------------------------------------
--  3. Make a second primary impossible
--
--  A partial unique index: at most one row per person may have is_primary
--  true, and the index simply does not cover the false rows, so a person may
--  have as many ordinary spellings as the data demands.
--
--  Raw SQL because the Prisma schema language cannot express a filtered
--  index on PostgreSQL. It is therefore invisible to schema.prisma, which is
--  why db:check asserts the index EXISTS as well as asserting the invariant
--  it protects — see scripts/check-db.ts.
-- --------------------------------------------------------------------------
CREATE UNIQUE INDEX "person_name_alias_one_primary_per_person"
    ON "person_name_alias" ("person_id")
 WHERE "is_primary";
