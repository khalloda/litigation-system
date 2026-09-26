import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { reporting } from '@/lib/reports/production';
import { t } from '@/strings';
import styles from './reports.module.css';
export const dynamic = 'force-dynamic';
export default async function ReportsPage() {
  const session = await requirePagePermission({ area: 'reports', action: 'run' });
  const catalog = await reporting.catalog(session);
  return (
    <main className={styles.page}>
      <Link href="/">{t.reports.home}</Link>
      <h1>{t.reports.title}</h1>
      {catalog.length ? (
        <ul>
          {catalog.map((d) => (
            <li key={d.id}>
              <Link href={`/reports/${d.id}`}>{d.title}</Link>
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
