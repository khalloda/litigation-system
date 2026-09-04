# Task 3.5A — Prepare the high-impact quarantine-review package

**Historical sections below record the 3 September package and its first
validator correction.** Both were subsequently accepted and pushed. The
[4 September D39 correction](#d39-client-review-contract-correction--4-september-2026)
at the end records the current workbook, decision meaning and return point.
Earlier wrong-client wording, empty-answer counts, hashes and push status are
historical evidence, not the current state.

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

## D39 client-review contract correction — 4 September 2026

### Authority, preflight and reproduced defects

The owner explicitly authorized this bounded correction using GPT-5.6 Sol,
high reasoning, Local, with no delegation. The spreadsheet skill guided
preservation and visual verification; the requested installed ExcelJS 4.4
implementation and actual XML remained primary. No dependency was added.

After fetching origin, `main`, HEAD and `origin/main` were all
`4957bb59680c8073d34afd6ffa630bafff5bf0be`, 0 ahead / 0 behind, with a clean
working tree and no Git operation active. D38 was the final decision. Migration
59 retained SHA-256
`364c04d7cf96a476cf3efaf092c5ffc7ad99389cf51a70b8b31d8f9d0268f15d`.

Before editing, the owner-saved v1 workbook was read without saving it. Exactly
one editable answer existed: Y2, review `M-000063`, target
`197 — شركة سيجما للصناعات الدوائية`. Its protected identity and lookup row
resolve system client 197 to stored legacy/Access ID 188. Other editable
answers were empty; the locked hearing target `غير مطلوب` is not an answer.
The current validator rejected that genuine Excel-saved workbook with
`M-000063: decision: data-validation contract changed`. Its actual worksheet
XML stored `DecisionStatuses` and `ClientChoices` without the leading `=`;
the validator required the equal-prefixed forms.

The identity presentation also obscured two independent key spaces, and the
blanket wrong-client wording did not reflect the owner's branch clarification.
Those issues are corrected without changing historical database evidence.

### D39 and exact authorized answers

[D39](../DECISIONS.md#d39--reviewed-sigma-and-alpha-branches-retain-their-existing-parent-clients)
records the owner's current decision: all Sigma entities in these 14 records
are branches/subsidiaries of existing main Sigma, Access/legacy 188, system
client 197, current full name `شركة سيجما للصناعات الدوائية`, short name
`سيجما`. Alpha (`ألفا مصر للتجارة`) belongs to existing `الفطيم`,
Access/legacy 2, system client 11. There is no reassignment, new client or
client rename. Sigma Tech party text does not authorize another branch lookup.

D39 supersedes D19 only for `سيجما للصناعات الدوائية`,
`سيجما للإعلام (تليفزيون الحياة)` and `ألفا مصر للتجارة`. D19's historical
text, migration 0007, existing crosswalk rows, source payloads and quarantine
evidence are preserved. Their database interpretation has not yet been applied.

All fourteen rows use `الارتباط الحالي صحيح`, reviewer `خالد حلمي`, date
2026-09-04 and a D39 branch-parent note. The independent per-parent hearing
count is:

| Review identity | Access matter ID | Access / legacy client ID | Retained system client ID | Eligible hearings |
|---|---:|---:|---:|---:|
| M-000063 | 425 | 188 | 197 | 22 |
| M-000066 | 514 | 188 | 197 | 6 |
| M-000068 | 529 | 188 | 197 | 1 |
| M-000069 | 530 | 188 | 197 | 16 |
| M-000070 | 629 | 2 | 11 | 6 |
| M-000073 | 653 | 188 | 197 | 11 |
| M-000075 | 971 | 188 | 197 | 7 |
| M-000076 | 1079 | 188 | 197 | 28 |
| M-000080 | 1139 | 188 | 197 | 3 |
| M-000081 | 1156 | 188 | 197 | 3 |
| M-000086 | 1194 | 188 | 197 | 1 |
| M-000087 | 1364 | 188 | 197 | 13 |
| M-000098 | 1511 | 188 | 197 | 33 |
| M-000100 | 1549 | 188 | 197 | 11 |
| **Total** | **14 matters** | | **13 Sigma, 1 Alpha** | **161** |

Each of the 161 independently enumerated hearings has only
`parent_matter_quarantined` and one of those exact parents. Each records
`يتبع القرار المعتمد للدعوى`, the same reviewer/date, and its exact parent
review ID in the note. The generator checks the complete parent inventory,
sole reason, 161 total and each per-parent count before populating any answer.
No hearing with another independent problem is answered. The result is
**175 completed, 207 incomplete, zero invalid**, not a completed Task 3.5.

### Versioning, identities and validation contract

The successor is
`_migration/review/task-3-5-high-impact-quarantine-review-2026-09-04.xlsx`.
It is **171,167 bytes**, SHA-256
`ff2e72fe7d3910ec78e95f1046c57193075b7a1f89d4ccf60adea15e590b1c8e`.
Its adjacent `.xlsx.sha256` manifest is 121 bytes, SHA-256
`cba0ceb8eeb5f9074b06281058cb0a042b9c5af946b4f31066b29b68fa76bf4d`.
Both artifacts remain ignored and untracked. Creation refuses to overwrite
either output and uses exclusive creation for each file.

The preserved owner-saved predecessor is 186,465 bytes, SHA-256
`0e9d9fed686e2b158bf4eb73409bedff7fa05e29c80b91be8a5fc2240821a324`.
Its historical 121-byte manifest remains SHA-256
`5d035fdab1b4194f4c8d23c28ae3be6fc4f410273985c93b57b5948b551ac774`.
That manifest still records the original generated v1 file, not the later
owner save; it was deliberately not rewritten. Both old hashes were checked
again after generation and verification.

The one existing selection transfers through review ID, source record key and
protected client ID, not a visible row number. The inspected predecessor's
exact bytes are pinned: any further save requires fresh inspection before a
transfer. A reordered-successor fixture proves the transfer follows identity.

Format v2 displays `Access 188 | النظام الجديد 197 | ...`, with
`clients.legacy_id` explicitly identified in evidence. Resolution joins the
actual stored legacy and system IDs; there is no offset calculation. Both
real duplicate-name client pairs remain distinguishable. The protected lookup
manifest now includes legacy IDs, and protected review identity includes the
resolved current system client. The v2 identity digest is
`cd2333e5f90af9c418aa58a4f6d96fc98d383651b0ef9c548330b2046491289a`;
its lookup manifest digest is
`95d360e64cb6880f2111440325d83caed6e923ea1de2a0313c32d00af6903d65`.
These are separate from the preserved historical v1 digests above.

`الارتباط الحالي صحيح` is client-review-only. It requires the exact
protected current target, reviewer and date; another client or label-only
target is invalid. Missing target/reviewer/date cannot complete the decision.
`تصحيح معتمد` remains available for genuine reassignment. Court,
classification, branch, importance, circuit, text and parent-hearing rows
reject the new client-only status.

Only the nine approved direct list references accept one optional leading `=`.
The exact defined-name destinations and all other validation attributes remain
enforced. Permanent fixtures reject wrong names (including another approved
list used at the wrong destination), redirected/shortened/expanded definitions,
sheet/range expressions, `INDIRECT`, leading/trailing whitespace, double equals,
quoted/calculated alternatives, changed case, missing validation and changed
protected lookup/current-client associations. Existing length/date/extra-column
and evidence/identity fixtures remain active. A deliberately non-arithmetic
system ID fixture proves resolution uses the stored relationship.

### Real Excel round trip, XML and visual evidence

A disposable successor created by the same generator was opened and saved by
local **Microsoft Excel 16.0, build 20326**. The saved file passed the complete
validator and semantic answer fixture: exactly the 14/161 authorized answers
remain, and all 207 other rows remain unanswered. The final generated workbook
and the Excel-saved copy have identical semantic values and lock states across
all 20,867 compared cells.

Actual XML confirms that Excel removed the leading `=` from all nine direct
named validation references. Both files retain zero formula cells, zero error
cells, seven protected sheets, two very-hidden sheets and 1,597 unlocked answer
cells. All five visible sheets and the lookup sheet are RTL; the internal
machine-identity sheet remains LTR. Complete validation independently verifies
exact named destinations, evidence, locked cells, limits and layout contracts.

All five visible sheets were rendered locally through native Excel: the
instructions and evidence/middle/answer segments of each of the four answer
sheets, thirteen previews in total. The inspected Arabic text, explicit IDs,
answers, headers and dates are legible with no material clipping in the sampled
regions. Full-workbook source checks cover RTL, wrapping, row heights, column
widths, freezing, filtering and protection; sampled renders do not claim that
every long source cell was visually inspected. The spreadsheet renderer's
initial read-only preview mishandled blank shared strings, so it was not used
as value evidence; installed ExcelJS, actual XML and native Excel were primary.

The first hidden-Excel save was slow; an overlapping retry safely refused a
read-only open. Immediate post-Quit process checks also ran before asynchronous
Excel shutdown and reported a cleanup failure. A subsequent exclusive native
Excel open/save succeeded, and later process checks confirmed no Excel process
remained. No project workbook was opened for writing in those tests. Temporary
copies and previews were removed after verification. No browser or interactive
browser test was used or claimed.

### Verification, preservation and stop point

The following passed for this correction:

- Complete `npm run test:high-impact-review`, including the new adversarial
  fixtures and a repeat run against the real Excel-saved disposable successor.
- `npm run check` (TypeScript, lint, formatting and permanent source checks).
- Read-only `npm run db:verify`: 59 applied migrations plus the approved
  historical rollback, unchanged provenance and security foundation.
- Read-only `npm run db:check`: **92/92 invariants**.
- `npm run review:high-impact:build` and
  `npm run review:high-impact:validate`: matching manifest, 175/207/0.
- Actual XML, full semantic comparison, native Excel round-trip validation and
  thirteen visual previews covering every visible sheet.
- `git diff --check`; exact scope, migration, dependency, lockfile, secret,
  raw-data, binary, workstation-path and ignored-artifact checks.

Sandbox restrictions initially prevented esbuild/Git subprocess creation; the
unchanged required commands passed when permitted. A temporary XML inspection
helper initially assumed that every sheet was RTL; inspection corrected that
assertion to the existing LTR machine-identity sheet. No workbook or product
contract was changed to satisfy that helper. No build or disposable database
suite was required for this local workbook/documentation correction.

Before and after, the same repeatable-read, read-only fingerprint covered all
93 tables in `public`, `staging`, `quarantine` and `_migration`, including
migration and audit evidence. It hashes each table's count and sorted JSON row
digest. Every table count and digest matched, with inventory SHA-256
`ab80e049a4313bfba5f79a10f43f4c0c8f078b4ba854a3a9260fae5c738f5476`.
No PostgreSQL write was issued. All migrations 1–59 are byte-identical to HEAD.
No transform, Prisma model, dependency, lockfile, runtime storage or existing
raw artifact changed.

The evidence digest remains
`bb3ca71e490123dd0e8d9da7665b73bdae37e3d607fd2e6746b89862fef7ed2a`,
and the historical 679-row database lookup digest remains
`1852b58e40986aaea93eec61624562f11c233902ae6cd38852a9ad804d07debe`.
Protected business evidence remains 5,209 rows, digest
`b50879f52200275e70515cb4e1daa76594c304237a40b864205108e15490aeab`;
actor attribution digest remains
`edf4be9e8668fc65005deaa69cababf79dec1ac1b3e12f2356b9e6da892c009d`.
Counts remain 318 clients, 188 contacts, 1,689 matters plus 55 quarantined,
13,055 hearings plus 327 quarantined, 8,884 attendees, 3,694 administrative tasks
plus 544 quarantined, 3,483 steps plus 769 quarantined, 331 fees, billing
543/597/47, 4,022 attendance rows, and 54 logos totaling 1,541,428 bytes.

The exact nine changed tracked files are:

- `README.md`
- `TASKS.md`
- `docs/DECISIONS.md`
- `docs/DATA-MODEL.md`
- `docs/MIGRATION.md`
- `docs/task-reports/2026-09-03-task-3-5a-high-impact-review-package.md`
- `scripts/build-high-impact-review-workbook.ts`
- `scripts/lib/high-impact-review-workbook.ts`
- `scripts/test-high-impact-review-workbook.ts`

The enclosing local commit is `fix: correct Task 3.5 client review contract`,
parent `4957bb59680c8073d34afd6ffa630bafff5bf0be`. Its SHA and the one
correction-only full-index binary-safe external patch hash are reported after
creation. No push is authorized. The final local branch is one commit ahead
and zero behind origin, with a clean working tree.

**Remaining risk and return point:** this workbook records owner decisions;
it does not yet enforce branch-parent compatibility in the database. Task 3.5B
must choose the smallest correct enforcement before applying the three exact
D39 branches, prevent an unrelated parent association, preserve historical
evidence, create truthful audit events and reconcile all downstream references.
That work is not implemented. Stop for independent review, then firm completion
of the 207 remaining answers. Task 3.5B and Stage 4 remain unstarted.
