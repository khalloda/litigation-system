-- ===========================================================================
--  0001 — PostgreSQL extensions and the Arabic collation
--
--  These are database contents, so they belong in a migration rather than in
--  the Docker start-up script. `prisma migrate reset` drops and rebuilds the
--  public schema, which would take an extension or a collation created
--  outside a migration with it. Owning them here means any database reaches
--  the correct state by replaying migrations, and stays there.
--
--  The Docker start-up script checks the things that CANNOT be fixed by a
--  migration — the encoding, the collation provider and the locale, all of
--  which are fixed when the database cluster is first created.
-- ===========================================================================

-- ---------------------------------------------------------------------------
--  Extensions
-- ---------------------------------------------------------------------------

-- pg_trgm indexes fragments of text, so a partial name typed into a search
-- box finds the record quickly across 13,279 hearings without reading every
-- row. Used by the Arabic search in task 1.6.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- btree_gin lets a single index cover a text search AND a plain filter at the
-- same time (this client, and this word). Without it those need two separate
-- indexes and the database can only use one of them.
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- unaccent strips Latin accents. The Arabic normaliser is our own function
-- (task 1.6); this handles the Latin half of mixed names such as
-- شركة هيوليت باكارد HP.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------------------
--  Arabic collation
--
--  A collation is the rule for what "in order" means. Byte order puts أحمد
--  and احمد — the same name, one typed without the hamza — in different parts
--  of an alphabetical list, with unrelated names in between. ICU knows they
--  are the same letter and keeps them together.
--
--  SORTING only. Finding a record regardless of hamza is the normaliser,
--  task 1.6.
--
--  Usage:  ORDER BY name_ar COLLATE "arabic"
-- ---------------------------------------------------------------------------
CREATE COLLATION IF NOT EXISTS arabic (
    provider      = icu,
    locale        = 'ar-EG',
    deterministic = true
);

COMMENT ON COLLATION arabic IS
    'Egyptian Arabic sort order. Use on Arabic text columns and in ORDER BY. '
    'Sorting only — searching without hamza is the normaliser (task 1.6).';

-- ---------------------------------------------------------------------------
--  Prove it, do not assume it
--
--  Every one of these could "succeed" and leave the database subtly wrong.
--  A missing extension or a collation that exists but sorts by bytes would
--  not surface until a name list looked odd months from now. Fail here
--  instead, where someone is watching.
-- ---------------------------------------------------------------------------
DO $CHECK$
DECLARE
    missing text[];
    sorted  text[];
BEGIN
    SELECT array_agg(e ORDER BY e) INTO missing
    FROM   unnest(ARRAY['pg_trgm', 'btree_gin', 'unaccent']) AS e
    WHERE  NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = e);

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'extensions failed to install: %', missing;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'arabic') THEN
        RAISE EXCEPTION 'the "arabic" collation was not created';
    END IF;

    -- أحمد and احمد differ only by the hamza and must sort next to each
    -- other, both before بسام. Byte order puts بسام between them.
    SELECT array_agg(word ORDER BY word COLLATE "arabic") INTO sorted
    FROM   unnest(ARRAY['بسام', 'احمد', 'أحمد']) AS word;

    IF sorted[3] <> 'بسام' THEN
        RAISE EXCEPTION
            'the "arabic" collation is not sorting Arabic correctly. Got: %',
            sorted;
    END IF;
END
$CHECK$;
