-- CreateTable
CREATE TABLE "lookup_matter_type" (
    "id" SMALLSERIAL NOT NULL,
    "label_ar" TEXT NOT NULL,
    "label_en" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_matter_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_matter_category" (
    "id" SMALLSERIAL NOT NULL,
    "label_ar" TEXT NOT NULL,
    "label_en" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_matter_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_degree" (
    "id" SMALLSERIAL NOT NULL,
    "label_ar" TEXT NOT NULL,
    "label_en" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_degree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_venue" (
    "id" SMALLSERIAL NOT NULL,
    "label_ar" TEXT NOT NULL,
    "label_en" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_importance" (
    "id" SMALLSERIAL NOT NULL,
    "label_ar" TEXT NOT NULL,
    "label_en" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_importance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_party_role" (
    "id" SMALLSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "label_ar_m" TEXT NOT NULL,
    "label_ar_f" TEXT NOT NULL,
    "label_en" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_party_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_hearing_action" (
    "id" SMALLSERIAL NOT NULL,
    "label_ar" TEXT NOT NULL,
    "label_en" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_hearing_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_matter_destination" (
    "id" SMALLSERIAL NOT NULL,
    "label_ar" TEXT NOT NULL,
    "label_en" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_matter_destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_client_branch" (
    "id" SMALLSERIAL NOT NULL,
    "label_ar" TEXT NOT NULL,
    "label_en" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_client_branch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lookup_matter_type_label_ar_key" ON "lookup_matter_type"("label_ar");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_matter_category_label_ar_key" ON "lookup_matter_category"("label_ar");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_degree_label_ar_key" ON "lookup_degree"("label_ar");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_venue_label_ar_key" ON "lookup_venue"("label_ar");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_importance_label_ar_key" ON "lookup_importance"("label_ar");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_party_role_code_key" ON "lookup_party_role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_hearing_action_label_ar_key" ON "lookup_hearing_action"("label_ar");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_matter_destination_label_ar_key" ON "lookup_matter_destination"("label_ar");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_client_branch_label_ar_key" ON "lookup_client_branch"("label_ar");

-- ==========================================================================
--  SEED — the nine lookup lists
--
--  GENERATED by scripts/generate-lookup-seed.ts from the two SQL files the
--  firm reviewed value by value. Do not hand-edit this section: change the
--  source and regenerate, or the two will drift apart.
--
--    sql/lookups-and-crosswalk.sql       matter_type, degree, venue,
--                                        matter_category, importance
--    sql/lookups-part2-and-teams.sql     party_role, hearing_action,
--                                        matter_destination, client_branch
--
--  Loaded by the migration rather than a seed script, because the
--  application cannot work without these lists: a fresh database, on any
--  machine, must arrive complete. `prisma migrate deploy` runs this;
--  `prisma db seed` would not.
-- ==========================================================================

-- ---- lookup_matter_type: 14 rows --------------------------------
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('تقاضي', 'Litigation', 10, true, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('استشارات', 'Consultation', 20, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('رأي قانوني', 'Legal opinion', 30, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('إجراءات', 'Procedures', 40, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('تظلم', 'Grievance', 50, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('طعن', 'Challenge', 60, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('طلب', 'Petition', 70, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('طلب رد', 'Recusal request', 80, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('متابعة قانونية', 'Legal follow-up', 90, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('إلتماس', 'Petition for reconsideration', 100, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('منازعة تنفيذ', 'Execution dispute', 110, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('إشكال', 'Execution objection', 120, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('محضر إداري', 'Administrative report', 130, false, now());
INSERT INTO "lookup_matter_type" (label_ar, label_en, sort_order, is_default, updated_at) VALUES ('تفتيش', 'Inspection', 140, false, now());

-- ---- lookup_degree: 12 rows -------------------------------------
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('أول درجة', 'First instance', 10, now());
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('ابتدائي', 'Primary', 20, now());
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('جزئي', 'Summary', 30, now());
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('استئناف', 'Appeal', 40, now());
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('مستأنف', 'Appealed', 50, now());
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('نقض', 'Cassation', 60, now());
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('طعن إداري', 'Administrative challenge', 70, now());
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('جنح', 'Misdemeanour', 80, now());
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('جنح إقتصادي', 'Economic misdemeanour', 90, now());
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('محضر', 'Report', 100, now());
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('محضر إداري', 'Administrative report', 110, now());
INSERT INTO "lookup_degree" (label_ar, label_en, sort_order, updated_at) VALUES ('إشكال', 'Execution objection', 120, now());

-- ---- lookup_venue: 7 rows --------------------------------------
INSERT INTO "lookup_venue" (label_ar, label_en, sort_order, updated_at) VALUES ('قضاء إداري', 'Administrative judiciary', 10, now());
INSERT INTO "lookup_venue" (label_ar, label_en, sort_order, updated_at) VALUES ('إدارية عليا', 'Supreme Administrative Court', 20, now());
INSERT INTO "lookup_venue" (label_ar, label_en, sort_order, updated_at) VALUES ('مجلس الدولة', 'Council of State', 30, now());
INSERT INTO "lookup_venue" (label_ar, label_en, sort_order, updated_at) VALUES ('المحكمة الدستورية العليا', 'Supreme Constitutional Court', 40, now());
INSERT INTO "lookup_venue" (label_ar, label_en, sort_order, updated_at) VALUES ('نيابة', 'Public prosecution', 50, now());
INSERT INTO "lookup_venue" (label_ar, label_en, sort_order, updated_at) VALUES ('لجنة', 'Committee', 60, now());
INSERT INTO "lookup_venue" (label_ar, label_en, sort_order, updated_at) VALUES ('تحكيم', 'Arbitration', 70, now());

-- ---- lookup_matter_category: 21 rows ----------------------------
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('عمال', 10, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('مدني', 20, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('اقتصادي', 30, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('جنح', 40, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('تجاري', 50, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('قضاء إداري', 60, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('تعويضات', 70, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('ضرائب', 80, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('حكومي', 90, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('أسرة', 100, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('شركات', 110, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('أحوال شخصية', 120, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('جنايات', 130, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('تحكيم رياضي', 140, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('إداري', 150, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('رياضة', 160, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('فض منازعات', 170, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('بنوك', 180, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('شق مستعجل', 190, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('عقود', 200, now());
INSERT INTO "lookup_matter_category" (label_ar, sort_order, updated_at) VALUES ('جنح مستأنف', 210, now());

-- ---- lookup_importance: 3 rows ---------------------------------
INSERT INTO "lookup_importance" (label_ar, sort_order, updated_at) VALUES ('عادية', 10, now());
INSERT INTO "lookup_importance" (label_ar, sort_order, updated_at) VALUES ('هامة', 20, now());
INSERT INTO "lookup_importance" (label_ar, sort_order, updated_at) VALUES ('حرجة', 30, now());

-- ---- lookup_party_role: 11 rows ---------------------------------
INSERT INTO "lookup_party_role" (code, label_ar_m, label_ar_f, label_en, sort_order, updated_at) VALUES ('plaintiff', 'مدعي', 'مدعية', 'Plaintiff', 10, now());
INSERT INTO "lookup_party_role" (code, label_ar_m, label_ar_f, label_en, sort_order, updated_at) VALUES ('defendant', 'مدعى عليه', 'مدعى عليها', 'Defendant', 20, now());
INSERT INTO "lookup_party_role" (code, label_ar_m, label_ar_f, label_en, sort_order, updated_at) VALUES ('appellant', 'مستأنف', 'مستأنفة', 'Appellant', 30, now());
INSERT INTO "lookup_party_role" (code, label_ar_m, label_ar_f, label_en, sort_order, updated_at) VALUES ('appellee', 'مستأنف ضده', 'مستأنف ضدها', 'Appellee', 40, now());
INSERT INTO "lookup_party_role" (code, label_ar_m, label_ar_f, label_en, sort_order, updated_at) VALUES ('cassation_petitioner', 'طاعن', 'طاعنة', 'Cassation petitioner', 50, now());
INSERT INTO "lookup_party_role" (code, label_ar_m, label_ar_f, label_en, sort_order, updated_at) VALUES ('cassation_respondent', 'مطعون ضده', 'مطعون ضدها', 'Cassation respondent', 60, now());
INSERT INTO "lookup_party_role" (code, label_ar_m, label_ar_f, label_en, sort_order, updated_at) VALUES ('grievant', 'متظلم', 'متظلمة', 'Grievant', 70, now());
INSERT INTO "lookup_party_role" (code, label_ar_m, label_ar_f, label_en, sort_order, updated_at) VALUES ('grievance_respondent', 'متظلم ضده', 'متظلم ضدها', 'Grievance respondent', 80, now());
INSERT INTO "lookup_party_role" (code, label_ar_m, label_ar_f, label_en, sort_order, updated_at) VALUES ('accused', 'متهم', 'متهمة', 'Accused', 90, now());
INSERT INTO "lookup_party_role" (code, label_ar_m, label_ar_f, label_en, sort_order, updated_at) VALUES ('prosecution', 'سلطة اتهام', 'سلطة اتهام', 'Prosecution', 100, now());
INSERT INTO "lookup_party_role" (code, label_ar_m, label_ar_f, label_en, sort_order, updated_at) VALUES ('civil_claimant', 'مدعي بالحق المدني', 'مدعية بالحق المدني', 'Civil claimant', 110, now());

-- ---- lookup_hearing_action: 23 rows -----------------------------
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('محكمة', 10, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('خبير', 20, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('لجنة', 30, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('نيابة', 40, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('هيئة', 50, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('خبراء', 60, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('لجنة خبراء', 70, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('تحكيم', 80, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('طب شرعي', 90, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('محكمه', 100, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('مفوضين', 110, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('مجكمة', 120, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('لجنة تفتيش', 130, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('قسم', 140, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('محكمة مجلس الدولة بالرحاب', 150, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('محضر', 160, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('معاينة', 170, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('قسم شرطة', 180, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('تحقيق', 190, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('حضور جلسة', 200, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('رفع الدعوى', 210, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('أول جلسة', 220, now());
INSERT INTO "lookup_hearing_action" (label_ar, sort_order, updated_at) VALUES ('رفع الدعوي', 230, now());

-- ---- lookup_matter_destination: 27 rows -------------------------
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('جنوب الجيزة', 10, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('دار القضاء العالي', 20, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('العباسية', 30, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('مجلس الدولة بالجيزة', 40, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('شمال الجيزة', 50, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('القاهرة الاقتصادية', 60, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('التجمع الخامس', 70, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('6 أكتوبر', 80, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('شبين الكوم', 90, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('الإسكندرية', 100, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('تاج الدول', 110, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('القناطر', 120, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('القاهرة', 130, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('أسيوط', 140, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('جنوب القاهرة', 150, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('عابدين', 160, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('مصر الجديدة', 170, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('المنصورة', 180, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('مصلحة الضرائب', 190, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('نقابة الأطباء', 200, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('المعادي', 210, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('العبور', 220, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('العجوزة', 230, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('مدينة نصر', 240, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('الزقازيق', 250, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('هيئة الاستثمار -صلاح سالم', 260, now());
INSERT INTO "lookup_matter_destination" (label_ar, sort_order, updated_at) VALUES ('رشيد', 270, now());

-- ---- lookup_client_branch: 32 rows ------------------------------
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('المنطقة الحرة', 10, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('دعاوى عمالية', 20, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('المصنع المحلي', 30, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('الفطيم لإنشاء وتنمية المنتجعات السكنية', 40, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('تويوتا إيجيبت', 50, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('الجنح', 60, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('تويوتا مصر للتجارة', 70, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('المركز الرئيسي', 80, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('ثانياً: النزاعات القضائية المقامة من وضد شركتي الإمارات هايتس ويافا ماك', 90, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('الفطيم للتنمية العقارية', 100, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('دعاوى قضائية', 110, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('تويوتا إيجيبت لصناعة السيارات', 120, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('النقض', 130, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('سيجما للإعلام (تليفزيون الحياة)', 140, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('أوراسكوم للفنادق', 150, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('الفطيم لإقامة المراكز التجارية والإدارية', 160, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('سيجما للصناعات الدوائية', 170, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('قضاء إداري', 180, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('ضرائب', 190, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('فرع المنصورة', 200, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('آراء قانونية', 210, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('الفطيم للسيارات', 220, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('مدني', 230, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('الفطيم مصر للبيع بالتجزئة', 240, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('القضاء الإداري', 250, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('جنح', 260, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('أوراسكوم للاتصالات', 270, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('فرع الإسكندرية', 280, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('تعويضات', 290, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('ألفا مصر للتجارة', 300, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('أولاً: طلب وشكوى أمام الهيئة العامة للاستثمار', 310, now());
INSERT INTO "lookup_client_branch" (label_ar, sort_order, updated_at) VALUES ('إقتصادي', 320, now());

-- ==========================================================================
--  ASSERT — rule 15
--
--  Every count is stated and checked. A migration runs in a transaction, so
--  a failure here rolls the whole thing back: there is no half-seeded
--  database to discover later.
--
--  A silent zero is how أحمد إسماعيل became two people, one of them
--  carrying 1,309 hearings.
-- ==========================================================================
DO $SEED$
DECLARE
    actual integer;
    grand  integer := 0;
BEGIN
    SELECT count(*) INTO actual FROM "lookup_matter_type";
    grand := grand + actual;
    IF actual <> 14 THEN
        RAISE EXCEPTION 'lookup_matter_type: seeded % rows, expected 14', actual;
    END IF;

    SELECT count(*) INTO actual FROM "lookup_degree";
    grand := grand + actual;
    IF actual <> 12 THEN
        RAISE EXCEPTION 'lookup_degree: seeded % rows, expected 12', actual;
    END IF;

    SELECT count(*) INTO actual FROM "lookup_venue";
    grand := grand + actual;
    IF actual <> 7 THEN
        RAISE EXCEPTION 'lookup_venue: seeded % rows, expected 7', actual;
    END IF;

    SELECT count(*) INTO actual FROM "lookup_matter_category";
    grand := grand + actual;
    IF actual <> 21 THEN
        RAISE EXCEPTION 'lookup_matter_category: seeded % rows, expected 21', actual;
    END IF;

    SELECT count(*) INTO actual FROM "lookup_importance";
    grand := grand + actual;
    IF actual <> 3 THEN
        RAISE EXCEPTION 'lookup_importance: seeded % rows, expected 3', actual;
    END IF;

    SELECT count(*) INTO actual FROM "lookup_party_role";
    grand := grand + actual;
    IF actual <> 11 THEN
        RAISE EXCEPTION 'lookup_party_role: seeded % rows, expected 11', actual;
    END IF;

    SELECT count(*) INTO actual FROM "lookup_hearing_action";
    grand := grand + actual;
    IF actual <> 23 THEN
        RAISE EXCEPTION 'lookup_hearing_action: seeded % rows, expected 23', actual;
    END IF;

    SELECT count(*) INTO actual FROM "lookup_matter_destination";
    grand := grand + actual;
    IF actual <> 27 THEN
        RAISE EXCEPTION 'lookup_matter_destination: seeded % rows, expected 27', actual;
    END IF;

    SELECT count(*) INTO actual FROM "lookup_client_branch";
    grand := grand + actual;
    IF actual <> 32 THEN
        RAISE EXCEPTION 'lookup_client_branch: seeded % rows, expected 32', actual;
    END IF;

    IF grand <> 150 THEN
        RAISE EXCEPTION 'lookups: % rows in total, expected 150', grand;
    END IF;

    -- Exactly one default matter type. Matters fall back to it (تقاضي).
    SELECT count(*) INTO actual FROM "lookup_matter_type" WHERE is_default;
    IF actual <> 1 THEN
        RAISE EXCEPTION 'lookup_matter_type: % rows marked default, expected 1', actual;
    END IF;

    RAISE NOTICE 'lookups seeded: % rows across 9 lists', grand;
END
$SEED$;
