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
      <DashboardError
        view={compact ? undefined : 'analytics'}
        error={error}
        title={t.dashboardMetrics.topClients}
        id="top-clients-title"
      />
    );
  }
  return (
    <section className={styles.panel} aria-labelledby="top-clients-title">
      <h2 id="top-clients-title">{t.dashboardMetrics.topClients}</h2>
      <details className={styles.definition}>
        <summary>{t.ui.definitions}</summary>
        <p>{t.dashboardMetrics.topScope}</p>
      </details>
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
          <div
            className={styles.tableScroll}
            role="region"
            aria-label={t.dashboardMetrics.topClients}
            tabIndex={0}
          >
            <table className={styles.metricTable}>
              <thead>
                <tr>
                  <th scope="col">{t.fields.client}</th>
                  <th scope="col">{t.dashboardMetrics.distinctTotal}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.map((r) => (
                  <tr key={r.id} data-top-client-id={r.id}>
                    <th scope="row">
                      <Link href={`/clients/${r.id}`}>
                        <bdi>{r.name.trim() ? r.name : t.common.notRecorded}</bdi>
                      </Link>
                      <span className={styles.metricNote}>
                        {t.dashboardMetrics.rankCount(r.rank, r.total)}
                      </span>
                      {r.archived ? (
                        <span className={styles.notice}>{t.clients.archivedNotice}</span>
                      ) : null}
                    </th>
                    <td>{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : (
        <p className={styles.empty}>{t.dashboardMetrics.topEmpty}</p>
      )}
    </section>
  );
}
