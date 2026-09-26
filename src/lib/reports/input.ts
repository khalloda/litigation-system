import { referenceRule } from './fields';
import { cairoDate } from '@/lib/cairo-date';
import {
  ReportError,
  REPORT_LIMITS,
  type ReportDescriptor,
  type ReportParameters,
  type ReportFormat,
  type Selection,
} from './types';

export function civilDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value < '0001-01-01' || value > '9999-12-31')
    throw new ReportError('invalid');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new ReportError('invalid');
  return value;
}
export function nextCivilDay(value: string): string {
  const date = new Date(`${civilDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
/** Earliest instant of a Cairo civil day, including a skipped DST midnight. */
export function cairoDayStart(value: string): Date {
  civilDate(value);
  const center = Date.parse(`${value}T12:00:00.000Z`);
  let low = center - 48 * 3600000;
  let high = center + 48 * 3600000;
  const localDay = (instant: Date) => {
    if (instant.getUTCFullYear() <= 1) {
      const era = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', era: 'short' })
        .formatToParts(instant)
        .find((p) => p.type === 'era')?.value;
      if (era === 'BC') return '0000-01-01';
    }
    return cairoDate(instant);
  };
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (localDay(new Date(mid)) < value) low = mid + 1;
    else high = mid;
  }
  if (cairoDate(new Date(low)) !== value) throw new ReportError('invalid');
  return new Date(low);
}
export function reportDateBounds(parameters: ReportParameters, source: 'date' | 'cairo-timestamp') {
  return source === 'date'
    ? { gte: parameters.from, lt: parameters.to ? nextCivilDay(parameters.to) : null }
    : {
        gte: parameters.from ? cairoDayStart(parameters.from) : null,
        lt: parameters.to ? cairoDayStart(nextCivilDay(parameters.to)) : null,
      };
}
function selected(value: string, required: boolean, unassigned: boolean): Selection {
  if (value === '' && !required) return { kind: 'all' };
  if (value === 'unassigned' && unassigned) return { kind: 'unassigned' };
  if (!/^[1-9]\d{0,9}$/u.test(value) || Number(value) > 2147483647)
    throw new ReportError('invalid');
  return { kind: 'id', id: Number(value) };
}
export function parseReportInput(descriptor: ReportDescriptor, pairs: URLSearchParams) {
  const allowed = new Set(['format']);
  if (descriptor.date) {
    allowed.add('from');
    allowed.add('to');
  }
  for (const key of Object.keys(descriptor.parameters)) allowed.add(key);
  for (const extra of descriptor.extra ?? []) allowed.add(extra.key);
  const seen = new Set<string>();
  const values = new Map<string, string>();
  for (const [key, value] of pairs) {
    if (!allowed.has(key) || seen.has(key) || value.length > 128)
      throw new ReportError('invalid', [key]);
    seen.add(key);
    values.set(key, value);
  }
  const format = values.get('format');
  if (format !== 'preview' && format !== 'xlsx' && format !== 'pdf')
    throw new ReportError('invalid', ['format']);
  const fields: string[] = [];
  const parsed: ReportParameters = {
    from: null,
    to: null,
    client: { kind: 'all' },
    branch: { kind: 'all' },
    lawyer: { kind: 'all' },
    extra: {},
  };
  let from: string | null = null,
    to: string | null = null;
  if (descriptor.date) {
    for (const key of ['from', 'to'] as const) {
      try {
        const value = values.get(key) ?? '';
        if (value > '9998-12-31') throw new ReportError('invalid');
        if (!value) {
          if (descriptor.date.required) fields.push(key);
        } else if (key === 'from') from = civilDate(value);
        else to = civilDate(value);
      } catch {
        fields.push(key);
      }
    }
    if ((!descriptor.date.allowOpen && !!from !== !!to) || (from && to && from > to))
      fields.push('from', 'to');
  }
  const choices = new Map<string, Selection>();
  for (const key of ['client', 'branch', 'lawyer'] as const) {
    const rule = referenceRule(descriptor, key);
    if (!rule) continue;
    try {
      choices.set(key, selected(values.get(key) ?? '', rule.required, rule.unassigned === true));
    } catch {
      fields.push(key);
    }
  }
  const extra = new Map<string, string>();
  for (const rule of descriptor.extra ?? []) {
    const value = values.get(rule.key) ?? '';
    if ((!value && rule.required) || (value && !rule.choices.some((c) => c.value === value)))
      fields.push(rule.key);
    else if (value) extra.set(rule.key, value);
  }
  if (fields.length) throw new ReportError('invalid', [...new Set(fields)]);
  return {
    format: format as ReportFormat,
    parameters: {
      ...parsed,
      client: choices.get('client') ?? parsed.client,
      branch: choices.get('branch') ?? parsed.branch,
      lawyer: choices.get('lawyer') ?? parsed.lawyer,
      from,
      to,
      extra: Object.fromEntries(extra),
    },
  };
}
/** URL-encoded input keeps duplicate keys observable instead of JSON last-wins. */
export async function readReportRequest(request: Request): Promise<URLSearchParams> {
  const target = new URL(request.url);
  const host = request.headers.get('host') ?? target.host;
  let origin: string;
  try {
    const actual = new URL(`${target.protocol}//${host}`);
    if (!['http:', 'https:'].includes(target.protocol) || actual.host !== host.toLowerCase())
      throw new Error();
    origin = actual.origin;
  } catch {
    throw new ReportError('invalid');
  }
  if (
    request.method !== 'POST' ||
    request.headers.get('origin') !== origin ||
    request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded' ||
    Number(request.headers.get('content-length')) > REPORT_LIMITS.requestBytes ||
    target.search
  )
    throw new ReportError('invalid');
  const reader = request.body?.getReader();
  if (!reader) throw new ReportError('invalid');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > REPORT_LIMITS.requestBytes) {
        await reader.cancel();
        throw new ReportError('invalid');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new ReportError('invalid');
  }
  if (/%(?![a-f\d]{2})/iu.test(text)) throw new ReportError('invalid');
  try {
    decodeURIComponent(text.replace(/\+/gu, ' '));
  } catch {
    throw new ReportError('invalid');
  }
  return new URLSearchParams(text);
}
