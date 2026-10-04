# Task 6.9 — exact resolution decision sheet

Prepared 4 October 2026, above reviewed local `e3e81b2`. **Proposal ready; owner decisions pending; no repairs or selections applied; Task 6.9 not accepted.** This document requests decisions for a future separately reviewed implementation. It does not authorize execution. The original sealed Task 6.9 delivery remains unchanged.

The exact machine inventory is `resolution-proposal.json` in the addendum review ZIP. It contains immutable source/quarantine keys and payload hashes, existing target IDs and versions, all proposed values, dependencies, output locations, preconditions and rollback. `financial-field-addendum.json` supplies the complete 35-cell comparison and the narrow party witnesses. Neither file contains a complete database snapshot.

## Decisions remaining

**1. P1 — approve the listed existing-capacity interpretations? Recommended:** use the explicitly listed canonical capacities, preserve whole name blocks and ordered composite roles, and leave all raw source/quarantine text unchanged. For example, matter 425's two authorities remain one source name block with canonical role 2; matter 1156 uses role 8 (grievance respondent), not an appeal or defendant role. This changes the printed grammatical/plural wording to the existing singular canonical labels; it does not claim literal source typography. Alternative: keep any disputed field quarantined until its capacity is confirmed. That avoids an incorrect attribution but leaves the missing label in every report using that side. No owner-data change occurs until separate authorization. Review effort approximately 15–25 minutes for the listed ordinary cases; implementation is included in the bounded tooling estimate below.

**2. P2 — approve new capacities for source 1695 and source 1724? Recommended:** retain the exact source concepts `ملتمس ضده`, `ملتمس`, and `خصم متدخل إنضمامي`, only after the owner confirms their labels and gender forms. Do not collapse them into appellant/respondent/cassation capacities. No equivalent exists in the current 19-row role lookup. Alternative: hold these fields; no data loss, but incomplete report parties remain. These are three editable lookup proposals, not approved Arabic terminology or assigned future IDs. Owner review approximately 5–10 minutes; no license cost.

**3. P3 — confirm source 1724's allocation of capacities to names. Recommended:** on the opponent side, use two ordered blocks: شركة المنصور للتوزيع as role 1; جهاز حماية المنافسة plus رئيس مجلس الوزراء as one multiline block with role 2. Confirm whether the client-side `خصم متدخل إنضمامي` belongs to the entire الشرقية إيسترن كومباني / جهاز حماية المنافسة block or only the second entity. The machine candidate shows the whole block conditionally; it is held, not inferred. Alternative: provide an explicit split and role allocation. Wrong attribution would misstate who intervened in the case. Approximately 5–10 minutes of owner/source review; technical effort small once the meaning is known.

**4. P4 — resolve source 1769's malformed opponent text. Recommended:** hold this one field until the owner confirms whether فيري كابي has both `مستأنف ضده` and `مستأنف`, in that order. The conditional two-role candidate is not an approved repair. Alternative: owner supplies the corrected intended name/capacity breakdown. Silently removing the unmatched quote would conceal the uncertainty and could assign the wrong litigation capacity. Approximately 5 minutes if the underlying case is known; otherwise bounded source review is required.

**5. D1 — approve three distinct destinations? Recommended:** create exact source destination labels خبراء جنوب الجيزة / خبراء شمال الجيزة / مجلس الدولة بالرحاب after confirming they denote the intended offices. They exist as court labels but not as destination labels. The existing generic geographic destinations are not proved equivalents. Alternative: explicitly approve an existing destination ID for each source label. Reusing a generic destination merges office groups in work reports; keeping distinct labels avoids an unsupported merge but adds three choices to the editable destination list. No alias mechanism currently suffices. Approximately 5–10 minutes of owner review; no new service cost.

**6. R1 — approve the bounded release scope for future implementation? Recommended:** exactly 20 party fields, five tasks and nine sampled steps, subject to P1–P4/D1; preserve the remaining quarantines and all existing records. Historical reasons and raw data remain immutable, with a new append-only release journal and permanent checks. Alternative: keep some or all records held. A wider import is a separate scope decision and is not recommended as a shortcut. The 79 other steps under these five tasks remain absent from canonical history; reports of complete work history would therefore still be incomplete. Do not represent nine released sample steps as a complete history restoration.

**7. S1 — approve three lawyer-scope choices? Recommended:** the three exact pairs below, solely for the shared lawyer-report purpose. They are all currently selectable and produce three rows for lawyer 4's January 2026 current-position report. They also affect other lawyer report variants when their filters qualify. Alternative: leave Selected empty and deliberately use All qualifying when appropriate; the latter is not a Selected reconciliation pass. Never copy the ten client choices. Future guarded operation/verification effort is included below.

**8. S2 — approve the administrative choice union? Recommended:** 30 exact hearings and 55 exact steps, including nine steps that cannot be selected until the proposed release passes. All 30 hearings and 46 existing steps are selectable now. The eight client source occurrences are a subset of the 56 supplement occurrences, so choices are deduplicated rather than seeded twice. Alternative: approve only a listed subset or retain empty choices. With all choices and repairs, current work counts are four client rows and 29 all-destination rows, not 8 and 56. Selecting only currently available records produces one and 24 respectively. At the recorded Cairo date, the same hearing scope also qualifies seven rows in open-decisions-all-destinations. Other dated/destination variants depend on requested parameters and must be measured in the future rehearsal; destination work reports use latest steps and can include other works on selected matters. No client/closed/lawyer scopes are borrowed.

## Exact party-field whitelist

Twenty distinct fields on 17 matters: the original 21 displayed occurrences deduplicate to 17 fields on 14 matters; three additional financial fields are disjoint. All affected canonical sides are empty, including retired rows. All 17 matter records are currently unarchived. Nineteen reasons are `unreviewed_party_role`; source 1769 is `malformed_party_quotes`. Every original quarantine remains unresolved. Each proposal affects all report adapters reading that canonical side, not only the sampled occurrence.

Exact raw text below uses JSON escapes to preserve CR/LF, quote and blank-line distinctions. Conditional rendered values and stable output locations are in the machine inventory. Name whitespace is normalized for proposed canonical display only; historical bytes stay unchanged.


### party:30:client

Source matter **30** → current **1724**, version 1; clientParty; quarantine 254; cohort `original-matched-source`. Decisions: P1.

```json

"أميرة عبد الحليم كامل\n\"مدعية بالحق المدني -مستأنف ضدها\""

```

Conditional canonical block: "أميرة عبد الحليم كامل"; capacities 11: مدعية بالحق المدني, 4: مستأنف ضدها.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:30:opponent

Source matter **30** → current **1724**, version 1; opponentParty; quarantine 255; cohort `original-matched-source`. Decisions: P1.

```json

"عمرو إبراهيم حسن السمرة\n\"متهم -مستأنف\""

```

Conditional canonical block: "عمرو إبراهيم حسن السمرة"; capacities 9: متهم, 3: مستأنف.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:61:client

Source matter **61** → current **1755**, version 1; clientParty; quarantine 472; cohort `original-matched-source`. Decisions: P1.

```json

"الأمير أحمد مصطفى، وآخرون\n\"متهمون -مستأنفون\""

```

Conditional canonical block: "الأمير أحمد مصطفى، وآخرون"; capacities 9: متهم, 3: مستأنف.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:81:opponent

Source matter **81** → current **1775**, version 1; opponentParty; quarantine 811; cohort `original-matched-source`. Decisions: P1.

```json

"الهيئة العامة للرقابة المالية، أورانج بارتسيبشنز \n\"مدعى عليهم\""

```

Conditional canonical block: "الهيئة العامة للرقابة المالية، أورانج بارتسيبشنز"; capacities 2: مدعى عليه.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:425:opponent

Source matter **425** → current **5073**, version 1; opponentParty; quarantine 1865; cohort `extra-current-financial`. Decisions: P1.

```json

"الهيئة العامة للاستثمار والمناطق الحرة، الهيئة العامة للرقابة المالية\r\n\r\n\"مدعى عليهما\""

```

Conditional canonical block: "الهيئة العامة للاستثمار والمناطق الحرة، الهيئة العامة للرقابة المالية"; capacities 2: مدعى عليه.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:527:opponent

Source matter **527** → current **2209**, version 1; opponentParty; quarantine 637; cohort `original-matched-source`. Decisions: P1.

```json

"شركة المتحدون للتجارة وآخرين\n\"مدعى عليهم\""

```

Conditional canonical block: "شركة المتحدون للتجارة وآخرين"; capacities 2: مدعى عليه.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:1079:client

Source matter **1079** → current **5080**, version 1; clientParty; quarantine 1884; cohort `extra-current-financial`. Decisions: P1.

```json

"سيجما وسيجما تك للصناعات الدوائية\r\n\r\n\"مدعى عليهما\""

```

Conditional canonical block: "سيجما وسيجما تك للصناعات الدوائية"; capacities 2: مدعى عليه.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:1083:opponent

Source matter **1083** → current **2756**, version 1; opponentParty; quarantine 446; cohort `original-matched-source`. Decisions: P1.

```json

"شركة عبد السلام دياب وآخرين\n\"مستأنف ضدهم\""

```

Conditional canonical block: "شركة عبد السلام دياب وآخرين"; capacities 4: مستأنف ضده.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:1156:opponent

Source matter **1156** → current **5082**, version 1; opponentParty; quarantine 1881; cohort `extra-current-financial`. Decisions: P1.

```json

"الهيئة العامة للاستثمار، والهيئة العامة للرقابة المالية\r\n\r\n\"متظلم ضدهما\""

```

Conditional canonical block: "الهيئة العامة للاستثمار، والهيئة العامة للرقابة المالية"; capacities 8: متظلم ضده.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:1677:opponent

Source matter **1677** → current **3274**, version 1; opponentParty; quarantine 53; cohort `original-matched-source`. Decisions: P1.

```json

"رئيس مجلس الوزراء و أخرين \r\n\"مدعي عليهم\""

```

Conditional canonical block: "رئيس مجلس الوزراء و أخرين"; capacities 2: مدعى عليه.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:1695:client

Source matter **1695** → current **3290**, version 1; clientParty; quarantine 900; cohort `original-matched-source`. Decisions: P2.

```json

"عبد الخالق عمر سليم العرنوس \r\n\"ملتمس ضده\""

```

Conditional canonical block: "عبد الخالق عمر سليم العرنوس"; capacities NEW:ملتمس ضده.

Exact source capacity requires a new approved editable role; no mapping to appeal/cassation roles. Owner must confirm labels and gender forms; no legal terminology invented.

### party:1695:opponent

Source matter **1695** → current **3290**, version 1; opponentParty; quarantine 901; cohort `original-matched-source`. Decisions: P2.

```json

"الممثل القانوني لشركة حسن علام - عبد الحفيظ العرنوس واخرين \r\n\"ملتمس\""

```

Conditional canonical block: "الممثل القانوني لشركة حسن علام - عبد الحفيظ العرنوس واخرين"; capacities NEW:ملتمس.

Exact source capacity requires a new approved editable role; no mapping to appeal/cassation roles. Owner must confirm labels and gender forms; no legal terminology invented.

### party:1702:client

Source matter **1702** → current **3296**, version 1; clientParty; quarantine 320; cohort `original-matched-source`. Decisions: P1.

```json

"هاني سري الدين وأخرين\r\n\"مدعي عليه\""

```

Conditional canonical block: "هاني سري الدين وأخرين"; capacities 2: مدعى عليه.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:1710:opponent

Source matter **1710** → current **3304**, version 1; opponentParty; quarantine 14; cohort `original-matched-source`. Decisions: P1.

```json

"وزير المالية بصفته\r\n\"مدعي عليه\""

```

Conditional canonical block: "وزير المالية بصفته"; capacities 2: مدعى عليه.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:1724:client

Source matter **1724** → current **3317**, version 1; clientParty; quarantine 71; cohort `original-matched-source`. Decisions: P2, P3.

```json

"الشرقية إيسترن كومباني \r\nجهاز حماية المنافسة \r\n\"خصم متدخل إنضمامي\""

```

Conditional canonical block: "الشرقية إيسترن كومباني\nجهاز حماية المنافسة"; capacities NEW:خصم متدخل إنضمامي.

HOLD attribution pending owner confirmation: capacity may apply to the whole two-name block or only its last entity. Conditional proposal preserves one multiline name block; do not silently allocate the role.

### party:1724:opponent

Source matter **1724** → current **3317**, version 1; opponentParty; quarantine 72; cohort `original-matched-source`. Decisions: P3.

```json

"شركة المنصور للتوزيع\r\n\"مدعي\"\r\nجهاز حماية المنافسة \r\nرئيس مجلس الوزراء \r\n\"المدعى عليهما\""

```

Conditional canonical block: "شركة المنصور للتوزيع"; capacities 1: مدعي.

Conditional canonical block: "جهاز حماية المنافسة\nرئيس مجلس الوزراء"; capacities 2: مدعى عليه.

Owner must confirm two ordered blocks and attribution of the final dual capacity to the two-name second block.

### party:1762:client

Source matter **1762** → current **3349**, version 1; clientParty; quarantine 902; cohort `original-matched-source`. Decisions: P1.

```json

"صديق محمد عفيفي\r\n\"مدعي عليه\""

```

Conditional canonical block: "صديق محمد عفيفي"; capacities 2: مدعى عليه.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:1767:client

Source matter **1767** → current **3354**, version 1; clientParty; quarantine 309; cohort `original-matched-source`. Decisions: P1.

```json

"صديق محمد عفيفي\r\n\"مدعي عليه\""

```

Conditional canonical block: "صديق محمد عفيفي"; capacities 2: مدعى عليه.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:1768:client

Source matter **1768** → current **3355**, version 1; clientParty; quarantine 496; cohort `original-matched-source`. Decisions: P1.

```json

"صديق محمد عفيفي\r\n\"مدعي عليه\""

```

Conditional canonical block: "صديق محمد عفيفي"; capacities 2: مدعى عليه.

Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.

### party:1769:opponent

Source matter **1769** → current **3356**, version 1; opponentParty; quarantine 876; cohort `original-matched-source`. Decisions: P4.

```json

"فيري كابي \rمستأنف ضده\"\r\nمستأنف"

```

Conditional canonical block: "فيري كابي"; capacities 4: مستأنف ضده, 3: مستأنف.

HOLD. Malformed quote and trailing مستأنف: owner must confirm whether both capacities belong to this party. Candidate dual roles are conditional, not an inferred repair.

## Destination evidence and exact administrative releases

The root cause is **unmapped_destination** for each task, not a missing matter. Only its steps have **parent_task_quarantined**. The existing source and target matter relationships are proved. The court lookup has IDs31,24,25 for the three exact names respectively; those are court IDs, never proposed destination IDs. Existing alternatives follow; similar names alone do not establish equivalence.


- **خبراء جنوب الجيزة**: zero exact destination matches. Existing geographical candidates: 1 = جنوب الجيزة; 4 = مجلس الدولة بالجيزة; 5 = شمال الجيزة. Recommended target is the new exact source label, conditional on D1; ID allocated and journaled only during future approved execution.

- **خبراء شمال الجيزة**: zero exact destination matches. Existing geographical candidates: 1 = جنوب الجيزة; 4 = مجلس الدولة بالجيزة; 5 = شمال الجيزة. Recommended target is the new exact source label, conditional on D1; ID allocated and journaled only during future approved execution.

- **مجلس الدولة بالرحاب**: zero exact destination matches. Existing geographical candidates: 4 = مجلس الدولة بالجيزة. Recommended target is the new exact source label, conditional on D1; ID allocated and journaled only during future approved execution.



| Source task | Current matter / version | Proposed court | Destination | Sample source steps |

|---|---|---|---|---|

| 11270 | 3286 / 2 | 31 | خبراء جنوب الجيزة | 4366, 4397 |

| 11271 | 3287 / 2 | 31 | خبراء جنوب الجيزة | 4367, 4398 |

| 11323 | 3311 / 2 | 24 | خبراء شمال الجيزة | 4357, 4395 |

| 11398 | 3316 / 1 | 108 | خبراء شمال الجيزة | 4358, 4396 |

| 11439 | 3289 / 1 | 25 | مجلس الدولة بالرحاب | 4354 |


All five tasks and nine steps have no current ID; `FUTURE_TASK`, `FUTURE_STEP`, `FUTURE_DESTINATION` and `NEW:` values are symbolic references, not guessed sequence values. Full source work text, dates, results, status, alert/report raw text, lineage, parents and proposed typed values appear in the inventory. Step source order uses the original per-task ordering over all historical step IDs; it does not compress gaps to pretend the omitted79 steps never existed. `current_order` remains null. `alert`/`report` retain the existing text type, including `"false"` and `"true"`.


The three destination labels also occur on **120 other quarantined tasks**. All are enumerated by stable source key in the inventory and excluded. Adding lookup rows naively changes the historical reconciliation's computed expectations; restoring the five parents also changes expectations for the 79 omitted steps. Future tooling must preserve the original historical lookup/reason basis and apply a constrained release overlay for only this whitelist. Re-running global transforms, broad mismatch suppression, or overwriting quarantine resolution fields is forbidden.


## Exact selection whitelist

Current before-state: client 10 preserved; closed 0, lawyer 0, administrative-hearing 0, administrative-step 0. Every proposed insertion expects no existing selection and version 0. Fresh record/parent versions, identity, archive and role gates are required at execution; current evidence is a snapshot, not perpetual permission. Each Save uses a new submission UUID and genuine authorized actor. Existing gateways enforce those checks and keep separate scopes.

| Lawyer choice | Source matter/hearing | Current matter/hearing | Client | Versions matter/hearing |
|---|---|---|---|---|


| lawyer-choice:3274 | 1677 / 15531 | 3274 / 3289 | 293 | 1 / 1 |

| lawyer-choice:3185 | 1570 / 15536 | 3185 / 10304 | 245 | 1 / 1 |

| lawyer-choice:3326 | 1733 / 15553 | 3326 / 7970 | 245 | 1 / 1 |



| Administrative hearing: source→current | Matter / version | Hearing version |

|---|---|---|

| 10306 → 11420 | 1948 / 1 | 1 |

| 11276 → 9965 | 1910 / 1 | 1 |

| 14079 → 5982 | 3174 / 1 | 1 |

| 14088 → 5250 | 3151 / 2 | 1 |

| 14449 → 1682 | 3171 / 1 | 1 |

| 14690 → 541 | 3253 / 1 | 1 |

| 14706 → 8490 | 3256 / 1 | 1 |

| 14779 → 2682 | 3272 / 1 | 1 |

| 14833 → 6500 | 3277 / 1 | 1 |

| 14834 → 12606 | 3278 / 1 | 1 |

| 15316 → 9827 | 3340 / 1 | 1 |

| 15327 → 824 | 3246 / 1 | 1 |

| 15441 → 6360 | 3353 / 1 | 1 |

| 15567 → 5094 | 3289 / 1 | 1 |

| 15569 → 5163 | 3136 / 1 | 1 |

| 15590 → 668 | 1931 / 1 | 1 |

| 15633 → 12674 | 3368 / 1 | 1 |

| 15640 → 7061 | 3173 / 1 | 1 |

| 15672 → 12279 | 3316 / 1 | 1 |

| 15680 → 2543 | 3331 / 1 | 1 |

| 15694 → 12274 | 3367 / 1 | 1 |

| 15704 → 8391 | 3369 / 1 | 1 |

| 15705 → 7463 | 3329 / 1 | 1 |

| 15708 → 3507 | 3317 / 1 | 1 |

| 15730 → 4640 | 3363 / 1 | 1 |

| 15735 → 7865 | 3317 / 1 | 1 |

| 15751 → 12488 | 3373 / 1 | 1 |

| 15759 → 1707 | 3311 / 2 | 1 |

| 15771 → 401 | 3286 / 2 | 1 |

| 15772 → 2769 | 3287 / 2 | 1 |



| Administrative step: source→current | Source task→current | Parent version | Status |

|---|---|---|---|

| 4319 → 110 | 11431 → 3136 | 1 | selectable |

| 4320 → 3167 | 11431 → 3136 | 1 | selectable |

| 4337 → 2034 | 7152 → 1032 | 1 | selectable |

| 4338 → 1543 | 11158 → 1290 | 1 | selectable |

| 4339 → 74 | 11150 → 768 | 1 | selectable |

| 4340 → 2964 | 11193 → 2381 | 1 | selectable |

| 4341 → 3269 | 11194 → 3103 | 1 | selectable |

| 4342 → 1449 | 11182 → 1983 | 1 | selectable |

| 4343 → 1759 | 11345 → 3585 | 1 | selectable |

| 4344 → 2809 | 11369 → 563 | 1 | selectable |

| 4345 → 1472 | 10899 → 3464 | 1 | selectable |

| 4346 → 3112 | 9900 → 795 | 1 | selectable |

| 4347 → 898 | 8115 → 2543 | 1 | selectable |

| 4350 → 3468 | 11459 → 388 | 1 | selectable |

| 4351 → 1430 | 11354 → 2533 | 1 | selectable |

| 4354 → future returned ID | 11439 → future returned ID | future returned version | blocked on exact step release |

| 4357 → future returned ID | 11323 → future returned ID | future returned version | blocked on exact step release |

| 4358 → future returned ID | 11398 → future returned ID | future returned version | blocked on exact step release |

| 4362 → 1721 | 11415 → 1832 | 1 | selectable |

| 4363 → 453 | 11032 → 3118 | 1 | selectable |

| 4364 → 2866 | 11457 → 2321 | 1 | selectable |

| 4365 → 973 | 11431 → 3136 | 1 | selectable |

| 4366 → future returned ID | 11270 → future returned ID | future returned version | blocked on exact step release |

| 4367 → future returned ID | 11271 → future returned ID | future returned version | blocked on exact step release |

| 4369 → 3173 | 11463 → 3556 | 1 | selectable |

| 4371 → 516 | 11461 → 1514 | 1 | selectable |

| 4374 → 409 | 11415 → 1832 | 1 | selectable |

| 4375 → 61 | 11032 → 3118 | 1 | selectable |

| 4376 → 1483 | 11471 → 1366 | 1 | selectable |

| 4377 → 3466 | 11457 → 2321 | 1 | selectable |

| 4378 → 455 | 11470 → 808 | 1 | selectable |

| 4379 → 1185 | 7152 → 1032 | 1 | selectable |

| 4380 → 288 | 11158 → 1290 | 1 | selectable |

| 4381 → 304 | 11150 → 768 | 1 | selectable |

| 4382 → 2430 | 11193 → 2381 | 1 | selectable |

| 4383 → 2538 | 11194 → 3103 | 1 | selectable |

| 4384 → 2692 | 11182 → 1983 | 1 | selectable |

| 4385 → 3066 | 11345 → 3585 | 1 | selectable |

| 4386 → 2416 | 11369 → 563 | 1 | selectable |

| 4387 → 167 | 10899 → 3464 | 1 | selectable |

| 4388 → 629 | 9900 → 795 | 1 | selectable |

| 4389 → 3142 | 8115 → 2543 | 1 | selectable |

| 4390 → 889 | 11458 → 1283 | 1 | selectable |

| 4391 → 1411 | 11441 → 2958 | 1 | selectable |

| 4392 → 1970 | 11459 → 388 | 1 | selectable |

| 4393 → 2591 | 11476 → 1491 | 1 | selectable |

| 4394 → 296 | 11354 → 2533 | 1 | selectable |

| 4395 → future returned ID | 11323 → future returned ID | future returned version | blocked on exact step release |

| 4396 → future returned ID | 11398 → future returned ID | future returned version | blocked on exact step release |

| 4397 → future returned ID | 11270 → future returned ID | future returned version | blocked on exact step release |

| 4398 → future returned ID | 11271 → future returned ID | future returned version | blocked on exact step release |

| 4399 → 730 | 11463 → 3556 | 1 | selectable |

| 4400 → 2122 | 11461 → 1514 | 1 | selectable |

| 4401 → 252 | 11458 → 1283 | 1 | selectable |

| 4402 → 3207 | 11476 → 1491 | 1 | selectable |


The guarded mechanisms are `public.lawyer_report_selection_save`, `public.administrative_hearing_report_selection_save`, and `public.administrative_step_report_selection_save`, through their existing application gateways. Lawyer and hearing choices require Administrator/Litigation Assistant editing authority; administrative steps use the existing work-editing permissions (including Paralegal where allowed). No direct table seeding is proposed. Matter/task ancestor archives and versions remain enforced.

## Implementation, preservation and rollback gates

1. Obtain the numbered business decisions; freeze the exact inventory and all symbolic-reference resolutions. Revalidate source hashes, quarantine hashes, unique stable mappings, empty affected sides/choices, all parent versions and archive states. If legitimate changes have occurred, stop that affected item and revise its proposal; never overwrite it.
2. Implement and independently review a bounded source-release mechanism. The Task62 runner is pinned to its own plan; reusing its receipt kind or changing its plan hash is not an authorized shortcut. Native `admin_edit_save` does not create historical provenance. The future release journal needs exact source key, raw before/after values, new target IDs, actor, transaction, plan digest, operation kind and idempotency constraints; permanently prove mappings in `db:check`. A candidate migration may be necessary later, but no SQL or migration is generated in this addendum and migration 78 remains unchanged.
3. Isolated full-state rehearsal must prove exactly the approved cells/records and choices change; retries do not duplicate records; stale versions, unrelated IDs, invalid parents, ambiguous mappings and unauthorized roles are rejected. Reconcile exact audit events and genuine authentication separately. Verify all current report cells and counts, including the shared-scope effects above. Retain the older raw sources/quarantines, the 79 sibling steps and other destination tasks, all unapproved roles, all other tables, hearing 11003 archive/version 2, and every existing choice.
4. Before commit, a failed transaction rolls back atomically. After a committed operation, use only separately reviewed compensating retire/archive/deselect operations against journaled IDs with version/dependency guards; preserve audits, historical rows and receipts. New lookup labels can be deactivated only when dependency checks permit. Do not delete or rewind sequences or automatically restore the owner's whole database. A destructive recovery requires a separate incident decision.
5. Future owner operations require their own approved readiness/rehearsal and actual-operation mandate. No repair, selection, migration, login, owner report/export, activation, acceptance or push occurs now.

Estimated future effort: 2–4 development/rehearsal days for the narrow provenance/repair work after decisions, plus 0.5–1 day for choices and report verification, assuming no additional source ambiguity. Owner/source interpretation approximately 30–60 minutes; unresolved legal meanings can extend elapsed time. No new purchases or services. The wider historical invariant impacts must be designed and tested, not bypassed to meet an estimate.

## Evidence and accepted limits

The original 117 occurrences and21 missing-cell observations are unchanged. The five additional finance rows now have35 individually classified cells:16 exact text/identifier cells,5 exact typed nulls,5 line-spacing differences,5 approved date-prefix/spacing differences,1 reviewed court-label mapping,3 proved missing party fields. The court expansion for source 1139 is the firm's recorded crosswalk from الهيئة العامة للاستثمار to الهيئة العامة للاستثمار والمناطق الحرة (current court 18); its raw value is preserved. It is not a newly invented alias.

The finance report retains latest overall: source matter 1511 has two Access hearing occurrences, while current keeps15749 and excludes15568; five further matters qualify after removal of legacy manual flags. This adapter has no Selected mode. No legacy multi-hearing mode or report-rule change is proposed. Explaining variance does not establish literal equality or waive acceptance.

N1 remains accepted/unresolved/not fixed; PDF copying remains accepted/not fixed; search remains uncertified; legacy `Detail_Format` remains unreadable. No renewed diagnosis. Full private lineage/snapshots stay local: their sealed hashes and narrow witnesses support scoped review, not independent access to every private row. Prior browser/export/full-volume evidence is reused only under its unchanged-source bindings; no new build or browser campaign ran.

The owner app was restarted in a separately authorized intervening turn. At addendum baseline it is the same accepted artifact/build on 127.0.0.1:3000, PID 21736; the old receipt's absent-app observation remains a historical observation. This addendum preserves the running process. The database remains migration 78 with 1216 audit events and hearing 11003 archived/version 2; dated final preservation evidence is supplied with the delivery.
