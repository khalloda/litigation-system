# Task 6.3 matter-report semantics — implementation checkpoint

30 September 2026. Base `9f50f3b8061b5680a943902f7aa1339b1797581a`.
This is the source map prepared before adapters, not acceptance or a test PASS.
The owner adopted the complete Task 6.3 mandate in this chat. The nine existing
client-report definitions and all their versions/meanings remain authoritative.

## Source provenance and limits

Evidence root: `test-results/task63-20260930T011622Z/`. The input verifier passed
before safe extraction. `source-report-properties.json` and
`source-form-properties.json` record line-numbered properties and SHA-256 of the
19 August retained direct exports. The six catalog files under
`D:/chatGPT/Litigation-Database/analysis/catalogs/` identify menu actions and sources.

The 27 September supplied Access review copy still hashes to
`5b0ee4419e81b8f8f1c66834d0a24e2c023912acb1efd2617b58a435332b7dfd`.
Eleven relevant report definitions were freshly imported into a new blank
task-owned database and exported without opening reports/forms, running startup
actions or following links. DAO metadata confirms zero linked tables. Original
and read-only copy hashes remain exact. `access-definitions-proof.json`,
`current-report-properties.json` and `access-query-definitions.json` bind these
observations. These establish definitions, not successful live Access execution
or consistency of the original departmental backup operation.

## Finite production map

Six new standalone purposes are identified below. The dated pending decisions
below are superseded by the owner's approved continuation recorded at the end.
This count is derived from the trace, not
imposed as a substitute for catalog coverage.

| Entry | Production destination | Source meaning / disposition |
|---|---|---|
| `Copy Of cases` | `matter-hearing-history` | Matter form `Command23`, caption `تسلسل الجلسات`. Exact matter ID from Dashboard subform; matter header and every related hearing through `الجلسات subreport1`. No active/selected/date restriction. |
| `rptFinishedMatters` | `matter-closed` — decision pending | Reports `Command158`. Required client, closed status `منتهية`, subject other than exact `مطالبة بالأرباح السنوية`, bounded hearing DATE and both legacy flags. Source grain is each qualified hearing, not end_date. Latest/manual current rule is not supplied by Task 6.2. |
| `rptJudgmentsForAgainst` | `matter-judgments` | Reports `Command128`, detailed by outcome. Every hearing in inclusive period with outcome IS NOT NULL, including empty and unfamiliar outcomes. Group by exact outcome, then ascending date/ID; hearing court/circuit; client, parties, subject and dated decision. Separate exact صالح/ضد totals. |
| `rptصالح-ضد مفصل` | `matter-lawyer-judgments` | Reports `Command250`. Selected lawyer A, bounded hearing DATE, outcome not empty (also excludes NULL). Group by exact outcome then date/ID. Current distinct lead assignment IDs replace source lawyer A text. Prints hearing notes as well as client, court/circuit, parties, subject and dated decision. It is not the unknown Task 6.8 report. |
| `صالح ضد -إحصائيات مجمعة` | `matter-outcome-summary` — attribution decision pending | Reports `Command129`, truncated action target resolved by exact catalog object. Required hearing period. Contains lawyer percentages, monthly section and two embedded outcome forms. Base query includes all non-NULL outcomes. |
| `صالح-ضد شهور -تقرير فرعي` | Dependency of outcome summary | GroupOn=4 on hearing DATE (month); monthly for/against and sum, footer counts all source rows. Preserve distinct recognised subtotal versus all non-NULL rows, including empty/other. Do not invent a separate menu item. |
| `صالح-ضد محامين -بالنسبة` | Dependency of outcome summary | Lawyer grouping; favourable numerator / report-wide favourable denominator, NOT win rate. Retained query requests a missing `محامي` column from `صالح-ضد`; current supplied copy confirms the defect. Attribution requires owner decision. |
| `غلاف الملف` | `matter-file-cover` | Matter form `Command78`. One selected matter, no business-status/selection restriction. Printed client, case number, parties/capacities, subject, category, degree, lawyer A and partner. Old `cases test` and controls mix obsolete and current names; map those established field meanings to current ID relations. |
| `الجلسات subreport1` | Dependency of hearing history | Linked `matterID`; hearing date, decision, action, court, circuit and first-attendee source control. Preserve current ordered attendees rather than stale text; no latest-only reduction. Date sort is in report grouping; stable ID resolves ties, undated last. |
| Active/by-branch matters | Existing client definitions unchanged | Menu `Command55/137/265/266/58/59` targets the already accepted client family; D18 lawyer filter remains `client-status`. Do not duplicate those purposes. |
| Shared/not-shared buttons | Task 6.4, no merge performed | `Command146/248` target the two individual team reports below. Both use the same team query; the “shared” layout adds reviewer/co-lawyer columns and a summary subreport. Neither query contains a distinct-person sharing predicate. They are the explicit individual/team exclusion in the adopted Task 6.3 mandate, not two inferred new matter filters. Preserve the future merge/menu decision required by REPORTS.md. |
| `Lawyers sub-report` | Task 6.4 dependency | Called by individual/team reports, not an in-scope standalone above. Do not introduce team-on-matter storage or recreate team membership from names. |

### Copy comparison

`Copy Of cases` is not interchangeable with `cases`: its query joins clients,
uses current `matterID` selection, exposes fourteen source fields and links
hearings by `matterID`. The old `cases` query selects only three obsolete names,
has no selected-matter predicate, and links hearings by case-number text while
other controls request fields absent from that query. Therefore no duplicate
merge decision is needed; only the cataloged selected-matter purpose is built.

The two individual lawyer report copies have identical record-source names and
SQL but materially different controls. They remain deferred together to 6.4;
this task neither merges them nor declares their legacy names to be predicates.

### Complete authoritative 45-entry disposition

| Disposition | Exact catalog entries |
|---|---|
| Existing nine, unchanged | `Contact list for active clients`; `rptClientBranches`; `rptClientMatters1`; `rptClientMatters1ByBranch`; `rptClientMatters1ByBranch&Finance`; `rptClientMattersWithEvaluation`; `rptClients-Branches-Evaluation-Finance`; `rptJudgmentPerClient`; `تقرير عملاء 2` |
| New six standalone | `Copy Of cases`; `rptFinishedMatters`; `rptJudgmentsForAgainst`; `rptصالح-ضد مفصل`; `صالح ضد -إحصائيات مجمعة`; `غلاف الملف` |
| Three Task 6.3 dependencies | `الجلسات subreport1`; `صالح-ضد شهور -تقرير فرعي`; `صالح-ضد محامين -بالنسبة` |
| Task 6.4 eight standalone/dependency entries | `Copy Of تقرير فردي لفريق العمل بالمحامي أ`; `Lawyers sub-report`; `تقارير المحامين`; `تقرير بأعمال المحامي خلال فترة`; `تقرير بأعمال المحامي خلال فترة قادمة`; `تقرير فردي لفريق العمل بالمحامي أ`; `تقرير فردي لفريق العمل بالمحامي ب`; `توزيع دعاوى جديدة للمحامين خلال فترة` |
| Task 6.5 hearing family | `rptHearingsBetween2Dates`; `rptHearingsDecisionsBetween2Dates`; `توزيع جلسات أولي 31-12-2020`; `توزيع جلسات نهائي 31-12-2020`; `جلسات الشهر حسب الفريق` |
| Task 6.6 administrative/decision family | `rptSubNeededDecisions`; `أعمال إدارية`; `أعمال إدارية جميع الجهات -جديد`; `أعمال إدارية حسب العميل`; `قرارات مفتوحة`; `قرارات مفتوحة جميع الجهات`; `متابعة القرارات` |
| Task 6.7 documents/POA family | `rptAllPOAs`; `بطاقة حركة توكيل`; `بطاقة حركة مستند`; `تقرير التوكيلات`; `تقرير المستندات`; `تقرير جميع المستندات` |
| Task 6.8 sample prerequisite | `صالح-ضد مفصل حسب المحامي` only; do not infer layout from the known detail report |

`catalog-coverage.json` proves all 45 literal catalog entries occur exactly once
in this disposition table. D17's dropped
`Copy Of صالح-ضد temp-JTI` remains absent. Noncatalog original/copy definitions
are comparison evidence, not permission to expand the report family.

## Common data and display contract

Current stable IDs govern clients, matters, lawyers and ordered non-retired
party/capacity/attendee relations. Include native records. Archive flags do not
remove records or change totals; inactive/external people retain assignments.
Never refill a cleared value from raw legacy text. Preserve full case-number
strings, marks, line breaks, null versus empty, and unknown outcome groups.
Every list count names its actual grain (hearings, matters or summary rows).
No monetary aggregation is present in this family.

Required periods are inclusive civil hearing DATE bounds, implemented using an
exclusive next-day end. They are not closure timestamps or a five-year dashboard
window. Cairo applies to generation metadata; date values do not pass through
machine timezone conversion. Preview and full exports share one canonical result.

Use the accepted report shell, labels, error/focus behavior and Noto Sans Arabic.
The file-cover direct controls show no labelled manual-entry fields: do not
invent record fields from graphical whitespace. Inspect rendered layout before
finalizing whether any genuine ruled manual blanks need reproduction. R4 PDF
copying is accepted, NOT FIXED; search is uncertified and not tested.

## Pending decisions

The owner has been asked about closed-report All closed/latest versus current
saved selection, and distinct-lead outcome attribution versus fractional credit.
These are genuine new meanings not resolved by the earlier six-client-report
decision. The dependent adapters remain on hold; other implementation continues.

### Additional partner-field gap (30 September, 02:00–02:14 UTC checkpoint)

The current schema has no matter-partner assignment. `legacy_partner_raw` is
immutable retained source text, not a current relation; 1,175 restored matters
have a non-null value. For example, matter 1698 (`1 / 2010`) retains
`د. هاني سري الدين`. Team reviewer, billing reviewer and `co_lead` are different
meanings and cannot substitute. See `partner-source-gap.json` and schema
`Matter.legacyPartnerRaw` / `MatterLawyer.role`.

A third owner question proposes displaying that text with an explicit historical
source label, or omitting it with a limitation, or separately designing a current
partner assignment. No answer is assumed. The current working history/cover
adapters omit that pending field; they are not complete for final delivery until
the decision is applied. Their other current fields and all hearings can be
implemented and independently tested now.

### Lawyer A principal-role correction

D5 and `scripts/lib/matter-relationship-plan.ts` lines 403–424 establish that
the first member of an Access lawyerA combination became `lead` and subsequent
members became `co_lead`; lawyerB became `support`. Therefore current lawyerA
reporting must use both principal roles. The first working implementation's
lead-only predicate was incomplete even though its initial oracle agreed.
Both adapters and their independent expectations are corrected; source-backed
tests are rerun. Support assignments remain outside this particular source field.
The pending summary attribution choice applies to distinct people across both
principal roles. No assumption that overlap is absent is retained.

## Approved continuation — 30 September 2026

The owner explicitly adopted `task63-approved-continuation-prompt.md`, replacing
the intervening All closed ONLY proposal. The three holds above are resolved:

- `matter-closed`: All closed is default, latest hearing overall by date/ID,
  then inclusive hearing-date period. Selected uses an exact hearing from the
  independent closed-report scope, then the period. Both keep the client,
  closed-status and exact annual-profit-subject exclusion. NULL subject remains
  excluded by the source SQL predicate. No additional nonempty-decision rule.
  Archived content remains eligible; a reopened selected matter or absent,
  foreign or undated saved hearing blocks Selected output until resolved.
- Closed selections begin empty and use separate current/history/receipt storage,
  purpose-bound requests and a cross-purpose retry-token guard. The accepted
  client selection semantics and rows remain intact. Candidate76 is additive;
  the [design](task-6-3-closed-selection-design.md) preceded its isolated apply.
- `matter-outcome-summary`: current distinct non-retired lead/co_lead people get
  full hearing credit. Supporting roles do not. Inactive/external references
  remain eligible. Unassigned is visible; overall/monthly/annual totals never
  multiply hearings. Share = favourable credit / all unduplicated favourable
  hearings in scope, including unassigned, to two decimals; NULL at zero
  denominator. This is not win rate and joint shares may total above100%.
  Monthly and annual sections follow the requested period, not dashboard years.
  Chart bars read the exact adjacent table cells.
- History and cover display exact `legacy_partner_raw` as
  `الشريك — كما ورد في المصدر`, with a visible historical-source note. It is
  neither editable nor a current assignment; no fallback person is invented.

These are owner-approved replacements for missing/broken source meanings, not
claims that the source already supplied them. The original source limitations,
copy comparison and entire45-entry catalog map remain evidence. No DECISIONS,
governance or TASKS edits are made.
