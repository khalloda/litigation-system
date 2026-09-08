# Task 4.0a Phase 2 — read-only staff roster

Implementation checkpoint: 8 September 2026. One active development agent;
no subagents. The owner's scope is Phase 2 only, with one local commit,
`feat: add read-only staff roster`, an external review patch, no push, and a
stop for independent review. The enclosing commit's SHA and patch receipt are
recorded outside Git to avoid a self-referential hash.

## Preflight and authorities

Read README, PRD, DECISIONS and TASKS in their mandated order, then both
governance files and the applicable permissions, data model, database, glossary,
brand/visual direction, D44–D51, readiness audit, Phase 1 implementation and
deployment reports, and complete permanent-invariant inventory. No decision,
governance rule or Phase 1 evidence was changed.

Preflight confirmed clean `main`, including untracked files, no Git operation
or lock, and HEAD = origin/main =
`78bac6b69af4fba21e2fe4166880ea97eb2bf9be`, ahead/behind 0/0. The initial
sandbox fetch invocation could not open `.git/FETCH_HEAD` and started no remote
fetch; the corrected sandbox-authorized invocation performed the one successful
`git fetch origin`. There was no further fetch or other remote action.

Migration 61 was already deployed. The database had 61 applied migrations,
zero pending and zero unfinished, retaining its one approved historical
rollback. Preflight `db:verify` passed 15/15 and the historical permanent
profile passed 107/107. Phase 1 was checked and operationally complete; Phase 2
was the first unchecked Task 4.0a phase. No Phase 1 recovery, ACL hardening,
replay, migration deployment, atomicity or full mutation suite was repeated.

## Delivered behavior

- `/staff` defaults to 23 active internal staff; former/all, fixed-team or
  unassigned, and trainee filters cover all 66 internal people. The 71 external
  people never appear, and direct external detail URLs return the same not-found
  state as a missing person. Links and relationships use unchanged `people.id`.
- Arabic search covers canonical names and every imported or active native alias.
  Literal wildcard characters stay literal, normalization uses PostgreSQL's
  existing function, and `J` never folds to `ق`. An alternate alias match is
  disclosed. Retired native aliases remain detail evidence but leave search.
- The person selection uses `EXISTS` for aliases. Count, rows and fixed-team
  choices share a read-only repeatable-read snapshot. Arabic collation plus
  internal ID provides deterministic pages of 25; a page beyond the last clamps
  to the last page. Repeated, malformed, oversized and nonexistent-team filters
  fail with the focused Arabic validation summary.
- Detail separates identity, team/reviewer information and aliases, with the
  active/former state in its header. English names and email are isolated LTR.
  Imported aliases are labelled historical; native and retired states are text,
  not colour alone. Administrator-only account existence/status links to `/users`;
  other roles neither query nor receive account fields.
- Both pages guard their first awaited operation using the existing `staff/view`
  permission. The read service independently rejects unauthenticated, unknown-role
  and forced-password-change sessions before querying. `staff` is the existing
  executable key; documentation's former `staffRoster` wording was corrected
  without changing the 448-entry matrix.
- The GET search form, navigation, loading announcement, focused validation/error
  summaries, retry and empty/not-found states use centralized strings and existing
  visual tokens. Desktop rows reflow to narrow cards in the same RTL reading order.
  The shared `/forbidden` response retains its existing authorization/status
  behavior; its home link gains the required 44-pixel target. Error retry uses
  the installed Next.js callback that refreshes the server read before recovery.

There are no staff creation/editing routes, Server Actions, API handlers,
activation controls, reviewer controls, account controls or schema changes.
`/staff/new` and `/staff/[id]/edit` remain reserved for Phase 3. Overall Task
4.0a, Phases 3–4 and Task 4.1 remain unchecked. The next return point is
**independent Phase 2 review, then Task 4.0a Phase 3 — Administrator roster mutations**.

## Permanent regression coverage

`check:staff-read-only` joins `npm run check`: exactly two guarded staff pages,
GET-only forms, no mutation service/action/SQL, no unsafe database calls and
only defined CSS tokens. Nine negative fixtures prove rejection. The existing
authorization and structural RTL inventories discover all new entry points
and styles. The audit inventory adds eight exact read/transaction call sites
and fingerprints the complete query closure, retaining its existing gateway
restrictions and all prior call sites. It grants no new database privileges.

Imported alias classification uses immutable imported-person provenance and
the permanently reserved system-migration actor ID 1. Tests compare every
returned alias's classification to the private migration-61 snapshot; the
runtime does not gain access to that snapshot or the audit actor registry.

`test:staff-read-only -- --project-read-only` forces read-only connections and
tests all four roles against all 66 details and 71 external IDs, all 36 filter
combinations and their pages, every searchable internal alias, literal SQL and
wildcard inputs, invalid IDs/filters, account projection, eight real query plans,
audit attribution and append-only event structure/data, and full preservation.

The default `test:staff-read-only` uses the existing owned PostgreSQL fixture
helper and a memory-only restore, with no migration replay. It creates one
clearly synthetic native person and 33 additional aliases through the existing
migration-61 gateways. Thirty matching aliases produce one person; retired
history, native provenance, hamza/diacritics/digits, `J` separation and no-account
projection are asserted. It then runs the full existing permission suite with
`--restored-fixture`; that explicit option clones the already-restored fixture
instead of replaying migrations, while retaining its isolation guard and normal
default behavior. Fixtures are removed after success or failure.

## Verification results

| Gate | Result |
| --- | --- |
| Focused query and synthetic tests | PASS; all roles, 36 filter combinations, exact distinct paging, all aliases and negative cases |
| Authorization | PASS; 448/448 decisions, 18 inventoried entry points, wrapper/guard bypass fixtures, database session refresh and disabled/inactive/forced-password denials |
| Audit | PASS; runtime source inventory, 6 schema and 67 semantic/fingerprint/D35 negative fixtures, attribution and append-only event structure/data, zero read-side audit/session writes |
| Structural RTL | PASS; 20 files; 78 rules, 21 rejecting fixtures, 142 expected findings, 5 clean fixtures, zero known gaps |
| Staff read-only structure | PASS; two guarded pages, nine rejecting fixtures, defined CSS tokens |
| Project static checks | PASS; typecheck, lint, formatting, RTL, authorization, audit, users, staff, gitignore and encoding |
| Production build | PASS; Next.js 16.3.1 `next build --webpack`, both staff routes dynamically server-rendered |
| Project database | PASS; `db:verify` 15/15; historical permanent invariants 107/107; migration ledger remains 61/0 pending/0 unfinished |
| Local browser | PASS; Chromium 151.0.7922.34, 26 state/accessibility cases, 23 axe audits with zero WCAG A/AA violations, four real role logins, 14 screenshots |

The browser run covered 1440px desktop, 390px mobile and 320px reflow on both
list and detail; 720 CSS pixels as the 200% desktop reflow equivalent and a
separate 200% CSS zoom pass; keyboard-only tab order and the skip link; visible
focus; labels and instructions; focused invalid-filter and load-error summaries;
empty results; external/missing routes; the shared authenticated HTTP 403;
actual streaming loading; and recovery after the isolated alias-table SELECT
privilege was restored. The zoom evidence is automated viewport/CSS zoom,
not manipulation of browser-chrome zoom controls. Axe is automated evidence,
not a screen-reader certification. Confirmation focus restoration belongs to
future mutation dialogs and is not claimed for this phase.

All browser requests stayed on localhost; all roster navigation after login
left the clone's full business, session and audit state unchanged. Desktop and
narrow screenshots were visually inspected for connected Arabic, text wrapping,
LTR email and logical reading order. No horizontal overflow or targets below
44 CSS pixels were found in the audited states.

Evidence remains outside the repository at
`C:/Users/Khaled/.codex/visualizations/2026/09/08/01a07fc7-b72a-73b1-ba78-29a4ca3bdce3/staff-phase2/`:

```text
browser-evidence.json
database-preservation.json
production-build.log
query-plans.json
roster-desktop.png
detail-desktop.png
roster-390.png
detail-390.png
roster-320.png
detail-320.png
roster-200-percent.png
keyboard-focus.png
empty-results.png
invalid-filters.png
external-not-found.png
permission-denied.png
load-error.png
loading.png
```

To rerun, set `STAFF_EVIDENCE_DIR` to an external local output directory,
`STAFF_PLAYWRIGHT_MODULE` to an existing installed Playwright module and
`STAFF_CHROMIUM_EXECUTABLE` to its installed Chromium, then run
`npm run test:staff-browser`. No browser dependency or binary was downloaded.
Run static source checks after this command has removed its build mirror.

Eight `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans ran against the actual
137-person dataset with 1,744 matters and 13,382 hearings present. The measured
project maximum was 0.343 ms; the final isolated query run maximum was 0.286 ms.
These are local query execution times, not an end-to-end latency guarantee.
No matter/hearing N+1 queries or all-row roster loading were introduced.

The production build runs in a temporary same-drive mirror with copied source,
assets and a dependency junction, receiving only generated fixture runtime
credentials. No project `.env` is copied. Webpack avoids Windows cross-drive
dependency resolution problems; the mirror's workspace-root warning is harmless.
The original `.next`, `next.config.ts`, generated client and credential files
are not changed. Source checks run after mirror cleanup.

## Preservation and cleanup

The before/after receipt hashes all 103 public, staging, quarantine and private
migration tables with full values and timestamps, sequence values, and catalog
definitions/role/ACL metadata. It exports no password material. Both the focused
tests and browser fixture cleanup compare the complete source receipt.

| Projection | Unchanged SHA-256 |
| --- | --- |
| 103 tables | `a1cfcf53b26f7090831a3c9d186df1ffef3c3229f7d3d4eda3ba85e6f6995251` |
| Sequence state | `8565d6e37256597c422929766aa46fbeddb41d68a87597d6800104e5f1deafed` |
| Catalog | `444870ec3eaa42b144b5ffcb7087582da89d49f3ca5a598ca9af038e8f5db6ff` |

The project retains 824 audit events and zero staff-change ledger rows, its
historical/raw evidence and all 54 logo files. All login/password bootstrap,
permission fixtures, synthetic aliases and error/loading simulations occur
only inside owned disposable clusters. After login completes, roster navigation
itself is compared before/after to prove no business, session or audit writes.
The source project receives read-only connections and read-only dump streams.

No Access file was opened, hashed or reconciled. No migration, schema,
credential, dependency lockfile, governance file, runtime-storage file or Phase 1
evidence is in the change scope. Fixture containers, databases, generated
credentials, volumes/networks, browser/server processes, dependency junctions
and build mirrors are removed. Existing Docker resources are compared unchanged;
no dump file is created. Only the requested review evidence remains outside Git.

## Exact commit file scope

```text
README.md
TASKS.md
docs/DATA-MODEL.md
docs/DATABASE.md
docs/PERMISSIONS.md
docs/PRD.md
docs/VISUAL-DIRECTION.md
docs/task-reports/2026-09-08-task-4-0a-phase-2-read-only-staff-roster.md
package.json
scripts/check-audit.ts
scripts/check-staff-read-only.ts
scripts/lib/audit-source-inventory.ts
scripts/lib/staff-read-only-state.ts
scripts/test-permissions.ts
scripts/test-staff-browser.mjs
scripts/test-staff-read-only.ts
src/app/page.tsx
src/app/forbidden/route.ts
src/app/staff/[id]/page.tsx
src/app/staff/error.tsx
src/app/staff/loading.tsx
src/app/staff/not-found.tsx
src/app/staff/page.tsx
src/app/staff/staff-alert.tsx
src/app/staff/staff.module.css
src/lib/auth/route-inventory.ts
src/lib/staff-roster-query.ts
src/lib/staff-roster.ts
src/strings.ts
```

The external patch contains only the enclosing commit, with full blob indices
and binary-safe representation. Its byte size, SHA-256, successful
`git apply --reverse --check` receipt, final clean-tree state and screenshot
manifest are recorded in the external review receipt and final response.
No patch is applied and nothing is pushed.
