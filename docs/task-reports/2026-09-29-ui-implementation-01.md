# UI Implementation 01 — local candidate, review blocked on PDF Unicode

This is implementation evidence, not owner acceptance or activation. Base:
`2932f9e468a73cb783825d959322c8d9ec07ea9f`. The owner adopted the 28 September
UI Implementation 01 prompt and approved direction 2, UI02/UI03 workflows and
Noto Sans Arabic for UI and ordinary/audit PDFs. Task 6.3 remains outside scope.

## Result and blocking limitation

The local candidate implements the shared authenticated shell, compact dashboard
and detailed analytics, matter list/reading pane, contextual client reports,
saved-selection presentation, representative editor draft protection and shared
audit/control styling. All 71 existing page routes remain. Business queries,
report definitions, permissions, migration 75 and TASKS are unchanged.

**The implementation is not complete or ready for acceptance.** P01/P05 fail:
actual application Chromium PDFs render Arabic correctly in inspected samples,
but independent PyMuPDF and PDFium extraction/search do not recover the known
Arabic strings exactly. The small `font-probe-static.pdf` contains the expected
words `إبراهيم` and `ثانٍ`; their exact searches fail. Decoded text has reordered
Arabic runs, inserted spacing and altered combining-mark order. Complete Unicode
coverage and embedded fonts do not establish correct copy/search behavior.

The variable font initially produced Type3 PDF fonts. Complete static 400/600/700
instances resolve that embedding issue and yield embedded TrueType fonts, but
not the Unicode failure. A separate probe of the unchanged accepted Noto Naskh
renderer also fails the same exact PyMuPDF searches. Both have Chromium/Skia
`ReversedChars`/`ActualText` marked content. This isolates the remaining failure
to the PDF text representation/consumer boundary; it does **not** establish the
precise upstream defect or excuse the new acceptance requirement. No rasterized
body, invisible text duplication, text normalization, renderer replacement or
silent old-font fallback was introduced.

The local PDF-viewer browser opening was rejected by the platform URL policy,
which expressly forbade a workaround. No alternate browser/HTTP opening was
used. A factual manual viewer search/copy request remains unanswered at this
checkpoint. Recommended next bounded investigation: compare that concrete sample
in the owner's PDF viewer with its stored expected strings, then isolate the
Chromium marked-content/Unicode mapping behavior before choosing a focused
renderer change. Preserve this UI candidate and failing artifacts for independent
review; do not accept or deploy on rendering screenshots alone.

## Implementation choices and preserved contracts

- `layout.tsx` constructs only permission-filtered navigation and account labels.
  Page, service, action and export guards remain independent. The existing logout
  action moved to a dedicated module with its exact authorization inventory entry.
  More exposes existing secondary modules; mobile menus support Escape/focus return.
- `/?view=analytics` is an authenticated URL-backed presentation of the existing
  six services. Request-scoped React cache shares Today/Open/Workload reads between
  summary and detail. Hearing previews retain 25 rows inside disclosures. Top-client
  ties, all workload categories, outcome unknowns and incomplete current-year labels
  remain accessible. No mock numbers or new metric were introduced.
- `/matters?selected=<id>` reuses the guarded complete matter detail presenter.
  Canonical record URLs, all filters/paging and record relationships remain. Mobile
  uses one pane; returning restores selection focus and captured list scroll. The
  mock next-hearing block was replaced by the existing hearing-history navigation.
- Client IDs prefill only report definitions supporting client parameters. The
  global contacts report stays global. Form opening does not execute a report.
  Reference search retains the selected actual ID. All-active remains the default;
  Selected mode remains limited to the two accepted definitions.
- Selection explicitly distinguishes saved choice, draft and latest first-page
  hearing. Save/version/UUID/no-op/conflict semantics are preserved. Checkbox/radio
  edits never save. Client/matter/selection drafts warn before application-link
  navigation and logout; browser/tab unload uses the native warning. Browser
  history itself is not intercepted as an application-controlled link.
- Audit filters, typed values, UTC semantics and the separate persisted export
  capability remain. Only CSS and PDF assets changed. Billing remains read-only.
- The official complete variable Noto Sans Arabic source serves UI weights. Three
  complete static instances serve PDFs. Licence, source commit, derivation and hashes
  are recorded in `public/fonts/noto-sans-arabic-provenance.json`. Audit now uses the
  same deployment-owned absolute asset-root checks as ordinary PDFs. Resource
  blocking and font/image load failures remain enforced. Excel styling is unchanged.

## Fresh verification and honest coverage

Task evidence root: `test-results/ui-implementation-01-20260928T191928Z/` (ignored).
Final tested application build: `5fgsdBEDak2irJV_6Ox1a`. Changes after that
build are documentation and formatting of the client read-only checker only; application runtime sources are unchanged. Exact canonical/working identities and final check
bindings are included in the review package.

- Production build and complete project check pass. Full permissions suite passes
  480 decisions plus account refresh, revoked/disabled/forced-password boundaries.
  Pristine migration-75 full-state fixture passes 148 historical and 15 setup gates,
  with complete state equality around the read window. No migration replay.
- Four genuine fixture role logins cover eight changed core routes each. All 71
  base page patterns receive fresh Administrator route smoke, with no browser errors,
  overflow or mutation POSTs. Permission coverage is separately tested; 71-route
  smoke is not an exhaustive lifecycle-state test for every role.
- Fresh semantic suites cover Today/Open dependencies, workload, fifth-place ties,
  outcome classification/Cairo year rollover and all nine report definitions.
  The actual compact/detail outcome charts and tables match independently read
  full hearing rows. Existing backend input/filter/lifecycle predicates remain
  source-identical; no claim that every permutation was freshly exercised in UI.
- 27 fresh axe/reflow scans cover nine screens at 1440/390/320 CSS pixels with zero
  reported WCAG2/2.1 A/AA violations. An additional audit-modal scan passes. Real
  Chrome 200% zoom is proven by native tab zoom/DPR/viewport measurements, not CSS
  scaling. Mobile matter selection/Back/reload/list scroll and focus, menu keyboard,
  audit Escape/opener focus, reference identity and client/matter dirty drafts pass.
  Screen-reader speech was excluded by owner decision; no universal conformance claim.
- Genuine fixture selection writes prove explicit Save, no-op, stale two-tab draft
  retention and completed-response-loss retry with identical UUID/payload. Two
  version advances restore the initial business choice; three receipts remain.
  Existing changed-payload UUID and archive/input contracts are source-identical;
  no additional fresh scenario is claimed for every such edge.
- Thirty saved ordinary/audit export files match server artifact hashes. All nine
  report families, both selected/all variants and a 378-row/49-page status report
  are represented. Full XLSX values/types/order/RTL match independent oracles.
  A synthetic portrait engine output and typed audit null/empty/absent/whitespace,
  numeric/boolean/redacted/truncated/multiline output are retained. Seventeen PDFs
  (129 pages) were independently decoded; representative pages were visually
  inspected, not every page. Exact Arabic PDF content/search remains blocked.
- Audit browser authorization proves 403 without capability and saved PDF/XLSX
  with capability. Earlier APIRequestContext 401 failures were harness cookie
  transport differences: the genuine browser session was still authenticated.
  Two failed capability cycles and the successful cycle are preserved/reconciled.
- All 116 new fixture audit events (1053–1168), 16 previews, 31 completed exports,
  eight successful logins, password setup and selection saves reconcile. Export
  1098 completed but its bytes were not saved; outcome was established before retry.
  Initial preview 1087 failed comparison before response metadata persisted; its
  server event and failed attempt are retained, not presented as a saved artifact.

## Preservation and cleanup

Owner full-state observations at 19:21:52 and 21:10:08 UTC, 28 September, match
exactly except capture time: 145 tables, 48 sequences (including `is_called`),
catalogs/grants, authentication state, migration ledger and 1052 audit events.
At 21:20:33 UTC the accepted owner app remained PID 38844, started 10:42:42 UTC,
port 3000, build `0KBeszrDL7ryCzaLpmGlb`; anonymous login HTTP returned 200.
These are dated observations, not an ongoing availability guarantee.

All 75 migrations, governance, TASKS bytes/86 checkbox lines, operational config,
lockfile and schema remain unchanged. Fresh hashing confirms 934 shareable source
bodies in the accepted artifact and 671 named anchors in its preserved predecessor.
Environment identity matches the dated accepted manifest. Prior recovery/Access/
incident disks and unrelated evidence trees were not rescanned or mutated. An
initial preservation helper used predecessor build anchors against the current
artifact; it failed safely, then was corrected to the manifest's actual root.

Task app PID 23728/port 3158 was ownership-checked and stopped. The task database
container/volume/network were removed by the reviewed ownership-checking fixture
host; pre-existing Docker resources stayed unchanged. Private fixture credentials
and browser evidence remain local under the protected task directory and are
excluded from delivery. No owner login, report/export, repair, activation or restart.

## Skills and review boundary

Form-labelling informed persistent names/help/error links. Error-prevention-recovery
informed explicit Save and retained drafts (generic autosave advice was rejected).
Focus-attention-design informed one primary action and progressive disclosure.
Accessibility-testing-strategy informed the keyboard, axe, reflow and native-zoom
evidence. Existing project decisions outranked generic skill advice.

Local candidate only. Independent review must resolve P01/P05 and assess the stated
coverage limits before acceptance. No push, publication, acceptance checkbox or
Task 6.3 work is authorized or performed by this implementation run.
