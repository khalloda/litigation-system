# Task 6.2 correction 1 — independent review

Date: 27 September 2026. Reviewer: ChatGPT planning/review conversation.

**Verdict: PASS for the T62-O1 code correction at the reviewed local commit. HOLD full Task 6.2 functional closure for the remaining T62-O2 data/source questions. The correction is not live.** This review does not authorize owner-data repair, migration, activation, publication, UI implementation or Task 6.3.

## Exact reviewed checkpoint

| Identity | Value |
|---|---|
| Local correction | `6550a6bc0605b916c3f60daa9b797fba056f8882` |
| Parent / last published main in the receipt | `1f0754bf0186d69cfcca3e82df888c54b22863fb` |
| Correction tree | `974d0de555a1c0c0053ad612fb3081f6b9440efa` |
| Receipt Git state | Clean main, one ahead / zero behind; remote and tracking main still at the parent |
| Last supplied runtime observation | 27 September 2026, 14:21:33 Cairo; PID 28636; old build `DcwUbnikdCk5b39gZNOSN` responding |
| Migration | 73, unchanged; no correction migration or owner repair applied |

Runtime and remote statements are dated evidence from the supplied Windows observations. The reviewer did not operate or recheck the owner machine. The running artifact was built from the earlier candidate, not correction commit `6550a6b`. An unchanged row count cannot establish whether a court-source change is active.

## T62-O1: the correction passes

The only production-code change removes `matterCourt: true` from the `client-status` configuration. Court and circuit now come from the same selected latest hearing/action as the date and decision. All four retained Type 4 Access definitions select hearing court and circuit. The full-volume oracle's wrong status assumption is corrected too.

The other report variants keep their existing source choices. Row inclusion, active default, latest-overall selection before period filtering, date/ID ordering, archive handling, current party relationships, authorization, export engine and Cairo-time behavior remain unchanged. There is no fallback to a matter court, an older hearing, or a raw legacy string.

The literal regression's saved pre-fix observations fail and its post-fix observations pass for all six cases: differing court pairs, null matter values, null latest values despite older populated data, empty latest circuit, undated hearings, and no hearing. The test also covers equal-date ID ordering, an archived latest hearing, and exclusion rather than substitution when the latest hearing falls outside the requested period.

Independent recomputation from all 38 delivered matter traces selects the same hearing IDs as the corrected export oracle. **36 rows now have a court; two matters with no hearing (3106 and 3288) correctly remain null.** Saved corrected PDFs visually demonstrate the changed court cells.

## T62-O2: the count is explained, but data questions remain

| Question | Established result | Status |
|---|---|---|
| 38 web rows versus 10 Access rows | 38 distinct current active matters; all ten Access matters are present. Retained selected-matter + report-marked hearing + nonempty-decision rules reproduce precisely the ten-matter Access set. A retained variant without the matter-selection condition produces 15. | Explanation verified; no count correction was implemented or authorized. |
| 28 additional web rows | They satisfy the adopted current criteria, which replaced legacy manual flags. Their inclusion is not proof of an import duplication. | Keep unless the owner changes the report-selection contract. |
| Blank opponent/client-party cells | 21 opponent cells and eight client-party cells correspond to 29 retained unresolved `unreviewed_party_role` quarantine entries. Original combined text and source identities remain available. | Open; nine source role spellings need explicit approved mappings/definitions and a bounded repair proposal. |
| Case 933/2025, matter 3310 / legacy 1717 | Web chooses the 2 August expert action (hearing 470 / legacy 15769); Access's 30 July date corresponds to the report-marked hearing 9273 / legacy 15768. | Explained by latest-overall versus report-marked selection; no lost hearing established. |
| 17316/141J with 6214/2022, matter 3269 / legacy 1671 | Web retained date 10 May; PDF 9 September. | Open: the PDF date is absent from the retained affected hearings. |
| 932/2025, matter 3311 / legacy 1718 | Web retained date 22 July; PDF 23 September. | Open: the PDF date is absent from the retained affected hearings. |

The 38 matter IDs and 331 hearing IDs are unique in the bounded reconciliation. The delivered comparisons report unchanged staging/initial/current values for the affected fields, 331 hearings and 140 initial matter/party/role records. Raw private database snapshots and full Access bodies were not independently available here; the reviewer recomputed the claims that can be checked from delivered bounded rows and source code.

Neither retained Access derivative is proven to be the source that generated the September PDF. Later Access activity is plausible, not established. The exact generating object is also not proven solely by matching the ten-matter set. Do not overwrite dates or decisions from a PDF, silently release quarantines, reuse immutable legacy flags as a current workflow, or rerun a global import. D43's later differential cutover remains separate.

## Independent checks performed here

- All **6,199** ZIP members independently matched the separate manifest: safe unique regular-file paths, exact member sizes/CRC/digests and 84,187,215 uncompressed bytes. The five companion file identities are recorded in the JSON proof.
- The inspected standalone verifier passed a fresh receipt-inclusive run; wrapper/core/receipt bindings are consistent.
- Reviewer-created Git objects/index independently reconstructed both source trees and applied/reversed the complete seven-file patch with Git. The base exactly matches the previously reviewed published source. The final inventory has 913 tracked identities / 911 supplied bodies, with 906 pre-existing identities unchanged. Two protected configuration bodies remain identity-only.
- TASKS bytes and all 86 checkbox lines, AGENTS/CLAUDE, all 73 migration files and the historical acceptance-matrix prefix are unchanged. The prior HOLD review is imported verbatim, preserving the earlier missed defect as history.
- Fresh build, full-check and final browser records bind all 911 shareable final Windows source bodies. Six reused run records match their original delivery, with unchanged contracts distinguished from the changed status code. The reported fresh 3,864 comparisons and 148+15 gates are present. Windows builds/database suites were not rerun in this review environment.
- All **16 saved files** across four roles and two clients were inspected independently: eight XLSX files with exact ordered typed-cell and visible-sheet comparisons, Cairo timestamps, RTL, no formulas/external links/macros; eight PDFs covering **24 pages**, with all-page bounds/font/header-asset and content-coverage checks. Representative client-245 first/last pages and literal-fixture page were rendered and visually reviewed. These checks support the narrow correction, not approval of the current UI/report design or universal accessibility conformance.
- The supplied fixture accounting distinguishes 107 new events, including five completed-but-unsaved PDFs, from the 16 saved inspected files. The initial download-observation/transport failures remain recorded; their root cause is not proven. No product fix is inferred from a successful retry.
- Supplied negative-verifier evidence contains 28 rejected malformed/tampered cases. This is reviewed implementer evidence; the reviewer did not independently rerun all 28 cases.

## Owner preservation and stop

Five concurrent `client-status` previews (events 920–924) reconcile the owner audit count from 919 to 924. They used an existing account/session; personal attribution is not confirmed. Supplied comparisons preserve the other 139 tables, all 48 sequences, accounts, business data, catalogs and migration ledger. A subsequent quiet-window equality is against the explicitly reconciled 924-row state, not a claim that no audit events occurred throughout the run.

The original seal and failed attempts are retained. Disposable fixture cleanup is evidenced; the accepted owner process was not restarted. Protected source, prior delivery, logo and specified artifact coverage are bounded; this review makes no new universal filesystem-preservation claim.

**Next:** resolve the owner's report-selection expectation, prepare the exact-ID party-role repair for review, and obtain bounded source evidence for the two date differences. Keep the valid local court correction. Any data repair or activation needs its own concrete reviewed mandate. Preserve the agreed sequence: correctness and review, then UI design/refinement, then Task 6.3. Execution remains in the SAME Codex Desktop task, Local Windows, no subagents.
