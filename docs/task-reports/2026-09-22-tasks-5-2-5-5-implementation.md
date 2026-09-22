# Tasks 5.2–5.5 — combined local implementation candidate

- Scope: Open decisions, matter counts per lawyer, Top 5 clients, and both
  hearing-outcome charts. Independent implementation review is the next gate.
- Approved base: `952a4c54f873fee6881eec15c15cf1ed4540db42`.
- Environment: same Codex Desktop chat, Local Windows,
  `D:\Projects\litigation-system`; one active agent, no subagents.
- Run configuration: existing model/effort selection retained; GPT-5.6 Sol /
  Medium remains the owner's recommendation. No new dependency or paid service.
- Authorization: explicit one-time batching exception for these four tasks,
  executed in order through small ordinary local commits. No governance edit.
- Acceptance and push: neither authorized nor performed. TASKS remains exact.

## Behavior and semantic authority

The [semantic trace](../testing/tasks-5-2-5-5-semantics.md) records actual retained
form/query dependencies, joins, counting units, current translations and limits.
The [matrix](../testing/tasks-5-2-5-5-acceptance-matrix.md) preserves the initial
pre-execution expectations and appends actual evidence.

Open decisions counts unarchived hearing identities with report true, a next
date strictly before the represented Cairo date, and an active matter. It is
not an administrative-task or latest-step statistic. Archived parents remain;
missing clients remain visible, while a missing matter cannot satisfy the
active-matter predicate. The preview shows at most 25, ordered next date then
hearing ID. A validated `openBefore` filter reaches the exact complete hearing
list and survives detail/back navigation. It combines with existing filters,
rejects duplicate or invalid dates and incompatible archive modes, and is not
a public test-clock override.

Lawyer workload replaces legacy name/team joins with current non-retired
person-ID relationships. Lead, co-lead and support counts stay separate; each
person's total counts the union of active matter identities. Positive inactive,
external and non-login references remain; unique population and unassigned
matters are separate because person totals overlap. The restored population
has 507 active matters, 39 unassigned and 11 positive person groups, three
inactive. Legal text being absent does not discard an existing matter ID.

Top clients ranks distinct active matter IDs per client ID. All ties at fifth
place remain, with stable client-ID ordering; no zero-count filler or financial
ranking is introduced. Archived/disabled clients remain. The restored active
population has 105 client groups and no unassigned-client matter. Independent
literal scores test fewer than five, fifth-place ties and all-group ties.

Outcomes count hearing IDs by hearing date, including repeated hearings on one
matter, archived records and missing parents. Exact صالح and ضد remain separate;
NULL, empty/space-only and other values are disclosed, never inferred as losses.
Undated and outside-window records are separately reconciled. The current-year
view uses twelve monthly buckets across the whole Cairo calendar year.

**Khaled's explicit 22 September decision** supplies the missing legacy five-year
restriction: current Africa/Cairo year Y and four preceding calendar years;
five annual buckets from 1 January Y−4 inclusive to 1 January Y+1 exclusive.
For Cairo 2026 this is 2022–2026; Y is dynamic. The current year is labelled
incomplete, with stored counts and no annualization. Both charts and their
semantic tables use identical result values. This repairs an absent legacy
filter by owner decision; it is not a claim that the old SQL defined this window.

All panels use fresh server authorization before aggregation in read-only,
repeatable-read transactions. New date-dependent panels share one captured
Cairo anchor. Each panel has its own database snapshot; no page-wide atomic
snapshot is claimed. Ordinary query failures remain local, while authentication
failures propagate. Existing Today behavior, role navigation and sign-out remain.
Charts use existing HTML/CSS and bundled fonts, with Arabic text in strings.ts.

## Verification, source bindings and limitations

Evidence root: `test-results/task52-55-20260921T211339Z`. The review package
contains executed helper bytes, command timestamps/exits, source and fixture
bindings, complete shareable results, screenshots and failed attempts.

The final production artifact is build `Xgbbu9o4f6pgTkFdrJNWp`, independently
located under the new task-owned build directory. The complete project check
and production build passed. The permission suite passed all 480 decisions,
including its database-backed role/password/disabled/inactive tests. Fresh
historical and setup gates passed 148 and 15 checks on the isolated fixture.
No migration was executed or changed.

The final outcome oracle covers both windows across eight literal instants for
all four roles, including leap day, Cairo DST/day/year boundaries and a populated
historical year. Literal SQL cases cover both five-year endpoints, five annual
buckets, Cairo rollover, repeated matter IDs, archive/parent independence,
unknowns, empty and single-series populations. Public-schema service tests use
the full restored volume. Separate session-local SQL tables test rare semantic
edges by changing only explicit table qualifiers; they do not claim to test
public-schema triggers or authentication. No public constraint was disabled.
The large-group supplement returns all 500 person groups and all 500 tied
clients over 1,000 eligible matters, with 20,000 unrelated hearings and 5,000
contacts. It also verifies the entirely unassigned population before adding
the new session-local role memberships.

Fresh service instrumentation covers four roles and all six panels, four
explicit statements each (read-only transaction setting, fresh account check,
two queries), with complete equality of 141 tables, 48 sequences and catalogs.
The six-service auth supplement records 66 denials before aggregate work.
Its no-login-person substitution also mismatches the account/person identity;
the source closure independently includes the explicit can_login condition.

Unchanged open-decision, workload and top-client oracles/edge tests are reused
only with exact source/test bindings in `evidence-summary.json`. This includes
actual 0/1/25/26 open-preview cases and the complete restored query populations.
Changed outcome code, shared presentation, authorization and final integration
were tested freshly. Earlier draft browser results remain dated evidence rather
than being relabelled as final. Closed audit exports and unrelated workflows
were not rerun to inflate coverage.

Observed query-plan execution times were approximately 1.0–6.7 ms. Fresh service
calls were approximately 9.9–124.4 ms across the measured roles; the five-year
service was 13.7–16.2 ms. These are local fixture observations, not production
latency guarantees. Aggregates use bounded previews/buckets or real group counts;
no per-row query pattern or new index is introduced.

The final genuine four-role browser run passed exact counts and identities,
complete open-list navigation, chart/table equality, refresh, local failure/retry,
role menus/sign-out, LA/Tokyo/UTC browser zones and Cairo year rollover. Seven
axe scans and 24 measured control-focus checks passed, including genuine 200%
browser zoom and 1280/390/320 CSS-pixel layouts. The final visual supplement and
its correction are recorded separately in the matrix and visual-inspection
evidence. Horizontal table scrolling is deliberate at narrow widths. Axe and
visual/keyboard checks do not establish screen-reader speech or universal
accessibility.

## Preservation and retained failures

Owner database access and runtime observations were read-only. The protected
accepted artifact is
`D:/Projects/LitigationData/accepted-task51-d55df302-20260921T114102Z-f9add0c3`,
build `0hYFhlJjQ4s-qbt8wD5LY`. PID 54168 on loopback port 3000 belongs to
Task 5.1's 21 September operational evidence; it was not observed by this run.
The successful baseline at 21 September 21:32:01 UTC, final observation at
22 September 07:22:59 UTC and post-seal observation at 07:33:54 UTC all contain
empty listener and process arrays. Their equality does not prove a running app
or continuous runtime health. The initial permission failure and the helper's
suppressed listener-query errors remain recorded; these observations do not
establish the cause of the empty results. Artifact/build preservation and
healthy database-container observations are separate from app availability.
Later runtime observations cannot establish this run's historical uptime.
Migration 73, 73 completed migrations, all 141 tables/48 sequences, 74 ledger
rows and 885 audit rows remain the protected owner boundary. Full comparisons
include credentials/capabilities, table content and catalogs, with no fixture
restore exceptions applied to owner equality.

The before/after inventory compares 295,349 protected files, 43 junctions and
111 root ACL records: no changed/missing files, append-only growth or additions.
Prior evidence, recovery, accepted artifacts, owner dependencies/cache, logos,
retained source definitions and named Downloads remain exact. The inventory
checks root ACLs, not every old descendant ACL; new private/recovery access is
checked separately. Local recovery does not protect against laptop/disk loss.

Only task-owned fixtures received setup, authentication, marked hearing writes
or temporary failure injection. Restore equality was established before writes;
its reviewed physical exceptions are isolated-restore facts, not owner rules.
Browser processes close after each run; exact owned database cleanup and final
owner observations are bound in the delivery evidence and post-seal receipt.

Original failed attempts remain in `failures-and-corrections.md`: fixture logo
setup, pre-authentication denial, exact source/encoding guards, isolated path
errors, a signal-exit cleanup-report correction, and later unique-output/focus
harness corrections. No safety check or database constraint was weakened.

Private dumps, full-state snapshots, passwords, browser profiles and configuration
recovery bodies are withheld. Their protected inventory and comparison receipts
are shareable; an external reviewer cannot inspect those private values from
hashes alone. Retained Access design exports are exact evidence, but D51 does
not establish full frozen-binary design equivalence. No Access macro, import or
Task 4.9 operational action was repeated.

## Delivery boundary

The external five-file delivery binds the complete shareable base and final
source, all ordered local commit parents/trees, forward/reverse reconstruction,
original adopted handoff, explicit five-year decision, fresh/reused evidence,
failures, preservation and owned cleanup. Credential-bearing configuration
bodies remain identity-only. The verifier uses Python standard library only;
its integrity PASS is not implementation acceptance.

Final HEAD/tree, complete ordered chain, post-seal owner/Git observations and
receipt-inclusive verification are external delivery identities, avoiding a
self-referential documentation commit. TASKS is byte-for-byte unchanged, all
86 checkbox lines exact; Task 5.1 remains checked and Tasks 5.2–5.5 unchecked.
No acceptance, activation, owner migration/provisioning, push or later task is
included. Stop for independent Tasks 5.2–5.5 implementation review.
