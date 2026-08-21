/*
 * Fails if the interface breaks one of the two rules that are invisible until
 * somebody opens the screen.
 *
 *     npm run check:rtl              check src/
 *     npm run check:rtl -- --self-test   prove the checker still catches things
 *
 * Rule 1 — CSS logical properties only (docs/BRAND.md).
 *   In a right-to-left page `margin-left` puts the gap on the wrong side. It
 *   looks correct to whoever wrote it in a left-to-right frame of mind and
 *   wrong to every user of this system.
 *
 * Rule 2 — no visible text inside a component (decision D12).
 *   Every string a user can read lives in src/strings.ts, so a second
 *   language stays a mechanical change rather than an excavation.
 *
 * Both rules previously had holes, found in review, and every hole is now a
 * fixture in scripts/fixtures/rtl-violations/ that the self-test asserts is
 * still caught:
 *   - styles written inline inside a component, which were not examined at all
 *   - `left: 0` and `right: 0` anywhere but the start of a line
 *   - four-value margin/padding shorthand, which is directional
 *   - visible text that is not Arabic; the check only looked for Arabic, so
 *     the English colour names on our own page went unnoticed
 */

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'generated', 'out', 'build']);

/*
 * A deliberate exception is allowed with an `rtl-ok` comment on the line, or
 * the line above, saying why. `direction: ltr` on a hex code is legitimate.
 */
const ALLOW = /rtl-ok/;

type Problem = { file: string; line: number; text: string; message: string; rule: string };

/* ------------------------------------------------------------------------ */
/*  Rule 1a — physical properties in a stylesheet                            */
/* ------------------------------------------------------------------------ */

const PHYSICAL_CSS: Array<[RegExp, string, string]> = [
  [/\bmargin-left\b/, 'margin-inline-start', 'margin-left'],
  [/\bmargin-right\b/, 'margin-inline-end', 'margin-right'],
  [/\bpadding-left\b/, 'padding-inline-start', 'padding-left'],
  [/\bpadding-right\b/, 'padding-inline-end', 'padding-right'],
  [/\bborder-left\b/, 'border-inline-start', 'border-left'],
  [/\bborder-right\b/, 'border-inline-end', 'border-right'],
  [/\bborder-top-left-radius\b/, 'border-start-start-radius', 'border-top-left-radius'],
  [/\bborder-top-right-radius\b/, 'border-start-end-radius', 'border-top-right-radius'],
  [/\bborder-bottom-left-radius\b/, 'border-end-start-radius', 'border-bottom-left-radius'],
  [/\bborder-bottom-right-radius\b/, 'border-end-end-radius', 'border-bottom-right-radius'],
  /*
   * Bare `left:` / `right:` ANYWHERE, not only at the start of a line, so
   * that `.box { left: 0; }` written on one line is caught. The lookbehind
   * stops `margin-left:` matching twice.
   */
  [/(?<![-\w])left\s*:/, 'inset-inline-start', 'left'],
  [/(?<![-\w])right\s*:/, 'inset-inline-end', 'right'],
  [/\btext-align\s*:\s*left\b/, 'text-align: start', 'text-align: left'],
  [/\btext-align\s*:\s*right\b/, 'text-align: end', 'text-align: right'],
  [/\bfloat\s*:\s*left\b/, 'float: inline-start', 'float: left'],
  [/\bfloat\s*:\s*right\b/, 'float: inline-end', 'float: right'],
  [/\bclear\s*:\s*left\b/, 'clear: inline-start', 'clear: left'],
  [/\bclear\s*:\s*right\b/, 'clear: inline-end', 'clear: right'],
];

/*
 * Four-value shorthands. Most are written top-right-bottom-left, so they are
 * directional when the right and left values differ — and they silently stay
 * pointing the same way when the page is right-to-left.
 *
 * `border-radius` is the odd one: top-left, top-right, bottom-right,
 * bottom-left. Mirroring swaps the first with the second and the fourth with
 * the third, so it is directional when either of those pairs differs.
 */
type Sides = 'trbl' | 'corners';

const FOUR_VALUE_PROPERTIES: Array<[string, Sides, string]> = [
  ['margin', 'trbl', 'margin-block and margin-inline'],
  ['padding', 'trbl', 'padding-block and padding-inline'],
  ['inset', 'trbl', 'inset-block and inset-inline'],
  ['border-width', 'trbl', 'border-block-width and border-inline-width'],
  ['border-color', 'trbl', 'border-block-color and border-inline-color'],
  ['border-style', 'trbl', 'border-block-style and border-inline-style'],
  ['scroll-margin', 'trbl', 'scroll-margin-block and scroll-margin-inline'],
  ['scroll-padding', 'trbl', 'scroll-padding-block and scroll-padding-inline'],
  ['border-radius', 'corners', 'the logical corner properties'],
];

function directionalShorthand(property: string, sides: Sides, value: string): string | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 4) return null;

  if (sides === 'trbl') {
    if (parts[1] === parts[3]) return null; // symmetrical, so direction-safe
    return `right ${parts[1]}, left ${parts[3]}`;
  }
  // corners: top-left / top-right / bottom-right / bottom-left
  if (parts[0] === parts[1] && parts[3] === parts[2]) return null;
  return `top-left ${parts[0]}, top-right ${parts[1]}, bottom-right ${parts[2]}, bottom-left ${parts[3]}`;
}

function checkFourValueShorthand(code: string): string | null {
  for (const [property, sides, replacement] of FOUR_VALUE_PROPERTIES) {
    // Match the property name only when it is not part of a longer one
    // (`border-radius` must not match inside `border-top-left-radius`).
    const pattern = new RegExp(`(?<![-\\w])${property}\\s*:\\s*([^;{}]+)`);
    const match = pattern.exec(code);
    if (!match) continue;
    const detail = directionalShorthand(property, sides, match[1] ?? '');
    if (detail) {
      return `directional four-value ${property} shorthand (${detail}) — use ${replacement}`;
    }
  }
  return null;
}

/*
 * The same shorthands written inside a JSX inline style, where the value is a
 * quoted string: style={{ margin: '0 4px 0 16px' }}
 */
function checkFourValueInline(code: string): string | null {
  for (const [property, sides, replacement] of FOUR_VALUE_PROPERTIES) {
    const camel = property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    const pattern = new RegExp(`(?<![-\\w.])${camel}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`);
    const match = pattern.exec(code);
    if (!match) continue;
    const detail = directionalShorthand(property, sides, match[1] ?? '');
    if (detail) {
      return `directional four-value ${camel} in an inline style (${detail}) — use ${replacement}`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/*  Rule 1b — physical properties in an inline style inside a component      */
/* ------------------------------------------------------------------------ */

const PHYSICAL_JSX: Array<[RegExp, string, string]> = [
  [/\bmarginLeft\b/, 'marginInlineStart', 'marginLeft'],
  [/\bmarginRight\b/, 'marginInlineEnd', 'marginRight'],
  [/\bpaddingLeft\b/, 'paddingInlineStart', 'paddingLeft'],
  [/\bpaddingRight\b/, 'paddingInlineEnd', 'paddingRight'],
  [/\bborderLeft(?:Width|Color|Style)?\b/, 'borderInlineStart…', 'borderLeft'],
  [/\bborderRight(?:Width|Color|Style)?\b/, 'borderInlineEnd…', 'borderRight'],
  [/\bborderTopLeftRadius\b/, 'borderStartStartRadius', 'borderTopLeftRadius'],
  [/\bborderTopRightRadius\b/, 'borderStartEndRadius', 'borderTopRightRadius'],
  [/\bborderBottomLeftRadius\b/, 'borderEndStartRadius', 'borderBottomLeftRadius'],
  [/\bborderBottomRightRadius\b/, 'borderEndEndRadius', 'borderBottomRightRadius'],
  [/\btextAlign\s*:\s*['"]left['"]/, "textAlign: 'start'", "textAlign: 'left'"],
  [/\btextAlign\s*:\s*['"]right['"]/, "textAlign: 'end'", "textAlign: 'right'"],
  [/\bfloat\s*:\s*['"]left['"]/, "float: 'inline-start'", "float: 'left'"],
  [/\bfloat\s*:\s*['"]right['"]/, "float: 'inline-end'", "float: 'right'"],
  [/\bleft\s*:\s*[-\d'"]/, 'insetInlineStart', 'left'],
  [/\bright\s*:\s*[-\d'"]/, 'insetInlineEnd', 'right'],
];

/* ------------------------------------------------------------------------ */
/*  Rule 2 — visible text inside a component                                 */
/* ------------------------------------------------------------------------ */

/*
 * Props whose value a user reads. A literal string in any of these is
 * interface text and belongs in src/strings.ts.
 */
const VISIBLE_PROPS =
  /\b(?:title|alt|placeholder|aria-label|aria-description|label)\s*=\s*\{?\s*["'`]/;

/*
 * A bare string literal inside a JSX expression: {'Save'} or {`Save`}.
 * Written that way it renders exactly like text between tags, and the
 * original check — which only looked between > and < — never saw it.
 */
const JSX_EXPR_STRING = /\{\s*["'`]([^"'`]{2,})["'`]\s*\}/;

/*
 * Object keys that name something displayed. This is what catches a table of
 * data defined inside a component — the shape our own colour palette used.
 */
const LABEL_KEY =
  /\b(?:name|label|title|heading|caption|text|description)\s*:\s*['"`]([^'"`]{2,})['"`]/;

/* Text sitting directly between JSX tags: <p>Hello</p> */
const JSX_TEXT = />\s*([^<>{}\n][^<>{}]*?)\s*</;

const HAS_LETTERS = /[A-Za-z؀-ۿ]{2,}/;

/*
 * Not interface text: technical values that happen to be strings.
 * Hex colours, CSS custom property names, single words that are plainly
 * identifiers, and anything that is only punctuation or digits.
 */
function looksTechnical(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return true; // hex colour
  if (/^--[\w-]+$/.test(v)) return true; // CSS custom property
  if (/^[\d\s.,:/+-]+$/.test(v)) return true; // digits and punctuation only
  if (v.includes('${')) return true; // an interpolation, e.g. a class list
  if (!HAS_LETTERS.test(v)) return true;
  return false;
}

/*
 * Props that carry machine values, not words. A string in one of these is
 * never interface text, so a template literal in className must not be
 * mistaken for a label.
 */
const TECHNICAL_PROPS =
  /\b(?:className|class|key|id|htmlFor|href|src|srcSet|type|role|name|rel|target|style|data-[\w-]+)\s*=/;

/* ------------------------------------------------------------------------ */

/*
 * Removes inline block comments, so a rule written in a comment does not
 * report itself. Deliberately written without a regular expression:
 * escaping backslashes through several layers of tooling is exactly how
 * this line broke twice while it was being written.
 */
function stripInlineComments(line: string): string {
  let out = line;
  for (;;) {
    const start = out.indexOf(String.fromCharCode(47, 42));
    if (start === -1) break;
    const end = out.indexOf(String.fromCharCode(42, 47), start + 2);
    if (end === -1) break;
    out = out.slice(0, start) + out.slice(end + 2);
  }
  return out;
}

function stripLineComment(line: string): string {
  const i = line.indexOf('//');
  // Leave URLs alone: https:// is not a comment.
  if (i > 0 && line[i - 1] === ':') return line;
  return i === -1 ? line : line.slice(0, i);
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function checkFile(file: string): Problem[] {
  const rel = relative(ROOT, file).split(sep).join('/');
  const problems: Problem[] = [];
  const lines = readFileSync(file, 'utf8').split('\n');
  const isStyle = /\.(css|scss)$/.test(rel);
  const isComponent = /\.tsx$/.test(rel);

  let inComment = false;

  lines.forEach((line, i) => {
    const previous = lines[i - 1] ?? '';
    const wasInComment = inComment;
    const opens = line.lastIndexOf(String.fromCharCode(47, 42));
    const closes = line.lastIndexOf(String.fromCharCode(42, 47));
    if (opens > closes) inComment = true;
    else if (closes > opens) inComment = false;

    if (ALLOW.test(line) || ALLOW.test(previous)) return;

    const code =
      wasInComment || inComment ? '' : stripLineComment(stripInlineComments(line)).trimEnd();
    if (code.trim() === '') return;

    const add = (message: string, rule: string) =>
      problems.push({ file: rel, line: i + 1, text: line.trim(), message, rule });

    if (isStyle) {
      for (const [pattern, replacement, id] of PHYSICAL_CSS) {
        if (pattern.test(code)) add(`physical direction — use ${replacement}`, id);
      }
      const shorthand = checkFourValueShorthand(code);
      if (shorthand) add(shorthand, 'four-value-shorthand');
    }

    if (isComponent) {
      for (const [pattern, replacement, id] of PHYSICAL_JSX) {
        if (pattern.test(code)) {
          add(`physical direction in an inline style — use ${replacement}`, `jsx:${id}`);
        }
      }

      const inlineShorthand = checkFourValueInline(code);
      if (inlineShorthand) add(inlineShorthand, 'four-value-inline');

      if (VISIBLE_PROPS.test(code)) {
        add('literal text in a visible prop — move it to src/strings.ts (D12)', 'visible-prop');
      }

      const exprString = JSX_EXPR_STRING.exec(code);
      const beforeExpr = exprString ? code.slice(0, exprString.index) : '';
      if (exprString && !looksTechnical(exprString[1] ?? '') && !TECHNICAL_PROPS.test(beforeExpr)) {
        add(
          `string literal rendered as text "${exprString[1]}" — move it to src/strings.ts (D12)`,
          'jsx-expression-string',
        );
      }

      const labelMatch = LABEL_KEY.exec(code);
      if (labelMatch && !looksTechnical(labelMatch[1] ?? '')) {
        add(
          `displayed label "${labelMatch[1]}" — move it to src/strings.ts (D12)`,
          'label-key',
        );
      }

      const textMatch = JSX_TEXT.exec(code);
      if (textMatch && !looksTechnical(textMatch[1] ?? '')) {
        add(`text between tags "${textMatch[1]}" — move it to src/strings.ts (D12)`, 'jsx-text');
      }
    }
  });

  return problems;
}

async function scan(dir: string): Promise<{ files: string[]; problems: Problem[] }> {
  const files = (await walk(dir)).filter((f) => /\.(css|scss|tsx)$/.test(f));
  return { files, problems: files.flatMap(checkFile) };
}

function report(problems: Problem[]) {
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}`);
    console.error(`    ${p.text}`);
    console.error(`    ${p.message}\n`);
  }
}

/* ------------------------------------------------------------------------ */
/*  Self-test: prove the checker still catches what it claims to.            */
/* ------------------------------------------------------------------------ */

/*
 * Every rule that has ever had a hole in it appears here. A rule with no
 * fixture is a rule nobody has tested.
 */
const MUST_CATCH = [
  'margin-left',
  'padding-right',
  'border-left',
  'left',
  'right',
  'text-align: left',
  'float: right',
  'clear: left',
  'border-top-left-radius',
  'four-value-shorthand',
  'four-value-inline',
  'jsx:marginLeft',
  'jsx:paddingRight',
  'jsx:borderLeft',
  'jsx:left',
  "jsx:textAlign: 'right'",
  'visible-prop',
  'label-key',
  'jsx-text',
  'jsx-expression-string',
];

/*
 * Known gaps: fixtures that exist, that the checker does NOT yet catch, and
 * that are deliberately not being fixed now.
 *
 * Both need the checker to understand the structure of a file rather than
 * read it a line at a time — real parsing, a few hours' work. There are no
 * real screens yet, so these are theoretical today. Task 4.0 revisits them at
 * the start of Stage 4, when there is actual interface to check.
 *
 * They are REPORTED on every run and never fail the build. A test that fails
 * when someone improves the checker would teach people to delete the test.
 */
const KNOWN_GAPS = [
  'JSX text spread over several lines',
  'a visible prop whose string sits on its own line',
];

async function selfTest() {
  const broken = await scan(join(ROOT, 'scripts', 'fixtures', 'rtl-violations'));
  const clean = await scan(join(ROOT, 'scripts', 'fixtures', 'rtl-clean'));

  const caught = new Set(broken.problems.map((p) => p.rule));
  const missed = MUST_CATCH.filter((rule) => !caught.has(rule));

  let failed = false;

  if (missed.length > 0) {
    console.error(`\nself-test: ${missed.length} rule(s) did NOT catch their fixture:\n`);
    for (const rule of missed) console.error(`  ${rule}`);
    console.error('');
    failed = true;
  }

  if (clean.problems.length > 0) {
    console.error(`\nself-test: ${clean.problems.length} false positive(s) on clean fixtures:\n`);
    report(clean.problems);
    failed = true;
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log(
    `check:rtl self-test — ${MUST_CATCH.length} rules each caught their deliberately ` +
      `broken fixture (${broken.problems.length} findings), and ${clean.files.length} ` +
      `correct files produced none.`,
  );
  console.log(
    `                     ${KNOWN_GAPS.length} known gaps not yet caught, ` +
      `deferred to TASKS.md 4.0:`,
  );
  for (const gap of KNOWN_GAPS) console.log(`                       - ${gap}`);
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await selfTest();
    return;
  }

  const { files, problems } = await scan(join(ROOT, 'src'));

  if (problems.length === 0) {
    console.log(`check:rtl — ${files.length} files, no problems.`);
    return;
  }

  console.error(`\ncheck:rtl found ${problems.length} problem(s):\n`);
  report(problems);
  console.error('If one of these is genuinely correct, add a `rtl-ok` comment');
  console.error('on the line or the line above, saying why.\n');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
