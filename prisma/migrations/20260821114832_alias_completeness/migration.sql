-- ==========================================================================
--  ALIAS COMPLETENESS — 21 August 2026
--
--  339 -> 347 aliases, in two parts. Both approved by the firm.
--
--  WHY IT MATTERS
--  Rule 15 says every Arabic name is matched THROUGH person_name_alias, never
--  through people.name_ar. That only works if the alias table is a complete
--  index. It was not: six people had no alias equal to their own name, so
--  looking them up the correct way found nothing at all.
--
--  One of the six is سامي إبراهيم خطاب, a Milestone 4 test user whose login
--  must link to his existing record. That link would have silently found
--  nobody.
-- ==========================================================================

-- ---------------------------------------------------------------------------
--  1. Every person's own name becomes an alias. Six rows.
--
--  Written as a SELECT over people rather than six typed names: the value
--  inserted IS the value already stored, so there is nothing to mistype.
--  is_primary = true because a person's own name is their primary spelling —
--  safe here because none of the six has a primary alias yet, asserted below.
-- ---------------------------------------------------------------------------
INSERT INTO person_name_alias (person_id, alias_ar, is_primary)
SELECT p.id, p.name_ar, true
  FROM people p
 WHERE NOT EXISTS (SELECT 1 FROM person_name_alias a WHERE a.alias_ar = p.name_ar);

-- ---------------------------------------------------------------------------
--  2. Two spacing variants, confirmed by the firm as the same people.
--
--      محمد عبدالعزيز عبد الحافظ  ->  محمد عبد العزيز عبد الحافظ
--      عبدالرحمن البنا            ->  عبد الرحمن البنا
--
--  Added as ALIASES rather than by editing the split rules that use them: the
--  rule keeps its original text, the alias resolves it, and rule 15 works.
--
--  Matched by comparing with spaces removed, so the join cannot be broken by
--  a stray space on either side. A wrong LETTER still matches nothing, and
--  the count assertion below catches that.
-- ---------------------------------------------------------------------------
INSERT INTO person_name_alias (person_id, alias_ar, is_primary)
SELECT p.id, v.variant, false
  FROM (VALUES ('محمد عبدالعزيز عبد الحافظ'), ('عبدالرحمن البنا')) AS v(variant)
  JOIN people p ON replace(p.name_ar, ' ', '') = replace(v.variant, ' ', '');

-- ==========================================================================
--  ASSERT — rule 15
-- ==========================================================================
DO $ALIAS$
DECLARE
    actual integer;
BEGIN
    SELECT count(*) INTO actual FROM person_name_alias;
    IF actual <> 347 THEN
        RAISE EXCEPTION 'person_name_alias: % rows, expected 347', actual;
    END IF;

    -- The point of the exercise: the alias table is now a COMPLETE index, so
    -- matching through it can never miss a person.
    SELECT count(*) INTO actual
      FROM people p
     WHERE NOT EXISTS (SELECT 1 FROM person_name_alias a WHERE a.alias_ar = p.name_ar);
    IF actual <> 0 THEN
        RAISE EXCEPTION '% people are still not findable through their own name', actual;
    END IF;

    -- Nobody gained a second primary spelling.
    SELECT count(*) INTO actual FROM (
        SELECT person_id FROM person_name_alias WHERE is_primary
         GROUP BY person_id HAVING count(*) > 1) d;
    IF actual <> 0 THEN
        RAISE EXCEPTION '% people have more than one primary alias', actual;
    END IF;

    -- Both spacing variants resolve, and to the right people. Checked by the
    -- TARGET name, so a variant attached to the wrong person still fails.
    SELECT count(*) INTO actual
      FROM person_name_alias a JOIN people p ON p.id = a.person_id
     WHERE a.alias_ar = 'محمد عبدالعزيز عبد الحافظ'
       AND p.name_ar = 'محمد عبد العزيز عبد الحافظ';
    IF actual <> 1 THEN
        RAISE EXCEPTION 'the محمد عبدالعزيز spacing variant does not resolve correctly';
    END IF;

    SELECT count(*) INTO actual
      FROM person_name_alias a JOIN people p ON p.id = a.person_id
     WHERE a.alias_ar = 'عبدالرحمن البنا'
       AND p.name_ar = 'عبد الرحمن البنا';
    IF actual <> 1 THEN
        RAISE EXCEPTION 'the عبدالرحمن البنا spacing variant does not resolve correctly';
    END IF;

    -- Still one spelling per person.
    SELECT count(*) INTO actual FROM (
        SELECT alias_ar FROM person_name_alias GROUP BY alias_ar HAVING count(*) > 1) d;
    IF actual <> 0 THEN
        RAISE EXCEPTION '% spellings map to more than one person', actual;
    END IF;

    RAISE NOTICE 'aliases completed: 347 rows, every person findable through their own name';
END
$ALIAS$;
