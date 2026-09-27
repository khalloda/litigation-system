# Task 6.2 correction 1 — court source and source reconciliation

Published base: `1f0754bf0186d69cfcca3e82df888c54b22863fb`.
Scope: the owner-adopted correction1 prompt and independent T62-O1/T62-O2 HOLD.
This is a local correction candidate, not activation, acceptance closure or
publication. The agreed order remains correction and independent review, then
UI design/refinement, then Task 6.3.

## T62-O1 — corrected court source

The status report now takes court and circuit from the same latest hearing or
action that supplies its date and decision. The initial adapter and full-volume
oracle both contained the wrong matter-level assumption. All four retained
Type 4 definitions identify the hearing fields; their freshly inspected source
probe remains byte-identical to the reviewed probe.

Only the status configuration and its oracle assumption change. Latest-overall
selection still precedes optional period filtering. Date/ID ordering, null and
empty distinctions, archived-record inclusion, current party/role rules,
active default, nine report IDs and Cairo display behavior remain intact.
The other report variants retain their existing matter/hearing field choices.

The new independent literal regression creates clearly marked synthetic cases
through genuine guarded application operations in a disposable full-data
database. Before the fix it fails with the matter court/circuit in place of
the expected hearing pair. After the fix six cases pass: different pairs,
null matter values, null latest values with a populated older record, empty
latest circuit, two undated hearings, and no hearing. The dated winner also
proves equal-date ID ordering and inclusion after actual hearing archival.
An earlier-period filter cannot substitute an older hearing.

## T62-O2 — established causes and remaining uncertainty

All 38 web rows are reconciled to current and legacy matter IDs, exact case
text, candidate hearing IDs, source keys, current relationships and quarantine
records. No name join or Latin-J substitution was used; repeated case numbers
remain separate matters.

- The web's 38 rows follow the adopted current active-matter criteria. The
  retained selected-matter/marked-hearing/nonempty-decision rules produce ten
  rows belonging to exactly the ten matters in the Access PDF. A retained
  all-status variant without the matter-selection condition produces 15 rows;
  the exact Access generating object is not established by the PDF alone.
  The 28 extra web rows are not evidence of duplicate import or report loss.
- The correction populates 36 court cells from their selected hearings. Two
  matters have no hearing and correctly retain null court cells. This does not
  promise the court matches a different hearing chosen by Access.
- All 21 missing opponent cells and eight missing client-party cells match 29
  unresolved `unreviewed_party_role` quarantine records. Their original combined
  text, source keys and extraction identities are intact. None is explained by
  current retirement or a report join defect. The nine distinct source role
  spellings have no exact approved role lookup match or corresponding review
  answer in the captured evidence. The report must not silently release them.
- For case 933/2025 (matter 3310, legacy 1717), web hearing 470 / legacy 15769
  is the later expert action of 2 August 2026. Access's 30 July date matches
  marked hearing 9273 / legacy 15768. Both records and decisions are preserved;
  the different result follows the approved latest-overall rule.
- For matter 3269 / legacy 1671 (17316/141J, also 6214/2022), the retained
  latest hearing is 5550 / legacy 15671, dated 10 May 2026. The Access PDF shows
  9 September. For matter 3311 / legacy 1718 (932/2025), retained hearing 1707 /
  legacy 15759 is dated 22 July; the PDF shows 23 September. Neither PDF date
  occurs in the retained affected hearings. Later Access activity is plausible
  but is not proven without the exact generating source records. No date or
  decision overwrite is justified from these PDFs alone.

The read-only trace compares 38 matters and 331 hearings against staging,
immutable initial records and the bounded retained Access derivative query.
The 331 hearings and 140 captured matter/party/role initial records match their
current values; relevant matter/hearing edit histories are empty. D51 remains
explicit: the `d25fb958…` derivative is not the historical frozen binary or the
`40EBF988…` extraction identity. Two consistent protected copies were queried
through read-only DAO without starting Access or executing startup actions.
Neither retained copy is established as the source behind the September PDF.

The ignored review delivery contains the complete machine-readable 38-row
reconciliation and a separate exact-ID review queue. That queue is not an
executable data repair: role decisions and two source records remain unresolved.
Any future release or synchronization needs a separate approved proposal,
fresh conflict checks, full recovery, isolated rehearsal, affected-set and audit
assertions, and a reviewed recovery approach. No owner data has been repaired.

## Verification and preservation

Evidence root: `test-results/task62-correction1-20260927T100512Z-c1/`.
The pre-execution matrix separates fresh checks from source-bound reuse.
The delivery's results and receipt are authoritative for final check, build,
four-role preview/export, accounting, cleanup and preservation outcomes.
Private full-state snapshots, credentials and raw source bodies remain local;
the package contains bounded reconciliation fields and verifiable identities.

The original failed regression is retained. A protected-evidence write failure
was resolved through scoped platform approval. The first pristine gate attempt
found the missing fixture logo files; all 54 were then independently copied and
verified, and the full gate rerun passed. No check was weakened. Historical
implementation/operational evidence and reviews were preserved.

No owner sign-in, report preview/export, migration, provisioning, repair,
app activation/restart or push is part of this run. Migration 73, TASKS bytes
and all 86 checkbox lines are unchanged. Stop for independent correction review.
