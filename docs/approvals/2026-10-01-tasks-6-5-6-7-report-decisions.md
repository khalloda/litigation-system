# Tasks 6.5–6.7 report decisions — 1 October 2026

The owner answered all three numbered questions in the same active Local Windows
implementation chat. These are approved business choices, not implementation or
operational acceptance. The original combined mandate and independent-review stop
remain in force.

1. **Hearings by team: “All assigned lawyers (Recommended).”** Use all current
   non-retired principal, co-lead and supporting matter assignments and their
   current person-level team. Include a hearing once per relevant team; include
   unassigned people, and an unassigned group when the matter has no assigned
   lawyers. Overall hearing totals are unduplicated and team overlap is disclosed.
   This follows D6; it does not revive a matter-team field or infer attendance.

2. **Administrative/open-decision reports: “Separate report choices
   (Recommended).”** Replace the legacy manual flags with separate maintained
   administrative-report choices, initially empty. Preserve every report's other
   qualifications and all chosen hearing/step contexts without multiplying work
   counts. Choices remain independent of client, closed and lawyer report
   selections. Changes require the existing relevant editing permissions. The
   approved option explicitly includes a necessary candidate migration, scoped
   controls and isolated testing. No owner migration or selection seed is
   authorized; there is no fallback from empty choices to all rows.

3. **Unnotified decisions: “Explicit date interval (Recommended).”** Require
   user-selected inclusive civil start/end dates and retain the upper limit of
   Cairo today, active-matter status, recorded decision and explicitly false
   notified state. This replaces the fixed1October2019 lower restriction. It does
   not mark records notified or send any message.

Evidence and alternatives were presented before implementation. Restored source
data contains875 true hearing flags,1379 true step flags, multiple chosen contexts
for some parents, and661 otherwise qualifying pre-cutoff unnotified hearings.
Source identities, queries, samples and safeguards are recorded in
[the combined source map](../testing/tasks-6-5-6-7-report-semantics.md).
