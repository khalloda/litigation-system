# Task 4.2 Phase 3 — independent review

Date: 13 September 2026  
Result: **PASS for the Phase 3 implementation.**  
Candidate: `b2ac2187b762e7db82b190e6f5d522506e676292`  
Sole parent: `6771218164c992781902374efb62f0b2f54b2a20`

No new blocking defect was found in matter archive/restore. The supplied package is complete. Phase 2 acceptance is correctly included in this commit. Phase 3 and overall Task 4.2 owner acceptance are recommended, but have not yet been given for this delivery.

The separately reported, pre-existing development database credential exposure remains **MUST FIX before the next publication/deployment**. This is a configuration and operational follow-up, not an archive/restore correction. Do not interpret this review as authorization to rotate credentials, operate the owner app, apply migrations 64/65 or push.

## 1. Exact reviewed delivery

The raw commit object hashes to the candidate above. Its subject is `feat: add matter archive and restore`; Git scope is **45 files, +3,106/−95**. The desktop's partial edited-file display is not the full commit statistic.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Implementation patch | 204,418 | `f9fda1539db584cc85f2b00d649c94dff590bc84a3eab64e9043ad31cb2012d9` |
| Implementation review ZIP | 17,336,592 | `37799e1b19e137fea725cc71e523cc101b7082830d26a1ac47de765ed322274b` |
| Implementation manifest | 438,622 | `532d5c0e7555481cf6baa4d1d144016b0919c5c760e6ce20b367c1c3f855572f` |
| Separate delivery receipt | 882,904 | `f14e6171578999bc8e1808b3c05fc428fd6215d62febb22945a5a02c60711df2` |
| Canonical implementation report | 8,263 | `7cf29be6c895424a958d7fb44b62a718b476d208058b1c823c4ad0baa676f3d9` |
| Canonical acceptance matrix | 7,230 | `a6ebf3432e63602e55b0705d4949bdd6109b5193499034d9f354aec69b042c17` |

The ZIP has **2,099 payload files plus its manifest: 2,100 exact members**, with no missing, duplicate, unsafe or unlisted paths. All member sizes/hashes and the separately supplied patch/manifest match. All 45 patch preimages/postimages match the retained parent chain and supplied Git postimages. All 183 supplied unchanged source files match that parent evidence. Forward and reverse applicability checks passed in an isolated reconstruction without applying the patch to the owner's repository.

The loose date-named report and matrix copies differ from the canonical packaged/Git versions only in line endings. The supplied `implementation-report(2).md` and `final-acceptance-matrix(1).md` match the canonical versions exactly. No replacement upload is needed.

## 2. Independent work and evidential limits

This review independently completed:

- **130** artifact, source, scope and preservation-record checks.
- **77** execution-provenance and evidence-consistency checks.
- **43** executable controls using the delivered parser/link functions and a comparison of the shared audit writer against its predecessor.
- Visual inspection of four supplied desktop, 320-pixel, archived-detail and genuine 200% zoom screenshots.
- A scan of all 2,100 extracted files for the known prior credential literal, with **zero matches**. The value is not included in the reviewer evidence.

The 43 controls execute delivered TypeScript function bodies after type erasure, including valid lifecycle requests, malformed and ambiguous envelopes, and independently composed client/matter return filters. They are not substitutes for a fresh PostgreSQL or React run. The reviewer recomputed supplied evidence and inspected source/screenshots; **no fresh Windows, PostgreSQL, production-browser, owner-runtime or remote Git operation was performed here**. Database concurrency and browser results below are supplied execution evidence whose provenance was checked.

## 3. Feature and migration assessment

The new D58 decision records the expressly authorized lifecycle contract. Administrator-only archive/restore, default unarchived listing, explicit archived/all filters and readable archived details are implemented consistently. Restoration is required before ordinary editing. Archive does not close the business matter, delete or reparent its children, change client archive state, or exclude it from existing report datasets.

The server and database boundaries validate action, identity, current account/session/actor, expected version, dependent counts and explicit confirmation. Matter locking and post-wait authorization checks protect the committing boundary. Exact submission receipts distinguish successful retries from altered payloads. Retained row guards prevent archived aggregate edits and child changes. Existing Phase 2 relationship identity, nullable order and protected D41 court behavior remain intact.

The UI keeps archive states independent across matter and client navigation. Cancellation and errors retain a usable route back; stale confirmation requires fresh state. Archived details expose restoration without ordinary editing. The inspected Arabic/RTL screenshots have readable mixed-language values, visible confirmation/cancel controls and a usable vertical 320-pixel layout. Automated accessibility evidence is discussed separately below; screen-reader speech remains excluded by the owner.

Migrations **1–64 are unchanged**. Accepted migration 64 remains SHA-256 `afd0ebc8c9c98e4de2eaa594668eb8dd7e7c216d8b1fdb093a44ebb50ff99034`. New migration `20260912210000_matter_archive_restore` has canonical LF SHA-256 `d036bcbc6c4a9ae6305009906f93896e6e5974f051396f48e344c24bba1c67c6`. It adds the archive flag/index, lifecycle controls and receipts through the existing edit-history boundary, four row triggers and the explicitly inventoried private/public functions. Existing business data is preserved under the reviewed migration delta.

### Shared audit allocator

Migration 65 also changes the common audit-ID allocation path. This broader dependency was specifically reviewed. A private singleton counter allocates IDs transactionally through the existing security-definer audit writer. The old sequence is left unchanged. The writer comparison confirms that actor/context, field validation and redaction behavior remain the same; the change is explicit transactional ID allocation.

This addresses the demonstrated failure case in which a rolled-back audit write still consumed sequence state. Counter updates roll back with the enclosing operation, satisfying the approved full-state refusal contract. Direct access to the allocator/counter is not granted to the application role or PUBLIC.

The tradeoff is **serialization of audited writes on one counter row**. Supplied overlap, rollback, permission and existing edit controls support correctness for this delivery. They are not a throughput benchmark or proof of Ubuntu production capacity. Keep that documented tradeoff visible in later production sizing; it does not create a new acceptance blocker or justify an unrelated redesign here.

## 4. Supplied execution evidence and verified reuse

Six retained runs have pinned executed sources and final-source mappings. The 228 supplied Git postimages bridge to those inventories. All retained executed source copies match their recorded hashes, and the final critical source subset is accounted for.

| Proof | Reviewed result |
| --- | --- |
| Lifecycle service and races | 16 lifecycle records, including five observed lock waits; edit/archive, archive/restore and exact-duplicate overlap; role/account/session refusals; post-wait revocation/expiry; audit-failure rollback with complete sequence/counter preservation. |
| Retention | Five complete cases cover empty native matters, nullable/gapped/retired relationships, imported matters with and without hearings, and a financial matter. Related row contents, identities, capacities and order are compared, not merely counted. |
| Client/report independence | Both client archive states remain independent. Six nonempty report datasets with 82, 752, 2, 12,848, 3,694 and 1,140 rows retain their reviewed business projections/digests. |
| Phase 2 controls | Fresh R1/R2 controls and all six changed/cleared D41 court refusals; permanent D39/D40/D41 verifier; existing R3 source/reuse identities and fresh post-restore no-op behavior. |
| Production browser | Final completed run has 19 records, eight zero-violation accessibility scans and a genuine 200% browser-zoom contract; all four roles, direct denials, cancel/focus, validation/stale/lost-response handling, filtering and post-restore editing are covered. |
| Migration | Historical-profile 125 and canonical-profile 107 invariants, exact delta, late-failure rollback, repeat deployment, and native pre-65 create/edit history followed by archive/restore/edit. Final LF migration bytes have fresh successful historical and canonical runs. |
| Other gates | 448 permission decisions; completed eleven-part static gate; production builds; existing real-database read-only check with 121 invariants. |

Failed or partial attempts are retained rather than counted as complete passes. In particular, `retention-browser-final` supplies valid completed retention proof but stopped on a stale browser alert selector; `browser-final` is the later completed browser proof. Earlier runs used a CRLF-equivalent migration and a comment-format difference. The final LF historical and canonical profiles execute the canonical migration. Test additions/selector fixes are tied to their actual executed copies; this review does not assert that every proof ran in one uninterrupted final build.

The prior full R3 suite—24 ordering cases, eight complete no-ops, six scans and two zoom contracts—is verified reuse, not a newly repeated suite. Future hearing/task/document selectors and full report screens retain their D58 integration obligations. Task 4.3 has not begun.

## 5. Preservation and reported Git state

Supplied source/live before/after records match each other and the preceding final receipt: **63 applied migrations, 109 tables, 48 complete sequences and 54 logos**. Migrations 64/65 remain pending in the real development database. All **4,007 protected entries** match; the preceding 3,912 entries remain an exact subset. All **40,571 runtime entries** and the owner process/listener match their baseline. The locked runtime log remains the explicitly stated exclusion. Owned fixture, mirror and cache cleanup is recorded.

The exact final Phase 2 PASS review is preserved, its acceptance addenda are present, and only the Phase 3 task checkbox changes. Overall Task 4.2 remains unchecked pending the owner decision.

Supplied final Git state is clean `main`, **five ahead/zero behind** the fetched `d84aa4b916e41e15abf543fc7dd2d4155bea7acf` checkpoint. The receipt discloses the sandbox-blocked pre-I/O fetch and supported identical retry. No push or owner-app operation is reported. These are reviewed records, not a new observation of the remote or running Windows environment.

## 6. Separate pre-existing credential finding

**C1 — MUST FIX: committed development database password fallback is reported to be active.** The original `docker-compose.yml` is unchanged by this commit. Its retained SHA-256 is `321704a8e3a35c39efd7323db740ccdde1471e6c6f731dc079f5952a05cbdcfe`. The supplied local finding reports that the fallback matches the active database password and migration connection password. This reviewer verified the original file identity, unchanged provenance, labelled redaction and package exclusion, but did not independently authenticate to the laptop's database.

If the reported match holds, someone with the repository value and database access has a known privileged credential. The declared loopback binding limits network reachability; this review does not claim an intrusion or public database exposure. Windows development use does not make a known active password suitable for continued use.

Removing the fallback from Compose alone does not change an initialized database's password: the official PostgreSQL image applies initialization variables when creating an empty data directory. The follow-up must rotate the actual role credential and update affected protected connection settings. See the [official PostgreSQL image documentation](https://hub.docker.com/_/postgres).

The final package intentionally provides only redacted Compose context. No raw credential/configuration attachment is missing or requested. Original evidence must remain unchanged; a credential fix should record new evidence without rewriting old packages or Git history automatically.

## 7. Recommended next action

Accept Phase 3 and Task 4.2 overall, then combine their acceptance record with the bounded C1 remediation in **one local commit**. The accompanying `task42-phase3-credential-remediation-plan.md` makes the proposed configuration, credential, connection verification and recovery scope reviewable. This reduces a separate documentation-only cycle while retaining independent review before publication.

Approval is needed for the actual credential/configuration and any necessary brief reconnect because the Phase 3 mandate explicitly preserved those live development settings and the owner app. No new service purchase, Windows production-hardening program, Ubuntu deployment, live migration 64/65, history rewrite, push or Task 4.3 implementation is part of that proposal.

This PASS review recommends acceptance; it does not record acceptance or operational remediation as already completed.
