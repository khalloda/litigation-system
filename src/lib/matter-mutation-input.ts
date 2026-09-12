export const MATTER_COUNT_KEYS = [
  'hearings',
  'tasks',
  'steps',
  'documents',
  'feeLetters',
  'parties',
  'capacities',
  'lawyers',
] as const;
export const MATTER_TEXT_FIELDS = [
  'case_number_ar',
  'subject',
  'status',
  'current_status',
  'circuit',
  'circuit_secretary',
  'court_floor',
  'court_hall',
  'court_shelf',
  'court_secretary_room',
  'notes_1',
  'notes_2',
  'evaluation',
  'legal_opinion',
] as const;
export const MATTER_LOOKUP_FIELDS = [
  'matter_type_id',
  'matter_category_id',
  'degree_id',
  'venue_id',
  'importance_id',
  'destination_id',
  'court_id',
  'branch_id',
] as const;
export const MATTER_DATE_FIELDS = ['start_date', 'end_date'] as const;
export const MATTER_DECIMAL_FIELDS = ['asked_amount', 'judged_amount'] as const;
export const MATTER_FIELDS = [
  ...MATTER_TEXT_FIELDS,
  ...MATTER_LOOKUP_FIELDS,
  ...MATTER_DATE_FIELDS,
  ...MATTER_DECIMAL_FIELDS,
] as const;
export type MatterField = (typeof MATTER_FIELDS)[number];
export type MatterValues = Partial<Record<MatterField | 'client_id', string | number | null>>;
export type MatterCapacityInput = { id: number | null; role_id: number; ordinal: number | null };
export type MatterPartyInput = {
  id: number | null;
  side: 'client' | 'opponent';
  party_name: string | null;
  gender: 'm' | 'f' | null;
  ordinal: number | null;
  roles: MatterCapacityInput[];
};
export type MatterLawyerInput = {
  id: number | null;
  person_id: number;
  role: 'lead' | 'co_lead' | 'support';
  position: number | null;
};
export type MatterMutationInput = {
  id: number | null;
  version: string | null;
  submission: string;
  values: MatterValues;
  parties?: MatterPartyInput[];
  lawyers?: MatterLawyerInput[];
};
export type MatterMutationCode =
  'invalid' | 'stale' | 'submission' | 'session' | 'not-found' | 'archived' | 'generic';
export class MatterMutationError extends Error {
  constructor(
    public code: MatterMutationCode,
    public field = '',
  ) {
    super(code);
  }
}
const bad = (field = ''): never => {
  throw new MatterMutationError('invalid', field);
};
export function matterMutationId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647)
    return bad();
  return value;
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return bad();
  if (Object.keys(value).some((k) => !keys.includes(k))) return bad();
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length > 100000 ||
    /[\u0000\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  )
    return bad(field);
  return value;
}
const optionalId = (value: unknown) => (value === null ? null : matterMutationId(value));
const order = (value: unknown) => (value === null ? null : matterMutationId(value));
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 500) return bad();
  return value;
}
function unique(values: (number | null)[]) {
  const present = values.filter((v) => v !== null);
  if (new Set(present).size !== present.length) bad();
}
/** Explicit JSON contract; no ORM mass assignment or implicit text coercion. */
export function parseMatterMutationInput(
  operation: 'create' | 'update',
  input: unknown,
): MatterMutationInput {
  const raw = object(input, ['id', 'version', 'submission', 'values', 'parties', 'lawyers']);
  const id = operation === 'create' ? null : matterMutationId(raw.id);
  if (operation === 'create' && (raw.id !== null || raw.version !== null)) bad();
  const version = operation === 'create' ? null : raw.version;
  if (
    version !== null &&
    (typeof version !== 'string' ||
      !/^[1-9]\d{0,18}$/u.test(version) ||
      BigInt(version) > 9223372036854775807n)
  )
    bad();
  if (
    typeof raw.submission !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(raw.submission)
  )
    bad();
  const source = object(
    raw.values,
    operation === 'create' ? [...MATTER_FIELDS, 'client_id'] : MATTER_FIELDS,
  );
  const values: MatterValues = {};
  for (const [key, value] of Object.entries(source)) {
    if ([...MATTER_LOOKUP_FIELDS, 'client_id'].includes(key)) {
      Object.assign(values, { [key]: optionalId(value) });
      continue;
    }
    const parsed = text(value, key);
    if (parsed !== null && (MATTER_DATE_FIELDS as readonly string[]).includes(key)) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/u.test(parsed) ||
        parsed.startsWith('0000') ||
        !Number.isFinite(Date.parse(parsed + 'T00:00:00Z')) ||
        new Date(parsed + 'T00:00:00Z').toISOString().slice(0, 10) !== parsed
      )
        bad(key);
    }
    if (
      parsed !== null &&
      (MATTER_DECIMAL_FIELDS as readonly string[]).includes(key) &&
      !/^-?\d{1,16}(?:\.\d{1,2})?$/u.test(parsed)
    )
      bad(key);
    Object.assign(values, { [key]: parsed });
  }
  const parties =
    raw.parties === undefined
      ? undefined
      : array(raw.parties).map((value) => {
          const p = object(value, ['id', 'side', 'party_name', 'gender', 'ordinal', 'roles']);
          if (
            !['client', 'opponent'].includes(String(p.side)) ||
            !['m', 'f', null].includes(p.gender as null)
          )
            bad();
          const roles = array(p.roles).map((value) => {
            const r = object(value, ['id', 'role_id', 'ordinal']);
            return {
              id: optionalId(r.id),
              role_id: matterMutationId(r.role_id),
              ordinal: order(r.ordinal),
            };
          });
          unique(roles.map((r) => r.id));
          unique(roles.map((r) => r.role_id));
          unique(roles.map((r) => r.ordinal));
          return {
            id: optionalId(p.id),
            side: p.side,
            party_name: text(p.party_name, 'parties'),
            gender: p.gender,
            ordinal: order(p.ordinal),
            roles,
          } as MatterPartyInput;
        });
  const lawyers =
    raw.lawyers === undefined
      ? undefined
      : array(raw.lawyers).map((value) => {
          const r = object(value, ['id', 'person_id', 'role', 'position']);
          if (!['lead', 'co_lead', 'support'].includes(String(r.role))) bad();
          return {
            id: optionalId(r.id),
            person_id: matterMutationId(r.person_id),
            role: r.role,
            position: order(r.position),
          } as MatterLawyerInput;
        });
  if (parties) unique(parties.map((p) => p.id));
  if (lawyers) {
    unique(lawyers.map((l) => l.id));
    unique(lawyers.map((l) => l.person_id));
    if (lawyers.filter((l) => l.role === 'lead').length > 1) bad('lawyers');
  }
  if (
    operation === 'create' &&
    (parties?.some((p) => p.id !== null || p.roles.some((r) => r.id !== null)) ||
      lawyers?.some((l) => l.id !== null))
  )
    bad();
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 500000) bad();
  return {
    id,
    version: version as string | null,
    submission: raw.submission as string,
    values,
    ...(parties ? { parties } : {}),
    ...(lawyers ? { lawyers } : {}),
  };
}
export function parseMatterMutationForm(operation: 'create' | 'update', form: FormData) {
  const entries = [...form.entries()];
  if (
    entries.length !== 1 ||
    entries[0]?.[0] !== 'payload' ||
    typeof entries[0][1] !== 'string' ||
    new TextEncoder().encode(entries[0][1]).byteLength > 500000
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
    return parseMatterMutationInput(operation, parsed);
  } catch (error) {
    if (error instanceof MatterMutationError) throw error;
    return bad();
  }
}
