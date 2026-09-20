import {
  AUDIT_HISTORY_TABLES,
  AUDIT_FILTER_DEFAULTS,
  AuditHistoryError,
  type AuditFilters,
  type AuditSubject,
} from './audit-history-types';

export function parseAuditInput(input: Record<string, unknown>): {
  filters: AuditFilters;
  subject: AuditSubject | null;
  cursor: string;
} {
  const allowed = ['q', 'actor', 'action', 'from', 'to', 'table', 'id', 'cursor'];
  for (const [key, value] of Object.entries(input)) {
    if (
      !allowed.includes(key) ||
      typeof value !== 'string' ||
      value.length > (key === 'cursor' ? 4096 : 160) ||
      /[\p{Cc}\p{Cf}]/u.test(value)
    )
      throw new AuditHistoryError('invalid');
  }
  const values = new Map(Object.entries(input));
  const get = (key: string) => String(values.get(key) ?? '');
  const filters = {
    ...AUDIT_FILTER_DEFAULTS,
    ...Object.fromEntries(Object.keys(AUDIT_FILTER_DEFAULTS).map((k) => [k, get(k)])),
  };
  filters.q = filters.q.trim();
  if (filters.actor && !/^[1-9][0-9]{0,9}$/u.test(filters.actor))
    throw new AuditHistoryError('invalid');
  if (filters.action && !/^[a-z][a-z_]{1,63}$/u.test(filters.action))
    throw new AuditHistoryError('invalid');
  for (const date of [filters.from, filters.to]) {
    if (
      date &&
      (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(date) ||
        date < '0001-01-01' ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date)
    )
      throw new AuditHistoryError('invalid');
  }
  if (filters.from && filters.to && filters.from > filters.to)
    throw new AuditHistoryError('invalid');
  const table = get('table'),
    id = get('id');
  if (
    Boolean(table) !== Boolean(id) ||
    (table &&
      (!AUDIT_HISTORY_TABLES.includes(table as never) ||
        !/^[1-9][0-9]{0,9}$/u.test(id) ||
        Number(id) > 2147483647))
  )
    throw new AuditHistoryError('invalid');
  return {
    filters,
    subject: table ? { table: table as AuditSubject['table'], id } : null,
    cursor: get('cursor'),
  };
}
export function auditSearchParams(
  filters: AuditFilters,
  subject: AuditSubject | null,
  cursor = '',
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  if (subject) {
    params.set('table', subject.table);
    params.set('id', subject.id);
  }
  if (cursor) params.set('cursor', cursor);
  return params;
}
export function auditParamsObject(params: URLSearchParams) {
  const result = new Map<string, string>();
  for (const [k, v] of params) {
    if (result.has(k)) throw new AuditHistoryError('invalid');
    result.set(k, v);
  }
  return Object.fromEntries(result);
}
