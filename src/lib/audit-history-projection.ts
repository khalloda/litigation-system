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
export function auditValue(value: AuditValue | undefined): string {
  if (!value) return s.absent;
  if (value.kind === 'null') return s.null;
  if (value.kind === 'string' && value.text === '') return s.emptyString;
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
