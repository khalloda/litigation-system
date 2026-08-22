-- CreateTable
CREATE TABLE "lookup_court" (
    "id" SMALLSERIAL NOT NULL,
    "label_ar" TEXT NOT NULL,
    "label_en" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "lookup_court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "full_name" TEXT,
    "branch_id" SMALLINT,
    "legacy_branch_raw" TEXT,
    "cash_or_probono" TEXT,
    "status" TEXT,
    "poa_location" TEXT,
    "documents_location" TEXT,
    "client_start" DATE,
    "client_end" DATE,
    "contact_person_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_logos" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "relative_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "client_logos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "client_id" INTEGER,
    "name_ar" TEXT,
    "name_en" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matters" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "case_number_ar" TEXT,
    "subject" TEXT,
    "client_id" INTEGER,
    "matter_type_id" SMALLINT,
    "matter_category_id" SMALLINT,
    "degree_id" SMALLINT,
    "venue_id" SMALLINT,
    "importance_id" SMALLINT,
    "destination_id" SMALLINT,
    "legacy_category_raw" TEXT,
    "legacy_degree_raw" TEXT,
    "status" TEXT,
    "court_id" SMALLINT,
    "legacy_court_raw" TEXT,
    "circuit" TEXT,
    "court_floor" TEXT,
    "court_hall" TEXT,
    "court_shelf" TEXT,
    "court_secretary_room" TEXT,
    "fee_letter_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "matters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hearings" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "matter_id" INTEGER,
    "hearing_date" DATE,
    "next_hearing_date" DATE,
    "action_id" SMALLINT,
    "legacy_action_raw" TEXT,
    "decision" TEXT,
    "outcome" TEXT,
    "court_id" SMALLINT,
    "legacy_court_raw" TEXT,
    "circuit" TEXT,
    "client_notified" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "hearings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_tasks" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "matter_id" INTEGER,
    "required_work" TEXT,
    "assigned_to_person_id" INTEGER,
    "legacy_assignee_raw" TEXT,
    "execution_date" DATE,
    "result" TEXT,
    "previous_decision" TEXT,
    "last_followup" DATE,
    "deadline" DATE,
    "court_id" SMALLINT,
    "legacy_court_raw" TEXT,
    "circuit" TEXT,
    "destination_id" SMALLINT,
    "status" TEXT,
    "alert" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "admin_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_actions" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "task_id" INTEGER,
    "legacy_task_id_raw" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "task_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "powers_of_attorney" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "client_id" INTEGER,
    "legacy_lawyers_raw" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "powers_of_attorney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" SERIAL NOT NULL,
    "legacy_id" INTEGER,
    "matter_id" INTEGER,
    "description" TEXT,
    "page_count" INTEGER,
    "deposit_date" DATE,
    "responsible_person_id" INTEGER,
    "legacy_responsible_raw" TEXT,
    "movement_card" TEXT,
    "storage_location" TEXT,
    "mfiles_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_letters" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER,
    "client_id" INTEGER,
    "mfiles_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "fee_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lookup_court_label_ar_key" ON "lookup_court"("label_ar");

-- CreateIndex
CREATE UNIQUE INDEX "clients_legacy_id_key" ON "clients"("legacy_id");

-- CreateIndex
CREATE INDEX "clients_name_ar_idx" ON "clients"("name_ar");

-- CreateIndex
CREATE UNIQUE INDEX "client_logos_client_id_key" ON "client_logos"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_legacy_id_key" ON "contacts"("legacy_id");

-- CreateIndex
CREATE INDEX "contacts_client_id_idx" ON "contacts"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "matters_legacy_id_key" ON "matters"("legacy_id");

-- CreateIndex
CREATE INDEX "matters_client_id_idx" ON "matters"("client_id");

-- CreateIndex
CREATE INDEX "matters_status_idx" ON "matters"("status");

-- CreateIndex
CREATE INDEX "matters_court_id_idx" ON "matters"("court_id");

-- CreateIndex
CREATE UNIQUE INDEX "hearings_legacy_id_key" ON "hearings"("legacy_id");

-- CreateIndex
CREATE INDEX "hearings_matter_id_idx" ON "hearings"("matter_id");

-- CreateIndex
CREATE INDEX "hearings_hearing_date_idx" ON "hearings"("hearing_date");

-- CreateIndex
CREATE INDEX "hearings_next_hearing_date_idx" ON "hearings"("next_hearing_date");

-- CreateIndex
CREATE INDEX "hearings_court_id_idx" ON "hearings"("court_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_tasks_legacy_id_key" ON "admin_tasks"("legacy_id");

-- CreateIndex
CREATE INDEX "admin_tasks_matter_id_idx" ON "admin_tasks"("matter_id");

-- CreateIndex
CREATE INDEX "admin_tasks_assigned_to_person_id_idx" ON "admin_tasks"("assigned_to_person_id");

-- CreateIndex
CREATE INDEX "admin_tasks_execution_date_idx" ON "admin_tasks"("execution_date");

-- CreateIndex
CREATE INDEX "admin_tasks_status_idx" ON "admin_tasks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "task_actions_legacy_id_key" ON "task_actions"("legacy_id");

-- CreateIndex
CREATE INDEX "task_actions_task_id_idx" ON "task_actions"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "powers_of_attorney_legacy_id_key" ON "powers_of_attorney"("legacy_id");

-- CreateIndex
CREATE INDEX "powers_of_attorney_client_id_idx" ON "powers_of_attorney"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_legacy_id_key" ON "documents"("legacy_id");

-- CreateIndex
CREATE INDEX "documents_matter_id_idx" ON "documents"("matter_id");

-- CreateIndex
CREATE INDEX "documents_responsible_person_id_idx" ON "documents"("responsible_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_letters_contract_id_key" ON "fee_letters"("contract_id");

-- CreateIndex
CREATE INDEX "fee_letters_client_id_idx" ON "fee_letters"("client_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "lookup_client_branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_contact_person_id_fkey" FOREIGN KEY ("contact_person_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_logos" ADD CONSTRAINT "client_logos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_matter_type_id_fkey" FOREIGN KEY ("matter_type_id") REFERENCES "lookup_matter_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_matter_category_id_fkey" FOREIGN KEY ("matter_category_id") REFERENCES "lookup_matter_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_degree_id_fkey" FOREIGN KEY ("degree_id") REFERENCES "lookup_degree"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "lookup_venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_importance_id_fkey" FOREIGN KEY ("importance_id") REFERENCES "lookup_importance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "lookup_matter_destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "lookup_court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "lookup_hearing_action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "lookup_court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_assigned_to_person_id_fkey" FOREIGN KEY ("assigned_to_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "lookup_court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "lookup_matter_destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_actions" ADD CONSTRAINT "task_actions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "admin_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "powers_of_attorney" ADD CONSTRAINT "powers_of_attorney_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_responsible_person_id_fkey" FOREIGN KEY ("responsible_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_letters" ADD CONSTRAINT "fee_letters_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==========================================================================
--  TASK 1.3 — POSTCONDITIONS
--
--  Everything above is generated by Prisma from schema.prisma. Everything
--  below is the part that has to be true and that Prisma cannot know: the
--  raw columns without which a Stage 2 mapping becomes irreversible, and the
--  nullability without which a load would reject rows the firm knows about.
--
--  Written against information_schema rather than against data, because
--  these tables are deliberately EMPTY — Stage 2 fills them. A schema is
--  data too, and it can be asserted.
--
--  Rule 16: these are also in npm run db:check, because an assertion that
--  runs once is a snapshot. This block catches a bad replay on a fresh
--  database; db:check catches drift afterwards.
-- ==========================================================================

DO $CORE$
DECLARE
    n       integer;
    missing text;
BEGIN
    -- ----------------------------------------------------------------------
    --  1. All eleven tables exist
    -- ----------------------------------------------------------------------
    SELECT string_agg(t.name, ', ' ORDER BY t.name) INTO missing
      FROM (VALUES ('lookup_court'), ('clients'), ('client_logos'), ('contacts'),
                   ('matters'), ('hearings'), ('admin_tasks'), ('task_actions'),
                   ('powers_of_attorney'), ('documents'), ('fee_letters')
           ) AS t(name)
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables it
                        WHERE it.table_schema = 'public' AND it.table_name = t.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'task 1.3 tables missing: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  2. THE RAW COLUMNS
    --
    --  D10 and the audit table in docs/MIGRATION.md. Every many-to-one
    --  mapping keeps the original text beside it, or the mapping can never be
    --  reversed or re-derived. Four of these are the ones task 1.3 names; the
    --  rest come from the same audit.
    --
    --  legacy_name_raw on hearing_attendees is NOT here: that table arrives
    --  at task 1.4. All five are asserted together before Stage 2 loads a row.
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO missing
      FROM (VALUES
                -- named by task 1.3
                ('clients',            'legacy_branch_raw'),
                ('hearings',           'legacy_action_raw'),
                ('admin_tasks',        'legacy_assignee_raw'),
                ('powers_of_attorney', 'legacy_lawyers_raw'),
                -- the classification split, 50 + 40 values into four lists
                ('matters',            'legacy_category_raw'),
                ('matters',            'legacy_degree_raw'),
                -- the court list is new and is many-to-one from the start:
                -- ~305 spellings collapse to a cleaned list at task 2.5
                ('matters',            'legacy_court_raw'),
                ('hearings',           'legacy_court_raw'),
                ('admin_tasks',        'legacy_court_raw'),
                -- person-name mappings, the highest-ratio kind in the project
                ('documents',          'legacy_responsible_raw'),
                -- keeps the 36 orphaned parents investigable rather than lost
                ('task_actions',       'legacy_task_id_raw')
           ) AS r(t, c)
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                        WHERE ic.table_schema = 'public'
                          AND ic.table_name = r.t AND ic.column_name = r.c);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'raw columns missing, so a Stage 2 mapping would be irreversible: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  3. A LOAD MUST NEVER BE ABLE TO REJECT A ROW
    --
    --  docs/MIGRATION.md: nothing is deleted, everything is quarantined. The
    --  firm already knows the exact counts — 4 hearings with no matter, 1
    --  power of attorney with no client, 36 task actions whose parent does
    --  not exist and 39 with no parent at all. A NOT NULL on any of these
    --  would turn a known, handled fact into a failed load.
    --
    --  This asserts the ABSENCE of a constraint, which is the kind of thing
    --  that gets added later by someone tidying up.
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO missing
      FROM (VALUES
                ('matters',            'client_id'),
                ('hearings',           'matter_id'),
                ('admin_tasks',        'matter_id'),
                ('task_actions',       'task_id'),
                ('powers_of_attorney', 'client_id'),
                ('contacts',           'client_id'),
                ('documents',          'matter_id'),
                ('fee_letters',        'client_id')
           ) AS r(t, c)
     WHERE EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public'
                      AND ic.table_name = r.t AND ic.column_name = r.c
                      AND ic.is_nullable = 'NO');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'these must stay nullable or Stage 2 would reject rows the firm already knows about: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  4. D9 — the case number is ONE multi-line text field
    --
    --  308 matters hold several case numbers stacked with line breaks. A
    --  character-limited type would truncate them, and truncating the one
    --  identifier a lawyer uses to find a case is the failure D9 exists to
    --  prevent.
    -- ----------------------------------------------------------------------
    SELECT data_type INTO missing FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'matters'
       AND column_name = 'case_number_ar';
    IF missing IS DISTINCT FROM 'text' THEN
        RAISE EXCEPTION 'matters.case_number_ar is %, expected unbounded text (D9)', coalesce(missing, 'absent');
    END IF;

    -- ----------------------------------------------------------------------
    --  5. D15 — a client logo is a FILE, never a column
    --
    --  The table records where the file is. If anyone ever adds a bytea or a
    --  large-object column here, the decision has been quietly reversed and
    --  the backup story (one operation covering database AND folder) no
    --  longer describes reality.
    -- ----------------------------------------------------------------------
    SELECT string_agg(column_name || ' ' || data_type, ', ') INTO missing
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'client_logos'
       AND data_type IN ('bytea', 'oid');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'client_logos holds binary data (%) — D15 says the image is a file on the server, never in the database', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  6. The identifiers that have to be unique
    --
    --  contract_id above all: D3 says Phase 2 invoicing attaches to these
    --  records and the Excel kept in the meantime refers to them by number,
    --  so it must survive migration unchanged AND unambiguous.
    --
    --  legacy_id is unique WHERE PRESENT — PostgreSQL allows many NULLs in a
    --  unique index, so rows the firm creates later simply have none.
    -- ----------------------------------------------------------------------
    SELECT string_agg(r.t || '.' || r.c, ', ' ORDER BY r.t, r.c) INTO missing
      FROM (VALUES
                ('clients',            'legacy_id'),
                ('contacts',           'legacy_id'),
                ('matters',            'legacy_id'),
                ('hearings',           'legacy_id'),
                ('admin_tasks',        'legacy_id'),
                ('task_actions',       'legacy_id'),
                ('powers_of_attorney', 'legacy_id'),
                ('documents',          'legacy_id'),
                ('fee_letters',        'contract_id'),
                ('client_logos',       'client_id')
           ) AS r(t, c)
     WHERE NOT EXISTS (
        SELECT 1
          FROM pg_index i
          JOIN pg_class  tc ON tc.oid = i.indrelid
          JOIN pg_namespace ns ON ns.oid = tc.relnamespace AND ns.nspname = 'public'
          JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = ANY (i.indkey)
         WHERE tc.relname = r.t AND a.attname = r.c
           AND i.indisunique AND i.indnkeyatts = 1);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'these must be unique: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  7. The indexes the 13,279-row table depends on
    --
    --  CLAUDE.md rule 8: a screen that is quick with 20 rows may be unusable
    --  with thousands. These three are what the traced hearing screens and
    --  the dashboard actually filter on.
    -- ----------------------------------------------------------------------
    SELECT string_agg(x.name, ', ' ORDER BY x.name) INTO missing
      FROM (VALUES ('hearings_matter_id_idx'),
                   ('hearings_hearing_date_idx'),
                   ('hearings_next_hearing_date_idx'),
                   ('matters_client_id_idx'),
                   ('admin_tasks_assigned_to_person_id_idx')
           ) AS x(name)
     WHERE NOT EXISTS (SELECT 1 FROM pg_indexes pi
                        WHERE pi.schemaname = 'public' AND pi.indexname = x.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'indexes missing: %', missing;
    END IF;

    -- ----------------------------------------------------------------------
    --  8. Every one of them arrives EMPTY
    --
    --  Stage 2 fills them. If any of these has rows on a fresh replay, the
    --  history has grown a seed nobody intended.
    -- ----------------------------------------------------------------------
    SELECT (SELECT count(*) FROM "lookup_court")
         + (SELECT count(*) FROM "clients")
         + (SELECT count(*) FROM "client_logos")
         + (SELECT count(*) FROM "contacts")
         + (SELECT count(*) FROM "matters")
         + (SELECT count(*) FROM "hearings")
         + (SELECT count(*) FROM "admin_tasks")
         + (SELECT count(*) FROM "task_actions")
         + (SELECT count(*) FROM "powers_of_attorney")
         + (SELECT count(*) FROM "documents")
         + (SELECT count(*) FROM "fee_letters")
      INTO n;
    IF n <> 0 THEN
        RAISE EXCEPTION 'the task 1.3 tables should arrive empty, found % rows', n;
    END IF;

    -- ----------------------------------------------------------------------
    --  9. Nothing that was already true stopped being true
    --
    --  The cascade rule. Adding eleven tables must not have disturbed the
    --  lists or the roster, and a foreign key added in the wrong direction is
    --  exactly the kind of change that would.
    -- ----------------------------------------------------------------------
    SELECT (SELECT count(*) FROM "lookup_matter_type")
         + (SELECT count(*) FROM "lookup_matter_category")
         + (SELECT count(*) FROM "lookup_degree")
         + (SELECT count(*) FROM "lookup_venue")
         + (SELECT count(*) FROM "lookup_importance")
         + (SELECT count(*) FROM "lookup_party_role")
         + (SELECT count(*) FROM "lookup_hearing_action")
         + (SELECT count(*) FROM "lookup_matter_destination")
         + (SELECT count(*) FROM "lookup_client_branch")
      INTO n;
    IF n <> 130 THEN
        RAISE EXCEPTION 'the nine original lists now hold % rows, expected 130', n;
    END IF;

    SELECT count(*) INTO n FROM "people";
    IF n <> 135 THEN RAISE EXCEPTION 'people: %, expected 135', n; END IF;

    SELECT count(*) INTO n FROM "person_name_alias";
    IF n <> 347 THEN RAISE EXCEPTION 'aliases: %, expected 347', n; END IF;

    RAISE NOTICE 'task 1.3: 11 tables, 11 raw columns, 8 nullable links, all empty';
END
$CORE$;
