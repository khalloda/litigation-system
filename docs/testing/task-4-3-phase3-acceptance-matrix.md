# Task 4.3 Phase 3 acceptance matrix

13 September 2026. Implementation evidence; independent review and owner acceptance
are pending. Parent checkpoint5f0552f accepted; actual66/accepted Phase2 app preserved.

The original timestamped plan is `initial-matrix.md` in external task43-phase3
evidence. Rows below identify observed evidence; PASS refers to the stated control,
not to every step of a partially failed historical attempt.

| Contract / boundary | Proof and result | Evidence family |
| --- | --- | --- |
| Owner authority, acceptance, N2, D61 | PASS: exact activation review copied; six punctuation corrections only before appended acceptance; old decision/database/migration/matrix prefixes preserved; all86 TASKS checkboxes unchanged. | n2-substitutions.json, document-preservation.json, final documentation check |
| Exact isolated target | PASS: own cluster/container, loopback port, labelled volume/network, task credentials; source cluster checked; only disposable full-volume targets migrated. | isolation.json per run; wrapper source and cleanup receipts |
| Coherent full-volume migration66→67 | PASS:118 prior tables/account content privately equal on snapshot restore,13,382 hearings,48 portable sequence states; declared67 delta and rollback exact. | browser4 and retention1 restore-equivalence/rollback/migration-delta |
| Canonical replay | PASS:113 checks and15 setup checks; only non-KHelmy actors prepared. | canonical3 |
| Continuous prior and new invariants | PASS:131 initial/final historical checks, including old129; tamper negatives reject missing/altered state. | browser4, retention1; full3-browser and supplement2-browser negatives |
| Administrator only; fresh session/account/actor | PASS: server/service/gateway checks and four-role reads; positive-control alternate Administrator then disabled, forced change, demoted, revoked, expired or foreign receipt refusal. | full3-browser first controls; supplement2-browser |
| Recoverable archive; existing/new default false | PASS: migration preserves old rows/versions with false; native hearing begins false; archive/read-only/restore exact. | migration67 and broad lifecycle results |
| Parent and client independence | PASS: archived matter blocks new edit/archive/restore including Administrator; NULL matter works; archived client does not block; parent locks observed. | broad and adversarial supplements |
| Operational versus historical visibility | PASS: current default, archived/all filters; all-record counts/report source outputs exact; historical link uses archive=all; four-role detail reads remain. | full3-browser, browser4, source inventory |
| D41 and all retained fields | PASS: all twelve protected IDs; original hearing/attendee fields exact after transitions. | full3-browser |
| Inactive/duplicate/retired/mixed ordering | PASS: positively selected imported3/92; row73 retained retired with original ordinal, other imported current rows plus new current-order membership; unrelated tables exact. | retention1 |
| Missing historical references | PASS for real hearing8932 NULL matter/court/action context. Zero missing-person attendee rows exist in the copy; that nonexistent case is not claimed tested. | retention1 |
| Archived edits/attendance refused | PASS: stale editor, current archived edit and direct hearing/attendance writes refused; restore preserves retired state. | broad/adversarial/browser4 |
| No-op/retry and audit consistency | PASS: full row/history/audit/submission/catalog/complete-sequence comparisons; same state no-op, owned retry, retry after opposite transition, altered payload/action/actor refusal. | broad proof; Phase2 edit retry supplement |
| Races and transaction failure | PASS: competing submissions and edit/archive have one winner; parent archive lock overlaps edit/archive/restore with safe refusal; audit/history/receipt faults fully roll back. | broad/adversarial |
| Confirmation facts | PASS: identity/version/count tampering refused; actual attendee count change invalidates earlier confirmation; browser stale error requires reload. | broad and browser4 |
| Phase2 edit regression | PASS: real edit, attendee selection round-trip exact no-op, retained retirement and mixed-order no-op on eligible unarchived hearings. | broad and retention1 |
| Reporting preservation | PASS: six existing Gate4 datasets compared across transitions with nonempty source results; historical count unchanged, operational current total changes correctly. Future Task6 UI is absent and untested. | broad proof, source reuse map |
| Browser/accessibility | PASS: four roles; actual archive/restore, read-only detail, filters, return context, cancel/Escape/focus, stale/fault feedback; six zero-violation scans;320px and native200% zoom inspected. Speech excluded. | browser4 results, screenshots, zoom capture |
| Build and source identity | PASS: isolated production build/Prisma generation, own generated/build outputs; final product/migration matches browser4; later retention test executed separately. | production-build-identity, executed-source manifests, source-reuse map |
| Mandatory static/permission gates | PASS: type/lint/format, RTL/self-test, auth78 entries, audit/self-test, user-management/self-test, staff/client/hearing guards, Git exclusions, encoding,448 permission checks. | static1/static2 and final-static; audit self-test receipt |
| Actual66 read-only checks | PASS: frozen accepted checker; exact cluster,66 completed and0 unfinished; retained rolled-back ledger entry distinguished. No new wrapper deployed to actual. | actual-focused66.json |
| Password/session/configuration/data preservation | PASS: zero changed actual tables; exact catalog, ledger, roles and54 logos; private password/session/role-credential equality; KHelmy unchanged; accepted runtime PID/build/HTTP200 preserved. | actual-preservation.json, runtime before/after |
| Prior evidence/backups/dependencies | PASS within declared scope:1,162 recorded files fresh hash/size/mtime,289 older backup metadata,35,005 shared dependency metadata. Broader earlier hashes reused; no full ACL claim. | protected-preservation.json, browser-cleanup.json |
| Cleanup | PASS: exact owned fixture containers/volumes/networks and browser mirrors/listeners removed, pre-existing Docker resources unchanged. No dump file created. | canonical3/browser4/retention1 cleanup, attempt records |
| Delivery boundary | One local implementation commit, exact binary-safe patch/reverse check, payload manifest and reopened verified ZIP, separate receipt. No fetch/push/actual migration/restart/deployment/Task4.4. | final Git/package receipts |

## Evidence interpretation

`full3-browser` supplies successful broad database controls before a later fixture
failure; its old OR-selection label overstates category specificity. The final
source label is corrected and `retention1` supplies explicit positive categories.
`supplement2-browser` supplies successful strengthened database controls before a
cookie setup failure. `browser3` loading/route-announcer captures are not final
archived-detail proof. `browser4` supplies the complete successful production
browser and post-browser invariant run. `canonical3` supplies corrected canonical
readiness. Meaningful original failed attempts remain preserved.

Unchanged accepted auth and unrelated functional proofs are reused through exact
source identity; KHelmy-mutating old permission fixtures are explicitly not run.
New non-owner authorization controls and mandatory static checks are fresh. Browser
fixture sessions do not constitute an actual owner password/login test. Current
password/session values are instead privately compared for preservation.

The [implementation report](../task-reports/2026-09-13-task-4-3-phase-3-hearing-archive-restore.md)
explains behavior, evidence limits and practical consequences. D59 is unchanged
accepted risk. OverallTask4.3 remains unchecked pending independent review and the
owner's acceptance; no approval is inferred from this matrix.


## Owner acceptance and activation gates — 14 September 2026

Khaled Helmy accepted e582605 after independent PASS and authorized final overall
Task 4.3 closure after successful local activation. Initial operational gates were
saved before execution in the external activation evidence; this is their outcome.

| Gate | Fresh result or explicit reuse |
| --- | --- |
| Accepted source/runtime | Exact e582605; 496 source inputs, all 67 migrations; build `6STn5JeaidE5AnbLqEJc8` |
| Actual66 preflight | Forced-read-only 129 invariants; exact target and recovered account verified |
| Recovery package | 58 payload members + manifest; 54 logos; exact new dump restored; restricted ACLs |
| Restored66 | All 118 tables/current accounts/history, effective grants/roles, 48 logical sequence states exact; 129+15 checks |
| Restore differences | 45 log_cnt resets individually recorded; two owner-only ACL representations differ with identical effective grants |
| Rehearsed67 | One accepted67 deployment; exact full catalog/projection delta and fresh boundary; 131+15 checks |
| Actual67 | One deployment; 119 tables/48 full sequence states; original data, history, private credentials/session state and logos preserved; 131+15 checks |
| App/smoke | Accepted e582605 build running on loopback; Arabic/RTL login, fonts/assets, streamed auth redirects and logo denial pass |
| Browser observation | The initial browser had no authenticated session. After maintenance ended, the owner logged in and explicitly offered the session. Fresh actual observations passed: current/all lists 13,382, archived list zero; hearing11752 detail, eligible edit/archive controls, identity/date/context and attendee counts in archive confirmation, archive cancel, edit screen and edit cancel. No mutation was submitted; an actual restore confirmation was not observed because the archived list was empty. Prior isolated mutation/restore/accessibility evidence remains separate. |
| Functional reuse | Exact reviewed product/migrations/dependencies: 113 canonical+15, rollback/race/retention/role proof, browser4 and six axe scans |
| Limits retained | No positive missing-person attendee case; six report datasets compared with at least one nonempty, not all six proved nonempty; no speech test |
| Cleanup | Only identified rehearsal container/volume/network and temporary credentials removed; accepted app, old app artifact and prior evidence/backups retained |
| Documentation | Nine Markdown files, four original prefixes preserved, supplied review exact, only overall4.3 checkbox changed among86 |

Functional cases were not rerun wholesale for activation. Fresh operational proof
is distinct from prior isolated authenticated proof and from owner activity after
availability resumed. All phases and overall Task 4.3 are complete locally; the
next gate is independent activation/documentation review. See the
[activation report](../task-reports/2026-09-14-task-4-3-phase-3-development-activation.md).
