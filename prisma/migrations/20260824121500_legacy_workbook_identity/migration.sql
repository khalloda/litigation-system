-- Preserve the identity bridge used by the exact authoritative review
-- workbook returned on 23 August 2026. Its attendee display values were
-- deliberately decomposed after review, so the visible cell is not a stable
-- database identity. The numeric workbook id is captured once against the
-- already-verified answer and then becomes immutable.

BEGIN;

ALTER TABLE quarantine.review_value
    ADD COLUMN legacy_workbook_id bigint;

ALTER TABLE quarantine.finding
    ADD COLUMN legacy_workbook_id bigint;

ALTER TABLE quarantine.review_value
    ADD CONSTRAINT review_value_legacy_workbook_id_positive
    CHECK (legacy_workbook_id IS NULL OR legacy_workbook_id > 0);

ALTER TABLE quarantine.finding
    ADD CONSTRAINT finding_legacy_workbook_id_positive
    CHECK (legacy_workbook_id IS NULL OR legacy_workbook_id > 0);

CREATE UNIQUE INDEX review_value_legacy_workbook_id
    ON quarantine.review_value (legacy_workbook_id)
    WHERE legacy_workbook_id IS NOT NULL;

CREATE UNIQUE INDEX finding_legacy_workbook_id
    ON quarantine.finding (legacy_workbook_id)
    WHERE legacy_workbook_id IS NOT NULL;

COMMENT ON COLUMN quarantine.review_value.legacy_workbook_id IS
    'Immutable row id from the exact authoritative 23 August 2026 workbook. NULL for later review rows.';

COMMENT ON COLUMN quarantine.finding.legacy_workbook_id IS
    'Immutable row id from the exact authoritative 23 August 2026 workbook. NULL for later findings.';

CREATE OR REPLACE FUNCTION quarantine.protect_legacy_workbook_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $PROTECT_LEGACY_IDENTITY$
BEGIN
    IF OLD.legacy_workbook_id IS NOT NULL
       AND NEW.legacy_workbook_id IS DISTINCT FROM OLD.legacy_workbook_id THEN
        RAISE EXCEPTION 'a recorded legacy workbook identity cannot be changed or removed';
    END IF;
    IF NEW.legacy_workbook_id IS NOT NULL AND NEW.answered_at IS NULL THEN
        RAISE EXCEPTION 'a legacy workbook identity may only be attached to an answered row';
    END IF;
    RETURN NEW;
END
$PROTECT_LEGACY_IDENTITY$;

CREATE TRIGGER review_value_legacy_workbook_identity
BEFORE UPDATE ON quarantine.review_value
FOR EACH ROW EXECUTE FUNCTION quarantine.protect_legacy_workbook_identity();

CREATE TRIGGER finding_legacy_workbook_identity
BEFORE UPDATE ON quarantine.finding
FOR EACH ROW EXECUTE FUNCTION quarantine.protect_legacy_workbook_identity();

DO $STRUCTURE$
DECLARE
    n bigint;
BEGIN
    SELECT count(*) INTO n
      FROM information_schema.columns
     WHERE table_schema = 'quarantine'
       AND table_name IN ('review_value', 'finding')
       AND column_name = 'legacy_workbook_id'
       AND data_type = 'bigint'
       AND is_nullable = 'YES';
    IF n <> 2 THEN
        RAISE EXCEPTION 'legacy workbook identity: % of 2 nullable bigint columns installed', n;
    END IF;

    SELECT count(*) INTO n
      FROM pg_trigger
     WHERE tgrelid IN ('quarantine.review_value'::regclass, 'quarantine.finding'::regclass)
       AND tgname IN ('review_value_legacy_workbook_identity', 'finding_legacy_workbook_identity')
       AND NOT tgisinternal;
    IF n <> 2 THEN
        RAISE EXCEPTION 'legacy workbook identity: % of 2 protection triggers installed', n;
    END IF;
END
$STRUCTURE$;

COMMIT;
