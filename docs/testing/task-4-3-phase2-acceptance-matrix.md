# Task 4.3 Phase 2 acceptance matrix

13 September 2026. Local implementation proof; independent review and owner acceptance pending.
See the [report](../task-reports/2026-09-13-task-4-3-phase-2-hearing-editing.md).

| Contract | Evidence and outcome |
|---|---|
| Phase 1 acceptance and D60 | Exact review bytes; append-only report/matrix/decision prefixes; existing checkbox states preserved. |
| Migration 66 isolation | Separate pinned PostgreSQL cluster/volume/network; full source-copy comparison before fixture initialization; named catalog delta and all original projections/sequences exact. |
| Forward/rollback | Exact 65 prestate; late-66 failure rolls back full state; old 61–65 dispatch retained. |
| Canonical replay | Final result recorded in `canonical-result.json`; no historical source population invented. |
| Current/original invariants | 129 checks before/after mutation; existing 125-check checkpoint-65 profile preserved. |
| Authorization | 74 exact route/action entries; page/action/service/current database authority; four roles; direct runtime writes refused. |
| Allowed scalar fields | Native/unassigned creation, ordinary edits, explicit clearing, calendar dates and unchanged mixed newlines. Parent/deferred/provenance fields retained. |
| Parent eligibility | Archive blocks create/edit; restore restores eligibility; archived client alone permits an unarchived matter's hearing. |
| D41 | Exact twelve rows × three fields × change/clear; service, gateway and row guard reject; full state exact; allowed decision edits succeed. |
| Attendee history | Imported duplicates and inactive memberships retained; removal retires; restoration reuses IDs; current order separate from imported ordinal. |
| Attendee selection | Empty/all/new selections; active staff without login accepted; inactive/external/forged/cross-hearing/duplicate inputs refused. |
| No-op/retry | Full table/sequence/catalog equality for no-op and exact retry; altered/other-owner token reuse refused; selection round trips preserve IDs/order. |
| Atomicity | Late attendee audit failure rolls back the complete aggregate; version/history/receipt/audit remain coherent. |
| Concurrency | Observed lock overlaps for competing edit, account/session revocation, staff deactivation and parent archive. |
| Current hearing reads | 13,385 IDs after three native fixtures; all four roles, 2,144 pages, independent SQL ordering oracle. Imported 13,382, four unassigned and 327 released targets remain distinct. |
| Browser | Two editors; two denied roles; unauthenticated protection; validation/value/focus recovery; stale reload and exact lost-response retry; inactive/D41 controls; 320px, keyboard and true 200% zoom; axe; local fonts and screenshots. Final run receipt is authoritative. |
| Query plans | Fresh current-attendance detail/filter plans; original Phase 1 search/archived visibility measurements reused by source/artifact identity. No production latency guarantee. |
| Static checks | Required type/lint/format/RTL/authorization/audit/user/staff/client/ignore/encoding checks plus focused hearing closure. |
| Implementation preservation | Actual 63 before/after strict source/catalog/48 complete sequences/54 logos; protected files and earlier package bytes; comparison closes before activation. |
| Cleanup | Exact owned test database/container/volume/network, temporary accounts and browser mirror/listener removed; accepted owner app excluded from cleanup. |
| Separate activation | PASS: protected backup and exact restore/64–65 rehearsal; actual 65 passed 125 invariants/15 setup checks. Frozen accepted app 9b09f0d runs on loopback. Seven authentication audit rows accounted for; credentials match protected backup. Actual authenticated views unobserved. No migration 66 or Phase 2 app activation. |
| Delivery | One local commit, exact parent, clean measured Git state; reverse-checkable binary full-index patch; sanitized ZIP reopened against every manifest path/size/hash. |

The final delivery receipt maps each outcome to actual run/source manifests. Failed attempts
are retained and identified; an intermediate failure is not presented as a final pass.
Unchanged earlier Phase 1 artifacts are reused without rewriting their historical claims.
Screen-reader speech and owner-authenticated actual-app views are not inferred from fixture
or anonymous browser success. Publication, Ubuntu deployment and Phase 2 activation remain separate.
