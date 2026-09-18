# Task 4.7a — Arabic billing-label approval and documentation closure

Approval date: 17 September 2026. Repository execution: 18 September 2026.

## Owner approval and exact coverage

Khaled Helmy approved all 11 labels (“Approve all 11”), explicitly including
`Later` → `مؤجلة`, and authorized one documentation commit and its publication
in this same task, without subagents. The
[exact approval](../approvals/2026-09-17-task-4-7a-arabic-billing-labels.md)
is imported byte-identically. Its historical statement that repository execution
is pending is preserved as original evidence, not a claim that this closure is pending.

| Group | Exact source code | Approved Arabic display | Meaning and boundary |
|---|---|---|---|
| Invoice status | `Paid` | مسددة | Invoice recorded as paid. |
| Invoice status | `Unpaid` | غير مسددة | Invoice recorded as unpaid. |
| Invoice status | `Partially Paid` | مسددة جزئيًا | Invoice recorded as partly paid. |
| Invoice status | `Later` | مؤجلة | The firm approves this Arabic display for the existing Later status; no new due-date, collection or automatic status rule is created. |
| Invoice status | `Canceled` | ملغاة | Canceled invoice; distinct from archived or deleted. |
| Invoice type | `Service` | خدمات | Service invoice; no narrower fee category is introduced. |
| Invoice type | `Expenses` | مصروفات | Expense invoice. |
| Lawyer-share role | `Reviewer` | الشريك المراجع | Reviewing partner; no equivalent matter-assignment role. |
| Lawyer-share role | `LawyerA` | المحامي الرئيسي | Lead lawyer. |
| Lawyer-share role | `LawyerB` | محامٍ مساعد | Supporting lawyer. |
| Lawyer-share role | `LawyerA+` | محامٍ رئيسي مشارك | A distinct second/co-lead lawyer sharing the lead allocation; no fixed percentage is implied. |

D67 fulfills D28 without editing D28 or any of D1–D66. Five statuses, two types
and four lawyer-share roles total 11; the two historical NULL types are not a
twelfth code. Preserve exact source codes, amounts, currencies, fractions,
invoice/payment facts, provenance and relationships. `Later` does not create
a due-date, collection or automatic transition rule. `Canceled` is not archive
or deletion; `Reviewer` is the reviewing partner. `LawyerA+` is a distinct
co-lead with actual recorded allocation, not a fixed 37.5% rule. `Service`
does not create a narrower fee category.

## Scope and closure

Only Task 4.7a is newly checked. The other 85 checkbox lines remain byte-exact,
including checked 4.6/4.7 and unchecked 4.8. Seven documentation paths change:
GLOSSARY, DECISIONS, TASKS, README, PRD, the exact approval and this report.
Task 4.8 is next and unstarted. Approved lookup/application display implementation
belongs to that future task; no migration number is reserved.

No application, strings, schema, migration, dependency, test or governance
change is included. No database connection, migration, backup, restore, Docker,
process, browser, runtime, credential, account, session or permission operation
was performed. The accepted app and database are outside this task's operations;
there is no fresh runtime-health or database-preservation test claim.

## Source and checkpoint

Verified clean local main and freshly fetched remote main:
`1fd435acd7d2291a6181b4aee7e1cdb414577b22`, tree
`1ae379e9f4ad4d8a6efc0ff5be5f3af8f69a3e28`, sole parent
`3f0c6c6fc7d41296c8b55f7454cc9c82ec6fcdfb`; 768 tracked paths
and 86 task-checkbox lines. The ten supplied reference documents matched their
Git object and SHA-256 bindings before editing.

The owner-supplied handoff ZIP (29 members) was independently verified against
its separate unchanged manifest, including outer size/hash, exact safe regular
membership, CRC, both sizes and every SHA-256. The inspected supplied verifier
also passed. Supplied context v1.89 matched its standalone copy.

- Handoff ZIP SHA-256: `96518d04b906f9c0c971d7fe1cf418ab446b9d48011311f3f2818a7e76b460b4`.
- Handoff manifest SHA-256: `e8d09dda69d73a3fcd18b6ca241c6f7f93cf037ea06b9c1681d6d5ded66e3e45`.
- Imported approval SHA-256: `eaaff1982d7094456d4448cb3d0c5c111b6af501b14483f2703d6cbb9d92a3f8`.
- Approved-label JSON SHA-256: `2a3a5380f55eed6579382b2aac825e426b3da3ee447f2c02736ec261ccf436ca`.
- Context v1.89 SHA-256: `576aadf434f1eac6563167d2975a61b67ee006b474df83640cdac53a65ad9aff`.
- Prior final operational closure review SHA-256: `02d2aca73b3a2c19d385f2d04e340110165137a3228da5f4d1dc590ec76fd79e`.

The prior Tasks 4.6–4.7 closure is historical, source-bound evidence only.
No old application, database, permission or browser result is represented as a
fresh run or counted as a new test here.

## Verification and publication boundary

The external review envelope records fresh document/Git checks: exact seven-path
scope and 770 final tracked paths; all 11 code/label/meaning rows; byte-identical
approval; preserved decision prefix; one checkbox change; unchanged other Git
identities; whitespace, existing encoding and ignore-policy checks; Markdown
parsing, tables, added links and Arabic text; and exact raw-byte forward/reverse
patch reconstruction with commit/tree verification.

Repository Markdown exclusions are respected: the excluded documents are not
claimed as successfully autoformatted. No formatting configuration is changed.
Raw private D59 source bodies are omitted; unchanged object identities suffice.

This report precedes commit and push. Actual validation outcomes, new commit/tree
identities, timestamped publication commands and remote/local equality belong
to the separate external verification result and publication receipt, not to an
extra commit amending this historical report. Stop for independent documentation
and publication review; do not start Task 4.8.
