# Task 4.0a Phase 4 — staff roster completion

Completion checkpoint: 8 September 2026. Task 4.0a is locally complete and
ready for independent review. Task 4.1 remains unchecked and unstarted. The
next return point is **Task 4.1 — Clients, pending independent Task 4.0a review**.

- Owner-selected model: GPT-6 Astra; reasoning effort: High; environment:
  Local Windows.
- Primary agent performed every edit. Two read-only helpers checked authority,
  test coverage and final screenshots; neither edited files or ran database
  mutations. This internal assistance does not replace independent review.
- Qualitative usage: high. Full-state isolation, repeated reproduction of five
  accessibility defects, real browser zoom/capture diagnostics and the complete
  regression matrix required sustained local verification. Existing gateways,
  fixtures, dependencies, strings and design tokens were reused.
- Scope: Phase 4 only. Phases 1–3 were already implemented; the reviewed Phase 3
  implementation and audit correction were not redone. No later screen started.
- Starting HEAD/origin: `58d8a177158e69442c5c3da2c2e5e99728e3f2f8`.
- Final commit: the enclosing single commit, titled
  `feat: complete Task 4.0a staff roster`. Its full SHA and export hashes are in
  the external delivery receipt; a commit cannot contain its own final hash.
- No push, migration/schema/dependency change, governance edit, owner-decision
  change, Access/DAO operation or final cutover occurred. Access remains in use.

## Preflight and authorization

The repository authorities were read completely in their mandated order,
followed by both governance files and the applicable model, database, migration,
glossary, permissions, visual, readiness and prior acceptance records. Decisions
D1–D51 and the approved Task 4.0a contract remained authoritative.

Exactly one authorized `git fetch origin` ran. Clean `main`, including untracked
files, matched the required HEAD/origin, ahead/behind 0/0, without a Git operation
or lock. Parent was `56534006d8bfd07a3bb227f863f40e643037f6f4`; grandparent was
`34fcd9153f688039f55580d15f9bff045c046c27`. The reviewed implementation retained
its 26-file scope and subject `feat: add administrator staff mutations`; its
correction retained seven files and `fix: keep Phase 3 audit verification operational`.
Phases 1–3 were checked; Phase 4, overall Task 4.0a and Task 4.1 were unchecked.

Project PostgreSQL 17.11 was healthy, with 61 applied migrations, zero pending,
zero unfinished and the approved historical rollback preserved. Preflight
checks passed 15/15 and historical invariants passed 107/107. No unexplained
client sessions existed. Migration SHA-256 values were unchanged:

- 60: `7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`
- 61: `87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904`

## Reproduced defects and corrections

| Defect observed | Correction and permanent proof |
| --- | --- |
| Required Arabic-name fields exposed no instruction description in Chrome's accessibility tree. | Every field references its existing form hint; invalid fields also reference feedback. The tree test independently expects required/invalid states and derives invalid destinations from summary links. |
| Tab escaped the modal confirmation after its final button. | The two dialog buttons wrap forward/backward Tab using the DOM collection API. Every confirmation checks initial Cancel focus and bidirectional containment; workflows check Escape/Cancel restoration. |
| The loading status was inside a main region marked busy, exposing conflicting announcement semantics. | Removed the busy ancestor. Each state rejects live feedback inside a busy region and verifies actual status/alert live and atomic properties. No spoken-output claim is made. |
| A held save disabled its trigger and left keyboard focus on BODY. | The pending status receives focus; one effect prioritizes pending feedback and moves focus to the result on completion. Slow-save and result-recovery tests verify actual focused targets and visible outlines. |
| An error-summary link placed the retirement reason textarea at -0.265625 CSS pixels, clipping its top focus outline. | Added logical scroll spacing using the existing 8-pixel token. The same keyboard reason workflow passes the unchanged strict viewport/focus check. A failed-run viewport image preserves the reproduction. |

No business rule, Arabic terminology, mutation gateway, imported evidence,
permission or database guard changed. Existing strings and focus styles were
reused. The audit source checker initially rejected a dynamic NodeList index in
the new dialog handler; replacing that expression with `item()` passed the
unchanged guard. No safety override was used.

Preliminary runs also exposed test navigation/effect timing and native-zoom
screenshot coordinate problems. Tests now await actual destination/focus states.
Zoom capture uses Chrome's actual surface dimensions and an unclipped viewport
for dialogs. PNG dimensions are asserted. These were investigated and rerun;
stopped or partial runs are not counted as final passes. The external
`run-history.md` distinguishes every retained preliminary/failed/diagnostic run.

## Browser and accessibility acceptance

Final production run: **220 state/interaction cases, 191 axe audits with zero
violations, 191 recorded accessibility trees, 231 screenshots and zero remote
requests**, using Chromium 151.0.7922.34 and the existing local Playwright runtime.

All four roles — Administrator, Litigation Assistant, Lawyer and Paralegal —
view the roster/detail. Only Administrator receives management pages/actions
and the account-status projection. Direct management navigation is denied to
the other roles. Each of the nine real action requests is retained in memory
as a copied buffer, verified as decoded for Administrator, then replayed for
each non-Administrator: **27 denials**, without protected response fields or any
change to the complete fixture receipt. Request buffers are cleared afterward.

| Acceptance requirement | Final evidence |
| --- | --- |
| 1. Arabic-first RTL and logical order | Arabic document language/direction, structural RTL checker, source/tab order, connected Arabic and mixed-text visual inspection. |
| 2. Keyboard-only workflows | Navigation, search, combined filters, distinct pagination, creation/editing, rename, alias reasons/lifecycle, both reviewer controls and employment transitions use Tab, Enter and native select keys. |
| 3. Visible, unobscured focus | Computed outline width/style/contrast, full control viewport position and hit-testing; pending/results, summary links and dialog containment are exercised. |
| 4–6. Labels, instructions, required/errors and summaries | Actual Chrome accessibility names/descriptions/roles, required and invalid states, focused summaries and working links to exact invalid fields. |
| 7. Confirmation behavior | Named employee/consequence, initial Cancel focus, forward/backward Tab containment, Escape/Cancel and trigger restoration. |
| 8. Action status semantics | Pending, success, failure, stale and unchanged results expose valid polite status or assertive alert semantics with atomic text and no busy ancestor. |
| 9. Non-colour meaning | Explicit current/former, trainee, alias provenance/retirement, success/error and enabled/disabled text; visual review confirms these distinctions. |
| 10. Targets | Every visible interactive target in the staff main content measures at least 44 by 44 CSS pixels and fits horizontally. |
| 11. Genuine 200% browser zoom | Five proofs cover roster, detail, create, edit and confirmation. Chrome reports zoom 2; the native window remains 1440, CSS width changes 1440 to 720 and DPR 1 to 2. CSS zoom and visual/pinch scale remain 1. |
| 12. Separate reflow | Desktop 1440, mobile 390 and narrow 320 CSS-pixel states pass overflow and target checks, independently of zoom. |
| 13–14. Email and contrast | LTR direction/isolation for email, readable mixed text, axe text/background contrast and measured keyboard focus contrast of at least 3:1. |
| 15. Exceptional states | Actual blocked-query loading, empty results, invalid filters, external-person not-found, forbidden and recoverable database-error/retry paths. Error injection changes only the owned fixture. |
| 16. Search and paging | Combined filter query state persists across distinct pages; alias explanations identify matches; ordinary search excludes retired native aliases. |
| 17. Normalized duplicates | Arabic hamza/diacritic and normalized email conflicts retain input and expose focused Arabic recovery. |
| 18. Canonical rename | Same person identity; previous spelling still finds that person with an alias explanation. |
| 19. Alias lifecycle | Native add, missing-reason errors, retirement, preserved detail/reason, restoration and search recovery; imported aliases expose immutable historical evidence without lifecycle controls. |
| 20. Stale recovery | Original version/value pairing survives refresh; stale submission preserves unsaved input and cannot silently replace the newer value. |
| 21. Employment/account consequences | A separately logged-in real browser session is denied after deactivation. Linked account is disabled, lockout cleared and session version incremented. Employment reactivation leaves that account disabled and the old cookie unusable. |
| 22. Reviewers | Exact eligible option IDs equal active internal non-trainees. Both teams can share a reviewer; deactivation fails until both replacements are saved. |
| 23. Slow/repeated activation | A held real request exposes focused pending feedback; repeated keyboard/pointer activation sends one action. Rapid double activation starts from an enabled button and creates exactly one identity with one request. |
| 24. Visual inspection | 164 representative final images across 58 distinct groups: every ordinary state at desktop/390/320 plus five native-zoom views. All 159 previously inspected non-zoom images match the final rerun byte-for-byte; corrected zoom images were inspected separately. |

Axe is one part of acceptance, alongside real keyboard actions, focus geometry,
browser accessibility-tree inspection, reflow and actual screenshot review.
**No actual screen reader was available; spoken output was not tested.**
Native single-line input/select values may extend beyond their visible portion
at 320px; complete controls and surrounding identity/instruction text remain
available. Browser testing used desktop Chromium with mobile-width layouts,
not physical mobile-device hardware or a cross-browser compatibility matrix.

## Established regression and build results

| Check | Result |
| --- | --- |
| `npm run test:staff-mutations` | PASS: full-state service workflows, rollback/audit/session/no-op proof, all 17 service races, 22 gateway proof groups and 107 historical invariants afterward. |
| `npm run test:staff-read-only` | PASS: four roles, 66 staff details, 71 external identities, 36 filter combinations/every page, every searchable internal alias and synthetic deduplication/retirement fixtures. |
| Real-volume query plans | PASS: eight EXPLAIN ANALYZE plans; maximum 0.309 ms in this run. This is database execution time, not an end-to-end response-time claim. |
| `tsx scripts/test-staff-roster.ts --regression-proof` | PASS: established authentication, all 448 permission decisions and user-account lifecycle suites in the owned cluster. |
| `tsx scripts/test-user-management-ui.ts` | PASS: existing UI boundary/recovery checks after mirror cleanup. |
| Current migration-61 audit regression | PASS: `--audit-regression-proof` runs `test-audit.ts --profile=current-state-61` plus event proof on owned fixtures; no historical guard is bypassed. |
| Separate audit-event regression | PASS: `--audit-events-regression-proof`; 45,463-event append benchmark and indexed 50-row retrieval, measured at 10,911.1 ms and 0.105 ms respectively in that separate run. |
| Complete `npm run check` | PASS: TypeScript, ESLint, formatting, RTL, authorization, audit, account/staff structure, gitignore and encoding. |
| RTL structural/self-test | PASS: 23 files; 78 rules, 21 rejecting and five clean fixtures, 142 expected findings, zero known gaps. |
| Authorization / audit / staff structure | PASS: 29 classified entries; 43 audited runtime sources; six schema and 67 audit rejection fixtures; two view/two manage pages, nine actions and nine staff rejection fixtures. |
| Production build | PASS: `next build --webpack` in a task-owned mirror with the disposable runtime identity, no source environment file and no migration credential. |
| Final project verification | PASS: read-only `db:verify` SQL 15/15 and historical `db:check` 107/107. |
| Complete preservation / cleanup | PASS: exact before/after receipts, no unexplained project sessions, no owned container/volume/network, application/browser process or build mirror left. |

Regression suites ran sequentially so each ownership guard could compare the
entire Docker resource inventory. Full-state restoration used memory-to-stdin,
without exporting a dump file. The browser evidence records the different
project/fixture cluster IDs, container, app PID, loopback port and runtime role.
Generated browser/app secrets and fixture passwords were not written to evidence.

## Project preservation

The complete before/after JSON files are identical, SHA-256:
`3d93c162bc998b660208471ee0eaed2bdd2132bad42df1bfaf44d16915a60cab`.
They cover all 103 full table projections and timestamps; sequence definitions,
last values, call/log state; schema objects, constraints, indexes, functions,
triggers and grants; roles/settings; migration history and protected audit
evidence; database/container identity, configuration and resource inventory;
every logo path/size/hash; and protected repository file hashes.

- Complete table digest:
  `a1cfcf53b26f7090831a3c9d186df1ffef3c3229f7d3d4eda3ba85e6f6995251`.
- All 54 logo files' combined digest:
  `652a9b97652c60ba95447f7a6c650252dfe3d4b25bd848f02b522633315dc89d`.
- Project cluster remains `7676117521894273062`; container `litigation-db`
  retains its original identity/start/configuration and healthy state.
- Project state remains 66 staff (23 active/43 inactive), 71 external people,
  137 people, 350 aliases, two teams, four accounts, 824 audit events, zero
  staff-change ledger rows, 1,744 matters and 13,382 hearings.
- Governance, D1–D51, schema, lockfile, environment and all migrations retain
  their protected hashes. No project data was written or restored.

## Exact changed-file inventory

Application corrections:

1. `src/app/staff/staff-editor.tsx`
2. `src/app/staff/staff.module.css`
3. `src/app/staff/loading.tsx`

Permanent browser verification:

4. `scripts/test-staff-browser.mjs`
5. `scripts/lib/staff-mutation-browser.mjs`
6. `scripts/lib/staff-accessibility-browser.mjs` — new
7. `scripts/lib/staff-interaction-browser.mjs` — new

Canonical status, evidence and testing guidance:

8. `README.md`
9. `TASKS.md`
10. `HANDOFF.md`
11. `docs/PRD.md`
12. `docs/DATABASE.md`
13. `docs/VISUAL-DIRECTION.md`
14. `docs/MIGRATION.md`
15. `docs/task-reports/2026-09-08-task-4-0a-phase-4-staff-roster-completion.md` — new

Prior dated reports remain unchanged. README's check inventory now correctly
counts the existing staff structural check, making ten checks rather than nine.

## External review package and limitations

Artifact base, outside Git:
`C:\Users\Khaled\.codex\visualizations\2026\09\08\01a080e6-ad89-7911-9954-dc2fb3cd7f76`.

- `phase4-evidence/`: final browser JSON, all 191 trees and 231 screenshots,
  ten native capture receipts, build/regression/static/database logs, visual
  index/review/comparison, project receipts and cleanup/preflight evidence.
- `phase4-evidence/final/browser-evidence.json` SHA-256:
  `46bbd7519787519aa667d768ea3855770cfb0a8661026fc4673d39579ba1c676`.
  The final export verifies this value against the retained file.
- Preliminary/failed-run evidence is explicitly separated from `final/` and
  explained in `run-history.md`. Retained diagnostics are evidence, not final
  acceptance or temporary application resources.
- `phase4-evidence/SHA256SUMS.txt`: manifest for every retained evidence file
  and final screenshot, excluding the manifest itself to avoid self-reference.
- `phase4-evidence.zip`, `task-4-0a-phase-4.patch` and `delivery-receipt.json`:
  finalized after the commit. The receipt records commit scope/statistics,
  full-index and reverse-check results, Git state, manifest/ZIP/patch hashes.

All task-owned containers, databases, roles, credentials, volumes, networks,
app/browser processes, profiles/extensions, build mirrors and temporary working
files are removed. Only deliberately retained review artifacts remain. No
pre-existing resource was stopped, changed or removed.

The final Git acceptance requires clean `main`, including untracked files,
ahead/behind exactly 1/0, no operation/lock, and unchanged `origin/main`
`58d8a177158e69442c5c3da2c2e5e99728e3f2f8`. The single binary-safe patch must
match the commit's exact 15-file scope/statistics, use full indexes and pass
`git apply --reverse --check` without applying it. The external receipt captures
those post-commit results.

Remaining limits are the explicitly untested screen-reader speech and physical
mobile/cross-browser hardware combinations, plus the already recorded audit
compromised-process boundary from the established regression. No new product
or legal-record decision was needed. Access remains in daily use; final delta
reconciliation/cutover remains separate under D43/D51. **Stop for independent
Task 4.0a review; do not push or begin Task 4.1.**
