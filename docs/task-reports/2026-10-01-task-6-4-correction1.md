# Task 6.4 — T64-R1 correction candidate

1 October 2026, Cairo. Local implementation only; independent correction review
is required. The eight original children through `58bad390ef75574785fcc5a4f85685985ed0f397`
are preserved. Application correction `5af46cabd6518fe1750227d3ce7d78ffc0c5293d`
changes one page and adds one focused test. The documentation child and final
five-file identities belong to the external receipt.

## Correction and actual reproduction

The adopted independent review identified T64-R1: the lawyer-selection detail
heading concatenated the Arabic client name and IDs with the case number in an
ordinary RTL paragraph. Its prior evidence was source/CSS and FriBidi, not a fresh
application-browser observation. We reproduced the actual route before editing,
on the retained production build `dV6wkGfF2-SxHassEZNGj` in an isolated full-state
fixture. Canonical `1 / 2010` displayed as `2010 / 1`; an Arabic-first multiline
identifier lost its line break and reversed its numeric line. The both-null
context also displayed the JavaScript `null` text.

The detail context now uses the existing `ReportLabelParts` helper and unchanged
per-line direction rule. Client, client ID, case number or subject, and matter ID
are separately labelled using existing strings. A missing case falls back to the
subject, then the existing null message. No stored string, query, request, save
payload or business meaning changes. The existing selection-list `bdi` and its
line-preserving behavior are unchanged. No shared helper, CSS or string change
was needed.

## Focused validation

Evidence root: `test-results/task64-r1-20261001T054845Z`.

| Check | Result and evidence |
|---|---|
| Exact source | Fresh production build `3cwCPGCheBiowTUpuqX61` from `5af46ca`; `after-build-source.json` and `build-after-command.json` |
| Six cases | Spaced numeric, Arabic-first multiline, mixed `001 / 52ق` and `140J / 140ق`, compact `933/2025`, multiline subject fallback, both null; `cases.json` |
| Actual route | 36 observations before and 36 after: Administrator/Lawyer × six records × 1440/390/320px; detail and corresponding list screenshots in `browser-before/` and `browser-after/` |
| Text and behavior | Glyph geometry proves corrected numeric order and separate lines; canonical values, list geometry, stable client/matter URLs and loaded hearing IDs match. All final context glyphs fit; `visual-proof.json` |
| Accessibility | Two targeted WCAG axe checks pass with AX snapshots; keyboard Enter follows the unchanged links, with a visible 3px solid focus outline. Edit/disabled affordances remain role-correct |
| Regression | `scripts/test-lawyer-selection-context.ts`: 12 actual-page JSX cases, including existing helper rendering, exact text/labels, null fallback, stable read IDs and unmodified editor models; `focused-regression.log` |
| Project gates | Full `npm run check`, including source/authorization/audit inventories, and final production build pass. Original non-fatal Next dynamic-file tracing warnings remain in the build log |
| Isolated database | Verified retained recovery restored to a distinct owned cluster. Unchanged migration77 applied only there. Pristine and final 148 historical +15 setup checks pass; complete final read-window equality |
| Accounting | Exactly 24 additions to the fixture's 1,094 baseline: six native test matters, six native hearings, two fixture password-reset/change workflows and two genuine sign-ins. Existing data, all selections/history/receipts and prior audits remain exact. Only the two native ID sequences advance by six; other46 remain exact |

The six synthetic matters are clearly marked `TEST ONLY T64-R1` in their notes;
they are fixture records, not an assertion about any original client/case
relationship. Each has one deliberately created test hearing. No selection-save,
report-run or export mutation was performed. Every browser read/navigation window
is compared across complete database snapshots. Fixture setup/authentication is
separately reconciled in `fixture-reconciliation.json`.

## Reuse, troubleshooting and preservation

The original five-file delivery hashes and receipt-inclusive verifier pass.
`evidence-reuse.json` binds the unchanged full-volume comparisons, 480 permission
decisions, migration77 refusal/rollback, explicit selection-save/retry/concurrency
proofs, original upcoming evidence, and all 67 saved continuation outputs. These
are retained evidence, not newly regenerated exports or fresh PDF inspection.

The handoff archive and adopted prompt match exactly. Its optional Downloads
project-context sidecar was a different file; the supplied verifier passes against
the three exact bundled sidecars and unchanged manifest. That unrelated Downloads
file was preserved, not adopted. Task-private ACL setup needed bounded Windows
SID handling recovery; the failed snapshot write and import-only fixture-auth
attempt made no database mutation. The TypeScript subprocess required supported
platform approval. Original failed attempts and limitations remain recorded in
`attempts.json`; no guard or test was weakened.

The accepted owner app remained on port3000, build `_RzjAkHqwy8M9tcZ9AF2I`;
current runtime timestamps belong to the external observations. Owner reads are
bounded snapshots, identity/configuration checks and anonymous login-page health,
with no owner sign-in. Migration76, all 77 candidate migration files, Prisma,
dependencies, governance and every TASKS byte/86 checkbox lines remain unchanged.
Preservation checks use the retained full artifact inventory, current byte-length
metadata and selected hashes; they do not claim a new hash of every historical
artifact. Recovery and the original five files are rehashed. Only positively
identified task processes, fixture resources and temporary credentials/sessions
are cleaned; prior evidence and protected snapshots remain.

PDF copying remains an accepted limitation, not a fix. Search is uncertified;
neither diagnosis was reopened. No font/renderer change or later-task work occurs.

**NOT PUSHED. STOPPED FOR INDEPENDENT TASK 6.4 CORRECTION1 REVIEW.** No owner
migration, repair, provisioning, seeding, activation/restart, acceptance closure,
publication or Task6.5 is authorized by this correction.
