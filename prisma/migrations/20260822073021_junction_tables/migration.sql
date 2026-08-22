-- CreateTable
CREATE TABLE "matter_lawyers" (
    "id" SERIAL NOT NULL,
    "matter_id" INTEGER NOT NULL,
    "person_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "position" INTEGER,
    "legacy_source" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "matter_lawyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matter_parties" (
    "id" SERIAL NOT NULL,
    "matter_id" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "party_name" TEXT,
    "gender" TEXT,
    "ordinal" INTEGER,
    "legacy_raw" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "matter_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matter_party_roles" (
    "id" SERIAL NOT NULL,
    "party_id" INTEGER NOT NULL,
    "role_id" SMALLINT NOT NULL,
    "ordinal" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "matter_party_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hearing_attendees" (
    "id" SERIAL NOT NULL,
    "hearing_id" INTEGER NOT NULL,
    "person_id" INTEGER,
    "legacy_name_raw" TEXT,
    "ordinal" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "hearing_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_letter_matters" (
    "id" SERIAL NOT NULL,
    "fee_letter_id" INTEGER NOT NULL,
    "matter_id" INTEGER,
    "legacy_matter_ref" TEXT,
    "ordinal" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "fee_letter_matters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matter_lawyers_matter_id_idx" ON "matter_lawyers"("matter_id");

-- CreateIndex
CREATE INDEX "matter_lawyers_person_id_idx" ON "matter_lawyers"("person_id");

-- CreateIndex
CREATE INDEX "matter_parties_matter_id_idx" ON "matter_parties"("matter_id");

-- CreateIndex
CREATE INDEX "matter_party_roles_party_id_idx" ON "matter_party_roles"("party_id");

-- CreateIndex
CREATE INDEX "hearing_attendees_hearing_id_idx" ON "hearing_attendees"("hearing_id");

-- CreateIndex
CREATE INDEX "hearing_attendees_person_id_idx" ON "hearing_attendees"("person_id");

-- CreateIndex
CREATE INDEX "fee_letter_matters_fee_letter_id_idx" ON "fee_letter_matters"("fee_letter_id");

-- CreateIndex
CREATE INDEX "fee_letter_matters_matter_id_idx" ON "fee_letter_matters"("matter_id");

-- AddForeignKey
ALTER TABLE "matter_lawyers" ADD CONSTRAINT "matter_lawyers_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matter_lawyers" ADD CONSTRAINT "matter_lawyers_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matter_parties" ADD CONSTRAINT "matter_parties_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matter_party_roles" ADD CONSTRAINT "matter_party_roles_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "matter_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matter_party_roles" ADD CONSTRAINT "matter_party_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "lookup_party_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearing_attendees" ADD CONSTRAINT "hearing_attendees_hearing_id_fkey" FOREIGN KEY ("hearing_id") REFERENCES "hearings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearing_attendees" ADD CONSTRAINT "hearing_attendees_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_letter_matters" ADD CONSTRAINT "fee_letter_matters_fee_letter_id_fkey" FOREIGN KEY ("fee_letter_id") REFERENCES "fee_letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_letter_matters" ADD CONSTRAINT "fee_letter_matters_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==========================================================================
--  TASK 1.4 — CONSTRAINTS AND POSTCONDITIONS
--
--  Rule 16: a constraint refuses the mistake as it happens; a check tells you
--  next time anyone looks. Both are used here, and the constraints below are
--  the strongest available for each rule.
--
--  Prisma cannot express a CHECK constraint or a filtered index, so all four
--  are raw SQL and invisible to schema.prisma. db:check therefore asserts
--  they EXIST as well as asserting what they protect — the same arrangement
--  as person_name_alias_one_primary_per_person in migration 0009.
-- ==========================================================================

-- --------------------------------------------------------------------------
--  1. The three closed value sets
--
--  Not lookup tables, and not PostgreSQL enums.
--
--  Not tables because nobody adds a lawyer role or a third side to a case
--  without a code change — reports branch on `lead`, and `client` versus
--  `opponent` decides which column of a report a party appears in. That is
--  the exact opposite of the case D8 makes for courts and categories, where
--  an administrator must be able to add a value without a developer.
--
--  Not enums because D8 rules those out project-wide, and because adding a
--  value to a PostgreSQL enum inside a transaction is awkward in a way a
--  CHECK constraint is not.
-- --------------------------------------------------------------------------
ALTER TABLE "matter_lawyers"
    ADD CONSTRAINT "matter_lawyers_role_check"
    CHECK (role IN ('lead', 'co_lead', 'support'));

ALTER TABLE "matter_parties"
    ADD CONSTRAINT "matter_parties_side_check"
    CHECK (side IN ('client', 'opponent'));

-- Gender is nullable and NULL is common and correct: it is unknown for most
-- parties and meaningless for an organisation. The constraint allows NULL and
-- refuses anything that is neither m nor f.
ALTER TABLE "matter_parties"
    ADD CONSTRAINT "matter_parties_gender_check"
    CHECK (gender IS NULL OR gender IN ('m', 'f'));

-- --------------------------------------------------------------------------
--  2. AT MOST ONE LEAD LAWYER PER MATTER
--
--  docs/DATA-MODEL.md states this as a rule, and the expected figures agree
--  with it: 896 matters with a lead and 834 with none is exactly 1,730.
--
--  **This is the one place in task 1.4 where a load CAN fail, and that is
--  deliberate.** Everywhere else the rule is that a load must never reject a
--  row, because 4 hearings with no matter and 289 unmatched fee-letter
--  references are facts about the source data. Two lead lawyers on one matter
--  would not be a fact about the source data — `lawyerA` and `lawyerB` are
--  separate columns, so only the transform can produce it.
--
--  If Stage 2 ever trips this, the answer is to quarantine that matter and
--  ask the firm which lawyer leads it. It is NOT to relax the constraint:
--  "who leads this matter" having two answers is the ambiguity D5 exists to
--  remove.
-- --------------------------------------------------------------------------
CREATE UNIQUE INDEX "matter_lawyers_one_lead_per_matter"
    ON "matter_lawyers" ("matter_id")
 WHERE role = 'lead';

DO $JUNCTION$
DECLARE
    n       integer;
    missing text;
BEGIN
    -- ----------------------------------------------------------------------
    --  All five tables
    -- ----------------------------------------------------------------------
    SELECT string_agg(t.name, ', ' ORDER BY t.name) INTO missing
      FROM (VALUES ('matter_lawyers'), ('matter_parties'), ('matter_party_roles'),
                   ('hearing_attendees'), ('fee_letter_matters')
           ) AS t(name)
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables it
                        WHERE it.table_schema = 'public' AND it.table_name = t.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'task 1.4 tables missing: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  THE FIVE RAW COLUMNS TASK 1.3 REQUIRED ARE NOW ALL PRESENT
    --
    --  Asserted together here for the first time, because the fifth could not
    --  exist until this migration created its table. This is the gate task
    --  1.3 pointed at: all five before Stage 2 loads a row.
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO missing
      FROM (VALUES
                ('clients',            'legacy_branch_raw'),
                ('hearings',           'legacy_action_raw'),
                ('admin_tasks',        'legacy_assignee_raw'),
                ('powers_of_attorney', 'legacy_lawyers_raw'),
                ('hearing_attendees',  'legacy_name_raw')
           ) AS r(t, c)
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                        WHERE ic.table_schema = 'public'
                          AND ic.table_name = r.t AND ic.column_name = r.c);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'the five raw columns task 1.3 required are not all present: %', missing;
    END IF;

    -- ...and the two this task adds, from the same audit.
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO missing
      FROM (VALUES
                ('matter_lawyers', 'legacy_source'),
                ('matter_parties', 'legacy_raw'),
                ('fee_letter_matters', 'legacy_matter_ref')
           ) AS r(t, c)
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                        WHERE ic.table_schema = 'public'
                          AND ic.table_name = r.t AND ic.column_name = r.c);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'raw columns missing: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  The constraints exist
    --
    --  Named, not counted. A count of constraints on a table is satisfied by
    --  the wrong constraints.
    -- ----------------------------------------------------------------------
    SELECT string_agg(c.name, ', ' ORDER BY c.name) INTO missing
      FROM (VALUES ('matter_lawyers_role_check'),
                   ('matter_parties_side_check'),
                   ('matter_parties_gender_check')
           ) AS c(name)
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint pc WHERE pc.conname = c.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'check constraints missing: %', missing;
    END IF;

    SELECT count(*) INTO n FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'matter_lawyers_one_lead_per_matter';
    IF n <> 1 THEN
        RAISE EXCEPTION 'the one-lead-per-matter index is missing — a matter could have two lead lawyers';
    END IF;

    -- ----------------------------------------------------------------------
    --  Where a link MUST still be allowed to be empty
    --
    --  A spelling that resolves to nobody, and a case-number string that
    --  matches no matter, are both expected in the real data — roughly 474
    --  attendee names appear once, and 289 fee-letter references match
    --  nothing. Both load with a null link and go to the review queue.
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO missing
      FROM (VALUES
                ('hearing_attendees',  'person_id'),
                ('fee_letter_matters', 'matter_id')
           ) AS r(t, c)
     WHERE EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public'
                      AND ic.table_name = r.t AND ic.column_name = r.c
                      AND ic.is_nullable = 'NO');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'these must stay nullable or Stage 2 would reject rows the firm already knows about: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  Empty, and nothing else moved
    -- ----------------------------------------------------------------------
    SELECT (SELECT count(*) FROM "matter_lawyers")
         + (SELECT count(*) FROM "matter_parties")
         + (SELECT count(*) FROM "matter_party_roles")
         + (SELECT count(*) FROM "hearing_attendees")
         + (SELECT count(*) FROM "fee_letter_matters")
      INTO n;
    IF n <> 0 THEN
        RAISE EXCEPTION 'the task 1.4 tables should arrive empty, found % rows', n;
    END IF;

    SELECT count(*) INTO n FROM "lookup_party_role";
    IF n <> 11 THEN
        RAISE EXCEPTION 'lookup_party_role: %, expected 11 — matter_party_roles points at it', n;
    END IF;

    SELECT count(*) INTO n FROM "people";
    IF n <> 135 THEN RAISE EXCEPTION 'people: %, expected 135', n; END IF;

    RAISE NOTICE 'task 1.4: 5 tables, 3 check constraints, one lead per matter, all five raw columns present';
END
$JUNCTION$;
