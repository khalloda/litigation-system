# Task 6.1 shared reporting engine — local implementation

26 September 2026. Implementation review only; no owner activation, migration,
provisioning, acceptance closure or publication. Task 6.2 has not started.

Base `bcf5359b915d94872cdea1283ea404a76fd53dee` (parent
`3cf48f1252cb173bcb4c24bed477d35a0b4b60a3`, tree
`32e337e15741ba8df145d2a2ebd412dea08e2d4d`). Implementation commit
`c0e6f53c6d115393e097c6d5c8f0d0f0ef2b1771` has that base as its sole parent and tree
`80d7e53009973a87ad76e973da68376d7a3f9600`. Its documentation-only child and final tree are identified
by the external package/receipt, avoiding a self-referential commit identity.

## Delivered behavior and boundary

The permission-protected Reports catalog is truthfully empty. The reusable Arabic
RTL form and trusted definition interface support dates, client, branch and person
IDs, narrow date/enum extensions, coherent query snapshots, typed rows/groups/
sections/totals, preview, complete Excel and PDF exports. No domain report,
Access-equivalence claim, arbitrary query/template input, runtime test switch,
scheduler or persistent report cache is introduced. Test definitions are composed
only in a separate test artifact. Its sole production composition override and
all unchanged shared modules are recorded in harness bindings.

Civil date bounds are inclusive through the next Cairo civil midnight, including
DST and year rollover. Missing optional values differ from explicit unassigned.
Selections retain archived clients, inactive historical people and NULL branches.
Arabic selector search agrees with the database normalizer and never folds J to ق.
Stable IDs disambiguate names; report definitions remain responsible for approved
date/lawyer predicates in later tasks.

## Security and truthful audit phases

All four ordinary roles retain existing report access without the audit-history
export capability. Immutable route guards and service checks validate current
account/person/role/session version/expiry/enablement/password state before reads
and again before artifact release. Definition-specific permissions cannot widen
billing permissions. Registry IDs, supported fields and duplicate/unknown keys are
validated server-side. Current source inventories bind the exact new SQL/closures;
existing audit guards and negative fixtures remain intact.

The [matrix](../testing/task-6-1-acceptance-matrix.md) records the phase contract
established before coding. Each explicit POST is a new server-owned attempt:
`report_executed` follows validated coherent query completion; `export_completed`
follows complete bytes and digest. Navigation/options are silent. Audit failures
fail closed. Generation failure/cancellation can leave the completed query fact;
revocation before release withholds bytes. No browser-receipt or cross-request
exactly-once guarantee is claimed, and no `download_completed` is emitted.

## Outputs and operational limits

ExcelJS creates three RTL worksheets: information, readable data, and exact typed
UTF-8 continuation data. Numeric/date/boolean cells are used when exactly safe;
large precision and identifiers remain explicit text. NULL, empty, false and zero
remain distinguishable. Formula-like data is inert; long values are continued
without truncation. Independent OOXML decoding checked actual output bytes.

Playwright renders four reusable layout shapes with bundled Noto Arabic/Latin/
Latin Extended fonts, A4 orientation, grey cell borders, group headers, manual
blank lines, conditional highlight, logos/name fallback, count and Arabic footer.
Oversized text is split into bounded continuation rows without discarding scalars.
The branded repeated header is rendered once at double resolution using verified
bundled fonts, then repeated as an image to avoid Chromium header font clipping.
Body/footer remain embedded glyph text with Unicode maps. Header text therefore
is not selectable text; these PDFs are not claimed to be fully tagged accessible
documents. The accessible application/form remains the interaction surface.

Future authorized activation must set `REPORT_ASSET_ROOT` to the deployed artifact
root and preserve controlled client-logo storage; no owner environment was changed.
Missing/corrupt mandatory assets fail closed. Network access and scripts are blocked
inside PDF rendering. Technical bounds are 100,000 logical rows, 32 columns,
1,000,000 UTF-16 units per cell, 64 MiB result/artifact, 120 seconds, and two
concurrent operations/PDF jobs per process. These are measured safeguards, not
arbitrary business filters; oversized output fails before release.

At the current restored volume, 13,382 hearings produced a complete XLSX of
2,502,382 bytes in 5,278 ms (27 query events including transaction/guards/audit).
The PDF contained all 13,382 record IDs in order across 973 pages, 58,372,726 bytes
in 74,217 ms. This is close to the 64 MiB bound; future larger/wider definitions
may need a reviewed export strategy. No silent truncation or automatic annualizing
is involved. Synthetic typography cases are engineering probes only.

## Executed proof and reuse

Evidence root: `test-results/task61-20260926T074618Z` (ignored, preserved).

| Evidence | Actual result |
|---|---|
| candidate-check | Full `npm run check` PASS against final implementation; types, lint, formatting, RTL, auth/audit inventories, mutations, encoding |
| final-build-02 | Stable ordinary production build PASS, empty registry |
| final-permissions | 480 existing permission decisions PASS |
| contract-02 / boundaries-02 | Strict input, Cairo/date boundaries, real options/archive/NULL semantics, audit failure, real billing denial and concurrency PASS |
| integration-05 | Genuine four-role auth, current-state denial, independent full-volume oracles, phase/failure/retry/revocation/cancel checks PASS |
| browser-04 | Eight saved real downloads across four roles; ordinary-build unknown probe denial; desktop/390/320, keyboard/focus/errors, no audit navigation noise; targeted axe PASS |
| browser-zoom-06 | Genuine browser zoom 200%, 1440→720 CSS viewport, native screenshot and keyboard/axe PASS |
| render-final / output-inspection-final | Six PDF layout/logo probes, independently decoded OOXML, embedded glyph fonts, full-volume ID order and representative visual review PASS |
| defenses-final | Four source-guard mutation negatives, size/Unicode and corrupt asset negatives PASS |
| pristine-gates-02 / final-fixture-gates / final-owner-gates | Each 148 historical plus 15 setup checks PASS; owner checks enforced read-only |

Earlier integration proof is reused for unchanged engine/auth/audit code; its early
PDF visual outputs are superseded by render-final and boundaries-01 final renderer
outputs. Source hashes and executed helper copies bind each run. The implementation
build predates only the final defensive test file and documentation; full check
includes that test. Documentation-only child checks are external final records.
No OS screen-reader speech or universal accessibility conformance is claimed.

## Preservation, cleanup and limitations

A fresh protected recovery snapshot was restored to the task-owned guarded Docker
fixture. Pristine comparison preceded tests. The owner remained at 141 tables,
48 sequences, 73 completed migrations, 889 audit rows, with complete final owner
state equality and no restore exceptions. Owner credentials, capabilities, business
rows, prior audits and all migration bytes remain unchanged. The owner app was
absent at the successful initial observation (no listener and refused anonymous
login HTTP); it was never started, stopped or restarted. Historical PID/build data
is not presented as current runtime health.

Fixture reconciliation accounts for all 240 added audit rows: 60 report operations,
30 artifact completions, 49 genuine logins and precisely bounded authentication,
staff and archive/restore test writes. All business values/archive flags restored;
catalogs, sequences, migration ledger and the original 889 audit rows stayed exact.
Task-owned fixture database/container/network/volume were removed by the existing
guarded fixture cleanup. Temporary sessions/credentials are removed after proof;
private raw state/recovery remain protected locally. Full prior-file preservation,
resource absence, ACL checks and fresh post-seal observations are external records.
Shared summaries bind withheld private bodies by digest but cannot independently
reproduce them. Local backups do not protect against loss of this laptop/disk.

All TASKS bytes and 86 checkbox lines, AGENTS/CLAUDE and migrations 1–73 are unchanged.
No migration candidate is necessary: existing permissions/audit storage suffice.
No dependencies were added. No push occurred. Independent implementation review
and separate operational authorization remain required.

## Failed attempts retained

The evidence `failures.md` and executed run/helper records preserve unsuccessful
attempts. They include sandbox-denied task-private writes recovered through scoped
platform approval; missing fixture logos; controlled-source inventory and audit
safe-schema rejections; guards refusing an unsafe last-admin test; test harness
permission/path/type errors; Chromium repeated-header and screenshot issues; and
one serialized-date comparison failure after a complete snapshot. None is counted
as PASS or hidden by a guard override. Final corrected evidence is named above.

## Complete ordered changed-path inventory (34 paths)

- `README.md`
- `docs/task-reports/2026-09-26-task-6-1-reporting-engine-implementation.md`
- `docs/testing/task-6-1-acceptance-matrix.md`
- `scripts/lib/audit-source-inventory.ts`
- `scripts/test-report-boundaries.ts`
- `scripts/test-report-browser.mjs`
- `scripts/test-report-contract.ts`
- `scripts/test-report-defenses.ts`
- `scripts/test-report-integration.ts`
- `scripts/test-report-probes.ts`
- `scripts/test-report-render.ts`
- `src/app/page.tsx`
- `src/app/reports/[id]/export/route.ts`
- `src/app/reports/[id]/page.tsx`
- `src/app/reports/[id]/run/route.ts`
- `src/app/reports/page.tsx`
- `src/app/reports/reference-select.tsx`
- `src/app/reports/report-form.tsx`
- `src/app/reports/reports.module.css`
- `src/lib/auth/route-inventory.ts`
- `src/lib/reports/assets.ts`
- `src/lib/reports/authority.ts`
- `src/lib/reports/engine.ts`
- `src/lib/reports/excel.ts`
- `src/lib/reports/fields.ts`
- `src/lib/reports/input.ts`
- `src/lib/reports/options.ts`
- `src/lib/reports/pdf.ts`
- `src/lib/reports/production.ts`
- `src/lib/reports/registry.ts`
- `src/lib/reports/result.ts`
- `src/lib/reports/search.ts`
- `src/lib/reports/types.ts`
- `src/strings.ts`
