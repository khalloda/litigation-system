export const HEARING_FIELDS = [
  'hearing_date',
  'next_hearing_date',
  'action_id',
  'decision',
  'outcome',
  'court_id',
  'circuit',
  'notes',
] as const;
export type HearingValues = Partial<
  Record<(typeof HEARING_FIELDS)[number] | 'matter_id', string | number | null>
>;
export type HearingAttendeeInput = { id: number | null; person_id: number | null };
export type HearingMutationCode =
  'invalid' | 'archived' | 'stale' | 'submission' | 'session' | 'not-found' | 'generic';
export class HearingMutationError extends Error {
  constructor(
    public code: HearingMutationCode,
    public field = '',
  ) {
    super('Hearing mutation: ' + code);
  }
}
function bad(field = ''): never {
  throw new HearingMutationError('invalid', field);
}
function object(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    bad();
  return value as Record<string, unknown>;
}
function positive(value: unknown, nullable = true): number | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647)
    bad();
  return value;
}
export function parseHearingMutationInput(operation: 'create' | 'update', input: unknown) {
  const raw = object(input),
    allowed = new Set(['id', 'version', 'submission', 'values', 'attendees']);
  if (Object.keys(raw).some((k) => !allowed.has(k))) bad();
  const id = positive(raw.id);
  if ((operation === 'create') !== (id === null)) bad();
  if (
    id === null
      ? raw.version !== null
      : typeof raw.version !== 'string' ||
        !/^[1-9][0-9]{0,18}$/u.test(raw.version) ||
        BigInt(raw.version) > 9223372036854775807n
  )
    bad();
  if (
    typeof raw.submission !== 'string' ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(raw.submission)
  )
    bad();
  const entries = Object.entries(object(raw.values));
  const fields = new Set<string>(HEARING_FIELDS);
  if (operation === 'create') fields.add('matter_id');
  const values: HearingValues = {};
  for (const [key, value] of entries) {
    if (!fields.has(key)) bad(key);
    if (key.endsWith('_id')) positive(value);
    else if (value !== null) {
      if (
        typeof value !== 'string' ||
        [...value].length > 10000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
      )
        bad(key);
      if (key.endsWith('_date')) {
        if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value) || value.startsWith('0000-')) bad(key);
        const d = new Date(value + 'T00:00:00.000Z');
        if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) bad(key);
      }
    }
    Object.assign(values, { [key]: value });
  }
  if (operation === 'create' && !entries.some(([k]) => k === 'matter_id')) bad('matter_id');
  let attendees: HearingAttendeeInput[] | undefined;
  if (raw.attendees !== undefined) {
    if (!Array.isArray(raw.attendees) || raw.attendees.length > 500) bad('attendees');
    attendees = raw.attendees.map((value) => {
      const member = object(value);
      if (
        Object.keys(member).length !== 2 ||
        !Object.hasOwn(member, 'id') ||
        !Object.hasOwn(member, 'person_id')
      )
        bad('attendees');
      const memberId = positive(member.id),
        personId = positive(member.person_id);
      if ((operation === 'create' && memberId !== null) || (memberId === null && personId === null))
        bad('attendees');
      return { id: memberId, person_id: personId };
    });
    const ids = attendees.flatMap((a) => (a.id === null ? [] : [a.id]));
    if (new Set(ids).size !== ids.length) bad('attendees');
    for (const member of attendees.filter((a) => a.id === null))
      if (attendees.filter((a) => a.person_id === member.person_id).length !== 1) bad('attendees');
  }
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 200000) bad();
  return {
    id,
    version: raw.version as string | null,
    submission: raw.submission,
    values,
    ...(attendees ? { attendees } : {}),
  };
}

export function parseHearingMutationForm(operation: 'create' | 'update', form: FormData) {
  const entries = [...form.entries()];
  if (
    entries.length !== 1 ||
    entries[0]?.[0] !== 'payload' ||
    typeof entries[0][1] !== 'string' ||
    new TextEncoder().encode(entries[0][1]).byteLength > 200000
  )
    return bad();
  try {
    const source = entries[0][1];
    const parsed: unknown = JSON.parse(source);
    // JSON.parse silently keeps the last repeated object key. Reject that
    // ambiguity before accepting the already syntax-checked JSON contract.
    const stack: ({ keys: Set<string>; key: boolean } | null)[] = [];
    for (const token of source.matchAll(
      /"(?:\\.|[^"\\])*"|[{}\[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/gu,
    )) {
      const value = token[0];
      if (value === '{') stack.push({ keys: new Set(), key: true });
      else if (value === '[') stack.push(null);
      else if (value === '}' || value === ']') stack.pop();
      else {
        const current = stack.at(-1);
        if (current && value === ',') current.key = true;
        else if (current?.key && value.startsWith('"')) {
          const key = JSON.parse(value) as string;
          if (current.keys.has(key)) bad();
          current.keys.add(key);
          current.key = false;
        }
      }
    }
    return parseHearingMutationInput(operation, parsed);
  } catch (error) {
    if (error instanceof HearingMutationError) throw error;
    return bad();
  }
}
