# Handoff — Litigation Management System

Written 23 August 2026, end of session. Assumes you have no memory of the
conversation that produced the state below.

**Read first, in this order:** `CLAUDE.md` (**16** durable rules — binding),
`docs/DECISIONS.md` (**D1–D22**), `TASKS.md` (build order and current
position), then this file. Before Stage 2 also read `docs/MIGRATION.md` in
full and `docs/STAGE-2-PLAN.md`.

Last commit: `8f9abbd`. Working tree clean. **STAGE 1 IS COMPLETE AND
REVIEWED, AND THE FIRM'S FIVE CORRECTIONS ARE APPLIED.** All nine findings of
the Codex review (`docs/reviews/2026-08-23-stage-1-full.md`) are closed, the
court list is seeded, and **23 migrations** are applied.

```
npm run db:check    36 of 36 pass
npm run db:verify   10 of 10 pass
npm run check       6 gates pass
npm run test:gate1  15 cases pass
npm run test:guard  REFUSES BY DESIGN — see §6
```

**Nothing is half-finished.** The next action is **task 2.1 — Extract**, and
both of its preconditions are now cleared: the firm has approved
`docs/STAGE-2-PLAN.md`, and the machine has been verified. See §7.

**A NOTE ON DATES.** The previous handoff was dated 24 August 2026. That was
wrong — the machine date was 23 August, and the migration folders from that
session are stamped `20260823`. Corrected everywhere except two applied
migrations, whose comments still say 24 August: Prisma checksums applied
migrations, so editing even a comment makes `migrate dev` and `migrate deploy`
refuse. **Do not "tidy" them.**

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
npm run db:migrate:deploy   # apply all 23 migrations
npm run db:check            # 36 checks, all must read OK

npm run dev                 # http://localhost:3000
npm run build               # production build
```

```bash
# before every commit — six gates, all must pass
npm run check               # typecheck + lint + format:check + check:rtl
                            #   + check:gitignore + check:encoding
                            # check:rtl also refuses a raw #hex outside the
                            # token layer — added this session

# the two test suites (not in `check` — they need Docker / PowerShell)
npm run test:guard          # 12 parser + 10 guard cases. REFUSES now — see §6.
npm run test:gate1          # 15 cases. Runs under pwsh AND Windows PowerShell 5.1.
```

```bash
# database
npm run db:up / db:down / db:logs / db:psql / db:studio
npm run db:verify           # 10 SQL-level checks inside the container
npm run db:check            # 35 application-level checks through Prisma
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
CLAUDE.md                   16 rules for the builder. DO NOT EDIT without owner approval.
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
  migrations/               22 applied migrations, listed in §3
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
  check-db.ts (*)           35 application-level checks
  write-baseline.ts (*)     writes the reviewed-links baseline; refuses silent overwrites
  lib/reviewed-links.ts (*) baseline parse/compare/digest. Pure, no database
  lib/read-links.ts (*)     the one place that reads links out of the database
  baselines/reviewed-links.json (*)  347 alias links + 114 crosswalk rules,
                              each verified against the target the firm reviewed
  check-rtl.ts (*)          RTL + hardcoded-text checker, with a self-test
  check-gitignore.ts (*)    65 dangerous paths must be blocked, case-sensitively
  check-encoding.ts (*)     .ps1 must have a BOM; everything else must not
  test-db-reset-guard.ts (*)  12 parser + 10 guard cases
  test-gate1.ps1 (*)        15 Gate 1 cases
  generate-lookup-seed.ts (*) sql/ -> migration seed for the 9 lookups
  generate-roster-seed.ts (*) sql/ -> migration seed for the roster
  generate-court-seed.ts (*)  NEW. sql/lookup-court-and-crosswalk.sql ->
                              migration 0022. 308 courts, 94 rules
  fixtures/rtl-violations/  (*) deliberately wrong files the self-test must catch
  fixtures/rtl-clean/       (*) deliberately correct files it must stay silent on

sql/                        THE SOURCE OF TRUTH FOR DATA. Reviewed by the firm.
  lookup-court-and-crosswalk.sql (*) NEW. the firm's review of 401 court
                              names -> 308 courts + 94 rules. D22
  court-wrong-destinations.sql (*)   NEW. 5 values that were courts filed as
                              matter_destination; destination 27 -> 31
  client-branch-resolution.sql the firm's 21 Aug branch ruling. D19
  lookups-and-crosswalk.sql       5 lookups + the crosswalk table definition
  lookups-part2-and-teams.sql (*) 4 lookups + teams. Edited by the 21 Aug corrections
  people-roster-and-aliases.sql   135 people, 339 aliases, split rules
  lookup-corrections.sql          the firm's 21 Aug merge instructions

docs/
  PRD.md (*)                what the system must do
  DECISIONS.md (*)          D1–D22. Outranks any skill or plugin advice
  DATA-MODEL.md (*)         every table and column
  MIGRATION.md (*)          the migration, the gates, and 12 hard-won rules
  DATABASE.md (*)           running the database in plain language
  PERMISSIONS.md (*)        four roles
  BRAND.md (*)              TWO COLOUR LAYERS — brand palette, then UI tokens
  VISUAL-DIRECTION.md (*)   NEW. Light not dark; colour meaning; Kufic motif;
                            numerals settled Western (§6 of that file)
  STAGE-2-PLAN.md (*)       NEW. Stage 2 in plain language, for the firm to
                            read and approve BEFORE it runs
  GLOSSARY.md (*)           Arabic legal terms. Never guess one
  REPORTS.md / REPORT-LAYOUTS.md   45 reports and their house style
  PATCHES.md                applied 20 Aug; kept as a record. Do not re-apply
  reviews/*.md (*)          FIVE Codex reviews. All findings closed
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
| 0008 | `20260821154211_confirm_legal_opinion_is_a_matter_type` | one `reviewer_note`: the firm confirmed `آراء قانونية → matter_type رأي قانوني`. No mapping changed |
| 0009 | `20260821202303_one_primary_alias_per_person` | demotes 2 surplus primary aliases; adds the **partial unique index** that makes a second primary impossible |
| 0010 | `20260821203117_team_composition_postcondition` | asserts the 2 teams, their exact 4 + 4 membership as a set, and the reviewer — the postcondition migration 0004 should have had |
| 0011 | `20260822065822_core_schema` | task 1.3 — 11 tables and `lookup_court`, all empty; 11 `_raw` columns, 8 nullable links and the D9/D15 schema shapes all asserted |
| 0012 | `20260822072541_complete_four_column_lists` | the real Access columns for `contacts` (17), `powers_of_attorney` (15), `fee_letters` (10), `task_actions` (7), with fill rates; a fourth person-name raw column |
| 0013 | `20260822073021_junction_tables` | task 1.4 — 5 junction tables, the fifth `_raw` column, 3 CHECK constraints and one-lead-per-matter |
| 0014 | `20260822082441_poa_capacity_and_inventory` | `الصفة` is live and `صفة الموكل بالتوكيل` an abandoned duplicate; `مسلسل`/`حرف` text, `جرد` boolean |
| 0015 | `20260822082711_billing_and_deferred` | task 1.5 — invoices, payments, invoice_allocations, attendance; exact numerics, no `Pay-Date` |
| 0016 | `20260822083141_arabic_search` | task 1.6 — `ar_normalise()`, 7 shadow columns, 7 triggers, 6 trigram indexes |
| 0017 | `20260822124335_billing_column_lists` | the real Access columns for the four billing tables; 3 Latin lookups; drops 3 invented placeholders |
| 0018 | `…_restore_trigram_indexes` | restores the 6 trigram indexes 0017 dropped, now declared in `schema.prisma` so Prisma owns them |
| 0019 | `…_invoice_flag_types` | `VAT?` and `report` become booleans; `R-#` is an amount and `R-$` its currency — an inverted reading corrected. Guards on an empty table |
| 0020 | `…_remove_j_to_qaf_fold` | **the `J → ق` fold removed entirely** — it turned the client `JTI` into `قTI`. Shadow columns recomputed |
| 0021 | `…_financial_constraints` | the two unconstrained money columns; `clients.full_name_normalised` indexed — this is the **seventh** trigram index |
| 0022 | `…_court_list_and_crosswalk` | **308 courts and 94 rules** from the firm's review of 401 names; `matter_destination` 27 → 31; adds a permanent assertion that no lookup value is also a crosswalk source (no chains) |
| 0023 | `…_circuit_crosswalk_target` | **`26` is a CIRCUIT, not a discard.** Adds the first **text target** rule kind. One court discard remains (`/`), not two. Seven postconditions |

Every migration ends in a `DO $$` block asserting its counts. A migration runs
in a transaction, so a failed assertion rolls the whole thing back — there is
no half-seeded state to discover later.

### Live figures — asserted by `npm run db:check`

```
lookups        134 rows across the 9 classification lists
  matter_type 14 · matter_category 21 · degree 12 · venue 7 · importance 3
  party_role 11 · hearing_action 20 · matter_destination 31 · client_branch 15

lookup_court   308        (D22 — its own list, not one of the nine)
billing lookups 11        invoice_type 2 · invoice_status 5 ·
                          lawyer_share_role 4. Latin codes, label_ar still NULL

people         135
  staff 64 (current 21, former 43) · external 71
aliases        347
teams          2 — 8 members, 5 of them current; 16 current staff have none

crosswalk      114 rules, 0 dangling, 0 unrecognised
  52 court · 35 SPLIT (court + circuit from one string) · 9 matter_category
  5 matter_destination · 3 hearing_action · 3 separate_client
  1 matter_type · 1 degree · 1 quarantine · 1 circuit · 3 discarded

               The 3 discards are 2 client_branch document headings (D19,
               correct) and ONE court value, `/`. **Exactly one court
               discard** — asserted permanently, in both directions.
               `26` is now a CIRCUIT rule (migration 0023), not a discard.

primaries      exactly 1 per person, each equal to people.name_ar,
               enforced by a partial unique index
baseline       347 alias links + 114 crosswalk rules, each verified to point
               at the SAME target the firm reviewed
               (scripts/baselines/reviewed-links.json)
```

### Tables that exist — 36 ours, plus Prisma's ledger

Everything is **empty** except the 14 lookups and the two people tables.
Verified against `information_schema` on 24 August 2026: 37 base tables in
`public`, of which one is `_prisma_migrations`.

```
lookups (14)   lookup_matter_type, lookup_matter_category, lookup_degree,
               lookup_venue, lookup_importance, lookup_party_role,
               lookup_hearing_action, lookup_matter_destination,
               lookup_client_branch, lookup_court, lookup_team,
               lookup_invoice_type, lookup_invoice_status,
               lookup_lawyer_share_role
people (2)     people, person_name_alias
core (10)      clients, client_logos, contacts, matters, hearings,
               admin_tasks, task_actions, powers_of_attorney, documents,
               fee_letters
junction (5)   matter_lawyers, matter_parties, matter_party_roles,
               hearing_attendees, fee_letter_matters
billing (4)    invoices, payments, invoice_allocations, attendance
migration (1)  migration_crosswalk
```

`db:check` asserts **23 tables and 21 `_raw` columns** for the
core/junction/billing set specifically — that subset, not the total above.

Conventions on all of them: snake_case ASCII physical names, PascalCase Prisma
models with `@@map`. Audit columns `created_at`, `created_by`, `updated_at`,
`updated_by` on every application table. **`created_by`/`updated_by` are plain
integers with no foreign key yet** — they gain one in Stage 3 when `users`
exists.

`people` notes: `email` is nullable and unique (PostgreSQL allows many NULLs, so
that is "unique where present"). `can_login` is `false` for all 135 and is set
per account at Milestone 4. `team_id` is nullable and NULL is common and valid.

### Not yet built

`users` — Stage 3. **Every other table in `docs/DATA-MODEL.md` now exists**,
empty and correctly keyed.

`migration_multi_person_rule`, `migration_multi_person_member`,
`migration_excluded_name` — deliberately deferred to task 2.7, see §6.

The staging schema (`stg`) and quarantine schema (`qc`) do not exist yet;
they are tasks 2.2 and 2.4.

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

## 4. Decisions Made — engineering choices not in `docs/DECISIONS.md`

`docs/DECISIONS.md` holds **D1–D22** and is the authority on what the firm
decided. Do not duplicate it here. Below are engineering choices made while
building, which are not in that file.

1. **Extensions and the `arabic` collation live in a Prisma migration, not the
   Docker start-up script.** `prisma migrate reset` rebuilds the public schema
   and discards anything created outside a migration. Tested: a collation made
   by hand vanished; the migration-owned one returned. Evidence in
   `docs/DATABASE.md`.

2. **The Docker start-up script CHECKS and creates nothing.** It verifies the
   three things a migration can never fix — encoding, collation provider,
   locale — because they are fixed when the cluster is created.

3. **Seeds are generated from `sql/*.sql`, never retyped.** Three generators
   now: `generate-lookup-seed.ts`, `generate-roster-seed.ts`,
   `generate-court-seed.ts`. Each asserts every row count before writing.

4. **Seeds live in migrations, not `prisma db seed`.** The application cannot
   work without the lookups, so a fresh database must arrive complete.
   `migrate deploy` runs a migration; `db seed` would not.

5. **Plain CSS, no framework**, so `check:rtl` can find a violation by reading
   the stylesheet.

6. **PostgreSQL on port 5433.** See §5.

7. **`migration_crosswalk` created in Stage 1, not Stage 2** — it holds real
   rules now, and "remember to add these later" is a dependency on memory.

8. **The three `migration_multi_person_*` tables were pulled forward and then
   pushed back**, because writing their assertion proved the data is not ready.
   See §6 item 1.

9. **`npm audit` reports 3 high advisories** in `deepmerge-ts`, reached only
   through `@prisma/config` — the Prisma CLI, a dev dependency never shipped.
   The offered fix downgrades to Prisma 6. **Not taken.** Re-assess at 7.1.

### Added 23 August 2026 (second session)

17. **The crosswalk has a fourth rule kind: a TEXT TARGET.** `target_field =
    'circuit'` (migration 0023). Recognised, never resolved against a list —
    a circuit is text by **D20** — and **required to carry a non-empty
    `target_value`**. That requirement is not tidiness: a kind merely *exempt*
    from resolving would let a rule carrying nothing pass both the
    "unrecognised" and the "dangling" check and look healthy. When adding any
    future rule kind, give it a positive assertion, never an exemption.

18. **Gate 1 asserts against the file it actually reads.** The 19 August row
    counts are a **shape check**, not a pass condition — the firm's ruling.
    The file drifts ~100 records a day, so a gate demanding 13,279 hearings
    would refuse a good extraction, and a gate that fails on correct data gets
    loosened until it passes. Full rule in `docs/MIGRATION.md`, "What Gate 1
    actually asserts". **Cascaded:** 30,553 and 35,343 also move, so Gate 4
    proves the *identity* (migrated + archived = every row), not the
    constants.

### Added earlier

10. **The `J → ق` fold is removed from `ar_normalise()` entirely** — not
    narrowed, removed. Migration 0020. The PRD had asked for it so that `140J`
    finds `140ق`, but the fold applied to every `J` anywhere, so the client
    `JTI` normalised to `قTI` and became unfindable by its own name. **The
    current behaviour is: `JTI → jti`, `140J → 140j`, `140ق → 140ق`.**
    Searching `140J` no longer finds `140ق`. That is a deliberate, accepted
    loss — see §8 item 5. `AGENTS.md` records that the fold is *removed*, not
    *missing*, so a reviewer does not file it as a defect.

11. **`BRAND.md` now has two colour layers.** Layer 1 is the brand palette (the
    firm's colours, fixed). Layer 2 is the UI token set that the interface
    actually uses. Components reference **tokens only**, never the palette and
    never a raw hex. The rule is stated in `docs/BRAND.md` under "The rule".

12. **`check:rtl` refuses a raw `#hex` outside the token layer.** Rule 3 in
    `scripts/check-rtl.ts`, rule ids `raw-hex` (components) and `raw-hex-css`
    (stylesheets). A hex is allowed on exactly one kind of line: one that
    *defines* a custom property. The self-test is now **22 rules / 59
    findings**, with fixtures in `scripts/fixtures/rtl-violations/`.

13. **`docs/VISUAL-DIRECTION.md` is new and is separate from `BRAND.md` on
    purpose.** `BRAND.md` is the fixed inventory — colours, fonts, RTL
    mechanics. `VISUAL-DIRECTION.md` is judgement: light not dark, what colour
    means, composition, the Kufic motif, report treatment. Section 7 of that
    file states what it is *not*, so the two do not drift into each other.

14. **`docs/STAGE-2-PLAN.md` is written for the firm, not for engineers.** It
    describes the migration in plain language so the owner can approve it
    before it runs. It is the document the five corrections in §7 amend.

15. **Court values that were filed as `matter_destination` were moved, not
    duplicated.** `sql/court-wrong-destinations.sql`; `matter_destination`
    27 → 31. Recorded so nobody "restores" them later.

16. **Twelve rules now live in `docs/MIGRATION.md`**, each written after a real
    failure. Read that file before Stage 2. In brief:
    - Never match an Arabic name without asserting the row count
    - The four classes of Arabic name variation — class four (a dropped middle
      name) can **never** be folded by a normaliser
    - The cascade rule — one changed figure moves every derived figure
    - A check must be tested where it will actually run
    - Validate what you receive, never assume its shape
    - An assertion tests what it looks at, and nothing else
    - Prove the check catches a failure
    - A merge instruction is Arabic text too, and must be normalised
    - A many-to-one mapping needs a `_raw` partner or it is irreversible
    - A count in an instruction is a claim, not a fact — count the items
    - Counting a mapping is not checking it (see the baseline, §6)
    - A fold that is right for one field can be wrong for another — the `J`
      fold is the worked example

---

## 5. Dead Ends — Do NOT Retry

**Port 5432 for our PostgreSQL.** The owner's laptop had another PostgreSQL on
it (ZKBioTime, since uninstalled). We use **5433** on both machines so one set
of instructions works everywhere and a future server PostgreSQL on the default
port cannot collide. The owner ruled: do not change it back.

**`prisma init`.** It writes agent-skill directories into the repository
(`.claude/skills/`, `.agents/skills/`, `skills-lock.json`). The Prisma config
is hand-written. Do not run it.

**A BOM-less `.ps1`.** `scripts/01_extract_access.ps1` must stay **UTF-8 WITH a
byte-order mark**. Windows PowerShell 5.1 — the version needed for Access COM
interop — reads a BOM-less `.ps1` as Windows-1252 and corrupts every Arabic
table name in it. Before the BOM it would not even parse. `check:encoding`
enforces this; the script also self-checks at runtime.

**Delimited text for anything whose values you do not control.** The `db:reset`
inventory was `schema|table|count` split on the pipe. A table named
`review|guard_fixture` broke the parse, `Number('guard_fixture')` gave NaN, and
three real rows read as an empty table. It is JSON now, every field validated.
Escaping the delimiter only moves the problem.

**Choosing a migration folder with `find … | sort | tail -1`.** `prisma migrate
dev` had failed, so no new folder existed, and 638 lines of roster seed were
appended to an already-applied migration. Prisma's shadow-database replay
caught it, not any check of ours. The generators now refuse any file that is
not a new, empty migration of the right kind.

**Skipping `prisma migrate dev` locally in favour of `migrate deploy`.** The
shadow-database replay is a free safety net that caught the above.

**Exact-matching an Arabic name.** Three separate bugs. The roster generator
reported "0 mentions" and created two duplicate people, one carrying 1,309
hearings. The same fault later created three more phantom people by
exact-matching a *merge target*. Always match through `person_name_alias`, and
normalise both sides of a merge instruction.

**Extending the normaliser to guess at dropped middle names.** `سامي خطاب` /
`سامي إبراهيم خطاب` cannot be folded by any rule without merging genuinely
different people who share a first and last name. Human-recorded aliases only.

**Conjunction-stripping on names.** The `و`-prefixed spellings genuinely
appeared in the Access data and the firm's review assigned each to the right
person. They are correct as aliases. Ruled by the owner.

**Editing an already-applied migration.** Corrections go in a new migration.
0003 corrects 0002; 0005 and 0006 correct 0004; 0018 corrects 0017; 0020
corrects 0016.

**`docker compose down -v` by hand.** Use `npm run db:reset`, which is guarded.
`CLAUDE.md` rule 12.

**`--force-i-know` without asking the owner.** `CLAUDE.md` rule 13.

**Editing an applied migration's COMMENT.** Not just its SQL. Prisma checksums
the whole file, so changing a comment makes `migrate dev` and `migrate deploy`
refuse with "migration modified" on every machine that already applied it. Two
migrations carry a wrong date (24 August) in a comment for exactly this reason
and are left alone deliberately — see the note at the top of this file.

**Giving a new crosswalk rule kind an EXEMPTION instead of an assertion.** The
text target (`circuit`, migration 0023) is exempt from resolving against a list
because there is no list — but it is NOT exempt from carrying a value. Without
that positive requirement, a circuit rule holding nothing would pass both the
"unrecognised" and the "dangling" check and read as healthy. Any future rule
kind needs the same treatment: name what makes it *correct*, not merely what it
is excused from.

### Added this session

**Re-introducing the `J → ق` fold in any form.** It was removed in migration
0020 because it corrupted the client name `JTI` into `قTI`. A narrowed version
— "only when `J` follows digits" — was considered and **rejected**: case
numbers appear as `J2391/18` (leading `J`) as well as `2391/18J`, so no
positional rule covers the real data without also catching Latin words. If the
firm later wants `140J` to find `140ق`, do it as a **search-time synonym on the
case-number field only**, never as a change to `ar_normalise()`, which is
shared by seven columns including client names.

**Declaring an index in SQL but not in `schema.prisma`.** Migration 0017
silently dropped all six trigram indexes, because Prisma removes an index whose
columns it manages but which the schema does not declare. Migration 0018
restored them and they are now declared in `schema.prisma`. `db:check` watches
for their absence.

**Trusting a lookup value that is also a crosswalk source.** A value that is
both a live list entry and something the crosswalk maps *away from* creates a
two-step chain that different code paths resolve differently. Migration 0022
adds a permanent assertion that no such chain exists. Do not create one; if a
value moves, remove it from the list in the same migration.

**Assuming a green count means a correct mapping.** Counting links and proving
none dangles says nothing about whether a link points at the *right* target.
That is what `scripts/baselines/reviewed-links.json` is for — see §6.

---

## 6. Current State

### Done and verified

**Stage 0 complete.** Repository skeleton, Docker PostgreSQL 17 with ICU
`ar-EG` on port 5433, Prisma 7 connected, the guarded `db:reset`, and the
Arabic RTL layout with the bundled font. Three Codex reviews, all findings
closed.

**Stage 1 complete and reviewed.**

| Task | What landed |
|---|---|
| 1.1 | Nine lookup tables, 150 → 146 rows after four merges |
| 1.2 | 138 people, 339 aliases, 2 teams |
| 1.2a | Aliases 339 → 347; every person findable by their own name |
| 1.2b | Three name-variant duplicates merged; people 138 → 135 |
| 1.2c | `client_branch` 31 → 15 (**D19**); lookups 146 → 130 |
| 1.2d | The four findings of the 21 Aug review closed |
| 1.3 | Core schema, 11 tables (**D20**, **D21**) |
| 1.3a | Four real Access column lists, with fill rates |
| 1.4 | Junction tables; all five `_raw` columns present |
| 1.4a | POA columns read by the firm: `الصفة` live, `صفة الموكل بالتوكيل` an abandoned duplicate |
| 1.5 | Billing and deferred tables; exact numerics, no `Pay-Date` (D4) |
| 1.5a | Billing column lists; three invented placeholders dropped |
| 1.6 | Arabic search — `ar_normalise()`, 7 shadow columns, 7 triggers, 7 trigram indexes |

**This session, on top of that:**

- **All nine findings of the 24 August full Stage 1 review are closed**
  (`docs/reviews/2026-08-23-stage-1-full.md`): 4 MUST, 4 SHOULD, 1 MINOR.
  In summary —
  - the two unconstrained money columns now have constraints, and `db:check`
    watches all of them (migration 0021)
  - database-only guards are checked by **what they do**, not by name:
    `db:check` now exercises 9 CHECK constraints and 2 partial indexes against
    real values rather than reading `pg_constraint`
  - the standing Arabic guard covers all seven normalised fields and its
    negative cases — "does not over-fold" is asserted, 10 of 10
  - the invoice-share assertion no longer passes null shares
  - the 15 approved client branches are checked **by name**, not by count
  - the eleven billing lookup codes are checked by content
  - the superseded facts in `docs/DATA-MODEL.md` and elsewhere corrected
  - the MINOR label fixed: the check now says "15 links + 1 date", which is
    what it actually proves
- **The `J → ق` fold removed** (migration 0020). See §4 item 10 and §5.
- **The court list applied** (migration 0022, **D22**): the firm reviewed 401
  distinct court names and produced **308 courts and 94 crosswalk rules**, of
  which 35 SPLIT one string into a court plus a circuit. `matter_destination`
  27 → 31 for five values that were courts filed in the wrong list.
  A permanent assertion now forbids lookup/crosswalk chains.
- **`docs/VISUAL-DIRECTION.md`** created and reconciled with `BRAND.md`.
- **`BRAND.md` restructured into two colour layers**; numerals settled as
  **Western (0–9)**, recorded in `VISUAL-DIRECTION.md` §6.
- **The raw-hex checker** added to `check:rtl` (22 rules, 59 findings).
- **`docs/STAGE-2-PLAN.md`** written for the firm to approve before Stage 2.

Every assertion above was **proved by deliberately breaking it**; the commit
messages carry the exact error text each produced.

**This session (23 August, second sitting) — the firm's five corrections, all
applied:**

1. **The Access file is kept indefinitely**, not archived away at T+90. 90 days
   is how long it stays *immediately available*. `docs/MIGRATION.md` cutover,
   `docs/STAGE-2-PLAN.md` in three places, `TASKS.md` **7.5** — the cutover
   task. *Not 7.6: the previous handoff sent me there and 7.6 is the user
   guide, which carries no retention wording. Nothing was invented there.*
2. **`26` is a circuit, not rubbish** — migration 0023, and the first text
   target rule kind. See §4 item 17. Proved by breaking, five ways.
3. **The "nothing is thrown away" claim corrected.** No *record* is thrown
   away; one *value* is — the `/` — and its text stays in `legacy_court_raw`.
4. **Gate 3 ships as XLSX workbooks**, one sheet per topic, with per-row
   context for the ~474 attendee names, colour-coded by confidence, answered
   with a long-serving colleague present, "unknown person" never guessed.
   `docs/MIGRATION.md` beside Gate 3, `TASKS.md` **2.4**.
5. **Cutover is a normal working day**, announced at T-8, **Khaled Helmy signs
   off at T-7 by name**. `TASKS.md` **7.4**.

Plus, all from the firm in the same sitting:

- **`docs/STAGE-2-PLAN.md` is APPROVED** — Khaled Helmy, 23 August 2026,
  recorded in the document itself so it is not asked again.
- **Gate 1's drift ruling** — §4 item 18.
- **`LawyerA+` is a co-lead, confirmed in writing.** Open question closed; it
  decided who is responsible on 171 matters.
- **The session date was 23 August, not 24.** Corrected in eleven files and one
  review filename. **Two applied migrations still say 24 August in a comment
  and must not be edited** — Prisma checksums them.

### Verification status

- `npm run db:check` — **36 of 36 pass.**
- `npm run db:verify` — **10 of 10 pass.**
- `npm run check` — six gates pass.
- `npm run test:gate1` — 15 cases pass, under both PowerShell 5.1 and 7.
- `npm run test:guard` — **refuses to run.** By design; see below.
- **Independently reviewed** up to and including commit `c4f0689`. Everything
  after it is **unreviewed** — four documentation commits from the previous
  sitting, then this session's six. Migration 0023 and the `db:check` change
  are the only code in them.

### In progress

**Nothing.** Working tree clean, all 23 migrations applied, no half-written
file.

### Known problems and standing conditions

1. **Three multi-person split rules are mis-parsed in
   `sql/people-roster-and-aliases.sql`.** Two have **no member rows at all**;
   a third used `-` as its separator so the whole string became one "name".
   **11 matters would lose every lawyer at Stage 2.** The firm's corrected
   membership is written out in full on task **2.7** in `TASKS.md`. The three
   `migration_multi_person_*` tables are deliberately **not loaded** until it
   is applied.

2. **`npm run test:guard` refuses to run.** The database now holds 135 people,
   347 aliases, 114 crosswalk rules and 134 lookup rows, and the guard tests
   write fixture tables into it. **This is `CLAUDE.md` rule 14 working, not a
   bug.** Owner's ruling: leave it; the suite gets its own throwaway database
   at **task 2.3**. Until then its 22 cases do not run and the gap widens with
   every migration.

3. **`npm run db:reset` always needs `--force-i-know`** for the same reason.
   Correct behaviour. Rule 13 requires asking the owner first. Revisit at 2.3.

4. **The design hook flags the accent stripe** on `src/app/page.module.css`.
   The owner ruled: **leave it, stop raising it.** The file is the temporary
   task 0.4 scaffold and Stage 5 deletes it. Do not suppress it either.

5. **`TASKS.md` records the court work under task 2.5**, not as a Stage 1
   task. That is deliberate — the courts are a Stage 2 transform input — and
   migration 0023's correction is recorded in the same place. It does mean the
   Stage 1 checklist does not show that work. *Still uncertain whether the
   owner wants a 1.6a/1.6b entry; not done, and not worth a session on its
   own.*

6. **`db:verify` (10 SQL checks) and `db:check` (35 application checks)
   overlap by inspection, not by a test.** Nothing asserts they agree.

### No known bugs in committed code.

---

## 7. Next Steps

**The five corrections are applied and both preconditions for Stage 2 are
cleared.** Nothing stands between here and task 2.1.

### 1. Task 2.1 — Extract. START HERE.

`scripts/01_extract_access.ps1`.

**Verified on 23 August 2026, not taken on trust:**

```
source copy   "D:\chatGPT\Litigation-Database\migration-source\Litigation database (ID 23194).accdb"
              resolves · 46,661,632 bytes · modified 23 Aug 2026 10:31
Access        Microsoft Access 2021, 64-bit
DAO COM       DAO.DBEngine.120 v16.0 CREATES SUCCESSFULLY under BOTH
              Windows PowerShell 5.1 (64-bit) and PowerShell 7.6.5 (64-bit)
```

The copy is **already compacted** — 44.5 MB, not the 2 GB the live file sits
at. **The compact-and-repair on the production file is still outstanding and
still urgent.**

**THE SOURCE IS A REHEARSAL COPY AND HAS ALREADY DRIFTED.** Taken 23 August;
the live file moves ~100 records a day.

**THIS TASK MUST CHANGE THE SCRIPT BEFORE RUNNING IT.**
`scripts/01_extract_access.ps1` today hard-asserts the 19 August counts and
exits non-zero on any mismatch — which under the firm's ruling would refuse a
perfectly good extraction. Gate 1 becomes:

| | Pass condition |
|---|---|
| Self-consistency | rows written = rows read, per table, exactly; SHA-256 per file |
| Completeness | all **15** tables present, each non-empty |
| Complex columns | attachments **> 0** and multi-value **> 0** — a floor, not a match |
| Warnings | **zero**. Any warning is a failure |
| Shape | each count *reported* beside its 19 August figure, difference shown |

A count that has **fallen** is not drift and goes to the firm.
Full rule: "What Gate 1 actually asserts" in `docs/MIGRATION.md`.

**Prove the gate before trusting it** — point it at a table with a row removed,
blank an attachment, and confirm it stops. `docs/MIGRATION.md`, "Prove the
check catches a failure".

### 2. Task 2.2 — Staging schema

Every column `text`, plus `src_row_num` and `src_file`. No load can fail on a
type conversion.

### 3. Task 2.3 — Load to staging, Gate 2

And **give `test:guard` its own throwaway database here**, created and
destroyed per run, so its 22 cases run again (see §6 item 2).

### 4. Task 2.4 — Quarantine tables and profiling, Gate 3

**The XLSX review workbooks.** One sheet per topic; the ~474 attendee names
carry occurrence count, years, matters, clients and nearest roster matches with
a closeness score. Colour-coded by confidence. **"Unknown person" is never
guessed.** ExcelJS with `rightToLeft` on every sheet.

### 5. Tasks 2.5 – 2.12 — the transforms and Gate 4

In the order written in `TASKS.md`. Carry forward:

- **2.7** — the corrected membership for the three mis-parsed split rules
  (§6 item 1). Without it **11 matters lose every lawyer**.
- **2.5 / 2.6** — the two D19 rules: never overwrite an existing
  `matter_category`, and the three `separate_client` values mean the matter is
  on the **wrong client** and must be quarantined, never guessed.
- **2.9** — the `26` row lands here. **Assert both halves on the loaded row,
  not just on the rule:** circuit = `26` **and** `court_id IS NULL`. A court
  defaulted, inferred from the circuit, or set to the string `26` is a failure.
- **2.12** — Gate 4 reconciles the **identity** (migrated + archived = every
  row) against the extraction, **never** against 30,553 / 35,343.

## 8. Open Questions

**Nothing here blocks Stage 2 starting.**

**CLOSED 23 August 2026 — do not re-ask:**

- **`LawyerA+` is a co-lead.** Confirmed in writing. Proven from the
  collection-split data, not the name: every invoice with one reads Reviewer
  0.250 / LawyerA 0.375 / LawyerA+ 0.375, always a different person; without
  one, LawyerA takes the whole 0.750. `LawyerA → lead`, `LawyerA+ → co_lead`,
  `LawyerB → support`, `Reviewer →` its own role with no `matter_lawyers`
  equivalent. **Invoice 21819 has `LawyerA+` at 0.075, not 0.375** — all 15
  invoices still sum to 1, so it is deliberate. **No rule may assume 0.375.**
  Recorded in `docs/GLOSSARY.md`. This decided 171 matters.
- **`docs/STAGE-2-PLAN.md` is approved** — Khaled Helmy, 23 August 2026.
- **The machine facts for task 2.1** — verified, see §7.

**Still open.** The firm will bring these before their deadlines.

1. **What does `جرد` mean?** The firm reads it as "does it pass the periodical
   inventory check", which fits the data — 680 passing, 55 failing — but they
   said *"I think"*. It is recorded as **probable** in `docs/GLOSSARY.md` and
   modelled as a boolean on `powers_of_attorney`. **Nothing may depend on the
   reading until it is confirmed.** Ask when a POA screen is designed
   (task 4.5) at the latest.

2. **The `VAT?` / `R-#` / `R-$` readings.** Current model: `VAT?` and `report`
   are booleans; `R-#` is a receipt **amount** and `R-$` its **currency** —
   which corrects an inverted reading of mine. Migration 0019. The columns are
   empty, so nothing is at risk yet, but **the reading has not been confirmed
   in writing by the firm.** Confirm before task 2.10 loads invoices.

3. **The Arabic labels for the three Latin billing lookups.** `lookup_invoice_type`
   (2), `lookup_invoice_status` (5) and `lookup_lawyer_share_role` (4) keep
   their Access codes, with a nullable `label_ar` for the word shown on screen.
   These are financial terms and were **not invented** (`CLAUDE.md` rule 5).
   `db:check` asserts all eleven are still untranslated, so the gap cannot be
   forgotten. **Needed before task 4.8** (the billing screen), not before
   Stage 2.

4. **`140J` no longer finds `140ق`.** A consequence of removing the `J → ق`
   fold, accepted deliberately: the fold turned the client `JTI` into `قTI`.
   Recorded here so it is not rediscovered as a bug. If the firm wants it back,
   it must be a **search-time synonym on the case-number field only** — never a
   change to `ar_normalise()`, which seven columns share. See §5.

5. **The three "separate client" values need new client records.**
   `سيجما للإعلام (تليفزيون الحياة)`, `ألفا مصر للتجارة` and
   `سيجما للصناعات الدوائية`. The firm decides which client each affected
   matter belongs to; until then those matters are quarantined at task 2.6.
   No action needed now.

6. **The production Access file is still at its 2 GB ceiling.** The rehearsal
   copy is compacted; the live file is not. A file at its ceiling can refuse
   to save new records. The firm has been told twice. **Not a blocker for
   Stage 2, but it is the one item here that can lose data on any ordinary
   working day.**

---

## A note on `CLAUDE.md`

**Not modified this session.** It holds **16 rules**, each written after a real
bug in this project.

**Rule 11 governs it:** you may add or clarify a rule, disclosed in your
message and committed separately; you may **not** remove, weaken or narrow one
without the owner's approval. **A handoff document is not approval.** If you
believe something belongs in `CLAUDE.md`, say so and wait.

Nothing from this session is currently believed to be missing from it. The
twelve migration rules live in `docs/MIGRATION.md` by design — they are Stage 2
working knowledge rather than standing instructions, and rules 15 and 16
already point at the two that matter most.
