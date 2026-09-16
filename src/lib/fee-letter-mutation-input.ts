import { parseStrictJson } from './strict-json';

export const FEE_LETTER_FIELDS = [
  'client_id',
  'mfiles_id',
  'contract_type',
  'contract_date',
  'contract_details',
  'contract_structure',
] as const;
export type FeeLetterOperation =
  | 'create'
  | 'update'
  | 'archive'
  | 'restore'
  | 'covered-add'
  | 'covered-retire'
  | 'covered-restore';
export type MatterFeeReferenceOperation = 'set' | 'clear' | 'replace';
export type FeeLetterValues = Record<string, string | number | null>;
export type FeeLetterCode =
  'invalid' | 'stale' | 'archived' | 'submission' | 'session' | 'not-found' | 'generic';
export class FeeLetterMutationError extends Error {
  constructor(
    public code: FeeLetterCode,
    public field = '',
  ) {
    super(code);
  }
}
export type FeeLetterInput = {
  operation: FeeLetterOperation;
  id: number | null;
  version: string | null;
  submission: string;
  values: FeeLetterValues;
  related: null | { membershipId: number | null; matterId: number | null };
  facts: Record<string, unknown> | null;
};
export type MatterFeeReferenceInput = {
  operation: MatterFeeReferenceOperation;
  id: number;
  version: string;
  submission: string;
  values: Record<string, never>;
  related: { oldFeeLetterId: number | null; newFeeLetterId: number | null };
  facts: null;
};
const invalid = (field = ''): never => {
  throw new FeeLetterMutationError('invalid', field);
};
const positive = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
const validDate = (value: string) => {
  const parsed = new Date(value + 'T00:00:00Z');
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    value >= '0001-01-01' &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};
function base(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const value = input as Record<string, unknown>,
    keys = ['operation', 'id', 'version', 'submission', 'values', 'related', 'facts'];
  if (Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !(key in value)))
    return invalid();
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return invalid();
  }
  if (new TextEncoder().encode(encoded).length > 200000) return invalid();
  if (
    typeof value.submission !== 'string' ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value.submission)
  )
    return invalid();
  return value;
}
function validVersion(value: unknown) {
  return (
    typeof value === 'string' &&
    /^[1-9]\d{0,18}$/u.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}
export function parseFeeLetterInput(operation: FeeLetterOperation, input: unknown): FeeLetterInput {
  const value = base(input);
  if (value.operation !== operation) return invalid();
  const creating = operation === 'create',
    lifecycle = operation === 'archive' || operation === 'restore',
    relation = operation.startsWith('covered-');
  if (
    creating !== (value.id === null) ||
    (value.id !== null && !positive(value.id)) ||
    (value.id === null ? value.version !== null : !validVersion(value.version))
  )
    return invalid();
  if (!value.values || typeof value.values !== 'object' || Array.isArray(value.values))
    return invalid();
  for (const [field, fieldValue] of Object.entries(value.values)) {
    if (!(FEE_LETTER_FIELDS as readonly string[]).includes(field)) return invalid(field);
    if (fieldValue === null) continue;
    if (field === 'client_id') {
      if (!positive(fieldValue)) return invalid(field);
    } else if (
      typeof fieldValue !== 'string' ||
      Array.from(fieldValue).length > 10000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(fieldValue)
    )
      return invalid(field);
    else if (field === 'contract_date' && !validDate(fieldValue)) return invalid(field);
  }
  if (creating && !positive((value.values as FeeLetterValues).client_id))
    return invalid('client_id');
  if (lifecycle) {
    if (
      Object.keys(value.values).length ||
      value.related !== null ||
      !value.facts ||
      typeof value.facts !== 'object' ||
      Array.isArray(value.facts)
    )
      return invalid();
  } else if (relation) {
    if (
      Object.keys(value.values).length ||
      value.facts !== null ||
      !value.related ||
      typeof value.related !== 'object' ||
      Array.isArray(value.related)
    )
      return invalid();
    const related = value.related as Record<string, unknown>;
    if (
      Object.keys(related).some((key) => !['membershipId', 'matterId'].includes(key)) ||
      !('membershipId' in related) ||
      !('matterId' in related)
    )
      return invalid();
    if (operation === 'covered-add') {
      if (related.membershipId !== null || !positive(related.matterId)) return invalid('matterId');
    } else if (!positive(related.membershipId) || related.matterId !== null)
      return invalid('membershipId');
  } else if (value.related !== null || value.facts !== null) return invalid();
  return value as FeeLetterInput;
}
export function parseMatterFeeReferenceInput(
  operation: MatterFeeReferenceOperation,
  input: unknown,
): MatterFeeReferenceInput {
  const value = base(input);
  if (
    value.operation !== operation ||
    !positive(value.id) ||
    !validVersion(value.version) ||
    !value.values ||
    typeof value.values !== 'object' ||
    Array.isArray(value.values) ||
    Object.keys(value.values).length ||
    value.facts !== null ||
    !value.related ||
    typeof value.related !== 'object' ||
    Array.isArray(value.related)
  )
    return invalid();
  const related = value.related as Record<string, unknown>;
  if (
    Object.keys(related).some((key) => !['oldFeeLetterId', 'newFeeLetterId'].includes(key)) ||
    !('oldFeeLetterId' in related) ||
    !('newFeeLetterId' in related)
  )
    return invalid();
  const oldId = related.oldFeeLetterId,
    newId = related.newFeeLetterId;
  if (operation === 'set' && (oldId !== null || !positive(newId))) return invalid();
  if (operation === 'clear' && (!positive(oldId) || newId !== null)) return invalid();
  if (operation === 'replace' && (!positive(oldId) || !positive(newId) || oldId === newId))
    return invalid();
  return value as MatterFeeReferenceInput;
}
export function parseFeeLetterForm(operation: FeeLetterOperation, form: FormData) {
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== 'payload' || typeof entries[0][1] !== 'string')
    return invalid();
  if (new TextEncoder().encode(entries[0][1]).length > 200000) return invalid();
  try {
    return parseFeeLetterInput(operation, parseStrictJson(entries[0][1]));
  } catch (error) {
    if (error instanceof FeeLetterMutationError) throw error;
    return invalid();
  }
}
export function parseMatterFeeReferenceForm(
  operation: MatterFeeReferenceOperation,
  form: FormData,
) {
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== 'payload' || typeof entries[0][1] !== 'string')
    return invalid();
  if (new TextEncoder().encode(entries[0][1]).length > 200000) return invalid();
  try {
    return parseMatterFeeReferenceInput(operation, parseStrictJson(entries[0][1]));
  } catch (error) {
    if (error instanceof FeeLetterMutationError) throw error;
    return invalid();
  }
}
