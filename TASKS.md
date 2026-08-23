# Build order

Work through these **in order**. Each is sized to roughly one session.
Tick a box only when it is committed to git and actually works.

Do not jump ahead. Do not batch several tasks together. If a task turns out to
be bigger than expected, split it and tell the owner.

---

## Stage 0 — Foundations

- [x] **0.1 Repository skeleton**
      Next.js + TypeScript. Prettier and ESLint. `.gitignore` that excludes
      `.env`, `node_modules`, and **any database file or CSV export** — the data
      is confidential and must never be committed.

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
      `migration_excluded_name`. Writing the assertion for them found 4 of
      the 66 member names resolve to nobody — see below.

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

      **Three POA column names need the firm to confirm them** — `الصفة`
      against `صفة الموكل بالتوكيل`, `حرف`, and `جرد`. Not in
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

      **The `J → ق` fold was REMOVED on 24 August 2026** (migration 0020). It
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

- [ ] **2.1 Extract** — run `scripts/01_extract_access.ps1`.
      **Gate 1: must report 54 attachments and 288 multi-value entries.**
      If either is zero, stop.
      **Before this runs, the firm reads `docs/STAGE-2-PLAN.md`** — the same
      process in plain language — and confirms the shape is right. This is
      the first time their live records are involved.
      **Also before this runs:** confirm a copy of the `.accdb` is on the
      machine and Access (or the Access Database Engine) is installed, with
      bitness matching PowerShell. Nothing in Stage 2 can run without both.

- [ ] **2.2 Staging schema** — every column `text`, plus `src_row_num`.

- [ ] **2.3 Load to staging** — Gate 2: counts match the manifest.

      **Also at this task: give `npm run test:guard` its own database.**
      The guard suite writes fixture tables, so it refuses to run against a
      database holding project data — CLAUDE.md rule 14 working as intended.
      But that means its 22 cases have not run since task 1.1 and the gap
      widens with every migration. The firm's ruling: create and destroy a
      throwaway database per run, so the suite never touches the project one.
      Do not build it before this task.

- [ ] **2.4 Quarantine tables + profiling** — Gate 3.

- [ ] **2.5 Transform: people, lookups, clients, contacts**

      **`lookup_court` is reviewed and ready to seed — BLOCKED on one row.**
      `sql/lookup-court-and-crosswalk.sql` holds the firm's review of all 401
      distinct court names: 307 KEEP, 52 MERGE, 35 SPLIT, 7 WRONG, giving 309
      courts and 94 crosswalk rules. Generate it with
      `npm run generate:court-seed -- <new migration.sql>`; never retype it.

      **`القضاء الإداري` and `القضاء الإداري بالعباسية` are DIFFERENT courts** —
      different buildings, deliberately kept apart (**D22**). The earlier guess
      that they might be one court with a location suffix was wrong.

      **APPLIED 24 August 2026, migration 0022. 308 courts, 94 rules.**

      **308, not the stated 309.** `هيئة الاستثمار` was in the list *and* a
      merge source *and* a SPLIT's court part — a two-step chain, the same
      fault as `جنح` at 1.2c. **My generator's bug, not the firm's review:** it
      took the split's court part into the list without checking whether that
      string was itself a merge source. Every split's court part now resolves
      through the merge map first. Counted independently before applying — the
      fifth time a stated count was wrong while its list was right.

      The seven WRONG values are settled: five are destinations (four added,
      `matter_destination` 27 → 31), and `/` and `26` are discarded, keeping
      their text in `legacy_court_raw` (D10).

      `db:check` now asserts permanently that **no lookup value is also a
      crosswalk source**, however it reached the list. Proved by reinserting
      the artefact.

      **RULE (a) — NEVER OVERWRITE AN EXISTING `matter_category`.** Nine of
      the branch values resolved by **D19** move into `matter_category`. Where
      a matter already has one, **quarantine the conflict** for the firm — do
      not replace it and do not silently keep the old one. Either way the
      original branch text stays in `clients.legacy_branch_raw`.
      Every affected `migration_crosswalk` row carries this in its
      `reviewer_note`.

- [ ] **2.6 Transform: matters** — including the four classification columns via
      the crosswalk, and `legacy_*_raw` preserved.

      **QUESTION FOR ONCE THE DATA HAS LANDED: split the circuit?**
      `circuit` is text by **D20** — 1,281 distinct values that are a circuit
      number plus a specialism (`1 عمال`, `12 عمال`, `8 تجاري`, `7 استئناف`,
      `4 أفراد`), varying by court. Splitting it into number + specialism
      would give perhaps 15 specialisms and a free number, which is a real
      improvement. **Do not attempt it before the values are loaded** — decide
      it with them in front of you.

      **RULE (b) — THE THREE `separate_client` VALUES ARE A CORRECTNESS
      PROBLEM, NOT A MIS-LABEL.** `سيجما للإعلام (تليفزيون الحياة)`,
      `ألفا مصر للتجارة` and `سيجما للصناعات الدوائية` are clients in their
      own right. **Any matter carrying one of them is attached to the WRONG
      CLIENT ENTIRELY.** Quarantine those matters. **Do not guess which client
      they belong to** — the firm decides. `npm run db:check` asserts all
      three rules are present so one cannot quietly go missing.

      Rule (a) applies here too, for any branch value that reaches a matter.

- [ ] **2.7 Transform: matter_lawyers and matter_parties**
      Split the combination strings using the rules in
      `migration_multi_person_rule`.

      **Load the three deferred tables here** — `migration_multi_person_rule`
      (33), `_member` (66) and `migration_excluded_name` (38). They were held
      back from task 1.2 because three rules were broken.

      **THREE RULES ARE MIS-PARSED IN THE SOURCE — corrected membership below,
      supplied by the firm 21 August 2026.** The firm's review notes were
      correct throughout; the extractor lost them. Two rules had a missing
      closing bracket so the capture returned nothing and they have **no
      members at all**; a third used `-` as its separator so the whole string
      came through as one name. **Left unfixed, 11 matters lose every lawyer.**

      Rule 1 — 8 matters — `خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وشريف أبو المكارم صالح وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي`
      members: خالد عطيه · أحمد عبد الله · محمد عبد العزيز عبد الحافظ ·
               شريف أبو المكارم · أحمد سعيد · محمد الغرابلي

      Rule 2 — 2 matters — `خالد محمود حمدي عبد العزيز وأحمد عبد الله محمد ومحمد عبد العزيز عبد الحافظ وأحمد سعيد أحمد ومحمد مجدي أحمد الغرابلي`
      members: خالد عطيه · أحمد عبد الله · محمد عبد العزيز عبد الحافظ ·
               أحمد سعيد · محمد الغرابلي

      Rule 3 — 1 matter — `هاني سري الدين - أميرة شريف - إيهاب حمدي - محمد عبد العزيز - أحمد سعيد - محمد حمدي - هاني الدالي - عبد الرحمن البنا`
      members: those eight, with محمد عبد العزيز resolving to
               محمد عبد العزيز عبد الحافظ

      Every member above is already in the roster. Match through
      `person_name_alias`, never by typing the Arabic — and if a name here has
      been mistyped, the assertions below will catch it.

      **Assertions — all three, because the first two are blind to each
      other** (see "An assertion tests what it looks at" in
      `docs/MIGRATION.md`):
        1. every rule has **at least one** member — a rule with none has no
           row to fail, which is how 10 of the 11 matters stayed hidden
        2. every member name resolves to **exactly one** person
        3. ordinals run from 1 with no gaps

- [ ] **2.8 Transform: hearings and attendees**
      13,279 hearings. `**` becomes no rows, not a person.

- [ ] **2.9 Transform: admin works, POAs, documents, fee letters**

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
- [ ] **7.4 Second dry run + firm sign-off** (T-7d)
- [ ] **7.5 Cutover** — freeze Access, migrate, Gate 4, go live
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
- [ ] Collection splitting between lawyers
- [ ] Excel import for the attendance and billing history kept outside Access
