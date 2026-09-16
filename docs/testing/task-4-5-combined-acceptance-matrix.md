# Task 4.5 combined candidate — acceptance matrix

Established before implementation on 15 September 2026. Base:
`e747e0efbdadb92892e933d768924e3e287e9a9a`. D64 was adopted by the owner's
direct instruction. Every row starts pending; only executed evidence may close it.
Task 4.4 remains checked and Task 4.5 remains unchecked.

| Area | Required evidence | Result |
| --- | --- | --- |
| Handoff | External manifest, all 838 members, nested review, raw Git identities | PASS: preflight verification receipt; no application test claimed |
| Accepted base | Clean e747e0e, tree, narrow fetched origin/main, governance and 86 checkbox lines | PASS: preflight and `source-preservation-final.json`; candidate identity checked again at delivery |
| Owner preservation | Dated process/build, cluster/ledger, full table digests, complete sequences, private-state and logo hashes before/after | PASS: `owner-before.json`, `owner-final.json`, `owner-preservation-final.json`, `owner-runtime-final.json`; 124 tables and 48 sequences unchanged. Full build-file inventory is after-only; matching preflight PID/creation/build ID is a narrower observation |
| Upgrade | Accepted 69 copy: baseline checks before fixtures; exact old-column/sequence preservation; candidate70 delta | PASS: attempt18 setup 15, accepted baseline 137, candidate 141; complete upgrade preservation and injected late rollback |
| Canonical | Established canonical replay through candidate70 and permanent checks | PASS: canonical06 baseline 119, candidate/final 123, native create/archive/restore and old lifecycle receipt retries after later changes |
| Reads | Four roles, independently expected complete sets/order, fields and relationships, full imported volumes | PASS: attempt18 `behavior-results.json` and `independent-search-results.json`; all 752 imported identities plus separately identified native controls |
| Search/filter | Normalized digits and exact ID controls, hamza/diacritics/no-J-fold, literals, aliases/raw text, every filter/intersection, pages and rejected parameters | PASS: attempt18 independent search and 16 copies/report intersections; 297 full archive/client/lawyer filter sets in `browser-results.json` before that run's later browser assertion failure |
| Fields/edge cases | Current/source distinctions, duplicate text references, multiline, NULL/empty, all copies/report meanings, inactive/external and unresolved evidence | PASS: attempt18 behavior, search and person-deactivation controls; source facts and complete imported reconciliation |
| Editing | Both writers; fields, client changes, retained current membership lifecycle/order, native provenance, validation, atomic history/audit | PASS: attempt18 exact all-field, NULL/empty/date-boundary and current-client clear/replacement proof; browser action proof passed in attempt19 |
| Lifecycle | Administrator only, confirmation facts, independent parents/states, non-cascade, preserved counts/report/copies/evidence | PASS: attempt18 behavior and observed edit/archive conflict; archived editing is forbidden, so a separate successful edit/restore race is not claimed |
| Authorization | Pages/actions/services/database, fresh invalidated-session denial and direct table/sequence/helper denial | PASS: attempt18 complete permissions suite, service/SQL negative controls and session proof; explicit direct insert, both sequence, private helper and receipt-table probes passed |
| No-op/retry | Complete state comparisons, owned exact retries after later changes, rejected altered/cross-actor tokens, failed reservation disclosure | PASS: attempt18 behavior/adversarial/session evidence. Failed insertion reserved an ID without retaining rows; no sequence rewind. Canonical06 old lifecycle receipt replay passed after restore without changing state |
| Concurrency | Observed lock overlap for competing edits/lifecycle/memberships/tokens/client/person/account state | PASS: attempt18 `adversarial-results.json` and `session-proof.json` record actual waiters/blockers and legal outcomes for every listed conflict family |
| Corruption | Disposable defects refused by permanent source, history, membership, state, receipt and grant checks | PASS: attempt18 eleven recorded corruption/authorization refusals; actual reasons reviewed; data triggers re-enabled before data checks |
| Browser | Isolated production build, four roles, successful mutations, negative routes, stale drafts, Cancel/Escape/focus, RTL/mobile/zoom and screenshots | PASS: attempt19, 15 screenshots, four roles, both writers, Administrator lifecycle, native 200% zoom and 320px. Final 141 database checks and ownership-checked cleanup passed |
| Regression | Exact unchanged Task 4.4 dependencies/evidence reuse and focused changed-dependency checks | PASS: `source-preservation-final.json`, unchanged Task 4.4 sources and supplied final independent review/verification; new permission and checkpoint/invariant checks. Old full application suites were not rerun |
| Gates | Type/lint/format/RTL/authorization/audit/read/encoding/ignore, permissions and whitespace | PASS: project-check11 and attempt18 permissions; final source/encoding/whitespace receipts bind the finalized candidate |
| Delivery | Clean single child commit, exact patch reconstruction, complete review ZIP/manifest, verification and non-circular receipt | Recorded after this tracked document is committed in the final external candidate identity, reconstruction, verifier result and delivery receipt; no circular self-commit claim |

OS screen-reader speech remains owner-excluded. No full accessibility,
production acceptance, actual migration70, activation or publication is claimed.
Failed attempts and executed source bindings belong in the evidence ledger.
Attempts 01–08 have incomplete historical source capture; available artifacts are
retained and no final passing result relies on them. Attempt14's dynamic browser
body was recovered against its recorded hash. Later captured source versions are
not substituted for earlier execution.


## Owner acceptance and actual local activation — 16 September 2026

The complete corrected D64 module at `e4806160bf70184526e3a8bc10e18b0d7e6f953f` is owner-accepted.
The independent correction PASS closes T45-R1 and T45-N1. The original matrix
above remains an exact 6,041-byte prefix; the R1 matrix and earlier reports/reviews
remain unchanged. This addendum records fresh operations separately from reused proof.

| Gate | Result and evidence |
| --- | --- |
| Inputs/source | Separate handoff manifest verified; exact e480616 source and all migrations1–70 bound |
| Recovery | Fresh protected database/roles/config/logo backup, complete member hashes and ACL checks; exact dump restored in a distinct PostgreSQL17.11 cluster |
| Pristine rehearsal | 137/15 at69; only exact70 deployed; 141/15 at70; old rows/projections and complete sequence states preserved |
| Stable build smoke | Build lMSctpvPZP2Yn99F0XmmD: authenticated fixture reads, filters, native create/edit/clear, both R1 draft paths, archive/restore, Cancel/Escape, RTL/mobile and prior module navigation |
| Actual operation | Migration70 once; 128 tables; all124 prior table projections exact except explicitly enumerated additions; all48 full sequences exact; accounts/credentials/config/logos preserved; 141/15 checks PASS |
| Actual runtime | Loopback3000; exact accepted build/source and owner70 target; anonymous login/assets/protected-route refusal PASS |
| Actual authenticated observation | PASS_WITH_FINDING; precise limitation in the report; no owner business mutation used as a smoke test |
| Publication | Authorized ordinary main publication occurs after the sole documentation child; external receipt owns its outcome |
| Cleanup/stop | Only identified disposable resources removed; accepted app and private recovery retained; stop for independent combined review |

Earlier448 permission decisions,123 canonical checks, exhaustive concurrency,
corruption/retry and correction green02 evidence are source-bound reuse, not fresh
counts for this operation. No screen-reader speech or full accessibility claim.
Only the existing Task4.5 checkbox changes; the other85 lines remain exact.


## T45-A1 correction and local closure — 16 September 2026

Correction `b7fc7c7a6afc412ad5a8dc42d72ef2109380b1fb`; stable build `WvgH-6nuin9o1QPJrPst4`.
Locally accepted/verified; final independent review pending. The original A1
observation above remains historical. All 86 task checkbox lines stay exact.

| Evidence | Result and boundary |
| --- | --- |
| Original defect | Reproduced on unchanged production build: client325 → Clear gives bare URL/752 results but stale325, then Search reapplies325 |
| Fresh corrected navigation | Four roles; 263 observation records, not independent-test counts; individual filters, missing/unknown, intersections, text/Western/Arabic-Indic q, Clear/Search, same-URL drafts, repeated Clear, paging, history, detail/edit and Administrator archive/restore Cancel |
| Independent expected results | Raw database snapshot plus test-side filters/order/page IDs and count; production list/parser/query builder not used as oracle |
| UI preservation | 320px Arabic RTL/no overflow, keyboard Tab/Enter with focus contrast/visibility; native GET/clear-anchor HTML retained; ordinary no-JS loading limitation unchanged |
| Existing mutation/security proof | Exact unchanged-source reuse of R1 native invalid number/date recovery, CRUD/current lawyers/lifecycle,448 permission/123 canonical and backend/retry/concurrency/corruption evidence; not freshly rerun |
| Database | Owner and final disposable141 historical/15 setup gates;70 completed, zero unfinished; no new DDL |
| Recovery/preservation | Fresh protected70 dump restored on distinct owned cluster;128 table digests/all48 full owner sequences, ledger/ACLs, accounts/credentials/config/54logos exact |
| Corrected actual app | Stable artifact, loopback3000; anonymous and legitimate Administrator read/navigation/Cancel PASS; no owner business submission; no fabricated restore |
| Scope/stop | Two bounded commits; ordinary publication in external receipt; final independent review pending; no4.6/Ubuntu |

See [A1 closure report](../task-reports/2026-09-16-task-4-5-a1-closure.md).
