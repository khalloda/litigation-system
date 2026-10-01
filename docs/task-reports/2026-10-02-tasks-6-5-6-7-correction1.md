# Tasks 6.5–6.7 correction1 — local review candidate

T6567-R1 is corrected and verified. **T6567-N1 remains BLOCKED: intermittent
PDF delivery has no demonstrated cause or fix.** This is a correction-review
delivery, not acceptance or permission to activate. The reviewed chain through
`09465c4b65e76baf7d72d6c92c4493169fe62947` is preserved. Application correction
`6cfd0d94a5d179d1f846cf45e4fda79d20a20a5f` changes only the administrative
selection Reload link and adds its focused browser regression.

## Reload correction

The unchanged production candidate reproduced both hearing and step conflicts:
after another tab saved, accepting the offered Reload kept the stale draft and
version, and another Save failed again. The Next Link now uses a plain anchor,
matching the accepted selection editor. Deliberate discard performs a document
GET and initializes current values. Cancelling keeps the draft. Reload never
submits a Save. Other dirty rows remain intact during ordinary Save/refresh.

The final production fixture passed 18 focused cases: hearing/step selection
conflicts, cancelled and accepted discard, one-effect subsequent Save, another
dirty row, parent and record version changes, exact response-loss retry, and
all eight role/kind combinations. Hearing Reload was exercised by keyboard at
390 pixels; desktop step rendering, status focus and actual screenshots were
checked. Existing confirmation and native before-unload prompts remain intact.
No broad state-reset effect or version-based remount was introduced.

## PDF delivery disposition

One small diagnostic campaign used the unchanged application build, genuine
fixture sessions and three reports: accepted `client-branches` for client 245,
`document-movement-card` for document 393, and `client-poas` for client 10.
Two UI sequences each saved 12 exports: the retained browser launch settings,
then normal browser launch with passive task-only HTTP/socket diagnostics.
Six additional actual-app requests used fresh non-pooled connections. All
30 completed exports were saved, and each saved digest/length matches its audit.
There were42 report executions, including 12 previews. No automatic retry occurred.

The passive trace observed valid HTTP headers first for all 18 instrumented
exports: 12 on reused connections and 6 on fresh ones. Installed response-streaming
and application code were inspected. The earlier failed packet prefix was not
found in the compared saved files. These observations do **not** identify a
cause, establish a harness-only defect, or prove transport reliability.
No export-path, connection-policy, dependency or renderer change was made.

The original 206 completed exports remain 202 saved plus four completed-but-unsaved
PDFs: 1287, 1378, 1383 and 1744. Successful replacements and this round's successes
do not change that classification. The preserved best failure trace remains
the actual document-movement-card request on reused socket 1909: after valid
preview/XLSX responses, the browser received 4096 binary bytes where an HTTP
status/header block was expected. The missing boundary between application
response, Node/Next transport and browser receipt remains unknown.

The next bounded proposal is a separate diagnostic review round: reproduce that
exact route/navigation sequence with a task-only minimal Next response serving
one saved PDF, then the real renderer, with correlated server writes and browser
receipt on the same socket. Cap the comparison at 20 explicit exports and stop if
not reproduced. This separates framework delivery from rendering without a
dependency upgrade, global settings change, owner operation or blanket
connection-close workaround. No causal closure or waiver is requested here.

## Verification, preservation and limits

The full project check and production build passed on the correction application
source. Fresh pristine and final 148 + 15 database/setup gates passed with complete
read-only state equality. The unchanged candidate 78 SQL was applied only to the
new disposable full-state fixture. All migration 1–78 bytes, TASKS bytes and 86
checkbox lines, governing decisions, accepted UI/font and other report sources
are unchanged. The 17 new / 21 accepted report contracts, 480 permission assertions,
106 contract assertions, deep source comparisons, migration rollback/tamper and
broader output/accessibility evidence are reused with exact archive/member and
unchanged source/dependency bindings, not represented as rerun.

All 15 newly saved workbooks passed complete typed/visible cell, RTL, no-formula,
metadata and total checks. All 15 PDFs were parsed/rasterized and checked for
orientation, Noto font and card page count. Seven relevant pages were visually
inspected. The new fixture initially lacks the old synthetic test rows; the
baseline comparisons explicitly account for that. Fresh-connection branch
output includes the newly created R1 test matter, so that one comparison does
not claim identical fixture population to the earlier UI sequence. Document
and POA inputs/populations are unchanged. This is bounded visual coverage, not
every-page or universal accessibility certification. PDF copying remains an
accepted limitation, NOT FIXED; search remains uncertified.

Final fixture accounting reconciles 129 added audits,10 native test mutations,
33 selection requests with 19 changed receipts/history rows,30saved exports and
zero new completed-but-unsaved exports.137 tables stayed byte-exact; original
rows in 11 changed business/history relations were separately proved exact.
All original audits and old selection scopes remain intact. Failed helper
attempts were preserved and their outcomes established before scoped retries.
They concerned missing fixture environment/input fields, framework-only imports,
shell quoting and protected-file access; none is relabeled as a passing test.

The owner remains on migration 77. The dated final snapshot at
`2026-10-01T23:01:17.177Z` (02:01 Cairo, 2 October) exactly matches this round's
baseline: 152 tables, 48 sequences, 1,134 audits, all catalogs/ledger/accounts/data.
The owner explicitly confirmed in this chat that archiving hearing 11003 around
15:50 Cairo on 1 October was his action. That archived state is preserved; the
previous personal-attribution question is resolved. No new concurrent change
was observed in this correction window; observations do not certify later activity.

The test app and exact-owned database container/volume/network were removed
after reconciliation. Protected recovery, original evidence and saved outputs
remain local. The five-file receipt records final cleanup, dated owner/runtime
and Git/remote observations and receipt-inclusive package verification.

Evidence root: `test-results/task65-67-correction1-20261001T221632Z`.
Key records: `r1-before/result.json`, `r1-after2/result.json`, `final-accounting.json`,
`output-inspection.json`, `transport-analysis.json`, `owner-confirmation.json`,
`owner-final-proof.json`, and the final correction manifest/receipt.

**NOT PUSHED. Stop for independent Tasks 6.5–6.7 correction1 review, with N1
explicitly blocked. No owner migration/provisioning, repair/seeding, Access
synchronization, candidate activation/restart, acceptance closure or later task.**
