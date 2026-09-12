# Task 4.2 Phase 2 — matter creation and editing

This implementation adds matter creation/editing for Administrator and Litigation
Assistant, including ordered parties, capacities and assigned lawyers. Lawyer
and Paralegal remain view-only. The delivery stops for independent Phase 2 review;
Task 4.2 overall remains incomplete. Migration 64 is pending on the real
development database, and the owner's existing migration-63 app is unchanged.

## Authority and accepted base

Khaled's 12 September 2026 conversation message accepts Phase 1 at
`2f8820a3053ab65a60ee183882cbd6a2462559bc` and authorizes this bounded Phase 2,
its disposable write/migration tests, isolated production browser build, narrow
fetch and one local implementation commit. The supplied review is evidence,
preserved byte-for-byte at
`docs/reviews/2026-09-12-task-4-2-phase-1-independent-review.md`: 11,024 bytes,
SHA-256 `fc5f3d15e956f78dc84023127dfd4f48097750588bdcc03f073e53b8ca04a60a`.
Acceptance addenda preserve the original Phase 1 report/matrix text. No separate
acceptance commit is made.

The sole implementation parent is the accepted Phase 1 commit. The authorized
fetch confirmed `origin/main` at `d84aa4b916e41e15abf543fc7dd2d4155bea7acf`.
This is the recorded fetched checkpoint, not a claim of a second observation
at delivery. Exact commit identity, Git statistics and artifact hashes are in
the separate post-commit delivery receipt.

## Implemented behavior

The editor retains the complete multiline case number and subject. Editable
business fields are status/current status; independent type, category, degree,
venue, importance, destination, court and compatible branch selections; circuit,
circuit secretary, floor, hall, shelf and secretary room; two notes, evaluation,
legal opinion; start/end dates and asked/judged amounts. Client is selected only
at creation. Existing null and archived-client associations remain editable.
All other fields, including retained English, source/raw and fee-letter text,
survive saves unchanged. New rows have no invented import provenance.

Nullable, empty and omitted values remain distinct. Dates and decimal amounts
travel as strings, without floating-point conversion. There is no new financial
sign rule, status taxonomy or mandatory classification. The database-designated
active default type is used only when the create payload omits type. The editor
retains inactive historical selections; they cannot be chosen for new references.
Input limits are 100,000 UTF-16 units per text field, 500 rows per relationship
array and a 500,000-byte UTF-8 form envelope. Existing maximum field lengths were
measured and retained in `proof-10/existing-field-lengths.json`; unchanged values
are omitted from updates. An entirely blank new record is refused.

Parties retain explicit side, name, optional gender and order. Each capacity uses
its own lookup ID and gender-appropriate display label. Lawyers use numeric
person IDs, the three approved roles and explicit order; active firm staff do
not need login accounts to be assigned. Duplicate person/capacity identities,
foreign child IDs and multiple current leads are rejected. New selections cannot
refer to inactive/external people. No names are split, inferred or matched.
Client choices include their IDs so duplicate short/English names remain distinct.

Association removal retires its existing row. Re-selection through the gateway
can restore the same identity after validation; no save deletes/reinserts all
children. Current reads exclude retired relationships. The UI supplies labelled,
keyboard-operable add/reorder/remove controls, Save/Cancel and focused feedback.
Validation and stale-write errors retain the entered fields/arrays. Reload is
deliberate. An uncertain response freezes that payload and retries the same
submission identity. Successful and cancelled navigation retains matter-list
filters/pages and the existing client return context.

## Database, audit and concurrency boundary

`20260912120000_matter_editing_boundary` is the only new migration. The original
63 SQL files remain byte-identical. It adds a positive aggregate `row_version`,
three `is_retired` flags, a current-lead partial index and deferred capacity
ordering constraint. It captures all 7,674 original matter/party/capacity/lawyer
rows before enabling writes. The immutable original views preserve the historical
source partitions and released high-impact evidence; current checks separately
require complete continuous before/after history matching every current field
and retained relationship. Modified/native matters are not excluded from checking.

The runtime retains SELECT on the four business tables and has no raw DML or
sequence grants. Only `matter_edit_state` and `matter_edit_save` are callable
gateways. Fixed security-definer search paths, exact function bodies, grants,
triggers and audit classification are checked. Page, form-read service and Server
Action each enforce their own permission. The gateway revalidates the actual
account, role, enabled/password/session state, person eligibility and expiry.
The trusted human audit API supplies actor/request correlation.

A save locks the parent, checks its expected version, locks selected references
and validates all changes in one Serializable transaction with the existing
bounded retry helper. Deferred completion triggers reject an aggregate without
continuous correlated history. Audit failure rolls back parent, children,
history and receipt together. The same actor/submission/payload returns its
previous result; a changed payload under that identity is refused. No-op saves
do not increment versions, allocate children or append edit/audit receipts.
Matter archive/restore, client reparenting and downstream editing are absent.

## Verification and evidence

Evidence root:
`C:\Users\Khaled\.codex\visualizations\2026\09\12\01a094ba-eb44-7451-8524-b7749d95e213\task42-phase2`.
Paths below are relative to that root. The
[final matrix](../testing/task-4-2-phase2-acceptance-matrix.md) maps each requirement.
The external initial matrix was saved before application edits/tests/database
execution at `2026-09-12T08:30:41.7341663Z`, SHA-256
`d1e9beca0ad5dd2e6cd33142307e6f5c02276dce5df97959cb96009c2b67e634`.

- `proof-10`: complete historical upgrade and write proof; 125 invariants before
  and after native/imported edits, reordered/retired/restored associations,
  exact no-op/replay, observed concurrent edits and duplicate create, injected
  audit failure, archived-client save overlap, invalid references and runtime
  raw-write denials. Each refusal compares all table digests including audit.
- `canonical-3`: explicit empty canonical checkpoint 63, deliberately failed
  late migration with exact rollback, deployment to 64 and 107 invariants.
- `browser-2`: exact named catalog delta and unchanged full sequence states;
  125 invariants, 15 database setup checks, the permission matrix, all 1,744
  imported IDs/details/pages across four roles, normalization/literal-J and
  filter tests. Browser archive/navigation checks pass for all four roles and
  both the exact 82/378 matter sets. Form desktop/320/real-200%-zoom scans pass;
  its lost-response assertion needed correction, as recorded below.
- `browser-5`: final focused production editor/browser proof passes for both
  authorized roles, including lost-success-response replay, stale reload,
  retained arrays/fields, context returns, eight accessibility scans, 320 CSS
  pixels and genuine 200% zoom. Both read-only roles reject real forged matter
  actions and direct create/edit pages. The server records `AuthorizationError`
  with forbidden/403; Next.js transports that action error as HTTP 500. The
  owned mirror/listener is removed and all 35,003 dependency file records match.
- `supplemental-1`: exact create/update replay and decimal no-op, released-row
  edit, rejecting checker fixtures, real account-state denial, long/null/empty
  fields, inactive selections, actual foreign child IDs, direct-gateway bypass
  and observed current-account revocation. All 125 final historical invariants
  pass; owned cleanup and exact source preservation pass.
- `static-final.log`: complete required aggregate gate and checker self-tests;
  final focused checks cover subsequent test-harness-only corrections. The
  assertion sources, source inventories, logs, screenshots and cleanup receipts
  accompany the package.

The production build uses a separate task mirror and generated client, an owned
loopback port and a positively identified disposable PostgreSQL cluster. The
successful Phase 1 installed tooling paths used for the final affected run are
`C:\Users\Khaled\AppData\Local\npm-cache\_npx\e41f203b7505f1fb\node_modules\playwright\index.mjs`
and `C:\Users\Khaled\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe`.
The earlier browser-2 run used the existing user-level Playwright installation
with the same full Chromium. No package installation or global configuration
change was made. The form-labelling skill supported the labels/error treatment;
repository decisions retained precedence. No subagents or speech actions ran.

Read plans and browser document/action timings are local measurements. The
accepted list/detail layer remains three bounded business queries per snapshot,
without a per-row application query. Form state/save each use one aggregate
gateway call in their transaction. Full historical reconciliation deliberately
checks every original/current aggregate and takes several minutes on the local
fixture; it is not executed by a normal form save. No production latency or
Ubuntu readiness guarantee is claimed.

`measure-1/service-measurements.json` records successful create/edit form reads
at 12–20 ms (62,030–63,012 response bytes), native creation at 28 ms and a save
with one party, two capacities and three lawyers at 44 ms. Exact retries took
12–13 ms; the no-op took 16 ms. These are individual local disposable-copy
samples, including service/transaction work, not percentile or production
guarantees. The sample verifies the current boundary and exact source preservation
after cleanup. Browser timing entries are explicitly only completed observed
requests; interrupted/streamed responses are not presented as measured saves.

`reuse-map.json` identifies the unchanged dependencies and exact earlier artifact
hashes for logo durability, client/contact writes, staff/account behavior and
historical migration/report-query proof. Changed schema/checkpoint/audit surfaces
are covered by fresh 64 checks. Historical suites are not represented as new runs.

## Failed attempts and preservation

All numbered failed attempts remain visible. Migration attempts 1–3 diagnosed
the original capacity ordering index and qualified the version return; actual
failed migration ledger/state was captured before fixture cleanup. Attempts 5–7
corrected exact checkpoint dispatch, historical query rewriting and deferred
index checking. Attempt 8 fixed cached PostgreSQL lock-observation statistics;
attempt 9 fixed quoted table rewriting in historical reconciliation. Attempt 10
is the successful affected write rerun. Canonical attempts 1–2 corrected test SQL
replacement and fixture account readiness; attempt 3 passed. Browser attempt 1
added the four expected constraint-trigger catalog entries to the exact delta.

Browser attempt 2 reached the actual uncertain-response message, but an exact
text locator omitted its nested recovery instructions. The final harness uses
the alert container. Its cleanup check also detected one new Prisma/Jiti cache
file bearing the owned mirror's name. The identified file and mirror were
removed; the cache directory timestamp was restored from the pre-test receipt.
`browser-2-cache-recovery.json` records that scoped recovery. Existing dependency
files were not modified. Subsequent mirror processes set `JITI_FS_CACHE=false`.
Final full inventories verify restoration; the earlier attempt is not reported
as an unchanged-dependency success.

The full final comparison caught a locale/precision error in that directory's
first timestamp restoration: all 40,571 entries' file bytes and permissions
matched, but the directory date had been parsed through automatic JSON date
conversion. The failed complete capture/comparison is preserved as
`runtime-after-attempt-1.json` and `preservation-comparison-attempt-1.json`.
`cache-timestamp-correction.json` records restoration of the actual filesystem
timestamp with the original UTC ticks, using invariant round-trip parsing. The
entire runtime inventory was then captured again; no metadata difference was
normalized or excluded. An earlier unscoped capture's final Windows process
query was denied, and the same read-only inventory used scoped permission.

Browser attempts 3–4 completed both authorized workflows but their denial test
captured the login action while changing roles, overwriting the matter action.
The returned home redirect was not evidence about matter authorization. Capture
was restricted to `/matters/` actions; attempt 5 verifies the real action denial
and current business row count. Its subsequent account-state negative fixture
initially omitted the existing mandatory session-version increment. The fixture
was corrected to increment the version and then pass the actual new version to
the gateway, proving current disabled/forced/inactive state is independently
rejected. `supplemental-1` is the focused affected rerun. No account guard was
disabled or weakened to obtain that result.

Static attempts found ordinary type/format/inventory issues and rejected a helper
that constructed a database client outside the established test entrypoint.
Construction was moved into that entrypoint; the checker was not weakened.
Ordinary sandbox child-process/Git/Docker denials used the already authorized
scoped permission retry. No automatic-review rejection or safety override occurred.

Complete before/after receipts cover all real tables, full sequence states
(including `log_cnt`), catalog/roles/grants/functions/constraints/ledger/audit,
container configuration/identity and all 54 logo bytes. Protected inventories
cover backup/evidence packages, governance and environment file hashes/metadata/
permissions. Runtime inventories cover `.next`, installed dependencies and the
owner's separate artifact, with the pre-existing exclusively locked `runtime.log`
explicitly excluded. Its content was not verified or unlocked. The final
preservation comparison records exact equality and cleanup; no real migration,
write, database reset or owner-runtime operation is part of this implementation.

The final comparison passes for all 109 tables, 48 complete sequences, 54 logos,
3,428 protected entries and 40,571 runtime entries. JSON object key serialization
order can differ between captures; every decoded key and value is compared,
with no value normalization or newly excluded field. `cleanup-final.json`
confirms no task container, volume, network, mirror, cache or Git operation
remains, and the original owner listener/process is preserved.

## Delivery boundary

One local commit, subject `feat: add matter creation and editing`, includes Phase
1 acceptance and this implementation. The separate receipt records the exact
sole parent, full-index binary patch reverse check, changed-file statistics,
ZIP membership/hash verification and clean main two-ahead/zero-behind state.
Independent Phase 2 review is next. Owner acceptance, real migration, activation,
publication/deployment, matter archive/restore and subsequent tasks remain outside
this delivery.
