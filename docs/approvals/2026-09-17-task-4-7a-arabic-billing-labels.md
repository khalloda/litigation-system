# Task 4.7a — firm-approved Arabic billing labels

**Approved by Khaled Helmy on 17 September 2026.**

After receiving the complete proposed 11-label table and the specific request to confirm `Later → مؤجلة`, Khaled replied: **“Approve all 11”**.

This records the firm approval required by D28 for the following exact mapping. The earlier proposal remains historical evidence; its pending-approval wording is superseded by this approval record.

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

The approval explicitly applies to the billing codes. Although three Arabic role labels match previously approved matter-screen wording, their billing use is authorized by this new approval, not inferred from that earlier decision.

Preserve the source codes exactly, including case, spaces and the plus sign in `LawyerA+`. The approval changes neither invoice/payment facts nor allocation percentages, relationships, historical provenance, currencies, missing values, or archive states. A NULL invoice type remains unknown; it is not a twelfth lookup value and must not be replaced with a guessed type.

Task 4.7a is an approval/documentation task. Its firm-approval requirement is now fulfilled. Repository documentation, the task marker, commit and publication still require the bounded Codex execution and its receipt; this record does not claim those actions have happened. No migration, lookup-data update, app build/restart, browser operation or Task 4.8 implementation is part of this approval record.

The approved labels are authoritative for later Task 4.8 implementation. Historical invoices, payments and allocations remain read-only under the existing project decisions. This approval does not create invoice/payment entry, new financial calculations, lifecycle editing or report policy.

Source basis: published `1fd435acd7d2291a6181b4aee7e1cdb414577b22` TASKS entry 4.7a; unchanged D28 and glossary at accepted implementation `3f0c6c6fc7d41296c8b55f7454cc9c82ec6fcdfb`; the exact 11 SQL-seeded codes; the proposal shown immediately before Khaled's quoted approval.
