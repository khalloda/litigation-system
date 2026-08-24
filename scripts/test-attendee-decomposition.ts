import assert from 'node:assert/strict';

import {
  decomposeAttendeeCell,
  decomposeAttendeeCells,
  mergeAttendeeDecompositions,
  reconstructAttendeeCell,
  type AttendeeCellDecomposition,
  type AttendeeDecompositionRules,
} from './lib/attendee-decomposition';
import {
  ATTENDEE_DECOMPOSITION_FIXTURES,
  ATTENDEE_FIXTURE_RULES,
} from './attendee-decomposition-fixtures';

let assertions = 0;

function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  assertions += 1;
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert.deepStrictEqual(actual, expected, message);
  assertions += 1;
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function projected(cell: AttendeeCellDecomposition) {
  return cell.fragments.map(({ kind, raw, value, rule, personKey }) => ({
    kind,
    raw,
    value,
    rule,
    ...(personKey ? { personKey } : {}),
  }));
}

function stableView(cells: readonly AttendeeCellDecomposition[]) {
  return cells.map((cell) => ({
    cellId: cell.cellId,
    originalCellSha256: cell.originalCellSha256,
    fragments: cell.fragments.map(({ fragmentId, kind, raw, rule, personKey }) => ({
      fragmentId,
      kind,
      raw,
      rule,
      personKey,
    })),
  }));
}

console.log('Attendee decomposition fixture comparison:');

for (const fixture of ATTENDEE_DECOMPOSITION_FIXTURES) {
  const cell = decomposeAttendeeCell(fixture.source, ATTENDEE_FIXTURE_RULES);
  equal(projected(cell), fixture.expected, `${fixture.fixtureClass}: unexpected decomposition`);
  equal(
    reconstructAttendeeCell(cell),
    fixture.source.originalCell,
    `${fixture.fixtureClass}: source text was not reconstructed byte for byte`,
  );
  equal(
    cell.requiresReview,
    fixture.expected.some((fragment) => fragment.kind === 'ambiguous'),
    `${fixture.fixtureClass}: review flag does not reflect its ambiguous fragments`,
  );

  let expectedOffset = 0;
  let expectedLine = 1;
  const fragmentIds = new Set<string>();
  for (const fragment of cell.fragments) {
    equal(fragment.sequence, fragmentIds.size + 1, `${fixture.fixtureClass}: sequence gap`);
    equal(fragment.startOffset, expectedOffset, `${fixture.fixtureClass}: offset gap`);
    equal(
      fixture.source.originalCell.slice(fragment.startOffset, fragment.endOffset),
      fragment.raw,
      `${fixture.fixtureClass}: fragment does not point to its exact source span`,
    );
    equal(fragment.line, expectedLine, `${fixture.fixtureClass}: incorrect line number`);
    equal(fragment.cellId, cell.cellId, `${fixture.fixtureClass}: fragment lost cell identity`);
    equal(
      fragment.originalCellSha256,
      cell.originalCellSha256,
      `${fixture.fixtureClass}: fragment lost original-cell fingerprint`,
    );
    equal(
      fragment.sourceRecordKey,
      fixture.source.sourceRecordKey,
      `${fixture.fixtureClass}: fragment lost durable source-record identity`,
    );
    equal(
      fragment.sourceTable,
      fixture.source.sourceTable,
      `${fixture.fixtureClass}: fragment lost its source table`,
    );
    equal(
      fragment.sourceColumn,
      fixture.source.sourceColumn,
      `${fixture.fixtureClass}: fragment lost its source column`,
    );
    check(!fragmentIds.has(fragment.fragmentId), `${fixture.fixtureClass}: duplicate fragment id`);
    fragmentIds.add(fragment.fragmentId);
    expectedOffset = fragment.endOffset;
    if (fragment.rule === 'line_break') expectedLine += 1;
  }
  equal(
    expectedOffset,
    fixture.source.originalCell.length,
    `${fixture.fixtureClass}: fragments do not cover the complete original cell`,
  );

  const before = JSON.stringify(fixture.source.originalCell);
  const after = cell.fragments
    .map((fragment) => `${fragment.kind}:${JSON.stringify(fragment.raw)}`)
    .join(' | ');
  console.log(`- ${fixture.fixtureClass}: ${before} -> ${after}`);
}

const fixtureCells = ATTENDEE_DECOMPOSITION_FIXTURES.map((fixture) => fixture.source);
const ordered = decomposeAttendeeCells(fixtureCells, ATTENDEE_FIXTURE_RULES);
const reordered = decomposeAttendeeCells([...fixtureCells].reverse(), ATTENDEE_FIXTURE_RULES);
equal(
  stableView(reordered),
  stableView(ordered),
  'reordering source records changed durable cell or fragment identities',
);

const identityFixture = required(
  ATTENDEE_DECOMPOSITION_FIXTURES[13],
  'identity fixture is missing',
).source;
const movedTrace = Object.freeze({
  ...identityFixture,
  sourceExtractionSha256: 'f'.repeat(64),
  sourceFile: 'a-renamed-and-reordered-fixture.csv',
  sourceRowNumber: 9999,
});
const originalIdentity = decomposeAttendeeCell(identityFixture, ATTENDEE_FIXTURE_RULES);
const movedIdentity = decomposeAttendeeCell(movedTrace, ATTENDEE_FIXTURE_RULES);
equal(
  movedIdentity.cellId,
  originalIdentity.cellId,
  'filename or row number changed cell identity',
);
equal(
  movedIdentity.fragments.map((fragment) => fragment.fragmentId),
  originalIdentity.fragments.map((fragment) => fragment.fragmentId),
  'filename, row number or extraction order changed fragment identities',
);

const mergedOnce = mergeAttendeeDecompositions([], ordered);
const mergedTwice = mergeAttendeeDecompositions(mergedOnce, ordered);
equal(mergedTwice.length, mergedOnce.length, 'a duplicate execution created duplicate cells');
equal(
  new Set(mergedTwice.flatMap((cell) => cell.fragments.map((fragment) => fragment.fragmentId)))
    .size,
  mergedTwice.reduce((sum, cell) => sum + cell.fragments.length, 0),
  'a duplicate execution created duplicate fragments',
);

assert.throws(
  () => {
    const duplicate = required(fixtureCells[0], 'duplicate fixture is missing');
    decomposeAttendeeCells([duplicate, duplicate], ATTENDEE_FIXTURE_RULES);
  },
  /Duplicate attendee source cell identity/u,
  'a duplicated source cell in one batch must fail',
);
assertions += 1;

const changedUnderSameIdentity = decomposeAttendeeCell(
  Object.freeze({ ...identityFixture, originalCell: `${identityFixture.originalCell}!` }),
  ATTENDEE_FIXTURE_RULES,
);
assert.throws(
  () => mergeAttendeeDecompositions([originalIdentity], [changedUnderSameIdentity]),
  /Conflicting attendee decomposition/u,
  'changed source text under one durable identity must not silently overwrite',
);
assertions += 1;

const ambiguousFixture = required(
  ATTENDEE_DECOMPOSITION_FIXTURES[18],
  'ambiguous fixture is missing',
).source;
const ambiguousResult = decomposeAttendeeCell(ambiguousFixture, ATTENDEE_FIXTURE_RULES);
check(
  ambiguousResult.fragments.some((fragment) => fragment.kind === 'ambiguous'),
  'the unrecognised fixture was not quarantined as ambiguous',
);
check(
  ambiguousResult.fragments
    .filter((fragment) => fragment.kind === 'ambiguous')
    .every((fragment) => fragment.reviewRequired),
  'an ambiguous fragment did not require review',
);

const previouslyUnknown = Object.freeze({
  ...required(ATTENDEE_DECOMPOSITION_FIXTURES[24], 'review fixture is missing').source,
  sourceRecordKey: `${'a'.repeat(64)}:000001`,
  sourceColumn: 'حاضر 4',
  originalCell: 'UNRESOLVED TEST FRAGMENT',
});
const unresolved = decomposeAttendeeCell(previouslyUnknown, ATTENDEE_FIXTURE_RULES);
const newlyKnownPeople = new Map(ATTENDEE_FIXTURE_RULES.knownPeople);
newlyKnownPeople.set('UNRESOLVED TEST FRAGMENT', {
  personKey: 'person:fixture-newly-reviewed',
  canonicalName: 'UNRESOLVED TEST FRAGMENT',
});
const reviewedRules: AttendeeDecompositionRules = Object.freeze({
  ...ATTENDEE_FIXTURE_RULES,
  knownPeople: newlyKnownPeople,
});
const resolved = decomposeAttendeeCell(previouslyUnknown, reviewedRules);
const resolvedFragment = required(resolved.fragments[0], 'resolved fragment is missing');
const unresolvedFragment = required(unresolved.fragments[0], 'unresolved fragment is missing');
equal(
  resolvedFragment.fragmentId,
  unresolvedFragment.fragmentId,
  'classifying a reviewed span changed its durable fragment identity',
);
equal(resolvedFragment.kind, 'person', 'an exact reviewed alias did not become a person');

check(Object.isFrozen(originalIdentity), 'cell output is mutable');
check(Object.isFrozen(originalIdentity.source), 'source trace is mutable');
check(Object.isFrozen(originalIdentity.fragments), 'fragment collection is mutable');
check(
  originalIdentity.fragments.every((fragment) => Object.isFrozen(fragment)),
  'a fragment is mutable',
);
assert.throws(() => {
  (originalIdentity as unknown as { originalCellSha256: string }).originalCellSha256 = 'changed';
}, TypeError);
assertions += 1;

assert.throws(
  () =>
    decomposeAttendeeCell(
      Object.freeze({ ...identityFixture, sourceRecordKey: 'fixture-row-12' }),
      ATTENDEE_FIXTURE_RULES,
    ),
  /durable SHA-256 record key/u,
  'a non-durable source key must be refused',
);
assertions += 1;

const conflictingRules: AttendeeDecompositionRules = Object.freeze({
  ...ATTENDEE_FIXTURE_RULES,
  knownNotes: new Set([...ATTENDEE_FIXTURE_RULES.knownNotes, 'هاني الدالي']),
});
assert.throws(
  () => decomposeAttendeeCell(identityFixture, conflictingRules),
  /both a person alias and a note/u,
  'overlapping rule classes must fail instead of silently choosing one',
);
assertions += 1;

console.log(
  `PASS: ${String(ATTENDEE_DECOMPOSITION_FIXTURES.length)} fixture classes, ${String(assertions)} assertions.`,
);
