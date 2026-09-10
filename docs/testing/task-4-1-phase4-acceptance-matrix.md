# Task 4.1 Phase 4 — acceptance matrix

Initial plan recorded on 10 September 2026, before any test, database check,
fixture creation, application execution or build in this task. The immutable
external copy has its actual capture timestamp and SHA-256 in
`evidence/initial-matrix-identity.json`; later results never replace that copy.

Authority: Khaled Helmy's 10 September Phase 4 execution request; D39 and
D52–D57 in [DECISIONS](../DECISIONS.md); [TASKS](../../TASKS.md);
[permissions](../PERMISSIONS.md), [data model](../DATA-MODEL.md),
[glossary](../GLOSSARY.md), [visual direction](../VISUAL-DIRECTION.md) and
[reports](../REPORTS.md). The attached handoff and reviews are evidence, not
additional execution instructions. Overall Task 4.1 acceptance remains pending.

Starting and once-fetched checkpoint:
`9f61ba481fbebdb2b0d54e470e43cd8d26014265`. Its implementation parent is
`77baf2af2d079457f28ce1632f68e3f411cbdc48`. No subagents, publication,
deployment, governance edit or future feature is included.

All output paths below are relative to the external task directory
`C:\Users\Khaled\.codex\visualizations\2026\09\10\01a08aa1-176c-76b3-93da-434785d3af92\task41-phase4-review`.
Fresh commands, actual log timestamps, observed exit codes and tested source
hashes are indexed in `evidence/execution-index.json`. Separate command receipts
record invocation/completion times where captured. The immutable initial matrix
retains its original planned states; this version records observed results.

## Dependency and reuse rule

The Phase 3 implementation patch and ZIP must match the handoff:
185,267 bytes / `5a94fe4b3f882f5a57bc217acc4ea708dac0650a7a30b316e9888ba24ec5e3e4`
and 2,757,452 bytes / `d1d452cdae92d07bf495589aac2a4a56caad7ba07167b04d620d51c62da129fd`.
Its manifest is 22,771 bytes /
`2a80bac55bb7383b40cab268ea82d4e48e9e75bbb244bdadf4f74d4fe9802223`.
Verify exact cited members and compare Git blob/file hashes for application,
test/helper, fixture, permission/audit, schema/SQL, lockfile and configuration
dependencies against the accepted implementation. Record these in
`evidence/reused-evidence.json`. A changed dependency invalidates its affected
claim; documentation alone does not require repeating an application suite.
Fresh preservation and the nonempty archive visibility proof cannot be reused.

## Requirements, proofs and final results

| ID / requirement and authority | Acceptance criterion / expected result | Exact implementation and proof path | Fixture, data and role scope | Fresh proof or reuse; supporting dependency identity | Output location | Current status |
| --- | --- | --- | --- | --- | --- | --- |
| G1 — checkpoint and exclusive work; owner request | Clean main, origin/main, exact two parents; one narrow fetch leaves 0/0; no other active checkout task or Git operation | Native Git checks and Codex task inventory | Current checkout; no data execution | Fresh local inspection and fetch; expected `9f61ba4` above | `evidence/git-preflight.json` | Passed; exact fetched checkpoint retained, blocked pre-operation attempt separately recorded |
| P1 — project baseline; owner request / D57 | PostgreSQL 17.11, migration 62; 62 applied, zero pending/unfinished, one historical rollback; 15 setup and 116 historical checks | Existing verify SQL and `scripts/check-db.ts`, forced read-only; Phase 3 complete preservation helper | Actual project read-only only | Fresh before and after; known complete receipt SHA-256 `05a164f773ee7f9ade66b7db9886f110f8c50e11fb655cb6f28ad9ac3a0b89d6` | `evidence/before-verify.log`, `before-db-check.log`, `after-verify.log`, `after-db-check.log`, `after-command.json` | Passed fresh before/after: PostgreSQL 17.11, current 62, 15/15 and 116/116 |
| P2 — exact preservation; owner request | Equal contents of 107 tables, 48 complete sequences including is_called/attributes, catalogs/functions/constraints, roles/grants, migrations/accounts/audit, service/configuration and all 54 logos | Existing `preservation.ts` with `staffReadOnlyState`; compare full deterministic receipts | Actual project read-only; no source writes | Fresh before/after; verify migration 60–62 handoff hashes | `evidence/before.json`, `after.json`, `preservation-comparison.json`, `migration-hashes.json` | Passed: byte-identical 40,324-byte receipts and exact required SHA-256 |
| P3 — files and recovery; owner request | Exact protected environment/governance, recovery, prior artifacts, original logos and existing .next inventories/permissions preserved | File size/hash/time/ACL inventory and comparison; no application build in source checkout | Original files; ordinary ignored TypeScript incremental cache excluded explicitly | Fresh before/after; historical inventories locate protected roots without redefining them | `evidence/protected-files-before.json`, `protected-files-after.json`, `file-preservation.json` | Passed: 2,077 files and root inventories, contents/times/permissions unchanged |
| I1 — fixture isolation; owner exception / D57 | New uniquely owned cluster, loopback port, distinct source/fixture IDs, full restored table equality before actors; runtime-only mirror secrets | `scripts/lib/isolated-postgres-fixture.ts`, `assertIsolatedTestCluster`, current-62 source assertion | Task-owned full-state copies only; 318 clients, 188 contacts, 1744 matters, 13382 hearings | Fresh creation/source receipts; reviewed fixture dependencies pinned | `evidence/visibility-pass/isolation.json`, `read/read-isolation.json`, `browser-final/browser-fixture.json`, `browser-final/application-isolation.json`, fixture logs | Passed: distinct owned clusters; 107 restored table contents equal before actors; runtime-only mirror credentials |
| V1 — nonempty report visibility; D52 / TASKS Phase 4 | Exact ordered report rows/values unchanged before, archived, restored; real legacy client 3 resolves uniquely and baseline is nonempty; fixed parameters/fields/population unchanged | New `scripts/test-client-archive-visibility.ts`; real `mutateClient` and existing `scripts/lib/gate4-database.ts` report loader / `gate4-report-contract.ts` | Copied imported client selected by stored legacy association; Administrator mutation, explicit fixture read-only report connection | Mandatory fresh; no disconnected SQL imitation; minimal loader exposure only if necessary | `evidence/archive-visibility-pass.log`, `visibility-pass/results.json`, `browser-final/browser-evidence.json` | Passed fresh: legacy 3 uniquely resolves to client 12, 82 matters; six exact ordered report datasets preserved in all three states |
| V2 — largest client and relationships; D52 / D55 | Unique maximum has 378 matters; exact matter identities/full values and related contacts/main contact/logos/billing remain; only legitimate client metadata/audit change | Same new visibility runner; approved mutation service; current client read/count paths and ordered relationship snapshots | Full-state fixture; legacy client 3 plus largest client independently | Mandatory fresh; freeze report parameter at 3, never retarget it to maximum client | `evidence/visibility-pass/results.json`, `browser-final/browser-evidence.json` | Passed fresh: separate client 111, 378 matters; exact related values and 105 unaffected tables retained |
| V3 — counterexample and future integration; D52 | Test-only archived-parent exclusion fails nonempty visibility expectation; current positive path detects future exclusions; future UI/export coverage explicitly unclaimed | Existing report loader exercised by visibility runner; mutation of returned/query behavior only inside negative test | Archived fixture client; all unchanged report datasets also compared | Mandatory fresh; report loader/query dependency hash and rejection receipt | `evidence/archive-visibility-pass.log`, `visibility-pass/results.json`; TASKS 4.2/6.2 | Passed: test-only report exclusion detected; future UI/export obligation explicitly carried forward |
| V4 — current archived read access; D52 / permissions | All four roles read labelled archived client/detail/contact/count paths; ordinary lists exclude, archive filters include; restore only Administrator | `src/lib/client-query.ts`, `readClientMutation`, new visibility runner and browser runner | Real nonempty copied imported clients; Administrator, Litigation Assistant, Lawyer, Paralegal | Fresh service reads and production-browser proof; current source hashes | `evidence/visibility-pass/results.json`, `browser-final/browser-evidence.json` | Passed fresh: all four roles, normal/archived/restored reads; only Administrator restore |
| F1 — real-volume reads/search/paging; D53–D56 | All 318 clients/188 contacts; six unnamed, 207 without contacts, duplicate IDs, max 378; distinct deterministic 25-row paging and contact matches; separate status/archive | `npm run test:client-read-only`, `scripts/test-client-read-only.ts`, `src/lib/client-query.ts` | Copied complete source plus task-owned edge cases; four viewing roles | Fresh required; capture actual query plans and batching without invented timing targets | `evidence/client-read-only.log`, `read/query-plans.json` | Passed fresh: 318/188/6/207/378, deterministic paging/search; actual plan timings retained without a new SLA |
| F2 — existing logos; D15 / D56 | All 54 copied originals decode; missing, unreadable and unusable metadata/path/image failures fall back; independent view authorization | Read-only runner, `client-logo-file.ts`, `client-logo-image.ts`, guarded GET/HEAD and browser late failure proof | Copied logos only; original logo hashes untouched; four roles | Fresh read/logo and browser results; unchanged display dependencies | `evidence/client-read-only.log`, `read/`, `browser-final/browser-evidence.json` | Passed fresh: all 54 copied originals and negative/fallback cases; original hashes unchanged |
| A1 — permissions/current actor; D56 / permissions | All 448 decisions; direct denied routes/actions; current session/account/person/role revocation and trusted attribution | `test-client-mutations.ts`, `test-client-contacts.ts --regression-proof`, permission/audit sources; fresh production browser | Reviewed full-state fixtures and four roles, invalid/revoked sessions | Reuse Phase 3 `client-regressions.log` and `client-mutations-complete.log` only after full dependency/member identity comparison; fresh browser denials | `evidence/reused-evidence.json`, `historical-artifact-verification.json`, `browser-final/browser-evidence.json` | Verified reuse of all 448 decisions/current-actor contracts; fresh browser denials passed |
| A2 — validation/provenance; D39 / D53–D57 | Immutable system/legacy identity, ownership and Sigma names; deliberate fields only; six unnamed unrelated edits; dates/blanks/legacy spellings exact | `client-mutation-input.ts`, `client-mutations.ts`, migration 62; reviewed mutation assertion groups | Imported/native fixtures; authorized roles and forged payloads | Reuse exact Phase 3 service groups if dependencies unchanged; fresh representative browser cases | `evidence/reused-evidence.json`, `browser-final/browser-evidence.json` | Verified reuse of exact accepted service groups; fresh browser validation/provenance cases passed |
| A3 — no-op and repeat creation; D57 | No-op rows/version/audit/full sequences equal; same key/payload/actor creates one identity/event, new key permits duplicates | Existing mutation runner submission and full-state no-op groups; actual gateways | Task-created fixture records, concurrent duplicate submissions | Reuse accepted groups after dependency check; fresh browser exact network replay | `evidence/reused-evidence.json`, `browser-final/browser-evidence.json` | Verified reuse of full no-op/idempotency contracts; fresh exact browser replay passed |
| A4 — lifecycle/concurrency/rollback; D52 / D55 / D57 | Non-cascading parent lifecycle, explicit main-contact clear/replace, ten observed lock races; audit failure rolls business/receipt/event changes back | Existing mutation runner lock-race/lifecycle/failure groups, migration 62 gateways and audit infrastructure | Isolated task records and actual lock observations; failed sequence allocation is not claimed reversible | Reuse exact 12-group/ten-race evidence if dependencies unchanged; new V1/V2 real-data proof remains fresh | `evidence/reused-evidence.json`, `visibility-pass/results.json` | Verified reuse of 12 groups and ten observed lock races/rollback; mandatory new visibility proof passed fresh |
| B1 — browser functional/navigation; D56 / R1/R2 accepted correction | All roles normal/archived, direct denials, create/edit/confirm, Save/Cancel/Clear/Back, validated q/status/archive/pages, pending/error/stale draft and restore behavior | `npm run test:client-mutation-browser`, `scripts/test-client-browser.mjs`, `scripts/lib/client-mutation-browser.mjs`; extend minimally for nonempty archive scenario | Separate production mirror, current-62 task database, temporary runtime credentials only | Fresh complete existing runner once plus focused new cases; build/candidate hashes | `evidence/browser-final.log`, `browser-final/`, `browser-final-command.json` | Passed final production build and 121 states/proofs; initial headless-shell failure retained separately |
| B2 — Arabic/RTL/accessibility; TASKS / visual direction | Arabic shaping, mixed Latin, labels/errors, focus, keyboard Tab/Escape/return, status/error regions, contrast/targets, 320 CSS px and actual browser 200% zoom | Existing browser runner axe/AX/keyboard/native zoom assertions; inspect named final screenshots | Representative forms, stale errors, confirmations, archived details; desktop and narrow/zoom | Fresh counts/results; no copying old 86/69/79 totals; selected image inspection receipt | `evidence/browser-final/browser-evidence.json`, `visual-inspection.json` | Passed: 98 zero-violation scans, 320 CSS px, genuine 200% zoom; 109 generated PNGs, seven explicitly inspected |
| B3 — supplemental speech; owner request | Bounded attempt only if installed reader and permitted observable speech output exist; otherwise exact limitation, no blanket conformance claim | Inspect available local reader/version and advertised capabilities; observe error/stale/save/archive results if possible | Task fixture only; no installation, disabled integration enablement or unrelated recording | Fresh availability/observation receipt; AX/axe/synthesis are not spoken-output evidence | `evidence/screen-reader.json` | Permitted supplemental limitation: Narrator installed, no observable speech channel; no spoken cases/language verified or reader state changed |
| Q1 — regressions and final checks; D57 | Eleven static checks pass final candidate; affected service/permission/audit/current-62 regressions rerun when source/fixture dependencies change | `npm run check`; `test:client-regressions` is current-62 path; no historical replay substitution | Final candidate and isolated fixtures where needed | Fresh final static; precise reuse for unchanged regression claims; production build in B1 | `evidence/check-final.log`, `check-gitignore-retry.log`, `check-encoding.log`, command receipts, `reused-evidence.json` | All eleven covered and passed: aggregate first nine; sandbox-blocked tenth and remaining eleventh completed separately |
| D1 — accurate documentation; owner request | Review bytes preserved; Phase 3 published; Phase 4 actual outcome only; correct historical pointer; every other checkbox unchanged; links/anchors/format/encoding valid | Narrow README/TASKS/PRD update, new dated report/matrix, exact publication-review copy | No governance/decisions edits; enumerate actual checkbox items | Fresh before/after lists and exact publication-review 7951-byte hash | `evidence/checkboxes-before.json`, `checkboxes-after.json`, `documentation-check.json`, `documentation-final.log` | Passed: exact review/initial matrix, six documents and links/anchors; 83 checkbox identities, only Phase 4 newly checked |
| C1 — cleanup and final preservation; owner request | All recorded task containers/volumes/networks/PIDs/mirrors/profiles/logos/secrets/dumps/links absent, including failed attempts; source receipt still exact | Reviewed owned-fixture finally blocks plus independent native inventory; P1–P3 repeat | Only positively identified task resources, no blanket cleanup | Fresh independent final cleanup and source/file equality | `evidence/cleanup-final.json`, `file-preservation.json`, `preservation-comparison.json`, `after-*` | Passed: all six owned database resource sets and two app PID/mirror identities absent, including failed attempts; source/files exact |
| G2 — single review commit/package; owner request | One local child of checkpoint, exact subject/scope/stats; binary full-index patch reverse-check; sanitized ZIP every member verified; clean main 1/0 vs recorded fetch, no push | Native Git, literal-safe structured manifests and delivery receipt | Source/test/docs only in Git; no raw rows, dumps, credentials or original logos in package | Fresh final commit, patch/ZIP/member hashes and counts; independent Phase 4 review remains stop | Patch, ZIP, `manifest.json`, `zip-verification.json`, `evidence/final-git.json`, `delivery-receipt.json` | Source gates passed; final commit/export results are recorded in the external post-commit delivery receipt |

## Plan changes and results

Final result update recorded 2026-09-10T10:10:51.296Z. The immutable initial
matrix is still 14,815 bytes, SHA-256
`c2cc9eb130ff118bae58d68bc0066373c15813b4f8132633fb3596d6906da9e6`,
captured at `2026-09-10T09:28:53.4058899Z`. It was not overwritten or backdated.

All changes below occurred on 10 September 2026:

- P2 output names follow the reviewed helper's actual `before.json` and
  `after.json`, replacing the plan's `*-project.json` placeholders.
- V1–V4 minimally export the existing report loader with its additional explicit
  read-only snapshot guard, then reuse its unchanged SQL/parameters/fields/order.
  Gate 4's 60 tests were run fresh because this dependency changed. The fixed
  report client has 82 matters; the separate largest client has 378.
- I1/F2/B1 add restored full-table equality before actors and copied-logo receipts
  to the existing runners. Those runners were run fresh; unchanged service and
  current-62 regression dependencies support precise A1–A4 reuse.
- V1's first run omitted the service confirmation ID; the second used the wrong
  audit action expectation. Both failed fixtures were cleaned. Corrected final
  proof is `archive-visibility-pass.log` / `visibility-pass/`; earlier logs
  and isolation records remain diagnostics, not passing evidence.
- B1/B2's initial browser run passed build/reads but the headless shell lacked
  the zoom-extension worker. The existing full Chromium executable was selected
  without installation or source changes. Final proof is `browser-final/`,
  121 states/proofs and 98 scans; the earlier `browser/` failure is retained.
- B3 found installed Narrator 10.0.26100.8972 but no permitted observable speech
  output. No reader was started. The owner-authorized supplemental limitation
  remains separate from programmatic status, keyboard, AX and axe evidence.
- Q1's one aggregate command passed its first nine checks, then sandbox process
  spawning blocked Git before the tenth ran. One supported retry passed the
  blocked ignore check; the remaining encoding check passed. The original
  aggregate exit 1 is preserved. Only documentation-result checks followed.
- Receipt-generation mistakes (PowerShell's automatic Matches variable and a
  command JSON property's case) were corrected without rerunning application
  suites or rewriting original evidence. `execution-index.json` and the dated
  report preserve that distinction.
- D1 marks only Phase 4 locally verified. Overall Task 4.1 and Task 4.1a remain
  unchecked. The publication review is byte-identical. G2's final Git/patch/ZIP
  facts necessarily follow this document's commit and reside in the external
  delivery receipt. The stop remains independent Phase 4 review, not owner
  acceptance, publication or Access cutover.

The [dated report](../task-reports/2026-09-10-task-4-1-phase-4-final-acceptance.md)
explains fresh/reused evidence, corrections, exact preservation and future
matter/report UI obligations. The reused index verifies all 135 prior manifest
entries (136 ZIP members including its manifest) and compares 374 accepted Git
dependency entries, with exact original assertion/log references.
