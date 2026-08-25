BEGIN;

-- Task 2.9B post-review correction: a normal reviewed rule matches the whole
-- source cell exactly. Only the three firm-approved rules marked `substring`
-- may match inside a longer POA lawyer cell.
CREATE OR REPLACE FUNCTION public.enforce_poa_lawyer_provenance()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
AS $POA_MEMBER$
DECLARE
    parent_source record;
BEGIN
    IF NEW.legacy_source_record_key IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT legacy_source_record_key, legacy_source_extraction_sha256, legacy_lawyers_raw
      INTO parent_source
      FROM public.powers_of_attorney
     WHERE id = NEW.power_of_attorney_id;
    IF parent_source.legacy_source_record_key IS DISTINCT FROM NEW.legacy_source_record_key
       OR parent_source.legacy_source_extraction_sha256 IS DISTINCT FROM NEW.legacy_source_extraction_sha256
       OR parent_source.legacy_lawyers_raw IS DISTINCT FROM NEW.legacy_lawyers_raw THEN
        RAISE EXCEPTION 'POA lawyer provenance does not match its source POA';
    END IF;

    IF NEW.reviewed_rule_id IS NULL THEN
        IF NEW.source_member_ordinal <> 1 OR NOT EXISTS (
            SELECT 1 FROM public.person_name_alias a
             WHERE a.alias_ar = NEW.legacy_lawyers_raw AND a.person_id = NEW.person_id
        ) THEN
            RAISE EXCEPTION 'Direct POA lawyer must resolve through one exact alias';
        END IF;
    ELSIF NOT EXISTS (
        SELECT 1
          FROM public.migration_multi_person_rule r
          JOIN public.migration_multi_person_rule_member m ON m.rule_id = r.id
         WHERE r.id = NEW.reviewed_rule_id
           AND (
               (r.poa_match_mode IS NULL AND r.raw_value = NEW.legacy_lawyers_raw)
               OR
               (r.poa_match_mode = 'substring'
                AND position(r.raw_value in NEW.legacy_lawyers_raw) > 0)
           )
           AND m.ordinal = NEW.source_member_ordinal
           AND m.person_id = NEW.person_id
    ) THEN
        RAISE EXCEPTION 'POA lawyer does not match the reviewed rule member';
    END IF;
    RETURN NEW;
END;
$POA_MEMBER$;

COMMIT;
