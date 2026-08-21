-- ==========================================================================
--  آراء قانونية IS A MATTER TYPE — CONFIRMED BY THE FIRM, 21 August 2026
--
--  Migration 0007 moved the client branch آراء قانونية to
--  matter_type رأي قانوني rather than to matter_category, which is what the
--  instruction said. The instruction was wrong and the value was right:
--  رأي قانوني does not exist in lookup_matter_category and does exist,
--  spelled exactly so, in lookup_matter_type (id 3).
--
--  The firm has now confirmed it. A legal opinion is A KIND OF WORK, not a
--  practice area — which is precisely the distinction D8 draws — and
--  رأي قانوني was confirmed as separate from استشارات during the
--  classification review. No new practice area is created.
--
--  This migration changes ONE THING: the reviewer_note, which still asked for
--  a confirmation that has now been given. The mapping itself is unchanged.
--
--  Worth a migration of its own because that note is what a person reads at
--  Stage 2 before deciding whether to trust the row. A note saying "CONFIRM
--  WITH THE FIRM" on a rule the firm has confirmed stops the wrong person,
--  twice, for nothing. And migration 0007 has already run, so it is history
--  and is never rewritten.
-- ==========================================================================

DO $CONFIRM$
DECLARE n integer;
BEGIN
    -- The row must be exactly where 0007 left it before the note is replaced.
    -- Asserted first, so this cannot quietly annotate some other rule.
    SELECT count(*) INTO n FROM "migration_crosswalk"
     WHERE source_field = 'client_branch'
       AND source_value = 'آراء قانونية'
       AND target_field = 'matter_type'
       AND target_value = 'رأي قانوني';
    IF n <> 1 THEN
        RAISE EXCEPTION 'the آراء قانونية rule is not where migration 0007 left it: % rows match', n;
    END IF;

    UPDATE "migration_crosswalk"
       SET reviewer_note = 'CONFIRMED BY THE FIRM 21 Aug 2026. A legal opinion is a kind of work, not a practice area (D8), and رأي قانوني is distinct from استشارات — settled during the classification review. The original instruction said matter_category; that was a slip and no such category exists. No new matter_category was created.'
     WHERE source_field = 'client_branch'
       AND source_value = 'آراء قانونية';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
        RAISE EXCEPTION 'confirming the آراء قانونية note touched % rows, expected 1', n;
    END IF;

    -- The mapping must be untouched, and رأي قانوني must still be a
    -- matter_type and still NOT a matter_category. Asserted from both sides:
    -- "the note changed" says nothing about whether the rule still resolves.
    SELECT count(*) INTO n FROM "lookup_matter_type" WHERE label_ar = 'رأي قانوني';
    IF n <> 1 THEN
        RAISE EXCEPTION 'matter_type رأي قانوني is missing';
    END IF;

    SELECT count(*) INTO n FROM "lookup_matter_category" WHERE label_ar = 'رأي قانوني';
    IF n <> 0 THEN
        RAISE EXCEPTION 'رأي قانوني was created as a matter_category — the firm ruled that it must not be';
    END IF;

    -- Nothing else moved.
    SELECT count(*) INTO n FROM "migration_crosswalk";
    IF n <> 20 THEN
        RAISE EXCEPTION 'migration_crosswalk: % rows, expected 20', n;
    END IF;

    SELECT count(*) INTO n FROM "lookup_client_branch";
    IF n <> 15 THEN
        RAISE EXCEPTION 'lookup_client_branch: % rows, expected 15', n;
    END IF;

    RAISE NOTICE 'آراء قانونية -> matter_type رأي قانوني confirmed by the firm';
END
$CONFIRM$;
