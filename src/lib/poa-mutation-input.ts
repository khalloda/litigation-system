export const POA_FIELDS = [
  'client_id',
  'serial_no',
  'principal_name',
  'poa_capacity',
  'poa_number',
  'poa_letter',
  'poa_year',
  'issuing_authority',
  'issue_date',
  'copies_count',
  'notes',
  'show_on_poa_report',
] as const;
export type PoaValues = Record<string, string | number | boolean | null>;
export type PoaOperation = 'create' | 'update' | 'archive' | 'restore';
export type PoaCode =
  'invalid' | 'stale' | 'archived' | 'submission' | 'session' | 'not-found' | 'generic';
export class PoaMutationError extends Error {
  constructor(
    public code: PoaCode,
    public field = '',
  ) {
    super(code);
  }
}
export type PoaInput = {
  operation: PoaOperation;
  id: number | null;
  version: string | null;
  submission: string;
  values: PoaValues;
  lawyers: number[] | null;
  facts: Record<string, unknown> | null;
};
const invalid = (field = ''): never => {
  throw new PoaMutationError('invalid', field);
};
export function parsePoaInput(operation: PoaOperation, input: unknown): PoaInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const p = input as Record<string, unknown>;
  const keys = ['operation', 'id', 'version', 'submission', 'values', 'lawyers', 'facts'];
  if (
    Object.keys(p).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in p)) ||
    p.operation !== operation
  )
    return invalid();
  let encoded: string;
  try {
    encoded = JSON.stringify(p);
  } catch {
    return invalid();
  }
  if (new TextEncoder().encode(encoded).length > 200000) return invalid();
  const id = (v: unknown) =>
    typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 2147483647;
  if ((operation === 'create') !== (p.id === null) || (p.id !== null && !id(p.id)))
    return invalid();
  if (
    p.id === null
      ? p.version !== null
      : typeof p.version !== 'string' ||
        !/^[1-9]\d{0,18}$/u.test(p.version) ||
        BigInt(p.version) > 9223372036854775807n
  )
    return invalid();
  if (
    typeof p.submission !== 'string' ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(p.submission)
  )
    return invalid();
  if (!p.values || typeof p.values !== 'object' || Array.isArray(p.values)) return invalid();
  for (const [k, v] of Object.entries(p.values)) {
    if (!(POA_FIELDS as readonly string[]).includes(k)) return invalid(k);
    if (v === null) continue;
    if (k === 'client_id') {
      if (!id(v)) return invalid(k);
    } else if (k === 'copies_count') {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 2147483647)
        return invalid(k);
    } else if (k === 'show_on_poa_report') {
      if (typeof v !== 'boolean') return invalid(k);
    } else {
      if (
        typeof v !== 'string' ||
        Array.from(v).length > 10000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v)
      )
        return invalid(k);
      if (k === 'issue_date') {
        const d = new Date(v + 'T00:00:00Z');
        if (
          !/^\d{4}-\d{2}-\d{2}$/u.test(v) ||
          v < '0001-01-01' ||
          !Number.isFinite(d.getTime()) ||
          d.toISOString().slice(0, 10) !== v
        )
          return invalid(k);
      }
    }
  }
  const values = p.values as PoaValues;
  if (
    operation === 'create' &&
    !(typeof values.principal_name === 'string' && values.principal_name.trim())
  )
    return invalid('principal_name');
  if (
    p.lawyers !== null &&
    (!Array.isArray(p.lawyers) ||
      p.lawyers.some((x) => !id(x)) ||
      new Set(p.lawyers).size !== p.lawyers.length)
  )
    return invalid('lawyers');
  if (operation === 'archive' || operation === 'restore') {
    if (
      Object.keys(values).length ||
      p.lawyers !== null ||
      !p.facts ||
      typeof p.facts !== 'object' ||
      Array.isArray(p.facts)
    )
      return invalid();
  } else if (p.facts !== null) return invalid();
  return p as PoaInput;
}
export function parsePoaForm(operation: PoaOperation, form: FormData) {
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== 'payload' || typeof entries[0][1] !== 'string')
    return invalid();
  const raw = entries[0][1];
  if (new TextEncoder().encode(raw).length > 200000) return invalid();
  let value: unknown;
  try {
    value = JSON.parse(raw);
    const stack: ({ keys: Set<string>; key: boolean } | null)[] = [];
    for (const token of raw.matchAll(
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
          if (current.keys.has(key)) invalid();
          current.keys.add(key);
          current.key = false;
        }
      }
    }
  } catch {
    return invalid();
  }
  return parsePoaInput(operation, value);
}
