#!/usr/bin/env bash
# ===========================================================================
#  Health check for the litigation database container.
#
#  It checks MORE than "is PostgreSQL answering", because PostgreSQL answers
#  perfectly well when it has been created with the wrong encoding or the
#  wrong collation provider — and those cannot be repaired afterwards.
#
#  It deliberately does NOT check for tables, extensions or the "arabic"
#  collation. Those are owned by Prisma migrations and are legitimately
#  absent on a freshly created database, before `npm run db:migrate` has run.
#  Checking for them here would make a correct empty database look broken.
# ===========================================================================
set -euo pipefail

pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -q

result=$(psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "
    SELECT CASE
        WHEN pg_encoding_to_char(d.encoding) <> 'UTF8'
            THEN 'encoding is not UTF8'
        WHEN d.datlocprovider <> 'i'
            THEN 'collation provider is not icu'
        WHEN coalesce(to_jsonb(d) ->> 'datlocale',
                      to_jsonb(d) ->> 'daticulocale', '') NOT LIKE 'ar%'
            THEN 'locale is not Arabic'
        WHEN (SELECT count(*) FROM pg_collation
              WHERE collname LIKE 'ar%x-icu') = 0
            THEN 'this PostgreSQL build has no ICU Arabic collations'
        ELSE 'ok'
    END
    FROM pg_database d WHERE d.datname = current_database()")

if [ "$result" != "ok" ]; then
    echo "database cluster is wrong: $result" >&2
    echo "this cannot be repaired in place. run: npm run db:reset" >&2
    exit 1
fi
