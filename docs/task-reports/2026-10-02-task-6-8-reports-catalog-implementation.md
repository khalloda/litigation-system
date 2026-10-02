# Task 6.8 and reports catalog implementation

Status: implementation checks pass; independent implementation review pending.
Published base: `eb79d5dc7c721165345ba64374542b0383b9c62c`.
Application/test commit: `b8b815f` (full identity is bound in the review package).
The following documentation child records the candidate; it is not acceptance.

## Delivered behavior

The exact Command153 report, `صالح-ضد مفصل حسب المحامي`, is implemented as
`matter-judgments-by-lawyer`. The report retains every qualifying hearing in
the entered inclusive period, grouped by distinct current principal lawyer,
outcome and date. Unassigned hearings remain. Per-lawyer counts and distinct
overall counts distinguish shared responsibility from the number of hearings.
Native and archived records and notes remain; NULL/exact empty outcomes are
excluded and other nonempty outcomes are retained. The neighboring selected
lawyer report remains a separate definition and query.

The catalog places all 38 prior production IDs exactly once in seven
categories and adds this 39th report. Search, expansion, client context and
Back/Forward preserve navigation state. The browser receives only the
server-authorized descriptors. Catalog navigation makes no report/export
audit event or selection change. Existing selection workflows are unchanged.

Application and catalog work share registry, strings, engine authority and
renderer/result plumbing, so the checked working piece is one source commit;
the focused documentation is a separate child. There is no migration or
dependency change. TASKS bytes and all 86 checkbox lines remain unchanged.

## Source decision and limitations

The actual target is conclusively identified, separately from Command250's
`rptصالح-ضد مفصل` and Command128's decision report. The original blank PDF,
route screenshots and recovered query/visible properties resolve the layout.
One `Detail_Format` procedure could not be read. The owner explicitly answered
“Approve proved contract (Recommended)” to using the proved query/layout as the
complete contract without additional hidden row suppression. This resolves
Task 6.7a's source gate for implementation; it does not claim VBA recovery or
diagnose the Access error. Separate source snapshots are not asserted equal.

PDF copying remains an accepted limitation, not fixed; search is uncertified.
N1 intermittent downloads remain accepted, cause unresolved, **NOT FIXED**.
No new transport diagnosis was undertaken.

## Validation

The final full `npm run check` and isolated production build passed. Build
`pr6lJ7x9wP3Cowp8L0Xya` is bound to the committed application source by hashes;
only the subsequent focused documents differ. Audit inventory additions are
exact closures/query fingerprints, with rejecting mutation tests retained.
Final database gates passed all 148 historical checks and 15 setup checks.

The full owner restore starts with 13,384 hearings and 1,744 matters. Independent
row/cell oracles cover the entire period, sample periods, date endpoints,
leap day, repeated judgments, principal overlap, support/retired exclusion,
unassigned cases, NULL/empty/unknown/whitespace outcomes, and native/archive
behavior. Two explicitly labelled test matters and ten hearings produce
759 distinct hearings / 765 attributed rows in the broad test. Five distinct
leap-day hearings produce nine rows across three principal/unassigned sections.

Four roles passed catalog coverage and browser navigation checks. Tests include
restricted metadata/direct denial, allowed subsets and empty catalog, keyboard
focus, Clear/Back/Forward, desktop, 390px, 320px and true 200% browser zoom.
Screenshots were inspected; comprehensive accessibility conformance is not
claimed. Final navigation did not change audit rows or any saved choices.

Eleven genuine previews and eleven exports completed; all eleven files were
saved and hashed against response and audit metadata. Four full typed/visible
XLSX inspections include the 765-row export beyond the preview cap. Seven
PDFs comprise four first-pass files and three deliberate replacements after
a new-report overall-totals page split was corrected. The original 69 pages
were visually inspected, then affected final endings were rechecked; unchanged
body/neighboring report evidence is explicitly reused. No unsaved completion
or automatic export retry occurred in this run.

Fixture reconciliation accounts for exactly 95 added audit events: four
password resets, four changes, twelve genuine sign-ins, fifteen service
submission receipts, report/exports and their related updates. Only the two
test matters, ten hearings and four assignments consume IDs; all original
business rows, choices, audit rows and ledger remain exact. The account mutex
delta is exactly twenty and audit counter delta ninety-five. Read-only final
gates and the final oracle leave the complete state unchanged.

## Preservation and review boundary

The owner full-state comparison remains exact at migration 78: 159 tables,
48 sequences and 1,176 pre-existing audit events, with hearing 11003 archived.
Events 1171–1176 already preceded this task baseline and are recorded by their
database actor/time; no unsupported personal attribution is made. The accepted
owner app remains PID 55540 on port 3000/build `FYrtWdvuxWXTekJvuSOZo`.
The final receipt provides a fresh dated observation rather than promising
that these runtime facts remain permanent.

The task app on 3168 and exact isolated database/container/network/volume were
removed after ownership checks. Temporary fixture passwords, session files
and browser profiles were removed. Protected recovery, private source/failure
evidence, prior deliveries and the independent stopped test build are retained.
The protected package scanner's temporary secret list is removed at sealing.

Evidence root: `test-results/task68-reports-catalog-20261002T112022Z`.
The five-file review delivery includes native commit/tree/blob reconstruction,
forward/reverse child patches, complete working identities, all six original
sample identities, source maps, successful and failed attempts, saved-output
inspection, preservation and cleanup. Private configuration, credentials,
session bodies and recovery dumps are excluded. Intake/package integrity and
implementation checks are distinct from independent review and acceptance.

No owner login, export, save, migration, repair, provisioning, activation,
acceptance closure, synchronization, publication or later-task work occurred.
The two local commits are not pushed.

NOT PUSHED; STOPPED FOR INDEPENDENT TASK6.8 + REPORTS CATALOG IMPLEMENTATION REVIEW.
