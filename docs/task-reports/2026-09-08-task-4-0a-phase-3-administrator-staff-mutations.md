# Task 4.0a Phase 3 — Administrator staff mutations

Implementation checkpoint: 8 September 2026. The owner authorized only Phase 3,
one local commit named `feat: add administrator staff mutations`, an external
full-index review patch, no push, and a stop for independent review.

- Model: GPT-6 Astra; reasoning effort: Max; environment: Local.
- Subagents: prohibited by the owner; none used.
- Expected qualitative usage: high. Identity, audit, account/session safety
  and concurrent changes required full-state database and production browser
  proof. One agent and reuse of the approved gateways avoided redesign and
  additional migration work.
- Starting commit and parent:
  `34fcd9153f688039f55580d15f9bff045c046c27`.
- Final commit: the enclosing commit; its full SHA, patch and evidence hashes
  are in the external acceptance receipt and delivery message. A commit cannot
  contain its own final hash.
- Push status: not pushed.
- Exact next return point: independent Phase 3 review, then Task 4.0a Phase 4 —
  browser interaction, accessibility and final evidence. Overall Task 4.0a,
  Phase 4 and Task 4.1 remain unchecked; the latter two are unstarted.

## Authority and preflight

Read the repository authorities in the mandated order, both governance files,
handoff, staff permissions/model/database/migration/visual direction, glossary,
brand, D44–D51, the readiness audit and Phase 1/2 implementation, invariant and
deployment evidence. No governance, decision or earlier acceptance report changed.

The one authorized `git fetch origin` succeeded. Clean `main`, including
untracked files, matched the required HEAD/origin SHA, ahead/behind 0/0, with no
Git operation or lock. Phase 3 was the first unchecked staff phase.

Project PostgreSQL 17.11 was healthy at 61 applied migrations, zero pending and
zero unfinished, retaining the approved historical rollback. Preflight
`db:verify` passed 15/15 and the historical profile passed 107/107.
The staff-change ledger was empty. Migration SHA-256 values remained:

- 60: `7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`
- 61: `87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904`

Neither Access file was opened, hashed, copied or reconciled. There was no
migration, schema, grant, invariant, account-policy or displayed-number change.

## Delivered behavior

- Administrator-only `/staff/new` and `/staff/[id]/edit`, plus nine independent
  `staff/manage` Server Actions. The existing two view pages and all four roles'
  read access remain intact. Routes, audit and relationships use only internal
  `people.id`; no staff-number display or invented name suffix exists.
- Creation produces an active native staff identity and one primary alias, with
  optional English name, normalized lowercase email, trainee state and fixed
  team. It creates no account. Ordinary updates cannot smuggle a canonical-name,
  employment, provenance or account change through hidden fields.
- Canonical rename uses the same identity, retains the prior spelling and
  switches the primary alias atomically. Imported alias spelling/provenance is
  immutable. Native non-primary aliases can be added, retired and restored;
  retirement/restoration require a reason and recheck collisions.
- Each write uses one of migration 61's six existing gateways inside a
  serializable transaction with bounded retries. The service independently
  authorizes, revalidates current Administrator account/employment/session
  state and checks the expected person/team version. The gateway revalidates
  the actor at its write boundary. There are no direct runtime roster writes.
- Each form retains its original version token alongside its initial values.
  Revalidating the surrounding page after another form saves cannot silently
  replace that token while leaving old input in place. Stale submissions
  preserve input, focus an Arabic summary and offer an explicit reload.
- Deactivation rejects self-deactivation, protects the last usable Administrator
  and requires replacement of every team reviewer first. Linked account
  disablement, lockout clearing and session-version increment are atomic.
  Employment reactivation does not enable the account or revive old sessions.
  Team reviewers must be active internal non-trainees; one person may review
  both teams without belonging to either.
- Genuine no-ops return before a write gateway: complete row, version, timestamp,
  audit, sequence and serialization-row state remains unchanged.
- Central Arabic strings, existing brand tokens, logical CSS, LTR email,
  programmatic required-field/error information, focused summaries, pending and
  success announcements, input preservation and explicit recovery. Rename,
  alias lifecycle and employment changes have named-person consequence dialogs.
  Cancel and Escape restore focus. Account-management controls remain in
  `/users`.

## Verification

| Command / proof | Result |
| --- | --- |
| `npm run test:staff-mutations` | PASS; full-state application service proof, all 22 existing gateway proof groups, then all 107 historical invariants |
| `npm run test:staff-mutations -- --service-only` | PASS on final test scope; 17 application races, positive/negative workflows, provenance, exact audit facts, rollback, no-ops and session safety |
| `tsx scripts/test-staff-roster.ts --regression-proof` | PASS; existing authentication, 448 permissions and account-management suites in the owned isolated cluster |
| `tsx scripts/test-user-management-ui.ts` | PASS after browser mirror cleanup; existing account UI boundary and recovery checks |
| `npm run test:staff-read-only` | PASS; all four roles, 66 staff details, 71 external IDs, 36 filter combinations and every page, every searchable internal alias, synthetic alias deduplication/retirement and 448 permission decisions using its restored-fixture option |
| Real-volume query plans | PASS; eight EXPLAIN ANALYZE plans, maximum 0.357 ms in this run; not an end-to-end response-time claim |
| `npm run check` | PASS; typecheck, lint, formatting, RTL, authorization, audit, account/staff source boundaries, gitignore and encoding |
| Authorization source inventory | PASS; 29 entries total, 13 staff entries, independently guarded two view/two manage pages and nine manage actions |
| Audit source inventory | PASS; 43 runtime sources, exact existing helper boundary, 15 new parameterized SQL call sites and complete mutation-service fingerprint; 6 schema and 67 semantic/fingerprint/D35 rejecting fixtures |
| Staff structural checker | PASS; original read-query write prohibition retained, no direct UI database access, only reviewed forms/actions, nine rejecting fixtures, defined CSS tokens |
| `npm run test:staff-browser` | PASS on final production build; Chromium 151.0.7922.34, 54 cases, 44 axe audits with zero violations, 36 screenshots, zero remote requests |
| Production build | PASS; `next build --webpack` in an owned source mirror with only disposable runtime credentials; both manage routes are dynamic |
| Final project `db:verify` | PASS 15/15 |
| Final project `db:check -- --profile=historical-full-state-upgrade` | PASS 107/107 |
| Exact final preservation comparison | PASS; every before/after receipt field matches, including complete sequences and extended catalogs |

The 17 service races cover all nine create/rename/add-alias pairings, all four
create/update normalized-email pairings, same-person stale versions, alias
restoration versus canonical rename, reviewer assignment versus deactivation,
and two Administrators attempting to deactivate each other. Each permits one
valid result and rejects the conflict. The 22 existing gateway proof groups
also cover canonical/alias ownership under READ COMMITTED, REPEATABLE READ and
SERIALIZABLE; reviewer versus trainee changes; account enable/create versus
employment changes; stale Administrator demotion; direct DML/private helper
denials; and permanent catalog enforcement.

Audit tests assert human actor, request, correlation and audit-session IDs;
field-level before/after changes; alias create/update/archive/update/restore
history with exact reasons; and intact imported evidence. Additional refusing
triggers on the owned fixture's people/audit tables prove complete row, version,
alias and audit rollback. Existing guards are not disabled for those injections.

Browser tests exercise keyboard-only creation and validation recovery, visible
focus, desktop/390/320 layouts, 200% equivalent viewport and CSS zoom, duplicate
name/email conflicts, cross-form stale tokens, successful retry after a refused
gateway, alias lifecycle, employment transitions, reviewer replacement rules,
imported evidence, cancel/Escape, and direct mutation URLs/crafted action
requests from all three non-Administrator roles. Those crafted action requests
return the framework's failing response (500 for a thrown action guard); the
underlying permission wrappers independently prove 401/403 decisions before
protected work and full fixture fingerprints prove no mutation.

The final screenshots were visually inspected, including narrow create/edit,
confirmation, conflict and reviewer-protection states. Automated axe does not
replace that inspection. Actual screen-reader speech and native browser-toolbar
zoom were not tested; zoom evidence uses viewport/CSS automation. Phase 4's
broader final acceptance remains a separate unstarted task.

## Development failures and legacy audit limitation

Earlier static iterations correctly rejected computed property access and an
outdated Phase 2 mutation prohibition; the implementation/checker inventory
was corrected without allowing direct writes. One account UI source check
overlapped the temporary build mirror and detected its copied actions as extra
entry points; it passed after cleanup. No discovery guard was relaxed.

The additional `tsx scripts/test-staff-roster.ts --audit-regression-proof`
attempt stopped in the unchanged legacy `test-audit.ts` fixture builder:
“Legacy fixture source must still be at migration 60.” The restored source is
correctly at migration 61. It stopped before its historical upgrade test, and
the chained standalone `test-audit-events.ts` was consequently not run.
No guard override, source downgrade or migration-boundary modification was
made. This old historical-migration harness is not claimed as a passing Phase 3
regression. Current staff audit mutations, audit structure/data invariants,
static negative fixtures and failure rollback passed separately on the
migration-61 full-state fixture. This was the original Phase 3 verification
limitation, not a passing audit regression. The bounded correction below
restores current-checkpoint verification while retaining this historical
failure and its source guard.

All new Phase 3 mutation/concurrency/login/browser proofs use owned full-state
fixtures. The unchanged general authentication/account regression programs also
create their original disposable canonical subfixtures inside the owned cluster.
No test connects those mutations or logins to the project database.

## Project preservation and cleanup

External `project-before.json` and `project-after.json` are exactly equal:

| Protected inventory | Before = after SHA-256 |
| --- | --- |
| All 103 tables, every full row and timestamp | `a1cfcf53b26f7090831a3c9d186df1ffef3c3229f7d3d4eda3ba85e6f6995251` |
| Sequence definitions and last values | `8565d6e37256597c422929766aa46fbeddb41d68a87597d6800104e5f1deafed` |
| Full sequence last_value/is_called/log_cnt | `9cef346016a88f8984ce1338f0539e1f9631618609ec39029f97f8a730517bc8` |
| Functions, triggers, columns, owners, grants and roles | `444870ec3eaa42b144b5ffcb7087582da89d49f3ca5a598ca9af038e8f5db6ff` |
| Additional schema, constraint, index, database and role-setting catalogs | `7e017ed520423451617d9a3d4da80875db975753479fa313b08eed1c09f54998` |
| All 54 runtime logo files: relative path, size and SHA-256 | `68d9156ff8086c497b25ed521049c77d71e321d31be9d07daf4e723bf849535f` |

Project state retains 137 people, 66 staff (23 active/43 former), 71 external
people, 350 aliases, two teams, four accounts, 824 audit events, zero staff-change
ledger rows, 1,744 matters and 13,382 hearings. Historical/raw source,
quarantine, reconciliation and audit evidence remain inside the complete
table fingerprints. Migration 60/61 checksums are unchanged.

Each fixture's finally block removes its exact container, cluster databases,
roles/credentials, volume and network and compares pre-existing Docker resources.
Memory-only dumps are zeroed; no dump file is created. Browser, server and build
processes stop; the verified dependency junction and build mirror are removed.
The existing project container identity/start time, storage/networking and
project environment/build outputs are preserved. Only local review evidence
and the requested patch remain outside Git.

The external evidence receipt gives the actual workstation location, complete
file hashes, final screenshot manifest, enclosing commit SHA and patch size/hash.
The patch is exported with `git diff --binary --full-index`, its file inventory
is matched to the commit, and `git apply --reverse --check` verifies it without
applying it. No workstation-specific absolute paths or raw data enter tracked
documentation. No push or other remote write was performed.

## Original Phase 3 changed-file inventory

```text
HANDOFF.md
README.md
TASKS.md
docs/DATA-MODEL.md
docs/DATABASE.md
docs/MIGRATION.md
docs/PERMISSIONS.md
docs/PRD.md
docs/VISUAL-DIRECTION.md
docs/task-reports/2026-09-08-task-4-0a-phase-3-administrator-staff-mutations.md
package.json
scripts/check-staff-read-only.ts
scripts/lib/audit-source-inventory.ts
scripts/lib/staff-mutation-browser.mjs
scripts/test-staff-browser.mjs
scripts/test-staff-mutations.ts
src/app/staff/[id]/edit/page.tsx
src/app/staff/[id]/page.tsx
src/app/staff/actions.ts
src/app/staff/new/page.tsx
src/app/staff/page.tsx
src/app/staff/staff-editor.tsx
src/app/staff/staff.module.css
src/lib/auth/route-inventory.ts
src/lib/staff-mutations.ts
src/strings.ts
```

## Bounded audit-verification correction — 8 September 2026

The owner authorized exactly one additional local correction commit,
`fix: keep Phase 3 audit verification operational`, preserving
`56534006d8bfd07a3bb227f863f40e643037f6f4` unchanged, with a correction-only
full-index patch and no push. Preflight confirmed clean `main`, that exact HEAD,
parent `34fcd9153f688039f55580d15f9bff045c046c27`, its original 26-file scope and
the migration-60/61 hashes above. The primary agent made all edits; one
read-only helper reviewed audit coverage and the diff.

Before editing, the documented `test-staff-roster.ts --audit-regression-proof`
command exited 1 with `Legacy fixture source must still be at migration 60`.
It did not execute the chained event suite. All reproduction resources were
removed. The three stale status statements in `docs/PERMISSIONS.md` were also
confirmed before correction.

`npm run test:audit` now selects an explicit `current-state-61` profile inside
the existing isolated harness. It validates the complete migration-61 source
checkpoint and all 107 historical invariants, runs every shared attribution,
principal, canonical replay, role/ACL/session and adversarial audit test, then
executes the unchanged `scripts/test-audit-events.ts`. Every child must exit
successfully; interruption, unknown arguments and assertion failures remain
fatal. The separate `npm run test:audit-events` uses the same isolation owner.

`npm run test:audit:historical` explicitly retains the historical migration-53–60
upgrade proof. Its fixture builder, reverse procedure, upgrade assertions and
migration-60 guard are unchanged. That proof requires its original verified
source and is unavailable from the current migration-61 source; it is not
claimed as passing in this correction. Current verification needs no retained
migration-60 dump. Canonical testing documentation now distinguishes these
profiles and labels the older migration-61 deployment acceptance commands as
historical-start proofs. No owner decision or invariant classification changed.

The permission document changes only the three stale status statements: Phase 2
read-only routes and Phase 3 Administrator mutation routes/actions are
implemented. The permission matrix and every application source file remain
unchanged.

| Correction verification | Result |
| --- | --- |
| `npm run test:audit` | PASS; migration-61 checkpoint, 107 invariants, complete shared actor suite and separately reported event-suite completion |
| `npm run test:audit-events` | PASS independently; migration-57 atomic failure, append-only/redaction/context/semantic contracts, 45,463-event volume and indexed paging |
| Missing, unknown and extra `test-audit.ts` profile arguments | Rejected before database access |
| `npm run test:staff-mutations` | PASS; all 17 service races, 22 gateway groups, audit/rollback/no-op/session proof and 107 invariants |
| `npm run test:staff-read-only` | PASS; real-volume reads, alias/filter/pagination regression and all 448 permission decisions through its isolated restored fixture |
| `npm run check` | PASS |
| Production `next build --webpack` | PASS in an owned source mirror with no project credentials; no database required; mirror/junction removed |
| Project `npm run db:verify` | PASS 15/15; read-only |
| Project `npm run db:check -- --profile=historical-full-state-upgrade` | PASS 107/107; forced read-only |
| Final preservation comparison | PASS; before/after receipts are byte-identical, SHA-256 `7539cb01f45c62a440d58f1d07fe9b9c0e44ad2880de0e4374e0035624278ce7` |

The preservation receipt covers all 103 full-row table fingerprints, complete
sequence state, function/trigger/constraint/index/role/ACL catalogs, database
settings, all 54 logo files, all migration files, schema, lockfile, decisions,
governance files, project environment and Docker identities/resources. Project
rows, audit evidence, sequences, logos and migration history remain unchanged.
All disposable PostgreSQL containers, databases, roles, volumes and networks
were removed. No Access operation, project database write, production code,
schema, migration, dependency, permission-matrix or Phase 4 change occurred.
No browser tests were added or rerun for this test-orchestration correction;
the original Phase 3 browser evidence above remains the unchanged checkpoint.

Correction-only files:

```text
docs/DATABASE.md
docs/PERMISSIONS.md
docs/task-reports/2026-09-08-task-4-0a-phase-3-administrator-staff-mutations.md
docs/testing/task-4-0a-phase1-invariants.md
package.json
scripts/test-audit.ts
scripts/test-staff-roster.ts
```

The correction commit and patch hashes are recorded in the external delivery
receipt. The patch uses `git diff --binary --full-index` from the preserved
Phase 3 commit and is verified with `git apply --reverse --check` without
application. Work stops for independent review; no push or Phase 4 start.
