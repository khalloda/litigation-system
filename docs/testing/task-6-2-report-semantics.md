# Task 6.2 client-report semantics — adopted implementation contract

Base: `0f67c55c342bee896a8c32ab991b8de1f6112689`. The owner adopted the
Task 6.2 implementation mandate on 26 September 2026. This is an implementation
contract in progress, not acceptance or an assertion that the reports pass.

## Authorities and evidence

The retained `D:/chatGPT/Litigation-Database/analysis/catalogs/` contains
`reports.csv`, `queries.csv`, `live_queries.csv`, `actions.csv`,
`direct_object_export.csv` and `direct_fallback_metadata.csv`. The corresponding
successful direct Report exports are in `analysis_direct/reports/`. These are
read-only source evidence, not a live Access execution. The new ignored evidence
root is `test-results/task62-20260926T145000Z/`; `source-probe.json` captures
the exact direct-export identities and relevant control/group/query properties.
The four Type 4 copies failed full export historically; their fallback metadata
and the saved `Clients report` query are retained. No new extraction was run.

All nine current definitions remain distinct except the explicitly approved
D17 merger. D18, the authoritative Type 4 layout and the adopted mandate outrank
the old copy-specific filters. Current PostgreSQL IDs replace name joins;
current ordered, non-retired relationships replace old combined party/lawyer
text. An archived client, matter or hearing is not excluded (D52/D58/D61).
Retirement of a relationship is different from archiving its parent. Original
source text is never used to refill a deliberately cleared current value.

Gate 4's six fixed datasets stay unchanged as historical reconciliation tests.
Their client-3 restriction and transformed-legacy population do not define the
production catalog. No live Access equivalence is claimed by this investigation.

## Required catalog and source findings

All nine definitions are registered as version `1` in the local candidate.
Implementation verification remains in progress; catalog presence is not acceptance.

| Legacy entry | Planned ID | Proven source contract / layout | Unresolved or approved difference |
|---|---|---|---|
| Contact list for active clients | `client-active-contacts` | Saved `Contact list`: contacts joined to clients; client Status="active" AND Cash/probono="cash"; eight contact columns; grouped by Client_en. One contact identity per row. | Use current client IDs, Arabic-first name and retained English name; preserve duplicate/unnamed contacts and all archive states. Main-contact selection is not a predicate. |
| rptClientBranches | `client-branches` | Client required; matterSelect=Yes and hearing report=Yes; no status or nonblank-decision predicate. Branch header, opponent ordering. Matter court/circuit; hearing date/decision. | Approved replacement: current criteria and latest hearing overall, selected before other hearing qualifications. Null branch must remain an unassigned group under D19/D39. |
| rptClientMatters1 | `client-matters` | Client required; active matter; both selection flags; decision<>empty; flat list, hearing court/circuit/date/decision. | Approved replacement: current criteria and latest hearing overall, selected before other hearing qualifications. |
| rptClientMatters1ByBranch | `client-branch-matters` | Client and branch parameters; both selection flags; nonempty decision; no status restriction. Flat branch-specific list; matter court/circuit. | Unassigned is a valid branch choice. Approved replacement: current criteria and latest hearing overall, selected before other hearing qualifications. |
| rptClientMatters1ByBranch&Finance | `client-branch-finance` | Same branch-specific predicates; hearing court/circuit, date/decision and raw financial-provision text. No numeric sum control. | Provision remains exact text, including null/empty; no invented currency or total. Approved replacement: current criteria and latest hearing overall, selected before other hearing qualifications. |
| rptClientMattersWithEvaluation | `client-evaluation` | Active matters, both flags, nonempty decision; branch header then opponent order. Menu promises evaluation without finance, but actual query omits matteEvaluation and control named تقييم reads المخصص المالي beneath ملاحظات. | Resolved by adopted prompt entry 6: current evaluation, not financial provision; conflicting legacy binding is retained as a source-evidence limitation. |
| rptClients-Branches-Evaluation-Finance | `client-branch-evaluation-finance` | Client required; both flags, nonempty decision; all statuses; branch grouping. Separate matteEvaluation and المخصص المالي controls, hearing court/circuit/date/decision. No sum control. | Exact current evaluation and retained provision text; no financial aggregation. Approved replacement: current criteria and latest hearing overall, selected before other hearing qualifications. |
| rptJudgmentPerClient | `client-judgments` | Client and both hearing dates required; hearing outcome<>empty; one qualifying hearing per row; date ascending. Court/circuit, parties, subject, dated decision. Menu explicitly says بدون مبالغ; amounts/lawyer selected in SQL are not displayed controls. | Preserve all nonempty outcome values, not just dashboard for/against; do not sum repeated matter amounts or add them to this report. Stable hearing ID resolves equal dates. |
| تقرير عملاء 2 | `client-status` | D17 merges 2/6/8/all-status copies. D18/Type 4 require client, optional period/lawyer, active default or all, one matter once, latest hearing overall and descending activity date. | Query/calling form has no period predicate or lawyer-role rule. Approved period filters the selected latest-overall date, inclusive supplied bounds. Lawyer selection uses current matter-assignment IDs; no name matching or retired links. |

## Safe current semantics

- Branch is the reviewed site/subsidiary ID on a matter, never a new client/branch
  relationship inferred from names. Verify the current 18 values and reviewed
  D39/Sigma/Alpha mappings in the isolated full-state fixture; preserve the 14
  legitimately cleared source-heading branches and the 55 released matters.
- Exact text cells distinguish SQL null from empty text in typed results and the
  XLSX exact-value sheet. Financial provision has no numeric total in the traced
  controls; it remains text, never a cast to money or an invoice balance.
- Contact output includes contact name, email, job title, business/mobile phone,
  address, city and country. Stable client/contact IDs prevent duplicate-name
  merging. Business `Active` and fee-paying `Cash` comparisons follow their
  established case-insensitive source meanings, independently of archival.
- Judgment dates are hearing business dates, with inclusive end day implemented
  as an exclusive next civil day. Missing dates fail a required bounded period.
  Empty and null outcome are excluded; an unfamiliar nonempty value is retained.
- Type 4 retains a truly latest record even when its decision is blank. Dated
  hearings precede undated hearings; equal dates use stable hearing ID. A matter
  with no hearing and one with only undated hearings remain distinguishable.
  No-hearing/undated matters may appear unbounded; any supplied bound excludes them.
- Count rows count logical rows, never continuation lines or multiplied child
  joins. A judgment is a hearing; a contact is a contact. Matter report counts
  count one qualified matter once.
- All four roles may read/run/export within existing server resource permissions.
  Report catalog/options are read-only; run/export events remain truthful and
  distinct from actual browser receipt. Audit export capability is unrelated.

## Owner-adopted continuation — 26 September 2026

The owner directly adopted `task62-business-decisions-continuation.md` in this
same chat. Its exact body and SHA-256 are preserved in the evidence root as
`adopted-business-decisions.md` and `business-decision-provenance.json`. The
document's preparatory wording did not establish approval; the direct adoption did.

1. Type 4's period filters the latest hearing/action OVERALL, selected first.
   A January hearing followed by September is excluded in January and eligible
   in September. No older in-period/nonblank fallback. This current-position
   meaning appears beside inputs and in export parameter summaries. Both bounds
   are inclusive civil dates; missing dates cannot satisfy either supplied bound.
   Unbounded periods include no-hearing and undated matters otherwise eligible.
2. The six legacy manual-selection reports use current client/status/branch
   criteria and one latest hearing per matter. Both old flags cease to be
   inclusion requirements. All six retain their original hearing requirement.
   Only client-branches allows a null/empty latest decision; the other five
   require a nonempty decision AFTER latest selection. client-matters and
   client-evaluation retain fixed active status. Native/old-unselected records
   qualify by these same criteria. No flag editor or migration is introduced.
3. Actual evaluation was already required by original mandate entry 6; the
   legacy evaluation control's provision binding is documented, not copied.

The Type 4 legacy date restriction remains unsupported by the retained exports;
the explicit owner decision supplies that missing business rule. No live Access
equivalence is claimed. Per-definition legacy/adopted membership and reasons
are separately tested. Judgment keeps every qualifying hearing, contacts every
qualifying contact; neither adopts the one-matter grain.

Latest means greatest hearing DATE (dated before undated), then greatest hearing
ID. All-undated sets choose greatest ID. Type 4 orders selected date descending,
hearing ID descending, then matter ID ascending, with no-hearing last. Other
reports use current branch labels in UTF-8 byte order (null last), stable branch
IDs, and evidenced opponent order for branches/evaluation, then stable matter ID.
Ungrouped legacy definitions with no evidenced ordering use stable matter ID.
Branch-matters preserves distinct court AND circuit columns; other definitions
combine the evidenced matter/hearing court and circuit without duplication.
Finance/evaluation columns follow latest decision in the traced RTL order.
Totals count logical matters; raw provision is never summed. All seven use
verified current client branding with the established fallback.

## T61-N1

Only visible XLSX generation time changes. Format with IANA `Africa/Cairo`,
Western numerals, the same short date/medium time style used by UI/PDF. Keep the
UTC `generatedAt`, workbook creation instant, operation identity, audit metadata
and business DATE values exact. Actual saved/decoded XLSX proof must independently
expect winter 14:00, summer 14:32:36 and next-day 01:30 for the three mandate
instants. Original review/sample remain untouched.

## Verified intermediate implementation (26 September 2026)

`client-active-contacts` has one contact per row, grouped by current client ID,
ordered by retained English client name with PostgreSQL `C` collation (null last),
then client/contact IDs. The group heading shows current Arabic and English names.
Eight typed columns retain null/empty text. All 100 qualifying contacts in the
pristine copy match the independently loaded normalized relations (55 groups).

`client-judgments` uses each qualifying hearing ID once, ascending hearing DATE
then ID. Its required inclusive period becomes `>= from AND < dayAfter(to)`.
Hearing court/circuit and decision are current fields. Current non-retired parties
and capacities are loaded in one set query, ordered by ordinal (null last) and ID;
the gendered capacity labels are quoted beneath each name. No source raw fallback,
financial amounts, matter status, manual report flag or archive exclusion is added.
The original report has firm branding and no client-logo control. Client selection
requires clients, matters and hearings read permissions. The adapter makes three
set queries for nonempty results (client label, hearings, parties), two when empty.
Across all 318 current clients, the full-data oracle compared every ordered typed
row, with additional exact-day and zero-result runs (322 runs over 13,382 hearings).

`two-reports-browser/` records real four-role sign-in on a separately built fixture
app and 16 actually saved XLSX/PDF files. `two-report-file-inspection.json` compares
every ordered XLSX type/value/identity against the independent oracle and checks
actual PDF glyph embedding/page bounds. Representative contact pages 1/10/18 and
the one-row judgment PDF were inspected. PyMuPDF's process-level image cache
omitted repeated headers from initial inspection PNGs; fresh-process page renders
show them correctly. The unchanged PDF has an identical header image on all 18
contact pages. The initial PNGs and diagnostic attempts remain preserved.

Shared form changes clear stale preview/download state when submitted parameters
change, preserve inputs through validation, and reset controls to trusted defaults.
Enum defaults are server validated; explicit invalid values do not become defaults.
The optional trusted count label supports Type 4's required matter total across
preview/XLSX/PDF without changing the generic engine's logical row count.

The intermediate proof above is retained. Completed nine-report native/archive,
browser/accessibility and performance proof is mapped in the final acceptance
matrix and implementation report; final packaging identities are in the receipt.
