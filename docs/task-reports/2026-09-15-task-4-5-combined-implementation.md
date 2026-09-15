# Task 4.5 — complete POA implementation candidate

## Status and authority

Local candidate for independent implementation review. The owner explicitly adopted
D64 and authorized the whole POA module in one integrated working piece. Task 4.4
remains checked; Task 4.5 remains unchecked. No Task 4.6 work, push, activation or
owner migration is included.

Accepted parent: `e747e0efbdadb92892e933d768924e3e287e9a9a`, tree
`a93e6565d5b8c8566aaff27a2d6284a1a2757edb`. The final candidate commit/tree,
changed-file statistics and this report's exact blob/hash are bound by the external
`candidate-identity.json` and non-circular `delivery-receipt.json`. A tracked report
cannot contain its own future commit identity.

Evidence root:
`D:\Projects\LitigationData\review-evidence\task45-combined-20260915T142447Z`.
The [acceptance matrix](../testing/task-4-5-combined-acceptance-matrix.md) maps
requirements to the executed evidence. Final verification results are recorded there
and in the delivery receipt.

## Implemented behavior

- Arabic RTL list, stable 25-record pages, full detail and permission-aware home
  navigation. Search covers maintained fields and separately retained client/lawyer
  evidence, current/reviewed people and their active aliases. Exact normalized
  internal IDs do not acquire numeric-cast, partial, suffix or leading-zero matches.
  Literal `%`, `_` and backslash are escaped; `J` is never folded to `ق`.
- Independent archive, current client, current lawyer, copies and report filters.
  Operational reads include report-hidden records and records under archived clients.
  Query context survives detail/edit/Cancel and confirmation returns.
- Administrator and Litigation Assistant can create and edit maintained fields and
  current lawyer assignments. Lawyer and Paralegal remain view-only. New selections
  require existing active people; external people are supported. Already selected
  inactive people can remain. Retiring and re-adding a membership preserves its row
  identity and order. No person/client or legal interpretation is invented.
- Administrator alone can archive and restore. A linked archived client must first
  be restored, including before clearing or replacing that link. POA lifecycle does
  not change copies/report settings, client/person state, retained memberships or
  source evidence. Confirmation checks fresh facts and aggregate version.
- All twelve maintained fields are optional except a meaningful principal on new
  records. An unrelated edit preserves imported incomplete values. Copies distinguish
  zero, positive and unknown; report inclusion distinguishes shown, hidden and
  unknown. Textual reference components, serial/year and complete multiline text
  remain text. No movement, reporting, billing or audit-history screen is added.
- Current client/assignments and imported evidence have separate labels in list,
  detail and editor. Clearing a client never promotes imported text into a current
  relationship. Original lawyer evidence remains visible after current retirement.
- Arabic validation feedback preserves drafts and receives keyboard focus. Stale
  saves refuse instead of overwriting another edit. An uncertain request retains the
  exact submission/payload for retry; it does not create a new identity blindly.

## Database boundary and enforcement

Only forward migration `20260915180000_poa_editing_lifecycle_boundary` is new,
candidate checkpoint 70. Migrations 1–69 are unchanged. The migration captures the
complete old POA/member rows in an immutable private boundary before adding current
state. The historical profile contains 752 POAs and 87 reviewed member links;
the canonical profile starts empty. The 717 relationship-evidence rows are untouched.

Runtime direct writes, sequence use and private helpers are denied. The two public
gateways check current account/person/session authority on the server and in SQL;
the save gateway also verifies trusted audit context. Each real aggregate change
advances one version and atomically records complete before/after history, exact
audited row facts and an actor-owned submission receipt. A true no-op creates none
of those effects. Exact retries return the previous result even after later edits;
another actor or a changed payload cannot reuse the receipt.

Writes meet existing staff/account/person changes on the roster mutex and client
changes on deterministic client row locks. The aggregate and selected people are
then locked. Serializable retries recheck fresh authority and state. Client archive
does not use the roster mutex; concurrency proof observes its actual client lock.

Permanent `db:check` verification anchors the imported boundary to the accepted
historical inventory and replays every current aggregate from its complete history.
It checks source identity, membership retention/order, version, receipt ownership,
exact classified audit facts (including Administrator snapshots for both lifecycle
events and their row changes), functions, grants, triggers, columns, constraints and
indexes. Historical reconciliation reads the immutable old-column projection;
current state is independently checked rather than silently excluded.

## Proof and source binding

The supplied ZIP was checked against the separate unchanged manifest before edits:
8,304,606 bytes, SHA-256
`dc1cccf61b10e05a97db837238a57863481d08473ec780d4d36caa9668620fae`.
All 838 safe unique members, member sizes/hashes/CRCs, 152 raw Git tree objects and
the nested 29-member review package were verified. The standalone D64 matched.
The prior final Task 4.4 review was imported verbatim (13,475 bytes, SHA-256
`fd7581275f076843117c2227411a82d0f26611b36e8eea0e76611eb9a5924522`).

Fresh owner profiling found 752 POAs, all imported legacy IDs NULL, one missing
client, 87 reviewed links and 717 evidence rows. Copies were 0:113, 1:592, 2:29,
3:7, 4:2, 8:1, NULL:8; report flags were shown:697, hidden:55. There were no
empty strings in the ten profiled text columns. Principal/capacity/notes/lawyer
source multiline counts were 19/4/62/1. Native controls are separate test records
on disposable copies, clearly marked `TEST ONLY`.

Every write-capable run verifies a different cluster identity, database and local
port, with task-owned Docker resources. The historical copy is checked at accepted
69 before fixture account changes. Upgrade proof compares every old table value,
the old POA/member column projections and all 48 sequence state vectors. An injected
failure immediately before migration commit proves transactional rollback. Native
canonical replay and full final invariants are separate evidence.

The behavior suite checks all roles, whole result sets, independent field/membership
expectations, denials with complete state comparisons, both writers, retained
membership identity/order, all-field round trips, client clear/replacement, lifecycle,
exact retry/no-op, and parent prerequisites. Additional probes record actual database
lock waiters/blockers for conflicting writes and account/client/person changes.
Rollback-only corruption fixtures re-enable data triggers before asking the permanent
checker to detect data corruption, so detection cannot be attributed merely to a
disabled trigger. A failed native insertion records its real sequence reservation;
sequences are never rewound.

Production browser proof uses the installed Playwright/Chromium stack, an isolated
production build, copied logos, a fixture-only random signing secret and local signed
fixture sessions. It does not change owner credentials or sessions. Build-source,
compiled-build and browser-helper identities accompany the screenshots and results.
From historical attempt 09 onward, each attempt keeps its original executed-source
manifest and bodies. Attempts 01–08 predate complete source capture; their available
logs and snapshots are retained, but exact executed helper bodies cannot be claimed
for those early failures. No final implementation result relies on them. Attempt 14's
dynamically loaded browser helper was recovered and independently matched to its
recorded hash. Later source versions are not relabelled as earlier executed evidence.

The complete project gate runs in a clean source mirror. The working repository
contains an ignored earlier Task 4.4 source snapshot under `test-results`; TypeScript
and source discovery encounter that snapshot if run from the root. Earlier evidence
was preserved and generic checkers were not weakened to hide it. The mirror contains
the candidate source and the existing installed dependencies, with its own build output.

## Reused proof and limits

### Final executed results

- Historical attempt18: setup **15**, accepted baseline **137**, upgraded candidate
  **141** checks; **448** permission decisions and the existing negative permission
  suite; complete POA behavior/search/session proof; eleven corruption refusals;
  observed concurrent edit/lifecycle/membership/submission/client/person/account
  conflicts. Its later browser failure was the recovery-link target size.
- Browser attempt19: fresh accepted-copy upgrade, explicit direct insert/sequence/
  helper denials, production build `7A_wifeonTnixINWQmmGp`, four-role POA scenarios,
  both writers and Administrator lifecycle, **15 screenshots**, 320-pixel layout and
  genuine 200% browser zoom. All **141 final database checks** passed after the UI
  writes. The shared helper's legacy console caption says “hearing browser
  interactions”; the supplied callback, scenarios and screenshots are POA proof.
- Canonical06: canonical baseline **119**, upgraded/final **123** checks, native
  create/archive/restore, direct boundary denials and exact old lifecycle receipts
  after later state changes without replaying writes.
- `project-check11.log`: complete type/lint/format/RTL/authorization/audit/read/
  ignore/encoding gate passed. The final encoding and Git-whitespace receipts bind
  the finalized documentation. No dependencies or lockfile changed.
- `final-source-pin.json`: **542** backend/source bindings and **192** exact browser
  build-source bindings. Four recovery-control UI files were rebuilt and tested in
  attempt19. The harness's two added non-null type assertions produce identical
  emitted JavaScript; that equivalence is recorded rather than calling the bytes
  identical.

### Owner and resource closure

Between **14:28:44.258 and 16:48:48.079 UTC on 15 September 2026**, all **124 table
digests**, the catalog digest, **48 full sequence states**, accounts/credential
digests, protected configuration and **54 logos** matched. The owner retained
**69 completed migrations**, no unfinished migration and cluster
`7676117521894273062`. At **16:49:51.5549291 UTC**, the app still used PID **66108**
and accepted build **LyN77RMhXZbOvG44OcUhg** on loopback port 3000. The 404 build-file
hash/metadata entries also matched the earlier full inventory at 15:58:09 UTC;
that narrower window is not presented as a preflight full-build hash comparison.

Every final fixture cluster, credential set, volume, network, production mirror and
browser listener was removed through the existing ownership-checked cleanup. The
browser receipt records **35,008 installed dependency file metadata entries
unchanged** and no remote requests. Local review artifacts and the separate full-body
Git reconstruction are deliberately retained. The owner application was not requested,
logged into, rebuilt, replaced or activated by these tests.

The final Task 4.4 independent PASS and supplied verification package are historical
reused evidence. Its unchanged administrative application/query/mutation/input/lifecycle
sources and migrations remain exact. New static, permission and database checks cover
the changed inventory/checkpoint integration. The old full Task 4.4 application suites
are not claimed as newly executed. Existing shared browser isolation and accessibility
helpers are reused with exact source identities.

OS screen-reader speech is owner-excluded. Keyboard/focus, accessible names, automated
checks, RTL, 320 CSS-pixel layout and established zoom proof do not amount to complete
accessibility certification. D59 remains unchanged: the two accepted source bodies
`.env.example` and `docker-compose.yml` are opaque in shareable source. Full-body
forward/reverse Git proof occurs only in a separate local scratch repository.

Failed migration, checker, helper and browser attempts remain in the evidence ledger.
They include SQL construction/alias defects fixed before passing runs; exact checkpoint
inventory integration; stale database-statistics sampling; the client-lock test setup;
fixture account audit-counter expectations; browser touch-target sizing; and the
earlier ignored-source snapshot interfering with root checks. These are disclosed
iterations, not passing results. Normal sandbox process/network failures used the same
authorized operation with platform escalation. No safety override was used.

## Delivery boundary

The final package includes exact accepted/candidate source bodies, changed pre/post
images, raw Git commits/trees, the binary patch, source/test ledgers, preservation and
cleanup receipts, screenshots, prior review identities and a standalone verifier.
A content-addressed catalog deduplicates identical bodies across attempts without
omitting their original logical paths. The separate final receipt binds the completed
ZIP, member manifest, verification result, candidate identity and report.

Review must precede any acceptance or activation. The candidate has no authority to
apply migration 70 to the actual database, replace the accepted build, publish or
close Task 4.5.
