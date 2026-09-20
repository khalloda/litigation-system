import { t } from '@/strings';
import type { AuditEvent, AuditGroup, AuditValue } from './audit-history-types';
const s = t.auditHistory;
export function auditLabel(kind: 'actions' | 'fields' | 'entities', key: string | null) {
  const labels = kind === 'actions' ? s.actions : kind === 'fields' ? s.fields : s.entities;
  return key ? (Object.entries(labels).find(([name]) => name === key)?.[1] ?? key) : s.unknown;
}
export function auditErrorText(code: string) {
  return Object.entries(s.errors).find(([name]) => name === code)?.[1] ?? s.errors.generic;
}
export function auditRecordedValue(values: Record<string, AuditValue>, field: string) {
  return Object.entries(values).find(([name]) => name === field)?.[1];
}
/** Lossless recorded representation; never parse numbers or translate evidence.
 * Absence is not JSON null. `text` is the exact PostgreSQL typed projection,
 * including JSON object/array syntax and redaction/truncation metadata. */
export function auditOriginalValue(value: AuditValue | undefined): string {
  return JSON.stringify(
    value === undefined
      ? { present: false }
      : { present: true, kind: value.kind, text: value.text },
  );
}
export function auditValue(value: AuditValue | undefined): string {
  if (!value) return s.absent;
  if (value.kind === 'null') return s.null;
  if (value.kind === 'string' && value.text === '') return s.emptyString;
  if (value.kind === 'string') {
    if (/^\s+$/u.test(value.text)) return `${s.whitespaceString}: ${JSON.stringify(value.text)}`;
    // A literal marker-looking string stays visibly text, not a special state.
    const readable = value.text
      .replace(/\\/gu, '\\\\')
      .replace(
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/gu,
        (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
      );
    return `${s.string}: «${readable}»`;
  }
  if (value.kind === 'boolean') return value.text === 'true' ? s.true : s.false;
  if (value.kind === 'object') {
    try {
      const data = JSON.parse(value.text) as Record<string, unknown>;
      if (data['$redacted']) return `${s.redacted}\n${value.text}`;
      if (data['$truncated']) return `${s.truncated}\n${value.text}`;
    } catch {
      /* Retain the recorded representation without reinterpretation. */
    }
  }
  return value.text;
}
export function auditIdentity(event: AuditEvent, target = false) {
  const parts = target
    ? [event.targetName, event.targetUsername, event.targetRole, event.targetId]
    : [event.actorName, event.actorUsername, event.actorRole, event.actorId];
  return parts.filter((x) => x !== null).join(' · ') || s.unknown;
}
export function auditGroupTitle(group: AuditGroup) {
  return group.events.every((e) => e.actorKey.startsWith('user_account:')) ? s.save : s.system;
}
export function auditDetails(event: AuditEvent): [string, string][] {
  return [
    [s.eventId, event.id],
    [s.occurredAt, event.occurredAt],
    [s.actorSnapshot, auditIdentity(event)],
    [s.targetSnapshot, auditIdentity(event, true)],
    [s.action, `${auditLabel('actions', event.action)} (${event.action})`],
    [s.outcome, event.outcome],
    [s.scope, auditLabel('entities', event.table)],
    [s.entityId, JSON.stringify(event.key)],
    [s.request, event.requestId],
    [s.correlation, event.correlationId],
    [s.auditSession, event.auditSessionId],
    [s.device, event.device],
    [s.ip, event.ip ?? s.unknown],
    [
      s.userAgent,
      (event.userAgent ?? s.unknown) + (event.userAgentTruncated ? `\n${s.truncated}` : ''),
    ],
    [
      s.attemptedUsername,
      (event.attemptedUsername ?? s.unknown) +
        (event.attemptedUsernameTruncated ? `\n${s.truncated}` : ''),
    ],
    [s.resource, event.resource ?? s.unknown],
    [s.reason, event.reason ?? s.unknown],
    [s.parameters, JSON.stringify(event.parameters)],
    [s.metadata, JSON.stringify(event.metadata)],
  ];
}
