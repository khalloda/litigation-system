-- =========================================================================

BEGIN;
--  0030 — DURABLE SOURCE-RECORD AND ANSWER IDENTITY
--
--  `src_row_num` is an excellent trace back to one extraction file, but it is
--  not a durable identity. Access does not promise the order of `SELECT *`.
--  A later extraction can therefore move an unchanged record to another CSV
--  row. The old finding identity used that position and could retain a human
--  answer while replacing the source value it answered.
--
--  Every staged row now carries:
--
--    src_record_key        SHA-256 of the table name and every source value,
--                          with NULL and '' encoded differently, plus a
--                          deterministic suffix for identical duplicates.
--    src_extraction_sha256 SHA-256 of the Access file that produced the row.
--
--  Filename and row number remain for exact trace-back, but findings and
--  exclusions are identified by the content-derived key. An unchanged row
--  can move; changed content becomes a new identity and cannot inherit an old
--  answer. See docs/MIGRATION.md.
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS _migration;

CREATE OR REPLACE FUNCTION _migration.source_record_hash(
    p_table  text,
    p_values text[]
) RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $IDENTITY$
    SELECT encode(
        sha256(
            convert_to(
                p_table || chr(31) ||
                coalesce((
                    SELECT string_agg(
                        CASE
                            WHEN value IS NULL THEN 'N;'
                            ELSE 'T' || octet_length(convert_to(value, 'UTF8'))::text || ':' || value || ';'
                        END,
                        '' ORDER BY ordinal
                    )
                      FROM unnest(p_values) WITH ORDINALITY AS source_value(value, ordinal)
                ), ''),
                'UTF8'
            )
        ),
        'hex'
    );
$IDENTITY$;

COMMENT ON FUNCTION _migration.source_record_hash(text, text[]) IS
    'Durable source-row SHA-256. The TypeScript twin is scripts/lib/source-identity.ts. NULL and empty text are deliberately different.';

-- Preserve the complete human-answer payload across every statement below.
-- Dynamic rather than hard-coded counts let the same migration apply safely
-- to a fresh empty database and to this populated rehearsal database.
CREATE TEMP TABLE answer_preservation_guard ON COMMIT DROP AS
SELECT
    (SELECT count(*) FROM quarantine.review_value WHERE answered_at IS NOT NULL) AS value_answers,
    (SELECT count(*) FROM quarantine.finding WHERE answered_at IS NOT NULL)      AS finding_answers,
    encode(sha256(convert_to(coalesce(string_agg(payload, E'\n' ORDER BY kind, id), ''), 'UTF8')), 'hex') AS answer_digest
FROM (
    SELECT 'V' AS kind, id,
           jsonb_build_array(
               id, topic, value, firm_answer, firm_person, firm_note,
               answered_at, answered_by
           )::text AS payload
      FROM quarantine.review_value
     WHERE answered_at IS NOT NULL
    UNION ALL
    SELECT 'F' AS kind, id,
           jsonb_build_array(
               id, topic, src_table, src_file, src_row_num, column_name,
               original_value, firm_answer, firm_note, answered_at, answered_by
           )::text AS payload
      FROM quarantine.finding
     WHERE answered_at IS NOT NULL
) answered;

-- Add and backfill the two metadata columns on every staging table. The
-- source columns themselves remain nullable text with no checks or defaults.
DO $STAGING_IDENTITY$
DECLARE
    r                 record;
    source_expressions text;
    index_name         text;
    source_fingerprint constant text := '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979';
    problem_count      bigint;
BEGIN
    FOR r IN
        SELECT table_name, row_number() OVER (ORDER BY table_name) AS table_no
          FROM information_schema.tables
         WHERE table_schema = 'staging' AND table_type = 'BASE TABLE'
         ORDER BY table_name
    LOOP
        EXECUTE format(
            'ALTER TABLE staging.%I ADD COLUMN src_record_key text, ADD COLUMN src_extraction_sha256 text',
            r.table_name
        );

        SELECT string_agg(format('s.%I', column_name), ', ' ORDER BY ordinal_position)
          INTO source_expressions
          FROM information_schema.columns
         WHERE table_schema = 'staging'
           AND table_name = r.table_name
           AND column_name NOT IN (
               'src_file', 'src_row_num', 'src_record_key', 'src_extraction_sha256'
           );

        EXECUTE format($SQL$
            WITH identified AS (
                SELECT src_file,
                       src_row_num,
                       _migration.source_record_hash(%L, ARRAY[%s]::text[]) AS content_hash
                  FROM staging.%I s
            ), ranked AS (
                SELECT src_file,
                       src_row_num,
                       content_hash,
                       row_number() OVER (
                           PARTITION BY content_hash ORDER BY src_file, src_row_num
                       ) AS occurrence
                  FROM identified
            )
            UPDATE staging.%I s
               SET src_record_key = ranked.content_hash || ':' || lpad(ranked.occurrence::text, 6, '0'),
                   src_extraction_sha256 = %L
              FROM ranked
             WHERE ranked.src_file = s.src_file
               AND ranked.src_row_num = s.src_row_num
        $SQL$, r.table_name, source_expressions, r.table_name, r.table_name, source_fingerprint);

        EXECUTE format(
            'ALTER TABLE staging.%I ALTER COLUMN src_record_key SET NOT NULL, ALTER COLUMN src_extraction_sha256 SET NOT NULL',
            r.table_name
        );

        index_name := 'staging_source_record_key_' || lpad(r.table_no::text, 2, '0');
        EXECUTE format(
            'CREATE UNIQUE INDEX %I ON staging.%I (src_record_key)',
            index_name,
            r.table_name
        );

        EXECUTE format(
            'SELECT count(*) FROM staging.%I WHERE src_record_key !~ ''^[0-9a-f]{64}:[0-9]{6}$'' OR src_extraction_sha256 !~ ''^[0-9A-F]{64}$''',
            r.table_name
        ) INTO problem_count;
        IF problem_count <> 0 THEN
            RAISE EXCEPTION 'staging.% has % malformed source identities', r.table_name, problem_count;
        END IF;
    END LOOP;
END
$STAGING_IDENTITY$;

COMMENT ON SCHEMA _migration IS
    'Database-side migration helpers and provenance. Not application data and not exposed through Prisma.';

-- Findings and exclusions retain the positional trace, but their identity is
-- now the durable record key. review_value is value-based already; it gains
-- the extraction fingerprint so every workbook row can name its extraction.
ALTER TABLE quarantine.finding
    ADD COLUMN src_record_key text,
    ADD COLUMN extraction_sha256 text;

ALTER TABLE quarantine.exclusion
    ADD COLUMN src_record_key text,
    ADD COLUMN extraction_sha256 text;

ALTER TABLE quarantine.review_value
    ADD COLUMN extraction_sha256 text;

DO $BACKFILL_QUARANTINE$
DECLARE
    r             record;
    unmatched     bigint;
    fingerprint   constant text := '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979';
BEGIN
    FOR r IN SELECT DISTINCT src_table FROM quarantine.finding
    LOOP
        EXECUTE format($SQL$
            UPDATE quarantine.finding f
               SET src_record_key = s.src_record_key,
                   extraction_sha256 = s.src_extraction_sha256
              FROM staging.%I s
             WHERE f.src_table = %L
               AND f.src_file = s.src_file
               AND f.src_row_num = s.src_row_num
        $SQL$, replace(r.src_table, '.', '__'), r.src_table);
    END LOOP;

    FOR r IN SELECT DISTINCT src_table FROM quarantine.exclusion
    LOOP
        EXECUTE format($SQL$
            UPDATE quarantine.exclusion e
               SET src_record_key = s.src_record_key,
                   extraction_sha256 = s.src_extraction_sha256
              FROM staging.%I s
             WHERE e.src_table = %L
               AND e.src_file = s.src_file
               AND e.src_row_num = s.src_row_num
        $SQL$, replace(r.src_table, '.', '__'), r.src_table);
    END LOOP;

    SELECT count(*) INTO unmatched FROM quarantine.finding WHERE src_record_key IS NULL;
    IF unmatched <> 0 THEN
        RAISE EXCEPTION '% finding(s) could not be attached to a durable staged-row identity', unmatched;
    END IF;
    SELECT count(*) INTO unmatched FROM quarantine.exclusion WHERE src_record_key IS NULL;
    IF unmatched <> 0 THEN
        RAISE EXCEPTION '% exclusion(s) could not be attached to a durable staged-row identity', unmatched;
    END IF;

    UPDATE quarantine.review_value SET extraction_sha256 = fingerprint;
END
$BACKFILL_QUARANTINE$;

ALTER TABLE quarantine.finding
    ALTER COLUMN src_record_key SET NOT NULL,
    ALTER COLUMN extraction_sha256 SET NOT NULL;

ALTER TABLE quarantine.exclusion
    ALTER COLUMN src_record_key SET NOT NULL,
    ALTER COLUMN extraction_sha256 SET NOT NULL;

ALTER TABLE quarantine.review_value
    ALTER COLUMN extraction_sha256 SET NOT NULL;

ALTER TABLE quarantine.finding DROP CONSTRAINT finding_identity;
ALTER TABLE quarantine.finding
    ADD CONSTRAINT finding_identity
    UNIQUE NULLS NOT DISTINCT (topic, src_table, src_record_key, column_name);

DROP INDEX quarantine.finding_row;
CREATE INDEX finding_row ON quarantine.finding (src_table, src_record_key);

ALTER TABLE quarantine.exclusion DROP CONSTRAINT exclusion_pkey;
ALTER TABLE quarantine.exclusion
    ADD CONSTRAINT exclusion_pkey PRIMARY KEY (src_table, src_record_key);

COMMENT ON COLUMN quarantine.finding.src_record_key IS
    'Durable identity of the complete staged source record. Filename and row number are trace information, not identity.';
COMMENT ON COLUMN quarantine.finding.extraction_sha256 IS
    'SHA-256 of the Access file in which this finding was last produced.';
COMMENT ON COLUMN quarantine.review_value.extraction_sha256 IS
    'SHA-256 of the Access file in which this value was last profiled.';
COMMENT ON CONSTRAINT finding_identity ON quarantine.finding IS
    'A finding is its topic, durable source record and column. CSV position is only a trace and may change between extractions.';

-- Look up the one current extraction represented by staging. A mixed staging
-- load is a hard failure, not a value to pick from.
CREATE OR REPLACE FUNCTION _migration.current_staging_fingerprint()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $FINGERPRINT$
DECLARE
    r            record;
    seen         text;
    candidate    text;
    variants     bigint;
BEGIN
    FOR r IN
        SELECT table_name
          FROM information_schema.tables
         WHERE table_schema = 'staging' AND table_type = 'BASE TABLE'
         ORDER BY table_name
    LOOP
        EXECUTE format(
            'SELECT min(src_extraction_sha256), count(DISTINCT src_extraction_sha256) FROM staging.%I',
            r.table_name
        ) INTO candidate, variants;
        IF candidate IS NULL THEN CONTINUE; END IF;
        IF variants <> 1 THEN
            RAISE EXCEPTION 'staging.% contains % extraction fingerprints', r.table_name, variants;
        END IF;
        IF seen IS NULL THEN
            seen := candidate;
        ELSIF seen <> candidate THEN
            RAISE EXCEPTION 'staging contains more than one extraction fingerprint';
        END IF;
    END LOOP;
    IF seen IS NULL THEN
        RAISE EXCEPTION 'staging has no extraction fingerprint';
    END IF;
    RETURN seen;
END
$FINGERPRINT$;

-- Attach the durable identity on insert. On an upserted, unchanged finding,
-- follow the durable key to its current filename and row number. An answered
-- finding may move, but it may never change the value it answered.
CREATE OR REPLACE FUNCTION quarantine.sync_finding_source_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $SYNC_FINDING$
DECLARE
    staging_table text := replace(NEW.src_table, '.', '__');
    found_count   bigint;
    found_key     text;
    found_file    text;
    found_row     integer;
    found_sha     text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        EXECUTE format(
            'SELECT count(*), min(src_record_key), min(src_extraction_sha256) FROM staging.%I WHERE src_file = $1 AND src_row_num = $2',
            staging_table
        ) INTO found_count, found_key, found_sha USING NEW.src_file, NEW.src_row_num;
        IF found_count <> 1 THEN
            RAISE EXCEPTION 'finding source %.% row % matched % staged rows',
                NEW.src_table, NEW.src_file, NEW.src_row_num, found_count;
        END IF;
        NEW.src_record_key := found_key;
        NEW.extraction_sha256 := found_sha;
    ELSE
        IF OLD.answered_at IS NOT NULL AND (
            NEW.original_value IS DISTINCT FROM OLD.original_value
            OR NEW.topic IS DISTINCT FROM OLD.topic
            OR NEW.src_table IS DISTINCT FROM OLD.src_table
            OR NEW.src_record_key IS DISTINCT FROM OLD.src_record_key
            OR NEW.column_name IS DISTINCT FROM OLD.column_name
        ) THEN
            RAISE EXCEPTION 'an answered finding cannot replace the source identity or value it answered';
        END IF;

        EXECUTE format(
            'SELECT count(*), min(src_file), min(src_row_num), min(src_extraction_sha256) FROM staging.%I WHERE src_record_key = $1',
            staging_table
        ) INTO found_count, found_file, found_row, found_sha USING OLD.src_record_key;
        IF found_count = 1 THEN
            NEW.src_file := found_file;
            NEW.src_row_num := found_row;
            NEW.src_record_key := OLD.src_record_key;
            NEW.extraction_sha256 := found_sha;
        END IF;
    END IF;
    RETURN NEW;
END
$SYNC_FINDING$;

CREATE TRIGGER finding_source_identity
BEFORE INSERT OR UPDATE ON quarantine.finding
FOR EACH ROW EXECUTE FUNCTION quarantine.sync_finding_source_identity();

CREATE OR REPLACE FUNCTION quarantine.sync_exclusion_source_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $SYNC_EXCLUSION$
DECLARE
    staging_table text := replace(NEW.src_table, '.', '__');
    found_count   bigint;
BEGIN
    EXECUTE format(
        'SELECT count(*), min(src_record_key), min(src_extraction_sha256) FROM staging.%I WHERE src_file = $1 AND src_row_num = $2',
        staging_table
    ) INTO found_count, NEW.src_record_key, NEW.extraction_sha256
    USING NEW.src_file, NEW.src_row_num;
    IF found_count <> 1 THEN
        RAISE EXCEPTION 'exclusion source %.% row % matched % staged rows',
            NEW.src_table, NEW.src_file, NEW.src_row_num, found_count;
    END IF;
    RETURN NEW;
END
$SYNC_EXCLUSION$;

CREATE TRIGGER exclusion_source_identity
BEFORE INSERT OR UPDATE ON quarantine.exclusion
FOR EACH ROW EXECUTE FUNCTION quarantine.sync_exclusion_source_identity();

CREATE OR REPLACE FUNCTION quarantine.sync_review_value_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
AS $SYNC_REVIEW$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.answered_at IS NOT NULL AND (
        NEW.topic IS DISTINCT FROM OLD.topic
        OR NEW.value IS DISTINCT FROM OLD.value
    ) THEN
        RAISE EXCEPTION 'an answered review value cannot replace the identity or value it answered';
    END IF;
    NEW.extraction_sha256 := _migration.current_staging_fingerprint();
    RETURN NEW;
END
$SYNC_REVIEW$;

CREATE TRIGGER review_value_fingerprint
BEFORE INSERT OR UPDATE ON quarantine.review_value
FOR EACH ROW EXECUTE FUNCTION quarantine.sync_review_value_fingerprint();

-- Prove the migration preserved every existing human answer byte for byte.
DO $ANSWER_PRESERVATION$
DECLARE
    before_guard answer_preservation_guard%ROWTYPE;
    after_values bigint;
    after_findings bigint;
    after_digest text;
BEGIN
    SELECT * INTO before_guard FROM answer_preservation_guard;

    SELECT count(*) INTO after_values
      FROM quarantine.review_value WHERE answered_at IS NOT NULL;
    SELECT count(*) INTO after_findings
      FROM quarantine.finding WHERE answered_at IS NOT NULL;
    SELECT encode(sha256(convert_to(coalesce(string_agg(payload, E'\n' ORDER BY kind, id), ''), 'UTF8')), 'hex')
      INTO after_digest
      FROM (
        SELECT 'V' AS kind, id,
               jsonb_build_array(
                   id, topic, value, firm_answer, firm_person, firm_note,
                   answered_at, answered_by
               )::text AS payload
          FROM quarantine.review_value
         WHERE answered_at IS NOT NULL
        UNION ALL
        SELECT 'F' AS kind, id,
               jsonb_build_array(
                   id, topic, src_table, src_file, src_row_num, column_name,
                   original_value, firm_answer, firm_note, answered_at, answered_by
               )::text AS payload
          FROM quarantine.finding
         WHERE answered_at IS NOT NULL
      ) answered;

    IF after_values <> before_guard.value_answers
       OR after_findings <> before_guard.finding_answers
       OR after_digest <> before_guard.answer_digest THEN
        RAISE EXCEPTION 'durable identity migration changed a human answer';
    END IF;

    RAISE NOTICE 'PROVED: % + % human answers survived durable identity unchanged',
        after_values, after_findings;
END
$ANSWER_PRESERVATION$;

-- Structural assertions that also run on a clean empty database.
DO $IDENTITY_ASSERTIONS$
DECLARE
    n bigint;
BEGIN
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'staging'
       AND column_name IN ('src_record_key', 'src_extraction_sha256')
       AND is_nullable = 'NO';
    IF n <> 40 THEN
        RAISE EXCEPTION 'staging durable identity: % of 40 non-null metadata columns', n;
    END IF;

    SELECT count(*) INTO n
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_namespace ns ON ns.oid = t.relnamespace
     WHERE ns.nspname = 'staging' AND i.indisunique
       AND idx.relname LIKE 'staging_source_record_key_%';
    IF n <> 20 THEN
        RAISE EXCEPTION 'staging durable identity: % of 20 unique indexes', n;
    END IF;

    SELECT count(*) INTO n FROM pg_constraint
     WHERE conrelid = 'quarantine.finding'::regclass
       AND conname = 'finding_identity';
    IF n <> 1 THEN RAISE EXCEPTION 'durable finding_identity is missing'; END IF;

    SELECT count(*) INTO n FROM pg_trigger
     WHERE tgrelid IN (
         'quarantine.finding'::regclass,
         'quarantine.exclusion'::regclass,
         'quarantine.review_value'::regclass
     )
       AND tgname IN (
         'finding_source_identity',
         'exclusion_source_identity',
         'review_value_fingerprint'
       )
       AND NOT tgisinternal;
    IF n <> 3 THEN
        RAISE EXCEPTION 'answer identity: % of 3 protection triggers installed', n;
    END IF;
END
$IDENTITY_ASSERTIONS$;

COMMIT;
