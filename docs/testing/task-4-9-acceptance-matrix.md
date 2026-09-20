# Task 4.9 — candidate acceptance matrix

## Correction 1 supersession — pending independent review

The original matrix below is historical implementation evidence, not acceptance.
Independent review of `fe4452d` found R1's event-only orphan path, R2's lossy
formatted Base64 values/state-label collisions, and R3's incomplete browser entry
selection. Therefore H08's universal losslessness, H14's complete commit-boundary
invariant and H20's complete surface implication are **superseded**, not reused
as passing correction proof. H02/H03's original final observations predated the
last browser run; correction preservation must finish after all tests/cleanup.

Correction evidence lives under `test-results/task49-correction1-20260920`; its
immutable pre-execution matrix precedes all corrective edits. Fresh results and
exact source bindings are mapped in the dated correction report. The original
report, matrix snapshot, failing samples and five-file delivery remain intact.
No checkbox or acceptance status changes.

| Correction | Fresh supplied outcome | Evidence |
| --- | --- | --- |
| T49-R1 | Event/private-side correspondence enforced at transaction boundary; legitimate exports and rollback/concurrency/refusals pass | `invariant-02`, `exports-01`, revised upgrade and canonical replay |
| T49-R2 | 23 independently decoded typed inputs exact; visible state/literal distinctions in browser and PDF | `values-02`, `browser-03`, visual inspection |
| T49-R3 | 23 explicit entity families, 26 surfaces and 29 openings; scope IDs, keyboard/focus and shared workflows pass | `browser-03`, required-surface oracle and successful focus trace |

Prepared before implementation/test execution, updated with supplied Windows
results on 20 September 2026. **Candidate only; not independently accepted.** Base:
`ba360643937fd0af9d11b12b7f18f8ddec093aac`. The immutable initial copy is retained
under `test-results/task49-20260920/matrix-before-execution.md`. Checkbox lines
in TASKS.md are outside this edit.

## Authority, isolation and evidence

The owner adopted `task49-audit-history-implementation-prompt.md`, SHA-256
`68b2c78e21edc343e9335d77e4b9189a8d7d9b84b6cdbb4328edd0f7e82cd43e`.
Original mandate, authorization and all five input companions remain in the
ignored task evidence directory. D30–D35 control history and capability;
D24/D37/D38 control current sessions. No owner writes, restart, provisioning,
push, checkbox closure or Stage 5. No subagents.

Owner read-only observations precede candidate work. Database writes and browser
logins use independently identified task-owned clusters and loopback mirrors.
Every run retains collector/test source hashes, timestamps, commands, outputs,
expected/actual records and failures. Private credentials/dumps are excluded
from the review package. Reused proof must state its exact unchanged boundary.

## Bounded implementation plan

1. Verify artifacts, fresh base, complete owner state, protected files and
   immutable actor/account mapping; inventory real writers and event shapes.
2. Implement a forward migration for explicit account capability, guarded audit
   read/export gateways and exact permanent checks. Keep existing audit records,
   classifications, migrations and all legacy role decisions intact.
3. Implement shared safe history projection, exact timestamps/IDs, historical
   association, truthful request grouping, filters and signed snapshot cursors.
4. Add global Administrator page, contextual responsive modal drawer and all
   existing detail/child entry points. Preserve ordinary business timelines.
5. Add deliberately initiated capability-gated XLSX and Chromium PDF exports,
   final current-authority checks and truthful server-generation audit facts.
6. Prove migration/full-state and canonical paths, negative permissions and
   independent result/export oracles; browser/RTL/focus/zoom proof; project gates.
7. Compare owner and protected state, inspect complete diff, create one local
   child and verify the non-circular five-file review package. Stop for review.

Expected file areas: new `src/lib/audit-history*`, `src/app/audit-history/*`,
shared history components, existing detail surfaces/navigation, `src/strings.ts`,
one new Prisma migration/schema, precise authorization/audit/database inventory
extensions and tests, minimum local PDF dependency if necessary, canonical
candidate documentation and verbatim prior operational review. Existing shared
authentication/writers will not be refactored merely for convenience.

## Requirement-to-proof matrix

| ID | Required independent expected outcome | Planned source/test and evidence | Result |
| --- | --- | --- | --- |
| H01 | ZIP and all members/source/tree/receipt bindings exact; fresh remote and local base match | inspected input verifiers; Git commands and `git-before.json` | Input/base checks passed; not product proof |
| H02 | Current 72 profile and every owner table, sequence, catalog, prior event/ledger row preserved | `capture-state.ts`, owner before/after and comparison | PASS: 138 tables, 48 sequences, 880 prior audit rows, 73 ledger rows, 15 catalogs; exact same-owner equality |
| H03 | Accepted artifacts, credentials, logos, prior recovery/evidence and runtime preserved; additions/deletions enumerated | `capture-files.py`, runtime collector, before/after inventories | PASS: 47,745 prior files, 8 junctions, ACLs; 21 explicitly enumerated new task-canonical evidence files; same PID/build/container |
| H04 | Resolve unique KHelmy/person 139 through actual immutable actor-account link, not assumed account arithmetic | `history-inspection.json`, `migration-v3`, `canonical-04`, upgrade comparison | PASS: upgraded owner-copy account 2/actor 1002; canonical replay account 3/actor 1003; same person, unique explicit actor key |
| H05 | Real events retain exact IDs, provenance and fields; no fabricated Access history | `core-03/proof` independent SQL versus reader | PASS: 905 events, 47 groups, 7,816 projected scalars at that snapshot |
| H06 | One genuine request/save groups semantic and structural events; distinct requests never merge | `core-03`, `boundary-02` | PASS: genuine document lifecycle; 28 requests at one microsecond remain 28 groups, including 60-event group |
| H07 | Retired/relinked children remain associated by historical/immutable keys; both fee directions distinct | `boundary-02` all-family oracle; `relationships-01` genuine mutations | PASS: 35 scope comparisons; covered add/retire/restore and reference set/replace/clear; original evidence retained |
| H08 | Missing/null/empty/zero/false/redacted/truncated/unknown and exact numeric meaning remain distinct | Original `core-03`, `exports-03`; corrected `values-02`, `browser-03` | Original universal PASS superseded by R2: formatted-label collisions/lossy original column; fresh typed-envelope proof replaces that claim |
| H09 | Historical actor/action/date/value filters search full result, with approved normalization | `core-03`, `boundary-02` combined filters and UTC edges | PASS; no J-to-Arabic fold |
| H10 | Complete stable pagination under appends/huge groups; microseconds and cursor safety | `boundary-02` and `core-03` | PASS: ID above 2^53, exact union, tampered/expired cursor refusal, concurrent append excluded from old watermark |
| H11 | Every usable Administrator views; three other roles denied all protected surfaces | `permissions-03`, `browser-08`, `exports-03` | PASS: original 448 unchanged + 32 audit decisions = 480; second Administrator can view |
| H12 | Unusable/stale/expired/forced-reset/non-Admin sessions refused before work | `auth-01`, `user-management-01`, `permissions-03`, `core-03` | PASS fresh current-profile regressions and full refusal-state equality |
| H13 | Capability default denied, independent of rename; no ordinary UI/payload grant | `exports-03`, `browser-08`, `account-ui-02` | PASS: second Admin denied; rename/revocation race; real forged `/users` Server Action refused without writes |
| H14 | No raw runtime access/escalation/audit mutation; permanent drift enforcement | Original `boundary-02`, `permissions-03`, foundation60; corrected `invariant-02` and current checks | Original cases remain valid but did not prove event-only commit prevention; R1 corrects that gap. Foundation remains checkpoint60 only |
| H15 | Both formats export all selected results at fixed watermark | `exports-03`, `browser-08`, `pdf-inspection-02` | PASS: global XLSX 1,004 events/105 groups; global filtered PDF 75 events/42 groups; contextual and empty outputs |
| H16 | Literal safe values, no renderer fetch, accurate RTL and bounds | `exports-03` renderer fixtures and `pdf-inspection-02` | PASS: 25-page synthetic PDF, escaped payloads, no URI annotations, fonts and actual pages visually inspected |
| H17 | Revocation/audit failure releases no artifact; concurrency/retry semantics exact | `exports-03` fault/barrier/concurrency proofs | PASS: zero receipts on refusals; double-submit 200/409 with one event; generated fact is not client receipt |
| H18 | Viewing and refusals cause no persistent writes | `core-03`, `exports-03`, `relationships-01`, `browser-08` full-state comparisons | PASS after genuine fixture login/setup; all tables/sequences/catalogs compared |
| H19 | Clear/Back/Forward/cursor/drafts stay synchronized; stale replies ignored | `browser-08` | PASS desktop/mobile production browser |
| H20 | Labelled drawer, keyboard/focus/Escape, scroll safety, visible focus and reflow | Original `browser-08`; corrected `browser-03` | Original shared interactions passed, but seven entry families were missed. R3 supplies the complete explicit mapping and fresh320px/200% proof; speech excluded |
| H21 | Upgrade/canonical replay preserve existing evidence with bounded migration deltas | `upgrade-preservation-02`, `canonical-04`, `boundary-02` | PASS full-data upgrade; 73 canonical migrations and 130 checks; no old migration changed |
| H22 | Required project/build/permission/auth/account/database checks | Report command map and exact result files | PASS build-06, check-09, permissions-03, auth-01, user-management-01, account-ui-02, db-final-01 (148 checks) |
| H23 | One clean child; frozen authorities/migrations/86 lines; remote unmoved | final Git observation, patch and source inventory in delivered package | Delivery gate: independently recomputed by standalone verifier; no push |
| H24 | Complete five-file package, raw Git identities and reversible exact patch | external manifest/verifier/result/receipt, internal inventory | Delivery gate: verifier must pass on final bytes before handoff; not application acceptance |

## Entity-to-surface inventory to verify

| Existing family | Contextual entry and historical children |
| --- | --- |
| Clients | Client detail; contacts and logo records by actual IDs |
| Matters | Matter detail; lawyer/party/capacity relationships; matter-side fee-letter reference |
| Hearings | Hearing detail and attendee relationship IDs |
| Administrative works | Work detail, step detail and step IDs in parent section |
| Powers of attorney | POA detail and lawyer relationship IDs |
| Documents | Document detail |
| Fee letters | Fee-letter detail and separate covered-matter membership IDs |
| Billing | Invoice/payment detail and actual allocation IDs; no inferred matter linkage |
| Staff | Staff detail, retained aliases and account reference |
| Users | Existing account row; authentication target distinguished from system actor |
| Global only | Lookup, attendance, baseline, system and other recorded families lacking standalone screens |

## Accessibility scope

Use the requested accessibility-testing-strategy, form-labelling,
error-prevention-recovery and focus-attention-design skills for test planning,
persistent labels, actionable errors and user-controlled focus. Existing
project decisions prevail. Actual screen-reader speech testing is excluded by
the owner; no full accessibility-conformance claim will be made.
