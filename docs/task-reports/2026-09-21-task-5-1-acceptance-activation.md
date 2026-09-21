# Task 5.1 — acceptance and activation

The owner accepted the independently reviewed Today's hearings implementation
`d55df30225f60df8e583777fb5501fb3326057b0` (parent `c96bd7229b005b0c7472b1ad64d1d5c4eb48726d`,
tree `0e34d71bc105141cfdaaf75a451e395b8485b3c6`) and explicitly authorized this
bounded Windows operational phase and normal publication. The full accepted
feature scope is unchanged. No Task 5.2 work or Task 4.9 export/provisioning
operation was performed. The independent implementation review is imported
[verbatim](../reviews/2026-09-21-task-5-1-independent-implementation-review.md).

## Authority and exact inputs

The external adopted prompt equals its packaged counterpart. The handoff archive
is 38,701,241 bytes, SHA-256
`980cae1d3db431db3ec6885e605f8cc10182dc3d01aa4f456a8e94c70f245a3d`;
all 20 members passed safe-path, exact membership, CRC, size and SHA-256 checks
before extraction. Its inspected verifier and the original receipt-inclusive
implementation verifier both passed. The reused original implementation ZIP is
38,072,391 bytes, SHA-256
`2f64c94aaa46db6258d16d59b5b84a87aeb992f1c7f25c876a8eddaefdbfa7bd`.
All five original companion identities are bound in the operational manifest.

Current authorities were reused only after all 836 candidate tracked identities
were freshly verified. The complete candidate report and all prior Task 4.8/4.9
records remain exact. The initial branch was clean main, one ahead/zero behind
the freshly observed existing origin/main at c96bd722. Evidence and helpers are
in ignored `D:\Projects\litigation-system\test-results\task51-acceptance-20260921`; private bodies are in
`C:\Users\Khaled\.codex\visualizations\2026\09\21\01a0c33c-6cb1-7752-a6f4-0d4ffea37895\task51-acceptance-private`. No subagent, new dependency, service or purchase was used.

## Recovery and unchanged database

**Migration: not applicable — 73 unchanged. No provisioning.** All 74 ledger rows
(including the historical rollback), all migration checksums, 141 complete table
row/column vectors, 48 full sequence definitions/states, catalogs, ownership,
grants/default privileges, routines/triggers/constraints/indexes, roles/settings,
accounts/credential-derived identities, audit/counters/capabilities/receipts,
billing and lookups were compared. Owner comparisons use exact equality with no
restore normalization. Existing audit rows remain 885.

Fresh recovery: `D:/Projects/LitigationData/DB-Backup/migration63/pre-task51-activation-20260921T114102Z-f9add0c3`. The consistent read-only
dump is 22,576,381 bytes, SHA-256
`706441a1357cce88d6e6a746089160eae0d7a0b45dccb73c0b64e08c7ae381a6`.
It includes role recovery SQL, protected configuration/launch material, complete
state vectors and all 54 registered logos with a complete member manifest. Every
new recovery/private member's effective ACL was checked against owner, SYSTEM
and local Administrators. Prior root ACL checks do not claim every historical
descendant ACL. This is an accepted local development backup exception: it does
not protect against loss of the laptop/disk or satisfy future production backup
obligations. No NAS/cloud destination was used.

The exact dump was restored to separate PostgreSQL 17.11 cluster
`7687954019201450022`, task-owned container
`litigation-task40a-8a958907-aa86-419c-aee9-c12948fa83ca`, loopback port 48088,
with distinct owned storage/network and fixture credentials. The owner remains
cluster `7676117521894273062`, container `litigation-db`, port 5433. Pristine
restore equality passed before any fixture authentication/setup. Enumerated
physical restore difference counts: `{"columns": 88, "constraints": 1, "namespaces": 2, "relations": 150, "restore-WAL-log_cnt": 45, "roles": 2}`.
These cover only proven WAL `log_cnt`, dropped physical column slots, equivalent
NULL/default ACL representation, generated fixture role credentials and the
exact pre-existing constraint deparser equivalence. The initially redundant
fixture CONNECT grant was removed to match the owner ACL exactly.

The read-only historical-live provenance gate also passed, including the already
approved migration 0033 checksum for canonical bytes plus one terminal LF. No
checksum was repaired, migration rerun or ledger row changed. Full owner state
matched recovery before and after backup, immediately before activation, after
the old app stopped, and after the actual browser/database gates. The existing
legitimate owner browser session was reused: **zero authentication bookkeeping
delta and zero business/data delta**. No owner password, account, role, session
version, capability, export or export receipt changed.

## Stable build, activation and fresh observations

Stable artifact: `D:/Projects/LitigationData/accepted-task51-d55df302-20260921T114102Z-f9add0c3`. Exact accepted Git
export: 834 shareable bodies plus identities for the unchanged two D59 bodies.
Locked dependencies were physically copied from the retained candidate build;
no install/upgrade or borrowed-tree cache write was requested. All generated
Prisma, dependency and build files are inventoried; six Next.js junctions point
inside this stable owned dependency tree. Fresh build and full `npm run check`
passed, using only the isolated environment. Node 22.23.2,
ICU 78.2, timezone data 2026a. Build ID:
`0hYFhlJjQ4s-qbt8wD5LY`. Post-smoke/final comparisons require every pre-existing
source, generated, compiled and dependency byte exact; additive owned WebP image
cache files are separately identified, hashed and retained, not called unchanged.

Old accepted app PID 58056/build `lrLMgtVrMuIaje6eDCMFe` was positively identified
by creation time, parent, command and sole loopback listener. It was stopped once.
The immediate listener check raced release; a separate observation established
PID/listener absence before continuing. The new app started at
2026-09-21T12:15:39.161Z as PID 54168, **127.0.0.1:3000**, build
`0hYFhlJjQ4s-qbt8wD5LY`. The owner database stayed running/healthy. The launcher
uses unchanged existing restricted `litigation_runtime` credentials and
AUTH_SECRET, accepted `D:/Projects/LitigationData/client-logos`, the existing
Chromium PDF path and real clock. No privileged migration URL/password, fixture
clock hook or broadened listener is passed. Original artifact/launchers remain.

Fresh isolated production browser smoke used genuine logins for all four roles,
real current Cairo date, SQL-exact 29 total/25 preview (27 clearly marked fixture
hearings plus two restored real matches), dated list/detail/back, matter/client
links, role navigation, refresh and anonymous denial. It performed **two**
zero-violation axe scans (1280/390 widths) and **eight** focus observations, with
no page errors/external requests and full 141-table/48-sequence read-window
equality after separating authentication/setup writes.

Fresh actual owner observation through the supported browser interface showed
Cairo date 2026-09-21, total/preview **2/2**, IDs **1707, 12780** in SQL order,
correct next-date filter link, genuine hearing 1707/detail/back/list, matter 3311
(case 932/2025), keyboard Refresh and home navigation. Arabic Noto Naskh font
loaded, RTL/reflow and two visible focus observations passed; browser console
errors/warnings were empty. No actual-owner axe scan is claimed. The viewport
screenshot was inspected; the full IAB screenshot has a stitched duplicate bottom
region and is retained privately, not used as membership/layout ground truth.

Fresh pristine isolated and actual owner database gates each passed **148
historical + 15 setup checks**. Detailed unchanged implementation proof is
reused by original archive/source/helper identities: **480 permission decisions**,
12 date cases × four host zones, exact 0/1/25/26/84 and mixed populations,
DST/midnight/fault/denial/volume checks, **seven axe scans and 16 focus checks**.
These are earlier implementation executions, not fresh operational counts. OS
screen-reader speech and a timed loading announcement remain outside proof.

## Preservation and cleanup

All 250,562 pre-existing protected file records were
reconciled, with exact static content/size/mtime, 37 junction
targets and 106 named root/configuration ACL records.
Append-only log growth count: 1; every old prefix
remains exact. Concurrent additions count: 0,
fully enumerated in the comparison. No earlier evidence, recovery, credentials,
logo bytes, accepted artifact or dependency tree was intentionally altered.

The exact task-owned isolated container/network/volume and test app PID 83568
were removed/stopped with recorded outcomes. The live accepted app/artifact,
owned dependencies, recovery, private proofs, owner browser session and all prior
evidence are retained. No broad Docker teardown or owner database stop/reset
was performed. Private raw database/catalog captures, dump, role/configuration
material and auth state are withheld from the review ZIP; public identities and
comparison methods/results are delivered. These are supplied-evidence limits,
not independent reviewer access to private state. D59 remains unchanged.

## Timeline and retained failures

All timestamps below are UTC; exit codes describe command outcomes, not inferred
process termination codes. Full helpers, logs, bindings and failed attempts are
delivered separately.

| Operation | Started | Finished | Exit |
| --- | --- | --- | --- |
| verify-handoff | 2026-09-21T11:39:16.249697+00:00 | 2026-09-21T11:39:17.462470+00:00 | 0 |
| verify-implementation | 2026-09-21T11:39:37.461294+00:00 | 2026-09-21T11:39:48.342214+00:00 | 0 |
| owner-before | 2026-09-21T11:43:34.247405+00:00 | 2026-09-21T11:44:00.672050+00:00 | 0 |
| recovery | 2026-09-21T11:45:48.717997+00:00 | 2026-09-21T11:46:13.939546+00:00 | 0 |
| restore-equality-02 | 2026-09-21T11:51:50.061048+00:00 | 2026-09-21T11:51:50.995391+00:00 | 0 |
| pristine-gates | 2026-09-21T11:52:05.939383+00:00 | 2026-09-21T11:55:29.425924+00:00 | 0 |
| stable-build | 2026-09-21T11:51:51.615809+00:00 | 2026-09-21T11:53:47.326757+00:00 | 0 |
| stable-check | 2026-09-21T11:53:47.645334+00:00 | 2026-09-21T11:58:58.336376+00:00 | 0 |
| fixture-browser | 2026-09-21T12:01:02.190990+00:00 | 2026-09-21T12:02:10.362757+00:00 | 0 |
| activation-ready-03 | 2026-09-21T12:13:30.401750+00:00 | 2026-09-21T12:13:31.180792+00:00 | 0 |
| owner-app-stop | 2026-09-21T12:14:13.918475+00:00 | 2026-09-21T12:14:18.516480+00:00 | 1 |
| owner-app-stop-outcome | 2026-09-21T12:15:11.544487+00:00 | 2026-09-21T12:15:13.821679+00:00 | 0 |
| owner-quiescent-equality | 2026-09-21T12:15:26.724462+00:00 | 2026-09-21T12:15:26.920289+00:00 | 0 |
| owner-app-start | 2026-09-21T12:15:27.016657+00:00 | 2026-09-21T12:15:41.849335+00:00 | 0 |
| actual-anonymous | 2026-09-21T12:16:08.714725+00:00 | 2026-09-21T12:16:08.967418+00:00 | 0 |
| owner-oracle-active | 2026-09-21T12:16:12.230497+00:00 | 2026-09-21T12:16:12.726593+00:00 | 0 |
| verify-owner-browser | 2026-09-21T12:21:18.734272+00:00 | 2026-09-21T12:21:19.099509+00:00 | 0 |
| owner-gates | 2026-09-21T12:18:06.571997+00:00 | 2026-09-21T12:22:15.912171+00:00 | 0 |
| owner-final-equality | 2026-09-21T12:24:55.014728+00:00 | 2026-09-21T12:24:56.878688+00:00 | 0 |
| resources | 2026-09-21T12:22:28.333270+00:00 | 2026-09-21T12:22:38.012328+00:00 | 0 |
| files-final-comparison | 2026-09-21T12:27:56.786437+00:00 | 2026-09-21T12:27:59.617334+00:00 | 0 |

Task-owned failures retained in `failures.md`: Windows exact-root path formatting;
redundant fixture ACL; Date/JSON representation before setup; generated internal
junction inventory; additive image cache; already-approved historical migration
0033 terminal-newline provenance; transient post-stop listener observation; one
incorrect browser wait label; restricted screenshot write followed by scoped
private retention. None was solved by editing accepted product code, weakening
a database/source boundary or changing platform/global access controls.

## Documentation, publication and review boundary

This report is one of exactly five authorized documentation changes. README
history and the complete candidate matrix prefix remain exact; only Task 5.1's
checkbox changes, preserving the other 85; the PASS review is verbatim. All 833
other candidate tracked identities remain unchanged, yielding 838 final tracked
identities. The candidate implementation report remains untouched.

The owner has authorized one documentation-only child of d55df302 and the normal
non-force push of c96bd722 → d55df302 → that child to the existing origin/main.
At this document's commit boundary publication is **planned and authorized**; the
actual child SHA/tree, push result, fresh remote/tracking/local equality and
clean 0-ahead/0-behind state are recorded in immutable external operational
evidence and the receipt. This commit does not claim its own future hash.

The five-file delivery includes complete shareable candidate/final source, raw
Git identities, exact forward/reverse patch reconstruction, source/checkbox/
prefix/import proofs, fresh and reused evidence bindings, failed helpers/logs,
recovery/runtime/preservation/cleanup and publication observations. Its standalone
verifier has missing/corrupt/extra/wrong-bound rejection tests. ZIP/manifest/
verifier are sealed first, then a fresh external receipt, then receipt-inclusive
verification. Any failed seal remains separate. Independent operational review
is still required. **Stop here; do not start Task 5.2.**
