import { createHash } from 'node:crypto';

export type AttendeeFragmentKind =
  'person' | 'date' | 'title' | 'role' | 'placeholder' | 'note' | 'ambiguous' | 'separator';

export type AttendeeFragmentRule =
  | 'exact_person_alias'
  | 'reviewed_person_alias'
  | 'reviewed_not_a_name'
  | 'calendar_date'
  | 'known_title'
  | 'known_role'
  | 'known_placeholder'
  | 'known_note'
  | 'known_parenthetical_note'
  | 'known_parenthetical_role'
  | 'line_break'
  | 'punctuation_separator'
  | 'horizontal_whitespace'
  | 'unclassified_review';

export type ExactPersonMatch = Readonly<{
  personKey: string;
  canonicalName: string;
}>;

export type AttendeeDecompositionRules = Readonly<{
  /** Exact aliases only. The live application must build this from person_name_alias. */
  knownPeople: ReadonlyMap<string, ExactPersonMatch>;
  /** Values already ruled to be placeholders, not names. */
  knownPlaceholders: ReadonlySet<string>;
  /** Complete note fragments already ruled by the firm. */
  knownNotes: ReadonlySet<string>;
  /** Complete role fragments. No role is inferred from an unknown word. */
  knownRoles: ReadonlySet<string>;
  /** Exact prefixes such as د. and أ.; longest is tried first. */
  knownTitles: readonly string[];
}>;

export type AttendeeSourceCell = Readonly<{
  sourceTable: string;
  sourceRecordKey: string;
  sourceExtractionSha256: string;
  sourceColumn: string;
  originalCell: string;
  /** Human trace only. Neither value participates in durable identity. */
  sourceFile?: string;
  sourceRowNumber?: number;
}>;

export type AttendeeFragment = Readonly<{
  fragmentId: string;
  cellId: string;
  sourceTable: string;
  sourceRecordKey: string;
  sourceColumn: string;
  originalCellSha256: string;
  sequence: number;
  line: number;
  startOffset: number;
  endOffset: number;
  raw: string;
  value: string;
  kind: AttendeeFragmentKind;
  rule: AttendeeFragmentRule;
  reviewRequired: boolean;
  personKey?: string;
  canonicalName?: string;
}>;

export type AttendeeCellDecomposition = Readonly<{
  version: 1;
  cellId: string;
  originalCellSha256: string;
  source: AttendeeSourceCell;
  fragments: readonly AttendeeFragment[];
  requiresReview: boolean;
}>;

export type ReviewedAttendeeAnswer = Readonly<{
  answer: 'person' | 'split' | 'not a name';
  people: readonly ExactPersonMatch[];
}>;

type DraftFragment = {
  line: number;
  startOffset: number;
  endOffset: number;
  raw: string;
  value: string;
  kind: AttendeeFragmentKind;
  rule: AttendeeFragmentRule;
  reviewRequired: boolean;
  personKey?: string;
  canonicalName?: string;
};

const HORIZONTAL_WHITESPACE = /[ \t\f\v\u00a0]/u;
const ONLY_HORIZONTAL_WHITESPACE = /^[ \t\f\v\u00a0]+$/u;
const OUTER_HORIZONTAL_WHITESPACE = /^([ \t\f\v\u00a0]*)(.*?)([ \t\f\v\u00a0]*)$/u;
const MULTIPLE_HORIZONTAL_WHITESPACE = /[ \t\f\v\u00a0]{2,}/u;
const DATE_TOKEN =
  '(?:[0-9٠-٩]{4}\\s*[\\/.\\-]\\s*[0-9٠-٩]{1,2}\\s*[\\/.\\-]\\s*[0-9٠-٩]{1,2}|[0-9٠-٩]{1,2}\\s*[\\/.\\-]\\s*[0-9٠-٩]{1,2}\\s*[\\/.\\-]\\s*[0-9٠-٩]{4})';
const DATE_AT_START = new RegExp(`^(${DATE_TOKEN})([ \\t\\f\\v\\u00a0]+)(.+)$`, 'u');
const DATE_AT_END = new RegExp(`^(.+)([ \\t\\f\\v\\u00a0]+)(${DATE_TOKEN})$`, 'u');

function sha256(parts: readonly string[]): string {
  const canonical = parts.map((part) => `${Buffer.byteLength(part, 'utf8')}:${part}`).join('');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function arabicDigitsToAscii(value: string): string {
  return value.replace(/[٠-٩]/gu, (digit) => String(digit.codePointAt(0)! - 0x660));
}

function isCalendarDate(value: string): boolean {
  const ascii = arabicDigitsToAscii(value).replace(/\s/gu, '');
  const yearFirst = /^(\d{4})([\/.\-])(\d{1,2})\2(\d{1,2})$/u.exec(ascii);
  const dayFirst = /^(\d{1,2})([\/.\-])(\d{1,2})\2(\d{4})$/u.exec(ascii);

  let year: number;
  let month: number;
  let day: number;
  if (yearFirst) {
    year = Number(yearFirst[1]);
    month = Number(yearFirst[3]);
    day = Number(yearFirst[4]);
  } else if (dayFirst) {
    day = Number(dayFirst[1]);
    month = Number(dayFirst[3]);
    year = Number(dayFirst[4]);
  } else {
    return false;
  }

  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function makeDraft(
  raw: string,
  startOffset: number,
  line: number,
  kind: AttendeeFragmentKind,
  rule: AttendeeFragmentRule,
  value = raw,
  person?: ExactPersonMatch,
): DraftFragment {
  return {
    line,
    startOffset,
    endOffset: startOffset + raw.length,
    raw,
    value,
    kind,
    rule,
    reviewRequired: kind === 'ambiguous',
    ...(person ? { personKey: person.personKey, canonicalName: person.canonicalName } : {}),
  };
}

function whitespaceDraft(raw: string, startOffset: number, line: number): DraftFragment {
  return makeDraft(raw, startOffset, line, 'separator', 'horizontal_whitespace');
}

function exactClassification(
  core: string,
  startOffset: number,
  line: number,
  rules: AttendeeDecompositionRules,
): DraftFragment | undefined {
  if (rules.knownPlaceholders.has(core)) {
    return makeDraft(core, startOffset, line, 'placeholder', 'known_placeholder');
  }
  if (rules.knownNotes.has(core)) {
    return makeDraft(core, startOffset, line, 'note', 'known_note');
  }
  if (rules.knownRoles.has(core)) {
    return makeDraft(core, startOffset, line, 'role', 'known_role');
  }
  if (rules.knownTitles.includes(core)) {
    return makeDraft(core, startOffset, line, 'title', 'known_title');
  }
  const person = rules.knownPeople.get(core);
  if (person) {
    return makeDraft(core, startOffset, line, 'person', 'exact_person_alias', core, person);
  }
  if (isCalendarDate(core)) {
    return makeDraft(core, startOffset, line, 'date', 'calendar_date');
  }
  return undefined;
}

function splitKnownPrefix(
  core: string,
  startOffset: number,
  line: number,
  candidates: readonly string[],
  rules: AttendeeDecompositionRules,
): DraftFragment[] | undefined {
  for (const candidate of candidates) {
    if (!core.startsWith(candidate)) continue;
    const rest = core.slice(candidate.length);
    const whitespace = /^[ \t\f\v\u00a0]+/u.exec(rest)?.[0];
    if (!whitespace) continue;
    const first = exactClassification(candidate, startOffset, line, rules);
    if (!first) continue;
    const remainder = rest.slice(whitespace.length);
    return [
      first,
      whitespaceDraft(whitespace, startOffset + candidate.length, line),
      ...classifyCore(remainder, startOffset + candidate.length + whitespace.length, line, rules),
    ];
  }
  return undefined;
}

function splitKnownSuffix(
  core: string,
  startOffset: number,
  line: number,
  candidates: readonly string[],
  rules: AttendeeDecompositionRules,
): DraftFragment[] | undefined {
  for (const candidate of candidates) {
    if (!core.endsWith(candidate)) continue;
    const prefixWithWhitespace = core.slice(0, -candidate.length);
    const match = /^(.*?)([ \t\f\v\u00a0]+)$/u.exec(prefixWithWhitespace);
    const prefix = match?.[1];
    const whitespace = match?.[2];
    if (!prefix || !whitespace) continue;
    const last = exactClassification(
      candidate,
      startOffset + prefixWithWhitespace.length,
      line,
      rules,
    );
    if (!last) continue;
    return [
      ...classifyCore(prefix, startOffset, line, rules),
      whitespaceDraft(whitespace, startOffset + prefix.length, line),
      last,
    ];
  }
  return undefined;
}

function classifyCore(
  core: string,
  startOffset: number,
  line: number,
  rules: AttendeeDecompositionRules,
): DraftFragment[] {
  if (core.length === 0) return [];

  const exact = exactClassification(core, startOffset, line, rules);
  if (exact) return [exact];

  const parenthetical = /^(.*?)([ \t\f\v\u00a0]*)(\(([^()]*)\))$/u.exec(core);
  const parentheticalPrefix = parenthetical?.[1];
  const parentheticalSpacing = parenthetical?.[2];
  const bracketed = parenthetical?.[3];
  const parentheticalInner = parenthetical?.[4];
  if (
    parentheticalPrefix &&
    parentheticalSpacing !== undefined &&
    bracketed &&
    parentheticalInner !== undefined
  ) {
    const inner = parentheticalInner.trim();
    const note = rules.knownNotes.has(inner);
    const role = rules.knownRoles.has(inner);
    if (note || role) {
      const prefix = classifyCore(parentheticalPrefix, startOffset, line, rules);
      if (prefix.some((fragment) => fragment.kind === 'person')) {
        return [
          ...prefix,
          ...(parentheticalSpacing
            ? [
                whitespaceDraft(
                  parentheticalSpacing,
                  startOffset + parentheticalPrefix.length,
                  line,
                ),
              ]
            : []),
          makeDraft(
            bracketed,
            startOffset + parentheticalPrefix.length + parentheticalSpacing.length,
            line,
            note ? 'note' : 'role',
            note ? 'known_parenthetical_note' : 'known_parenthetical_role',
            inner,
          ),
        ];
      }
    }
  }

  const titles = [...rules.knownTitles].sort((left, right) => right.length - left.length);
  const titlePrefix = splitKnownPrefix(core, startOffset, line, titles, rules);
  if (titlePrefix) return titlePrefix;

  const placeholders = [...rules.knownPlaceholders].sort(
    (left, right) => right.length - left.length,
  );
  const placeholderPrefix = splitKnownPrefix(core, startOffset, line, placeholders, rules);
  if (placeholderPrefix) return placeholderPrefix;

  const dateAtStart = DATE_AT_START.exec(core);
  const startDate = dateAtStart?.[1];
  const startSpacing = dateAtStart?.[2];
  const startRemainder = dateAtStart?.[3];
  if (startDate && startSpacing && startRemainder && isCalendarDate(startDate)) {
    return [
      makeDraft(startDate, startOffset, line, 'date', 'calendar_date'),
      whitespaceDraft(startSpacing, startOffset + startDate.length, line),
      ...classifyCore(
        startRemainder,
        startOffset + startDate.length + startSpacing.length,
        line,
        rules,
      ),
    ];
  }

  const dateAtEnd = DATE_AT_END.exec(core);
  const endPrefix = dateAtEnd?.[1];
  const endSpacing = dateAtEnd?.[2];
  const endDate = dateAtEnd?.[3];
  if (endPrefix && endSpacing && endDate && isCalendarDate(endDate)) {
    return [
      ...classifyCore(endPrefix, startOffset, line, rules),
      whitespaceDraft(endSpacing, startOffset + endPrefix.length, line),
      makeDraft(
        endDate,
        startOffset + endPrefix.length + endSpacing.length,
        line,
        'date',
        'calendar_date',
      ),
    ];
  }

  const roles = [...rules.knownRoles].sort((left, right) => right.length - left.length);
  const rolePrefix = splitKnownPrefix(core, startOffset, line, roles, rules);
  if (rolePrefix) return rolePrefix;
  const roleSuffix = splitKnownSuffix(core, startOffset, line, roles, rules);
  if (roleSuffix) return roleSuffix;

  const repeatedWhitespace = MULTIPLE_HORIZONTAL_WHITESPACE.exec(core);
  const repeated = repeatedWhitespace?.[0];
  if (repeatedWhitespace?.index !== undefined && repeated) {
    const before = core.slice(0, repeatedWhitespace.index);
    const after = core.slice(repeatedWhitespace.index + repeated.length);
    if (before.length > 0 && after.length > 0) {
      return [
        ...classifyCore(before, startOffset, line, rules),
        whitespaceDraft(repeated, startOffset + repeatedWhitespace.index, line),
        ...classifyCore(
          after,
          startOffset + repeatedWhitespace.index + repeated.length,
          line,
          rules,
        ),
      ];
    }
  }

  return [makeDraft(core, startOffset, line, 'ambiguous', 'unclassified_review')];
}

function classifySpan(
  raw: string,
  startOffset: number,
  line: number,
  rules: AttendeeDecompositionRules,
): DraftFragment[] {
  if (raw.length === 0) return [];
  if (ONLY_HORIZONTAL_WHITESPACE.test(raw)) {
    return [whitespaceDraft(raw, startOffset, line)];
  }

  const match = OUTER_HORIZONTAL_WHITESPACE.exec(raw);
  if (!match) {
    throw new Error('Internal error: attendee span whitespace could not be parsed.');
  }
  const leading = match[1];
  const core = match[2];
  const trailing = match[3];
  if (leading === undefined || core === undefined || trailing === undefined) {
    throw new Error('Internal error: attendee span whitespace captures are incomplete.');
  }
  return [
    ...(leading ? [whitespaceDraft(leading, startOffset, line)] : []),
    ...classifyCore(core, startOffset + leading.length, line, rules),
    ...(trailing
      ? [whitespaceDraft(trailing, startOffset + leading.length + core.length, line)]
      : []),
  ];
}

function nearestNonWhitespace(line: string, index: number, direction: -1 | 1): string {
  for (let cursor = index + direction; cursor >= 0 && cursor < line.length; cursor += direction) {
    const candidate = line[cursor] ?? '';
    if (!HORIZONTAL_WHITESPACE.test(candidate)) return candidate;
  }
  return '';
}

function isPunctuationSeparator(line: string, index: number): boolean {
  const character = line[index] ?? '';
  if ('،,؛;|•'.includes(character)) return true;
  if (character === '/') {
    const before = nearestNonWhitespace(line, index, -1);
    const after = nearestNonWhitespace(line, index, 1);
    return !/[0-9٠-٩]/u.test(before) || !/[0-9٠-٩]/u.test(after);
  }
  if ('&+'.includes(character)) {
    return (
      index > 0 &&
      index + 1 < line.length &&
      HORIZONTAL_WHITESPACE.test(line[index - 1] ?? '') &&
      HORIZONTAL_WHITESPACE.test(line[index + 1] ?? '')
    );
  }
  if ('-–—'.includes(character)) {
    return (
      index > 0 &&
      index + 1 < line.length &&
      HORIZONTAL_WHITESPACE.test(line[index - 1] ?? '') &&
      HORIZONTAL_WHITESPACE.test(line[index + 1] ?? '')
    );
  }
  return false;
}

function decomposeLine(
  raw: string,
  startOffset: number,
  line: number,
  rules: AttendeeDecompositionRules,
): DraftFragment[] {
  // An explicitly ruled complete value outranks its punctuation. This keeps a
  // reviewed note containing a comma, or an exact English alias such as a
  // suffix name, from being split merely because the character is present.
  const whole = classifySpan(raw, startOffset, line, rules);
  if (whole.length > 0 && whole.every((fragment) => fragment.kind !== 'ambiguous')) {
    return whole;
  }

  const result: DraftFragment[] = [];
  let cursor = 0;

  for (let index = 0; index < raw.length; index += 1) {
    if (!isPunctuationSeparator(raw, index)) continue;

    result.push(...classifySpan(raw.slice(cursor, index), startOffset + cursor, line, rules));
    let separatorEnd = index + 1;
    while (separatorEnd < raw.length && HORIZONTAL_WHITESPACE.test(raw[separatorEnd] ?? '')) {
      separatorEnd += 1;
    }
    const separator = raw.slice(index, separatorEnd);
    result.push(
      makeDraft(separator, startOffset + index, line, 'separator', 'punctuation_separator'),
    );
    cursor = separatorEnd;
    index = separatorEnd - 1;
  }

  result.push(...classifySpan(raw.slice(cursor), startOffset + cursor, line, rules));
  return result;
}

function draftFragments(original: string, rules: AttendeeDecompositionRules): DraftFragment[] {
  const result: DraftFragment[] = [];
  const newline = /\r\n|\r|\n/gu;
  let cursor = 0;
  let line = 1;

  for (const match of original.matchAll(newline)) {
    const index = match.index;
    result.push(...decomposeLine(original.slice(cursor, index), cursor, line, rules));
    result.push(makeDraft(match[0], index, line, 'separator', 'line_break'));
    cursor = index + match[0].length;
    line += 1;
  }
  result.push(...decomposeLine(original.slice(cursor), cursor, line, rules));
  return result;
}

function validateSource(source: AttendeeSourceCell): void {
  if (source.sourceTable.trim() === '') throw new Error('sourceTable is required.');
  if (source.sourceColumn.trim() === '') throw new Error('sourceColumn is required.');
  if (!/^[0-9a-f]{64}:[0-9]{6}$/u.test(source.sourceRecordKey)) {
    throw new Error('sourceRecordKey must be the durable SHA-256 record key.');
  }
  if (!/^[0-9a-fA-F]{64}$/u.test(source.sourceExtractionSha256)) {
    throw new Error('sourceExtractionSha256 must be a SHA-256 fingerprint.');
  }
  if (source.sourceFile !== undefined && source.sourceFile.length === 0) {
    throw new Error('sourceFile must be non-empty when supplied.');
  }
  if (
    source.sourceRowNumber !== undefined &&
    (!Number.isInteger(source.sourceRowNumber) || source.sourceRowNumber < 1)
  ) {
    throw new Error('sourceRowNumber must be a positive integer when supplied.');
  }
}

function validateRules(rules: AttendeeDecompositionRules): void {
  const seen = new Map<string, string>();
  const register = (value: string, category: string): void => {
    if (value.length === 0 || value.trim() !== value) {
      throw new Error(`${category} contains a blank or outer-whitespace value.`);
    }
    const prior = seen.get(value);
    if (prior) {
      throw new Error(
        `Attendee rule value ${JSON.stringify(value)} is both ${prior} and ${category}.`,
      );
    }
    seen.set(value, category);
  };

  for (const [alias, person] of rules.knownPeople) {
    register(alias, 'a person alias');
    if (person.personKey.trim() === '' || person.canonicalName.trim() === '') {
      throw new Error(`Person alias ${JSON.stringify(alias)} has an incomplete exact match.`);
    }
  }
  for (const value of rules.knownPlaceholders) register(value, 'a placeholder');
  for (const value of rules.knownNotes) register(value, 'a note');
  for (const value of rules.knownRoles) register(value, 'a role');
  for (const value of rules.knownTitles) register(value, 'a title');
}

function validateCoverage(original: string, fragments: readonly DraftFragment[]): void {
  let cursor = 0;
  for (const fragment of fragments) {
    if (fragment.startOffset !== cursor || fragment.endOffset <= fragment.startOffset) {
      throw new Error(`Attendee decomposition has a gap or overlap at offset ${String(cursor)}.`);
    }
    if (original.slice(fragment.startOffset, fragment.endOffset) !== fragment.raw) {
      throw new Error(`Attendee decomposition changed source text at offset ${String(cursor)}.`);
    }
    cursor = fragment.endOffset;
  }
  if (cursor !== original.length) {
    throw new Error(
      `Attendee decomposition stopped at ${String(cursor)} of ${String(original.length)} characters.`,
    );
  }
}

function finaliseDecomposition(
  source: AttendeeSourceCell,
  drafts: readonly DraftFragment[],
): AttendeeCellDecomposition {
  const sourceCopy = Object.freeze({ ...source });
  const cellId = sha256([
    'attendee-cell-v1',
    source.sourceTable,
    source.sourceRecordKey,
    source.sourceColumn,
  ]);
  const originalCellSha256 = sha256(['attendee-cell-content-v1', source.originalCell]);
  validateCoverage(source.originalCell, drafts);

  const fragments = drafts.map((draft, index) =>
    Object.freeze({
      ...draft,
      fragmentId: sha256([
        'attendee-fragment-v1',
        cellId,
        String(draft.startOffset),
        String(draft.endOffset),
        draft.raw,
      ]),
      cellId,
      sourceTable: source.sourceTable,
      sourceRecordKey: source.sourceRecordKey,
      sourceColumn: source.sourceColumn,
      originalCellSha256,
      sequence: index + 1,
    }),
  );

  return Object.freeze({
    version: 1 as const,
    cellId,
    originalCellSha256,
    source: sourceCopy,
    fragments: Object.freeze(fragments),
    requiresReview: fragments.some((fragment) => fragment.reviewRequired),
  });
}

function reviewedNotNameDrafts(
  original: string,
  rules: AttendeeDecompositionRules,
): DraftFragment[] {
  const reviewedNotes = new Set(rules.knownNotes);
  for (const line of original.split(/\r\n|\r|\n/gu)) {
    const core = OUTER_HORIZONTAL_WHITESPACE.exec(line)?.[2] ?? '';
    if (
      core !== '' &&
      !rules.knownPlaceholders.has(core) &&
      !rules.knownTitles.includes(core) &&
      !rules.knownRoles.has(core) &&
      !isCalendarDate(core)
    ) {
      reviewedNotes.add(core);
    }
  }
  const reviewedRules: AttendeeDecompositionRules = Object.freeze({
    ...rules,
    knownPeople: new Map(),
    knownNotes: reviewedNotes,
  });
  return draftFragments(original, reviewedRules).map((fragment) =>
    fragment.kind === 'note' ? { ...fragment, rule: 'reviewed_not_a_name' as const } : fragment,
  );
}

type AliasCandidate = Readonly<{
  start: number;
  end: number;
  alias: string;
  person: ExactPersonMatch;
}>;

function isWordCharacter(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

function reviewedAliasCandidates(
  fragment: DraftFragment,
  expectedPeople: ReadonlySet<string>,
  rules: AttendeeDecompositionRules,
): AliasCandidate[] {
  const candidates: AliasCandidate[] = [];
  for (const [alias, person] of rules.knownPeople) {
    if (!expectedPeople.has(person.personKey)) continue;
    let cursor = 0;
    while (cursor <= fragment.raw.length - alias.length) {
      const localStart = fragment.raw.indexOf(alias, cursor);
      if (localStart < 0) break;
      const localEnd = localStart + alias.length;
      const before = fragment.raw[localStart - 1] ?? '';
      const after = fragment.raw[localEnd] ?? '';
      if ((!before || !isWordCharacter(before)) && (!after || !isWordCharacter(after))) {
        candidates.push({
          start: fragment.startOffset + localStart,
          end: fragment.startOffset + localEnd,
          alias,
          person,
        });
      }
      cursor = localStart + 1;
    }
  }
  return candidates.sort(
    (left, right) =>
      left.start - right.start ||
      right.end - right.start - (left.end - left.start) ||
      compareText(left.alias, right.alias),
  );
}

function refineReviewedPeople(
  drafts: readonly DraftFragment[],
  answer: ReviewedAttendeeAnswer,
  rules: AttendeeDecompositionRules,
): DraftFragment[] {
  const expectedKeys = answer.people.map((person) => person.personKey);
  if (new Set(expectedKeys).size !== expectedKeys.length) {
    throw new Error('A reviewed attendee answer repeats a person in its ordered answer list.');
  }
  const expectedPeople = new Set(expectedKeys);
  const result: DraftFragment[] = [];

  for (const fragment of drafts) {
    if (fragment.kind !== 'ambiguous') {
      result.push(fragment);
      continue;
    }
    const candidates = reviewedAliasCandidates(fragment, expectedPeople, rules);
    const selected: AliasCandidate[] = [];
    for (const candidate of candidates) {
      const prior = selected[selected.length - 1];
      if (prior && candidate.start < prior.end) {
        if (
          candidate.start === prior.start &&
          candidate.end === prior.end &&
          candidate.person.personKey !== prior.person.personKey
        ) {
          throw new Error(
            `Reviewed attendee alias ${JSON.stringify(candidate.alias)} resolves to two people.`,
          );
        }
        continue;
      }
      selected.push(candidate);
    }
    if (selected.length === 0) {
      result.push(fragment);
      continue;
    }

    let cursor = fragment.startOffset;
    for (const candidate of selected) {
      if (candidate.start > cursor) {
        const raw = fragment.raw.slice(
          cursor - fragment.startOffset,
          candidate.start - fragment.startOffset,
        );
        result.push(makeDraft(raw, cursor, fragment.line, 'ambiguous', 'unclassified_review'));
      }
      result.push(
        makeDraft(
          candidate.alias,
          candidate.start,
          fragment.line,
          'person',
          'reviewed_person_alias',
          candidate.alias,
          candidate.person,
        ),
      );
      cursor = candidate.end;
    }
    if (cursor < fragment.endOffset) {
      result.push(
        makeDraft(
          fragment.raw.slice(cursor - fragment.startOffset),
          cursor,
          fragment.line,
          'ambiguous',
          'unclassified_review',
        ),
      );
    }
  }

  const actualKeys: string[] = [];
  for (const fragment of result) {
    if (fragment.kind !== 'person' || fragment.personKey === undefined) continue;
    if (
      actualKeys[actualKeys.length - 1] !== fragment.personKey &&
      !actualKeys.includes(fragment.personKey)
    ) {
      actualKeys.push(fragment.personKey);
    }
  }
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, i) => key !== expectedKeys[i])
  ) {
    throw new Error(
      `Reviewed attendee people do not match the source in order: expected ${expectedKeys.join(', ')}, found ${actualKeys.join(', ')}.`,
    );
  }
  return result;
}

export function decomposeAttendeeCell(
  source: AttendeeSourceCell,
  rules: AttendeeDecompositionRules,
): AttendeeCellDecomposition {
  validateSource(source);
  validateRules(rules);
  const drafts = draftFragments(source.originalCell, rules);
  return finaliseDecomposition(source, drafts);
}

/**
 * Apply one exact firm answer to the fixture-proven decomposition. The answer
 * can select only people whose exact aliases occur in the source. Repeated
 * source occurrences remain repeated spans; the answer list is compared to
 * the ordered first occurrence of each person.
 */
export function decomposeReviewedAttendeeCell(
  source: AttendeeSourceCell,
  rules: AttendeeDecompositionRules,
  answer: ReviewedAttendeeAnswer,
): AttendeeCellDecomposition {
  validateSource(source);
  validateRules(rules);
  if (answer.answer === 'not a name') {
    if (answer.people.length !== 0) {
      throw new Error('A not-a-name attendee answer cannot identify a person.');
    }
    return finaliseDecomposition(source, reviewedNotNameDrafts(source.originalCell, rules));
  }
  if (answer.people.length === 0) {
    throw new Error('A person or split attendee answer must identify at least one person.');
  }
  if (answer.answer === 'person' && answer.people.length !== 1) {
    throw new Error('A person attendee answer must identify exactly one person.');
  }
  if (answer.answer === 'split' && answer.people.length < 2) {
    throw new Error('A split attendee answer must identify at least two people.');
  }
  const expected = new Set(answer.people.map((person) => person.personKey));
  const reviewedPeople = new Map(
    [...rules.knownPeople].filter(([, person]) => expected.has(person.personKey)),
  );
  const reviewedRules: AttendeeDecompositionRules = Object.freeze({
    ...rules,
    knownPeople: reviewedPeople,
  });
  const drafts = refineReviewedPeople(
    draftFragments(source.originalCell, reviewedRules),
    answer,
    reviewedRules,
  );
  return finaliseDecomposition(source, drafts);
}

export function decomposeAttendeeCells(
  sources: readonly AttendeeSourceCell[],
  rules: AttendeeDecompositionRules,
): readonly AttendeeCellDecomposition[] {
  const result = sources.map((source) => decomposeAttendeeCell(source, rules));
  const seen = new Set<string>();
  for (const cell of result) {
    if (seen.has(cell.cellId)) {
      throw new Error(`Duplicate attendee source cell identity: ${cell.cellId}`);
    }
    seen.add(cell.cellId);
  }
  return Object.freeze(result.sort((left, right) => compareText(left.cellId, right.cellId)));
}

export function reconstructAttendeeCell(cell: AttendeeCellDecomposition): string {
  return cell.fragments.map((fragment) => fragment.raw).join('');
}

/**
 * Fixture-safe model of the future database upsert. Running the same input a
 * second time is a no-op; a changed payload under the same durable identity is
 * a hard failure instead of a silent overwrite.
 */
export function mergeAttendeeDecompositions(
  existing: readonly AttendeeCellDecomposition[],
  incoming: readonly AttendeeCellDecomposition[],
): readonly AttendeeCellDecomposition[] {
  const byId = new Map<string, AttendeeCellDecomposition>();
  for (const cell of [...existing, ...incoming]) {
    const prior = byId.get(cell.cellId);
    if (!prior) {
      byId.set(cell.cellId, cell);
      continue;
    }
    const priorSignature = JSON.stringify({
      originalCellSha256: prior.originalCellSha256,
      fragments: prior.fragments.map(
        ({
          fragmentId,
          sequence,
          line,
          startOffset,
          endOffset,
          raw,
          value,
          kind,
          rule,
          reviewRequired,
          personKey,
          canonicalName,
        }) => ({
          fragmentId,
          sequence,
          line,
          startOffset,
          endOffset,
          raw,
          value,
          kind,
          rule,
          reviewRequired,
          personKey,
          canonicalName,
        }),
      ),
    });
    const nextSignature = JSON.stringify({
      originalCellSha256: cell.originalCellSha256,
      fragments: cell.fragments.map(
        ({
          fragmentId,
          sequence,
          line,
          startOffset,
          endOffset,
          raw,
          value,
          kind,
          rule,
          reviewRequired,
          personKey,
          canonicalName,
        }) => ({
          fragmentId,
          sequence,
          line,
          startOffset,
          endOffset,
          raw,
          value,
          kind,
          rule,
          reviewRequired,
          personKey,
          canonicalName,
        }),
      ),
    });
    if (priorSignature !== nextSignature) {
      throw new Error(`Conflicting attendee decomposition for durable cell ${cell.cellId}.`);
    }
  }
  return Object.freeze(
    [...byId.values()].sort((left, right) => compareText(left.cellId, right.cellId)),
  );
}
