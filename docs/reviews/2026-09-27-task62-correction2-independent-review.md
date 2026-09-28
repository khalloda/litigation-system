# Task 6.2 correction2 — independent implementation and proposal review

27 September 2026. ChatGPT planning/review conversation.

**Verdict: PASS for the reviewed selection implementation and candidate migration 74. No blocking implementation defect was found. HOLD owner operations and full Task 6.2 closure pending exact capacity decisions, initial-selection approval, and the separately reviewed repair/provenance execution plan. Nothing in this review activates or publishes the candidate.**

This is an evidence-based independent review, not a rerun of the Windows implementation. The existing court correction (T62-O1) remains accepted but unactivated. T62-O2's source questions are explained; its actual data repairs are still unapplied. Keep the agreed order: finish correctness and operational review, then UI refinement, then Task 6.3.

## Reviewed identities and current boundary

| Item | Identity / evidence |
|---|---|
| Last published main in supplied receipt | `1f0754bf0186d69cfcca3e82df888c54b22863fb` |
| Correction1 base | `6550a6bc0605b916c3f60daa9b797fba056f8882` |
| Correction2 implementation | `662b72015f5bce55ba50f60bb878738c3e0d307b` |
| Correction2 documentation child / reviewed HEAD | `be0b3b57834c83c62c086104379bdc552c37aebc` |
| Final tree | `0128e6c69020628316186f09d2d7454497dc3b79` |
| Supplied Git observation | Clean main, three ahead / zero behind unchanged published main |
| Owner database in final supplied observation | 141 tables, 48 sequences, 73 completed migrations, 927 audit rows |
| Last supplied runtime observation | 27 September 2026, 18:02:36 Cairo: PID 28636, earlier build `DcwUbnikdCk5b39gZNOSN`, login HTTP 200 |

These are dated supplied Windows observations. No live owner-host or remote check was performed here, and historical PID/build observations do not prove present uptime. The candidate selection workflow and migration74 are not live.

## What passes

Both `client-status` and `client-matters` now have explicit comprehensive and Selected for report modes. Selected mode uses a current, deliberate hearing choice per matter. Date, decision, court and circuit come from that same hearing, including an older selected hearing; there is no silent latest-hearing substitution. Original Access/import flags remain unchanged. Comprehensive mode retains its original qualifications and latest-overall-before-period behavior. The other seven report definitions keep their existing semantics.

The new editor supports native and imported matters, explicit save, paged choices, a retained off-page selection, clear draft state, field errors and stale-version recovery. All four existing report roles can read and export; only Administrator and Litigation Assistant can save, under existing matter/hearing authority. The commit gateway rechecks current account/person/session/role eligibility and trusted audit identity, locks relevant records, checks versions and parent membership, and refuses unauthorized, archived or conflicting writes. Runtime direct storage writes are revoked.

Migration74 creates three empty selection/current-history/submission tables, with no sequence or embedded client seed. Deferred invariants cross-check the current state, complete version chain, owned submission and exact audit event. Hearing-parent changes cannot leave a cross-matter choice. Existing73 migrations remain byte-identical. An exact retry returns its owned result; a true business no-op adds only the explicitly documented owned submission receipt, without selection version/history/audit changes. This is deliberate and tested, not a claim of zero private-receipt writes.

A selected draft blocks generation before optional filters. `client-matters` additionally requires an active matter and nonempty chosen decision; `client-status` retains its own null/empty behavior. Saved/included/excluded counts expose later filtering. Archived saved choices remain readable; ordinary archive restrictions still apply to edits. These checks prevent a superficially successful but silently incomplete selected report.

The candidate schema was exercised only in disposable restores. Supplied quiet-upgrade proof reports 141→144 tables, unchanged48 sequences, unchanged138 unrelated old tables and only the expected ledger/audit-registration changes. Fresh source-bound full checks and database gates cover the final source; build/browser runtime inputs are exact. The only later differences from the tested build are one report document and the permanent checkpoint checker, which the final check/database gates cover.

## Why the Access and web reports differed

The corrected screenshot's `التقارير.Command55` opens **`rptClientMatters1`**, with empty filter and WhereCondition. Its report SQL selects the chosen client, active matters marked for reporting, a report-marked hearing and a nonempty decision. It maps to **`client-matters`**, not the distinct `client-status` report used in the original comparison.

The supplied Access review file has SHA256 `5b0ee4419e81b8f8f1c66834d0a24e2c023912acb1efd2617b58a435332b7dfd`. Its bounded extracts contain the same38 matter records and333 hearings. All38 matter records match the retained extract. Of331 prior hearings,328 are unchanged and three have explicitly listed report-flag/attendance changes; none are deleted. Two additional hearing records explain the missing September dates:

| Source hearing | Current matter / source matter | Hearing date | Next date | Disposition |
|---|---|---|---|---|
| 15802 | 3269 / 1671 | 9 September 2026 | 5 December 2026 | Propose a new current hearing, preserving the complete Access record in separate provenance |
| 15813 | 3311 / 1718 | 23 September 2026 | 19 October 2026 | Same treatment; do not overwrite the older July hearing |

For case933/2025, current matter3310, the deliberately selected hearing9273/source15768 is 30July. The newer expert action470/source15769 is 2August. Both remain; the selected workflow explains the difference without changing either record.

| Comparable result | Count established from supplied data |
|---|---:|
| Current `client-status`, comprehensive | 38 |
| Current `client-matters`, comprehensive | 36; its own existing hearing/decision qualifications exclude two |
| Current source `rptClientMatters1` query | 10 |
| Currently mapped complete selected choices used in browser fixture | 8 |
| Additional complete choices requiring the two new source hearings | 2 |
| Source marked matters with no qualifying selected hearing | 3 |

This is not a fixed ten-row rule. The selected report follows approved saved choices. A later legitimate selection may change the count. The source proposal faithfully lists13 marked matters; seeding all13 would leave three drafts and intentionally block selected generation. Recommend initializing the ten complete choices after the two source additions, leaving current selections3106,3150,3288 explicitly unselected, while retaining their original source flags and evidence. That recommendation requires the owner's decision; the isolated ten-choice scenario is not owner approval.

The original department-to-review copy procedure and exact PDF-generating database snapshot remain unavailable. Stable file bytes, absence of linked tables and exact bounded extraction do not establish original-copy transactional consistency or historical PDF snapshot identity. The initially modified task-owned definition-inspection copy and its failure are disclosed; fresh unchanged copies provide the data proof. The original supplied Access file is reported preserved.

## Repair proposals: technically supported, exact approval still required

All29 missing party cells independently trace to preserved `unreviewed_party_role` quarantines:21 opponent and8 client-side entries. Their raw strings are unchanged in the newer source. The proposed29 additions retain each complete party-name line, including compound names and whitespace; no person is created, no name is split, and gender stays unknown. The original raw/import/quarantine history is retained.

The exact-value proposal is19 uses of source spelling `مدعي عليه` mapped to existing capacity2 (`مدعى عليه / مدعى عليها`), plus ten uses of eight distinct source capacities. The latter propose each attested spelling unchanged in both display fields, with no synonym merge or invented legal normalization. These are proposed technical mappings, not legal advice or an approved taxonomy. The owner decision sheet lists every spelling and limitation. `approvedExecutableRows` is empty.

The two hearing additions would use the current audited gateway with honest native creation identities (legacy fields NULL), while preserving complete later Access records and unmapped attendance markers in separate append-only provenance. The three observed changes to existing source hearings are not approved updates and are excluded. No global import or D43 cutover is authorized.

The proposed provenance table is **not in migration74**. Its stable `(kind, source_identity)` uniqueness records source hashes separately, preventing a changed source-file hash from authorizing a duplicate source entity. Two rolled-back rehearsals cover29 party additions, eight proposed capacity rows, two hearings and31 provenance receipts, owned retries, stale/conflict/duplicate rejection and deferred checks. Sequence reservations are honestly recorded; they are not rewound or called transactional rollback.

Before any owner operation, the final exact-ID execution plan must bind the approved labels, two complete source records, chosen seed and provenance schema, then revalidate current versions, empty target sides, source/quarantine identities, exact lookup cardinalities and absence of existing/native/receipted duplicates. Allocate new IDs only in the controlled operation and record their mappings. Persistent provenance schema treatment must follow repository migration authority and be reviewed explicitly; do not append it silently to accepted migration74. D43's later synchronization must consult the stable source receipts. Fresh recovery, isolated restoration/rehearsal and subsequent independent operational review remain required.

## Independent verification performed here

- Independently verified all8,981 ZIP members against the separate manifest: unique safe paths, regular unencrypted members, exact sizes, CRCs and SHA256 digests;118,490,662 uncompressed bytes. Reran the inspected standalone verifier with receipt and core bindings: PASS.
- Actual Git object/index reconstruction independently verified base, implementation and final trees, both commits' patches and the cumulative patch in both directions. Final inventory:923 tracked identities/921 supplied bodies,30 changed paths relative to correction1,893 pre-existing paths unchanged. TASKS bytes/all86 checkbox lines, existing73 migrations and governance identities are unchanged. Historical acceptance-matrix prefix and imported prior review are exact.
- Independently recomputed the 38-matter/333-hearing source comparison, exact button/report predicates, ten target matter/hearing pairs,13/10/3 seed distinction, all29 party-side proposal identities and raw strings, and both source-hearing additions. Reconstructed real-client report membership and selected-hearing courts/dates from bounded rows rather than trusting a PASS label.
- All40 saved files independently checked:20 XLSX with every visible and exact typed cell compared, Cairo timestamps, RTL, no formulas/external links/macros;20 PDFs/64 pages with Poppler text/bounds/content coverage and embedded-font/image-resource inspection. Actual rendered pages were inspected for Arabic, chosen July30 hearing, totals, repeated branding and multiline identifiers. These checks do not constitute final design approval or universal accessibility certification.
- Reviewed fresh recorded build/full checks,3,852 independent report comparisons,480 existing permission decisions plus new selection tests,148+15 database gates and genuine four-role browser activity. Windows/database/browser suites were not rerun here. Final source bindings distinguish the unchanged runtime from later checker/document edits. The six-case correction1 literal court proof remains explicitly reused, with verified unchanged source identities.
- The failed browser batch is retained; its saved outputs and a successful continuation form20 previews and40 saved exports. One completed-but-unsaved PDF is separately reconciled and never counted as a saved file. Supplied fixture accounting covers219 added events from891→1110, four accounts and122 unchanged old tables. The33 supplied malformed-package tests are reviewed implementer evidence, not an independent rerun of those33 cases.

The reviewer encountered an incorrect generic workbook-total expectation and corrected it to each report's custom label. The installed PyMuPDF text extractor crashed on one PDF; Poppler supplied the complete text checks. Direct rendering of an isolated later page gave incomplete placement in both local renderers; sequential full-document rendering in both produced the expected branded page and matched the supplied image. These reviewer-tool limitations are retained and are not asserted to prove a production renderer defect or universal reader compatibility.

## Preservation and next step

The final supplied owner comparison reports exact equality across141 tables,48 sequences and migration73, with927 audit rows and no events during this task's observed window. This does not erase the three events already present between correction1's924-row checkpoint and this task's927-row baseline. No new private-state equality is independently claimed beyond the supplied collectors/comparison evidence. Protected-file and cleanup coverage is bounded to the recorded inventory; disposable fixture removal and prior evidence/recovery preservation are documented.

**Obtain the three decisions in the accompanying brief, then prepare the exact operational handoff for separate adoption.** No extra implementation-correction round is requested by this review. Do not apply migration74, the proposed provenance schema, party repairs, source updates or seeds, start/restart the owner app, push, close Task6.2, begin UI implementation or begin6.3 from this review alone. Execution continues in the SAME existing Codex Desktop task, Local Windows, no subagents.
