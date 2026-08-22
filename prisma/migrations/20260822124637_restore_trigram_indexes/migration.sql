-- CreateIndex
CREATE INDEX "clients_name_ar_normalised_idx" ON "clients" USING GIN ("name_ar_normalised" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "contacts_contact_name_normalised_idx" ON "contacts" USING GIN ("contact_name_normalised" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "matters_case_number_ar_normalised_idx" ON "matters" USING GIN ("case_number_ar_normalised" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "matters_subject_normalised_idx" ON "matters" USING GIN ("subject_normalised" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "people_name_ar_normalised_idx" ON "people" USING GIN ("name_ar_normalised" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "person_name_alias_alias_ar_normalised_idx" ON "person_name_alias" USING GIN ("alias_ar_normalised" gin_trgm_ops);

-- ==========================================================================
--  WHY THIS MIGRATION EXISTS
--
--  Task 1.6 created these six indexes in raw SQL, because Prisma is not told
--  about gin_trgm_ops in the ordinary way. The very next migration DROPPED
--  ALL SIX: Prisma removes an index whose columns it manages but which is not
--  in schema.prisma.
--
--  The earlier partial unique indexes — one primary alias per person, one
--  lead lawyer per matter — survived the same treatment, and I generalised
--  from them. That was the wrong generalisation. Prisma appears to ignore a
--  filtered index it cannot represent and to remove a plain one it can see.
--
--  **The lesson is the one already in docs/MIGRATION.md: prove the check on
--  the operation that would actually break it, not on a similar one.** I had
--  verified that `prisma migrate dev` left a partial index alone and treated
--  that as covering a different kind of index entirely.
--
--  Nothing was lost — the indexes are a speed feature, the data was never at
--  risk, and searching still worked, only slowly. What caught it was
--  db:check asserting the indexes EXIST, which was added for exactly this
--  reason: schema.prisma cannot see them, so nothing else would notice.
--
--  They are now declared in schema.prisma with `type: Gin` and
--  `ops: raw("gin_trgm_ops")`, so Prisma owns them and will not drop them
--  again. The names are Prisma's own (_idx rather than _trgm).
-- ==========================================================================

DO $TRGM$
DECLARE missing text;
BEGIN
    SELECT string_agg(x.name, ', ' ORDER BY x.name) INTO missing
      FROM (VALUES ('clients_name_ar_normalised_idx'),
                   ('contacts_contact_name_normalised_idx'),
                   ('matters_case_number_ar_normalised_idx'),
                   ('matters_subject_normalised_idx'),
                   ('people_name_ar_normalised_idx'),
                   ('person_name_alias_alias_ar_normalised_idx')
           ) AS x(name)
     WHERE NOT EXISTS (SELECT 1 FROM pg_indexes pi
                        WHERE pi.schemaname = 'public' AND pi.indexname = x.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'trigram indexes missing: %', missing;
    END IF;

    -- Every one must actually be a trigram index. A plain btree with the
    -- right name would satisfy a name check and do nothing for LIKE '%…%'.
    SELECT string_agg(indexname, ', ') INTO missing
      FROM pg_indexes
     WHERE schemaname = 'public' AND indexname LIKE '%_normalised_idx'
       AND indexdef NOT LIKE '%gin_trgm_ops%';
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'these are not trigram indexes: %', missing;
    END IF;

    -- The seven triggers that fill the columns these index must still exist.
    IF (SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%normalise') <> 7 THEN
        RAISE EXCEPTION 'the normalising triggers are not all present';
    END IF;

    RAISE NOTICE 'six trigram indexes restored, now owned by schema.prisma';
END
$TRGM$;
