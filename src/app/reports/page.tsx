import Link from 'next/link';
import { getClient } from '@/lib/clients';
import { hasPermission } from '@/lib/auth/permissions';
import { requirePagePermission } from '@/lib/auth/authorization';
import { reporting } from '@/lib/reports/production';
import { t } from '@/strings';
import styles from './reports.module.css';
import { reportClientContext } from '@/lib/reports/client-context';
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
  const order = [
    'client-status',
    'client-matters',
    'client-branches',
    'client-branch-matters',
    'client-branch-finance',
    'client-evaluation',
    'client-branch-evaluation-finance',
    'client-judgments',
    'client-active-contacts',
  ];
  const ordered = [...catalog].sort(
    (a, b) =>
      (order.indexOf(a.id) < 0 ? 99 : order.indexOf(a.id)) -
      (order.indexOf(b.id) < 0 ? 99 : order.indexOf(b.id)),
  );
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
          · <Link href={`/reports/selection?client=${client}`}>{t.reportSelection.edit}</Link>
        </p>
      ) : null}
      <aside className={styles.guidance}>
        <h2>{t.ui.currentScope}</h2>
        <p>{t.ui.reportScopeHelp}</p>
        <p>{t.ui.noRunOnOpen}</p>
      </aside>
      {catalog.length ? (
        <ul className={styles.catalog}>
          {ordered.map((d) => (
            <li key={d.id}>
              <h2>{d.title}</h2>
              <p>{d.description}</p>
              <p className={styles.hint}>{t.ui.reportFormats}</p>
              <Link
                className={styles.secondaryAction}
                href={`/reports/${d.id}${client && d.parameters.client ? `?client=${client}` : ''}`}
              >
                {t.ui.prepareReport}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t.reports.emptyCatalog}</p>
      )}
    </main>
  );
}
