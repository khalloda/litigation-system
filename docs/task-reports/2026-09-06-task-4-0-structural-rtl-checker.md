# Task 4.0 — structural Arabic/RTL interface-policy checker

- Accepted: 6 September 2026
- Codex model: GPT-5.6 Sol
- Reasoning effort: high
- Environment: Local
- Subagents: prohibited; none used
- Expected qualitative usage: medium
- Least-expensive safe configuration rationale: the task was one bounded local
  static-analysis correction with synthetic fixtures and no database or browser
  work; one agent using the repository's installed TypeScript toolchain was the
  smallest configuration that could implement and verify it safely.
- Starting commit: `d73daf19e7c9f6b7de3d3fd8db1a4856e24dc5e8`
- Final commit: the enclosing commit named `fix: make RTL checker structural`;
  its SHA is reported after creation because a content-addressed commit cannot
  contain its own SHA.
- Push status: not pushed; `origin/main` remains
  `d73daf19e7c9f6b7de3d3fd8db1a4856e24dc5e8`
- Exact authorized stop point: one local Task 4.0 commit and one external
  binary-safe full-index review patch; no push, database work or Stage 4 screen
- Exact next return point: Task 4.0a — Staff roster management, not Task 4.1

## Run configuration and scope

The owner authorized Task 4.0 only: replace the line-oriented checker with
structural parsing, turn both known multiline gaps into permanent failures,
retain every existing RTL/string/colour rule, correct three approved current
documentation counts, commit once and export one external review patch.

No file under `src` changed. No database, Docker service, migration, import,
reconciliation application, seed, raw data, workbook, runtime storage or
recovery evidence was accessed or modified. Task 4.0a, Task 4.1 and every other
screen remain unstarted. No D44 or other owner decision was created. No browser,
Figma, external account, unrelated plugin or subagent was used.

This implements existing D12 and the Arabic/RTL and colour-token policy in
`docs/BRAND.md`; it does not change product behavior or permissions.

## Pre-edit reproduction

At the clean starting commit, `npm run check:rtl` exited successfully and
reported:

- normal source: 13 files, no problems;
- existing negative baseline: 22 rules, 59 findings;
- clean baseline: two files, no findings;
- two known but permitted gaps: multiline JSX text and a visible prop whose
  literal was on separate lines.

Both missed constructs were already present in
`scripts/fixtures/rtl-violations/Variations.tsx`. The successful exit with those
two explicit gap messages proves the pre-edit behavior without creating a
disposable repository file.

## Structural parser choices and dependency decision

- **Components:** TypeScript 5.9.3, already a direct development dependency,
  supplies the compiler AST and scanner. `.tsx` uses `ScriptKind.TSX`; `.jsx`
  uses `ScriptKind.JSX`. AST source positions produce file-and-line diagnostics.
  Syntactic diagnostics fail closed.
- **Stylesheets:** PostCSS 8.5.23 parses standard `.css`, including CSS modules,
  comments, multiple declarations, multiline declarations and minified rules.
  The checker imports PostCSS, so exactly `postcss` 8.5.23 was added as a direct,
  exact development dependency. It was already the installed transitive version
  under Next.js; the lockfile change therefore adds only the root declaration
  and upgrades no package.
- **SCSS:** no SCSS exists in `src`, and no structural SCSS parser is installed.
  Every encountered `.scss` file fails closed with an actionable
  `unsupported-scss` diagnostic. No additional dependency was added.

`npm ls postcss typescript --depth=0` proved the direct installed versions as
PostCSS 8.5.23 and TypeScript 5.9.3. The installed public type declarations and
runtime behavior were sufficient for the used compiler/PostCSS APIs; no
version-specific ambiguity required external documentation lookup.

## Complete rule and extension inventory

Normal scanning recursively inspects `.tsx`, `.jsx`, `.css` and `.scss` under
`src`, excluding the existing generated/build directories. It enforces:

- visible JSX text across any number of lines;
- string-literal, no-substitution template, interpolated-template, concatenated
  and conditional literal fragments rendered as JSX children;
- literal or statically assembled visible values in `title`, `alt`,
  `placeholder`, `aria-label`, `aria-description` and `label`;
- displayed-label object properties named `name`, `label`, `title`, `heading`,
  `caption`, `text` or `description`;
- component raw hex literals;
- inline-style physical properties for left/right margin, padding, borders,
  corner radii and inset, plus left/right `textAlign`, `float` and `clear`;
- asymmetric four-value inline `margin`, `padding`, `inset`, `borderWidth`,
  `borderColor`, `borderStyle`, `scrollMargin`, `scrollPadding` and
  `borderRadius`;
- the equivalent CSS physical declarations and left/right values;
- the equivalent nine asymmetric four-value CSS shorthands;
- raw CSS colours everywhere except a custom-property declaration in the exact
  production token file `src/app/globals.css`;
- component and CSS parse failures, with SCSS explicitly unsupported rather
  than silently skipped.

References to `src/strings.ts`, safe runtime expressions, whitespace-only JSX,
numbers, punctuation, technical attributes and machine values remain accepted.
Regular expressions operate only on values already isolated by a parser or on
actual comment tokens; they no longer locate TSX/JSX or CSS declarations in raw
source lines.

## Permanent fixture coverage and `rtl-ok`

The post-edit self-test proves 77 structural rule identities across 14 rejecting
fixtures and produces 133 expected findings. Four clean fixtures produce no
finding. It explicitly proves:

- the two former multiline gaps in `Variations.tsx`;
- rejecting and accepting `.tsx` and `.jsx` components;
- string-expression, no-substitution-template and interpolated-template visible
  text;
- every visible prop and displayed-label object-key family;
- all physical CSS and inline-style directions and all nine shorthand families;
- multiple findings in one parsed component;
- malformed TSX and CSS held as `.txt` evidence so repository formatting can
  remain valid while the checker parses those contents deliberately;
- multiline, minified, commented and repeated CSS declarations;
- component-stylesheet custom-property raw-colour bypass attempts;
- approved token declarations in the self-test's exact token-file analogue;
- SCSS failing closed;
- logical properties, symmetric shorthand, whitespace, technical attributes,
  machine values, runtime/string references and punctuation remaining clean.

Only an actual TypeScript-scanner or PostCSS comment token containing
`rtl-ok: non-empty reason` can authorize an exception. It must be immediately
leading or trailing the exact AST node/declaration that would otherwise fail.
A marker in a string does nothing; a reasonless marker reports
`rtl-ok-reason`; a distant or unused marker reports `rtl-ok-unused`. The clean
fixtures contain two justified exceptions, attached only to synthetic expected
brand-hex comparisons in component and CSS parsing. The current real-source
exception inventory is zero.

The self-test ends with **zero known gaps** and fails if either former gap, any
rule identity, any negative fixture, any named structural case, the
multiple-finding proof or any clean fixture regresses.

## Approved documentation corrections

The three approved factual alignments preserve every older figure as dated
history:

1. `docs/VISUAL-DIRECTION.md` now states the current 1,000 of 1,744 matters
   without a target lawyer relationship, while retaining 981 of 1,689 as the
   Task 2.7 result and 834 of 1,730 as the earlier planning snapshot.
2. `docs/PERMISSIONS.md` uses the same current figure for the billing-visibility
   explanation and retains both historical checkpoints.
3. `docs/DATA-MODEL.md` now states 309 current courts, preserves the reviewed
   308-court pre-Task-3.5B list, and records that D40/Task 3.5B added only
   `أسرة مصر الجديدة`, used by exactly two approved hearings.

`README.md`, `HANDOFF.md`, `TASKS.md` and `docs/BRAND.md` now describe the
completed structural checker and its exact return point. Dated audit and review
reports were not rewritten.

## Exact verification

- Mandatory Git preflight: `main`; clean; no active Git operation; `HEAD` and
  `origin/main` both
  `d73daf19e7c9f6b7de3d3fd8db1a4856e24dc5e8`; ahead/behind `0/0`; Task 4.0
  first unchecked; Tasks 4.0a and 4.1 unchecked.
- Migration 60 SHA-256:
  `7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`.
- Pre-edit `npm run check:rtl`: passed with 13 source files clean, 22 rules/59
  expected findings, two clean fixtures and both known gaps reported but
  permitted.
- Post-edit `npm run check:rtl`: passed with 13 source files clean, 77 rules,
  14 rejecting fixtures, 133 expected findings, four clean fixtures, both
  former gaps enforced and zero known gaps.
- `npm run typecheck`: passed.
- Focused `npx --no-install eslint scripts/check-rtl.ts`: passed.
- `npm run format:check`: passed.
- `npm run check`: all nine static gates passed; authorization still classifies
  16 entry points, audit self-test still rejects 6 schema plus 67 bypass
  fixtures, user-management self-test still rejects eight fixtures,
  Git-ignore/storage reports no banned tracked file, and all checked files are
  correctly encoded.
- `npm run build`: Next.js 16.3.1 production build passed; all eight routes were
  generated or server-rendered as expected.
- Final acceptance also includes `git diff --check`, exact authorized-scope,
  dependency/lockfile, secret/path/raw-data/binary/runtime-artifact scans,
  every-migration byte comparison, migration 60's repeated exact digest,
  complete staged and unstaged diff review, and post-commit Git/patch checks.

`test:auth`, `test:permissions`, database migrations and disposable database
suites were intentionally not run: this task changes no authentication,
authorization or database behavior, and the owner prohibited database access.

## Protected state, limitations and final Git state

All migration files remain byte-identical; no database claim is based on a live
query. The only dependency change is the exact direct development declaration
`postcss: 8.5.23`. No application source, authentication, permission, audit,
migration, schema, business data or runtime-storage file changed.

The checker intentionally does not parse SCSS; encountering it is a hard error.
It recognizes literal and structurally assembled JSX source, not arbitrary
runtime values, so values already supplied by `src/strings.ts` or computed at
runtime remain valid by design. Standard CSS parsed by PostCSS is the supported
stylesheet syntax.

After the enclosing commit, the intended verified state is `main`, one commit
ahead of unchanged `origin/main`, zero behind, clean, with no active Git
operation. The external patch identity and the final commit SHA are reported to
the owner after creation. The exact return point is Task 4.0a; no core Stage 4
screen has started.
