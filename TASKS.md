# Build order

Work through these **in order**. Each is sized to roughly one session.
Tick a box only when it is committed to git and actually works.

Do not jump ahead. Do not batch several tasks together. If a task turns out to
be bigger than expected, split it and tell the owner.

---

## Stage 0 — Foundations

- [x] **0.1 Repository skeleton**
      Next.js + TypeScript. Prettier and ESLint. `.gitignore` that excludes
      `.env`, `node_modules`, and **any database file or CSV export**. Raw data
      files stay outside Git for repository size, permanent-history,
      reproducibility, integrity and accidental-distribution reasons.

- [x] **0.2 Docker Compose**
      PostgreSQL 16+ with the ICU Arabic collation available. One command must
      bring the database up on Windows and on the Ubuntu server.

- [x] **0.3 Prisma set up, connects, migration runs**

- [x] **0.3a Guard `db:reset`**
      Refuses on a production machine and on a non-local database, with no
      override. Refuses a database that holds rows unless `--force-i-know` is
      typed deliberately, printing which tables have rows and how many.
      All six paths tested by deliberately breaking each one.

- [x] **0.4 Arabic base layout**
      `<html lang="ar" dir="rtl">`, brand colours as CSS variables from
      `docs/BRAND.md`, Noto Naskh Arabic bundled locally. Create
      `src/strings.ts`. Prove RTL works with one simple page.

---

## Stage 1 — Database

- [x] **1.1 Lookup tables + seed**
      Nine lookups, 130 rows, tables never enums (D8). Seeded by the
      migration, not a seed script, so a fresh database on any machine
      arrives complete.
      `matter_type` 14 · `matter_category` 21 · `degree` 12 · `venue` 7 ·
      `importance` 3 · `party_role` 11 · `hearing_action` 20 ·
      `matter_destination` 27 · `client_branch` 15 — **130 rows**
      (was 150; four values merged 21 Aug 2026, migration 0003 → 146;
      then 16 non-branches removed by the branch resolution → 130. See 1.2c)
      Seed generated from the two reviewed SQL files by
      `npm run generate:lookup-seed` — not retyped. Counts asserted in the
      migration and again by `npm run db:check`.
      **Note:** `lookup_team` moved to 1.2 — it references `people`.
      `migration_crosswalk` moved to Stage 2, where its rows come from.

- [x] **1.2 People + aliases**
      138 people · 339 aliases · staff 67 (current 21, former 46) ·
      external 71 · teams 2 (8 members, 5 of them current) ·
      current staff with no team 16. Every figure asserted in the migration
      and again by `npm run db:check`, plus the arithmetic between them.
      Both hamza pairs proved to resolve to one person each.
      `people.email` added — nullable, unique where present, for Milestone 4.
      **Deferred to 2.7:** `migration_multi_person_rule` / `_member` /
      `migration_excluded_name`. The reviewed export initially held 66 member
      rows. Task 2.7 applies the firm's three corrections without deleting any
      valid member and loads the corrected total of 84 — see below.

- [x] **1.2a Alias completeness** — resolved 21 August 2026, migration 0005
      339 → 347 aliases. Six people's own names were missing from the alias
      table, so rule 15's "match through the alias" found nothing for them —
      including سامي إبراهيم خطاب, a Milestone 4 test user. Plus the two
      spacing variants the firm confirmed:
      `محمد عبدالعزيز عبد الحافظ` → `محمد عبد العزيز عبد الحافظ`
      `عبدالرحمن البنا` → `عبد الرحمن البنا`
      Asserted: 347 rows, **zero** people unfindable by their own name, no
      duplicate primaries, no spelling owned by two people.

- [x] **1.2b Three name-variant duplicates merged** — migration 0006
      **people 138 → 135** · staff 67 → 64 · former 46 → 43 ·
      current 21, external 71, aliases 347 all unchanged.

      Not duplicates in the data — an artefact of the generator. The firm's
      workbook had already resolved all four fragments; the generator matched
      each merge target as an exact string, found no such person, and created
      one. See "A merge instruction is Arabic text too" in
      `docs/MIGRATION.md`.

        `احمد عبدالله` → `أحمد عبد الله`  (hamza and the space in عبد الله)
        `احمد فرحات`   → `أحمد فرحات`     (hamza)
        `خالد عطية`    → `خالد عطيه`      (ta marbuta)

      Every spelling moved, none dropped. The migration refuses to merge two
      names that are not identical once normalised, so a mistyped row cannot
      merge two genuinely different people.

- [x] **1.2c Client branch resolved** — 21 August 2026, migration 0007
      **`client_branch` 31 → 15 · lookups 146 → 130 · crosswalk 4 → 20.**
      Decision **D19**: a branch is a site or subsidiary of a client, nothing
      else. Source: `sql/client-branch-resolution.sql`.

      Done before 1.3 deliberately. Task 1.3 creates `clients.legacy_branch_raw`,
      and the branch mapping is what that column exists to protect; correcting
      the list afterwards would mean correcting a table already built on it.

      The 16 values that were not branches each got a `migration_crosswalk`
      row, so Stage 2 still maps the old text: 9 to `matter_category`, 1 to
      `matter_type`, 1 to `degree`, 1 quarantined, 3 flagged as separate
      clients, 2 discarded. The `جنح → الجنح → جنح` chain was collapsed to one
      step.

      `المنطقة الحرة` **is a branch** — the third site of أدخنة النخلة, 193
      matters. An earlier note had it moving to `venue`; the firm corrected
      that and `lookup_venue` stays at 7. The migration asserts that.

      **One field corrected, and since confirmed:** `آراء قانونية` was given
      as `matter_category → رأي قانوني`, but that value is a `matter_type`,
      not a category. Applied as `matter_type`; the firm confirmed the same
      day — a legal opinion is a kind of work (D8), and `رأي قانوني` is
      distinct from `استشارات`. **No new practice area was created.** The
      `reviewer_note` records the confirmation, migration 0008.

      Counts were counted, not trusted: 15 + 16 = 31 byte-exact against the
      seeded rows, both directions, no duplicates. See "A count in an
      instruction is a claim, not a fact" in `docs/MIGRATION.md`.

      Four assertions proved by deliberately breaking them, each rolled back:
      a misspelled KEEP value, a short DELETE list, the `matter_category`
      target as originally stated, and a misspelled `target_field`.

- [x] **1.2d Stage 1 review findings closed** — 21 August 2026, migrations
      0009 and 0010. From the Codex review of Stage 1; all four were real.

      **Two people had two primary aliases each** — أحمد عبد الله and
      أحمد فرحات. Migration 0005 asserted nobody did; 0006 moved the phantom
      people's primary aliases onto the survivors without demoting them and
      never re-checked. All 17 checks passed while it was wrong.
      Both demoted, neither deleted — the spellings still resolve.
      **A partial unique index now makes a second primary impossible**, and
      `db:check` asserts the invariant, that the primary equals the person's
      own name, and that the index still exists.

      **The checks counted mappings but never verified them.** Nothing proved
      that a spelling pointed at the right person or a crosswalk rule at the
      right target — repoint `دعاوى عمالية` from `عمال` to `مدني` and every
      check still passed. **`scripts/baselines/reviewed-links.json`** now
      records all 347 alias links and 20 crosswalk rules; `db:check` proves
      each still holds. Adding links is allowed, changing one fails by name.
      Deliberate change: `npm run baseline:write -- --accept-changes`.

      **Team reviewers were matched on `people.name_ar`**, not through the
      alias table, in a migration whose own comment claimed otherwise — D5 and
      rule 15. The migration is history, so **0010 asserts the result**: two
      teams, the exact 4 + 4 membership as a set, and the reviewer named.
      Both teams' reviewer is `ناجي رمضان` — that is what Access recorded, not
      an error.

      **`schema.prisma` still said 146 / 138 / 339.** Corrected to 130 / 135 /
      347. The cascade rule, again.

      **Every one-time assertion in migrations 0001–0008 was then audited** —
      could a later migration break it without anything noticing? Three gaps,
      all closed above; everything else was already a constraint or a standing
      check. Audit table in `docs/MIGRATION.md`. **New rule 16 in
      `CLAUDE.md`.**
      db:check 17 → **21 checks**. Each new one proved by breaking it.

- [x] **1.3 Core schema** — 22 August 2026, migration 0011
      **11 tables, all empty.** clients, client_logos, contacts, matters,
      hearings, admin_tasks, task_actions, powers_of_attorney, documents,
      fee_letters — plus **`lookup_court`**, a tenth list (**D20**).
      `client_logos` was built here rather than left homeless: it is a child
      of clients and task 2.11 needs it.

      **Four of the five `_raw` columns are in**, with seven more from the
      same audit — 11 in total, asserted by the migration and by `db:check`:
        `clients.legacy_branch_raw`         — 32 branches resolved to 15
        `hearings.legacy_action_raw`        — 23 actions merged to 20
        `admin_tasks.legacy_assignee_raw`   — a typed name
        `powers_of_attorney.legacy_lawyers_raw` — up to twelve names per field
        `matters.legacy_category_raw` / `legacy_degree_raw` — 50 + 40 values
        `matters`/`hearings`/`admin_tasks`.`legacy_court_raw` — **new**, ~305
              court spellings clean up to a list at 2.5, so the court is a
              many-to-one mapping from the start
        `documents.legacy_responsible_raw`, `task_actions.legacy_task_id_raw`
      **The fifth, `hearing_attendees.legacy_name_raw`, arrives with its table
      at task 1.4** — that table is not built until then. All five are
      asserted together before Stage 2 loads a row.

      **D20** court is a list, circuit is text. **D21** court detail columns
      stay on the matter. `legacy_id` on every migrated table, unique where
      present, so Gate 4 can reconcile row for row.

- [x] **1.3a The four missing column lists** — 22 August 2026, migration 0012
      `contacts` (17), `powers_of_attorney` (15), `fee_letters` (10) and
      `task_actions` (7) were built at 1.3 with their keys only, because their
      Access column lists had never been written down and nothing was
      invented. The firm supplied them, **with the fill rate of every column**.

      Every rate is recorded in `docs/DATA-MODEL.md` beside its column, and
      the rule is now general: **a fill rate is a design fact.**
      `Home Phone` 1% (one row), `Status` 1% (three rows) and
      `الموعد القادم` 0% (seven rows) are migrated and **never surfaced** — a
      screen built on any of them would be blank almost always.

      **`القائم بالعمل` is a FOURTH person-name mapping** (96% of 4,130 rows)
      and gets `legacy_performed_by_raw`, the same as the other three. Raw
      columns 11 → 12.

      `contacts.name_ar` / `name_en` were placeholders and are **dropped** —
      Access has `Contact1` (97%) and `Full_name` (10%), and neither is what
      those names implied. `contacts.attachments` is **not created**: it looks
      100% populated and holds zero files (D11). `db:check` asserts all three
      are absent, which a presence check cannot see.

      **`جرد` is settled — 23 August 2026, source: the firm's litigation
      assistant.** It is a checkbox controlling whether the record appears on
      the POA list report, not a fact about the power of attorney. Migrated as
      `show_on_poa_report`. **Two POA column names still need the firm** —
      `الصفة` against `صفة الموكل بالتوكيل`, and `حرف`. Not in
      `docs/GLOSSARY.md`, so translated literally with the Arabic source
      recorded against each. Renaming an empty table costs nothing.
      db:check 24 → **25 checks**.

      Six assertions proved by breaking them: a dropped `_raw` column, a
      `NOT NULL` on a link that must stay nullable, a binary column on
      `client_logos` (D15), `case_number_ar` narrowed to `varchar(50)` (D9), a
      dropped hearings index, and a lost `contract_id` unique.
      db:check 21 → **24 checks**.

- [x] **1.4 Junction tables** — 22 August 2026, migration 0013
      matter_lawyers, matter_parties, matter_party_roles, hearing_attendees,
      fee_letter_matters. **All empty**; Stage 2 fills them at 2.7–2.9.

      **The five `_raw` columns task 1.3 required are now all present and
      asserted together** — `hearing_attendees.legacy_name_raw` was the fifth
      and could not exist until its table did. 373 spellings collapse to 135
      people, the highest-ratio mapping in the project. Plus
      `matter_lawyers.legacy_source`, `matter_parties.legacy_raw` and
      `fee_letter_matters.legacy_matter_ref`. **16 raw columns in total.**

      **Four constraints Prisma cannot express, so all raw SQL:**
        `matter_lawyers.role`     CHECK lead / co_lead / support
        `matter_parties.side`     CHECK client / opponent
        `matter_parties.gender`   CHECK NULL / m / f
        **at most one `lead` per matter** — a partial unique index
      Not lookup tables, because nobody adds a lawyer role or a third side to
      a case without a code change — the opposite of D8's case for courts.
      `db:check` asserts all four exist, since `schema.prisma` cannot see them.

      **One lead per matter is the ONE constraint that can stop a Stage 2
      load, deliberately.** Two leads cannot come from the source — `lawyerA`
      and `lawyerB` are separate columns — so only a transform bug produces
      it. If it fires: quarantine the matter and ask the firm. Do not relax it.

      Proved by breaking: two leads refused, an invented role refused, a third
      `side` refused, a bad gender refused — and, from the other direction, a
      `co_lead` alongside a `lead` allowed and a NULL gender allowed, so the
      constraints do not over-reach. Nothing left behind.
      db:check 25 → **26 checks**.

- [x] **1.5 Billing + deferred tables** — 22 August 2026, migration 0015
      invoices, payments, invoice_allocations, attendance. **All empty**, with
      correct keys and no screens (D3). Read-only for every role including the
      Administrator (D4), visible to all four roles (D14).

      **Money is `numeric`, never floating point, and asserted to be.** A
      double cannot hold 0.1 exactly, so summing 597 payments in one gives a
      total that is close and wrong — in a report a partner sends to a client.
      Gate 4 reconciles totals against Access, which only means something if
      both sides add up exactly. `currency` survives on both tables because
      Gate 4 reconciles **per currency**.

      **`Pay-Date` is asserted ABSENT** (D4) — it stopped in Sept 2019 and
      holds 126 stale values the payments table supersedes. A presence check
      cannot see that.

      **Shares on one invoice must sum to 1.** That is a rule across rows, so
      no CHECK can express it: it lives in `db:check`, vacuously true today
      and meaningful from the first Phase 2 split. A single share is
      constrained to 0–1, which catches a percentage typed as 50.

      `attendance` is the **staff leave register**, not meeting attendance —
      D2 drops those entirely. Its person link is a fifth person-name mapping
      and gets `legacy_person_raw`.

- [x] **1.5a The billing column lists** — 22 August 2026, migration 0017
      `الفواتير` (14), `السداد` (7), `Attendance` (4), `تقسيم التحصيلات` (5),
      with fill rates, plus **three Latin lookups** seeded 5 / 2 / 4 from
      `sql/billing-lookups.sql`.

      **Three columns I invented at 1.5 are dropped, and their absence
      asserted:**
        `invoices.client_id`   — `الفواتير` has `contractID`, not `clientID`.
              An invoice attaches to a **fee letter**, which is the link
              **D3** requires; the client comes through it.
        `payments.amount`      — `السداد` has `Credit` and `Debit`. Two.
        `attendance.status`    — `AttSituation` is a free-text daily log.

      **Two NOT NULLs would have rejected rows at Stage 2.**
      `invoice_allocations.person_id` and `.invoice_id` are now nullable.
      `Lawyer` holds **English** names — the only Latin person column in the
      database — resolved through `people.name_en`, **not** the alias table.
      Where `name_en` is null the row quarantines.

      `Percent` is a percentage and `share` is a fraction; Stage 2 divides by
      100 and keeps `legacy_percent_raw`. `AttSituation` keeps a raw partner
      so a Phase 2 case-fold stays reversible.
      **Arabic labels for the three Latin lookups are NOT invented** — they
      are financial terms (rule 5) and are needed before task 4.8, not before
      Stage 2. `db:check` asserts none has been filled in.

- [x] **1.6 Arabic search** — 22 August 2026, migration 0016
      **`ar_normalise(text)`** — one database function, the only definition of
      "normalised" in the system. The inline copies in `db:check` and
      migration 0006 are gone; two copies of a rule that must never disagree
      is one too many.

      Seven shadow columns, seven **triggers**, six `pg_trgm` GIN indexes.
      **Triggers, not generated columns:** Prisma does not know about
      generated columns, would include them in every INSERT, and PostgreSQL
      refuses that — the application would fail on every create. A trigger is
      invisible to Prisma the way a CHECK constraint is, so the shadow column
      stays an ordinary column Prisma can filter on while the database
      guarantees its content. Proved: an application writing rubbish into the
      shadow column is overruled.

      **`احمد` finds `أحمد`**, and so do ta marbuta, alef maqsura, tatweel,
      diacritics, Arabic-Indic digits, Latin case and the compound-name space.

      **The `J → ق` fold was REMOVED on 23 August 2026** (migration 0020). It
      was the second named test, and it was wrong: the fold applied to every
      field, so the real client **JTI** normalised to `قTI`. Both case-year
      spellings stay findable by their own form. `db:check` asserts `JTI`
      survives as `jti` and that `140J` does **not** equal `140ق`, so
      reinstating the fold fails loudly rather than looking like a fix.

      **The negative tests matter more, and are asserted in the migration and
      in `db:check`:** a dropped middle name is NEVER folded
      (`سامي خطاب` ≠ `سامي إبراهيم خطاب`), `تحكيم` ≠ `تحقيق`, `طاعن` ≠
      `متظلم`, `أول درجة` ≠ `ابتدائي`. Every fold is a merge, and a fold that
      is right 95% of the time merges two people the other 5%.
      The 135 roster names are asserted to remain 135 DISTINCT normalised
      names — the check that caught the three duplicates at 1.2b, now standing
      guard over the fold itself.
      db:check 26 → **31 checks**.

---

## Stage 2 — Migration

Follow `docs/MIGRATION.md` exactly. Do not shortcut the gates.

**Every gate must be proved before it is trusted:** break something on purpose,
confirm the gate catches it, and record what was broken and what it said. See
"Prove the check catches a failure" in `docs/MIGRATION.md`. A gate that has
only ever seen good data is not known to work.

- [x] **2.1 Extract** — run `scripts/01_extract_access.ps1`. **Done 23 August 2026.**
      **Gate 1: attachments and multi-value entries must both be > 0.**
      If either is zero, stop — that is the signature of the silent-failure
      export (D11).

      **✅ Both preconditions are cleared.**
      `docs/STAGE-2-PLAN.md` was **approved by Khaled Helmy, 23 August 2026**;
      the firm returned five corrections and all five are applied.
      The machine was verified on 23 August 2026 rather than taken on trust:

        source copy   "D:\chatGPT\Litigation-Database\migration-source\Litigation database (ID 23194).accdb"
                      resolves · 46,661,632 bytes · modified 23 Aug 2026 10:31
        Access        Microsoft Access 2021, 64-bit
        DAO COM       DAO.DBEngine.120 v16.0 creates successfully under BOTH
                      Windows PowerShell 5.1 (64-bit) and PowerShell 7.6.5
                      (64-bit). Run 64-bit to match Access.

      **Both files are compacted** — the copy is 46,661,632 bytes. The firm
      compacted the production file and the copy on 23 August 2026. The 2 GB
      ceiling is **history, not a current risk**; see `docs/MIGRATION.md`.

      **THE SOURCE IS A REHEARSAL COPY AND HAS ALREADY DRIFTED.** It was taken
      on 23 August 2026; the live file moves about 100 records a day. **The
      19 August figures are a shape check, not a pass condition** — ruled by
      the firm, 23 August 2026.

      **This task must change the script before running it.**
      `scripts/01_extract_access.ps1` today hard-asserts the 19 August counts
      and exits non-zero on any mismatch, which would refuse a perfectly good
      extraction. Gate 1 becomes: every table self-consistent (written =
      read, SHA-256 recorded), all 15 tables present and non-empty, complex
      columns > 0, zero warnings — with each count *reported* beside its
      August figure and the difference shown. A count that has **fallen** is
      not drift and goes to the firm.
      Full rule: "What Gate 1 actually asserts" in `docs/MIGRATION.md`.
      Cascade: **30,553 and 35,343 also move.** Gate 4 (task 2.12) reconciles
      the *identity* — migrated + archived = every row — against the file
      actually extracted, never against the constants.

      **Result — Gate 1 PASSED, 23 August 2026.**
      Source `Litigation database (ID 23194).accdb` · 46,661,632 bytes ·
      modified 2026-08-23T07:31:52Z · SHA-256 `40EBF988…5979`. All four are
      recorded in `_migration/meta/manifest.csv`, so "which extraction
      produced this?" has an answer that is not anyone's memory.

      **30,847 rows over the 15 migrated tables** (+294 on 19 August, about
      74 a day over four days) · **30,885 over all 17 extracted** ·
      **54 attachments** · **288 multi-value entries across 195 parents** ·
      **17 relationship field-pairs** · **zero warnings**. Every count is up
      or flat; nothing has fallen. Every CSV was read back off the disk and
      parsed, and the records that came out matched the rows read from
      Access, columns intact. All 54 logo files are on disk, none empty.

      **The gate expects 17 tables in two named groups, not 15.** It was
      policing the extraction set with the migration set, and those are
      different questions. `المحامين` (38) and `LawyerShare4Invoices` (0) are
      *reference-only*: extracted, never migrated. `المحامين` is the enforced
      parent of `الدعاوى.lawyerA` and `.lawyerB` — drop it and task 2.7 has
      nothing to expand the lawyer-combination strings from. See D5's
      clarification of 23 August 2026. `LawyerShare4Invoices` is asserted at
      **exactly 0**, not exempted, so a row appearing there fails the gate.

      Output is in `_migration/` — 9.8 MB, gitignored, never committed.

- [x] **2.2 Staging schema** — every source column `text`, plus durable provenance.
      **Done 23 August 2026, migration 0024.**

      **20 tables · 204 source columns, all `text`** — 17 extracted plus 3 for
      the complex columns. Its own PostgreSQL schema, `staging`; Prisma's
      datasource is `public`, so `migrate dev` reports in sync and leaves it
      alone.

      **Generated from the extraction's own `meta/columns.csv`, never typed:**
      `npm run generate:staging-schema -- prisma/migrations/<folder>/migration.sql`.
      191 Arabic column names retyped by hand is where a silent error enters.
      The generator cross-checks the dictionary against the manifest — two
      independent counts — and refuses to write anything if they disagree, or
      if an identifier exceeds the 63 bytes PostgreSQL silently truncates at.
      The migration records the source path, size, modification date and
      SHA-256 of the extraction it describes.

      **Nothing in staging can refuse a row.** Every source column `text`,
      nullable, no default, no check, no foreign key. Each of those would turn
      a bad date into a lost row. The only constraint is the primary key on
      `(src_file, src_row_num)`, which is ours and cannot fail on the firm's
      data — it makes loading the same file twice an error instead of a silent
      doubling. Correction A on 24 August added `src_record_key` (a complete-row
      hash, with NULL distinct from empty text) and `src_extraction_sha256` to
      every table. The old filename and row number remain trace information;
      they are no longer treated as identity. `npm run db:check` recomputes
      every key and verifies all 20 unique indexes (rule 16). Five original
      staging-shape checks still re-prove the loading-dock rules, and
      all five were proved to fire against a deliberately wrong table.

      **Column names verbatim** — `الموقف الحالي`, `Cash/probono`, `Inv-No`.
      Renaming happens at transform, stage D.

      **NULL and `''` proved distinct**, not assumed: `npm run test:staging-copy`.
      A bare empty field arrives as NULL, a quoted `""` as the empty string.
      Also proved: Arabic, an embedded comma, an embedded **newline**, a
      doubled quote and trailing spaces all survive. Both failure modes of the
      check itself were proved — a wrong assertion (psql exit 3) and *deleted*
      assertions (psql exit **0**, caught by counting the `PROVED` notices).

- [x] **2.3 Load to staging** — Gate 2: counts match the manifest.
      **Done 23 August 2026. GATE 2 PASSED.**

      `npm run load:staging` — 20 files, **31,227 rows staged**: 30,885 over
      the 17 extracted tables (the figure Gate 1 reported) plus 342 from the
      complex columns, 54 logos and 288 multi-value entries.

      The load and Gate 2 run in **one transaction**, so a failure rolls the
      whole thing back rather than leaving a plausible-looking half-load.

      **Gate 2 asserts:** per-table staged rows = manifest rows, exactly;
      `src_row_num` runs 1..n with no gaps or repeats and one `src_file` per
      table; three totals each labelled with how many tables it covers, with
      the extracted-table subtotal tied to `summary.total_rows` — a figure the
      extraction recorded independently; **193,445 NULL cells and 2
      empty-string cells** across all 204 source columns; all 20 tables carry
      `src_file`, `src_row_num`, a durable record key and the source
      fingerprint. Eight proofs, counted rather than assumed.

      **`src_row_num` is the CSV record ordinal**, counted by the loader as it
      streams — never insertion order, per the firm's ruling. Records, not
      lines: a memo field here can contain a newline.

      **NULL versus `''` is 193,445 against 2.** Both empty strings are in
      `العملاء."Cash/probono"`. The loader reads field values for validation and
      hashing but passes each record's original CSV text through unchanged after
      the four provenance fields. Re-encoding the source fields would have lost
      both cells without moving a single count.

      **A real bug the header check caught**, before any row was loaded: the
      loader's scanner appended the CR of every CRLF to the last field of every
      record. Fifteen column names that printed identically and compared
      unequal. Every `matterID` would have arrived with an invisible carriage
      return.

      **`npm run test:guard` now has its own throwaway database**, created and
      destroyed per run — `guard_test_<pid>_<time>` on the same local server,
      because several cases exist to prove the guard cannot destroy one
      database while inspecting another in the same container. Its 10 guard
      cases and 12 parser cases — 22 in all — run again; they had not run since
      task 1.1. Rule 14's
      check is narrowed to the two databases the suite writes to, not weakened.
      The one destructive statement refuses unless the name carries the
      throwaway prefix **and** differs from the project database — both, not
      either — and the drop runs in a `finally` so a failed run leaves nothing
      behind.

      **One case is reduced, and it is a decision for the firm.** The guard
      protects the **volume**, not a database: `docker compose down -v`
      destroys every database in it at once, which is why the guard enumerates
      all of them and refuses if any holds rows. So on this machine the guard
      *must* refuse, and the one case proving it ever **allows** a reset cannot
      be proved. It now runs in reduced form — it asserts the guard passed all
      six earlier checks and refused **only** because the volume is not empty,
      which still catches a guard that refuses everything — and the suite says
      so rather than reporting a pass it has not earned.

      Fully proving it needs a throwaway **cluster**: a second compose service
      with its own volume, and `db-reset.ts` able to be pointed at it. That
      puts a service-selecting override into the most safety-critical script in
      the project. **Not built. The firm decides.**

- [x] **2.4 Quarantine tables + profiling** — Gate 3.
      **Done 23 August 2026, migrations 0025 and 0026. GATE 3 PASSED.**

      **25,755 clean · 5,472 quarantined · 0 excluded, of 31,227 staged.**
      Five proofs, counted rather than assumed.

      Three quarantine tables — `finding` (one deviation, one row, original
      text intact), `exclusion` (with the reason **and** who decided), and
      `review_value` (one row per distinct value needing an answer).
      `npm run profile:staging` is re-runnable: findings are rebuilt,
      the firm's answers are upserted around and never touched, and a
      trigger refuses the rebuild the moment any answer exists.

      **Two expected volumes were measured against the wrong column, and both
      collapse.** `الدعاوى.[خطاب الأتعاب]` — expected 289 orphans of 412,
      found **0**: the column carries two key spaces, 289 resolving by
      `contractID` and 123 by `mfilesID`, none by both, none by neither.
      `خطابات الأتعاب.Matter` — expected 288, found **32**: the entries are
      case numbers matching `matterAR`, not `matterID`. A join that fails for
      *every* row is evidence about the join, not the data.

      **The workbook: 7 visible sheets plus one very-hidden identity contract,
      RTL, colour-coded by computed confidence, read back and verified after
      writing** — proved to catch a failure by
      writing the sheets left-to-right. `**` appears in 4,132 hearings and is
      asked about **once**, not 4,132 times.

      db:check 41 → **46 checks**.

      **The review list ships as XLSX workbooks, one sheet per topic — not a
      flat list.** Ruled by the firm, 23 August 2026.

      The ~474 attendee names are the largest sheet and the reason for the
      rule: nobody can identify `م. أحمد` from the string alone. Every row
      carries **occurrence count, years, matters, clients, nearest roster
      matches with a closeness score**, and three columns for the firm's
      answer — enough to decide **without opening Access**.

      **Colour-coded by confidence.** Answered with a long-serving colleague
      present, because most of this is institutional memory.
      **Anything neither of them recognises is marked "unknown person" —
      never guessed** (rule 4, rule 15). That is a correct permanent answer,
      not a gap to infer later.

      ExcelJS with `rightToLeft` on every sheet, as at task 6.1.
      Detail: "Gate 3 ships as XLSX workbooks" in `docs/MIGRATION.md`.

      **Correction A, 24 August 2026 — review answers now have durable source
      identity.** Every new workbook carries one source-extraction fingerprint
      and a checksum over the complete, very-hidden identity manifest. A
      finding is matched by its complete-row source key, never its CSV filename
      or row position. Every expected sheet, visible row, hidden identity and
      answer is mandatory; the importer validates the complete file before it
      writes, then applies all answers in one serializable transaction. A late
      failure rolls back every earlier answer.

      The exact 23 August workbook predates that contract. Its 744 associations
      were captured once only after its 668 value answers and 76 finding answers
      matched the database byte for byte. Those historic workbook ids are now
      unique and immutable. `npm run db:check` protects their exact association
      digest as well as the original answer digest. `npm run test:review-import`
      proves reordered source rows, missing sheets, missing and blank answers,
      wrong identities, and a forced late database failure are all refused.
      `db:check` is now **55 checks**.

      **Correction B, 24 August 2026 — compound attendee decomposition is
      fixture-proven, not applied to live migration data.** Read-only
      inspection found 12,732 non-empty attendee cells: 713 contain line
      breaks, 650 contain digits, 378 use Arabic commas and 9 contain blank
      lines. The current profiler scores each complete cell, which is why a
      placeholder, date and known name stacked on three lines looked like one
      unknown name.

      `npm run test:attendee-decomposition` covers **30 before/after fixture
      classes with 1,198 assertions**. The complete cell remains immutable and
      fingerprinted; every output span keeps its exact text, line, offsets,
      sequence, separating rule and durable source-record identity. Only an
      exact supplied alias can become a person. Dates must be real calendar
      dates, titles/placeholders/notes/roles come from explicit ruled lists,
      and overlapping rules fail. Arabic `و`, a known name embedded in prose,
      an invalid date and every unrecognised fragment remain marked for
      review. Reordering filenames or rows does not change cell or fragment
      ids, and applying the same result twice is a no-op.

      This correction added **no migration, database table or live transform**.
      Staging, the 744 review answers and `hearing_attendees` were not changed.
      Applying it is a separate owner-authorised procedure immediately before
      task 2.8; that procedure and its reconciliation gates are recorded in
      `docs/MIGRATION.md`.

- [x] **2.5 Transform: people, lookups, clients, contacts**
      **Clients and contacts done 23 August 2026, migration 0027.**
      People and lookups were already seeded at 1.1/1.2 and 2.5's court work
      landed at migrations 0022/0023.

      `npm run transform:clients` — **318 clients, 188 contacts**, in one
      transaction with seven assertions inside it. Every figure is compared
      against **staging**, never against a number written down here: 318 and
      188 drift with the firm's file, "the target equals what was staged" does
      not.

      **The two empty strings arrived.** `Cash/probono` holds `''` on two
      clients — typed and cleared — against 316 with a value and **zero**
      never-entered. That is the NULL-versus-`''` chain complete from Access
      to the target table, and `db:check` re-proves it every run. A transform
      that trimmed or coalesced would have made those two indistinguishable
      from "never entered", and nothing would have looked wrong.

      **`contactLawyer` preserved byte for byte** in the new
      `clients.legacy_contact_lawyer_raw` — asserted as *identical to
      staging*, not merely present, because a count is satisfied by 123
      trimmed values.

      **THREE THINGS ARE DELIBERATELY NOT SET, and `db:check` asserts they
      stay empty** so a later transform cannot quietly fill one in:

      1. **`branch_id` / `legacy_branch_raw`** — the source column is on the
         **matter**, and 8 of the 12 clients with any branch have several
         (أدخنة النخلة has eight). One column on the client cannot hold them,
         and `legacy_branch_raw` could keep only one of eight original texts,
         which breaks the `_raw` rule outright. **Blocks part of 2.6.**
      2. **`contact_person_id`** — a field of the new model; Access has no
         equivalent. Picking one of a client's contacts would be inventing
         data (rule 4).
      3. **`cash_or_probono` is stored as typed** — `Probono` 30 and
         `probono` 5 are almost certainly one value, and "almost certainly" is
         not a licence to merge. محكمة/محكمه/مجكمة looked equally obvious and
         needed the firm.

      All three are on the `أسئلة عامة` sheet of the review workbook, which is
      now 4 questions.

      **Note for every later transform:** `updated_at` has no database default
      — Prisma's `@updatedAt` is applied by the client — so a raw `INSERT`
      that omits it fails on NOT NULL. Every transform must set it.

      db:check 46 → **51 checks**.

      **`lookup_court` is reviewed and ready to seed — BLOCKED on one row.**
      `sql/lookup-court-and-crosswalk.sql` holds the firm's review of all 401
      distinct court names: 307 KEEP, 52 MERGE, 35 SPLIT, 7 WRONG, giving 309
      courts and 94 crosswalk rules. Generate it with
      `npm run generate:court-seed -- <new migration.sql>`; never retype it.

      **`القضاء الإداري` and `القضاء الإداري بالعباسية` are DIFFERENT courts** —
      different buildings, deliberately kept apart (**D22**). The earlier guess
      that they might be one court with a location suffix was wrong.

      **APPLIED 23 August 2026, migration 0022. 308 courts, 94 rules.**

      **308, not the stated 309.** `هيئة الاستثمار` was in the list *and* a
      merge source *and* a SPLIT's court part — a two-step chain, the same
      fault as `جنح` at 1.2c. **My generator's bug, not the firm's review:** it
      took the split's court part into the list without checking whether that
      string was itself a merge source. Every split's court part now resolves
      through the merge map first. Counted independently before applying — the
      fifth time a stated count was wrong while its list was right.

      The seven WRONG values are settled: five are destinations (four added,
      `matter_destination` 27 → 31).

      **`26` IS A CIRCUIT, NOT RUBBISH — corrected 23 August 2026, migration
      0023.** The firm re-read the row. That row in `admin work table` has
      **no circuit recorded**; somebody typed the circuit number into the
      court box. So:

        circuit  =  26          the value lands, in the right column
        court    =  UNKNOWN     genuinely null. NOT court `26`, not inferred.

      **ONE COURT DISCARD, NOT TWO.** Only `/` — and that row *already* has a
      real circuit, `الاثنين مدني (ه)`, which is what shows `/` was a
      placeholder typed where a court name should have gone. The two rows
      look alike and are not alike.

      **This needed a new KIND of crosswalk rule — the first TEXT TARGET.**
      A circuit is text by **D20** and deliberately not a list (1,281 values:
      a number plus a specialism), so there is nothing to resolve against.
      `target_field = 'circuit'` is recognised, never resolved against a
      list, and **must carry a non-empty `target_value`**. That requirement
      is the point: a kind merely *exempt* from resolving would let a rule
      carrying nothing pass both the unrecognised and the dangling check and
      look healthy — the fault in "An assertion tests what it looks at" in
      `docs/MIGRATION.md`.

      Both halves are asserted, in the migration and permanently in
      `db:check` (rule 16): the circuit lands **with its value**, and `26` is
      absent from `lookup_court` so the raw text cannot resolve to a court by
      the ordinary path and reintroduce `court = '26'` by the back door. Plus
      exactly one court discard, asserted in both directions.
      db:check 35 → **36 checks**.

      Proved by breaking, five ways, each restored: a circuit rule with no
      value (caught twice over), `26` put back to a discard, `26` inserted
      into `lookup_court`, a misspelled `circuits`, and the `/` discard
      turned into something else. The baseline also refused the change by
      name — `court/26: now points at circuit/26` — and was rewritten
      deliberately in its own commit.

      Both keep their original text in `legacy_court_raw` (D10).

      `db:check` now asserts permanently that **no lookup value is also a
      crosswalk source**, however it reached the list. Proved by reinserting
      the artefact.

      **RULE (a) — NEVER OVERWRITE AN EXISTING `matter_category`.** Nine of
      the branch values resolved by **D19** move into `matter_category`. Where
      a matter already has one, **quarantine the conflict** for the firm — do
      not replace it and do not silently keep the old one. Either way the
      original branch text stays in `matters.legacy_branch_raw`.
      Every affected `migration_crosswalk` row carries this in its
      `reviewer_note`.

- [x] **2.6 Transform: matters** — including the four classification columns via
      the crosswalk, and `legacy_*_raw` preserved.

      **Completed 24 August 2026.** All 1,744 staged matters have exactly one
      durable outcome: **1,689 transformed and 55 quarantined**. The 55 are
      18 unreviewed importance values, 14 `separate_client` cases, 10 branches
      requiring review, 5 category conflicts, 4 type conflicts, 3 court
      remainders that belong on a hearing note, and 1 matter with no client.
      No reasons overlap in the current data.

      The transform loads the 90 firm-reviewed `matterCategory` / `matterDegree`
      rules from `sql/lookups-and-crosswalk.sql`; it never retypes those
      mappings. The reviewed-link baseline protects both their destinations
      and operational split notes. It preserves the four mapped source values
      byte for byte and keeps all 38 source columns in a complete JSONB audit
      payload. The write is one serializable transaction. A forced failure
      after all assertions left zero rows, and a live rerun reproduced the same
      result digest and timestamps without an update or duplicate. `npm run
      db:check` now rebuilds expected destinations from the reviewed crosswalk
      and checks the partition, clients, mappings, raw values, payloads,
      constraints, indexes and quarantine protection permanently.

      **Post-review correction, 24 August 2026.** The permanent check now
      compares all 26 application-facing direct and typed matter fields
      independently against staging, rather than treating the complete JSON
      payload as proof that each target column was filled correctly. It also
      rebuilds every quarantine reason and detail from staging and the reviewed
      rules, checks every trace/evidence field, and validates the definitions
      and events of the source-identity constraint, unique index, branch
      foreign key and quarantine triggers/functions. The isolated fixture
      proves it catches swapped notes, a changed typed date, a changed source
      fingerprint, wrong reasons/details and changed quarantine trace data;
      every deliberate change is rolled back before the fixture database is
      dropped.

      **QUESTION FOR ONCE THE DATA HAS LANDED: split the circuit?**
      `circuit` is text by **D20**. The planning evidence came from 1,281
      distinct hearing values, many of them a circuit number plus a specialism
      (`1 عمال`, `12 عمال`, `8 تجاري`, `7 استئناف`, `4 أفراد`), varying by
      court. Splitting the matter values into number + specialism might improve
      filtering. **Do not attempt it before the values are loaded** — decide it
      with them in front of you.

      **Evaluated after loading. Recommendation: keep `circuit` as text for
      now, as D20 says.** Only 255 of 1,689 transformed matters have a circuit,
      across 122 exact values. 193 rows begin with a number and could be split
      mechanically, but they already contain **31** different suffixes, not
      the expected 15. The other 62 rows do not begin with a number at all;
      examples include `مدني`, `جنح`, weekday descriptions, committee names
      and text naming a chairperson. A partial split today would create two
      incomplete fields while every report still needs the original text.
      Reconsider only if the firm needs circuit-wide filtering; that would
      first require review of the 62 non-number-led rows and the 31 suffixes.

      **RULE (b) — THE THREE `separate_client` VALUES ARE A CORRECTNESS
      PROBLEM, NOT A MIS-LABEL.** `سيجما للإعلام (تليفزيون الحياة)`,
      `ألفا مصر للتجارة` and `سيجما للصناعات الدوائية` are clients in their
      own right. **Any matter carrying one of them is attached to the WRONG
      CLIENT ENTIRELY.** Quarantine those matters. **Do not guess which client
      they belong to** — the firm decides. `npm run db:check` asserts all
      three rules are present so one cannot quietly go missing.

      Rule (a) applies here too, for any branch value that reaches a matter.

- [x] **2.7 Transform: matter_lawyers and matter_parties**
      Split the combination strings using the rules in
      `migration_multi_person_rule`.

      **Load the three deferred tables here** — `migration_multi_person_rule`
      (33), `_member` (**84 corrected**) and `migration_excluded_name` (38).
      The 66 figure is the pre-repair export: Rule 1 gained 6, Rule 2 gained
      5, and Rule 3's one malformed pseudo-member became 8 (+7 net), so no
      other valid member was removed to preserve the stale total.

      **THREE RULES ARE MIS-PARSED IN THE SOURCE — corrected membership below,
      supplied by the firm 21 August 2026.** The firm's review notes were
      correct throughout; the extractor lost them. Two rules had a missing
      closing bracket so the capture returned nothing and they have **no
      members at all**; a third used `-` as its separator so the whole string
      came through as one name. The review notes described 8 + 2 + 1 historic
      occurrences; the current extraction instead contains **8 / 0 / 1 in
      the POA source and 0 / 0 / 0 in matter lawyer columns**. Rule 2 remains
      intentionally as a reviewed historical/forward-compatible rule.

      Rule 1 — 8 current POA occurrences — `خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي`
      members: خالد عطيه · أحمد عبد الله · محمد عبد العزيز عبد الحافظ ·
               شريف أبو المكارم · أحمد سعيد · محمد الغرابلي

      Rule 2 — 0 current occurrences (2 in the historic review) — `خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي`
      members: خالد عطيه · أحمد عبد الله · محمد عبد العزيز عبد الحافظ ·
               أحمد سعيد · محمد الغرابلي

      Rule 3 — 1 current POA occurrence — `هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا`
      members: those eight, with محمد عبد العزيز resolving to
               محمد عبد العزيز عبد الحافظ

      Every member above is already in the roster. Match through
      `person_name_alias`, never by typing the Arabic — and if a name here has
      been mistyped, the assertions below will catch it.

      **Assertions — all three, because the first two are blind to each
      other** (see "An assertion tests what it looks at" in
      `docs/MIGRATION.md`):
        1. every rule has **at least one** member — a rule with none has no
           row to fail, which is how the two broken historic rules stayed hidden
        2. every member name resolves to **exactly one** person
        3. ordinals run from 1 with no gaps

      **Completed 24 August 2026.** The live matter-only transform produced
      927 lawyer relationships on 708 matters, 2,615 parties on 1,520 matters
      and 2,199 party roles. It preserved all source text and provenance.
      926 unsafe source cells are retained as immutable evidence: 180
      unreviewed lawyer combinations, 714 unreviewed legal-capacity strings,
      30 malformed quote structures, 1 duplicate role and 1 conflicting
      gender. None was guessed. The three corrected rules occur only in POA
      data today, which stays untouched until task 2.9.

      The transform and permanent `db:check` rebuild expectations from
      staging plus exact reviewed rules, rather than trusting counts or a
      one-time plan. **Post-review correction:** the permanent oracle is a
      standalone read-only SQL implementation; it does not import or call the
      TypeScript transform planner or its party parser. Application-native
      relationships with null legacy provenance are deliberately outside that
      migration comparison and outside its stable result digest.

      **The populated-cell total is 4,576 across all 1,744 source matters:**
      4,418 belong to the 1,689 transformed matters and are handled here; 158
      belong to the 55 parent-quarantined matters and remain protected inside
      their complete task 2.6 payloads. The permanent check proves those two
      partitions are disjoint and complete. Parent-quarantined cells are not
      duplicated into the task 2.7 evidence table.

      The fixture proves empty/missing/malformed rules, unresolved and
      ambiguous aliases, ordinal defects, duplicate members, wrong
      fragmentation, missing/extra relationships, wrong roles and provenance,
      both/neither outcomes, altered evidence/identity, application-native
      rows, parent-quarantined cells and a late transactional failure. It also
      breaks and restores the complete definitions of all three provenance
      CHECKs, five unique indexes, four foreign keys and both evidence
      triggers/functions. An identical second live run preserved the exact
      legacy-derived result digest, including IDs and timestamps.

- [ ] **2.8 Transform: hearings and attendees**
      The current extraction holds 13,382 hearings; 13,279 is the 19 August
      shape figure, not the reconciliation target. `**` becomes no rows, not a
      person. Apply Correction B's fixture-proven decomposition through the
      separate dry-run, answer-reconciliation and transactional procedure in
      `docs/MIGRATION.md` before this transform; do not parse the live cells ad
      hoc here.

- [ ] **2.9 Transform: admin works, POAs, documents, fee letters**

      **`الدعاوى.[خطاب الأتعاب]` CARRIES TWO KEY SPACES — this is a hazard,
      not just an explanation.** Found at 2.4. It resolves against
      `contractID` (1–332) for 289 matters and `mfilesID` (1–59,225) for 123,
      none by both and none by neither.

      Three things are required here, and none of them is optional:

      1. **Resolve by an explicit rule the firm has confirmed**, recorded in
         the transform — never by "whichever column happens to match". The
         question is on the `أسئلة عامة` sheet of the review workbook.
      2. **Assert that no value resolves BOTH ways**, and fail loudly if one
         does. A silent pick attaches a matter to the wrong fee letter and
         nothing looks wrong afterwards. **Two values already exist in both
         key spaces**, so this is not hypothetical — it is one data-entry
         mistake away.
      3. **Keep the reference's original text** in a `_raw` column, per the
         `_raw` rule, so a wrong resolution can be undone.

      **The assertion must survive into `npm run db:check`** — rule 16. It is
      not enough for the migration to prove it once.

      **The `26` row is here.** It is an `admin work table` row, and the
      crosswalk rule for it (migration 0023) writes **circuit = `26` and
      leaves the court NULL**. Assert both halves on the loaded row, not just
      the rule: the circuit is `26`, and `court_id IS NULL`. A court
      defaulted, inferred from the circuit, or set to the string `26` is a
      failure — nobody knows which court that row was heard in, and unknown
      is the honest answer. `legacy_court_raw` keeps the original `26`.

- [ ] **2.10 Transform: invoices and payments** — read-only. No `Pay-Date`.

- [ ] **2.11 Write the 54 client logos** to the server folder defined in
      **D15** — `/var/lib/litigation/client-logos/{client_id}/{filename}` —
      and record `relative_path`, `file_name`, `content_type`, `byte_size`
      in `client_logos`. **Never the image itself, and never cloud storage.**
      Verify SHA-256 before and after.

- [ ] **2.12 Gate 4 reconciliation**
      Counts, per-lawyer matter totals, status totals, billing totals.
      Produce a report the owner can read.

---

## Stage 3 — Login and permissions

- [ ] **3.1 Auth.js login**, Arabic screen, firm logo.
      **Four test users supplied by the firm** (do not build until this task):
      | Name | Username | Email | Role |
      |---|---|---|---|
      | Khaled Helmy | KHelmy | khelmy@sarieldin.com | Administrator |
      | Mohamed Hussien | MHussien | mhussien@sarieldin.com | Litigation Assistant |
      | Ihab Hamdy | IHamdy | ihamdy@sarieldin.com | Lawyer |
      | Samy Khattab | SKhattab | skhattab@sarieldin.com | Paralegal |

      **Two are existing people and their accounts MUST link to those
      records**, or their historical work detaches from them:
        Ihab Hamdy  → `إيهاب حمدي` (person 4, 2,792 mentions, current, team أ)
        Samy Khattab → `سامي إبراهيم خطاب` (2,211 mentions, current)
      **Match through `person_name_alias`, never by typing the Arabic** —
      rule 15. Note `سامي إبراهيم خطاب` is one of the six people whose own
      name is not yet an alias (task 1.2a); that must be fixed first or the
      match returns nothing.

      Khaled Helmy and Mohamed Hussien are **new people** — confirmed absent
      from the roster.

      `people.email` already exists (task 1.2). `can_login` is false for all
      138 and is set per account here.

- [ ] **3.2 The four roles**, enforced **server-side** on every route.

- [ ] **3.3 Audit columns** populated everywhere.

- [ ] **3.4 User management** — Administrator only.

---

## Stage 4 — Core screens

Each screen: list with Arabic search, detail view, create/edit where the role
allows. Test with real volumes.

- [ ] **4.0 Revisit the right-to-left checker**
      Do this **before** the first real screen. `npm run check:rtl` works one
      line at a time, which was enough for Stage 0 but will not be enough for
      real interface code. Two known gaps are already fixtured in
      `scripts/fixtures/rtl-violations/Variations.tsx` and reported by every
      self-test run:
        - JSX text spread over several lines
        - a visible prop whose string sits on its own line
      Both need the checker to parse TSX and CSS structurally rather than
      pattern-match lines. Roughly 2–4 hours. Deferred from the Stage 0
      re-review because there were no screens yet to check.

- [ ] **4.1 Clients** — list, detail, contacts, logo

- [ ] **4.1a Client logo upload**
      Upload field on the client screen (Administrator and Litigation
      Assistant). PNG / JPG / GIF, max 2 MB, resized to a sensible print width.
      Stored in the folder per **D15**. Preview before saving.
      A missing file must fall back to the client's name in text.
- [ ] **4.2 Matters** — the biggest screen. Classification, parties, lawyers.
      **Case number field must display multiple lines (D9).**
      `docs/VISUAL-DIRECTION.md` makes the stacked case number the hero of this
      screen, in descending weight — D9 made visible.
      Two new visible strings it introduces, both of which live in
      `src/strings.ts` and never in a component (D12, rule 9):
      `لم يُكلَّف أحد` for the 834 matters with no lawyer — **absence is stated,
      not blank** — and `يشمل البحث:` for the alias disclosure, which is the
      alias table doing visible work.
- [ ] **4.3 Hearings** — 13,279 rows; needs paging and fast filters.
      Attendees as a multi-select of active staff.
- [ ] **4.4 Administrative works + task steps** — the only area Paralegals edit
- [ ] **4.5 Powers of attorney**
- [ ] **4.6 Documents** — including the optional `mfiles_id` field
- [ ] **4.7 Fee letters** — with linked matters
- [ ] **4.8 Billing** — read-only list of invoices and payments

---

## Stage 5 — Dashboard

- [ ] **5.1 Today's hearings**
- [ ] **5.2 Open decisions**
- [ ] **5.3 Matter counts per lawyer**
- [ ] **5.4 Top 5 clients**
- [ ] **5.5 For/against charts** (صالح/ضد), current year and five-year

---

## Stage 6 — Reports

- [ ] **6.1 Reporting engine** — one shared parameter form (date range, client,
      branch, lawyer), Excel via ExcelJS with `rightToLeft`, PDF via Playwright
      with bundled fonts and the firm letterhead.
- [ ] **6.2 Client reports**
      **`client_branch` is settled — D19, task 1.2c.** A branch is a site or
      subsidiary of a client. 15 values, all genuine sites. "Filter by branch"
      can be built as a straightforward report parameter.
      Two things to carry into the report: a matter may legitimately have **no**
      branch — including the 14 whose branch was a document heading and was
      discarded — so an "unassigned" grouping is required, never a dropped
      row; and any matter still quarantined under rule (b) is on the wrong
      client and must not appear under it.
      `تقرير عملاء 2` / `6` / `8` and
      `تقرير عملاء -جميع الدعاوى سارية ومنتهية` are **one parameterised
      report** (D17). Build it once.
      Layout: `docs/REPORT-LAYOUTS.md`, "Type 4 — Client status report".
      Includes the client's own logo, with a text fallback.
- [ ] **6.3 Matter reports**
- [ ] **6.4 Lawyer reports**
- [ ] **6.5 Hearing reports**
- [ ] **6.6 Administrative works reports**
- [ ] **6.7 Document and POA reports**
      **The POA and document movement cards are the paper half of a
      stock-control system.** `عدد النسخ` is a live count of copies in the
      safe; a lawyer signs one out to attend court and the count drops, and
      `ملاحظات` records who has it (`عهدة إيهاب حمدي`). The report highlights
      **zero** in yellow — none available.
      **Phase 1 reproduces the blank card, nothing more.** Replacing the paper
      loop with real check-in / check-out is an obvious **Phase 2** candidate,
      and it must handle **several copies of one power of attorney held by
      different lawyers at once** — which a simple in/out flag could not.
      **Do not build it now.**

      **The POA list report filters on `show_on_poa_report`** (Access `جرد`,
      confirmed 23 August 2026). 680 of 735 powers of attorney are set to
      show, 55 are not. It is a report setting the firm controls per record —
      not a fact about the power of attorney — so the report must honour it
      and the record screen must let it be changed.
- [ ] **6.8 The one report with an unknown layout** — do not start until the
      firm supplies the sample.
      Only `صالح-ضد مفصل حسب المحامي` remains unknown.
      `Copy Of صالح-ضد temp-JTI` has been dropped entirely (D17).
      The other four are now one parameterised report — see 6.2.
- [ ] **6.9 Reconcile six reports against Access, row for row**

---

## Stage 7 — Going live

- [ ] **7.1 Deploy to the Ubuntu VM** with Docker Compose
      Set `APP_ENV=production` in the server's `.env` — this is what makes
      `db:reset` refuse outright there. The server's database is also on
      localhost, so the "is it local?" check cannot tell the two apart.
      **Re-run `npm audit`** and re-assess the advisories recorded at task
      0.3; the picture may have changed by then.
- [ ] **7.2 Backups** — three layers, all required (**D16**)
      a) Nightly automated backup of the database **and** the client-logo
         folder in **one** operation. 30 nights retained.
      b) Those backups copied **off the VM** — another machine, network share
         or cloud. A backup on the server dies with the server.
      c) The firm's weekly/monthly VM snapshot stays as the disaster layer.
      d) Weekly integrity job: list clients whose logo file is missing.
      e) **Test a restore** onto a spare machine before go-live, and confirm a
         client logo appears in a printed report. Do not skip this.
- [ ] **7.3 Full dry-run migration** (T-14d in `docs/MIGRATION.md`)
- [ ] **7.4 Second dry run + sign-off by name** (T-7d)
      **Khaled Helmy signs off, by name** — not "the firm". One named person,
      so it is unambiguous afterwards whose decision it was to go.
      **T-8d: announce the date to the whole firm**, a week ahead, so nobody
      plans around it badly.
- [ ] **7.5 Cutover** — freeze Access, migrate, Gate 4, go live
      **A normal working day, set aside in full.** Not an evening or a
      weekend.
      **RETENTION — the Access file is kept indefinitely.** Read-only from
      T+0 and **immediately available for 90 days**; after that it moves to
      cold storage, which is slower to reach and is not the same as gone.
      **There is no step that deletes it.** A matter can be in court for
      years and the `.accdb` is the only pre-migration record of 1,223 closed
      matters. (Recorded here, on the cutover task, because this is where the
      freeze and go-live already live.)
- [ ] **7.6 Short Arabic user guide** for the four roles

---

## Phase 2 — after go-live

- [ ] Attendance screens
      **`AttSituation` needs its own review first.** 865 distinct values, and
      it is a free-text daily log rather than a status list — `At the Office`
      749, `At the office` 327 (the same value, different case), then hundreds
      of one-offs. Do not design a dropdown until the firm has been through
      the values.
- [ ] Invoice and payment entry

      **VAT needs its own field, separate from the `VAT?` flag**, recording
      whether the invoice amount is **VAT-inclusive or VAT-exclusive**. Ruled
      by the firm, 23 August 2026, when `VAT?` was migrated as-is.

      Without it, a report summing `Amount` adds gross figures to net ones.
      **The total looks plausible and is wrong**, which is worse than a total
      that is obviously broken. 289 invoices are flagged `1` and 254 `0`, and
      it is a per-invoice decision rather than a date rule — 2018 alone is
      46 no against 67 yes.

      **Any financial report must state which it is summing.**

      **The fee-letter reference must be validated on entry, not just on
      migration.** `الدعاوى.[خطاب الأتعاب]` resolves against two different
      key spaces (see 2.9), and two values already exist in both. The moment
      anyone can type a fee-letter reference into a form, the same ambiguity
      can be created by hand. The entry screen must resolve by the same
      recorded rule and refuse a value that resolves both ways, rather than
      picking one. Ruled 23 August 2026 when the hazard was found.
- [ ] Collection splitting between lawyers
- [ ] Excel import for the attendance and billing history kept outside Access
