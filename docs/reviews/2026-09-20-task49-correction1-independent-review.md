# Task 4.9 correction 1 — independent implementation review

20 September 2026. **PASS. T49-R1, T49-R2 and T49-R3 are closed.** No required corrective finding or missing review attachment remains.

This is an implementation review of `64b5a191e7b9e0d2776c53df69ee6350ca154a67`, tree `ab7f4831ee95249b92d938346c83f06f9c6f952a`, sole parent `fe4452d90c9b046097effcf874540c1737e8d002`. The reviewed chain is `ba360643 → fe4452d → 64b5a19`. The complete approved Administrator audit viewer and persisted-capability XLSX/PDF export scope remains included.

**Task 4.9 is ready for owner acceptance and a separately authorized operational phase. It is still unchecked, unactivated and unpublished at the supplied checkpoint.** This review does not authorize actual owner migration/provisioning, restart/activation, acceptance edits, push or Stage 5. Continue this ChatGPT conversation and the SAME existing Codex Desktop task, Local Windows at `D:\Projects\litigation-system`, with no subagents. Task 4.8 remains closed.

## Basis and verification

Reviewed the five correction delivery files, pasted Codex commentary, original/corrective mandates and recorded owner authorization, first independent findings, corrected source and complete Git diff, report/matrix, executed test/helper bodies, relevant permanent checks, fresh/reused results, selected browser/PDF visuals, and full supplied preservation records. Frozen repository authorities remain those read for the original implementation review; no new governance or policy decision is inferred from this correction.

| Check performed here | Result |
| --- | --- |
| Incoming ZIP | 134,059,349 bytes; SHA-256 `a5f2f8f663c7f58a4a0c0dac5a7c520133e40df96e6892f84b4a6e5fa36d368e` |
| Exact safe archive membership | All 22,969 regular-file members, case-unique safe paths, bytes/compressed lengths, CRC and SHA-256 independently checked before extraction; 541,384,195 uncompressed bytes |
| Inspected supplied verifier | Fresh successful run with the final receipt; internal inventory, all four companion bindings, raw commits/trees/source identities and both patch pairs pass |
| Independent Git application | Corrective patch reconstructs 824 shareable candidate files and reverses to 819 reviewed files; cumulative patch reconstructs the same 824 and reverses to 793 base files, byte-exact |
| Actual committed change | Corrective: 20 paths, +1,037/−60, 32 hunks. Cumulative Task 4.9: 68 paths, +7,137/−51, 139 hunks. The editor's 45-file display is not the committed diff |
| Frozen material | AGENTS.md, CLAUDE.md, TASKS.md, decisions, migrations 1–72 and existing review/report bodies unchanged; all 86 checkbox lines unchanged |
| Executed-source evidence | All 18,900 supplied source bindings across 23 corrective attempts match their retained bodies exactly; final application/migration code matches successful build, values, exports, browser, invariant, database and canonical runs, allowing verified text line-ending representation |
| R2 code and workbook | Executed the exact corrected pure projection with Node type stripping; independently decoded actual XLSX XML/Base64/JSON for 23 typed cases and all 46 before/after envelopes |
| Reader/scope recomputation | Recomputed 905 raw supplied event identities into 47 groups and the exact two-page union; all 35 supplied association expected/actual sets match |
| Browser evidence | Reconciled the independent required 23-family set with 26 selected surfaces and 29 actual openings; all expected/actual scope sets and exact trigger-return assertions match |
| Visual inspection | Independently rendered actual five-page typed PDF and inspected pages 2–5, mixed Unicode detail, and selected final browser collision/mobile/allocation/retired-link screenshots |

Git inventories contain 795 base, 821 reviewed and 826 corrected tracked identities. `.env.example` and `docker-compose.yml` are the same two unchanged credential-bearing bodies with identity-only coverage. No changed implementation body is omitted. Reviewer scripts and machine-readable results are retained in the separate independent-review record.

These are artifact checks and local pure-code/decoder executions. **ChatGPT did not connect to the owner Windows system, PostgreSQL, running app or GitHub, and did not rerun the supplied Windows build, database or browser tests.**

## T49-R1 — closed

The correction adds a deferred AFTER INSERT constraint trigger, `audit_export_event_consistency`, on `public.audit_events`. Its private security-definer helper checks grant/revoke facts and literal `audit_history:` completion events against the existing capability chain/current-state/receipt invariant. Existing private-side deferred checks and immutable-row guards remain. Therefore an event-only write now queues enforcement without relying on a private-table write. `starts_with(...,'audit_history:')` fixes the wildcard-prefix defect.

The new helper is private, has a fixed search path, and is covered by the permanent exact function-body/classification checks. The new trigger's enabled state, operation, function, deferred timing, qualification and arguments are checked explicitly. The old runtime trust boundary and narrow completion gateway remain; this review makes no new isolation claim against a compromised application process.

Evidence establishes the requested before/after behavior:

- Original candidate: the real restricted-runtime generic writer passed forced deferred checks and separately committed orphan event 882. Its diagnostic rollback compares exactly; the poisoned disposable cluster was then removed rather than repaired or reused.
- Corrected candidate: the same writer is rejected with SQLSTATE `23514` at both `SET CONSTRAINTS ALL IMMEDIATE` and COMMIT. Full supplied before/after state compares exactly across 141 tables, 48 sequence vectors and 15 catalog categories.
- Grant-event, revoke-event, current-state, change-chain and receipt corruption cases fail at the deferred boundary; missing/disabled event-trigger cases fail permanent checks. The unrelated literal `auditXhistory:ordinary` resource remains allowed.
- Fresh export evidence preserves valid receipt/event deltas, initial capability provisioning and controlled transitions, current authority checks, generation/refusal paths, revocation during generation, and concurrent same-operation 200/409 with exactly one event.

Source: `prisma/migrations/20260920140000_audit_history_capability/migration.sql`, `scripts/lib/audit-history-checkpoint.ts`, `scripts/test-audit-history-invariant.ts`. Evidence: `original-r1-probe`, `invariant-02`, `exports-01`, revised upgrade and canonical replay.

Revised migration 73 SHA-256: `91dc1189cbde3d57cc4d7c99755498f16cffe69373add6d1e3c15b3b5e6e7431`. Its exact bytes match the fresh migration and canonical executed-source evidence. Migrations 1–72 remain frozen; original 73 remains in the parent and preserved diagnostic evidence.

## T49-R2 — closed

`auditOriginalValue()` serializes the recorded typed representation independently from `auditValue()`: `{present:false}` or `{present:true,kind,text}`. This preserves absence separately from null, and does not parse exact numbers through JavaScript numeric types or replace evidence with translated labels. XLSX before/after rows encode that envelope; metadata rows are explicitly documented as display-text envelopes. Raw and readable chunks are separate and ordered.

The reviewer-owned decoder recovered all 23 specified inputs exactly: absent/null/empty, six literal marker strings, whitespace/newlines, forbidden XML controls and literal escapes, Arabic/mixed Unicode, false/zero, exact large integer/decimal, object/array, redaction/truncation metadata, hostile text and long chunked Unicode. The latter uses eight chunks. All 23 after-values decode as absent. Both worksheets are RTL; the workbook contains no formula or hyperlink cells. The maximum inspected cell is 14,668 UTF-16 units.

Executing the exact corrected pure projection confirms six state/literal pairs remain distinct in both display and original envelope. Control characters also remain distinct from literal backslash escape text. The actual PDF and supplied production-viewer screenshots visibly distinguish empty/null/false/redacted/truncated/absent states from literal label strings; PDF pages preserve joined Arabic, mixed Unicode, exact numeric text, visible metadata, literal hostile text and page numbering. No PDF URI links were found.

The browser collision fixture is explicitly a synthetic intercepted response for rendering only. Live authenticated scope/authority evidence is separate; no synthetic history was passed off as a database event. Existing generation bounds, escaping, fetch blocking, full selected scope, watermark and export authority protections remain in force.

Source: `src/lib/audit-history-projection.ts`, `src/lib/audit-history-export.ts`, `src/strings.ts`; fresh proof: `values-02`, `exports-01`, `browser-03`.

## T49-R3 — closed

The new browser oracle declares the complete 23-family set and selects actual child/parent records before opening each required control. Final assertions fail on a missing family or required surface. All seven formerly omitted families are present:

| Family | Verified final example |
| --- | --- |
| contacts | Contact 1 from client 196 and `/clients/196/contacts/1` |
| matter_lawyers | Relationship 6 from matter 2399 |
| hearing_attendees | Attendee 1 from hearing 3 |
| task_actions | Step 1 from administrative work 1737 |
| power_of_attorney_lawyers | Relationship 1 from POA 25; both matching existing controls opened |
| fee_letter_matters | Covered link 1 from fee letter 2; retained link 694 from fee letter 994 |
| invoice_allocations | Actual allocation 8 from invoice 310 |

The separate `matter_fee_letter_references` direction is also tested, including retained reference 1180. Recorded optional retired populations for hearing attendees, administrative steps, POA lawyers and staff aliases were empty; those retired openings are not claimed tested. Global-only families remain explicit without invented standalone workflows.

There are 29 openings across 26 surfaces: four have nonempty history and 25 correctly have no recorded matching history. Expected IDs come from separate raw-event/retained-association logic, not the application's scope function. Every mapping records table/child ID, route, exact expected/actual IDs, initial Close focus, 14 Tab steps, Escape and return to the exact trigger. The 406 Tab observations remain in the active dialog/document; 29 separate focus observations are visible/unobscured. All 34 supplied axe result files have zero reported violations.

The fresh production-browser run also covers shared Clear/drafts, Back/Forward, stale responses, role/method/forged-payload refusals, 320px reflow, genuine 200% zoom and downloads. These are supplied interaction results, supplemented by reviewer screenshot inspection, not independently replayed browser actions. Screen-reader speech remains excluded; no accessibility-conformance claim is made.

Source: `scripts/lib/audit-history-browser-surfaces.mjs`, `scripts/test-audit-history-browser.mjs`, the two scope attributes in `src/app/audit-history/viewer.tsx`. Evidence: `browser-03/proof/required-surface-oracle.json`, `record-entry-mapping.json`, `successful-focus-trace.json`, screenshots and result records.

## Regression, upgrade and preservation

Fresh supplied gates include production build, project/static checks, 480 permission decisions (448 preserved +32), 148 historical database checks, 130 canonical checks, reader/association/invariant/export/value/browser tests and final source checks. Four unchanged original result records are explicitly reused for authentication, account lifecycle/UI and the legacy checkpoint-60 audit foundation. Their supplied hashes match the original delivery; 22 listed source bodies are unchanged. The legacy foundation is not described as a migration-73 test. Reader SQL is unchanged; no new inner-query-plan claim is made from the earlier wrapper plan.

The independent upgrade recomputation confirms 138→141 tables; 135 unrelated old table digests unchanged; all 48 full sequence definitions/states exact; all 880 prior audit rows and 73 prior ledger rows preserved. The only changes to existing table contents are the intended new grant event, transactional counter +1 and one successful migration-ledger row. The new current capability/change tables each contain one row, and receipts are empty. Initial recipient remains account 2/person 139/actor 1002 in the full-data copy. Canonical identity differs as already documented and is not reused as the owner account ID.

Named catalog deltas match the supplied exact inventory: three private tables and their five indexes, 14 functions, 10 triggers, the added constraints and expanded action constraint. No old function or trigger is removed. No runtime raw-table grant is introduced. The original, corrected and canonical disposable clusters have distinct identities from owner cluster `7676117521894273062`, and serial cleanup records remove only their owned resources.

Final supplied owner observations compare exactly for all 138 tables/all columns, 48 complete sequence vectors, 15 catalog categories, old audit/ledger identities and protected account/session state. Database after-capture is **18:49:44.100 UTC**, after the last test at **18:40:12.503 UTC** and final private-profile ACL work at **18:48:43.435 UTC**. Runtime after-capture at **18:49:46.399 UTC** retains PID52576, build `l02XdOB10LpyGNufC8_Fs`, loopback3000 and the same owner container/start/mount identities. These are dated artifact observations, not current live guarantees.

The full file comparison is exact for **160,274 prior files / 7,481,380,100 bytes**, 94 recorded roots/credential ACL observations and 21 junctions, with no additions/deletions. The first scan ran 17:58:18–18:24:12 UTC; the final scan ran 18:40:58–19:06:10 UTC. It is a complete enumerated comparison, not an atomic filesystem snapshot. ACL coverage is the recorded roots/credential files, not a separate baseline ACL capture for every descendant. A separate final scan records 999 new private-task entries with restricted ACLs.

Earlier launcher/static-check failures, superseded screenshots, the signal-exit reporting error and the helper-copy naming error remain disclosed with their retained evidence. The actually executed corrected host body is present under its true name. Chromium-added permissions on nine new task-profile directories were retired after testing; the before/after records and all profile data remain. Final owner observations follow that work. A reviewer checker initially treated binary PNG CR/LF bytes as text and then assumed all focus records had one schema; those local checker errors were corrected, without changing any delivered source/evidence or product outcome.

The final supplied Git observation at **19:07:16 UTC** records clean `main`, two ahead/zero behind freshly observed unchanged `origin/main` and remote main at `ba360643937fd0af9d11b12b7f18f8ddec093aac`. Nothing is reported pushed.

## Limits and next boundary

Private dumps, credentials, cookies, full privileged global exports, dependencies/build binaries and original logo bodies remain outside the shared delivery. Shared synthetic output was decoded/rendered here; full private global outputs receive credit only as supplied test evidence. Original unavailable intermediate bodies remain explicitly unavailable. The requested model selector is unobservable; no selector-change claim is made. Accessibility-skill contributions are documented by the implementer; they do not replace measured interaction evidence.

**No further implementation correction is requested.** The next separately authorized phase can accept the reviewed implementation, apply only the exact revised migration 73 with its initial verified KHelmy capability grant, activate a stable build of this reviewed source, and ordinarily publish the approved two-commit implementation chain plus a bounded acceptance-documentation child to the existing GitHub main. It must start with fresh state/destination observations and protected recovery/rehearsal, preserve prior rows/sequences/files and all other task markers, distinguish actual versus isolated checks, and return for independent operational review. This is a concrete next-phase recommendation, not an operational authorization or a claim that those actions occurred.

The canonical external project context advances additively from v1.97 to **v1.98**. The older v1.96 Project Sources copy is not used to overwrite the newer review history.
