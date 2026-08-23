-- ============================================================================
--  lookup_court — seed and crosswalk
--
--  Source: Court-List-Review.xlsx, every one of the 401 distinct court names
--  found in الدعاوى.matterCourt, الجلسات.المحكمة and admin work table.المحكمة,
--  reviewed by the firm.
--
--  Review outcome:
--      KEEP    307   a real, distinct court
--      MERGE    52   a spelling variant of another court
--      SPLIT    35   court name with something else attached
--      WRONG     7   not a court at all
--             ----
--             401
--
--  Final court list: 309 entries.
--
--  WHY THIS COULD NOT BE AUTOMATED
--  -------------------------------
--  Ten spellings of the Investment Authority collapse into one:
--      الهيئة العامة للاستثمار / هيئة الاستثمار /
--      الهيئة العامة للأستثمار في صلاح سالم / هيئة الأستثمار بمدينة نصر / ...
--  These differ by the definite article, by hamza, and by branch location.
--  No normaliser finds them. Only somebody who knows the institution can say
--  they are one body.
--
--  Equally, the firm kept apart values a fuzzy match would have merged:
--      القضاء الإداري  /  القضاء الإداري بالعباسية  /  القضاء الإداري بالإسكندرية
--  Same court name, different buildings in different cities.
-- ============================================================================


CREATE TABLE lookup_court (
    id          serial      PRIMARY KEY,
    label_ar    text        NOT NULL UNIQUE,
    label_en    text,
    sort_order  integer     NOT NULL DEFAULT 1000,
    is_active   boolean     NOT NULL DEFAULT true
);

COMMENT ON TABLE lookup_court IS
    'Courts. Administrator-editable per D8 and docs/PERMISSIONS.md. Seeded from '
    'the firm-reviewed list of 401 raw Access values.';


-- ---- the court list ---------------------------------------------------------
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القاهرة الاقتصادية', 10);   -- 2523 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('شمال القاهرة', 20);   -- 1447 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('شبين الكوم', 30);   -- 1333 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('النقض', 40);   -- 970 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القضاء الإداري', 50);   -- 931 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنوب الجيزة', 60);   -- 743 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف القاهرة', 70);   -- 705 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القاهرة الجديدة', 80);   -- 614 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنوب القاهرة', 90);   -- 566 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الإدارية العليا', 100);   -- 508 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف شمال القاهرة', 110);   -- 503 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الإسكندرية الاقتصادية', 120);   -- 405 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('6 أكتوبر -جنوب الجيزة الكلية', 130);   -- 398 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القضاء الإداري بالعباسية', 140);   -- 360 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء القاهرة الاقتصادية', 150);   -- 296 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('شمال الجيزة', 160);   -- 260 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف شبين الكوم', 170);   -- 224 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الهيئة العامة للاستثمار والمناطق الحرة', 180);   -- 223 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء شرق القاهرة', 190);   -- 218 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء شبين الكوم', 200);   -- 198 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الإسكندرية', 210);   -- 173 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('6 أكتوبر', 220);   -- 162 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الجيزة الابتدائية', 230);   -- 159 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء شمال الجيزة', 240);   -- 150 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مجلس الدولة بالرحاب', 250);   -- 147 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القضاء الإداري بالإسكندرية', 260);   -- 146 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء شمال القاهرة', 270);   -- 123 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف شمال الجيزة', 280);   -- 119 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف 6 أكتوبر', 290);   -- 117 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء جنوب القاهرة', 300);   -- 107 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء جنوب الجيزة', 310);   -- 104 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة الشئون المالية والتجارية', 320);   -- 83 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('حلوان', 330);   -- 77 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف عالي شبين الكوم', 340);   -- 66 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('تاج الدول', 350);   -- 64 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القاهرة للأمور المستعجلة', 360);   -- 62 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف عالي القاهرة', 370);   -- 50 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('النزهة الجزئية', 380);   -- 50 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الدقي', 390);   -- 48 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنوب الجيزة الابتدائية', 400);   -- 48 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء الكسب غير المشروع', 410);   -- 47 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('إدارية عليا', 420);   -- 46 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف الجيزة', 430);   -- 44 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('العجوزة الجزئية', 440);   -- 40 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('بنها', 450);   -- 39 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء وسط القاهرة', 460);   -- 36 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('عابدين', 470);   -- 36 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الإسكندرية الابتدائية', 480);   -- 35 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('البساتين (المعادي)', 490);   -- 34 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('إمبابة الجزئية', 500);   -- 34 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القضاء الأداري - مجلس الدولة', 510);   -- 33 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنوب القاهرة الأبتدائية', 520);   -- 33 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء الإسكندرية الاقتصادية', 530);   -- 33 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('المعادي', 540);   -- 30 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('المنصورة', 550);   -- 30 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء وسط الإسكندرية', 560);   -- 29 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف الإسكندرية (أبيس)', 570);   -- 28 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الهيئة العامة للرقابة المالية', 580);   -- 28 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف عالي شمال القاهرة', 590);   -- 26 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('العجوزة', 600);   -- 26 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مجلس الدولة', 610);   -- 26 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مجلس الدولة بالجيزة', 620);   -- 24 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء وزارة العدل', 630);   -- 23 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف الإسكندرية', 640);   -- 22 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف شمال الجيزة (السودان)', 650);   -- 22 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء شمال الدقهلية', 660);   -- 22 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة القاهرة الجديدة', 670);   -- 22 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الهيئة العامة للأستثمار- المنطقة الحرة', 680);   -- 21 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('شمال أسيوط', 690);   -- 21 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف القاهرة مأمورية شمال الجيزة', 700);   -- 20 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('العبور', 710);   -- 20 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة الأموال العامة', 720);   -- 20 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة شمال الجيزة', 730);   -- 20 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القاهرة الجديدة الأبتدائية', 740);   -- 18 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الأسرة', 750);   -- 17 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('العبور الجزئية', 760);   -- 17 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء مجلس الدولة', 770);   -- 17 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('رشيد الكلية', 780);   -- 17 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف التجمع', 790);   -- 16 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القضاء الإداري بالإسماعيلية', 800);   -- 16 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('حلوان الأبتدائية', 810);   -- 16 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مصلحة الضرائب', 820);   -- 16 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب خبراء شبرا الخيمة', 830);   -- 16 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('هيئة مفوضي الدولة', 840);   -- 16 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('شمال الجيزة - تنعقد في جنوب الجيزة', 850);   -- 15 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('غرب طنطا', 860);   -- 15 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مركز التسوية و التحكيم الرياضي المصري', 870);   -- 15 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة 6 أكتوبر', 880);   -- 15 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف الخانكة', 890);   -- 14 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القاهرة لاقتصادية', 900);   -- 14 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('اللجنة الأوليمبية المصرية', 910);   -- 14 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('لجنة التفتيش - الهيئة العامة للاستثمار', 920);   -- 14 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مدينة نصر', 930);   -- 14 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('العبور (الخانكة)', 940);   -- 13 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء ولي العهد', 950);   -- 13 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('طنطا الاقتصادية', 960);   -- 12 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('قصر النيل الجزئية', 970);   -- 12 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الشيخ زايد', 980);   -- 11 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الطب الشرعي', 990);   -- 11 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('أسيوط الاقتصادية', 1000);   -- 11 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('شمال الجيزة (السودان)', 1010);   -- 11 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب خبراء شرق القاهرة -  العباسية', 1020);   -- 11 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب خبراء وسط القاهرة', 1030);   -- 11 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف القاهرة (دار القضاء العالي)', 1040);   -- 10 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف بنها', 1050);   -- 10 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الهرم الجزئية', 1060);   -- 10 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنايات القاهرة', 1070);   -- 10 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('دار القضاء العالي', 1080);   -- 10 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('قويسنا', 1090);   -- 10 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنح منفلوط', 1100);   -- 9 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء طنطا الاقتصادية', 1110);   -- 9 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('قضاء إداري الأسكندرية', 1120);   -- 9 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مصلحة الطب الشرعي', 1130);   -- 9 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب النائب العام بالرحاب', 1140);   -- 9 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة الأموال العامة العليا', 1150);   -- 9 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('هيئة الرقابة المالية', 1160);   -- 9 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('هيئة المفوضين', 1170);   -- 9 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف القاهرة مأمورية شمال القاهرة', 1180);   -- 8 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('السادات', 1190);   -- 8 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('العجوزة-تاج الدول', 1200);   -- 8 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء مجلس الدولة بالرحاب', 1210);   -- 8 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مجلس الدولة بالعباسية', 1220);   -- 8 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مصر الجديدة', 1230);   -- 8 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مفوضي القضاء الإداري', 1240);   -- 8 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب خبراء شمال الجيزة', 1250);   -- 8 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة التهرب الضريبي', 1260);   -- 8 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة الهرم', 1270);   -- 8 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف دار القضاء', 1280);   -- 7 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الجيزة', 1290);   -- 7 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الخانكة', 1300);   -- 7 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('السويس', 1310);   -- 7 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('المحكمة الاقتصادية', 1320);   -- 7 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('المحكمة الدستورية', 1330);   -- 7 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الهيئة العامة للاستثمار (لجان التظلمات)', 1340);   -- 7 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مأمورية استئناف الجيزة', 1350);   -- 7 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مصلحة الخبراء بمجمع المصالح - الدور الثامن - شمال أسيوط', 1360);   -- 7 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب خبراء جنوب القاهرة', 1370);   -- 7 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف القاهرة مأمورية استئناف الجيزة', 1380);   -- 6 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الجيزة الابتدائية (تاج الدول)', 1390);   -- 6 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الدقي (تاج الدول)', 1400);   -- 6 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('قسم أول المنصورة', 1410);   -- 6 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('قصر النيل - عابدين', 1420);   -- 6 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('كفر شكر الجزئية', 1430);   -- 6 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مجلس الدولة بالدقي', 1440);   -- 6 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف 6 أكتوبر (شمال الجيزة)', 1450);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف الزقازيق', 1460);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('اسئناف شمال الجيزة', 1470);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('التجمع الخامس', 1480);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الفيوم', 1490);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('المحكمة الإدارية لرئاسة الجمهورية', 1500);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('أسيوط', 1510);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('أول 6 أكتوبر', 1520);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنوب الجيزة (إمبابة)', 1530);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء الاستثمار', 1540);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء كسب غير مشروع', 1550);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('شرم الشيخ', 1560);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('لجنة تظلمات', 1570);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('محكمة مجلس الدولة بالدقي - القضاء الأداري', 1580);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب الخبراء المقيمين بمجلس الدولة', 1590);   -- 5 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف الأسماعيلية', 1600);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف عالي طنطا', 1610);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الجيزة الكلية', 1620);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الدقي الجزئية', 1630);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الطور - مأمورية استئناف الإسماعيلية', 1640);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('باب الشعرية', 1650);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('بلبيس', 1660);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جمارك الإسكندرية', 1670);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنح', 1680);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنح التهرب الضريبي', 1690);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء الإسكندرية', 1700);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء شبرا الخيمة', 1710);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء شمال القاهرة-ولي العهد', 1720);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء محكمة زنانيري', 1730);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('شمال القاهرة الإبتدائية', 1740);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('طنطا الابتدائية', 1750);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('لجنة التحفظ على أموال الإخوان', 1760);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مجلس الدولة الرحاب', 1770);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مجلس الدولة بالرحاب- هيئة مفوضي الدولة', 1780);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('محكمة خبراء تزييف وتزوير مبني المواردي السيدة زينب', 1790);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مدينة نصر أول', 1800);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب خبراء شبين الكوم (مجمع المصالح الحكومية - الدور الرابع)', 1810);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب خبراء محرم بك', 1820);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة العجوزة', 1830);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة مصر الجديدة', 1840);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('وزارة الداخلية', 1850);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('وزارة العدل', 1860);   -- 4 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف الخانكة والعبور', 1870);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف عالي بنها', 1880);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الاستئناف', 1890);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الإسماعيلية', 1900);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الأمور المستعجلة بعابدين', 1910);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الرمل الجزئية', 1920);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القاهرة التجارية', 1930);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('النيابة الإدارية', 1940);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('أسرة العجوزة', 1950);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('أسرة قصر النيل', 1960);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('أسيوط الابتدائية', 1970);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('بندر شبين الكوم', 1980);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنح العجوزة', 1990);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنح شبرا الخيمة أول', 2000);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء غرب الإسكندرية', 2010);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('دمنهور', 2020);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('زنانيري', 2030);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('لجنة التظلمات بالهيئة العامة الرقابة المالية', 2040);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('لجنة التفتيش', 2050);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('لجنة توفيق منازعات بوزارة السياحة', 2060);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مجلس الدولة بالأسكندرية', 2070);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مجلس الدولة بالجيزة - القضاء الإداري', 2080);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('محكمة', 2090);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مركز المنصورة', 2100);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مستأنف شبرا الخيمة', 2110);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب خبراء وزارة العدل بجنوب الجيزة', 2120);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة العامرية ثاني', 2130);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('هيئة الرقابة المالية، والبورصة المصرية', 2140);   -- 3 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف 6 أكتوبر (شمال الجيزة -  السودان)', 2150);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف المنصورة', 2160);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف جنوب الجيزة', 2170);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الإسكندرية للأمور المستعجلة', 2180);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الأسرة بزنانيري', 2190);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('البنك المركزي المصري', 2200);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الجهاز التنفيذي للمنطقة الصناعية و مديرية المساحة', 2210);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الدستورية العليا', 2220);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الساحل', 2230);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('اللجنة الوزارية لفض منازعات الاستثمار', 2240);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('النيابة الكلية', 2250);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('أسرة 6 أكتوبر', 2260);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('ثالث الإسماعيلية', 2270);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنايات النزهة', 2280);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنايات شمال القاهرة', 2290);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنح الدقي', 2300);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جهاز مدينة التجمع الخامس', 2310);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء الطب الشرعي', 2320);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('دار القضاء العالي محكمة النقض', 2330);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('طب شرعي - وزارة العدل', 2340);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('طب شرعي جنوب القاهرة', 2350);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('قسم شرطة الهرم', 2360);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('قسم شرطة مصر الجديدة', 2370);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('كرداسة', 2380);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('كوم حمادة', 2390);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مبني المواردي السيدة زينب امام المترو', 2400);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('محضري مدينة نصر', 2410);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مستعجل الإسكندرية', 2420);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مصلحة الضرائب -لجنة إنهاء المنازعات المالية', 2430);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب عمل', 2440);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب عمل ميناء البصل', 2450);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب غرب  الإسكندرية', 2460);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة الزقازيق', 2470);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة أول أكتوبر', 2480);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة سيدي جابر لشئون الأسرة', 2490);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة عابدين', 2500);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة مدينة نصر أول الجزئية', 2510);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('هيئة الأوقاف المصرية', 2520);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('هيئة سوق المال', 2530);   -- 2 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('االقضاء الأداري', 2540);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف الجيزة- شارع السودان', 2550);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف القاهرة مأمورية استئناف شمال الجيزة', 2560);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('استئناف عالي المنصورة', 2570);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الإدارة العامة لتكنولوجيا المعلومات', 2580);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الإدارية العليا بالدقي', 2590);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('البساتين الجزئية', 2600);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الجنايات', 2610);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الشركة الهندسية للتنمية السياحية', 2620);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الضرائب', 2630);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('العباسية', 2640);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('القاهرة الجديدة الجزئية', 2650);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('النزهة', 2660);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('النقض - مدني', 2670);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('النوبارية', 2680);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('الهيئة العامة للاستثمار بالإسكندرية', 2690);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('أسرة الخليفة', 2700);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('أكاديمية الشرطة -إدارة تكنولوجيا المعلومات', 2710);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('أكتوبر ثاني', 2720);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('بريد العتبة', 2730);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنايات العجوزة', 2740);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنح الطالبية', 2750);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنح مستأنف مدينة نصر', 2760);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنح مستأنف مصر الجديدة', 2770);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('جنوب المنصورة الكلية', 2780);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('حفظ العجوزة', 2790);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء شمال أسيوط', 2800);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء مجلس الدولة بالإسكندرية', 2810);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('خبراء محكمة الأسرة', 2820);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('شرطة مباحث التموين', 2830);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('شهر عقاري الدقي', 2840);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('قسم مدينة نصر أول', 2850);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('لجنة', 2860);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('لجنة إنهاء المنازعات الضريبية', 2870);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('لجنة تظلمات الهيئة العامة للرقابة المالية', 2880);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مجلس الدولة بالجيزة - الإدارية العليا', 2890);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('محضري الدقي', 2900);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('محضري النزهة', 2910);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مركز شرطة الزقازيق', 2920);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مصلحة الجوازات والهجرة', 2930);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مطروح الجزئية الكائن مقرها شارع شكري القوتلي أمام بنك الإسكندرية مطروح', 2940);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('مكتب عمل مدينة نصر', 2950);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة الأموال العامة العليا - تظلمات النائب العام', 2960);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة الدقي', 2970);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة الشيخ زايد', 2980);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة أمن الدولة العليا', 2990);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة جنوب المنصورة', 3000);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة شبين الكوم', 3010);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة شرق الإسكندرية (المنتزه)', 3020);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة شئون الأسرة -مال', 3030);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة قصر النيل الجزئية', 3040);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('نيابة مدينة نصر', 3050);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('هيئة الطاقة الجديدة والمتجددة', 3060);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('وزارة التربية والتعليم', 3070);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('محكمة استئناف اسرة التجمع', 3080);   -- 1 uses
INSERT INTO lookup_court (label_ar, sort_order) VALUES ('هيئة الاستثمار', 3090);   -- 1 uses


-- ============================================================================
--  CROSSWALK — every raw Access value and where it goes
--
--  Stage 2 resolves each source value through this table. A value absent from
--  it is a quarantine case, never a guess.
-- ============================================================================
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', '6 أكتوبر (جنوب الجيزة)', 380, 'court', '6 أكتوبر -جنوب الجيزة الكلية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'القاهرة الأقتصادية', 206, 'court', 'القاهرة الاقتصادية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الاسكندرية الاقتصادية', 109, 'court', 'الإسكندرية الاقتصادية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الهيئة العامة للاستثمار', 75, 'court', 'الهيئة العامة للاستثمار والمناطق الحرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'هيئة الاستثمار', 42, 'court', 'الهيئة العامة للاستثمار والمناطق الحرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الهيئة العامة للأستثمار - المنطقة الحرة', 32, 'court', 'الهيئة العامة للاستثمار والمناطق الحرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة النقض', 27, 'court', 'النقض', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'القضاء الأداري', 25, 'court', 'القضاء الإداري', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'هيئة الأستثمار - المنطقة الحرة', 25, 'court', 'الهيئة العامة للاستثمار والمناطق الحرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف عال شبين الكوم', 21, 'court', 'استئناف عالي شبين الكوم', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'قضاء إداري', 21, 'court', 'القضاء الإداري', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'السادس من أكتوبر', 19, 'court', '6 أكتوبر', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف الإسكندرية بأبيس', 18, 'court', 'استئناف الإسكندرية (أبيس)', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف شمال الجيزة شارع السودان', 17, 'court', 'استئناف شمال الجيزة (السودان)', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الأدارية العليا', 15, 'court', 'الإدارية العليا', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'المحكمة الإدارية العليا', 14, 'court', 'الإدارية العليا', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'هيئة الاستثمار - المنطقة الحرة', 13, 'court', 'الهيئة العامة للاستثمار والمناطق الحرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'أكتوبر', 10, 'court', '6 أكتوبر', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'القاهرة الجديدة الابتدائية', 8, 'court', 'القاهرة الجديدة الأبتدائية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'جنوب الجيزة الأبتدائية', 8, 'court', 'جنوب الجيزة الابتدائية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'جنوب القاهرة الابتدائية', 8, 'court', 'جنوب القاهرة الأبتدائية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف عال القاهرة', 7, 'court', 'استئناف عالي القاهرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'القضاء الاداري بالعباسية', 7, 'court', 'القضاء الإداري بالعباسية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الهيئة العامة للأستثمار في صلاح سالم', 7, 'court', 'الهيئة العامة للاستثمار والمناطق الحرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'حلوان الابتدائية', 7, 'court', 'حلوان الأبتدائية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'خبراء القاهرة الأقتصادية', 7, 'court', 'خبراء القاهرة الاقتصادية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الهيئة العامة للأستثمار  - المنطقة الحرة', 6, 'court', 'الهيئة العامة للاستثمار والمناطق الحرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'لجنة تفتيش بهيئة الأستثمار', 6, 'court', 'لجنة التفتيش - الهيئة العامة للاستثمار', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة حلوان الابتدائية', 6, 'court', 'حلوان الأبتدائية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'مركز التسوية والتحكيم الرياضي', 6, 'court', 'مركز التسوية و التحكيم الرياضي المصري', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'أستئناف القاهرة', 5, 'court', 'استئناف القاهرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة جنوب القاهرة', 5, 'court', 'جنوب القاهرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة مجلس الدولة بالرحاب', 4, 'court', 'مجلس الدولة بالرحاب', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'مكتب خبراء شرق القاهرة بالعباسية', 4, 'court', 'مكتب خبراء شرق القاهرة -  العباسية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'هيئة الأستثمار بمدينة نصر', 4, 'court', 'الهيئة العامة للاستثمار والمناطق الحرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'قضاء الأداري', 3, 'court', 'القضاء الإداري', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة شمال الجيزة', 3, 'court', 'شمال الجيزة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة شمال الجيزة الابتدائية تنعقد في جنوب الجيزة', 3, 'court', 'شمال الجيزة - تنعقد في جنوب الجيزة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة مدينة نصر', 3, 'court', 'مدينة نصر', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'مكتب خبراء العباسية', 3, 'court', 'مكتب خبراء شرق القاهرة -  العباسية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف الخانكة و العبور', 2, 'court', 'استئناف الخانكة والعبور', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الهيئة العامة للاستثمار بالمنطقة الحرة', 2, 'court', 'الهيئة العامة للاستثمار والمناطق الحرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'قصر النيل- عابدين', 2, 'court', 'قصر النيل - عابدين', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة القاهرة الجديدة', 2, 'court', 'القاهرة الجديدة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', '6 أكتوبر -جنوب الجزة الكلية', 1, 'court', '6 أكتوبر -جنوب الجيزة الكلية', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف', 1, 'court', 'الاستئناف', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'اسرة العجوزة', 1, 'court', 'أسرة العجوزة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'جهاز التنفيذي للمنطقة الصناعية و مديرية المساحة', 1, 'court', 'الجهاز التنفيذي للمنطقة الصناعية و مديرية المساحة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة أستئناف القاهرة', 1, 'court', 'استئناف القاهرة', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة حلوان', 1, 'court', 'حلوان', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة عابدين', 1, 'court', 'عابدين', 'Spelling variant. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'نقض', 1, 'court', 'النقض', 'Spelling variant. Confirmed by the firm.');

-- ---- SPLIT: court plus something else ---------------------------------------
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الجيزة الابتدائية  \n (السودان)', 5, 'SPLIT', 'الجيزة الابتدائية', 'Split: court=''الجيزة الابتدائية'', circuit=''(السودان)''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'نيابة الأموال العامة \n العليا', 5, 'SPLIT', 'نيابة الأموال العامة', 'Split: court=''نيابة الأموال العامة'', circuit=''العليا''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'خبراء مجلس الدولة (خبير/محمد هاشم)', 4, 'SPLIT', 'خبراء مجلس الدولة', 'Split: court=''خبراء مجلس الدولة'', hearing_note=''خبير/محمد هاشم''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'القاهرة الجديدة \n استئناف محكمة الأسرة', 3, 'SPLIT', 'القاهرة الجديدة', 'Split: court=''القاهرة الجديدة'', circuit=''استئناف محكمة الأسرة''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'نيابة الشئون المالية والتجارية \n  \n وكيل نيابة/ أسامة الطنطاوي', 3, 'SPLIT', 'نيابة الشئون المالية والتجارية', 'Split: court=''نيابة الشئون المالية والتجارية'', hearing_note=''وكيل نيابة/ أسامة الطنطاوي''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف القاهرة \n  \n 62 تجاري', 2, 'SPLIT', 'استئناف القاهرة', 'Split: court=''استئناف القاهرة'', circuit=''62 تجاري''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف شمال القاهرة \n  \n 87 تعويضات', 2, 'SPLIT', 'استئناف شمال القاهرة', 'Split: court=''استئناف شمال القاهرة'', circuit=''87 تعويضات''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف عالي طنطا \n مأمورية شبين الكوم', 2, 'SPLIT', 'استئناف عالي طنطا', 'Split: court=''استئناف عالي طنطا'', circuit=''مأمورية شبين الكوم''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الإدارية العليا \n  \n 1 موضوعي', 2, 'SPLIT', 'الإدارية العليا', 'Split: court=''الإدارية العليا'', circuit=''1 موضوعي''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'القاهرة الجديدة \n  \n 14 تعويضات', 2, 'SPLIT', 'القاهرة الجديدة', 'Split: court=''القاهرة الجديدة'', circuit=''14 تعويضات''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'القضاء الإداري \n  \n 7 مفوضي استثمار', 2, 'SPLIT', 'القضاء الإداري', 'Split: court=''القضاء الإداري'', circuit=''7 مفوضي استثمار''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'جنوب الجيزة \n  \n 12 مدني', 2, 'SPLIT', 'جنوب الجيزة', 'Split: court=''جنوب الجيزة'', circuit=''12 مدني''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'شمال القاهرة7', 2, 'SPLIT', 'شمال القاهرة', 'Split: court=''شمال القاهرة'', circuit=''7''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف الزقازيق \n  \n 19 استئناف', 1, 'SPLIT', 'استئناف الزقازيق', 'Split: court=''استئناف الزقازيق'', circuit=''19 استئناف''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف القاهرة \n  \n 50 تجاري', 1, 'SPLIT', 'استئناف القاهرة', 'Split: court=''استئناف القاهرة'', circuit=''50 تجاري''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف القاهرة مأمورية استئناف الجيزة \n  \n 118 تعويضات', 1, 'SPLIT', 'استئناف القاهرة مأمورية استئناف الجيزة', 'Split: court=''استئناف القاهرة مأمورية استئناف الجيزة'', circuit=''118 تعويضات''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'استئناف عالي القاهرة \n  \n 4 تعويضات', 1, 'SPLIT', 'استئناف عالي القاهرة', 'Split: court=''استئناف عالي القاهرة'', circuit=''4 تعويضات''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الإدارية العليا \n  \n 1 طعون عليا', 1, 'SPLIT', 'الإدارية العليا', 'Split: court=''الإدارية العليا'', circuit=''1 طعون عليا''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الإدارية العليا \n  \n 2 فحص', 1, 'SPLIT', 'الإدارية العليا', 'Split: court=''الإدارية العليا'', circuit=''2 فحص''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'الجيزة الابتدائية \n  \n 4 مدني حكومة', 1, 'SPLIT', 'الجيزة الابتدائية', 'Split: court=''الجيزة الابتدائية'', circuit=''4 مدني حكومة''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'القاهرة الاقتصادية \n  \n 2 اقتصادي', 1, 'SPLIT', 'القاهرة الاقتصادية', 'Split: court=''القاهرة الاقتصادية'', circuit=''2 اقتصادي''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'القاهرة الاقتصادية \n  \n 4 استئناف', 1, 'SPLIT', 'القاهرة الاقتصادية', 'Split: court=''القاهرة الاقتصادية'', circuit=''4 استئناف''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'القضاء الإداري \n  \n 8 عقود', 1, 'SPLIT', 'القضاء الإداري', 'Split: court=''القضاء الإداري'', circuit=''8 عقود''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'القضاء الإداري \n 3 أفراد مفوضين', 1, 'SPLIT', 'القضاء الإداري', 'Split: court=''القضاء الإداري'', circuit=''3 أفراد مفوضين''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'النقض \n  \n جنائي', 1, 'SPLIT', 'النقض', 'Split: court=''النقض'', circuit=''جنائي''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'النقض \n  \n مدني', 1, 'SPLIT', 'النقض', 'Split: court=''النقض'', circuit=''مدني''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'جنوب الجيزة  \n  \n 7 مدني كلي', 1, 'SPLIT', 'جنوب الجيزة', 'Split: court=''جنوب الجيزة'', circuit=''7 مدني كلي''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'جنوب الجيزة  \n  \n 9 مدني كلي', 1, 'SPLIT', 'جنوب الجيزة', 'Split: court=''جنوب الجيزة'', circuit=''9 مدني كلي''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'جنوب الجيزة \n  \n 13 تعويضات', 1, 'SPLIT', 'جنوب الجيزة', 'Split: court=''جنوب الجيزة'', circuit=''13 تعويضات''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'جنوب الجيزة \n  \n 6 مدني', 1, 'SPLIT', 'جنوب الجيزة', 'Split: court=''جنوب الجيزة'', circuit=''6 مدني''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'جنوب القاهرة \n  \n 16 عمال', 1, 'SPLIT', 'جنوب القاهرة', 'Split: court=''جنوب القاهرة'', circuit=''16 عمال''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'شمال القاهرة \n  \n 45 مدني', 1, 'SPLIT', 'شمال القاهرة', 'Split: court=''شمال القاهرة'', circuit=''45 مدني''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'محكمة استئناف اسرة التجمع 21826/142 ق', 1, 'SPLIT', 'محكمة استئناف اسرة التجمع', 'Split: court=''محكمة استئناف اسرة التجمع'', case_number=''21826/142 ق''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'مكتب خبراء وزارة العدل بجنوب الجيزة - (مروة السيد)', 1, 'SPLIT', 'مكتب خبراء وزارة العدل بجنوب الجيزة', 'Split: court=''مكتب خبراء وزارة العدل بجنوب الجيزة'', hearing_note=''مروة السيد''');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'هيئة الاستثمار  \n  \n لجان فض المنازعات', 1, 'SPLIT', 'هيئة الاستثمار', 'Split: court=''هيئة الاستثمار'', circuit=''لجان فض المنازعات''');


-- ---- WRONG: not courts ------------------------------------------------------
--  The firm classified these as venues or destinations, not courts.
--  نقابة الأطباء already exists in lookup_matter_destination.
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'نقابة الأطباء', 67, 'matter_destination', 'نقابة الأطباء', 'Not a court — a venue or destination. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'مقر شركة أدخنة النخلة بشبين الكوم', 2, 'matter_destination', 'مقر شركة أدخنة النخلة بشبين الكوم', 'Not a court — a venue or destination. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'نادي المقطم الرياضي', 2, 'matter_destination', 'نادي المقطم الرياضي', 'Not a court — a venue or destination. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', '/', 1, NULL, NULL, 'Not a value. Discard; the original stays in legacy_court_raw.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', '26', 1, NULL, NULL, 'Not a value. Discard; the original stays in legacy_court_raw.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'كايرو فيستيفال سيتي', 1, 'matter_destination', 'كايرو فيستيفال سيتي', 'Not a court — a venue or destination. Confirmed by the firm.');
INSERT INTO migration_crosswalk (source_field, source_value, rows_affected, target_field, target_value, reviewer_note) VALUES ('court', 'مكتب بريد المعادي', 1, 'matter_destination', 'مكتب بريد المعادي', 'Not a court — a venue or destination. Confirmed by the firm.');


-- ============================================================================
--  RULES FOR STAGE 2
-- ============================================================================
--
--  1. legacy_court_raw keeps the original text on every row of matters,
--     hearings and admin_tasks. Court is many-to-one from the start, so the
--     mapping must stay reversible.
--
--  2. A SPLIT row writes to MORE THAN ONE column. The court part resolves to
--     lookup_court; the remainder goes to circuit, to the case number, or to
--     the hearing notes, per its crosswalk note. Never discard the remainder.
--
--  3. Three raw values carry an INDIVIDUAL'S NAME, not a circuit:
--         خبير/محمد هاشم              State Council expert
--         مروة السيد                  Ministry of Justice expert
--         وكيل نيابة/ أسامة الطنطاوي  prosecutor
--     These go to the HEARING notes (الجلسات.ملاحظات), not the matter notes —
--     the name belongs to the hearing it was recorded against. A matter with
--     several hearings before different experts would otherwise collect several
--     names with no way to tell them apart.
--
--  4. الجيزة الابتدائية / (السودان) — (السودان) is not a circuit but is
--     recorded as one, as text. 5 rows. Flag at Gate 3; do not invent a home.
--
--  5. A court value not in this crosswalk and not in lookup_court is a
--     QUARANTINE case. Never guess.
--
--  6. CIRCUIT STAYS TEXT (D20). 1,281 distinct values in hearings alone, and
--     they are circuit-number-plus-specialism — 12 عمال, 8 تجاري, 4 استئناف.
--     The 35 SPLIT rows are circuits that leaked into the court field, which
--     is what a circuit dropdown would have had to untangle.


-- ============================================================================
--  VALIDATION
-- ============================================================================

SELECT count(*) AS courts FROM lookup_court;
-- Expected: 309

SELECT count(*) AS court_crosswalk_rules
FROM   migration_crosswalk WHERE source_field = 'court';
-- Expected: 94

-- Every merge target must exist as a court.
SELECT cw.source_value, cw.target_value
FROM   migration_crosswalk cw
LEFT   JOIN lookup_court c ON c.label_ar = cw.target_value
WHERE  cw.source_field = 'court' AND cw.target_field = 'court' AND c.id IS NULL;
-- Expected: zero rows

-- Every SPLIT court part must exist as a court.
SELECT cw.source_value, cw.target_value
FROM   migration_crosswalk cw
LEFT   JOIN lookup_court c ON c.label_ar = cw.target_value
WHERE  cw.source_field = 'court' AND cw.target_field = 'SPLIT' AND c.id IS NULL;
-- Expected: zero rows

-- No court may also be a crosswalk source: that would be a two-step chain.
SELECT c.label_ar FROM lookup_court c
JOIN   migration_crosswalk cw
  ON   cw.source_value = c.label_ar AND cw.source_field = 'court';
-- Expected: zero rows
