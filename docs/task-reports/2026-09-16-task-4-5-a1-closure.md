# Task 4.5 — A1 correction and local closure

16 September 2026. **T45-A1 corrected and locally accepted/verified;
final independent review pending.** Khaled authorized this combined correction,
verification, local closure, activation and ordinary publication in the same task.
The prior independent readiness review is imported verbatim; its earlier A1 finding
is historical, not a claim that this correction already received independent PASS.

## Correction and exact scope

Base `cd89148d546bca61f2f0243cc433adcb7b4d2d7a`, tree
`dc1711618688e84047c9153cd62307852f39631e` (707 paths).
Correction **`b7fc7c7a6afc412ad5a8dc42d72ef2109380b1fb`**, directly over that base, subject
`fix: synchronize powers-of-attorney filter controls`.
Its four paths are the POA list, new co-located `poa-filter-clear.tsx`, the new
`scripts/test-poa-filter-browser.mjs` and its existing browser-driver integration.

Previously, Clear changed the URL/results but an uncontrolled form could retain
client325; Search then reapplied it. The form now remounts when the URL parameters
change. Clear immediately resets its six controls to the list defaults, including
unsent drafts at the bare URL. At that same URL it avoids an unnecessary route
refresh that could race Search. Browser document-history restoration resets saved
drafts to that document's applied defaults; ordinary editing/renders do not.
Modified-link clicks retain their normal behavior. Native GET/anchor fallback stays.
Query interpretation, result ordering/page size, strings, server permissions,
editor, mutation/retry/audit boundaries and D64 remain unchanged.

## Fresh proof and bounded recovery

Red reproduction ran before production edits against unchanged build
`lMSctpvPZP2Yn99F0XmmD` on a positively identified disposable full-state copy:
client325 had2 results; Clear returned bare URL/752 results with stale325; Search
reapplied325. The screenshot, exact test/driver and source/build binding are retained.

Passing corrected run: `green-2026-09-16T10-30-05-929Z`. It records **263 observations across
all four roles**, not 263 independent tests. Every filter and missing/unknown
option, representative intersections, shown/hidden/unknown report values, fixture
archived state, text and both digit forms, ordered IDs/counts, paging, same-URL
drafts, repeated Clear, Search after Clear, Back/Forward and detail/edit/confirmation
Cancel are covered through real browser actions. Expected sets are independently
calculated from a raw-row snapshot, not the production parser/list/query function.
Keyboard Tab/Enter, focus visibility/contrast and320px RTL/no horizontal overflow
passed. Native GET form/clear-anchor HTML and defaults were verified with JavaScript
disabled. Visible interaction is unavailable: ordinary browsers receive the same
streamed loading shell on unchanged and corrected builds. A crawler-UA attempt also
stayed on that shell. This existing limitation is explicitly compared; no successful
no-JavaScript interaction is claimed.
No external browser requests
or page errors were observed. Navigation itself left complete fixture state exact.

All unsuccessful harness/build attempts remain in the operation ledger with source
and outputs. They include restore ACL representation, navigation timing, test-only
archive payload and search-normalization assumptions, the initial className type
error, and a premature missing-artifact launch on the old disposable build. The
green harness now requires an explicit corrected artifact. Repeated same-URL route
refresh prompted the final narrow source refinement before any commit or activation.
No guard was weakened, owner mutation submitted, migration replayed or evidence erased.

Full production build and `npm run check` passed on the frozen correction artifact:
typecheck, lint, formatting, RTL plus self-tests, authorization, audit plus self-tests,
account/staff/client/administrative-work/POA guards, Git exclusions and encoding.
Installed dependencies were reused unchanged. Final documentation checks and exact
path/checkbox/prefix/source reconstruction are recorded externally.

## Precisely reused proof

The source map binds406 unchanged accepted runtime/source paths and272 original
backend dependency paths. R1 editor/native invalid number and date controls,
intentional clearing/recovery, and Administrator create/edit/current-lawyer/archive/
restore smoke reuse the unchanged accepted correction and prior activation evidence.
The original448 permission decisions,123 canonical checks and backend/current-source/
search/retry/concurrency/corruption suites are reused through exact Git identities.
They were **not rerun for A1**. Fresh work is the navigation regression and operation
described here. D59's two unchanged source bodies remain opaque in shareable source;
their unchanged identities are checked, not presented as remediation.

## Migration checkpoint, recovery and preservation

Fresh owner identity: PostgreSQL cluster `7676117521894273062`, `litigation-db`,
loopback5433;70 completed migrations, zero unfinished,128 tables/48 sequences.
All ledger checksums and exact reviewed70 SQL were verified; the pre-existing
migration33 newline checksum exception is explicitly preserved. Migration70 remains
36,411 bytes, SHA256 `58bc280c9697b46936cc93263b68a48a4907b9a06c11d6dcefe161a6ba916955`.
**New owner migration applications: zero. No migration71.** Fresh read-only owner141
historical/15setup checks and final disposable141/15 checks passed.

Fresh protected recovery: `D:\Projects\LitigationData\DB-Backup\migration63\pre-task45-a1-2026-09-16T09-28-44-446Z-ff80c725-d38e-4708-bce1-9f02556db846`.
Dump SHA256 `00d7fa9b83f2c3456951a6bcbd7ea1fd9703a4b538881c241b81d10bf7dd7f90`; private manifest SHA256
`5cd293093ec50fd12dbde0bc096568cd5dfe249779084cf5f9c64330b5a9ea95`. Dump, protected role/config/account recovery and54logos
are retained locally under restricted ACLs, excluded from Git/shareable bytes.
The coherent before/after owner capture matched exactly. Restore used a distinct
owned PostgreSQL17.11 cluster and temporary credentials, never owner role passwords.
All128 restored table digests/catalog/ACL/ledger/account projections and logical
sequence values matched; pg_restore's WAL sequence log-counter representation is
disclosed. Pristine141/15 reuse is bound to the same fresh dump and exact restored
state; final green141/15 executed anew. Only identified fixture resources were removed.

Owner snapshots compare all128 tables, complete48 sequence vectors, schema/ACL/ledger,
accounts/session/credential fingerprints, configuration and54logos. Private credentials
are compared in memory. Actual read/Cancel windows changed no state; the existing
legitimate Administrator session required no login/token injection or account reset.
Earlier backups, evidence and the old accepted artifact remain preserved.

## Stable activation and actual observations

Exact correction source built in `D:\Projects\LitigationData\task45-a1-accepted-20260916T103752Z`.
Build **`WvgH-6nuin9o1QPJrPst4`**, PID **67728**, started `2026-09-16T10:44:42.677Z`,
at **http://127.0.0.1:3000**. Build/source/generated/dependency identities and the
tested-artifact runtime equality are bound in external receipts. The app runs from
this stable artifact, not the working checkout or a development server.
Only the positively reidentified older litigation app was stopped after the new
build was ready; its executable/path/creation/listener/build receipt is retained.
Existing restricted runtime credentials/authentication and logo root were reused;
the web environment contains no migration-owner connection. Loopback exposure only.

Anonymous Arabic login/assets and protected-route redirects passed. The existing
legitimate Administrator session exercised Clear→Search without reload, all defaults,
same-URL draft Clear, filtered return/detail/edit/eligible confirmation Cancel and
bounded earlier-module reads. No owner business mutation was submitted. Actual
restore was not fabricated: no genuine archived POA existed, so restore behavior
remains isolated proof. Full actual state/credentials stayed exact. These are dated
observations, not a promise of continuous health or screen-reader certification.

## Documentation, publication and delivery

The sole documentation child uses `docs: close Task 4.5 filter correction and activation`.
Its eight allowed paths are README, TASKS, PRD, DATABASE, MIGRATION, the combined matrix
append, verbatim readiness review and this report. All86 checkbox lines stay exact,
including checked4.4/4.5 and unchecked4.6. The complete8216-byte matrix prefix and R1
matrix, older reports/reviews, D1–D64, governance, migrations1–70 and dependencies
are unchanged. The two-commit chain has711 final paths;699 existing base paths stay exact.
All runtime inputs of this documentation child equal activated correction A.

This report does not contain its own future commit SHA or preclaim publication.
The external receipt supplies exact A/B ancestry, individual and cumulative binary
full-index patches, raw commit/recursive-tree inventories, private and shareable
forward/reverse reconstruction, actual push attempts/fresh remote equality, final
runtime/preservation checks and the complete non-circular review envelope.
Only the approved suffix over cd89148 is authorized for ordinary non-forced main push.

Evidence root: `D:\Projects\LitigationData\review-evidence\task45-a1-20260916T092051Z`. Every new receipt-listed artifact is supplied, including
verification/exclusion helpers/results, failed-attempt chronology and prior-proof
bindings. Protected recovery bytes and the two unchanged D59 bodies are intentional
exclusions. Independent combined correction/closure/activation/publication review
is the next step. Leave the corrected app running; no Task4.6, other task, subagent,
Ubuntu deployment or Access cutover.
