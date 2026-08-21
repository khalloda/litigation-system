-- ============================================================================
--  CORRECTION to lookup_hearing_action and lookup_client_branch
--
--  WHY THIS EXISTS
--  ---------------
--  The original crosswalk workbook marked all 23 hearing actions and all 32
--  client branches as "already clean — becomes its own list entry" WITHOUT
--  inspecting them. That default was wrong. Four of the values are keyboard
--  slips of other values in the same list:
--
--      مجكمة       ج typed for ح   (adjacent keys)   ->  محكمة
--      محكمه       ه typed for ة                     ->  محكمة
--      رفع الدعوي  ي typed for ى                     ->  رفع الدعوى
--      جنح         missing definite article          ->  الجنح
--
--  Confirmed by the firm, 21 August 2026.
--
--  Scale: محكمة appears on 11,210 hearings; its two misspellings on 17
--  between them. These are typos, not distinctions.
--
--  NOT merged, though an algorithm flags them as similar:
--      تحكيم (arbitration, 11 rows)  and  تحقيق (investigation, 1 row)
--      are different words. Both are kept.
--
--  RESULT
--      lookup_hearing_action   23 -> 20 values
--      lookup_client_branch    32 -> 31 values
--      total seeded rows      150 -> 146
--
--  Every hearing and matter keeps its ORIGINAL text in its legacy_raw column,
--  so nothing is lost by merging. If a merge is later judged wrong it can be
--  reversed from the raw value.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1. Record the merges in the crosswalk, so migration maps old text correctly
-- ---------------------------------------------------------------------------
-- If migration_crosswalk does not exist yet (deferred to Stage 2), create it
-- there and include these rows.

INSERT INTO migration_crosswalk
    (source_field, source_value, rows_affected, target_field, target_value, reviewer_note)
VALUES
    ('hearing_action', 'محكمه',        9,  'hearing_action', 'محكمة',
     'Typo: ه for ة. Confirmed by the firm 21 Aug 2026.'),
    ('hearing_action', 'مجكمة',        8,  'hearing_action', 'محكمة',
     'Typo: ج for ح, adjacent keys. Confirmed by the firm 21 Aug 2026.'),
    ('hearing_action', 'رفع الدعوي',   1,  'hearing_action', 'رفع الدعوى',
     'Typo: ي for ى. Confirmed by the firm 21 Aug 2026.'),
    ('client_branch',  'جنح',          2,  'client_branch',  'الجنح',
     'Same value without the definite article. Confirmed by the firm 21 Aug 2026.');


-- ---------------------------------------------------------------------------
--  2. lookup_hearing_action — 20 values
--     Ordered by frequency in the live data.
-- ---------------------------------------------------------------------------
DELETE FROM lookup_hearing_action;

INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('محكمة',                        10);   -- 11,227 hearings (incl. 17 merged)
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('خبير',                         20);   -- 1,278
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('لجنة',                         30);   -- 259
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('نيابة',                        40);   -- 64
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('هيئة',                         50);   -- 27
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('خبراء',                        60);   -- 26
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('لجنة خبراء',                   70);   -- 18
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('تحكيم',                        80);   -- 11
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('طب شرعي',                      90);   -- 10
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('مفوضين',                      100);   -- 8
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('لجنة تفتيش',                  110);   -- 6
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('قسم',                         120);   -- 3
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('محكمة مجلس الدولة بالرحاب',   130);   -- 3
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('محضر',                        140);   -- 2
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('معاينة',                      150);   -- 2
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('رفع الدعوى',                  160);   -- 2 (incl. 1 merged)
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('قسم شرطة',                    170);   -- 1
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('تحقيق',                       180);   -- 1  NOT the same as تحكيم
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('حضور جلسة',                   190);   -- 1
INSERT INTO lookup_hearing_action (label_ar, sort_order) VALUES ('أول جلسة',                    200);   -- 1


-- ---------------------------------------------------------------------------
--  3. lookup_client_branch — remove the duplicate only
--
--  NOTE FOR STAGE 6, NOT FOR NOW
--  This column holds at least three different concepts and needs untangling
--  before the branch-filtered reports are built:
--    * genuine client branches   تويوتا إيجيبت, الفطيم للتنمية العقارية, فرع المنصورة
--    * practice areas duplicating matter_category
--                                مدني, ضرائب, تعويضات, إقتصادي, قضاء إداري, النقض
--    * two numbered headings pasted from a document:
--         'ثانياً: النزاعات القضائية المقامة من وضد شركتي الإمارات هايتس ويافا ماك'  (13 matters)
--         'أولاً: طلب وشكوى أمام الهيئة العامة للاستثمار'                            (1 matter)
--
--  Deliberately NOT fixed now: it is the same overloaded-column pattern as
--  matterDegree, it affects 560 matters rather than 13,279 hearings, and
--  untangling it means deciding what a branch is for. Raise it with the firm
--  before task 6.2.
-- ---------------------------------------------------------------------------
DELETE FROM lookup_client_branch WHERE label_ar = 'جنح';


-- ============================================================================
--  VALIDATION — assert, do not assume
-- ============================================================================

-- Expected: hearing_action 20, client_branch 31, total 146
SELECT 'matter_type'        AS list, count(*) FROM lookup_matter_type
UNION ALL SELECT 'matter_category',   count(*) FROM lookup_matter_category
UNION ALL SELECT 'degree',            count(*) FROM lookup_degree
UNION ALL SELECT 'venue',             count(*) FROM lookup_venue
UNION ALL SELECT 'importance',        count(*) FROM lookup_importance
UNION ALL SELECT 'party_role',        count(*) FROM lookup_party_role
UNION ALL SELECT 'hearing_action',    count(*) FROM lookup_hearing_action
UNION ALL SELECT 'matter_destination',count(*) FROM lookup_matter_destination
UNION ALL SELECT 'client_branch',     count(*) FROM lookup_client_branch;
-- Expected: 14, 21, 12, 7, 3, 11, 20, 27, 31   TOTAL 146

-- The merged spellings must NOT exist as list entries.
SELECT label_ar FROM lookup_hearing_action
WHERE  label_ar IN ('محكمه', 'مجكمة', 'رفع الدعوي');
-- Expected: zero rows

SELECT label_ar FROM lookup_client_branch WHERE label_ar = 'جنح';
-- Expected: zero rows

-- تحكيم and تحقيق must BOTH still exist — they are different words.
SELECT count(*) FROM lookup_hearing_action WHERE label_ar IN ('تحكيم', 'تحقيق');
-- Expected: 2
