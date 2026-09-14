# Task 4.4 Phase 2 — administrative-work and step editing

14 September 2026. Implemented, pending independent review; **not activated or pushed**.
The actual database remains at migration 67. Overall Task 4.4 remains unchecked.

## Authority and delivered behavior

Khaled's direct message accepted the Phase 1 publication PASS at
`fbf47d7fc0e5a1405a8798838243289d2d31898f` and adopted the attached bounded Phase 2
proposal/prompt, including D62. One Local Windows Codex Desktop agent implemented
this phase directly in the requested working tree. No subagent, second task,
remote publication, real migration/activation, archive/restore implementation or
later-task work was used. The owner expressly authorized testing copied project
data on task-owned disposable full-state copies.

Administrator, Litigation Assistant and Paralegal can create/edit administrative
works and their steps. Lawyer retains reads. The existing list/detail flow now
offers the appropriate controls, with validated filter, return and step-page
context. Each new task deliberately chooses a matter or no matter and a business
creation date or not recorded. Existing parent links remain fixed. New steps are
created under their exact task. An archived matter blocks saves for every writer;
an archived client alone does not block an otherwise active matter.

All thirteen approved task fields and four approved step fields are supported.
New assignments use existing active staff IDs, independently of login eligibility;
court/destination selections use active IDs. Every eligible option is reachable
without a silent cap. Existing inactive references remain labelled and can be
retained, cleared or replaced. A new task needs required-work text; a new step
needs result or report. Unchanged historical gaps do not force cleanup.

Stale forms retain their draft and explain the conflict in Arabic. Pending saves
are guarded against double submission. If a response is lost after commit, inputs
freeze and retry sends the exact original token/payload; one record is created.
No automatic today, inferred follow-up date, task status machine, notification,
new export, attachment or history screen is introduced.

## Database boundary and preservation of imported evidence

Migration `20260914160000_admin_work_editing_boundary` is the only new migration.
Migrations 1–67 and their bytes remain frozen. It snapshots the complete imported
task/step rows into immutable original evidence, gives tasks a positive aggregate
version, and adds separate positive native-step ordering, uniqueness, append-only
complete before/after change history and owned submission receipts. Imported
source ordinals retain their recorded order; native steps append afterward.
Native Access provenance and hidden nextAppointment are NULL. Date/content edits
do not reorder steps; no deletion or relinking is available.

Two narrow public gateways expose state and save. Current server-derived account,
role, staff identity, session version/expiry and trusted audit actor are rechecked
at the committing boundary, including retries. Locks coordinate the task,
matter, assignment eligibility and account/staff changes. Direct runtime table,
sequence and internal gateway bypasses remain denied. Any changed task/step save
advances the task version once and atomically commits its business values,
complete history, audit and receipt. A true no-op changes none of those or any
sequence. Original source fields, parents and ordering are protected separately
from current editable facts.

The permanent checker still reconciles every original imported row and approved
mapping through the immutable original projection. It separately validates current
state against continuous history, audit facts and exactly owned receipts. It also
checks exact gateway definitions/grants, triggers, defaults and ordering/version
constraints. Four permanent administrative checks bring the historical full-state
profile from 131 to 135. The original administrative transformation/date-backfill
scripts now refuse application after this boundary instead of rewriting evidence.
No expected source baseline was replaced with edited production output.

Payload semantics are explicit: omission preserves an update field; JSON null
clears a nullable field; empty text is empty text where completeness permits. The
UI maps a deliberately emptied optional control to NULL. Unchanged text preserves
Unicode, spacing and original line endings. Changed textarea text uses the browser's
entered line endings. Completeness whitespace handling agrees between JavaScript
and PostgreSQL, including nonbreaking/Unicode spaces and U+FEFF.

Measured imported maxima were required work 546, task result 272, previous decision
395, last follow-up 233, circuit 49, status 7, alert 5, step result 245 and report 5.
Changed status is limited to 160 UTF-16 code units to remain usable in the accepted
status filter; other text allows 10,000 Unicode code points. Each boundary checks
its serialized JSON against 200,000 UTF-8 bytes. Dates are calendar-valid date-only
values in years 0001–9999. These are technical bounds, not legal rules or a reason
to truncate historical data. Unknown/excluded/source/actor/parent-update fields,
invalid IDs and duplicate JSON keys are refused.

## Executed verification and source binding

Evidence root: `D:\Projects\LitigationData\review-evidence\task44-phase2-20260914`.
The [acceptance matrix](../testing/task-4-4-phase2-acceptance-matrix.md) maps claims
to the evidence. Each proof used a distinct localhost-only PostgreSQL 17.11 cluster
with a task-owned volume/network, current source read through a consistent exported
snapshot, and a separate production build/browser runtime. No dump file was created.
Source volumes were 3,694 administrative works and 3,483 steps within the full
project state, including 13,279 hearings, 4,207 original tasks and 1,730 matters.

The completed final backend proof is `run05`, reused with explicit exact-source
checks for the later UI-only corrections. It newly executed:

- All 131 pre-migration checks on the restored original state, a forced late
  migration failure with complete rollback equality, migration 68 and all 135
  post-migration checks before test accounts/native records were introduced.
- Seven primary mutation result groups: all three writers create/edit both types,
  every allowed field, NULL/date/Unicode/multiline cases, exact retries, complete
  no-op equality, strict input and runtime bypass refusals, legacy description
  gaps, archived-parent refusal with four-role reads, native provenance and stable
  append order through the actual paged production reader.
- Twelve adversarial result groups, including observed lock overlaps for task/task,
  task/step, account revocation, staff/lookup deactivation and matter archive.
  Assertions require the expected stale/session/invalid/archived refusal, rather
  than accepting any exception. Invalid authority, retained inactive references,
  archived-client allowance, original/current-history corruption and dropped
  uniqueness/check constraints are covered by rejecting controls.
- The independent R1 ID oracle: twelve candidate branches, four roles, Western and
  Arabic-Indic inputs, full expected IDs/counts across pages/filters, and the
  existing exact/partial/suffix/leading-zero/literal-wildcard negative controls.
  Expected results do not reuse the production ID predicate.

There were zero source steps with both result and report missing. That edge case
was exercised as an explicitly labelled scalar completeness fixture; it is not
claimed as an existing source record. The real missing-description task was also
tested without forced cleanup.

Late audit failure on an update preserved complete state. A deliberately failed
native insert reserved exactly one administrative task ID: sequence last_value
11087 → 11088, log_cnt 32 → 31, is_called remained true. Rows, history, receipts,
audit and all other sequence vectors remained equal. This is an honest PostgreSQL
reservation, not a no-op, and no sequence was rewound.

`run06` passed the production browser proof, final 135 checks and the permission
suite after the checkbox target correction. Visual inspection then identified a
new-task-only date instruction on step forms. `run07` rebuilt and exercised the
final editor with that instruction restricted to task creation, then passed the
final 135 checks and permission suite. Both runs preserve the exact `run05`
database, service, schema, checker and proof-helper source. The guarded reuse mode
also reconstructs the one-line editor predecessor and verifies its recorded hash.
The exact 8,110-byte `run05` test driver was recovered and hash-verified, not rerun
or relabelled. Its SHA-256 is
`03a0eeb7df689298f493ad3823e652b794fee189397a8130c4ef46c52676942c`.

The final production browser proof covers four-role navigation/reads, Lawyer
denial of all four editing routes, each writer's task/step create/edit/cancel/save,
validation drafts, task/step conflicts, preserved return filters and one committed
create after a lost-response retry. It checks labels, automated accessibility,
44-pixel control targets, RTL, keyboard traversal/visible focus, 320-pixel reflow
and genuine Chrome 200% zoom. Screenshots were also visually inspected. There were
no external browser requests. Screen-reader speech and full accessibility
conformance were not tested or claimed.

The 448-entry permission matrix and required negative controls passed, including
route/action discovery and rejecting unclassified, late, conditional or weakened
guards. Route inventory is 88 entries; the role matrix itself is unchanged. The
guard suite ran separately against an owned empty cluster: 12 parser cases and
10 guard cases fully proved, without destroying project data or using overrides.
Final `npm run check` passed type, lint, formatting, encoding, RTL, route/permission,
audit/source and focused rejecting controls. The administrative read-only checker
now explicitly covers the retained read surfaces and its nine rejecting fixtures;
it does not pretend the new editor is read-only. Shared-source inventory changes
are exact reviewed pins and narrow raw-query classifications.

Historical broad read/layout reports remain immutable supporting context, not new
test executions. New evidence above covers changed behavior and the required gates.
The canonical empty replay branch was not executed; the full historical upgrade
branch was. No reset override, dependency installation or paid service was used.

## Failures and bounded recovery

All retained attempts are distinguished from the final relied-on evidence:

- The first `node --import tsx` invocation produced no proof. Execution used the
  installed tsx CLI thereafter. The initial foundation run proved its then-current
  migration but is not evidence for the final migration bytes.
- `run02` passed primary mutations but failed the final source-checksum gate after
  source was changed during execution. It is not a final frozen-source proof.
- `run03` stopped at a test fixture's incorrect `teams` table name. Earlier broad
  task/step/account rejection assertions could accept token mismatch or deadlock;
  these are not accepted concurrency proofs. The fixture and lock order were
  corrected and precise refusal codes were required in `run04`/`run05`.
- `run04` completed backend proofs but the browser harness matched both the form
  alert and Next.js route announcer. The locator was scoped to the form. Subsequent
  Unicode completeness and constraint checks are represented by `run05`, not this
  earlier migration version.
- `run05` completed the final backend proof, then the browser's 44-pixel target
  assertion found a real 24-pixel checkbox. It was enlarged to 44 pixels. `run06`
  passed. Final visual review then removed the unrelated date instruction from step
  forms; `run07` is the final browser/build and completion evidence.

Every completed attempt's own cleanup removed only its owned test resources.
Failed logs/source manifests remain available; a failure is not relabelled PASS.

## Actual owner-state preservation and delivery

Complete original/final per-table counts and digests match for all 119 tables,
including migration, accounts, sessions, audit and imported data. All 48 individual
sequence vectors (last_value, log_cnt, is_called), sequence metadata digest and
role/grant/function/catalog digest match. These are supplied vectors and digests,
not exported row payloads or a claimed dump of private PostgreSQL role passwords.
Separate timestamped windows and the final cross-window receipt are in the package.

All 54 logo path/size/hash identities and 166 prior evidence-file identities match.
Local protected configuration hashes match; security-secret-bearing configuration
and its private baseline are excluded from the package. AGENTS.md, CLAUDE.md,
D1–D61, all 86 TASKS checkbox lines, frozen migrations and the adopted attachments
were verified unchanged. The supplied Phase 1 publication PASS review is imported
verbatim. No earlier report/review/matrix was edited.

The owner app was already stopped when this task began: no port-3000 listener and
no former PID 70060. That observed state was preserved. Accepted build ID
`6STn5JeaidE5AnbLqEJc8` remains in its original accepted runtime directory. This task
did not restart, replace, rebuild into or log into the owner app. Disposable browser
mirrors, listeners and exact test database/container/volume/network resources were
removed; pre-existing Docker resources were preserved.

The one local candidate has sole parent
`fbf47d7fc0e5a1405a8798838243289d2d31898f` and subject
`feat: add administrative work and step editing`. Its exact SHA, raw commit,
recursive tree, complete changed paths/statistics and final clean main/1-ahead/
0-behind observation are recorded externally, avoiding a circular self-reference
inside the commit. A fresh authorized main-only fetch verifies the unchanged base.

Delivery includes the exact full-index binary-safe patch (reverse applicability
checked without application), sanitized review ZIP, complete external manifest,
independent ZIP reopening verification and separate final receipt. The ZIP supplies
the complete committed source tree, adopted contract/prompt, necessary test/authority
dependencies, logs, source/build bindings, preservation/cleanup receipts, screenshots
and reproducible helpers. The verifier checks every member's identity, exact set,
safe path and regular-file status, and independently reconstructs the Git commit
and complete tree from supplied bytes.

Installed dependencies were reused read-only using the established Windows mirror
method. Lockfile and 25 declared dependency metadata files were bound and compared;
this is a bounded dependency check, not a byte-for-byte audit of all installed
dependencies. Generated/build trees are supplied as identity manifests, not full
runtime bytes. Raw databases, dumps, logo files, credentials, generated dependency
trees and raw failure DOM/body dumps are excluded. The retained external failure
DOM files have manifest identities; screenshots may show authorized copied data.
The large context attachment is identified by hash without redistributing its
historical transcript. These limits are explicit in the package manifest.

Stop: independent implementation review, followed by separate owner decisions.
No actual activation, publication, archive/restore or later phase is implied.
