# Tasks 6.5–6.7 — independent correction1 review

Reviewed 2 October 2026. **Disposition: CHANGES REQUESTED — T6567-N1 only.**

T6567-R1 passes independent review. Its local correction should be retained. T6567-N1 remains a release blocker: this correction did not reproduce the intermittent delivery failure, establish its cause, or demonstrate a transport fix. Integrity verification is not implementation acceptance or permission to activate.

## Exact reviewed checkpoint

| Item | Identity |
|---|---|
| Published base | `186fd91d4528ac4da480a0699bd0fd44b4fb4749` |
| Correction base | `09465c4b65e76baf7d72d6c92c4493169fe62947` |
| Application correction | `6cfd0d94a5d179d1f846cf45e4fda79d20a20a5f` |
| Final candidate | `7a8a40192b32cb29ddcd48bf97dae1cb35687369` |
| Final parent | `6cfd0d94a5d179d1f846cf45e4fda79d20a20a5f` |
| Final tree | `8d56171f76fd83607abf81e1c9fe29b6283bac77` |
| Tested correction build | `fEIeuN6no02Rs3FWiePFN` |
| Correction ZIP SHA-256 | `603489968a64aaad2a625894bd9b30438720e3c83fab7405326526210d63f5bb` |
| Owner / candidate migration | 77 applied / 78 isolated only |

The two correction children preserve the previous eight local children. Six paths differ from correction base: the administrative-selection editor, its focused browser regression, README, acceptance matrix, imported independent review and correction report. The only application edit replaces the same-route Next Link with an ordinary anchor and removes its unused import. Migration SQL, reporting/selection services, permissions, dependencies, renderers, fonts and TASKS remain exact.

## Findings

### T6567-R1 — PASS / closed for this reviewed source

The unchanged candidate's actual fixture browser records reproduce the defect for hearing and step choices. Confirming Reload produced no document navigation and retained stale draft/version state; the next Save was refused again. This goes beyond the earlier source-only finding.

The anchor correction triggers a document reload while retaining the established dirty-navigation confirmation. The final built-app evidence contains 18 passing cases: hearing/step conflicts; cancellation retaining drafts; accepted reload fetching current state without writes; an explicit subsequent Save with one effect; unrelated drafts surviving Save; parent and record version conflicts; exact-submission retries after simulated response loss; and all four roles' hearing/step affordances. The response-loss tests distinguish a completed save from a missing response and verify no duplicate receipt/history/audit effect. The narrow-width hearing case includes keyboard activation. These are supplied Windows fixture executions reviewed here, not rerun by the reviewer.

The corrected source, test, build identity, request logs and state accounting agree. No further R1 change or repeat of the entire campaign is required unless the next patch affects this boundary.

### T6567-N1 — BLOCKED / cause unestablished

| Evidence set | Completed exports | Saved | Completed but unsaved |
|---|---:|---:|---:|
| Original implementation | 206 | 202 | 4 |
| Correction1 | 30 | 30 | 0 |

Original unsaved fixture audit IDs remain `1287`, `1378`, `1383`, `1744`. The original and correction campaigns are different observations; later success does not convert any earlier failure into a pass.

Correction1 contains 24 genuine UI downloads (12 with the earlier launch settings, 12 with a normal launch plus task-only diagnostics) and six explicit fresh-connection HTTP downloads. The latter are useful controls, not browser proof. All 30 saved files match their recorded export identities. The fresh-connection branch report includes one new R1 fixture matter; this population change is disclosed, so it is not an identical-payload comparison. Document 393 and client-10 POA populations are unchanged.

The retained browser failure is `ERR_INVALID_HTTP_RESPONSE` (`-370`), not merely a test waiting too briefly for a file. The strongest retained trace associates document 393's PDF with a reused connection after preview and XLSX traffic, receiving binary data where the next HTTP response header was expected. This localizes an observation at the response boundary; it does not establish which component caused it.

The correction's `Socket.write` hook reports valid header prefixes for 18 instrumented successes, 12 on reused connections and six on fresh ones. It records write sizes, hashes and 32-byte prefixes, not a complete independently reassembled transport stream. Its analyzer groups writes between request events; that does not independently validate all preceding response bodies, pipelining/overlap, compressed lengths, chunk termination, or the next response boundary. Synchronous logging may change timing. A Node response `finish` event does not prove client receipt. The supplied limitations are appropriate; these observations cannot close N1.

**Next step:** one capped N1-only diagnostic round. First analyze the retained failure streams and exact preceding traffic without new exports. Then, only as needed, compare the real application response with a task-only Next response serving fixed PDF bytes under matched navigation/prefetch and connection conditions. Correlate complete framing, generated-byte hashes, server observations and browser receipt. Treat prior-body spillover, response framing and observation-layer gaps as hypotheses, not diagnoses. Maximum 20 explicit delivery attempts, including controls and any post-fix checks. Stop if unreproduced or unexplained; do not start another automatic loop or weaken acceptance. The accompanying prompt defines scope and stop conditions.

## Fresh reviewer verification

- Safely verified all 3,587 ZIP members, their sizes, CRCs and SHA-256 identities, and the five delivered files. Adopted prompt/context and imported earlier review match their sealed inputs.
- Reviewed and reran the supplied receipt-inclusive verifier. It correctly returns integrity PASS with implementation still blocked on N1.
- Independently reconstructed 11 native Git anchors and verified ten incremental patches plus the complete patch in both directions. Final source inventory: 1,050 identities, 1,048 supplied bodies; `.env.example` and `docker-compose.yml` remain identity-bound omissions. Previous accepted/candidate anchors and protected source identities match.
- Independently decoded all 15 saved XLSX files: 3,141 complete typed values plus visible values, row counts, totals, metadata, Cairo time, RTL and absence of formulas against the supplied result models. The 36/37-row branch distinction is explicit. No fresh reviewer SQL query was run.
- Independently parsed all 15 saved PDFs for page geometry/font/card structure, freshly rendered seven pages with Poppler, and visually inspected those pages. The three reviewed report layouts retain readable Arabic, dates, repeated headings, totals and movement-card fields. This is sampled visual review, not every page or copying/search certification.
- Matched all 30 saved files to the supplied audit/accounting identities; checked 129-event arithmetic and the final 18-case R1 result against its test source and preserved attempts. Supplied fixture totals are 1,134 → 1,263 audits, 33 selection requests, 19 changed receipts/history rows, ten native fixture mutations and 30 exports.

Full Windows build/project checks, pristine/final 148+15 gates, unchanged migration-78 upgrade checks and private-state comparisons are supplied evidence inspected for consistency, not fresh executions by this reviewer. Broader report/security evidence remains explicitly reused with unchanged source/dependency bindings. No new blocking finding was identified in this bounded correction review.

## Owner preservation and limits

The owner's confirmation that archiving hearing **11003 around 15:50 Cairo on 1 October** was his action is present verbatim in the correction evidence and final receipt. Preserve that archive. This resolves that action's personal attribution only; it neither authorizes new mutations nor attributes unrelated historical report activity.

The supplied post-package owner snapshot at `2026-10-01T23:22:11.122Z` reports exact correction-baseline equality: migration 77, 152 tables, 48 sequences and 1,134 audit events. The runtime observation at `23:22:08.5281394Z` reports accepted Task 6.4 build `_ehqxQr_3RiIGEhysOBbY`, PID 12052, port 3000, login HTTP 200. These correspond to approximately **02:22 Cairo on 2 October**, and are dated observations, not present or continuous uptime. No reviewer connection to that Windows app, database or remote repository was made.

Supplied cleanup/preservation records retain recovery, prior evidence and the accepted artifact while removing the exact disposable resources and temporary credentials. Private recovery/state bodies were not supplied and are not independently rehashed here. Secret-exclusion evidence is supplied; the reviewer does not possess the private credential pattern set.

PDF copying remains an accepted limitation, **not fixed**; search is uncertified. Do not reopen either investigation. Owner migration 78, selection seeding, Access synchronization, activation, acceptance closure and push remain withheld. No later task is authorized by this review.

## Technical references for the next diagnostic method

- Chromium's maintained [network error definitions](https://chromium.googlesource.com/chromium/src/+/main/net/base/net_error_list.h) identify `INVALID_HTTP_RESPONSE` as `-370`. This explains the recorded code, not its cause in this application.
- [RFC 9112, sections 6.3, 7.1 and 9.3](https://www.rfc-editor.org/rfc/rfc9112.html) define message length, chunk completion and reuse of persistent connections. Validate complete ordered message boundaries rather than treating individual socket writes as HTTP messages.
- Node's [ServerResponse finish documentation](https://nodejs.org/api/http.html#event-finish_1) distinguishes transmission to the operating system from client receipt. Bind runtime diagnosis to the actually installed versions; this review recommends no version upgrade.

Reference retrieval date: 2 October 2026. These sources do not establish a framework, browser or operating-system defect in the retained incident.
