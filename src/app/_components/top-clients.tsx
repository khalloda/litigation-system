import Link from 'next/link';
import type { Session } from 'next-auth';
import { getTopClients } from '@/lib/dashboard';
import { t } from '@/strings';
import { DashboardError } from './dashboard-error';
import styles from '../home.module.css';
export async function TopClients({
  session,
  compact = false,
}: {
  session: Session;
  compact?: boolean;
}) {
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
      {compact ? (
        <div className={styles.compactPreview}>
          <table className={styles.metricTable}>
            <thead>
              <tr>
                <th scope="col">{t.fields.client}</th>
                <th scope="col">{t.dashboardMetrics.distinctTotal}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.slice(0, 2).map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <Link href={`/clients/${r.id}`}>
                      <bdi>{r.name.trim() ? r.name : t.common.notRecorded}</bdi>
                    </Link>
                  </th>
                  <td>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {snapshot.rows.length ? (
        <details open={!compact}>
          <summary>{t.ui.fullDetails}</summary>
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
        </details>
      ) : (
        <p className={styles.empty}>{t.dashboardMetrics.topEmpty}</p>
      )}
    </section>
  );
}
