-- ===========================================================================
--  0032 — TASK 2.6 SUPPORT: COMPLETE MATTERS + REVIEWED MAPPINGS
--
--  The target keeps every scalar matter field needed before the junction-table
--  transforms, plus the complete source row as JSONB. The payload is an audit
--  copy, not an application model: lawyer, party and abandoned team text is
--  consumed later (or deliberately not modelled, D6) without being lost now.
--
--  The 90 classification rules below are generated from the firm's reviewed
--  sql/lookups-and-crosswalk.sql. The generator normalises only field NAMES;
--  it never retypes an Arabic source or destination value.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION _migration.reviewed_text_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $KEY$
    SELECT string_agg(btrim(line, E' \t'), E'\n' ORDER BY ordinal)
      FROM regexp_split_to_table(
               replace(
                   replace(
                       replace(value, E'\\n', E'\n'),
                       E'\r\n', E'\n'
                   ),
                   E'\r', E'\n'
               ),
               E'\n'
           ) WITH ORDINALITY AS source_line(line, ordinal);
$KEY$;

COMMENT ON FUNCTION _migration.reviewed_text_key(text) IS
    'Match key for reviewed migration values: normalises CRLF/CR/literal \\n and trims edge spaces per line. It never folds Arabic or internal text.';

ALTER TABLE "matters"
    ADD COLUMN "legacy_source_record_key" text,
    ADD COLUMN "legacy_source_extraction_sha256" text,
    ADD COLUMN "legacy_source_payload" jsonb,
    ADD COLUMN "case_number_en" text,
    ADD COLUMN "branch_id" smallint,
    ADD COLUMN "legacy_branch_raw" text,
    ADD COLUMN "notes_1" text,
    ADD COLUMN "notes_2" text,
    ADD COLUMN "start_date" date,
    ADD COLUMN "end_date" date,
    ADD COLUMN "circuit_secretary" text,
    ADD COLUMN "asked_amount" numeric(18,2),
    ADD COLUMN "judged_amount" numeric(18,2),
    ADD COLUMN "legacy_selected" boolean,
    ADD COLUMN "evaluation" text,
    ADD COLUMN "current_status" text,
    ADD COLUMN "legacy_client_type_raw" text,
    ADD COLUMN "legacy_financial_allocation_raw" text,
    ADD COLUMN "legal_opinion" text,
    ADD COLUMN "legacy_contract_id_raw" text,
    ADD COLUMN "legacy_partner_raw" text;

CREATE UNIQUE INDEX "matters_legacy_source_record_key_key"
    ON "matters" ("legacy_source_record_key");
CREATE INDEX "matters_branch_id_idx" ON "matters" ("branch_id");

ALTER TABLE "matters"
    ADD CONSTRAINT "matters_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "lookup_client_branch"("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "matters_source_identity_shape"
        CHECK (
            (legacy_source_record_key IS NULL
             AND legacy_source_extraction_sha256 IS NULL
             AND legacy_source_payload IS NULL)
            OR
            (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
             AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
             AND jsonb_typeof(legacy_source_payload) = 'object')
        );

COMMENT ON COLUMN "matters"."legacy_source_record_key" IS
    'Durable staging identity for the exact Access source row; filename and row order are trace only.';
COMMENT ON COLUMN "matters"."legacy_source_payload" IS
    'Complete 38-column Access matter row. JSON null and empty text remain different. Audit only.';
COMMENT ON COLUMN "matters"."legacy_branch_raw" IS
    'Byte-exact Access clientBranch on the matter. D19 mappings must never overwrite it.';
COMMENT ON COLUMN "matters"."legacy_partner_raw" IS
    'Byte-exact Access matterPartner, retained for task 2.7; never used as a person key.';

CREATE TABLE quarantine.matter_transform (
    id                         bigserial PRIMARY KEY,
    src_record_key             text        NOT NULL UNIQUE,
    extraction_sha256          text        NOT NULL,
    src_file                   text        NOT NULL,
    src_row_num                integer     NOT NULL,
    legacy_matter_id           text,
    reason_codes               text[]      NOT NULL,
    reason_details             jsonb       NOT NULL,
    source_payload             jsonb       NOT NULL,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    resolved_at                timestamptz,
    resolved_by                text,
    resolution_note            text,

    CONSTRAINT matter_transform_source_key_shape
        CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'),
    CONSTRAINT matter_transform_extraction_shape
        CHECK (extraction_sha256 ~ '^[0-9A-F]{64}$'),
    CONSTRAINT matter_transform_has_reason
        CHECK (cardinality(reason_codes) > 0),
    CONSTRAINT matter_transform_details_are_array
        CHECK (jsonb_typeof(reason_details) = 'array'),
    CONSTRAINT matter_transform_reasons_reconcile
        CHECK (
            cardinality(reason_codes) = jsonb_array_length(reason_details)
            AND array_position(reason_codes, '') IS NULL
        ),
    CONSTRAINT matter_transform_payload_is_object
        CHECK (jsonb_typeof(source_payload) = 'object')
);

CREATE OR REPLACE FUNCTION quarantine.protect_matter_transform_source()
RETURNS trigger
LANGUAGE plpgsql
AS $PROTECT$
BEGIN
    IF NEW.src_record_key IS DISTINCT FROM OLD.src_record_key
       OR NEW.extraction_sha256 IS DISTINCT FROM OLD.extraction_sha256
       OR NEW.src_file IS DISTINCT FROM OLD.src_file
       OR NEW.src_row_num IS DISTINCT FROM OLD.src_row_num
       OR NEW.legacy_matter_id IS DISTINCT FROM OLD.legacy_matter_id
       OR NEW.reason_codes IS DISTINCT FROM OLD.reason_codes
       OR NEW.reason_details IS DISTINCT FROM OLD.reason_details
       OR NEW.source_payload IS DISTINCT FROM OLD.source_payload THEN
        RAISE EXCEPTION 'matter transform source and reasons are immutable; resolve the row without rewriting its evidence';
    END IF;
    RETURN NEW;
END
$PROTECT$;

CREATE TRIGGER matter_transform_source_immutable
BEFORE UPDATE ON quarantine.matter_transform
FOR EACH ROW EXECUTE FUNCTION quarantine.protect_matter_transform_source();

CREATE OR REPLACE FUNCTION quarantine.refuse_matter_transform_erasure()
RETURNS trigger
LANGUAGE plpgsql
AS $REFUSE$
BEGIN
    RAISE EXCEPTION 'matter transform quarantine is migration evidence; resolve rows, never delete or truncate them';
END
$REFUSE$;

CREATE TRIGGER matter_transform_no_erasure
BEFORE DELETE OR TRUNCATE ON quarantine.matter_transform
FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_matter_transform_erasure();

-- GENERATED_MATTER_CROSSWALK_START
-- Generated from sql/lookups-and-crosswalk.sql. Do not hand-edit the Arabic mapping rows.
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'عمال', 499, 'matter_category', 'عمال', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'مدني', 241, 'matter_category', 'مدني', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'اقتصادي', 198, 'matter_category', 'اقتصادي', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'جنح', 163, 'matter_category', 'جنح', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تجاري', 66, 'matter_category', 'تجاري', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'قضاء إداري', 60, 'matter_category', 'قضاء إداري', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تعويضات', 32, 'matter_category', 'تعويضات', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'ضرائب', 30, 'matter_category', 'ضرائب', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إقتصادي', 27, 'matter_category', 'اقتصادي', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'حكومي', 25, 'matter_category', 'حكومي', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'لجنة', 23, 'venue', 'لجنة', '22 of 23 rows already carry degree=لجنة — redundant duplicate');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تظلم', 14, 'matter_type', 'تظلم', '2 of 14 rows already carry degree=تظلم');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'نقض', 12, 'degree', 'نقض', '7 of 12 rows already carry degree=نقض — redundant duplicate');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'أسرة', 11, 'matter_category', 'أسرة', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'استشارات', 11, 'matter_type', 'استشارات', '4 of 11 rows already carry degree=استشارات — the same concept typed twice');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'نيابة', 10, 'venue', 'نيابة', '8 of 10 rows already carry degree=نيابة. You moved نيابة to venue');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إجراءات', 10, 'matter_type', 'إجراءات', 'Your note: company-establishment procedures. 2 of 10 rows already carry degree=إجراءات');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'شركات', 9, 'matter_category', 'شركات', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'أحوال شخصية', 6, 'matter_category', 'أحوال شخصية', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'جنايات', 5, 'matter_category', 'جنايات', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تحكيم رياضي', 4, 'matter_category', 'تحكيم رياضي', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إداري', 3, 'matter_category', 'إداري', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'منازعة تنفيذ', 3, 'matter_type', 'منازعة تنفيذ', 'Execution dispute — new type');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'جنحة', 2, 'matter_category', 'جنح', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إشكال', 2, 'matter_type', 'إشكال', 'You kept إشكال as a degree too — confirm which field');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'رأي قانوني', 2, 'matter_type', 'رأي قانوني', 'You confirmed it is distinct from استشارات');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'استشكال', 2, 'matter_type', 'إشكال', 'Variant of إشكال (execution objection)');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إبتدائي', 2, 'degree', 'ابتدائي', 'Hamza variant of ابتدائي');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'هامة', 1, 'importance', 'هامة', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تعويض', 1, 'matter_category', 'تعويضات', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تظلمات', 1, 'matter_type', 'تظلم', 'Plural of تظلم');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'رياضة', 1, 'matter_category', 'رياضة', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تحكيم', 1, 'venue', 'تحكيم', 'You confirmed تحكيم is a distinct CATEGORY from تحكيم رياضي — but it is also a venue. Confirm');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'فض منازعات', 1, 'matter_category', 'فض منازعات', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'لجنة تفتيش', 1, 'matter_type', 'تفتيش', 'Venue=لجنة captures the committee part');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'بنوك', 1, 'matter_category', 'بنوك', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'لجنة تفتيش الهيئة العامة للاستثمار والمناطق', 1, 'SPLIT', 'category=لجنة تفتيش + distination=الهيئة العامة للاستثمار والمناطق', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'شق مستعجل', 1, 'matter_category', 'شق مستعجل', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'استشارة', 1, 'matter_type', 'استشارات', 'Singular; degree empty on this row');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'ابتدائي', 1, 'degree', 'ابتدائي', 'A degree, not a practice area');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'طلب قانوني', 1, 'matter_type', 'طلب', 'Confirm whether distinct from طلب');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'جناية', 1, 'matter_category', 'جنايات', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إلتماس', 1, 'matter_type', 'إلتماس', 'Petition for reconsideration — new type');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'عقود', 1, 'matter_category', 'عقود', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'استشارة قانونية', 1, 'matter_type', 'استشارات', 'You changed this to استشارات in the review');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'محضر إداري', 1, 'matter_type', 'محضر إداري', 'You kept محضر إداري as a valid degree too — confirm which field it belongs in');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تفتيش', 1, 'matter_type', 'تفتيش', 'Inspection');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'لجنة تظلمات', 1, 'matter_type', 'تظلم', 'Committee grievance. Venue=لجنة already on this row, so the committee part is captured');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'النقض', 1, 'degree', 'نقض', 'Definite article');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'جنح مستأنف', 1, 'matter_category', 'جنح مستأنف', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'أول درجة', 705, 'degree', 'أول درجة', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'استئناف', 311, 'degree', 'استئناف', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'نقض', 125, 'degree', 'نقض', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'ابتدائي', 110, 'degree', 'ابتدائي', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'قضاء إداري', 48, 'venue', 'قضاء إداري', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'لجنة', 34, 'venue', 'لجنة', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'إدارية عليا', 30, 'venue', 'إدارية عليا', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'نيابة', 24, 'venue', 'نيابة', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'جنحة', 15, 'degree', 'جنح', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'استشارات', 6, 'matter_type', 'استشارات', 'type not degree');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'إجراءات', 4, 'matter_type', 'إجراءات', 'Legal procedures as for company establishment procedures - type not degree');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'جزئي', 4, 'degree', 'جزئي', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'تظلم', 4, 'matter_type', 'تظلم', 'type');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'طعن', 3, 'matter_type', 'طعن', 'distinct - type not degree');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'جنح', 3, 'degree', 'جنح', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'محضر', 2, 'degree', 'محضر', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'أبتدائي', 2, 'degree', 'ابتدائي', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'الدستورية', 2, 'venue', 'المحكمة الدستورية العليا', 'Venue');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'إشكال', 2, 'degree', 'إشكال', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', '...', 1, NULL, NULL, NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'حرجة', 1, 'importance', 'حرجة', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'مستأنف', 1, 'degree', 'مستأنف', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'جنح إقتصادي', 1, 'degree', 'جنح إقتصادي', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'طلب', 1, 'matter_type', 'طلب', 'type not degree');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'متابعة قانونية', 1, 'matter_type', 'متابعة قانونية', 'type not degree');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'طعن إداري', 1, 'degree', 'طعن إداري', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'تحكيم', 1, 'venue', 'تحكيم', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'إبتدائي', 1, 'degree', 'ابتدائي', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'محضر إداري', 1, 'degree', 'محضر إداري', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'أستئناف', 1, 'degree', 'استئناف', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'اول درجة', 1, 'degree', 'أول درجة', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'الدستورية العليا', 1, 'venue', 'المحكمة الدستورية العليا', 'venue');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'فضاء إداري', 1, 'venue', 'قضاء إداري', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'طلب رد', 1, 'matter_type', 'طلب رد', 'type not degree');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'القضاء الإداري', 1, 'venue', 'قضاء إداري', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'أاستئناف', 1, 'degree', 'استئناف', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'اسئناف', 1, 'degree', 'استئناف', NULL);
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'عليا', 1, 'venue', 'إدارية عليا', 'venue');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'مجلس الدولة', 1, 'venue', 'مجلس الدولة', 'venue');
INSERT INTO "migration_crosswalk" (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'مجلس دولة', 1, 'venue', 'مجلس الدولة', 'venue');

-- The reviewed SPLIT names this destination; it is therefore not invented here.
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at)
SELECT 'الهيئة العامة للاستثمار والمناطق',
       (SELECT coalesce(max(sort_order), 0) + 10 FROM "lookup_matter_destination"),
       now()
 WHERE NOT EXISTS (SELECT 1 FROM "lookup_matter_destination" WHERE label_ar = 'الهيئة العامة للاستثمار والمناطق');
-- GENERATED_MATTER_CROSSWALK_END

DO $POSTCONDITIONS$
DECLARE
    n integer;
    problem text;
BEGIN
    SELECT count(*) INTO n FROM migration_crosswalk WHERE source_field = 'matterCategory';
    IF n <> 50 THEN RAISE EXCEPTION 'matterCategory crosswalk: %, expected 50', n; END IF;
    SELECT count(*) INTO n FROM migration_crosswalk WHERE source_field = 'matterDegree';
    IF n <> 40 THEN RAISE EXCEPTION 'matterDegree crosswalk: %, expected 40', n; END IF;
    SELECT count(*) INTO n FROM migration_crosswalk;
    IF n <> 204 THEN RAISE EXCEPTION 'crosswalk: %, expected 204 (114 + 90)', n; END IF;

    SELECT string_agg(source_field || '/' || source_key, ', ' ORDER BY source_field, source_key)
      INTO problem
      FROM (
        SELECT source_field, _migration.reviewed_text_key(source_value) AS source_key
          FROM migration_crosswalk
         GROUP BY source_field, _migration.reviewed_text_key(source_value)
        HAVING count(*) > 1
      ) collisions;
    IF problem IS NOT NULL THEN
        RAISE EXCEPTION 'reviewed text keys collide: %', problem;
    END IF;

    SELECT string_agg(source_field || '/' || source_value, ', ' ORDER BY source_field, source_value)
      INTO problem
      FROM migration_crosswalk cw
     WHERE cw.source_field IN ('matterCategory', 'matterDegree')
       AND (
         (cw.target_field = 'matter_type' AND NOT EXISTS (
            SELECT 1 FROM lookup_matter_type l WHERE l.label_ar = cw.target_value))
         OR (cw.target_field = 'matter_category' AND NOT EXISTS (
            SELECT 1 FROM lookup_matter_category l WHERE l.label_ar = cw.target_value))
         OR (cw.target_field = 'degree' AND NOT EXISTS (
            SELECT 1 FROM lookup_degree l WHERE l.label_ar = cw.target_value))
         OR (cw.target_field = 'venue' AND NOT EXISTS (
            SELECT 1 FROM lookup_venue l WHERE l.label_ar = cw.target_value))
         OR (cw.target_field = 'importance' AND NOT EXISTS (
            SELECT 1 FROM lookup_importance l WHERE l.label_ar = cw.target_value))
       );
    IF problem IS NOT NULL THEN
        RAISE EXCEPTION 'matter classification rules have invalid destinations: %', problem;
    END IF;

    SELECT count(*) INTO n
      FROM migration_crosswalk
     WHERE source_field = 'matterCategory' AND target_field = 'SPLIT'
       AND target_value ~ '^category=.+ \+ distination=.+$';
    IF n <> 1 THEN RAISE EXCEPTION 'reviewed matter SPLIT: %, expected 1 structured rule', n; END IF;

    SELECT count(*) INTO n FROM lookup_matter_destination;
    IF n <> 32 THEN RAISE EXCEPTION 'matter destinations: %, expected 32', n; END IF;

    SELECT count(*) INTO n
      FROM migration_crosswalk cw
     WHERE source_field IN ('matterCategory', 'matterDegree')
       AND target_field NOT IN ('matter_type', 'matter_category', 'degree', 'venue', 'importance', 'SPLIT')
       AND target_field IS NOT NULL;
    IF n <> 0 THEN RAISE EXCEPTION '% matter classification rules have an unknown target field', n; END IF;
END
$POSTCONDITIONS$;

COMMIT;
