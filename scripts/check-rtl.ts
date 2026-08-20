/*
 * Fails if the styles contain a physical direction, or a component contains a
 * hardcoded Arabic string.
 *
 *     npm run check:rtl        (also part of npm run check)
 *
 * Two rules from docs/BRAND.md, both of which are invisible until someone
 * opens the screen:
 *
 *   1. CSS logical properties only. In a right-to-left page, `margin-left`
 *      puts the gap on the wrong side. It looks fine to whoever wrote it in a
 *      left-to-right frame of mind and wrong to every user.
 *
 *   2. No Arabic inside a component. Every visible string lives in
 *      src/strings.ts, so a second language stays a mechanical change
 *      (decision D12).
 */

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'generated', 'out', 'build']);

/*
 * Physical properties and their logical replacements. The shorthands
 * `margin`, `padding` and `border` are fine — they are symmetrical.
 */
const PHYSICAL: Array<[RegExp, string]> = [
  [/\bmargin-left\b/, 'margin-inline-start'],
  [/\bmargin-right\b/, 'margin-inline-end'],
  [/\bpadding-left\b/, 'padding-inline-start'],
  [/\bpadding-right\b/, 'padding-inline-end'],
  [/\bborder-left\b/, 'border-inline-start'],
  [/\bborder-right\b/, 'border-inline-end'],
  [/\bborder-top-left-radius\b/, 'border-start-start-radius'],
  [/\bborder-top-right-radius\b/, 'border-start-end-radius'],
  [/\bborder-bottom-left-radius\b/, 'border-end-start-radius'],
  [/\bborder-bottom-right-radius\b/, 'border-end-end-radius'],
  [/^\s*left\s*:/, 'inset-inline-start'],
  [/^\s*right\s*:/, 'inset-inline-end'],
  [/\btext-align\s*:\s*left\b/, 'text-align: start'],
  [/\btext-align\s*:\s*right\b/, 'text-align: end'],
  [/\bfloat\s*:\s*left\b/, 'float: inline-start'],
  [/\bfloat\s*:\s*right\b/, 'float: inline-end'],
];

const ARABIC = /[؀-ۿ]/;

/*
 * A deliberate exception is allowed with a comment on the same line or the
 * line above, saying why. `direction: ltr` on a hex code is legitimate.
 */
const ALLOW = /rtl-ok/;


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

type Problem = { file: string; line: number; text: string; message: string };

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
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

  // Track /* ... */ so the rules written in a comment do not report
  // themselves. This checker documents the rule it enforces.
  let inComment = false;

  lines.forEach((line, i) => {
    const previous = lines[i - 1] ?? '';
    const wasInComment = inComment;
    const opens = line.lastIndexOf('/*');
    const closes = line.lastIndexOf('*/');
    if (opens > closes) inComment = true;
    else if (closes > opens) inComment = false;

    if (ALLOW.test(line) || ALLOW.test(previous)) return;

    // Strip anything that is a comment before looking for a violation.
    const code = wasInComment || inComment ? '' : stripInlineComments(line);

    if (isStyle && code.trim() !== '') {
      for (const [pattern, replacement] of PHYSICAL) {
        if (pattern.test(code)) {
          problems.push({
            file: rel,
            line: i + 1,
            text: line.trim(),
            message: `physical direction — use ${replacement}`,
          });
        }
      }
    }

    if (isComponent && ARABIC.test(line)) {
      // A comment explaining Arabic is fine; a visible string is not.
      const withoutComment = line.replace(/\/\*[\s\S]*?\*\/|\/\/.*|\{\/\*[\s\S]*?\*\/\}/g, '');
      if (ARABIC.test(withoutComment)) {
        problems.push({
          file: rel,
          line: i + 1,
          text: line.trim(),
          message: 'Arabic inside a component — move it to src/strings.ts (D12)',
        });
      }
    }
  });

  return problems;
}

async function main() {
  const files = (await walk(join(ROOT, 'src'))).filter((f) => /\.(css|scss|tsx)$/.test(f));
  const problems = files.flatMap(checkFile);

  if (problems.length === 0) {
    console.log(`check:rtl — ${files.length} files, no problems.`);
    return;
  }

  console.error(`\ncheck:rtl found ${problems.length} problem(s):\n`);
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}`);
    console.error(`    ${p.text}`);
    console.error(`    ${p.message}\n`);
  }
  console.error('If one of these is genuinely correct, add a `rtl-ok` comment');
  console.error('on the line or the line above, saying why.\n');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
