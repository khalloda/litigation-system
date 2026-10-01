# Tasks 6.5–6.7 — independent implementation review

**Review date:** 2 October 2026 (Cairo). **Verdict: CHANGES REQUESTED.**

The combined family is implemented, and the delivered evidence is internally verifiable. It is not ready for acceptance or owner activation. Two bounded items need correction: the disclosed PDF-download transport failure, and the administrative-selection editor's stale-conflict Reload flow. No further business decision is needed to work on either item.

This review inspected the uploaded artifacts and source in a separate environment. It did not operate the Windows repository, owner application, database or remote branch. Package integrity PASS is distinct from implementation acceptance.

## 1. Exact checkpoint

| Item | Reviewed identity |
|---|---|
| Published base | `186fd91d4528ac4da480a0699bd0fd44b4fb4749` |
| Final candidate | `09465c4b65e76baf7d72d6c92c4493169fe62947` |
| Parent / final application source | `4ab5a55f929a413fc8fc92773e9adc4518d042c6` |
| Final tree | `069f9045585c8d67288c1388803c52e02ef7bd1b` |
| Final application build | `zOkgjzPES5a1bxa4Kt7fA` |
| Original review ZIP SHA-256 | `77445d15431d132277944ac10cd66eb271eeba2d6b578be0fcb791ae2d6e4241` |
| Latest applied owner migration | **77** |
| Candidate migration | **78, isolated testing only** |

The eight local children are preserved:

`186fd91 → 65ae8e2 → 0bd65b1 → 08ec39e → 3f197e2 → f07405b → 75ffe76 → 4ab5a55 → 09465c4`.

The supplied final Git record is clean, eight ahead / zero behind the published base, and not pushed. There are 58 changed tracked paths relative to the base; the editor activity counter is not the Git change count.

## 2. T6567-N1 — completed PDF exports can fail delivery to the browser

**Priority P2; acceptance blocker; independently corroborated from supplied network/accounting evidence.**

Four isolated PDF exports completed on the server but were not saved because Chromium rejected an invalid HTTP response over a reused local connection. The completed-export audit IDs are **1287, 1378, 1383 and 1744**. The implementation correctly preserves these as uninspected attempts and does not claim a transport fix.

Evidence includes `evidence/failure-disclosure.json`, `fixture-final-accounting.json`, `transport-role0-r4.json`, `transport-role3-sanitized.json` and `transport-isolation2.json`. The affected requests include the already accepted `client-branches` export and the new `document-movement-card` export. One trace records an HTTP response-header parse error; another shows non-header bytes arriving where the next HTTP response was expected on a reused socket. These observations locate the symptom. They do not establish whether the cause is in application response handling, the launch/harness environment, a transport intermediary, or browser behavior.

The user impact is a failed download despite a completed export audit event. Successful replacement downloads and a separate 300-download static-server probe do not demonstrate that the actual application problem is fixed. Earlier lost Task 6.4 PDFs do not establish the same cause.

**Required correction and closure evidence:** diagnose a bounded, representative sequence against the real isolated production app, comparing fresh and reused connections and retaining the exact launch/browser environment. Identify the failing request/response boundary and explain the cause before choosing a narrow fix. Use the existing locked dependencies first. Preserve authorization, auditing, response/cache headers and exact output bytes. If the defect proves to be confined to the test harness, demonstrate that distinction against the ordinary application launch and UI flow; changing the harness merely to avoid the failing path is insufficient.

Collect a relevant before/after regression, repeated genuine UI downloads under the conditions that exposed the problem, independent checks of the saved bytes, and exact execution/export accounting. Each uncertain completed attempt must be reconciled before a deliberate retry. An automatic duplicate export, longer wait, fresh browser for every download, static probe, or undocumented connection-setting change is not an adequate standalone fix. If a bounded investigation cannot establish a cause, retain N1 as open with the strongest remaining hypothesis and a concrete next proposal; do not turn passing retries into acceptance.

## 3. T6567-R1 — Reload after a stale selection conflict does not reset the draft

**Priority P2; source-supported recovery defect. Actual isolated-browser reproduction is required in the correction round.**

The new `src/app/reports/administrative-selection/editor.tsx` initializes rows, selected/saved values and selection versions only in the lazy `useState` initializer (lines 31–46). Save uses that stored version (lines 56–71). A stale failure leaves the draft/version in place (lines 90–101), and the offered recovery control is `<Link href={reload}>` (lines 220–222).

The parent page gives the editor the key `kind:parent:page` and reloads the same URL (`administrative-selection/page.tsx`, lines 151–159). A same-route client navigation does not provide an explicit reset of that component's local state. Even refreshed record props do not rerun its state initializer. A subsequent Save can therefore retain the stale selection version and repeat the conflict instead of completing the recovery the UI offers.

The accepted client-selection editor already uses a document-navigation `<a>` for its corresponding reload control (`src/app/reports/selection/editor.tsx`, line 244). That is a useful narrow precedent, subject to the existing dirty-draft confirmation behavior.

The supplied browser script `evidence/browser-selection-save.mjs` reproduces a stale conflict but then closes the stale tab. Its later `page.reload()` operates on the other tab; it does not test clicking the failed editor's Reload control. Existing stale-write rejection tests remain valid, but do not close this recovery gap.

**Evidence boundary:** the reviewer has not run this route in a fresh Windows browser. This finding follows from the exact component state/key/navigation code and the missing recovery test. The correction should start by reproducing it on the preserved candidate. If actual behavior contradicts the source analysis, retain the concrete evidence and resolve that contradiction rather than editing mechanically.

**Required correction:** make the explicit Reload control obtain current server values and reinitialize that editor after the user agrees to discard its draft. A real document reload, matching the accepted pattern, is a plausible small fix. Do not add a broad props-sync effect or a version key that silently discards another row's dirty draft whenever one row is saved. Keep field/parent/record versions, uncertain-response retry IDs and save authorization unchanged.

**Closure test:** two genuine fixture tabs begin with the same version; A saves; B receives the stale refusal. Cancelling Reload preserves B's draft and creates no write. Accepting Reload displays current saved state/version and creates no write; B can then deliberately save one new change with exactly one corresponding receipt/history/audit effect. Cover both hearing and administrative-step scopes, the permitted role distinctions, parent/record-version changes where relevant, and another dirty row. Preserve the response-loss retry path. A browser's toolbar reload is not a substitute for testing the actual offered control.

Primary documentation used to check the state/navigation inference (retrieved 2 October 2026 Cairo): [React useState](https://react.dev/reference/react/useState), [Next.js Link](https://nextjs.org/docs/app/api-reference/components/link), and [Next.js useRouter](https://nextjs.org/docs/app/api-reference/functions/use-router). These explain initializer and client-state preservation; they are not evidence of an independently executed application test.

## 4. What passed this independent review

**Delivery/source integrity:** all 4,877 archive members were checked for safe paths, duplicate/colliding identities, size, CRC and SHA-256. The supplied receipt-inclusive verifier was inspected and rerun successfully. Independent native Git checks reconstructed all nine commit/tree anchors, all eight incremental patches forward and reverse, the aggregate patch both ways, and every supplied source body/mode. The prior accepted base matches. The final tree contains 1,047 tracked identities and 1,045 supplied bodies; the two intentionally omitted configuration bodies remain identity-bound, not inspected here.

Governance, dependency locks, old migrations and all TASKS bytes/86 checkbox lines are unchanged. Candidate migration 78 is `20261001123000_administrative_report_selections`, SQL SHA-256 `d734fe640144397d96b22b78d65544ce28601ee185e52fc26624ba1ae12e88bb`. Its owner application is not authorized by this review.

**Source review:** reviewed the hearing, team, administrative and document/POA adapters; selection page/editor/actions/service; migration 78 and its guards; changed input/options/result/registry/renderers; relevant permission/audit inventories and tests. No additional blocking query, migration, role-control or report-display defect was identified in that scope. This is not an exhaustive repository-wide security audit or a fresh database execution.

**Saved spreadsheets:** a separate reviewer script decoded all **101 XLSX files**, **106,689 typed cells**, spanning **38 report IDs** in the final and width-correction campaigns. It checked complete row values, precision/types, NULL/empty distinctions, leading zeros, formula absence, RTL, totals, movement-template cells and Cairo generation metadata. Comparisons use the supplied result models, with separate supplied full-data oracle evidence inspected; the reviewer did not generate a fresh database oracle.

**PDFs:** checked the identities, font/page structure and geometry of all **101 saved PDFs**. Fresh Poppler renders were visually inspected for **32 pages across all 17 new report layouts**, including first/middle/last samples for long outputs, long administrative text, blank movement grids, identifiers, dates, year widths, headings and pagination. No new blocking display defect was found in these samples. This does not certify every page of the 293-page POA or 145-page document inventory, every viewer, copying/search, or universal accessibility.

**Supplied execution evidence:** inspected the recorded full project check/build, permission decisions, report-contract checks, full-data family oracles, migration tamper/upgrade checks, database gates, four-role browser exports, selection protections and reuse bindings. These Windows/database/browser campaigns were not rerun by the reviewer. The recorded build-label correction is explicit: earlier mislabeled browser metadata is superseded by the byte-bound artifact proof, not silently rewritten. The final POA width correction is source-bound and has new outputs; older superseded files remain preserved.

The separate reviewer-verification ZIP contains the executable read-only review scripts, proof results and sampled renders. Its PASS results do not override the two findings above.

## 5. Business meaning and migration assessment

The 18 source catalogue entries resolve to 17 new production reports, rather than 18 automatically distinct IDs:

| Task | New report IDs |
|---|---|
| 6.5 | `hearings-by-next-date`, `hearing-decisions-by-date`, `hearing-distribution-preliminary`, `hearing-distribution-final`, `team-hearings` |
| 6.6 | `administrative-by-destination`, `administrative-all-destinations`, `administrative-by-client`, `open-decisions-by-destination`, `open-decisions-all-destinations`, `unnotified-decisions` |
| 6.7 | `poa-inventory`, `client-poas`, `poa-movement-card`, `document-inventory`, `client-documents`, `document-movement-card` |

The three owner decisions recorded in `docs/approvals/2026-10-01-tasks-6-5-6-7-report-decisions.md` are settled: current team assignments with disclosed overlap; separate administrative hearing/step choices; and an explicit unnotified-decision period ending today. Do not reopen those questions.

The earlier Ahmed Essam Sami mismatch safeguards are substantially carried forward: source-specific periods/grains and court choices, deliberate saved selections, no empty Selected-to-All fallback, no borrowing the client/closed/lawyer selections, and honest historical/missing values. The two new administrative choice scopes start empty. All selected steps or hearings required by a source are preserved; they are not silently replaced by a single latest row. The source's latest/tied-step rules and NULL exclusions are made explicit where applicable.

POA inclusion respects its explicit report flag; copy-count highlighting does not silently remove a record. Current lawyer assignments and historical names are distinguished. Movement cards are blank printable templates, not a new custody/check-in/out workflow. The dormant Toyota source filter is not treated as a current document-report restriction.

Migration 78 adds independent administrative hearing/step current, history and receipt records plus a five-purpose submission registry. The registry's backfill binds existing retry receipts; it does not seed report selections. Reviewed SQL guards cover actor/session/role authority, membership, optimistic versions, archive rules, idempotent and no-op retries, cross-purpose replay, history/audit correspondence and constrained runtime grants. Prior selection-function protections are retained. No new migration change is requested to resolve N1 or R1.

These findings do not mean the newer live Access database has been synchronized. The reports use the approved application data and the retained source definitions.

## 6. Fixture and owner accounting — do not overstate preservation

The final fixture evidence reconciles **697 audit additions**, from 1,116 to 1,813. There are 320 report executions and 206 completed exports: **202 unique saved files plus four completed unsaved PDFs**. The saved set is 101 PDF and 101 XLSX. Superseded width-attempt files and the four unsaved attempts are not represented as additional final inspected outputs. Fixture cleanup is recorded; private recovery/state bodies remain local.

The owner comparison is **preservation with reconciled concurrent activity**, not literal zero change. Eighteen owner-account events occurred during the work: 14 report previews, two exports, and the two-event hearing-11003 archive operation. Four hearing archive fields and the associated history/receipt/audit state changed. A read-only logical inverse of that specific archive matches the baseline; it was a comparison, not an actual undo. Schema, sequences, migrations, credentials and existing selections are reported preserved. The database account is established; the human behind those actions is not independently established.

The supplied record also reports an owner-authorized start of the unchanged accepted Task 6.4 artifact after it was found absent. That is not activation of this candidate. The original direct startup authorization is not independently replayed by this review. A previous one-off start is not permission to restart the owner app during the correction.

Latest supplied post-package observations are dated **1 October 2026, approximately 21:39 Cairo / 18:39 UTC**: accepted Task 6.4 build `_ehqxQr_3RiIGEhysOBbY`, PID **12052**, port 3000; owner migration **77**, 152 tables, 48 sequences and **1,134 audit events**. These are supplied dated observations, not current access or continuous uptime. No owner migration 78, repair, selection seed, Access synchronization, candidate activation, acceptance or push is evidenced.

Outstanding factual attribution question: were the report checks at about 15:37–15:41 and the hearing-11003 archive at about 15:50 Cairo on 1 October your actions? Technical correction work can proceed without that answer; do not infer personal attribution or undo the activity.

## 7. Disposition and next work

Continue in the **same Local Windows Codex Desktop task**, using the accompanying `task65-67-correction1-prompt.md`. Preserve the complete chain and all original delivery files. Make scoped local child commits, bind valid prior evidence, collect fresh evidence for the affected paths, and return one five-file correction-review delivery.

No acceptance closure, owner migration/provisioning, repair, seeding, synchronization, activation/restart, push/publication, Task 6.7a/6.8/6.9 or Stage 7 is authorized. TASKS remains exact. PDF copying remains an **accepted limitation, not fixed**; search remains **uncertified**. Do not reopen either diagnosis.

Clearance requires independent review of the corrected delivery. This report and the prepared correction handoff are review artifacts, not a claim that either correction has already been implemented.
