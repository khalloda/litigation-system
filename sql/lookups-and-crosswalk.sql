-- ============================================================================
--  Litigation Database — Classification lookups
--  Generated from Lookup-Crosswalk-Review (all 197 rows reviewed).
--
--  MODEL (option B, confirmed by the business owner)
--  ------------------------------------------------
--  A matter is classified on FOUR independent axes, replacing the two
--  overloaded free-text columns matterCategory and matterDegree:
--
--     matter_type      WHAT KIND OF WORK   litigation / consultation /
--                                          procedures / grievance / petition
--     matter_category  PRACTICE AREA       labour / civil / economic / criminal
--     degree           COURT INSTANCE      first instance / appeal / cassation
--     venue            FORUM               administrative judiciary / committee /
--                                          prosecution / constitutional court
--
--  WHY FOUR AXES
--  -------------
--  In Access the same concept was typed into whichever column was free.
--  Measured in the live data:
--     22 of 23 matters with category=لجنة   also had degree=لجنة
--      8 of 10 matters with category=نيابة  also had degree=نيابة
--      7 of 12 matters with category=نقض    also had degree=نقض
--      4 of 11 matters with category=استشارات also had degree=استشارات
--  Splitting the axes removes the duplication: each value is recorded once,
--  in the field that actually means it.
--
--  EVERY lookup is runtime-editable (a table, never a PostgreSQL ENUM) so that
--  staff can add a court or a practice area without a schema migration.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  Generic lookup shape
-- ---------------------------------------------------------------------------
CREATE TABLE lookup_matter_type (
    id          smallserial PRIMARY KEY,
    label_ar    text        NOT NULL UNIQUE,
    label_en    text,
    sort_order  smallint    NOT NULL DEFAULT 100,
    is_active   boolean     NOT NULL DEFAULT true,
    is_default  boolean     NOT NULL DEFAULT false
);

CREATE TABLE lookup_matter_category (
    id          smallserial PRIMARY KEY,
    label_ar    text        NOT NULL UNIQUE,
    label_en    text,
    sort_order  smallint    NOT NULL DEFAULT 100,
    is_active   boolean     NOT NULL DEFAULT true
);

CREATE TABLE lookup_degree (
    id          smallserial PRIMARY KEY,
    label_ar    text        NOT NULL UNIQUE,
    label_en    text,
    sort_order  smallint    NOT NULL DEFAULT 100,
    is_active   boolean     NOT NULL DEFAULT true
);

CREATE TABLE lookup_venue (
    id          smallserial PRIMARY KEY,
    label_ar    text        NOT NULL UNIQUE,
    label_en    text,
    sort_order  smallint    NOT NULL DEFAULT 100,
    is_active   boolean     NOT NULL DEFAULT true
);

CREATE TABLE lookup_importance (
    id          smallserial PRIMARY KEY,
    label_ar    text        NOT NULL UNIQUE,
    label_en    text,
    sort_order  smallint    NOT NULL DEFAULT 100,
    is_active   boolean     NOT NULL DEFAULT true
);


-- ---------------------------------------------------------------------------
--  Matter columns
--
--  Every classification keeps its ORIGINAL Access text in a _raw column.
--  Nothing is lost: if a mapping is later judged wrong it can be corrected and
--  re-derived without returning to the .accdb.
-- ---------------------------------------------------------------------------
ALTER TABLE matters
    ADD COLUMN matter_type_id      smallint REFERENCES lookup_matter_type     (id),
    ADD COLUMN matter_category_id  smallint REFERENCES lookup_matter_category (id),
    ADD COLUMN degree_id           smallint REFERENCES lookup_degree          (id),
    ADD COLUMN venue_id            smallint REFERENCES lookup_venue           (id),
    ADD COLUMN importance_id       smallint REFERENCES lookup_importance      (id),
    ADD COLUMN legacy_category_raw text,     -- verbatim Access matterCategory
    ADD COLUMN legacy_degree_raw   text;     -- verbatim Access matterDegree

COMMENT ON COLUMN matters.legacy_category_raw IS
    'Byte-exact original of Access matterCategory. Never overwritten.';
COMMENT ON COLUMN matters.legacy_degree_raw IS
    'Byte-exact original of Access matterDegree. One Access value can populate '
    'two target columns (e.g. degree + venue), so this is the only faithful record.';


-- ---------------------------------------------------------------------------
--  Crosswalk — every distinct Access value and where it goes
--
--  This table IS the migration logic. It is data, not code, so a correction is
--  an UPDATE plus a re-run, not a code change.
-- ---------------------------------------------------------------------------
CREATE TABLE migration_crosswalk (
    id             serial PRIMARY KEY,
    source_field   text    NOT NULL,     -- matterCategory | matterDegree
    source_value   text    NOT NULL,
    rows_affected  integer,
    target_field   text,                 -- NULL = discard
    target_value   text,
    reviewer_note  text,
    UNIQUE (source_field, source_value)
);


-- ---- seed: matter_type -----------------------------------------------------
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('تقاضي', 'Litigation', 10, true);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('استشارات', 'Consultation', 20, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('رأي قانوني', 'Legal opinion', 30, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('إجراءات', 'Procedures', 40, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('تظلم', 'Grievance', 50, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('طعن', 'Challenge', 60, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('طلب', 'Petition', 70, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('طلب رد', 'Recusal request', 80, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('متابعة قانونية', 'Legal follow-up', 90, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('إلتماس', 'Petition for reconsideration', 100, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('منازعة تنفيذ', 'Execution dispute', 110, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('إشكال', 'Execution objection', 120, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('محضر إداري', 'Administrative report', 130, false);
INSERT INTO lookup_matter_type (label_ar, label_en, sort_order, is_default) VALUES ('تفتيش', 'Inspection', 140, false);

-- ---- seed: degree ----------------------------------------------------------
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('أول درجة', 'First instance', 10);
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('ابتدائي', 'Primary', 20);
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('جزئي', 'Summary', 30);
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('استئناف', 'Appeal', 40);
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('مستأنف', 'Appealed', 50);
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('نقض', 'Cassation', 60);
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('طعن إداري', 'Administrative challenge', 70);
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('جنح', 'Misdemeanour', 80);
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('جنح إقتصادي', 'Economic misdemeanour', 90);
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('محضر', 'Report', 100);
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('محضر إداري', 'Administrative report', 110);
INSERT INTO lookup_degree (label_ar, label_en, sort_order) VALUES ('إشكال', 'Execution objection', 120);

-- ---- seed: venue -----------------------------------------------------------
INSERT INTO lookup_venue (label_ar, label_en, sort_order) VALUES ('قضاء إداري', 'Administrative judiciary', 10);
INSERT INTO lookup_venue (label_ar, label_en, sort_order) VALUES ('إدارية عليا', 'Supreme Administrative Court', 20);
INSERT INTO lookup_venue (label_ar, label_en, sort_order) VALUES ('مجلس الدولة', 'Council of State', 30);
INSERT INTO lookup_venue (label_ar, label_en, sort_order) VALUES ('المحكمة الدستورية العليا', 'Supreme Constitutional Court', 40);
INSERT INTO lookup_venue (label_ar, label_en, sort_order) VALUES ('نيابة', 'Public prosecution', 50);
INSERT INTO lookup_venue (label_ar, label_en, sort_order) VALUES ('لجنة', 'Committee', 60);
INSERT INTO lookup_venue (label_ar, label_en, sort_order) VALUES ('تحكيم', 'Arbitration', 70);

-- ---- seed: matter_category (practice areas) --------------------------------
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('عمال', 10);   -- ~499 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('مدني', 20);   -- ~241 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('اقتصادي', 30);   -- ~225 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('جنح', 40);   -- ~165 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('تجاري', 50);   -- ~66 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('قضاء إداري', 60);   -- ~60 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('تعويضات', 70);   -- ~33 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('ضرائب', 80);   -- ~30 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('حكومي', 90);   -- ~25 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('أسرة', 100);   -- ~11 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('شركات', 110);   -- ~9 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('أحوال شخصية', 120);   -- ~6 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('جنايات', 130);   -- ~6 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('تحكيم رياضي', 140);   -- ~4 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('إداري', 150);   -- ~3 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('رياضة', 160);   -- ~1 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('فض منازعات', 170);   -- ~1 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('بنوك', 180);   -- ~1 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('شق مستعجل', 190);   -- ~1 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('عقود', 200);   -- ~1 matters
INSERT INTO lookup_matter_category (label_ar, sort_order) VALUES ('جنح مستأنف', 210);   -- ~1 matters

-- ---- seed: importance ------------------------------------------------------
INSERT INTO lookup_importance (label_ar, sort_order) VALUES ('عادية', 10);
INSERT INTO lookup_importance (label_ar, sort_order) VALUES ('هامة', 20);
INSERT INTO lookup_importance (label_ar, sort_order) VALUES ('حرجة', 30);

-- ---- seed: crosswalk (all reviewed decisions) ------------------------------
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'عمال', 499, 'matterCategory', 'عمال', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'مدني', 241, 'matterCategory', 'مدني', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'اقتصادي', 198, 'matterCategory', 'اقتصادي', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'جنح', 163, 'matterCategory', 'جنح', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تجاري', 66, 'matterCategory', 'تجاري', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'قضاء إداري', 60, 'matterCategory', 'قضاء إداري', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تعويضات', 32, 'matterCategory', 'تعويضات', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'ضرائب', 30, 'matterCategory', 'ضرائب', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إقتصادي', 27, 'matterCategory', 'اقتصادي', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'حكومي', 25, 'matterCategory', 'حكومي', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'لجنة', 23, 'venue', 'لجنة', '22 of 23 rows already carry degree=لجنة — redundant duplicate');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تظلم', 14, 'matter_type', 'تظلم', '2 of 14 rows already carry degree=تظلم');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'نقض', 12, 'degree', 'نقض', '7 of 12 rows already carry degree=نقض — redundant duplicate');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'أسرة', 11, 'matterCategory', 'أسرة', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'استشارات', 11, 'matter_type', 'استشارات', '4 of 11 rows already carry degree=استشارات — the same concept typed twice');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'نيابة', 10, 'venue', 'نيابة', '8 of 10 rows already carry degree=نيابة. You moved نيابة to venue');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إجراءات', 10, 'matter_type', 'إجراءات', 'Your note: company-establishment procedures. 2 of 10 rows already carry degree=إجراءات');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'شركات', 9, 'matterCategory', 'شركات', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'أحوال شخصية', 6, 'matterCategory', 'أحوال شخصية', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'جنايات', 5, 'matterCategory', 'جنايات', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تحكيم رياضي', 4, 'matterCategory', 'تحكيم رياضي', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إداري', 3, 'matterCategory', 'إداري', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'منازعة تنفيذ', 3, 'matter_type', 'منازعة تنفيذ', 'Execution dispute — new type');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'جنحة', 2, 'matterCategory', 'جنح', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إشكال', 2, 'matter_type', 'إشكال', 'You kept إشكال as a degree too — confirm which field');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'رأي قانوني', 2, 'matter_type', 'رأي قانوني', 'You confirmed it is distinct from استشارات');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'استشكال', 2, 'matter_type', 'إشكال', 'Variant of إشكال (execution objection)');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إبتدائي', 2, 'degree', 'ابتدائي', 'Hamza variant of ابتدائي');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'هامة', 1, 'matterImportance', 'هامة', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تعويض', 1, 'matterCategory', 'تعويضات', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تظلمات', 1, 'matter_type', 'تظلم', 'Plural of تظلم');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'رياضة', 1, 'matterCategory', 'رياضة', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تحكيم', 1, 'venue', 'تحكيم', 'You confirmed تحكيم is a distinct CATEGORY from تحكيم رياضي — but it is also a venue. Confirm');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'فض منازعات', 1, 'matterCategory', 'فض منازعات', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'لجنة تفتيش', 1, 'matter_type', 'تفتيش', 'Venue=لجنة captures the committee part');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'بنوك', 1, 'matterCategory', 'بنوك', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'لجنة تفتيش الهيئة العامة للاستثمار والمناطق', 1, 'SPLIT', 'category=لجنة تفتيش + distination=الهيئة العامة للاستثمار والمناطق', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'شق مستعجل', 1, 'matterCategory', 'شق مستعجل', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'استشارة', 1, 'matter_type', 'استشارات', 'Singular; degree empty on this row');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'ابتدائي', 1, 'degree', 'ابتدائي', 'A degree, not a practice area');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'طلب قانوني', 1, 'matter_type', 'طلب', 'Confirm whether distinct from طلب');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'جناية', 1, 'matterCategory', 'جنايات', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'إلتماس', 1, 'matter_type', 'إلتماس', 'Petition for reconsideration — new type');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'عقود', 1, 'matterCategory', 'عقود', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'استشارة قانونية', 1, 'matter_type', 'استشارات', 'You changed this to استشارات in the review');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'محضر إداري', 1, 'matter_type', 'محضر إداري', 'You kept محضر إداري as a valid degree too — confirm which field it belongs in');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'تفتيش', 1, 'matter_type', 'تفتيش', 'Inspection');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'لجنة تظلمات', 1, 'matter_type', 'تظلم', 'Committee grievance. Venue=لجنة already on this row, so the committee part is captured');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'النقض', 1, 'degree', 'نقض', 'Definite article');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterCategory', 'جنح مستأنف', 1, 'matterCategory', 'جنح مستأنف', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'أول درجة', 705, 'degree', 'أول درجة', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'استئناف', 311, 'degree', 'استئناف', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'نقض', 125, 'degree', 'نقض', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'ابتدائي', 110, 'degree', 'ابتدائي', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'قضاء إداري', 48, 'venue', 'قضاء إداري', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'لجنة', 34, 'venue', 'لجنة', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'إدارية عليا', 30, 'venue', 'إدارية عليا', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'نيابة', 24, 'venue', 'نيابة', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'جنحة', 15, 'degree', 'جنح', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'استشارات', 6, 'matter_type', 'استشارات', 'type not degree');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'إجراءات', 4, 'matter_type', 'إجراءات', 'Legal procedures as for company establishment procedures - type not degree');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'جزئي', 4, 'degree', 'جزئي', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'تظلم', 4, 'matter_type', 'تظلم', 'type');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'طعن', 3, 'matter_type', 'طعن', 'distinct - type not degree');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'جنح', 3, 'degree', 'جنح', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'محضر', 2, 'degree', 'محضر', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'أبتدائي', 2, 'degree', 'ابتدائي', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'الدستورية', 2, 'venue', 'المحكمة الدستورية العليا', 'Venue');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'إشكال', 2, 'degree', 'إشكال', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', '...', 1, NULL, NULL, NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'حرجة', 1, 'matterImportance', 'حرجة', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'مستأنف', 1, 'degree', 'مستأنف', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'جنح إقتصادي', 1, 'degree', 'جنح إقتصادي', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'طلب', 1, 'matter_type', 'طلب', 'type not degree');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'متابعة قانونية', 1, 'matter_type', 'متابعة قانونية', 'type not degree');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'طعن إداري', 1, 'degree', 'طعن إداري', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'تحكيم', 1, 'venue', 'تحكيم', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'إبتدائي', 1, 'degree', 'ابتدائي', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'محضر إداري', 1, 'degree', 'محضر إداري', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'أستئناف', 1, 'degree', 'استئناف', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'اول درجة', 1, 'degree', 'أول درجة', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'الدستورية العليا', 1, 'venue', 'المحكمة الدستورية العليا', 'venue');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'فضاء إداري', 1, 'venue', 'قضاء إداري', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'طلب رد', 1, 'matter_type', 'طلب رد', 'type not degree');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'القضاء الإداري', 1, 'venue', 'قضاء إداري', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'أاستئناف', 1, 'degree', 'استئناف', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'اسئناف', 1, 'degree', 'استئناف', NULL);
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'عليا', 1, 'venue', 'إدارية عليا', 'venue');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'مجلس الدولة', 1, 'venue', 'مجلس الدولة', 'venue');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('matterDegree', 'مجلس دولة', 1, 'venue', 'مجلس الدولة', 'venue');


-- ============================================================================
--  TRANSFORM — populate the matter classification columns from staging
--
--  Run AFTER the crosswalk is seeded. Each statement is idempotent and can be
--  re-run after any crosswalk correction.
-- ============================================================================

-- 1. Preserve the originals first. Nothing below overwrites these.
UPDATE matters m
SET    legacy_category_raw = s."matterCategory",
       legacy_degree_raw   = s."matterDegree"
FROM   stg.matters s
WHERE  m.legacy_matter_id = s."matterID";

-- 2. matter_type — from either source column
UPDATE matters m
SET    matter_type_id = lt.id
FROM   migration_crosswalk cw
JOIN   lookup_matter_type lt ON lt.label_ar = cw.target_value
WHERE  cw.target_field = 'matter_type'
  AND  ( (cw.source_field = 'matterCategory' AND m.legacy_category_raw = cw.source_value)
      OR (cw.source_field = 'matterDegree'   AND m.legacy_degree_raw   = cw.source_value) );

-- 3. Anything with no explicit type is litigation.
UPDATE matters
SET    matter_type_id = (SELECT id FROM lookup_matter_type WHERE is_default)
WHERE  matter_type_id IS NULL;

-- 4. matter_category
UPDATE matters m
SET    matter_category_id = lc.id
FROM   migration_crosswalk cw
JOIN   lookup_matter_category lc ON lc.label_ar = cw.target_value
WHERE  cw.target_field  = 'matterCategory'
  AND  cw.source_field  = 'matterCategory'
  AND  m.legacy_category_raw = cw.source_value;

-- 5. degree
UPDATE matters m
SET    degree_id = ld.id
FROM   migration_crosswalk cw
JOIN   lookup_degree ld ON ld.label_ar = cw.target_value
WHERE  cw.target_field = 'degree'
  AND  ( (cw.source_field = 'matterDegree'   AND m.legacy_degree_raw   = cw.source_value)
      OR (cw.source_field = 'matterCategory' AND m.legacy_category_raw = cw.source_value) );

-- 6. venue
UPDATE matters m
SET    venue_id = lv.id
FROM   migration_crosswalk cw
JOIN   lookup_venue lv ON lv.label_ar = cw.target_value
WHERE  cw.target_field = 'venue'
  AND  ( (cw.source_field = 'matterDegree'   AND m.legacy_degree_raw   = cw.source_value)
      OR (cw.source_field = 'matterCategory' AND m.legacy_category_raw = cw.source_value) );

-- 7. importance (هامة / حرجة were misfiled into category and degree)
UPDATE matters m
SET    importance_id = li.id
FROM   migration_crosswalk cw
JOIN   lookup_importance li ON li.label_ar = cw.target_value
WHERE  cw.target_field = 'matterImportance'
  AND  ( (cw.source_field = 'matterDegree'   AND m.legacy_degree_raw   = cw.source_value)
      OR (cw.source_field = 'matterCategory' AND m.legacy_category_raw = cw.source_value) )
  AND  m.importance_id IS NULL;


-- ============================================================================
--  VALIDATION — must all return zero rows
-- ============================================================================

-- Any Access value that reached no target and is not an intentional discard.
SELECT m.legacy_matter_id, m.legacy_category_raw, m.legacy_degree_raw
FROM   matters m
WHERE  m.matter_category_id IS NULL
  AND  m.degree_id          IS NULL
  AND  m.venue_id           IS NULL
  AND  coalesce(m.legacy_category_raw, m.legacy_degree_raw) IS NOT NULL
  AND  coalesce(m.legacy_category_raw, m.legacy_degree_raw) <> '...';

-- Every matter must have a type (litigation is the default).
SELECT count(*) AS matters_without_type FROM matters WHERE matter_type_id IS NULL;

-- Reconcile against Access: 1,730 matters total.
SELECT count(*) AS total_matters FROM matters;

-- Expected venue population: ~145 matters carried a venue value in Access.
SELECT count(*) AS matters_with_venue FROM matters WHERE venue_id IS NOT NULL;
