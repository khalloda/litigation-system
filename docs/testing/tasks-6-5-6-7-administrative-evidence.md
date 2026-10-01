# Task 6.6 working evidence — combined Tasks 6.5–6.7 candidate

This is implementation evidence, not acceptance or owner activation. Base
`186fd91d4528ac4da480a0699bd0fd44b4fb4749`; the administrative-choice foundation is
local commit `08ec39e`. Owner decisions are recorded in
`docs/approvals/2026-10-01-tasks-6-5-6-7-report-decisions.md`.

## Production definitions

| ID | Preserved purpose |
|---|---|
| `administrative-by-destination` | Noncompleted, non-NULL work status; task destination; chosen hearings; every tied latest dated step; work without a step is retained. Two always-present sections; embedded active/chosen hearings at the maximum court-action next date, overdue at Cairo today, filtered by hearing destination. |
| `administrative-all-destinations` | Noncompleted, non-NULL work status; linked client; chosen hearings and chosen task steps. One work per row, grouped by task destination. |
| `administrative-by-client` | Same chosen-context qualifications; exact client ID. Work court/circuit and case order. |
| `open-decisions-by-destination` | Active matters, chosen hearings, hearing destination and inclusive next-date interval. Future dates within the interval are allowed. |
| `open-decisions-all-destinations` | Active client-linked matters, chosen hearings and next date strictly before Cairo today. Grouping and court/circuit use the matter. |
| `unnotified-decisions` | Active client-linked matters with a current principal/co-principal, decision IS NOT NULL and notification IS FALSE. Required hearing-date interval, capped at Cairo today. No selection predicate or notification action. |

The two child collections are aggregated independently. Multiple hearing and
step choices never multiply work counts. Full decisions, exact hearing/step
dates, every tied latest step and its current responsible person are preserved.
NULL and empty values remain distinguishable, including an undated empty child
context. Archive is not a report predicate. Work age uses its business date and
one captured Cairo print date: future dates yield a signed negative difference,
and unknown dates remain NULL.

The shared typed descriptor now permits bounded, trusted section-specific
columns. Both combined-report sections are mandatory even when empty. Preview,
PDF and Excel use the same declared columns; Excel's exact-value sheet binds
each cell to its own section's column key. Existing definitions retain their
previous single layout. No user-supplied column or query language was added.

## Fresh isolated evidence

Evidence root: `test-results/task65-67-20261001T104114Z`.

- `administrative-source1`: 138 independent full-relation comparisons; most
  selected cases correctly empty before the populated campaign.
- `administrative-edges1`: retained partial run with 57 completed operations.
  A native step with both empty result and NULL report was correctly refused by
  the input guard before database mutation. No guard was changed.
- `administrative-edges2`: the refused UUID had no receipt, the task retained
  exactly two steps and version 3. The continuation reused the 57 completed
  results, then supplied a clearly marked TEST ONLY report for the empty-result
  step. Full attempt log, source hash and exact IDs are retained.
- The edge campaign selected bounded copied historical records through the
  new gateway and created a clearly marked native matter, five hearings, four
  tasks and nine steps through existing application gateways. It proved tied
  latest steps, NULL/empty dates, future/unknown ages, completed/NULL status
  exclusion, no child multiplication, archive inclusion and archive/stale
  selection refusal. Native protected historical columns remained NULL.
- `administrative-source2` and `administrative-source3`: 146 full-relation
  comparisons each, including 30 populated cases. Every row ID, order, typed
  cell, section and total was compared with an independent in-memory oracle.
  Literal instants straddle Cairo midnight; a next-day unnotified end date is
  rejected before midnight and accepted at midnight.
- `administrative-contract1`: shared report contract plus mandatory mixed
  section/column refusal tests and independently reopened typed XLSX cells.
- `administrative-full3`: complete `npm run check` passed.
- `administrative-dbcheck3`: all 148 historical checks passed at fixture-only
  candidate migration 78 after the deliberate fixture mutations.
- A subsequent narrow display change gives an empty selected child context an
  explicit empty-value label. `administrative-source4` reran all 146 comparisons;
  TypeScript and `administrative-audit4` passed with the updated exact closure.
  The final combined source check will include this change.

Browser, saved PDF/XLSX visual coverage, final combined regression and cleanup
remain part of the combined delivery gates. These working proofs do not claim
that those later gates have already passed. Owner migration remains 77.

## Combined browser finding and bounded correction

The first built Administrator campaign reached the new destination report after
all five hearing layouts produced saved PDF/XLSX files. Its PDF correctly refused
an oversized repeated banner: the age explanation was 129.125px high together
with the title, exceeding the unchanged 115px bound. The three administrative
work reports now place that explanation in the body, following the existing
long-guidance pattern. Fresh static renders measure 69.9375px / 68px / 68px
banners; the full explanation remains visible below the letterhead. This is a
presentation correction only; query data and all independent oracles are
unchanged. The source is rebuilt and affected browser exports rerun.

An earlier browser transport failure occurred after one hearing PDF had been
audited as completed. It was not saved and is explicitly retained as a lost
output, not visual evidence. Exact audit reconciliation preceded retry; the
three saved files and two previews were reused. A retry without Playwright
request routing succeeded, but later native-transport failures establish that
routing was not a proven cause. Four server-completed PDFs were not saved;
each attempt was reconciled before a bounded retry. Protected Chromium wire
logs show an invalid HTTP response on a reused local connection. A separate
300-download static Node/Chromium probe did not reproduce it. All required
files were eventually saved and independently inspected, but the intermittent
transport failure is not claimed fixed. A browser-scoped closed proxy blocks
external destinations without changing the owner app or global settings.

Candidate 78 also passes a fresh full-state migration77 atomicity campaign:
runtime ledger access is denied, an injected final-statement failure rolls back
all candidate objects/data, and the complete SQL creates empty new choices and
13 existing receipt registrations before explicit rehearsal rollback. Complete
before/after state matches. The two earlier harness assumptions (total ledger
rows versus completed migrations, and the exact runtime denial message) are
preserved as failed attempts. All three second fixtures were removed through
the exact-ownership helper; the primary fixture was retained.
