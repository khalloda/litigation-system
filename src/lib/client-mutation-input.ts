/** Fixed operations and fields. Neither table names nor actors come from a form. */
export const CLIENT_OPERATIONS = [
  'client-create',
  'client-update',
  'client-archive',
  'client-restore',
  'contact-create',
  'contact-update',
  'contact-archive',
  'contact-restore',
] as const;
export type ClientOperation = (typeof CLIENT_OPERATIONS)[number];
export const CLIENT_FIELDS = [
  'name_ar',
  'name_en',
  'full_name',
  'cash_or_probono',
  'status',
  'poa_location',
  'documents_location',
  'client_start',
  'client_end',
  'contact_person_id',
] as const;
export const CONTACT_FIELDS = [
  'contact_name',
  'full_name',
  'job_title',
  'email',
  'mobile_phone',
  'business_phone',
  'fax_number',
  'web_page',
  'address',
  'city',
  'state_province',
  'zip_postal_code',
  'country_region',
] as const;
export type ClientErrorCode =
  | 'invalid'
  | 'required'
  | 'stale'
  | 'conflict'
  | 'session'
  | 'not-found'
  | 'archived'
  | 'parent-archived'
  | 'main-contact'
  | 'sigma'
  | 'submission'
  | 'confirmation'
  | 'generic';
export class ClientMutationError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly field = '',
  ) {
    super(code);
  }
}
export function mutationPermission(operation: ClientOperation) {
  if (!CLIENT_OPERATIONS.includes(operation)) throw new ClientMutationError('invalid');
  const area = operation.startsWith('client-') ? 'clients' : 'contacts';
  const action = operation.endsWith('-create')
    ? 'create'
    : operation.endsWith('-update')
      ? 'update'
      : operation.endsWith('-archive')
        ? 'archive'
        : 'restore';
  return { area, action } as const;
}
export function mutationId(value: unknown, field = 'id'): number {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/u.test(value) || Number(value) > 2_147_483_647)
    throw new ClientMutationError('invalid', field);
  return Number(value);
}
export function mutationVersion(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{0,18}$/u.test(value) ||
    BigInt(value) > 9_223_372_036_854_775_807n
  )
    throw new ClientMutationError('invalid', 'version');
  return value;
}
export function parseClientMutationInput(operation: ClientOperation, input: unknown) {
  const { area, action } = mutationPermission(operation);
  const business = area === 'clients' ? CLIENT_FIELDS : CONTACT_FIELDS;
  const allowed = new Set<string>([
    ...(action === 'create' ? ['submission'] : ['id', 'version']),
    ...(area === 'contacts' ? ['clientId'] : []),
    ...(action === 'archive' || action === 'restore' ? ['confirmation'] : business),
  ]);
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ClientMutationError('invalid');
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(input)) {
    if (
      !allowed.has(key) ||
      typeof value !== 'string' ||
      [...value].length > 2048 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
    )
      throw new ClientMutationError('invalid', allowed.has(key) ? key : '');
    entries.set(key, value);
  }
  const result = Object.fromEntries(entries);
  if (area === 'contacts') mutationId(result.clientId, 'clientId');
  if (action === 'create') {
    if (
      !result.submission ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        result.submission,
      )
    )
      throw new ClientMutationError('invalid', 'submission');
  } else {
    mutationId(result.id);
    mutationVersion(result.version);
    if ((action === 'archive' || action === 'restore') && result.confirmation !== result.id)
      throw new ClientMutationError('confirmation');
  }
  return result;
}
/** Iteration, rather than get(), rejects repeats, unknown keys and File values. */
export function parseClientMutationForm(operation: ClientOperation, form: FormData) {
  const values = new Map<string, string>();
  for (const [key, value] of form.entries()) {
    if (values.has(key) || typeof value !== 'string') throw new ClientMutationError('invalid');
    values.set(key, value);
  }
  return parseClientMutationInput(operation, Object.fromEntries(values));
}
export function clientPatch(operation: ClientOperation, input: Record<string, string>) {
  const patch = new Map<string, string | number | null>();
  for (const field of operation.startsWith('client-') ? CLIENT_FIELDS : CONTACT_FIELDS) {
    if (!Object.hasOwn(input, field)) continue;
    const value = clientValue(input, field)!;
    if (field === 'contact_person_id')
      patch.set(field, value === '' ? null : mutationId(value, field));
    else if (field === 'client_start' || field === 'client_end') {
      if (value === '') patch.set(field, null);
      else {
        if (
          !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
          value.slice(0, 4) === '0000' ||
          !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
          new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value
        )
          throw new ClientMutationError('invalid', field);
        patch.set(field, value);
      }
    } else patch.set(field, value);
  }
  return Object.fromEntries(patch);
}
export function clientValue<T>(
  record: Record<string, T> | undefined,
  field: string,
): T | undefined {
  return Object.entries(record ?? {}).find(([key]) => key === field)?.[1];
}
