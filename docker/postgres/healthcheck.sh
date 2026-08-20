#!/usr/bin/env bash
# ===========================================================================
#  Health check for the litigation database.
#
#  This deliberately checks MORE than "is PostgreSQL answering". If the
#  one-time setup script fails, PostgreSQL itself still starts perfectly well
#  — it just has no Arabic collation and no search extensions. Docker then
#  restarts the container, the setup is skipped because the data folder is no
#  longer empty, and everything reports healthy while being quietly broken.
#
#  Checking the setup here means a broken database never reports healthy, and
#  `docker compose up -d --wait` fails where you can see it.
# ===========================================================================
set -euo pipefail

pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -q

result=$(psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "
    SELECT CASE
        WHEN (SELECT count(*) FROM pg_collation
              WHERE collname = 'arabic') <> 1
            THEN 'missing Arabic collation'
        WHEN (SELECT count(*) FROM pg_extension
              WHERE extname IN ('pg_trgm', 'btree_gin', 'unaccent')) <> 3
            THEN 'missing search extensions'
        ELSE 'ok'
    END")

if [ "$result" != "ok" ]; then
    echo "database setup incomplete: $result" >&2
    echo "run: npm run db:reset" >&2
    exit 1
fi
