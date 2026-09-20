import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { requireAuditAuthority } from '@/lib/audit-history-query';
import { GlobalAuditViewer } from './viewer';
import { t } from '@/strings';
import styles from './audit-history.module.css';
export default async function AuditHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission({ area: 'auditHistory', action: 'view' });
  await requireAuditAuthority(session, false);
  const values = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value])
      params.append(key, item);
  return (
    <main className={styles.page}>
      <Link href="/">{t.auditHistory.home}</Link>
      <h1>{t.auditHistory.global}</h1>
      <GlobalAuditViewer initialQuery={params.toString()} />
    </main>
  );
}
