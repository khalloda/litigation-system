-- Task 2.7 follow-up: a reviewed rule id is provenance and therefore cannot
-- appear on an application-native row that has no legacy source identity.
BEGIN;

ALTER TABLE matter_lawyers
    DROP CONSTRAINT matter_lawyers_rule_shape,
    ADD CONSTRAINT matter_lawyers_rule_shape CHECK (
        (legacy_source_record_key IS NULL AND reviewed_rule_id IS NULL)
        OR
        (legacy_source_record_key IS NOT NULL
         AND ((reviewed_rule_id IS NULL AND source_member_ordinal = 1)
              OR reviewed_rule_id IS NOT NULL))
    );

DO $POSTCONDITION$
DECLARE
    definition text;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO definition
      FROM pg_constraint
     WHERE conrelid = 'matter_lawyers'::regclass
       AND conname = 'matter_lawyers_rule_shape'
       AND contype = 'c' AND convalidated;
    IF definition IS NULL
       OR definition NOT LIKE '%legacy_source_record_key IS NULL%reviewed_rule_id IS NULL%'
       OR definition NOT LIKE '%legacy_source_record_key IS NOT NULL%source_member_ordinal = 1%'
       OR definition NOT LIKE '%reviewed_rule_id IS NOT NULL%' THEN
        RAISE EXCEPTION 'matter_lawyers_rule_shape does not protect reviewed provenance: %', definition;
    END IF;
END;
$POSTCONDITION$;

COMMIT;
