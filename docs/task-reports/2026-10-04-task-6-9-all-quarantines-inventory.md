# Task 6.9 — comprehensive quarantine inventory, 4 October 2026

Status: inventory and proposals complete; business decisions pending. No repairs
applied. Task 6.9 acceptance and Stage 7 remain on hold. This is a local child of
`d27f2c8039af93fb79328914cb578cf7f0d5f795`, above published
`865392aac4bcc94d27c616933ac3c15909f04542`.

The read-only catalog discovery covered 175 relations: 159 base tables and
16 initial-state views. All 20 quarantine tables, review/exclusion registers,
release journals and non-quarantine deferred fields were examined. Views and
review references are not counted again as missing records.

## Findings and counting units

There are 3,960 distinct issue units, not 3,960 missing records. This includes
record, relationship, field and fragment units. The 5,491 initial findings,
671 review values and 38 exclusion rules are separately linked references.
Reason counts can overlap within an issue. No unexplained integrity discrepancy
was found in the completed checks; unresolved business meanings remain explicit.

| Family | Units | Released | Accepted exclusion | Approved mapping | New decision | Blocked parent | Missing/ambiguous evidence |
|---|---|---:|---:|---:|---:|---:|---:|
| deferred.D54 | 123 field | 0 | 0 | 0 | 123 | 0 | 0 |
| deferred.hearing-parent | 4 field | 0 | 0 | 0 | 0 | 0 | 4 |
| admin_task_transform | 544 record | 0 | 0 | 305 | 239 | 0 | 0 |
| attendance_transform |  | 0 | 0 | 0 | 0 | 0 | 0 |
| attendee_span | 10 fragment | 0 | 0 | 0 | 10 | 0 | 0 |
| document_evidence | 372 field | 0 | 81 | 0 | 87 | 0 | 204 |
| document_transform |  | 0 | 0 | 0 | 0 | 0 | 0 |
| exclusion |  | 0 | 0 | 0 | 0 | 0 | 0 |
| fee_letter_matter_transform | 57 relationship | 0 | 0 | 25 | 0 | 0 | 32 |
| fee_letter_transform |  | 0 | 0 | 0 | 0 | 0 | 0 |
| hearing_transform | 327 record | 327 | 0 | 0 | 0 | 0 | 0 |
| invoice_allocation_transform |  | 0 | 0 | 0 | 0 | 0 | 0 |
| invoice_transform |  | 0 | 0 | 0 | 0 | 0 | 0 |
| matter_fee_letter_reference | 19 relationship | 0 | 0 | 19 | 0 | 0 | 0 |
| matter_relationship_transform | 191 lawyer_field, 772 party_field | 29 | 0 | 60 | 874 | 0 | 0 |
| matter_transform | 55 record | 55 | 0 | 0 | 0 | 0 | 0 |
| payment_transform |  | 0 | 0 | 0 | 0 | 0 | 0 |
| power_of_attorney_relationship | 717 relationship_field | 0 | 3 | 0 | 713 | 0 | 1 |
| power_of_attorney_transform |  | 0 | 0 | 0 | 0 | 0 | 0 |
| task_action_transform | 769 record | 0 | 0 | 551 | 1 | 142 | 75 |

All 55 matter and 327 hearing releases from Task 3.5B were verified against their
release IDs, initial values and current history. All 29 Task 6.2 party releases,
including capacities, and its two separately sourced hearings were verified.
They must not be created again. Original quarantine rows correctly remain.

Every one of the 12,732 attendee source cells was reconstructed from all
16,602 contiguous fragments: 9,113 people, 4,642 placeholders, 1,951 separators,
648 dates, 146 titles, 92 notes and 10 remaining ambiguous fragments. The
5,346 initial attendee findings are therefore references, not 5,346 missing people.

The 14 compound document quantities retain their original text under D65.
Exclusion here means no inferred numeric page count, not exclusion of a document
or erasure of its quantity. The 67 document and three POA non-person exclusions
also preserve their source. D54's 123 client responsible-lawyer fields across
11 raw forms remain an explicit deferred workflow, separate from client contacts.

## Proposed restoration and dependencies

Existing approved meanings currently support 305 missing administrative tasks,
551 historical steps, 60 party fields, 26 forward fee links from 25 source entries,
and 19 reverse fee references. These are exact review proposals, not authorization
to execute them. The fee entry whose reviewed answer is “All” maps to its two
exact matching matters; this needs multiple-target provenance, not another question
about the already supplied answer. Forward and reverse fee relationships remain
independent.

All 544 missing tasks and all 769 missing steps are inventoried. This includes
the formerly excluded 120 destination tasks and 79 sibling steps. The 693 steps
with quarantined parents all have explicit dependencies; all fields were examined
even when a parent prevented import. The remaining 76 step issues comprise
36 nonexistent-parent references, 39 absent-parent references and one unresolved
performer. Neither retained Access copy contains any of those 36 referenced
parent tasks. The earlier intent to promote them to parent work is preserved;
exact grouping and field placement still need a faithful model rather than
invented required-work text, dates or parents.

The confirmed 20-field party overlay now creates 22 parties and 27 capacities
across 17 matters. P3 is four separate parties with five capacities on matter3317,
including both roles for جهاز حماية المنافسة. Its core effect is four party inserts,
five capacity inserts and one matter aggregate-version update; the shared new
capacity lookup is counted separately. Full audit totals depend on the later
reviewed ledger/model and are not claimed prematurely. P1 remains exactly its
15 approved fields. P2's three concepts keep identical labels in both gender
columns. P4's role order and all three D1 destination labels remain approved.

Restoration must be additive and source-aware: immutable original migration,
quarantine and baseline semantics plus a new exact source-to-target release
journal and current-edit replay. Do not rerun global transforms against new
lookups, repurpose the frozen Task 6.2 receipt plan or use native-create routes
to impersonate original import provenance. Fresh actor, permissions, parent,
archive/version, source-hash and receipt checks; atomicity; verified retries;
permanent checks; and journaled compensation are required. No executable repair
SQL or application change is included.

## Source differences and report effects

All 3,766 comparison-bound original issue rows have exactly one match in each
retained Access copy after only explicit serialization handling. Every original
value matches the 4 September copy; 20 issue comparisons differ in the 27 September
copy. Those differences are retained, not applied. The complete compared-table
copy differences include newer-only matters, hearings, tasks, steps and four POA
payloads. The two already-receipted newer hearings are identified separately.
These differences are not additional quarantines or approval for synchronization.

Full original staging, accepted billing/attendance interpretations, retained
workbooks and release journals control lineage. Billing's derived source keys and
D4's deliberate exclusion of Pay-Date were respected. Zero-quarantine families
have complete source-key/payload conservation checks; genuine NULL values are
not invented missing data.

Administrative report choices remain empty. Restoration alone produces no new
selected administrative rows. With the old sample choices considered only as a
hypothetical comparison, full approved history still projects four client245 work
rows and 29 all-destination work rows. Every restored task's latest date and all
ties are enumerated; null statuses stay null and fail SQL's status <> completed
test rather than becoming a convenient active default. Party restoration changes
display, not row qualification. Lawyer proposals list exact matter/hearing exposure;
final per-lawyer/team totals cannot be certified before membership/rank decisions.
One work row is never multiplied by hearing/step combinations.

S1/S2 remain deferred and unapproved. No choices are borrowed from the ten client
choices. The old seven open-decision rows are a date-specific scenario, not a
guaranteed future global count.

## Evidence and next decision

The delivery includes the complete inventory, narrow source/release witnesses,
all original issue keys, dependencies, raw values, exact proposed values where
established, nine prioritized decision families with detailed value groups,
repair stages, report effects, focused tests/corruption probes and before/after
observations. Full private database/source bodies remain protected locally;
their hashes and explicit independent-review limits are recorded.

The first new question concerns the exact destination خبراء شرق القاهرة on
45 source tasks. Recommended: create it as a distinct destination after approval,
without substituting a court ID or a generic geographic label. Task7972, current
matter2705, case807 / 2016, records متابعة تحديد جلسة خبير. All 45 tasks have
unrecorded status and no historical child steps; this restores their history,
not eligibility for open administrative reports. Their complete IDs are in the
decision package. No previous P1–P4/D1 decision is being reopened.

Planning estimate after decisions: 7–14 development days, 3–5 isolated verification
days plus independent review, and a separately approved 0.5–1 day owner operation.
Owner/source research may take several sessions across roughly 2–6 working days
or longer when records are unavailable. These are overlapping planning ranges,
not guaranteed elapsed time or a usage-credit quotation. Existing tooling suffices;
no purchases or new services.

N1 remains accepted/unresolved/unfixed; PDF copying accepted/unfixed; search
uncertified; the legacy Detail_Format procedure unreadable. These limitations
were not reopened. No owner login, report/export/save, repair, migration, seed,
restart, activation, acceptance or push occurred. The final receipt records fresh
preservation checks and the local commit identities. Stop for independent
comprehensive-inventory and owner-decision review.
