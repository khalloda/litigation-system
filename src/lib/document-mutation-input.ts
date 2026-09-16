import { parseStrictJson } from './strict-json';

export const DOCUMENT_FIELDS = [
  'matter_id',
  'client_id',
  'responsible_person_id',
  'description',
  'document_date',
  'page_count',
  'deposit_date',
  'movement_card',
  'storage_location',
  'notes',
  'mfiles_id',
] as const;
export type DocumentOperation = 'create' | 'update' | 'archive' | 'restore';
export type DocumentValues = Record<string, string | number | null>;
export type DocumentCode =
  'invalid' | 'stale' | 'archived' | 'submission' | 'session' | 'not-found' | 'generic';
export class DocumentMutationError extends Error {
  constructor(
    public code: DocumentCode,
    public field = '',
  ) {
    super(code);
  }
}
export type DocumentInput = {
  operation: DocumentOperation;
  id: number | null;
  version: string | null;
  submission: string;
  values: DocumentValues;
  related: null;
  facts: Record<string, unknown> | null;
};
const invalid = (field = ''): never => {
  throw new DocumentMutationError('invalid', field);
};
const positive = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
function date(value: string) {
  const parsed = new Date(value + 'T00:00:00Z');
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    value >= '0001-01-01' &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function parseDocumentInput(operation: DocumentOperation, input: unknown): DocumentInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const value = input as Record<string, unknown>;
  const keys = ['operation', 'id', 'version', 'submission', 'values', 'related', 'facts'];
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !(key in value)) ||
    value.operation !== operation
  )
    return invalid();
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return invalid();
  }
  if (new TextEncoder().encode(encoded).length > 200000) return invalid();
  if (
    (operation === 'create') !== (value.id === null) ||
    (value.id !== null && !positive(value.id))
  )
    return invalid();
  if (
    value.id === null
      ? value.version !== null
      : typeof value.version !== 'string' ||
        !/^[1-9]\d{0,18}$/u.test(value.version) ||
        BigInt(value.version) > 9223372036854775807n
  )
    return invalid();
  if (
    typeof value.submission !== 'string' ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value.submission)
  )
    return invalid();
  if (
    !value.values ||
    typeof value.values !== 'object' ||
    Array.isArray(value.values) ||
    value.related !== null
  )
    return invalid();
  for (const [field, fieldValue] of Object.entries(value.values)) {
    if (!(DOCUMENT_FIELDS as readonly string[]).includes(field)) return invalid(field);
    if (fieldValue === null) continue;
    if (['matter_id', 'client_id', 'responsible_person_id'].includes(field)) {
      if (!positive(fieldValue)) return invalid(field);
    } else if (field === 'page_count') {
      if (
        typeof fieldValue !== 'number' ||
        !Number.isInteger(fieldValue) ||
        fieldValue < 0 ||
        fieldValue > 2147483647
      )
        return invalid(field);
    } else if (
      typeof fieldValue !== 'string' ||
      Array.from(fieldValue).length > 10000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(fieldValue)
    )
      return invalid(field);
    else if (['document_date', 'deposit_date'].includes(field) && !date(fieldValue))
      return invalid(field);
  }
  if (
    operation === 'create' &&
    !(
      typeof (value.values as DocumentValues).description === 'string' &&
      String((value.values as DocumentValues).description).trim()
    )
  )
    return invalid('description');
  if (operation === 'archive' || operation === 'restore') {
    if (
      Object.keys(value.values).length ||
      !value.facts ||
      typeof value.facts !== 'object' ||
      Array.isArray(value.facts)
    )
      return invalid();
  } else if (value.facts !== null) return invalid();
  return value as DocumentInput;
}
export function parseDocumentForm(operation: DocumentOperation, form: FormData) {
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== 'payload' || typeof entries[0][1] !== 'string')
    return invalid();
  const raw = entries[0][1];
  if (new TextEncoder().encode(raw).length > 200000) return invalid();
  let input: unknown;
  try {
    input = parseStrictJson(raw);
  } catch {
    return invalid();
  }
  return parseDocumentInput(operation, input);
}
