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

- [ ] **1.3 Core schema**
      clients, contacts, matters, hearings, admin_tasks, task_actions,
      powers_of_attorney, documents, fee_letters. Per `docs/DATA-MODEL.md`.
      **Must include five `_raw` columns.** Every many-to-one mapping needs
      one or the mapping is irreversible — see the audit table in
      `docs/MIGRATION.md`. Assert all five exist before Stage 2 loads a row.
        `hearings.legacy_action_raw`      — 23 actions merged to 20
        `clients.legacy_branch_raw`       — 32 branches resolved to 15
        `hearing_attendees.legacy_name_raw` — **373 spellings → 135 people**,
              the highest-ratio mapping in the project and the one that has
              already gone wrong twice
        `admin_tasks.legacy_assignee_raw`  — a typed name
        a raw column on the POA lawyer list — up to twelve names per field

- [ ] **1.4 Junction tables**
      matter_lawyers, matter_parties, matter_party_roles, hearing_attendees,
      fee_letter_matters.

- [ ] **1.5 Billing + deferred tables**
      invoices, payments (read-only in the app), attendance,
      invoice_allocations. Empty but correctly keyed — see D3.

- [ ] **1.6 Arabic search** — unblocked 21 August 2026.
      The three lists that were marked "already clean" without inspection
      have been re-analysed and corrected: `hearing_action` 23 → 20,
      `client_branch` 32 → 15, `matter_destination` unchanged at 27.
      Total 130. The values are settled, so the normaliser and its trigram
      indexes can be built on them.
      What `client_branch` MEANS is settled too — see 1.2c and **D19**.
      The normaliser as a PostgreSQL function, generated normalised columns on
      every searchable Arabic field, `pg_trgm` indexes.
      **Test:** searching `احمد` finds `أحمد`; `140J` finds `140ق`.

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

      **RULE (a) — NEVER OVERWRITE AN EXISTING `matter_category`.** Nine of
      the branch values resolved by **D19** move into `matter_category`. Where
      a matter already has one, **quarantine the conflict** for the firm — do
      not replace it and do not silently keep the old one. Either way the
      original branch text stays in `clients.legacy_branch_raw`.
      Every affected `migration_crosswalk` row carries this in its
      `reviewer_note`.

- [ ] **2.6 Transform: matters** — including the four classification columns via
      the crosswalk, and `legacy_*_raw` preserved.

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
- [ ] Invoice and payment entry
- [ ] Collection splitting between lawyers
- [ ] Excel import for the attendance and billing history kept outside Access
