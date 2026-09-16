# Task 4.5 — R1 invalid-input correction and N1 evidence supplement

## Scope and review status

Local correction candidate for independent review, directly over
`8c0cdf1d235df2e63fa450be26667e158c573923` (tree
`3b02744c35eb2066a5ebf974e2fd101a5326fb58`). The owner explicitly adopted the
instructions in the verified reviewer ZIP on 16 September 2026. Its
[independent review](../reviews/2026-09-16-task-4-5-8c0cdf1-independent-review.md)
is imported verbatim: 12,113 bytes, SHA-256
`2a88c3b1f375c19f488b8923e511f6ac665fca1264c65fbccec454b8381dca97`.

T45-R1 is corrected locally; independent correction review is still required.
T45-N1 supplies the six exact original files. Neither finding is represented as
independently closed. Task 4.4 remains checked; Task 4.5 remains unchecked.

## What changed

An unfinished native number/date control can expose an empty JavaScript value
while still displaying a partial draft. The old editor converted that value to
NULL. The corrected editor leaves these two drafts in their native controls,
updates maintained values only when the control is valid, and checks both controls
before constructing a new submission. Invalid input receives the existing Arabic
feedback with the field label, an accessible error association and keyboard focus.
An unrelated React rerender does not erase the draft. Deliberate empty controls
still become NULL. An uncertain retry continues using its original frozen payload.

The only production file changed is `src/app/powers-of-attorney/poa-editor.tsx`.
No new strings, business rule, dependency or technical count limit is introduced.
D1–D64, migrations 1–70, schema, parser, query, mutation gateway, roles, audit and
permanent checks are unchanged. Original reports and evidence remain unchanged.
The existing POA fixture harness adds a choice of focused browser callback; new
test helpers and this report/matrix support that bounded correction.

## Original failure reproduced before editing production source

`red01` built the original editor in an isolated production mirror against an
identified disposable copy. Native keyboard input was used, with no synthesized
DOM events: select the count and type `-`; select the date's year segment and
delete it. Both controls exposed `badInput: true` and an empty value while showing
the unfinished draft. All eight combinations (two writers × create/update × two
fields) submitted a NULL value and saved it. Update controls started with count 2
and date 2026-09-15, so a silent clear could not be hidden by a pre-existing NULL.
Requests, resulting IDs/versions/values, screenshots and exact executed source
are retained. This is real browser/action/database reproduction on disposable data.

The separately rerun reviewer diagnostic also reproduced its eight offline
controls. It remains explicitly an offline source/parser diagnostic, not browser
proof. The original supplied script/result were preserved; this run used a copy.

## Correction proof

The [matrix](../testing/task-4-5-r1-correction-matrix.md) identifies the final runs.
The corrected cases assert no submitted action and equality of complete row/catalog
digests and full sequence vectors for rejected drafts; before/after values are
retained in the final native-input results. They also prove recovery and retention
through a rerender after changing another field.

The wider proof covers negative, fractional and overflowing counts, an unfinished
exponent, a year above 9999, deliberate NULL clearing, zero, positive and maximum
2147483647 counts, and dates 0001-01-01, 2024-02-29 and 9999-12-31. Native calendar
segment behavior is recorded separately: typing the attempted 31 February sequence
produced a valid browser value, so it is not claimed as an invalid-draft reproduction.
Impossible, zero-year and malformed date payloads are instead explicitly substituted
in transit to the real action on the disposable app; its existing parser must refuse
them without state changes. This supplementary action test is not native typing.

Both writers exercise creation and updating, intended value/history/receipt changes,
Cancel/Escape, imported current/source labels, stale draft preservation and a lost
response after a committed save. The latter retries the exact original payload after
a competing edit and must preserve the newer state without another write. Keyboard
focus, Arabic RTL, 320 CSS-pixel layout, automated accessibility/target checks and
the established real 200% zoom method are included. OS screen-reader speech remains
owner-excluded; no full accessibility certification is claimed.

Final `green02` passed all eight native cases and the additional boundary/recovery
proof for both writers. Its build was `Xt9g7bTRbweEZmFAVKCgA`, with 14 screenshots.
Fresh setup 15, accepted baseline 137, candidate 141 and final 141 database checks
passed; direct table/sequence/private-helper denials and upgrade preservation also
passed. Final project gate `check03` passed. The final source pin matches 544
executed source bodies and all 192 build-source files and freezes 695 existing
parent paths. The 66 recovery records include observations and state receipts;
they are not presented as 66 independent application tests.

The tracked report cannot contain its own future commit identity; external
candidate and delivery receipts bind the final SHA, parent/tree, statistics and
exact report blob. Final documentation receives encoding and whitespace checks.

## Iterations and evidence limits

- `red01`: all eight original silent-NULL browser cases reproduced; setup 15,
  accepted baseline 137, candidate/final 141 checks passed; owned cleanup passed.
- `green01`: all eight corrected native cases rejected without changes and saved
  after correction. The later calendar test failed because its keyboard sequence
  produced a valid native date. This was a test assumption; production code did not
  change afterward. Its failure, screenshot and exact source are retained.
- Static check01 lacked the isolated mirror's generated Next.js image declarations.
  `next typegen` generated them inside that mirror; check02 passed. No owner build or
  compiler policy was changed. Check03 passed on the final runtime/test source.

Original Task 4.5 backend/search/concurrency/corruption/canonical and permission
evidence is reused only with exact unchanged source identities. The original 448
permission decisions and canonical 123 checks are not claimed as freshly rerun.
Fresh disposable baseline/upgrade/final invariants and project gates are identified
separately. The original report's early-source-capture, D59 and dated preservation
limits remain intact. The two D59 source bodies stay opaque in shareable source;
complete local forward/reverse Git reconstruction retains them only locally.

## N1: exact original files supplied

All 26 original receipt artifacts were verified against their unchanged hashes
before correction. The six files named by N1 are supplied byte-for-byte, with the
original receipt: `verification-result.json`, `artifact-exclusion-first.json`,
`artifact-exclusion-first-helper.py`, `artifact-exclusion-check.json`,
`task45-scan-delivery.py` and `task45-delivery-receipt.py`. They are original files,
not regenerated substitutes. The initial placeholder-URL scan findings and final
classification chronology remain visible. The correction archive includes all 26
original artifacts, so a reviewer can resolve the entire original receipt.

## Preservation and delivery boundary

Evidence root:
`D:\Projects\LitigationData\review-evidence\task45-r1-20260916T060814Z`.
Fresh read-only database/protected-state observations compare unchanged between
**16 September 2026 06:09:27.535 and 06:44:21.031 UTC**: all 124 table digests,
48 complete sequence vectors, accounts/credential digests, configuration and
54 logos. The owner retained migration69, zero unfinished migrations and cluster
`7676117521894273062`. All 404 accepted build files match between
**06:10:47.8596421 and 06:44:18.6235511 UTC**, build
`LyN77RMhXZbOvG44OcUhg`. **Neither fresh observation found a listener on port3000.**
That condition was preserved; the app was not started. These are build-file and
listener observations, not a claim that yesterday's PID remained running or that
an authenticated owner screen was tested.

All three runs' task-owned database clusters/roles/credentials/volumes/networks,
production browser mirrors and listeners were removed; pre-existing Docker
resources were unchanged. Each browser cleanup compared 35,008 installed dependency
file metadata entries and recorded no remote requests. The separate static mirror
is removed after final documentation checks, with its own cleanup receipt. Tests
used a different PostgreSQL cluster, fixture-only accounts/secrets and non-owner app
ports. Source/review evidence and the separate local exact-Git proof are retained.

The correction is one local child, with exact binary/full-index patch, raw Git
commit/tree/blob identities, complete changed pre/postimages, source/test ledgers,
red/green proof, owner/cleanup receipts and all original N1 artifacts. The final
transport envelope also includes post-package verifier/exclusion results, helpers
and the non-circular delivery receipt; their contents are supplied, not only hashes.

No actual migration 70, owner activation, push, PR, Task 4.5 acceptance, checkbox
change or later-task work. Stop for independent correction review.
