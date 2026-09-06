/*
 * Structural Arabic/RTL interface-policy checker.
 * TypeScript parses .tsx/.jsx, PostCSS parses .css, and .scss fails closed
 * until a separately reviewed structural SCSS parser exists.
 */

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';

import postcss, {
  type AtRule,
  type Comment,
  type Declaration,
  type Position,
  type Rule,
} from 'postcss';
import ts from 'typescript';

const ROOT = process.cwd();
const SOURCE_ROOT = join(ROOT, 'src');
const TOKEN_FILE = resolve(SOURCE_ROOT, 'app', 'globals.css');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'generated', 'out', 'build']);
const SCANNED_EXTENSIONS = new Set(['.css', '.scss', '.tsx', '.jsx']);

type Problem = { file: string; line: number; text: string; message: string; rule: string };
type ScanResult = { files: string[]; problems: Problem[] };
type ScanOptions = { tokenFile: string };
type RtlDirective = {
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  valid: boolean;
  used: boolean;
};
type Sides = 'trbl' | 'corners';

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const HAS_LETTERS = /[A-Za-z؀-ۿ]{2,}/;
const RTL_OK = /\brtl-ok\b/i;
const RTL_OK_WITH_REASON = /\brtl-ok\b\s*:\s*\S/i;

const VISIBLE_PROPS = new Set([
  'title',
  'alt',
  'placeholder',
  'aria-label',
  'aria-description',
  'label',
]);
const DISPLAYED_LABEL_KEYS = new Set([
  'name',
  'label',
  'title',
  'heading',
  'caption',
  'text',
  'description',
]);

const PHYSICAL_CSS = new Map<string, string>([
  ['margin-left', 'margin-inline-start'],
  ['margin-right', 'margin-inline-end'],
  ['padding-left', 'padding-inline-start'],
  ['padding-right', 'padding-inline-end'],
  ['border-left', 'border-inline-start'],
  ['border-left-width', 'border-inline-start-width'],
  ['border-left-color', 'border-inline-start-color'],
  ['border-left-style', 'border-inline-start-style'],
  ['border-right', 'border-inline-end'],
  ['border-right-width', 'border-inline-end-width'],
  ['border-right-color', 'border-inline-end-color'],
  ['border-right-style', 'border-inline-end-style'],
  ['border-top-left-radius', 'border-start-start-radius'],
  ['border-top-right-radius', 'border-start-end-radius'],
  ['border-bottom-left-radius', 'border-end-start-radius'],
  ['border-bottom-right-radius', 'border-end-end-radius'],
  ['left', 'inset-inline-start'],
  ['right', 'inset-inline-end'],
]);

const PHYSICAL_CSS_VALUES = new Map<string, Map<string, string>>([
  [
    'text-align',
    new Map([
      ['left', 'start'],
      ['right', 'end'],
    ]),
  ],
  [
    'float',
    new Map([
      ['left', 'inline-start'],
      ['right', 'inline-end'],
    ]),
  ],
  [
    'clear',
    new Map([
      ['left', 'inline-start'],
      ['right', 'inline-end'],
    ]),
  ],
]);

const FOUR_VALUE_PROPERTIES: Array<[string, string, Sides, string]> = [
  ['margin', 'margin', 'trbl', 'margin-block and margin-inline'],
  ['padding', 'padding', 'trbl', 'padding-block and padding-inline'],
  ['inset', 'inset', 'trbl', 'inset-block and inset-inline'],
  ['border-width', 'borderWidth', 'trbl', 'border-block-width and border-inline-width'],
  ['border-color', 'borderColor', 'trbl', 'border-block-color and border-inline-color'],
  ['border-style', 'borderStyle', 'trbl', 'border-block-style and border-inline-style'],
  ['scroll-margin', 'scrollMargin', 'trbl', 'scroll-margin-block and scroll-margin-inline'],
  ['scroll-padding', 'scrollPadding', 'trbl', 'scroll-padding-block and scroll-padding-inline'],
  ['border-radius', 'borderRadius', 'corners', 'the logical corner properties'],
];
const FOUR_VALUE_CSS = new Map(
  FOUR_VALUE_PROPERTIES.map(([css, , sides, replacement]) => [css, { sides, replacement }]),
);
const FOUR_VALUE_JSX = new Map(
  FOUR_VALUE_PROPERTIES.map(([, jsx, sides, replacement]) => [jsx, { sides, replacement }]),
);

const SIMPLE_PHYSICAL_JSX = new Map<string, { replacement: string; rule: string }>([
  ['marginLeft', { replacement: 'marginInlineStart', rule: 'jsx:marginLeft' }],
  ['marginRight', { replacement: 'marginInlineEnd', rule: 'jsx:marginRight' }],
  ['paddingLeft', { replacement: 'paddingInlineStart', rule: 'jsx:paddingLeft' }],
  ['paddingRight', { replacement: 'paddingInlineEnd', rule: 'jsx:paddingRight' }],
  ['borderLeft', { replacement: 'borderInlineStart', rule: 'jsx:borderLeft' }],
  ['borderLeftWidth', { replacement: 'borderInlineStartWidth', rule: 'jsx:borderLeftWidth' }],
  ['borderLeftColor', { replacement: 'borderInlineStartColor', rule: 'jsx:borderLeftColor' }],
  ['borderLeftStyle', { replacement: 'borderInlineStartStyle', rule: 'jsx:borderLeftStyle' }],
  ['borderRight', { replacement: 'borderInlineEnd', rule: 'jsx:borderRight' }],
  ['borderRightWidth', { replacement: 'borderInlineEndWidth', rule: 'jsx:borderRightWidth' }],
  ['borderRightColor', { replacement: 'borderInlineEndColor', rule: 'jsx:borderRightColor' }],
  ['borderRightStyle', { replacement: 'borderInlineEndStyle', rule: 'jsx:borderRightStyle' }],
  [
    'borderTopLeftRadius',
    { replacement: 'borderStartStartRadius', rule: 'jsx:borderTopLeftRadius' },
  ],
  [
    'borderTopRightRadius',
    { replacement: 'borderStartEndRadius', rule: 'jsx:borderTopRightRadius' },
  ],
  [
    'borderBottomLeftRadius',
    { replacement: 'borderEndStartRadius', rule: 'jsx:borderBottomLeftRadius' },
  ],
  [
    'borderBottomRightRadius',
    { replacement: 'borderEndEndRadius', rule: 'jsx:borderBottomRightRadius' },
  ],
  ['left', { replacement: 'insetInlineStart', rule: 'jsx:left' }],
  ['right', { replacement: 'insetInlineEnd', rule: 'jsx:right' }],
]);
const PHYSICAL_JSX_VALUES = new Map<string, Map<string, string>>([
  [
    'textAlign',
    new Map([
      ['left', 'start'],
      ['right', 'end'],
    ]),
  ],
  [
    'float',
    new Map([
      ['left', 'inline-start'],
      ['right', 'inline-end'],
    ]),
  ],
  [
    'clear',
    new Map([
      ['left', 'inline-start'],
      ['right', 'inline-end'],
    ]),
  ],
]);

function relativePath(file: string): string {
  return relative(ROOT, file).split(sep).join('/');
}

function lineAt(sourceFile: ts.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function sourceExcerpt(source: string, start: number, end: number): string {
  const compact = source.slice(start, end).replace(/\s+/g, ' ').trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function makeProblem(
  file: string,
  line: number,
  text: string,
  message: string,
  rule: string,
): Problem {
  return { file: relativePath(file), line, text, message, rule };
}

function looksTechnical(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return true;
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return true;
  if (/^--[\w-]+$/.test(trimmed)) return true;
  if (/^[\d\s.,:/+\-—–_()[\]{}]+$/.test(trimmed)) return true;
  return !HAS_LETTERS.test(trimmed);
}

function normaliseVisibleText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function directiveFromComment(
  file: string,
  source: string,
  text: string,
  start: number,
  end: number,
  startLine: number,
  endLine: number,
  problems: Problem[],
): RtlDirective | null {
  const commentBody = text.startsWith('/*')
    ? text.slice(2, text.endsWith('*/') ? -2 : undefined)
    : text.startsWith('//')
      ? text.slice(2)
      : text;
  if (!RTL_OK.test(commentBody)) return null;
  const valid = RTL_OK_WITH_REASON.test(commentBody);
  if (!valid) {
    problems.push(
      makeProblem(
        file,
        startLine,
        sourceExcerpt(source, start, end),
        '`rtl-ok` comment needs a non-empty reason: `rtl-ok: reason`',
        'rtl-ok-reason',
      ),
    );
  }
  return { start, end, startLine, endLine, valid, used: false };
}

function attachedDirective(
  source: string,
  start: number,
  end: number,
  startLine: number,
  endLine: number,
  directives: RtlDirective[],
): RtlDirective | null {
  const leading = directives
    .filter(
      (directive) =>
        directive.valid &&
        directive.end <= start &&
        directive.endLine >= startLine - 1 &&
        source.slice(directive.end, start).trim() === '',
    )
    .sort((a, b) => b.end - a.end)[0];
  if (leading) return leading;
  return (
    directives
      .filter(
        (directive) =>
          directive.valid &&
          directive.start >= end &&
          directive.startLine <= endLine &&
          /^[\s;,]*$/.test(source.slice(end, directive.start)),
      )
      .sort((a, b) => a.start - b.start)[0] ?? null
  );
}

function reportUnusedDirectives(
  file: string,
  source: string,
  directives: RtlDirective[],
  problems: Problem[],
): void {
  for (const directive of directives) {
    if (!directive.valid || directive.used) continue;
    problems.push(
      makeProblem(
        file,
        directive.startLine,
        sourceExcerpt(source, directive.start, directive.end),
        '`rtl-ok` comment is not attached to a violation; move it to the exact node or remove it',
        'rtl-ok-unused',
      ),
    );
  }
}

function directionalShorthand(sides: Sides, value: string): { detail: string } | null {
  const parts = postcss.list.space(value.trim());
  if (parts.length !== 4) return null;
  if (sides === 'trbl') {
    if (parts[1] === parts[3]) return null;
    return { detail: `right ${parts[1]}, left ${parts[3]}` };
  }
  if (parts[0] === parts[1] && parts[3] === parts[2]) return null;
  return {
    detail: `top-left ${parts[0]}, top-right ${parts[1]}, bottom-right ${parts[2]}, bottom-left ${parts[3]}`,
  };
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function tsCommentDirectives(
  file: string,
  sourceFile: ts.SourceFile,
  source: string,
  problems: Problem[],
): RtlDirective[] {
  const directives: RtlDirective[] = [];
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue;
    }
    const start = scanner.getTokenPos();
    const end = scanner.getTextPos();
    const directive = directiveFromComment(
      file,
      source,
      scanner.getTokenText(),
      start,
      end,
      lineAt(sourceFile, start),
      lineAt(sourceFile, Math.max(start, end - 1)),
      problems,
    );
    if (directive) directives.push(directive);
  }
  return directives;
}

function propertyNameText(name: ts.PropertyName | ts.JsxAttributeName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) return fullyStaticString(name.expression);
  if (ts.isJsxNamespacedName(name)) return `${name.namespace.text}:${name.name.text}`;
  return null;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  for (;;) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      current = current.expression;
    } else {
      return current;
    }
  }
}

function literalFragments(expression: ts.Expression): string[] {
  const current = unwrapExpression(expression);
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
    return [current.text];
  }
  if (ts.isTemplateExpression(current)) {
    return [
      current.head.text,
      ...current.templateSpans.flatMap((span) => [
        ...literalFragments(span.expression),
        span.literal.text,
      ]),
    ];
  }
  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...literalFragments(current.left), ...literalFragments(current.right)];
  }
  if (ts.isConditionalExpression(current)) {
    return [...literalFragments(current.whenTrue), ...literalFragments(current.whenFalse)];
  }
  return [];
}

function fullyStaticString(expression: ts.Expression): string | null {
  const current = unwrapExpression(expression);
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
    return current.text;
  }
  if (ts.isTemplateExpression(current)) {
    let result = current.head.text;
    for (const span of current.templateSpans) {
      const substitution = fullyStaticString(span.expression);
      if (substitution === null) return null;
      result += substitution + span.literal.text;
    }
    return result;
  }
  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = fullyStaticString(current.left);
    const right = fullyStaticString(current.right);
    return left === null || right === null ? null : left + right;
  }
  return null;
}

function visibleLiteralValue(expression: ts.Expression): string | null {
  const value = normaliseVisibleText(literalFragments(expression).join(''));
  return looksTechnical(value) ? null : value;
}

function jsxInitializerExpression(initializer: ts.JsxAttributeValue): ts.Expression | null {
  if (ts.isStringLiteral(initializer)) return initializer;
  if (ts.isJsxExpression(initializer)) return initializer.expression ?? null;
  return null;
}

function collectInlineStyleObjects(
  expression: ts.Expression,
  objects: Set<ts.ObjectLiteralExpression>,
): void {
  const current = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(current)) {
    objects.add(current);
    for (const property of current.properties) {
      if (ts.isSpreadAssignment(property)) {
        collectInlineStyleObjects(property.expression, objects);
      }
    }
    return;
  }
  if (ts.isConditionalExpression(current)) {
    collectInlineStyleObjects(current.whenTrue, objects);
    collectInlineStyleObjects(current.whenFalse, objects);
    return;
  }
  if (
    ts.isBinaryExpression(current) &&
    (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      current.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      current.operatorToken.kind === ts.SyntaxKind.CommaToken)
  ) {
    collectInlineStyleObjects(current.left, objects);
    collectInlineStyleObjects(current.right, objects);
  }
}

function templateTokenText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (
    node.kind === ts.SyntaxKind.TemplateHead ||
    node.kind === ts.SyntaxKind.TemplateMiddle ||
    node.kind === ts.SyntaxKind.TemplateTail
  ) {
    return (node as ts.TemplateLiteralToken).text;
  }
  return null;
}

function checkComponent(file: string): Problem[] {
  const source = readFileSync(file, 'utf8');
  const scriptKind = extname(file).toLowerCase() === '.jsx' ? ts.ScriptKind.JSX : ts.ScriptKind.TSX;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const problems: Problem[] = [];
  const directives = tsCommentDirectives(file, sourceFile, source, problems);
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] }
  ).parseDiagnostics;

  if (parseDiagnostics && parseDiagnostics.length > 0) {
    for (const diagnostic of parseDiagnostics) {
      const start = diagnostic.start ?? 0;
      const length = Math.max(1, diagnostic.length ?? 1);
      problems.push(
        makeProblem(
          file,
          lineAt(sourceFile, start),
          sourceExcerpt(source, start, start + length),
          `component parse failed: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
          'parse-error',
        ),
      );
    }
    reportUnusedDirectives(file, source, directives, problems);
    return problems;
  }

  const inlineStyleObjects = new Set<ts.ObjectLiteralExpression>();
  const findInlineStyleObjects = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && propertyNameText(node.name) === 'style' && node.initializer) {
      const expression = jsxInitializerExpression(node.initializer);
      if (expression) collectInlineStyleObjects(expression, inlineStyleObjects);
    }
    ts.forEachChild(node, findInlineStyleObjects);
  };
  findInlineStyleObjects(sourceFile);

  const isAllowed = (...nodes: ts.Node[]): boolean => {
    for (const node of nodes) {
      const start = node.getStart(sourceFile);
      const end = node.end;
      const directive = attachedDirective(
        source,
        start,
        end,
        lineAt(sourceFile, start),
        lineAt(sourceFile, Math.max(start, end - 1)),
        directives,
      );
      if (directive) {
        directive.used = true;
        return true;
      }
    }
    return false;
  };

  const addNodeProblem = (node: ts.Node, message: string, rule: string, ...scope: ts.Node[]) => {
    if (isAllowed(node, ...scope)) return;
    const start = node.getStart(sourceFile);
    problems.push(
      makeProblem(
        file,
        lineAt(sourceFile, start),
        sourceExcerpt(source, start, node.end),
        message,
        rule,
      ),
    );
  };

  const visit = (node: ts.Node): void => {
    const rawLiteral = ts.isJsxText(node) ? node.getText(sourceFile) : templateTokenText(node);
    if (rawLiteral !== null && HEX.test(rawLiteral)) {
      addNodeProblem(
        node,
        'raw colour in a component — use a var(--token); a colour without a token is a defect (docs/BRAND.md layer 2)',
        'raw-hex',
        node.parent,
      );
    }

    if (ts.isJsxText(node)) {
      const value = normaliseVisibleText(node.getText(sourceFile));
      if (!looksTechnical(value)) {
        addNodeProblem(
          node,
          `text between tags "${value}" — move it to src/strings.ts (D12)`,
          'jsx-text',
        );
      }
    }

    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      const value = visibleLiteralValue(node.expression);
      if (value !== null) {
        addNodeProblem(
          node,
          `string expression rendered as text "${value}" — move it to src/strings.ts (D12)`,
          'jsx-expression-string',
        );
      }
    }

    if (ts.isJsxAttribute(node)) {
      const name = propertyNameText(node.name);
      if (name && VISIBLE_PROPS.has(name) && node.initializer) {
        const expression = jsxInitializerExpression(node.initializer);
        const value = expression ? visibleLiteralValue(expression) : null;
        if (value !== null) {
          addNodeProblem(
            node,
            `literal text in visible prop ${name}="${value}" — move it to src/strings.ts (D12)`,
            'visible-prop',
          );
        }
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name = propertyNameText(node.name);
      if (name && DISPLAYED_LABEL_KEYS.has(name)) {
        const value = visibleLiteralValue(node.initializer);
        if (value !== null) {
          addNodeProblem(
            node,
            `displayed label ${name}="${value}" — move it to src/strings.ts (D12)`,
            'label-key',
          );
        }
      }
    }

    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      ts.isObjectLiteralExpression(node.parent) &&
      inlineStyleObjects.has(node.parent)
    ) {
      const name = propertyNameText(node.name);
      if (ts.isComputedPropertyName(node.name) && name === null) {
        addNodeProblem(
          node,
          'computed inline-style key cannot be resolved statically — use a literal property name or a separately defined style object',
          'jsx-style-computed-key',
        );
      }

      if (name) {
        const physical = SIMPLE_PHYSICAL_JSX.get(name);
        if (physical) {
          addNodeProblem(
            node,
            `physical direction in an inline style — use ${physical.replacement}`,
            physical.rule,
          );
        }

        const directionalValues = PHYSICAL_JSX_VALUES.get(name);
        const staticValue = ts.isPropertyAssignment(node)
          ? fullyStaticString(node.initializer)
          : null;
        if (directionalValues && staticValue !== null) {
          const normalized = staticValue.trim().toLowerCase();
          const replacement = directionalValues.get(normalized);
          if (replacement) {
            addNodeProblem(
              node,
              `physical direction in an inline style — use ${name}: '${replacement}'`,
              `jsx:${name}:${normalized}`,
            );
          }
        }

        const shorthand = FOUR_VALUE_JSX.get(name);
        if (shorthand && staticValue !== null) {
          const detail = directionalShorthand(shorthand.sides, staticValue);
          if (detail) {
            addNodeProblem(
              node,
              `directional four-value ${name} in an inline style (${detail.detail}) — use ${shorthand.replacement}`,
              `four-value-inline:${name}`,
            );
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  reportUnusedDirectives(file, source, directives, problems);
  return problems;
}

function offsetAt(source: string, position: Position): number {
  if (typeof position.offset === 'number') return position.offset;
  let line = 1;
  let offset = 0;
  while (line < position.line) {
    const next = source.indexOf('\n', offset);
    if (next === -1) return source.length;
    offset = next + 1;
    line += 1;
  }
  return offset + position.column - 1;
}

type CssLocatedNode = AtRule | Comment | Declaration | Rule;

function cssNodeRange(source: string, node: CssLocatedNode): { start: number; end: number } {
  const startPosition = node.source?.start;
  if (!startPosition) return { start: 0, end: 0 };
  const start = offsetAt(source, startPosition);
  return { start, end: Math.min(source.length, start + node.toString().length) };
}

function checkStylesheet(file: string, options: ScanOptions): Problem[] {
  const source = readFileSync(file, 'utf8');
  const problems: Problem[] = [];
  if (extname(file).toLowerCase() === '.scss') {
    return [
      makeProblem(
        file,
        1,
        '',
        'SCSS encountered but no structural SCSS parser is installed; convert it to CSS or add a separately reviewed parser',
        'unsupported-scss',
      ),
    ];
  }

  let root: postcss.Root;
  try {
    root = postcss.parse(source, { from: file });
  } catch (error: unknown) {
    const syntaxError = error as { line?: number; reason?: string; message?: string };
    return [
      makeProblem(
        file,
        syntaxError.line ?? 1,
        '',
        `stylesheet parse failed: ${syntaxError.reason ?? syntaxError.message ?? String(error)}`,
        'css-parse-error',
      ),
    ];
  }

  const directives: RtlDirective[] = [];
  root.walkComments((comment) => {
    const range = cssNodeRange(source, comment);
    const directive = directiveFromComment(
      file,
      source,
      comment.text,
      range.start,
      range.end,
      comment.source?.start?.line ?? 1,
      comment.source?.end?.line ?? comment.source?.start?.line ?? 1,
      problems,
    );
    if (directive) directives.push(directive);
  });

  const addCssNodeProblem = (node: AtRule | Declaration | Rule, message: string, rule: string) => {
    const range = cssNodeRange(source, node);
    const startLine = node.source?.start?.line ?? 1;
    const endLine = node.source?.end?.line ?? startLine;
    const directive = attachedDirective(
      source,
      range.start,
      range.end,
      startLine,
      endLine,
      directives,
    );
    if (directive) {
      directive.used = true;
    } else {
      problems.push(
        makeProblem(file, startLine, sourceExcerpt(source, range.start, range.end), message, rule),
      );
    }
  };

  root.walkAtRules((atRule) => {
    if (HEX.test(`${atRule.name} ${atRule.params}`)) {
      addCssNodeProblem(
        atRule,
        'raw colour in a stylesheet at-rule — use a var(--token) or a narrowly attached reasoned exception',
        'raw-hex-css',
      );
    }
  });

  root.walkRules((rule) => {
    if (HEX.test(rule.selector)) {
      addCssNodeProblem(
        rule,
        'raw colour in a stylesheet selector — raw hex is permitted only in an approved token declaration',
        'raw-hex-css',
      );
    }
  });

  root.walkDecls((declaration) => {
    const addDeclarationProblem = (message: string, rule: string) => {
      addCssNodeProblem(declaration, message, rule);
    };

    const property = declaration.prop.toLowerCase();
    const physicalReplacement = PHYSICAL_CSS.get(property);
    if (physicalReplacement) {
      addDeclarationProblem(`physical direction — use ${physicalReplacement}`, property);
    }

    const directionalValues = PHYSICAL_CSS_VALUES.get(property);
    if (directionalValues) {
      const value = declaration.value.trim().toLowerCase();
      const replacement = directionalValues.get(value);
      if (replacement) {
        addDeclarationProblem(
          `physical direction — use ${property}: ${replacement}`,
          `${property}:${value}`,
        );
      }
    }

    const shorthand = FOUR_VALUE_CSS.get(property);
    if (shorthand) {
      const detail = directionalShorthand(shorthand.sides, declaration.value);
      if (detail) {
        addDeclarationProblem(
          `directional four-value ${property} shorthand (${detail.detail}) — use ${shorthand.replacement}`,
          `four-value-shorthand:${property}`,
        );
      }
    }

    if (HEX.test(declaration.prop) || HEX.test(declaration.value)) {
      const isApprovedToken =
        !HEX.test(declaration.prop) &&
        resolve(file) === resolve(options.tokenFile) &&
        declaration.prop.startsWith('--');
      if (!isApprovedToken) {
        addDeclarationProblem(
          'raw colour in a stylesheet — use a var(--token); tokens may be defined only in src/app/globals.css with their derivation (docs/BRAND.md layer 2)',
          'raw-hex-css',
        );
      }
    }
  });

  reportUnusedDirectives(file, source, directives, problems);
  return problems;
}

function checkFile(file: string, options: ScanOptions): Problem[] {
  const extension = extname(file).toLowerCase();
  return extension === '.tsx' || extension === '.jsx'
    ? checkComponent(file)
    : checkStylesheet(file, options);
}

async function scan(dir: string, options: ScanOptions): Promise<ScanResult> {
  const files = (await walk(dir)).filter((file) =>
    SCANNED_EXTENSIONS.has(extname(file).toLowerCase()),
  );
  return { files, problems: files.flatMap((file) => checkFile(file, options)) };
}

function report(problems: Problem[]): void {
  for (const item of problems) {
    console.error(`  ${item.file}:${item.line} [${item.rule}]`);
    if (item.text !== '') console.error(`    ${item.text}`);
    console.error(`    ${item.message}\n`);
  }
}

const REQUIRED_RULES = [
  ...PHYSICAL_CSS.keys(),
  ...[...PHYSICAL_CSS_VALUES.entries()].flatMap(([property, values]) =>
    [...values.keys()].map((value) => `${property}:${value}`),
  ),
  ...FOUR_VALUE_PROPERTIES.map(([property]) => `four-value-shorthand:${property}`),
  ...[...SIMPLE_PHYSICAL_JSX.values()].map(({ rule }) => rule),
  ...[...PHYSICAL_JSX_VALUES.entries()].flatMap(([property, values]) =>
    [...values.keys()].map((value) => `jsx:${property}:${value}`),
  ),
  ...FOUR_VALUE_PROPERTIES.map(([, property]) => `four-value-inline:${property}`),
  'visible-prop',
  'label-key',
  'jsx-text',
  'jsx-expression-string',
  'raw-hex',
  'raw-hex-css',
  'jsx-style-computed-key',
  'parse-error',
  'css-parse-error',
  'unsupported-scss',
  'rtl-ok-reason',
  'rtl-ok-unused',
];

const REQUIRED_CASES = [
  {
    description: 'shorthand physical inline-style property',
    file: 'scripts/fixtures/rtl-violations/ShorthandPhysicalStyle.tsx',
    rule: 'jsx:marginLeft',
    message: 'marginInlineStart',
  },
  {
    description: 'statically computed physical inline-style key',
    file: 'scripts/fixtures/rtl-violations/ComputedPhysicalStyle.tsx',
    rule: 'jsx:paddingRight',
    message: 'paddingInlineEnd',
  },
  {
    description: 'conditional physical inline-style object',
    file: 'scripts/fixtures/rtl-violations/ConditionalPhysicalStyle.tsx',
    rule: 'jsx:borderLeftWidth',
    message: 'borderInlineStartWidth',
  },
  {
    description: 'physical-value rule inside a conditional style object',
    file: 'scripts/fixtures/rtl-violations/ConditionalPhysicalStyle.tsx',
    rule: 'jsx:textAlign:left',
    message: "textAlign: 'start'",
  },
  {
    description: 'nested literal-spread physical inline-style object',
    file: 'scripts/fixtures/rtl-violations/SpreadPhysicalStyle.tsx',
    rule: 'jsx:marginRight',
    message: 'marginInlineEnd',
  },
  {
    description: 'four-value rule inside a nested literal style spread',
    file: 'scripts/fixtures/rtl-violations/SpreadPhysicalStyle.tsx',
    rule: 'four-value-inline:padding',
    message: 'padding-block and padding-inline',
  },
  {
    description: 'unresolved computed inline-style key fails closed',
    file: 'scripts/fixtures/rtl-violations/UnresolvedComputedStyle.tsx',
    rule: 'jsx-style-computed-key',
    message: 'cannot be resolved statically',
  },
  {
    description: 'raw hex in JSX text',
    file: 'scripts/fixtures/rtl-violations/RawHexJsxText.tsx',
    rule: 'raw-hex',
    message: '#fff',
  },
  {
    description: 'raw hex in CSS at-rule parameters',
    file: 'scripts/fixtures/rtl-violations/raw-hex-atrule.css',
    rule: 'raw-hex-css',
    message: '@supports',
  },
  {
    description: 'former multiline JSX-text gap',
    file: 'scripts/fixtures/rtl-violations/Variations.tsx',
    rule: 'jsx-text',
    message: 'This sentence is interface text',
  },
  {
    description: 'former multiline visible-prop gap',
    file: 'scripts/fixtures/rtl-violations/Variations.tsx',
    rule: 'visible-prop',
    message: 'Export to Excel',
  },
  {
    description: '.jsx structural coverage',
    file: 'scripts/fixtures/rtl-violations/StructuralJsx.jsx',
    rule: 'jsx-text',
    message: 'Visible JSX text in a JavaScript component',
  },
  {
    description: 'string-expression child',
    file: 'scripts/fixtures/rtl-violations/StructuralJsx.jsx',
    rule: 'jsx-expression-string',
    message: 'String-expression label',
  },
  {
    description: 'template child with a runtime interpolation',
    file: 'scripts/fixtures/rtl-violations/StructuralJsx.jsx',
    rule: 'jsx-expression-string',
    message: 'Template label for',
  },
  {
    description: 'malformed component fails closed',
    file: 'scripts/fixtures/rtl-violations/Malformed.tsx.txt',
    rule: 'parse-error',
    message: 'component parse failed',
  },
  {
    description: 'multiline CSS declaration',
    file: 'scripts/fixtures/rtl-violations/structural.css',
    rule: 'margin-left',
    message: 'physical direction',
  },
  {
    description: 'minified CSS declarations',
    file: 'scripts/fixtures/rtl-violations/structural.css',
    rule: 'padding-right',
    message: 'physical direction',
  },
  {
    description: 'component stylesheet custom-property colour bypass',
    file: 'scripts/fixtures/rtl-violations/structural.css',
    rule: 'raw-hex-css',
    message: '--component-colour',
  },
  {
    description: 'forged string exception cannot suppress',
    file: 'scripts/fixtures/rtl-violations/ExceptionForgery.tsx',
    rule: 'jsx:marginLeft',
    message: 'physical direction',
  },
  {
    description: 'reasonless exception fails closed',
    file: 'scripts/fixtures/rtl-violations/ExceptionForgery.tsx',
    rule: 'rtl-ok-reason',
    message: 'rtl-ok',
  },
  {
    description: 'distant exception fails closed',
    file: 'scripts/fixtures/rtl-violations/ExceptionForgery.tsx',
    rule: 'rtl-ok-unused',
    message: 'rtl-ok',
  },
  {
    description: 'malformed CSS fails closed',
    file: 'scripts/fixtures/rtl-violations/malformed.css.txt',
    rule: 'css-parse-error',
    message: 'stylesheet parse failed',
  },
  {
    description: 'SCSS fails closed without a structural parser',
    file: 'scripts/fixtures/rtl-violations/unsupported.scss',
    rule: 'unsupported-scss',
    message: 'SCSS encountered',
  },
] as const;

const REQUIRED_CLEAN_CASES = [
  {
    description: 'logical shorthand inline-style property',
    file: 'scripts/fixtures/rtl-clean/StyleBranchesClean.tsx',
    construct: 'style={{ marginInlineStart }}',
  },
  {
    description: 'statically computed logical inline-style key',
    file: 'scripts/fixtures/rtl-clean/StyleBranchesClean.tsx',
    construct: "['paddingInlineEnd']: 8",
  },
  {
    description: 'conditional logical inline-style object',
    file: 'scripts/fixtures/rtl-clean/StyleBranchesClean.tsx',
    construct: 'borderInlineStartWidth: 1',
  },
  {
    description: 'nested literal-spread logical inline-style object',
    file: 'scripts/fixtures/rtl-clean/StyleBranchesClean.tsx',
    construct: '...{ marginInlineEnd: 8 }',
  },
  {
    description: 'logical physical-value counterparts',
    file: 'scripts/fixtures/rtl-clean/StyleBranchesClean.tsx',
    construct: "textAlign: 'start'",
  },
  {
    description: 'symmetric four-value shorthand remains accepted',
    file: 'scripts/fixtures/rtl-clean/StyleBranchesClean.tsx',
    construct: "padding: '0 8px 0 8px'",
  },
  {
    description: 'raw hex in an actual component comment remains ignored',
    file: 'scripts/fixtures/rtl-clean/StyleBranchesClean.tsx',
    construct: '// A raw colour such as #fff inside an actual source comment is not code.',
  },
  {
    description: 'raw hex in an actual JSX comment remains ignored',
    file: 'scripts/fixtures/rtl-clean/StyleBranchesClean.tsx',
    construct: '{/* Raw colour #abcdef inside an actual JSX comment is not visible text. */}',
  },
  {
    description: 'approved token declaration remains accepted',
    file: 'scripts/fixtures/rtl-clean/approved-tokens.css',
    construct: '--fixture-surface: #ffffff',
  },
  {
    description: 'raw hex in an actual CSS comment remains ignored',
    file: 'scripts/fixtures/rtl-clean/clean.css',
    construct: '/* Raw colour text such as #abcdef inside an actual CSS comment is not code. */',
  },
  {
    description: 'reasoned component exception remains accepted',
    file: 'scripts/fixtures/rtl-clean/Clean.tsx',
    construct: '#214B4B',
  },
  {
    description: 'reasoned CSS declaration exception remains accepted',
    file: 'scripts/fixtures/rtl-clean/clean.css',
    construct: 'color: #214b4b',
  },
] as const;

const EXPECTED_SELF_TEST_TOTALS = {
  rules: 78,
  rejectingFixtures: 21,
  cleanFixtures: 5,
  findings: 142,
} as const;

async function selfTest(): Promise<void> {
  const violationRoot = join(ROOT, 'scripts', 'fixtures', 'rtl-violations');
  const cleanRoot = join(ROOT, 'scripts', 'fixtures', 'rtl-clean');
  const broken = await scan(violationRoot, { tokenFile: join(violationRoot, '__never__.css') });
  const clean = await scan(cleanRoot, { tokenFile: join(cleanRoot, 'approved-tokens.css') });
  const malformedComponent = join(violationRoot, 'Malformed.tsx.txt');
  const malformedStylesheet = join(violationRoot, 'malformed.css.txt');
  broken.files.push(malformedComponent, malformedStylesheet);
  broken.problems.push(
    ...checkComponent(malformedComponent),
    ...checkStylesheet(malformedStylesheet, { tokenFile: join(violationRoot, '__never__.css') }),
  );
  const caught = new Set(broken.problems.map((item) => item.rule));
  const missedRules = REQUIRED_RULES.filter((rule) => !caught.has(rule));
  const filesWithoutFindings = broken.files
    .map(relativePath)
    .filter((file) => !broken.problems.some((item) => item.file === file));
  const missedCases = REQUIRED_CASES.filter(
    (expected) =>
      !broken.problems.some(
        (item) =>
          item.file === expected.file &&
          item.rule === expected.rule &&
          (item.message.includes(expected.message) || item.text.includes(expected.message)),
      ),
  );
  const cleanFiles = new Set(clean.files.map(relativePath));
  const missedCleanCases = REQUIRED_CLEAN_CASES.filter((expected) => {
    if (!cleanFiles.has(expected.file)) return true;
    const source = readFileSync(join(ROOT, expected.file), 'utf8');
    return !source.includes(expected.construct);
  });
  const multipleFile = 'scripts/fixtures/rtl-violations/MultipleViolations.tsx';
  const multipleFindings = broken.problems.filter((item) => item.file === multipleFile).length;

  let failed = false;
  if (missedRules.length > 0) {
    console.error(`\nself-test: ${missedRules.length} rule(s) did not catch a fixture:\n`);
    for (const rule of missedRules) console.error(`  ${rule}`);
    failed = true;
  }
  if (filesWithoutFindings.length > 0) {
    console.error(
      `\nself-test: ${filesWithoutFindings.length} negative fixture(s) were accepted:\n`,
    );
    for (const file of filesWithoutFindings) console.error(`  ${file}`);
    failed = true;
  }
  if (missedCases.length > 0) {
    console.error(`\nself-test: ${missedCases.length} structural case(s) were not proved:\n`);
    for (const item of missedCases) console.error(`  ${item.description}`);
    failed = true;
  }
  if (missedCleanCases.length > 0) {
    console.error(`\nself-test: ${missedCleanCases.length} clean case(s) were not proved:\n`);
    for (const item of missedCleanCases) console.error(`  ${item.description}`);
    failed = true;
  }
  if (multipleFindings < 3) {
    console.error('\nself-test: multiple violations in one parsed file were not all reported.');
    failed = true;
  }
  const actualTotals = {
    rules: REQUIRED_RULES.length,
    rejectingFixtures: broken.files.length,
    cleanFixtures: clean.files.length,
    findings: broken.problems.length,
  };
  for (const key of Object.keys(EXPECTED_SELF_TEST_TOTALS) as Array<
    keyof typeof EXPECTED_SELF_TEST_TOTALS
  >) {
    if (actualTotals[key] !== EXPECTED_SELF_TEST_TOTALS[key]) {
      console.error(
        `\nself-test: expected ${EXPECTED_SELF_TEST_TOTALS[key]} ${key}, received ${actualTotals[key]}.`,
      );
      failed = true;
    }
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
    `check:rtl self-test — ${actualTotals.rules} structural rules proved across ` +
      `${actualTotals.rejectingFixtures} rejecting fixtures; ${actualTotals.cleanFixtures} clean fixtures accepted.`,
  );
  console.log(
    `                     ${actualTotals.findings} expected findings; both former multiline gaps enforced; 0 known gaps.`,
  );
}

async function main(): Promise<void> {
  if (process.argv.includes('--self-test')) {
    await selfTest();
    return;
  }

  const { files, problems } = await scan(SOURCE_ROOT, { tokenFile: TOKEN_FILE });
  if (problems.length === 0) {
    console.log(`check:rtl — ${files.length} files, no problems.`);
    return;
  }

  console.error(`\ncheck:rtl found ${problems.length} problem(s):\n`);
  report(problems);
  console.error('A deliberate exception must be an immediately attached source comment');
  console.error('with a non-empty `rtl-ok: reason`; strings and distant comments do not count.\n');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
