# Task 4.4 Phase 1 — read-only administrative works and task steps

Implemented 14 September 2026; **pending independent review**, not accepted or
activated. Current status and work order remain in [TASKS.md](../../TASKS.md).

## Authority, configuration and stop

Khaled adopted the bounded Phase 1 prompt and accepted the preserved
[Task 4.3 publication PASS review](../reviews/2026-09-14-task-4-3-publication-independent-review.md).
The review is exactly 7,562 bytes, SHA-256
`c9db1a5958304571f28d0515b79918e3dcb355d9a6027eddfab2bf88dfd71826`.
Decisions, permissions, glossary, migration-67 authorities and the Task 2.9
transform/oracle remain authoritative and unchanged.

- Environment: Local Windows, `D:\Projects\litigation-system`; no Cloud/WSL.
- Model/effort: active desktop selector not independently verified. The adopted
  prompt recommended GPT-5.6 Sol / High; no selector change is claimed.
- Subagents: prohibited; none used. Expected usage: moderate. Existing queries,
  layout and fixture infrastructure were reused; only affected failed checks
  were rerun. No purchases, hosted scans or plugin installation.
- Start: `98ba737300f1c0cefce361cb3da4e250b11b71d2`, tree
  `f30acf3df2f0a28dd25ab7be63e237f3bcb15e06`, sole parent
  `e5826056f30a5c5e2907c44b29641993e36092c0`.
- Final commit: the single local commit containing this report, subject
  `feat: add read-only administrative work screens`. Its full commit, sole
  parent and tree are recorded in the separate `delivery-receipt.json` and
  packaged `commit-identity.json`; embedding that commit's own hash here would
  change it. The exact patch and ZIP member manifest accompany that receipt.
- Remote: one authorized narrow fetch confirmed the start. No push. Final main
  must be clean and one ahead/zero behind the observed origin checkpoint;
  the separate receipt records the measured state.
- Stop: one local implementation commit, patch, verified review ZIP and separate
  receipt. Independent Phase 1 review is next. Overall Task 4.4 and every other
  existing task checkbox remain unchanged.

## Result and boundaries

All four usable authenticated roles can open `/admin-works` from the home page
or from a matter. The list has search, matter/client/person/status filters and
25-row server pagination. Detail shows business dates, multiline follow-up,
required work, results, previous decision, deadline, court/circuit/destination,
status, alert, canonical/raw person context and related matter/client links.
Raw stored text such as alert/report values is displayed without inventing a
new interpretation. Dates are PostgreSQL date text, without timezone conversion.

Steps show their date, performer, result and report, 25 per page, ordered by
source ordinal with NULLs last and PostgreSQL ID as tie-breaker. Search and
filter state survive list/detail/back and pagination. Imported and PostgreSQL
IDs are distinct; missing people and independently archived parents remain
readable. Aliases are searched through an existence query, avoiding duplicate
task rows. Missing values remain neutral; no reassignment or fuzzy matching.

The existing permission policy is unchanged, including future Paralegal editing.
Both pages and query helpers enforce view permission; helpers also revalidate
the live account/person/role/session version inside a read-only repeatable-read
transaction. Parameterized queries have bounded input and exact cardinality
checks. There are no new writes, actions, exports, migrations or schema changes.
`nextAppointment` is neither queried nor surfaced. Quarantine and source evidence,
including raw court 26 / circuit 26 / absent court, remain intact.

Navigation, shared Arabic/RTL styles, bundled fonts, logical CSS and centralized
strings follow the accepted matter/hearing patterns. New business field labels
use the exact Task 2.9 source labels; existing glossary/shared labels are reused.
The filter option set is capped at 4,000 and fails explicitly if exceeded;
search is capped at 160 characters. Future material growth requires revisiting
the option control, not removing its bound.

## Changed files

- `src/lib/admin-work-query.ts`, `src/lib/admin-works.ts`: guarded read services.
- `src/app/admin-works/page.tsx`, `[id]/page.tsx`, `loading.tsx`, `error.tsx`,
  `not-found.tsx`: list, detail and response states.
- `src/app/page.tsx`, `src/app/matters/[id]/page.tsx`, `src/strings.ts`: navigation
  and Arabic strings.
- `src/lib/auth/route-inventory.ts`, `scripts/lib/audit-source-inventory.ts`:
  two exact view routes and seven exact SQL call fingerprints; no broad exception.
- `scripts/check-admin-work-read-only.ts`, `scripts/test-admin-work-read-only.ts`,
  `scripts/lib/admin-work-browser-proof.mjs`, `scripts/lib/admin-work-edge-proof.ts`:
  structural negatives, independent SQL reconciliation and isolated browser/edge proof.
- `scripts/test-hearing-browser.mjs`: backward-compatible opt-in bounded dependency
  inspection and skipped redundant generation for unchanged Prisma schema.
  This necessary fixture dependency avoids scanning 40,000 dependency files;
  existing callers keep their old behavior.
- `package.json`: focused commands and inclusion of the read-only checker in `check`.
- `README.md`, `TASKS.md`, `docs/PRD.md`: relevant status pointers only.
- This report, [acceptance matrix](../testing/task-4-4-phase1-acceptance-matrix.md)
  and exact publication review above.

## Verification and evidence

Evidence root: `D:\Projects\LitigationData\review-evidence\task44-phase1-20260914`.
The delivery receipt distinguishes fresh proof, exact reused proof and final
source binding. Each payload's identity is verified in the external ZIP manifest.

| Command / check | Exact outcome and evidence |
| --- | --- |
| Git status/log/parent/tree/remote and narrow `git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main` | Exact clean starting checkpoint; fetch succeeded after supported scoped permission for `.git/FETCH_HEAD`; no push |
| Forced read-only source profile and exported snapshot restore | 3,694 tasks / 3,483 linked steps; separate owned PostgreSQL 17.11 cluster, loopback port, volume/network; no dump file |
| `node node_modules/tsx/dist/cli.mjs scripts/test-admin-work-read-only.ts --browser` (run1) | All four service proof groups PASS, production build PASS; browser harness failed because it counted the loading state before rows appeared |
| Same runner `--browser-only --browser` (run2) with run1 service evidence | Exact read-dependency/source-table binding accepted; synthetic edges PASS, production build PASS, browser interactions PASS, permissions PASS; later historical check failed on synthetic actor population |
| Same runner `--invariants-only` (run3) | Corrected ordering checks the untouched restored source with forced read-only connections: all 131 invariants PASS; exact fixture cleanup and actual before/after equality PASS |
| `scripts/test-permissions.ts --restored-fixture` in run2 | PASS, including direct route/action refusal, database role refresh, forced-password/disabled/inactive denials and inventory negative fixtures |
| Independent SQL read comparisons | Every one of 3,694 task details and 3,483 steps exact; each of four roles traversed all 148 list pages; no missing or duplicate IDs; step counts/order exact |
| Search/filter/return checks | PASS independent Arabic/diacritic/digit/JTI/Latin-J/literal wildcard searches, filter intersections, missing/unknown/malformed values, bounded pages and return paths; rendered clear/back/keyboard navigation PASS |
| Synthetic edge proof | PASS four-role duplicate-text distinct IDs, NULL parent/person, raw unresolved names, empty versus NULL status, long literal multiline text, 27 NULL-ordinal steps ordered by ID despite conflicting dates, clamped out-of-range history page |
| Parent archive cases | PASS fixture-only independent client/matter archive combinations for all four roles; no source transition |
| Browser accessibility and screenshot inspection | PASS Arabic/RTL, labels, visible focus, keyboard search, 44px targets, 320px reflow, genuine Chrome 200% zoom and zero scanner violations in audited states; full originals plus clearly named top crops retained |
| Ten `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` queries | PASS bounded output; measured 0.09–96.53 ms on this local disposable copy, not a deployment SLA; default page 8.51 ms, selected search page 96.53 ms, selected detail 0.22 ms |
| `npm run check` | Final complete gate result retained in `static-check.log`; typecheck, lint, formatting, RTL, authorization, exact audit inventory/self-tests, account/read-only checkers, gitignore and encoding all required before commit |
| `git diff --check`, focused formatting, final source/dependency verification | Required before commit; exact results and source hashes in delivery evidence |
| Patch and ZIP | Exact full-index binary-safe diff, per-file/total statistics, reverse applicability without applying, complete unique-member byte/SHA-256 verification; final identities external to this report |

Run1 SQL evidence remains valid: every read dependency and all six relevant source
tables matched run2 before reuse. All runtime/build inputs and unchanged browser
proof bytes are compared with final postimages. The final runner differs only in
test orchestration: permanent checks precede synthetic setup, an invariant-only
mode permits a bounded rerun, and actual preservation is checked on failure too.
Its affected path executed in run3. Unchanged Task 4.3 migration/lifecycle/race
proofs remain accepted evidence; no historical replay, backup or activation was
repeated.

Failures are retained and separated from product behavior. Run1's loading-state
race was fixed by waiting for the first rendered row. Run2's actor invariant
correctly rejected the 29 synthetic native rows attributed by maintenance setup;
moving the checkpoint check before setup corrected the harness without changing
an invariant or imported row. Early local tooling fixes included a CJS top-level
await inspection helper, a temporary helper caught by lint/encoding, strict audit
rejection of computed access and a forbidden database-factory import in a test
library, and a TypeScript environment-index type annotation. These were corrected
at their source; no guard override or auto-review rejection was bypassed.

## Protected state and limits

The source has 119 tables, 48 sequences, migration 67 and 54 logos. Fresh counts
match the permanent Task 2.9 oracle: 4,238 source tasks = 3,694 targets + 544
quarantines; 4,252 source steps = 3,483 targets + 769 quarantines. No target step
is detached; no task lacks a matter in the observed source. There are 1,741
missing assignees, 1,338 multiline follow-ups and a largest 53-step history.
NULL parent and duplicate/NULL-ordinal edge records were explicitly synthetic.

Source before/after receipts compare every retained table's full-row digest,
including migration ledger, user accounts/session versions and audit data, plus
sequence/catalog digests. This is aggregate equality, not exported account data.
Controlled service and browser reads separately preserve those digests after
fixture account/session setup. All actual access was forced read-only. No actual
login, account operation, migration, credential/configuration or ACL change occurred.
The initial sequence receipt inherited from accepted infrastructure covers
catalog attributes and last values. Supplementary forced-read-only captures
compare all 48 complete `last_value`/`log_cnt`/`is_called` states during final
verification. They also compare every source table/account digest back to the
initial baseline; the supplementary sequence capture is a final-window check,
not a retroactive claim about unrecorded internal sequence fields.

Scoped preservation compares 19 named prior inputs and 54 logo files, and checks
PID 70060, its creation identity, listener 127.0.0.1:3000 and accepted build
`6STn5JeaidE5AnbLqEJc8`. The private configuration digest baseline was captured
mid-task and compared at delivery; no secrets or its private receipt are packaged.
Git also verifies protected tracked files unchanged from the starting commit.
No untouched backup-content or broad dependency inventory was repeated. Test
mirror/process/port cleanup is evidenced separately from the unchanged owner app.

No known product failure remains. Automated accessibility checks do not establish
full conformance; screen-reader speech was excluded as instructed. Real desktop
database-error/retry simulation was not added; the inherited response pattern is
covered structurally and by the production build. Existing quarantine remains
for the owner-approved later workflow; Phase 2 editing/lifecycle, publication,
activation and later tasks require their own authorization.
