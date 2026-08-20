-- ===========================================================================
--  Runs ONCE, the first time the database is created.
--
--  If you change this file afterwards it will NOT run again — PostgreSQL only
--  executes these scripts against an empty data folder. To apply a change:
--      npm run db:reset      (destroys the database and rebuilds it)
--  See docs/DATABASE.md.
-- ===========================================================================

\echo '--- litigation: creating extensions and Arabic collation ---'

-- ---------------------------------------------------------------------------
--  Extensions
-- ---------------------------------------------------------------------------

-- pg_trgm powers the Arabic search in task 1.6. It indexes fragments of text
-- so that a partial name typed into a search box finds the record quickly,
-- across 13,279 hearings, without reading every row.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- btree_gin lets one index cover a text search AND a plain filter together
-- (for example: this client, and this word). Without it those need two
-- indexes and the database picks one.
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- unaccent strips Latin accents. The Arabic normaliser in task 1.6 is our own
-- function, not this one, but client names contain Latin text too
-- (شركة هيوليت باكارد HP) and this handles that half.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------------------
--  Arabic collation
--
--  A collation is the rule for what "in order" means. The default byte order
--  puts أحمد and احمد in different parts of an alphabetical list, because the
--  hamza form أ is a different character from ا. ICU knows they are the same
--  letter and sorts them together, which is what a person expects.
--
--  This is about SORTING only. Finding a record regardless of hamza is a
--  separate mechanism — the normaliser in task 1.6.
-- ---------------------------------------------------------------------------
CREATE COLLATION IF NOT EXISTS arabic (
    provider      = icu,
    locale        = 'ar-EG',
    deterministic = true
);

COMMENT ON COLLATION arabic IS
    'Egyptian Arabic sort order. Use on Arabic text columns and in ORDER BY: '
    'ORDER BY name_ar COLLATE "arabic". Sorting only — searching without '
    'hamza is handled by the normaliser (task 1.6).';

-- ---------------------------------------------------------------------------
--  Fail the build if ICU Arabic is missing
--
--  Without this the container would start happily and Arabic name lists would
--  quietly come out in the wrong order — the kind of fault nobody reports
--  because it just looks like the list is a bit odd.
-- ---------------------------------------------------------------------------
DO $CHECK$
DECLARE
    collation_count integer;
    sorted          text[];
BEGIN
    SELECT count(*) INTO collation_count
    FROM   pg_collation WHERE collname = 'arabic';

    IF collation_count <> 1 THEN
        RAISE EXCEPTION 'Arabic ICU collation was not created (found % rows)',
                        collation_count;
    END IF;

    -- Prove it ORDERS the way we need, rather than merely existing.
    -- أحمد and احمد differ only by the hamza and must sort next to each
    -- other, both before بسام. Byte order interleaves بسام between them.
    SELECT array_agg(word ORDER BY word COLLATE "arabic") INTO sorted
    FROM   unnest(ARRAY['بسام', 'احمد', 'أحمد']) AS word;

    IF sorted[3] <> 'بسام' THEN
        RAISE EXCEPTION 'Arabic collation is not sorting correctly. Got: %',
                        sorted;
    END IF;

    RAISE NOTICE 'Arabic collation verified: %', sorted;
END
$CHECK$;

\echo '--- litigation: database ready ---'
