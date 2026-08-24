-- ===========================================================================
--  0034 — TASK 2.7: REVIEWED PERSON RULES AND RELATIONSHIP PROVENANCE
--
--  This migration creates the durable structures. The data transform remains
--  a separately runnable, transactional script so fixtures and live data use
--  the same path.
-- ===========================================================================

BEGIN;

CREATE TABLE migration_multi_person_rule (
    id serial PRIMARY KEY,
    raw_value text NOT NULL UNIQUE,
    occurrences integer NOT NULL CHECK (occurrences >= 0),
    reviewer_note text NOT NULL
);

CREATE TABLE migration_multi_person_rule_member (
    id serial PRIMARY KEY,
    rule_id integer NOT NULL REFERENCES migration_multi_person_rule(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    person_name text NOT NULL,
    person_id integer NOT NULL REFERENCES people(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    ordinal integer NOT NULL CHECK (ordinal >= 1),
    CONSTRAINT migration_multi_person_rule_member_rule_ordinal_key UNIQUE (rule_id, ordinal),
    CONSTRAINT migration_multi_person_rule_member_rule_person_key UNIQUE (rule_id, person_id)
);
CREATE INDEX migration_multi_person_rule_member_person_id_idx
    ON migration_multi_person_rule_member(person_id);

CREATE TABLE migration_excluded_name (
    raw_value text PRIMARY KEY,
    occurrences integer NOT NULL CHECK (occurrences >= 0),
    reason text NOT NULL
);

ALTER TABLE matter_lawyers
    ADD COLUMN legacy_source_record_key text,
    ADD COLUMN legacy_source_extraction_sha256 text,
    ADD COLUMN source_field text,
    ADD COLUMN reviewed_rule_id integer,
    ADD COLUMN source_member_ordinal integer;

ALTER TABLE matter_lawyers
    ADD CONSTRAINT matter_lawyers_reviewed_rule_id_fkey
        FOREIGN KEY (reviewed_rule_id) REFERENCES migration_multi_person_rule(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT matter_lawyers_legacy_source_shape CHECK (
        (legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND source_field IS NULL
         AND source_member_ordinal IS NULL)
        OR
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND source_field IN ('lawyerA', 'lawyerB')
         AND source_member_ordinal >= 1)
    ),
    ADD CONSTRAINT matter_lawyers_rule_shape CHECK (
        (reviewed_rule_id IS NULL AND source_member_ordinal = 1)
        OR reviewed_rule_id IS NOT NULL
        OR legacy_source_record_key IS NULL
    );

CREATE UNIQUE INDEX matter_lawyers_matter_person_key
    ON matter_lawyers(matter_id, person_id);
CREATE UNIQUE INDEX matter_lawyers_legacy_source_key
    ON matter_lawyers(legacy_source_record_key, source_field, source_member_ordinal);

ALTER TABLE matter_parties
    ADD COLUMN legacy_source_record_key text,
    ADD COLUMN legacy_source_extraction_sha256 text,
    ADD COLUMN source_field text,
    ADD COLUMN source_fragment_ordinal integer;

ALTER TABLE matter_parties
    ADD CONSTRAINT matter_parties_legacy_source_shape CHECK (
        (legacy_source_record_key IS NULL
         AND legacy_source_extraction_sha256 IS NULL
         AND source_field IS NULL
         AND source_fragment_ordinal IS NULL)
        OR
        (legacy_source_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
         AND legacy_source_extraction_sha256 ~ '^[0-9A-F]{64}$'
         AND source_field IN ('client&Cap', 'opponent&Cap')
         AND source_fragment_ordinal >= 1)
    );

CREATE UNIQUE INDEX matter_parties_legacy_source_key
    ON matter_parties(legacy_source_record_key, source_field, source_fragment_ordinal);

ALTER TABLE matter_party_roles
    ADD COLUMN legacy_role_raw text;

CREATE UNIQUE INDEX matter_party_roles_party_role_key
    ON matter_party_roles(party_id, role_id);
CREATE UNIQUE INDEX matter_party_roles_party_ordinal_key
    ON matter_party_roles(party_id, ordinal);

CREATE TABLE quarantine.matter_relationship_transform (
    id bigserial PRIMARY KEY,
    relationship_kind text NOT NULL,
    source_field text NOT NULL,
    side text,
    src_record_key text NOT NULL,
    extraction_sha256 text NOT NULL,
    src_file text NOT NULL,
    src_row_num integer NOT NULL,
    legacy_matter_id text,
    raw_value text NOT NULL,
    outcome text NOT NULL,
    reason_codes text[] NOT NULL,
    reason_details jsonb NOT NULL,
    source_payload jsonb NOT NULL,
    reviewed_exclusion_raw_value text,
    created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamptz(6),
    resolution_note text,
    CONSTRAINT matter_relationship_transform_source_key
        UNIQUE (src_record_key, source_field),
    CONSTRAINT matter_relationship_transform_kind_check
        CHECK (relationship_kind IN ('lawyer', 'party')),
    CONSTRAINT matter_relationship_transform_field_check
        CHECK (source_field IN ('lawyerA', 'lawyerB', 'client&Cap', 'opponent&Cap')),
    CONSTRAINT matter_relationship_transform_side_check
        CHECK ((relationship_kind = 'lawyer' AND side IS NULL)
               OR (relationship_kind = 'party' AND side IN ('client', 'opponent'))),
    CONSTRAINT matter_relationship_transform_identity_check
        CHECK (src_record_key ~ '^[0-9a-f]{64}:[0-9]{6}$'
               AND extraction_sha256 ~ '^[0-9A-F]{64}$'),
    CONSTRAINT matter_relationship_transform_outcome_check
        CHECK (outcome IN ('quarantined', 'excluded')),
    CONSTRAINT matter_relationship_transform_reasons_check
        CHECK (cardinality(reason_codes) >= 1
               AND jsonb_typeof(reason_details) = 'array'
               AND jsonb_array_length(reason_details) = cardinality(reason_codes)),
    CONSTRAINT matter_relationship_transform_exclusion_shape CHECK (
        (outcome = 'excluded'
         AND reviewed_exclusion_raw_value IS NOT NULL
         AND reason_codes = ARRAY['reviewed_exclusion'])
        OR
        (outcome = 'quarantined' AND reviewed_exclusion_raw_value IS NULL)
    ),
    CONSTRAINT matter_relationship_transform_exclusion_fkey
        FOREIGN KEY (reviewed_exclusion_raw_value) REFERENCES migration_excluded_name(raw_value)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX matter_relationship_transform_legacy_matter_id_idx
    ON quarantine.matter_relationship_transform(legacy_matter_id);
CREATE INDEX matter_relationship_transform_outcome_idx
    ON quarantine.matter_relationship_transform(outcome);

CREATE FUNCTION quarantine.protect_matter_relationship_transform_source()
RETURNS trigger
LANGUAGE plpgsql
AS $FUNCTION$
BEGIN
    IF NEW.relationship_kind IS DISTINCT FROM OLD.relationship_kind
       OR NEW.source_field IS DISTINCT FROM OLD.source_field
       OR NEW.side IS DISTINCT FROM OLD.side
       OR NEW.src_record_key IS DISTINCT FROM OLD.src_record_key
       OR NEW.extraction_sha256 IS DISTINCT FROM OLD.extraction_sha256
       OR NEW.src_file IS DISTINCT FROM OLD.src_file
       OR NEW.src_row_num IS DISTINCT FROM OLD.src_row_num
       OR NEW.legacy_matter_id IS DISTINCT FROM OLD.legacy_matter_id
       OR NEW.raw_value IS DISTINCT FROM OLD.raw_value
       OR NEW.outcome IS DISTINCT FROM OLD.outcome
       OR NEW.reason_codes IS DISTINCT FROM OLD.reason_codes
       OR NEW.reason_details IS DISTINCT FROM OLD.reason_details
       OR NEW.source_payload IS DISTINCT FROM OLD.source_payload
       OR NEW.reviewed_exclusion_raw_value IS DISTINCT FROM OLD.reviewed_exclusion_raw_value THEN
        RAISE EXCEPTION 'matter relationship migration evidence is immutable; resolve without rewriting it';
    END IF;
    RETURN NEW;
END;
$FUNCTION$;

CREATE TRIGGER matter_relationship_transform_source_immutable
BEFORE UPDATE ON quarantine.matter_relationship_transform
FOR EACH ROW EXECUTE FUNCTION quarantine.protect_matter_relationship_transform_source();

CREATE FUNCTION quarantine.refuse_matter_relationship_transform_erasure()
RETURNS trigger
LANGUAGE plpgsql
AS $FUNCTION$
BEGIN
    RAISE EXCEPTION 'matter relationship rows are migration evidence; never delete or truncate them';
END;
$FUNCTION$;

CREATE TRIGGER matter_relationship_transform_no_erasure
BEFORE DELETE OR TRUNCATE ON quarantine.matter_relationship_transform
FOR EACH STATEMENT EXECUTE FUNCTION quarantine.refuse_matter_relationship_transform_erasure();

-- GENERATED_MATTER_RELATIONSHIP_RULES_START
-- Generated from sql/people-roster-and-aliases.sql. Do not hand-edit reviewed rows.
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين والدكتور', 10, '2 lawyers (هاني سري الدين) and (احمد عبدالله)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'هاني سري الدين', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'هاني سري الدين'
 WHERE r.raw_value = 'هاني صلاح سري الدين والدكتور';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'احمد عبدالله', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'احمد عبدالله'
 WHERE r.raw_value = 'هاني صلاح سري الدين والدكتور';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي', 8, 'Multiple Lawyers (خالد عطيه/أحمد عبد الله/محمد عبد العزيز عبد الحافظ/شريف أبو المكارم/أحمد سعيد/محمد الغرابلي');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'خالد عطيه', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'خالد عطيه'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد عبد الله', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد عبد الله'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد عبد العزيز عبد الحافظ', a.person_id, 3
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد عبد العزيز عبد الحافظ'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'شريف أبو المكارم', a.person_id, 4
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'شريف أبو المكارم'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد سعيد', a.person_id, 5
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد سعيد'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد الغرابلي', a.person_id, 6
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد الغرابلي'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد حمدي والأساتذه أحمد عبد الله', 7, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'خالد عطيه', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'خالد عطيه'
 WHERE r.raw_value = 'خالد حمدي والأساتذه أحمد عبد الله';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد عبد الله', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد عبد الله'
 WHERE r.raw_value = 'خالد حمدي والأساتذه أحمد عبد الله';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد محمود حمدي والأساتذه أحمد عبد الله محمد علي', 5, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'خالد عطيه', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'خالد عطيه'
 WHERE r.raw_value = 'خالد محمود حمدي والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد عبد الله', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد عبد الله'
 WHERE r.raw_value = 'خالد محمود حمدي والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمد الغرابلي إيهاب حمدي', 5, '2 lawyers (محمد الغرابلي) and (إيهاب حمدي)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد الغرابلي', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد الغرابلي'
 WHERE r.raw_value = 'محمد الغرابلي إيهاب حمدي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'إيهاب حمدي', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'إيهاب حمدي'
 WHERE r.raw_value = 'محمد الغرابلي إيهاب حمدي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني الدالي عمرو سليم', 5, '2 lawyers (هاني الدالي) and (عمرو سليم)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'هاني الدالي', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'هاني الدالي'
 WHERE r.raw_value = 'هاني الدالي عمرو سليم';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'عمرو سليم', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'عمرو سليم'
 WHERE r.raw_value = 'هاني الدالي عمرو سليم';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('ناجي رمضان محمد عبد العزيز', 4, '2 lawyers (ناجي رمضان) and (محمد عبدالعزيز عبد الحافظ)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'ناجي رمضان', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'ناجي رمضان'
 WHERE r.raw_value = 'ناجي رمضان محمد عبد العزيز';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد عبدالعزيز عبد الحافظ', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد عبدالعزيز عبد الحافظ'
 WHERE r.raw_value = 'ناجي رمضان محمد عبد العزيز';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('إيهاب حمدي عبد الرحمن البنا', 2, '2 lawyers (إيهاب حمدي) and (عبد الرحمن البنا)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'إيهاب حمدي', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'إيهاب حمدي'
 WHERE r.raw_value = 'إيهاب حمدي عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'عبد الرحمن البنا', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'عبد الرحمن البنا'
 WHERE r.raw_value = 'إيهاب حمدي عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('إيهاب حمدي محمد عبد العزيز', 2, '2 lawyers (إيهاب حمدي) and (محمد عبد العزيز عبد الحافظ)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'إيهاب حمدي', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'إيهاب حمدي'
 WHERE r.raw_value = 'إيهاب حمدي محمد عبد العزيز';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد عبد العزيز عبد الحافظ', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد عبد العزيز عبد الحافظ'
 WHERE r.raw_value = 'إيهاب حمدي محمد عبد العزيز';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد حمدي والأساتذه أحمد عبد الله محمد علي', 2, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'خالد عطيه', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'خالد عطيه'
 WHERE r.raw_value = 'خالد حمدي والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد عبد الله', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد عبد الله'
 WHERE r.raw_value = 'خالد حمدي والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي', 2, 'Multiple Lawyers (خالد عطيه/أحمد عبد الله/محمد عبد العزيز عبد الحافظ/أحمد سعيد/محمد الغرابلي');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'خالد عطيه', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'خالد عطيه'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد عبد الله', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد عبد الله'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد عبد العزيز عبد الحافظ', a.person_id, 3
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد عبد العزيز عبد الحافظ'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد سعيد', a.person_id, 4
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد سعيد'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد الغرابلي', a.person_id, 5
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد الغرابلي'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمد عبد العزيز شريف أبو المكارم', 2, '2 lawyers (محمد عبد العزيز عبد الحافظ) and (شريف أبو المكارم)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد عبد العزيز عبد الحافظ', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد عبد العزيز عبد الحافظ'
 WHERE r.raw_value = 'محمد عبد العزيز شريف أبو المكارم';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'شريف أبو المكارم', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'شريف أبو المكارم'
 WHERE r.raw_value = 'محمد عبد العزيز شريف أبو المكارم';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمود شعبان محمود حسن', 2, '2 lawyers (محمود شعبان) and (محمود علي)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمود شعبان', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمود شعبان'
 WHERE r.raw_value = 'محمود شعبان محمود حسن';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمود علي', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمود علي'
 WHERE r.raw_value = 'محمود شعبان محمود حسن';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('ناجي رمضان محمد عبد العزيز إيهاب حمدي', 2, '3 lawyers (ناجي رمضان) and (محمد عبدالعزيز عبد الحافظ) and (إيهاب حمدي)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'ناجي رمضان', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'ناجي رمضان'
 WHERE r.raw_value = 'ناجي رمضان محمد عبد العزيز إيهاب حمدي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد عبدالعزيز عبد الحافظ', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد عبدالعزيز عبد الحافظ'
 WHERE r.raw_value = 'ناجي رمضان محمد عبد العزيز إيهاب حمدي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'إيهاب حمدي', a.person_id, 3
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'إيهاب حمدي'
 WHERE r.raw_value = 'ناجي رمضان محمد عبد العزيز إيهاب حمدي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('أحمد عبد الله محمد. أحمد سعيد أحمد', 1, '2 lawyers (أحمد عبد الله) and (أحمد سعيد)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد عبد الله', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد عبد الله'
 WHERE r.raw_value = 'أحمد عبد الله محمد. أحمد سعيد أحمد';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد سعيد', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد سعيد'
 WHERE r.raw_value = 'أحمد عبد الله محمد. أحمد سعيد أحمد';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('أحمد عبد الله محمدحسام الدين عمر', 1, '2 lawyers (أحمد عبد الله) and (حسام الدين عمر)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد عبد الله', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد عبد الله'
 WHERE r.raw_value = 'أحمد عبد الله محمدحسام الدين عمر';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'حسام الدين عمر', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'حسام الدين عمر'
 WHERE r.raw_value = 'أحمد عبد الله محمدحسام الدين عمر';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('حسام الدين عمر إبراهيم وحسام الدين فداء محمد ومحمد حمدي كالم', 1, '2 lawyers (حسام الدين عمر) and (حسام الدين فداء)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'حسام الدين عمر', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'حسام الدين عمر'
 WHERE r.raw_value = 'حسام الدين عمر إبراهيم وحسام الدين فداء محمد ومحمد حمدي كالم';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'حسام الدين فداء', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'حسام الدين فداء'
 WHERE r.raw_value = 'حسام الدين عمر إبراهيم وحسام الدين فداء محمد ومحمد حمدي كالم';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد حمدي عطيه أحمد سعيد أحمد', 1, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'خالد عطيه', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'خالد عطيه'
 WHERE r.raw_value = 'خالد حمدي عطيه أحمد سعيد أحمد';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد عبد الله', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد عبد الله'
 WHERE r.raw_value = 'خالد حمدي عطيه أحمد سعيد أحمد';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد', 1, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'خالد عطيه', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'خالد عطيه'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد عبد الله', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد عبد الله'
 WHERE r.raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد محمود حمدي والأساتذه أحمد عبد الله', 1, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'خالد عطيه', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'خالد عطيه'
 WHERE r.raw_value = 'خالد محمود حمدي والأساتذه أحمد عبد الله';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد عبد الله', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد عبد الله'
 WHERE r.raw_value = 'خالد محمود حمدي والأساتذه أحمد عبد الله';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('شريف أبو المكارم ومحمد حمدي كامل', 1, '2 lawyers (شريف أبو المكارم) and (محمد حمدي)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'شريف أبو المكارم', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'شريف أبو المكارم'
 WHERE r.raw_value = 'شريف أبو المكارم ومحمد حمدي كامل';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد حمدي', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد حمدي'
 WHERE r.raw_value = 'شريف أبو المكارم ومحمد حمدي كامل';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمد حمدي إيهاب حمدي', 1, '2 lawyers (محمد حمدي) and (إيهاب حمدي)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد حمدي', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد حمدي'
 WHERE r.raw_value = 'محمد حمدي إيهاب حمدي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'إيهاب حمدي', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'إيهاب حمدي'
 WHERE r.raw_value = 'محمد حمدي إيهاب حمدي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمد حمدي محمود شعبان', 1, '2 lawyers (محمد حمدي) and (محمود شعبان)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد حمدي', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد حمدي'
 WHERE r.raw_value = 'محمد حمدي محمود شعبان';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمود شعبان', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمود شعبان'
 WHERE r.raw_value = 'محمد حمدي محمود شعبان';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمد عبد العزيز وأ. إيهاب حمدي', 1, '2 lawyers (محمد عبد العزيز عبد الحافظ) and (إيهاب حمدي)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد عبد العزيز عبد الحافظ', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد عبد العزيز عبد الحافظ'
 WHERE r.raw_value = 'محمد عبد العزيز وأ. إيهاب حمدي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'إيهاب حمدي', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'إيهاب حمدي'
 WHERE r.raw_value = 'محمد عبد العزيز وأ. إيهاب حمدي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمود شعبان عبد الرحمن البنا', 1, '2 lawyers (محمود شعبان) and (عبدالرحمن البنا)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمود شعبان', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمود شعبان'
 WHERE r.raw_value = 'محمود شعبان عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'عبدالرحمن البنا', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'عبدالرحمن البنا'
 WHERE r.raw_value = 'محمود شعبان عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني الدالي منة الله البلتاجي', 1, '2 lawyers (هاني الدالي) and (منة الله البلتاجي)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'هاني الدالي', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'هاني الدالي'
 WHERE r.raw_value = 'هاني الدالي منة الله البلتاجي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'منة الله البلتاجي', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'منة الله البلتاجي'
 WHERE r.raw_value = 'هاني الدالي منة الله البلتاجي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا', 1, 'Multiple Lawyers (هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز عبدالحافظ - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'هاني سري الدين', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'هاني سري الدين'
 WHERE r.raw_value = 'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أميرة شريف', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أميرة شريف'
 WHERE r.raw_value = 'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'إيهاب حمدي', a.person_id, 3
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'إيهاب حمدي'
 WHERE r.raw_value = 'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد عبد العزيز', a.person_id, 4
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد عبد العزيز'
 WHERE r.raw_value = 'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد سعيد', a.person_id, 5
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد سعيد'
 WHERE r.raw_value = 'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد حمدي', a.person_id, 6
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد حمدي'
 WHERE r.raw_value = 'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'هاني الدالي', a.person_id, 7
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'هاني الدالي'
 WHERE r.raw_value = 'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'عبد الرحمن البنا', a.person_id, 8
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'عبد الرحمن البنا'
 WHERE r.raw_value = 'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين والأساتذه أحمد عبد الله محمد علي', 1, '2 lawyers (هاني سري الدين) and (احمد عبدالله)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'هاني سري الدين', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'هاني سري الدين'
 WHERE r.raw_value = 'هاني صلاح سري الدين والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'احمد عبدالله', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'احمد عبدالله'
 WHERE r.raw_value = 'هاني صلاح سري الدين والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم', 1, '2 lawyers (هاني سري الدين) and (حسام الدين عمر)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'هاني سري الدين', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'هاني سري الدين'
 WHERE r.raw_value = 'هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'حسام الدين عمر', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'حسام الدين عمر'
 WHERE r.raw_value = 'هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم أحمد عبد الله محمد علي', 1, '3 lawyers (هاني سري الدين) and (حسام الدين عمر) and (احمد عبدالله)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'هاني سري الدين', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'هاني سري الدين'
 WHERE r.raw_value = 'هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'حسام الدين عمر', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'حسام الدين عمر'
 WHERE r.raw_value = 'هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'احمد عبدالله', a.person_id, 3
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'احمد عبدالله'
 WHERE r.raw_value = 'هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين والأستاذ أحمد عبد الله والأستاذ محمد مجدي سيد أحمد', 1, '3 lawyers (هاني سري الدين) and (احمد عبدالله) and (محمد الغرابلي)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'هاني سري الدين', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'هاني سري الدين'
 WHERE r.raw_value = 'هاني صلاح سري الدين والأستاذ أحمد عبد الله والأستاذ محمد مجدي سيد أحمد';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'احمد عبدالله', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'احمد عبدالله'
 WHERE r.raw_value = 'هاني صلاح سري الدين والأستاذ أحمد عبد الله والأستاذ محمد مجدي سيد أحمد';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد الغرابلي', a.person_id, 3
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد الغرابلي'
 WHERE r.raw_value = 'هاني صلاح سري الدين والأستاذ أحمد عبد الله والأستاذ محمد مجدي سيد أحمد';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين ود. رامي أحمد حسن البرعي', 1, '2 lawyers (هاني سري الدين) and (رامي البرعي)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'هاني سري الدين', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'هاني سري الدين'
 WHERE r.raw_value = 'هاني صلاح سري الدين ود. رامي أحمد حسن البرعي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'رامي البرعي', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'رامي البرعي'
 WHERE r.raw_value = 'هاني صلاح سري الدين ود. رامي أحمد حسن البرعي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي', 1, 'Multiple Lawyers (محمد عبد العزيز عبد الحافظ/شريف أبو المكارم/أحمد سعيد/محمد الغرابلي)');
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد عبد العزيز عبد الحافظ', a.person_id, 1
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد عبد العزيز عبد الحافظ'
 WHERE r.raw_value = 'ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'شريف أبو المكارم', a.person_id, 2
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'شريف أبو المكارم'
 WHERE r.raw_value = 'ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'أحمد سعيد', a.person_id, 3
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'أحمد سعيد'
 WHERE r.raw_value = 'ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_rule_member (rule_id, person_name, person_id, ordinal)
SELECT r.id, 'محمد الغرابلي', a.person_id, 4
  FROM migration_multi_person_rule r
  JOIN person_name_alias a ON a.alias_ar = 'محمد الغرابلي'
 WHERE r.raw_value = 'ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('قسم التحكيم', 67, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('الدكتور', 39, 'bare honorific, not a name');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('دكتور', 14, 'bare honorific, not a name');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('أستاذ', 12, 'bare honorific, not a name');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('لايوجد حضور', 6, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('آخر موعد للتجديد من الشطب', 4, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('الاستعلام عن ورود التقرير قبل الجلسة', 3, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('الشركة المصرية للاتصالات', 3, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('إجازة العيد', 3, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('ستؤجل إدارياً', 3, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('كتور', 3, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('(متابعة بدون حضور)', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('** متابعة ورود التقرير قبل الجلسة', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('** متابعة ورود التقريرقبل ميعاد الجلسة', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('إجازة رسمي', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('تأجيل إداري', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('متابعة **', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('متابعة فقط', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('متداولة', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('والأستاذ', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('(متابعة لورود التقرير في 31', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('**متابعة', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('*متابعة*', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('الأستاذ', 1, 'bare honorific, not a name');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('العميل', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('أجازة - مطلوب معرفة القرار غدا أو يوم الأحد على الأكثر', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('لن تباشر من جانب العميل **', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('لن يباشرها المكتب بناء على طلب العميل', 1, 'note typed into a name field, confirmed by the firm');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('متابعة سداد الأمانة **', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('متابعة فقط بعد الجلسة (هاني الدالي) **', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('متابعة موعد الجلسة القادمة (تأجيل إداري) من هاني الدالي **', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('مستشارون قانونيون', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('والأستاذة', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('وأ.د', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('يتم تركها للشطب', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('**', 4143, 'placeholder - no attendance recorded');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('لا يوجد حضور', 21, 'no attendance');
INSERT INTO migration_excluded_name (raw_value, occurrences, reason) VALUES ('متابعة', 10, 'status value, not a person');
-- GENERATED_MATTER_RELATIONSHIP_RULES_END

DO $POSTCONDITIONS$
DECLARE
    actual integer;
BEGIN
    SELECT count(*) INTO actual FROM migration_multi_person_rule;
    IF actual <> 33 THEN RAISE EXCEPTION 'multi-person rules: %, expected 33', actual; END IF;
    SELECT count(*) INTO actual FROM migration_multi_person_rule_member;
    IF actual <> 84 THEN RAISE EXCEPTION 'multi-person members: %, expected 84', actual; END IF;
    SELECT count(*) INTO actual FROM migration_excluded_name;
    IF actual <> 38 THEN RAISE EXCEPTION 'excluded names: %, expected 38', actual; END IF;
    SELECT count(*) INTO actual
      FROM migration_multi_person_rule r
     WHERE NOT EXISTS (SELECT 1 FROM migration_multi_person_rule_member m WHERE m.rule_id = r.id);
    IF actual <> 0 THEN RAISE EXCEPTION 'multi-person rules without members: %', actual; END IF;
    SELECT count(*) INTO actual
      FROM migration_multi_person_rule_member m
      LEFT JOIN person_name_alias a ON a.alias_ar = m.person_name AND a.person_id = m.person_id
     WHERE a.id IS NULL;
    IF actual <> 0 THEN RAISE EXCEPTION 'multi-person members not resolved through exact aliases: %', actual; END IF;
    SELECT count(*) INTO actual FROM (
        SELECT rule_id
          FROM migration_multi_person_rule_member
         GROUP BY rule_id
        HAVING min(ordinal) <> 1 OR max(ordinal) <> count(*) OR count(DISTINCT ordinal) <> count(*)
    ) broken;
    IF actual <> 0 THEN RAISE EXCEPTION 'multi-person rules with broken ordinals: %', actual; END IF;
END;
$POSTCONDITIONS$;

COMMIT;
