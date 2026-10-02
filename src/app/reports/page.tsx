import Link from 'next/link';
import { getClient } from '@/lib/clients';
import { hasPermission } from '@/lib/auth/permissions';
import { requirePagePermission } from '@/lib/auth/authorization';
import { reporting } from '@/lib/reports/production';
import { t } from '@/strings';
import styles from './reports.module.css';
import { reportClientContext } from '@/lib/reports/client-context';
import { categorizeReports } from '@/lib/reports/catalog';
import { ReportCatalog } from './catalog';
export const dynamic = 'force-dynamic';
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string | string[] }>;
}) {
  const session = await requirePagePermission({ area: 'reports', action: 'run' });
  const catalog = await reporting.catalog(session);
  const client = reportClientContext((await searchParams).client);
  const context =
    client && hasPermission(session.user.role, 'clients', 'view')
      ? await getClient(session, String(client))
      : null;
  const categories = categorizeReports(catalog, client);
  return (
    <main className={styles.page} data-reviewed>
      <Link className={styles.secondaryAction} href={client ? `/clients/${client}` : '/'}>
        {client ? t.clients.backClient : t.reports.home}
      </Link>
      <h1>{client ? t.ui.clientReports : t.reports.title}</h1>
      {client ? (
        <p>
          <Link href={`/clients/${client}`}>
            {context?.nameAr ?? t.clients.details} ({client})
          </Link>{' '}
        </p>
      ) : null}
      <aside className={styles.guidance}>
        <h2>{t.reportCatalog.guidance}</h2>
        <p>{t.reportCatalog.help}</p>
        <p>{t.ui.noRunOnOpen}</p>
      </aside>
      <ReportCatalog categories={categories} clientContext={Boolean(client)} />
    </main>
  );
}
