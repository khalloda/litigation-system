# Task 6.3 — independent implementation review

Date: 30 September 2026. Disposition: **CHANGES REQUESTED — T63-R1, T63-R2 and T63-R3.**

The delivery is authentic to the supplied source chain and its integrity checks pass. It is not yet an independently accepted implementation. Keep owner migration, activation, acceptance closure and publication stopped. The three approved business decisions remain adopted; none needs reopening.

## Reviewed identity

| Item | Identity |
|---|---|
| Published base | `9f50f3b8061b5680a943902f7aa1339b1797581a` |
| Final candidate | `369fc987e54d5735b08317aa8985f6dcba21d57c` |
| Parent | `2bb33d06a659afc6a77ae79bc2546f9849ea5e41` |
| Candidate tree | `45bd91e9be7e6570d7a647700d9025f302ad63a1` |
| Tested application build | `4p2pqrIVKB_RMz5W2_PuL`, from `2bb33d06a659afc6a77ae79bc2546f9849ea5e41`; final child is documentation only |
| Input ZIP | `task63-implementation-review.zip`, 172,815,894 bytes |
| ZIP SHA256 | `e55f4b28ef52dff426e77ae4a49744d73b2a1228429a2901b6c00e7d9abce1a8` |
| Latest owner migration evidenced | **75** |
| Pending candidate | `20260930080000_closed_report_selection` (**76**, isolated testing only) |
| Candidate migration SHA256 | `0a1a88828bfae5ef9c471e6c96be79bbad349f758f87f017ace3db0591a463ed` (18,248 bytes) |

The preserved local chain is:

`9f50f3b → cfb04a0 → d302e3a → 8e0c3a7 → e8ba9fb → 05fdc4c → 9af8f17 → 2bb33d0 → 369fc987`.

## Required corrections

### T63-R1 — exact percentage rounding

**Priority: P2.** `src/lib/reports/matter-outcome-summary.ts`, `summarizeMatterOutcomes`, calculates the displayed share using `((100 * good) / favourable).toFixed(2)`. This permits binary floating-point rounding to disagree with the exact count-based rounding convention used by the committed independent oracle.

A fresh reviewer probe executes the exact candidate reducer body, with 4,000 favourable hearings and 41 credited to a lawyer. The exact percentage is 1.025%. The committed test's integer rounding convention gives **1.03%**, while the implementation returns **1.02%**. This is within the engine's supported volume. The result affects preview and both exports because it enters the canonical result. It does not mean the supplied 512-denominator fixture output was incorrect.

Use exact integer/rational rounding from the integer counts at the final two-decimal display boundary. Preserve the approved denominator, full credit, person deduplication, Unassigned handling and null at a zero denominator. Add the reproducer and nearby non-tie/tie cases, plus the existing overlap and zero-denominator cases. Do not change this into fractional credit or a win-rate metric.

Evidence: `independent-summary-probes.json`, `work/probe_summary.cjs`; the source SHA256 is recorded in the result. The 1/1 and 1/3 cases pass; 41/4000 demonstrates the defect.

### T63-R2 — omitted embedded graphic in the general judgment report

**Priority: P2.** The supplied direct Access definition for `rptJudgmentsForAgainst` includes an embedded `Form.رسم بياني صالح-ضد` in its ReportFooter. `evidence/access-definitions/InspectReport2.txt` identifies the footer at line 6082 and the control at lines 6239–6258. The control has no hidden/display-only override in that block. Its form's retained record source is `صالح-ضد`; the supplied query definition uses the same Text106/Text108 hearing period and non-NULL outcome population as the parent report.

The candidate `matter-judgments` descriptor has no chart configuration, and its canonical data contains only the detailed hearing groups and totals. The shared renderer therefore emits no chart. Its saved 166-page PDF ends with the counts and no embedded graphic. The chart in the separate `matter-outcome-summary` report does not reproduce the parent report's own nested content. The finite semantics map currently leaves this dependency out.

Complete the source trace for the embedded control and restore its required outcome graphic within the general judgment report, using the same canonical filtered hearing population and an accessible numeric equivalent. Preserve every detail row, outcome distinction and existing total; chart data must not inflate the hearing count or consume the preview budget as extra hearings. Keep full export data independent of the 50-row preview. Document the source-to-output mapping and check both zero and populated cases. Reuse the accepted chart presentation and retain complete numeric values in XLSX; a new chart engine or a new standalone report is not required. Confirm the visible PDF chart, labels and page placement. If a source property genuinely establishes that this control was non-printing or excluded, provide that precise evidence and reconcile the omission explicitly rather than relying on its name.

Evidence: `independent-source-coverage-finding.json`, the full direct Access definition and query/form properties, candidate descriptor, and `pdf-pages/0-matter-judgments-p166.png`.

### T63-R3 — mixed-direction matter label reverses the visible case number

**Priority: P2.** `src/lib/reports/options.ts` combines the case number, an Arabic client name and the stable ID into one plain label. `src/lib/reports/pdf.ts` renders that combined label in a single bidi span. The Arabic text changes the direction of the numeric slash-separated identifier in the filter summary.

For matter **1698**, the canonical case number and its separate record field are **`1 / 2010`**. The saved hearing-history and file-cover PDFs visibly show **`2010 / 1`** in the combined matter filter line, while the record field below shows `1 / 2010`. The native multiline identifier in `0-native-history.pdf` also runs into the Arabic client/ID label in that filter line. This is a visible presentation defect, independent of PDF copying or search.

Keep the case identifier, client name and stable ID directionally isolated as separate display pieces wherever this new combined matter label is rendered. Preserve their exact source values, line breaks and identity; do not repair stored data, reverse strings, replace the case number, or add controls to canonical business values. Do not force an entire Arabic/mixed identifier into an inappropriate global LTR layout. Check the real case 1698, the native multiline `TEST ONLY TASK63 001\n140J / 140ق` example, leading-zero/slash identifiers, Arabic marks, missing values and a long client name. Confirm the PDF filter line and record field agree visually; test affected browser/Excel presentation while retaining exact typed XLSX values.

Evidence: `independent-pdf-visual-review.json`, `r3-filter-label-evidence.json`, and the freshly rendered first pages of the history, cover and native-history PDFs. This finding uses visible raster output and the saved canonical JSON, not PDF text extraction.

## What passed this independent review

- All **10,700 ZIP members** matched the separate manifest's exact paths, sizes, hashes and ZIP metadata. Safe-path, duplicate, CRC and encryption checks passed. The supplied receipt-inclusive verifier reran successfully. Package PASS establishes integrity, not application acceptance.
- Independent native Git checks reconstructed **all nine trees/commits**, every supplied shareable blob, **all eight individual patches in both directions**, and the cumulative patch in both directions. The complete base identity map matches the previously reviewed published base. The final tree has 988 tracked identities, with 986 shared bodies and two credential-bearing bodies intentionally omitted.
- The original and continuation prompts match the previously prepared authorities byte for byte. The source map accounts for all 45 top-level catalog entries; T63-R2 concerns omitted nested content, not a missing catalog row.
- The closed selection design has a separate table, history, receipt pool, gateway and purpose-bound payload. Selected mode reads the exact saved hearing; All mode selects latest overall before applying the date period. Client selections and their accepted active-only contract remain separate. Empty new choices are not seeded. Reopened/incomplete choices block Selected output instead of falling back to All. Archive state is distinct from business status.
- Migration 76 is additive: three new empty tables, seven functions and bounded constraints/triggers/grants/audit classification. It adds the cross-purpose token guard without rewriting migration 74 or the existing gateway. Source review covered direct-write denial, fresh session authority, version checks, exact retry receipts, deferred history/audit consistency and hearing-parent membership. No migration correction is required by the three findings above.
- Fresh reviewer decoding checked **30 saved final XLSX files, 29,052 exact typed cells**, matching their ordered packaged oracle outputs; RTL views, no formulas/external links, visible values and Cairo metadata passed. All 30 corresponding PDFs were inventoried for page count/orientation. Native 52-row history exports retain rows beyond the 50-row preview.
- **17 PDF pages across eight saved files** were independently rendered with Poppler and visually inspected. This covers all six layouts, both closed modes, native history, long judgment continuation, the historical partner label, totals, repeated headings and charts. T63-R3 was found in those samples. This is not a claim that every page was inspected.
- The packaged fixture event window independently recounts **545 events**, IDs 1062–1606: 45 record updates, 55 creates, four password resets, four password changes, 13 successful logins, 255 report executions, 165 completed exports, two archives and two restores. There are 89 previews and 166 export attempts, including one retained failed export; the completed saved-export count is 165. The detailed reconciliation explains setup, native records, selection changes and retries.

## Implementer evidence reviewed, not rerun as live tests here

The final build/full checks, 480 permission decisions and account-state tests, 62 contract cases, 148 historical plus 15 setup database gates, 1,908 closed-report comparisons, four summary periods, 142 judgment comparisons and 3,490 history/cover comparisons were inspected in the package with their source/build bindings. The final browser run covers seven report/mode cases for four genuine fixture roles, with 56 files; a native-history/cover supplement supplies another four. Earlier final-flow/editor proofs have explicit unchanged-source reuse bindings.

Private database/recovery bodies are intentionally absent. This review inspected the capture/comparison code, bounded results and identities; it did not independently rerun Windows, PostgreSQL, authentication, UI automation or recovery restoration. The retained 20 package-tamper tests were reviewed; they were not rerun here. No universal accessibility or screen-reader certification is claimed.

## Owner state and next boundary

The final receipt observes the owner database at **08:31:43 UTC / 11:31:43 Cairo, 30 September 2026**: migration 75, 145 tables, 48 sequences and 1,061 audit rows, with complete equality reported. At **08:31:36 UTC**, process/listener enumeration succeeded, no owner listener/process was present and port 3000 HTTP was refused. The retained build ID is an artifact identity, not proof of a running app. Do not restart it to make the review state look healthy.

The owner separately authorized Docker startup/read-only verification after the Desktop update; the background Docker update is documented. That limited infrastructure exception is not permission to migrate or start the owner web app. The exact isolated test resources were cleaned up. Recovery remains local and does not protect against laptop/disk loss.

Keep the full local chain and original five files unchanged. Correct T63-R1–R3 as child commit(s), obtain fresh evidence only for affected behavior, retain useful source-bound reuse, and return a new five-file correction delivery for independent review. Keep migration 76 unmodified unless a separate concrete defect is discovered and explained; it remains unapplied to the owner. Preserve TASKS and all 86 checkbox lines, migration 1–75 bytes, governance, fonts, dependencies and the nine client reports.

**No owner migration, seeding, repair, activation/restart, acceptance child, push or Task 6.4 is approved by this review.** R4 copying remains an accepted limitation, not fixed; search remains uncertified. No copying/search diagnosis is requested.
