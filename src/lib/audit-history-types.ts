export const AUDIT_HISTORY_TABLES = [
  'admin_tasks',
  'attendance',
  'client_logos',
  'clients',
  'contacts',
  'documents',
  'fee_letter_matters',
  'fee_letters',
  'hearing_attendees',
  'hearings',
  'invoice_allocations',
  'invoices',
  'lookup_client_branch',
  'lookup_court',
  'lookup_degree',
  'lookup_hearing_action',
  'lookup_importance',
  'lookup_invoice_status',
  'lookup_invoice_type',
  'lookup_lawyer_share_role',
  'lookup_matter_category',
  'lookup_matter_destination',
  'lookup_matter_type',
  'lookup_party_role',
  'lookup_team',
  'lookup_venue',
  'matter_fee_letter_references',
  'matter_lawyers',
  'matter_parties',
  'matter_party_roles',
  'matters',
  'payments',
  'people',
  'person_name_alias',
  'power_of_attorney_lawyers',
  'powers_of_attorney',
  'task_actions',
  'user_accounts',
] as const;
export type AuditHistoryTable = (typeof AUDIT_HISTORY_TABLES)[number];
export type AuditSubject = { table: AuditHistoryTable; id: string };
export type AuditFilters = { q: string; actor: string; action: string; from: string; to: string };
export const AUDIT_FILTER_DEFAULTS: AuditFilters = {
  q: '',
  actor: '',
  action: '',
  from: '',
  to: '',
};
export type AuditValue = {
  kind: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
  text: string;
};
export type AuditEvent = {
  id: string;
  occurredAt: string;
  actorId: string;
  actorKey: string;
  actorUsername: string | null;
  actorName: string;
  actorRole: string | null;
  targetId: string | null;
  targetKey: string | null;
  targetUsername: string | null;
  targetName: string | null;
  targetRole: string | null;
  action: string;
  outcome: string;
  table: string | null;
  key: Record<string, AuditValue>;
  fields: string[];
  before: Record<string, AuditValue>;
  after: Record<string, AuditValue>;
  requestId: string;
  correlationId: string;
  auditSessionId: string;
  device: string;
  ip: string | null;
  userAgent: string | null;
  userAgentTruncated: boolean;
  attemptedUsername: string | null;
  attemptedUsernameTruncated: boolean;
  resource: string | null;
  reason: string | null;
  parameters: Record<string, AuditValue>;
  metadata: Record<string, AuditValue>;
  matched: boolean;
};
export type AuditGroup = {
  key: string;
  occurredAt: string;
  lastId: string;
  count: number;
  events: AuditEvent[];
};
export type AuditResult = {
  watermark: string;
  totalGroups: number;
  totalEvents: number;
  actors: { id: string; name: string; username: string | null; role: string | null }[];
  actions: string[];
  groups: AuditGroup[];
  next: string | null;
  snapshot: string;
  canExport: boolean;
  filters: AuditFilters;
  subject: AuditSubject | null;
};
export class AuditHistoryError extends Error {
  constructor(readonly code: 'invalid' | 'expired' | 'too-large' | 'duplicate' | 'generation') {
    super(code);
    this.name = 'AuditHistoryError';
  }
}
