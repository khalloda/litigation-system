# Task 4.1 Phase 3 — Authorized mutations and archive/restore

- Implementation date: 10 September 2026; independent review and owner acceptance pending.
- Requested configuration: GPT-6 Astra, Extra High reasoning, Local Windows at
  `D:\Projects\litigation-system`; no subagents permitted or used.
- Expected usage: high; existing tools, database gateways and fixture workflows
  reused. No purchases, installations, hosted services or Cloud execution.
- Starting/fetched checkpoint: `82ca95c439e554bc8b55ffb3de0873827f8f3751`.
- Final local commit: the sole child of that checkpoint with subject
  `feat: add client and contact mutations`; its full identity is recorded in
  the external post-commit delivery receipt, avoiding a self-referential hash.
- Remote state: no push or other publication in this task.
- Authorized stop: one verified local commit and review package, then independent
  Phase 3 review. Phase 4 and Task 4.1a remain unstarted; Task 4.1 is not accepted.

## Authority and scope

The owner's Phase 3 prompt authorizes application/test/documentation work under
D39 and D52–D57, isolated full-volume mutation and browser proofs, temporary
fixture credentials, copied logos, and cleanup. The attached handoff supplied
context; it was not treated as separate authorization. The later permission
recovery message authorizes one additional narrowly scoped fetch attempt and
supported command-scoped permissions for other already authorized operations.

The original restricted fetch failed with `.git/FETCH_HEAD: Permission denied`
(exit 1). The one explicitly authorized escalated retry used exactly:

```text
git fetch --no-tags --no-prune --no-recurse-submodules origin refs/heads/main:refs/remotes/origin/main
```

It succeeded (exit 0). The post-fetch checkpoint was clean `main`, 0 ahead/0
behind, with HEAD and origin/main both exactly the SHA above, no operation or
lock. The preserved preflight receipt records both outcomes. No further fetch,
ACL change, approval-policy change or safety override was used. Restricted
Docker/TypeScript subprocess denials were addressed through narrowly scoped
supported execution approvals; no automatic approval-review rejection occurred.

No schema, deployed migration, grant, original logo, governance file, source
environment, raw import evidence, billing function or other domain was changed.
No Access extraction, staff assignment, contact move, logo upload, new report,
Phase 4 acceptance or final cutover is included.

## Tools and evidence reuse

Local PowerShell/Git, the installed Node/TypeScript/Prisma stack, PostgreSQL 17.11
in the existing owned Docker fixture workflow, and the existing Playwright runner
were used. The production browser used Playwright 1.62.1 and Chromium
151.0.7922.34. No dependency installation or upgrade was needed. The four applied
skills were `accessible-content:form-labelling`,
`cognitive-accessibility:error-prevention-recovery`,
`cognitive-accessibility:focus-attention-design`, and
`accessibility-decisions:accessibility-testing-strategy`: their practical outputs
are field labels/descriptions, retained drafts, summary/pending focus, confirmation
keyboard handling and the browser verification matrix. The computer-use skill was
read to assess fit; its UI automation capability was unnecessary because the
established local browser runner covered the authorized proof. No visual redesign
or component-spec skill was needed. Context7 supplied only generic React
state-initialization documentation from `/react/react/v19.2.7`; the installed
React version is 19.2.8. No project content was sent in that lookup.

Fresh evidence comprises this task's Git recovery/preflight, 15/116 before/after
checks, deterministic preservation receipts, client service/read/browser proofs,
static checks and current-62 regression run. Reused evidence is explicitly
historical: the [Phase 1 foundation proof](2026-09-09-task-4-1-phase-1-database-foundation.md),
[migration-62 deployment acceptance](2026-09-09-task-4-1-phase-1-migration-62-deployment.md),
[Phase 2 implementation](2026-09-09-task-4-1-phase-2-read-only-clients.md),
[navigation correction/acceptance](2026-09-09-task-4-1-phase-2-navigation-correction.md),
and their preserved packages/inventory listed by hash in
`evidence/protected-files-before.json`. Neither the historical 61-to-62 profile
acceptance nor migration deployment was repeated. Completed required reading and
the advertised-capability assessment were reused after permission recovery.

## Application behavior

Eight independently guarded pages and eight immutable Server Action wrappers
implement client/contact create/edit/archive/restore. Administrator can perform
all operations; Litigation Assistant can create/edit; Lawyer and Paralegal retain
view access. Every form read and mutation service repeats its permission check.
The serializable mutation transaction rechecks the current account, person,
role, initialized/password-change state and session version. Request fields
cannot choose the actor, table, role or audit metadata.

All writes are parameterized calls to the existing three migration-62 gateways.
Thirteen exact raw read/transaction/gateway sites and the complete service are
pinned in the audit inventory. Input validation is separately pinned; the client
structural checker adds only exact service/action/editor exceptions. The existing
query/logo, staff, account, D35 and private migration boundaries remain intact.

Updates submit only deliberately changed fields. Untouched NULL, empty, whitespace
and legacy `probono` values remain unchanged. D53 labels and operational choices
are explicit, with no automatic Cash/Active default. Dates are calendar-validated
date-only strings. Multiline text, independent full names and all six imported
unnamed contacts are preserved; home phone and raw responsible-lawyer text are
never editable. Sigma's three names are read-only and independently protected
on the server. IDs distinguish valid duplicate and non-Arabic names.

Forms retain one original snapshot, including values, version, operation and
creation UUID. RSC updates never attach fresh versions to unsaved input. A stale
result retains the draft and explains explicit reload; exhausted transaction
conflicts have a distinct retry message. Same actor/entity/UUID/payload retries
return the existing identity without an extra row/event. A changed payload or
parent under the same key is rejected; an intentional new key allows a duplicate.

Main-contact selection is optional, same-client and unarchived. The operator must
explicitly clear or replace it before archiving that contact. Client archival
retains main contact, individual contact archive states, matters, billing and logo
relationships. Every contact operation requires an unarchived parent. Administrator
confirmation shows server-loaded relationship counts; dialogs support initial
Cancel focus, keyboard containment, Escape and focus return.

Validated search/status/archive/client-page/contact-page context survives entry,
save, cancel, confirmation and return. The existing R1/R2 Clear/Back behavior and
page clamping remain. No action accepts an arbitrary return destination. Arabic
strings remain centralized, with existing fonts, RTL styles and logical spacing.

## Verification receipts

Command logs below are retained in the external package under `evidence/`.
Expected database errors from negative tests are preserved in their logs; the
reported result is the process exit status and completed assertions, not the
absence of error-looking lines.

| Command / proof | Result | Evidence |
|---|---|---|
| `npm run check` | Pass, exit 0, no lint warnings; 50 authorization entries, 72 audited runtime sources, 21 rejecting client fixtures | `check-final.log` |
| `npm run test:client-mutations` | Pass, exit 0; 12 groups including ten observed lock races, full sequence no-ops and injected audit-failure recovery | `client-mutations-complete.log`, `service-complete/` |
| `npm run test:client-read-only` | Pass, exit 0; all 318 clients, 188 contacts, six unnamed, 207 without contacts, maximum 378 matters, all 54 decoded logos and failure paths | `client-read-only.log`, `read/query-plans.json` |
| `npm run test:client-regressions` | Pass, exit 0; current-62 source, authentication/accounts/staff, all 448 permissions, audit/events and Gate 4 60/60 | `client-regressions.log` |
| `npm run test:client-mutation-browser` and isolated production build | Pass, exit 0; 86 states/proofs, 69 zero-violation axe scans, 79 screenshots, all four roles, zero remote requests | `browser-complete.log`, `browser-complete/` |
| Forced-read-only setup / historical invariants, before | Pass, 15/15 and 116/116 | `before-verify.log`, `before-db-check.log` |
| Forced-read-only setup / historical invariants, after | Pass, 15/15 and 116/116, exit 0 | `after-verify.log`, `after-db-check.log` |

The regression command ran once at the final application candidate. Its existing
audit/event subcommands each exercise a 45,463-event append benchmark: observed
11,676.7–12,825.4 ms, with indexed 50-row retrieval at 0.115–0.126 ms on the
disposable copy. No optional historical migration acceptance was added. The
read-only test's subsequent lint-only correction replaced a ternary with an
equivalent `if` in copied-file readiness handling; its behavior was unchanged.
Representative images were visually inspected for Arabic shaping, clipping,
overlap, legible wrapping, confirmation controls and retained stale input. The
final sample includes the 320-pixel contact form and client confirmation, both
native-zoom confirmations, and the retained stale form. The file-level inspection
receipt is `visual-inspection.json`; it does not claim manual inspection of all
79 images or screen-reader speech.

The consolidated acceptance matrix below was recorded during final review, after
the initial proof runs, rather than as a separate pre-test artifact. This is a
documentation-order deviation from the requested process. Reviewing the matrix
exposed missing explicit parent/lifecycle races and confirmation zoom cases; those
were added before the corresponding final proof reruns. Earlier partial results
are retained and are not substituted for those final results.

| Required behavior | Fresh evidence / review entry point |
|---|---|
| Four roles, eight operations, nested URLs/actions, forged fields and revoked sessions | `scripts/test-client-mutations.ts`; production browser role/route and captured-action denial proofs |
| All editable client/contact fields, duplicate/native/imported identities, Sigma, six unnamed contacts | Service field/preservation groups; browser Sigma/unnamed and create/edit journeys |
| Omitted fields, exact blanks/NULL/legacy spelling, date-only values and no-op complete sequences | Service full-state equality and date/legacy groups; client read suite |
| Submission UUID, actor/entity/parent scope, same-key retries and simultaneous creation | Service submission group and browser exact network replay |
| Competing edits and parent archive versus each contact operation; main-contact archive race | Service actual serializable retry path and ten observed PostgreSQL lock races |
| Counts, confirmation, clear/replace, non-cascading lifecycle and archived parent | Service lifecycle group; production create/main-contact/archive/restore journeys |
| Current-actor atomic audit, failed-create receipt rollback and recovery | Service actor/race/failure groups; current-62 audit/event regression |
| Original-version stale draft after RSC refresh; validation and recovery focus | Two-tab production proof including repeated stale retry and retained input screenshot |
| Save/Cancel context, Clear/Back, R1/R2, searches/paging, logos and fallback | Complete client read suite and production Phase 2 regression retained in the runner |
| Desktop/390/320 forms/dialogs, native 200% zoom, keyboard/AX/axe and visual inspection | Production browser evidence and representative screenshot inspection receipt |
| Authentication, accounts, staff, all 448 permissions, audit/events and Gate 4 | `npm run test:client-regressions` current-62 path |
| Preservation and cleanup | Complete before/after receipts, file inventories, fixture and application cleanup receipts |

Recorded development corrections are retained separately from passing receipts:

- The initial restricted fetch and compiler/Docker permission denials above.
- An initial test used the old 13,279-hearing figure. The current source has
  13,382 hearings and 1,744 matters after Task 3.5B; the corrected fixture proves
  exact equality of all 107 restored source tables before mutation.
- Type/format/source-inventory corrections were made without changing existing
  fingerprints or weakening the raw-SQL capability checks.
- The first browser attempt read the previous visible stale alert while a retry
  was still pending. The proof now also waits for the completed focus handoff.
  Terminated-process cleanup recognizes either an exit code or an exit signal.
- The initial final static run passed with one test-only ternary-expression lint
  warning; an equivalent `if` statement removed it. A file-receipt comparison
  initially compared a PowerShell-parsed DateTime with a formatted string; exact
  UTC ticks confirmed the unchanged time and corrected the comparison.

The required read/logo suite uses an exclusive handle on its copied Windows logo
to prove unreadability, replacing its old ACL manipulation. Original logo code
and byte/size/path/ADS/junction checks remain. Fixture/output paths are external
to the repository. The application mirror receives only a generated runtime
credential and authentication secret; migration/coordinator credentials and
source environment files are excluded.

## Protected state and package

The forced-read-only setup preflight passed 15/15 and historical `db:check`
116/116. The fresh deterministic receipt matched the accepted Phase 2 receipt:
`05a164f773ee7f9ade66b7db9886f110f8c50e11fb655cb6f28ad9ac3a0b89d6`.
It covers all 107 full table contents, 48 complete sequence states including
`is_called`, recorded definitions/catalogs/roles/grants, 62 applied migrations,
one approved historical rollback, account/audit evidence, service identity and
configuration, and all 54 original logos. No raw rows or credentials are exported.

After all test fixtures stopped, the same capture method produced an exactly
equal after receipt with the same SHA-256 above. Fresh project checks again
passed 15/15 and 116/116. The protected-file comparison also passed: 207 files
(204 prior inventory/review artifacts plus `.env`, `AGENTS.md` and `CLAUDE.md`),
355 recovery files, and all 1,015 existing `.next` files. Recorded byte sizes,
SHA-256 values, modification times and ACLs were unchanged where included in the
baseline; complete file inventories were unchanged. Normal TypeScript incremental
checking is not claimed to preserve its ignored `tsconfig.tsbuildinfo` cache.

The final resource inventory independently confirmed all 11 recorded task
container identities and their volumes/networks absent, plus all three production
application PIDs and mirrors absent. Copied logos, temporary credentials, browser
profiles and dependency junctions were removed with their owned resources. No
cleanup mutation was needed at the final inspection. Earlier failed-browser
cleanup diagnostics are retained separately; the final browser cleanup and project
preservation receipts pass. `browser-fixture.json` is the initial creation record;
its initial `cleaned: false` is superseded by the explicit final cleanup receipts.

Migrations 60–62 retain these SHA-256 identities:

| Migration | SHA-256 |
|---|---|
| 60 | `7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5` |
| 61 | `87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904` |
| 62 | `88ab034517f76e152e944f1a0949edc175a286c7bfeefe82fba0672c6b86f6c1` |

The external package retains exact changed-file statistics, passing and diagnostic
logs, sanitized browser evidence, cleanup/preservation receipts, a complete
file-name/byte-size/SHA-256 manifest, and the single-commit full-index binary
patch. Patch and ZIP identities, reverse-check result and final Git state are
recorded after commit. Raw dumps, credentials, original logo files, source data,
environment files and recovery-package contents are excluded.

## Review boundary

No owner acceptance is claimed. Screen-reader speech is not claimed; browser
accessibility-tree/live-region evidence is distinct from speech testing. Failed
transactions can consume PostgreSQL sequence values on disposable copies; the
audit rollback proof compares business/receipt/event contents and does not claim
sequence rollback. No-op proofs separately compare complete sequence state.

The next action is independent Phase 3 review. Phase 4 remains the next development
phase, unstarted and requiring its own authorization. D43/D51 final reconciliation
and Task 4.1a remain outside this mandate.

## Acceptance addendum — 10 September 2026

After this implementation report and its external delivery receipt were completed,
the preserved [independent Phase 3 review](../reviews/2026-09-10-task-4-1-phase-3-independent-review.md)
passed with no blocking implementation finding. Khaled Helmy accepted Task 4.1
Phase 3 on 10 September 2026 at implementation commit
`77baf2af2d079457f28ce1632f68e3f411cbdc48`.

This is a later owner decision, not a change to the implementation checkpoint.
All application, browser and database results in this report remain supplied
historical implementation evidence. This documentation-only acceptance task runs
fresh documentation and Git checks only; it does not rerun or newly claim those
application results.

The late acceptance-matrix documentation and untested screen-reader speech remain
disclosed limitations. A later Phase 4 mandate must record its acceptance matrix
before execution and define any screen-reader speech verification; neither item is
claimed resolved here.

Task 4.1 overall, Phase 4 and Task 4.1a remain unchecked. The immediate stop is
independent review of this acceptance-documentation commit before separately
authorized publication. Phase 4 — Final acceptance remains the next development
phase, unstarted and requiring its own authorization. D43/D51 reconciliation and
final cutover remain separate.
