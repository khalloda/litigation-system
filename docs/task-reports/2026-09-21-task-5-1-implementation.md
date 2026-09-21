# Task 5.1 — local implementation candidate

21 September 2026. Prepared for independent implementation review, from
`c96bd7229b005b0c7472b1ad64d1d5c4eb48726d`. Task 4.9 remains closed. Task 5.1
remains unchecked; nothing is activated or published. The final commit, parent,
tree and post-packaging observations are recorded externally in the review
manifest and final receipt, avoiding a self-referential commit identity.

## Behavior and implementation

Authenticated home now contains **جلسات اليوم**, the represented Cairo date,
the complete matching count and at most 25 hearing records. All existing
permission-filtered module links, account identity, role and sign-out remain.
The separate home layout uses the existing light brand tokens and bundled
Arabic font; login and change-password styling is unchanged.

One server instant produces a Gregorian `YYYY-MM-DD` in `Africa/Cairo`, with
Western digits. The indexed, parameterized predicate selects only unarchived
hearings whose `next_hearing_date` equals that date. It does not infer a hearing
time, outcome, attendance assignment, cancellation or latest-per-matter rule.
Closed matters, business-inactive clients, archived parents and missing optional
parents remain eligible. Each hearing ID counts separately. Ordering is
`hearing_date DESC NULLS LAST, id DESC`.

The dedicated service authorizes `hearings:view` before protected work and
rechecks usable account/person, role, person identity, session version and expiry
inside a read-only repeatable-read transaction. Count and preview share that
snapshot. Instrumentation measured four statements at every tested population:
read-only transaction setting, fresh account check, count and bounded rows.
It fetches neither attendee joins nor the full hearing-filter option inventory.
The exact SQL calls and complete service body were added to the existing audit
source inventory; its existing protections and negative fixtures remain intact.

Every fresh request or ordinary GET refresh recomputes the date and data. The
route is dynamic; there is no public clock/date override, shared result cache,
poller or new API. A page left open retains the date its rows represent. Empty
and failure states are distinct; ordinary query failure leaves navigation and
sign-out usable. The existing validated hearing link builders carry the same
date to the full paginated list and hearing detail/back links. Matter and client
links use their actual IDs. Case-number and decision lines are preserved; HTML
normalizes CRLF to LF without removing lines.

## Fresh verification

Evidence root: `test-results/task51-20260921-implementation/`. This task used a
separate PostgreSQL 17.11 cluster `7687917316544184358`, restored from a forced
read-only owner snapshot at migration 73. Its initial hearing population was
13,382. Test credentials, database copies, processes, clocks and files belonged
to this task. Browser applications used separate loopback ports, never 3000.

| Evidence | Actual result |
| --- | --- |
| `dates-01` | 12 explicit independent date cases under UTC, Los Angeles, Tokyo and Cairo; winter/summer midnight, leap/year/month rollover and spring/fall transitions. Node 22.23.2, ICU 78.2, timezone data 2026a. Five initial denials before any transaction. |
| `core-01` | Four roles matched independent exact SQL IDs/order/counts at 0, 1, 25, 26, 84 and mixed four-row populations. Full existing list pagination, detail text, archived hearing exclusion, archived parents, closed matter, absent parents/court, NULL/adjacent-date traps and tied ordering passed. |
| `bounds-01` | Four statements regardless of result population; rejected fresh-account snapshot stops after two statements, before hearing SQL. |
| `auth-extra-01` | Separate owned clone: disabled account and inactive person with current session versions denied before hearing SQL. Existing no-login person substitution denied. Clone removed after closing its connections. |
| `status-01` | Hearing linked to an existing client whose stored business status is `Disabled` remains visible; full read-state equality. |
| `browser-06` | Genuine fixture logins for all four roles; exact common 29-row population and 25-row preview. Dated list/detail/back, genuine parent links, home, refresh, midnight, changed data, failure/recovery, empty/archive notices, four sign-outs, session revocation and required-password-change redirect passed. |
| `browser-06` accessibility | Seven axe scans, zero violations; 16 measured visible keyboard-focus checks; browser accessibility tree; 1280/390/320 CSS-pixel widths; genuine Chrome tab zoom 200% with CSS width halved. Chromium 151.0.7922.34. No page errors or external browser requests. |
| `build-02`, `built-02` | Production build passed; exact executed source bodies and 1,799 build-file identities frozen. `/` is dynamic. Existing logo-file tracing warnings are retained. |
| `check-03`, final check | Complete project checks passed before final documentation; the final documentation/source check result is included as `check-final`. |
| `permissions-02` | Full existing suite: 480 role decisions, guard mutation fixtures and database authorization checks passed using its existing restored-fixture mode. |
| `gates-02` | All 148 historical database checks and all 15 setup checks passed on the restored isolated copy, including all 54 copied logo files. |

Full `EXPLAIN (ANALYZE, BUFFERS)` output for empty, selective and dense reads is
in `core-01/query-plans.json`. These are measured fixture results, not a new
performance service-level promise. Native fixture setup and authentication are
separate from read-only windows. The service, browser navigation and
business-status read windows compare all 141 tables/all columns, all 48 sequence
states and catalog/ledger/audit state, rather than counts alone.

Actual desktop/mobile, zoom, failure and archive-record screenshots were
inspected. DOM assertions preserve full multiline text and exact links. The
screenshots and axe output complement each other; neither establishes complete
accessibility. OS screen-reader speech was excluded as instructed. No design or
accessibility skill contribution is claimed. No new dependency was installed:
the task mirror's two missing locked Playwright packages came from the existing
retained dependency copy, with matching versions and unchanged lockfile.

## Preservation and limits

Fresh before/after owner observations and exact protected-file/runtime comparisons
are in `preservation.json`; final cleanup and Git observations are external review
evidence. The owner retained 73 completed migrations, 141 tables, 48 sequences,
543 invoices, 597 payments and 47 allocations. All owner rows/columns, complete
sequence fields, catalog definitions/owners/ACLs, roles/memberships, credentials,
ledger, audit/counter/export state were compared privately using forced read-only
connections. No owner login, password reset, grant, export, migration or restart
was performed. Accepted build `lrLMgtVrMuIaje6eDCMFe` remains on port 3000.

Protected-file inventory covers all existing LitigationData directories, previous
test evidence, root dependencies/build/storage and named project Downloads,
without traversing junctions. It compares bytes, sizes, modification times,
membership, junction targets, root ACLs and credential/configuration ACLs.
It does not independently inventory every descendant ACL. Full private captures,
credential-derived catalog records, dump, credentials, profiles and authentication
state remain restricted locally and are omitted from the review ZIP. The public
comparison and capture-file hashes attest to local comparison; a remote reviewer
cannot independently inspect those withheld bodies.

All 208,472 pre-existing inventoried files remained byte/metadata exact, with all
31 junction targets and observed ACLs unchanged. The final enumeration found
one concurrent new download, `LITIGATION-SYSTEM-PROJECT-CONTEXT(7).md`, bringing
the count to 208,473. It was preserved and its identity disclosed; it was not
adopted as new instructions. No existing protected file was removed or changed.
This preservation note postdates the final full-check start; a separate final
documentation encoding/link check covers the note.

The no-login-person test also exercises person/account mismatch; it does not
manufacture a database state that the existing account/person constraints may
forbid. The explicit `can_login` predicate is additionally pinned by the complete
service closure. Disabled and inactive tests use actual database states with
current session versions. The controlled clock is a task-only Node preload, not
a production feature or host-clock change. Loading has labelled Suspense markup;
the evidence does not claim a timed assistive-technology announcement test.

Failed attempts and diagnostic builds are preserved in `failures.md` and their
logs. They are not counted as passing coverage. Authentication changes in each
successful login window are separately identified. Earlier Task 4.9 implementation
evidence is context only; this candidate's feature/build/browser proof is fresh.
D59 remains **owner-accepted risk — unchanged, not technically remediated**.

## Review boundary

`TASKS.md`, all 86 checkbox lines, AGENTS/CLAUDE, DECISIONS, schema, existing
migrations, credentials/configuration, package metadata and lockfile are unchanged.
The package contains base and candidate Git identities, shareable source, full
patch, test helpers/logs and source/build bindings. Unchanged `.env.example` and
`docker-compose.yml` are identity-only. The external verifier reconstructs both
trees, applies/reverses the patch and checks the final receipt against the sealed
ZIP, manifest and verifier. Its result verifies supplied evidence integrity; it
does not replace independent implementation review or rerun private-state tests.

Stop here for independent Task 5.1 implementation review. No later task,
acceptance closure, owner migration/provisioning, activation/restart or publication
is included.
