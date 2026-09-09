# Task 4.1 Phase 2 — navigation correction R1/R2

**Later acceptance — 9 September 2026:** independent correction review passed
and Khaled Helmy accepted Phase 2. See the [acceptance addendum](#acceptance-addendum--9-september-2026).
The original correction checkpoint below is retained as historical evidence.

Correction checkpoint: 9 September 2026. Independent correction review and owner
acceptance are pending. The owner's same-chat correction mandate authorizes only
R1/R2, one additional local commit (`fix: preserve client navigation state`) and
external review artifacts. No push or later-phase implementation is authorized.

## Run configuration, authority and starting point

GPT-6 Astra, Local Windows at `D:\Projects\litigation-system`, same implementation
conversation. The owner requested Medium reasoning effort; the agent cannot
independently verify or change the desktop effort selector. No subagents were
permitted or used. Expected usage was Medium, mainly production-browser and
preservation proof. Existing fixtures, dependencies and unaffected passing
evidence are reused; no service, subscription or infrastructure expense was added.

README, PRD, decisions and task order were read in order, followed by current
governance, the original Phase 2 report and affected source/tests. D52–D57 and
the owner's 9 September correction mandate govern scope. The supplied
[independent review](../reviews/2026-09-09-task-4-1-phase-2-independent-review.md)
is preserved byte-for-byte as evidence, SHA-256
`bd4e88a49104a80da60346ade35d3f83556b2edbb0062f9f34eccaf9f94b9b2b`.

Before editing, clean `main`, including untracked files, had no operation or lock:

- HEAD: `7872a52b19f838ab76bd02a901424e8d75758b4d`.
- Parent and recorded `origin/main`: `9962c9792180b5c46f9307aac03548edc4e9e597`.
- Ahead/behind: 1/0; subject `feat: add read-only client and contact screens`.
- Exact scope: 36 files, +3,007/−236.

No fetch was performed. The original commit and external review package remain
intact. The correction's exact final commit, parent, statistics and artifact
hashes are recorded in the accompanying external delivery receipt, avoiding a
self-referential commit identity in this report.

## Changes and reproduced failures

R1 changes the empty-results include-archived destination to use the existing
validated filters and `clientListHref`, changing archive to `all` and resetting
list page to 1. The explicitly labelled Clear link keeps its existing reset.

R2 adds the effective `contacts.page` to the optional main-contact link, matching
ordinary contact-row links. Following the displayed Back-to-client link now
restores contact pagination alongside the retained client-list query and page.

Permanent browser assertions use the existing archived-parent/contact record
and the existing 28-contact client. Before either source edit, the updated
browser harness built and ran the original application, collected both independent
paths, saved expected/actual JSON and screenshots, and then failed its assertion:

- R1: searching `__PHASE2_ARCHIVED_PARENT_CONTACT` with `Disabled`, `current`
  and requested page 2 correctly showed no results. Clicking include archived
  produced only `archive=all`, blank search, status `all` and 25 visible results
  instead of the one matching archived client.
- R2: from contact page 2 with a retained duplicate-name query, `Disabled`,
  archive `all` and client-list page 2, the main-contact link omitted
  `contactsPage`. The displayed Back link returned contact page 1 with 25 rows,
  instead of page 2 with the expected three contact identities.

Both observations survive in `before-browser/navigation-evidence.json` and
`navigation-r1.png` / `navigation-r2.png`. The expected assertion failure did
not prevent the established fixture cleanup. The fresh passing run uses the
same permanent assertions, with separate output so the failure evidence remains.

Only two application link expressions change. Query helpers, services, guards,
sessions, logo validation, database mechanisms, migrations, grants, audit contracts,
dependencies, strings and styles remain unchanged. There are no business-rule,
mutation, redesign, Phase 3/4 or Task 4.1a changes.

## Verification and evidence reuse

Fresh correction verification:

- `npm run test:client-browser` before the application fix: production build
  passed; exit 1 on the expected R1 assertion, with both R1/R2 observations
  saved first and disposable cleanup passed.
- `npm run test:client-browser` after the fix: exit 0; production build and
  58 states/proofs passed, including 50 zero-violation axe audits, 55 screenshots,
  all four roles, 54 logos, six unnamed contacts, desktop/390/320 layouts and
  genuine 200% browser zoom. Chromium version: `151.0.7922.34`; zero external
  requests. R1/R2, ordinary contact return, displayed client-list return and
  Clear/browser Back assertions all passed. Both navigation screenshots were
  visually inspected. Screen-reader speech and final workflow acceptance were
  not tested by this correction.
- `npm run check`: all eleven static checks passed after build/helper cleanup.
- Forced-read-only project `/verify.sql`: 15/15; `npm run db:check` with
  `PGOPTIONS=-c default_transaction_read_only=on`: 116/116 historical invariants.
- Full preservation helper before/after: exact comparison passed. Both receipts
  also match the original Phase 2 receipt SHA-256.
- `git diff --check`, reviewed changed-file scope, byte identity of the supplied
  review and original package hashes: passed.

Both browser runs restored complete migration-62 state into their own PostgreSQL
17.11 instance and verified that checkpoint without redeployment. Their web
processes used only generated restricted runtime credentials and copied logos,
with no source environment file or migration credential. Before-fix database
port was 63556; web port was 19657. The successful run's ports and cluster
identities are in its `application-isolation.json`; both database ports differ
from project port 5433. Browser requests were confined to localhost.

The first ordinary-permission preservation-helper invocation failed at Node's
subprocess launch with Windows `EPERM`, before database work. The authorized
read-only capture and subsequent installed-tool/Docker/browser execution used
the reviewed elevated execution path. No safeguard was bypassed and no automatic
approval rejection occurred.

The original Phase 2 service and regression results are reused explicitly;
they are not represented as fresh correction runs. The relevant implementation
and test dependencies remain unchanged:

- `npm run test:client-read-only`: real populations, all four roles, distinct
  paging/search, denied-session boundaries and logo/filesystem negatives.
- Passing authentication, account, 448-permission, staff read/mutation/race and
  Gate 4 groups from `npm run test:client-regressions`.
- Both passing audit/event profiles from
  `npm run test:client-regressions -- --suite=audit`, after the original report's
  documented test-actor correction. The earlier partial regression failure is
  retained and is not described as a passing full wrapper invocation.

The original [implementation report](2026-09-09-task-4-1-phase-2-read-only-clients.md)
documents these results and limits. Original evidence ZIP SHA-256:
`4d08e8da695374b382a9de069228c51a502631d596a109fc671221ffe62fc61f`.
The correction package records hashes of reused logs and verifies unchanged
implementation scope against the original commit. No redundant database suite
was rerun for the two link expressions.

## Preservation, cleanup and delivery

The pre-edit full forced-read-only receipt matches both original Phase 2 receipts
byte-for-byte, SHA-256
`05a164f773ee7f9ade66b7db9886f110f8c50e11fb655cb6f28ad9ac3a0b89d6`.
It covers 107 complete tables, 48 full sequence states (`last_value`, `is_called`,
`log_cnt`), catalogs/roles/grants, migration/audit evidence, project container
identity/configuration and all 54 logo paths, sizes, timestamps and hashes.
The checkpoint remains 62 applied, one approved historical rollback and zero
unfinished migrations. Original migration hashes remain exact:

- 60: `7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`.
- 61: `87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904`.
- 62: `88ab034517f76e152e944f1a0949edc175a286c7bfeefe82fba0672c6b86f6c1`.

After both fixtures exited, forced-read-only verification again passed 15/15
and 116/116. The final receipt is byte-identical to this correction's before
receipt and both original Phase 2 receipts with the SHA-256 above. No table,
full sequence state, catalog/role/grant, migration/audit value, project service
identity/configuration or original logo changed. There are zero pending or
unfinished migrations; migration 62 was not redeployed.

Both fixture cleanups passed, and independent final inventories found zero
task-owned Docker containers, volumes or networks. Both recorded server PIDs
were absent; browser profiles, generated credentials, copied logos and physical
build mirrors were removed. Only the newly created empty build parent was
removed after verifying its resolved workspace path and emptiness. Existing
recovery packages and permissions remain intact.

The delivery contains only the additional full-index binary-safe commit patch,
checked for reverse applicability without applying, plus a sanitized evidence
ZIP with a verified per-file size/SHA-256 manifest. Credentials, password hashes,
environment files, raw databases/dumps and operational source files are excluded.
The external receipt records final clean `main`, two ahead/zero behind the
unchanged recorded origin, no operation/lock, and the exact correction commit
and parent. The original implementation commit and review package are retained.
No fetch, push, amend, reset, clean or rebase was performed.

## Changed files and return point

- `src/app/clients/page.tsx`
- `src/app/clients/[id]/page.tsx`
- `scripts/test-client-browser.mjs`
- `docs/reviews/2026-09-09-task-4-1-phase-2-independent-review.md`
- `docs/task-reports/2026-09-09-task-4-1-phase-2-navigation-correction.md`
- `docs/task-reports/2026-09-09-task-4-1-phase-2-read-only-clients.md`
- `README.md`
- `TASKS.md`
- `docs/PRD.md`

The immediate stop is independent Phase 2 correction review. No checkbox was
changed and no owner acceptance is claimed. Phase 3 remains the next development
phase, unstarted and requiring its own authorization. Task 4.1 overall, Phases
3–4 and Task 4.1a remain unchecked; D43/D51 final Access cutover remains separate.

## Acceptance addendum — 9 September 2026

Khaled Helmy explicitly accepted Task 4.1 Phase 2 by sending the same-chat
acceptance mandate on 9 September 2026. This owner decision follows the
[independent correction review](../reviews/2026-09-09-task-4-1-phase-2-correction-independent-review.md),
which passed and closed both R1 and R2 with no new blocking finding in its scope.
The review alone did not grant acceptance; the subsequent owner mandate did.

Accepted correction: `0fc988e5f0809a215d405d52f2e0cfef31dc5464`,
`fix: preserve client navigation state`, 9 files, +451/−7. Its exact implementation
parent is `7872a52b19f838ab76bd02a901424e8d75758b4d`. The
[original independent review](../reviews/2026-09-09-task-4-1-phase-2-independent-review.md)
and [implementation report](2026-09-09-task-4-1-phase-2-read-only-clients.md)
remain preserved; the correction evidence above explains the two closed paths.
The correction review is preserved byte-for-byte, SHA-256
`28bfad73fdb222f09b7ef5e97de095e356349910c59711acd364b6ed33c42ea8`.
No business decision is added or renumbered; D52–D57 remain the approved contract.

This acceptance task is Local Windows, in the same GPT-6 Astra conversation,
with no subagents. The owner requested Light/Low effort; the agent cannot verify
or change the desktop selector. Expected usage is Low: bounded documentation
and Git checks reuse reviewed evidence, with no new expense or infrastructure.

Pre-edit Git verification found clean `main`, including untracked files, at the
accepted correction, two ahead/zero behind recorded `origin/main`
`9962c9792180b5c46f9307aac03548edc4e9e597`, with no operation or lock. The exact
commit chain, correction subject/statistics and all four original/correction
patch/ZIP hashes matched their recorded receipts. No fetch was needed or run.

Evidence distinction: the correction task freshly ran all eleven static checks,
its production build and 58 browser proofs (50 zero-violation axe audits), plus
15/15 setup checks, 116/116 invariants and complete preservation comparisons.
It explicitly reused unchanged service, 448-permission and successful regression
groups, retaining the original partial failure and affected audit rerun. Those
are reviewed historical results, not new executions in this acceptance task.
The artifact-based independent review's limits remain as stated in that review.

This task performs documentation/Git validation only: installed Markdown parsing,
local links/anchors, encoding, exact review bytes, unchanged checkbox states,
current-reference consistency, `git diff --check` and the complete staged scope.
Markdown retains the repository's existing exclusion from automatic Prettier
reflow. The external acceptance receipt records the exact check results, enclosing
commit/parent, patch statistics/hash and verified evidence manifest. There is no
new application build, browser run, Docker/database command or live preservation
claim, and no application/test, dependency, governance, migration or configuration
change. Existing resources, recovery packages and earlier artifacts are retained.

Exactly six documentation files comprise this acceptance change: `README.md`,
`TASKS.md`, `docs/PRD.md`, this correction report, the implementation report's dated
pointer, and `docs/reviews/2026-09-09-task-4-1-phase-2-correction-independent-review.md`.
The single local commit is `docs: accept Task 4.1 Phase 2`; only that commit is
exported as a full-index binary-safe patch, reverse-checked without applying.

Phase 2 remains checked and is accepted. Task 4.1 overall, Phases 3–4 and Task
4.1a remain unchecked; no other checkbox changes. Implementation and correction
review are complete. **Immediate stop: independent review of this acceptance
documentation before separately authorized publication.** The next development
phase is Task 4.1 Phase 3 — Authorized mutations and archive/restore, unstarted
and requiring its own authorization. No push, history rewrite, deployment or
later-phase work is authorized here. D43/D51 final reconciliation remains separate.
