# Task 4.1 — Clients readiness review and owner resolutions

Date: 8 September 2026. This preserves the focused read-only review delivered
before the owner's subsequent decision-recording instruction. It is dated
evidence, not the current decision or work-order authority. Approved decisions
are in [DECISIONS.md](../DECISIONS.md#d52--client-and-contact-archive-lifecycle);
[TASKS.md](../../TASKS.md) owns the four unchecked phases and return point.

## Original readiness review — before owner resolution

**VERDICT: fix these first before enabling client/contact writes.** Existing
data was ready; a focused migration and an agreed archive workflow were needed.
No implementation was authorized or performed in that review.

### Verified checkpoint and limitations

- Clean local `main` and cached `origin/main` both identified
  `65797993f29c97d757049f28c2da92f237512aa9`.
- Task 4.0a and its four phases were checked; Task 4.1 was unchecked and
  unstarted. The owner reported Task 4.0a complete and published.
- Migration 60 SHA-256 matched
  `7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`.
- Migration 61 SHA-256 matched
  `87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904`.
- The already running project service was healthy. PostgreSQL 17.11 had
  61 applied migrations, zero pending/unfinished and one approved historical
  rollback. No service was started or reconfigured.
- The established `/verify.sql` used by `db:verify` passed 15/15 through
  `docker compose exec -T -e 'PGOPTIONS=-c default_transaction_read_only=on'
  db psql -X -U litigation -d litigation -v ON_ERROR_STOP=1 -f /verify.sql`.
- `npm run db:check`, with `PGOPTIONS=-c default_transaction_read_only=on`,
  passed all 107 historical-profile invariants. Its existing logo checks
  verified 54 files/import records and 1,541,428 bytes.
- Aggregate inspection used explicit repeatable-read, read-only transactions;
  the inspected session reported `transaction_read_only=on`. All 318 client
  and 188 contact source rows had targets, with zero mapped-field mismatches.
- No files, business data or schema were changed. No browser/login flows,
  writing tests, disposable databases, Access access, logo changes, recovery
  work, ACL changes, commits or pushes occurred in the review.

**Remote freshness was not verified in the original review.** The initial
authorized `git fetch origin` failed because the sandbox could not write
`.git/FETCH_HEAD`. Automatic approval review then rejected escalation, stating
that network access and Git metadata writes exceeded the read-only boundary,
despite the owner's explicit fetch authorization. The rejection was not
bypassed. The recorded `origin/main` was therefore cached evidence, not a fresh
remote observation. A later successful documentation-task fetch, recorded below,
does not erase this original limitation.

Read-only Docker inspection initially met a sandbox pipe-permission denial;
the explicitly authorized inspection subsequently succeeded through approval.
Ordinary incorrect file/glob lookups were corrected within source-reading scope.
These failures were not reported as successful executions. Two read-only source
subreviews assisted with historical guards and authorization/services; neither
modified files or accessed the database.

### Aggregate facts relevant to the screens

| Observation | Verified result |
|---|---|
| Clients / contacts | 318 / 188, all imported |
| Client system IDs different from their Access IDs | All 318 |
| Exact-name duplicate clients | Two groups, four rows; normalized grouping had the same counts |
| Clients with no contacts | 207 |
| Contacts with no primary contact name | Six |
| Contacts without a client / selected main contacts | Zero / zero |
| Largest contact collection / largest matter collection for one client | Nine contacts / 378 matters |
| Clients without a logo | 264 |
| Business statuses | `Active` 134; `Disabled` 181; `Potential` three |
| Cash classification | `Cash` 281; `Probono` 30; `probono` five; empty string two; NULL zero |
| Responsible-lawyer source text | 123 populated rows, 11 exact strings |
| Cash/responsible-lawyer review questions | Two rows, zero answers and zero notes at inspection |

The counts prove source values and completeness, not how the empty strings
arose or which staff identities the responsible-lawyer text denotes.

### Proposed scope at review

Client list/detail/create/edit and Administrator archive/restore would expose
display name, retained English name, full name, business status, cash/pro bono
classification, POA/document locations, start/end dates and optional main
contact. Contact views/forms would use `contact_name` as primary, with separate
`full_name`, job title, email, mobile/business phone, fax, website and address
fields. `home_phone` would remain preserved but unsurfaced.

Proposed client routes were `/clients`, `/clients/new`, `/clients/[id]` and
`/clients/[id]/edit`, with contact routes nested under their client. Search
would cover normalized Arabic client/contact names and retained English client
names, disclose contact matches and return distinct deterministic 25-row pages
ordered by name and PostgreSQL ID. Business status and archive filters would
be separate. Preserve mixed/multiline data and validate supplied dates/contact
links on the server. Show distinct loading, empty/no-contact, missing-value,
not-found, forbidden, validation/stale and retryable-error states.

Names and numeric offsets must not become identity keys. Distinct same-name
clients must remain separate; `JTI` must remain valid. Staff-specific name/email
uniqueness must not be copied. Branches belong to matters; D39's special main
Sigma rename restriction remains binding. New contacts would require a name
without fabricating names or blocking unrelated edits to imported incomplete
records. Source: [client/contact model](../../prisma/schema.prisma),
[data-model semantics](../DATA-MODEL.md#clients).

Task 4.1 logo work was guarded display of the existing file and the client's
name for absent/unreadable/invalid images, without exposing paths or a broken
image. Task 4.1a retained upload, replacement, resizing, preview-before-upload
and recoverable removal. Matter editing, reports and audit-history UI retained
their existing tasks.

### Must fix before application writes

**1. Imported evidence and live operations are coupled incorrectly.**
[DB-052–DB-056](../../scripts/check-db.ts) compare all live client/contact
counts with staging, freeze the live empty-cash count and reject every selected
main contact. Native creation and deliberate edits would fail verification.
The [audit classification](../../prisma/migrations/20260903100000_close_task33b_review_gaps/migration.sql)
excludes legacy fields without installing corresponding client-specific
immutability guards. Existing runtime INSERT/UPDATE privileges do not by
themselves protect imported identities/raw values.

Recommended minimum: validated immutable original system/Access associations,
staging durable keys/fingerprints, exact source values, initial transformed
values and contact-parent evidence. Historical checks would verify the exact
imported population and original values; live checks would enforce retained
IDs/raw evidence and native provenance. Preserve original empty cash values
at their exact historical identities while allowing audited live edits.
Do not weaken equality into lower bounds, exempt edited imports or replace
frozen digests. [Gate 4 accounting](../../scripts/lib/gate4-database.ts) also
needs imported-only client/contact counts. The accepted high-impact workbook's
labels/manifest remain historical evidence, not something to regenerate to
bless later names. Existing events suffice for ordinary edits; no staff alias
machinery, global mutex or duplicate full-row ledger was justified.

The [old transform](../../sql/transform-clients-contacts.sql) attempts to delete
and rebuild both tables. It must explicitly fail closed after the operational
boundary and cannot serve as D43's differential cutover path. Estimated
foundation effort: 2–3 days including isolated proof.

**2. Main-contact ownership is not enforced.** Independent foreign keys prove
that client and contact rows exist, not that the selected contact belongs to
that client. The review proposed a same-client composite foreign key plus
archive eligibility enforcement at both relationship ends. Main contact would
remain optional. Explicit clear/replacement was recommended before archival;
no automatic replacement. The original review also considered the hazard of
contact reassignment; the owner subsequently excluded that workflow entirely
under D55. Competing selection/archive/ownership changes need negative proof.
Estimated effort: 1–2 days.

**3. Archive and reliable-save safeguards are absent.** Clients/contacts have
no archive fields or row versions. Keep archive separate from business status.
Reuse the [independent server authorization](../../src/lib/auth/authorization.ts)
and approved matrix: Administrator full, Assistant add/edit, Lawyer/Paralegal
view; no physical deletion. Add stale-edit rejection with retained input and
transactional submission identity so retries cannot create duplicates while
intentional same-name creations remain possible. No-op saves preserve state.
The [existing audit helper](../../src/lib/audit.ts) supplies atomic data/event
composition, not the complete authorization, archive or concurrency workflow.
New columns require exact current audit classification without changing frozen
historical classification digests. Estimated effort: 2–3 days, overlapping
main-contact/lifecycle work.

### Should fix and sound existing foundations

The migration documentation incorrectly called the other 316 cash values
never entered. The observed facts were 316 populated, two empty strings and
zero NULLs. Correct the description without inferring editing history or
changing data; estimated effort under 30 minutes.

Imported fields reconciled exactly, duplicate identities remained intact,
Arabic normalization/search indexes existed, authorization/audit foundations
were reusable and logo imports already had separate immutable evidence.

### Original proposed phases and acceptance

1. Database foundation: forward migration, import evidence, lifecycle/version/
   provenance guards and permanent checks. Independently prove historical
   upgrade and canonical replay in isolation; preserve original digests.
2. Read-only screens/logos: all-role guards, search/filter/paging, realistic
   empty states and safe fallback. Measure actual volumes and avoid per-row
   queries, including the largest client's 378 matters.
3. Mutations: direct role denials, imported/native distinction, main-contact
   integrity, stale/repeated submissions and archive/restore. Inject audit
   failure and prove complete rollback.
4. Final acceptance: static, permission, audit and affected reconciliation
   checks; separately authorized local browser RTL, keyboard/focus, validation,
   200% zoom and 320-pixel reflow. All mutation tests remain isolated.

Overall estimate: approximately 6–10 development/testing days, assuming bounded
scope and prompt business answers; component estimates overlap. Deployment
requires separate authorization. Access remains in use; D43/D51 cutover is
separate. This was an estimate and proposal, not implementation approval.

### Questions presented to the owner at the review checkpoint

1. **Archive behavior:** recommended non-cascading archive, explicit archived
   viewing for all four roles, retained related records, parent restoration
   before contact maintenance and no suppression of existing matters/reports.
   Alternative: additionally refuse archive while ongoing matters exist.
   That adds roughly half a day plus potential status cleanup, while reducing
   accidental archive risk. Main-contact/individual contact restoration
   details were not yet resolved in the original review.
2. **Cash/pro bono:** recommended one operational pro bono choice while
   preserving exact source spelling and blanks. Alternative: separate exact
   choices, retaining confusing equivalent spellings. Approximately half a
   day within the estimate. Asked for the meaning of `Cash` and the Arabic
   labels for it, pro bono and the three business statuses.
3. **Responsible lawyer:** recommended historical source-text display and
   deferred editable assignment. Alternative: a separate staff-ID relationship
   after eligibility/mapping review of 11 strings across 123 clients, adding
   approximately 1–3 days plus owner review. The text must never be confused
   with the client's own main contact.

## Subsequent owner resolutions — 8 September 2026

The owner then approved the recommended Task 4.1 contract with explicit
clarifications and authorized **documentation only**, one local commit and an
external single-commit full-index patch. The resolutions below replace the
open questions and narrow the original proposal where stated; they do not
rewrite the original review or its remote-freshness limitation.

| Resolution | Canonical decision | Effect on the original proposal |
|---|---|---|
| Non-cascading client archive/restore | [D52](../DECISIONS.md#d52--client-and-contact-archive-lifecycle) | All four viewing roles find labelled archived read-only details through an explicit filter; ordinary lists/new selections exclude them. Administrator-only archive/restore shows related-record counts. Existing matters/reports and all relationships remain. Preserve main-contact selection and individual contact archive states; parent restore does not restore separately archived contacts. Parent restoration is required before every contact create/edit/archive/restore. Business status stays separate. |
| Cash meaning and five Arabic labels | [D53](../DECISIONS.md#d53--client-classification-meanings-and-arabic-labels) | Cash means fee-paying regardless of payment method: بأتعاب. Probono/probono: بدون أتعاب; Active: نشط; Disabled: غير نشط; Potential: محتمل. One pro bono choice; preserve historical spelling and unchanged live values during unrelated/no-op edits. Blanks require deliberate change. Correct the documentation using only 316 populated, two empty, zero NULL; do not infer how empty strings arose. |
| Responsible lawyer | [D54](../DECISIONS.md#d54--responsible-lawyer-text-remains-historical-information) | Historical text only; editable staff assignment and source-to-staff mapping are deferred and distinct from main contact. |
| Main contact, ownership and incomplete imported names | [D55](../DECISIONS.md#d55--optional-main-contact-and-fixed-contact-ownership) | Optional same-client unarchived main contact; explicit clear/replacement before individual contact archive, never automatic. Contact reassignment and ordinary ownership edits are outside Task 4.1. Preserve imported ownership and the six unnamed contacts; new contacts require a name and unrelated legacy edits remain possible. |
| Identity and feature limits | [D56](../DECISIONS.md#d56--task-41-identity-and-feature-boundaries) | Duplicate names retain distinct identities, PostgreSQL IDs drive operations, Access IDs remain historical, branches stay on matters and D39's Sigma restriction stays binding. Existing-logo display/fallback only in 4.1; logo mutations remain 4.1a. |
| Engineering and stop point | [D57](../DECISIONS.md#d57--task-41-evidence-phases-and-acceptance-boundary) | Four unchecked phases; minimal immutable import evidence plus live safeguards, unchanged frozen digests, isolated PostgreSQL proofs with distinct historical-upgrade/canonical-replay profiles. Project deployment needs separate authorization. Task 4.1 remains unchecked and unstarted. Stop for independent review after the documentation commit. |

## Documentation-recording checkpoint

The later documentation task explicitly authorized fetch network access and
Git metadata writes. **One `git fetch origin` succeeded**, and clean `main`
and refreshed `origin/main` both matched the required
`65797993f29c97d757049f28c2da92f237512aa9`, ahead/behind 0/0, before edits.
This is a new observation, not a correction to the original failed-fetch record.

The documentation task performs no database/Docker operation, Access access,
application/schema/test-code edit, logo/recovery/ACL change or push. Earlier
database figures in this review remain dated evidence and are not claimed as
new checks in the recording task. D1–D51 remain unchanged; decisions are
appended sequentially. Canonical scope, permissions, model, terminology,
migration/verification guidance, task phases and handoff are synchronized.

Pre-commit documentation validation passed: the existing `npm run check`,
143 relative links including 14 Markdown anchors, `git diff --check`, exact
14-file Markdown scope, unchanged D1–D51 content and five unchecked Task 4.1
checkboxes (the task and four phases). The first static-check attempt reached
the Git-ignore check before Windows denied its Git subprocess; the same
existing check then passed through the normal approved permission mechanism.
The one-off link check initially encountered the same subprocess restriction
and was corrected to consume file names from ordinary read-only Git commands.
No check or guard was weakened. A read-only documentation subreview found no
actionable discrepancy against the owner resolutions.

The authorized stop is one local documentation commit and its external
correction-free single-commit full-index patch for independent review. Static,
relative-link, diff/scope and patch verification results are supplied with that
commit's delivery. No Task 4.1 implementation phase is marked complete or begun.
