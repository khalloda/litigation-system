import type { Session } from 'next-auth';
import { todaySnapshot, openSnapshot, workloadSnapshot } from './dashboard-data';
import { hasPermission } from '@/lib/auth/permissions';
import { t } from '@/strings';
import styles from '../home.module.css';

export async function DashboardSummary({ session, instant }: { session: Session; instant: Date }) {
  const [today, open, workload] = await Promise.allSettled([
    hasPermission(session.user.role, 'hearings', 'view')
      ? todaySnapshot(session)
      : Promise.reject(),
    openSnapshot(session, instant),
    workloadSnapshot(session),
  ]);
  const cards = [
    { label: t.dashboard.today, value: today.status === 'fulfilled' ? today.value.total : null },
    {
      label: t.dashboardMetrics.open,
      value: open.status === 'fulfilled' ? open.value.total : null,
    },
    {
      label: t.ui.activeMatters,
      value: workload.status === 'fulfilled' ? workload.value.total : null,
    },
    {
      label: t.ui.unassignedMatters,
      value: workload.status === 'fulfilled' ? workload.value.unassigned : null,
    },
  ];
  return (
    <dl className={styles.summaryCards}>
      {cards.map((card) => (
        <div key={card.label}>
          <dt>{card.label}</dt>
          <dd>{card.value ?? t.dashboard.error}</dd>
        </div>
      ))}
    </dl>
  );
}
