-- ==========================================================================
--  TEAM COMPOSITION — POSTCONDITION
--
--  Raised by the Codex review of Stage 1 as a SHOULD FIX. The data is
--  correct; the way it was produced was not, and nothing would have noticed
--  if it had gone wrong.
--
--  WHAT WAS WRONG
--  --------------
--  Migration 0004 set each team's reviewer with
--
--      UPDATE lookup_team SET reviewer_id =
--          (SELECT id FROM people WHERE name_ar = 'ناجي رمضان') ...
--
--  a direct match on people.name_ar. That is what D5 and CLAUDE.md rule 15
--  forbid, and it is the exact fault that has already cost this project two
--  duplicate people and three phantom ones. Had that name been spelled with
--  one hamza out of place, the sub-select would have returned NULL, the
--  UPDATE would have reported success, and both teams would have quietly
--  ended up with no reviewer at all.
--
--  Worse than a plain mistake: the comment a few lines below it says
--  "Matched through person_name_alias so a hamza variant cannot miss." That
--  is true of the MEMBERSHIP statements and untrue of the reviewer ones, and
--  a wrong comment stops the next reader checking. The membership statements
--  do go through the alias table and are correct.
--
--  WHY THIS MIGRATION AND NOT A CORRECTION
--  ---------------------------------------
--  0004 has run. An applied migration is history and is never rewritten. So
--  this asserts the RESULT that 0004 should have guaranteed, and does it on
--  every fresh database that replays the history — including the Ubuntu
--  server. npm run db:check asserts the same thing continuously afterwards,
--  because a migration assertion is a snapshot and this project has just
--  been bitten by exactly that (see migration 0009).
--
--  THE FIGURES, FROM sql/lookups-part2-and-teams.sql
--  -------------------------------------------------
--  BOTH teams have the same reviewer, ناجي رمضان. That looks like an error
--  and is not one — it is what Access recorded. Access "team 3" had the
--  different reviewer, د. هاني سري الدين, and is deliberately not created
--  (D6). هاني الدالي is a MEMBER of team ب, not its reviewer.
--
--  Membership is asserted as a SET, not as a count. "4 members" is satisfied
--  by four of the wrong people.
--
--  All future name resolution goes through person_name_alias. Rule 15.
-- ==========================================================================

DO $TEAMS$
DECLARE
    n integer;
    team_a_members text[] := ARRAY['إيهاب حمدي', 'مؤمن سليم', 'أحمد إسماعيل', 'أحمد سيف'];
    team_b_members text[] := ARRAY['محمد عبد العزيز عبد الحافظ', 'أحمد سعيد', 'هاني الدالي', 'محمود شعبان'];
BEGIN
    -- Two teams, and only two. Access team 3 must not have crept back in.
    SELECT count(*) INTO n FROM "lookup_team";
    IF n <> 2 THEN
        RAISE EXCEPTION 'lookup_team: % rows, expected 2', n;
    END IF;

    -- ---- reviewers -------------------------------------------------------
    -- Named person, named team. A count of "2 teams have a reviewer" would
    -- be satisfied by two teams reviewed by the wrong person.
    SELECT count(*) INTO n
      FROM "lookup_team" t JOIN "people" p ON p.id = t.reviewer_id
     WHERE (t.label_ar = 'الفريق أ' AND p.name_ar = 'ناجي رمضان')
        OR (t.label_ar = 'الفريق ب' AND p.name_ar = 'ناجي رمضان');
    IF n <> 2 THEN
        RAISE EXCEPTION 'team reviewers: % of 2 are ناجي رمضان — 0004 matched on name_ar and would have set NULL silently', n;
    END IF;

    -- ...and no team may be left without one, which the check above cannot
    -- see: a NULL reviewer_id simply drops out of the join.
    SELECT count(*) INTO n FROM "lookup_team" WHERE reviewer_id IS NULL;
    IF n <> 0 THEN
        RAISE EXCEPTION '% teams have no reviewer', n;
    END IF;

    -- ---- membership, as a set --------------------------------------------
    -- Every expected member is on the team...
    SELECT count(*) INTO n
      FROM "people" p JOIN "lookup_team" t ON t.id = p.team_id
     WHERE t.label_ar = 'الفريق أ' AND p.name_ar = ANY(team_a_members);
    IF n <> 4 THEN
        RAISE EXCEPTION 'team أ: % of its 4 expected members are on it', n;
    END IF;

    SELECT count(*) INTO n
      FROM "people" p JOIN "lookup_team" t ON t.id = p.team_id
     WHERE t.label_ar = 'الفريق ب' AND p.name_ar = ANY(team_b_members);
    IF n <> 4 THEN
        RAISE EXCEPTION 'team ب: % of its 4 expected members are on it', n;
    END IF;

    -- ...and nobody else is. Without this, a fifth person added to a team
    -- would pass every check above.
    SELECT count(*) INTO n
      FROM "people" p JOIN "lookup_team" t ON t.id = p.team_id
     WHERE (t.label_ar = 'الفريق أ' AND NOT (p.name_ar = ANY(team_a_members)))
        OR (t.label_ar = 'الفريق ب' AND NOT (p.name_ar = ANY(team_b_members)));
    IF n <> 0 THEN
        RAISE EXCEPTION '% people are on a team they are not expected to be on', n;
    END IF;

    -- The derived figures that hang off this, re-derived rather than assumed.
    -- A NULL team is valid and common: 16 of the 21 current staff have none,
    -- and team-grouped reports must show them under "unassigned" (D6).
    SELECT count(*) INTO n FROM "people" WHERE team_id IS NOT NULL;
    IF n <> 8 THEN
        RAISE EXCEPTION 'people with a team: %, expected 8', n;
    END IF;

    SELECT count(*) INTO n FROM "people"
     WHERE team_id IS NOT NULL AND is_staff AND is_active;
    IF n <> 5 THEN
        RAISE EXCEPTION 'current staff with a team: %, expected 5', n;
    END IF;

    -- Every team member must be findable through the alias table, since that
    -- is how every future statement will look them up. A person who is not
    -- is invisible to rule 15 even though they are plainly in the roster —
    -- which is precisely what task 1.2a had to repair for six people.
    SELECT count(*) INTO n
      FROM "people" p
     WHERE p.team_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "person_name_alias" a
                        WHERE a.person_id = p.id AND a.alias_ar = p.name_ar);
    IF n <> 0 THEN
        RAISE EXCEPTION '% team members are not findable through their own name', n;
    END IF;

    RAISE NOTICE 'teams verified: 2 teams, 4 + 4 named members, reviewer ناجي رمضان on both';
END
$TEAMS$;
