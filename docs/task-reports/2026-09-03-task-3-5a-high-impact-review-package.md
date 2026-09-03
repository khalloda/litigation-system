# Task 3.5A — Prepare the high-impact quarantine-review package

- Implemented: 3 September 2026; the bounded validator correction is pending
  independent review of the two local commits
- Codex model: GPT-5.6 Sol
- Reasoning effort: high
- Environment: Local
- Subagents: prohibited; none used
- Expected qualitative usage: high
- Least-expensive safe configuration rationale: one local agent could inspect
  the existing PostgreSQL evidence, reuse the installed ExcelJS dependency,
  generate and validate the ignored workbook, and render it through the
  already-installed local Excel application without external services or a
  second implementation context.
- Starting commit: `e7c4c0337561f21667d417294b2a1442596f01e5`
- Package commit: `c20c0fda1bc9ea8795b5c5fa866caa2c01e1ef7e`
  (`feat: prepare Task 3.5 quarantine review package`)
- Validator correction: the enclosing commit named
  `fix: close Task 3.5A validation gaps`; record its SHA after creation because
  a content-addressed commit cannot contain its own SHA
- Push status: not pushed; `origin/main` remains
  `e7c4c0337561f21667d417294b2a1442596f01e5`
- Exact authorized stop point: one local correction commit after the package
  commit, one correction-only external full-index binary-safe review patch,
  and no workbook or database write or answer application
- Exact next return point: firm completion of the Task 3.5 workbook; Task 3.5B
  answer application remains separately authorized future work

## Run configuration and cost rationale

This was a bounded read-only database and workbook task. The implementation
used the repository's existing ExcelJS and PostgreSQL tooling and performed no
web, cloud, Graphify, browser, plugin or external-storage operation. No
dependency was added. Local Microsoft Excel was used only to open the generated
artifact read-only and render sheet segments for visual inspection; it did not
save the workbook. The generated XLSX and its checksum manifest remain ignored
and untracked.

The mandatory preflight fetched `origin` and proved `main`, clean HEAD and
`origin/main` all at
`e7c4c0337561f21667d417294b2a1442596f01e5`, 0 ahead / 0 behind, with no Git
operation active. Migration 59 remained
`20260903160000_secure_user_account_lifecycle` at SHA-256
`364c04d7cf96a476cf3efaf092c5ffc7ad99389cf51a70b8b31d8f9d0268f15d`.
PostgreSQL 17.11 reported all 59 migrations applied plus the approved
historical rollback, and all 92 permanent invariants passed before editing.

The validator correction used the owner-mandated GPT-5.6 Sol / high / Local
configuration with expected medium usage. Subagents were prohibited and none
were used. The spreadsheet skill supplied the preservation, exact-validation
and visual-integrity discipline, while the existing ExcelJS implementation
remained authoritative for this repository. Because the correction did not
author or edit the XLSX, it did not replace ExcelJS or create an alternate
artifact.

Its mandatory preflight fetched `origin` and proved clean `main` at package
commit `c20c0fda1bc9ea8795b5c5fa866caa2c01e1ef7e`, parent and `origin/main`
`e7c4c0337561f21667d417294b2a1442596f01e5`, exactly 1 ahead / 0 behind, no
Git operation, the exact nine-file package inventory, the workbook SHA-256
above and unchanged migration 59.

## Approved and prohibited scope

Decision **D26** requires the firm, not the software, to decide the 55
quarantined matters and 327 quarantined hearings before Stage 4. Task 3.5A was
limited to a reproducible Arabic/RTL decision package, a read-only validator,
focused adversarial fixtures and their necessary status/evidence documentation.

The task did not resolve, release, transform, insert, update or delete a
quarantine, matter, hearing or lookup row. It did not infer a client, court,
classification or circuit; import an answer; create a migration; alter Prisma,
authentication, authorization, audit behavior or Stage 4 code; change D26; add
a dependency; modify a lockfile; start Task 3.5B or Task 4.0; or push.

## Principal outputs and changed files

The generated ignored package is
`_migration/review/task-3-5-high-impact-quarantine-review-2026-09-03.xlsx`,
with adjacent manifest
`_migration/review/task-3-5-high-impact-quarantine-review-2026-09-03.xlsx.sha256`.
The XLSX is 162,864 bytes with SHA-256
`3b0ba712f20eda42db73d7df4816742f86c7aabb1918b82bf53762a7a94fca36`.
The ordered semantic identity-manifest digest is
`f6d63da36e2ebd28631929bebb302b7151c3729bf1ff4f2e60d950d426ffbee7`,
and the protected lookup-association digest is
`c71df1d140199cec2e61a66b4dcc8614503ac31cb40490ee5c78fd60e71e4c86`.

The five visible sheets are:

| Sheet | Purpose | Answer rows |
|---|---|---:|
| `اقرأ أولاً` | Plain-Arabic instructions, completion rules and priority explanation | 0 |
| `العميل غير الصحيح` | `separate_client` / wrong-client matters | 14 |
| `الدعاوى الأخرى` | Every other quarantined matter | 41 |
| `الجلسات التابعة` | Hearings held only because their parent matter is quarantined | 313 |
| `مشكلات الجلسات` | 11 circuit conflicts and three unknown-court spellings | 14 |

The four answer sheets therefore contain exactly 382 unique review rows. The
very-hidden protected `__identity` and `__lookups` sheets hold durable source
identity and immutable database-ID/Arabic-label mappings. Locked gray evidence
is visually distinct from unlocked blue answer cells; priority uses text as
well as color. The answer contract distinguishes correction, explicit final
unresolved status and incomplete discussion. A parent-held hearing may follow
its parent only after the parent's explicit decision is complete.

The tracked changed files are exactly:

- `package.json`
- `scripts/build-high-impact-review-workbook.ts`
- `scripts/validate-high-impact-review-workbook.ts`
- `scripts/lib/high-impact-review-workbook.ts`
- `scripts/test-high-impact-review-workbook.ts`
- `README.md`
- `TASKS.md`
- `docs/MIGRATION.md`
- `docs/task-reports/2026-09-03-task-3-5a-high-impact-review-package.md`

The later bounded validator correction changes exactly:

- `scripts/lib/high-impact-review-workbook.ts`
- `scripts/test-high-impact-review-workbook.ts`
- `docs/task-reports/2026-09-03-task-3-5a-high-impact-review-package.md`

It does not change the generated workbook, checksum manifest, workbook format,
Arabic labels, sheet inventory, row identity, evidence or decision meaning.

## Bounded validator correction

Pre-edit in-memory reproductions established four gaps in the package commit's
validator:

1. `ClientChoices` could be redirected to the exact `CourtChoices` range and
   validation still passed.
2. Reviewer-name, review-date and decision-note data validations could be
   removed and validation still passed.
3. A 201-character reviewer, dates before 2000 or after 2100, a 501-character
   free-text target and a 2,001-character note each counted as a completed
   decision when the remaining fields were valid.
4. A normal-width extra visible column containing an additional Arabic header
   and firm-like value was ignored and the workbook still reported zero
   answers.

The shared validator now derives the eight exact defined-name contracts from
the protected lookup manifest and compares the complete name inventory plus
each exact `__lookups` start/end range. Every answer cell is checked against
its exact list, text-length or bounded-date validation, including type,
operator, formulas, blank policy, error policy and editable/locked state. The
same 500/200/2,000-character limits and inclusive 2000-01-01 through
2100-12-31 date bounds are enforced semantically, so pasted or externally
edited values cannot bypass Excel's UI rules.

Any value, formula, hyperlink, note or other non-empty cell content beyond the
approved visible columns is rejected; harmless unused column formatting is
not treated as an answer. The generator already validates an existing workbook
before reaching its write step, so this same fail-closed check prevents it from
overwriting a workbook containing extra or out-of-contract firm content.

## Verification and exact results

The pre-edit repeatable-read, read-only database inventory returned exactly:

- 55 matters: 18 `unmapped_importance`, 14 `separate_client`, 10
  `branch_requires_review`, five `classification_conflict:matter_category`,
  four `classification_conflict:matter_type`, three
  `court_remainder_is_hearing_note`, and one `matter_no_client`;
- 327 hearings: 313 `parent_matter_quarantined`, 11
  `court_circuit_conflict`, and three `unmapped_court`.

`npm run review:high-impact:build` opened an explicit repeatable-read,
read-only transaction, verified the pinned counts and digests, generated the
artifact in stable semantic order, and immediately round-trip validated it.
`npm run review:high-impact:validate` reported **0 complete, 382 incomplete,
0 invalid** and status **INCOMPLETE**, which is the truthful result for an
unanswered package.

Early implementation runs stopped on three defects before the final artifact:
a quoted very-hidden-sheet reference in a named-range assertion, platform
newline normalization in a manifest fixture, and an unset default cell-lock
value being treated as explicitly unlocked. Each contract was corrected and
the final generator, validator and focused suite passed; none of those attempts
wrote to PostgreSQL.

`npm run test:high-impact-review` passed all focused fixtures. It proves stable
semantic reproduction and rejects an omitted matter, duplicated hearing, row
moved without its identity, altered source identity, changed reason evidence,
altered lookup ID/label association, stale target, correction without a
target, parent-following hearing with an incomplete parent, writing SQL,
non-read-only transaction and an artifact entering Git. Only 382 complete,
internally consistent explicit decisions can produce a complete result.

The correction fixtures additionally reject redirected, shortened and expanded
named ranges; missing or altered reviewer/date/note validations; altered
decision, lookup-target and free-text-target rules; overlong target, reviewer
and note values; both out-of-range dates; and a populated extra visible column.
Exact text limits and both inclusive date boundaries remain valid. Every
pre-edit bypass now fails for its intended reason, while the unchanged
unanswered workbook remains **0 complete, 382 incomplete, 0 invalid**.

The first sandboxed focused-test invocation reached the final Git-artifact
check and then stopped because Windows denied Node's read-only `spawnSync git`
with `EPERM`. The unchanged command was rerun with permission for that local
Git subprocess and passed. The first sandboxed `npm run check` invocation
similarly passed its substantive checks through user management, then stopped
when `check:gitignore` received the same `spawnSync git EPERM`; its unchanged
permitted rerun passed completely. These were execution-sandbox limits, not
accepted test failures. A parallel attempt to start the final database checks
was abandoned when automatic permission review timed out; each required
read-only command was then run separately and passed.

All five visible sheets were inspected. The cover and representative beginning,
middle and answer segments of every answer sheet render right-to-left with a
frozen heading row, filters, readable wrapped Arabic, non-clipped material
sample fields, deliberate widths/heights, visible editable styling and
color-plus-text priority. The corrected validator independently reads the full
workbook and proves every exact defined-name sheet/start/end range, complete
answer-cell validation contract, sheet protection, RTL/freeze/filter/layout
contract, absence of formulas and the two very-hidden sheets.

One hidden-Excel clipboard attempt produced a blank preview and left two
windowless Excel processes. Both processes belonged to this inspection and
were stopped; no Excel process remained. The affected middle-column segment
was then read directly from the unchanged XLSX, confirming its 12 wrapped
Arabic headers, widths and representative values without saving the workbook.

The final required gates passed:

- `npm run check`
- `npm run db:verify`
- `npm run db:check` — 92/92 invariants
- `npm run db:migrate:status` — 59 migrations applied and current
- `git diff --check`
- exact scope, migration, dependency, lockfile, secret, raw-data and artifact
  scans

The generated XLSX and checksum manifest are both ignored and untracked, and
the negative Git-artifact fixture rejects a tracked copy. No disposable
database or session remains.

No production build was requested or needed: Task 3.5A adds local TypeScript
workbook tooling and documentation, not application runtime code. TypeScript,
ESLint, Prettier and all permanent source checkers passed through
`npm run check`.

## Protected counts, hashes, digests and invariants

The generator re-proved the authoritative extraction SHA-256
`40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979`.
Its independently serialized relevant quarantine-evidence digest is
`bb3ca71e490123dd0e8d9da7665b73bdae37e3d607fd2e6746b89862fef7ed2a`.
The 679 approved client/court/importance/branch/category/type lookup rows have
digest
`1852b58e40986aaea93eec61624562f11c233902ae6cd38852a9ad804d07debe`.

Migrations 1–59, migration 59's file checksum, all 92 permanent invariants,
quarantine counts and reasons, project rows, roles, 448 authorization
decisions, audit evidence and protected business/reconciliation digests remain
unchanged. Generation and validation use read-only transactions, and the
focused source guard refuses writing SQL or a transaction that is not declared
read-only.

## Unresolved items

All 382 review rows are deliberately incomplete. The firm must enter explicit
answers in the ignored workbook; blank or `يحتاج إلى نقاش` rows do not complete
Task 3.5. No generated choice is an approved answer. Applying those answers is
Task 3.5B and requires separate authorization, validation and reconciliation.
Overall Task 3.5 therefore remains unchecked, and Task 4.0 has not started.
