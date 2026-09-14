# Task 4.4 Phase 2 — P2-R1 presentation correction and P2-N1 erratum

14 September 2026. **Implemented, pending independent correction review.**
No acceptance, actual migration/activation or publication is included. Overall
Task 4.4 remains unchecked; Phase 1 and its earlier ID-search R1 remain accepted
and unchanged. P2-R1 is a separate Phase 2 finding.

## Scope and result

Khaled authorized this bounded follow-up in the same Local Windows implementation
conversation, with one agent and no subagents. The starting checkpoint was clean
local main at `85525f325108d70ca1a1dac57233f86229cbe504`, sole parent `fbf47d7`,
tree `a1a2ef45db9ba5a2e44166c3604262c89795feab`, one ahead of cached origin/main.
The original candidate, implementation report and all delivered artifacts remain
unchanged. The attached review/mandate supply the correction contract; historical
context and preparation statements do not authorize acceptance or later work.

The list and detail now display the actual current assignee, destination and step
performer. A cleared reference displays the existing Arabic `غير مسجل` state.
Imported text remains visible under separate field-specific original-text labels:
`القائم بالعمل — النص الأصلي` and `الجهة — النص الأصلي`. The labels compose existing
centralized strings; existing multiline/wrapping styles retain source spacing and
line breaks. Native NULL provenance does not produce an empty historical field.
Current inactive references retain their names and former-status indication.

Only two production files changed: `src/app/admin-works/page.tsx` and
`src/app/admin-works/[id]/page.tsx`. Four current-or-source fallbacks were removed;
the original-source fields were added or relabelled. Court display is unchanged.
No query, filter, schema, migration, gateway, input parser, action, authority,
account/audit, permission, parent, date or ordering behavior changed. Migrations
1–68, D1–D62, AGENTS.md and CLAUDE.md remain byte-identical to the parent. No source
pin or rejecting static inventory needed alteration.

The [independent review](../reviews/2026-09-14-task-4-4-phase-2-independent-review.md)
is imported verbatim: 14,698 bytes, SHA-256
`adafcc449fafd03c3a2d258b0cc63fb5ce007580faa929911b59e459a361be0c`.
The supplied reviewer ZIP's complete 37-member set, sizes and hashes were verified.
The [focused matrix](../testing/task-4-4-phase2-p2-r1-correction-matrix.md) maps
the result to the new evidence.

## Failing reproduction and passing proof

New evidence root:
`D:\Projects\LitigationData\review-evidence\task44-phase2-p2-r1-20260914`.

`red02` built the uncorrected parent presentation against a task-owned PostgreSQL
17.11 full-state copy. It selected imported works **275, 1032 and 1839**, with
steps **2526, 1862 and 2015**, respectively. Selection required nonempty raw
assignee/destination/performer text and an unarchived associated matter, ordering
by longest combined original text then ID. The selected text lengths total 35
characters for each pair; no protected raw text was fabricated or changed.

Each of the three writer roles first set known eligible current references through
the existing save gateway, then deliberately cleared them. SQL facts proved the
saved NULLs and exact retained provenance, parent, court, ordinal and hidden values.
The uncorrected browser nevertheless failed all four current-field assertions for
work 275: its list/detail/step still named `محمود علي`, and its destination still
showed `دار القضاء العالي`. Each expected value was `غير مسجل`. These were actual
isolated browser/database failures, distinct from the reviewer's earlier offline
expression reproduction. Native NULL/NULL records cannot expose this fallback.

`green01` restored a fresh copy, applied the unchanged migration 68 only there,
and built the corrected production presentation. Newly executed checks passed:

- Three writer roles clear task assignee/destination and step performer on the
  three imported subjects. All four roles then pass **48 current-display
  assertions**: three subjects × four surfaces × four roles. Original text is
  separately labelled and matches its independent retained value.
- Current-person `missing` filtering includes the cleared works. List, detail,
  reopened task/step editor, edit/cancel/back and validated query context agree.
  Lawyer has no editing controls and cannot access any of the four editor routes.
- Replacement names/destination, retained inactive person labels/status and the
  reopened editor, an unrelated edit and a true no-op, a separate untouched
  unresolved imported assignee, and native task/step NULL references pass controls.
  The no-op compares complete state; read/editor/cancel navigation and layout
  inspection add no business, audit, history, receipt or sequence state.
- Original task/step identity, all source/provenance fields, fixed parents,
  existing court, source ordinal/current order and nextAppointment remain equal.
  Step-page 2 and edit/cancel context retain the expected displayed IDs.
- Production list/detail browser scans, labelled source values, keyboard traversal
  and visible focus, 44-pixel targets, RTL, 320-pixel reflow and genuine Chrome
  200% zoom pass. Captured source-label layouts were visually inspected. No external
  browser requests occurred. The longest original text among the fully populated
  selected subjects was used; the unchanged source's global individual maxima are
  assignee 16, destination 25 and performer 16 characters. No synthetic long raw
  field was introduced.
- Final **135 permanent checks** on the disposable mutated copy and the
  **448-decision permission suite**, including its rejecting controls, pass.
  Final `npm run check` passes type, lint, formatting, encoding, RTL,
  authorization, audit/source and focused rejecting checks.

The exact expected-red test-source bytes were saved before passing-proof additions.
Both executions record frozen source/build identities and exact original-state
comparisons. The initial `red01` attempt stopped at a test-only incorrect column
name (`legacy_assigned_to_raw` instead of `legacy_assignee_raw`), after a successful
isolated build. It is a retained harness failure, not a P2-R1 reproduction or a
pass. Its resources were cleaned up before the corrected `red02` run.

The first final static run found a formatting issue in the new test driver.
The executed driver bytes and failed log were preserved before formatting. The
corrected file has exactly the same non-trivia TypeScript tokens, verified by
`driver-format-proof.json`; this is a documented source-binding exception, not a
new runtime execution. Production and browser-proof code did not change. The
final project checks were then rerun. An external preservation helper initially
used Windows' default text encoding for TASKS.md; explicit UTF-8 corrected that
helper without changing project content or database state.

## Reused evidence and limits

The previous `85525f3` backend/concurrency proof remains valid for unchanged code.
The new driver compares all parent `src/`, `prisma/` and `scripts/` dependencies
except the explicitly permitted presentation surfaces, then compares the full
fresh original owner state with the prior `run07/actual-after.json`. The restored
copy's complete table vector matches that fresh source before test setup. The
exact reused paths and hashes are in each run's `reused-backend.json`.

Reused, **not rerun**, are `run05`'s 131 baseline checks, pre-fixture 135 checks,
seven backend mutation groups, twelve adversarial/concurrency groups and independent
four-role/twelve-candidate R1 ID-search oracle, plus the previous guard proof's
12 parser and 10 guard cases. The unchanged query/input/normalizer preserves both
Western/Arabic-Indic ID branches and exact/partial/suffix/leading-zero/wildcard
semantics. The correction newly exercises affected `missing` filtering and return
navigation. Broad historical read/layout evidence remains supporting context.
The fresh final invariant/permission/browser results above are separate executions.

The established Windows mirror reuses installed dependencies read-only, with the
lockfile and 25 declared dependency metadata files bound and compared. Generated,
build and dependency trees are identity manifests, not independently supplied
runtime bytes. Screen-reader speech, full accessibility conformance and canonical
empty replay were not performed or claimed. No new dependency or service was used.

## P2-N1 — explicit population erratum

The original Phase 2 report, lines 90–91, mixed historical planning/extraction
numbers with the restored current population. **13,279 / 4,207 / 1,730 must not be
read as this test copy's current hearings / administrative works / matters.** The
original report and package remain immutable historical evidence.

The original delivery's `actual-before.json` and `run07/actual-after.json`, dated
14 September 2026 across **12:25:38.930–14:01:59.778 UTC**, report:

| Population | Rows |
| --- | ---: |
| Current `public.hearings` | 13,382 |
| Current `public.matters` | 1,744 |
| Current `public.admin_tasks` | 3,694 |
| Current `public.task_actions` | 3,483 |
| Source staging `staging."admin work table"` | 4,238 |

The correction's fresh original-state receipts match those complete vectors;
`red02/actual-before.json` at 14:53:02 UTC independently confirms these same counts.
Staging rows are a different population from current public administrative works.
This is a report erratum, not a migration change, missing-record finding or claim
that historical planning figures never existed.

## Preservation, package and stop

The actual owner database stayed at completed migration 67. Dated read-only receipts
compare all **119 table counts/digests**, all **48 complete sequence vectors**
(last_value, log_cnt, is_called), sequence metadata and catalog digests. The actual
owner app was observed stopped, with no port-3000 listener; that state was preserved.
Accepted build `6STn5JeaidE5AnbLqEJc8`, configuration, account/session state, all
54 logo identities and all earlier phase/candidate evidence remained unchanged.
Private configuration comparison details remain local. These are dated comparisons,
not continuous monitoring or supplied raw owner database/credential/logo bytes.

Only task-owned clusters, volumes, networks, browser mirrors and listeners were
removed. No actual account recovery, password/session mutation, app login, database
write, migration, reset override, activation or remote action occurred. All 86
existing TASKS checkbox lines and every earlier report/review/matrix remain intact.

One local correction commit has sole parent
`85525f325108d70ca1a1dac57233f86229cbe504` and subject
`fix: distinguish current administrative references from source text`. Its exact
identity, complete tree, changed paths/statistics and clean main observation are
external, avoiding a circular commit reference. Main is two ahead/zero behind the
unchanged cached origin/main; no new remote observation or publication is claimed.

The separate correction ZIP supplies the complete committed source, differing
working-byte sources, adopted review/mandate, focused red/green evidence, screenshots,
helpers and unchanged original delivery ZIP/manifests for reuse. The external
manifest and independent reopening receipt verify safe unique complete membership,
sizes/hashes, commit/sole parent/recursive trees, and actual reverse/forward patch
reconstruction in a disposable directory. The final receipt binds the completed
artifacts. Private configuration, raw owner data, logo bytes, generated/dependency
trees and raw browser failure DOM remain excluded with explicit availability limits.

P2-R1 is implemented and awaits independent correction review. P2-N1 is documented
by this erratum. No acceptance, owner activation, push, archive/restore or later work
follows automatically.
