# Project Continuity Recovery Audit

> **Dated evidence snapshot — not current authority.** This report reconstructs
> the repository as it stood at commit `553b3d1` on 1 September 2026. Current
> decisions are in [`docs/DECISIONS.md`](../DECISIONS.md); current work order and
> return point are in [`TASKS.md`](../../TASKS.md); migration identities are in
> [`docs/MIGRATION.md`](../MIGRATION.md) and the
> [Gate 4 report](../reconciliations/2026-08-30-gate-4.md). Later owner
> resolutions and gap dispositions are recorded at the end of this report.

- **Audit date:** 1 September 2026
- **Repository:** `litigation-system` repository root
- **Audit type:** Read-only governance and evidence reconstruction
- **Audited checkpoint:** `553b3d1f68f0f798d2edf5bd3bb5f452ad05d59b`
- **Snapshot-preservation commit:**
  `5909fb79a0bef1a3480f05036c6ffea8d9413988`

**Verdict: continuity is recoverable.** The repository, Git history, local
migration evidence, and database invariants identify one coherent state: Task
3.2 is closed, no task is in progress, and the exact return point is **Task 3.3
— populate audit columns everywhere**.

Several documents are stale enough to misdirect a future agent—especially
`HANDOFF.md`—but they do not undermine the implemented database or current Git
checkpoint.

## Audit mandate and boundaries

- **Mandate:** reconstruct project continuity from repository, Git, migration,
  test, manifest and recorded runtime evidence without assuming access to old
  conversations.
- **Starting checkpoint:** local `main`, clean and synchronized with fetched
  `origin/main`, both at `553b3d1f68f0f798d2edf5bd3bb5f452ad05d59b`.
- **Authorized scope:** read tracked documentation, Git objects, code, tests,
  migration definitions, manifests, hashes and existing database/source
  evidence needed to establish identity and protected counts.
- **Configuration:** sole active agent; local repository and PostgreSQL evidence;
  no delegation, browser, external service or dependency change.
- **Prohibitions:** no file or database write, migration, import, seed, reset,
  fixture suite, implementation, commit, push, secret disclosure, raw-record
  reproduction, workbook-content reproduction or binary ingestion.
- **Stopping point:** report the evidence and stop. Task 3.3 must remain not
  started and must remain the exact implementation return point.

## 1. Repository checkpoint

| Check | Result | Evidence |
|---|---|---|
| Branch | `main` | Final `git branch --show-current` |
| HEAD | `553b3d1f68f0f798d2edf5bd3bb5f452ad05d59b` | Final `git rev-parse HEAD` |
| `origin/main` | Same exact SHA | `git fetch origin`, then final `git rev-parse origin/main` |
| Ahead/behind | `+0 / -0` | Final `git status --porcelain=v2 --branch` |
| Working tree | Clean; no staged or unstaged changes | Final status and both Git diffs empty |
| Main history | 132 commits, linear, zero merges | `git rev-list` |
| Latest closed task | Task 3.2, server-side authorization | [`TASKS.md` — Task 3.2](../../TASKS.md), commits `fb1651d`, `552711a`, `553b3d1` |
| Exact return point | Task 3.3, audit-column population | [`TASKS.md` — Task 3.3](../../TASKS.md) |
| Later work | Not started | Tasks 3.3 onward remain unchecked; no related changes found |

Because fetched `origin/main` equals the tip of the entire local `main`
ancestry, **every commit reported below as a main-branch task commit is
pushed**.

Final verification:

- `npm run check`: passed type checking, ESLint, formatting, RTL checks,
  authorization inventory, Git-ignore checks, and encoding checks.
- `npm run db:verify`: all 10 platform checks passed, including PostgreSQL
  17.11, UTF-8, ICU `ar-EG`, extensions, migration state, Arabic sorting, and
  connection round-trip.
- `npm run db:check`: **all 84 permanent invariants passed**.
- The Access source remained 46,661,632 bytes with its recorded modification
  time.
- Manifest and review-workbook hashes were unchanged.
- Extracted and runtime logos remained 54 files / 1,541,428 bytes.
- Report samples remained 9 files / 5,371,407 bytes.
- No migration, fixture suite, import, seed, reset, dependency installation,
  or other write-capable command was run.
- No file, database row, dependency, lockfile, configuration, or runtime
  artifact was changed.

One unrelated local branch exists:

- `codex/backup-installed-skills-8631d68` at `8631d68`, based at `ed3bfad`.
  It is not on current-main ancestry, is not present on a remote branch, and
  only adds `installed-skills.md`. It has no authority over this project state.

## 2. Authority and documentation map

Classification used below:

- **Current** — authoritative for its stated subject.
- **Historical** — evidence of an earlier checkpoint, not current instruction.
- **Implemented** — code/database enforcement exists.
- **Documented only** — decision exists but implementation is future work.
- **Contradictory** — conflicts with better current evidence.
- **Missing** — no durable repository evidence was found.

| Source | What it governs | Status and concerns |
|---|---|---|
| [`AGENTS.md`](../../AGENTS.md) | Codex role, owner relationship, review/build rules, tool and data restrictions, governance editing protocol | **Current, highest project operating instruction.** Repeats some `CLAUDE.md` material but explicitly cross-references its 16 rules. |
| [`CLAUDE.md`](../../CLAUDE.md) | The 16 shared working rules | **Current.** `AGENTS.md` incorporates these rules. Both must be read before governance edits. |
| [`README.md`](../../README.md) | Entry point, current stage, normal commands, architecture summary | **Current index**, but its statement that `npm run check` runs four checks is stale; it now runs seven. |
| [`docs/PRD.md`](../PRD.md) | Product scope, roles, language, reports, success criteria | **Current requirements with stale planning counts.** Its 30,553/35,343 migration success criterion is superseded by Gate 4’s 30,847/35,638 current-source result. |
| [`docs/DECISIONS.md`](../DECISIONS.md) | D1–D25 approved product, migration, data, authentication, storage, backup, and lifecycle decisions | **Current product/data authority.** It explicitly outranks skills and implementation preferences. |
| [`TASKS.md`](../../TASKS.md) | Ordered backlog, completion state, return point, detailed task evidence | **Current status authority.** First unchecked item is 3.3. Some planning figures retained inside later tasks need clearer historical labels. |
| [`docs/PERMISSIONS.md`](../PERMISSIONS.md) | Four-role permission matrix and server enforcement model | **Current for authorization.** Implementation exists. The supporting “834 of 1,730 matters” figure is an old snapshot. |
| [`docs/DATA-MODEL.md`](../DATA-MODEL.md) | Logical schema, current migration counts, field semantics | **Mostly current.** “17 tables in scope” is ambiguous against the much larger physical schema; “generated” search columns should say trigger-maintained; its POA terminology note conflicts with the glossary. |
| [`docs/MIGRATION.md`](../MIGRATION.md) | Migration architecture, gates, identities, reconciliation contracts, current Gate 4 result | **Current migration authority.** It correctly labels the old 19 August counts as historical. |
| [`docs/GLOSSARY.md`](../GLOSSARY.md) | Approved Arabic/legal field meanings | **Current terminology authority**, with two stale facts: attendance says 865 rather than 873 values, and the `J → ق` removal date says 24 rather than 23 August. |
| [`docs/BRAND.md`](../BRAND.md) | Arabic/RTL, visual tokens, font, Western numerals, report rendering | **Current design authority.** Its 35,343-row numeral observation is a dated sample, not the current source count. |
| [`docs/VISUAL-DIRECTION.md`](../VISUAL-DIRECTION.md) | Agreed visual direction | **Current direction, explicitly not a specification.** Contains dated 834-matter and 35,343-row examples. |
| [`docs/REPORTS.md`](../REPORTS.md) | Inventory and behavior of 45 reports | **Current report inventory.** The 259/313 no-logo count is stale. One layout remains pending. |
| [`docs/REPORT-LAYOUTS.md`](../REPORT-LAYOUTS.md) | Authoritative page/layout rules | **Current layout authority.** Same stale 259/313 count; correctly records one unknown layout. |
| [`docs/DATABASE.md`](../DATABASE.md) | Database operations and safety | **Current operational authority.** Its sample “7 applied, 1 rolled back” output is historical; live state is 52 applied and one historical rollback. |
| [`docs/STAGE-2-PLAN.md`](../STAGE-2-PLAN.md) | Owner-approved plain-language Stage 2 plan | **Approved historical plan plus completion summary.** Its Gate 1 prose still says 15 tables, while the implemented gate requires 17 in two groups. |
| [`docs/reconciliations/2026-08-30-gate-4.md`](../reconciliations/2026-08-30-gate-4.md) | Owner-readable Gate 4 evidence | **Current evidence report**, later extended to cover the authentication migration and 52-file inventory. |
| `docs/reviews/*.md` | Stage 0/1 independent review findings | **Historical.** Findings are useful evidence but later task entries and commits record their closure. They must not be read as current defects without rechecking. |
| [`docs/PATCHES.md`](../PATCHES.md) | Initial patch instructions | **Historical and already applied.** It explicitly must not be replayed. |
| [`HANDOFF.md`](../../HANDOFF.md) | 23 August handoff | **Superseded and dangerous if treated as current.** It says D1–D22, commit `8f9abbd`, Stage 1 complete, and “start Task 2.1”; it also contains obsolete governance rules. |
| [`public/fonts/README.md`](../../public/fonts/README.md) | Bundled font provenance/use | **Current supporting evidence.** |
| [`prisma/schema.prisma`](../../prisma/schema.prisma) and `prisma/migrations/` | Physical schema and immutable migration history | **Implemented authority**, subordinate to recorded business decisions. Current inventory is 52 migrations. |
| `scripts/`, `sql/`, and `src/` | Executable invariants, transforms, authorization, and application behavior | **Implemented evidence.** Material facts found only here include exact PostgreSQL catalog definitions and authorization-discovery failure cases. |
| Git main ancestry | When changes occurred and what superseded what | **Primary chronology.** No merges obscure ordering. |

Important precedence:

1. Owner instructions and the current `AGENTS.md`/`CLAUDE.md` operating rules.
2. `docs/DECISIONS.md` for product, legal-workflow, and data decisions.
3. `TASKS.md` for order and current progress.
4. Subject-specific canonical documents such as `MIGRATION.md`,
   `PERMISSIONS.md`, and `GLOSSARY.md`.
5. Code, migrations, and tests prove implementation; they do not silently
   supersede an owner decision.
6. Runtime counts are proved by `db:check` and Gate 4, not by dated planning
   examples.

No tracked implementation prompts or prior ChatGPT conversation transcript
were found. Original conversational approval evidence is therefore
unavailable; the repository’s decision records and dated task notes are the
durable evidence.

## 3. Operating conventions

1. **Owner authority.** Khaled retains final authority over business rules,
   legal workflow, priorities, budget, and acceptance. The active agent
   provides architecture, development, migration, UI/UX, RTL, and
   accessibility judgment.
   Evidence: `AGENTS.md`, “Who you are working with”.

2. **Professional challenge is required.** The agent must independently
   evaluate requests against evidence, decisions, security, integrity,
   usability, and maintenance cost, and explain concerns before
   implementation. It must not agree merely to be agreeable.
   Evidence: `AGENTS.md`, “How to communicate”.

3. **Material decisions use numbered analysis.** Each must include a
   recommendation, alternatives, pros, cons, practical example, and realistic
   cost/impact. Simple factual questions may be shorter.
   Evidence: `AGENTS.md`, “Numbered decisions”.

4. **Inspect before asking.** Repository, Git, database, extracted data, and
   workbooks must be investigated before asking the owner a technical
   question. Safe reversible technical choices belong to the active developer;
   material business/security/data choices return to Khaled.
   Evidence: `AGENTS.md`, communication rules.

5. **Mandatory reading and precedence.** Read `README.md`, PRD, decisions,
   tasks, and `CLAUDE.md`; decisions outrank skills or plugins.
   Evidence: opening of `AGENTS.md`; `CLAUDE.md` rule 1.

6. **Task order is binding.** Work through `TASKS.md` sequentially, one task
   at a time. Do not start later work.
   Evidence: `CLAUDE.md` rule 2 and `AGENTS.md` summary.

7. **Commit discipline.** Normal implementation work must end in small,
   working local commits with clear messages. Remote push, PR, issue, or
   comment actions require explicit permission each time.
   Evidence: `CLAUDE.md` rule 3; `AGENTS.md`, “Tools you may not use”. This
   audit overrode normal local-commit behavior by expressly prohibiting writes
   and commits.

8. **One active developer.** Codex is presently the primary and exclusive
   active development agent. Claude may return only after the owner explicitly
   pauses/reintroduces tools; two agents must never share the working tree
   concurrently.
   Evidence: opening of `AGENTS.md`. No delegation occurred in this audit.

9. **Historical dual-agent work requires caution.** If recent history shows
   half-finished concurrent work, stop and ask rather than infer whether to
   resume or restart.
   Evidence: opening of `AGENTS.md`. No half-finished task was found at the
   current tip.

10. **No invented data or terminology.** Do not create plausible
    client/lawyer/matter placeholders. Do not guess Arabic legal terminology;
    use `GLOSSARY.md` or ask.
    Evidence: `CLAUDE.md` rules 4–5.

11. **Migration is lossless and reversible.** Never delete or silently drop
    source data. Preserve raw fields and complete source identity; quarantine
    unmappable values. Arabic-name matches require expected row-count
    assertions.
    Evidence: D10, `CLAUDE.md` rules 7, 15, and `MIGRATION.md`.

12. **Permanent truths require permanent checks.** A one-time assertion is a
    snapshot. Invariants belong in constraints or `npm run db:check`; checks
    must be negatively proved by breaking safe fixtures.
    Evidence: `CLAUDE.md` rule 16 and `MIGRATION.md`, “Prove the check catches
    a failure”.

13. **Real scale and Arabic-first behavior.** Test at
    13,279/13,382-hearing scale; every screen is Arabic-first and RTL; use
    logical CSS properties and central strings. Search folds
    hamza/diacritics/digits but never `J → ق`.
    Evidence: `CLAUDE.md` rules 8–9; `AGENTS.md`, Arabic review checklist; D12.

14. **Database destruction is tightly controlled.** Never use
    `docker compose down -v`; only `npm run db:reset`; never use
    `--force-i-know` without explicit approval. Destructive tests are allowed
    only against fixtures created in the same session after proving the
    database contains no project data.
    Evidence: `CLAUDE.md` rules 12–14; `AGENTS.md`, “Destructive tests”.

15. **Data classification.** The owner classifies all project business data
    as non-confidential and authorizes local processing for development and
    migration. It still may not be committed, published, uploaded to
    prohibited services, or sent outside the project. Secrets remain
    protected.
    Evidence: `AGENTS.md`, “Owner-approved data classification and handling”;
    commits `c79da39`, `6639d7a`, `4b5e3a1`.

16. **Raw-data Git exclusions are operationally binding.** Access databases,
    spreadsheets, CSVs, PDFs, dumps, extracted data, and runtime storage
    remain outside Git.
    Evidence: `.gitignore`, `check:gitignore`, and `AGENTS.md`. Current check
    found 275 tracked files and none banned.

17. **Governance-file edits require a special protocol.** Read both
    `AGENTS.md` and `CLAUDE.md` immediately before editing either; edit only on
    direct owner instruction or approved proposal; never weaken a rule without
    explicit approval; review the full diff; commit separately.
    Evidence: `AGENTS.md`, “Editing AGENTS.md and CLAUDE.md”; historical
    incidents `95e42cb`, `d16b5bf`, and corrective commit `3d69dab`.

18. **Prohibited integrations remain prohibited.** No Google services,
    browser/site builder without specifically requested browser testing,
    plugin-management/safety changes, or MySQL tools.
    Evidence: `AGENTS.md`, “Tools you may not use”.

No unresolved conflict exists between the current `AGENTS.md` and `CLAUDE.md`.
`HANDOFF.md` conflicts with both but is a superseded checkpoint.

## 4. Decision register

For D1–D25, the owner-approval evidence is the fact that each is recorded in
the authoritative [`DECISIONS.md`](../DECISIONS.md). Separate original
conversation transcripts were not retained unless explicitly noted below.

| ID | Exact decision | Status | Approval evidence | Implementation/enforcement | Gap |
|---|---|---|---|---|---|
| D1 | Scope comes from the Access Dashboard, not every object in the file | Current; partly future | D1 | PRD/TASKS scopes screens and reports accordingly | Dashboard UI remains Stage 5 |
| D2 | Drop meeting and meeting-attendance features entirely | Current, implemented in migration scope | D2; firm-use analysis | Archive-only accounting; no application meeting tables | None |
| D3 | Build attendance/invoice structures now; defer specified screens | Current | D3 | Tables and migrated history exist; Phase 2 UI deferred | Attendance UI intentionally future |
| D4 | Migrate historical billing read-only; exclude `Pay-Date` | Current, implemented | D4 | 543 invoices, 597 payments, 47 allocations; schema, triggers, permissions and `db:check` | None |
| D5 | One people roster; relationships join by ID, never names | Current, implemented | D5 | 137 people, aliases, ID FKs, exact-name review rules | None |
| D6 | Teams belong to people, not matters | Current, implemented | D6 | Two teams; nullable person team; no matter team | One abandoned duplicate source team is a reviewed exclusion |
| D7 | Party capacity is a structured role with gendered labels | Current, implemented | D7 | 11 party roles; 2,615 parties and 2,199 roles | Unsafe source capacities remain evidence/quarantine |
| D8 | Matter type/category/degree/venue are editable lookup tables, not enums | Current, implemented | D8 | Lookup tables and crosswalks; no PostgreSQL enums | None |
| D9 | Case numbers remain one multi-line text field | Current, implemented | D9 | Schema and display requirements retain complete text | UI not yet built |
| D10 | Migration deletes nothing; preserve raw source and quarantine uncertainty | Current, implemented | D10 | Raw columns/payloads, 20 quarantine tables, immutable evidence guards | Resolution workflow for remaining quarantines is not scheduled |
| D11 | Extract Access complex fields through the object model | Current, implemented | D11 | 54 logos and 288 fee-letter multi-values extracted and verified | None |
| D12 | Arabic-only UI; retain English source data where present | Current, base implemented | D12 | RTL root, bundled font, central strings, checks | Most business screens remain future |
| D13 | TypeScript across the application stack | Current, implemented | D13 | Next.js/TypeScript/Prisma and TypeScript scripts | None |
| D14 | Historical billing visible to every role | Current, implemented | D14 | All four roles have billing view only | Supporting 834/1,730 rationale is dated |
| D15 | Client logos live as server files, not database blobs | Current, migration implemented | D15 | 54 runtime files plus database metadata and immutable import audit | Upload/removal lifecycle awaits Task 4.1a |
| D16 | Nightly DB+logo backup together, off-VM copy, VM snapshots, tested restore | Current, documented only | D16 | Deployment tasks 7.2; no backup implementation yet | Must be implemented and restore-tested before go-live |
| D17 | Build 45 reports, not 49; merge/drop identified duplicates | Current, documented only | D17 | Report inventory and task plan | Reporting engine remains Stage 6 |
| D18 | Client report is parameterized rather than duplicated | Current, documented only | D18 | Report layouts and Task 6.2 | Not yet implemented |
| D19 | Client branch means site; retain 15 sites; quarantine separate-client values | Current, implemented | D19 and explicit 23 Aug corrections | 15 branches, crosswalks, three separate-client rules | 14 affected matters still need firm reassignment |
| D20 | Courts are a reviewed list; circuit remains text | Current, implemented | D20 | 308 courts; `26` correctly moved to circuit | No structured circuit filtering |
| D21 | Court-detail fields stay on matters | Current, implemented in schema/migration | D21 | Matter columns and migration | UI future |
| D22 | Human-review every lookup; court chain is the proof | Current, implemented | D22; firm review | 135 lookup rows, 308 courts, 204 crosswalks, permanent chain checks | Later user-edited lists need normal admin workflow |
| D23 | Billing interpretations are explicit and reversible | Current, implemented | D23; dated billing review | Exact allocation fractions, null rules, currency rules, crosswalk and immutable raw fields | Arabic display labels still pending |
| D24 | Username-only Auth.js; exact Argon2id, lockout and absolute-session policy | Current, implemented | D24 | Migration 0052, Auth.js code, constraints and auth fixtures | Current audit did not rerun the write-capable fixture suite |
| D25 | Recoverable archive/restore only; never physical application deletion | Current policy; lifecycle implementation future | D25 | 448 permission decisions; no delete action; administrator-only archive/restore policy | Columns, filters, controls and reporting behavior intentionally deferred |
| — | Four fixed roles and the matrix in `PERMISSIONS.md` | Current, implemented | PRD and permission matrix | 4 × 14 × 8 = 448 explicit decisions; server guards and static inventory | User-management UI remains 3.4 |
| — | Western digits appear in UI/reports; search accepts Arabic-Indic digits | Current, base implemented | BRAND and VISUAL-DIRECTION, “Decided 23 August” | `ar_normalise()` and DB invariant | Dated supporting row count needs relabeling |
| — | Durable source identity is content-based, not CSV row position | Current, implemented correction | `MIGRATION.md`, correction 24 Aug | SHA-based record keys throughout staging and evidence | None |
| — | Current Access file may have a different physical hash after open-only inspection; extraction provenance remains unchanged | Current, implemented | TASKS 2.12 and Gate 4 report | Both physical identities and logical equivalence are permanently recorded | Original conversation itself not retained |
| — | Stage 2 follows four stop-gates and exact source accounting | Current, implemented | Owner-approved Stage 2 plan, 23 Aug | Gate scripts, fixtures, Gate 4 report | Plan’s 15-table prose is stale |
| — | Every list report ends with a total-count row | Current, documented only | REPORT-LAYOUTS records firm confirmation | Future Stage 6 work | Not implemented |
| — | Project business data is non-confidential but raw artifacts remain outside Git and external services | Current operating decision | AGENTS/CLAUDE and Aug 24 commits | `.gitignore`, `check:gitignore`, tool restrictions | Original approval transcript absent |
| — | Codex is the sole active governed developer; no concurrent working-tree development | Current operating decision | AGENTS and commits `ed3bfad`, `67418f4` | Operating protocol | The stale handoff says otherwise in places |

## 5. Complete task and commit chronology

All rows below are on current `main`, are reachable from `origin/main`, and
therefore have **Pushed: Yes**. Historical figures are identified as such.

### Stage 0 and Stage 1

| Task/checkpoint | Status | Commits | Principal output and verification | Later correction |
|---|---|---|---|---|
| Initial planning | Closed | `ebcf4b0`, `c3dc1c4`, `54ceb6a`, `2039c0c` | PRD, decisions, reports and initial task plan | Current counts later superseded planning counts |
| 0.1 Repository skeleton | Closed | `1d10405`, `d6fce90` | Next.js 16, TypeScript, formatting/lint baseline | Package versions later locked at current values |
| 0.2 Docker Compose | Closed | `4313f4f` | PostgreSQL 17 with ICU Arabic collation | Current platform verified as 17.11 |
| 0.3 Prisma | Closed | `dbe04bf` | Prisma connection and first migration | Current migration inventory is 52 |
| 0.3a Reset guard | Closed | `40060ce` plus Stage 0 repair commits through `c35e739` | Exact database/volume safety checks and negative fixtures | Reviews exposed and closed same-server/wrong-database and parsing faults |
| 0.4 Arabic base | Closed | `20d96f2` | RTL root, brand colors, bundled font, central strings | RTL checker later hardened; two known checker gaps deferred to 4.0 |
| Stage 0 reviews | Closed historical checkpoint | review documents; repairs `b1c2ca0` through `c35e739` | Encoding, ignore, reset, Gate 1, RTL and documentation findings | All recorded as closed in TASKS |
| 1.1 Lookups | Closed | `1fd0503`, `37eb9d4`, `2fd2a62`, `a875dd1` | Nine tables; initially 150 rows; raw-preservation audit | Corrected merges and provisional-status documentation |
| 1.2 People | Closed | `3b5fbde` | Historical checkpoint: 138 people, 339 aliases, two teams | Superseded by 1.2a/1.2b |
| 1.2a Alias completeness | Closed | `cabf33b` | 347 reviewed aliases | Current protected migrated aliases are 348 after later repair |
| 1.2b Duplicate people | Closed | `a118b51` | 138 → 135 migrated people | Task 3.1 later adds two native people, total 137 |
| 1.2c Branch resolution | Closed | `ca306f3`, `db0f187` | 31 raw branch values → 15 sites; crosswalk 4 → 20; legal-opinion type confirmed | Expanded crosswalk now has 204 rules |
| 1.2d Stage 1 review closure | Closed | `cfd86a0`, `5cc6c18`, `cd58163` | Database checks strengthened; invariant rule formalized | Later transforms add further invariants |
| 1.3 Core schema | Closed | `0675ca4` | 11 initial application tables and raw columns | Physical schema expanded in later tasks |
| 1.3a Missing columns | Closed | `c8378a5` | Four source-column groups and fill rates | POA English naming note remains inconsistent |
| 1.4 Junctions | Closed | `e0ac067` | Matter lawyers/parties/roles, attendees, fee-letter links | Populated and protected in Stage 2 |
| 1.5 Billing/deferred | Closed | `aea70e5` | Billing and attendance structures | Later source interpretation and transformations |
| 1.5a/1.5b Billing detail | Closed | `6c19369`, `374322e` | Source columns, constraints, `LawyerA+` co-lead interpretation | D23 and Tasks 2.10A/B supersede provisional readings |
| 1.6 Arabic search/courts | Closed | `aea70e5`, `1740b8b`, `c4f0689`, `c8c4267` | Seven trigger-maintained shadows; `J → ق` removed; 308 courts, 94 court rules; `26` is circuit text | Current invariant reports 7 exact triggers and 7 trigram indexes |

### Stage 2

| Task | Status | Commits | Principal output and protected evidence | Later correction |
|---|---|---|---|---|
| 2.1 Extract / Gate 1 | Closed | `437423f`, `c3511e7`, `d72a72b`, `281eb82` | 17 tables in two groups; 30,885 parent rows; 342 complex rows; fingerprint `40EBF988…5979`; exact 54/288 complex counts | Gate hardened from historical 15-table/floor checks |
| 2.2 Staging | Closed | `7b46f84` | 20 all-text tables, 204 source columns plus provenance | Current DB exposes 284 total staging columns |
| 2.3 Load / Gate 2 | Closed | `4598ff9` | 31,227 staging rows; exact manifest/source identity | Durable keys later made position-independent |
| 2.4 Quarantine / Gate 3 | Closed | `092bd08`, `b524165`, `7f91459`, `3f40447`, `5fffc46` | 20 quarantine tables; 744/744 answers; durable workbook identity; 12,732 attendee cells and 16,602 spans | Answer identity and attendee decomposition hardened 24–25 Aug |
| 2.5 People/lookups/clients/contacts | Closed | `8d047fd` plus court commits above | 318 clients, 188 contacts; cleared-vs-null preserved; no guessed branches/contact persons | Court count corrected 309 → 308 before application |
| 2.6 Matters | Closed | `bae15d3`, `92d5c3f` | 1,744 = 1,689 transformed + 55 quarantined; complete payload/raw evidence | Independent field-by-field and catalog verification added |
| 2.7 Lawyers/parties | Closed | `b4babac`, `975195d` | 927 lawyer links, 2,615 parties, 2,199 roles; 4,576 source cells fully partitioned; 926 evidence rows | Permanent oracle made independent of writer |
| 2.8 Hearings/attendees | Closed | `dacbe9d`, `c584614`, `ff5dd28` | 13,382 = 13,055 transformed + 327 quarantined; 8,884 attendees; protected digest `e9cad0…b2cf4` | Audit/catalog verification hardened |
| 2.9A Administrative work | Closed | `35c4ff8`, later `6fcf9f6` | 4,238 = 3,694 + 544; 4,252 actions = 3,483 + 769; digest `ab0cc3…132c1`; business dates digest `a2f61d…2e8a` | Creation dates preserved in migration 0051 |
| 2.9B POAs | Closed | `a8f9cfb` | 752 transformed, zero record quarantine; 87 lawyer links; 717 evidence rows; digest `ac066c…640a` | None |
| 2.9C Documents | Closed | `02cd1d3` | 407 transformed, zero record quarantine; 372 evidence rows; digest `a863b3…a7af` | None |
| 2.9D Fee letters | Closed | `4d7da34`, `6fc194d` | 331 letters; forward 288 = 231 links + 57 quarantine; reverse 412 = 393 + 19; digest `3b647f…7454` | Safeguards hardened |
| 2.10A Billing | Closed | `491f97d`, `acce202`, `6ed4371`, `09fd079` | 543 invoices, 597 payments, 47 allocations, zero quarantine; semantic digest `421b93…498`; immutable migrated history | Provenance and NULL-shape checks hardened through migration 0048 |
| 2.10B Attendance | Closed | `f0534ef`, `8ad1b68`, `49b8aa6` | 4,022 transformed, zero quarantine, 10 people, 873 free-text situations; source `7357fd…de38`, result `f6971c…ab5` | Historical execution digest correctly demoted from permanent baseline |
| 2.11 Client logos | Closed | `b710610` | 54 source/import/current files and rows; 1,541,428 bytes; source `320d0b…f801`, result `5fa708…df1f` | None |
| 2.12 Gate 4 | Closed | `5a8ad0d`, `e0ecad1`, `4167869`, `efe0f85` | 35,638 total Access rows accounted; six datasets exact; profiles and migration provenance protected; report digest `dbad7834…47b` | Hardened for re-extraction, dual migration profiles, and later safe migrations |

### Stage 3

| Task | Status | Commits | Principal output and verification | Later correction |
|---|---|---|---|---|
| 3.1 Authentication | Closed | `5f2adac`, `9ce5524`, `2b25e89` | Migration 0052; four accounts; 135 migrated + two native people; Argon2id, lockout, forced change, session invalidation | Temporary patch artifact removed and Arabic firm name corrected |
| 3.2 Authorization | Closed | `fb1651d`, `552711a`, `553b3d1` | 448 decisions; server-only guards; nine current entry points inventoried; archive/restore policy; no delete action | Route/source discovery and bypass cases hardened twice |
| 3.3 Audit population | **Not started** | None | First unchecked task | Exact return point |
| 3.4 and later | Not started | None | No implementation found | Must not be started before 3.3 |

Meaningful governance chronology:

- `95e42cb`: Codex changed governance after a prompt intended for Claude.
- `d16b5bf`: added decisions-over-skills guidance but duplicated text from
  remembered context.
- `3d69dab`: corrected both incidents and recorded the lessons.
- `ed3bfad`, `1b3c197`, `67418f4`, `0ae5362`: owner changed Codex from
  reviewer to governed primary developer.
- `c79da39`, `6639d7a`, `4b5e3a1`: recorded and aligned the owner’s data
  classification.
- Current `AGENTS.md` was rewritten on 24 August to permit governance edits
  only through its present protocol.

## 6. Source and evidence register

| Source | Identity/availability | Tracking | Reproducibility and consumers |
|---|---|---|---|
| Current Access source | Present at the documented external migration-source path; 46,661,632 bytes; modified `2026-08-24T11:52:37.2957010Z`; recorded SHA-256 `1A1DA8…B4BC` | Outside Git | Gate 4 can make a task-owned read-only copy and compare logical evidence |
| Authoritative extraction identity | SHA-256 `40EBF988…5979`, same byte size, extraction modification time `2026-08-23T07:31:52.6811852Z` | Recorded in code, manifests and DB provenance | All staging and migrated source associations retain this fingerprint |
| `_migration/` extraction | Present: 82 files, 10,188,981 bytes | Ignored | Contains source tables, metadata, complex CSVs, workbooks and attachment evidence |
| Extraction manifest | 21 rows: 1 source, 17 tables, 3 complex objects; SHA-256 `5116c662…2a58` | Ignored | Gate 1, loader and Gate 4 |
| Column manifest | 194 extracted definitions; file SHA-256 `c41116dd…40a0` | Ignored | Gate 4 logical comparison |
| Relationship manifest | 17 relationships; file SHA-256 `1cb0e79d…e7e6` | Ignored | Gate 4 logical comparison |
| Complex exports | 342 values: 54 client logos and 288 fee-letter multi-values | Ignored | Tasks 2.9, 2.11 and Gate 4 |
| Authoritative 23 Aug workbook | Present, 71,386 bytes; exact SHA-256 `17FDDA9F…5BDF` | Ignored | One-time legacy identity bridge; 744 answers |
| Contracted 24 Aug workbook | Present, 96,555 bytes; SHA-256 `D37E6078…B595` | Ignored | Demonstrates durable `review-workbook-v2` identity |
| Reviewed-link baseline | [`scripts/baselines/reviewed-links.json`](../../scripts/baselines/reviewed-links.json): 348 aliases, 204 crosswalks; internal digest `ed1d9ce5…ae0`; file SHA-256 `f2fb3e85…ee6c` | Tracked | Transforms and `db:check`; contents are validated before use |
| Source client logos | 54 files, 1,541,428 bytes under ignored extraction attachments | Ignored | Task 2.11 source evidence |
| Runtime client logos | 54 files, 1,541,428 bytes under `storage/client-logos` | Ignored | Application runtime and permanent reconciliation |
| Report samples | Nine PDFs, 5,371,407 bytes under `docs/report-samples` | Ignored | Report layout reconstruction; none is the still-unknown report |
| Arabic legal/field meanings | [`docs/GLOSSARY.md`](../GLOSSARY.md), exact source fields, reviewed SQL seeds/crosswalks | Tracked | Schema naming, migration and later UI |
| Application strings | [`src/strings.ts`](../../src/strings.ts) | Tracked | All visible application strings |
| Lookup/crosswalk SQL | `sql/lookups-and-crosswalk.sql`, court, people and billing seed files | Tracked | Reviewed migrations and independent checks |
| Database runtime | Local PostgreSQL instance was available; `.env` is present and ignored but was not opened or printed | Runtime/ignored | `db:verify` and `db:check` succeeded |
| Dependencies | Exact lock: Next 16.3.1, React 19.2.8, Prisma 7.9.1, Auth.js beta.32, Argon2 0.45.1, ExcelJS 4.4.0, TypeScript 5.9.3 | Tracked lockfile | Reproducible install; no dependencies changed |
| Version-specific implementation evidence | PostgreSQL 17.11 catalog baselines in migration/check modules; Prisma 7.9.1 checksum behavior in Gate 4; Next 16.3.1 route-extension policy in authorization code | Tracked | Current tests pin the behavior actually relied upon |
| External official documentation | No vendored snapshots found; Internet use is prohibited by project governance for this task | Missing but non-blocking | Locked versions, source code and local fixtures provide the retained evidence |

No raw rows, workbook contents, logo binaries, credentials, private keys, or
actual connection strings were reproduced. Git contains no tracked `.accdb`,
CSV, workbook, PDF, dump, private key, or real secret file. `.env.example` is
the only tracked file matching secret-variable names and contains the expected
example placeholders.

## 7. Output and artifact register

| Output/artifact | Location and producer | Reproducible? | Protection |
|---|---|---|---|
| Physical schema | Prisma schema and 52 migration directories | Yes, clean migration replay | Migration checksum/profile validation |
| Staging dataset | Runtime `_migration` schema; Tasks 2.2–2.3 | Yes from extraction | `db:check` verifies tables, columns, identities and counts |
| Quarantine framework | 20 runtime quarantine tables; Task 2.4 | Yes | Partition and non-erasure triggers/invariants |
| Review mappings | Tracked reviewed-links baseline plus migration tables | Yes | Content digest and exact destination validation |
| Review answers | Runtime review tables and ignored workbooks | Yes from authoritative workbook | 668/76 identity and answer digests |
| Attendee decomposition audit | Runtime audit tables; Tasks 2.4/2.8 | Yes | Independent reconciliation and complete catalog checks |
| Client/contact transform | Runtime target tables; Task 2.5 | Yes | Staging-to-target permanent invariants |
| Matter transform/quarantine | Runtime targets and evidence; Task 2.6 | Yes | Independent target/reason/detail reconstruction |
| Lawyer/party outputs | Runtime relations/evidence; Task 2.7 | Yes | Standalone SQL oracle and structure guards |
| Hearing/attendee outputs | Runtime tables/evidence; Task 2.8 | Yes | Independent reconciliation and digest |
| Administrative, POA, document and fee-letter outputs | Runtime tables/evidence; Task 2.9 | Yes | Domain-specific oracles and catalog guards |
| Billing report/oracle | Runtime billing tables plus `billing-reconciliation.ts`; Task 2.10A | Yes | Semantic, complete-row and identity/time digests; immutable migrated rows |
| Attendance report/oracle | Runtime attendance plus `attendance-reconciliation.ts`; Task 2.10B | Yes | Source/result digests and structure guards |
| Client-logo report/oracle | Runtime database rows/files plus logo reconciliation modules | Yes | Source/result digests, byte/hash/MIME checks |
| Gate 4 report | [`2026-08-30-gate-4.md`](../reconciliations/2026-08-30-gate-4.md) | Yes from source, DB and repository | `db:check` verifies its protected dependencies |
| Migration provenance profiles | `scripts/lib/gate4-migrations.ts` and Gate 4 report | Yes | Exact repository and database checksums; whole-profile matching |
| Permission matrix | [`docs/PERMISSIONS.md`](../PERMISSIONS.md) and `src/lib/auth/permissions.ts` | Yes/static | 448 exhaustive decisions and mutation tests |
| Route/action inventory | `src/lib/auth/route-inventory.ts` | Yes/static | `check:authorization` and extensive bypass fixtures |
| Authentication fixture | `scripts/test-auth.ts` | Yes in a disposable DB | Exact identity, Argon2id, lockout, session and trigger negative tests |
| Permission fixture | `scripts/test-permissions.ts` | Yes in a disposable DB | Matrix mutations, 401/403 behavior, role refresh, router/source bypasses |
| Permanent database report | `scripts/check-db.ts` | Yes/read-only | Current run: all 84 checks passed |
| Stage reviews | `docs/reviews/*.md` | Historical only | Git history; closure recorded in TASKS |
| Implementation prompts | None tracked | No | Prior conversation is unavailable |
| Completion reports | Detailed entries in TASKS plus Gate 4/review reports | Partly | Strong for Stage 2; less structured for Tasks 3.1/3.2 |
| Old handoff | `HANDOFF.md` | Historical | Git only; not safe as current continuity source |

The billing, attendance, lawyer, party and logo “reports” currently mean
migration reconciliation/oracle outputs. The corresponding user-facing report
screens have not been built.

## 8. Current protected state

### Platform and migration

- PostgreSQL: **17.11**.
- Repository migration files: **52**.
- Successfully applied: **52**.
- Historical clean rollback records: **1**.
- Pending, unfinished, repository-only, database-only, or mismatched later
  migrations: **0**.
- Canonical 52-file migration inventory digest:
  `d7a801236ab03e167db6a144b7a555c8d3551f532104428c42ade76324c89f00`
- Required Stage 2 migrations: **51/51**.
- Accepted live profile: `historical-live`
  `86eb32a96d97167d6bc699d3576f42c4a6916a53c0a37d557035abd79bd8447f`
- Clean replay profile:
  `892b382f9d27606fe2b4e1a11eee5e58c2d82c47bab3a3a39b6da8446c358899`
- Database invariants: **84/84 passed**.

### Source and staging

- All Access user-table rows: **35,638**.
- Migration-source rows: **30,847**.
- Reference-only rows: **38**.
- Archive-only rows: **4,753**.
- Extracted parent rows: **30,885**.
- Complex values: **342**.
- Staging rows: **31,227**.
- Staging: **20 tables, 284 columns**—204 source columns plus four provenance
  columns on each table.
- Quarantine framework: **20 tables**.

### Current target partitions

| Domain | Current protected result |
|---|---:|
| Clients | 318 transformed |
| Contacts | 188 transformed |
| Matters | 1,689 transformed + 55 quarantined = 1,744 |
| Matter lawyer relationships | 927 on 708 matters |
| Matter parties | 2,615 |
| Party roles | 2,199 |
| Relationship evidence/quarantine | 926 unsafe source cells |
| Hearings | 13,055 transformed + 327 quarantined = 13,382 |
| Hearing attendees | 8,884 across 39 people |
| Attendee audit | 12,732 cells; 16,602 spans; 9,113 person spans; 10 ambiguous quarantined spans |
| Administrative tasks | 3,694 transformed + 544 quarantined = 4,238 |
| Task actions | 3,483 transformed + 769 quarantined = 4,252 |
| Powers of attorney | 752 transformed; zero record quarantine |
| Documents | 407 transformed; zero record quarantine |
| Fee letters | 331 transformed |
| Fee-letter forward sources | 231 links + 57 quarantine = 288 |
| Matter-side fee references | 393 links + 19 quarantine = 412 |
| Invoices | 543 transformed; zero quarantine |
| Payments | 597 transformed; zero quarantine |
| Allocations | 47 transformed; zero quarantine |
| Attendance | 4,022 transformed; zero quarantine |
| Client logos | 54 source + 54 import-audit + 54 current; 1,541,428 bytes |

### Reference, review and identity

- Lookup rows: **135**.
- Courts: **308**.
- Crosswalk rules: **204**, including **94 court rules**.
- Protected migrated people: **135**.
- Application-native people: **2**.
- Current people: **137**.
- Protected aliases: **348** plus two native self-aliases.
- Review answers: **668 value answers + 76 finding answers = 744**.
- Review mapping digest:
  `bebf8f20140a63d272f80d454d8363d68e1dc7bf12d82b43a45096281b059f51`
- Review answer digest:
  `cd19213bcad7ad24912c6067384f25aade84f5a1d479be37f0608755d9f75a35`
- Attendee audit digest:
  `7e62b9d4f4d1ceb7e3e152095d69b98bce5b7ea0dcc40a055bd368347d5251b4`

### Domain digests

- Billing semantic:
  `421b935e10b9e45a9bb9718b947825817b09ac60b7529d95491378f6e0737498`
- Billing complete rows:
  `81f1d4176828d109f5af1bd90a397408c32dc967751254e172312de74c330925`
- Attendance source/result:
  `7357fd7df5f9076228a0f07e1bed97ca3f184928010a40f6c524bd75ef72de38`
  `f6971cca7139e191d1fc192d290d496436d8bbc0c6153dd27d00c295e6b10ab5`
- Logo source/result:
  `320d0b7301b5e0cc27ea342fc86c1384dabf7cdb5f5bfe2a38d658bf3268f801`
  `5fa708e0a5ade8bb1b9b81cc16d4a9a3d225d7226e0043e71968ca128c7bdf1f`
- Gate 4 logical combined digest:
  `eadfe3b44de0169ce9871fbb51a563bb9888d5f5fff43489b848a8ef5113ac8e`
- Gate 4 stable generated-report digest:
  `dbad78347cd092395349f921dd309b1fc4e05eead24add76aef1a3cb9ccf047b`

The generated-report digest is a Gate 4 evidence contract, not the raw SHA-256
of the tracked Markdown file. The current working-file SHA-256 is separately
`515d035e…03c6`; those values are not contradictory.

### Authorization

- Roles: **4**.
- Permission areas: **14**.
- Supported actions: **8**.
- Explicit decisions: **448**.
- Administrator archive/restore areas: **9**.
- Physical-delete actions: **0**.
- Current application entry points classified: **9**.
- All roles can run/export reports.
- Billing is view-only for all roles.
- Authentication identities and database security guards passed permanent
  checks.

### Known unresolved/quarantined material

The important unresolved records are not lost:

- 55 matters, including 14 wrong-client `separate_client` cases.
- 327 hearings, of which 313 inherit a quarantined parent matter.
- 544 administrative tasks and 769 task actions.
- 57 forward and 19 reverse fee-letter relationship sources.
- 926 unsafe matter relationship cells retained as evidence.
- 10 ambiguous attendee spans.

Local source/runtime evidence was available, so no requested count was blocked
by absent runtime data. The audit intentionally did not inspect raw business
contents or rerun database-writing fixtures.

## 9. Gaps and conflicts

### 9.1 `HANDOFF.md` is a false current starting point — high risk

- **Missing/conflict:** It claims commit `8f9abbd`, D1–D22, Stage 1 complete,
  and “Task 2.1 — START HERE”; it also carries obsolete governance
  restrictions.
- **Searched:** Current file, Git history, README, decisions, tasks, AGENTS and
  CLAUDE.
- **Why it matters:** A replacement agent could rerun extraction or believe
  Stage 2/authentication are absent.
- **Resolution:** Git and current canonical files resolve it completely.
- **Khaled needed:** No business decision; only authorization for a future
  documentation edit.
- **Risk if ignored:** Duplicate or dangerous migration work.

### 9.2 No scheduled resolution checkpoint for current quarantines — high risk

- **Missing:** Tasks document all quarantines but contain no explicit
  owner-review/clearance task before Stage 4 or cutover.
- **Searched:** TASKS 2.5–2.12 and Stages 3–7, MIGRATION, DATA-MODEL, Gate 4
  report.
- **Why it matters:** At least 55 matters and 327 hearings may be absent from
  normal target screens; 14 matters are attached to the wrong source client
  and require firm reassignment.
- **Can code/Git resolve it:** No. The source is preserved, but business
  choices cannot be inferred.
- **Khaled needed:** Yes, to choose timing and scope.
- **Risk:** Incomplete operational visibility or a late pre-go-live cleanup.

### 9.3 PRD migration success criteria are obsolete — medium risk

- **Conflict:** PRD says migrate 30,553 and reconcile to 35,343. Current Gate
  4 proves 30,847 + 38 + 4,753 = 35,638.
- **Searched:** PRD, README, TASKS 2.12, MIGRATION and Gate 4.
- **Resolution:** Repository evidence is conclusive; no owner decision needed.
- **Risk:** A future acceptance review could falsely declare the current
  migration wrong.

### 9.4 Stage 2 plan understates Gate 1 — medium risk

- **Conflict:** Plain-language plan says all 15 tables; implemented gate
  requires 17 named tables in migrated/reference groups.
- **Resolution:** TASKS 2.1, MIGRATION and gate fixtures prove 17.
- **Khaled needed:** No; this is a documented hardening, not a changed business
  choice.
- **Risk:** A manual rehearsal using the plan alone could omit both reference
  tables.

### 9.5 Current quality-gate documentation is stale — medium risk

- README says `npm run check` runs four checks; it now runs seven.
- DATABASE shows 7 applied migrations; live state is 52.
- HANDOFF describes six checks and old invariant counts.
- **Resolution:** Package scripts and current command output are conclusive.
- **Khaled needed:** No.
- **Risk:** Developers omit authorization, Git-ignore or encoding checks when
  running commands manually.

### 9.6 Current-data examples remain at planning counts — medium risk

- **Conflicts:** 259/313 no-logo clients; 834/1,730 matters with no lawyer;
  35,343 total rows.
- **Current evidence:** 318 clients and 54 logos imply 264 current clients
  without a migrated logo. The current target has 1,689 matters and lawyer
  relationships on 708 matters, so 981 current transformed matters have no
  target lawyer relationship.
- **Searched:** PRD, BRAND, VISUAL-DIRECTION, PERMISSIONS, REPORTS,
  REPORT-LAYOUTS, DATA-MODEL, TASKS and DB checks.
- **Khaled needed:** No. The underlying decisions remain valid.
- **Risk:** Wrong UI copy, test fixtures, sizing assumptions, or report
  fallback counts.

### 9.7 Glossary has two factual errors — medium risk

- Attendance says 865 distinct situations; current source and permanent
  baseline say 873.
- `J → ق` removal is dated 24 August; migration and governance history prove
  23 August.
- **Resolution:** Code, tasks, migrations and DB checks are conclusive.
- **Khaled needed:** No.
- **Risk:** Incorrect data profiling or accidental reopening of the rejected
  fold.

### 9.8 POA terminology approval is internally inconsistent — low/medium risk

- DATA-MODEL says `الصفة`/`صفة الموكل بالتوكيل` and `حرف` are not in the
  glossary and still need confirmation.
- GLOSSARY now defines all three, including one as an abandoned duplicate.
- **Searched:** GLOSSARY, DATA-MODEL, TASKS 1.3a, schema and migration notes.
- **Why it matters:** Exact source preservation makes the migration safe, but
  the English semantic labels lack unambiguous approval evidence.
- **Can Git resolve it:** It proves current wording, not who approved it.
- **Khaled needed:** A short confirmation would close it.
- **Risk:** Documentation disagreement, not present data loss.

### 9.9 Arabic billing labels remain intentionally empty — future blocker

- **Missing:** Arabic labels for 11 exact codes across three financial lookup
  tables.
- **Searched:** TASKS 1.5, schema, billing SQL and DB invariants.
- **Why it matters:** Task 4.8 must be Arabic-only.
- **Can code resolve it:** No; rule 5 forbids inventing financial/legal
  terminology.
- **Khaled needed:** Yes, before Task 4.8.
- **Risk:** English values on an Arabic screen or later rework.

### 9.10 One report layout is still unavailable — future blocker

- **Missing:** Layout for `صالح-ضد مفصل حسب المحامي`.
- **Searched:** REPORTS, REPORT-LAYOUTS, TASKS 6.8 and all nine local report
  samples.
- **Can Git resolve it:** No. Query/columns are known but layout is not.
- **Khaled needed:** Yes.
- **Risk:** Building the wrong report or delaying Stage 6.

### 9.11 Original decision conversations and implementation prompts are missing

- **Missing:** Original conversational transcripts for most D1–D25 decisions
  and task-specific implementation prompts.
- **Searched:** Complete tracked inventory, all branches/decorated refs, Git
  history, reviews, handoff and reconciliation artifacts.
- **Why it matters:** `DECISIONS.md` proves the repository’s approved state but
  not an independent verbatim approval trail.
- **Can Git resolve it:** No.
- **Khaled needed:** No need to re-decide settled matters; add approval
  metadata prospectively.
- **Risk:** Governance/audit provenance weakness, not an implementation
  blocker.

### 9.12 Historical fixture pass evidence is prose rather than retained run output

- Authentication and permission suites exist and TASKS records that they
  passed. This audit inspected them but did not run them because they create
  and drop disposable databases, which the audit prohibited.
- Current read-only checks independently validated auth database guards, all
  448 policy decisions structurally, and all nine route entries.
- **Khaled needed:** No.
- **Risk:** Low. A later implementation session should run both fixture suites
  before changing related code.

### 9.13 A few data-model descriptions are ambiguous rather than wrong

- “17 tables in scope” means Access business-source scope, not the physical
  PostgreSQL schema.
- `case_number_ar_normalised` is described once as “Generated”; it is
  trigger-maintained.
- “Every table carries audit columns” means schema presence, while Task 3.3 is
  still needed to populate user identities.
- **Resolution:** Schema, migrations and Task 3.3 are conclusive.
- **Khaled needed:** No.
- **Risk:** A future developer could design around the wrong mechanism.

## Gap disposition

The audit findings above remain the evidence of what was true at `553b3d1`.
The owner reviewed all 13 gaps on 1 September 2026. Their durable disposition is
recorded below; a scheduled review or input is not mislabeled as completed.

| Gap | Classification | Disposition and durable authority |
|---|---|---|
| 9.1 — obsolete `HANDOFF.md` | **corrected by this documentation commit** | The current file is a short superseded-checkpoint notice linking to README and TASKS; Git preserves the historical content. |
| 9.2 — no quarantine-review checkpoint | **resolved by an owner-approved scheduled checkpoint** | D26 and Tasks 3.5/7.2a schedule the high-impact matter/hearing review after 3.4 and the lower-impact evidence review before final rehearsal/cutover. No quarantine is declared resolved merely by scheduling it. |
| 9.3 — obsolete PRD migration totals | **corrected by this documentation commit** | PRD now uses 30,847 migration-source + 38 reference-only + 4,753 archive-only = 35,638 and links to migration evidence. |
| 9.4 — Stage 2 plan understates Gate 1 | **corrected by this documentation commit** | The plan now states 17 named Access tables in two groups: 15 migration-source and two reference-only. |
| 9.5 — stale quality/migration check descriptions | **corrected by this documentation commit** | README records seven quality checks; DATABASE records the 52-migration continuity checkpoint while treating the applied count as mutable. |
| 9.6 — planning counts presented as current | **corrected by this documentation commit** | Current examples use 318 clients, 54 logos, 264 logo fallbacks, 1,689 transformed matters, 708 matters with lawyer relationships and 981 without; historical figures are explicitly dated. |
| 9.7 — glossary attendance/date errors | **corrected by this documentation commit** | GLOSSARY records 873 attendance situations and the 23 August removal of `J → ق`. |
| 9.8 — POA terminology conflict | **corrected by this documentation commit** | Khaled approved the three meanings on 1 September 2026; D29, GLOSSARY and DATA-MODEL record them. |
| 9.9 — missing Arabic billing labels | **pending a specifically scheduled owner-supplied input** | D28 and Task 4.7a require firm approval of all 11 Arabic display labels before Task 4.8. Temporary English labels remain prohibited. |
| 9.10 — unavailable report layout | **pending a specifically scheduled owner-supplied input** | D27 and Task 6.7a require an original representative PDF export or clear scan before Task 6.8. Replacement design needs further owner approval. |
| 9.11 — missing historical conversations/prompts | **irrecoverable historical evidence, prospectively mitigated** | Missing transcripts cannot be reconstructed or fabricated. D1–D25 remain authoritative as recorded and are not reopened. D26–D29 carry prospective approver/date/evidence metadata; [`docs/task-reports/README.md`](../task-reports/README.md) defines future task evidence. |
| 9.12 — historical fixture run output not retained | **accepted low-risk historical limitation** | This audit did not rerun `test:auth` or `test:permissions` because they create and drop disposable databases. This is not a current test failure. Both suites must be rerun before accepting a future authentication or authorization code change. |
| 9.13 — data-model ambiguity | **corrected by this documentation commit** | DATA-MODEL distinguishes the 17-table Access scope from PostgreSQL's physical schema, identifies trigger-maintained search shadows, and separates structural audit columns from Task 3.3 acting-user population. |

## 10. Recommended canonical continuity structure

The smallest safe structure does not need another master handoff document.

| File | Change | It should own | It should link to, not duplicate | Precedence |
|---|---|---|---|---|
| `AGENTS.md` | **Update only under its governance protocol, if needed** | Codex-specific operating rules, owner relationship, tool restrictions | The shared 16 rules in CLAUDE | Current owner instruction first |
| `CLAUDE.md` | **Update only under governance protocol** | Shared working rules for any active developer | Project state, counts, task detail | AGENTS clarifies Codex-specific application |
| `README.md` | **Update** | One-screen current status, exact return point, command index | Detailed counts in Gate 4/MIGRATION; permissions in PERMISSIONS | Index only |
| `docs/DECISIONS.md` | **Update** | Decisions and rationale; add `approved by`, date, and evidence reference where recoverable | Implementation detail in TASKS/code | Highest product/data authority |
| `TASKS.md` | **Update** | Ordered status and exact return point; links to completion evidence | Long migration explanations in MIGRATION | Status authority |
| `TASKS.md` | **Proposed owner-approved update** | Explicit quarantine-review checkpoint at the position Khaled selects | Raw review values and detailed reconciliation | Must not be inserted without resolving Question 1 |
| `docs/MIGRATION.md` | **Update** | A compact source/evidence register at the top: source identities, manifests, workbooks, Gate 4 link | Full task status and product decisions | Migration/source authority |
| `docs/DATA-MODEL.md` | **Update** | Current logical model and explicitly dated current counts | Decision rationale, task chronology | Schema meaning; runtime counts defer to `db:check` |
| `docs/GLOSSARY.md` | **Update** | Approved Arabic meanings only | Fill-rate/count detail in DATA-MODEL | Terminology authority |
| `docs/PERMISSIONS.md` | **Update** | Role matrix and lifecycle policy | Historical matter-count rationale | Authorization authority |
| `docs/REPORTS.md` and `REPORT-LAYOUTS.md` | **Update** | Report inventory/behavior and layout respectively | Current migration counts | Report-specific authority |
| `docs/DATABASE.md` | **Update** | Commands and interpretation of dynamic outputs | Fixed current migration counts | Operational authority |
| `docs/STAGE-2-PLAN.md` | **Update** | Approved plan and clearly labeled completion addendum | Current technical gate details | Historical plan; MIGRATION wins on implemented gates |
| `HANDOFF.md` | **Update** | A short, prominent “superseded historical checkpoint” notice and links to README/TASKS | No current task, count, or governance instructions | Never a current authority |
| `docs/reconciliations/` | **Keep append-only in practice** | Dated, reproducible migration/reconciliation reports | Current backlog | Evidence artifacts |
| `docs/task-reports/` | **Optional new directory for Task 3.3 onward** | One concise completion report per task: commit, outputs, commands, counts/digests, corrections | Decisions and general status | TASKS links to reports; reports never set priorities |

Recommended conflict rule for the documentation itself:

- Decisions: `DECISIONS.md`.
- Work order/current return point: `TASKS.md`.
- Arabic meaning: `GLOSSARY.md`.
- Migration counts and source identities: `MIGRATION.md`, Gate 4, then current
  `db:check`.
- Permission policy: `PERMISSIONS.md` plus enforced policy code.
- Implementation proof: current code, migrations, tests and database checks.
- A code/document conflict with a decision is a defect to report, not
  permission to override the decision.

## 11. Owner questions at the audited checkpoint

These were the four questions genuinely unresolved at `553b3d1`. Khaled
answered all four on 1 September 2026; the approved resolutions are recorded in
Section 12 and D26–D29. The original questions remain below as audit evidence.

1. **Should the known migration quarantines receive an explicit firm-review
   checkpoint before Stage 4?**

   - **Recommended: review the high-impact parent records after Task 3.4 and
     before client/matter screens begin.** Prioritize the 55 matters—especially
     the 14 attached to the wrong source client—and their 327 hearings.
     Schedule lower-impact administrative, fee-link and relationship evidence
     before the final dry run.
   - **Why the repository cannot answer:** It preserves every source value and
     explains every reason, but the missing client/classification choices are
     business facts that code must not infer. `TASKS.md` currently has no
     cleanup checkpoint.
   - **Advantages:** Prevents valid matters and hearings from being absent from
     normal screens; avoids a rushed cleanup near go-live.
   - **Disadvantages:** Adds owner/firm review and some migration work before
     visible UI progress.
   - **Alternative:** Continue through Stage 4 with quarantines unchanged and
     resolve them before Task 7.3. This keeps development moving but risks
     building and accepting screens against an incomplete operational dataset.
   - **Concrete effect:** Fourteen matters currently need the firm to identify
     their correct client; 313 hearings are quarantined solely because their
     parent matter is quarantined.
   - **Estimated cost:** Roughly 2–4 hours of firm review for the 55 matter
     records if supplied in a context-rich workbook, plus approximately 1–3
     development days to apply, reconcile and permanently protect the
     decisions. Broader cleanup of administrative and relationship evidence
     could take several additional firm-review sessions.

2. **Can you supply or identify a sample for
   `صالح-ضد مفصل حسب المحامي`?**

   - **Recommended:** Export one representative PDF or provide a clear
     marked-up print before Task 6.8.
   - **Why the repository cannot answer:** Its query and four extra data
     columns are known, but none of the nine local samples is this report and
     the Access layout could not be exported during the earlier work.
   - **Advantages:** Preserves the firm’s expected print workflow and avoids
     redesign.
   - **Disadvantages:** Requires brief access to the old report.
   - **Alternative:** Approve a new layout based on the standard report system.
     That could be cleaner, but would be a new design decision rather than a
     faithful replacement.
   - **Concrete effect:** Without the sample, the developer can reproduce the
     data but cannot know grouping, pagination, emphasis, or manual-completion
     areas.
   - **Estimated cost:** About 10–30 minutes if Access can print it; perhaps
     30–90 minutes to capture and annotate it manually. Guessing first could
     add 0.5–2 days of rework.

3. **What Arabic display labels should be used for the 11 billing codes?**

   - **Recommended:** Have the firm’s billing user approve one Arabic label for
     each of the five invoice statuses, two invoice types, and four
     lawyer-share roles before Task 4.8.
   - **Why the repository cannot answer:** The exact English source codes are
     intentionally preserved and their meanings are not safely inventable
     under the Arabic terminology rule.
   - **Advantages:** Keeps the billing screen fully Arabic and makes later
     reports consistent.
   - **Disadvantages:** Requires a short terminology review.
   - **Alternative:** Display the original English codes temporarily. This
     avoids immediate terminology work but contradicts the Arabic-only
     requirement and creates cleanup later.
   - **Concrete effect:** Values such as `Partially Paid`, `Canceled`,
     `Reviewer`, and `LawyerA+` currently have no approved Arabic UI text.
   - **Estimated cost:** About 20–45 minutes of firm review and less than half a
     development day to seed, test and document once approved.

4. **Do the current glossary meanings for the three POA fields have your
   approval?**

   - **Recommended:** Confirm that `الصفة` means the principal’s capacity,
     `صفة الموكل بالتوكيل` is the abandoned duplicate of that field, and `حرف`
     is the letter-series component.
   - **Why the repository cannot answer:** `GLOSSARY.md` states these meanings,
     while `DATA-MODEL.md` still says they need firm confirmation and are
     absent from the glossary. Git does not retain explicit approval evidence
     for the later wording.
   - **Advantages:** Closes the documentation contradiction without changing
     any source data.
   - **Disadvantages:** No material disadvantage beyond checking the
     terminology.
   - **Alternative:** Keep the Arabic source names as the only authoritative
     labels and treat the English names as provisional internal identifiers.
     Data remains safe, but the continuity gap stays open.
   - **Concrete effect:** The existing migration is reversible either way; the
     answer affects documentation, developer understanding and possible future
     English exports.
   - **Estimated cost:** About 5–15 minutes of your or the litigation
     assistant’s review; no material implementation cost if the glossary is
     already correct.

## 12. Owner resolutions — 1 September 2026

Khaled Helmy approved the following resolutions after reviewing this audit.
They are current decisions in [`docs/DECISIONS.md`](../DECISIONS.md), D26–D29;
this section preserves the approval evidence without replacing that authority.

1. **Quarantine review — D26.** Add a formal high-impact checkpoint after Task
   3.4 and before Stage 4 for all 55 quarantined matters, prioritising the 14
   `separate_client` / wrong-client cases, and all 327 quarantined hearings,
   including the 313 inherited from quarantined parents. Apply only explicit
   firm decisions. A second explicit checkpoint before final migration
   rehearsal/cutover covers lower-impact administrative-task, task-action,
   fee-link, relationship-cell and ambiguous-attendee evidence.
2. **Unknown report layout — D27.** Obtain an original representative PDF
   export or clear scan of `صالح-ضد مفصل حسب المحامي` before Task 6.8. Do not
   design a replacement without further owner approval.
3. **Billing labels — D28.** Obtain firm-approved Arabic display labels for all
   11 exact billing codes before Task 4.8. Temporary English display labels are
   prohibited. Present each exact source code with its established meaning for
   review; do not invent Arabic legal or financial terminology.
4. **Power-of-attorney meanings — D29.** `الصفة` is the principal's legal
   capacity/status; `صفة الموكل بالتوكيل` is an abandoned duplicate of
   `الصفة`; and `حرف` is the letter/series component of the identifier.

### Prospective continuity evidence

Historical conversations and task prompts that were not retained cannot be
reconstructed or fabricated. Their absence does not reopen D1–D25, which remain
authoritative as recorded. Approval metadata is preserved prospectively for
D26–D29. From Task 3.3 onward, accepted work must use the evidence format in
[`docs/task-reports/README.md`](../task-reports/README.md); those reports remain
dated evidence and do not set priority or alter decisions.

### Continuing stopping point

This documentation recovery does not start implementation. **Task 3.3 remains
not started, is the first unchecked implementation task, and is the exact
return point.**
