# Build order

Work through these **in order**. Each is sized to roughly one session.
Tick a box only when it is committed to git and actually works.

Do not jump ahead. Do not batch several tasks together. If a task turns out to
be bigger than expected, split it and tell the owner.

---

## Stage 0 — Foundations

- [ ] **0.1 Repository skeleton**
      Next.js + TypeScript. Prettier and ESLint. `.gitignore` that excludes
      `.env`, `node_modules`, and **any database file or CSV export** — the data
      is confidential and must never be committed.

- [ ] **0.2 Docker Compose**
      PostgreSQL 16+ with the ICU Arabic collation available. One command must
      bring the database up on Windows and on the Ubuntu server.

- [ ] **0.3 Prisma set up, connects, migration runs**

- [ ] **0.4 Arabic base layout**
      `<html lang="ar" dir="rtl">`, brand colours as CSS variables from
      `docs/BRAND.md`, Noto Naskh Arabic bundled locally. Create
      `src/strings.ts`. Prove RTL works with one simple page.

---

## Stage 1 — Database

- [ ] **1.1 Lookup tables + seed**
      Nine lookups from `sql/lookups-and-crosswalk.sql`. Tables, never enums.

- [ ] **1.2 People + aliases**
      From `sql/people-roster-and-aliases.sql`. 140 people, 338 aliases.

- [ ] **1.3 Core schema**
      clients, contacts, matters, hearings, admin_tasks, task_actions,
      powers_of_attorney, documents, fee_letters. Per `docs/DATA-MODEL.md`.

- [ ] **1.4 Junction tables**
      matter_lawyers, matter_parties, matter_party_roles, hearing_attendees,
      fee_letter_matters.

- [ ] **1.5 Billing + deferred tables**
      invoices, payments (read-only in the app), attendance,
      invoice_allocations. Empty but correctly keyed — see D3.

- [ ] **1.6 Arabic search**
      The normaliser as a PostgreSQL function, generated normalised columns on
      every searchable Arabic field, `pg_trgm` indexes.
      **Test:** searching `احمد` finds `أحمد`; `140J` finds `140ق`.

---

## Stage 2 — Migration

Follow `docs/MIGRATION.md` exactly. Do not shortcut the gates.

- [ ] **2.1 Extract** — run `scripts/01_extract_access.ps1`.
      **Gate 1: must report 54 attachments and 288 multi-value entries.**
      If either is zero, stop.

- [ ] **2.2 Staging schema** — every column `text`, plus `src_row_num`.

- [ ] **2.3 Load to staging** — Gate 2: counts match the manifest.

- [ ] **2.4 Quarantine tables + profiling** — Gate 3.

- [ ] **2.5 Transform: people, lookups, clients, contacts**

- [ ] **2.6 Transform: matters** — including the four classification columns via
      the crosswalk, and `legacy_*_raw` preserved.

- [ ] **2.7 Transform: matter_lawyers and matter_parties**
      Split the combination strings using the rules in
      `migration_multi_person_rule`.

- [ ] **2.8 Transform: hearings and attendees**
      13,279 hearings. `**` becomes no rows, not a person.

- [ ] **2.9 Transform: admin works, POAs, documents, fee letters**

- [ ] **2.10 Transform: invoices and payments** — read-only. No `Pay-Date`.

- [ ] **2.11 Upload the 54 client logos** to object storage; verify SHA-256.

- [ ] **2.12 Gate 4 reconciliation**
      Counts, per-lawyer matter totals, status totals, billing totals.
      Produce a report the owner can read.

---

## Stage 3 — Login and permissions

- [ ] **3.1 Auth.js login**, Arabic screen, firm logo.

- [ ] **3.2 The four roles**, enforced **server-side** on every route.

- [ ] **3.3 Audit columns** populated everywhere.

- [ ] **3.4 User management** — Administrator only.

---

## Stage 4 — Core screens

Each screen: list with Arabic search, detail view, create/edit where the role
allows. Test with real volumes.

- [ ] **4.1 Clients** — list, detail, contacts, logo
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
- [ ] **6.3 Matter reports**
- [ ] **6.4 Lawyer reports**
- [ ] **6.5 Hearing reports**
- [ ] **6.6 Administrative works reports**
- [ ] **6.7 Document and POA reports**
- [ ] **6.8 The six reports needing sample PDFs** — do not start until the firm
      supplies them
- [ ] **6.9 Reconcile six reports against Access, row for row**

---

## Stage 7 — Going live

- [ ] **7.1 Deploy to the Ubuntu VM** with Docker Compose
- [ ] **7.2 Backups** — automated, tested by actually restoring one
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
