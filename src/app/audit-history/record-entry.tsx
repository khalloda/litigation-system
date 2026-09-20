import type { Session } from 'next-auth';
import { hasPermission } from '@/lib/auth/permissions';
import type { AuditHistoryTable } from '@/lib/audit-history-types';
import { AuditHistoryButton } from './viewer';
import { requireAuditAuthority } from '@/lib/audit-history-query';
import { db } from '@/lib/db';
import { t } from '@/strings';
/** Call only with the record ID and validated session already obtained by its parent screen. */
export function AuditRecordEntry({
  session,
  table,
  id,
}: {
  session: Session;
  table: AuditHistoryTable;
  id: number;
}) {
  return hasPermission(session.user.role, 'auditHistory', 'view') ? (
    <AuditHistoryButton subject={{ table, id: String(id) }} />
  ) : null;
}

/** The logo row has its own key, distinct from both client and file-version IDs. */
export async function AuditLogoEntry({
  session,
  clientId,
}: {
  session: Session;
  clientId: number;
}) {
  if (!hasPermission(session.user.role, 'auditHistory', 'view')) return null;
  await requireAuditAuthority(session, false);
  const logo = await db.clientLogo.findUnique({ where: { clientId }, select: { id: true } });
  return logo ? (
    <section aria-label={t.auditHistory.entities.client_logos}>
      <span>{t.auditHistory.entities.client_logos}</span>{' '}
      <AuditRecordEntry session={session} table="client_logos" id={logo.id} />
    </section>
  ) : null;
}
