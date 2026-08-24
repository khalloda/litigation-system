import type {
  AttendeeDecompositionRules,
  AttendeeFragmentKind,
  AttendeeFragmentRule,
  AttendeeSourceCell,
  ExactPersonMatch,
} from './lib/attendee-decomposition';

export type ExpectedAttendeePart = Readonly<{
  kind: AttendeeFragmentKind;
  raw: string;
  value: string;
  rule: AttendeeFragmentRule;
  personKey?: string;
}>;

export type AttendeeDecompositionFixture = Readonly<{
  fixtureClass: string;
  source: AttendeeSourceCell;
  expected: readonly ExpectedAttendeePart[];
}>;

const people = new Map<string, ExactPersonMatch>([
  [
    'محمد عبد العزيز',
    { personKey: 'person:mohamed-abdelaziz', canonicalName: 'محمد عبد العزيز عبد الحافظ' },
  ],
  ['إيهاب حمدي', { personKey: 'person:ehab-hamdy', canonicalName: 'إيهاب حمدي' }],
  ['أحمد عبد الله', { personKey: 'person:ahmed-abdallah', canonicalName: 'أحمد عبد الله' }],
  ['هاني الدالي', { personKey: 'person:hany-eldaly', canonicalName: 'هاني الدالي' }],
  ['محمود علي', { personKey: 'person:mahmoud-ali', canonicalName: 'محمود علي' }],
  ['هاني سري الدين', { personKey: 'person:hany-sarie-eldin', canonicalName: 'هاني سري الدين' }],
  ['هاني سري الدينِ', { personKey: 'person:hany-sarie-eldin', canonicalName: 'هاني سري الدين' }],
  ['TEST ATTENDEE', { personKey: 'person:fixture-english', canonicalName: 'TEST ATTENDEE' }],
  [
    'TEST ATTENDEE, JR',
    { personKey: 'person:fixture-english-suffix', canonicalName: 'TEST ATTENDEE, JR' },
  ],
]);

export const ATTENDEE_FIXTURE_RULES: AttendeeDecompositionRules = Object.freeze({
  knownPeople: people,
  knownPlaceholders: new Set([
    '**',
    'لا يوجد حضور',
    'لا يوجد',
    'غير معروف',
    'غير مسجل',
    'unknown',
    'not recorded',
  ]),
  knownNotes: new Set([
    'إجازة العيد',
    'ستؤجل إدارياً',
    'متابعة',
    'متابعة للشطب',
    'تليفونياً',
    'administrative note',
    'administrative note, keep together',
  ]),
  knownRoles: new Set(['Lawyer', 'Observer']),
  knownTitles: Object.freeze(['د.', 'أ.', 'أ.د.', 'المستشار', 'الأستاذ']),
});

function source(index: number, originalCell: string): AttendeeSourceCell {
  return Object.freeze({
    sourceTable: 'الجلسات',
    sourceRecordKey: `${index.toString(16).padStart(64, '0')}:000001`,
    // The Access extraction records this fingerprint in uppercase.
    sourceExtractionSha256: 'E'.repeat(64),
    sourceColumn: index % 2 === 0 ? 'الحاضر' : 'حاضر 1',
    originalCell,
    sourceFile: 'fixture-only.csv',
    sourceRowNumber: index,
  });
}

const person = (raw: string, personKey: string): ExpectedAttendeePart => ({
  kind: 'person',
  raw,
  value: raw,
  rule: 'exact_person_alias',
  personKey,
});

const separator = (
  raw: string,
  rule: 'line_break' | 'punctuation_separator' | 'horizontal_whitespace',
): ExpectedAttendeePart => ({ kind: 'separator', raw, value: raw, rule });

const simple = (
  kind: Exclude<AttendeeFragmentKind, 'person' | 'separator'>,
  raw: string,
  rule: AttendeeFragmentRule,
  value = raw,
): ExpectedAttendeePart => ({ kind, raw, value, rule });

export const ATTENDEE_DECOMPOSITION_FIXTURES: readonly AttendeeDecompositionFixture[] =
  Object.freeze([
    {
      fixtureClass: 'multiple names separated by CRLF, with a title',
      source: source(1, 'محمد عبد العزيز\r\nأ. إيهاب حمدي'),
      expected: [
        person('محمد عبد العزيز', 'person:mohamed-abdelaziz'),
        separator('\r\n', 'line_break'),
        simple('title', 'أ.', 'known_title'),
        separator(' ', 'horizontal_whitespace'),
        person('إيهاب حمدي', 'person:ehab-hamdy'),
      ],
    },
    {
      fixtureClass: 'Arabic comma between people',
      source: source(2, 'أحمد عبد الله، محمد عبد العزيز'),
      expected: [
        person('أحمد عبد الله', 'person:ahmed-abdallah'),
        separator('، ', 'punctuation_separator'),
        person('محمد عبد العزيز', 'person:mohamed-abdelaziz'),
      ],
    },
    {
      fixtureClass: 'English comma and semicolon with mixed Arabic and English names',
      source: source(3, 'TEST ATTENDEE, محمد عبد العزيز; إيهاب حمدي'),
      expected: [
        person('TEST ATTENDEE', 'person:fixture-english'),
        separator(', ', 'punctuation_separator'),
        person('محمد عبد العزيز', 'person:mohamed-abdelaziz'),
        separator('; ', 'punctuation_separator'),
        person('إيهاب حمدي', 'person:ehab-hamdy'),
      ],
    },
    {
      fixtureClass: 'Arabic semicolon between people',
      source: source(4, 'محمد عبد العزيز؛إيهاب حمدي'),
      expected: [
        person('محمد عبد العزيز', 'person:mohamed-abdelaziz'),
        separator('؛', 'punctuation_separator'),
        person('إيهاب حمدي', 'person:ehab-hamdy'),
      ],
    },
    {
      fixtureClass: 'slash and pipe separators that are not dates',
      source: source(5, 'محمد عبد العزيز/إيهاب حمدي|TEST ATTENDEE'),
      expected: [
        person('محمد عبد العزيز', 'person:mohamed-abdelaziz'),
        separator('/', 'punctuation_separator'),
        person('إيهاب حمدي', 'person:ehab-hamdy'),
        separator('|', 'punctuation_separator'),
        person('TEST ATTENDEE', 'person:fixture-english'),
      ],
    },
    {
      fixtureClass: 'ampersand and plus separators surrounded by whitespace',
      source: source(6, 'محمد عبد العزيز & إيهاب حمدي + TEST ATTENDEE'),
      expected: [
        person('محمد عبد العزيز', 'person:mohamed-abdelaziz'),
        separator(' ', 'horizontal_whitespace'),
        separator('& ', 'punctuation_separator'),
        person('إيهاب حمدي', 'person:ehab-hamdy'),
        separator(' ', 'horizontal_whitespace'),
        separator('+ ', 'punctuation_separator'),
        person('TEST ATTENDEE', 'person:fixture-english'),
      ],
    },
    {
      fixtureClass: 'date preceding a name on another line',
      source: source(7, '2017/09/27\r\nمحمود علي'),
      expected: [
        simple('date', '2017/09/27', 'calendar_date'),
        separator('\r\n', 'line_break'),
        person('محمود علي', 'person:mahmoud-ali'),
      ],
    },
    {
      fixtureClass: 'date following a name on the same line',
      source: source(8, 'محمود علي 2018/02/21'),
      expected: [
        person('محمود علي', 'person:mahmoud-ali'),
        separator(' ', 'horizontal_whitespace'),
        simple('date', '2018/02/21', 'calendar_date'),
      ],
    },
    {
      fixtureClass: 'professional title attached to a known name',
      source: source(9, 'د. هاني سري الدين'),
      expected: [
        simple('title', 'د.', 'known_title'),
        separator(' ', 'horizontal_whitespace'),
        person('هاني سري الدين', 'person:hany-sarie-eldin'),
      ],
    },
    {
      fixtureClass: 'professional role following a known name',
      source: source(10, 'هاني الدالي Lawyer'),
      expected: [
        person('هاني الدالي', 'person:hany-eldaly'),
        separator(' ', 'horizontal_whitespace'),
        simple('role', 'Lawyer', 'known_role'),
      ],
    },
    {
      fixtureClass: 'Arabic and English placeholders',
      source: source(11, '**\r\nلا يوجد حضور\r\nnot recorded'),
      expected: [
        simple('placeholder', '**', 'known_placeholder'),
        separator('\r\n', 'line_break'),
        simple('placeholder', 'لا يوجد حضور', 'known_placeholder'),
        separator('\r\n', 'line_break'),
        simple('placeholder', 'not recorded', 'known_placeholder'),
      ],
    },
    {
      fixtureClass: 'administrative notes on separate lines',
      source: source(12, 'إجازة العيد\r\nستؤجل إدارياً'),
      expected: [
        simple('note', 'إجازة العيد', 'known_note'),
        separator('\r\n', 'line_break'),
        simple('note', 'ستؤجل إدارياً', 'known_note'),
      ],
    },
    {
      fixtureClass: 'duplicate person occurrences remain separate',
      source: source(13, 'هاني الدالي\r\n2019/01/31\r\nهاني الدالي'),
      expected: [
        person('هاني الدالي', 'person:hany-eldaly'),
        separator('\r\n', 'line_break'),
        simple('date', '2019/01/31', 'calendar_date'),
        separator('\r\n', 'line_break'),
        person('هاني الدالي', 'person:hany-eldaly'),
      ],
    },
    {
      fixtureClass: 'placeholder, date and name mixed in one cell',
      source: source(14, '**\r\n2018/03/06\r\nهاني الدالي'),
      expected: [
        simple('placeholder', '**', 'known_placeholder'),
        separator('\r\n', 'line_break'),
        simple('date', '2018/03/06', 'calendar_date'),
        separator('\r\n', 'line_break'),
        person('هاني الدالي', 'person:hany-eldaly'),
      ],
    },
    {
      fixtureClass: 'empty line and irregular outer whitespace',
      source: source(15, ' **\r\n\r\n1/11/2017\r\nمحمود علي  '),
      expected: [
        separator(' ', 'horizontal_whitespace'),
        simple('placeholder', '**', 'known_placeholder'),
        separator('\r\n', 'line_break'),
        separator('\r\n', 'line_break'),
        simple('date', '1/11/2017', 'calendar_date'),
        separator('\r\n', 'line_break'),
        person('محمود علي', 'person:mahmoud-ali'),
        separator('  ', 'horizontal_whitespace'),
      ],
    },
    {
      fixtureClass: 'known parenthetical note kept beside the person',
      source: source(16, 'محمد عبد العزيز (تليفونياً)'),
      expected: [
        person('محمد عبد العزيز', 'person:mohamed-abdelaziz'),
        separator(' ', 'horizontal_whitespace'),
        simple('note', '(تليفونياً)', 'known_parenthetical_note', 'تليفونياً'),
      ],
    },
    {
      fixtureClass: 'Arabic conjunction is not guessed as a separator',
      source: source(17, 'محمد عبد العزيز وأ. إيهاب حمدي'),
      expected: [simple('ambiguous', 'محمد عبد العزيز وأ. إيهاب حمدي', 'unclassified_review')],
    },
    {
      fixtureClass: 'known name embedded in prose remains ambiguous',
      source: source(18, 'متابعة فقط بعد الجلسة (هاني الدالي) **'),
      expected: [
        simple('ambiguous', 'متابعة فقط بعد الجلسة (هاني الدالي) **', 'unclassified_review'),
      ],
    },
    {
      fixtureClass: 'unrecognised separated fragment is quarantined',
      source: source(19, 'محمود علي، UNRESOLVED TEST FRAGMENT'),
      expected: [
        person('محمود علي', 'person:mahmoud-ali'),
        separator('، ', 'punctuation_separator'),
        simple('ambiguous', 'UNRESOLVED TEST FRAGMENT', 'unclassified_review'),
      ],
    },
    {
      fixtureClass: 'Arabic diacritic remains byte-for-byte unchanged',
      source: source(20, 'هاني سري الدينِ، أحمد عبد الله'),
      expected: [
        person('هاني سري الدينِ', 'person:hany-sarie-eldin'),
        separator('، ', 'punctuation_separator'),
        person('أحمد عبد الله', 'person:ahmed-abdallah'),
      ],
    },
    {
      fixtureClass: 'Arabic-Indic date digits remain unchanged',
      source: source(21, '٠٦/٠٣/٢٠١٨\r\nهاني الدالي'),
      expected: [
        simple('date', '٠٦/٠٣/٢٠١٨', 'calendar_date'),
        separator('\r\n', 'line_break'),
        person('هاني الدالي', 'person:hany-eldaly'),
      ],
    },
    {
      fixtureClass: 'invalid calendar date is not accepted as a date',
      source: source(22, '2018/02/31\r\nهاني الدالي'),
      expected: [
        simple('ambiguous', '2018/02/31', 'unclassified_review'),
        separator('\r\n', 'line_break'),
        person('هاني الدالي', 'person:hany-eldaly'),
      ],
    },
    {
      fixtureClass: 'date slashes are not treated as person separators',
      source: source(23, '2018/03/06'),
      expected: [simple('date', '2018/03/06', 'calendar_date')],
    },
    {
      fixtureClass: 'repeated whitespace separates a known name and known note',
      source: source(24, 'هاني الدالي    متابعة للشطب'),
      expected: [
        person('هاني الدالي', 'person:hany-eldaly'),
        separator('    ', 'horizontal_whitespace'),
        simple('note', 'متابعة للشطب', 'known_note'),
      ],
    },
    {
      fixtureClass: 'unknown name after a recognised title stays ambiguous',
      source: source(25, 'المستشار UNRESOLVED TEST FRAGMENT'),
      expected: [
        simple('title', 'المستشار', 'known_title'),
        separator(' ', 'horizontal_whitespace'),
        simple('ambiguous', 'UNRESOLVED TEST FRAGMENT', 'unclassified_review'),
      ],
    },
    {
      fixtureClass: 'bare LF line breaks remain distinct',
      source: source(26, 'د. أحمد عبد الله\nإيهاب حمدي'),
      expected: [
        simple('title', 'د.', 'known_title'),
        separator(' ', 'horizontal_whitespace'),
        person('أحمد عبد الله', 'person:ahmed-abdallah'),
        separator('\n', 'line_break'),
        person('إيهاب حمدي', 'person:ehab-hamdy'),
      ],
    },
    {
      fixtureClass: 'bare CR line breaks remain distinct',
      source: source(27, '**\r2018/01/08\rهاني الدالي'),
      expected: [
        simple('placeholder', '**', 'known_placeholder'),
        separator('\r', 'line_break'),
        simple('date', '2018/01/08', 'calendar_date'),
        separator('\r', 'line_break'),
        person('هاني الدالي', 'person:hany-eldaly'),
      ],
    },
    {
      fixtureClass: 'spaced dash separator is distinct from a date dash',
      source: source(28, 'محمد عبد العزيز - إيهاب حمدي'),
      expected: [
        person('محمد عبد العزيز', 'person:mohamed-abdelaziz'),
        separator(' ', 'horizontal_whitespace'),
        separator('- ', 'punctuation_separator'),
        person('إيهاب حمدي', 'person:ehab-hamdy'),
      ],
    },
    {
      fixtureClass: 'punctuation inside a complete ruled note does not split it',
      source: source(29, 'administrative note, keep together'),
      expected: [simple('note', 'administrative note, keep together', 'known_note')],
    },
    {
      fixtureClass: 'punctuation inside an exact person alias does not split it',
      source: source(30, 'TEST ATTENDEE, JR'),
      expected: [person('TEST ATTENDEE, JR', 'person:fixture-english-suffix')],
    },
  ]);
