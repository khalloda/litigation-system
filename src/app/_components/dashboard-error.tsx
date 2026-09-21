import { redirect } from 'next/navigation';
import { AuthorizationError } from '@/lib/auth/authorization-core';
import { t } from '@/strings';
import styles from '../home.module.css';

export function DashboardError({
  error,
  title,
  id,
}: {
  error: unknown;
  title: string;
  id: string;
}) {
  if (error instanceof AuthorizationError) {
    if (error.reason === 'unauthenticated') redirect('/login');
    if (error.reason === 'password-change-required') redirect('/change-password');
    redirect('/forbidden');
  }
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p role="alert">{t.dashboardMetrics.error}</p>
      <form action="/" method="get">
        <button className={styles.button} type="submit">
          {t.dashboard.refresh}
        </button>
      </form>
    </section>
  );
}
