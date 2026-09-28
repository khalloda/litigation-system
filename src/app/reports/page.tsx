import Link from 'next/link';
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
  return (
    <main className={styles.page}>
      <Link href="/">{t.reports.home}</Link>
      <h1>{t.reports.title}</h1>
      {client ? (
        <p>
          <Link href={`/clients/${client}`}>
            {t.clients.details} ({client})
          </Link>{' '}
          · <Link href={`/reports/selection?client=${client}`}>{t.reportSelection.edit}</Link>
        </p>
      ) : null}
      {catalog.length ? (
        <ul className={styles.catalog}>
          {catalog.map((d) => (
            <li key={d.id}>
              <Link
                href={`/reports/${d.id}${client && d.parameters.client ? `?client=${client}` : ''}`}
              >
                {d.title}
              </Link>
              <p>{d.description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t.reports.emptyCatalog}</p>
      )}
    </main>
  );
}
