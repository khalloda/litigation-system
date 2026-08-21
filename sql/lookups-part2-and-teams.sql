-- ============================================================================
--  Lookups part 2 — the four tables missing from lookups-and-crosswalk.sql
--
--  The first SQL file created and seeded five lookups: matter_type,
--  matter_category, degree, venue and importance.
--
--  This file supplies the other four that TASKS.md task 1.1 expects:
--      party_role            11 values
--      hearing_action        23 values
--      matter_destination    27 values
--      client_branch         32 values
--
--  All values below were reviewed and ACCEPTED by the firm.
--
--  Same rules as before: these are TABLES, never PostgreSQL enums, so an
--  administrator can add a court or a branch without a code change.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  party_role  --  see decision D7
--
--  Replaces 242 distinct capacity strings found in the Access columns
--  client&Cap and opponent&Cap. Those 242 were mostly Arabic grammatical
--  inflections of these 11 roles.
--
--  The masculine and feminine forms are stored so the correct word can be
--  rendered from the role plus the party's gender. Dual and plural forms
--  (مستأنفتان, مدعى عليهم) collapse to the base role — confirmed by the firm.
--
--  طاعن and متظلم are DIFFERENT roles. Do not merge them.
-- ---------------------------------------------------------------------------
CREATE TABLE lookup_party_role (
    id            smallserial PRIMARY KEY,
    code          text        NOT NULL UNIQUE,
    label_ar_m    text        NOT NULL,
    label_ar_f    text        NOT NULL,
    label_en      text,
    sort_order    smallint    NOT NULL DEFAULT 100,
    is_active     boolean     NOT NULL DEFAULT true
);

INSERT INTO lookup_party_role (code, label_ar_m, label_ar_f, label_en, sort_order) VALUES ('plaintiff', 'مدعي', 'مدعية', 'Plaintiff', 10);
INSERT INTO lookup_party_role (code, label_ar_m, label_ar_f, label_en, sort_order) VALUES ('defendant', 'مدعى عليه', 'مدعى عليها', 'Defendant', 20);
INSERT INTO lookup_party_role (code, label_ar_m, label_ar_f, label_en, sort_order) VALUES ('appellant', 'مستأنف', 'مستأنفة', 'Appellant', 30);
INSERT INTO lookup_party_role (code, label_ar_m, label_ar_f, label_en, sort_order) VALUES ('appellee', 'مستأنف ضده', 'مستأنف ضدها', 'Appellee', 40);
INSERT INTO lookup_party_role (code, label_ar_m, label_ar_f, label_en, sort_order) VALUES ('cassation_petitioner', 'طاعن', 'طاعنة', 'Cassation petitioner', 50);
INSERT INTO lookup_party_role (code, label_ar_m, label_ar_f, label_en, sort_order) VALUES ('cassation_respondent', 'مطعون ضده', 'مطعون ضدها', 'Cassation respondent', 60);
INSERT INTO lookup_party_role (code, label_ar_m, label_ar_f, label_en, sort_order) VALUES ('grievant', 'متظلم', 'متظلمة', 'Grievant', 70);
INSERT INTO lookup_party_role (code, label_ar_m, label_ar_f, label_en, sort_order) VALUES ('grievance_respondent', 'متظلم ضده', 'متظلم ضدها', 'Grievance respondent', 80);
INSERT INTO lookup_party_role (code, label_ar_m, label_ar_f, label_en, sort_order) VALUES ('accused', 'متهم', 'متهمة', 'Accused', 90);
INSERT INTO lookup_party_role (code, label_ar_m, label_ar_f, label_en, sort_order) VALUES ('prosecution', 'سلطة اتهام', 'سلطة اتهام', 'Prosecution', 100);
INSERT INTO lookup_party_role (code, label_ar_m, label_ar_f, label_en, sort_order) VALUES ('civil_claimant', 'مدعي بالحق المدني', 'مدعية بالحق المدني', 'Civil claimant', 110);


-- ---------------------------------------------------------------------------
--  lookup_hearing_action
--  What happened at a hearing (الإجراء). 23 values -- PROVISIONAL.
--
--  NOT reviewed value by value. The review sheet marked all 23 "already
--  clean" without inspection. At least محكمة, محكمه and مجكمة are one word
--  typed three ways. Being re-analysed against the Access data; corrected
--  values will replace these.
-- ---------------------------------------------------------------------------
CREATE TABLE lookup_hearing_action (
    id          smallserial PRIMARY KEY,
    label_ar    text        NOT NULL UNIQUE,
    label_en    text,
    sort_order  smallint    NOT NULL DEFAULT 100,
    is_active   boolean     NOT NULL DEFAULT true
);

INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('محكمة', 10);   -- 11210 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('خبير', 20);   -- 1278 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('لجنة', 30);   -- 259 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('نيابة', 40);   -- 64 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('هيئة', 50);   -- 27 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('خبراء', 60);   -- 26 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('لجنة خبراء', 70);   -- 18 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('تحكيم', 80);   -- 11 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('طب شرعي', 90);   -- 10 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('محكمه', 100);   -- 9 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('مفوضين', 110);   -- 8 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('مجكمة', 120);   -- 8 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('لجنة تفتيش', 130);   -- 6 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('قسم', 140);   -- 3 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('محكمة مجلس الدولة بالرحاب', 150);   -- 3 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('محضر', 160);   -- 2 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('معاينة', 170);   -- 2 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('قسم شرطة', 180);   -- 1 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('تحقيق', 190);   -- 1 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('حضور جلسة', 200);   -- 1 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('رفع الدعوى', 210);   -- 1 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('أول جلسة', 220);   -- 1 rows
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('رفع الدعوي', 230);   -- 1 rows


-- ---------------------------------------------------------------------------
--  lookup_matter_destination
--  Destination / authority the matter sits with (الجهة). Mostly courts and
--  government bodies. Note it already contains "هيئة الاستثمار -صلاح سالم",
--  which may be the same body as the authority arriving from the لجنة تفتيش
--  split — flagged for the firm, not merged.
-- ---------------------------------------------------------------------------
CREATE TABLE lookup_matter_destination (
    id          smallserial PRIMARY KEY,
    label_ar    text        NOT NULL UNIQUE,
    label_en    text,
    sort_order  smallint    NOT NULL DEFAULT 100,
    is_active   boolean     NOT NULL DEFAULT true
);

INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('جنوب الجيزة', 10);   -- 34 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('دار القضاء العالي', 20);   -- 24 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('العباسية', 30);   -- 24 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('مجلس الدولة بالجيزة', 40);   -- 21 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('شمال الجيزة', 50);   -- 12 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('القاهرة الاقتصادية', 60);   -- 12 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('التجمع الخامس', 70);   -- 11 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('6 أكتوبر', 80);   -- 9 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('شبين الكوم', 90);   -- 6 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('الإسكندرية', 100);   -- 6 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('تاج الدول', 110);   -- 4 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('القناطر', 120);   -- 3 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('القاهرة', 130);   -- 3 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('أسيوط', 140);   -- 3 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('جنوب القاهرة', 150);   -- 3 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('عابدين', 160);   -- 3 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('مصر الجديدة', 170);   -- 2 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('المنصورة', 180);   -- 2 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('مصلحة الضرائب', 190);   -- 2 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('نقابة الأطباء', 200);   -- 1 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('المعادي', 210);   -- 1 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('العبور', 220);   -- 1 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('العجوزة', 230);   -- 1 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('مدينة نصر', 240);   -- 1 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('الزقازيق', 250);   -- 1 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('هيئة الاستثمار -صلاح سالم', 260);   -- 1 rows
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('رشيد', 270);   -- 1 rows


-- ---------------------------------------------------------------------------
--  lookup_client_branch
--  Client branch / group (clientBranch). 32 values.
-- ---------------------------------------------------------------------------
CREATE TABLE lookup_client_branch (
    id          smallserial PRIMARY KEY,
    label_ar    text        NOT NULL UNIQUE,
    label_en    text,
    sort_order  smallint    NOT NULL DEFAULT 100,
    is_active   boolean     NOT NULL DEFAULT true
);

INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('المنطقة الحرة', 10);   -- 193 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('دعاوى عمالية', 20);   -- 87 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('المصنع المحلي', 30);   -- 67 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('الفطيم لإنشاء وتنمية المنتجعات السكنية', 40);   -- 29 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('تويوتا إيجيبت', 50);   -- 26 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('الجنح', 60);   -- 17 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('تويوتا مصر للتجارة', 70);   -- 16 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('المركز الرئيسي', 80);   -- 13 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('ثانياً: النزاعات القضائية المقامة من وضد شركتي الإمارات هايتس ويافا ماك', 90);   -- 13 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('الفطيم للتنمية العقارية', 100);   -- 11 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('دعاوى قضائية', 110);   -- 10 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('تويوتا إيجيبت لصناعة السيارات', 120);   -- 8 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('النقض', 130);   -- 7 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('سيجما للإعلام (تليفزيون الحياة)', 140);   -- 7 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('أوراسكوم للفنادق', 150);   -- 6 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('الفطيم لإقامة المراكز التجارية والإدارية', 160);   -- 6 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('سيجما للصناعات الدوائية', 170);   -- 6 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('قضاء إداري', 180);   -- 6 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('ضرائب', 190);   -- 5 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('فرع المنصورة', 200);   -- 4 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('آراء قانونية', 210);   -- 4 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('الفطيم للسيارات', 220);   -- 3 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('مدني', 230);   -- 3 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('الفطيم مصر للبيع بالتجزئة', 240);   -- 3 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('القضاء الإداري', 250);   -- 2 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('جنح', 260);   -- 2 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('أوراسكوم للاتصالات', 270);   -- 1 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('فرع الإسكندرية', 280);   -- 1 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('تعويضات', 290);   -- 1 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('ألفا مصر للتجارة', 300);   -- 1 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('أولاً: طلب وشكوى أمام الهيئة العامة للاستثمار', 310);   -- 1 rows
INSERT INTO lookup_client_branch (label_ar, sort_order) VALUES ('إقتصادي', 320);   -- 1 rows



-- ============================================================================
--  TEAMS — see decision D6
--
--  (An earlier version of this header cited D18 as well. That was wrong:
--   D18 is the parameterised client report and has nothing to do with teams.)
--
--  IMPORTANT: teams do NOT go on the matter. D6 removed that, because 1,507 of
--  1,730 matters were all on "team 1" — a field where 87% of rows share one
--  value carries no information.
--
--  The team label lives on the PERSON. That is a fact which stays true even as
--  matters churn, and it is what the team-grouped reports need.
--
--  The membership below was recovered from the Access table فريق العمل, where
--  the member list was stored as a single text blob separated by tabs and line
--  breaks. It is a STARTING POINT for the firm to confirm — not gospel. Only
--  12 of the 23 current staff appear in it.
-- ============================================================================

CREATE TABLE lookup_team (
    id           smallserial PRIMARY KEY,
    code         text,                              -- 'A' / 'B'
    label_ar     text        NOT NULL UNIQUE,
    specialisms  text,                              -- التخصصات, free text
    reviewer_id  integer     REFERENCES people (id),-- المراجع
    sort_order   smallint    NOT NULL DEFAULT 100,
    is_active    boolean     NOT NULL DEFAULT true
);

-- The team label on the PERSON, not on the matter.
ALTER TABLE people
    ADD COLUMN team_id smallint REFERENCES lookup_team (id);

COMMENT ON COLUMN people.team_id IS
    'Which work team this person belongs to. Used by the team-grouped reports. '
    'Deliberately NOT on the matter — see decision D6.';

INSERT INTO lookup_team (code, label_ar, sort_order) VALUES ('A', 'الفريق أ', 10);
INSERT INTO lookup_team (code, label_ar, sort_order) VALUES ('B', 'الفريق ب', 20);

-- Reviewers (المراجع) recorded in Access:
--     team 1 (code A) -> ناجي رمضان
--     team 2 (code B) -> ناجي رمضان
--     team 3 (code A) -> د. هاني سري الدين
UPDATE lookup_team SET reviewer_id = (SELECT id FROM people WHERE name_ar = 'ناجي رمضان')
WHERE code = 'A';
UPDATE lookup_team SET reviewer_id = (SELECT id FROM people WHERE name_ar = 'ناجي رمضان')
WHERE code = 'B';

-- ---- membership recovered from the Access blob -----------------------------
-- Team 1 / A
-- Matched through person_name_alias so a hamza variant cannot miss.
UPDATE people p SET team_id = (SELECT id FROM lookup_team WHERE code = 'A')
WHERE EXISTS (
    SELECT 1 FROM person_name_alias a
    WHERE a.person_id = p.id
      AND a.alias_ar IN ('إيهاب حمدي', 'مؤمن سليم', 'أحمد إسماعيل', 'أحمد سيف')
);

-- Team 2 / B
UPDATE people p SET team_id = (SELECT id FROM lookup_team WHERE code = 'B')
WHERE EXISTS (
    SELECT 1 FROM person_name_alias a
    WHERE a.person_id = p.id
      AND a.alias_ar IN ('محمد عبد العزيز عبد الحافظ', 'محمد عبد العزيز',
                         'أحمد سعيد', 'هاني الدالي', 'محمود شعبان')
);

-- NOTE: Access "team 3" was also code A, with members محمد عبد العزيز,
-- أحمد سعيد, هاني الدالي and أحمد إسماعيل — overlapping teams 1 and 2, used by
-- only 3 matters, and with a different reviewer. It looks like an abandoned
-- duplicate. It is NOT created here. Ask the firm before adding it.

-- ---- staff with no team yet ------------------------------------------------
-- The Access blob assigns 8 DISTINCT people across the two teams. Of those,
-- only 5 are current staff -- مؤمن سليم, أحمد إسماعيل and محمود شعبان have
-- left the firm. The recorded team membership is therefore largely historical.
--
-- That leaves 16 of the 21 current staff with team_id NULL:
--     محمود علي, سامي إبراهيم خطاب, ناجي رمضان, هاني سري الدين, محمد حمدي,
--     عبد الرحمن البنا, نهى رضوان, أميرة شريف, عمرو سليم, عبد الله حافظ,
--     شريف شكري, احمد أبو العباس الاتربي, أحمد رزق, كريم أيمن, عمرو صقر,
--     نيرمين حجازي
--
--     5 assigned + 16 unassigned = 21 current staff.
--
--  NOTE: this said "18 of 23" until the two hamza duplicates were merged out.
--  Both duplicates were CURRENT staff, so current staff fell 23 -> 21 and the
--  unassigned figure fell 18 -> 16. The five who DO have a team are
--  إيهاب حمدي, أحمد سيف, محمد عبد العزيز عبد الحافظ, أحمد سعيد, هاني الدالي.
--  أحمد إسماعيل and محمود شعبان are team-assigned but FORMER staff, so they
--  belong in neither figure.
--
-- A NULL team is VALID. Team-grouped reports must show these people under an
-- "unassigned" heading rather than dropping them -- otherwise a report headed
-- "hearings by team" would silently omit most of the firm.
--
-- The firm will confirm the final membership before Stage 6.

-- ============================================================================
--  VALIDATION
-- ============================================================================
SELECT 'party_role'         AS lookup, count(*) FROM lookup_party_role
UNION ALL SELECT 'hearing_action',      count(*) FROM lookup_hearing_action
UNION ALL SELECT 'matter_destination',  count(*) FROM lookup_matter_destination
UNION ALL SELECT 'client_branch',       count(*) FROM lookup_client_branch
UNION ALL SELECT 'team',                count(*) FROM lookup_team;
-- Expected: 11, 23, 27, 32, 2

SELECT t.label_ar, count(p.id) AS members
FROM   lookup_team t LEFT JOIN people p ON p.team_id = t.id
GROUP  BY t.label_ar;
-- Expected: الفريق أ = 4, الفريق ب = 4   (8 distinct people, 5 of them current)

SELECT count(*) AS current_staff_without_team
FROM   people
WHERE  is_staff AND is_active AND team_id IS NULL;
-- Expected: 16

SELECT count(*) AS current_staff
FROM   people
WHERE  is_staff AND is_active;
-- Expected: 21   (was 23 before the two hamza duplicates were merged)

SELECT count(*) AS total_people FROM people;
-- Expected: 138  (two hamza duplicates were merged out -- see the roster file)
