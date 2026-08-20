-- ===========================================================================
--  Runs ONCE, when the database is first created, and never again.
--
--  It creates nothing. Extensions, collations and tables are all owned by
--  Prisma migrations (prisma/migrations), because `prisma migrate reset`
--  rebuilds the public schema and would discard anything created out here.
--
--  What this file checks are the three things a migration can NEVER fix,
--  because they are fixed at the moment the database cluster is created:
--
--      the character encoding
--      the collation provider
--      the locale
--
--  Getting any of them wrong means Arabic is stored or ordered incorrectly
--  for the life of the database, and the only remedy is to build it again.
--  Better to refuse to start.
-- ===========================================================================

\echo '--- litigation: checking cluster settings ---'

DO $CHECK$
DECLARE
    enc      text;
    provider "char";
    loc      text;
    icu_ar   integer;
BEGIN
    SELECT pg_encoding_to_char(d.encoding),
           d.datlocprovider,
           coalesce(to_jsonb(d) ->> 'datlocale',      -- PostgreSQL 17+
                    to_jsonb(d) ->> 'daticulocale',   -- PostgreSQL 16
                    d.datcollate)
      INTO enc, provider, loc
      FROM pg_database d
     WHERE d.datname = current_database();

    IF enc <> 'UTF8' THEN
        RAISE EXCEPTION
            'encoding is %, must be UTF8. Arabic cannot be stored correctly '
            'otherwise. Rebuild: npm run db:reset', enc;
    END IF;

    IF provider <> 'i' THEN
        RAISE EXCEPTION
            'collation provider is %, must be icu. Rebuild: npm run db:reset',
            provider;
    END IF;

    IF loc IS NULL OR loc NOT LIKE 'ar%' THEN
        RAISE EXCEPTION
            'locale is %, expected an Arabic locale such as ar-EG. '
            'Rebuild: npm run db:reset', coalesce(loc, '(none)');
    END IF;

    -- ICU has to be compiled into this PostgreSQL build, with Arabic data.
    SELECT count(*) INTO icu_ar
      FROM pg_collation
     WHERE collname LIKE 'ar%x-icu';

    IF icu_ar = 0 THEN
        RAISE EXCEPTION
            'this PostgreSQL build has no ICU Arabic collations. Use the '
            'official postgres image, not an Alpine build.';
    END IF;

    RAISE NOTICE
        'cluster OK: encoding=%, provider=icu, locale=%, ICU Arabic collations=%',
        enc, loc, icu_ar;
END
$CHECK$;

\echo '--- litigation: cluster OK. Run `npm run db:migrate` to build the schema. ---'
