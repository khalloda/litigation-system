export const ADMIN_TASK_FIELDS = [
  'required_work',
  'assigned_to_person_id',
  'task_created_date',
  'execution_date',
  'result',
  'previous_decision',
  'last_followup',
  'deadline',
  'court_id',
  'circuit',
  'destination_id',
  'status',
  'alert',
] as const;
export const ADMIN_STEP_FIELDS = [
  'action_date',
  'performed_by_person_id',
  'result',
  'report',
] as const;
export type AdminOperation = 'task-create' | 'task-update' | 'step-create' | 'step-update';
export type AdminValues = Record<string, string | number | null>;
export type AdminMutationCode =
  'invalid' | 'archived' | 'stale' | 'submission' | 'session' | 'not-found' | 'generic';
export class AdminMutationError extends Error {
  constructor(
    public code: AdminMutationCode,
    public field = '',
  ) {
    super('Administrative mutation: ' + code);
  }
}
function bad(field = ''): never {
  throw new AdminMutationError('invalid', field);
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
function positive(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647)
    bad();
  return value;
}
export function parseAdminMutationInput(operation: AdminOperation, input: unknown) {
  const raw = object(input);
  if (
    Object.keys(raw).length !== 6 ||
    !['operation', 'task_id', 'step_id', 'version', 'submission', 'values'].every((k) =>
      Object.hasOwn(raw, k),
    ) ||
    raw.operation !== operation
  )
    bad();
  const taskId = positive(raw.task_id),
    stepId = positive(raw.step_id),
    creating = operation.endsWith('create'),
    step = operation.startsWith('step');
  if (
    (operation === 'task-create') !== (taskId === null) ||
    (operation === 'step-update') !== (stepId !== null)
  )
    bad();
  if (
    taskId === null
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
  const fields = new Set<string>(step ? ADMIN_STEP_FIELDS : ADMIN_TASK_FIELDS);
  if (operation === 'task-create') fields.add('matter_id');
  const values: AdminValues = {};
  for (const [key, value] of Object.entries(object(raw.values))) {
    if (!fields.has(key)) bad(key);
    if (key.endsWith('_id')) positive(value);
    else if (value !== null) {
      if (
        typeof value !== 'string' ||
        [...value].length > 10000 ||
        (key === 'status' && value.length > 160) ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
      )
        bad(key);
      if (key.endsWith('_date') || key === 'deadline') {
        if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value) || value.startsWith('0000-')) bad(key);
        const d = new Date(value + 'T00:00:00.000Z');
        if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) bad(key);
      }
    }
    Object.assign(values, { [key]: value });
  }
  if (
    operation === 'task-create' &&
    (!Object.hasOwn(values, 'matter_id') || !Object.hasOwn(values, 'task_created_date'))
  )
    bad();
  // Update completeness is checked against current stored values in the locked gateway.
  if (
    creating &&
    (step
      ? !String(values.result ?? '').trim() && !String(values.report ?? '').trim()
      : !String(values.required_work ?? '').trim())
  )
    bad(step ? 'result' : 'required_work');
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 200000) bad();
  return {
    operation,
    task_id: taskId,
    step_id: stepId,
    version: raw.version as string | null,
    submission: raw.submission,
    values,
  };
}
export function parseAdminMutationForm(operation: AdminOperation, form: FormData) {
  const entries = [...form.entries()];
  if (
    entries.length !== 1 ||
    entries[0]?.[0] !== 'payload' ||
    typeof entries[0][1] !== 'string' ||
    new TextEncoder().encode(entries[0][1]).byteLength > 200000
  )
    bad();
  try {
    const source = entries[0][1],
      parsed: unknown = JSON.parse(source);
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
    return parseAdminMutationInput(operation, parsed);
  } catch (error) {
    if (error instanceof AdminMutationError) throw error;
    return bad();
  }
}
