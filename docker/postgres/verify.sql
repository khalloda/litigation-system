-- ===========================================================================
--  Database self-check.  Run it with:  npm run db:verify
--
--  Every line should read PASS. Anything else means the database is not set
--  up the way the application expects, and nothing should be built on top of
--  it until that is fixed.
-- ===========================================================================

\pset border 2
\pset format aligned

SELECT
    'PostgreSQL version'                                        AS check,
    current_setting('server_version')                           AS value,
    CASE WHEN current_setting('server_version_num')::int >= 160000
         THEN 'PASS' ELSE 'FAIL — needs 16 or newer' END        AS result

UNION ALL SELECT
    'Encoding',
    pg_encoding_to_char(encoding),
    CASE WHEN pg_encoding_to_char(encoding) = 'UTF8'
         THEN 'PASS' ELSE 'FAIL — Arabic needs UTF8' END
FROM pg_database WHERE datname = current_database()

UNION ALL SELECT
    'Default collation provider',
    CASE datlocprovider WHEN 'i' THEN 'icu' WHEN 'c' THEN 'libc'
         WHEN 'b' THEN 'builtin' ELSE datlocprovider::text END,
    CASE WHEN datlocprovider = 'i'
         THEN 'PASS' ELSE 'FAIL — expected icu' END
FROM pg_database WHERE datname = current_database()

UNION ALL SELECT
    'Database locale',
    -- PostgreSQL 17 renamed daticulocale to datlocale. Read whichever this
    -- server has, so a version bump does not turn this check into a lie.
    coalesce(to_jsonb(d) ->> 'datlocale',
             to_jsonb(d) ->> 'daticulocale',
             d.datcollate, '(none)'),
    CASE WHEN coalesce(to_jsonb(d) ->> 'datlocale',
                       to_jsonb(d) ->> 'daticulocale', '') LIKE 'ar%'
         THEN 'PASS' ELSE 'FAIL — expected an Arabic locale' END
FROM pg_database d WHERE d.datname = current_database()

UNION ALL SELECT
    'Named collation "arabic"',
    coalesce((SELECT colllocale FROM pg_collation WHERE collname = 'arabic'), '(missing)'),
    CASE WHEN EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'arabic')
         THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT
    'Stock ICU Arabic collations',
    (SELECT count(*)::text FROM pg_collation WHERE collname LIKE 'ar%x-icu'),
    CASE WHEN (SELECT count(*) FROM pg_collation WHERE collname LIKE 'ar%x-icu') > 0
         THEN 'PASS' ELSE 'FAIL' END

UNION ALL SELECT
    'Extension ' || e,
    coalesce((SELECT extversion FROM pg_extension WHERE extname = e), '(missing)'),
    CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = e)
         THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY['pg_trgm', 'btree_gin', 'unaccent']) AS e;


-- ---------------------------------------------------------------------------
--  The behaviour that actually matters: does Arabic sort like a person
--  expects? أحمد and احمد differ only by the hamza. They must sit together,
--  both before بسام. Byte order puts أحمد first, then بسام, then احمد —
--  which is how a name list ends up looking scrambled.
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- Arabic sort order (ICU) — expect: احمد/أحمد together, then بسام ---'
SELECT n AS icu_order
FROM   unnest(ARRAY['بسام', 'احمد', 'أحمد', 'إبراهيم']) AS n
ORDER  BY n COLLATE "arabic";

\echo ''
\echo '--- The same list in raw byte order, for comparison ---'
SELECT n AS byte_order
FROM   unnest(ARRAY['بسام', 'احمد', 'أحمد', 'إبراهيم']) AS n
ORDER  BY n COLLATE "C";

\echo ''
\echo '--- Arabic survives a round trip through the connection ---'
SELECT 'الدعاوى والجلسات والتوكيلات' AS arabic_text,
       length('الدعاوى') AS should_be_7;
