-- ===========================================================================
--  0023 — `26` IS A CIRCUIT, NOT RUBBISH
--
--  The firm's correction, 23 August 2026. Corrects migration 0022, which
--  recorded `26` as a discard. Source of truth: sql/court-wrong-destinations.sql.
--
--  THE FACT THAT CHANGED
--
--  One row in `admin work table` has NO CIRCUIT RECORDED and the value `26`
--  sitting in its court box. Somebody typed the circuit number into the wrong
--  column. `26` is therefore not a non-value at all — it is a real circuit in
--  the wrong place.
--
--      circuit  =  26         <- the value lands, in the right column
--      court    =  UNKNOWN    <- genuinely null. NOT court `26`.
--
--  BOTH HALVES MATTER AND BOTH ARE ASSERTED BELOW. Recording court = '26'
--  would invent a court that does not exist and would be worse than the
--  discard it replaces: the discard at least left the field honestly empty.
--  Nobody knows which court that row was heard in. Unknown is the answer.
--
--  ONE COURT DISCARD, NOT TWO. Only `/` remains. The two rows looked alike
--  and are not alike: the `/` row ALREADY carries a real circuit,
--  `الاثنين مدني (ه)`, which is what shows `/` was a placeholder typed where
--  a court name should have gone — not a circuit in the wrong box.
--
--  A NEW KIND OF CROSSWALK RULE — the first TEXT TARGET
--
--  Until now every rule was one of three things:
--
--      a list name       'court', 'matter_category', 'degree', …
--                        target_value MUST exist in that list
--      a marker          'quarantine', 'separate_client'
--                        carries no target_value at all
--      NULL              discarded; the row simply loses the value
--
--  A circuit is none of them. By D20 the circuit is TEXT and deliberately NOT
--  a list — 1,281 distinct values that are a circuit number plus a specialism
--  (`1 عمال`, `8 تجاري`), varying by court. There is nothing to point at.
--
--  So 'circuit' is recognised, is never resolved against a list, and MUST
--  carry a non-empty target_value.
--
--  THAT LAST REQUIREMENT IS THE WHOLE POINT. A rule kind that were merely
--  exempt from the resolve check would be a hole: a circuit rule with a NULL
--  target would pass the "unrecognised" check (it is recognised) AND the
--  "dangling" check (it is not resolved), and read as perfectly healthy while
--  carrying nothing. That is the exact shape of fault set out in "An
--  assertion tests what it looks at, and nothing else" in docs/MIGRATION.md —
--  the two split rules with no member rows had no member row to fail. A new
--  class needs its own positive assertion, not an exemption.
--
--  The invariant is permanent, so per CLAUDE.md rule 16 it lives in
--  npm run db:check as well as here. This migration proves the moment; the
--  check proves it every time anyone looks.
-- ===========================================================================

UPDATE migration_crosswalk
SET    target_field  = 'circuit',
       target_value  = '26',
       reviewer_note = 'CIRCUIT, not a discard. The firm, 23 Aug 2026: this ' ||
                       'row has no circuit recorded and the circuit number ' ||
                       'was typed into the court box. Load circuit=''26''. ' ||
                       'THE COURT IS UNKNOWN — leave it NULL, never ''26'', ' ||
                       'never inferred. legacy_court_raw keeps the original.'
WHERE  source_field = 'court'
  AND  source_value = '26';


-- ===========================================================================
--  POSTCONDITIONS
-- ===========================================================================
DO $$
DECLARE
    n         integer;
    v_field   text;
    v_value   text;
BEGIN
    --  1. Exactly one row was changed. Rule 15's habit: a statement that
    --     matches on a source value states how many rows it expects.
    SELECT count(*) INTO n
    FROM   migration_crosswalk
    WHERE  source_field = 'court' AND source_value = '26';
    IF n <> 1 THEN
        RAISE EXCEPTION '`26`: expected exactly 1 crosswalk row, got %', n;
    END IF;

    --  2. HALF ONE — THE CIRCUIT LANDS. Field and value both, not just the
    --     field: 'circuit' with a NULL value would be the hole this rule kind
    --     was designed to refuse.
    SELECT target_field, target_value INTO v_field, v_value
    FROM   migration_crosswalk
    WHERE  source_field = 'court' AND source_value = '26';

    IF v_field IS DISTINCT FROM 'circuit' THEN
        RAISE EXCEPTION '`26`: target_field is %, expected circuit',
                        coalesce(v_field, 'NULL');
    END IF;
    IF v_value IS DISTINCT FROM '26' THEN
        RAISE EXCEPTION '`26`: circuit value is %, expected 26',
                        coalesce(v_value, 'NULL');
    END IF;

    --  3. HALF TWO — THE COURT IS GENUINELY UNKNOWN.
    --
    --     Three things have to be true for that to mean anything, because
    --     "the court is null" can be satisfied accidentally in more than one
    --     way and only one of them is the right way.
    --
    --     (a) `26` is not in lookup_court. If it were, Stage 2 could resolve
    --         the raw text to a court by the ordinary path and the rule would
    --         be bypassed entirely — court = '26' by the back door.
    SELECT count(*) INTO n FROM lookup_court WHERE label_ar = '26';
    IF n <> 0 THEN
        RAISE EXCEPTION '`26` is in lookup_court (% rows). The court for that '
                        'row is UNKNOWN and must not be resolvable to a court',
                        n;
    END IF;

    --     (b) The rule is not a SPLIT. A SPLIT is the one rule kind that
    --         writes a court AND something else, and its target_value IS the
    --         court part. If this row were ever turned into a SPLIT it would
    --         start writing a court again while still looking like a circuit
    --         rule to a casual read.
    SELECT count(*) INTO n
    FROM   migration_crosswalk
    WHERE  source_field = 'court' AND source_value = '26'
      AND  target_field = 'SPLIT';
    IF n <> 0 THEN
        RAISE EXCEPTION '`26` has become a SPLIT. A SPLIT writes a court; '
                        'this row must write ONLY a circuit';
    END IF;

    --     (c) There is no second rule for `26` pointing anywhere else. The
    --         unique constraint on (source_field, source_value) covers the
    --         court field; this catches a `26` smuggled in under another
    --         source_field that a court transform might also read.
    SELECT count(*) INTO n
    FROM   migration_crosswalk
    WHERE  source_value = '26' AND source_field <> 'court';
    IF n <> 0 THEN
        RAISE EXCEPTION '`26` has % other crosswalk rule(s) under a different '
                        'source_field', n;
    END IF;

    --  4. EXACTLY ONE COURT DISCARD, AND IT IS `/`.
    --
    --     Asserted in both directions. "How many" alone would be satisfied by
    --     discarding the wrong single value; "is `/` a discard" alone would
    --     be satisfied while a second discard sat beside it.
    SELECT count(*) INTO n
    FROM   migration_crosswalk
    WHERE  source_field = 'court' AND target_field IS NULL;
    IF n <> 1 THEN
        RAISE EXCEPTION 'court discards: expected exactly 1, got %', n;
    END IF;

    SELECT count(*) INTO n
    FROM   migration_crosswalk
    WHERE  source_field = 'court' AND target_field IS NULL
      AND  source_value = '/';
    IF n <> 1 THEN
        RAISE EXCEPTION 'the one court discard is not `/`';
    END IF;

    --  5. EVERY TEXT-TARGET RULE CARRIES A NON-EMPTY VALUE. Written as a
    --     rule over the class, not as a second look at `26`, so it still
    --     holds when Stage 2 adds more circuit rules — and Stage 2 will:
    --     the الجيزة الابتدائية / (السودان) rows are flagged for exactly
    --     this treatment at Gate 3.
    SELECT count(*) INTO n
    FROM   migration_crosswalk
    WHERE  target_field = 'circuit'
      AND  (target_value IS NULL OR btrim(target_value) = '');
    IF n <> 0 THEN
        RAISE EXCEPTION '% circuit rule(s) carry no value. A text target must '
                        'carry its text — that is what makes it a rule and '
                        'not a discard wearing a name', n;
    END IF;

    --  6. NOTHING ELSE MOVED. 114 rules before, 114 after: this migration
    --     changes a row, it does not add or lose one. The cascade rule —
    --     if this figure has moved, something else has happened too.
    SELECT count(*) INTO n FROM migration_crosswalk;
    IF n <> 114 THEN
        RAISE EXCEPTION 'crosswalk: expected 114 rules, got %', n;
    END IF;

    --  7. The court list is untouched. `26` moving out of the discards must
    --     not have moved anything into or out of lookup_court.
    SELECT count(*) INTO n FROM lookup_court;
    IF n <> 308 THEN
        RAISE EXCEPTION 'lookup_court: expected 308 courts, got %', n;
    END IF;
END $$;
