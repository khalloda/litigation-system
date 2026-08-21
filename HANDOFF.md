# Handoff — Litigation Management System

Written 21 August 2026, end of session. Assumes you have no memory of the
conversation that produced the state below.

**Read first, in this order:** `CLAUDE.md` (15 durable rules — they are
binding), `docs/DECISIONS.md` (D1–D19), `TASKS.md` (build order, current
position), then this file.

Last commit: `dec9d52`. Working tree clean. All 17 `db:check` checks pass.

---

## 1. Project Overview

Replacing a Microsoft Access database that has run the litigation practice of
**Sarie Eldin & Partners** (Cairo) since 2010, with a web application.

- **Arabic only, right-to-left.** No English interface. English data columns
  are retained for a possible future bilingual version.
- **30,553 rows migrate** from Access (13,279 hearings, 4,207 admin tasks,
  1,730 matters, 313 clients, …). A further 4,790 rows are archived tables
  that are deliberately not migrated; 30,553 + 4,790 = 35,343, the whole file.
  Both numbers appear in the documents — see "Which row count is the target?"
  in `docs/MIGRATION.md`.
- **45 reports**, each exportable to Excel and PDF.
- Four roles, enforced server-side. About 10 users.
- The owner is **not a programmer**. `CLAUDE.md` governs how to communicate:
  plain language, options with costs, and a recommendation.

### Stack, as installed

| Thing | Version | Notes |
|---|---|---|
| Node | 22.19.0 | pinned in `.nvmrc`, `engines` requires >= 22 |
| Next.js | 16.3.1 | App Router, `src/` layout, Turbopack |
| React | 19.2.8 | |
| TypeScript | ^5 | `strict`, plus `noUncheckedIndexedAccess` and `forceConsistentCasingInFileNames` |
| Prisma | 7.9.1 | CLI and client. **Prisma 7 requires a driver adapter** |
| `@prisma/adapter-pg` | ^7.9.1 | the adapter; `pg` ^8.23.0 underneath |
| PostgreSQL | 17.11 | `postgres:17-bookworm` in Docker, **port 5433** |
| tsx | ^4.23.12 | runs every `scripts/*.ts` |
| Prettier | ^3.6.2 | + `eslint-config-prettier` |
| Fonts | Noto Naskh Arabic variable | bundled in `public/fonts/`, never a CDN |

No CSS framework. Plain CSS with brand tokens — chosen so a reviewer can grep
the whole codebase for a right-to-left violation in one command.

### Commands

```bash
# first run on a new machine
cp .env.example .env
npm install                 # postinstall runs `prisma generate`
npm run db:up               # PostgreSQL 17 in Docker, waits until healthy
npm run db:migrate:deploy   # apply all 7 migrations
npm run db:check            # 17 checks, all must read OK

npm run dev                 # http://localhost:3000
npm run build               # production build
```

```bash
# before every commit — six gates, all must pass
npm run check               # typecheck + lint + format:check + check:rtl
                            #   + check:gitignore + check:encoding

# the two test suites (not in `check` — they need Docker / PowerShell)
npm run test:guard          # 12 parser + 10 guard cases. REFUSES now — see §6.
npm run test:gate1          # 15 cases. Runs under pwsh AND Windows PowerShell 5.1.
```

```bash
# database
npm run db:up / db:down / db:logs / db:psql / db:studio
npm run db:verify           # 10 SQL-level checks inside the container
npm run db:check            # 17 application-level checks through Prisma
npm run db:reset            # DESTRUCTIVE. Guarded. See §5 and CLAUDE.md rule 12.
npm run db:migrate          # prisma migrate dev — use this locally, see §5
```

**Note:** `npm run build` does **not** run ESLint. Next 16 removed that.
`npm run check` is the gate.

---

## 2. Repository Map

`(*)` = created or heavily modified in this session. Almost everything is,
because the session began with an empty repository containing only documents.

```
HANDOFF.md (*)              this file
CLAUDE.md                   15 rules for the builder. DO NOT EDIT without owner approval.
AGENTS.md                   reviewer brief for Codex. Codex may never edit it.
README.md (*)               status and run commands
TASKS.md (*)                build order; ticked through 1.2c

docker-compose.yml (*)      PostgreSQL 17, port 5433, named volume, health check
docker/postgres/
  initdb/01-check-cluster.sql (*)   runs once. CHECKS encoding/provider/locale; creates nothing
  healthcheck.sh (*)                verifies cluster properties, not just "server answers"
  verify.sql (*)                    10 SQL-level checks; `npm run db:verify`

prisma/
  schema.prisma (*)         13 models. Structure lives here; DATA lives in sql/
  migrations/               7 applied migrations, listed in §3
prisma.config.ts (*)        Prisma 7 config; reads DATABASE_URL from .env

src/
  strings.ts (*)            EVERY visible string. No Arabic in any component (D12)
  lib/db.ts (*)             the shared PrismaClient, with the pg driver adapter
  app/layout.tsx (*)        <html lang="ar" dir="rtl">, preloads the Arabic font
  app/page.tsx (*)          TEMPORARY task 0.4 verification page. Stage 5 deletes it
  app/globals.css (*)       brand tokens, @font-face, logical-property rules
  app/page.module.css (*)   styles for the temporary page
  app/icon.png (*)          favicon, from assets/emblem.png
  generated/prisma/         generated client. Git-ignored. `npm run db:generate`

scripts/
  01_extract_access.ps1 (*) Stage A extraction. UTF-8 WITH BOM — see §5
  lib/gate1.ps1 (*)         Gate 1 decision, pure, testable without Access
  lib/inventory.ts (*)      parses+validates the db:reset inventory (JSON)
  db-reset.ts (*)           the guarded destructive reset. Read its header first
  check-db.ts (*)           17 application-level checks
  check-rtl.ts (*)          RTL + hardcoded-text checker, with a self-test
  check-gitignore.ts (*)    65 dangerous paths must be blocked, case-sensitively
  check-encoding.ts (*)     .ps1 must have a BOM; everything else must not
  test-db-reset-guard.ts (*)  12 parser + 10 guard cases
  test-gate1.ps1 (*)        15 Gate 1 cases
  generate-lookup-seed.ts (*) sql/ -> migration seed for the 9 lookups
  generate-roster-seed.ts (*) sql/ -> migration seed for the roster
  fixtures/rtl-violations/  (*) deliberately wrong files the self-test must catch
  fixtures/rtl-clean/       (*) deliberately correct files it must stay silent on

sql/                        THE SOURCE OF TRUTH FOR DATA. Reviewed by the firm.
  client-branch-resolution.sql (*) the firm's 21 Aug branch ruling. D19
  lookups-and-crosswalk.sql       5 lookups + the crosswalk table definition
  lookups-part2-and-teams.sql (*) 4 lookups + teams. Edited by the 21 Aug corrections
  people-roster-and-aliases.sql   135 people, 339 aliases, split rules
  lookup-corrections.sql          the firm's 21 Aug merge instructions

docs/
  PRD.md (*)                what the system must do
  DECISIONS.md (*)          D1–D19. Outranks any skill or plugin advice
  DATA-MODEL.md (*)         every table and column
  MIGRATION.md (*)          the migration, the gates, and 10 hard-won rules
  DATABASE.md (*)           running the database in plain language
  PERMISSIONS.md (*)        four roles
  BRAND.md (*)              colours, fonts, RTL rules
  GLOSSARY.md               Arabic legal terms. Never guess one
  REPORTS.md / REPORT-LAYOUTS.md   45 reports and their house style
  PATCHES.md (*)            applied 20 Aug; kept as a record. Do not re-apply
  reviews/*.md (*)          three Codex reviews. All findings closed
  report-samples/           nine real PDFs. Git-ignored

public/fonts/ (*)           Noto Naskh Arabic woff2 + OFL licence
assets/                     logo.png, emblem.png
```

---

## 3. Architecture & Data Model

### Shape

Single Next.js application, App Router, TypeScript throughout (D13). Prisma
talks to PostgreSQL through `@prisma/adapter-pg`. No separate back end.

Two sources of truth, deliberately separated:

- **`prisma/schema.prisma` owns STRUCTURE.**
- **`sql/*.sql` owns DATA.** Those files were reviewed value-by-value by the
  firm. Seeds are **generated** from them into migrations, never retyped —
  there are 481 Arabic strings and several differ by one character.

### Migrations, in order

| # | Folder | What it does |
|---|---|---|
| 0001 | `20260820121223_extensions_and_arabic_collation` | `pg_trgm`, `btree_gin`, `unaccent`; the `arabic` ICU collation; asserts all four work |
| 0002 | `20260821064928_lookup_tables` | 9 lookup tables + 150 seed rows, all counts asserted |
| 0003 | `20260821075618_lookup_corrections_and_crosswalk` | `migration_crosswalk` + 4 rules; 4 lookup merges; 150 → 146 |
| 0004 | `20260821082308_people_roster_and_teams` | `people` (138), `person_name_alias` (339), `lookup_team` (2) |
| 0005 | `20260821114832_alias_completeness` | 339 → 347 aliases; every person now findable by their own name |
| 0006 | `20260821121729_merge_name_variant_duplicates` | 3 merges; people 138 → 135 |
| 0007 | `20260821151740_client_branch_resolution` | `client_branch` 31 → 15; 16 crosswalk rules added and the `جنح` chain collapsed; lookups 146 → 130, crosswalk 4 → 20 |

Every migration ends in a `DO $$` block asserting its counts. A migration runs
in a transaction, so a failed assertion rolls the whole thing back — there is
no half-seeded state to discover later.

### Live figures — asserted by `npm run db:check`

```
lookups        130 rows across 9 lists
  matter_type 14 · matter_category 21 · degree 12 · venue 7 · importance 3
  party_role 11 · hearing_action 20 · matter_destination 27 · client_branch 15

people         135
  staff 64 (current 21, former 43) · external 71
aliases        347
teams          2 — 8 members, 5 of them current; 16 current staff have none
crosswalk      20 rules, 0 dangling, 0 unrecognised
  3 hearing_action · 9 matter_category · 1 matter_type · 1 degree
  1 quarantine · 3 separate_client · 2 discarded
```

### Tables that exist

`lookup_matter_type`, `lookup_matter_category`, `lookup_degree`,
`lookup_venue`, `lookup_importance`, `lookup_party_role`,
`lookup_hearing_action`, `lookup_matter_destination`, `lookup_client_branch`,
`lookup_team`, `people`, `person_name_alias`, `migration_crosswalk`.

Conventions on all of them: snake_case ASCII physical names, PascalCase Prisma
models with `@@map`. Audit columns `created_at`, `created_by`, `updated_at`,
`updated_by` on every application table. **`created_by`/`updated_by` are plain
integers with no foreign key yet** — they gain one in Stage 3 when `users`
exists.

`people` notes: `email` is nullable and unique (PostgreSQL allows many NULLs, so
that is "unique where present"). `can_login` is `false` for all 135 and is set
per account at Milestone 4. `team_id` is nullable and NULL is common and valid.

### Not yet built

`clients`, `contacts`, `matters`, `hearings`, `hearing_attendees`,
`admin_tasks`, `task_actions`, `powers_of_attorney`, `documents`,
`fee_letters`, `matter_lawyers`, `matter_parties`, `matter_party_roles`,
`fee_letter_matters`, `invoices`, `payments`, `attendance`,
`invoice_allocations`, `client_logos`, `users`. Tasks 1.3–1.5.

`migration_multi_person_rule`, `migration_multi_person_member`,
`migration_excluded_name` — deliberately deferred to task 2.7, see §6.

### Environment variables

By name only. Real values live in `.env`, which is git-ignored.

| Name | Purpose |
|---|---|
| `APP_ENV` | `development` or `production`. **Only the exact string `development` permits `db:reset`.** The server's `.env` must say `production` |
| `NODE_ENV` | standard; `production` also blocks `db:reset` |
| `DATABASE_URL` | full PostgreSQL URL. Read by Prisma via `prisma.config.ts` and by `src/lib/db.ts` |
| `POSTGRES_DB` | defaults `litigation`. `db:reset` requires `DATABASE_URL` to name exactly this |
| `POSTGRES_USER` | defaults `litigation` |
| `POSTGRES_PASSWORD` | dev default is weak on purpose; the port binds to 127.0.0.1 only. **Set a real one on the server** |
| `POSTGRES_PORT` | defaults **5433**, not 5432 — see §5 |

No external services. Nothing leaves the machine. Client logos will be files on
the server (D15), not cloud storage.

---

## 4. Decisions Made — this session only

`docs/DECISIONS.md` holds **D1–D19** and is the authority. Do not duplicate it
here. The decisions below are engineering choices made during this session that
are *not* in that file.

1. **Extensions and the `arabic` collation live in a Prisma migration, not the
   Docker start-up script.** `prisma migrate reset` rebuilds the public schema
   and discards anything created outside a migration. Tested: a collation made
   by hand vanished; the migration-owned one returned. Evidence table in
   `docs/DATABASE.md`.

2. **The Docker start-up script CHECKS and creates nothing.** It verifies the
   three things a migration can never fix — encoding, collation provider,
   locale — because they are fixed when the cluster is created.

3. **Seeds are generated from `sql/*.sql`, never retyped.** Two generator
   scripts. Both assert every row count before writing anything.

4. **Seeds live in migrations, not `prisma db seed`.** The application cannot
   work without the lookups, so a fresh database must arrive complete.
   `migrate deploy` runs a migration; `db seed` would not.

5. **Plain CSS, no framework.** So `check:rtl` can find a violation by reading
   the stylesheet. Agreed with the owner.

6. **PostgreSQL on port 5433.** See §5.

7. **`migration_crosswalk` created in Stage 1, not Stage 2** as originally
   planned — it holds real rules now, and "remember to add these later" is a
   dependency on memory.

8. **The three `migration_multi_person_*` tables were pulled forward for the
   same reason and then pushed back**, because writing their assertion proved
   the data is not ready. See §6.

9. **`npm audit` reports 3 high advisories** in `deepmerge-ts`, reached only
   through `@prisma/config` — the Prisma CLI, a dev dependency never shipped.
   The offered fix downgrades to Prisma 6. **Not taken.** Re-assess at task 7.1.

10. **Ten rules were added to `docs/MIGRATION.md`**, each from a real failure.
    Read that file before Stage 2. Summarised:
    - Never match an Arabic name without asserting the row count
    - The four classes of Arabic name variation — and class four
      (dropped middle name) can **never** be folded by a normaliser
    - The cascade rule — one changed figure moves every derived figure
    - A check must be tested where it will actually run
    - Validate what you receive, never assume its shape
    - An assertion tests what it looks at, and nothing else
    - Prove the check catches a failure
    - A merge instruction is Arabic text too, and must be normalised
    - A many-to-one mapping needs a `_raw` partner or it is irreversible
    - A count in an instruction is a claim, not a fact — count the items and
      report the difference (added 21 Aug with the branch resolution, after
      the fourth time a stated total was wrong and its list was right)

---

## 5. Dead Ends — Do NOT Retry

**Port 5432 for our PostgreSQL.** The owner's laptop had another PostgreSQL on
it (ZKBioTime, since uninstalled). We use **5433** on both machines
deliberately, so one set of instructions works everywhere and a future server
PostgreSQL on the default port cannot collide. The owner ruled: do not change
it back.

**`prisma init`.** It writes agent-skill directories into the repository
(`.claude/skills/`, `.agents/skills/`, `skills-lock.json`). The Prisma config
was hand-written instead. Do not run it.

**A BOM-less `.ps1`.** `scripts/01_extract_access.ps1` must stay **UTF-8 WITH a
byte-order mark**. Windows PowerShell 5.1 — the version needed for Access COM
interop — reads a BOM-less `.ps1` as Windows-1252 and corrupts every Arabic
table name in it. Before the BOM it would not even parse. `check:encoding`
enforces this; the script also self-checks at runtime.

**Delimited text for anything whose values you do not control.** The `db:reset`
inventory was `schema|table|count` split on the pipe. A table named
`review|guard_fixture` broke the parse, `Number('guard_fixture')` gave NaN, and
three real rows read as an empty table. It is JSON now, with every field
validated. Escaping the delimiter only moves the problem.

**Choosing a migration folder with `find … | sort | tail -1`.** `prisma migrate
dev` had failed, so no new folder existed, and 638 lines of roster seed were
appended to an already-applied migration. Prisma's shadow-database replay
caught it, not any check of ours. `generate-roster-seed.ts` now refuses any
file that is not a new, empty roster migration.

**Skipping `prisma migrate dev` locally in favour of `migrate deploy`.** The
shadow-database replay is a free safety net that caught the above. Keep using
`migrate dev`.

**Exact-matching an Arabic name.** Three separate bugs. The roster generator
reported "0 mentions" and created two duplicate people, one carrying 1,309
hearings. Later the same fault created three more phantom people by exact-
matching a merge target. Always match through `person_name_alias`, and
normalise both sides of a merge instruction.

**Extending the normaliser to guess at dropped middle names.** Tempting and
forbidden. `سامي خطاب` / `سامي إبراهيم خطاب` cannot be folded by any rule
without merging genuinely different people who share a first and last name.
Human-recorded aliases only.

**Conjunction-stripping on names.** The `و`-prefixed spellings
(`وأحمد عبد الله محمد`) genuinely appeared in the Access data and the firm's
review assigned each to the right person. They are correct as aliases. Stripping
them would break the rows that use them. Ruled by the owner.

**Editing an already-applied migration.** Corrections go in a new migration.
0003 corrects 0002; 0005 and 0006 correct 0004.

**`docker compose down -v` by hand.** Use `npm run db:reset`, which is guarded.
`CLAUDE.md` rule 12.

**`--force-i-know` without asking the owner.** `CLAUDE.md` rule 13.

---

## 6. Current State

### Done and verified

**Stage 0 complete and accepted by the owner**, after three rounds of Codex
review. All findings closed; the three review files are in `docs/reviews/`.

- **0.1** Next.js 16 + TypeScript skeleton, ESLint, Prettier, `.gitignore`
  verified against 65 dangerous paths **with case sensitivity forced** (Windows
  hides case bugs that the Ubuntu server will not).
- **0.2** PostgreSQL 17 in Docker, ICU `ar-EG`, port 5433. Verified from an
  empty volume in under 7 seconds.
- **0.3** Prisma 7 connected; migration 0001 applied. `scripts/check-db.ts`
  proves Arabic survives the **driver**, not merely psql.
- **0.3a** `db:reset` guarded. Four checks with no override (production
  marker, non-local host, wrong database name, cannot enumerate) and one with
  (`--force-i-know`, when rows exist). It inventories **every non-template
  database in the volume**, because that is what `down -v` destroys.
- **0.4** Arabic RTL layout, brand tokens, bundled font, `src/strings.ts`.
  Verified in a browser against computed styles: `border-inline-start`
  resolved to a border on the **right**, and a stacked case number rendered as
  exactly three lines.
- **1.1** Nine lookup tables, 146 rows (was 150; four values merged 21 Aug).
- **1.2** People roster: 135 people, 347 aliases, 2 teams.
- **1.2a** Alias completeness — every person is now findable by their own name.
- **1.2b** Three name-variant duplicates merged.
- **1.2c** `client_branch` resolved 31 → 15 (**D19**), lookups 146 → 130,
  crosswalk 4 → 20. Done before 1.3 because 1.3 builds
  `clients.legacy_branch_raw` on top of it.

Every assertion above was **proved by deliberately breaking it** — see the
commit messages for the exact error text each produced. For 1.2c the four
breaks were run against the live database inside a transaction and rolled
back; the database was unchanged before and after.

### Done but not independently verified

- Nothing in the code. **But note:** no Codex review has run since commit
  `dec9d52`. The last review covered up to `fcbbf97`. Commits `d16b5bf`
  onwards (the lookup work, the roster, the merges, the branch resolution)
  are unreviewed. **The owner has ruled that Codex reviews Stage 1 before
  task 1.3 begins.**
- The reconciliation between `db:verify` (10 SQL checks) and `db:check` (15
  application checks) is by inspection, not by a test. They overlap
  deliberately but nothing asserts they agree.

### In progress

**Nothing is half-finished.** The working tree is clean and every migration is
applied. Task 1.3 has not been started — no file exists for it, and it is
**blocked on the Codex review of Stage 1** by the owner's decision.

### Known problems, all recorded in `TASKS.md`

1. **Three multi-person split rules are mis-parsed in
   `sql/people-roster-and-aliases.sql`.** Two have **no member rows at all**
   (the extractor's bracket capture returned nothing); a third used `-` as its
   separator so the whole string became one "name". **11 matters would lose
   every lawyer at Stage 2.** The firm has supplied the corrected membership —
   it is written out in full on task **2.7** in `TASKS.md`. The three tables
   `migration_multi_person_rule`, `_member` and `migration_excluded_name` are
   deliberately **not loaded** until this is applied.

2. **Five `_raw` columns must exist before Stage 2 loads a row.** Audit table
   in `docs/MIGRATION.md`. Task 1.3 must create:
   `hearings.legacy_action_raw`, `clients.legacy_branch_raw`,
   `hearing_attendees.legacy_name_raw`, `admin_tasks.legacy_assignee_raw`, and
   a raw column on whatever holds the POA lawyer list.
   `hearing_attendees` is the serious one: 373 spellings collapse to 135
   people and nothing currently records which spelling a given hearing used.

3. **`client_branch` holds three different concepts.** **RESOLVED and
   applied** — task 1.2c, migration 0007, decision **D19**. 31 values → 15.
   One field correction is still open; see §8, question 1.

4. **The design hook flags the accent stripe** on
   `src/app/page.module.css:44` on every write to that file. The owner ruled:
   **leave it, stop raising it.** The file is the temporary task 0.4 scaffold
   and Stage 5 deletes it. Do not suppress it either — the ignore command was
   blocked, and a suppression outliving the page is worse than the warning.

5. **`npm run db:reset` now always needs `--force-i-know`**, because the 130
   lookup rows and 135 people mean the database is never empty. That is
   correct behaviour. `CLAUDE.md` rule 13 requires asking the owner first. The
   owner's ruling: leave it, revisit at task 2.3.

6. **`npm run test:guard` refuses to run** for the same reason — the guard
   tests write fixture tables into a database that now holds project data.
   Rule 14 working as designed. See §8, question 5.

7. **`npm run db:verify` reports one FAIL**, and has since 21 Aug 08:20 — a
   cleanly rolled-back migration row that the check reads as "did not finish".
   Pre-existing, harmless, and misleading. See §8, question 4.

### No known bugs in committed code.

---

## 7. Next Steps

### 1. Apply the `client_branch` resolution — DONE, migration 0007

Applied 21 August 2026 as task **1.2c**, commit `ca306f3`. Decision **D19**;
the full mapping and reasoning are in `sql/client-branch-resolution.sql`, and
the applied version is the migration. Do not redo it.

`client_branch` 31 → 15, lookups 146 → 130, crosswalk 4 → 20, the `جنح` chain
collapsed. The two Stage 2 rules it carries — never overwrite an existing
`matter_category`, and the three `separate_client` values mean the matter is on
the wrong client — are on tasks 2.5 and 2.6, in D19, and in the `reviewer_note`
of every affected crosswalk row. `npm run db:check` asserts all three
`separate_client` rules are present.

One field correction is still open — see §8, question 1.

### 2. Task 1.3 — core schema

`clients`, `contacts`, `matters`, `hearings`, `admin_tasks`, `task_actions`,
`powers_of_attorney`, `documents`, `fee_letters`, per `docs/DATA-MODEL.md`.

Must include the **five `_raw` columns** listed in §6 item 2, and assert they
exist. `matters` needs `court_id` and `circuit_id` as **two separate columns**
(reports join them for display). `matters.case_number_ar` is multi-line and
must never be split (D9).

### 3. Task 1.4 — junction tables

`matter_lawyers`, `matter_parties`, `matter_party_roles`, `hearing_attendees`,
`fee_letter_matters`.

### 4. Task 1.5 — billing and deferred tables

`invoices`, `payments`, `attendance`, `invoice_allocations`. Empty but
correctly keyed (D3). Invoices are read-only for **all** roles including
Administrator (D4, `docs/PERMISSIONS.md`).

### 5. Task 1.6 — Arabic search

Unblocked; the values it indexes are settled. The normaliser becomes a
PostgreSQL function with generated normalised columns and `pg_trgm` indexes.

**Fold: diacritics, tatweel, `أ إ آ ٱ → ا`, `ة → ه`, `ى → ي`, `ؤ → و`,
`ئ → ي`, Arabic-Indic digits `٠-٩ → 0-9`, lowercase Latin, `J ↔ ق`, and the
space in compound names (`عبدالعزيز` / `عبد العزيز`).**

**Never fold a dropped middle name.** Test: `احمد` finds `أحمد`; `140J` finds
`140ق`.

### 6. Then Stage 2 — migration

Read all of `docs/MIGRATION.md` first. Before task 2.1, confirm with the owner
that a **copy** of the `.accdb` exists on the machine and that Microsoft Access
or the Access Database Engine is installed, with bitness matching PowerShell.
Nothing in Stage 2 can run without both.

---

## 8. Open Questions

1. **`آراء قانونية` — `matter_type` or a new `matter_category`?**
   The branch resolution gave it as `matter_category → رأي قانوني`. That value
   does not exist in `lookup_matter_category`; it exists, spelled exactly so,
   in `lookup_matter_type` (id 3), and D8 defines `matter_type` as "what kind
   of work?". It is applied as `matter_type`, with a `reviewer_note` on the row
   saying so. **Ask the firm to confirm.** If they meant a new
   `matter_category` value instead, it is one UPDATE plus a new list entry —
   nothing has loaded against it. The migration would have refused the mapping
   as originally written; that was proved deliberately (break test C).

2. **The three "separate client" values need new client records.**
   `سيجما للإعلام (تليفزيون الحياة)`, `ألفا مصر للتجارة` and
   `سيجما للصناعات الدوائية`. The firm decides which client each affected
   matter belongs to. Until then those matters are quarantined at task 2.6.
   **No action needed now**; flagged so it is not forgotten.

3. **Codex has not reviewed anything after `fcbbf97`.** Fourteen commits,
   including all of Stage 1, are unreviewed. **The owner has ruled: Codex
   reviews Stage 1 BEFORE task 1.3.** Do not start 1.3 until that review has
   run and its findings are closed.

4. **`npm run db:verify` reports one FAIL, and has since 21 Aug 08:20.**
   Not caused by any recent work. `_prisma_migrations` holds a row for
   `20260821081746_people_roster_and_teams` with `finished_at` NULL and
   `rolled_back_at` set — the failed attempt described under "Choosing a
   migration folder" in §5. It was cleanly rolled back and superseded by
   `20260821082308_people_roster_and_teams`; `prisma migrate status` says the
   schema is up to date, and `db:check` counts only finished migrations.
   The check reads *any* unfinished row as "a migration did not finish", which
   does not distinguish a **cleanly rolled-back** migration from one that
   **died half-way** — and only the second is dangerous.
   **Left alone deliberately**, because it touches migration-history semantics
   and was outside the task. **My recommendation:** separate the two cases, so
   a rolled-back-and-superseded row reads as history rather than as a failure.
   A check that is permanently red teaches people to ignore a red line.

5. **`npm run test:guard` now refuses to run**, for the same reason
   `db:reset` always needs `--force-i-know`: the database holds 130 lookup
   rows, 135 people and 347 aliases, and the guard tests write fixture tables
   into it. **This is CLAUDE.md rule 14 working, not a bug** — but it means
   the 22 guard cases have not run since task 1.1, and the handoff previously
   described the suite as "destroys nothing", which is no longer the way it
   behaves. Worth deciding before Stage 2: give the guard tests their own
   throwaway database, or accept that they only run on an empty one.

6. **Task 1.2a's 347 aliases** — confirmed by the owner in writing:
   339 originals + 6 self-references + 2 spacing variants. Closed.

## A note on `CLAUDE.md`

Not modified this session beyond the additions the owner explicitly directed
(rules 11–14, and the boundary clause inside rule 11). It holds **15 rules**
and is correct as it stands.

**Rule 11 governs it:** you may add or clarify a rule, disclosed in your
message and committed separately; you may **not** remove, weaken or narrow one
without the owner's approval. A handoff document is not approval. If you
believe something belongs in `CLAUDE.md`, say so and wait.

Nothing from this session is currently believed to be missing from it. The nine
migration rules live in `docs/MIGRATION.md` by design — they are Stage 2
working knowledge, not standing instructions, and `CLAUDE.md` rule 14 already
points at the one that matters most.
