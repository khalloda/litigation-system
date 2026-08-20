-- ============================================================================
--  People roster + name crosswalk
--  Generated from Staff-Names-For-Review, fully reviewed by the firm.
--
--  THE PROBLEM THIS SOLVES
--  -----------------------
--  Names were typed by hand into 18 different columns for six years. The raw
--  data held 373 distinct spellings. After the firm's review these
--  resolve to 138 real people:
--       67 firm staff (21 current, 46 former)
--       71 external people (mostly counsel named on powers of attorney)
--
--  WAS 140 (69 staff / 23 current). Two CURRENT-staff rows were hamza
--  duplicates and have been merged out, their spellings kept as aliases:
--       احمد إسماعيل  ->  أحمد إسماعيل   (U+0627 vs U+0623 at character 0)
--       احمد سعيد     ->  أحمد سعيد
--  Every derived figure moved with them: staff 69->67, current 23->21.
--  Aliases 338 -> 339.
--
--  Some fields held SEVERAL people in one string, with no consistent
--  separator, e.g.
--       'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد'  = 2 lawyers
--       'محمد عبد العزيز ا. ايهاب حمدي'                    = 2 lawyers
--  These could not be split automatically. The firm annotated each one, and
--  those annotations became the split rules at the end of this file.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  people : every human the system knows about
--
--  is_staff = false covers external counsel who appear on powers of attorney.
--  They are real people and must be recorded, but they never log in, are never
--  assigned matters, and do not appear in staff pick-lists.
-- ---------------------------------------------------------------------------
CREATE TABLE people (
    id              serial PRIMARY KEY,
    name_ar         text        NOT NULL UNIQUE,
    name_en         text,
    is_staff        boolean     NOT NULL DEFAULT true,
    is_active       boolean     NOT NULL DEFAULT true,   -- false = has left the firm
    is_trainee      boolean     NOT NULL DEFAULT false,
    can_login       boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX people_staff_active_idx ON people (is_staff, is_active);

COMMENT ON COLUMN people.is_active IS
    'false = former staff. Retained so historical hearings and matters keep '
    'showing who actually did the work. Excluded from new-entry dropdowns.';


-- ---------------------------------------------------------------------------
--  person_name_alias : every spelling ever typed, mapped to one person
--
--  This is what makes the migration safe. Any raw Access string can be looked
--  up here to find the right person, and searching for any historical spelling
--  still finds the person today.
-- ---------------------------------------------------------------------------
CREATE TABLE person_name_alias (
    id          serial PRIMARY KEY,
    person_id   integer NOT NULL REFERENCES people (id) ON DELETE CASCADE,
    alias_ar    text    NOT NULL UNIQUE,
    is_primary  boolean NOT NULL DEFAULT false
);

CREATE INDEX person_name_alias_person_idx ON person_name_alias (person_id);


-- ---- roster: current staff -------------------------------------------------
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('محمود علي', 'Mahmoud Ali', true, true, false);   -- 4456 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('هاني الدالي', 'Hani El-Daly', true, true, false);   -- 3044 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('محمد عبد العزيز عبد الحافظ', 'Mohamed Abd El-Aziz', true, true, false);   -- 3022 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('إيهاب حمدي', 'Ehab Hamdy', true, true, false);   -- 2792 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('سامي إبراهيم خطاب', 'Samy Khattab', true, true, false);   -- 2211 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('أحمد سعيد', 'Ahmed Said', true, true, false);   -- 2000 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('ناجي رمضان', 'Nagy Ramadan', true, true, false);   -- 1387 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('هاني سري الدين', 'Dr. Hani Sarie El-Din', true, true, false);   -- 752 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('محمد حمدي', NULL, true, true, false);   -- 307 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('عبد الرحمن البنا', 'Abd Al-Rahman Al-Bana', true, true, false);   -- 302 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('نهى رضوان', NULL, true, true, false);   -- 106 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('أميرة شريف', NULL, true, true, false);   -- 103 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('عمرو سليم', 'Amr Mohammed', true, true, false);   -- 45 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('عبد الله حافظ', NULL, true, true, false);   -- 19 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('أحمد سيف', 'Ahmed Seif', true, true, false);   -- 8 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('شريف شكري', NULL, true, true, false);   -- 7 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('احمد أبو العباس الاتربي', NULL, true, true, false);   -- 5 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('أحمد رزق', NULL, true, true, false);   -- 4 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('كريم أيمن', NULL, true, true, false);   -- 4 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('عمرو صقر', 'Amr Sakr', true, true, false);   -- 1 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('نيرمين حجازي', NULL, true, true, false);   -- 1 mentions

-- ---- roster: former staff --------------------------------------------------
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('محمود شعبان', 'Mahmoud Sha’ban', true, false, false);   -- 1412 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('مؤمن سليم', 'Mo''men Selim', true, false, false);   -- 1322 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('أحمد إسماعيل', 'Ahmed Ismail', true, false, false);   -- 1309 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('أحمد عبد الله', 'Dr. Ahmed Abdullah', true, false, false);   -- 1090 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('محمد الغرابلي', 'Moahmed El-Gharably', true, false, false);   -- 1006 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('شريف أبو المكارم', NULL, true, false, false);   -- 429 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('خالد عطيه', NULL, true, false, false);   -- 202 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('محمد طارق', 'Mohammed Tarek', true, false, false);   -- 196 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('أحمد الصيرفي', NULL, true, false, false);   -- 161 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('حسام الدين عمر', NULL, true, false, false);   -- 143 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('عمرو حسني', NULL, true, false, false);   -- 103 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('أحمد فرحات', NULL, true, false, false);   -- 96 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('منة الله البلتاجي', NULL, true, false, false);   -- 93 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('ليلى حسني', NULL, true, false, false);   -- 86 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('مريهان خالد', NULL, true, false, false);   -- 78 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('عادل عبد الرحمن', NULL, true, false, false);   -- 73 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('مصطفى نصار', 'Mostafa Nassar', true, false, false);   -- 60 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('منة صبري', NULL, true, false, false);   -- 56 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('باسم عبد الرحمن', NULL, true, false, false);   -- 56 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('خالد كمال', 'Khaled Kamal', true, false, false);   -- 48 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('محمد أبو النجا', NULL, true, false, false);   -- 45 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('رامي البرعي', NULL, true, false, false);   -- 41 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('إسلام سمير', NULL, true, false, false);   -- 39 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('معتز الدريني', NULL, true, false, false);   -- 39 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('حسن خلف', NULL, true, false, true);   -- 38 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('عمر عصام', NULL, true, false, false);   -- 37 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('حسام الدين فداء', NULL, true, false, false);   -- 31 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('أحمد جمال', NULL, true, false, true);   -- 26 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('عمر شادي', NULL, true, false, false);   -- 22 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('منتصر المصري', NULL, true, false, false);   -- 22 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('بسام الزيات', NULL, true, false, false);   -- 16 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('محمود الغرباوي', NULL, true, false, false);   -- 14 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('نيرمين هاني', 'Nermin Hani', true, false, false);   -- 14 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('علي سالم', NULL, true, false, false);   -- 6 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('حبيبة عيسى', NULL, true, false, false);   -- 4 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('احمد عبدالله', NULL, true, false, false);   -- 4 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('أحمد يوسف الصيرفي', NULL, true, false, false);   -- 3 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('لينه قناوي', NULL, true, false, false);   -- 3 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('محمد والي', NULL, true, false, false);   -- 3 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('احمد فرحات', NULL, true, false, false);   -- 3 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('وسام صالح', NULL, true, false, false);   -- 3 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('عبد الله الشهابي', NULL, true, false, false);   -- 2 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('ليلى طموم', NULL, true, false, false);   -- 2 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('هانيا أبو العيون', NULL, true, false, false);   -- 2 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('مكتب سري الدين وشركاه', NULL, true, false, false);   -- 1 mentions
INSERT INTO people (name_ar, name_en, is_staff, is_active, is_trainee) VALUES ('خالد عطية', NULL, true, false, false);   -- 1 mentions

-- ---- external people (powers of attorney, opposing/observing counsel) ------
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('خالد محمود حمدي عبد العزيز', false, true);   -- 74 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('حسني حمزة عبدالله', false, true);   -- 62 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('طه خميس', false, true);   -- 46 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('أحمد حسن البرعي', false, true);   -- 33 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('طه خميس أبو الليل', false, true);   -- 24 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد مدبولي', false, true);   -- 24 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمود مصطفى عوض', false, true);   -- 16 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('طارق بهجت', false, true);   -- 12 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('علاء محي الدين', false, true);   -- 6 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمود جمال', false, true);   -- 6 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('أستاذة', false, true);   -- 5 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('سيد كيلاني', false, true);   -- 3 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('طارق محمد بهجت', false, true);   -- 3 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('طه أبو الليل', false, true);   -- 3 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('عصام عبد الغني غباشي', false, true);   -- 3 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('عمرو محمد أحمد إسماعيل', false, true);   -- 3 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد جوهر أحمد زغلول', false, true);   -- 3 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد شديد لبيب الحناوي', false, true);   -- 3 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمود جمال محمود عبد العزيز', false, true);   -- 3 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('ناجي السيد أبو العزم', false, true);   -- 3 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('أحمد عبد المجيد محمود خليل', false, true);   -- 2 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('سامي عبد الباقي', false, true);   -- 2 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('طه خميس أو الليل حسن', false, true);   -- 2 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('عدلي سعيد', false, true);   -- 2 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('غبريال قسطور غبريال قسطور', false, true);   -- 2 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد بهاء الدين أبو شقة', false, true);   -- 2 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('نيرمين عبد العال', false, true);   -- 2 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('إبراهيم محمد أحمد أبو النيل', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('إيهاب عادل رمزي', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('أحمد البرعي', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('أحمد محمد عبد الخالق سيد أحمد', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('أسامة يحيى محمود مخلوف', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('بدر الدين هاشم محجوب إبراهيم', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('ثروت صمويل ساويرس', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('حسين سيد عبد المنعم', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('حسين محمد حسين عبد العال', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('دينا يحيى قدري', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('ذكي محمد النجار', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('سامي ثابت', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('سيد توني عبد الباقي', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('شعبان', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('شعبان عبد النبي السيد', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('طارق محمد بهجت قايد', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('طه خميس أب', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('طه خميس أبو الليل حسن', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('طه خيس أبو زيد', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('عباس عبد الرحمن محمد', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('عبد الرؤوف محمد أحمد مهدي', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('عصام فواز أمين فواز', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('علاء كمال حجازي', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('على شريف', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('عمر أحمدج علي أحمد', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('ماجد فرج ميخائيل سمان', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محسن محمد محمد زكي', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد حسن علي عبد المولى', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد سعد مصطفى', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد سيد مصطفى الجمال', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد عبد الرحيم حسن', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد عبد اللطيف محموده', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد محمد عيد السيد محمد', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد مدبولي رمضان', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمد مصطفى محمد علي ناصر', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمود مصطفى عوض أحمد', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('محمود مصطفى معوض', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('منى لطفي زكي وهبه', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('مينا حنا شاكر', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('مينا مجدي عبده إبراهيم', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('ندى محمد احمد على', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('هاني عبدالحميد أبو سمرة', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('يحيى علي قدري', false, true);   -- 1 mentions
INSERT INTO people (name_ar, is_staff, is_active) VALUES ('يسري سعدي لبيب أحمد', false, true);   -- 1 mentions

-- ---- aliases: every spelling ever typed ------------------------------------
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'احمد إسماعيل', false FROM people WHERE name_ar = 'أحمد إسماعيل';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, '10- محمود شعبان', false FROM people WHERE name_ar = 'محمود شعبان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد شعبان', false FROM people WHERE name_ar = 'محمود شعبان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمود', false FROM people WHERE name_ar = 'محمود شعبان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمود شعبان', true FROM people WHERE name_ar = 'محمود شعبان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمود شعبان محمود', false FROM people WHERE name_ar = 'محمود شعبان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد أبو العباس', false FROM people WHERE name_ar = 'احمد أبو العباس الاتربي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد الأتربي', false FROM people WHERE name_ar = 'احمد أبو العباس الاتربي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'احمد أبو العباس', false FROM people WHERE name_ar = 'احمد أبو العباس الاتربي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'احمد الاتربي', false FROM people WHERE name_ar = 'احمد أبو العباس الاتربي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أميرة شريف', true FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أميرة شريف أحمد سعيد', false FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أميرة شريف أحمد فرحات', false FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أميرة على شريف', false FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أميرة محمد شريف', false FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أميرة محمد على', false FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أميرة محمد على شريف', false FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أميرة محمد علي شريف', false FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'الاستاذه أميرة محمد على شريف', false FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'اميرة شريف', false FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'اميرة محمد على شريف', false FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'اميرة محمد علي شريف', false FROM people WHERE name_ar = 'أميرة شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'الاستاذه منه الله صبري', false FROM people WHERE name_ar = 'منة صبري';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منة الله السنوسي', false FROM people WHERE name_ar = 'منة صبري';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منة الله صبري', false FROM people WHERE name_ar = 'منة صبري';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منة صبري', true FROM people WHERE name_ar = 'منة صبري';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منه الله صبري', false FROM people WHERE name_ar = 'منة صبري';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منه الله صبري محمد السنوسي', false FROM people WHERE name_ar = 'منة صبري';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'الاستاذه منه الله نبيل البلتاجي', false FROM people WHERE name_ar = 'منة الله البلتاجي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'من الله البلتاجي', false FROM people WHERE name_ar = 'منة الله البلتاجي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منة البلتاجي', false FROM people WHERE name_ar = 'منة الله البلتاجي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منة الله البلتاجي', true FROM people WHERE name_ar = 'منة الله البلتاجي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منة الله محمد', false FROM people WHERE name_ar = 'منة الله البلتاجي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منة الله نبيل البلتاجي', false FROM people WHERE name_ar = 'منة الله البلتاجي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منة الله نبيل محمد البلتاجي', false FROM people WHERE name_ar = 'منة الله البلتاجي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منة نبيل البلتاجي', false FROM people WHERE name_ar = 'منة الله البلتاجي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منه الله البلتاجي', false FROM people WHERE name_ar = 'منة الله البلتاجي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'الاستاذه نهى عمرو رضوان', false FROM people WHERE name_ar = 'نهى رضوان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'نهى رضوان', true FROM people WHERE name_ar = 'نهى رضوان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'نهى عمرو', false FROM people WHERE name_ar = 'نهى رضوان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'نهى عمرو محمد رضوان', false FROM people WHERE name_ar = 'نهى رضوان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'نهي رضوان', false FROM people WHERE name_ar = 'نهى رضوان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'نهي عمرو', false FROM people WHERE name_ar = 'نهى رضوان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'نهي عمرو محمد', false FROM people WHERE name_ar = 'نهى رضوان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'إبراهيم محمد أحمد أبو النيل', true FROM people WHERE name_ar = 'إبراهيم محمد أحمد أبو النيل';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'إسلام سمير', true FROM people WHERE name_ar = 'إسلام سمير';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أيهاب حمدي', false FROM people WHERE name_ar = 'إيهاب حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أيهاب حمدي إبراهيم', false FROM people WHERE name_ar = 'إيهاب حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'إيهاب', false FROM people WHERE name_ar = 'إيهاب حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'إيهاب حمدى', false FROM people WHERE name_ar = 'إيهاب حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'إيهاب حمدي', true FROM people WHERE name_ar = 'إيهاب حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'إيهاب حمدي إبراهيم', false FROM people WHERE name_ar = 'إيهاب حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'إيهاب حمدي إبراهيم إمام', false FROM people WHERE name_ar = 'إيهاب حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'إيهاب حمدي إبراهيم امام', false FROM people WHERE name_ar = 'إيهاب حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'إيهاب حمدي إمام', false FROM people WHERE name_ar = 'إيهاب حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'إيهاب عادل رمزي', true FROM people WHERE name_ar = 'إيهاب عادل رمزي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد البرعي', true FROM people WHERE name_ar = 'أحمد البرعي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد الصيرفي', true FROM people WHERE name_ar = 'أحمد الصيرفي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد إسماعيل', true FROM people WHERE name_ar = 'أحمد إسماعيل';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد إسماعيل (متابعة)', false FROM people WHERE name_ar = 'أحمد إسماعيل';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد جمال', true FROM people WHERE name_ar = 'أحمد جمال';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد جمال (متدرب)', false FROM people WHERE name_ar = 'أحمد جمال';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد حسن البرعي', true FROM people WHERE name_ar = 'أحمد حسن البرعي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد رزق', true FROM people WHERE name_ar = 'أحمد رزق';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد سعيد', true FROM people WHERE name_ar = 'أحمد سعيد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد سعيد أحمد', false FROM people WHERE name_ar = 'أحمد سعيد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد سعيد أحمد علي', false FROM people WHERE name_ar = 'أحمد سعيد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد سعيد أحمد محمد علي', false FROM people WHERE name_ar = 'أحمد سعيد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'احمد سعيد', false FROM people WHERE name_ar = 'أحمد سعيد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'احمد سعيد احمد', false FROM people WHERE name_ar = 'أحمد سعيد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد سيف', true FROM people WHERE name_ar = 'أحمد سيف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد عبد الله', true FROM people WHERE name_ar = 'أحمد عبد الله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد عبد الله أحمد', false FROM people WHERE name_ar = 'أحمد عبد الله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد عبد الله محمد', false FROM people WHERE name_ar = 'أحمد عبد الله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد عبد الله محمد علي', false FROM people WHERE name_ar = 'أحمد عبد الله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد عبدالله', false FROM people WHERE name_ar = 'أحمد عبد الله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد عبدالله محمد', false FROM people WHERE name_ar = 'أحمد عبد الله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'احمد عبد الله', false FROM people WHERE name_ar = 'أحمد عبد الله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد عبد المجيد محمود خليل', true FROM people WHERE name_ar = 'أحمد عبد المجيد محمود خليل';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد فرحات', true FROM people WHERE name_ar = 'أحمد فرحات';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد نبيل علي شريف فرحات', false FROM people WHERE name_ar = 'أحمد فرحات';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد نبيل فرحات', false FROM people WHERE name_ar = 'أحمد فرحات';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد نبيل محمد جمال الدين فرحات', false FROM people WHERE name_ar = 'أحمد فرحات';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد محمد عبد الخالق سيد أحمد', true FROM people WHERE name_ar = 'أحمد محمد عبد الخالق سيد أحمد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد يوسف', false FROM people WHERE name_ar = 'أحمد يوسف الصيرفي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أحمد يوسف الصيرفي', true FROM people WHERE name_ar = 'أحمد يوسف الصيرفي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أسامة يحيى محمود مخلوف', true FROM people WHERE name_ar = 'أسامة يحيى محمود مخلوف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'أستاذة', true FROM people WHERE name_ar = 'أستاذة';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'باسم عبد الرحمن', true FROM people WHERE name_ar = 'باسم عبد الرحمن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'باسم عبد الرحمن محمد', false FROM people WHERE name_ar = 'باسم عبد الرحمن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'وباسم عبد الرحمن', false FROM people WHERE name_ar = 'باسم عبد الرحمن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'بدر الدين هاشم محجوب إبراهيم', true FROM people WHERE name_ar = 'بدر الدين هاشم محجوب إبراهيم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'بسام', false FROM people WHERE name_ar = 'بسام الزيات';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'بسام الزيات', true FROM people WHERE name_ar = 'بسام الزيات';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'بسام عبد الكريم الزيات', false FROM people WHERE name_ar = 'بسام الزيات';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ثروت صمويل ساويرس', true FROM people WHERE name_ar = 'ثروت صمويل ساويرس';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حبيبة عيسى', true FROM people WHERE name_ar = 'حبيبة عيسى';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حبيبة محمود سمير', false FROM people WHERE name_ar = 'حبيبة عيسى';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسام الدين أبراهيم عمر', false FROM people WHERE name_ar = 'حسام الدين عمر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسام الدين إبراهيم', false FROM people WHERE name_ar = 'حسام الدين عمر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسام الدين إبراهيم عمر', false FROM people WHERE name_ar = 'حسام الدين عمر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسام الدين إبراهييم عمر', false FROM people WHERE name_ar = 'حسام الدين عمر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسام الدين عمر', true FROM people WHERE name_ar = 'حسام الدين عمر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسام الدين عمر إبراهيم', false FROM people WHERE name_ar = 'حسام الدين عمر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسام الدين عمرإبراهيم', false FROM people WHERE name_ar = 'حسام الدين عمر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسام عمر', false FROM people WHERE name_ar = 'حسام الدين عمر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'والأساتذه حسام الدين عمر إبراهيم', false FROM people WHERE name_ar = 'حسام الدين عمر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'وحسام الدين عمر', false FROM people WHERE name_ar = 'حسام الدين عمر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسام الدين فداء', true FROM people WHERE name_ar = 'حسام الدين فداء';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسام الدين فداء محمد', false FROM people WHERE name_ar = 'حسام الدين فداء';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسام فداء', false FROM people WHERE name_ar = 'حسام الدين فداء';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'وحسام فداءمحمد حمدي كامل', false FROM people WHERE name_ar = 'حسام الدين فداء';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسن خلف', true FROM people WHERE name_ar = 'حسن خلف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسن خلف (متدرب)', false FROM people WHERE name_ar = 'حسن خلف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسن عادل "متدرب', false FROM people WHERE name_ar = 'حسن خلف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسني حم', false FROM people WHERE name_ar = 'حسني حمزة عبدالله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسني حمزة', false FROM people WHERE name_ar = 'حسني حمزة عبدالله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسني حمزة عبد', false FROM people WHERE name_ar = 'حسني حمزة عبدالله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسني حمزه', false FROM people WHERE name_ar = 'حسني حمزة عبدالله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسني حمزه ع', false FROM people WHERE name_ar = 'حسني حمزة عبدالله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسني حمزه عبد الله', false FROM people WHERE name_ar = 'حسني حمزة عبدالله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسني حمزه عبدالله', false FROM people WHERE name_ar = 'حسني حمزة عبدالله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'وحسني حمزة', false FROM people WHERE name_ar = 'حسني حمزة عبدالله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسين سيد عبد المنعم', true FROM people WHERE name_ar = 'حسين سيد عبد المنعم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حسين محمد حسين عبد العال', true FROM people WHERE name_ar = 'حسين محمد حسين عبد العال';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'حمدي عبد العزيز', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد حمدي', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد حمدي عبد العزيز', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد حمدي عبد العزيز عطية', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد حمدي عبد العزيز عطيه', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد حمدي عطية', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد حمدي عطيه', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد عطية', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد عطيه', true FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد محمود حمدي', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد محمود حمدي عبد العزيز عطية والأساتذة', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد محمود حمدي عطية', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد محمود حمدي عطيه', false FROM people WHERE name_ar = 'خالد عطيه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد كمال', true FROM people WHERE name_ar = 'خالد كمال';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'خالد محمود حمدي عبد العزيز', true FROM people WHERE name_ar = 'خالد محمود حمدي عبد العزيز';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'دينا يحيى قدري', true FROM people WHERE name_ar = 'دينا يحيى قدري';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ذكي محمد النجار', true FROM people WHERE name_ar = 'ذكي محمد النجار';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'رامي أحمد حسن البرعي', false FROM people WHERE name_ar = 'رامي البرعي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'رامي البرعي', true FROM people WHERE name_ar = 'رامي البرعي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'سامي إبراهيم', false FROM people WHERE name_ar = 'سامي إبراهيم خطاب';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'سامي إبراهيم محمد يوسف', false FROM people WHERE name_ar = 'سامي إبراهيم خطاب';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'سامي خطاب', false FROM people WHERE name_ar = 'سامي إبراهيم خطاب';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'سامي خطب', false FROM people WHERE name_ar = 'سامي إبراهيم خطاب';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'سامي ثابت', true FROM people WHERE name_ar = 'سامي ثابت';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'سامي عبد الباقي', true FROM people WHERE name_ar = 'سامي عبد الباقي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'سيد توني عبد الباقي', true FROM people WHERE name_ar = 'سيد توني عبد الباقي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'سيد كيلاني', true FROM people WHERE name_ar = 'سيد كيلاني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'شريف أبو ا لمكارم صالح', false FROM people WHERE name_ar = 'شريف أبو المكارم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'شريف أبو المكارم', true FROM people WHERE name_ar = 'شريف أبو المكارم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'شريف أبو المكارم صالح', false FROM people WHERE name_ar = 'شريف أبو المكارم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'شريف أبو المكارم صالح سليمان', false FROM people WHERE name_ar = 'شريف أبو المكارم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'شريف أبو المكارم صالح والأستاذ', false FROM people WHERE name_ar = 'شريف أبو المكارم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'شريف أبوالمكارم', false FROM people WHERE name_ar = 'شريف أبو المكارم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'وشريف أبو المكارم', false FROM people WHERE name_ar = 'شريف أبو المكارم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'شريف شكري', true FROM people WHERE name_ar = 'شريف شكري';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'شعبان', true FROM people WHERE name_ar = 'شعبان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'شعبان عبد النبي السيد', true FROM people WHERE name_ar = 'شعبان عبد النبي السيد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'طارق بهجت', true FROM people WHERE name_ar = 'طارق بهجت';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'طارق محمد بهجت', true FROM people WHERE name_ar = 'طارق محمد بهجت';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'طارق محمد بهجت قايد', true FROM people WHERE name_ar = 'طارق محمد بهجت قايد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'طه أبو الليل', true FROM people WHERE name_ar = 'طه أبو الليل';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'طه خميس', true FROM people WHERE name_ar = 'طه خميس';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'طه خميس أب', true FROM people WHERE name_ar = 'طه خميس أب';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'طه خميس أبو الليل', true FROM people WHERE name_ar = 'طه خميس أبو الليل';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'طه خميس أبو الليل حسن', true FROM people WHERE name_ar = 'طه خميس أبو الليل حسن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'طه خميس أو الليل حسن', true FROM people WHERE name_ar = 'طه خميس أو الليل حسن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'طه خيس أبو زيد', true FROM people WHERE name_ar = 'طه خيس أبو زيد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عادل عبد الرحمن', true FROM people WHERE name_ar = 'عادل عبد الرحمن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عادل عبد الرحمن عبد الجليل محمد', false FROM people WHERE name_ar = 'عادل عبد الرحمن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عادل عبدالرحمن', false FROM people WHERE name_ar = 'عادل عبد الرحمن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عباس عبد الرحمن محمد', true FROM people WHERE name_ar = 'عباس عبد الرحمن محمد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عبد الرحمن أحمد عبد العزيز', false FROM people WHERE name_ar = 'عبد الرحمن البنا';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عبد الرحمن احمد', false FROM people WHERE name_ar = 'عبد الرحمن البنا';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عبد الرحمن احمد عبد العزيز', false FROM people WHERE name_ar = 'عبد الرحمن البنا';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عبد الرحمن البنا', true FROM people WHERE name_ar = 'عبد الرحمن البنا';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عبد الرؤوف محمد أحمد مهدي', true FROM people WHERE name_ar = 'عبد الرؤوف محمد أحمد مهدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عبد الله الشهبي', false FROM people WHERE name_ar = 'عبد الله الشهابي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عبد الله يحي عبد الله الشهابي', false FROM people WHERE name_ar = 'عبد الله الشهابي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عبد الله حافظ', true FROM people WHERE name_ar = 'عبد الله حافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عبد الله عمرو', false FROM people WHERE name_ar = 'عبد الله حافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عبدالله عمرو', false FROM people WHERE name_ar = 'عبد الله حافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عدلي سعيد', true FROM people WHERE name_ar = 'عدلي سعيد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عصام عبد الغني غباشي', true FROM people WHERE name_ar = 'عصام عبد الغني غباشي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عصام فواز أمين فواز', true FROM people WHERE name_ar = 'عصام فواز أمين فواز';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'علاء كمال حجازي', true FROM people WHERE name_ar = 'علاء كمال حجازي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'علاء محي الدين', true FROM people WHERE name_ar = 'علاء محي الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'على شريف', true FROM people WHERE name_ar = 'على شريف';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'علي سالم', true FROM people WHERE name_ar = 'علي سالم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمر', false FROM people WHERE name_ar = 'عمر عصام';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمر عصام', true FROM people WHERE name_ar = 'عمر عصام';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمر عصام حنفي', false FROM people WHERE name_ar = 'عمر عصام';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمر عصام حنفي محمد', false FROM people WHERE name_ar = 'عمر عصام';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمر أحمدج علي أحمد', true FROM people WHERE name_ar = 'عمر أحمدج علي أحمد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمر شادي', true FROM people WHERE name_ar = 'عمر شادي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمرو حسني', true FROM people WHERE name_ar = 'عمرو حسني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمرو حسني سالم', false FROM people WHERE name_ar = 'عمرو حسني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمرو حسني سالم سيد', false FROM people WHERE name_ar = 'عمرو حسني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمرو حسني سالم سيد أحمد', false FROM people WHERE name_ar = 'عمرو حسني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمرو سليم', true FROM people WHERE name_ar = 'عمرو سليم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمرو محمد', false FROM people WHERE name_ar = 'عمرو سليم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمرو محمد عبد الحميد', false FROM people WHERE name_ar = 'عمرو سليم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمرو محمد عبد الحميد عبده سليم', false FROM people WHERE name_ar = 'عمرو سليم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمرو صقر', true FROM people WHERE name_ar = 'عمرو صقر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'عمرو محمد أحمد إسماعيل', true FROM people WHERE name_ar = 'عمرو محمد أحمد إسماعيل';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'غبريال قسطور غبريال قسطور', true FROM people WHERE name_ar = 'غبريال قسطور غبريال قسطور';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'كريم أيمن', true FROM people WHERE name_ar = 'كريم أيمن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'كريم أيمن محمد', false FROM people WHERE name_ar = 'كريم أيمن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'كريم ايمن محمد', false FROM people WHERE name_ar = 'كريم أيمن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ليلى أمين طموم', false FROM people WHERE name_ar = 'ليلى طموم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ليلى طموم', true FROM people WHERE name_ar = 'ليلى طموم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ليلى حسني', true FROM people WHERE name_ar = 'ليلى حسني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ليلى يحي حسني', false FROM people WHERE name_ar = 'ليلى حسني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ليلى يحيى حسني', false FROM people WHERE name_ar = 'ليلى حسني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ليلي يحي حسني', false FROM people WHERE name_ar = 'ليلى حسني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ليلي يحيى حسن', false FROM people WHERE name_ar = 'ليلى حسني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ليلي يحيى حسني', false FROM people WHERE name_ar = 'ليلى حسني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ليلي يحيي حسني', false FROM people WHERE name_ar = 'ليلى حسني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'لينه قناوي', true FROM people WHERE name_ar = 'لينه قناوي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ماجد فرج ميخائيل سمان', true FROM people WHERE name_ar = 'ماجد فرج ميخائيل سمان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محسن محمد محمد زكي', true FROM people WHERE name_ar = 'محسن محمد محمد زكي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد الغرابلي', true FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد الغرابي', false FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد الغربالي', false FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد الغربلي', false FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد مجدي', false FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد مجدي الغرابلي', false FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد مجدي الغربلي', false FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد مجدي سيد أحمد', false FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد مجدي سيد أحمد الغرابلي', false FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد مجدي سيد أحمد رمضان', false FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد مجدي سيد احمد الغرابلي', false FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ومحمد مجدي أحمد الغرابلي', false FROM people WHERE name_ar = 'محمد الغرابلي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد أبو النج', false FROM people WHERE name_ar = 'محمد أبو النجا';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد أبو النجا', true FROM people WHERE name_ar = 'محمد أبو النجا';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عصام', false FROM people WHERE name_ar = 'محمد أبو النجا';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد بهاء الدين أبو شقة', true FROM people WHERE name_ar = 'محمد بهاء الدين أبو شقة';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد بهاء الدين أبو شقه', false FROM people WHERE name_ar = 'محمد بهاء الدين أبو شقة';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد جوهر أحمد زغلول', true FROM people WHERE name_ar = 'محمد جوهر أحمد زغلول';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد حسن علي عبد المولى', true FROM people WHERE name_ar = 'محمد حسن علي عبد المولى';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد حمدي', true FROM people WHERE name_ar = 'محمد حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد حمدي كامب', false FROM people WHERE name_ar = 'محمد حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد حمدي كامل', false FROM people WHERE name_ar = 'محمد حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد حمدي كامل مصطفى', false FROM people WHERE name_ar = 'محمد حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمدي', false FROM people WHERE name_ar = 'محمد حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ومحمد حمدي', false FROM people WHERE name_ar = 'محمد حمدي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد سعد مصطفى', true FROM people WHERE name_ar = 'محمد سعد مصطفى';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد سيد مصطفى الجمال', true FROM people WHERE name_ar = 'محمد سيد مصطفى الجمال';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد شديد لبيب الحناوي', true FROM people WHERE name_ar = 'محمد شديد لبيب الحناوي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد طارق', true FROM people WHERE name_ar = 'محمد طارق';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عبد الحافظ عبد العزيز', false FROM people WHERE name_ar = 'محمد عبد العزيز عبد الحافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عبد العزيز', false FROM people WHERE name_ar = 'محمد عبد العزيز عبد الحافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عبد العزيز (تليفونياً)', false FROM people WHERE name_ar = 'محمد عبد العزيز عبد الحافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عبد العزيز عبد الحافظ', true FROM people WHERE name_ar = 'محمد عبد العزيز عبد الحافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عبد العزيز عبد الحافظ محمد', false FROM people WHERE name_ar = 'محمد عبد العزيز عبد الحافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عبد الهزيز عبد الحافظ', false FROM people WHERE name_ar = 'محمد عبد العزيز عبد الحافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عبدالعزيز', false FROM people WHERE name_ar = 'محمد عبد العزيز عبد الحافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عبدالعزيز عبدالحافظ', false FROM people WHERE name_ar = 'محمد عبد العزيز عبد الحافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عدبد العزيز', false FROM people WHERE name_ar = 'محمد عبد العزيز عبد الحافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمدعبد العزيز', false FROM people WHERE name_ar = 'محمد عبد العزيز عبد الحافظ';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عبد الرحيم حسن', true FROM people WHERE name_ar = 'محمد عبد الرحيم حسن';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد عبد اللطيف محموده', true FROM people WHERE name_ar = 'محمد عبد اللطيف محموده';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد محمد عيد السيد محمد', true FROM people WHERE name_ar = 'محمد محمد عيد السيد محمد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد مدبولي', true FROM people WHERE name_ar = 'محمد مدبولي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد مدبولي رمضان', true FROM people WHERE name_ar = 'محمد مدبولي رمضان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد مصطفى محمد علي ناصر', true FROM people WHERE name_ar = 'محمد مصطفى محمد علي ناصر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد والي', true FROM people WHERE name_ar = 'محمد والي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد والي عبد الهادي', false FROM people WHERE name_ar = 'محمد والي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمد والي عبد الهادي محمد', false FROM people WHERE name_ar = 'محمد والي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمود الغرباوي', true FROM people WHERE name_ar = 'محمود الغرباوي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمود جمال', true FROM people WHERE name_ar = 'محمود جمال';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمود جمال محمود عبد العزيز', true FROM people WHERE name_ar = 'محمود جمال محمود عبد العزيز';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمود علي', true FROM people WHERE name_ar = 'محمود علي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمود علي محمود حسين', false FROM people WHERE name_ar = 'محمود علي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمودعلي', false FROM people WHERE name_ar = 'محمود علي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمود مصطفى عوض', true FROM people WHERE name_ar = 'محمود مصطفى عوض';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمود مصطفى عوض أحمد', true FROM people WHERE name_ar = 'محمود مصطفى عوض أحمد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'محمود مصطفى معوض', true FROM people WHERE name_ar = 'محمود مصطفى معوض';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'مريهان خالد', true FROM people WHERE name_ar = 'مريهان خالد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'مصطفى', false FROM people WHERE name_ar = 'مصطفى نصار';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'مصطفى خالد محمد خير الدين نصار', false FROM people WHERE name_ar = 'مصطفى نصار';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'مصطفى محمود عبدالمنعم', false FROM people WHERE name_ar = 'مصطفى نصار';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'مصطفى نصار', true FROM people WHERE name_ar = 'مصطفى نصار';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'معتز الدريني', true FROM people WHERE name_ar = 'معتز الدريني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'معتز عبد العزيز الدريني', false FROM people WHERE name_ar = 'معتز الدريني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'معتز عبد العزيز الدريني والأستاذ', false FROM people WHERE name_ar = 'معتز الدريني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ومعتز الدريني', false FROM people WHERE name_ar = 'معتز الدريني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'مكتب سري الدين وشركاه', true FROM people WHERE name_ar = 'مكتب سري الدين وشركاه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منتصر المصري', true FROM people WHERE name_ar = 'منتصر المصري';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'منى لطفي زكي وهبه', true FROM people WHERE name_ar = 'منى لطفي زكي وهبه';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'مؤمن سليم', true FROM people WHERE name_ar = 'مؤمن سليم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'مؤمن عبد الله محمد أحمد سليم', false FROM people WHERE name_ar = 'مؤمن سليم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'مينا حنا شاكر', true FROM people WHERE name_ar = 'مينا حنا شاكر';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'مينا مجدي عبده إبراهيم', true FROM people WHERE name_ar = 'مينا مجدي عبده إبراهيم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ناجي السيد أبو العزم', true FROM people WHERE name_ar = 'ناجي السيد أبو العزم';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ناجي رمضان', true FROM people WHERE name_ar = 'ناجي رمضان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ناجي رمضان أمين', false FROM people WHERE name_ar = 'ناجي رمضان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ناجي رمضان أمين محمد', false FROM people WHERE name_ar = 'ناجي رمضان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ناجي رمضان امين', false FROM people WHERE name_ar = 'ناجي رمضان';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'نبيل فرحات', false FROM people WHERE name_ar = 'احمد فرحات';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ندى محمد احمد على', true FROM people WHERE name_ar = 'ندى محمد احمد على';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'نيرمين حجازي', true FROM people WHERE name_ar = 'نيرمين حجازي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'نيرمين عبد العال', true FROM people WHERE name_ar = 'نيرمين عبد العال';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'نيرمين هاني', true FROM people WHERE name_ar = 'نيرمين هاني';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني أحمد الدالي', false FROM people WHERE name_ar = 'هاني الدالي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني أحمد عبد المجيد الدالي', false FROM people WHERE name_ar = 'هاني الدالي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني احمد عبد المجيد', false FROM people WHERE name_ar = 'هاني الدالي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني الدالي', true FROM people WHERE name_ar = 'هاني الدالي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني الدالي (صباحي)', false FROM people WHERE name_ar = 'هاني الدالي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني الدالي (مسائي)', false FROM people WHERE name_ar = 'هاني الدالي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني الدالي متابعة للشطب', false FROM people WHERE name_ar = 'هاني الدالي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني عبد المجيد الدالي', false FROM people WHERE name_ar = 'هاني الدالي';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني سري الدين', true FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني سري الدين والأساتذة', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني سري الدينِ', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني سريّ الدين', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني صلاح الدين', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني صلاح سري الدين', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني صلاح سري الدين والأستاذ', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني صلاح سري الدين ود', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني صلاح محمد سؤي الدين', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني صلاح محمد سري الدن', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني صلاح محمد سري الدين', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني صلاح محمد سيف الدين', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني صلح الدين', false FROM people WHERE name_ar = 'هاني سري الدين';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هاني عبدالحميد أبو سمرة', true FROM people WHERE name_ar = 'هاني عبدالحميد أبو سمرة';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'هانيا أبو العيون', true FROM people WHERE name_ar = 'هانيا أبو العيون';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'وأحمد عبد الله محمد', false FROM people WHERE name_ar = 'احمد عبدالله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'والأساتذه أحمد عبد الله محمد علي', false FROM people WHERE name_ar = 'احمد عبدالله';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'وأحمد سعيد أحمد', false FROM people WHERE name_ar = 'أحمد سعيد';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ود. خالد محمود حمدي عبد العزيز عطية', false FROM people WHERE name_ar = 'خالد عطية';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'وسام صالح', true FROM people WHERE name_ar = 'وسام صالح';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'ىأحمد إسماعيل', false FROM people WHERE name_ar = 'أحمد إسماعيل';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'يحيى علي قدري', true FROM people WHERE name_ar = 'يحيى علي قدري';
INSERT INTO person_name_alias (person_id, alias_ar, is_primary) SELECT id, 'يسري سعدي لبيب أحمد', true FROM people WHERE name_ar = 'يسري سعدي لبيب أحمد';


-- ============================================================================
--  MULTI-PERSON SPLIT RULES  (33 strings, 77 occurrences)
--
--  These raw values each name several people with no reliable separator.
--  The firm identified who is in each one. During migration, a field matching
--  the raw string produces ONE ROW PER PERSON in the junction table
--  (hearing_attendees / matter_lawyers) instead of a single bogus person.
-- ============================================================================

CREATE TABLE migration_multi_person_rule (
    id          serial PRIMARY KEY,
    raw_value   text    NOT NULL UNIQUE,
    occurrences integer,
    reviewer_note text
);

CREATE TABLE migration_multi_person_member (
    rule_id     integer NOT NULL REFERENCES migration_multi_person_rule (id) ON DELETE CASCADE,
    person_name text    NOT NULL,
    ordinal     smallint NOT NULL,
    PRIMARY KEY (rule_id, person_name)
);

INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين والدكتور', 10, '2 lawyers (هاني سري الدين) and (احمد عبدالله)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'هاني سري الدين', 1 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والدكتور';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'احمد عبدالله', 2 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والدكتور';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي', 8, 'Multiple Lawyers (خالد عطيه/أحمد عبد الله/محمد عبد العزيز عبد الحافظ/شريف أبو المكارم/أحمد سعيد/محمد الغرابلي');
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد حمدي والأساتذه أحمد عبد الله', 7, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'خالد عطيه', 1 FROM migration_multi_person_rule WHERE raw_value = 'خالد حمدي والأساتذه أحمد عبد الله';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'أحمد عبد الله', 2 FROM migration_multi_person_rule WHERE raw_value = 'خالد حمدي والأساتذه أحمد عبد الله';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد محمود حمدي والأساتذه أحمد عبد الله محمد علي', 5, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'خالد عطيه', 1 FROM migration_multi_person_rule WHERE raw_value = 'خالد محمود حمدي والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'أحمد عبد الله', 2 FROM migration_multi_person_rule WHERE raw_value = 'خالد محمود حمدي والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمد الغرابلي إيهاب حمدي', 5, '2 lawyers (محمد الغرابلي) and (إيهاب حمدي)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد الغرابلي', 1 FROM migration_multi_person_rule WHERE raw_value = 'محمد الغرابلي إيهاب حمدي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'إيهاب حمدي', 2 FROM migration_multi_person_rule WHERE raw_value = 'محمد الغرابلي إيهاب حمدي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني الدالي عمرو سليم', 5, '2 lawyers (هاني الدالي) and (عمرو سليم)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'هاني الدالي', 1 FROM migration_multi_person_rule WHERE raw_value = 'هاني الدالي عمرو سليم';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'عمرو سليم', 2 FROM migration_multi_person_rule WHERE raw_value = 'هاني الدالي عمرو سليم';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('ناجي رمضان محمد عبد العزيز', 4, '2 lawyers (ناجي رمضان) and (محمد عبدالعزيز عبد الحافظ)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'ناجي رمضان', 1 FROM migration_multi_person_rule WHERE raw_value = 'ناجي رمضان محمد عبد العزيز';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد عبدالعزيز عبد الحافظ', 2 FROM migration_multi_person_rule WHERE raw_value = 'ناجي رمضان محمد عبد العزيز';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('إيهاب حمدي عبد الرحمن البنا', 2, '2 lawyers (إيهاب حمدي) and (عبد الرحمن البنا)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'إيهاب حمدي', 1 FROM migration_multi_person_rule WHERE raw_value = 'إيهاب حمدي عبد الرحمن البنا';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'عبد الرحمن البنا', 2 FROM migration_multi_person_rule WHERE raw_value = 'إيهاب حمدي عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('إيهاب حمدي محمد عبد العزيز', 2, '2 lawyers (إيهاب حمدي) and (محمد عبد العزيز عبد الحافظ)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'إيهاب حمدي', 1 FROM migration_multi_person_rule WHERE raw_value = 'إيهاب حمدي محمد عبد العزيز';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد عبد العزيز عبد الحافظ', 2 FROM migration_multi_person_rule WHERE raw_value = 'إيهاب حمدي محمد عبد العزيز';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد حمدي والأساتذه أحمد عبد الله محمد علي', 2, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'خالد عطيه', 1 FROM migration_multi_person_rule WHERE raw_value = 'خالد حمدي والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'أحمد عبد الله', 2 FROM migration_multi_person_rule WHERE raw_value = 'خالد حمدي والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي', 2, 'Multiple Lawyers (خالد عطيه/أحمد عبد الله/محمد عبد العزيز عبد الحافظ/أحمد سعيد/محمد الغرابلي');
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمد عبد العزيز شريف أبو المكارم', 2, '2 lawyers (محمد عبد العزيز عبد الحافظ) and (شريف أبو المكارم)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد عبد العزيز عبد الحافظ', 1 FROM migration_multi_person_rule WHERE raw_value = 'محمد عبد العزيز شريف أبو المكارم';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'شريف أبو المكارم', 2 FROM migration_multi_person_rule WHERE raw_value = 'محمد عبد العزيز شريف أبو المكارم';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمود شعبان محمود حسن', 2, '2 lawyers (محمود شعبان) and (محمود علي)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمود شعبان', 1 FROM migration_multi_person_rule WHERE raw_value = 'محمود شعبان محمود حسن';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمود علي', 2 FROM migration_multi_person_rule WHERE raw_value = 'محمود شعبان محمود حسن';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('ناجي رمضان محمد عبد العزيز إيهاب حمدي', 2, '3 lawyers (ناجي رمضان) and (محمد عبدالعزيز عبد الحافظ) and (إيهاب حمدي)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'ناجي رمضان', 1 FROM migration_multi_person_rule WHERE raw_value = 'ناجي رمضان محمد عبد العزيز إيهاب حمدي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد عبدالعزيز عبد الحافظ', 2 FROM migration_multi_person_rule WHERE raw_value = 'ناجي رمضان محمد عبد العزيز إيهاب حمدي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'إيهاب حمدي', 3 FROM migration_multi_person_rule WHERE raw_value = 'ناجي رمضان محمد عبد العزيز إيهاب حمدي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('أحمد عبد الله محمد. أحمد سعيد أحمد', 1, '2 lawyers (أحمد عبد الله) and (أحمد سعيد)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'أحمد عبد الله', 1 FROM migration_multi_person_rule WHERE raw_value = 'أحمد عبد الله محمد. أحمد سعيد أحمد';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'أحمد سعيد', 2 FROM migration_multi_person_rule WHERE raw_value = 'أحمد عبد الله محمد. أحمد سعيد أحمد';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('أحمد عبد الله محمدحسام الدين عمر', 1, '2 lawyers (أحمد عبد الله) and (حسام الدين عمر)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'أحمد عبد الله', 1 FROM migration_multi_person_rule WHERE raw_value = 'أحمد عبد الله محمدحسام الدين عمر';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'حسام الدين عمر', 2 FROM migration_multi_person_rule WHERE raw_value = 'أحمد عبد الله محمدحسام الدين عمر';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('حسام الدين عمر إبراهيم وحسام الدين فداء محمد ومحمد حمدي كالم', 1, '2 lawyers (حسام الدين عمر) and (حسام الدين فداء)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'حسام الدين عمر', 1 FROM migration_multi_person_rule WHERE raw_value = 'حسام الدين عمر إبراهيم وحسام الدين فداء محمد ومحمد حمدي كالم';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'حسام الدين فداء', 2 FROM migration_multi_person_rule WHERE raw_value = 'حسام الدين عمر إبراهيم وحسام الدين فداء محمد ومحمد حمدي كالم';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد حمدي عطيه أحمد سعيد أحمد', 1, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'خالد عطيه', 1 FROM migration_multi_person_rule WHERE raw_value = 'خالد حمدي عطيه أحمد سعيد أحمد';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'أحمد عبد الله', 2 FROM migration_multi_person_rule WHERE raw_value = 'خالد حمدي عطيه أحمد سعيد أحمد';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد', 1, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'خالد عطيه', 1 FROM migration_multi_person_rule WHERE raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'أحمد عبد الله', 2 FROM migration_multi_person_rule WHERE raw_value = 'خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('خالد محمود حمدي والأساتذه أحمد عبد الله', 1, '2 lawyers (خالد عطيه) and (أحمد عبد الله)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'خالد عطيه', 1 FROM migration_multi_person_rule WHERE raw_value = 'خالد محمود حمدي والأساتذه أحمد عبد الله';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'أحمد عبد الله', 2 FROM migration_multi_person_rule WHERE raw_value = 'خالد محمود حمدي والأساتذه أحمد عبد الله';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('شريف أبو المكارم ومحمد حمدي كامل', 1, '2 lawyers (شريف أبو المكارم) and (محمد حمدي)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'شريف أبو المكارم', 1 FROM migration_multi_person_rule WHERE raw_value = 'شريف أبو المكارم ومحمد حمدي كامل';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد حمدي', 2 FROM migration_multi_person_rule WHERE raw_value = 'شريف أبو المكارم ومحمد حمدي كامل';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمد حمدي إيهاب حمدي', 1, '2 lawyers (محمد حمدي) and (إيهاب حمدي)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد حمدي', 1 FROM migration_multi_person_rule WHERE raw_value = 'محمد حمدي إيهاب حمدي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'إيهاب حمدي', 2 FROM migration_multi_person_rule WHERE raw_value = 'محمد حمدي إيهاب حمدي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمد حمدي محمود شعبان', 1, '2 lawyers (محمد حمدي) and (محمود شعبان)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد حمدي', 1 FROM migration_multi_person_rule WHERE raw_value = 'محمد حمدي محمود شعبان';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمود شعبان', 2 FROM migration_multi_person_rule WHERE raw_value = 'محمد حمدي محمود شعبان';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمد عبد العزيز وأ. إيهاب حمدي', 1, '2 lawyers (محمد عبد العزيز عبد الحافظ) and (إيهاب حمدي)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد عبد العزيز عبد الحافظ', 1 FROM migration_multi_person_rule WHERE raw_value = 'محمد عبد العزيز وأ. إيهاب حمدي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'إيهاب حمدي', 2 FROM migration_multi_person_rule WHERE raw_value = 'محمد عبد العزيز وأ. إيهاب حمدي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('محمود شعبان عبد الرحمن البنا', 1, '2 lawyers (محمود شعبان) and (عبدالرحمن البنا)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمود شعبان', 1 FROM migration_multi_person_rule WHERE raw_value = 'محمود شعبان عبد الرحمن البنا';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'عبدالرحمن البنا', 2 FROM migration_multi_person_rule WHERE raw_value = 'محمود شعبان عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني الدالي منة الله البلتاجي', 1, '2 lawyers (هاني الدالي) and (منة الله البلتاجي)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'هاني الدالي', 1 FROM migration_multi_person_rule WHERE raw_value = 'هاني الدالي منة الله البلتاجي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'منة الله البلتاجي', 2 FROM migration_multi_person_rule WHERE raw_value = 'هاني الدالي منة الله البلتاجي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا', 1, 'Multiple Lawyers (هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز عبدالحافظ - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز عبدالحافظ - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا', 1 FROM migration_multi_person_rule WHERE raw_value = 'هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين والأساتذه أحمد عبد الله محمد علي', 1, '2 lawyers (هاني سري الدين) and (احمد عبدالله)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'هاني سري الدين', 1 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'احمد عبدالله', 2 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والأساتذه أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم', 1, '2 lawyers (هاني سري الدين) and (حسام الدين عمر)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'هاني سري الدين', 1 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'حسام الدين عمر', 2 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم أحمد عبد الله محمد علي', 1, '3 lawyers (هاني سري الدين) and (حسام الدين عمر) and (احمد عبدالله)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'هاني سري الدين', 1 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'حسام الدين عمر', 2 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'احمد عبدالله', 3 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والأساتذه حسام الدين عمر إبراهيم أحمد عبد الله محمد علي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين والأستاذ أحمد عبد الله والأستاذ محمد مجدي سيد أحمد', 1, '3 lawyers (هاني سري الدين) and (احمد عبدالله) and (محمد الغرابلي)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'هاني سري الدين', 1 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والأستاذ أحمد عبد الله والأستاذ محمد مجدي سيد أحمد';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'احمد عبدالله', 2 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والأستاذ أحمد عبد الله والأستاذ محمد مجدي سيد أحمد';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد الغرابلي', 3 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين والأستاذ أحمد عبد الله والأستاذ محمد مجدي سيد أحمد';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('هاني صلاح سري الدين ود. رامي أحمد حسن البرعي', 1, '2 lawyers (هاني سري الدين) and (رامي البرعي)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'هاني سري الدين', 1 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين ود. رامي أحمد حسن البرعي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'رامي البرعي', 2 FROM migration_multi_person_rule WHERE raw_value = 'هاني صلاح سري الدين ود. رامي أحمد حسن البرعي';
INSERT INTO migration_multi_person_rule (raw_value, occurrences, reviewer_note) VALUES ('ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي', 1, 'Multiple Lawyers (محمد عبد العزيز عبد الحافظ/شريف أبو المكارم/أحمد سعيد/محمد الغرابلي)');
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد عبد العزيز عبد الحافظ', 1 FROM migration_multi_person_rule WHERE raw_value = 'ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'شريف أبو المكارم', 2 FROM migration_multi_person_rule WHERE raw_value = 'ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'أحمد سعيد', 3 FROM migration_multi_person_rule WHERE raw_value = 'ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';
INSERT INTO migration_multi_person_member (rule_id, person_name, ordinal) SELECT id, 'محمد الغرابلي', 4 FROM migration_multi_person_rule WHERE raw_value = 'ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي';


-- ============================================================================
--  EXCLUDED VALUES  (35)
--  Recorded so the decision is auditable, not silently dropped.
-- ============================================================================
CREATE TABLE migration_excluded_name (
    raw_value   text PRIMARY KEY,
    occurrences integer,
    reason      text
);

INSERT INTO migration_excluded_name VALUES ('قسم التحكيم', 67, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('الدكتور', 39, 'bare honorific, not a name');
INSERT INTO migration_excluded_name VALUES ('دكتور', 14, 'bare honorific, not a name');
INSERT INTO migration_excluded_name VALUES ('أستاذ', 12, 'bare honorific, not a name');
INSERT INTO migration_excluded_name VALUES ('لايوجد حضور', 6, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('آخر موعد للتجديد من الشطب', 4, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('الاستعلام عن ورود التقرير قبل الجلسة', 3, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('الشركة المصرية للاتصالات', 3, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('إجازة العيد', 3, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('ستؤجل إدارياً', 3, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('كتور', 3, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('(متابعة بدون حضور)', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('** متابعة ورود التقرير قبل الجلسة', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('** متابعة ورود التقريرقبل ميعاد الجلسة', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('إجازة رسمي', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('تأجيل إداري', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('متابعة **', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('متابعة فقط', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('متداولة', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('والأستاذ', 2, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('(متابعة لورود التقرير في 31', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('**متابعة', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('*متابعة*', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('الأستاذ', 1, 'bare honorific, not a name');
INSERT INTO migration_excluded_name VALUES ('العميل', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('أجازة - مطلوب معرفة القرار غدا أو يوم الأحد على الأكثر', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('لن تباشر من جانب العميل **', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('لن يباشرها المكتب بناء على طلب العميل', 1, 'note typed into a name field, confirmed by the firm');
INSERT INTO migration_excluded_name VALUES ('متابعة سداد الأمانة **', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('متابعة فقط بعد الجلسة (هاني الدالي) **', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('متابعة موعد الجلسة القادمة (تأجيل إداري) من هاني الدالي **', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('مستشارون قانونيون', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('والأستاذة', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('وأ.د', 1, 'reviewer marked NO — not a person');
INSERT INTO migration_excluded_name VALUES ('يتم تركها للشطب', 1, 'reviewer marked NO — not a person');

-- Placeholders confirmed by the firm as "no attendance recorded", not people:
INSERT INTO migration_excluded_name VALUES ('**',           4143, 'placeholder - no attendance recorded');
INSERT INTO migration_excluded_name VALUES ('لا يوجد حضور',   21, 'no attendance');
INSERT INTO migration_excluded_name VALUES ('متابعة',         10, 'status value, not a person');


-- ============================================================================
--  VALIDATION
-- ============================================================================

-- Every alias must map to exactly one person.
SELECT alias_ar, count(*) FROM person_name_alias GROUP BY alias_ar HAVING count(*) > 1;

-- Expected roster size.
SELECT is_staff, is_active, count(*) FROM people GROUP BY 1, 2 ORDER BY 1, 2;

-- Any raw name in staging with no alias and no exclusion = FAILURE.
-- (run after staging load)
