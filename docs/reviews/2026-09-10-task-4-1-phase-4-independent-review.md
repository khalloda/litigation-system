# Task 4.1 Phase 4 — independent review

Review date: 10 September 2026. Prepared for Khaled Helmy from the supplied Phase 4 patch, evidence ZIP, external delivery/final-check receipts and the approved Phase 4 prompt/handoff.

**Outcome: PASS within the authorized Phase 4 scope. No blocking finding or correction commit is required. No needed attachment is missing.** This is an independent review recommendation, not owner acceptance, publication, deployment or Access cutover authorization.

## Reviewed change and evidence identities

| Item | Identity |
| --- | --- |
| Delivered local commit | `d4eed39612cf16b3a44808e056a21857642dc167` |
| Sole parent / recorded fetched checkpoint | `9f61ba481fbebdb2b0d54e470e43cd8d26014265` |
| Subject | `test: verify Task 4.1 Phase 4 acceptance` |
| Exact committed scope | 12 files, +1,206 / -40: six Markdown files and six verification helpers/runners |
| Report | `docs/task-reports/2026-09-10-task-4-1-phase-4-final-acceptance.md` |
| Final matrix | `docs/testing/task-4-1-phase4-acceptance-matrix.md` |
| Reported final local state | Clean `main`, upstream `origin/main`, one ahead / zero behind the recorded fetched checkpoint; no operation/lock; no push |

| Supplied artifact | Bytes | Independently recalculated SHA-256 |
| --- | ---: | --- |
| `0001-task41-phase4-acceptance.patch` | 99,138 | `7c9be71615b17bbdd5b6f0ed8436379d2564831d69aa8ec55d8940c2ccf62b8c` |
| `task41-phase4-evidence.zip` | 726,101 | `62a1f7f0a9d4f377ce1bb6302b1f32f54b2d29972b012c5ef6476e7860d81654` |
| `manifest.json` | 16,552 | `6d1c094169af04363495a12b353ea167efbbe15d2fdffd57431e9111e55f096d` |
| `delivery-receipt(4).json`, originally `delivery-receipt.json` | 10,691 | `a645758289c247cc12995cead06a302fb9a829f202c4334300859c2d999c0810` |
| `final-git-recheck.json` | 172 | `5946735cb0a3544f1d50be3c60ad16da39e386030be0a8ef8f92b7991b82ee78` |
| `final-cleanup-recheck.json` | 553 | `76ca077f016349d53071dfc7121bf394c28ef3ba2cebf36412bfe83ea271f7a3` |

The ZIP contains exactly **100 manifest-listed payload files plus the manifest itself: 101 members**. Every payload filename, byte size and SHA-256 was independently checked. There are no duplicate or unsafe member paths. The embedded patch and manifest are byte-identical to their standalone attachments. The report, final matrix, immutable initial matrix, final source files, fresh logs, selected screenshots, reuse index, preservation/cleanup evidence and Git receipts are all present. Earlier Phase 3 evidence needed for reuse is already available from the prior delivery; no repeated upload is needed.

All 12 complete postimages match both the patch's full Git blob hashes and the delivery receipt's SHA-256/byte sizes. All six existing-file parent blobs match previously reviewed local source and a read-only tree lookup pinned to the [published base](https://github.com/khalloda/litigation-system/tree/9f61ba481fbebdb2b0d54e470e43cd8d26014265). The patch's exact file list and per-file insertions/deletions match the receipt. Forward applicability was checked and the patch was applied only to a disposable scratch reconstruction; every resulting file matches the package. Reverse applicability then passed with `--reverse --check --binary`; the reverse patch was not applied.

The Codex activity panel's 22 edited files includes external evidence-generation work and is not the committed Git change. The verified commit scope is 12 files, +1,206 / -40.

## Acceptance matrix and execution order

The immutable initial matrix is 14,815 bytes, SHA-256 `c2cc9eb130ff118bae58d68bc0066373c15813b4f8132633fb3596d6906da9e6`, captured at `2026-09-10T09:28:53.4058899Z`. Its initial statuses remain planned rather than rewritten as retrospective passes. The recorded initial capture precedes every indexed test, database check, fixture/build/browser run. The first indexed preservation log starts at `09:30:42.238Z`.

The final matrix maps the authorized requirements to fresh or reused evidence and separately records changed output names, harness corrections, the browser retry, static-check completion and the speech limitation. The six final verification-source hashes match the execution index and committed postimages; their recorded modification times precede the relevant passing runs. Later changes record documentation results. Timestamp conclusions are based on supplied command/filesystem receipts; this reviewer did not observe the Windows execution live.

The initial fetch's sandbox denial and single identical supported retry are explicitly retained. The preflight reports the fetched checkpoint remained `9f61ba4...`. This follows the prompt's bounded recovery provision and does not represent an extra successful fetch or permission to bypass a rejection.

## Archive, matter and report proof

The new runner exercises the existing `readClientMutation` / `mutateClient` service and existing report loader against a positively identified full-state disposable copy. Reads use explicit fixture connections with read-only/repeatable-read snapshot guards. The loader's queries, parameters, field definitions and ordering are unchanged; its only change is export plus an explicit existing snapshot-contract assertion. The existing source-target guard remains in place.

| Actual stored identity | Existing matters | Independently checked result records |
| --- | ---: | --- |
| PostgreSQL client 12, legacy client 3 | 82 | Before, archived and restored matter IDs/content digests and all six report datasets agree |
| PostgreSQL client 111, legacy client 102 | 378 | Separate largest-client before/archive/restore proof preserves exact matter identities/content and report datasets |

The fixed client-report parameter remains legacy ID `3`; its report has 82 nonempty rows. The largest client is independently selected by relationship count rather than retargeting the frozen report parameter. The service and browser result records agree across both clients and all three states, including exact matter identity lists, content digests, report identities/ordered-content digests and client versions 1 → 2 → 3.

The code also verifies 105 unaffected tables, other clients, client business fields and prior audit-event prefixes. Legitimate lifecycle metadata and corresponding `record_updated` / `archive` / `restore` events are permitted, attributed to the fixture Administrator. It does not claim legitimate version/event/sequence effects disappear on restore. All four roles exercise current client/contact/list/detail access; browser assertions confirm the matter count, archived notice and Administrator-only restore link.

The negative proof intercepts the actual client-report query only in the test and adds an archived-client exclusion. It asserts the interception occurred once, the previously nonempty report becomes empty and the visibility equality check rejects it, while the other five report datasets remain unchanged. The positive proof continues to call the real unchanged query path. This meets the required visibility test rather than relying only on absence of row deletion.

No application business logic, schema, migration, role/grant, authorization policy, governance file or original logo was changed. No future matter/report screen or export was implemented.

## Fresh checks, evidence reuse and visual review

The supplied final logs support fresh real-volume read/logo proof, the 60/60 Gate 4 checks and the isolated production build/browser run. The browser evidence was independently counted: **121 records, 98 scans with empty violation lists, six genuine 200% zoom receipts and no recorded remote requests**. The zoom receipts show width 1440 → 720, device-pixel ratio 1 → 2 and CSS zoom remaining 1. Current client archive/read coverage spans all four roles, both nonempty clients and before/archive/restore states. R1/R2 and the accepted Phase 3 interactions remain exercised by the complete browser run.

All seven packaged final screenshots were independently opened and inspected:

- `phase4-archived-largest-320.png`: archived client label, 378 matters and contact cards reflow at 320 pixels.
- `Phase3 client form-browser-zoom-200.png`: readable Arabic labels, fields and Save/Cancel controls at the recorded browser zoom.
- `phase3-stale.png`: focused stale-save explanation, explicit reload action and retained Latin/multiline draft values.
- `state-068.png`: visible validation summary, required-name guidance and retained form controls.
- `state-082.png`: archive confirmation text and both actions fit the 320-pixel dialog.
- `Phase3 client confirmation-browser-zoom-200.png`: readable confirmation and actions at the recorded genuine zoom.
- `state-111.png`: archived-client detail at 320 pixels with the Administrator restore action and 378 matters visible.

No blocking visual problem was identified in these captures. This review does not claim to have inspected all 109 generated screenshots or tested actual speech.

The 374 accepted dependency entries were independently compared with the pinned published base and delivered patch: **371 remain unchanged; three changed existing paths are covered by fresh report/read/browser proof**. The Phase 3 mutation service, permissions, audit, schema, fixture foundation and locked-runtime dependencies remain unchanged. All five cited historical evidence members match the available original Phase 3 ZIP; all 17 quoted log-line references match their exact lines. This supports the explicitly historical reuse of 12 mutation groups, ten observed lock races and 448 permission decisions/current-62 regression coverage. They are not described as newly executed tests.

The static-check evidence is accurately qualified. The aggregate `npm run check` remains exit 1 after nine completed checks because the Git-ignore check could not start Git in the sandbox. The supported retry of that check and the remaining encoding check each record exit 0. The final documentation-only checks followed. No successful aggregate exit is invented, and there is no reason to repeat unchanged application suites merely to replace this complete, explicit record.

Both initial visibility failures are retained as harness errors: omitted confirmation, then an incorrect audit-action expectation. The initial browser failure is retained as unavailable extension support in the selected headless shell; the retry used the existing full Chromium executable. These diagnostics do not contradict the later complete passing runs.

## Preservation, cleanup and documentation

The before/after full project receipts are independently byte-identical, each 40,324 bytes, with the accepted SHA-256:

`05a164f773ee7f9ade66b7db9886f110f8c50e11fb655cb6f28ad9ac3a0b89d6`

They retain the established 107-table, 48-complete-sequence, catalog/role/grant/migration/audit/service-configuration and 54-logo evidence. The supplied before/after logs record the same 15 setup checks and 116 historical invariants. Migration 60–62 identities match the accepted handoff. All **2,077** unique protected-file records are equal before/after, including size, SHA-256, modification time and permissions.

Cleanup records cover six task-owned database resource sets, both application PID/mirror pairs, copied-logo roots and temporary fixture prefixes, including failed attempts. The separate final cleanup recheck at `2026-09-10T10:17:55.5622386Z` reports no remaining matches. These are reviewed supplied observations, not a fresh inspection of Windows processes or Docker by this reviewer.

The 83 actual TASKS checkbox lines were compared with the accepted parent and delivered postimage. **Only Task 4.1 Phase 4 changed from unchecked to checked.** The other 82 states, overall Task 4.1 and Task 4.1a remain unchanged. The stale Task 4.0a return pointer was correctly relabelled as historical. The Phase 3 publication review remains exactly 7,951 bytes with SHA-256 `f27505a19e9cb9d40ced3fe0b3828d49975d95f78bf145f7c260e807c97fb5a9`. All 112 local link-target occurrences in the six delivered Markdown files resolve within the pinned base plus this change; supplied documentation validation also covers affected anchors, formatting and encoding.

## Retained limitations and recommendation

1. **Actual screen-reader speech remains unverified.** The supplied availability receipt records Narrator installed, no permitted observable speech channel and no reader state change. The owner prompt made this a bounded supplemental attempt and explicitly permitted continuing with the limitation disclosed. Keyboard, AX, live-region, axe and screenshot evidence must not be presented as heard speech or blanket accessibility conformance.
2. **Future matter/report UI and exports require integration testing.** Current client reads and existing query-contract protection are proved. TASKS 4.2 and 6.2 now explicitly carry the later D52 integration obligation. This does not expand or block the completed current Task 4.1 scope.

Recommend owner acceptance of **Phase 4 and Task 4.1 overall**, retaining these two limitations, followed by one narrowly scoped documentation-only acceptance commit and independent review of that documentation. This would close the reviewed client/contact scope without pretending future screens or actual speech were tested. For example, archiving the fixed report client keeps all 82 existing matter/report results visible; its report parameter and business status remain separate from archival.

An alternative is to arrange an observed screen-reader session before overall acceptance; that adds manual coordination/time and would supply the missing spoken-output evidence. No new software purchase is required for the recommended documentation step; normal Codex usage applies. Owner acceptance, the documentation commit, publication and any next task remain separate actions. Do not push, start Task 4.1a or perform deployment/cutover based on this review alone.

This review inspected supplied bytes, source changes, pinned parent metadata, logs, structured results and screenshots. It did not rerun Windows application/database/browser tests, inspect the live local Git state or make a fresh remote-branch observation. The delivered local commit identity and clean 1/0 state remain supported by the supplied patch/receipts; no publication of `d4eed396...` is claimed.
