# Task 4.1 Phase 2 — independent review

Review date: 9 September 2026.

Reviewed implementation commit: `7872a52b19f838ab76bd02a901424e8d75758b4d`.

Recorded parent and fetched origin/main: `9962c9792180b5c46f9307aac03548edc4e9e597`.

**Recommendation: complete one narrow navigation correction before accepting Phase 2. Do not push or start Phase 3.**

The submitted implementation has substantial positive evidence for authorization, read-only transactions, data semantics, logo validation, isolation and accessibility. Two navigation paths still lose the user's place or filters. Neither finding demonstrates a database write or authorization bypass.

## Scope and limits

This review used the owner's attached Phase 2 mandate, implementation patch, Codex progress transcript, commit metadata, delivery receipt and sanitized evidence archive. It inspected all 36 changed-file diffs, the complete newly introduced runtime and test files, the supplied verification logs and representative final screenshots.

Independent execution here consisted of artifact hashing, manifest verification, Git patch statistics and new-file blob verification, comparison of preservation receipts, inspection of test assertions, and evaluation of the actual URL helpers and link expressions from the submitted source. The URL reproductions did not start the application or access a database or logo folder.

This was an artifact-based review. The reviewer did not access Khaled's Windows checkout, run the complete Windows/PostgreSQL suite again, fetch Git, inspect current remote refs or independently repeat the live project snapshots. The exact Git state, cleanup and test execution remain supported by the submitted receipts and logs rather than a new live inspection. Unchanged shared authentication and preservation helpers are dependencies of those proofs, not complete source files supplied in this patch.

## Findings

### R1 — preserve search and business status when including archived clients

Priority: P2, functional requirement correction.

Source: `src/app/clients/page.tsx`, line 158 in the reviewed commit.

The empty-results action uses the fixed destination `/clients?archive=all`. It drops the current `q` and `status` parameters. This conflicts with the approved requirement to preserve filters through navigation.

Example: search for a contact belonging to an archived, Disabled client while the archive filter is “current.” The list is correctly empty. Selecting “all, including archived” should retain the search and Disabled status, revealing that matching archived client. The current link instead requests all clients, all statuses and no search.

Reproduction from the actual submitted source:

| Item | Value |
| --- | --- |
| Starting search | `__PHASE2_ARCHIVED_PARENT_CONTACT` |
| Starting business status | `Disabled` |
| Starting archive filter | `current` |
| Actual action destination | `/clients?archive=all` |
| Actual retained search/status | Both absent |
| Expected behavior | Preserve search/status, set archive to `all`, reset list page to 1 |

Correction: build this destination with the existing validated filter/URL helper. Keep the explicitly labelled Clear action as the action that clears filters.

Permanent proof: use the existing archived-parent/contact fixture. Follow the actual empty-results link and assert the URL, displayed controls and matching result set. The current browser test audits the empty screen but does not click this link, so its zero accessibility violations do not cover this behavior.

### R2 — preserve contact pagination through the main-contact link

Priority: P3, navigation consistency correction suitable for the same small patch.

Sources: `src/app/clients/[id]/page.tsx`, line 97; `src/app/clients/[id]/contacts/[contactId]/page.tsx`, line 36.

Ordinary contact-row links include `contactsPage`. The optional main-contact link omits it. Consequently, when the user is on contact page 2, follows the main contact and selects “Back to client,” the contact page defaults to 1.

Evaluation of the actual main-contact and return-link expressions confirmed that the return destination ends with `contactsPage=1`, independently of the starting contact page. Search, business status, archive and client-list page already travel through this link; contact pagination is the missing state.

Correction: carry the effective contact page through the main-contact link, using the same convention as ordinary contact links. Preserve the existing validated return URL behavior.

Permanent proof: the existing primary fixture has 28 contacts and a main contact. Open contact page 2, follow the main-contact link, return using the displayed Back link, and verify page 2 and the existing list filters remain selected. Exercise the ordinary contact-row return as a comparison. No new business rule or schema is needed.

## Independently verified artifact integrity

| Item | Result |
| --- | --- |
| Patch size | 166,674 bytes |
| Patch SHA-256 | `abfcc05277862e87f35513f6579a701fc67ec1b473d7c4f016c8c889e7e61478` |
| Evidence ZIP size | 2,014,435 bytes |
| Evidence ZIP SHA-256 | `4d08e8da695374b382a9de069228c51a502631d596a109fc671221ffe62fc61f` |
| Archive members | 75: 74 listed files plus manifest |
| Manifest verification | All 74 file sizes and hashes match; no missing or unlisted files |
| Actual patch scope | 36 files, +3,007 / −236 |
| New-file Git blob verification | All 20 newly introduced files match their patch object hashes |
| Implementation report | Archive copy exactly matches the report introduced by the patch |
| Commit metadata | Uploaded commit.json and commit-stat.txt match their archive copies |
| Read-service hash pin | Submitted source matches `3f1c6a49cf182eff3280e1ba8d1b81fc30d0f2ce587f3a73501a913ae2f9b4e9` |
| Preservation receipts | before.json and after.json are byte-identical |
| Preservation receipt SHA-256 | `05a164f773ee7f9ade66b7db9886f110f8c50e11fb655cb6f28ad9ac3a0b89d6` |

The pasted editor panel showing 28 files and +886/−29 is not the complete final commit inventory. The patch, Git numstat, report and delivery metadata consistently show 36 files and +3,007/−236.

A limited text scan found no credential-bearing PostgreSQL URLs, JWT values, private-key blocks or Argon2/bcrypt password hashes in the evidence text. This is a targeted check, not a guarantee against every possible secret format.

Reverse applicability is reported as passed without applying. It was not repeated here because the exact full Windows checkout is unavailable.

## Source review observations

- Each of the three new pages calls its existing page permission guard before the first protected read. Logo GET and HEAD have separate wrappers. The route inventory records the five exports.
- Read services check the relevant client/contact/logo permission before opening their protected transaction. Each read transaction explicitly sets READ ONLY and uses repeatable-read isolation. Counts and list rows share the snapshot and predicates.
- Client search uses parameterized SQL, existing Arabic normalization, literal wildcard escaping and EXISTS for contact matches. It retains distinct clients and uses name plus PostgreSQL ID ordering. Main list and contact pages are bounded to 25 rows.
- Contact details constrain both contact and parent IDs. The explicit projection excludes home_phone. Imported contact_name remains primary, unnamed records remain accessible, and full_name is displayed separately.
- Date-only values are returned as date-only strings. Fee/status labels match the approved D53 spellings. Main contact, historical lawyer text, business status, archive state and historical identities remain separate.
- Client details count the related matters instead of loading the matter collection. The supplied plans include the 378-matter client.
- Logo lookup accepts a client identity, obtains the stored association, checks names/paths/containment/file identity/size/hash/type and image decoding, bounds reads and decoded pixels, and serves original bytes with private/no-store and nosniff. Early and late image failures have a name fallback.
- The existing logo validator was moved into runtime with a script re-export. Four JPEG byte reads changed from bracket indexing to readUInt8 under existing bounds checks; no migration file changed.
- The audit inventory adds the reviewed client closure and exact SQL call sites. The submitted patch does not remove the existing production permission or mutation guards.

No additional confirmed security or data-mutation defect was identified within this artifact review. This is not a blanket security certification.

## Supplied execution evidence assessed

The logs support eleven static checks, the complete 448-decision permission proof, real-volume focused service tests, a production build and the reported browser coverage. Existing authentication regression logs include forced-password, invalidation and database-role refresh checks. Phase 2 service tests separately reject null, unknown-role and forced-change sessions before their protected transaction spy is called.

The first regression wrapper stopped at an existing audit fixture that tried to demote its own acting Administrator. The correction changes the fixture actor to a distinct enabled Administrator. It does not change the production self-change guard. The separate audit rerun records successful completion of the affected profiles. Successful unrelated groups were retained rather than rerun unnecessarily.

Browser evidence contains 55 named records, including 50 axe audits with empty violation lists, 53 screenshot files and no recorded external requests. The genuine zoom records show unchanged outer width of 1440, layout width changing from 1440 to 720, device pixel ratio changing from 1 to 2, CSS zoom remaining 1 and browser zoom reported as 2.

Representative desktop client detail, 320px contact detail, 390px empty search and 200% contact detail screenshots were inspected. They show readable RTL content, distinct labels, visible controls and wrapped mixed-script/multiline fields. Automated accessibility audits and these screenshots do not establish screen-reader speech quality or every assistive-technology combination.

The two navigation defects are not exercised by the existing assertions. Passing accessibility checks do not demonstrate preservation of search or return-state parameters.

Supplied local execution observations are approximately 0.358 ms for the list query, 2.248 ms for the contact-search count query, 1.156 ms for the English-search query and 0.341 ms for the largest client detail query. These are fixture measurements, not production performance guarantees.

## Preservation and return point

The identical receipts contain 107 table records, 48 complete sequence states, catalog digests, migration state, container identity/configuration and 54 logo records. Selected unchanged counts recorded there are 318 clients, 188 contacts, 54 logo associations, 543 invoices, 597 payments, 47 invoice allocations and 4,022 attendance rows. Migration state is 62 applied, one historical rollback and zero unfinished. The invariant log records all 116 checks passing; the implementation report records the accompanying 15/15 setup verification.

The delivery reports clean main, one ahead/zero behind the recorded origin, no active Git operation or lock, cleanup of task-owned resources and no push. These must be checked again locally before a correction begins.

Recommended next action: reproduce and fix R1 and R2, add the focused browser assertions, refresh affected evidence and preserve this review in the canonical review documents. Make one additional local correction commit, preserving the reviewed implementation commit and original review package. Stop for independent review of the correction. Phase 3, Phase 4, Task 4.1a, project database writes, deployment and push remain outside this handoff.

## Suggested correction run configuration

Continue in the same Codex Desktop chat with GPT-6 Astra at Medium effort, Local Windows, no subagents. Expected usage: Medium because production browser verification and preservation checks remain required. Retaining the current implementation context while reducing effort and avoiding a repeated full regression run is the recommended economical configuration for this follow-up; exact credit savings cannot be guaranteed. No additional infrastructure or licensing expense is introduced.

OpenAI's [model guidance](https://learn.chatgpt.com/docs/models) supports using the lowest sufficient reasoning effort and describes Medium as a balance of speed and depth. The particular choice here is the reviewer's recommendation based on the existing chat and bounded correction scope.
