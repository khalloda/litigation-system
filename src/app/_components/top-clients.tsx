import Link from 'next/link';
import type { Session } from 'next-auth';
import { getTopClients } from '@/lib/dashboard';
import { t } from '@/strings';
import { DashboardError } from './dashboard-error';
import styles from '../home.module.css';
export async function TopClients({ session }: { session: Session }) {
  let snapshot;
  try {
    snapshot = await getTopClients(session);
  } catch (error) {
    return (
      <DashboardError error={error} title={t.dashboardMetrics.topClients} id="top-clients-title" />
    );
  }
  return (
    <section className={styles.panel} aria-labelledby="top-clients-title">
      <h2 id="top-clients-title">{t.dashboardMetrics.topClients}</h2>
      <p>{t.dashboardMetrics.topScope}</p>
      <p>
        {t.dashboardMetrics.clientPopulation(snapshot.total, snapshot.unassigned, snapshot.clients)}
      </p>
      {snapshot.rows.length ? (
        <ol className={styles.records}>
          {snapshot.rows.map((r) => (
            <li key={r.id} className={styles.record} data-top-client-id={r.id}>
              <h3>
                <Link className={styles.link} href={`/clients/${r.id}`}>
                  <bdi>{r.name.trim() ? r.name : t.common.notRecorded}</bdi>
                </Link>
              </h3>
              <p>{t.dashboardMetrics.rankCount(r.rank, r.total)}</p>
              {r.archived ? <p className={styles.notice}>{t.clients.archivedNotice}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>{t.dashboardMetrics.topEmpty}</p>
      )}
    </section>
  );
}
