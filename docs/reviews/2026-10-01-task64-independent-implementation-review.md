# Task 6.4 — independent implementation review

1 October 2026. **Disposition: CHANGES REQUESTED — one bounded display correction, T64-R1.** Package integrity passes. This is not implementation acceptance or authority to migrate, activate or publish.

## Reviewed identity and scope

| Anchor | Exact identity |
|---|---|
| Published base | `2d9a7c48a1633e38015f0de80e13a98049c64951` |
| Final application-source child | `d4ee1d9d1055ba805e9e6b6d9d7a19bf961cfab3` |
| Delivered candidate | `58bad390ef75574785fcc5a4f85685985ed0f397` |
| Candidate parent | `d4ee1d9d1055ba805e9e6b6d9d7a19bf961cfab3` |
| Candidate tree | `347bb914a515cccf7b87bf4f34792dcd058868b7` |
| Reported isolated final build | `dV6wkGfF2-SxHassEZNGj` |
| Owner / candidate migration | 76 / 77; candidate 77 was tested only in isolation |

The complete nine-anchor/eight-child chain, original implementation mandate and approved continuation were reviewed. All four adopted business decisions remain approved; none needs to be asked again. The review covered six new report IDs, the new lawyer-purpose selection workflow, forward migration 77, the historical-reviewer accessor, affected shared rendering/UI/checkers, actual saved outputs and preservation/accounting evidence.

No Windows repository, remote, owner database or app was contacted or modified by this reviewer. The attached source and evidence were examined locally. Private database/recovery bodies remain on the owner's machine; their supplied comparisons were assessed with their helper code and exact evidence bindings, not independently rerun against those bodies.

## T64-R1 — isolate the matter identifier in the new selection-detail context

**Priority: P2. Fix before Task 6.4 acceptance.** Location: `src/app/reports/lawyer-selection/page.tsx`, the direct-child `p.hint` below the heading, in the `id !== null` detail context.

The page concatenates the Arabic client name, client ID, case number/subject and matter ID into one ordinary right-to-left paragraph:

```tsx
{model.name} ({client})
{id !== null
  ? ` · ${model.matters[0]!.caseNumber ?? model.matters[0]!.subject} · ${id}`
  : ''}
```

That paragraph has neither directional isolation for the identifier nor preserved line breaks. It bypasses the existing `ReportLabelParts` / `reportLineDirection` solution introduced for the same class of display problem in Task 6.3. In the ordinary RTL paragraph, the canonical number `1 / 2010` has visual numeric order `2010 / 1`. The synthetic identifier `دعوى اختبار\n001 / 2026` loses its line break and puts the numeric run in the order `2026 / 001`. `933/2025` is a useful passing control; the slash without surrounding spaces behaves differently.

**Real-use effect:** while choosing the hearing to save for a matter, a user can read a different-looking case number in the page context from the number in the list or report. The underlying IDs, save payloads and stored data are not changed by this display defect. It still matters because this screen is where a deliberate report selection is made.

**Evidence and its limits:** the exact JSX and applicable global/module CSS were inspected. `review-evidence/label-probe/bidi-result.json` independently records FriBidi's Unicode RTL ordering for the literal context and isolated numeric controls. These are synthetic strings, not assertions that matter 1698 belongs to client 245. The local browser reproduction script could not launch because this reviewer environment has no Chromium executable; no fresh full-application browser reproduction is claimed. Codex must capture the actual affected route before and after the fix with its installed isolated browser. The selection-list cells already have `unicode-bidi: plaintext` and preserved whitespace; this finding does not allege that their existing per-line behavior is broken.

**Recommended correction:** render the client, canonical case number/subject and stable matter ID as separately labelled, isolated values using the existing helper, retaining each identifier line. Keep the original strings, database values, URLs and numeric IDs untouched. The detail context must agree with the existing list and report selector for the same record. Handle a missing case number through the established subject/null display rules; never print the JavaScript string `null`.

This is a small page-level correction plus focused browser regression evidence. It needs no migration change, new dependency, report-query change or repeat of the full export campaign. A reasonable implementation/test effort is about one focused work session; the actual build and fixture startup time will determine the elapsed time.

## What passed this independent review

| Area | Evidence assessed and conclusion |
|---|---|
| Delivery integrity | Receipt-inclusive supplied verifier rerun passed. Independently checked all 3,961 ZIP member paths, sizes and SHA-256 hashes. |
| Native Git | Independently hashed all nine commit anchors, reconstructed native trees and applied all eight forward and eight reverse patches with complete source-body comparisons. Final 1,012 tracked identities match; the two deliberately omitted configuration bodies remain identity-bound. |
| Approved report meanings | Six new IDs correctly map the eight source entries, including A/copy consolidation and the nested principal summary. Retained/current Access meaningful report properties agree in the supplied trace. |
| Comprehensive versus curated populations | Five affected reports expose All by default and a distinct lawyer-purpose Selected mode. Client and closed choices are not reused. Empty Selected does not become All. Invalid applicable hearing selections fail before the date predicate, without silently choosing a later hearing. |
| Hearing and date meaning | The four position-style reports use latest overall in All and the deliberately saved hearing in Selected. New-matter distribution uses the matter start date and allows matter-only selection. Upcoming retains its next-hearing-date population and hearing-level grain. |
| Court/circuit meaning | Principal/all/current-position use the corresponding hearing's court/circuit without a matter fallback. Supporting B deliberately prints the matter's court/circuit, matching its retained Access textbox expression and explicit column label. This is an approved source distinction, not a recurrence of the client-status court defect. |
| Historical reviewer | Stable-key, bounded privileged accessor returns the preserved historical reviewer/state without granting raw provenance access. Missing historical source/team information does not remove an otherwise valid report row or invent current responsibility. |
| Summary | Complete parent population; distinct current lead/co-lead attribution; overall matter total unduplicated; supporting roles not promoted; overlap and unassigned treatment explicit. |
| Selection and migration | Separate current/history/receipt storage; explicit Save; role/session/actor/version/archive/membership checks; exact retry/no-op behavior; three-purpose UUID protection including concurrent attempts; narrow grants, immutable history and deferred correspondence guards. No confirmed logic defect found in the reviewed migration and evidence. |
| Initial migration state | Lawyer selections/history/receipts start empty. The 13 initial scope-registry entries identify existing client/closed retry receipts; they are not imported or seeded lawyer selections. Migrations 1–76 remain exact. |
| Checkers | Forward-77 extensions retain explicit migration/function/trigger/constraint/index/privilege/invariant checks. Historical conditions were not simply disabled to get a pass. |
| Actual spreadsheets | Independently decoded all 34 continuation workbooks: 19,136 typed cells, complete ordered rows, visible typed values, per-label totals, modes/filter metadata, RTL, absence of formulas and Cairo generation times match the supplied independent full-result oracles. |
| Preview/output completeness | Saved previews are exact 50-row prefixes with full totals; the 67 saved continuation outputs reconcile to 34 workbooks and 33 PDFs. Saved bytes and operation identities are bound to the browser evidence. |
| Existing client regression | The client-245 Selected output still contains the ten saved choices. All and Selected are tested as distinct populations. Additional isolated native records explain differing All totals; no hard-coded old 38-row total is used to manufacture agreement. |
| PDF visual sample | Independently rendered/inspected 20 selected continuation pages and two original upcoming pages, including long continuations, final totals, empty Selected, all five new layouts, client Selected, closed Selected and the judgment chart's 63/17 split over 80 rows. PDF structure and bundled font checks cover all 33 continuation PDFs. This is sampled, not every page. |

The supplied final build/project checks, 480 permission decisions, 858 family comparisons, fresh 141 upcoming comparisons, isolated 148+15 database gates and four-role browser workflows are valid source-bound evidence within their documented limits. They were reviewed, not all re-executed in this Linux review environment. Original upcoming browser/edge evidence, deeper unchanged security checks and accepted-report regressions remain explicitly identified as reused.

### PDF raster diagnostic, not an additional correction request

Some first-line note glyphs appeared clipped in a particular Poppler render, and a different raster scale affected MuPDF/PDFium samples. Fresh renders of the same sealed bytes show the complete notes. The saved Windows renders also show them. This review retains that diagnostic and does not assert a confirmed source/layout defect, universal viewer compatibility, or an Acrobat test. No font/renderer change is requested on that evidence. PDF copying remains an accepted limitation, not fixed; search remains uncertified. Neither diagnosis was reopened.

## State and accounting boundaries

The final supplied receipt observes the old accepted owner app at **30 September 2026 22:33:04 UTC / 1 October 01:33:04 Cairo**, PID 68632, build `_RzjAkHqwy8M9tcZ9AF2I`, loopback port 3000. The subsequent supplied database observation at **22:34:53 UTC / 01:34:53 Cairo** records migration 76, 148 tables, 48 sequences and 1,094 audit events with complete equality. These are dated observations, not fresh owner access or a continuous-uptime assertion by this reviewer.

The supplied isolated accounting closes at migration 77, 152 tables, 48 sequences and 1,362 audits: exactly 268 additions from the 1,094 baseline. It distinguishes 43 previews, 69 export executions, 68 completions, 67 saved files, one completed PDF whose response was not saved, and one rejected render without completion. Other setup/mutation/authentication events are separately reconciled. Unsaved bytes are not claimed as inspected. Fixture cleanup, prior recovery/evidence preservation and unchanged TASKS/86 checkbox lines are bound to the receipt and scripts.

The candidate remains local, eight commits ahead of the recorded unchanged remote, with a reported clean working tree. No owner migration 77, repair, provisioning, seed, activation, acceptance closure, push or Task 6.5 has occurred under this review.

## Next action

Continue in the same Local Windows Codex Desktop task using `task64-r1-correction-prompt.md`. Preserve the delivered candidate and all evidence. Make a local child for T64-R1, collect focused route/layout tests, reuse unchanged report/migration/security/output evidence with exact bindings, and return the five-file correction package for independent review. Keep activation and publication on hold until that review passes.

No further business choice is requested. This hold addresses a concrete identifier display defect; it does not reject the approved report-selection design or require repeating the Task 6.4 implementation.
